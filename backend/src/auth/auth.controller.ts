import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Post('admin/login')
  adminLogin(@Body() body: any) {
    const { username, password } = body;
    const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
    const expectedPassword = process.env.ADMIN_PASSWORD || 'admin';
    const token = process.env.ADMIN_TOKEN || 'secret_admin_token_123';

    if (username === expectedUsername && password === expectedPassword) {
      return { token };
    }

    throw new UnauthorizedException('Username atau password salah.');
  }
}
