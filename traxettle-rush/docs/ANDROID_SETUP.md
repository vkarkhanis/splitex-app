# Android Development Setup Guide

Complete setup for Android development, building, and deployment of Traxettle.

## Overview

Android development requires:
- Java JDK 17+
- Android SDK
- Android build tools
- Keystore for release builds
- Firebase configuration

## Step-by-Step Setup

### 1. Install Java JDK

#### macOS
```bash
# Using Homebrew (recommended)
brew install openjdk@17

# Set JAVA_HOME in ~/.zshrc or ~/.bashrc
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install openjdk-17-jdk

# Set JAVA_HOME
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
source ~/.bashrc
```

#### Windows
1. Download JDK 17 from [Adoptium](https://adoptium.net/)
2. Install and note the installation path
3. Set JAVA_HOME environment variable:
   - Press Win + R, type "sysdm.cpl"
   - Go to Advanced → Environment Variables
   - Add JAVA_HOME pointing to JDK installation directory

### 2. Install Android SDK

#### Option A: Android Studio (Recommended)

1. Download [Android Studio](https://developer.android.com/studio)
2. Install and open Android Studio
3. Go to **Tools** → **SDK Manager**
4. **SDK Platforms**: Install Android API 34 (Android 14)
5. **SDK Tools**: Install:
   - Android SDK Build-Tools 34.0.0
   - Android SDK Command-line Tools
   - Android SDK Platform-Tools
   - Android SDK Tools
   - NDK (Side by side) - version 26.1.10909125
   - CMake - version 3.22.1

#### Option B: Command Line Tools Only

1. Download [Command Line Tools](https://developer.android.com/studio/command-line-tools)
2. Extract to `~/android-sdk/cmdline-tools`
3. Add to PATH and set up:

```bash
# Create directory structure
mkdir -p ~/android-sdk/cmdline-tools/latest
mv ~/Downloads/cmdline-tools/* ~/android-sdk/cmdline-tools/latest/

# Add to ~/.zshrc or ~/.bashrc
export ANDROID_HOME=$HOME/android-sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/emulator

# Install required packages
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

### 3. Configure Environment

Add these to your shell profile (~/.zshrc or ~/.bashrc):

#### macOS
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

#### Linux
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

#### Windows
```cmd
setx ANDROID_HOME "C:\Users\%USERNAME%\AppData\Local\Android\Sdk"
setx ANDROID_SDK_ROOT "%ANDROID_HOME%"
setx PATH "%PATH%;%ANDROID_HOME%\emulator;%ANDROID_HOME%\tools;%ANDROID_HOME%\tools\bin;%ANDROID_HOME%\platform-tools"
```

### 4. Create Android Virtual Device (AVD)

For testing without a physical device:

```bash
# List available system images
sdkmanager --list

# Install system image
sdkmanager "system-images;android-34;google_apis;x86_64"

# Create AVD
avdmanager create avd -n traxettle-emulator -k "system-images;android-34;google_apis;x86_64" -d "pixel_4"

# Start emulator
emulator -avd traxettle-emulator
```

### 5. Generate Release Keystore

For publishing to Google Play Store:

```bash
cd apps/mobile/android/app
keytool -genkeypair -v -storetype PKCS12 -keystore traxettle-release-key.keystore -alias traxettle-key -keyalg RSA -keysize 2048 -validity 10000
```

**Important**: Store these passwords securely:
- Keystore password
- Key password

### 6. Configure Signing

Create `apps/mobile/android/gradle.properties.local` (this file is git-ignored):

```properties
RELEASE_STORE_FILE=traxettle-release-key.keystore
RELEASE_STORE_PASSWORD=your_keystore_password
RELEASE_KEY_ALIAS=traxettle-key
RELEASE_KEY_PASSWORD=your_key_password
```

### 7. Firebase Configuration

1. In Firebase Console, add Android app
2. Package name: `com.traxettle.app`
3. Download `google-services.json`
4. Place in `apps/mobile/android/app/`

### 8. Physical Device Setup

For testing on a physical device:

1. Enable Developer Options:
   - Go to Settings → About phone
   - Tap "Build number" 7 times
2. Enable USB Debugging:
   - Go to Settings → Developer options
   - Enable "USB debugging"
3. Connect device and authorize:
   ```bash
   # Check device is detected
   adb devices
   
   # Install APK
   adb install -r app-release.apk
   ```

### 9. Build Configuration

The build script handles different environments:

```bash
cd apps/mobile

# Development build (staging)
bash scripts/build-android.sh debug:staging

# Production build
bash scripts/build-android.sh release:production

# Install on connected device/emulator
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

### 10. Gradle Configuration

Key files in `apps/mobile/android/`:

#### `build.gradle` (Project level)
- Configures Android Gradle Plugin
- Sets up repositories
- Defines build tools version

#### `app/build.gradle`
- Configures app-specific settings
- Sets up signing configuration
- Defines dependencies
- Sets version code and name

#### `gradle.properties`
- Global Gradle settings
- Memory configuration
- Android settings

### 11. Troubleshooting

#### Common Issues

1. **ANDROID_HOME not set**:
   ```bash
   echo $ANDROID_HOME
   # Should show path to Android SDK
   ```

2. **Gradle build fails**:
   ```bash
   # Clean and rebuild
   cd apps/mobile/android
   ./gradlew clean
   ./gradlew assembleRelease
   ```

3. **Emulator not starting**:
   ```bash
   # Check system image
   sdkmanager --list | grep "system-images"
   
   # Reinstall emulator
   sdkmanager "emulator"
   ```

4. **Device not detected**:
   ```bash
   # Restart adb server
   adb kill-server
   adb start-server
   adb devices
   ```

#### Build Errors

1. **"Failed to install app"**:
   - Check device storage space
   - Uninstall old version first
   - Check app signing

2. **"Execution failed for task ':app:mergeReleaseResources'"**:
   - Clean build: `./gradlew clean`
   - Check Android SDK installation

3. **"Could not resolve all files for configuration"**:
   - Check internet connection
   - Run `rush install` to update dependencies

### 12. Performance Optimization

#### Build Speed

1. **Enable Gradle Daemon**:
   ```bash
   echo "org.gradle.daemon=true" >> ~/.gradle/gradle.properties
   ```

2. **Configure Gradle Memory**:
   ```bash
   echo "org.gradle.jvmargs=-Xmx4g -XX:MaxPermSize=512m" >> ~/.gradle/gradle.properties
   ```

3. **Use Gradle Build Cache**:
   ```bash
   echo "org.gradle.caching=true" >> ~/.gradle/gradle.properties
   ```

#### APK Size

1. **Enable ProGuard** (already configured)
2. **Optimize images** and assets
3. **Remove unused dependencies**

### 13. Production Deployment

#### Google Play Console Setup

1. Create developer account
2. Pay registration fee ($25)
3. Create application listing
4. Upload signed APK/AAB
5. Fill store listing information
6. Set pricing and distribution
7. Submit for review

#### AAB vs APK

- **AAB (Android App Bundle)**: Recommended for Play Store
- **APK**: For direct distribution/testing

To build AAB:
```bash
cd apps/mobile/android
./gradlew bundleRelease
```

### 14. Verification

Test your Android setup:

```bash
# 1. Check environment
echo $ANDROID_HOME
echo $JAVA_HOME

# 2. Check tools
adb version
sdkmanager --version

# 3. Test build
cd apps/mobile
bash scripts/build-android.sh debug:staging

# 4. Test on device/emulator
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Next Steps

After Android setup:
1. Complete [Firebase Setup](./FIREBASE_SETUP.md)
2. Configure [RevenueCat](./REVENUECAT_SETUP.md)
3. Set up [iOS Development](./IOS_SETUP.md)
