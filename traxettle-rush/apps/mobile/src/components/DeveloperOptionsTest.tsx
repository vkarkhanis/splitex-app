import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DeveloperOptionsTrigger } from './DeveloperOptionsTrigger';
import { isStagingModeEnabled } from '../config/runtime';

/**
 * Test component to verify developer options trigger works on real devices
 * This can be used during development to test the 7-tap functionality
 */
export const DeveloperOptionsTest: React.FC = () => {
  const [isStaging, setIsStaging] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    const checkStagingMode = async () => {
      try {
        const staging = await isStagingModeEnabled();
        setIsStaging(staging);
      } catch (error) {
        console.error('Failed to check staging mode:', error);
      }
    };

    checkStagingMode();
    
    // Check every 2 seconds to detect changes
    const interval = setInterval(checkStagingMode, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Developer Options Test</Text>
      
      <View style={styles.status}>
        <Text style={styles.label}>Current Mode:</Text>
        <Text style={[styles.mode, isStaging ? styles.staging : styles.production]}>
          {isStaging ? 'STAGING' : 'PRODUCTION'}
        </Text>
      </View>

      <View style={styles.instructions}>
        <Text style={styles.instructionTitle}>How to Test:</Text>
        <Text style={styles.instructionText}>
          1. Tap the version text below 7 times quickly (within 2 seconds)
        </Text>
        <Text style={styles.instructionText}>
          2. OR long press for 1 second (for emulator/debug)
        </Text>
        <Text style={styles.instructionText}>
          3. Developer options modal should appear
        </Text>
        <Text style={styles.instructionText}>
          4. Toggle staging mode and verify status changes above
        </Text>
      </View>

      <View style={styles.triggerArea}>
        <Text style={styles.triggerLabel}>Tap this area 7 times:</Text>
        <DeveloperOptionsTrigger>
          <View style={styles.triggerBox}>
            <Text style={styles.versionText}>Version 1.0.0</Text>
            {__DEV__ && (
              <Text style={styles.hintText}>
                (Tap 7x or long press)
              </Text>
            )}
          </View>
        </DeveloperOptionsTrigger>
      </View>

      <View style={styles.debug}>
        <Text style={styles.debugTitle}>Debug Info:</Text>
        <Text style={styles.debugText}>
          - Check console logs for tap counting
        </Text>
        <Text style={styles.debugText}>
          - Status updates automatically every 2 seconds
        </Text>
        <Text style={styles.debugText}>
          - Staging mode shows "STAGE" badge in profile
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  status: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    padding: 15,
    backgroundColor: 'white',
    borderRadius: 8,
  },
  label: {
    fontSize: 16,
    marginRight: 10,
    color: '#666',
  },
  mode: {
    fontSize: 16,
    fontWeight: 'bold',
    padding: 8,
    borderRadius: 4,
  },
  staging: {
    backgroundColor: '#f59e0b',
    color: 'white',
  },
  production: {
    backgroundColor: '#10b981',
    color: 'white',
  },
  instructions: {
    marginBottom: 30,
    padding: 15,
    backgroundColor: 'white',
    borderRadius: 8,
  },
  instructionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  instructionText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#666',
  },
  triggerArea: {
    marginBottom: 30,
    alignItems: 'center',
  },
  triggerLabel: {
    fontSize: 16,
    marginBottom: 10,
    color: '#666',
  },
  triggerBox: {
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 5,
  },
  debug: {
    padding: 15,
    backgroundColor: 'white',
    borderRadius: 8,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  debugText: {
    fontSize: 12,
    marginBottom: 5,
    color: '#666',
  },
});

/**
 * Usage Instructions:
 * 
 * 1. Import this component in your development screens
 * 2. Use it to test the 7-tap trigger functionality
 * 3. Monitor console logs for tap counting
 * 4. Verify staging mode changes work correctly
 * 5. Remove from production builds (only for development)
 */
