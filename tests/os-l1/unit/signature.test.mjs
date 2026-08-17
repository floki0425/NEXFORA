import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";

import {
  parseWebsiteInquirySignatureHeader,
  verifyWebsiteInquirySignature,
} from "../../../src/lib/website-inquiry/signature.ts";

const SECRET = "a".repeat(48);
const NOW = new Date("2026-08-17T09:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const BODY = JSON.stringify({ idempotencyKey: "x", fullName: "Ava" });

function sign(body, secret = SECRET, timestamp = NOW_SECONDS) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("website inquiry signature parsing", () => {
  test("parses a well-formed header", () => {
    const parsed = parseWebsiteInquirySignatureHeader(sign(BODY));

    assert.equal(parsed.timestamp, NOW_SECONDS);
    assert.match(parsed.signature, /^[0-9a-f]{64}$/);
  });

  test("rejects headers that are missing or malformed", () => {
    for (const header of [
      "",
      "t=",
      "v1=abc",
      `t=not-a-number,v1=${"0".repeat(64)}`,
      `t=${NOW_SECONDS}`,
      `t=${NOW_SECONDS},v1=tooshort`,
      `t=${NOW_SECONDS},v1=${"Z".repeat(64)}`,
      `t=${NOW_SECONDS},v1=${"0".repeat(63)}`,
    ]) {
      assert.equal(
        parseWebsiteInquirySignatureHeader(header),
        null,
        `expected null for header: ${header}`,
      );
    }
  });

  test("a duplicated key does not override the first occurrence", () => {
    const valid = sign(BODY);
    const parsed = parseWebsiteInquirySignatureHeader(
      `${valid},t=${NOW_SECONDS + 9999}`,
    );

    assert.equal(parsed.timestamp, NOW_SECONDS);
  });
});

describe("website inquiry signature verification", () => {
  test("accepts a correctly signed body", () => {
    assert.equal(
      verifyWebsiteInquirySignature(BODY, sign(BODY), SECRET, NOW),
      true,
    );
  });

  test("rejects a body that was altered after signing", () => {
    const header = sign(BODY);
    const tampered = JSON.stringify({ idempotencyKey: "x", fullName: "Mallory" });

    assert.equal(
      verifyWebsiteInquirySignature(tampered, header, SECRET, NOW),
      false,
    );
  });

  test("rejects a signature made with a different secret", () => {
    assert.equal(
      verifyWebsiteInquirySignature(BODY, sign(BODY, "b".repeat(48)), SECRET, NOW),
      false,
    );
  });

  test("fails closed when the secret is not configured", () => {
    // An unset secret must never mean "skip the check" — this is the whole
    // reason WEBSITE_INQUIRY_WEBHOOK_SECRET is optional in env.server.ts.
    for (const secret of [undefined, ""]) {
      assert.equal(
        verifyWebsiteInquirySignature(BODY, sign(BODY), secret, NOW),
        false,
      );
    }
  });

  test("fails closed when the header is absent", () => {
    assert.equal(verifyWebsiteInquirySignature(BODY, null, SECRET, NOW), false);
  });

  test("rejects a replay outside the five-minute window", () => {
    const stale = NOW_SECONDS - 5 * 60 - 1;
    const future = NOW_SECONDS + 5 * 60 + 1;

    assert.equal(
      verifyWebsiteInquirySignature(BODY, sign(BODY, SECRET, stale), SECRET, NOW),
      false,
    );
    assert.equal(
      verifyWebsiteInquirySignature(BODY, sign(BODY, SECRET, future), SECRET, NOW),
      false,
    );
  });

  test("accepts clock skew at the edge of the window", () => {
    for (const timestamp of [NOW_SECONDS - 5 * 60, NOW_SECONDS + 5 * 60]) {
      assert.equal(
        verifyWebsiteInquirySignature(
          BODY,
          sign(BODY, SECRET, timestamp),
          SECRET,
          NOW,
        ),
        true,
      );
    }
  });

  test("a captured request cannot be re-dated to defeat the window", () => {
    // The timestamp is inside the signed string, so moving it forward
    // invalidates v1. This is the property that makes the skew check useful.
    const captured = parseWebsiteInquirySignatureHeader(
      sign(BODY, SECRET, NOW_SECONDS - 3600),
    );
    const reDated = `t=${NOW_SECONDS},v1=${captured.signature}`;

    assert.equal(
      verifyWebsiteInquirySignature(BODY, reDated, SECRET, NOW),
      false,
    );
  });
});
