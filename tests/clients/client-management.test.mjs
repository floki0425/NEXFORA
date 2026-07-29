import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canConvertLeadToClient,
  canManageClients,
  canMutateClient,
  canReadClient,
  isAllowedClientStatusEdit,
} from "../../src/features/clients/permissions.ts";
import {
  clientFiltersSchema,
  clientFormSchema,
} from "../../src/features/clients/schemas.ts";

const organizationA = "11111111-1111-4111-8111-111111111111";
const organizationB = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";
const convertedClientId = "44444444-4444-4444-8444-444444444444";

function context(overrides = {}) {
  return {
    organizationId: organizationA,
    profileId,
    role: "admin",
    status: "active",
    ...overrides,
  };
}

function validClientInput(overrides = {}) {
  return {
    businessName: "Acme Studio",
    contactName: "Ava Reyes",
    email: "ava@example.com",
    phone: "+639171234567",
    industry: "Professional services",
    websiteUrl: "https://example.com",
    billingAddress: "Makati City",
    notes: "Primary client contact.",
    status: "active",
    ...overrides,
  };
}

test("logged-out users cannot read or edit client records", () => {
  assert.equal(canReadClient(null, organizationA), false);
  assert.equal(canMutateClient(null, organizationA), false);
});

test("users without an active membership cannot access clients", () => {
  const inactive = context({ status: "inactive" });
  assert.equal(canReadClient(inactive, organizationA), false);
  assert.equal(canMutateClient(inactive, organizationA), false);
});

test("active members can read clients in their organization", () => {
  const teamMember = context({ role: "team_member" });
  assert.equal(canReadClient(teamMember, organizationA), true);
});

test("members cannot read or edit another organization's clients", () => {
  assert.equal(canReadClient(context(), organizationB), false);
  assert.equal(canMutateClient(context(), organizationB), false);
});

test("super admins and admins can convert eligible won leads", () => {
  assert.equal(canManageClients("super_admin"), true);
  assert.equal(canManageClients("admin"), true);
  assert.equal(canConvertLeadToClient("super_admin", "won", null), true);
  assert.equal(canConvertLeadToClient("admin", "won", null), true);
});

test("project managers and team members cannot convert leads", () => {
  assert.equal(canManageClients("project_manager"), false);
  assert.equal(canManageClients("team_member"), false);
  assert.equal(
    canConvertLeadToClient("project_manager", "won", null),
    false,
  );
  assert.equal(canConvertLeadToClient("team_member", "won", null), false);
});

test("a lead that is not won is ineligible for conversion", () => {
  assert.equal(canConvertLeadToClient("admin", "qualified", null), false);
  assert.equal(canConvertLeadToClient("admin", "lost", null), false);
});

test("an already-converted lead is ineligible for another conversion", () => {
  assert.equal(
    canConvertLeadToClient("admin", "won", convertedClientId),
    false,
  );
});

test("generic client editing cannot enter or leave archived status", () => {
  assert.equal(isAllowedClientStatusEdit("active", "inactive"), true);
  assert.equal(isAllowedClientStatusEdit("inactive", "active"), true);
  assert.equal(isAllowedClientStatusEdit("active", "archived"), false);
  assert.equal(isAllowedClientStatusEdit("archived", "active"), false);
  assert.equal(isAllowedClientStatusEdit("archived", "archived"), true);
});

test("valid client edits are accepted and emails are normalized", () => {
  const result = clientFormSchema.safeParse(
    validClientInput({ email: "  AVA@EXAMPLE.COM  " }),
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.email, "ava@example.com");
  }
});

test("invalid client input is rejected", () => {
  assert.equal(
    clientFormSchema.safeParse(
      validClientInput({
        businessName: "",
        contactName: "",
        email: "not-an-email",
        websiteUrl: "not-a-url",
        status: "deleted",
      }),
    ).success,
    false,
  );
});

test("client filters reject unsupported status values safely", () => {
  const filters = clientFiltersSchema.parse({
    query: "Acme",
    status: "deleted",
    page: "1",
  });

  assert.equal(filters.status, "");
  assert.equal(filters.query, "Acme");
});

test("migration enforces organization RLS and denies anonymous table access", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260730000000_phase_4_clients_conversion.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /alter table public\.clients enable row level security/i,
  );
  assert.match(migration, /clients_select_internal_members/i);
  assert.match(
    migration,
    /private\.is_internal_member\(clients\.organization_id\)/i,
  );
  assert.match(migration, /clients_update_client_managers/i);
  assert.match(migration, /array\['super_admin', 'admin'\]/i);
  assert.match(
    migration,
    /revoke all privileges\s+on table public\.clients\s+from public, anon, authenticated/is,
  );
  assert.doesNotMatch(migration, /grant (select|insert|update).*to anon/is);
  assert.doesNotMatch(migration, /create policy clients_delete/i);
});

test("database constraints and row locking prevent duplicate client creation", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260730000000_phase_4_clients_conversion.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /unique \(source_lead_id\)/i);
  assert.match(migration, /for update;/i);
  assert.match(
    migration,
    /if source_lead\.converted_client_id is not null then[\s\S]*select source_lead\.converted_client_id, false/is,
  );
});

test("conversion creates one explicitly mapped client and links the source lead", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260730000000_phase_4_clients_conversion.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /insert into public\.clients \(\s*organization_id,\s*source_lead_id,\s*business_name,\s*contact_name,\s*email,\s*phone,\s*industry,\s*status/is,
  );
  assert.match(
    migration,
    /converted_client_id = new_client_id,\s*converted_at = pg_catalog\.now\(\)/is,
  );
  assert.match(migration, /'client_created'/i);
  assert.match(
    migration,
    /jsonb_build_object\('client_id', new_client_id\)/i,
  );
});

test("conversion is one atomic database function and failures are not swallowed", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260730000000_phase_4_clients_conversion.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const conversionFunction = migration.slice(
    migration.indexOf(
      "create or replace function public.convert_lead_to_client",
    ),
    migration.indexOf(
      "revoke all on function public.convert_lead_to_client",
    ),
  );

  assert.match(conversionFunction, /security definer/i);
  assert.match(conversionFunction, /insert into public\.clients/i);
  assert.match(conversionFunction, /update public\.leads/i);
  assert.match(conversionFunction, /insert into public\.lead_activities/i);
  assert.doesNotMatch(conversionFunction, /exception\s+when others/i);
});

test("conversion function reauthorizes membership, role, organization, and eligibility", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260730000000_phase_4_clients_conversion.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /profile\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /membership\.status = 'active'/i);
  assert.match(migration, /organization\.status = 'active'/i);
  assert.match(migration, /actor_role not in \('super_admin', 'admin'\)/i);
  assert.match(
    migration,
    /lead\.organization_id = actor_organization_id/i,
  );
  assert.match(migration, /source_lead\.status <> 'won'/i);
  assert.match(
    migration,
    /grant execute on function public\.convert_lead_to_client\(uuid\)\s+to authenticated/is,
  );
});

test("client edit scopes queries and does not submit protected ownership fields", async () => {
  const actions = await readFile(
    new URL("../../src/features/clients/actions.ts", import.meta.url),
    "utf8",
  );
  const updatePayload = actions.slice(
    actions.indexOf("const updates: ClientUpdate"),
    actions.indexOf("const { data, error }", actions.indexOf("const updates: ClientUpdate")),
  );

  assert.match(actions, /\.eq\("organization_id", member\.organizationId\)/);
  assert.match(actions, /memberCanManageClients\(member\)/);
  assert.doesNotMatch(updatePayload, /organization_id/);
  assert.doesNotMatch(updatePayload, /source_lead_id/);
  assert.doesNotMatch(updatePayload, /created_at|updated_at/);
});

test("lead conversion action scopes the source lead to the actor's organization and role", async () => {
  const actions = await readFile(
    new URL("../../src/features/clients/actions.ts", import.meta.url),
    "utf8",
  );
  const conversionSection = actions.slice(
    actions.indexOf("export async function convertLeadToClientAction"),
  );

  assert.match(
    conversionSection,
    /\.eq\("organization_id", member\.organizationId\)/,
  );
  assert.match(conversionSection, /memberCanManageClients\(member\)/);
  assert.match(conversionSection, /canConvertLeadToClient\(/);
});

test("protected client routes inherit authenticated admin layout", async () => {
  const [layout, clientPage, clientDetail, clientEdit] = await Promise.all([
    readFile(new URL("../../src/app/admin/layout.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../../src/app/admin/clients/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/app/admin/clients/[clientId]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/app/admin/clients/[clientId]/edit/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(layout, /requireInternalMember\(\)/);
  assert.match(clientPage, /requireInternalMember\(\)/);
  assert.match(clientDetail, /requireInternalMember\(\)/);
  assert.match(clientEdit, /memberCanManageClients\(member\)/);
});
