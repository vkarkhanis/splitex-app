'use client';

import React from 'react';
import styled from 'styled-components';
import { FX_RATES_ATTRIBUTION } from '@traxettle/shared';

const Credit = styled.a`
  display: inline-block;
  margin-top: 6px;
  font-size: 11px;
  color: ${(p) => p.theme.colors.muted};
  text-decoration: underline;
`;

/** The credit ExchangeRate-API requires wherever its end-of-day rates are shown. */
export function FxRatesAttribution() {
  return (
    <Credit
      href={FX_RATES_ATTRIBUTION.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="fx-rates-attribution"
    >
      {FX_RATES_ATTRIBUTION.text}
    </Credit>
  );
}
