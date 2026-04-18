import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { fontSizes, radii, spacing } from '../theme';

export default function UnlockScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { biometricsEnabled, unlockWithBiometrics, unlockWithPin } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleBiometricUnlock = async () => {
    setSubmitting(true);
    setError('');
    try {
      const ok = await unlockWithBiometrics();
      if (!ok) {
        setError('Biometric unlock was not completed. Try again or use your PIN instead.');
      }
    } catch {
      setError('Biometric unlock is unavailable right now. Please use your PIN instead.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!biometricsEnabled) return;
    handleBiometricUnlock().catch(() => {});
  }, [biometricsEnabled, unlockWithBiometrics]);

  const handleUnlock = async () => {
    setSubmitting(true);
    setError('');
    try {
      const ok = await unlockWithPin(pin);
      if (!ok) {
        setError('Incorrect PIN. Try again.');
      }
    } finally {
      setSubmitting(false);
      setPin('');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]}>Unlock Traxettle</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Your session was locked after inactivity. Enter your PIN to continue.
        </Text>

        <TextInput
          testID="unlock-pin-input"
          value={pin}
          onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          secureTextEntry
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          placeholder="Enter PIN"
          placeholderTextColor={c.muted}
        />

        {!!error && <Text style={[styles.error, { color: c.error }]}>{error}</Text>}

        <Pressable
          testID="unlock-pin-submit-button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: c.primary },
            (submitting || pin.length !== 4) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          disabled={submitting || pin.length !== 4}
          onPress={handleUnlock}
        >
          {submitting ? <ActivityIndicator color={c.white} /> : <Text style={styles.buttonText}>Unlock</Text>}
        </Pressable>

        {biometricsEnabled && (
          <Pressable
            testID="unlock-biometrics-button"
            style={[styles.secondaryButton, { borderColor: c.border }]}
            disabled={submitting}
            onPress={handleBiometricUnlock}
          >
            <Text style={[styles.secondaryButtonText, { color: c.text }]}>Use biometrics instead</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: fontSizes.md,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSizes.lg,
    letterSpacing: 6,
  },
  error: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  button: {
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSizes.md,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: fontSizes.md,
  },
});
