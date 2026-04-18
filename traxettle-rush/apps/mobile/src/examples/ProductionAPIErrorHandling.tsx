import React, { useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { initializeApp } from '../index';

/**
 * Example of how production API error handling works
 * This would be used in your main App component
 */
export const AppWithErrorHandling: React.FC = () => {
  useEffect(() => {
    const initializeAppWithErrorHandling = async () => {
      try {
        await initializeApp();
        console.log('App initialized successfully');
      } catch (error) {
        console.error('App initialization failed:', error);
        
        // The initializeApp function already handles production API errors
        // and shows an alert to the user, so we don't need to handle it here
        
        // For other errors, you might want to show a different message
        Alert.alert(
          'Initialization Error',
          'Failed to initialize the app. Please restart and try again.',
          [{ text: 'OK' }]
        );
      }
    };

    initializeAppWithErrorHandling();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Traxettle App</Text>
    </View>
  );
};

/**
 * Error Handling Flow:
 * 
 * 1. App starts → initializeApp() → initializeFirebase()
 * 2. Firebase tries to get runtime config from production API
 * 3. If production API fails:
 *    - Throws "PRODUCTION_API_UNAVAILABLE" error
 *    - initializeApp() catches this specific error
 *    - Shows user-friendly alert with instructions
 *    - App continues with limited functionality
 *    - User can tap version text 7 times to enable developer options
 *    - User can switch to staging mode manually
 *    - App restarts and uses staging API
 * 
 * 4. If other errors occur:
 *    - Error bubbles up to app level
 *    - App shows generic error message
 *    - User may need to restart app
 * 
 * 5. If everything works:
 *    - App initializes normally
 *    - Uses production API
 *    - No errors shown to user
 */
