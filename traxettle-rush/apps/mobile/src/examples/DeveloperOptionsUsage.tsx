import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { DeveloperOptionsTrigger } from '../components/DeveloperOptionsTrigger';
import { EnvironmentBadge } from '../components/EnvironmentBadge';

/**
 * Example of how to use the developer options and environment badge
 * in a profile screen or settings screen.
 */
export const ProfileScreenExample: React.FC = () => {
  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      {/* Environment Badge - Only shows when in staging mode */}
      <EnvironmentBadge />
      
      {/* Profile Content */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
          John Doe
        </Text>
        <Text style={{ color: '#666', marginBottom: 16 }}>
          john.doe@example.com
        </Text>
      </View>

      {/* Settings Section */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
          Settings
        </Text>
        {/* Other settings items... */}
      </View>

      {/* App Version - Hidden Developer Options Trigger */}
      <View style={{ marginTop: 40, alignItems: 'center' }}>
        <DeveloperOptionsTrigger>
          <Text style={{ fontSize: 12, color: '#999' }}>
            Version 1.0.0
          </Text>
        </DeveloperOptionsTrigger>
      </View>

      {/* Alternative: Wrap any component as trigger */}
      <View style={{ marginTop: 20 }}>
        <DeveloperOptionsTrigger>
          <View style={{ 
            backgroundColor: '#f3f4f6', 
            padding: 12, 
            borderRadius: 8,
            alignItems: 'center' 
          }}>
            <Text style={{ fontSize: 14, color: '#666' }}>
              © 2026 Traxettle app - by Karkhanis Labs
            </Text>
          </View>
        </DeveloperOptionsTrigger>
      </View>
    </ScrollView>
  );
};

/**
 * Usage Instructions:
 * 
 * 1. Add EnvironmentBadge to profile/settings screens
 *    - Shows "STAGE" badge only when in staging mode
 *    - Hidden in production mode
 * 
 * 2. Add DeveloperOptionsTrigger to any screen
 *    - Wrap around version text, logo, or footer
 *    - Tap 7 times quickly (within 2 seconds) to activate
 *    - Opens developer options modal
 * 
 * 3. In developer options modal:
 *    - See current environment
 *    - Switch between staging/production
 *    - Changes take effect immediately
 *    - Setting persists across app restarts
 * 
 * 4. Testing workflow:
 *    - Build app with production config
 *    - Install on device
 *    - Activate developer options (7 taps)
 *    - Switch to staging mode
 *    - Test staging features
 *    - Switch back to production
 *    - Release to users (they won't see developer options)
 */
