# ARCHITECTURE.md — NEXFORA OS

## 1. Purpose

This document defines the official technical architecture for **NEXFORA OS**.

All developers and AI agents must use this file together with:

- `AGENTS.md`
- `PRODUCT.md`
- `DESIGN_SYSTEM.md`

This document defines:

- Application boundaries
- Technology choices
- Folder structure
- Authentication architecture
- Authorization boundaries
- Database access patterns
- API and server-action rules
- Client portal isolation
- File storage strategy
- Notification architecture
- Deployment structure
- Observability
- Testing boundaries
- Future scaling strategy

The goal is to prevent inconsistent technical decisions and accidental overengineering.

---

# 2. Architectural Principle

NEXFORA OS should be built as a **modular monolith first**.

Do not begin with:

- Microservices
- Multiple independent backends
- Event streaming infrastructure
- Kubernetes
- Distributed queues
- Separate databases per module
- Premature SaaS multi-tenancy complexity

Preferred architecture:

```text
Next.js Application
        │
        ├── Public Website
        ├── Admin OS
        ├── Client Portal
        │
        ├── Server Actions / Route Handlers
        │
        ├── Domain Services
        │
        └── Supabase
              ├── PostgreSQL
              ├── Auth
              └── Storage
```

Keep deployment simple until real scale requires more.

---

# 3. Core Technology Stack

Unless an existing repository already uses another approved stack, use:

## Frontend

```text
Next.js
TypeScript
Tailwind CSS
```

## Backend

```text
Next.js Server Actions
Next.js Route Handlers
Domain service layer
```

## Database

```text
Supabase PostgreSQL
```

## Authentication

```text
Supabase Auth
```

## File Storage

```text
Supabase Storage
```

## Validation

```text
Zod
```

## Forms

```text
React Hook Form
or
Next.js Server Actions for simpler forms
```

## Email

```text
Resend
```

## Hosting

```text
Vercel
```

## Monitoring

Recommended:

```text
Sentry
```

## Analytics

Public website:

```text
Google Analytics 4
```

Optional future product analytics:

```text
PostHog
```

---

# 4. Application Surfaces

The product has three application surfaces.

```text
NEXFORA
│
├── Public Website
│
├── Admin OS
│
└── Client Portal
```

Each surface has different users, responsibilities, and authorization rules.

---

# 5. Public Website Architecture

Purpose:

- Marketing
- Lead generation
- Portfolio
- Services
- Project inquiry
- Cost estimator
- Discovery booking

Suggested route group:

```text
src/app/(public)/
```

Example routes:

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

Public pages should prioritize:

- SEO
- Performance
- Accessibility
- Conversion
- Fast loading
- Minimal JavaScript

Prefer Server Components by default.

---

# 6. Admin OS Architecture

Purpose:

- Internal Nexfora operations

Suggested route group:

```text
src/app/admin/
```

Routes:

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
/admin/support
/admin/files
/admin/reports
/admin/settings
```

All admin routes must require:

```text
Authenticated User
+
Valid Internal Role
+
Organization Membership
```

Do not rely only on route hiding.

---

# 7. Client Portal Architecture

Purpose:

- Give each client a secure view of their own projects and business data

Suggested route group:

```text
src/app/portal/
```

Routes:

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

Client access must always be derived from:

```text
auth user
→ client_users
→ client_id
→ permitted resources
```

A client must never access another client's data.

---

# 8. Recommended Repository Structure

```text
nexfora-os/
│
├── AGENTS.md
├── PRODUCT.md
├── DESIGN_SYSTEM.md
├── ARCHITECTURE.md
├── DATABASE.md
├── USER_FLOWS.md
├── FEATURES.md
├── ROADMAP.md
│
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   ├── admin/
│   │   ├── portal/
│   │   ├── auth/
│   │   └── api/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── forms/
│   │   ├── dashboard/
│   │   ├── crm/
│   │   ├── clients/
│   │   ├── projects/
│   │   ├── proposals/
│   │   ├── invoices/
│   │   ├── revisions/
│   │   └── support/
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── organizations/
│   │   ├── leads/
│   │   ├── crm/
│   │   ├── clients/
│   │   ├── projects/
│   │   ├── proposals/
│   │   ├── invoices/
│   │   ├── revisions/
│   │   ├── support/
│   │   └── notifications/
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   ├── auth/
│   │   ├── permissions/
│   │   ├── validation/
│   │   ├── email/
│   │   ├── payments/
│   │   ├── logger/
│   │   └── utils/
│   │
│   ├── types/
│   ├── config/
│   └── styles/
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── functions/
│
├── public/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── package.json
```

---

# 9. Feature Module Structure

Each feature should own its business logic.

Example:

```text
src/features/leads/
│
├── components/
├── actions/
├── queries/
├── schemas/
├── services/
├── types/
└── utils/
```

Recommended responsibilities:

```text
components/
UI specific to the feature

actions/
Server actions

queries/
Read operations

schemas/
Zod validation schemas

services/
Business rules

types/
Feature-specific types

utils/
Pure helper functions
```

Do not create one giant global service file.

---

# 10. Shared UI vs Domain UI

Shared components:

```text
src/components/ui/
```

Examples:

```text
Button
Input
Card
Table
Dialog
Badge
Tabs
Toast
```

Domain-specific components:

```text
src/components/crm/
src/components/projects/
src/components/proposals/
```

Examples:

```text
LeadPipeline
ProjectProgress
ProposalSummary
InvoiceStatus
```

Do not move domain-specific logic into generic UI components.

---

# 11. Server Components

Use Server Components by default for:

- Data-heavy pages
- Dashboard summaries
- Lists
- Detail pages
- Public marketing pages
- SEO content

Advantages:

```text
Less client JavaScript
Safer data fetching
Better performance
Simpler authorization
```

Do not add `"use client"` unless needed.

---

# 12. Client Components

Use Client Components for:

- Drag and drop
- Complex forms
- Interactive filters
- Modals
- Drawers
- Optimistic interactions
- Local browser state
- Realtime subscriptions where justified

Keep client components as small as possible.

---

# 13. Data Fetching Strategy

Preferred read flow:

```text
Page / Server Component
        ↓
Feature Query
        ↓
Supabase Server Client
        ↓
PostgreSQL
```

Example:

```text
page.tsx
↓
getLeadById()
↓
Supabase
```

Do not fetch private business data directly from the browser unless required.

---

# 14. Write Strategy

Preferred write flow:

```text
Form / UI
↓
Server Action or Route Handler
↓
Validate Input
↓
Authorize User
↓
Call Domain Service
↓
Database Mutation
↓
Audit / Activity
↓
Revalidate
```

Every mutation must perform validation and authorization server-side.

---

# 15. Server Actions vs Route Handlers

## Use Server Actions for:

- Internal forms
- Admin mutations
- Client portal mutations
- Simple authenticated operations

Examples:

```text
Create Lead Note
Update Lead Status
Create Project
Submit Revision
```

## Use Route Handlers for:

- Public API endpoints
- External integrations
- Webhooks
- OAuth callbacks
- File processing callbacks
- Payment providers

Examples:

```text
/api/webhooks/paymongo
/api/public/inquiry
```

Do not expose internal business mutations as public APIs unnecessarily.

---

# 16. Authentication Architecture

Use Supabase Auth.

Flow:

```text
User
↓
Supabase Auth
↓
Session
↓
Application Membership Lookup
↓
Role / Ownership Check
↓
Authorized Route
```

Authentication answers:

> Who is the user?

Authorization answers:

> What is the user allowed to do?

Do not confuse these.

---

# 17. Profile Architecture

Authentication user and application profile should be separated.

```text
auth.users
        │
        ↓
profiles
```

Suggested:

```text
profiles
- id
- auth_user_id
- full_name
- avatar_url
- phone
```

Do not store all business permissions only in auth user metadata.

---

# 18. Internal Membership Architecture

Use:

```text
organization_members
```

Relationship:

```text
User
↓
Organization Membership
↓
Role
```

Example:

```text
Joshua
↓
Nexfora Digital Innovation
↓
super_admin
```

This allows future team members without restructuring auth.

---

# 19. Client Membership Architecture

Use:

```text
client_users
```

Relationship:

```text
Auth User
↓
Client User Membership
↓
Client
↓
Projects / Files / Invoices / Support
```

This is the foundation of client isolation.

---

# 20. Authorization Layer

Authorization must exist in two places:

```text
Application Authorization
+
Database RLS
```

Application checks improve:

- UX
- Error handling
- Business logic

RLS protects:

- Direct database access
- Mistakes
- Unauthorized queries

Never rely on frontend filters.

---

# 21. Permission Helpers

Create reusable permission helpers.

Examples:

```text
requireUser()
requireInternalMember()
requireRole()
requireClientMembership()
canAccessProject()
canManageLead()
canViewInvoice()
```

Avoid repeating permission logic in every page.

---

# 22. Role Model

Initial internal roles:

```text
super_admin
admin
project_manager
team_member
```

Client roles:

```text
owner
manager
viewer
```

Do not hardcode permission checks everywhere like:

```text
if role === "admin"
```

Prefer centralized permission maps.

---

# 23. Database Architecture

Primary database:

```text
PostgreSQL
via Supabase
```

Core modules:

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

proposals
proposal_items

invoices
payments

project_files

revisions

support_tickets

subscriptions

notifications

audit_logs
```

Full field definitions belong in `DATABASE.md`.

---

# 24. Database Access Rules

Use:

- Server-side Supabase client for authenticated operations
- Generated database types
- Explicit selects
- Safe filters
- Pagination

Avoid:

```text
select *
```

when only a few columns are needed.

Avoid unbounded queries.

---

# 25. Supabase Client Separation

Recommended:

```text
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/admin.ts
```

## Browser Client

Uses:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Server Client

Uses user session and cookies.

## Admin Client

Uses service role key.

Only use admin client for trusted server-side operations.

Never import admin client into Client Components.

---

# 26. Service Role Rule

`SUPABASE_SERVICE_ROLE_KEY` must:

- Exist only on server
- Never use `NEXT_PUBLIC_`
- Never be sent to browser
- Never be committed
- Never be logged

Use it only when bypassing RLS is explicitly required.

Default to normal authenticated access.

---

# 27. RLS Architecture

RLS must be enabled for user-facing business tables.

Common policy concepts:

```text
Internal user:
organization membership matches organization_id

Client:
client_users membership matches client_id

Project:
project.client_id is accessible to current client

Files:
visibility + ownership relationship
```

Avoid:

```sql
using (true)
```

for authenticated users.

---

# 28. Lead Architecture

Public inquiry:

```text
Visitor
↓
Validated Public Submission
↓
Lead Record
↓
Lead Activity
↓
Internal Notification
```

Public submission should not allow arbitrary fields like:

```text
status
assigned_to
lead_score
organization_id
```

These must be server-controlled.

---

# 29. Lead Conversion Architecture

Conversion flow:

```text
Lead marked won
↓
Conversion service
↓
Check existing client
↓
Create or link client
↓
Create project draft if requested
↓
Create activity records
↓
Return conversion result
```

Must be idempotent.

Do not duplicate client records on repeated requests.

---

# 30. Project Architecture

Relationship:

```text
Client
└── Project
    ├── Members
    ├── Milestones
    ├── Tasks
    ├── Files
    ├── Revisions
    ├── Invoices
    └── Support
```

One client may have many projects.

One project belongs to one primary client.

---

# 31. Proposal Architecture

Proposal data should be structured.

```text
Proposal
├── Metadata
├── Scope
├── Line Items
├── Terms
└── Status History
```

Accepted proposals should be treated as business records.

Do not silently edit accepted proposals.

Use versioning or create a replacement proposal.

---

# 32. Invoice Architecture

Invoices:

```text
Client
↓
Project
↓
Invoice
↓
Payments
```

Money must use:

```text
numeric / decimal
or integer minor units
```

Never use floating-point arithmetic for billing.

---

# 33. Payment Architecture

Initial:

```text
Manual Payment Recording
```

Future:

```text
PayMongo
```

Flow:

```text
Payment Provider
↓
Webhook
↓
Verify Signature
↓
Find Payment / Invoice
↓
Update Payment Status
↓
Recalculate Invoice
↓
Audit Log
↓
Notification
```

Never mark invoices paid using only a browser redirect.

---

# 34. File Storage Architecture

Use Supabase Storage.

Recommended buckets:

```text
project-files-private
public-assets
```

Private files should include:

- Contracts
- Client files
- Internal documents
- Project assets
- Invoices
- Sensitive deliverables

Use signed URLs for temporary access.

---

# 35. File Metadata

Store metadata in PostgreSQL:

```text
project_files
```

Storage contains bytes.

Database contains:

```text
ownership
visibility
file_name
mime_type
size
uploader
project
created_at
```

Do not rely only on folder names for authorization.

---

# 36. File Path Strategy

Example:

```text
organization/{organization_id}/client/{client_id}/project/{project_id}/{uuid}-{filename}
```

Never trust user-provided filenames as unique identifiers.

---

# 37. Notification Architecture

Use database-backed notification records.

```text
Domain Event
↓
Notification Service
├── In-App
├── Email
└── Future SMS
```

Example events:

```text
lead.created
proposal.sent
proposal.accepted
invoice.due
invoice.paid
revision.created
ticket.created
project.completed
```

Do not tightly couple business logic directly to one email provider.

---

# 38. Email Architecture

Use Resend through a centralized email service.

Recommended:

```text
src/lib/email/
```

Responsibilities:

- Templates
- Sender configuration
- Retry-safe sending
- Logging
- Error handling

Do not send emails directly from arbitrary components.

---

# 39. Event Naming

Use predictable event names.

Examples:

```text
lead.created
lead.status_changed
client.created
project.created
project.completed
proposal.sent
proposal.accepted
invoice.sent
payment.verified
revision.created
ticket.created
```

Events should describe completed facts.

---

# 40. Activity vs Audit Logs

These are different.

## Activity Timeline

User-facing operational history.

Examples:

```text
Lead contacted
Proposal sent
Project moved to development
```

## Audit Log

Security-sensitive system history.

Examples:

```text
Role changed
Invoice voided
Payment manually recorded
File deleted
```

Do not combine them into one generic table without clear reason.

---

# 41. Caching Strategy

Use caching carefully.

Public pages:

- Static where possible
- Revalidation when content changes

Private application pages:

- Prefer fresh server data
- Avoid caching permission-sensitive data globally

Never cache private client data in a way that can leak across users.

---

# 42. Revalidation Strategy

After writes:

```text
revalidatePath()
or
revalidateTag()
```

Use precise invalidation.

Do not invalidate the entire site for small updates.

---

# 43. Realtime Strategy

Do not use Supabase Realtime everywhere by default.

Use only where it provides real value.

Possible future uses:

```text
Live notifications
Ticket updates
Project status
Team activity
```

Most CRUD pages can use normal request/response flow.

---

# 44. Search Architecture

Initial:

```text
PostgreSQL filters
ILIKE
indexed fields
```

Future:

```text
PostgreSQL full-text search
```

Do not introduce Elasticsearch or external search infrastructure until required.

---

# 45. Pagination

Use server-side pagination for:

```text
Leads
Clients
Projects
Proposals
Invoices
Tickets
Audit Logs
```

Avoid loading thousands of records into browser memory.

---

# 46. Error Architecture

Use structured errors.

Example domain errors:

```text
NOT_AUTHENTICATED
FORBIDDEN
LEAD_NOT_FOUND
CLIENT_NOT_FOUND
PROJECT_NOT_FOUND
DUPLICATE_CLIENT
INVALID_STATUS_TRANSITION
```

User interface should receive safe messages.

Technical details should be logged server-side.

---

# 47. Logging

Use structured server logging.

Log:

```text
request context
user id
organization id
action
resource
error code
```

Do not log:

```text
passwords
service keys
full card data
sensitive tokens
private document contents
```

---

# 48. Observability

Recommended production monitoring:

```text
Sentry
Vercel Logs
Supabase Logs
```

Track:

- Server errors
- Failed mutations
- Webhook failures
- Auth problems
- Slow database operations

---

# 49. Environment Architecture

Recommended environments:

```text
Local
Staging
Production
```

Use separate:

- Supabase projects or isolated environments where appropriate
- Vercel environment variables
- Payment credentials
- Email settings

Never test destructive features directly in production first.

---

# 50. Environment Variables

Typical:

```env
NEXT_PUBLIC_APP_URL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

RESEND_API_KEY=
RESEND_FROM_EMAIL=

PAYMONGO_PUBLIC_KEY=
PAYMONGO_SECRET_KEY=
PAYMONGO_WEBHOOK_SECRET=

NEXT_PUBLIC_GA_MEASUREMENT_ID=

SENTRY_DSN=
```

Add only when used.

Keep `.env.example` updated.

---

# 51. Deployment Architecture

Recommended:

```text
Git Repository
↓
Vercel
├── Preview Deployments
├── Staging
└── Production
```

Database migrations:

```text
Local migration
↓
Review
↓
Staging
↓
Production
```

Never manually change production schema without migration tracking unless emergency recovery requires it.

---

# 52. Branch Strategy

Recommended simple strategy:

```text
main
feature/*
fix/*
```

Examples:

```text
feature/crm-pipeline
feature/client-conversion
fix/project-permissions
```

Preview deployments should be used for review.

---

# 53. Migration Strategy

All schema changes must be migration-based.

Location:

```text
supabase/migrations/
```

Rules:

- One focused migration per logical change
- Add constraints safely
- Backfill before enforcing non-null when needed
- Avoid destructive changes without data plan
- Test RLS policies
- Regenerate types after schema changes

---

# 54. Generated Database Types

Generate Supabase types and store them in a predictable location.

Example:

```text
src/types/database.ts
```

Do not manually rewrite database types in multiple places.

Domain types may wrap database types where necessary.

---

# 55. Validation Architecture

Zod schemas should live near features.

Example:

```text
src/features/leads/schemas/
```

Use shared schemas for:

```text
form
server action
API
```

Avoid duplicating validation rules.

---

# 56. Domain Service Architecture

Complex business operations belong in services.

Example:

```text
convertLeadToClient()
createProposal()
acceptProposal()
recordPayment()
submitRevision()
```

Services should:

```text
validate business state
enforce invariants
perform related writes
create activity
create audit logs where needed
```

Do not bury complex workflows inside UI components.

---

# 57. Transaction Strategy

Use database transactions for multi-step operations where partial success would corrupt state.

Examples:

```text
Lead Conversion
Proposal Acceptance
Payment Recording
Invoice Recalculation
```

If Supabase client limitations make transactions awkward, prefer database functions/RPC for atomic operations.

---

# 58. Database Functions

Use PostgreSQL functions only when they improve:

- Atomicity
- Security
- Performance
- Consistency

Do not move ordinary application logic into SQL without reason.

---

# 59. Webhook Architecture

All webhook handlers must:

```text
Verify Provider Signature
Validate Payload
Check Idempotency
Process Event
Record Result
Return Safe Response
```

Webhook processing must tolerate retries.

---

# 60. Idempotency

Critical operations must be idempotent.

Examples:

```text
Lead conversion
Payment webhook
Proposal acceptance
Client invitation
Subscription activation
```

Repeated requests must not create duplicate business records.

---

# 61. API Security

External API endpoints should use:

- Authentication when required
- Rate limiting where relevant
- Validation
- Explicit allowed methods
- Safe errors

Public forms should have anti-abuse protection.

Possible future protection:

```text
Turnstile
rate limiting
honeypot
```

---

# 62. Rate Limiting

Apply where abuse is likely:

```text
Login
Password reset
Public inquiry
Cost estimator lead submission
Public contact forms
Webhook endpoints where appropriate
```

Do not rate-limit normal internal application actions excessively.

---

# 63. SEO Architecture

Public site should support:

```text
Metadata API
Canonical URLs
Open Graph
Structured Data
Sitemap
Robots
```

Never index:

```text
/admin
/portal
private proposal pages
private invoice pages
auth pages where unnecessary
```

---

# 64. Static vs Dynamic Rendering

Prefer static rendering for:

- Marketing pages
- Service pages
- Public case studies

Use dynamic rendering for:

- Admin
- Client portal
- Auth-sensitive pages
- Personalized content

---

# 65. Image Architecture

Use Next.js image optimization for appropriate public images.

Store:

- Brand assets in repository/public where static
- Client/project uploads in Supabase Storage

Do not commit private client assets to Git.

---

# 66. Design System Integration

The UI must follow `DESIGN_SYSTEM.md`.

Recommended shared implementation:

```text
CSS variables
Tailwind tokens
Reusable components
```

No random hex values in feature pages.

No duplicated button styles.

---

# 67. Accessibility Architecture

Accessibility must be considered at component level.

Shared components must support:

```text
keyboard navigation
focus management
labels
ARIA where appropriate
screen reader semantics
```

Fix accessibility in primitives so all modules benefit.

---

# 68. Testing Architecture

Recommended layers:

```text
Unit Tests
Integration Tests
End-to-End Tests
```

---

# 69. Unit Tests

Use for:

- Pure business logic
- Validation
- Permission helpers
- Calculations
- Status transitions

Examples:

```text
lead scoring
invoice totals
progress calculation
role permissions
```

---

# 70. Integration Tests

Use for:

- Database interactions
- RLS assumptions
- Server actions
- Conversion flows
- Proposal acceptance
- Payment handling

---

# 71. End-to-End Tests

Critical flows:

```text
Login
Submit Inquiry
Lead Appears
Change Lead Status
Convert Lead
Create Project
Client Login
Client Access Isolation
```

Later:

```text
Send Proposal
Accept Proposal
Submit Revision
Pay Invoice
Create Support Ticket
```

---

# 72. Security Testing

Always test:

```text
Unauthenticated access
Wrong role
Cross-client access
Cross-organization access
Direct URL access
Tampered IDs
Unauthorized file access
```

Security tests are not optional.

---

# 73. Performance Architecture

Avoid:

```text
N+1 queries
large client bundles
unbounded lists
duplicate requests
unnecessary realtime
large image payloads
```

Use:

```text
indexes
pagination
server rendering
selective columns
caching where safe
```

---

# 74. Database Indexing

Likely indexed fields:

```text
organization_id
client_id
project_id
status
assigned_to
email
created_at
due_date
```

Index based on real query patterns.

Do not create random indexes without understanding usage.

---

# 75. Background Jobs

Do not introduce a queue system in V0.1 unless required.

For future jobs:

```text
email retries
scheduled reminders
invoice reminders
maintenance renewal reminders
AI processing
```

Possible future approaches:

```text
Vercel Cron
Supabase scheduled functions
Queue provider if scale requires
```

---

# 76. Cron Architecture

Use scheduled jobs for:

```text
Overdue invoice checks
Upcoming renewal reminders
Follow-up reminders
Daily digest
```

Scheduled jobs must be idempotent.

---

# 77. AI Architecture

AI features should live behind a dedicated service layer.

Example:

```text
src/lib/ai/
```

AI should receive only necessary context.

Do not send:

- Unrelated client data
- Secrets
- Credentials
- Full database dumps

AI-generated content must be marked as draft when human approval is required.

---

# 78. AI Feature Boundaries

Allowed future AI tasks:

```text
Summarize lead
Draft proposal
Summarize discovery
Draft client update
Classify support request
```

Not automatic:

```text
Final pricing
Contract approval
Invoice payment decisions
Role changes
Deleting projects
```

---

# 79. Multi-Tenancy Strategy

V0.1 is built for Nexfora first.

Still include `organization_id` in core internal entities where reasonable to preserve future expansion.

But do not build:

```text
tenant billing
white-label domains
tenant onboarding
tenant subscription plans
cross-tenant super admin
```

until needed.

---

# 80. Future SaaS Evolution

Potential evolution:

```text
Nexfora Internal OS
↓
Proven Repeatable Workflow
↓
Abstract Organization Boundaries
↓
Multi-Tenant SaaS
```

Generalize only from real repeated patterns.

---

# 81. Security Boundaries Summary

```text
PUBLIC
Can submit approved public forms only

CLIENT
Can access own client-linked resources only

TEAM MEMBER
Can access assigned internal resources

PROJECT MANAGER
Can manage assigned project operations

ADMIN
Can manage organization operations

SUPER ADMIN
Full organization control
```

These boundaries must exist in both application logic and RLS.

---

# 82. Recommended Initial Build Order

```text
1. Repository + Documentation
2. Next.js Structure
3. Supabase Setup
4. Authentication
5. Profiles + Memberships
6. Authorization Helpers
7. Admin Shell
8. Public Inquiry
9. Leads
10. CRM
11. Client Conversion
12. Clients
13. Projects
```

Stop and validate V0.1 before moving to proposals and billing.

---

# 83. V0.1 Technical Scope

Build only:

```text
Authentication
Role-Based Access
Admin Shell
Public Inquiry
Leads
Lead Activity
CRM Pipeline
Clients
Lead Conversion
Basic Projects
Milestones
Tasks
```

Do not build advanced integrations yet.

---

# 84. Architectural Decision Rules

Before introducing a new library or service, answer:

```text
What problem does it solve?
Can existing stack solve it?
Does it reduce complexity?
Does it create vendor lock-in?
Does it affect security?
Does it affect deployment?
Does it require new maintenance?
```

Do not add dependencies just because they are popular.

---

# 85. Dependency Rules

Prefer:

- Well-maintained packages
- Minimal dependencies
- Official SDKs
- Packages with strong TypeScript support

Avoid packages that duplicate native or framework functionality.

---

# 86. Upgrade Strategy

Keep major dependencies reasonably current.

Before upgrades:

```text
Review changelog
Check breaking changes
Run tests
Build
Test staging
Deploy
```

Do not upgrade core dependencies casually during unrelated feature work.

---

# 87. Coding Boundary Rules

UI layer:

```text
Presentation
Interactions
Form state
```

Feature layer:

```text
Domain-specific behavior
Schemas
Queries
Actions
Services
```

Infrastructure layer:

```text
Supabase
Email
Payments
Logging
AI
```

Do not mix all three in one file.

---

# 88. Example Lead Flow

```text
/start-a-project
↓
Public Form
↓
Zod Validation
↓
Server Action
↓
Lead Service
↓
Insert Lead
↓
Insert Lead Activity
↓
Create Internal Notification
↓
Success Page
```

---

# 89. Example Admin Lead Detail Flow

```text
/admin/leads/[id]
↓
Require Internal User
↓
Check Organization Membership
↓
Fetch Lead
↓
Fetch Activities
↓
Render Server Component
↓
Client Components only for interactions
```

---

# 90. Example Client Project Flow

```text
/portal/projects/[id]
↓
Require Auth
↓
Resolve Client Membership
↓
Verify Project Client ID
↓
Fetch Client-Visible Data Only
↓
Render Portal
```

Internal notes must never be included in client queries.

---

# 91. Example Payment Flow

Future:

```text
Client Initiates Payment
↓
Create Provider Session
↓
Provider Processes
↓
Webhook Arrives
↓
Verify Signature
↓
Idempotency Check
↓
Record Payment
↓
Update Invoice
↓
Create Audit Log
↓
Notify Client/Admin
```

---

# 92. Example File Access Flow

```text
User Requests File
↓
Authenticate
↓
Authorize Resource
↓
Generate Signed URL
↓
Return Temporary Access
```

Do not expose private bucket URLs directly.

---

# 93. Example Proposal Acceptance Flow

```text
Client Opens Secure Proposal
↓
Validate Access Token / Session
↓
Load Proposal
↓
Client Accepts
↓
Server Validates Current Status
↓
Atomic Acceptance
↓
Activity + Audit
↓
Optional Client Conversion
```

---

# 94. Error Boundary Strategy

Use:

- Page-level error boundaries
- Route-level `error.tsx`
- Form-level errors
- Safe fallback UI

Do not allow a single failed widget to crash the whole application where avoidable.

---

# 95. Loading Strategy

Use:

```text
loading.tsx
Suspense
Skeletons
Pending button states
```

Loading UX should match the design system.

---

# 96. Feature Flags

Do not build complex feature flag infrastructure initially.

For staged features, use:

- Environment configuration
- Simple server-side feature checks

Add a dedicated feature flag platform only when needed.

---

# 97. Data Export

Future admin exports may include:

```text
Leads CSV
Clients CSV
Invoices
Reports
```

Exports must respect permissions and avoid exposing unrelated data.

---

# 98. Backup Strategy

Rely on database provider backups and documented export procedures.

For production:

- Confirm Supabase backup capabilities
- Maintain migration history
- Document recovery process
- Protect private storage

Do not treat Git as a database backup.

---

# 99. Disaster Recovery

Future production checklist should include:

```text
Database restore process
Environment variable recovery
Domain access
Vercel access
Supabase access
Storage recovery
Email provider access
Payment provider access
```

Store operational recovery information securely outside the repository.

---

# 100. Final Architecture Principle

NEXFORA OS should remain:

```text
Simple enough to understand
Secure enough for real client data
Modular enough to grow
Structured enough for AI agents
Practical enough to ship quickly
```

The governing architecture principle is:

**Build a secure modular monolith first. Scale architecture only when real usage proves the need.**
