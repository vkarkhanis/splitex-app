import { Router } from 'express';
import type { ApiResponse, PlanTier } from '@traxettle/shared';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { EntitlementService } from '../services/entitlement.service';
import { emitToUser } from '../config/websocket';

const router: Router = Router();
const entitlementService = new EntitlementService();

function isProdEnvironment(): boolean {
  const env = (process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV || '').toLowerCase();
  return env === 'production';
}

async function canUseInternalSwitch(req: AuthenticatedRequest): Promise<boolean> {
  if (isProdEnvironment()) return false;
  if (String(process.env.INTERNAL_TIER_SWITCH_ENABLED || 'false') !== 'true') return false;
  const env = (process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (env === 'local' || env === 'development' || env === 'test') return true;
  const entitlement = await entitlementService.getEntitlement(req.user!.uid);
  return entitlement.internalTester || req.user?.uid?.startsWith('mock-') === true;
}

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!(await canUseInternalSwitch(req))) {
      return res.status(403).json({ success: false, error: 'Internal tier switch disabled' } as ApiResponse);
    }
    const entitlement = await entitlementService.getEntitlement(req.user!.uid);
    const capabilities = entitlementService.computeCapabilities(entitlement);
    return res.json({
      success: true,
      data: {
        ...entitlement,
        capabilities,
      },
    } as ApiResponse);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to get entitlement' } as ApiResponse);
  }
});

router.post('/switch', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!(await canUseInternalSwitch(req))) {
      return res.status(403).json({ success: false, error: 'Internal tier switch disabled' } as ApiResponse);
    }

    const targetUserId = (req.body?.userId as string | undefined) || req.user!.uid;
    const tier = req.body?.tier as PlanTier;
    if (!['free', 'pro'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'tier must be free or pro' } as ApiResponse);
    }

    // In non-local env, only allow switching own tier unless explicit override is enabled.
    const env = (process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV || '').toLowerCase();
    if (env !== 'local' && env !== 'development' && targetUserId !== req.user!.uid) {
      return res.status(403).json({ success: false, error: 'Cannot switch other users in this environment' } as ApiResponse);
    }

    const entitlement = await entitlementService.switchTier(targetUserId, tier, 'manual_override');
    const capabilities = entitlementService.computeCapabilities(entitlement);
    emitToUser(targetUserId, 'user:tier-updated', {
      tier: entitlement.tier,
      entitlementStatus: entitlement.entitlementStatus,
      capabilities,
    });

    return res.json({
      success: true,
      data: {
        userId: targetUserId,
        ...entitlement,
        capabilities,
      },
    } as ApiResponse);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to switch entitlement' } as ApiResponse);
  }
});

export { router as internalEntitlementRoutes };
