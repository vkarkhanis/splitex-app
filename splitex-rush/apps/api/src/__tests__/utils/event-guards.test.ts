const mockGetEvent = jest.fn();

jest.mock('../../config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: { collection: jest.fn() },
}));

jest.mock('../../services/event.service', () => ({
  EventService: jest.fn().mockImplementation(() => ({
    getEvent: mockGetEvent,
  })),
}));

import { getEventLockStatus, requireActiveEvent } from '../../utils/event-guards';

describe('Event Guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEventLockStatus', () => {
    it('should return null for active events', async () => {
      mockGetEvent.mockResolvedValue({ id: 'e1', status: 'active' });
      const result = await getEventLockStatus('e1');
      expect(result).toBeNull();
    });

    it('should return "payment" for payment events', async () => {
      mockGetEvent.mockResolvedValue({ id: 'e1', status: 'payment' });
      const result = await getEventLockStatus('e1');
      expect(result).toBe('payment');
    });

    it('should return "settled" for settled events', async () => {
      mockGetEvent.mockResolvedValue({ id: 'e1', status: 'settled' });
      const result = await getEventLockStatus('e1');
      expect(result).toBe('settled');
    });

    it('should return "closed" for closed events', async () => {
      mockGetEvent.mockResolvedValue({ id: 'e1', status: 'closed' });
      const result = await getEventLockStatus('e1');
      expect(result).toBe('closed');
    });

    it('should return null if event does not exist', async () => {
      mockGetEvent.mockResolvedValue(null);
      const result = await getEventLockStatus('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('requireActiveEvent', () => {
    it('should not throw for active events', async () => {
      mockGetEvent.mockResolvedValue({ id: 'e1', status: 'active' });
      await expect(requireActiveEvent('e1')).resolves.not.toThrow();
    });

    it('should throw for payment events', async () => {
      mockGetEvent.mockResolvedValue({ id: 'e1', status: 'payment' });
      await expect(requireActiveEvent('e1')).rejects.toThrow('Payments are in progress');
    });

    it('should throw for settled events', async () => {
      mockGetEvent.mockResolvedValue({ id: 'e1', status: 'settled' });
      await expect(requireActiveEvent('e1')).rejects.toThrow('The event is settled');
    });

    it('should throw for closed events', async () => {
      mockGetEvent.mockResolvedValue({ id: 'e1', status: 'closed' });
      await expect(requireActiveEvent('e1')).rejects.toThrow('The event is closed');
    });

    it('should not throw if event does not exist (guard passes through)', async () => {
      mockGetEvent.mockResolvedValue(null);
      await expect(requireActiveEvent('nonexistent')).resolves.not.toThrow();
    });
  });
});
