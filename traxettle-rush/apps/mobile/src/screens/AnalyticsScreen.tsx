import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radii, fontSizes } from '../theme';

export default function AnalyticsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]}>Analytics</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>
          Coming soon
        </Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          We’re reworking analytics for a future major release to make it more accurate, more useful, and easier to understand.
        </Text>

        <TouchableOpacity
          testID="analytics-back"
          style={[styles.button, { backgroundColor: c.primary }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.buttonText, { color: '#fff' }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSizes.md,
    fontWeight: '700',
  },
  body: {
    marginTop: spacing.md,
    fontSize: fontSizes.md,
    lineHeight: 22,
  },
  button: {
    marginTop: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: fontSizes.md,
    fontWeight: '800',
  },
});

