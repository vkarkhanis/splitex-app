/**
 * Copy and links shown with the Pro subscription. App Review (Guideline 3.1.2)
 * requires the price, renewal terms, and links to the Terms of Use and Privacy
 * Policy next to an auto-renewable subscription. Prices come from the store so
 * the screen never disagrees with what the user is charged.
 */
import type { PurchasesIntroPrice } from 'react-native-purchases';

export const PRIVACY_POLICY_URL = 'https://traxettle-prod.web.app/privacy.html';
/** Apple's standard licensed application EULA, used as the app's Terms of Use on iOS. */
export const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export type IntroOffer = Pick<PurchasesIntroPrice, 'price' | 'priceString' | 'cycles' | 'periodUnit' | 'periodNumberOfUnits'>;

/** How long an introductory price lasts: "first year", "first 3 months". */
export function introPeriodLabel(intro: IntroOffer): string {
  const count = Math.max(1, intro.periodNumberOfUnits) * Math.max(1, intro.cycles);
  const unit = intro.periodUnit.toLowerCase();
  return count === 1 ? `first ${unit}` : `first ${count} ${unit}s`;
}

/** The introductory-offer line under the price, or null when the store has no offer. */
export function introOfferText(intro: IntroOffer | null | undefined, renewalPrice: string): string | null {
  if (!intro) return null;
  const firstPrice = intro.price === 0 ? 'Free' : intro.priceString;
  return `${firstPrice} for your ${introPeriodLabel(intro)}, then ${renewalPrice}/year.`;
}

/** The auto-renewal disclosure for the store the user buys through. */
export function renewalTerms(platform: string, renewalPrice: string): string {
  if (platform === 'ios') {
    return `Payment is charged to your Apple ID when you confirm the purchase. The subscription renews automatically at ${renewalPrice}/year unless you cancel it at least 24 hours before the end of the current period. Manage or cancel it in your App Store account settings.`;
  }
  return `Payment is charged to your Google Play account when you confirm the purchase. The subscription renews automatically at ${renewalPrice}/year until you cancel it. Manage or cancel it in Google Play.`;
}
