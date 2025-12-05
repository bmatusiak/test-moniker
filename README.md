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

Common flags
- `--workspace <path>` / `-w <path>`: override the auto-detected workspace root (accepts relative paths).
- `--print-workspace` / `-p`: demo flag that prints the resolved workspace to stdout.
- `--verbose` / `-V`: enable verbose output and logging.
- `--dry-run` / `-n`: show actions without executing them.
- `--ci`: CI-friendly mode (quiet console, writes logs, fail-fast behavior).
- `--json-log <path>` / `-j <path>`: write line-delimited JSON log entries to the given path (relative to workspace).
- `--force` / `-f`: bypass workspace validation (use with caution).

Environment
- When the CLI resolves a workspace it sets `TEST_MONIKER_WORKSPACE` in the process environment. Handlers also receive a `values.workspace` property.

Examples
- Print resolved workspace:

```bash
npx test-moniker --print-workspace
```

- Start metro + build on Android (dev flow):

```bash
npx test-moniker --start-dev-server
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
