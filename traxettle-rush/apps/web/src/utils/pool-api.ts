import type {
  CreatePoolConfigDto,
  PoolConfig,
  PoolContribution,
  PoolCycle,
  PoolCycleSummary,
  PoolLedger,
  ReconcileResult,
} from '@traxettle/shared';
import { api } from './api';

export type CoverEntry = { entityId: string; entityType: 'user' | 'group'; amountMinor: number };

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

export const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export const poolApi = {
  summary: (eventId: string) => api.get<PoolCycleSummary>(`/api/pools/event/${eventId}/summary`),
  ledger: (eventId: string, cycleId?: string) =>
    api.get<PoolLedger>(`/api/pools/event/${eventId}/ledger${cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : ''}`),
  cycles: (eventId: string) => api.get<PoolCycle[]>(`/api/pools/event/${eventId}/cycles`),
  updateConfig: (eventId: string, patch: Partial<PoolConfig>) => api.put<PoolConfig>(`/api/pools/event/${eventId}/config`, patch),
  convert: (eventId: string, dto: CreatePoolConfigDto) => api.post(`/api/pools/event/${eventId}/convert`, dto),
  setContributions: (eventId: string, contributions: Array<{ entityId: string; entityType: 'user' | 'group'; expectedMinor: number }>) =>
    api.put<PoolContribution[]>(`/api/pools/event/${eventId}/contributions`, { contributions }),
  topUp: (eventId: string, body: { amountMinor: number; note?: string }) => api.post<PoolContribution>(`/api/pools/event/${eventId}/top-ups`, body),
  markPaid: (id: string, body: { amountMinor?: number; reference?: string; note?: string; proofUrl?: string }) =>
    api.post<PoolContribution>(`/api/pools/contributions/${id}/mark-paid`, body),
  confirm: (id: string, receivedMinor?: number) =>
    api.post<PoolContribution>(`/api/pools/contributions/${id}/confirm`, receivedMinor ? { receivedMinor } : {}),
  reject: (id: string, reason?: string) => api.post<PoolContribution>(`/api/pools/contributions/${id}/reject`, reason ? { reason } : {}),
  waive: (id: string, reason?: string) => api.post<PoolContribution>(`/api/pools/contributions/${id}/waive`, reason ? { reason } : {}),
  approveDraw: (expenseId: string) => api.post(`/api/pools/expenses/${expenseId}/approve`, {}),
  rejectDraw: (expenseId: string, reason?: string) => api.post(`/api/pools/expenses/${expenseId}/reject`, reason ? { reason } : {}),
  previewClose: (eventId: string, body: { forDissolution?: boolean; cover?: CoverEntry[] } = {}) =>
    api.post<ReconcileResult & { cycleId: string; pendingDraws: number; coverNeededMinor: number }>(`/api/pools/event/${eventId}/close-preview`, body),
  closeCycle: (eventId: string, body: { cover?: CoverEntry[]; openNext?: boolean } = {}) =>
    api.post<{ closed: PoolCycle; next: PoolCycle | null; settlementIds: string[] }>(`/api/pools/event/${eventId}/close`, body),
  dissolve: (eventId: string, body: { cover?: CoverEntry[] } = {}) => api.post(`/api/pools/event/${eventId}/dissolve`, body),

  async uploadReceipt(eventId: string, file: File): Promise<string> {
    const base64 = await fileToBase64(file);
    const res = await api.post<{ url: string }>('/api/uploads', {
      scope: 'expense_receipt', eventId, base64, contentType: file.type || 'image/jpeg', filename: file.name,
    });
    return res.data!.url;
  },

  async uploadContributionProof(contributionId: string, file: File): Promise<string> {
    const base64 = await fileToBase64(file);
    const res = await api.post<{ url: string }>('/api/uploads', {
      scope: 'pool_contribution_proof', contributionId, base64, contentType: file.type || 'image/jpeg', filename: file.name,
    });
    return res.data!.url;
  },
};
