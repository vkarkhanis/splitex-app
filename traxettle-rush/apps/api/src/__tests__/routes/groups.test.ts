import request from 'supertest';
import express from 'express';

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
            const data = mockGroups[docId];
            return Promise.resolve({
              exists: !!data,
              data: () => data || null,
              id: docId
            });
          }),
          set: jest.fn().mockImplementation((data: any, opts?: any) => {
            if (opts?.merge) {
              mockGroups[docId] = { ...(mockGroups[docId] || {}), ...data };
            } else {
              mockGroups[docId] = data;
            }
            return Promise.resolve({ writeTime: new Date() });
          }),
          delete: jest.fn().mockImplementation(() => {
            delete mockGroups[docId];
            return Promise.resolve();
          }),
        })),
        add: jest.fn().mockImplementation((data: any) => {
          const id = `mock-group-${++docIdCounter}`;
          mockGroups[id] = data;
          return Promise.resolve({ id });
        }),
        where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
          get: jest.fn().mockImplementation(() => {
            const docs = Object.entries(mockGroups)
              .filter(([, data]) => {
                if (op === '==' && field === 'eventId') return data.eventId === value;
                if (op === '==' && field === 'createdBy') return data.createdBy === value;
                if (op === 'array-contains' && field === 'members') return Array.isArray(data.members) && data.members.includes(value);
                if (op === 'array-contains' && field === 'eventIds') return Array.isArray(data.eventIds) && data.eventIds.includes(value);
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

import { groupRoutes } from '../../routes/groups';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/groups', groupRoutes);
  return app;
}

beforeEach(() => {
  Object.keys(mockGroups).forEach(k => delete mockGroups[k]);
  docIdCounter = 0;
});

describe('POST /api/groups', () => {
  it('should return 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/groups').send({});
    expect(res.status).toBe(401);
  });

  it('should return 400 if required fields are missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Family' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('should return 400 if memberIds is empty', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ eventId: 'evt-1', name: 'Family', memberIds: [], payerUserId: 'u1' });
    expect(res.status).toBe(400);
  });

  it('should create a group successfully', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-1',
        name: 'Family',
        description: 'My family group',
        memberIds: ['u1', 'u2'],
        payerUserId: 'u1',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Family');
    expect(res.body.data.members).toEqual(['u1', 'u2']);
  });
});

describe('GET /api/groups/event/:eventId', () => {
  it('should return empty array when no groups', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/groups/event/evt-1')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should return groups for an event', async () => {
    mockGroups['grp-1'] = {
      eventId: 'evt-1',
      name: 'Couple',
      createdBy: 'mock-user-1',
      members: ['u1', 'u2'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/groups/event/evt-1')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Couple');
  });
});

describe('GET /api/groups/:groupId', () => {
  it('should return 404 for non-existent group', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/groups/nonexistent')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return group by ID', async () => {
    mockGroups['grp-2'] = {
      eventId: 'evt-1',
      name: 'Friends',
      createdBy: 'mock-user-1',
      members: ['u1', 'u2', 'u3'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/groups/grp-2')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Friends');
    expect(res.body.data.members).toHaveLength(3);
  });
});

describe('PUT /api/groups/:groupId', () => {
  it('should return 404 for non-existent group', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/groups/nonexistent')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('should return 403 if user is not the creator', async () => {
    mockGroups['grp-3'] = {
      eventId: 'evt-1',
      name: 'Other Group',
      createdBy: 'other-user',
      members: ['u1'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/groups/grp-3')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('should update group payerUserId successfully', async () => {
    mockGroups['grp-4'] = {
      eventId: 'evt-1',
      name: 'Original',
      createdBy: 'mock-user-1',
      members: ['u1', 'u2'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/groups/grp-4')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ payerUserId: 'u2' });
    expect(res.status).toBe(200);
    expect(res.body.data.payerUserId).toBe('u2');
  });
});

describe('DELETE /api/groups/:groupId', () => {
  it('should return 404 for non-existent group', async () => {
    const app = createApp();
    const res = await request(app)
      .delete('/api/groups/nonexistent')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return 403 if user is not the creator', async () => {
    mockGroups['grp-5'] = {
      eventId: 'evt-1',
      name: 'Other',
      createdBy: 'other-user',
      members: ['u1'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/groups/grp-5')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
  });

  it('should delete group successfully', async () => {
    mockGroups['grp-6'] = {
      eventId: 'evt-1',
      name: 'Delete Me',
      createdBy: 'mock-user-1',
      members: ['u1'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/groups/grp-6')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockGroups['grp-6']).toBeUndefined();
  });
});

describe('POST /api/groups/:groupId/members', () => {
  it('should return 400 if userId is missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/groups/grp-1/members')
      .set('Authorization', 'Bearer mock-user-1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should add member successfully', async () => {
    mockGroups['grp-7'] = {
      eventId: 'evt-1',
      name: 'Add Members',
      createdBy: 'mock-user-1',
      members: ['u1'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/groups/grp-7/members')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ userId: 'u2' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Error handling - GET /api/groups/event/:eventId', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).get('/api/groups/event/evt-err').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - GET /api/groups/:groupId', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).get('/api/groups/grp-err').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - POST /api/groups', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      add: jest.fn().mockRejectedValue(new Error('Firestore error')),
    }));
    const app = createApp();
    const res = await request(app).post('/api/groups').set('Authorization', 'Bearer mock-user-1')
      .send({ eventId: 'evt-1', name: 'Test', memberIds: ['u1'], payerUserId: 'u1' });
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - PUT /api/groups/:groupId', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).put('/api/groups/grp-err').set('Authorization', 'Bearer mock-user-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - DELETE /api/groups/:groupId', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).delete('/api/groups/grp-err').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });
});

describe('Error handling - POST /api/groups/:groupId/members', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).post('/api/groups/grp-err/members').set('Authorization', 'Bearer mock-user-1')
      .send({ userId: 'u1' });
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });

  it('should return 403 when user is not the creator', async () => {
    mockGroups['grp-notcreator'] = {
      eventId: 'evt-1',
      name: 'Not Creator',
      createdBy: 'other-user',
      members: ['u1'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).post('/api/groups/grp-notcreator/members').set('Authorization', 'Bearer mock-user-1')
      .send({ userId: 'u2' });
    expect(res.status).toBe(403);
  });

  it('should return 404 when group not found', async () => {
    const app = createApp();
    const res = await request(app).post('/api/groups/nonexistent/members').set('Authorization', 'Bearer mock-user-1')
      .send({ userId: 'u1' });
    expect(res.status).toBe(404);
  });
});

describe('Error handling - DELETE /api/groups/:groupId/members/:userId', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      doc: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));
    const app = createApp();
    const res = await request(app).delete('/api/groups/grp-err/members/u1').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    db.collection = origCollection;
  });

  it('should return 404 when group not found', async () => {
    const app = createApp();
    const res = await request(app).delete('/api/groups/nonexistent/members/u1').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return 403 when user is not creator or self', async () => {
    mockGroups['grp-forbid'] = {
      eventId: 'evt-1',
      name: 'Forbidden',
      createdBy: 'other-user',
      members: ['u1', 'u2'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).delete('/api/groups/grp-forbid/members/u2').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/groups/:groupId/members/:userId', () => {
  it('should remove member successfully', async () => {
    mockGroups['grp-8'] = {
      eventId: 'evt-1',
      name: 'Remove Members',
      createdBy: 'mock-user-1',
      members: ['u1', 'u2'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/groups/grp-8/members/u2')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/groups/my', () => {
  it('should return groups where user is a member', async () => {
    mockGroups['grp-my-1'] = {
      eventId: 'evt-1',
      name: 'My Group',
      createdBy: 'other-user',
      members: ['mock-user-1', 'other-user'],
      payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockGroups['grp-my-2'] = {
      eventId: 'evt-2',
      name: 'Not My Group',
      createdBy: 'other-user',
      members: ['other-user'],
      payerUserId: 'other-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/groups/my')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('My Group');
  });
});

describe('POST /api/groups/suggest', () => {
  it('should return 400 if memberIds missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/groups/suggest')
      .set('Authorization', 'Bearer mock-user-1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should suggest groups with >= 70% member overlap', async () => {
    mockGroups['grp-sug-1'] = {
      eventId: 'evt-1',
      name: 'Matching Group',
      createdBy: 'mock-user-1',
      members: ['u1', 'u2', 'u3'],
      payerUserId: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockGroups['grp-sug-2'] = {
      eventId: 'evt-2',
      name: 'Non-matching Group',
      createdBy: 'mock-user-1',
      members: ['u9', 'u10'],
      payerUserId: 'u9',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/groups/suggest')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ memberIds: ['u1', 'u2', 'u3'] });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((g: any) => g.name === 'Matching Group')).toBe(true);
    expect(res.body.data.some((g: any) => g.name === 'Non-matching Group')).toBe(false);
  });
});

describe('POST /api/groups/:groupId/add-to-event', () => {
  it('should return 400 if eventId missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/groups/grp-add/add-to-event')
      .set('Authorization', 'Bearer mock-user-1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent group', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/groups/nonexistent/add-to-event')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ eventId: 'evt-2' });
    expect(res.status).toBe(404);
  });

  it('should add group to event', async () => {
    mockGroups['grp-add'] = {
      eventId: 'evt-1',
      eventIds: ['evt-1'],
      name: 'Reusable Group',
      createdBy: 'mock-user-1',
      members: ['mock-user-1', 'u2'],
      payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .post('/api/groups/grp-add/add-to-event')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ eventId: 'evt-2' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockGroups['grp-add'].eventIds).toContain('evt-2');
  });
});

describe('PUT /api/groups/:groupId/transfer-representative', () => {
  it('should return 400 if newRepresentative missing', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/groups/grp-tr/transfer-representative')
      .set('Authorization', 'Bearer mock-user-1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent group', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/groups/nonexistent/transfer-representative')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ newRepresentative: 'u2' });
    expect(res.status).toBe(404);
  });

  it('should transfer representative to a valid member', async () => {
    mockGroups['grp-tr'] = {
      eventId: 'evt-1',
      name: 'Transfer Group',
      createdBy: 'mock-user-1',
      members: ['mock-user-1', 'u2'],
      representative: 'mock-user-1',
      payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/groups/grp-tr/transfer-representative')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ newRepresentative: 'u2' });
    expect(res.status).toBe(200);
    expect(res.body.data.representative).toBe('u2');
  });

  it('should reject transfer to non-member', async () => {
    mockGroups['grp-tr2'] = {
      eventId: 'evt-1',
      name: 'Transfer Group 2',
      createdBy: 'mock-user-1',
      members: ['mock-user-1', 'u2'],
      representative: 'mock-user-1',
      payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/groups/grp-tr2/transfer-representative')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ newRepresentative: 'outsider' });
    expect(res.status).toBe(403);
  });
});

describe('Group immutability & representative permissions', () => {
  it('should allow representative to delete group', async () => {
    mockGroups['grp-rep-del'] = {
      eventId: 'evt-1',
      name: 'Rep Delete Group',
      createdBy: 'other-user',
      members: ['mock-user-1', 'other-user'],
      representative: 'mock-user-1',
      payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/groups/grp-rep-del')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(mockGroups['grp-rep-del']).toBeUndefined();
  });

  it('should allow representative to update group', async () => {
    mockGroups['grp-rep-upd'] = {
      eventId: 'evt-1',
      name: 'Rep Update Group',
      createdBy: 'other-user',
      members: ['mock-user-1', 'other-user'],
      representative: 'mock-user-1',
      payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/groups/grp-rep-upd')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ payerUserId: 'other-user' });
    expect(res.status).toBe(200);
    expect(res.body.data.payerUserId).toBe('other-user');
  });

  it('should reject update from non-creator non-representative', async () => {
    mockGroups['grp-no-perm'] = {
      eventId: 'evt-1',
      name: 'No Perm Group',
      createdBy: 'other-user',
      members: ['mock-user-1', 'other-user'],
      representative: 'other-user',
      payerUserId: 'other-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/groups/grp-no-perm')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ payerUserId: 'mock-user-1' });
    expect(res.status).toBe(403);
  });

  it('should reject delete from non-creator non-representative', async () => {
    mockGroups['grp-no-del'] = {
      eventId: 'evt-1',
      name: 'No Del Group',
      createdBy: 'other-user',
      members: ['mock-user-1', 'other-user'],
      representative: 'other-user',
      payerUserId: 'other-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/groups/grp-no-del')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
  });
});
