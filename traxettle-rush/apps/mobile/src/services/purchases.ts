import { Platform } from 'react-native';
import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import { ENV } from '../config/env';
import { getRuntimeConfig } from '../config/runtime';

// ─── Constants ───────────────────────────────────────────────────────────────
let PRO_ENTITLEMENT = ENV.REVENUECAT_PRO_ENTITLEMENT_ID;
let OFFERING_ID = ENV.REVENUECAT_OFFERING_ID;

// ─── Initialisation ──────────────────────────────────────────────────────────

let _initialised = false;
let _currentAppUserId: string | undefined;

export interface PurchasesConfigDebug {
  platform: 'ios' | 'android';
  keyPresent: boolean;
  keyPrefix: string;
}

export function getPurchasesConfigDebug(): PurchasesConfigDebug {
  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
  const apiKey = platform === 'ios' ? ENV.REVENUECAT_APPLE_API_KEY : ENV.REVENUECAT_GOOGLE_API_KEY;
  const keyPrefix = apiKey ? apiKey.slice(0, 10) : '';
  return { platform, keyPresent: Boolean(apiKey), keyPrefix };
}

/**
 * Reconfigure RevenueCat with runtime configuration.
 * Call this when environment changes (e.g., switching to staging mode).
 */
export async function reconfigurePurchasesWithRuntimeConfig(): Promise<void> {
  if (!_initialised || !_currentAppUserId) {
    console.log('[Purchases] Cannot reconfigure - not initialized or no app user ID');
    return;
  }

  try {
    const runtimeConfig = await getRuntimeConfig();
    const { revenueCatConfig } = runtimeConfig;
    
    // Update local constants
    PRO_ENTITLEMENT = revenueCatConfig.proEntitlement;
    OFFERING_ID = revenueCatConfig.offering;
    
    // Get the appropriate API key for platform
    const apiKey = Platform.OS === 'ios' 
      ? revenueCatConfig.appleApiKey 
      : revenueCatConfig.googleApiKey;
    
    if (!apiKey) {
      console.warn('[Purchases] No RevenueCat API key in runtime config - keeping current configuration');
      return;
    }
    
    console.log('[Purchases] Reconfiguring with runtime config:', {
      platform: Platform.OS,
      keyPrefix: apiKey.slice(0, 10) + '...',
      entitlement: revenueCatConfig.proEntitlement,
      offering: revenueCatConfig.offering
    });
    
    // Reconfigure RevenueCat with new API key
    await Purchases.configure({ apiKey, appUserID: _currentAppUserId });
    
    console.log('[Purchases] Successfully reconfigured with runtime config');
  } catch (error) {
    console.error('[Purchases] Failed to reconfigure with runtime config:', error);
  }
}

/**
 * Configure RevenueCat SDK.  Call once at app startup (after user is known).
 * Pass the authenticated user's ID so purchases are attributed correctly.
 */
export async function initPurchases(appUserId?: string): Promise<void> {
  if (_initialised) return;

  // Store app user ID for potential reconfiguration
  _currentAppUserId = appUserId;

  // Try runtime config first, fallback to build-time config
  let apiKey: string | undefined;
  let entitlement: string;
  let offering: string;

  try {
    const runtimeConfig = await getRuntimeConfig();
    const { revenueCatConfig } = runtimeConfig;
    
    apiKey = Platform.OS === 'ios' 
      ? revenueCatConfig.appleApiKey 
      : revenueCatConfig.googleApiKey;
    entitlement = revenueCatConfig.proEntitlement;
    offering = revenueCatConfig.offering;
    
    console.log('[Purchases] Using runtime RevenueCat configuration');
  } catch (error) {
    // Fallback to build-time configuration
    apiKey = Platform.OS === 'ios'
      ? ENV.REVENUECAT_APPLE_API_KEY
      : ENV.REVENUECAT_GOOGLE_API_KEY;
    entitlement = ENV.REVENUECAT_PRO_ENTITLEMENT_ID;
    offering = ENV.REVENUECAT_OFFERING_ID;
    
    console.log('[Purchases] Using build-time RevenueCat configuration (fallback)');
  }

  if (!apiKey) {
    console.warn(
      '[Purchases] No RevenueCat API key configured for',
      Platform.OS,
      '— in-app purchases will be unavailable.',
    );
    return;
  }

  // Update local constants
  PRO_ENTITLEMENT = entitlement;
  OFFERING_ID = offering;

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  try {
    await Purchases.configure({ apiKey, appUserID: appUserId || undefined });
  } catch (err: any) {
    const debug = getPurchasesConfigDebug();
    console.error(
      '[Purchases] Failed to configure RevenueCat SDK',
      {
        platform: debug.platform,
        keyPresent: debug.keyPresent,
        keyPrefix: debug.keyPrefix,
        error: err.message,
      },
    );
    return;
  }

  _initialised = true;
  console.log('[Purchases] RevenueCat SDK configured successfully');
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
  
  console.log('[Purchases] Available offerings:', {
    total: offerings.all.length,
    offeringIds: Object.keys(offerings.all),
    current: offerings.current?.identifier || 'none',
    requestedOfferingId: OFFERING_ID
  });
  
  const offering = offerings.all[OFFERING_ID] ?? offerings.current ?? null;
  
  if (offering) {
    console.log('[Purchases] Found offering:', {
      identifier: offering.identifier,
      packagesCount: offering.availablePackages.length,
      packageIds: offering.availablePackages.map(p => p.identifier)
    });
  } else {
    console.warn('[Purchases] No offering found - check Google Play Console products');
  }
  
  return offering;
}

/**
 * Convenience: return the "annual" (subscription) package from the
 * default offering — this is the yearly Pro subscription.
 * Falls back to lifetime, then the first available package.
 */
export async function getProPackage(): Promise<PurchasesPackage | null> {
  const offering = await getProOffering();
  if (!offering) return null;
  
  const pkg = offering.annual ?? offering.lifetime ?? offering.availablePackages[0] ?? null;
  
  console.log('[Purchases] Selected package:', {
    found: !!pkg,
    identifier: pkg?.identifier || 'none',
    hasAnnual: !!offering.annual,
    hasLifetime: !!offering.lifetime,
    totalPackages: offering.availablePackages.length
  });
  
  return pkg;
}

// ─── Purchase & Restore ──────────────────────────────────────────────────────

export interface PurchaseResult {
  success: boolean;
  customerInfo: CustomerInfo | null;
  error?: string;
  userCancelled?: boolean;
}

function normalizePurchaseError(err: any): string {
  const rawCode = `${err?.code || ''}`.toUpperCase();
  const rawMessage = `${err?.message || ''}`;

  if (
    rawCode.includes('ITEM_UNAVAILABLE') ||
    /item.*(could not be found|not found|unavailable)/i.test(rawMessage)
  ) {
    return 'This product is not available on this device/account yet. On Android, install from Play Internal Testing with a licensed tester account.';
  }

  if (
    rawCode.includes('DEVELOPER_ERROR') ||
    /developer[_\s]?error/i.test(rawMessage)
  ) {
    return 'Billing configuration mismatch. Verify app signing, Play Console product setup, and that this build is installed from Play testing.';
  }

  if (
    rawCode.includes('BILLING_UNAVAILABLE') ||
    /billing.*(unavailable|not available|not supported)/i.test(rawMessage)
  ) {
    return 'In-app billing is unavailable on this device. Emulators and sideloaded APKs often cannot complete real Play purchases.';
  }

  return rawMessage || 'Purchase failed. Please try again.';
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
      error: 'Subscription packages are not available yet. This may be due to payment setup verification. Please try again later or contact support.',
    };
  }

  try {
    console.log('[Purchases] Starting purchase for package:', pkg.identifier);
    console.log('[Purchases] Package details:', {
      identifier: pkg.identifier,
      price: pkg.product.price,
      priceString: pkg.product.priceString,
    });
    
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro = !!customerInfo.entitlements.active[PRO_ENTITLEMENT];
    
    console.log('[Purchases] Purchase successful, isPro:', isPro);
    console.log('[Purchases] Customer info:', customerInfo.entitlements);
    
    return { success: isPro, customerInfo };
  } catch (err: any) {
    console.log('[Purchases] Purchase error:', err);
    console.log('[Purchases] Error details:', {
      code: err.code,
      message: err.message,
      userCancelled: err.userCancelled,
      underlyingError: err.underlyingError,
    });
    
    if (err.userCancelled) {
      return { success: false, customerInfo: null, userCancelled: true };
    }
    return {
      success: false,
      customerInfo: null,
      error: normalizePurchaseError(err),
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
