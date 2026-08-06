-- Phase 12A (part 2 of 2): global search. One bounded, indexed, cross-entity
-- lookup for the admin workspace. Additive only: one extension, twelve GIN
-- trigram indexes, one public function. Creates no table, alters no column,
-- and touches no RLS policy.
--
-- ===========================================================================
-- AUTHORIZATION: FOUR INDEPENDENT LAYERS. Read this before changing anything.
-- ===========================================================================
--
-- Layer 0 -- EXECUTE privilege. This function is granted to `authenticated`
--   only (see the grant at the end of this file). An `anon` caller is
--   therefore rejected by PostgreSQL itself with SQLSTATE 42501,
--   "permission denied for function search_workspace", BEFORE the function
--   body runs. anon never reaches the Layer 1 guard and never receives its
--   P0001 message -- do not write tests or documentation that expect it to.
--
-- Layer 1 -- explicit active internal-membership guard. For callers who do
--   hold EXECUTE (i.e. any authenticated session), the function resolves the
--   caller's single active internal membership through
--   private.current_internal_actor() and raises P0001 unless it resolves to
--   exactly one membership in p_organization_id. Authenticated portal users,
--   authenticated suspended members, authenticated users with no membership,
--   and authenticated members of another organization all stop here, before
--   a single business table is touched.
--
-- Layer 2 -- SECURITY INVOKER. This function is deliberately NOT security
--   definer. That is the property the whole design rests on: because every
--   branch below is a plain select executed as the caller, each table's own
--   RLS policy still applies inside this function. If someone later "fixes"
--   this to security definer for performance, support-ticket scoping leaks
--   silently and nothing else in this file will stop it. A unit test asserts
--   prosecdef stays false. Do not change it.
--
-- Layer 3 -- existing base-table RLS. Untouched by this migration.
--
-- Layer 4 -- explicit per-entity product-role predicates, below. These are
--   REQUIRED and are not redundant with layer 3. leads, clients, projects,
--   proposals and invoices all carry a bare is_internal_member() SELECT
--   policy, which is the TENANT rule, not the PRODUCT rule: RLS alone would
--   happily let a team_member surface every lead and every invoice in the
--   organization through search. The matrix below is the product rule.
--
-- ===========================================================================
-- SEARCH MATRIX (locked)
-- ===========================================================================
--
--   entity          super_admin / admin   project_manager        team_member
--   ------------------------------------------------------------------------
--   lead            organization-wide     none                   none
--   client          organization-wide     clients connected to   none
--                                         projects they own
--   project         organization-wide     projects they own      via
--                                                                project_members
--   proposal        organization-wide     none                   none
--   invoice         organization-wide     none                   none
--   support_ticket  existing RLS          existing RLS           existing RLS
--
-- "projects they own" is projects.project_manager_id = the actor's profile.
-- This deliberately matches public.get_project_delivery_report and
-- deliberately does NOT use private.can_manage_project(), which also returns
-- true for an ordinary project_members row.
--
-- support_ticket is the one intentional exception: it gets NO product
-- predicate here, because its RLS policy (see
-- 20260805010000_fix_phase_10_authorization_integrity.sql) already IS the
-- product rule -- admin, or assignee, or project manager of that ticket's
-- project. Duplicating it here would create a second copy that can silently
-- drift from the policy. The asymmetry is deliberate; do not "make it
-- consistent" by copying the predicate in.
--
-- ===========================================================================
-- WHAT IS NEVER SEARCHED AND NEVER RETURNED
-- ===========================================================================
--
-- token hashes, storage paths, provider references, idempotency keys,
-- payment metadata, audit metadata, private invoice notes, authentication
-- records, and any secret or credential. Only the six columns in the result
-- signature leave this function, and every searched column is a business
-- identifier or a human-facing name. A unit test greps this file for those
-- forbidden identifiers.
--
-- Matching is ILIKE '%term%' over pg_trgm GIN indexes rather than full-text
-- search, because the highest-value admin queries are partial business
-- identifiers ("INV-2026-00", "NXF-TKT") which tsquery handles badly.
-- Trigram index selection needs 3+ characters; a 2-character query still
-- works but scans. That is acceptable at single-tenant row counts and is
-- bounded by the per-entity limit.

-- ---------------------------------------------------------------------------
-- SECTION 0: preflight.
-- ---------------------------------------------------------------------------

do $preflight$
begin
  if to_regclass('public.leads') is null
    or to_regclass('public.clients') is null
    or to_regclass('public.projects') is null
    or to_regclass('public.project_members') is null
    or to_regclass('public.proposals') is null
    or to_regclass('public.invoices') is null
    or to_regclass('public.support_tickets') is null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 12A search preflight aborted: one or more required searchable tables are missing.';
  end if;

  -- Part 1 of this phase must be applied first: the membership guard depends
  -- on the actor helper it introduces.
  if to_regprocedure('private.current_internal_actor()') is null then
    raise exception using
      errcode = '55000',
      message = 'Phase 12A search preflight aborted: private.current_internal_actor() is missing. Apply 20260807000000_phase_12a_reporting.sql first.';
  end if;

  if to_regnamespace('extensions') is null then
    raise exception using
      errcode = '55000',
      message = 'Phase 12A search preflight aborted: the extensions schema is missing.';
  end if;

  if to_regprocedure('public.search_workspace(uuid, text, integer)') is not null then
    raise exception using
      errcode = '55000',
      message = 'Phase 12A search preflight aborted: public.search_workspace already exists. This migration must not run twice.';
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- SECTION 1: trigram extension.
--
-- Installed into the extensions schema, which config.toml already carries on
-- extra_search_path. Every function in this repository runs with
-- search_path = '', so the operator class MUST be written as
-- extensions.gin_trgm_ops in each index below -- an unqualified gin_trgm_ops
-- fails at creation time under an empty search path.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- SECTION 2: GIN trigram indexes, one per searched column.
--
-- Per-column rather than one combined expression index: the planner can
-- BitmapOr these for the multi-column branches, and there is no fragile
-- requirement that the query repeat an index expression verbatim.
-- ---------------------------------------------------------------------------

create index if not exists leads_full_name_trgm_idx
  on public.leads using gin (full_name extensions.gin_trgm_ops);

create index if not exists leads_business_name_trgm_idx
  on public.leads using gin (business_name extensions.gin_trgm_ops);

create index if not exists leads_email_trgm_idx
  on public.leads using gin (email extensions.gin_trgm_ops);

create index if not exists clients_business_name_trgm_idx
  on public.clients using gin (business_name extensions.gin_trgm_ops);

create index if not exists clients_contact_name_trgm_idx
  on public.clients using gin (contact_name extensions.gin_trgm_ops);

create index if not exists clients_email_trgm_idx
  on public.clients using gin (email extensions.gin_trgm_ops);

create index if not exists projects_name_trgm_idx
  on public.projects using gin (name extensions.gin_trgm_ops);

create index if not exists proposals_title_trgm_idx
  on public.proposals using gin (title extensions.gin_trgm_ops);

create index if not exists proposals_number_trgm_idx
  on public.proposals using gin (proposal_number extensions.gin_trgm_ops);

create index if not exists invoices_number_trgm_idx
  on public.invoices using gin (invoice_number extensions.gin_trgm_ops);

create index if not exists support_tickets_number_trgm_idx
  on public.support_tickets using gin (ticket_number extensions.gin_trgm_ops);

create index if not exists support_tickets_title_trgm_idx
  on public.support_tickets using gin (title extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- SECTION 3: public.search_workspace.
--
-- Bounds enforced here rather than trusted from the caller:
--   * queries shorter than 2 characters return zero rows (not an error -- a
--     short query is below threshold, not invalid);
--   * queries longer than 120 characters are truncated, not rejected;
--   * %, _ and \ in the query are ESCAPED, so a user typing '%' matches a
--     literal percent sign instead of every row;
--   * per-entity limit is clamped to 1..5 and applied INSIDE each branch, so
--     one noisy entity can never crowd the others out;
--   * a hard total cap of 30 backstops the whole result set.
-- ---------------------------------------------------------------------------

create or replace function public.search_workspace(
  p_organization_id uuid,
  p_query text,
  p_limit integer default 5
)
returns table (
  entity_type text,
  entity_id uuid,
  title text,
  subtitle text,
  status text,
  updated_at timestamptz
)
language plpgsql
stable
-- Intentionally SECURITY INVOKER (no security clause). See the header.
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_profile_id uuid;
  actor_role text;
  normalized_query text;
  like_pattern text;
  entity_limit integer;
begin
  -- Layer 1: explicit active internal-membership guard. Reached only by
  -- callers who already hold EXECUTE, i.e. authenticated sessions -- anon is
  -- stopped by Layer 0 (the grant) with SQLSTATE 42501 and never gets here.
  select actor.organization_id, actor.profile_id, actor.role
    into actor_organization_id, actor_profile_id, actor_role
  from private.current_internal_actor() as actor;

  if actor_organization_id is null
    or p_organization_id is null
    or actor_organization_id is distinct from p_organization_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to search this workspace.';
  end if;

  normalized_query := btrim(coalesce(p_query, ''));

  if char_length(normalized_query) > 120 then
    normalized_query := left(normalized_query, 120);
  end if;

  -- Below the minimum useful length: no rows, no error.
  if char_length(normalized_query) < 2 then
    return;
  end if;

  -- Escape LIKE metacharacters so they match literally. Backslash first,
  -- otherwise it would double-escape the escapes added after it.
  like_pattern := '%' || replace(
    replace(replace(normalized_query, '\', '\\'), '%', '\%'),
    '_', '\_'
  ) || '%';

  -- Clamped to 5 so six entities can never exceed the 30-row total cap; the
  -- cap therefore never truncates one entity's results unfairly.
  entity_limit := least(greatest(coalesce(p_limit, 5), 1), 5);

  return query
  with matches as (
    -- lead: super_admin / admin only.
    (
      select
        'lead'::text as entity_type,
        lead.id as entity_id,
        lead.full_name as title,
        lead.business_name as subtitle,
        lead.status as status,
        lead.updated_at as updated_at
      from public.leads as lead
      where lead.organization_id = p_organization_id
        and actor_role in ('super_admin', 'admin')
        and (
          lead.full_name ilike like_pattern escape '\'
          or lead.business_name ilike like_pattern escape '\'
          or lead.email ilike like_pattern escape '\'
        )
      order by lead.updated_at desc
      limit entity_limit
    )
    union all
    -- client: organization-wide for super_admin/admin; for a project manager,
    -- only clients reachable through a project they own.
    (
      select
        'client'::text,
        client.id,
        client.business_name,
        client.contact_name,
        client.status,
        client.updated_at
      from public.clients as client
      where client.organization_id = p_organization_id
        and (
          actor_role in ('super_admin', 'admin')
          or (
            actor_role = 'project_manager'
            and exists (
              select 1
              from public.projects as owned
              where owned.client_id = client.id
                and owned.organization_id = p_organization_id
                and owned.project_manager_id = actor_profile_id
            )
          )
        )
        and (
          client.business_name ilike like_pattern escape '\'
          or client.contact_name ilike like_pattern escape '\'
          or client.email ilike like_pattern escape '\'
        )
      order by client.updated_at desc
      limit entity_limit
    )
    union all
    -- project: organization-wide for super_admin/admin; owned projects for a
    -- project manager; assigned projects for a team member.
    (
      select
        'project'::text,
        project.id,
        project.name,
        owner_client.business_name,
        project.status,
        project.updated_at
      from public.projects as project
      left join public.clients as owner_client
        on owner_client.id = project.client_id
      where project.organization_id = p_organization_id
        and (
          actor_role in ('super_admin', 'admin')
          or (
            actor_role = 'project_manager'
            and project.project_manager_id = actor_profile_id
          )
          or (
            actor_role = 'team_member'
            and exists (
              select 1
              from public.project_members as membership
              where membership.project_id = project.id
                and membership.user_id = actor_profile_id
            )
          )
        )
        and (
          project.name ilike like_pattern escape '\'
          or project.slug ilike like_pattern escape '\'
        )
      order by project.updated_at desc
      limit entity_limit
    )
    union all
    -- proposal: super_admin / admin only.
    (
      select
        'proposal'::text,
        proposal.id,
        proposal.title,
        proposal.proposal_number,
        proposal.status,
        proposal.updated_at
      from public.proposals as proposal
      where proposal.organization_id = p_organization_id
        and actor_role in ('super_admin', 'admin')
        and (
          proposal.title ilike like_pattern escape '\'
          or proposal.proposal_number ilike like_pattern escape '\'
        )
      order by proposal.updated_at desc
      limit entity_limit
    )
    union all
    -- invoice: super_admin / admin only. Amounts are deliberately not
    -- returned; the palette is a navigation aid, not a finance surface.
    (
      select
        'invoice'::text,
        invoice.id,
        coalesce(invoice.invoice_number, 'Draft invoice'),
        billed_client.business_name,
        invoice.status,
        invoice.updated_at
      from public.invoices as invoice
      left join public.clients as billed_client
        on billed_client.id = invoice.client_id
      where invoice.organization_id = p_organization_id
        and actor_role in ('super_admin', 'admin')
        and invoice.invoice_number ilike like_pattern escape '\'
      order by invoice.updated_at desc
      limit entity_limit
    )
    union all
    -- support_ticket: NO product predicate by design. Its RLS policy already
    -- is the product rule. See the header before adding one.
    (
      select
        'support_ticket'::text,
        ticket.id,
        ticket.title,
        ticket.ticket_number,
        ticket.status,
        ticket.updated_at
      from public.support_tickets as ticket
      where ticket.organization_id = p_organization_id
        and (
          ticket.ticket_number ilike like_pattern escape '\'
          or ticket.title ilike like_pattern escape '\'
        )
      order by ticket.updated_at desc
      limit entity_limit
    )
  )
  select
    matched.entity_type,
    matched.entity_id,
    matched.title,
    matched.subtitle,
    matched.status,
    matched.updated_at
  from matches as matched
  order by matched.entity_type, matched.updated_at desc
  limit 30;
end;
$function$;

revoke all on function public.search_workspace(uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.search_workspace(uuid, text, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 4: make PostgREST aware of the new function immediately.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
