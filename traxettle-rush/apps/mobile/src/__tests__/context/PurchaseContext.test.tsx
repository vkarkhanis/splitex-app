/**
 * The free-trial offer through PurchaseProvider to the Upgrade to Pro screen (plan §10A.2):
 * worked out once the package loads, and again after a purchase or any customer-info change,
 * because eligibility ends once someone subscribes.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native', () => {
  const R = require('react');
  const host = (name: string) => (props: any) => R.createElement(name, props, props.children);
  return {
    View: host('View'),
    Text: host('Text'),
    ScrollView: host('ScrollView'),
    TouchableOpacity: host('TouchableOpacity'),
    ActivityIndicator: host('ActivityIndicator'),
    Linking: { openURL: jest.fn() },
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios' },
    StyleSheet: { create: (s: any) => s },
  };
});
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#123456' }) } }),
}));
let mockUser: { userId: string } | null = { userId: 'u1' };
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, tier: 'free', refreshProfile: jest.fn() }),
}));
jest.mock('../../config/env', () => ({ ENV: { APP_ENV: 'local' } }));
jest.mock('../../hooks/useContributorPoolsAvailable', () => ({ useContributorPoolsAvailable: () => true }));
jest.mock('../../services/serverPro', () => ({ waitForServerPro: jest.fn().mockResolvedValue(true) }));

const pkg = { identifier: '$rc_annual', product: { identifier: 'traxettle_pro_yearly', priceString: '₹999' } };
let mockCustomerInfoListener: (() => void) | null = null;
const mockStopListening = jest.fn();
const mockServices = {
  initPurchases: jest.fn().mockResolvedValue(undefined),
  loginPurchaseUser: jest.fn().mockResolvedValue({}),
  logoutPurchaseUser: jest.fn().mockResolvedValue(undefined),
  hasProEntitlement: jest.fn().mockResolvedValue(false),
  getProOffering: jest.fn().mockResolvedValue({ identifier: 'default' }),
  getProPackage: jest.fn().mockResolvedValue(pkg),
  purchasePro: jest.fn(),
  restorePurchases: jest.fn(),
  isPurchasesConfigured: jest.fn(() => true),
  getPurchasesConfigDebug: jest.fn(),
  getIntroOffer: jest.fn(),
  onCustomerInfoChanged: jest.fn((listener: () => void) => { mockCustomerInfoListener = listener; return mockStopListening; }),
};
jest.mock('../../services/purchases', () => mockServices);

import { PurchaseProvider } from '../../context/PurchaseContext';
import ProUpgradeScreen from '../../screens/ProUpgradeScreen';

const weekFree = { price: 0, priceString: '₹0', cycles: 1, periodUnit: 'WEEK', periodNumberOfUnits: 1 };
const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map((c) => textOf(c as any)).join('');
let renderer: ReactTestRenderer;
const byId = (id: string) => renderer.root.findAll((n) => n.props.testID === id && typeof n.type === 'string')[0];
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function tree() {
  return (
    <PurchaseProvider>
      <ProUpgradeScreen navigation={{ goBack: jest.fn() }} />
    </PurchaseProvider>
  );
}

async function mount() {
  await act(async () => { renderer = create(tree()); });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { userId: 'u1' };
  mockCustomerInfoListener = null;
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { act(() => renderer?.unmount()); });

describe('PurchaseProvider: free trial', () => {
  it('offers the trial to someone who can get it', async () => {
    mockServices.getIntroOffer.mockResolvedValue(weekFree);
    await mount();
    expect(mockServices.getIntroOffer).toHaveBeenCalledWith(pkg);
    expect(textOf(byId('pro-upgrade-purchase-button'))).toBe('Start free trial');
    expect(textOf(byId('pro-upgrade-intro-offer'))).toBe('Free for your first week, then ₹999/year.');
  });

  it('shows the normal price when the store says no offer applies', async () => {
    mockServices.getIntroOffer.mockResolvedValue(null);
    await mount();
    expect(textOf(byId('pro-upgrade-purchase-button'))).toBe('Subscribe for ₹999/year');
    expect(byId('pro-upgrade-intro-offer')).toBeUndefined();
  });

  it('checks again when RevenueCat reports a change, and stops listening on unmount', async () => {
    mockServices.getIntroOffer.mockResolvedValue(weekFree);
    await mount();
    mockServices.getIntroOffer.mockResolvedValue(null);
    await act(async () => { mockCustomerInfoListener?.(); });
    await flush();
    expect(textOf(byId('pro-upgrade-purchase-button'))).toBe('Subscribe for ₹999/year');
    act(() => renderer.unmount());
    expect(mockStopListening).toHaveBeenCalled();
  });

  it('checks again after a purchase', async () => {
    mockServices.getIntroOffer.mockResolvedValue(weekFree);
    mockServices.purchasePro.mockResolvedValue({ success: true, customerInfo: {} });
    await mount();
    mockServices.getIntroOffer.mockClear();
    await act(async () => { byId('pro-upgrade-purchase-button').props.onPress(); });
    await flush();
    expect(mockServices.getIntroOffer).toHaveBeenCalledWith(pkg);
  });

  it('forgets the offer when the user signs out', async () => {
    mockServices.getIntroOffer.mockResolvedValue(weekFree);
    await mount();
    mockUser = null;
    await act(async () => { renderer.update(tree()); });
    await flush();
    expect(textOf(byId('pro-upgrade-purchase-button'))).toBe('Subscribe for ₹999/year');
  });
});
