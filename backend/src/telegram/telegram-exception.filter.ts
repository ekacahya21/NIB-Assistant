import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Catch()
@Injectable()
export class TelegramExceptionFilter implements ExceptionFilter {
  constructor(private readonly telegramService: TelegramService) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Send Telegram alert only for internal server errors (5xx)
    // Client-side exceptions (like 400 Bad Request, 401 Unauthorized, 404 Not Found) are normal client validation errors
    if (status >= 500) {
      this.sendTelegramAlert(request, exception, status);
    }

    // Format exception response to match standard NestJS format
    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : null;

    const message = exceptionResponse
      ? (typeof exceptionResponse === 'object' && (exceptionResponse as any).message
          ? (exceptionResponse as any).message
          : exceptionResponse)
      : exception.message || 'Internal server error';

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
    });
  }

  private sendTelegramAlert(request: any, exception: any, status: number) {
    const method = request.method;
    const url = request.url;
    const errorMessage = exception.message || String(exception);
    
    // Extract and clean stack trace (limit size to keep within Telegram's 4096 char limits)
    let stackTrace = exception.stack || '';
    if (stackTrace.length > 2000) {
      stackTrace = stackTrace.substring(0, 2000) + '\n... (truncated)';
    }

    // Format fields with HTML escaping to prevent Telegram API formatting issues
    const escapedMethod = this.telegramService.escapeHtml(method);
    const escapedUrl = this.telegramService.escapeHtml(url);
    const escapedMsg = this.telegramService.escapeHtml(errorMessage);
    const escapedStack = this.telegramService.escapeHtml(stackTrace);

    const telegramMessage = 
`<b>🚨 Uncaught API Exception</b>
<b>Endpoint:</b> <code>${escapedMethod} ${escapedUrl}</code>
<b>Status Code:</b> <code>${status}</code>
<b>Message:</b> ${escapedMsg}

<b>Stack Trace:</b>
<pre>${escapedStack}</pre>`;

    // Fire-and-forget: do not block response completion
    this.telegramService.sendMessage(telegramMessage).catch(() => {});
  }
}
