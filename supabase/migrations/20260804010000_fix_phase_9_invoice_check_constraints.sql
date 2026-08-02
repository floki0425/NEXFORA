-- Fix two invoices check constraints that were too strict, both found by
-- running the Phase 9 integration suite against a real Supabase project.
-- Does not modify the already-applied 20260804000000 migration; this file
-- only drops and recreates two constraints in place.

-- ---------------------------------------------------------------------------
-- Fix 1: invoices_invoice_number_presence_check incorrectly required every
-- non-draft invoice to have a non-null invoice_number. A draft invoice
-- voided before ever being sent legitimately reaches status = 'void' with
-- invoice_number still null (void_invoice() never assigns one — only
-- send_invoice() does), which is a real, valid state the original
-- constraint rejected outright:
--
--   new row for relation "invoices" violates check constraint
--   "invoices_invoice_number_presence_check"
--
-- The corrected rule: a draft must have no number; a voided invoice may
-- have either (depending on whether it was ever sent before being voided);
-- every other status must have one (only reachable via send_invoice()).
-- ---------------------------------------------------------------------------

alter table public.invoices
  drop constraint invoices_invoice_number_presence_check;

alter table public.invoices
  add constraint invoices_invoice_number_presence_check
  check (
    (status = 'draft' and invoice_number is null)
    or status = 'void'
    or (
      status in ('sent', 'partial', 'paid', 'overdue')
      and invoice_number is not null
    )
  );

-- ---------------------------------------------------------------------------
-- Fix 2: invoices_total_check (total >= 0) is correct for a sent invoice,
-- but a draft's total is derived (subtotal - discount + tax) and subtotal
-- starts at 0 until line items are added afterward (mirroring proposals'
-- identical create-then-add-items flow) — setting a discount before any
-- items exist yet transiently drives total negative:
--
--   new row for relation "invoices" violates check constraint
--   "invoices_total_check"
--
-- This is a benign, self-correcting editing state, not a data integrity
-- problem, and send_invoice() already independently requires
-- `target_invoice.total > 0` before a draft can ever be sent — so the
-- database-level check only needs to hold once the invoice has left draft.
-- Mirrors the existing status = 'draft' or ... pattern already used by
-- invoices_due_date_presence_check in the original migration.
-- ---------------------------------------------------------------------------

alter table public.invoices
  drop constraint invoices_total_check;

alter table public.invoices
  add constraint invoices_total_check
  check (status = 'draft' or total >= 0);
