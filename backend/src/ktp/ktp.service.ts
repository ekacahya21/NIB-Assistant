import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { KtpExtractionResponseDto } from './dto/ktp-extraction-response.dto';

@Injectable()
export class KtpService {
  private readonly logger = new Logger(KtpService.name);

  /**
   * Extract structured data from KTP image buffer using Gemini Vision AI.
   */
  async extractKtp(
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<KtpExtractionResponseDto> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('File gambar KTP kosong.');
    }

    const localHost = process.env.LOCAL_LLM_HOST;
    const localKey = process.env.LOCAL_LLM_KEY;
    const localModel = process.env.LOCAL_LLM_MODEL || 'combo-max';

    const geminiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY;

    if (!localHost && !geminiKey) {
      this.logger.error(
        'Neither LOCAL_LLM_HOST nor GEMINI_API_KEY is configured in environment.',
      );
      throw new InternalServerErrorException(
        'Layanan AI Vision belum dikonfigurasi pada server.',
      );
    }

    const base64Image = fileBuffer.toString('base64');
    const prompt = `Anda adalah asisten OCR dan analisis dokumen resmi KTP (Kartu Tanda Penduduk) Republik Indonesia.
Tugas Anda adalah membaca dan mengekstrak data dari foto KTP yang diberikan secara akurat ke dalam format JSON.

PENTING:
1. Pastikan dokumen yang diberikan adalah KTP Indonesia. Jika BUKAN KTP atau gambar sama sekali tidak terbaca/sangat buram, kembalikan JSON dengan: {"isKtp": false, "error": "Gambar bukan KTP Indonesia atau tidak dapat dibaca."}.
2. Normalisasikan field berikut:
   - "nik": 16 digit angka tanpa spasi/simbol.
   - "namaPemilik": Nama lengkap dalam HURUF BESAR (UPPERCASE).
   - "tempatLahir": Kota/kabupaten tempat lahir (UPPERCASE).
   - "tanggalLahir": Format standar ISO "YYYY-MM-DD" (contoh: jika di KTP tertulis "15-08-1990", ubah menjadi "1990-08-15").
   - "jenisKelamin": Wajib persis "Laki-laki" atau "Perempuan".
   - "alamatKtp": Alamat jalan / nomor rumah / blok beserta RT/RW jika ada (UPPERCASE).
   - "rtRw": RT/RW (contoh: "001/002").
   - "kelurahanKtp": Nama Kelurahan / Desa (UPPERCASE).
   - "kecamatanKtp": Nama Kecamatan (UPPERCASE).
   - "kotaKabupatenKtp": Nama Kota atau Kabupaten (contoh: "KOTA DEPOK" atau "KABUPATEN BOGOR").
   - "provinsiKtp": Nama Provinsi (contoh: "JAWA BARAT", "DKI JAKARTA").
   - "agama": Agama jika tertera.
   - "statusPerkawinan": Status perkawinan jika tertera.
   - "pekerjaan": Pekerjaan jika tertera.
   - "isKtp": true

DILARANG KERAS menyertakan salam, teks pembuka/pengantar (seperti "Saya siap...", "Berikut adalah...", dll), atau teks penutup.
Kembalikan HANYA format JSON yang valid.`;

    try {
      let rawResponse = '';

      if (localHost) {
        try {
          this.logger.log(
            `Calling Local Vision LLM at ${localHost} using model ${localModel}...`,
          );
          rawResponse = await this.callLocalVisionLlm(
            localHost,
            localKey,
            localModel,
            base64Image,
            mimeType,
            prompt,
          );
        } catch (localErr: any) {
          this.logger.warn(
            `Local Vision LLM failed: ${localErr.message}. Fallback to Gemini if available.`,
          );
          if (geminiKey) {
            rawResponse = await this.callGeminiVision(
              geminiKey,
              base64Image,
              mimeType,
              prompt,
            );
          } else {
            throw localErr;
          }
        }
      } else if (geminiKey) {
        rawResponse = await this.callGeminiVision(
          geminiKey,
          base64Image,
          mimeType,
          prompt,
        );
      }

      const parsed = this.parseJsonResponse(rawResponse);

      if (parsed.isKtp === false || parsed.error) {
        throw new BadRequestException(
          parsed.error || 'Foto KTP tidak terbaca jelas atau bukan KTP yang valid.',
        );
      }

      const result: KtpExtractionResponseDto = {
        nik: parsed.nik ? String(parsed.nik).replace(/\D/g, '') : undefined,
        namaPemilik: parsed.namaPemilik?.trim() || undefined,
        tempatLahir: parsed.tempatLahir?.trim() || undefined,
        tanggalLahir: this.normalizeDate(parsed.tanggalLahir),
        jenisKelamin: this.normalizeGender(parsed.jenisKelamin),
        alamatKtp: parsed.alamatKtp?.trim() || undefined,
        rtRw: parsed.rtRw?.trim() || undefined,
        kelurahanKtp: parsed.kelurahanKtp?.trim() || undefined,
        kecamatanKtp: parsed.kecamatanKtp?.trim() || undefined,
        kotaKabupatenKtp: parsed.kotaKabupatenKtp?.trim() || undefined,
        provinsiKtp: parsed.provinsiKtp?.trim() || undefined,
        agama: parsed.agama?.trim() || undefined,
        statusPerkawinan: parsed.statusPerkawinan?.trim() || undefined,
        pekerjaan: parsed.pekerjaan?.trim() || undefined,
        confidence: 0.95,
      };

      if (!result.nik || result.nik.length < 15) {
        this.logger.warn(`Extracted NIK might be incomplete: ${result.nik}`);
      }

      return result;
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(`Error during KTP extraction: ${err.message}`, err.stack);
      throw new BadRequestException(
        'Gagal mengekstrak data KTP. Pastikan foto jelas, terang, dan tidak silau.',
      );
    }
  }

  private async callGeminiVision(
    apiKey: string,
    base64Data: string,
    mimeType: string,
    prompt: string,
  ): Promise<string> {
    const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    let lastError: any = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errBody = await res.text();
          this.logger.warn(
            `Gemini API error with model ${model} (status ${res.status}): ${errBody}`,
          );
          lastError = new Error(`API status ${res.status}: ${errBody}`);
          continue;
        }

        const data = await res.json();
        const text =
          data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          return text;
        }
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`Attempt with ${model} failed: ${err.message}`);
      }
    }

    throw lastError || new Error('All Gemini Vision model attempts failed.');
  }

  private async callLocalVisionLlm(
    host: string,
    key: string | undefined,
    model: string,
    base64Data: string,
    mimeType: string,
    prompt: string,
  ): Promise<string> {
    const cleanHost = host.replace(/\/$/, '');
    const url = `${cleanHost}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const payload = {
      model,
      stream: false,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Anda adalah OCR engine khusus analisis KTP Indonesia. Anda HANYA mengeluarkan JSON yang valid tanpa kata pengantar, salam, atau teks tambahan.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Local Vision LLM error (status ${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Local Vision LLM returned empty response.');
    }

    return content;
  }

  private normalizeGender(gender?: string): 'Laki-laki' | 'Perempuan' | undefined {
    if (!gender) return undefined;
    const g = gender.toLowerCase();
    if (g.includes('laki') || g.includes('pria') || g.startsWith('l')) {
      return 'Laki-laki';
    }
    if (g.includes('perempuan') || g.includes('wanita') || g.startsWith('p')) {
      return 'Perempuan';
    }
    return undefined;
  }

  private normalizeDate(dateStr?: string): string | undefined {
    if (!dateStr) return undefined;
    const cleaned = dateStr.trim();

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned;
    }

    // DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    return cleaned;
  }

  /**
   * Safely extract and parse JSON object from LLM response text,
   * handling conversational preambles (e.g. "Saya siap..."), markdown blocks,
   * and non-JSON responses.
   */
  private parseJsonResponse(raw: string): any {
    if (!raw || typeof raw !== 'string') {
      throw new BadRequestException('Respon dari AI kosong atau tidak valid.');
    }

    let candidate = raw.trim();

    // 1. If wrapped in markdown code blocks ```json ... ``` or ``` ... ```
    const codeBlockMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      candidate = codeBlockMatch[1].trim();
    }

    // 2. Extract substring between first '{' and last '}'
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      candidate = candidate.substring(firstBrace, lastBrace + 1).trim();
    } else {
      this.logger.warn(`No JSON braces found in LLM response: ${raw.substring(0, 300)}`);
      throw new BadRequestException(
        'AI tidak dapat mendeteksi atau mengekstrak format KTP yang valid dari gambar yang diberikan.',
      );
    }

    try {
      return JSON.parse(candidate);
    } catch (err: any) {
      this.logger.error(
        `Failed to parse JSON from LLM: ${err.message}. Raw text: ${raw.substring(0, 500)}`,
      );
      throw new BadRequestException(
        'Gagal memproses data KTP dari respon AI. Silakan coba unggah foto yang lebih jelas.',
      );
    }
  }
}
