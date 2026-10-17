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

  it('maps expiration to free tier and expired status', () => {
    const event = service.parseEvent({
      event: { type: 'EXPIRATION', app_user_id: 'user-1' },
    });
    expect(service.mapTier(event)).toBe('free');
    expect(service.mapStatus(event)).toBe('expired');
  });

  // Shaped like RevenueCat's real webhooks, which keep listing the entitlement
  // on events that end or limit access.
  describe('real-shaped lifecycle events', () => {
    const NOW = Date.parse('2026-10-17T12:00:00.000Z');
    const DAY = 24 * 60 * 60 * 1000;
    const lifecycle = (type: string, extra: Record<string, unknown> = {}) =>
      service.parseEvent({
        event: {
          id: `evt-${type}`,
          type,
          app_user_id: 'production::user-1',
          entitlement_ids: ['pro'],
          expiration_at_ms: NOW + 10 * DAY,
          ...extra,
        },
      });

    it('ends Pro on EXPIRATION even though the entitlement is still listed', () => {
      const event = lifecycle('EXPIRATION', { expiration_at_ms: NOW - 1000, expiration_reason: 'UNSUBSCRIBE' });
      expect(service.mapTier(event, NOW)).toBe('free');
      expect(service.mapStatus(event, NOW)).toBe('expired');
    });

    it('keeps Pro after auto-renew is turned off until the paid period ends', () => {
      const event = lifecycle('CANCELLATION', { cancel_reason: 'UNSUBSCRIBE' });
      expect(service.mapTier(event, NOW)).toBe('pro');
      expect(service.mapStatus(event, NOW)).toBe('active');
      expect(service.getExpiry(event)).toBe(new Date(NOW + 10 * DAY).toISOString());
    });

    it('ends Pro on a CANCELLATION whose expiry has passed (refund)', () => {
      const event = lifecycle('CANCELLATION', { cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: NOW - 1000 });
      expect(service.mapTier(event, NOW)).toBe('free');
      expect(service.mapStatus(event, NOW)).toBe('expired');
    });

    it('keeps Pro when a cancelled subscription is re-enabled', () => {
      const event = lifecycle('UNCANCELLATION');
      expect(service.mapTier(event, NOW)).toBe('pro');
      expect(service.mapStatus(event, NOW)).toBe('active');
    });

    it('keeps Pro when a Google Play pause is only scheduled', () => {
      const event = lifecycle('SUBSCRIPTION_PAUSED', { auto_resume_at_ms: NOW + 40 * DAY });
      expect(service.mapTier(event, NOW)).toBe('pro');
      expect(service.mapStatus(event, NOW)).toBe('active');
    });

    it('keeps Pro during the store grace period after a failed charge', () => {
      const event = lifecycle('BILLING_ISSUE', { grace_period_expiration_at_ms: NOW + 6 * DAY });
      expect(service.mapTier(event, NOW)).toBe('pro');
      expect(service.mapStatus(event, NOW)).toBe('grace_period');
    });

    it('marks billing retry when a failed charge has no grace period left', () => {
      const event = lifecycle('BILLING_ISSUE', { grace_period_expiration_at_ms: null });
      expect(service.mapStatus(event, NOW)).toBe('billing_retry');
    });
  });

  it('validates webhook secret when configured', () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = 'secret123';
    const secureService = new RevenueCatService();
    expect(secureService.validateWebhookSecret('secret123')).toBe(true);
    expect(secureService.validateWebhookSecret('nope')).toBe(false);
  });

  it('resolves user id from aliases fallback', async () => {
    const event = service.parseEvent({
      event: { aliases: ['alias-user-1'] },
    });
    const resolvedUserId = await service.resolveUserId(event);
    expect(resolvedUserId).toBe('alias-user-1');
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
