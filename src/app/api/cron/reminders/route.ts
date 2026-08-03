import { NextResponse } from "next/server";

import { serverEnv } from "@/config/env.server";
import { verifyCronSecret } from "@/lib/reminders/cron-secret";
import { runReminders } from "@/lib/reminders/run-reminders";

export const runtime = "nodejs";

// Vercel Cron invokes the configured path with GET, not POST — see
// https://vercel.com/docs/cron-jobs (Vercel automatically attaches
// `Authorization: Bearer $CRON_SECRET` to that GET request when a project
// env var is named exactly CRON_SECRET). GET is therefore the path Vercel
// Cron actually reaches. POST is kept only as an authenticated manual/
// testing alias — e.g. curl during local/staging verification — and calls
// the exact same handler below; it must never carry different logic than
// GET.
//
// Same reasoning as src/app/api/webhooks/paymongo/route.ts otherwise: this
// route is called server-to-server (Vercel Cron, or the "Run reminders
// now" admin action's server-side call to the same shared runReminders()),
// never from a signed-in browser, so there is no Supabase Auth session to
// check — authentication is the shared CRON_SECRET instead, compared in
// constant time. Missing/invalid/unset CRON_SECRET all fail closed with
// 401. The received header value is never logged, in any environment.

function unauthorized(): Response {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

async function handleReminders(request: Request): Promise<Response> {
  if (!verifyCronSecret(request.headers.get("authorization"), serverEnv.CRON_SECRET)) {
    return unauthorized();
  }

  try {
    const summary = await runReminders();
    // Counts only — never entity data, per the Phase 11 handoff SS17
    // ("response body is counts only, never entity data").
    return NextResponse.json({
      raised:
        summary.raised.invoiceReminders +
        summary.raised.renewalReminders +
        summary.raised.leadFollowUps,
      sent: summary.sent,
      failed: summary.failed,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[cron-reminders] unexpected exception", {
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
      });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleReminders(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleReminders(request);
}

export async function PUT(): Promise<Response> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function DELETE(): Promise<Response> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
