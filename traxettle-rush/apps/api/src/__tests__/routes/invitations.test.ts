import request from 'supertest';
import express from 'express';

jest.mock('nodemailer', () => {
  const sendMailMock = jest.fn().mockResolvedValue({
    messageId: '<test-msg-id>',
  });
  return {
    createTransport: jest.fn().mockReturnValue({ sendMail: sendMailMock }),
    getTestMessageUrl: jest.fn().mockReturnValue(false),
    __sendMailMock: sendMailMock,
  };
});

const mockInvitations: Record<string, any> = {};
const mockEvents: Record<string, any> = {};
const mockParticipants: Record<string, Record<string, any>> = {};
const mockGroups: Record<string, any> = {};
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
            if (collectionPath === 'invitations') {
              const data = mockInvitations[docId];
              return Promise.resolve({ exists: !!data, data: () => data || null, id: docId });
            }
            if (collectionPath === 'events') {
              const data = mockEvents[docId];
              return Promise.resolve({ exists: !!data, data: () => data || null, id: docId });
            }
            if (collectionPath === 'groups') {
              const data = mockGroups[docId];
              return Promise.resolve({ exists: !!data, data: () => data || null, id: docId });
            }
            return Promise.resolve({ exists: false, data: () => null, id: docId });
          }),
          set: jest.fn().mockImplementation((data: any, opts?: any) => {
            if (collectionPath === 'invitations') {
              if (opts?.merge) {
                mockInvitations[docId] = { ...(mockInvitations[docId] || {}), ...data };
              } else {
                mockInvitations[docId] = data;
              }
            }
            if (collectionPath === 'events') {
              if (opts?.merge) {
                mockEvents[docId] = { ...(mockEvents[docId] || {}), ...data };
              } else {
                mockEvents[docId] = data;
              }
            }
            if (collectionPath === 'groups') {
              if (opts?.merge) {
                mockGroups[docId] = { ...(mockGroups[docId] || {}), ...data };
              } else {
                mockGroups[docId] = data;
              }
            }
            return Promise.resolve({ writeTime: new Date() });
          }),
          delete: jest.fn().mockImplementation(() => {
            if (collectionPath === 'invitations') delete mockInvitations[docId];
            if (collectionPath === 'events') delete mockEvents[docId];
            if (collectionPath === 'groups') delete mockGroups[docId];
            return Promise.resolve();
          }),
          collection: jest.fn().mockImplementation((subPath: string) => ({
            doc: jest.fn().mockImplementation((subDocId: string) => ({
              get: jest.fn().mockImplementation(() => {
                const key = `${docId}/${subDocId}`;
                const data = mockParticipants[key];
                return Promise.resolve({ exists: !!data, data: () => data || null, id: subDocId });
              }),
              set: jest.fn().mockImplementation((data: any) => {
                mockParticipants[`${docId}/${subDocId}`] = data;
                return Promise.resolve();
              }),
              delete: jest.fn().mockImplementation(() => {
                delete mockParticipants[`${docId}/${subDocId}`];
                return Promise.resolve();
              }),
            })),
            get: jest.fn().mockImplementation(() => {
              const docs = Object.entries(mockParticipants)
                .filter(([key]) => key.startsWith(`${docId}/`))
                .map(([key, data]) => ({ id: key.split('/')[1], data: () => data, exists: true }));
              return Promise.resolve({ docs, empty: docs.length === 0 });
            }),
          })),
        })),
        add: jest.fn().mockImplementation((data: any) => {
          const prefix = collectionPath === 'invitations' ? 'mock-inv' : collectionPath === 'groups' ? 'mock-grp' : 'mock-doc';
          const id = `${prefix}-${++docIdCounter}`;
          if (collectionPath === 'invitations') mockInvitations[id] = data;
          if (collectionPath === 'groups') mockGroups[id] = data;
          return Promise.resolve({ id });
        }),
        where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
          get: jest.fn().mockImplementation(() => {
            let store: Record<string, any> = {};
            if (collectionPath === 'invitations') store = mockInvitations;
            else if (collectionPath === 'events') store = mockEvents;
            else if (collectionPath === 'groups') store = mockGroups;

            const docs = Object.entries(store)
              .filter(([, data]) => {
                if (field === 'eventId') return data.eventId === value;
                if (field === 'inviteeUserId') return data.inviteeUserId === value;
                if (field === 'inviteeEmail') return data.inviteeEmail === value;
                if (field === 'token') return data.token === value;
                if (field === 'createdBy') return data.createdBy === value;
                if (field === 'admins') return (data.admins || []).includes(value);
                return false;
              })
              .map(([id, data]) => ({ id, data: () => data, exists: true }));
            return Promise.resolve({ docs, empty: docs.length === 0 });
          }),
          limit: jest.fn().mockImplementation(() => ({
            get: jest.fn().mockImplementation(() => {
              let store: Record<string, any> = {};
              if (collectionPath === 'invitations') store = mockInvitations;

              const docs = Object.entries(store)
                .filter(([, data]) => {
                  if (field === 'token') return data.token === value;
                  return false;
                })
                .slice(0, 1)
                .map(([id, data]) => ({ id, data: () => data, exists: true }));
              return Promise.resolve({ docs, empty: docs.length === 0 });
            }),
          })),
        })),
      })),
    }
  };
});

import { invitationRoutes } from '../../routes/invitations';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/invitations', invitationRoutes);
  return app;
}

beforeEach(() => {
  Object.keys(mockInvitations).forEach(k => delete mockInvitations[k]);
  Object.keys(mockEvents).forEach(k => delete mockEvents[k]);
  Object.keys(mockParticipants).forEach(k => delete mockParticipants[k]);
  Object.keys(mockGroups).forEach(k => delete mockGroups[k]);
  docIdCounter = 0;
});

describe('POST /api/invitations', () => {
  it('should return 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/invitations').send({});
    expect(res.status).toBe(401);
  });

  it('should return 400 if eventId is missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ inviteeEmail: 'a@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('eventId');
  });

  it('should return 400 if no invitee identifier provided', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ eventId: 'evt-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('inviteeEmail');
  });

  it('should return 403 if user is not event admin', async () => {
    // Event exists but user is not admin
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
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ eventId: 'evt-noadmin', inviteeEmail: 'friend@test.com' });
    expect(res.status).toBe(403);
  });

  it('should create invitation successfully', async () => {
    mockEvents['evt-admin'] = {
      name: 'Admin Event',
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
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-admin',
        inviteeEmail: 'friend@test.com',
        role: 'member',
        message: 'Join us!',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.inviteeEmail).toBe('friend@test.com');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.token).toBeDefined();
  });
});

describe('Error handling - GET /api/invitations/my', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).get('/api/invitations/my').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - GET /api/invitations/event/:eventId', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).get('/api/invitations/event/evt-err').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - GET /api/invitations/token/:token', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(() => ({
        limit: jest.fn().mockImplementation(() => ({
          get: jest.fn().mockRejectedValue(new Error('Firestore error')),
        })),
      })),
    }));
    const app = createApp();
    const res = await request(app).get('/api/invitations/token/bad-token');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - GET /api/invitations/:invitationId', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).get('/api/invitations/inv-err').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - POST /api/invitations', () => {
  it('should return 500 when service throws', async () => {
    // Set up an event where user is admin, but invitation creation fails
    mockEvents['evt-inv-err'] = {
      name: 'Inv Error',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    const origImpl = origCollection.getMockImplementation();

    // Override only for invitations collection add
    db.collection = jest.fn().mockImplementation((path: string) => {
      if (path === 'invitations') {
        return {
          add: jest.fn().mockRejectedValue(new Error('Firestore error')),
          where: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ docs: [], empty: true }), limit: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ docs: [], empty: true }) }) }),
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ exists: false, data: () => null }) }),
        };
      }
      // For events collection, use original
      return origImpl(path);
    });

    const app = createApp();
    const res = await request(app).post('/api/invitations').set('Authorization', 'Bearer mock-user-1')
      .send({ eventId: 'evt-inv-err', inviteeEmail: 'test@test.com' });
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - POST /api/invitations/:id/accept', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).post('/api/invitations/inv-err/accept').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - POST /api/invitations/:id/decline', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).post('/api/invitations/inv-err/decline').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });

  it('should return 400 if invitation already declined', async () => {
    mockInvitations['inv-already-declined'] = {
      eventId: 'evt-1',
      invitedBy: 'other',
      inviteeEmail: null,
      inviteeUserId: 'mock-user-1',
      inviteePhone: null,
      role: 'member',
      status: 'declined',
      token: 'tok-dec2',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).post('/api/invitations/inv-already-declined/decline').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already been');
  });

  it('should return 404 for non-existent invitation', async () => {
    const app = createApp();
    const res = await request(app).post('/api/invitations/nonexistent/decline').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/invitations/my', () => {
  it('should return empty array when no invitations', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/invitations/my')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should return invitations for the user', async () => {
    mockInvitations['inv-1'] = {
      eventId: 'evt-1',
      invitedBy: 'other-user',
      inviteeUserId: 'mock-user-1',
      inviteeEmail: null,
      inviteePhone: null,
      role: 'member',
      status: 'pending',
      token: 'tok-1',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/invitations/my')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('pending');
  });
});

describe('GET /api/invitations/event/:eventId', () => {
  it('should return invitations for an event', async () => {
    mockInvitations['inv-2'] = {
      eventId: 'evt-2',
      invitedBy: 'mock-user-1',
      inviteeEmail: 'friend@test.com',
      inviteeUserId: null,
      inviteePhone: null,
      role: 'member',
      status: 'pending',
      token: 'tok-2',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/invitations/event/evt-2')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });
});

describe('GET /api/invitations/token/:token', () => {
  it('should return 404 for non-existent token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/invitations/token/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should return invitation by token', async () => {
    mockInvitations['inv-3'] = {
      eventId: 'evt-1',
      invitedBy: 'mock-user-1',
      inviteeEmail: 'a@b.com',
      inviteeUserId: null,
      inviteePhone: null,
      role: 'member',
      status: 'pending',
      token: 'valid-token-123',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };

    const app = createApp();
    const res = await request(app).get('/api/invitations/token/valid-token-123');
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe('valid-token-123');
  });
});

describe('GET /api/invitations/:invitationId', () => {
  it('should return 404 for non-existent invitation', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/invitations/nonexistent')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return invitation by ID', async () => {
    mockInvitations['inv-4'] = {
      eventId: 'evt-1',
      invitedBy: 'mock-user-1',
      inviteeEmail: 'x@y.com',
      inviteeUserId: null,
      inviteePhone: null,
      role: 'admin',
      status: 'pending',
      token: 'tok-4',
      message: 'Please join',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/invitations/inv-4')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
    expect(res.body.data.message).toBe('Please join');
  });
});

describe('POST /api/invitations/:invitationId/accept', () => {
  it('should return 404 for non-existent invitation', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/invitations/nonexistent/accept')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return 400 if invitation already accepted', async () => {
    mockInvitations['inv-accepted'] = {
      eventId: 'evt-1',
      invitedBy: 'other',
      inviteeEmail: null,
      inviteeUserId: 'mock-user-1',
      inviteePhone: null,
      role: 'member',
      status: 'accepted',
      token: 'tok-acc',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/invitations/inv-accepted/accept')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already been');
  });

  it('should accept invitation and add participant', async () => {
    mockInvitations['inv-pending'] = {
      eventId: 'evt-accept',
      invitedBy: 'other-user',
      inviteeEmail: null,
      inviteeUserId: 'mock-user-1',
      inviteePhone: null,
      role: 'member',
      status: 'pending',
      token: 'tok-pend',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    mockEvents['evt-accept'] = {
      name: 'Accept Event',
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
      .post('/api/invitations/inv-pending/accept')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockInvitations['inv-pending'].status).toBe('accepted');
  });
});

describe('POST /api/invitations/:invitationId/decline', () => {
  it('should decline invitation successfully', async () => {
    mockInvitations['inv-decline'] = {
      eventId: 'evt-1',
      invitedBy: 'other',
      inviteeEmail: null,
      inviteeUserId: 'mock-user-1',
      inviteePhone: null,
      role: 'member',
      status: 'pending',
      token: 'tok-dec',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/invitations/inv-decline/decline')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(mockInvitations['inv-decline'].status).toBe('declined');
  });
});

describe('DELETE /api/invitations/:invitationId', () => {
  it('should return 404 for non-existent invitation', async () => {
    const app = createApp();
    const res = await request(app)
      .delete('/api/invitations/nonexistent')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return 403 if user is not the inviter', async () => {
    mockInvitations['inv-revoke-other'] = {
      eventId: 'evt-1',
      invitedBy: 'other-user',
      inviteeEmail: 'a@b.com',
      inviteeUserId: null,
      inviteePhone: null,
      role: 'member',
      status: 'pending',
      token: 'tok-rev',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/invitations/inv-revoke-other')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
  });

  it('should revoke invitation successfully', async () => {
    mockInvitations['inv-revoke'] = {
      eventId: 'evt-1',
      invitedBy: 'mock-user-1',
      inviteeEmail: 'a@b.com',
      inviteeUserId: null,
      inviteePhone: null,
      role: 'member',
      status: 'pending',
      token: 'tok-rev2',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/invitations/inv-revoke')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockInvitations['inv-revoke']).toBeUndefined();
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
    const res = await request(app).delete('/api/invitations/inv-err').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });

  it('should return 400 if invitation is not pending', async () => {
    mockInvitations['inv-revoke-done'] = {
      eventId: 'evt-1',
      invitedBy: 'mock-user-1',
      inviteeEmail: 'a@b.com',
      inviteeUserId: null,
      inviteePhone: null,
      role: 'member',
      status: 'accepted',
      token: 'tok-rev3',
      message: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/invitations/inv-revoke-done')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot revoke');
  });
});

describe('POST /api/invitations - Email sending', () => {
  it('should store emailSent status when inviting by email', async () => {
    mockEvents['evt-email'] = {
      name: 'Email Event',
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
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-email',
        inviteeEmail: 'friend@test.com',
        role: 'member',
        message: 'Come join!',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.inviteeEmail).toBe('friend@test.com');
    expect(res.body.data.emailSent).toBe(true);
  });

  it('should not attempt email when inviting by userId only', async () => {
    mockEvents['evt-userid'] = {
      name: 'UserId Event',
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
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-userid',
        inviteeUserId: 'target-user-1',
        role: 'member',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.inviteeUserId).toBe('target-user-1');
    // emailSent should be false since no email was provided
    expect(res.body.data.emailSent).toBe(false);
  });
});

describe('POST /api/invitations - Group assignment', () => {
  it('should store groupId when provided', async () => {
    mockEvents['evt-grp'] = {
      name: 'Group Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockGroups['grp-1'] = {
      eventId: 'evt-grp',
      name: 'Room A',
      createdBy: 'mock-user-1',
      members: ['mock-user-1'],
      payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-grp',
        inviteeEmail: 'groupfriend@test.com',
        groupId: 'grp-1',
        role: 'member',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.groupId).toBe('grp-1');
  });

  it('should return 400 if groupId does not exist', async () => {
    mockEvents['evt-grp-bad'] = {
      name: 'Bad Group Event',
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
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-grp-bad',
        inviteeEmail: 'friend@test.com',
        groupId: 'nonexistent-group',
        role: 'member',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid groupId');
  });

  it('should return 400 if group belongs to a different event', async () => {
    mockEvents['evt-grp-wrong'] = {
      name: 'Wrong Group Event',
      type: 'event',
      startDate: '2025-01-01',
      currency: 'USD',
      status: 'active',
      createdBy: 'mock-user-1',
      admins: ['mock-user-1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockGroups['grp-other-event'] = {
      eventId: 'different-event-id',
      name: 'Other Group',
      createdBy: 'mock-user-1',
      members: ['mock-user-1'],
      payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-grp-wrong',
        inviteeEmail: 'friend@test.com',
        groupId: 'grp-other-event',
        role: 'member',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid groupId');
  });

  it('should create invitation without groupId (independent invitee)', async () => {
    mockEvents['evt-no-grp'] = {
      name: 'No Group Event',
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
      .post('/api/invitations')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-no-grp',
        inviteeEmail: 'independent@test.com',
        role: 'member',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.groupId).toBeNull();
  });
});

describe('POST /api/invitations/:id/accept - Group assignment on accept', () => {
  it('should add user to group when accepting invitation with groupId', async () => {
    mockGroups['grp-accept'] = {
      eventId: 'evt-accept-grp',
      name: 'Accept Group',
      createdBy: 'other-user',
      members: ['other-user'],
      payerUserId: 'other-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockInvitations['inv-grp-accept'] = {
      eventId: 'evt-accept-grp',
      invitedBy: 'other-user',
      inviteeEmail: null,
      inviteeUserId: 'mock-user-1',
      inviteePhone: null,
      groupId: 'grp-accept',
      role: 'member',
      status: 'pending',
      token: 'tok-grp-acc',
      message: null,
      emailSent: false,
      emailError: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    mockEvents['evt-accept-grp'] = {
      name: 'Accept Group Event',
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
      .post('/api/invitations/inv-grp-accept/accept')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verify user was added to group members
    expect(mockGroups['grp-accept'].members).toContain('mock-user-1');
  });

  it('should accept invitation without groupId (no group assignment)', async () => {
    mockInvitations['inv-no-grp-accept'] = {
      eventId: 'evt-no-grp-acc',
      invitedBy: 'other-user',
      inviteeEmail: null,
      inviteeUserId: 'mock-user-1',
      inviteePhone: null,
      groupId: null,
      role: 'member',
      status: 'pending',
      token: 'tok-no-grp-acc',
      message: null,
      emailSent: false,
      emailError: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      respondedAt: null,
    };
    mockEvents['evt-no-grp-acc'] = {
      name: 'No Group Accept Event',
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
      .post('/api/invitations/inv-no-grp-accept/accept')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Participant should be added to event
    expect(mockParticipants['evt-no-grp-acc/mock-user-1']).toBeDefined();
  });
});
