import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { chromium } from 'playwright-extra';
import stealthPlugin from '@zorilla/puppeteer-extra-plugin-stealth';
import { DraftsService } from '../drafts/drafts.service';
import { DocumentsService } from '../documents/documents.service';
import * as fs from 'fs';
import * as path from 'path';
import { PortalInteractionHelper } from './services/portal-interaction.helper';
import { RegistrationFlowService } from './services/registration-flow.service';
import { FilingFlowService } from './services/filing-flow.service';
import { AutomationSessionContext } from './context/automation-session.context';
import {
  AutomationSubStep,
  STEP_REGISTRY,
  buildStepDeeplink,
  getNextSubStep,
  isStepCompleted,
} from './config/automation-steps.config';

// Configure Playwright Extra with the stealth evasion plugin globally
chromium.use(stealthPlugin());

export interface AutomationEvent {
  step: number;
  status: 'info' | 'success' | 'warn' | 'error';
  text: string;
  data?: any;
  duration?: number;
}

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
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
  private readonly activeSteps = new Map<string, number>();

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
    phase?: string;
    resumeFromStep?: string;
  }> = [];

  constructor(
    private readonly draftsService: DraftsService,
    private readonly documentsService: DocumentsService,
    private readonly interactionHelper: PortalInteractionHelper,
    private readonly registrationFlowService: RegistrationFlowService,
    private readonly filingFlowService: FilingFlowService,
  ) {}

  async onModuleInit() {
    this.pruneOldRecordings();
  }

  private pruneOldRecordings() {
    const recordingsDir = path.resolve('./recordings');
    if (!fs.existsSync(recordingsDir)) {
      return;
    }

    this.logger.log('Scanning ./recordings directory for cleanup...');
    try {
      const files = fs.readdirSync(recordingsDir);
      const now = Date.now();
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      let prunedCount = 0;

      for (const file of files) {
        if (file.endsWith('.webm') && file.startsWith('draft_')) {
          const filePath = path.join(recordingsDir, file);
          const stats = fs.statSync(filePath);
          const ageMs = now - stats.mtimeMs;

          if (ageMs > maxAgeMs) {
            fs.unlinkSync(filePath);
            prunedCount++;
          }
        }
      }
      if (prunedCount > 0) {
        this.logger.log(
          `Pruned ${prunedCount} video recording files older than 7 days.`,
        );
      } else {
        this.logger.log('No video recording files older than 7 days found.');
      }
    } catch (err: any) {
      this.logger.error(`Error pruning old recordings: ${err.message}`);
    }
  }

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
    phase?: string,
    resumeFromStep?: string,
  ): Observable<AutomationEvent> {
    return new Observable<AutomationEvent>((subscriber) => {
      // Support reconnection to existing session
      if (this.activeSubjects.has(draftId)) {
        this.logger.log(
          `Client reconnecting to existing session for draft: ${draftId}`,
        );
        const subject = this.activeSubjects.get(draftId)!;

        // Replay log history
        const logs = this.sessionLogs.get(draftId) || [];
        for (const log of logs) {
          subscriber.next({
            step: log.step,
            status: log.status,
            text: log.text,
            data: log.data,
          });
        }

        // Subscribe to future events
        const subscription = subject.subscribe({
          next: (val) => subscriber.next(val),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });

        return () => {
          this.logger.log(
            `Client disconnected from reconnected SSE stream for draft: ${draftId}`,
          );
          subscription.unsubscribe();
        };
      }

      const subject = new Subject<AutomationEvent>();
      this.subjectToDraftId.set(subject, draftId);
      this.activeSubjects.set(draftId, subject);

      this.enqueueRequest(draftId, akunOss, subject, sessionId, phase, resumeFromStep);

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
        const currentActiveStep = this.activeSteps.get(draftId) || 1;
        if (phase === 'registration' && currentActiveStep < 3) {
          this.cancelStream(draftId, subject);
        } else {
          this.logger.log(
            `Phase ${phase} for draft ID ${draftId} is at step ${currentActiveStep} and will continue in background.`,
          );
        }
      };
    });
  }

  getAdminStream(): Observable<any> {
    return this.adminEvents.asObservable();
  }

  cancelStream(draftId: string, subject?: Subject<AutomationEvent>) {
    // If a subject is provided, only cancel if it is still the active stream
    if (subject && this.activeSubjects.get(draftId) !== subject) {
      this.logger.log(
        `Ignoring cancellation request for old/finished stream of draft ID: ${draftId}`,
      );
      return;
    }

    this.logger.log(`Received cancellation request for draft ID: ${draftId}`);
    this.cancelledDrafts.add(draftId);
    this.userConfirmations.next(draftId);

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
    const activeSubject = this.activeSubjects.get(draftId);
    if (activeSubject) {
      activeSubject.complete();
      this.activeSubjects.delete(draftId);
    }
  }

  private async enqueueRequest(
    draftId: string,
    akunOss: string | undefined,
    subject: Subject<AutomationEvent>,
    sessionId?: string,
    phase?: string,
    resumeFromStep?: string,
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

      this.runPlaywrightAutomation(draftId, akunOss, subject, phase, resumeFromStep)
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
          phase,
          resumeFromStep,
        });
      })
        .then(async () => {
          // Update status to RUNNING
          await this.draftsService
            .update(draftId, { status: 'RUNNING', sessionId })
            .catch(() => {});
          return this.runPlaywrightAutomation(draftId, akunOss, subject, phase, resumeFromStep);
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
            4: 'Login',
            5: 'Pengelolaan Lokasi Usaha',
          };
          const prevStepName = stepNames[prevStep] || `Langkah ${prevStep}`;

          const completionMsg = `✨ [Selesai] ${prevStepName} berhasil diselesaikan dalam ${prevStepElapsed} detik.`;
          subject.next({
            step: prevStep,
            status: 'success',
            text: completionMsg,
            duration: parseFloat(prevStepElapsed),
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
        data,
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
    phase?: string,
    resumeFromStep?: string,
  ): Promise<void> {
    const draft = await this.draftsService.findOne(draftId);
    if (!draft) {
      throw new Error(
        `Data draft dengan ID ${draftId} tidak ditemukan. Silakan isi form wizard terlebih dahulu.`,
      );
    }

    // ALWAYS clear cancellation flag at the start of a new run to prevent poisoning from previous disconnected streams
    this.cancelledDrafts.delete(draftId);

    this.draftMetadata.set(draftId, {
      namaUsaha: draft.namaUsaha || 'Draf Usaha Baru',
      namaPemilik: draft.namaPemilik || 'Tanpa Nama',
    });

    this.sessionLogs.set(draftId, []);

    const isRegister =
      phase === 'registration' ||
      (phase === undefined &&
        (akunOss === 'belum' || !draft.registrationCompleted));
    const isFiling = phase === 'filing' || phase === undefined;
    const timerNow = Date.now();
    this.executionTimers.set(draftId, {
      startTime: timerNow,
      lastLogTime: timerNow,
      stepStartTimes: new Map<number, number>([[1, timerNow]]),
    });

    let browser: any = null;
    let context: any = null;
    let page: any = null;
    let activeStep = isRegister ? 1 : 4;
    this.activeSteps.set(draftId, activeStep);
    let passwordCode = draft.ossPassword || '';
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
      const sessionCtx: AutomationSessionContext = {
        page: null,
        draft,
        subject,
        akunOss: isRegister ? 'belum' : 'sudah',
        txId: draftId,
        logStep: (step, status, text, data) =>
          this.logStep(subject, step, status, text, data),
        waitForOtp: () =>
          this.waitForUserInput<string>(draftId, this.activeOtps),
        waitForPassword: () =>
          this.waitForUserInput<string>(draftId, this.activePasswords),
        waitForProductInput: () =>
          this.waitForUserInput<any>(draftId, this.activeProductInputs),
        waitForParameterInput: () =>
          this.waitForUserInput<string>(draftId, this.activeParameterInputs),
      };

      // Step 1: Initialize Browser
      if (activeStep === 1) {
        const initResult = await this.initializeBrowser(sessionCtx);
        browser = initResult.browser;
        context = initResult.context;
        page = initResult.page;
        sessionCtx.page = page;
      }

      if (isRegister) {
        // Step 2: Registration & Verification
        activeStep = 2;
        this.activeSteps.set(draftId, activeStep);
        passwordCode =
          await this.registrationFlowService.executeRegistrationSteps(
            sessionCtx,
          );

        // Step 3: Fill Detailed Profile Information
        activeStep = 3;
        this.activeSteps.set(draftId, activeStep);
        await this.registrationFlowService.executeDetailProfileSteps(
          sessionCtx,
        );

        // Save credentials immediately after successful registration
        await this.draftsService.update(draftId, {
          ossPassword: passwordCode,
          registrationCompleted: true,
        });

        this.logStep(
          subject,
          3,
          'success',
          'Pendaftaran akun OSS berhasil! Kredensial telah disimpan dan siap digunakan.',
        );

        if (phase === 'registration') {
          activeStep = 7; // Mark Phase 1 complete
          this.activeSteps.set(draftId, activeStep);
          this.logStep(
            subject,
            7,
            'success',
            'Pendaftaran akun OSS selesai dengan sukses!',
          );
        }
      }

      if (isFiling && activeStep < 7) {
        // If starting directly from filing phase, initialize browser
        if (!page) {
          const initResult = await this.initializeBrowser(sessionCtx);
          browser = initResult.browser;
          context = initResult.context;
          page = initResult.page;
          sessionCtx.page = page;
        }

        // Step 4: Login & Authentication
        activeStep = 4;
        this.activeSteps.set(draftId, activeStep);
        const jwtToken = await this.filingFlowService.executeLoginSteps(
          sessionCtx,
          passwordCode,
        );

        // Retrieve existing checkpoint data
        let checkpointData: Record<string, string> =
          (draft.checkpointData as Record<string, string>) || {};

        // Determine target resume sub-step
        const targetSubStep: AutomationSubStep =
          resumeFromStep && Object.values(AutomationSubStep).includes(resumeFromStep as AutomationSubStep)
            ? (resumeFromStep as AutomationSubStep)
            : getNextSubStep(draft.lastCompletedStep);

        this.logger.log(
          `Filing automation started for draft ${draftId}. Target sub-step: ${targetSubStep}. Existing checkpoint: ${JSON.stringify(checkpointData)}`,
        );

        const saveCheckpoint = async (
          completedSubStep: AutomationSubStep,
          newData?: Record<string, string>,
        ) => {
          if (newData) {
            checkpointData = { ...checkpointData, ...newData };
          }
          draft.lastCompletedStep = completedSubStep;
          draft.checkpointData = { ...checkpointData };

          await this.draftsService
            .update(draftId, {
              lastCompletedStep: completedSubStep,
              checkpointData: { ...checkpointData },
            })
            .catch((err) => {
              this.logger.error(`Failed to update draft checkpoint: ${err.message}`);
            });
        };

        // --- SUB-STEP 1: LOCATION (Step 5) ---
        if (!isStepCompleted(AutomationSubStep.LOCATION, targetSubStep)) {
          activeStep = 5;
          this.activeSteps.set(draftId, activeStep);
          const locationRes = await this.filingFlowService.executeManageLocationSteps(
            sessionCtx,
            jwtToken,
          );
          if (locationRes?.id_proyek_lokasi) {
            checkpointData.id_proyek_lokasi = locationRes.id_proyek_lokasi;
          }
          await saveCheckpoint(AutomationSubStep.LOCATION, checkpointData);
        }

        // --- SUB-STEP 2: KBLI (Step 6) ---
        if (!isStepCompleted(AutomationSubStep.KBLI, targetSubStep)) {
          activeStep = 6;
          this.activeSteps.set(draftId, activeStep);

          if (targetSubStep === AutomationSubStep.KBLI) {
            const deeplink = buildStepDeeplink(AutomationSubStep.KBLI, checkpointData);
            if (deeplink) {
              this.logStep(subject, 6, 'info', `Navigasi via deeplink KBLI: ${deeplink}`);
              await page.goto(deeplink, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
            }
          }

          const kbliRes = await this.filingFlowService.executeKbliSteps(sessionCtx);
          if (kbliRes?.id_proyek) checkpointData.id_proyek = kbliRes.id_proyek;
          if (kbliRes?.id_proyek_lokasi) checkpointData.id_proyek_lokasi = kbliRes.id_proyek_lokasi;
          await saveCheckpoint(AutomationSubStep.KBLI, checkpointData);
        }

        // --- SUB-STEP 3: TATA RUANG ---
        if (!isStepCompleted(AutomationSubStep.TATA_RUANG, targetSubStep)) {
          activeStep = 6;
          this.activeSteps.set(draftId, activeStep);

          if (targetSubStep === AutomationSubStep.TATA_RUANG) {
            const deeplink = buildStepDeeplink(AutomationSubStep.TATA_RUANG, checkpointData);
            if (deeplink) {
              this.logStep(subject, 6, 'info', `Navigasi via deeplink Tata Ruang: ${deeplink}`);
              await page.goto(deeplink, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
            }
          }

          await this.filingFlowService.executeTataRuangSteps(sessionCtx);
          await saveCheckpoint(AutomationSubStep.TATA_RUANG, checkpointData);
        }

        // --- SUB-STEP 4: INVESTASI & PRODUK ---
        if (!isStepCompleted(AutomationSubStep.INVESTASI, targetSubStep)) {
          activeStep = 6;
          this.activeSteps.set(draftId, activeStep);

          if (targetSubStep === AutomationSubStep.INVESTASI) {
            const deeplink = buildStepDeeplink(AutomationSubStep.INVESTASI, checkpointData);
            if (deeplink) {
              this.logStep(subject, 6, 'info', `Navigasi via deeplink Investasi: ${deeplink}`);
              await page.goto(deeplink, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
            }
          }

          await this.filingFlowService.executeInvestasiProdukSteps(sessionCtx);
          await saveCheckpoint(AutomationSubStep.INVESTASI, checkpointData);
        }

        // --- SUB-STEP 5: PARAMETER RISIKO ---
        if (!isStepCompleted(AutomationSubStep.PARAMETER, targetSubStep)) {
          activeStep = 6;
          this.activeSteps.set(draftId, activeStep);

          if (targetSubStep === AutomationSubStep.PARAMETER) {
            const deeplink = buildStepDeeplink(AutomationSubStep.PARAMETER, checkpointData);
            if (deeplink) {
              this.logStep(subject, 6, 'info', `Navigasi via deeplink Parameter Risiko: ${deeplink}`);
              await page.goto(deeplink, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
            }
          }

          await this.filingFlowService.executeParameterRisikoSteps(sessionCtx);
          await saveCheckpoint(AutomationSubStep.PARAMETER, checkpointData);
        }

        // --- SUB-STEP 6: PERSETUJUAN LINGKUNGAN ---
        if (!isStepCompleted(AutomationSubStep.LINGKUNGAN, targetSubStep)) {
          activeStep = 6;
          this.activeSteps.set(draftId, activeStep);

          if (targetSubStep === AutomationSubStep.LINGKUNGAN) {
            const deeplink = buildStepDeeplink(AutomationSubStep.LINGKUNGAN, checkpointData);
            if (deeplink) {
              this.logStep(subject, 6, 'info', `Navigasi via deeplink Persetujuan Lingkungan: ${deeplink}`);
              await page.goto(deeplink, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
            }
          }

          await this.filingFlowService.executePersetujuanLingkunganSteps(sessionCtx);
          await saveCheckpoint(AutomationSubStep.LINGKUNGAN, checkpointData);
        }

        // --- SUB-STEP 7: PENAPISAN AMDALNET ---
        if (!isStepCompleted(AutomationSubStep.AMDALNET, targetSubStep)) {
          activeStep = 6;
          this.activeSteps.set(draftId, activeStep);

          if (targetSubStep === AutomationSubStep.AMDALNET) {
            const deeplink = buildStepDeeplink(AutomationSubStep.AMDALNET, checkpointData);
            if (deeplink) {
              this.logStep(subject, 6, 'info', `Navigasi ke OSS untuk penapisan AMDALnet: ${deeplink}`);
              await page.goto(deeplink, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
            }
          }

          const amdalRes = await this.filingFlowService.executeAmdalnetSteps(sessionCtx);
          if (amdalRes?.kd_izin) checkpointData.kd_izin = amdalRes.kd_izin;
          if (amdalRes?.id_izin) checkpointData.id_izin = amdalRes.id_izin;
          await saveCheckpoint(AutomationSubStep.AMDALNET, checkpointData);
        }

        // --- SUB-STEP 8: PENERBITAN NIB (Step 7) ---
        if (!isStepCompleted(AutomationSubStep.NIB, targetSubStep)) {
          activeStep = 7;
          this.activeSteps.set(draftId, activeStep);

          if (targetSubStep === AutomationSubStep.NIB) {
            const deeplink = buildStepDeeplink(AutomationSubStep.NIB, checkpointData);
            if (deeplink) {
              this.logStep(subject, 7, 'info', `Navigasi via deeplink Penerbitan NIB: ${deeplink}`);
              await page.goto(deeplink, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
            }
          }

          await this.filingFlowService.executePenerbitanNibSteps(sessionCtx);
          await saveCheckpoint(AutomationSubStep.NIB, checkpointData);
        }

        // Step 7: Selesai
        activeStep = 7;
        this.activeSteps.set(draftId, activeStep);
        this.logStep(
          subject,
          7,
          'success',
          'Otomatisasi NIB selesai dengan sukses!',
        );
      }
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
      const isCancelled = this.cancelledDrafts.has(draftId);
      this.cancelledDrafts.delete(draftId);

      const finalStatus =
        activeStep === 7
          ? phase === 'registration'
            ? 'DRAFT'
            : 'COMPLETED'
          : isCancelled
            ? activeStep > 1
              ? `FAILED_STEP_${activeStep - 1}`
              : 'FAILED'
            : phase === 'registration'
              ? 'FAILED'
              : draft.lastCompletedStep
                ? `FAILED_SUBSTEP_${draft.lastCompletedStep}`
                : activeStep > 2
                  ? 'FAILED_LATER'
                  : 'FAILED';

      const dbErrorMessage =
        finalStatus === 'COMPLETED' || finalStatus === 'DRAFT'
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
      this.filingFlowService.clearDraftData(draftId);
      this.activeTokens.delete(draftId);
      this.executionTimers.delete(draftId);
      this.subjectToDraftId.delete(subject);
      this.activeBrowsers.delete(draftId);
      this.activeSubjects.delete(draftId);
      this.draftMetadata.delete(draftId);
      this.activeSteps.delete(draftId);
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
    sessionCtx: AutomationSessionContext,
  ): Promise<{ browser: any; context: any; page: any }> {
    const { txId, subject } = sessionCtx;
    this.logStep(subject, 1, 'info', 'Menginisialisasi browser...');
    const browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
      slowMo: process.env.PLAYWRIGHT_SLOW_MO
        ? parseInt(process.env.PLAYWRIGHT_SLOW_MO)
        : 200,
    });
    this.activeBrowsers.set(txId, browser);

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
      sessionCtx.page = page;
      this.interactionHelper.setupNetworkLogging(page, sessionCtx);

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

      await this.interactionHelper.logSessionState(
        page,
        `automation-${txId}`,
        'Browser Init',
      );

      return { browser, context, page };
    } catch (err) {
      await browser.close();
      throw err;
    }
  }

  private async waitForUserInput<T>(
    draftId: string,
    inputMap: Map<string, T>,
    timeoutMs = 120000,
  ): Promise<T> {
    this.logger.log(
      `[waitForUserInput] Called for draftId: "${draftId}". Map currently has key: ${inputMap.has(draftId)}`,
    );
    if (inputMap.has(draftId)) {
      const val = inputMap.get(draftId)!;
      this.logger.log(
        `[waitForUserInput] Immediate hit for draftId: "${draftId}". Deleting key and returning value.`,
      );
      inputMap.delete(draftId);
      return val;
    }

    return new Promise<T>((resolve, reject) => {
      let isResolved = false;

      const subscription = this.userConfirmations.subscribe((id) => {
        this.logger.log(
          `[waitForUserInput Subscription] Received notification for id: "${id}". Target draftId: "${draftId}". Map has key: ${inputMap.has(draftId)}. Cancelled drafts has key: ${this.cancelledDrafts.has(draftId)}`,
        );
        if (this.cancelledDrafts.has(draftId)) {
          this.logger.warn(
            `[waitForUserInput Subscription] Draft "${draftId}" is cancelled. Rejecting promise.`,
          );
          isResolved = true;
          subscription.unsubscribe();
          clearTimeout(timer);
          reject(new Error('Sesi dibatalkan oleh pengguna.'));
          return;
        }

        if (id === draftId && inputMap.has(draftId)) {
          const val = inputMap.get(draftId)!;
          this.logger.log(
            `[waitForUserInput Subscription] Found value for draftId: "${draftId}". Resolving promise.`,
          );
          inputMap.delete(draftId);
          isResolved = true;
          subscription.unsubscribe();
          clearTimeout(timer);
          resolve(val);
        }
      });

      const timer = setTimeout(() => {
        if (!isResolved) {
          this.logger.error(
            `[waitForUserInput Timeout] Timeout occurred for draftId: "${draftId}" after ${timeoutMs}ms.`,
          );
          subscription.unsubscribe();
          reject(new Error('Batas waktu input habis.'));
        }
      }, timeoutMs);
    });
  }

  getRedirectionUrl(draftId: string): string | undefined {
    return this.filingFlowService.getRedirectionUrl(draftId);
  }

  getKdIzin(draftId: string): string | undefined {
    return this.filingFlowService.getKdIzin(draftId);
  }
}
