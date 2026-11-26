import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';
import App from './src/App';

// The regression runner (maestro/scripts/run-maestro.sh) starts Metro with EXPO_PUBLIC_E2E=true.
// In the Debug test app, React Native's "Open debugger to view warnings" banner sits along the
// bottom of the screen and takes taps meant for buttons there, so hide it for those runs.
// Release builds never show the banner, so store builds are unaffected.
if (__DEV__ && process.env.EXPO_PUBLIC_E2E === 'true') {
  LogBox.ignoreAllLogs(true);
}

registerRootComponent(App);
