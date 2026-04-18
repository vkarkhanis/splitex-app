import { BillingEventsService } from '../../services/billing/billing-events.service';

const eventStore: Record<string, any> = {};

jest.mock('../../config/firebase', () => ({
  db: {
    collection: jest.fn().mockImplementation((name: string) => {
      if (name !== 'billingWebhookEvents') throw new Error(`Unexpected collection ${name}`);
      return {
        doc: (id: string) => ({
          get: jest.fn().mockResolvedValue({ exists: Boolean(eventStore[id]), data: () => eventStore[id] }),
          set: jest.fn().mockImplementation(async (data: any, options?: any) => {
            if (options?.merge) {
              eventStore[id] = { ...(eventStore[id] || {}), ...data };
            } else {
              eventStore[id] = data;
            }
          }),
        }),
      };
    }),
  },
}));

describe('BillingEventsService', () => {
  let service: BillingEventsService;

  beforeEach(() => {
    Object.keys(eventStore).forEach((k) => delete eventStore[k]);
    service = new BillingEventsService();
  });

  it('returns false for empty event id', async () => {
    await expect(service.hasProcessed('')).resolves.toBe(false);
  });

  it('marks and reads processed event idempotently', async () => {
    const eventId = 'evt-1';
    await expect(service.hasProcessed(eventId)).resolves.toBe(false);

    await service.markProcessed(eventId, { foo: 'bar' });
    await expect(service.hasProcessed(eventId)).resolves.toBe(true);
    expect(eventStore[eventId].eventId).toBe(eventId);
    expect(eventStore[eventId].payload).toEqual({ foo: 'bar' });
  });

  it('no-ops markProcessed when event id is empty', async () => {
    await service.markProcessed('', { foo: 'bar' });
    expect(Object.keys(eventStore)).toHaveLength(0);
  });
});
