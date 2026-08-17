// Route-level tests for src/app/api/webhooks/website-inquiry/route.ts.
// Executes the real exported handlers rather than re-implementing their
// predicates, so a regression in the route's wiring (signature check removed,
// payload no longer validated, PII leaking into a log or a response) fails
// here even though the signature logic itself is covered separately by
// tests/os-l1/unit/signature.test.mjs.
//
// Follows the pattern established by tests/phase11/unit/cron-route.test.mjs:
// dependencies are replaced with in-process doubles via node:test's
// experimental mock.module(), resolved through
// tests/support/app-alias-loader.mjs so the "@/*" alias works. Run with
// --experimental-test-module-mocks --import
// ./tests/support/register-app-alias-loader.mjs (see package.json's
// test:os-l1 script).
//
// serverEnv is mocked directly rather than through process.env because
// src/config/env.server.ts parses process.env exactly once at import time.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test, { mock } from "node:test";

const SECRET = "a".repeat(48);

// Mutated in place between tests — see the note in cron-route.test.mjs about
// why a reassigned outer variable would not be reflected.
const mockedServerEnv = { WEBSITE_INQUIRY_WEBHOOK_SECRET: SECRET };

let rpcImpl = async () => ({
  data: { status: "created", lead_id: "11111111-1111-4111-8111-111111111111" },
  error: null,
});
let rpcCalls = [];

mock.module("@/config/env.server", {
  namedExports: { serverEnv: mockedServerEnv },
});

mock.module("@/lib/supabase/admin", {
  namedExports: {
    createAdminClient: () => ({
      rpc: async (name, args) => {
        rpcCalls.push({ name, args });
        return rpcImpl(name, args);
      },
    }),
  },
});

const { POST, GET, PUT, DELETE } = await import(
  "../../../src/app/api/webhooks/website-inquiry/route.ts"
);

const VALID_PAYLOAD = {
  idempotencyKey: "8f14e45f-ceea-4d0d-a1b2-3c4d5e6f7a8b",
  submittedAt: "2026-08-17T09:00:00.000Z",
  fullName: "Ava Reyes",
  email: "ava@example.com",
  phone: null,
  businessOrganization: "Acme Studio",
  preferredContactMethod: "email",
  serviceNeeded: "website_development",
  estimatedBudget: "25000_50000",
  targetTimeline: "1_3_months",
  projectDescription: "Replace a manual booking workflow.",
};

function signedRequest(body, { secret = SECRET, header } = {}) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return new Request("http://localhost:3000/api/webhooks/website-inquiry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nexfora-signature": header ?? `t=${timestamp},v1=${signature}`,
    },
    body: rawBody,
  });
}

/** Captures console.error so PII assertions can inspect what was logged. */
function captureLogs(run) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => {
    lines.push(args.map((arg) => JSON.stringify(arg) ?? String(arg)).join(" "));
  };
  return Promise.resolve(run()).finally(() => {
    console.error = original;
  }).then((result) => ({ result, logged: lines.join("\n") }));
}

test.beforeEach(() => {
  mockedServerEnv.WEBSITE_INQUIRY_WEBHOOK_SECRET = SECRET;
  rpcCalls = [];
  rpcImpl = async () => ({
    data: {
      status: "created",
      lead_id: "11111111-1111-4111-8111-111111111111",
    },
    error: null,
  });
});

test("a correctly signed inquiry is ingested and reports its outcome", async () => {
  const response = await POST(signedRequest(VALID_PAYLOAD));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "created",
    leadId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "ingest_website_project_inquiry");
});

test("canonical website values are forwarded to the database unrewritten", async () => {
  await POST(signedRequest(VALID_PAYLOAD));
  const { args } = rpcCalls[0];

  // The route must not map enums itself — the migration is the single
  // authority for canonical -> OS normalization.
  assert.equal(args.p_service_needed, "website_development");
  assert.equal(args.p_estimated_budget, "25000_50000");
  assert.equal(args.p_target_timeline, "1_3_months");
  assert.equal(args.p_preferred_contact_method, "email");
  assert.equal(args.p_idempotency_key, VALID_PAYLOAD.idempotencyKey);
});

test("absent optional fields are sent as empty strings, matching the RPC contract", async () => {
  await POST(
    signedRequest({
      ...VALID_PAYLOAD,
      phone: null,
      businessOrganization: null,
      estimatedBudget: null,
      targetTimeline: null,
    }),
  );
  const { args } = rpcCalls[0];

  assert.equal(args.p_phone, "");
  assert.equal(args.p_business_organization, "");
  assert.equal(args.p_estimated_budget, "");
  assert.equal(args.p_target_timeline, "");
});

test("a replayed delivery reports duplicate rather than creating a second lead", async () => {
  rpcImpl = async () => ({
    data: {
      status: "duplicate",
      lead_id: "11111111-1111-4111-8111-111111111111",
    },
    error: null,
  });

  const response = await POST(signedRequest(VALID_PAYLOAD));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "duplicate");
});

test("an unsigned request is rejected without reaching the database", async () => {
  const response = await POST(
    new Request("http://localhost:3000/api/webhooks/website-inquiry", {
      method: "POST",
      body: JSON.stringify(VALID_PAYLOAD),
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("a request signed with the wrong secret is rejected", async () => {
  const response = await POST(
    signedRequest(VALID_PAYLOAD, { secret: "b".repeat(48) }),
  );

  assert.equal(response.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("a tampered body invalidates the signature", async () => {
  const request = signedRequest(VALID_PAYLOAD);
  const tampered = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ ...VALID_PAYLOAD, email: "attacker@example.com" }),
  });

  assert.equal((await POST(tampered)).status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("an unset secret fails closed instead of accepting every caller", async () => {
  mockedServerEnv.WEBSITE_INQUIRY_WEBHOOK_SECRET = undefined;

  const response = await POST(signedRequest(VALID_PAYLOAD));

  assert.equal(response.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("an authentic but invalid payload is rejected before the database", async () => {
  const response = await POST(
    signedRequest({ ...VALID_PAYLOAD, serviceNeeded: "seo_services" }),
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid_payload");
  assert.equal(rpcCalls.length, 0);
});

test("malformed JSON is rejected, not thrown", async () => {
  const response = await POST(signedRequest("{not json"));

  assert.equal(response.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("a database failure returns 5xx so the website retries rather than discards", async () => {
  rpcImpl = async () => ({ data: null, error: { code: "P0001" } });

  const response = await POST(signedRequest(VALID_PAYLOAD));

  // 4xx would tell a well-behaved caller "do not retry", silently losing a
  // real inquiry that the website has already committed and confirmed.
  assert.ok(response.status >= 500);
  assert.equal((await response.json()).error, "ingest_failed");
});

test("an unexpected RPC result is treated as a failure, not a success", async () => {
  rpcImpl = async () => ({ data: { status: "who_knows" }, error: null });

  assert.ok((await POST(signedRequest(VALID_PAYLOAD))).status >= 500);
});

test("a thrown client error is contained and never surfaces its message", async () => {
  rpcImpl = async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.1:5432");
  };

  const { result, logged } = await captureLogs(() =>
    POST(signedRequest(VALID_PAYLOAD)),
  );

  assert.ok(result.status >= 500);
  assert.equal((await result.json()).error, "ingest_failed");
  assert.ok(
    !logged.includes("ECONNREFUSED"),
    "the raw error message must not be logged",
  );
});

test("no applicant PII is written to the logs on any failure path", async () => {
  rpcImpl = async () => ({ data: null, error: { code: "23514" } });

  const cases = [
    () => POST(signedRequest(VALID_PAYLOAD)),
    () => POST(signedRequest({ ...VALID_PAYLOAD, email: "not-an-email" })),
    () => POST(signedRequest("{not json")),
  ];

  for (const run of cases) {
    const { logged } = await captureLogs(run);

    for (const secret of [
      VALID_PAYLOAD.fullName,
      VALID_PAYLOAD.email,
      VALID_PAYLOAD.businessOrganization,
      VALID_PAYLOAD.projectDescription,
      SECRET,
    ]) {
      assert.ok(
        !logged.includes(secret),
        `log must not contain "${secret}": ${logged}`,
      );
    }
  }
});

test("no response body ever echoes the submitted inquiry back", async () => {
  const responses = [
    await POST(signedRequest(VALID_PAYLOAD)),
    await POST(signedRequest({ ...VALID_PAYLOAD, fullName: "" })),
    await POST(signedRequest(VALID_PAYLOAD, { header: "garbage" })),
  ];

  for (const response of responses) {
    const body = await response.text();
    for (const value of [
      VALID_PAYLOAD.fullName,
      VALID_PAYLOAD.email,
      VALID_PAYLOAD.projectDescription,
    ]) {
      assert.ok(!body.includes(value), `response must not echo "${value}"`);
    }
  }
});

test("every other method is refused", async () => {
  for (const handler of [GET, PUT, DELETE]) {
    const response = await handler();
    assert.equal(response.status, 405);
  }
});
