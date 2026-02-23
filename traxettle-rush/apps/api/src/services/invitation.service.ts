import { Invitation, CreateInvitationDto } from '@traxettle/shared';
import { db } from '../config/firebase';
import crypto from 'crypto';
import { EmailService, InvitationEmailData } from './email.service';

export class InvitationService {
  private collection = 'invitations';
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async createInvitation(userId: string, dto: CreateInvitationDto, inviterName?: string, eventName?: string): Promise<Invitation> {
    if (!dto.inviteeEmail && !dto.inviteePhone && !dto.inviteeUserId) {
      throw new Error('At least one of inviteeEmail, inviteePhone, or inviteeUserId is required');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const token = this.generateToken();

    const invitationData: Record<string, any> = {
      eventId: dto.eventId,
      invitedBy: userId,
      inviteeEmail: dto.inviteeEmail || null,
      inviteePhone: dto.inviteePhone || null,
      inviteeUserId: dto.inviteeUserId || null,
      groupId: dto.groupId || null,
      role: dto.role || 'member',
      status: 'pending' as const,
      token,
      message: dto.message || null,
      emailSent: false,
      emailError: null,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      respondedAt: null,
    };

    const docRef = await db.collection(this.collection).add(invitationData);

    // Send invitation email if inviteeEmail is provided
    if (dto.inviteeEmail) {
      const emailData: InvitationEmailData = {
        inviteeEmail: dto.inviteeEmail,
        inviterName: inviterName || 'A Traxettle user',
        eventName: eventName || 'an event',
        role: dto.role || 'member',
        message: dto.message,
        token,
        expiresAt: expiresAt.toISOString(),
      };

      const emailResult = await this.emailService.sendInvitationEmail(emailData);
      invitationData.emailSent = emailResult.success;
      invitationData.emailError = emailResult.error || null;

      // Update the doc with email status
      await db.collection(this.collection).doc(docRef.id).set(
        { emailSent: emailResult.success, emailError: emailResult.error || null },
        { merge: true }
      );
    }

    return {
      id: docRef.id,
      ...invitationData,
      createdAt: now,
      expiresAt,
    } as unknown as Invitation;
  }

  async getInvitation(invitationId: string): Promise<Invitation | null> {
    const doc = await db.collection(this.collection).doc(invitationId).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
      id: doc.id,
      eventId: data.eventId,
      invitedBy: data.invitedBy,
      inviteeEmail: data.inviteeEmail || undefined,
      inviteePhone: data.inviteePhone || undefined,
      inviteeUserId: data.inviteeUserId || undefined,
      groupId: data.groupId || undefined,
      role: data.role,
      status: data.status,
      token: data.token,
      message: data.message || undefined,
      emailSent: data.emailSent ?? undefined,
      emailError: data.emailError || undefined,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      respondedAt: data.respondedAt || undefined,
    } as unknown as Invitation;
  }

  async getInvitationByToken(token: string): Promise<Invitation | null> {
    const snap = await db.collection(this.collection)
      .where('token', '==', token)
      .limit(1)
      .get();

    if (snap.empty) return null;

    const doc = snap.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      eventId: data.eventId,
      invitedBy: data.invitedBy,
      inviteeEmail: data.inviteeEmail || undefined,
      inviteePhone: data.inviteePhone || undefined,
      inviteeUserId: data.inviteeUserId || undefined,
      groupId: data.groupId || undefined,
      role: data.role,
      status: data.status,
      token: data.token,
      message: data.message || undefined,
      emailSent: data.emailSent ?? undefined,
      emailError: data.emailError || undefined,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      respondedAt: data.respondedAt || undefined,
    } as unknown as Invitation;
  }

  async getEventInvitations(eventId: string): Promise<Invitation[]> {
    const snap = await db.collection(this.collection)
      .where('eventId', '==', eventId)
      .get();

    if (snap.empty) return [];

    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        eventId: data.eventId,
        invitedBy: data.invitedBy,
        inviteeEmail: data.inviteeEmail || undefined,
        inviteePhone: data.inviteePhone || undefined,
        inviteeUserId: data.inviteeUserId || undefined,
        groupId: data.groupId || undefined,
        role: data.role,
        status: data.status,
        token: data.token,
        message: data.message || undefined,
        emailSent: data.emailSent ?? undefined,
        emailError: data.emailError || undefined,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        respondedAt: data.respondedAt || undefined,
      } as unknown as Invitation;
    });
  }

  async getUserInvitations(userId: string, email?: string): Promise<Invitation[]> {
    const invitations: Invitation[] = [];

    // Get invitations by userId
    const userSnap = await db.collection(this.collection)
      .where('inviteeUserId', '==', userId)
      .get();

    if (!userSnap.empty) {
      for (const doc of userSnap.docs) {
        const data = doc.data();
        invitations.push({
          id: doc.id,
          eventId: data.eventId,
          invitedBy: data.invitedBy,
          inviteeEmail: data.inviteeEmail || undefined,
          inviteePhone: data.inviteePhone || undefined,
          inviteeUserId: data.inviteeUserId || undefined,
          groupId: data.groupId || undefined,
          role: data.role,
          status: data.status,
          token: data.token,
          message: data.message || undefined,
          emailSent: data.emailSent ?? undefined,
          emailError: data.emailError || undefined,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          respondedAt: data.respondedAt || undefined,
        } as unknown as Invitation);
      }
    }

    // Also get invitations by email
    if (email) {
      const emailSnap = await db.collection(this.collection)
        .where('inviteeEmail', '==', email)
        .get();

      if (!emailSnap.empty) {
        for (const doc of emailSnap.docs) {
          if (!invitations.find(i => i.id === doc.id)) {
            const data = doc.data();
            invitations.push({
              id: doc.id,
              eventId: data.eventId,
              invitedBy: data.invitedBy,
              inviteeEmail: data.inviteeEmail || undefined,
              inviteePhone: data.inviteePhone || undefined,
              inviteeUserId: data.inviteeUserId || undefined,
              groupId: data.groupId || undefined,
              role: data.role,
              status: data.status,
              token: data.token,
              message: data.message || undefined,
              emailSent: data.emailSent ?? undefined,
              emailError: data.emailError || undefined,
              createdAt: data.createdAt,
              expiresAt: data.expiresAt,
              respondedAt: data.respondedAt || undefined,
            } as unknown as Invitation);
          }
        }
      }
    }

    return invitations;
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<Invitation | null> {
    const invitation = await this.getInvitation(invitationId);
    if (!invitation) return null;

    if (invitation.status !== 'pending') {
      throw new Error(`Invitation has already been ${invitation.status}`);
    }

    // Check expiry
    const expiresAt = new Date(invitation.expiresAt);
    if (expiresAt < new Date()) {
      await db.collection(this.collection).doc(invitationId).set(
        { status: 'expired' },
        { merge: true }
      );
      throw new Error('Invitation has expired');
    }

    const now = new Date().toISOString();
    await db.collection(this.collection).doc(invitationId).set(
      { status: 'accepted', respondedAt: now, inviteeUserId: userId },
      { merge: true }
    );

    return this.getInvitation(invitationId);
  }

  async declineInvitation(invitationId: string, userId: string): Promise<Invitation | null> {
    const invitation = await this.getInvitation(invitationId);
    if (!invitation) return null;

    if (invitation.status !== 'pending') {
      throw new Error(`Invitation has already been ${invitation.status}`);
    }

    const now = new Date().toISOString();
    await db.collection(this.collection).doc(invitationId).set(
      { status: 'declined', respondedAt: now, inviteeUserId: userId },
      { merge: true }
    );

    return this.getInvitation(invitationId);
  }

  async revokeInvitation(invitationId: string, userId: string): Promise<boolean> {
    const invitation = await this.getInvitation(invitationId);
    if (!invitation) return false;

    if (invitation.invitedBy !== userId) {
      throw new Error('Forbidden: Only the inviter can revoke this invitation');
    }

    if (invitation.status !== 'pending') {
      throw new Error(`Cannot revoke an invitation that has been ${invitation.status}`);
    }

    await db.collection(this.collection).doc(invitationId).delete();
    return true;
  }
}
