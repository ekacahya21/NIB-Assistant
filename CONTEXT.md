# NIB Assistant

An interactive hybrid-automation system helping Indonesian small business owners (UMKM) register their Nomor Induk Berusaha (NIB) on the official OSS portal.

## Language

**Draft**:
A local record representing a single business activity bound to exactly one KBLI code, including the business owner's identity, location, and scale.
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
- **Draft (Draf)**: Initial state where the business profile is being filled or reviewed.
- **Proses (Processing)**: The draft is active, either sitting in the Pending List or running an Automation Session.
- **Sukses (Success)**: The registration and form-filling on the OSS portal were successfully completed.
- **Butuh OTP (Action Required / Failed)**: The session was interrupted, failed, or paused, requiring user attention (such as entering OTP or fixing data errors).
_Avoid_: Backend enums, progress steps
