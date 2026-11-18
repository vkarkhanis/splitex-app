import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import {
  initPurchases,
  loginPurchaseUser,
  logoutPurchaseUser,
  hasProEntitlement,
  getProOffering,
  getProPackage,
  purchasePro,
  restorePurchases,
  isPurchasesConfigured,
  getPurchasesConfigDebug,
  getIntroOffer,
  onCustomerInfoChanged,
} from '../services/purchases';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { ENV } from '../config/env';
import { waitForServerPro } from '../services/serverPro';
import { proReadyMessage } from '../utils/proFeatures';
import type { IntroOffer } from '../utils/subscriptionTerms';
import { useContributorPoolsAvailable } from '../hooks/useContributorPoolsAvailable';

interface PurchaseContextType {
  /** Whether the user has an active Pro entitlement via RevenueCat */
  isPro: boolean;
  /** Whether RevenueCat SDK is configured and ready */
  isReady: boolean;
  /** Whether a purchase/restore operation is in progress */
  purchasing: boolean;
  /** Current offering from RevenueCat */
  offering: PurchasesOffering | null;
  /** The Pro upgrade package (lifetime/one-time) */
  proPackage: PurchasesPackage | null;
  /** Localised price string from the store (e.g. "₹199.00" or "$9.99") */
  priceString: string;
  /**
   * The free trial or first-period price this user would get, or null to show the normal
   * price. On iOS only when Apple still offers it to this account (plan §10A).
   */
  introOffer: IntroOffer | null;
  /** Purchase the Pro upgrade */
  handlePurchase: () => Promise<void>;
  /** Restore previous purchases */
  handleRestore: () => Promise<void>;
  /** Refresh entitlement status */
  refreshStatus: () => Promise<void>;
}

function isIndiaLocale(): boolean {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const normalized = locale.replace('_', '-').toUpperCase();
    return normalized.endsWith('-IN');
  } catch {
    return false;
  }
}

function fallbackPrice(): string {
  return isIndiaLocale() ? '₹299' : '$5.99';
}

const PRO_PENDING =
  'Your purchase is complete. Pro features are being switched on and should be ready in a moment. ' +
  'If a Pro feature still looks locked, close and reopen the app.';

function resolveRevenueCatAppUserId(userId: string): string {
  const envTag = (ENV.APP_ENV || 'local').toLowerCase();
  return `${envTag}::${userId}`;
}

const PurchaseContext = createContext<PurchaseContextType>({
  isPro: false,
  isReady: false,
  purchasing: false,
  offering: null,
  proPackage: null,
  priceString: '$5.99',
  introOffer: null,
  handlePurchase: async () => {},
  handleRestore: async () => {},
  refreshStatus: async () => {},
});

export const usePurchase = () => useContext(PurchaseContext);

export const PurchaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, tier, refreshProfile } = useAuth();
  const [isPro, setIsPro] = useState(tier === 'pro');
  const groupPoolsReleased = useContributorPoolsAvailable();
  const [isReady, setIsReady] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [proPackage, setProPackage] = useState<PurchasesPackage | null>(null);
  const [storePriceString, setStorePriceString] = useState<string | null>(null);
  const [introOffer, setIntroOffer] = useState<IntroOffer | null>(null);
  const proPackageRef = useRef<PurchasesPackage | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const priceString = storePriceString ?? fallbackPrice();

  // Note: We don't sync with tier alone - both RevenueCat AND server must agree

  // Eligibility for the free trial ends once someone subscribes, so this runs again after a
  // purchase, a restore, or any change RevenueCat reports.
  const refreshIntroOffer = useCallback(async () => {
    setIntroOffer(await getIntroOffer(proPackageRef.current));
  }, []);

  // Initialise RevenueCat when user logs in
  useEffect(() => {
    let mounted = true;
    let stopListening: (() => void) | null = null;
    async function init() {
      if (!user?.userId) return;
      try {
        const rcAppUserId = resolveRevenueCatAppUserId(user.userId);
        await initPurchases(rcAppUserId);
        if (!isPurchasesConfigured()) {
          // SDK not configured (missing API key) — fall back to tier from server
          if (mounted) setIsReady(false);
          return;
        }
        setInitError(null);

        await loginPurchaseUser(rcAppUserId);
        
        const revenueCatPro = await hasProEntitlement();
        
        // Both RevenueCat AND server must agree for pro status
        const pro = tier === 'pro' && revenueCatPro;
        
        console.log('[PurchaseProvider] isPro determination:', {
          tier,
          revenueCatEntitlement: revenueCatPro,
          finalIsPro: pro,
          bothAgree: tier === 'pro' && revenueCatPro
        });
        if (mounted) setIsPro(pro);

        // Fetch offerings for the paywall
        const off = await getProOffering();
        if (mounted && off) {
          setOffering(off);
          const pkg = await getProPackage();
          setProPackage(pkg);
          proPackageRef.current = pkg;
          if (pkg?.product?.priceString) {
            setStorePriceString(pkg.product.priceString);
          }
          const offer = await getIntroOffer(pkg);
          if (mounted) setIntroOffer(offer);
        }

        if (mounted) stopListening = onCustomerInfoChanged(() => { refreshIntroOffer().catch(() => {}); });

        if (mounted) setIsReady(true);
      } catch (err) {
        console.warn('[PurchaseProvider] init error:', err);
        if (mounted) {
          const msg = err instanceof Error ? err.message : 'Unknown initialization error';
          setInitError(msg);
        }
      }
    }
    init();
    return () => {
      mounted = false;
      stopListening?.();
    };
  }, [user?.userId]);

  // Log out from RevenueCat when user logs out
  useEffect(() => {
    if (!user) {
      logoutPurchaseUser().catch(() => {});
      setIsPro(false);
      setIsReady(false);
      setIntroOffer(null);
    }
  }, [user]);

  const refreshStatus = useCallback(async () => {
    if (!isPurchasesConfigured()) return;
    const revenueCatPro = await hasProEntitlement();
    // Both RevenueCat AND server must agree for pro status
    const pro = tier === 'pro' && revenueCatPro;
    setIsPro(pro);
    await refreshIntroOffer();
  }, [tier, refreshIntroOffer]);

  const handlePurchase = useCallback(async () => {
    if (!isPurchasesConfigured()) {
      if (user?.userId) {
        const rcAppUserId = resolveRevenueCatAppUserId(user.userId);
        try {
          await initPurchases(rcAppUserId);
          if (isPurchasesConfigured()) {
            await loginPurchaseUser(rcAppUserId);
            setInitError(null);
          }
        } catch (err: any) {
          setInitError(err?.message || 'RevenueCat initialization failed');
        }
      }
    }

    if (!isPurchasesConfigured()) {
      const debug = getPurchasesConfigDebug();
      Alert.alert(
        'Not Available',
        initError ||
          `In-app purchases are not configured (platform=${debug.platform}, keyPresent=${debug.keyPresent}, keyPrefix=${debug.keyPrefix || 'none'}).`,
      );
      return;
    }

    setPurchasing(true);
    try {
      const result = await purchasePro();
      if (result.userCancelled) {
        // User cancelled — do nothing
      } else if (result.success) {
        setIsPro(true);
        refreshIntroOffer().catch(() => {});
        const serverPro = await waitForServerPro(refreshProfile);
        Alert.alert('🎉 Welcome to Pro!', serverPro ? proReadyMessage(groupPoolsReleased) : PRO_PENDING);
      } else if (result.error) {
        Alert.alert('Purchase Failed', result.error);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong.');
    } finally {
      setPurchasing(false);
    }
  }, [refreshProfile, groupPoolsReleased, initError, user?.userId, refreshIntroOffer]);

  const handleRestore = useCallback(async () => {
    if (!isPurchasesConfigured()) {
      Alert.alert('Not Available', 'In-app purchases are not configured yet.');
      return;
    }

    setPurchasing(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        setIsPro(true);
        refreshIntroOffer().catch(() => {});
        const serverPro = await waitForServerPro(refreshProfile);
        Alert.alert('Restored!', serverPro ? 'Your Pro purchase has been restored.' : PRO_PENDING);
      } else {
        Alert.alert('No Purchase Found', 'We could not find a previous Pro purchase for this account.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Restore failed.');
    } finally {
      setPurchasing(false);
    }
  }, [refreshProfile, refreshIntroOffer]);

  return (
    <PurchaseContext.Provider
      value={{
        isPro,
        isReady,
        purchasing,
        offering,
        proPackage,
        priceString,
        introOffer,
        handlePurchase,
        handleRestore,
        refreshStatus,
      }}
    >
      {children}
    </PurchaseContext.Provider>
  );
};
