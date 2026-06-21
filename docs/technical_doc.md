# Dokumentasi Teknis NIB Assistant (High-Level)

Dokumen ini berisi arsitektur teknis, desain sistem, alur data, serta detail implementasi dari aplikasi **NIB Assistant**.

---

## 🏛️ Arsitektur Sistem

NIB Assistant menggunakan arsitektur modern berbasis microservices monorepo sederhana yang terbagi menjadi dua komponen utama:

1. **Frontend (Next.js)**: Aplikasi web interaktif berbasis React yang berjalan di port `3000`. Bertugas mengelola formulir wizard data draf, menerima event SSE (Server-Sent Events) untuk memantau status otomatisasi, serta memfasilitasi interaksi pengguna (input OTP, CAPTCHA, sandi).
2. **Backend (NestJS)**: REST API dan runtime scheduler pendaftaran berbasis TypeScript yang berjalan di port `3001`. Bertugas mengelola integrasi database PostgreSQL, menghasilkan dokumen PDF dinamis, serta mengontrol instansi browser otomatisasi (Playwright).
3. **Database (PostgreSQL)**: Penyimpanan data draf, status otomatisasi, dan rata-rata durasi berjalan, yang diakses menggunakan **Prisma ORM**.

---

## 🔄 Alur Komunikasi Real-time (SSE)

Otomatisasi bersifat **hybrid-interactive** dan membutuhkan komunikasi dua arah yang difasilitasi oleh **Server-Sent Events (SSE)** dan REST API:

```
[ Frontend (Next.js) ]                          [ Backend (NestJS) ]
        |                                                |
        |--- 1. Request SSE Stream (getStream) --------->| (Membuat Subject & Cek Sesi Ganda)
        |                                                | (Enqueue pendaftaran & run Playwright)
        |<-- 2. Log Status Otomatisasi (Step 1-6) -------|
        |                                                |
        |--- 3. (Jika butuh OTP) Kirim OTP via POST ---->| (Memasukkan OTP ke input Playwright)
        |<-- 4. Lanjut Log Status Otomatisasi -----------|
        |                                                |
        |--- 5. Disconnect (Koneksi Terputus/Tutup) ---->| (Memicu cancelStream & browser.close)
```

---

## ⚙️ Detail Implementasi Modul Utama

### 1. Sistem Antrean & Estimasi Durasi (`AutomationService`)
* **Batas Concurrency**: Jumlah browser Playwright yang berjalan dibatasi oleh variabel lingkungan `PLAYWRIGHT_MAX_CONCURRENT_SESSIONS` (default: 3).
* **Aliran Antrean**: Permintaan pendaftaran baru yang melebihi batas concurrency dimasukkan ke dalam antrean internal (`queue`) menggunakan pola Promise resolver:
  ```typescript
  new Promise<void>((resolve, reject) => {
    this.queue.push({ draftId, subject, resolve, reject, ... });
  })
  ```
* **Kalkulasi Estimasi**: Setiap kali antrean bertambah atau maju, estimasi waktu tunggu diperbarui menggunakan rata-rata durasi dari database:
  $$\text{Estimasi Waktu Tunggu} = (\text{Slot Aktif} + \text{Posisi Antrean Sebelumnya}) \times \text{Rata-rata Durasi Sesi Sukses}$$
  Fungsi `this.draftsService.getAverageDuration()` mengambil data historis dari tabel `drafts` dengan kondisi `status = 'COMPLETED'` dan menggunakan fallback 180 detik jika belum ada data.

### 2. Pencegahan Sesi Ganda (Double Session Prevention)
Untuk memproteksi database dan server dari konflik pendaftaran, backend melakukan validasi pada `getStream()` sebelum mendaftarkan sesi baru:
```typescript
if (this.activeSubjects.has(draftId)) {
  subscriber.next({
    step: 1,
    status: 'error',
    text: 'Sesi otomatisasi untuk data ini sudah berjalan atau sedang mengantre.'
  });
  subscriber.complete();
  return;
}
```
Ketika koneksi duplikat terdeteksi, koneksi tersebut langsung menerima event `error` dan ditutup tanpa mengeksekusi callback unsubscriber asli (sehingga sesi pertama yang sah tetap berjalan aman).

### 3. Siklus Hidup & Pembersihan Browser (App Lifecycle Teardown)
Untuk mencegah *zombie Chrome processes* akibat server NestJS dimatikan/di-restart saat otomatisasi berjalan:
* **Shutdown Hooks**: `main.ts` memanggil `app.enableShutdownHooks()` agar NestJS mendengarkan signal terminasi OS (`SIGINT`, `SIGTERM`).
* **Lifecycle Destroy**: `AutomationService` mengimplementasikan `OnModuleDestroy`. Saat shutdown dipicu, method `onModuleDestroy()` secara paralel menutup seluruh browser yang aktif, menyelesaikan SSE stream, dan me-reject antrean:
  ```typescript
  async onModuleDestroy() {
    const closePromises = Array.from(this.activeBrowsers.values()).map(b => b.close());
    await Promise.all(closePromises);
    this.activeBrowsers.clear();
    // Menyelesaikan semua subjek dan menolak antrean tersisa
  }
  ```

### 4. Integrasi Pihak Ketiga & Pemrosesan Dokumen (`DocumentsService`)
* **Koordinat Geografis**: Menggunakan API OpenStreetMap Nominatim untuk menerjemahkan input koordinat draf (`latitude`, `longitude`) menjadi nama lokasi administratif yang dikenali portal OSS.
* **Penyusunan Dokumen Otomatis**: Layanan menghasilkan berkas PDF dinamis untuk dokumen Pernyataan Mandiri dan melampirkan berkas foto lokasi yang diunggah pengguna. Berkas ini disimpan sementara di disk server dan diunggah menggunakan API unggah berkas Playwright (`setInputFiles`). File dibersihkan dari server segera setelah proses unggah selesai atau gagal.

---

## 🛠️ Panduan Pemeliharaan (Maintenance)

### Variabel Lingkungan (`.env`)
Pastikan variabel lingkungan di backend terkonfigurasi dengan benar:
* `DATABASE_URL`: Kredensial PostgreSQL.
* `OSS_PORTAL_URL`: URL utama portal OSS.
* `OSS_LOGIN_URL`: URL halaman login portal OSS.
* `PLAYWRIGHT_MAX_CONCURRENT_SESSIONS`: Jumlah maksimal browser paralel (disarankan 3 untuk server dengan RAM 4GB).
* `PLAYWRIGHT_HEADLESS`: Atur ke `true` untuk mode *headless* (tidak menampilkan jendela browser di server produksi) atau `false` untuk melihat interaksi bot secara visual.

### Pembaruan Skema Database
Jika terdapat perubahan skema pada `schema.prisma`, jalankan perintah berikut untuk mensinkronisasi ke PostgreSQL lokal:
```bash
npx prisma db push
```
