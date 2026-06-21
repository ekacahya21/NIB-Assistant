import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { chromium } from 'playwright-extra';
import stealthPlugin from '@zorilla/puppeteer-extra-plugin-stealth';
import { DraftsService } from '../drafts/drafts.service';
import { DocumentsService } from '../documents/documents.service';
import * as fs from 'fs';
import * as path from 'path';

// Configure Playwright Extra with the stealth evasion plugin globally
chromium.use(stealthPlugin());

export interface AutomationEvent {
  step: number;
  status: 'info' | 'success' | 'warn' | 'error';
  text: string;
}

@Injectable()
export class AutomationService implements OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private readonly userConfirmations = new Subject<string>();
  private readonly activeOtps = new Map<string, string>();
  private readonly activePasswords = new Map<string, string>();
  private readonly activeTokens = new Map<string, string>();
  private readonly subjectToDraftId = new Map<Subject<AutomationEvent>, string>();
  private readonly executionTimers = new Map<string, {
    startTime: number;
    lastLogTime: number;
    stepStartTimes: Map<number, number>;
  }>();

  // Queue and browser management
  private activeSessionsCount = 0;
  private readonly activeBrowsers = new Map<string, any>();
  private readonly activeSubjects = new Map<string, Subject<AutomationEvent>>();
  private readonly queue: Array<{
    draftId: string;
    akunOss: string | undefined;
    subject: Subject<AutomationEvent>;
    resolve: () => void;
    reject: (err: any) => void;
    isCancelled: boolean;
  }> = [];

  constructor(
    private readonly draftsService: DraftsService,
    private readonly documentsService: DocumentsService,
  ) {}

  async onModuleDestroy() {
    this.logger.log('Shutting down AutomationService. Cleaning up active browsers and streams...');
    
    // 1. Close all active browsers
    const closePromises: Promise<void>[] = [];
    for (const [draftId, browser] of this.activeBrowsers.entries()) {
      this.logger.log(`Closing browser for draft ID during shutdown: ${draftId}`);
      closePromises.push(
        browser.close().catch((err: any) => {
          this.logger.error(`Error closing browser for draft ID ${draftId} during shutdown: ${err}`);
        })
      );
    }
    await Promise.all(closePromises);
    this.activeBrowsers.clear();

    // 2. Complete all active subjects
    for (const [draftId, subject] of this.activeSubjects.entries()) {
      subject.complete();
    }
    this.activeSubjects.clear();

    // 3. Reject all queued items
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        task.reject(new Error('Server sedang dimatikan. Sesi otomatisasi dibatalkan.'));
      }
    }

    this.logger.log('Cleanup completed.');
  }

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
    return new Observable<AutomationEvent>((subscriber) => {
      // Prevent double session for the same draftId
      if (this.activeSubjects.has(draftId)) {
        subscriber.next({
          step: 1,
          status: 'error',
          text: 'Sesi otomatisasi untuk data ini sudah berjalan atau sedang mengantre.'
        });
        subscriber.complete();
        return;
      }

      const subject = new Subject<AutomationEvent>();
      this.subjectToDraftId.set(subject, draftId);
      this.activeSubjects.set(draftId, subject);

      this.enqueueRequest(draftId, akunOss, subject);

      const subscription = subject.subscribe({
        next: (val) => subscriber.next(val),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      return () => {
        this.logger.log(`Client disconnected from SSE stream for draft: ${draftId}`);
        subscription.unsubscribe();
        this.cancelStream(draftId);
      };
    });
  }

  cancelStream(draftId: string) {
    this.logger.log(`Received cancellation request for draft ID: ${draftId}`);
    
    // 1. If in queue, cancel it and reject the promise
    const queuedIndex = this.queue.findIndex(item => item.draftId === draftId);
    if (queuedIndex !== -1) {
      const item = this.queue[queuedIndex];
      item.isCancelled = true;
      item.reject(new Error('Sesi dibatalkan oleh pengguna.'));
      this.queue.splice(queuedIndex, 1);
      this.logger.log(`Draft ID ${draftId} removed from queue.`);
      
      // Update database status
      this.draftsService.update(draftId, { status: 'FAILED' }).catch(() => {});
    }

    // 2. Close active browser if running
    const activeBrowser = this.activeBrowsers.get(draftId);
    if (activeBrowser) {
      this.logger.log(`Closing active browser for draft ID: ${draftId}`);
      activeBrowser.close().catch((err: any) => {
        this.logger.error(`Error closing browser on cancellation: ${err}`);
      });
      this.activeBrowsers.delete(draftId);
    }

    // Complete the subject
    const subject = this.activeSubjects.get(draftId);
    if (subject) {
      subject.complete();
      this.activeSubjects.delete(draftId);
    }
  }

  private async enqueueRequest(
    draftId: string,
    akunOss: string | undefined,
    subject: Subject<AutomationEvent>
  ) {
    const maxSessions = parseInt(process.env.PLAYWRIGHT_MAX_CONCURRENT_SESSIONS || '3', 10);

    if (this.activeSessionsCount < maxSessions) {
      this.activeSessionsCount++;
      // Update status to RUNNING
      await this.draftsService.update(draftId, { status: 'RUNNING' }).catch(() => {});

      this.runPlaywrightAutomation(draftId, akunOss, subject)
        .catch((err) => {
          this.logger.error(`Error running playwright automation for draft ${draftId}: ${err.message}`);
        })
        .finally(() => {
          this.activeSessionsCount--;
          this.processQueue();
        });
    } else {
      // Update status to QUEUED
      await this.draftsService.update(draftId, { status: 'QUEUED' }).catch(() => {});

      const avgDuration = await this.draftsService.getAverageDuration();
      const sessionsAhead = this.activeSessionsCount + this.queue.length;
      const waitSeconds = sessionsAhead * avgDuration;
      const waitMessage = this.formatWaitTime(waitSeconds);

      this.logStep(
        subject,
        1,
        'info',
        `Permintaan Anda telah masuk ke dalam antrean pendaftaran yang aman. Antrean Anda sedang diproses. Estimasi waktu tunggu: ${waitMessage}.`
      );

      new Promise<void>((resolve, reject) => {
        this.queue.push({
          draftId,
          akunOss,
          subject,
          resolve,
          reject,
          isCancelled: false,
        });
      })
        .then(async () => {
          // Update status to RUNNING
          await this.draftsService.update(draftId, { status: 'RUNNING' }).catch(() => {});
          return this.runPlaywrightAutomation(draftId, akunOss, subject);
        })
        .catch((err) => {
          this.logger.error(`Error running queued automation for draft ${draftId}: ${err.message}`);
        })
        .finally(() => {
          this.activeSessionsCount--;
          this.processQueue();
        });
    }
  }

  private processQueue() {
    const maxSessions = parseInt(process.env.PLAYWRIGHT_MAX_CONCURRENT_SESSIONS || '3', 10);
    while (this.activeSessionsCount < maxSessions && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        if (nextTask.isCancelled) {
          continue;
        }
        this.activeSessionsCount++;
        nextTask.resolve();
      }
    }
    // Update estimates for all remaining queued tasks in background
    this.updateQueueEstimates().catch((err) => {
      this.logger.error(`Failed to update queue estimates: ${err.message}`);
    });
  }

  private async updateQueueEstimates() {
    const avgDuration = await this.draftsService.getAverageDuration();

    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];
      if (task.isCancelled) continue;

      const position = i + 1;
      const sessionsAhead = this.activeSessionsCount + i;
      const waitSeconds = sessionsAhead * avgDuration;
      const waitMessage = this.formatWaitTime(waitSeconds);

      this.logStep(
        task.subject,
        1,
        'info',
        `Sesi pendaftaran Anda sedang dalam antrean. Posisi Anda saat ini: #${position}. Estimasi waktu tunggu: ${waitMessage}.`
      );
    }
  }

  private formatWaitTime(seconds: number): string {
    if (seconds <= 0) return 'kurang dari 1 menit';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes === 0) {
      return `${remainingSeconds} detik`;
    } else if (remainingSeconds === 0) {
      return `${minutes} menit`;
    } else {
      return `${minutes} menit ${remainingSeconds} detik`;
    }
  }

  private logStep(
    subject: Subject<AutomationEvent>,
    step: number,
    status: 'info' | 'success' | 'warn' | 'error',
    text: string
  ) {
    const draftId = this.subjectToDraftId.get(subject) || 'unknown';
    const timers = this.executionTimers.get(draftId);
    let timeSuffix = '';

    if (timers) {
      const now = Date.now();
      const totalElapsed = ((now - timers.startTime) / 1000).toFixed(2);
      const diffFromLast = ((now - timers.lastLogTime) / 1000).toFixed(2);

      if (!timers.stepStartTimes.has(step)) {
        // Step transition! The previous step just completed.
        let prevStep = -1;
        for (const k of timers.stepStartTimes.keys()) {
          if (k > prevStep && k < step) {
            prevStep = k;
          }
        }
        if (prevStep !== -1) {
          const prevStartTime = timers.stepStartTimes.get(prevStep)!;
          const prevStepElapsed = ((now - prevStartTime) / 1000).toFixed(2);

          const stepNames: Record<number, string> = {
            1: 'Inisialisasi Portal',
            2: 'Validasi NIK & OTP',
            3: 'Detail Profil & Registrasi',
            4: 'Login & CAPTCHA',
            5: 'Pengelolaan Lokasi Usaha'
          };
          const prevStepName = stepNames[prevStep] || `Langkah ${prevStep}`;

          const completionMsg = `✨ [Selesai] ${prevStepName} berhasil diselesaikan dalam ${prevStepElapsed} detik.`;
          subject.next({ step: prevStep, status: 'success', text: completionMsg });
          this.logger.log(`[Tx: ${draftId}] ${completionMsg}`);
        }
        timers.stepStartTimes.set(step, now);
      }

      const stepStartTime = timers.stepStartTimes.get(step) || now;
      const stepElapsed = ((now - stepStartTime) / 1000).toFixed(2);

      timers.lastLogTime = now;
      timeSuffix = ` (+${diffFromLast}s, Step: ${stepElapsed}s, Total: ${totalElapsed}s)`;
    }

    const richText = `${text}${timeSuffix}`;
    subject.next({ step, status, text: richText });

    const formattedText = `[Tx: ${draftId}] [Step ${step}] [${status.toUpperCase()}] ${richText}`;
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
    const draft = await this.draftsService.findOne(draftId);
    if (!draft) {
      throw new Error(`Data draft dengan ID ${draftId} tidak ditemukan. Silakan isi form wizard terlebih dahulu.`);
    }

    const isRegister = akunOss === 'belum';
    const timerNow = Date.now();
    this.executionTimers.set(draftId, {
      startTime: timerNow,
      lastLogTime: timerNow,
      stepStartTimes: new Map<number, number>([[1, timerNow]])
    });

    let browser: any = null;
    let context: any = null;
    let page: any = null;
    let activeStep = 1;
    let passwordCode = '';

    try {
      // Step 1: Initialize Browser
      const initResult = await this.initializeBrowser(draftId, subject);
      browser = initResult.browser;
      context = initResult.context;
      page = initResult.page;

      if (isRegister) {
        // Step 2: Registration & Verification
        activeStep = 2;
        passwordCode = await this.executeRegistrationSteps(page, draft, draftId, subject);

        // Step 3: Fill Detailed Profile Information (first login triggers the detailed profile form)
        activeStep = 3;
        await this.executeDetailProfileSteps(page, draft, subject);
      }

      // Step 4: Login & Authentication (required before detailed profile can be filled)
      activeStep = 4;
      const jwtToken = await this.executeLoginSteps(page, draft, draftId, passwordCode, subject);


      // Step 5: Kelola Lokasi Usaha
      activeStep = 5;
      await this.executeManageLocationSteps(page, draft, jwtToken, subject);

      // Step 6: Selesai
      activeStep = 6;
      this.logStep(subject, 6, 'success', 'Otomatisasi NIB selesai dengan sukses!');

    } catch (error: any) {
      console.error('Playwright execution error inside runPlaywrightAutomation:', error);
      const errMsg = error.message || String(error);
      this.logStep(subject, activeStep, 'error', `Terjadi kesalahan kritis: ${errMsg}`);
    } finally {
      const timers = this.executionTimers.get(draftId);
      const duration = timers ? Math.round((Date.now() - timers.startTime) / 1000) : 0;
      const finalStatus = activeStep === 6 ? 'COMPLETED' : 'FAILED';

      await this.draftsService.update(draftId, {
        status: finalStatus,
        automationDuration: duration
      }).catch((err) => {
        this.logger.error(`Failed to update draft automation status: ${err.message}`);
      });

      if (page) {
        try {
          const videoPath = await page.video()?.path();
          if (videoPath) {
            this.logger.log(`Otomatisasi selesai. Rekaman disimpan di: ${videoPath}`);
            this.logStep(subject, 5, 'info', `Rekaman otomatisasi disimpan di: ${videoPath}`);
          }
        } catch (videoErr) {
          this.logger.error('Gagal mengambil path video rekaman', videoErr);
        }
      }
      this.activeTokens.delete(draftId);
      this.executionTimers.delete(draftId);
      this.subjectToDraftId.delete(subject);
      this.activeBrowsers.delete(draftId);
      this.activeSubjects.delete(draftId);
      if (browser) {
        await browser.close().catch(() => {});
      }
      subject.complete();
    }
  }

  private async initializeBrowser(
    draftId: string,
    subject: Subject<AutomationEvent>
  ): Promise<{ browser: any; context: any; page: any }> {
    this.logStep(subject, 1, 'info', 'Menginisialisasi browser...');
    const browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
      slowMo: 1000,
    });
    this.activeBrowsers.set(draftId, browser);

    try {
      this.logStep(subject, 1, 'success', 'Browser Chromium headful berhasil diluncurkan.');
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        recordVideo: {
          dir: './recordings',
          size: { width: 1024, height: 768 },
        },
      });
      const page = await context.newPage();
      this.setupNetworkLogging(page, `automation-${draftId}`, draftId);

      this.logStep(subject, 1, 'info', `Membuka alamat resmi portal registrasi: ${process.env.OSS_LOGIN_URL}`);
      try {
        await page.goto(`${process.env.OSS_PORTAL_URL}`, { waitUntil: 'networkidle', timeout: 15000 });
        this.logStep(subject, 2, 'success', 'Portal OSS berhasil dimuat. Jendela browser terbuka.');
      } catch (e) {
        this.logStep(subject, 2, 'warn', 'Koneksi ke oss.go.id lambat. Menjalankan rendering bantuan lokal di browser...');
      }

      await this.logSessionState(page, `automation-${draftId}`, 'Browser Init');

      return { browser, context, page };
    } catch (err) {
      await browser.close();
      throw err;
    }
  }

  private async executeRegistrationSteps(
    page: any,
    draft: any,
    draftId: string,
    subject: Subject<AutomationEvent>
  ): Promise<string> {
    // 0. Open Register Page
    await page.goto(`${process.env.OSS_LOGIN_URL}/register`, { waitUntil: 'networkidle', timeout: 30000 });

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

      const isVerifikasiEnabled = await page.getByRole('button', { name: 'Verifikasi' }).isEnabled().catch(() => false);
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

    const isOtpErrorVisible = await page.getByText(/salah|tidak valid|expired|tidak berlaku|otp/i).isVisible().catch(() => false);
    if (isOtpErrorVisible) {
      const errorMsg = await page.getByText(/salah|tidak valid|expired|tidak berlaku|otp/i).textContent().catch(() => 'Kode OTP tidak valid.');
      this.logStep(subject, 2, 'error', `Pendaftaran GAGAL: Verifikasi OTP gagal di portal OSS: ${errorMsg}`);
      throw new Error(`Verifikasi OTP gagal: ${errorMsg}`);
    }

    await this.logSessionState(page, draftId, 'After OTP Verification');

    // 8. Setting up password
    await page.waitForTimeout(5000);
    this.logStep(subject, 2, 'warn', 'PENTING: Silakan masukkan kata sandi baru Anda di halaman aplikasi.');

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
      const isMismatchVisible = await page.getByText(/tidak sama|tidak sesuai|tidak cocok|konfirmasi/i).isVisible().catch(() => false);
      if (isMismatchVisible) {
        const mismatchText = await page.getByText(/tidak sama|tidak sesuai|tidak cocok|konfirmasi/i).textContent().catch(() => 'Konfirmasi kata sandi tidak cocok.');
        this.logStep(subject, 2, 'error', `Pendaftaran GAGAL: Konfirmasi kata sandi tidak cocok atau ditolak: ${mismatchText.trim()}`);
        throw new Error(`Konfirmasi kata sandi tidak cocok: ${mismatchText.trim()}`);
      }

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
          const grandparent = parent.locator('xpath=..');
          const gHtml = await grandparent.innerHTML().catch(() => '');
          html += ' ' + gHtml;

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

    await this.logSessionState(page, draftId, 'After Password Creation');

    return passwordCode;
  }

  private async executeDetailProfileSteps(
    page: any,
    draft: any,
    subject: Subject<AutomationEvent>
  ): Promise<void> {
    this.logStep(subject, 3, 'info', 'Mengisi detail pelaku usaha...');

    // Trim leading 0, 62 or +62 from the phone number
    let cleanPhone = draft.nomorHp.trim().replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('62')) {
      cleanPhone = cleanPhone.substring(2);
    } else if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }
    this.logStep(subject, 3, 'info', `Mengisi nomor ponsel: ${draft.nomorHp}...`);
    await page.getByRole('textbox', { name: '81x-xxxx-xxxxx' }).click();
    await page.getByRole('textbox', { name: '81x-xxxx-xxxxx' }).fill(cleanPhone);

    this.logStep(subject, 3, 'info', `Mengisi nama pelaku usaha sesuai KTP: ${draft.namaPemilik}...`);
    await page.getByRole('textbox', { name: 'Masukkan nama sesuai KTP' }).click();
    await page.getByRole('textbox', { name: 'Masukkan nama sesuai KTP' }).fill(draft.namaPemilik);

    this.logStep(subject, 3, 'info', `Memilih jenis kelamin: ${draft.jenisKelamin}...`);
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
    this.logStep(subject, 3, 'info', `Mengisi tanggal lahir: ${formattedBirthDate}...`);
    await page.getByRole('textbox', { name: 'dd/mm/yyyy' }).click();
    await page.getByRole('textbox', { name: 'dd/mm/yyyy' }).fill(formattedBirthDate);

    // Fill alamat
    await page.getByRole('textbox', { name: 'Contoh: Jl. RUSA' }).click();
    await page.getByRole('textbox', { name: 'Contoh: Jl. RUSA' }).fill(draft.alamatKtp || draft.alamatUsaha);

    // Search and Select Provinsi
    const cleanProvinsi = (draft.provinsiKtp || draft.provinsi).trim();
    const searchProvinsi = this.getOptimalSearchQuery(cleanProvinsi);
    this.logStep(subject, 3, 'info', `Mencari provinsi KTP: ${cleanProvinsi}...`);

    let provPromise = page.waitForResponse((response: any) =>
      response.url().includes('/provinsi') && (response.status() === 200 || response.status() === 304),
      { timeout: 3000 }
    ).catch(() => null);
    await this.clickAndFillInputResilient(page, 'Pilih provinsi', searchProvinsi);
    await provPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanProvinsi);
    await page.waitForTimeout(200);

    // Trim "Kota" / "Kabupaten" and search using partial "like" match
    const rawKota = draft.kotaKabupatenKtp || draft.kotaKabupaten;
    const cleanKota = rawKota.replace(/kota|kabupaten/gi, '').trim();
    const searchKota = this.getOptimalSearchQuery(cleanKota);
    this.logStep(subject, 3, 'info', `Mencari kabupaten/kota KTP: ${rawKota}...`);

    let kotaPromise = page.waitForResponse((response: any) =>
      response.url().includes('/kota') && (response.status() === 200 || response.status() === 304),
      { timeout: 3000 }
    ).catch(() => null);
    await this.clickAndFillInputResilient(page, 'Pilih kabupaten/kota', searchKota);
    await kotaPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanKota);
    await page.waitForTimeout(200);

    // Search and Select Kecamatan
    const cleanKecamatan = (draft.kecamatanKtp || draft.kecamatan).trim();
    const searchKecamatan = this.getOptimalSearchQuery(cleanKecamatan);
    this.logStep(subject, 3, 'info', `Mencari kecamatan KTP: ${cleanKecamatan}...`);

    let kecPromise = page.waitForResponse((response: any) =>
      response.url().includes('/kecamatan') && (response.status() === 200 || response.status() === 304),
      { timeout: 3000 }
    ).catch(() => null);
    await this.clickAndFillInputResilient(page, 'Pilih kecamatan', searchKecamatan);
    await kecPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanKecamatan);
    await page.waitForTimeout(200);

    // Search and Select Desa / Kelurahan
    const cleanKelurahan = (draft.kelurahanKtp || draft.kelurahan).trim();
    const searchKelurahan = this.getOptimalSearchQuery(cleanKelurahan);
    this.logStep(subject, 3, 'info', `Mencari desa/kelurahan KTP: ${cleanKelurahan}...`);

    let kelPromise = page.waitForResponse((response: any) =>
      response.url().includes('/kelurahan') && (response.status() === 200 || response.status() === 304),
      { timeout: 3000 }
    ).catch(() => null);
    await this.clickAndFillInputResilient(page, 'Pilih desa/kelurahan', searchKelurahan);
    await kelPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanKelurahan);
    await page.waitForTimeout(200);

    this.logStep(subject, 3, 'success', 'Semua data detail pelaku usaha dan lokasi berhasil diisi.');

    // 10. Mencentang checkbox persetujuan
    this.logStep(subject, 3, 'info', 'Mencentang checkbox persetujuan...');
    try {
      await page.getByRole('checkbox', { name: 'Saya setuju dengan Syarat dan' }).click({ force: true });
    } catch (e) {
      await page.getByText('Saya setuju dengan Syarat dan Ketentuan').first().click({ force: true });
    }

    // 11. Mengklik tombol "Daftar" untuk memproses pendaftaran akun...
    const maxRetries = 3;
    let isDukcapilError = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logStep(subject, 3, 'info', `Mengklik tombol "Daftar" untuk memproses pendaftaran akun (Percobaan ${attempt}/${maxRetries})...`);
      await page.getByRole('button', { name: 'Daftar' }).click();

      // Wait 3 seconds to check for Dukcapil connection error after clicking Daftar
      await page.waitForTimeout(3000);

      isDukcapilError = await page.getByText('Gagal tersambung ke sistem dukcapil').first().isVisible().catch(() => false);
      if (isDukcapilError) {
        this.logStep(subject, 3, 'warn', `Terjadi kesalahan: Gagal tersambung ke sistem dukcapil. Menunggu 3 detik sebelum mencoba lagi...`);
        if (attempt < maxRetries) {
          await page.waitForTimeout(3000);
        }
      } else {
        break;
      }
    }

    if (isDukcapilError) {
      this.logStep(subject, 3, 'error', 'Pendaftaran GAGAL: Gagal tersambung ke sistem dukcapil Kementerian Dalam Negeri setelah 3 kali percobaan. Silakan coba beberapa saat lagi.');
      throw new Error('Gagal tersambung ke sistem dukcapil');
    }

    // Wait for Dukcapil NIK/Name match checking API
    this.logStep(subject, 3, 'info', 'Menunggu verifikasi NIK dan Nama Pemilik dengan Dukcapil...');
    await page.waitForTimeout(1000);

    let isKtpMismatch = false;
    try {
      const count = await page.getByText('Data tidak sesuai KTP').count();
      if (count > 0) {
        isKtpMismatch = await page.getByText('Data tidak sesuai KTP').first().isVisible().catch(() => false);
      }
    } catch (e) {
      isKtpMismatch = false;
    }

    if (isKtpMismatch) {
      this.logStep(subject, 3, 'error', 'Pendaftaran GAGAL: Data nama pelaku usaha atau NIK tidak sesuai KTP Dukcapil. Silakan periksa kembali ketikan Anda.');
      throw new Error('Data tidak sesuai KTP');
    }

    this.logStep(subject, 3, 'success', 'Selamat! Registrasi akun OSS Pelaku Usaha telah BERHASIL diselesaikan.');

    await this.logSessionState(page, draft.nik, 'After Detail Profile Submission');

    // Keep open for a bit
    await page.waitForTimeout(10000);
  }

  private async executeLoginSteps(
    page: any,
    draft: any,
    draftId: string,
    passwordCode: string,
    subject: Subject<AutomationEvent>
  ): Promise<string> {
    this.logStep(subject, 4, 'info', 'Menjalankan otomatisasi login ke portal OSS...');

    try {
      await page.goto(`${process.env.OSS_LOGIN_URL}`, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      this.logStep(subject, 4, 'warn', 'Koneksi ke halaman login OSS lambat. Melanjutkan...');
    }

    this.logStep(subject, 4, 'info', 'Mencari kolom input login (Username & Password)...');

    const usernameSelector = 'input[name="username"], input[type="text"], input[placeholder*="Username"], input[placeholder*="Email"], #username';
    const passwordSelector = 'input[name="password"], input[type="password"], input[placeholder*="Sandi"], input[placeholder*="Password"], #password';

    try {
      await page.waitForSelector(usernameSelector, { timeout: 15000 });
    } catch (e) {
      this.logStep(subject, 4, 'error', 'Halaman login tidak dapat dimuat atau input username tidak ditemukan.');
      throw new Error('Halaman login tidak dapat dimuat.');
    }

    // If passwordCode is empty (e.g. direct login without registration), wait for it from frontend
    let finalPassword = passwordCode;
    if (!finalPassword) {
      this.logStep(subject, 4, 'warn', 'PENTING: Silakan masukkan kata sandi akun OSS Anda di halaman aplikasi.');
      const startTimePass = Date.now();
      while (Date.now() - startTimePass < 120000) { // Timeout after 120 seconds
        if (this.activePasswords.has(draftId)) {
          finalPassword = this.activePasswords.get(draftId)!;
          this.activePasswords.delete(draftId);
          break;
        }
        await page.waitForTimeout(500);
      }
    }

    if (!finalPassword) {
      this.logStep(subject, 4, 'error', 'Batas waktu pengisian kata sandi telah habis.');
      throw new Error('Batas waktu pengisian kata sandi telah habis.');
    }

    this.logStep(subject, 4, 'info', `Mengisi kolom Username dengan Email: ${draft.email}...`);
    await page.fill(usernameSelector, draft.email);
    await page.waitForTimeout(500);

    this.logStep(subject, 4, 'info', 'Mengisi kata sandi...');
    await page.fill(passwordSelector, finalPassword);
    await page.waitForTimeout(1000);

    // Check if captcha is visible on the page
    const isCaptchaVisible = await page.locator('input[placeholder*="Captcha"], input[name*="captcha"], #captcha').isVisible().catch(() => false);
    if (isCaptchaVisible) {
      this.logStep(subject, 4, 'warn', 'Keamanan CAPTCHA terdeteksi di portal OSS. Silakan selesaikan CAPTCHA langsung di jendela browser Chrome, lalu klik Masuk.');
      // Wait for the user to complete login manually
      let isLoginConfirmed = false;
      const startTime = Date.now();
      while (Date.now() - startTime < 120000) { // Timeout after 120 seconds
        const currentUrl = page.url();
        if (currentUrl && !currentUrl.includes('/login') && !currentUrl.includes('ui-login.oss.go.id')) {
          isLoginConfirmed = true;
          break;
        }
        if (this.activeOtps.has(draftId)) {
          const statusVal = this.activeOtps.get(draftId);
          this.activeOtps.delete(draftId);
          if (statusVal === 'CONFIRMED') {
            isLoginConfirmed = true;
            break;
          }
        }
        await page.waitForTimeout(1000);
      }
      if (!isLoginConfirmed) {
        this.logStep(subject, 4, 'error', 'Batas waktu penyelesaian login/CAPTCHA habis (120 detik).');
        throw new Error('Batas waktu login habis.');
      }
    } else {
      this.logStep(subject, 4, 'info', 'Mengklik tombol "Masuk"...');
      const loginButtonSelector = 'button[type="button"], button[type="submit"]';
      await page.click(loginButtonSelector);

      // Wait for redirection
      this.logStep(subject, 4, 'info', 'Menunggu pengalihan (redirection) setelah masuk...');
      let isRedirected = false;
      const startTime = Date.now();
      while (Date.now() - startTime < 30000) {
        const currentUrl = page.url();
        if (currentUrl && !currentUrl.includes('/login') && !currentUrl.includes('ui-login.oss.go.id')) {
          isRedirected = true;
          break;
        }
        await page.waitForTimeout(1000);
      }

      if (!isRedirected) {
        // Check for any visible error message on the page related to login failure
        const isLoginErrorVisible = await page.getByText(/salah|tidak valid|expired|tidak terdaftar|sandi/i).isVisible().catch(() => false);
        if (isLoginErrorVisible) {
          const errorMsg = await page.getByText(/salah|tidak valid|expired|tidak terdaftar|sandi/i).textContent().catch(() => 'Username atau Kata Sandi salah.');
          this.logStep(subject, 4, 'error', `Login GAGAL di portal OSS: ${errorMsg.trim()}`);
          throw new Error(`Login gagal: ${errorMsg.trim()}`);
        }

        this.logStep(subject, 4, 'error', 'Login GAGAL: Tidak ada pengalihan setelah tombol masuk diklik (kemungkinan kredensial salah atau CAPTCHA muncul).');
        throw new Error('Login ditolak atau butuh penyelesaian CAPTCHA manual.');
      }
    }

    this.logStep(subject, 4, 'success', 'Login berhasil! Sesi terautentikasi berhasil didirikan.');

    await this.logSessionState(page, draftId, 'After Successful Login');

    this.logStep(subject, 4, 'info', 'Menunggu pemuatan data dashboard perizinan (network idle)...');
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch (e) {
      // Ignore timeout if dashboard remains active
    }
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    let jwtToken = this.activeTokens.get(draftId) || '';
    if (jwtToken) {
      this.activeTokens.delete(draftId);
      this.logger.log(`[Tx: automation-${draftId}] Using captured token from navigation history.`);
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

    this.logStep(subject, 5, 'success', 'Proses otomatisasi selesai! Akun telah berhasil login to portal OSS.');
    return jwtToken;
  }

  private setupNetworkLogging(page: any, txId: string, draftId: string) {
    const context = page.context();
    const requestStartTimes = new Map<any, number>();

    // Log page redirections / navigations for the main page
    page.on('framenavigated', (frame: any) => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        this.logger.log(`[Tx: ${txId}] [Page Redirection/Navigation] Main frame navigated to: ${url}`);
        this.extractAndStoreToken(draftId, url);
      }
    });

    // Capture and log navigation in newly spawned pages/tabs/popups
    context.on('page', (newPage: any) => {
      this.logger.log(`[Tx: ${txId}] [New Tab/Popup opened] URL: ${newPage.url()}`);
      this.extractAndStoreToken(draftId, newPage.url());
      newPage.on('framenavigated', (frame: any) => {
        if (frame === newPage.mainFrame()) {
          const url = frame.url();
          this.logger.log(`[Tx: ${txId}] [Page Redirection/Navigation - Tab] Main frame navigated to: ${url}`);
          this.extractAndStoreToken(draftId, url);
        }
      });
    });

    context.on('request', (request: any) => {
      const type = request.resourceType();
      if (type !== 'xhr' && type !== 'fetch') {
        return;
      }

      requestStartTimes.set(request, Date.now());

      const url = request.url();
      const method = request.method();

      let logMsg = `[Tx: ${txId}] [Network Request] ${method} ${url}`;

      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.search) {
          logMsg += ` | Query Params: ${parsedUrl.search}`;
        }
      } catch (e) {
        // Fallback for invalid URLs
      }

      const postData = request.postData();
      if (postData) {
        logMsg += ` | Payload: ${postData}`;
      }

      this.logger.log(logMsg);
    });

    context.on('response', async (response: any) => {
      const request = response.request();
      const type = request.resourceType();
      if (type !== 'xhr' && type !== 'fetch') {
        return;
      }
      const url = response.url();
      const status = response.status();

      const startTime = requestStartTimes.get(request);
      requestStartTimes.delete(request);
      const duration = startTime ? `${Date.now() - startTime}ms` : 'unknown';

      this.logger.log(`[Tx: ${txId}] [Network Response] ${status} ${url} (took ${duration})`);

      if (url.includes('/ref/') || url.includes('oss.go.id/api') || url.includes('/provinsi') || url.includes('/kota') || url.includes('/kecamatan') || url.includes('/kelurahan')) {
        try {
          if (status >= 200 && status < 300) {
            const text = await response.text();
            const trimmed = text.length > 200 ? text.substring(0, 200) + '...' : text;
            this.logger.log(`[Tx: ${txId}] [Network Response Body] ${trimmed}`);
          }
        } catch (e) {
          // Response body might not be readable or already closed/navigated
        }
      }
    });

    context.on('requestfailed', (request: any) => {
      const type = request.resourceType();
      if (type !== 'xhr' && type !== 'fetch') {
        return;
      }
      requestStartTimes.delete(request);
      this.logger.warn(`[Tx: ${txId}] [Network Request Failed] ${request.method()} ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`);
    });
  }

  private async logSessionState(page: any, txId: string, contextMessage: string): Promise<void> {
    try {
      if (!page || page.isClosed()) return;

      // 1. Log Cookies safely (truncating values to keep credentials confidential)
      const cookies = await page.context().cookies().catch(() => []);
      const cookieNames = cookies.map((c: any) => {
        const val = c.value || '';
        const trimmedVal = val.length > 10 ? val.substring(0, 10) + '...' : val;
        return `${c.name}=${trimmedVal}`;
      }).join(', ');
      this.logger.log(`[Tx: ${txId}] [Session State - Cookies] [${contextMessage}] Active Cookies (${cookies.length}): [${cookieNames || 'none'}]`);

      // 2. Log Local Storage summary
      const localStorageSummary = await page.evaluate(() => {
        try {
          const keys = Object.keys(localStorage);
          const summary: Record<string, string> = {};
          keys.forEach(k => {
            const val = localStorage.getItem(k) || '';
            summary[k] = val.length > 30 ? val.substring(0, 30) + '...' : val;
          });
          return summary;
        } catch (e) {
          return null;
        }
      }).catch(() => null);

      if (localStorageSummary) {
        const lsStr = Object.entries(localStorageSummary).map(([k, v]) => `${k}: ${v}`).join(', ');
        this.logger.log(`[Tx: ${txId}] [Session State - LocalStorage] [${contextMessage}] (${Object.keys(localStorageSummary).length} keys): { ${lsStr || 'empty'} }`);
      }
    } catch (e) {
      // Ignore evaluation errors during page unloads or navigation states
    }
  }

  private async selectOptionRobust(page: any, query: string): Promise<boolean> {
    const normalQuery = query.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Dynamic wait for option elements to load rather than a forced delay
    try {
      await page.getByRole('option').first().waitFor({ state: 'attached', timeout: 3000 });
    } catch (e) {
      // Gracefully continue and let page.getByRole('option') retry dynamically
    }

    const optionElements = page.getByRole('option');

    // Blistering fast single round-trip fetch of all inner texts instead of a sequential loop
    const texts = await optionElements.allInnerTexts().catch(() => []);

    const matchedIndex = texts.findIndex((text: string) => {
      const normalText = text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return normalText.includes(normalQuery) || normalQuery.includes(normalText);
    });

    if (matchedIndex !== -1) {
      try {
        const opt = optionElements.nth(matchedIndex);
        await opt.scrollIntoViewIfNeeded();
        await opt.click({ force: true });
        await page.waitForTimeout(200); // Quick brief wait for UI state commit
        await page.keyboard.press('Escape'); // Close dropdown menu if it remains open
        return true;
      } catch (e) {
        // Fallback to sequential search if element became detached
      }
    }

    // Fallback: Click first visible option
    if (texts.length > 0) {
      try {
        const firstOpt = optionElements.first();
        await firstOpt.scrollIntoViewIfNeeded();
        await firstOpt.click({ force: true });
        await page.waitForTimeout(200);
        await page.keyboard.press('Escape');
        return true;
      } catch (e) {}
    }

    // Ultimate Keyboard fallback: Press ArrowDown and Enter
    try {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
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

    while (Date.now() - startTime < timeoutMs) {
      // Try getByRole locator first
      try {
        const roleLocator = page.getByRole('textbox', { name: selector });
        await roleLocator.waitFor({ state: 'visible', timeout: 1000 });
        const isDisabled = await roleLocator.getAttribute('disabled');
        if (isDisabled === null || isDisabled === 'false') {
          await roleLocator.click({ timeout: 1000 });
          await page.waitForTimeout(200);
          await roleLocator.fill(value);
          return true;
        }
      } catch (e) {
        // Try fallback to getByPlaceholder locator
        try {
          const placeholderLocator = page.getByPlaceholder(selector);
          await placeholderLocator.waitFor({ state: 'visible', timeout: 1000 });
          const isDisabled = await placeholderLocator.getAttribute('disabled');
          if (isDisabled === null || isDisabled === 'false') {
            await placeholderLocator.click({ timeout: 1000 });
            await page.waitForTimeout(200);
            await placeholderLocator.fill(value);
            return true;
          }
        } catch (e2) {
          // Both failed, retry in next loop iteration
        }
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

  private extractAndStoreToken(draftId: string, url: string) {
    if (!url) return;
    try {
      let jwtToken = '';
      const urlObj = new URL(url);
      jwtToken = urlObj.searchParams.get('auth-code') || '';

      if (!jwtToken && urlObj.hash) {
        const hashQueryIndex = urlObj.hash.indexOf('?');
        if (hashQueryIndex !== -1) {
          const hashQuery = urlObj.hash.substring(hashQueryIndex);
          const hashParams = new URLSearchParams(hashQuery);
          jwtToken = hashParams.get('auth-code') || '';
        }
      }

      if (!jwtToken) {
        const match = url.match(/auth-code=([^&]+)/);
        if (match) {
          jwtToken = match[1];
        }
      }

      if (jwtToken) {
        this.activeTokens.set(draftId, jwtToken);
        this.logger.log(`[Tx: automation-${draftId}] [Token Capture] Captured auth-code token successfully.`);
      }
    } catch (err) {
      // Safe fallback
    }
  }


  private async executeManageLocationSteps(
    page: any,
    draft: any,
    jwtAccessToken: string,
    subject: Subject<AutomationEvent>
  ) {
    this.logStep(subject, 5, 'info', 'Memulai pengelolaan lokasi usaha (Step 5)...');

    await page.getByTestId('top-menus').locator('div').filter({ hasText: 'Perizinan Berusaha' }).click();
    await page.getByTestId('desktop-dropdown-panel').getByText('Kelola Usaha').click();
    await page.getByTestId('category-right-panel').getByText('Lokasi Usaha').first().click();

    // wait for redirected page loaded
    await page.waitForURL(/.*\/lokasi-usaha.*/, { waitUntil: 'networkidle', timeout: 15000 });

    // check if there's any popup message, close by clicking "Mengerti"
    const mengertiBtn = page.getByRole('button', { name: /mengerti/i });
    try {
      await mengertiBtn.waitFor({ state: 'visible', timeout: 3000 });
      this.logStep(subject, 5, 'info', 'Menutup popup pemberitahuan...');
      await mengertiBtn.click();
      await page.waitForTimeout(1000);
    } catch (err) {
      // Popup did not appear, proceed normally
    
    }

    await page.getByRole('button', { name: 'Tambah Lokasi' }).click();
    await page.waitForURL(/.*\/lokasi-usaha\/tambah-lokasi.*/, { waitUntil: 'networkidle', timeout: 15000 });

    await page.getByRole('button', { name: 'Tambah Posisi Lokasi' }).click();
    await page.waitForTimeout(2000);

    // wait for matra api
    await page.waitForResponse((response: any) =>
      response.url().includes('/options/matra') && (response.status() === 200 || response.status() === 304),
      { timeout: 3000 }
    ).catch(() => null);

    // Choose location type
    await page.getByRole('radio', { name: 'Darat' }).check();
    await page.getByRole('radio', { name: 'Individual' }).check();
    await page.getByRole('checkbox', { name: 'Permohonan persyaratan dasar' }).check();

    // fill coordinate
    const lat = draft.latitude;
    const lon = draft.longitude;
    const coordinate = `${lat}, ${lon}`;
    this.logStep(subject, 5, 'info', `Mengisi koordinat usaha dari draft: ${coordinate}...`);
    await page.getByRole('combobox', { name: 'Cari alamat...' }).fill(coordinate);

    // get display name
    await page.waitForResponse((response: any) =>
      response.url().includes('nominatim.openstreetmap.org/search') && response.status() === 200 && response.body().includes(lat) && response.body().includes(lon),
      { timeout: 5000 }
    ).catch(() => null);

    // select first suggestion
    await page.getByRole('listbox').getByRole('option').locator('div').first().click();

    // Fill Luas Lahan and Alamat Lengkap
    this.logStep(subject, 5, 'info', `Mengisi Luas Lahan: ${draft.luasTanah || '150'} m²...`);
    await page.getByRole('textbox', { name: 'Luas Lahan' }).click();
    await page.getByRole('textbox', { name: 'Luas Lahan' }).fill(draft.luasTanah || '150');

    this.logStep(subject, 5, 'info', `Mengisi Alamat Lengkap Usaha: ${draft.alamatUsaha}...`);
    await page.getByRole('textbox', { name: 'Alamat lengkap' }).click();
    await page.getByRole('textbox', { name: 'Alamat lengkap' }).fill(draft.alamatUsaha);

    // Select Provinsi
    const cleanProvinsi = (draft.provinsiKtp || draft.provinsi || 'DKI JAKARTA').trim();
    const searchProvinsi = this.getOptimalSearchQuery(cleanProvinsi);
    this.logStep(subject, 5, 'info', `Mencari provinsi usaha: ${cleanProvinsi}...`);

    let provPromise = page.waitForResponse((response: any) =>
      response.url().includes('/provinsi') && (response.status() === 200 || response.status() === 304),
      { timeout: 5000 }
    ).catch(() => null);
    await page.getByRole('combobox', { name: 'Pilih provinsi' }).click();
    await page.getByRole('combobox', { name: 'Pilih provinsi' }).fill(searchProvinsi);
    await provPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanProvinsi);
    await page.waitForTimeout(500);

    // Select Kota/Kabupaten (combobox index 1)
    const rawKota = draft.kotaKabupatenKtp || draft.kotaKabupaten || '';
    const cleanKota = rawKota.replace(/kota|kabupaten/gi, '').trim();
    const searchKota = this.getOptimalSearchQuery(cleanKota);
    this.logStep(subject, 5, 'info', `Mencari kabupaten/kota usaha: ${rawKota}...`);

    let kotaPromise = page.waitForResponse((response: any) =>
      response.url().includes('/kota') && (response.status() === 200 || response.status() === 304),
      { timeout: 5000 }
    ).catch(() => null);
    await page.getByPlaceholder('Kabupaten').locator('input').fill(searchKota);
    await kotaPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanKota);
    await page.waitForTimeout(500);

    // Select Kecamatan (combobox index 2)
    const cleanKecamatan = (draft.kecamatanKtp || draft.kecamatan || '').trim();
    const searchKecamatan = this.getOptimalSearchQuery(cleanKecamatan);
    this.logStep(subject, 5, 'info', `Mencari kecamatan usaha: ${cleanKecamatan}...`);

    let kecPromise = page.waitForResponse((response: any) =>
      response.url().includes('/kecamatan') && (response.status() === 200 || response.status() === 304),
      { timeout: 5000 }
    ).catch(() => null);

    await page.getByPlaceholder('Kecamatan').locator('input').fill(searchKecamatan);
    await kecPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanKecamatan);
    await page.waitForTimeout(500);

    // Select Desa / Kelurahan (combobox index 3)
    const cleanKelurahan = (draft.kelurahanKtp || draft.kelurahan || '').trim();
    const searchKelurahan = this.getOptimalSearchQuery(cleanKelurahan);
    this.logStep(subject, 5, 'info', `Mencari desa/kelurahan usaha: ${cleanKelurahan}...`);

    let kelPromise = page.waitForResponse((response: any) =>
      response.url().includes('/kelurahan') && (response.status() === 200 || response.status() === 304),
      { timeout: 5000 }
    ).catch(() => null);

    await page.getByPlaceholder('Kelurahan').locator('input').fill(searchKelurahan);
    await kelPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanKelurahan);
    await page.waitForTimeout(500);

    // input kode pos
    await page.getByRole('textbox', { name: 'Kode Pos' }).fill(draft.kodePosKtp || draft.kodePos || '');

    // Dynamic Document PDF Generation & Upload
    this.logStep(subject, 5, 'info', 'Menyiapkan dokumen administrasi PDF secara dinamis...');
    const draftId = draft.id || 'draft';
    const npsPath = path.join(process.cwd(), `nps_${draftId}.pdf`);
    const photoPath = path.join(process.cwd(), `foto_lokasi_${draftId}.pdf`);
    let createdNps = false;
    let createdPhoto = false;

    try {
      // 1. Generate NPS PDF
      const npsBuffer = await this.documentsService.generateAdministrationPdf({
        alamatUsaha: draft.alamatUsaha || 'Alamat Usaha',
        latitude: draft.latitude || '-6.2088',
        longitude: draft.longitude || '106.8456',
        luasTanah: draft.luasTanah || '150',
      });
      fs.writeFileSync(npsPath, npsBuffer);
      createdNps = true;
      this.logStep(subject, 5, 'info', 'Dokumen Administrasi PDF berhasil dibuat.');

      // 2. Generate Photo PDF or fallback
      if (draft.fotoLokasi) {
        const photoBuffer = await this.documentsService.convertPhotoToPdf(draft.fotoLokasi);
        fs.writeFileSync(photoPath, photoBuffer);
        createdPhoto = true;
        this.logStep(subject, 5, 'info', 'Dokumen Foto Lokasi PDF berhasil dibuat.');
      } else {
        // Fallback: Copy NPS PDF to photo path
        fs.writeFileSync(photoPath, npsBuffer);
        createdPhoto = true;
        this.logStep(subject, 5, 'info', 'Foto Lokasi tidak ada, menggunakan fallback dokumen administrasi.');
      }

      // Upload files
      this.logStep(subject, 5, 'info', 'Mengunggah dokumen PDF ke portal OSS...');

      const fileInputs = page.locator('input[type="file"]');

      // Setup promises to wait for upload network responses
      const upload1Promise = page.waitForResponse((response: any) =>
        (response.url().includes('/dokumen') || response.url().includes('/file') || response.url().includes('/upload')) &&
        response.status() === 200,
        { timeout: 25000 }
      ).catch(() => null);

      this.logStep(subject, 5, 'info', 'Mengunggah Dokumen Pernyataan Mandiri...');
      await fileInputs.first().setInputFiles(npsPath);
      await upload1Promise;
      await page.waitForTimeout(1000);

      const upload2Promise = page.waitForResponse((response: any) =>
        (response.url().includes('/dokumen') || response.url().includes('/file') || response.url().includes('/upload')) &&
        response.status() === 200,
        { timeout: 25000 }
      ).catch(() => null);

      this.logStep(subject, 5, 'info', 'Mengunggah Foto Lokasi...');
      await fileInputs.last().setInputFiles(photoPath);
      await upload2Promise;
      await page.waitForTimeout(1000);

      // Wait for any loading/progressbar indicator to detach
      this.logStep(subject, 5, 'info', 'Menunggu proses unggah selesai di portal...');
      await page.locator('.v-progress-linear, .v-progress-circular, [role="progressbar"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => null);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(1500);

      this.logStep(subject, 5, 'success', 'Kedua berkas PDF berhasil diunggah.');

    } catch (pdfErr: any) {
      this.logger.error('Gagal memproses/mengunggah dokumen PDF:', pdfErr);
      this.logStep(subject, 5, 'warn', `Peringatan: Gagal memproses berkas PDF otomatis (${pdfErr.message || pdfErr}). Melompati unggah otomatis.`);
    }

    // Check 'Tidak' radio button if it exists
    const tidakRadio = page.getByRole('radio', { name: 'Tidak' });
    if (await tidakRadio.isVisible()) {
      this.logStep(subject, 5, 'info', 'Memilih opsi bangunan "Tidak"...');
      await tidakRadio.check();
      await page.waitForTimeout(500);
    }

    // Save Position Location
    this.logStep(subject, 5, 'info', 'Mengklik tombol "Simpan Posisi Lokasi" untuk mendaftarkan lokasi...');
    await page.getByRole('button', { name: 'Simpan Posisi Lokasi' }).click();
    await page.waitForTimeout(3000);

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
  }
}
