import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const KEYS_TTL_MS = 60 * 60 * 1000;

export interface AppleIdentity {
  /** Apple's stable user id for this app ("sub"). */
  sub: string;
  /** May be a private relay address (…@privaterelay.appleid.com). */
  email?: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

interface AppleJwk {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

export class AppleAuthError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
  }
}

/** Bundle ids the identity token may be issued for (`aud`); the iOS app's by default. */
function clientIds(): string[] {
  return (process.env.APPLE_SIGNIN_CLIENT_ID || 'com.traxettle.app')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Sign in with Apple, verified by our API (like Google sign-in): the app sends the identity token
 * Apple gave it, we check it against Apple's published keys, and the API signs the app into Firebase
 * with a custom token. So Firebase Authentication needs no Apple provider set up.
 *
 * Account deletion must also revoke the user's Apple authorization (App Review 5.1.1(v)); that uses
 * a Sign in with Apple key (APPLE_TEAM_ID, APPLE_SIGNIN_KEY_ID, APPLE_SIGNIN_PRIVATE_KEY).
 */
export class AppleAuthService {
  private keys: AppleJwk[] = [];
  private keysFetchedAt = 0;

  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  /**
   * Checks the identity token's signature, issuer, audience and expiry, and that its nonce is the
   * SHA-256 of the raw nonce the app generated for this sign-in (so a token can't be replayed).
   */
  async verifyIdentityToken(identityToken: string, rawNonce: string): Promise<AppleIdentity> {
    if (!identityToken || !rawNonce) throw new AppleAuthError('Apple identity token and nonce are required', 400);
    const decoded = jwt.decode(identityToken, { complete: true });
    const kid = decoded && typeof decoded === 'object' ? decoded.header?.kid : undefined;
    if (!kid) throw new AppleAuthError('Malformed Apple identity token');

    const jwk = await this.findKey(kid);
    const publicKey = crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(identityToken, publicKey, {
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER,
        audience: clientIds() as [string, ...string[]],
      }) as jwt.JwtPayload;
    } catch (err: any) {
      throw new AppleAuthError(`Apple identity token rejected: ${err?.message || 'invalid'}`);
    }

    if (typeof payload.nonce !== 'string' || payload.nonce !== sha256Hex(rawNonce)) {
      throw new AppleAuthError('Apple identity token nonce mismatch');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) throw new AppleAuthError('Apple identity token has no subject');

    const truthy = (value: unknown) => value === true || value === 'true';
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined,
      emailVerified: truthy(payload.email_verified),
      isPrivateEmail: truthy(payload.is_private_email),
    };
  }

  /** True when the Sign in with Apple key needed for revocation is configured. */
  isRevocationConfigured(): boolean {
    return Boolean(process.env.APPLE_TEAM_ID && process.env.APPLE_SIGNIN_KEY_ID && process.env.APPLE_SIGNIN_PRIVATE_KEY);
  }

  /**
   * Revokes the user's Sign in with Apple authorization, as Apple requires when an account is
   * deleted: exchanges a fresh authorization code for a token, then revokes that token.
   */
  async revokeWithAuthorizationCode(authorizationCode: string): Promise<void> {
    if (!authorizationCode) throw new AppleAuthError('Apple authorization code is required', 400);
    if (!this.isRevocationConfigured()) {
      throw new AppleAuthError('Sign in with Apple key is not configured (APPLE_TEAM_ID, APPLE_SIGNIN_KEY_ID, APPLE_SIGNIN_PRIVATE_KEY)', 500);
    }
    const clientId = clientIds()[0];
    const clientSecret = this.clientSecret(clientId);

    const tokenRes = await this.fetchImpl(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: authorizationCode, grant_type: 'authorization_code' }).toString(),
    });
    const tokens: any = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      throw new AppleAuthError(`Apple token exchange failed (${tokenRes.status}): ${tokens?.error || 'unknown'}`, 502);
    }
    const token = tokens.refresh_token || tokens.access_token;
    const tokenTypeHint = tokens.refresh_token ? 'refresh_token' : 'access_token';
    if (!token) throw new AppleAuthError('Apple token exchange returned no token', 502);

    const revokeRes = await this.fetchImpl(APPLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token, token_type_hint: tokenTypeHint }).toString(),
    });
    if (!revokeRes.ok) {
      const detail: any = await revokeRes.json().catch(() => ({}));
      throw new AppleAuthError(`Apple token revocation failed (${revokeRes.status}): ${detail?.error || 'unknown'}`, 502);
    }
  }

  /** Short-lived client secret: a JWT signed with the Sign in with Apple key (ES256). */
  private clientSecret(clientId: string): string {
    const privateKey = String(process.env.APPLE_SIGNIN_PRIVATE_KEY).replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: APPLE_ISSUER, sub: clientId },
      privateKey,
      { algorithm: 'ES256', keyid: process.env.APPLE_SIGNIN_KEY_ID },
    );
  }

  /** Apple's signing key with this id; refetches when stale or when Apple has rotated keys. */
  private async findKey(kid: string): Promise<AppleJwk> {
    const fresh = Date.now() - this.keysFetchedAt < KEYS_TTL_MS;
    let key = fresh ? this.keys.find((k) => k.kid === kid) : undefined;
    if (!key) {
      const res = await this.fetchImpl(APPLE_KEYS_URL);
      if (!res.ok) throw new AppleAuthError(`Could not fetch Apple's signing keys (${res.status})`, 502);
      const body: any = await res.json();
      this.keys = Array.isArray(body?.keys) ? body.keys : [];
      this.keysFetchedAt = Date.now();
      key = this.keys.find((k) => k.kid === kid);
    }
    if (!key) throw new AppleAuthError('Apple identity token signed with an unknown key');
    return key;
  }
}
