import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Runs scripts/version.mts the way the build scripts do, against a scratch copy of the files.
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'version.mts');
const canRunTypeScript = Boolean((process.features as { typescript?: unknown }).typescript);
const describeIfNodeRunsTs = canRunTypeScript ? describe : describe.skip;

const APP_JSON = `{
  "expo": {
    "name": "Traxettle",
    "version": "1.0.33",
    "plugins": [["some-plugin", { "version": "9.9.9" }]]
  }
}
`;
const PACKAGE_JSON = `{
  "name": "@traxettle/mobile",
  "version": "1.0.33",
  "dependencies": { "left-pad": "1.0.0" }
}
`;
const BUILD_GRADLE = `android {
    defaultConfig {
        applicationId 'com.traxettle.app'
        versionCode 34
        versionName "1.0.33"
    }
}
`;
const SHIPPED_1_0_33 = {
  ios: { version: '1.0.33', build: null },
  android: { version: '1.0.33', build: '34' },
};

describeIfNodeRunsTs('scripts/version.mts', () => {
  let dir: string;

  const setup = (record: object | null = SHIPPED_1_0_33) => {
    dir = mkdtempSync(join(tmpdir(), 'traxettle-version-'));
    mkdirSync(join(dir, 'android', 'app'), { recursive: true });
    writeFileSync(join(dir, 'app.json'), APP_JSON);
    writeFileSync(join(dir, 'package.json'), PACKAGE_JSON);
    writeFileSync(join(dir, 'android', 'app', 'build.gradle'), BUILD_GRADLE);
    if (record) writeFileSync(join(dir, 'release-versions.json'), JSON.stringify(record));
  };

  const run = (...args: string[]) =>
    execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, ...args], {
      env: { ...process.env, TRAXETTLE_MOBILE_DIR: dir },
      encoding: 'utf8',
      stdio: 'pipe',
    });

  const state = () => {
    const gradle = readFileSync(join(dir, 'android', 'app', 'build.gradle'), 'utf8');
    const recordPath = join(dir, 'release-versions.json');
    return {
      app: JSON.parse(readFileSync(join(dir, 'app.json'), 'utf8')).expo.version,
      pkg: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version,
      versionName: /versionName "([^"]*)"/.exec(gradle)?.[1],
      versionCode: Number(/versionCode (\d+)/.exec(gradle)?.[1]),
      record: existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null,
    };
  };

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ships one release on both platforms with the same version', () => {
    setup();

    run('prepare', 'ios');
    expect(state()).toMatchObject({ app: '1.0.34', pkg: '1.0.34', versionName: '1.0.34', versionCode: 34 });
    run('record', 'ios', '2610181530');

    run('prepare', 'android');
    expect(state()).toMatchObject({ app: '1.0.34', versionName: '1.0.34', versionCode: 35 });
    run('record', 'android');

    expect(state().record).toEqual({
      ios: { version: '1.0.34', build: '2610181530' },
      android: { version: '1.0.34', build: '35' },
    });
  });

  it('bumps the patch again when the same platform ships twice', () => {
    setup();
    run('prepare', 'ios');
    run('record', 'ios', '2610181530');

    run('prepare', 'ios');

    expect(state()).toMatchObject({ app: '1.0.35', pkg: '1.0.35', versionName: '1.0.35' });
  });

  it('reuses the version and versionCode when a build failed before it was recorded', () => {
    setup();
    run('prepare', 'android');
    run('prepare', 'android');

    expect(state()).toMatchObject({ app: '1.0.34', versionName: '1.0.34', versionCode: 35 });
    expect(state().record.android).toEqual({ version: '1.0.33', build: '34' });
  });

  it('lets a manual bump start a release that both platforms pick up', () => {
    setup();
    run('bump', 'minor');
    expect(state()).toMatchObject({ app: '1.1.0', pkg: '1.1.0', versionName: '1.1.0', versionCode: 34 });

    run('prepare', 'ios');
    expect(state().app).toBe('1.1.0');
    run('prepare', 'android');
    expect(state()).toMatchObject({ app: '1.1.0', versionCode: 35 });
  });

  it('refuses a version lower than one already in a store', () => {
    setup();

    expect(() => run('bump', '1.0.30')).toThrow(/lower than 1\.0\.33/);
    expect(state()).toMatchObject({ app: '1.0.33', pkg: '1.0.33', versionName: '1.0.33' });
  });

  it('changes only the version line in app.json and package.json', () => {
    setup();
    run('prepare', 'ios');

    expect(readFileSync(join(dir, 'app.json'), 'utf8')).toBe(
      APP_JSON.replace('"version": "1.0.33"', '"version": "1.0.34"'),
    );
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(
      PACKAGE_JSON.replace('"version": "1.0.33"', '"version": "1.0.34"'),
    );
  });

  it('keeps the current version when nothing has been recorded yet', () => {
    setup(null);
    run('prepare', 'ios');

    expect(state()).toMatchObject({ app: '1.0.33', versionName: '1.0.33' });
  });
});
