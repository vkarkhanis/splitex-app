'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle, Field, Input, Label, useToast } from '@traxettle/ui';
import { getFirebaseServices } from '../../config/firebase-client';
import {
  getDefaultApiBaseUrl,
  getEmulatorApiBaseUrl,
  getResolvedApiBaseUrl,
  isFirebaseEmulatorEnabled,
  isLocalEnv,
  setFirebaseEmulatorEnabled,
} from '../../config/dev-options';
import { toUserFriendlyError } from '../../utils/errorMessages';

type UserPreferences = {
  notifications: boolean;
  currency: string;
  timezone: string;
};

type PaymentMethodType = 'upi' | 'bank' | 'paypal' | 'wise' | 'swift' | 'other';
type UserPaymentMethod = {
  id: string;
  label: string;
  currency: string;
  type: PaymentMethodType;
  details: string;
  isActive: boolean;
};

type UserProfile = {
  userId: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  photoURL?: string;
  authProviders?: ('email' | 'google' | 'microsoft' | 'phone')[];
  hasPassword?: boolean;
  tier: 'free' | 'pro';
  internalTester?: boolean;
  capabilities?: {
    multiCurrencySettlement: boolean;
  };
  preferences: UserPreferences;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

const Page = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
`;

const Container = styled.div`
  width: 100%;
  max-width: 720px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const Buttons = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 6px;
`;

const InlineActions = styled.div`
  display: flex;
  gap: 10px;
  padding-top: 8px;
`;

const Helper = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
`;

const MethodBox = styled.div`
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.radii.md};
  padding: 10px 12px;
  margin-bottom: 8px;
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.error};
  font-weight: 500;
`;

const APP_ENV = (process.env.NEXT_PUBLIC_APP_ENV || (process.env.NODE_ENV === 'development' ? 'local' : 'production')).toLowerCase();
const ENABLE_LOCAL_TIER_SWITCH = process.env.NEXT_PUBLIC_ALLOW_LOCAL_TIER_SWITCH === 'true';

export default function ProfilePage() {
  const { push } = useToast();
  const router = useRouter();

  const apiBaseUrl = useMemo(() => getResolvedApiBaseUrl(), []);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tierSwitching, setTierSwitching] = useState(false);
  const [devUnlockTaps, setDevUnlockTaps] = useState(0);
  const [developerOptionsVisible, setDeveloperOptionsVisible] = useState(false);
  const [useFirebaseEmulator, setUseFirebaseEmulator] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<UserPaymentMethod[]>([]);
  const [newMethod, setNewMethod] = useState<{ label: string; currency: string; type: PaymentMethodType; details: string }>({
    label: '',
    currency: 'USD',
    type: 'bank',
    details: '',
  });
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Get a fresh Firebase ID token from the current user
  const getFreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const services = getFirebaseServices();
      const user = services.auth.currentUser;
      if (!user) return null;
      const idToken = await user.getIdToken(true);
      localStorage.setItem('traxettle.authToken', idToken);
      return idToken;
    } catch {
      return null;
    }
  }, []);

  // Single effect: listen for auth state, then fetch profile when user is available
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { onAuthStateChanged } = await import('firebase/auth');
      const services = getFirebaseServices();

      onAuthStateChanged(services.auth, async (user) => {
        if (cancelled) return;

        if (!user) {
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }

        setIsAuthenticated(true);
        setLoading(true);
        setError('');

        try {
          const idToken = await user.getIdToken(true);
          localStorage.setItem('traxettle.authToken', idToken);

          const resp = await fetch(`${apiBaseUrl}/api/users/profile`, {
            headers: { Authorization: `Bearer ${idToken}` }
          });

          const json = (await resp.json()) as ApiResponse<UserProfile>;
          if (!resp.ok || !json.success || !json.data) {
            throw new Error(json.error || 'Failed to load profile');
          }
          const pmResp = await fetch(`${apiBaseUrl}/api/users/payment-methods`, {
            headers: { Authorization: `Bearer ${idToken}` }
          });
          const pmJson = (await pmResp.json()) as ApiResponse<UserPaymentMethod[]>;

          if (!cancelled) {
            setProfile(json.data);
            setPaymentMethods(pmJson.success && pmJson.data ? pmJson.data : []);
          }
        } catch (e: unknown) {
          if (!cancelled) {
            setError(toUserFriendlyError(e));
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      });
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  const canEdit = Boolean(profile) && isAuthenticated;
  const canShowLocalTierSwitch = APP_ENV === 'local' && ENABLE_LOCAL_TIER_SWITCH;
  const canShowDeveloperOptions = isLocalEnv();

  useEffect(() => {
    if (!canShowDeveloperOptions || typeof window === 'undefined') return;
    setDeveloperOptionsVisible(window.localStorage.getItem('traxettle.dev.options.unlocked') === 'true');
    setUseFirebaseEmulator(isFirebaseEmulatorEnabled());
  }, [canShowDeveloperOptions]);

  const handleVersionTap = () => {
    if (!canShowDeveloperOptions || typeof window === 'undefined') return;
    const next = devUnlockTaps + 1;
    if (next >= 7) {
      window.localStorage.setItem('traxettle.dev.options.unlocked', 'true');
      setDeveloperOptionsVisible(true);
      setDevUnlockTaps(0);
      push({ type: 'success', title: 'Developer options unlocked', message: 'Hidden local tools are now visible.' });
      return;
    }
    setDevUnlockTaps(next);
  };

  const toggleFirebaseEmulator = () => {
    const next = !useFirebaseEmulator;
    setFirebaseEmulatorEnabled(next);
    setUseFirebaseEmulator(next);
    push({
      type: 'success',
      title: `Firebase emulator ${next ? 'enabled' : 'disabled'}`,
      message: 'Reloading to apply the updated local backend target.',
    });
    if (typeof window !== 'undefined') {
      window.setTimeout(() => window.location.reload(), 250);
    }
  };

  const updateProfile = (patch: Partial<UserProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updatePreferences = (patch: Partial<UserPreferences>) => {
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            preferences: {
              ...prev.preferences,
              ...patch
            }
          }
        : prev
    );
  };

  const persistPreferencesPatch = async (patch: Partial<UserPreferences>) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    const freshToken = await getFreshToken();
    if (!freshToken) throw new Error('Not authenticated');

    const resp = await fetch(`${apiBaseUrl}/api/users/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshToken}`
      },
      body: JSON.stringify({ preferences: patch })
    });

    const json = (await resp.json()) as ApiResponse<UserProfile>;
    if (!resp.ok || !json.success) throw new Error(json.error || 'Failed to save');
    // Backend normally returns the updated profile; if it doesn't (e.g. tests/mocks),
    // keep the optimistic UI state and rely on later refreshes.
    if (json.data) {
      setProfile({
        ...json.data,
        preferences: {
          ...(json.data.preferences || {}),
          ...patch,
        },
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !isAuthenticated) return;

    setSaving(true);
    setError('');

    try {
      const freshToken = await getFreshToken();
      if (!freshToken) throw new Error('Not authenticated');

      const resp = await fetch(`${apiBaseUrl}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify(profile)
      });

      const json = (await resp.json()) as ApiResponse<UserProfile>;
      if (!resp.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Failed to save profile');
      }

      setProfile(json.data);
      push({ type: 'success', title: 'Profile updated', message: 'Your changes were saved.' });
    } catch (e: unknown) {
      const friendly = toUserFriendlyError(e);
      setError(friendly);
      push({ type: 'error', title: 'Save failed', message: friendly });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { getAuth, signOut } = await import('firebase/auth');
      const auth = getAuth();
      await signOut(auth);
    } catch { /* ignore */ }

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('traxettle.authToken');
      window.localStorage.removeItem('traxettle.uid');
      window.dispatchEvent(new Event('traxettle:authChange'));
    }

    setIsAuthenticated(false);
    setProfile(null);

    push({ type: 'success', title: 'Signed out', message: 'You are now signed out.' });
    router.push('/');
  };

  const handleTierSwitch = async (nextTier: 'free' | 'pro') => {
    if (!profile) return;
    setTierSwitching(true);
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) throw new Error('Not authenticated');
      const resp = await fetch(`${apiBaseUrl}/api/internal/entitlements/switch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify({ userId: profile.userId, tier: nextTier }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || 'Failed to switch tier');
      const profileResp = await fetch(`${apiBaseUrl}/api/users/profile`, {
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      const profileJson = (await profileResp.json()) as ApiResponse<UserProfile>;
      if (profileJson.success && profileJson.data) {
        setProfile(profileJson.data);
      }
      push({ type: 'success', title: 'Tier updated', message: `Switched to ${nextTier.toUpperCase()}.` });
    } catch (e: unknown) {
      const friendly = toUserFriendlyError(e);
      setError(friendly);
      push({ type: 'error', title: 'Switch failed', message: friendly });
    } finally {
      setTierSwitching(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    if (!newMethod.label.trim() || !newMethod.details.trim()) {
      push({ type: 'error', title: 'Missing fields', message: 'Label and details are required.' });
      return;
    }
    try {
      setMethodsLoading(true);
      const freshToken = await getFreshToken();
      if (!freshToken) throw new Error('Not authenticated');
      const resp = await fetch(`${apiBaseUrl}/api/users/payment-methods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify(newMethod),
      });
      const json = (await resp.json()) as ApiResponse<UserPaymentMethod>;
      if (!resp.ok || !json.success || !json.data) throw new Error(json.error || 'Failed to add payment method');
      setPaymentMethods((prev) => [json.data!, ...prev]);
      setNewMethod({ label: '', currency: newMethod.currency, type: newMethod.type, details: '' });
    } catch (e: unknown) {
      push({ type: 'error', title: 'Add failed', message: toUserFriendlyError(e) });
    } finally {
      setMethodsLoading(false);
    }
  };

  const handleTogglePaymentMethod = async (method: UserPaymentMethod) => {
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) throw new Error('Not authenticated');
      const resp = await fetch(`${apiBaseUrl}/api/users/payment-methods/${method.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify({ isActive: !method.isActive }),
      });
      const json = (await resp.json()) as ApiResponse<UserPaymentMethod>;
      if (!resp.ok || !json.success || !json.data) throw new Error(json.error || 'Failed to update payment method');
      setPaymentMethods((prev) => prev.map((m) => (m.id === json.data!.id ? json.data! : m)));
    } catch (e: unknown) {
      push({ type: 'error', title: 'Update failed', message: toUserFriendlyError(e) });
    }
  };

  const handleDeletePaymentMethod = async (methodId: string) => {
    try {
      const freshToken = await getFreshToken();
      if (!freshToken) throw new Error('Not authenticated');
      const resp = await fetch(`${apiBaseUrl}/api/users/payment-methods/${methodId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || 'Failed to delete payment method');
      setPaymentMethods((prev) => prev.filter((m) => m.id !== methodId));
    } catch (e: unknown) {
      push({ type: 'error', title: 'Delete failed', message: toUserFriendlyError(e) });
    }
  };

  useEffect(() => {
    const handler = async () => {
      try {
        const freshToken = await getFreshToken();
        if (!freshToken) return;
        const resp = await fetch(`${apiBaseUrl}/api/users/profile`, {
          headers: { Authorization: `Bearer ${freshToken}` },
        });
        const json = (await resp.json()) as ApiResponse<UserProfile>;
        if (json.success && json.data) {
          setProfile(json.data);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('traxettle:tierUpdated', handler);
    return () => window.removeEventListener('traxettle:tierUpdated', handler);
  }, [apiBaseUrl, getFreshToken]);

  const providerLabels = (profile?.authProviders || []).map((provider) => {
    if (provider === 'email') return 'Email/password';
    if (provider === 'google') return 'Google';
    if (provider === 'phone') return 'Phone';
    return 'Microsoft';
  });

  const ensureFirebaseSession = useCallback(async (passwordHint?: string) => {
    const services = getFirebaseServices();
    if (services.auth.currentUser) {
      return services.auth.currentUser;
    }

    const existingToken = typeof window !== 'undefined' ? window.localStorage.getItem('traxettle.authToken') : null;
    if (!existingToken) {
      throw new Error('Please sign in again to manage your password.');
    }

    const resp = await fetch(`${apiBaseUrl}/api/auth/bootstrap-firebase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${existingToken}`,
      },
      body: JSON.stringify(passwordHint ? { password: passwordHint } : {}),
    });
    const json = (await resp.json()) as ApiResponse<{ firebaseCustomToken: string }>;
    if (!resp.ok || !json.success || !json.data?.firebaseCustomToken) {
      throw new Error(json.error || 'Please sign in again to continue.');
    }

    const { signInWithCustomToken } = await import('firebase/auth');
    const credential = await signInWithCustomToken(services.auth, json.data.firebaseCustomToken);
    const idToken = await credential.user.getIdToken(true);
    window.localStorage.setItem('traxettle.authToken', idToken);
    window.localStorage.setItem('traxettle.uid', credential.user.uid);
    window.dispatchEvent(new Event('traxettle:authChange'));
    return credential.user;
  }, [apiBaseUrl]);

  const handlePasswordSave = async () => {
    if (!profile) return;
    if (!newPassword || !confirmPassword) {
      push({ type: 'error', title: 'Missing fields', message: 'Enter and confirm your new password.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      push({ type: 'error', title: 'Passwords do not match', message: 'Your confirmation password must match.' });
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      push({
        type: 'error',
        title: 'Weak password',
        message: 'Use at least 8 characters with uppercase, lowercase, and a number.',
      });
      return;
    }
    if (profile.hasPassword && !currentPassword) {
      push({ type: 'error', title: 'Current password required', message: 'Enter your current password to continue.' });
      return;
    }

    setPasswordSaving(true);
    try {
      const {
        EmailAuthProvider,
        GoogleAuthProvider,
        linkWithCredential,
        reauthenticateWithCredential,
        reauthenticateWithPopup,
        updatePassword,
      } = await import('firebase/auth');
      const firebaseUser = await ensureFirebaseSession(profile.hasPassword ? currentPassword : undefined);

      if (profile.hasPassword) {
        const credential = EmailAuthProvider.credential(profile.email, currentPassword);
        await reauthenticateWithCredential(firebaseUser, credential);
        await updatePassword(firebaseUser, newPassword);
      } else {
        if (profile.authProviders?.includes('google')) {
          await reauthenticateWithPopup(firebaseUser, new GoogleAuthProvider());
        }
        const credential = EmailAuthProvider.credential(profile.email, newPassword);
        await linkWithCredential(firebaseUser, credential);
      }

      const freshToken = await firebaseUser.getIdToken(true);
      await fetch(`${apiBaseUrl}/api/auth/revoke-sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}` },
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      push({
        type: 'success',
        title: profile.hasPassword ? 'Password changed' : 'Password set',
        message: 'Please sign in again with your updated credentials.',
      });
      await handleSignOut();
    } catch (e: unknown) {
      const friendly = toUserFriendlyError(e);
      setError(friendly);
      push({ type: 'error', title: 'Password update failed', message: friendly });
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <Page>
      <Container>
        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardSubtitle>Manage your account details and preferences.</CardSubtitle>
          </CardHeader>

          <CardBody>
            {!isAuthenticated ? (
              <>
                <Helper>You are not signed in.</Helper>
                <InlineActions>
                  <Button type="button" $variant="primary" onClick={() => router.push('/auth/login')}>
                    Sign in
                  </Button>
                  <Button type="button" $variant="outline" onClick={() => router.push('/auth/register')}>
                    Register
                  </Button>
                </InlineActions>
              </>
            ) : loading ? (
              <Helper>Loading profile…</Helper>
            ) : !profile ? (
              <>
                <ErrorText>{error || 'Unable to load your profile. Please try again.'}</ErrorText>
                <InlineActions>
                  <Button
                    type="button"
                    $variant="outline"
                    onClick={async () => {
                      setProfile(null);
                      setLoading(true);
                      setError('');
                      try {
                        const freshToken = await getFreshToken();
                        if (!freshToken) throw new Error('Not authenticated');
                        const r = await fetch(`${apiBaseUrl}/api/users/profile`, {
                          headers: { Authorization: `Bearer ${freshToken}` }
                        });
                        const json = (await r.json()) as ApiResponse<UserProfile>;
                        if (json.success && json.data) setProfile(json.data);
                        else setError(json.error || 'Unable to load your profile. Please try again.');
                      } catch (e: unknown) {
                        setError(toUserFriendlyError(e));
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Retry
                  </Button>
                  <Button type="button" $variant="outline" onClick={handleSignOut}>
                    Sign out
                  </Button>
                </InlineActions>
              </>
            ) : (
              <Form onSubmit={handleSave}>
                <Row>
                  <Field>
                    <Label htmlFor="displayName">Display name</Label>
                    <Input
                      id="displayName"
                      value={profile.displayName}
                      onChange={(e) => updateProfile({ displayName: e.target.value })}
                      disabled={!canEdit || saving}
                    />
                  </Field>

                  <Field>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => updateProfile({ email: e.target.value })}
                      disabled={!canEdit || saving}
                    />
                  </Field>
                </Row>

                <Row>
                  <Field>
                    <Label htmlFor="phoneNumber">Phone</Label>
                    <Input
                      id="phoneNumber"
                      value={profile.phoneNumber || ''}
                      onChange={(e) => updateProfile({ phoneNumber: e.target.value })}
                      disabled={!canEdit || saving}
                    />
                  </Field>

                  <Field>
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      value={profile.preferences.currency}
                      onChange={(e) => updatePreferences({ currency: e.target.value })}
                      disabled={!canEdit || saving}
                    />
                  </Field>
                </Row>

                <Row>
                  <Field>
                    <Label htmlFor="tier">Plan Tier</Label>
                    <Input
                      id="tier"
                      value={profile.tier?.toUpperCase() || 'FREE'}
                      disabled
                      readOnly
                    />
                    {profile.tier !== 'pro' && (
                      <>
                        <Helper>Upgrade is purchased in the mobile app.</Helper>
                        <InlineActions>
                          <Button type="button" $variant="primary" onClick={() => router.push('/pro')}>
                            Subscribe on Mobile
                          </Button>
                        </InlineActions>
                      </>
                    )}
                  </Field>

                  <Field>
                    <Label htmlFor="timezone">Timezone</Label>
                    <Input
                      id="timezone"
                      value={profile.preferences.timezone}
                      onChange={(e) => updatePreferences({ timezone: e.target.value })}
                      disabled={!canEdit || saving}
                    />
                  </Field>

                  <Field>
                    <Label htmlFor="notifications">Notifications</Label>
                    <Input
                      id="notifications"
                      value={profile.preferences.notifications ? 'Enabled' : 'Disabled'}
                      onClick={() => {
                        const next = !profile.preferences.notifications;
                        updatePreferences({ notifications: next });
                        persistPreferencesPatch({ notifications: next })
                          .then(() => push({ type: 'success', title: 'Notifications updated', message: `Notifications ${next ? 'enabled' : 'disabled'}.` }))
                          .catch((e: unknown) => {
                            // Revert in-memory toggle if persistence fails.
                            updatePreferences({ notifications: !next });
                            const friendly = toUserFriendlyError(e);
                            push({ type: 'error', title: 'Update failed', message: friendly });
                          });
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        const next = !profile.preferences.notifications;
                        updatePreferences({ notifications: next });
                        persistPreferencesPatch({ notifications: next })
                          .then(() => push({ type: 'success', title: 'Notifications updated', message: `Notifications ${next ? 'enabled' : 'disabled'}.` }))
                          .catch((err: unknown) => {
                            updatePreferences({ notifications: !next });
                            const friendly = toUserFriendlyError(err);
                            push({ type: 'error', title: 'Update failed', message: friendly });
                          });
                      }}
                      disabled={!canEdit || saving}
                      readOnly
                      role="button"
                      tabIndex={canEdit && !saving ? 0 : -1}
                      aria-pressed={profile.preferences.notifications}
                      aria-label="Toggle notifications"
                    />
                    <Helper>Click the field to toggle.</Helper>
                  </Field>
                </Row>

                {canShowLocalTierSwitch && (
                  <Row>
                    <Field>
                      <Label>Local Tier Switch</Label>
                      <InlineActions>
                        <Button
                          type="button"
                          $variant={profile.tier === 'free' ? 'primary' : 'outline'}
                          onClick={() => handleTierSwitch('free')}
                          disabled={tierSwitching}
                        >
                          FREE
                        </Button>
                        <Button
                          type="button"
                          $variant={profile.tier === 'pro' ? 'primary' : 'outline'}
                          onClick={() => handleTierSwitch('pro')}
                          disabled={tierSwitching}
                        >
                          PRO
                        </Button>
                      </InlineActions>
                      <Helper>Available only in local mode.</Helper>
                    </Field>
                  </Row>
                )}

                {developerOptionsVisible && canShowDeveloperOptions && (
                  <Row>
                    <Field>
                      <Label>Developer (Hidden)</Label>
                      <Helper>Firebase Local Emulator Suite (local only).</Helper>
                      <InlineActions>
                        <Button type="button" $variant={useFirebaseEmulator ? 'primary' : 'outline'} onClick={toggleFirebaseEmulator}>
                          {useFirebaseEmulator ? 'Disable Emulator' : 'Enable Emulator'}
                        </Button>
                      </InlineActions>
                      <Helper>
                        API: {useFirebaseEmulator ? getEmulatorApiBaseUrl() : getDefaultApiBaseUrl()}
                      </Helper>
                    </Field>
                  </Row>
                )}

                <Field>
                  <Label>Security</Label>
                  <MethodBox>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Sign-in methods</div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      {providerLabels.length > 0 ? providerLabels.join(', ') : 'Unknown'}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 10 }}>
                      {profile.hasPassword
                        ? 'Change your password with a recent-password check. This signs out all active sessions for safety.'
                        : 'Set a password so you can sign in with email/password in addition to your current provider.'}
                    </div>
                    <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                      {profile.hasPassword && (
                        <Field>
                          <Label htmlFor="currentPassword">Current password</Label>
                          <Input
                            id="currentPassword"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            disabled={passwordSaving}
                          />
                        </Field>
                      )}
                      <Field>
                        <Label htmlFor="newPassword">{profile.hasPassword ? 'New password' : 'Set password'}</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          disabled={passwordSaving}
                        />
                      </Field>
                      <Field>
                        <Label htmlFor="confirmPassword">Confirm password</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          disabled={passwordSaving}
                        />
                      </Field>
                    </div>
                    <InlineActions>
                      <Button type="button" $variant="primary" onClick={handlePasswordSave} disabled={passwordSaving}>
                        {passwordSaving
                          ? 'Saving…'
                          : profile.hasPassword
                            ? 'Change Password'
                            : 'Set Password'}
                      </Button>
                      {profile.hasPassword && (
                        <Button type="button" $variant="outline" onClick={() => router.push('/auth/forgot-password')} disabled={passwordSaving}>
                          Forgot Password
                        </Button>
                      )}
                    </InlineActions>
                  </MethodBox>
                </Field>

                <Field>
                  <Label>Payment Methods</Label>
                  <Helper>Shown to payers during settlement when currency matches.</Helper>
                  {paymentMethods.length === 0 ? (
                    <Helper>No payment methods added yet.</Helper>
                  ) : (
                    paymentMethods.map((method) => (
                      <MethodBox key={method.id}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{method.label} · {method.currency}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{method.type.toUpperCase()}</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>{method.details}</div>
                        <InlineActions>
                          <Button type="button" $variant="outline" onClick={() => handleTogglePaymentMethod(method)}>
                            {method.isActive ? 'Disable' : 'Enable'}
                          </Button>
                          <Button type="button" $variant="outline" onClick={() => handleDeletePaymentMethod(method.id)}>
                            Delete
                          </Button>
                        </InlineActions>
                      </MethodBox>
                    ))
                  )}
                </Field>

                <Row>
                  <Field>
                    <Label htmlFor="pm-label">New Method Label</Label>
                    <Input
                      id="pm-label"
                      value={newMethod.label}
                      onChange={(e) => setNewMethod((prev) => ({ ...prev, label: e.target.value }))}
                      disabled={methodsLoading}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="pm-currency">Currency</Label>
                    <Input
                      id="pm-currency"
                      value={newMethod.currency}
                      onChange={(e) => setNewMethod((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
                      disabled={methodsLoading}
                    />
                  </Field>
                </Row>
                <Row>
                  <Field>
                    <Label htmlFor="pm-type">Method Type</Label>
                    <Input
                      id="pm-type"
                      value={newMethod.type}
                      onChange={(e) => setNewMethod((prev) => ({ ...prev, type: (e.target.value || 'other') as PaymentMethodType }))}
                      disabled={methodsLoading}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="pm-details">Method Details</Label>
                    <Input
                      id="pm-details"
                      value={newMethod.details}
                      onChange={(e) => setNewMethod((prev) => ({ ...prev, details: e.target.value }))}
                      disabled={methodsLoading}
                    />
                  </Field>
                </Row>
                <InlineActions>
                  <Button type="button" $variant="primary" onClick={handleAddPaymentMethod} disabled={methodsLoading}>
                    {methodsLoading ? 'Adding…' : 'Add Payment Method'}
                  </Button>
                </InlineActions>

                {error ? <ErrorText>{error}</ErrorText> : null}

                <Buttons>
                  <Button type="button" $variant="outline" onClick={handleSignOut} disabled={saving}>
                    Sign out
                  </Button>
                  <Button type="submit" $variant="primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                </Buttons>
                {canShowDeveloperOptions && (
                  <Helper onClick={handleVersionTap} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Traxettle v1.0.0
                  </Helper>
                )}
              </Form>
            )}
          </CardBody>
        </Card>
      </Container>
    </Page>
  );
}
