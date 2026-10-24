import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { ThemeProvider } from 'styled-components';
import type { PoolLedger } from '@traxettle/shared';

const mockToastPush = jest.fn();

jest.mock('@traxettle/ui', () => {
  const R = require('react');
  const el = (tag: string) => ({ children, $variant, $size, $selected, $fullWidth, $hasError, dataTestId, ...props }: any) =>
    R.createElement(tag, { ...props, ...(dataTestId ? { 'data-testid': dataTestId } : {}) }, children);
  return {
    Badge: el('span'), Button: el('button'), Card: el('div'), CardBody: el('div'), CardHeader: el('div'),
    CardSubtitle: el('div'), CardTitle: el('h2'), Field: el('div'), Label: el('label'), Select: el('select'),
    Input: ({ $hasError, ...props }: any) => R.createElement('input', props),
    EmptyState: ({ title, description, action }: any) => R.createElement('div', { 'data-testid': 'empty' }, title, description, action),
    Modal: ({ open, children, dataTestId }: any) => (open ? R.createElement('div', { 'data-testid': dataTestId || 'modal' }, children) : null),
    ModalHeader: el('div'), ModalTitle: el('h3'), ModalBody: el('div'), ModalFooter: el('div'),
    useToast: () => ({ push: mockToastPush }),
  };
});
jest.mock('../../config/dev-options', () => ({ getResolvedApiBaseUrl: () => 'http://api.test' }));

const mockApi = { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() };
jest.mock('../../utils/api', () => ({ api: mockApi }));

import { fileToBase64, poolApi } from '../../utils/pool-api';
import { PoolTab } from '../../components/pool/PoolTab';
import { PoolPayments } from '../../components/pool/PoolPayments';
import { ReceiptField } from '../../components/pool/ReceiptField';
import { SpenderPermissions } from '../../components/pool/SpenderPermissions';

const theme = { colors: new Proxy({}, { get: () => '#123456' }), shadows: {}, radii: {} };
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
  mockApi.post.mockResolvedValue({ success: true, data: { id: 'new', url: 'https://files/r1.jpg' } });
  mockApi.put.mockResolvedValue({ success: true, data: {} });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function render(ui: React.ReactElement) {
  await act(async () => { root.render(<ThemeProvider theme={theme as any}>{ui}</ThemeProvider>); });
}
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const byText = (text: RegExp, tag = 'button') =>
  Array.from(container.querySelectorAll(tag)).find((b) => text.test(b.textContent || '')) as HTMLElement | undefined;
async function click(el: Element | null | undefined) {
  if (!el) throw new Error('element not found');
  await act(async () => { (el as HTMLElement).click(); });
}
async function type(el: Element | null, value: string) {
  const input = el as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function pick(el: Element | null, files: File[]) {
  const input = el as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  // FileReader completes on a later macrotask.
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}

// ── pool-api ──────────────────────────────────────────────────────────────

describe('poolApi', () => {
  it('maps every action to its endpoint', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: {} });
    await poolApi.summary('e1');
    await poolApi.ledger('e1');
    await poolApi.ledger('e1', 'c 1');
    await poolApi.cycles('e1');
    await poolApi.updateConfig('e1', { overdraftTolerancePercent: 10 });
    await poolApi.convert('e1', { preset: 'trip_kitty' });
    await poolApi.setContributions('e1', [{ entityId: 'u', entityType: 'user', expectedMinor: 1 }]);
    await poolApi.topUp('e1', { amountMinor: 5 });
    await poolApi.markPaid('c1', { amountMinor: 5 });
    await poolApi.confirm('c1');
    await poolApi.confirm('c1', 7);
    await poolApi.reject('c1');
    await poolApi.reject('c1', 'no');
    await poolApi.waive('c1');
    await poolApi.waive('c1', 'away');
    await poolApi.approveDraw('x1');
    await poolApi.rejectDraw('x1');
    await poolApi.rejectDraw('x1', 'no');
    await poolApi.previewClose('e1');
    await poolApi.closeCycle('e1');
    await poolApi.dissolve('e1');
    expect(mockApi.get.mock.calls.map((c) => c[0])).toEqual([
      '/api/pools/event/e1/summary', '/api/pools/event/e1/ledger', '/api/pools/event/e1/ledger?cycleId=c%201', '/api/pools/event/e1/cycles',
    ]);
    expect(mockApi.put).toHaveBeenCalledWith('/api/pools/event/e1/contributions', { contributions: [{ entityId: 'u', entityType: 'user', expectedMinor: 1 }] });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/c1/confirm', { receivedMinor: 7 });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/c1/waive', { reason: 'away' });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/event/e1/dissolve', {});
  });

  it('reads files as base64 and uploads receipts and proofs', async () => {
    const file = new File(['hello'], 'bill.pdf', { type: 'application/pdf' });
    expect(await fileToBase64(file)).toMatch(/^data:application\/pdf;base64,/);
    expect(await poolApi.uploadReceipt('e1', file)).toBe('https://files/r1.jpg');
    expect(mockApi.post).toHaveBeenCalledWith('/api/uploads', expect.objectContaining({ scope: 'expense_receipt', eventId: 'e1', contentType: 'application/pdf', filename: 'bill.pdf' }));
    await poolApi.uploadContributionProof('c1', new File(['x'], 'p'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/uploads', expect.objectContaining({ scope: 'pool_contribution_proof', contributionId: 'c1', contentType: 'image/jpeg' }));
  });
});

// ── ReceiptField ──────────────────────────────────────────────────────────

describe('ReceiptField', () => {
  function Harness({ required }: { required?: boolean }) {
    const [urls, setUrls] = React.useState<string[]>([]);
    return <ReceiptField eventId="e1" value={urls} onChange={setUrls} required={required} />;
  }

  it('uploads, lists and removes receipts', async () => {
    await render(<Harness required />);
    expect(q('receipt-field')!.textContent).toMatch(/A receipt is required/);
    await pick(q('receipt-input'), [new File(['img'], 'r.jpg', { type: 'image/jpeg' })]);
    expect(q('receipt-field')!.textContent).toMatch(/Receipt 1/);
    expect(q('receipt-field')!.textContent).not.toMatch(/is required/);
    await click(container.querySelector('button[aria-label="Remove receipt 1"]'));
    expect(q('receipt-field')!.textContent).not.toMatch(/Receipt 1/);
  });

  it('refuses files over 5MB and reports upload failures', async () => {
    await render(<Harness />);
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await pick(q('receipt-input'), [big]);
    expect(mockToastPush).toHaveBeenCalledWith(expect.objectContaining({ title: 'File too large' }));
    mockApi.post.mockRejectedValueOnce(new Error('server down'));
    await pick(q('receipt-input'), [new File(['img'], 'r.jpg', { type: 'image/jpeg' })]);
    expect(mockToastPush).toHaveBeenCalledWith(expect.objectContaining({ title: 'Upload failed', message: 'server down' }));
  });
});

// ── SpenderPermissions ────────────────────────────────────────────────────

describe('SpenderPermissions', () => {
  const event = { id: 'e1', currency: 'INR', poolConfig: { custodianUserId: 'alice', authorizedSpenders: [], authorizedSpenderGroups: [], spenderCapsMinor: {} } } as any;
  const participants = [{ userId: 'alice', displayName: 'Alice' }, { userId: 'bob', displayName: 'Bob' }] as any;
  const groups = [{ id: 'g1', name: 'Shopping', members: ['bob'] }] as any;

  it('authorises spenders with optional limits', async () => {
    const onSaved = jest.fn();
    await render(<SpenderPermissions event={event} participants={participants} groups={groups} canEdit onSaved={onSaved} />);
    expect(q('spender-alice')).toBeNull(); // the sponsor is not listed
    await click(q('spender-bob'));
    await type(container.querySelector('input[aria-label="Spending limit"]'), '25000');
    await click(container.querySelector('input[aria-label="Allow group Shopping to spend"]'));
    await click(q('save-spenders'));
    expect(mockApi.put).toHaveBeenCalledWith('/api/pools/event/e1/config', {
      authorizedSpenders: ['bob'], authorizedSpenderGroups: ['g1'], spenderCapsMinor: { bob: 2500000 },
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('is read-only without permission and nudges to invite people first', async () => {
    await render(<SpenderPermissions event={event} participants={[participants[0]]} groups={[]} canEdit={false} onSaved={jest.fn()} />);
    expect(q('spender-permissions')!.textContent).toMatch(/Invite people below/);
    expect(q('save-spenders')).toBeNull();
  });

  it('reports a failed save', async () => {
    mockApi.put.mockRejectedValueOnce(new Error('nope'));
    await render(<SpenderPermissions event={event} participants={participants} groups={[]} canEdit onSaved={jest.fn()} />);
    await click(q('save-spenders'));
    expect(mockToastPush).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not save', message: 'nope' }));
  });
});

// ── PoolPayments ──────────────────────────────────────────────────────────

describe('PoolPayments', () => {
  const nameOf = (_: 'user' | 'group', id: string) => id;
  const leg = (status: string) => ({ id: 'leg1', kind: 'pool_member_exit', fromUserId: 'alice', toUserId: 'bob', amount: 1666.67, currency: 'INR', status, auditTrail: [] }) as any;

  it('lets the payer mark a leg paid with a reference', async () => {
    const onChanged = jest.fn();
    await render(<PoolPayments legs={[leg('pending')]} currentUserId="alice" nameOf={nameOf} onChanged={onChanged} />);
    expect(q('pool-leg-leg1')!.textContent).toMatch(/Leaving settlement.*To pay/);
    await click(q('pool-leg-pay-leg1'));
    await type(container.querySelector('#leg-ref'), 'UPI-1');
    await click(q('pool-leg-pay-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/settlements/leg1/pay', { referenceId: 'UPI-1', note: 'Paid outside the app' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('lets the payee confirm or reject', async () => {
    await render(<PoolPayments legs={[leg('initiated')]} currentUserId="bob" nameOf={nameOf} onChanged={jest.fn()} />);
    await click(q('pool-leg-confirm-leg1'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/settlements/leg1/approve', {});
    await click(byText(/Not received/));
    expect(mockApi.post).toHaveBeenCalledWith('/api/settlements/leg1/reject', { reason: 'Payment not received' });
  });

  it('renders nothing without legs and reports failures', async () => {
    await render(<PoolPayments legs={[]} currentUserId="bob" nameOf={nameOf} onChanged={jest.fn()} />);
    expect(q('pool-payments')).toBeNull();
    mockApi.post.mockRejectedValueOnce(new Error('denied'));
    await render(<PoolPayments legs={[leg('initiated')]} currentUserId="bob" nameOf={nameOf} onChanged={jest.fn()} />);
    await click(q('pool-leg-confirm-leg1'));
    expect(mockToastPush).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'denied' }));
  });
});

// ── PoolTab modals ────────────────────────────────────────────────────────

const ALICE = 'alice';
const BOB = 'bob';

function ledger(overrides: Partial<PoolLedger> = {}): PoolLedger {
  const cycle = {
    id: 'c2', eventId: 'e1', sequence: 2, label: 'November 2026', startDate: '2026-11-01', status: 'open', currency: 'INR',
    openingBalanceMinor: 500000, openingCredits: {}, roster: [{ entityType: 'user', entityId: ALICE }, { entityType: 'user', entityId: BOB }],
    createdAt: '', updatedAt: '',
  } as any;
  const contribution = (id: string, from: string, status: any, received: number, kind = 'regular') => ({
    id, eventId: 'e1', cycleId: 'c2', fromEntityId: from, fromEntityType: 'user', fromUserId: from, kind,
    expectedMinor: 1500000, receivedMinor: received, claimedMinor: null, currency: 'INR', status,
    paymentReference: status === 'initiated' ? 'UPI-7' : null, proofUrl: status === 'initiated' ? 'https://p/1.jpg' : null,
    rejectionReason: status === 'pending' && from === BOB ? 'Not seen' : null,
    auditTrail: [], createdBy: ALICE, createdAt: '2026-11-01', updatedAt: '2026-11-01',
  });
  return {
    summary: {
      cycle,
      totals: { expectedRegularMinor: 3000000, confirmedRegularMinor: 0, confirmedTopUpMinor: 0, overdraftCoverMinor: 0, poolSpendMinor: 0, reimbursementsMinor: 0, pendingDrawsMinor: 0, balanceMinor: 500000 },
      overdraft: { policy: 'graduated', baselineMinor: 500000, tolerancePercent: 20, toleranceMinor: 100000, floorMinor: -100000, balanceMinor: 500000, headroomMinor: 600000, zone: 'healthy', latched: false, clearanceThresholdMinor: 0 },
      funding: { targetMinor: 3000000, fundedMinor: 500000, state: 'underfunded' },
      arrears: [],
    },
    contributions: [contribution('ca', ALICE, 'pending', 0), contribution('cb', BOB, 'pending', 0), contribution('ct', BOB, 'initiated', 0, 'top_up')],
    entries: [],
    spenders: [],
    cycles: [
      { id: 'c1', label: 'October 2026', status: 'closed', openingBalanceMinor: 0, closeReason: 'membership_change', reconciliation: { disposition: 'carry_forward', closingBalanceMinor: 500000 } },
      cycle,
    ] as any,
    ...overrides,
  } as PoolLedger;
}

const household = {
  id: 'e1', name: 'Flat 4B', currency: 'INR', status: 'active', createdBy: ALICE, admins: [ALICE], fundingModel: 'pool',
  poolConfig: { preset: 'household', funderMode: 'contributors', cycleMode: 'recurring', custodianUserId: ALICE },
} as any;
const participants = [{ userId: ALICE, displayName: 'Alice' }, { userId: BOB, displayName: 'Bob' }] as any;

describe('PoolTab interactions', () => {
  beforeEach(() => {
    mockApi.get.mockImplementation(async (path: string) => ({ success: true, data: path.includes('cycleId=c1') ? ledger({ summary: { ...ledger().summary, cycle: { ...ledger().summary.cycle, id: 'c1', status: 'closed', label: 'October 2026' } } as any }) : ledger() }));
  });

  const mount = (uid: string, extra: Record<string, unknown> = {}) =>
    render(<PoolTab event={{ ...household, ...extra }} currentUserId={uid} participants={participants} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);

  it('lets a member mark their contribution paid with an amount, reference and proof', async () => {
    await mount(BOB);
    expect(q('contribution-cb')!.textContent).toMatch(/not received: Not seen/);
    await click(q('mark-paid-cb'));
    expect((q('mark-paid-amount') as HTMLInputElement).value).toBe('15000');
    await type(q('mark-paid-amount'), '7500');
    await type(container.querySelector('#mp-ref'), 'UPI-42');
    await pick(container.querySelector('#mp-proof'), [new File(['img'], 'p.jpg', { type: 'image/jpeg' })]);
    expect(q('pool-mark-paid-modal')!.textContent).toMatch(/Proof attached/);
    await click(q('mark-paid-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/cb/mark-paid', { amountMinor: 750000, reference: 'UPI-42', proofUrl: 'https://files/r1.jpg' });
  });

  it('lets the custodian confirm a claimed payment for a different amount', async () => {
    await mount(ALICE);
    await click(q('confirm-ct'));
    await type(q('pool-amount-input'), '1200');
    await click(q('pool-amount-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/ct/confirm', { receivedMinor: 120000 });
  });

  it('lets the custodian record a payment, reject a claim, or waive dues', async () => {
    await mount(ALICE);
    await click(byText(/Record payment/));
    await click(q('pool-amount-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/cb/confirm', { receivedMinor: 1500000 });

    await click(byText(/Not received/));
    await type(container.querySelector('#pool-reason'), 'Bounced');
    await click(q('reason-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/ct/reject', { reason: 'Bounced' });

    await click(byText(/^Waive$/));
    expect(mockApi.post).toHaveBeenCalledWith(expect.stringMatching(/\/waive$/), {});
  });

  it('adds money: straight in for the custodian, marked paid for a member', async () => {
    await mount(ALICE);
    await click(q('pool-add-money'));
    await type(q('pool-amount-input'), '500');
    await click(q('pool-amount-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/event/e1/top-ups', { amountMinor: 50000 });
    expect(mockApi.post).not.toHaveBeenCalledWith(expect.stringMatching(/mark-paid/), expect.anything());

    act(() => root.unmount());
    root = createRoot(container);
    jest.clearAllMocks();
    mockApi.post.mockResolvedValue({ success: true, data: { id: 'tu9' } });
    await mount(BOB);
    await click(q('pool-add-money'));
    await type(q('pool-amount-input'), '500');
    await click(q('pool-amount-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/tu9/mark-paid', { amountMinor: 50000 });
  });

  it('sets per-person amounts, including "same for everyone"', async () => {
    await mount(ALICE);
    await click(q('pool-set-amounts'));
    await type(container.querySelector('#amt-all'), '12000');
    await click(byText(/^Apply$/));
    await type(container.querySelector('input[aria-label="Amount for Bob"]'), '8000');
    await click(byText(/^Save$/));
    expect(mockApi.put).toHaveBeenCalledWith('/api/pools/event/e1/contributions', {
      contributions: [{ entityId: ALICE, entityType: 'user', expectedMinor: 1200000 }, { entityId: BOB, entityType: 'user', expectedMinor: 800000 }],
    });
  });

  it('browses a past cycle read-only and returns to the current one', async () => {
    await mount(ALICE);
    expect(q('pool-cycles')!.textContent).toMatch(/October 2026.*carried forward.*closed when membership changed/);
    await click(byText(/^View$/));
    expect(q('pool-title')!.textContent).toBe('Fund · October 2026');
    expect(q('pool-add-money')).toBeNull();
    await click(byText(/Back to the current cycle/, 'a'));
    expect(q('pool-title')!.textContent).toBe('Fund · November 2026');
  });

  it('shows a target collection\'s progress', async () => {
    await mount(ALICE, { poolConfig: { ...household.poolConfig, preset: 'target_collection', cycleMode: 'single' } });
    expect(q('pool-funding')!.textContent).toMatch(/Collected ₹5,000\.00 of ₹30,000\.00/);
  });

  it('labels the sponsor\'s settle-up as a final report', async () => {
    await mount(ALICE, { poolConfig: { ...household.poolConfig, preset: 'sponsor_budget', funderMode: 'sponsor', cycleMode: 'single' } });
    expect(q('pool-settle-up')!.textContent).toBe('Finish & report');
    expect(q('pool-set-amounts')).toBeNull();
  });
});
