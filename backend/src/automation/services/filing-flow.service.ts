import { Injectable, Logger } from '@nestjs/common';
import { DraftsService } from '../../drafts/drafts.service';
import { DocumentsService } from '../../documents/documents.service';
import { PortalInteractionHelper } from './portal-interaction.helper';
import { AutomationSessionContext } from '../context/automation-session.context';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FilingFlowService {
  private readonly logger = new Logger(FilingFlowService.name);
  private readonly cachedPasswords = new Map<string, string>();
  private readonly redirectionUrls = new Map<string, string>();
  private readonly kdIzins = new Map<string, string>();

  constructor(
    private readonly interactionHelper: PortalInteractionHelper,
    private readonly draftsService: DraftsService,
    private readonly documentsService: DocumentsService,
  ) {}

  public getRedirectionUrl(draftId: string): string | undefined {
    return this.redirectionUrls.get(draftId);
  }

  public getKdIzin(draftId: string): string | undefined {
    return this.kdIzins.get(draftId);
  }

  public clearDraftData(draftId: string) {
    this.redirectionUrls.delete(draftId);
    this.kdIzins.delete(draftId);
  }

  public async executeLoginSteps(
    context: AutomationSessionContext,
    passwordCode: string,
  ): Promise<string> {
    const { page, draft, txId } = context;
    context.logStep(
      4,
      'info',
      'Menjalankan otomatisasi login ke portal OSS...',
    );

    try {
      await page.goto(`${process.env.OSS_LOGIN_URL}`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
    } catch (e) {
      context.logStep(
        4,
        'warn',
        'Koneksi ke halaman login OSS lambat. Melanjutkan...',
      );
    }

    context.logStep(
      4,
      'info',
      'Mencari kolom input login (Username & Password)...',
    );

    const usernameSelector =
      'input[name="username"], input[type="text"], input[placeholder*="Username"], input[placeholder*="Email"], #username';
    const passwordSelector =
      'input[name="password"], input[type="password"], input[placeholder*="Sandi"], input[placeholder*="Password"], #password';

    try {
      await page.waitForSelector(usernameSelector, { timeout: 15000 });
    } catch (e) {
      context.logStep(
        4,
        'error',
        'Halaman login tidak dapat dimuat atau input username tidak ditemukan.',
      );
      throw new Error('Halaman login tidak dapat dimuat.');
    }

    let loginSuccess = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!loginSuccess && attempts < maxAttempts) {
      attempts++;

      // If passwordCode is empty (e.g. direct login without registration), wait for it from frontend
      let finalPassword = passwordCode;
      if (!finalPassword) {
        if (this.cachedPasswords.has(txId)) {
          finalPassword = this.cachedPasswords.get(txId)!;
        } else {
          context.logStep(
            4,
            'warn',
            'PENTING: Silakan masukkan kata sandi akun OSS Anda di halaman aplikasi.',
          );
          finalPassword = await context.waitForPassword().catch((err) => {
            this.logger.error(`waitForPassword rejected with error:`, err);
            return '';
          });
          if (finalPassword) {
            this.cachedPasswords.set(txId, finalPassword);
          }
        }
      }

      if (!finalPassword) {
        context.logStep(
          4,
          'error',
          `Batas waktu pengisian kata sandi telah habis atau kata sandi tidak valid. Diterima: '${finalPassword}', tipe: ${typeof finalPassword}. Silakan coba lagi.`,
        );
        throw new Error(
          'Batas waktu pengisian kata sandi telah habis atau tidak valid.',
        );
      }

      context.logStep(
        4,
        'info',
        `Mengisi Username dengan Email: ${draft.email}...`,
      );
      await page.fill(usernameSelector, draft.email);
      await page.waitForTimeout(500);

      context.logStep(4, 'info', 'Mengisi kata sandi...');
      await page.fill(passwordSelector, finalPassword);
      await page.waitForTimeout(1000);

      let isRedirected = false;

      context.logStep(4, 'info', 'Mengklik tombol "Masuk"...');
      const loginButtonSelector =
        'button[type="button"], button[type="submit"]';
      await page.click(loginButtonSelector);

      // Wait for redirection
      context.logStep(
        4,
        'info',
        'Menunggu pengalihan (redirection) setelah masuk...',
      );
      const startTime = Date.now();
      let localErrorMsg = '';

      while (Date.now() - startTime < 30000) {
        const currentUrl = page.url();
        if (
          currentUrl &&
          !currentUrl.includes('/login') &&
          !currentUrl.includes('ui-login.oss.go.id') &&
          !currentUrl.includes('ui-login-stg.oss.go.id')
        ) {
          isRedirected = true;
          break;
        }

        // Quick check for visible validation errors to abort immediately
        const errorLocator = page
          .getByText(/tidak sesuai|salah|tidak valid|expired|tidak terdaftar/i)
          .first();
        const isErrorVisible = await errorLocator
          .isVisible()
          .catch(() => false);
        if (isErrorVisible) {
          localErrorMsg = await errorLocator
            .textContent()
            .catch(() => 'Username atau Kata Sandi salah.');
          break;
        }

        await page.waitForTimeout(1000);
      }

      if (localErrorMsg) {
        context.logStep(
          4,
          'error',
          `Login GAGAL di portal OSS: ${localErrorMsg.trim()}`,
        );
        passwordCode = '';
        this.cachedPasswords.delete(txId);
        context.logStep(
          4,
          'warn',
          'Mencoba kembali dengan meminta kata sandi ulang...',
        );
        await page.waitForTimeout(2000);
        continue; // Restart the retry loop
      }

      if (!isRedirected) {
        // Fallback post-loop check for validation error messages
        const errorLocator = page
          .getByText(/tidak sesuai|salah|tidak valid|expired|tidak terdaftar/i)
          .first();
        const isLoginErrorVisible = await errorLocator
          .isVisible()
          .catch(() => false);
        if (isLoginErrorVisible) {
          const errorMsg = await errorLocator
            .textContent()
            .catch(() => 'Username atau Kata Sandi salah.');
          context.logStep(
            4,
            'error',
            `Login GAGAL di portal OSS: ${errorMsg.trim()}`,
          );
          passwordCode = '';
          this.cachedPasswords.delete(txId);
          context.logStep(
            4,
            'warn',
            'Mencoba kembali dengan meminta kata sandi ulang...',
          );
          await page.waitForTimeout(2000);
          continue; // Restart the retry loop
        }

        context.logStep(
          4,
          'error',
          'Login GAGAL: Tidak ada pengalihan setelah tombol masuk diklik.',
        );
        throw new Error('Login ditolak.');
      }

      if (isRedirected) {
        loginSuccess = true;
      }
    }

    if (!loginSuccess) {
      throw new Error(
        'Gagal login setelah batas maksimal percobaan. Silakan periksa kembali akun Anda.',
      );
    }

    context.logStep(
      4,
      'success',
      'Login berhasil! Sesi terautentikasi berhasil didirikan.',
    );

    await this.interactionHelper.logSessionState(
      page,
      txId,
      'After Successful Login',
    );

    context.logStep(
      4,
      'info',
      'Menunggu pemuatan data dashboard perizinan (network idle)...',
    );
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch (e) {
      // Ignore timeout if dashboard remains active
    }
    await page.waitForTimeout(5000);

    // Wait for the loading spinner to disappear, reload if stuck
    const spinnerSelector =
      '.v-progress-circular, .v-loading, [role="progressbar"], .loading-spinner';
    try {
      const loader = page.locator(spinnerSelector).first();
      if (await loader.isVisible()) {
        context.logStep(4, 'info', 'Menunggu loading spinner menghilang...');
        await loader.waitFor({ state: 'detached', timeout: 10000 });
      }
    } catch (err) {
      context.logStep(
        4,
        'warn',
        'Halaman dashboard terhambat loading spinner. Mencoba memuat ulang (reload)...',
      );
      await page.reload({ waitUntil: 'networkidle' }).catch(() => null);
      await page.waitForTimeout(5000);
    }

    const currentUrl = page.url();
    let jwtToken = context.jwtToken || '';
    if (jwtToken) {
      this.logger.log(
        `[Tx: automation-${txId}] Using captured token from navigation history.`,
      );
    } else if (currentUrl) {
      try {
        const urlObj = new URL(currentUrl);
        jwtToken = urlObj.searchParams.get('auth-code') || '';

        if (!jwtToken && urlObj.hash) {
          const hashQuery = urlObj.hash.substring(urlObj.hash.indexOf('?'));
          const hashParams = new URLSearchParams(hashQuery);
          jwtToken = hashParams.get('auth-code') || '';
        }

        if (!jwtToken) {
          const match = currentUrl.match(/auth-code=([^&]+)/);
          if (match) {
            jwtToken = match[1];
          }
        }
      } catch (err) {
        // Safe fallback
      }
    }

    context.logStep(
      5,
      'success',
      'Proses login selesai! Akun telah berhasil login ke portal OSS.',
    );
    return jwtToken;
  }

  public async executeManageLocationSteps(
    context: AutomationSessionContext,
    jwtAccessToken: string,
  ) {
    const { page, draft } = context;
    context.logStep(5, 'info', 'Memulai pengelolaan lokasi usaha (Step 5)...');

    // Wait for the loading spinner to disappear, reload if stuck
    const spinnerSelector =
      '.v-progress-circular, .v-loading, [role="progressbar"], .loading-spinner';
    try {
      const loader = page.locator(spinnerSelector).first();
      await loader
        .waitFor({ state: 'visible', timeout: 3000 })
        .catch(() => null);
      if (await loader.isVisible()) {
        context.logStep(5, 'info', 'Menunggu loading spinner menghilang...');
        await loader.waitFor({ state: 'detached', timeout: 15000 });
      }
    } catch (err) {
      context.logStep(
        5,
        'warn',
        'Halaman dashboard terhambat loading spinner. Mencoba memuat ulang (reload)...',
      );
      await page.reload({ waitUntil: 'load' }).catch(() => null);
      await page.waitForTimeout(5000);
      try {
        const loader = page.locator(spinnerSelector).first();
        await loader
          .waitFor({ state: 'visible', timeout: 2000 })
          .catch(() => null);
        if (await loader.isVisible()) {
          await loader
            .waitFor({ state: 'detached', timeout: 15000 })
            .catch(() => null);
        }
      } catch (e) {}
    }

    // pilih menu kelola lokasi usaha
    try {
      await page
        .getByTestId('top-menus')
        .locator('div')
        .filter({ hasText: 'Perizinan Berusaha' })
        .click({ timeout: 5000 });
    } catch (err) {
      context.logStep(
        5,
        'info',
        'Menemukan menu "Perizinan Berusaha" menggunakan selector alternatif...',
      );
      await page.locator('text=Perizinan Berusaha').first().click();
    }

    try {
      await page
        .getByTestId('desktop-dropdown-panel')
        .getByText('Kelola Usaha')
        .click({ timeout: 5000 });
    } catch (err) {
      await page.locator('text=Kelola Usaha').first().click();
    }

    try {
      await page
        .getByTestId('category-right-panel')
        .getByText('Lokasi Usaha')
        .first()
        .click({ timeout: 5000 });
    } catch (err) {
      await page.locator('text=Lokasi Usaha').first().click();
    }

    // wait for redirected page loaded
    await page
      .waitForURL(/.*\/(lokasi-usaha|kelola-usaha).*/, {
        waitUntil: 'load',
        timeout: 15000,
      })
      .catch(() => null);

    // check if there's any popup message, close by clicking "Mengerti"
    await this.interactionHelper.dismissPopupIfVisible(page, context, 5);

    const cardSelector = '.lokasi-usaha-card';
    const cardLocator = page.locator(cardSelector);
    if (
      await cardLocator
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      context.logStep(
        5,
        'info',
        'Lokasi usaha sudah terdaftar dari sesi sebelumnya. Memilih lokasi yang ada...',
      );
      await cardLocator.first().getByRole('checkbox').click();
      await page
        .getByRole('button', { name: 'Lengkapi Detail Kegiatan' })
        .click();
      context.logStep(
        5,
        'success',
        '✨ [Selesai] Pengelolaan Lokasi Usaha berhasil diselesaikan.',
      );
      return;
    }

    await page.getByRole('button', { name: 'Tambah Lokasi' }).click();
    await page
      .waitForURL(/.*\/(lokasi-usaha|kelola-usaha)\/tambah-lokasi.*/, {
        waitUntil: 'load',
        timeout: 15000,
      })
      .catch(() => null);

    await page.getByRole('button', { name: 'Tambah Posisi Lokasi' }).click();
    const daratRadio = page.getByRole('radio', { name: 'Darat' });
    await daratRadio.waitFor({ state: 'visible', timeout: 10000 });

    // wait for matra api
    await page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/options/matra') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 3000 },
      )
      .catch(() => null);

    // Choose location type
    await page.getByRole('radio', { name: 'Darat' }).check();
    await page.getByRole('radio', { name: 'Individual' }).check();
    await page
      .getByRole('checkbox', { name: 'Permohonan persyaratan dasar' })
      .check();

    // fill coordinate
    const lat = draft.latitude;
    const lon = draft.longitude;
    const coordinate = `${lat}, ${lon}`;
    context.logStep(
      5,
      'info',
      `Mengisi koordinat usaha dari draft: ${coordinate}...`,
    );
    await page
      .getByRole('combobox', { name: 'Cari alamat...' })
      .fill(coordinate);

    // get display name
    await page
      .waitForResponse(
        (response: any) =>
          response.url().includes('nominatim.openstreetmap.org/search') &&
          response.status() === 200 &&
          response.body().includes(lat) &&
          response.body().includes(lon),
        { timeout: 5000 },
      )
      .catch(() => null);

    // select first suggestion
    await page
      .getByRole('listbox')
      .getByRole('option')
      .locator('div')
      .first()
      .click();

    // Fill Luas Lahan and Alamat Lengkap
    context.logStep(
      5,
      'info',
      `Mengisi Luas Lahan: ${draft.luasTanah || '150'} m²...`,
    );
    await page.getByRole('textbox', { name: 'Luas Lahan' }).click();
    await page
      .getByRole('textbox', { name: 'Luas Lahan' })
      .fill(draft.luasTanah || '150');

    context.logStep(
      5,
      'info',
      `Mengisi Alamat Lengkap Usaha: ${draft.alamatUsaha}...`,
    );
    await page.getByRole('textbox', { name: 'Alamat lengkap' }).click();
    await page
      .getByRole('textbox', { name: 'Alamat lengkap' })
      .fill(draft.alamatUsaha);

    // Select Provinsi
    const cleanProvinsi = (draft.provinsi || draft.provinsiKtp).trim();
    const searchProvinsi =
      this.interactionHelper.getOptimalSearchQuery(cleanProvinsi);
    context.logStep(5, 'info', `Mencari provinsi usaha: ${cleanProvinsi}...`);

    const provPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/provinsi') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 5000 },
      )
      .catch(() => null);
    const provinsiSelect = page.getByRole('combobox', {
      name: 'Pilih provinsi',
    });
    await provinsiSelect.click();
    await provinsiSelect.fill(searchProvinsi);
    await provPromise;
    await page.waitForTimeout(200);
    await this.interactionHelper.selectOptionRobust(
      page,
      cleanProvinsi,
      context,
    );
    await page.waitForTimeout(200);

    // Select Kota/Kabupaten (combobox index 1)
    const rawKota = draft.kotaKabupaten || draft.kotaKabupatenKtp;
    const cleanKota = rawKota.replace(/kota|kabupaten/gi, '').trim();
    const searchKota = this.interactionHelper.getOptimalSearchQuery(cleanKota);
    context.logStep(5, 'info', `Mencari kabupaten/kota usaha: ${rawKota}...`);

    const kotaPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/kota') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 5000 },
      )
      .catch(() => null);
    await page.getByPlaceholder('Kabupaten').locator('input').fill(searchKota);
    await page.waitForTimeout(200);
    await this.interactionHelper.selectOptionRobust(page, cleanKota, context);
    await page.waitForTimeout(200);

    // Select Kecamatan (combobox index 2)
    const cleanKecamatan = (draft.kecamatan || draft.kecamatanKtp).trim();
    const searchKecamatan =
      this.interactionHelper.getOptimalSearchQuery(cleanKecamatan);
    context.logStep(5, 'info', `Mencari kecamatan usaha: ${cleanKecamatan}...`);

    const kecPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/kecamatan') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 5000 },
      )
      .catch(() => null);

    await page
      .getByPlaceholder('Kecamatan')
      .locator('input')
      .fill(searchKecamatan);
    await page.waitForTimeout(200);
    await this.interactionHelper.selectOptionRobust(
      page,
      cleanKecamatan,
      context,
    );
    await page.waitForTimeout(200);

    // Select Desa / Kelurahan (combobox index 3)
    const cleanKelurahan = (draft.kelurahan || draft.kelurahanKtp).trim();
    const searchKelurahan =
      this.interactionHelper.getOptimalSearchQuery(cleanKelurahan);
    context.logStep(
      5,
      'info',
      `Mencari desa/kelurahan usaha: ${cleanKelurahan}...`,
    );

    const kelPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/kelurahan') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 5000 },
      )
      .catch(() => null);

    await page
      .getByPlaceholder('Kelurahan')
      .locator('input')
      .fill(searchKelurahan);
    await page.waitForTimeout(200);
    await this.interactionHelper.selectOptionRobust(
      page,
      cleanKelurahan,
      context,
    );
    await page.waitForTimeout(200);

    // input kode pos
    await page
      .getByRole('textbox', { name: 'Kode Pos' })
      .fill(draft.kodePos || draft.kodePosKtp || '');

    // Dynamic Document PDF Generation & Upload
    context.logStep(
      5,
      'info',
      'Menyiapkan dokumen administrasi PDF secara dinamis...',
    );
    const draftId = draft.id || 'draft';
    const npsPath = path.join(process.cwd(), `nps_${draftId}.pdf`);
    const photoPath = path.join(process.cwd(), `foto_lokasi_${draftId}.pdf`);
    let createdNps = false;
    let createdPhoto = false;

    try {
      // 1. Generate NPS PDF
      const npsBuffer = await this.documentsService.generateAdministrationPdf({
        alamatUsaha: draft.alamatUsaha || '',
        latitude: draft.latitude || '',
        longitude: draft.longitude || '',
        luasTanah: draft.luasTanah || '',
      });
      fs.writeFileSync(npsPath, npsBuffer);
      createdNps = true;

      // 2. Generate Photo PDF or fallback
      if (draft.fotoLokasi) {
        try {
          const photoBuffer = await this.documentsService.convertPhotoToPdf(
            draft.fotoLokasi,
          );
          fs.writeFileSync(photoPath, photoBuffer);
          createdPhoto = true;
          context.logStep(
            5,
            'info',
            'Dokumen Foto Lokasi PDF berhasil dibuat.',
          );
        } catch (photoErr) {
          this.logger.warn(
            'Gagal mengubah foto lokasi ke PDF, menggunakan fallback: ',
            photoErr,
          );
          fs.writeFileSync(photoPath, npsBuffer);
          createdPhoto = true;
          context.logStep(
            5,
            'info',
            'Konversi Foto Lokasi gagal, menggunakan fallback dokumen administrasi.',
          );
        }
      } else {
        // Fallback: Copy NPS PDF to photo path
        fs.writeFileSync(photoPath, npsBuffer);
        createdPhoto = true;
        context.logStep(
          5,
          'info',
          'Foto Lokasi tidak ada, menggunakan fallback dokumen administrasi.',
        );
      }

      const fileInputs = page.locator('input[type="file"]');
      const inputCount = await fileInputs.count();
      console.log(`[DEBUG] Found ${inputCount} file inputs on the form.`);
      for (let i = 0; i < inputCount; i++) {
        const accept = await fileInputs.nth(i).getAttribute('accept');
        const outerHTML = await fileInputs
          .nth(i)
          .evaluate((el: any) => el.outerHTML);
        console.log(
          `[DEBUG] File Input ${i}: accept="${accept}", outerHTML="${outerHTML}"`,
        );
      }

      if (inputCount < 2) {
        throw new Error('Jumlah input upload file kurang dari 2.');
      }

      // Setup promises to wait for upload network responses
      const upload1Promise = page
        .waitForResponse(
          (response: any) =>
            response.url().includes('/file/upload') &&
            response.status() === 200,
          { timeout: 25000 },
        )
        .catch(() => null);

      context.logStep(5, 'info', 'Mengunggah Dokumen Administrasi Lokasi...');
      await fileInputs.nth(0).setInputFiles(npsPath);
      await upload1Promise;

      const upload2Promise = page
        .waitForResponse(
          (response: any) =>
            response.url().includes('/file/upload') &&
            response.status() === 200,
          { timeout: 25000 },
        )
        .catch(() => null);

      context.logStep(5, 'info', 'Mengunggah Foto Lokasi...');
      await fileInputs.nth(1).setInputFiles(photoPath);
      await upload2Promise;
      await page.waitForTimeout(5000);

      // Wait for any loading/progressbar indicator to detach
      context.logStep(5, 'info', 'Menunggu proses unggah selesai di portal...');
      await page
        .locator(
          '.v-progress-linear, .v-progress-circular, [role="progressbar"]',
        )
        .waitFor({ state: 'detached', timeout: 10000 })
        .catch(() => null);
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => null);

      context.logStep(5, 'success', 'Kedua berkas PDF berhasil diunggah.');
    } catch (pdfErr: any) {
      this.logger.error('Gagal memproses/mengunggah dokumen PDF:', pdfErr);
      context.logStep(
        5,
        'warn',
        `Peringatan: Gagal memproses berkas PDF otomatis (${pdfErr.message || pdfErr}). Melompati unggah otomatis.`,
      );
    }

    // Check Pertanyaan apakah proyek PSN 'Tidak' radio button if it exists
    const tidakRadio = page.getByRole('radio', { name: 'Tidak' });
    if (await tidakRadio.isVisible()) {
      await tidakRadio.check();
      await page.waitForTimeout(200);
    }

    // Save Position Location
    context.logStep(
      5,
      'info',
      'Mengklik tombol "Simpan Posisi Lokasi" untuk mendaftarkan lokasi...',
    );
    await page.getByRole('button', { name: 'Simpan Posisi Lokasi' }).click();
    await page
      .locator('.lokasi-usaha-card')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });

    // Cleanup temp files
    try {
      if (createdNps && fs.existsSync(npsPath)) {
        fs.unlinkSync(npsPath);
      }
      if (createdPhoto && fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    } catch (cleanupErr) {
      this.logger.warn('Gagal menghapus file PDF temporer:', cleanupErr);
    }

    // TODO mark this state to database, so that we can continue from here if further process is failed / interrupted

    // select newly created location
    await page
      .locator('.lokasi-usaha-card')
      .nth(0)
      .getByRole('checkbox')
      .click();
    await page
      .getByRole('button', { name: 'Lengkapi Detail Kegiatan' })
      .click();
  }

  public async executeManageBusinessDetailSteps(
    context: AutomationSessionContext,
  ) {
    const { page, draft } = context;
    const draftId = draft.id;
    context.logStep(6, 'info', 'Memulai pengelolaan detail usaha (Step 5)...');

    // Prevent the "Informasi Angka Pengenal Impor (API)" popup from showing up by patching the Pinia store state in the browser
    await this.patchPiniaStoreState(page);

    // check lokasi usaha questions, if exists, select 'Tidak'
    const obvitnasQuestion = page.getByRole('radiogroup', {
      name: 'Apakah lokasi usaha berada di wilayah Objek Vital Nasional (Obvitnas)?',
    });
    if (await obvitnasQuestion.isVisible()) {
      await obvitnasQuestion.getByLabel('Tidak').check();
      await page.waitForTimeout(500);
    }
    const psnQuestion = page.getByRole('radiogroup', {
      name: 'Apakah lokasi usaha berada di wilayah Proyek Strategis Nasional (PSN)?',
    });
    if (await psnQuestion.isVisible()) {
      await psnQuestion.getByLabel('Tidak').check();
      await page.waitForTimeout(500);
    }

    const getListKbliPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/getListKBLI') && response.status() === 200,
        { timeout: 25000 },
      )
      .catch(() => null);

    context.logStep(6, 'info', 'Memilih KBLI...');
    await page.getByRole('button', { name: 'Selanjutnya' }).click();
    await getListKbliPromise;

    // Wait for the loading spinner to disappear
    const spinnerSelector =
      '.v-progress-circular, .v-loading, [role="progressbar"], .loading-spinner';
    try {
      const loader = page.locator(spinnerSelector).first();
      await loader
        .waitFor({ state: 'visible', timeout: 3000 })
        .catch(() => null);
      if (await loader.isVisible()) {
        await loader
          .waitFor({ state: 'detached', timeout: 15000 })
          .catch(() => null);
      }
    } catch (e) {}

    // Ensure Pinia store remains patched
    await this.patchPiniaStoreState(page);

    await page
      .getByTestId('jenis-kegiatan-select')
      .locator('input')
      .waitFor({ state: 'visible', timeout: 15000 });

    // select jenis kegiatan usaha
    await page.getByTestId('jenis-kegiatan-select').locator('input').click();

    const option = page.getByText('Kegiatan Usaha Utama');
    await option.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    if (!(await option.isVisible())) {
      // Close and reopen dropdown if options didn't load (No data available)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      await page.getByTestId('jenis-kegiatan-select').locator('input').click();
      await option
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => null);
    }
    await option.click();
    await page.waitForTimeout(1500);

    // Dismiss warning popup if visible
    await this.interactionHelper.dismissPopupIfVisible(page, context, 6);
    // Dismiss any API warning popup
    await this.interactionHelper.dismissPopupIfVisible(page, context, 6);
    await page.waitForTimeout(1000);

    let modalProcessed = false;
    // check if KBLI 2025 Penyesuaian modal is open
    const modalAdjustKbli = page.getByTestId('button-modal-kembali-kbli-2025');
    if (await modalAdjustKbli.isVisible().catch(() => false)) {
      context.logStep(
        6,
        'info',
        'Penyesuaian KBLI 2025 modal terdeteksi. Menyelesaikan penyesuaian...',
      );

      // If KBLI select is visible and enabled (one-to-many case)
      const selectKbli = page.getByTestId('kbli-select').first();
      if (
        (await selectKbli.isVisible().catch(() => false)) &&
        (await selectKbli.isEnabled().catch(() => false))
      ) {
        await selectKbli.click();
        const searchKbliQuery = this.interactionHelper.getOptimalSearchQuery(
          draft.kbliCode,
        );
        await selectKbli.locator('input').fill(searchKbliQuery);
        const option = page
          .locator('.v-list-item, [role="option"]')
          .filter({ hasText: searchKbliQuery })
          .first();
        await option
          .waitFor({ state: 'visible', timeout: 5000 })
          .catch(() => null);
        if (await option.isVisible()) {
          await option.click();
        }
        await page.waitForTimeout(1000);
      }

      // Check if Ruang Lingkup select is visible and enabled
      const selectRuangLingkup = page.getByPlaceholder(
        'Pilih ruang lingkup kegiatan',
      );
      if (
        (await selectRuangLingkup.isVisible().catch(() => false)) &&
        (await selectRuangLingkup.isEnabled().catch(() => false))
      ) {
        await selectRuangLingkup.click();
        const option = page.locator('.v-list-item, [role="option"]').first();
        await option
          .waitFor({ state: 'visible', timeout: 5000 })
          .catch(() => null);
        if (await option.isVisible()) {
          await option.click();
        }
        await page.waitForTimeout(1000);
      }

      // Click the declaration checkbox inside the modal
      const modalCheckbox = page
        .locator('.v-overlay-container')
        .getByRole('checkbox')
        .first();
      if (await modalCheckbox.isVisible().catch(() => false)) {
        await modalCheckbox.click();
      } else {
        const declText = page
          .getByText('Dengan ini saya menyatakan bahwa data')
          .first();
        if (await declText.isVisible().catch(() => false)) {
          await declText.click().catch(() => null);
        }
      }
      await page.waitForTimeout(1000);

      // Click Simpan button
      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      await page.waitForTimeout(3000);
      modalProcessed = true;
    }

    if (!modalProcessed) {
      // choose kbli
      const searchKbli = this.interactionHelper.getOptimalSearchQuery(
        draft.kbliCode,
      );
      context.logStep(
        6,
        'info',
        `Mencari kegiatan usaha: ${draft.kbliCode}...`,
      );
      // Ensure Pinia store remains patched
      await this.patchPiniaStoreState(page);

      // Register response listener BEFORE typing to catch fast responses
      const getListKbli2025Promise = page
        .waitForResponse(
          (response: any) => {
            const matches =
              response.url().includes('/getListKBLI') &&
              response.status() === 200;
            if (!matches) return false;
            const postData = response.request().postData();
            return !!(postData && postData.includes('kbli_2020'));
          },
          { timeout: 20000 },
        )
        .catch(() => null);

      const kbliSearch = page.getByTestId('kbli-select').first();
      await kbliSearch.click();
      await page.waitForTimeout(1500);
      const kbliSearchInput = kbliSearch.locator('input');
      await kbliSearchInput.pressSequentially(searchKbli, { delay: 100 });
      await page.waitForTimeout(500);

      const optionLocator = page
        .locator('.v-list-item, [role="option"]')
        .filter({ hasText: searchKbli })
        .first();
      await optionLocator
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => null);
      if (await optionLocator.isVisible()) {
        await optionLocator.click();
      } else {
        const fallbackOption = page
          .locator('.v-list-item, [role="option"]')
          .first();
        await fallbackOption
          .waitFor({ state: 'visible', timeout: 5000 })
          .catch(() => null);
        if (await fallbackOption.isVisible()) {
          await fallbackOption.click();
        }
      }

      // check if there's any popup message, close by clicking "Mengerti"
      await this.interactionHelper.dismissPopupIfVisible(page, context, 6);

      const kbli2025Select = page.getByTestId('kbli-select').nth(1);
      let isKbli2025Visible = false;
      try {
        await kbli2025Select.waitFor({ state: 'visible', timeout: 1500 });
        isKbli2025Visible = true;
      } catch (e) {
        // KBLI 2025 select not visible
      }

      if (isKbli2025Visible) {
        const listKbliResponse = await getListKbli2025Promise;
        context.logStep(
          6,
          'info',
          'Konversi KBLI 2025 terdeteksi. Mengambil opsi konversi...',
        );

        let kbliOptions: any[] = [];
        if (listKbliResponse) {
          try {
            const json = await listKbliResponse.json();
            if (json && Array.isArray(json.data)) {
              kbliOptions = json.data.map((item: any) => ({
                code: item.kode,
                title: item.judul,
              }));
            }
          } catch (err) {
            this.logger.error('Failed to parse getListKBLI response', err);
          }
        }

        if (kbliOptions.length > 0) {
          context.logStep(6, 'warn', 'PILIH_KBLI_2025', {
            options: kbliOptions,
          });

          // Wait up to 120 seconds for user response
          const chosenKbli = await context
            .waitForParameterInput()
            .catch(() => '');

          if (!chosenKbli) {
            context.logStep(
              6,
              'error',
              'Pendaftaran GAGAL: Batas waktu pemilihan KBLI 2025 habis.',
            );
            throw new Error('Batas waktu pemilihan KBLI 2025 habis.');
          }

          const option = kbliOptions.find((o) => o.code === chosenKbli);
          const chosenKbliTitle = option ? option.title : 'KBLI 2025 Terpilih';

          context.logStep(
            6,
            'info',
            `Memperbarui database ke KBLI 2025: ${chosenKbli}...`,
          );
          await this.draftsService.update(draftId, {
            kbliCode: chosenKbli,
            kbliTitle: chosenKbliTitle,
          });

          // Select KBLI 2025 in portal
          await kbli2025Select.click();
          const selectContainer = kbli2025Select.locator('input');
          await selectContainer.fill(chosenKbli);

          const optionLocator = page
            .locator('.v-list-item, [role="option"]')
            .filter({ hasText: chosenKbli })
            .first();
          await optionLocator
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => null);
          if (await optionLocator.isVisible()) {
            await optionLocator.click();
          } else {
            const textOption = page.getByText(chosenKbli).first();
            if (await textOption.isVisible().catch(() => false)) {
              await textOption.click().catch(() => null);
            }
          }
        }
      }
    }

    // Ensure Pinia store remains patched
    await this.patchPiniaStoreState(page);

    context.logStep(6, 'info', 'Memilih ruang lingkup kegiatan...');
    const ruangLingkupCombobox = page
      .getByTestId('ruang-lingkup-select')
      .locator('input');
    await ruangLingkupCombobox.waitFor({ state: 'visible', timeout: 10000 });
    await ruangLingkupCombobox.click();

    // check if 'Seluruh' ruang lingkup is exists, then click it
    const seluruhRuangLingkup = page.getByText('Seluruh');
    if (await seluruhRuangLingkup.isVisible()) {
      await seluruhRuangLingkup.click();
      await page.waitForTimeout(1000);
    } else {
      // Fallback: Click the first option in the dropdown list
      const firstOption = page
        .locator('.v-list-item, .v-overlay-container .v-list-item')
        .first();
      await firstOption
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => null);
      if (await firstOption.isVisible()) {
        await firstOption.click();
        await page.waitForTimeout(1000);
      } else {
        const fallbackOption = page.getByRole('option').first();
        if (await fallbackOption.isVisible()) {
          await fallbackOption.click();
          await page.waitForTimeout(1000);
        }
      }
    }

    // select bidang usaha
    const firstRadio = page
      .getByTestId('radio-bidang-usaha')
      .getByRole('radio')
      .first();
    if (await firstRadio.isVisible().catch(() => false)) {
      await firstRadio.click();
      await page.waitForTimeout(1500);
    }

    // Dismiss any popup that appeared during Ruang Lingkup / Bidang Usaha selection
    await this.interactionHelper.dismissPopupIfVisible(page, context, 6);

    // click tombol tambah bidang usaha
    await page.getByRole('button', { name: 'Tambah Bidang Usaha' }).click();

    // wait for prosesBidangUsaha
    const prosesBidangUsahaPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/prosesBidangUsaha') &&
          response.status() === 200,
        { timeout: 25000 },
      )
      .catch(() => null);
    await prosesBidangUsahaPromise;

    const inputRestoran = page.getByRole('textbox', {
      name: 'Contoh : Restoran',
    });
    await inputRestoran.waitFor({ state: 'visible', timeout: 10000 });
    await inputRestoran.fill(draft.namaUsaha);
    await page.getByRole('button', { name: 'Selanjutnya' }).click();

    // wait for prosesProyek
    const prosesProyekPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/prosesProyek') && response.status() === 200,
        { timeout: 25000 },
      )
      .catch(() => null);
    await prosesProyekPromise;

    // check for pernyataan mandiri
    context.logStep(6, 'info', 'Menyetujui pernyataan mandiri...');
    const pernyataanMandiriCheckbox = page.locator('#agreement-checkbox');
    await pernyataanMandiriCheckbox.waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await pernyataanMandiriCheckbox.click();

    // click tombol proses
    await page.getByRole('button', { name: 'Proses' }).click();

    // process
    context.logStep(6, 'info', 'Memproses...');
    await page
      .getByTestId('modal-proses')
      .getByRole('button', { name: 'Proses' })
      .click();

    // wait for submitPernyataanMandiri
    context.logStep(6, 'info', 'Menunggu submitPernyataanMandiri...');
    const submitPernyataanMandiriPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/submitPernyataanMandiri') &&
          response.status() === 200,
        { timeout: 25000 },
      )
      .catch(() => null);
    await submitPernyataanMandiriPromise;

    // wait for detailPerizinan
    const detailPerizinanPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/detailPerizinan') &&
          response.status() === 200,
        { timeout: 25000 },
      )
      .catch(() => null);
    await detailPerizinanPromise;

    // wait for Perizinan Berusaha tab to be visible before clicking Lanjut
    const perizinanTab = page.getByRole('tab', { name: 'Perizinan Berusaha' });
    await perizinanTab.waitFor({ state: 'visible', timeout: 15000 });
    await perizinanTab.click();
    await page.getByRole('button', { name: 'Lanjut' }).click();

    // Apakah kegiatan usaha ini sudah berjalan?
    const isRunning = draft.sudahBerjalan === 'sudah';
    const runningOptionText = isRunning ? 'Sudah Berjalan' : 'Belum Berjalan';
    context.logStep(6, 'info', `Mengisi status berjalan: ${runningOptionText}`);
    // Wait for the page loader overlay to disappear
    const pageLoader = page.locator('.page-loader');
    await pageLoader
      .waitFor({ state: 'detached', timeout: 30000 })
      .catch(() => null);

    const runningCombobox = page
      .getByTestId('select-box-flag-berjalan')
      .first();

    // Wait up to 60s for the page to load and the combobox to be visible
    await runningCombobox
      .waitFor({ state: 'visible', timeout: 60000 })
      .catch(() => null);

    await runningCombobox.click();
    await runningCombobox.locator('input').fill(runningOptionText);
    await page
      .locator('.v-list-item-title, .v-list-item')
      .getByText(runningOptionText, { exact: true })
      .first()
      .click();
    await page.waitForTimeout(500);

    // Conditional Date Pickers for Sudah Berjalan
    if (isRunning) {
      if (draft.tanggalMulaiUsaha) {
        const dateObj = new Date(draft.tanggalMulaiUsaha);
        const targetYear = dateObj.getFullYear();
        const monthNames = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        const targetMonth = monthNames[dateObj.getMonth()];
        const targetDay = dateObj.getDate().toString();

        context.logStep(
          6,
          'info',
          `Mengisi tanggal mulai usaha: ${targetDay} ${targetMonth} ${targetYear}`,
        );

        // 1. Click the datepicker trigger
        const container = page
          .getByTestId('date-time-picker-tgl-berjalan')
          .nth(1);
        await container.scrollIntoViewIfNeeded().catch(() => {});
        await container.click();

        // picker locator
        const pickerContainer = page.locator('.v-picker');

        // 2. Select Year (e.g. 2020)
        const yearSelect = pickerContainer
          .locator('button, div, span')
          .filter({ hasText: /^\d{4}$/ })
          .first();
        const currentYearText = await yearSelect.innerText().catch(() => '');
        let currentYear = parseInt(currentYearText) || new Date().getFullYear();

        if (currentYear !== targetYear) {
          await yearSelect.click().catch(() => {});
          await page.waitForTimeout(1000);

          let targetYearOption = pickerContainer
            .locator('div, li, button, span')
            .filter({ hasText: new RegExp(`^${targetYear}$`) })
            .first();

          if (!(await targetYearOption.isVisible())) {
            targetYearOption = pickerContainer
              .locator('button, div, li, span')
              .filter({ hasText: new RegExp(`^${targetYear}$`) })
              .first();
          }

          if (await targetYearOption.isVisible()) {
            await targetYearOption.scrollIntoViewIfNeeded().catch(() => {});
            await targetYearOption.click({ force: true });
          } else {
            // Fallback: Click year decrement/increment button next to Year text
            const leftArrows = await pickerContainer
              .locator('button, span, i')
              .filter({ hasText: /^(<|chevron_left|left)$/i })
              .all();
            const yearLeftArrow = leftArrows[1] || leftArrows[0];
            if (yearLeftArrow) {
              while (currentYear > targetYear) {
                await yearLeftArrow.click();
                await page.waitForTimeout(200);
                const updatedYearText = await yearSelect.innerText();
                currentYear = parseInt(updatedYearText) || currentYear - 1;
              }
              while (currentYear < targetYear) {
                const rightArrows = await pickerContainer
                  .locator('button, span, i')
                  .filter({ hasText: /^(>|chevron_right|right)$/i })
                  .all();
                const yearRightArrow = rightArrows[1] || rightArrows[0];
                if (yearRightArrow) {
                  await yearRightArrow.click();
                  await page.waitForTimeout(200);
                  const updatedYearText = await yearSelect.innerText();
                  currentYear = parseInt(updatedYearText) || currentYear + 1;
                } else {
                  break;
                }
              }
            }
          }
          await page.waitForTimeout(500);
        }

        // 3. Select Month (e.g. 'Apr')
        const monthSelect = pickerContainer
          .locator('button, div, span')
          .filter({
            hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/,
          })
          .first();
        const currentMonthText = await monthSelect.innerText().catch(() => '');
        if (currentMonthText.toLowerCase() !== targetMonth.toLowerCase()) {
          await monthSelect.click().catch(() => {});
          await page.waitForTimeout(500);

          const targetMonthOption = pickerContainer
            .locator('button, div, span')
            .filter({ hasText: new RegExp(`^${targetMonth}$`, 'i') })
            .first();
          if (await targetMonthOption.isVisible()) {
            await targetMonthOption.click();
          } else {
            // Fallback: Click month decrement button (the 1st left arrow)
            const leftArrows = await pickerContainer
              .locator('button, span, i')
              .filter({ hasText: /^(<|chevron_left|left)$/i })
              .all();
            const monthLeftArrow = leftArrows[0];
            if (monthLeftArrow) {
              let limit = 0;
              while (limit < 12) {
                const checkText = await monthSelect.innerText();
                if (checkText.toLowerCase() === targetMonth.toLowerCase())
                  break;
                await monthLeftArrow.click();
                await page.waitForTimeout(200);
                limit++;
              }
            }
          }
          await page.waitForTimeout(500);
        }

        // 4. Select Day (e.g. '8')
        const dayButton = pickerContainer
          .locator('button, div, span')
          .filter({ hasText: new RegExp(`^\\s*${targetDay}\\s*$`) })
          .first();
        if (await dayButton.isVisible()) {
          await dayButton.click();
        } else {
          await dayButton.click({ force: true }).catch(() => {});
        }
        await page.waitForTimeout(1000);
      }
    }

    if (draft.tanggalMulaiOperasional) {
      const dateObj = new Date(draft.tanggalMulaiOperasional);
      const targetYear = dateObj.getFullYear();
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const targetMonth = monthNames[dateObj.getMonth()];

      context.logStep(
        6,
        'info',
        `Mengisi perkiraan operasional: ${targetMonth} ${targetYear}`,
      );

      // 1. Click the datepicker trigger
      const containerOp = page
        .getByTestId('date-time-picker-jangka-waktu-penyelesaian')
        .filter({ visible: true })
        .first();
      await containerOp.scrollIntoViewIfNeeded().catch(() => {});
      await containerOp.click();
      await page.waitForTimeout(1000);

      const pickerContainerOp = page
        .locator('.v-picker, .v-overlay-container .v-picker')
        .first();

      // Change the year to targetYear
      const yearLabelLocator = pickerContainerOp
        .locator('button, div, span')
        .filter({ hasText: /20\d{2}/ })
        .first();
      const currentYearText = await yearLabelLocator
        .innerText({ timeout: 1000 })
        .catch(() => '');
      let currentYear = parseInt(currentYearText) || new Date().getFullYear();

      let limit = 0;
      while (currentYear !== targetYear && limit < 10) {
        if (currentYear < targetYear) {
          const rightArrows = await pickerContainerOp
            .locator('button, span, i')
            .filter({ hasText: /^(>|chevron_right|right)$/i })
            .all();
          const yearRightArrow = rightArrows[1] || rightArrows[0];
          if (yearRightArrow) {
            await yearRightArrow.click();
            await page.waitForTimeout(500);
          }
        } else {
          const leftArrows = await pickerContainerOp
            .locator('button, span, i')
            .filter({ hasText: /^(<|chevron_left|left)$/i })
            .all();
          const yearLeftArrow = leftArrows[1] || leftArrows[0];
          if (yearLeftArrow) {
            await yearLeftArrow.click();
            await page.waitForTimeout(500);
          }
        }

        const updatedYearText = await yearLabelLocator
          .innerText({ timeout: 1000 })
          .catch(() => '');
        const parsedYear = parseInt(updatedYearText);
        if (parsedYear && parsedYear !== currentYear) {
          currentYear = parsedYear;
        } else {
          currentYear =
            currentYear < targetYear ? currentYear + 1 : currentYear - 1;
        }
        limit++;
      }

      // Click the target month button (e.g. 'Jan')
      const monthOption = pickerContainerOp
        .locator('button, div, span')
        .filter({ hasText: new RegExp(`^${targetMonth}$`, 'i') })
        .first();
      await monthOption.click();
      await page.waitForTimeout(1000);
    }

    // Input investasi
    const investasiLainVal = draft.modalUsaha || '0';
    context.logStep(
      6,
      'info',
      `Mengisi investasi lain: Rp ${parseInt(investasiLainVal).toLocaleString('id-ID')}`,
    );
    const investasiLainInput = page
      .getByTestId('input-investasi-lain')
      .locator('input');
    if (await investasiLainInput.isVisible()) {
      await investasiLainInput.fill(investasiLainVal);
      await page.waitForTimeout(500);
    }

    // Modal Kerja 3 Bulan
    const modalKerjaVal = draft.modalKerja || '0';
    context.logStep(
      6,
      'info',
      `Mengisi modal kerja 3 bulan: Rp ${parseInt(modalKerjaVal).toLocaleString('id-ID')}`,
    );
    const workingCapitalInput = page
      .getByTestId('input-modal-kerja')
      .locator('input');
    if (await workingCapitalInput.isVisible()) {
      await workingCapitalInput.fill(modalKerjaVal);
      await page.waitForTimeout(500);
    }

    // Sumber Pembiayaan
    const fundingSource = draft.sumberPembiayaan || 'modal_sendiri';
    context.logStep(
      6,
      'info',
      `Mengisi sumber pembiayaan: ${fundingSource === 'pinjaman' ? 'Pinjaman' : 'Modal Sendiri'}`,
    );
    if (fundingSource === 'pinjaman') {
      await page
        .getByText('Pinjaman', { exact: true })
        .click()
        .catch(() => {});
    } else {
      await page
        .getByText('Modal Sendiri', { exact: true })
        .click()
        .catch(() => {});
    }
    await page.waitForTimeout(500);

    // Hasil Penjualan Tahunan
    const omzetVal = draft.omzetTahunan || '0';
    context.logStep(
      6,
      'info',
      `Mengisi omzet tahunan: Rp ${parseInt(omzetVal).toLocaleString('id-ID')}`,
    );
    const salesInput = page
      .getByTestId('pendapatan_tahunan')
      .locator('input')
      .first();
    if (await salesInput.isVisible()) {
      await salesInput.fill(omzetVal);
      await page.waitForTimeout(500);
    }

    // Jumlah pekerja laki-laki & perempuan
    let maleLaborVal = draft.jumlahPekerjaLakiLaki;
    let femaleLaborVal = draft.jumlahPekerjaPerempuan;

    if (!maleLaborVal && !femaleLaborVal && draft.jumlahPekerja) {
      maleLaborVal = draft.jumlahPekerja;
      femaleLaborVal = '0';
    }

    maleLaborVal = maleLaborVal || '0';
    femaleLaborVal = femaleLaborVal || '0';

    context.logStep(6, 'info', `Mengisi pekerja laki laki: ${maleLaborVal}`);
    const maleLaborInput = page
      .getByTestId('laborcard-labor-male')
      .locator('input')
      .first();
    if (await maleLaborInput.isVisible()) {
      await maleLaborInput.fill(maleLaborVal);
      await page.waitForTimeout(500);
    }

    context.logStep(6, 'info', `Mengisi pekerja perempuan: ${femaleLaborVal}`);
    const femaleLaborInput = page
      .getByTestId('laborcard-labor-female')
      .locator('input')
      .first();
    if (await femaleLaborInput.isVisible()) {
      await femaleLaborInput.fill(femaleLaborVal);
      await page.waitForTimeout(500);
    }

    // Tambah Produk/Jasa
    context.logStep(6, 'info', 'Membuka modal Tambah Produk/Jasa...');
    const getSatuanPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/getSatuanProduk/') &&
          response.status() === 200,
        { timeout: 15000 },
      )
      .catch(() => null);

    await page.getByRole('button', { name: 'Tambah Produk/Jasa' }).click();
    const getSatuanResponse = await getSatuanPromise;

    let allowedUnits: string[] = [];
    if (getSatuanResponse) {
      try {
        const json = await getSatuanResponse.json();
        if (json && Array.isArray(json.data)) {
          allowedUnits = json.data
            .map((u: any) => u.satuan_ukur)
            .filter(Boolean);
          context.logStep(
            6,
            'info',
            `Satuan resmi yang diizinkan untuk KBLI ini: ${allowedUnits.join(', ')}`,
          );
        }
      } catch (e) {
        console.error('Gagal mengurai response getSatuanProduk:', e);
      }
    }
    await page.waitForTimeout(1000);

    // Check if we already have the product info in the draft (e.g. from previous runs)
    let productInfo = {
      jenisProdukJasa: draft.jenisProdukJasa,
      cangkupanProduk: draft.cangkupanProduk || 'Tidak Mengajukan Fasilitas',
      kapasitas: draft.kapasitas,
      satuan: draft.satuan,
    };

    if (
      !productInfo.jenisProdukJasa ||
      !productInfo.kapasitas ||
      !productInfo.satuan
    ) {
      // Prompt the user since it is missing!
      context.logStep(6, 'warn', 'MENGISI_RINCIAN_PRODUK', {
        allowedUnits,
      });

      // Wait up to 120 seconds for user response
      const userInput = await context.waitForProductInput();

      if (!userInput) {
        context.logStep(
          6,
          'error',
          'Pendaftaran GAGAL: Batas waktu pengisian rincian produk habis.',
        );
        throw new Error('Batas waktu pengisian rincian produk habis.');
      }

      productInfo = {
        jenisProdukJasa: userInput.jenisProdukJasa,
        cangkupanProduk:
          userInput.cangkupanProduk || 'Tidak Mengajukan Fasilitas',
        kapasitas: userInput.kapasitas,
        satuan: userInput.satuan,
      };

      // Also save to database so next time it is cached/persisted
      try {
        await this.draftsService.update(draftId, {
          jenisProdukJasa: productInfo.jenisProdukJasa,
          cangkupanProduk: productInfo.cangkupanProduk,
          kapasitas: productInfo.kapasitas,
          satuan: productInfo.satuan,
        });
      } catch (dbErr) {
        console.error('Gagal menyimpan rincian produk ke DB:', dbErr);
      }
    }

    // Now fill the modal with productInfo!
    context.logStep(
      6,
      'info',
      `Mengisi Jenis Produk/Jasa: ${productInfo.jenisProdukJasa}`,
    );
    const productTypeCombobox = page
      .getByTestId('product-service-card-product-type')
      .locator('input')
      .first();
    await productTypeCombobox.click();
    await productTypeCombobox.fill(productInfo.jenisProdukJasa);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const coverageCombobox = page.locator(
      'input[placeholder*="Cakupan Produk"], input[placeholder*="Cangkupan Produk"]',
    );
    if (await coverageCombobox.isVisible()) {
      context.logStep(
        6,
        'info',
        `Mengisi Cangkupan Produk: ${productInfo.cangkupanProduk}`,
      );
      await coverageCombobox.click();
      await coverageCombobox.fill('');
      await page.waitForTimeout(500);

      const firstOption = page
        .locator('.v-overlay-container .v-list-item, .v-list-item')
        .first();
      await firstOption
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => null);
      if (await firstOption.isVisible()) {
        await firstOption.click();
      } else {
        await coverageCombobox.pressSequentially(productInfo.cangkupanProduk, {
          delay: 100,
        });
        await page.waitForTimeout(500);
        if (await firstOption.isVisible()) {
          await firstOption.click();
        } else {
          await page.keyboard.press('Enter');
        }
      }
      await page.waitForTimeout(1000);
    }

    context.logStep(6, 'info', `Mengisi Kapasitas: ${productInfo.kapasitas}`);
    const capacityInput = page
      .getByTestId('product-service-card-capacity')
      .locator('input');
    await capacityInput.fill(productInfo.kapasitas);
    await page.waitForTimeout(500);

    // Resolve satuan value
    let unitToFill = productInfo.satuan;
    if (allowedUnits.length > 0) {
      const matched = allowedUnits.find(
        (u) => u.toLowerCase() === unitToFill.toLowerCase(),
      );
      if (matched) {
        unitToFill = matched;
      } else {
        unitToFill = allowedUnits[0];
        context.logStep(
          6,
          'info',
          `Satuan "${productInfo.satuan}" tidak diizinkan. Menggunakan "${unitToFill}"...`,
        );
      }
    }

    context.logStep(6, 'info', `Mengisi Satuan: ${unitToFill}`);
    const unitCombobox = page
      .getByTestId('product-service-card-unit')
      .locator('input');
    await unitCombobox.click();
    await unitCombobox.fill(unitToFill);
    await page.waitForTimeout(500);

    const unitOption = page.getByRole('option', { name: unitToFill }).first();
    const unitTextOption = page.getByText(unitToFill, { exact: false }).first();
    if (await unitOption.isVisible()) {
      await unitOption.click();
    } else if (await unitTextOption.isVisible()) {
      await unitTextOption.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(1000);

    // Save Product/Service
    context.logStep(6, 'info', 'Menyimpan data Produk/Jasa...');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await page.waitForTimeout(2000);

    // Wait for getTableKBLIdanProduk response
    await page
      .waitForResponse(
        (response: any) =>
          response.url().includes('getTableKBLIdanProduk') &&
          response.status() === 200,
        { timeout: 15000 },
      )
      .catch(() => null);

    // Setup listeners for risk analysis and parameter validation APIs
    const getResikoPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/getResikoNonPesorangan') &&
          response.status() === 200,
        { timeout: 20000 },
      )
      .catch(() => null);

    const getKriteriaPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/getKriteriaKegiatan') &&
          response.status() === 200,
        { timeout: 20000 },
      )
      .catch(() => null);

    // Click Selanjutnya to validate and load the Risk screen
    context.logStep(
      6,
      'info',
      'Mengklik Selanjutnya untuk validasi Risiko Usaha...',
    );
    await page
      .getByRole('button', { name: 'Selanjutnya', exact: true })
      .click();
    await page.waitForTimeout(1000);

    // Check for validation errors on the page
    const errorContainers = page.locator('.v-input--error');
    const containerCount = await errorContainers.count();
    const visibleErrors: string[] = [];

    const processedTexts = new Set<string>();
    for (let i = 0; i < containerCount; i++) {
      const container = errorContainers.nth(i);
      if (await container.isVisible()) {
        const outerHtml = await container
          .evaluate((el: any) => el.outerHTML)
          .catch(() => '');
        this.logger.error(`[Step 6 Error Container] Outer HTML: ${outerHtml}`);

        let labelText = '';
        const possibleLabel = container
          .locator('.v-label, .v-field-label, label, .v-input__label')
          .first();
        if (await possibleLabel.isVisible()) {
          labelText = (await possibleLabel.innerText()).trim();
        }

        // Try to get input attributes inside the container as descriptive fallbacks
        let fallbackLabel = '';
        const inputEl = container.locator('input, textarea, select').first();
        if (await inputEl.isVisible().catch(() => false)) {
          const placeholder = await inputEl
            .getAttribute('placeholder')
            .catch(() => null);
          const ariaLabel = await inputEl
            .getAttribute('aria-label')
            .catch(() => null);
          const testIdAttr = await inputEl
            .getAttribute('data-testid')
            .catch(() => null);
          const nameAttr = await inputEl.getAttribute('name').catch(() => null);
          const idAttr = await inputEl.getAttribute('id').catch(() => null);

          if (placeholder && placeholder.trim()) {
            fallbackLabel = placeholder.trim();
          } else if (ariaLabel && ariaLabel.trim()) {
            fallbackLabel = ariaLabel.trim();
          } else if (testIdAttr && testIdAttr.trim()) {
            fallbackLabel = testIdAttr.trim();
          } else if (nameAttr && nameAttr.trim()) {
            fallbackLabel = nameAttr.trim();
          } else if (idAttr && idAttr.trim()) {
            fallbackLabel = idAttr.trim();
          }
        }

        const errorMsgEl = container
          .locator('.v-messages__message, .error--text')
          .first();
        let errorText = 'Wajib diisi';
        if (await errorMsgEl.isVisible()) {
          errorText = (await errorMsgEl.innerText()).trim();
          processedTexts.add(errorText);
        }

        // If labelText is empty, matches errorText, or is generic "Wajib diisi", use fallbackLabel
        const isInvalidLabel =
          !labelText ||
          labelText.toLowerCase() === errorText.toLowerCase() ||
          labelText.toLowerCase() === 'wajib diisi';

        if (isInvalidLabel && fallbackLabel) {
          labelText = fallbackLabel;
        }

        // Clean up common technical suffixes/prefixes or action verbs from labels/placeholders
        if (labelText) {
          labelText = labelText
            .replace(/Masukkan\s+/gi, '')
            .replace(/Pilih\s+/gi, '')
            .replace(/Contoh\s*:\s*/gi, '')
            .replace(/Contoh\s+/gi, '')
            .trim();
          labelText = labelText.charAt(0).toUpperCase() + labelText.slice(1);
        }

        if (!labelText) {
          // Last resort fallback
          const innerText = await container.innerText().catch(() => '');
          const firstLine = innerText.split('\n')[0]?.trim() || '';
          if (
            firstLine &&
            firstLine.toLowerCase() !== errorText.toLowerCase() &&
            firstLine.toLowerCase() !== 'wajib diisi'
          ) {
            labelText = firstLine;
          }
        }

        if (labelText) {
          visibleErrors.push(`${labelText} (${errorText})`);
        } else {
          visibleErrors.push(errorText);
        }
      }
    }

    const orphanErrors = page.locator('.error--text, .v-messages__message');
    const orphanCount = await orphanErrors.count();
    for (let i = 0; i < orphanCount; i++) {
      const el = orphanErrors.nth(i);
      if (await el.isVisible()) {
        const errorText = (await el.innerText()).trim();
        if (errorText && !processedTexts.has(errorText)) {
          visibleErrors.push(errorText);
        }
      }
    }

    if (visibleErrors.length > 0) {
      const errorMsg = `Kesalahan pengisian formulir: ${visibleErrors.join(', ')}`;
      context.logStep(6, 'error', `Pendaftaran GAGAL: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Await responses
    const resikoResponse = await getResikoPromise;
    const kriteriaResponse = await getKriteriaPromise;

    let riskInfo: any = null;
    let allowedParameters: string[] = [];

    if (resikoResponse) {
      try {
        const json = await resikoResponse.json();
        riskInfo = {
          tingkatRisiko: json.keterangan_resiko,
          skalaUsaha: json.keterangan_skala_usaha,
          jenisPerizinan: json.jenis_perizinan,
          perizinanTunggal: !!json.flag_perizinan_tunggal,
        };
        context.logStep(
          6,
          'info',
          `Analisis Risiko: ${riskInfo.tingkatRisiko} | Skala: ${riskInfo.skalaUsaha} | Perizinan: ${riskInfo.jenisPerizinan}`,
        );
      } catch (e) {
        console.error('Gagal mengurai response getResikoNonPesorangan:', e);
      }
    }

    if (kriteriaResponse) {
      try {
        const json = await kriteriaResponse.json();
        if (json && Array.isArray(json.data)) {
          allowedParameters = json.data
            .map((item: any) => item.parameter_kewenangan)
            .filter(Boolean);
        }
      } catch (e) {
        console.error('Gagal mengurai response getKriteriaKegiatan:', e);
      }
    }

    await page.waitForTimeout(2000); // wait for page animation/rendering

    // If parameter dropdown exists and has options, prompt user
    if (allowedParameters.length > 0) {
      context.logStep(6, 'warn', 'MENGISI_PARAMETER_RISIKO', {
        tingkatRisiko: riskInfo?.tingkatRisiko || '',
        skalaUsaha: riskInfo?.skalaUsaha || '',
        jenisPerizinan: riskInfo?.jenisPerizinan || '',
        perizinanTunggal: riskInfo?.perizinanTunggal || false,
        parameterOptions: allowedParameters,
      });

      // Wait up to 120s for user parameter selection
      const selectedParam = await context
        .waitForParameterInput()
        .catch(() => '');

      if (!selectedParam) {
        context.logStep(
          6,
          'error',
          'Pendaftaran GAGAL: Batas waktu pemilihan parameter risiko habis.',
        );
        throw new Error('Batas waktu pemilihan parameter risiko habis.');
      }

      context.logStep(
        6,
        'info',
        `Mengisi parameter kewenangan: ${selectedParam}`,
      );

      // Target Parameter Dropdown on portal
      const paramCombobox = page.getByRole('combobox').first();
      if (await paramCombobox.isVisible()) {
        await paramCombobox.click();
        await page.waitForTimeout(500);

        await page.getByText(selectedParam).first().click();
        context.logStep(
          6,
          'info',
          `Mengklik item list overlay: ${selectedParam}`,
        );
        await page.waitForTimeout(1000);
      }
    }

    // Finally click Selanjutnya to save risk/parameter and complete Step 6
    context.logStep(6, 'info', 'Menyimpan analisis Risiko & Parameter...');
    await page
      .getByRole('button', { name: 'Selanjutnya', exact: true })
      .click({ force: true });
    await page.waitForTimeout(3000);

    context.logStep(6, 'info', "Memilih 'Belum' memiliki amdal..");
    await page.getByRole('radio', { name: 'Belum' }).check();

    context.logStep(6, 'info', 'Klik tombol Proses..');
    await page.getByRole('button', { name: 'Proses' }).click();
    await page.waitForTimeout(1500);

    context.logStep(6, 'info', 'Klik tombol Ya, Lanjut..');
    await page.getByRole('button', { name: 'Ya, Lanjut' }).click();
    await page.waitForTimeout(1500);

    // Wait for submitLingkungan response
    await page
      .waitForResponse(
        (response: any) =>
          response.url().includes('submitLingkungan') &&
          response.status() === 200,
        { timeout: 15000 },
      )
      .catch(() => null);

    // Wait for prosesProyek response
    await page
      .waitForResponse(
        (response: any) =>
          response.url().includes('prosesProyek') && response.status() === 200,
        { timeout: 15000 },
      )
      .catch(() => null);

    // TODO move to new step from this state, step name: Proses Penapisan Izin Lingkungan
    context.logStep(6, 'info', 'Klik tab Persyaratan Dasar..');
    await page.getByRole('tab', { name: 'Persyaratan Dasar' }).click();

    const btnProsesPenapisan = page.getByRole('button', {
      name: 'Proses Penapisan',
    });

    if (await btnProsesPenapisan.isVisible()) {
      context.logStep(
        6,
        'info',
        'Klik tombol Proses Penapisan (memaksa di tab yang sama)..',
      );

      // Force any new tab action to happen in the current tab to keep the video recording continuous
      await page.evaluate(() => {
        window.open = function (url) {
          window.location.href = url ? url.toString() : '';
          return window;
        };
        document.addEventListener(
          'click',
          function (e) {
            const target = e.target as HTMLElement;
            const a = target.closest('a');
            if (a && a.getAttribute('target') === '_blank') {
              a.removeAttribute('target');
            }
            const form = target.closest('form');
            if (form && form.getAttribute('target') === '_blank') {
              form.removeAttribute('target');
            }
          },
          { capture: true },
        );
      });

      // Capture the kdIzin from the very first navigation request before the SPA rewrites the URL
      let interceptedIdIzin = '';
      const requestListener = (request: any) => {
        const url = request.url();
        if (request.isNavigationRequest() && url.includes('id_izin=')) {
          const match = url.match(/[?&]id_izin=([^&]+)/);
          if (match && !interceptedIdIzin) {
            interceptedIdIzin = match[1];
          }
        }
      };
      page.on('request', requestListener);

      await btnProsesPenapisan.click();
      await page.waitForTimeout(1500);

      context.logStep(
        6,
        'info',
        'Menunggu halaman penapisan izin lingkungan dimuat...',
      );

      // wait for response list-proyek on the main tab
      await page
        .waitForResponse(
          (response: any) => {
            if (response.url().includes('list-proyek')) {
              context.logStep(
                6,
                'info',
                `Response URL: ${response.url()} | Status: ${response.status()}`,
              );
              return response.status() === 200;
            }
            return false;
          },
          { timeout: 15000 },
        )
        .catch(() => null);

      // Stop listening to requests
      page.off('request', requestListener);
      context.logStep(6, 'info', 'Mendapatkan response list-proyek');

      // Extract kdIzin from the intercepted original navigation request.
      const idIzinMatch = page.url().match(/[?&]id_izin=([^&]+)/);
      const idIzin =
        interceptedIdIzin ||
        (idIzinMatch ? idIzinMatch[1] : draft.idIzin || '');
      context.logStep(6, 'info', `ID Izin: ${idIzin}`);

      const proyekScope = page.locator(`#sub-project-card-${idIzin}`);
      await proyekScope
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => {
          context.logStep(6, 'error', 'Proyek tidak ditemukan..');
          throw new Error('Proyek tidak ditemukan..');
        });
      const proyekCheck = proyekScope.locator('.el-checkbox').first();
      context.logStep(6, 'info', 'Mencentang checkbox proyek...');
      await proyekCheck.click();
      await page.waitForTimeout(1000);

      // wait for response check-license-status
      await page
        .waitForResponse(
          (response: any) =>
            response.url().includes('check-license-status') &&
            response.status() === 200,
          { timeout: 15000 },
        )
        .catch(() => null);
      context.logStep(6, 'info', 'Mendapatkan response check-license-status');

      const elSwitch = proyekScope.locator('.el-switch').first();
      const isAlreadyChecked = await elSwitch
        .evaluate((el: Element) => el.classList.contains('is-checked'))
        .catch(() => false);

      if (!isAlreadyChecked) {
        context.logStep(
          6,
          'info',
          'Mengaktifkan switch pemenuhan persyaratan...',
        );
        await elSwitch.click();
      } else {
        context.logStep(6, 'info', 'Switch pemenuhan persyaratan sudah aktif.');
      }

      context.logStep(6, 'info', 'Membuka pilihan sektor...');
      await page.locator(`#sector-select-${idIzin}`).click();

      const multiSectorOpt = page.getByText('Multi Sektor');
      if (await multiSectorOpt.isVisible()) {
        context.logStep(6, 'info', 'Memilih opsi Multi Sektor...');
        await multiSectorOpt.click();
      } else {
        const targetKbli = draft.kbliCode || '';
        const targetItem = page
          .getByRole('listitem')
          .filter({ hasText: targetKbli })
          .first();
        if (targetKbli && (await targetItem.isVisible())) {
          context.logStep(
            6,
            'info',
            `Memilih sektor sesuai KBLI ${targetKbli}...`,
          );
          await targetItem.click();
        } else {
          context.logStep(6, 'info', 'Memilih sektor pertama yang tersedia...');
          await page.getByRole('listitem').first().click();
        }
      }
    }
  }

  private async patchPiniaStoreState(page: any) {
    try {
      await page
        .evaluate(() => {
          // Clear any existing patch interval
          if ((window as any).__piniaPatchInterval) {
            clearInterval((window as any).__piniaPatchInterval);
          }
          // Start a new periodic patch interval
          (window as any).__piniaPatchInterval = setInterval(() => {
            try {
              const nuxtEl = document.querySelector('#__nuxt');
              if (nuxtEl && (nuxtEl as any).__vue_app__) {
                const pinia = (nuxtEl as any).__vue_app__.config
                  .globalProperties.$pinia;
                if (
                  pinia &&
                  pinia.state &&
                  pinia.state.value &&
                  pinia.state.value['nib-profile']
                ) {
                  const storeState = pinia.state.value['nib-profile'];
                  if (
                    storeState &&
                    storeState.state &&
                    storeState.state.dataPermohonan
                  ) {
                    if (!storeState.state.dataPermohonan.dataNib) {
                      storeState.state.dataPermohonan.dataNib = {};
                    }
                    storeState.state.dataPermohonan.dataNib.jenis_api = '01';
                  }
                }
              }
            } catch (e) {
              // Ignore background evaluation errors
            }
          }, 100);
        })
        .catch(() => null);
    } catch (e) {}
  }
}
