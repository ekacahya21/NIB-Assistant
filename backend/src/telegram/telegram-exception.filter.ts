import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TelegramService } from './telegram.service';

@Catch()
@Injectable()
export class TelegramExceptionFilter implements ExceptionFilter {
  constructor(private readonly telegramService: TelegramService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

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
      exception instanceof HttpException ? exception.getResponse() : null;

    let message: string | object = 'Internal server error';
    if (exceptionResponse) {
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const obj = exceptionResponse as Record<string, unknown>;
        if ('message' in obj) {
          const msg = obj.message;
          message = typeof msg === 'string' ? msg : String(msg);
        } else {
          message = JSON.stringify(exceptionResponse);
        }
      } else {
        message = String(exceptionResponse);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
    });
  }

  private sendTelegramAlert(
    request: Request,
    exception: unknown,
    status: number,
  ) {
    const method = request.method;
    const url = request.url;

    let errorMessage = 'Unknown error';
    let stackTrace = '';

    if (exception instanceof Error) {
      errorMessage = exception.message;
      stackTrace = exception.stack || '';
    } else if (typeof exception === 'string') {
      errorMessage = exception;
    } else if (exception && typeof exception === 'object') {
      const obj = exception as Record<string, unknown>;
      errorMessage =
        typeof obj.message === 'string'
          ? obj.message
          : JSON.stringify(exception);
    }

    // Extract and clean stack trace (limit size to keep within Telegram's 4096 char limits)
    if (stackTrace.length > 2000) {
      stackTrace = stackTrace.substring(0, 2000) + '\n... (truncated)';
    }

    // Format fields with HTML escaping to prevent Telegram API formatting issues
    const escapedMethod = this.telegramService.escapeHtml(method);
    const escapedUrl = this.telegramService.escapeHtml(url);
    const escapedMsg = this.telegramService.escapeHtml(errorMessage);
    const escapedStack = this.telegramService.escapeHtml(stackTrace);

    const telegramMessage = `<b>🚨 Uncaught API Exception</b>
<b>Endpoint:</b> <code>${escapedMethod} ${escapedUrl}</code>
<b>Status Code:</b> <code>${status}</code>
<b>Message:</b> ${escapedMsg}

<b>Stack Trace:</b>
<pre>${escapedStack}</pre>`;

    // Fire-and-forget: do not block response completion
    this.telegramService.sendMessage(telegramMessage).catch(() => {});
  }
}
