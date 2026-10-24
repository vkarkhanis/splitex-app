jest.mock('../../config/firebase', () => ({
  storage: {
    bucket: (name: string) => ({
      file: (path: string) => ({
        save: jest.fn().mockResolvedValue(undefined),
        getSignedUrl: jest.fn().mockResolvedValue([`https://signed/${name}/${path}`]),
      }),
    }),
  },
  firebaseApp: { options: { storageBucket: 'app-bucket', projectId: 'app-project' } },
}));

import { buildEmulatorObjectUrl, resolveBucketName, storeUpload, UploadError } from '../../services/upload.service';

const saved = { ...process.env };
const png = Buffer.from('img').toString('base64');

afterEach(() => {
  process.env = { ...saved };
  (global as any).fetch = undefined;
});

describe('resolveBucketName', () => {
  it('prefers the env var, then the app option', () => {
    process.env.FIREBASE_STORAGE_BUCKET = 'env-bucket';
    expect(resolveBucketName()).toBe('env-bucket');
    delete process.env.FIREBASE_STORAGE_BUCKET;
    expect(resolveBucketName()).toBe('app-bucket');
  });
});

describe('storeUpload', () => {
  it('stores via the Admin SDK and returns a signed URL', async () => {
    delete process.env.STORAGE_EMULATOR_HOST;
    process.env.FIREBASE_STORAGE_BUCKET = 'b';
    const out = await storeUpload('events/e1/receipts', 'u1', { base64: `data:image/png;base64,${png}`, contentType: 'image/png', filename: 'my bill?.png' });
    expect(out.url).toMatch(/^https:\/\/signed\/b\/events\/e1\/receipts\/u1-\d+-my_bill_.png$/);
    expect(out).toMatchObject({ contentType: 'image/png', size: 3 });
  });

  it('uploads to the storage emulator over HTTP and returns an API proxy path', async () => {
    process.env.STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
    process.env.FIREBASE_STORAGE_BUCKET = 'local-bucket';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as any).fetch = fetchMock;
    const out = await storeUpload('p', 'u1', { base64: png, contentType: 'application/pdf' }, { noun: 'receipt', allowPdf: true });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:9199/upload/storage/v1/b/local-bucket/o'), expect.objectContaining({ method: 'POST' }));
    expect(out.url).toMatch(/^\/api\/settlements\/storage-proxy\/p%2Fu1-/);
  });

  it('surfaces an emulator failure', async () => {
    process.env.STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('down') });
    await expect(storeUpload('p', 'u1', { base64: png })).rejects.toThrow('Storage emulator upload failed (503): down');
  });

  it('validates the payload with noun-specific messages', async () => {
    await expect(storeUpload('p', 'u', {}, { noun: 'proof' })).rejects.toThrow(new UploadError(400, 'base64 is required'));
    await expect(storeUpload('p', 'u', { base64: png, contentType: 'application/pdf' }, { noun: 'proof' }))
      .rejects.toThrow('Unsupported proof file type. Allowed: JPG, PNG, WEBP, HEIC');
    await expect(storeUpload('p', 'u', { base64: png, contentType: 'text/html' }, { noun: 'receipt', allowPdf: true }))
      .rejects.toThrow('Unsupported receipt file type. Allowed: JPG, PNG, WEBP, HEIC, PDF');
    await expect(storeUpload('p', 'u', { base64: '====' }, { noun: 'receipt' })).rejects.toThrow('Invalid receipt size (max 5MB)');
  });

  it('builds proxy URLs only in emulator mode', () => {
    delete process.env.STORAGE_EMULATOR_HOST;
    expect(buildEmulatorObjectUrl('b', 'x/y')).toBeNull();
    process.env.STORAGE_EMULATOR_HOST = 'h:1';
    expect(buildEmulatorObjectUrl('b', 'x/y')).toBe('/api/settlements/storage-proxy/x%2Fy?bucket=b');
  });
});
