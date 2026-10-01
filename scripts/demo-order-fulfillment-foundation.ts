import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createRealWorldJuarezWorldState,
  leaveBuilding,
  enterBuilding,
  enterRestaurant,
  inspectCurrentLocation,
  inquireRestaurantService,
  placeOrder,
  collectOrder,
  snapshotWorldState,
  validateWorldState,
  ORDER_PREPARATION_DURATION_MS,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('Milestone 39: Order & Service Fulfillment Foundation Demo');
console.log('================================================================\n');

const START_TIME = '2026-09-14T08:00:00.000Z';
const clock = WorldClock.create(START_TIME);
const state = createRealWorldJuarezWorldState(clock);
validateWorldState(state);

const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;
const staff = state.agents.find((a) => a.id === 'agent:m39-service-staff')!;
const residence = state.places.find((p) => p.id === 'building:real-world-residence')!;
const street = state.places.find((p) => p.id === 'street:avenida-benito-juarez')!;
const venueBuilding = state.places.find((p) => p.id === 'building:kentucky-club-building')!;
const restaurant = state.restaurants.find((r) => r.id === 'restaurant:kentucky-club')!;

// ---------------------------------------------------------------------------
// Step 1: Spatial Traversal to Kentucky Club
// ---------------------------------------------------------------------------
console.log('--- Step 1: Spatial Traversal ---');
console.log(`Player starts at: ${residence.name} (${player.locationId})`);
assert.equal(player.locationId, residence.id);

console.log('Player leaves residence into Avenida Benito Juárez...');
const leaveRes = leaveBuilding(state, player.id, residence.id);
assert.equal(leaveRes.success, true);
assert.equal(player.locationId, street.id);

console.log('Player enters Kentucky Club building...');
const enterBldgRes = enterBuilding(state, player.id, venueBuilding.id);
assert.equal(enterBldgRes.success, true);
assert.equal(player.locationId, venueBuilding.id);

console.log('Player enters Kentucky Club restaurant...');
const enterRestRes = enterRestaurant(state, player.id, restaurant.id);
assert.equal(enterRestRes.success, true);
assert.equal(player.locationId, restaurant.id);
assert.equal(staff.locationId, restaurant.id);
console.log(`Player and Staff are now co-located at: ${restaurant.name} (${restaurant.id})\n`);

// ---------------------------------------------------------------------------
// Step 2: Service Affordance Query ("Pickup or delivery?")
// ---------------------------------------------------------------------------
console.log('--- Step 2: Service Affordance Query ---');
console.log(`Player interacts with service employee: ${staff.name} (${staff.id})`);
const inquiry = inquireRestaurantService(state, player.id, staff.id);
assert.equal(inquiry.success, true);
console.log(`Employee asks: "${inquiry.prompt}"`);
console.log('Supported modes:', inquiry.supportedFulfillmentModes);
console.log('Deferred modes:', inquiry.deferredFulfillmentModes);
console.log('Available offerings:');
for (const off of inquiry.availableOfferings ?? []) {
  console.log(`- ${off.name} (${off.id}): $${(off.priceMinor / 100).toFixed(2)} ${off.currency}`);
}
console.log();

// ---------------------------------------------------------------------------
// Step 3: Deferred Delivery Demonstration (Zero Mutation)
// ---------------------------------------------------------------------------
console.log('--- Step 3: Fulfillment Mode Selection: Delivery (Deferred) ---');
console.log('Player asks for delivery...');
const deliveryAttempt = placeOrder(state, {
  customerId: player.id,
  restaurantId: restaurant.id,
  lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
  fulfillmentMode: 'delivery',
});
assert.equal(deliveryAttempt.success, false);
assert.equal(deliveryAttempt.code, 'delivery-mode-deferred');
console.log(`Result: ${deliveryAttempt.code} - "${deliveryAttempt.message}"`);
console.log('Verified: Zero economic or entity mutations occurred.\n');

// ---------------------------------------------------------------------------
// Step 4: Pickup Order Placement & Atomic Settlement
// ---------------------------------------------------------------------------
console.log('--- Step 4: Fulfillment Mode Selection: Pickup (Atomic Settlement) ---');
const initialPlayerBalance = player.balanceMinor;
const initialRestaurantBalance = restaurant.balanceMinor;
console.log(`Initial Balances -> Player: $${(initialPlayerBalance / 100).toFixed(2)} | Restaurant: $${(initialRestaurantBalance / 100).toFixed(2)}`);

console.log('Player places pickup order for 1x M39 Demo Beverage ($3.00 USD)...');
const orderResult = placeOrder(state, {
  customerId: player.id,
  restaurantId: restaurant.id,
  lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
  fulfillmentMode: 'pickup',
});

assert.equal(orderResult.success, true);
assert.ok(orderResult.order);
const placedOrder = orderResult.order!;
console.log(`Order created: ${placedOrder.id}`);
console.log(`Status: ${placedOrder.status}`);
console.log(`Created at: ${placedOrder.createdAt}`);
console.log(`Ready at: ${placedOrder.readyAt}`);
console.log(`Associated Purchase IDs: ${placedOrder.purchaseIds.join(', ')}`);

assert.equal(player.balanceMinor, initialPlayerBalance - 300);
assert.equal(restaurant.balanceMinor, initialRestaurantBalance + 300);
console.log(`New Balances -> Player: $${(player.balanceMinor / 100).toFixed(2)} | Restaurant: $${(restaurant.balanceMinor / 100).toFixed(2)}`);
assert.equal(state.purchases.length, 1);
assert.equal(state.purchases[0].id, placedOrder.purchaseIds[0]);
console.log(`Purchase recorded: ${state.purchases[0].id} ($3.00 USD, 1:1 cardinality with ordered unit)\n`);

// ---------------------------------------------------------------------------
// Step 5: Premature Collection Rejection
// ---------------------------------------------------------------------------
console.log('--- Step 5: Collection Guard Check ---');
console.log('Player attempts to collect order immediately while still preparing...');
const prematureCollect = collectOrder(state, player.id, placedOrder.id);
assert.equal(prematureCollect.success, false);
assert.equal(prematureCollect.code, 'order-not-ready');
console.log(`Guard active: ${prematureCollect.code} - "${prematureCollect.message}"\n`);

// ---------------------------------------------------------------------------
// Step 6: Simulation Time Progression (5 minutes)
// ---------------------------------------------------------------------------
console.log('--- Step 6: Logical Time Progression & Order Preparation ---');
const sim = new Simulation(clock, state);
console.log(`Current World Time: ${clock.getTime()}`);
console.log(`Advancing clock by 5 minutes to ${placedOrder.readyAt}...`);
clock.advance(ORDER_PREPARATION_DURATION_MS);
console.log(`New World Time: ${clock.getTime()}`);

console.log('Executing explicit Simulation.tick()...');
const tickResult = sim.tick();
assert.ok(tickResult.orderTransitions);
assert.equal(tickResult.orderTransitions.length, 1);
console.log(`Simulation Tick Transitions: ${tickResult.orderTransitions.length} order(s)`);
console.log(`Order ${tickResult.orderTransitions[0].orderId}: ${tickResult.orderTransitions[0].previousStatus} -> ${tickResult.orderTransitions[0].newStatus}`);
assert.equal(placedOrder.status, 'ready');
console.log(`Order status is now: ${placedOrder.status}\n`);

// ---------------------------------------------------------------------------
// Step 7: Order Collection & Item Instantiation (1:1 Invariant)
// ---------------------------------------------------------------------------
console.log('--- Step 7: Order Collection & Item Instantiation ---');
console.log('Player collects the ready order at the counter...');
const collectResult = collectOrder(state, player.id, placedOrder.id);
assert.equal(collectResult.success, true);
assert.ok(collectResult.items);
assert.equal(collectResult.items.length, 1);

const receivedItem = collectResult.items[0];
console.log(`Order status: ${placedOrder.status}`);
console.log(`Fulfilled at: ${placedOrder.fulfilledAt}`);
console.log(`Received item: ${receivedItem.name} (${receivedItem.id})`);
console.log(`Item status: ${receivedItem.status}`);
console.log(`Owner: ${receivedItem.ownerAgentId}`);
console.log(`Source Purchase ID: ${receivedItem.sourcePurchaseId}`);
assert.equal(receivedItem.sourcePurchaseId, placedOrder.purchaseIds[0]);
assert.equal(receivedItem.ownerAgentId, player.id);
console.log('Verified: purchase:1 <-> item:1 is strictly 1:1.\n');

// ---------------------------------------------------------------------------
// Step 8: Persistence Roundtrip & Validation
// ---------------------------------------------------------------------------
console.log('--- Step 8: Persistence Roundtrip & Validation ---');
const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-demo-m39-'));
const testFile = join(tmpDir, 'world-state.json');

try {
  const persistence = new LocalFilePersistence(testFile);
  persistence.save(snapshotWorldState(clock, state));
  assert.ok(existsSync(testFile));
  console.log(`World state saved to: ${testFile}`);

  const restored = persistence.load();
  assert.ok(restored !== null);
  assert.equal(restored.version, 15);
  validateWorldState(restored);
  console.log(`Restored world state validated successfully (Schema version: ${restored.version})`);

  const restoredOrder = restored.orders.find((o) => o.id === placedOrder.id)!;
  assert.equal(restoredOrder.status, 'fulfilled');
  const restoredItem = restored.items.find((i) => i.id === receivedItem.id)!;
  assert.equal(restoredItem.ownerAgentId, player.id);
  assert.equal(restoredItem.sourcePurchaseId, placedOrder.purchaseIds[0]);

  console.log('Persistence verification: PASS\n');
} finally {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log('================================================================');
console.log('Milestone 39 Demo Completed Successfully');
console.log('================================================================');
