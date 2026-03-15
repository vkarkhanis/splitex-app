import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'traxettle.pin';
const BIOMETRICS_ENABLED_KEY = 'traxettle.biometrics.enabled';

export async function hasStoredPin(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(PIN_KEY));
}

export async function saveLocalUnlockPreferences(pin: string, biometricsEnabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, biometricsEnabled ? 'true' : 'false');
}

export async function clearLocalUnlockSecrets(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(PIN_KEY),
    SecureStore.deleteItemAsync(BIOMETRICS_ENABLED_KEY),
  ]);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const storedPin = await SecureStore.getItemAsync(PIN_KEY);
  return Boolean(storedPin) && storedPin === pin;
}

export async function isBiometricSupported(): Promise<boolean> {
  const [hasHardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && enrolled;
}

export async function getLocalUnlockState(): Promise<{ biometricsEnabled: boolean }> {
  return {
    biometricsEnabled: (await SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY)) === 'true',
  };
}

export async function tryBiometricUnlock(): Promise<boolean> {
  const { biometricsEnabled } = await getLocalUnlockState();
  if (!biometricsEnabled) return false;

  const supported = await isBiometricSupported();
  if (!supported) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Traxettle',
    cancelLabel: 'Use PIN',
    disableDeviceFallback: false,
  });
  return result.success;
}
