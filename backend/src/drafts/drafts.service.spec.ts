/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { DraftsService, DraftData } from './drafts.service';
import { PrismaService } from '../prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('DraftsService', () => {
  let service: DraftsService;
  let prisma: PrismaService;

  const mockDraft = {
    id: 'DRAFT123',
    namaPemilik: 'John Doe',
    nik: '1234567890123456',
    tanggalLahir: '1990-01-01',
    nomorHp: '081234567890',
    email: 'john.doe@example.com',
    alamatUsaha: 'Jl. Merdeka No. 10',
    alamatKtp: 'Jl. Ktp No. 5',
    provinsiKtp: 'DKI Jakarta',
    kotaKabupatenKtp: 'Jakarta Selatan',
    kecamatanKtp: 'Cilandak',
    kelurahanKtp: 'Cilandak Barat',
    kodePosKtp: '12430',
    provinsi: 'DKI Jakarta',
    kotaKabupaten: 'Jakarta Selatan',
    kecamatan: 'Cilandak',
    kelurahan: 'Cilandak Barat',
    kodePos: '12430',
    namaUsaha: 'Toko Kelontong John',
    ceritaUsaha: 'Menjual barang kebutuhan sehari-hari.',
    modalUsaha: '10000000',
    jumlahPekerja: '2',
    jumlahPekerjaLakiLaki: '1',
    jumlahPekerjaPerempuan: '1',
    kbliCode: '47111',
    kbliTitle: 'Perdagangan Eceran Berbagai Macam Barang',
    jenisKelamin: 'Laki-laki',
    latitude: '-6.200000',
    longitude: '106.816666',
    luasTanah: '50',
    fotoLokasi: 'base64image',
    status: 'DRAFT',
    automationDuration: 120,
    errorMessage: null,
    logs: [],
    sumberPembiayaan: 'Mandiri',
    omzetTahunan: '50000000',
    modalKerja: '5000000',
    sudahBerjalan: 'Ya',
    tanggalMulaiUsaha: '2023-01-01',
    tanggalMulaiOperasional: '2023-01-15',
    jenisProdukJasa: 'Barang Campuran',
    cangkupanProduk: 'Lokal',
    kapasitas: '100',
    satuan: 'Pcs',
    sessionId: 'session-xyz',
    ossPassword: null,
    registrationCompleted: false,
    lastCompletedStep: null,
    checkpointData: null,
    updatedAt: new Date('2026-07-13T10:00:00Z'),
  };

  const mockPrismaService = {
    draft: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DraftsService>(DraftsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new draft if NIK does not exist', async () => {
      const inputData: DraftData = {
        namaPemilik: 'John Doe',
        nik: '1234567890123456',
        tanggalLahir: '1990-01-01',
        nomorHp: '081234567890',
        email: 'john.doe@example.com',
        alamatUsaha: 'Jl. Merdeka No. 10',
        provinsi: 'DKI Jakarta',
        kotaKabupaten: 'Jakarta Selatan',
        kecamatan: 'Cilandak',
        kelurahan: 'Cilandak Barat',
        kodePos: '12430',
        namaUsaha: 'Toko Kelontong John',
        ceritaUsaha: 'Menjual barang kebutuhan sehari-hari.',
        modalUsaha: '10000000',
        jumlahPekerja: '2',
      };

      jest.spyOn(prisma.draft, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.draft, 'create').mockResolvedValue(mockDraft);

      const result = await service.create(inputData);

      expect(prisma.draft.findFirst).toHaveBeenCalledWith({
        where: { nik: inputData.nik },
      });
      expect(prisma.draft.create).toHaveBeenCalled();
      expect(result.id).toBe(mockDraft.id);
      expect(result.updatedAt).toBe(mockDraft.updatedAt.toISOString());
    });

    it('should update existing draft if NIK already exists', async () => {
      const inputData: DraftData = {
        namaPemilik: 'John Doe Update',
        nik: '1234567890123456',
        tanggalLahir: '1990-01-01',
        nomorHp: '081234567890',
        email: 'john.doe@example.com',
        alamatUsaha: 'Jl. Merdeka No. 10',
        provinsi: 'DKI Jakarta',
        kotaKabupaten: 'Jakarta Selatan',
        kecamatan: 'Cilandak',
        kelurahan: 'Cilandak Barat',
        kodePos: '12430',
        namaUsaha: 'Toko Kelontong John',
        ceritaUsaha: 'Menjual barang kebutuhan sehari-hari.',
        modalUsaha: '10000000',
        jumlahPekerja: '2',
      };

      const updatedDraft = {
        ...mockDraft,
        namaPemilik: 'John Doe Update',
      };

      jest.spyOn(prisma.draft, 'findFirst').mockResolvedValue(mockDraft);
      jest.spyOn(prisma.draft, 'findUnique').mockResolvedValue(mockDraft);
      jest.spyOn(prisma.draft, 'update').mockResolvedValue(updatedDraft);

      const result = await service.create(inputData);

      expect(prisma.draft.findFirst).toHaveBeenCalledWith({
        where: { nik: inputData.nik },
      });
      expect(prisma.draft.update).toHaveBeenCalledWith({
        where: { id: mockDraft.id },
        data: expect.objectContaining({
          namaPemilik: 'John Doe Update',
        }),
      });
      expect(result.namaPemilik).toBe('John Doe Update');
    });
  });

  describe('findOne', () => {
    it('should return the draft when it exists', async () => {
      jest.spyOn(prisma.draft, 'findUnique').mockResolvedValue(mockDraft);

      const result = await service.findOne('DRAFT123');

      expect(prisma.draft.findUnique).toHaveBeenCalledWith({
        where: { id: 'DRAFT123' },
      });
      expect(result.id).toBe('DRAFT123');
    });

    it('should throw NotFoundException when draft does not exist', async () => {
      jest.spyOn(prisma.draft, 'findUnique').mockResolvedValue(null);

      await expect(service.findOne('NON_EXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update and return draft when it exists', async () => {
      const updateData = { namaUsaha: 'New Shop Name' };
      const updatedDraft = { ...mockDraft, ...updateData };

      jest.spyOn(prisma.draft, 'findUnique').mockResolvedValue(mockDraft);
      jest.spyOn(prisma.draft, 'update').mockResolvedValue(updatedDraft);

      const result = await service.update('DRAFT123', updateData);

      expect(prisma.draft.update).toHaveBeenCalledWith({
        where: { id: 'DRAFT123' },
        data: expect.objectContaining({
          namaUsaha: 'New Shop Name',
        }),
      });
      expect(result.namaUsaha).toBe('New Shop Name');
    });

    it('should throw NotFoundException on update if draft does not exist', async () => {
      jest.spyOn(prisma.draft, 'findUnique').mockResolvedValue(null);

      await expect(service.update('NON_EXISTENT', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all drafts sorted by updatedAt desc', async () => {
      jest.spyOn(prisma.draft, 'findMany').mockResolvedValue([mockDraft]);

      const result = await service.findAll();

      expect(prisma.draft.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { updatedAt: 'desc' },
      });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(mockDraft.id);
    });

    it('should filter by sessionId if provided', async () => {
      jest.spyOn(prisma.draft, 'findMany').mockResolvedValue([mockDraft]);

      const result = await service.findAll('session-xyz');

      expect(prisma.draft.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-xyz' },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result.length).toBe(1);
    });
  });

  describe('delete', () => {
    it('should delete the draft when it exists', async () => {
      jest.spyOn(prisma.draft, 'findUnique').mockResolvedValue(mockDraft);
      jest.spyOn(prisma.draft, 'delete').mockResolvedValue(mockDraft);

      await expect(service.delete('DRAFT123')).resolves.not.toThrow();

      expect(prisma.draft.delete).toHaveBeenCalledWith({
        where: { id: 'DRAFT123' },
      });
    });

    it('should throw NotFoundException on delete if draft does not exist', async () => {
      jest.spyOn(prisma.draft, 'findUnique').mockResolvedValue(null);

      await expect(service.delete('NON_EXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAverageDuration', () => {
    it('should return the average duration from database', async () => {
      jest.spyOn(prisma.draft, 'aggregate').mockResolvedValue({
        _avg: {
          automationDuration: 150,
        },
      } as any);

      const result = await service.getAverageDuration();

      expect(prisma.draft.aggregate).toHaveBeenCalledWith({
        _avg: {
          automationDuration: true,
        },
        where: {
          status: 'COMPLETED',
        },
      });
      expect(result).toBe(150);
    });

    it('should return default fallback value of 180 if average is null', async () => {
      jest.spyOn(prisma.draft, 'aggregate').mockResolvedValue({
        _avg: {
          automationDuration: null,
        },
      } as any);

      const result = await service.getAverageDuration();

      expect(result).toBe(180);
    });
  });
});
