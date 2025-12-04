
import expoWorker from 'expo-worker';

module.exports = function sampleTest({describe, it}) {
    describe(sampleTest.name, () => {
        it('crash simulation', async({ log, assert }) => {
            log(`${sampleTest.name}: basic sanity check of try ketch`);
            try{
                expoWorker.simulateCrash();
            }catch(e) {
                assert.ok(e.message.includes('Simulated Native Crash'), 'Caught simulated crash error');
            }
        });
        
    });
};


