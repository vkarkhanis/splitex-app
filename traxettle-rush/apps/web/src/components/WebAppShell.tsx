'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import styled from 'styled-components';
import { Button, useTraxettleTheme, useToast } from '@traxettle/ui';
import { useUserSocket } from '../hooks/useSocket';
import { api } from '../utils/api';

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

const RightCluster = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
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

const ProfileButton = styled.button<{ $open?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px solid ${(p) => (p.$open ? p.theme.colors.borderHover : p.theme.colors.border)};
  background: ${(p) => (p.$open ? p.theme.colors.surfaceHover : p.theme.colors.surface)};
  cursor: pointer;
  color: ${(p) => p.theme.colors.text};
  transition: all 0.15s ease;

  &:hover {
    border-color: ${(p) => p.theme.colors.borderHover};
    background: ${(p) => p.theme.colors.surfaceHover};
  }
`;

const Avatar = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 999px;
  overflow: hidden;
  background: ${(p) => p.theme.colors.primary}22;
  border: 1px solid ${(p) => p.theme.colors.border};
  display: grid;
  place-items: center;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const AvatarInitials = styled.span`
  font-size: 12px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.primary};
`;

const Hello = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.15;

  @media (max-width: 820px) {
    display: none;
  }
`;

const HelloLabel = styled.span`
  font-size: 11px;
  color: ${(p) => p.theme.colors.muted};
  font-weight: 600;
`;

const HelloName = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.text};
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MenuWrap = styled.div`
  position: relative;
`;

const MenuPanel = styled.div`
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 280px;
  border-radius: ${(p) => p.theme.radii.lg};
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surface};
  box-shadow: ${(p) => p.theme.shadows.xl};
  padding: 10px;
  z-index: 200;
`;

const MenuHeader = styled.div`
  padding: 10px 10px 8px;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  margin-bottom: 8px;
`;

const MenuTitle = styled.div`
  font-size: 14px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.text};
`;

const MenuSub = styled.div`
  font-size: 12px;
  color: ${(p) => p.theme.colors.muted};
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: ${(p) => p.theme.radii.md};
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: ${(p) => (p.$danger ? p.theme.colors.error : p.theme.colors.text)};
  font-size: 13px;
  font-weight: 600;

  &:hover {
    background: ${(p) => (p.$danger ? p.theme.colors.errorBg : p.theme.colors.surfaceHover)};
  }
`;

const MenuHint = styled.span`
  font-size: 11px;
  color: ${(p) => p.theme.colors.muted};
  font-weight: 600;
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

const LockOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(15, 23, 42, 0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const LockCard = styled.div`
  width: min(420px, 100%);
  border-radius: ${(p) => p.theme.radii.xl};
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surface};
  box-shadow: ${(p) => p.theme.shadows.xl};
  padding: 24px;
`;

const LockTitle = styled.h2`
  margin: 0 0 8px;
  font-size: 22px;
  color: ${(p) => p.theme.colors.text};
`;

const LockText = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${(p) => p.theme.colors.textSecondary};
  line-height: 1.5;
`;

const LockActions = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
`;

type ProfileData = { userId: string; displayName?: string; email?: string; photoURL?: string };
const SOFT_LOCK_MS = 5 * 60 * 1000;
const HARD_LOGOUT_MS = 30 * 60 * 1000;
const PUBLIC_PATHS = ['/', '/auth/login', '/auth/register', '/auth/forgot-password', '/help'];

function isProtectedPath(pathname?: string | null): boolean {
  const path = pathname || '/';
  return !PUBLIC_PATHS.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`));
}

function initialsFromName(name?: string): string {
  const n = (name || '').trim();
  if (!n) return 'U';
  const parts = n.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || 'U';
  const last = (parts.length > 1 ? parts[parts.length - 1]?.[0] : '') || '';
  return (first + last).toUpperCase();
}

export function WebAppShell(props: { children: React.ReactNode }) {
  const { children } = props;
  const { themeName, setThemeName } = useTraxettleTheme();
  const { push } = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const softLockTimerRef = useRef<number | null>(null);
  const hardLogoutTimerRef = useRef<number | null>(null);

  const displayName = profile?.displayName || profile?.email || 'User';
  const email = profile?.email || '';
  const avatarInitials = useMemo(() => initialsFromName(displayName), [displayName]);
  const protectedRoute = isProtectedPath(pathname);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('traxettle.authToken') : null;
    setIsAuthenticated(Boolean(token));
    setUserId(typeof window !== 'undefined' ? window.localStorage.getItem('traxettle.uid') || undefined : undefined);

    const handleStorageChange = () => {
      const t = window.localStorage.getItem('traxettle.authToken');
      setIsAuthenticated(Boolean(t));
      setUserId(window.localStorage.getItem('traxettle.uid') || undefined);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('traxettle:authChange', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('traxettle:authChange', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    api.get<ProfileData>('/api/users/profile')
      .then((res) => {
        if (cancelled) return;
        setProfile(res.data || null);
      })
      .catch(() => {
        // best-effort
      });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!profileMenuOpen) return;
      const target = e.target as any;
      if (menuRef.current && target && menuRef.current.contains(target)) return;
      setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [profileMenuOpen]);

  useUserSocket(userId, (type, payload) => {
    if (type !== 'user:tier-updated') return;
    const nextTier = payload?.tier === 'pro' ? 'Pro' : 'Free';
    push({ type: 'info', title: 'Plan updated', message: `Your plan changed to ${nextTier}.` });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('traxettle:tierUpdated', { detail: payload }));
    }
  });

  const handleSignOut = useCallback(async () => {
    if (typeof window !== 'undefined') {
      const token = window.localStorage.getItem('traxettle.authToken');
      if (token) {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch {
          // Best-effort server logout before local cleanup.
        }
      }
    }

    try {
      const { getAuth, signOut } = await import('firebase/auth');
      const auth = getAuth();
      await signOut(auth);
    } catch {
      // Ignore Firebase sign-out errors (e.g. if not initialized)
    }

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('traxettle.authToken');
      window.localStorage.removeItem('traxettle.uid');
      window.dispatchEvent(new Event('traxettle:authChange'));
    }

    push({ type: 'success', title: 'Signed out', message: 'You have been signed out.' });
    router.push('/');
  }, [push, router]);

  const resetSessionTimers = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!isAuthenticated || !protectedRoute) return;

    if (softLockTimerRef.current) window.clearTimeout(softLockTimerRef.current);
    if (hardLogoutTimerRef.current) window.clearTimeout(hardLogoutTimerRef.current);

    softLockTimerRef.current = window.setTimeout(() => {
      setSessionLocked(true);
    }, SOFT_LOCK_MS);

    hardLogoutTimerRef.current = window.setTimeout(() => {
      handleSignOut().catch(() => {});
      push({ type: 'info', title: 'Session expired', message: 'You were signed out after 30 minutes of inactivity.' });
    }, HARD_LOGOUT_MS);
  }, [handleSignOut, isAuthenticated, protectedRoute, push]);

  const handleUnlock = useCallback(async () => {
    setUnlockLoading(true);
    try {
      await api.get('/api/users/profile');
      setSessionLocked(false);
      resetSessionTimers();
    } catch (error: any) {
      await handleSignOut();
      push({ type: 'error', title: 'Session expired', message: error?.message || 'Please sign in again.' });
    } finally {
      setUnlockLoading(false);
    }
  }, [handleSignOut, push, resetSessionTimers]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUnauthorized = () => {
      if (protectedRoute) {
        setSessionLocked(true);
      }
    };
    window.addEventListener('traxettle:webAuthUnauthorized', handleUnauthorized as EventListener);
    return () => window.removeEventListener('traxettle:webAuthUnauthorized', handleUnauthorized as EventListener);
  }, [protectedRoute]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAuthenticated || !protectedRoute) {
      setSessionLocked(false);
      if (softLockTimerRef.current) window.clearTimeout(softLockTimerRef.current);
      if (hardLogoutTimerRef.current) window.clearTimeout(hardLogoutTimerRef.current);
      return;
    }

    const markActivity = () => {
      if (!sessionLocked) {
        resetSessionTimers();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !sessionLocked) {
        resetSessionTimers();
      }
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart', 'focus'];
    events.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibility);
    resetSessionTimers();

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
      if (softLockTimerRef.current) window.clearTimeout(softLockTimerRef.current);
      if (hardLogoutTimerRef.current) window.clearTimeout(hardLogoutTimerRef.current);
    };
  }, [isAuthenticated, protectedRoute, resetSessionTimers, sessionLocked]);

  return (
    <Wrapper suppressHydrationWarning>
      <Header suppressHydrationWarning>
        <HeaderInner>
          <Brand suppressHydrationWarning>
            <Link href="/">Traxettle</Link>
            <span>Expense Splitting</span>
          </Brand>

          <RightCluster>
            <Nav suppressHydrationWarning>
              {isAuthenticated ? (
                <>
                  <NavLink href="/dashboard" $active={pathname === '/dashboard' || pathname?.startsWith('/events')} data-testid="nav-dashboard">Dashboard</NavLink>
                  <NavLink href="/invitations" $active={pathname === '/invitations'} data-testid="nav-invitations">Invitations</NavLink>
                </>
              ) : (
                <>
                  <NavLink href="/auth/login" $active={pathname === '/auth/login'} data-testid="nav-signin">Sign in</NavLink>
                  <NavLink href="/auth/register" $active={pathname === '/auth/register'} data-testid="nav-register">Register</NavLink>
                </>
              )}
            </Nav>

            {isAuthenticated && (
              <MenuWrap ref={menuRef}>
                <ProfileButton
                  type="button"
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  $open={profileMenuOpen}
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  data-testid="profile-menu-button"
                >
                  <Avatar aria-hidden>
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} alt="" />
                    ) : (
                      <AvatarInitials>{avatarInitials}</AvatarInitials>
                    )}
                  </Avatar>
                  <Hello>
                    <HelloLabel>Hello</HelloLabel>
                    <HelloName>{displayName}</HelloName>
                  </Hello>
                  <MenuHint>{profileMenuOpen ? '▴' : '▾'}</MenuHint>
                </ProfileButton>

                {profileMenuOpen && (
                  <MenuPanel role="menu" aria-label="Profile menu">
                    <MenuHeader>
                      <MenuTitle>{displayName}</MenuTitle>
                      {email && <MenuSub>{email}</MenuSub>}
                    </MenuHeader>

                    <MenuItem
                      type="button"
                      role="menuitem"
                      onClick={() => { setProfileMenuOpen(false); router.push('/profile'); }}
                      data-testid="menu-profile"
                    >
                      Profile <MenuHint>→</MenuHint>
                    </MenuItem>
                    <MenuItem
                      type="button"
                      role="menuitem"
                      onClick={() => { setProfileMenuOpen(false); router.push('/closed-events'); }}
                      data-testid="menu-closed-events"
                    >
                      Closed Events <MenuHint>→</MenuHint>
                    </MenuItem>
                    <MenuItem
                      type="button"
                      role="menuitem"
                      onClick={() => { setProfileMenuOpen(false); router.push('/unsettled-payments'); }}
                      data-testid="menu-unsettled"
                    >
                      Unsettled Payments <MenuHint>→</MenuHint>
                    </MenuItem>
                    <MenuItem
                      type="button"
                      role="menuitem"
                      onClick={() => { setProfileMenuOpen(false); push({ type: 'info', title: 'Coming soon', message: 'Analytics will return in a future release.' }); }}
                      data-testid="menu-analytics"
                    >
                      Analytics <MenuHint>Coming soon</MenuHint>
                    </MenuItem>
                    <MenuItem
                      type="button"
                      role="menuitem"
                      onClick={() => { setProfileMenuOpen(false); router.push('/help'); }}
                      data-testid="menu-help"
                    >
                      Help & Features <MenuHint>→</MenuHint>
                    </MenuItem>
                    <MenuItem
                      type="button"
                      role="menuitem"
                      onClick={() => { setProfileMenuOpen(false); router.push('/pro'); }}
                      data-testid="menu-pro"
                    >
                      Upgrade to Pro <MenuHint>→</MenuHint>
                    </MenuItem>

                    <div style={{ height: 8 }} />
                    <MenuItem
                      type="button"
                      role="menuitem"
                      $danger
                      onClick={() => { setProfileMenuOpen(false); handleSignOut(); }}
                      data-testid="menu-signout"
                    >
                      Sign out <MenuHint>⎋</MenuHint>
                    </MenuItem>
                  </MenuPanel>
                )}
              </MenuWrap>
            )}

            <ThemeSelect value={themeName} onChange={(e) => setThemeName(e.target.value as any)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="ocean">Ocean</option>
              <option value="forest">Forest</option>
              <option value="midnight">Midnight</option>
            </ThemeSelect>
          </RightCluster>
        </HeaderInner>
      </Header>

      <Main>{children}</Main>
      {isAuthenticated && protectedRoute && sessionLocked && (
        <LockOverlay>
          <LockCard>
            <LockTitle>Session locked</LockTitle>
            <LockText>
              Your session is locked due to inactivity. Continue to revalidate your session and return to where you left off.
            </LockText>
            <LockActions>
              <Button onClick={() => handleUnlock()} disabled={unlockLoading}>
                {unlockLoading ? 'Checking session...' : 'Continue'}
              </Button>
              <Button $variant="ghost" onClick={() => handleSignOut()}>
                Log out
              </Button>
            </LockActions>
          </LockCard>
        </LockOverlay>
      )}
    </Wrapper>
  );
}
