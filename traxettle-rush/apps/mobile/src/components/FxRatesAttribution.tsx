import React from 'react';
import { Linking, Text } from 'react-native';
import { FX_RATES_ATTRIBUTION } from '@traxettle/shared';
import { useTheme } from '../context/ThemeContext';
import { fontSizes, spacing } from '../theme';

/** The credit ExchangeRate-API requires wherever its end-of-day rates are shown. */
export function FxRatesAttribution() {
  const { theme } = useTheme();
  return (
    <Text
      testID="fx-rates-attribution"
      accessibilityRole="link"
      onPress={() => {
        Linking.openURL(FX_RATES_ATTRIBUTION.url).catch(() => {});
      }}
      style={{
        color: theme.colors.muted,
        fontSize: fontSizes.xs,
        marginTop: spacing.xs,
        textDecorationLine: 'underline',
      }}
    >
      {FX_RATES_ATTRIBUTION.text}
    </Text>
  );
}
