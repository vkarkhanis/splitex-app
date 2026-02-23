import { Router } from 'express';
import { ApiResponse } from '@traxettle/shared';
import { RevenueCatService } from '../services/billing/revenuecat.service';
import { BillingEventsService } from '../services/billing/billing-events.service';
import { EntitlementService } from '../services/entitlement.service';
import { emitToUser } from '../config/websocket';

const router: Router = Router();
const revenueCatService = new RevenueCatService();
const billingEventsService = new BillingEventsService();
const entitlementService = new EntitlementService();

router.post('/revenuecat/webhook', async (req, res) => {
  try {
    const headerSecret = req.header('X-Webhook-Secret') || req.header('Authorization') || undefined;
    if (!revenueCatService.validateWebhookSecret(headerSecret)) {
      return res.status(401).json({ success: false, error: 'Invalid webhook secret' } as ApiResponse);
    }

    const event = revenueCatService.parseEvent(req.body);
    const eventId = event.id || '';
    if (eventId && await billingEventsService.hasProcessed(eventId)) {
      return res.json({ success: true, data: { skipped: true } } as ApiResponse);
    }

    const userId = revenueCatService.resolveUserId(event);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'Missing app_user_id in webhook payload' } as ApiResponse);
    }

    const entitlement = await entitlementService.applyRevenueCatEntitlement(userId, {
      tier: revenueCatService.mapTier(event),
      entitlementStatus: revenueCatService.mapStatus(event),
      entitlementExpiresAt: revenueCatService.getExpiry(event),
    });
    const capabilities = entitlementService.computeCapabilities(entitlement);

    if (eventId) {
      await billingEventsService.markProcessed(eventId, req.body);
    }

    emitToUser(userId, 'user:tier-updated', {
      tier: entitlement.tier,
      entitlementStatus: entitlement.entitlementStatus,
      capabilities,
    });

    return res.json({ success: true, data: { processed: true } } as ApiResponse);
  } catch (err: any) {
    console.error('POST /billing/revenuecat/webhook error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Webhook processing failed' } as ApiResponse);
  }
});

export { router as billingRoutes };
