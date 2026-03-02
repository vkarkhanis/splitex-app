import nodemailer from 'nodemailer';
import { db } from '../config/firebase';

export interface InvitationEmailData {
  inviteeEmail: string;
  inviterName: string;
  eventName: string;
  role: string;
  message?: string;
  token: string;
  expiresAt: string;
}

export interface NotificationEmailData {
  recipientEmail: string;
  eventName: string;
  eventId: string;
  actorName: string;
  type: 'expense_added' | 'expense_updated' | 'expense_deleted'
      | 'group_created' | 'group_updated' | 'group_deleted'
      | 'event_updated' | 'event_deleted' | 'settlement_generated';
  details: Record<string, string>;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private fromAddress: string;
  private appUrl: string;
  private mobileScheme: string;
  private isEtherealHost: boolean;

  constructor() {
    this.appUrl = process.env.APP_URL || 'http://localhost:3000';
    this.mobileScheme = process.env.MOBILE_APP_SCHEME || 'com.traxettle.app';
    this.fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@traxettle.app';
    // Support both SMTP_PASS and SMTP_PASSWORD env var names
    const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '';
    const smtpHost = process.env.SMTP_HOST || '';
    const smtpService = (process.env.SMTP_SERVICE || process.env.SMTP_PROVIDER || '').trim().toLowerCase();
    const isGmailService = smtpService === 'gmail' || smtpService === 'google';
    this.isEtherealHost = smtpHost.includes('ethereal.email');

    if (isGmailService) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: smtpPass,
        },
      });
      console.log('📧 EmailService connected to Gmail SMTP service');
    } else if (smtpHost) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: smtpPass,
        },
      });
      console.log(`📧 EmailService connected to SMTP: ${smtpHost}${this.isEtherealHost ? ' (Ethereal dev mode — view emails at https://ethereal.email)' : ''}`);
    } else {
      // No SMTP configured — log emails to console only
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      console.log('📧 EmailService running in MOCK mode (no SMTP_HOST/SMTP_SERVICE configured). Emails will be logged to console.');
    }
  }

  async sendInvitationEmail(data: InvitationEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const acceptUrl = `${this.appUrl}/invitations/accept?token=${data.token}`;

    const subject = `You're invited to "${data.eventName}" on Traxettle`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #3b82f6; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Traxettle</h1>
          <p style="margin: 4px 0 0; opacity: 0.9;">Expense Splitting Made Simple</p>
        </div>
        <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="margin: 0 0 16px; color: #1f2937;">You've been invited!</h2>
          <p style="color: #475569; line-height: 1.6;">
            <strong>${data.inviterName}</strong> has invited you to join
            <strong>"${data.eventName}"</strong> as a <strong>${data.role}</strong>.
          </p>
          ${data.message ? `<div style="background: white; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;"><p style="margin: 0; color: #475569; font-style: italic;">"${data.message}"</p></div>` : ''}
          <div style="text-align: center; margin: 24px 0;">
            <a href="${acceptUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              View Invitation
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 13px; text-align: center;">
            This invitation expires on ${new Date(data.expiresAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">
            If you didn't expect this invitation, you can safely ignore this email.<br/>
            <a href="${this.appUrl}" style="color: #3b82f6;">traxettle.app</a>
          </p>
        </div>
      </div>
    `;

    const text = `You're invited to "${data.eventName}" on Traxettle!\n\n${data.inviterName} has invited you to join "${data.eventName}" as a ${data.role}.\n\n${data.message ? `Message: "${data.message}"\n\n` : ''}Accept your invitation: ${acceptUrl}\n\nThis invitation expires on ${new Date(data.expiresAt).toLocaleDateString()}.\n\nIf you didn't expect this invitation, you can safely ignore this email.`;

    try {
      const info = await this.transporter.sendMail({
        from: `"Traxettle" <${this.fromAddress}>`,
        to: data.inviteeEmail,
        subject,
        text,
        html,
      });

      if (this.isEtherealHost) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`📧 [ETHEREAL] To: ${data.inviteeEmail} | Subject: ${subject}`);
        console.log(`📧 [ETHEREAL] Accept URL: ${acceptUrl}`);
        if (previewUrl) {
          console.log(`📧 [ETHEREAL] Preview email: ${previewUrl}`);
        }
        return { success: true, messageId: info.messageId || `ethereal-${Date.now()}` };
      }

      // Mock mode (jsonTransport) — log to console
      if (!process.env.SMTP_HOST) {
        console.log(`📧 [MOCK] To: ${data.inviteeEmail} | Subject: ${subject}`);
        console.log(`📧 [MOCK] Accept URL: ${acceptUrl}`);
        return { success: true, messageId: `mock-${Date.now()}` };
      }

      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      console.error('📧 Email send failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async sendAuthLinkEmail(
    recipientEmail: string,
    link: string,
    type: 'sign-in' | 'reset-password'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const subject =
      type === 'sign-in'
        ? 'Your Traxettle sign-in link'
        : 'Your Traxettle password reset link';
    const buttonText = type === 'sign-in' ? 'Sign In to Traxettle' : 'Reset Password';
    const intro =
      type === 'sign-in'
        ? 'Use the secure link below to sign in to your Traxettle account.'
        : 'Use the secure link below to reset your Traxettle password.';

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #3b82f6; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Traxettle</h1>
          <p style="margin: 4px 0 0; opacity: 0.9;">Expense Splitting Made Simple</p>
        </div>
        <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #475569; line-height: 1.6;">${intro}</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${link}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              ${buttonText}
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">
            If the button does not work, copy this link into your browser:<br />
            ${link}
          </p>
        </div>
      </div>
    `;

    const text = `${intro}\n\n${buttonText}: ${link}`;

    try {
      const info = await this.transporter.sendMail({
        from: `"Traxettle" <${this.fromAddress}>`,
        to: recipientEmail,
        subject,
        text,
        html,
      });

      if (this.isEtherealHost) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`📧 [ETHEREAL] Auth email to: ${recipientEmail} | ${type}`);
        if (previewUrl) console.log(`📧 [ETHEREAL] Preview: ${previewUrl}`);
        return { success: true, messageId: info.messageId || `ethereal-${Date.now()}` };
      }

      if (!process.env.SMTP_HOST) {
        console.log(`📧 [MOCK] Auth email to: ${recipientEmail} | ${type}`);
        console.log(`📧 [MOCK] Link: ${link}`);
        return { success: true, messageId: `mock-${Date.now()}` };
      }

      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      console.error(`📧 Auth email failed (${type}):`, err.message);
      return { success: false, error: err.message };
    }
  }

  private getNotificationSubject(data: NotificationEmailData): string {
    const labels: Record<string, string> = {
      expense_added: `New expense added in "${data.eventName}"`,
      expense_updated: `Expense updated in "${data.eventName}"`,
      expense_deleted: `Expense removed from "${data.eventName}"`,
      group_created: `New group created in "${data.eventName}"`,
      group_updated: `Group updated in "${data.eventName}"`,
      group_deleted: `Group removed from "${data.eventName}"`,
      event_updated: `"${data.eventName}" has been updated`,
      event_deleted: `"${data.eventName}" has been deleted`,
      settlement_generated: `Settlement generated for "${data.eventName}"`,
    };
    return labels[data.type] || `Update in "${data.eventName}"`;
  }

  private getNotificationBody(data: NotificationEmailData): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(data.details)) {
      lines.push(`<strong>${key}:</strong> ${value}`);
    }
    return lines.join('<br/>');
  }

  async sendNotificationEmail(data: NotificationEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const eventUrl = `${this.appUrl}/events/${data.eventId}`;
    const mobileDeepLink = `${this.mobileScheme}://events/${data.eventId}`;
    const subject = this.getNotificationSubject(data);
    const detailsHtml = this.getNotificationBody(data);

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #3b82f6; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Traxettle</h1>
          <p style="margin: 4px 0 0; opacity: 0.9;">Expense Splitting Made Simple</p>
        </div>
        <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="margin: 0 0 16px; color: #1f2937;">${subject}</h2>
          <p style="color: #475569; line-height: 1.6;">
            <strong>${data.actorName}</strong> made a change in <strong>"${data.eventName}"</strong>.
          </p>
          <div style="background: white; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
            ${detailsHtml}
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${mobileDeepLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Open in App
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 13px; text-align: center; margin-bottom: 16px;">
            Don't have the app? <a href="${eventUrl}" style="color: #3b82f6;">View on web</a>
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">
            You received this because you are a participant in "${data.eventName}".<br/>
            <a href="${this.appUrl}" style="color: #3b82f6;">traxettle.app</a>
          </p>
        </div>
      </div>
    `;

    const text = `${subject}\n\n${data.actorName} made a change in "${data.eventName}".\n\n${Object.entries(data.details).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nView event: ${eventUrl}`;

    try {
      const info = await this.transporter.sendMail({
        from: `"Traxettle" <${this.fromAddress}>`,
        to: data.recipientEmail,
        subject,
        text,
        html,
      });

      if (this.isEtherealHost) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`📧 [ETHEREAL] Notification to: ${data.recipientEmail} | ${data.type}`);
        if (previewUrl) console.log(`📧 [ETHEREAL] Preview: ${previewUrl}`);
        return { success: true, messageId: info.messageId || `ethereal-${Date.now()}` };
      }

      if (!process.env.SMTP_HOST) {
        console.log(`📧 [MOCK] Notification to: ${data.recipientEmail} | ${data.type}`);
        return { success: true, messageId: `mock-${Date.now()}` };
      }

      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      console.error(`📧 Notification email failed (${data.type}):`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send notification emails to multiple recipients (fire-and-forget).
   * Excludes the actor and recipients who have notifications disabled.
   */
  async sendBulkNotifications(
    recipients: { userId: string; email?: string }[],
    actorUserId: string,
    baseData: Omit<NotificationEmailData, 'recipientEmail'>
  ): Promise<void> {
    const candidates = recipients.filter(r => r.userId !== actorUserId && r.email);
    if (candidates.length === 0) return;

    // Look up each recipient's notification preference and filter out opted-out users
    const prefsResults = await Promise.allSettled(
      candidates.map(async r => {
        try {
          const snap = await db.collection('users').doc(r.userId).get();
          const prefs = snap.exists ? snap.data()?.preferences : undefined;
          // Default to true (send) if preference is not explicitly set to false
          const wantsNotifications = prefs?.notifications !== false;
          return { ...r, wantsNotifications };
        } catch {
          // If we can't look up preferences, default to sending
          return { ...r, wantsNotifications: true };
        }
      })
    );

    const targets = prefsResults
      .filter((r): r is PromiseFulfilledResult<{ userId: string; email?: string; wantsNotifications: boolean }> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(r => r.wantsNotifications);

    if (targets.length === 0) return;

    // Fire-and-forget — don't block the API response
    Promise.allSettled(
      targets.map(r =>
        this.sendNotificationEmail({ ...baseData, recipientEmail: r.email! })
      )
    ).then(results => {
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
      if (failed.length > 0) {
        console.warn(`📧 ${failed.length}/${targets.length} notification emails failed for event ${baseData.eventId}`);
      }
    });
  }
}
