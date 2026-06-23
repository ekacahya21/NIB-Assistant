import { Controller, Get, Query } from '@nestjs/common';
import { KbliService, KBLIRecord } from './kbli.service';

@Controller('kbli')
export class KbliController {
  constructor(private readonly kbliService: KbliService) {}

  @Get('search')
  async search(@Query('q') query: string): Promise<KBLIRecord[]> {
    return this.kbliService.search(query);
  }
}
