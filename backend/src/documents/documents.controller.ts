import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('generate-nps')
  async generateNps(
    @Body() body: { alamatUsaha: string; latitude: string; longitude: string; luasTanah: string },
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.documentsService.generateAdministrationPdf(body);
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=dokumen_administrasi_${new Date().toISOString().split('T')[0]}.pdf`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Gagal membuat dokumen administrasi PDF',
        error: err.message || err,
      });
    }
  }

  @Post('convert-photo')
  async convertPhoto(
    @Body() body: { fotoLokasi: string },
    @Res() res: Response,
  ) {
    try {
      if (!body.fotoLokasi) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Parameter fotoLokasi wajib diisi.',
        });
      }

      const pdfBuffer = await this.documentsService.convertPhotoToPdf(body.fotoLokasi);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=foto_lokasi_${new Date().toISOString().split('T')[0]}.pdf`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Gagal mengubah foto lokasi ke PDF',
        error: err.message || err,
      });
    }
  }
}
