/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { DraftsController } from './drafts.controller';
import { DraftsService, DraftData } from './drafts.service';
import { AdminGuard } from '../auth/admin.guard';

describe('DraftsController', () => {
  let controller: DraftsController;
  let service: DraftsService;

  const mockDraftData: DraftData = {
    id: 'DRAFT123',
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
    updatedAt: '2026-07-13T10:00:00.000Z',
  };

  const mockDraftsService = {
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    findAll: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DraftsController],
      providers: [
        {
          provide: DraftsService,
          useValue: mockDraftsService,
        },
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<DraftsController>(DraftsController);
    service = module.get<DraftsService>(DraftsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should delegate to DraftsService.create', async () => {
      jest.spyOn(service, 'create').mockResolvedValue(mockDraftData);

      const result = await controller.create(mockDraftData);

      expect(service.create).toHaveBeenCalledWith(mockDraftData);
      expect(result).toBe(mockDraftData);
    });
  });

  describe('findOne', () => {
    it('should delegate to DraftsService.findOne', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockDraftData);

      const result = await controller.findOne('DRAFT123');

      expect(service.findOne).toHaveBeenCalledWith('DRAFT123');
      expect(result).toBe(mockDraftData);
    });
  });

  describe('update', () => {
    it('should delegate to DraftsService.update', async () => {
      const updateData = { namaUsaha: 'Updated Shop Name' };
      const updatedDraft = { ...mockDraftData, ...updateData };
      jest.spyOn(service, 'update').mockResolvedValue(updatedDraft);

      const result = await controller.update('DRAFT123', updateData);

      expect(service.update).toHaveBeenCalledWith('DRAFT123', updateData);
      expect(result).toBe(updatedDraft);
    });
  });

  describe('findAll', () => {
    it('should delegate to DraftsService.findAll without sessionId', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue([mockDraftData]);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([mockDraftData]);
    });

    it('should delegate to DraftsService.findAll with sessionId', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue([mockDraftData]);

      const result = await controller.findAll('session-xyz');

      expect(service.findAll).toHaveBeenCalledWith('session-xyz');
      expect(result).toEqual([mockDraftData]);
    });
  });

  describe('delete', () => {
    it('should delegate to DraftsService.delete', async () => {
      jest.spyOn(service, 'delete').mockResolvedValue(undefined);

      await expect(controller.delete('DRAFT123')).resolves.not.toThrow();

      expect(service.delete).toHaveBeenCalledWith('DRAFT123');
    });
  });
});
