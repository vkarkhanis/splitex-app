
const mockApi = {
  get: jest.fn(async (_path: string): Promise<any> => ({ data: { ok: true } })),
  post: jest.fn(async (_path: string, _body?: any): Promise<any> => ({ data: { id: 'c9', url: 'https://files/r.jpg' } })),
  put: jest.fn(async (_path: string, _body?: any): Promise<any> => ({ data: {} })),
};
jest.mock('../../api', () => ({ api: mockApi }));

import { MAX_RECEIPT_BYTES, pickReceiptImage, poolService } from '../../services/pool';
import type { ImagePickerLike } from '../../services/pool';

beforeEach(() => jest.clearAllMocks());

describe('poolService', () => {
  it('reads summaries, ledgers and cycles', async () => {
    await poolService.summary('e1');
    await poolService.ledger('e1');
    await poolService.ledger('e1', 'c 1');
    await poolService.cycles('e1');
    expect(mockApi.get.mock.calls.map((c) => c[0])).toEqual([
      '/api/pools/event/e1/summary',
      '/api/pools/event/e1/ledger',
      '/api/pools/event/e1/ledger?cycleId=c%201',
      '/api/pools/event/e1/cycles',
    ]);
  });

  it('maps contribution actions to their endpoints', async () => {
    await poolService.setContributions('e1', [{ entityId: 'u', entityType: 'user', expectedMinor: 100 }]);
    await poolService.topUp('e1', { amountMinor: 5 });
    await poolService.markPaid('c1', { amountMinor: 5, reference: 'UPI' });
    await poolService.confirm('c1');
    await poolService.confirm('c1', 7);
    await poolService.reject('c1');
    await poolService.reject('c1', 'no');
    await poolService.waive('c1');
    await poolService.waive('c1', 'away');
    expect(mockApi.put).toHaveBeenCalledWith('/api/pools/event/e1/contributions', { contributions: [{ entityId: 'u', entityType: 'user', expectedMinor: 100 }] });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/event/e1/top-ups', { amountMinor: 5 });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/c1/mark-paid', { amountMinor: 5, reference: 'UPI' });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/c1/confirm', {});
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/c1/confirm', { receivedMinor: 7 });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/c1/reject', { reason: 'no' });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/contributions/c1/waive', { reason: 'away' });
  });

  it('maps draws, cycle actions, config and pool payments', async () => {
    await poolService.approveDraw('x1');
    await poolService.rejectDraw('x1');
    await poolService.rejectDraw('x1', 'over budget');
    await poolService.previewClose('e1', { forDissolution: true });
    await poolService.closeCycle('e1');
    await poolService.dissolve('e1', { cover: [{ entityId: 'u', entityType: 'user', amountMinor: 1 }] });
    await poolService.updateConfig('e1', { authorizedSpenders: ['bob'] });
    await poolService.convert('e1', { preset: 'trip_kitty' });
    await poolService.payLeg('s1');
    await poolService.payLeg('s1', 'UPI-1');
    await poolService.confirmLeg('s1');
    await poolService.rejectLeg('s1');
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/expenses/x1/reject', { reason: 'over budget' });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/event/e1/close-preview', { forDissolution: true });
    expect(mockApi.post).toHaveBeenCalledWith('/api/pools/event/e1/dissolve', { cover: [{ entityId: 'u', entityType: 'user', amountMinor: 1 }] });
    expect(mockApi.put).toHaveBeenCalledWith('/api/pools/event/e1/config', { authorizedSpenders: ['bob'] });
    expect(mockApi.post).toHaveBeenCalledWith('/api/settlements/s1/pay', { referenceId: '', note: 'Paid outside the app' });
    expect(mockApi.post).toHaveBeenCalledWith('/api/settlements/s1/pay', { referenceId: 'UPI-1', note: 'Paid outside the app' });
    expect(mockApi.post).toHaveBeenCalledWith('/api/settlements/s1/reject', { reason: 'Payment not received' });
  });

  it('uploads receipts and contribution proofs, returning their URLs', async () => {
    const file = { base64: 'AAA', contentType: 'image/jpeg', filename: 'r.jpg' };
    expect(await poolService.uploadReceipt('e1', file)).toBe('https://files/r.jpg');
    expect(mockApi.post).toHaveBeenCalledWith('/api/uploads', { scope: 'expense_receipt', eventId: 'e1', ...file });
    await poolService.uploadContributionProof('c1', file);
    expect(mockApi.post).toHaveBeenCalledWith('/api/uploads', { scope: 'pool_contribution_proof', contributionId: 'c1', ...file });
  });
});

describe('pickReceiptImage', () => {
  function picker(overrides: Partial<Record<keyof ImagePickerLike, any>> = {}): ImagePickerLike {
    return {
      requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
      requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
      launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file://cam.jpg', mimeType: 'image/jpeg', fileName: 'cam.jpg', fileSize: 1000 }] })),
      launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file://lib.png', mimeType: 'image/png', fileName: null, fileSize: null }] })),
      ...overrides,
    } as ImagePickerLike;
  }
  const deps = (p: ImagePickerLike) => ({
    imagePicker: p,
    readAsBase64: jest.fn(async (uri: string) => `b64:${uri}`),
    alert: jest.fn(),
  });

  it('photographs a receipt with the camera', async () => {
    const d = deps(picker());
    expect(await pickReceiptImage('camera', d)).toEqual({ base64: 'b64:file://cam.jpg', contentType: 'image/jpeg', filename: 'cam.jpg' });
    expect(d.imagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
  });

  it('picks from the library, defaulting the file name', async () => {
    const out = await pickReceiptImage('library', deps(picker()));
    expect(out).toMatchObject({ base64: 'b64:file://lib.png', contentType: 'image/png' });
    expect(out!.filename).toMatch(/^receipt-\d+\.jpg$/);
  });

  it('explains a denied permission', async () => {
    const d = deps(picker({ requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })) }));
    expect(await pickReceiptImage('camera', d)).toBeNull();
    expect(d.alert).toHaveBeenCalledWith('Permission needed', expect.stringContaining('camera'));
    const d2 = deps(picker({ requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: false })) }));
    expect(await pickReceiptImage('library', d2)).toBeNull();
    expect(d2.alert).toHaveBeenCalledWith('Permission needed', expect.stringContaining('photo'));
  });

  it('returns null when the user cancels', async () => {
    const d = deps(picker({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
    expect(await pickReceiptImage('library', d)).toBeNull();
    expect(d.readAsBase64).not.toHaveBeenCalled();
  });

  it('refuses images over 5MB before reading them', async () => {
    const d = deps(picker({ launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file://big.jpg', fileSize: MAX_RECEIPT_BYTES + 1 }] })) }));
    expect(await pickReceiptImage('camera', d)).toBeNull();
    expect(d.alert).toHaveBeenCalledWith('File too large', expect.any(String));
    expect(d.readAsBase64).not.toHaveBeenCalled();
  });
});
