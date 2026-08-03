import assert from "node:assert/strict";
import test from "node:test";

import { verifyCronSecret } from "../../../src/lib/reminders/cron-secret.ts";

const SECRET = "a".repeat(32);

test("rejects when configuredSecret is undefined (absent env)", () => {
  assert.equal(verifyCronSecret(`Bearer ${SECRET}`, undefined), false);
});

test("rejects when configuredSecret is an empty string", () => {
  assert.equal(verifyCronSecret(`Bearer ${SECRET}`, ""), false);
});

test("rejects when the header is null", () => {
  assert.equal(verifyCronSecret(null, SECRET), false);
});

test("rejects a header missing the Bearer prefix", () => {
  assert.equal(verifyCronSecret(SECRET, SECRET), false);
});

test("rejects a short (wrong) secret", () => {
  assert.equal(verifyCronSecret("Bearer short", SECRET), false);
});

test("rejects a same-length but wrong secret", () => {
  const wrong = "b".repeat(32);
  assert.equal(verifyCronSecret(`Bearer ${wrong}`, SECRET), false);
});

test("rejects a longer, wrong secret without throwing", () => {
  assert.doesNotThrow(() => {
    verifyCronSecret(`Bearer ${SECRET}extra`, SECRET);
  });
  assert.equal(verifyCronSecret(`Bearer ${SECRET}extra`, SECRET), false);
});

test("accepts the exact configured secret", () => {
  assert.equal(verifyCronSecret(`Bearer ${SECRET}`, SECRET), true);
});

test("never throws for empty header string", () => {
  assert.doesNotThrow(() => verifyCronSecret("", SECRET));
  assert.equal(verifyCronSecret("", SECRET), false);
});

test("never throws for non-ascii input of mismatched byte length", () => {
  assert.doesNotThrow(() => verifyCronSecret("Bearer \u{1F600}".repeat(4), SECRET));
});
