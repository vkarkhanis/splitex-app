import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AppleAuthService } from '../../services/apple-auth.service';

// A stand-in for Apple: our own RSA key plays Apple's signing key, served from a fake JWKS endpoint.
const { privateKey: appleSigningKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, string>), kid: 'kid-1', alg: 'RS256', use: 'sig' };

const RAW_NONCE = 'raw-nonce-123';
const hashed = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function identityToken(overrides: Record<string, unknown> = {}, options: jwt.SignOptions = {}) {
  return jwt.sign(
    {
      iss: 'https://appleid.apple.com',
      aud: 'com.traxettle.app',
      sub: '001234.abcdef.0001',
      email: 'Someone@PrivateRelay.AppleID.com',
      email_verified: 'true',
      is_private_email: 'true',
      nonce: hashed(RAW_NONCE),
      ...overrides,
    },
    appleSigningKey,
    { algorithm: 'RS256', keyid: 'kid-1', expiresIn: '10m', ...options },
  );
}

const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as any;

describe('AppleAuthService', () => {
  let fetchMock: jest.Mock;
  let service: AppleAuthService;

  beforeEach(() => {
    delete process.env.APPLE_SIGNIN_CLIENT_ID;
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_SIGNIN_KEY_ID;
    delete process.env.APPLE_SIGNIN_PRIVATE_KEY;
    fetchMock = jest.fn(async (url: string) => (url.endsWith('/auth/keys') ? json({ keys: [jwk] }) : json({}, false, 500)));
    service = new AppleAuthService(fetchMock as any);
  });

  describe('verifyIdentityToken', () => {
    it("accepts a genuine token for the app and returns Apple's identity", async () => {
      await expect(service.verifyIdentityToken(identityToken(), RAW_NONCE)).resolves.toEqual({
        sub: '001234.abcdef.0001',
        email: 'someone@privaterelay.appleid.com',
        emailVerified: true,
        isPrivateEmail: true,
      });
    });

    it("rejects a token whose nonce isn't this sign-in's (a replayed token)", async () => {
      await expect(service.verifyIdentityToken(identityToken(), 'other-nonce')).rejects.toThrow('nonce mismatch');
      await expect(service.verifyIdentityToken(identityToken({ nonce: undefined }), RAW_NONCE)).rejects.toThrow('nonce mismatch');
    });

    it('rejects a token issued for another app, by another issuer, or expired', async () => {
      await expect(service.verifyIdentityToken(identityToken({ aud: 'com.other.app' }), RAW_NONCE)).rejects.toThrow('rejected');
      await expect(service.verifyIdentityToken(identityToken({ iss: 'https://evil.example' }), RAW_NONCE)).rejects.toThrow('rejected');
      await expect(service.verifyIdentityToken(identityToken({}, { expiresIn: -10 }), RAW_NONCE)).rejects.toThrow('rejected');
    });

    it('rejects a token not signed by Apple', async () => {
      const { privateKey: forger } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const forged = jwt.sign({ iss: 'https://appleid.apple.com', aud: 'com.traxettle.app', sub: 'x', nonce: hashed(RAW_NONCE) }, forger, { algorithm: 'RS256', keyid: 'kid-1' });
      await expect(service.verifyIdentityToken(forged, RAW_NONCE)).rejects.toThrow('rejected');
    });

    it("caches Apple's keys, and refetches once for a key it hasn't seen (key rotation)", async () => {
      await service.verifyIdentityToken(identityToken(), RAW_NONCE);
      await service.verifyIdentityToken(identityToken(), RAW_NONCE);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await expect(service.verifyIdentityToken(identityToken({}, { keyid: 'kid-unknown' }), RAW_NONCE)).rejects.toThrow('unknown key');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('accepts any of several configured app ids', async () => {
      process.env.APPLE_SIGNIN_CLIENT_ID = 'com.traxettle.app,com.traxettle.web';
      await expect(service.verifyIdentityToken(identityToken({ aud: 'com.traxettle.web' }), RAW_NONCE)).resolves.toBeDefined();
    });

    it('requires both a token and a nonce', async () => {
      await expect(service.verifyIdentityToken('', RAW_NONCE)).rejects.toThrow('required');
      await expect(service.verifyIdentityToken(identityToken(), '')).rejects.toThrow('required');
    });
  });

  describe('revokeWithAuthorizationCode', () => {
    const { privateKey: siwaKey, publicKey: siwaPublic } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });

    const configure = () => {
      process.env.APPLE_TEAM_ID = 'TEAM123456';
      process.env.APPLE_SIGNIN_KEY_ID = 'KEY1234567';
      // As stored in a .env/JSON secret: newlines escaped.
      process.env.APPLE_SIGNIN_PRIVATE_KEY = (siwaKey.export({ format: 'pem', type: 'pkcs8' }) as string).replace(/\n/g, '\\n');
    };

    it('refuses clearly when the Sign in with Apple key is not configured', async () => {
      expect(service.isRevocationConfigured()).toBe(false);
      await expect(service.revokeWithAuthorizationCode('code')).rejects.toThrow('not configured');
    });

    it('exchanges the code for a token and revokes it, authenticating with a signed client secret', async () => {
      configure();
      fetchMock.mockImplementation(async (url: string) =>
        url.endsWith('/auth/token') ? json({ refresh_token: 'refresh-1', access_token: 'access-1' }) : json({}),
      );

      await service.revokeWithAuthorizationCode('auth-code-1');

      const [tokenCall, revokeCall] = fetchMock.mock.calls;
      expect(tokenCall[0]).toBe('https://appleid.apple.com/auth/token');
      const tokenBody = new URLSearchParams(tokenCall[1].body);
      expect(tokenBody.get('code')).toBe('auth-code-1');
      expect(tokenBody.get('grant_type')).toBe('authorization_code');
      expect(tokenBody.get('client_id')).toBe('com.traxettle.app');

      const secret = jwt.verify(tokenBody.get('client_secret')!, siwaPublic, { algorithms: ['ES256'] }) as jwt.JwtPayload;
      expect(secret).toEqual(expect.objectContaining({ iss: 'TEAM123456', sub: 'com.traxettle.app', aud: 'https://appleid.apple.com' }));
      expect(jwt.decode(tokenBody.get('client_secret')!, { complete: true })?.header.kid).toBe('KEY1234567');

      expect(revokeCall[0]).toBe('https://appleid.apple.com/auth/revoke');
      const revokeBody = new URLSearchParams(revokeCall[1].body);
      expect(revokeBody.get('token')).toBe('refresh-1');
      expect(revokeBody.get('token_type_hint')).toBe('refresh_token');
    });

    it('reports a failed code exchange or revocation', async () => {
      configure();
      fetchMock.mockResolvedValueOnce(json({ error: 'invalid_grant' }, false, 400));
      await expect(service.revokeWithAuthorizationCode('stale-code')).rejects.toThrow('invalid_grant');

      fetchMock.mockResolvedValueOnce(json({ access_token: 'access-1' })).mockResolvedValueOnce(json({ error: 'invalid_client' }, false, 400));
      await expect(service.revokeWithAuthorizationCode('code')).rejects.toThrow('invalid_client');
    });
  });
});
