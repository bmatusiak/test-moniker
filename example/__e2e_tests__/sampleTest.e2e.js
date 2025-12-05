
import expoWorker from 'expo-worker';

module.exports = function sampleTest({describe, it}) {
    describe(sampleTest.name, () => {
        it('crash simulation', async({ log, assert }) => {
            log(`${sampleTest.name}: basic sanity check of try ketch`);
            try{
                expoWorker.simulateCrash();
                // expoWorker.simulateFatalCrash();
            }catch(e) {
                assert.ok(e.message.includes('Simulated Native Java/Kotlin Crash'), 'Caught simulated crash error');
            }
        });
        
        //this will crash the app hard - so it is disabled by default
        var enableFatalCrashTest = false;
        if(enableFatalCrashTest)
            it('crash fatal simulation', async({ log, assert }) => {
                log(`${sampleTest.name}: basic sanity check of try ketch`);
                try{
                    expoWorker.simulateCrash();
                // expoWorker.simulateFatalCrash();
                }catch(e) {
                    assert.ok(e.message.includes('Simulated Native Java/Kotlin Crash'), 'Caught simulated crash error');
                }
            });
    });
};


