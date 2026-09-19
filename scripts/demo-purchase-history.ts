import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  enterRestaurant,
  purchaseOffering,
  inspectCurrentLocation,
  validateWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 13: FIRST PERSISTENT HISTORICAL EVENT (COFFEE PURCHASE)');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-milestone-13-purchase-history-demo.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// === STEP 1: Bootstrap Version 10 World ===
console.log('=== STEP 1: Bootstrapping Version 10 development world at 08:00:00 UTC ===');
const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
const stateA = createInitialWorldState(clockA);
validateWorldState(stateA);
assert.equal(stateA.version, 13);
assert.equal(stateA.purchases.length, 0);

console.log(`World ID:         ${stateA.worldId}`);
console.log(`World Version:    ${stateA.version}`);
console.log(`World Time:       ${stateA.worldTime}`);
console.log(`Initial Purchases:${stateA.purchases.length}`);

// === STEP 2: Advance to Restaurant Open Time ===
console.log('\n=== STEP 2: Advancing World Time to restaurant-open time (09:00:00 UTC) ===');
clockA.advance(60 * 60_000); // +1 hour -> 09:00:00 UTC
const simA = new Simulation(clockA, stateA);
simA.tick();

const restaurantA = stateA.restaurants.find(
  (r) => r.id === 'restaurant:development-restaurant'
)!;
console.log(`Current World Time: ${clockA.getTime()}`);
console.log(`Restaurant State:   ${restaurantA.operationalState}`);
assert.equal(restaurantA.operationalState, 'open');

// === STEP 3: Player Enters Restaurant ===
console.log('\n=== STEP 3: Moving player inside restaurant ===');
const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
const enterResult = enterRestaurant(
  stateA,
  'agent:dev-player',
  'restaurant:development-restaurant'
);
assert.equal(enterResult.success, true);
assert.equal(playerA.locationId, 'restaurant:development-restaurant');
console.log(`Player Location: ${playerA.locationId}`);

// === STEP 4: Verify Empty Purchase History ===
console.log('\n=== STEP 4: Verifying empty historical purchase log ===');
console.log(`Recorded Purchases Count: ${stateA.purchases.length}`);
assert.equal(stateA.purchases.length, 0);

// === STEP 5: Failed Precondition Produces Zero Historical Records ===
console.log('\n=== STEP 5: Attempting purchase with invalid offering (precondition failure) ===');
const failedPurchase = purchaseOffering(
  stateA,
  'agent:dev-player',
  'offering:non-existent',
  'restaurant:development-restaurant'
);
assert.equal(failedPurchase.success, false);
assert.equal(failedPurchase.code, 'offering-not-found');
assert.equal(stateA.purchases.length, 0);
console.log(`Purchase Result:          ${failedPurchase.code} (success: ${failedPurchase.success})`);
console.log(`Recorded Purchases Count: ${stateA.purchases.length} (zero records recorded on failure)`);

// === STEP 6: First Successful Purchase ===
console.log('\n=== STEP 6: Executing first successful Coffee purchase ===');
const balanceBefore1 = playerA.balanceMinor;
const purchase1 = purchaseOffering(
  stateA,
  'agent:dev-player',
  'offering:development-coffee',
  'restaurant:development-restaurant'
);
assert.equal(purchase1.success, true);
assert.equal(playerA.balanceMinor, balanceBefore1 - 500);
assert.equal(restaurantA.balanceMinor, 500);
console.log(`Purchase 1 Code:     ${purchase1.code}`);
console.log(`Player Balance:      ${playerA.balanceMinor} ${playerA.currency}`);
console.log(`Restaurant Balance:  ${restaurantA.balanceMinor} ${restaurantA.currency}`);

// === STEP 7: Inspect First Historical Record ===
console.log('\n=== STEP 7: Inspecting authoritative PurchaseRecord for Purchase 1 ===');
assert.equal(stateA.purchases.length, 1);
const record1 = stateA.purchases[0];
console.log(`Record ID:     ${record1.id}`);
console.log(`World Time:    ${record1.worldTime}`);
console.log(`Player ID:     ${record1.playerId}`);
console.log(`Restaurant ID: ${record1.restaurantId}`);
console.log(`Offering ID:   ${record1.offeringId}`);
console.log(`Amount Paid:   ${record1.amountMinor} ${record1.currency}`);
assert.equal(record1.id, 'purchase:1');
assert.equal(record1.amountMinor, 500);
assert.equal(record1.currency, 'USD');

// === STEP 8: Second Successful Purchase ===
console.log('\n=== STEP 8: Executing second Coffee purchase ===');
const purchase2 = purchaseOffering(
  stateA,
  'agent:dev-player',
  'offering:development-coffee',
  'restaurant:development-restaurant'
);
assert.equal(purchase2.success, true);
console.log(`Player Balance:     ${playerA.balanceMinor} ${playerA.currency}`);
console.log(`Restaurant Balance: ${restaurantA.balanceMinor} ${restaurantA.currency}`);

// === STEP 9: Inspect Second Historical Record (Monotonic IDs) ===
console.log('\n=== STEP 9: Inspecting second historical record (verifying monotonic ID assignment) ===');
assert.equal(stateA.purchases.length, 2);
const record2 = stateA.purchases[1];
console.log(`Record 2 ID:        ${record2.id}`);
console.log(`Total Purchases:    ${stateA.purchases.length}`);
assert.equal(record2.id, 'purchase:2');
assert.equal(record2.amountMinor, 500);

// === STEP 10: Future Menu Price Update in Current State ===
console.log('\n=== STEP 10: Simulating a menu price inflation update in current state (500 -> 750 USD) ===');
const coffeeOffering = stateA.offerings.find(
  (o) => o.id === 'offering:development-coffee'
)!;
coffeeOffering.priceMinor = 750;
console.log(`New Current Price:  ${coffeeOffering.priceMinor} ${coffeeOffering.currency}`);

// === STEP 11: Verify Historical Price Invariance ===
console.log('\n=== STEP 11: Verifying historical records remain immutable despite price change ===');
validateWorldState(stateA);
assert.equal(stateA.purchases[0].amountMinor, 500, 'Past purchase 1 must record 500 minor units');
assert.equal(stateA.purchases[1].amountMinor, 500, 'Past purchase 2 must record 500 minor units');
console.log(`Historical Record 1 Amount: ${stateA.purchases[0].amountMinor} ${stateA.purchases[0].currency} (invariant)`);
console.log(`Historical Record 2 Amount: ${stateA.purchases[1].amountMinor} ${stateA.purchases[1].currency} (invariant)`);
console.log(`Current Offering Price:     ${coffeeOffering.priceMinor} ${coffeeOffering.currency}`);

// === STEP 12: Perception Isolation ===
console.log('\n=== STEP 12: Verifying M12 inspectCurrentLocation() does NOT expose history ===');
const perception = inspectCurrentLocation(stateA, 'agent:dev-player');
assert.equal(perception.success, true);
assert.equal((perception as any).purchases, undefined);
assert.equal((perception as any).history, undefined);
assert.equal((perception.location as any).purchases, undefined);
assert.equal((perception.location as any).history, undefined);
console.log('inspectCurrentLocation() projected pure ObservableLocation without history leak.');

// === STEP 13: Persistence to Disk ===
console.log('\n=== STEP 13: Persisting Session A state atomically to disk ===');
const persistenceA = new LocalFilePersistence(demoPath);
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted successfully. Destroying Session A runtime...');

// === STEP 14: Fresh Runtime Session B Restore ===
console.log('\n=== STEP 14: Starting fresh Runtime Session B and restoring from disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
validateWorldState(stateB);
assert.equal(stateB.version, 13);
assert.equal(stateB.purchases.length, 2);

console.log(`Restored World Version:   ${stateB.version}`);
console.log(`Restored Purchases Count: ${stateB.purchases.length}`);
console.log(`Restored Record 1 ID:     ${stateB.purchases[0].id} (amount: ${stateB.purchases[0].amountMinor})`);
console.log(`Restored Record 2 ID:     ${stateB.purchases[1].id} (amount: ${stateB.purchases[1].amountMinor})`);

// === STEP 15: Subsequent Purchase Continues Monotonic Sequence ===
console.log('\n=== STEP 15: Executing third purchase in Session B (verifying monotonic continuation) ===');
const purchase3 = purchaseOffering(
  stateB,
  'agent:dev-player',
  'offering:development-coffee',
  'restaurant:development-restaurant'
);
assert.equal(purchase3.success, true);
assert.equal(stateB.purchases.length, 3);
assert.equal(stateB.purchases[2].id, 'purchase:3');
assert.equal(stateB.purchases[2].amountMinor, 750, 'Session B purchase was made under the new 750 price');
console.log(`New Record ID:       ${stateB.purchases[2].id}`);
console.log(`New Record Amount:   ${stateB.purchases[2].amountMinor} ${stateB.purchases[2].currency}`);
console.log(`Final Total Records: ${stateB.purchases.length}`);

// Cleanup demo file
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 15 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
