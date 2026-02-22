'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import styled from 'styled-components';
import { useSplitexTheme, useToast } from '@splitex/ui';
import { useUserSocket } from '../hooks/useSocket';

const Wrapper = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: 100;
  background: ${(p) => p.theme.colors.surface};
  backdrop-filter: blur(16px);
  border-bottom: 1px solid ${(p) => p.theme.colors.border};

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, ${(p) => p.theme.colors.primary}, ${(p) => p.theme.colors.secondary}, ${(p) => p.theme.colors.accent});
  }
`;

const HeaderInner = styled.div`
  max-width: 1140px;
  margin: 0 auto;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;

  a {
    font-weight: 800;
    letter-spacing: -0.03em;
    font-size: 18px;
    background: linear-gradient(135deg, ${(p) => p.theme.colors.primary}, ${(p) => p.theme.colors.secondary});
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  span {
    font-size: 11px;
    color: ${(p) => p.theme.colors.muted};
    font-weight: 500;
    letter-spacing: 0.02em;

    @media (max-width: 640px) {
      display: none;
    }
  }
`;

const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: 4px;

  @media (max-width: 640px) {
    gap: 2px;
  }
`;

const NavLink = styled(Link)<{ $active?: boolean }>`
  padding: 7px 12px;
  border-radius: ${(p) => p.theme.radii.sm};
  font-size: 13px;
  font-weight: 500;
  color: ${(p) => p.$active ? p.theme.colors.primary : p.theme.colors.textSecondary};
  background: ${(p) => p.$active ? p.theme.colors.infoBg : 'transparent'};
  transition: all 0.15s ease;

  &:hover {
    color: ${(p) => p.theme.colors.text};
    background: ${(p) => p.theme.colors.surfaceHover};
  }

  @media (max-width: 640px) {
    padding: 7px 8px;
    font-size: 12px;
  }
`;

const ThemeSelect = styled.select`
  border-radius: ${(p) => p.theme.radii.sm};
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surface};
  color: ${(p) => p.theme.colors.textSecondary};
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${(p) => p.theme.colors.borderHover};
  }

  &:focus {
    border-color: ${(p) => p.theme.colors.primary};
  }
`;

const Main = styled.main`
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 20px 48px;
  min-height: calc(100vh - 52px);
`;

const SignOutButton = styled.button`
  padding: 7px 12px;
  border-radius: ${(p) => p.theme.radii.sm};
  border: none;
  background: none;
  color: ${(p) => p.theme.colors.textSecondary};
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  transition: all 0.15s ease;

  &:hover {
    color: ${(p) => p.theme.colors.error};
    background: ${(p) => p.theme.colors.errorBg};
  }

  @media (max-width: 640px) {
    padding: 7px 8px;
    font-size: 12px;
  }
`;

const Separator = styled.div`
  width: 1px;
  height: 20px;
  background: ${(p) => p.theme.colors.border};
  margin: 0 4px;

  @media (max-width: 640px) {
    margin: 0 2px;
  }
`;

export function WebAppShell(props: { children: React.ReactNode }) {
  const { children } = props;
  const { themeName, setThemeName } = useSplitexTheme();
  const { push } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('splitex.authToken') : null;
    setIsAuthenticated(Boolean(token));
    setUserId(typeof window !== 'undefined' ? window.localStorage.getItem('splitex.uid') || undefined : undefined);

    const handleStorageChange = () => {
      const t = window.localStorage.getItem('splitex.authToken');
      setIsAuthenticated(Boolean(t));
      setUserId(window.localStorage.getItem('splitex.uid') || undefined);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('splitex:authChange', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('splitex:authChange', handleStorageChange);
    };
  }, []);

  useUserSocket(userId, (type, payload) => {
    if (type !== 'user:tier-updated') return;
    const nextTier = payload?.tier === 'pro' ? 'Pro' : 'Free';
    push({ type: 'info', title: 'Plan updated', message: `Your plan changed to ${nextTier}.` });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('splitex:tierUpdated', { detail: payload }));
    }
  });

  const handleSignOut = useCallback(async () => {
    try {
      const { getAuth, signOut } = await import('firebase/auth');
      const auth = getAuth();
      await signOut(auth);
    } catch {
      // Ignore Firebase sign-out errors (e.g. if not initialized)
    }

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('splitex.authToken');
      window.localStorage.removeItem('splitex.uid');
      window.dispatchEvent(new Event('splitex:authChange'));
    }

    push({ type: 'success', title: 'Signed out', message: 'You have been signed out.' });
    router.push('/');
  }, [push, router]);

  return (
    <Wrapper suppressHydrationWarning>
      <Header suppressHydrationWarning>
        <HeaderInner>
          <Brand suppressHydrationWarning>
            <Link href="/">Splitex</Link>
            <span>Expense Splitting</span>
          </Brand>

          <Nav suppressHydrationWarning>
            {isAuthenticated ? (
              <>
                <NavLink href="/dashboard" $active={pathname === '/dashboard' || pathname?.startsWith('/events')} data-testid="nav-dashboard">Dashboard</NavLink>
                <NavLink href="/invitations" $active={pathname === '/invitations'} data-testid="nav-invitations">Invitations</NavLink>
                <NavLink href="/profile" $active={pathname === '/profile'} data-testid="nav-profile">Profile</NavLink>
                <Separator />
                <SignOutButton onClick={handleSignOut} data-testid="nav-signout">Sign out</SignOutButton>
              </>
            ) : (
              <>
                <NavLink href="/auth/login" $active={pathname === '/auth/login'} data-testid="nav-signin">Sign in</NavLink>
                <NavLink href="/auth/register" $active={pathname === '/auth/register'} data-testid="nav-register">Register</NavLink>
              </>
            )}
            <Separator />
            <ThemeSelect value={themeName} onChange={(e) => setThemeName(e.target.value as any)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="ocean">Ocean</option>
              <option value="forest">Forest</option>
              <option value="midnight">Midnight</option>
            </ThemeSelect>
          </Nav>
        </HeaderInner>
      </Header>

      <Main>{children}</Main>
    </Wrapper>
  );
}
