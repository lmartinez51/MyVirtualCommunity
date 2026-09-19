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
  DEVELOPMENT_PASTRY_OFFERING_ID,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 24: FIRST OPPORTUNITY-DRIVEN PLAYER DECISION DEMO');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-demo-m24-opportunity-decision.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

try {
  // === STEP 1: Initialize World at 09:00:00 UTC (Restaurant Open & NPC Active) ===
  console.log('=== STEP 1: Initializing world at 09:00:00 UTC (Restaurant Open & NPC Active) ===');
  const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
  const state = createInitialWorldState(clock);
  validateWorldState(state);
  assert.equal(state.version, 14);

  const sim = new Simulation(clock, state);

  // Advance to 09:00 UTC to open restaurant and activate NPC shift
  clock.advance(60 * 60_000);
  sim.tick();

  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
  const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

  console.log(`World Time:         ${clock.getTime()}`);
  console.log(`Restaurant Status:  ${restaurant.operationalState}`);
  console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);
  console.log(
    `Pastry Offering:    ${state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID) ? 'available' : 'absent'}`
  );

  assert.equal(restaurant.operationalState, 'open');
  assert.equal(npc.locationId, 'restaurant:development-restaurant');
  assert.equal(npc.activityState, 'active');
  assert.equal(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID), true);

  // === STEP 2: Player Enters Restaurant & Inspects Local Perception ===
  console.log('\n=== STEP 2: Player enters restaurant and inspects local perception ===');
  const enterResult = enterRestaurant(state, player.id, restaurant.id);
  assert.equal(enterResult.success, true);
  console.log(`[ACTION] Player entered "${restaurant.name}" (${restaurant.id})`);

  const snapshotBeforePerception = JSON.stringify(state);
  const perception = inspectCurrentLocation(state, player.id);
  assert.equal(perception.success, true);
  assert.ok(perception.location);
  console.log(`[PERCEPTION] Location ID:    ${perception.location.id}`);
  console.log(`[PERCEPTION] Location Type:  ${perception.location.type}`);
  console.log(`[PERCEPTION] Operational:    ${perception.location.operationalState}`);
  console.log(`[PERCEPTION] Offerings:      ${perception.location.offerings?.map((o) => o.name).join(', ')}`);
  console.log(`[PERCEPTION] Co-located:     ${perception.location.agents.map((a) => a.name).join(', ')}`);

  // Verify zero state mutation during perception
  assert.equal(JSON.stringify(state), snapshotBeforePerception, 'Perception alone must produce zero state mutation');

  // === STEP 3: Extract and Display Derived Opportunity ===
  console.log('\n=== STEP 3: Extract and display derived opportunity ===');
  assert.ok(perception.location.opportunities);
  assert.equal(perception.location.opportunities.length, 1);

  const opportunity = perception.location.opportunities[0];
  console.log(`[OPPORTUNITY] ID:          ${opportunity.id}`);
  console.log(`[OPPORTUNITY] Name:        ${opportunity.name}`);
  console.log(`[OPPORTUNITY] Description: ${opportunity.description}`);
  console.log(`[OPPORTUNITY] Offering ID: ${opportunity.offeringId}`);

  assert.equal(opportunity.id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
  assert.equal(opportunity.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

  // === STEP 4: Explicit Player Decision to Purchase ===
  console.log('\n=== STEP 4: Explicit player decision to purchase using opportunity.offeringId ===');
  console.log('--- AGENCY BOUNDARY ---');
  console.log('1. The opportunity does NOT automatically trigger a purchase.');
  console.log('2. The player explicitly inspects the offeringId from the opportunity projection.');
  console.log(`3. The player explicitly invokes purchaseOffering(state, player.id, "${opportunity.offeringId}").`);

  const initialPlayerBalance = player.balanceMinor;
  const initialRestaurantBalance = restaurant.balanceMinor;

  console.log(`Player Balance Before:     $${(initialPlayerBalance / 100).toFixed(2)} USD`);
  console.log(`Restaurant Balance Before: $${(initialRestaurantBalance / 100).toFixed(2)} USD`);

  // Explicit purchase command using the observed offeringId
  const purchaseResult = purchaseOffering(state, player.id, opportunity.offeringId);
  assert.equal(purchaseResult.success, true);
  assert.equal(purchaseResult.code, 'success');
  console.log(`[COMMAND] purchaseOffering() executed successfully (code: ${purchaseResult.code})`);

  // === STEP 5: Display Atomic Balance Changes & Personal Purchase History ===
  console.log('\n=== STEP 5: Display atomic balance changes & personal purchase history ===');
  console.log(`Player Balance After:      $${(player.balanceMinor / 100).toFixed(2)} USD`);
  console.log(`Restaurant Balance After:  $${(restaurant.balanceMinor / 100).toFixed(2)} USD`);

  assert.equal(player.balanceMinor, initialPlayerBalance - 250);
  assert.equal(restaurant.balanceMinor, initialRestaurantBalance + 250);

  // Verify historical record
  const history = inspectPlayerHistory(state, player.id);
  assert.equal(history.success, true);
  assert.ok(history.history);
  assert.equal(history.history.purchases.length, 1);

  const purchaseRecord = history.history.purchases[0];
  console.log('\n--- Historical Purchase Record ---');
  console.log(`Purchase Record ID: ${purchaseRecord.id}`);
  console.log(`Offering ID:        ${purchaseRecord.offeringId}`);
  console.log(`Amount Paid:        $${(purchaseRecord.amountMinor / 100).toFixed(2)} ${purchaseRecord.currency}`);
  console.log(`Timestamp:          ${purchaseRecord.worldTime}`);
  assert.equal(purchaseRecord.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
  assert.equal(purchaseRecord.amountMinor, 250);

  // === STEP 6: Advance to 17:00 UTC & Demonstrate Authoritative Stale Rejection ===
  console.log('\n=== STEP 6: Advance to 17:00:00 UTC & demonstrate authoritative stale rejection ===');
  clock.advance(8 * 60 * 60_000); // 09:00 -> 17:00
  sim.tick();

  console.log(`World Time:         ${clock.getTime()}`);
  console.log(`Restaurant Status:  ${restaurant.operationalState}`);
  console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);
  console.log(
    `Pastry Offering:    ${state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID) ? 'available' : 'retired'}`
  );

  assert.equal(restaurant.operationalState, 'closed');
  assert.equal(npc.locationId, 'street:avenida-juarez');
  assert.equal(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID), false);

  // Inspect again from inside the restaurant
  const postClosingPerception = inspectCurrentLocation(state, player.id);
  assert.equal(postClosingPerception.success, true);
  console.log(`Opportunities Now:  ${JSON.stringify(postClosingPerception.location?.opportunities)}`);
  assert.deepEqual(postClosingPerception.location?.opportunities, []);

  // Attempting purchase using the previously retained opportunity offeringId fails authoritatively
  console.log('\n--- Attempting Stale Purchase with Previously Observed offeringId ---');
  const stateBeforeStale = JSON.stringify(state);
  const stalePurchaseResult = purchaseOffering(state, player.id, opportunity.offeringId);
  console.log(`Stale Purchase Result: success=${stalePurchaseResult.success}, code=${stalePurchaseResult.code}`);

  assert.equal(stalePurchaseResult.success, false);
  assert.ok(
    stalePurchaseResult.code === 'restaurant-closed' ||
    stalePurchaseResult.code === 'offering-not-found'
  );
  assert.equal(JSON.stringify(state), stateBeforeStale, 'Rejected stale purchase must produce zero state mutation');

  // === STEP 7: Persist & Reload World, Verifying Schema v10 & Persistence Integrity ===
  console.log('\n=== STEP 7: Persisting and reloading world to verify persistence & schema v10 ===');
  const persistence = new LocalFilePersistence(demoPath);
  await persistence.save(state);
  console.log(`Saved world state snapshot to "${demoPath}".`);

  const restoredState = await persistence.load();
  assert.ok(restoredState);
  validateWorldState(restoredState);
  console.log(`Restored World ID:      ${restoredState.worldId}`);
  console.log(`Restored Schema Ver:    ${restoredState.version}`);
  assert.equal(restoredState.version, 14);

  const restoredPlayer = restoredState.agents.find((a) => a.id === player.id)!;
  const restoredRestaurant = restoredState.restaurants.find((r) => r.id === restaurant.id)!;
  console.log(`Restored Player Bal:    $${(restoredPlayer.balanceMinor / 100).toFixed(2)} USD`);
  console.log(`Restored Rest. Bal:     $${(restoredRestaurant.balanceMinor / 100).toFixed(2)} USD`);
  assert.equal(restoredPlayer.balanceMinor, player.balanceMinor);
  assert.equal(restoredRestaurant.balanceMinor, restaurant.balanceMinor);

  console.log(`Historical Purchases:   ${restoredState.purchases.length}`);
  assert.equal(restoredState.purchases.length, 1);
  assert.equal(restoredState.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

  console.log(`Persisted Opportunities: ${(restoredState as any).opportunities ?? 'none (purely derived)'}`);
  assert.equal((restoredState as any).opportunities, undefined);

  console.log('\n================================================================');
  console.log('DEMONSTRATION COMPLETE: MILESTONE 24 VERIFIED SUCCESSFULLY');
  console.log('================================================================');
} finally {
  if (existsSync(demoPath)) {
    unlinkSync(demoPath);
  }
}
