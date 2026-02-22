'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { getFirebaseServices } from '../../../config/firebase-client';
import { toUserFriendlyError } from '../../../utils/errorMessages';
import type { ConfirmationResult, RecaptchaVerifier as RecaptchaVerifierType } from 'firebase/auth';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Field,
  Input,
  Label,
  useToast,
} from '@splitex/ui';

type SignInMethod = 'email' | 'phone';

const Page = styled.div`
  min-height: 100vh;
  padding: 48px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(p) => p.theme.colors.background};
  animation: fadeIn 0.3s ease;
`;

const Stack = styled.div`
  width: 100%;
  max-width: 420px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Divider = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  margin: 18px 0;
  color: ${(p) => p.theme.colors.muted};
  font-size: 12px;
`;

const DividerLine = styled.div`
  height: 1px;
  background: ${(p) => p.theme.colors.border};
`;

const DividerText = styled.div`
  padding: 0 10px;
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.error};
  font-weight: 500;
`;

const SuccessText = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.success};
  font-weight: 500;
`;

const ResendRow = styled.div`
  display: flex;
  gap: 10px;
`;

const TabRow = styled.div`
  display: flex;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  margin-bottom: 16px;
`;

const Tab = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 10px 0;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  color: ${(p) => (p.$active ? p.theme.colors.primary : p.theme.colors.muted)};
  border-bottom: 2px solid ${(p) => (p.$active ? p.theme.colors.primary : 'transparent')};
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: ${(p) => p.theme.colors.text};
  }
`;

const FooterText = styled.div`
  text-align: center;
  font-size: 13px;
  color: ${(p) => p.theme.colors.muted};
  margin-top: 16px;
`;

const FooterLink = styled(Link)`
  color: ${(p) => p.theme.colors.primary};
  font-weight: 600;
  &:hover { text-decoration: underline; }
`;

const ForgotLink = styled(Link)`
  font-size: 12px;
  color: ${(p) => p.theme.colors.primary};
  text-align: right;
  &:hover { text-decoration: underline; }
`;

export default function LoginPage() {
  const { push } = useToast();
  const router = useRouter();

  const [method, setMethod] = useState<SignInMethod>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Phone state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const recaptchaVerifierRef = useRef<RecaptchaVerifierType | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaWidgetId = useRef<number | null>(null);

  // Cleanup recaptcha on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch { /* ignore */ }
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const switchMethod = (m: SignInMethod) => {
    setMethod(m);
    setError('');
  };

  const ensureRecaptcha = async () => {
    const { RecaptchaVerifier } = await import('firebase/auth');
    const services = getFirebaseServices();

    // Only create a new verifier if we don't have one or it was cleared
    if (!recaptchaVerifierRef.current) {
      // Clear the container's innerHTML to avoid "already rendered" error
      const container = document.getElementById('recaptcha-container');
      if (container) container.innerHTML = '';

      recaptchaVerifierRef.current = new RecaptchaVerifier(services.auth, 'recaptcha-container', {
        size: 'invisible',
      });
      recaptchaWidgetId.current = await recaptchaVerifierRef.current.render();
    }

    return recaptchaVerifierRef.current;
  };

  const resetRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try { recaptchaVerifierRef.current.clear(); } catch { /* ignore */ }
      recaptchaVerifierRef.current = null;
      recaptchaWidgetId.current = null;
    }
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = '';
  };

  // ── Email / Password ──

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const services = getFirebaseServices();
      const result = await signInWithEmailAndPassword(services.auth, email, password);

      const idToken = await result.user.getIdToken();
      localStorage.setItem('splitex.authToken', idToken);
      localStorage.setItem('splitex.uid', result.user.uid);
      window.dispatchEvent(new Event('splitex:authChange'));

      push({ type: 'success', title: 'Sign-In Successful', message: 'Welcome back!' });
      router.push('/');
    } catch (err: unknown) {
      console.error('Email Sign-In error:', err);
      const friendly = toUserFriendlyError(err);
      setError(friendly);
      push({ type: 'error', title: 'Sign-In Failed', message: friendly });
    } finally {
      setLoading(false);
    }
  };

  // ── Phone OTP ──

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      setError('Please enter a phone number.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { signInWithPhoneNumber } = await import('firebase/auth');
      const services = getFirebaseServices();

      const verifier = await ensureRecaptcha();

      const confirmation = await signInWithPhoneNumber(services.auth, phone, verifier);
      confirmationResultRef.current = confirmation;
      setOtpSent(true);
      push({ type: 'success', title: 'OTP Sent', message: `Verification code sent to ${phone}.` });
    } catch (err: unknown) {
      console.error('Send OTP error:', err);
      const friendly = toUserFriendlyError(err);
      setError(friendly);
      push({ type: 'error', title: 'Could not send code', message: friendly });
      resetRecaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setOtp('');
    setError('');
    setOtpSent(false);
    confirmationResultRef.current = null;
    resetRecaptcha();
    // Small delay to let DOM settle after clearing container
    await new Promise((r) => setTimeout(r, 100));
    await handleSendOtp();
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      setError('Please enter the verification code.');
      return;
    }
    if (!confirmationResultRef.current) {
      setError('Your verification session has expired. Please request a new code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await confirmationResultRef.current.confirm(otp);

      const idToken = await result.user.getIdToken();
      localStorage.setItem('splitex.authToken', idToken);
      localStorage.setItem('splitex.uid', result.user.uid);
      window.dispatchEvent(new Event('splitex:authChange'));

      push({ type: 'success', title: 'Sign-In Successful', message: 'Welcome back!' });
      router.push('/');
    } catch (err: unknown) {
      console.error('Verify OTP error:', err);
      const friendly = toUserFriendlyError(err);
      setError(friendly);
      push({ type: 'error', title: 'Verification Failed', message: friendly });
    } finally {
      setLoading(false);
    }
  };

  // ── Google ──

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');

    try {
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const services = getFirebaseServices();
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(services.auth, provider);

      const idToken = await result.user.getIdToken();
      localStorage.setItem('splitex.authToken', idToken);
      localStorage.setItem('splitex.uid', result.user.uid);
      window.dispatchEvent(new Event('splitex:authChange'));

      push({
        type: 'success',
        title: 'Sign-In Successful',
        message: `Welcome back, ${result.user.displayName || result.user.email}!`
      });
      router.push('/');
    } catch (err: unknown) {
      console.error('Google Sign-In error:', err);
      const friendly = toUserFriendlyError(err);
      setError(friendly);
      push({ type: 'error', title: 'Sign-In Failed', message: friendly });
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──

  return (
    <Page>
      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardSubtitle>Sign in to your Splitex account</CardSubtitle>
          </CardHeader>

          <CardBody>
            <div id="recaptcha-container" />

            <TabRow>
              <Tab $active={method === 'email'} onClick={() => switchMethod('email')}>
                Email
              </Tab>
              <Tab $active={method === 'phone'} onClick={() => switchMethod('phone')}>
                Phone
              </Tab>
            </TabRow>

            {/* ── Email / Password Tab ── */}
            {method === 'email' && (
              <Form onSubmit={handleEmailSignIn}>
                <Field>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    $hasError={Boolean(error) && !email}
                  />
                </Field>

                <Field>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    $hasError={Boolean(error) && !password}
                  />
                </Field>

                <ForgotLink href="/auth/forgot-password">Forgot password?</ForgotLink>

                {error ? <ErrorText>{error}</ErrorText> : null}

                <Button
                  type="submit"
                  $variant="primary"
                  $fullWidth
                  disabled={loading || !email.trim() || !password.trim()}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </Form>
            )}

            {/* ── Phone OTP Tab ── */}
            {method === 'phone' && (
              <Form onSubmit={(e) => { e.preventDefault(); otpSent ? handleVerifyOtp() : handleSendOtp(); }}>
                <Field>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={loading || otpSent}
                    $hasError={Boolean(error) && !phone}
                  />
                </Field>

                {!otpSent ? (
                  <Button
                    type="submit"
                    $variant="primary"
                    $fullWidth
                    disabled={loading || !phone.trim()}
                  >
                    {loading ? 'Sending...' : 'Send Verification Code'}
                  </Button>
                ) : (
                  <>
                    <SuccessText>Code sent to {phone}</SuccessText>
                    <Field>
                      <Label htmlFor="otp">Verification Code</Label>
                      <Input
                        id="otp"
                        type="text"
                        placeholder="Enter 6-digit code"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        disabled={loading}
                        $hasError={Boolean(error) && !otp}
                      />
                    </Field>

                    <Button
                      type="submit"
                      $variant="primary"
                      $fullWidth
                      disabled={loading || !otp.trim()}
                    >
                      {loading ? 'Verifying...' : 'Verify & Sign In'}
                    </Button>

                    <ResendRow>
                      <Button type="button" $variant="outline" disabled={loading} onClick={handleResendOtp}>
                        Resend Code
                      </Button>
                      <Button
                        type="button"
                        $variant="outline"
                        disabled={loading}
                        onClick={() => {
                          setOtpSent(false);
                          setOtp('');
                          setError('');
                          confirmationResultRef.current = null;
                          resetRecaptcha();
                        }}
                      >
                        Change Number
                      </Button>
                    </ResendRow>
                  </>
                )}

                {error ? <ErrorText>{error}</ErrorText> : null}
              </Form>
            )}

            <Divider>
              <DividerLine />
              <DividerText>Or continue with</DividerText>
              <DividerLine />
            </Divider>

            <Button
              type="button"
              onClick={handleGoogleSignIn}
              $variant="outline"
              $fullWidth
              disabled={loading}
            >
              {loading ? 'Working...' : 'Sign in with Google'}
            </Button>

            <FooterText>
              Don&apos;t have an account?{' '}
              <FooterLink href="/auth/register">Register</FooterLink>
            </FooterText>
          </CardBody>
        </Card>
      </Stack>
    </Page>
  );
}
