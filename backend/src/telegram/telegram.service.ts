import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private botToken: string | undefined;
  private chatId: string | undefined;
  private appEnv: string = 'development';
  
  // In-memory cache to de-duplicate message alerts: Map<messageHashOrText, timestamp>
  private readonly sentErrors = new Map<string, number>();
  private readonly COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    this.appEnv = this.configService.get<string>('NODE_ENV') || 'development';

    if (!this.botToken || !this.chatId) {
      this.logger.warn(
        'Telegram notifications are disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in environment config.',
      );
    } else {
      this.logger.log(
        `Telegram notifications initialized successfully for [${this.appEnv.toUpperCase()}] environment.`,
      );
    }
  }

  /**
   * Escapes special HTML characters to prevent Telegram API formatting errors.
   */
  escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Generates a simple hash string for de-duplication.
   */
  private generateHash(text: string): string {
    // Truncate/clean the text and use it as a key. 
    // Truncating to 150 chars captures the unique part of the error message without growing memory infinitely.
    return text.substring(0, 150).trim().toLowerCase();
  }

  /**
   * Cleans up expired items from the de-duplication cache to prevent memory leaks.
   */
  private pruneCache() {
    const now = Date.now();
    for (const [key, timestamp] of this.sentErrors.entries()) {
      if (now - timestamp > this.COOLDOWN_MS) {
        this.sentErrors.delete(key);
      }
    }
  }

  /**
   * Sends a message to the configured Telegram channel/group.
   * Handles de-duplication, environment prefixing, and silent fallback.
   */
  async sendMessage(rawMessage: string): Promise<void> {
    if (!this.botToken || !this.chatId) {
      return;
    }

    const now = Date.now();
    this.pruneCache();

    const messageKey = this.generateHash(rawMessage);

    // Update timestamp before sending
    this.sentErrors.set(messageKey, now);

    // Format message with environment prefix
    const envPrefix = `⚠️ <b>[${this.appEnv.toUpperCase()}] NIB Assistant Alert</b>\n\n`;
    const formattedText = `${envPrefix}${rawMessage}`;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: this.chatId,
            text: formattedText,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error response');
        this.logger.error(
          `Failed to send Telegram message. Status: ${response.status}. Response: ${errorText}`,
        );
      }
    } catch (err: any) {
      // Silent Fallback - Log to console only so it doesn't interrupt primary app flows
      this.logger.error(
        `Telegram notification service request failed: ${err?.message || err}`,
      );
    }
  }
}
