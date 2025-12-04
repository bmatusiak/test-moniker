# Moniker

Moniker is a small example module included in the example-moniker-app workspace. It contains a React Native view, a test file and a few development helper scripts intended to demonstrate how the component integrates into the app and how it can be tested locally.

**Contents**
- [moniker/MonikerView.js](moniker/MonikerView.js) — main React Native component to render the Moniker UI.
- [moniker/MonikerTest.js](moniker/MonikerTest.js) — a sample test or example usage for the view.
- [moniker/harness.js](moniker/harness.js) — small harness used for standalone testing or quick manual runs.
- [moniker/index.js](moniker/index.js) — package entrypoint.
- [moniker/scripts/](moniker/scripts/) — helper scripts (e.g. `expo-dev.js`, `local-test.js`).

**Quick Usage**

Import and render `MonikerView` and adding tests for main view.

```js
import { registerRootComponent } from 'expo';

import Moniker from 'moniker/MonikerView';

Moniker.tests = [
    require('./__e2e_tests__/sampleTest.e2e.js')
];

registerRootComponent(Moniker);
```

Import and render `MonikerView` and adding tests as component view.

```js

import Moniker from 'moniker/MonikerView';

Moniker.tests = [
    require('./__e2e_tests__/sampleTest.e2e.js')
];

export default function App(){
    return (<Moniker />);
}

```

**Development**

- See the helper scripts in [moniker/scripts](moniker/scripts/) for local/dev helpers. They are lightweight utilities to run or debug the component.
- Use the app-level tooling (`npm run android`, `npm run ios`, `expo start`, etc.) to run the full application that consumes `MonikerView`.
- For quick manual checks, `moniker/harness.js` can be used as a starting point for standalone runs or snapshots.

**Notes & Contribution**

- This folder is intentionally small and focused on demonstration and integration. If you modify the component, consider adding or updating `MonikerTest.js` and any helper scripts.
- Open a pull request in the workspace repo for changes; keep exports in [moniker/index.js](moniker/index.js) stable for consumers.

**License**

See the repository root for licensing information.
