import request from 'supertest';
import express from 'express';

// In-memory store shared across tests
const mockData: Record<string, any> = {};
let shouldThrowOnGet = false;
let shouldThrowOnSet = false;

// Mock firebase config before importing routes
jest.mock('../../config/firebase', () => {
  return {
    auth: {
      verifyIdToken: jest.fn().mockResolvedValue({
        uid: 'test-uid',
        email: 'test@example.com',
        name: 'Test User'
      })
    },
    db: {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockImplementation((id: string) => ({
          get: jest.fn().mockImplementation(() => {
            if (shouldThrowOnGet) return Promise.reject(new Error('Firestore read error'));
            const data = mockData[id];
            return Promise.resolve({
              exists: !!data,
              data: () => data || null,
              id
            });
          }),
          set: jest.fn().mockImplementation((data: any, opts?: any) => {
            if (shouldThrowOnSet) return Promise.reject(new Error('Firestore write error'));
            if (opts?.merge) {
              mockData[id] = { ...(mockData[id] || {}), ...data };
            } else {
              mockData[id] = data;
            }
            return Promise.resolve({ writeTime: new Date() });
          })
        }))
      })
    }
  };
});

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
