# iOS Development Setup Guide

Complete setup for iOS development, building, and deployment of Traxettle on Apple platforms.

## Overview

iOS development requires:
- macOS (required)
- Xcode 15+
- Apple Developer account
- iOS Simulator or physical device
- Firebase configuration
- App Store provisioning

## Step-by-Step Setup

### 1. Install Xcode

#### From Mac App Store (Recommended)
1. Open App Store
2. Search for "Xcode"
3. Install Xcode 15.0 or later
4. Wait for installation (can take 30+ minutes)

#### From Apple Developer Portal
1. Go to [Apple Developer](https://developer.apple.com/xcode/)
2. Download Xcode
3. Install and move to Applications folder

### 2. Configure Xcode

1. Open Xcode
2. Go to **Xcode** → **Preferences** (or ⌘,)
3. **Accounts** tab:
   - Click "+" → Apple ID
   - Sign in with your Apple Developer account
4. **Locations** tab:
   - Select **Command Line Tools** → Xcode 15.0
5. **Components** tab:
   - Install iOS Simulator
   - Install required platforms

### 3. Install Command Line Tools

```bash
# Install Xcode command line tools
xcode-select --install

# Verify installation
xcode-select -p
# Should output: /Applications/Xcode.app/Contents/Developer
```

### 4. Verify iOS Simulator

```bash
# List available simulators
xcrun simctl list devices

# Create a simulator (optional)
xcrun simctl create "iPhone 15" "iPhone 15" "iOS 17.0"

# Boot simulator
xcrun simctl boot "iPhone 15"
```

### 5. Physical Device Setup

For testing on physical devices:

1. **Enable Developer Mode on Device**:
   - Go to Settings → Privacy & Security
   - Enable "Developer Mode" (iOS 16+)
   - Restart device

2. **Trust Developer Certificate**:
   - Go to Settings → General → VPN & Device Management
   - Find your developer certificate
   - Tap "Trust"

3. **Connect Device**:
   - Connect iPhone/iPad via USB
   - Trust this computer on device
   - Verify in Xcode: **Window** → **Devices and Simulators**

### 6. Firebase Configuration

1. In Firebase Console, add iOS app
2. Bundle ID: `com.traxettle.app`
3. Download `GoogleService-Info.plist`
4. Place in `apps/mobile/ios/`

### 7. Apple Developer Account

#### Free Account (Development Only)
- Can run on own devices
- Cannot distribute to App Store
- Limited to 7 days per app

#### Paid Account ($99/year)
- App Store distribution
- TestFlight beta testing
- Push notifications
- In-app purchases

### 8. App Registration and Certificates

#### 1. Register App ID
1. Go to [Apple Developer Portal](https://developer.apple.com/account/)
2. **Certificates, Identifiers & Profiles** → **Identifiers**
3. Click "+" → **App IDs**
4. Fill in details:
   - Description: "Traxettle"
   - Bundle ID: `com.traxettle.app`
   - Capabilities: 
     - Push Notifications
     - In-App Purchase
     - Associated Domains (for deep links)
     - Background Modes (if needed)

#### 2. Create Development Certificate
1. **Certificates** → click "+"
2. Select **iOS App Development**
3. Follow instructions to create CSR:
   ```bash
   # Create Certificate Signing Request
   openssl req -nodes -newkey rsa:2048 -keyout private.key -out certificate.csr
   ```
4. Upload CSR and download certificate
5. Double-click to install in Keychain Access

#### 3. Register Devices
1. **Devices** → click "+"
2. Add physical devices via:
   - Xcode: **Window** → **Devices and Simulators**
   - Or manually with UDID

#### 4. Create Provisioning Profiles
1. **Profiles** → click "+"
2. **iOS App Development**
3. Select App ID: `com.traxettle.app`
4. Select development certificate
5. Select devices
6. Download and install profile

### 9. Xcode Project Configuration

Open `apps/mobile/ios/Traxettle.xcworkspace` in Xcode:

#### Project Settings
1. Select **Traxettle** project
2. **General** tab:
   - **Bundle Identifier**: `com.traxettle.app`
   - **Version**: `1.0.9`
   - **Build**: `10`
   - **Team**: Select your developer account
   - **Deployment Target**: `15.0` or higher

#### Signing Configuration
1. **Signing & Capabilities** tab
2. **Automatically manage signing**: ✅
3. **Team**: Select your developer account
4. Bundle identifier should match App ID

#### Capabilities
Add these capabilities:
- **Push Notifications**
- **In-App Purchase**
- **Associated Domains** (for deep links: `applinks:traxettle.app`)
- **Background Modes** (if needed)

### 10. Build and Run

#### In Xcode
1. Select target device (simulator or physical)
2. Press ⌘R to build and run
3. Or Product → Run

#### From Command Line
```bash
cd apps/mobile

# Run on simulator
npx expo run:ios

# Run on specific device
npx expo run:ios --device "iPhone 15"

# Build for distribution
npx expo build:ios
```

### 11. App Store Distribution

#### 1. Create Distribution Certificate
1. In Apple Developer Portal
2. **Certificates** → click "+"
3. Select **iOS Distribution**
4. Create CSR and upload
5. Download and install certificate

#### 2. Create Distribution Profile
1. **Profiles** → click "+"
2. Select **App Store**
3. Select App ID and distribution certificate
4. Download profile

#### 3. Archive and Upload
1. In Xcode, select **Any iOS Device (arm64)**
2. Product → Archive (⌘⇧A)
3. In Organizer window:
   - Select archive
   - Click "Distribute App"
   - Choose **App Store Connect**
   - Follow upload wizard

#### 4. App Store Connect Setup
1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. **My Apps** → create new app
3. Fill in app information:
   - Name: "Traxettle"
   - Primary Language: English
   - Bundle ID: `com.traxettle.app`
   - SKU: `com.traxettle.app`
4. Set up pricing and availability
5. Upload screenshots and metadata
6. Submit for review

### 12. TestFlight Beta Testing

#### Internal Testing
1. In App Store Connect
2. **TestFlight** → **Internal Testing**
3. Add internal testers (up to 100)
4. Upload build
5. Testers receive TestFlight invitation

#### External Testing
1. Create external test group
2. Add testers (up to 10,000)
3. Submit build for beta review
4. Approved builds available to external testers

### 13. Troubleshooting

#### Common Issues

1. **"Command line tools are not installed"**:
   ```bash
   xcode-select --install
   sudo xcode-select -switch /Applications/Xcode.app/Contents/Developer
   ```

2. **"No matching provisioning profile found"**:
   - Check bundle identifier matches App ID
   - Verify provisioning profile is installed
   - Clean and rebuild: Product → Clean Build Folder

3. **"Failed to create provisioning profile"**:
   - Verify device is registered
   - Check developer account status
   - Ensure certificate is valid

4. **"Unable to install app"** on device:
   - Check device trust: Settings → General → VPN & Device Management
   - Verify bundle identifier is unique
   - Delete old app version first

5. **Build fails with code signing error**:
   - Check Xcode account settings
   - Verify team selection
   - Ensure provisioning profile matches bundle ID

#### Debug Commands

```bash
# Check Xcode installation
xcodebuild -version

# List simulators
xcrun simctl list devices

# Install app on device
xcrun simctl install booted /path/to/app.ipa

# Check device logs
xcrun simctl spawn booted log stream --level debug
```

### 14. Performance Optimization

#### Build Speed
1. Use **Parallelize build** in Xcode preferences
2. Enable **Build Active Architecture Only** for development
3. Use derived data cleanup periodically

#### App Size
1. Optimize images and assets
2. Remove unused dependencies
3. Use app thinning
4. Enable bitcode (deprecated in Xcode 14+)

#### Launch Time
1. Optimize app initialization
2. Use launch screen efficiently
3. Preload critical resources

### 15. Verification

Test your iOS setup:

```bash
# 1. Check Xcode installation
xcodebuild -version
xcode-select -p

# 2. Check simulators
xcrun simctl list devices | grep iPhone

# 3. Test build
cd apps/mobile
npx expo run:ios

# 4. Test on device (if connected)
xcrun simctl list devices | grep "iOS"
```

### 16. Advanced Topics

#### Push Notifications
1. Enable push notifications capability
2. Create APNs certificate
3. Configure in Firebase
4. Implement in app code

#### In-App Purchases
1. Enable in-app purchase capability
2. Configure products in App Store Connect
3. Implement RevenueCat SDK
4. Test with sandbox environment

#### Universal Links
1. Configure associated domains capability
2. Create apple-app-site-association file
3. Upload to web server
4. Test deep linking

## Next Steps

After iOS setup:
1. Complete [Firebase Setup](./FIREBASE_SETUP.md)
2. Configure [RevenueCat](./REVENUECAT_SETUP.md)
3. Set up [Android Development](./ANDROID_SETUP.md)
4. Configure [Build Process](../SETUP.md#build-configuration)
