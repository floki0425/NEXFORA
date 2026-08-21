-- OS-L1 hotfix: NULLIF must not be schema-qualified.
--
-- 20260817000000_os_l1_website_inquiry_ingestion.sql wrote five calls as
-- `pg_catalog.nullif(...)`. NULLIF is SQL *grammar*, not a catalog function --
-- the parser rewrites it into a CASE expression -- so it has no pg_catalog
-- entry and cannot be schema-qualified. PL/pgSQL resolves expressions lazily,
-- so the original migration applied cleanly and only failed when the function
-- was first called, with:
--
--     42883  function pg_catalog.nullif(text, unknown) does not exist
--
-- That made every website project inquiry fail ingestion at runtime while the
-- webhook itself reported a clean 502.
--
-- This migration is forward-only: it does not edit the already-applied OS-L1
-- migration. It replaces the function body with a copy that is byte-identical
-- except for the five `pg_catalog.nullif(` -> `nullif(` corrections.
-- Signature, parameter names and types, return type, SECURITY DEFINER, the
-- pinned empty search_path, the advisory lock, idempotency and duplicate
-- handling, canonical enum validation, lead creation, and the revoke/grant
-- pair are all unchanged and are restated verbatim so this file is
-- self-contained and re-runnable.
--
-- `pg_catalog.btrim(...)` is deliberately left alone: btrim IS a real
-- catalog function, and qualifying it is what keeps it safe under
-- `set search_path = ''`. Only NULLIF was wrong.

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
    nullif(pg_catalog.btrim(p_estimated_budget), '');
  v_target_timeline text :=
    nullif(pg_catalog.btrim(p_target_timeline), '');
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
     and nullif(pg_catalog.btrim(p_phone), '') is null then
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
      nullif(pg_catalog.btrim(p_business_organization), ''),
      v_email,
      nullif(pg_catalog.btrim(p_phone), ''),
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
