# Repo Research Report: NIB Assistant

## Project Overview
NIB Assistant is an interactive hybrid-automation full-stack web application designed to help small business owners (UMKM) in Indonesia register their *Nomor Induk Berusaha* (NIB) on the official government OSS portal (oss.go.id). It provides a guided step-by-step wizard to collect business data (including an AI-driven KBLI code recommendation tool) and then orchestrates a Playwright-based background browser session to automate the actual data entry on the OSS portal. The automation is "hybrid" because it pauses and hands control back to the user via UI prompts when CAPTCHA, OTPs, or password creation are required.

## Tech Stack
- **Frontend Framework:** Next.js (App Router, v16.2.6), React 19 [source: frontend/package.json]
- **Styling & UI:** Tailwind CSS (v4), PostCSS, embedded Leaflet for mapping [source: frontend/package.json, frontend/src/app/layout.tsx]
- **Backend Framework:** NestJS (v11.0.1) [source: backend/package.json]
- **Automation Engine:** Playwright (`playwright-extra` + `puppeteer-extra-plugin-stealth` to evade bot detection) [source: backend/package.json, backend/src/automation/automation.service.ts]
- **Database & ORM:** PostgreSQL (via Docker) with Prisma ORM (v6.19.3) [source: docker-compose.yml, backend/prisma/schema.prisma]
- **PDF Generation:** `pdfkit` (for generating Administration Documents) [source: backend/package.json, backend/src/documents/documents.service.ts]
- **AI / LLM Integration:** Google Vertex AI / Gemini API via `@google/adk` (for KBLI code recommendations) with local LLM fallbacks [source: backend/src/kbli/kbli.service.ts]
- **Runtime:** Node.js (TypeScript target ES2023 for backend, ESNext for frontend) [source: backend/tsconfig.json, frontend/tsconfig.json]

## Architecture
The repository uses a simple monorepo structure:
- **Frontend (`frontend/`)**: Communicates with the backend REST APIs. The frontend implements a Wizard flow to gather data. For automation, it establishes a Server-Sent Events (SSE) connection (`/api/stream/:draftId`) to receive real-time execution logs from the backend's Playwright instance and updates the UI state. When human intervention is needed (e.g., OTP), the frontend shows a State Shift prompt and submits the answer via POST REST API.
- **Backend (`backend/`)**: A NestJS server that exposes endpoints to save drafts, handle KBLI AI searches, and drive the Playwright browser. To manage concurrency, the backend caps active browser sessions (default 3) and maintains an in-memory queue for incoming requests, estimating wait times for users.
- **Event Flow**: Bi-directional communication without WebSockets; logs flow downstream via SSE and user interventions flow upstream via REST POST [source: CONTEXT.md].

## Directory Layout
```
.
├── CONTEXT.md                    # Single Source of Truth / Domain glossary
├── README.md                     # Setup and deployment instructions
├── docker-compose.yml            # PostgreSQL DB configuration
├── docs/
│   └── adr/                      # Architecture Decision Records
├── frontend/                     # Next.js Application
│   ├── next.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── app/                  # Next.js App Router pages (wizard, automation, review, admin)
│       ├── components/           # UI components (Atomic design: atoms, molecules, organisms)
│       └── utils/
└── backend/                      # NestJS Application
    ├── nest-cli.json
    ├── package.json
    ├── tsconfig.json
    ├── prisma/
    │   └── schema.prisma         # Prisma data model (Draft table)
    ├── test/                     # e2e and staging test specs
    └── src/
        ├── app.module.ts
        ├── main.ts               # NestJS bootstrap
        ├── auth/                 # Admin guards and basic auth
        ├── automation/           # Playwright orchestration, SSE streams
        │   ├── automation.controller.ts
        │   ├── automation.service.ts
        │   ├── context/          # Shared automation state interfaces
        │   └── services/         # Modular Playwright flows (registration, filing, portal helpers)
        ├── documents/            # PDFKit generation logic (Administration Documents)
        ├── drafts/               # CRUD for the Draft database model
        └── kbli/                 # AI service to recommend KBLI codes
```

## Key Configuration
- **Backend:** `backend/.env` requires `PLAYWRIGHT_HEADLESS=false` (to allow manual captcha/login if necessary), `PLAYWRIGHT_SLOW_MO` to mimic human speed, `OSS_PORTAL_URL`, and DB URLs [source: backend/.env.example].
- **Frontend:** `frontend/.env` requires `NEXT_PUBLIC_API_URL` [source: frontend/.env.example].
- **Prisma:** Uses `postgresql` provider pointing to `DATABASE_URL` [source: backend/prisma/schema.prisma].
- **NestJS:** Enabled graceful shutdown (`app.enableShutdownHooks()`) to prevent orphaned Chromium processes and increased JSON payload limits to 50mb for base64 images [source: backend/src/main.ts].

## Domain Model
The single `Draft` model (`drafts` table) tracks the lifecycle of an application:
- **Core Info:** `nama_pemilik`, `nik`, `nomor_hp`, `email`, `alamat_usaha`, `modal_usaha`.
- **KBLI & Location:** `kbli_code`, `kbli_title`, `latitude`, `longitude`, `foto_lokasi`.
- **OSS Progress Details:** `oss_password`, `registration_completed` (boolean), `status` (DRAFT, QUEUED, RUNNING, COMPLETED, FAILED, FAILED_LATER).
- **Session & Telemetry:** `session_id`, `logs` (JSON array of executed steps), `automation_duration`, `error_message`.
[source: backend/prisma/schema.prisma, CONTEXT.md]

## Module Organization
**Backend Modules:**
- `DraftsModule`: Standard CRUD operations over Prisma.
- `AutomationModule`: Heavy lifting. `AutomationService` handles connection lifecycle, queues, and concurrency limits. Actual browser automation is delegated into modular flow services (`RegistrationFlowService`, `FilingFlowService`) and `PortalInteractionHelper` [source: docs/adr/0001-modularizing-automation-service.md].
- `KbliModule`: Uses Google Vertex AI/Gemini (via `@google/adk`) to match user business stories to 5-digit KBLI codes. Includes local LLM and TenderX API fallbacks [source: backend/src/kbli/kbli.service.ts].
- `DocumentsModule`: Creates formal PDF documents embedding a static map generated from Leaflet map tile coordinates [source: backend/src/documents/documents.service.ts].

**Frontend Pages:**
- `/wizard`: Multi-step form capturing profile, map location, and business description. Grouped into 4 main steps to reduce bounce rate [source: design.md].
- `/review`: Final data verification before automation.
- `/automation`: Status timeline, SSE log consumer, and state shifts (OTP/password interactive prompts) [source: frontend/src/app/automation/page.tsx].
- `/admin`: Dashboard (secured by `AdminGuard`) for system operators to monitor all drafts and view live SSE log streams of automation sessions.

## Scripts & Commands
- **Frontend:** `npm run dev` (starts on port 3000), `npm run build`, `npm run start` [source: frontend/package.json].
- **Backend:** `npm run start:dev` (starts on port 3001), `npm run test:e2e` (Jest), `npm run test:staging`, `npx prisma db push` [source: backend/package.json, README.md].
- **Infrastructure:** `docker compose up -d` boots up the PostgreSQL container [source: docker-compose.yml].

## Dependencies
**Notable Backend:**
- `@nestjs/*` core framework tools.
- `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`: Browser automation.
- `@prisma/client`: Database operations.
- `pdfkit`: PDF generation.
- `@google/adk`: Google AI developer kit for agentic search and LLM interaction.
- `rxjs`: For managing streams (SSE).

**Notable Frontend:**
- `next` (v16.2), `react` (v19).
- `tailwindcss` (v4).
- Leaflet (via CDN `<link>` and static map tile fetchers) for mapping.

## Testing Setup
- **Framework:** Jest.
- **Coverage:** Unit tests exist for key components (`drafts.service.spec.ts`, `portal-interaction.helper.spec.ts`).
- **E2E & Integration:** `backend/test` contains `app.e2e-spec.ts` and `automation.staging-spec.ts`. Configured with `jest-e2e.json` and `jest-staging.json`.
- There is currently no CI/CD configuration (no `.github/workflows` or `.gitlab-ci.yml` found) for automated test execution [source: repository scan].

## What's Missing / Notable Gaps
1. **CI/CD Pipeline:** No automated workflows (GitHub Actions/GitLab CI) to run tests or deploy the application.
2. **Frontend Tests:** The `frontend` directory lacks a formal test suite (no Jest, Vitest, or Cypress/Playwright frontend UI tests config evident).
3. **Authentication Mechanism:** The `AdminGuard` relies on simple bearer tokens passed via headers/query or hardcoded `process.env.ADMIN_TOKEN`. While acceptable for simple operator lock-down, it isn't robust JWT or Session based auth.
4. **WebSocket/Socket.io:** Real-time updates rely exclusively on SSE (`EventSource`) downstream and REST POSTs upstream, rather than a unified WebSockets approach, though this is a documented architectural choice.