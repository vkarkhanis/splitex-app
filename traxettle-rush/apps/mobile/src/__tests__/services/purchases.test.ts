/**
 * Free-trial eligibility (plan §10A.2): iOS asks RevenueCat whether this account can still get
 * Apple's introductory offer; Android reads the offer Google returned and makes no call.
 */
const mockPlatform = { OS: 'ios' };
jest.mock('react-native', () => ({ Platform: mockPlatform }));
const mockPurchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn(),
  checkTrialOrIntroductoryPriceEligibility: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(),
  removeCustomerInfoUpdateListener: jest.fn(),
};
jest.mock('react-native-purchases', () => ({ __esModule: true, default: mockPurchases, LOG_LEVEL: { DEBUG: 'DEBUG' } }));
jest.mock('../../config/env', () => ({ ENV: { REVENUECAT_PRO_ENTITLEMENT_ID: 'pro', REVENUECAT_OFFERING_ID: 'default' } }));
jest.mock('../../config/runtime', () => ({
  getLatestRuntimeConfig: async () => ({
    revenueCatConfig: { appleApiKey: 'appl_test', googleApiKey: 'goog_test', proEntitlement: 'pro', offering: 'default' },
  }),
}));

import { getIntroOffer, initPurchases, onCustomerInfoChanged } from '../../services/purchases';

(global as any).__DEV__ = false;
const weekFree = { price: 0, priceString: '₹0', cycles: 1, period: 'P1W', periodUnit: 'WEEK', periodNumberOfUnits: 1 };
const pkg = (product: Record<string, unknown>) => ({ identifier: '$rc_annual', product: { identifier: 'traxettle_pro_yearly', ...product } }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.OS = 'ios';
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('getIntroOffer', () => {
  it('shows Apple\'s trial when this account is eligible', async () => {
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({ traxettle_pro_yearly: { status: 2, description: '' } });
    await expect(getIntroOffer(pkg({ introPrice: weekFree }))).resolves.toBe(weekFree);
    expect(mockPurchases.checkTrialOrIntroductoryPriceEligibility).toHaveBeenCalledWith(['traxettle_pro_yearly']);
  });

  it('shows the normal price on iOS when the account had the offer, or the check fails', async () => {
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({ traxettle_pro_yearly: { status: 1, description: '' } });
    await expect(getIntroOffer(pkg({ introPrice: weekFree }))).resolves.toBeNull();
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({});
    await expect(getIntroOffer(pkg({ introPrice: weekFree }))).resolves.toBeNull();
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockRejectedValue(new Error('offline'));
    await expect(getIntroOffer(pkg({ introPrice: weekFree }))).resolves.toBeNull();
  });

  it('skips the iOS check when the store has no offer', async () => {
    await expect(getIntroOffer(pkg({ introPrice: null }))).resolves.toBeNull();
    await expect(getIntroOffer(null)).resolves.toBeNull();
    expect(mockPurchases.checkTrialOrIntroductoryPriceEligibility).not.toHaveBeenCalled();
  });

  it('reads Google Play\'s free phase on Android without an eligibility call', async () => {
    mockPlatform.OS = 'android';
    const freePhase = {
      billingPeriod: { unit: 'DAY', value: 7, iso8601: 'P7D' },
      billingCycleCount: 1,
      price: { amountMicros: 0, formatted: 'Free', currencyCode: 'INR' },
    };
    const offer = await getIntroOffer(pkg({ introPrice: null, defaultOption: { freePhase, introPhase: null } }));
    expect(offer).toEqual({ price: 0, priceString: 'Free', periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 });
    expect(mockPurchases.checkTrialOrIntroductoryPriceEligibility).not.toHaveBeenCalled();
  });
});

describe('onCustomerInfoChanged', () => {
  it('does nothing before RevenueCat is set up, then adds and removes the listener', async () => {
    const listener = jest.fn();
    onCustomerInfoChanged(listener)();
    expect(mockPurchases.addCustomerInfoUpdateListener).not.toHaveBeenCalled();

    await initPurchases('local::u1');
    const stop = onCustomerInfoChanged(listener);
    expect(mockPurchases.addCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
    stop();
    expect(mockPurchases.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
  });
});
