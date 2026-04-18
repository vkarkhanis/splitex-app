import { themes } from '../../theme/themes';

describe('themes', () => {
  test('contains all expected theme variants', () => {
    expect(Object.keys(themes).sort()).toEqual(['dark', 'forest', 'light', 'midnight', 'ocean']);
  });

  test('each theme exposes required color fields', () => {
    Object.values(themes).forEach((theme) => {
      expect(theme.colors.primary).toBeTruthy();
      expect(theme.colors.background).toBeTruthy();
      expect(theme.colors.text).toBeTruthy();
      expect(theme.shadows.md).toBeTruthy();
      expect(theme.radii.md).toBeTruthy();
    });
  });
});
