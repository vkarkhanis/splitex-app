import request from 'supertest';
import express from 'express';

const mockExpenses: Record<string, any> = {};
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
            const data = mockExpenses[docId];
            return Promise.resolve({
              exists: !!data,
              data: () => data || null,
              id: docId
            });
          }),
          set: jest.fn().mockImplementation((data: any, opts?: any) => {
            if (opts?.merge) {
              mockExpenses[docId] = { ...(mockExpenses[docId] || {}), ...data };
            } else {
              mockExpenses[docId] = data;
            }
            return Promise.resolve({ writeTime: new Date() });
          }),
          delete: jest.fn().mockImplementation(() => {
            delete mockExpenses[docId];
            return Promise.resolve();
          }),
          // Participants subcollection: nobody beyond the event doc's own lists.
          collection: jest.fn().mockImplementation(() => ({
            doc: jest.fn().mockImplementation(() => ({
              get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
            })),
          })),
        })),
        add: jest.fn().mockImplementation((data: any) => {
          const id = `mock-expense-${++docIdCounter}`;
          mockExpenses[id] = data;
          return Promise.resolve({ id });
        }),
        where: jest.fn().mockImplementation((field: string, op: string, value: any) => ({
          get: jest.fn().mockImplementation(() => {
            const docs = Object.entries(mockExpenses)
              .filter(([, data]) => {
                if (field === 'eventId') return data.eventId === value;
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

import { expenseRoutes } from '../../routes/expenses';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/expenses', expenseRoutes);
  return app;
}

/** Events live in the same mock map; mock-user-1 is an ordinary (non-admin) participant. */
function seedEvent(eventId: string, extra: Record<string, any> = {}) {
  mockExpenses[eventId] = { name: eventId, status: 'active', createdBy: 'event-owner', admins: ['event-owner'], participantIds: ['event-owner', 'mock-user-1'], ...extra };
}

beforeEach(() => {
  Object.keys(mockExpenses).forEach(k => delete mockExpenses[k]);
  docIdCounter = 0;
  for (const id of ['evt-1', 'evt-bal', 'evt-empty']) seedEvent(id);
});

describe('POST /api/expenses', () => {
  it('should return 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/expenses').send({});
    expect(res.status).toBe(401);
  });

  it('should return 400 if required fields are missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ title: 'Hotel' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('should return 400 if amount is zero or negative', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-1',
        title: 'Hotel',
        amount: 0,
        currency: 'USD',
        splitType: 'equal',
        splits: [{ entityType: 'user', entityId: 'u1', amount: 0 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('greater than zero');
  });

  it('should return 400 for invalid splitType', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-1',
        title: 'Hotel',
        amount: 100,
        currency: 'USD',
        splitType: 'invalid',
        splits: [{ entityType: 'user', entityId: 'u1', amount: 100 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('splitType');
  });

  it('should return 400 if splits array is empty', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-1',
        title: 'Hotel',
        amount: 100,
        currency: 'USD',
        splitType: 'equal',
        splits: [],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('split');
  });

  it('should create an expense successfully with equal split', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-1',
        title: 'Hotel',
        description: 'Beach resort',
        amount: 300,
        currency: 'USD',
        splitType: 'equal',
        splits: [
          { entityType: 'user', entityId: 'u1', amount: 100 },
          { entityType: 'user', entityId: 'u2', amount: 100 },
          { entityType: 'user', entityId: 'u3', amount: 100 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Hotel');
    expect(res.body.data.amount).toBe(300);
    expect(res.body.data.splits).toHaveLength(3);
  });

  it('should return 400 if custom splits do not sum to amount', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-1',
        title: 'Dinner',
        amount: 100,
        currency: 'USD',
        splitType: 'custom',
        splits: [
          { entityType: 'user', entityId: 'u1', amount: 40 },
          { entityType: 'user', entityId: 'u2', amount: 40 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Split amounts');
  });
});

describe('GET /api/expenses/event/:eventId', () => {
  it('should return empty array when no expenses', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/expenses/event/evt-1')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should return expenses for an event', async () => {
    mockExpenses['exp-1'] = {
      eventId: 'evt-1',
      title: 'Lunch',
      amount: 50,
      currency: 'USD',
      paidBy: 'mock-user-1',
      splitType: 'equal',
      splits: [{ entityType: 'user', entityId: 'u1', amount: 25 }],
      attachments: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/expenses/event/evt-1')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('Lunch');
  });
});

describe('GET /api/expenses/:expenseId', () => {
  it('should return 404 for non-existent expense', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/expenses/nonexistent')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return expense by ID', async () => {
    mockExpenses['exp-2'] = {
      eventId: 'evt-1',
      title: 'Taxi',
      amount: 30,
      currency: 'USD',
      paidBy: 'mock-user-1',
      splitType: 'equal',
      splits: [],
      attachments: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/expenses/exp-2')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Taxi');
  });
});

describe('PUT /api/expenses/:expenseId', () => {
  it('should return 404 for non-existent expense', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/expenses/nonexistent')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('should return 403 if user is not the payer', async () => {
    mockExpenses['exp-3'] = {
      eventId: 'evt-1',
      title: 'Dinner',
      amount: 80,
      currency: 'USD',
      paidBy: 'other-user',
      splitType: 'equal',
      splits: [],
      attachments: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/expenses/exp-3')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ title: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('should update expense successfully', async () => {
    mockExpenses['exp-4'] = {
      eventId: 'evt-1',
      title: 'Original',
      amount: 50,
      currency: 'USD',
      paidBy: 'mock-user-1',
      splitType: 'equal',
      splits: [{ entityType: 'user', entityId: 'u1', amount: 50 }],
      attachments: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/expenses/exp-4')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ title: 'Updated Title', amount: 75 });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
  });
});

describe('DELETE /api/expenses/:expenseId', () => {
  it('should return 404 for non-existent expense', async () => {
    const app = createApp();
    const res = await request(app)
      .delete('/api/expenses/nonexistent')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('should return 403 if user is not the payer', async () => {
    mockExpenses['exp-5'] = {
      eventId: 'evt-1',
      title: 'Dinner',
      amount: 80,
      currency: 'USD',
      paidBy: 'other-user',
      splitType: 'equal',
      splits: [],
      attachments: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/expenses/exp-5')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(403);
  });

  it('should delete expense successfully', async () => {
    mockExpenses['exp-6'] = {
      eventId: 'evt-1',
      title: 'Delete Me',
      amount: 20,
      currency: 'USD',
      paidBy: 'mock-user-1',
      splitType: 'equal',
      splits: [],
      attachments: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .delete('/api/expenses/exp-6')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockExpenses['exp-6']).toBeUndefined();
  });
});

describe('GET /api/expenses/event/:eventId/balances', () => {
  it('should return empty balances when no expenses', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/expenses/event/evt-empty/balances')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({});
  });

  it('should calculate balances correctly', async () => {
    mockExpenses['exp-bal-1'] = {
      eventId: 'evt-bal',
      title: 'Hotel',
      amount: 300,
      currency: 'USD',
      paidBy: 'user-a',
      splitType: 'equal',
      splits: [
        { entityType: 'user', entityId: 'user-a', amount: 100 },
        { entityType: 'user', entityId: 'user-b', amount: 100 },
        { entityType: 'user', entityId: 'user-c', amount: 100 },
      ],
      attachments: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .get('/api/expenses/event/evt-bal/balances')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(200);
    // user-a paid 300, owes 100 => net +200
    expect(res.body.data['user-a']).toBe(200);
    // user-b owes 100 => net -100
    expect(res.body.data['user-b']).toBe(-100);
    expect(res.body.data['user-c']).toBe(-100);
  });
});

describe('Error handling - GET /api/expenses/event/:eventId', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .get('/api/expenses/event/evt-err')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Failed to fetch expenses');

    db.collection = origCollection;
  });
});

describe('Error handling - GET /api/expenses/:expenseId', () => {
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
      .get('/api/expenses/exp-err')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('Error handling - POST /api/expenses', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      add: jest.fn().mockRejectedValue(new Error('Firestore error')),
    }));

    const app = createApp();
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        eventId: 'evt-1',
        title: 'Test',
        amount: 100,
        currency: 'USD',
        splitType: 'equal',
        splits: [{ entityType: 'user', entityId: 'u1', amount: 100 }],
      });
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('Error handling - PUT /api/expenses/:expenseId', () => {
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
      .put('/api/expenses/exp-err')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ title: 'Updated' });
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });

  it('should return 400 when custom splits do not sum on update', async () => {
    mockExpenses['exp-bad-split'] = {
      eventId: 'evt-1',
      title: 'Bad Split',
      amount: 100,
      currency: 'USD',
      paidBy: 'mock-user-1',
      splitType: 'custom',
      splits: [{ entityType: 'user', entityId: 'u1', amount: 100 }],
      attachments: [],
      isPrivate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const app = createApp();
    const res = await request(app)
      .put('/api/expenses/exp-bad-split')
      .set('Authorization', 'Bearer mock-user-1')
      .send({
        splitType: 'custom',
        splits: [
          { entityType: 'user', entityId: 'u1', amount: 40 },
          { entityType: 'user', entityId: 'u2', amount: 40 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Split amounts');
  });
});

describe('Error handling - DELETE /api/expenses/:expenseId', () => {
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
      .delete('/api/expenses/exp-err')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('Error handling - GET /api/expenses/event/:eventId/balances', () => {
  it('should return 500 when service throws', async () => {
    const { db } = require('../../config/firebase');
    const origCollection = db.collection;
    db.collection = jest.fn().mockImplementation(() => ({
      where: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockRejectedValue(new Error('Firestore error')),
      })),
    }));

    const app = createApp();
    const res = await request(app)
      .get('/api/expenses/event/evt-err/balances')
      .set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(500);

    db.collection = origCollection;
  });
});

describe('POST /api/expenses/calculate-splits', () => {
  it('should return 400 if amount or participantIds missing', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses/calculate-splits')
      .set('Authorization', 'Bearer mock-user-1')
      .send({});
    expect(res.status).toBe(400);
  });

  it('should calculate equal splits', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/expenses/calculate-splits')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ amount: 100, participantIds: ['u1', 'u2', 'u3'] });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    const total = res.body.data.reduce((s: number, sp: any) => s + sp.amount, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.02);
  });
});

describe('Event membership (IDOR protection)', () => {
  const lunch = (overrides: Record<string, any> = {}) => ({
    eventId: 'evt-1',
    title: 'Lunch',
    amount: 50,
    currency: 'USD',
    paidBy: 'mock-user-1',
    splitType: 'equal',
    splits: [{ entityType: 'user', entityId: 'mock-user-1', amount: 50 }],
    attachments: [],
    isPrivate: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  it('refuses to list an event\'s expenses to a non-participant', async () => {
    mockExpenses['exp-1'] = lunch();
    const res = await request(createApp()).get('/api/expenses/event/evt-1').set('Authorization', 'Bearer mock-outsider');
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
  });

  it('returns 404 when listing expenses for a missing event', async () => {
    const res = await request(createApp()).get('/api/expenses/event/no-such-event').set('Authorization', 'Bearer mock-user-1');
    expect(res.status).toBe(404);
  });

  it('lets a participant listed only in participantIds read expenses', async () => {
    seedEvent('evt-1', { participantIds: ['mock-user-1', 'mock-member'] });
    mockExpenses['exp-1'] = lunch();
    const res = await request(createApp()).get('/api/expenses/event/evt-1').set('Authorization', 'Bearer mock-member');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('hides other people\'s private expenses from the list but shows your own', async () => {
    seedEvent('evt-1', { participantIds: ['mock-user-1', 'mock-member'] });
    mockExpenses['exp-mine'] = lunch({ title: 'Mine', paidBy: 'mock-member', isPrivate: true, splits: [] });
    mockExpenses['exp-theirs'] = lunch({ title: 'Theirs', paidBy: 'mock-user-1', isPrivate: true, splits: [] });
    mockExpenses['exp-shared'] = lunch({ title: 'Shared' });
    const res = await request(createApp()).get('/api/expenses/event/evt-1').set('Authorization', 'Bearer mock-member');
    expect(res.status).toBe(200);
    expect(res.body.data.map((e: any) => e.title).sort()).toEqual(['Mine', 'Shared']);
  });

  it('refuses a single expense to a non-participant', async () => {
    mockExpenses['exp-2'] = lunch();
    const res = await request(createApp()).get('/api/expenses/exp-2').set('Authorization', 'Bearer mock-outsider');
    expect(res.status).toBe(403);
  });

  it('answers 404 (not 403) for someone else\'s private expense', async () => {
    seedEvent('evt-1', { participantIds: ['mock-user-1', 'mock-member'] });
    mockExpenses['exp-private'] = lunch({ paidBy: 'mock-user-1', isPrivate: true, splits: [] });
    const res = await request(createApp()).get('/api/expenses/exp-private').set('Authorization', 'Bearer mock-member');
    expect(res.status).toBe(404);
  });

  it('refuses to create an expense in an event you are not part of', async () => {
    const res = await request(createApp())
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-outsider')
      .send({ eventId: 'evt-1', title: 'Sneaky', amount: 10, currency: 'USD', splitType: 'equal', splits: [{ entityType: 'user', entityId: 'mock-outsider', amount: 10 }] });
    expect(res.status).toBe(403);
  });

  it('refuses balances to a non-participant', async () => {
    const res = await request(createApp()).get('/api/expenses/event/evt-bal/balances').set('Authorization', 'Bearer mock-outsider');
    expect(res.status).toBe(403);
  });

  it('rejects pool funding sources in a split-expenses event', async () => {
    const res = await request(createApp())
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ eventId: 'evt-1', title: 'Pool?', amount: 10, currency: 'USD', fundingSource: 'pool' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FUNDING_SOURCE_NOT_ALLOWED');
  });

  it('rejects an unknown funding source', async () => {
    const res = await request(createApp())
      .post('/api/expenses')
      .set('Authorization', 'Bearer mock-user-1')
      .send({ eventId: 'evt-1', title: 'X', amount: 10, currency: 'USD', splitType: 'equal', splits: [{ entityType: 'user', entityId: 'u', amount: 10 }], fundingSource: 'magic' });
    expect(res.status).toBe(400);
  });
});
