import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  transitionAgentLocation,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { Simulation } from '../src/core/simulation.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-spatial.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('=== STEP 1: Bootstrapping initial runtime Session A at 08:00:00 UTC ===');
const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const persistenceA = new LocalFilePersistence(demoPath);

const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
const npcA = stateA.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`Player initial location: ${playerA.locationId}`);
console.log(`NPC initial location:    ${npcA.locationId}`);
assert.equal(playerA.locationId, 'building:development-building');
assert.equal(npcA.locationId, 'building:development-residence');
assert.equal(stateA.version, 15);

console.log('\n=== STEP 2: Persisting Session A state and destroying Runtime A ===');
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted successfully.');

console.log('\n=== STEP 3: Starting fresh Runtime Session B and restoring from disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
assert.equal(stateB.version, 15);
const clockB = WorldClock.create(stateB.worldTime);

const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
const npcB = stateB.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`Restored Player location: ${playerB.locationId}`);
console.log(`Restored NPC location:    ${npcB.locationId}`);
assert.equal(playerB.locationId, 'building:development-building');
assert.equal(npcB.locationId, 'building:development-residence');

console.log('\n=== STEP 4: Advance World Clock and run simulation tick (verifying canonical NPC routine and player isolation) ===');
const simB = new Simulation(clockB, stateB, { silent: true });
clockB.advance(3600_000); // 1 hour -> 09:00:00 UTC (active window)
console.log(`World Time advanced to: ${clockB.getTime()}`);
const tickResult = simB.tick();
console.log(`Simulation tick executed. NPC activity transitioned to: ${npcB.activityState}`);
assert.equal(npcB.activityState, 'active');
assert.equal(tickResult.transitions[0].changed, true);
// Verify canonical NPC routine transition and player location isolation
console.log(`Player location after tick: ${playerB.locationId}`);
console.log(`NPC location after tick:    ${npcB.locationId}`);
assert.equal(playerB.locationId, 'building:development-building');
assert.equal(npcB.locationId, 'restaurant:development-restaurant');

console.log('\n=== STEP 5: Authoritatively transition NPC to Street ===');
const clockTimeBeforeTransition = clockB.getTime();
const npcActivityBeforeTransition = npcB.activityState;
const npcSinceBeforeTransition = npcB.activitySince;

transitionAgentLocation(stateB, 'agent:dev-npc', 'street:development-street');
console.log(`NPC transitioned to: ${npcB.locationId}`);
assert.equal(npcB.locationId, 'street:development-street');

console.log('\n=== STEP 6: Verify clock time and activityState remain strictly unchanged by spatial transition ===');
console.log(`Clock time before: ${clockTimeBeforeTransition}, after: ${clockB.getTime()}`);
console.log(`Activity state before: ${npcActivityBeforeTransition}, after: ${npcB.activityState}`);
console.log(`Activity since before: ${npcSinceBeforeTransition}, after: ${npcB.activitySince}`);
assert.equal(clockB.getTime(), clockTimeBeforeTransition);
assert.equal(npcB.activityState, npcActivityBeforeTransition);
assert.equal(npcB.activitySince, npcSinceBeforeTransition);

console.log('\n=== STEP 7: Persisting Session B state and destroying Runtime B ===');
persistenceB.save(snapshotWorldState(clockB, stateB));
console.log('Session B persisted successfully.');

console.log('\n=== STEP 8: Starting fresh Runtime Session C and restoring from disk ===');
const persistenceC = new LocalFilePersistence(demoPath);
const stateC = persistenceC.load()!;
assert.ok(stateC !== null);
assert.equal(stateC.version, 15);
assert.equal(stateC.worldTime, '2026-09-14T09:00:00.000Z');

console.log('\n=== STEP 9: Verifying reconstructed spatial presence across runtimes ===');
const playerC = stateC.agents.find((a) => a.id === 'agent:dev-player')!;
const npcC = stateC.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`Final Player location: ${playerC.locationId}`);
console.log(`Final NPC location:    ${npcC.locationId}`);
assert.equal(playerC.locationId, 'building:development-building');
assert.equal(npcC.locationId, 'street:development-street');
assert.equal(npcC.activityState, 'active');
assert.equal(npcC.activitySince, '2026-09-14T09:00:00.000Z');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\nAll spatial presence, transition, immutability, and reconstruction checks passed successfully!');
