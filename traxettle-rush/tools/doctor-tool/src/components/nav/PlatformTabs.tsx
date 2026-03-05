'use client';

import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import styled from 'styled-components';
import type { Platform } from '@/types';

const Wrap = styled.div`
  display: flex;
  background: rgba(17, 31, 58, 0.8);
  border-radius: 12px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
`;

const Tab = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 12px 16px;
  border: none;
  background: ${(props: { $active: boolean }) => 
    props.$active 
      ? 'linear-gradient(135deg, rgba(79, 140, 255, 0.3), rgba(59, 130, 246, 0.2))' 
      : 'transparent'
  };
  color: ${(props: { $active: boolean }) => 
    props.$active ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'
  };
  cursor: pointer;
  font-size: 14px;
  font-weight: ${(props: { $active: boolean }) => props.$active ? '600' : '500'};
  transition: all 0.2s ease;
  position: relative;
  flex: 1;

  ${(props: { $active: boolean }) => 
    props.$active && `
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 8px;
      background: linear-gradient(135deg, rgba(79, 140, 255, 0.1), rgba(59, 130, 246, 0.05));
      z-index: -1;
    }
    
    &::after {
      content: '';
      position: absolute;
      bottom: -4px;
      left: 50%;
      transform: translateX(-50%);
      width: 20px;
      height: 3px;
      background: linear-gradient(90deg, #4f8cff, #3b82f6);
      border-radius: 2px;
    }
  `}

  &:hover {
    background: ${(props: { $active: boolean }) => 
      props.$active 
        ? 'linear-gradient(135deg, rgba(79, 140, 255, 0.4), rgba(59, 130, 246, 0.3))' 
        : 'rgba(255, 255, 255, 0.05)'
    };
    color: #ffffff;
  }

  &:active {
    transform: scale(0.98);
  }
`;

const IconWrapper = styled.span<{ $active: boolean }>`
  color: ${(props: { $active: boolean }) => 
    props.$active ? '#4f8cff' : 'rgba(255, 255, 255, 0.5)'
  };
  transition: color 0.2s ease;
`;

export function PlatformTabs(props: { platform: Platform; onChange: (p: Platform) => void }) {
  const { platform, onChange } = props;

  return (
    <Wrap>
      <Tab
        type="button"
        $active={platform === 'mobile'}
        onClick={() => onChange('mobile')}
      >
        <IconWrapper $active={platform === 'mobile'}>
          <Smartphone size={18} />
        </IconWrapper>
        Mobile
      </Tab>
      <Tab
        type="button"
        $active={platform === 'web'}
        onClick={() => onChange('web')}
      >
        <IconWrapper $active={platform === 'web'}>
          <Monitor size={18} />
        </IconWrapper>
        Web
      </Tab>
    </Wrap>
  );
}
