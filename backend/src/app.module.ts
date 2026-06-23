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
import { DocumentsModule } from './documents/documents.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DocumentsModule],
  controllers: [
    AppController,
    DraftsController,
    KbliController,
    AutomationController,
  ],
  providers: [
    AppService,
    DraftsService,
    KbliService,
    AutomationService,
    PrismaService,
  ],
})
export class AppModule {}
