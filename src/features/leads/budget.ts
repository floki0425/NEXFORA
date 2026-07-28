import type { Database } from "@/types/database";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export type BudgetFormValue = string | number | null | undefined;
export type LeadBudgetValues = Pick<LeadRow, "budget_min" | "budget_max">;
export type LeadBudgetInsert = Pick<
  LeadInsert,
  "budget_min" | "budget_max"
>;
export type LeadBudgetUpdate = Pick<
  LeadUpdate,
  "budget_min" | "budget_max"
>;

export function normalizeNullableBudget(
  value: BudgetFormValue,
): LeadRow["budget_min"] {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();
    return normalizedValue === "" ? null : Number(normalizedValue);
  }

  return value;
}

export function normalizeLeadCreateBudgets(values: {
  budgetMin?: BudgetFormValue;
  budgetMax?: BudgetFormValue;
}): Required<LeadBudgetInsert> {
  return {
    budget_min: normalizeNullableBudget(values.budgetMin),
    budget_max: normalizeNullableBudget(values.budgetMax),
  };
}

export function normalizeLeadUpdateBudgets(values: {
  budgetMin?: BudgetFormValue;
  budgetMax?: BudgetFormValue;
}): LeadBudgetUpdate {
  const budgets: LeadBudgetUpdate = {};

  if (values.budgetMin !== undefined) {
    budgets.budget_min = normalizeNullableBudget(values.budgetMin);
  }

  if (values.budgetMax !== undefined) {
    budgets.budget_max = normalizeNullableBudget(values.budgetMax);
  }

  return budgets;
}

export function resolveLeadBudgetValues(
  existing: LeadBudgetValues,
  updates: LeadBudgetUpdate,
): LeadBudgetValues {
  return {
    budget_min:
      updates.budget_min === undefined
        ? existing.budget_min
        : updates.budget_min,
    budget_max:
      updates.budget_max === undefined
        ? existing.budget_max
        : updates.budget_max,
  };
}

export function isValidBudgetRange({
  budget_min: budgetMin,
  budget_max: budgetMax,
}: LeadBudgetValues): boolean {
  return (
    budgetMin === null ||
    budgetMax === null ||
    budgetMax >= budgetMin
  );
}
