import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  inspectCurrentLocation,
  inspectPlayerHistory,
  purchaseOffering,
  validateWorldState,
  DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 23: FIRST WORLD OPPORTUNITY DEMONSTRATION');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-demo-m23-world-opportunity.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// === STEP 1: Bootstrap World at 08:00:00 UTC (Pre-Shift) ===
console.log('=== STEP 1: Bootstrapping world at 08:00:00 UTC (Pre-Shift) ===');
const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
const state = createInitialWorldState(clock);
validateWorldState(state);
assert.equal(state.version, 14);

const sim = new Simulation(clock, state);

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

console.log(`World Time:         ${clock.getTime()}`);
console.log(`Player Location:    ${player.locationId}`);
console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);
console.log(`Restaurant Status:  ${restaurant.operationalState}`);
console.log(
  `Pastry Offering:    ${state.offerings.some((o) => o.id === 'offering:development-pastry') ? 'available' : 'absent'}`
);

// At 08:00 UTC before the shift, the restaurant is closed and NPC is at residence
assert.equal(restaurant.operationalState, 'closed');
assert.equal(npc.locationId, 'building:development-residence');
assert.equal(npc.activityState, 'idle');

// Inspect player's current location (building:development-building)
const preShiftInspect = inspectCurrentLocation(state, player.id);
assert.equal(preShiftInspect.success, true);
console.log(`Pre-Shift Location: ${preShiftInspect.location?.name} (${preShiftInspect.location?.type})`);
console.log(`Opportunities:      ${preShiftInspect.location?.opportunities ?? 'none (not a restaurant)'}`);
assert.equal(preShiftInspect.location?.opportunities, undefined);

// === STEP 2: Advance to 09:00:00 UTC (NPC Shift Starts) ===
console.log('\n=== STEP 2: Advancing to 09:00:00 UTC (NPC Shift Starts) & ticking simulation ===');
clock.advance(60 * 60_000);
const tick0900 = sim.tick();

console.log(`World Time:         ${clock.getTime()}`);
console.log(`Restaurant Status:  ${restaurant.operationalState}`);
console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);
console.log(
  `Pastry Offering:    ${state.offerings.some((o) => o.id === 'offering:development-pastry') ? 'available' : 'absent'}`
);

assert.equal(restaurant.operationalState, 'open');
assert.equal(npc.locationId, 'restaurant:development-restaurant');
assert.equal(npc.activityState, 'active');
assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), true);

// === STEP 3: Player Enters Restaurant and Discovers Opportunity ===
console.log('\n=== STEP 3: Player enters restaurant and inspects location ===');
const enterResult = enterRestaurant(state, player.id, restaurant.id);
assert.equal(enterResult.success, true);
console.log(`Player Entered:     ${restaurant.name} (${restaurant.id})`);

const inspection = inspectCurrentLocation(state, player.id);
assert.equal(inspection.success, true);
assert.ok(inspection.location);
assert.ok(inspection.location.opportunities);
assert.equal(inspection.location.opportunities.length, 1);

const discoveredOpportunity = inspection.location.opportunities[0];
console.log('\n--- Discovered Situational Opportunity ---');
console.log(`Opportunity ID:     ${discoveredOpportunity.id}`);
console.log(`Name:               ${discoveredOpportunity.name}`);
console.log(`Description:        ${discoveredOpportunity.description}`);
console.log(`Offering ID:        ${discoveredOpportunity.offeringId}`);

assert.equal(discoveredOpportunity.id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
assert.equal(discoveredOpportunity.name, 'Pan Dulce Available');
assert.equal(
  discoveredOpportunity.description,
  'Pan Dulce is available while the restaurant is open and the NPC is working.'
);
assert.equal(discoveredOpportunity.offeringId, 'offering:development-pastry');

// === STEP 4: Player Acts via Existing Purchase Contract ===
console.log('\n=== STEP 4: Player acts on opportunity via existing purchaseOffering() ===');
const initialPlayerBalance = player.balanceMinor;
const initialRestaurantBalance = restaurant.balanceMinor;

console.log(`Player Balance Before:     $${(initialPlayerBalance / 100).toFixed(2)} USD`);
console.log(`Restaurant Balance Before: $${(initialRestaurantBalance / 100).toFixed(2)} USD`);

const purchaseResult = purchaseOffering(state, player.id, discoveredOpportunity.offeringId);
assert.equal(purchaseResult.success, true);
assert.equal(purchaseResult.code, 'success');

console.log(`Purchase Result:           ${purchaseResult.message} (code: ${purchaseResult.code})`);
console.log(`Player Balance After:      $${(player.balanceMinor / 100).toFixed(2)} USD`);
console.log(`Restaurant Balance After:  $${(restaurant.balanceMinor / 100).toFixed(2)} USD`);

assert.equal(player.balanceMinor, initialPlayerBalance - 250);
assert.equal(restaurant.balanceMinor, initialRestaurantBalance + 250);

assert.equal(state.purchases.length, 1);
const latestPurchaseRecord = state.purchases[state.purchases.length - 1];
assert.ok(latestPurchaseRecord);
console.log('\n--- Historical Purchase Record Created ---');
console.log(`Transaction ID:     ${latestPurchaseRecord.id}`);
console.log(`Offering ID:        ${latestPurchaseRecord.offeringId}`);
console.log(`Amount Paid:        $${(latestPurchaseRecord.amountMinor / 100).toFixed(2)} ${latestPurchaseRecord.currency}`);
console.log(`Purchased At:       ${latestPurchaseRecord.worldTime}`);
assert.equal(latestPurchaseRecord.offeringId, 'offering:development-pastry');

// === STEP 5: Advance to 17:00:00 UTC (Shift Ends, Opportunity Disappears) ===
console.log('\n=== STEP 5: Advancing to 17:00:00 UTC (Shift Ends) & ticking simulation ===');
clock.advance(8 * 60 * 60_000); // 09:00 -> 17:00
sim.tick();

console.log(`World Time:         ${clock.getTime()}`);
console.log(`Restaurant Status:  ${restaurant.operationalState}`);
console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);
console.log(
  `Pastry Offering:    ${state.offerings.some((o) => o.id === 'offering:development-pastry') ? 'available' : 'retired'}`
);

assert.equal(restaurant.operationalState, 'closed');
assert.equal(npc.locationId, 'street:avenida-juarez');
assert.equal(npc.activityState, 'idle');
assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), false);

// Inspect again from inside restaurant
const closingInspection = inspectCurrentLocation(state, player.id);
assert.equal(closingInspection.success, true);
console.log(`Opportunities Now:  ${JSON.stringify(closingInspection.location?.opportunities)}`);
assert.deepEqual(closingInspection.location?.opportunities, []);

// Attempting stale purchase now fails authoritatively
console.log('\n--- Attempting Stale Purchase ---');
const stalePurchase = purchaseOffering(state, player.id, 'offering:development-pastry');
console.log(`Stale Purchase:     success=${stalePurchase.success}, code=${stalePurchase.code}`);
assert.equal(stalePurchase.success, false);
assert.ok(stalePurchase.code === 'restaurant-closed' || stalePurchase.code === 'offering-not-found');

// Historical purchase record still persists
const historyResult = inspectPlayerHistory(state, player.id);
assert.equal(historyResult.success, true);
assert.equal(historyResult.history?.purchases.length, 1);
console.log(`Historical Record:  Preserved in player history after opportunity expiration.`);

// === STEP 6: Persistence Roundtrip & Schema Version 10 Verification ===
console.log('\n=== STEP 6: Persistence Roundtrip & Schema Version 10 Verification ===');
const persistence = new LocalFilePersistence(demoPath);
await persistence.save(state);
console.log(`Saved world state to: ${demoPath}`);

const restoredState = await persistence.load();
assert.ok(restoredState);
validateWorldState(restoredState);
assert.equal(restoredState.version, 14);
console.log(`Restored World State Version: ${restoredState.version}`);
console.log(`Persisted Opportunity Field:  ${(restoredState as any).opportunities ?? 'undefined (not persisted)'}`);
assert.equal((restoredState as any).opportunities, undefined);

const restoredHistory = inspectPlayerHistory(restoredState, player.id);
assert.equal(restoredHistory.success, true);
assert.equal(restoredHistory.history?.purchases.length, 1);
console.log(`Restored Purchase History:    ${restoredHistory.history?.purchases.length} record(s) verified`);

// Cleanup demo file
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('MILESTONE 23 DEMONSTRATION COMPLETE: ALL INVARIANTS VERIFIED');
console.log('================================================================');
