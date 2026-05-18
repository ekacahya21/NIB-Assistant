import { Controller, Sse, Post, Param, Body, Query, MessageEvent } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { Observable, map } from 'rxjs';

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
  ): Observable<MessageEvent> {
    return this.automationService.getStream(draftId, akunOss).pipe(
      map((event) => ({ data: event } as MessageEvent))
    );
  }

  @Post('confirm/:draftId')
  confirm(@Param('draftId') draftId: string) {
    this.automationService.confirmLogin(draftId);
    return { success: true };
  }

  @Post('otp/:draftId')
  submitOtp(
    @Param('draftId') draftId: string,
    @Body() body: { otp: string },
  ) {
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

  @Post('login')
  async login(@Body() payload: LoginPayload) {
    return this.automationService.runPlaywrightLogin(payload.username, payload.password);
  }
}
