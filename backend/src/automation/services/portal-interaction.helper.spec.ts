import { Test, TestingModule } from '@nestjs/testing';
import { PortalInteractionHelper } from './portal-interaction.helper';
import { Logger } from '@nestjs/common';
import { AutomationSessionContext } from '../context/automation-session.context';

describe('PortalInteractionHelper', () => {
  let helper: PortalInteractionHelper;

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PortalInteractionHelper],
    }).compile();

    helper = module.get<PortalInteractionHelper>(PortalInteractionHelper);
    // Override logger
    (helper as any).logger = mockLogger;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(helper).toBeDefined();
  });

  describe('getOptimalSearchQuery', () => {
    it('should split by dot if it contains one', () => {
      const query = 'KOTA ADM. JAKARTA PUSAT';
      const result = helper.getOptimalSearchQuery(query);
      expect(result).toBe('ADM.');
    });

    it('should return input if length is 2 words or less', () => {
      const query = 'DIY';
      const result = helper.getOptimalSearchQuery(query);
      expect(result).toBe('DIY');
    });
  });

  describe('extractAndStoreToken', () => {
    it('should extract token from url and store it in context', () => {
      const url = 'https://oss.go.id/register?auth-code=my-secret-jwt-token&other=param';
      const context: AutomationSessionContext = {
        page: null,
        draft: null,
        subject: null as any,
        akunOss: 'belum',
        txId: 'draft-id',
        logStep: jest.fn(),
        waitForOtp: jest.fn(),
        waitForPassword: jest.fn(),
        waitForProductInput: jest.fn(),
        waitForParameterInput: jest.fn(),
      };

      helper.extractAndStoreToken(url, context);
      expect(context.jwtToken).toBe('my-secret-jwt-token');
    });

    it('should extract token from url hash and store it in context', () => {
      const url = 'https://oss.go.id/#/dashboard?auth-code=my-hash-token';
      const context: AutomationSessionContext = {
        page: null,
        draft: null,
        subject: null as any,
        akunOss: 'belum',
        txId: 'draft-id',
        logStep: jest.fn(),
        waitForOtp: jest.fn(),
        waitForPassword: jest.fn(),
        waitForProductInput: jest.fn(),
        waitForParameterInput: jest.fn(),
      };

      helper.extractAndStoreToken(url, context);
      expect(context.jwtToken).toBe('my-hash-token');
    });
  });
});
