/**
 * A failed test is retried once, and the first failure is still printed. About one full API run
 * in six used to fail a single, different test (seen 2026-11-24). One cause was found and fixed:
 * a route flow test passing Jest's 5-second default on a busy machine (jest.config.ts now allows
 * 20 seconds). See traxettle-app/docs/runbook/REGRESSION_SUITE.md §8. A real failure fails both
 * attempts.
 */
jest.retryTimes(1, { logErrorsBeforeRetry: true });
