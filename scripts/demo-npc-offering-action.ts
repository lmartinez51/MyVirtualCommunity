import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  inspectCurrentLocation,
  purchaseOffering,
  inspectPlayerHistory,
  validateWorldState,
  DEVELOPMENT_PASTRY_OFFERING_ID,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-npc-offering-action.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('================================================================');
console.log('MILESTONE 19-A: DETERMINISTIC NPC OFFERING AVAILABILITY DEMO');
console.log('================================================================\n');

// === STEP 1: Bootstrap World ===
console.log('=== STEP 1: Bootstrapping development world at 08:00:00 UTC ===');
const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
const state = createInitialWorldState(clock);
const sim = new Simulation(clock, state);

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

console.log(`World ID:              ${state.worldId}`);
console.log(`World Version:         ${state.version}`);
console.log(`Initial World Time:    ${state.worldTime}`);
console.log(`Player Location:       ${player.locationId}`);
console.log(`NPC Location & State:  ${npc.locationId} (${npc.activityState})`);
console.log(`Restaurant Status:     ${restaurant.operationalState}`);
console.log(`Available Offerings:   ${state.offerings.map((o) => o.name).join(', ')}`);

assert.equal(state.version, 15);
assert.equal(player.locationId, 'building:development-building');
assert.equal(npc.locationId, 'building:development-residence');
assert.equal(npc.activityState, 'idle');
assert.equal(restaurant.operationalState, 'closed');
assert.ok(!state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

// === STEP 2: Pan Dulce Is Absent Before NPC Shift ===
console.log('\n=== STEP 2: Verifying Pan Dulce is absent before NPC shift ===');
const preShiftOfferings = state.offerings.map((o) => o.name);
console.log(`Pre-shift offerings:   ${preShiftOfferings.join(', ')}`);
assert.equal(state.offerings.length, 1);
assert.equal(state.offerings[0].id, 'offering:development-coffee');

// === STEP 3: Advance to 09:00:00 UTC & Tick Simulation ===
console.log('\n=== STEP 3: Advancing to 09:00:00 UTC & ticking simulation (NPC shift starts) ===');
clock.advance(3600_000);
const tick09 = sim.tick();

console.log(`World Time:            ${clock.getTime()}`);
console.log(`NPC New Location:      ${npc.locationId}`);
console.log(`NPC Activity State:    ${npc.activityState}`);
console.log(`Restaurant Status:     ${restaurant.operationalState}`);
console.log(`Offerings in State:    ${state.offerings.map((o) => `${o.name} ($${(o.priceMinor / 100).toFixed(2)})`).join(', ')}`);

assert.equal(npc.locationId, 'restaurant:development-restaurant');
assert.equal(npc.activityState, 'active');
assert.equal(restaurant.operationalState, 'open');
assert.ok(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
const pastry = state.offerings.find((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID)!;
assert.equal(pastry.name, 'Pan Dulce');
assert.equal(pastry.priceMinor, 250);
assert.equal(pastry.currency, 'USD');

const offeringTrans09 = tick09.offeringTransitions?.find(
  (t) => t.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
);
assert.ok(offeringTrans09);
assert.equal(offeringTrans09.action, 'made-available');

// === STEP 4: Player Enters Restaurant ===
console.log('\n=== STEP 4: Player enters restaurant ===');
const enterResult = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(enterResult.success, true);
console.log(`Player Location:       ${player.locationId}`);
assert.equal(player.locationId, 'restaurant:development-restaurant');

// === STEP 5: Player Inspects Current Location ===
console.log('\n=== STEP 5: Player inspects restaurant perception ===');
const inspectResult = inspectCurrentLocation(state, 'agent:dev-player');
assert.equal(inspectResult.success, true);
const observedLocation = inspectResult.location as any;
const observedOfferings = observedLocation.offerings;
console.log(`Observed Offerings:    ${observedOfferings.map((o: any) => `${o.name} ($${(o.priceMinor / 100).toFixed(2)} ${o.currency})`).join(', ')}`);
assert.equal(observedOfferings.length, 2);
assert.ok(observedOfferings.some((o: any) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

// === STEP 6: Player Purchases Pan Dulce ===
console.log('\n=== STEP 6: Player purchases Pan Dulce ($2.50 USD) ===');
const playerBalBefore = player.balanceMinor;
const restBalBefore = restaurant.balanceMinor;

const purchaseResult = purchaseOffering(
  state,
  'agent:dev-player',
  DEVELOPMENT_PASTRY_OFFERING_ID,
  'restaurant:development-restaurant'
);

console.log(`Purchase Success:      ${purchaseResult.success}`);
console.log(`Purchase Code:         ${purchaseResult.code}`);
console.log(`Amount Deducted:       $${((purchaseResult.amountMinor ?? 0) / 100).toFixed(2)} ${purchaseResult.currency}`);
console.log(`Player Balance:        $${(player.balanceMinor / 100).toFixed(2)} USD (was $${(playerBalBefore / 100).toFixed(2)})`);
console.log(`Restaurant Balance:    $${(restaurant.balanceMinor / 100).toFixed(2)} USD (was $${(restBalBefore / 100).toFixed(2)})`);

assert.equal(purchaseResult.success, true);
assert.equal(purchaseResult.code, 'success');
assert.equal(player.balanceMinor, playerBalBefore - 250);
assert.equal(restaurant.balanceMinor, restBalBefore + 250);
assert.equal(state.purchases.length, 1);
assert.equal(state.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

// === STEP 7: Player Inspects Personal History ===
console.log('\n=== STEP 7: Player inspects personal historical records ===');
const historyResult = inspectPlayerHistory(state, 'agent:dev-player');
assert.equal(historyResult.success, true);
console.log(`Purchases Recorded:    ${historyResult.history?.purchases.length}`);
console.log(`Recorded Offering ID:  ${historyResult.history?.purchases[0].offeringId}`);
console.log(`Recorded Price Paid:   $${((historyResult.history?.purchases[0].amountMinor ?? 0) / 100).toFixed(2)} USD`);
assert.equal(historyResult.history?.purchases.length, 1);
assert.equal(historyResult.history?.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

// === STEP 8: Advance to 17:00:00 UTC & Tick Simulation ===
console.log('\n=== STEP 8: Advancing to 17:00:00 UTC & ticking simulation (NPC shift ends) ===');
clock.advance(8 * 3600_000);
const tick17 = sim.tick();

console.log(`World Time:            ${clock.getTime()}`);
console.log(`NPC Location & State:  ${npc.locationId} (${npc.activityState})`);
console.log(`Restaurant Status:     ${restaurant.operationalState}`);
console.log(`Offerings in State:    ${state.offerings.map((o) => o.name).join(', ')}`);

assert.equal(npc.locationId, 'street:avenida-juarez');
assert.equal(npc.activityState, 'idle');
assert.equal(restaurant.operationalState, 'closed');
assert.ok(!state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

const offeringTrans17 = tick17.offeringTransitions?.find(
  (t) => t.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
);
assert.ok(offeringTrans17);
assert.equal(offeringTrans17.action, 'retired');

// === STEP 9: Player Inspects Location After Retirement ===
console.log('\n=== STEP 9: Player inspects location after Pan Dulce retirement ===');
const inspectAfter = inspectCurrentLocation(state, 'agent:dev-player');
assert.equal(inspectAfter.success, true);
const obsOfferingsAfter = (inspectAfter.location as any).offerings;
console.log(`Observed Offerings:    ${obsOfferingsAfter.map((o: any) => o.name).join(', ')}`);
assert.equal(obsOfferingsAfter.length, 1);
assert.equal(obsOfferingsAfter[0].id, 'offering:development-coffee');

// === STEP 10: Purchasing Retired Offering Fails ===
console.log('\n=== STEP 10: Player attempts to purchase retired Pan Dulce ===');
const failedPurchase = purchaseOffering(
  state,
  'agent:dev-player',
  DEVELOPMENT_PASTRY_OFFERING_ID,
  'restaurant:development-restaurant'
);
console.log(`Purchase Success:      ${failedPurchase.success}`);
console.log(`Failure Code:          ${failedPurchase.code}`);
assert.equal(failedPurchase.success, false);
// Since restaurant is also closed at 17:00, purchase checks restaurant-closed before offering-not-found,
// or if open, offering-not-found. Either way, purchase strictly fails.
assert.ok(['offering-not-found', 'restaurant-closed'].includes(failedPurchase.code));

// === STEP 11: Persistence Roundtrip & Schema Version 10 Validation ===
console.log('\n=== STEP 11: Persisting world state and verifying historical integrity across sessions ===');
const persistence = new LocalFilePersistence(demoPath);
persistence.save(state);

const loaded = persistence.load();
assert.ok(loaded);
console.log(`Restored World ID:     ${loaded.worldId}`);
console.log(`Restored Version:      ${loaded.version}`);
console.log(`Offerings in Restored: ${loaded.offerings.map((o) => o.name).join(', ')}`);
console.log(`Historical Purchases:  ${loaded.purchases.length}`);
console.log(`Historical Offering:   ${loaded.purchases[0].offeringId}`);

assert.equal(loaded.version, 15);
assert.doesNotThrow(() => validateWorldState(loaded));
assert.ok(!loaded.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
assert.equal(loaded.purchases.length, 1);
assert.equal(loaded.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

const loadedHistory = inspectPlayerHistory(loaded, 'agent:dev-player');
assert.equal(loadedHistory.success, true);
assert.equal(loadedHistory.history?.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

// === STEP 12: Cleanup ===
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: MILESTONE 19-A VERIFIED SUCCESSFULLY');
console.log('================================================================');
