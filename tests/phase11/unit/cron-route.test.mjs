// Route-level tests for src/app/api/cron/reminders/route.ts. Executes the
// real exported GET/POST/PUT/DELETE handlers rather than re-implementing
// their predicates, so a regression in the route's wiring (e.g. GET no
// longer authenticated, or POST diverging from GET) fails here even though
// verifyCronSecret's own logic is already covered by
// tests/phase11/unit/cron-secret.test.mjs.
//
// Follows the exact pattern established by tests/auth/callback-route.test.mjs:
// dependencies are replaced with in-process doubles via node:test's
// experimental mock.module(), resolved through
// tests/support/app-alias-loader.mjs so the "@/*" alias works under plain
// `node --test`. Run with --experimental-test-module-mocks --import
// ./tests/support/register-app-alias-loader.mjs (see package.json's
// test:phase11:unit script).
//
// serverEnv.CRON_SECRET is mocked directly (not set via process.env) because
// src/config/env.server.ts parses process.env exactly once at import time —
// there is no way to change it between tests once the module has loaded.

import assert from "node:assert/strict";
import test, { mock } from "node:test";

// A stable object reference, mutated in place between tests (rather than
// reassigned) — mock.module()'s namedExports binds this object to the
// module's `serverEnv` export exactly once, so relying on a freshly
// reassigned outer variable to be reflected later is not guaranteed;
// mutating this same object's property is.
const mockedServerEnv = { CRON_SECRET: "a".repeat(32) };
let runRemindersImpl = async () => {
  throw new Error("runReminders should not have been called");
};
let runRemindersCalls = 0;

mock.module("@/config/env.server", {
  namedExports: {
    serverEnv: mockedServerEnv,
  },
});

mock.module("@/lib/reminders/run-reminders", {
  namedExports: {
    runReminders: async (...args) => {
      runRemindersCalls += 1;
      return runRemindersImpl(...args);
    },
  },
});

const { GET, POST, PUT, DELETE } = await import(
  "../../../src/app/api/cron/reminders/route.ts"
);

function buildRequest(method, headers = {}) {
  return new Request("http://localhost:3000/api/cron/reminders", {
    method,
    headers,
  });
}

function primeReminders(impl) {
  runRemindersImpl =
    impl ??
    (async () => ({
      raised: { invoiceReminders: 1, renewalReminders: 2, leadFollowUps: 3 },
      sent: 4,
      failed: 0,
    }));
  runRemindersCalls = 0;
}

test.beforeEach(() => {
  mockedServerEnv.CRON_SECRET = "a".repeat(32);
  primeReminders();
});

test("valid GET with the correct Bearer secret runs the reminder handler and returns counts only", async () => {
  primeReminders(async () => ({
    raised: { invoiceReminders: 1, renewalReminders: 2, leadFollowUps: 3 },
    sent: 4,
    failed: 1,
  }));

  const response = await GET(
    buildRequest("GET", { authorization: `Bearer ${mockedServerEnv.CRON_SECRET}` }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(runRemindersCalls, 1);
  assert.deepEqual(body, { raised: 6, sent: 4, failed: 1 });
  // Counts only — no entity data (ids, emails, titles) in the response body.
  assert.deepEqual(Object.keys(body).sort(), ["failed", "raised", "sent"]);
});

test("GET with a missing Authorization header returns 401 and never calls the handler", async () => {
  const response = await GET(buildRequest("GET"));
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, { error: "unauthorized" });
  assert.equal(runRemindersCalls, 0);
});

test("GET with the wrong secret returns 401 and never calls the handler", async () => {
  const response = await GET(
    buildRequest("GET", { authorization: `Bearer ${"b".repeat(32)}` }),
  );

  assert.equal(response.status, 401);
  assert.equal(runRemindersCalls, 0);
});

test("GET fails closed with 401 when CRON_SECRET is unset, even with a well-formed header", async () => {
  mockedServerEnv.CRON_SECRET = undefined;

  const response = await GET(
    buildRequest("GET", { authorization: `Bearer ${"a".repeat(32)}` }),
  );

  assert.equal(response.status, 401);
  assert.equal(runRemindersCalls, 0);
});

test("the received secret is never present in any response body or header, on success or failure", async () => {
  const secret = mockedServerEnv.CRON_SECRET;
  const secretShapedHeader = `Bearer ${secret}`;

  const okResponse = await GET(buildRequest("GET", { authorization: secretShapedHeader }));
  const okBody = JSON.stringify(await okResponse.json());
  assert.doesNotMatch(okBody, new RegExp(secret));
  for (const [, value] of okResponse.headers) {
    assert.doesNotMatch(String(value), new RegExp(secret));
  }

  const wrongResponse = await GET(
    buildRequest("GET", { authorization: `Bearer ${"c".repeat(32)}` }),
  );
  const wrongBody = JSON.stringify(await wrongResponse.json());
  assert.doesNotMatch(wrongBody, new RegExp(secret));
});

test("POST with the correct secret calls the exact same handler as GET (identical response shape)", async () => {
  primeReminders(async () => ({
    raised: { invoiceReminders: 0, renewalReminders: 0, leadFollowUps: 0 },
    sent: 0,
    failed: 0,
  }));

  const response = await POST(
    buildRequest("POST", { authorization: `Bearer ${mockedServerEnv.CRON_SECRET}` }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(runRemindersCalls, 1);
  assert.deepEqual(body, { raised: 0, sent: 0, failed: 0 });
});

test("POST with a missing/wrong secret is denied exactly like GET", async () => {
  const missing = await POST(buildRequest("POST"));
  assert.equal(missing.status, 401);

  const wrong = await POST(
    buildRequest("POST", { authorization: `Bearer ${"d".repeat(32)}` }),
  );
  assert.equal(wrong.status, 401);
  assert.equal(runRemindersCalls, 0);
});

test("PUT and DELETE remain unavailable regardless of authorization", async () => {
  const putResponse = await PUT();
  assert.equal(putResponse.status, 405);

  const deleteResponse = await DELETE();
  assert.equal(deleteResponse.status, 405);

  assert.equal(runRemindersCalls, 0);
});

test("an exception from runReminders returns a generic 500, never the raw error message", async () => {
  primeReminders(async () => {
    throw new Error("some internal database detail that must not leak");
  });

  const response = await GET(
    buildRequest("GET", { authorization: `Bearer ${mockedServerEnv.CRON_SECRET}` }),
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: "internal_error" });
  assert.doesNotMatch(JSON.stringify(body), /internal database detail/);
});
