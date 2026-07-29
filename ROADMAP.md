# ROADMAP.md — NEXFORA OS

## 1. Purpose

This document defines the official execution roadmap for **NEXFORA OS**.

It turns the product, architecture, database, flows, and feature registry into a practical build sequence.

Use this file together with:

- `AGENTS.md`
- `PRODUCT.md`
- `DESIGN_SYSTEM.md`
- `ARCHITECTURE.md`
- `DATABASE.md`
- `USER_FLOWS.md`
- `FEATURES.md`

The roadmap answers:

- What should be built first?
- What must wait?
- What depends on what?
- What defines each release?
- When is a phase complete?
- What should the Orchestrator Agent assign next?

---

# 2. Roadmap Principle

Build NEXFORA OS in this order:

```text
Foundation
↓
Security
↓
Admin Shell
↓
Lead Acquisition
↓
CRM
↓
Clients
↓
Projects
↓
Sales Conversion
↓
Client Portal
↓
Billing
↓
Support
↓
Automation / AI
```

Do not skip foundational phases.

---

# 3. Release Overview

```text
PHASE 0
Project Setup

PHASE 1
Authentication + Security

PHASE 2
Admin Foundation

PHASE 3
Leads + CRM

PHASE 4
Clients

PHASE 5
Projects

──────────────
V0.1 RELEASE
──────────────

PHASE 6
Proposal System

PHASE 7
Client Portal

PHASE 8
Files + Revisions

──────────────
V0.2 RELEASE
──────────────

PHASE 9
Invoices + Payments

PHASE 10
Support + Maintenance

──────────────
V0.3 RELEASE
──────────────

PHASE 11
Notifications + Automation

PHASE 12
AI + Reporting

──────────────
V0.4 RELEASE
──────────────
```

---

# 4. Phase 0 — Project Setup

Goal:

Create a clean, production-ready codebase before building business features.

Status:

```text
ready
```

Priority:

```text
P0
```

Tasks:

```text
Create Next.js project
Enable TypeScript strict mode
Configure Tailwind CSS
Add AGENTS.md
Add PRODUCT.md
Add DESIGN_SYSTEM.md
Add ARCHITECTURE.md
Add DATABASE.md
Add USER_FLOWS.md
Add FEATURES.md
Add ROADMAP.md

Create folder architecture
Configure linting
Configure formatting
Create .env.example
Create Supabase utilities
Create base route groups
Create base layouts
```

Required structure:

```text
src/
├── app/
│   ├── (public)/
│   ├── admin/
│   ├── portal/
│   ├── auth/
│   └── api/
├── components/
├── features/
├── lib/
├── types/
└── config/
```

Exit Criteria:

```text
✓ Project runs locally
✓ Lint passes
✓ Typecheck passes
✓ Production build passes
✓ Documentation exists
✓ No business feature built yet
```

---

# 5. Phase 1 — Authentication + Security

Goal:

Establish identity, authorization, and data-protection foundations.

Status:

```text
planned
```

Priority:

```text
P0
```

Feature References:

```text
F-001 Internal Login
F-002 Internal Logout
F-003 Protected Admin Routes
F-004 Role-Based Access
F-043 RLS Core Policies
F-044 Authorization Helpers
F-045 Cross-Client Isolation Foundation
```

Database:

```text
organizations
profiles
organization_members
```

Tasks:

```text
Create Supabase project
Create initial migrations
Create Nexfora organization
Create profile model
Create organization membership model
Configure Supabase Auth
Create login page
Create logout flow
Create session handling
Create middleware / route protection
Create permission helpers
Create RLS helper functions
Create base RLS policies
Create initial super_admin account
```

Security Tests:

```text
Unauthenticated user blocked from /admin
Client-style account blocked from /admin
Suspended member blocked
Cross-organization queries denied
Service role never exposed to browser
```

Exit Criteria:

```text
✓ Internal user can login
✓ Internal user can logout
✓ Protected routes work
✓ Role checks work server-side
✓ RLS enabled
✓ Super admin access works
✓ Unauthorized direct URL access fails
```

---

# 6. Phase 2 — Admin Foundation

Goal:

Create the reusable NEXFORA OS interface shell.

Status:

```text
planned
```

Feature References:

```text
F-005 Admin Layout
F-006 Sidebar Navigation
F-007 Dashboard Basics
F-046 Shared UI Components
F-047 Loading States
F-048 Empty States
F-049 Error States
```

Tasks:

```text
Create app shell
Create desktop sidebar
Create mobile navigation
Create topbar
Create user menu
Create breadcrumbs
Create page container

Build shared:
Button
Input
Textarea
Select
Checkbox
Badge
Card
Table
Dialog
Drawer
Toast
Alert
Skeleton
EmptyState
Pagination
Tabs
```

Dashboard V0.1:

```text
New Leads
Active Leads
Active Clients
Active Projects
Recent Activity
Upcoming Deadlines
```

Design Requirement:

Must follow `DESIGN_SYSTEM.md`.

Exit Criteria:

```text
✓ Admin shell responsive
✓ Shared components reusable
✓ Brand styles consistent
✓ Loading state supported
✓ Empty state supported
✓ Error state supported
✓ Dashboard loads real placeholder-safe data paths
```

---

# 7. Phase 3 — Leads + CRM

Goal:

Make NEXFORA OS useful for real lead intake and sales tracking.

Status:

```text
in_progress
```

Priority:

```text
P0 / P1
```

Feature References:

```text
F-008 Start a Project Form
F-009 Inquiry Submission
F-010 Inquiry Success State

F-011 Lead List
F-012 Lead Detail
F-013 Lead Status Update
F-014 Lead Assignment
F-015 Lead Notes
F-016 Lead Activity Timeline

F-017 CRM Pipeline
F-018 CRM Drag-and-Drop Status
F-019 Lead Search and Filters

F-020 Discovery Notes
F-021 Discovery Scheduling Record
F-022 Mark Qualified
F-023 Mark Lost
F-024 Mark Won
```

Database:

```text
leads
lead_activities
```

Build Order:

```text
Public Inquiry
↓
Lead Creation
↓
Lead List
↓
Lead Detail
↓
Status Update
↓
Notes / Activity
↓
Search / Filters
↓
CRM Pipeline
↓
Discovery
↓
Qualified / Won / Lost
```

Core Flow:

```text
Website Visitor
↓
Start a Project
↓
Submit Inquiry
↓
Lead Created
↓
Admin Opens Lead
↓
Contacted
↓
Discovery
↓
Qualified
↓
Won / Lost
```

Exit Criteria:

```text
✓ Public inquiry creates one valid lead
✓ Lead appears in admin
✓ Search/filter works
✓ Lead detail works
✓ Status changes are validated
✓ Activity is recorded
✓ Notes work
✓ CRM pipeline reflects statuses
✓ Won/lost outcomes work
✓ Mobile CRM has non-drag fallback
```

---

# 8. Phase 4 — Clients

Goal:

Turn won leads into structured client records.

Status:

```text
in_progress
```

Feature References:

```text
F-025 Convert Lead to Client
F-026 Client List
F-027 Client Detail
F-028 Manual Client Creation
F-029 Archive Client
```

Database:

```text
clients
client_users
```

Build Order:

```text
Client Schema
↓
Lead Conversion Service
↓
Client List
↓
Client Detail
↓
Manual Creation
↓
Archive
```

Critical Requirement:

Lead conversion must be idempotent.

Flow:

```text
Won Lead
↓
Convert
↓
Check Existing Conversion
↓
Create Client
↓
Link Lead
↓
Open Client
```

Exit Criteria:

```text
✓ Won lead converts once
✓ Repeated conversion does not duplicate
✓ Client list works
✓ Client detail works
✓ Source lead remains linked
✓ Archive preserves history
```

---

# 9. Phase 5 — Projects

Goal:

Enable Nexfora to manage actual delivery after client conversion.

Status:

```text
in_progress
```

Feature References:

```text
F-030 Create Project
F-031 Project List
F-032 Project Detail
F-033 Project Status Update
F-034 Project Assignment

F-035 Create Milestone
F-036 Update Milestone Status
F-037 Reorder Milestones

F-038 Create Task
F-039 Update Task Status
F-040 Task Assignment
F-041 Task Filters

F-042 Project Progress Calculation
```

Database:

```text
projects
project_members
milestones
tasks
```

Build Order:

```text
Project Creation
↓
Project List
↓
Project Detail
↓
Project Status
↓
Assignments
↓
Milestones
↓
Tasks
↓
Progress
```

Core Flow:

```text
Client
↓
Create Project
↓
Planning
↓
Milestones
↓
Tasks
↓
Delivery Stages
↓
Progress
```

Exit Criteria:

```text
✓ Project belongs to client
✓ Project list/detail works
✓ Status transitions work
✓ Team assignment works
✓ Milestones work
✓ Tasks work
✓ Progress calculation works
✓ Unauthorized access blocked
```

---

# 10. V0.1 Release Gate

Release Name:

```text
NEXFORA OS V0.1
Core Business Engine
```

Required End-to-End Flow:

```text
Login
↓
Receive Inquiry
↓
Manage Lead
↓
Move Through CRM
↓
Mark Won
↓
Convert Client
↓
Create Project
↓
Track Milestones
↓
Track Tasks
```

Release Checklist:

```text
✓ P0 features complete
✓ Required P1 features complete
✓ Typecheck passes
✓ Lint passes
✓ Build passes
✓ Critical auth tests pass
✓ RLS tested
✓ Lead conversion tested
✓ Responsive admin tested
✓ Real internal use is possible
```

Before V0.2:

Use V0.1 internally with real Nexfora workflow.

Record:

```text
Pain points
Missing steps
Repeated actions
Confusing UI
Data gaps
Permission problems
```

Only then proceed.

---

# 11. Phase 6 — Proposal System

Goal:

Turn qualified opportunities into professional proposals.

Status:

```text
in_progress
```

Version:

```text
V0.2
```

Feature References:

```text
F-050 Cost Estimator
F-051 Proposal Generator
F-052 Proposal Preview
F-053 Proposal Number Generation
F-054 Proposal Send
F-055 Proposal Client View
F-056 Proposal Acceptance
F-057 Proposal Changes Requested
F-058 Proposal Versioning
```

Database:

```text
proposals
proposal_items
proposal_versions
```

Build Order:

```text
Proposal Schema
↓
Proposal Draft
↓
Line Items
↓
Preview
↓
Official Numbering
↓
Send
↓
Secure Client View
↓
Accept / Request Changes / Decline
↓
Versioning
```

Critical Requirements:

```text
Accepted proposals immutable/versioned
Official numbers server-generated
Acceptance idempotent
Proposal access secure
```

Exit Criteria:

```text
✓ Qualified lead can receive proposal
✓ Totals correct
✓ Proposal can be previewed
✓ Proposal sends securely
✓ Client can view
✓ Client can accept/request changes
✓ History preserved
```

---

# 12. Phase 7 — Client Portal

Goal:

Give clients a secure, premium self-service space.

Status:

```text
in_progress
```

Version:

```text
V0.2
```

Feature References:

```text
F-059 Client Invitation
F-060 Client Login
F-061 Protected Portal Routes
F-062 Client Dashboard
F-063 Client Project View
```

Database:

```text
client_users
client_invitations
```

Build Order:

```text
Invitation
↓
Client Account
↓
Membership
↓
Portal Shell
↓
Client Dashboard
↓
Client Project View
```

Security Requirement:

```text
Client A must never access Client B.
```

Exit Criteria:

```text
✓ Invite works
✓ Client login works
✓ Portal routes protected
✓ Client sees only own data
✓ Internal notes hidden
✓ Cross-client tests pass
```

---

# 13. Phase 8 — Files + Revisions

Goal:

Replace scattered client files and revision requests.

Status:

```text
planned
```

Version:

```text
V0.2
```

Feature References:

```text
F-064 Private File Upload
F-065 File Visibility
F-066 Signed File Download

F-067 Client Revision Submission
F-068 Revision Management
F-069 Revision Review by Client
```

Database:

```text
project_files
revisions
```

Storage:

```text
Supabase Storage
private buckets
```

Build Order:

```text
Private Storage
↓
File Metadata
↓
Internal Upload
↓
Client Upload
↓
Visibility Rules
↓
Signed Downloads
↓
Revision Submission
↓
Revision Workflow
↓
Client Approval
```

Exit Criteria:

```text
✓ Private files protected
✓ Internal/client visibility works
✓ Signed access works
✓ Client submits revisions
✓ Team manages revisions
✓ Client approves/rejects
```

---

# 14. V0.2 Release Gate

Release Name:

```text
NEXFORA OS V0.2
Sales + Client Experience
```

Required Flow:

```text
Qualified Lead
↓
Proposal
↓
Accepted
↓
Client Portal
↓
Project View
↓
Files
↓
Revisions
```

Release Checklist:

```text
✓ Proposal security tested
✓ Client isolation tested
✓ File access tested
✓ Revision workflow tested
✓ Portal responsive
✓ Real client pilot completed
```

---

# 15. Phase 9 — Invoices + Payments

Goal:

Centralize billing and payment tracking.

Status:

```text
planned
```

Version:

```text
V0.3
```

Feature References:

```text
F-070 Invoice Creation
F-071 Invoice Line Items
F-072 Invoice Number Generation
F-073 Invoice Send
F-074 Client Invoice View
F-075 Manual Payment Recording
F-076 Partial Payment Support
F-077 Overdue Invoice Status

F-078 PayMongo Payment Session
F-079 PayMongo Webhook Verification
F-080 Payment Reconciliation
```

Database:

```text
invoices
invoice_items
payments
```

Build Order:

```text
Invoice Draft
↓
Line Items
↓
Totals
↓
Official Number
↓
Send
↓
Client View
↓
Manual Payment
↓
Partial Payment
↓
Overdue Logic
↓
PayMongo
↓
Webhook Verification
```

Critical Requirements:

```text
No float math for money
Official numbers server-generated
Payment status server-verified
Webhook idempotent
Audit manual payments
```

Exit Criteria:

```text
✓ Invoice totals correct
✓ Client can view invoice
✓ Manual payment works
✓ Partial payments work
✓ Balance correct
✓ PayMongo verified server-side
✓ Duplicate webhooks safe
```

---

# 16. Phase 10 — Support + Maintenance

Goal:

Create post-launch recurring client operations.

Status:

```text
planned
```

Version:

```text
V0.3
```

Feature References:

```text
F-081 Support Ticket Creation
F-082 Support Ticket Management
F-083 Ticket Number Generation

F-084 Maintenance Plan Assignment
F-085 Subscription Tracking
F-086 Included Hours Tracking
```

Database:

```text
support_tickets
subscriptions
subscription_usage
```

Build Order:

```text
Support Ticket
↓
Assignment
↓
Workflow
↓
Resolution
↓
Maintenance Plan
↓
Renewal Tracking
↓
Usage Tracking
```

Exit Criteria:

```text
✓ Client can request support
✓ Team can manage ticket lifecycle
✓ Ticket numbers work
✓ Maintenance plan visible
✓ Renewal data tracked
✓ Usage recorded clearly
```

---

# 17. V0.3 Release Gate

Release Name:

```text
NEXFORA OS V0.3
Finance + Post-Launch Operations
```

Required Flow:

```text
Project
↓
Invoice
↓
Payment
↓
Deployment
↓
Support
↓
Maintenance
```

Release Checklist:

```text
✓ Financial calculations verified
✓ Payment security reviewed
✓ Support workflow tested
✓ Maintenance tracking works
✓ Audit logs active for sensitive actions
```

---

# 18. Phase 11 — Notifications + Automation

Goal:

Reduce repetitive operational work.

Status:

```text
planned
```

Version:

```text
V0.4
```

Feature References:

```text
F-087 In-App Notifications
F-088 Email Notifications
F-089 Notification Preferences

F-096 Follow-Up Reminders
F-097 Automated Invoice Reminders
F-098 Maintenance Renewal Reminders
```

Potential Events:

```text
lead.created
lead.status_changed
proposal.sent
proposal.accepted
invoice.sent
payment.verified
revision.created
ticket.created
project.completed
```

Build Order:

```text
Notification Data Model
↓
In-App Notifications
↓
Email Service
↓
Preferences
↓
Follow-Up Reminders
↓
Invoice Reminders
↓
Renewal Reminders
```

Exit Criteria:

```text
✓ No duplicate notifications
✓ User preferences respected
✓ Scheduled jobs idempotent
✓ Failures logged safely
```

---

# 19. Phase 12 — AI + Reporting

Goal:

Add intelligence only after core operational data is reliable.

Status:

```text
planned
```

Version:

```text
V0.4
```

Feature References:

```text
F-090 AI Lead Summary
F-091 AI Qualification Suggestion
F-092 AI Proposal Draft
F-093 AI Discovery Summary
F-094 AI Client Update Draft
F-095 AI Support Classification

F-099 Lead Conversion Report
F-100 Lead Source Report
F-101 Proposal Win Rate
F-102 Revenue Dashboard
F-103 Project Delivery Report
F-104 Global Search
```

AI Rule:

AI assists.

Humans approve important business decisions.

Never automate:

```text
Final pricing
Contract acceptance
Payment verification
Role changes
Project deletion
```

Build Order:

```text
Reliable Operational Data
↓
Reports
↓
Search
↓
AI Summaries
↓
AI Drafts
↓
AI Suggestions
```

Exit Criteria:

```text
✓ AI does not bypass permissions
✓ Human approval boundaries enforced
✓ Reports use trusted data
✓ Sensitive data exposure reviewed
```

---

# 20. V0.4 Release Gate

Release Name:

```text
NEXFORA OS V0.4
Intelligence + Automation
```

Required:

```text
Stable core data
Stable finance
Stable client workflows
Reliable audit trail
```

Do not build AI before these foundations exist.

---

# 21. Current Build Queue

The Orchestrator Agent should currently follow this sequence:

```text
1. Project Setup
2. Supabase Setup
3. Authentication
4. Profiles
5. Organization Membership
6. Authorization Helpers
7. RLS
8. Admin Shell
9. Shared UI
10. Public Inquiry
11. Leads
12. Lead Activity
13. CRM
14. Client Conversion
15. Clients
16. Projects
17. Milestones
18. Tasks
19. Project Progress
```

---

# 22. Orchestrator Rule

Before starting each phase:

```text
Read ROADMAP.md
↓
Read matching FEATURES.md entries
↓
Read USER_FLOWS.md
↓
Read DATABASE.md
↓
Read ARCHITECTURE.md
↓
Read DESIGN_SYSTEM.md for UI
↓
Create implementation plan
```

Do not jump directly into coding.

---

# 23. Phase Start Checklist

Before a phase moves to `in_progress`:

```text
✓ Dependencies complete
✓ Database model defined
✓ User flow defined
✓ Feature IDs identified
✓ Permissions defined
✓ UI requirements defined
✓ Security implications reviewed
✓ Acceptance criteria clear
```

---

# 24. Phase Completion Checklist

Before a phase is marked complete:

```text
✓ Features implemented
✓ Lint passes
✓ Typecheck passes
✓ Build passes
✓ Migrations tested
✓ RLS tested
✓ Responsive UI tested
✓ Loading states verified
✓ Empty states verified
✓ Error states verified
✓ Security checks passed
✓ Documentation updated
```

---

# 25. Bug Priority During Development

Use:

```text
BLOCKER
Security/data corruption/build failure

HIGH
Core workflow broken

MEDIUM
Important feature degraded

LOW
Minor visual/polish issue
```

Blockers must be fixed before progressing to the next release gate.

---

# 26. Technical Debt Rule

Technical debt may be accepted only when:

```text
Documented
Safe
Non-security-critical
Does not threaten data integrity
Has a planned follow-up
```

Never defer:

```text
Authentication bugs
Authorization bugs
RLS gaps
Payment verification
Data corruption
Secret exposure
```

---

# 27. Release Strategy

Recommended environments:

```text
Local
↓
Preview
↓
Staging
↓
Production
```

For each release:

```text
Develop
↓
Test
↓
Preview
↓
Staging Validation
↓
Database Migration
↓
Production Deploy
↓
Smoke Test
```

---

# 28. V0.1 Pilot Strategy

Before calling V0.1 stable:

Use it internally for real Nexfora operations.

Test with:

```text
A real inquiry
A manually created lead
A won lead
A client conversion
A real project
Real milestones
Real tasks
```

Document friction before starting V0.2.

---

# 29. V0.2 Client Pilot Strategy

Use the Client Portal with a small number of trusted clients first.

Validate:

```text
Login clarity
Project visibility
File access
Revision submission
Mobile usability
Notification expectations
```

Do not onboard every client at once initially.

---

# 30. Future SaaS Gate

Do not begin SaaS generalization until:

```text
Nexfora uses NEXFORA OS consistently
Repeated workflows are proven
Multiple real clients use portal successfully
Billing/support workflows are stable
Operational patterns repeat
```

Only then consider:

```text
Multi-tenant onboarding
Tenant billing
White-labeling
SaaS subscription plans
```

---

# 31. Explicitly Deferred

Do not include in current roadmap unless product strategy changes:

```text
Payroll
HR system
Attendance
Full accounting
Inventory ERP
Marketplace
Video calls
General chat
Native mobile app
Complex white-label SaaS
Multi-tenant billing
Vector database over all client content
```

---

# 32. Roadmap Success Definition

The roadmap is successful when Nexfora can progressively move from:

```text
Manual scattered operations
```

to:

```text
One connected operating system
```

without overbuilding too early.

The governing roadmap principle is:

**Build the foundation first, prove each workflow in real use, then expand.**
