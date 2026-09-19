import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  enterRestaurant,
  exitRestaurant,
  leaveBuilding,
  purchaseOffering,
  startHavingCoffee,
  inspectCurrentLocation,
  transitionAgentLocation,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 14: COMPLETED PLAYER ACTIVITY (COFFEE COMPLETION) DEMO');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-milestone-14-coffee-history-demo.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// 1. World Bootstrap
console.log('=== STEP 1: Bootstrapping Version 10 development world at 08:00:00 UTC ===');
const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const persistenceA = new LocalFilePersistence(demoPath);
persistenceA.save(stateA);
const simA = new Simulation(clockA, stateA);

assert.equal(stateA.version, 13);
assert.equal(stateA.activityCompletions.length, 0);
console.log(`World ID:                 ${stateA.worldId}`);
console.log(`World Version:            ${stateA.version}`);
console.log(`World Time:               ${clockA.getTime()}`);
console.log(`Initial Activity Completions: ${stateA.activityCompletions.length}`);

// 2. Advance to open time
console.log('\n=== STEP 2: Advancing World Time to restaurant-open time (09:00:00 UTC) ===');
clockA.advance(60 * 60_000);
simA.tick();
const restaurantA = stateA.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
assert.equal(restaurantA.operationalState, 'open');
console.log(`Restaurant operational:   ${restaurantA.operationalState}`);

// 3. Move player inside restaurant
console.log('\n=== STEP 3: Moving player inside restaurant ===');
const enterResult = enterRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(enterResult.success, true);
const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
console.log(`Player Location:          ${playerA.locationId}`);

// 4. Purchase Coffee
console.log('\n=== STEP 4: Purchasing Coffee offering ===');
const purchaseResult = purchaseOffering(stateA, 'agent:dev-player', 'offering:development-coffee');
assert.equal(purchaseResult.success, true);
console.log(`Purchase Result:          ${purchaseResult.code}`);
console.log(`Purchases Log Length:     ${stateA.purchases.length}`);

// 5. Start Having Coffee #1
console.log('\n=== STEP 5: Starting Having Coffee #1 ===');
const startResult1 = startHavingCoffee(stateA, 'agent:dev-player', purchaseResult);
assert.equal(startResult1.success, true);
console.log(`Activity Started:         ${playerA.playerActivity?.activity}`);
console.log(`StartedAt:                ${playerA.playerActivity?.startedAt}`);
console.log(`Restaurant Association:   ${playerA.playerActivity?.restaurantId}`);
assert.equal(stateA.activityCompletions.length, 0);

// 6. Demonstrate Spatial Movement during active coffee (M10 integration)
console.log('\n=== STEP 6: Demonstrating spatial movement during active coffee ===');
const exitRes = exitRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(exitRes.success, true);
console.log(`Exited restaurant to:     ${playerA.locationId}`);

const leaveRes = leaveBuilding(stateA, 'agent:dev-player', 'building:development-building');
assert.equal(leaveRes.success, true);
console.log(`Left building to:         ${playerA.locationId}`);

// 7. Advance time to exact 15-minute boundary
console.log('\n=== STEP 7: Advancing 15 minutes to 09:15:00 UTC and executing tick ===');
clockA.advance(15 * 60_000);
simA.tick();

// 8. Verify Coffee #1 completion & CoffeeCompletionRecord
console.log('\n=== STEP 8: Verifying activity completion and historical record ===');
assert.equal(playerA.playerActivity?.completedAt, '2026-09-14T09:15:00.000Z');
assert.equal(stateA.activityCompletions.length, 1);

const record1 = stateA.activityCompletions[0];
console.log(`Record ID:                ${record1.id}`);
console.log(`Player ID:                ${record1.playerId}`);
console.log(`Restaurant ID:            ${record1.restaurantId}`);
console.log(`StartedAt:                ${record1.startedAt}`);
console.log(`CompletedAt:              ${record1.completedAt}`);
console.log(`Player Current Location:  ${playerA.locationId}`);

assert.equal(record1.id, 'activity-completion:1');
assert.equal(record1.playerId, 'agent:dev-player');
assert.equal(record1.restaurantId, 'restaurant:development-restaurant');
assert.equal(record1.startedAt, '2026-09-14T09:00:00.000Z');
assert.equal(record1.completedAt, '2026-09-14T09:15:00.000Z');
assert.equal(playerA.locationId, 'street:development-street');
assert.notEqual(record1.restaurantId, playerA.locationId);

// 9. Verify Idempotency on subsequent ticks
console.log('\n=== STEP 9: Verifying idempotency on subsequent ticks ===');
clockA.advance(60_000);
simA.tick();
clockA.advance(14 * 60_000);
simA.tick();
assert.equal(stateA.activityCompletions.length, 1);
console.log(`Total completions after subsequent ticks: ${stateA.activityCompletions.length} (zero duplicate records)`);

// 10. Verify M12 Perception Isolation
console.log('\n=== STEP 10: Verifying M12 inspectCurrentLocation() does NOT expose completion history ===');
const perception = inspectCurrentLocation(stateA, 'agent:dev-player');
assert.equal(perception.success, true);
assert.equal((perception as any).activityCompletions, undefined);
assert.equal((perception as any).coffeeCompletions, undefined);
assert.equal((perception as any).history, undefined);
console.log('Perception strictly isolated from historical facts.');

// 11. Persist Session A to disk
console.log('\n=== STEP 11: Persisting Session A state to disk and destroying Runtime A ===');
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted successfully.');

// 12. Fresh Session B Restore
console.log('\n=== STEP 12: Starting fresh Runtime Session B and restoring from disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
validateWorldState(stateB);
assert.equal(stateB.version, 13);
assert.equal(stateB.activityCompletions.length, 1);
console.log(`Restored World Version:   ${stateB.version}`);
console.log(`Restored Completions:     ${stateB.activityCompletions.length}`);
console.log(`Restored Record 1 ID:     ${stateB.activityCompletions[0].id}`);

// 13. Sequential Activity: Coffee #2 in Session B
console.log('\n=== STEP 13: Executing sequential Coffee #2 in Session B ===');
const clockB = WorldClock.create(stateB.worldTime);
const simB = new Simulation(clockB, stateB);

// Move back to restaurant
transitionAgentLocation(stateB, 'agent:dev-player', 'building:development-building');
enterRestaurant(stateB, 'agent:dev-player', 'restaurant:development-restaurant');

// Purchase Coffee #2
const purchaseResult2 = purchaseOffering(stateB, 'agent:dev-player', 'offering:development-coffee');
assert.equal(purchaseResult2.success, true);

// Start Coffee #2 at current world time (09:30:00 UTC)
const startResult2 = startHavingCoffee(stateB, 'agent:dev-player', purchaseResult2);
assert.equal(startResult2.success, true);

// Advance 15 minutes to 09:45:00 UTC
clockB.advance(15 * 60_000);
simB.tick();

// 14. Verify Coffee #2 completed with monotonic ID
console.log('\n=== STEP 14: Verifying Coffee #2 recorded with monotonic continuation ===');
assert.equal(stateB.activityCompletions.length, 2);
const record2 = stateB.activityCompletions[1];
console.log(`Record 2 ID:              ${record2.id}`);
console.log(`Record 2 StartedAt:       ${record2.startedAt}`);
console.log(`Record 2 CompletedAt:     ${record2.completedAt}`);
assert.equal(record2.id, 'activity-completion:2');
assert.equal(record2.startedAt, '2026-09-14T09:30:00.000Z');
assert.equal(record2.completedAt, '2026-09-14T09:45:00.000Z');

// 15. Verify Historical Immutability
console.log('\n=== STEP 15: Verifying historical records remain immutable ===');
assert.equal(stateB.activityCompletions[0].id, 'activity-completion:1');
assert.equal(stateB.activityCompletions[0].completedAt, '2026-09-14T09:15:00.000Z');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 15 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
