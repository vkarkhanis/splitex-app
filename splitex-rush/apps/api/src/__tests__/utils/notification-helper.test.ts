const getDocMock = jest.fn();
const getEventMock = jest.fn();
const getParticipantsMock = jest.fn();
const sendBulkNotificationsMock = jest.fn();

jest.mock('../../config/firebase', () => ({
  db: {
    collection: jest.fn().mockImplementation((name: string) => {
      if (name !== 'users') throw new Error(`Unexpected collection: ${name}`);
      return {
        doc: (id: string) => ({
          get: () => getDocMock(id),
        }),
      };
    }),
  },
}));

jest.mock('../../services/event.service', () => ({
  EventService: jest.fn().mockImplementation(() => ({
    getEvent: (...args: any[]) => getEventMock(...args),
    getParticipants: (...args: any[]) => getParticipantsMock(...args),
  })),
}));

jest.mock('../../services/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendBulkNotifications: (...args: any[]) => sendBulkNotificationsMock(...args),
  })),
}));

import { getUserDisplayName, notifyEventParticipants } from '../../utils/notification-helper';

describe('notification-helper', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    getEventMock.mockReset();
    getParticipantsMock.mockReset();
    sendBulkNotificationsMock.mockReset();
  });

  it('getUserDisplayName prefers displayName then email then userId', async () => {
    getDocMock.mockResolvedValueOnce({ exists: true, data: () => ({ displayName: 'Alice', email: 'a@test.com' }) });
    await expect(getUserDisplayName('u1')).resolves.toBe('Alice');

    getDocMock.mockResolvedValueOnce({ exists: true, data: () => ({ email: 'b@test.com' }) });
    await expect(getUserDisplayName('u2')).resolves.toBe('b@test.com');

    getDocMock.mockResolvedValueOnce({ exists: false, data: () => null });
    await expect(getUserDisplayName('u3')).resolves.toBe('u3');
  });

  it('getUserDisplayName falls back to userId on lookup error', async () => {
    getDocMock.mockRejectedValueOnce(new Error('firestore down'));
    await expect(getUserDisplayName('u-error')).resolves.toBe('u-error');
  });

  it('notifyEventParticipants sends bulk notification when event exists', async () => {
    getEventMock.mockResolvedValueOnce({ id: 'e1', name: 'Trip' });
    getParticipantsMock.mockResolvedValueOnce([
      { userId: 'u1', email: 'u1@test.com' },
      { userId: 'u2', email: 'u2@test.com' },
    ]);
    getDocMock.mockResolvedValueOnce({ exists: true, data: () => ({ displayName: 'Actor' }) });

    await notifyEventParticipants('e1', 'actor-id', 'event_updated', { Name: 'Trip' });

    expect(sendBulkNotificationsMock).toHaveBeenCalledWith(
      [
        { userId: 'u1', email: 'u1@test.com' },
        { userId: 'u2', email: 'u2@test.com' },
      ],
      'actor-id',
      expect.objectContaining({ eventName: 'Trip', actorName: 'Actor', type: 'event_updated' }),
    );
  });

  it('notifyEventParticipants no-ops when event is missing', async () => {
    getEventMock.mockResolvedValueOnce(null);
    getParticipantsMock.mockResolvedValueOnce([{ userId: 'u1', email: 'u1@test.com' }]);
    getDocMock.mockResolvedValueOnce({ exists: false, data: () => null });

    await notifyEventParticipants('missing', 'actor-id', 'event_updated', { Name: 'X' });

    expect(sendBulkNotificationsMock).not.toHaveBeenCalled();
  });

  it('notifyEventParticipants handles downstream errors safely', async () => {
    getEventMock.mockRejectedValueOnce(new Error('event service failed'));

    await expect(
      notifyEventParticipants('e-err', 'actor-id', 'event_updated', { Name: 'X' }),
    ).resolves.toBeUndefined();
    expect(sendBulkNotificationsMock).not.toHaveBeenCalled();
  });
});
