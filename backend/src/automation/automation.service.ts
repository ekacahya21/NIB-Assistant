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
  data?: any;
}

@Injectable()
export class AutomationService implements OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private readonly userConfirmations = new Subject<string>();
  private readonly activeOtps = new Map<string, string>();
  private readonly activePasswords = new Map<string, string>();
  private readonly cachedPasswords = new Map<string, string>();
  private readonly activeProductInputs = new Map<
    string,
    {
      jenisProdukJasa: string;
      cangkupanProduk: string;
      kapasitas: string;
      satuan: string;
    }
  >();
  private readonly activeParameterInputs = new Map<string, string>();
  private readonly activeTokens = new Map<string, string>();
  private readonly subjectToDraftId = new Map<
    Subject<AutomationEvent>,
    string
  >();
  private readonly executionTimers = new Map<
    string,
    {
      startTime: number;
      lastLogTime: number;
      stepStartTimes: Map<number, number>;
    }
  >();
  private readonly adminEvents = new Subject<any>();
  private readonly draftMetadata = new Map<
    string,
    { namaUsaha: string; namaPemilik: string }
  >();
  private readonly cancelledDrafts = new Set<string>();
  private readonly sessionLogs = new Map<string, Array<any>>();
  private readonly redirectionUrls = new Map<string, string>();
  private readonly kdIzins = new Map<string, string>();

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
    this.logger.log(
      'Shutting down AutomationService. Cleaning up active browsers and streams...',
    );

    // 1. Close all active browsers
    const closePromises: Promise<void>[] = [];
    for (const [draftId, browser] of this.activeBrowsers.entries()) {
      this.logger.log(
        `Closing browser for draft ID during shutdown: ${draftId}`,
      );
      closePromises.push(
        browser.close().catch((err: any) => {
          this.logger.error(
            `Error closing browser for draft ID ${draftId} during shutdown: ${err}`,
          );
        }),
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
        task.reject(
          new Error('Server sedang dimatikan. Sesi otomatisasi dibatalkan.'),
        );
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
    this.cachedPasswords.set(draftId, password);
    this.userConfirmations.next(draftId);
  }

  submitProductInput(
    draftId: string,
    data: {
      jenisProdukJasa: string;
      cangkupanProduk: string;
      kapasitas: string;
      satuan: string;
    },
  ) {
    this.activeProductInputs.set(draftId, data);
    this.userConfirmations.next(draftId);
  }

  submitParameterInput(draftId: string, parameter: string) {
    this.activeParameterInputs.set(draftId, parameter);
    this.userConfirmations.next(draftId);
  }

  // Observable SSE stream for automation status
  getStream(
    draftId: string,
    akunOss?: string,
    sessionId?: string,
  ): Observable<AutomationEvent> {
    return new Observable<AutomationEvent>((subscriber) => {
      // Prevent double session for the same draftId
      if (this.activeSubjects.has(draftId)) {
        subscriber.next({
          step: 1,
          status: 'error',
          text: 'Sesi otomatisasi untuk data ini sudah berjalan atau sedang mengantre.',
        });
        subscriber.complete();
        return;
      }

      const subject = new Subject<AutomationEvent>();
      this.subjectToDraftId.set(subject, draftId);
      this.activeSubjects.set(draftId, subject);

      this.enqueueRequest(draftId, akunOss, subject, sessionId);

      const subscription = subject.subscribe({
        next: (val) => subscriber.next(val),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      return () => {
        this.logger.log(
          `Client disconnected from SSE stream for draft: ${draftId}`,
        );
        subscription.unsubscribe();
        this.cancelStream(draftId);
      };
    });
  }

  getAdminStream(): Observable<any> {
    return this.adminEvents.asObservable();
  }

  cancelStream(draftId: string) {
    this.logger.log(`Received cancellation request for draft ID: ${draftId}`);
    this.cancelledDrafts.add(draftId);

    // 1. If in queue, cancel it and reject the promise
    const queuedIndex = this.queue.findIndex(
      (item) => item.draftId === draftId,
    );
    if (queuedIndex !== -1) {
      const item = this.queue[queuedIndex];
      item.isCancelled = true;
      item.reject(new Error('Sesi dibatalkan oleh pengguna.'));
      this.queue.splice(queuedIndex, 1);
      this.logger.log(`Draft ID ${draftId} removed from queue.`);

      // Update database status
      this.draftsService
        .update(draftId, {
          status: 'FAILED',
          errorMessage: 'Sesi dibatalkan oleh pengguna (di antrean).',
        })
        .catch(() => {});
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
    subject: Subject<AutomationEvent>,
    sessionId?: string,
  ) {
    const maxSessions = parseInt(
      process.env.PLAYWRIGHT_MAX_CONCURRENT_SESSIONS || '3',
      10,
    );

    if (this.activeSessionsCount < maxSessions) {
      this.activeSessionsCount++;
      // Update status to RUNNING
      await this.draftsService
        .update(draftId, { status: 'RUNNING', sessionId })
        .catch(() => {});

      this.runPlaywrightAutomation(draftId, akunOss, subject)
        .catch((err) => {
          this.logger.error(
            `Error running playwright automation for draft ${draftId}: ${err.message}`,
          );
        })
        .finally(() => {
          this.activeSessionsCount--;
          this.processQueue();
        });
    } else {
      // Update status to QUEUED
      await this.draftsService
        .update(draftId, { status: 'QUEUED', sessionId })
        .catch(() => {});

      const avgDuration = await this.draftsService.getAverageDuration();
      const sessionsAhead = this.activeSessionsCount + this.queue.length;
      const waitSeconds = sessionsAhead * avgDuration;
      const waitMessage = this.formatWaitTime(waitSeconds);

      this.logStep(
        subject,
        1,
        'info',
        `Permintaan Anda telah masuk ke dalam antrean pendaftaran yang aman. Antrean Anda sedang diproses. Estimasi waktu tunggu: ${waitMessage}.`,
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
          await this.draftsService
            .update(draftId, { status: 'RUNNING', sessionId })
            .catch(() => {});
          return this.runPlaywrightAutomation(draftId, akunOss, subject);
        })
        .catch((err) => {
          this.logger.error(
            `Error running queued automation for draft ${draftId}: ${err.message}`,
          );
        })
        .finally(() => {
          this.activeSessionsCount--;
          this.processQueue();
        });
    }
  }

  private processQueue() {
    const maxSessions = parseInt(
      process.env.PLAYWRIGHT_MAX_CONCURRENT_SESSIONS || '3',
      10,
    );
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
        `Sesi pendaftaran Anda sedang dalam antrean. Posisi Anda saat ini: #${position}. Estimasi waktu tunggu: ${waitMessage}.`,
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
    text: string,
    data?: any,
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
            5: 'Pengelolaan Lokasi Usaha',
          };
          const prevStepName = stepNames[prevStep] || `Langkah ${prevStep}`;

          const completionMsg = `✨ [Selesai] ${prevStepName} berhasil diselesaikan dalam ${prevStepElapsed} detik.`;
          subject.next({
            step: prevStep,
            status: 'success',
            text: completionMsg,
          });
          this.logger.log(`[Tx: ${draftId}] ${completionMsg}`);

          // Record log to session log array
          const logList = this.sessionLogs.get(draftId);
          if (logList) {
            logList.push({
              step: prevStep,
              status: 'success',
              text: completionMsg,
              timestamp: new Date().toISOString(),
            });
          }

          // Broadcast step completion to admin stream
          const meta = this.draftMetadata.get(draftId);
          this.adminEvents.next({
            draftId,
            namaUsaha: meta?.namaUsaha || 'DRAF USAHA BARU',
            namaPemilik: meta?.namaPemilik || 'TANPA NAMA',
            step: prevStep,
            status: 'success',
            text: completionMsg,
            timestamp: new Date().toISOString(),
          });
        }
        timers.stepStartTimes.set(step, now);
      }

      const stepStartTime = timers.stepStartTimes.get(step) || now;
      const stepElapsed = ((now - stepStartTime) / 1000).toFixed(2);

      timers.lastLogTime = now;
      timeSuffix = ` (+${diffFromLast}s, Step: ${stepElapsed}s, Total: ${totalElapsed}s)`;
    }

    const richText = `${text}${timeSuffix}`;
    subject.next({ step, status, text: richText, data });

    // Record log to session log array
    const logList = this.sessionLogs.get(draftId);
    if (logList) {
      logList.push({
        step,
        status,
        text: richText,
        timestamp: new Date().toISOString(),
      });
    }

    // Broadcast log update to admin stream
    const meta = this.draftMetadata.get(draftId);
    this.adminEvents.next({
      draftId,
      namaUsaha: meta?.namaUsaha || 'DRAF USAHA BARU',
      namaPemilik: meta?.namaPemilik || 'TANPA NAMA',
      step,
      status,
      text: richText,
      timestamp: new Date().toISOString(),
    });

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
    subject: Subject<AutomationEvent>,
  ): Promise<void> {
    const draft = await this.draftsService.findOne(draftId);
    if (!draft) {
      throw new Error(
        `Data draft dengan ID ${draftId} tidak ditemukan. Silakan isi form wizard terlebih dahulu.`,
      );
    }

    this.draftMetadata.set(draftId, {
      namaUsaha: draft.namaUsaha || 'Draf Usaha Baru',
      namaPemilik: draft.namaPemilik || 'Tanpa Nama',
    });

    this.sessionLogs.set(draftId, []);

    const isRegister = akunOss === 'belum';
    const timerNow = Date.now();
    this.executionTimers.set(draftId, {
      startTime: timerNow,
      lastLogTime: timerNow,
      stepStartTimes: new Map<number, number>([[1, timerNow]]),
    });

    let browser: any = null;
    let context: any = null;
    let page: any = null;
    let activeStep = 1;
    let passwordCode = '';
    let finalErrorMessage: string | null = null;

    // Delete previous recordings if they exist to clear disk space for retry
    const fs = require('fs');
    const path = require('path');
    const recordingsDir = path.resolve('./recordings');
    if (fs.existsSync(recordingsDir)) {
      try {
        const files = fs
          .readdirSync(recordingsDir)
          .filter(
            (f: string) =>
              f.startsWith(`draft_${draftId}_`) && f.endsWith('.webm'),
          );
        for (const file of files) {
          fs.unlinkSync(path.join(recordingsDir, file));
        }
        this.logger.log(
          `Deleted previous recordings for draft ${draftId} before retry.`,
        );
      } catch (err) {
        this.logger.error(`Failed to delete previous recordings: ${err}`);
      }
    }

    try {
      // Step 1: Initialize Browser
      const initResult = await this.initializeBrowser(draftId, subject);
      browser = initResult.browser;
      context = initResult.context;
      page = initResult.page;

      if (isRegister) {
        // Step 2: Registration & Verification
        activeStep = 2;
        passwordCode = await this.executeRegistrationSteps(
          page,
          draft,
          draftId,
          subject,
        );

        // Step 3: Fill Detailed Profile Information (first login triggers the detailed profile form)
        activeStep = 3;
        await this.executeDetailProfileSteps(page, draft, subject);
      }

      // Step 4: Login & Authentication (required before detailed profile can be filled)
      activeStep = 4;
      const jwtToken = await this.executeLoginSteps(
        page,
        draft,
        draftId,
        passwordCode,
        subject,
      );

      // Step 5: Kelola Lokasi Usaha
      activeStep = 5;
      await this.executeManageLocationSteps(page, draft, jwtToken, subject);

      // Step 6: Kelola detail Usaha
      activeStep = 6;
      await this.executeManageBusinessDetailSteps(page, draft, subject);
      // Step 7: Selesai
      activeStep = 7;
      this.logStep(
        subject,
        7,
        'success',
        'Otomatisasi NIB selesai dengan sukses!',
      );
    } catch (error: any) {
      console.error(
        'Playwright execution error inside runPlaywrightAutomation:',
        error,
      );
      const errMsg = error.message || String(error);
      finalErrorMessage = errMsg;
      this.logStep(
        subject,
        activeStep,
        'error',
        `Terjadi kesalahan kritis: ${errMsg}`,
      );
    } finally {
      const timers = this.executionTimers.get(draftId);
      const duration = timers
        ? Math.round((Date.now() - timers.startTime) / 1000)
        : 0;
      const finalStatus =
        activeStep === 7
          ? 'COMPLETED'
          : activeStep > 2
            ? 'FAILED_LATER'
            : 'FAILED';
      const isCancelled = this.cancelledDrafts.has(draftId);
      this.cancelledDrafts.delete(draftId);

      const dbErrorMessage =
        finalStatus === 'COMPLETED'
          ? null
          : isCancelled
            ? 'Sesi dibatalkan oleh pengguna.'
            : finalErrorMessage || 'Terjadi kesalahan tidak dikenal.';

      const logsToSave = this.sessionLogs.get(draftId) || [];
      this.sessionLogs.delete(draftId);

      await this.draftsService
        .update(draftId, {
          status: finalStatus,
          automationDuration: duration,
          errorMessage: dbErrorMessage,
          logs: logsToSave,
        })
        .catch((err) => {
          this.logger.error(
            `Failed to update draft automation status: ${err.message}`,
          );
        });

      let tempVideoPath: string | undefined;
      if (page) {
        try {
          tempVideoPath = await page.video()?.path();
        } catch (videoErr) {
          this.logger.error('Gagal mengambil path video rekaman', videoErr);
        }
      }
      this.activeOtps.delete(draftId);
      this.activePasswords.delete(draftId);
      this.activeProductInputs.delete(draftId);
      this.activeParameterInputs.delete(draftId);
      this.redirectionUrls.delete(draftId);
      this.kdIzins.delete(draftId);
      this.activeTokens.delete(draftId);
      this.executionTimers.delete(draftId);
      this.subjectToDraftId.delete(subject);
      this.activeBrowsers.delete(draftId);
      this.activeSubjects.delete(draftId);
      this.draftMetadata.delete(draftId);
      if (browser) {
        await browser.close().catch(() => {});
      }
      if (tempVideoPath) {
        const fs = require('fs');
        const path = require('path');
        const timestamp = Date.now();
        const targetPath = path.join(
          './recordings',
          `draft_${draftId}_${timestamp}.webm`,
        );
        try {
          if (!fs.existsSync('./recordings')) {
            fs.mkdirSync('./recordings', { recursive: true });
          }
          if (fs.existsSync(tempVideoPath)) {
            fs.renameSync(tempVideoPath, targetPath);
            this.logger.log(
              `Otomatisasi selesai. Rekaman disimpan di: ${targetPath}`,
            );
            this.logStep(
              subject,
              5,
              'info',
              `Rekaman otomatisasi disimpan di: ${targetPath}`,
            );
          }
        } catch (renameErr) {
          this.logger.error(
            `Gagal memindahkan file video rekaman dari ${tempVideoPath} ke ${targetPath}`,
            renameErr,
          );
        }
      }
      subject.complete();
    }
  }

  private async initializeBrowser(
    draftId: string,
    subject: Subject<AutomationEvent>,
  ): Promise<{ browser: any; context: any; page: any }> {
    this.logStep(subject, 1, 'info', 'Menginisialisasi browser...');
    const browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
      slowMo: process.env.PLAYWRIGHT_SLOW_MO ? parseInt(process.env.PLAYWRIGHT_SLOW_MO) : 200,
    });
    this.activeBrowsers.set(draftId, browser);

    try {
      this.logStep(
        subject,
        1,
        'success',
        'Browser Chromium headful berhasil diluncurkan.',
      );
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        recordVideo: {
          dir: './recordings',
          size: { width: 1024, height: 768 },
        },
      });
      const page = await context.newPage();
      this.setupNetworkLogging(page, `automation-${draftId}`, draftId);

      this.logStep(
        subject,
        1,
        'info',
        `Membuka alamat resmi portal registrasi: ${process.env.OSS_LOGIN_URL}`,
      );
      try {
        await page.goto(`${process.env.OSS_PORTAL_URL}`, {
          waitUntil: 'networkidle',
          timeout: 15000,
        });
        this.logStep(
          subject,
          2,
          'success',
          'Portal OSS berhasil dimuat. Jendela browser terbuka.',
        );
      } catch (e) {
        this.logStep(
          subject,
          2,
          'warn',
          'Koneksi ke oss.go.id lambat. Menjalankan rendering bantuan lokal di browser...',
        );
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
    subject: Subject<AutomationEvent>,
  ): Promise<string> {
    // 0. Open Register Page
    await page.goto(`${process.env.OSS_LOGIN_URL}/register`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 1. Fill pelaku usaha dropdown
    await page.waitForTimeout(1000);
    this.logStep(
      subject,
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
    this.logStep(subject, 2, 'info', `Mengisi NIK Pemilik: ${draft.nik}...`);
    await page
      .getByRole('textbox', { name: 'Masukkan 16 digit NIK sesuai' })
      .click();
    await page
      .getByRole('textbox', { name: 'Masukkan 16 digit NIK sesuai' })
      .fill(draft.nik);

    // Wait dynamically for NIK and Email verification status in parallel (up to 15s max, checking every 500ms)
    this.logStep(
      subject,
      2,
      'info',
      `Mengisi Email Pemilik: ${draft.email}...`,
    );
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
        this.logStep(subject, 2, 'success', 'Validasi NIK dan Email sukses.');
        break;
      }

      await page.waitForTimeout(pollIntervalMs);
    }

    if (isNikRegistered) {
      this.logStep(
        subject,
        2,
        'error',
        'Pendaftaran GAGAL: NIK sudah terdaftar di portal OSS. Silakan masuk menggunakan akun terdaftar Anda.',
      );
      throw new Error('NIK sudah terdaftar di portal OSS.');
    }

    if (isEmailRegistered) {
      this.logStep(
        subject,
        2,
        'error',
        'Pendaftaran GAGAL: Email sudah terdaftar di portal OSS. Silakan gunakan email lain atau masuk dengan email terdaftar.',
      );
      throw new Error('Email sudah terdaftar di portal OSS.');
    }

    // 4. Click Verifikasi
    this.logStep(subject, 2, 'info', 'Mengklik tombol "Verifikasi"...');
    await page.getByRole('button', { name: 'Verifikasi' }).click();

    // 5. Prompt OTP
    await page.waitForTimeout(5000);
    this.logStep(
      subject,
      2,
      'warn',
      'PENTING: Silakan buka email Anda, salin kode OTP, dan masukkan kode OTP di halaman aplikasi.',
    );

    // 6. Asynchronous Wait for OTP submitted from Frontend!
    let otpCode = '';
    const startTime = Date.now();
    while (Date.now() - startTime < 120000) {
      // Timeout after 120 seconds
      if (this.activeOtps.has(draftId)) {
        otpCode = this.activeOtps.get(draftId)!;
        this.activeOtps.delete(draftId);
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!otpCode || otpCode.length !== 6) {
      this.logStep(
        subject,
        2,
        'error',
        'Pendaftaran GAGAL: Batas waktu pengisian OTP telah habis (90 detik). Silakan coba lagi.',
      );
      throw new Error('Batas waktu pengisian OTP telah habis.');
    }

    this.logStep(
      subject,
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
      this.logStep(
        subject,
        2,
        'error',
        `Pendaftaran GAGAL: Verifikasi OTP gagal di portal OSS: ${errorMsg}`,
      );
      throw new Error(`Verifikasi OTP gagal: ${errorMsg}`);
    }

    await this.logSessionState(page, draftId, 'After OTP Verification');

    // 8. Setting up password
    await page.waitForTimeout(5000);

    try {
      await page.waitForSelector('input[type="password"]', { timeout: 30000 });
    } catch (e) {
      this.logStep(
        subject,
        2,
        'error',
        'Pendaftaran GAGAL: Form pembuatan kata sandi tidak ditemukan atau verifikasi OTP gagal.',
      );
      throw new Error('Form pembuatan kata sandi tidak ditemukan.');
    }

    // Wait for password submitted from Frontend!
    let passwordCode = '';
    if (this.cachedPasswords.has(draftId)) {
      passwordCode = this.cachedPasswords.get(draftId)!;
    } else {
      this.logStep(
        subject,
        2,
        'warn',
        'PENTING: Silakan masukkan kata sandi baru Anda di halaman aplikasi.',
      );
      const startTimePass = Date.now();
      while (Date.now() - startTimePass < 120000) {
        // Timeout after 120 seconds
        if (this.activePasswords.has(draftId)) {
          passwordCode = this.activePasswords.get(draftId)!;
          this.cachedPasswords.set(draftId, passwordCode);
          this.activePasswords.delete(draftId);
          break;
        }
        await page.waitForTimeout(500);
      }
    }

    if (!passwordCode) {
      this.logStep(
        subject,
        2,
        'error',
        'Pendaftaran GAGAL: Batas waktu pengisian kata sandi telah habis (90 detik).',
      );
      throw new Error('Batas waktu pengisian kata sandi telah habis.');
    }

    // Fill both password inputs (Kata Sandi & Konfirmasi Kata Sandi)
    this.logStep(
      subject,
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
        this.logStep(
          subject,
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
        this.logStep(
          subject,
          2,
          'error',
          `Pendaftaran GAGAL: Kekuatan kata sandi belum terpenuhi. Kriteria yang gagal: ${listStr}`,
        );
        throw new Error(`Kekuatan kata sandi belum terpenuhi: ${listStr}`);
      }

      this.logStep(
        subject,
        2,
        'error',
        'Pendaftaran GAGAL: Pembuatan kata sandi ditolak oleh portal OSS (kemungkinan konfirmasi kata sandi tidak cocok).',
      );
      throw new Error(
        'Pembuatan kata sandi ditolak atau konfirmasi tidak cocok.',
      );
    }

    await this.logSessionState(page, draftId, 'After Password Creation');

    return passwordCode;
  }

  private async executeDetailProfileSteps(
    page: any,
    draft: any,
    subject: Subject<AutomationEvent>,
  ): Promise<void> {
    this.logStep(subject, 3, 'info', 'Mengisi detail pelaku usaha...');

    // Trim leading 0, 62 or +62 from the phone number
    let cleanPhone = draft.nomorHp.trim().replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('62')) {
      cleanPhone = cleanPhone.substring(2);
    } else if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }
    this.logStep(
      subject,
      3,
      'info',
      `Mengisi nomor ponsel: ${draft.nomorHp}...`,
    );
    await page.getByRole('textbox', { name: '81x-xxxx-xxxxx' }).click();
    await page
      .getByRole('textbox', { name: '81x-xxxx-xxxxx' })
      .fill(cleanPhone);

    this.logStep(
      subject,
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

    this.logStep(
      subject,
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
    this.logStep(
      subject,
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
    const searchProvinsi = this.getOptimalSearchQuery(cleanProvinsi);
    this.logStep(
      subject,
      3,
      'info',
      `Mencari provinsi KTP: ${cleanProvinsi}...`,
    );

    const provPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/provinsi') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 3000 },
      )
      .catch(() => null);
    await this.clickAndFillInputResilient(
      page,
      'Pilih provinsi',
      searchProvinsi,
    );
    await provPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanProvinsi);
    await page.waitForTimeout(200);

    // Trim "Kota" / "Kabupaten" and search using partial "like" match
    const rawKota = draft.kotaKabupatenKtp || draft.kotaKabupaten;
    const cleanKota = rawKota.replace(/kota|kabupaten/gi, '').trim();
    const searchKota = this.getOptimalSearchQuery(cleanKota);
    this.logStep(
      subject,
      3,
      'info',
      `Mencari kabupaten/kota KTP: ${rawKota}...`,
    );

    const kotaPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/kota') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 3000 },
      )
      .catch(() => null);
    await this.clickAndFillInputResilient(
      page,
      'Pilih kabupaten/kota',
      searchKota,
    );
    await kotaPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanKota);
    await page.waitForTimeout(200);

    // Search and Select Kecamatan
    const cleanKecamatan = (draft.kecamatanKtp || draft.kecamatan).trim();
    const searchKecamatan = this.getOptimalSearchQuery(cleanKecamatan);
    this.logStep(
      subject,
      3,
      'info',
      `Mencari kecamatan KTP: ${cleanKecamatan}...`,
    );

    const kecPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/kecamatan') &&
          (response.status() === 200 || response.status() === 304),
        { timeout: 3000 },
      )
      .catch(() => null);
    await this.clickAndFillInputResilient(
      page,
      'Pilih kecamatan',
      searchKecamatan,
    );
    await kecPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanKecamatan);
    await page.waitForTimeout(200);

    // Search and Select Desa / Kelurahan
    const cleanKelurahan = (draft.kelurahanKtp || draft.kelurahan).trim();
    const searchKelurahan = this.getOptimalSearchQuery(cleanKelurahan);
    this.logStep(
      subject,
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
    await this.clickAndFillInputResilient(
      page,
      'Pilih desa/kelurahan',
      searchKelurahan,
    );
    await kelPromise;
    await page.waitForTimeout(200);
    await this.selectOptionRobust(page, cleanKelurahan);
    await page.waitForTimeout(200);

    this.logStep(
      subject,
      3,
      'success',
      'Semua data detail pelaku usaha dan lokasi berhasil diisi.',
    );

    // 10. Mencentang checkbox persetujuan
    this.logStep(subject, 3, 'info', 'Mencentang checkbox persetujuan...');
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

    // 11. Mengklik tombol "Daftar" untuk memproses pendaftaran akun...
    const maxRetries = 3;
    let isDukcapilError = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logStep(
        subject,
        3,
        'info',
        `Mengklik tombol "Daftar" untuk memproses pendaftaran akun (Percobaan ${attempt}/${maxRetries})...`,
      );
      await page.getByRole('button', { name: 'Daftar' }).click();

      // Wait 3 seconds to check for Dukcapil connection error after clicking Daftar
      await page.waitForTimeout(3000);

      isDukcapilError = await page
        .getByText('Gagal tersambung ke sistem dukcapil')
        .first()
        .isVisible()
        .catch(() => false);
      if (isDukcapilError) {
        this.logStep(
          subject,
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
      this.logStep(
        subject,
        3,
        'error',
        'Pendaftaran GAGAL: Gagal tersambung ke sistem dukcapil Kementerian Dalam Negeri setelah 3 kali percobaan. Silakan coba beberapa saat lagi.',
      );
      throw new Error('Gagal tersambung ke sistem dukcapil');
    }

    // Wait for Dukcapil NIK/Name match checking API
    this.logStep(
      subject,
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
      this.logStep(
        subject,
        3,
        'error',
        'Pendaftaran GAGAL: Data nama pelaku usaha atau NIK tidak sesuai KTP Dukcapil. Silakan periksa kembali ketikan Anda.',
      );
      throw new Error('Data tidak sesuai KTP');
    }

    this.logStep(
      subject,
      3,
      'success',
      'Selamat! Registrasi akun OSS Pelaku Usaha telah BERHASIL diselesaikan.',
    );

    await this.logSessionState(
      page,
      draft.nik,
      'After Detail Profile Submission',
    );

    // Keep open for a bit
    await page.waitForTimeout(10000);
  }

  private async executeLoginSteps(
    page: any,
    draft: any,
    draftId: string,
    passwordCode: string,
    subject: Subject<AutomationEvent>,
  ): Promise<string> {
    this.logStep(
      subject,
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
      this.logStep(
        subject,
        4,
        'warn',
        'Koneksi ke halaman login OSS lambat. Melanjutkan...',
      );
    }

    this.logStep(
      subject,
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
      this.logStep(
        subject,
        4,
        'error',
        'Halaman login tidak dapat dimuat atau input username tidak ditemukan.',
      );
      throw new Error('Halaman login tidak dapat dimuat.');
    }

    // If passwordCode is empty (e.g. direct login without registration), wait for it from frontend
    let finalPassword = passwordCode;
    if (!finalPassword) {
      if (this.cachedPasswords.has(draftId)) {
        finalPassword = this.cachedPasswords.get(draftId)!;
      } else {
        this.logStep(
          subject,
          4,
          'warn',
          'PENTING: Silakan masukkan kata sandi akun OSS Anda di halaman aplikasi.',
        );
        const startTimePass = Date.now();
        while (Date.now() - startTimePass < 120000) {
          // Timeout after 120 seconds
          if (this.activePasswords.has(draftId)) {
            finalPassword = this.activePasswords.get(draftId)!;
            this.cachedPasswords.set(draftId, finalPassword);
            this.activePasswords.delete(draftId);
            break;
          }
          await page.waitForTimeout(500);
        }
      }
    }

    if (!finalPassword) {
      this.logStep(
        subject,
        4,
        'error',
        'Batas waktu pengisian kata sandi telah habis.',
      );
      throw new Error('Batas waktu pengisian kata sandi telah habis.');
    }

    this.logStep(
      subject,
      4,
      'info',
      `Mengisi kolom Username dengan Email: ${draft.email}...`,
    );
    await page.fill(usernameSelector, draft.email);
    await page.waitForTimeout(500);

    this.logStep(subject, 4, 'info', 'Mengisi kata sandi...');
    await page.fill(passwordSelector, finalPassword);
    await page.waitForTimeout(1000);

    // Check if captcha is visible on the page
    const isCaptchaVisible = await page
      .locator(
        'input[placeholder*="Captcha"], input[name*="captcha"], #captcha',
      )
      .isVisible()
      .catch(() => false);
    if (isCaptchaVisible) {
      this.logStep(
        subject,
        4,
        'warn',
        'Keamanan CAPTCHA terdeteksi di portal OSS. Silakan selesaikan CAPTCHA langsung di jendela browser Chrome, lalu klik Masuk.',
      );
      // Wait for the user to complete login manually
      let isLoginConfirmed = false;
      const startTime = Date.now();
      while (Date.now() - startTime < 120000) {
        // Timeout after 120 seconds
        const currentUrl = page.url();
        if (
          currentUrl &&
          !currentUrl.includes('/login') &&
          !currentUrl.includes('ui-login.oss.go.id')
        ) {
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
        this.logStep(
          subject,
          4,
          'error',
          'Batas waktu penyelesaian login/CAPTCHA habis (120 detik).',
        );
        throw new Error('Batas waktu login habis.');
      }
    } else {
      this.logStep(subject, 4, 'info', 'Mengklik tombol "Masuk"...');
      const loginButtonSelector =
        'button[type="button"], button[type="submit"]';
      await page.click(loginButtonSelector);

      // Wait for redirection
      this.logStep(
        subject,
        4,
        'info',
        'Menunggu pengalihan (redirection) setelah masuk...',
      );
      let isRedirected = false;
      const startTime = Date.now();
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
          const errorMsg = await errorLocator
            .textContent()
            .catch(() => 'Username atau Kata Sandi salah.');
          this.logStep(
            subject,
            4,
            'error',
            `Login GAGAL di portal OSS: ${errorMsg.trim()}`,
          );
          throw new Error(`Login gagal: ${errorMsg.trim()}`);
        }

        await page.waitForTimeout(1000);
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
          this.logStep(
            subject,
            4,
            'error',
            `Login GAGAL di portal OSS: ${errorMsg.trim()}`,
          );
          throw new Error(`Login gagal: ${errorMsg.trim()}`);
        }

        this.logStep(
          subject,
          4,
          'error',
          'Login GAGAL: Tidak ada pengalihan setelah tombol masuk diklik (kemungkinan kredensial salah atau CAPTCHA muncul).',
        );
        throw new Error(
          'Login ditolak atau butuh penyelesaian CAPTCHA manual.',
        );
      }
    }

    this.logStep(
      subject,
      4,
      'success',
      'Login berhasil! Sesi terautentikasi berhasil didirikan.',
    );

    await this.logSessionState(page, draftId, 'After Successful Login');

    this.logStep(
      subject,
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

    const currentUrl = page.url();
    let jwtToken = this.activeTokens.get(draftId) || '';
    if (jwtToken) {
      this.activeTokens.delete(draftId);
      this.logger.log(
        `[Tx: automation-${draftId}] Using captured token from navigation history.`,
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

    this.logStep(
      subject,
      5,
      'success',
      'Proses otomatisasi selesai! Akun telah berhasil login to portal OSS.',
    );
    return jwtToken;
  }

  private setupNetworkLogging(page: any, txId: string, draftId: string) {
    const context = page.context();
    const requestStartTimes = new Map<any, number>();

    // Log page redirections / navigations for the main page
    page.on('framenavigated', (frame: any) => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        this.logger.log(
          `[Tx: ${txId}] [Page Redirection/Navigation] Main frame navigated to: ${url}`,
        );
        this.extractAndStoreToken(draftId, url);
      }
    });

    // Capture and log navigation in newly spawned pages/tabs/popups
    context.on('page', (newPage: any) => {
      this.logger.log(
        `[Tx: ${txId}] [New Tab/Popup opened] URL: ${newPage.url()}`,
      );
      this.extractAndStoreToken(draftId, newPage.url());
      newPage.on('framenavigated', (frame: any) => {
        if (frame === newPage.mainFrame()) {
          const url = frame.url();
          this.logger.log(
            `[Tx: ${txId}] [Page Redirection/Navigation - Tab] Main frame navigated to: ${url}`,
          );
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

      this.logger.log(
        `[Tx: ${txId}] [Network Response] ${status} ${url} (took ${duration})`,
      );

      if (
        url.includes('/ref/') ||
        url.includes('oss.go.id/api') ||
        url.includes('/provinsi') ||
        url.includes('/kota') ||
        url.includes('/kecamatan') ||
        url.includes('/kelurahan')
      ) {
        try {
          if (status >= 200 && status < 300) {
            const text = await response.text();
            const trimmed =
              text.length > 200 ? text.substring(0, 200) + '...' : text;
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
      this.logger.warn(
        `[Tx: ${txId}] [Network Request Failed] ${request.method()} ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`,
      );
    });
  }

  private async logSessionState(
    page: any,
    txId: string,
    contextMessage: string,
  ): Promise<void> {
    try {
      if (!page || page.isClosed()) return;

      // 1. Log Cookies safely (truncating values to keep credentials confidential)
      const cookies = await page
        .context()
        .cookies()
        .catch(() => []);
      const cookieNames = cookies
        .map((c: any) => {
          const val = c.value || '';
          const trimmedVal =
            val.length > 10 ? val.substring(0, 10) + '...' : val;
          return `${c.name}=${trimmedVal}`;
        })
        .join(', ');
      this.logger.log(
        `[Tx: ${txId}] [Session State - Cookies] [${contextMessage}] Active Cookies (${cookies.length}): [${cookieNames || 'none'}]`,
      );

      // 2. Log Local Storage summary
      const localStorageSummary = await page
        .evaluate(() => {
          try {
            const keys = Object.keys(localStorage);
            const summary: Record<string, string> = {};
            keys.forEach((k) => {
              const val = localStorage.getItem(k) || '';
              summary[k] = val.length > 30 ? val.substring(0, 30) + '...' : val;
            });
            return summary;
          } catch (e) {
            return null;
          }
        })
        .catch(() => null);

      if (localStorageSummary) {
        const lsStr = Object.entries(localStorageSummary)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        this.logger.log(
          `[Tx: ${txId}] [Session State - LocalStorage] [${contextMessage}] (${Object.keys(localStorageSummary).length} keys): { ${lsStr || 'empty'} }`,
        );
      }
    } catch (e) {
      // Ignore evaluation errors during page unloads or navigation states
    }
  }

  private async selectOptionRobust(page: any, query: string): Promise<boolean> {
    const normalQuery = query.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Dynamic wait for option elements to load rather than a forced delay
    try {
      await page
        .getByRole('option')
        .first()
        .waitFor({ state: 'attached', timeout: 3000 });
    } catch (e) {
      // Gracefully continue and let page.getByRole('option') retry dynamically
    }

    const optionElements = page.getByRole('option');

    // Blistering fast single round-trip fetch of all inner texts instead of a sequential loop
    const texts = await optionElements.allInnerTexts().catch(() => []);

    const matchedIndex = texts.findIndex((text: string) => {
      const normalText = text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return (
        normalText.includes(normalQuery) || normalQuery.includes(normalText)
      );
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

  private async waitForInputEnabled(
    page: any,
    selector: string,
    timeoutMs = 15000,
  ): Promise<boolean> {
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

  private async clickAndFillInputResilient(
    page: any,
    selector: string,
    value: string,
    timeoutMs = 15000,
  ): Promise<boolean> {
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
    throw new Error(
      `Gagal mengisi kolom "${selector}" karena kolom tetap dinonaktifkan (disabled) atau tidak dapat diklik.`,
    );
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
        this.logger.log(
          `[Tx: automation-${draftId}] [Token Capture] Captured auth-code token successfully.`,
        );
      }
    } catch (err) {
      // Safe fallback
    }
  }

  private async dismissPopupIfVisible(
    page: any,
    subject: Subject<AutomationEvent>,
    step: number,
    timeoutMs = 3000,
  ): Promise<void> {
    try {
      const mengertiBtn = page.getByRole('button', { name: /mengerti/i });
      await mengertiBtn.waitFor({ state: 'visible', timeout: timeoutMs });
      this.logStep(subject, step, 'info', 'Menutup popup pemberitahuan...');
      await mengertiBtn.click();
      await page.waitForTimeout(1000);
    } catch (err) {
      // Popup did not appear, proceed normally
    }
  }

  private async executeManageLocationSteps(
    page: any,
    draft: any,
    jwtAccessToken: string,
    subject: Subject<AutomationEvent>,
  ) {
    this.logStep(
      subject,
      5,
      'info',
      'Memulai pengelolaan lokasi usaha (Step 5)...',
    );

    // pilih menu kelola lokasi usaha
    await page
      .getByTestId('top-menus')
      .locator('div')
      .filter({ hasText: 'Perizinan Berusaha' })
      .click();
    await page
      .getByTestId('desktop-dropdown-panel')
      .getByText('Kelola Usaha')
      .click();
    await page
      .getByTestId('category-right-panel')
      .getByText('Lokasi Usaha')
      .first()
      .click();

    // wait for redirected page loaded
    await page.waitForURL(/.*\/lokasi-usaha.*/, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    // check if there's any popup message, close by clicking "Mengerti"
    await this.dismissPopupIfVisible(page, subject, 5);

    await page.getByRole('button', { name: 'Tambah Lokasi' }).click();
    await page.waitForURL(/.*\/lokasi-usaha\/tambah-lokasi.*/, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    await page.getByRole('button', { name: 'Tambah Posisi Lokasi' }).click();
    await page.waitForTimeout(2000);

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
    this.logStep(
      subject,
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
    this.logStep(
      subject,
      5,
      'info',
      `Mengisi Luas Lahan: ${draft.luasTanah || '150'} m²...`,
    );
    await page.getByRole('textbox', { name: 'Luas Lahan' }).click();
    await page
      .getByRole('textbox', { name: 'Luas Lahan' })
      .fill(draft.luasTanah || '150');

    this.logStep(
      subject,
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
    const searchProvinsi = this.getOptimalSearchQuery(cleanProvinsi);
    this.logStep(
      subject,
      5,
      'info',
      `Mencari provinsi usaha: ${cleanProvinsi}...`,
    );

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
    await this.selectOptionRobust(page, cleanProvinsi);
    await page.waitForTimeout(200);

    // Select Kota/Kabupaten (combobox index 1)
    const rawKota = draft.kotaKabupaten || draft.kotaKabupatenKtp;
    const cleanKota = rawKota.replace(/kota|kabupaten/gi, '').trim();
    const searchKota = this.getOptimalSearchQuery(cleanKota);
    this.logStep(
      subject,
      5,
      'info',
      `Mencari kabupaten/kota usaha: ${rawKota}...`,
    );

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
    await this.selectOptionRobust(page, cleanKota);
    await page.waitForTimeout(200);

    // Select Kecamatan (combobox index 2)
    const cleanKecamatan = (draft.kecamatan || draft.kecamatanKtp).trim();
    const searchKecamatan = this.getOptimalSearchQuery(cleanKecamatan);
    this.logStep(
      subject,
      5,
      'info',
      `Mencari kecamatan usaha: ${cleanKecamatan}...`,
    );

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
    await this.selectOptionRobust(page, cleanKecamatan);
    await page.waitForTimeout(200);

    // Select Desa / Kelurahan (combobox index 3)
    const cleanKelurahan = (draft.kelurahan || draft.kelurahanKtp).trim();
    const searchKelurahan = this.getOptimalSearchQuery(cleanKelurahan);
    this.logStep(
      subject,
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
    await this.selectOptionRobust(page, cleanKelurahan);
    await page.waitForTimeout(200);

    // input kode pos
    await page
      .getByRole('textbox', { name: 'Kode Pos' })
      .fill(draft.kodePos || draft.kodePosKtp || '');

    // Dynamic Document PDF Generation & Upload
    this.logStep(
      subject,
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
      this.logStep(
        subject,
        5,
        'info',
        'Dokumen Administrasi PDF berhasil dibuat.',
      );

      // 2. Generate Photo PDF or fallback
      if (draft.fotoLokasi) {
        const photoBuffer = await this.documentsService.convertPhotoToPdf(
          draft.fotoLokasi,
        );
        fs.writeFileSync(photoPath, photoBuffer);
        createdPhoto = true;
        this.logStep(
          subject,
          5,
          'info',
          'Dokumen Foto Lokasi PDF berhasil dibuat.',
        );
      } else {
        // Fallback: Copy NPS PDF to photo path
        fs.writeFileSync(photoPath, npsBuffer);
        createdPhoto = true;
        this.logStep(
          subject,
          5,
          'info',
          'Foto Lokasi tidak ada, menggunakan fallback dokumen administrasi.',
        );
      }

      // Upload files
      this.logStep(
        subject,
        5,
        'info',
        'Mengunggah dokumen PDF ke portal OSS...',
      );

      const fileInputs = page.locator('input[type="file"]');

      // Setup promises to wait for upload network responses
      const upload1Promise = page
        .waitForResponse(
          (response: any) =>
            (response.url().includes('/dokumen') ||
              response.url().includes('/file') ||
              response.url().includes('/upload')) &&
            response.status() === 200,
          { timeout: 25000 },
        )
        .catch(() => null);

      this.logStep(
        subject,
        5,
        'info',
        'Mengunggah Dokumen Administrasi Lokasi...',
      );
      await fileInputs.first().setInputFiles(npsPath);
      await upload1Promise;
      await page.waitForTimeout(1000);

      const upload2Promise = page
        .waitForResponse(
          (response: any) =>
            (response.url().includes('/dokumen') ||
              response.url().includes('/file') ||
              response.url().includes('/upload')) &&
            response.status() === 200,
          { timeout: 25000 },
        )
        .catch(() => null);

      this.logStep(subject, 5, 'info', 'Mengunggah Foto Lokasi...');
      await fileInputs.last().setInputFiles(photoPath);
      await upload2Promise;
      await page.waitForTimeout(1000);

      // Wait for any loading/progressbar indicator to detach
      this.logStep(
        subject,
        5,
        'info',
        'Menunggu proses unggah selesai di portal...',
      );
      await page
        .locator(
          '.v-progress-linear, .v-progress-circular, [role="progressbar"]',
        )
        .waitFor({ state: 'detached', timeout: 10000 })
        .catch(() => null);
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => null);
      await page.waitForTimeout(1500);

      this.logStep(
        subject,
        5,
        'success',
        'Kedua berkas PDF berhasil diunggah.',
      );
    } catch (pdfErr: any) {
      this.logger.error('Gagal memproses/mengunggah dokumen PDF:', pdfErr);
      this.logStep(
        subject,
        5,
        'warn',
        `Peringatan: Gagal memproses berkas PDF otomatis (${pdfErr.message || pdfErr}). Melompati unggah otomatis.`,
      );
    }

    // Check Pertanyaan apakah proyek PSN 'Tidak' radio button if it exists
    const tidakRadio = page.getByRole('radio', { name: 'Tidak' });
    if (await tidakRadio.isVisible()) {
      await tidakRadio.check();
      await page.waitForTimeout(500);
    }

    // Save Position Location
    this.logStep(
      subject,
      5,
      'info',
      'Mengklik tombol "Simpan Posisi Lokasi" untuk mendaftarkan lokasi...',
    );
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

  private async executeManageBusinessDetailSteps(
    page: any,
    draft: any,
    subject: Subject<AutomationEvent>,
  ) {
    const draftId = draft.id;
    this.logStep(
      subject,
      6,
      'info',
      'Memulai pengelolaan detail usaha (Step 5)...',
    );

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

    this.logStep(subject, 6, 'info', 'Memilih KBLI...');
    await page.getByRole('button', { name: 'Selanjutnya' }).click();
    await getListKbliPromise;
    await page.waitForTimeout(1000);

    // select jenis kegiatan usaha
    await page
      .getByPlaceholder('Pilih jenis kegiatan usaha')
      .locator('input')
      .click();
    await page.getByText('Kegiatan Usaha Utama').click();

    // check if there's any popup message, close by clicking "Mengerti"
    await this.dismissPopupIfVisible(page, subject, 6);

    // choose kbli
    const searchKbli = this.getOptimalSearchQuery(draft.kbliCode);
    this.logStep(
      subject,
      6,
      'info',
      `Mencari kegiatan usaha: ${draft.kbliCode}...`,
    );
    const kbliSearchInput = page.getByPlaceholder('kode KBLI').locator('input');
    await kbliSearchInput.click();
    await kbliSearchInput.fill(searchKbli);
    const getListKbli2025Promise = page
      .waitForResponse(
        (response: any) => {
          const matches = response.url().includes('/getListKBLI') && response.status() === 200;
          if (!matches) return false;
          const postData = response.request().postData();
          return !!(postData && postData.includes('kbli_2020'));
        },
        { timeout: 20000 },
      )
      .catch(() => null);

    await page.getByText(searchKbli).first().click();

    // check if there's any popup message, close by clicking "Mengerti"
    await this.dismissPopupIfVisible(page, subject, 6);
    await page.waitForTimeout(1000);
    const listKbliResponse = await getListKbli2025Promise;

    const kbli2025Select = page.getByTestId('kbli-select').first();
    if (await kbli2025Select.isVisible()) {
      this.logStep(
        subject,
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
        this.logStep(subject, 6, 'warn', 'PILIH_KBLI_2025', {
          options: kbliOptions,
        });

        // Wait up to 120 seconds for user response
        let chosenKbli: string | null = null;
        const startTime = Date.now();
        while (Date.now() - startTime < 120000) {
          if (this.activeParameterInputs.has(draftId)) {
            chosenKbli = this.activeParameterInputs.get(draftId)!;
            this.activeParameterInputs.delete(draftId);
            break;
          }
          await page.waitForTimeout(500);
        }

        if (!chosenKbli) {
          this.logStep(
            subject,
            6,
            'error',
            'Pendaftaran GAGAL: Batas waktu pemilihan KBLI 2025 habis.',
          );
          throw new Error('Batas waktu pemilihan KBLI 2025 habis.');
        }

        const option = kbliOptions.find((o) => o.code === chosenKbli);
        const chosenKbliTitle = option ? option.title : 'KBLI 2025 Terpilih';

        this.logStep(
          subject,
          6,
          'info',
          `Memperbarui database ke KBLI 2025: ${chosenKbli}...`,
        );
        await this.draftsService.update(draftId, {
          kbliCode: chosenKbli,
          kbliTitle: chosenKbliTitle,
        });

        // Select KBLI 2025 in portal
        const selectContainer = kbli2025Select.locator('input');
        await selectContainer.click();
        await page.waitForTimeout(1000);
        await selectContainer.fill(chosenKbli);
        await page.waitForTimeout(1000);

        const optionLocator = page
          .locator('.ant-select-item-option-content')
          .filter({ hasText: chosenKbli })
          .first();
        if (await optionLocator.isVisible()) {
          await optionLocator.click();
        } else {
          await page.getByText(chosenKbli).first().click();
        }
        await page.waitForTimeout(1000);
      }
    }

    this.logStep(subject, 6, 'info', 'Memilih ruang lingkup kegiatan...');
    await page
      .getByRole('combobox', { name: 'Pilih ruang lingkup kegiatan' })
      .click();

    // check if 'Seluruh' ruang lingkup is exists, then click it
    const seluruhRuangLingkup = page.getByText('Seluruh');
    if (await seluruhRuangLingkup.isVisible()) {
      await seluruhRuangLingkup.click();
      await page.waitForTimeout(1000);
    }

    // select bidang usaha
    const bidangUsaha = page.getByTestId('radio-bidang-usaha');
    if (await bidangUsaha.isVisible()) {
      await bidangUsaha.getByRole('radio').first().click();
      await page.waitForTimeout(1000);
    }

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
    await page.waitForTimeout(1000);

    await page
      .getByRole('textbox', { name: 'Contoh : Restoran' })
      .fill(draft.namaUsaha);
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
    await page.waitForTimeout(1000);

    // check for pernyataan mandiri
    this.logStep(subject, 6, 'info', 'Menyetujui pernyataan mandiri...');
    await page.getByText('Saya menyatakan pemberian ini').click();

    // click tombol proses
    await page.getByRole('button', { name: 'Proses' }).click();

    // process
    this.logStep(subject, 6, 'info', 'Memproses...');
    await page
      .getByTestId('modal-proses')
      .getByRole('button', { name: 'Proses' })
      .click();

    // wait for submitPernyataanMandiri
    this.logStep(subject, 6, 'info', 'Menunggu submitPernyataanMandiri...');
    const submitPernyataanMandiriPromise = page
      .waitForResponse(
        (response: any) =>
          response.url().includes('/submitPernyataanMandiri') &&
          response.status() === 200,
        { timeout: 25000 },
      )
      .catch(() => null);
    await submitPernyataanMandiriPromise;
    await page.waitForTimeout(1000);

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
    await page.waitForTimeout(1000);

    // click lanjut to navigate to 'Perizinan Berusaha'
    await page.getByRole('tab', { name: 'Perizinan Berusaha' }).click();
    await page.getByRole('button', { name: 'Lanjut' }).click();

    // Apakah kegiatan usaha ini sudah berjalan?
    const isRunning = draft.sudahBerjalan === 'sudah';
    const runningOptionText = isRunning ? 'Sudah Berjalan' : 'Belum Berjalan';
    this.logStep(
      subject,
      6,
      'info',
      `Mengisi status berjalan: ${runningOptionText}`,
    );
    const runningCombobox = page
      .getByTestId('select-box-flag-berjalan')
      .first();

    // Wait up to 60s for the page to load and the combobox to be visible
    await runningCombobox
      .waitFor({ state: 'visible', timeout: 60000 })
      .catch(() => null);

    await runningCombobox.click();
    await runningCombobox.locator('input').fill(runningOptionText);
    await page.getByText(runningOptionText, { exact: true }).click();
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

        this.logStep(
          subject,
          6,
          'info',
          `Mengisi tanggal mulai usaha: ${targetDay} ${targetMonth} ${targetYear}`,
        );

        // 1. Click the datepicker trigger
        const container = page.getByTestId('date-time-picker-tgl-berjalan').nth(1);
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

      this.logStep(
        subject,
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

      // picker locator
      const pickerContainerOp = page.locator('.v-picker');

      // 2. Select Year (e.g. 2020)
      const yearSelectOp = pickerContainerOp
        .locator('button, div, span')
        .filter({ hasText: /^\d{4}$/ })
        .first();
      const currentYearTextOp = await yearSelectOp.innerText().catch(() => '');
      let currentYearOp =
        parseInt(currentYearTextOp) || new Date().getFullYear();

      if (currentYearOp !== targetYear) {
        await yearSelectOp
          .getByTestId('year-btn')
          .click()
          .catch(() => {});
        await page.waitForTimeout(1000);

        let targetYearOptionOp = pickerContainerOp
          .locator('.v-overlay-container, .v-menu, .ant-select-dropdown')
          .locator('div, li, button, span')
          .filter({ hasText: new RegExp(`^${targetYear}$`) })
          .first();

        if (!(await targetYearOptionOp.isVisible())) {
          targetYearOptionOp = pickerContainerOp
            .locator('button, div, li, span')
            .filter({ hasText: new RegExp(`^${targetYear}$`) })
            .first();
        }

        if (await targetYearOptionOp.isVisible()) {
          await targetYearOptionOp.scrollIntoViewIfNeeded().catch(() => {});
          await targetYearOptionOp.click({ force: true });
        } else {
          // Fallback: Click year decrement/increment button next to Year text
          const leftArrowsOp = await pickerContainerOp
            .locator('button, span, i')
            .filter({ hasText: /^(<|chevron_left|left)$/i })
            .all();
          const yearLeftArrowOp = leftArrowsOp[1] || leftArrowsOp[0];
          if (yearLeftArrowOp) {
            while (currentYearOp > targetYear) {
              await yearLeftArrowOp.click().catch(() => {});
              await page.waitForTimeout(200);
              const updatedYearTextOp = await yearSelectOp.innerText();
              currentYearOp = parseInt(updatedYearTextOp) || currentYearOp - 1;
            }
            while (currentYearOp < targetYear) {
              const rightArrowsOp = await pickerContainerOp
                .locator('button, span, i')
                .filter({ hasText: /^(>|chevron_right|right)$/i })
                .all();
              const yearRightArrowOp = rightArrowsOp[1] || rightArrowsOp[0];
              if (yearRightArrowOp) {
                await yearRightArrowOp.click().catch(() => {});
                await page.waitForTimeout(200);
                const updatedYearTextOp = await yearSelectOp.innerText();
                currentYearOp =
                  parseInt(updatedYearTextOp) || currentYearOp + 1;
              } else {
                break;
              }
            }
          }
        }
        await page.waitForTimeout(500);
      }

      // 3. Select Month (e.g. 'Apr')
      const monthSelectOp = pickerContainerOp
        .locator('button, div, span')
        .filter({
          hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/,
        })
        .first();
      const currentMonthTextOp = await monthSelectOp
        .innerText()
        .catch(() => '');
      if (currentMonthTextOp.toLowerCase() !== targetMonth.toLowerCase()) {
        await monthSelectOp.click().catch(() => {});
        await page.waitForTimeout(500);

        const targetMonthOptionOp = pickerContainerOp
          .locator('button, div, span')
          .filter({ hasText: new RegExp(`^${targetMonth}$`, 'i') })
          .first();
        if (await targetMonthOptionOp.isVisible()) {
          await targetMonthOptionOp.click();
        } else {
          // Fallback: Click month decrement button (the 1st left arrow)
          const leftArrowsOp = await pickerContainerOp
            .locator('button, span, i')
            .filter({ hasText: /^(<|chevron_left|left)$/i })
            .all();
          const monthLeftArrowOp = leftArrowsOp[0];
          if (monthLeftArrowOp) {
            let limitOp = 0;
            while (limitOp < 12) {
              const checkTextOp = await monthSelectOp.innerText();
              if (checkTextOp.toLowerCase() === targetMonth.toLowerCase())
                break;
              await monthLeftArrowOp.click();
              await page.waitForTimeout(200);
              limitOp++;
            }
          }
        }
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1000);
    }

    // Input investasi
    const investasiLainVal = draft.modalUsaha || '0';
    this.logStep(
      subject,
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
    this.logStep(
      subject,
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
    this.logStep(
      subject,
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
    this.logStep(
      subject,
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

    // ponytail: fallback to total workers if gender division is not set in old draft records
    if (!maleLaborVal && !femaleLaborVal && draft.jumlahPekerja) {
      maleLaborVal = draft.jumlahPekerja;
      femaleLaborVal = '0';
    }

    maleLaborVal = maleLaborVal || '0';
    femaleLaborVal = femaleLaborVal || '0';

    this.logStep(
      subject,
      6,
      'info',
      `Mengisi pekerja laki laki: ${maleLaborVal}`,
    );
    const maleLaborInput = page
      .getByTestId('laborcard-labor-male')
      .locator('input')
      .first();
    if (await maleLaborInput.isVisible()) {
      await maleLaborInput.fill(maleLaborVal);
      await page.waitForTimeout(500);
    }

    this.logStep(
      subject,
      6,
      'info',
      `Mengisi pekerja perempuan: ${femaleLaborVal}`,
    );
    const femaleLaborInput = page
      .getByTestId('laborcard-labor-female')
      .locator('input')
      .first();
    if (await femaleLaborInput.isVisible()) {
      await femaleLaborInput.fill(femaleLaborVal);
      await page.waitForTimeout(500);
    }

    // Tambah Produk/Jasa
    this.logStep(subject, 6, 'info', 'Membuka modal Tambah Produk/Jasa...');
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
          this.logStep(
            subject,
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
      this.logStep(subject, 6, 'warn', 'MENGISI_RINCIAN_PRODUK', {
        allowedUnits,
      });

      // Wait up to 120 seconds for user response
      let userInput: any = null;
      const startTime = Date.now();
      while (Date.now() - startTime < 120000) {
        if (this.activeProductInputs.has(draftId)) {
          userInput = this.activeProductInputs.get(draftId);
          this.activeProductInputs.delete(draftId);
          break;
        }
        await page.waitForTimeout(500);
      }

      if (!userInput) {
        this.logStep(
          subject,
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
    this.logStep(
      subject,
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
      'input[placeholder="Masukan Cangkupan Produk Fasilitas Berusaha"]',
    );
    if (await coverageCombobox.isVisible()) {
      this.logStep(
        subject,
        6,
        'info',
        `Mengisi Cangkupan Produk: ${productInfo.cangkupanProduk}`,
      );
      await coverageCombobox.click();
      await coverageCombobox.fill(productInfo.cangkupanProduk);
      await page.waitForTimeout(500);

      const option = page
        .getByRole('option', { name: productInfo.cangkupanProduk })
        .first();
      const textOption = page
        .getByText(productInfo.cangkupanProduk, { exact: false })
        .first();
      if (await option.isVisible()) {
        await option.click();
      } else if (await textOption.isVisible()) {
        await textOption.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(1000);
    }

    this.logStep(
      subject,
      6,
      'info',
      `Mengisi Kapasitas: ${productInfo.kapasitas}`,
    );
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
        this.logStep(
          subject,
          6,
          'info',
          `Satuan "${productInfo.satuan}" tidak diizinkan. Menggunakan "${unitToFill}"...`,
        );
      }
    }

    this.logStep(subject, 6, 'info', `Mengisi Satuan: ${unitToFill}`);
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
    this.logStep(subject, 6, 'info', 'Menyimpan data Produk/Jasa...');
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
    this.logStep(
      subject,
      6,
      'info',
      'Mengklik Selanjutnya untuk validasi Risiko Usaha...',
    );
    await page
      .getByRole('button', { name: 'Selanjutnya', exact: true })
      .click();
    await page.waitForTimeout(1000);

    // Check for validation errors on the page
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
          const placeholder = await inputEl.getAttribute('placeholder').catch(() => null);
          const ariaLabel = await inputEl.getAttribute('aria-label').catch(() => null);
          const testIdAttr = await inputEl.getAttribute('data-testid').catch(() => null);
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
        const isInvalidLabel = !labelText || 
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
          // Last resort fallback: check innerText first line if not generic error
          const innerText = await container.innerText().catch(() => '');
          const firstLine = innerText.split('\n')[0]?.trim() || '';
          if (firstLine && firstLine.toLowerCase() !== errorText.toLowerCase() && firstLine.toLowerCase() !== 'wajib diisi') {
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
    // Now find any other error messages not captured inside container errors
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
      this.logStep(subject, 6, 'error', `Pendaftaran GAGAL: ${errorMsg}`);
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
        this.logStep(
          subject,
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
      this.logStep(subject, 6, 'warn', 'MENGISI_PARAMETER_RISIKO', {
        tingkatRisiko: riskInfo?.tingkatRisiko || '',
        skalaUsaha: riskInfo?.skalaUsaha || '',
        jenisPerizinan: riskInfo?.jenisPerizinan || '',
        perizinanTunggal: riskInfo?.perizinanTunggal || false,
        parameterOptions: allowedParameters,
      });

      // Wait up to 120s for user parameter selection
      let selectedParam: string = '';
      const startTime = Date.now();
      while (Date.now() - startTime < 120000) {
        if (this.activeParameterInputs.has(draftId)) {
          selectedParam = this.activeParameterInputs.get(draftId)!;
          this.activeParameterInputs.delete(draftId);
          break;
        }
        await page.waitForTimeout(500);
      }

      if (!selectedParam) {
        this.logStep(
          subject,
          6,
          'error',
          'Pendaftaran GAGAL: Batas waktu pemilihan parameter risiko habis.',
        );
        throw new Error('Batas waktu pemilihan parameter risiko habis.');
      }

      this.logStep(
        subject,
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
        this.logStep(
          subject,
          6,
          'info',
          `Mengklik item list overlay: ${selectedParam}`,
        );
        await page.waitForTimeout(1000);
      }
    }

    // Finally click Selanjutnya to save risk/parameter and complete Step 6
    this.logStep(
      subject,
      6,
      'info',
      'Menyimpan analisis Risiko & Parameter...',
    );
    await page
      .getByRole('button', { name: 'Selanjutnya', exact: true })
      .click({ force: true });
    await page.waitForTimeout(3000);

    this.logStep(subject, 6, 'info', "Memilih 'Belum' memiliki amdal..");
    await page.getByRole('radio', { name: 'Belum' }).check();

    this.logStep(subject, 6, 'info', 'Klik tombol Proses..');
    await page.getByRole('button', { name: 'Proses' }).click();
    await page.waitForTimeout(1500);

    this.logStep(subject, 6, 'info', 'Klik tombol Ya, Lanjut..');
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

    this.logStep(subject, 6, 'info', 'Klik tab Persyaratan Dasar..');
    await page.getByRole('tab', { name: 'Persyaratan Dasar' }).click();

    const btnProsesPenapisan = page.getByRole('button', {
      name: 'Proses Penapisan',
    });
    if (await btnProsesPenapisan.isVisible()) {
      this.logStep(subject, 6, 'info', 'Klik tombol Proses Penapisan..');
      const pageAmdalnet = page.waitForEvent('popup');
      await btnProsesPenapisan.click();
      await page.waitForTimeout(1500);
      const page1 = await pageAmdalnet;

      // Wait for the popup URL to load and redirect away from about:blank
      await page1
        .waitForURL((url: URL) => url.href !== 'about:blank', {
          timeout: 10000,
        })
        .catch(() => null);
      const redirectionUrl = page1.url();
      this.logStep(subject, 6, 'info', `Redirection URL: ${redirectionUrl}`);
      this.redirectionUrls.set(draftId, redirectionUrl);

      const kdIzinMatch = redirectionUrl.match(/[?&]kd_izin=([^&]+)/);
      const kdIzin = kdIzinMatch ? kdIzinMatch[1] : undefined;
      if (kdIzin) {
        this.logStep(subject, 6, 'info', `Parsed kd_izin: ${kdIzin}`);
        this.kdIzins.set(draftId, kdIzin);
      }

      // Close popup tab and navigate the main page instead
      await page1.close().catch(() => null);
      this.logStep(
        subject,
        6,
        'info',
        'Membuka redirection URL pada tab utama...',
      );
      await page.goto(redirectionUrl, {
        waitUntil: 'networkidle',
        timeout: 15000,
      });

      // wait for response list-proyek
      await page
        .waitForResponse(
          (response: any) =>
            response.url().includes('list-proyek') && response.status() === 200,
          { timeout: 15000 },
        )
        .catch(() => null);
      this.logStep(subject, 6, 'info', 'Mendapatkan response list-proyek');

      const proyekScope = page.locator(`#sub-project-card-${kdIzin}`);
      const proyekCheck = proyekScope.locator('.el-checkbox').first();
      if (await proyekCheck.isVisible()) {
        this.logStep(subject, 6, 'info', 'Mencentang checkbox proyek...');
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
        this.logStep(
          subject,
          6,
          'info',
          'Mendapatkan response check-license-status',
        );

        await proyekScope.locator('.el-switch').first().click();
        await page.locator(`#sector-select-${kdIzin}`).click();
        const multiSectorOpt = page.getByText('Multi Sektor');
        if (await multiSectorOpt.isVisible()) {
          await multiSectorOpt.click();
        } else {
          await page.getByRole('listitem').first().click();
        }
      }
    }
  }

  getRedirectionUrl(draftId: string): string | undefined {
    return this.redirectionUrls.get(draftId);
  }

  getKdIzin(draftId: string): string | undefined {
    return this.kdIzins.get(draftId);
  }

  private formatToDDMMYYYY(dateStr?: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  private formatToMMYYYY(dateStr?: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[0]}`;
    } else if (parts.length === 2) {
      return `${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }
}
