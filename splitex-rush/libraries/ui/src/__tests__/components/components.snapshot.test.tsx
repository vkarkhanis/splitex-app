import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SplitexThemeProvider } from '../../theme/ThemeProvider';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';

describe('UI component snapshots', () => {
  test('AppShell renders consistently', () => {
    const { asFragment } = render(
      <SplitexThemeProvider defaultTheme="midnight">
        <AppShell>
          <div>Dashboard content</div>
        </AppShell>
      </SplitexThemeProvider>,
    );

    expect(asFragment()).toMatchSnapshot();
  });

  test('Modal open/close behavior and snapshot', () => {
    const onClose = jest.fn();
    const { asFragment } = render(
      <SplitexThemeProvider>
        <Modal open onClose={onClose} dataTestId="test-modal">
          <div>Modal body</div>
        </Modal>
      </SplitexThemeProvider>,
    );

    expect(asFragment()).toMatchSnapshot();
    fireEvent.click(screen.getByTestId('test-modal-overlay'));
    fireEvent.click(screen.getByTestId('test-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test('EmptyState renders with optional action and snapshot', () => {
    const { asFragment } = render(
      <SplitexThemeProvider>
        <EmptyState
          title="No Expenses"
          description="Add your first expense to get started."
          action={<button>Add Expense</button>}
          dataTestId="empty-state"
        />
      </SplitexThemeProvider>,
    );

    expect(screen.queryByTestId('empty-state')).not.toBeNull();
    expect(asFragment()).toMatchSnapshot();
  });

  test('Modal renders null when closed', () => {
    const { container } = render(
      <SplitexThemeProvider>
        <Modal open={false} onClose={jest.fn()}>
          <div>Hidden</div>
        </Modal>
      </SplitexThemeProvider>,
    );

    expect(container).toMatchSnapshot();
  });

  test('click inside modal container does not close', () => {
    const onClose = jest.fn();
    render(
      <SplitexThemeProvider>
        <Modal open onClose={onClose} dataTestId="inside-modal">
          <div>Content</div>
        </Modal>
      </SplitexThemeProvider>,
    );

    fireEvent.click(screen.getByTestId('inside-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
