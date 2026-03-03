import { User } from '@traxettle/shared';
import { initializeFirebase } from './services/firebase';
import { Alert } from 'react-native';

// Mobile app entry point - will be expanded in later phases
export const initializeApp = async (): Promise<void> => {
  console.log('Traxettle Mobile App - Initializing...');
  
  try {
    // Initialize Firebase with runtime configuration
    await initializeFirebase();
    console.log('Firebase initialized successfully');
    
    // TODO: Set up navigation
    // TODO: Initialize authentication
    // TODO: Set up state management
    
    console.log('Traxettle Mobile App - Ready!');
  } catch (error) {
    console.error('Failed to initialize Traxettle Mobile App:', error);
    
    // Handle production API unavailability
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'PRODUCTION_API_UNAVAILABLE') {
      Alert.alert(
        'Production API Unavailable',
        'The production API is currently unavailable. Use developer options to switch to staging mode for testing.\n\nTo enable developer options, tap the version text 7 times quickly.',
        [{ text: 'OK' }]
      );
      return; // Don't throw, let the app continue with limited functionality
    }
    
    throw error;
  }
};

// Export types and utilities
export * from './types';
export * from './utils';
export * from './services/firebase';
