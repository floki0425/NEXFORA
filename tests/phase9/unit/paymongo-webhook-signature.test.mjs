import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePaymongoSignatureHeader,
  verifyPaymongoWebhookSignature,
} from "../../../src/lib/paymongo/webhook-signature.ts";

const SECRET = "whsec_test_secret";

function signHeader(timestampSeconds, rawBody, secret = SECRET, field = "te") {
  const signature = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `t=${timestampSeconds},${field}=${signature}`;
}

test("a correctly signed, fresh request verifies successfully", () => {
  const rawBody = JSON.stringify({ data: { id: "evt_1" } });
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const header = signHeader(nowSeconds, rawBody);

  assert.equal(
    verifyPaymongoWebhookSignature(rawBody, header, SECRET, now),
    true,
  );
});

test("a request signed with the wrong secret fails verification", () => {
  const rawBody = JSON.stringify({ data: { id: "evt_1" } });
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const header = signHeader(nowSeconds, rawBody, "wrong_secret");

  assert.equal(
    verifyPaymongoWebhookSignature(rawBody, header, SECRET, now),
    false,
  );
});

test("a tampered body fails verification even with a validly-formatted header", () => {
  const originalBody = JSON.stringify({ data: { id: "evt_1" } });
  const tamperedBody = JSON.stringify({ data: { id: "evt_2" } });
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const header = signHeader(nowSeconds, originalBody);

  assert.equal(
    verifyPaymongoWebhookSignature(tamperedBody, header, SECRET, now),
    false,
  );
});

test("a missing signature header is rejected", () => {
  const rawBody = "{}";
  assert.equal(verifyPaymongoWebhookSignature(rawBody, null, SECRET), false);
});

test("an empty webhook secret is rejected outright, never treated as a wildcard match", () => {
  const rawBody = "{}";
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const header = signHeader(nowSeconds, rawBody, "");

  assert.equal(
    verifyPaymongoWebhookSignature(rawBody, header, "", now),
    false,
  );
});

test("a timestamp far in the past is rejected (replay protection)", () => {
  const rawBody = "{}";
  const now = new Date();
  const staleTimestamp = Math.floor(now.getTime() / 1000) - 60 * 60;
  const header = signHeader(staleTimestamp, rawBody);

  assert.equal(
    verifyPaymongoWebhookSignature(rawBody, header, SECRET, now),
    false,
  );
});

test("a malformed header with neither te nor li is rejected", () => {
  const rawBody = "{}";
  const now = Math.floor(Date.now() / 1000);
  assert.equal(
    verifyPaymongoWebhookSignature(rawBody, `t=${now}`, SECRET),
    false,
  );
});

test("parsePaymongoSignatureHeader extracts timestamp and both signature fields when present", () => {
  const parsed = parsePaymongoSignatureHeader("t=123,te=abc,li=def");
  assert.deepEqual(parsed, {
    timestamp: 123,
    testSignature: "abc",
    liveSignature: "def",
  });
});

test("parsePaymongoSignatureHeader returns null for a non-numeric timestamp", () => {
  assert.equal(parsePaymongoSignatureHeader("t=not-a-number,te=abc"), null);
});
