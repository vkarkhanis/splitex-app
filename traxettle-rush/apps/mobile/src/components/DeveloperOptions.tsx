import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { 
  isStagingModeEnabled, 
  toggleStagingMode, 
  getEnvironment,
  refreshRuntimeConfig 
} from '../config/runtime';
import { reconfigurePurchasesWithRuntimeConfig } from '../services/purchases';

interface DeveloperOptionsProps {
  visible: boolean;
  onClose: () => void;
}

export const DeveloperOptions: React.FC<DeveloperOptionsProps> = ({ visible, onClose }) => {
  const [isStaging, setIsStaging] = useState(false);
  const [environment, setEnvironment] = useState<string>('production');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadEnvironmentInfo();
    }
  }, [visible]);

  const loadEnvironmentInfo = async () => {
    try {
      const [stagingMode, env] = await Promise.all([
        isStagingModeEnabled(),
        getEnvironment()
      ]);
      setIsStaging(stagingMode);
      setEnvironment(env);
    } catch (error) {
      console.error('Failed to load environment info:', error);
    }
  };

  const handleToggleEnvironment = async () => {
    setLoading(true);
    try {
      const newStagingMode = await toggleStagingMode();
      setIsStaging(newStagingMode);
      
      // Refresh config to use new environment
      await refreshRuntimeConfig();
      
      // Reconfigure RevenueCat with new environment settings
      try {
        await reconfigurePurchasesWithRuntimeConfig();
        console.log('[DeveloperOptions] RevenueCat reconfigured for new environment');
      } catch (rcError) {
        console.warn('[DeveloperOptions] Failed to reconfigure RevenueCat:', rcError);
        // Don't fail the environment switch if RevenueCat reconfiguration fails
      }
      
      const newEnv = newStagingMode ? 'staging' : 'production';
      setEnvironment(newEnv);
      
      Alert.alert(
        'Environment Switched',
        `Switched to ${newEnv} mode. The app will now use the ${newEnv} API and RevenueCat configuration.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to toggle environment:', error);
      Alert.alert(
        'Error',
        'Failed to switch environment. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <Text style={styles.title}>Developer Options</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Environment</Text>
          <Text style={styles.currentEnv}>
            Current: {environment.toUpperCase()}
          </Text>
          <Text style={styles.description}>
            {isStaging 
              ? 'Using staging API and Firebase project (developer mode)'
              : 'Using production API and Firebase project (default)'
            }
          </Text>
        </View>

        <View style={styles.section}>
          <TouchableOpacity 
            style={[styles.toggleButton, loading && styles.disabled]}
            onPress={handleToggleEnvironment}
            disabled={loading}
          >
            <Text style={styles.toggleButtonText}>
              {loading ? 'Switching...' : `Switch to ${isStaging ? 'Production' : 'Staging'}`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.warning}>
            ⚠️ Staging mode is for development and testing only.
          </Text>
        </View>

        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    backgroundColor: 'white',
    margin: 20,
    padding: 20,
    borderRadius: 10,
    maxWidth: 400,
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  currentEnv: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  toggleButton: {
    backgroundColor: '#6366f1',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  disabled: {
    backgroundColor: '#a5a5a5',
  },
  toggleButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  warning: {
    fontSize: 12,
    color: '#f59e0b',
    textAlign: 'center',
  },
  closeButton: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
