import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { bootstrapWorld } from '../src/core/bootstrap.js';
import { snapshotWorldState } from '../src/core/world-state.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-persistence.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('--- Step 1-3: Bootstrapping initial world without persistence ---');
const run1 = bootstrapWorld({ persistencePath: demoPath });
const t0 = run1.clock.getTime();
console.log(`Observed initial World Time T0: ${t0}`);
assert.equal(run1.state.places.length, 8);
assert.equal(run1.state.restaurants.length, 1);
assert.equal(run1.state.agents.length, 2);

console.log('\n--- Step 4-5: Explicitly advancing World Clock by 5 seconds and persisting ---');
run1.clock.advance(5000);
const t0Plus5 = run1.clock.getTime();
console.log(`Advanced World Time: ${t0Plus5}`);
run1.persistence.save(snapshotWorldState(run1.clock, run1.state));
console.log('Saved state to persistence.');

console.log('\n--- Step 6-8: Restarting fresh runtime and restoring World State ---');
const run2 = bootstrapWorld({ persistencePath: demoPath });
const restored1 = run2.clock.getTime();
console.log(`Restored World Time: ${restored1}`);
if (restored1 !== t0Plus5) {
  throw new Error(`Verification failed! Expected ${t0Plus5}, got ${restored1}`);
}
assert.deepEqual(run2.state.places, run1.state.places);
assert.deepEqual(run2.state.restaurants, run1.state.restaurants);
assert.deepEqual(run2.state.agents, run1.state.agents);
console.log('Verified: T0 + 5s and all entity collections restored identically without duplication.');

console.log('\n--- Step 9-10: Advancing another 5 seconds and persisting ---');
run2.clock.advance(5000);
const t0Plus10 = run2.clock.getTime();
console.log(`Advanced World Time: ${t0Plus10}`);
run2.persistence.save(snapshotWorldState(run2.clock, run2.state));
console.log('Saved state to persistence.');

console.log('\n--- Step 11: Restarting 3rd fresh runtime and verifying T0 + 10s ---');
const run3 = bootstrapWorld({ persistencePath: demoPath });
const restored2 = run3.clock.getTime();
console.log(`Restored World Time: ${restored2}`);
if (restored2 !== t0Plus10) {
  throw new Error(`Verification failed! Expected ${t0Plus10}, got ${restored2}`);
}
assert.deepEqual(run3.state.places, run1.state.places);
assert.deepEqual(run3.state.restaurants, run1.state.restaurants);
assert.deepEqual(run3.state.agents, run1.state.agents);
console.log('Verified: T0 + 10s and all entities restored identically across multiple restarts.');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}
console.log('\nAll multi-run persistence verification steps completed successfully.');
