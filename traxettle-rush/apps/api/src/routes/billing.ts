import { Router } from 'express';
import { ApiResponse } from '@traxettle/shared';
import { createHash } from 'crypto';
import { RevenueCatService } from '../services/billing/revenuecat.service';
import { BillingEventsService } from '../services/billing/billing-events.service';
import { EntitlementService } from '../services/entitlement.service';
import { emitToUser } from '../config/websocket';

const router: Router = Router();
const revenueCatService = new RevenueCatService();
const billingEventsService = new BillingEventsService();
const entitlementService = new EntitlementService();

function readRevenueCatSecretHeader(req: any): string | undefined {
  const customHeaderName = (process.env.REVENUECAT_WEBHOOK_HEADER_NAME || '').trim().toLowerCase();
  const candidates = [
    'x-webhook-secret',
    'authorization',
    'webhook-secret',
    'x-revenuecat-webhook-secret',
    'x-revenuecat-signature',
    customHeaderName,
  ].filter(Boolean);

  for (const name of candidates) {
    const value = req.header(name);
    if (value) return value;
  }
  return undefined;
}

router.get('/revenuecat/webhook-debug', async (req, res) => {
  const appEnv = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (appEnv === 'production') {
    return res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
  }

  const configuredSecret = process.env.REVENUECAT_WEBHOOK_SECRET || '';
  const incomingSecret = readRevenueCatSecretHeader(req) || '';
  const incomingHeaders = [
    'x-webhook-secret',
    'authorization',
    'webhook-secret',
    'x-revenuecat-webhook-secret',
    'x-revenuecat-signature',
    (process.env.REVENUECAT_WEBHOOK_HEADER_NAME || '').trim().toLowerCase(),
  ].filter(Boolean).map((name) => ({
    name,
    present: Boolean(req.header(name)),
  }));
  const secretFingerprint = configuredSecret
    ? createHash('sha256').update(configuredSecret).digest('hex').slice(0, 8)
    : null;
  const incomingFingerprint = incomingSecret
    ? createHash('sha256').update(incomingSecret).digest('hex').slice(0, 8)
    : null;

  return res.json({
    success: true,
    data: {
      appEnv: appEnv || 'unknown',
      configuredSecretPresent: Boolean(configuredSecret),
      configuredSecretFingerprint: secretFingerprint,
      incomingSecretPresent: Boolean(incomingSecret),
      incomingSecretFingerprint: incomingFingerprint,
      incomingMatchesConfigured: revenueCatService.validateWebhookSecret(incomingSecret || undefined),
      incomingHeaders,
    },
  } as ApiResponse);
});

router.post('/revenuecat/webhook', async (req, res) => {
  try {
    const headerSecret = readRevenueCatSecretHeader(req);
    if (!revenueCatService.validateWebhookSecret(headerSecret)) {
      const appEnv = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
      const debug =
        appEnv === 'production'
          ? undefined
          : {
              hasSecretHeader: Boolean(headerSecret),
              authHeaderLooksBearer: /^Bearer\s+/i.test(headerSecret || ''),
              configuredSecretPresent: Boolean(process.env.REVENUECAT_WEBHOOK_SECRET),
            };
      return res.status(401).json({ success: false, error: 'Invalid webhook secret', data: debug } as ApiResponse);
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
