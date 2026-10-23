jest.mock('../../config/firebase', () => {
  const { createMemoryFirestore } = require('../helpers/memoryFirestore');
  const store = createMemoryFirestore();
  return { __store: store, db: store.db, auth: {}, storage: {}, firebaseApp: { options: {} } };
});

import { AuthService } from '../../services/auth.service';
import { AppleAuthError, AppleAuthService } from '../../services/apple-auth.service';

const { __store: store } = require('../../config/firebase');

const verify = jest.spyOn(AppleAuthService.prototype, 'verifyIdentityToken');
const identity = (overrides: Partial<{ sub: string; email?: string; emailVerified: boolean; isPrivateEmail: boolean }> = {}) => ({
  sub: 's1',
  email: 'ann@example.com',
  emailVerified: true,
  isPrivateEmail: false,
  ...overrides,
});
const signIn = (fullName?: string) =>
  new AuthService().signInWithApple({ identityToken: 'token', rawNonce: 'nonce', fullName });

describe('AuthService.signInWithApple', () => {
  beforeEach(() => {
    store.reset();
    verify.mockReset();
  });

  it('creates an account for a new Apple user, named from Apple', async () => {
    verify.mockResolvedValue(identity());
    const user = await signIn('Ann Lee');

    expect(user).toEqual(expect.objectContaining({ id: 'apple-s1', email: 'ann@example.com', displayName: 'Ann Lee', authProviders: ['apple'] }));
    expect(store.get('users', 'apple-s1')).toEqual(expect.objectContaining({ appleSub: 's1', tier: 'free', authProviders: ['apple'] }));
    expect(verify).toHaveBeenCalledWith('token', 'nonce');
  });

  it('finds a returning Apple user by their Apple id, even if the shared email changed', async () => {
    verify.mockResolvedValue(identity());
    await signIn('Ann Lee');
    verify.mockResolvedValue(identity({ email: 'ann.new@example.com' }));

    const again = await signIn(); // Apple only sends the name the first time
    expect(again.id).toBe('apple-s1');
    expect(again.displayName).toBe('Ann Lee');
    expect(store.all('users')).toHaveLength(1);
  });

  it('links Apple to an existing account with the same verified email', async () => {
    store.seed('users', 'u-1', { userId: 'u-1', email: 'bob@example.com', displayName: 'Bob', authProviders: ['email'] });
    verify.mockResolvedValue(identity({ sub: 's2', email: 'bob@example.com' }));

    const user = await signIn();
    expect(user.id).toBe('u-1');
    expect(user.authProviders).toEqual(['email', 'apple']);
    expect(store.get('users', 'u-1')).toEqual(expect.objectContaining({ appleSub: 's2', authProviders: ['email', 'apple'] }));
    expect(store.get('users', 'apple-s2')).toBeNull();
  });

  it("doesn't link on an email Apple hasn't verified", async () => {
    store.seed('users', 'u-1', { userId: 'u-1', email: 'bob@example.com', authProviders: ['email'] });
    verify.mockResolvedValue(identity({ sub: 's3', email: 'bob@example.com', emailVerified: false }));

    expect((await signIn()).id).toBe('apple-s3');
  });

  it("names a private-relay user 'Traxettle user' when Apple shares no name", async () => {
    verify.mockResolvedValue(identity({ sub: 's4', email: 'x1y2@privaterelay.appleid.com', isPrivateEmail: true }));
    expect((await signIn()).displayName).toBe('Traxettle user');
  });

  it('refuses a new account when Apple shares no email at all', async () => {
    verify.mockResolvedValue(identity({ sub: 's5', email: undefined }));
    await expect(signIn()).rejects.toThrow("didn't share an email");
    await expect(signIn()).rejects.toBeInstanceOf(AppleAuthError);
  });

  it('passes on a rejected identity token', async () => {
    verify.mockRejectedValue(new AppleAuthError('Apple identity token nonce mismatch'));
    await expect(signIn()).rejects.toThrow('nonce mismatch');
    expect(store.all('users')).toEqual([]);
  });
});
