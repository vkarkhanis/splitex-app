import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TraxettleThemeProvider } from '../../theme/ThemeProvider';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';

describe('UI component snapshots', () => {
  test('AppShell renders consistently', () => {
    const { asFragment } = render(
      <TraxettleThemeProvider defaultTheme="midnight">
        <AppShell>
          <div>Dashboard content</div>
        </AppShell>
      </TraxettleThemeProvider>,
    );

    expect(asFragment()).toMatchSnapshot();
  });

  test('Modal open/close behavior and snapshot', () => {
    const onClose = jest.fn();
    const { asFragment } = render(
      <TraxettleThemeProvider>
        <Modal open onClose={onClose} dataTestId="test-modal">
          <div>Modal body</div>
        </Modal>
      </TraxettleThemeProvider>,
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
      <TraxettleThemeProvider>
        <EmptyState
          title="No Expenses"
          description="Add your first expense to get started."
          action={<button>Add Expense</button>}
          dataTestId="empty-state"
        />
      </TraxettleThemeProvider>,
    );

    expect(screen.queryByTestId('empty-state')).not.toBeNull();
    expect(asFragment()).toMatchSnapshot();
  });

  test('Modal renders null when closed', () => {
    const { container } = render(
      <TraxettleThemeProvider>
        <Modal open={false} onClose={jest.fn()}>
          <div>Hidden</div>
        </Modal>
      </TraxettleThemeProvider>,
    );

    expect(container).toMatchSnapshot();
  });

  test('click inside modal container does not close', () => {
    const onClose = jest.fn();
    render(
      <TraxettleThemeProvider>
        <Modal open onClose={onClose} dataTestId="inside-modal">
          <div>Content</div>
        </Modal>
      </TraxettleThemeProvider>,
    );

    fireEvent.click(screen.getByTestId('inside-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
