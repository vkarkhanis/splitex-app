'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { getFirebaseServices } from '../../../config/firebase-client';
import { toUserFriendlyError } from '../../../utils/errorMessages';

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
} from '@traxettle/ui';

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { fetchSignInMethodsForEmail, signInWithEmailAndPassword } = await import('firebase/auth');
      const services = getFirebaseServices();
      let result;
      try {
        result = await signInWithEmailAndPassword(services.auth, email, password);
      } catch (err: unknown) {
        const methods: string[] = await fetchSignInMethodsForEmail(services.auth, email.trim().toLowerCase()).catch(() => [] as string[]);
        if (methods.includes('google.com') && !methods.includes('password')) {
          throw new Error('This account uses Google sign-in. Sign in with Google or set a password first.');
        }
        throw err;
      }

      const idToken = await result.user.getIdToken();
      localStorage.setItem('traxettle.authToken', idToken);
      localStorage.setItem('traxettle.uid', result.user.uid);
      window.dispatchEvent(new Event('traxettle:authChange'));

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

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');

    try {
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const services = getFirebaseServices();
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(services.auth, provider);

      const idToken = await result.user.getIdToken();
      localStorage.setItem('traxettle.authToken', idToken);
      localStorage.setItem('traxettle.uid', result.user.uid);
      window.dispatchEvent(new Event('traxettle:authChange'));

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

  return (
    <Page>
      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardSubtitle>Sign in to your Traxettle account</CardSubtitle>
          </CardHeader>

          <CardBody>
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
