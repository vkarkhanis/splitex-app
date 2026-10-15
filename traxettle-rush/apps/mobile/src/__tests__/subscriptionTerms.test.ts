import {
  PRIVACY_POLICY_URL,
  TERMS_OF_USE_URL,
  introOfferText,
  introPeriodLabel,
  renewalTerms,
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
