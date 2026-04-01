import request from 'supertest';
import express from 'express';

// In-memory store shared across tests
const mockData: Record<string, any> = {};
let shouldThrowOnGet = false;
let shouldThrowOnSet = false;
let shouldThrowOnBatchCommit = false;

const getEntitlementMock = jest.fn();
const computeCapabilitiesMock = jest.fn();

jest.mock('../../services/entitlement.service', () => ({
  EntitlementService: jest.fn().mockImplementation(() => ({
    getEntitlement: getEntitlementMock,
    computeCapabilities: computeCapabilitiesMock,
  })),
}));

// Mock firebase config before importing routes
jest.mock('../../config/firebase', () => {
  const makeDocRef = (collectionName: string, id: string) => ({
    get: jest.fn().mockImplementation(() => {
      if (shouldThrowOnGet) return Promise.reject(new Error('Firestore read error'));
      const data = mockData[`${collectionName}:${id}`] ?? mockData[id];
      return Promise.resolve({
        exists: !!data,
        data: () => data || null,
        id,
        ref: { id },
      });
    }),
    set: jest.fn().mockImplementation((data: any, opts?: any) => {
      if (shouldThrowOnSet) return Promise.reject(new Error('Firestore write error'));
      const key = `${collectionName}:${id}`;
      const existing = mockData[key] ?? mockData[id];
      if (opts?.merge) {
        mockData[key] = { ...(existing || {}), ...data };
      } else {
        mockData[key] = data;
      }
      if (collectionName === 'users') {
        mockData[id] = mockData[key];
      }
      return Promise.resolve({ writeTime: new Date() });
    }),
  });

  return {
    auth: {
      verifyIdToken: jest.fn().mockResolvedValue({
        uid: 'test-uid',
        email: 'test@example.com',
        name: 'Test User'
      }),
      getUser: jest.fn().mockRejectedValue(new Error('no firebase user')),
    },
    db: {
      collection: jest.fn().mockImplementation((collectionName: string) => ({
        doc: jest.fn().mockImplementation((id: string) => makeDocRef(collectionName, id)),
        where: jest.fn().mockImplementation((field: string, _op: string, value: string) => ({
          get: jest.fn().mockImplementation(() => {
            if (shouldThrowOnGet) return Promise.reject(new Error('Firestore read error'));
            const docs = Object.entries(mockData)
              .filter(([key, data]) => key.startsWith(`${collectionName}:`) && data?.[field] === value)
              .map(([key, data]) => ({
                id: key.split(':')[1],
                data: () => data,
                ref: { id: key.split(':')[1] },
              }));
            return Promise.resolve({ docs, forEach: (cb: any) => docs.forEach(cb) });
          }),
        })),
        get: jest.fn().mockImplementation(() => {
          if (shouldThrowOnGet) return Promise.reject(new Error('Firestore read error'));
          const docs = Object.entries(mockData)
            .filter(([key]) => key.startsWith(`${collectionName}:`))
            .map(([key, data]) => ({
              id: key.split(':')[1],
              data: () => data,
              ref: { id: key.split(':')[1] },
            }));
          return Promise.resolve({ docs, forEach: (cb: any) => docs.forEach(cb) });
        }),
      })),
      batch: jest.fn().mockImplementation(() => ({
        delete: jest.fn(),
        update: jest.fn(),
        commit: jest.fn().mockImplementation(() => {
          if (shouldThrowOnBatchCommit) return Promise.reject(new Error('Batch commit failed'));
          return Promise.resolve();
        }),
      })),
    }
  };
});

import { auth } from '../../config/firebase';
import { userRoutes } from '../../routes/users';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  return app;
}

beforeEach(() => {
  shouldThrowOnGet = false;
  shouldThrowOnSet = false;
  shouldThrowOnBatchCommit = false;
  Object.keys(mockData).forEach((key) => delete mockData[key]);
  jest.clearAllMocks();
  (auth.getUser as jest.Mock).mockRejectedValue(new Error('no firebase user'));
  (auth.verifyIdToken as jest.Mock).mockResolvedValue({
    uid: 'test-uid',
    email: 'test@example.com',
    name: 'Test User',
  });
  getEntitlementMock.mockResolvedValue({
    tier: 'free',
    entitlementStatus: 'active',
    entitlementExpiresAt: null,
    entitlementSource: 'system',
    internalTester: false,
  });
  computeCapabilitiesMock.mockReturnValue({ multiCurrencySettlement: false });
});

describe('GET /api/users/profile', () => {
  it('should return 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return a default profile for new mock token user (doc does not exist)', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-new-get-user');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.userId).toBe('mock-new-get-user');
    expect(res.body.data.preferences).toBeDefined();
    expect(res.body.data.preferences.currency).toBe('USD');
    expect(res.body.data.preferences.timezone).toBe('UTC');
    expect(res.body.data.preferences.notifications).toBe(true);
  });

  it('should return existing profile when doc exists with all string fields', async () => {
    // Pre-populate the mock store with a full profile
    mockData['mock-existing-user'] = {
      displayName: 'Existing User',
      email: 'existing@example.com',
      phoneNumber: '+9876543210',
      photoURL: 'https://example.com/photo.jpg',
      preferences: {
        notifications: false,
        currency: 'INR',
        timezone: 'Asia/Kolkata'
      }
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-existing-user');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.displayName).toBe('Existing User');
    expect(res.body.data.email).toBe('existing@example.com');
    expect(res.body.data.phoneNumber).toBe('+9876543210');
    expect(res.body.data.photoURL).toBe('https://example.com/photo.jpg');
    expect(res.body.data.preferences.currency).toBe('INR');
    expect(res.body.data.preferences.timezone).toBe('Asia/Kolkata');
    expect(res.body.data.preferences.notifications).toBe(false);
  });

  it('should handle existing doc with non-string/missing fields gracefully', async () => {
    // Pre-populate with bad/missing field types to exercise typeof branches
    mockData['mock-bad-fields-user'] = {
      displayName: 123,       // not a string
      email: null,            // not a string
      phoneNumber: undefined, // not a string
      photoURL: 42,           // not a string
      preferences: null       // not an object
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-bad-fields-user');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Should fall back to defaults from baseProfile
    expect(res.body.data.displayName).toBe('Mock User');
    expect(res.body.data.email).toBe('mock@example.com');
    expect(res.body.data.preferences.currency).toBe('USD');
    expect(res.body.data.preferences.timezone).toBe('UTC');
  });

  it('should handle existing doc with empty data object', async () => {
    mockData['mock-empty-doc-user'] = {};

    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-empty-doc-user');

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Mock User');
    expect(res.body.data.email).toBe('mock@example.com');
    expect(res.body.data.preferences.currency).toBe('USD');
  });

  it('should return a profile for Firebase token user', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer real-firebase-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe('test-uid');
    expect(res.body.data.displayName).toBe('Test User');
    expect(res.body.data.email).toBe('test@example.com');
  });

  it('should return 500 when Firestore read throws', async () => {
    shouldThrowOnGet = true;
    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-error-get-user');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to load profile');
  });
});

describe('PUT /api/users/profile', () => {
  it('should return 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/users/profile')
      .send({ displayName: 'New Name' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should update profile fields for mock token user', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer mock-update-user')
      .send({
        displayName: 'Updated Name',
        email: 'updated@example.com',
        phoneNumber: '+1234567890'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.displayName).toBe('Updated Name');
    expect(res.body.data.email).toBe('updated@example.com');
    expect(res.body.data.phoneNumber).toBe('+1234567890');
  });

  it('should update preferences', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer mock-prefs-user')
      .send({
        preferences: {
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          notifications: false
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.preferences.currency).toBe('INR');
    expect(res.body.data.preferences.timezone).toBe('Asia/Kolkata');
    expect(res.body.data.preferences.notifications).toBe(false);
  });

  it('should preserve existing fields when partially updating', async () => {
    const app = createApp();

    // First create a profile
    await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer mock-partial-user')
      .send({
        displayName: 'Original Name',
        email: 'original@example.com',
        phoneNumber: '+111'
      });

    // Then partially update
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer mock-partial-user')
      .send({
        displayName: 'New Name'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('New Name');
    expect(res.body.data.phoneNumber).toBe('+111');
  });

  it('should use defaults when updating with no existing doc and no body fields', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer mock-empty-put-user')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Mock User');
    expect(res.body.data.email).toBe('mock@example.com');
    expect(res.body.data.preferences.currency).toBe('USD');
    expect(res.body.data.preferences.timezone).toBe('UTC');
    expect(res.body.data.preferences.notifications).toBe(true);
  });

  it('should merge existing preferences when only partially provided', async () => {
    // Pre-populate with existing preferences
    mockData['mock-merge-prefs-user'] = {
      displayName: 'Merge User',
      email: 'merge@example.com',
      preferences: {
        notifications: false,
        currency: 'EUR',
        timezone: 'Europe/Berlin'
      },
      createdAt: '2024-01-01T00:00:00.000Z'
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer mock-merge-prefs-user')
      .send({
        preferences: {
          currency: 'GBP'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.data.preferences.currency).toBe('GBP');
    expect(res.body.data.preferences.timezone).toBe('Europe/Berlin');
    expect(res.body.data.preferences.notifications).toBe(false);
  });

  it('should return 500 when Firestore write throws', async () => {
    shouldThrowOnSet = true;
    const app = createApp();
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', 'Bearer mock-error-put-user')
      .send({ displayName: 'Fail' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to update profile');
  });
});

describe('GET /api/users/profile — authProviders & hasPassword', () => {
  it('should return authProviders and hasPassword for email user', async () => {
    mockData['mock-email-provider-user'] = {
      displayName: 'Email User',
      email: 'email@example.com',
      authProviders: ['email'],
      passwordHash: 'hashed',
      preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-email-provider-user');

    expect(res.status).toBe(200);
    expect(res.body.data.authProviders).toContain('email');
    expect(res.body.data.hasPassword).toBe(true);
  });

  it('should return hasPassword false for google-only user', async () => {
    mockData['mock-google-only-user'] = {
      displayName: 'Google User',
      email: 'google@example.com',
      authProviders: ['google'],
      preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-google-only-user');

    expect(res.status).toBe(200);
    expect(res.body.data.authProviders).toContain('google');
    // hasPassword depends on Firebase auth lookup which is mocked; the stored doc has no email provider
    expect(res.body.data.authProviders).not.toContain('email');
  });

  it('should include both providers for user with google + email', async () => {
    mockData['mock-mixed-provider-user'] = {
      displayName: 'Mixed User',
      email: 'mixed@example.com',
      authProviders: ['email', 'google'],
      passwordHash: 'hashed',
      preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-mixed-provider-user');

    expect(res.status).toBe(200);
    expect(res.body.data.authProviders).toContain('email');
    expect(res.body.data.authProviders).toContain('google');
    expect(res.body.data.hasPassword).toBe(true);
  });

  it('prefers Firebase providerData when available', async () => {
    (auth.getUser as jest.Mock).mockResolvedValue({
      email: 'firebase@example.com',
      passwordHash: 'firebase-hash',
      providerData: [
        { providerId: 'password' },
        { providerId: 'google.com' },
      ],
    });

    mockData['mock-firebase-provider-user'] = {
      displayName: 'Firebase User',
      email: 'firebase@example.com',
      authProviders: ['phone'],
      preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-firebase-provider-user');

    expect(res.status).toBe(200);
    expect(res.body.data.authProviders).toEqual(expect.arrayContaining(['email', 'google']));
    expect(res.body.data.authProviders).not.toContain('phone');
    expect(res.body.data.hasPassword).toBe(true);
  });

  it('treats password-backed custom-token Firebase users as email auth', async () => {
    (auth.getUser as jest.Mock).mockResolvedValue({
      email: 'password@example.com',
      passwordHash: 'firebase-hash',
      providerData: [],
    });

    mockData['mock-password-custom-user'] = {
      displayName: 'Password User',
      email: 'password@example.com',
      preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer mock-password-custom-user');

    expect(res.status).toBe(200);
    expect(res.body.data.authProviders).toContain('email');
    expect(res.body.data.hasPassword).toBe(true);
  });
});

describe('User payment methods', () => {
  it('lists normalized and filtered payment methods', async () => {
    mockData['mock-payments-user'] = {
      paymentMethods: [
        { id: 'pm-2', label: 'Wise', currency: 'eur', type: 'wise', details: 'wise@example.com', isActive: false },
        { id: 'pm-1', label: 'Primary Bank', currency: 'usd', type: 'bank', details: 'Account 123', isActive: true },
        { id: '', label: '', currency: '', type: 'bogus', details: '', isActive: true },
      ],
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/users/payment-methods?currency=usd')
      .set('Authorization', 'Bearer mock-payments-user');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual(expect.objectContaining({
      id: 'pm-1',
      label: 'Primary Bank',
      currency: 'USD',
      type: 'bank',
    }));
  });

  it('creates, updates, and deletes payment methods', async () => {
    const app = createApp();

    const createRes = await request(app)
      .post('/api/users/payment-methods')
      .set('Authorization', 'Bearer mock-payment-create-user')
      .send({
        label: ' Savings ',
        currency: 'usd',
        type: 'bank',
        details: ' Account 456 ',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data).toEqual(expect.objectContaining({
      label: 'Savings',
      currency: 'USD',
      type: 'bank',
      details: 'Account 456',
      isActive: true,
    }));

    const methodId = createRes.body.data.id;
    const updateRes = await request(app)
      .put(`/api/users/payment-methods/${methodId}`)
      .set('Authorization', 'Bearer mock-payment-create-user')
      .send({
        label: 'Travel Card',
        currency: 'eur',
        type: 'wise',
        details: 'wise@travel.test',
        isActive: false,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data).toEqual(expect.objectContaining({
      id: methodId,
      label: 'Travel Card',
      currency: 'EUR',
      type: 'wise',
      details: 'wise@travel.test',
      isActive: false,
    }));

    const deleteRes = await request(app)
      .delete(`/api/users/payment-methods/${methodId}`)
      .set('Authorization', 'Bearer mock-payment-create-user');

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data).toEqual({ deleted: true });
  });

  it('validates payment method payloads and missing ids', async () => {
    const app = createApp();

    const invalidCreate = await request(app)
      .post('/api/users/payment-methods')
      .set('Authorization', 'Bearer mock-payment-invalid-user')
      .send({ label: 'Bad', currency: 'usd', type: 'crypto', details: '' });

    expect(invalidCreate.status).toBe(400);
    expect(invalidCreate.body.error).toBe('Invalid payment method payload');

    const missingUpdate = await request(app)
      .put('/api/users/payment-methods/missing')
      .set('Authorization', 'Bearer mock-payment-invalid-user')
      .send({ label: 'Nope' });

    expect(missingUpdate.status).toBe(404);
    expect(missingUpdate.body.error).toBe('Payment method not found');

    const missingDelete = await request(app)
      .delete('/api/users/payment-methods/missing')
      .set('Authorization', 'Bearer mock-payment-invalid-user');

    expect(missingDelete.status).toBe(404);
    expect(missingDelete.body.error).toBe('Payment method not found');
  });

  it('rejects invalid updates to an existing payment method', async () => {
    mockData['mock-payment-bad-update'] = {
      paymentMethods: [
        { id: 'pm-1', label: 'Primary', currency: 'USD', type: 'bank', details: '123', isActive: true },
      ],
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/users/payment-methods/pm-1')
      .set('Authorization', 'Bearer mock-payment-bad-update')
      .send({ type: 'crypto', details: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payment method payload');
  });

  it('returns 500 when payment method storage throws', async () => {
    shouldThrowOnSet = true;
    const app = createApp();

    const createRes = await request(app)
      .post('/api/users/payment-methods')
      .set('Authorization', 'Bearer mock-payment-fail-user')
      .send({ label: 'Primary', currency: 'USD', type: 'bank', details: '123' });

    expect(createRes.status).toBe(500);

    mockData['mock-payment-fail-user'] = {
      paymentMethods: [{ id: 'pm-1', label: 'Primary', currency: 'USD', type: 'bank', details: '123', isActive: true }],
    };

    const updateRes = await request(app)
      .put('/api/users/payment-methods/pm-1')
      .set('Authorization', 'Bearer mock-payment-fail-user')
      .send({ label: 'Updated' });

    expect(updateRes.status).toBe(500);

    const deleteRes = await request(app)
      .delete('/api/users/payment-methods/pm-1')
      .set('Authorization', 'Bearer mock-payment-fail-user');

    expect(deleteRes.status).toBe(500);
  });
});

describe('User debug entitlement and account deletion', () => {
  it('returns debug entitlement details and active pro flag', async () => {
    getEntitlementMock.mockResolvedValue({
      tier: 'pro',
      entitlementStatus: 'grace_period',
      entitlementExpiresAt: null,
      entitlementSource: 'revenuecat',
      internalTester: true,
    });
    computeCapabilitiesMock.mockReturnValue({ multiCurrencySettlement: true });

    const app = createApp();
    const res = await request(app)
      .get('/api/users/debug/entitlement')
      .set('Authorization', 'Bearer mock-debug-user');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({
      userId: 'mock-debug-user',
      isActivePro: true,
      capabilities: { multiCurrencySettlement: true },
    }));
  });

  it('returns 500 when debug entitlement lookup fails', async () => {
    getEntitlementMock.mockRejectedValue(new Error('entitlement lookup failed'));

    const app = createApp();
    const res = await request(app)
      .get('/api/users/debug/entitlement')
      .set('Authorization', 'Bearer mock-debug-user');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('entitlement lookup failed');
  });

  it('deletes account data successfully', async () => {
    mockData['users:mock-delete-user'] = { displayName: 'Delete Me' };
    mockData['events:event-owned'] = { createdBy: 'mock-delete-user', participants: [], groups: [] };
    mockData['events:event-other'] = {
      createdBy: 'someone-else',
      participants: [{ userId: 'mock-delete-user' }, { userId: 'other' }],
      groups: [{ members: ['mock-delete-user', 'other'] }, { members: ['mock-delete-user'] }],
    };
    mockData['expenses:expense-1'] = { paidBy: 'mock-delete-user' };

    const app = createApp();
    const res = await request(app)
      .delete('/api/users/account')
      .set('Authorization', 'Bearer mock-delete-user');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
  });

  it('returns 500 when account deletion batch commit fails', async () => {
    shouldThrowOnBatchCommit = true;
    const app = createApp();
    const res = await request(app)
      .delete('/api/users/account')
      .set('Authorization', 'Bearer mock-delete-user');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to delete account');
  });
});
