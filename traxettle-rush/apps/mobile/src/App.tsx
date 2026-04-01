import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, AppState, Image, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { PurchaseProvider } from './context/PurchaseContext';
import { FeedbackProvider, useFeedback } from './context/FeedbackContext';
import { ENV } from './config/env';
import { isStagingModeEnabled, setStagingModeEnabled } from './api';
import { initializeApp as bootstrapMobileApp } from './index';

// Configure Google Sign-In once at app startup
const GOOGLE_ENABLED = !!ENV.GOOGLE_WEB_CLIENT_ID && !ENV.GOOGLE_WEB_CLIENT_ID.includes('REPLACE_WITH');
if (GOOGLE_ENABLED) {
  GoogleSignin.configure({
    webClientId: ENV.GOOGLE_WEB_CLIENT_ID,
    // iosClientId is intentionally omitted — the SDK reads CLIENT_ID
    // directly from GoogleService-Info.plist, which bootstrap.sh sets
    // per-environment (local/staging). This avoids mismatches.
    offlineAccess: false,
  });
}

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import DashboardScreen from './screens/DashboardScreen';
import EventDetailScreen from './screens/EventDetailScreen';
import CreateEventScreen from './screens/CreateEventScreen';
import CreateExpenseScreen from './screens/CreateExpenseScreen';
import EditExpenseScreen from './screens/EditExpenseScreen';
import ProfileScreen from './screens/ProfileScreen';
import InvitationsScreen from './screens/InvitationsScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ProUpgradeScreen from './screens/ProUpgradeScreen';
import AllEventsScreen from './screens/AllEventsScreen';
import ClosedEventsScreen from './screens/ClosedEventsScreen';
import HelpScreen from './screens/HelpScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import UnsettledPaymentsScreen from './screens/UnsettledPaymentsScreen';
import SetupPinScreen from './screens/SetupPinScreen';
import UnlockScreen from './screens/UnlockScreen';

const Stack = createNativeStackNavigator();
const CAMERA_PERMISSION_BOOTSTRAP_KEY = '@traxettle_camera_permission_prompted';

function AuthStack() {
  const { theme } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const traxettleIcon = require('../assets/icon.png');

function HeaderTitle({ children }: { children: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image source={traxettleIcon} style={{ width: 28, height: 28, borderRadius: 6, marginRight: 8 }} />
      <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text }} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

function AppStack() {
  const { theme } = useTheme();
  const screenOptions = {
    headerStyle: { backgroundColor: theme.colors.surface },
    headerTintColor: theme.colors.text,
    headerTitleStyle: { fontWeight: '600' as const },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: theme.colors.background },
    headerTitle: (props: any) => <HeaderTitle>{props.children}</HeaderTitle>,
  };
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Traxettle' }}
      />
      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={({ route }: any) => ({ title: route.params?.eventName || 'Event' })}
      />
      <Stack.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{ title: 'New Event', presentation: Platform.OS === 'ios' ? 'card' : 'modal' }}
      />
      <Stack.Screen
        name="CreateExpense"
        component={CreateExpenseScreen}
        options={{ title: 'Add Expense', presentation: Platform.OS === 'ios' ? 'card' : 'modal' }}
      />
      <Stack.Screen
        name="EditExpense"
        component={EditExpenseScreen}
        options={{ title: 'Edit Expense', presentation: Platform.OS === 'ios' ? 'card' : 'modal' }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
      <Stack.Screen
        name="Invitations"
        component={InvitationsScreen}
        options={{ title: 'Invitations' }}
      />
      <Stack.Screen
        name="ProUpgrade"
        component={ProUpgradeScreen}
        options={{ title: 'Upgrade to Pro', presentation: Platform.OS === 'ios' ? 'card' : 'modal' }}
      />
      <Stack.Screen
        name="AllEvents"
        component={AllEventsScreen}
        options={{ title: 'All Events' }}
      />
      <Stack.Screen
        name="ClosedEvents"
        component={ClosedEventsScreen}
        options={{ title: 'Closed Events' }}
      />
      <Stack.Screen
        name="Help"
        component={HelpScreen}
        options={{ title: 'Help & Features' }}
      />
      <Stack.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ title: 'Analytics' }}
      />
      <Stack.Screen
        name="UnsettledPayments"
        component={UnsettledPaymentsScreen}
        options={{ title: 'Unsettled Payments' }}
      />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const { user, loading, pinSetupRequired, sessionLocked } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (user && pinSetupRequired) {
    return <SetupPinScreen />;
  }

  if (user && sessionLocked) {
    return <UnlockScreen />;
  }

  return user ? <AppStack /> : <AuthStack />;
}

const linking = {
  prefixes: ['com.traxettle.app://'],
  config: {
    screens: {
      EventDetail: {
        path: 'events/:eventId',
      },
      Dashboard: '',
    },
  },
};

function AppInner() {
  const { theme } = useTheme();
  return (
    <NavigationContainer linking={linking}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

function useProdReachabilityToast() {
  const { pushToast } = useFeedback();
  const lastShownAt = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function checkProd() {
      try {
        const useStaging = await isStagingModeEnabled();
        if (useStaging) return;

        const now = Date.now();
        if (now - lastShownAt.current < 60_000) return;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(`${ENV.PROD_API_URL}/health`, {
            method: 'GET',
            signal: controller.signal,
          });
          if (cancelled) return;
          if (!res.ok) throw new Error(`health ${res.status}`);
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        if (cancelled) return;
        lastShownAt.current = Date.now();
        pushToast(
          'error',
          'Production API unavailable',
          'Please try again later or contact support if the issue persists.',
        );
      }
    }

    void checkProd();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkProd();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [pushToast]);
}

function AppBootstrap() {
  useProdReachabilityToast();
  return <AppInner />;
}

export default function App() {
  const [bootstrapState, setBootstrapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [envTapCount, setEnvTapCount] = useState(0);
  const [useStaging, setUseStaging] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        await bootstrapMobileApp();
        if (mounted) {
          setBootstrapState('ready');
        }
      } catch (error) {
        console.error('Failed to bootstrap mobile app', error);
        if (mounted) {
          setBootstrapState('error');
        }
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [bootstrapAttempt]);

  useEffect(() => {
    let mounted = true;

    async function loadEnvironmentPreference() {
      try {
        const stagingEnabled = await isStagingModeEnabled();
        if (mounted) {
          setUseStaging(stagingEnabled);
        }
      } catch {
        if (mounted) {
          setUseStaging(false);
        }
      }
    }

    void loadEnvironmentPreference();

    return () => {
      mounted = false;
    };
  }, [bootstrapAttempt]);

  useEffect(() => {
    let mounted = true;
    async function requestCameraOnFirstLaunch() {
      try {
        const alreadyPrompted = await AsyncStorage.getItem(CAMERA_PERMISSION_BOOTSTRAP_KEY);
        if (alreadyPrompted || !mounted) return;
        const ImagePicker = require('expo-image-picker');
        await ImagePicker.requestCameraPermissionsAsync();
        if (mounted) {
          await AsyncStorage.setItem(CAMERA_PERMISSION_BOOTSTRAP_KEY, 'true');
        }
      } catch {
        // Best-effort prompt only. Permission is requested again in feature flows.
      }
    }
    requestCameraOnFirstLaunch();
    return () => {
      mounted = false;
    };
  }, []);

  if (bootstrapState === 'loading') {
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#F8FAFC' }}>
            <ActivityIndicator size="large" color="#0F766E" />
            <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '600', color: '#0F172A' }}>
              Initializing Traxettle
            </Text>
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  if (bootstrapState === 'error') {
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' }}>
            <Pressable
              onPress={async () => {
                const nextTapCount = envTapCount + 1;
                if (nextTapCount < 7) {
                  setEnvTapCount(nextTapCount);
                  return;
                }

                const nextEnvironment = !useStaging;
                await setStagingModeEnabled(nextEnvironment);
                setUseStaging(nextEnvironment);
                setEnvTapCount(0);
                setBootstrapState('loading');
                setBootstrapAttempt((current) => current + 1);
              }}
            >
              <Text style={{ fontSize: 28, fontWeight: '700', color: '#0F172A', textAlign: 'center' }}>
                Traxettle
              </Text>
            </Pressable>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#0F172A', textAlign: 'center' }}>
              App initialization failed
            </Text>
            <Text style={{ marginTop: 12, fontSize: 15, lineHeight: 22, color: '#475569', textAlign: 'center' }}>
              Firebase could not be initialized. Please try again or switch environments from developer options if you are testing.
            </Text>
            <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: '#64748B', textAlign: 'center' }}>
              Current environment: {useStaging ? 'Staging' : 'Production'}
            </Text>
            <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 18, color: '#94A3B8', textAlign: 'center' }}>
              Tap the Traxettle title 7 times to switch environments and retry.
            </Text>
            <Pressable
              onPress={() => {
                setEnvTapCount(0);
                setBootstrapState('loading');
                setBootstrapAttempt((current) => current + 1);
              }}
              style={{
                marginTop: 24,
                alignSelf: 'center',
                backgroundColor: '#0F766E',
                borderRadius: 12,
                paddingHorizontal: 20,
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                Restart app
              </Text>
            </Pressable>
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>
          <AuthProvider>
            <PurchaseProvider>
              <AppBootstrap />
            </PurchaseProvider>
          </AuthProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
