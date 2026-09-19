import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  exitRestaurant,
  leaveBuilding,
  transitionAgentLocation,
  validateWorldState,
  snapshotWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 10: LEAVING & SPATIAL MOVEMENT DEMONSTRATION');
console.log('================================================================');

const demoPath = join(tmpdir(), 'mvc-demo-m10-spatial-movement.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// 1. Bootstrap world at 08:00:00 UTC
console.log('\n=== STEP 1: Bootstrapping Version 10 development world at 08:00:00 UTC ===');
const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
const stateA = createInitialWorldState(clockA);
validateWorldState(stateA);
assert.equal(stateA.version, 13);
console.log(`World ID:      ${stateA.worldId}`);
console.log(`World Version: ${stateA.version}`);
console.log(`World Time:    ${stateA.worldTime}`);

// 2. Advance logical time to restaurant-open time (09:00:00 UTC) and tick simulation
console.log('\n=== STEP 2: Advancing World Time to restaurant-open time (09:00:00 UTC) ===');
clockA.advance(60 * 60_000);
const simA = new Simulation(clockA, stateA);
simA.tick();
const restaurantA = stateA.restaurants.find(
  (r) => r.id === 'restaurant:development-restaurant'
)!;
assert.equal(restaurantA.operationalState, 'open');
console.log(`Current World Time: ${clockA.getTime()}`);
console.log(`Restaurant ID:      ${restaurantA.id}`);
console.log(`OperationalState:   ${restaurantA.operationalState}`);

// 3. Player enters restaurant
console.log('\n=== STEP 3: Moving player inside open restaurant ===');
const enterResult = enterRestaurant(
  stateA,
  'agent:dev-player',
  'restaurant:development-restaurant'
);
assert.equal(enterResult.success, true);
assert.equal(enterResult.code, 'success');
const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
assert.equal(playerA.locationId, 'restaurant:development-restaurant');
console.log(`Player Location: ${playerA.locationId}`);

// 4. Player purchases Coffee
console.log('\n=== STEP 4: Purchasing Coffee offering ===');
const purchaseReceipt = purchaseOffering(
  stateA,
  'agent:dev-player',
  'offering:development-coffee'
);
assert.equal(purchaseReceipt.success, true);
assert.equal(purchaseReceipt.code, 'success');
console.log(`Purchase Code: ${purchaseReceipt.code}`);
console.log(`Player Balance After: ${playerA.balanceMinor} USD minor units`);
console.log(`Restaurant Balance After: ${restaurantA.balanceMinor} USD minor units`);

// 5. Player starts Having Coffee with purchase receipt
console.log('\n=== STEP 5: Explicitly starting "Having Coffee" with purchase receipt ===');
const startResult = startHavingCoffee(stateA, 'agent:dev-player', purchaseReceipt);
assert.equal(startResult.success, true);
assert.equal(startResult.code, 'success');
assert.ok(playerA.playerActivity);
assert.equal(playerA.playerActivity.activity, 'having-coffee');
assert.equal(playerA.playerActivity.startedAt, '2026-09-14T09:00:00.000Z');
assert.equal(playerA.playerActivity.completedAt, null);
console.log(`Activity Started: ${playerA.playerActivity.activity} at ${playerA.playerActivity.startedAt}`);

// 6. Advance logical time by 15 world minutes to 09:15:00 UTC
console.log('\n=== STEP 6: Advancing World Time by 15 minutes to 09:15:00 UTC ===');
clockA.advance(15 * 60_000);
console.log(`World Time Advanced to: ${clockA.getTime()}`);

// 7. Tick simulation
console.log('\n=== STEP 7: Executing simulation tick ===');
const tickResult = simA.tick();
assert.equal(tickResult.playerActivityTransitions?.length, 1);

// 8. Verify coffee completed
console.log('\n=== STEP 8: Verifying coffee activity is completed ===');
assert.equal(playerA.playerActivity.completedAt, '2026-09-14T09:15:00.000Z');
console.log(`Activity Status: completed at ${playerA.playerActivity.completedAt}`);

// Record baseline state before spatial transitions
const timeBeforeSpatial = clockA.getTime();
const playerBalanceBefore = playerA.balanceMinor;
const restaurantBalanceBefore = restaurantA.balanceMinor;
const restaurantOperationalBefore = restaurantA.operationalState;
const npcLocationBefore = stateA.agents.find((a) => a.id === 'agent:dev-npc')!.locationId;

// 9. Exit restaurant via exitRestaurant()
console.log('\n=== STEP 9: Player exits restaurant via exitRestaurant() ===');
const exitResult = exitRestaurant(
  stateA,
  'agent:dev-player',
  'restaurant:development-restaurant'
);
assert.equal(exitResult.success, true);
assert.equal(exitResult.code, 'success');
assert.equal(exitResult.buildingId, 'building:development-building');

// 10. Verify player is inside containing Building
console.log('\n=== STEP 10: Verifying player returned to containing Building ===');
assert.equal(playerA.locationId, 'building:development-building');
console.log(`Player Location: ${playerA.locationId}`);

// 11. Leave Building via leaveBuilding()
console.log('\n=== STEP 11: Player leaves building via leaveBuilding() ===');
const leaveResult = leaveBuilding(
  stateA,
  'agent:dev-player',
  'building:development-building'
);
assert.equal(leaveResult.success, true);
assert.equal(leaveResult.code, 'success');
assert.equal(leaveResult.streetId, 'street:development-street');

// 12. Verify player is at containing Street
console.log('\n=== STEP 12: Verifying player reached containing Street ===');
assert.equal(playerA.locationId, 'street:development-street');
console.log(`Player Location: ${playerA.locationId}`);

// 13. Move player to another valid Place using existing primitive
console.log('\n=== STEP 13: Moving player to Neighborhood via transitionAgentLocation() ===');
/**
 * NOTE: transitionAgentLocation() is exercised strictly as the existing low-level
 * spatial state transition primitive, NOT as a pathfinding, routing, or geographic-connectivity system.
 */
transitionAgentLocation(
  stateA,
  'agent:dev-player',
  'neighborhood:development-neighborhood'
);

// 14. Verify final location
console.log('\n=== STEP 14: Verifying final player location ===');
assert.equal(playerA.locationId, 'neighborhood:development-neighborhood');
console.log(`Final Player Location: ${playerA.locationId}`);

// 15. Verify world time did not change during spatial transitions
console.log('\n=== STEP 15: Verifying world time did not change during spatial transitions ===');
assert.equal(clockA.getTime(), timeBeforeSpatial);
assert.equal(stateA.worldTime, timeBeforeSpatial);
console.log(`World Time before transitions: ${timeBeforeSpatial}`);
console.log(`World Time after transitions:  ${clockA.getTime()} (identical - zero travel time)`);

// 16. Verify unrelated state remained unchanged
console.log('\n=== STEP 16: Verifying unrelated state remained unchanged ===');
assert.equal(playerA.balanceMinor, playerBalanceBefore);
assert.equal(restaurantA.balanceMinor, restaurantBalanceBefore);
assert.equal(restaurantA.operationalState, restaurantOperationalBefore);
assert.equal(stateA.agents.find((a) => a.id === 'agent:dev-npc')!.locationId, npcLocationBefore);
assert.equal(playerA.playerActivity.activity, 'having-coffee');
assert.equal(playerA.playerActivity.completedAt, '2026-09-14T09:15:00.000Z');
console.log(`Player Balance:            ${playerA.balanceMinor} USD minor units (unchanged)`);
console.log(`Restaurant Balance:        ${restaurantA.balanceMinor} USD minor units (unchanged)`);
console.log(`Restaurant Operational:    ${restaurantA.operationalState} (unchanged)`);
console.log(`NPC Location:              ${npcLocationBefore} (unchanged)`);
console.log(`Completed Activity State:  ${playerA.playerActivity.activity} @ ${playerA.playerActivity.completedAt} (unchanged)`);

// 17. Persist world
console.log('\n=== STEP 17: Persisting world state to disk and destroying Runtime A ===');
const persistenceA = new LocalFilePersistence(demoPath);
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted successfully.');

// 18. Restore world in fresh runtime
console.log('\n=== STEP 18: Starting fresh Runtime B and restoring world from disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
validateWorldState(stateB);
assert.equal(stateB.version, 13);
console.log(`Restored World Version: ${stateB.version}`);
console.log(`Restored World Time:    ${stateB.worldTime}`);

// 19. Verify spatial state survived persistence
console.log('\n=== STEP 19: Verifying reconstructed spatial state across runtimes ===');
const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
assert.equal(playerB.locationId, 'neighborhood:development-neighborhood');
assert.equal(playerB.balanceMinor, 1500);
assert.equal(playerB.playerActivity?.activity, 'having-coffee');
assert.equal(playerB.playerActivity?.completedAt, '2026-09-14T09:15:00.000Z');
console.log(`Restored Player Location: ${playerB.locationId}`);
console.log(`Restored Player Balance:  ${playerB.balanceMinor} USD minor units`);
console.log(`Restored Activity:        ${playerB.playerActivity?.activity} (completed: ${playerB.playerActivity?.completedAt})`);

// Cleanup
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 19 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
