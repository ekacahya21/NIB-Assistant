import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export class DraftData {
  id?: string;
  namaPemilik!: string;
  nik!: string;
  tanggalLahir!: string;
  nomorHp!: string;
  email!: string;
  alamatUsaha!: string;
  alamatKtp?: string;
  provinsiKtp?: string;
  kotaKabupatenKtp?: string;
  kecamatanKtp?: string;
  kelurahanKtp?: string;
  kodePosKtp?: string;
  provinsi!: string;
  kotaKabupaten!: string;
  kecamatan!: string;
  kelurahan!: string;
  kodePos!: string;
  namaUsaha!: string;
  ceritaUsaha!: string;
  modalUsaha!: string;
  jumlahPekerja!: string;
  kbliCode?: string;
  kbliTitle?: string;
  jenisKelamin?: string;
  latitude?: string;
  longitude?: string;
  updatedAt?: string;
  luasTanah?: string;
  fotoLokasi?: string;
  status?: string;
  automationDuration?: number;
  sessionId?: string;
}

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: DraftData): Promise<DraftData> {
    // Check if a draft with the same NIK already exists
    const existingDraft = await this.prisma.draft.findFirst({
      where: { nik: data.nik },
    });

    if (existingDraft) {
      return this.update(existingDraft.id, data);
    }

    const id = Math.random().toString(36).substring(2, 11).toUpperCase();
    const newDraft = await this.prisma.draft.create({
      data: {
        id,
        namaPemilik: data.namaPemilik,
        nik: data.nik,
        tanggalLahir: data.tanggalLahir,
        nomorHp: data.nomorHp,
        email: data.email,
        alamatUsaha: data.alamatUsaha,
        alamatKtp: data.alamatKtp,
        provinsiKtp: data.provinsiKtp,
        kotaKabupatenKtp: data.kotaKabupatenKtp,
        kecamatanKtp: data.kecamatanKtp,
        kelurahanKtp: data.kelurahanKtp,
        kodePosKtp: data.kodePosKtp,
        provinsi: data.provinsi,
        kotaKabupaten: data.kotaKabupaten,
        kecamatan: data.kecamatan,
        kelurahan: data.kelurahan,
        kodePos: data.kodePos,
        namaUsaha: data.namaUsaha,
        ceritaUsaha: data.ceritaUsaha,
        modalUsaha: data.modalUsaha,
        jumlahPekerja: data.jumlahPekerja,
        kbliCode: data.kbliCode,
        kbliTitle: data.kbliTitle,
        jenisKelamin: data.jenisKelamin,
        latitude: data.latitude,
        longitude: data.longitude,
        luasTanah: data.luasTanah,
        fotoLokasi: data.fotoLokasi,
        status: data.status || 'DRAFT',
        automationDuration: data.automationDuration,
        sessionId: data.sessionId,
        updatedAt: new Date(),
      },
    });
    return this.mapToDraftData(newDraft);
  }

  async findOne(id: string): Promise<DraftData> {
    const draft = await this.prisma.draft.findUnique({
      where: { id },
    });
    if (!draft) {
      throw new NotFoundException(`Draft with ID ${id} not found`);
    }
    return this.mapToDraftData(draft);
  }

  async update(id: string, data: Partial<DraftData>): Promise<DraftData> {
    await this.findOne(id); // Throws if not found
    const updated = await this.prisma.draft.update({
      where: { id },
      data: {
        namaPemilik: data.namaPemilik,
        nik: data.nik,
        tanggalLahir: data.tanggalLahir,
        nomorHp: data.nomorHp,
        email: data.email,
        alamatUsaha: data.alamatUsaha,
        alamatKtp: data.alamatKtp,
        provinsiKtp: data.provinsiKtp,
        kotaKabupatenKtp: data.kotaKabupatenKtp,
        kecamatanKtp: data.kecamatanKtp,
        kelurahanKtp: data.kelurahanKtp,
        kodePosKtp: data.kodePosKtp,
        provinsi: data.provinsi,
        kotaKabupaten: data.kotaKabupaten,
        kecamatan: data.kecamatan,
        kelurahan: data.kelurahan,
        kodePos: data.kodePos,
        namaUsaha: data.namaUsaha,
        ceritaUsaha: data.ceritaUsaha,
        modalUsaha: data.modalUsaha,
        jumlahPekerja: data.jumlahPekerja,
        kbliCode: data.kbliCode,
        kbliTitle: data.kbliTitle,
        jenisKelamin: data.jenisKelamin,
        latitude: data.latitude,
        longitude: data.longitude,
        luasTanah: data.luasTanah,
        fotoLokasi: data.fotoLokasi,
        status: data.status,
        automationDuration: data.automationDuration,
        sessionId: data.sessionId,
        updatedAt: new Date(),
      },
    });
    return this.mapToDraftData(updated);
  }

  async findAll(sessionId?: string): Promise<DraftData[]> {
    const drafts = await this.prisma.draft.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
    return drafts.map((d) => this.mapToDraftData(d));
  }

  async delete(id: string): Promise<void> {
    const draft = await this.prisma.draft.findUnique({
      where: { id },
    });
    if (!draft) {
      throw new NotFoundException(`Draft with ID ${id} not found`);
    }
    await this.prisma.draft.delete({
      where: { id },
    });
  }

  async getAverageDuration(): Promise<number> {
    const result = await this.prisma.draft.aggregate({
      _avg: {
        automationDuration: true,
      },
      where: {
        status: 'COMPLETED',
      },
    });
    return result._avg.automationDuration || 180; // 180 seconds fallback
  }

  private mapToDraftData(draft: any): DraftData {
    return {
      ...draft,
      updatedAt: draft.updatedAt.toISOString(),
    };
  }
}
