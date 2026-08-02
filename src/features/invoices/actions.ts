"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { publicEnv } from "@/config/env.public";
import { sendInvoiceEmail } from "@/lib/email/send-invoice-email";
import { maskEmailForLogging, recipientDomain } from "@/lib/email/resend-result";
import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import { memberCanManageInvoices } from "./permissions";
import {
  invoiceCreateSchema,
  invoiceEditSchema,
  invoiceIdSchema,
  invoiceItemFormSchema,
  recordPaymentSchema,
} from "./schemas";
import type { InvoiceActionResult } from "./types";

const GENERIC_ERROR =
  "We could not save your changes. Please review the form and try again.";
const SEND_ERROR =
  "We could not send this invoice. No changes were made. Please try again.";
const VOID_ERROR = "We could not void this invoice. Please try again.";
const PAYMENT_ERROR = "We could not record this payment. Please try again.";

// send_invoice / void_invoice / record_manual_payment raise these exact,
// already user-safe messages for known business-rule rejections. Anything
// not in this allowlist falls back to a generic message so raw database
// errors never reach the browser — mirrors proposals' SAFE_RPC_MESSAGES.
const SAFE_RPC_MESSAGES = new Set([
  "Authentication is required.",
  "You do not have permission to send this invoice.",
  "You do not have permission to void this invoice.",
  "You do not have permission to record payments.",
  "This invoice could not be found.",
  "Only draft invoices can be sent.",
  "A due date is required before sending.",
  "The due date cannot be in the past.",
  "At least one line item is required before sending.",
  "The invoice total must be greater than zero before sending.",
  "A fully paid invoice cannot be voided.",
  "This invoice has already been voided.",
  "This request could not be processed. Please try again.",
  "Payments can only be recorded on a sent, partially paid, or overdue invoice.",
  "Enter a payment amount greater than zero.",
  "This payment would exceed the remaining balance on this invoice.",
  "Choose a valid payment method.",
]);

function safeRpcErrorMessage(
  error: { message?: string | null } | null | undefined,
  fallback: string,
): string {
  if (error?.message && SAFE_RPC_MESSAGES.has(error.message)) {
    return error.message;
  }
  return fallback;
}

function logRpcDiagnostics(
  operation: string,
  error:
    | { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }
    | null
    | undefined,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} Supabase error`, {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
  }
}

type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];
type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"];
type InvoiceItemInsert =
  Database["public"]["Tables"]["invoice_items"]["Insert"];
type InvoiceItemUpdate =
  Database["public"]["Tables"]["invoice_items"]["Update"];

function validationFailure(error: z.ZodError): InvoiceActionResult {
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function isRedirectError(error: unknown): error is { digest: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

async function findOwnedInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<{ id: string; status: string; client_id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, status, client_id")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data ?? null;
}

export async function createInvoiceAction(
  input: unknown,
): Promise<InvoiceActionResult> {
  const parsed = invoiceCreateSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageInvoices(member)) {
      return {
        ok: false,
        message: "You do not have permission to create invoices.",
      };
    }

    const supabase = await createClient();
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", parsed.data.clientId)
      .eq("organization_id", member.organizationId)
      .eq("status", "active")
      .maybeSingle();

    if (clientError || !client) {
      return {
        ok: false,
        message: "Select a valid client in your organization.",
        fieldErrors: { clientId: ["This client is not available."] },
      };
    }

    if (parsed.data.projectId) {
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", parsed.data.projectId)
        .eq("organization_id", member.organizationId)
        .eq("client_id", parsed.data.clientId)
        .maybeSingle();

      if (projectError || !project) {
        return {
          ok: false,
          message: "Select a project that belongs to this client.",
          fieldErrors: { projectId: ["This project is not available."] },
        };
      }
    }

    const invoice: InvoiceInsert = {
      organization_id: member.organizationId,
      client_id: parsed.data.clientId,
      project_id: emptyToNull(parsed.data.projectId),
      due_date: emptyToNull(parsed.data.dueDate),
      notes: emptyToNull(parsed.data.notes),
      discount: Number(parsed.data.discount),
      tax: Number(parsed.data.tax),
      created_by: member.profileId,
    };
    const { data, error } = await supabase
      .from("invoices")
      .insert(invoice)
      .select("id")
      .single();

    if (error || !data) {
      console.error("Invoice creation failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/invoices");
    redirect(`/admin/invoices/${data.id}/edit`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Invoice creation authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateInvoiceAction(
  invoiceId: string,
  input: unknown,
): Promise<InvoiceActionResult> {
  const idResult = invoiceIdSchema.safeParse(invoiceId);
  const parsed = invoiceEditSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This invoice could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageInvoices(member)) {
      return {
        ok: false,
        message: "You do not have permission to update invoices.",
      };
    }

    const existing = await findOwnedInvoice(member.organizationId, idResult.data);
    if (!existing) {
      return { ok: false, message: "This invoice could not be found." };
    }

    if (existing.status !== "draft") {
      return {
        ok: false,
        message: "This invoice can no longer be edited once it has been sent.",
      };
    }

    const supabase = await createClient();
    const updates: InvoiceUpdate = {
      due_date: emptyToNull(parsed.data.dueDate),
      notes: emptyToNull(parsed.data.notes),
      discount: Number(parsed.data.discount),
      tax: Number(parsed.data.tax),
    };
    const { data, error } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Invoice update failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/invoices/${data.id}`);
    return { ok: true, message: "Invoice saved.", invoiceId: data.id };
  } catch {
    console.error("Invoice update authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function addInvoiceItemAction(
  invoiceId: string,
  input: unknown,
): Promise<InvoiceActionResult> {
  const idResult = invoiceIdSchema.safeParse(invoiceId);
  const parsed = invoiceItemFormSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This invoice could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageInvoices(member)) {
      return {
        ok: false,
        message: "You do not have permission to edit line items.",
      };
    }

    const invoice = await findOwnedInvoice(member.organizationId, idResult.data);
    if (!invoice) {
      return { ok: false, message: "This invoice could not be found." };
    }

    if (invoice.status !== "draft") {
      return {
        ok: false,
        message: "Line items can only be edited while the invoice is a draft.",
      };
    }

    const supabase = await createClient();
    const { count } = await supabase
      .from("invoice_items")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", idResult.data);

    const item: InvoiceItemInsert = {
      invoice_id: idResult.data,
      description: parsed.data.description,
      quantity: Number(parsed.data.quantity),
      unit_price: Number(parsed.data.unitPrice),
      sort_order: count ?? 0,
    };
    const { error } = await supabase.from("invoice_items").insert(item);

    if (error) {
      console.error("Invoice line item creation failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/invoices/${idResult.data}/edit`);
    return { ok: true, message: "Line item added." };
  } catch {
    console.error("Invoice line item authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateInvoiceItemAction(
  invoiceId: string,
  itemId: string,
  input: unknown,
): Promise<InvoiceActionResult> {
  const invoiceIdResult = invoiceIdSchema.safeParse(invoiceId);
  const itemIdResult = invoiceIdSchema.safeParse(itemId);
  const parsed = invoiceItemFormSchema.safeParse(input);
  if (!invoiceIdResult.success || !itemIdResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This line item could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageInvoices(member)) {
      return {
        ok: false,
        message: "You do not have permission to edit line items.",
      };
    }

    const invoice = await findOwnedInvoice(
      member.organizationId,
      invoiceIdResult.data,
    );
    if (!invoice) {
      return { ok: false, message: "This invoice could not be found." };
    }

    if (invoice.status !== "draft") {
      return {
        ok: false,
        message: "Line items can only be edited while the invoice is a draft.",
      };
    }

    const supabase = await createClient();
    const updates: InvoiceItemUpdate = {
      description: parsed.data.description,
      quantity: Number(parsed.data.quantity),
      unit_price: Number(parsed.data.unitPrice),
    };
    const { data, error } = await supabase
      .from("invoice_items")
      .update(updates)
      .eq("id", itemIdResult.data)
      .eq("invoice_id", invoiceIdResult.data)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/invoices/${invoiceIdResult.data}/edit`);
    return { ok: true, message: "Line item updated." };
  } catch {
    console.error("Invoice line item update failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function removeInvoiceItemAction(
  invoiceId: string,
  itemId: string,
): Promise<InvoiceActionResult> {
  const invoiceIdResult = invoiceIdSchema.safeParse(invoiceId);
  const itemIdResult = invoiceIdSchema.safeParse(itemId);
  if (!invoiceIdResult.success || !itemIdResult.success) {
    return { ok: false, message: "This line item could not be found." };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageInvoices(member)) {
      return {
        ok: false,
        message: "You do not have permission to edit line items.",
      };
    }

    const invoice = await findOwnedInvoice(
      member.organizationId,
      invoiceIdResult.data,
    );
    if (!invoice) {
      return { ok: false, message: "This invoice could not be found." };
    }

    if (invoice.status !== "draft") {
      return {
        ok: false,
        message: "Line items can only be edited while the invoice is a draft.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("invoice_items")
      .delete()
      .eq("id", itemIdResult.data)
      .eq("invoice_id", invoiceIdResult.data);

    if (error) {
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/invoices/${invoiceIdResult.data}/edit`);
    return { ok: true, message: "Line item removed." };
  } catch {
    console.error("Invoice line item removal failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function sendInvoiceAction(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const idResult = invoiceIdSchema.safeParse(invoiceId);
  if (!idResult.success) {
    return { ok: false, message: "This invoice could not be found." };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageInvoices(member)) {
      return {
        ok: false,
        message: "You do not have permission to send invoices.",
      };
    }

    const invoice = await findOwnedInvoice(member.organizationId, idResult.data);
    if (!invoice) {
      return { ok: false, message: "This invoice could not be found." };
    }

    const supabase = await createClient();

    // The database RPC is the atomic source of truth (number assignment,
    // issue_date, status flip). This call never sends email itself — email
    // is a separate, retry-safe best-effort step below.
    const { data: sendResult, error } = await supabase.rpc("send_invoice", {
      target_invoice_id: idResult.data,
    });

    if (error || !sendResult || sendResult.length === 0) {
      logRpcDiagnostics("sendInvoiceAction", error);
      return { ok: false, message: safeRpcErrorMessage(error, SEND_ERROR) };
    }

    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/invoices/${idResult.data}`);

    const { data: client } = await supabase
      .from("clients")
      .select("business_name, email")
      .eq("id", invoice.client_id)
      .maybeSingle();

    if (!client) {
      return {
        ok: true,
        message: "Invoice sent successfully, but the client contact could not be found to email.",
        invoiceId: idResult.data,
      };
    }

    const { data: invoiceDetail } = await supabase
      .from("invoices")
      .select("total, currency, due_date")
      .eq("id", idResult.data)
      .maybeSingle();

    const resolvedRecipient = client.email.trim().toLowerCase();
    // Clients authenticate through the portal, never the admin app — this
    // must never link to /admin/invoices/..., which requires internal
    // staff membership the client does not have.
    const invoiceUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/portal/invoices/${idResult.data}`;

    if (process.env.NODE_ENV !== "production") {
      console.log("[invoice-send:recipient_resolved]", {
        domain: recipientDomain(resolvedRecipient),
        masked: maskEmailForLogging(resolvedRecipient),
      });
    }

    const emailResult = await sendInvoiceEmail({
      toEmail: resolvedRecipient,
      recipientName: client.business_name,
      invoiceNumber: sendResult[0].invoice_number ?? "",
      total: invoiceDetail?.total ?? 0,
      currency: invoiceDetail?.currency ?? "PHP",
      dueDate: invoiceDetail?.due_date ?? null,
      invoiceUrl,
    });

    if (!emailResult.ok) {
      const message =
        emailResult.reason === "not_configured"
          ? "The invoice was sent and is ready to share, but email delivery is not configured yet. Share the invoice link manually, or set up Resend and use Resend email."
          : emailResult.reason === "invalid_recipient"
            ? "The invoice was sent and is ready to share, but the client's email address on file is invalid. Update the client's email, then use Resend email."
            : "The invoice was sent and is ready to share, but the email could not be delivered. Use Resend email to try again.";
      return { ok: true, message, invoiceId: idResult.data };
    }

    return {
      ok: true,
      message: "Invoice sent and emailed successfully.",
      invoiceId: idResult.data,
    };
  } catch {
    console.error("Invoice send authorization or persistence failed.");
    return { ok: false, message: SEND_ERROR };
  }
}

export async function resendInvoiceEmailAction(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const idResult = invoiceIdSchema.safeParse(invoiceId);
  if (!idResult.success) {
    return { ok: false, message: "This invoice could not be found." };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageInvoices(member)) {
      return {
        ok: false,
        message: "You do not have permission to resend invoices.",
      };
    }

    const invoice = await findOwnedInvoice(member.organizationId, idResult.data);
    if (!invoice || invoice.status === "draft") {
      return {
        ok: false,
        message: "This invoice has not been sent yet.",
      };
    }

    const supabase = await createClient();
    const { data: client } = await supabase
      .from("clients")
      .select("business_name, email")
      .eq("id", invoice.client_id)
      .maybeSingle();

    if (!client) {
      return {
        ok: false,
        message: "The client contact for this invoice could not be found.",
      };
    }

    const { data: invoiceDetail } = await supabase
      .from("invoices")
      .select("invoice_number, total, currency, due_date")
      .eq("id", idResult.data)
      .maybeSingle();

    const resolvedRecipient = client.email.trim().toLowerCase();
    const invoiceUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/portal/invoices/${idResult.data}`;

    const emailResult = await sendInvoiceEmail({
      toEmail: resolvedRecipient,
      recipientName: client.business_name,
      invoiceNumber: invoiceDetail?.invoice_number ?? "",
      total: invoiceDetail?.total ?? 0,
      currency: invoiceDetail?.currency ?? "PHP",
      dueDate: invoiceDetail?.due_date ?? null,
      invoiceUrl,
    });

    if (!emailResult.ok) {
      const message =
        emailResult.reason === "not_configured"
          ? "Email delivery is not configured. Set up Resend to send this link."
          : emailResult.reason === "invalid_recipient"
            ? "The client's email address on file is invalid. Update the client's email, then try again."
            : "We could not deliver the email. Please try again.";
      return { ok: false, message };
    }

    return { ok: true, message: "Invoice email resent successfully." };
  } catch {
    console.error("Invoice resend authorization or persistence failed.");
    return {
      ok: false,
      message: "We could not resend this invoice. Please try again.",
    };
  }
}

export async function voidInvoiceAction(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const idResult = invoiceIdSchema.safeParse(invoiceId);
  if (!idResult.success) {
    return { ok: false, message: "This invoice could not be found." };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageInvoices(member)) {
      return {
        ok: false,
        message: "You do not have permission to void invoices.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("void_invoice", {
      target_invoice_id: idResult.data,
    });

    if (error) {
      logRpcDiagnostics("voidInvoiceAction", error);
      return { ok: false, message: safeRpcErrorMessage(error, VOID_ERROR) };
    }

    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/invoices/${idResult.data}`);
    return { ok: true, message: "Invoice voided.", invoiceId: idResult.data };
  } catch {
    console.error("Invoice void authorization or persistence failed.");
    return { ok: false, message: VOID_ERROR };
  }
}

const idempotencyKeySchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f-]{16,64}$/i, "Invalid request.");

/**
 * idempotencyKey must be generated once by the calling client component
 * (e.g. `useRef(() => crypto.randomUUID())`, stable across retries of the
 * same submission) and passed through unchanged — generating it inside this
 * action would mint a fresh key on every call and defeat the whole point,
 * since a retried submission would then never match its own earlier attempt.
 */
export async function recordManualPaymentAction(
  invoiceId: string,
  input: unknown,
  idempotencyKey: string,
): Promise<InvoiceActionResult> {
  const idResult = invoiceIdSchema.safeParse(invoiceId);
  const parsed = recordPaymentSchema.safeParse(input);
  const keyResult = idempotencyKeySchema.safeParse(idempotencyKey);
  if (!idResult.success || !parsed.success || !keyResult.success) {
    return parsed.success
      ? { ok: false, message: "This invoice could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageInvoices(member)) {
      return {
        ok: false,
        message: "You do not have permission to record payments.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("record_manual_payment", {
      target_invoice_id: idResult.data,
      p_amount: Number(parsed.data.amount),
      p_payment_method: parsed.data.paymentMethod,
      p_paid_date: parsed.data.paidDate,
      p_provider_reference: parsed.data.providerReference,
      p_notes: parsed.data.notes,
      p_idempotency_key: keyResult.data,
    });

    if (error) {
      logRpcDiagnostics("recordManualPaymentAction", error);
      return {
        ok: false,
        message: safeRpcErrorMessage(error, PAYMENT_ERROR),
      };
    }

    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/invoices/${idResult.data}`);
    return {
      ok: true,
      message: "Payment recorded.",
      invoiceId: idResult.data,
    };
  } catch {
    console.error("Payment recording authorization or persistence failed.");
    return { ok: false, message: PAYMENT_ERROR };
  }
}
