import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DraftsController } from './drafts/drafts.controller';
import { DraftsService } from './drafts/drafts.service';
import { KbliController } from './kbli/kbli.controller';
import { KbliService } from './kbli/kbli.service';
import { AutomationController } from './automation/automation.controller';
import { AutomationService } from './automation/automation.service';
import { PortalInteractionHelper } from './automation/services/portal-interaction.helper';
import { RegistrationFlowService } from './automation/services/registration-flow.service';
import { FilingFlowService } from './automation/services/filing-flow.service';
import { DocumentsModule } from './documents/documents.module';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth/auth.controller';
import { TelegramModule } from './telegram/telegram.module';
import { TelegramExceptionFilter } from './telegram/telegram-exception.filter';
import { KtpModule } from './ktp/ktp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DocumentsModule,
    TelegramModule,
    KtpModule,
  ],

  controllers: [
    AppController,
    DraftsController,
    KbliController,
    AutomationController,
    AuthController,
  ],
  providers: [
    AppService,
    DraftsService,
    KbliService,
    AutomationService,
    PortalInteractionHelper,
    RegistrationFlowService,
    FilingFlowService,
    PrismaService,
    {
      provide: APP_FILTER,
      useClass: TelegramExceptionFilter,
    },
  ],
})
export class AppModule {}
