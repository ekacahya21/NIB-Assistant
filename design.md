# Google Stitch Design Brief: NIB Assistant

## Product Name

NIB Assistant

## One-Liner

Website mobile-first untuk membantu pelaku UMKM membuat draft NIB, memilih KBLI yang tepat, lalu memandu proses pengisian OSS dengan automation yang tetap dikontrol user.

## Design Goal

Buat desain aplikasi web yang terasa aman, sederhana, dan membantu. User utamanya adalah pelaku UMKM non-teknis yang ingin punya NIB tanpa harus memahami seluruh kompleksitas OSS dan KBLI.

Desain harus membuat proses terasa seperti dibimbing langkah demi langkah, bukan seperti mengisi formulir pemerintah yang panjang.

## Visual Direction

- Modern, bersih, administratif, dan terpercaya.
- Mobile-first, tapi tetap nyaman di desktop.
- Bahasa Indonesia sederhana.
- Tidak terlalu playful, tidak terlalu kaku.
- Gunakan layout wizard, stepper, checklist, progress timeline, dan cards.
- Hindari tampilan dashboard yang terlalu penuh.
- Hindari landing page marketing panjang. First screen harus langsung membantu user mulai proses.

## Suggested Style

### Mood

- Calm
- Trustworthy
- Helpful
- Clear
- Practical

### Color Direction

Gunakan palet yang terasa resmi tapi tetap ramah:

- Primary: deep teal / blue-green untuk rasa aman dan progres.
- Accent: warm yellow atau amber lembut untuk highlight bantuan/rekomendasi.
- Neutral: off-white, light gray, dark charcoal.
- Error: red yang jelas tapi tidak agresif.
- Success: green yang tenang.

Jangan membuat desain didominasi satu warna saja. Beri kontras yang cukup antara form, cards, dan status.

### Typography

- Gunakan sans-serif modern.
- Heading singkat dan jelas.
- Body copy mudah dibaca.
- Jangan pakai teks terlalu kecil untuk mobile.
- Hindari headline hero yang terlalu besar karena ini tool, bukan landing page brand campaign.

### Component Feel

- Border radius kecil sampai medium.
- Cards sederhana untuk pilihan KBLI dan ringkasan.
- Buttons jelas dengan hierarchy: primary, secondary, tertiary.
- Form field tinggi nyaman untuk mobile.
- Gunakan icon seperlunya untuk status, progress, edit, warning, success.

## Primary Audience

Pelaku UMKM perorangan:

- Pemilik warung, toko online, katering rumahan, laundry, salon, bengkel kecil, jasa digital, toko kelontong, usaha makanan/minuman, reseller, jasa kreatif.
- Ingin membuat NIB untuk kebutuhan administrasi, marketplace, modal, kemitraan, atau legalitas dasar.
- Tidak paham KBLI dan sering bingung membaca instruksi OSS.

Secondary audience:

- Pendamping UMKM yang membantu banyak pemilik usaha membuat NIB.

## Core UX Principle

User tidak perlu memahami OSS dari awal. User cukup menjelaskan usahanya, mengecek rekomendasi KBLI, menyetujui data, lalu tool membantu meneruskan ke OSS.

Namun user tetap memegang kendali untuk login, OTP, captcha, persetujuan legal, dan submit final.

## Information Architecture

Buat desain untuk halaman berikut:

1. Start / Eligibility Check
2. Business Profile Wizard
3. KBLI Recommendation
4. Data Review & Consent
5. OSS Automation Progress
6. Result / Next Steps
7. Optional Dashboard untuk pendamping UMKM

## Global Navigation

Untuk MVP, navigasi sederhana saja:

- Logo/text: NIB Assistant
- Progress indicator saat user berada di wizard
- Bantuan
- Simpan & lanjut nanti

Jangan tampilkan nav besar seperti website marketing. Fokus pada task completion.

## Page 1: Start / Eligibility Check

### Purpose

Memastikan user cocok memakai tool ini dan langsung memulai proses pembuatan draft NIB.

### Layout

Mobile:

- Header kecil dengan logo NIB Assistant.
- Main panel berisi headline, short explanation, dan eligibility questions.
- CTA utama di bawah.

Desktop:

- Centered content, max width medium.
- Bisa ada side info ringan, tapi jangan mengganggu form utama.

### Main Copy

Headline:

`Buat draft NIB tanpa bingung pilih KBLI`

Supporting copy:

`Jawab beberapa pertanyaan tentang usaha kamu. Kami bantu cari kandidat KBLI dan siapkan data sebelum diteruskan ke OSS.`

### Fields

- Tipe usaha:
  - Perorangan
  - Badan usaha
- Skala usaha:
  - Mikro
  - Kecil
  - Belum tahu
- Sudah punya akun OSS?
  - Sudah
  - Belum
  - Belum yakin

### CTA

Primary:

`Mulai buat draft NIB`

Secondary:

`Cek dulu data yang dibutuhkan`

### States

Eligible:

- Lanjut ke wizard.

Not eligible:

Copy:

`Untuk MVP awal, tool ini fokus untuk UMKM perorangan. Kamu tetap bisa membaca panduan, tapi automation belum tersedia untuk tipe usaha ini.`

## Page 2: Business Profile Wizard

### Purpose

Mengumpulkan data user dan usaha dengan bahasa sederhana.

### Layout

- Stepper di atas.
- Satu grup pertanyaan per screen.
- Tombol Back dan Continue.
- Autosave indicator kecil: `Tersimpan otomatis`.

### Suggested Steps

1. Data pemilik
2. Kontak
3. Lokasi usaha
4. Cerita usaha
5. Skala usaha
6. Review singkat

### Fields

Data pemilik:

- Nama pemilik
- NIK, dengan masked input
- Tanggal lahir jika diperlukan

Kontak:

- Nomor HP
- Email

Lokasi usaha:

- Alamat usaha
- Provinsi
- Kota/kabupaten
- Kecamatan
- Kelurahan
- Kode pos

Cerita usaha:

- Nama usaha
- Usaha ini menjual apa?
- Kegiatan utamanya apa?
- Dijual online, offline, atau keduanya?
- Deskripsi bebas

Skala:

- Perkiraan omzet bulanan
- Jumlah pekerja
- Modal usaha jika dibutuhkan

### Microcopy Examples

Untuk field deskripsi:

`Contoh: Saya jual ayam geprek rumahan lewat GoFood dan menerima pesanan katering kecil.`

Untuk field KBLI preparation:

`Ceritakan usaha kamu pakai bahasa biasa. Nanti kami bantu cocokkan dengan KBLI.`

### Validation

- Tampilkan error tepat di bawah field.
- Gunakan bahasa awam.
- Jangan menyalahkan user.

Example:

`Alamat usaha belum lengkap. Tambahkan kelurahan atau kode pos.`

## Page 3: KBLI Recommendation

### Purpose

Membantu user memilih KBLI berdasarkan deskripsi usaha.

### Layout

- Summary kecil tentang usaha user.
- Search/refine box di atas.
- 3-5 recommendation cards.
- Explanation panel untuk KBLI yang dipilih.

### Header Copy

`Kami menemukan beberapa kandidat KBLI`

Supporting copy:

`Pilih yang paling menggambarkan kegiatan utama usaha kamu. Kalau belum cocok, kamu bisa ubah deskripsi usaha.`

### KBLI Card Content

Setiap card berisi:

- Kode KBLI
- Nama KBLI
- Confidence label:
  - Sangat cocok
  - Mungkin cocok
  - Perlu dicek
- Ringkasan bahasa awam
- Cocok untuk
- Tidak cocok untuk
- CTA: `Pilih KBLI ini`

### Example Card

Kode:

`56103`

Nama:

`Kedai Makanan`

Ringkasan:

`Untuk usaha yang menjual makanan siap saji langsung ke pelanggan.`

Cocok untuk:

`Warung makan, kedai, makanan rumahan yang dijual langsung.`

Tidak cocok untuk:

`Produksi makanan kemasan skala pabrik.`

### Interaction

- User bisa memilih satu atau lebih KBLI.
- Selected card terlihat jelas.
- Ada tombol `Bandingkan pilihan`.
- Ada tombol `Ubah cerita usaha`.

### Disclaimer

Tampilkan kecil tapi jelas:

`Rekomendasi ini membantu pencarian KBLI, bukan keputusan hukum final. Pastikan pilihan sesuai kegiatan usaha sebenarnya.`

## Page 4: Data Review & Consent

### Purpose

Memberi user kesempatan mengecek data sebelum automation ke OSS.

### Layout

- Review sections dengan edit button:
  - Data pemilik
  - Kontak
  - Lokasi usaha
  - Data usaha
  - KBLI terpilih
- Consent checklist.
- CTA jelas.

### Header Copy

`Cek dulu sebelum diteruskan ke OSS`

Supporting copy:

`Data di bawah ini akan dipakai untuk membantu mengisi formulir di OSS. Kamu masih bisa mengubahnya sebelum lanjut.`

### Consent Checklist

- `Saya sudah mengecek data dan informasinya benar.`
- `Saya memahami rekomendasi KBLI adalah bantuan awal.`
- `Saya mengizinkan NIB Assistant membantu mengisi data ke OSS.`
- `Saya akan login, memasukkan OTP/captcha, dan menyetujui submit final sendiri jika diminta OSS.`

### CTA

Primary:

`Lanjut ke OSS`

Secondary:

`Edit data`

### Important Design Detail

CTA primary disabled sampai semua checklist dicentang.

## Page 5: OSS Automation Progress

### Purpose

Menampilkan proses automation dengan jelas dan membuat user tahu kapan harus bertindak.

### Layout

Mobile:

- Status card di atas.
- Progress stepper/timeline.
- Action panel jika butuh user.
- Optional browser preview di bawah atau dalam modal.

Desktop:

- Split layout:
  - kiri: progress timeline dan action panel
  - kanan: browser/session preview

### Header Copy

`Kami sedang membantu mengisi OSS`

Supporting copy:

`Jangan tutup halaman ini. Kalau OSS meminta login, OTP, atau captcha, kamu perlu menyelesaikannya sendiri.`

### Progress Steps

- Membuka OSS
- Menunggu login
- Mengisi data pemilik
- Mengisi data usaha
- Memilih KBLI
- Menunggu review user
- Selesai

### Status Types

Running:

`Automation sedang berjalan`

Waiting user:

`Butuh tindakan kamu`

Failed:

`Proses berhenti sementara`

Completed:

`Draft di OSS selesai diproses`

### Action Buttons

- `Saya sudah login`
- `Lanjutkan`
- `Jeda`
- `Coba lagi`
- `Buka panduan manual`

### Error Example

Title:

`Tampilan OSS berubah`

Body:

`Automation berhenti agar tidak salah isi. Kamu bisa coba lagi atau lanjut manual dari halaman OSS yang terbuka.`

## Page 6: Result / Next Steps

### Purpose

Memberi hasil akhir yang jelas.

### Success State

Header:

`NIB berhasil diproses`

Body:

`Data usaha kamu sudah selesai diproses di OSS. Simpan ringkasan ini untuk catatan kamu.`

Show:

- Nama usaha
- Nama pemilik
- KBLI terpilih
- Nomor NIB jika tersedia
- Tanggal proses
- Link ke OSS

CTA:

- `Lihat di OSS`
- `Unduh ringkasan`
- `Buat draft usaha lain`

### Waiting State

Header:

`Masih butuh tindakan di OSS`

Body:

`Ada langkah yang perlu kamu selesaikan langsung di OSS sebelum NIB bisa selesai.`

CTA:

- `Lanjutkan di OSS`
- `Lihat panduan`

### Failed State

Header:

`Proses belum berhasil`

Body:

`Kami menyimpan draft kamu. Kamu bisa mencoba lagi atau melanjutkan manual di OSS.`

CTA:

- `Coba lagi`
- `Lanjut manual`
- `Hubungi bantuan`

## Page 7: Optional Dashboard for UMKM Assistant

### Purpose

Untuk pendamping UMKM yang mengurus banyak draft.

### Layout

- Table/list aplikasi.
- Filter by status.
- Search nama pemilik/usaha.
- Quick actions.

### Columns / Card Fields

- Nama pemilik
- Nama usaha
- Status
- KBLI terpilih
- Terakhir diperbarui
- Action

### Status

- Draft
- Perlu data
- Siap review
- Menunggu login
- Automation berjalan
- Selesai
- Gagal

## Key Components

### Stepper

Menunjukkan posisi user dalam proses:

1. Data usaha
2. Pilih KBLI
3. Review
4. OSS
5. Selesai

### KBLI Recommendation Card

Harus mudah discan. Jangan membuat card terlalu penuh. Detail bisa dibuka dalam expandable panel.

### Consent Checklist

Harus sangat jelas karena ini menyangkut automation ke website pemerintah.

### Automation Timeline

Timeline harus memberi rasa bahwa sistem sedang bekerja, bukan stuck.

### Status Badge

Gunakan warna konsisten:

- Gray: draft
- Blue/teal: running
- Amber: waiting user
- Green: completed
- Red: failed

## Empty States

### No KBLI Found

Title:

`Belum menemukan KBLI yang cocok`

Body:

`Coba ceritakan usaha kamu dengan lebih spesifik. Sebutkan produk/jasa utama, cara menjual, dan siapa pelanggan kamu.`

CTA:

`Ubah deskripsi usaha`

### Draft Empty

Title:

`Belum ada draft NIB`

Body:

`Mulai dari data usaha, lalu kami bantu cari kandidat KBLI.`

CTA:

`Buat draft baru`

## Loading States

### KBLI Recommendation Loading

Copy:

`Mencocokkan cerita usaha kamu dengan daftar KBLI...`

### Automation Loading

Copy:

`Menyiapkan sesi OSS...`

## Tone of Voice

Gunakan bahasa Indonesia yang natural dan membantu.

Do:

- `Ceritakan usaha kamu seperti ngobrol biasa.`
- `Butuh tindakan kamu.`
- `Cek dulu sebelum lanjut.`
- `Kami berhenti agar tidak salah isi.`

Avoid:

- `Input klasifikasi baku lapangan usaha.`
- `Terjadi galat pada proses eksekusi.`
- `Validasi kredensial gagal.`

## Accessibility Notes

- Semua input harus punya label.
- Error harus bisa dibaca tanpa hanya mengandalkan warna.
- Button harus mudah ditekan di mobile.
- Kontras teks harus tinggi.
- Progress step harus punya label teks.

## Responsive Behavior

Mobile:

- Single column.
- CTA sticky di bawah untuk wizard.
- Cards full width.
- Browser preview automation bisa dibuka lewat modal.

Desktop:

- Max width form sekitar 720px.
- Automation page bisa split view.
- Dashboard bisa memakai table.

## What Not To Design

- Jangan buat landing page panjang dengan hero marketing.
- Jangan jadikan halaman pertama sebagai company profile.
- Jangan tampilkan terlalu banyak istilah legal di awal.
- Jangan membuat automation terasa seperti black box.
- Jangan menyembunyikan consent.
- Jangan membuat user merasa password OSS harus diserahkan ke tool.

## Suggested Stitch Prompt

Design a mobile-first web app called "NIB Assistant" for Indonesian UMKM business owners who want to create an NIB through OSS without being confused by KBLI codes. The app should feel trustworthy, calm, modern, and practical. It is not a marketing landing page; the first screen should immediately help users start an eligibility check.

Create these screens:

1. Start / eligibility check
2. Business profile wizard
3. KBLI recommendation cards
4. Data review and consent checklist
5. OSS automation progress monitor
6. Result / next steps
7. Optional dashboard for UMKM assistants

Use Indonesian microcopy. The UI should include stepper navigation, simple form fields, autosave indicator, KBLI recommendation cards with confidence labels and explanations, review sections with edit buttons, clear consent checklist, automation timeline, waiting-for-user states, failure states, and success result summary.

The product must make clear that the user remains in control. Login, OTP, captcha, legal confirmation, and final submit are handled by the user. The tool only helps prepare data, recommend KBLI candidates, and automate safe form-filling after consent.

Visual style: clean, administrative-modern, mobile-first, deep teal primary color, warm amber accent, neutral background, clear status colors, readable typography, compact but comfortable forms, and minimal navigation.

## Reference Product Logic

The flow:

`Start -> Business Data -> KBLI Recommendation -> Review & Consent -> OSS Automation -> Result`

The key user promise:

`Jawab beberapa pertanyaan. Kami bantu cari KBLI dan siapkan data untuk OSS.`

