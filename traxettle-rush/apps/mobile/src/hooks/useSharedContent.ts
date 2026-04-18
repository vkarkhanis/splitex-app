import { useState, useEffect, useCallback } from 'react';
import { NativeModules, Platform, AppState } from 'react-native';

interface SharedContent {
  uri: string;
  mimeType: string;
}

const { ShareIntentModule } = NativeModules;

export const useSharedContent = () => {
  const [sharedContent, setSharedContent] = useState<SharedContent | null>(null);

  const checkForSharedContent = useCallback(async () => {
    if (Platform.OS !== 'android' || !ShareIntentModule) return;
    try {
      const result = await ShareIntentModule.getSharedContent();
      if (result && result.uri) {
        setSharedContent({ uri: result.uri, mimeType: result.mimeType || 'image/jpeg' });
      }
    } catch {
      // No shared content or module unavailable
    }
  }, []);

  useEffect(() => {
    // Check on mount (app opened via share)
    checkForSharedContent();

    // Also check when app returns to foreground (e.g. user switches back)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkForSharedContent();
      }
    });

    return () => {
      subscription?.remove();
    };
  }, [checkForSharedContent]);

  const clearSharedContent = useCallback(async () => {
    setSharedContent(null);
    if (Platform.OS === 'android' && ShareIntentModule) {
      try {
        await ShareIntentModule.clearIntent();
      } catch {
        // Best-effort
      }
    }
  }, []);

  return {
    sharedContent,
    clearSharedContent,
  };
};
