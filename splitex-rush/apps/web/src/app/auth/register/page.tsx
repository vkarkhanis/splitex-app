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
} from '@splitex/ui';

const Page = styled.div`
  min-height: 100vh;
  padding: 48px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(p) => p.theme.colors.background};
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

export default function RegisterPage() {
  const { push } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phoneNumber: '',
    password: ''
  });

  const handleGoogleSignUp = async () => {
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
        title: 'Account Created',
        message: `Welcome to Splitex, ${result.user.displayName || result.user.email}!`
      });

      router.push('/profile');
    } catch (err: unknown) {
      console.error('Google Sign-Up error:', err);
      const friendly = toUserFriendlyError(err);
      setError(friendly);
      push({ type: 'error', title: 'Registration Failed', message: friendly });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
      const services = getFirebaseServices();

      const credential = await createUserWithEmailAndPassword(
        services.auth,
        formData.email,
        formData.password
      );

      // Set display name on the Firebase user
      if (formData.displayName) {
        await updateProfile(credential.user, { displayName: formData.displayName });
      }

      const idToken = await credential.user.getIdToken();
      localStorage.setItem('splitex.authToken', idToken);
      localStorage.setItem('splitex.uid', credential.user.uid);
      window.dispatchEvent(new Event('splitex:authChange'));

      push({
        type: 'success',
        title: 'Account Created',
        message: 'Welcome to Splitex! Complete your profile.'
      });

      router.push('/profile');
    } catch (err: unknown) {
      console.error('Email registration error:', err);
      const friendly = toUserFriendlyError(err);
      setError(friendly);
      push({ type: 'error', title: 'Registration Failed', message: friendly });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Create Account</CardTitle>
            <CardSubtitle>Join Splitex to start splitting expenses</CardSubtitle>
          </CardHeader>

          <CardBody>
            <Form onSubmit={handleEmailSignUp}>
              <Field>
                <Label htmlFor="displayName">Full Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.displayName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
                  disabled={loading}
                  $hasError={Boolean(error) && !formData.displayName}
                />
              </Field>

              <Field>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={loading}
                  $hasError={Boolean(error) && !formData.email}
                />
              </Field>

              <Field>
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="+1234567890"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                  disabled={loading}
                />
              </Field>

              <Field>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                  disabled={loading}
                  $hasError={Boolean(error) && !formData.password}
                />
              </Field>

              {error ? <ErrorText>{error}</ErrorText> : null}

              <Button
                type="submit"
                $variant="primary"
                $fullWidth
                disabled={
                  loading ||
                  !formData.displayName ||
                  !formData.email ||
                  !formData.password
                }
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </Form>

            <Divider>
              <DividerLine />
              <DividerText>Or continue with</DividerText>
              <DividerLine />
            </Divider>

            <Button
              type="button"
              onClick={handleGoogleSignUp}
              $variant="outline"
              $fullWidth
              disabled={loading}
            >
              {loading ? 'Working...' : 'Sign up with Google'}
            </Button>

            <FooterText>
              Already have an account?{' '}
              <FooterLink href="/auth/login">Sign in</FooterLink>
            </FooterText>
          </CardBody>
        </Card>
      </Stack>
    </Page>
  );
}
