import { Injectable } from '@nestjs/common';
import { Observable, interval, map, takeWhile, Subject } from 'rxjs';
import { chromium } from 'playwright-extra';
import stealthPlugin from '@zorilla/puppeteer-extra-plugin-stealth';

// Configure Playwright Extra with the stealth evasion plugin globally
chromium.use(stealthPlugin());

export interface AutomationEvent {
  step: number;
  status: 'info' | 'success' | 'warn' | 'error';
  text: string;
}

@Injectable()
export class AutomationService {
  private readonly userConfirmations = new Subject<string>();

  // Trigger login confirmation for a specific draft ID
  confirmLogin(draftId: string) {
    this.userConfirmations.next(draftId);
  }

  // Observable SSE stream for automation status
  getStream(draftId: string): Observable<AutomationEvent> {
    let internalStep = 0;
    
    // Simulate real-time browser actions matching user inputs
    const stages: AutomationEvent[] = [
      { step: 1, status: 'info', text: 'Menginisialisasi browser Playwright di backend local...' },
      { step: 1, status: 'success', text: 'Browser Chromium headful berhasil diluncurkan.' },
      { step: 1, status: 'info', text: 'Membuka alamat resmi portal: https://oss.go.id' },
      { step: 2, status: 'success', text: 'Portal OSS berhasil dimuat. Jendela browser terbuka.' },
      { step: 2, status: 'warn', text: 'PENTING: Silakan selesaikan proses LOGIN / OTP di jendela browser Chrome yang terbuka.' },
      // Step 3 (starts after User triggers "Saya sudah login" confirmation)
      { step: 3, status: 'success', text: 'Persetujuan diterima: User melaporkan login berhasil.' },
      { step: 3, status: 'info', text: 'Melakukan sinkronisasi session state browser...' },
      { step: 3, status: 'info', text: 'Mengisi kolom Nama Pemilik: Budi Santoso [SUKSES]' },
      { step: 3, status: 'info', text: 'Mengisi NIK Pemilik: 3171234567890001 [SUKSES]' },
      { step: 3, status: 'info', text: 'Mengisi Kontak WhatsApp & Alamat Detail [SUKSES]' },
      // Step 4
      { step: 4, status: 'info', text: 'Memilih Sektor KBLI & Modal Usaha...' },
      { step: 4, status: 'info', text: 'Memilih KBLI: 56103 (Kedai Makanan) [SUKSES]' },
      { step: 4, status: 'info', text: 'Menginput Modal Usaha & Jumlah Pekerja [SUKSES]' },
      // Step 5
      { step: 5, status: 'success', text: 'Semua data berhasil diisi ke form portal OSS.' },
      { step: 5, status: 'success', text: 'Silakan periksa kembali halaman browser Anda, klik "Terbitkan NIB" untuk finalisasi.' },
    ];

    // Emit updates sequentially
    return interval(1500).pipe(
      map(() => {
        const event = stages[internalStep];
        if (internalStep < stages.length - 1) {
          // If we reach stage 5 (user action needed), pause advancing until user completes login
          if (event.step === 2 && event.status === 'warn') {
            // Keep repeating or waiting at step 2 until manual trigger
          } else {
            internalStep++;
          }
        }
        return event;
      }),
      takeWhile((ev) => ev !== undefined)
    );
  }

  async runPlaywrightLogin(username: string, password: string): Promise<{ success: boolean; redirectedUrl: string; error?: string }> {
    // Launch Playwright headfully
    const headless = process.env.PLAYWRIGHT_HEADLESS === 'true';
    const slowMo = parseInt(process.env.PLAYWRIGHT_SLOW_MO || '500', 10);
    
    console.log(`Launching Playwright (headless: ${headless}, slowMo: ${slowMo}ms)...`);
    const browser = await chromium.launch({
      headless,
      slowMo,
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      // 1. Open login page
      console.log('Opening https://ui-login.oss.go.id/login...');
      await page.goto(`${process.env.OSS_LOGIN_URL}`, {
        waitUntil: 'networkidle',
        timeout: 45000,
      });

      // 2. Type username & password
      console.log('Looking for login inputs...');
      const usernameSelector = 'input[name="username"], input[type="text"], input[placeholder*="Username"], input[placeholder*="Email"], #username';
      const passwordSelector = 'input[name="password"], input[type="password"], input[placeholder*="Sandi"], input[placeholder*="Password"], #password';

      await page.waitForSelector(usernameSelector, { timeout: 15000 });
      await page.fill(usernameSelector, username);

      await page.waitForSelector(passwordSelector, { timeout: 15000 });
      await page.fill(passwordSelector, password);

      // 3. Hit login
      console.log('Clicking login button...');
      const loginButtonSelector = 'button[type="button"]';
      await page.click(loginButtonSelector);

      // 4. Catch redirect URL.
      // Wait up to 30 seconds for redirection. The user can solve OTP/Captcha manually in the browser window.
      console.log('Waiting for redirection from login page...');
      let redirectedUrl = page.url();
      const startTime = Date.now();
      while (Date.now() - startTime < 30000) {
        const currentUrl = page.url();
        if (currentUrl && !currentUrl.includes('/login')) {
          redirectedUrl = currentUrl;
          console.log('Redirected URL detected:', redirectedUrl);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Capture final url before resolving
      redirectedUrl = page.url();

      return {
        success: !redirectedUrl.includes('/login'),
        redirectedUrl,
      };

    } catch (error) {
      console.error('Playwright automation error:', error);
      return {
        success: false,
        redirectedUrl: '',
        error: error.message || String(error),
      };
    } finally {
      // In a real headful assistance scenario, we might keep the browser open.
      // For this specific API test endpoint, we close the browser after resolving the redirect URL.
      await browser.close();
    }
  }
}
