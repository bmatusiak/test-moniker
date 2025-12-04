**Moniker Example App**

- **Purpose:**: Demonstrates the `Moniker` component, how it is integrated into an Expo React Native app, and the example end-to-end test flow.

**Quick Start**

- **Start (single command):**

```
npm start
```

This runs the `start` script in [package.json](package.json) which runs `moniker -s`.

**What `npm start` does (code-path)**

- The project `package.json` maps `start` -> `moniker -s`.
- `moniker` is the local package in `moniker/` (see [moniker/index.js](moniker/index.js) and [moniker/moniker-cli.js](moniker/moniker-cli.js)).
- The CLI option `--start-dev-server` (`-s`) in `moniker-cli.js` executes this sequence:
  - `startMeroServer()` calls `npx expo start --dev-client` to start the Metro/dev-client server.
  - When Metro is ready, `buildAndInstall()` runs `npx expo run:android --no-bundler` to build and install the app on a connected device/emulator.
  - After install, `adbLogCat()` tails `adb logcat` filtered for the app package and common RN tags so JS logs are visible.
  - The CLI watches Metro output for the marker `TEST COMPLETE` to determine when tests have finished.

Files of interest:
- [package.json](package.json)
- [moniker/moniker-cli.js](moniker/moniker-cli.js)
- [moniker/index.js](moniker/index.js)
- [moniker/README.md](moniker/README.md)

**What Moniker is and does**

- **Moniker** (folder `moniker/`) is a small example module included in this workspace. It exports a view (`MonikerView`) and a tiny harness and test helper set.
- The package provides:
  - a React Native view component used by the example app (`moniker/MonikerView.js`),
  - a harness and CLI helpers to run a dev server, build/install the app, and tail logs (`moniker/harness.js`, `moniker/moniker-cli.js`, and `moniker/scripts/*`).
- The `moniker` CLI orchestrates starting Metro, building the native app, and capturing device logs to enable simple automated verification of tests.

**How e2e tests are performed**

- Example end-to-end (e2e) tests are located in `__e2e_tests__/` (e.g. `__e2e_tests__/sampleTest.e2e.js`). See that sample for the structure.
- Test modules export a function that receives a runner object (example uses `{ describe, it }`) and register tests using `describe(...)` / `it(...)`.
- The test in `sampleTest.e2e.js` demonstrates using the `expo-worker` API and asserts behaviour (it simulates a native crash and asserts a thrown error message).
- Runtime flow:
  - Metro serves the JS bundle for the dev client; when the app launches it runs the bundled app which imports the Moniker view and runs any test harness logic (the workspace’s app code wires tests into the running app).
  - The CLI tails `adb logcat` and watches Metro output; tests are expected to emit a line including `TEST COMPLETE` when finished. The CLI listens for that line to know tests completed.

  How to add a test

  - **Add a file:** Create a new test file under `__e2e_tests/` with the suffix `.e2e.js`, for example `__e2e_tests/MyNewTest.e2e.js`.
  - **Export the test function:** Each test module should export a function that receives a `runner` object (the example runner provides `{ describe, it }`) and register tests with `describe(...)` / `it(...)`.
  - **Restart Metro / start the CLI:** Start the dev server with `npm start` (or `npx expo start --dev-client`) so the app loads the test bundle. The app's test harness (see [index.js](index.js#L1)) wires the `__e2e_tests__` files into the running app.
  - **Finish marker:** Tests should write a log line containing `TEST COMPLETE` so the CLI knows when they finish.

  - **Register the test with the app:** Add your test to the `Moniker.tests` array in the app entry `index.js` so the running app loads it. For example:

  ```javascript
  // index.js
  import Moniker from 'moniker/MonikerView';

  Moniker.tests = [
    require('./__e2e_tests__/MyNewTest.e2e.js')
  ];

  registerRootComponent(Moniker);
  ```

  See [index.js](index.js#L1) for the actual project entry.

  Sample test skeleton

  ```javascript
  // __e2e_tests/MyNewTest.e2e.js
  module.exports = function MyNewTest(runner) {//must give test a name
    const { describe, it } = runner;

    describe('MyNewTest', () => {
      it('performs a simple check', async () => {
        // Put your test logic here. Use expo-worker or app APIs
        // to trigger behavior, then assert expectations.
        // Throw an Error to fail the test.
      });
    });
  };
  ```

  Tips

  - Keep tests lightweight and deterministic; the CLI watches logs to sequence steps.
  - Look at `__e2e_tests/sampleTest.e2e.js` for a working example.

**Running tests manually (more granular)**

- Start Metro/dev client only:

```bash
npx expo start --dev-client
```

- Build & install on Android (no bundler):

```bash
npx expo run:android --no-bundler
```

- Tail device logs (show app + RN JS logs):

```bash
adb logcat --regex "<your.app.package>|ReactNativeJS|ReactNative|RCTLog|Hermes"
```

Replace `<your.app.package>` with the Android package in `app.json`.

**Where tests are defined**

- See `__e2e_tests__/sampleTest.e2e.js` for the lightweight test format used by Moniker.

**Troubleshooting & notes**

- Metro output and adb logs are critical for debugging; the CLI already streams both.
- If the app crashes or restarts, inspect `adb logcat` for native stack traces and Metro output for JS errors.
- The CLI uses simple string markers (like `Waiting on http` and `TEST COMPLETE`) to sequence steps — adjust markers if you change logs or test harness behaviour.

**Next steps you might want**

- Add more tests to `__e2e_tests/` following the sample structure.
- Adjust `moniker/moniker-cli.js` filters or log markers for your environment.

---

Generated by developer tooling inspection. For code-level details see the files linked above.
