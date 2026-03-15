import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { fontSizes, radii, spacing } from '../theme';

export default function SetupPinScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { setupPin, biometricsAvailable } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [enableBiometrics, setEnableBiometrics] = useState(biometricsAvailable);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setError('Enter a 4-digit PIN.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN entries do not match.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await setupPin(pin, enableBiometrics && biometricsAvailable);
    } catch (err: any) {
      setError(err?.message || 'Unable to save your PIN.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]}>Secure your app</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Create a 4-digit PIN for quick unlock when you return to Traxettle.
        </Text>

        <TextInput
          testID="setup-pin-input"
          value={pin}
          onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          secureTextEntry
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          placeholder="Create PIN"
          placeholderTextColor={c.muted}
        />
        <TextInput
          testID="setup-pin-confirm-input"
          value={confirmPin}
          onChangeText={(value) => setConfirmPin(value.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          secureTextEntry
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          placeholder="Confirm PIN"
          placeholderTextColor={c.muted}
        />

        {biometricsAvailable && (
          <View style={[styles.row, { borderColor: c.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: c.text }]}>Enable biometrics</Text>
              <Text style={[styles.rowCopy, { color: c.textSecondary }]}>
                Use Face ID, Touch ID, or fingerprint for faster unlock.
              </Text>
            </View>
            <Switch value={enableBiometrics} onValueChange={setEnableBiometrics} />
          </View>
        )}

        {!!error && <Text style={[styles.error, { color: c.error }]}>{error}</Text>}

        <Pressable
          testID="setup-pin-submit-button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: c.primary },
            (saving || pin.length !== 4 || confirmPin.length !== 4) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          disabled={saving || pin.length !== 4 || confirmPin.length !== 4}
          onPress={handleSave}
        >
          {saving ? <ActivityIndicator color={c.white} /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  rowTitle: {
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  rowCopy: {
    marginTop: 4,
    fontSize: fontSizes.sm,
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
});
