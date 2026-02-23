'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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

const ErrorText = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.error};
  font-weight: 500;
`;

const SuccessText = styled.div`
  font-size: 13px;
  color: ${(p) => p.theme.colors.success};
  line-height: 1.5;
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

export default function ForgotPasswordPage() {
  const { push } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      const services = getFirebaseServices();

      await sendPasswordResetEmail(services.auth, email);

      setEmailSent(true);
      push({
        type: 'success',
        title: 'Reset Email Sent',
        message: `Password reset instructions sent to ${email}.`
      });
    } catch (err: unknown) {
      console.error('Forgot password error:', err);
      const friendly = toUserFriendlyError(err);
      setError(friendly);
      push({ type: 'error', title: 'Could not send reset email', message: friendly });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Reset Password</CardTitle>
            <CardSubtitle>
              Enter your email address and we&apos;ll send you a link to reset your password.
            </CardSubtitle>
          </CardHeader>

          <CardBody>
            {emailSent ? (
              <>
                <SuccessText>
                  We&apos;ve sent a password reset link to <strong>{email}</strong>.
                  Please check your inbox (and spam folder) and follow the instructions.
                </SuccessText>

                <Button
                  type="button"
                  $variant="outline"
                  $fullWidth
                  onClick={() => {
                    setEmailSent(false);
                    setEmail('');
                    setError('');
                  }}
                >
                  Send to a different email
                </Button>
              </>
            ) : (
              <Form onSubmit={handleSubmit}>
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

                {error ? <ErrorText>{error}</ErrorText> : null}

                <Button
                  type="submit"
                  $variant="primary"
                  $fullWidth
                  disabled={loading || !email.trim()}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </Form>
            )}

            <FooterText>
              Remember your password?{' '}
              <FooterLink href="/auth/login">Sign in</FooterLink>
            </FooterText>
          </CardBody>
        </Card>
      </Stack>
    </Page>
  );
}
