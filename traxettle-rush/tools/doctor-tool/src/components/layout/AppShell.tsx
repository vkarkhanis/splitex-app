import React from 'react';
import styled from 'styled-components';

const Root = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0f0f1e;
  color: #ffffff;
`;

const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 27, 51, 0.7);
  backdrop-filter: blur(10px);
`;

const Title = styled.div`
  font-size: 18px;
  font-weight: 700;
`;

const Subtitle = styled.div`
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
`;

const Main = styled.main`
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Footer = styled.footer`
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  margin-top: auto;
`;

const FooterText = styled.span`
  font-size: 12px;
`;

export function AppShell(props: {
  headerTitle: string;
  headerSubtitle: string;
  children: React.ReactNode;
}) {
  const { headerTitle, headerSubtitle, children } = props;

  return (
    <Root>
      <Header>
        <div>
          <Title>{headerTitle}</Title>
          <Subtitle>{headerSubtitle}</Subtitle>
        </div>
      </Header>

      <Main>{children}</Main>

      <Footer>
        <FooterText>Traxettle Doctor Tool</FooterText>
      </Footer>
    </Root>
  );
}
