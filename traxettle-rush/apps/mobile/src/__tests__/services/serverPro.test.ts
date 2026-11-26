const mockGet = jest.fn();
jest.mock('../../api', () => ({ api: { get: (...args: unknown[]) => mockGet(...args) } }));

import { waitForServerPro, SERVER_PRO_WAIT_MS } from '../../services/serverPro';

const free = { data: { tier: 'free', entitlementStatus: 'active' } };
const pro = { data: { tier: 'pro', entitlementStatus: 'active' } };

/** Runs the wait to completion under fake timers. */
async function run(refreshProfile: jest.Mock) {
  const promise = waitForServerPro(refreshProfile);
  for (let i = 0; i < SERVER_PRO_WAIT_MS.length + 1; i += 1) {
    await jest.runOnlyPendingTimersAsync();
  }
  return promise;
}

describe('waitForServerPro', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGet.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it('returns at once when the server already has Pro, and refreshes the signed-in state', async () => {
    mockGet.mockResolvedValue(pro);
    const refreshProfile = jest.fn().mockResolvedValue(undefined);

    await expect(run(refreshProfile)).resolves.toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/api/users/profile');
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('keeps checking until RevenueCat\'s webhook reaches the server', async () => {
    mockGet.mockResolvedValueOnce(free).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(pro);
    const refreshProfile = jest.fn().mockResolvedValue(undefined);

    await expect(run(refreshProfile)).resolves.toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('gives up after about 15 seconds, still refreshing once', async () => {
    mockGet.mockResolvedValue(free);
    const refreshProfile = jest.fn().mockResolvedValue(undefined);

    await expect(run(refreshProfile)).resolves.toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(SERVER_PRO_WAIT_MS.length);
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    expect(SERVER_PRO_WAIT_MS.reduce((a, b) => a + b, 0)).toBe(15000);
  });

  it('treats a lapsed subscription (tier pro, status expired) as not Pro', async () => {
    mockGet.mockResolvedValue({ data: { tier: 'pro', entitlementStatus: 'expired' } });
    await expect(run(jest.fn().mockResolvedValue(undefined))).resolves.toBe(false);
  });
});
