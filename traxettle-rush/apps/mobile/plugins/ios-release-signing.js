/**
 * Expo config plugin: sign iOS store builds with a manual App Store profile.
 *
 * Xcode's automatic signing archives with a development profile first, and a development
 * profile needs a registered iPhone or iPad. App Store profiles don't, so a team without a
 * device signs with one. When build-ios.sh sets IOS_PROVISIONING_PROFILE (the profile's name),
 * the app target's Release configuration gets:
 *   CODE_SIGN_STYLE = Manual, PROVISIONING_PROFILE_SPECIFIER = <name>,
 *   CODE_SIGN_IDENTITY = IOS_SIGNING_IDENTITY (default "Apple Distribution"),
 *   DEVELOPMENT_TEAM = APPLE_TEAM_ID.
 * Only the app target changes: CocoaPods targets (e.g. resource bundles) can't take a profile.
 * Without IOS_PROVISIONING_PROFILE the project keeps automatic signing.
 *
 * Usage in app.json:
 *   "plugins": ["./plugins/ios-release-signing"]
 */
const { withXcodeProject } = require('expo/config-plugins');

const TAG = '[ios-release-signing]';

// pbxproj values with spaces or brackets must be quoted.
function quote(value) {
  return `"${String(value).replace(/(["\\])/g, '\\$1')}"`;
}

function withIosReleaseSigning(config) {
  const profile = process.env.IOS_PROVISIONING_PROFILE;
  if (!profile) return config;
  const identity = process.env.IOS_SIGNING_IDENTITY || 'Apple Distribution';
  const team = process.env.APPLE_TEAM_ID;

  return withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults;
    const appTarget = proj.getFirstTarget();
    if (!appTarget || !String(appTarget.firstTarget.productType).includes('com.apple.product-type.application')) {
      throw new Error(`${TAG} The first target in the Xcode project isn't the app; can't set its signing.`);
    }

    const configList = proj.pbxXCConfigurationList()[appTarget.firstTarget.buildConfigurationList];
    const buildConfigs = proj.pbxXCBuildConfigurationSection();
    const release = configList.buildConfigurations
      .map(({ value }) => buildConfigs[value])
      .find((buildConfig) => buildConfig && buildConfig.name === 'Release');
    if (!release) throw new Error(`${TAG} The app target has no Release configuration.`);

    Object.assign(release.buildSettings, {
      CODE_SIGN_STYLE: 'Manual',
      PROVISIONING_PROFILE_SPECIFIER: quote(profile),
      CODE_SIGN_IDENTITY: quote(identity),
      [quote('CODE_SIGN_IDENTITY[sdk=iphoneos*]')]: quote(identity),
      ...(team ? { DEVELOPMENT_TEAM: team } : {}),
    });
    console.log(`${TAG} Release signs with profile "${profile}" and "${identity}".`);
    return cfg;
  });
}

module.exports = withIosReleaseSigning;
