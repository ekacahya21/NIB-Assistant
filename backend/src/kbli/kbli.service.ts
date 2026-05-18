import { Injectable } from '@nestjs/common';

export interface KBLIRecord {
  code: string;
  title: string;
  description: string;
  confidence: 'sangat_cocok' | 'alternatif';
  suitableFor: string[];
}

@Injectable()
export class KbliService {
  private readonly kbliList: KBLIRecord[] = [
    {
      code: '56103',
      title: 'Kedai Makanan',
      description: 'Usaha jasa pangan yang bertempat di sebagian atau seluruh bangunan tetap yang menyajikan makanan dan minuman siap saji langsung ke pelanggan.',
      confidence: 'sangat_cocok',
      suitableFor: ['warung makan', 'kedai bakso', 'makanan rumahan', 'ayam geprek', 'mie ayam'],
    },
    {
      code: '56210',
      title: 'Jasa Boga Untuk Suatu Event Tertentu (Catering)',
      description: 'Penyediaan makanan dan minuman atas dasar kontrak/pesanan untuk suatu acara tertentu seperti pesta, rapat, atau hajatan.',
      confidence: 'alternatif',
      suitableFor: ['catering pernikahan', 'nasi kotak syukuran', 'pesanan kue basah'],
    },
    {
      code: '56104',
      title: 'Penyediaan Makanan Keliling / Tempat Tidak Tetap',
      description: 'Penyediaan makanan yang dijajakan secara berkeliling atau menggunakan fasilitas tidak permanen seperti gerobak, pikulan, atau food truck.',
      confidence: 'alternatif',
      suitableFor: ['gerobak keliling', 'food truck', 'kaki lima bongkar pasang'],
    },
    {
      code: '47711',
      title: 'Perdagangan Eceran Pakaian',
      description: 'Perdagangan eceran berbagai jenis pakaian jadi baik dari bahan tekstil, rajutan, kulit, untuk pria, wanita, maupun anak-anak.',
      confidence: 'sangat_cocok',
      suitableFor: ['butik pakaian', 'jualan hijab online', 'reseller baju jadi', 'toko daster'],
    },
    {
      code: '47911',
      title: 'Perdagangan Eceran Melalui Media (Online/Internet)',
      description: 'Perdagangan eceran berbagai jenis barang melayani pesanan lewat pos, telepon, marketplace, media sosial, atau website.',
      confidence: 'alternatif',
      suitableFor: ['online shop instagram', 'reseller shopee/tokopedia', 'dropshipper baju'],
    },
    {
      code: '47712',
      title: 'Perdagangan Eceran Alas Kaki',
      description: 'Perdagangan eceran berbagai jenis alas kaki/sepatu/sandal dari bahan kulit, karet, plastik, atau sintetis.',
      confidence: 'alternatif',
      suitableFor: ['toko sepatu lokal', 'jualan sandal jepit', 'reseller sepatu olahraga'],
    },
    {
      code: '96200',
      title: 'Jasa Pencucian dan Pembersihan (Laundry)',
      description: 'Jasa pencucian, pembersihan, setrika pakaian jadi, sprei, karpet, jas baik kiloan maupun satuan.',
      confidence: 'sangat_cocok',
      suitableFor: ['laundry kiloan', 'cuci sepatu & helm', 'dry cleaning jas', 'setrika rumahan'],
    },
    {
      code: '96999',
      title: 'Aktivitas Jasa Perorangan Lainnya YTDL',
      description: 'Penyediaan jasa perorangan lainnya yang belum tercakup di tempat lain seperti pangkas rambut keliling atau jasa setrika panggilan.',
      confidence: 'alternatif',
      suitableFor: ['jasa bersih rumah', 'jasa setrika panggilan', 'salon rumahan'],
    },
  ];

  async search(query: string): Promise<KBLIRecord[]> {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      // Default to food codes
      return this.kbliList.filter((k) => k.code.startsWith('56'));
    }

    const vertexProject = process.env.VERTEX_AI_PROJECT;
    const vertexLocation = process.env.VERTEX_AI_LOCATION || 'us-central1';
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

    if (vertexProject || apiKey) {
      try {
        console.log(`[KBLI Agent] Executing online Google ADK agent search for: "${query}"`);
        // Dynamically import ADK modules to prevent initial compilation load issues
        const { LlmAgent, InMemoryRunner, GOOGLE_SEARCH, stringifyContent, Gemini } = await import('@google/adk');

        let llmModel: any;
        if (vertexProject) {
          console.log(`[KBLI Agent] Using Vertex AI on Project ID: "${vertexProject}", Region: "${vertexLocation}"`);
          llmModel = new Gemini({
            model: 'gemini-2.5-flash',
            vertexai: true,
            project: vertexProject,
            location: vertexLocation
          });
        } else {
          console.log(`[KBLI Agent] Using Google AI Studio Gemini API Key.`);
          llmModel = 'gemini-2.5-flash';
        }

        const agent = new LlmAgent({
          name: 'kbli_search_agent',
          model: llmModel,
          instruction: `Anda adalah agen AI pencari kode KBLI (Klasifikasi Baku Lapangan Usaha Indonesia) 2020 yang handal.
Tugas Anda adalah:
1. Menganalisis deskripsi usaha yang dimasukkan oleh pengguna.
2. Menggunakan pencarian online (Google Search) bila diperlukan untuk menemukan kecocokan kode KBLI 2020 resmi terbaru yang paling akurat dari BPS atau Lembaga OSS.
3. Memberikan rekomendasi KBLI yang paling cocok dalam format JSON yang valid.

Kriteria 'confidence' harus bernilai 'sangat_cocok' untuk 1-2 kecocokan utama, dan 'alternatif' untuk rekomendasi pendukung.
Pastikan HANYA menghasilkan JSON yang valid, tanpa penjelasan markdown lain di luar blok code JSON (atau langsung kembalikan raw JSON agar mudah diparsing).`,
          tools: [GOOGLE_SEARCH]
        });

        const runner = new InMemoryRunner({
          agent,
          appName: 'KBLIAssistant'
        });

        const prompt = `Cari kode KBLI 2020 yang paling sesuai untuk deskripsi usaha/aktivitas berikut: "${query}".

Anda harus mengembalikan hasilnya dalam bentuk JSON array of objects yang valid tanpa penjelasan apapun di luar JSON block. Setiap objek dalam array harus memiliki skema berikut:
[
  {
    "code": "string (5 digit kode KBLI, contoh: '56103')",
    "title": "string (Nama resmi KBLI 2020, contoh: 'Kedai Makanan')",
    "description": "string (Deskripsi resmi cakupan aktivitas KBLI tersebut)",
    "confidence": "string (Hanya boleh 'sangat_cocok' atau 'alternatif')",
    "suitableFor": ["string", "string" (Contoh aktivitas/keyword populer yang cocok, minimal 3)]
  }
]

Berikan minimal 3 dan maksimal 6 rekomendasi KBLI yang relevan. Prioritaskan kode KBLI 2020 yang paling mendekati deskripsi usaha pengguna.
Kembalikan HANYA array JSON tersebut saja!`;

        const stream = runner.runEphemeral({
          userId: 'user-session',
          newMessage: {
            role: 'user',
            parts: [{ text: prompt }]
          }
        });

        let fullText = '';
        for await (const event of stream) {
          if (event.errorMessage) {
            console.error(`[KBLI Agent] LLM Error received from ADK: "${event.errorMessage}" (Code: ${event.errorCode})`);
            throw new Error(`Vertex AI LLM Error: ${event.errorMessage}`);
          }
          const text = stringifyContent(event);
          if (text) {
            fullText += text;
          }
        }

        const trimmedText = fullText.trim();
        if (!trimmedText) {
          throw new Error('KBLI AI Search Agent returned an empty text response.');
        }

        try {
          const match = trimmedText.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (match) {
            const records = JSON.parse(match[0]) as KBLIRecord[];
            if (Array.isArray(records) && records.length > 0) {
              console.log(`[KBLI Agent] Successfully retrieved ${records.length} records online.`);
              return records;
            }
          } else {
            const records = JSON.parse(trimmedText) as KBLIRecord[];
            if (Array.isArray(records) && records.length > 0) {
              console.log(`[KBLI Agent] Successfully retrieved ${records.length} records online from raw text.`);
              return records;
            }
          }
          throw new Error('No valid KBLI records array could be extracted from agent response.');
        } catch (parseError) {
          console.error('[KBLI Agent] Failed to parse JSON from AI Agent response text:', parseError);
          console.debug('[KBLI Agent] Raw text was:', fullText);
          throw parseError;
        }
      } catch (error) {
        console.error('[KBLI Agent] Error executing ADK agent search:', error);
        // Fall back gracefully to local static search
      }
    } else {
      console.warn('[KBLI Agent] Neither Vertex AI nor Gemini API Key is configured. Falling back to local static search.');
    }


    // Filter list based on title, description, or tags matching keywords
    const matches = this.kbliList.filter(
      (k) =>
        k.title.toLowerCase().includes(q) ||
        k.description.toLowerCase().includes(q) ||
        k.suitableFor.some((tag) => tag.includes(q))
    );

    if (matches.length > 0) {
      return matches;
    }

    // If no direct matches, return general food suggestions
    return this.kbliList.filter((k) => k.code === '56103' || k.code === '47711' || k.code === '96200');
  }
}

