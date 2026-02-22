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
import { colors, spacing, radii, fontSizes } from '../theme';
import { useAuth } from '../context/AuthContext';
import { ENV } from '../config/env';

const GOOGLE_ENABLED = !!ENV.GOOGLE_WEB_CLIENT_ID && !ENV.GOOGLE_WEB_CLIENT_ID.includes('REPLACE_WITH');

export default function LoginScreen({ navigation }: any) {
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
      const result: any = await GoogleSignin.signIn();
      console.log('Google Sign-In result:', JSON.stringify(result, null, 2));
      const idToken = result?.data?.idToken || result?.idToken || result?.serverAuthCode || result?.data?.serverAuthCode;
      if (!idToken) {
        Alert.alert('Google Sign-In', 'No ID token received from Google.');
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
        Alert.alert('Google Sign-In Failed', error.code + ': ' + error.message);
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>Splitex</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        <TextInput
          testID="login-email-input"
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <TextInput
          testID="login-password-input"
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />

        <Pressable
          testID="login-submit-button"
          style={({pressed}) => [styles.button, loading && styles.buttonDisabled, pressed && styles.buttonPressed]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </Pressable>

        <Pressable
          style={({pressed}) => [styles.secondaryButton, emailLinkLoading && styles.buttonDisabled, pressed && styles.buttonPressed]}
          onPress={handleEmailLinkSignIn}
          disabled={emailLinkLoading}
        >
          {emailLinkLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.secondaryButtonText}>Email me a sign-in link</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.forgotLink}>Forgot Password?</Text>
        </Pressable>

        {GOOGLE_ENABLED && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({pressed}) => [styles.googleButton, googleLoading && styles.buttonDisabled, pressed && styles.buttonPressed]}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
              )}
            </Pressable>
          </>
        )}

        <Pressable testID="login-go-register" onPress={() => navigation.navigate('Register')}>
          <Text style={styles.link}>Don't have an account? Register</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xxl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  brand: {
    fontSize: fontSizes.xxxl,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: fontSizes.md,
    color: colors.text,
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { opacity: 0.7 },
  buttonText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  secondaryButtonText: {
    color: colors.text,
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
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.sm,
    color: colors.muted,
    fontSize: fontSizes.sm,
  },
  googleButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  googleButtonText: {
    color: colors.text,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  forgotLink: {
    color: colors.muted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  link: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
});
