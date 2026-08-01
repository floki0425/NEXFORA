import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageInvoices,
  isInvoiceEditable,
  isInvoicePayable,
  isInvoiceVoidable,
} from "../../../src/features/invoices/permissions.ts";
import { INTERNAL_ROLES } from "../../../src/lib/auth/types.ts";

test("only super_admin and admin can manage invoices", () => {
  const expected = {
    super_admin: true,
    admin: true,
    project_manager: false,
    team_member: false,
  };

  for (const role of INTERNAL_ROLES) {
    assert.equal(
      canManageInvoices(role),
      expected[role],
      `expected canManageInvoices("${role}") to be ${expected[role]}`,
    );
  }
});

test("only a draft invoice is editable", () => {
  for (const status of ["draft"]) {
    assert.equal(isInvoiceEditable(status), true);
  }
  for (const status of ["sent", "partial", "paid", "overdue", "void"]) {
    assert.equal(isInvoiceEditable(status), false, `expected "${status}" to not be editable`);
  }
});

test("sent, partial, and overdue invoices are payable; draft, paid, and void are not", () => {
  for (const status of ["sent", "partial", "overdue"]) {
    assert.equal(isInvoicePayable(status), true, `expected "${status}" to be payable`);
  }
  for (const status of ["draft", "paid", "void"]) {
    assert.equal(isInvoicePayable(status), false, `expected "${status}" to not be payable`);
  }
});

test("every status except paid and void is voidable", () => {
  for (const status of ["draft", "sent", "partial", "overdue"]) {
    assert.equal(isInvoiceVoidable(status), true, `expected "${status}" to be voidable`);
  }
  for (const status of ["paid", "void"]) {
    assert.equal(isInvoiceVoidable(status), false, `expected "${status}" to not be voidable`);
  }
});
