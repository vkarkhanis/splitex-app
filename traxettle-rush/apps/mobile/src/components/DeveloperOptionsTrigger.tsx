import React, { useState, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { DeveloperOptions } from './DeveloperOptions';

interface DeveloperOptionsTriggerProps {
  children?: React.ReactNode;
}

export const DeveloperOptionsTrigger: React.FC<DeveloperOptionsTriggerProps> = ({ 
  children 
}) => {
  const [showOptions, setShowOptions] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const lastTapTime = useRef<number>(0);

  const handlePress = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;

    console.log(`[DevOptions] Tap ${tapCount + 1}, time since last: ${timeSinceLastTap}ms`);

    // Reset tap count if more than 2 seconds between taps
    if (timeSinceLastTap > 2000) {
      setTapCount(1);
      console.log('[DevOptions] Tap count reset to 1');
    } else {
      setTapCount(prev => prev + 1);
      console.log(`[DevOptions] Tap count increased to ${tapCount + 1}`);
    }

    lastTapTime.current = now;

    // Show developer options after 7 taps within 2 seconds
    if (tapCount === 6) {
      console.log('[DevOptions] 7 taps detected! Showing developer options');
      setShowOptions(true);
      setTapCount(0);
    }
  };

  const handleLongPress = () => {
    console.log('[DevOptions] Long press detected! Showing developer options (emulator friendly)');
    setShowOptions(true);
  };

  return (
    <>
      <TouchableOpacity 
        style={styles.trigger} 
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={1000} // 1 second long press for emulator/debug
        activeOpacity={0.7}
      >
        {children || (
          <Text style={styles.defaultTrigger}>
            Version 1.0.0
            {__DEV__ && (
              <Text style={styles.debugInfo}>
                {'\n'}(Tap 7x or long press)
              </Text>
            )}
          </Text>
        )}
      </TouchableOpacity>
      
      <DeveloperOptions 
        visible={showOptions} 
        onClose={() => setShowOptions(false)} 
      />
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    // Invisible trigger area - can be wrapped around any component
  },
  defaultTrigger: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  debugInfo: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
