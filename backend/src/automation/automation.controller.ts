import { Controller, Sse, Post, Param, Body, MessageEvent } from '@nestjs/common';
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
  stream(@Param('draftId') draftId: string): Observable<MessageEvent> {
    return this.automationService.getStream(draftId).pipe(
      map((event) => ({ data: event } as MessageEvent))
    );
  }

  @Post('confirm/:draftId')
  confirm(@Param('draftId') draftId: string) {
    this.automationService.confirmLogin(draftId);
    return { success: true };
  }

  @Post('login')
  async login(@Body() payload: LoginPayload) {
    return this.automationService.runPlaywrightLogin(payload.username, payload.password);
  }
}
