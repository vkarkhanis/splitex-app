import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  maxWorkers: 1,
  // The route flow tests make dozens of requests each; on a busy machine 5 s (the default) isn't
  // always enough.
  testTimeout: 20000,
  // A test that times out can leave a request open, which keeps Jest from exiting and would hang the
  // regression runner and CI. Exit once the tests are done.
  forceExit: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/__tests__/'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  }
};

export default config;
