import { Group, CreateGroupDto, UpdateGroupDto } from '@splitex/shared';
import { db } from '../config/firebase';

export class GroupService {
  private collection = 'groups';

  async createGroup(userId: string, dto: CreateGroupDto): Promise<Group> {
    const now = new Date().toISOString();

    // Representative defaults to first member, or explicit value
    const representative = dto.representative || (dto.memberIds.length > 0 ? dto.memberIds[0] : dto.payerUserId);

    const groupData = {
      eventId: dto.eventId,
      eventIds: [dto.eventId],
      name: dto.name,
      description: dto.description || '',
      createdBy: userId,
      members: dto.memberIds,
      representative,
      payerUserId: dto.payerUserId,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(this.collection).add(groupData);

    return {
      id: docRef.id,
      ...groupData,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    } as Group;
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const doc = await db.collection(this.collection).doc(groupId).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
      id: doc.id,
      eventId: data.eventId,
      eventIds: data.eventIds || [data.eventId],
      name: data.name,
      description: data.description,
      createdBy: data.createdBy,
      members: data.members || [],
      representative: data.representative || data.payerUserId || (data.members && data.members[0]) || '',
      payerUserId: data.payerUserId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as Group;
  }

  async getEventGroups(eventId: string): Promise<Group[]> {
    // Query by eventId (primary) and also eventIds array for reusable groups
    const snap = await db.collection(this.collection)
      .where('eventId', '==', eventId)
      .get();

    const seenIds = new Set<string>();
    const groups: Group[] = [];

    if (!snap.empty) {
      for (const doc of snap.docs) {
        seenIds.add(doc.id);
        const data = doc.data();
        groups.push({
          id: doc.id,
          eventId: data.eventId,
          eventIds: data.eventIds || [data.eventId],
          name: data.name,
          description: data.description,
          createdBy: data.createdBy,
          members: data.members || [],
          representative: data.representative || data.payerUserId || (data.members && data.members[0]) || '',
          payerUserId: data.payerUserId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        } as Group);
      }
    }

    // Also check eventIds array for reusable groups
    try {
      const reusableSnap = await db.collection(this.collection)
        .where('eventIds', 'array-contains', eventId)
        .get();
      if (!reusableSnap.empty) {
        for (const doc of reusableSnap.docs) {
          if (!seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            const data = doc.data();
            groups.push({
              id: doc.id,
              eventId: data.eventId,
              eventIds: data.eventIds || [data.eventId],
              name: data.name,
              description: data.description,
              createdBy: data.createdBy,
              members: data.members || [],
              representative: data.representative || data.payerUserId || (data.members && data.members[0]) || '',
              payerUserId: data.payerUserId,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            } as Group);
          }
        }
      }
    } catch {
      // eventIds index may not exist yet for older data
    }

    return groups;
  }

  async updateGroup(groupId: string, userId: string, dto: UpdateGroupDto): Promise<Group | null> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    if (group.createdBy !== userId && group.representative !== userId) {
      throw new Error('Forbidden: Only the group creator or representative can update this group');
    }

    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };

    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.memberIds !== undefined) updates.members = dto.memberIds;
    if (dto.payerUserId !== undefined) updates.payerUserId = dto.payerUserId;
    if (dto.representative !== undefined) {
      // Representative must be a current member (check against updated members if provided)
      const effectiveMembers = dto.memberIds ?? group.members;
      if (!effectiveMembers.includes(dto.representative)) {
        throw new Error('Representative must be a member of the group');
      }
      updates.representative = dto.representative;
    }

    await db.collection(this.collection).doc(groupId).set(updates, { merge: true });

    return this.getGroup(groupId);
  }

  async deleteGroup(groupId: string, userId: string): Promise<boolean> {
    const group = await this.getGroup(groupId);
    if (!group) return false;

    // Creator or representative can delete
    if (group.createdBy !== userId && group.representative !== userId) {
      throw new Error('Forbidden: Only the group creator or representative can delete this group');
    }

    await db.collection(this.collection).doc(groupId).delete();
    return true;
  }

  async addGroupToEvent(groupId: string, eventId: string, userId: string): Promise<Group | null> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    const eventIds: string[] = (group as any).eventIds || [group.eventId];
    if (!eventIds.includes(eventId)) {
      eventIds.push(eventId);
      await db.collection(this.collection).doc(groupId).set(
        { eventIds, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }

    return this.getGroup(groupId);
  }

  async suggestGroups(userId: string, memberIds: string[], threshold: number = 0.7): Promise<Group[]> {
    // Find all groups created by this user
    const snap = await db.collection(this.collection)
      .where('createdBy', '==', userId)
      .get();

    if (snap.empty) return [];

    const suggestions: Group[] = [];
    const memberSet = new Set(memberIds);

    for (const doc of snap.docs) {
      const data = doc.data();
      const groupMembers: string[] = data.members || [];
      if (groupMembers.length === 0) continue;

      // Calculate overlap percentage
      const overlap = groupMembers.filter(m => memberSet.has(m)).length;
      const similarity = overlap / Math.max(groupMembers.length, memberIds.length);

      if (similarity >= threshold) {
        suggestions.push({
          id: doc.id,
          eventId: data.eventId,
          eventIds: data.eventIds || [data.eventId],
          name: data.name,
          description: data.description,
          createdBy: data.createdBy,
          members: groupMembers,
          representative: data.representative || data.payerUserId || groupMembers[0] || '',
          payerUserId: data.payerUserId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        } as Group);
      }
    }

    return suggestions;
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    // Get groups where user is a member
    const snap = await db.collection(this.collection)
      .where('members', 'array-contains', userId)
      .get();

    if (snap.empty) return [];

    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        eventId: data.eventId,
        eventIds: data.eventIds || [data.eventId],
        name: data.name,
        description: data.description,
        createdBy: data.createdBy,
        members: data.members || [],
        representative: data.representative || data.payerUserId || (data.members && data.members[0]) || '',
        payerUserId: data.payerUserId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as Group;
    });
  }

  async addMember(groupId: string, userId: string, requesterId: string): Promise<Group | null> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    if (group.createdBy !== requesterId) {
      throw new Error('Forbidden: Only the group creator can add members');
    }

    if (group.members.includes(userId)) {
      return group; // Already a member
    }

    const updatedMembers = [...group.members, userId];
    await db.collection(this.collection).doc(groupId).set(
      { members: updatedMembers, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return this.getGroup(groupId);
  }

  async removeMember(groupId: string, userId: string, requesterId: string): Promise<Group | null> {
    const group = await this.getGroup(groupId);
    if (!group) return null;

    if (group.createdBy !== requesterId && requesterId !== userId) {
      throw new Error('Forbidden: Only the group creator or the member themselves can remove a member');
    }

    const updatedMembers = group.members.filter(id => id !== userId);
    await db.collection(this.collection).doc(groupId).set(
      { members: updatedMembers, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return this.getGroup(groupId);
  }
}
