export function formatLeadDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatBudget(
  minimum: number | null,
  maximum: number | null,
): string {
  if (minimum === null && maximum === null) {
    return "Not specified";
  }

  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });

  if (minimum !== null && maximum !== null) {
    return `${formatter.format(minimum)}–${formatter.format(maximum)}`;
  }

  if (minimum !== null) {
    return `${formatter.format(minimum)}+`;
  }

  if (maximum !== null) {
    return `Up to ${formatter.format(maximum)}`;
  }

  return "Not specified";
}
