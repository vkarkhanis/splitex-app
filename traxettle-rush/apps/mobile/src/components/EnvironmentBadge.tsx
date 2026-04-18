import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { isStaging } from '../config/runtime';

export const EnvironmentBadge: React.FC = () => {
  const [showBadge, setShowBadge] = useState(false);

  useEffect(() => {
    const checkEnvironment = async () => {
      const staging = await isStaging();
      setShowBadge(staging);
    };

    checkEnvironment();
  }, []);

  if (!showBadge) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>STAGE</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  text: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
