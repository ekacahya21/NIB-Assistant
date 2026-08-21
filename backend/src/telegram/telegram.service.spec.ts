import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'TELEGRAM_BOT_TOKEN') return 'test_bot_token';
              if (key === 'TELEGRAM_CHAT_ID') return 'test_chat_id';
              if (key === 'NODE_ENV') return 'development';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);

    // Mock global fetch
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        ),
      );

    // Call lifecycle hooks manually
    service.onModuleInit();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('escapeHtml', () => {
    it('should correctly escape special HTML characters', () => {
      const text = 'Hello <World> & Welcome!';
      const escaped = service.escapeHtml(text);
      expect(escaped).toBe('Hello &lt;World&gt; &amp; Welcome!');
    });

    it('should return empty string for null/undefined/empty input', () => {
      expect(service.escapeHtml('')).toBe('');
      expect(service.escapeHtml(undefined as any)).toBe('');
    });
  });

  describe('sendMessage', () => {
    it('should call fetch to Telegram API with formatted message', async () => {
      await service.sendMessage('Test Message');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest_bot_token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.any(String),
        }),
      );

      const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(requestBody.chat_id).toBe('test_chat_id');
      expect(requestBody.text).toContain('Test Message');
      expect(requestBody.parse_mode).toBe('HTML');
    });

    it('should de-duplicate messages sent within cooldown period', async () => {
      // Send first message
      await service.sendMessage('Message A');
      // Send duplicate message
      await service.sendMessage('Message A');

      // fetch should only be called once
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should send different messages without de-duplication', async () => {
      await service.sendMessage('Message C');
      await service.sendMessage('Message D');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
