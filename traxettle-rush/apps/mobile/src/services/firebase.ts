import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, FirebaseStorage, connectStorageEmulator } from 'firebase/storage';
import { Platform } from 'react-native';
import { getRuntimeConfig, RuntimeConfig } from '../config/runtime';
import { isFirebaseEmulatorEnabled } from '../api';

const EMULATOR_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

class FirebaseService {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private firestore: Firestore | null = null;
  private storage: FirebaseStorage | null = null;
  private config: RuntimeConfig | null = null;

  /**
   * Initialize Firebase with runtime configuration
   */
  async initialize(): Promise<void> {
    try {
      console.log('[Firebase] Initializing with runtime config...');
      
      // Check if Firebase emulator should be used
      const useEmulator = await isFirebaseEmulatorEnabled();
      console.log('[Firebase] Emulator mode:', useEmulator ? 'enabled' : 'disabled');
      
      // Get runtime configuration from API
      this.config = await this.getRuntimeConfig();
      this.assertClientConfig(this.config);
      
      // Initialize Firebase app
      if (getApps().length === 0) {
        this.app = initializeApp(this.config.firebaseConfig);
        console.log('[Firebase] App initialized successfully');
      } else {
        this.app = getApp();
        console.log('[Firebase] Using existing app instance');
      }

      // Initialize Firebase services
      this.auth = getAuth(this.app);
      this.firestore = getFirestore(this.app);
      this.storage = getStorage(this.app);

      // Connect to emulators if enabled (only in development)
      if (useEmulator && __DEV__) {
        console.log('[Firebase] Connecting to emulators...');
        
        try {
          // Connect Auth emulator
          connectAuthEmulator(this.auth, `http://${EMULATOR_HOST}:9099`);
          console.log('[Firebase] Auth emulator connected');
        } catch (error) {
          console.log('[Firebase] Auth emulator already connected or failed:', error);
        }
        
        try {
          // Connect Firestore emulator
          connectFirestoreEmulator(this.firestore, EMULATOR_HOST, 8080);
          console.log('[Firebase] Firestore emulator connected');
        } catch (error) {
          console.log('[Firebase] Firestore emulator already connected or failed:', error);
        }
        
        try {
          // Connect Storage emulator
          connectStorageEmulator(this.storage, EMULATOR_HOST, 9199);
          console.log('[Firebase] Storage emulator connected');
        } catch (error) {
          console.log('[Firebase] Storage emulator already connected or failed:', error);
        }
      }

      console.log('[Firebase] Services initialized:', {
        env: this.config.env,
        projectId: this.config.firebaseConfig.projectId,
        apiUrl: this.config.apiUrl,
        emulator: useEmulator
      });

    } catch (error) {
      console.error('[Firebase] Initialization failed:', error);
      
      // Show user-friendly error message for production API failure
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('Production API unavailable')) {
        // This will be handled by the app initialization logic
        // The app can show a toast or alert to the user
        throw new Error('PRODUCTION_API_UNAVAILABLE');
      }
      
      throw error;
    }
  }

  private assertClientConfig(config: RuntimeConfig): void {
    const missing = ['apiKey', 'appId', 'authDomain'].filter((key) => {
      const value = config.firebaseConfig[key as keyof RuntimeConfig['firebaseConfig']];
      return !value || `${value}`.trim() === '';
    });

    if (missing.length > 0) {
      throw new Error(`Incomplete Firebase client config: missing ${missing.join(', ')}`);
    }
  }

  /**
   * Get runtime configuration from API
   */
  private async getRuntimeConfig(): Promise<RuntimeConfig> {
    try {
      const useEmulator = await isFirebaseEmulatorEnabled();
      
      if (useEmulator && __DEV__) {
        // In emulator mode, use local development config
        console.log('[Firebase] Using emulator config (local development)');
        return {
          env: 'development',
          apiUrl: `http://${EMULATOR_HOST}:3002`,
          firebaseConfig: {
            projectId: 'traxettle-emulator',
            apiKey: 'demo-emulator-api-key',
            authDomain: 'traxettle-emulator.firebaseapp.com',
            storageBucket: 'traxettle-emulator.appspot.com',
            messagingSenderId: '000000000000',
            appId: '1:000000000000:web:emulator',
          },
          revenueCatConfig: {
            googleApiKey: '',
            appleApiKey: '',
            proEntitlement: 'pro',
            offering: 'default'
          }
        };
      }
      
      const config = await getRuntimeConfig();
      
      console.log('[Firebase] Runtime config loaded:', {
        env: config.env,
        apiUrl: config.apiUrl,
        projectId: config.firebaseConfig.projectId
      });

      return config;
    } catch (error) {
      console.error('[Firebase] Failed to load runtime config:', error);
      throw new Error('Failed to load Firebase configuration');
    }
  }

  /**
   * Get Firebase app instance
   */
  getApp(): FirebaseApp {
    if (!this.app) {
      throw new Error('Firebase not initialized. Call initialize() first.');
    }
    return this.app;
  }

  /**
   * Get Auth instance
   */
  getAuth(): Auth {
    if (!this.auth) {
      throw new Error('Firebase Auth not initialized. Call initialize() first.');
    }
    return this.auth;
  }

  /**
   * Get Firestore instance
   */
  getFirestore(): Firestore {
    if (!this.firestore) {
      throw new Error('Firebase Firestore not initialized. Call initialize() first.');
    }
    return this.firestore;
  }

  /**
   * Get Storage instance
   */
  getStorage(): FirebaseStorage {
    if (!this.storage) {
      throw new Error('Firebase Storage not initialized. Call initialize() first.');
    }
    return this.storage;
  }

  /**
   * Get current configuration
   */
  getConfig(): RuntimeConfig {
    if (!this.config) {
      throw new Error('Firebase not initialized. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * Check if Firebase is initialized
   */
  isInitialized(): boolean {
    return this.app !== null;
  }

  /**
   * Get current environment
   */
  getEnvironment(): string {
    return this.config?.env || 'unknown';
  }

  /**
   * Get API URL
   */
  getApiUrl(): string {
    return this.config?.apiUrl || '';
  }
}

// Export singleton instance
export const firebaseService = new FirebaseService();

// Export convenience methods
export const initializeFirebase = () => firebaseService.initialize();
export const getFirebaseApp = () => firebaseService.getApp();
export const getFirebaseAuth = () => firebaseService.getAuth();
export const getFirebaseFirestore = () => firebaseService.getFirestore();
export const getFirebaseStorage = () => firebaseService.getStorage();
export const getFirebaseConfig = () => firebaseService.getConfig();
export const isFirebaseInitialized = () => firebaseService.isInitialized();
export const getEnvironment = () => firebaseService.getEnvironment();
export const getApiUrl = () => firebaseService.getApiUrl();
