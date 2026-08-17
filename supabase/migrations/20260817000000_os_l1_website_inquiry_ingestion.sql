-- OS-L1: ingestion of verified Nexfora website "Start a Project" inquiries
-- into the existing Phase 3 leads module.
--
-- The public website (NEXFORA-WEBSITE/nexfora-website) runs on a SEPARATE
-- Supabase project and owns public.project_inquiries there. That table is
-- deliberately insert-only for its service role, so NEXFORA OS cannot read
-- it and no cross-project database link exists. Integration is therefore
-- server-to-server: the website POSTs an HMAC-signed payload to
-- /api/webhooks/website-inquiry in this application, which calls the one
-- function below with the OS service role.
--
-- Design notes a reviewer should not have to reconstruct:
--
-- 1. This migration creates NO second lead concept. The website inquiry
--    becomes an ordinary public.leads row (source 'website'), so every
--    Phase 3-12 behaviour already built on leads -- RLS, pipeline status,
--    activity timeline, assignment, conversion, notifications, reporting,
--    global search -- applies to it with no further change. Only the
--    website-specific facts that have no column on public.leads are stored
--    separately, in public.website_inquiry_imports.
--
-- 2. website_inquiry_imports is a sync ledger, not a copy of the inquiry. It
--    holds the external identity, the canonical (unrewritten) website enum
--    values, and the two timestamps. It deliberately stores NO applicant PII
--    -- name, email, phone, business and project description live once, on
--    the lead row. Consent version and consented_at are NOT copied either:
--    the website's project_inquiries row remains the consent record.
--
-- 3. Idempotency is keyed on the website's idempotency_key, not on the
--    website's project_inquiries.id. The website's service role has INSERT
--    but no SELECT on its own table (see the website's
--    20260816000100_create_project_inquiries.sql), so it cannot read the id
--    of the row it just wrote -- the idempotency_key it generated is the
--    only stable external identity it actually holds. It is UNIQUE on both
--    sides, so one website inquiry can only ever produce one OS lead.
--
-- 4. Canonical -> OS normalization happens HERE, in SQL, not in the calling
--    route. The route forwards the website's canonical enum values
--    unchanged; this function is the single authority that turns
--    'website_development' into a service_interest label and '25000_50000'
--    into budget_min/budget_max numerics. Doing it in TypeScript would mean
--    the database trusts derived values from its caller and the mapping
--    would have two homes.
--
-- 5. The function is granted to service_role ONLY -- never to anon or
--    authenticated. Unlike public.submit_project_inquiry (the OS's own
--    on-site inquiry form, which anon must be able to call), this entry
--    point is reachable only from a server holding the OS secret key, and
--    the HTTP route in front of it additionally requires a valid HMAC
--    signature. A browser cannot reach it at either layer.
--
-- 6. The ledger table grants nothing to service_role. The SECURITY DEFINER
--    function owns every write, and internal members read it through RLS
--    with the ordinary authenticated session. A future fixture script that
--    needs to seed this table directly should call the function rather than
--    widen the grant.

-- ---------------------------------------------------------------------------
-- SECTION 0: preflight. Abort loudly rather than guess if the foundation
-- this migration builds on does not look like what it expects.
-- ---------------------------------------------------------------------------

do $preflight$
begin
  if to_regclass('public.organizations') is null
    or to_regclass('public.leads') is null
    or to_regclass('public.lead_activities') is null
  then
    raise exception using
      errcode = '55000',
      message = 'OS-L1 website inquiry ingestion preflight aborted: public.organizations, public.leads or public.lead_activities is missing.';
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- SECTION 1: the sync ledger.
-- ---------------------------------------------------------------------------

create table public.website_inquiry_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,

  -- External identity. See design note 3.
  idempotency_key uuid not null,

  -- Canonical website values, stored exactly as the website recorded them.
  -- Presentation labels are derived in the UI; these are never rewritten.
  preferred_contact_method text not null,
  service_needed text not null,
  estimated_budget text,
  target_timeline text,

  -- submitted_at is the website's own submission timestamp. received_at is
  -- when this OS accepted it. They differ whenever ingestion is retried
  -- after an outage, which is exactly when the distinction matters.
  submitted_at timestamptz not null,
  received_at timestamptz not null default now(),

  constraint website_inquiry_imports_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint website_inquiry_imports_lead_id_fkey
    foreign key (lead_id)
    references public.leads (id)
    on delete cascade,
  constraint website_inquiry_imports_idempotency_key_unique
    unique (idempotency_key),
  constraint website_inquiry_imports_lead_id_unique
    unique (lead_id),
  constraint website_inquiry_imports_preferred_contact_method_check
    check (preferred_contact_method in ('email', 'phone')),
  constraint website_inquiry_imports_service_needed_check
    check (
      service_needed in (
        'website_development',
        'ecommerce_development',
        'booking_systems',
        'ordering_systems',
        'web_applications',
        'mobile_applications',
        'custom_business_systems',
        'not_sure_yet'
      )
    ),
  constraint website_inquiry_imports_estimated_budget_check
    check (
      estimated_budget is null
      or estimated_budget in (
        'below_25000',
        '25000_50000',
        '50000_100000',
        '100000_250000',
        '250000_plus',
        'not_sure_yet'
      )
    ),
  constraint website_inquiry_imports_target_timeline_check
    check (
      target_timeline is null
      or target_timeline in (
        'as_soon_as_possible',
        'within_1_month',
        '1_3_months',
        '3_6_months',
        'flexible_not_sure_yet'
      )
    )
);

create index website_inquiry_imports_organization_received_idx
  on public.website_inquiry_imports (organization_id, received_at desc);

-- ---------------------------------------------------------------------------
-- SECTION 2: authorization. Internal members of the owning organization may
-- read the ledger; nobody may write it through a session.
-- ---------------------------------------------------------------------------

alter table public.website_inquiry_imports enable row level security;

create policy website_inquiry_imports_select_internal_members
on public.website_inquiry_imports
for select
to authenticated
using (
  (
    select private.is_internal_member(
      website_inquiry_imports.organization_id
    )
  )
);

revoke all privileges
  on table public.website_inquiry_imports
  from public, anon, authenticated;

grant select on table public.website_inquiry_imports to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 3: ingestion. One idempotent entry point, service_role only.
-- ---------------------------------------------------------------------------

create or replace function public.ingest_website_project_inquiry(
  p_idempotency_key uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_business_organization text,
  p_preferred_contact_method text,
  p_service_needed text,
  p_estimated_budget text,
  p_target_timeline text,
  p_project_description text,
  p_submitted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_existing_lead_id uuid;
  v_lead_id uuid;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  -- The website's optional fields arrive as '' rather than null, matching
  -- how public.submit_project_inquiry is already called from this codebase
  -- (generated RPC argument types model `text` as a non-nullable string).
  -- Normalize once, here, so every branch below sees a real null.
  v_estimated_budget text :=
    pg_catalog.nullif(pg_catalog.btrim(p_estimated_budget), '');
  v_target_timeline text :=
    pg_catalog.nullif(pg_catalog.btrim(p_target_timeline), '');
  v_service_interest text;
  v_target_timeline_label text;
  v_budget_min numeric(12, 2);
  v_budget_max numeric(12, 2);
  v_now timestamptz := pg_catalog.now();
begin
  if p_idempotency_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'A website inquiry idempotency key is required.';
  end if;

  if p_preferred_contact_method not in ('email', 'phone') then
    raise exception using
      errcode = 'P0001',
      message = 'Unknown website inquiry contact method.';
  end if;

  if p_preferred_contact_method = 'phone'
     and pg_catalog.nullif(pg_catalog.btrim(p_phone), '') is null then
    raise exception using
      errcode = 'P0001',
      message = 'A phone number is required when phone is the preferred contact method.';
  end if;

  -- A clock far outside this window means a misconfigured caller or a
  -- replayed capture, not a late retry. Bounded rather than trusted.
  if p_submitted_at is null
     or p_submitted_at > v_now + interval '5 minutes'
     or p_submitted_at < v_now - interval '30 days' then
    raise exception using
      errcode = 'P0001',
      message = 'Website inquiry submission timestamp is out of range.';
  end if;

  v_service_interest := case p_service_needed
    when 'website_development' then 'Website Development'
    when 'ecommerce_development' then 'E-commerce Development'
    when 'booking_systems' then 'Booking Systems'
    when 'ordering_systems' then 'Ordering Systems'
    when 'web_applications' then 'Web Applications'
    when 'mobile_applications' then 'Mobile Applications'
    when 'custom_business_systems' then 'Custom Business Systems'
    when 'not_sure_yet' then 'Not sure yet'
    else null
  end;

  if v_service_interest is null then
    raise exception using
      errcode = 'P0001',
      message = 'Unknown website inquiry service value.';
  end if;

  v_target_timeline_label := case v_target_timeline
    when 'as_soon_as_possible' then 'As soon as possible'
    when 'within_1_month' then 'Within 1 month'
    when '1_3_months' then '1-3 months'
    when '3_6_months' then '3-6 months'
    when 'flexible_not_sure_yet' then 'Flexible / Not sure yet'
    else null
  end;

  if v_target_timeline is not null and v_target_timeline_label is null then
    raise exception using
      errcode = 'P0001',
      message = 'Unknown website inquiry timeline value.';
  end if;

  -- 'not_sure_yet' and a missing budget both mean "no stated range", which
  -- public.leads represents as two nulls rather than a sentinel row.
  case v_estimated_budget
    when 'below_25000' then
      v_budget_min := 0;
      v_budget_max := 25000;
    when '25000_50000' then
      v_budget_min := 25000;
      v_budget_max := 50000;
    when '50000_100000' then
      v_budget_min := 50000;
      v_budget_max := 100000;
    when '100000_250000' then
      v_budget_min := 100000;
      v_budget_max := 250000;
    when '250000_plus' then
      v_budget_min := 250000;
      v_budget_max := null;
    when 'not_sure_yet' then
      v_budget_min := null;
      v_budget_max := null;
    else
      if v_estimated_budget is not null then
        raise exception using
          errcode = 'P0001',
          message = 'Unknown website inquiry budget value.';
      end if;
      v_budget_min := null;
      v_budget_max := null;
  end case;

  select organization.id
  into v_organization_id
  from public.organizations as organization
  where organization.slug = 'nexfora'
    and organization.status = 'active'
  limit 1;

  if v_organization_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Website inquiry ingestion is temporarily unavailable.';
  end if;

  -- Serialize concurrent deliveries of the SAME inquiry so a webhook retry
  -- racing the original cannot pass the existence check twice. Different
  -- inquiries take different locks and do not block each other.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select import.lead_id
  into v_existing_lead_id
  from public.website_inquiry_imports as import
  where import.idempotency_key = p_idempotency_key;

  if v_existing_lead_id is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'duplicate',
      'lead_id', v_existing_lead_id
    );
  end if;

  begin
    insert into public.leads (
      organization_id,
      full_name,
      business_name,
      email,
      phone,
      service_interest,
      problem_summary,
      budget_min,
      budget_max,
      target_timeline,
      source,
      source_detail,
      status
    )
    values (
      v_organization_id,
      pg_catalog.btrim(p_full_name),
      pg_catalog.nullif(pg_catalog.btrim(p_business_organization), ''),
      v_email,
      pg_catalog.nullif(pg_catalog.btrim(p_phone), ''),
      v_service_interest,
      pg_catalog.btrim(p_project_description),
      v_budget_min,
      v_budget_max,
      v_target_timeline_label,
      'website',
      'Start a Project form',
      'new'
    )
    returning id into v_lead_id;

    insert into public.website_inquiry_imports (
      organization_id,
      lead_id,
      idempotency_key,
      preferred_contact_method,
      service_needed,
      estimated_budget,
      target_timeline,
      submitted_at
    )
    values (
      v_organization_id,
      v_lead_id,
      p_idempotency_key,
      p_preferred_contact_method,
      p_service_needed,
      v_estimated_budget,
      v_target_timeline,
      p_submitted_at
    );
  exception
    when unique_violation then
      -- Belt and braces behind the advisory lock: if a concurrent
      -- transaction committed the same idempotency key first, report the
      -- lead it created instead of failing the retry.
      select import.lead_id
      into v_existing_lead_id
      from public.website_inquiry_imports as import
      where import.idempotency_key = p_idempotency_key;

      if v_existing_lead_id is null then
        raise;
      end if;

      return pg_catalog.jsonb_build_object(
        'status', 'duplicate',
        'lead_id', v_existing_lead_id
      );
  end;

  return pg_catalog.jsonb_build_object(
    'status', 'created',
    'lead_id', v_lead_id
  );
end;
$function$;

revoke all on function public.ingest_website_project_inquiry(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.ingest_website_project_inquiry(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;
