import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { Simulation } from '../src/core/simulation.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-restaurant.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// 1. Boot at 08:00 UTC.
console.log('=== STEP 1: Bootstrapping initial runtime Session A at 08:00:00 UTC ===');
const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const persistenceA = new LocalFilePersistence(demoPath);
const simA = new Simulation(clockA, stateA);

// Record initial agent states to verify independence later
const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
const npcA = stateA.agents.find((a) => a.id === 'agent:dev-npc')!;
const initialPlayerLocation = playerA.locationId;
const initialPlayerActivity = playerA.activityState;
const initialPlayerSince = playerA.activitySince;
const initialNpcLocation = npcA.locationId;

// 2. Restaurant starts CLOSED.
console.log('\n=== STEP 2: Verifying initial restaurant operational state ===');
const restaurantA = stateA.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Restaurant initial state: ${restaurantA.operationalState} (operationalSince: ${restaurantA.operationalSince})`);
assert.equal(restaurantA.operationalState, 'closed');
assert.equal(restaurantA.operationalSince, '2026-09-14T08:00:00.000Z');

// 3. Advance WorldClock to 09:00 using advance().
console.log('\n=== STEP 3: Advancing WorldClock by 1 hour to 09:00:00 UTC ===');
clockA.advance(3600_000);
console.log(`World Time after advance: ${clockA.getTime()}`);

// 4. Execute Simulation.tick().
console.log('\n=== STEP 4: Executing Simulation.tick() at 09:00:00 UTC ===');
const tick4 = simA.tick();

// 5. Restaurant transitions CLOSED -> OPEN.
// 6. Confirm operationalSince = 09:00.
console.log('\n=== STEPS 5 & 6: Confirming CLOSED -> OPEN transition and operationalSince ===');
console.log(`Restaurant operational state: ${restaurantA.operationalState}`);
console.log(`Restaurant operationalSince:  ${restaurantA.operationalSince}`);
assert.equal(restaurantA.operationalState, 'open');
assert.equal(restaurantA.operationalSince, '2026-09-14T09:00:00.000Z');
assert.equal(tick4.restaurantTransitions[0].changed, true);

// 7. Advance to 10:00 and tick again.
console.log('\n=== STEP 7: Advancing to 10:00:00 UTC and executing second tick (testing idempotency) ===');
clockA.advance(3600_000);
const tick7 = simA.tick();

// 8. Confirm state remains OPEN and operationalSince remains 09:00.
console.log('\n=== STEP 8: Confirming state remains OPEN and operationalSince preserved at 09:00 ===');
console.log(`Restaurant operational state: ${restaurantA.operationalState}`);
console.log(`Restaurant operationalSince:  ${restaurantA.operationalSince}`);
assert.equal(restaurantA.operationalState, 'open');
assert.equal(restaurantA.operationalSince, '2026-09-14T09:00:00.000Z'); // Preserved!
assert.equal(tick7.restaurantTransitions[0].changed, false);

// 9. Persist and destroy runtime.
console.log('\n=== STEP 9: Persisting state and destroying runtime Session A ===');
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted to disk.');

// 10. Restore a fresh runtime.
console.log('\n=== STEP 10: Starting fresh runtime Session B and restoring from disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
assert.equal(stateB.version, 13);
const clockB = WorldClock.create(stateB.worldTime);
const simB = new Simulation(clockB, stateB);

// 11. Confirm OPEN + operationalSince were reconstructed exactly.
console.log('\n=== STEP 11: Confirming reconstructed OPEN and operationalSince ===');
const restaurantB = stateB.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Restored state: ${restaurantB.operationalState}`);
console.log(`Restored operationalSince: ${restaurantB.operationalSince}`);
assert.equal(restaurantB.operationalState, 'open');
assert.equal(restaurantB.operationalSince, '2026-09-14T09:00:00.000Z');

// 12. Advance to 17:00.
console.log('\n=== STEP 12: Advancing WorldClock to 17:00:00 UTC (7 hours) ===');
clockB.advance(7 * 3600_000);
console.log(`World Time after advance: ${clockB.getTime()}`);

// 13. Tick.
console.log('\n=== STEP 13: Executing Simulation.tick() at 17:00:00 UTC ===');
const tick13 = simB.tick();

// 14. Confirm OPEN -> CLOSED.
// 15. Confirm operationalSince = 17:00.
console.log('\n=== STEPS 14 & 15: Confirming OPEN -> CLOSED transition and operationalSince ===');
console.log(`Restaurant operational state: ${restaurantB.operationalState}`);
console.log(`Restaurant operationalSince:  ${restaurantB.operationalSince}`);
assert.equal(restaurantB.operationalState, 'closed');
assert.equal(restaurantB.operationalSince, '2026-09-14T17:00:00.000Z');
assert.equal(tick13.restaurantTransitions[0].changed, true);

// 16. Confirm Agent activity/location remained unchanged throughout.
console.log('\n=== STEP 16: Confirming Agent activity and spatial location remained unchanged ===');
const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
const npcB = stateB.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`Player location: ${playerB.locationId}, activity: ${playerB.activityState}`);
console.log(`NPC location:    ${npcB.locationId}`);
assert.equal(playerB.locationId, initialPlayerLocation);
assert.equal(playerB.activityState, initialPlayerActivity);
assert.equal(playerB.activitySince, initialPlayerSince);
assert.equal(npcB.locationId, 'street:avenida-juarez');

// 17. Persist again and reconstruct once more.
console.log('\n=== STEP 17: Persisting Session B and reconstructing in fresh Session C ===');
persistenceB.save(snapshotWorldState(clockB, stateB));

const persistenceC = new LocalFilePersistence(demoPath);
const stateC = persistenceC.load()!;
assert.ok(stateC !== null);
assert.equal(stateC.version, 13);
assert.equal(stateC.worldTime, '2026-09-14T17:00:00.000Z');

const restaurantC = stateC.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
assert.equal(restaurantC.operationalState, 'closed');
assert.equal(restaurantC.operationalSince, '2026-09-14T17:00:00.000Z');
assert.equal(restaurantC.buildingId, 'building:development-building');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\nAll 17 restaurant operational state, transition, persistence, and isolation checks passed successfully!');
