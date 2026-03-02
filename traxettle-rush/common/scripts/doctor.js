#!/usr/bin/env node

/**
 * Traxettle Doctor Script
 * 
 * Comprehensive dependency checker and setup guide for all environments:
 * - Backend (Node.js, Firebase, SMTP, RevenueCat, etc.)
 * - Web (Node.js, environment variables)
 * - Mobile (Node.js, Android SDK, keystore, Firebase, etc.)
 * 
 * Usage: node common/scripts/doctor.js [environment]
 * Environments: local, staging, production
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ANSI colors for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  underline: '\x1b[4m'
};

function colorLog(color, text) {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

function colorLogLink(text, url) {
  console.log(`${colors.cyan}${text}${colors.reset}: ${colors.underline}${url}${colors.reset}`);
}

// Environment detection
function detectEnvironment() {
  const args = process.argv.slice(2);
  const env = args.find(arg => ['local', 'staging', 'production'].includes(arg)) || process.env.NODE_ENV || 'local';
  const isNonInteractive = args.includes('--non-interactive') || args.includes('-n');
  
  if (!['local', 'staging', 'production'].includes(env)) {
    colorLog('red', 'Invalid environment. Use: local, staging, or production');
    process.exit(1);
  }
  
  return { env, isNonInteractive };
}

// Helper to ask yes/no questions
async function askYesNo(question, isNonInteractive = false) {
  if (isNonInteractive) {
    colorLog('yellow', `⚠️  ${question} (non-interactive mode: assuming "no")`);
    return false;
  }
  
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const answer = await rl.question(`${colors.yellow}${question} (y/n): ${colors.reset}`);
      attempts++;
      
      if (!answer || answer.trim() === '') {
        colorLog('yellow', 'No input received, assuming "no"');
        return false;
      }
      
      const cleanAnswer = answer.trim().toLowerCase();
      if (cleanAnswer === 'y' || cleanAnswer === 'yes') return true;
      if (cleanAnswer === 'n' || cleanAnswer === 'no') return false;
      
      colorLog('red', `Please answer y/yes or n/no (attempt ${attempts}/${maxAttempts})`);
    } catch (error) {
      colorLog('red', 'Input error, assuming "no"');
      return false;
    }
  }
  
  colorLog('yellow', 'Max attempts reached, assuming "no"');
  return false;
}

// Helper to check if file exists
function fileExists(filePath) {
  return fs.existsSync(path.resolve(filePath));
}

// Helper to check if command exists
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Helper to check environment variable
function checkEnvVar(varName, required = true) {
  const value = process.env[varName];
  if (required && !value) {
    colorLog('red', `❌ Missing required environment variable: ${varName}`);
    return false;
  }
  if (value) {
    colorLog('green', `✅ ${varName} is set`);
    return true;
  }
  colorLog('yellow', `⚠️  ${varName} is not set (optional)`);
  return true;
}

// Documentation links
const DOCS = {
  SETUP: 'https://github.com/traxettle/traxettle/blob/main/docs/SETUP.md',
  FIREBASE: 'https://github.com/traxettle/traxettle/blob/main/docs/FIREBASE_SETUP.md',
  REVENUECAT: 'https://github.com/traxettle/traxettle/blob/main/apps/mobile/REVENUECAT_SETUP.md',
  ANDROID: 'https://github.com/traxettle/traxettle/blob/main/docs/ANDROID_SETUP.md',
  IOS: 'https://github.com/traxettle/traxettle/blob/main/docs/IOS_SETUP.md',
  BACKEND: 'https://github.com/traxettle/traxettle/blob/main/docs/BACKEND_SETUP.md',
  ENVIRONMENT: 'https://github.com/traxettle/traxettle/blob/main/docs/ENVIRONMENT_SETUP.md'
};

// Main doctor checks
class TraxettleDoctor {
  constructor(environment, isNonInteractive = false) {
    this.environment = environment;
    this.isNonInteractive = isNonInteractive;
    this.errors = [];
    this.warnings = [];
  }

  async run() {
    colorLog('bright', `🩺 Traxettle Doctor - Environment: ${this.environment.toUpperCase()}`);
    colorLog('cyan', 'Checking all dependencies for web, mobile, and backend...\n');

    await this.checkSystemRequirements();
    await this.checkNodeAndPackageManagers();
    await this.checkBackendDependencies();
    await this.checkWebDependencies();
    await this.checkMobileDependencies();
    await this.checkFirebaseSetup();
    await this.checkRevenueCatSetup();
    await this.checkEmailSetup();
    await this.checkEnvironmentVariables();
    await this.checkBuildConfiguration();
    await this.runFinalVerification();

    this.printSummary();
  }

  async checkSystemRequirements() {
    colorLog('blue', '\n📋 System Requirements');
    
    // Check OS
    const platform = process.platform;
    colorLog('green', `✅ Platform: ${platform}`);

    // Check Node.js version
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      if (majorVersion >= 24) {
        colorLog('green', `✅ Node.js: ${nodeVersion}`);
      } else {
        colorLog('red', `❌ Node.js version ${nodeVersion} is too old. Requires v24+`);
        this.errors.push('Node.js v24+ required');
      }
    } catch {
      colorLog('red', '❌ Node.js not found');
      this.errors.push('Node.js required');
    }

    // Check Git
    if (commandExists('git')) {
      colorLog('green', '✅ Git is installed');
    } else {
      colorLog('red', '❌ Git not found');
      this.errors.push('Git required');
    }

    // Check for essential tools
    const tools = ['curl', 'wget'];
    for (const tool of tools) {
      if (commandExists(tool)) {
        colorLog('green', `✅ ${tool} is available`);
      } else {
        colorLog('yellow', `⚠️  ${tool} not found (recommended)`);
        this.warnings.push(`${tool} recommended`);
      }
    }
  }

  async checkNodeAndPackageManagers() {
    colorLog('blue', '\n📦 Package Managers');

    // Check npm
    if (commandExists('npm')) {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      colorLog('green', `✅ npm: ${npmVersion}`);
    } else {
      colorLog('red', '❌ npm not found');
      this.errors.push('npm required');
    }

    // Check pnpm
    if (commandExists('pnpm')) {
      const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
      colorLog('green', `✅ pnpm: ${pnpmVersion}`);
    } else {
      colorLog('red', '❌ pnpm not found');
      this.errors.push('pnpm required (Rush.js dependency)');
    }

    // Check Rush
    try {
      const rushVersion = execSync('node common/scripts/install-run-rush.js --version', { 
        encoding: 'utf8', 
        cwd: process.cwd(),
        stdio: 'pipe'
      }).trim();
      colorLog('green', `✅ Rush: ${rushVersion}`);
    } catch (error) {
      colorLog('red', '❌ Rush.js not working');
      this.errors.push('Rush.js required');
    }
  }

  async checkBackendDependencies() {
    colorLog('blue', '\n🔧 Backend Dependencies');

    // Check if backend directory exists
    if (!fileExists('apps/api')) {
      colorLog('red', '❌ Backend directory not found');
      this.errors.push('Backend directory missing');
      return;
    }

    // Check backend package.json
    if (!fileExists('apps/api/package.json')) {
      colorLog('red', '❌ Backend package.json not found');
      this.errors.push('Backend package.json missing');
      return;
    }

    // Check if backend dependencies are installed
    try {
      execSync('cd apps/api && npm list --depth=0', { stdio: 'ignore' });
      colorLog('green', '✅ Backend dependencies installed');
    } catch {
      colorLog('yellow', '⚠️  Backend dependencies may not be installed');
      const installed = await askYesNo('Have you installed backend dependencies with rush install?', this.isNonInteractive);
      if (!installed) {
        colorLogLink('Install dependencies', 'Run: rush install');
        this.errors.push('Backend dependencies not installed');
        return;
      }
    }

    // Check backend environment file
    const envFiles = ['.env', '.env.local', '.env.production'];
    const hasEnvFile = envFiles.some(file => fileExists(`apps/api/${file}`));
    if (hasEnvFile) {
      colorLog('green', '✅ Backend environment file found');
    } else {
      colorLog('yellow', '⚠️  No backend environment file found');
      const setup = await askYesNo('Have you set up backend environment variables?', this.isNonInteractive);
      if (!setup) {
        colorLogLink('Backend setup guide', DOCS.BACKEND);
        this.errors.push('Backend environment not configured');
      }
    }
  }

  async checkWebDependencies() {
    colorLog('blue', '\n🌐 Web Dependencies');

    // Check if web directory exists
    if (!fileExists('apps/web')) {
      colorLog('red', '❌ Web directory not found');
      this.errors.push('Web directory missing');
      return;
    }

    // Check web package.json
    if (!fileExists('apps/web/package.json')) {
      colorLog('red', '❌ Web package.json not found');
      this.errors.push('Web package.json missing');
      return;
    }

    // Check if web dependencies are installed
    try {
      execSync('cd apps/web && npm list --depth=0', { stdio: 'ignore' });
      colorLog('green', '✅ Web dependencies installed');
    } catch {
      colorLog('yellow', '⚠️  Web dependencies may not be installed');
      const installed = await askYesNo('Have you installed web dependencies with rush install?', this.isNonInteractive);
      if (!installed) {
        colorLogLink('Install dependencies', 'Run: rush install');
        this.errors.push('Web dependencies not installed');
      }
    }

    // Check Next.js build
    try {
      execSync('cd apps/web && npx next build --dry-run', { stdio: 'ignore' });
      colorLog('green', '✅ Web build configuration valid');
    } catch {
      colorLog('yellow', '⚠️  Web build configuration may have issues');
    }
  }

  async checkMobileDependencies() {
    colorLog('blue', '\n📱 Mobile Dependencies');

    // Check if mobile directory exists
    if (!fileExists('apps/mobile')) {
      colorLog('red', '❌ Mobile directory not found');
      this.errors.push('Mobile directory missing');
      return;
    }

    // Check mobile package.json
    if (!fileExists('apps/mobile/package.json')) {
      colorLog('red', '❌ Mobile package.json not found');
      this.errors.push('Mobile package.json missing');
      return;
    }

    // Check Expo CLI
    if (commandExists('npx') && commandExists('expo')) {
      colorLog('green', '✅ Expo CLI available');
    } else {
      colorLog('yellow', '⚠️  Expo CLI not found in PATH');
      const setup = await askYesNo('Is Expo CLI available via npx?', this.isNonInteractive);
      if (!setup) {
        colorLogLink('Expo setup guide', 'https://docs.expo.dev/get-started/installation/');
        this.warnings.push('Expo CLI setup recommended');
      }
    }

    // Check Android SDK (for Android builds)
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      if (androidHome && fileExists(androidHome)) {
        colorLog('green', `✅ Android SDK found at ${androidHome}`);
      } else {
        colorLog('yellow', '⚠️  Android SDK not found or ANDROID_HOME not set');
        const setup = await askYesNo('Have you set up Android SDK for mobile builds?', this.isNonInteractive);
        if (!setup) {
          colorLogLink('Android setup guide', DOCS.ANDROID);
          this.warnings.push('Android SDK setup needed for Android builds');
        }
      }
    }

    // Check Java (for Android builds)
    if (commandExists('java')) {
      try {
        const javaVersion = execSync('java -version 2>&1', { encoding: 'utf8' });
        colorLog('green', '✅ Java is available');
      } catch {
        colorLog('yellow', '⚠️  Java version check failed');
      }
    } else {
      colorLog('yellow', '⚠️  Java not found (required for Android builds)');
      this.warnings.push('Java required for Android builds');
    }

    // Check Xcode (for iOS builds on macOS)
    if (process.platform === 'darwin') {
      if (commandExists('xcodebuild')) {
        colorLog('green', '✅ Xcode is available');
      } else {
        colorLog('yellow', '⚠️  Xcode not found (required for iOS builds)');
        const setup = await askYesNo('Have you installed Xcode for iOS builds?', this.isNonInteractive);
        if (!setup) {
          colorLogLink('iOS setup guide', DOCS.IOS);
          this.warnings.push('Xcode required for iOS builds');
        }
      }
    }
  }

  async checkFirebaseSetup() {
    colorLog('blue', '\n🔥 Firebase Setup');

    const firebaseProjects = {
      local: 'traxettle-test',
      staging: 'traxettle-staging', 
      production: 'traxettle-prod'
    };

    const projectId = firebaseProjects[this.environment];

    // Check for Firebase service account key
    const serviceAccountPath = `apps/api/${projectId}-service-account.json`;
    if (fileExists(serviceAccountPath)) {
      colorLog('green', `✅ Firebase service account key found for ${projectId}`);
    } else {
      colorLog('red', `❌ Firebase service account key not found: ${serviceAccountPath}`);
      const setup = await askYesNo(`Have you created Firebase project "${projectId}" and downloaded service account key?`, this.isNonInteractive);
      if (!setup) {
        colorLogLink('Firebase setup guide', DOCS.FIREBASE);
        this.errors.push(`Firebase project "${projectId}" not configured`);
      }
    }

    // Check for mobile Firebase config files
    const googleServicesPath = 'apps/mobile/android/app/google-services.json';
    const plistPath = 'apps/mobile/ios/GoogleService-Info.plist';

    if (fileExists(googleServicesPath)) {
      colorLog('green', '✅ Android Firebase config found');
    } else {
      colorLog('yellow', '⚠️  Android Firebase config not found');
      this.warnings.push('Android Firebase config needed for mobile builds');
    }

    if (fileExists(plistPath)) {
      colorLog('green', '✅ iOS Firebase config found');
    } else {
      colorLog('yellow', '⚠️  iOS Firebase config not found');
      this.warnings.push('iOS Firebase config needed for iOS builds');
    }
  }

  async checkRevenueCatSetup() {
    colorLog('blue', '\n💰 RevenueCat Setup');

    // Check RevenueCat environment variables
    const revenueCatVars = [
      'EXPO_PUBLIC_REVENUECAT_APPLE_KEY',
      'EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY'
    ];

    let revenueCatConfigured = true;
    for (const varName of revenueCatVars) {
      if (!checkEnvVar(varName, false)) {
        revenueCatConfigured = false;
      }
    }

    if (revenueCatConfigured) {
      colorLog('green', '✅ RevenueCat environment variables configured');
    } else {
      colorLog('yellow', '⚠️  RevenueCat not fully configured');
      const setup = await askYesNo('Have you set up RevenueCat for in-app purchases?', this.isNonInteractive);
      if (!setup) {
        colorLogLink('RevenueCat setup guide', DOCS.REVENUECAT);
        this.warnings.push('RevenueCat setup needed for in-app purchases');
      }
    }
  }

  async checkEmailSetup() {
    colorLog('blue', '\n📧 Email Setup');

    // Check email environment variables
    const emailVars = [
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM'
    ];

    let emailConfigured = true;
    for (const varName of emailVars) {
      if (!checkEnvVar(varName, false)) {
        emailConfigured = false;
      }
    }

    if (emailConfigured) {
      colorLog('green', '✅ Email configuration found');
    } else {
      colorLog('yellow', '⚠️  Email not fully configured');
      const setup = await askYesNo('Have you set up SMTP for email notifications?', this.isNonInteractive);
      if (!setup) {
        colorLogLink('Email setup guide', `${DOCS.BACKEND}#email-configuration`);
        this.warnings.push('Email setup needed for notifications');
      }
    }

    // Check for app-specific password if using Gmail
    const smtpHost = process.env.SMTP_HOST;
    if (smtpHost && smtpHost.includes('gmail')) {
      colorLog('cyan', '📬 Gmail SMTP detected');
      const hasAppPassword = await askYesNo('Have you generated a Gmail app-specific password?', this.isNonInteractive);
      if (!hasAppPassword) {
        colorLogLink('Gmail app password guide', 'https://support.google.com/accounts/answer/185833');
        this.warnings.push('Gmail app-specific password required');
      }
    }
  }

  async checkEnvironmentVariables() {
    colorLog('blue', '\n🔧 Environment Variables');

    // Check backend environment variables
    const backendVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'PORT'
    ];

    colorLog('cyan', 'Backend environment variables:');
    let backendConfigured = true;
    for (const varName of backendVars) {
      if (!checkEnvVar(varName)) {
        backendConfigured = false;
      }
    }

    // Check mobile environment variables
    const mobileVars = [
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'
    ];

    colorLog('cyan', '\nMobile environment variables:');
    for (const varName of mobileVars) {
      checkEnvVar(varName, false);
    }

    // Check web environment variables
    const webVars = [
      'NEXT_PUBLIC_API_URL'
    ];

    colorLog('cyan', '\nWeb environment variables:');
    for (const varName of webVars) {
      checkEnvVar(varName, false);
    }
  }

  async checkBuildConfiguration() {
    colorLog('blue', '\n🔨 Build Configuration');

    // Check Android keystore
    const keystorePath = 'apps/mobile/android/app/traxettle-release-key.keystore';
    const gradlePropsPath = 'apps/mobile/android/gradle.properties.local';

    if (fileExists(keystorePath)) {
      colorLog('green', '✅ Android keystore found');
    } else {
      colorLog('yellow', '⚠️  Android keystore not found');
      const setup = await askYesNo('Have you generated Android keystore for release builds?', this.isNonInteractive);
      if (!setup) {
        colorLogLink('Android keystore setup', `${DOCS.ANDROID}#keystore-setup`);
        this.warnings.push('Android keystore needed for release builds');
      }
    }

    if (fileExists(gradlePropsPath)) {
      colorLog('green', '✅ Android gradle.properties.local found');
    } else {
      colorLog('yellow', '⚠️  Android gradle.properties.local not found');
      this.warnings.push('gradle.properties.local needed for signing configuration');
    }

    // Check build scripts
    const buildScripts = [
      'apps/mobile/scripts/build-android.sh',
      'apps/web/package.json',
      'apps/api/package.json'
    ];

    for (const script of buildScripts) {
      if (fileExists(script)) {
        colorLog('green', `✅ Build script found: ${script}`);
      } else {
        colorLog('red', `❌ Build script missing: ${script}`);
        this.errors.push(`Build script missing: ${script}`);
      }
    }
  }

  async runFinalVerification() {
    colorLog('blue', '\n🧪 Final Verification');

    if (this.errors.length > 0) {
      colorLog('red', '\n❌ Cannot proceed with verification due to errors');
      return;
    }

    // Test backend build
    colorLog('cyan', 'Testing backend build...');
    try {
      execSync('cd apps/api && npm run build', { stdio: 'ignore' });
      colorLog('green', '✅ Backend builds successfully');
    } catch {
      colorLog('red', '❌ Backend build failed');
      this.errors.push('Backend build failed');
    }

    // Test web build
    colorLog('cyan', 'Testing web build...');
    try {
      execSync('cd apps/web && npm run build', { stdio: 'ignore' });
      colorLog('green', '✅ Web builds successfully');
    } catch {
      colorLog('red', '❌ Web build failed');
      this.errors.push('Web build failed');
    }

    // Test mobile build (Android only if Android SDK available)
    if (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) {
      colorLog('cyan', 'Testing mobile Android build...');
      try {
        execSync('cd apps/mobile && bash scripts/build-android.sh debug:staging', { 
          stdio: 'ignore',
          timeout: 300000 // 5 minute timeout
        });
        colorLog('green', '✅ Mobile Android builds successfully');
      } catch {
        colorLog('red', '❌ Mobile Android build failed');
        this.errors.push('Mobile Android build failed');
      }
    } else {
      colorLog('yellow', '⚠️  Skipping Android build test (Android SDK not available)');
    }
  }

  printSummary() {
    colorLog('bright', '\n📋 Doctor Summary');
    colorLog('cyan', `Environment: ${this.environment.toUpperCase()}\n`);

    if (this.errors.length === 0 && this.warnings.length === 0) {
      colorLog('green', '🎉 All checks passed! Your environment is ready for development and builds.');
      colorLog('green', '\nYou can now:');
      colorLog('green', '• Start backend: cd apps/api && npm run dev');
      colorLog('green', '• Start web: cd apps/web && npm run dev');
      colorLog('green', '• Start mobile: cd apps/mobile && npx expo start');
      return;
    }

    if (this.errors.length > 0) {
      colorLog('red', `\n❌ Errors (${this.errors.length}):`);
      this.errors.forEach(error => colorLog('red', `  • ${error}`));
    }

    if (this.warnings.length > 0) {
      colorLog('yellow', `\n⚠️  Warnings (${this.warnings.length}):`);
      this.warnings.forEach(warning => colorLog('yellow', `  • ${warning}`));
    }

    colorLog('cyan', '\n📚 Setup Resources:');
    colorLogLink('General Setup', DOCS.SETUP);
    colorLogLink('Environment Variables', DOCS.ENVIRONMENT);
    colorLogLink('Firebase Setup', DOCS.FIREBASE);
    colorLogLink('RevenueCat Setup', DOCS.REVENUECAT);
    colorLogLink('Android Setup', DOCS.ANDROID);
    colorLogLink('iOS Setup', DOCS.IOS);
    colorLogLink('Backend Setup', DOCS.BACKEND);

    if (this.errors.length > 0) {
      colorLog('red', '\n❌ Please fix all errors before proceeding with builds.');
      colorLog('yellow', 'Run the doctor script again after fixing issues.');
    } else if (this.warnings.length > 0) {
      colorLog('yellow', '\n⚠️  You can proceed with development, but consider addressing warnings for full functionality.');
    }
  }
}

// Main execution
async function main() {
  try {
    const { env, isNonInteractive } = detectEnvironment();
    const doctor = new TraxettleDoctor(env, isNonInteractive);
    await doctor.run();
  } catch (error) {
    colorLog('red', `❌ Doctor script failed: ${error.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = TraxettleDoctor;
