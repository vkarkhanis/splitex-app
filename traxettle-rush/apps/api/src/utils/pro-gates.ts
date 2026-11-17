import type { ApiResponse } from '@traxettle/shared';
import { EntitlementService } from '../services/entitlement.service';

const entitlementService = new EntitlementService();

/**
 * Only the person creating a group ("Several of us") pool needs Pro (design doc §12): null when
 * they have it, otherwise the 403 body the apps turn into "Group pools are a Pro feature".
 * A lapsed subscription counts as free (hasActivePro); grace period counts as Pro.
 */
export async function groupPoolRefusal(uid: string): Promise<ApiResponse | null> {
  try {
    await entitlementService.assertCapability(uid, 'contributorPools');
    return null;
  } catch (err: any) {
    if (err?.errorCode !== 'FEATURE_REQUIRES_PRO') throw err;
    return {
      success: false,
      error: 'Group pools ("Several of us") require Pro',
      code: 'FEATURE_REQUIRES_PRO',
      feature: 'contributor_pools',
    } as ApiResponse;
  }
}
