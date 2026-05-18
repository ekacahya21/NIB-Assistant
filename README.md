# 🛡️ NIB Assistant (Next.js + NestJS + Playwright)

NIB Assistant adalah aplikasi full-stack premium yang dirancang untuk mendampingi pemilik usaha (UMKM) dalam mendaftarkan Nomor Induk Berusaha (NIB) secara otomatis di portal resmi **OSS Indonesia (oss.go.id)**.

Aplikasi ini menggunakan **Next.js** untuk antarmuka pengguna yang modern dan adaptif, serta **NestJS** di sisi backend untuk mengelola draft data, klasifikasi kode **KBLI**, dan menjalankan **Playwright** secara lokal guna membantu otomatisasi pengisian formulir.

---

## 🏗️ Alur Otomatisasi (Hybrid Automation Model)

Keamanan kredensial dan keakuratan data adalah prioritas utama. Oleh karena itu, otomatisasi berjalan secara **hybrid**:
1. **Otomatisasi Lokal:** Browser dipicu secara headful (jendela Chrome terbuka secara fisik di komputer lokal).
2. **Kendali Pengguna:** Browser otomatis akan berhenti dan menunggu masukan dari pengguna ketika menemui **OTP, CAPTCHA, atau Persetujuan Akhir (Submit)**.
3. **Audit Transparansi:** Seluruh log pengisian terekam secara transparan pada panel log konsol.

---

## ⚙️ Konfigurasi Environment Variables (`.env`)

Sebelum menjalankan aplikasi, Anda wajib membuat file `.env` di dalam folder `frontend/` dan `backend/`. 

### 1. Backend (`backend/.env`)
Salin file `backend/.env.example` menjadi `backend/.env` dan sesuaikan nilainya:
```bash
# NestJS Server Configuration
PORT=3001

# Playwright Local Automation Configurations
# Atur ke 'false' agar browser terbuka secara fisik (Headful) untuk mengisi login & OTP
PLAYWRIGHT_HEADLESS=false

# Kecepatan pengetikan/aksi otomatis (dalam milidetik) untuk meniru tindakan manusia
PLAYWRIGHT_SLOW_MO=500

# URL Target portal OSS
OSS_PORTAL_URL=https://oss.go.id
```

### 2. Frontend (`frontend/.env`)
Salin file `frontend/.env.example` menjadi `frontend/.env` dan sesuaikan nilainya:
```bash
# Koneksi Endpoint API Backend NestJS
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 🚀 Panduan Menjalankan Secara Lokal

### Prasyarat
- **Node.js** v18+ atau v20+ terpasang di sistem Anda.
- **npm** (Package Manager).

### Langkah 1: Kloning & Pemasangan Dependensi
Buka terminal dan pasang semua dependensi pada masing-masing folder:

```bash
# Pemasangan dependensi Frontend
cd frontend
npm install

# Pemasangan dependensi Backend
cd ../backend
npm install
```

### Langkah 2: Pemasangan Browser Playwright
Backend NestJS menggunakan Playwright untuk memicu otomasi browser. Pasang browser engine bawaannya:
```bash
cd backend
npx playwright install chromium
```

### Langkah 3: Menjalankan Aplikasi

Jalankan server backend dan frontend secara bersamaan di terminal terpisah:

#### Terminal 1: Backend (NestJS)
```bash
cd backend
npm run start:dev
# Backend akan berjalan di http://localhost:3001
```

#### Terminal 2: Frontend (Next.js)
```bash
cd frontend
npm run dev
# Frontend akan berjalan di http://localhost:3000
```

Buka browser Anda dan akses **`http://localhost:3000`** untuk mencoba aplikasi!

---

## 🚢 Panduan Deployment Produksi (Step-by-Step)

### A. Deploy Frontend (Next.js)

Frontend dapat dideploy dengan mudah ke platform cloud modern seperti **Vercel** atau **Netlify**:

#### Cara 1: Deploy ke Vercel (Rekomendasi)
1. Buat akun di [Vercel](https://vercel.com).
2. Hubungkan repositori GitHub Anda dengan proyek Vercel.
3. Atur **Root Directory** ke `frontend`.
4. Tambahkan Environment Variable:
   - `NEXT_PUBLIC_API_URL`: `https://api-nib-assistant.domain.com` (Ubah ke URL backend production Anda).
5. Klik **Deploy**.

#### Cara 2: Build Manual & Deploy ke Server VPS (PM2/Nginx)
Jika Anda menggunakan server sendiri:
```bash
cd frontend
npm run build
# Jalankan menggunakan PM2
pm2 start "npm run start" --name "nib-frontend"
```

---

### B. Deploy Backend (NestJS + Playwright)

Karena backend menjalankan Playwright (yang membutuhkan dependensi browser engine seperti Chromium), deployment menggunakan **Docker** sangat direkomendasikan agar sistem operasi memiliki semua library GUI/headful yang dibutuhkan.

#### Menggunakan Docker (Rekomendasi)
Buat file `Dockerfile` di dalam folder `backend/`:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependensi
RUN npm ci

# Copy all source files
COPY . .

# Build NestJS
RUN npm run build

# Expose Port
EXPOSE 3001

# Run Server
CMD ["node", "dist/main.js"]
```

Build dan jalankan Docker Image:
```bash
cd backend
docker build -t nib-backend .
docker run -p 3001:3001 --name nib-backend-runner nib-backend
```

#### Menggunakan VPS (Ubuntu) Tanpa Docker
Jika Anda mendeploy langsung ke VPS Linux, jalankan perintah berikut untuk menginstal dependensi system library Linux yang dibutuhkan oleh browser Chromium:

1. **Install System Dependencies:**
   ```bash
   cd backend
   npm ci
   npx playwright install-deps chromium
   npx playwright install chromium
   ```
2. **Jalankan Backend menggunakan PM2:**
   ```bash
   npm run build
   pm2 start dist/main.js --name "nib-backend"
   ```

---

## 🛠️ Pemecahan Masalah (Troubleshooting)

### 1. Browser Playwright tidak muncul secara lokal
Pastikan Anda telah menginstal browser Chromium bawaan Playwright dengan benar:
```bash
npx playwright install chromium
```
Pastikan variabel `PLAYWRIGHT_HEADLESS=false` telah diatur di file `.env` backend Anda agar browser fisik dapat terbuka.

### 2. Error CORS pada Frontend
Pastikan backend NestJS telah mengaktifkan CORS. Di dalam `backend/src/main.ts`, pastikan baris `app.enableCors()` sudah aktif agar mengizinkan request dari domain Next.js.
