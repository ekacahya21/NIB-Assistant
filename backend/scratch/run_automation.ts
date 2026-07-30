import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AutomationService, AutomationEvent } from '../src/automation/automation.service';
import { DraftsService, DraftData } from '../src/drafts/drafts.service';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Helper function to fetch YOPmail OTP
async function fetchOtpFromYopmail(emailUsername: string): Promise<string> {
  const { chromium } = require('playwright-extra');
  const stealthImport = require('@zorilla/puppeteer-extra-plugin-stealth');
  const stealthPlugin = typeof stealthImport === 'function' ? stealthImport : (stealthImport.default || stealthImport);
  
  try {
    chromium.use(stealthPlugin());
  } catch (e) {
    // Ignore duplicate plugin registrations
  }

  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage();
    for (let attempt = 1; attempt <= 24; attempt++) {
      await page.goto('https://yopmail.com/en/', { waitUntil: 'networkidle' }).catch(() => null);
      await page.waitForTimeout(1000);
      await page.fill('#login', emailUsername).catch(() => null);
      await page.click('#refreshbut').catch(() => null);
      await page.waitForTimeout(3000);

      const ifInbox = page.frameLocator('#ifinbox');
      const latestMail = ifInbox.locator('.m');

      if ((await latestMail.count()) > 0) {
        await latestMail.first().click();
        await page.waitForTimeout(2000);

        const ifMail = page.frameLocator('#ifmail');
        const mailBody = await ifMail.locator('body').innerText();

        const match = mailBody.match(/\b\d{6}\b/);
        if (match) {
          await browser.close();
          return match[0];
        }
      }

      console.log(`[YOPmail Poll] Attempt ${attempt}/24: No OTP email yet. Waiting 5s...`);
      await page.waitForTimeout(5000);
    }
    throw new Error('OTP email not found in YOPmail inbox after 2 minutes');
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function run() {
  const testNik = process.env.TEST_NIK || '1234567890123456';
  console.log(`Starting automated scratchpad execution for NIK: ${testNik}`);

  // Bootstrap the application context
  const app = await NestFactory.createApplicationContext(AppModule);
  const automationService = app.get(AutomationService);
  const draftsService = app.get(DraftsService);

  const testEmailUsername = `nibtest_${Math.floor(100000 + Math.random() * 900000)}`;
  const testEmail = `${testEmailUsername}@yopmail.com`;
  console.log(`Dynamic email for registration: ${testEmail}`);

  // Create registration payload
  const draftPayload: DraftData = {
    namaPemilik: 'Test Automated User',
    nik: testNik,
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
    latitude: '-6.2912',
    longitude: '106.8016',
    kbliCode: '47111',
    jenisProdukJasa: 'Makanan ringan',
    cangkupanProduk: 'Lokal',
    kapasitas: '10',
    satuan: 'Pcs',
    sessionId: 'scratchpad-session',
  };

  const draft = await draftsService.create(draftPayload);
  const draftId = draft.id!;
  console.log(`Draft registered in Database with ID: ${draftId}`);

  // Initialize the stream as 'belum' (registration + filing)
  const stream$ = automationService.getStream(
    draftId,
    'belum',
    'scratchpad-session',
  );

  await new Promise<void>((resolve, reject) => {
    stream$.subscribe({
      next: (event) => {
        console.log(`[Stream Event] Step: ${event.step}, Status: ${event.status}, Text: ${event.text}`);

        // Handle OTP step during NIK verification
        if (
          event.step === 2 &&
          event.status === 'warn' &&
          event.text.includes('PENTING: Silakan buka email Anda')
        ) {
          console.log('OTP prompt detected. Polling YOPmail...');
          fetchOtpFromYopmail(testEmailUsername)
            .then((otp) => {
              console.log(`Fetched OTP from YOPmail: ${otp}. Submitting...`);
              automationService.submitOtp(draftId, otp);
            })
            .catch((err) => {
              console.error('Failed to resolve OTP:', err.message);
              reject(err);
            });
        }

        // Handle new password creation
        if (
          event.step === 2 &&
          event.status === 'warn' &&
          event.text.includes('PENTING: Silakan masukkan kata sandi baru')
        ) {
          console.log('Password prompt detected. Submitting test password...');
          automationService.submitPassword(draftId, 'SecretPassword123!');
        }

        // Handle KBLI selection prompt
        if (
          event.step === 6 &&
          event.status === 'warn' &&
          event.text.startsWith('PILIH_KBLI_2025')
        ) {
          const options = event.data?.options || [];
          if (options.length > 0) {
            const firstCode = options[0].code;
            console.log(`KBLI selection prompt detected. Selecting: ${firstCode}`);
            automationService.submitParameterInput(draftId, firstCode);
          } else {
            reject(new Error('KBLI selection prompt had no options.'));
          }
        }

        // Handle risk parameter prompt
        if (
          event.step === 6 &&
          event.status === 'warn' &&
          event.text.startsWith('MENGISI_PARAMETER_RISIKO')
        ) {
          const options = event.data?.parameterOptions || [];
          if (options.length > 0) {
            const firstOption = options[0];
            console.log(`Risk parameter prompt detected. Selecting: ${firstOption}`);
            automationService.submitParameterInput(draftId, firstOption);
          } else {
            reject(new Error('Risk parameter prompt had no options.'));
          }
        }
      },
      error: (err) => {
        console.error('Stream execution error:', err);
        reject(err);
      },
      complete: () => {
        console.log('Stream finished execution successfully!');
        resolve();
      },
    });
  });

  const finalDraft = await draftsService.findOne(draftId);
  console.log(`Final Database Draft Status: ${finalDraft.status}`);
  await app.close();
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
