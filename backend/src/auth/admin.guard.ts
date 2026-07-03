import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Bypass check if it is a client request for their own drafts (has query sessionId)
    if (
      request.path === '/drafts' &&
      request.method === 'GET' &&
      request.query &&
      request.query.sessionId
    ) {
      return true;
    }

    // 2. Otherwise, require admin token
    const token = this.extractToken(request);
    const expectedToken = process.env.ADMIN_TOKEN || 'secret_admin_token_123';

    if (!token || token !== expectedToken) {
      throw new UnauthorizedException('Akses ditolak. Token admin tidak sah.');
    }

    return true;
  }

  private extractToken(request: any): string | null {
    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameters (for EventSource stream)
    if (request.query && request.query.token) {
      return request.query.token;
    }

    return null;
  }
}
