# USER_FLOWS.md — NEXFORA OS

## 1. Purpose

This document defines the official user flows for **NEXFORA OS**.

It should be used together with:

- `AGENTS.md`
- `PRODUCT.md`
- `ARCHITECTURE.md`
- `DATABASE.md`
- `DESIGN_SYSTEM.md`

The purpose of this file is to make sure developers and AI agents understand:

- Who is using the system
- What they are trying to accomplish
- What steps happen before and after each action
- Which system states change
- Which permissions apply
- Which notifications or activity records should be created
- What success and failure states must exist

The system should follow this principle:

**Every important user action should have a clear beginning, expected result, and traceable state change.**

---

# 2. Primary User Types

## Public Visitor

Can:

- Browse Nexfora website
- View services
- View case studies
- Submit a project inquiry
- Use a cost estimator
- Book a discovery call

Cannot:

- Access internal Nexfora OS
- Access client data
- Access project data

---

## Super Admin

Can:

- Manage all Nexfora operations
- Manage roles and permissions
- Access all internal modules
- Convert leads
- Manage projects
- Manage proposals
- Manage invoices
- View reports
- Configure the system

---

## Admin

Can manage most daily operations.

Typical access:

- Leads
- Clients
- Projects
- Proposals
- Invoices
- Revisions
- Support
- Files

---

## Project Manager

Can:

- Manage assigned projects
- Manage milestones and tasks
- Update project progress
- Review revisions
- Manage project files
- Communicate project updates

---

## Team Member

Can:

- Access assigned work
- Update tasks
- Upload approved project files
- Add internal project activity where permitted

---

## Client

Can only access their own:

- Projects
- Progress
- Milestones
- Client-visible files
- Revisions
- Invoices
- Support tickets

---

# 3. Master Business Flow

```text
PUBLIC VISITOR
      ↓
EXPLORES NEXFORA
      ↓
PROJECT INQUIRY
      ↓
LEAD CREATED
      ↓
CRM PIPELINE
      ↓
CONTACT / DISCOVERY
      ↓
QUALIFICATION
      ↓
PROPOSAL
      ↓
NEGOTIATION
      ↓
WON
      ↓
CLIENT CREATED
      ↓
PROJECT CREATED
      ↓
CLIENT PORTAL INVITED
      ↓
PROJECT DELIVERY
      ↓
REVISIONS / FILES / UPDATES
      ↓
INVOICE / PAYMENT
      ↓
DEPLOYMENT
      ↓
SUPPORT
      ↓
MAINTENANCE / RECURRING RELATIONSHIP
```

---

# 4. Public Website Flow

## Goal

Help visitors understand Nexfora and convert qualified visitors into leads.

Flow:

```text
Homepage
↓
Explore Services
↓
View Work / Case Studies
↓
Build Trust
↓
Start a Project
```

Alternative paths:

```text
Homepage
→ Get Estimate
```

```text
Homepage
→ Book Discovery Call
```

```text
Service Page
→ Start a Project
```

Required UX states:

- Clear CTA
- Mobile-friendly
- Fast loading
- Clear service explanations
- Trust signals
- No unnecessary login requirement

---

# 5. Start a Project Flow

Route:

```text
/start-a-project
```

## Step 1 — Service Selection

User chooses:

```text
Website
E-Commerce
Booking System
Ordering System
Custom Web Application
Mobile Application
Automation
Integration
Other
```

System action:

- Save selection in form state
- Continue to business information

Validation:

- At least one service or "Other" must be selected

---

## Step 2 — Business Information

Fields:

```text
Business Name
Industry
Existing Website
Current Business Process
```

Optional:

```text
Website URL
Facebook Page
```

System action:

- Preserve form state
- Continue to problem definition

---

## Step 3 — Business Problem

Prompt:

```text
What problem are you trying to solve?
```

Example:

```text
"We currently receive orders through Messenger
and manually record them in Excel."
```

Goal:

Capture the real operational problem, not just the requested technology.

Validation:

- Meaningful description required

---

## Step 4 — Requested Features

Examples:

```text
Admin Dashboard
Online Payment
Customer Accounts
Booking Calendar
Inventory
Order Tracking
SMS Notification
Email Automation
Reports
API Integration
```

User may choose:

```text
Not sure yet
```

This should not block submission.

---

## Step 5 — Budget

Example ranges:

```text
Below ₱30,000
₱30,000–₱50,000
₱50,000–₱100,000
₱100,000–₱250,000
₱250,000+
Not sure yet
```

Budget is a qualification signal, not an automatic rejection rule.

---

## Step 6 — Timeline

Options:

```text
ASAP
Within 1 month
1–2 months
3–4 months
Flexible
```

---

## Step 7 — Contact Details

Fields:

```text
Full Name
Email
Phone
Preferred Contact Method
```

Optional:

```text
Messenger
Email
Phone
```

---

## Step 8 — Review

Show:

```text
Service
Business
Problem
Features
Budget
Timeline
Contact
```

User can edit before submission.

---

## Step 9 — Submit

System must:

```text
Validate input
↓
Create lead
↓
Create initial lead activity
↓
Notify internal Nexfora user
↓
Show success confirmation
```

Success state:

```text
Thanks for telling us about your project.

We'll review your requirements and contact you soon.
```

Failure state:

```text
We couldn't submit your project inquiry.
Your information is still on this page.
Please try again.
```

Do not clear the form on failed submission.

---

# 6. Lead Creation Flow

Triggered by:

```text
Public Project Inquiry
Manual Admin Entry
Referral Entry
Other Lead Source
```

System creates:

```text
Lead Record
+
Lead Activity
```

Initial status:

```text
new
```

Initial activity:

```text
Lead created
```

If public inquiry:

```text
Inquiry submitted from website
```

System may also:

- Notify assigned admin
- Send acknowledgment email to lead
- Record source

---

# 7. Admin Lead Inbox Flow

Route:

```text
/admin/leads
```

Admin sees:

```text
New Leads
Contacted
Discovery
Qualified
Proposal
Negotiation
Won
Lost
```

List/board controls:

```text
Search
Filter
Sort
Assignee
Source
Date
Budget
Status
```

Primary actions:

```text
Open Lead
Change Status
Assign Lead
Add Note
Schedule Discovery
Create Proposal
Mark Won
Mark Lost
```

---

# 8. Lead Detail Flow

Route:

```text
/admin/leads/[id]
```

Page sections:

```text
Lead Summary
Contact Information
Business Information
Service Interest
Problem Summary
Features
Budget
Timeline
Source
Assigned Owner
Status
Activity Timeline
Notes
Actions
```

Primary next actions depend on status.

Example:

```text
new
→ Contact Lead
```

```text
contacted
→ Schedule Discovery
```

```text
discovery
→ Qualify Lead
```

```text
qualified
→ Create Proposal
```

---

# 9. Contact Lead Flow

Admin clicks:

```text
Mark as Contacted
```

System:

```text
Verify permission
↓
Update lead.status = contacted
↓
Create lead activity
↓
Optional follow-up reminder
```

Activity example:

```text
Joshua changed status from New to Contacted.
```

---

# 10. Discovery Scheduling Flow

Admin selects:

```text
Schedule Discovery
```

Options:

- Create internal calendar event
- Send booking link
- Record manually scheduled call

Data:

```text
Date
Time
Meeting Method
Meeting Link
Notes
```

System:

```text
Create discovery event
↓
Update lead status to discovery if appropriate
↓
Create activity record
↓
Notify relevant users
```

---

# 11. Discovery Call Flow

Before meeting:

Admin sees:

```text
Lead Profile
Business Problem
Requested Features
Budget
Timeline
Previous Activity
```

During meeting:

Capture:

```text
Current Workflow
Pain Points
Business Goals
Users
Required Features
Integrations
Technical Constraints
Budget Confirmation
Timeline
Success Criteria
Risks
```

After meeting:

Admin chooses:

```text
Qualify
Needs Follow-Up
Not a Fit
```

---

# 12. Lead Qualification Flow

Qualified path:

```text
Discovery Complete
↓
Requirements Understood
↓
Budget / Scope Reasonable
↓
Mark Qualified
```

System:

```text
status = qualified
↓
activity created
↓
proposal action enabled
```

Not qualified path:

```text
Mark Lost
```

Require lost reason:

```text
Budget mismatch
Timing
No response
Not a fit
Chose competitor
Project cancelled
Other
```

---

# 13. CRM Pipeline Flow

Statuses:

```text
new
↓
contacted
↓
discovery
↓
qualified
↓
proposal
↓
negotiation
↓
won
```

Alternative:

```text
any active stage
→ lost
```

Drag-and-drop may update status.

Before update:

```text
Check permission
Validate transition
```

After update:

```text
Update status
Create activity
Refresh pipeline
```

Do not silently change status without activity history.

---

# 14. Lead Follow-Up Flow

Admin creates follow-up:

```text
Date
Time
Reason
Note
```

System:

```text
Store reminder
↓
Notify assigned user when due
```

Examples:

```text
Follow up after proposal
Ask for missing requirements
Confirm meeting
Check decision
```

Future automation may assist, but human control remains.

---

# 15. Proposal Creation Flow

V0.2

Entry:

```text
Qualified Lead
→ Create Proposal
```

System pre-fills:

```text
Lead Name
Business Name
Project Type
Known Requirements
```

Admin adds:

```text
Project Title
Overview
Problem
Solution
Scope
Features
Deliverables
Timeline
Line Items
Payment Terms
Terms
Validity
```

Flow:

```text
Draft
↓
Preview
↓
Review
↓
Send
```

Before sending:

- Validate totals
- Validate required sections
- Generate official proposal number
- Lock current version snapshot

---

# 16. Proposal Sending Flow

Admin clicks:

```text
Send Proposal
```

System:

```text
Validate status = draft
↓
Generate proposal number
↓
Save version snapshot
↓
status = sent
↓
sent_at = now
↓
Send secure link
↓
Create activity
```

Lead status may become:

```text
proposal
```

---

# 17. Proposal Client View Flow

Client opens secure proposal link.

Flow:

```text
View Proposal
↓
System records viewed_at
↓
Status becomes viewed if first view
```

Actions:

```text
Accept
Request Changes
Decline
```

---

# 18. Proposal Acceptance Flow

Client clicks:

```text
Accept Proposal
```

System:

```text
Verify access
↓
Verify proposal is still valid
↓
Verify current status
↓
Accept atomically
↓
accepted_at = now
↓
Create activity
↓
Notify Nexfora
```

Then optionally:

```text
Lead status → won
↓
Offer Convert to Client
```

Do not automatically create duplicate client/project records.

---

# 19. Proposal Changes Requested Flow

Client clicks:

```text
Request Changes
```

Requires:

```text
Message / Requested Changes
```

System:

```text
status = changes_requested
↓
Activity created
↓
Notify assigned admin
```

Admin may:

```text
Revise Proposal
↓
Create New Version
↓
Resend
```

Do not overwrite accepted or historical versions.

---

# 20. Negotiation Flow

After proposal:

```text
Proposal Sent
↓
Client Questions / Price Discussion / Scope Changes
↓
Lead status = negotiation
```

Possible outcomes:

```text
Revised Proposal
Won
Lost
```

All important changes should be documented in activity.

---

# 21. Lead Won Flow

Admin marks:

```text
Won
```

Preconditions:

- Decision confirmed
- Proposal accepted or owner explicitly confirms
- No existing converted client unless intentional

System:

```text
status = won
↓
Create activity
↓
Enable Convert to Client
```

Optional future automation may prompt conversion immediately.

---

# 22. Lead to Client Conversion Flow

Primary flow:

```text
Lead Won
↓
Convert to Client
↓
Review Client Details
↓
Confirm Conversion
```

System must:

```text
Check converted_client_id
↓
If already converted, return existing client
↓
Create client
↓
Copy approved lead details
↓
Set source_lead_id
↓
Set leads.converted_client_id
↓
Set converted_at
↓
Create activities
```

Optional:

```text
Create Initial Project
Invite Client Later
```

Must be idempotent.

---

# 23. Client Creation Flow

Manual alternative:

```text
Admin
→ Add Client
```

Fields:

```text
Business Name
Contact Name
Email
Phone
Industry
Website
Billing Address
Internal Notes
```

System:

```text
Validate
↓
Create client
↓
Activity / audit where appropriate
```

---

# 24. Client Detail Flow

Route:

```text
/admin/clients/[id]
```

Sections:

```text
Overview
Contact
Projects
Proposals
Invoices
Files
Support
Activity
Internal Notes
```

Primary actions:

```text
Create Project
Invite Client
Create Proposal
Create Invoice
Archive Client
```

Actions shown depend on phase and permissions.

---

# 25. Project Creation Flow

Entry points:

```text
Lead Conversion
Client Detail
Manual Admin Creation
```

Fields:

```text
Project Name
Client
Description
Project Manager
Priority
Start Date
Target Date
Template / Milestones
```

System:

```text
Validate client
↓
Create project
↓
Assign project manager
↓
Create default milestones if selected
↓
Create activity
```

Initial status:

```text
planning
```

---

# 26. Project Workflow

Typical lifecycle:

```text
planning
↓
design
↓
development
↓
integration
↓
testing
↓
client_review
↓
deployment
↓
completed
```

Alternative:

```text
on_hold
cancelled
```

Not every project must use every stage.

Example:

Simple website may skip:

```text
integration
```

---

# 27. Project Detail Flow

Route:

```text
/admin/projects/[id]
```

Sections:

```text
Overview
Progress
Milestones
Tasks
Team
Files
Revisions
Invoices
Activity
Client Updates
```

Primary actions:

```text
Change Status
Add Milestone
Add Task
Assign Team
Upload File
Send Client Update
Create Invoice
Complete Project
```

---

# 28. Milestone Flow

Admin/project manager:

```text
Create Milestone
```

Data:

```text
Title
Description
Due Date
Sort Order
```

Statuses:

```text
pending
in_progress
completed
blocked
```

Flow:

```text
pending
↓
in_progress
↓
completed
```

Blocked branch:

```text
in_progress
→ blocked
→ in_progress
```

Completion may update project progress.

---

# 29. Task Flow

Create task:

```text
Title
Description
Milestone
Assignee
Priority
Due Date
```

Statuses:

```text
todo
↓
in_progress
↓
review
↓
done
```

Alternative:

```text
in_progress
→ blocked
```

Actions should create relevant project activity where useful.

---

# 30. Team Assignment Flow

Project manager/admin:

```text
Add Team Member
↓
Choose Role
↓
Confirm
```

System:

```text
Verify organization membership
↓
Create project_members row
↓
Notify team member
```

Removing a member should not delete historical task attribution.

---

# 31. Project Progress Flow

Preferred calculation:

```text
Completed Tasks
÷
Total Eligible Tasks
```

or milestone-based weighting.

UI shows:

```text
Progress %
Current Stage
Next Milestone
Overdue Items
```

Clients only see approved client-facing progress.

---

# 32. Client Invitation Flow

V0.2

Admin:

```text
Invite Client
```

Fields:

```text
Email
Client Role
Expiration
```

System:

```text
Validate client
↓
Create secure invitation
↓
Send email
↓
Status = pending
```

Client:

```text
Open Invite
↓
Create / Sign Into Account
↓
Validate Token
↓
Create client_users membership
↓
Invitation = accepted
↓
Redirect to Portal
```

---

# 33. Client Portal Login Flow

```text
/portal
↓
Not authenticated?
→ Login
↓
Authenticated
↓
Resolve client membership
↓
Load permitted client dashboard
```

If no active client membership:

```text
Access denied / invitation required
```

Never default to showing arbitrary client data.

---

# 34. Client Portal Dashboard Flow

Client sees:

```text
Welcome
Active Projects
Project Progress
Current Phase
Next Milestone
Required Action
Recent Files
Open Revisions
Outstanding Invoice
Support
```

Primary actions:

```text
View Project
Upload Requested File
Submit Revision
View Invoice
Create Support Ticket
```

---

# 35. Client Project View Flow

Route:

```text
/portal/projects/[id]
```

Before load:

```text
Authenticate
↓
Resolve client membership
↓
Verify project.client_id
↓
Fetch client-safe fields only
```

Display:

```text
Project Name
Status
Progress
Current Phase
Milestones
Client-visible files
Revisions
Client actions
```

Do not expose:

```text
Internal Notes
Internal Financial Data
Team Private Notes
Internal Task Comments
Other Clients
```

---

# 36. Client Required Action Flow

Project manager may create a client-required action.

Examples:

```text
Upload Logo
Approve Design
Review Content
Confirm Product List
Pay Invoice
```

Client portal shows:

```text
Action Required
```

Flow:

```text
Client opens action
↓
Completes requirement
↓
System records completion
↓
Notify project team
```

Future dedicated table may be added if needed.

---

# 37. File Upload Flow — Internal

Admin/team:

```text
Choose Project
↓
Select File
↓
Choose Visibility
Internal / Client
↓
Upload
```

System:

```text
Validate file
↓
Authorize project access
↓
Upload to private storage
↓
Create project_files metadata
↓
Activity if needed
```

---

# 38. File Upload Flow — Client

Client:

```text
Open Project
↓
Upload File
```

Before upload:

```text
Authenticate
↓
Verify client owns project
↓
Validate file type / size
```

System:

```text
Upload private storage
↓
Create metadata
↓
Mark visibility appropriately
↓
Notify project team
```

Client must not choose unrestricted internal visibility rules.

---

# 39. File Download Flow

```text
User clicks file
↓
Authenticate
↓
Authorize file access
↓
Generate temporary signed URL
↓
Open/download
```

Never expose permanent private bucket URLs.

---

# 40. Revision Submission Flow

V0.2

Client:

```text
Open Project
↓
Submit Revision
```

Fields:

```text
Page
Section
Title
Description
Screenshot / Attachment
Priority
```

System:

```text
Verify client access
↓
Create revision
↓
status = submitted
↓
Notify project team
```

---

# 41. Revision Workflow

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

Rejection loop:

```text
ready_for_review
↓
rejected
↓
in_progress
```

Every important status change should be traceable.

---

# 42. Revision Review Flow — Internal

Admin/project manager:

```text
Open Revision
↓
Review Request
↓
Clarify if needed
↓
Assign Team Member
↓
Set In Progress
```

When finished:

```text
Mark Ready for Review
↓
Notify Client
```

---

# 43. Revision Approval Flow — Client

Client:

```text
Open Ready for Review
↓
Review Change
```

Actions:

```text
Approve
Request Further Changes
```

Approve:

```text
status = approved
↓
activity
↓
optional close
```

Further changes:

```text
status = rejected
↓
comment required
↓
notify team
```

---

# 44. Invoice Creation Flow

V0.3

Admin:

```text
Client / Project
↓
Create Invoice
```

Fields:

```text
Line Items
Quantity
Unit Price
Tax
Discount
Issue Date
Due Date
Notes
```

System:

```text
Calculate totals server-side
↓
Save draft
```

Actions:

```text
Preview
Send
Void
```

---

# 45. Invoice Sending Flow

```text
Draft Invoice
↓
Validate
↓
Generate Official Invoice Number
↓
status = sent
↓
sent_at
↓
Send to client
↓
Notify client
```

Client portal displays the invoice.

---

# 46. Payment Flow — Manual

Admin records bank/GCash/manual payment:

```text
Open Invoice
↓
Record Payment
```

Fields:

```text
Amount
Method
Reference
Paid Date
Notes
```

System:

```text
Validate amount
↓
Create payment
↓
Recalculate amount_paid
↓
Set invoice status
```

Possible:

```text
partial
paid
```

Audit log required.

---

# 47. Payment Flow — PayMongo

Future:

```text
Client opens invoice
↓
Pay Now
↓
Create PayMongo session
↓
Client completes payment
↓
Provider sends webhook
↓
Verify webhook
↓
Idempotency check
↓
Create/update payment
↓
Recalculate invoice
↓
Notify client/admin
```

Browser redirect alone must never mark invoice as paid.

---

# 48. Overdue Invoice Flow

Scheduled process:

```text
Invoice due date passed
AND
balance > 0
↓
status = overdue
↓
Notify admin
↓
Optional client reminder
```

Reminder frequency should avoid spam.

---

# 49. Project Completion Flow

Project manager/admin:

```text
Confirm:
Tasks complete
Testing complete
Client approval complete
Required payment state acceptable
Deployment complete
```

Then:

```text
Mark Project Completed
↓
completed_at = now
↓
Final activity
↓
Notify client
↓
Offer support / maintenance
```

---

# 50. Deployment Flow

Typical:

```text
Testing Complete
↓
Client Approval
↓
Production Readiness Check
↓
Deploy
↓
Verify Production
↓
Record Deployment Details
↓
Status = completed or deployment
```

Deployment details may include:

```text
Domain
Hosting
Launch Date
Environment Notes
```

---

# 51. Support Ticket Creation Flow

V0.3

Client:

```text
Support
↓
Create Ticket
```

Fields:

```text
Project
Category
Title
Description
Priority
Attachment
```

System:

```text
Validate ownership
↓
Create ticket
↓
Generate ticket number
↓
status = open
↓
Notify Nexfora
```

---

# 52. Support Workflow

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

Possible loop:

```text
waiting_for_client
→ in_progress
```

---

# 53. Support Resolution Flow

Team:

```text
Resolve Issue
↓
Mark Resolved
↓
Add Resolution Note
↓
Notify Client
```

Client may:

```text
Confirm
→ Closed
```

or:

```text
Issue persists
→ Reopen / Return to In Progress
```

---

# 54. Maintenance Subscription Flow

V0.3

Admin:

```text
Create Maintenance Plan
↓
Assign Client
↓
Set Billing Cycle
↓
Set Included Services / Hours
↓
Activate
```

Client portal may show:

```text
Plan
Status
Renewal Date
Included Hours
Used Hours
Support Access
```

---

# 55. Maintenance Usage Flow

When Nexfora performs covered work:

```text
Record Service Usage
↓
Description
Hours Used
Date
```

System:

```text
Update usage total
↓
Display remaining allowance
```

Do not deduct hours invisibly.

---

# 56. Notification Flow

Triggered by domain event:

```text
Event Occurs
↓
Determine Recipients
↓
Create In-App Notification
↓
Send Email if configured
```

Examples:

```text
lead.created
proposal.sent
proposal.accepted
revision.created
invoice.sent
payment.verified
ticket.created
project.completed
```

Avoid duplicate notifications for the same event.

---

# 57. Search Flow

Admin uses global or module search.

Flow:

```text
Enter Search
↓
Server validates query
↓
Search only authorized records
↓
Return grouped results
```

Possible groups:

```text
Leads
Clients
Projects
Proposals
Invoices
Tickets
```

Search must never bypass RLS or permissions.

---

# 58. Archive Client Flow

Admin:

```text
Archive Client
```

Before action:

```text
Show confirmation
Explain impact
```

System:

```text
status = archived
↓
Preserve projects / financial records
↓
Create audit log
```

Do not hard delete normal historical client data.

---

# 59. Cancel Project Flow

Admin/project manager:

```text
Cancel Project
```

Require:

```text
Reason
```

System:

```text
status = cancelled
↓
Preserve history
↓
Create activity
↓
Notify relevant users
```

Do not delete the project.

---

# 60. Lost Lead Flow

Admin marks:

```text
Lost
```

Require reason.

System:

```text
status = lost
↓
lost_reason saved
↓
activity created
```

Possible future:

```text
Reopen Lead
```

with traceable activity.

---

# 61. Authentication Flow — Internal User

```text
Login
↓
Supabase Auth
↓
Resolve Profile
↓
Resolve Organization Membership
↓
Check Active Status
↓
Redirect to /admin
```

Failure cases:

```text
Invalid credentials
No membership
Suspended membership
Expired session
```

---

# 62. Authentication Flow — Client

```text
Login
↓
Supabase Auth
↓
Resolve Profile
↓
Resolve Client Membership
↓
Check Active Status
↓
Redirect to /portal
```

Client should not be redirected into admin.

---

# 63. Unauthorized Access Flow

Example:

Client manually enters:

```text
/admin/leads
```

System:

```text
Authenticate
↓
Role check fails
↓
Deny access
```

Do not rely on hidden navigation.

Show safe response:

```text
You don't have permission to access this page.
```

---

# 64. Cross-Client Access Flow

Client A requests Project B ID.

System:

```text
Authenticate Client A
↓
Resolve client_id
↓
Compare project.client_id
↓
Mismatch
↓
Deny
```

Return:

```text
Not Found
or
Forbidden
```

Do not leak whether another client's record exists.

---

# 65. Role Change Flow

Super admin/admin where permitted:

```text
Open Team Member
↓
Change Role
↓
Confirm
```

System:

```text
Verify actor permission
↓
Validate target role
↓
Prevent unsafe last-super-admin removal
↓
Update role
↓
Create audit log
```

---

# 66. Invite Internal Team Member Flow

Admin:

```text
Add Team Member
↓
Enter Email
↓
Choose Role
↓
Send Invite
```

User:

```text
Accept Invite
↓
Create/Sign In
↓
Organization Membership Activated
```

---

# 67. Dashboard Flow — Admin

Route:

```text
/admin/dashboard
```

Display actionable information:

```text
New Leads
Pipeline Value
Active Projects
Pending Proposals
Outstanding Invoices
Open Revisions
Open Support Tickets
Upcoming Deadlines
Recent Activity
```

Each card should link to the relevant module.

Avoid decorative metrics with no action.

---

# 68. Dashboard Flow — Client

Route:

```text
/portal
```

Display:

```text
Active Project
Progress
Current Stage
Next Milestone
Required Action
Recent Files
Revision Status
Outstanding Invoice
Support
```

Prioritize clarity over internal detail.

---

# 69. Empty State Flow

Every module requires an empty state.

Example Leads:

```text
No leads yet.

New project inquiries will appear here.

[ View Public Inquiry Form ]
```

Example Projects:

```text
No projects yet.

Create a project after converting a client.

[ Create Project ]
```

---

# 70. Loading State Flow

During data load:

```text
Show skeleton
↓
Data resolves
↓
Render content
```

During action:

```text
Disable duplicate submit
↓
Show pending state
↓
Success / error feedback
```

---

# 71. Form Error Flow

Invalid form:

```text
User submits
↓
Validation fails
↓
Show field-specific errors
↓
Preserve entered data
```

Do not reset the form.

---

# 72. Server Error Flow

```text
Action starts
↓
Server fails
↓
Log technical details
↓
Return safe error
↓
Show actionable UI message
```

Example:

```text
We couldn't save this lead update.
Your changes were not applied.
Please try again.
```

---

# 73. Duplicate Submission Flow

Critical forms should protect against repeated clicks.

Examples:

```text
Public inquiry
Lead conversion
Proposal acceptance
Payment processing
Client invitation
```

System should use:

```text
Disabled submit
Server idempotency
Unique constraints where relevant
```

---

# 74. Mobile Flow Principles

On mobile:

- Main action remains visible
- Multi-step forms remain easy to navigate
- CRM pipeline may become stacked/list view
- Tables become responsive
- Sidebar becomes drawer
- Important controls use adequate touch targets

Do not force desktop-only interactions like drag-and-drop as the only option.

---

# 75. Activity Logging Rules

Create activity for meaningful business changes.

Examples:

```text
Status Changed
Lead Assigned
Discovery Scheduled
Proposal Sent
Client Created
Project Created
Milestone Completed
Revision Submitted
```

Do not spam activity with trivial UI events.

---

# 76. Audit Logging Rules

Audit sensitive actions:

```text
Role changed
Client archived
Project cancelled
Invoice voided
Payment manually recorded
File deleted
Permission changed
```

Audit log is not the same as normal activity timeline.

---

# 77. V0.1 User Flows

Build and validate these first:

```text
1. Internal Login
2. Public Project Inquiry
3. Lead Created
4. Lead Inbox
5. Lead Detail
6. Lead Status Change
7. Lead Notes / Activity
8. Discovery Tracking
9. Mark Qualified
10. Mark Won / Lost
11. Convert Lead to Client
12. Client List / Detail
13. Create Project
14. Project List / Detail
15. Milestones
16. Tasks
```

---

# 78. V0.2 User Flows

Add later:

```text
Cost Estimator
Proposal Creation
Proposal Sending
Proposal Acceptance
Client Invitation
Client Portal
Files
Revision Workflow
```

---

# 79. V0.3 User Flows

Add later:

```text
Invoice Creation
Invoice Sending
Payments
PayMongo
Support Tickets
Maintenance Plans
Renewals
```

---

# 80. V0.4 User Flows

Add later:

```text
AI Lead Summary
AI Proposal Draft
Automated Follow-Up Suggestions
Advanced Notifications
Reports
Operational Insights
```

---

# 81. Acceptance Criteria Pattern

Every feature should define:

```text
Given
When
Then
```

Example:

```text
Given an authenticated admin
and a lead with status "new"

When the admin marks the lead as "contacted"

Then the lead status becomes "contacted"
and a lead activity is created
and the updated status is visible in the CRM pipeline
```

---

# 82. Example Security Acceptance Criterion

```text
Given Client A is authenticated

When Client A requests a project owned by Client B

Then access is denied
and no Client B data is returned
and the attempt does not expose whether the project exists
```

---

# 83. Example Lead Conversion Acceptance Criterion

```text
Given a won lead has not been converted

When an authorized admin converts the lead

Then one client record is created
and the lead is linked to that client
and converted_at is set
and an activity is created

When the same conversion request is repeated

Then no duplicate client is created
and the existing client is returned
```

---

# 84. Example Project Creation Acceptance Criterion

```text
Given an active client exists

When an authorized admin creates a project

Then the project belongs to that client
and starts in planning status
and the selected project manager is assigned
and the project appears in both client and project records
```

---

# 85. Flow Design Principle

For every workflow, always ask:

```text
Who starts this?
What information is required?
What permission is required?
What database state changes?
What activity should be recorded?
Who needs to be notified?
What happens on failure?
What does the user see next?
```

---

# 86. Final User Flow Principle

NEXFORA OS should never feel like a collection of disconnected pages.

Every major action should naturally move the business forward:

```text
Lead
→ Opportunity
→ Client
→ Project
→ Delivery
→ Relationship
```

The governing user-flow principle is:

**Every screen should make the next useful action clear.**
