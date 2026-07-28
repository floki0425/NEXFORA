# NEXFORA Digital Innovation — Design System

**Version:** 1.0  
**Status:** Web Design Foundation  
**Depends on:** `BRAND.md`

This document translates the approved NEXFORA brand into reusable UI rules for the public website and future NEXFORA digital products.

---

## 1. Design Principles

Every NEXFORA interface should be:

1. **Clear** — users understand the page purpose quickly.
2. **Structured** — layouts follow a consistent grid and hierarchy.
3. **Minimal** — remove visual elements that do not serve a purpose.
4. **Premium** — spacing, typography, imagery, and motion feel intentional.
5. **Reliable** — interactions are predictable and accessible.
6. **Modern** — current without relying on short-lived visual trends.
7. **Scalable** — components and tokens can extend into NEXFORA OS.

---

## 2. Design Tokens

### 2.1 Core Brand Colors

```css
--nx-black: #0B0D12;
--nx-graphite: #1A1D24;
--nx-indigo: #6366F1;
--nx-gray-200: #E5E7EB;
--nx-white: #FFFFFF;
```

### 2.2 Semantic Light Theme

```css
--background: #FFFFFF;
--surface: #FFFFFF;
--surface-subtle: #F7F7F8;
--surface-muted: #F1F2F4;

--text-primary: #0B0D12;
--text-secondary: #4B4F58;
--text-muted: #6B7280;
--text-inverse: #FFFFFF;

--border-subtle: #E5E7EB;
--border-strong: #C9CDD4;

--brand-primary: #0B0D12;
--brand-accent: #6366F1;
--brand-accent-hover: #5558E6;
```

`#F7F7F8`, `#F1F2F4`, `#4B4F58`, `#6B7280`, `#C9CDD4`, and `#5558E6` are implementation neutrals/interaction tokens derived for UI use. They are not replacement core brand colors.

### 2.3 Semantic Dark Theme

```css
--background-dark: #0B0D12;
--surface-dark: #1A1D24;
--surface-dark-elevated: #222630;

--text-dark-primary: #FFFFFF;
--text-dark-secondary: #C7CAD1;
--border-dark: #313640;

--brand-accent-dark: #6366F1;
```

### 2.4 Status Colors

Status colors are functional UI colors, not primary brand colors.

```css
--success: #16A34A;
--warning: #D97706;
--error: #DC2626;
--info: #2563EB;
```

Use status colors only when communicating state.

---

## 3. Typography

### Typeface
**Inter**

Preferred weights:
- 400 Regular
- 500 Medium
- 600 Semi Bold

### Type Scale

#### Display XL
- Desktop: 72px / 1.00
- Tablet: 56px / 1.02
- Mobile: 44px / 1.05
- Weight: 600
- Letter spacing: -0.04em

#### Display
- Desktop: 64px / 1.03
- Tablet: 48px / 1.05
- Mobile: 40px / 1.08
- Weight: 600
- Letter spacing: -0.035em

#### H1
- Desktop: 56px / 1.05
- Tablet: 44px / 1.08
- Mobile: 36px / 1.10
- Weight: 600
- Letter spacing: -0.03em

#### H2
- Desktop: 44px / 1.10
- Tablet: 38px / 1.12
- Mobile: 32px / 1.15
- Weight: 600
- Letter spacing: -0.025em

#### H3
- Desktop: 30px / 1.18
- Mobile: 26px / 1.20
- Weight: 600
- Letter spacing: -0.015em

#### H4
- 22px / 1.30
- Weight: 600

#### Body Large
- 18px / 1.65
- Weight: 400

#### Body
- 16px / 1.65
- Weight: 400

#### Body Small
- 14px / 1.55
- Weight: 400

#### Label
- 13px / 1.35
- Weight: 500

#### Eyebrow
- 12px / 1.25
- Weight: 600
- Uppercase
- Letter spacing: 0.10em
- Preferred color: `#6366F1`

### Text Width
For readability:
- Standard paragraph max width: `65ch`
- Hero supporting copy: `48–58ch`
- Do not stretch paragraph copy across full desktop containers.

---

## 4. Spacing System

Use a 4px base unit.

```text
0   = 0
1   = 4px
2   = 8px
3   = 12px
4   = 16px
5   = 20px
6   = 24px
8   = 32px
10  = 40px
12  = 48px
16  = 64px
20  = 80px
24  = 96px
28  = 112px
32  = 128px
36  = 144px
```

### Section Spacing
- Desktop: 112–144px vertical
- Tablet: 80–112px
- Mobile: 64–80px

Do not use arbitrary spacing values unless a specific layout requires it.

---

## 5. Grid & Containers

### Max Width
Primary content container:
- `1280px`

Wide visual container:
- `1440px` maximum when needed for full compositions

### Gutters
- Desktop: 32–48px
- Tablet: 24–32px
- Mobile: 20px

### Grid
- Desktop: 12 columns
- Tablet: 8 columns
- Mobile: 4 columns

### Breakpoints
Recommended:
```text
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

Use responsive behavior based on content, not only device labels.

---

## 6. Border Radius

NEXFORA should use controlled—not excessively rounded—corners.

```text
xs: 4px
sm: 6px
md: 10px
lg: 14px
xl: 20px
full: 9999px (only for badges/chips where appropriate)
```

Default:
- Buttons: `6–8px`
- Inputs: `8px`
- Cards: `10–14px`
- Large media panels: up to `20px`

Avoid giant 30–40px radii on ordinary cards.

---

## 7. Borders & Dividers

Use thin structural lines as a key brand device.

```css
border: 1px solid #E5E7EB;
```

Use for:
- Cards
- Service grids
- Navigation separation
- Form controls
- Section architecture
- Tables

Avoid heavy outlines unless necessary for active/error states.

---

## 8. Shadows

Shadows should be subtle and rare.

### Small
```css
0 1px 2px rgba(11, 13, 18, 0.06)
```

### Medium
```css
0 12px 30px rgba(11, 13, 18, 0.08)
```

### Large / Product Mockup
```css
0 24px 60px rgba(11, 13, 18, 0.12)
```

Rules:
- Prefer borders and tonal contrast before shadows.
- Avoid glow effects.
- Avoid colored shadows.
- Do not make every card float.

---

## 9. Buttons

### Base
- Height: 44–48px
- Horizontal padding: 18–22px
- Radius: 6–8px
- Label: Inter Semi Bold, 13–14px
- Optional uppercase only for selected marketing CTAs
- Transition: 180–220ms

### Primary
- Background: `#0B0D12`
- Text: `#FFFFFF`
- Hover: `#1A1D24`
- Focus ring: `#6366F1`
- Disabled: reduced contrast and no pointer action

### Accent
Use sparingly:
- Background: `#6366F1`
- Text: `#FFFFFF`
- Hover: darker indigo interaction token

### Secondary
- Background: transparent or white
- Border: `#C9CDD4`
- Text: `#0B0D12`
- Hover: subtle neutral surface

### Ghost
- Transparent
- No border by default
- Use for tertiary actions only

### Button Rules
- One clear primary action per visual cluster.
- Avoid multiple equally strong CTAs.
- No gratuitous gradients.
- Avoid full-pill buttons unless the component is intentionally a chip/tag.

---

## 10. Links

### Default Text Link
- Text: `#0B0D12`
- Underline on hover or persistent where clarity requires
- Focus ring: indigo

### Accent Link
- `#6366F1`
- Use for meaningful emphasis, not every link.

Navigation active state may use a small indigo line rather than fully indigo text.

---

## 11. Form Controls

### Inputs / Textareas
- Height: 48px minimum for standard inputs
- Border: `#E5E7EB`
- Background: white
- Radius: 8px
- Text: `#0B0D12`
- Placeholder: muted neutral
- Focus: 1–2px indigo ring/border
- Error: error semantic color

### Labels
- Inter Medium
- 14px
- Dark text
- Required indicators must be accessible

### Form Layout
- Use clear grouping
- Keep labels visible; do not rely on placeholder-only forms
- Show actionable error messages
- Preserve entered values when errors occur

---

## 12. Cards

Use cards only when content benefits from grouping.

### Default Card
- Background: white
- Border: `#E5E7EB`
- Radius: 10–14px
- Shadow: none or small
- Padding: 24–32px desktop; 20–24px mobile

### Feature / Service Card
Preferred structure:
1. Icon or index
2. Title
3. Description
4. Optional supporting link

### Case Study Card
Use:
- Strong project image
- Project/client name
- Category
- Concise outcome or scope
- Clear hover state

Avoid:
- Random gradient cards
- Over-rounded floating boxes
- Excessive glassmorphism

---

## 13. Navigation

### Desktop Navbar
- White/light background by default
- Logo left
- Main navigation center/right
- Primary CTA right
- Height: approx. 72–80px
- Thin bottom border optional
- Active state: subtle indigo underline/marker

### Sticky Behavior
Allowed when useful:
- Keep visual weight low
- Add subtle background/blur only if readability requires it
- Do not use strong glass effects

### Mobile
- Clear hamburger/menu control
- Full accessible menu
- 44px minimum touch targets
- Primary CTA remains easy to find

---

## 14. Hero System

### Standard Marketing Hero
Recommended layout:
- Eyebrow
- Large headline
- Supporting copy
- CTA row
- Product/system visual

### Desktop
Typically 2-column:
- Copy: 5–6 columns
- Visual: 6–7 columns

### Mobile
Stack:
1. Eyebrow
2. Headline
3. Copy
4. CTAs
5. Visual

### Rules
- Headline should be benefit-led and concise.
- Keep supporting copy under ~3 short lines on desktop where possible.
- Visual should demonstrate actual work/product value.
- One primary CTA and one secondary CTA maximum.

---

## 15. Section Headers

Preferred pattern:

```text
EYEBROW
Large section headline
Short supporting text
```

Examples:
- WHAT WE DO
- OUR WORK
- HOW WE WORK
- BUILT FOR GROWTH

Alignment may be left or editorial split-layout, but hierarchy must remain consistent.

---

## 16. Service Grid

Based on the approved brand board:

- Use outline icons
- Thin grid/divider lines
- 2–3 columns depending on viewport
- Minimal card treatment
- Strong whitespace
- No need for heavy shadows

A service grid may be a bordered matrix rather than detached cards.

---

## 17. Imagery & Media

### Product Screens
- Use crisp real UI screenshots.
- Prefer browser or device mockups only when they add context.
- Maintain neutral backgrounds.
- Use subtle shadows.

### Aspect Ratios
Recommended:
- Case-study hero: 16:10 or 16:9
- Project card: 4:3 or 3:2
- Editorial image: chosen intentionally by layout

### Image Optimization
- Prefer AVIF/WebP where supported.
- Set explicit dimensions.
- Use responsive `srcset`/Next.js Image.
- Lazy-load below-the-fold images.
- Do not ship unnecessarily large originals.

---

## 18. Icon System

Use **Lucide** as the default library.

Rules:
- Default stroke: consistent with library baseline
- Standard UI icon: 18–20px
- Service icon: 26–32px
- Use black/dark by default
- Indigo only for intentional emphasis
- Never mix multiple icon visual languages in one interface

---

## 19. Motion

### Timing
```text
Fast feedback: 120–180ms
Standard UI transition: 180–240ms
Section/entrance motion: 350–600ms
```

### Easing
Use smooth, restrained easing. Recommended:
```css
cubic-bezier(0.22, 1, 0.36, 1)
```

### Allowed
- Fade/translate entrances
- Subtle image scale on hover
- Button feedback
- Navigation indicator movement
- Diagram/process animation
- Controlled number/counter animation when meaningful

### Avoid
- Constant floating elements
- Aggressive parallax
- Long animation delays
- Excessive stagger
- Motion that blocks interaction

Respect `prefers-reduced-motion`.

---

## 20. Responsive Behavior

Design mobile-first.

### Mobile Rules
- Preserve hierarchy, not desktop geometry.
- Stack complex split layouts.
- Keep CTA buttons comfortably tappable.
- Avoid horizontal scrolling.
- Reduce decorative elements before reducing clarity.
- Keep body text at least 16px where practical.

### Tablet
- Re-evaluate grids; do not merely shrink desktop.
- Use 2-column layouts where 3-column becomes cramped.

### Desktop
- Use whitespace intentionally.
- Do not stretch content just because space exists.

---

## 21. Accessibility

Target WCAG 2.2 AA where practical.

Required:
- Semantic HTML
- Visible keyboard focus
- Sufficient text/background contrast
- Keyboard-accessible navigation
- Alt text for meaningful imagery
- Proper form labels
- Error announcements where needed
- Reduced-motion support
- 44px target size for primary touch interactions when possible

Never rely on color alone to communicate state.

---

## 22. Page Background Strategy

Default page:
- `#FFFFFF`

Alternate light section:
- subtle neutral only when hierarchy requires it

Dark section:
- `#0B0D12` or `#1A1D24`

Accent:
- `#6366F1` should generally be used as an accent, not as the dominant background of many large sections.

Recommended rhythm:
```text
Light
→ Light with divider/grid
→ Dark feature/case-study moment
→ Light
→ Strong final CTA
```

---

## 23. Dark Sections

Use dark sections for:
- Strong brand moments
- Case studies
- Testimonials when verified
- Technical/product showcases
- Final CTA
- Footer

Rules:
- Use white primary text
- Muted gray secondary text
- Controlled indigo highlights
- Maintain clear contrast
- Avoid neon glow effects

---

## 24. Footer

Preferred:
- Dark (`#0B0D12`)
- Structured multi-column layout
- Strong NEXFORA logo/wordmark
- Navigation
- Services
- Contact
- Social links
- Legal links
- Optional tagline: “Technology built for what's next.”

Use restrained borders and spacing.

---

## 25. Empty, Loading, Error & Success States

Every interactive feature should define:

### Loading
- Skeleton or compact progress state
- Do not cause major layout shifts

### Empty
- Explain what is missing
- Give a useful next action

### Error
- Explain what failed in plain language
- Provide retry/recovery where possible

### Success
- Confirm completion
- Explain the next expected step

---

## 26. AI Solution Advisor UI Direction

The AI Advisor should feel like a guided business consultation, not a generic chatbot.

Recommended flow:
1. Business type
2. Current process/problem
3. Desired improvement
4. Optional scale/context
5. AI analysis
6. Recommended solution
7. Suggested features
8. Next action / Start Project

Design:
- Structured step flow
- Clear progress
- Controlled free-text areas
- Strong review/result screen
- No anthropomorphic robot visuals
- Use Nexfora grid/diagram language

---

## 27. Data Visualization

For future NEXFORA OS or case-study metrics:

- Use clean lines and bars
- Neutral base colors
- Indigo for key series/highlights
- Avoid rainbow palettes
- Labels must remain readable
- Do not use 3D charts

---

## 28. Z-Index Scale

Recommended:
```text
base: 0
raised: 10
sticky: 20
dropdown: 30
overlay: 40
modal: 50
toast: 60
```

Do not use arbitrary values like `999999`.

---

## 29. Component Architecture

Follow:

```text
Design Tokens
→ Primitive UI
→ Reusable Components
→ Feature Components
→ Page Sections
→ Pages
```

Suggested folders:

```text
components/
├── ui/
│   ├── Button
│   ├── Input
│   ├── Textarea
│   ├── Select
│   ├── Badge
│   ├── Card
│   ├── Modal
│   └── Container
│
├── layout/
│   ├── Navbar
│   ├── Footer
│   └── Section
│
└── sections/
    ├── Hero
    ├── Services
    ├── CaseStudies
    ├── Process
    └── CTA
```

Before creating a new component:
1. Search existing components.
2. Reuse or extend an existing pattern where appropriate.
3. Create a new component only when it has a distinct responsibility.

---

## 30. Tailwind / CSS Token Direction

Prefer semantic tokens rather than scattering raw hex values across components.

Example:

```css
:root {
  --background: #FFFFFF;
  --foreground: #0B0D12;
  --surface-dark: #1A1D24;
  --brand-accent: #6366F1;
  --border: #E5E7EB;
}
```

Use components like:
```text
bg-background
text-foreground
border-border
text-brand-accent
```

Avoid repeated hardcoded values in JSX.

---

## 31. AI Design Rules

AI agents must:
- Read `BRAND.md` and this file before UI work.
- Reuse design tokens and existing components.
- Maintain Inter typography.
- Keep indigo controlled.
- Use generous whitespace.
- Prefer thin borders over heavy shadows.
- Avoid unnecessary cards.
- Keep CTA hierarchy clear.
- Use responsive behavior intentionally.
- Preserve accessibility.
- Do not invent new brand styles without approval.

AI agents must not:
- Introduce random gradients
- Introduce new fonts
- Create inconsistent radii
- Use excessive glassmorphism
- Use generic AI robot imagery
- Over-animate
- Redesign the logo
- Create fake social proof or metrics

---

## 32. Items To Finalize Later

The following require implementation or source assets before being considered locked:
- Original vector logo files
- Exact logo clear-space ratio
- Exact minimum logo sizes
- Final indigo tonal scale
- Final neutral tonal scale
- Production component library states
- Final accessibility contrast audit
- Final motion patterns
- Dark-mode scope for the public website
- NEXFORA OS-specific product design extensions

Until then, this file is the default design authority for the website.
