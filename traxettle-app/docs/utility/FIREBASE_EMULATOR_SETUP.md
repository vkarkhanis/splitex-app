# Firebase Emulator Setup - Mobile App

## 🔥 Firebase Emulator Support

The mobile app now supports Firebase Local Emulator Suite for local development. This allows you to test Firebase features locally without affecting production or staging data.

## 📋 Prerequisites

1. **Firebase CLI**: Install Firebase CLI
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebase Project**: Ensure you have a Firebase project set up

3. **Local Development**: Run the app in development mode (`__DEV__ = true`)

## 🚀 Quick Setup

### 1. Start Firebase Emulators
```bash
# From the project root
firebase emulators:start

# Or start specific emulators
firebase emulators:start --only auth,firestore,storage
```

### 2. Enable Emulator Mode in App
```bash
# Enable developer options (tap version text 7 times)
# Then toggle "Use Firebase Emulator" in the developer options
```

### 3. Run the App
```bash
# Start the mobile app in development mode
cd apps/mobile
npm start
```

## 🔧 How It Works

### Emulator Detection
The app automatically detects if Firebase emulator is enabled:

```typescript
// In Firebase service
const useEmulator = await isFirebaseEmulatorEnabled();

if (useEmulator && __DEV__) {
  // Connect to local emulators
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(firestore, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
}
```

### Configuration Modes

#### **Normal Mode (Default)**
- Uses production/staging Firebase projects
- Fetches runtime config from API
- Connects to remote Firebase services

#### **Emulator Mode**
- Uses local Firebase emulators
- Uses local development config
- Connects to `localhost` services
- API calls go to `http://localhost:3002`

## 📱 Developer Options

### Enable Emulator Mode
1. **Unlock Developer Options**: Tap version text 7 times quickly
2. **Toggle Emulator**: Enable "Use Firebase Emulator" switch
3. **Restart App**: App will reconnect to emulators

### Visual Indicators
- **Console Logs**: Shows emulator connection status
- **API Base URL**: Shows `localhost:3002` when emulator is enabled
- **Environment**: Shows "development" in emulator mode

## 🌐 API Integration

### API Endpoints
- **Normal**: Uses staging/production API URLs
- **Emulator**: Uses `http://localhost:3002` (emulator API)

### Data Flow
```
Normal Mode:
Mobile App → Remote API → Remote Firebase

Emulator Mode:
Mobile App → Local API → Firebase Emulators
```

## 🛠️ Development Workflow

### 1. Start Emulators
```bash
firebase emulators:start
```

### 2. Start Local API
```bash
cd apps/api
npm run dev:emulator
```

### 3. Start Mobile App
```bash
cd apps/mobile
npm start
```

### 4. Enable Emulator Mode
- Tap version 7 times
- Toggle "Use Firebase Emulator"
- App restarts with emulator connections

## 🔍 Testing Scenarios

### Authentication Testing
```typescript
// Test auth with emulator
import { getAuth } from 'firebase/auth';

const auth = getAuth();
// In emulator mode, this connects to localhost:9099
```

### Firestore Testing
```typescript
// Test Firestore with emulator
import { getFirestore } from 'firebase/firestore';

const db = getFirestore();
// In emulator mode, this connects to localhost:8080
```

### Storage Testing
```typescript
// Test Storage with emulator
import { getStorage } from 'firebase/storage';

const storage = getStorage();
// In emulator mode, this connects to localhost:9199
```

## 📊 Emulator Suite Ports

| Service | Port | Purpose |
|---------|------|---------|
| Authentication | 9099 | Firebase Auth emulator |
| Firestore | 8080 | Cloud Firestore emulator |
| Storage | 9199 | Firebase Storage emulator |
| API | 3002 | Local API server |

## 🎯 Benefits

### Development Benefits
✅ **Offline Development**: Work without internet connection  
✅ **Zero Cost**: No Firebase usage costs during development  
✅ **Fast Testing**: Instant data resets and modifications  
✅ **Safe Testing**: No risk to production data  
✅ **Data Control**: Full control over test data  

### Workflow Benefits
✅ **Rapid Iteration**: Test changes without deployment  
✅ **Data Seeding**: Populate emulators with test data  
✅ **Debugging**: Step through Firebase operations locally  
✅ **Team Collaboration**: Share emulator data with team  

## 🔧 Configuration Files

### `firebase.json`
```json
{
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "storage": {
      "port": 9199
    }
  }
}
```

### Environment Detection
```typescript
// Automatic emulator detection
const useEmulator = await isFirebaseEmulatorEnabled();
if (useEmulator && __DEV__) {
  // Connect to emulators
}
```

## 🚨 Important Notes

### Security
- **Development Only**: Emulator mode only works in `__DEV__ = true`
- **Local Only**: Emulators run on localhost, not accessible from production builds
- **No Real Data**: Emulator data is isolated and temporary

### Limitations
- **Mobile Only**: Emulator mode is disabled in production builds
- **Local Development**: Requires local Firebase emulator setup
- **API Compatibility**: Local API must support emulator mode

### Best Practices
- **Data Reset**: Use emulator data for testing only
- **Backup Data**: Export important emulator data if needed
- **Clean Testing**: Reset emulators between test runs

## 📝 Troubleshooting

### Common Issues

#### Emulator Not Connecting
```bash
# Check if emulators are running
firebase emulators:start

# Verify ports are available
lsof -i :9099
lsof -i :8080
lsof -i :9199
```

#### API Not Working
```bash
# Check local API server
curl http://localhost:3002/api/config
```

#### App Not Using Emulator
- Ensure app is running in development mode
- Check developer options are enabled
- Verify emulator toggle is on
- Restart the app after enabling emulator mode

### Debug Logs
Enable detailed logging:
```typescript
// In Firebase service
console.log('[Firebase] Emulator mode:', useEmulator);
console.log('[Firebase] Connecting to emulators...');
```

## 🎉 Ready to Use

With Firebase emulator support, you can now:
- Develop completely offline
- Test Firebase features locally
- Iterate quickly without deployments
- Keep production data safe
- Test edge cases with controlled data

The emulator integration works seamlessly with the existing single bundle approach and developer options system!
