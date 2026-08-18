import { Injectable, Logger } from '@nestjs/common';
import { DraftsService } from '../../drafts/drafts.service';
import { PortalInteractionHelper } from './portal-interaction.helper';
import { AutomationSessionContext } from '../context/automation-session.context';

@Injectable()
export class RegistrationFlowService {
  private readonly logger = new Logger(RegistrationFlowService.name);
  private readonly cachedPasswords = new Map<string, string>();

  constructor(
    private readonly interactionHelper: PortalInteractionHelper,
    private readonly draftsService: DraftsService,
  ) {}

  public async executeRegistrationSteps(
    context: AutomationSessionContext,
  ): Promise<string> {
    const { page, draft, txId } = context;

    // 0. Open Register Page
    await page.goto(`${process.env.OSS_LOGIN_URL}/register`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 1. Fill pelaku usaha dropdown
    await page.waitForTimeout(1000);
    context.logStep(
      2,
      'info',
      'Mengklik tombol "Pilih jenis pelaku usaha" dan memilih "Orang Perseorangan"...',
    );
    await page
      .getByRole('textbox', { name: 'Pilih jenis pelaku usaha' })
      .click();
    await page.getByText('Orang Perseorangan').click();

    // 2. Fill NIK
    await page.waitForTimeout(1000);
    context.logStep(2, 'info', `Mengisi NIK Pemilik: ${draft.nik}...`);
    await page
      .getByRole('textbox', { name: 'Masukkan 16 digit NIK sesuai' })
      .click();
    await page
      .getByRole('textbox', { name: 'Masukkan 16 digit NIK sesuai' })
      .fill(draft.nik);

    // Wait dynamically for NIK and Email verification status in parallel
    context.logStep(2, 'info', `Mengisi Email Pemilik: ${draft.email}...`);
    await page.getByRole('textbox', { name: 'Contoh: nama@email.com' }).click();
    await page
      .getByRole('textbox', { name: 'Contoh: nama@email.com' })
      .fill(draft.email);

    let isNikRegistered = false;
    let isEmailRegistered = false;
    const maxPollMs = 15000;
    const pollIntervalMs = 500;
    const startPollTime = Date.now();

    while (Date.now() - startPollTime < maxPollMs) {
      isNikRegistered = await page.getByText('NIK sudah terdaftar').isVisible();
      isEmailRegistered = await page
        .getByText('Email sudah terdaftar')
        .isVisible();

      if (isNikRegistered || isEmailRegistered) {
        break;
      }

      const isVerifikasiEnabled = await page
        .getByRole('button', { name: 'Verifikasi' })
        .isEnabled()
        .catch(() => false);
      if (isVerifikasiEnabled && Date.now() - startPollTime > 1500) {
        context.logStep(2, 'success', 'Validasi NIK dan Email sukses.');
        break;
      }

      await page.waitForTimeout(pollIntervalMs);
    }

    if (isNikRegistered) {
      context.logStep(
        2,
        'error',
        'Pendaftaran GAGAL: NIK sudah terdaftar di portal OSS. Silakan masuk menggunakan akun terdaftar Anda.',
      );
      throw new Error('NIK sudah terdaftar di portal OSS.');
    }

    if (isEmailRegistered) {
      context.logStep(
        2,
        'error',
        'Pendaftaran GAGAL: Email sudah terdaftar di portal OSS. Silakan gunakan email lain atau masuk dengan email terdaftar.',
      );
      throw new Error('Email sudah terdaftar di portal OSS.');
    }

    // 4. Click Verifikasi
    context.logStep(2, 'info', 'Mengklik tombol "Verifikasi"...');
    await page.getByRole('button', { name: 'Verifikasi' }).click();

    // 5. Prompt OTP
    await page.waitForTimeout(5000);
    context.logStep(
      2,
      'warn',
      'PENTING: Silakan buka email Anda, salin kode OTP, dan masukkan kode OTP di halaman aplikasi.',
    );

    // 6. Asynchronous Wait for OTP submitted from Frontend!
    const otpCode = await context.waitForOtp().catch(() => '');

    if (!otpCode || otpCode.length !== 6) {
      context.logStep(
        2,
        'error',
        `Pendaftaran GAGAL: OTP tidak valid atau batas waktu habis. Diterima: '${otpCode}', tipe: ${typeof otpCode}, panjang: ${otpCode?.length}. Silakan coba lagi.`,
      );
      throw new Error(
        'Batas waktu pengisian OTP telah habis atau OTP tidak valid.',
      );
    }

    context.logStep(
      2,
      'success',
      `OTP diterima: ${otpCode}. Memverifikasi kode OTP... [SUKSES]`,
    );

    // 7. Fill OTP
    await page
      .locator('.otp-input2')
      .first()
      .fill(otpCode[0] || '');
    await page.locator('div:nth-child(2) > .otp-input2').fill(otpCode[1] || '');
    await page.locator('div:nth-child(3) > .otp-input2').fill(otpCode[2] || '');
    await page.locator('div:nth-child(4) > .otp-input2').fill(otpCode[3] || '');
    await page.locator('div:nth-child(5) > .otp-input2').fill(otpCode[4] || '');
    await page.locator('div:nth-child(6) > .otp-input2').fill(otpCode[5] || '');

    const isOtpErrorVisible = await page
      .getByText(/salah|tidak valid|expired|tidak berlaku|otp/i)
      .isVisible()
      .catch(() => false);
    if (isOtpErrorVisible) {
      const errorMsg = await page
        .getByText(/salah|tidak valid|expired|tidak berlaku|otp/i)
        .textContent()
        .catch(() => 'Kode OTP tidak valid.');
      context.logStep(
        2,
        'error',
        `Pendaftaran GAGAL: Verifikasi OTP gagal di portal OSS: ${errorMsg}`,
      );
      throw new Error(`Verifikasi OTP gagal: ${errorMsg}`);
    }

    await this.interactionHelper.logSessionState(
      page,
      txId,
      'After OTP Verification',
    );

    // 8. Setting up password
    await page.waitForTimeout(5000);

    try {
      await page.waitForSelector('input[type="password"]', { timeout: 30000 });
    } catch (e) {
      context.logStep(
        2,
        'error',
        'Pendaftaran GAGAL: Form pembuatan kata sandi tidak ditemukan atau verifikasi OTP gagal.',
      );
      throw new Error('Form pembuatan kata sandi tidak ditemukan.');
    }

    // Wait for password submitted from Frontend!
    let passwordCode = '';
    if (this.cachedPasswords.has(txId)) {
      passwordCode = this.cachedPasswords.get(txId)!;
    } else {
      context.logStep(
        2,
        'warn',
        'PENTING: Silakan masukkan kata sandi baru Anda di halaman aplikasi.',
      );
      passwordCode = await context.waitForPassword().catch(() => '');
      if (passwordCode) {
        this.cachedPasswords.set(txId, passwordCode);
      }
    }

    if (!passwordCode) {
      context.logStep(
        2,
        'error',
        'Pendaftaran GAGAL: Batas waktu pengisian kata sandi telah habis (90 detik).',
      );
      throw new Error('Batas waktu pengisian kata sandi telah habis.');
    }

    // Fill both password inputs (Kata Sandi & Konfirmasi Kata Sandi)
    context.logStep(
      2,
      'info',
      'Mengisi kata sandi baru dan konfirmasi kata sandi...',
    );
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill(passwordCode);
    await page.waitForTimeout(1000);
    await passwordInputs.nth(1).fill(passwordCode);
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Lanjut' }).click();

    // Wait to verify if the password page submitted successfully
    await page.waitForTimeout(3000);
    const isPasswordStillVisible = await passwordInputs
      .first()
      .isVisible()
      .catch(() => false);
    if (isPasswordStillVisible) {
      const isMismatchVisible = await page
        .getByText(/tidak sama|tidak sesuai|tidak cocok|konfirmasi/i)
        .isVisible()
        .catch(() => false);
      if (isMismatchVisible) {
        const mismatchText = await page
          .getByText(/tidak sama|tidak sesuai|tidak cocok|konfirmasi/i)
          .textContent()
          .catch(() => 'Konfirmasi kata sandi tidak cocok.');
        context.logStep(
          2,
          'error',
          `Pendaftaran GAGAL: Konfirmasi kata sandi tidak cocok atau ditolak: ${mismatchText.trim()}`,
        );
        throw new Error(
          `Konfirmasi kata sandi tidak cocok: ${mismatchText.trim()}`,
        );
      }

      const requirements = [
        { key: 'Minimal 8 karakter', text: 'Minimal 8 karakter' },
        { key: 'Menggunakan huruf', text: 'Menggunakan huruf' },
        { key: 'Menggunakan angka', text: 'Menggunakan angka' },
        {
          key: 'Menggunakan karakter spesial',
          text: 'Menggunakan karakter spesial (!@#$%^&*_-)',
        },
      ];
      const failedReqs: string[] = [];

      for (const req of requirements) {
        const textLocator = page.locator(`text="${req.key}"`).first();
        if (await textLocator.isVisible().catch(() => false)) {
          const parent = textLocator.locator('xpath=..');
          let html = await parent.innerHTML().catch(() => '');
          const grandparent = parent.locator('xpath=..');
          const gHtml = await grandparent.innerHTML().catch(() => '');
          html += ' ' + gHtml;

          const hasRed =
            html.includes('red') ||
            html.includes('danger') ||
            html.includes('error') ||
            html.includes('cross') ||
            html.includes('close');
          const hasGreen =
            html.includes('green') ||
            html.includes('success') ||
            html.includes('check');

          if (hasRed || !hasGreen) {
            failedReqs.push(req.text);
          }
        }
      }

      if (failedReqs.length > 0) {
        const listStr = failedReqs.map((r) => `❌ ${r}`).join(', ');
        context.logStep(
          2,
          'error',
          `Pendaftaran GAGAL: Kekuatan kata sandi belum terpenuhi. Kriteria yang gagal: ${listStr}`,
        );
        throw new Error(`Kekuatan kata sandi belum terpenuhi: ${listStr}`);
      }

      context.logStep(
        2,
        'error',
        'Pendaftaran GAGAL: Pembuatan kata sandi ditolak oleh portal OSS (kemungkinan konfirmasi kata sandi tidak cocok).',
      );
      throw new Error(
        'Pembuatan kata sandi ditolak atau konfirmasi tidak cocok.',
      );
    }

    await this.interactionHelper.logSessionState(
      page,
      txId,
      'After Password Creation',
    );

    return passwordCode;
  }

  public async executeDetailProfileSteps(
    context: AutomationSessionContext,
  ): Promise<void> {
    const { page, draft } = context;
    context.logStep(3, 'info', 'Mengisi detail pelaku usaha...');

    // Trim leading 0, 62 or +62 from the phone number
    let cleanPhone = draft.nomorHp.trim().replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('62')) {
      cleanPhone = cleanPhone.substring(2);
    } else if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }
    context.logStep(3, 'info', `Mengisi nomor ponsel: ${draft.nomorHp}...`);
    await page.getByRole('textbox', { name: '81x-xxxx-xxxxx' }).click();
    await page
      .getByRole('textbox', { name: '81x-xxxx-xxxxx' })
      .fill(cleanPhone);

    context.logStep(
      3,
      'info',
      `Mengisi nama pelaku usaha sesuai KTP: ${draft.namaPemilik}...`,
    );
    await page
      .getByRole('textbox', { name: 'Masukkan nama sesuai KTP' })
      .click();
    await page
      .getByRole('textbox', { name: 'Masukkan nama sesuai KTP' })
      .fill(draft.namaPemilik);

    context.logStep(
      3,
      'info',
      `Memilih jenis kelamin: ${draft.jenisKelamin}...`,
    );
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
    context.logStep(
      3,
      'info',
      `Mengisi tanggal lahir: ${formattedBirthDate}...`,
    );
    await page.getByRole('textbox', { name: 'dd/mm/yyyy' }).click();
    await page
      .getByRole('textbox', { name: 'dd/mm/yyyy' })
      .fill(formattedBirthDate);

    // Fill alamat
    await page.getByRole('textbox', { name: 'Contoh: Jl. RUSA' }).click();
    await page
      .getByRole('textbox', { name: 'Contoh: Jl. RUSA' })
      .fill(draft.alamatKtp || draft.alamatUsaha);

    // Search and Select Provinsi
    const cleanProvinsi = (draft.provinsiKtp || draft.provinsi).trim();
    const searchProvinsi =
      this.interactionHelper.getOptimalSearchQuery(cleanProvinsi);
    context.logStep(3, 'info', `Mencari provinsi KTP: ${cleanProvinsi}...`);

    const provPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/provinsi') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 3000 },
      )
      .catch(() => null);
    await this.interactionHelper.clickAndFillInputResilient(
      page,
      'Pilih provinsi',
      searchProvinsi,
      context,
    );
    await provPromise;
    await page.waitForTimeout(200);
    await this.interactionHelper.selectOptionRobust(
      page,
      cleanProvinsi,
      context,
    );
    await page.waitForTimeout(200);

    // Trim "Kota" / "Kabupaten" and search using partial "like" match
    const rawKota = draft.kotaKabupatenKtp || draft.kotaKabupaten;
    const cleanKota = rawKota.replace(/kota|kabupaten/gi, '').trim();
    const searchKota = this.interactionHelper.getOptimalSearchQuery(cleanKota);
    context.logStep(3, 'info', `Mencari kabupaten/kota KTP: ${rawKota}...`);

    const kotaPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/kota') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 3000 },
      )
      .catch(() => null);
    await this.interactionHelper.clickAndFillInputResilient(
      page,
      'Pilih kabupaten/kota',
      searchKota,
      context,
    );
    await kotaPromise;
    await page.waitForTimeout(200);
    await this.interactionHelper.selectOptionRobust(page, cleanKota, context);
    await page.waitForTimeout(200);

    // Search and Select Kecamatan
    const cleanKecamatan = (draft.kecamatanKtp || draft.kecamatan).trim();
    const searchKecamatan =
      this.interactionHelper.getOptimalSearchQuery(cleanKecamatan);
    context.logStep(3, 'info', `Mencari kecamatan KTP: ${cleanKecamatan}...`);

    const kecPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/kecamatan') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 3000 },
      )
      .catch(() => null);
    await this.interactionHelper.clickAndFillInputResilient(
      page,
      'Pilih kecamatan',
      searchKecamatan,
      context,
    );
    await kecPromise;
    await page.waitForTimeout(200);
    await this.interactionHelper.selectOptionRobust(
      page,
      cleanKecamatan,
      context,
    );
    await page.waitForTimeout(200);

    // Search and Select Desa / Kelurahan
    const cleanKelurahan = (draft.kelurahanKtp || draft.kelurahan).trim();
    const searchKelurahan =
      this.interactionHelper.getOptimalSearchQuery(cleanKelurahan);
    context.logStep(
      3,
      'info',
      `Mencari desa/kelurahan KTP: ${cleanKelurahan}...`,
    );

    const kelPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/kelurahan') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 3000 },
      )
      .catch(() => null);
    await this.interactionHelper.clickAndFillInputResilient(
      page,
      'Pilih desa/kelurahan',
      searchKelurahan,
      context,
    );
    await kelPromise;
    await page.waitForTimeout(200);
    await this.interactionHelper.selectOptionRobust(
      page,
      cleanKelurahan,
      context,
    );
    await page.waitForTimeout(200);

    context.logStep(
      3,
      'success',
      'Semua data detail pelaku usaha dan lokasi berhasil diisi.',
    );

    // 10. Mencentang checkbox persetujuan
    context.logStep(3, 'info', 'Mencentang checkbox persetujuan...');
    try {
      await page
        .getByRole('checkbox', { name: 'Saya setuju dengan Syarat dan' })
        .click({ force: true });
    } catch (e) {
      await page
        .getByText('Saya setuju dengan Syarat dan Ketentuan')
        .first()
        .click({ force: true });
    }

    // 11. Mengklik tombol "Daftar" untuk memproses pendaftaran akun
    const maxRetries = 3;
    let isDukcapilError = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      context.logStep(
        3,
        'info',
        `Mengklik tombol "Daftar" untuk memproses pendaftaran akun (Percobaan ${attempt}/${maxRetries})...`,
      );
      await page.getByRole('button', { name: 'Daftar' }).click();

      // Wait 3 seconds to check for Dukcapil connection error
      await page.waitForTimeout(3000);

      isDukcapilError = await page
        .getByText('Gagal tersambung ke sistem dukcapil')
        .first()
        .isVisible()
        .catch(() => false);
      if (isDukcapilError) {
        context.logStep(
          3,
          'warn',
          `Terjadi kesalahan: Gagal tersambung ke sistem dukcapil. Menunggu 3 detik sebelum mencoba lagi...`,
        );
        if (attempt < maxRetries) {
          await page.waitForTimeout(3000);
        }
      } else {
        break;
      }
    }

    if (isDukcapilError) {
      context.logStep(
        3,
        'error',
        'Pendaftaran GAGAL: Gagal tersambung ke sistem dukcapil Kementerian Dalam Negeri setelah 3 kali percobaan. Silakan coba beberapa saat lagi.',
      );
      throw new Error('Gagal tersambung ke sistem dukcapil');
    }

    // Wait for Dukcapil NIK/Name match checking API
    context.logStep(
      3,
      'info',
      'Menunggu verifikasi NIK dan Nama Pemilik dengan Dukcapil...',
    );
    await page.waitForTimeout(1000);

    let isKtpMismatch = false;
    try {
      const count = await page.getByText('Data tidak sesuai KTP').count();
      if (count > 0) {
        isKtpMismatch = await page
          .getByText('Data tidak sesuai KTP')
          .first()
          .isVisible()
          .catch(() => false);
      }
    } catch (e) {
      isKtpMismatch = false;
    }

    if (isKtpMismatch) {
      context.logStep(
        3,
        'error',
        'Pendaftaran GAGAL: Data nama pelaku usaha atau NIK tidak sesuai KTP Dukcapil. Silakan periksa kembali ketikan Anda.',
      );
      throw new Error('Data tidak sesuai KTP');
    }

    context.logStep(
      3,
      'success',
      'Selamat! Registrasi akun OSS Pelaku Usaha telah BERHASIL diselesaikan.',
    );

    await this.interactionHelper.logSessionState(
      page,
      draft.nik,
      'After Detail Profile Submission',
    );

    // Keep open for a bit
    await page.waitForTimeout(10000);
  }
}
