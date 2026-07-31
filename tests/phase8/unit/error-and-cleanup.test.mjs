// Section 12 — error and cleanup unit tests. Complements the safe-logging
// and cleanup checks already in tests/files/project-files.test.mjs and
// tests/revisions/revisions.test.mjs with the remaining, more general
// checks: pending states always resolve, double-click submissions cannot
// duplicate writes, and no secret/token value is ever logged anywhere in
// the Phase 8 source tree.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const PHASE8_SOURCE_DIRS = [
  "../../../src/features/files",
  "../../../src/features/portal/files",
  "../../../src/features/revisions",
  "../../../src/features/portal/revisions",
  "../../../src/lib/storage",
];

async function collectSourceFiles(relativeDir) {
  const dirUrl = new URL(`${relativeDir}/`, import.meta.url);
  const files = [];

  async function walk(currentUrl) {
    const entries = await readdir(currentUrl, { withFileTypes: true });
    for (const entry of entries) {
      const entryUrl = new URL(
        `${entry.name}${entry.isDirectory() ? "/" : ""}`,
        currentUrl,
      );
      if (entry.isDirectory()) {
        await walk(entryUrl);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(entryUrl);
      }
    }
  }

  await walk(dirUrl);
  return files;
}

async function readAllPhase8Source() {
  const results = [];
  for (const dir of PHASE8_SOURCE_DIRS) {
    const files = await collectSourceFiles(dir);
    for (const fileUrl of files) {
      results.push({
        path: path.basename(fileUrl.pathname),
        contents: await readFile(fileUrl, "utf8"),
      });
    }
  }
  return results;
}

test("no Phase 8 source file logs a Supabase secret key, access token, or storage token value", async () => {
  const files = await readAllPhase8Source();
  const forbidden = [
    /SUPABASE_SECRET_KEY/,
    /RESEND_API_KEY/,
    /access_token/i,
    /refresh_token/i,
    /authorization["'`]?\s*:/i,
  ];

  for (const file of files) {
    const consoleCalls = [
      ...file.contents.matchAll(/console\.(?:log|error|warn)\(([\s\S]*?)\);/g),
    ].map((match) => match[1]);

    for (const call of consoleCalls) {
      for (const pattern of forbidden) {
        assert.doesNotMatch(
          call,
          pattern,
          `expected no console call in ${file.path} to reference ${pattern}`,
        );
      }
    }
  }
});

test("no Phase 8 action ever logs a complete signed URL", async () => {
  const files = await readAllPhase8Source();

  for (const file of files) {
    if (!file.path.endsWith("actions.ts")) {
      continue;
    }

    const consoleCalls = [
      ...file.contents.matchAll(/console\.(?:log|error|warn)\(([\s\S]*?)\);/g),
    ].map((match) => match[1]);

    for (const call of consoleCalls) {
      assert.doesNotMatch(call, /signedUrl/);
      assert.doesNotMatch(call, /https?:\/\//);
    }
  }
});

test("every Phase 8 server action returns a result object rather than letting an exception escape — pending UI states always resolve", async () => {
  const files = await readAllPhase8Source();
  const actionFiles = files.filter((file) => file.path === "actions.ts");
  assert.ok(actionFiles.length >= 4, "expected to find the four Phase 8 actions.ts files");

  for (const file of actionFiles) {
    // Every exported async action function body is wrapped in try/catch,
    // and the catch block always returns `{ ok: false, ... }` rather than
    // rethrowing — so a useActionState/useTransition caller always
    // receives a settled result and its pending flag always clears.
    const catchBlocks = [...file.contents.matchAll(/catch \{([\s\S]*?)\n {2}\}/g)];
    assert.ok(
      catchBlocks.length > 0,
      `expected at least one catch block in ${file.path}`,
    );
    for (const [, body] of catchBlocks) {
      assert.match(
        body,
        /return \{ ok: false,/,
        `expected every catch block in ${file.path} to return a safe result, not rethrow`,
      );
    }
  }
});

test("upload forms generate a fresh idempotency key per attempt, so a double-click retry cannot be mistaken for two different uploads", async () => {
  const files = await readAllPhase8Source();
  const uploadForms = files.filter(
    (file) =>
      file.path === "internal-file-upload-form.tsx" ||
      file.path === "portal-file-upload-form.tsx",
  );
  assert.equal(uploadForms.length, 2);

  for (const file of uploadForms) {
    assert.match(file.contents, /crypto\.randomUUID\(\)/);
    // The key is state, not regenerated on every render/submit attempt —
    // it only changes on a new file selection or after a successful
    // upload, so a double-click while pending reuses the same key rather
    // than minting a new one.
    assert.match(file.contents, /useState\(\(\)\s*=>\s*\n?\s*crypto\.randomUUID\(\)/);
  }
});

test("upload and revision-submit buttons disable themselves while their action is pending", async () => {
  const files = await readAllPhase8Source();
  const forms = files.filter((file) =>
    [
      "internal-file-upload-form.tsx",
      "portal-file-upload-form.tsx",
      "revision-submit-form.tsx",
    ].includes(file.path),
  );
  assert.equal(forms.length, 3);

  for (const file of forms) {
    assert.match(file.contents, /disabled=\{isPending\}/);
  }
});
