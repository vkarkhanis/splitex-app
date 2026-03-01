import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { spacing, radii, fontSizes } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { ENV } from '../config/env';

const GOOGLE_ENABLED = !!ENV.GOOGLE_WEB_CLIENT_ID && !ENV.GOOGLE_WEB_CLIENT_ID.includes('REPLACE_WITH');

export default function RegisterScreen({ navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { register, loginWithGoogle } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!GOOGLE_ENABLED) return;
    setGoogleLoading(true);
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices();
      }
      // Clear any cached Google session so the account picker always appears
      await GoogleSignin.signOut().catch(() => {});
      const userInfo: any = await GoogleSignin.signIn();
      console.log('Google Sign-Up result:', JSON.stringify(userInfo, null, 2));
      const idToken = userInfo?.data?.idToken || userInfo?.idToken;
      if (!idToken) {
        Alert.alert(
          'Google Sign-Up',
          'No ID token received from Google. Recheck Firebase SHA + OAuth client IDs for this build.'
        );
        return;
      }
      await loginWithGoogle(idToken);
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // already in progress
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services not available.');
      } else if (`${error?.code}` === '10' || `${error?.code}`.toUpperCase() === 'DEVELOPER_ERROR') {
        Alert.alert(
          'Google Sign-Up Setup Required',
          'Android Developer Error (10): this build signature/SHA is not configured in Firebase Google Sign-In OAuth for this app. Add SHA-1/SHA-256 for the keystore used to sign this APK and download updated google-services.json.',
        );
      } else {
        Alert.alert('Google Sign-Up Failed', `${error?.code ?? 'UNKNOWN'}: ${error?.message ?? 'Unexpected error'}`);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!displayName.trim() || !email.trim() || !password) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim());
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.card, { backgroundColor: c.surface, shadowColor: c.black }]}>
        <Text style={[styles.title, { color: c.text }]}>Create Account</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>Join Traxettle to start splitting expenses</Text>

        <TextInput
          testID="register-display-name-input"
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          placeholder="Display Name"
          placeholderTextColor={c.muted}
          value={displayName}
          onChangeText={setDisplayName}
          editable={!loading}
        />
        <TextInput
          testID="register-email-input"
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          placeholder="Email"
          placeholderTextColor={c.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />
        <TextInput
          testID="register-password-input"
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          placeholder="Password"
          placeholderTextColor={c.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="done"
          onSubmitEditing={handleRegister}
          editable={!loading}
        />

        <TouchableOpacity
          testID="register-submit-button"
          style={[styles.button, { backgroundColor: c.primary }, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={c.white} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        {GOOGLE_ENABLED && (
          <>
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
              <Text style={[styles.dividerText, { color: c.muted }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, { backgroundColor: c.surface, borderColor: c.border }, googleLoading && styles.buttonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color={c.text} />
              ) : (
                <Text style={[styles.googleButtonText, { color: c.text }]}>Sign up with Google</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity testID="register-go-login" onPress={() => navigation.goBack()}>
          <Text style={[styles.link, { color: c.primary }]}>Already have an account? Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    borderRadius: radii.lg,
    padding: spacing.xxl,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSizes.md,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  input: {
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.md,
    fontSize: fontSizes.md,
    marginBottom: spacing.md,
  },
  button: {
    borderRadius: radii.sm,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#ffffff',
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: spacing.sm,
    fontSize: fontSizes.sm,
  },
  googleButton: {
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  googleButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  link: {
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
});
