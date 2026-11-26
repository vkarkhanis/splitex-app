import { poolingHelpLine, proBadges } from '../../utils/proFeatures';

describe('Pro features on web (design doc §12)', () => {
  it('lists group pools only once "Several of us" is released', () => {
    expect(proBadges(false)).toEqual(['Unlimited events', 'Multi-currency settlement', 'Expenses in another currency', 'Analytics (coming soon)', 'More power-user features']);
    expect(proBadges(true)).toEqual(['Unlimited events', 'Multi-currency settlement', 'Expenses in another currency', 'Group pools', 'Analytics (coming soon)', 'More power-user features']);
  });

  it('never calls analytics "advanced": it is not built yet', () => {
    expect(proBadges(true).join(' ')).not.toMatch(/Advanced analytics/);
  });

  it('describes pooling for Help, mentioning Pro only once released', () => {
    expect(poolingHelpLine(false)).toMatch(/"Just me"/);
    expect(poolingHelpLine(false)).not.toMatch(/Pro/);
    expect(poolingHelpLine(true)).toMatch(/"Several of us", Pro for the person who creates it; everyone else joins free/);
    expect(poolingHelpLine(true)).toMatch(/choose who spends and who approves/);
  });

  it('treats a build without an app environment as production, where group pools are released', () => {
    expect(process.env.NEXT_PUBLIC_APP_ENV).toBeUndefined();
    expect(proBadges()).toContain('Group pools');
  });
});
