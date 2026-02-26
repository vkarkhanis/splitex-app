import request from 'supertest';
import express from 'express';

// In-memory stores
const mockEvents: Record<string, any> = {};
const mockParticipants: Record<string, Record<string, any>> = {};
let docIdCounter = 0;

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
      collection: jest.fn().mockImplementation((collectionPath: string) => ({
        doc: jest.fn().mockImplementation((docId: string) => ({
          get: jest.fn().mockImplementation(() => {
            if (collectionPath === 'events') {
              const data = mockEvents[docId];
              return Promise.resolve({
                exists: !!data,
                data: () => data || null,
                id: docId
              });
            }
            return Promise.resolve({ exists: false, data: () => null, id: docId });
          }),
          set: jest.fn().mockImplementation((data: any, opts?: any) => {
            if (collectionPath === 'events') {
              if (opts?.merge) {
                mockEvents[docId] = { ...(mockEvents[docId] || {}), ...data };
              } else {
                mockEvents[docId] = data;
              }
            }
            return Promise.resolve({ writeTime: new Date() });
          }),
          delete: jest.fn().mockImplementation(() => {
            if (collectionPath === 'events') {
              delete mockEvents[docId];
            }
            return Promise.resolve();
          }),
          collection: jest.fn().mockImplementation((subPath: string) => ({
            doc: jest.fn().mockImplementation((subDocId: string) => ({
              get: jest.fn().mockImplementation(() => {
                const key = `${docId}/${subDocId}`;
                const data = mockParticipants[key];
                return Promise.resolve({
                  exists: !!data,
                  data: () => data || null,
                  id: subDocId
                });
              }),
              set: jest.fn().mockImplementation((data: any) => {
                const key = `${docId}/${subDocId}`;
                mockParticipants[key] = data;
                return Promise.resolve();
              }),
              delete: jest.fn().mockImplementation(() => {
                const key = `${docId}/${subDocId}`;
                delete mockParticipants[key];
                return Promise.resolve();
              }),
            })),
            get: jest.fn().mockImplementation(() => {
              const docs = Object.entries(mockParticipants)
                .filter(([key]) => key.startsWith(`${docId}/`))
                .map(([key, data]) => ({
                  id: key.split('/')[1],
                  data: () => data,
                  exists: true,
                }));
              return Promise.resolve({ docs, empty: docs.length === 0 });
            }),
          })),
        })),
        add: jest.fn().mockImplementation((data: any) => {
          const id = `mock-event-${++docIdCounter}`;
          mockEvents[id] = data;
          return Promise.resolve({ id });
        }),
        where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
          get: jest.fn().mockImplementation(() => {
            const docs = Object.entries(mockEvents)
              .filter(([, data]) => {
                if (field === 'createdBy') return data.createdBy === value;
                if (field === 'admins') return (data.admins || []).includes(value);
                return false;
              })
              .map(([id, data]) => ({
                id,
                data: () => data,
                exists: true,
              }));
            return Promise.resolve({ docs, empty: docs.length === 0 });
          }),
        })),
      })),
    }
  };
});

import { eventRoutes } from '../../routes/events';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/events', eventRoutes);
  return app;
}

beforeEach(() => {
  Object.keys(mockEvents).forEach(k => delete mockEvents[k]);
  Object.keys(mockParticipants).forEach(k => delete mockParticipants[k]);
  docIdCounter = 0;
});

describe('POST /api/events', () => {
  it('should return 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/events').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('should return 400 if required fields are missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for invalid event type', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Test', type: 'invalid', startDate: '2025-01-01', currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Type must be');
  });

  it('should create an event successfully', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        name: 'Goa Trip',
        description: 'Annual trip',
        type: 'trip',
        startDate: '2025-06-01',
        currency: 'INR',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Goa Trip');
    expect(res.body.data.type).toBe('trip');
    expect(res.body.data.status).toBe('active');
  });
});

describe('GET /api/events', () => {
  it('should return 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });

  it('should return empty array when no events exist', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/events')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('should return events created by user', async () => {
    mockEvents['evt-1'] = {
      name: 'Test Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/events')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Test Event');
  });
});

describe('GET /api/events/:eventId', () => {
  it('should return 404 for non-existent event', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/events/nonexistent')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return event by ID', async () => {
    mockEvents['evt-2'] = {
      name: 'My Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/events/evt-2')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('My Event');
  });
});

describe('PUT /api/events/:eventId', () => {
  it('should return 404 for non-existent event', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/events/nonexistent')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('should return 403 if user is not admin', async () => {
    mockEvents['evt-3'] = {
      name: 'Other Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'other-user',
      admins: ['other-user'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-3')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('should update event successfully', async () => {
    mockEvents['evt-4'] = {
      name: 'Original',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-4')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Updated Name', status: 'settled' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
  });
});

describe('DELETE /api/events/:eventId', () => {
  it('should return 404 for non-existent event', async () => {
    const app = createApp();
    const res = await request(app)
      .delete('/api/events/nonexistent')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return 403 if user is not creator', async () => {
    mockEvents['evt-5'] = {
      name: 'Other Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'other-user',
      admins: ['other-user'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/events/evt-5')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
  });

  it('should delete event successfully', async () => {
    mockEvents['evt-6'] = {
      name: 'Delete Me',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/events/evt-6')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockEvents['evt-6']).toBeUndefined();
  });
});

describe('GET /api/events/:eventId/participants', () => {
  it('should return empty array when no participants', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/events/evt-1/participants')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should return participants', async () => {
    mockParticipants['evt-7/mock-user-1'] = {
      userId: 'mock-user-1',
      role: 'admin',
      joinedAt: new Date().toISOString(),
      invitedBy: 'mock-user-1',
      status: 'accepted',
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/events/evt-7/participants')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].role).toBe('admin');
  });
});

describe('POST /api/events/:eventId/participants', () => {
  it('should return 400 if userId is missing', async () => {
    mockEvents['evt-8'] = {
      name: 'Test',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/events/evt-8/participants')
      .set('Authorization', 'Bearer mock-user-1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should add participant successfully', async () => {
    mockEvents['evt-9'] = {
      name: 'Test',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/events/evt-9/participants')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ userId: 'mock-user-2', role: 'member' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('Error handling - GET /api/events', () => {
  it('should return 500 when service throws', async () => {
    // Force the mock to throw by corrupting the store
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .get('/api/events')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Failed to fetch events');

    db.collection = origCollection;
  });
});

describe('Error handling - GET /api/events/:eventId', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .get('/api/events/evt-err')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Failed to fetch event');

    db.collection = origCollection;
  });
});

describe('Error handling - POST /api/events', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      add: jest.fn().mockRejectedValue(new Error('Firestore error')),
    }));

    const app = createApp();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Test', type: 'event', startDate: '2025-01-01', currency: 'USD' });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Failed to create event');

    db.collection = origCollection;
  });
});

describe('Error handling - DELETE /api/events/:eventId', () => {
  it('should return 500 when service throws unexpectedly', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .delete('/api/events/evt-err')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('Error handling - PUT /api/events/:eventId', () => {
  it('should return 500 when service throws unexpectedly', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-err')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('Error handling - GET /api/events/:eventId/participants', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        collection: jest.fn().mockImplementation(() => ({
          get: jest.fn().mockRejectedValue(new Error('Firestore error')),
        })),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .get('/api/events/evt-err/participants')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('Error handling - POST /api/events/:eventId/participants', () => {
  it('should return 403 when user is not admin', async () => {
    mockEvents['evt-noadmin'] = {
      name: 'No Admin',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'other-user',
      admins: ['other-user'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/events/evt-noadmin/participants')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ userId: 'new-user' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Only admins');
  });

  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .post('/api/events/evt-err/participants')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ userId: 'new-user' });
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('PUT /api/events/:eventId — status guards', () => {
  it('should return 403 when event is closed', async () => {
    mockEvents['evt-closed'] = {
      name: 'Closed Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'closed',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-closed')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('closed');
  });

  it('should return 403 when event is in payment mode', async () => {
    mockEvents['evt-payment'] = {
      name: 'Payment Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'payment',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-payment')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('payments are in progress');
  });

  it('should return 403 when event is settled and update is not just closing', async () => {
    mockEvents['evt-settled'] = {
      name: 'Settled Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'settled',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-settled')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('settled');
  });

  it('should allow closing a settled event', async () => {
    mockEvents['evt-settled-close'] = {
      name: 'Settled Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'settled',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-settled-close')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ status: 'closed' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 403 when changing currency during review', async () => {
    mockEvents['evt-review-fx'] = {
      name: 'Review Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'review',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-review-fx')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ currency: 'EUR' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('currency');
  });
});

describe('DELETE /api/events/:eventId — status guards', () => {
  it('should return 403 when event is settled', async () => {
    mockEvents['evt-del-settled'] = {
      name: 'Settled',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'settled',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/events/evt-del-settled')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
  });

  it('should return 403 when event is closed', async () => {
    mockEvents['evt-del-closed'] = {
      name: 'Closed',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'closed',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/events/evt-del-closed')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/events/:eventId/participants/:userId/role', () => {
  it('should return 400 for invalid role', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-1/participants/user-1/role')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ role: 'superadmin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('role must be');
  });

  it('should return 400 when role is missing', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-1/participants/user-1/role')
      .set('Authorization', 'Bearer mock-user-1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should update role successfully', async () => {
    mockEvents['evt-role'] = {
      name: 'Role Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-role/mock-user-2'] = {
      userId: 'mock-user-2',
      role: 'member',
      joinedAt: new Date().toISOString(),
      invitedBy: 'mock-user-1',
      status: 'accepted',
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-role/participants/mock-user-2/role')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-err/participants/user-1/role')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ role: 'admin' });
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('POST /api/events/:eventId/backfill-participants', () => {
  it('should return 403 when user is not admin', async () => {
    mockEvents['evt-bf-noadmin'] = {
      name: 'Backfill Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'other-user',
      admins: ['other-user'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/events/evt-bf-noadmin/backfill-participants')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Only admins');
  });

  it('should backfill participants successfully', async () => {
    mockEvents['evt-bf'] = {
      name: 'Backfill Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-bf/mock-user-1'] = {
      userId: 'mock-user-1',
      role: 'admin',
      joinedAt: new Date().toISOString(),
      invitedBy: 'mock-user-1',
      status: 'accepted',
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/events/evt-bf/backfill-participants')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.participantIds).toBeDefined();
  });

  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .post('/api/events/evt-err/backfill-participants')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('DELETE /api/events/:eventId/participants/:userId', () => {
  it('should return 403 when trying to remove creator', async () => {
    mockEvents['evt-creator'] = {
      name: 'Creator Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-creator/mock-user-1'] = {
      userId: 'mock-user-1',
      role: 'admin',
      joinedAt: new Date().toISOString(),
      invitedBy: 'mock-user-1',
      status: 'accepted',
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/events/evt-creator/participants/mock-user-1')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Cannot remove');
  });

  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .delete('/api/events/evt-err/participants/user-1')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });

  it('should remove participant successfully', async () => {
    mockEvents['evt-10'] = {
      name: 'Test',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-10/mock-user-2'] = {
      userId: 'mock-user-2',
      role: 'member',
      joinedAt: new Date().toISOString(),
      invitedBy: 'mock-user-1',
      status: 'accepted',
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/events/evt-10/participants/mock-user-2')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
