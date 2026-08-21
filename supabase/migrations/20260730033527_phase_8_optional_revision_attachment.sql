-- =========================================================================
-- HISTORICAL NO-OP. This migration intentionally does nothing.
-- =========================================================================
--
-- This file's version (20260730033527) is misdated. It is a Phase 8 change
-- stamped 2026-07-30, which sorts it to position 5 of the migration chain --
-- one slot BEFORE 20260731000000_phase_5_projects_foundation.sql creates
-- public.projects.
--
-- What it originally contained
-- ----------------------------
-- A `create or replace function public.create_client_revision(...)` that gave
-- the trailing p_attachment_file_id parameter a `default null`. That exact
-- change -- same seven-argument signature, byte-identical SQL apart from
-- comments -- was later re-issued, correctly ordered and fully documented, as:
--
--     20260803010000_fix_phase_8_attachment_default.sql
--
-- supabase/migrations-backup/ corroborates this: it contains the 2026-08-03
-- file and does NOT contain this one, so the intended chain never had it.
--
-- Why executing it here breaks a fresh replay
-- -------------------------------------------
-- Its body declared:
--
--     target_project public.projects%rowtype;
--
-- check_function_bodies is on by default, so the PL/pgSQL validator resolves
-- %rowtype at CREATE FUNCTION time. At position 5 public.projects does not
-- exist yet, so `supabase db reset` aborted here with SQLSTATE 42P01,
-- 'relation "public.projects" does not exist'.
--
-- The body also referenced public.revisions, public.project_files and
-- private.active_client_role(), all created at position 10. PL/pgSQL defers
-- those, so only the %rowtype declaration was fatal -- but the migration
-- genuinely depended on everything through Phase 8, not merely Phase 5.
-- Moving it just after Phase 5 would therefore not have been enough.
--
-- Where the authoritative implementation lives
-- --------------------------------------------
-- public.create_client_revision is created by
-- 20260803000000_phase_8_files_revisions.sql and given its final definition by
-- 20260803010000_fix_phase_8_attachment_default.sql. Both still run, in order,
-- after every dependency exists. Emptying this file changes no final schema in
-- any environment.
--
-- Why the file is kept rather than deleted or renamed
-- ---------------------------------------------------
-- Databases that applied this migration before the defect was found have
-- '20260730033527' recorded in supabase_migrations.schema_migrations. Deleting
-- or renaming the file would orphan that row and force a
-- `supabase migration repair` against production to fix a defect that has no
-- schema consequence. Keeping the version and neutralising its body preserves
-- history everywhere and requires no action on any existing database:
--
--   * already applied -> never re-runs; schema and data untouched
--   * fresh replay    -> runs this no-op and continues to Phase 5
--
-- Do not add DDL here. Anything this file appears to need already belongs to
-- the correctly ordered Phase 8 migrations named above.
-- =========================================================================

do $$
begin
  raise notice
    'Migration 20260730033527 is an intentional historical no-op; the authoritative change is 20260803010000_fix_phase_8_attachment_default.sql.';
end;
$$;
