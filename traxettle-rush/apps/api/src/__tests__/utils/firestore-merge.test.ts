import { applySetMerge, applyUpdate } from '../../utils/firestore-merge';

describe('applySetMerge (set with { merge: true })', () => {
  it('merges nested maps key by key, so keys missing from the write survive', () => {
    const existing = { poolDraw: { status: 'approved', settlementId: 'leg-1', decidedBy: 'alice' }, amount: 4000 };
    const next = applySetMerge(existing, { poolDraw: { status: 'pending', alreadyIncurred: true }, amount: 4500 });
    expect(next).toEqual({ poolDraw: { status: 'pending', settlementId: 'leg-1', decidedBy: 'alice', alreadyIncurred: true }, amount: 4500 });
  });

  it('replaces a field written as an empty map', () => {
    const next = applySetMerge({ caps: { bob: 900 }, other: 1 }, { caps: {} });
    expect(next).toEqual({ caps: {}, other: 1 });
  });

  it('replaces arrays and scalars whole, and replaces a non-map with a map', () => {
    const next = applySetMerge({ tags: ['a', 'b'], note: 'x', meta: 5 }, { tags: ['c'], note: null, meta: { v: 1 } });
    expect(next).toEqual({ tags: ['c'], note: null, meta: { v: 1 } });
  });

  it('skips undefined values and leaves the input untouched', () => {
    const existing = { a: { b: 1 } };
    const next = applySetMerge(existing, { a: { c: undefined, d: 2 } });
    expect(next).toEqual({ a: { b: 1, d: 2 } });
    expect(existing).toEqual({ a: { b: 1 } });
  });
});

describe('applyUpdate (update)', () => {
  it('replaces a nested map outright', () => {
    const next = applyUpdate({ poolDraw: { status: 'approved', settlementId: 'leg-1' }, amount: 4000 }, { poolDraw: { status: 'pending' } });
    expect(next).toEqual({ poolDraw: { status: 'pending' }, amount: 4000 });
  });

  it('reads dotted keys as field paths', () => {
    const next = applyUpdate({ poolConfig: { caps: { bob: 900, carol: 500 }, preset: 'x' } }, { 'poolConfig.caps': { carol: 500 } });
    expect(next).toEqual({ poolConfig: { caps: { carol: 500 }, preset: 'x' } });
  });
});
