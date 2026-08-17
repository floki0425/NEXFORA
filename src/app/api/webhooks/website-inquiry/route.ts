import { NextResponse } from "next/server";

import { serverEnv } from "@/config/env.server";
import { websiteInquiryPayloadSchema } from "@/features/leads/website-inquiry";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebsiteInquirySignature } from "@/lib/website-inquiry/signature";

export const runtime = "nodejs";

// OS-L1: the Nexfora public website forwards each project inquiry here AFTER
// it has already persisted the inquiry in its own (separate) Supabase
// project and sent its emails. The two systems share no database, so this is
// the only path between them.
//
// Authentication is the shared HMAC secret, not a Supabase Auth session —
// the caller is a server, not a signed-in browser — which is why the
// service-role admin client is the legitimate way to reach
// ingest_website_project_inquiry (granted to service_role only, never to
// anon or authenticated). Same reasoning as the PayMongo webhook route.
//
// Two invariants this handler exists to protect:
//
//   1. A failure here must never look like a failed inquiry to the visitor.
//      The website has already committed the record and confirmed to the
//      user before calling us. This route therefore reports its own status
//      honestly (5xx on a real failure so the website can retry) and the
//      website must treat any response as non-fatal to its own flow. See
//      the WEBSITE PATCH PLAN in docs/OS_L1_WEBSITE_INQUIRY_SYNC.md.
//
//   2. Retries must not create duplicate leads. Idempotency lives in the
//      database, keyed on the website's idempotency_key, so a replay returns
//      the original lead instead of a second one.
//
// PII discipline: no field of the payload — name, email, phone, business, or
// project description — is ever logged, in any environment. Only the
// outcome and a coarse stage are recorded.

interface IngestionResult {
  status?: string;
  lead_id?: string;
}

function logIngestionIssue(stage: string, code: string): void {
  console.error("[website-inquiry-webhook]", { stage, code });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  if (
    !verifyWebsiteInquirySignature(
      rawBody,
      request.headers.get("x-nexfora-signature"),
      serverEnv.WEBSITE_INQUIRY_WEBHOOK_SECRET,
    )
  ) {
    // Deliberately indistinguishable from "secret not configured" — a caller
    // must not be able to probe which of the two it is.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    logIngestionIssue("parse", "invalid_json");
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const payload = websiteInquiryPayloadSchema.safeParse(parsedBody);

  if (!payload.success) {
    // The field paths alone are safe to log; the values are not, so the
    // ZodError is never serialized and never returned to the caller.
    logIngestionIssue(
      "validation",
      payload.error.issues
        .map((issue) => issue.path.join("."))
        .slice(0, 10)
        .join(",") || "unknown_field",
    );
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const inquiry = payload.data;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc(
      "ingest_website_project_inquiry",
      {
        p_idempotency_key: inquiry.idempotencyKey,
        p_full_name: inquiry.fullName,
        p_email: inquiry.email,
        p_phone: inquiry.phone ?? "",
        p_business_organization: inquiry.businessOrganization ?? "",
        p_preferred_contact_method: inquiry.preferredContactMethod,
        p_service_needed: inquiry.serviceNeeded,
        p_estimated_budget: inquiry.estimatedBudget ?? "",
        p_target_timeline: inquiry.targetTimeline ?? "",
        p_project_description: inquiry.projectDescription,
        p_submitted_at: inquiry.submittedAt,
      },
    );

    if (error) {
      logIngestionIssue("ingest", error.code || "rpc_error");
      // 5xx, not 4xx: the payload was well formed and authentic, so this is
      // ours to fix and the website should retry rather than discard.
      return NextResponse.json({ error: "ingest_failed" }, { status: 502 });
    }

    const result = (data ?? {}) as IngestionResult;

    if (result.status !== "created" && result.status !== "duplicate") {
      logIngestionIssue("ingest", "unexpected_result");
      return NextResponse.json({ error: "ingest_failed" }, { status: 502 });
    }

    // Counts and status only — never the lead's contents. The lead id is
    // returned so the website can correlate its own retry logs, and is not
    // a secret: it is useless without an authorized OS session.
    return NextResponse.json({
      status: result.status,
      leadId: result.lead_id ?? null,
    });
  } catch (error) {
    logIngestionIssue(
      "ingest",
      error instanceof Error ? error.name : "unknown_error",
    );
    return NextResponse.json({ error: "ingest_failed" }, { status: 502 });
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function PUT(): Promise<Response> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}

export async function DELETE(): Promise<Response> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
