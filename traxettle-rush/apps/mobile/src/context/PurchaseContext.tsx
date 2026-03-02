import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
} from '../services/purchases';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { ENV } from '../config/env';

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
  handlePurchase: async () => {},
  handleRestore: async () => {},
  refreshStatus: async () => {},
});

export const usePurchase = () => useContext(PurchaseContext);

export const PurchaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, tier } = useAuth();
  const [isPro, setIsPro] = useState(tier === 'pro');
  const [isReady, setIsReady] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [proPackage, setProPackage] = useState<PurchasesPackage | null>(null);
  const [storePriceString, setStorePriceString] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const priceString = storePriceString ?? fallbackPrice();

  // Keep in sync with AuthContext tier (server-side or local override)
  useEffect(() => {
    if (tier === 'pro') setIsPro(true);
  }, [tier]);

  // Initialise RevenueCat when user logs in
  useEffect(() => {
    let mounted = true;
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
        const pro = await hasProEntitlement();
        if (mounted) setIsPro(pro);

        // Fetch offerings for the paywall
        const off = await getProOffering();
        if (mounted && off) {
          setOffering(off);
          const pkg = await getProPackage();
          setProPackage(pkg);
          if (pkg?.product?.priceString) {
            setStorePriceString(pkg.product.priceString);
          }
        }

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
    return () => { mounted = false; };
  }, [user?.userId]);

  // Log out from RevenueCat when user logs out
  useEffect(() => {
    if (!user) {
      logoutPurchaseUser().catch(() => {});
      setIsPro(false);
      setIsReady(false);
    }
  }, [user]);

  const refreshStatus = useCallback(async () => {
    if (!isPurchasesConfigured()) return;
    const pro = await hasProEntitlement();
    setIsPro(pro);
  }, []);

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
        Alert.alert('🎉 Welcome to Pro!', 'You now have access to all Pro features including multi-currency settlement.');
      } else if (result.error) {
        Alert.alert('Purchase Failed', result.error);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong.');
    } finally {
      setPurchasing(false);
    }
  }, []);

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
        Alert.alert('Restored!', 'Your Pro purchase has been restored.');
      } else {
        Alert.alert('No Purchase Found', 'We could not find a previous Pro purchase for this account.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Restore failed.');
    } finally {
      setPurchasing(false);
    }
  }, []);

  return (
    <PurchaseContext.Provider
      value={{
        isPro,
        isReady,
        purchasing,
        offering,
        proPackage,
        priceString,
        handlePurchase,
        handleRestore,
        refreshStatus,
      }}
    >
      {children}
    </PurchaseContext.Provider>
  );
};
