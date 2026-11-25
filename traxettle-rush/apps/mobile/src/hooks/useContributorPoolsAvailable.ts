import { useEffect, useState } from 'react';
import { contributorPoolsAvailable } from '@traxettle/shared';
import { isStagingModeEnabled } from '../api';
import { ENV } from '../config/env';

/**
 * Whether "Several of us" pools are released here (design doc §12). Release builds are
 * "production" even when a tester switches the app to Staging, so the runtime switch decides:
 * on staging they're visible, in production only once `CONTRIBUTOR_POOLS_IN_PRODUCTION` is on.
 * Pro lists mention group pools only where this is true, so Pro never advertises them early.
 */
export function useContributorPoolsAvailable(): boolean {
  const [stagingMode, setStagingMode] = useState(false);
  useEffect(() => {
    isStagingModeEnabled().then(setStagingMode).catch(() => {});
  }, []);
  return contributorPoolsAvailable(stagingMode ? 'staging' : ENV.APP_ENV);
}
