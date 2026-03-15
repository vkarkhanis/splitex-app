import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, AppState, View, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { PurchaseProvider } from './context/PurchaseContext';
import { FeedbackProvider, useFeedback } from './context/FeedbackContext';
import { ENV } from './config/env';
import { isStagingModeEnabled } from './api';

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

function AppStack() {
  const { theme } = useTheme();
  const screenOptions = {
    headerStyle: { backgroundColor: theme.colors.surface },
    headerTintColor: theme.colors.text,
    headerTitleStyle: { fontWeight: '600' as const },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: theme.colors.background },
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
