import { CURRENCY_SYMBOLS, colors, fontSizes, radii, spacing } from '../theme';

describe('theme constants', () => {
  it('exposes full color scale and semantic tokens', () => {
    expect(colors.primary).toMatch(/^#/);
    expect(colors.background).toMatch(/^#/);
    expect(colors.success).toMatch(/^#/);
    expect(colors.error).toMatch(/^#/);
  });

  it('has spacing/radius/font scales', () => {
    expect(spacing.xs).toBeLessThan(spacing.xxxl);
    expect(radii.sm).toBeLessThan(radii.full);
    expect(fontSizes.xs).toBeLessThan(fontSizes.xxxl);
  });

  it('has expected currency symbols', () => {
    expect(CURRENCY_SYMBOLS.USD).toBe('$');
    expect(CURRENCY_SYMBOLS.INR).toBe('₹');
    expect(CURRENCY_SYMBOLS.EUR).toBe('€');
  });

  it('matches theme snapshot', () => {
    expect({
      colors,
      spacing,
      radii,
      fontSizes,
      CURRENCY_SYMBOLS,
    }).toMatchSnapshot();
  });
});
