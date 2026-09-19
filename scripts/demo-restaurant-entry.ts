import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  enterRestaurant,
  transitionAgentLocation,
  validateWorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { Simulation } from '../src/core/simulation.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-restaurant-entry.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('================================================================');
console.log('MILESTONE 6: FIRST AGENT–WORLD INTERACTION DEMONSTRATION');
console.log('================================================================\n');

// 1. Bootstrap at 09:00 UTC (open window).
console.log('=== STEP 1: Bootstrapping initial runtime Session A at 09:00:00 UTC (open window) ===');
const clockA = WorldClock.create('2026-09-14T09:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const persistenceA = new LocalFilePersistence(demoPath);
const simA = new Simulation(clockA, stateA);
console.log(`World Time: ${clockA.getTime()}`);

// 2. Verify restaurant is open.
console.log('\n=== STEP 2: Verifying restaurant is OPEN ===');
const restaurantA = stateA.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Restaurant ID:    ${restaurantA.id}`);
console.log(`Restaurant State: ${restaurantA.operationalState} (operationalSince: ${restaurantA.operationalSince})`);
assert.equal(restaurantA.operationalState, 'open');

// 3. Verify player starts at building:development-building.
console.log('\n=== STEP 3: Verifying player initial location ===');
const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
console.log(`Player ID:       ${playerA.id}`);
console.log(`Player Location: ${playerA.locationId}`);
assert.equal(playerA.locationId, 'building:development-building');
assert.equal(playerA.locationId, restaurantA.buildingId);

// 4. Player requests entry.
console.log('\n=== STEP 4: Player requests entry into restaurant ===');
const entry1 = enterRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');

// 5. Validate successful transition.
console.log('\n=== STEP 5: Validating successful transition result ===');
console.log(`Result: success=${entry1.success}, code="${entry1.code}", message="${entry1.message}"`);
assert.equal(entry1.success, true);
assert.equal(entry1.code, 'success');

// 6. Show location changed to restaurant:development-restaurant.
console.log('\n=== STEP 6: Confirming player location changed ===');
console.log(`Player Location after entry: ${playerA.locationId}`);
assert.equal(playerA.locationId, 'restaurant:development-restaurant');

// 7. Attempt entry again -> show already-inside no-op.
console.log('\n=== STEP 7: Attempting entry again (already inside idempotency test) ===');
const entry2 = enterRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
console.log(`Result: success=${entry2.success}, code="${entry2.code}", message="${entry2.message}"`);
assert.equal(entry2.success, false);
assert.equal(entry2.code, 'already-inside');
assert.equal(playerA.locationId, 'restaurant:development-restaurant');

// 8. Close restaurant by advancing clock to 17:00 and ticking.
console.log('\n=== STEP 8: Advancing WorldClock to 17:00:00 UTC and executing Simulation.tick() ===');
clockA.advance(8 * 3600_000); // 09:00 -> 17:00
console.log(`World Time after advance: ${clockA.getTime()}`);
const tick8 = simA.tick();
console.log(`Restaurant State after tick: ${restaurantA.operationalState} (operationalSince: ${restaurantA.operationalSince})`);
assert.equal(restaurantA.operationalState, 'closed');
assert.equal(tick8.restaurantTransitions[0].changed, true);

// 9. Move player back to building via transitionAgentLocation.
console.log('\n=== STEP 9: Moving player back to building via transitionAgentLocation() ===');
transitionAgentLocation(stateA, 'agent:dev-player', 'building:development-building');
console.log(`Player Location: ${playerA.locationId}`);
assert.equal(playerA.locationId, 'building:development-building');

// 10. Attempt entry while closed -> show restaurant-closed.
console.log('\n=== STEP 10: Attempting entry while restaurant is CLOSED ===');
const entry3 = enterRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
console.log(`Result: success=${entry3.success}, code="${entry3.code}", message="${entry3.message}"`);
assert.equal(entry3.success, false);
assert.equal(entry3.code, 'restaurant-closed');

// 11. Prove player remains at building.
console.log('\n=== STEP 11: Proving player remains at building (zero mutation on failure) ===');
console.log(`Player Location: ${playerA.locationId}`);
assert.equal(playerA.locationId, 'building:development-building');

// 12. Move player in during open state, persist, destroy runtime.
console.log('\n=== STEP 12: Advancing to next day 09:00:00 UTC, entering restaurant, persisting, and destroying runtime ===');
clockA.advance(16 * 3600_000); // 17:00 -> 09:00 next day
console.log(`World Time: ${clockA.getTime()}`);
simA.tick();
assert.equal(restaurantA.operationalState, 'open');

const entry4 = enterRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(entry4.success, true);
assert.equal(playerA.locationId, 'restaurant:development-restaurant');

persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted to disk. Destroying Session A runtime...');

// 13. Restore and verify player remains inside restaurant.
console.log('\n=== STEP 13: Starting fresh runtime Session B and restoring from persistence ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
validateWorldState(stateB);
assert.equal(stateB.version, 13);

const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
const restaurantB = stateB.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Session B Restored World Time:        ${stateB.worldTime}`);
console.log(`Session B Restored Restaurant State:  ${restaurantB.operationalState}`);
console.log(`Session B Restored Player Location:   ${playerB.locationId}`);

assert.equal(restaurantB.operationalState, 'open');
assert.equal(playerB.locationId, 'restaurant:development-restaurant');

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 13 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================');

// Clean up temporary file
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}
