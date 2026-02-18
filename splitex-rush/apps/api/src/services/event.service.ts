import { Event, CreateEventDto, UpdateEventDto, EventParticipant, ApiResponse } from '@splitex/shared';
import { db } from '../config/firebase';

export class EventService {
  private collection = 'events';

  async createEvent(userId: string, dto: CreateEventDto): Promise<Event> {
    const now = new Date().toISOString();
    const eventData: Record<string, any> = {
      name: dto.name,
      description: dto.description || '',
      type: dto.type,
      startDate: dto.startDate,
      endDate: dto.endDate || null,
      currency: dto.currency,
      status: 'active' as const,
      createdBy: userId,
      admins: [userId],
      participantIds: [userId],
      createdAt: now,
      updatedAt: now,
    };

    // Multi-currency settlement fields
    if (dto.settlementCurrency) eventData.settlementCurrency = dto.settlementCurrency;
    if (dto.fxRateMode) eventData.fxRateMode = dto.fxRateMode;
    if (dto.predefinedFxRates) eventData.predefinedFxRates = dto.predefinedFxRates;

    const docRef = await db.collection(this.collection).add(eventData);
    const eventId = docRef.id;

    // Add creator as participant
    const participant: Record<string, any> = {
      userId,
      role: 'admin',
      joinedAt: now,
      invitedBy: userId,
      status: 'accepted',
    };

    await db.collection(this.collection).doc(eventId).collection('participants').doc(userId).set(participant);

    return {
      id: eventId,
      ...eventData,
      startDate: new Date(eventData.startDate),
      endDate: eventData.endDate ? new Date(eventData.endDate) : undefined,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    } as Event;
  }

  async getEvent(eventId: string): Promise<Event | null> {
    const doc = await db.collection(this.collection).doc(eventId).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
      id: doc.id,
      name: data.name,
      description: data.description,
      type: data.type,
      startDate: data.startDate,
      endDate: data.endDate || undefined,
      currency: data.currency,
      settlementCurrency: data.settlementCurrency || undefined,
      fxRateMode: data.fxRateMode || undefined,
      predefinedFxRates: data.predefinedFxRates || undefined,
      status: data.status,
      createdBy: data.createdBy,
      admins: data.admins || [],
      participantIds: data.participantIds || [],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as Event;
  }

  async getUserEvents(userId: string): Promise<Event[]> {
    // Get all events where user is a participant (participantIds array on event doc)
    const allEvents: Event[] = [];
    const seenIds = new Set<string>();

    // Primary query: participantIds includes this user
    const participantSnap = await db.collection(this.collection)
      .where('participantIds', 'array-contains', userId)
      .get();

    if (!participantSnap.empty) {
      for (const doc of participantSnap.docs) {
        seenIds.add(doc.id);
        const data = doc.data();
        allEvents.push({
          id: doc.id,
          name: data.name,
          description: data.description,
          type: data.type,
          startDate: data.startDate,
          endDate: data.endDate || undefined,
          currency: data.currency,
          status: data.status,
          createdBy: data.createdBy,
          admins: data.admins || [],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        } as Event);
      }
    }

    // Fallback: also get events created by user (covers older events without participantIds)
    const createdSnap = await db.collection(this.collection)
      .where('createdBy', '==', userId)
      .get();

    if (!createdSnap.empty) {
      for (const doc of createdSnap.docs) {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          const data = doc.data();
          allEvents.push({
            id: doc.id,
            name: data.name,
            description: data.description,
            type: data.type,
            startDate: data.startDate,
            endDate: data.endDate || undefined,
            currency: data.currency,
            status: data.status,
            createdBy: data.createdBy,
            admins: data.admins || [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as Event);
        }
      }
    }

    // Fallback: also get events where user is admin (covers older events without participantIds)
    const adminSnap = await db.collection(this.collection)
      .where('admins', 'array-contains', userId)
      .get();

    if (!adminSnap.empty) {
      for (const doc of adminSnap.docs) {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          const data = doc.data();
          allEvents.push({
            id: doc.id,
            name: data.name,
            description: data.description,
            type: data.type,
            startDate: data.startDate,
            endDate: data.endDate || undefined,
            currency: data.currency,
            status: data.status,
            createdBy: data.createdBy,
            admins: data.admins || [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as Event);
        }
      }
    }

    return allEvents;
  }

  async updateEvent(eventId: string, userId: string, dto: UpdateEventDto): Promise<Event | null> {
    const event = await this.getEvent(eventId);
    if (!event) return null;

    // Check if user is admin
    if (!event.admins.includes(userId) && event.createdBy !== userId) {
      throw new Error('Forbidden: Only admins can update this event');
    }

    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };

    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.type !== undefined) updates.type = dto.type;
    if (dto.startDate !== undefined) updates.startDate = dto.startDate;
    if (dto.endDate !== undefined) updates.endDate = dto.endDate;
    if (dto.currency !== undefined) updates.currency = dto.currency;
    if (dto.settlementCurrency !== undefined) updates.settlementCurrency = dto.settlementCurrency;
    if (dto.fxRateMode !== undefined) updates.fxRateMode = dto.fxRateMode;
    if (dto.predefinedFxRates !== undefined) updates.predefinedFxRates = dto.predefinedFxRates;
    if (dto.status !== undefined) updates.status = dto.status;

    await db.collection(this.collection).doc(eventId).set(updates, { merge: true });

    return this.getEvent(eventId);
  }

  async deleteEvent(eventId: string, userId: string): Promise<boolean> {
    const event = await this.getEvent(eventId);
    if (!event) return false;

    // Allow creator or any admin to delete
    if (event.createdBy !== userId && !event.admins.includes(userId)) {
      throw new Error('Forbidden: Only the creator or an admin can delete this event');
    }

    // Mark any pending settlements as terminated
    try {
      const settlementsSnap = await db.collection('settlements')
        .where('eventId', '==', eventId)
        .where('status', '==', 'pending')
        .get();
      const batch = db.batch();
      settlementsSnap.docs.forEach(doc => {
        batch.update(doc.ref, { status: 'terminated', terminatedAt: new Date().toISOString(), terminatedReason: 'Event deleted' });
      });
      if (!settlementsSnap.empty) {
        await batch.commit();
      }
    } catch (err) {
      // Non-fatal: settlements may not exist yet
      console.warn('Could not terminate settlements for deleted event:', err);
    }

    // Delete all invitations for this event
    try {
      const invitationsSnap = await db.collection('invitations')
        .where('eventId', '==', eventId)
        .get();
      if (!invitationsSnap.empty) {
        const batch = db.batch();
        invitationsSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
    } catch (err) {
      console.warn('Could not clean up invitations for deleted event:', err);
    }

    // Delete subcollections (participants, etc.)
    try {
      const participantsSnap = await db.collection(this.collection).doc(eventId).collection('participants').get();
      const batch = db.batch();
      participantsSnap.docs.forEach(doc => batch.delete(doc.ref));
      if (!participantsSnap.empty) {
        await batch.commit();
      }
    } catch (err) {
      console.warn('Could not clean up participants subcollection:', err);
    }

    await db.collection(this.collection).doc(eventId).delete();
    return true;
  }

  async backfillParticipantIds(eventId: string): Promise<string[]> {
    const participantsSnap = await db.collection(this.collection).doc(eventId).collection('participants').get();
    const ids = participantsSnap.docs.map(doc => doc.id);
    if (ids.length > 0) {
      await db.collection(this.collection).doc(eventId).set({ participantIds: ids }, { merge: true });
    }
    return ids;
  }

  async getParticipants(eventId: string): Promise<EventParticipant[]> {
    const snap = await db.collection(this.collection).doc(eventId).collection('participants').get();
    if (snap.empty) return [];

    const participants = snap.docs.map(doc => {
      const data = doc.data();
      return {
        userId: doc.id,
        groupId: data.groupId,
        role: data.role || 'member',
        joinedAt: data.joinedAt,
        invitedBy: data.invitedBy,
        status: data.status || 'accepted',
      } as EventParticipant;
    });

    // Enrich with user profile data (displayName, email)
    const enriched = await Promise.all(
      participants.map(async (p) => {
        try {
          const userDoc = await db.collection('users').doc(p.userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            p.displayName = userData?.displayName || userData?.email || p.userId;
            p.email = userData?.email;
          }
        } catch {
          // If user lookup fails, keep userId as fallback
        }
        return p;
      })
    );

    return enriched;
  }

  async addParticipant(eventId: string, userId: string, invitedBy: string, role: 'admin' | 'member' = 'member'): Promise<EventParticipant> {
    const now = new Date().toISOString();
    const participant: Record<string, any> = {
      userId,
      role,
      joinedAt: now,
      invitedBy,
      status: 'accepted',
    };

    await db.collection(this.collection).doc(eventId).collection('participants').doc(userId).set(participant);

    // Update the event document: add userId to participantIds and optionally admins
    const event = await this.getEvent(eventId);
    if (event) {
      const updates: Record<string, any> = {};
      const currentParticipantIds: string[] = (event as any).participantIds || [];
      if (!currentParticipantIds.includes(userId)) {
        // If participantIds is empty, backfill from subcollection first
        let baseIds = currentParticipantIds;
        if (baseIds.length === 0) {
          baseIds = await this.backfillParticipantIds(eventId);
        }
        if (!baseIds.includes(userId)) {
          updates.participantIds = [...baseIds, userId];
        }
      }
      if (role === 'admin' && !event.admins.includes(userId)) {
        updates.admins = [...event.admins, userId];
      }
      if (Object.keys(updates).length > 0) {
        await db.collection(this.collection).doc(eventId).set(updates, { merge: true });
      }
    }

    return participant as unknown as EventParticipant;
  }

  async removeParticipant(eventId: string, userId: string, requesterId: string): Promise<boolean> {
    const event = await this.getEvent(eventId);
    if (!event) return false;

    // Only admins or the user themselves can remove
    if (!event.admins.includes(requesterId) && requesterId !== userId) {
      throw new Error('Forbidden: Only admins can remove participants');
    }

    // Cannot remove the creator
    if (userId === event.createdBy) {
      throw new Error('Cannot remove the event creator');
    }

    await db.collection(this.collection).doc(eventId).collection('participants').doc(userId).delete();

    // Remove from participantIds and admins on the event document
    const updates: Record<string, any> = {};
    const currentParticipantIds: string[] = (event as any).participantIds || [];
    
    if (currentParticipantIds.includes(userId)) {
      updates.participantIds = currentParticipantIds.filter(id => id !== userId);
    }
    if (event.admins.includes(userId)) {
      updates.admins = event.admins.filter(id => id !== userId);
    }
    if (Object.keys(updates).length > 0) {
      await db.collection(this.collection).doc(eventId).set(updates, { merge: true });
    }

    return true;
  }

  async isParticipant(eventId: string, userId: string): Promise<boolean> {
    const doc = await db.collection(this.collection).doc(eventId).collection('participants').doc(userId).get();
    return doc.exists;
  }

  async isAdmin(eventId: string, userId: string): Promise<boolean> {
    const event = await this.getEvent(eventId);
    if (!event) return false;
    return event.admins.includes(userId) || event.createdBy === userId;
  }
}
