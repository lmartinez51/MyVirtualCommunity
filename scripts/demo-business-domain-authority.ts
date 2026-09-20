import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  transitionRestaurantOperationalState,
  isRestaurantOpen,
  validateBusinessAuthority,
  enterRestaurant,
  purchaseOffering,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 36: BUSINESS DOMAIN AUTHORITY (AUD-02)');
console.log('================================================================\n');

const demoPersistenceFile = join(
  tmpdir(),
  `demo-m36-business-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
);

try {
  // === STEP 1: World Bootstrap & Business Domain Inspection ===
  console.log('=== STEP 1: World Bootstrap & Business Domain Substrate ===');
  const clock = WorldClock.create('2026-09-14T08:00:00.000Z'); // 08:00 UTC -> closed
  const state = createInitialWorldState(clock);
  validateWorldState(state);

  const restaurantId = 'restaurant:development-restaurant';
  const restaurant = state.restaurants.find((r) => r.id === restaurantId)!;
  const player = state.agents.find((a) => a.agentType === 'player')!;

  console.log(`[STATE] World Time:        ${state.worldTime}`);
  console.log(`[STATE] Restaurant ID:     ${restaurant.id}`);
  console.log(`[STATE] Operational State: ${restaurant.operationalState}`);
  console.log(`[STATE] Operational Since: ${restaurant.operationalSince}`);
  console.log(`[STATE] Balance:           ${restaurant.balanceMinor} ${restaurant.currency}`);
  console.log(`[STATE] Offerings Count:   ${state.offerings.length}`);
  console.log(`[QUERY] isRestaurantOpen:  ${isRestaurantOpen(state, restaurantId)}\n`);

  assert.equal(restaurant.operationalState, 'closed');
  assert.equal(isRestaurantOpen(state, restaurantId), false);

  // === STEP 2: Cross-Domain Precondition Checks on Closed Venue ===
  console.log('=== STEP 2: Precondition Rejection on Closed Venue ===');
  player.locationId = 'building:development-building';

  console.log('[ACTION] Player attempts to enter closed restaurant...');
  const enterClosedResult = enterRestaurant(state, player.id, restaurantId);
  console.log(`[RESULT] Success: ${enterClosedResult.success}, Code: "${enterClosedResult.code}"`);
  assert.equal(enterClosedResult.success, false);
  assert.equal(enterClosedResult.code, 'restaurant-closed');
  assert.equal(player.locationId, 'building:development-building'); // Agent remains in building

  console.log('[ACTION] Attempting purchase while closed...');
  player.locationId = restaurantId; // Place agent inside for test
  const purchaseClosedResult = purchaseOffering(state, player.id, 'offering:development-coffee', restaurantId);
  console.log(`[RESULT] Success: ${purchaseClosedResult.success}, Code: "${purchaseClosedResult.code}"`);
  assert.equal(purchaseClosedResult.success, false);
  assert.equal(purchaseClosedResult.code, 'restaurant-closed');
  console.log('[SPATIAL & ECONOMY] Entry and purchases successfully blocked by Business authority.\n');

  // Reset player location
  player.locationId = 'building:development-building';

  // === STEP 3: Authoritative Operational Transition (Closed -> Open) ===
  console.log('=== STEP 3: Authoritative Operational Transition (Closed -> Open) ===');
  const openTime = '2026-09-14T09:00:00.000Z';
  state.worldTime = openTime;

  console.log(`[ACTION] Transitioning operational state to 'open' at ${openTime}...`);
  const openTransition = transitionRestaurantOperationalState(state, restaurantId, 'open', openTime);

  console.log(`[TRANSITION RESULT] Success: ${openTransition.success}, Code: "${openTransition.code}"`);
  console.log(`[TRANSITION RESULT] Changed: ${openTransition.changed}`);
  console.log(`[TRANSITION RESULT] State:   ${openTransition.previousState} -> ${openTransition.newState}`);
  console.log(`[TRANSITION RESULT] Since:   ${openTransition.operationalSince}`);

  assert.equal(openTransition.success, true);
  assert.equal(openTransition.changed, true);
  assert.equal(restaurant.operationalState, 'open');
  assert.equal(isRestaurantOpen(state, restaurantId), true);
  console.log(`[QUERY] isRestaurantOpen: ${isRestaurantOpen(state, restaurantId)}\n`);

  // === STEP 4: Cross-Domain Operations Succeed When Open ===
  console.log('=== STEP 4: Cross-Domain Operations Authorize Successfully ===');
  console.log('[ACTION] Player enters open restaurant...');
  const enterOpenResult = enterRestaurant(state, player.id, restaurantId);
  assert.equal(enterOpenResult.success, true);
  assert.equal(player.locationId, restaurantId);
  console.log(`[SPATIAL] Player successfully entered: ${player.locationId}`);

  console.log('[ACTION] Player purchases coffee ($5.00 USD)...');
  player.balanceMinor = 1000;
  const initialRestBalance = restaurant.balanceMinor;
  const purchaseOpenResult = purchaseOffering(state, player.id, 'offering:development-coffee', restaurantId);
  assert.equal(purchaseOpenResult.success, true);
  assert.equal(player.balanceMinor, 500);
  assert.equal(restaurant.balanceMinor, initialRestBalance + 500);
  console.log(`[ECONOMY] Purchase succeeded! Player balance: $${player.balanceMinor / 100}, Restaurant balance: $${restaurant.balanceMinor / 100}\n`);

  // === STEP 5: Strict Domain Isolation Verification ===
  console.log('=== STEP 5: Strict Domain Isolation Verification ===');
  const closeTime = '2026-09-14T17:00:00.000Z';
  state.worldTime = closeTime;

  const preCloseLocation = player.locationId;
  const preClosePlayerBalance = player.balanceMinor;
  const preCloseRestBalance = restaurant.balanceMinor;
  const preCloseKnowledgeCount = state.knowledge.length;

  console.log(`[ACTION] Transitioning operational state to 'closed' at ${closeTime}...`);
  const closeTransition = transitionRestaurantOperationalState(state, restaurantId, 'closed', closeTime);
  assert.equal(closeTransition.success, true);
  assert.equal(restaurant.operationalState, 'closed');

  // Verify non-mutation of foreign domain state
  assert.equal(player.locationId, preCloseLocation);
  assert.equal(player.balanceMinor, preClosePlayerBalance);
  assert.equal(restaurant.balanceMinor, preCloseRestBalance);
  assert.equal(state.knowledge.length, preCloseKnowledgeCount);

  console.log('[ISOLATION] Customer location preserved (no teleportation/forced eviction): PASS');
  console.log('[ISOLATION] Financial balances untouched by business transition:            PASS');
  console.log('[ISOLATION] Agent knowledge untainted by direct state mutation:             PASS\n');

  // === STEP 6: Invariant Validation & Persistence Roundtrip ===
  console.log('=== STEP 6: Invariant Validation & Persistence ===');
  validateBusinessAuthority(state);
  console.log('[INVARIANTS] validateBusinessAuthority: PASS');

  const persistence = new LocalFilePersistence(demoPersistenceFile);
  persistence.save(state);
  const loaded = persistence.load();
  assert.ok(loaded);
  assert.equal(loaded.restaurants[0].operationalState, 'closed');
  validateWorldState(loaded);
  console.log('[PERSISTENCE] WorldState saved and reconstructed cleanly: PASS\n');

  console.log('================================================================');
  console.log('MILESTONE 36 DEMO COMPLETE: BUSINESS DOMAIN AUTHORITY VERIFIED');
  console.log('================================================================');
} finally {
  if (existsSync(demoPersistenceFile)) {
    unlinkSync(demoPersistenceFile);
  }
}
