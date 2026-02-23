import { Router } from 'express';
import { ApiResponse, UserProfile, UserPreferences } from '@traxettle/shared';
import { db } from '../config/firebase';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { EntitlementService } from '../services/entitlement.service';

const router: Router = Router();
const entitlementService = new EntitlementService();

router.get('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();

    const defaultPreferences: UserPreferences = {
      notifications: true,
      currency: 'USD',
      timezone: 'UTC'
    };

    const baseProfile: UserProfile = {
      userId: uid,
      displayName: req.user?.name || req.user?.email || 'User',
      email: req.user?.email || '',
      phoneNumber: undefined,
      photoURL: undefined,
      tier: 'free',
      entitlementStatus: 'active',
      entitlementExpiresAt: null,
      entitlementSource: 'system',
      capabilities: { multiCurrencySettlement: false },
      preferences: defaultPreferences
    };

    if (!snap.exists) {
      await ref.set({
        ...baseProfile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return res.json({ success: true, data: baseProfile } as ApiResponse<UserProfile>);
    }

    const data = snap.data() || {};
    const entitlement = await entitlementService.getEntitlement(uid);
    const capabilities = entitlementService.computeCapabilities(entitlement);
    const profile: UserProfile = {
      userId: uid,
      displayName: typeof data.displayName === 'string' ? data.displayName : baseProfile.displayName,
      email: typeof data.email === 'string' ? data.email : baseProfile.email,
      phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : undefined,
      photoURL: typeof data.photoURL === 'string' ? data.photoURL : undefined,
      tier: entitlement.tier,
      entitlementStatus: entitlement.entitlementStatus,
      entitlementExpiresAt: entitlement.entitlementExpiresAt,
      entitlementSource: entitlement.entitlementSource,
      internalTester: entitlement.internalTester,
      capabilities,
      preferences: {
        ...defaultPreferences,
        ...(data.preferences || {})
      }
    };

    return res.json({ success: true, data: profile } as ApiResponse<UserProfile>);
  } catch (err) {
    console.error('GET /profile error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load profile' } as ApiResponse);
  }
});

router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() || {} : {};

    const body = (req.body || {}) as Partial<UserProfile>;

    const nextPreferences: UserPreferences = {
      notifications:
        typeof body.preferences?.notifications === 'boolean'
          ? body.preferences.notifications
          : typeof existing.preferences?.notifications === 'boolean'
            ? existing.preferences.notifications
            : true,
      currency:
        typeof body.preferences?.currency === 'string'
          ? body.preferences.currency
          : typeof existing.preferences?.currency === 'string'
            ? existing.preferences.currency
            : 'USD',
      timezone:
        typeof body.preferences?.timezone === 'string'
          ? body.preferences.timezone
          : typeof existing.preferences?.timezone === 'string'
            ? existing.preferences.timezone
            : 'UTC'
    };

    const displayName = typeof body.displayName === 'string' ? body.displayName : existing.displayName;
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber : existing.phoneNumber;
    const photoURL = typeof body.photoURL === 'string' ? body.photoURL : existing.photoURL;
    const email = typeof body.email === 'string' ? body.email : (existing.email || req.user?.email || '');

    const updatedDoc = {
      userId: uid,
      displayName: displayName || (req.user?.name || req.user?.email || 'User'),
      email,
      phoneNumber,
      photoURL,
      preferences: nextPreferences,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await ref.set(updatedDoc, { merge: true });

    const entitlement = await entitlementService.getEntitlement(uid);
    const capabilities = entitlementService.computeCapabilities(entitlement);
    const profile: UserProfile = {
      userId: uid,
      displayName: updatedDoc.displayName,
      email: updatedDoc.email,
      phoneNumber: updatedDoc.phoneNumber,
      photoURL: updatedDoc.photoURL,
      tier: entitlement.tier,
      entitlementStatus: entitlement.entitlementStatus,
      entitlementExpiresAt: entitlement.entitlementExpiresAt,
      entitlementSource: entitlement.entitlementSource,
      internalTester: entitlement.internalTester,
      capabilities,
      preferences: updatedDoc.preferences
    };

    return res.json({ success: true, data: profile } as ApiResponse<UserProfile>);
  } catch (err) {
    console.error('PUT /profile error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update profile' } as ApiResponse);
  }
});

export { router as userRoutes };
