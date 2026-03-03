import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';

export interface RuntimeConfig {
  env: string;
  apiUrl: string;
  firebaseConfig: {
    projectId: string;
    apiKey?: string;
    authDomain?: string;
    databaseURL?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    measurementId?: string;
  };
  revenueCatConfig: {
    googleApiKey: string;
    appleApiKey: string;
    proEntitlement: string;
    offering: string;
  };
}

const RUNTIME_CONFIG_KEY = '@traxettle_runtime_config';
const CONFIG_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export class RuntimeConfigManager {
  private cachedConfig: RuntimeConfig | null = null;
  private cacheExpiry: number = 0;

  /**
   * Get runtime configuration from API or cache
   */
  async getConfig(): Promise<RuntimeConfig> {
    const now = Date.now();
    
    // Return cached config if still valid
    if (this.cachedConfig && now < this.cacheExpiry) {
      console.log('[RuntimeConfig] Using cached config');
      return this.cachedConfig;
    }

    try {
      // Try to load from AsyncStorage first
      const storedConfig = await this.loadStoredConfig();
      if (storedConfig) {
        this.cachedConfig = storedConfig;
        this.cacheExpiry = now + CONFIG_CACHE_DURATION;
        console.log('[RuntimeConfig] Using stored config');
        return storedConfig;
      }

      // Fetch fresh config from API
      const freshConfig = await this.fetchConfig();
      await this.storeConfig(freshConfig);
      
      this.cachedConfig = freshConfig;
      this.cacheExpiry = now + CONFIG_CACHE_DURATION;
      
      console.log('[RuntimeConfig] Fetched fresh config:', {
        env: freshConfig.env,
        apiUrl: freshConfig.apiUrl,
        projectId: freshConfig.firebaseConfig.projectId
      });
      
      return freshConfig;
    } catch (error) {
      console.error('[RuntimeConfig] Failed to get config:', error);
      
      // Fallback to cached config if available
      if (this.cachedConfig) {
        console.log('[RuntimeConfig] Using expired cached config as fallback');
        return this.cachedConfig;
      }
      
      throw new Error('Failed to load runtime configuration');
    }
  }

  /**
   * Fetch configuration from API
   */
  private async fetchConfig(): Promise<RuntimeConfig> {
    // Check if developer mode is enabled for staging
    const useStaging = await this.isStagingModeEnabled();
    
    // Production API URL
    const prodApiUrl = 'https://traxettle-api-prod-943648574702.us-central1.run.app/api/config';
    const stagingApiUrl = 'https://traxettle-api-staging-943648574702.us-central1.run.app/api/config';
    
    let apiUrl: string;
    let environment: string;
    
    if (useStaging) {
      // Developer explicitly wants staging
      apiUrl = stagingApiUrl;
      environment = 'staging (developer mode)';
    } else {
      // Default to production
      apiUrl = prodApiUrl;
      environment = 'production (default)';
    }

    console.log(`[RuntimeConfig] Fetching config from: ${apiUrl} (${environment})`);
    
    try {
      const response = await this.fetchWithTimeout(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.data) {
        throw new Error('No configuration data received');
      }
      
      console.log(`[RuntimeConfig] Success with API: ${apiUrl}`);
      console.log(`[RuntimeConfig] Environment: ${data.data.env}`);
      return data.data;
    } catch (error) {
      console.error(`[RuntimeConfig] API fetch failed for ${apiUrl}:`, error instanceof Error ? error.message : String(error));
      
      // If production fails, don't auto-fallback - let user decide
      if (!useStaging && apiUrl === prodApiUrl) {
        throw new Error('Production API unavailable. Use developer options to switch to staging.');
      }
      
      throw new Error('Failed to fetch configuration');
    }
  }

  /**
   * Fetch with timeout helper
   */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Check if staging mode is enabled (developer option)
   */
  async isStagingModeEnabled(): Promise<boolean> {
    try {
      const stagingMode = await AsyncStorage.getItem('@traxettle_staging_mode');
      return stagingMode === 'true';
    } catch (error) {
      console.error('[RuntimeConfig] Failed to check staging mode:', error);
      return false; // Default to production
    }
  }

  /**
   * Enable staging mode (developer option)
   */
  async enableStagingMode(): Promise<void> {
    try {
      await AsyncStorage.setItem('@traxettle_staging_mode', 'true');
      await this.clearCache(); // Clear config cache to force refresh
      console.log('[RuntimeConfig] Staging mode enabled');
    } catch (error) {
      console.error('[RuntimeConfig] Failed to enable staging mode:', error);
      throw new Error('Failed to enable staging mode');
    }
  }

  /**
   * Disable staging mode (switch back to production)
   */
  async disableStagingMode(): Promise<void> {
    try {
      await AsyncStorage.removeItem('@traxettle_staging_mode');
      await this.clearCache(); // Clear config cache to force refresh
      console.log('[RuntimeConfig] Staging mode disabled');
    } catch (error) {
      console.error('[RuntimeConfig] Failed to disable staging mode:', error);
      throw new Error('Failed to disable staging mode');
    }
  }

  /**
   * Toggle staging mode
   */
  async toggleStagingMode(): Promise<boolean> {
    const isCurrentlyStaging = await this.isStagingModeEnabled();
    
    if (isCurrentlyStaging) {
      await this.disableStagingMode();
      return false; // Now in production
    } else {
      await this.enableStagingMode();
      return true; // Now in staging
    }
  }

  /**
   * Load configuration from AsyncStorage
   */
  private async loadStoredConfig(): Promise<RuntimeConfig | null> {
    try {
      const stored = await AsyncStorage.getItem(RUNTIME_CONFIG_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('[RuntimeConfig] Failed to load stored config:', error);
      return null;
    }
  }

  /**
   * Store configuration in AsyncStorage
   */
  private async storeConfig(config: RuntimeConfig): Promise<void> {
    try {
      await AsyncStorage.setItem(RUNTIME_CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('[RuntimeConfig] Failed to store config:', error);
    }
  }

  /**
   * Clear cached configuration
   */
  async clearCache(): Promise<void> {
    this.cachedConfig = null;
    this.cacheExpiry = 0;
    
    try {
      await AsyncStorage.removeItem(RUNTIME_CONFIG_KEY);
      console.log('[RuntimeConfig] Cache cleared');
    } catch (error) {
      console.error('[RuntimeConfig] Failed to clear cache:', error);
    }
  }

  /**
   * Force refresh configuration from API
   */
  async refreshConfig(): Promise<RuntimeConfig> {
    await this.clearCache();
    return this.getConfig();
  }

  /**
   * Check if app is in production environment
   */
  async isProduction(): Promise<boolean> {
    const isStagingMode = await this.isStagingModeEnabled();
    return !isStagingMode;
  }

  /**
   * Check if app is in staging environment
   */
  async isStaging(): Promise<boolean> {
    const isStagingMode = await this.isStagingModeEnabled();
    return isStagingMode;
  }

  /**
   * Get current environment
   */
  async getEnvironment(): Promise<string> {
    const isStagingMode = await this.isStagingModeEnabled();
    return isStagingMode ? 'staging' : 'production';
  }

  /**
   * Get API URL
   */
  async getApiUrl(): Promise<string> {
    const config = await this.getConfig();
    return config.apiUrl;
  }

  /**
   * Get Firebase configuration
   */
  async getFirebaseConfig(): Promise<RuntimeConfig['firebaseConfig']> {
    const config = await this.getConfig();
    return config.firebaseConfig;
  }
}

// Export singleton instance
export const runtimeConfig = new RuntimeConfigManager();

// Export convenience methods
export const getRuntimeConfig = () => runtimeConfig.getConfig();
export const refreshRuntimeConfig = () => runtimeConfig.refreshConfig();
export const clearRuntimeConfigCache = () => runtimeConfig.clearCache();
export const isProduction = () => runtimeConfig.isProduction();
export const isStaging = () => runtimeConfig.isStaging();
export const getEnvironment = () => runtimeConfig.getEnvironment();
export const getApiUrl = () => runtimeConfig.getApiUrl();
export const getFirebaseConfig = () => runtimeConfig.getFirebaseConfig();

// Export developer options
export const isStagingModeEnabled = () => runtimeConfig.isStagingModeEnabled();
export const enableStagingMode = () => runtimeConfig.enableStagingMode();
export const disableStagingMode = () => runtimeConfig.disableStagingMode();
export const toggleStagingMode = () => runtimeConfig.toggleStagingMode();
