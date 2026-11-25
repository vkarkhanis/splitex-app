/**
 * What Pro includes, as shown on the upgrade screen, the Profile row, after a purchase and in Help.
 * "Group pools" appears only when "Several of us" is released (`useContributorPoolsAvailable`,
 * design doc §12), so the lists never advertise something users can't open yet.
 */
import { GROUP_POOLS_PRO_FEATURE } from '@traxettle/shared';

export interface ProFeature {
  icon: string;
  title: string;
  desc: string;
}

const BASE_FEATURES: ProFeature[] = [
  {
    icon: '✨',
    title: 'No Ads — Even in Free Version',
    desc: 'Traxettle is completely ad-free. No banners, no pop-ups, no interruptions — ever.',
  },
  {
    icon: '📅',
    title: 'Unlimited Events',
    desc: 'Free plan is limited to 3 events. Go Pro for unlimited events.',
  },
  {
    icon: '💱',
    title: 'Multi-Currency Settlement',
    desc: 'Split expenses across currencies with automatic FX conversion at EOD rates.',
  },
  {
    icon: '📊',
    title: 'Analytics (Coming soon)',
    desc: 'We’re rebuilding analytics for a future major release to make it more accurate, more useful, and easier to understand.',
  },
  {
    icon: '⚡',
    title: 'Priority Support',
    desc: 'Get faster responses and early access to new features.',
  },
];

/** The upgrade screen's list: group pools go right after multi-currency when released. */
export function proFeatureList(groupPools: boolean): ProFeature[] {
  if (!groupPools) return BASE_FEATURES;
  const at = BASE_FEATURES.findIndex((f) => f.title === 'Multi-Currency Settlement') + 1;
  return [...BASE_FEATURES.slice(0, at), { icon: '👥', ...GROUP_POOLS_PRO_FEATURE }, ...BASE_FEATURES.slice(at)];
}

/** The Profile "Upgrade to Pro" row, before the price. */
export function proSummaryLine(groupPools: boolean): string {
  return groupPools ? 'Unlimited events, group pools, multi-currency & more' : 'Unlimited events, multi-currency & more';
}

/** Shown once a purchase is confirmed by the server. */
export function proReadyMessage(groupPools: boolean): string {
  return groupPools
    ? 'You now have access to all Pro features, including group pools and multi-currency settlement.'
    : 'You now have access to all Pro features including multi-currency settlement.';
}

/** The Help screen's pooling card. "Just me" budgets are free; "Several of us" is Pro once released. */
export function poolingHelpCard(groupPools: boolean): ProFeature & { tag?: string } {
  return groupPools
    ? {
      icon: '👛',
      title: 'Pool Money',
      desc: 'Collect money up front and spend from it. "Just me" budgets are free; "Several of us" pools (trip kitty, shared fund, club treasury, collection) need Pro for the person who creates them. Everyone else joins free.',
    }
    : {
      icon: '👛',
      title: 'Pool Money — Just Me',
      desc: 'Fund a budget yourself: the people you allow pay from it or claim their own money back, and you approve each spend.',
    };
}
