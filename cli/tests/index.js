import rectify from 'rectify';

import cliPlugin from '../cli.js';
import commandsPlugin from '../commands.js';
import configPlugin from '../config.js';
import deviePlugin from '../device.js';
import doctorPlugin from '../doctor.js';
import logPlugin from '../log.js';
import processPlugin from '../process.js';


(async function(){
        
    var config = [
        cliPlugin,
        commandsPlugin,
        configPlugin,
        deviePlugin,
        doctorPlugin,
        logPlugin,
        processPlugin
    ];

    var app = rectify.build(config);

    var main = await app.start();

    function testLib(){

        let failures = 0;
        let passes = 0;

        function assert(cond, msg) {
            if (!cond) {
                console.error('FAIL:', msg);
                failures++;
            } else {
                console.log('OK:  ', msg);
                passes++;
            }
        }

        return { assert, passes, failures };
    }

    // build tests here


})();