/**
 * Expo config plugin for iOS Google Sign-In.
 *
 * During `expo prebuild` this plugin:
 *   1. Copies GoogleService-Info.plist from project root → ios/<project>/
 *   2. Adds GoogleService-Info.plist to Xcode project (Copy Bundle Resources)
 *   3. Reads REVERSED_CLIENT_ID from the plist and registers it as a URL scheme
 *   4. Adds `import GoogleSignIn` to AppDelegate.swift
 *   5. Patches AppDelegate.swift to call GIDSignIn.sharedInstance.handle(url)
 *
 * This ensures all iOS Google Sign-In requirements survive `expo prebuild --clean`.
 *
 * Usage in app.json:
 *   "plugins": ["./plugins/copy-google-service-plist"]
 */
const { withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TAG = '[google-signin-ios]';

// ── Helper: extract a <string> value for a <key> from a plist XML string ─────
function plistValue(xml, key) {
  const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`);
  const m = xml.match(re);
  return m ? m[1] : null;
}

// ── Step 1 & 2: copy plist + register URL scheme ────────────────────────────
function withGooglePlistCopyAndUrlScheme(config) {
  // First, use withInfoPlist to inject the URL scheme (safe, non-dangerous mod)
  config = withInfoPlist(config, (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const src = path.join(projectRoot, 'GoogleService-Info.plist');

    if (fs.existsSync(src)) {
      const xml = fs.readFileSync(src, 'utf8');
      const reversedClientId = plistValue(xml, 'REVERSED_CLIENT_ID');

      const clientId = plistValue(xml, 'CLIENT_ID');

      // GoogleSignIn SDK 7.x reads GIDClientID and GIDServerClientID from Info.plist
      if (clientId) {
        cfg.modResults.GIDClientID = clientId;
        console.log(`${TAG} GIDClientID: ${clientId.substring(0, 30)}…`);
      }

      // Extract web client ID from google-services.json for GIDServerClientID
      const gsPath = path.join(projectRoot, 'android', 'app', 'google-services.json');
      if (fs.existsSync(gsPath)) {
        try {
          const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
          for (const client of gs.client || []) {
            for (const oc of client.oauth_client || []) {
              if (oc.client_type === 3) {
                cfg.modResults.GIDServerClientID = oc.client_id;
                console.log(`${TAG} GIDServerClientID: ${oc.client_id.substring(0, 30)}…`);
                break;
              }
            }
          }
        } catch (e) {
          console.warn(`${TAG} Could not parse google-services.json for server client ID`);
        }
      }

      if (reversedClientId) {
        // Ensure CFBundleURLTypes exists
        if (!cfg.modResults.CFBundleURLTypes) {
          cfg.modResults.CFBundleURLTypes = [];
        }

        // Remove any existing Google Sign-In URL scheme entry (avoid duplicates)
        cfg.modResults.CFBundleURLTypes = cfg.modResults.CFBundleURLTypes.filter(
          (entry) => {
            const schemes = entry.CFBundleURLSchemes || [];
            return !schemes.some((s) => s.startsWith('com.googleusercontent.apps.'));
          }
        );

        // Add the correct reversed client ID
        cfg.modResults.CFBundleURLTypes.push({
          CFBundleURLSchemes: [reversedClientId],
        });

        console.log(`${TAG} URL scheme: ${reversedClientId}`);
      }
    }

    return cfg;
  });

  // Then, use withDangerousMod to physically copy the file
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const src = path.join(projectRoot, 'GoogleService-Info.plist');
      const iosProjectName = cfg.modRequest.projectName || 'Traxettle';
      const dst = path.join(projectRoot, 'ios', iosProjectName, 'GoogleService-Info.plist');

      if (fs.existsSync(src)) {
        const dstDir = path.dirname(dst);
        if (!fs.existsSync(dstDir)) {
          fs.mkdirSync(dstDir, { recursive: true });
        }
        fs.copyFileSync(src, dst);
        console.log(`${TAG} Copied GoogleService-Info.plist → ${dst}`);
      } else {
        console.warn(
          `${TAG} WARNING: GoogleService-Info.plist not found at ${src}\n` +
          `  Copy GoogleService-Info.plist.example → GoogleService-Info.plist and fill in your values.`
        );
      }

      return cfg;
    },
  ]);

  return config;
}

// ── Step 3 & 4: patch AppDelegate.swift + bridging header ───────────────────
function withGoogleSignInAppDelegate(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosProjectName = cfg.modRequest.projectName || 'Traxettle';
      const iosDir = path.join(projectRoot, 'ios', iosProjectName);

      // ── Add 'import GoogleSignIn' to AppDelegate.swift ──
      const appDelegate = path.join(iosDir, 'AppDelegate.swift');
      if (fs.existsSync(appDelegate)) {
        let content = fs.readFileSync(appDelegate, 'utf8');

        const swiftImport = 'import GoogleSignIn';
        if (!content.includes(swiftImport)) {
          // Insert after the last existing import line
          const lastImportIdx = content.lastIndexOf('\nimport ');
          if (lastImportIdx !== -1) {
            const endOfLine = content.indexOf('\n', lastImportIdx + 1);
            content = content.slice(0, endOfLine) + '\n' + swiftImport + content.slice(endOfLine);
          } else {
            content = swiftImport + '\n' + content;
          }
          fs.writeFileSync(appDelegate, content);
          console.log(`${TAG} Added 'import GoogleSignIn' to AppDelegate.swift`);
        }

        // ── Inject GIDSignIn.handle(url) into openURL handler ──
        const gidHandle = 'GIDSignIn.sharedInstance.handle(url)';

        if (!content.includes(gidHandle)) {
          // Find the open url method and inject GIDSignIn.handle before the return
          const openUrlPattern = /(open url: URL,[\s\S]*?\) -> Bool \{[\s\S]*?)(return )(.*)/;
          const match = content.match(openUrlPattern);
          if (match) {
            const returnExpr = match[3];
            const newReturn = `return ${gidHandle} || ${returnExpr}`;
            content = content.replace(
              match[0],
              match[1] + newReturn
            );
            fs.writeFileSync(appDelegate, content);
            console.log(`${TAG} Patched AppDelegate.swift with GIDSignIn.handle(url)`);
          } else {
            console.warn(`${TAG} Could not find openURL method in AppDelegate.swift — manual patch needed`);
          }
        }
      }

      return cfg;
    },
  ]);
}

// ── Step 5: add plist to Xcode project (Copy Bundle Resources) ──────────────
// Uses withXcodeProject to inject the plist into the Xcode project in-memory.
// Expo-generated projects lack a "Resources" PBXGroup, which causes the xcode
// library's addResourceFile → correctForResourcesPath → pbxGroupByName('Resources')
// to return null and crash. We create the group first if it doesn't exist.
function withGooglePlistXcodeProject(config) {
  return withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults;
    const fileName = 'GoogleService-Info.plist';
    const iosProjectName = cfg.modRequest.projectName || 'Traxettle';

    // Check if already added
    const hasFile = proj.pbxItemByComment(fileName, 'PBXFileReference');
    if (hasFile) {
      console.log(`${TAG} ${fileName} already in Xcode project`);
      return cfg;
    }

    // Ensure a "Resources" PBXGroup exists — Expo doesn't create one by default,
    // and the xcode library's addResourceFile crashes without it.
    if (!proj.pbxGroupByName('Resources')) {
      proj.addPbxGroup([], 'Resources', 'Resources');
    }

    const firstTarget = proj.getFirstTarget();
    const opts = firstTarget ? { target: firstTarget.uuid } : {};
    proj.addResourceFile(
      path.join(iosProjectName, fileName),
      opts
    );
    console.log(`${TAG} Added ${fileName} to Xcode project (Copy Bundle Resources)`);

    return cfg;
  });
}

// ── Compose all mods ────────────────────────────────────────────────────────
function withGoogleServicePlist(config) {
  config = withGooglePlistCopyAndUrlScheme(config);
  config = withGooglePlistXcodeProject(config);
  config = withGoogleSignInAppDelegate(config);
  return config;
}

module.exports = withGoogleServicePlist;
