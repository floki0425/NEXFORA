# DATABASE.md — NEXFORA OS

## 1. Purpose

This document defines the official database blueprint for **NEXFORA OS**.

It must be used together with:

- `AGENTS.md`
- `PRODUCT.md`
- `ARCHITECTURE.md`
- `DESIGN_SYSTEM.md`

The database is designed for:

- Nexfora internal operations
- Lead and CRM management
- Client management
- Project delivery
- Proposals
- Invoices and payments
- Files
- Revisions
- Support
- Maintenance subscriptions
- Notifications
- Audit history

Primary database:

```text
Supabase PostgreSQL
```

Primary goals:

```text
Security
Data integrity
Clear relationships
Scalability
Maintainability
Strong authorization
Future SaaS readiness without overengineering
```

---

# 2. Core Database Principles

All schema decisions should follow these rules:

1. Use UUID primary keys unless there is a strong reason not to.
2. Use foreign keys for all important relationships.
3. Add database constraints for business-critical rules.
4. Enable RLS on user-facing business tables.
5. Use timestamps consistently.
6. Avoid duplicated sources of truth.
7. Use enums or constrained status values for stable workflows.
8. Store money safely using numeric/decimal or integer minor units.
9. Keep private client data inaccessible by default.
10. Use soft-delete only where recovery or historical continuity matters.

---

# 3. Shared Timestamp Convention

Most business tables should include:

```sql
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Optional:

```sql
deleted_at timestamptz null
```

Use `deleted_at` only where business recovery or audit requirements justify it.

---

# 4. ID Convention

Use:

```sql
uuid primary key default gen_random_uuid()
```

Foreign keys should also use UUID.

Example:

```sql
organization_id uuid not null references organizations(id)
```

---

# 5. Database Modules

The schema is divided into modules:

```text
Identity
Organizations
Leads / CRM
Clients
Projects
Sales
Finance
Files
Revisions
Support
Subscriptions
Notifications
Audit
```

---

# 6. V0.1 Tables

Build these first:

```text
organizations
profiles
organization_members

leads
lead_activities

clients
client_users

projects
project_members
milestones
tasks
```

These are enough for:

```text
Authentication
Role-Based Access
Project Inquiry
CRM
Lead Activity
Client Conversion
Client Management
Basic Project Management
```

---

# 7. Later-Phase Tables

Do not build unless the roadmap requires them.

## V0.2

```text
proposals
proposal_items
proposal_versions
project_files
revisions
client_invitations
```

## V0.3

```text
invoices
invoice_items
payments
support_tickets
subscriptions
subscription_usage
```

## V0.4

```text
notifications
notification_deliveries
ai_runs
automation_rules
```

## Always Useful Once Core Is Stable

```text
audit_logs
```

---

# 8. Entity Relationship Overview

```text
ORGANIZATION
│
├── organization_members
│     └── profiles
│
├── leads
│     └── lead_activities
│
├── clients
│     ├── client_users
│     │     └── profiles
│     │
│     ├── projects
│     │     ├── project_members
│     │     ├── milestones
│     │     │     └── tasks
│     │     ├── project_files
│     │     ├── revisions
│     │     ├── invoices
│     │     │     ├── invoice_items
│     │     │     └── payments
│     │     └── support_tickets
│     │
│     ├── proposals
│     ├── subscriptions
│     └── support_tickets
│
└── audit_logs
```

---

# 9. organizations

Purpose:

Represents Nexfora and supports future multi-organization expansion.

For V0.1, there may only be one record:

```text
Nexfora Digital Innovation
```

Suggested schema:

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
unique(slug)
```

RLS intent:

- Internal users may read organizations they belong to.
- Public users should not query organization data unless explicitly required.

---

# 10. profiles

Purpose:

Stores application-level user profile data separate from Supabase Auth.

Suggested schema:

```sql
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  phone text,
  timezone text default 'Asia/Manila',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Important:

```text
auth.users
```

is the authentication source.

```text
profiles
```

is the application profile.

Do not store passwords in `profiles`.

---

# 11. organization_members

Purpose:

Connects internal team users to Nexfora.

Suggested schema:

```sql
create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null
    check (role in (
      'super_admin',
      'admin',
      'project_manager',
      'team_member'
    )),
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),

  unique (organization_id, user_id)
);
```

Indexes:

```text
organization_id
user_id
role
status
```

RLS intent:

- Internal users may read their own membership.
- Admin-level users may read organization members.
- Only authorized admins may change roles.

---

# 12. leads

Purpose:

Stores project inquiries and sales opportunities.

Suggested schema:

```sql
create table leads (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  full_name text not null,
  business_name text,
  email text not null,
  phone text,

  industry text,
  service_interest text,
  problem_summary text,
  requested_features jsonb default '[]'::jsonb,

  budget_min numeric(12,2),
  budget_max numeric(12,2),

  target_timeline text,

  source text,
  source_detail text,

  status text not null default 'new'
    check (status in (
      'new',
      'contacted',
      'discovery',
      'qualified',
      'proposal',
      'negotiation',
      'won',
      'lost'
    )),

  lead_score integer
    check (lead_score is null or lead_score between 0 and 100),

  assigned_to uuid
    references profiles(id) on delete set null,

  lost_reason text,

  converted_client_id uuid,
  converted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Important:

`converted_client_id` should later reference `clients(id)` after migration ordering allows it.

Alternative:

Add the foreign key in a follow-up migration.

Indexes:

```text
organization_id
status
assigned_to
email
created_at
source
```

Recommended composite indexes:

```sql
create index leads_org_status_idx
on leads (organization_id, status);

create index leads_org_created_idx
on leads (organization_id, created_at desc);
```

Public form restrictions:

Public users may create leads only through a controlled server action or public endpoint.

Public users must never be able to set:

```text
organization_id arbitrarily
status
lead_score
assigned_to
converted_client_id
converted_at
```

These are server-controlled.

---

# 13. Lead Source Values

Recommended controlled values:

```text
website
facebook
messenger
email
referral
networking
manual
existing_client
other
```

Prefer constrained values in application validation.

A database enum may be introduced later if stable.

---

# 14. lead_activities

Purpose:

Stores the operational timeline for a lead.

Suggested schema:

```sql
create table lead_activities (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  lead_id uuid not null
    references leads(id) on delete cascade,

  activity_type text not null,

  title text not null,
  description text,

  metadata jsonb not null default '{}'::jsonb,

  created_by uuid
    references profiles(id) on delete set null,

  created_at timestamptz not null default now()
);
```

Recommended activity types:

```text
inquiry_submitted
lead_created
status_changed
assigned
note_added
call_scheduled
email_sent
proposal_created
proposal_sent
proposal_viewed
proposal_accepted
lead_won
lead_lost
client_created
project_created
```

Indexes:

```text
lead_id
organization_id
created_at
activity_type
```

Recommended:

```sql
create index lead_activities_lead_created_idx
on lead_activities (lead_id, created_at desc);
```

---

# 15. clients

Purpose:

Represents actual customers.

A lead is not automatically a client.

Suggested schema:

```sql
create table clients (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  source_lead_id uuid
    references leads(id) on delete set null,

  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,

  industry text,
  website_url text,

  billing_address text,
  notes text,

  status text not null default 'active'
    check (status in (
      'active',
      'inactive',
      'archived'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```text
organization_id
source_lead_id
email
business_name
status
```

Business rule:

A client may have multiple projects.

---

# 16. Lead Conversion Constraint

After `clients` exists, add:

```sql
alter table leads
add constraint leads_converted_client_id_fkey
foreign key (converted_client_id)
references clients(id)
on delete set null;
```

Lead conversion should be idempotent.

A repeated conversion request must not create duplicate clients.

---

# 17. client_users

Purpose:

Links authenticated portal users to client accounts.

Suggested schema:

```sql
create table client_users (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null
    references clients(id) on delete cascade,

  user_id uuid not null
    references profiles(id) on delete cascade,

  role text not null default 'viewer'
    check (role in (
      'owner',
      'manager',
      'viewer'
    )),

  status text not null default 'active'
    check (status in (
      'active',
      'invited',
      'suspended'
    )),

  created_at timestamptz not null default now(),

  unique (client_id, user_id)
);
```

Indexes:

```text
client_id
user_id
status
```

Security:

Client access always resolves through this table.

---

# 18. projects

Purpose:

Stores client projects.

Suggested schema:

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  client_id uuid not null
    references clients(id) on delete restrict,

  name text not null,
  slug text,

  description text,

  status text not null default 'planning'
    check (status in (
      'planning',
      'design',
      'development',
      'integration',
      'testing',
      'client_review',
      'deployment',
      'completed',
      'on_hold',
      'cancelled'
    )),

  priority text not null default 'medium'
    check (priority in (
      'low',
      'medium',
      'high',
      'urgent'
    )),

  start_date date,
  target_date date,
  completed_at timestamptz,

  project_manager_id uuid
    references profiles(id) on delete set null,

  progress_percent integer not null default 0
    check (progress_percent between 0 and 100),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```text
organization_id
client_id
status
project_manager_id
target_date
created_at
```

Recommended composite indexes:

```sql
create index projects_org_status_idx
on projects (organization_id, status);

create index projects_client_created_idx
on projects (client_id, created_at desc);
```

---

# 19. Project Slug Rule

`slug` may be unique per organization:

```sql
unique (organization_id, slug)
```

Use slugs only for readable URLs.

Do not use slugs as security boundaries.

Always authorize by ID and ownership.

---

# 20. project_members

Purpose:

Assigns internal team members to projects.

Suggested schema:

```sql
create table project_members (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null
    references projects(id) on delete cascade,

  user_id uuid not null
    references profiles(id) on delete cascade,

  role text not null default 'member',

  created_at timestamptz not null default now(),

  unique (project_id, user_id)
);
```

Possible role values:

```text
project_manager
developer
designer
qa
content
member
```

Keep project role flexible initially.

Application permissions should still depend on organization role + project membership.

---

# 21. milestones

Purpose:

Groups project work into delivery stages.

Suggested schema:

```sql
create table milestones (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null
    references projects(id) on delete cascade,

  title text not null,
  description text,

  status text not null default 'pending'
    check (status in (
      'pending',
      'in_progress',
      'completed',
      'blocked'
    )),

  due_date date,

  sort_order integer not null default 0,

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```text
project_id
status
due_date
sort_order
```

---

# 22. tasks

Purpose:

Stores actionable project work.

Suggested schema:

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null
    references projects(id) on delete cascade,

  milestone_id uuid
    references milestones(id) on delete set null,

  title text not null,
  description text,

  status text not null default 'todo'
    check (status in (
      'todo',
      'in_progress',
      'blocked',
      'review',
      'done'
    )),

  priority text not null default 'medium'
    check (priority in (
      'low',
      'medium',
      'high',
      'urgent'
    )),

  assigned_to uuid
    references profiles(id) on delete set null,

  due_date date,

  sort_order integer not null default 0,

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```text
project_id
milestone_id
assigned_to
status
due_date
```

---

# 23. Project Progress

Recommended V0.1 approach:

Calculate from task completion when tasks exist.

Example:

```text
done tasks
÷
total eligible tasks
×
100
```

Later, add weighted progress if needed.

`progress_percent` on `projects` may be cached for dashboard speed.

If cached, update it through trusted server logic or a database function.

---

# 24. proposals

V0.2

Purpose:

Stores formal sales proposals.

Suggested schema:

```sql
create table proposals (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  lead_id uuid
    references leads(id) on delete set null,

  client_id uuid
    references clients(id) on delete set null,

  proposal_number text not null,

  title text not null,
  summary text,
  scope text,
  deliverables jsonb not null default '[]'::jsonb,
  timeline_text text,
  terms_text text,

  status text not null default 'draft'
    check (status in (
      'draft',
      'sent',
      'viewed',
      'accepted',
      'changes_requested',
      'declined',
      'expired'
    )),

  currency text not null default 'PHP',

  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,

  valid_until date,

  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,

  created_by uuid
    references profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, proposal_number)
);
```

Indexes:

```text
organization_id
lead_id
client_id
status
created_at
```

---

# 25. proposal_items

Purpose:

Structured proposal pricing.

Suggested schema:

```sql
create table proposal_items (
  id uuid primary key default gen_random_uuid(),

  proposal_id uuid not null
    references proposals(id) on delete cascade,

  name text not null,
  description text,

  quantity numeric(10,2) not null default 1,
  unit_price numeric(14,2) not null default 0,

  sort_order integer not null default 0,

  created_at timestamptz not null default now()
);
```

Totals must be calculated server-side.

---

# 26. proposal_versions

Optional V0.2+

Purpose:

Preserve history when proposals change after being sent.

Suggested fields:

```text
id
proposal_id
version_number
snapshot
created_by
created_at
```

Recommended schema:

```sql
create table proposal_versions (
  id uuid primary key default gen_random_uuid(),

  proposal_id uuid not null
    references proposals(id) on delete cascade,

  version_number integer not null,

  snapshot jsonb not null,

  created_by uuid
    references profiles(id) on delete set null,

  created_at timestamptz not null default now(),

  unique (proposal_id, version_number)
);
```

Accepted versions should be immutable.

---

# 27. client_invitations

V0.2

Purpose:

Securely invite client portal users.

Suggested schema:

```sql
create table client_invitations (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null
    references clients(id) on delete cascade,

  email text not null,
  role text not null default 'viewer',

  token_hash text not null unique,

  status text not null default 'pending'
    check (status in (
      'pending',
      'accepted',
      'expired',
      'revoked'
    )),

  expires_at timestamptz not null,
  accepted_at timestamptz,

  created_by uuid
    references profiles(id) on delete set null,

  created_at timestamptz not null default now()
);
```

Never store raw invitation tokens if a secure hash can be stored instead.

---

# 28. project_files

V0.2

Purpose:

Stores metadata for Supabase Storage files.

Suggested schema:

```sql
create table project_files (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  client_id uuid not null
    references clients(id) on delete cascade,

  project_id uuid
    references projects(id) on delete cascade,

  uploaded_by uuid
    references profiles(id) on delete set null,

  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,

  visibility text not null default 'internal'
    check (visibility in (
      'internal',
      'client'
    )),

  category text,

  created_at timestamptz not null default now()
);
```

Indexes:

```text
organization_id
client_id
project_id
visibility
created_at
```

Storage path example:

```text
organization/{organization_id}/client/{client_id}/project/{project_id}/{uuid}-{filename}
```

---

# 29. revisions

V0.2

Purpose:

Organizes client revision requests.

Suggested schema:

```sql
create table revisions (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  client_id uuid not null
    references clients(id) on delete cascade,

  project_id uuid not null
    references projects(id) on delete cascade,

  submitted_by uuid
    references profiles(id) on delete set null,

  page_name text,
  section_name text,

  title text not null,
  description text not null,

  priority text not null default 'medium'
    check (priority in (
      'low',
      'medium',
      'high',
      'urgent'
    )),

  status text not null default 'submitted'
    check (status in (
      'submitted',
      'reviewing',
      'in_progress',
      'ready_for_review',
      'approved',
      'rejected',
      'closed'
    )),

  assigned_to uuid
    references profiles(id) on delete set null,

  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```text
project_id
client_id
status
assigned_to
created_at
```

---

# 30. invoices

V0.3

Purpose:

Stores client invoices.

Suggested schema:

```sql
create table invoices (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  client_id uuid not null
    references clients(id) on delete restrict,

  project_id uuid
    references projects(id) on delete set null,

  invoice_number text not null,

  status text not null default 'draft'
    check (status in (
      'draft',
      'sent',
      'partial',
      'paid',
      'overdue',
      'void'
    )),

  currency text not null default 'PHP',

  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,

  issue_date date,
  due_date date,

  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, invoice_number)
);
```

Indexes:

```text
organization_id
client_id
project_id
status
due_date
created_at
```

---

# 31. invoice_items

Purpose:

Stores invoice line items.

Suggested schema:

```sql
create table invoice_items (
  id uuid primary key default gen_random_uuid(),

  invoice_id uuid not null
    references invoices(id) on delete cascade,

  name text not null,
  description text,

  quantity numeric(10,2) not null default 1,
  unit_price numeric(14,2) not null default 0,

  sort_order integer not null default 0,

  created_at timestamptz not null default now()
);
```

Invoice totals should be recalculated server-side.

---

# 32. payments

V0.3

Purpose:

Records client payments.

Suggested schema:

```sql
create table payments (
  id uuid primary key default gen_random_uuid(),

  invoice_id uuid not null
    references invoices(id) on delete restrict,

  provider text not null,

  provider_reference text,

  amount numeric(14,2) not null
    check (amount > 0),

  currency text not null default 'PHP',

  status text not null default 'pending'
    check (status in (
      'pending',
      'processing',
      'paid',
      'failed',
      'refunded',
      'cancelled'
    )),

  payment_method text,

  paid_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);
```

Indexes:

```text
invoice_id
provider_reference
status
created_at
```

Important:

Use server-side verification before setting:

```text
status = paid
```

---

# 33. support_tickets

V0.3

Purpose:

Tracks post-launch support requests.

Suggested schema:

```sql
create table support_tickets (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  client_id uuid not null
    references clients(id) on delete cascade,

  project_id uuid
    references projects(id) on delete set null,

  ticket_number text not null,

  title text not null,
  description text not null,

  category text,

  priority text not null default 'medium'
    check (priority in (
      'low',
      'medium',
      'high',
      'urgent'
    )),

  status text not null default 'open'
    check (status in (
      'open',
      'assigned',
      'in_progress',
      'waiting_for_client',
      'resolved',
      'closed'
    )),

  assigned_to uuid
    references profiles(id) on delete set null,

  created_by uuid
    references profiles(id) on delete set null,

  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, ticket_number)
);
```

Indexes:

```text
organization_id
client_id
project_id
status
priority
assigned_to
created_at
```

---

# 34. subscriptions

V0.3

Purpose:

Tracks recurring maintenance plans.

Suggested schema:

```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id) on delete cascade,

  client_id uuid not null
    references clients(id) on delete cascade,

  project_id uuid
    references projects(id) on delete set null,

  plan_name text not null,

  status text not null default 'active'
    check (status in (
      'trial',
      'active',
      'past_due',
      'paused',
      'cancelled',
      'expired'
    )),

  billing_cycle text not null
    check (billing_cycle in (
      'monthly',
      'quarterly',
      'yearly',
      'custom'
    )),

  amount numeric(14,2) not null default 0,
  currency text not null default 'PHP',

  included_hours numeric(8,2),

  started_at timestamptz,
  renewal_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

# 35. subscription_usage

Optional V0.3+

Purpose:

Tracks included support/development hours.

Suggested fields:

```text
id
subscription_id
description
hours_used
usage_date
created_by
created_at
```

---

# 36. notifications

V0.4 or earlier if needed

Purpose:

In-app notifications.

Suggested schema:

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid
    references organizations(id) on delete cascade,

  user_id uuid not null
    references profiles(id) on delete cascade,

  type text not null,
  title text not null,
  message text,

  entity_type text,
  entity_id uuid,

  read_at timestamptz,

  created_at timestamptz not null default now()
);
```

Indexes:

```text
user_id
read_at
created_at
```

---

# 37. notification_deliveries

Optional

Purpose:

Tracks external delivery attempts.

Suggested fields:

```text
id
notification_id
channel
provider
status
provider_reference
error_message
sent_at
created_at
```

Channels:

```text
email
sms
push
```

---

# 38. audit_logs

Purpose:

Stores sensitive system history.

Recommended once core mutations begin.

Suggested schema:

```sql
create table audit_logs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid
    references organizations(id) on delete set null,

  actor_user_id uuid
    references profiles(id) on delete set null,

  action text not null,

  entity_type text not null,
  entity_id uuid,

  metadata jsonb not null default '{}'::jsonb,

  ip_address inet,
  user_agent text,

  created_at timestamptz not null default now()
);
```

Examples:

```text
role.changed
invoice.voided
payment.recorded
proposal.accepted
project.deleted
file.deleted
client.archived
```

Indexes:

```text
organization_id
actor_user_id
entity_type
entity_id
action
created_at
```

Audit logs should normally be append-only.

---

# 39. ai_runs

Future

Purpose:

Track AI-assisted operations.

Suggested fields:

```text
id
organization_id
user_id
feature
entity_type
entity_id
model
input_summary
output_summary
status
created_at
```

Do not store sensitive raw prompts unnecessarily.

---

# 40. automation_rules

Future

Purpose:

Stores configurable operational automation.

Example:

```text
When lead.status becomes qualified
→ create follow-up reminder
```

Do not build in MVP.

---

# 41. Relationship Rules

## Organization

```text
Organization
1 → many Leads
1 → many Clients
1 → many Projects
1 → many Internal Members
```

## Client

```text
Client
1 → many Client Users
1 → many Projects
1 → many Proposals
1 → many Invoices
1 → many Support Tickets
1 → many Subscriptions
```

## Project

```text
Project
1 → many Project Members
1 → many Milestones
1 → many Tasks
1 → many Files
1 → many Revisions
1 → many Invoices
1 → many Support Tickets
```

---

# 42. Delete Behavior

Use deletion rules carefully.

Recommended:

## Organization

```text
cascade only for controlled non-production scenarios
```

Production organization deletion should normally be disabled.

## Client

Prefer archive instead of hard delete once projects/invoices exist.

## Project

Prefer archive/cancel instead of delete once business activity exists.

## Lead

Hard delete may be allowed only for spam or test entries by authorized users.

## Financial Records

Do not hard delete invoices or payments casually.

Use:

```text
void
refunded
cancelled
```

as status transitions instead.

---

# 43. Status Constraints

Use database checks for stable status workflows.

Examples:

```text
lead.status
project.status
task.status
proposal.status
invoice.status
revision.status
support_ticket.status
```

Do not allow arbitrary free text for core status fields.

---

# 44. Status Transition Validation

The database constrains valid values.

The application service layer should enforce valid transitions.

Example:

A proposal should not move directly:

```text
draft → accepted
```

unless explicitly allowed.

Recommended:

```text
draft
→ sent
→ viewed
→ accepted
```

Business transition logic belongs in domain services.

---

# 45. Money Storage

Use:

```sql
numeric(14,2)
```

for PHP values unless a stronger minor-unit strategy is adopted.

Never use floating-point types:

```text
real
double precision
```

for financial amounts.

---

# 46. Currency

Default:

```text
PHP
```

Store currency code explicitly on:

```text
proposals
invoices
payments
subscriptions
```

This preserves future multi-currency capability.

---

# 47. Number Generation

Proposal, invoice, and ticket numbers must be generated server-side.

Examples:

```text
NXF-PROP-2026-0001
NXF-INV-2026-0001
NXF-SUP-2026-0001
```

Do not generate sequential official numbers in the browser.

Consider a dedicated sequence table or database function later.

---

# 48. Search Fields

Likely search targets:

## Leads

```text
full_name
business_name
email
phone
```

## Clients

```text
business_name
contact_name
email
```

## Projects

```text
name
description
```

Use PostgreSQL search patterns first.

Do not introduce external search infrastructure early.

---

# 49. Index Strategy

Create indexes for:

```text
Foreign keys used in filtering
Status fields
Created timestamps
Assigned users
Due dates
Common search columns
```

Do not index every column.

Indexes increase write/storage cost.

---

# 50. Updated At Trigger

Recommended reusable trigger:

```sql
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

Apply to tables containing `updated_at`.

Example:

```sql
create trigger leads_set_updated_at
before update on leads
for each row
execute function set_updated_at();
```

---

# 51. RLS Strategy Overview

Enable RLS for business tables.

Main access models:

```text
Internal organization access
Client ownership access
Public controlled insert
```

Never rely only on frontend filtering.

---

# 52. Internal Organization RLS

Typical rule:

```text
current auth user
→ profiles.auth_user_id
→ organization_members
→ organization_id
```

Internal users may access rows only if they belong to the same organization.

---

# 53. Client RLS

Typical rule:

```text
current auth user
→ profiles
→ client_users
→ client_id
→ resource.client_id
```

This applies to:

```text
projects
project_files
revisions
invoices
support_tickets
```

Only expose fields clients are allowed to see.

Sometimes separate client-safe views may be better than direct table access.

---

# 54. Public Lead Submission

Prefer:

```text
Server Action
or
Controlled Route Handler
```

The server creates the lead.

Do not give anonymous users broad direct insert access to `leads` unless carefully constrained.

Safer approach:

```text
Public Form
↓
Server
↓
Validated Insert
```

---

# 55. RLS for organization_members

Users may:

```text
read their own membership
```

Admins may:

```text
read organization members
```

Only authorized roles may:

```text
insert
update roles
suspend
delete
```

---

# 56. RLS for leads

Internal members of the owning organization may read leads.

Write permissions should depend on role.

Clients have no access to leads.

Public users have no read access.

---

# 57. RLS for clients

Internal users:

```text
same organization
```

Client users:

```text
only their linked client record
```

Clients should not see internal notes fields if stored on the same table.

For sensitive separation, use:

```text
client-safe view
```

or separate internal notes table.

---

# 58. RLS for projects

Internal:

```text
organization membership
```

Client:

```text
project.client_id
must match client_users.client_id
```

Team member restrictions may later limit project access to `project_members`.

---

# 59. RLS for project_files

Internal files:

```text
visibility = internal
```

must never be exposed to client portal users.

Client files:

```text
visibility = client
```

still require client ownership validation.

---

# 60. RLS for invoices

Clients may read only invoices belonging to their client ID.

Clients should not update financial status directly.

Payment updates must be server-controlled.

---

# 61. RLS for revisions

Clients may:

```text
read revisions for own projects
create revision requests for own projects
```

Internal users manage workflow/status.

Clients should not assign internal staff.

---

# 62. RLS for support_tickets

Clients may:

```text
create tickets
read own tickets
add allowed replies later
```

Internal users manage status and assignment.

---

# 63. Sensitive Columns

Do not expose sensitive columns casually.

Examples:

```text
internal notes
lead score logic
staff assignments
payment metadata
audit logs
private file paths
service identifiers
```

Use explicit column selection.

---

# 64. Database Views

Use views when they simplify safe read models.

Possible future views:

```text
client_project_summary
admin_pipeline_summary
invoice_balance_summary
dashboard_metrics
```

Views should not bypass security unintentionally.

---

# 65. Database Functions

Good uses:

```text
atomic lead conversion
official number generation
payment reconciliation
project progress recalculation
```

Avoid putting simple CRUD logic into SQL without need.

---

# 66. Lead Conversion Function

Potential future RPC:

```text
convert_lead_to_client(lead_id)
```

Responsibilities:

```text
Verify lead
Check current status
Check existing converted_client_id
Create client if needed
Link lead
Set converted_at
Create activity
Return client ID
```

Must be idempotent.

---

# 67. Invoice Balance

Derived value:

```text
balance = total - amount_paid
```

Prefer calculation over storing duplicate balance unless performance requires caching.

If cached, enforce consistency.

---

# 68. Project Progress

Derived from:

```text
tasks
or milestones
```

Avoid allowing unrelated pages to write arbitrary progress.

Use one trusted calculation path.

---

# 69. JSONB Usage

Use JSONB for flexible supporting metadata.

Good:

```text
requested_features
metadata
proposal snapshot
provider response metadata
```

Do not use JSONB instead of relational tables for core entities.

Bad:

```text
all tasks stored as one JSON array
```

Tasks deserve a relational table.

---

# 70. Text vs Enum

Use text + check constraints initially when workflows may still evolve.

Example:

```sql
status text check (...)
```

Use PostgreSQL enums only when values are very stable.

---

# 71. Email Normalization

Store emails in lowercase where practical.

Validation/application logic should normalize:

```text
Josh@Example.com
→
josh@example.com
```

Do not rely on case-sensitive email comparisons.

---

# 72. Phone Storage

Store normalized phone text.

Do not assume all future numbers are Philippine-only.

Possible normalized form:

```text
+639123456789
```

Formatting should happen in UI.

---

# 73. Timezone

Use:

```text
timestamptz
```

for timestamps.

Display according to user/organization timezone.

Default:

```text
Asia/Manila
```

Do not store local timestamps without timezone for events.

---

# 74. Date vs Timestamp

Use `date` for:

```text
due_date
target_date
valid_until
```

Use `timestamptz` for:

```text
created_at
updated_at
sent_at
accepted_at
paid_at
```

---

# 75. Seed Data

V0.1 seed should create:

```text
Nexfora Digital Innovation organization
Initial super_admin membership
Optional development sample leads
Optional development sample client/project
```

Never seed production with fake customer records.

---

# 76. Development Fixtures

Use clearly marked fake data.

Example:

```text
Acme Demo Business
demo@example.com
```

Do not use real client data for local development unless securely authorized.

---

# 77. Migration Order

Recommended V0.1 migration sequence:

```text
001 extensions_and_helpers
002 organizations
003 profiles
004 organization_members
005 leads
006 lead_activities
007 clients
008 lead_client_conversion_fk
009 client_users
010 projects
011 project_members
012 milestones
013 tasks
014 indexes
015 rls_helpers
016 rls_policies
017 seed_dev_optional
```

Exact filenames may include timestamps.

---

# 78. Migration Rules

Every migration should:

```text
Be focused
Be reviewable
Avoid destructive changes
Handle existing data
Add indexes intentionally
Add constraints safely
Preserve RLS
```

Never manually patch production without recording the change in migrations.

---

# 79. Schema Change Workflow

```text
Update DATABASE.md if model changes
↓
Create migration
↓
Run locally
↓
Test data integrity
↓
Test RLS
↓
Regenerate TypeScript types
↓
Run tests
↓
Deploy staging
↓
Deploy production
```

---

# 80. Generated Types

After schema changes:

```text
Generate Supabase database types
```

Recommended location:

```text
src/types/database.ts
```

Do not hand-maintain duplicate database typings.

---

# 81. Foreign Key Behavior

Choose intentionally.

Use:

```text
on delete cascade
```

for dependent child records with no meaning without parent.

Examples:

```text
lead_activities → leads
milestones → projects
tasks → projects
```

Use:

```text
on delete restrict
```

for important business records where deletion should be blocked.

Examples:

```text
invoices → clients
```

Use:

```text
on delete set null
```

for historical references that can survive user deletion.

Examples:

```text
created_by
assigned_to
```

---

# 82. Data Retention

Future retention rules should cover:

```text
Lost leads
Inactive clients
Completed projects
Invoices
Payments
Audit logs
Uploaded files
AI logs
```

Financial and audit records may require longer retention.

Do not auto-delete important business history without policy.

---

# 83. Archiving

Prefer archival/status patterns for:

```text
Clients
Projects
Subscriptions
```

Examples:

```text
client.status = archived
project.status = completed
subscription.status = cancelled
```

---

# 84. Duplicate Detection

Potential duplicate checks:

## Leads

```text
email
phone
business_name
```

Do not automatically merge leads without human review.

## Clients

Use conversion logic to avoid duplicate client creation.

---

# 85. Concurrency

Critical operations should protect against race conditions.

Examples:

```text
Lead conversion
Proposal number generation
Invoice number generation
Payment webhook handling
```

Use:

```text
transactions
unique constraints
database functions
idempotency keys
```

---

# 86. Idempotency Keys

Future payment/webhook tables may include:

```text
provider_event_id
```

with unique constraint.

This prevents duplicate processing.

---

# 87. Public IDs vs Internal IDs

UUIDs are acceptable for internal references.

If public-facing short IDs are needed, add separate fields:

```text
proposal_number
invoice_number
ticket_number
```

Do not replace secure authorization with obscure IDs.

---

# 88. Activity History

Use activity tables where business users need timeline visibility.

V0.1:

```text
lead_activities
```

Future:

```text
project_activities
client_activities
```

Do not duplicate all audit logs into activity feeds.

---

# 89. Project Activity

Optional future table:

```text
project_activities
```

Suggested fields:

```text
id
project_id
activity_type
title
description
metadata
created_by
created_at
```

Add only when project history needs more than task/milestone timestamps.

---

# 90. Notes Architecture

Do not overload entity rows with unlimited note fields.

V0.1 may use:

```text
clients.notes
```

Later, create:

```text
notes
```

if multiple timestamped notes are required across entities.

Possible generic notes table:

```text
id
organization_id
entity_type
entity_id
body
created_by
created_at
```

Use carefully because generic polymorphic relationships lack database foreign-key enforcement.

Prefer entity-specific tables when integrity matters.

---

# 91. Client Internal Notes

If internal notes must never be client-visible, do not expose them through client-facing queries.

Best long-term design:

```text
client_internal_notes
```

separate from client-safe data.

---

# 92. Realtime

No schema changes are required for Realtime initially.

Do not enable realtime publication for every table.

Enable only for real use cases later.

---

# 93. Storage Buckets

Recommended:

```text
public-assets
project-files-private
```

Potential later:

```text
proposal-assets-private
invoice-files-private
```

Keep sensitive buckets private.

---

# 94. Storage Authorization

Storage access must mirror database ownership.

A signed URL should only be generated after:

```text
Authenticate
↓
Authorize Client/Project/File
↓
Generate Temporary URL
```

---

# 95. Backup Expectations

Production database must use provider backup capabilities.

Maintain:

```text
migration history
schema documentation
recovery instructions
```

Do not assume migrations alone are a full backup.

---

# 96. Data Export

Future export features:

```text
Lead CSV
Client CSV
Project report
Invoice export
```

Export queries must respect organization/client permissions.

---

# 97. Dashboard Queries

Avoid large multi-join dashboard queries in page components.

Create dedicated query functions.

Possible metrics:

```text
New leads
Active projects
Pipeline value
Pending proposals
Outstanding invoices
```

Consider database views or RPC only after query patterns stabilize.

---

# 98. Performance Rules

Avoid:

```text
select *
unbounded lists
N+1 queries
loading full activity histories by default
fetching files without pagination
```

Use:

```text
explicit columns
pagination
indexes
summary queries
```

---

# 99. Pagination Defaults

Suggested:

```text
20–50 records per page
```

Depending on module.

Use cursor pagination later if needed.

---

# 100. Security Checklist

Before a table is production-ready:

```text
✓ Primary key
✓ Foreign keys
✓ Constraints
✓ Indexes
✓ RLS enabled
✓ Read policy
✓ Write policy
✓ Delete behavior reviewed
✓ Sensitive columns reviewed
✓ Client isolation tested
✓ Cross-organization access tested
```

---

# 101. V0.1 Database Completion Checklist

The V0.1 database is complete when:

```text
✓ organizations exists
✓ profiles exists
✓ organization_members exists
✓ leads exists
✓ lead_activities exists
✓ clients exists
✓ client_users exists
✓ projects exists
✓ project_members exists
✓ milestones exists
✓ tasks exists

✓ All foreign keys are valid
✓ Core indexes exist
✓ RLS is enabled
✓ Internal role access works
✓ Client isolation works
✓ Lead conversion is safe
✓ Generated TypeScript types are updated
```

---

# 102. Tables Not To Build Yet

Do not prematurely add:

```text
payroll
employees HR records
inventory
chat messages
video calls
complex accounting ledger
marketing automation engine
generic CMS
multi-tenant billing
white-label themes
AI vector database
```

Unless a validated requirement appears.

---

# 103. Source of Truth Rules

Use one canonical source.

Examples:

```text
Client name
→ clients

Project client ownership
→ projects.client_id

Lead conversion
→ leads.converted_client_id

Invoice total
→ invoices + invoice_items

Project work
→ tasks / milestones
```

Do not duplicate business-critical fields across many tables without reason.

---

# 104. Database Decision Rule

Before adding a new table or field, ask:

```text
What business concept does this represent?
Who owns it?
Who can read it?
Who can edit it?
What is its lifecycle?
Does it duplicate existing data?
Does it need history?
Does it need indexing?
Does it affect RLS?
```

---

# 105. Final Database Principle

The NEXFORA OS database should remain:

```text
Relational
Explicit
Secure
Auditable
Easy to query
Easy to evolve
```

The governing database principle is:

**Model real Nexfora business relationships clearly. Protect client data by default. Add complexity only when real workflows require it.**
