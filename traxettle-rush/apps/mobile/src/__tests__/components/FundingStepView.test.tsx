/**
 * The create-event funding step (design doc §12): for someone without Pro, "Several of us" is shown
 * locked. It can't be picked, and tapping it explains how to get Pro.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { DEFAULT_FUNDING_CHOICE } from '@traxettle/shared';
import type { FundingChoice } from '@traxettle/shared';

jest.mock('react-native', () => {
  const R = require('react');
  const host = (name: string) => (props: any) => R.createElement(name, props, props.children);
  return {
    View: host('View'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    TouchableOpacity: host('TouchableOpacity'),
    ActivityIndicator: host('ActivityIndicator'),
    Linking: { openURL: jest.fn() },
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios' },
    StyleSheet: { create: (s: any) => s, hairlineWidth: 1, flatten: (s: any) => s },
  };
});
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn(), EncodingType: { Base64: 'base64' } }));
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#123456' }) } }),
}));
jest.mock('../../services/pool', () => ({ poolService: {}, pickReceiptImage: jest.fn() }));
jest.mock('../../api', () => ({ getResolvedApiBaseUrl: async () => 'http://api.test' }));

import { FundingStepView } from '../../components/pool/PoolViews';

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map((c) => textOf(c as any)).join('');
let renderer: ReactTestRenderer;
const byId = (id: string) => renderer.root.findAll((n) => n.props.testID === id && typeof n.type === 'string')[0];
let latest: FundingChoice = DEFAULT_FUNDING_CHOICE;
const onUpgrade = jest.fn();

function Harness({ locked }: { locked: boolean }) {
  const [value, setValue] = React.useState<FundingChoice>(DEFAULT_FUNDING_CHOICE);
  latest = value;
  return <FundingStepView value={value} onChange={setValue} currency="INR" allowContributorPools contributorPoolsLocked={locked} onUpgrade={onUpgrade} />;
}

async function mount(locked: boolean) {
  await act(async () => { renderer = create(<Harness locked={locked} />); });
  await act(async () => { byId('funding-pool').props.onPress(); });
}

afterEach(() => { act(() => renderer?.unmount()); jest.clearAllMocks(); });

describe('FundingStepView — "Several of us" for someone without Pro', () => {
  it('starts Pool money on "Just me" and shows "Several of us" locked and marked Pro', async () => {
    await mount(true);
    expect(latest.funder).toBe('sponsor');
    const card = byId('funder-contributors');
    expect(card.props.accessibilityState).toEqual({ selected: false });
    expect(card.props.accessibilityHint).toBe('Pro feature. Shows how to get Pro.');
    expect(textOf(byId('funder-contributors-pro')).trim()).toBe('PRO');
    expect(textOf(byId('funder-contributors-locked'))).toBe('🔒 Pro feature');
    expect(byId('funding-pro-notice')).toBeUndefined();
  });

  it("can't be picked: tapping it explains Pro and offers the upgrade instead", async () => {
    await mount(true);
    await act(async () => { byId('funder-contributors').props.onPress(); });
    expect(latest.funder).toBe('sponsor');
    expect(byId('preset-trip_kitty')).toBeUndefined();
    expect(textOf(byId('funding-pro-notice'))).toMatch(/Group pools are a Pro feature. Only you need Pro/);
    await act(async () => { byId('funding-upgrade').props.onPress(); });
    expect(onUpgrade).toHaveBeenCalled();
    await act(async () => { byId('funder-sponsor').props.onPress(); });
    expect(byId('funding-pro-notice')).toBeUndefined();
  });
});

describe('FundingStepView — with Pro', () => {
  it('lets them pick "Several of us" and its kind of pool, with no Pro marks', async () => {
    await mount(false);
    await act(async () => { byId('funder-contributors').props.onPress(); });
    expect(latest.funder).toBe('contributors');
    expect(byId('funder-contributors-pro')).toBeUndefined();
    expect(byId('funder-contributors-locked')).toBeUndefined();
    expect(byId('funding-pro-notice')).toBeUndefined();
    expect(byId('preset-trip_kitty')).toBeDefined();
  });
});
