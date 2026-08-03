-- Phase 11 follow-up: close an event-atomicity gap found in post-handoff
-- review. private.emit_event's recipient-resolution/notification-fan-out
-- step was wrapped in `exception when others then null;` — a failure there
-- (a bug, a transient error, an unexpected constraint violation) was
-- silently discarded. The business mutation and its audit_logs row still
-- committed (correct — the Phase 11 handoff explicitly requires that a
-- notification bug must never block or roll back a business mutation), but
-- there was no record anywhere that fan-out had failed for that event, and
-- the affected notifications were permanently, invisibly lost.
--
-- This migration does not change that core safety property. It closes the
-- "silently swallowed" gap by persisting a durable, service-role-only,
-- retryable failure record — capturing everything needed to re-run the
-- fan-out for that event later — instead of discarding the error. One
-- thin service-role-only read RPC (list_notification_dispatch_failures) is
-- added so the record is actually observable (by an ops script, a future
-- retry consumer, or an integration test) rather than reachable only via
-- direct database access — mirroring claim_pending_email_deliveries'
-- existing security model exactly, not a new pattern. No admin UI surface
-- is added; that remains a deliberate scope boundary for this fix. Does
-- not modify 20260806000000_phase_11_notifications_audit.sql or any other
-- already-applied migration.

do $preflight$
begin
  if to_regclass('public.audit_logs') is null
    or to_regprocedure('private.emit_event(uuid, uuid, text, text, text, uuid, jsonb, text)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 atomicity-fix preflight aborted: the base Phase 11 migration has not been applied.';
  end if;

  if to_regclass('private.notification_dispatch_failures') is not null then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 atomicity-fix preflight aborted: private.notification_dispatch_failures already exists. This migration must not run twice.';
  end if;
end;
$preflight$;

create table private.notification_dispatch_failures (
  id uuid primary key default gen_random_uuid(),
  audit_log_id uuid not null,
  organization_id uuid not null,
  actor_user_id uuid,
  actor_type text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  -- Nullable, unlike notifications.dedupe_key: the very fact that caused
  -- the original fan-out failure could be a bad p_dedupe_key value itself
  -- (e.g. null) — this table must still capture the rest of the retry
  -- context in that case rather than fail a second time on the same
  -- not-null constraint the original insert hit.
  dedupe_key text,
  error_sqlstate text not null,
  error_message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  constraint notification_dispatch_failures_audit_log_id_fkey
    foreign key (audit_log_id)
    references public.audit_logs (id)
    on delete cascade,
  constraint notification_dispatch_failures_error_message_length
    check (char_length(error_message) <= 500),
  constraint notification_dispatch_failures_error_sqlstate_length
    check (char_length(error_sqlstate) <= 10)
);

create index notification_dispatch_failures_unresolved_idx
  on private.notification_dispatch_failures (created_at)
  where resolved_at is null;

-- Same treatment as private.reminder_runs: not in `public`, not
-- PostgREST-reachable, and revoked from service_role too — private.emit_event
-- writes to it as its own SECURITY DEFINER owner, not via a role grant.
revoke all on table private.notification_dispatch_failures
  from public, anon, authenticated, service_role;

create or replace function private.emit_event(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  recipient record;
  new_notification_id uuid;
  pref_in_app boolean;
  pref_email boolean;
  v_audit_log_id uuid;
begin
  insert into public.audit_logs (
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata
  )
  values (
    p_organization_id, p_actor_user_id, p_actor_type, p_action, p_entity_type, p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_audit_log_id;

  -- Recipient resolution and notification fan-out are best-effort in the
  -- sense that a failure here must never roll back the audit row above or
  -- the business mutation that triggered it (SS21 risk: "emit_event must
  -- never raise on recipient-resolution failure") — but a failure must now
  -- be durably recorded, not silently discarded.
  begin
    for recipient in
      select resolved.profile_id, resolved.email
      from private.resolve_notification_recipients(
        p_action, p_entity_type, p_entity_id, p_organization_id
      ) as resolved
      where resolved.profile_id is distinct from p_actor_user_id
    loop
      select coalesce(pref.in_app, true), coalesce(pref.email, true)
      into pref_in_app, pref_email
      from public.notification_preferences as pref
      where pref.profile_id = recipient.profile_id
        and pref.event_type = p_action;

      if not found then
        pref_in_app := true;
        pref_email := true;
      end if;

      new_notification_id := null;

      if pref_in_app then
        insert into public.notifications (
          organization_id, user_id, event_type, title, message, entity_type, entity_id, dedupe_key
        )
        values (
          p_organization_id, recipient.profile_id, p_action,
          private.notification_title(p_action), null,
          p_entity_type, p_entity_id, p_dedupe_key
        )
        on conflict (user_id, event_type, entity_id, dedupe_key) do nothing
        returning id into new_notification_id;
      end if;

      if pref_email and recipient.email is not null and new_notification_id is not null then
        insert into public.notification_deliveries (
          notification_id, channel, recipient_email, status, next_attempt_at
        )
        values (
          new_notification_id, 'email', recipient.email, 'pending', now()
        );
      end if;
    end loop;
  exception
    when others then
      -- Persist enough to retry the fan-out later (every emit_event input
      -- is captured verbatim) instead of discarding the error. This insert
      -- is deliberately simple and built only from values already proven
      -- valid earlier in this same call (organization_id already passed
      -- the audit_logs FK check; metadata was already coalesced/validated;
      -- error_message is length-capped before insert) so it is extremely
      -- unlikely to fail itself — but it is still wrapped in its own
      -- last-resort handler so even a pathological failure here can never
      -- propagate up and roll back the business mutation.
      begin
        insert into private.notification_dispatch_failures (
          audit_log_id, organization_id, actor_user_id, actor_type, action,
          entity_type, entity_id, metadata, dedupe_key, error_sqlstate, error_message
        )
        values (
          v_audit_log_id, p_organization_id, p_actor_user_id, p_actor_type, p_action,
          p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb), p_dedupe_key,
          sqlstate, left(sqlerrm, 500)
        );
      exception
        when others then
          null;
      end;
  end;
end;
$function$;

revoke all on function private.emit_event(uuid, uuid, text, text, text, uuid, jsonb, text)
  from public, anon, authenticated;

create or replace function public.list_notification_dispatch_failures(
  p_limit integer default 20
)
returns table (
  id uuid,
  audit_log_id uuid,
  organization_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  error_sqlstate text,
  error_message text,
  created_at timestamptz,
  resolved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    failure.id, failure.audit_log_id, failure.organization_id, failure.action,
    failure.entity_type, failure.entity_id, failure.dedupe_key, failure.error_sqlstate,
    failure.error_message, failure.created_at, failure.resolved_at
  from private.notification_dispatch_failures as failure
  order by failure.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$;

revoke all on function public.list_notification_dispatch_failures(integer)
  from public, anon, authenticated;
grant execute on function public.list_notification_dispatch_failures(integer)
  to service_role;
