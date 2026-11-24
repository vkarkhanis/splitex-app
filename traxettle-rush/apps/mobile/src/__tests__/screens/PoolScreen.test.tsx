/**
 * Smoke test for the pool screen's Phase 2 parts (design doc §9.3, §10.6, §11): it renders with
 * held money, hand-overs and a loan, and the new actions call the API.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native', () => {
  const R = require('react');
  const host = (name: string) => (props: any) => R.createElement(name, props, props.children);
  return {
    View: host('View'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    ScrollView: host('ScrollView'),
    TouchableOpacity: host('TouchableOpacity'),
    Modal: host('Modal'),
    RefreshControl: host('RefreshControl'),
    ActivityIndicator: host('ActivityIndicator'),
    Linking: { openURL: jest.fn() },
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios' },
    StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
  };
});
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn(), EncodingType: { Base64: 'base64' } }));
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#123456' }) } }),
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { userId: mockMe() } }) }));
jest.mock('../../hooks/useSocket', () => ({ useEventSocket: jest.fn() }));
const mockPushToast = jest.fn();
jest.mock('../../context/FeedbackContext', () => ({ useFeedback: () => ({ pushToast: mockPushToast }), ModalToasts: () => null }));

let me = 'anita';
const mockMe = () => me;
const mockGet = jest.fn();
jest.mock('../../api', () => ({ api: { get: (...a: any[]) => mockGet(...a) }, getResolvedApiBaseUrl: async () => 'http://api.test' }));
const mockPool = {
  ledger: jest.fn(),
  recordAdvance: jest.fn().mockResolvedValue({}),
  confirmAdvance: jest.fn().mockResolvedValue({}),
  cancelAdvance: jest.fn().mockResolvedValue({}),
  previewClose: jest.fn(),
  updateConfig: jest.fn().mockResolvedValue({}),
  approveDraw: jest.fn().mockResolvedValue({}),
};
jest.mock('../../services/pool', () => ({ poolService: mockPool, pickReceiptImage: jest.fn() }));

import PoolScreen from '../../screens/PoolScreen';

const event = {
  id: 'e1', name: 'Wedding', currency: 'INR', status: 'active', createdBy: 'anita', admins: ['anita'], fundingModel: 'pool',
  poolConfig: { preset: 'sponsor_budget', funderMode: 'sponsor', cycleMode: 'single', custodianUserId: 'anita', authorizedSpenders: ['ravi'], overdraftPolicy: 'graduated' },
};
const participants = [{ userId: 'anita', displayName: 'Anita' }, { userId: 'ravi', displayName: 'Ravi' }];

function ledger() {
  const cycle = { id: 'c1', eventId: 'e1', sequence: 1, label: 'Wedding', status: 'open', currency: 'INR', openingBalanceMinor: 0, openingCredits: {}, roster: [] };
  return {
    summary: {
      cycle,
      totals: { expectedRegularMinor: 8000000, confirmedRegularMinor: 8000000, confirmedTopUpMinor: 1000000, overdraftCoverMinor: 0, poolSpendMinor: 1500000, reimbursementsMinor: 0, pendingDrawsMinor: 0, balanceMinor: 7500000 },
      overdraft: { policy: 'graduated', baselineMinor: 9000000, tolerancePercent: 20, toleranceMinor: 1800000, floorMinor: -1800000, balanceMinor: 7500000, headroomMinor: 9300000, zone: 'healthy', latched: false, clearanceThresholdMinor: 0 },
      funding: { targetMinor: 8000000, fundedMinor: 9000000, state: 'funded' },
      arrears: [],
      holdings: { withCustodianMinor: 7000000, withSpendersMinor: 500000, heldBy: { 'user:ravi': 500000 }, pendingOutMinor: 100000 },
    },
    contributions: [
      { id: 's1', fromEntityId: 'anita', fromEntityType: 'user', fromUserId: 'anita', kind: 'regular', expectedMinor: 8000000, receivedMinor: 8000000, status: 'confirmed' },
      { id: 'l1', fromEntityId: 'ravi', fromEntityType: 'user', fromUserId: 'ravi', kind: 'top_up', expectedMinor: 1000000, receivedMinor: 1000000, status: 'confirmed', proofUrl: '/api/uploads/transfer.jpg' },
    ],
    advances: [
      { id: 'a1', kind: 'advance', fromUserId: 'anita', toUserId: 'ravi', amountMinor: 100000, status: 'initiated', createdBy: 'anita', createdAt: '2026-11-10' },
      { id: 'a2', kind: 'advance', fromUserId: 'anita', toUserId: 'ravi', amountMinor: 2000000, status: 'confirmed', createdBy: 'anita', createdAt: '2026-11-09', confirmedAt: '2026-11-09', note: 'Decor cash', proofUrl: '/api/uploads/cash.jpg' },
    ],
    entries: [
      { id: 'a2', type: 'advance', advanceKind: 'advance', at: '2026-11-09', title: 'Advance', amountMinor: 2000000, status: 'confirmed', actorUserId: 'anita', fromUserId: 'anita', toUserId: 'ravi', receiptUrls: [], counted: false },
      { id: 'd1', type: 'draw', at: '2026-11-11', title: 'Decor', amountMinor: -1500000, status: 'approved', actorUserId: 'ravi', fundingSource: 'pool', paidFrom: 'advance', receiptUrls: [], counted: true },
    ],
    spenders: [{ spenderId: 'ravi', spenderType: 'user', spentMinor: 1500000, pendingMinor: 0, capMinor: null, heldMinor: 500000 }],
    cycles: [cycle],
  };
}

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map((c) => textOf(c as any)).join('');
let renderer: ReactTestRenderer;
const byId = (id: string) => renderer.root.findAll((n) => n.props.testID === id && typeof n.type === 'string')[0];

async function mount(userId: string) {
  me = userId;
  mockGet.mockImplementation(async (path: string) => ({
    data: path.endsWith('/participants') ? participants : path.startsWith('/api/groups') || path.startsWith('/api/settlements') ? [] : event,
  }));
  mockPool.ledger.mockResolvedValue(ledger());
  await act(async () => { renderer = create(<PoolScreen route={{ params: { eventId: 'e1' } }} navigation={{ navigate: jest.fn() }} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

afterEach(() => { act(() => renderer?.unmount()); jest.clearAllMocks(); });

describe('PoolScreen — Phase 2', () => {
  it('shows the custodian who holds the money, the hand-overs and a loan to pay back', async () => {
    await mount('anita');
    expect(textOf(byId('pool-holdings'))).toBe('With you ₹70,000.00 · With spenders ₹5,000.00 · ₹1,000.00 waiting to be confirmed');
    expect(textOf(byId('pool-movements'))).toMatch(/Advance · Waiting for Ravi to confirm/);
    expect(textOf(byId('pool-loans'))).toMatch(/Ravi lent the budget money: ₹10,000\.00 still to pay back/);
    expect(textOf(byId('pool-spenders'))).toMatch(/holding ₹5,000\.00/);
    expect(textOf(byId('ledger-a2'))).toMatch(/You → Ravi/);
    expect(textOf(byId('ledger-d1'))).toMatch(/paid with money they hold/);
    expect(byId('advance-confirm-a1')).toBeUndefined(); // the custodian isn't the one receiving it
  });

  it('gives money to a spender', async () => {
    await mount('anita');
    await act(async () => { byId('pool-give-money').props.onPress(); });
    await act(async () => { byId('handover-amount').props.onChangeText('500'); });
    await act(async () => { byId('handover-submit').props.onPress(); });
    expect(mockPool.recordAdvance).toHaveBeenCalledWith('e1', { kind: 'advance', userId: 'ravi', amountMinor: 50000, note: undefined, proofUrl: undefined });
  });

  it('pays a lender back early', async () => {
    await mount('anita');
    await act(async () => { byId('pay-back-ravi').props.onPress(); });
    expect(byId('handover-amount').props.value).toBe('10000');
    await act(async () => { byId('handover-submit').props.onPress(); });
    expect(mockPool.recordAdvance).toHaveBeenCalledWith('e1', expect.objectContaining({ kind: 'repayment', userId: 'ravi', amountMinor: 1000000 }));
  });

  it('lets a spender confirm money handed to them and return what they hold', async () => {
    await mount('ravi');
    expect(textOf(byId('pool-holdings'))).toBe("You're holding ₹5,000.00 of the budget's money.");
    await act(async () => { byId('advance-confirm-a1').props.onPress(); });
    expect(mockPool.confirmAdvance).toHaveBeenCalledWith('a1');
    expect(mockPushToast).toHaveBeenCalledWith('success', 'Confirmed', 'Recorded as received.');
    await act(async () => { byId('pool-return-money').props.onPress(); });
    await act(async () => { byId('handover-amount').props.onChangeText('6000'); });
    expect(byId('handover-too-much')).toBeDefined();
    await act(async () => { byId('handover-amount').props.onChangeText('2000'); });
    await act(async () => { byId('handover-submit').props.onPress(); });
    expect(mockPool.recordAdvance).toHaveBeenCalledWith('e1', { kind: 'return', amountMinor: 200000, note: undefined, proofUrl: undefined });
    expect(mockPushToast).toHaveBeenLastCalledWith('success', 'Money returned', 'Waiting for Anita to confirm.');
  });

  it('confirms the custodian\'s hand-over with a message, like web', async () => {
    await mount('anita');
    await act(async () => { byId('pool-give-money').props.onPress(); });
    await act(async () => { byId('handover-amount').props.onChangeText('500'); });
    await act(async () => { byId('handover-submit').props.onPress(); });
    expect(mockPushToast).toHaveBeenCalledWith('success', 'Money handed over', 'Waiting for them to confirm.');
  });

  it('opens the proof attached to a hand-over or a contribution', async () => {
    const { Linking } = require('react-native');
    await mount('ravi');
    await act(async () => { await byId('advance-proof-a2').props.onPress(); });
    expect(Linking.openURL).toHaveBeenCalledWith('http://api.test/api/uploads/cash.jpg');
    await act(async () => { await byId('contribution-proof-l1').props.onPress(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(Linking.openURL).toHaveBeenLastCalledWith('http://api.test/api/uploads/transfer.jpg');
  });

  it("tells someone who joined a Fund mid-month that their dues start next month", async () => {
    const part = ledger();
    const earlier = { ...part.summary.cycle, id: 'c0', sequence: 1, status: 'closed', closeReason: 'membership_change', roster: [{ entityType: 'user', entityId: 'anita' }] };
    part.summary.cycle = { ...part.summary.cycle, sequence: 2 };
    part.cycles = [earlier as any, part.summary.cycle];
    part.contributions = part.contributions.filter((c) => c.kind !== 'regular') as any;
    mockPool.ledger.mockResolvedValue(part);
    me = 'ravi';
    mockGet.mockImplementation(async (path: string) => ({
      data: path.endsWith('/participants') ? participants : path.startsWith('/api/groups') || path.startsWith('/api/settlements') ? [] : event,
    }));
    await act(async () => { renderer = create(<PoolScreen route={{ params: { eventId: 'e1' } }} navigation={{ navigate: jest.fn() }} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(textOf(byId('pool-part-month'))).toBe('You joined mid-month: your dues start next month.');
  });

  it('Phase 3: an approver sees spends waiting for approval, with what was entered in another currency', async () => {
    const withApprover = { ...event, poolConfig: { ...event.poolConfig, approverUserIds: ['ravi'], expenseApproval: 'always' } };
    const l = ledger();
    l.entries.push({ id: 'd2', type: 'draw', at: '2026-11-12', title: 'Visa fee', amountMinor: -1045000, status: 'pending', actorUserId: 'anita',
      fundingSource: 'pool', alreadyIncurred: true, receiptUrls: [], counted: false, originalAmount: 125, originalCurrency: 'USD' } as any);
    me = 'ravi';
    mockGet.mockImplementation(async (path: string) => ({
      data: path.endsWith('/participants') ? participants : path.startsWith('/api/groups') || path.startsWith('/api/settlements') ? [] : withApprover,
    }));
    mockPool.ledger.mockResolvedValue(l);
    await act(async () => { renderer = create(<PoolScreen route={{ params: { eventId: 'e1' } }} navigation={{ navigate: jest.fn() }} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(textOf(byId('pool-pending-approvals'))).toMatch(/Visa fee.*entered as \$125\.00/);
    await act(async () => { byId('approve-d2').props.onPress(); });
    expect(mockPool.approveDraw).toHaveBeenCalledWith('d2');
  });

  it('Phase 3: the organiser chooses approvers, who can spend, and when spends need approval', async () => {
    await mount('anita');
    await act(async () => { byId('approver-ravi').props.onPress(); });
    expect(mockPool.updateConfig).toHaveBeenLastCalledWith('e1', { approverUserIds: ['ravi'] });
    await act(async () => { byId('approval-mode-always').props.onPress(); });
    expect(mockPool.updateConfig).toHaveBeenLastCalledWith('e1', { expenseApproval: 'always' });
    await act(async () => { byId('spender-ravi').props.onPress(); }); // a Budget: Ravi is listed, so this takes him off
    expect(mockPool.updateConfig).toHaveBeenLastCalledWith('e1', { authorizedSpenders: [] });
    expect(byId('spenders-mode')).toBeUndefined(); // a Budget always keeps its list
  });

  it('waits for hand-overs before settling up, and shows folded payments', async () => {
    mockPool.previewClose.mockResolvedValue({
      openingBalanceMinor: 0, confirmedContributionsMinor: 9000000, poolSpendMinor: 1500000, reimbursementsMinor: 0,
      preCoverBalanceMinor: 7500000, closingBalanceMinor: 7500000, uncoveredDeficitMinor: 0, coverNeededMinor: 0, overdraftCoverMinor: 0,
      outcome: 'surplus', shareBasis: 'custodian', disposition: 'settle', entityShares: [], pendingDraws: 0, cycleId: 'c1',
      settlementBalances: { 'user:ravi': 500000, 'user:anita': -500000 },
      folded: [{ settlementId: 'rep1', expenseId: 'x', kind: 'pool_repayment', fromUserId: 'ravi', toUserId: 'anita', amountMinor: 60000, title: 'Snacks' }],
      separate: [],
    });
    await mount('anita');
    await act(async () => { byId('pool-settle-up').props.onPress(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(textOf(byId('reconcile-waiting-handovers'))).toMatch(/1 hand-over is waiting for confirmation/);
    expect(byId('reconcile-submit').props.disabled).toBe(true);
    expect(textOf(byId('reconcile-row-user:ravi'))).toMatch(/Ravi: gets back ₹4,400\.00.*less ₹600\.00 for Snacks \(repayment\)/);
    expect(textOf(byId('reconcile-folded'))).toMatch(/Ravi → You: ₹600\.00 · Repayment \(spend not approved\) · Snacks/);
    expect(textOf(byId('reconcile-figures'))).toBe('Collected ₹90,000.00 · spent from the pool ₹15,000.00');
    expect(textOf(byId('reconcile-figure-result'))).toBe('Left over ₹75,000.00');
  });

  it('shows money paid back early and money carried in, so the figures add up', async () => {
    mockPool.previewClose.mockResolvedValue({
      openingBalanceMinor: 700000, confirmedContributionsMinor: 2050000, earlyRepaymentsMinor: 400000, poolSpendMinor: 1600000, reimbursementsMinor: 0,
      preCoverBalanceMinor: 750000, closingBalanceMinor: 750000, uncoveredDeficitMinor: 0, coverNeededMinor: 0, overdraftCoverMinor: 0,
      outcome: 'surplus', shareBasis: 'custodian', disposition: 'settle', entityShares: [], pendingDraws: 0, cycleId: 'c1',
      settlementBalances: {}, folded: [], separate: [],
    });
    await mount('anita');
    await act(async () => { byId('pool-settle-up').props.onPress(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(textOf(byId('reconcile-figures'))).toBe(
      'Carried in ₹7,000.00 · collected ₹20,500.00 · paid back early ₹4,000.00 · spent from the pool ₹16,000.00',
    );
    expect(textOf(byId('reconcile-figure-result'))).toBe('Left over ₹7,500.00');
  });
});
