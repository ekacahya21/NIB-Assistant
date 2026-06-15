# Google Stitch Design Brief: NIB Assistant

## Product Name

NIB Assistant

## One-Liner

A mobile-first website to help small business owners (UMKM) create NIB drafts, select the correct KBLI codes, and guide them through the OSS filling process using user-controlled automation.

## Design Goal

Create a web application design that feels safe, simple, and helpful. The primary users are non-technical, small-business owners in Indonesia who want to obtain an NIB without having to understand the full complexity of KBLI codes and the OSS platform.

The design should make the process feel like a step-by-step guided journey, inspired by the official administrative visuals of the Indonesian OSS portal (oss.go.id) but packaged in a clean, modern, and highly intuitive interface.

## Visual Direction & Reference (Official OSS Visuals)

The visual design references the visual elements of the official Indonesian OSS portal (oss.go.id) with specific UX enhancements:

### 1. Color Palette
- **Primary Corporate Blue:** `#1A4384` (Used for primary CTA buttons, logo, header branding, and active navigation accents).
- **Accent Terracotta / Deep Red:** `#7C2D12` (Used for active status badges or important categories, e.g., the "KBLI 2020" badge background).
- **Dark Neutral (Text & Badges):** `#454545` / `#111827` (Deep slate/charcoal for text readability and secondary badge backgrounds).
- **Backgrounds:** `#F8FAFC` (Canvas background) to `#FFFFFF` (Card background). Clean, light, and spacious.
- **Borders & Soft Grey:** `#E2E8F0` / `#E5E7EB` (Used for thin 1px borders and index/number badge backgrounds).

### 2. Typography & Hierarchy
- **Font Family:** Modern geometric sans-serif (e.g., *Inter*, *Plus Jakarta Sans*, or *Roboto*).
- **Page Title (H1):** `20pt` - `22pt`, Extra Bold, Uppercase, deep charcoal color.
- **Section Headers (H3):** `11pt` - `12pt`, Bold, Uppercase, `#454545` color with spacious line height.
- **Body Text:** `10.5pt`, Regular, line height `1.6` for optimal readability.

### 3. Component Anatomy & Layout
- **Flat UI Aesthetic:** No aggressive gradients or heavy drop shadows. Rely entirely on 1px borders and background color contrasts to separate content blocks.
- **Header Navigation:**
  - Flat, white background (`#FFFFFF`) with a thin bottom border.
  - Left Section: Minimalist "NIB Assistant" logo next to the official national emblem/crest.
  - Center Section: Navigation links with an active underline indicator (4px height, matching the Primary Blue).
  - Right Section: Search button, language dropdown (`ID` with flag), help, and authentication buttons:
    - *Daftar (Secondary):* Outlined button with `#1A4384` border, blue text.
    - *Masuk (Primary):* Solid button with `#1A4384` background, white text, rounded `8px`.
- **Segmented Category Selector:**
  - Two connected segments with no gaps.
  - Left segment (Active): Terracotta background (`#7C2D12`), white bold text, rounded left.
  - Right segment (Indicator): Dark charcoal background (`#454545`), white text, rounded right.
- **Hierarchical Card Components (e.g. KBLI/Review cards):**
  - White background canvas (`#FFFFFF`) with a thin crisp border (`1px solid #E5E7EB`), rounded `12px`, padding `16px 20px`.
  - **Index Badge (Left):** Grey rectangular box (`#E5E7EB`, size `~48px` x `~36px`), rounded `4px`-`6px`, containing bold index text (`01`, `02`, etc.).
  - **Title (Right):** Bold dark text placed adjacent to the index badge, vertically centered.

---

## Information Architecture

Pages to be designed for Google Stitch:

1. **Page 1: Start / Eligibility Check** (`/`)
2. **Page 2: Business Profile Wizard** (`/wizard`)
3. **Page 3: KBLI Recommendation** (`/kbli`)
4. **Page 4: Data Review & Consent** (`/review`)
5. **Page 5: OSS Automation Progress & Prompts** (`/automation`)
6. **Page 6: Result / Next Steps**
7. **Page 7: Optional Dashboard for UMKM Assistant** (`/dashboard`)

---

### Page 1: Start / Eligibility Check

#### Purpose
Verify if the user's business type (Individual/Sole Proprietorship UMKM) is supported by the automation engine.

#### Layout
- **Header:** White flat header, dual logo, minimal menu.
- **Main Card:** Centered white panel, 1px `#E5E7EB` border, rounded 12px.
- **Fields:**
  - Tipe usaha: *Perorangan* (Recommended) or *Badan Usaha* (Show warning).
  - Skala usaha: *Mikro / Kecil* or *Belum tahu*.
  - Status Akun OSS: *Belum punya* or *Sudah punya*.
- **CTA:**
  - Primary: `Mulai buat draft NIB` (solid button `#1A4384`).
  - Secondary: `Cek dokumen yang dibutuhkan` (outlined button).

---

### Page 2: Business Profile Wizard (Grouped to 4 Steps)

To reduce bounce rates on mobile, the form fields are grouped into 4 logical steps:

#### Step 1: Identitas Pemilik & Kontak
- Nama Pemilik (according to KTP)
- NIK (Masked input: `16 digit`)
- Email & Nomor HP (with friendly format verification)

#### Step 2: Lokasi Usaha (Mobile Map UX)
- Alamat Lengkap, Provinsi, Kota/Kabupaten, Kecamatan, Kelurahan, Kode Pos.
- **Mobile Map Interaction:**
  - On the main form, show coordinate text fields (Latitude/Longitude) and a button `[Pilih Lokasi di Peta]`.
  - Tapping this button opens a **Full-Screen Bottom Sheet Modal** containing the Leaflet map to drop the location pin. This prevents accidental page scrolling on mobile screens.
  - User taps `Simpan Lokasi` inside the bottom sheet to close the modal and return to the form.

#### Step 3: Cerita Usaha (KBLI Prep)
- Nama Usaha / Toko.
- **Deskripsi Usaha (Conversational Description):** "What do I sell? How is it made? Who are the buyers?"
  - *Microcopy:* "Ceritakan usaha Anda seperti sedang mengobrol biasa. Contoh: Saya menjual ayam geprek pedas secara online lewat GoFood dan menerima katering kecil untuk acara warga."
- Cara Penjualan: *Online, Offline, atau Keduanya*.

#### Step 4: Skala Usaha & Tenaga Kerja
- Modal Usaha (in Rupiah).
- Jumlah Tenaga Kerja (Pekerja Laki-laki & Perempuan).
- Perkiraan Omzet Bulanan.

#### Wizard Navigation (Mobile UI)
- **Progress Bar:** Thin indicator line at the top (Step 1 of 4) without cluttered text labels.
- **Sticky CTA Footer:** On mobile, `Kembali` and `Lanjutkan` buttons hover at the bottom of the screen (sticky bottom bar).
- **Autosave Indicator:** Tiny green text near the header: `✓ Tersimpan otomatis`.

---

### Page 3: KBLI Recommendation (Collapsible Cards)

Helps users choose a KBLI code without scroll fatigue on small mobile screens.

#### Layout
- Search bar at the top for alternative keyword searches.
- Segmented category selector above the list: KBLI 2020 (`#7C2D12`) joined with category status badge (`#454545`).
- **Collapsible Cards (Inspired by official OSS "Turunan" design):**
  - Each KBLI is wrapped in a white card (`#FFFFFF`) with a `1px solid #E5E7EB` border, rounded `12px`.
  - **Index Badge (Left):** Grey box (`#E5E7EB`) showing the KBLI code (e.g. `56103`).
  - **Title (Right):** KBLI name (e.g., `Kedai Makanan`) with a confidence badge (`Sangat Cocok` in green, or `Alternatif` in amber).
  - Tapping the card expands it downward to reveal:
    - *Ringkasan awam:* Simple translation of the KBLI code.
    - *Cocok untuk:* Examples of businesses that fit this KBLI.
    - *Tidak cocok untuk:* Examples of businesses that should not use this KBLI.
    - Button *[Pilih KBLI Ini]* (solid button `#1A4384`).

---

### Page 4: Data Review & Consent (Per-Section Edit)

Allows the user to perform a final data verification before starting the Playwright runner.

#### Layout
- Displays 5 summary cards for completed data:
  1. Identitas Pemilik & Kontak
  2. Alamat KTP
  3. Alamat Usaha & Peta Koordinat
  4. Profil Usaha
  5. KBLI Terpilih
- **Per-Section Edit Button:**
  - Each card has a small `Ubah` button on the top right.
  - Tapping `Ubah` redirects the user back to `/wizard?step=X`. After updating and clicking next, the system automatically redirects them back to this Review page.
- **Consent Checkbox (Blocking CTA):**
  - "Saya menyatakan data yang diisi benar."
  - "Saya mengizinkan NIB Assistant mengisi data ke OSS secara otomatis."
- The primary CTA button `Mulai Pengisian Otomatis` at the bottom remains disabled until all checkboxes are ticked.

---

### Page 5: OSS Automation Progress & State Shifts

Visual monitor for the background Playwright automation process.

#### Layout (Mobile Timeline)
- A clean visual stepper/timeline displaying the current progress steps:
  - `[Selesai]` Membuka Portal OSS Indonesia
  - `[Selesai]` Memvalidasi data NIK
  - `[Sedang Berjalan]` Mengisi Detail Lokasi Usaha
  - `[Menunggu]` Memilih Kode KBLI
- **Hidden Console Log:** The raw terminal output is collapsed behind a drawer accordion `[Tampilkan Log Teknis (Developer Mode)]` to avoid intimidating non-technical users.

#### Full-Page State Shifts (OTP / Password / Error Prompts)
When the automation process requires manual user interaction, the main progress timeline is **completely replaced** by a focused action card (State Shift):
1. **State: Input OTP**
   - Clean full-screen card with a large OTP input field (4 or 6 digits) and a countdown timer (MM:SS).
   - Clear copy: "Masukkan kode OTP yang dikirimkan ke WhatsApp/SMS nomor HP Anda."
2. **State: Buat Password Baru**
   - Focused input fields to configure a new password for the newly registered OSS account.
3. **State: Error Fix (e.g. NIK mismatch)**
   - Displays a friendly error alert with an input field to correct the NIK directly without interrupting the background process structure.

Once submitted, the screen transitions back to the main visual timeline.

---

### Page 6: Result / Next Steps

Displays the final outcome of the NIB creation process.

#### 3 Distinct States:
1. **Success State:**
   - Large green celebration icon.
   - Summarized info: Issued NIB number and business name.
   - CTAs: `Unduh Ringkasan PDF` and `Buka Portal OSS`.
2. **Action Required State (Waiting):**
   - Amber warning icon. Copy: "Data berhasil diisi, silakan lakukan tanda tangan elektronik / persetujuan akhir langsung di website OSS."
   - CTA: `Buka Halaman Persetujuan OSS`.
3. **Failed State:**
   - Red error icon. Copy: "Otomatisasi terhenti karena perubahan struktur website OSS. Jangan khawatir, draft data Anda aman."
   - CTA: `Lanjutkan Secara Manual` (displays step-by-step guide matching the pre-filled data draft).

---

### Page 7: Dashboard (Optional - Wireframe Only)

For business assistants managing multiple registrations.
- **Layout:** Simple card-list on mobile (no wide data tables).
- **Content:** Proprietor name, store name, status badge (Draft, Proses, Sukses, Butuh OTP), last updated timestamp, and a quick action link `[Buka Draft]`.

---
