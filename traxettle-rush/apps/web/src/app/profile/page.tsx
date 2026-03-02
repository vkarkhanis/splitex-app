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
                        updatePreferences({ notifications: !profile.preferences.notifications });
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        updatePreferences({ notifications: !profile.preferences.notifications });
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
