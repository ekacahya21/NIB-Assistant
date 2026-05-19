import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { chromium } from 'playwright-extra';
import stealthPlugin from '@zorilla/puppeteer-extra-plugin-stealth';
import { DraftsService } from '../drafts/drafts.service';

// Configure Playwright Extra with the stealth evasion plugin globally
chromium.use(stealthPlugin());

export interface AutomationEvent {
  step: number;
  status: 'info' | 'success' | 'warn' | 'error';
  text: string;
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  private readonly userConfirmations = new Subject<string>();
  private readonly activeOtps = new Map<string, string>();
  private readonly activePasswords = new Map<string, string>();

  constructor(private readonly draftsService: DraftsService) {}

  // Trigger login confirmation or OTP for a specific draft ID
  confirmLogin(draftId: string) {
    this.activeOtps.set(draftId, 'CONFIRMED');
    this.userConfirmations.next(draftId);
  }

  submitOtp(draftId: string, otp: string) {
    this.activeOtps.set(draftId, otp);
    this.userConfirmations.next(draftId);
  }

  submitPassword(draftId: string, password: string) {
    this.activePasswords.set(draftId, password);
    this.userConfirmations.next(draftId);
  }

  // Observable SSE stream for automation status
  getStream(draftId: string, akunOss?: string): Observable<AutomationEvent> {
    const subject = new Subject<AutomationEvent>();
    
    // Launch the background automation process asynchronously
    this.runPlaywrightAutomation(draftId, akunOss, subject).catch((err) => {
      console.error('Playwright execution error:', err);
      const errMsg = `Terjadi kesalahan kritis: ${err.message || err}`;
      this.logStep(subject, 5, 'error', errMsg);
      subject.complete();
    });

    return subject.asObservable();
  }

  private logStep(
    subject: Subject<AutomationEvent>,
    step: number,
    status: 'info' | 'success' | 'warn' | 'error',
    text: string
  ) {
    subject.next({ step, status, text });
    const formattedText = `[Step ${step}] [${status.toUpperCase()}] ${text}`;
    if (status === 'error') {
      this.logger.error(formattedText);
    } else if (status === 'warn') {
      this.logger.warn(formattedText);
    } else {
      this.logger.log(formattedText);
    }
  }

  private async runPlaywrightAutomation(
    draftId: string,
    akunOss: string | undefined,
    subject: Subject<AutomationEvent>
  ): Promise<void> {
    const draft = this.draftsService.findOne(draftId);
    if (!draft) {
      throw new Error(`Data draft dengan ID ${draftId} tidak ditemukan. Silakan isi form wizard terlebih dahulu.`);
    }

    const isRegister = akunOss === 'belum';

    this.logStep(subject, 1, 'info', 'Menginisialisasi browser...');
    
    // Launch Playwright headfully so user can see it
    const browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
      slowMo: 1000,
    });

    let page: any = null;

    try {
      this.logStep(subject, 1, 'success', 'Browser Chromium headful berhasil diluncurkan.');
      
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        recordVideo: {
          dir: './recordings',
          size: { width: 1024, height: 768 },
        },
      });
      page = await context.newPage();

      this.logStep(subject, 1, 'info', `Membuka alamat resmi portal registrasi: ${process.env.OSS_LOGIN_URL}`);
      
      try {
        await page.goto(`${process.env.OSS_PORTAL_URL}`, { waitUntil: 'networkidle', timeout: 15000 });
        this.logStep(subject, 2, 'success', 'Portal OSS berhasil dimuat. Jendela browser terbuka.');
      } catch (e) {
        this.logStep(subject, 2, 'warn', 'Koneksi ke oss.go.id lambat. Menjalankan rendering bantuan lokal di browser...');
      }

      if (isRegister) {
        // 0. Open Register Page
        await page.goto(`${process.env.OSS_LOGIN_URL}/register`, { waitUntil: 'networkidle', timeout: 15000 });
        
        // 1. Fill pelaku usaha dropdown
        await page.waitForTimeout(1000);
        this.logStep(subject, 2, 'info', 'Mengklik tombol "Pilih jenis pelaku usaha" dan memilih "Orang Perseorangan"...');
        await page.getByRole('textbox', { name: 'Pilih jenis pelaku usaha' }).click();
        await page.getByText('Orang Perseorangan').click();
        
        // 2. Fill NIK
        await page.waitForTimeout(1000);
        this.logStep(subject, 2, 'info', `Mengisi NIK Pemilik: ${draft.nik}...`);
        await page.getByRole('textbox', { name: 'Masukkan 16 digit NIK sesuai' }).click();
        await page.getByRole('textbox', { name: 'Masukkan 16 digit NIK sesuai' }).fill(draft.nik);

        // Wait dynamically for NIK and Email verification status in parallel (up to 15s max, checking every 500ms)
        this.logStep(subject, 2, 'info', `Mengisi Email Pemilik: ${draft.email}...`);
        await page.getByRole('textbox', { name: 'Contoh: nama@email.com' }).click();
        await page.getByRole('textbox', { name: 'Contoh: nama@email.com' }).fill(draft.email);

        let isNikRegistered = false;
        let isEmailRegistered = false;
        const maxPollMs = 15000;
        const pollIntervalMs = 500;
        const startPollTime = Date.now();

        while (Date.now() - startPollTime < maxPollMs) {
          isNikRegistered = await page.getByText('NIK sudah terdaftar').isVisible();
          isEmailRegistered = await page.getByText('Email sudah terdaftar').isVisible();
          
          if (isNikRegistered || isEmailRegistered) {
            break;
          }

          // If BOTH fields are valid, the "Verifikasi" button becomes enabled.
          const isVerifikasiEnabled = await page.getByRole('button', { name: 'Verifikasi' }).isEnabled().catch(() => false);
          // Wait at least 1.5 seconds to let portal validation APIs query and not short-circuit instantly
          if (isVerifikasiEnabled && (Date.now() - startPollTime > 1500)) {
            this.logStep(subject, 2, 'success', 'Validasi NIK dan Email sukses.');
            break;
          }

          await page.waitForTimeout(pollIntervalMs);
        }

        if (isNikRegistered) {
          this.logStep(subject, 2, 'error', 'Pendaftaran GAGAL: NIK sudah terdaftar di portal OSS. Silakan masuk menggunakan akun terdaftar Anda.');
          throw new Error('NIK sudah terdaftar di portal OSS.');
        }

        if (isEmailRegistered) {
          this.logStep(subject, 2, 'error', 'Pendaftaran GAGAL: Email sudah terdaftar di portal OSS. Silakan gunakan email lain atau masuk dengan email terdaftar.');
          throw new Error('Email sudah terdaftar di portal OSS.');
        }
        
        // 4. Click Verifikasi
        this.logStep(subject, 2, 'info', 'Mengklik tombol "Verifikasi"...');
        await page.getByRole('button', { name: 'Verifikasi' }).click();
        
        // 5. Prompt OTP
        await page.waitForTimeout(5000);
        this.logStep(subject, 2, 'warn', 'PENTING: Silakan buka email Anda, salin kode OTP, dan masukkan kode OTP di halaman aplikasi.');

        // 6. Asynchronous Wait for OTP submitted from Frontend!
        let otpCode = '';
        const startTime = Date.now();
        while (Date.now() - startTime < 120000) { // Timeout after 120 seconds
          if (this.activeOtps.has(draftId)) {
            otpCode = this.activeOtps.get(draftId)!;
            this.activeOtps.delete(draftId);
            break;
          }
          await page.waitForTimeout(500);
        }

        if (!otpCode || otpCode.length !== 6) {
          this.logStep(subject, 2, 'error', 'Pendaftaran GAGAL: Batas waktu pengisian OTP telah habis (90 detik). Silakan coba lagi.');
          throw new Error('Batas waktu pengisian OTP telah habis.');
        }

        this.logStep(subject, 2, 'success', `OTP diterima: ${otpCode}. Memverifikasi kode OTP... [SUKSES]`);
        
        // 7. Fill OTP
        await page.locator('.otp-input2').first().fill(otpCode[0] || '');
        await page.locator('div:nth-child(2) > .otp-input2').fill(otpCode[1] || '');
        await page.locator('div:nth-child(3) > .otp-input2').fill(otpCode[2] || '');
        await page.locator('div:nth-child(4) > .otp-input2').fill(otpCode[3] || '');
        await page.locator('div:nth-child(5) > .otp-input2').fill(otpCode[4] || '');
        await page.locator('div:nth-child(6) > .otp-input2').fill(otpCode[5] || '');
        
        // Check if there is a visible error message on the page related to OTP failure
        const isOtpErrorVisible = await page.getByText(/salah|tidak valid|expired|tidak berlaku|otp/i).isVisible().catch(() => false);
        if (isOtpErrorVisible) {
          const errorMsg = await page.getByText(/salah|tidak valid|expired|tidak berlaku|otp/i).textContent().catch(() => 'Kode OTP tidak valid.');
          this.logStep(subject, 2, 'error', `Pendaftaran GAGAL: Verifikasi OTP gagal di portal OSS: ${errorMsg}`);
          throw new Error(`Verifikasi OTP gagal: ${errorMsg}`);
        }

        // 8. Setting up password
        await page.waitForTimeout(5000);
        this.logStep(subject, 2, 'warn', 'PENTING: Silakan masukkan kata sandi baru Anda di halaman aplikasi.');

        // Search for element with type="password" selector
        try {
          await page.waitForSelector('input[type="password"]', { timeout: 30000 });
        } catch (e) {
          this.logStep(subject, 2, 'error', 'Pendaftaran GAGAL: Form pembuatan kata sandi tidak ditemukan atau verifikasi OTP gagal.');
          throw new Error('Form pembuatan kata sandi tidak ditemukan.');
        }

        // Wait for password submitted from Frontend!
        let passwordCode = '';
        const startTimePass = Date.now();
        while (Date.now() - startTimePass < 120000) { // Timeout after 120 seconds
          if (this.activePasswords.has(draftId)) {
            passwordCode = this.activePasswords.get(draftId)!;
            this.activePasswords.delete(draftId);
            break;
          }
          await page.waitForTimeout(500);
        }

        if (!passwordCode) {
          this.logStep(subject, 2, 'error', 'Pendaftaran GAGAL: Batas waktu pengisian kata sandi telah habis (90 detik).');
          throw new Error('Batas waktu pengisian kata sandi telah habis.');
        }

        // Fill both password inputs (Kata Sandi & Konfirmasi Kata Sandi)
        this.logStep(subject, 2, 'info', 'Mengisi kata sandi baru dan konfirmasi kata sandi...');
        const passwordInputs = page.locator('input[type="password"]');
        await passwordInputs.nth(0).fill(passwordCode);
        await page.waitForTimeout(1000);
        await passwordInputs.nth(1).fill(passwordCode);
        await page.waitForTimeout(1000);
        await page.getByRole('button', { name: 'Lanjut' }).click();

        // Wait to verify if the password page submitted successfully
        await page.waitForTimeout(3000);
        const isPasswordStillVisible = await passwordInputs.first().isVisible().catch(() => false);
        if (isPasswordStillVisible) {
          // Check for any visible error text related to password mismatch or validation
          const isMismatchVisible = await page.getByText(/tidak sama|tidak sesuai|tidak cocok|konfirmasi/i).isVisible().catch(() => false);
          if (isMismatchVisible) {
            const mismatchText = await page.getByText(/tidak sama|tidak sesuai|tidak cocok|konfirmasi/i).textContent().catch(() => 'Konfirmasi kata sandi tidak cocok.');
            this.logStep(subject, 2, 'error', `Pendaftaran GAGAL: Konfirmasi kata sandi tidak cocok atau ditolak: ${mismatchText.trim()}`);
            throw new Error(`Konfirmasi kata sandi tidak cocok: ${mismatchText.trim()}`);
          }

          // Check individual password requirements checklist for failures (like red cross icons)
          const requirements = [
            { key: 'Minimal 8 karakter', text: 'Minimal 8 karakter' },
            { key: 'Menggunakan huruf', text: 'Menggunakan huruf' },
            { key: 'Menggunakan angka', text: 'Menggunakan angka' },
            { key: 'Menggunakan karakter spesial', text: 'Menggunakan karakter spesial (!@#$%^&*_-)' }
          ];
          const failedReqs: string[] = [];

          for (const req of requirements) {
            const textLocator = page.locator(`text="${req.key}"`).first();
            if (await textLocator.isVisible().catch(() => false)) {
              const parent = textLocator.locator('xpath=..');
              let html = await parent.innerHTML().catch(() => '');
              
              // Also grab grandparent to capture icons nested outside immediate tag
              const grandparent = parent.locator('xpath=..');
              const gHtml = await grandparent.innerHTML().catch(() => '');
              html += ' ' + gHtml;

              // Check if red cross icon or error status is present
              const hasRed = html.includes('red') || html.includes('danger') || html.includes('error') || html.includes('cross') || html.includes('close');
              const hasGreen = html.includes('green') || html.includes('success') || html.includes('check');
              
              if (hasRed || !hasGreen) {
                failedReqs.push(req.text);
              }
            }
          }

          if (failedReqs.length > 0) {
            const listStr = failedReqs.map(r => `❌ ${r}`).join(', ');
            this.logStep(subject, 2, 'error', `Pendaftaran GAGAL: Kekuatan kata sandi belum terpenuhi. Kriteria yang gagal: ${listStr}`);
            throw new Error(`Kekuatan kata sandi belum terpenuhi: ${listStr}`);
          }

          this.logStep(subject, 2, 'error', 'Pendaftaran GAGAL: Pembuatan kata sandi ditolak oleh portal OSS (kemungkinan konfirmasi kata sandi tidak cocok).');
          throw new Error('Pembuatan kata sandi ditolak atau konfirmasi tidak cocok.');
        }
        
        // 9. Fill detail pelaku usaha
        this.logStep(subject, 3, 'info', 'Lanjut mengisi detail pelaku usaha (nomor ponsel, nama, jenis kelamin, tanggal lahir)...');
        
        // Trim leading 0, 62 or +62 from the phone number
        let cleanPhone = draft.nomorHp.trim().replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('62')) {
          cleanPhone = cleanPhone.substring(2);
        } else if (cleanPhone.startsWith('0')) {
          cleanPhone = cleanPhone.substring(1);
        }
        await page.getByRole('textbox', { name: '81x-xxxx-xxxxx' }).click();
        await page.getByRole('textbox', { name: '81x-xxxx-xxxxx' }).fill(cleanPhone);
        
        await page.getByRole('textbox', { name: 'Masukkan nama sesuai KTP' }).click();
        await page.getByRole('textbox', { name: 'Masukkan nama sesuai KTP' }).fill(draft.namaPemilik);
        
        if (draft.jenisKelamin === 'Perempuan') {
          await page.getByText('Perempuan').click();
        } else {
          await page.getByText('Laki-laki').click();
        }
        
        // Reformat birth date from yyyy-mm-dd to dd/mm/yyyy
        let formattedBirthDate = draft.tanggalLahir.trim();
        if (formattedBirthDate.includes('-')) {
          const parts = formattedBirthDate.split('-');
          if (parts[0].length === 4) {
            formattedBirthDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
          }
        }
        await page.getByRole('textbox', { name: 'dd/mm/yyyy' }).click();
        await page.getByRole('textbox', { name: 'dd/mm/yyyy' }).fill(formattedBirthDate);
        
        // Fill alamat
        await page.getByRole('textbox', { name: 'Contoh: Jl. RUSA' }).click();
        await page.getByRole('textbox', { name: 'Contoh: Jl. RUSA' }).fill(draft.alamatUsaha);
        
        // Search and Select Provinsi
        const cleanProvinsi = draft.provinsi.trim();
        const searchProvinsi = this.getOptimalSearchQuery(cleanProvinsi);
        this.logStep(subject, 3, 'info', `Mencari provinsi: ${cleanProvinsi}...`);
        await this.clickAndFillInputResilient(page, 'Pilih provinsi', searchProvinsi);
        await page.waitForTimeout(1500);
        await this.selectOptionRobust(page, cleanProvinsi);
        await page.waitForTimeout(1000);

        // Trim "Kota" / "Kabupaten" and search using partial "like" match
        const cleanKota = draft.kotaKabupaten.replace(/kota|kabupaten/gi, '').trim();
        const searchKota = this.getOptimalSearchQuery(cleanKota);
        this.logStep(subject, 3, 'info', `Mencari kabupaten/kota: ${draft.kotaKabupaten}...`);
        await this.clickAndFillInputResilient(page, 'Pilih kabupaten/kota', searchKota);
        await page.waitForTimeout(1500);
        await this.selectOptionRobust(page, cleanKota);
        await page.waitForTimeout(1000);

        // Search and Select Kecamatan
        const cleanKecamatan = draft.kecamatan.trim();
        const searchKecamatan = this.getOptimalSearchQuery(cleanKecamatan);
        this.logStep(subject, 3, 'info', `Mencari kecamatan: ${cleanKecamatan}...`);
        await this.clickAndFillInputResilient(page, 'Pilih kecamatan', searchKecamatan);
        await page.waitForTimeout(1500);
        await this.selectOptionRobust(page, cleanKecamatan);
        await page.waitForTimeout(1000);

        // Search and Select Desa / Kelurahan
        const cleanKelurahan = draft.kelurahan.trim();
        const searchKelurahan = this.getOptimalSearchQuery(cleanKelurahan);
        this.logStep(subject, 3, 'info', `Mencari desa/kelurahan: ${cleanKelurahan}...`);
        await this.clickAndFillInputResilient(page, 'Pilih desa/kelurahan', searchKelurahan);
        await page.waitForTimeout(1500);
        await this.selectOptionRobust(page, cleanKelurahan);
        await page.waitForTimeout(1000);
        
        this.logStep(subject, 3, 'success', 'Semua data detail pelaku usaha dan lokasi berhasil diisi.');

        // 10. Mencentang checkbox persetujuan
        this.logStep(subject, 3, 'info', 'Mencentang checkbox persetujuan...');
        try {
          await page.getByRole('checkbox', { name: 'Saya setuju dengan Syarat dan' }).click({ force: true });
        } catch (e) {
          await page.getByText('Saya setuju dengan Syarat dan Ketentuan').first().click({ force: true });
        }
        
        // 11. Mengklik tombol "Daftar" untuk memproses pendaftaran akun...
        this.logStep(subject, 3, 'info', 'Mengklik tombol "Daftar" untuk memproses pendaftaran akun...');
        await page.getByRole('button', { name: 'Daftar' }).click();

        // Wait for Dukcapil NIK/Name match checking API
        this.logStep(subject, 3, 'info', 'Menunggu verifikasi NIK dan Nama Pemilik dengan Dukcapil...');
        await page.waitForTimeout(4000);
        const isKtpMismatch = await page.getByText('Data tidak sesuai KTP').isVisible();
        if (isKtpMismatch) {
          this.logStep(subject, 3, 'error', 'Pendaftaran GAGAL: Data nama pelaku usaha atau NIK tidak sesuai KTP Dukcapil. Silakan periksa kembali ketikan Anda.');
          throw new Error('Data tidak sesuai KTP');
        }
        
        this.logStep(subject, 3, 'success', 'Selamat! Registrasi akun OSS Pelaku Usaha telah BERHASIL diselesaikan.');

        // Keep open for a bit
        await page.waitForTimeout(10000);

      }

      // // Step 2: Waiting for user login
      // this.logStep(subject, 2, 'warn', 'PENTING: Silakan selesaikan proses LOGIN / OTP di jendela browser Chrome yang terbuka.');

      // // Wait for login confirmation
      // let isConfirmed = false;
      // const startTime = Date.now();
      // while (Date.now() - startTime < 60000) {
      //   if (this.activeOtps.has(draftId)) {
      //     isConfirmed = true;
      //     this.activeOtps.delete(draftId);
      //     break;
      //   }
      //   await page.waitForTimeout(500);
      // }

      // this.logStep(subject, 3, 'success', 'Persetujuan diterima: User melaporkan login berhasil.');
      // this.logStep(subject, 3, 'info', 'Melakukan sinkronisasi session state browser...');
      
      // // Render simulated dashboard
      // await page.evaluate(() => {
      //   document.body.innerHTML = `
      //     <div style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #eaeaea;">
      //       <h2 style="color: #10b981; margin-bottom: 20px;">Dashboard Pelaku Usaha OSS</h2>
      //       <div id="details" style="background: #f3f4f6; padding: 15px; border-radius: 8px; font-size: 13px;">
      //         <strong>Status:</strong> Terautentikasi<br>
      //         <strong>Pemilik:</strong> Budi Santoso
      //       </div>
      //       <div id="form-container" style="margin-top:20px;">
      //         <h3 style="color:#333;">Formulir NIB Draft</h3>
      //         <div style="margin-bottom:10px;"><label style="display:block; font-size:12px; font-weight:bold; margin-bottom:4px;">Nama Pemilik</label><input type="text" id="nama" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; box-sizing: border-box;" /></div>
      //         <div style="margin-bottom:10px;"><label style="display:block; font-size:12px; font-weight:bold; margin-bottom:4px;">Alamat Usaha</label><input type="text" id="alamat" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; box-sizing: border-box;" /></div>
      //       </div>
      //     </div>
      //   `;
      // });

      // await page.waitForTimeout(1000);
      // this.logStep(subject, 3, 'info', `Mengisi kolom Nama Pemilik: ${draft.namaPemilik}...`);
      // await page.locator('#nama').fill(draft.namaPemilik);
      // await page.waitForTimeout(1500);

      // this.logStep(subject, 3, 'info', `Mengisi NIK Pemilik: ${draft.nik}...`);
      // await page.waitForTimeout(1000);

      // this.logStep(subject, 3, 'info', `Mengisi Kontak WhatsApp: ${draft.nomorHp} & Alamat Detail: ${draft.alamatUsaha}...`);
      // await page.locator('#alamat').fill(draft.alamatUsaha);
      // await page.waitForTimeout(1500);

      // // Step 4: Selecting KBLI
      // this.logStep(subject, 4, 'info', 'Memilih Sektor KBLI & Modal Usaha...');
      // await page.waitForTimeout(1000);

      // const kbliCode = draft.kbliCode || '56103';
      // const kbliTitle = draft.kbliTitle || 'Kedai Makanan';
      // this.logStep(subject, 4, 'info', `Memilih KBLI: ${kbliCode} (${kbliTitle})...`);
      // await page.waitForTimeout(1000);

      // this.logStep(subject, 4, 'info', `Menginput Modal Usaha: Rp${draft.modalUsaha} & Jumlah Pekerja: ${draft.jumlahPekerja}...`);
      // await page.waitForTimeout(2000);

      // // Step 5: Final Review / Complete
      // this.logStep(subject, 5, 'success', 'Semua data berhasil diisi ke form portal OSS.');
      // this.logStep(subject, 5, 'success', 'Silakan periksa kembali halaman browser Anda, klik "Terbitkan NIB" untuk finalisasi.');
      
      await page.waitForTimeout(10000);
    } finally {
      try {
        const videoPath = await page.video()?.path();
        if (videoPath) {
          this.logger.log(`Otomatisasi selesai. Rekaman disimpan di: ${videoPath}`);
          this.logStep(subject, 5, 'info', `Rekaman otomatisasi disimpan di: ${videoPath}`);
        }
      } catch (videoErr) {
        this.logger.error('Gagal mengambil path video rekaman', videoErr);
      }
      await browser.close();
      subject.complete();
    }
  }

  async runPlaywrightLogin(username: string, password: string): Promise<{ success: boolean; redirectedUrl: string; error?: string }> {
    const headless = process.env.PLAYWRIGHT_HEADLESS === 'true';
    const slowMo = parseInt(process.env.PLAYWRIGHT_SLOW_MO || '500', 10);
    
    console.log(`Launching Playwright (headless: ${headless}, slowMo: ${slowMo}ms)...`);
    const browser = await chromium.launch({
      headless,
      slowMo,
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      console.log('Opening https://ui-login-stg.oss.go.id/login...');
      await page.goto(`${process.env.OSS_LOGIN_URL}`, {
        waitUntil: 'networkidle',
        timeout: 45000,
      });

      console.log('Looking for login inputs...');
      const usernameSelector = 'input[name="username"], input[type="text"], input[placeholder*="Username"], input[placeholder*="Email"], #username';
      const passwordSelector = 'input[name="password"], input[type="password"], input[placeholder*="Sandi"], input[placeholder*="Password"], #password';

      await page.waitForSelector(usernameSelector, { timeout: 15000 });
      await page.fill(usernameSelector, username);

      await page.waitForSelector(passwordSelector, { timeout: 15000 });
      await page.fill(passwordSelector, password);

      console.log('Clicking login button...');
      const loginButtonSelector = 'button[type="button"]';
      await page.click(loginButtonSelector);

      console.log('Waiting for redirection from login page...');
      let redirectedUrl = page.url();
      const startTime = Date.now();
      while (Date.now() - startTime < 30000) {
        const currentUrl = page.url();
        if (currentUrl && !currentUrl.includes('/login')) {
          redirectedUrl = currentUrl;
          console.log('Redirected URL detected:', redirectedUrl);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      redirectedUrl = page.url();

      return {
        success: !redirectedUrl.includes('/login'),
        redirectedUrl,
      };

    } catch (error) {
      console.error('Playwright automation error:', error);
      return {
        success: false,
        redirectedUrl: '',
        error: error.message || String(error),
      };
    } finally {
      await browser.close();
    }
  }

  private async selectOptionRobust(page: any, query: string): Promise<boolean> {
    const normalQuery = query.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    // Wait for options list to be visible/loaded
    await page.waitForTimeout(1000);
    
    const optionElements = page.getByRole('option');
    const count = await optionElements.count();
    
    for (let i = 0; i < count; i++) {
      const opt = optionElements.nth(i);
      try {
        const text = await opt.innerText();
        const normalText = text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (normalText.includes(normalQuery) || normalQuery.includes(normalText)) {
          await opt.scrollIntoViewIfNeeded();
          await opt.click({ force: true });
          await page.waitForTimeout(1000); // Wait for UI update/network trigger
          await page.keyboard.press('Escape'); // Close dropdown menu if it remains open
          return true;
        }
      } catch (e) {
        // Handle element detached or other transient errors
      }
    }
    
    // Fallback: Click first visible option
    if (count > 0) {
      try {
        const firstOpt = optionElements.first();
        await firstOpt.scrollIntoViewIfNeeded();
        await firstOpt.click({ force: true });
        await page.waitForTimeout(1000);
        await page.keyboard.press('Escape');
        return true;
      } catch (e) {}
    }
    
    // Ultimate Keyboard fallback: Press ArrowDown and Enter
    try {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      return true;
    } catch (e) {}
    
    return false;
  }

  private async waitForInputEnabled(page: any, selector: string, timeoutMs = 15000): Promise<boolean> {
    const startTime = Date.now();
    const locator = page.getByRole('textbox', { name: selector });
    while (Date.now() - startTime < timeoutMs) {
      try {
        const isDisabled = await locator.getAttribute('disabled');
        if (isDisabled === null) {
          return true;
        }
      } catch (e) {
        // Element might not be attached/rendered yet
      }
      await page.waitForTimeout(250);
    }
    return false;
  }

  private async clickAndFillInputResilient(page: any, selector: string, value: string, timeoutMs = 15000): Promise<boolean> {
    const startTime = Date.now();
    const locator = page.getByRole('textbox', { name: selector });
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        // Wait for element to be attached and visible
        await locator.waitFor({ state: 'visible', timeout: 2000 });
        
        // Check disabled state
        const isDisabled = await locator.getAttribute('disabled');
        if (isDisabled === null || isDisabled === 'false') {
          // Attempt click and fill
          await locator.click({ timeout: 2000 });
          await page.waitForTimeout(200);
          await locator.fill(value);
          return true;
        }
      } catch (e) {
        // Click or fill failed, retry
      }
      await page.waitForTimeout(500);
    }
    throw new Error(`Gagal mengisi kolom "${selector}" karena kolom tetap dinonaktifkan (disabled) atau tidak dapat diklik.`);
  }

  private getOptimalSearchQuery(name: string): string {
    const trimmed = name.trim();
    if (trimmed.includes(' ')) {
      const parts = trimmed.split(/\s+/);
      const firstWord = parts[0];
      if (firstWord.length >= 3) {
        return firstWord;
      }
    }
    return trimmed;
  }
}
