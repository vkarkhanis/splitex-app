'use client';

import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { Button, Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@traxettle/ui';
import { getMobileSubscribeLinks } from '../../../utils/mobile-subscribe';
import { resolveEmailLinkView, type EmailLinkView } from '../../../utils/email-link';

// Same frame as the other auth pages (login, register, forgot password).
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

const LinkButton = styled(Button)`
  text-decoration: none;
`;

const StoreRow = styled.div`
  display: flex;
  gap: 10px;
  & > * { flex: 1; }
`;

const SectionLabel = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.textSecondary};
  margin-top: 4px;
`;

const Note = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${(p) => p.theme.colors.muted};
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

type ViewState = EmailLinkView | { kind: 'checking' };

const NEW_LINK_NOTE = 'If you just installed the app, open it and ask for a new sign-in link.';

const subscribeNever = () => () => {};

/** A value only the browser knows; `serverValue` while rendering on the server and hydrating. */
function useBrowserValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNever, read, () => serverValue);
}

export default function EmailLinkLanding() {
  const { appStoreUrl, playStoreUrl } = getMobileSubscribeLinks();
  // The link is read only in the browser. Its query is passed on as it is, never shown or logged.
  const search = useBrowserValue<string | null>(() => window.location.search, null);
  const userAgent = useBrowserValue<string | null>(() => navigator.userAgent, null);
  const maxTouchPoints = useBrowserValue(() => navigator.maxTouchPoints || 0, 0);
  const openedOnLoad = useRef(false);

  const view: ViewState = useMemo(
    () =>
      search === null || userAgent === null
        ? { kind: 'checking' }
        : resolveEmailLinkView({ search, userAgent, maxTouchPoints, playStoreUrl }),
    [search, userAgent, maxTouchPoints, playStoreUrl],
  );

  useEffect(() => {
    if ((view.kind === 'android' || view.kind === 'ios') && view.openOnLoad && !openedOnLoad.current) {
      openedOnLoad.current = true;
      window.location.assign(view.appUrl);
    }
  }, [view]);

  return (
    <Page>
      <Stack>
        <Card data-testid="email-link-page" data-view={view.kind}>
          {view.kind === 'checking' ? (
            <CardHeader>
              <CardTitle>Sign in to Traxettle</CardTitle>
              <CardSubtitle>Checking your sign-in link…</CardSubtitle>
            </CardHeader>
          ) : null}

          {view.kind === 'incomplete' ? (
            <>
              <CardHeader>
                <CardTitle>This sign-in link is incomplete</CardTitle>
                <CardSubtitle>Ask for a new one in the Traxettle app.</CardSubtitle>
              </CardHeader>
              <CardBody>
                <FooterText>
                  Or <FooterLink href="/auth/login" data-testid="email-link-web-signin">sign in on the web</FooterLink>
                </FooterText>
              </CardBody>
            </>
          ) : null}

          {view.kind === 'android' ? (
            <>
              <CardHeader>
                <CardTitle>Finish signing in</CardTitle>
                <CardSubtitle>Open the Traxettle app to finish signing in.</CardSubtitle>
              </CardHeader>
              <CardBody>
                <LinkButton as="a" href={view.appUrl} $variant="primary" $fullWidth data-testid="email-link-open-app">
                  Open in Traxettle
                </LinkButton>
                <Note>
                  No app yet? The button takes you to Google Play. {NEW_LINK_NOTE}
                </Note>
              </CardBody>
            </>
          ) : null}

          {view.kind === 'ios' ? (
            <>
              <CardHeader>
                <CardTitle>Finish signing in</CardTitle>
                <CardSubtitle>Open the Traxettle app to finish signing in.</CardSubtitle>
              </CardHeader>
              <CardBody>
                <LinkButton as="a" href={view.appUrl} $variant="primary" $fullWidth data-testid="email-link-open-app">
                  Open in Traxettle
                </LinkButton>
                <SectionLabel>Don&apos;t have the app?</SectionLabel>
                <StoreRow>
                  <LinkButton as="a" href={appStoreUrl} rel="noreferrer" $variant="outline" data-testid="email-link-app-store">
                    App Store
                  </LinkButton>
                  <LinkButton as="a" href={playStoreUrl} rel="noreferrer" $variant="outline" data-testid="email-link-play-store">
                    Google Play
                  </LinkButton>
                </StoreRow>
                <Note>{NEW_LINK_NOTE}</Note>
              </CardBody>
            </>
          ) : null}

          {view.kind === 'desktop' ? (
            <>
              <CardHeader>
                <CardTitle>Open this link on your phone</CardTitle>
                <CardSubtitle>
                  This link signs you in to the Traxettle app on the phone where you asked for it.
                  Open the email on that phone and tap the link there.
                </CardSubtitle>
              </CardHeader>
              <CardBody>
                <FooterText>
                  To use Traxettle on this computer,{' '}
                  <FooterLink href="/auth/login" data-testid="email-link-web-signin">sign in on the web</FooterLink>.
                </FooterText>
              </CardBody>
            </>
          ) : null}
        </Card>
      </Stack>
    </Page>
  );
}
