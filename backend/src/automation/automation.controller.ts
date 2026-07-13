import {
  Controller,
  Sse,
  Post,
  Get,
  Param,
  Body,
  Query,
  MessageEvent,
  UseGuards,
  Res,
} from '@nestjs/common';
import { AutomationService } from './automation.service';
import { Observable, map } from 'rxjs';
import { AdminGuard } from '../auth/admin.guard';

class LoginPayload {
  username!: string;
  password!: string;
}

@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Sse('stream/:draftId')
  stream(
    @Param('draftId') draftId: string,
    @Query('akunOss') akunOss?: string,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    return this.automationService
      .getStream(draftId, akunOss, sessionId)
      .pipe(map((event) => ({ data: event })));
  }

  @Sse('admin-stream')
  @UseGuards(AdminGuard)
  adminStream(): Observable<MessageEvent> {
    return this.automationService
      .getAdminStream()
      .pipe(map((event) => ({ data: event })));
  }

  @Post('confirm/:draftId')
  confirm(@Param('draftId') draftId: string) {
    this.automationService.confirmLogin(draftId);
    return { success: true };
  }

  @Post('otp/:draftId')
  submitOtp(@Param('draftId') draftId: string, @Body() body: { otp: string }) {
    this.automationService.submitOtp(draftId, body.otp);
    return { success: true };
  }

  @Post('password/:draftId')
  submitPassword(
    @Param('draftId') draftId: string,
    @Body() body: { password: string },
  ) {
    this.automationService.submitPassword(draftId, body.password);
    return { success: true };
  }

  @Post('product/:draftId')
  submitProduct(
    @Param('draftId') draftId: string,
    @Body() body: { jenisProdukJasa: string; cangkupanProduk: string; kapasitas: string; satuan: string }
  ) {
    this.automationService.submitProductInput(draftId, body);
    return { success: true };
  }

  @Post('parameter/:draftId')
  submitParameter(
    @Param('draftId') draftId: string,
    @Body() body: { parameter: string }
  ) {
    this.automationService.submitParameterInput(draftId, body.parameter);
    return { success: true };
  }

  @Get('redirection-url/:draftId')
  getRedirectionUrl(@Param('draftId') draftId: string) {
    const url = this.automationService.getRedirectionUrl(draftId);
    return { redirectionUrl: url || null };
  }

  @Get('kd-izin/:draftId')
  getKdIzin(@Param('draftId') draftId: string) {
    const kdIzin = this.automationService.getKdIzin(draftId);
    return { kdIzin: kdIzin || null };
  }

  @Get('recordings/:draftId')
  @UseGuards(AdminGuard)
  getRecording(@Param('draftId') draftId: string, @Res() res: any) {
    const fs = require('fs');
    const path = require('path');
    const recordingsDir = path.resolve('./recordings');

    if (!fs.existsSync(recordingsDir)) {
      res.status(404).send('Rekaman video tidak ditemukan.');
      return;
    }

    const files = fs.readdirSync(recordingsDir)
      .filter((f: string) => f.startsWith(`draft_${draftId}_`) && f.endsWith('.webm'));

    if (files.length === 0) {
      res.status(404).send('Rekaman video tidak ditemukan.');
      return;
    }

    files.sort();
    const latestFile = files[files.length - 1];
    const recordingPath = path.join(recordingsDir, latestFile);

    res.sendFile(recordingPath);
  }
}
