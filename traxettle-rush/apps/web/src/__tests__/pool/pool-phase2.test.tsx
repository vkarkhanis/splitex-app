/**
 * Money pooling Phase 2 on web: money handed over (§9.3, §10.6), the settle-up preview's
 * netting (§11), and "Several of us" as Pro (§12).
 */
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

import { poolApi } from '../../utils/pool-api';
import { FundingStep } from '../../components/pool/FundingStep';
import { DEFAULT_FUNDING_CHOICE } from '../../components/pool/fundingChoice';
import { PoolPayments } from '../../components/pool/PoolPayments';
import { PoolTab } from '../../components/pool/PoolTab';
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
  mockApi.post.mockResolvedValue({ success: true, data: { id: 'new', url: 'https://files/proof.jpg' } });
  mockApi.put.mockResolvedValue({ success: true, data: {} });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function render(ui: React.ReactElement) {
  await act(async () => { root.render(<ThemeProvider theme={theme as any}>{ui}</ThemeProvider>); });
}
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
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
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}

const ALICE = 'alice';
const BOB = 'bob';

// ── API client ────────────────────────────────────────────────────────────

describe('poolApi — hand-overs', () => {
  it('maps each action to its endpoint, and uploads proof before recording', async () => {
    await poolApi.recordAdvance('e1', { kind: 'advance', userId: BOB, amountMinor: 100 });
    await poolApi.confirmAdvance('a1');
    await poolApi.rejectAdvance('a1');
    await poolApi.rejectAdvance('a1', 'never came');
    await poolApi.cancelAdvance('a1');
    expect(mockApi.post.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['/api/pools/event/e1/advances', { kind: 'advance', userId: BOB, amountMinor: 100 }],
      ['/api/pools/advances/a1/confirm', {}],
      ['/api/pools/advances/a1/reject', {}],
      ['/api/pools/advances/a1/reject', { reason: 'never came' }],
      ['/api/pools/advances/a1/cancel', {}],
    ]);
    expect(await poolApi.uploadAdvanceProof('e1', new File(['x'], 'upi.png', { type: 'image/png' }))).toBe('https://files/proof.jpg');
    expect(mockApi.post).toHaveBeenLastCalledWith('/api/uploads', expect.objectContaining({ scope: 'pool_advance_proof', eventId: 'e1', contentType: 'image/png' }));
  });
});

// ── Small pieces ──────────────────────────────────────────────────────────

describe('PoolPayments — folded into the final settlement', () => {
  it('shows a netted row as "In final settlement" with nothing to do', async () => {
    const leg = { id: 'rep1', kind: 'pool_repayment', fromUserId: BOB, toUserId: ALICE, amount: 600, currency: 'INR', status: 'netted', auditTrail: [] } as any;
    await render(<PoolPayments legs={[leg]} currentUserId={BOB} nameOf={(_, id) => id} onChanged={jest.fn()} />);
    expect(q('pool-leg-rep1')!.textContent).toMatch(/In final settlement/);
    expect(q('pool-leg-pay-rep1')).toBeNull();
  });
});

describe('SpenderPermissions — card or UPI spends', () => {
  it('saves the switch with the rest', async () => {
    const event = { id: 'e1', currency: 'INR', poolConfig: { custodianUserId: ALICE, authorizedSpenders: [BOB] } } as any;
    await render(<SpenderPermissions event={event} participants={[{ userId: BOB, displayName: 'Bob' }] as any} groups={[]} canEdit onSaved={jest.fn()} />);
    expect((q('allow-card-spends') as HTMLInputElement).checked).toBe(true);
    await click(q('allow-card-spends'));
    await click(q('save-spenders'));
    expect(mockApi.put).toHaveBeenCalledWith('/api/pools/event/e1/config', expect.objectContaining({ allowSponsorCardSpends: false }));
  });
});

describe('FundingStep — "Several of us" is Pro (§12)', () => {
  it('shows it locked for someone without Pro: it can\'t be picked, and tapping it says how to get Pro', async () => {
    const onLearnPro = jest.fn();
    let latest = DEFAULT_FUNDING_CHOICE;
    function Harness() {
      const [value, setValue] = React.useState(DEFAULT_FUNDING_CHOICE);
      latest = value;
      return <FundingStep value={value} currency="INR" allowContributorPools contributorPoolsLocked onLearnPro={onLearnPro} onChange={setValue} />;
    }
    await render(<Harness />);
    await click(q('funding-pool'));
    // Pool money starts on "Just me": the only choice they can use.
    expect(q('funder-sponsor')!.getAttribute('aria-checked')).toBe('true');
    const locked = q('funder-contributors')!;
    expect(q('funder-contributors-pro')!.textContent).toBe('PRO');
    expect(q('funder-contributors-locked')!.textContent).toBe('🔒 Pro feature');
    expect(locked.getAttribute('aria-checked')).toBe('false');
    expect(q('funding-pro-notice')).toBeNull();

    await click(locked);
    expect(latest.funder).toBe('sponsor');
    expect(locked.getAttribute('aria-checked')).toBe('false');
    expect(q('preset-trip_kitty')).toBeNull();
    expect(q('funding-pro-notice')!.textContent).toMatch(/Group pools are a Pro feature. Only you need Pro/);
    await click(q('funding-learn-pro'));
    expect(onLearnPro).toHaveBeenCalled();

    // Choosing "Just me" again puts the notice away.
    await click(q('funder-sponsor'));
    expect(q('funding-pro-notice')).toBeNull();
  });

  it('shows no PRO marks for someone with Pro, and lets them pick it', async () => {
    await render(<FundingStep value={{ ...DEFAULT_FUNDING_CHOICE, kind: 'pool', funder: 'contributors' }} currency="INR" allowContributorPools onChange={jest.fn()} />);
    expect(q('funder-contributors-pro')).toBeNull();
    expect(q('funder-contributors-locked')).toBeNull();
    expect(q('funding-pro-notice')).toBeNull();
    expect(q('funder-contributors')!.getAttribute('aria-checked')).toBe('true');
    expect(q('preset-trip_kitty')).not.toBeNull();
  });
});

// ── PoolTab: money handed over ────────────────────────────────────────────

const config = {
  preset: 'sponsor_budget', funderMode: 'sponsor', cycleMode: 'single', custodianUserId: ALICE, authorizedSpenders: [BOB],
  overdraftPolicy: 'graduated', overdraftTolerancePercent: 20, overdraftBaseline: 'confirmed_funding', overdraftClearancePercent: 0, targetAmountMinor: 8000000,
};
const wedding = { id: 'e1', name: 'Wedding', currency: 'INR', status: 'active', createdBy: ALICE, admins: [ALICE], fundingModel: 'pool', poolConfig: config } as any;
const people = [{ userId: ALICE, displayName: 'Alice' }, { userId: BOB, displayName: 'Bob' }] as any;

function weddingLedger(over: { paused?: boolean; held?: number } = {}): PoolLedger {
  const held = over.held ?? 200000;
  const cycle = {
    id: 'c1', eventId: 'e1', sequence: 1, label: 'Wedding', startDate: '2026-11-01', status: 'open', currency: 'INR',
    openingBalanceMinor: 0, openingCredits: {}, roster: [{ entityType: 'user', entityId: ALICE }],
    overdraftLatchedAt: over.paused ? '2026-11-10T00:00:00Z' : null, createdAt: '', updatedAt: '',
  } as any;
  const balance = over.paused ? -2000000 : 8500000;
  const contribution = (id: string, from: string, kind: string, received: number) => ({
    id, eventId: 'e1', cycleId: 'c1', fromEntityId: from, fromEntityType: 'user', fromUserId: from, kind,
    expectedMinor: received, receivedMinor: received, claimedMinor: null, currency: 'INR', status: 'confirmed',
    auditTrail: [], createdBy: from, createdAt: '2026-11-02', updatedAt: '2026-11-02',
  });
  const advance = (id: string, kind: string, from: string, to: string, amountMinor: number, status: string) => ({
    id, eventId: 'e1', cycleId: 'c1', kind, fromUserId: from, toUserId: to, amountMinor, currency: 'INR', status,
    note: id === 'a2' ? 'Cash for decor' : null, proofUrl: id === 'a2' ? 'https://p/upi.png' : null, rejectionReason: null,
    createdBy: from, createdAt: `2026-11-0${id.slice(1)}`, confirmedAt: status === 'confirmed' ? '2026-11-05' : null, updatedAt: '', auditTrail: [],
  });
  return {
    summary: {
      cycle,
      totals: {
        expectedRegularMinor: 8000000, confirmedRegularMinor: 8000000, confirmedTopUpMinor: 1000000, overdraftCoverMinor: 0,
        poolSpendMinor: over.paused ? 11000000 : 500000, reimbursementsMinor: 0, pendingDrawsMinor: 50000, balanceMinor: balance,
      },
      overdraft: over.paused
        ? { policy: 'graduated', baselineMinor: 9000000, tolerancePercent: 20, toleranceMinor: 1800000, floorMinor: -1800000, balanceMinor: balance, headroomMinor: 0, zone: 'blocked', latched: true, clearanceThresholdMinor: 0 }
        : { policy: 'graduated', baselineMinor: 9000000, tolerancePercent: 20, toleranceMinor: 1800000, floorMinor: -1800000, balanceMinor: balance, headroomMinor: 10300000, zone: 'healthy', latched: false, clearanceThresholdMinor: 0 },
      funding: { targetMinor: 8000000, fundedMinor: 9000000, state: 'funded' },
      arrears: [],
      holdings: { withCustodianMinor: balance - held, withSpendersMinor: held, heldBy: held ? { 'user:bob': held } : {}, pendingOutMinor: 100000 },
    },
    contributions: [contribution('s1', ALICE, 'regular', 8000000), contribution('l1', BOB, 'top_up', 1000000)],
    advances: [
      advance('a1', 'advance', ALICE, BOB, 100000, 'initiated'),
      advance('a2', 'advance', ALICE, BOB, 300000, 'confirmed'),
      advance('a3', 'return', BOB, ALICE, 100000, 'confirmed'),
      advance('a4', 'advance', ALICE, BOB, 5000, 'rejected'),
    ],
    entries: [
      { id: 'a2', type: 'advance', advanceKind: 'advance', at: '2026-11-05', title: 'Advance', amountMinor: 300000, status: 'confirmed', actorUserId: ALICE, fromUserId: ALICE, toUserId: BOB, receiptUrls: ['https://p/upi.png'], counted: false },
      { id: 'd1', type: 'draw', at: '2026-11-06', title: 'Decor', amountMinor: -100000, status: 'approved', actorUserId: BOB, fundingSource: 'pool', paidFrom: 'advance', alreadyIncurred: true, receiptUrls: [], counted: true },
      { id: 'd2', type: 'draw', at: '2026-11-07', title: 'Lights', amountMinor: -50000, status: 'pending', actorUserId: BOB, fundingSource: 'pool', paidFrom: 'advance', alreadyIncurred: true, receiptUrls: [], counted: false },
      { id: 'd3', type: 'draw', at: '2026-11-04', title: 'Band', amountMinor: -60000, status: 'rejected', actorUserId: BOB, fundingSource: 'pool', paidFrom: 'sponsor_card', alreadyIncurred: true, settlementStatus: 'netted', receiptUrls: [], counted: false },
    ],
    spenders: [{ spenderId: BOB, spenderType: 'user', spentMinor: 100000, pendingMinor: 50000, capMinor: null, heldMinor: held }],
    cycles: [cycle],
  } as any;
}

const mount = (uid: string, ledger = weddingLedger(), event = wedding) => {
  mockApi.get.mockResolvedValue({ success: true, data: ledger });
  return render(<PoolTab event={event} currentUserId={uid} participants={people} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);
};

describe('PoolTab — the custodian hands money over (§9.3)', () => {
  it('shows who holds the money, what waits, and the hand-over actions', async () => {
    await mount(ALICE);
    expect(q('pool-holdings')!.textContent).toBe('With you ₹83,000.00 · With spenders ₹2,000.00 · ₹1,000.00 handed over, waiting to be confirmed');
    expect(q('pool-give-money')).not.toBeNull();
    expect(q('pool-record-returned')).not.toBeNull();
    expect(q('pool-return-money')).toBeNull();
    expect(q('pool-spenders')!.textContent).toMatch(/Holding.*Bob.*₹2,000\.00/);
  });

  it('gives a spender money, with a note and proof, within what the custodian holds', async () => {
    await mount(ALICE);
    await click(q('pool-give-money'));
    expect(q('pool-handover-modal')!.textContent).toMatch(/Up to ₹82,000\.00.*Moving money between spenders/);
    await type(q('handover-amount'), '90000');
    expect(q('handover-too-much')).not.toBeNull();
    expect((q('handover-submit') as HTMLButtonElement).disabled).toBe(true);
    await type(q('handover-amount'), '2000');
    await type(q('handover-note'), 'Cash for flowers');
    await pick(container.querySelector('#handover-proof'), [new File(['img'], 'upi.png', { type: 'image/png' })]);
    expect(q('pool-handover-modal')!.textContent).toMatch(/Proof attached/);
    await click(q('handover-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/event/e1/advances', {
      kind: 'advance', userId: BOB, amountMinor: 200000, note: 'Cash for flowers', proofUrl: 'https://files/proof.jpg',
    });
    expect(mockToastPush).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Money handed over' }));
  });

  it("can't give money while spending is paused", async () => {
    await mount(ALICE, weddingLedger({ paused: true }));
    await click(q('pool-give-money'));
    expect(q('handover-blocked')!.textContent).toMatch(/no budget money to hand out/);
    await type(q('handover-amount'), '10');
    expect((q('handover-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('records money a holder returned, confirmed at once', async () => {
    await mount(ALICE);
    await click(q('pool-record-returned'));
    expect(q('handover-who')!.textContent).toMatch(/Bob \(holds ₹2,000\.00\)/);
    await type(q('handover-amount'), '1500');
    await click(q('handover-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/event/e1/advances', { kind: 'return', userId: BOB, amountMinor: 150000 });
  });

  it('cancels a hand-over that is still waiting', async () => {
    await mount(ALICE);
    expect(q('advance-a1')!.textContent).toMatch(/Advance.*Waiting for Bob to confirm.*You → Bob/);
    expect(q('advance-confirm-a1')).toBeNull(); // Alice isn't the one receiving it
    await click(q('advance-cancel-a1'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/advances/a1/cancel', {});
    expect(q('advance-a2')!.textContent).toMatch(/Confirmed.*Cash for decor.*proof/);
    expect(q('advance-a4')!.textContent).toMatch(/Not received/);
  });

  it('says how a spend was paid when asking for approval, and what rejecting it means', async () => {
    await mount(ALICE);
    expect(q('pool-pending-approvals')!.textContent).toMatch(/Lights.*Pool spend · already paid.*Money they hold/);
    await click(q('reject-draw-d2'));
    expect(q('reject-warning')!.textContent).toMatch(/Bob paid this with budget money they hold. If you reject it, the ₹500\.00 stays with them/);
  });

  it('shows hand-overs and payment methods in the activity, and netted repayments as in the final settlement', async () => {
    await mount(ALICE, weddingLedger(), { ...wedding, status: 'review' });
    expect(q('ledger-a2')!.textContent).toMatch(/Advance.*You → Bob.*₹3,000\.00/);
    expect(q('ledger-a2')!.textContent).not.toMatch(/\+/); // money moved between holders, not in or out
    expect(q('ledger-d1')!.textContent).toMatch(/paid with money they hold/);
    expect(q('ledger-d3')!.textContent).toMatch(/on the custodian's card or UPI/);
    expect(q('ledger-d3')!.textContent).toMatch(/Rejected.*In final settlement/);
  });

  it('waits for hand-overs to be confirmed before settling up', async () => {
    mockApi.post.mockResolvedValue({
      success: true,
      data: {
        openingBalanceMinor: 0, confirmedContributionsMinor: 9000000, poolSpendMinor: 500000, reimbursementsMinor: 0,
        preCoverBalanceMinor: 8500000, closingBalanceMinor: 8500000, uncoveredDeficitMinor: 0, coverNeededMinor: 0, overdraftCoverMinor: 0,
        outcome: 'surplus', shareBasis: 'custodian', disposition: 'settle', entityShares: [],
        settlementBalances: { 'user:bob': 800000, 'user:alice': -800000 }, pendingDraws: 0, cycleId: 'c1', folded: [], separate: [],
      },
    });
    await mount(ALICE);
    await click(q('pool-settle-up'));
    expect(q('reconcile-waiting-handovers')!.textContent).toMatch(/1 hand-over is waiting for confirmation/);
    expect((q('reconcile-submit') as HTMLButtonElement).disabled).toBe(true);
    expect(q('reconcile-row-user:bob')!.textContent).toMatch(/gets back ₹8,000\.00/);
  });

  it('lists what the final settlement includes and what is paid separately (§11.4)', async () => {
    mockApi.post.mockResolvedValue({
      success: true,
      data: {
        openingBalanceMinor: 0, confirmedContributionsMinor: 9000000, poolSpendMinor: 500000, reimbursementsMinor: 0,
        preCoverBalanceMinor: 8500000, closingBalanceMinor: 8500000, uncoveredDeficitMinor: 0, coverNeededMinor: 0, overdraftCoverMinor: 0,
        outcome: 'surplus', shareBasis: 'custodian', disposition: 'settle', entityShares: [],
        settlementBalances: { 'user:bob': 500000, 'user:alice': -500000 }, pendingDraws: 0, cycleId: 'c1',
        folded: [{ settlementId: 'rep1', expenseId: 'd3', kind: 'pool_repayment', fromUserId: BOB, toUserId: ALICE, amountMinor: 60000, title: 'Band' }],
        separate: [{ settlementId: 'rb1', kind: 'pool_reimbursement', status: 'initiated', expenseId: 'x1', fromUserId: ALICE, toUserId: BOB, amountMinor: 30000 }],
      },
    });
    await mount(ALICE, weddingLedger({ held: 0 }));
    await click(q('pool-settle-up'));
    expect(q('reconcile-row-user:bob')!.textContent).toMatch(/₹5,000\.00 from the budget, less ₹600\.00 for Band \(repayment\).*gets back ₹4,400\.00/);
    expect(q('reconcile-folded')!.textContent).toMatch(/Bob → You · Repayment \(spend not approved\) · Band.*₹600\.00/);
    expect(q('reconcile-separate')!.textContent).toMatch(/You → Bob · .*sent, awaiting confirmation.*₹300\.00/);
  });
});

describe('PoolTab — paying a lender back early (§10.6)', () => {
  it('lists what each lender is still owed and pays them back', async () => {
    await mount(ALICE);
    expect(q('pool-loans')!.textContent).toMatch(/Bob lent the budget money: ₹10,000\.00 still to pay back/);
    await click(q('pay-back-bob'));
    expect((q('handover-amount') as HTMLInputElement).value).toBe('10000');
    expect(q('handover-warning')).toBeNull();
    await type(q('handover-amount'), '4000');
    await click(q('handover-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/event/e1/advances', { kind: 'repayment', userId: BOB, amountMinor: 400000 });
  });

  it('warns when spending is paused, with what it would take to resume', async () => {
    await mount(ALICE, weddingLedger({ paused: true }));
    await click(q('pay-back-bob'));
    expect(q('handover-warning')!.textContent).toBe("Spending is paused. Paying Bob ₹10,000.00 now means you'll need to add ₹30,000.01 before anyone can spend again.");
  });

  it('shows money paid back early in the settle-up figures, so they add up', async () => {
    mockApi.post.mockResolvedValue({
      success: true,
      data: {
        openingBalanceMinor: 0, confirmedContributionsMinor: 2050000, earlyRepaymentsMinor: 400000, poolSpendMinor: 1600000, reimbursementsMinor: 0,
        preCoverBalanceMinor: 50000, closingBalanceMinor: 50000, uncoveredDeficitMinor: 0, coverNeededMinor: 0, overdraftCoverMinor: 0,
        outcome: 'surplus', shareBasis: 'custodian', disposition: 'settle', entityShares: [],
        settlementBalances: {}, pendingDraws: 0, cycleId: 'c1', folded: [], separate: [],
      },
    });
    await mount(ALICE, weddingLedger({ held: 0 }));
    await click(q('pool-settle-up'));
    expect(q('reconcile-figure-collected')!.textContent).toMatch(/Collected.*₹20,500\.00/);
    expect(q('reconcile-figure-paid_back_early')!.textContent).toMatch(/Paid back early.*₹4,000\.00/);
    expect(q('reconcile-figure-spent')!.textContent).toMatch(/Spent from the pool.*₹16,000\.00/);
    expect(q('reconcile-figure-result')!.textContent).toBe('Left over₹500.00');
  });
});

describe('PoolTab — a spender holding money (§9.3)', () => {
  it('tells them what they hold and lets them return it', async () => {
    await mount(BOB);
    expect(q('pool-holdings')!.textContent).toBe("You're holding ₹2,000.00 of the budget's money.");
    expect(q('pool-give-money')).toBeNull();
    await click(q('pool-return-money'));
    expect(q('handover-who')).toBeNull();
    await type(q('handover-amount'), '500');
    await click(q('handover-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/event/e1/advances', { kind: 'return', amountMinor: 50000 });
  });

  it('confirms or rejects money handed to them', async () => {
    await mount(BOB);
    expect(q('advance-a1')!.textContent).toMatch(/Waiting for you to confirm/);
    expect(q('advance-cancel-a1')).toBeNull();
    await click(q('advance-confirm-a1'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/advances/a1/confirm', {});
    await click(q('advance-reject-a1'));
    await type(container.querySelector('#pool-reason'), 'No cash yet');
    await click(q('reason-submit'));
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/advances/a1/reject', { reason: 'No cash yet' });
  });

  it('tells them when the pool owes them for spending beyond what they held', async () => {
    await mount(BOB, weddingLedger({ held: -30000 }));
    expect(q('pool-holdings')!.textContent).toBe('The budget owes you ₹300.00 for spends beyond the money you held.');
    expect(q('pool-return-money')).toBeNull();
  });

  it('shows others who hold what without the custodian\'s actions', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: weddingLedger() });
    const carol = 'carol';
    await render(<PoolTab event={wedding} currentUserId={carol} participants={[...people, { userId: carol, displayName: 'Carol' }]} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);
    expect(q('pool-holdings')!.textContent).toBe('With Alice ₹83,000.00 · With spenders ₹2,000.00');
    expect(q('pool-loans')).toBeNull();
  });
});
