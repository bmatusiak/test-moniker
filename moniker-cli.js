#!/usr/bin/env node
const cli = require('./cli_lib.js');
const { longRun , tryRun } = require('./scripts/util.js');
cli.description = 'Moniker CLI - A tool for running moniker';


const workspace = process.cwd();

const Log = {};
Log.path = 'logs/moniker-log-' + Date.now() + '.txt';
Log.data = [];
Log.append = function() {
    if(!Log.enabled) return;
    var fs = require('fs');
    var path = require('path');
    // check if directory exists
    var dir = path.dirname(workspace + '/' + Log.path);
    if(!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(workspace + '/' + Log.path, Array.from(arguments).join('') + '\n', 'utf8');
};
Log.enabled = false;

cli('--log')
    .info('Log Output to moniker-log-' + Date.now() + '.txt')
    .do((values) => {
        Log.path = typeof values.log === 'string' ? values.log : Log.path;
        Log.enabled = true;
    });

cli('--silent')
    .info('Log Output to moniker-logs.txt')
    .do(() => {
        Log.silent = true;
    });

cli('--start-dev-server','-s','start-dev-server')
    .info('Start the metro development server')
    .do(() => {
        let metro, logcat;
        tryRun('fuser', ['-k', '8081/tcp']);//kill any process using metro port
        metro = startMeroServer(() => {
            buildAndInstall(false, false, () => {
                logcat = adbLogCat(() => {
                    metro.stop();
                },false,()=> {  
                    //build failed
                    metro.stop();
                });
            });
        }, () => {
            //save logs
            if(Log.enabled)
                console.log('Logs saved to ' + Log.path);
            process.exit(0);//exit when metro stops
        }, () => {
            logcat.stop();
        }, (error) => {
            console.log('Metro server error:', error);
            logcat.stop();
            metro.stop();
        });


    });


// Only auto-run when executed directly
if (typeof require !== 'undefined' && require.main === module) {
    const ok = cli.run();
    if(!ok) {
        console.log('No actions run.');
    }
}

// export the cli function for requiring
module.exports = cli;

function startMeroServer(ready, close, done, error) {
    const devServer = longRun('npx',['expo','start', '--dev-client'],{ cwd: workspace, stdio: 'pipe' });
    devServer.stdout.on('data', (data) => {
        if(data.toString().includes('Waiting on http')) {
            if(ready) ready();
        }
        if(data.toString().includes('TEST COMPLETE')) {
            if(done) done();
        }
        if(data.toString().includes('TEST COMPLETE')) {
            if(done) done();
        }
        if(data.toString().includes('ERROR  SyntaxError')) {
            if(error) error(data.toString());
        }
    });
    
    devServer.stdout.on('data', (data) => {
        const chunk = data.toString();
        devServer._lineBuf = (devServer._lineBuf || '') + chunk;
        const lines = devServer._lineBuf.split(/\r?\n/);
        devServer._lineBuf = lines.pop();
        for (let i = 0; i < lines.length; i++) {
            const line = '[METRO] ' + lines[i];
            if(!Log.silent)
                process.stdout.write(line + '\n');
            Log.append(line);
        }
    });

    devServer.on('close', (code) => {
        if(close) close(code);
    });
    return devServer;
}


function buildAndInstall(ready, close, intalled, open, failed) {
    const buildInstall = longRun('npx',['expo','run:android', '--no-bundler'],{ cwd: workspace, stdio: 'pipe' });
    let installed = false;
    let opening = false;
    buildInstall.stdout.on('data', (data) => {
        if(data.toString().includes('Installing')) {
            installed = true;
            if(intalled) intalled();
        }
        if(data.toString().includes('Opening')) {
            opening = true;
            if(open) open();
        }
        if(data.toString().includes('BUILD FAILED')) {
            console.log('Build failed');
            if(failed) failed();
        }
    });
    
    // if (process.stdin.isTTY) process.stdin.setRawMode?.(true);
    // process.stdin.resume();

    // if (buildInstall.stdin) process.stdin.pipe(buildInstall.stdin);
    // if (buildInstall.stdout) buildInstall.stdout.pipe(process.stdout);
    // if (buildInstall.stderr) buildInstall.stderr.pipe(process.stderr);

    buildInstall.stdout.on('data', logger);
    buildInstall.stderr.on('data', logger);
    function logger(data){
        const chunk = data.toString();
        buildInstall._lineBuf = (buildInstall._lineBuf || '') + chunk;
        const lines = buildInstall._lineBuf.split(/\r?\n/);
        buildInstall._lineBuf = lines.pop();
        for (let i = 0; i < lines.length; i++) {
            const line = '[BUILD] ' + lines[i];
            if(!Log.silent)
                process.stdout.write(line + '\n');
            Log.append(line);
        }
    }

    buildInstall.on('close', (code) => {
        // console.log(`Builder exited with code ${code}`);
        if(close) close(code);
        if(ready) ready(installed && opening);
    });

    return buildInstall;
}

function adbLogCat(done) {
    var worksapceAppJSON = require(workspace + '/app.json');
    var appPckage = worksapceAppJSON.expo.android.package;
    // Listen for the app package, common React Native tags, and crash/runtime keywords
    let regexTags = [].concat(
        [appPckage],// app package name
        [ 'ReactNativeJS', 'ReactNative', 'RCTLog', 'Hermes'],// React Native common tags
        ['AndroidRuntime', 'FATAL EXCEPTION', 'SIGSEGV', 'SIGABRT', 'ANR', 'Fatal signal', 'native crash', 'crash'],// crash/runtime keywords
        [ 'moniker' ], // moniker tags
    );
    regexTags = regexTags.join('|');
    const logcat = longRun('adb', ['logcat', '--regex', regexTags], { stdio: 'pipe' });
   
    logcat.stdout.on('data', (data) => {
        const skipArray = [
            'SurfaceFlinger:',
            'BufferQueueProducer:',
            'BufferQueueConsumer:',
            'Choreographer:',
            'OpenGLRenderer:',
            'DisplayEventReceiver:',
            'ActivityManager:',
            'PowerManagerService:',
            'WindowManager:',
            'InputMethodManagerService:',
            'AudioFlinger:',
            'Gralloc4:',
            'Adreno-EGL:',
            'Adreno-ES20:',
            'Adreno-ES30:',
            'EGL_emulation:',
            'libEGL:',
            'libGLESv2:',
            'GLES2Decoder:',
            'OpenGLRenderer:',
            'SGM:GameManager'
        ];
        let skip = false;
        for(let i=0; i<skipArray.length; i++) {
            if(data.toString().includes(skipArray[i])) {
                skip = true;
                break;
            }
        }
        if(!skip)   {
            const chunk = data.toString();
            logcat._lineBuf = (logcat._lineBuf || '') + chunk;
            const lines = logcat._lineBuf.split(/\r?\n/);
            logcat._lineBuf = lines.pop();
            for (let i = 0; i < lines.length; i++) {
                const line = '[ADB] ' + lines[i];
                // if(!Log.silent)  process.stdout.write(line + '\n');
                Log.append(line);
            }
        }
    });

    logcat.on('close', (code) => {
        // console.log(`adb logcat exited with code ${code}`);
        if(done) done(code);
    });

    return logcat;
}
