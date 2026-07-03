# NIB Assistant - Single Source of Truth

An interactive hybrid-automation system helping Indonesian small business owners (UMKM) register their Nomor Induk Berusaha (NIB) on the official OSS portal (oss.go.id).

---

## 📖 Domain Glossary & Language

**Draft**:
A local record representing a single business activity bound to exactly one KBLI code, including the business owner's identity, location, and scale. Mapped by the [Draft](file:///Users/nanangcahya/Development/my-projects/nib-assistant/backend/prisma/schema.prisma#L10) model in the database.
_Avoid_: Profile, account, submission

**Automation Session**:
A single active Playwright execution automating form filling for a specific Draft, which is immediately terminated and closed if the client disconnects.
_Avoid_: Runner, bot run, process

**Business Description (Deskripsi Usaha)**:
A standard text input where the user describes their business activities in plain language, which is analyzed by the AI to suggest matching KBLI codes.
_Avoid_: Business Story, Cerita Usaha, KBLI Prompt

**KBLI Code**:
Klasifikasi Baku Lapangan Usaha Indonesia (Standard Classification of Indonesian Business Activities) – a 5-digit classification code used by the Indonesian government to categorize business fields.
_Avoid_: Business type, sector code

**State Shift (State Shift / Prompt Interaktif)**:
A focused UI state replacement on the frontend during an Automation Session that prompts the user for manual inputs like OTP, CAPTCHA, or custom Passwords required by the OSS platform.
_Avoid_: Modal prompt, user popup, intervention step

**OSS Registration (Pendaftaran OSS)**:
Automating the creation of a new account on the OSS portal, involving NIK validation, OTP verification, and password configuration.
_Avoid_: Account setup, portal signup

**OSS Login (Masuk OSS)**:
Automating the authentication process into the OSS portal using pre-existing user credentials.
_Avoid_: Portal sign-in, authentication run

**Location Pin (Pin Lokasi)**:
The geographic coordinates (latitude and longitude) selected by the user on the map, used to auto-populate and look up the business address on the OSS portal.
_Avoid_: Coordinates, map selection, GPS coordinate

**Pending List (Daftar Tunggu)**:
The in-memory buffer holding draft registrations waiting for an available automation slot when the concurrency limit is reached.
_Avoid_: Queue, Antrean, buffer

**ETA (Estimasi Waktu Tunggu)**:
The calculated estimated time of arrival in seconds until a draft starts its automation session, computed using the historical average duration of successful registrations.
_Avoid_: Wait time estimate, Remaining time

**Dokumen Administrasi (Administration Document)**:
The official administrative document generated in PDF format by the application and uploaded to the OSS portal, containing details of location compliance and owner declarations.
_Avoid_: NPS, Pernyataan Mandiri, Self-Declaration

**NIB (Nomor Induk Berusaha)**:
The unique business identification number issued by the Indonesian government (via the OSS portal) that serves as the legal identity for a business.
_Avoid_: Business license, registration number, Izin Usaha

**User (Pengguna)**:
The person using the application—either the business owner (UMKM) themselves or an assistant/agent acting on their behalf—tracked via a client session identifier.
_Avoid_: Admin, Owner, Client

**Draft Status (Status Draf)**:
The lifecycle state of a Draft as it progresses through the system, mapped to user-facing status labels:
- **Draft (Draf)** (DB: `DRAFT`): Initial state where the business profile is being filled or reviewed.
- **Proses (Processing)** (DB: `QUEUED` / `RUNNING`): The draft is active, either sitting in the Pending List or running an Automation Session.
- **Sukses (Success)** (DB: `COMPLETED`): The registration and form-filling on the OSS portal were successfully completed.
- **Butuh OTP (Action Required / Failed)** (DB: `FAILED`): The session was interrupted, failed, or paused, requiring user attention (such as entering OTP or fixing data errors).
_Avoid_: Backend enums, progress steps

---

## 🏗️ System Architecture & Tech Stack

NIB Assistant uses a monorepo structure separating the client interface and the automation backend:

1. **Frontend (Next.js)**: Runs on port `3000` (development). Interacts with the user, collects form data, manages wizard steps, and listens to real-time execution status via SSE (Server-Sent Events).
   - Core path: [/frontend](file:///Users/nanangcahya/Development/my-projects/nib-assistant/frontend)
   - Entry points: [wizard page.tsx](file:///Users/nanangcahya/Development/my-projects/nib-assistant/frontend/src/app/wizard/page.tsx), [dashboard page.tsx](file:///Users/nanangcahya/Development/my-projects/nib-assistant/frontend/src/app/dashboard/page.tsx)
2. **Backend (NestJS)**: Runs on port `3001` (development). Exposes REST endpoints, generates PDF administration documents, manages the Playwright automation browser instances, and streams logs via SSE.
   - Core path: [/backend](file:///Users/nanangcahya/Development/my-projects/nib-assistant/backend)
   - Key Services: [automation.service.ts](file:///Users/nanangcahya/Development/my-projects/nib-assistant/backend/src/automation/automation.service.ts), [documents.service.ts](file:///Users/nanangcahya/Development/my-projects/nib-assistant/backend/src/documents/documents.service.ts)
3. **Database (PostgreSQL & Prisma ORM)**: Stores the draft information, processing status, and historic session durations.
   - Schema file: [schema.prisma](file:///Users/nanangcahya/Development/my-projects/nib-assistant/backend/prisma/schema.prisma)

---

## 🔄 Real-time Communication (SSE Flow)

The frontend communicates with the Playwright automation session bi-directionally using a combination of Server-Sent Events (SSE) for downstream logs and REST API for upstream actions (like OTP input):

```
[ Frontend (Next.js) ]                          [ Backend (NestJS) ]
        |                                                |
        |--- 1. Request SSE Stream (getStream) --------->| (Creates Subject & checks duplicate sessions)
        |                                                | (Enqueues registration & spawns Playwright)
        |<-- 2. Log Status Otomatisasi (Step 1-6) -------|
        |                                                |
        |--- 3. (When OTP needed) POST Submit OTP ------>| (Fills OTP code directly in Playwright browser)
        |<-- 4. Continue Log Status Otomatisasi ---------|
        |                                                |
        |--- 5. Disconnect (Tab Close / Connection Drop)->| (Triggers cancelStream & closes browser instance)
```

---

## ⚙️ Key Backend Implementations

### 1. Concurrency Control & Pending List (Daftar Tunggu)
- **Session Limit**: Max active Playwright browser sessions is capped by `PLAYWRIGHT_MAX_CONCURRENT_SESSIONS` (default: 3) to prevent IP/account blocks.
- **Pending List Queue**: Excess requests are enqueued in an in-memory queue:
  ```typescript
  this.queue.push({ draftId, subject, resolve, reject, ... })
  ```
- **ETA (Estimasi Waktu Tunggu) Calculation**:
  $$\text{ETA} = (\text{Slot Aktif} + \text{Posisi Sebelum dalam Daftar Tunggu}) \times \text{Rata-rata Durasi Sesi Sukses}$$
  - The average duration is fetched dynamically from the database (`status = 'COMPLETED'`).
  - Fallback is **180 seconds** if no historical data exists.

### 2. Double Session Prevention
Before opening a new SSE stream in `getStream()`, the backend checks if the `draftId` is already in `activeSubjects`. If a duplicate is found, the connection is instantly rejected with an error event, preventing interference with the running session.

### 3. Graceful Browser Teardown
To prevent orphaned Chrome zombie processes:
- `main.ts` enables shutdown hooks: `app.enableShutdownHooks()`.
- [AutomationService](file:///Users/nanangcahya/Development/my-projects/nib-assistant/backend/src/automation/automation.service.ts) implements `OnModuleDestroy` to clean up all active browser instances, complete SSE subjects, and reject pending requests:
  ```typescript
  async onModuleDestroy() {
    const closePromises = Array.from(this.activeBrowsers.values()).map(b => b.close());
    await Promise.all(closePromises);
    this.activeBrowsers.clear();
  }
  ```

---

## 🗺️ Wizard Steps & Map Integration
1. **Identitas Pemilik & Kontak**: Name, NIK (16-digit verification), Date of Birth, Gender, Email, and Phone number.
2. **Lokasi Usaha (Location Pin)**: Complete address details. Uses a Leaflet map embedded in a full-screen bottom sheet modal to capture Latitude and Longitude to prevent scroll issues on mobile. Coordinates are looked up in NestJS using **OpenStreetMap Nominatim** to get administrative location names matching the OSS registry.
3. **Deskripsi Usaha (Business Description)**: Conversational business story which the backend uses to recommend matching 5-digit **KBLI Codes** via AI.
4. **Skala Usaha & Tenaga Kerja**: Financial capital, land size, and employee count.

---

## 🛑 Common Errors & Troubleshooting

> [!NOTE]
> When the automation encounters these errors, it halts and triggers a **State Shift** (Prompt Interaktif) on the frontend for immediate correction.

- **NIK Already Registered**: The NIK is already registered on the OSS portal. The automation stops, prompting the user to switch to **OSS Login** rather than registration.
- **Email Already Registered**: The email address is already bound to another OSS account. The app prompts the user to input a new email address and restarts the automation.
- **Dukcapil Connection Issue**: The national identity service is down. The app prompts the user to "Retry" in 5-10 minutes.
- **Dukcapil Mismatch**: The name and NIK do not match Dukcapil records. The app prompts the user for correction.
- **OTP Expiry**: The user fails to enter the OTP within 90 seconds. The session is terminated and marked as `FAILED`.
- **Weak Password**: The password generated/inputted does not meet OSS criteria (min 8 characters, uppercase, lowercase, numbers, and special characters). The user is prompted to enter a stronger password.
