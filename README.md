# Moniker

Moniker is a compact example module in this workspace providing a small React Native view, a test harness, and developer helpers.

Contents
- `MonikerView` component and example tests.
- `harness.js` for quick manual verification.
- `scripts/` contains helper scripts used by the CLI.

Quick usage
- Import and render `MonikerView` in your app. Use the included `__e2e_tests__` for example tests.

Using the CLI
- This package provides the `test-moniker` CLI. From the project root you can run it with `npx test-moniker`.

Commands
- `doctor`: Run environment and health diagnostics (checks adb, java, SDK, installed package versions and device state).
- `--start-dev-server` / `-s`: Start the metro development server and optionally run the Android build flow.


Common flags
- `--workspace <path>` / `-w <path>`: override the auto-detected workspace root (accepts relative paths).
- `--print-workspace` / `-p`: print the resolved workspace available to handlers.
- `--config <path>`: path to a moniker config file (relative to workspace).
- `--init-config`: create a default `moniker.config.js` in the current working directory.
- `--ci`: CI-friendly mode (quiet console, writes logs, fail-fast behavior).
- `--force` / `-f`: bypass workspace validation (use with caution).
- `--dry-run` / `-n`: show actions without executing them.
- `--verbose` / `-V`: enable verbose output and logging.
- `--json`, `--json-log`, `-j`: output JSON/logging from commands (line-delimited when used).
- `--log`: enable textual log output to the default moniker log file (created under the workspace `logs/` folder).
- `--silent`: reduce console output (write logs instead of printing to console).
- `--capture-bugreport-on-crash`: automatically capture an adb bugreport when a crash is detected.

Logging and JSON output
- `--log`: enable textual log output to the default moniker log file (created under the workspace `logs/` folder). The CLI will print the path when logs are saved.
- `--silent`: reduce console output; prefer writing logs instead of printing to stdout.
- `--json`, `--json-log`, `-j` : enable line-delimited JSON log entries. If a path is provided it will be used; otherwise JSON output will be emitted to stdout.

Tip: run `npx test-moniker --help` to view the full, current list of available flags and commands.

Pre-run flags
- The CLI supports marking handlers as pre-run flags using the handler chain method `.flags({ pre: true })`.
- Pre-run flagged handlers run before normal actions; use this to set up global runtime state, load configs, or instantiate loggers that other actions rely on.
- Example: `cli('--json-log').flags({pre:true}).do(() => { /* enable json logging before actions */ })`

Environment
- When the CLI resolves a workspace it sets `TEST_MONIKER_WORKSPACE` in the process environment. Handlers also receive a `values.workspace` property.

Examples
- Print resolved workspace:

```bash
npx test-moniker --print-workspace
```

- Create a default config in the current working directory:

```bash
npx test-moniker --init-config
```

- Start metro + build on Android (dev flow):

```bash
npx test-moniker --start-dev-server
```

- Start metro and capture bugreports automatically when a crash is detected:

```bash
npx test-moniker --start-dev-server --capture-bugreport-on-crash
```

- CI run writing JSON logs:

```bash
npx test-moniker --ci --json-log logs/moniker.json --start-dev-server
```

Best practices
- Prefer running `npx test-moniker` directly rather than binding to `npm start` so the CLI can be used from other workspaces and CI.
- Use `--workspace` when invoking from nested directories or from automation to ensure the correct project root is used.
- Use `--json-log` in CI to capture machine-readable logs.

Notes for contributors
- The CLI auto-detects the workspace by walking parent directories looking for `app.json` or `package.json`. The resolved workspace is injectable into handlers and exported on `process.env.TEST_MONIKER_WORKSPACE`.
- The CLI tracks spawned child processes (metro, build, adb logcat) and performs graceful shutdown on SIGINT/SIGTERM.

License
- See the repository root for licensing information.
