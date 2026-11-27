import type { Metadata } from 'next';
import EmailLinkLanding from './EmailLinkLanding';

// The address bar holds a one-time sign-in code: don't send it on to the stores as a referrer,
// and keep the page out of search results.
export const metadata: Metadata = {
  title: 'Sign in to Traxettle',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function EmailLinkPage() {
  return <EmailLinkLanding />;
}
