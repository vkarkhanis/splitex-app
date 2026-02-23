import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ENV } from './config/env';

// Configure Google Sign-In once at app startup
const GOOGLE_ENABLED = !!ENV.GOOGLE_WEB_CLIENT_ID && !ENV.GOOGLE_WEB_CLIENT_ID.includes('REPLACE_WITH');
if (GOOGLE_ENABLED) {
  GoogleSignin.configure({
    webClientId: ENV.GOOGLE_WEB_CLIENT_ID,
    iosClientId: ENV.GOOGLE_IOS_CLIENT_ID || undefined,
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

const Stack = createNativeStackNavigator();

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
        options={{ title: 'New Event', presentation: 'modal' }}
      />
      <Stack.Screen
        name="CreateExpense"
        component={CreateExpenseScreen}
        options={{ title: 'Add Expense', presentation: 'modal' }}
      />
      <Stack.Screen
        name="EditExpense"
        component={EditExpenseScreen}
        options={{ title: 'Edit Expense', presentation: 'modal' }}
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
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return user ? <AppStack /> : <AuthStack />;
}

function AppInner() {
  const { theme } = useTheme();
  return (
    <NavigationContainer>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeProvider>
  );
}
