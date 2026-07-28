# NEXFORA OS

NEXFORA OS is the internal business operating system for Nexfora Digital
Innovation. The application uses Next.js App Router, TypeScript, Tailwind CSS,
Supabase Auth, and Supabase PostgreSQL.

The current implementation scope is Roadmap Phase 1 only:

- Authentication
- Internal profiles and organization membership
- Role-based server authorization
- Row Level Security
- Protected admin access

Leads, CRM, clients, projects, proposals, invoices, payments, Client Portal
functionality, and AI are intentionally out of scope.

## Phase 1 setup

Before running the authenticated application, follow the complete
[Phase 1 Supabase setup guide](docs/PHASE_1_SETUP.md). It covers:

- Creating and configuring the Supabase project
- Adding the four required environment variables
- Applying the tracked migration
- Creating the first Auth user
- Creating the Nexfora organization and owner profile
- Assigning the initial `super_admin` membership
- Disabling public signup
- Testing authentication, authorization, and RLS

Do not commit `.env.local` or expose `SUPABASE_SECRET_KEY`.

## Local development

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example` and complete the setup guide, then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

Run all required checks before handing off a change:

```bash
npm run lint
npm run typecheck
npm run build
```

## Project references

The repository's governing documents are:

- `AGENTS.md` — authoritative agent and engineering rules
- `PRODUCT.md` — product direction and scope
- `ARCHITECTURE.md` — technical boundaries
- `DATABASE.md` — database blueprint
- `USER_FLOWS.md` — user and authorization flows
- `FEATURES.md` — feature registry
- `ROADMAP.md` — implementation phases
- `DESIGN_SYSTEM.md` — visual system

Read them before making implementation changes. `AGENTS.md` is authoritative.
