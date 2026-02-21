import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SplitexThemeProvider } from '../../theme/ThemeProvider';
import { ToastProvider, useToast } from '../../toast/ToastProvider';

function ToastHarness() {
  const { push } = useToast();
  return (
    <div>
      <button
        onClick={() =>
          push({
            type: 'success',
            title: 'Saved',
            message: 'Event updated',
            durationMs: 1000,
          })
        }
      >
        Push Success
      </button>
      <button
        onClick={() =>
          push({
            type: 'error',
            title: 'Failed',
          })
        }
      >
        Push Error
      </button>
    </div>
  );
}

function InvalidToastHookHarness() {
  useToast();
  return null;
}

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('renders and auto-dismisses a pushed toast', () => {
    render(
      <SplitexThemeProvider>
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>
      </SplitexThemeProvider>,
    );

    fireEvent.click(screen.getByText('Push Success'));
    expect(screen.queryByText('Saved')).not.toBeNull();
    expect(screen.queryByText('Event updated')).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Saved')).toBeNull();
  });

  test('uses default error timeout and supports manual dismiss', () => {
    render(
      <SplitexThemeProvider>
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>
      </SplitexThemeProvider>,
    );

    fireEvent.click(screen.getByText('Push Error'));
    expect(screen.queryByText('Failed')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('Failed')).toBeNull();

    fireEvent.click(screen.getByText('Push Error'));
    expect(screen.queryByText('Failed')).not.toBeNull();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Failed')).toBeNull();
  });

  test('throws when hook is used outside provider', () => {
    expect(() => render(<InvalidToastHookHarness />)).toThrow(
      'useToast must be used within ToastProvider',
    );
  });
});
