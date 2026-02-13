'use client';

import React from 'react';
import styled from 'styled-components';
import { useSplitexTheme } from '../theme/ThemeProvider';

const Wrapper = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.background};
  backdrop-filter: blur(10px);
`;

const HeaderInner = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`;

const Brand = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;

  a {
    font-weight: 800;
    letter-spacing: -0.02em;
    font-size: 16px;
  }

  span {
    font-size: 12px;
    color: ${(p) => p.theme.colors.muted};
  }
`;

const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const NavLink = styled.a`
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  color: ${(p) => p.theme.colors.text};

  &:hover {
    border-color: ${(p) => p.theme.colors.border};
    background: rgba(127, 127, 127, 0.08);
  }
`;

const ThemeSelect = styled.select`
  border-radius: 10px;
  padding: 8px 10px;
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surface};
  color: ${(p) => p.theme.colors.text};
  outline: none;
`;

const Main = styled.main`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 18px;
`;

export function AppShell(props: { children: React.ReactNode }) {
  const { children } = props;
  const { themeName, setThemeName } = useSplitexTheme();

  return (
    <Wrapper>
      <Header>
        <HeaderInner>
          <Brand>
            <a href="/">Splitex</a>
            <span>Expense splitting</span>
          </Brand>

          <Nav>
            <NavLink href="/">Home</NavLink>
            <NavLink href="/auth/login">Sign in</NavLink>
            <NavLink href="/auth/register">Register</NavLink>
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
