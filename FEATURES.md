# FEATURES.md — NEXFORA OS

## 1. Purpose

This document is the official feature registry for **NEXFORA OS**.

It defines:

- What features exist
- Which version each feature belongs to
- Current implementation status
- Priority
- Dependencies
- User roles
- Acceptance criteria
- Out-of-scope boundaries

This file must be used together with:

- `AGENTS.md`
- `PRODUCT.md`
- `ARCHITECTURE.md`
- `DATABASE.md`
- `USER_FLOWS.md`
- `DESIGN_SYSTEM.md`

The purpose of this registry is to prevent:

- Scope creep
- Duplicate feature development
- Agents building future features too early
- Missing dependencies
- Inconsistent feature behavior

---

# 2. Feature Status Values

Use only these status values:

```text
planned
ready
in_progress
blocked
testing
completed
paused
deprecated
```

Meaning:

## planned

Defined but not ready to build yet.

## ready

Requirements and dependencies are clear.

## in_progress

Currently being implemented.

## blocked

Cannot proceed because of a dependency or unresolved decision.

## testing

Implementation exists and is being validated.

## completed

Accepted and production-ready for the intended version.

## paused

Temporarily stopped.

## deprecated

No longer part of the active product direction.

---

# 3. Priority Values

```text
P0 — Critical
P1 — High
P2 — Medium
P3 — Low
```

## P0

Core system dependency or security requirement.

## P1

Important business workflow required for the current release.

## P2

Useful but not required for the first usable release.

## P3

Nice-to-have or future enhancement.

---

# 4. Version Roadmap

```text
V0.1
Core Business Engine

V0.2
Sales Conversion + Client Experience

V0.3
Finance + Support + Maintenance

V0.4
Automation + AI + Reporting
```

---

# 5. V0.1 — Core Business Engine

Goal:

Nexfora can receive inquiries, manage leads, convert clients, and track basic projects.

Success means:

```text
Public inquiry
→ Lead
→ CRM
→ Client
→ Project
```

---

# 6. Authentication

## F-001 — Internal Login

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Users:

```text
super_admin
admin
project_manager
team_member
```

Description:

Internal users can securely sign in to NEXFORA OS using Supabase Auth.

Dependencies:

```text
Supabase project
profiles
organization_members
```

Acceptance Criteria:

```text
Given a valid internal user
When they sign in
Then a session is created
And their profile is resolved
And their organization membership is checked
And they are redirected to /admin
```

Failure cases:

```text
Invalid credentials
Suspended membership
No organization membership
Expired session
```

---

## F-002 — Internal Logout

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Acceptance Criteria:

```text
Given an authenticated internal user
When they log out
Then the session is cleared
And protected admin routes are no longer accessible
```

---

## F-003 — Protected Admin Routes

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Dependencies:

```text
F-001
organization_members
authorization helpers
```

Acceptance Criteria:

```text
Unauthenticated users cannot access /admin
Clients cannot access /admin
Suspended members cannot access protected pages
```

---

## F-004 — Role-Based Access

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Roles:

```text
super_admin
admin
project_manager
team_member
```

Acceptance Criteria:

```text
Permissions are enforced server-side
Unauthorized actions are denied
Navigation hides inaccessible modules
Direct URL access is still blocked
```

---

# 7. Admin Application Shell

## F-005 — Admin Layout

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Includes:

```text
Sidebar
Topbar
Responsive layout
User menu
Page container
Mobile navigation
```

Dependencies:

```text
DESIGN_SYSTEM.md
F-001
```

Acceptance Criteria:

```text
Uses Nexfora brand tokens
Works desktop/tablet/mobile
Supports collapsed navigation
Accessible keyboard navigation
```

---

## F-006 — Admin Sidebar Navigation

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
planned
```

Initial navigation:

```text
Dashboard
Leads
Clients
Projects
Settings
```

Future modules should remain hidden until released.

---

## F-007 — Admin Dashboard Basics

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
planned
```

Initial metrics:

```text
New Leads
Active Leads
Active Clients
Active Projects
Recent Activity
Upcoming Project Deadlines
```

Do not include fake financial analytics.

Acceptance Criteria:

```text
Metrics are based on real data
Cards link to relevant modules
Empty states are supported
```

---

# 8. Public Project Inquiry

## F-008 — Start a Project Multi-Step Form

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
implemented
```

Route:

```text
/start-a-project
```

Steps:

```text
Service
Business Information
Business Problem
Requested Features
Budget
Timeline
Contact Details
Review
Submit
```

Dependencies:

```text
leads table
Zod validation
public server action
```

Acceptance Criteria:

```text
Form works on mobile
State persists between steps
Required fields validate
User can go back without losing data
Final review is shown
Duplicate submit is prevented
```

---

## F-009 — Public Inquiry Submission

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
implemented
```

System behavior:

```text
Validate input
Create lead
Create lead activity
Return success
```

Server-controlled fields:

```text
organization_id
status
assigned_to
lead_score
```

Acceptance Criteria:

```text
Anonymous users cannot choose privileged fields
Invalid data is rejected
Successful submission creates exactly one lead
Failed submission preserves form data
```

---

## F-010 — Inquiry Success State

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
implemented
```

Acceptance Criteria:

```text
Clear confirmation
No duplicate resubmission
Next-step expectation is shown
```

---

# 9. Lead Management

## F-011 — Lead List

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
implemented
```

Route:

```text
/admin/leads
```

Columns:

```text
Name
Business
Service
Status
Budget
Source
Assignee
Created
```

Features:

```text
Search
Filter
Sort
Pagination
```

Acceptance Criteria:

```text
Only authorized organization leads are shown
List does not load unbounded records
Empty state exists
Loading state exists
```

---

## F-012 — Lead Detail

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
implemented
```

Route:

```text
/admin/leads/[id]
```

Displays:

```text
Contact
Business
Service Interest
Problem Summary
Requested Features
Budget
Timeline
Source
Assignee
Status
Activity
Notes
```

Acceptance Criteria:

```text
Invalid or unauthorized lead IDs are denied safely
All visible data belongs to the active organization
```

---

## F-013 — Lead Status Update

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
implemented
```

Statuses:

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

Acceptance Criteria:

```text
Server validates transition
Activity is created
Updated status is visible immediately
Unauthorized users cannot change status
```

---

## F-014 — Lead Assignment

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
implemented
```

Acceptance Criteria:

```text
Only valid active organization members can be assigned
Assignment creates activity
Unauthorized assignment is blocked
```

---

## F-015 — Lead Notes

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
implemented
```

Implementation:

Use `lead_activities` with:

```text
activity_type = note_added
```

Acceptance Criteria:

```text
Note includes author and timestamp
Empty notes rejected
Notes cannot be seen publicly
```

---

## F-016 — Lead Activity Timeline

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
implemented
```

Tracks:

```text
Lead created
Status changed
Assigned
Note added
Discovery scheduled
Won
Lost
Client converted
```

Acceptance Criteria:

```text
Newest/oldest ordering is intentional
Activities are immutable except admin correction if explicitly supported
```

---

# 10. CRM

## F-017 — CRM Pipeline Board

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
planned
```

Columns:

```text
New
Contacted
Discovery
Qualified
Proposal
Negotiation
Won
Lost
```

Acceptance Criteria:

```text
Cards reflect actual lead status
Board supports non-drag fallback
Mobile uses usable list/stacked layout
```

---

## F-018 — CRM Drag-and-Drop Status

Version:

```text
V0.1
```

Priority:

```text
P2
```

Status:

```text
planned
```

Dependencies:

```text
F-013
F-017
```

Important:

Drag-and-drop must not be the only way to change status.

---

## F-019 — Lead Search and Filters

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
in_progress
```

Filters:

```text
Status
Assignee
Source
Date
Service
Budget
```

Search:

```text
Name
Business Name
Email
Phone
```

---

# 11. Discovery

## F-020 — Discovery Notes

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
planned
```

Capture:

```text
Current Workflow
Pain Points
Business Goals
Required Features
Integrations
Budget
Timeline
Success Criteria
Risks
```

Implementation may begin as structured activity/notes and evolve later.

---

## F-021 — Discovery Scheduling Record

Version:

```text
V0.1
```

Priority:

```text
P2
```

Status:

```text
planned
```

Initial implementation:

Store:

```text
Date
Time
Meeting Method
Meeting Link
Notes
```

Google Calendar integration is not required for V0.1.

---

# 12. Lead Qualification

## F-022 — Mark Lead Qualified

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
planned
```

Acceptance Criteria:

```text
Status becomes qualified
Activity is created
Lead remains editable
```

---

## F-023 — Mark Lead Lost

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
planned
```

Lost reason required:

```text
Budget mismatch
Timing
No response
Not a fit
Competitor
Cancelled
Other
```

Acceptance Criteria:

```text
Cannot mark lost without reason
Reason is stored
Activity created
```

---

## F-024 — Mark Lead Won

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Acceptance Criteria:

```text
Status becomes won
Activity created
Convert-to-client action becomes available
Does not automatically duplicate clients
```

---

# 13. Client Management

## F-025 — Convert Lead to Client

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
completed
```

Dependencies:

```text
clients
lead conversion logic
```

Flow:

```text
Won Lead
↓
Review Client Details
↓
Confirm
↓
Create Client
↓
Link Lead
```

Acceptance Criteria:

```text
Operation is idempotent
One client created
source_lead_id linked
converted_client_id linked
converted_at set
Activity created
Repeated request returns existing client
```

---

## F-026 — Client List

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
completed
```

Route:

```text
/admin/clients
```

Features:

```text
Search
Filter
Pagination
Status
```

---

## F-027 — Client Detail

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
completed
```

Route:

```text
/admin/clients/[id]
```

Sections:

```text
Overview
Contact
Projects
Source Lead
Internal Notes
```

Future tabs should not appear before their modules exist.

---

## F-028 — Manual Client Creation

Version:

```text
V0.1
```

Priority:

```text
P2
```

Status:

```text
planned
```

Useful for clients acquired outside the inquiry flow.

---

## F-029 — Archive Client

Version:

```text
V0.1
```

Priority:

```text
P2
```

Status:

```text
planned
```

Rules:

```text
Archive instead of hard delete
Preserve project history
Authorized role only
```

---

# 14. Project Management

## F-030 — Create Project

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
testing
```

Fields:

```text
Client
Project Name
Description
Project Manager
Priority
Start Date
Target Date
```

Initial status:

```text
planning
```

Acceptance Criteria:

```text
Project belongs to valid client
Organization relationship is valid
Project appears in client detail
Activity created where applicable
```

---

## F-031 — Project List

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
testing
```

Route:

```text
/admin/projects
```

Features:

```text
Search
Status Filter
Client Filter
Manager Filter
Deadline Filter
Pagination
```

---

## F-032 — Project Detail

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
testing
```

Route:

```text
/admin/projects/[id]
```

V0.1 sections:

```text
Overview
Progress
Milestones
Tasks
Team
```

Future modules remain hidden until implemented.

---

## F-033 — Project Status Update

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
testing
```

Statuses:

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

Acceptance Criteria:

```text
Authorized users only
Status values validated
Completed status records completed_at
Cancelled status preserves history
```

---

## F-034 — Project Assignment

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
testing
```

Assign:

```text
Project Manager
Team Members
```

Acceptance Criteria:

```text
Only valid organization members
No duplicate project membership
```

---

# 15. Milestones

## F-035 — Create Milestone

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
testing
```

Fields:

```text
Title
Description
Due Date
Sort Order
```

---

## F-036 — Update Milestone Status

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
testing
```

Statuses:

```text
pending
in_progress
completed
blocked
```

---

## F-037 — Reorder Milestones

Version:

```text
V0.1
```

Priority:

```text
P2
```

Status:

```text
planned
```

Should support non-drag alternative.

---

# 16. Tasks

## F-038 — Create Task

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
testing
```

Fields:

```text
Project
Milestone
Title
Description
Status
Priority
Assignee
Due Date
```

---

## F-039 — Update Task Status

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
testing
```

Statuses:

```text
todo
in_progress
blocked
review
done
```

---

## F-040 — Task Assignment

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
testing
```

Acceptance Criteria:

```text
Assignee must be valid organization member
Prefer project member where policy requires
```

---

## F-041 — Task Filters

Version:

```text
V0.1
```

Priority:

```text
P2
```

Status:

```text
planned
```

Filters:

```text
Status
Priority
Assignee
Milestone
Due Date
```

---

# 17. Project Progress

## F-042 — Project Progress Calculation

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
testing
```

Initial rule:

```text
completed eligible tasks
÷
total eligible tasks
×
100
```

Acceptance Criteria:

```text
No divide-by-zero error
Progress between 0 and 100
Uses one trusted calculation path
```

---

# 18. V0.1 Security Features

## F-043 — Supabase RLS Core Policies

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Tables:

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

Acceptance Criteria:

```text
Cross-organization access denied
Public read denied
Unauthorized writes denied
```

---

## F-044 — Authorization Helpers

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Examples:

```text
requireUser
requireInternalMember
requireRole
canManageLead
canAccessProject
```

---

## F-045 — Cross-Client Isolation Foundation

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Even before portal launch, client ownership relationships must be designed correctly.

---

# 19. V0.1 UX Foundation

## F-046 — Shared UI Components

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Initial components:

```text
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
Breadcrumb
```

Must follow `DESIGN_SYSTEM.md`.

---

## F-047 — Loading States

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
planned
```

Required for:

```text
Lead List
Lead Detail
Client List
Client Detail
Project List
Project Detail
Forms
```

---

## F-048 — Empty States

Version:

```text
V0.1
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-049 — Error States

Version:

```text
V0.1
```

Priority:

```text
P0
```

Status:

```text
planned
```

Never expose raw server/database errors.

---

# 20. V0.1 Completion Gate

V0.1 is complete only when all P0 features are complete and required P1 workflow features are accepted.

Minimum functional flow:

```text
Internal Login
↓
Public Inquiry
↓
Lead Created
↓
Lead Managed in CRM
↓
Lead Won
↓
Convert to Client
↓
Create Project
↓
Manage Milestones and Tasks
```

Required security:

```text
Auth works
Role checks work
RLS works
Cross-organization access blocked
Unauthorized direct URL access blocked
```

---

# 21. V0.2 — Sales Conversion + Client Experience

Do not build before V0.1 core is stable.

---

## F-050 — Cost Estimator

Version:

```text
V0.2
```

Priority:

```text
P1
```

Status:

```text
testing
```

Flow:

```text
Project Type
→ Features
→ Details
→ Estimate Range
→ Lead Capture
```

Important:

Estimate must be labeled as non-final.

---

## F-051 — Proposal Generator

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

Includes:

```text
Client/Lead
Overview
Problem
Solution
Scope
Deliverables
Timeline
Line Items
Payment Terms
Terms
Validity
```

---

## F-052 — Proposal Preview

Version:

```text
V0.2
```

Priority:

```text
P1
```

Status:

```text
testing
```

---

## F-053 — Proposal Number Generation

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

Format example:

```text
NXF-PROP-2026-0001
```

Must be server-side.

---

## F-054 — Proposal Send

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

Dependencies:

```text
Resend
Proposal version snapshot
Secure client access
```

---

## F-055 — Proposal Client View

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

---

## F-056 — Proposal Acceptance

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

Must be:

```text
Authorized
Validated
Idempotent
Audited
```

---

## F-057 — Proposal Changes Requested

Version:

```text
V0.2
```

Priority:

```text
P1
```

Status:

```text
testing
```

---

## F-058 — Proposal Versioning

Version:

```text
V0.2
```

Priority:

```text
P1
```

Status:

```text
testing
```

Accepted proposal versions must not be silently overwritten.

---

# 22. Client Portal

## F-059 — Client Invitation

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

Dependencies:

```text
clients (Phase 4)
Resend
Client invitation token
```

---

## F-060 — Client Login

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

Dependencies:

```text
Client invitation acceptance
```

---

## F-061 — Protected Portal Routes

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

Dependencies:

```text
Client login
```

---

## F-062 — Client Dashboard

Version:

```text
V0.2
```

Priority:

```text
P1
```

Status:

```text
testing
```

Display (this phase):

```text
Active Project
Progress
Current Stage
Next Milestone
```

Deferred to later phases (not fetched or faked in this phase):

```text
Required Actions
Recent Files
Revision Status
```

---

## F-063 — Client Project View

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

Must expose only client-safe data. Only projects and milestones are
client-safe in this phase — tasks have no documented client-visible
boundary and are not exposed.

---

# 23. Files

## F-064 — Private File Upload

Version:

```text
V0.2
```

Priority:

```text
P1
```

Status:

```text
testing
```

Uses:

```text
Supabase Storage (project-files-private, not public)
project_files metadata
```

Internal upload permissions (documented decision): super_admin/admin for any
project; project_manager/team_member only for a project they manage or are a
project_members row for. Client upload permissions: owner/manager only,
viewer read-only. See `docs/PHASE_8_FILES_REVISIONS_SETUP.md`.

---

## F-065 — File Visibility

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

Values:

```text
internal
client
```

Internal reads see both values; portal reads are restricted to
`visibility = 'client'` through `get_client_project_files()` only — no
client-facing RLS policy exists on `project_files`.

---

## F-066 — Signed File Download

Version:

```text
V0.2
```

Priority:

```text
P0
```

Status:

```text
testing
```

120-second signed URLs, generated only after server-side authorization
(organization/project membership, or client ownership via
`get_client_file_for_download()`). No public/permanent URL is ever returned.

---

# 24. Revisions

## F-067 — Client Revision Submission

Version:

```text
V0.2
```

Priority:

```text
P1
```

Status:

```text
testing
```

Portal owner/manager only (viewer read-only), via `create_client_revision()`.
organization_id/client_id/project_id/submitted_by are all server-resolved.

---

## F-068 — Revision Management

Version:

```text
V0.2
```

Priority:

```text
P1
```

Status:

```text
testing
```

Statuses:

```text
submitted
reviewing
in_progress
ready_for_review
approved
rejected
closed
```

Internal-driven transitions only go through `transition_revision_status()`;
`status` is not directly updatable by the authenticated role. Assignment is
super_admin/admin/project_manager (accessible project) only — team_member
may update the status of a revision assigned to them but may never assign.

---

## F-069 — Revision Review by Client

Version:

```text
V0.2
```

Priority:

```text
P1
```

Status:

```text
testing
```

Approve is idempotent; requesting further changes requires a non-empty
comment, stored append-only in `revision_activities` so an earlier request is
never overwritten by a later one.

---

# 25. V0.3 — Finance

## F-070 — Invoice Creation

Version:

```text
V0.3
```

Priority:

```text
P0
```

Status:

```text
planned
```

---

## F-071 — Invoice Line Items

Version:

```text
V0.3
```

Priority:

```text
P0
```

Status:

```text
planned
```

---

## F-072 — Invoice Number Generation

Version:

```text
V0.3
```

Priority:

```text
P0
```

Status:

```text
planned
```

Format example:

```text
NXF-INV-2026-0001
```

---

## F-073 — Invoice Send

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-074 — Client Invoice View

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-075 — Manual Payment Recording

Version:

```text
V0.3
```

Priority:

```text
P0
```

Status:

```text
planned
```

Requires audit log.

---

## F-076 — Partial Payment Support

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-077 — Overdue Invoice Status

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

# 26. PayMongo

## F-078 — PayMongo Payment Session

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-079 — PayMongo Webhook Verification

Version:

```text
V0.3
```

Priority:

```text
P0
```

Status:

```text
planned
```

Must include:

```text
Signature verification
Idempotency
Server-side status update
Audit
```

---

## F-080 — Payment Reconciliation

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

# 27. Support

## F-081 — Support Ticket Creation

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-082 — Support Ticket Management

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

Statuses:

```text
open
assigned
in_progress
waiting_for_client
resolved
closed
```

---

## F-083 — Ticket Number Generation

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

# 28. Maintenance

## F-084 — Maintenance Plan Assignment

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-085 — Subscription Tracking

Version:

```text
V0.3
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-086 — Included Hours Tracking

Version:

```text
V0.3
```

Priority:

```text
P2
```

Status:

```text
planned
```

---

# 29. V0.4 — Notifications

## F-087 — In-App Notifications

Version:

```text
V0.4
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-088 — Email Notifications

Version:

```text
V0.4
```

Priority:

```text
P1
```

Status:

```text
planned
```

Some transactional email may be implemented earlier where required.

---

## F-089 — Notification Preferences

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

---

# 30. V0.4 — AI

## F-090 — AI Lead Summary

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

Human-reviewed output.

---

## F-091 — AI Lead Qualification Suggestion

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

Must not automatically reject leads.

---

## F-092 — AI Proposal Draft

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

Human approval required before send.

---

## F-093 — AI Discovery Summary

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

---

## F-094 — AI Client Update Draft

Version:

```text
V0.4
```

Priority:

```text
P3
```

Status:

```text
planned
```

---

## F-095 — AI Support Classification

Version:

```text
V0.4
```

Priority:

```text
P3
```

Status:

```text
planned
```

---

# 31. V0.4 — Automation

## F-096 — Follow-Up Reminders

Version:

```text
V0.4
```

Priority:

```text
P1
```

Status:

```text
planned
```

---

## F-097 — Automated Invoice Reminders

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

---

## F-098 — Maintenance Renewal Reminders

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

---

# 32. V0.4 — Reporting

## F-099 — Lead Conversion Report

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

---

## F-100 — Lead Source Report

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

---

## F-101 — Proposal Win Rate

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

---

## F-102 — Revenue Dashboard

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

Only after invoices/payments are reliable.

---

## F-103 — Project Delivery Report

Version:

```text
V0.4
```

Priority:

```text
P3
```

Status:

```text
planned
```

---

# 33. Global Search

## F-104 — Global Search

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

Searchable entities:

```text
Leads
Clients
Projects
Proposals
Invoices
Tickets
```

Must respect permissions.

---

# 34. Audit and Security

## F-105 — Audit Logs

Version:

```text
V0.2+
```

Priority:

```text
P0
```

Status:

```text
planned
```

Add as soon as sensitive mutations exist.

Audit:

```text
Role changes
Invoice void
Payment record
Proposal acceptance
Client archive
Project cancel
File delete
```

---

## F-106 — Security Event Monitoring

Version:

```text
V0.4
```

Priority:

```text
P2
```

Status:

```text
planned
```

---

# 35. Public Website Features

These are part of Nexfora’s public-facing ecosystem but may be developed separately from the OS core.

---

## F-107 — Nexfora Homepage

Version:

```text
Website Phase
```

Priority:

```text
P1
```

Status:

```text
planned
```

Sections may include:

```text
Hero
Business Problem
Solutions
Featured Work
System Value
Industries
Process
Why Nexfora
Technology
CTA
Footer
```

---

## F-108 — Solutions Pages

Status:

```text
planned
```

Pages:

```text
Websites
E-Commerce
Booking Systems
Custom Software
Automation
Integrations
```

---

## F-109 — Work / Case Studies

Status:

```text
planned
```

Case study structure:

```text
Problem
Strategy
Solution
System
Result
```

---

## F-110 — Contact

Status:

```text
planned
```

---

# 36. Explicitly Out of Scope for Current Roadmap

Do not build unless `PRODUCT.md` and `ROADMAP.md` are updated.

```text
Payroll
HR management
Employee attendance
Full accounting ledger
Inventory ERP
General-purpose chat
Video conferencing
Marketplace
Social feed
White-label SaaS
Tenant billing platform
Native mobile app
Complex CMS
AI vector search over all client data
```

---

# 37. Feature Dependency Rules

Before starting a feature:

```text
Check status
Check version
Check dependencies
Check required tables
Check required permissions
Check design-system components
Check user flow
```

Do not begin a feature marked:

```text
planned
```

unless it is moved to:

```text
ready
```

by the current development plan.

---

# 38. Feature Readiness Checklist

A feature may move from `planned` to `ready` when:

```text
✓ User flow is defined
✓ Database impact is known
✓ Permissions are known
✓ Dependencies are ready
✓ Acceptance criteria are clear
✓ UI requirements are understood
✓ Version scope allows it
```

---

# 39. Feature Completion Checklist

A feature may move to `completed` only when:

```text
✓ Implementation complete
✓ Server validation complete
✓ Authorization enforced
✓ RLS reviewed
✓ Loading state exists
✓ Empty state exists where relevant
✓ Error state exists
✓ Responsive behavior verified
✓ Tests or documented verification complete
✓ No obvious regressions
✓ Documentation updated if architecture changed
```

---

# 40. Feature Registry Maintenance Rule

When a feature changes:

Update:

```text
Status
Priority if needed
Dependencies
Acceptance criteria
Version if scope changes
```

Do not let this file become stale.

---

# 41. Current Recommended Build Queue

The recommended initial implementation queue is:

```text
F-001 Internal Login
F-003 Protected Admin Routes
F-004 Role-Based Access
F-043 RLS Core Policies
F-044 Authorization Helpers

F-005 Admin Layout
F-006 Sidebar
F-046 Shared UI Components

F-008 Start a Project Form
F-009 Inquiry Submission

F-011 Lead List
F-012 Lead Detail
F-013 Lead Status
F-015 Lead Notes
F-016 Lead Activity
F-017 CRM Pipeline

F-024 Mark Won
F-025 Convert Lead to Client
F-026 Client List
F-027 Client Detail

F-030 Create Project
F-031 Project List
F-032 Project Detail
F-035 Milestones
F-038 Tasks
F-042 Project Progress
```

---

# 42. First Production Milestone

The first real usable milestone is:

```text
NEXFORA OS V0.1
```

It should allow Joshua/Nexfora to:

```text
Receive inquiry
↓
Open lead
↓
Manage CRM stage
↓
Record notes
↓
Mark won
↓
Convert client
↓
Create project
↓
Track tasks and milestones
```

Do not move into proposals, invoices, or AI until this workflow is stable enough for real use.

---

# 43. Final Feature Principle

Every feature must support a real Nexfora workflow.

The governing feature principle is:

**Build only what moves the client journey forward, and build it in the correct order.**
