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

        // Check for "Perbarui Email Anda" screen (by URL or text visibility)
        const isRenewEmailUrl =
          currentUrl && currentUrl.includes('/renew-email');
        const headerPerbaruiEmail = page
          .getByText(/Perbarui Email Anda/i)
          .first();
        const isPerbaruiEmailVisible =
          isRenewEmailUrl ||
          (await headerPerbaruiEmail.isVisible().catch(() => false));
        if (isPerbaruiEmailVisible) {
          const isUsername = !draft.email.includes('@');
          if (isUsername) {
            context.logStep(
              4,
              'warn',
              'Sistem OSS meminta untuk memperbarui email. Silakan isi alamat email baru di halaman aplikasi.',
            );

            const newEmail = await context.waitForEmail().catch((err) => {
              this.logger.error(`waitForEmail rejected with error:`, err);
              return '';
            });

            if (newEmail) {
              context.logStep(
                4,
                'info',
                `Mengisi alamat email baru: ${newEmail}...`,
              );
              const emailInput = page
                .locator(
                  'input[type="email"], input[placeholder*="email"], input[name="email"]',
                )
                .first();
              await emailInput.waitFor({ state: 'visible', timeout: 10000 });
              await emailInput.fill(newEmail);
              await page.waitForTimeout(1000);

              const submitBtn = page
                .locator(
                  'button:has-text("Simpan"), button:has-text("Lanjutkan"), button[type="submit"]',
                )
                .first();
              await submitBtn.click();

              context.logStep(
                4,
                'info',
                'Menunggu konfirmasi email berhasil disimpan...',
              );
              const successHeader = page
                .getByText(/Email Berhasil Disimpan/i)
                .first();
              await successHeader
                .waitFor({ state: 'visible', timeout: 15000 })
                .catch(() => {
                  this.logger.warn(
                    'Header konfirmasi email berhasil disimpan tidak terdeteksi dalam 15s.',
                  );
                });

              const dashboardBtn = page
                .locator(
                  'button:has-text("Menuju Dashboard"), a:has-text("Menuju Dashboard")',
                )
                .first();
              const isDashboardBtnVisible = await dashboardBtn
                .isVisible()
                .catch(() => false);
              if (isDashboardBtnVisible) {
                context.logStep(
                  4,
                  'info',
                  'Mengklik tombol "Menuju Dashboard"...',
                );
                await dashboardBtn.click();
              } else {
                context.logStep(
                  4,
                  'warn',
                  'Tombol "Menuju Dashboard" tidak ditemukan. Menunggu pengalihan otomatis...',
                );
              }

              await page.waitForTimeout(3000);

              draft.email = newEmail;
              await this.draftsService
                .update(txId, { email: newEmail })
                .catch((e: any) =>
                  this.logger.error(
                    'Gagal menyimpan email baru ke database',
                    e,
                  ),
                );

              continue;
            } else {
              throw new Error('Timeout pengisian email baru.');
            }
          }
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
    await page.getByText('Perizinan Berusaha', { exact: true }).click();
    await page.getByText('Kelola Usaha', { exact: true }).click();
    await page.getByText('Lokasi Usaha', { exact: true }).click();

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

    const prosesLokasiPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('prosesLokasi') &&
          [200, 201].includes(response.status()),
        { timeout: 60000 },
      )
      .catch(() => null);

    await page.getByRole('button', { name: 'Simpan Posisi Lokasi' }).click();

    const prosesLokasiRes = await prosesLokasiPromise;
    let id_proyek_lokasi: string | undefined;
    if (prosesLokasiRes) {
      try {
        const json = await prosesLokasiRes.json();
        id_proyek_lokasi =
          json?.data?.id_proyek_lokasi || json?.id_proyek_lokasi;
      } catch (e) {}
    }

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

    // select newly created location
    await page
      .locator('.lokasi-usaha-card')
      .nth(0)
      .getByRole('checkbox')
      .click();
    await page
      .getByRole('button', { name: 'Lengkapi Detail Kegiatan' })
      .click();

    return { id_proyek_lokasi };
  }

  public async executeKbliSteps(
    context: AutomationSessionContext,
  ): Promise<{ id_proyek?: string; id_proyek_lokasi?: string }> {
    const { page, draft } = context;
    const draftId = draft.id;
    context.logStep(6, 'info', 'Memulai pengisian KBLI & Bidang Usaha...');

    // Prevent the "Informasi Angka Pengenal Impor (API)" popup from showing up by patching the Pinia store state in the browser
    await this.patchPiniaStoreState(page);

    // check lokasi usaha questions, if exists, select "Tidak"
    const obvitnasQuestion = page.getByRole('radiogroup', {
      name: 'Apakah lokasi usaha berada di wilayah Objek Vital Nasional (Obvitnas)?',
    });
    if (await obvitnasQuestion.isVisible().catch(() => false)) {
      await obvitnasQuestion
        .getByLabel('Tidak')
        .check()
        .catch(() => null);
      await page.waitForTimeout(500);
    }
    const psnQuestion = page.getByRole('radiogroup', {
      name: 'Apakah lokasi usaha berada di wilayah Proyek Strategis Nasional (PSN)?',
    });
    if (await psnQuestion.isVisible().catch(() => false)) {
      await psnQuestion
        .getByLabel('Tidak')
        .check()
        .catch(() => null);
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
    const btnSelanjutnya = page.getByRole('button', { name: 'Selanjutnya' });
    if (await btnSelanjutnya.isVisible().catch(() => false)) {
      await btnSelanjutnya.click();
      await getListKbliPromise;
    }

    // Wait for the loading spinner to disappear
    const spinnerSelector =
      ".v-progress-circular, .v-loading, [role='progressbar'], .loading-spinner";
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

    const jenisKegiatanSelect = page
      .getByTestId('jenis-kegiatan-select')
      .locator('input');
    await jenisKegiatanSelect
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => null);

    if (await jenisKegiatanSelect.isVisible().catch(() => false)) {
      await jenisKegiatanSelect.click();

      const option = page.getByText('Kegiatan Usaha Utama');
      await option
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => null);
      if (!(await option.isVisible().catch(() => false))) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        await jenisKegiatanSelect.click();
        await option
          .waitFor({ state: 'visible', timeout: 5000 })
          .catch(() => null);
      }
      await option.click().catch(() => null);
      await page.waitForTimeout(1500);
    }

    await this.interactionHelper.dismissPopupIfVisible(page, context, 6);
    await this.interactionHelper.dismissPopupIfVisible(page, context, 6);
    await page.waitForTimeout(1000);

    let modalProcessed = false;
    const modalAdjustKbli = page.getByTestId('button-modal-kembali-kbli-2025');
    if (await modalAdjustKbli.isVisible().catch(() => false)) {
      context.logStep(
        6,
        'info',
        'Penyesuaian KBLI 2025 modal terdeteksi. Menyelesaikan penyesuaian...',
      );

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
          .locator(".v-list-item, [role='option']")
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

      const selectRuangLingkup = page.getByPlaceholder(
        'Pilih ruang lingkup kegiatan',
      );
      if (
        (await selectRuangLingkup.isVisible().catch(() => false)) &&
        (await selectRuangLingkup.isEnabled().catch(() => false))
      ) {
        await selectRuangLingkup.click();
        const option = page
          .locator(".v-list-item:visible, [role='option']:visible")
          .first();
        await option
          .waitFor({ state: 'visible', timeout: 5000 })
          .catch(() => null);
        if (await option.isVisible()) {
          await option.click();
        }
        await page.waitForTimeout(1000);
      }

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

      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      await page.waitForTimeout(3000);
      modalProcessed = true;
    }

    if (!modalProcessed) {
      const searchKbli = this.interactionHelper.getOptimalSearchQuery(
        draft.kbliCode,
      );
      context.logStep(
        6,
        'info',
        `Mencari kegiatan usaha: ${draft.kbliCode}...`,
      );
      await this.patchPiniaStoreState(page);

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
      if (await kbliSearch.isVisible().catch(() => false)) {
        await kbliSearch.click();
        await page.waitForTimeout(1500);
        const kbliSearchInput = kbliSearch.locator('input');
        await kbliSearchInput.pressSequentially(searchKbli, { delay: 100 });
        await page.waitForTimeout(500);

        const optionLocator = page
          .locator(".v-list-item, [role='option']")
          .filter({ hasText: searchKbli })
          .first();
        await optionLocator
          .waitFor({ state: 'visible', timeout: 5000 })
          .catch(() => null);
        if (await optionLocator.isVisible()) {
          await optionLocator.click();
        } else {
          const fallbackOption = page
            .locator(".v-list-item, [role='option']")
            .first();
          await fallbackOption
            .waitFor({ state: 'visible', timeout: 5000 })
            .catch(() => null);
          if (await fallbackOption.isVisible()) {
            await fallbackOption.click();
          }
        }
      }

      await this.interactionHelper.dismissPopupIfVisible(page, context, 6);

      const kbli2025Select = page.getByTestId('kbli-select').nth(1);
      let isKbli2025Visible = false;
      try {
        await kbli2025Select.waitFor({ state: 'visible', timeout: 1500 });
        isKbli2025Visible = true;
      } catch (e) {}

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

          await kbli2025Select.click();
          const selectContainer = kbli2025Select.locator('input');
          await selectContainer.fill(chosenKbli);

          const optionLocator = page
            .locator(".v-list-item, [role='option']")
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

    await this.patchPiniaStoreState(page);

    context.logStep(6, 'info', 'Memilih ruang lingkup kegiatan...');
    const ruangLingkupCombobox = page
      .getByTestId('ruang-lingkup-select')
      .locator('input');
    if (await ruangLingkupCombobox.isVisible().catch(() => false)) {
      await ruangLingkupCombobox.waitFor({ state: 'visible', timeout: 10000 });
      await ruangLingkupCombobox.click();

      const seluruhRuangLingkup = page.getByText('Seluruh');
      if (await seluruhRuangLingkup.isVisible().catch(() => false)) {
        await seluruhRuangLingkup.click();
        await page.waitForTimeout(1000);
      } else {
        const firstOption = page
          .locator(".v-list-item:visible, [role='option']:visible")
          .first();
        await firstOption
          .waitFor({ state: 'visible', timeout: 5000 })
          .catch(() => null);
        if (await firstOption.isVisible()) {
          await firstOption.click();
          await page.waitForTimeout(1000);
        }
      }
    }

    const firstRadio = page
      .getByTestId('radio-bidang-usaha')
      .getByRole('radio')
      .first();
    if (await firstRadio.isVisible().catch(() => false)) {
      await firstRadio.click();
      await page.waitForTimeout(1500);
    }

    await this.interactionHelper.dismissPopupIfVisible(page, context, 6);

    const prosesBidangUsahaPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/prosesBidangUsaha') &&
          [200, 201].includes(response.status()),
        { timeout: 35000 },
      )
      .catch(() => null);

    const btnTambahBidang = page.getByRole('button', {
      name: 'Tambah Bidang Usaha',
    });
    if (await btnTambahBidang.isVisible().catch(() => false)) {
      await btnTambahBidang.click();
    }

    const prosesBidangUsahaRes = await prosesBidangUsahaPromise;
    let id_proyek: string | undefined;
    if (prosesBidangUsahaRes) {
      try {
        const json = await prosesBidangUsahaRes.json();
        id_proyek = json?.data?.id_proyek || json?.id_proyek;
      } catch (e) {}
    }

    const inputRestoran = page.getByRole('textbox', {
      name: 'Contoh : Restoran',
    });
    await inputRestoran
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => null);
    if (await inputRestoran.isVisible().catch(() => false)) {
      await inputRestoran.fill(draft.namaUsaha);
      await page.getByRole('button', { name: 'Selanjutnya' }).click();
    }

    return { id_proyek };
  }

  public async executeTataRuangSteps(
    context: AutomationSessionContext,
  ): Promise<void> {
    const { page } = context;
    context.logStep(6, 'info', 'Memproses Pernyataan Tata Ruang...');

    const pernyataanMandiriCheckbox = page.locator('#agreement-checkbox');
    await pernyataanMandiriCheckbox
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => null);
    if (await pernyataanMandiriCheckbox.isVisible().catch(() => false)) {
      context.logStep(6, 'info', 'Menyetujui pernyataan mandiri...');
      await pernyataanMandiriCheckbox.click();

      await page.getByRole('button', { name: 'Proses' }).click();

      context.logStep(6, 'info', 'Memproses...');
      await page
        .getByTestId('modal-proses')
        .getByRole('button', { name: 'Proses' })
        .click();

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

      const detailPerizinanPromise = page
        .waitForResponse(
          (response: any) =>
            response.url().includes('/detailPerizinan') &&
            response.status() === 200,
          { timeout: 25000 },
        )
        .catch(() => null);
      await detailPerizinanPromise;

      const perizinanTab = page.getByRole('tab', {
        name: 'Perizinan Berusaha',
      });
      await perizinanTab
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => null);
      if (await perizinanTab.isVisible().catch(() => false)) {
        await perizinanTab.click();
        await page.getByRole('button', { name: 'Lanjut' }).click();
      }
    }
  }

  public async executeInvestasiProdukSteps(
    context: AutomationSessionContext,
  ): Promise<void> {
    const { page, draft } = context;
    const draftId = draft.id;
    context.logStep(6, 'info', 'Memulai pengisian Data Investasi & Produk...');

    const isRunning = draft.sudahBerjalan === 'sudah';
    const runningOptionText = isRunning ? 'Sudah Berjalan' : 'Belum Berjalan';
    context.logStep(6, 'info', `Mengisi status berjalan: ${runningOptionText}`);

    const pageLoader = page.locator('.page-loader');
    await pageLoader
      .waitFor({ state: 'detached', timeout: 30000 })
      .catch(() => null);

    const runningCombobox = page
      .getByTestId('select-box-flag-berjalan')
      .first();
    await runningCombobox
      .waitFor({ state: 'visible', timeout: 60000 })
      .catch(() => null);

    if (await runningCombobox.isVisible().catch(() => false)) {
      await runningCombobox.click();
      await runningCombobox.locator('input').fill(runningOptionText);
      await page
        .locator('.v-list-item-title, .v-list-item')
        .getByText(runningOptionText, { exact: true })
        .first()
        .click();
      await page.waitForTimeout(500);
    }

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

        const container = page
          .getByTestId('date-time-picker-tgl-berjalan')
          .nth(1);
        if (await container.isVisible().catch(() => false)) {
          await container.scrollIntoViewIfNeeded().catch(() => {});
          await container.click();

          const pickerContainer = page.locator('.v-picker');
          const yearSelect = pickerContainer
            .locator('button, div, span')
            .filter({ hasText: /^\d{4}$/ })
            .first();
          const currentYearText = await yearSelect.innerText().catch(() => '');
          const currentYear =
            parseInt(currentYearText) || new Date().getFullYear();

          if (currentYear !== targetYear) {
            await yearSelect.click().catch(() => {});
            await page.waitForTimeout(1000);

            const targetYearOption = pickerContainer
              .locator('div, li, button, span')
              .filter({ hasText: new RegExp(`^${targetYear}$`) })
              .first();

            if (await targetYearOption.isVisible().catch(() => false)) {
              await targetYearOption.scrollIntoViewIfNeeded().catch(() => {});
              await targetYearOption.click({ force: true });
            }
          }

          const monthSelect = pickerContainer
            .locator('button, div, span')
            .filter({
              hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/,
            })
            .first();
          if (await monthSelect.isVisible().catch(() => false)) {
            await monthSelect.click().catch(() => {});
            await page.waitForTimeout(500);

            const targetMonthOption = pickerContainer
              .locator('button, div, span')
              .filter({ hasText: new RegExp(`^${targetMonth}$`, 'i') })
              .first();
            if (await targetMonthOption.isVisible().catch(() => false)) {
              await targetMonthOption.click();
            }
          }

          const dayButton = pickerContainer
            .locator('button, div, span')
            .filter({ hasText: new RegExp(`^\\s*${targetDay}\\s*$`) })
            .first();
          if (await dayButton.isVisible().catch(() => false)) {
            await dayButton.click();
          }
          await page.waitForTimeout(1000);
        }
      }
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
    if (await investasiLainInput.isVisible().catch(() => false)) {
      await investasiLainInput.fill(investasiLainVal);
      await page.waitForTimeout(500);
    }

    const modalKerjaVal = draft.modalKerja || '0';
    const workingCapitalInput = page
      .getByTestId('input-modal-kerja')
      .locator('input');
    if (await workingCapitalInput.isVisible().catch(() => false)) {
      await workingCapitalInput.fill(modalKerjaVal);
      await page.waitForTimeout(500);
    }

    const fundingSource = draft.sumberPembiayaan || 'modal_sendiri';
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

    const omzetVal = draft.omzetTahunan || '0';
    const salesInput = page
      .getByTestId('pendapatan_tahunan')
      .locator('input')
      .first();
    if (await salesInput.isVisible().catch(() => false)) {
      await salesInput.fill(omzetVal);
      await page.waitForTimeout(500);
    }

    const maleLaborVal =
      draft.jumlahPekerjaLakiLaki || draft.jumlahPekerja || '0';
    const femaleLaborVal = draft.jumlahPekerjaPerempuan || '0';

    const maleLaborInput = page
      .getByTestId('laborcard-labor-male')
      .locator('input')
      .first();
    if (await maleLaborInput.isVisible().catch(() => false)) {
      await maleLaborInput.fill(maleLaborVal);
      await page.waitForTimeout(500);
    }

    const femaleLaborInput = page
      .getByTestId('laborcard-labor-female')
      .locator('input')
      .first();
    if (await femaleLaborInput.isVisible().catch(() => false)) {
      await femaleLaborInput.fill(femaleLaborVal);
      await page.waitForTimeout(500);
    }

    const btnTambahProduk = page.getByRole('button', {
      name: 'Tambah Produk/Jasa',
    });
    if (await btnTambahProduk.isVisible().catch(() => false)) {
      context.logStep(6, 'info', 'Membuka modal Tambah Produk/Jasa...');
      const getSatuanPromise = page
        .waitForResponse(
          (response: any) =>
            response.url().includes('/getSatuanProduk/') &&
            response.status() === 200,
          { timeout: 15000 },
        )
        .catch(() => null);

      await btnTambahProduk.click();
      const getSatuanResponse = await getSatuanPromise;

      let allowedUnits: string[] = [];
      if (getSatuanResponse) {
        try {
          const json = await getSatuanResponse.json();
          if (json && Array.isArray(json.data)) {
            allowedUnits = json.data
              .map((u: any) => u.satuan_ukur)
              .filter(Boolean);
          }
        } catch (e) {}
      }

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
        context.logStep(6, 'warn', 'MENGISI_RINCIAN_PRODUK', { allowedUnits });
        const userInput = await context.waitForProductInput();
        if (!userInput) {
          throw new Error('Batas waktu pengisian rincian produk habis.');
        }
        productInfo = {
          jenisProdukJasa: userInput.jenisProdukJasa,
          cangkupanProduk:
            userInput.cangkupanProduk || 'Tidak Mengajukan Fasilitas',
          kapasitas: userInput.kapasitas,
          satuan: userInput.satuan,
        };
        await this.draftsService
          .update(draftId, { ...productInfo })
          .catch(() => null);
      }

      const productTypeCombobox = page
        .getByTestId('product-service-card-product-type')
        .locator('input')
        .first();
      await productTypeCombobox.click();
      await productTypeCombobox.fill(productInfo.jenisProdukJasa);
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      const capacityInput = page
        .getByTestId('product-service-card-capacity')
        .locator('input');
      await capacityInput.fill(productInfo.kapasitas);
      await page.waitForTimeout(500);

      let unitToFill = productInfo.satuan;
      if (allowedUnits.length > 0) {
        const matched = allowedUnits.find(
          (u) => u.toLowerCase() === unitToFill.toLowerCase(),
        );
        unitToFill = matched || allowedUnits[0];
      }

      const unitCombobox = page
        .getByTestId('product-service-card-unit')
        .locator('input');
      await unitCombobox.click();
      await unitCombobox.fill(unitToFill);
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      await page.waitForTimeout(2000);

      await page
        .waitForResponse(
          (response: any) =>
            response.url().includes('getTableKBLIdanProduk') &&
            response.status() === 200,
          { timeout: 15000 },
        )
        .catch(() => null);
    }
  }

  public async executeParameterRisikoSteps(
    context: AutomationSessionContext,
  ): Promise<void> {
    const { page } = context;
    context.logStep(6, 'info', 'Memulai pengisian Parameter Risiko...');

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

    context.logStep(
      6,
      'info',
      'Mengklik Selanjutnya untuk validasi Risiko Usaha...',
    );
    const btnSelanjutnya = page.getByRole('button', {
      name: 'Selanjutnya',
      exact: true,
    });
    await btnSelanjutnya
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => null);
    if (await btnSelanjutnya.isVisible().catch(() => false)) {
      await btnSelanjutnya.click({ force: true });
      await page.waitForTimeout(1000);
    }

    const resikoResponse = await getResikoPromise;
    const kriteriaResponse = await getKriteriaPromise;

    let allowedParameters: string[] = [];
    if (kriteriaResponse) {
      try {
        const json = await kriteriaResponse.json();
        if (json && Array.isArray(json.data)) {
          allowedParameters = json.data
            .map((item: any) => item.parameter_kewenangan)
            .filter(Boolean);
        }
      } catch (e) {}
    }

    if (allowedParameters.length > 0) {
      context.logStep(6, 'warn', 'MENGISI_PARAMETER_RISIKO', {
        parameterOptions: allowedParameters,
      });
      const selectedParam = await context
        .waitForParameterInput()
        .catch(() => '');
      if (!selectedParam) {
        throw new Error('Batas waktu pemilihan parameter risiko habis.');
      }

      const paramCombobox = page.getByRole('combobox').first();
      if (await paramCombobox.isVisible().catch(() => false)) {
        await paramCombobox.click();
        await page.waitForTimeout(500);
        await page
          .getByText(selectedParam)
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(1000);
      }
    }

    context.logStep(6, 'info', 'Menyimpan analisis Risiko & Parameter...');
    if (await btnSelanjutnya.isVisible().catch(() => false)) {
      await btnSelanjutnya.click({ force: true });
      await page.waitForTimeout(3000);
    }
  }

  public async executePersetujuanLingkunganSteps(
    context: AutomationSessionContext,
  ): Promise<void> {
    const { page } = context;
    context.logStep(6, 'info', 'Memulai pengisian Persetujuan Lingkungan...');

    const radioBelum = page.getByRole('radio', { name: 'Belum' });
    await radioBelum
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => null);
    if (await radioBelum.isVisible().catch(() => false)) {
      context.logStep(6, 'info', 'Memilih Belum memiliki amdal..');
      await radioBelum.check();

      context.logStep(6, 'info', 'Klik tombol Proses..');
      await page.getByRole('button', { name: 'Proses' }).click();
      await page.waitForTimeout(1500);

      context.logStep(6, 'info', 'Klik tombol Ya, Lanjut..');
      await page.getByRole('button', { name: 'Ya, Lanjut' }).click();
      await page.waitForTimeout(1500);

      await page
        .waitForResponse(
          (response: any) =>
            response.url().includes('submitLingkungan') &&
            response.status() === 200,
          { timeout: 15000 },
        )
        .catch(() => null);

      await page
        .waitForResponse(
          (response: any) =>
            response.url().includes('prosesProyek') &&
            [200, 201].includes(response.status()),
          { timeout: 15000 },
        )
        .catch(() => null);

      const tabPersyaratan = page.getByRole('tab', {
        name: 'Persyaratan Dasar',
      });
      await tabPersyaratan
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => null);
      if (await tabPersyaratan.isVisible().catch(() => false)) {
        await tabPersyaratan.click();
      }
    }
  }

  public async executeAmdalnetSteps(
    context: AutomationSessionContext,
  ): Promise<{ kd_izin?: string; id_izin?: string }> {
    const { page, draft } = context;
    context.logStep(6, 'info', 'Memulai proses penapisan AMDALnet...');

    const btnProsesPenapisan = page.getByRole('button', {
      name: 'Proses Penapisan',
    });
    await btnProsesPenapisan
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => null);

    let kd_izin: string | undefined;
    let id_izin: string | undefined;

    if (await btnProsesPenapisan.isVisible().catch(() => false)) {
      context.logStep(
        6,
        'info',
        'Klik tombol Proses Penapisan (memaksa di tab yang sama)....',
      );
      await page
        .evaluate(() => {
          window.open = function (url) {
            window.location.href = url ? url.toString() : '';
            return window;
          };
        })
        .catch(() => null);

      let interceptedIdIzin = '';
      let interceptedKdIzin = '';
      const requestListener = (request: any) => {
        const url = request.url();
        if (url.includes('id_izin=')) {
          const matchId = url.match(/[?&]id_izin=([^&]+)/);
          if (matchId && !interceptedIdIzin) interceptedIdIzin = matchId[1];
        }
        if (url.includes('kd_izin=')) {
          const matchKd = url.match(/[?&]kd_izin=([^&]+)/);
          if (matchKd && !interceptedKdIzin) interceptedKdIzin = matchKd[1];
        }
      };

      page.on('request', requestListener);
      await btnProsesPenapisan.click();
      await page.waitForTimeout(3000);
      page.off('request', requestListener);

      kd_izin = interceptedKdIzin || '029000000100';
      id_izin = interceptedIdIzin || draft.idIzin;

      if (id_izin) {
        const proyekScope = page.locator(`#sub-project-card-${id_izin}`);
        await proyekScope
          .waitFor({ state: 'visible', timeout: 15000 })
          .catch(() => null);
        if (await proyekScope.isVisible().catch(() => false)) {
          const proyekCheck = proyekScope.locator('.el-checkbox').first();
          await proyekCheck.click().catch(() => null);
          await page.waitForTimeout(1000);

          const elSwitch = proyekScope.locator('.el-switch').first();
          const isAlreadyChecked = await elSwitch
            .evaluate((el: Element) => el.classList.contains('is-checked'))
            .catch(() => false);

          if (!isAlreadyChecked) {
            await elSwitch.click().catch(() => null);
          }

          const sectorSelect = page.locator(`#sector-select-${id_izin}`);
          if (await sectorSelect.isVisible().catch(() => false)) {
            await sectorSelect.click();
            const multiSectorOpt = page.getByText('Multi Sektor');
            if (await multiSectorOpt.isVisible().catch(() => false)) {
              await multiSectorOpt.click();
            } else {
              await page
                .getByRole('listitem')
                .first()
                .click()
                .catch(() => null);
            }
          }
        }
      }
    }

    return { kd_izin, id_izin };
  }

  public async executePenerbitanNibSteps(
    context: AutomationSessionContext,
  ): Promise<void> {
    const { page } = context;
    context.logStep(7, 'info', 'Memulai penerbitan & finalisasi draft NIB...');

    const cardLocator = page.locator('.lokasi-usaha-card').first();
    if (await cardLocator.isVisible().catch(() => false)) {
      await cardLocator
        .getByRole('checkbox')
        .click()
        .catch(() => null);
      await page
        .getByRole('button', { name: 'Lengkapi Detail Kegiatan' })
        .click()
        .catch(() => null);
      await page.waitForTimeout(2000);
    }

    const yaRadio = page
      .locator('.el-radio')
      .filter({ hasText: /^Ya$/i })
      .first();
    if (await yaRadio.isVisible().catch(() => false)) {
      await yaRadio.click().catch(() => null);
      await page.waitForTimeout(500);
    }

    const tapakSatuKab = page
      .locator('.el-radio')
      .filter({ hasText: /tapak proyek berada di satu kabupaten\/kota/i })
      .first();
    if (await tapakSatuKab.isVisible().catch(() => false)) {
      await tapakSatuKab.click().catch(() => null);
      await page.waitForTimeout(500);
    }

    const nextButtonFinal = page.getByRole('button', { name: 'Selanjutnya' });
    if (await nextButtonFinal.isVisible().catch(() => false)) {
      await nextButtonFinal.click().catch(() => null);
      await page.waitForTimeout(1000);
    }

    await page
      .waitForResponse(
        (response: any) =>
          response.url().includes('penapisan-kewenangan') &&
          response.status() === 200,
        { timeout: 15000 },
      )
      .catch(() => null);

    const saveButton = page.getByRole('button', { name: 'Simpan' }).first();
    if (await saveButton.isVisible().catch(() => false)) {
      const updateDataPermohonanPromise = page
        .waitForResponse(
          (response: any) =>
            response.url().includes('api/projects') &&
            response.status() === 200,
          { timeout: 20000 },
        )
        .catch(() => null);

      await saveButton.click();
      await page.waitForTimeout(1000);

      const popupConfirm = page
        .locator('.el-message-box__wrapper, .el-message-box')
        .first();
      if (await popupConfirm.isVisible().catch(() => false)) {
        const popupSimpanBtn = page
          .locator('.el-message-box__btns button, .el-message-box button')
          .filter({ hasText: /^Simpan$/i })
          .first();
        if (await popupSimpanBtn.isVisible().catch(() => false)) {
          await popupSimpanBtn.click().catch(() => null);
        }
      }

      await updateDataPermohonanPromise;
      await page.waitForTimeout(2000);

      const finalOkBtn = page
        .locator("button, .v-btn, .el-button, [role='button']")
        .filter({ hasText: /Oke,\s*Mengerti/i })
        .first();

      if (await finalOkBtn.isVisible().catch(() => false)) {
        await finalOkBtn.click().catch(() => null);
        await page.waitForTimeout(1000);
      }
    }
  }

  public async executeManageBusinessDetailSteps(
    context: AutomationSessionContext,
  ) {
    const kbliRes = await this.executeKbliSteps(context);
    await this.executeTataRuangSteps(context);
    await this.executeInvestasiProdukSteps(context);
    await this.executeParameterRisikoSteps(context);
    await this.executePersetujuanLingkunganSteps(context);
    const amdalRes = await this.executeAmdalnetSteps(context);
    await this.executePenerbitanNibSteps(context);
    return { ...kbliRes, ...amdalRes };
  }

  public async patchPiniaStoreState(page: any) {
    try {
      await page
        .evaluate(() => {
          if ((window as any).__piniaPatchInterval) {
            clearInterval((window as any).__piniaPatchInterval);
          }
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
            } catch (e) {}
          }, 100);
        })
        .catch(() => null);
    } catch (e) {}
  }
}
