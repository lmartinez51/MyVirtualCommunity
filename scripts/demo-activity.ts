import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  validateWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 9: TIME-BOUND PLAYER ACTIVITY (HAVING COFFEE) DEMO');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-milestone-9-activity-demo.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// 1. World created
console.log('=== STEP 1: Bootstrapping Version 10 development world ===');
const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const persistenceA = new LocalFilePersistence(demoPath);

assert.equal(stateA.version, 15);
console.log(`World ID:      ${stateA.worldId}`);
console.log(`World Version: ${stateA.version}`);
console.log(`World Time:    ${clockA.getTime()}`);

// 2. Advance to restaurant open time (09:00:00 UTC)
console.log('\n=== STEP 2: Advancing World Time to restaurant-open time (09:00:00 UTC) ===');
clockA.advance(3600_000);
const simA = new Simulation(clockA, stateA);
simA.tick();
console.log(`Current World Time: ${clockA.getTime()}`);

// 3. Confirm restaurant is open
console.log('\n=== STEP 3: Confirming restaurant operational state ===');
const restaurantA = stateA.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Restaurant ID:    ${restaurantA.id}`);
console.log(`OperationalState: ${restaurantA.operationalState}`);
assert.equal(restaurantA.operationalState, 'open');

// 4. Confirm player location and enter restaurant
console.log('\n=== STEP 4: Moving player inside open restaurant ===');
const enterResult = enterRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(enterResult.success, true);
const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
console.log(`Player Location: ${playerA.locationId}`);
assert.equal(playerA.locationId, 'restaurant:development-restaurant');

// 5. Purchase Coffee
console.log('\n=== STEP 5: Purchasing Coffee offering ===');
const purchaseReceipt = purchaseOffering(
  stateA,
  'agent:dev-player',
  'offering:development-coffee'
);
assert.equal(purchaseReceipt.success, true);
console.log(`Purchase Code: ${purchaseReceipt.code}`);
console.log(`Player Balance After: ${purchaseReceipt.playerBalanceAfter} USD minor units`);

// 6. Confirm purchase success and receipt
console.log('\n=== STEP 6: Confirming purchase receipt ===');
assert.equal(purchaseReceipt.playerId, 'agent:dev-player');
assert.equal(purchaseReceipt.offeringId, 'offering:development-coffee');
console.log(`Receipt verified: player=${purchaseReceipt.playerId} offering=${purchaseReceipt.offeringId}`);

// 7. Demonstrate failed start without purchase receipt
console.log('\n=== STEP 7: Testing rejection when starting without receipt ===');
const failedStart = startHavingCoffee(stateA, 'agent:dev-player', undefined as unknown as PurchaseOfferingResult);
assert.equal(failedStart.success, false);
assert.equal(failedStart.code, 'purchase-required');
console.log(`Rejected as expected: code=${failedStart.code} message="${failedStart.message}"`);

// 8. Explicitly start "Having Coffee" with valid receipt
console.log('\n=== STEP 8: Explicitly starting "Having Coffee" with valid receipt ===');
const startResult = startHavingCoffee(stateA, 'agent:dev-player', purchaseReceipt);
assert.equal(startResult.success, true);
assert.equal(startResult.code, 'success');
console.log(`Activity started: ${startResult.activity} at ${startResult.startedAt}`);

// 9. Show activity start time and verify active state
console.log('\n=== STEP 9: Verifying initial active activity state ===');
assert.ok(playerA.playerActivity);
assert.equal(playerA.playerActivity.activity, 'having-coffee');
assert.equal(playerA.playerActivity.startedAt, '2026-09-14T09:00:00.000Z');
assert.equal(playerA.playerActivity.completedAt, null);
console.log(`Activity:    ${playerA.playerActivity.activity}`);
console.log(`StartedAt:   ${playerA.playerActivity.startedAt}`);
console.log(`CompletedAt: ${playerA.playerActivity.completedAt} (active)`);

// 10. Attempt duplicate start while active
console.log('\n=== STEP 10: Testing duplicate start rejection while active ===');
const dupStart = startHavingCoffee(stateA, 'agent:dev-player', purchaseReceipt);
assert.equal(dupStart.success, false);
assert.equal(dupStart.code, 'activity-already-active');
console.log(`Duplicate start rejected: code=${dupStart.code}`);

// 11. Advance 5 world minutes to 09:05:00 UTC and tick
console.log('\n=== STEP 11: Advancing 5 world minutes and ticking simulation ===');
clockA.advance(5 * 60_000);
simA.tick();
console.log(`World Time:  ${clockA.getTime()}`);
console.log(`CompletedAt: ${playerA.playerActivity.completedAt} (still active)`);
assert.equal(playerA.playerActivity.completedAt, null);

// 12. Advance to 09:14:59 UTC (boundary test - 1 second before completion)
console.log('\n=== STEP 12: Advancing to 09:14:59 UTC (1s before 15m boundary) ===');
clockA.advance(9 * 60_000 + 59_000);
simA.tick();
console.log(`World Time:  ${clockA.getTime()}`);
console.log(`CompletedAt: ${playerA.playerActivity.completedAt} (still active at boundary - 1s)`);
assert.equal(playerA.playerActivity.completedAt, null);

// 13. Advance 1 second to 09:15:00 UTC (exact 15m completion boundary)
console.log('\n=== STEP 13: Advancing 1s to exact 15m boundary (09:15:00 UTC) and ticking ===');
clockA.advance(1000);
const tick13 = simA.tick();
console.log(`World Time:  ${clockA.getTime()}`);
console.log(`CompletedAt: ${playerA.playerActivity.completedAt}`);
assert.equal(playerA.playerActivity.completedAt, '2026-09-14T09:15:00.000Z');
assert.equal(tick13.playerActivityTransitions?.length, 1);

// 14. Subsequent tick at 09:16:00 UTC to verify idempotency
console.log('\n=== STEP 14: Verifying idempotency of completed state on subsequent tick ===');
clockA.advance(60_000);
const tick14 = simA.tick();
assert.equal(tick14.playerActivityTransitions?.length ?? 0, 0);
assert.equal(playerA.playerActivity.completedAt, '2026-09-14T09:15:00.000Z');
console.log(`Idempotency verified: no redundant transitions emitted.`);

// 15. Persist Session A
console.log('\n=== STEP 15: Persisting completed state and destroying Session A runtime ===');
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted successfully.');

// 16. Reconstruct in Session B
console.log('\n=== STEP 16: Starting fresh runtime Session B and restoring from disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
validateWorldState(stateB);
assert.equal(stateB.version, 15);
console.log(`Session B Restored World Version: ${stateB.version}`);
console.log(`Session B Restored World Time:    ${stateB.worldTime}`);

// 17. Verify completed activity survives reconstruction
console.log('\n=== STEP 17: Verifying completed activity survived reconstruction ===');
const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
assert.ok(playerB.playerActivity);
assert.equal(playerB.playerActivity.activity, 'having-coffee');
assert.equal(playerB.playerActivity.startedAt, '2026-09-14T09:00:00.000Z');
assert.equal(playerB.playerActivity.completedAt, '2026-09-14T09:15:00.000Z');
console.log(`Restored Activity:    ${playerB.playerActivity.activity}`);
console.log(`Restored StartedAt:   ${playerB.playerActivity.startedAt}`);
console.log(`Restored CompletedAt: ${playerB.playerActivity.completedAt}`);

// 18. Demonstrate active-state offline persistence with late discovery
console.log('\n=== STEP 18: Demonstrating active-state offline persistence & late discovery ===');
const clockC = WorldClock.create('2026-09-14T10:00:00.000Z');
const stateC = createInitialWorldState(clockC);
enterRestaurant(stateC, 'agent:dev-player', 'restaurant:development-restaurant');
const receiptC = purchaseOffering(stateC, 'agent:dev-player', 'offering:development-coffee');
startHavingCoffee(stateC, 'agent:dev-player', receiptC);

// Persist while active (completedAt === null)
const persistenceC = new LocalFilePersistence(demoPath);
persistenceC.save(snapshotWorldState(clockC, stateC));
console.log(`Session C started coffee at 10:00:00 UTC and persisted active state.`);

// Session D restores from disk
const persistenceD = new LocalFilePersistence(demoPath);
const stateD = persistenceD.load()!;
assert.ok(stateD !== null);
validateWorldState(stateD);

const playerD = stateD.agents.find((a) => a.id === 'agent:dev-player')!;
assert.equal(playerD.playerActivity?.completedAt, null, 'must be active upon restoration');
console.log(`Session D restored active state at 10:00:00 UTC.`);

// Advance logical World Time by 25 minutes to 10:25:00 UTC (late discovery)
const clockD = WorldClock.create(stateD.worldTime);
clockD.advance(25 * 60_000);
console.log(`Advancing World Time directly to ${clockD.getTime()} (10 minutes past 10:15 boundary)`);

const simD = new Simulation(clockD, stateD);
const tickD = simD.tick();

console.log(`World Time after tick: ${clockD.getTime()}`);
console.log(`Recorded CompletedAt:  ${playerD.playerActivity?.completedAt}`);

assert.equal(clockD.getTime(), '2026-09-14T10:25:00.000Z', 'clock remains 10:25:00');
assert.equal(
  playerD.playerActivity?.completedAt,
  '2026-09-14T10:15:00.000Z',
  'completedAt must be exact 10:15:00 boundary, NOT discovery time 10:25:00'
);
assert.equal(tickD.playerActivityTransitions?.[0].completedAt, '2026-09-14T10:15:00.000Z');
console.log('Late discovery verified: recorded theoretical 10:15:00 boundary accurately.');

// Cleanup
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 18 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
