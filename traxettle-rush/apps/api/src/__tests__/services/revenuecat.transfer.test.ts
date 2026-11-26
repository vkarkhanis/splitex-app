jest.mock('../../config/firebase', () => {
  const { createMemoryFirestore } = require('../helpers/memoryFirestore');
  const store = createMemoryFirestore();
  return { __store: store, db: store.db, auth: {}, storage: {}, firebaseApp: { options: {} } };
});

import { RevenueCatService } from '../../services/billing/revenuecat.service';

const { __store: store } = require('../../config/firebase');

const NOW = Date.parse('2026-10-23T12:00:00Z');
const customer = (entitlements: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  json: async () => ({ subscriber: { entitlements } }),
});

describe('RevenueCatService transfers', () => {
  const env = { ...process.env };
  let fetchMock: jest.Mock;
  let service: RevenueCatService;

  beforeEach(() => {
    store.reset();
    process.env = { ...env, REVENUECAT_PRO_ENTITLEMENT_ID: 'traxettle-pro', REVENUECAT_APPLE_API_KEY: 'appl_public' };
    delete process.env.REVENUECAT_API_KEY;
    fetchMock = jest.fn();
    service = new RevenueCatService(fetchMock);
  });

  afterAll(() => {
    process.env = env;
  });

  it('reads the customers a TRANSFER names', () => {
    const event = service.parseEvent({
      event: { id: 'evt-t', type: 'TRANSFER', transferred_from: ['production::old'], transferred_to: ['production::new'] },
    });
    expect(service.isTransfer(event)).toBe(true);
    expect(event.transferred_from).toEqual(['production::old']);
    expect(event.transferred_to).toEqual(['production::new']);
    expect(service.isTransfer(service.parseEvent({ event: { type: 'RENEWAL' } }))).toBe(false);
  });

  it('maps them to existing Traxettle accounts, skipping anonymous and unknown customers', async () => {
    store.seed('users', 'old', { email: 'a@example.com' });
    store.seed('users', 'new', { email: 'b@example.com' });

    const accounts = await service.resolveTransferAccounts(service.parseEvent({
      event: {
        type: 'TRANSFER',
        transferred_from: ['production::old', '$RCAnonymousID:abc123'],
        transferred_to: ['production::new', 'production::nobody', 'production::new'],
      },
    }));

    expect(accounts).toEqual([
      { appUserId: 'production::old', userId: 'old' },
      { appUserId: 'production::new', userId: 'new' },
    ]);
    expect(store.get('users', 'nobody')).toBeNull(); // a transfer never creates an account
  });

  describe('fetchEntitlementState', () => {
    it('looks the customer up with the public key and reports an active Pro entitlement', async () => {
      fetchMock.mockResolvedValue(customer({ 'traxettle-pro': { expires_date: '2027-10-23T12:00:00Z' } }));

      await expect(service.fetchEntitlementState('production::new', NOW)).resolves.toEqual({
        tier: 'pro', entitlementStatus: 'active', entitlementExpiresAt: '2027-10-23T12:00:00Z',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.revenuecat.com/v1/subscribers/production%3A%3Anew',
        { headers: expect.objectContaining({ Authorization: 'Bearer appl_public', 'X-Platform': 'ios' }) },
      );
    });

    it('prefers a secret key, which needs no platform', async () => {
      process.env.REVENUECAT_API_KEY = 'sk_secret';
      fetchMock.mockResolvedValue(customer({}));

      await service.fetchEntitlementState('production::new', NOW);
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer sk_secret');
      expect(headers['X-Platform']).toBeUndefined();
    });

    it('treats an entitlement without an expiry as active', async () => {
      fetchMock.mockResolvedValue(customer({ 'traxettle-pro': { expires_date: null } }));
      await expect(service.fetchEntitlementState('u', NOW)).resolves.toEqual(
        expect.objectContaining({ tier: 'pro', entitlementStatus: 'active' }),
      );
    });

    it('keeps Pro during the billing grace period', async () => {
      fetchMock.mockResolvedValue(customer({
        'traxettle-pro': { expires_date: '2026-10-22T12:00:00Z', grace_period_expires_date: '2026-10-30T12:00:00Z' },
      }));
      await expect(service.fetchEntitlementState('u', NOW)).resolves.toEqual(
        expect.objectContaining({ tier: 'pro', entitlementStatus: 'grace_period' }),
      );
    });

    it("doesn't hand over an expired subscription", async () => {
      fetchMock.mockResolvedValue(customer({ 'traxettle-pro': { expires_date: '2026-10-22T12:00:00Z' } }));
      await expect(service.fetchEntitlementState('u', NOW)).resolves.toEqual({
        tier: 'free', entitlementStatus: 'expired', entitlementExpiresAt: '2026-10-22T12:00:00Z',
      });
    });

    it('reports free when the customer has no Pro entitlement (the account it moved from)', async () => {
      fetchMock.mockResolvedValue(customer({ other: { expires_date: null } }));
      await expect(service.fetchEntitlementState('production::old', NOW)).resolves.toEqual({
        tier: 'free', entitlementStatus: 'expired', entitlementExpiresAt: null,
      });
    });

    it('fails on a RevenueCat error, or with no key, so the webhook is retried', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
      await expect(service.fetchEntitlementState('u', NOW)).rejects.toThrow('lookup failed (401)');

      delete process.env.REVENUECAT_APPLE_API_KEY;
      await expect(service.fetchEntitlementState('u', NOW)).rejects.toThrow('No RevenueCat API key');
    });
  });
});
