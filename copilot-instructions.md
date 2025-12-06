# test-moniker — Basic Usage

Purpose
- Quick reference for installing and using test-moniker as an npm package and wiring local e2e tests into MonikerView.
- Currently `test-moniker` is android only

Install
```bash
# add as a dev dependency
npm install --save-dev test-moniker
# or
yarn add --dev test-moniker
```

Run CLI
```bash
# run via npx (uses local install if available)
npx test-moniker --help
```

Embed MonikerView in your app
```javascript
// CommonJS
const { MonikerView } = require('test-moniker');
// or ESModule
import { MonikerView } from 'test-moniker';
```

Include local E2E tests
- Place tests in your app repo under `__e2e_tests__`/ (e.g. `__e2e_tests__`/myTest.js).
- Pass tests into the component or attach to MonikerView before render.

Examples:
```javascript
// index.js (attach before render)
const { MonikerView } = require('test-moniker');
const MyE2ETest = require('../__e2e_tests__/myTest');
MonikerView.tests = (MonikerView.tests || []).concat([ MyE2ETest ]);
```

```jsx
// In a screen: pass via props
import { MonikerView } from 'test-moniker';
import MyE2ETest from '../__e2e_tests__/myTest';
<MonikerView tests={[ MyE2ETest ]} />
```

Minimal test file shape
```javascript
// __e2e_tests__/myTest.js
module.exports = function myTest({describe, it}) {//function name serves as test name
    describe(myTest.name, () => {
        it('harness basic sanity', async({ log, assert }) => {
            log('init: basic sanity check (simulating work)');
            //delay to simulate work
            await new Promise(resolve => setTimeout(resolve, 1000));
            assert.ok(true, 'basic truthy check');
        });
    });
};
```

Start dev server — usage example
```bash
# start Metro via the CLI (uses current project workspace)
npx test-moniker --start-dev-server

# expected behavior: starts `Metro Server`, `Builds+Installs` app, `Captures log` with `adb logcat`,  stops when `TEST COMPLETE`  is emitted from metra log
```
Capture bugreport on crash
- What it does: when enabled, Moniker runs adb bugreport for the device that experienced a crash and saves the resulting artifact alongside Moniker logs.
- Enable via CLI:
```bash
# start dev server and enable automatic bugreport capture on crash
npx test-moniker --start-dev-server --capture-bugreport-on-crash
```
- Expected artifact: moniker-bugreport-<timestamp>-<device-serial>.zip (saved next to Moniker logs in the working directory or logs folder).
- Logs location:
  - Default output directory: current working directory (workspace root) or a ./logs subfolder created for the run.
  - Typical files produced:
    - moniker-log-<timestamp>.txt — primary session log
    - moniker-logs.txt — consolidated quick log
    - moniker-bugreport-<timestamp>-<device-serial>.zip — captured bugreport
  - The CLI prints the exact paths used for that run; check stdout/stderr for the final artifact locations.
- Notes:
  - Requires adb and a connected device/emulator with appropriate permissions.
  - Bugreports can be large; enable selectively in CI to avoid excessive artifact size.

Help output
```bash
$ npx test-moniker --help
Usage: test-moniker [options]

Options:
        --version,-v,version            Show the version number
        --workspace,-w                  Override workspace path
        --print-workspace,-p            Print the resolved workspace available to handlers
        --config                        Path to moniker config file (relative to workspace)
        --init-config                   Create a default moniker.config.js in the current working directory
        --ci                            Run in CI mode (quiet, write logs, fail-fast)
        --force,-f                      Force actions even if workspace validation fails
        --dry-run,-n                    Show actions without executing
        --verbose,-V                    Enable verbose output
        --json,--json-log,-j            Output JSON from commands
        --log                           Log Output to moniker-log-1765012455763.txt
        --silent                        Log Output to moniker-logs.txt
        --verbose,-V                    Enable verbose output
        --capture-bugreport-on-crash            Automatically capture adb bugreport when a crash is detected
        doctor                          Run environment and health diagnostics
        --start-dev-server,-s           Start the metro development server
        completion,--completion,--generate-completion           Generate shell completion script for bash/zsh/fish
        --help,-h,help                  Show help information
```


Doctor output
```bash
npx test-moniker doctor

Moniker Doctor Results:
- globals: {"CI_MODE":false,"FORCE":false,"DRY_RUN":false,"VERBOSE":false}
- workspace: < path/to/folder >
- adb: ok
- java: ok
- android_sdk:  < path/to/folder >
- avds: ["dev"]
- metro_port_8081: free
- expo_port_19000: free
- adb_devices: [{"serial":"DEADBEEF","status":"device"}]
- adb_device_props: [{"serial":"DEADBEEF","model":"SM-S136DL","manufacturer":"samsung","sdk":"33","abi":"armeabi-v7a","status":"device"}]
- adb_app_installed: [{"serial":"DEADBEEF","installed":true}]
- emulator_pids: []
- expo_cli: 54.0.17
- installed_expo_version: 54.0.26
- installed_react_native_version: 0.82.1
- installed_react_version: 19.2.1
- workspace_gradlew: true
- node_version: v24.11.0
- platform: linux
- arch: x64
- cpus: 4
- total_mem: 25120505856
- free_mem: 15014006784
- workspace_has_package_json: true
- workspace_has_app_json: true
- app_package: < app.package.id >
```
That's all — install, run via npx, import MonikerView, and wire local `__e2e_tests__` into the component.

Agent Checklists 
- when a user says 'check moniker' run code below
    ```bash
    npx test-moniker doctor
    ```

- when a user says 'build and test' run code below
    ```bash
    npx test-moniker -s
    ```
    * if fatal crash detected, add `--capture-bugreport-on-crash` to the command, to capture bug report on next run.

    