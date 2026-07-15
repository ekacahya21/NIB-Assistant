import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DocumentsModule],
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
  ],
})
export class AppModule {}
