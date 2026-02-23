type PaymentProvider = 'razorpay' | 'stripe' | 'mock';
type PaymentGatewayMode = 'auto' | 'mock' | 'live';

interface StartPaymentInput {
  settlementId: string;
  amount: number;
  currency: string;
  description: string;
}

interface StartPaymentOptions {
  useRealGateway?: boolean;
}

export interface StartPaymentResult {
  provider: PaymentProvider;
  providerPaymentId: string;
  checkoutUrl?: string;
}

function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export class PaymentService {
  private readonly paymentGatewayMode: PaymentGatewayMode =
    (process.env.PAYMENT_GATEWAY_MODE as PaymentGatewayMode) || 'auto';

  private readonly allowRealGatewayInNonProd = parseBooleanEnv(
    process.env.PAYMENT_ALLOW_REAL_IN_NON_PROD,
    false,
  );

  private shouldUseMockGateway(useRealGateway = false): boolean {
    if (this.paymentGatewayMode === 'mock') return true;
    if (this.paymentGatewayMode === 'live') return false;

    // AUTO mode:
    // - Production defaults to live gateway
    // - Non-production defaults to mock unless explicitly opted-in
    const runtimeEnv = (process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV || '').toLowerCase();
    const isProductionRuntime = runtimeEnv === 'production';
    if (isProductionRuntime) return false;

    if (useRealGateway && this.allowRealGatewayInNonProd) {
      return false;
    }

    return true;
  }

  async startPayment(
    provider: 'razorpay' | 'stripe',
    input: StartPaymentInput,
    options: StartPaymentOptions = {},
  ): Promise<StartPaymentResult> {
    if (this.shouldUseMockGateway(options.useRealGateway)) {
      return {
        provider: 'mock',
        providerPaymentId: `mock-pay-${Date.now()}`,
      };
    }

    if (provider === 'razorpay') {
      return this.createRazorpayPaymentLink(input);
    }
    return this.createStripeCheckoutSession(input);
  }

  private async createRazorpayPaymentLink(input: StartPaymentInput): Promise<StartPaymentResult> {
    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!keyId || !keySecret) {
      throw new Error('Razorpay is not configured: missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET');
    }

    const amountInMinorUnit = Math.round(input.amount * 100);
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInMinorUnit,
        currency: input.currency,
        description: input.description,
        reference_id: input.settlementId,
        accept_partial: false,
      }),
    });

    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) {
      const message = payload?.error?.description || payload?.error || `Razorpay API returned ${response.status}`;
      throw new Error(`Failed to create Razorpay payment link: ${message}`);
    }

    return {
      provider: 'razorpay',
      providerPaymentId: String(payload.id || `razorpay-${Date.now()}`),
      checkoutUrl: payload.short_url || payload.url,
    };
  }

  private async createStripeCheckoutSession(input: StartPaymentInput): Promise<StartPaymentResult> {
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    if (!secretKey) {
      throw new Error('Stripe is not configured: missing STRIPE_SECRET_KEY');
    }

    const successUrl = process.env.PAYMENT_SUCCESS_URL || 'http://localhost:3000/payment/success';
    const cancelUrl = process.env.PAYMENT_CANCEL_URL || 'http://localhost:3000/payment/cancel';
    const amountInMinorUnit = Math.round(input.amount * 100);

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', `${successUrl}?settlementId=${encodeURIComponent(input.settlementId)}&session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${cancelUrl}?settlementId=${encodeURIComponent(input.settlementId)}`);
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', input.currency.toLowerCase());
    params.append('line_items[0][price_data][unit_amount]', String(amountInMinorUnit));
    params.append('line_items[0][price_data][product_data][name]', `Traxettle settlement ${input.settlementId}`);
    params.append('metadata[settlementId]', input.settlementId);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) {
      const message = payload?.error?.message || `Stripe API returned ${response.status}`;
      throw new Error(`Failed to create Stripe checkout session: ${message}`);
    }

    return {
      provider: 'stripe',
      providerPaymentId: String(payload.id || `stripe-${Date.now()}`),
      checkoutUrl: payload.url,
    };
  }
}
