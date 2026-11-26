import { storage, firebaseApp } from '../config/firebase';

export class UploadError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function resolveBucketName(): string | undefined {
  const fromEnv = process.env.FIREBASE_STORAGE_BUCKET;
  if (fromEnv) return fromEnv;
  const fromApp = firebaseApp?.options?.storageBucket;
  if (typeof fromApp === 'string' && fromApp.trim()) return fromApp;
  const projectId = process.env.FIREBASE_PROJECT_ID || (firebaseApp?.options?.projectId as string | undefined);
  return projectId ? `${projectId}.appspot.com` : undefined;
}

/**
 * In emulator mode, files are served through the API so every platform can
 * reach them (Android 10.0.2.2 vs iOS localhost).
 */
export function buildEmulatorObjectUrl(bucketName: string, objectPath: string): string | null {
  const emulatorHost = process.env.STORAGE_EMULATOR_HOST;
  if (!emulatorHost) return null;
  const encodedPath = encodeURIComponent(objectPath);
  return `/api/settlements/storage-proxy/${encodedPath}?bucket=${encodeURIComponent(bucketName)}`;
}

export interface UploadPayload {
  base64?: unknown;
  contentType?: unknown;
  filename?: unknown;
}

export interface StoredFile {
  url: string;
  filePath: string;
  contentType: string;
  size: number;
}

/**
 * Validate and store a base64 file. `noun` keeps client-facing messages
 * specific ("proof", "receipt"); `allowPdf` admits PDF bills as receipts.
 */
export async function storeUpload(
  pathPrefix: string,
  uploaderId: string,
  payload: UploadPayload,
  opts: { noun?: string; allowPdf?: boolean } = {},
): Promise<StoredFile> {
  const noun = opts.noun || 'file';
  const defaultName = `${noun}-${Date.now()}.jpg`;
  const filename = typeof payload.filename === 'string' ? payload.filename : defaultName;
  const contentType = typeof payload.contentType === 'string' ? payload.contentType : 'image/jpeg';
  const base64Raw = typeof payload.base64 === 'string' ? payload.base64 : '';
  const base64 = base64Raw.replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw new UploadError(400, 'base64 is required');

  const allowed = new Set(opts.allowPdf ? [...IMAGE_TYPES, 'application/pdf'] : IMAGE_TYPES);
  if (!allowed.has(contentType.toLowerCase())) {
    throw new UploadError(400, `Unsupported ${noun} file type. Allowed: JPG, PNG, WEBP, HEIC${opts.allowPdf ? ', PDF' : ''}`);
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadError(400, `Invalid ${noun} size (max 5MB)`);
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${pathPrefix}/${uploaderId}-${Date.now()}-${safeName}`;
  const bucketName = resolveBucketName() || 'default-bucket';
  const emulatorHost = process.env.STORAGE_EMULATOR_HOST;

  if (emulatorHost) {
    // The Admin SDK defaults to HTTPS, which the storage emulator doesn't speak.
    const uploadUrl = `http://${emulatorHost}/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=media&name=${encodeURIComponent(filePath)}`;
    const uploadRes = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': contentType }, body: buffer });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      throw new Error(`Storage emulator upload failed (${uploadRes.status}): ${errText}`);
    }
    return { url: buildEmulatorObjectUrl(bucketName, filePath)!, filePath, contentType, size: buffer.length };
  }

  const file = storage.bucket(bucketName).file(filePath);
  await file.save(buffer, { metadata: { contentType }, resumable: false } as any);
  const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: new Date('2099-01-01') } as any);
  return { url: signedUrl, filePath, contentType, size: buffer.length };
}
