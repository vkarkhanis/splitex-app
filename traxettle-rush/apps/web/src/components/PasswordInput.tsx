'use client';

import React, { useState } from 'react';
import styled from 'styled-components';
import { Input } from '@traxettle/ui';

type PasswordInputProps = React.ComponentProps<typeof Input>;

const Wrapper = styled.div`
  position: relative;
`;

const PasswordField = styled(Input)`
  padding-right: 72px;
`;

const ToggleButton = styled.button`
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: ${(p) => p.theme.colors.primary};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

export default function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Wrapper>
      <PasswordField {...props} type={visible ? 'text' : 'password'} />
      <ToggleButton
        aria-label={visible ? 'Hide password' : 'Show password'}
        disabled={Boolean(props.disabled)}
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? 'Hide' : 'Show'}
      </ToggleButton>
    </Wrapper>
  );
}
