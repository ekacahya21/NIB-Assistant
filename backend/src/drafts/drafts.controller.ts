import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { DraftsService, DraftData } from './drafts.service';

@Controller('drafts')
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Post()
  create(@Body() data: DraftData): DraftData {
    return this.draftsService.create(data);
  }

  @Get(':id')
  findOne(@Param('id') id: string): DraftData {
    return this.draftsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<DraftData>): DraftData {
    return this.draftsService.update(id, data);
  }

  @Get()
  findAll(): DraftData[] {
    return this.draftsService.findAll();
  }
}
