# AGENTS.md — NEXFORA OS

## 1. Purpose

This file defines how AI coding agents should work inside the **NEXFORA OS** repository.

NEXFORA OS is the internal business operating system for **Nexfora Digital Innovation**. It manages the full client lifecycle:

**Visitor → Lead → Qualification → Discovery → Proposal → Client → Project → Revision → Invoice → Deployment → Support → Maintenance**

Agents must prioritize:

1. Security
2. Correctness
3. Maintainability
4. Clear separation of concerns
5. Reusable architecture
6. Minimal duplication
7. Good client and admin UX
8. Safe database changes
9. Strong authorization
10. Incremental delivery

Do not make large architectural changes without first understanding the existing codebase.

---

# 2. Product Surfaces

NEXFORA OS has three primary surfaces.

## 2.1 Public Website

Purpose:

* Present Nexfora services
* Show portfolio and case studies
* Capture leads
* Run project inquiry flows
* Run project cost estimators
* Allow discovery call booking
* Convert visitors into qualified opportunities

Suggested routes:

```text
/
/solutions
/solutions/websites
/solutions/ecommerce
/solutions/booking-systems
/solutions/custom-software
/solutions/automation
/work
/work/[slug]
/industries
/process
/about
/insights
/contact
/start-a-project
/estimate
/book
```

## 2.2 Nexfora Admin OS

Purpose:

* CRM
* Lead management
* Client management
* Project management
* Proposal creation
* Invoicing
* Revision tracking
* File management
* Support tickets
* Maintenance subscriptions
* Reporting
* Internal notifications
* Team operations

Suggested routes:

```text
/admin
/admin/dashboard
/admin/leads
/admin/leads/[id]
/admin/clients
/admin/clients/[id]
/admin/projects
/admin/projects/[id]
/admin/proposals
/admin/proposals/[id]
/admin/invoices
/admin/invoices/[id]
/admin/revisions
/admin/tickets
/admin/files
/admin/calendar
/admin/reports
/admin/settings
```

## 2.3 Client Portal

Purpose:

* Let clients see only their own data
* Project overview
* Progress
* Milestones
* Files
* Revisions
* Invoices
* Messages
* Support
* Maintenance information

Suggested routes:

```text
/portal
/portal/projects
/portal/projects/[id]
/portal/files
/portal/revisions
/portal/invoices
/portal/support
/portal/settings
```

A client must never be able to access another client's records.

---

# 3. Core Product Flow

```text
PUBLIC WEBSITE
      ↓
PROJECT INQUIRY
      ↓
LEAD CREATED
      ↓
CRM PIPELINE
      ↓
DISCOVERY
      ↓
QUALIFICATION
      ↓
PROPOSAL
      ↓
ACCEPTED
      ↓
CLIENT CREATED
      ↓
PROJECT CREATED
      ↓
CLIENT PORTAL ACCESS
      ↓
PROJECT EXECUTION
      ↓
REVISION / FILE / PAYMENT MANAGEMENT
      ↓
DEPLOYMENT
      ↓
SUPPORT
      ↓
MAINTENANCE / RECURRING REVENUE
```

Agents must preserve this lifecycle when implementing new features.

---

# 4. Default Technical Direction

Unless the repository already defines another stack, prefer:

```text
Frontend:
Next.js
TypeScript
Tailwind CSS

Backend:
Next.js Server Actions / Route Handlers
or a dedicated API layer when complexity requires it

Database:
Supabase PostgreSQL

Authentication:
Supabase Auth

Storage:
Supabase Storage

Authorization:
PostgreSQL Row Level Security
Server-side authorization checks

Hosting:
Vercel

Email:
Resend

Payments:
PayMongo when Philippine payment support is required

Validation:
Zod

Forms:
React Hook Form or native server forms where appropriate

Analytics:
Google Analytics 4
Optional PostHog for product analytics

Monitoring:
Sentry or equivalent
```

Do not introduce additional infrastructure unless there is a clear requirement.

---

# 5. Agent Roles

## 5.1 Orchestrator Agent

Responsibilities:

* Understand the full requested feature
* Break work into safe implementation steps
* Identify dependencies
* Avoid duplicated work between agents
* Verify architecture compatibility
* Coordinate schema, frontend, backend, and testing changes
* Produce a final implementation summary

Before large changes, inspect:

```text
package.json
app/
src/
lib/
components/
supabase/
migrations/
types/
middleware
existing conventions
```

Do not guess the architecture.

## 5.2 Product / UX Agent

Responsibilities:

* Define user flows
* Define acceptance criteria
* Prevent unnecessary complexity
* Keep admin and client experiences separate
* Ensure actions are understandable to non-technical users
* Reduce excessive steps

Always think in terms of:

```text
User
→ Goal
→ Action
→ Feedback
→ Result
```

For every major action, define:

* Empty state
* Loading state
* Success state
* Error state
* Permission-denied state

## 5.3 Frontend Agent

Responsibilities:

* Build reusable UI components
* Maintain responsive layouts
* Use accessible semantic HTML
* Avoid giant components
* Keep business logic out of presentation components
* Preserve visual consistency
* Handle loading, error, and empty states

Preferred structure:

```text
components/
  ui/
  forms/
  dashboard/
  crm/
  projects/
  proposals/
  invoices/
  revisions/
  support/
```

Avoid:

* Huge single-page components
* Excessive inline styles
* Hardcoded repeated values
* Duplicated forms
* Business logic buried in JSX
* Unnecessary client components

Prefer server components where appropriate.

Use client components only when browser interactivity is required.

## 5.4 Backend Agent

Responsibilities:

* Implement business logic
* Enforce authorization
* Validate all input
* Avoid trusting client-side data
* Keep domain logic reusable
* Return structured errors

Every write operation must answer:

1. Who is performing the action?
2. Are they authorized?
3. Is the input valid?
4. Is the target resource owned by the correct organization/client?
5. Should an audit record be created?

Never rely only on hidden UI buttons for security.

## 5.5 Database Agent

Responsibilities:

* Design normalized schemas
* Create safe migrations
* Define indexes
* Add foreign keys
* Add constraints
* Configure RLS
* Avoid destructive changes without migration strategy

Prefer UUID primary keys unless the existing schema uses another convention.

Common timestamps:

```text
created_at
updated_at
deleted_at
```

Use soft delete only when business requirements justify it.

Never expose service-role credentials to the browser.

## 5.6 Security Agent

Responsibilities:

* Review authorization
* Review RLS
* Review file access
* Review secrets
* Review API exposure
* Review webhook validation
* Review role boundaries

Primary roles:

```text
super_admin
admin
project_manager
team_member
client
```

Do not trust role information stored in editable user metadata.

Prefer trusted server-side claims or controlled membership tables.

Required checks:

```text
authentication
role
organization membership
resource ownership
project membership
client ownership
```

## 5.7 QA Agent

Responsibilities:

* Test happy paths
* Test failure paths
* Test authorization boundaries
* Test responsive layouts
* Test forms
* Test status transitions
* Test database constraints
* Test duplicate submissions
* Test refresh/retry behavior

A feature is not complete only because it renders.

---

# 6. Domain Modules

Keep business domains separated.

Recommended modules:

```text
auth
organizations
users
leads
crm
clients
projects
tasks
milestones
proposals
contracts
invoices
payments
files
revisions
support
subscriptions
notifications
audit
analytics
settings
```

Do not create one universal business module containing unrelated logic.

---

# 7. Recommended Database Model

The exact schema may evolve, but preserve these boundaries.

## 7.1 organizations

```text
id
name
slug
logo_url
created_at
updated_at
```

## 7.2 profiles

```text
id
auth_user_id
full_name
avatar_url
phone
created_at
updated_at
```

## 7.3 organization_members

```text
id
organization_id
user_id
role
status
created_at
```

Possible internal roles:

```text
super_admin
admin
project_manager
team_member
```

## 7.4 leads

```text
id
organization_id
full_name
business_name
email
phone
industry
service_interest
problem_summary
budget_min
budget_max
target_timeline
source
status
lead_score
assigned_to
created_at
updated_at
```

Lead statuses:

```text
new
contacted
discovery
qualified
proposal
negotiation
won
lost
```

Do not use arbitrary free-text statuses.

## 7.5 lead_activities

```text
id
lead_id
type
title
description
created_by
created_at
```

Examples:

```text
inquiry_submitted
call_scheduled
note_added
email_sent
status_changed
proposal_created
proposal_sent
lead_won
```

## 7.6 clients

```text
id
organization_id
source_lead_id
business_name
contact_name
email
phone
industry
billing_address
status
created_at
updated_at
```

Do not duplicate lead and client records unnecessarily. Preserve the source relationship.

## 7.7 client_users

```text
id
client_id
user_id
role
created_at
```

Client roles:

```text
owner
manager
viewer
```

## 7.8 projects

```text
id
organization_id
client_id
name
slug
description
status
priority
start_date
target_date
completed_at
project_manager_id
progress_percent
created_at
updated_at
```

Project statuses:

```text
planning
design
development
integration
testing
client_review
deployment
completed
on_hold
cancelled
```

## 7.9 project_members

```text
id
project_id
user_id
role
created_at
```

## 7.10 milestones

```text
id
project_id
title
description
status
due_date
sort_order
created_at
updated_at
```

## 7.11 tasks

```text
id
project_id
milestone_id
title
description
status
priority
assigned_to
due_date
created_at
updated_at
```

Task statuses:

```text
todo
in_progress
blocked
review
done
```

## 7.12 proposals

```text
id
organization_id
lead_id
client_id
proposal_number
title
summary
status
currency
subtotal
discount
tax
total
valid_until
sent_at
accepted_at
declined_at
created_by
created_at
updated_at
```

Proposal statuses:

```text
draft
sent
viewed
accepted
changes_requested
declined
expired
```

## 7.13 proposal_items

```text
id
proposal_id
name
description
quantity
unit_price
sort_order
```

## 7.14 invoices

```text
id
organization_id
client_id
project_id
invoice_number
status
currency
subtotal
tax
discount
total
amount_paid
due_date
issued_at
paid_at
created_at
updated_at
```

Invoice statuses:

```text
draft
sent
partial
paid
overdue
void
```

## 7.15 payments

```text
id
invoice_id
provider
provider_reference
amount
currency
status
paid_at
created_at
```

Never mark an invoice paid based only on a client-side callback. Verify payment server-side.

## 7.16 project_files

```text
id
project_id
uploaded_by
file_name
storage_path
mime_type
file_size
visibility
created_at
```

Visibility:

```text
internal
client
```

Never expose internal files to clients.

## 7.17 revisions

```text
id
project_id
submitted_by
page_name
section_name
title
description
priority
status
assigned_to
created_at
updated_at
resolved_at
```

Revision statuses:

```text
submitted
reviewing
in_progress
ready_for_review
approved
rejected
closed
```

## 7.18 support_tickets

```text
id
client_id
project_id
ticket_number
title
description
category
priority
status
assigned_to
created_at
updated_at
resolved_at
```

Support statuses:

```text
open
assigned
in_progress
waiting_for_client
resolved
closed
```

## 7.19 subscriptions

```text
id
client_id
project_id
plan_name
status
billing_cycle
amount
currency
started_at
renewal_at
cancelled_at
created_at
```

## 7.20 audit_logs

```text
id
organization_id
actor_user_id
action
entity_type
entity_id
metadata
created_at
```

Audit examples:

```text
proposal_sent
proposal_accepted
invoice_created
payment_verified
client_created
project_deleted
role_changed
file_deleted
```

---

# 8. Authorization Rules

Authorization must exist at two levels:

```text
Application Layer
+
Database RLS
```

Do not rely on only one layer.

## 8.1 Admin Access

Internal users may access data only for organizations they belong to.

```text
user belongs to organization
AND
resource.organization_id matches membership.organization_id
```

## 8.2 Client Access

Clients may only access records linked to their own client account.

```text
authenticated user
→ client_users
→ client_id
→ project.client_id
```

Clients must never query unrestricted tables.

## 8.3 File Access

Use private storage buckets by default.

Generate signed URLs when necessary.

Do not store sensitive business files in a public bucket.

---

# 9. Lead Conversion Rules

Lead conversion is a controlled business action.

When a lead is marked `won`, the system may:

```text
1. Create client record if one does not exist
2. Link source_lead_id
3. Create project draft
4. Create client portal invitation
5. Create activity log
6. Update CRM status
```

This operation should be idempotent.

Running it twice must not create duplicate clients or projects.

---

# 10. Proposal Rules

Proposal creation must support:

```text
client / lead details
project summary
scope
deliverables
line items
timeline
payment schedule
terms
validity
versioning
status
```

Proposal numbers should be generated server-side.

Example:

```text
NXF-PROP-2026-0001
```

Never generate official sequential numbers only in the browser.

Accepted proposals should be immutable or versioned.

---

# 11. Invoice and Money Rules

Invoice numbers should be generated server-side.

Example:

```text
NXF-INV-2026-0001
```

Payment amounts must use precise numeric types.

Never use floating-point math for money.

Use:

```text
numeric / decimal
or integer minor units
```

Example:

```text
₱1,250.50
```

Store safely as decimal or centavo units.

---

# 12. Project Progress Rules

Do not calculate progress from arbitrary manual percentages if structured task data exists.

Preferred approach:

```text
completed weighted tasks
÷
total weighted tasks
```

or milestone-based calculation.

Manual progress override may exist only for authorized roles.

---

# 13. Revision Workflow

```text
submitted
   ↓
reviewing
   ↓
in_progress
   ↓
ready_for_review
   ↓
approved
   ↓
closed
```

Alternative branch:

```text
ready_for_review
   ↓
rejected
   ↓
in_progress
```

Every status change should be timestamped or included in activity history.

---

# 14. Support Workflow

```text
open
 ↓
assigned
 ↓
in_progress
 ↓
waiting_for_client
 ↓
resolved
 ↓
closed
```

Priority:

```text
low
medium
high
urgent
```

Do not use `urgent` for ordinary requests.

---

# 15. Notifications

Notifications should be event-driven.

Potential events:

```text
new_lead
lead_assigned
discovery_scheduled
proposal_sent
proposal_viewed
proposal_accepted
invoice_due
invoice_paid
revision_submitted
revision_ready
ticket_created
ticket_updated
project_milestone_completed
project_completed
```

Channels:

```text
in_app
email
optional SMS
```

Do not send duplicate notifications.

---

# 16. AI Features

AI may assist but must not silently make irreversible business decisions.

Allowed AI use cases:

```text
lead summary
lead scoring suggestion
proposal draft generation
meeting note summary
project scope draft
follow-up message draft
support ticket classification
revision summarization
client update generation
analytics summaries
```

Human approval required for:

```text
final pricing
proposal sending
invoice creation
payment decisions
client acceptance
contract terms
project deletion
role changes
```

Do not allow AI-generated output to bypass authorization or validation.

---

# 17. API Design Rules

Use consistent resource naming.

Good:

```text
/api/leads
/api/leads/[id]
/api/projects/[id]/tasks
```

Avoid:

```text
/api/getAllLeadDataNow
```

HTTP semantics:

```text
GET    read
POST   create
PATCH  partial update
PUT    full replacement when truly required
DELETE delete
```

Return predictable errors:

```json
{
  "error": {
    "code": "LEAD_NOT_FOUND",
    "message": "Lead not found."
  }
}
```

Do not expose stack traces to users.

---

# 18. Validation Rules

Validate all external input.

Use shared schemas where possible.

Validate:

```text
forms
API requests
server actions
webhooks
URL params
environment variables
```

Do not trust:

```text
query strings
form data
JSON requests
file uploads
payment callbacks
role values sent from browser
```

---

# 19. TypeScript Rules

Prefer strict TypeScript.

Avoid `any` unless unavoidable and documented.

Prefer `unknown`, then narrow safely.

Do not duplicate database types manually when generated types are available.

Use explicit return types for important domain functions.

---

# 20. Naming Rules

Variables:

```text
camelCase
```

Components:

```text
PascalCase
```

Database:

```text
snake_case
```

Constants:

```text
UPPER_SNAKE_CASE
```

Booleans:

```text
isActive
hasAccess
canEdit
shouldNotify
```

Avoid vague names such as `data`, `thing`, `item2`, `temp`, or `stuff` when a domain-specific name is available.

---

# 21. Component Rules

Good component boundaries:

```text
LeadCard
LeadPipeline
ProjectStatusBadge
ProposalSummary
InvoiceStatus
RevisionList
ClientProjectOverview
```

Avoid components like:

```text
MegaDashboardEverything.tsx
```

Components should have one clear purpose.

---

# 22. State Management

Prefer:

```text
server state from server
URL state for filters and pagination
local state for local UI
```

Do not introduce global state libraries unless necessary.

Avoid storing server-owned business data only in frontend global state.

---

# 23. Forms

Forms must support:

```text
validation
disabled submit while pending
error feedback
success feedback
duplicate submission protection
accessibility
```

Critical forms:

```text
project inquiry
lead edit
proposal create/edit
invoice create
revision submit
support ticket
client invitation
```

---

# 24. Search, Filtering, and Pagination

Large admin lists must not fetch unlimited rows.

Use:

```text
pagination
server-side filtering
search
sorting
```

Apply to:

```text
leads
clients
projects
proposals
invoices
tickets
audit logs
```

---

# 25. Performance Rules

Avoid:

```text
N+1 queries
fetching full records unnecessarily
huge client bundles
unoptimized images
blocking third-party scripts
unbounded database queries
```

Use indexes for commonly filtered fields:

```text
organization_id
client_id
project_id
status
created_at
assigned_to
email
```

---

# 26. SEO Rules for Public Website

Public pages should support:

```text
unique metadata
canonical URLs
Open Graph
Twitter metadata
structured data when appropriate
sitemap.xml
robots.txt
semantic headings
fast Core Web Vitals
```

Do not index:

```text
/admin
/portal
private proposal URLs
private invoice URLs
```

---

# 27. Accessibility Rules

All agents must consider:

```text
keyboard navigation
visible focus states
labels
semantic HTML
aria only when needed
contrast
form errors
button names
dialog focus management
```

Do not use clickable `<div>` elements when a button or link is appropriate.

---

# 28. Error Handling

User-facing errors must be clear.

Bad:

```text
Something went wrong.
```

Better:

```text
We couldn't save this proposal. Your changes are still on screen. Try again.
```

Log technical details server-side.

Never expose:

```text
database credentials
SQL errors
service role keys
stack traces
internal file paths
```

---

# 29. Environment Variables

Never hardcode secrets.

Typical variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

RESEND_API_KEY

PAYMONGO_SECRET_KEY
PAYMONGO_PUBLIC_KEY
PAYMONGO_WEBHOOK_SECRET

NEXT_PUBLIC_GA_MEASUREMENT_ID

SENTRY_DSN
```

Only variables intentionally safe for the browser should use a public prefix.

Never expose server secrets with a public prefix.

---

# 30. Migration Rules

Before adding a migration:

1. Inspect current schema
2. Check existing constraints
3. Check existing policies
4. Check production compatibility
5. Write a reversible strategy where practical
6. Add indexes when needed
7. Test existing data compatibility

Never casually:

```text
DROP TABLE
DROP COLUMN
change a data type destructively
disable RLS
```

without an explicit reason and migration plan.

---

# 31. Row Level Security Rules

All user-facing tables should have RLS enabled unless there is a strong documented reason otherwise.

Policies must be based on:

```text
authenticated user
organization membership
client membership
resource relationship
```

Avoid broad policies such as:

```sql
using (true)
```

for authenticated users.

Never assume frontend filters provide security.

---

# 32. Testing Priorities

## Authentication

```text
unauthenticated admin blocked
unauthenticated portal blocked
```

## Authorization

```text
client A cannot access client B
team member cannot perform admin-only action
admin cannot cross organization boundary
```

## CRM

```text
lead creation
status transitions
duplicate prevention
lead conversion
```

## Proposal

```text
draft
send
view
accept
changes requested
expiration
```

## Project

```text
create
assign
task update
progress
client visibility
```

## Invoice

```text
create
partial payment
paid
overdue
webhook verification
```

## Files

```text
upload
permission
signed download
internal visibility
```

## Revisions

```text
submit
assign
review
approve
reject
```

---

# 33. Git Rules

Use focused commits.

Examples:

```text
feat(crm): add lead qualification workflow
feat(proposals): add proposal acceptance flow
fix(auth): prevent client cross-account access
refactor(projects): extract milestone service
chore(db): add invoice status index
```

Avoid mixed commits containing unrelated changes.

Do not commit:

```text
.env
credentials
service keys
production exports
user-uploaded private files
```

---

# 34. Agent Execution Workflow

For every task:

## Step 1 — Understand

Inspect relevant files and existing patterns.

Do not guess architecture.

## Step 2 — Scope

Identify the smallest complete change.

## Step 3 — Plan

List:

```text
files affected
database changes
API changes
UI changes
security implications
tests required
```

## Step 4 — Implement

Keep changes focused.

## Step 5 — Validate

Run applicable:

```text
typecheck
lint
tests
build
migration checks
```

## Step 6 — Review

Check:

```text
security
permissions
loading states
errors
responsive behavior
duplication
```

## Step 7 — Report

Summarize:

```text
what changed
files changed
migration required
environment variables required
manual steps
known limitations
```

---

# 35. Rules for Parallel Agents

When multiple agents are used:

## Database Agent owns

```text
schema
migrations
RLS
indexes
generated types
```

## Backend Agent owns

```text
domain services
server actions
API routes
authorization
validation
```

## Frontend Agent owns

```text
components
pages
forms
UX
responsive states
```

## QA Agent owns

```text
tests
edge cases
regression checks
```

Agents should not independently create competing schemas or duplicate APIs.

Shared contracts must be agreed before implementation.

---

# 36. Feature Completion Definition

A feature is complete only when:

```text
✓ UI works
✓ backend works
✓ validation exists
✓ permissions are enforced
✓ database rules are correct
✓ loading state exists
✓ empty state exists
✓ error state exists
✓ responsive behavior works
✓ tests or manual verification completed
✓ no secrets exposed
✓ no obvious duplicate logic
```

---

# 37. MVP Priority

Build NEXFORA OS in this order.

## Phase 1 — Core Business Engine

```text
Authentication
Admin Dashboard
Smart Project Inquiry
Leads
CRM Pipeline
Discovery Notes
Clients
Basic Notifications
```

## Phase 2 — Sales Conversion

```text
Cost Estimator
Proposal Generator
Proposal Acceptance
Client Conversion
Client Invitations
```

## Phase 3 — Delivery

```text
Projects
Milestones
Tasks
Client Portal
Files
Revisions
Project Progress
```

## Phase 4 — Finance

```text
Invoices
Payment Tracking
PayMongo Integration
Payment Webhooks
Financial Dashboard
```

## Phase 5 — Post-Launch

```text
Support Tickets
Maintenance Plans
Subscriptions
Renewals
Service Hours
```

## Phase 6 — Intelligence & Automation

```text
AI Lead Summaries
AI Proposal Drafting
Follow-up Suggestions
Automated Notifications
Analytics
Lead Scoring
Business Reports
```

Do not build Phase 6 before the core data model is stable.

---

# 38. Important Product Principles

## 38.1 Do Not Overbuild

NEXFORA OS should solve real Nexfora operational problems first.

Avoid building SaaS-scale complexity before Nexfora needs it.

## 38.2 Build for Real Workflow

Every feature should answer:

```text
What manual Nexfora task does this replace?
```

If there is no clear answer, reconsider the feature.

## 38.3 Client Experience Matters

The portal should feel premium and simple.

Clients should never need technical knowledge to use it.

## 38.4 Internal Efficiency Matters

Common admin actions should require minimal clicks.

Examples:

```text
convert lead
send proposal
create project
request client files
send progress update
mark invoice paid
resolve revision
```

## 38.5 Data Must Be Traceable

Important events should have history.

Especially:

```text
lead status changes
proposal status
invoice status
payments
role changes
revisions
project status
support status
```

---

# 39. Things Agents Must Never Do

Never:

```text
disable authentication to make development easier
disable RLS permanently
expose service-role keys
trust client-provided role values
allow clients to query all projects
delete production data casually
modify payment status from browser only
hardcode business-critical pricing everywhere
create duplicate source-of-truth fields
silently change proposal totals
silently overwrite accepted proposals
store secrets in Git
ignore authorization because UI hides a route
```

---

# 40. Final Architectural Principle

NEXFORA OS should remain modular.

```text
Public Website
      ↓
Lead Acquisition
      ↓
CRM
      ↓
Sales
      ↓
Clients
      ↓
Projects
      ↓
Delivery
      ↓
Billing
      ↓
Support
```

Each module should communicate through explicit relationships and domain logic.

The long-term goal is for NEXFORA OS to become the operational backbone of Nexfora Digital Innovation while remaining maintainable enough to evolve into a broader SaaS platform later.

**Build for Nexfora first. Generalize only when real repeated patterns justify it.**
