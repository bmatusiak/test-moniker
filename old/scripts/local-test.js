const { tryRun } = require('./util');
const path = require('path');

async function main() {
    
    const workspace = process.cwd();

    //run jest unit tests
    console.log('Running Jest unit tests');
    if(tryRun('npx', ['jest', '--passWithNoTests','--detectOpenHandles'])) {
        console.log('Jest unit tests: PASSED');
    } else {
        throw new Error('Jest unit tests: FAILED');
    }

    //build andorid project
    const androidDir = path.join(workspace, 'example', 'android');
    const gradleCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

    //run android unit tests (c++ tests)
    console.log(`Running Android unit tests in ${androidDir}, command: ${gradleCmd} :expo-worker:runNativeTests --no-daemon --quiet`);
    if(tryRun(path.join(androidDir, gradleCmd), [':expo-worker:runNativeTests','--no-daemon','--quiet'], { cwd: androidDir })) {
        console.log('Android unit tests: PASSED');
    } else {    
        throw new Error('Android unit tests: FAILED');
    }

}

main().catch(e => { 
    console.error('Error:', e && e.message ? e.message : e);
    process.exit(e && e.status ? e.status : 1);
}) ;
