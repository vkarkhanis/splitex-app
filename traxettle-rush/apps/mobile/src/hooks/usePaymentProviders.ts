import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { api } from '../api';

export interface ProviderStatus {
  provider: string;
  enabled: boolean;
  mode: 'live' | 'test' | 'unavailable';
  reason?: string;
}

interface RazorpayOrderData {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  description: string;
  settlementId: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/**
 * Hook to manage payment provider availability and Razorpay checkout flow.
 */
export function usePaymentProviders() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await api.get<ProviderStatus[]>('/api/settlements/providers');
      setProviders(res.data || []);
    } catch {
      setProviders([]);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const getProvider = useCallback(
    (name: string) => providers.find((p) => p.provider === name),
    [providers],
  );

  const isProviderEnabled = useCallback(
    (name: string) => {
      const p = getProvider(name);
      return p?.enabled === true;
    },
    [getProvider],
  );

  /**
   * Full Razorpay checkout flow:
   * 1. Create order via API
   * 2. Open Razorpay native checkout sheet
   * 3. Verify payment signature via API
   *
   * Returns the updated settlement on success, or null on cancel/failure.
   */
  const payWithRazorpay = useCallback(
    async (
      settlementId: string,
      prefill?: { name?: string; email?: string; contact?: string },
    ): Promise<any | null> => {
      setLoading(true);
      try {
        // 1. Check provider availability
        const razorpay = getProvider('razorpay');
        if (!razorpay?.enabled) {
          Alert.alert(
            'Razorpay Unavailable',
            razorpay?.reason || 'Razorpay payments are not available right now.',
          );
          return null;
        }

        // 2. Create Razorpay order via API
        const orderRes = await api.post<RazorpayOrderData>(
          `/api/settlements/${settlementId}/create-razorpay-order`,
          {
            prefillName: prefill?.name,
            prefillEmail: prefill?.email,
            prefillContact: prefill?.contact,
          },
        );

        const order = orderRes.data;
        if (!order?.orderId || !order?.keyId) {
          throw new Error('Failed to create Razorpay order');
        }

        // 3. Open Razorpay native checkout
        let RazorpayCheckout: any;
        try {
          RazorpayCheckout = require('react-native-razorpay').default;
        } catch {
          Alert.alert(
            'Razorpay Not Available',
            'Razorpay native module is not installed. Please rebuild the app after adding react-native-razorpay.',
          );
          return null;
        }

        const options: Record<string, any> = {
          description: order.description,
          image: 'https://traxettle.com/icon.png',
          currency: order.currency,
          key: order.keyId,
          amount: order.amount,
          name: 'Traxettle',
          order_id: order.orderId,
          prefill: {
            email: order.prefill?.email || prefill?.email || '',
            contact: order.prefill?.contact || prefill?.contact || '',
            name: order.prefill?.name || prefill?.name || '',
          },
          theme: { color: '#0F766E' },
        };

        const checkoutResult: RazorpayCheckoutResponse = await RazorpayCheckout.open(options);

        // 4. Verify payment signature via API
        const verifyRes = await api.post(
          `/api/settlements/${settlementId}/verify-razorpay`,
          {
            razorpay_order_id: checkoutResult.razorpay_order_id,
            razorpay_payment_id: checkoutResult.razorpay_payment_id,
            razorpay_signature: checkoutResult.razorpay_signature,
          },
        );

        return verifyRes.data;
      } catch (error: any) {
        // Razorpay SDK returns an error object when user dismisses checkout
        if (error?.code === 'PAYMENT_CANCELLED' || error?.description?.includes('cancelled')) {
          // User cancelled — not an error
          return null;
        }
        const message =
          error?.description || error?.message || 'Payment failed. Please try again.';
        Alert.alert('Payment Failed', message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [getProvider],
  );

  return {
    providers,
    loading,
    fetchProviders,
    getProvider,
    isProviderEnabled,
    payWithRazorpay,
  };
}
