import {
  INTRO_ELIGIBLE,
  PRIVACY_POLICY_URL,
  TERMS_OF_USE_URL,
  introOfferText,
  introPeriodLabel,
  renewalTerms,
  resolveIntroOffer,
} from '../utils/subscriptionTerms';

const offer = (patch: Partial<Parameters<typeof introPeriodLabel>[0]> = {}) => ({
  price: 269, priceString: '₹269', cycles: 1, periodUnit: 'YEAR', periodNumberOfUnits: 1, ...patch,
});

describe('subscription terms', () => {
  it('describes how long the introductory price lasts', () => {
    expect(introPeriodLabel(offer())).toBe('first year');
    expect(introPeriodLabel(offer({ periodUnit: 'MONTH', periodNumberOfUnits: 3 }))).toBe('first 3 months');
    expect(introPeriodLabel(offer({ periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 6 }))).toBe('first 6 months');
  });

  it('shows the store\'s first-year and renewal prices, or nothing without an offer', () => {
    expect(introOfferText(offer(), '₹299')).toBe('₹269 for your first year, then ₹299/year.');
    expect(introOfferText(offer({ price: 0, priceString: '₹0', periodUnit: 'WEEK' }), '$5.99')).toBe('Free for your first week, then $5.99/year.');
    expect(introOfferText(null, '₹299')).toBeNull();
  });

  it('states the store\'s auto-renewal terms with the renewal price', () => {
    const ios = renewalTerms('ios', '$5.99');
    expect(ios).toContain('Apple ID');
    expect(ios).toContain('$5.99/year');
    expect(ios).toContain('at least 24 hours before the end of the current period');
    expect(renewalTerms('android', '₹299')).toContain('Google Play');
  });

  it('links to the live privacy policy and Apple\'s standard EULA', () => {
    expect(PRIVACY_POLICY_URL).toBe('https://traxettle-prod.web.app/privacy.html');
    expect(TERMS_OF_USE_URL).toBe('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/');
  });
});

// Plan §10A: show a trial only to people who can get it.
describe('resolveIntroOffer', () => {
  const weekFree = offer({ price: 0, priceString: '₹0', periodUnit: 'WEEK' });
  const phase = (micros: number, formatted: string, unit: string, value: number, cycles: number | null = 1) => ({
    billingPeriod: { unit, value, iso8601: `P${value}${unit[0]}` },
    billingCycleCount: cycles,
    price: { amountMicros: micros, formatted, currencyCode: 'INR' },
    recurrenceMode: 2,
    offerPaymentMode: null,
  }) as any;

  it('shows Apple\'s trial only when RevenueCat says this account is eligible', () => {
    const product = { introPrice: weekFree };
    const eligible = resolveIntroOffer({ platform: 'ios', product, iosEligibility: INTRO_ELIGIBLE });
    expect(eligible).toBe(weekFree);
    expect(introOfferText(eligible, '₹999')).toBe('Free for your first week, then ₹999/year.');
  });

  it('shows the normal price on iOS when ineligible, unknown, no offer exists, or the check failed', () => {
    const product = { introPrice: weekFree };
    for (const iosEligibility of [1, 0, 3, null, undefined]) {
      expect(resolveIntroOffer({ platform: 'ios', product, iosEligibility })).toBeNull();
    }
    expect(resolveIntroOffer({ platform: 'ios', product: { introPrice: null }, iosEligibility: INTRO_ELIGIBLE })).toBeNull();
  });

  it('reads a Google Play free trial from the default option', () => {
    const week = resolveIntroOffer({ platform: 'android', product: { defaultOption: { freePhase: phase(0, 'Free', 'WEEK', 1) } } });
    expect(week).toEqual({ price: 0, priceString: 'Free', periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 });
    expect(introOfferText(week, '₹999')).toBe('Free for your first week, then ₹999/year.');
    const days = resolveIntroOffer({ platform: 'android', product: { defaultOption: { freePhase: phase(0, 'Free', 'DAY', 7, null) } } });
    expect(introOfferText(days, '₹999')).toBe('Free for your first 7 days, then ₹999/year.');
  });

  it('prefers the free phase, then a paid intro phase', () => {
    const both = { freePhase: phase(0, 'Free', 'WEEK', 1), introPhase: phase(49_000_000, '₹49', 'MONTH', 1) };
    expect(resolveIntroOffer({ platform: 'android', product: { defaultOption: both } })?.price).toBe(0);
    const paid = resolveIntroOffer({ platform: 'android', product: { defaultOption: { freePhase: null, introPhase: both.introPhase } } });
    expect(paid).toEqual({ price: 49, priceString: '₹49', periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 });
    expect(introOfferText(paid, '₹999')).toBe('₹49 for your first month, then ₹999/year.');
  });

  it('falls back to introPrice on Android, then to nothing', () => {
    expect(resolveIntroOffer({ platform: 'android', product: { introPrice: weekFree, defaultOption: { freePhase: null, introPhase: null } } })).toBe(weekFree);
    expect(resolveIntroOffer({ platform: 'android', product: { introPrice: null, defaultOption: null } })).toBeNull();
    expect(resolveIntroOffer({ platform: 'android', product: {} })).toBeNull();
  });
});
