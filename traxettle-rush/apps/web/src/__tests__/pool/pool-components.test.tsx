import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { ThemeProvider } from 'styled-components';
import type { PoolCycleSummary, PoolLedger } from '@traxettle/shared';

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

const mockPoolApi = {
  ledger: jest.fn(),
  approveDraw: jest.fn().mockResolvedValue({ success: true }),
  rejectDraw: jest.fn().mockResolvedValue({ success: true }),
  waive: jest.fn().mockResolvedValue({ success: true }),
  previewClose: jest.fn(),
  dissolve: jest.fn().mockResolvedValue({ success: true }),
  closeCycle: jest.fn().mockResolvedValue({ success: true }),
  topUp: jest.fn().mockResolvedValue({ success: true, data: { id: 'tu1' } }),
  markPaid: jest.fn().mockResolvedValue({ success: true }),
  confirm: jest.fn().mockResolvedValue({ success: true }),
  setContributions: jest.fn().mockResolvedValue({ success: true }),
};
jest.mock('../../utils/pool-api', () => ({
  poolApi: mockPoolApi,
  RECEIPT_ACCEPT: 'image/*',
  MAX_RECEIPT_BYTES: 5 * 1024 * 1024,
}));

import { FundingStep } from '../../components/pool/FundingStep';
import { DEFAULT_FUNDING_CHOICE } from '../../components/pool/fundingChoice';
import type { FundingChoice } from '../../components/pool/fundingChoice';
import { PaidWithControl } from '../../components/pool/PaidWithControl';
import { PoolTab } from '../../components/pool/PoolTab';
import { PoolTileStatus } from '../../components/pool/PoolTileStatus';

const theme = {
  colors: new Proxy({}, { get: () => '#123456' }),
  shadows: {}, radii: {},
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(ui: React.ReactElement) {
  await act(async () => {
    root.render(<ThemeProvider theme={theme as any}>{ui}</ThemeProvider>);
  });
}

const q = (testId: string) => container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
async function click(el: Element | null) {
  if (!el) throw new Error('element not found');
  await act(async () => { (el as HTMLElement).click(); });
}

// ── FundingStep ───────────────────────────────────────────────────────────

describe('FundingStep', () => {
  function Harness({ onChange }: { onChange: (v: FundingChoice) => void }) {
    const [value, setValue] = React.useState(DEFAULT_FUNDING_CHOICE);
    return <FundingStep value={value} currency="INR" onChange={(v) => { setValue(v); onChange(v); }} />;
  }

  it('defaults to split expenses and reveals pool choices on demand', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    expect(q('funding-split')!.getAttribute('aria-checked')).toBe('true');
    expect(q('funder-contributors')).toBeNull();

    await click(q('funding-pool'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'pool' }));
    expect(q('preset-trip_kitty')).not.toBeNull();
    expect(q('pool-per-person-input')).not.toBeNull();
    expect(q('pool-target-input')).toBeNull();
  });

  it('switches to a sponsor budget with a budget field and approval by default', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await click(q('funding-pool'));
    await click(q('funder-sponsor'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ funder: 'sponsor', preset: 'sponsor_budget', approval: 'always' }));
    expect(q('pool-target-input')).not.toBeNull();
    expect(q('pool-per-person-input')).toBeNull();
    expect(q('pool-allow-peer')).toBeNull();
  });

  it('offers every contributor preset', async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await click(q('funding-pool'));
    await click(q('preset-household'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'household' }));
    await click(q('preset-target_collection'));
    expect(q('pool-target-input')).not.toBeNull();
    expect((q('pool-tolerance-input') as HTMLInputElement).disabled).toBe(true);
  });
});

// ── PaidWithControl ───────────────────────────────────────────────────────

function summaryWith(overdraft: Partial<PoolCycleSummary['overdraft']>): PoolCycleSummary {
  return {
    cycle: {} as any,
    totals: {} as any,
    funding: { targetMinor: null, fundedMinor: 0, state: 'open_ended' },
    arrears: [],
    overdraft: {
      policy: 'graduated', baselineMinor: 4000000, tolerancePercent: 20, toleranceMinor: 800000, floorMinor: -800000,
      balanceMinor: 1000000, headroomMinor: 1800000, zone: 'healthy', latched: false, clearanceThresholdMinor: 0,
      ...overdraft,
    },
  };
}

describe('PaidWithControl', () => {
  it('offers only pool options in a pure pool event', async () => {
    await render(<PaidWithControl model="pool" value="pool" onChange={jest.fn()} summary={null} currency="INR" noun="Kitty" amountMinor={0} />);
    expect(q('paid-with-pool')).not.toBeNull();
    expect(q('paid-with-pool_reimbursement')).not.toBeNull();
    expect(q('paid-with-self')).toBeNull();
  });

  it('also offers a regular split in a hybrid event', async () => {
    const onChange = jest.fn();
    await render(<PaidWithControl model="hybrid" value="pool" onChange={onChange} summary={null} currency="INR" noun="Kitty" amountMinor={0} />);
    await click(q('paid-with-self'));
    expect(onChange).toHaveBeenCalledWith('self');
  });

  it.each([
    [{}, 0, /₹10,000\.00 in the kitty/],
    [{}, 1500000, /into overdraft/],
    [{}, 2900000, /more than the kitty allows/],
    [{ zone: 'blocked', latched: true, balanceMinor: -800000 }, 100, /already paid, you can still record it/],
    [{ zone: 'overdrawn', balanceMinor: -30000, headroomMinor: 770000 }, 0, /overdrawn by ₹300\.00 · ₹7,700\.00 of headroom left/],
  ] as const)('projects the balance as the amount is typed (%#)', async (od, amount, text) => {
    await render(<PaidWithControl model="pool" value="pool" onChange={jest.fn()} summary={summaryWith(od as any)} currency="INR" noun="Kitty" amountMinor={amount} />);
    expect(q('paid-with-status')!.textContent).toMatch(text);
  });

  it('shows no projection for a regular split', async () => {
    await render(<PaidWithControl model="hybrid" value="self" onChange={jest.fn()} summary={summaryWith({})} currency="INR" noun="Kitty" amountMinor={100} />);
    expect(q('paid-with-status')).toBeNull();
  });
});

// ── PoolTileStatus ────────────────────────────────────────────────────────

describe('PoolTileStatus', () => {
  it('flags an overdrawn pool and contributions due', async () => {
    const s = summaryWith({ zone: 'overdrawn', balanceMinor: -460000 });
    s.arrears = [{ entityType: 'user', entityId: 'dev', outstandingMinor: 1500000 }];
    s.totals = { pendingDrawsMinor: 100 } as any;
    await render(<PoolTileStatus summary={s} config={{ preset: 'household', funderMode: 'contributors' } as any} currency="INR" />);
    const text = q('pool-tile-status')!.textContent!;
    expect(text).toMatch(/Fund overdrawn by ₹4,600\.00/);
    expect(text).toMatch(/Overdrawn/);
    expect(text).toMatch(/₹15,000\.00 due/);
    expect(text).toMatch(/Awaiting approval/);
  });

  it('shows what is left and a paused chip', async () => {
    const s = summaryWith({ zone: 'blocked', balanceMinor: 0 });
    s.totals = { pendingDrawsMinor: 0 } as any;
    await render(<PoolTileStatus summary={s} config={{ preset: 'trip_kitty', funderMode: 'contributors' } as any} currency="INR" />);
    expect(q('pool-tile-status')!.textContent).toMatch(/₹0\.00 left of ₹40,000\.00.*Paused/);
  });
});

// ── PoolTab ───────────────────────────────────────────────────────────────

const ALICE = 'alice';
const BOB = 'bob';

function ledgerFixture(): PoolLedger {
  const summary = summaryWith({});
  summary.cycle = {
    id: 'c1', eventId: 'e1', sequence: 1, label: 'October 2026', startDate: '2026-10-01', status: 'open', currency: 'INR',
    openingBalanceMinor: 0, openingCredits: {}, roster: [{ entityType: 'user', entityId: ALICE }, { entityType: 'user', entityId: BOB }],
    createdAt: '', updatedAt: '',
  };
  summary.totals = {
    expectedRegularMinor: 3000000, confirmedRegularMinor: 1500000, confirmedTopUpMinor: 0, overdraftCoverMinor: 0,
    poolSpendMinor: 500000, reimbursementsMinor: 0, pendingDrawsMinor: 20000, balanceMinor: 1000000,
  };
  summary.arrears = [{ entityType: 'user', entityId: BOB, outstandingMinor: 1500000 }];
  const contribution = (id: string, from: string, status: any, received: number) => ({
    id, eventId: 'e1', cycleId: 'c1', fromEntityId: from, fromEntityType: 'user' as const, fromUserId: from, kind: 'regular' as const,
    expectedMinor: 1500000, receivedMinor: received, claimedMinor: status === 'initiated' ? 1500000 : null, currency: 'INR', status,
    auditTrail: [], createdBy: ALICE, createdAt: '2026-10-01', updatedAt: '2026-10-01',
  });
  return {
    summary,
    contributions: [contribution('ca', ALICE, 'confirmed', 1500000), contribution('cb', BOB, 'initiated', 0)],
    entries: [
      { id: 'x1', type: 'draw', at: '2026-10-05', title: 'Groceries', amountMinor: -500000, status: 'approved', actorUserId: BOB, fundingSource: 'pool', receiptUrls: ['/api/settlements/storage-proxy/r.jpg'], counted: true },
      { id: 'x2', type: 'draw', at: '2026-10-06', title: 'Flowers', amountMinor: -20000, status: 'pending', actorUserId: BOB, fundingSource: 'pool_reimbursement', receiptUrls: [], counted: false },
      { id: 'ca', type: 'contribution', at: '2026-10-02', title: 'Contribution', amountMinor: 1500000, status: 'confirmed', actorUserId: ALICE, entityId: ALICE, entityType: 'user', receiptUrls: [], counted: true },
    ],
    spenders: [{ spenderId: BOB, spenderType: 'user', spentMinor: 500000, pendingMinor: 20000, capMinor: null }],
    cycles: [summary.cycle],
  } as PoolLedger;
}

const event = {
  id: 'e1', name: 'Goa', currency: 'INR', status: 'active', createdBy: ALICE, admins: [ALICE],
  fundingModel: 'pool',
  poolConfig: { preset: 'trip_kitty', funderMode: 'contributors', cycleMode: 'single', custodianUserId: ALICE },
} as any;
const participants = [{ userId: ALICE, displayName: 'Alice' }, { userId: BOB, displayName: 'Bob' }] as any;

describe('PoolTab', () => {
  beforeEach(() => mockPoolApi.ledger.mockResolvedValue({ success: true, data: ledgerFixture() }));

  it('shows the cycle, meter, totals, arrears, spenders and activity', async () => {
    await render(<PoolTab event={event} currentUserId={BOB} participants={participants} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);
    expect(q('pool-title')!.textContent).toBe('Kitty · October 2026');
    expect(q('pool-meter')!.getAttribute('data-zone')).toBe('healthy');
    expect(q('pool-totals')!.textContent).toMatch(/collected ₹15,000\.00.*spent ₹5,000\.00.*awaiting approval ₹200\.00/);
    expect(q('pool-arrears')!.textContent).toMatch(/1 contribution outstanding/);
    expect(q('pool-spenders')!.textContent).toMatch(/You/);
    expect(q('ledger-x1')!.innerHTML).toContain('http://api.test/api/settlements/storage-proxy/r.jpg');
    expect(q('ledger-x2')!.textContent).toMatch(/Awaiting approval/);
  });

  it('shows how far each approved claim has been paid back', async () => {
    const ledger = ledgerFixture();
    const claim = (id: string, settlementStatus: string | null) => ({
      id, type: 'draw', at: '2026-10-07', title: `Claim ${id}`, amountMinor: -10000, status: 'approved', actorUserId: BOB,
      fundingSource: 'pool_reimbursement', settlementStatus, receiptUrls: [], counted: true,
    });
    ledger.entries.push(...([claim('r1', null), claim('r2', 'initiated'), claim('r3', 'completed')] as PoolLedger['entries']));
    mockPoolApi.ledger.mockResolvedValue({ success: true, data: ledger });
    await render(<PoolTab event={event} currentUserId={BOB} participants={participants} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);
    expect(q('ledger-r1')!.textContent).toMatch(/To reimburse/);
    expect(q('ledger-r2')!.textContent).toMatch(/Reimbursement sent/);
    expect(q('ledger-r3')!.textContent).toMatch(/Reimbursed/);
  });

  it('gives a member only their own actions', async () => {
    await render(<PoolTab event={event} currentUserId={BOB} participants={participants} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);
    expect(q('mark-paid-cb')!.textContent).toBe('Update payment');
    expect(q('mark-paid-ca')).toBeNull();
    expect(q('confirm-cb')).toBeNull();
    expect(q('pool-pending-approvals')).toBeNull();
    expect(q('pool-settle-up')).toBeNull();
    expect(q('pool-set-amounts')).toBeNull();
    expect(q('pool-add-money')).not.toBeNull();
  });

  it('gives the custodian confirmations, approvals and settle-up', async () => {
    const onChanged = jest.fn();
    await render(<PoolTab event={event} currentUserId={ALICE} participants={participants} groups={[]} settlements={[]} refreshKey={0} onChanged={onChanged} />);
    expect(q('confirm-cb')).not.toBeNull();
    expect(q('pool-pending-approvals')).not.toBeNull();
    expect(q('pool-settle-up')!.textContent).toBe('Settle up');
    expect(q('pool-close-cycle')).toBeNull(); // one-off kitty

    await click(q('approve-draw-x2'));
    expect(mockPoolApi.approveDraw).toHaveBeenCalledWith('x2');
    expect(onChanged).toHaveBeenCalled();
    expect(mockToastPush).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('explains a refused approval in plain language', async () => {
    mockPoolApi.approveDraw.mockRejectedValueOnce({ code: 'POOL_OVERDRAFT_BLOCKED', message: 'x', data: { clearanceRequired: 50000 } });
    await render(<PoolTab event={event} currentUserId={ALICE} participants={participants} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);
    await click(q('approve-draw-x2'));
    expect(mockToastPush).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: expect.stringMatching(/more than ₹500\.00 to resume/) }));
  });

  it('previews the settle-up before committing it', async () => {
    mockPoolApi.previewClose.mockResolvedValue({
      success: true,
      data: {
        openingBalanceMinor: 0, confirmedContributionsMinor: 2000000, poolSpendMinor: 1600000, reimbursementsMinor: 0,
        preCoverBalanceMinor: 400000, closingBalanceMinor: 400000, uncoveredDeficitMinor: 0, coverNeededMinor: 0, overdraftCoverMinor: 0,
        outcome: 'surplus', shareBasis: 'commitment', disposition: 'settle', entityShares: [],
        settlementBalances: { 'user:alice': -100000, 'user:bob': 100000 }, pendingDraws: 0, cycleId: 'c1',
      },
    });
    await render(<PoolTab event={event} currentUserId={ALICE} participants={participants} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);
    await click(q('pool-settle-up'));
    expect(mockPoolApi.previewClose).toHaveBeenCalledWith('e1', { forDissolution: true });
    const shares = q('reconcile-shares')!.textContent!;
    expect(shares).toMatch(/You.*pays ₹1,000\.00/);
    expect(shares).toMatch(/Bob.*gets back ₹1,000\.00/);
    await click(q('reconcile-submit'));
    expect(mockPoolApi.dissolve).toHaveBeenCalledWith('e1', { cover: undefined });
  });

  it('asks who covered a shortfall and sends it with the close', async () => {
    mockPoolApi.previewClose.mockResolvedValue({
      success: true,
      data: {
        openingBalanceMinor: 0, confirmedContributionsMinor: 3000000, poolSpendMinor: 3500000, reimbursementsMinor: 0,
        preCoverBalanceMinor: -500000, closingBalanceMinor: 0, uncoveredDeficitMinor: 0, coverNeededMinor: 500000, overdraftCoverMinor: 500000,
        outcome: 'deficit', shareBasis: 'commitment', disposition: 'carry_forward',
        entityShares: [{ entityType: 'user', entityId: 'alice', netMinor: 250000 }, { entityType: 'user', entityId: 'bob', netMinor: -250000 }],
        settlementBalances: {}, pendingDraws: 0, cycleId: 'c1',
      },
    });
    const household = { ...event, poolConfig: { ...event.poolConfig, preset: 'household', cycleMode: 'recurring' } };
    await render(<PoolTab event={household} currentUserId={ALICE} participants={participants} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);
    await click(q('pool-close-cycle'));
    expect(q('cover-select')).not.toBeNull();
    expect(q('reconcile-shares')!.textContent).toMatch(/Bob.*owes ₹2,500\.00/);
    await click(q('reconcile-submit'));
    expect(mockPoolApi.closeCycle).toHaveBeenCalledWith('e1', { cover: [{ entityType: 'user', entityId: ALICE, amountMinor: 500000 }] });
  });

  it('shows pool payments to act on while active', async () => {
    const legs = [{ id: 'leg1', kind: 'pool_reimbursement', fromUserId: ALICE, toUserId: BOB, amount: 1200, currency: 'INR', status: 'initiated', auditTrail: [{ note: 'Reimbursement for "Sarees"' }] }] as any;
    await render(<PoolTab event={event} currentUserId={BOB} participants={participants} groups={[]} settlements={legs} refreshKey={0} onChanged={jest.fn()} />);
    expect(q('pool-payments')!.textContent).toMatch(/Alice → You.*Reimbursement/);
    expect(q('pool-leg-confirm-leg1')).not.toBeNull();
  });

  it('offers a retry when loading fails', async () => {
    mockPoolApi.ledger.mockRejectedValueOnce(new Error('offline'));
    await render(<PoolTab event={event} currentUserId={BOB} participants={participants} groups={[]} settlements={[]} refreshKey={0} onChanged={jest.fn()} />);
    expect(q('empty')!.textContent).toMatch(/offline/);
  });
});
