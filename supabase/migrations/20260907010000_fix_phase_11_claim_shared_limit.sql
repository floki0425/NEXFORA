-- Fix: claim_pending_email_deliveries() could return more rows than p_limit.
--
-- Symptom: with p_limit => 1 and two claimable rows (one fresh 'pending', one
-- expired-lease 'sending'), the function returned BOTH — one row per branch
-- instead of one row total. With a single claimable row it behaved correctly,
-- which is why this went unnoticed: it only reproduces when more claimable
-- rows exist than the requested limit.
--
-- Root cause: the selection was expressed as
--
--     ... where delivery.notification_id = notification.id
--       and delivery.id in (
--         select claimable.id ... order by ... limit N for update skip locked
--       )
--
-- `LIMIT` prevents PostgreSQL from pulling that sub-select up into a
-- semi-join, and the `FOR UPDATE SKIP LOCKED` row lock makes it ineligible
-- for a *hashed* SubPlan. What is left is a plain SubPlan, which the executor
-- re-runs for each candidate row of the outer
-- notification_deliveries x notifications join. Every re-run opens a FRESH
-- `order by ... limit N` window, and because SKIP LOCKED skips the rows this
-- very statement has already locked, the next-oldest claimable row becomes
-- visible and matches. The effective ceiling was therefore N per outer row
-- scanned, not N per call.
--
-- Fix: hoist the selection into a CTE evaluated exactly once per statement
-- and join the UPDATE against it. `AS MATERIALIZED` is load-bearing, not
-- decorative: since PostgreSQL 12 a CTE referenced once is inlined by
-- default, and inlining would reproduce the identical re-evaluation this
-- migration exists to remove.
--
-- Deliberately unchanged: the self-healing retirement of expired,
-- attempt-exhausted leases; the 10-minute lease; claimed_at as the claim
-- identity; `for update skip locked`; the attempt_count < 5 cap; the single
-- increment of attempt_count; and the combined ordering across both branches.
-- The signature and RETURNS TABLE shape are identical, so this is a plain
-- CREATE OR REPLACE with no overload or return-type change.

do $preflight$
begin
  if to_regclass('public.notification_deliveries') is null
    or to_regprocedure('public.claim_pending_email_deliveries(integer)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 shared-limit preflight aborted: the base Phase 11 migration has not been applied.';
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
      message = 'Phase 11 shared-limit preflight aborted: 20260806020000_fix_phase_11_delivery_lease.sql has not been applied.';
  end if;

  if to_regprocedure('public.mark_email_delivery_result(uuid, text, timestamptz, text, text)') is null then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 shared-limit preflight aborted: 20260806030000_fix_phase_11_claim_identity.sql has not been applied.';
  end if;
end;
$preflight$;

create or replace function public.claim_pending_email_deliveries(
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
  -- Unchanged from 20260806020000/20260806030000. Self-healing: an expired
  -- lease whose attempt budget is already exhausted must never be claimed
  -- again — retire it to a terminal state instead, on this same cadence, so a
  -- crashed/timed-out runner can never leave a delivery stuck in 'sending'
  -- forever. Ordinary UPDATE, not FOR UPDATE SKIP LOCKED: there is no limited
  -- batch of "work" being fairly distributed here, only rows that are
  -- unconditionally retired the moment any caller reaches them; a second
  -- concurrent caller's UPDATE simply matches zero rows once the first has
  -- committed the status change away from 'sending'.
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
    with claimable as materialized (
      -- Evaluated exactly once per call: this is the whole point of the
      -- migration. The single `limit` below is the one shared budget across
      -- both the fresh-pending and expired-sending-reclaim branches.
      select candidate.id
      from public.notification_deliveries as candidate
      where candidate.attempt_count < 5
        and (
          (candidate.status = 'pending' and candidate.next_attempt_at <= now())
          or (candidate.status = 'sending' and candidate.lease_expires_at <= now())
        )
      order by
        case
          when candidate.status = 'pending' then candidate.next_attempt_at
          else candidate.lease_expires_at
        end
      limit greatest(1, least(coalesce(p_limit, 20), 50))
      for update skip locked
    )
    update public.notification_deliveries as delivery
    set
      status = 'sending',
      claimed_at = now(),
      lease_expires_at = now() + interval '10 minutes',
      attempt_count = delivery.attempt_count + 1
    from public.notifications as notification, claimable
    where delivery.id = claimable.id
      and delivery.notification_id = notification.id
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
