import assert from "node:assert/strict";
import test from "node:test";

import {
  invoiceCreateSchema,
  invoiceItemFormSchema,
  recordPaymentSchema,
} from "../../../src/features/invoices/schemas.ts";
import { formatMoney } from "../../../src/features/invoices/format.ts";

test("invoiceCreateSchema requires a valid client id", () => {
  const result = invoiceCreateSchema.safeParse({
    clientId: "not-a-uuid",
    projectId: "",
    dueDate: "",
    discount: "0",
    tax: "0",
    notes: "",
  });
  assert.equal(result.success, false);
});

test("invoiceCreateSchema accepts an empty projectId (no linked project)", () => {
  const result = invoiceCreateSchema.safeParse({
    clientId: "11111111-1111-4111-8111-111111111111",
    projectId: "",
    dueDate: "",
    discount: "0",
    tax: "0",
    notes: "",
  });
  assert.equal(result.success, true);
});

test("invoiceCreateSchema rejects a negative discount or tax", () => {
  const base = {
    clientId: "11111111-1111-4111-8111-111111111111",
    projectId: "",
    dueDate: "",
    notes: "",
  };
  assert.equal(
    invoiceCreateSchema.safeParse({ ...base, discount: "-5", tax: "0" }).success,
    false,
  );
  assert.equal(
    invoiceCreateSchema.safeParse({ ...base, discount: "0", tax: "-5" }).success,
    false,
  );
});

test("invoiceCreateSchema rejects more than two decimal places", () => {
  const result = invoiceCreateSchema.safeParse({
    clientId: "11111111-1111-4111-8111-111111111111",
    projectId: "",
    dueDate: "",
    discount: "10.999",
    tax: "0",
    notes: "",
  });
  assert.equal(result.success, false);
});

test("invoiceItemFormSchema requires a non-blank description and a positive quantity", () => {
  assert.equal(
    invoiceItemFormSchema.safeParse({
      description: "",
      quantity: "1",
      unitPrice: "0",
    }).success,
    false,
  );
  assert.equal(
    invoiceItemFormSchema.safeParse({
      description: "Design work",
      quantity: "0",
      unitPrice: "0",
    }).success,
    false,
  );
  assert.equal(
    invoiceItemFormSchema.safeParse({
      description: "Design work",
      quantity: "1",
      unitPrice: "0",
    }).success,
    true,
  );
});

test("invoiceItemFormSchema allows a zero unit price but not a negative one", () => {
  const base = { description: "Discounted item", quantity: "1" };
  assert.equal(
    invoiceItemFormSchema.safeParse({ ...base, unitPrice: "0" }).success,
    true,
  );
  assert.equal(
    invoiceItemFormSchema.safeParse({ ...base, unitPrice: "-1" }).success,
    false,
  );
});

test("recordPaymentSchema requires a positive amount and a valid payment method", () => {
  const base = {
    paidDate: "2026-08-01",
    providerReference: "",
    notes: "",
  };
  assert.equal(
    recordPaymentSchema.safeParse({ ...base, amount: "0", paymentMethod: "cash" })
      .success,
    false,
  );
  assert.equal(
    recordPaymentSchema.safeParse({ ...base, amount: "100", paymentMethod: "bitcoin" })
      .success,
    false,
  );
  assert.equal(
    recordPaymentSchema.safeParse({ ...base, amount: "100.50", paymentMethod: "gcash" })
      .success,
    true,
  );
});

test("recordPaymentSchema requires a well-formed paid date", () => {
  const result = recordPaymentSchema.safeParse({
    amount: "100",
    paymentMethod: "cash",
    paidDate: "not-a-date",
    providerReference: "",
    notes: "",
  });
  assert.equal(result.success, false);
});

test("formatMoney formats a PHP amount with the currency symbol and two decimal places", () => {
  const formatted = formatMoney(1500.5, "PHP");
  assert.match(formatted, /1,500\.50/);
});

test("formatMoney formats zero without throwing", () => {
  assert.doesNotThrow(() => formatMoney(0, "PHP"));
});
