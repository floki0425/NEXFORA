import assert from "node:assert/strict";
import test from "node:test";

import { toCentavos } from "../../../src/lib/paymongo/money.ts";

test("toCentavos converts a whole-peso amount exactly", () => {
  assert.equal(toCentavos(100), 10000);
});

test("toCentavos converts a two-decimal amount exactly", () => {
  assert.equal(toCentavos(1500.5), 150050);
  assert.equal(toCentavos(99.99), 9999);
  assert.equal(toCentavos(0.01), 1);
});

test("toCentavos rounds away any IEEE754 representation drift", () => {
  // 0.1 + 0.2 is the canonical floating-point example that does not equal
  // 0.3 exactly in IEEE754 — toCentavos must still land on a whole centavo.
  assert.equal(toCentavos(0.1 + 0.2), 30);
});

test("toCentavos handles zero", () => {
  assert.equal(toCentavos(0), 0);
});

test("toCentavos handles large invoice totals without losing precision", () => {
  assert.equal(toCentavos(999999.99), 99999999);
});
