/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/prefer-promise-reject-errors */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import {
  AutomationService,
  AutomationEvent,
} from '../src/automation/automation.service';
import { DraftsService, DraftData } from '../src/drafts/drafts.service';

describe('AutomationService (Staging e2e)', () => {
  let app: INestApplication;
  let automationService: AutomationService;
  let draftsService: DraftsService;

  beforeAll(async () => {
    // Check if staging credentials exist
    if (!process.env.TEST_NIK) {
      console.warn('Skipping Staging E2E tests: TEST_NIK is not set.');
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    automationService = app.get<AutomationService>(AutomationService);
    draftsService = app.get<DraftsService>(DraftsService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it.skip('should complete the entire 5-step registration flow on OSS Staging', async () => {
    if (!process.env.TEST_NIK) {
      return; // Skip
    }

    const testEmailUsername = `nibtest_${Math.floor(100000 + Math.random() * 900000)}`;
    const testEmail = `${testEmailUsername}@yopmail.com`;

    // Create a draft with test NIK and YOPmail email
    const draftPayload: DraftData = {
      namaPemilik: 'Test Automated User',
      nik: process.env.TEST_NIK,
      tanggalLahir: '1990-01-01',
      nomorHp: '081234567890',
      email: testEmail,
      alamatUsaha: 'Jl. Staging Test No. 10',
      provinsi: 'DKI Jakarta',
      kotaKabupaten: 'Jakarta Selatan',
      kecamatan: 'Cilandak',
      kelurahan: 'Cilandak Barat',
      kodePos: '12430',
      namaUsaha: 'Toko Staging Automated',
      ceritaUsaha: 'Menjual barang uji coba otomatisasi.',
      modalUsaha: '5000000',
      jumlahPekerja: '1',
      sumberPembiayaan: 'Mandiri',
      omzetTahunan: '15000000',
      modalKerja: '2000000',
      sudahBerjalan: 'sudah',
      tanggalMulaiUsaha: '2025-01-01',
      tanggalMulaiOperasional: '2027-01-01',
      jenisProdukJasa: 'Makanan ringan',
      cangkupanProduk: 'Lokal',
      kapasitas: '10',
      satuan: 'Pcs',
      sessionId: 'staging-test-session',
    };

    const draft = await draftsService.create(draftPayload);
    const draftId = draft.id!;

    // Start the stream
    const stream$ = automationService.getStream(
      draftId,
      'belum',
      'staging-test-session',
    );
  });

  it('should complete the filing flow on OSS Staging using registered account', async () => {
    if (!process.env.TEST_NIK) {
      return; // Skip
    }

    const testEmailUsername = 'nibtest_935251';

    // Create a draft with the successfully registered email and password on staging
    const draftPayload: DraftData = {
      namaPemilik: 'Test Automated User',
      nik: process.env.TEST_NIK,
      tanggalLahir: '1990-01-01',
      nomorHp: '081234567890',
      email: 'nibtest_935251@yopmail.com',
      ossPassword: 'SecretPassword123!',
      registrationCompleted: true,
      alamatUsaha: 'Jl. Staging Test No. 10',
      provinsi: 'DKI Jakarta',
      kotaKabupaten: 'Jakarta Selatan',
      kecamatan: 'Cilandak',
      kelurahan: 'Cilandak Barat',
      kodePos: '12430',
      namaUsaha: 'Toko Staging Automated',
      ceritaUsaha: 'Menjual barang uji coba otomatisasi.',
      modalUsaha: '5000000',
      jumlahPekerja: '1',
      sumberPembiayaan: 'Mandiri',
      omzetTahunan: '15000000',
      modalKerja: '2000000',
      sudahBerjalan: 'sudah',
      tanggalMulaiUsaha: '2025-01-01',
      tanggalMulaiOperasional: '2027-01-01',
      jenisProdukJasa: 'Makanan ringan',
      cangkupanProduk: 'Lokal',
      kapasitas: '10',
      satuan: 'Pcs',
      sessionId: 'staging-test-session',
    };

    const draft = await draftsService.create(draftPayload);
    const draftId = draft.id!;

    // Start the stream as 'sudah' (filing only)
    const stream$ = automationService.getStream(
      draftId,
      'sudah',
      'staging-test-session',
    );

    // Subscribe and listen to the events
    const events: AutomationEvent[] = [];
    const executionPromise = new Promise<void>((resolve, reject) => {
      stream$.subscribe({
        next: (event) => {
          events.push(event);
          console.log(
            `[Stream Event] Step: ${event.step}, Status: ${event.status}, Text: ${event.text}`,
          );

          // Detect Step 2 (NIK & OTP Verification) when it prompts for OTP
          if (
            event.step === 2 &&
            event.status === 'warn' &&
            event.text.includes('PENTING: Silakan buka email Anda')
          ) {
            console.log('OTP prompt detected. Fetching OTP from YOPmail...');
            fetchOtpFromYopmail(testEmailUsername)
              .then((otp) => {
                console.log(`Found OTP code: ${otp}. Submitting...`);
                automationService.submitOtp(draftId, otp);
              })
              .catch((err) => {
                console.error(
                  'Failed to retrieve OTP from YOPmail:',
                  err.message,
                );
                reject(err);
              });
          }

          // Detect Step 2 (Password creation) when it prompts for password
          if (
            event.step === 2 &&
            event.status === 'warn' &&
            event.text.includes('PENTING: Silakan masukkan kata sandi baru')
          ) {
            console.log(
              'Password prompt detected. Submitting a secure test password...',
            );
            automationService.submitPassword(draftId, 'SecretPassword123!');
          }

          // Handle KBLI selection prompt dynamically
          if (
            event.step === 6 &&
            event.status === 'warn' &&
            event.text.startsWith('PILIH_KBLI_2025')
          ) {
            const options = event.data?.options || [];
            if (options.length > 0) {
              const firstCode = options[0].code;
              console.log(
                `KBLI selection prompt detected. Submitting KBLI: ${firstCode}`,
              );
              automationService.submitParameterInput(draftId, firstCode);
            } else {
              reject(new Error('KBLI selection prompt had no options.'));
            }
          }

          // Handle risk parameter selection prompt dynamically
          if (
            event.step === 6 &&
            event.status === 'warn' &&
            event.text.startsWith('MENGISI_PARAMETER_RISIKO')
          ) {
            const options = event.data?.parameterOptions || [];
            if (options.length > 0) {
              const firstOption = options[0];
              console.log(
                `Risk parameter prompt detected. Submitting parameter: ${firstOption}`,
              );
              automationService.submitParameterInput(draftId, firstOption);
            } else {
              reject(
                new Error('Risk parameter selection prompt had no options.'),
              );
            }
          }
        },
        error: (err) => reject(err),
        complete: () => resolve(),
      });
    });

    await expect(executionPromise).resolves.not.toThrow();

    // Verify draft status in database is now completed
    const updatedDraft = await draftsService.findOne(draftId);
    expect(updatedDraft.status).toBe('COMPLETED');
  }, 600000); // 10 minutes timeout for browser automation
});

// Helper function using Playwright in the background to fetch YOPmail OTP
async function fetchOtpFromYopmail(emailUsername: string): Promise<string> {
  const { chromium } = require('playwright-extra');
  const stealthImport = require('@zorilla/puppeteer-extra-plugin-stealth');
  const stealthPlugin = typeof stealthImport === 'function' ? stealthImport : (stealthImport.default || stealthImport);
  
  // Ensure the plugin is registered (safe if called multiple times)
  try {
    chromium.use(stealthPlugin());
  } catch (e) {
    // Already registered
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // Poll YOPmail inbox
    for (let attempt = 1; attempt <= 24; attempt++) {
      await page.goto('https://yopmail.com/en/', { waitUntil: 'networkidle' }).catch(() => null);
      await page.waitForTimeout(1000);
      await page.fill('#login', emailUsername).catch(() => null);
      await page.click('#refreshbut').catch(() => null);
      await page.waitForTimeout(3000);

      // Check if inbox has mail. The mail list is in frame '#ifinbox'
      const ifInbox = page.frameLocator('#ifinbox');
      const latestMail = ifInbox.locator('.m');

      if ((await latestMail.count()) > 0) {
        // Click the first mail
        await latestMail.first().click();
        await page.waitForTimeout(2000);

        // Read body from frame '#ifmail'
        const ifMail = page.frameLocator('#ifmail');
        const mailBody = await ifMail.locator('#mail').innerText();

        // Extract 6-digit OTP code
        const match = mailBody.match(/\b\d{6}\b/);
        if (match) {
          await browser.close();
          return match[0];
        }
      }

      console.log(
        `[YOPmail Poll] Attempt ${attempt}/24: No OTP email yet. Waiting 5s...`,
      );
      await page.waitForTimeout(5000);
    }
    throw new Error('OTP email not found in YOPmail inbox after 2 minutes');
  } catch (error) {
    await browser.close();
    throw error;
  }
}
