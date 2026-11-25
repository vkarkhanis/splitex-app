import React from 'react';
import { act, create } from 'react-test-renderer';

const mockStaging = jest.fn();
jest.mock('../api', () => ({ isStagingModeEnabled: () => mockStaging() }));
const mockEnv = { APP_ENV: 'production' };
jest.mock('../config/env', () => ({ ENV: mockEnv }));

import { poolingHelpCard, proFeatureList, proReadyMessage, proSummaryLine } from '../utils/proFeatures';
import { useContributorPoolsAvailable } from '../hooks/useContributorPoolsAvailable';

describe('Pro features on mobile (design doc §12)', () => {
  it('adds group pools after the currency features only once released', () => {
    expect(proFeatureList(false).map((f) => f.title)).toEqual([
      'No Ads — Even in Free Version', 'Unlimited Events', 'Multi-Currency Settlement', 'Expenses in Another Currency', 'Analytics (Coming soon)', 'Priority Support',
    ]);
    const released = proFeatureList(true);
    expect(released.map((f) => f.title)).toEqual([
      'No Ads — Even in Free Version', 'Unlimited Events', 'Multi-Currency Settlement', 'Expenses in Another Currency', 'Group pools', 'Analytics (Coming soon)', 'Priority Support',
    ]);
    expect(released[4].desc).toMatch(/trip kitty, shared fund, club treasury or collection\. Choose who can spend and who approves/);
  });

  it('says that entering another currency comes from the organiser, for everyone in the event', () => {
    const other = proFeatureList(true).find((f) => f.title === 'Expenses in Another Currency')!;
    expect(other.desc).toMatch(/converted to the event’s currency\. Everyone in the events you create can use it/);
  });

  it('words the Profile row, the purchase message and Help to match', () => {
    expect(proSummaryLine(false)).toBe('Unlimited events, multi-currency & more');
    expect(proSummaryLine(true)).toBe('Unlimited events, group pools, multi-currency & more');
    expect(proReadyMessage(false)).toMatch(/including multi-currency settlement/);
    expect(proReadyMessage(true)).toMatch(/including group pools, multi-currency settlement and expenses in other currencies/);
    expect(poolingHelpCard(false).desc).not.toMatch(/Pro/);
    expect(poolingHelpCard(true).desc).toMatch(/need Pro for the person who creates them/);
    expect(poolingHelpCard(true).desc).toMatch(/choose who spends and who approves/);
  });
});

describe('useContributorPoolsAvailable', () => {
  let value: boolean | undefined;
  function Probe() {
    value = useContributorPoolsAvailable();
    return null;
  }
  const render = async () => {
    await act(async () => { create(<Probe />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };

  it('is on in production now that group pools are released', async () => {
    mockStaging.mockResolvedValue(false);
    await render();
    expect(value).toBe(true);
  });

  it('is on when a tester switches a release build to staging', async () => {
    mockStaging.mockResolvedValue(true);
    await render();
    expect(value).toBe(true);
  });

  it('is on in staging builds, and stays put if the switch check fails', async () => {
    mockEnv.APP_ENV = 'staging';
    mockStaging.mockRejectedValue(new Error('storage'));
    await render();
    expect(value).toBe(true);
    mockEnv.APP_ENV = 'production';
  });
});
