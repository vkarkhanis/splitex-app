import { Platform } from 'react-native';
import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import { ENV } from '../config/env';

// ─── Constants ───────────────────────────────────────────────────────────────
const PRO_ENTITLEMENT = ENV.REVENUECAT_PRO_ENTITLEMENT_ID;
const OFFERING_ID = ENV.REVENUECAT_OFFERING_ID;

// ─── Initialisation ──────────────────────────────────────────────────────────

let _initialised = false;

/**
 * Configure RevenueCat SDK.  Call once at app startup (after user is known).
 * Pass the authenticated user's ID so purchases are attributed correctly.
 */
export async function initPurchases(appUserId?: string): Promise<void> {
  if (_initialised) return;

  const apiKey =
    Platform.OS === 'ios'
      ? ENV.REVENUECAT_APPLE_API_KEY
      : ENV.REVENUECAT_GOOGLE_API_KEY;

  if (!apiKey) {
    console.warn(
      '[Purchases] No RevenueCat API key configured for',
      Platform.OS,
      '— in-app purchases will be unavailable.',
    );
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  await Purchases.configure({ apiKey, appUserID: appUserId || undefined });
  _initialised = true;
}

/**
 * Log in / identify a user with RevenueCat after authentication.
 * This merges any anonymous purchases with the authenticated account.
 */
export async function loginPurchaseUser(appUserId: string): Promise<CustomerInfo> {
  if (!_initialised) await initPurchases(appUserId);
  const { customerInfo } = await Purchases.logIn(appUserId);
  return customerInfo;
}

/**
 * Log out the current user from RevenueCat (resets to anonymous).
 */
export async function logoutPurchaseUser(): Promise<void> {
  if (!_initialised) return;
  await Purchases.logOut();
}

// ─── Entitlement Checks ──────────────────────────────────────────────────────

/**
 * Returns true if the user currently has an active "pro" entitlement.
 */
export async function hasProEntitlement(): Promise<boolean> {
  if (!_initialised) return false;
  const info = await Purchases.getCustomerInfo();
  return !!info.entitlements.active[PRO_ENTITLEMENT];
}

/**
 * Get the full CustomerInfo object.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!_initialised) return null;
  return Purchases.getCustomerInfo();
}

// ─── Offerings & Packages ────────────────────────────────────────────────────

/**
 * Fetch the current offering (the set of packages/products configured in
 * the RevenueCat dashboard).
 */
export async function getProOffering(): Promise<PurchasesOffering | null> {
  if (!_initialised) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.all[OFFERING_ID] ?? offerings.current ?? null;
}

/**
 * Convenience: return the "annual" (subscription) package from the
 * default offering — this is the yearly Pro subscription.
 * Falls back to lifetime, then the first available package.
 */
export async function getProPackage(): Promise<PurchasesPackage | null> {
  const offering = await getProOffering();
  if (!offering) return null;
  return offering.annual ?? offering.lifetime ?? offering.availablePackages[0] ?? null;
}

// ─── Purchase & Restore ──────────────────────────────────────────────────────

export interface PurchaseResult {
  success: boolean;
  customerInfo: CustomerInfo | null;
  error?: string;
  userCancelled?: boolean;
}

/**
 * Purchase the Pro upgrade package.
 */
export async function purchasePro(): Promise<PurchaseResult> {
  const pkg = await getProPackage();
  if (!pkg) {
    return {
      success: false,
      customerInfo: null,
      error: 'No Pro package available. Please try again later.',
    };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro = !!customerInfo.entitlements.active[PRO_ENTITLEMENT];
    return { success: isPro, customerInfo };
  } catch (err: any) {
    if (err.userCancelled) {
      return { success: false, customerInfo: null, userCancelled: true };
    }
    return {
      success: false,
      customerInfo: null,
      error: err.message || 'Purchase failed. Please try again.',
    };
  }
}

/**
 * Restore previous purchases (e.g. after reinstall or new device).
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!_initialised) {
    return {
      success: false,
      customerInfo: null,
      error: 'Purchases not initialised.',
    };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPro = !!customerInfo.entitlements.active[PRO_ENTITLEMENT];
    return { success: isPro, customerInfo };
  } catch (err: any) {
    return {
      success: false,
      customerInfo: null,
      error: err.message || 'Restore failed. Please try again.',
    };
  }
}

/**
 * Returns true if the SDK was successfully initialised.
 */
export function isPurchasesConfigured(): boolean {
  return _initialised;
}
