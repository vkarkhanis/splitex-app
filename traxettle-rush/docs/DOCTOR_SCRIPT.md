# Traxettle Doctor Script

Comprehensive dependency checker and setup guide for all Traxettle environments.

## Overview

The doctor script verifies that all dependencies are properly configured for:
- **Backend** (Node.js, Firebase, SMTP, etc.)
- **Web** (Next.js, environment variables)
- **Mobile** (React Native, Android/iOS SDK, keystore, etc.)

## Usage

```bash
# Check local environment
./doctor local

# Check staging environment
./doctor staging

# Check production environment
./doctor production

# Or use node directly
node common/scripts/doctor.js [environment]
```

## Environments

| Environment | Purpose | Firebase Project | API URL |
|------------|---------|------------------|---------|
| `local` | Development | `traxettle-test` | `http://localhost:3001` |
| `staging` | Staging | `traxettle-staging` | `https://traxettle-api-staging-lomxjapdhq-uc.a.run.app` |
| `production` | Production | `traxettle-prod` | `https://api.traxettle.app` |

## What the Doctor Checks

### System Requirements
- ✅ Node.js v24+ (required by Rush.js)
- ✅ pnpm (required by Rush.js)
- ✅ Git
- ✅ Essential tools (curl, wget)

### Package Managers
- ✅ npm availability and version
- ✅ pnpm availability and version
- ✅ Rush.js functionality

### Backend Dependencies
- ✅ Backend directory structure
- ✅ Package.json exists
- ✅ Dependencies installed
- ✅ Environment files present

### Web Dependencies
- ✅ Web directory structure
- ✅ Package.json exists
- ✅ Dependencies installed
- ✅ Next.js build configuration

### Mobile Dependencies
- ✅ Mobile directory structure
- ✅ Package.json exists
- ✅ Expo CLI availability
- ✅ Android SDK setup (for Android builds)
- ✅ Java JDK (for Android builds)
- ✅ Xcode (for iOS builds on macOS)

### Firebase Setup
- ✅ Service account keys for environment
- ✅ Android Firebase config (google-services.json)
- ✅ iOS Firebase config (GoogleService-Info.plist)

### RevenueCat Setup
- ✅ RevenueCat API keys configured
- ✅ Entitlement and offering IDs

### Email Setup
- ✅ SMTP configuration
- ✅ Gmail app-specific password (if using Gmail)

### Environment Variables
- ✅ Backend Firebase variables
- ✅ Mobile Google Sign-In variables
- ✅ Web API URL variables

### Build Configuration
- ✅ Android keystore (for release builds)
- ✅ Gradle signing configuration
- ✅ Build scripts present

### Final Verification
- ✅ Backend builds successfully
- ✅ Web builds successfully
- ✅ Mobile Android builds (if SDK available)

## Interactive Features

The doctor script is interactive and will:

1. **Ask questions** when dependencies are missing
2. **Provide documentation links** for setup steps
3. **Continue checking** even if some items fail
4. **Run test builds** to verify everything works
5. **Show a summary** with errors, warnings, and next steps

## Output Examples

### Success Case
```
🩺 Traxettle Doctor - Environment: LOCAL
📋 System Requirements
✅ Platform: darwin
✅ Node.js: v24.1.0
✅ Git is installed
✅ curl is available
✅ wget is available

📦 Package Managers
✅ npm: 10.2.3
✅ pnpm: 9.15.9
✅ Rush: 5.167.0

🎉 All checks passed! Your environment is ready for development and builds.

You can now:
• Start backend: cd apps/api && npm run dev
• Start web: cd apps/web && npm run dev
• Start mobile: cd apps/mobile && npx expo start
```

### Error Case
```
🩺 Traxettle Doctor - Environment: PRODUCTION
📋 System Requirements
✅ Platform: darwin
❌ Node.js version v18.17.0 is too old. Requires v24+

📋 Doctor Summary
Environment: PRODUCTION

❌ Errors (1):
  • Node.js v24+ required

📚 Setup Resources:
General Setup: https://github.com/traxettle/traxettle/blob/main/docs/SETUP.md
Environment Variables: https://github.com/traxettle/traxettle/blob/main/docs/ENVIRONMENT_SETUP.md

❌ Please fix all errors before proceeding with builds.
Run the doctor script again after fixing issues.
```

## Troubleshooting

### Common Issues

1. **"Node.js version too old"**
   - Install Node.js v24+ using nvm
   ```bash
   nvm install 24
   nvm use 24
   ```

2. **"pnpm not found"**
   ```bash
   npm install -g pnpm
   ```

3. **"Android SDK not found"**
   - Install Android Studio
   - Set ANDROID_HOME environment variable
   - See [Android Setup Guide](./ANDROID_SETUP.md)

4. **"Firebase service account key not found"**
   - Download from Firebase Console
   - Place in `apps/api/` with correct naming
   - See [Firebase Setup Guide](./FIREBASE_SETUP.md)

5. **"Backend build failed"**
   - Check environment variables
   - Verify Firebase configuration
   - Run `rush install` to update dependencies

### Debug Mode

For detailed debugging, you can:
1. Run with verbose output: `node common/scripts/doctor.js local --verbose`
2. Check individual components manually
3. Review the specific documentation links provided

## Integration with CI/CD

The doctor script can be integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Check dependencies
  run: ./doctor production

# Docker build
RUN ./doctor production && rush build
```

## Extending the Doctor Script

To add new checks:

1. Add new method to `TraxettleDoctor` class
2. Call the method in the `run()` method
3. Add appropriate documentation links
4. Update this README

Example:
```javascript
async checkNewDependency() {
  colorLog('blue', '\n🔧 New Dependency Check');
  
  if (fileExists('path/to/required/file')) {
    colorLog('green', '✅ New dependency found');
  } else {
    colorLog('red', '❌ New dependency missing');
    this.errors.push('New dependency required');
  }
}
```

## Documentation Links

The doctor script references these documentation files:

- [General Setup](./SETUP.md) - Complete setup guide
- [Firebase Setup](./FIREBASE_SETUP.md) - Firebase configuration
- [Android Setup](./ANDROID_SETUP.md) - Android development
- [iOS Setup](./IOS_SETUP.md) - iOS development
- [Backend Setup](./BACKEND_SETUP.md) - Backend services
- [Environment Setup](./ENVIRONMENT_SETUP.md) - Environment variables
- [RevenueCat Setup](../apps/mobile/REVENUECAT_SETUP.md) - In-app purchases

## Best Practices

1. **Run doctor before starting development**
   ```bash
   ./doctor local
   ```

2. **Run doctor before deployments**
   ```bash
   ./doctor staging
   ./doctor production
   ```

3. **Run doctor after major changes**
   - After updating Node.js
   - After adding new dependencies
   - After changing environment configuration

4. **Keep documentation updated**
   - Update links when moving repositories
   - Add new dependencies to checks
   - Maintain version requirements

## Support

If you encounter issues with the doctor script:

1. Check this documentation first
2. Run with verbose output for debugging
3. Review the specific setup guides linked
4. Check the GitHub issues for similar problems

## Next Steps

After the doctor script passes:

1. **Start Development**:
   ```bash
   cd apps/api && npm run dev
   cd apps/web && npm run dev
   cd apps/mobile && npx expo start
   ```

2. **Run Tests**:
   ```bash
   rush test
   ```

3. **Build for Production**:
   ```bash
   rush build
   ```

4. **Deploy**:
   - Follow deployment guides for your target environment
   - Use the doctor script to verify production setup
