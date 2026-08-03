-- Phase 11 follow-up: bounded delivery-lease mechanism, closing a confirmed
-- production gap. claim_pending_email_deliveries() only ever selected
-- status='pending' to hand rows to a runner; nothing ever revisited a row
-- once it moved to 'sending'. A runner that crashes, times out, or exits
-- between being handed a row and calling mark_email_delivery_result() left
-- that row in 'sending' permanently — confirmed live on TEST as 21 orphaned
-- rows, 100% belonging to persistent E2E fixture organizations, recovered
-- manually as a one-time action (see the delivery-outbox flake
-- investigation). This migration does not change that investigation's test
-- fix; it fixes the underlying production behavior the investigation
-- surfaced. Does not modify 20260806000000_phase_11_notifications_audit.sql
-- or 20260806010000_fix_phase_11_event_atomicity.sql — both already applied
-- to TEST.

do $preflight$
begin
  if to_regclass('public.notification_deliveries') is null
    or to_regprocedure('public.claim_pending_email_deliveries(integer)') is null
    or to_regprocedure('public.mark_email_delivery_result(uuid, text, text, text)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 delivery-lease preflight aborted: the base Phase 11 migration has not been applied.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_deliveries'
      and column_name in ('claimed_at', 'lease_expires_at')
  ) then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 delivery-lease preflight aborted: lease columns already exist. This migration must not run twice.';
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- SECTION 1: schema
-- ---------------------------------------------------------------------------

alter table public.notification_deliveries
  add column claimed_at timestamptz,
  add column lease_expires_at timestamptz;

-- The three status-keyed constraints are mutually exclusive and exhaustive
-- over notification_deliveries_status_check's four values ('pending',
-- 'sending', 'sent', 'failed'), so together they fully define lease-field
-- presence for every possible row.
alter table public.notification_deliveries
  add constraint notification_deliveries_pending_has_no_lease
  check (status <> 'pending' or (claimed_at is null and lease_expires_at is null));

alter table public.notification_deliveries
  add constraint notification_deliveries_sending_requires_lease
  check (status <> 'sending' or (claimed_at is not null and lease_expires_at is not null));

alter table public.notification_deliveries
  add constraint notification_deliveries_terminal_has_no_lease
  check (status not in ('sent', 'failed') or (claimed_at is null and lease_expires_at is null));

alter table public.notification_deliveries
  add constraint notification_deliveries_lease_expires_after_claimed
  check (lease_expires_at is null or claimed_at is null or lease_expires_at > claimed_at);

-- Supports claim_pending_email_deliveries()'s reclaim branch
-- (status='sending' and lease_expires_at <= now()) — the existing
-- notification_deliveries_pending_idx partial index already covers the
-- pending branch.
create index notification_deliveries_expired_lease_idx
  on public.notification_deliveries (lease_expires_at)
  where status = 'sending';

-- ---------------------------------------------------------------------------
-- SECTION 2: functions
-- ---------------------------------------------------------------------------

-- Bounded lease: 10 minutes. Long enough for a real send attempt (a single
-- Resend API call) to complete under normal conditions, short enough that a
-- genuinely crashed/timed-out runner's claimed rows become reclaimable
-- again well within one hourly cron cycle rather than sitting idle for a
-- full cycle or more.
create or replace function public.claim_pending_email_deliveries(
  p_limit integer default 20
)
returns table (
  delivery_id uuid,
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
      delivery.id, delivery.recipient_email, notification.event_type, notification.title,
      notification.message, notification.entity_type, notification.entity_id;
end;
$function$;

revoke all on function public.claim_pending_email_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_pending_email_deliveries(integer) to service_role;

create or replace function public.mark_email_delivery_result(
  p_delivery_id uuid,
  p_status text,
  p_error_code text default null,
  p_provider_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_attempt_count integer;
begin
  if p_status not in ('sent', 'failed') then
    raise exception using
      errcode = 'P0001',
      message = 'p_status must be sent or failed.';
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
      and status = 'sending';
    return;
  end if;

  -- attempt_count was already incremented by whichever
  -- claim_pending_email_deliveries() call put this row into 'sending' —
  -- never incremented a second time here, so a crashed attempt (counted at
  -- claim time) and a reported-failure attempt (counted here, previously)
  -- can no longer both increment the same attempt.
  select attempt_count
  into current_attempt_count
  from public.notification_deliveries
  where id = p_delivery_id
    and status = 'sending';

  if not found then
    return;
  end if;

  update public.notification_deliveries
  set
    last_error_code = p_error_code,
    status = case when current_attempt_count >= 5 then 'failed' else 'pending' end,
    claimed_at = null,
    lease_expires_at = null,
    next_attempt_at = case
      when current_attempt_count >= 5 then next_attempt_at
      when current_attempt_count = 1 then now() + interval '1 minute'
      when current_attempt_count = 2 then now() + interval '5 minutes'
      when current_attempt_count = 3 then now() + interval '30 minutes'
      when current_attempt_count = 4 then now() + interval '2 hours'
      else now() + interval '6 hours'
    end
  where id = p_delivery_id;
end;
$function$;

revoke all on function public.mark_email_delivery_result(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_email_delivery_result(uuid, text, text, text)
  to service_role;
