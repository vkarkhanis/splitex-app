# Maestro flows (mobile end-to-end)

Part of the regression suite. Setup, running and conventions are in
[traxettle-app/docs/runbook/REGRESSION_SUITE.md §6](../../../../traxettle-app/docs/runbook/REGRESSION_SUITE.md#6-mobile-maestro).

## Layout

- `flows/<area>/*.yaml`: the flows. `flows/config.yaml` picks the flows and holds iOS settings; the runner always passes it with `--config`.
- `subflows/*.yaml`: shared steps that flows include with `runFlow`: `sign-up`, `sign-in`, `sign-out`, `after-sign-in` (PIN, Save Password, walkthrough), `create-split-event`, `invite`, `accept-invitation`, `open-event`, `add-expense`, `switch-to-pro` and `go-back`.
- `scripts/build-test-app.sh ios|android`: builds and installs the **Debug** test app. Its JavaScript comes from Metro and its defaults point at the local API. Never use a Release build: it falls back to the production API.
- `scripts/run-maestro.sh`: starts the Firebase emulators, the API and Metro. Then it runs `preflight.yaml` and stops unless the app reaches the local API. Then it cleans test data, runs the flows and cleans up. Use it through `rush test:regression:mobile`.
- `preflight.yaml`: the safety check. It tries to sign in as a made-up account, which changes nothing.
- `scripts/cleanup-firebase-maestro.js`: removes test users and data from the emulators.
- `screenshots/`: the App Store screenshot flow (`app-store.yaml`, its own `config.yaml` and `subflows/`). Not part of the regression run. Run it with `scripts/capture-screenshots.sh "<simulator>"`, which seeds demo data with `scripts/seed-screenshots.js` and turns landscape shots upright with `scripts/png-orientation.js`. See [REGRESSION_SUITE.md §6.1](../../../../traxettle-app/docs/runbook/REGRESSION_SUITE.md#61-app-store-screenshots).

## Quick start

```bash
bash apps/mobile/maestro/scripts/build-test-app.sh ios
```

```bash
rush test:regression:mobile
```

Options:
- **Pick a device:** `MAESTRO_DEVICE=<id>`.
- **Run only some folders:** `MAESTRO_FLOWS="pools settlement"`.
- **Keep screenshots and logs:** `MAESTRO_MODE=artifacts`. They go to `artifacts/`.
- **Use emulators and an API you started yourself:** `MAESTRO_USE_FIREBASE_EMULATOR=false` and `MAESTRO_MANAGE_API=false`.
