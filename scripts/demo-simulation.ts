import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { createInitialWorldState, snapshotWorldState } from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { Simulation } from '../src/core/simulation.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-simulation.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('=== STEP 1: Bootstrapping initial runtime at 08:00:00 UTC (Inactive Window) ===');
const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const persistenceA = new LocalFilePersistence(demoPath);
const simA = new Simulation(clockA, stateA);

const npcA = stateA.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`NPC initial activity: ${npcA.activityState} (activitySince: ${npcA.activitySince})`);
assert.equal(npcA.activityState, 'idle');

console.log('\n=== STEP 2: Advancing World Clock by 1 hour to 09:00:00 UTC (Entering Active Window) ===');
clockA.advance(3600_000);
console.log(`World Time after advance: ${clockA.getTime()}`);

console.log('\n=== STEP 3: Executing Simulation Tick ===');
const tickA = simA.tick();
assert.equal(npcA.activityState, 'active');
assert.equal(npcA.activitySince, '2026-09-14T09:00:00.000Z');
assert.equal(tickA.transitions[0].changed, true);

console.log('\n=== STEP 4: Executing Second Tick at 09:15:00 UTC (Testing Idempotency) ===');
clockA.advance(15 * 60_000);
simA.tick();
assert.equal(npcA.activityState, 'active');
assert.equal(npcA.activitySince, '2026-09-14T09:00:00.000Z'); // Preserved!

console.log('\n=== STEP 5: Persisting World State and Destroying Runtime A ===');
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Saved to persistence file.');

console.log('\n=== STEP 6: Starting Fresh Runtime B and Restoring World State from Disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
const clockB = WorldClock.create(stateB.worldTime);
const simB = new Simulation(clockB, stateB);

const npcB = stateB.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`Restored NPC activity: ${npcB.activityState} (activitySince: ${npcB.activitySince})`);
assert.equal(npcB.activityState, 'active');
assert.equal(npcB.activitySince, '2026-09-14T09:00:00.000Z');

console.log('\n=== STEP 7: Advancing World Clock by 7h 45m to 17:00:00 UTC (Exiting Active Window) ===');
clockB.advance(7 * 3600_000 + 45 * 60_000);
console.log(`World Time after advance: ${clockB.getTime()}`);

console.log('\n=== STEP 8: Executing Simulation Tick in Runtime B ===');
const tickB = simB.tick();
assert.equal(npcB.activityState, 'idle');
assert.equal(npcB.activitySince, '2026-09-14T17:00:00.000Z');
assert.equal(tickB.transitions[0].changed, true);

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\nAll simulation and offline reconstruction demonstration checks passed successfully.');
