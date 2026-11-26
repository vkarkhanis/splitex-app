/**
 * One app version for both stores.
 *
 * app.json `expo.version` is the version both platforms ship; package.json `version` and
 * android/app/build.gradle `versionName` mirror it, and build.gradle also holds the Android
 * `versionCode`. release-versions.json records what each platform last shipped, so:
 *   - a platform never ships the same version twice (the patch number goes up), and
 *   - the second platform of a release ships the version the first one moved to.
 *
 * The store build scripts run `prepare` before building and `record` after a successful
 * build, so a failed build reuses its version on the next try. Run through scripts/version.sh.
 *
 *   status                       current version, what each platform last shipped, what's next
 *   prepare <ios|android>        pick this build's version and write it to the files
 *   record <ios|android> [build] note a finished store build (Android reads its versionCode)
 *   bump <patch|minor|major|x.y.z>  start a release by hand, e.g. `bump minor` for new features
 *
 * TRAXETTLE_MOBILE_DIR points it at another apps/mobile directory (used by the tests).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Platform = 'ios' | 'android';
type Shipped = { version: string; build: string | null };
type ReleaseRecord = { ios: Shipped | null; android: Shipped | null };
type BumpPart = 'patch' | 'minor' | 'major';

const MOBILE_DIR = process.env.TRAXETTLE_MOBILE_DIR || join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = join(MOBILE_DIR, 'app.json');
const PACKAGE_JSON = join(MOBILE_DIR, 'package.json');
const BUILD_GRADLE = join(MOBILE_DIR, 'android', 'app', 'build.gradle');
const RECORD_FILE = join(MOBILE_DIR, 'release-versions.json');
const FILES_TO_COMMIT = 'apps/mobile/app.json, package.json, android/app/build.gradle and release-versions.json';

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail(`"${version}" isn't a version like 1.2.3.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function maxVersion(versions: string[]): string {
  return versions.reduce((max, v) => (compareVersions(v, max) > 0 ? v : max));
}

function bumpVersion(version: string, part: BumpPart): string {
  const [major, minor, patch] = parseVersion(version);
  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function shippedVersions(record: ReleaseRecord): string[] {
  return [record.ios?.version, record.android?.version].filter((v): v is string => Boolean(v));
}

// ── Files ────────────────────────────────────────────────────────────────────

function readAppVersion(): string {
  const version = JSON.parse(readFileSync(APP_JSON, 'utf8'))?.expo?.version;
  if (typeof version !== 'string') fail(`${APP_JSON} has no expo.version.`);
  parseVersion(version);
  return version;
}

// Rewrites only the first "version" value (expo.version / the package version), keeping
// the rest of the file byte-for-byte.
function writeJsonVersion(file: string, expected: string, next: string): void {
  const text = readFileSync(file, 'utf8');
  const match = /("version"\s*:\s*")([^"]*)(")/.exec(text);
  if (!match || match[2] !== expected) {
    fail(`Expected the first "version" in ${file} to be "${expected}"; found "${match?.[2] ?? 'none'}".`);
  }
  writeFileSync(file, text.replace(match[0], `${match[1]}${next}${match[3]}`));
}

type Gradle = { versionCode: number; versionName: string };

function readGradle(): Gradle {
  const text = readFileSync(BUILD_GRADLE, 'utf8');
  const codes = [...text.matchAll(/^\s*versionCode\s+(\d+)\s*$/gm)];
  const names = [...text.matchAll(/^\s*versionName\s+"([^"]*)"\s*$/gm)];
  if (codes.length !== 1 || names.length !== 1) {
    fail(`Expected one versionCode and one versionName line in ${BUILD_GRADLE}.`);
  }
  return { versionCode: Number(codes[0][1]), versionName: names[0][1] };
}

function writeGradle(next: Gradle): void {
  const text = readFileSync(BUILD_GRADLE, 'utf8')
    .replace(/^(\s*versionCode\s+)\d+(\s*)$/m, `$1${next.versionCode}$2`)
    .replace(/^(\s*versionName\s+")[^"]*("\s*)$/m, `$1${next.versionName}$2`);
  writeFileSync(BUILD_GRADLE, text);
}

function readRecord(): ReleaseRecord {
  if (!existsSync(RECORD_FILE)) return { ios: null, android: null };
  const data = JSON.parse(readFileSync(RECORD_FILE, 'utf8'));
  return { ios: data.ios ?? null, android: data.android ?? null };
}

function writeRecord(record: ReleaseRecord): void {
  writeFileSync(RECORD_FILE, `${JSON.stringify(record, null, 2)}\n`);
}

/** Moves app.json, package.json and build.gradle's versionName together. */
function setVersion(next: string, versionCode?: number): void {
  const current = readAppVersion();
  if (next !== current) writeJsonVersion(APP_JSON, current, next);
  const pkgVersion = String(JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).version);
  if (pkgVersion !== next) writeJsonVersion(PACKAGE_JSON, pkgVersion, next);
  writeGradle({ versionCode: versionCode ?? readGradle().versionCode, versionName: next });
}

// ── Rules ────────────────────────────────────────────────────────────────────

/**
 * The newest version either platform is on; bumped (patch) only if this platform has
 * already shipped it. A build that failed before `record` gets the same version again.
 */
function planVersion(platform: Platform, current: string, record: ReleaseRecord): string {
  const target = maxVersion([current, ...shippedVersions(record)]);
  const last = record[platform]?.version;
  return last && compareVersions(last, target) >= 0 ? bumpVersion(target, 'patch') : target;
}

/** A new versionCode unless the one in build.gradle hasn't been shipped yet. */
function planVersionCode(gradleCode: number, record: ReleaseRecord): number {
  const shipped = Number(record.android?.build ?? 0);
  return gradleCode > shipped ? gradleCode : Math.max(gradleCode, shipped) + 1;
}

// ── Commands ─────────────────────────────────────────────────────────────────

function describeShipped(shipped: Shipped | null, buildLabel: string): string {
  if (!shipped) return 'nothing recorded';
  return shipped.build ? `${shipped.version} (${buildLabel} ${shipped.build})` : shipped.version;
}

function status(): void {
  const current = readAppVersion();
  const gradle = readGradle();
  const record = readRecord();
  console.log(`Version (app.json):        ${current}`);
  console.log(`Android (build.gradle):    ${gradle.versionName}, versionCode ${gradle.versionCode}`);
  console.log(`Last shipped on iOS:       ${describeShipped(record.ios, 'build')}`);
  console.log(`Last shipped on Android:   ${describeShipped(record.android, 'versionCode')}`);
  console.log(`Next TestFlight build:     ${planVersion('ios', current, record)}`);
  console.log(
    `Next Play build (.aab):    ${planVersion('android', current, record)}, ` +
      `versionCode ${planVersionCode(gradle.versionCode, record)}`,
  );
  if (gradle.versionName !== current) {
    console.log(`⚠️  build.gradle versionName differs from app.json; the next store build fixes it.`);
  }
}

function prepare(platform: Platform): void {
  const current = readAppVersion();
  const record = readRecord();
  const next = planVersion(platform, current, record);
  const versionCode = platform === 'android' ? planVersionCode(readGradle().versionCode, record) : undefined;
  setVersion(next, versionCode);

  const label = platform === 'ios' ? 'iOS' : 'Android';
  const last = record[platform]?.version;
  const why =
    next === current
      ? last
        ? `${label} last shipped ${last}`
        : `nothing recorded for ${label} yet`
      : `${label} already shipped ${current}`;
  const code = versionCode === undefined ? '' : `, versionCode ${versionCode}`;
  console.log(`✅ ${label} build version ${next}${code} (${next === current ? 'unchanged' : 'bumped'}: ${why})`);
}

function recordBuild(platform: Platform, build: string | undefined): void {
  const record = readRecord();
  const version = readAppVersion();
  const shippedBuild = platform === 'android' ? String(readGradle().versionCode) : build ?? null;
  record[platform] = { version, build: shippedBuild };
  writeRecord(record);
  console.log(`✅ Recorded ${platform === 'ios' ? 'iOS' : 'Android'} ${version}${shippedBuild ? ` (${shippedBuild})` : ''}.`);
  console.log(`   Commit ${FILES_TO_COMMIT} so your other Mac continues from here.`);
}

function bump(arg: string | undefined): void {
  if (!arg) fail('Usage: version.sh bump <patch|minor|major|x.y.z>');
  const current = readAppVersion();
  const record = readRecord();
  const base = maxVersion([current, ...shippedVersions(record)]);
  const next = arg === 'patch' || arg === 'minor' || arg === 'major' ? bumpVersion(base, arg) : arg;
  parseVersion(next);
  const newestShipped = shippedVersions(record).length ? maxVersion(shippedVersions(record)) : null;
  if (newestShipped && compareVersions(next, newestShipped) < 0) {
    fail(`${next} is lower than ${newestShipped}, which is already in a store.`);
  }
  setVersion(next);
  console.log(`✅ Version ${current} → ${next}. The next TestFlight and Play builds both use it.`);
}

function parsePlatform(arg: string | undefined): Platform {
  if (arg === 'ios' || arg === 'android') return arg;
  return fail(`Expected "ios" or "android", got "${arg ?? ''}".`);
}

const [command, arg1, arg2] = process.argv.slice(2);
switch (command) {
  case undefined:
  case 'status':
    status();
    break;
  case 'prepare':
    prepare(parsePlatform(arg1));
    break;
  case 'record':
    recordBuild(parsePlatform(arg1), arg2);
    break;
  case 'bump':
    bump(arg1);
    break;
  default:
    fail(`Unknown command "${command}". Use: status | prepare <ios|android> | record <ios|android> [build] | bump <patch|minor|major|x.y.z>`);
}
