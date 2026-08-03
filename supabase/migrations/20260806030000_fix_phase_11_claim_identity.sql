-- Phase 11 follow-up: give every delivery claim an identity, so a result can
-- only ever be applied by the claim that is actually in flight.
--
-- Gap closed (H1 in the final Phase 11 review).
-- 20260806020000_fix_phase_11_delivery_lease.sql bounded a claim with a
-- 10-minute lease and made an expired lease reclaimable — but
-- mark_email_delivery_result still identified its target by
-- (id, status = 'sending') alone. That predicate can tell *that* a claim is
-- in flight; it cannot tell *which*. The lease design's own premise is that
-- a stalled worker outlives its lease (that is why the reclaim branch
-- exists), so trusting any 'sending' row to accept any caller's result
-- contradicts it. Reproducible sequence, all against one delivery row:
--
--   1. Worker A claims it        -> attempt_count=1, status='sending', lease L1
--   2. Worker A stalls past L1
--   3. Worker B reclaims it      -> attempt_count=2, status='sending', lease L2
--   4. Worker B reports failure  -> status='pending', next_attempt_at=+5m
--   5. Backoff elapses; Worker C claims it
--                                -> attempt_count=3, status='sending', lease L3
--   6. Worker A finally reports its stale attempt-1 result
--      -> `where id=... and status='sending'` MATCHES C's live claim
--
-- At step 6 a stale 'sent' marked the row terminal while C's send might yet
-- fail (silent, permanent notification loss, recorded as success); a stale
-- 'failed' cleared C's lease, reverted the row to 'pending', wrote A's error
-- code and scheduled a retry on C's attempt-3 backoff — while C was still
-- sending. Steps 1-5 alone were already safe: at step 5 the row is 'pending'
-- or terminal, so the old predicate rejected A. Only the re-claim at step 5
-- reopened the window.
--
-- Fix: claimed_at becomes the claim identity, compared as a compare-and-set.
-- Two claims of one row are necessarily >= one lease apart (a reclaim
-- requires lease expiry), so claimed_at uniquely identifies a claim without
-- adding a column, an index, or a constraint. A result whose p_claimed_at is
-- not the row's current claimed_at matches zero rows and changes nothing.
--
-- Does not modify 20260806000000_phase_11_notifications_audit.sql,
-- 20260806010000_fix_phase_11_event_atomicity.sql, or
-- 20260806020000_fix_phase_11_delivery_lease.sql — all three are already
-- applied to TEST and are therefore forward-only from here.
--
-- Function identity note: both RPCs are DROPped and recreated rather than
-- CREATE OR REPLACEd. claim_pending_email_deliveries changes its RETURNS
-- TABLE shape (adding claimed_at), which CREATE OR REPLACE cannot do
-- ("cannot change return type of existing function").
-- mark_email_delivery_result gains a parameter, which in PostgreSQL creates
-- a *second* overload rather than replacing the first — leaving the old
-- 4-argument identity callable, and still vulnerable, alongside the new one.
-- Both old identities are dropped explicitly so exactly one identity of each
-- RPC exists afterwards.

do $preflight$
begin
  if to_regclass('public.notification_deliveries') is null
    or to_regprocedure('public.claim_pending_email_deliveries(integer)') is null
    or to_regprocedure('public.mark_email_delivery_result(uuid, text, text, text)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 claim-identity preflight aborted: the base Phase 11 migration has not been applied.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_deliveries'
      and column_name = 'claimed_at'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 claim-identity preflight aborted: 20260806020000_fix_phase_11_delivery_lease.sql has not been applied (no claimed_at column to use as the claim identity).';
  end if;

  if to_regprocedure('public.mark_email_delivery_result(uuid, text, timestamptz, text, text)') is not null then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 claim-identity preflight aborted: the claim-identity signature already exists. This migration must not run twice.';
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- SECTION 1: claim — unchanged behavior, plus claimed_at in the result
-- ---------------------------------------------------------------------------

-- Dropped (not replaced) purely because the RETURNS TABLE shape changes.
-- Everything else below is byte-for-byte the behavior established by
-- 20260806020000: the same self-healing retirement step, the same 10-minute
-- lease, the same single shared p_limit budget across both branches, the
-- same `for update skip locked`, the same attempt_count < 5 cap, and
-- attempt_count still incremented here and only here.
drop function public.claim_pending_email_deliveries(integer);

create function public.claim_pending_email_deliveries(
  p_limit integer default 20
)
returns table (
  delivery_id uuid,
  claimed_at timestamptz,
  recipient_email text,
  event_type text,
  title text,
  message text,
  entity_type text,
  entity_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Self-healing: an expired lease whose attempt budget is already
  -- exhausted must never be claimed again — retire it to a terminal state
  -- instead, on this same cadence (whatever already calls this function),
  -- so a crashed/timed-out runner can never leave a delivery stuck in
  -- 'sending' forever. Ordinary UPDATE, not FOR UPDATE SKIP LOCKED: there is
  -- no limited batch of "work" being fairly distributed here, only rows
  -- that are unconditionally retired the moment any caller reaches them: a
  -- second concurrent caller's UPDATE simply matches zero rows once the
  -- first has committed the status change away from 'sending'.
  update public.notification_deliveries
  set
    status = 'failed',
    last_error_code = 'claim_lease_exhausted',
    claimed_at = null,
    lease_expires_at = null
  where status = 'sending'
    and lease_expires_at <= now()
    and attempt_count >= 5;

  return query
    update public.notification_deliveries as delivery
    set
      status = 'sending',
      claimed_at = now(),
      lease_expires_at = now() + interval '10 minutes',
      attempt_count = delivery.attempt_count + 1
    from public.notifications as notification
    where delivery.notification_id = notification.id
      and delivery.id in (
        select claimable.id
        from public.notification_deliveries as claimable
        where claimable.attempt_count < 5
          and (
            (claimable.status = 'pending' and claimable.next_attempt_at <= now())
            or (claimable.status = 'sending' and claimable.lease_expires_at <= now())
          )
        order by
          case
            when claimable.status = 'pending' then claimable.next_attempt_at
            else claimable.lease_expires_at
          end
        limit greatest(1, least(coalesce(p_limit, 20), 50))
        for update skip locked
      )
    returning
      -- delivery.claimed_at is the post-UPDATE value (now()) — this row's
      -- claim identity. The caller must hand exactly this value back to
      -- mark_email_delivery_result to resolve the claim.
      delivery.id, delivery.claimed_at, delivery.recipient_email,
      notification.event_type, notification.title, notification.message,
      notification.entity_type, notification.entity_id;
end;
$function$;

revoke all on function public.claim_pending_email_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_pending_email_deliveries(integer) to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 2: mark — compare-and-set on the claim identity
-- ---------------------------------------------------------------------------

-- The old identity is dropped BEFORE the new one is created. Adding a
-- parameter would otherwise leave both callable, and the old one would still
-- accept a stale result — the exact defect being fixed. After this migration
-- `select count(*) from pg_proc ... where proname = 'mark_email_delivery_result'`
-- must be exactly 1.
drop function public.mark_email_delivery_result(uuid, text, text, text);

-- p_claimed_at is positioned third because PostgreSQL requires every
-- parameter after a defaulted one to also have a default; it is mandatory,
-- so it must precede p_error_code/p_provider_reference. Callers use named
-- arguments (PostgREST/supabase-js always do), so position is not a
-- compatibility concern.
create function public.mark_email_delivery_result(
  p_delivery_id uuid,
  p_status text,
  p_claimed_at timestamptz,
  p_error_code text default null,
  p_provider_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_status not in ('sent', 'failed') then
    raise exception using
      errcode = 'P0001',
      message = 'p_status must be sent or failed.';
  end if;

  -- A null claim identity is a caller bug, not a stale result: fail loudly
  -- rather than silently no-op, so a runner that forgets to thread
  -- claimed_at through is caught immediately instead of appearing to work
  -- while resolving nothing.
  if p_claimed_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'p_claimed_at is required and must be the claimed_at value returned by claim_pending_email_deliveries.';
  end if;

  if p_status = 'sent' then
    update public.notification_deliveries
    set
      status = 'sent',
      sent_at = now(),
      provider_reference = p_provider_reference,
      claimed_at = null,
      lease_expires_at = null
    where id = p_delivery_id
      and status = 'sending'
      and claimed_at = p_claimed_at;
    return;
  end if;

  -- Single statement rather than the previous SELECT-then-UPDATE pair. The
  -- old shape read attempt_count under one predicate and then wrote under a
  -- weaker one (`where id = p_delivery_id` only), leaving a window in which
  -- the row could change between the two. Bare column references in an
  -- UPDATE's SET list resolve to the pre-UPDATE row, so `attempt_count`
  -- below is exactly the value the old SELECT read — the five-step backoff
  -- schedule and the attempt-5 terminal branch are preserved unchanged —
  -- while the guard now applies atomically to the write itself.
  --
  -- attempt_count is deliberately NOT incremented here: it is incremented
  -- once per claim, in claim_pending_email_deliveries, and nowhere else.
  update public.notification_deliveries
  set
    last_error_code = p_error_code,
    status = case when attempt_count >= 5 then 'failed' else 'pending' end,
    claimed_at = null,
    lease_expires_at = null,
    next_attempt_at = case
      when attempt_count >= 5 then next_attempt_at
      when attempt_count = 1 then now() + interval '1 minute'
      when attempt_count = 2 then now() + interval '5 minutes'
      when attempt_count = 3 then now() + interval '30 minutes'
      when attempt_count = 4 then now() + interval '2 hours'
      else now() + interval '6 hours'
    end
  where id = p_delivery_id
    and status = 'sending'
    and claimed_at = p_claimed_at;
end;
$function$;

revoke all on function public.mark_email_delivery_result(uuid, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_email_delivery_result(uuid, text, timestamptz, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 3: post-conditions — assert exactly one identity per RPC
-- ---------------------------------------------------------------------------

do $postcheck$
declare
  claim_identities integer;
  mark_identities integer;
begin
  select count(*) into claim_identities
  from pg_proc as p
  inner join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_pending_email_deliveries';

  select count(*) into mark_identities
  from pg_proc as p
  inner join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'mark_email_delivery_result';

  if claim_identities <> 1 then
    raise exception using
      errcode = '55000',
      message = format(
        'Phase 11 claim-identity postcheck failed: expected exactly 1 claim_pending_email_deliveries identity, found %s.',
        claim_identities
      );
  end if;

  if mark_identities <> 1 then
    raise exception using
      errcode = '55000',
      message = format(
        'Phase 11 claim-identity postcheck failed: expected exactly 1 mark_email_delivery_result identity, found %s (the legacy 4-argument overload must not survive).',
        mark_identities
      );
  end if;

  if to_regprocedure('public.mark_email_delivery_result(uuid, text, text, text)') is not null then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 claim-identity postcheck failed: the legacy mark_email_delivery_result(uuid, text, text, text) signature is still present.';
  end if;
end;
$postcheck$;

-- PostgREST caches the schema; without this the dropped 4-argument overload
-- can still appear resolvable through the API until the next reload.
notify pgrst, 'reload schema';
