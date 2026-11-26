import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { radii, spacing } from '../theme';
import { isAppleSignInAvailable, requestAppleSignIn } from '../services/appleSignIn';
import { toUserFriendlyError } from '../utils/errorMessages';

/** True once we know this device offers Sign in with Apple (iOS only). */
export function useAppleSignInAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    isAppleSignInAvailable().then((ok) => {
      if (active) setAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);
  return available;
}

/** Apple's own button (App Review expects it), which signs in or creates the account. */
export default function AppleSignInButton({ mode }: { mode: 'signIn' | 'signUp' }) {
  const { loginWithApple } = useAuth();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const apple = await requestAppleSignIn();
      if (!apple) return; // cancelled
      await loginWithApple(apple);
    } catch (error: any) {
      Alert.alert(mode === 'signUp' ? 'Apple Sign-Up Failed' : 'Apple Sign-In Failed', toUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.button, styles.loading, { borderColor: theme.colors.border }]}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      testID="apple-sign-in-button"
      buttonType={
        mode === 'signUp'
          ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
          : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
      }
      buttonStyle={
        theme.isDark
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={radii.sm}
      style={styles.button}
      onPress={handlePress}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 50,
    marginBottom: spacing.md,
  },
  loading: {
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
