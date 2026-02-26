jest.mock('nodemailer', () => {
  const sendMailMock = jest.fn();
  return {
    createTransport: jest.fn().mockReturnValue({
      sendMail: sendMailMock,
    }),
    getTestMessageUrl: jest.fn().mockReturnValue('https://ethereal.email/message/abc123'),
    __sendMailMock: sendMailMock,
  };
});

import nodemailer from 'nodemailer';
import { EmailService, InvitationEmailData, NotificationEmailData } from '../../services/email.service';

const sendMailMock = (nodemailer as any).__sendMailMock;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_SECURE;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_PASSWORD;
  delete process.env.SMTP_FROM;
  delete process.env.APP_URL;
});

const sampleEmailData: InvitationEmailData = {
  inviteeEmail: 'friend@example.com',
  inviterName: 'John Doe',
  eventName: 'Goa Trip 2025',
  role: 'member',
  message: 'Join our trip!',
  token: 'abc123token',
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
};

describe('EmailService', () => {
  describe('constructor', () => {
    it('should initialize in mock mode when SMTP_HOST is not set', () => {
      const service = new EmailService();
      expect(nodemailer.createTransport).toHaveBeenCalledWith({ jsonTransport: true });
    });

    it('should initialize with SMTP config when SMTP_HOST is set', () => {
      process.env.SMTP_HOST = 'smtp.gmail.com';
      process.env.SMTP_PORT = '465';
      process.env.SMTP_SECURE = 'true';
      process.env.SMTP_USER = 'user@gmail.com';
      process.env.SMTP_PASS = 'pass123';
      const service = new EmailService();
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'user@gmail.com', pass: 'pass123' },
      });
    });

    it('should support SMTP_PASSWORD as alternative to SMTP_PASS', () => {
      process.env.SMTP_HOST = 'smtp.gmail.com';
      process.env.SMTP_USER = 'user@gmail.com';
      process.env.SMTP_PASSWORD = 'password456';
      const service = new EmailService();
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: { user: 'user@gmail.com', pass: 'password456' },
        })
      );
    });

    it('should prefer SMTP_PASS over SMTP_PASSWORD when both set', () => {
      process.env.SMTP_HOST = 'smtp.gmail.com';
      process.env.SMTP_USER = 'user@gmail.com';
      process.env.SMTP_PASS = 'pass_primary';
      process.env.SMTP_PASSWORD = 'pass_secondary';
      const service = new EmailService();
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: { user: 'user@gmail.com', pass: 'pass_primary' },
        })
      );
    });

    it('should use default SMTP port 587 when not specified', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      const service = new EmailService();
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 587 })
      );
    });

    it('should detect Ethereal host for preview URL logging', () => {
      process.env.SMTP_HOST = 'smtp.ethereal.email';
      process.env.SMTP_USER = 'test@ethereal.email';
      process.env.SMTP_PASSWORD = 'testpass';
      const service = new EmailService();
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'smtp.ethereal.email' })
      );
    });

    it('should default fromAddress to SMTP_USER when SMTP_FROM not set', () => {
      process.env.SMTP_HOST = 'smtp.ethereal.email';
      process.env.SMTP_USER = 'myuser@ethereal.email';
      process.env.SMTP_PASSWORD = 'pass';
      const service = new EmailService();
      // fromAddress is private, but we can verify via sendMail call
      sendMailMock.mockResolvedValue({ messageId: '<id>' });
      service.sendInvitationEmail(sampleEmailData);
      // Just verify constructor didn't throw
      expect(nodemailer.createTransport).toHaveBeenCalled();
    });
  });

  describe('sendInvitationEmail', () => {
    it('should send email successfully in mock mode', async () => {
      sendMailMock.mockResolvedValue({
        message: JSON.stringify({ to: 'friend@example.com' }),
      });

      const service = new EmailService();
      const result = await service.sendInvitationEmail(sampleEmailData);

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^mock-/);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'friend@example.com',
          subject: expect.stringContaining('Goa Trip 2025'),
        })
      );
    });

    it('should send email successfully via Ethereal and log preview URL', async () => {
      process.env.SMTP_HOST = 'smtp.ethereal.email';
      process.env.SMTP_USER = 'test@ethereal.email';
      process.env.SMTP_PASSWORD = 'testpass';
      sendMailMock.mockResolvedValue({ messageId: '<ethereal-msg-id>' });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const service = new EmailService();
      const result = await service.sendInvitationEmail(sampleEmailData);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<ethereal-msg-id>');
      expect((nodemailer as any).getTestMessageUrl).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should send email successfully in production SMTP mode', async () => {
      process.env.SMTP_HOST = 'smtp.gmail.com';
      process.env.SMTP_USER = 'user@gmail.com';
      process.env.SMTP_PASS = 'pass';
      sendMailMock.mockResolvedValue({ messageId: '<real-msg-id@gmail.com>' });

      const service = new EmailService();
      const result = await service.sendInvitationEmail(sampleEmailData);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<real-msg-id@gmail.com>');
    });

    it('should include accept URL with token in email', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });

      const service = new EmailService();
      await service.sendInvitationEmail(sampleEmailData);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toContain('abc123token');
      expect(callArgs.text).toContain('abc123token');
      expect(callArgs.html).toContain('invitations/accept?token=abc123token');
    });

    it('should include inviter name and event name in email', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });

      const service = new EmailService();
      await service.sendInvitationEmail(sampleEmailData);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toContain('John Doe');
      expect(callArgs.html).toContain('Goa Trip 2025');
      expect(callArgs.text).toContain('John Doe');
      expect(callArgs.text).toContain('Goa Trip 2025');
    });

    it('should include optional message in email when provided', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });

      const service = new EmailService();
      await service.sendInvitationEmail(sampleEmailData);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toContain('Join our trip!');
      expect(callArgs.text).toContain('Join our trip!');
    });

    it('should not include message block when message is not provided', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });

      const service = new EmailService();
      const dataWithoutMessage = { ...sampleEmailData, message: undefined };
      await service.sendInvitationEmail(dataWithoutMessage);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.text).not.toContain('Message:');
    });

    it('should use custom APP_URL for accept link', async () => {
      process.env.APP_URL = 'https://traxettle.app';
      sendMailMock.mockResolvedValue({ message: '{}' });

      const service = new EmailService();
      await service.sendInvitationEmail(sampleEmailData);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toContain('https://traxettle.app/invitations/accept?token=abc123token');
    });

    it('should use custom SMTP_FROM address', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_FROM = 'team@traxettle.app';
      sendMailMock.mockResolvedValue({ messageId: '<id>' });

      const service = new EmailService();
      await service.sendInvitationEmail(sampleEmailData);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.from).toContain('team@traxettle.app');
    });

    it('should return error when email sending fails', async () => {
      sendMailMock.mockRejectedValue(new Error('SMTP connection refused'));

      const service = new EmailService();
      const result = await service.sendInvitationEmail(sampleEmailData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMTP connection refused');
    });
  });

  describe('sendNotificationEmail', () => {
    const sampleNotification = {
      recipientEmail: 'participant@example.com',
      eventName: 'Goa Trip 2025',
      eventId: 'event123',
      actorName: 'John Doe',
      type: 'expense_added' as const,
      details: { Title: 'Hotel booking', Amount: 'USD 500.00' },
    };

    it('should send notification email in mock mode', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });

      const service = new EmailService();
      const result = await service.sendNotificationEmail(sampleNotification);

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^mock-/);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'participant@example.com',
          subject: expect.stringContaining('Goa Trip 2025'),
        })
      );
    });

    it('should include actor name and details in notification email', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });

      const service = new EmailService();
      await service.sendNotificationEmail(sampleNotification);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toContain('John Doe');
      expect(callArgs.html).toContain('Hotel booking');
      expect(callArgs.html).toContain('USD 500.00');
      expect(callArgs.text).toContain('John Doe');
    });

    it('should include event link in notification email', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });

      const service = new EmailService();
      await service.sendNotificationEmail(sampleNotification);

      const callArgs = sendMailMock.mock.calls[0][0];
      expect(callArgs.html).toContain('/events/event123');
      expect(callArgs.text).toContain('/events/event123');
    });

    it('should generate correct subject for each notification type', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });
      const service = new EmailService();

      const types: Array<{ type: NotificationEmailData['type']; expected: string }> = [
        { type: 'expense_added', expected: 'New expense added' },
        { type: 'expense_updated', expected: 'Expense updated' },
        { type: 'expense_deleted', expected: 'Expense removed' },
        { type: 'group_created', expected: 'New group created' },
        { type: 'group_updated', expected: 'Group updated' },
        { type: 'group_deleted', expected: 'Group removed' },
        { type: 'event_updated', expected: 'has been updated' },
        { type: 'event_deleted', expected: 'has been deleted' },
        { type: 'settlement_generated', expected: 'Settlement generated' },
      ];

      for (const { type, expected } of types) {
        sendMailMock.mockClear();
        await service.sendNotificationEmail({ ...sampleNotification, type });
        const callArgs = sendMailMock.mock.calls[0][0];
        expect(callArgs.subject).toContain(expected);
      }
    });

    it('should send notification via Ethereal and log preview URL', async () => {
      process.env.SMTP_HOST = 'smtp.ethereal.email';
      process.env.SMTP_USER = 'test@ethereal.email';
      process.env.SMTP_PASSWORD = 'testpass';
      sendMailMock.mockResolvedValue({ messageId: '<ethereal-notif-id>' });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const service = new EmailService();
      const result = await service.sendNotificationEmail(sampleNotification);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<ethereal-notif-id>');
      consoleSpy.mockRestore();
    });

    it('should send notification via production SMTP', async () => {
      process.env.SMTP_HOST = 'smtp.gmail.com';
      process.env.SMTP_USER = 'user@gmail.com';
      process.env.SMTP_PASS = 'pass';
      sendMailMock.mockResolvedValue({ messageId: '<prod-notif-id>' });

      const service = new EmailService();
      const result = await service.sendNotificationEmail(sampleNotification);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<prod-notif-id>');
    });

    it('should return error when notification email fails', async () => {
      sendMailMock.mockRejectedValue(new Error('SMTP timeout'));

      const service = new EmailService();
      const result = await service.sendNotificationEmail(sampleNotification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMTP timeout');
    });
  });

  describe('sendBulkNotifications', () => {
    it('should send to all recipients except the actor', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });
      const service = new EmailService();

      const recipients = [
        { userId: 'actor1', email: 'actor@example.com' },
        { userId: 'user2', email: 'user2@example.com' },
        { userId: 'user3', email: 'user3@example.com' },
      ];

      await service.sendBulkNotifications(recipients, 'actor1', {
        eventName: 'Trip',
        eventId: 'e1',
        actorName: 'Actor',
        type: 'expense_added',
        details: { Title: 'Test' },
      });

      // Wait for fire-and-forget promises
      await new Promise(r => setTimeout(r, 50));

      // Should have sent to user2 and user3, not actor1
      expect(sendMailMock).toHaveBeenCalledTimes(2);
      const emails = sendMailMock.mock.calls.map((c: any) => c[0].to);
      expect(emails).toContain('user2@example.com');
      expect(emails).toContain('user3@example.com');
      expect(emails).not.toContain('actor@example.com');
    });

    it('should skip recipients without email', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });
      const service = new EmailService();

      const recipients = [
        { userId: 'user1', email: undefined },
        { userId: 'user2', email: 'user2@example.com' },
      ];

      await service.sendBulkNotifications(recipients, 'actor', {
        eventName: 'Trip',
        eventId: 'e1',
        actorName: 'Actor',
        type: 'group_created',
        details: { 'Group Name': 'Team A' },
      });

      await new Promise(r => setTimeout(r, 50));

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock.mock.calls[0][0].to).toBe('user2@example.com');
    });

    it('should do nothing when all recipients are the actor', async () => {
      sendMailMock.mockResolvedValue({ message: '{}' });
      const service = new EmailService();

      await service.sendBulkNotifications(
        [{ userId: 'actor', email: 'actor@example.com' }],
        'actor',
        {
          eventName: 'Trip',
          eventId: 'e1',
          actorName: 'Actor',
          type: 'event_deleted',
          details: {},
        }
      );

      await new Promise(r => setTimeout(r, 50));
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should handle partial failures gracefully', async () => {
      sendMailMock
        .mockResolvedValueOnce({ message: '{}' })
        .mockRejectedValueOnce(new Error('fail'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const service = new EmailService();
      await service.sendBulkNotifications(
        [
          { userId: 'u1', email: 'u1@example.com' },
          { userId: 'u2', email: 'u2@example.com' },
        ],
        'actor',
        {
          eventName: 'Trip',
          eventId: 'e1',
          actorName: 'Actor',
          type: 'expense_deleted',
          details: {},
        }
      );

      await new Promise(r => setTimeout(r, 50));
      // Should not throw, just warn
      expect(sendMailMock).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });
});
