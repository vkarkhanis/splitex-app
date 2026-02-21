import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SplitexThemeProvider, useSplitexTheme } from '../../theme/ThemeProvider';

function ThemeHarness() {
  const { themeName, setThemeName } = useSplitexTheme();
  return (
    <div>
      <span data-testid="theme-name">{themeName}</span>
      <button onClick={() => setThemeName('ocean')}>Set Ocean</button>
    </div>
  );
}

function InvalidThemeHookHarness() {
  useSplitexTheme();
  return null;
}

describe('SplitexThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'splitex.theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  test('uses default theme and persists changes', () => {
    render(
      <SplitexThemeProvider defaultTheme="light">
        <ThemeHarness />
      </SplitexThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').textContent).toContain('light');

    fireEvent.click(screen.getByText('Set Ocean'));
    expect(screen.getByTestId('theme-name').textContent).toContain('ocean');
    expect(localStorage.getItem('splitex.theme')).toBe('ocean');
    expect(document.cookie).toContain('splitex.theme=ocean');
  });

  test('reads theme from cookie when available', () => {
    document.cookie = 'splitex.theme=forest; path=/';
    render(
      <SplitexThemeProvider defaultTheme="light">
        <ThemeHarness />
      </SplitexThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').textContent).toContain('forest');
  });

  test('reads theme from localStorage when cookie is not set', () => {
    localStorage.setItem('splitex.theme', 'midnight');
    render(
      <SplitexThemeProvider defaultTheme="light">
        <ThemeHarness />
      </SplitexThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').textContent).toContain('midnight');
  });

  test('falls back to default for invalid cookie theme', () => {
    document.cookie = 'splitex.theme=unknown; path=/';
    render(
      <SplitexThemeProvider defaultTheme="light">
        <ThemeHarness />
      </SplitexThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').textContent).toContain('light');
  });

  test('throws when hook is used outside provider', () => {
    expect(() => render(<InvalidThemeHookHarness />)).toThrow(
      'useSplitexTheme must be used within SplitexThemeProvider',
    );
  });
});
