import { Router } from 'express';
import { ApiResponse, UserProfile, UserPreferences } from '@traxettle/shared';
import { db } from '../config/firebase';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { EntitlementService } from '../services/entitlement.service';

const router: Router = Router();
const entitlementService = new EntitlementService();
const PAYMENT_METHOD_TYPES = new Set(['upi', 'bank', 'paypal', 'wise', 'swift', 'other']);
interface UserPaymentMethod {
  id: string;
  label: string;
  currency: string;
  type: string;
  details: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

function normalizePaymentMethods(raw: any): UserPaymentMethod[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((method: any) => ({
      id: typeof method?.id === 'string' ? method.id : '',
      label: typeof method?.label === 'string' ? method.label.trim() : '',
      currency: typeof method?.currency === 'string' ? method.currency.trim().toUpperCase() : '',
      type: typeof method?.type === 'string' ? method.type.toLowerCase() : '',
      details: typeof method?.details === 'string' ? method.details.trim() : '',
      isActive: method?.isActive !== false,
      createdAt: method?.createdAt || undefined,
      updatedAt: method?.updatedAt || undefined,
    }))
    .filter((method: any) =>
      method.id &&
      method.label &&
      method.currency &&
      method.details &&
      PAYMENT_METHOD_TYPES.has(method.type)
    );
}

function sortPaymentMethods(methods: UserPaymentMethod[]): UserPaymentMethod[] {
  return [...methods].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (a.label || '').localeCompare(b.label || '');
  });
}

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
      },
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
      paymentMethods: normalizePaymentMethods(existing.paymentMethods),
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
      preferences: updatedDoc.preferences,
    };

    return res.json({ success: true, data: profile } as ApiResponse<UserProfile>);
  } catch (err) {
    console.error('PUT /profile error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update profile' } as ApiResponse);
  }
});

router.get('/payment-methods', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const currency = typeof req.query.currency === 'string' ? req.query.currency.trim().toUpperCase() : '';
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const methods = sortPaymentMethods(normalizePaymentMethods(data.paymentMethods));
    const filtered = currency ? methods.filter((m) => m.currency === currency) : methods;
    return res.json({ success: true, data: filtered } as ApiResponse<UserPaymentMethod[]>);
  } catch (err) {
    console.error('GET /payment-methods error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load payment methods' } as ApiResponse);
  }
});

router.post('/payment-methods', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const methods = normalizePaymentMethods(data.paymentMethods);

    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    const currency = typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : '';
    const type = typeof req.body?.type === 'string' ? req.body.type.trim().toLowerCase() : '';
    const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';
    const isActive = req.body?.isActive !== false;

    if (!label || !currency || !details || !PAYMENT_METHOD_TYPES.has(type)) {
      return res.status(400).json({ success: false, error: 'Invalid payment method payload' } as ApiResponse);
    }

    const now = new Date().toISOString();
    const method: UserPaymentMethod = {
      id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      currency,
      type: type as any,
      details,
      isActive,
      createdAt: now,
      updatedAt: now,
    };

    const next = [...methods, method];
    await ref.set({ paymentMethods: next, updatedAt: now }, { merge: true });
    return res.status(201).json({ success: true, data: method } as ApiResponse<UserPaymentMethod>);
  } catch (err) {
    console.error('POST /payment-methods error:', err);
    return res.status(500).json({ success: false, error: 'Failed to add payment method' } as ApiResponse);
  }
});

router.put('/payment-methods/:methodId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const methodId = req.params.methodId;
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const methods = normalizePaymentMethods(data.paymentMethods);
    const idx = methods.findIndex((m) => m.id === methodId);
    if (idx < 0) {
      return res.status(404).json({ success: false, error: 'Payment method not found' } as ApiResponse);
    }

    const current = methods[idx];
    const next: UserPaymentMethod = {
      ...current,
      label: typeof req.body?.label === 'string' ? req.body.label.trim() : current.label,
      currency: typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : current.currency,
      type: typeof req.body?.type === 'string' ? req.body.type.trim().toLowerCase() : current.type,
      details: typeof req.body?.details === 'string' ? req.body.details.trim() : current.details,
      isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : current.isActive,
      updatedAt: new Date().toISOString(),
    };

    if (!next.label || !next.currency || !next.details || !PAYMENT_METHOD_TYPES.has(next.type)) {
      return res.status(400).json({ success: false, error: 'Invalid payment method payload' } as ApiResponse);
    }

    methods[idx] = next;
    await ref.set({ paymentMethods: methods, updatedAt: new Date().toISOString() }, { merge: true });
    return res.json({ success: true, data: next } as ApiResponse<UserPaymentMethod>);
  } catch (err) {
    console.error('PUT /payment-methods/:methodId error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update payment method' } as ApiResponse);
  }
});

router.delete('/payment-methods/:methodId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const uid = req.user!.uid;
    const methodId = req.params.methodId;
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const methods = normalizePaymentMethods(data.paymentMethods);
    const next = methods.filter((m) => m.id !== methodId);
    if (next.length === methods.length) {
      return res.status(404).json({ success: false, error: 'Payment method not found' } as ApiResponse);
    }

    await ref.set({ paymentMethods: next, updatedAt: new Date().toISOString() }, { merge: true });
    return res.json({ success: true, data: { deleted: true } } as ApiResponse<{ deleted: boolean }>);
  } catch (err) {
    console.error('DELETE /payment-methods/:methodId error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete payment method' } as ApiResponse);
  }
});

export { router as userRoutes };
