/**
 * End-to-end harness for money-pooling tests: mounts the real routers and
 * exposes small helpers. Each test file must mock '../../config/firebase' with
 * a memory Firestore (exported as `__store`), nodemailer and the notification
 * helper BEFORE requiring this module's buildApp().
 */
import express from 'express';
import request from 'supertest';

export function buildApp() {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { eventRoutes } = require('../../routes/events');
  const { expenseRoutes } = require('../../routes/expenses');
  const { poolRoutes } = require('../../routes/pools');
  const { settlementRoutes } = require('../../routes/settlements');
  const { invitationRoutes } = require('../../routes/invitations');
  const { uploadRoutes } = require('../../routes/uploads');
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use('/api/events', eventRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/pools', poolRoutes);
  app.use('/api/settlements', settlementRoutes);
  app.use('/api/invitations', invitationRoutes);
  app.use('/api/uploads', uploadRoutes);
  return app;
}

export const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

export function poolApi(app: express.Express) {
  const api = {
    async createEvent(uid: string, extra: Record<string, any> = {}) {
      const res = await request(app).post('/api/events').set(auth(uid)).send({
        name: 'Test event',
        type: 'trip',
        startDate: '2026-10-01',
        currency: 'INR',
        ...extra,
      });
      return res;
    },
    async createPool(uid: string, pool: Record<string, any>, extra: Record<string, any> = {}) {
      const res = await api.createEvent(uid, { pool, ...extra });
      if (res.status !== 201) throw new Error(`createPool failed: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body.data.id as string;
    },
    async join(eventId: string, adminUid: string, uid: string) {
      const res = await request(app).post(`/api/events/${eventId}/participants`).set(auth(adminUid)).send({ userId: uid });
      if (res.status !== 201) throw new Error(`join failed: ${res.status} ${JSON.stringify(res.body)}`);
      return res;
    },
    leave: (eventId: string, actorUid: string, uid: string) =>
      request(app).delete(`/api/events/${eventId}/participants/${uid}`).set(auth(actorUid)),
    summary: async (eventId: string, uid: string) => (await request(app).get(`/api/pools/event/${eventId}/summary`).set(auth(uid))).body.data,
    ledger: async (eventId: string, uid: string) => (await request(app).get(`/api/pools/event/${eventId}/ledger`).set(auth(uid))).body.data,
    cycles: async (eventId: string, uid: string) => (await request(app).get(`/api/pools/event/${eventId}/cycles`).set(auth(uid))).body.data,
    async contributionOf(eventId: string, viewer: string, fromUserId: string, kind = 'regular') {
      const ledger = await api.ledger(eventId, viewer);
      return ledger.contributions.find((c: any) => c.fromUserId === fromUserId && c.kind === kind);
    },
    markPaid: (id: string, uid: string, body: Record<string, any> = {}) =>
      request(app).post(`/api/pools/contributions/${id}/mark-paid`).set(auth(uid)).send(body),
    confirm: (id: string, uid: string, body: Record<string, any> = {}) =>
      request(app).post(`/api/pools/contributions/${id}/confirm`).set(auth(uid)).send(body),
    /** Contributor pays in full and the custodian confirms (the custodian's own dues self-confirm). */
    async payIn(eventId: string, custodian: string, uid: string, amountMinor?: number) {
      const c = await api.contributionOf(eventId, custodian, uid);
      const marked = await api.markPaid(c.id, uid, amountMinor ? { amountMinor } : {});
      if (marked.status !== 200) throw new Error(`markPaid failed: ${JSON.stringify(marked.body)}`);
      if (marked.body.data.status === 'confirmed') return marked.body.data;
      const confirmed = await api.confirm(c.id, custodian);
      if (confirmed.status !== 200) throw new Error(`confirm failed: ${JSON.stringify(confirmed.body)}`);
      return confirmed.body.data;
    },
    setContributions: (eventId: string, uid: string, contributions: any[]) =>
      request(app).put(`/api/pools/event/${eventId}/contributions`).set(auth(uid)).send({ contributions }),
    topUp: (eventId: string, uid: string, body: Record<string, any>) =>
      request(app).post(`/api/pools/event/${eventId}/top-ups`).set(auth(uid)).send(body),
    spend: (eventId: string, uid: string, amount: number, extra: Record<string, any> = {}) =>
      request(app).post('/api/expenses').set(auth(uid)).send({
        eventId,
        title: extra.title || `Spend ${amount}`,
        amount,
        currency: 'INR',
        fundingSource: 'pool',
        ...extra,
      }),
    claim: (eventId: string, uid: string, amount: number, extra: Record<string, any> = {}) =>
      request(app).post('/api/expenses').set(auth(uid)).send({
        eventId,
        title: extra.title || `Claim ${amount}`,
        amount,
        currency: 'INR',
        fundingSource: 'pool_reimbursement',
        attachments: ['https://receipts.example/r.jpg'],
        ...extra,
      }),
    approveDraw: (expenseId: string, uid: string) => request(app).post(`/api/pools/expenses/${expenseId}/approve`).set(auth(uid)).send({}),
    rejectDraw: (expenseId: string, uid: string, reason?: string) =>
      request(app).post(`/api/pools/expenses/${expenseId}/reject`).set(auth(uid)).send(reason ? { reason } : {}),
    closeCycle: (eventId: string, uid: string, body: Record<string, any> = {}) =>
      request(app).post(`/api/pools/event/${eventId}/close`).set(auth(uid)).send(body),
    previewClose: (eventId: string, uid: string, body: Record<string, any> = {}) =>
      request(app).post(`/api/pools/event/${eventId}/close-preview`).set(auth(uid)).send(body),
    dissolve: (eventId: string, uid: string, body: Record<string, any> = {}) =>
      request(app).post(`/api/pools/event/${eventId}/dissolve`).set(auth(uid)).send(body),
    settlements: async (eventId: string, uid: string) =>
      (await request(app).get(`/api/settlements/event/${eventId}`).set(auth(uid))).body.data as any[],
    approveReview: (eventId: string, uid: string) =>
      request(app).post(`/api/settlements/event/${eventId}/approve-settlement`).set(auth(uid)).send({}),
    payLeg: (id: string, uid: string) =>
      request(app).post(`/api/settlements/${id}/pay`).set(auth(uid)).send({ referenceId: 'UPI-123', note: 'paid' }),
    confirmLeg: (id: string, uid: string) => request(app).post(`/api/settlements/${id}/approve`).set(auth(uid)).send({}),
    event: async (eventId: string, uid: string) => (await request(app).get(`/api/events/${eventId}`).set(auth(uid))).body.data,
  };
  return api;
}
