revoke all on function public.submit_project_inquiry(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  numeric,
  numeric,
  text
) from public, anon, authenticated;

drop function public.submit_project_inquiry(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  numeric,
  numeric,
  text
);

create function public.submit_project_inquiry(
  inquiry_full_name text,
  inquiry_business_name text,
  inquiry_email text,
  inquiry_phone text,
  inquiry_industry text,
  inquiry_service_interest text,
  inquiry_problem_summary text,
  inquiry_requested_features jsonb,
  inquiry_target_timeline text,
  inquiry_budget_min numeric default null,
  inquiry_budget_max numeric default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_organization_id uuid;
  normalized_email text := lower(btrim(inquiry_email));
  recent_inquiry_count integer;
begin
  -- Serialize submissions for the same normalized email so the bounded
  -- anti-abuse check cannot be bypassed by concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_email, 0)
  );

  select organization.id
  into target_organization_id
  from public.organizations as organization
  where organization.slug = 'nexfora'
    and organization.status = 'active'
  limit 1;

  if target_organization_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Project inquiry is temporarily unavailable.';
  end if;

  select count(*)::integer
  into recent_inquiry_count
  from public.leads as lead
  where lead.organization_id = target_organization_id
    and lead.source = 'website'
    and lead.email = normalized_email
    and lead.created_at >= pg_catalog.now() - interval '15 minutes';

  if recent_inquiry_count >= 3 then
    return false;
  end if;

  insert into public.leads (
    organization_id,
    full_name,
    business_name,
    email,
    phone,
    industry,
    service_interest,
    problem_summary,
    requested_features,
    budget_min,
    budget_max,
    target_timeline,
    source,
    status
  )
  values (
    target_organization_id,
    btrim(inquiry_full_name),
    nullif(btrim(inquiry_business_name), ''),
    normalized_email,
    nullif(btrim(inquiry_phone), ''),
    nullif(btrim(inquiry_industry), ''),
    btrim(inquiry_service_interest),
    btrim(inquiry_problem_summary),
    coalesce(inquiry_requested_features, '[]'::jsonb),
    inquiry_budget_min,
    inquiry_budget_max,
    nullif(btrim(inquiry_target_timeline), ''),
    'website',
    'new'
  );

  return true;
exception
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Project inquiry could not be submitted.';
end;
$function$;

revoke all on function public.submit_project_inquiry(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  numeric,
  numeric
) from public, anon, authenticated;

grant execute on function public.submit_project_inquiry(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  numeric,
  numeric
) to anon, authenticated;
