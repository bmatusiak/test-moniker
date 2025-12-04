import { registerRootComponent } from 'expo';

import Moniker from 'test-moniker/MonikerView';

Moniker.tests = [
    require('./__e2e_tests__/sampleTest.e2e.js')
];

registerRootComponent(Moniker);