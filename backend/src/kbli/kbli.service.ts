import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface KBLIRecord {
  code: string;
  title: string;
  description: string;
  confidence: 'sangat_cocok' | 'alternatif';
  suitableFor: string[];
  version?: string;
}

@Injectable()
export class KbliService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly cache = new Map<string, KBLIRecord[]>();

  async search(query: string): Promise<KBLIRecord[]> {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      try {
        console.log(
          '[KBLI Agent] Fetching default KBLI recommendations based on most chosen database entries...',
        );
        const grouped = await this.prisma.draft.groupBy({
          by: ['kbliCode', 'kbliTitle'],
          _count: {
            kbliCode: true,
          },
          where: {
            kbliCode: {
              not: '',
            },
            NOT: {
              kbliCode: null,
            },
          },
          orderBy: {
            _count: {
              kbliCode: 'desc',
            },
          },
          take: 3,
        });

        const results: KBLIRecord[] = [];
        for (const item of grouped) {
          if (!item.kbliCode) continue;
          results.push({
            code: item.kbliCode,
            title: item.kbliTitle || 'Aktivitas Usaha',
            description:
              'Aktivitas usaha yang direkomendasikan berdasarkan tren pendaftaran UMKM sebelumnya.',
            confidence: 'sangat_cocok',
            suitableFor: ['Paling banyak dipilih', 'Tren UMKM'],
            version: '2020',
          });
        }

        if (results.length < 3) {
          console.log(
            '[KBLI Agent] Backfilling default recommendations from TenderX API...',
          );
          const backfills = await this.queryTenderx('penyediaan makanan', 5);
          for (const item of backfills) {
            if (results.length >= 3) break;
            if (!results.some((r) => r.code === item.code)) {
              results.push(item);
            }
          }
        }

        return results.slice(0, 3);
      } catch (error) {
        console.error(
          '[KBLI Agent] Error fetching default KBLIs from database, falling back to TenderX search:',
          error,
        );
        return this.queryTenderx('penyediaan makanan', 3);
      }
    }

    if (this.cache.has(q)) {
      console.log(
        `[KBLI Agent] [CACHE HIT] Returning cached KBLI results for: "${q}"`,
      );
      return this.cache.get(q)!;
    }

    const vertexProject = process.env.VERTEX_AI_PROJECT;
    const vertexLocation = process.env.VERTEX_AI_LOCATION || 'us-central1';
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY;

    // Pre-fetch candidates from TenderX to supply to the LLMs as prompt context
    const cleanedQuery = this.cleanQueryForTenderx(q);
    const candidates = await this.queryTenderx(cleanedQuery, 5);

    if (vertexProject || apiKey) {
      try {
        console.log(
          `[KBLI Agent] Executing online Google ADK agent search for: "${query}"`,
        );
        // Dynamically import ADK modules to prevent initial compilation load issues
        const {
          LlmAgent,
          InMemoryRunner,
          GOOGLE_SEARCH,
          VertexAiSearchTool,
          stringifyContent,
          Gemini,
        } = await import('@google/adk');

        let llmModel: any;
        if (vertexProject) {
          console.log(
            `[KBLI Agent] Using Vertex AI on Project ID: "${vertexProject}", Region: "${vertexLocation}"`,
          );
          llmModel = new Gemini({
            model: 'gemini-2.5-flash',
            vertexai: true,
            project: vertexProject,
            location: vertexLocation,
          });
        } else {
          console.log(`[KBLI Agent] Using Google AI Studio Gemini API Key.`);
          llmModel = 'gemini-2.5-flash';
        }

        // Configure the search tool. Use Vertex AI Search (Data Store) if ID is configured to leverage trial credits.
        const rawDataStoreId = process.env.VERTEX_AI_DATASTORE_ID;
        let kbliSearchTool: any;

        if (rawDataStoreId) {
          let formattedDataStoreId = rawDataStoreId;
          if (!rawDataStoreId.startsWith('projects/')) {
            const project = vertexProject || 'jarvistant-ai-491514';
            const location =
              process.env.VERTEX_AI_DATASTORE_LOCATION || 'global';
            formattedDataStoreId = `projects/${project}/locations/${location}/collections/default_collection/dataStores/${rawDataStoreId}`;
          }

          console.log(
            `[KBLI Agent] Initializing Vertex AI Search with Formatted Data Store ID: "${formattedDataStoreId}"`,
          );
          kbliSearchTool = new VertexAiSearchTool({
            dataStoreId: formattedDataStoreId,
          });
        } else {
          console.log(
            `[KBLI Agent] VERTEX_AI_DATASTORE_ID is not configured. Using standard Web GOOGLE_SEARCH.`,
          );
          kbliSearchTool = GOOGLE_SEARCH;
        }

        const agent = new LlmAgent({
          name: 'kbli_search_agent',
          model: llmModel,
          instruction: `Anda adalah agen AI pencari kode KBLI (Klasifikasi Baku Lapangan Usaha Indonesia) 2020/2025 yang handal.
Tugas Anda adalah:
1. Menganalisis deskripsi usaha yang dimasukkan oleh pengguna.
2. Menggunakan tool pencarian KBLI (Vertex AI Search atau Google Search) untuk menemukan kecocokan kode KBLI resmi terbaru yang paling akurat dari BPS atau Lembaga OSS.
3. Memberikan rekomendasi KBLI yang paling cocok dalam format JSON yang valid.
4. Digit kode KBLI yang diperbolehkan hanyalah 5 digit.
5. Utamakan mencari kode KBLI versi tahun 2025, jika tidak ditemukan maka boleh menggunakan kode KBLI tahun 2020. namun jika ditemukan kode KBLI tahun 2025 maka gunakan kode KBLI tahun 2025.

Kriteria 'confidence' harus bernilai 'sangat_cocok' untuk 1-2 kecocokan utama, dan 'alternatif' untuk rekomendasi pendukung.
Pastikan HANYA menghasilkan JSON yang valid, tanpa penjelasan markdown lain di luar blok code JSON (atau langsung kembalikan raw JSON agar mudah diparsing).`,
          tools: [kbliSearchTool],
        });

        const runner = new InMemoryRunner({
          agent,
          appName: 'KBLIAssistant',
        });

        const prompt = `Cari kode KBLI yang paling sesuai untuk deskripsi usaha/aktivitas berikut: "${query}".

Berikut adalah daftar KBLI kandidat yang ditemukan dari registri lokal sebagai konteks awal:
${JSON.stringify(candidates, null, 2)}

Anda harus mengembalikan hasilnya dalam bentuk JSON array of objects yang valid tanpa penjelasan apapun di luar JSON block. Setiap objek dalam array harus memiliki skema berikut:
[
  {
    "code": "string (5 digit kode KBLI, contoh: '56101')",
    "title": "string (Nama resmi KBLI, contoh: 'Penyediaan Makanan Di Bangunan Tetap')",
    "description": "string (Deskripsi resmi cakupan aktivitas KBLI tersebut)",
    "confidence": "string (Hanya boleh 'sangat_cocok' atau 'alternatif')",
    "suitableFor": ["string", "string" (Contoh aktivitas/keyword populer yang cocok, minimal 3)],
    "version": "string (Tahun versi KBLI, hanya boleh '2020' atau '2025')"
  }
]

Berikan minimal 3 dan maksimal 6 rekomendasi KBLI yang relevan. Prioritaskan kode KBLI yang paling mendekati deskripsi usaha pengguna.
Kembalikan HANYA array JSON tersebut saja!`;

        const stream = runner.runEphemeral({
          userId: 'user-session',
          newMessage: {
            role: 'user',
            parts: [{ text: prompt }],
          },
        });

        let fullText = '';
        for await (const event of stream) {
          if (event.errorMessage) {
            console.error(
              `[KBLI Agent] LLM Error received from ADK: "${event.errorMessage}" (Code: ${event.errorCode})`,
            );
            throw new Error(`Vertex AI LLM Error: ${event.errorMessage}`);
          }
          const text = stringifyContent(event);
          if (text) {
            fullText += text;
          }
        }

        const trimmedText = fullText.trim();
        if (!trimmedText) {
          throw new Error(
            'KBLI AI Search Agent returned an empty text response.',
          );
        }

        try {
          const match = trimmedText.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (match) {
            const records = JSON.parse(match[0]) as KBLIRecord[];
            if (Array.isArray(records) && records.length > 0) {
              console.log(
                `[KBLI Agent] Successfully retrieved ${records.length} records online.`,
              );
              return this.cacheAndReturn(q, records);
            }
          } else {
            const records = JSON.parse(trimmedText) as KBLIRecord[];
            if (Array.isArray(records) && records.length > 0) {
              console.log(
                `[KBLI Agent] Successfully retrieved ${records.length} records online from raw text.`,
              );
              return this.cacheAndReturn(q, records);
            }
          }
          throw new Error(
            'No valid KBLI records array could be extracted from agent response.',
          );
        } catch (parseError) {
          console.error(
            '[KBLI Agent] Failed to parse JSON from AI Agent response text:',
            parseError,
          );
          console.debug('[KBLI Agent] Raw text was:', fullText);
          throw parseError;
        }
      } catch (error) {
        console.error('[KBLI Agent] Error executing ADK agent search:', error);
        console.log('[KBLI Agent] Trying Local LLM fallback...');
        const localLlmRecords = await this.queryLocalLlm(query, candidates);
        if (localLlmRecords) {
          return this.cacheAndReturn(q, localLlmRecords);
        }
      }
    } else {
      console.warn(
        '[KBLI Agent] Neither Vertex AI nor Gemini API Key is configured. Trying Local LLM fallback...',
      );
      const localLlmRecords = await this.queryLocalLlm(query, candidates);
      if (localLlmRecords) {
        return this.cacheAndReturn(q, localLlmRecords);
      }
    }

    // Final failsafe fallback: query TenderX directly and return
    console.log('[KBLI Agent] Falling back to direct TenderX API search...');
    let apiMatches = await this.queryTenderx(cleanedQuery, 6);
    if (apiMatches.length === 0 && cleanedQuery !== q) {
      apiMatches = await this.queryTenderx(q, 6);
    }

    if (apiMatches.length > 0) {
      return this.cacheAndReturn(q, apiMatches);
    }

    // Failsafe of failsafes: return a generic food/retail placeholder matching typical registrations
    const baseline = [
      {
        code: '56101',
        title: 'Aktivitas Penyediaan Makanan Di Bangunan Tetap',
        description: 'Usaha warung makan, kedai, cafe, rumah makan menetap.',
        confidence: 'sangat_cocok' as const,
        suitableFor: ['warung makan', 'kedai', 'cafe'],
      },
      {
        code: '47711',
        title: 'Perdagangan Eceran Pakaian',
        description: 'Perdagangan eceran berbagai jenis pakaian jadi.',
        confidence: 'alternatif' as const,
        suitableFor: ['butik pakaian', 'toko baju', 'reseller baju'],
      },
    ];
    this.cache.set(q, baseline);
    return baseline;
  }

  private async queryLocalLlm(
    query: string,
    candidates: KBLIRecord[],
  ): Promise<KBLIRecord[] | null> {
    const host = process.env.LOCAL_LLM_HOST || 'http://localhost:20128/v1';
    const key =
      process.env.LOCAL_LLM_KEY || 'sk-be6dc08e77bc7a4a-pk6lq6-69274223';
    const model = process.env.LOCAL_LLM_MODEL || 'combo-max';

    console.log(
      `[KBLI Agent] Attempting fallback to Local LLM at ${host} using model ${model}...`,
    );

    // If we have candidates from TenderX, provide them as verified catalog
    const catalogContext =
      candidates.length > 0
        ? `Berikut adalah daftar KBLI kandidat yang ditemukan dari registri:\n${JSON.stringify(candidates, null, 2)}`
        : 'Gunakan pengetahuan Anda untuk merumuskan kode KBLI resmi yang valid.';

    try {
      const response = await fetch(`${host}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model,
          stream: false,
          messages: [
            {
              role: 'system',
              content: `Anda adalah agen AI pencari kode KBLI (Klasifikasi Baku Lapangan Usaha Indonesia) yang handal.
${catalogContext}

Tugas Anda adalah:
1. Menganalisis deskripsi usaha yang dimasukkan oleh pengguna.
2. Mencari kecocokan dari daftar kandidat KBLI di atas (jika tersedia). Jika ada yang cocok, gunakan data tersebut. Jika tidak ada yang cocok, gunakan pengetahuan Anda untuk merumuskan kode KBLI resmi lainnya yang valid.
3. Memberikan rekomendasi KBLI yang paling cocok dalam format JSON array of objects yang valid tanpa penjelasan apapun di luar JSON block.
4. Digit kode KBLI yang diperbolehkan hanyalah 5 digit.
5. Utamakan mencari kode KBLI versi tahun 2025, jika tidak ditemukan maka boleh menggunakan kode KBLI tahun 2020. namun jika ditemukan kode KBLI tahun 2025 maka gunakan kode KBLI tahun 2025.

Setiap objek dalam array harus memiliki skema berikut:
[
  {
    "code": "string (5 digit kode KBLI, contoh: '56101')",
    "title": "string (Nama resmi KBLI, contoh: 'Penyediaan Makanan Di Bangunan Tetap')",
    "description": "string (Deskripsi resmi cakupan aktivitas KBLI tersebut)",
    "confidence": "string (Hanya boleh 'sangat_cocok' atau 'alternatif')",
    "suitableFor": ["string", "string" (Contoh aktivitas/keyword populer yang cocok, minimal 3)],
    "version": "string (Tahun versi KBLI, hanya boleh '2020' atau '2025')"
  }
]

Berikan minimal 3 dan maksimal 6 rekomendasi KBLI yang relevan. Prioritaskan kode KBLI yang paling mendekati deskripsi usaha pengguna.
Kembalikan HANYA array JSON tersebut saja! Jangan ada tulisan markdown seperti \`\`\`json atau penjelasan lainnya.`,
            },
            {
              role: 'user',
              content: `Cari kode KBLI yang paling sesuai untuk deskripsi usaha/aktivitas berikut: "${query}"`,
            },
          ],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('Local LLM returned an empty response.');
      }

      const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      const jsonText = match ? match[0] : text;
      const records = JSON.parse(jsonText) as KBLIRecord[];
      if (Array.isArray(records) && records.length > 0) {
        console.log(
          `[KBLI Agent] Successfully retrieved ${records.length} records from Local LLM.`,
        );
        return records;
      }
      return null;
    } catch (err) {
      console.error('[KBLI Agent] Local LLM query failed:', err);
      return null;
    }
  }

  private async queryTenderx(query: string, limit = 5): Promise<KBLIRecord[]> {
    try {
      const url = `https://tenderx.id/api/v1/kbli?q=${encodeURIComponent(query)}&limit=${limit}`;
      console.log(`[KBLI Agent] Querying TenderX API: ${url}`);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`TenderX HTTP error! status: ${res.status}`);
      }
      const json = await res.json();
      if (json && json.status === 'success' && Array.isArray(json.data)) {
        return json.data.map((item: any) => ({
          code: item.kode,
          title: this.capitalizeTitle(item.judul),
          description: `Aktivitas bidang usaha untuk ${this.capitalizeTitle(item.judul)} (Kategori ${item.kategori_huruf}).`,
          confidence: 'sangat_cocok' as const,
          suitableFor: [
            this.capitalizeTitle(item.judul).toLowerCase(),
            `kategori ${item.kategori_huruf}`,
          ],
          version: '2020',
        }));
      }
      return [];
    } catch (err) {
      console.error('[KBLI Agent] TenderX API query failed:', err);
      return [];
    }
  }

  private cleanQueryForTenderx(query: string): string {
    const q = query.toLowerCase().trim();
    const synonyms: Record<string, string> = {
      laundry: 'pencucian',
      warung: 'makanan',
      catering: 'boga',
      baju: 'pakaian',
      sepatu: 'alas kaki',
      toko: 'perdagangan',
      online: 'media',
      sembako: 'kelontong',
      kopi: 'minuman',
      kafe: 'minuman',
    };

    for (const key of Object.keys(synonyms)) {
      if (q.includes(key)) {
        return synonyms[key];
      }
    }
    return q;
  }

  private capitalizeTitle(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private sortKbliRecords(records: KBLIRecord[]): KBLIRecord[] {
    return [...records].sort((a, b) => {
      const scoreA = a.version === '2025' ? 2 : 1;
      const scoreB = b.version === '2025' ? 2 : 1;
      return scoreB - scoreA;
    });
  }

  private cacheAndReturn(q: string, records: KBLIRecord[]): KBLIRecord[] {
    const sorted = this.sortKbliRecords(records);
    this.cache.set(q, sorted);
    return sorted;
  }
}
