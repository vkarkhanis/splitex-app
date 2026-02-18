import { FxRateService } from '../../services/fx-rate.service';

// Mock Firestore
const mockFxCache: Record<string, any> = {};

jest.mock('../../config/firebase', () => ({
  db: {
    collection: jest.fn().mockImplementation((collectionPath: string) => {
      return {
        doc: jest.fn().mockImplementation((docId: string) => ({
          get: jest.fn().mockImplementation(() => {
            const data = mockFxCache[docId];
            return Promise.resolve({ exists: !!data, data: () => data || null, id: docId });
          }),
          set: jest.fn().mockImplementation((data: any) => {
            mockFxCache[docId] = data;
            return Promise.resolve();
          }),
        })),
      };
    }),
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('FxRateService', () => {
  let service: FxRateService;

  beforeEach(() => {
    Object.keys(mockFxCache).forEach(k => delete mockFxCache[k]);
    mockFetch.mockReset();
    service = new FxRateService();
  });

  describe('getRate', () => {
    it('should return rate 1 when from === to', async () => {
      const rate = await service.getRate('USD', 'USD');
      expect(rate.rate).toBe(1);
      expect(rate.from).toBe('USD');
      expect(rate.to).toBe('USD');
    });

    it('should use predefined rate when mode is predefined and rate exists', async () => {
      const predefined = { 'USD_INR': 83.5 };
      const rate = await service.getRate('USD', 'INR', predefined, 'predefined');
      expect(rate.rate).toBe(83.5);
      expect(rate.source).toBe('predefined');
    });

    it('should use reverse predefined rate when forward key not found', async () => {
      const predefined = { 'INR_USD': 0.012 };
      const rate = await service.getRate('USD', 'INR', predefined, 'predefined');
      // 1 / 0.012 ≈ 83.333333
      expect(rate.rate).toBeCloseTo(83.333333, 4);
      expect(rate.source).toBe('predefined');
    });

    it('should fall through to EOD when predefined mode but no rate found', async () => {
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `USD_${today}`;
      mockFxCache[cacheKey] = {
        base: 'USD',
        rates: { INR: 83.2 },
        date: today,
      };

      const rate = await service.getRate('USD', 'INR', {}, 'predefined');
      expect(rate.rate).toBe(83.2);
      expect(rate.source).toBe('eod');
    });
  });

  describe('getEodRate', () => {
    it('should return cached rate if available', async () => {
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `EUR_${today}`;
      mockFxCache[cacheKey] = {
        base: 'EUR',
        rates: { USD: 1.08, GBP: 0.86 },
        date: today,
      };

      const rate = await service.getEodRate('EUR', 'USD');
      expect(rate.rate).toBe(1.08);
      expect(rate.source).toBe('eod');
      // fetch should NOT have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch from API when cache miss and cache the result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: 'success',
          rates: { INR: 83.5, EUR: 0.92, GBP: 0.79 },
        }),
      });

      const rate = await service.getEodRate('USD', 'INR');
      expect(rate.rate).toBe(83.5);
      expect(rate.source).toBe('eod');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify it was cached
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `USD_${today}`;
      expect(mockFxCache[cacheKey]).toBeDefined();
      expect(mockFxCache[cacheKey].rates.INR).toBe(83.5);
    });

    it('should throw if API returns non-ok response and no cache fallback', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(service.getEodRate('USD', 'INR'))
        .rejects.toThrow('Failed to fetch FX rate USD→INR');
    });

    it('should throw if target currency not in API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: 'success',
          rates: { EUR: 0.92 }, // no INR
        }),
      });

      await expect(service.getEodRate('USD', 'INR'))
        .rejects.toThrow('Failed to fetch FX rate USD→INR');
    });

    it('should use reverse cache as fallback when API fails', async () => {
      const today = new Date().toISOString().split('T')[0];
      // Cache has INR->USD but not USD->INR
      mockFxCache[`INR_${today}`] = {
        base: 'INR',
        rates: { USD: 0.012 },
        date: today,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const rate = await service.getEodRate('USD', 'INR');
      // 1 / 0.012 ≈ 83.333333
      expect(rate.rate).toBeCloseTo(83.333333, 4);
      expect(rate.source).toBe('eod');
    });
  });

  describe('convert', () => {
    it('should convert amount with proper rounding', () => {
      expect(service.convert(100, 83.5)).toBe(8350);
      expect(service.convert(33.33, 83.5)).toBe(2783.06);
      expect(service.convert(0, 83.5)).toBe(0);
    });

    it('should handle rate of 1', () => {
      expect(service.convert(100, 1)).toBe(100);
    });

    it('should handle very small rates', () => {
      expect(service.convert(8350, 0.012)).toBe(100.2);
    });
  });

  describe('getPaymentProvider', () => {
    it('should return razorpay for INR', () => {
      expect(service.getPaymentProvider('INR')).toBe('razorpay');
    });

    it('should return stripe for non-INR currencies', () => {
      expect(service.getPaymentProvider('USD')).toBe('stripe');
      expect(service.getPaymentProvider('EUR')).toBe('stripe');
      expect(service.getPaymentProvider('GBP')).toBe('stripe');
    });
  });
});
