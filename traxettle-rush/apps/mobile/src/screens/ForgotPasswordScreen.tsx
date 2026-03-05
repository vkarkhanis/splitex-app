import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { spacing, radii, fontSizes } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useFeedback } from '../context/FeedbackContext';
import { api } from '../api';
import { isStagingModeEnabled, setStagingModeEnabled } from '../api';
import { ENV } from '../config/env';

export default function ForgotPasswordScreen({ navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { pushToast } = useFeedback();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [useStaging, setUseStaging] = useState(false);
  const [envTapCount, setEnvTapCount] = useState(0);

  useEffect(() => {
    // Load current environment setting
    isStagingModeEnabled().then(setUseStaging);
  }, []);

  const handleEnvironmentToggle = async () => {
    const newStagingMode = !useStaging;
    await setStagingModeEnabled(newStagingMode);
    setUseStaging(newStagingMode);
    
    pushToast(
      'success',
      'Environment Switched',
      `Now using ${newStagingMode ? 'STAGING' : 'PRODUCTION'} API.`
    );
  };

  const handleVersionTap = () => {
    const next = envTapCount + 1;
    if (next >= 7) {
      setEnvTapCount(0);
      handleEnvironmentToggle();
      return;
    }
    setEnvTapCount(next);
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err: any) {
      // Show success even if email not found (security best practice)
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={styles.inner}>
          <Text style={[styles.title, { color: c.text }]}>Check Your Email</Text>
          <Text style={[styles.desc, { color: c.textSecondary }]}>
            If an account exists for {email}, we've sent password reset instructions to that address.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: c.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.btnText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Pressable onPress={handleVersionTap}>
          <Text style={[styles.title, { color: c.text }]}>Forgot Password</Text>
        </Pressable>
        <Text style={[styles.desc, { color: c.textSecondary }]}>
          Enter your email address and we'll send you a link to reset your password.
        </Text>

        <TextInput
          style={[styles.label, { color: c.textSecondary }]}>Email</TextInput>
        <TextInput
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={c.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: c.primary }, loading && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.btnText}>Send Reset Link</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: c.primary }]}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  title: { fontSize: fontSizes.xxl, fontWeight: '700', marginBottom: spacing.sm },
  desc: { fontSize: fontSizes.sm, marginBottom: spacing.lg, lineHeight: 20 },
  envIndicator: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    marginBottom: spacing.sm,
  },
  envText: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  envSubtext: {
    fontSize: fontSizes.xs,
    textAlign: 'center',
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
  label: { fontSize: fontSizes.sm, fontWeight: '600', marginBottom: spacing.xs },
  input: {
    borderRadius: radii.sm, borderWidth: 1,
    padding: spacing.md, fontSize: fontSizes.md, marginBottom: spacing.lg,
  },
  btn: {
    borderRadius: radii.md, padding: spacing.lg, alignItems: 'center',
    marginBottom: spacing.md,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#ffffff', fontSize: fontSizes.md, fontWeight: '600' },
  backLink: { alignItems: 'center', paddingVertical: spacing.md },
  backLinkText: { fontSize: fontSizes.sm, fontWeight: '600' },
});
