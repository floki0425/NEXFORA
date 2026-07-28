# DESIGN_SYSTEM.md — NEXFORA DIGITAL INNOVATION

## 1. Purpose

This document defines the official visual design system for:

- Nexfora Digital Innovation website
- NEXFORA OS admin dashboard
- NEXFORA Client Portal
- Internal tools
- Proposals and digital documents
- Future Nexfora digital products

All developers and AI agents must use this document as the primary visual reference unless explicitly instructed otherwise.

The goal is to maintain one consistent brand language across all Nexfora products.

---

# 2. Brand Foundation

## Brand Name

**NEXFORA Digital Innovation**

## Brand Essence

**Clean. Modern. Reliable. Built for what’s next.**

## Brand Tagline

**Technology built for what’s next.**

## Brand Personality

The Nexfora visual system should feel:

- Modern
- Premium
- Minimal
- Professional
- Trustworthy
- Technology-focused
- Structured
- Forward-looking

Avoid:

- Overly playful visuals
- Excessive gradients
- Too many accent colors
- Heavy glassmorphism
- Cartoon-style icons
- Cluttered dashboards
- Generic template appearance
- Excessive rounded cards
- Neon cyberpunk styling

---

# 3. Brand Logo

## Primary Logo

The primary logo consists of:

1. Stylized **N** symbol
2. **NEXFORA** wordmark
3. **DIGITAL INNOVATION** descriptor

Use the primary logo where there is enough horizontal space.

## Logo Mark

Use the stylized **N** symbol for:

- Favicon
- App icon
- Mobile navigation
- Dashboard collapsed sidebar
- Social profile image
- Small interface branding

## Logo Usage

Preferred logo placement:

- Top-left of navigation
- Top-left of dashboard sidebar
- Centered in authentication screens when appropriate
- Footer brand area

Always maintain sufficient whitespace around the logo.

Do not:

- Stretch or distort the logo
- Change the logo proportions
- Add shadows to the logo
- Add random gradients
- Rotate the logo
- Use unapproved colors
- Place the logo over visually noisy backgrounds without proper contrast

---

# 4. Official Color Palette

## Primary Black

```css
--nexfora-black: #0B0D12;
```

Use for:

- Primary text
- Primary buttons
- Dark navigation
- Dark CTA sections
- Admin sidebar
- Strong visual anchors

---

## Charcoal

```css
--nexfora-charcoal: #1A1D24;
```

Use for:

- Secondary dark surfaces
- Hover surfaces
- Dark cards
- Secondary dark sections
- Dark dashboard elements

---

## Nexfora Violet

```css
--nexfora-violet: #6366F1;
```

Use sparingly for:

- Active navigation
- Focus states
- Highlights
- Links
- Accent text
- Progress indicators
- Selected states
- Small visual emphasis

The violet accent must not dominate entire interfaces.

---

## Light Gray

```css
--nexfora-light-gray: #E5E7EB;
```

Use for:

- Borders
- Dividers
- Muted backgrounds
- Input borders
- Table separators
- Disabled states

---

## White

```css
--nexfora-white: #FFFFFF;
```

Use for:

- Primary page backgrounds
- Cards
- Light navigation
- Main dashboard content
- Client portal surfaces

---

# 5. Extended UI Color Tokens

The core brand colors remain the source of truth.

Supporting interface colors may be derived carefully.

```css
:root {
  --background: #FFFFFF;
  --foreground: #0B0D12;

  --surface: #FFFFFF;
  --surface-muted: #F7F7F8;
  --surface-dark: #0B0D12;
  --surface-dark-secondary: #1A1D24;

  --border: #E5E7EB;
  --border-strong: #D1D5DB;

  --text-primary: #0B0D12;
  --text-secondary: #4B5563;
  --text-muted: #6B7280;
  --text-on-dark: #FFFFFF;

  --accent: #6366F1;
  --accent-hover: #5558E6;
  --accent-soft: #EEF0FF;
}
```

Do not introduce new brand colors without a documented design-system update.

---

# 6. Semantic Status Colors

Status colors are functional, not primary branding.

Suggested semantic tokens:

```css
--success: #16A34A;
--success-soft: #F0FDF4;

--warning: #D97706;
--warning-soft: #FFFBEB;

--error: #DC2626;
--error-soft: #FEF2F2;

--info: #2563EB;
--info-soft: #EFF6FF;
```

Use these only when the color carries meaning.

Examples:

- Paid → success
- Overdue → error
- Pending → warning
- Information → info

Do not use semantic colors decoratively.

---

# 7. Typography

## Primary Typeface

**Inter**

Approved weights:

- Regular — 400
- Medium — 500
- Semi Bold — 600
- Bold — 700 only where necessary

Avoid excessive font-weight variation.

---

# 8. Typography Scale

Recommended desktop scale:

```css
--text-xs: 0.75rem;      /* 12px */
--text-sm: 0.875rem;     /* 14px */
--text-base: 1rem;       /* 16px */
--text-lg: 1.125rem;     /* 18px */
--text-xl: 1.25rem;      /* 20px */
--text-2xl: 1.5rem;      /* 24px */
--text-3xl: 1.875rem;    /* 30px */
--text-4xl: 2.25rem;     /* 36px */
--text-5xl: 3rem;        /* 48px */
--text-6xl: 3.75rem;     /* 60px */
--text-7xl: 4.5rem;      /* 72px */
```

---

# 9. Typography Usage

## Hero Headings

Use:

- 48–72px desktop
- 40–56px tablet
- 34–44px mobile

Style:

- Medium or Semi Bold
- Tight letter spacing
- Strong black foreground
- Optional violet accent on one key phrase only

Example:

```text
We build solutions.
You grow faster.
```

---

## Section Headings

Use:

- 32–48px desktop
- 28–36px mobile

Prefer concise headlines.

---

## Dashboard Page Titles

Use:

- 28–36px
- Medium or Semi Bold

Example:

```text
Leads
Projects
Invoices
```

---

## Body Copy

Use:

- 16–18px
- Regular
- Comfortable line height
- Maximum readable width

Recommended line-height:

```css
line-height: 1.6;
```

---

## Labels and Metadata

Use:

- 12–14px
- Medium
- Muted color

Use uppercase sparingly.

---

# 10. Layout Principles

Nexfora layouts should feel spacious and deliberate.

Core principles:

- Strong alignment
- Clear grid
- Generous whitespace
- Limited visual noise
- Clear hierarchy
- Consistent spacing
- Content-led design

Avoid filling every empty area.

Whitespace is part of the brand.

---

# 11. Spacing Scale

Use a consistent 4px base spacing system.

```text
4px
8px
12px
16px
20px
24px
32px
40px
48px
64px
80px
96px
120px
```

Preferred Tailwind mapping:

```text
1  = 4px
2  = 8px
3  = 12px
4  = 16px
5  = 20px
6  = 24px
8  = 32px
10 = 40px
12 = 48px
16 = 64px
20 = 80px
24 = 96px
30 = 120px
```

---

# 12. Container Widths

Public website:

```css
max-width: 1440px;
```

Primary content:

```css
max-width: 1280px;
```

Readable text content:

```css
max-width: 720px;
```

Dashboard:

- Full-width application shell
- Main content centered where appropriate
- Avoid overly narrow dashboards

---

# 13. Grid System

Use:

- 12-column desktop grid
- 8-column tablet grid
- 4-column mobile grid

Recommended gaps:

```text
Desktop: 24–32px
Tablet: 20–24px
Mobile: 16px
```

---

# 14. Border Radius

Nexfora should not feel overly rounded.

Recommended:

```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
```

Use:

- Inputs: 8px
- Buttons: 8px
- Standard cards: 12px
- Large feature cards: 16px

Avoid pill-shaped containers unless the component is actually a badge, filter, or chip.

---

# 15. Shadows

Use subtle shadows only when necessary.

Preferred:

```css
--shadow-sm:
  0 1px 2px rgba(11, 13, 18, 0.04);

--shadow-md:
  0 8px 24px rgba(11, 13, 18, 0.08);
```

Avoid:

- Strong black drop shadows
- Colored glow effects
- Excessive elevation

Prefer borders and spacing over shadows.

---

# 16. Buttons

## Primary Button

Use for the most important action.

```text
Background: #0B0D12
Text: #FFFFFF
Border: #0B0D12
Radius: 8px
```

Examples:

```text
Start a Project
Create Proposal
Save Changes
Send Proposal
```

Hover:

```text
#1A1D24
```

---

## Accent Button

Use only for selected high-emphasis actions.

```text
Background: #6366F1
Text: #FFFFFF
```

Do not use violet for every primary action.

---

## Secondary Button

```text
Background: #FFFFFF
Text: #0B0D12
Border: #D1D5DB
```

Examples:

```text
Cancel
View Details
Preview
```

---

## Ghost Button

Use for low-priority controls.

No strong background.

Examples:

```text
More
Filter
Close
```

---

## Destructive Button

Use only for destructive actions.

Examples:

```text
Delete Project
Remove User
Void Invoice
```

Must use a confirmation pattern for irreversible actions.

---

# 17. Button Sizes

```text
Small:
32–36px height

Default:
40–44px height

Large:
48–52px height
```

Touch targets should be at least 44px where practical.

---

# 18. Links

Default:

```text
Color: #0B0D12
```

Accent links:

```text
Color: #6366F1
```

Use underlines or clear hover states where needed.

Do not rely on color alone for important interaction feedback.

---

# 19. Cards

Cards should be simple.

Default:

```text
Background: White
Border: #E5E7EB
Radius: 12px
Shadow: none or subtle
Padding: 20–24px
```

Use cards only when grouping content improves clarity.

Avoid turning every section into a card.

---

# 20. Dashboard Statistic Cards

Recommended structure:

```text
Label
Primary Metric
Trend / Secondary Context
```

Example:

```text
New Leads
12
+18% this month
```

Do not overload statistic cards with charts and multiple actions.

---

# 21. Forms

Inputs should feel clean and professional.

Default:

```text
Height: 44px
Border: #D1D5DB
Radius: 8px
Background: #FFFFFF
Text: #0B0D12
```

Focus:

```text
Border: #6366F1
Focus Ring: subtle violet
```

Disabled:

```text
Background: #F7F7F8
Text: muted
```

Error:

```text
Border: semantic error
Message below field
```

---

# 22. Form Labels

Use labels above fields.

Never rely only on placeholders.

Example:

```text
Business Name

[ Kuya King's                         ]
```

Optional helper text can appear below the label or field.

---

# 23. Tables

Use tables for structured operational data.

Recommended:

```text
White background
Subtle row separators
Minimal vertical borders
Sticky header when useful
Row hover state
```

Header text:

- 12–14px
- Medium
- Muted

Body text:

- 14–16px

Examples:

```text
Leads
Clients
Projects
Invoices
Support tickets
Audit logs
```

---

# 24. Status Badges

Use compact rounded badges.

Example:

```text
NEW
QUALIFIED
WON
PAID
OVERDUE
IN PROGRESS
```

Status badges should use semantic colors where applicable.

Use restrained backgrounds.

Do not use fully saturated colors for large badge areas.

---

# 25. Sidebar — NEXFORA OS

Recommended admin sidebar:

```text
Background: #0B0D12
Text: muted white / gray
Active item: White or subtle violet accent
Icons: simple line icons
```

Structure:

```text
NEXFORA OS

Dashboard

WORK
Leads
Clients
Projects
Proposals
Invoices

OPERATIONS
Revisions
Support
Files

SYSTEM
Reports
Settings
```

Collapsed state may use only the Nexfora N mark.

---

# 26. Dashboard Topbar

Recommended:

```text
Search
Notifications
Quick action
User profile
```

Keep the topbar minimal.

Avoid too many global actions.

---

# 27. Public Website Navigation

Preferred style:

- White background
- Black logo
- Compact navigation
- Strong right-side CTA

Example:

```text
NEXFORA

Home
Solutions
Work
Process
About
Insights

[ Start a Project ]
```

Sticky navigation is allowed.

Use a subtle border when scrolling.

---

# 28. Public Website Hero

Preferred structure:

```text
Eyebrow label

Large headline

Short supporting paragraph

Primary CTA
Secondary CTA

System/product visual
```

Example tone:

```text
DIGITAL SOLUTIONS THAT EMPOWER GROWTH

We build solutions.
You grow faster.
```

Hero visuals should use:

- Product UI
- Dashboards
- Real systems
- Device mockups
- Abstract system diagrams

Avoid generic stock photos of people using laptops.

---

# 29. Section Design

Use varied but consistent layouts:

- Editorial split sections
- Large service grids
- Full-width system visuals
- Dark CTA sections
- Case-study cards
- Metrics
- Process steps

Alternate light and dark sections sparingly.

Do not alternate every single section.

---

# 30. Service Cards

Recommended structure:

```text
Icon
Service Name
Short Description
Optional Link
```

Examples:

```text
Web Development
E-Commerce
Web Applications
Mobile Applications
Custom Systems
UI/UX Design
```

Icons should be:

- Minimal
- Consistent stroke weight
- Monochrome by default
- Violet only for active/accent states

---

# 31. Case Studies

Case studies should feel editorial, not like simple portfolio thumbnails.

Recommended card:

```text
Project Image
Industry
Project Name
Short Outcome
Services
View Case Study
```

Detail structure:

```text
Problem
Strategy
Solution
System
Result
```

---

# 32. Dark Sections

Dark sections may use:

```text
Background: #0B0D12
Secondary: #1A1D24
Text: #FFFFFF
Muted text: light gray
Accent: #6366F1
```

Use dark sections for:

- CTA
- Selected feature areas
- Footer
- Dashboard sidebar

Do not make the entire public website dark by default.

---

# 33. Client Portal

The client portal should feel simpler than the admin dashboard.

Priority:

1. Project status
2. Next milestone
3. Required client action
4. Files
5. Revisions
6. Invoices
7. Support

Avoid exposing internal complexity.

Example dashboard:

```text
Welcome, Kuya King's

Project Progress
65%

Current Phase
Development

Next Milestone
Admin Dashboard Review

[ View Project ]
```

---

# 34. Empty States

Every major module must have a designed empty state.

Example:

```text
No leads yet

New project inquiries will appear here.

[ View Inquiry Form ]
```

Avoid blank screens.

---

# 35. Loading States

Use:

- Skeletons for content areas
- Button pending states
- Table row skeletons
- Inline loading feedback

Avoid full-screen spinners for small actions.

---

# 36. Error States

Errors should be clear and actionable.

Example:

```text
We couldn't load your leads.

Please try again.

[ Retry ]
```

Never display raw technical errors.

---

# 37. Modals and Dialogs

Use dialogs only for:

- Confirmations
- Short forms
- Focused decisions

Do not place long multi-step workflows inside small modals.

Use dedicated pages or drawers for complex flows.

---

# 38. Drawers

Drawers work well for:

- Quick lead preview
- Filters
- Activity details
- Notifications
- Small edit forms

Avoid stacking multiple drawers.

---

# 39. Charts and Analytics

Charts should be minimal.

Use:

- Neutral axes
- Black/gray base
- Violet primary data series
- Semantic colors only when meaningful

Avoid rainbow charts.

Recommended chart types:

- Line
- Bar
- Area
- Donut only when appropriate

Do not use 3D charts.

---

# 40. Motion

Motion should be subtle and functional.

Recommended duration:

```text
Fast: 120–160ms
Default: 180–240ms
Large transitions: 250–350ms
```

Use for:

- Hover
- Drawer
- Modal
- Dropdown
- Page section reveal
- Progress transitions

Avoid excessive parallax and decorative animation.

---

# 41. Responsive Breakpoints

Suggested:

```text
Mobile: < 640px
Small tablet: 640px+
Tablet: 768px+
Laptop: 1024px+
Desktop: 1280px+
Large: 1536px+
```

Design mobile intentionally.

Do not simply shrink desktop layouts.

---

# 42. Mobile Rules

On mobile:

- Stack content clearly
- Reduce heading sizes
- Keep 16px minimum body text
- Use full-width CTA buttons when useful
- Convert tables into responsive patterns
- Collapse admin sidebar
- Keep critical actions reachable
- Preserve 44px touch targets

---

# 43. Accessibility

Required:

```text
WCAG-conscious contrast
Keyboard navigation
Visible focus states
Semantic headings
Accessible labels
Alt text
Reduced motion support
Proper button/link semantics
```

Never remove focus outlines without replacing them.

---

# 44. Iconography

Preferred icon style:

- Simple line icons
- Consistent stroke
- Minimal detail
- Rounded or square style consistently

Recommended libraries:

- Lucide Icons
- Heroicons where needed

Do not mix many unrelated icon libraries.

---

# 45. Image Direction

Preferred imagery:

- Real software interfaces
- Website mockups
- Product screenshots
- Device frames
- Business systems
- Abstract architecture diagrams
- High-quality project photography where relevant

Avoid:

- Generic corporate stock photos
- Fake handshake photography
- Random AI faces
- Busy technology backgrounds
- Excessive 3D decorative objects

---

# 46. Data Density

Admin interfaces may be information-dense but must remain readable.

Use:

- Clear hierarchy
- Progressive disclosure
- Filters
- Tabs
- Detail drawers
- Pagination

Do not display every possible field at once.

---

# 47. Core Component Inventory

The shared UI system should include:

```text
Button
IconButton
Input
Textarea
Select
Checkbox
Radio
Switch
Badge
Avatar
Card
StatCard
Table
Pagination
Tabs
Breadcrumb
Tooltip
Dropdown
Dialog
Drawer
Toast
Alert
Skeleton
EmptyState
DatePicker
Command/Search
FileUploader
Progress
Stepper
Timeline
```

Reuse these components across all application surfaces.

---

# 48. Domain Components

NEXFORA OS should create domain-level components such as:

```text
LeadCard
LeadPipeline
LeadStatusBadge
LeadActivityTimeline

ClientCard
ClientSummary

ProjectCard
ProjectProgress
ProjectStatusBadge
MilestoneList

ProposalStatusBadge
ProposalSummary

InvoiceStatusBadge
InvoiceSummary

RevisionCard
RevisionStatusBadge

SupportTicketCard
SupportPriorityBadge
```

Do not duplicate these patterns per page.

---

# 49. Design Tokens

Recommended implementation:

```css
:root {
  --color-black: #0B0D12;
  --color-charcoal: #1A1D24;
  --color-violet: #6366F1;
  --color-gray-200: #E5E7EB;
  --color-white: #FFFFFF;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
}
```

Tokens should be used instead of repeated hardcoded values.

---

# 50. Tailwind Direction

When using Tailwind:

- Use shared CSS variables / design tokens
- Do not scatter arbitrary hex values everywhere
- Create reusable variants
- Use shared container utilities
- Keep spacing consistent

Example:

```tsx
<Button variant="primary">
  Start a Project
</Button>
```

Preferred over repeatedly writing long inconsistent class lists.

---

# 51. Design Review Checklist

Before considering a UI complete, verify:

```text
✓ Uses official palette
✓ Uses Inter
✓ Correct spacing
✓ Correct border radius
✓ Minimal visual noise
✓ Clear hierarchy
✓ Consistent buttons
✓ Responsive layout
✓ Accessible contrast
✓ Visible focus states
✓ Loading state
✓ Empty state
✓ Error state
✓ Mobile verified
✓ No random new colors
✓ No inconsistent icon style
```

---

# 52. Brand Consistency Rule

When a developer or AI agent is uncertain about a visual decision, default to:

```text
Simpler
Cleaner
More whitespace
Less color
Stronger typography
Clearer hierarchy
```

Do not add visual complexity simply to make a page look more “designed.”

---

# 53. Final Visual Principle

Nexfora should feel like a serious technology company, not a template marketplace agency.

The visual system must communicate:

```text
Clarity
Capability
Trust
Technology
Scalability
Precision
```

The final design principle is:

**Clean. Modern. Reliable. Built for what’s next.**
