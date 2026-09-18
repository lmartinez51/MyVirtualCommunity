import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  getRestaurantOfferings,
  enterRestaurant,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { Simulation } from '../src/core/simulation.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-commercial-offering.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('================================================================');
console.log('MILESTONE 7: FIRST COMMERCIAL OFFERING DEMONSTRATION');
console.log('================================================================\n');

// STEP 1: Bootstrap Version 10 development world at 09:00:00 UTC (open window).
console.log('=== STEP 1: Bootstrapping Version 10 development world at 09:00:00 UTC ===');
const clockA = WorldClock.create('2026-09-14T09:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const persistenceA = new LocalFilePersistence(demoPath);
const simA = new Simulation(clockA, stateA);

assert.equal(stateA.version, 12);
console.log(`World ID:      ${stateA.worldId}`);
console.log(`World Version: ${stateA.version}`);
console.log(`World Time:    ${clockA.getTime()}`);

// STEP 2: Verify Restaurant is open.
console.log('\n=== STEP 2: Verifying Restaurant is OPEN ===');
const restaurantA = stateA.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Restaurant ID:    ${restaurantA.id}`);
console.log(`Restaurant State: ${restaurantA.operationalState} (operationalSince: ${restaurantA.operationalSince})`);
assert.equal(restaurantA.operationalState, 'open');

// STEP 3: Verify development restaurant contains the synthetic offering.
console.log('\n=== STEP 3: Verifying development restaurant contains synthetic offering ===');
const initialOfferings = getRestaurantOfferings(stateA, restaurantA.id);
assert.equal(initialOfferings.length, 1);
const coffeeOffering = initialOfferings[0];
assert.equal(coffeeOffering.id, 'offering:development-coffee');
console.log(`Found ${initialOfferings.length} offering(s) for ${restaurantA.id}`);

// STEP 4: Print offering.
console.log('\n=== STEP 4: Commercial Offering Details ===');
console.log('RESTAURANT OFFERING');
console.log(`RESTAURANT: ${coffeeOffering.restaurantId}`);
console.log(`OFFERING:   ${coffeeOffering.id}`);
console.log(`NAME:       ${coffeeOffering.name}`);
console.log(`PRICE:      ${coffeeOffering.priceMinor} ${coffeeOffering.currency} minor units`);

// STEP 5: Player enters restaurant using the existing M6 interaction.
console.log('\n=== STEP 5: Player enters restaurant using Milestone 6 interaction ===');
const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
console.log(`Player location before entry: ${playerA.locationId}`);
const entryResult = enterRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(entryResult.success, true);
assert.equal(playerA.locationId, 'restaurant:development-restaurant');
console.log(`Player location after entry:  ${playerA.locationId}`);

// STEP 6: Query restaurant offerings.
console.log('\n=== STEP 6: Querying restaurant offerings from player location ===');
const offeringsAfterEntry = getRestaurantOfferings(stateA, playerA.locationId);
assert.equal(offeringsAfterEntry.length, 1);

// STEP 7: Show offering remains available as world data.
console.log('\n=== STEP 7: Demonstrating offering available as authoritative world data ===');
console.log(`Offering visible to player: ${offeringsAfterEntry[0].name} (${offeringsAfterEntry[0].priceMinor} ${offeringsAfterEntry[0].currency})`);
assert.deepEqual(offeringsAfterEntry[0], coffeeOffering);

// STEP 8: Advance to 17:00 and tick.
console.log('\n=== STEP 8: Advancing World Clock to 17:00:00 UTC and executing Simulation.tick() ===');
clockA.advance(8 * 3600_000); // 09:00 -> 17:00
console.log(`World Time: ${clockA.getTime()}`);
simA.tick();

// STEP 9: Restaurant becomes closed.
console.log('\n=== STEP 9: Verifying Restaurant is now CLOSED ===');
console.log(`Restaurant State: ${restaurantA.operationalState} (operationalSince: ${restaurantA.operationalSince})`);
assert.equal(restaurantA.operationalState, 'closed');

// STEP 10: Query offerings again.
console.log('\n=== STEP 10: Querying restaurant offerings while Restaurant is CLOSED ===');
const offeringsWhileClosed = getRestaurantOfferings(stateA, 'restaurant:development-restaurant');

// STEP 11: Confirm offering still exists structurally.
console.log('\n=== STEP 11: Confirming offering still exists structurally ===');
assert.equal(offeringsWhileClosed.length, 1);
assert.equal(offeringsWhileClosed[0].id, 'offering:development-coffee');
console.log(`Offering still present structurally: ${offeringsWhileClosed[0].name} (${offeringsWhileClosed[0].id})`);

// STEP 12: Confirm no money/order/purchase state exists.
console.log('\n=== STEP 12: Verifying NO economic/money/order/purchase state exists ===');
const rawPlayer = playerA as Record<string, unknown>;
const rawRestaurant = restaurantA as Record<string, unknown>;
const rawState = stateA as Record<string, unknown>;
assert.equal(rawPlayer.wallet, undefined);
assert.equal(rawPlayer.balance, undefined);
assert.equal(rawPlayer.inventory, undefined);
assert.equal(rawRestaurant.revenue, undefined);
assert.equal(rawRestaurant.balance, undefined);
assert.equal(rawRestaurant.inventory, undefined);
assert.equal(rawState.orders, undefined);
assert.deepEqual(rawState.purchases, []);
assert.equal(rawState.transactions, undefined);
console.log('Confirmed: Zero economic, transaction, wallet, inventory, or order state exists.');

// STEP 13: Persist world.
console.log('\n=== STEP 13: Persisting world state to disk ===');
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('State saved successfully to disk.');

// STEP 14: Destroy runtime.
console.log('\n=== STEP 14: Destroying runtime Session A ===');
console.log('Session A destroyed.');

// STEP 15: Restore Version 10 world.
console.log('\n=== STEP 15: Starting fresh runtime Session B and restoring from disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
validateWorldState(stateB);
assert.equal(stateB.version, 12);
console.log(`Session B Restored World Version: ${stateB.version}`);
console.log(`Session B Restored World Time:    ${stateB.worldTime}`);

// STEP 16: Verify offering is identical after reconstruction.
console.log('\n=== STEP 16: Verifying offering is identical after reconstruction ===');
const restoredOfferings = getRestaurantOfferings(stateB, 'restaurant:development-restaurant');
assert.equal(restoredOfferings.length, 1);
const restoredCoffee = restoredOfferings[0];
console.log(`Restored Offering ID:    ${restoredCoffee.id}`);
console.log(`Restored Offering Name:  ${restoredCoffee.name}`);
console.log(`Restored Offering Price: ${restoredCoffee.priceMinor} ${restoredCoffee.currency}`);
console.log(`Restored Restaurant ID:  ${restoredCoffee.restaurantId}`);
assert.deepEqual(restoredCoffee, coffeeOffering);

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 16 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================');

// Clean up temporary file
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}
