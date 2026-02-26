import { RevenueCatService } from '../../services/billing/revenuecat.service';

describe('RevenueCatService', () => {
  let service: RevenueCatService;

  beforeEach(() => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    delete process.env.REVENUECAT_PRO_ENTITLEMENT_ID;
    service = new RevenueCatService();
  });

  it('parses webhook event payload', () => {
    const parsed = service.parseEvent({
      event: {
        id: 'evt-1',
        type: 'INITIAL_PURCHASE',
        app_user_id: 'user-1',
        entitlement_ids: ['pro'],
      },
    });
    expect(parsed.id).toBe('evt-1');
    expect(parsed.type).toBe('INITIAL_PURCHASE');
    expect(parsed.app_user_id).toBe('user-1');
  });

  it('maps pro events to pro tier', () => {
    const event = service.parseEvent({
      event: { type: 'INITIAL_PURCHASE', app_user_id: 'user-1' },
    });
    expect(service.mapTier(event)).toBe('pro');
    expect(service.mapStatus(event)).toBe('active');
  });

  it('maps cancellation/expiration to free tier and expired status', () => {
    const event = service.parseEvent({
      event: { type: 'EXPIRATION', app_user_id: 'user-1' },
    });
    expect(service.mapTier(event)).toBe('free');
    expect(service.mapStatus(event)).toBe('expired');
  });

  it('validates webhook secret when configured', () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = 'secret123';
    const secureService = new RevenueCatService();
    expect(secureService.validateWebhookSecret('secret123')).toBe(true);
    expect(secureService.validateWebhookSecret('nope')).toBe(false);
  });

  it('resolves user id from aliases fallback', () => {
    const event = service.parseEvent({
      event: { aliases: ['alias-user-1'] },
    });
    expect(service.resolveUserId(event)).toBe('alias-user-1');
  });

  it('maps billing issue to billing_retry and expiry from ms timestamp', () => {
    const event = service.parseEvent({
      event: { type: 'BILLING_ISSUE', expiration_at_ms: 1735689600000 },
    });
    expect(service.mapStatus(event)).toBe('billing_retry');
    expect(service.getExpiry(event)).toBe('2025-01-01T00:00:00.000Z');
  });

  it('honors configured pro entitlement id', () => {
    process.env.REVENUECAT_PRO_ENTITLEMENT_ID = 'traxettle_pro';
    const configuredService = new RevenueCatService();
    const event = configuredService.parseEvent({
      event: { entitlement_ids: ['traxettle_pro'] },
    });
    expect(configuredService.mapTier(event)).toBe('pro');
  });
});
