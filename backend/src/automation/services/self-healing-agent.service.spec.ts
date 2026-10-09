import { SelfHealingAgentService } from './self-healing-agent.service';

describe('SelfHealingAgentService', () => {
  let service: SelfHealingAgentService;

  beforeEach(() => {
    service = new SelfHealingAgentService();
  });

  describe('Selector Caching', () => {
    it('should generate consistent cache keys from full URLs or paths', () => {
      const key1 = service.getCacheKey(
        'https://oss.go.id/permohonan/data-usaha?tab=1',
        'Tombol Simpan',
      );
      const key2 = service.getCacheKey(
        'https://oss.go.id/permohonan/data-usaha',
        'tombol simpan ',
      );
      expect(key1).toBe('/permohonan/data-usaha#tombol simpan');
      expect(key2).toBe('/permohonan/data-usaha#tombol simpan');
    });

    it('should set and get cached selectors accurately', () => {
      const url = 'https://oss.go.id/permohonan/data-usaha';
      const desc = 'Tombol Lanjut Step 2';
      const selector = '#btn-next-step-v2';

      expect(service.getCachedSelector(url, desc)).toBeUndefined();

      service.setCachedSelector(url, desc, selector);
      expect(service.getCachedSelector(url, desc)).toBe(selector);

      service.clearCache();
      expect(service.getCachedSelector(url, desc)).toBeUndefined();
    });
  });

  describe('Circuit Breaker', () => {
    it('should allow attempts within limits', () => {
      const draftId = 'draft-test-123';
      const res1 = service.checkAndIncrementCircuitBreaker(draftId, 1);
      expect(res1.allowed).toBe(true);

      const res2 = service.checkAndIncrementCircuitBreaker(draftId, 1);
      expect(res2.allowed).toBe(true);

      const res3 = service.checkAndIncrementCircuitBreaker(draftId, 1);
      expect(res3.allowed).toBe(true);
    });

    it('should block attempts exceeding per-step limit (max 3)', () => {
      const draftId = 'draft-test-step-limit';
      service.checkAndIncrementCircuitBreaker(draftId, 2);
      service.checkAndIncrementCircuitBreaker(draftId, 2);
      service.checkAndIncrementCircuitBreaker(draftId, 2);

      const res4 = service.checkAndIncrementCircuitBreaker(draftId, 2);
      expect(res4.allowed).toBe(false);
      expect(res4.reason).toContain('Maksimal pemulihan otomatis langkah 2');
    });

    it('should block attempts exceeding total session limit (max 8)', () => {
      const draftId = 'draft-test-total-limit';
      // Step 1: 3 times
      service.checkAndIncrementCircuitBreaker(draftId, 1);
      service.checkAndIncrementCircuitBreaker(draftId, 1);
      service.checkAndIncrementCircuitBreaker(draftId, 1);

      // Step 2: 3 times
      service.checkAndIncrementCircuitBreaker(draftId, 2);
      service.checkAndIncrementCircuitBreaker(draftId, 2);
      service.checkAndIncrementCircuitBreaker(draftId, 2);

      // Step 3: 2 times (total 8)
      service.checkAndIncrementCircuitBreaker(draftId, 3);
      service.checkAndIncrementCircuitBreaker(draftId, 3);

      // 9th attempt in Step 3
      const res9 = service.checkAndIncrementCircuitBreaker(draftId, 3);
      expect(res9.allowed).toBe(false);
      expect(res9.reason).toContain('Maksimal total pemulihan otomatis');
    });

    it('should reset circuit breaker for draft', () => {
      const draftId = 'draft-test-reset';
      service.checkAndIncrementCircuitBreaker(draftId, 1);
      service.resetCircuitBreaker(draftId);

      const res = service.checkAndIncrementCircuitBreaker(draftId, 1);
      expect(res.allowed).toBe(true);
    });
  });

  describe('Response Parsing', () => {
    it('should parse valid JSON response', () => {
      const json = JSON.stringify({
        action: 'CLICK',
        selector: 'button.btn-primary',
        reason: 'Tombol simpan ditemukan',
      });
      const parsed = service.parseActionResponse(json);
      expect(parsed).not.toBeNull();
      expect(parsed?.action).toBe('CLICK');
      expect(parsed?.selector).toBe('button.btn-primary');
    });

    it('should clean and parse markdown code blocks', () => {
      const markdown = '```json\n{"action": "FILL", "selector": "input#modal", "value": "10000000"}\n```';
      const parsed = service.parseActionResponse(markdown);
      expect(parsed).not.toBeNull();
      expect(parsed?.action).toBe('FILL');
      expect(parsed?.value).toBe('10000000');
    });

    it('should return null for invalid JSON or missing action', () => {
      expect(service.parseActionResponse('not json at all')).toBeNull();
      expect(service.parseActionResponse('{"foo": "bar"}')).toBeNull();
    });
  });

  describe('Prompt Construction', () => {
    it('should include target description and action type in prompt', () => {
      const prompt = service.buildPrompt({
        targetDescription: 'Input Omzet Tahunan',
        actionType: 'fill',
        expectedValue: '50000000',
        currentUrl: 'https://oss.go.id/permohonan',
      });

      expect(prompt).toContain('Input Omzet Tahunan');
      expect(prompt).toContain('FILL');
      expect(prompt).toContain('50000000');
      expect(prompt).toContain('PROMPT_USER');
      expect(prompt).toContain('DISMISS_POPUP');
    });
  });
});
