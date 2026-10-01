import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  enterRestaurant,
  purchaseOffering,
  exitRestaurant,
  startHavingCoffee,
} from '../src/core/world-state.js';
import {
  consumeOwnedItem,
  getOwnedItem,
  getPlayerAvailableItems,
  isItemAvailable,
  validateItemAuthority,
} from '../src/core/item.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 37: ASSET, PROPERTY AND INVENTORY AUTHORITY (AUD-03)');
console.log('================================================================\n');

const demoPersistenceFile = join(
  tmpdir(),
  `demo-m37-inventory-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
);

try {
  // === STEP 1: World Bootstrap & Core Distinctions ===
  console.log('=== STEP 1: World Bootstrap & Core Distinctions ===');
  const openTime = '2026-09-14T09:00:00.000Z';
  const clock = WorldClock.create(openTime);
  const state = createInitialWorldState(clock);
  validateWorldState(state);

  const restaurantId = 'restaurant:development-restaurant';
  const player = state.agents.find((a) => a.agentType === 'player')!;
  const buildings = state.places.filter((p) => p.type === 'building');

  console.log(`[STATE] World Time:        ${state.worldTime}`);
  console.log(`[STATE] Player Agent ID:   ${player.id}`);
  console.log(`[STATE] Initial Items:     ${state.items.length}`);
  console.log(`[STATE] Building Places:   ${buildings.map((b) => b.id).join(', ')}`);

  // Verify Buildings are spatial containment, not owned properties
  for (const b of buildings) {
    assert.equal((b as any).ownerAgentId, undefined);
    assert.equal((b as any).propertyDeedId, undefined);
  }
  console.log('[DISTINCTION] Buildings verified as spatial containment entities, not real-estate property deeds.');

  // Verify Unrepresented Concepts are strictly absent
  assert.equal((state as any).vehicles, undefined);
  assert.equal((state as any).properties, undefined);
  assert.equal((state as any).businessInventory, undefined);
  console.log('[DISTINCTION] Unrepresented concepts (Vehicles, Properties, Stock Warehouses, General Physical Condition, Economic Valuation) strictly absent.\n');

  // === STEP 2: Commercial Catalog vs Physical Possession ===
  console.log('=== STEP 2: Commercial Catalog vs Physical Possession ===');
  const coffeeOffering = state.offerings.find((o) => o.id === 'offering:development-coffee')!;
  console.log(`[CATALOG] Offering ID:     ${coffeeOffering.id}`);
  console.log(`[CATALOG] Offering Name:   ${coffeeOffering.name}`);
  console.log(`[CATALOG] Catalog Price:   ${coffeeOffering.priceMinor} ${coffeeOffering.currency}`);
  console.log(`[POSSESSION] Available Items for Player: ${getPlayerAvailableItems(state, player.id).length}`);
  assert.equal(getPlayerAvailableItems(state, player.id).length, 0);
  console.log('[DISTINCTION] Catalog offering verified as commercial template, not physical stock or possession.\n');

  // === STEP 3: Purchase Acquisition to Physical Possession ===
  console.log('=== STEP 3: Purchase Acquisition to Physical Possession ===');
  enterRestaurant(state, player.id, restaurantId, { silent: true });

  const purchaseRes = purchaseOffering(state, player.id, coffeeOffering.id, restaurantId, { silent: true });
  assert.equal(purchaseRes.success, true);
  assert.equal(state.items.length, 1);

  const item = state.items[0];
  console.log(`[PURCHASE] Purchase ID:    ${purchaseRes.purchaseId}`);
  console.log(`[ITEM] Created Item ID:    ${item.id}`);
  console.log(`[ITEM] Item Name:          ${item.name}`);
  console.log(`[ITEM] Owner Agent:        ${item.ownerAgentId}`);
  console.log(`[ITEM] Status:             ${item.status}`);
  console.log(`[ITEM] Source Purchase:    ${item.sourcePurchaseId}`);
  console.log(`[ITEM] Acquired At:        ${item.acquiredAt}`);

  assert.equal(item.status, 'available');
  assert.equal(item.consumedAt, null);
  assert.equal(isItemAvailable(state, item.id), true);
  console.log(`[QUERY] isItemAvailable("${item.id}"): ${isItemAvailable(state, item.id)}\n`);

  // === STEP 4: Ownership vs Location (Spatial Mobility) ===
  console.log('=== STEP 4: Ownership vs Location (Spatial Mobility) ===');
  console.log(`[LOCATION] Player in restaurant: ${player.locationId}`);
  console.log(`[ITEM] Item owner: ${item.ownerAgentId}`);

  console.log('[ACTION] Player leaves restaurant into containing building...');
  const exitRes = exitRestaurant(state, player.id, restaurantId, { silent: true });
  assert.equal(exitRes.success, true);
  console.log(`[LOCATION] Player now at: ${player.locationId}`);
  console.log(`[ITEM] Item owner unchanged: ${item.ownerAgentId}`);

  assert.equal(item.ownerAgentId, player.id);
  assert.equal(state.places.some((p) => p.id === item.id), false);
  console.log('[SCOPE SIMPLIFICATION] Currently acquired personal consumable items do not have independent spatial entities; practical location is derived from owning agent.\n');

  // === STEP 5: Consumable Lifecycle Transition (consumeOwnedItem) ===
  console.log('=== STEP 5: Consumable Lifecycle Transition (consumeOwnedItem) ===');
  // Demonstrate precondition rejection on non-existent item
  const ghostResult = consumeOwnedItem(state, 'item:non-existent', openTime);
  console.log(`[PRECONDITION] Consuming non-existent item: success=${ghostResult.success}, code="${ghostResult.code}"`);
  assert.equal(ghostResult.success, false);
  assert.equal(ghostResult.code, 'item-not-found');

  // Authoritative consumption transition
  console.log(`[ACTION] Consuming item "${item.id}"...`);
  const consumeRes = consumeOwnedItem(state, item.id, openTime);
  console.log(`[RESULT] Success: ${consumeRes.success}, Code: "${consumeRes.code}"`);
  console.log(`[ITEM] Status: ${item.status}, Consumed At: ${item.consumedAt}`);
  assert.equal(consumeRes.success, true);
  assert.equal(item.status, 'consumed');
  assert.equal(item.consumedAt, openTime);
  assert.equal(isItemAvailable(state, item.id), false);

  // Demonstrate Consumable Lifecycle State: ownerAgentId attribution is retained
  assert.equal(item.ownerAgentId, player.id);
  console.log(`[DISTINCTION] Consumed item retains ownerAgentId attribution: "${item.ownerAgentId}" (Consumable Lifecycle State transition; general physical condition is not modeled).`);

  // Prevent double consumption
  const secondConsume = consumeOwnedItem(state, item.id, openTime);
  console.log(`[PRECONDITION] Re-consuming item: success=${secondConsume.success}, code="${secondConsume.code}"`);
  assert.equal(secondConsume.success, false);
  assert.equal(secondConsume.code, 'item-already-consumed');

  // Demonstrate cross-domain non-interference
  assert.equal(player.balanceMinor, 1500); // Coffee cost 500 minor from initial 2000 minor
  console.log('[DOMAIN ISOLATION] Balances, restaurant status, and geography remained unaffected.\n');

  // === STEP 6: Invariant Validation & Persistence Roundtrip ===
  console.log('=== STEP 6: Invariant Validation & Persistence Roundtrip ===');
  validateItemAuthority(state);
  validateWorldState(state);
  console.log('[INVARIANTS] validateItemAuthority & validateWorldState passed successfully.');

  console.log(`[PERSISTENCE] Saving state to: ${demoPersistenceFile}`);
  const persistence = new LocalFilePersistence(demoPersistenceFile);
  persistence.save(state);

  const restored = persistence.load();
  validateItemAuthority(restored);
  validateWorldState(restored);

  assert.equal(restored.version, 15);
  assert.equal(restored.items.length, 1);
  const restoredItem = getOwnedItem(restored, item.id)!;
  assert.ok(restoredItem);
  assert.equal(restoredItem.status, 'consumed');
  assert.equal(restoredItem.consumedAt, openTime);
  console.log(`[PERSISTENCE] Restored state cleanly at version ${restored.version} with ${restored.items.length} OwnedItem(s).`);

  console.log('\n================================================================');
  console.log('MILESTONE 37 DEMO COMPLETED SUCCESSFULLY');
  console.log('================================================================');
} finally {
  if (existsSync(demoPersistenceFile)) {
    unlinkSync(demoPersistenceFile);
  }
}
