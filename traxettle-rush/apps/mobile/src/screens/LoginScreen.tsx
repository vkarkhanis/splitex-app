import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
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

export default function LoginScreen({ navigation }: any) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { login, loginWithGoogle, sendEmailLinkSignIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLinkLoading, setEmailLinkLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!GOOGLE_ENABLED) return;
    setGoogleLoading(true);
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices();
      }
      console.log('[GoogleSignIn] Calling signIn()... webClientId=', ENV.GOOGLE_WEB_CLIENT_ID);
      const result: any = await GoogleSignin.signIn();
      console.log('[GoogleSignIn] signIn() resolved:', JSON.stringify(result, null, 2));
      const idToken = result?.data?.idToken || result?.idToken;
      if (!idToken) {
        Alert.alert(
          'Google Sign-In',
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
      } else {
        Alert.alert('Google Sign-In Failed', `${error?.code ?? 'UNKNOWN'}: ${error?.message ?? 'Unexpected error'}`);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLinkSignIn = async () => {
    if (!email.trim()) {
      Alert.alert('Email Required', 'Enter your email address first.');
      return;
    }
    setEmailLinkLoading(true);
    try {
      await sendEmailLinkSignIn(email.trim());
      Alert.alert(
        'Check Your Email',
        `We sent a secure sign-in link to ${email.trim()}. Open it on this device to sign in.`
      );
    } catch (err: any) {
      Alert.alert('Email Link Failed', err.message || 'Could not send sign-in link.');
    } finally {
      setEmailLinkLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.card, { backgroundColor: c.surface, shadowColor: c.black }]}>
        <Text style={[styles.brand, { color: c.primary }]}>Traxettle</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>Sign in to your account</Text>

        <TextInput
          testID="login-email-input"
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
          testID="login-password-input"
          style={[styles.input, { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text }]}
          placeholder="Password"
          placeholderTextColor={c.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />

        <Pressable
          testID="login-submit-button"
          style={({pressed}) => [styles.button, { backgroundColor: c.primary }, loading && styles.buttonDisabled, pressed && styles.buttonPressed]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={c.white} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </Pressable>

        <Pressable
          style={({pressed}) => [styles.secondaryButton, { backgroundColor: c.surface, borderColor: c.border }, emailLinkLoading && styles.buttonDisabled, pressed && styles.buttonPressed]}
          onPress={handleEmailLinkSignIn}
          disabled={emailLinkLoading}
        >
          {emailLinkLoading ? (
            <ActivityIndicator color={c.text} />
          ) : (
            <Text style={[styles.secondaryButtonText, { color: c.text }]}>Email me a sign-in link</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={[styles.forgotLink, { color: c.muted }]}>Forgot Password?</Text>
        </Pressable>

        {GOOGLE_ENABLED && (
          <>
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
              <Text style={[styles.dividerText, { color: c.muted }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
            </View>

            <Pressable
              style={({pressed}) => [styles.googleButton, { backgroundColor: c.surface, borderColor: c.border }, googleLoading && styles.buttonDisabled, pressed && styles.buttonPressed]}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color={c.text} />
              ) : (
                <Text style={[styles.googleButtonText, { color: c.text }]}>Sign in with Google</Text>
              )}
            </Pressable>
          </>
        )}

        <Pressable testID="login-go-register" onPress={() => navigation.navigate('Register')}>
          <Text style={[styles.link, { color: c.primary }]}>Don't have an account? Register</Text>
        </Pressable>
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
  brand: {
    fontSize: fontSizes.xxxl,
    fontWeight: '800',
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
  buttonPressed: { opacity: 0.7 },
  buttonText: {
    color: '#ffffff',
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  secondaryButtonText: {
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
  forgotLink: {
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  link: {
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
});
