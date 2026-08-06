"use server";

import { searchWorkspace } from "./queries.ts";
import type { SearchActionResult } from "./types.ts";

// Read-only server action. The search dialog is a Client Component and
// queries.ts is server-only, so the dialog reaches it through this thin
// wrapper rather than importing it directly -- the same bridge the
// notification bell uses (src/features/notifications/actions.ts).
//
// This action mutates nothing, never uses a service-role client, and returns
// only the four-state discriminated union. An unexpected throw becomes
// `error` rather than surfacing a stack trace to the browser.

export async function searchWorkspaceAction(
  query: string,
): Promise<SearchActionResult> {
  try {
    return await searchWorkspace(query);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("searchWorkspaceAction failed", error);
    }
    return { status: "error" };
  }
}
