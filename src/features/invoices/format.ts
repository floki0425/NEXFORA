export function formatInvoiceDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatInvoiceDay(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
}

/**
 * Accepts `number | null` because Postgres generated columns
 * (`invoices.balance_due`, `invoice_items.line_total`) are typed nullable
 * by Supabase's type generator even though they can never actually be null
 * in a well-formed row (they're computed from not-null inputs) — treating
 * null as 0 here is a defensive display-layer fallback, not a real
 * expected case.
 */
export function formatMoney(amount: number | null, currency: string): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
}
