import { clearTokens, setStagingModeEnabled } from '../api';
import { clearRuntimeConfigCache } from '../config/runtime';
import { resetFirebase } from './firebase';
import { requestAppRebootstrap } from './app-rebootstrap';

export async function switchEnvironmentAndRebootstrap(useStaging: boolean): Promise<void> {
  await setStagingModeEnabled(useStaging);
  await clearTokens();
  await clearRuntimeConfigCache();
  await resetFirebase();
  requestAppRebootstrap();
}
