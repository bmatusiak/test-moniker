module.exports = function MonikerTest({ describe, it }) {
    describe(MonikerTest.name, () => {
        it('harness basic sanity', async ({ log, assert }) => {
            log('init: basic sanity check (simulating work)');
            //delay to simulate work
            await new Promise(resolve => setTimeout(resolve, 1000));
            assert.ok(true, 'basic truthy check');
        });
    });
};

