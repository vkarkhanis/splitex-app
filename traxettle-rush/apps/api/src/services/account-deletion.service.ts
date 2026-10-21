import { DELETED_USER_NAME } from '@traxettle/shared';
import { db, auth } from '../config/firebase';

// Firestore allows 500 writes per batch; stay well under it.
const MAX_BATCH_WRITES = 400;

/** Queues writes and commits them in batches that stay under Firestore's limit. */
class ChunkedWriter {
  private ops: Array<(batch: any) => void> = [];

  set(ref: any, data: Record<string, any>) {
    this.ops.push((batch) => batch.set(ref, data));
  }

  update(ref: any, data: Record<string, any>) {
    this.ops.push((batch) => batch.update(ref, data));
  }

  delete(ref: any) {
    this.ops.push((batch) => batch.delete(ref));
  }

  async commit() {
    for (let i = 0; i < this.ops.length; i += MAX_BATCH_WRITES) {
      const batch = db.batch();
      this.ops.slice(i, i + MAX_BATCH_WRITES).forEach((op) => op(batch));
      await batch.commit();
    }
    this.ops = [];
  }
}

export interface AccountDeletionResult {
  /** Events only this user was in: deleted with their expenses, settlements and pool records. */
  deletedEventIds: string[];
  /** Events shared with others: kept for them, with this user shown as "Deleted user". */
  keptEventIds: string[];
}

/**
 * Deletes an account so it can't sign in again, keeping what other people share with it.
 *
 * - Events the user is alone in are deleted along with their data.
 * - Shared events stay: the user's expenses and payments are kept so everyone's balances
 *   stay correct, the user's participant record is anonymised, admin passes to another
 *   participant if needed, and a pending settlement approval is given on their behalf.
 * - Groups drop the user (and hand over representative/payer); invitations to them go.
 * - The profile, sign-in sessions and the Firebase Authentication account are deleted.
 *   Auth goes last, so a failure leaves an account that can retry (every step repeats safely).
 */
export class AccountDeletionService {
  async deleteAccount(uid: string): Promise<AccountDeletionResult> {
    const writer = new ChunkedWriter();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const email: string | undefined = userSnap.exists ? userSnap.data()?.email : undefined;

    const eventDocs = await this.findEvents(uid);
    const deletedEventIds: string[] = [];
    const keptEventIds: string[] = [];

    for (const eventDoc of eventDocs) {
      const event = eventDoc.data() || {};
      const participantsSnap = await eventDoc.ref.collection('participants').get();
      const others = this.otherMembers(uid, event, participantsSnap.docs);

      if (others.length === 0) {
        await this.queueEventDeletion(writer, eventDoc, participantsSnap.docs);
        deletedEventIds.push(eventDoc.id);
      } else {
        this.queueSharedEventCleanup(writer, uid, eventDoc, participantsSnap.docs, others);
        keptEventIds.push(eventDoc.id);
      }
    }

    await this.queueGroupCleanup(writer, uid, new Set(deletedEventIds));
    await this.queueInvitationCleanup(writer, uid, email);

    const sessionsSnap = await userRef.collection('sessions').get();
    sessionsSnap.docs.forEach((doc: any) => writer.delete(doc.ref));
    writer.delete(userRef);

    await writer.commit();
    await this.deleteAuthUser(uid);
    return { deletedEventIds, keptEventIds };
  }

  /** Events the user is a participant in, plus any they created (older events lack participantIds). */
  private async findEvents(uid: string): Promise<any[]> {
    const [asParticipant, asCreator] = await Promise.all([
      db.collection('events').where('participantIds', 'array-contains', uid).get(),
      db.collection('events').where('createdBy', '==', uid).get(),
    ]);
    const byId = new Map<string, any>();
    [...asParticipant.docs, ...asCreator.docs].forEach((doc: any) => byId.set(doc.id, doc));
    return [...byId.values()];
  }

  /**
   * Other people who have joined the event (pending or declined invitees don't count),
   * ordered by when they joined, so the earliest becomes admin if one is needed.
   */
  private otherMembers(uid: string, event: Record<string, any>, participantDocs: any[]): string[] {
    const joined = new Map<string, string>();
    participantDocs.forEach((doc: any) => {
      const data = doc.data() || {};
      const status = data.status || 'accepted';
      if (doc.id !== uid && status === 'accepted' && !data.deleted) joined.set(doc.id, String(data.joinedAt ?? ''));
    });
    const ids: string[] = Array.isArray(event.participantIds) ? event.participantIds : [];
    const recorded = new Set(participantDocs.map((doc: any) => doc.id));
    // Listed on the event but without a participant record (older data): treat as joined.
    ids.filter((id) => id !== uid && !recorded.has(id)).forEach((id) => joined.set(id, ''));
    return [...joined.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id]) => id);
  }

  private async queueEventDeletion(writer: ChunkedWriter, eventDoc: any, participantDocs: any[]) {
    const related = await Promise.all(
      ['expenses', 'settlements', 'invitations', 'poolContributions', 'poolCycles'].map((collection) =>
        db.collection(collection).where('eventId', '==', eventDoc.id).get(),
      ),
    );
    related.forEach((snap: any) => snap.docs.forEach((doc: any) => writer.delete(doc.ref)));
    // Firestore doesn't delete sub-collections with their parent document.
    participantDocs.forEach((doc: any) => writer.delete(doc.ref));
    writer.delete(eventDoc.ref);
  }

  private queueSharedEventCleanup(writer: ChunkedWriter, uid: string, eventDoc: any, participantDocs: any[], others: string[]) {
    const event = eventDoc.data() || {};
    const changes: Record<string, any> = {};
    const now = new Date().toISOString();

    // Anonymise the participant record but keep it: expenses and payments still refer to it.
    const own = participantDocs.find((doc: any) => doc.id === uid);
    if (own) {
      const { role, status, joinedAt, invitedBy, groupId } = own.data() || {};
      writer.set(own.ref, {
        ...(role ? { role: role === 'admin' ? 'member' : role } : {}),
        ...(status ? { status } : {}),
        ...(joinedAt ? { joinedAt } : {}),
        ...(invitedBy ? { invitedBy } : {}),
        ...(groupId ? { groupId } : {}),
        displayName: DELETED_USER_NAME,
        deleted: true,
        deletedAt: now,
      });
    }

    // Hand over admin (and the creator role) if this user held it: the earliest-joined
    // remaining participant becomes admin when nobody else is one.
    const currentAdmins: string[] = Array.isArray(event.admins) ? event.admins : [];
    const admins = currentAdmins.filter((id) => id !== uid);
    if (admins.length === 0) admins.push(others[0]);
    const promoted = admins.filter((id) => !currentAdmins.includes(id));
    if (promoted.length > 0 || admins.length !== currentAdmins.length) changes.admins = admins;
    promoted.forEach((id) => {
      const doc = participantDocs.find((d: any) => d.id === id);
      if (doc) writer.set(doc.ref, { ...(doc.data() || {}), role: 'admin' });
    });
    if (event.createdBy === uid) changes.createdBy = admins[0];

    // A deleted account can't approve a settlement under review: approve on its behalf.
    const approvals = event.settlementApprovals || {};
    if (event.status === 'review' && approvals[uid] && !approvals[uid].approved) {
      const next = { ...approvals, [uid]: { ...approvals[uid], approved: true, approvedAt: now, approvedOnAccountDeletion: true } };
      changes.settlementApprovals = next;
      if (Object.values(next).every((a: any) => a?.approved)) changes.status = 'payment';
    }

    // A deleted account can't spend from the pool. Custodian stays as recorded (it was their
    // money); event admins can still approve and close the pool.
    const spenders = event.poolConfig?.authorizedSpenders;
    if (Array.isArray(spenders) && spenders.includes(uid)) {
      changes.poolConfig = { ...event.poolConfig, authorizedSpenders: spenders.filter((id: string) => id !== uid) };
    }

    if (Object.keys(changes).length > 0) writer.update(eventDoc.ref, { ...changes, updatedAt: now });
  }

  /** Remove the user from groups; a group left empty is deleted only if all its events were. */
  private async queueGroupCleanup(writer: ChunkedWriter, uid: string, deletedEventIds: Set<string>) {
    const groupsSnap = await db.collection('groups').where('members', 'array-contains', uid).get();
    groupsSnap.docs.forEach((doc: any) => {
      const group = doc.data() || {};
      const members: string[] = (group.members || []).filter((id: string) => id !== uid);
      const groupEvents: string[] = [...new Set([group.eventId, ...(group.eventIds || [])].filter(Boolean))];
      if (members.length === 0 && groupEvents.every((id) => deletedEventIds.has(id))) {
        writer.delete(doc.ref);
        return;
      }
      writer.update(doc.ref, {
        members,
        ...(group.representative === uid && members[0] ? { representative: members[0] } : {}),
        ...(group.payerUserId === uid && members[0] ? { payerUserId: members[0] } : {}),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  /** Invitations addressed to this account or its email. Ones it sent for shared events stay valid. */
  private async queueInvitationCleanup(writer: ChunkedWriter, uid: string, email: string | undefined) {
    const queries = [db.collection('invitations').where('inviteeUserId', '==', uid).get()];
    // Stored trimmed and lower-cased (InvitationService.normalizeEmail).
    const normalizedEmail = email?.trim().toLowerCase();
    if (normalizedEmail) queries.push(db.collection('invitations').where('inviteeEmail', '==', normalizedEmail).get());
    const snaps = await Promise.all(queries);
    const seen = new Set<string>();
    snaps.forEach((snap: any) =>
      snap.docs.forEach((doc: any) => {
        if (seen.has(doc.id)) return;
        seen.add(doc.id);
        writer.delete(doc.ref);
      }),
    );
  }

  private async deleteAuthUser(uid: string) {
    if (uid.startsWith('mock-') || typeof (auth as any).deleteUser !== 'function') return;
    try {
      await (auth as any).deleteUser(uid);
    } catch (err: any) {
      if (err?.code !== 'auth/user-not-found') throw err;
    }
  }
}
