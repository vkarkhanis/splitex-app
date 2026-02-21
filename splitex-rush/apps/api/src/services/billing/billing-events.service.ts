import { db } from '../../config/firebase';

export class BillingEventsService {
  private readonly collection = 'billingWebhookEvents';

  async hasProcessed(eventId: string): Promise<boolean> {
    if (!eventId) return false;
    const snap = await db.collection(this.collection).doc(eventId).get();
    return snap.exists;
  }

  async markProcessed(eventId: string, payload: any): Promise<void> {
    if (!eventId) return;
    await db.collection(this.collection).doc(eventId).set(
      {
        eventId,
        processedAt: new Date().toISOString(),
        payload,
      },
      { merge: true },
    );
  }
}
