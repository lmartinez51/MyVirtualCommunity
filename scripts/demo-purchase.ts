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
  validateWorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 8: FIRST ECONOMIC TRANSACTION / PURCHASE DEMONSTRATION');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-milestone-8-purchase-demo.json');
const DEMO_PERSISTENCE_PATH = demoPath;
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// 1. World restored/created
console.log('=== STEP 1: Bootstrapping Version 10 development world at 09:00:00 UTC ===');
const clockA = WorldClock.create('2026-09-14T09:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const persistenceA = new LocalFilePersistence(DEMO_PERSISTENCE_PATH);
persistenceA.save(stateA);
assert.equal(stateA.version, 13);
console.log(`World ID:      ${stateA.worldId}`);
console.log(`World Version: ${stateA.version}`);
console.log(`World Time:    ${clockA.getTime()}`);

// 2. Restaurant open
console.log('\n=== STEP 2: Verifying restaurant operational state ===');
const restaurantA = stateA.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Restaurant:       ${restaurantA.id}`);
console.log(`OperationalState: ${restaurantA.operationalState}`);
console.log(`OperationalSince: ${restaurantA.operationalSince}`);
assert.equal(restaurantA.operationalState, 'open');

// 3. Player location
console.log('\n=== STEP 3: Moving player inside open restaurant ===');
const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
console.log(`Initial player location: ${playerA.locationId}`);
const entryResult = enterRestaurant(
  stateA,
  'agent:dev-player',
  'restaurant:development-restaurant',
  { silent: true }
);
assert.equal(entryResult.success, true);
assert.equal(playerA.locationId, 'restaurant:development-restaurant');
console.log(`Updated player location: ${playerA.locationId}`);

// 4. Initial player balance
console.log('\n=== STEP 4: Verifying initial player balance ===');
console.log(`Player ID:      ${playerA.id}`);
console.log(`Player Balance: ${playerA.balanceMinor} ${playerA.currency} ($${(playerA.balanceMinor / 100).toFixed(2)})`);
assert.equal(playerA.balanceMinor, 2000);
assert.equal(playerA.currency, 'USD');

// 5. Initial restaurant balance
console.log('\n=== STEP 5: Verifying initial restaurant balance ===');
console.log(`Restaurant ID:      ${restaurantA.id}`);
console.log(`Restaurant Balance: ${restaurantA.balanceMinor} ${restaurantA.currency} ($${(restaurantA.balanceMinor / 100).toFixed(2)})`);
assert.equal(restaurantA.balanceMinor, 0);
assert.equal(restaurantA.currency, 'USD');

// 6. Coffee offering
console.log('\n=== STEP 6: Inspecting commercial offering ===');
const coffeeOffering = stateA.offerings.find((o) => o.id === 'offering:development-coffee')!;
console.log(`Offering ID:       ${coffeeOffering.id}`);
console.log(`Offering Name:     ${coffeeOffering.name}`);
console.log(`Offering Price:    ${coffeeOffering.priceMinor} ${coffeeOffering.currency} ($${(coffeeOffering.priceMinor / 100).toFixed(2)})`);
console.log(`Offering Business: ${coffeeOffering.restaurantId}`);
assert.equal(coffeeOffering.priceMinor, 500);
assert.equal(coffeeOffering.currency, 'USD');

// 7. Purchase #1
console.log('\n=== STEP 7: Executing Purchase #1 ===');
const p1 = purchaseOffering(stateA, 'agent:dev-player', 'offering:development-coffee');

// 8. Result
console.log('\n=== STEP 8: Verifying Purchase #1 result ===');
console.log(`Result Success: ${p1.success}`);
console.log(`Result Code:    ${p1.code}`);
console.log(`Message:        ${p1.message}`);
assert.equal(p1.success, true);
assert.equal(p1.code, 'success');

// 9. Balances after #1
console.log('\n=== STEP 9: Balances after Purchase #1 ===');
console.log(`Player Balance:     ${playerA.balanceMinor} ${playerA.currency} ($${(playerA.balanceMinor / 100).toFixed(2)})`);
console.log(`Restaurant Balance: ${restaurantA.balanceMinor} ${restaurantA.currency} ($${(restaurantA.balanceMinor / 100).toFixed(2)})`);
assert.equal(playerA.balanceMinor, 1500);
assert.equal(restaurantA.balanceMinor, 500);

// 10. Purchase #2
console.log('\n=== STEP 10: Executing Purchase #2 ===');
const p2 = purchaseOffering(stateA, 'agent:dev-player', 'offering:development-coffee');
assert.equal(p2.success, true);

// 11. Balances after #2
console.log('\n=== STEP 11: Balances after Purchase #2 ===');
console.log(`Player Balance:     ${playerA.balanceMinor} ${playerA.currency} ($${(playerA.balanceMinor / 100).toFixed(2)})`);
console.log(`Restaurant Balance: ${restaurantA.balanceMinor} ${restaurantA.currency} ($${(restaurantA.balanceMinor / 100).toFixed(2)})`);
assert.equal(playerA.balanceMinor, 1000);
assert.equal(restaurantA.balanceMinor, 1000);

// 12. Purchase #3
console.log('\n=== STEP 12: Executing Purchase #3 ===');
const p3 = purchaseOffering(stateA, 'agent:dev-player', 'offering:development-coffee');
assert.equal(p3.success, true);
console.log(`Player Balance:     ${playerA.balanceMinor} ${playerA.currency} ($${(playerA.balanceMinor / 100).toFixed(2)})`);
console.log(`Restaurant Balance: ${restaurantA.balanceMinor} ${restaurantA.currency} ($${(restaurantA.balanceMinor / 100).toFixed(2)})`);
assert.equal(playerA.balanceMinor, 500);
assert.equal(restaurantA.balanceMinor, 1500);

// 13. Purchase #4
console.log('\n=== STEP 13: Executing Purchase #4 (draining player funds to zero) ===');
const p4 = purchaseOffering(stateA, 'agent:dev-player', 'offering:development-coffee');
assert.equal(p4.success, true);
console.log(`Player Balance:     ${playerA.balanceMinor} ${playerA.currency} ($${(playerA.balanceMinor / 100).toFixed(2)})`);
console.log(`Restaurant Balance: ${restaurantA.balanceMinor} ${restaurantA.currency} ($${(restaurantA.balanceMinor / 100).toFixed(2)})`);
assert.equal(playerA.balanceMinor, 0);
assert.equal(restaurantA.balanceMinor, 2000);

// 14. Purchase #5 rejected
console.log('\n=== STEP 14: Executing Purchase #5 (insufficient funds expected) ===');
const p5 = purchaseOffering(stateA, 'agent:dev-player', 'offering:development-coffee');
console.log(`Result Success:     ${p5.success}`);
console.log(`Result Code:        ${p5.code}`);
console.log(`Message:            ${p5.message}`);
assert.equal(p5.success, false);
assert.equal(p5.code, 'insufficient-funds');
assert.equal(playerA.balanceMinor, 0);
assert.equal(restaurantA.balanceMinor, 2000);
console.log('Confirmed zero state mutation on insufficient-funds failure.');

// 15. Persist
console.log('\n=== STEP 15: Persisting world state to disk and destroying Runtime A ===');
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted successfully.');

// 16. Reconstruct
console.log('\n=== STEP 16: Starting fresh runtime Session B and restoring from disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
validateWorldState(stateB);
assert.equal(stateB.version, 13);
console.log(`Session B Restored World Version: ${stateB.version}`);
console.log(`Session B Restored World Time:    ${stateB.worldTime}`);

// 17. Verify restored balances
console.log('\n=== STEP 17: Verifying reconstructed economic balances in fresh runtime ===');
const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
const restaurantB = stateB.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Restored Player Balance:     ${playerB.balanceMinor} ${playerB.currency} ($${(playerB.balanceMinor / 100).toFixed(2)})`);
console.log(`Restored Restaurant Balance: ${restaurantB.balanceMinor} ${restaurantB.currency} ($${(restaurantB.balanceMinor / 100).toFixed(2)})`);
assert.equal(playerB.balanceMinor, 0);
assert.equal(playerB.currency, 'USD');
assert.equal(restaurantB.balanceMinor, 2000);
assert.equal(restaurantB.currency, 'USD');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 17 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
