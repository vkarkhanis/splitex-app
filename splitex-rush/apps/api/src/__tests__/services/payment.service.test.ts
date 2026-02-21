import { PaymentService } from '../../services/payment.service';

describe('PaymentService', () => {
  const originalEnv = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...originalEnv };
    fetchMock = jest.fn();
    (global.fetch as any) = fetchMock;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should default to mock payments in non-production auto mode', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'auto';
    delete process.env.APP_ENV;
    process.env.NODE_ENV = 'test';

    const service = new PaymentService();
    const result = await service.startPayment(
      'stripe',
      { settlementId: 's-1', amount: 10, currency: 'USD', description: 'test' },
      { useRealGateway: false },
    );

    expect(result.provider).toBe('mock');
    expect(result.providerPaymentId).toContain('mock-pay-');
  });

  it('should stay mocked in non-prod auto mode even when useRealGateway=true without API opt-in', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'auto';
    process.env.NODE_ENV = 'development';
    process.env.PAYMENT_ALLOW_REAL_IN_NON_PROD = 'false';

    const service = new PaymentService();
    const result = await service.startPayment(
      'razorpay',
      { settlementId: 's-auto-1', amount: 10, currency: 'INR', description: 'test' },
      { useRealGateway: true },
    );

    expect(result.provider).toBe('mock');
  });

  it('should force mock payments when mode is mock', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'mock';
    process.env.NODE_ENV = 'production';

    const service = new PaymentService();
    const result = await service.startPayment(
      'razorpay',
      { settlementId: 's-2', amount: 20, currency: 'INR', description: 'test' },
      { useRealGateway: true },
    );

    expect(result.provider).toBe('mock');
  });

  it('should use live behavior in production auto mode', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'auto';
    process.env.NODE_ENV = 'production';
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    const service = new PaymentService();
    await expect(
      service.startPayment(
        'razorpay',
        { settlementId: 's-prod-1', amount: 25, currency: 'INR', description: 'test' },
        { useRealGateway: false },
      ),
    ).rejects.toThrow('Razorpay is not configured');
  });

  it('should allow opt-in live flow in non-prod when explicitly enabled', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'auto';
    process.env.NODE_ENV = 'development';
    process.env.PAYMENT_ALLOW_REAL_IN_NON_PROD = 'true';
    delete process.env.STRIPE_SECRET_KEY;

    const service = new PaymentService();
    await expect(
      service.startPayment(
        'stripe',
        { settlementId: 's-3', amount: 25, currency: 'USD', description: 'test' },
        { useRealGateway: true },
      ),
    ).rejects.toThrow('Stripe is not configured');
  });

  it('should create Stripe checkout session in live mode', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'live';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.PAYMENT_SUCCESS_URL = 'http://localhost:3000/success';
    process.env.PAYMENT_CANCEL_URL = 'http://localhost:3000/cancel';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc' }),
    });

    const service = new PaymentService();
    const result = await service.startPayment(
      'stripe',
      { settlementId: 's-live-1', amount: 12.34, currency: 'USD', description: 'stripe flow' },
      { useRealGateway: false },
    );

    expect(result.provider).toBe('stripe');
    expect(result.providerPaymentId).toBe('cs_test_abc');
    expect(result.checkoutUrl).toContain('checkout.stripe.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.stripe.com/v1/checkout/sessions');
  });

  it('should handle Stripe API error payloads', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'live';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'invalid_request' } }),
    });

    const service = new PaymentService();
    await expect(
      service.startPayment(
        'stripe',
        { settlementId: 's-live-2', amount: 10, currency: 'USD', description: 'stripe fail' },
        { useRealGateway: false },
      ),
    ).rejects.toThrow('Failed to create Stripe checkout session: invalid_request');
  });

  it('should create Razorpay payment link in live mode', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'live';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = 'secret_x';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'plink_1', short_url: 'https://rzp.io/i/test-link' }),
    });

    const service = new PaymentService();
    const result = await service.startPayment(
      'razorpay',
      { settlementId: 's-live-3', amount: 100, currency: 'INR', description: 'razorpay flow' },
      { useRealGateway: false },
    );

    expect(result.provider).toBe('razorpay');
    expect(result.providerPaymentId).toBe('plink_1');
    expect(result.checkoutUrl).toBe('https://rzp.io/i/test-link');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/payment_links');
  });

  it('should handle Razorpay API error payloads', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'live';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = 'secret_x';

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { description: 'bad_request_error' } }),
    });

    const service = new PaymentService();
    await expect(
      service.startPayment(
        'razorpay',
        { settlementId: 's-live-4', amount: 100, currency: 'INR', description: 'razorpay fail' },
        { useRealGateway: false },
      ),
    ).rejects.toThrow('Failed to create Razorpay payment link: bad_request_error');
  });

  it('should use default API error messages when gateway error body is empty', async () => {
    process.env.PAYMENT_GATEWAY_MODE = 'live';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = 'secret_x';

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const service = new PaymentService();
    await expect(
      service.startPayment(
        'razorpay',
        { settlementId: 's-live-5', amount: 100, currency: 'INR', description: 'razorpay default error' },
        { useRealGateway: false },
      ),
    ).rejects.toThrow('Razorpay API returned 503');
  });
});
