import { hasActivePro } from '@traxettle/shared';
import { api } from '../api';

/** Pauses between profile checks while waiting for the server; about 15 seconds in total. */
export const SERVER_PRO_WAIT_MS = [0, 1500, 3000, 4500, 6000];

/**
 * After a store purchase or restore, the server hears about it from RevenueCat's webhook a few
 * seconds later, and Pro features (unlimited events, multi-currency) follow the server. Wait for
 * it by re-reading the profile, then refresh the signed-in state so the buyer can use Pro straight
 * away. Returns false if the server hasn't caught up in time (the app refreshes again whenever it
 * comes back to the foreground).
 */
export async function waitForServerPro(refreshProfile: () => Promise<void>): Promise<boolean> {
  for (const delayMs of SERVER_PRO_WAIT_MS) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const { data } = await api.get<{ tier?: string; entitlementStatus?: string }>('/api/users/profile');
      if (hasActivePro(data ?? {})) {
        await refreshProfile();
        return true;
      }
    } catch {
      // Keep waiting; a transient network error shouldn't end the wait.
    }
  }
  await refreshProfile().catch(() => {});
  return false;
}
