import { Injectable, Logger } from '@nestjs/common';
import { AutomationSessionContext } from '../context/automation-session.context';

@Injectable()
export class PortalInteractionHelper {
  private readonly logger = new Logger(PortalInteractionHelper.name);

  public async selectOptionRobust(
    page: any,
    query: string,
    context: AutomationSessionContext,
  ): Promise<boolean> {
    const normalQuery = query.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Dynamic wait for option elements to load rather than a forced delay
    try {
      await page
        .getByRole('option')
        .first()
        .waitFor({ state: 'attached', timeout: 3000 });
    } catch (e) {
      // Check if popup blocked it and dismiss it
      await this.dismissPopupIfVisible(page, context, 0, 1000);
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
        // Check if popup blocked it and dismiss it
        await this.dismissPopupIfVisible(page, context, 0, 1000);
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

  public async waitForInputEnabled(
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

  public async clickAndFillInputResilient(
    page: any,
    selector: string,
    value: string,
    context: AutomationSessionContext,
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
          // Both failed, check for blocking popup and dismiss it, then retry
          await this.dismissPopupIfVisible(page, context, 0, 1000);
        }
      }
      await page.waitForTimeout(500);
    }
    throw new Error(
      `Gagal mengisi kolom "${selector}" karena kolom tetap dinonaktifkan (disabled) atau tidak dapat diklik.`,
    );
  }

  public getOptimalSearchQuery(name: string): string {
    // Remove common admin prefixes to get the actual distinctive name for searching
    const distinctiveName = name
      .replace(
        /^(kab\.|kota|kabupaten|kec\.|kecamatan|prov\.|provinsi|desa|kel\.|kelurahan)\s+/i,
        '',
      )
      .trim();

    if (distinctiveName.includes(' ')) {
      const parts = distinctiveName.split(/\s+/);
      const firstWord = parts[0];
      if (firstWord.length >= 3) {
        return firstWord;
      }
    }
    return distinctiveName;
  }

  public extractAndStoreToken(url: string, context: AutomationSessionContext) {
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
        context.jwtToken = jwtToken;
        this.logger.log(
          `[Tx: automation-${context.txId}] [Token Capture] Captured auth-code token successfully.`,
        );
      }
    } catch (err) {
      // Safe fallback
    }
  }

  public async dismissPopupIfVisible(
    page: any,
    context: AutomationSessionContext,
    step: number,
    timeoutMs = 3000,
  ): Promise<void> {
    let loopCount = 0;
    while (loopCount < 5) {
      try {
        const candidates = page
          .locator(
            '.v-overlay-container button, .v-overlay-container .v-btn, .v-overlay-container [role="button"], .popup-modal button',
          )
          .filter({
            hasText: /mengerti|tutup|close|\bok\b|\bya\b|lanjut|simpan/i,
          });

        // Wait briefly for elements to mount
        await page.waitForTimeout(500);

        const count = await candidates.count().catch(() => 0);
        let clicked = false;
        for (let i = 0; i < count; i++) {
          const btn = candidates.nth(i);
          if (
            (await btn.isVisible().catch(() => false)) &&
            (await btn.isEnabled().catch(() => false))
          ) {
            const text = await btn.textContent().catch(() => '');
            context.logStep(
              step,
              'info',
              `Mengklik tombol "${text.trim()}" untuk menutup popup (loop #${loopCount + 1})...`,
            );
            await btn.click({ force: true });
            await page.waitForTimeout(1000);
            clicked = true;
            break;
          }
        }
        if (clicked) {
          loopCount++;
          continue;
        }
      } catch (err) {
        // Click failed, exit loop to run DOM removal
        break;
      }
      break;
    }

    // Forceful DOM cleanup: remove active dialog overlays to clear blocking popups without destroying dropdown menu roots
    try {
      await page.evaluate(() => {
        const elementsToClear = [
          '.v-overlay--active:has(.v-dialog)',
          '.v-dialog',
          '.popup-modal',
          '.modal-backdrop',
        ];
        elementsToClear.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => el.remove());
        });
      });
      await page.waitForTimeout(500);
    } catch (e) {
      this.logger.error(
        'Failed during fallback DOM removal in dismissPopupIfVisible',
        e,
      );
    }
  }

  public async logSessionState(
    page: any,
    txId: string,
    contextMessage: string,
  ): Promise<void> {
    try {
      if (!page || page.isClosed()) return;

      // 1. Log Cookies safely
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

  public setupNetworkLogging(page: any, context: AutomationSessionContext) {
    const pageContext = page.context();
    const requestStartTimes = new Map<any, number>();
    const txId = context.txId;

    // Log page redirections / navigations for the main page
    page.on('framenavigated', (frame: any) => {
      if (frame === page.mainFrame()) {
        const url = frame.url();
        this.logger.log(
          `[Tx: ${txId}] [Page Redirection/Navigation] Main frame navigated to: ${url}`,
        );
        this.extractAndStoreToken(url, context);
      }
    });

    // Capture and log navigation in newly spawned pages/tabs/popups
    pageContext.on('page', (newPage: any) => {
      this.logger.log(
        `[Tx: ${txId}] [New Tab/Popup opened] URL: ${newPage.url()}`,
      );
      this.extractAndStoreToken(newPage.url(), context);
      newPage.on('framenavigated', (frame: any) => {
        if (frame === newPage.mainFrame()) {
          const url = frame.url();
          this.logger.log(
            `[Tx: ${txId}] [Page Redirection/Navigation - Tab] Main frame navigated to: ${url}`,
          );
          this.extractAndStoreToken(url, context);
        }
      });
    });

    pageContext.on('request', (request: any) => {
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

    pageContext.on('response', async (response: any) => {
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
        url.includes('/kelurahan') ||
        url.includes('/dokumen') ||
        url.includes('/file') ||
        url.includes('/upload')
      ) {
        try {
          if (status >= 200 && status < 300) {
            const text = await response.text();
            console.log(
              `[Tx: ${txId}] [DEBUG NETWORK RESPONSE BODY] URL: ${url} | Body: ${text}`,
            );
            const trimmed =
              text.length > 200 ? text.substring(0, 200) + '...' : text;
            this.logger.log(`[Tx: ${txId}] [Network Response Body] ${trimmed}`);
          }
        } catch (e) {
          // Response body might not be readable or already closed/navigated
        }
      }
    });

    pageContext.on('requestfailed', (request: any) => {
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
}
