/**
 * What Pro includes on web (the Pro page and Help). It matches the mobile upgrade screen.
 * "Group pools" appears only once "Several of us" is released (design doc §12), so Pro never
 * advertises something users can't open yet.
 */
import { GROUP_POOLS_PRO_FEATURE, contributorPoolsAvailable } from '@traxettle/shared';

/** Production web builds set NEXT_PUBLIC_APP_ENV=production. */
export const GROUP_POOLS_RELEASED = contributorPoolsAvailable(process.env.NEXT_PUBLIC_APP_ENV);

export function proBadges(groupPools: boolean = GROUP_POOLS_RELEASED): string[] {
  return [
    'Unlimited events',
    'Multi-currency settlement',
    ...(groupPools ? [GROUP_POOLS_PRO_FEATURE.title] : []),
    'Analytics (coming soon)',
    'More power-user features',
  ];
}

/** Help's line about pooling: "Just me" is free; "Several of us" is Pro once released. */
export function poolingHelpLine(groupPools: boolean = GROUP_POOLS_RELEASED): string {
  return groupPools
    ? 'Pool money: fund a budget yourself ("Just me", free), or pool money with your group ("Several of us", Pro for the person who creates it; everyone else joins free)'
    : 'Pool money: fund a budget yourself ("Just me") and approve what the people you allow spend from it';
}
