import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { DraftsService, DraftData } from './drafts.service';

@Controller('drafts')
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Post()
  async create(@Body() data: DraftData): Promise<DraftData> {
    return this.draftsService.create(data);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<DraftData> {
    return this.draftsService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: Partial<DraftData>): Promise<DraftData> {
    return this.draftsService.update(id, data);
  }

  @Get()
  async findAll(): Promise<DraftData[]> {
    return this.draftsService.findAll();
  }
}
