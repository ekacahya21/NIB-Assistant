import { Test, TestingModule } from '@nestjs/testing';
import { KtpService } from './ktp.service';
import { BadRequestException } from '@nestjs/common';

describe('KtpService', () => {
  let service: KtpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KtpService],
    }).compile();

    service = module.get<KtpService>(KtpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw BadRequestException if file buffer is empty', async () => {
    await expect(service.extractKtp(Buffer.from(''), 'image/jpeg')).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('normalizeDate', () => {
    it('should correctly format DD-MM-YYYY to YYYY-MM-DD', () => {
      const normalized = (service as any).normalizeDate('15-08-1990');
      expect(normalized).toBe('1990-08-15');
    });

    it('should keep YYYY-MM-DD unchanged', () => {
      const normalized = (service as any).normalizeDate('1995-12-31');
      expect(normalized).toBe('1995-12-31');
    });
  });

  describe('normalizeGender', () => {
    it('should normalize laki-laki variants', () => {
      expect((service as any).normalizeGender('LAKI-LAKI')).toBe('Laki-laki');
      expect((service as any).normalizeGender('Pria')).toBe('Laki-laki');
    });

    it('should normalize perempuan variants', () => {
      expect((service as any).normalizeGender('PEREMPUAN')).toBe('Perempuan');
      expect((service as any).normalizeGender('Wanita')).toBe('Perempuan');
    });
  });

  describe('parseJsonResponse', () => {
    it('should parse pure JSON string', () => {
      const result = (service as any).parseJsonResponse('{"nik": "3201010101010001", "isKtp": true}');
      expect(result.nik).toBe('3201010101010001');
      expect(result.isKtp).toBe(true);
    });

    it('should parse JSON wrapped in markdown code blocks', () => {
      const raw = '```json\n{"nik": "3201010101010001", "isKtp": true}\n```';
      const result = (service as any).parseJsonResponse(raw);
      expect(result.nik).toBe('3201010101010001');
    });

    it('should parse JSON preceded by conversational text like "Saya siap..."', () => {
      const raw = 'Saya siap membantu Anda mengekstrak data KTP. Berikut hasilnya:\n{"nik": "3201010101010001", "isKtp": true}';
      const result = (service as any).parseJsonResponse(raw);
      expect(result.nik).toBe('3201010101010001');
    });

    it('should parse JSON preceded by conversational text and wrapped in markdown', () => {
      const raw = 'Saya siap mengekstrak data KTP Anda:\n```json\n{"nik": "3201010101010001", "isKtp": true}\n```\nSemoga membantu!';
      const result = (service as any).parseJsonResponse(raw);
      expect(result.nik).toBe('3201010101010001');
      expect(result.isKtp).toBe(true);
    });

    it('should throw BadRequestException when no JSON braces exist', () => {
      const raw = 'Saya siap membantu, tapi gambar ini bukan KTP.';
      expect(() => (service as any).parseJsonResponse(raw)).toThrow(BadRequestException);
    });
  });
});
