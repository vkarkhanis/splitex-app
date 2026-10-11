import type {
  CreatePoolConfigDto,
  PoolConfig,
  PoolContribution,
  PoolCycle,
  PoolCycleSummary,
  PoolLedger,
  ReconcileResult,
} from '@traxettle/shared';
import { api } from '../api';

export type CoverEntry = { entityId: string; entityType: 'user' | 'group'; amountMinor: number };
export type ClosePreview = ReconcileResult & { cycleId: string; pendingDraws: number; coverNeededMinor: number };

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

/** Thin client for /api/pools — mirrors the web client. */
export const poolService = {
  summary: async (eventId: string) => (await api.get<PoolCycleSummary>(`/api/pools/event/${eventId}/summary`)).data,
  ledger: async (eventId: string, cycleId?: string) =>
    (await api.get<PoolLedger>(`/api/pools/event/${eventId}/ledger${cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : ''}`)).data,
  cycles: async (eventId: string) => (await api.get<PoolCycle[]>(`/api/pools/event/${eventId}/cycles`)).data,
  updateConfig: async (eventId: string, patch: Partial<PoolConfig>) =>
    (await api.put<PoolConfig>(`/api/pools/event/${eventId}/config`, patch)).data,
  convert: async (eventId: string, dto: CreatePoolConfigDto) => (await api.post(`/api/pools/event/${eventId}/convert`, dto)).data,
  setContributions: async (eventId: string, contributions: Array<{ entityId: string; entityType: 'user' | 'group'; expectedMinor: number }>) =>
    (await api.put<PoolContribution[]>(`/api/pools/event/${eventId}/contributions`, { contributions })).data,
  topUp: async (eventId: string, body: { amountMinor: number; note?: string }) =>
    (await api.post<PoolContribution>(`/api/pools/event/${eventId}/top-ups`, body)).data,
  markPaid: async (id: string, body: { amountMinor?: number; reference?: string; note?: string; proofUrl?: string }) =>
    (await api.post<PoolContribution>(`/api/pools/contributions/${id}/mark-paid`, body)).data,
  confirm: async (id: string, receivedMinor?: number) =>
    (await api.post<PoolContribution>(`/api/pools/contributions/${id}/confirm`, receivedMinor ? { receivedMinor } : {})).data,
  reject: async (id: string, reason?: string) =>
    (await api.post<PoolContribution>(`/api/pools/contributions/${id}/reject`, reason ? { reason } : {})).data,
  waive: async (id: string, reason?: string) =>
    (await api.post<PoolContribution>(`/api/pools/contributions/${id}/waive`, reason ? { reason } : {})).data,
  approveDraw: async (expenseId: string) => (await api.post(`/api/pools/expenses/${expenseId}/approve`, {})).data,
  rejectDraw: async (expenseId: string, reason?: string) =>
    (await api.post(`/api/pools/expenses/${expenseId}/reject`, reason ? { reason } : {})).data,
  previewClose: async (eventId: string, body: { forDissolution?: boolean; cover?: CoverEntry[] } = {}) =>
    (await api.post<ClosePreview>(`/api/pools/event/${eventId}/close-preview`, body)).data,
  closeCycle: async (eventId: string, body: { cover?: CoverEntry[]; openNext?: boolean } = {}) =>
    (await api.post<{ closed: PoolCycle; next: PoolCycle | null; settlementIds: string[] }>(`/api/pools/event/${eventId}/close`, body)).data,
  dissolve: async (eventId: string, body: { cover?: CoverEntry[] } = {}) => (await api.post(`/api/pools/event/${eventId}/dissolve`, body)).data,
  payLeg: async (settlementId: string, referenceId?: string) =>
    (await api.post(`/api/settlements/${settlementId}/pay`, { referenceId: referenceId || '', note: 'Paid outside the app' })).data,
  confirmLeg: async (settlementId: string) => (await api.post(`/api/settlements/${settlementId}/approve`, {})).data,
  rejectLeg: async (settlementId: string) =>
    (await api.post(`/api/settlements/${settlementId}/reject`, { reason: 'Payment not received' })).data,

  /** Upload a base64 image/PDF as an expense receipt; returns its URL. */
  uploadReceipt: async (eventId: string, file: { base64: string; contentType: string; filename: string }) =>
    (await api.post<{ url: string }>('/api/uploads', { scope: 'expense_receipt', eventId, ...file })).data.url,
  /** Upload proof of payment for a pool contribution; returns its URL. */
  uploadContributionProof: async (contributionId: string, file: { base64: string; contentType: string; filename: string }) =>
    (await api.post<{ url: string }>('/api/uploads', { scope: 'pool_contribution_proof', contributionId, ...file })).data.url,
};

export interface PickedFile {
  base64: string;
  contentType: string;
  filename: string;
}

interface PickerResult {
  canceled?: boolean;
  assets?: Array<{ uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null }> | null;
}

/** The subset of expo-image-picker this module uses. */
export interface ImagePickerLike {
  requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  requestMediaLibraryPermissionsAsync(): Promise<{ granted: boolean }>;
  launchCameraAsync(options: object): Promise<PickerResult>;
  launchImageLibraryAsync(options: object): Promise<PickerResult>;
}

/**
 * Pick a receipt photo from the camera or the library and read it as base64.
 * Returns null if the user cancels or denies permission (an alert explains).
 */
export async function pickReceiptImage(
  source: 'camera' | 'library',
  deps: {
    imagePicker: ImagePickerLike;
    readAsBase64: (uri: string) => Promise<string>;
    alert: (title: string, message: string) => void;
  },
): Promise<PickedFile | null> {
  const ImagePicker = deps.imagePicker;
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission?.granted) {
    deps.alert('Permission needed', source === 'camera' ? 'Allow camera access to photograph receipts.' : 'Allow photo access to attach receipts.');
    return null;
  }
  const options = { mediaTypes: ['images'], quality: 0.7 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result?.assets?.[0];
  if (result?.canceled || !asset?.uri) return null;
  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_RECEIPT_BYTES) {
    deps.alert('File too large', 'Receipts must be under 5MB.');
    return null;
  }
  const base64 = await deps.readAsBase64(asset.uri);
  return {
    base64,
    contentType: asset.mimeType || 'image/jpeg',
    filename: asset.fileName || `receipt-${Date.now()}.jpg`,
  };
}
