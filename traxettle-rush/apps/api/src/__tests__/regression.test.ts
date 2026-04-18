/**
 * REGRESSION TEST SUITE
 *
 * This suite validates all existing Phase 2 functionality end-to-end
 * through the API routes using supertest. Run this after any change
 * to ensure nothing is broken.
 *
 * Command: npx jest regression --no-cache
 */

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

const mockUsers: Record<string, any> = {};
const mockEvents: Record<string, any> = {};
const mockParticipants: Record<string, Record<string, any>> = {};
const mockExpenses: Record<string, any> = {};
const mockGroups: Record<string, any> = {};
const mockInvitations: Record<string, any> = {};
let docIdCounter = 0;

jest.mock('../config/firebase', () => {
  return {
    auth: {
      verifyIdToken: jest.fn().mockResolvedValue({
        uid: 'test-uid',
        email: 'test@example.com',
        name: 'Test User',
      }),
    },
    db: {
      collection: jest.fn().mockImplementation((collectionPath: string) => ({
        doc: jest.fn().mockImplementation((docId: string) => ({
          get: jest.fn().mockImplementation(() => {
            let store: Record<string, any> = {};
            if (collectionPath === 'events') store = mockEvents;
            else if (collectionPath === 'expenses') store = mockExpenses;
            else if (collectionPath === 'groups') store = mockGroups;
            else if (collectionPath === 'invitations') store = mockInvitations;
            else if (collectionPath === 'users') store = mockUsers;
            const data = store[docId];
            return Promise.resolve({ exists: !!data, data: () => data || null, id: docId });
          }),
          set: jest.fn().mockImplementation((data: any, opts?: any) => {
            let store: Record<string, any> = {};
            if (collectionPath === 'events') store = mockEvents;
            else if (collectionPath === 'expenses') store = mockExpenses;
            else if (collectionPath === 'groups') store = mockGroups;
            else if (collectionPath === 'invitations') store = mockInvitations;
            else if (collectionPath === 'users') store = mockUsers;
            if (opts?.merge) {
              store[docId] = { ...(store[docId] || {}), ...data };
            } else {
              store[docId] = data;
            }
            return Promise.resolve({ writeTime: new Date() });
          }),
          delete: jest.fn().mockImplementation(() => {
            if (collectionPath === 'events') delete mockEvents[docId];
            else if (collectionPath === 'expenses') delete mockExpenses[docId];
            else if (collectionPath === 'groups') delete mockGroups[docId];
            else if (collectionPath === 'invitations') delete mockInvitations[docId];
            else if (collectionPath === 'users') delete mockUsers[docId];
            return Promise.resolve();
          }),
          collection: jest.fn().mockImplementation(() => ({
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
          const prefixes: Record<string, string> = {
            events: 'reg-evt',
            expenses: 'reg-exp',
            groups: 'reg-grp',
            invitations: 'reg-inv',
            users: 'reg-usr',
          };
          const id = `${prefixes[collectionPath] || 'reg-doc'}-${++docIdCounter}`;
          if (collectionPath === 'events') mockEvents[id] = data;
          else if (collectionPath === 'expenses') mockExpenses[id] = data;
          else if (collectionPath === 'groups') mockGroups[id] = data;
          else if (collectionPath === 'invitations') mockInvitations[id] = data;
          else if (collectionPath === 'users') mockUsers[id] = data;
          return Promise.resolve({ id });
        }),
        where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
          get: jest.fn().mockImplementation(() => {
            let store: Record<string, any> = {};
            if (collectionPath === 'events') store = mockEvents;
            else if (collectionPath === 'expenses') store = mockExpenses;
            else if (collectionPath === 'groups') store = mockGroups;
            else if (collectionPath === 'invitations') store = mockInvitations;
            else if (collectionPath === 'users') store = mockUsers;

            const docs = Object.entries(store)
              .filter(([, data]) => {
                if (op === 'array-contains') return (data[field] || []).includes(value);
                return data[field] === value;
              })
              .map(([id, data]) => ({ id, data: () => data, exists: true }));
            return Promise.resolve({ docs, empty: docs.length === 0 });
          }),
          limit: jest.fn().mockImplementation(() => ({
            get: jest.fn().mockImplementation(() => {
              let store: Record<string, any> = {};
              if (collectionPath === 'invitations') store = mockInvitations;

              const docs = Object.entries(store)
                .filter(([, data]) => data[field] === value)
                .slice(0, 1)
                .map(([id, data]) => ({ id, data: () => data, exists: true }));
              return Promise.resolve({ docs, empty: docs.length === 0 });
            }),
          })),
        })),
      })),
    },
  };
});

import { eventRoutes } from '../routes/events';
import { expenseRoutes } from '../routes/expenses';
import { groupRoutes } from '../routes/groups';
import { invitationRoutes } from '../routes/invitations';
import { userRoutes } from '../routes/users';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/events', eventRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/invitations', invitationRoutes);
  app.use('/api/users', userRoutes);
  app.get('/health', (req, res) => res.json({ status: 'OK' }));
  return app;
}

function clearAll() {
  [mockUsers, mockEvents, mockExpenses, mockGroups, mockInvitations].forEach(store =>
    Object.keys(store).forEach(k => delete store[k])
  );
  Object.keys(mockParticipants).forEach(k => delete mockParticipants[k]);
  docIdCounter = 0;
}

const AUTH = 'Bearer mock-user-1';
const AUTH2 = 'Bearer mock-user-2';

beforeEach(() => clearAll());

// ─── 1. HEALTH CHECK ────────────────────────────────────────────────────────

describe('Regression: Health Check', () => {
  it('GET /health should return OK', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});

// ─── 2. USER PROFILE ────────────────────────────────────────────────────────

describe('Regression: User Profile', () => {
  it('GET /api/users/profile should return profile (creates default if missing)', async () => {
    const app = createApp();
    const res = await request(app).get('/api/users/profile').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe('mock-user-1');
  });

  it('PUT /api/users/profile should update profile', async () => {
    mockUsers['mock-user-1'] = {
      userId: 'mock-user-1',
      displayName: 'Old Name',
      email: 'mock@example.com',
      preferences: { notifications: true, currency: 'USD', timezone: 'UTC' },
    };
    const app = createApp();
    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', AUTH)
      .send({ displayName: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('New Name');
  });

  it('should return 401 without auth', async () => {
    const app = createApp();
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });
});

// ─── 3. EVENT CRUD ──────────────────────────────────────────────────────────

describe('Regression: Event CRUD', () => {
  it('POST /api/events should create event', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', AUTH)
      .send({ name: 'Regression Trip', type: 'trip', startDate: '2025-06-01', currency: 'USD' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Regression Trip');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.createdBy).toBe('mock-user-1');
  });

  it('GET /api/events should list user events', async () => {
    mockEvents['evt-1'] = {
      name: 'My Event', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'mock-user-1', admins: ['mock-user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).get('/api/events').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /api/events/:id should return single event', async () => {
    mockEvents['evt-2'] = {
      name: 'Single Event', type: 'event', startDate: '2025-01-01', currency: 'EUR',
      status: 'active', createdBy: 'mock-user-1', admins: ['mock-user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).get('/api/events/evt-2').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Single Event');
  });

  it('GET /api/events/:id should return 404 for non-existent', async () => {
    const app = createApp();
    const res = await request(app).get('/api/events/nonexistent').set('Authorization', AUTH);
    expect(res.status).toBe(404);
  });

  it('PUT /api/events/:id should update event (admin only)', async () => {
    mockEvents['evt-upd'] = {
      name: 'Old Name', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'mock-user-1', admins: ['mock-user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app)
      .put('/api/events/evt-upd')
      .set('Authorization', AUTH)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
  });

  it('DELETE /api/events/:id should delete event (creator only)', async () => {
    mockEvents['evt-del'] = {
      name: 'Delete Me', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'mock-user-1', admins: ['mock-user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).delete('/api/events/evt-del').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(mockEvents['evt-del']).toBeUndefined();
  });

  it('DELETE /api/events/:id should return 403 for non-creator', async () => {
    mockEvents['evt-del-other'] = {
      name: 'Not Mine', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'other-user', admins: ['other-user'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).delete('/api/events/evt-del-other').set('Authorization', AUTH);
    expect(res.status).toBe(403);
  });
});

// ─── 4. PARTICIPANT MANAGEMENT ──────────────────────────────────────────────

describe('Regression: Participants', () => {
  it('GET /api/events/:id/participants should list participants', async () => {
    mockEvents['evt-part'] = {
      name: 'Part Event', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'mock-user-1', admins: ['mock-user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-part/mock-user-1'] = {
      userId: 'mock-user-1', role: 'admin', joinedAt: new Date().toISOString(),
      invitedBy: 'mock-user-1', status: 'accepted',
    };
    const app = createApp();
    const res = await request(app).get('/api/events/evt-part/participants').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('POST /api/events/:id/participants should add participant', async () => {
    mockEvents['evt-add-part'] = {
      name: 'Add Part', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'mock-user-1', admins: ['mock-user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app)
      .post('/api/events/evt-add-part/participants')
      .set('Authorization', AUTH)
      .send({ userId: 'new-user', role: 'member' });
    expect(res.status).toBe(201);
  });

  it('DELETE /api/events/:id/participants/:userId should remove participant', async () => {
    mockEvents['evt-rm-part'] = {
      name: 'Rm Part', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'mock-user-1', admins: ['mock-user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockParticipants['evt-rm-part/user-to-remove'] = {
      userId: 'user-to-remove', role: 'member', joinedAt: new Date().toISOString(),
      invitedBy: 'mock-user-1', status: 'accepted',
    };
    const app = createApp();
    const res = await request(app)
      .delete('/api/events/evt-rm-part/participants/user-to-remove')
      .set('Authorization', AUTH);
    expect(res.status).toBe(200);
  });
});

// ─── 5. EXPENSE CRUD ────────────────────────────────────────────────────────

describe('Regression: Expense CRUD', () => {
  it('POST /api/expenses should create expense', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', AUTH)
      .send({
        eventId: 'evt-1', title: 'Dinner', amount: 100, currency: 'USD',
        splitType: 'equal',
        splits: [
          { entityType: 'user', entityId: 'mock-user-1', amount: 50 },
          { entityType: 'user', entityId: 'mock-user-2', amount: 50 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Dinner');
    expect(res.body.data.amount).toBe(100);
  });

  it('GET /api/expenses/event/:eventId should list expenses', async () => {
    mockExpenses['exp-1'] = {
      eventId: 'evt-list', title: 'Lunch', amount: 50, currency: 'USD',
      paidBy: 'mock-user-1', isPrivate: false, splitType: 'equal',
      splits: [{ entityType: 'user', entityId: 'mock-user-1', amount: 25 }],
      attachments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).get('/api/expenses/event/evt-list').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /api/expenses/:id should return single expense', async () => {
    mockExpenses['exp-single'] = {
      eventId: 'evt-1', title: 'Taxi', amount: 30, currency: 'USD',
      paidBy: 'mock-user-1', isPrivate: false, splitType: 'equal',
      splits: [], attachments: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).get('/api/expenses/exp-single').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Taxi');
  });

  it('PUT /api/expenses/:id should update expense', async () => {
    mockExpenses['exp-upd'] = {
      eventId: 'evt-1', title: 'Old Title', amount: 100, currency: 'USD',
      paidBy: 'mock-user-1', isPrivate: false, splitType: 'equal',
      splits: [], attachments: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app)
      .put('/api/expenses/exp-upd')
      .set('Authorization', AUTH)
      .send({ title: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New Title');
  });

  it('DELETE /api/expenses/:id should delete expense', async () => {
    mockExpenses['exp-del'] = {
      eventId: 'evt-1', title: 'Delete Me', amount: 10, currency: 'USD',
      paidBy: 'mock-user-1', isPrivate: false, splitType: 'equal',
      splits: [], attachments: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).delete('/api/expenses/exp-del').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(mockExpenses['exp-del']).toBeUndefined();
  });

  it('GET /api/expenses/event/:eventId/balances should return balances', async () => {
    mockExpenses['exp-bal-1'] = {
      eventId: 'evt-bal', title: 'Hotel', amount: 200, currency: 'USD',
      paidBy: 'mock-user-1', isPrivate: false, splitType: 'equal',
      splits: [
        { entityType: 'user', entityId: 'mock-user-1', amount: 100 },
        { entityType: 'user', entityId: 'mock-user-2', amount: 100 },
      ],
      attachments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).get('/api/expenses/event/evt-bal/balances').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data['mock-user-1']).toBe(100);
    expect(res.body.data['mock-user-2']).toBe(-100);
  });
});

// ─── 6. EXPENSE SPLIT TYPES ─────────────────────────────────────────────────

describe('Regression: Split Types', () => {
  it('should create expense with equal split', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', AUTH)
      .send({
        eventId: 'evt-1', title: 'Equal Split', amount: 90, currency: 'USD',
        splitType: 'equal',
        splits: [
          { entityType: 'user', entityId: 'u1', amount: 30 },
          { entityType: 'user', entityId: 'u2', amount: 30 },
          { entityType: 'user', entityId: 'u3', amount: 30 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.splitType).toBe('equal');
  });

  it('should create expense with ratio split', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', AUTH)
      .send({
        eventId: 'evt-1', title: 'Ratio Split', amount: 100, currency: 'USD',
        splitType: 'ratio',
        splits: [
          { entityType: 'user', entityId: 'u1', amount: 60, ratio: 3 },
          { entityType: 'user', entityId: 'u2', amount: 40, ratio: 2 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.splitType).toBe('ratio');
  });

  it('should create expense with custom split', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', AUTH)
      .send({
        eventId: 'evt-1', title: 'Custom Split', amount: 100, currency: 'USD',
        splitType: 'custom',
        splits: [
          { entityType: 'user', entityId: 'u1', amount: 70 },
          { entityType: 'user', entityId: 'u2', amount: 30 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.splitType).toBe('custom');
  });

  it('should reject custom split that does not sum to total', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', AUTH)
      .send({
        eventId: 'evt-1', title: 'Bad Split', amount: 100, currency: 'USD',
        splitType: 'custom',
        splits: [
          { entityType: 'user', entityId: 'u1', amount: 60 },
          { entityType: 'user', entityId: 'u2', amount: 30 },
        ],
      });
    expect(res.status).toBe(400);
  });
});

// ─── 7. GROUP CRUD ──────────────────────────────────────────────────────────

describe('Regression: Group CRUD', () => {
  it('POST /api/groups should create group', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', AUTH)
      .send({
        eventId: 'evt-1', name: 'Family', memberIds: ['mock-user-1', 'mock-user-2'],
        payerUserId: 'mock-user-1',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Family');
    expect(res.body.data.members).toContain('mock-user-1');
  });

  it('GET /api/groups/event/:eventId should list groups', async () => {
    mockGroups['grp-list'] = {
      eventId: 'evt-grp-list', name: 'Room A', createdBy: 'mock-user-1',
      members: ['mock-user-1'], payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).get('/api/groups/event/evt-grp-list').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /api/groups/:id should return single group', async () => {
    mockGroups['grp-single'] = {
      eventId: 'evt-1', name: 'Couple', createdBy: 'mock-user-1',
      members: ['mock-user-1', 'mock-user-2'], payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).get('/api/groups/grp-single').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Couple');
  });

  it('PUT /api/groups/:id should update group payerUserId (creator only)', async () => {
    mockGroups['grp-upd'] = {
      eventId: 'evt-1', name: 'Old Name', createdBy: 'mock-user-1',
      members: ['mock-user-1', 'mock-user-2'], payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app)
      .put('/api/groups/grp-upd')
      .set('Authorization', AUTH)
      .send({ payerUserId: 'mock-user-2' });
    expect(res.status).toBe(200);
    expect(res.body.data.payerUserId).toBe('mock-user-2');
  });

  it('DELETE /api/groups/:id should delete group (creator only)', async () => {
    mockGroups['grp-del'] = {
      eventId: 'evt-1', name: 'Delete Me', createdBy: 'mock-user-1',
      members: ['mock-user-1'], payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).delete('/api/groups/grp-del').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(mockGroups['grp-del']).toBeUndefined();
  });

  it('POST /api/groups/:id/members should add member', async () => {
    mockGroups['grp-add-mem'] = {
      eventId: 'evt-1', name: 'Add Mem', createdBy: 'mock-user-1',
      members: ['mock-user-1'], payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app)
      .post('/api/groups/grp-add-mem/members')
      .set('Authorization', AUTH)
      .send({ userId: 'new-member' });
    expect(res.status).toBe(200);
    expect(mockGroups['grp-add-mem'].members).toContain('new-member');
  });

  it('DELETE /api/groups/:id/members/:userId should remove member', async () => {
    mockGroups['grp-rm-mem'] = {
      eventId: 'evt-1', name: 'Rm Mem', createdBy: 'mock-user-1',
      members: ['mock-user-1', 'remove-me'], payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app)
      .delete('/api/groups/grp-rm-mem/members/remove-me')
      .set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(mockGroups['grp-rm-mem'].members).not.toContain('remove-me');
  });
});

// ─── 8. INVITATION CRUD ─────────────────────────────────────────────────────

describe('Regression: Invitation CRUD', () => {
  const setupAdminEvent = (id: string) => {
    mockEvents[id] = {
      name: 'Inv Event', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'mock-user-1', admins: ['mock-user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  };

  it('POST /api/invitations should create invitation with email', async () => {
    setupAdminEvent('evt-inv-create');
    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', AUTH)
      .send({ eventId: 'evt-inv-create', inviteeEmail: 'new@test.com', role: 'member' });
    expect(res.status).toBe(201);
    expect(res.body.data.inviteeEmail).toBe('new@test.com');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.emailSent).toBe(true);
  });

  it('POST /api/invitations should create invitation with groupId', async () => {
    setupAdminEvent('evt-inv-grp');
    mockGroups['grp-inv'] = {
      eventId: 'evt-inv-grp', name: 'Inv Group', createdBy: 'mock-user-1',
      members: ['mock-user-1'], payerUserId: 'mock-user-1',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', AUTH)
      .send({ eventId: 'evt-inv-grp', inviteeEmail: 'grp@test.com', groupId: 'grp-inv', role: 'member' });
    expect(res.status).toBe(201);
    expect(res.body.data.groupId).toBe('grp-inv');
  });

  it('GET /api/invitations/my should return user invitations', async () => {
    mockInvitations['inv-my'] = {
      eventId: 'evt-1', invitedBy: 'other', inviteeUserId: 'mock-user-1',
      inviteeEmail: null, inviteePhone: null, groupId: null,
      role: 'member', status: 'pending', token: 'tok-my', message: null,
      emailSent: false, emailError: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), respondedAt: null,
    };
    const app = createApp();
    const res = await request(app).get('/api/invitations/my').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /api/invitations/event/:eventId should return event invitations', async () => {
    mockInvitations['inv-evt'] = {
      eventId: 'evt-inv-list', invitedBy: 'mock-user-1', inviteeEmail: 'a@b.com',
      inviteeUserId: null, inviteePhone: null, groupId: null,
      role: 'member', status: 'pending', token: 'tok-evt', message: null,
      emailSent: true, emailError: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), respondedAt: null,
    };
    const app = createApp();
    const res = await request(app).get('/api/invitations/event/evt-inv-list').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('GET /api/invitations/token/:token should return invitation by token', async () => {
    mockInvitations['inv-tok'] = {
      eventId: 'evt-1', invitedBy: 'mock-user-1', inviteeEmail: 'x@y.com',
      inviteeUserId: null, inviteePhone: null, groupId: null,
      role: 'member', status: 'pending', token: 'unique-token-123', message: null,
      emailSent: true, emailError: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), respondedAt: null,
    };
    const app = createApp();
    const res = await request(app).get('/api/invitations/token/unique-token-123');
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe('unique-token-123');
  });

  it('POST /api/invitations/:id/accept should accept and add participant', async () => {
    mockInvitations['inv-accept'] = {
      eventId: 'evt-accept', invitedBy: 'other', inviteeUserId: 'mock-user-1',
      inviteeEmail: null, inviteePhone: null, groupId: null,
      role: 'member', status: 'pending', token: 'tok-accept', message: null,
      emailSent: false, emailError: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), respondedAt: null,
    };
    mockEvents['evt-accept'] = {
      name: 'Accept Event', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'other', admins: ['other'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).post('/api/invitations/inv-accept/accept').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(mockInvitations['inv-accept'].status).toBe('accepted');
    expect(mockParticipants['evt-accept/mock-user-1']).toBeDefined();
  });

  it('POST /api/invitations/:id/accept should add to group when groupId set', async () => {
    mockGroups['grp-on-accept'] = {
      eventId: 'evt-grp-accept', name: 'Accept Group', createdBy: 'other',
      members: ['other'], payerUserId: 'other',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mockInvitations['inv-grp-acc'] = {
      eventId: 'evt-grp-accept', invitedBy: 'other', inviteeUserId: 'mock-user-1',
      inviteeEmail: null, inviteePhone: null, groupId: 'grp-on-accept',
      role: 'member', status: 'pending', token: 'tok-grp-acc', message: null,
      emailSent: false, emailError: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), respondedAt: null,
    };
    mockEvents['evt-grp-accept'] = {
      name: 'Grp Accept Event', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'other', admins: ['other'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app).post('/api/invitations/inv-grp-acc/accept').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(mockGroups['grp-on-accept'].members).toContain('mock-user-1');
  });

  it('POST /api/invitations/:id/decline should decline invitation', async () => {
    mockInvitations['inv-decline'] = {
      eventId: 'evt-1', invitedBy: 'other', inviteeUserId: 'mock-user-1',
      inviteeEmail: null, inviteePhone: null, groupId: null,
      role: 'member', status: 'pending', token: 'tok-dec', message: null,
      emailSent: false, emailError: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), respondedAt: null,
    };
    const app = createApp();
    const res = await request(app).post('/api/invitations/inv-decline/decline').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(mockInvitations['inv-decline'].status).toBe('declined');
  });

  it('DELETE /api/invitations/:id should revoke invitation (inviter only)', async () => {
    mockInvitations['inv-revoke'] = {
      eventId: 'evt-1', invitedBy: 'mock-user-1', inviteeEmail: 'a@b.com',
      inviteeUserId: null, inviteePhone: null, groupId: null,
      role: 'member', status: 'pending', token: 'tok-rev', message: null,
      emailSent: true, emailError: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), respondedAt: null,
    };
    const app = createApp();
    const res = await request(app).delete('/api/invitations/inv-revoke').set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(mockInvitations['inv-revoke']).toBeUndefined();
  });
});

// ─── 9. AUTHORIZATION CHECKS ────────────────────────────────────────────────

describe('Regression: Authorization', () => {
  it('should return 401 for all protected routes without auth', async () => {
    const app = createApp();
    const routes = [
      { method: 'get', path: '/api/events' },
      { method: 'post', path: '/api/events' },
      { method: 'get', path: '/api/events/evt-1' },
      { method: 'post', path: '/api/expenses' },
      { method: 'post', path: '/api/groups' },
      { method: 'post', path: '/api/invitations' },
      { method: 'get', path: '/api/invitations/my' },
      { method: 'get', path: '/api/users/profile' },
    ];

    for (const route of routes) {
      const res = await (request(app) as any)[route.method](route.path).send({});
      expect(res.status).toBe(401);
    }
  });

  it('should return 403 when non-admin tries to send invitation', async () => {
    mockEvents['evt-nonadmin'] = {
      name: 'Non Admin', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'other-user', admins: ['other-user'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', AUTH)
      .send({ eventId: 'evt-nonadmin', inviteeEmail: 'a@b.com' });
    expect(res.status).toBe(403);
  });
});

// ─── 10. VALIDATION CHECKS ──────────────────────────────────────────────────

describe('Regression: Validation', () => {
  it('POST /api/events should require name', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', AUTH)
      .send({ type: 'event', startDate: '2025-01-01', currency: 'USD' });
    expect(res.status).toBe(400);
  });

  it('POST /api/expenses should require title and amount', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', AUTH)
      .send({ eventId: 'evt-1', splitType: 'equal', splits: [] });
    expect(res.status).toBe(400);
  });

  it('POST /api/groups should require name and eventId', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', AUTH)
      .send({ memberIds: ['u1'], payerUserId: 'u1' });
    expect(res.status).toBe(400);
  });

  it('POST /api/invitations should require eventId', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', AUTH)
      .send({ inviteeEmail: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('POST /api/invitations should require at least one invitee identifier', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', AUTH)
      .send({ eventId: 'evt-1' });
    expect(res.status).toBe(400);
  });

  it('POST /api/invitations should reject invalid groupId', async () => {
    mockEvents['evt-val-grp'] = {
      name: 'Val Grp', type: 'event', startDate: '2025-01-01', currency: 'USD',
      status: 'active', createdBy: 'mock-user-1', admins: ['mock-user-1'],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const app = createApp();
    const res = await request(app)
      .post('/api/invitations')
      .set('Authorization', AUTH)
      .send({ eventId: 'evt-val-grp', inviteeEmail: 'a@b.com', groupId: 'bad-grp' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid groupId');
  });
});
