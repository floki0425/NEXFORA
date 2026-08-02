// Node.js module customization hook (see node:module `register()`) that
// teaches plain `node --test` how to resolve two things it otherwise
// cannot, so route-level tests can import and execute real production
// Route Handlers/Server Actions:
//
// 1. The `@/*` TypeScript path alias defined in tsconfig.json. Next.js and
//    tsc already understand this alias through their own bundlers/
//    resolvers; the test runner does not.
// 2. Next.js's extensionless deep imports (e.g. "next/server",
//    "next/headers"). The `next` package ships without a package.json
//    "exports" map, so webpack/Next resolve these via their own bundler
//    resolution, but plain Node ESM resolution requires an exact file
//    match and fails on the bare specifier.
//
// This file only affects module resolution for test runs — it does not
// change any production code path.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = fileURLToPath(new URL("../../src/", import.meta.url));

const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const relativePath = specifier.slice(2);

    for (const suffix of CANDIDATE_SUFFIXES) {
      const candidate = path.join(srcRoot, `${relativePath}${suffix}`);

      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }

    return nextResolve(specifier, context);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isMissingExtensionlessModule =
      error?.code === "ERR_MODULE_NOT_FOUND" && !path.extname(specifier);

    if (!isMissingExtensionlessModule) {
      throw error;
    }

    return nextResolve(`${specifier}.js`, context);
  }
}
