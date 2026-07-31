// Additional revision-validation unit tests, closing gaps beyond
// tests/revisions/revisions.test.mjs (max-length enforcement, page/section
// name omission, and the full documented priority set).

import assert from "node:assert/strict";
import test from "node:test";

import {
  requestChangesSchema,
  submitRevisionSchema,
} from "../../../src/features/portal/revisions/schemas.ts";
import { REVISION_PRIORITIES } from "../../../src/features/revisions/constants.ts";

function validBase() {
  return {
    title: "Fix hero spacing",
    description: "The hero has too much padding on mobile.",
    priority: "medium",
  };
}

test("every documented priority is accepted", () => {
  for (const priority of REVISION_PRIORITIES) {
    const result = submitRevisionSchema.safeParse({ ...validBase(), priority });
    assert.equal(result.success, true, `expected priority "${priority}" to be valid`);
  }
});

test("title, description, page name, and section name enforce their documented maximum lengths", () => {
  const base = validBase();

  assert.equal(
    submitRevisionSchema.safeParse({ ...base, title: "a".repeat(200) }).success,
    true,
  );
  assert.equal(
    submitRevisionSchema.safeParse({ ...base, title: "a".repeat(201) }).success,
    false,
  );

  assert.equal(
    submitRevisionSchema.safeParse({ ...base, description: "a".repeat(5000) })
      .success,
    true,
  );
  assert.equal(
    submitRevisionSchema.safeParse({ ...base, description: "a".repeat(5001) })
      .success,
    false,
  );

  assert.equal(
    submitRevisionSchema.safeParse({ ...base, pageName: "a".repeat(160) })
      .success,
    true,
  );
  assert.equal(
    submitRevisionSchema.safeParse({ ...base, pageName: "a".repeat(161) })
      .success,
    false,
  );

  assert.equal(
    submitRevisionSchema.safeParse({ ...base, sectionName: "a".repeat(160) })
      .success,
    true,
  );
  assert.equal(
    submitRevisionSchema.safeParse({ ...base, sectionName: "a".repeat(161) })
      .success,
    false,
  );
});

test("page name and section name may both be omitted entirely", () => {
  const result = submitRevisionSchema.safeParse(validBase());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.pageName, "");
    assert.equal(result.data.sectionName, "");
  }
});

test("the further-changes comment enforces its documented maximum length and cannot be blank", () => {
  assert.equal(requestChangesSchema.safeParse({ comment: "" }).success, false);
  assert.equal(
    requestChangesSchema.safeParse({ comment: "   " }).success,
    false,
  );
  assert.equal(
    requestChangesSchema.safeParse({ comment: "a".repeat(3000) }).success,
    true,
  );
  assert.equal(
    requestChangesSchema.safeParse({ comment: "a".repeat(3001) }).success,
    false,
  );
});
