import { buildUnsettledPaymentsCsv } from '../../utils/unsettled-export';

describe('unsettled-export', () => {
  it('buildUnsettledPaymentsCsv groups by event and includes required columns', () => {
    const csv = buildUnsettledPaymentsCsv([
      {
        eventId: 'e1',
        eventName: 'Goa Trip',
        lastSettlementGeneratedAt: '2026-03-08T10:00:00.000Z',
        pending: [
          { settlementId: 's1', payerUserId: 'u2', payerName: 'Bob', amount: 100, currency: 'INR' },
        ],
      },
      {
        eventId: 'e2',
        eventName: 'Roommates',
        lastSettlementGeneratedAt: null,
        pending: [
          { settlementId: 's2', payerUserId: 'u3', payerName: 'Alice', amount: 50.5, currency: 'USD' },
        ],
      },
    ]);

    expect(csv).toContain('Event: Goa Trip');
    expect(csv).toContain('Date,Payer Name,Amount,Currency');
    expect(csv).toContain('2026-03-08,Bob,100.00,INR');
    expect(csv).toContain('Event: Roommates');
    expect(csv).toContain(',Alice,50.50,USD');
  });
});

