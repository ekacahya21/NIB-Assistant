import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KtpService } from './ktp.service';
import { KtpExtractionResponseDto } from './dto/ktp-extraction-response.dto';

interface UploadedKtpFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Controller('api/ktp')
export class KtpController {
  constructor(private readonly ktpService: KtpService) {}

  @Post('extract')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async extractKtp(
    @UploadedFile() file: UploadedKtpFile,
  ): Promise<{ success: boolean; data: KtpExtractionResponseDto }> {
    if (!file) {
      throw new BadRequestException('File gambar KTP wajib diunggah.');
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/jpg',
      'image/heic',
      'image/heif',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Format file tidak didukung. Harap unggah gambar JPG, PNG, atau WEBP.',
      );
    }

    const data = await this.ktpService.extractKtp(file.buffer, file.mimetype);
    return {
      success: true,
      data,
    };
  }
}
