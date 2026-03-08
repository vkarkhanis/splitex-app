const getDocMock = jest.fn();
const getEventMock = jest.fn();
const getParticipantsMock = jest.fn();
const sendBulkNotificationsMock = jest.fn();
const sendNotificationEmailMock = jest.fn();
const invitationsGetMock = jest.fn();

jest.mock('../../config/firebase', () => ({
  db: {
    collection: jest.fn().mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          doc: (id: string) => ({
            get: () => getDocMock(id),
          }),
        };
      }
      if (name === 'invitations') {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: () => invitationsGetMock(),
            }),
          }),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
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
    sendNotificationEmail: (...args: any[]) => sendNotificationEmailMock(...args),
  })),
}));

import { getUserDisplayName, notifyEventParticipants } from '../../utils/notification-helper';

describe('notification-helper', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    getEventMock.mockReset();
    getParticipantsMock.mockReset();
    sendBulkNotificationsMock.mockReset();
    sendNotificationEmailMock.mockReset();
    invitationsGetMock.mockReset();
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
    // actor display name, then actor email lookup
    getDocMock
      .mockResolvedValueOnce({ exists: true, data: () => ({ displayName: 'Actor' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ email: 'actor@test.com' }) });
    invitationsGetMock.mockResolvedValueOnce({ empty: true, docs: [] });

    await notifyEventParticipants('e1', 'actor-id', 'event_updated', { Name: 'Trip' });

    expect(sendBulkNotificationsMock).toHaveBeenCalledWith(
      [
        { userId: 'u1', email: 'u1@test.com' },
        { userId: 'u2', email: 'u2@test.com' },
      ],
      'actor-id',
      expect.objectContaining({ eventName: 'Trip', actorName: 'Actor', type: 'event_updated' }),
    );
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });

  it('notifyEventParticipants no-ops when event is missing', async () => {
    getEventMock.mockResolvedValueOnce(null);
    getParticipantsMock.mockResolvedValueOnce([{ userId: 'u1', email: 'u1@test.com' }]);
    getDocMock.mockResolvedValueOnce({ exists: false, data: () => null });

    await notifyEventParticipants('missing', 'actor-id', 'event_updated', { Name: 'X' });

    expect(sendBulkNotificationsMock).not.toHaveBeenCalled();
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });

  it('notifyEventParticipants handles downstream errors safely', async () => {
    getEventMock.mockRejectedValueOnce(new Error('event service failed'));

    await expect(
      notifyEventParticipants('e-err', 'actor-id', 'event_updated', { Name: 'X' }),
    ).resolves.toBeUndefined();
    expect(sendBulkNotificationsMock).not.toHaveBeenCalled();
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });

  it('notifyEventParticipants also emails pending invitees by email', async () => {
    getEventMock.mockResolvedValueOnce({ id: 'e1', name: 'Trip' });
    getParticipantsMock.mockResolvedValueOnce([{ userId: 'u1', email: 'u1@test.com' }]);
    getDocMock
      .mockResolvedValueOnce({ exists: true, data: () => ({ displayName: 'Actor' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ email: 'actor@test.com' }) });

    invitationsGetMock.mockResolvedValueOnce({
      empty: false,
      docs: [
        { data: () => ({ inviteeEmail: 'invitee@test.com', expiresAt: new Date(Date.now() + 60_000).toISOString() }) },
        { data: () => ({ inviteeEmail: 'u1@test.com', expiresAt: new Date(Date.now() + 60_000).toISOString() }) }, // dup of participant
        { data: () => ({ inviteeEmail: 'ACTOR@test.com', expiresAt: new Date(Date.now() + 60_000).toISOString() }) }, // actor
      ],
    });

    await notifyEventParticipants('e1', 'actor-id', 'event_updated', { Name: 'Trip' });

    expect(sendBulkNotificationsMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmailMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        recipientEmail: 'invitee@test.com',
        eventName: 'Trip',
        eventId: 'e1',
        actorName: 'Actor',
        type: 'event_updated',
      }),
    );
  });
});
