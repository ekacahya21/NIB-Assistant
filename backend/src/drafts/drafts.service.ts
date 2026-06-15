import { Injectable, NotFoundException } from '@nestjs/common';

export class DraftData {
  id?: string;
  namaPemilik: string;
  nik: string;
  tanggalLahir: string;
  nomorHp: string;
  email: string;
  alamatUsaha: string;
  alamatKtp?: string;
  provinsiKtp?: string;
  kotaKabupatenKtp?: string;
  kecamatanKtp?: string;
  kelurahanKtp?: string;
  kodePosKtp?: string;
  provinsi: string;
  kotaKabupaten: string;
  kecamatan: string;
  kelurahan: string;
  kodePos: string;
  namaUsaha: string;
  ceritaUsaha: string;
  modalUsaha: string;
  jumlahPekerja: string;
  caraPenjualan: string;
  kbliCode?: string;
  kbliTitle?: string;
  jenisKelamin?: string;
  latitude?: string;
  longitude?: string;
  updatedAt?: string;
}

@Injectable()
export class DraftsService {
  private readonly draftsRepo = new Map<string, DraftData>();

  create(data: DraftData): DraftData {
    const id = Math.random().toString(36).substring(2, 11).toUpperCase();
    const newDraft: DraftData = {
      ...data,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.draftsRepo.set(id, newDraft);
    return newDraft;
  }

  findOne(id: string): DraftData {
    const draft = this.draftsRepo.get(id);
    if (!draft) {
      throw new NotFoundException(`Draft with ID ${id} not found`);
    }
    return draft;
  }

  update(id: string, data: Partial<DraftData>): DraftData {
    const existing = this.findOne(id);
    const updated: DraftData = {
      ...existing,
      ...data,
      id, // ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };
    this.draftsRepo.set(id, updated);
    return updated;
  }

  findAll(): DraftData[] {
    return Array.from(this.draftsRepo.values());
  }
}
