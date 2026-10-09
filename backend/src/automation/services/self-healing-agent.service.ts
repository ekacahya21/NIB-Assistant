import { Injectable, Logger, Optional } from '@nestjs/common';
import { TelegramService } from '../../telegram/telegram.service';
import { AutomationSessionContext } from '../context/automation-session.context';

export interface DynamicPromptConfig {
  promptId: string;
  promptType: 'confirm' | 'text' | 'select' | 'number';
  title: string;
  message: string;
  options?: string[];
  defaultValue?: string;
  fieldKey?: string;
}

export interface SelfHealingAction {
  action: 'CLICK' | 'FILL' | 'DISMISS_POPUP' | 'PROMPT_USER' | 'ABORT';
  selector?: string;
  coordinates?: { x: number; y: number };
  value?: string;
  reason?: string;
  promptConfig?: DynamicPromptConfig;
}

@Injectable()
export class SelfHealingAgentService {
  private readonly logger = new Logger(SelfHealingAgentService.name);

  // Runtime selector cache: key -> selector string
  private readonly selectorCache = new Map<string, string>();

  // Circuit breaker state: draftId -> { stepCounts: Map<number, number>, totalCount: number }
  private readonly circuitBreakers = new Map<
    string,
    { stepCounts: Map<number, number>; totalCount: number }
  >();

  // Maximum attempts per sub-step and per session
  private readonly MAX_ATTEMPTS_PER_STEP = 3;
  private readonly MAX_TOTAL_ATTEMPTS = 8;

  // Forbidden text keywords for autonomous click (must trigger user confirmation instead)
  private readonly MANDATORY_CONFIRM_KEYWORDS = [
    'kirim permohonan',
    'proses permohonan',
    'ajukan permohonan',
    'terbitkan nib',
    'hapus draft',
    'batalkan kegiatan',
    'pernyataan mandiri',
    'sppl',
  ];

  constructor(
    @Optional() private readonly telegramService?: TelegramService,
  ) {}

  /**
   * Generates a cache key based on URL pathname and the element description
   */
  public getCacheKey(url: string, description: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.pathname}#${description.trim().toLowerCase()}`;
    } catch {
      return `${url}#${description.trim().toLowerCase()}`;
    }
  }

  /**
   * Retrieves a cached selector if available
   */
  public getCachedSelector(url: string, description: string): string | undefined {
    const key = this.getCacheKey(url, description);
    return this.selectorCache.get(key);
  }

  /**
   * Stores a discovered selector into the runtime cache
   */
  public setCachedSelector(url: string, description: string, selector: string) {
    const key = this.getCacheKey(url, description);
    this.selectorCache.set(key, selector);
    this.logger.log(`[SelfHealing] Cached selector for key [${key}]: ${selector}`);
  }

  /**
   * Clears the cache (useful for testing or cache invalidation)
   */
  public clearCache() {
    this.selectorCache.clear();
  }

  /**
   * Resets the circuit breaker counter for a draft
   */
  public resetCircuitBreaker(draftId: string) {
    this.circuitBreakers.delete(draftId);
  }

  /**
   * Checks and increments the circuit breaker. Returns true if allowed, false if limit exceeded.
   */
  public checkAndIncrementCircuitBreaker(
    draftId: string,
    step: number,
  ): { allowed: boolean; reason?: string } {
    let cb = this.circuitBreakers.get(draftId);
    if (!cb) {
      cb = { stepCounts: new Map<number, number>(), totalCount: 0 };
      this.circuitBreakers.set(draftId, cb);
    }

    if (cb.totalCount >= this.MAX_TOTAL_ATTEMPTS) {
      return {
        allowed: false,
        reason: `Maksimal total pemulihan otomatis (${this.MAX_TOTAL_ATTEMPTS}x) tercapai untuk draf ini.`,
      };
    }

    const currentStepCount = cb.stepCounts.get(step) || 0;
    if (currentStepCount >= this.MAX_ATTEMPTS_PER_STEP) {
      return {
        allowed: false,
        reason: `Maksimal pemulihan otomatis langkah ${step} (${this.MAX_ATTEMPTS_PER_STEP}x) tercapai.`,
      };
    }

    cb.stepCounts.set(step, currentStepCount + 1);
    cb.totalCount += 1;
    return { allowed: true };
  }

  /**
   * Main entrypoint: Takes a screenshot of the current page, invokes Gemini Vision,
   * validates safety guardrails, executes or escalates the action, and caches the selector.
   */
  public async healAndAct(params: {
    page: any;
    targetDescription: string;
    actionType: 'click' | 'fill';
    expectedValue?: string;
    currentStep: number;
    context: AutomationSessionContext;
  }): Promise<{ success: boolean; healedSelector?: string; error?: string }> {
    const { page, targetDescription, actionType, expectedValue, currentStep, context } = params;
    const draftId = context.draft?.id || 'unknown-draft';
    const currentUrl = page.url ? page.url() : 'unknown-url';

    // 1. Check Circuit Breaker
    const cbCheck = this.checkAndIncrementCircuitBreaker(draftId, currentStep);
    if (!cbCheck.allowed) {
      this.logger.error(`[SelfHealing] Circuit breaker tripped for draft ${draftId}: ${cbCheck.reason}`);
      context.logStep(currentStep, 'error', `[Self-Healing] ${cbCheck.reason}`);
      if (this.telegramService) {
        await this.telegramService
          .sendMessage(
            `🚨 <b>NIB Self-Healing Circuit Breaker</b>\n\n` +
            `Draft: <code>${draftId}</code>\n` +
            `URL: <code>${currentUrl}</code>\n` +
            `Target: ${targetDescription}\n` +
            `Alasan: ${cbCheck.reason}`,
          )
          .catch(() => {});
      }
      return { success: false, error: cbCheck.reason };
    }

    context.logStep(
      currentStep,
      'info',
      `[Self-Healing] Menganalisis layar untuk menemukan "${targetDescription}"...`,
    );

    // 2. Capture Viewport Screenshot
    let screenshotBuffer: Buffer;
    try {
      screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality: 75,
        fullPage: false,
      });
    } catch (err: any) {
      this.logger.error(`[SelfHealing] Failed to capture screenshot: ${err.message}`);
      return { success: false, error: `Gagal menangkap layar browser: ${err.message}` };
    }

    // 3. Formulate Prompt for Gemini 2.5 Flash
    const base64Image = screenshotBuffer.toString('base64');
    const prompt = this.buildPrompt({
      targetDescription,
      actionType,
      expectedValue,
      draftData: context.draft,
      currentUrl,
    });

    // 4. Call Vision AI
    let rawAiResponse: string;
    try {
      rawAiResponse = await this.callVisionModel(base64Image, 'image/jpeg', prompt);
    } catch (err: any) {
      this.logger.error(`[SelfHealing] Vision AI call failed: ${err.message}`);
      context.logStep(currentStep, 'warn', `[Self-Healing] AI Vision tidak dapat dihubungi: ${err.message}`);
      return { success: false, error: err.message };
    }

    // 5. Parse Action
    const action = this.parseActionResponse(rawAiResponse);
    if (!action) {
      this.logger.error(`[SelfHealing] Unable to parse structured JSON from AI: ${rawAiResponse}`);
      return { success: false, error: 'Respons AI tidak sesuai format JSON yang diharapkan.' };
    }

    this.logger.log(`[SelfHealing] AI proposed action: ${JSON.stringify(action)}`);

    // 6. Enforce Safety Guardrails: Check for Mandatory User Confirmation
    if (
      action.action === 'CLICK' &&
      this.isMandatoryConfirmAction(targetDescription, action.reason || '')
    ) {
      this.logger.warn(`[SelfHealing] Action requires mandatory user confirmation: ${targetDescription}`);
      action.action = 'PROMPT_USER';
      action.promptConfig = {
        promptId: `confirm_${Date.now()}`,
        promptType: 'confirm',
        title: 'Konfirmasi Persetujuan / Tindakan Hukum',
        message: `Portal OSS membutuhkan konfirmasi untuk tindakan: "${targetDescription}". Apakah Anda ingin melanjutkan pengiriman/persetujuan ini?`,
        options: ['Ya, Lanjutkan', 'Batal'],
      };
    }

    // 7. Execute Action based on type
    if (action.action === 'PROMPT_USER') {
      if (!context.waitForDynamicPrompt) {
        this.logger.error('[SelfHealing] context.waitForDynamicPrompt is not implemented in session context');
        return { success: false, error: 'Fitur prompt dinamis belum aktif pada sesi ini.' };
      }

      context.logStep(
        currentStep,
        'info',
        `[Self-Healing] Menunggu intervensi pengguna untuk: ${action.promptConfig?.title || targetDescription}`,
        { promptConfig: action.promptConfig },
      );

      const userResponse = await context.waitForDynamicPrompt(
        action.promptConfig || {
          promptId: `prompt_${Date.now()}`,
          promptType: 'text',
          title: 'Perlu Input Pengguna',
          message: action.reason || `Silakan berikan input untuk: ${targetDescription}`,
        },
      );

      // If confirm was rejected
      if (
        action.promptConfig?.promptType === 'confirm' &&
        userResponse?.value !== 'Ya, Lanjutkan' &&
        userResponse?.value !== true
      ) {
        return { success: false, error: 'Pengguna membatalkan aksi perizinan ini.' };
      }

      // If it asked for a value, fill it if selector exists
      if (action.selector && userResponse?.value) {
        await page.fill(action.selector, String(userResponse.value));
      } else if (action.promptConfig?.promptType === 'confirm') {
        if (action.selector) {
          await page.click(action.selector);
        } else if (action.coordinates) {
          await page.mouse.click(action.coordinates.x, action.coordinates.y);
        }
      }

      return { success: true, healedSelector: action.selector };
    }

    if (action.action === 'DISMISS_POPUP') {
      try {
        if (action.selector) {
          await page.click(action.selector, { timeout: 3000 });
        } else if (action.coordinates) {
          await page.mouse.click(action.coordinates.x, action.coordinates.y);
        }
        context.logStep(currentStep, 'info', '[Self-Healing] Berhasil menutup popup / banner yang menghalangi.');
        return { success: true, healedSelector: action.selector };
      } catch (err: any) {
        return { success: false, error: `Gagal menutup popup: ${err.message}` };
      }
    }

    if (action.action === 'CLICK') {
      try {
        if (action.selector) {
          await page.click(action.selector, { timeout: 4000 });
        } else if (action.coordinates) {
          await page.mouse.click(action.coordinates.x, action.coordinates.y);
        } else {
          return { success: false, error: 'AI tidak memberikan selector atau koordinat klik.' };
        }

        if (action.selector) {
          this.setCachedSelector(currentUrl, targetDescription, action.selector);
          this.notifyDeveloperHealed(currentUrl, targetDescription, action.selector);
        }

        context.logStep(
          currentStep,
          'success',
          `[Self-Healing] Berhasil menemukan dan mengklik "${targetDescription}".`,
        );
        return { success: true, healedSelector: action.selector };
      } catch (err: any) {
        return { success: false, error: `Gagal mengeksekusi klik hasil AI: ${err.message}` };
      }
    }

    if (action.action === 'FILL') {
      const valToFill = expectedValue || action.value;
      if (!valToFill) {
        return { success: false, error: 'Tidak ada nilai data yang valid untuk diisikan.' };
      }

      try {
        if (action.selector) {
          await page.fill(action.selector, valToFill);
        } else if (action.coordinates) {
          await page.mouse.click(action.coordinates.x, action.coordinates.y);
          await page.keyboard.type(valToFill, { delay: 50 });
        } else {
          return { success: false, error: 'AI tidak memberikan selector atau koordinat input.' };
        }

        if (action.selector) {
          this.setCachedSelector(currentUrl, targetDescription, action.selector);
          this.notifyDeveloperHealed(currentUrl, targetDescription, action.selector);
        }

        context.logStep(
          currentStep,
          'success',
          `[Self-Healing] Berhasil mengisi kolom "${targetDescription}".`,
        );
        return { success: true, healedSelector: action.selector };
      } catch (err: any) {
        return { success: false, error: `Gagal mengeksekusi pengisian input hasil AI: ${err.message}` };
      }
    }

    return { success: false, error: action.reason || 'AI menyarankan pembatalan aksi.' };
  }

  private isMandatoryConfirmAction(targetDescription: string, reason: string): boolean {
    const text = `${targetDescription} ${reason}`.toLowerCase();
    return this.MANDATORY_CONFIRM_KEYWORDS.some((kw) => text.includes(kw));
  }

  private async notifyDeveloperHealed(url: string, description: string, newSelector: string) {
    if (!this.telegramService) return;
    try {
      await this.telegramService.sendMessage(
        `🛠 <b>Self-Healing Selector Detected</b>\n\n` +
        `URL: <code>${url}</code>\n` +
        `Target: <b>${description}</b>\n` +
        `Selector Baru: <code>${newSelector}</code>\n\n` +
        `<i>Selector telah disimpan di runtime cache. Silakan patch di repo pada commit berikutnya.</i>`,
      );
    } catch {
      // Non-blocking telemetry
    }
  }

  public buildPrompt(params: {
    targetDescription: string;
    actionType: 'click' | 'fill';
    expectedValue?: string;
    draftData?: any;
    currentUrl: string;
  }): string {
    const { targetDescription, actionType, expectedValue, currentUrl } = params;

    return `Anda adalah AI Self-Healing Browser Agent untuk sistem otomatisasi portal perizinan OSS Indonesia (oss.go.id).
Tugas Anda: Menganalisis screenshot halaman web dan menemukan elemen untuk: "${targetDescription}".
Tipe Aksi yang Diinginkan: ${actionType.toUpperCase()}${expectedValue ? ` dengan nilai: "${expectedValue}"` : ''}.
URL saat ini: ${currentUrl}.

ATURAN KEAMANAN & AKSI:
1. Jika terdapat banner, popup, overlay modal, atau pesan notifikasi yang menghalangi form, kembalikan aksi "DISMISS_POPUP" dengan selector tombol tutup (X atau Batalkan) atau koordinatnya.
2. Jika elemen ditemukan dengan jelas:
   - Berikan "selector" (CSS selector paling stabil, misal berdasarkan atribut id, name, placeholder, text(), atau aria-label).
   - Berikan juga "coordinates" perkiraan titik tengah elemen { "x": number, "y": number } dalam pixel viewport.
   - Pilih aksi "CLICK" atau "FILL".
3. Jika halaman membutuhkan data baru yang tidak ada (seperti OTP WhatsApp, CAPTCHA gambar, atau pilihan opsi izin baru), ATAU membutuhkan konfirmasi perizinan hukum/SPPL/Kirim Permohonan:
   - Kembalikan aksi "PROMPT_USER" lengkap dengan struktur "promptConfig" (title, message, promptType: "confirm" | "text" | "select", options jika ada).
4. Jika halaman error 500/portal mati atau benar-benar tidak dapat dilanjutkan, kembalikan aksi "ABORT" beserta "reason".

KEMBALIKAN HANYA JSON MURNI (tanpa markdown, tanpa \`\`\`json):
{
  "action": "CLICK" | "FILL" | "DISMISS_POPUP" | "PROMPT_USER" | "ABORT",
  "selector": "string (opsional jika ada)",
  "coordinates": { "x": 120, "y": 340 },
  "value": "string (opsional jika FILL)",
  "reason": "Penjelasan singkat",
  "promptConfig": {
    "promptId": "unique_id",
    "promptType": "confirm" | "text" | "select" | "number",
    "title": "Judul Prompt",
    "message": "Pesan untuk user",
    "options": ["Opsi 1", "Opsi 2"]
  }
}`;
  }

  public parseActionResponse(rawText: string): SelfHealingAction | null {
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed.action) return null;
      return parsed as SelfHealingAction;
    } catch {
      return null;
    }
  }

  private async callVisionModel(
    base64Data: string,
    mimeType: string,
    prompt: string,
  ): Promise<string> {
    const rawHost = process.env.LOCAL_LLM_HOST || 'http://localhost:20128/v1';
    const localKey = process.env.LOCAL_LLM_KEY;
    const localModel = process.env.LOCAL_LLM_MODEL || 'combo-max';

    const cleanHost = rawHost.replace(/\/$/, '');
    const url = cleanHost.endsWith('/chat/completions')
      ? cleanHost
      : `${cleanHost}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (localKey) {
      headers['Authorization'] = `Bearer ${localKey}`;
    }

    const payload = {
      model: localModel,
      stream: false,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Data}` },
            },
          ],
        },
      ],
    };

    this.logger.log(
      `[SelfHealing] Calling Local Vision LLM at ${url} using model "${localModel}"...`,
    );

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Local Vision LLM failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }
}
