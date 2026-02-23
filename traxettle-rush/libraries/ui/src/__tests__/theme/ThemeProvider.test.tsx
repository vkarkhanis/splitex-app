import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TraxettleThemeProvider, useTraxettleTheme } from '../../theme/ThemeProvider';

function ThemeHarness() {
  const { themeName, setThemeName } = useTraxettleTheme();
  return (
    <div>
      <span data-testid="theme-name">{themeName}</span>
      <button onClick={() => setThemeName('ocean')}>Set Ocean</button>
    </div>
  );
}

function InvalidThemeHookHarness() {
  useTraxettleTheme();
  return null;
}

describe('TraxettleThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'traxettle.theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  test('uses default theme and persists changes', () => {
    render(
      <TraxettleThemeProvider defaultTheme="light">
        <ThemeHarness />
      </TraxettleThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').textContent).toContain('light');

    fireEvent.click(screen.getByText('Set Ocean'));
    expect(screen.getByTestId('theme-name').textContent).toContain('ocean');
    expect(localStorage.getItem('traxettle.theme')).toBe('ocean');
    expect(document.cookie).toContain('traxettle.theme=ocean');
  });

  test('reads theme from cookie when available', () => {
    document.cookie = 'traxettle.theme=forest; path=/';
    render(
      <TraxettleThemeProvider defaultTheme="light">
        <ThemeHarness />
      </TraxettleThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').textContent).toContain('forest');
  });

  test('reads theme from localStorage when cookie is not set', () => {
    localStorage.setItem('traxettle.theme', 'midnight');
    render(
      <TraxettleThemeProvider defaultTheme="light">
        <ThemeHarness />
      </TraxettleThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').textContent).toContain('midnight');
  });

  test('falls back to default for invalid cookie theme', () => {
    document.cookie = 'traxettle.theme=unknown; path=/';
    render(
      <TraxettleThemeProvider defaultTheme="light">
        <ThemeHarness />
      </TraxettleThemeProvider>,
    );

    expect(screen.getByTestId('theme-name').textContent).toContain('light');
  });

  test('throws when hook is used outside provider', () => {
    expect(() => render(<InvalidThemeHookHarness />)).toThrow(
      'useTraxettleTheme must be used within TraxettleThemeProvider',
    );
  });
});
