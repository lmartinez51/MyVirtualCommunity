import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  enterBuilding,
  enterRestaurant,
  inspectCurrentLocation,
  WorldState,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  placeOrder,
  collectOrder,
  ORDER_PREPARATION_DURATION_MS,
} from '../src/core/order.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createPresentationModel } from '../src/client/projections.js';

describe('Milestone 52.1: Deferred Order Pickup Across Closure Lifecycle', () => {
  const RESTAURANT_ID = 'restaurant:development-restaurant';
  const BUILDING_ID = 'building:development-building';
  const PLAYER_ID = 'agent:dev-player';
  const COFFEE_OFFERING_ID = 'offering:development-coffee';

  function setupPlayerInRestaurant(timeIso: string = '2026-09-24T16:00:00.000Z'): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    enterBuilding(state, PLAYER_ID, BUILDING_ID);
    const enterRes = enterRestaurant(state, PLAYER_ID, RESTAURANT_ID);
    assert.strictEqual(enterRes.success, true);
    return { clock, state };
  }

  // 1. One pending READY order appears in projection
  it('1. One pending READY order appears in inspectCurrentLocation projection', () => {
    const { clock, state } = setupPlayerInRestaurant('2026-09-24T16:00:00.000Z');
    const sim = new Simulation(clock, state, { silent: true });

    const placeRes = placeOrder(state, {
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.strictEqual(placeRes.success, true);

    // Advance clock past preparation time and tick
    clock.advance(ORDER_PREPARATION_DURATION_MS);
    sim.tick();

    const inspection = inspectCurrentLocation(state, PLAYER_ID);
    assert.ok(inspection.pendingOrders);
    assert.strictEqual(inspection.pendingOrders.length, 1);
    assert.strictEqual(inspection.pendingOrders[0].id, placeRes.orderId);
    assert.strictEqual(inspection.pendingOrders[0].status, 'ready');
    assert.strictEqual(inspection.pendingOrders[0].restaurantId, RESTAURANT_ID);
    assert.strictEqual(inspection.pendingOrders[0].totalAmountMinor, 500);
    assert.strictEqual(inspection.pendingOrders[0].currency, 'USD');
  });

  // 2. Multiple pending orders are all preserved in projection
  it('2. Multiple pending orders (ready and preparing) are all preserved in projection', () => {
    const { clock, state } = setupPlayerInRestaurant();
    const sim = new Simulation(clock, state, { silent: true });

    // Order 1 at 16:00
    const order1 = placeOrder(state, {
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.strictEqual(order1.success, true);

    // Advance 5 minutes -> Order 1 ready
    clock.advance(ORDER_PREPARATION_DURATION_MS);
    sim.tick();

    // Order 2 placed at 16:05 -> preparing
    const order2 = placeOrder(state, {
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 2 }],
      fulfillmentMode: 'pickup',
    });
    assert.strictEqual(order2.success, true);

    const inspection = inspectCurrentLocation(state, PLAYER_ID);
    assert.ok(inspection.pendingOrders);
    assert.strictEqual(inspection.pendingOrders.length, 2);

    // Order 1 is ready
    const p1 = inspection.pendingOrders.find((o) => o.id === order1.orderId);
    assert.ok(p1);
    assert.strictEqual(p1.status, 'ready');

    // Order 2 is preparing
    const p2 = inspection.pendingOrders.find((o) => o.id === order2.orderId);
    assert.ok(p2);
    assert.strictEqual(p2.status, 'preparing');
  });

  // 3. Fulfilled orders are excluded
  it('3. Fulfilled orders are strictly excluded from pendingOrders projection', () => {
    const { clock, state } = setupPlayerInRestaurant();
    const sim = new Simulation(clock, state, { silent: true });

    const order1 = placeOrder(state, {
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    clock.advance(ORDER_PREPARATION_DURATION_MS);
    sim.tick();

    // Collect Order 1 -> fulfilled
    const collectRes = collectOrder(state, PLAYER_ID, order1.orderId!);
    assert.strictEqual(collectRes.success, true);

    const inspection = inspectCurrentLocation(state, PLAYER_ID);
    assert.ok(inspection.pendingOrders);
    assert.strictEqual(inspection.pendingOrders.length, 0);
  });

  // 4. Projection ordering is deterministic (createdAt ascending, id ascending)
  it('4. Projection ordering is deterministic by createdAt asc and id asc', () => {
    const { state } = setupPlayerInRestaurant();

    // Order with earlier timestamp
    state.orders.push({
      id: 'order:2',
      type: 'order',
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
      totalAmountMinor: 500,
      currency: 'USD',
      fulfillmentMode: 'pickup',
      status: 'ready',
      createdAt: '2026-09-24T16:05:00.000Z',
      readyAt: '2026-09-24T16:10:00.000Z',
      fulfilledAt: null,
      purchaseIds: ['purchase:2'],
      fulfilledItemIds: [],
    });

    state.orders.push({
      id: 'order:1',
      type: 'order',
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
      totalAmountMinor: 500,
      currency: 'USD',
      fulfillmentMode: 'pickup',
      status: 'ready',
      createdAt: '2026-09-24T16:00:00.000Z',
      readyAt: '2026-09-24T16:05:00.000Z',
      fulfilledAt: null,
      purchaseIds: ['purchase:1'],
      fulfilledItemIds: [],
    });

    const inspection = inspectCurrentLocation(state, PLAYER_ID);
    assert.ok(inspection.pendingOrders);
    assert.strictEqual(inspection.pendingOrders.length, 2);
    // order:1 placed at 16:00 must appear before order:2 placed at 16:05
    assert.strictEqual(inspection.pendingOrders[0].id, 'order:1');
    assert.strictEqual(inspection.pendingOrders[1].id, 'order:2');
  });

  // 5. Orders from different restaurants remain distinct
  it('5. Orders from different restaurants are preserved in projection with accurate restaurantId', () => {
    const { state } = setupPlayerInRestaurant();

    state.orders.push({
      id: 'order:1',
      type: 'order',
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
      totalAmountMinor: 500,
      currency: 'USD',
      fulfillmentMode: 'pickup',
      status: 'ready',
      createdAt: '2026-09-24T16:00:00.000Z',
      readyAt: '2026-09-24T16:05:00.000Z',
      fulfilledAt: null,
      purchaseIds: ['purchase:1'],
      fulfilledItemIds: [],
    });

    state.orders.push({
      id: 'order:2',
      type: 'order',
      customerId: PLAYER_ID,
      restaurantId: 'restaurant:second-restaurant',
      lines: [{ offeringId: 'offering:other', quantity: 1 }],
      totalAmountMinor: 400,
      currency: 'USD',
      fulfillmentMode: 'pickup',
      status: 'ready',
      createdAt: '2026-09-24T16:02:00.000Z',
      readyAt: '2026-09-24T16:07:00.000Z',
      fulfilledAt: null,
      purchaseIds: ['purchase:2'],
      fulfilledItemIds: [],
    });

    const inspection = inspectCurrentLocation(state, PLAYER_ID);
    assert.ok(inspection.pendingOrders);
    assert.strictEqual(inspection.pendingOrders.length, 2);
    assert.strictEqual(inspection.pendingOrders[0].restaurantId, RESTAURANT_ID);
    assert.strictEqual(inspection.pendingOrders[1].restaurantId, 'restaurant:second-restaurant');
  });

  // 6. Restaurant UI filters pending orders to the current restaurant
  it('6. Client presentation model preserves all pendingOrders, allowing UI context filtering by restaurantId', () => {
    const { state } = setupPlayerInRestaurant();
    state.orders.push(
      {
        id: 'order:1',
        type: 'order',
        customerId: PLAYER_ID,
        restaurantId: RESTAURANT_ID,
        lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
        totalAmountMinor: 500,
        currency: 'USD',
        fulfillmentMode: 'pickup',
        status: 'ready',
        createdAt: '2026-09-24T16:00:00.000Z',
        readyAt: '2026-09-24T16:05:00.000Z',
        fulfilledAt: null,
        purchaseIds: ['purchase:1'],
        fulfilledItemIds: [],
      },
      {
        id: 'order:2',
        type: 'order',
        customerId: PLAYER_ID,
        restaurantId: 'restaurant:other-venue',
        lines: [{ offeringId: 'offering:other', quantity: 1 }],
        totalAmountMinor: 600,
        currency: 'USD',
        fulfillmentMode: 'pickup',
        status: 'ready',
        createdAt: '2026-09-24T16:01:00.000Z',
        readyAt: '2026-09-24T16:06:00.000Z',
        fulfilledAt: null,
        purchaseIds: ['purchase:2'],
        fulfilledItemIds: [],
      }
    );

    const loc = inspectCurrentLocation(state, PLAYER_ID);
    const model = createPresentationModel(
      { activePlayerId: PLAYER_ID, worldTime: state.worldTime, schemaVersion: CURRENT_WORLD_STATE_VERSION },
      loc as unknown as Record<string, unknown>
    );

    assert.strictEqual(model.pendingOrders.length, 2);
    // Filter for current restaurant
    const currentVenueOrders = model.pendingOrders.filter((o) => o.restaurantId === model.locationId);
    assert.strictEqual(currentVenueOrders.length, 1);
    assert.strictEqual(currentVenueOrders[0].id, 'order:1');
  });

  // 7. Closure preserves a READY order
  // 7. Closure preserves a READY order
  it('7. Restaurant closure tick preserves a READY order in WorldState and perception', () => {
    const { clock, state } = setupPlayerInRestaurant('2026-09-24T22:40:00.000Z');
    const sim = new Simulation(clock, state, { silent: true });

    const orderRes = placeOrder(state, {
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.strictEqual(orderRes.success, true);

    // 16:45 local (22:45 UTC): Restaurant enters closing-soon
    clock.advance(5 * 60 * 1000);
    sim.tick();
    const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
    assert.strictEqual(rest.operationalState, 'closing-soon');

    // 16:50 local (22:50 UTC): Order becomes ready (preparation duration is 5 min)
    clock.advance(5 * 60 * 1000);
    sim.tick();
    const order = state.orders.find((o) => o.id === orderRes.orderId)!;
    assert.strictEqual(order.status, 'ready');

    // 17:00 local (23:00 UTC): Restaurant closes, egressing player
    clock.advance(10 * 60 * 1000);
    const tickResult = sim.tick();
    assert.strictEqual(rest.operationalState, 'closed');
    const player = state.agents.find((a) => a.id === PLAYER_ID)!;
    assert.strictEqual(player.locationId, BUILDING_ID);
    assert.ok(tickResult.closureEgressTransitions?.some((t) => t.agentId === PLAYER_ID));

    // Order status remains READY (not cancelled, not refunded, not expired)
    assert.strictEqual(order.status, 'ready');

    // Player outside in building lobby still perceives pending order via inspectCurrentLocation
    const inspection = inspectCurrentLocation(state, PLAYER_ID);
    assert.ok(inspection.pendingOrders);
    assert.strictEqual(inspection.pendingOrders.length, 1);
    assert.strictEqual(inspection.pendingOrders[0].id, orderRes.orderId);
    assert.strictEqual(inspection.pendingOrders[0].status, 'ready');
  });

  // 8. Reload/reconnect reconstructs the READY order from WorldState
  it('8. Reload/reconnect while restaurant closed reconstructs the READY order from persisted state', () => {
    const testDir = mkdtempSync(join(tmpdir(), 'm52-1-reload-'));
    try {
      const filePath = join(testDir, 'world-state.json');
      const persistence = new LocalFilePersistence(filePath);

      // Session 1: Place order and close restaurant
      const clock1 = WorldClock.create('2026-09-24T22:40:00.000Z');
      const state1 = createInitialWorldState(clock1);
      enterBuilding(state1, PLAYER_ID, BUILDING_ID);
      enterRestaurant(state1, PLAYER_ID, RESTAURANT_ID);
      const placeRes = placeOrder(state1, {
        customerId: PLAYER_ID,
        restaurantId: RESTAURANT_ID,
        lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      const sim1 = new Simulation(clock1, state1, { silent: true });
      clock1.advance(20 * 60 * 1000); // 17:00:00 local / 23:00:00.000Z
      sim1.tick();

      persistence.save(state1);

      // Session 2: Reload clean world from disk
      const loadedState = persistence.load();
      assert.ok(loadedState !== null);
      assert.strictEqual(loadedState.version, CURRENT_WORLD_STATE_VERSION);

      // Player is in building
      const playerLoaded = loadedState.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(playerLoaded.locationId, BUILDING_ID);

      // Order is ready
      const loadedOrder = loadedState.orders.find((o) => o.id === placeRes.orderId)!;
      assert.strictEqual(loadedOrder.status, 'ready');

      // Perception reconstruction from loaded state
      const inspection = inspectCurrentLocation(loadedState, PLAYER_ID);
      assert.ok(inspection.pendingOrders);
      assert.strictEqual(inspection.pendingOrders.length, 1);
      assert.strictEqual(inspection.pendingOrders[0].id, placeRes.orderId);
      assert.strictEqual(inspection.pendingOrders[0].status, 'ready');

      // Client presentation model reconstructs pendingOrders
      const model = createPresentationModel(
        { activePlayerId: PLAYER_ID, worldTime: loadedState.worldTime, schemaVersion: CURRENT_WORLD_STATE_VERSION },
        inspection as unknown as Record<string, unknown>
      );
      assert.strictEqual(model.pendingOrders.length, 1);
      assert.strictEqual(model.pendingOrders[0].id, placeRes.orderId);
      assert.strictEqual(model.pendingOrders[0].status, 'ready');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // 9. Restaurant reopening allows the player to see the READY order
  // 10. Collecting the order fulfills it and removes it from pending projection
  // 11. Existing M52 closure/egress behavior remains unchanged
  it('9-11 & Full Scenario: Day 1 (order placed -> ready -> closure -> egress) -> reload -> Day 2 (reopen -> enter -> collect -> fulfill)', () => {
    const testDir = mkdtempSync(join(tmpdir(), 'm52-1-integration-'));
    try {
      const filePath = join(testDir, 'world-state.json');
      const persistence = new LocalFilePersistence(filePath);

      // === DAY 1 ===
      // 16:40 local (22:40 UTC): Player at restaurant places pickup order for coffee ($5.00)
      const clock = WorldClock.create('2026-09-24T22:40:00.000Z');
      const state = createInitialWorldState(clock);
      enterBuilding(state, PLAYER_ID, BUILDING_ID);
      enterRestaurant(state, PLAYER_ID, RESTAURANT_ID);
      const sim = new Simulation(clock, state, { silent: true });

      const placeRes = placeOrder(state, {
        customerId: PLAYER_ID,
        restaurantId: RESTAURANT_ID,
        lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.strictEqual(placeRes.success, true);
      const orderId = placeRes.orderId!;

      // 16:45 local: Advance 5 min -> Restaurant enters closing-soon
      clock.advance(5 * 60 * 1000);
      sim.tick();
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      assert.strictEqual(rest.operationalState, 'closing-soon');

      // 16:50 local: Order becomes READY
      clock.advance(5 * 60 * 1000);
      sim.tick();
      const order = state.orders.find((o) => o.id === orderId)!;
      assert.strictEqual(order.status, 'ready');

      // 17:00 local: Restaurant closes; player is egressed to building lobby
      clock.advance(10 * 60 * 1000);
      const egressTick = sim.tick();
      assert.strictEqual(rest.operationalState, 'closed');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, BUILDING_ID);
      assert.ok(egressTick.closureEgressTransitions?.some((t) => t.agentId === PLAYER_ID));

      // Attempt premature collection while closed fails with restaurant-closed
      const prematureCollect = collectOrder(state, PLAYER_ID, orderId);
      assert.strictEqual(prematureCollect.success, false);
      assert.strictEqual(prematureCollect.code, 'restaurant-closed'); // Restaurant is closed

      // Persist world state to disk
      persistence.save(state);

      // === CLIENT RELOAD / DISCONNECT RECOVERY ===
      // Browser reloads; new session loads state from persistence
      const restoredState = persistence.load()!;
      validateWorldState(restoredState);
      const restoredPlayer = restoredState.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(restoredPlayer.locationId, BUILDING_ID);

      // Inspection in building confirms pending order is preserved
      const midInspection = inspectCurrentLocation(restoredState, PLAYER_ID);
      assert.strictEqual(midInspection.pendingOrders?.length, 1);
      assert.strictEqual(midInspection.pendingOrders![0].id, orderId);
      assert.strictEqual(midInspection.pendingOrders![0].status, 'ready');

      // === DAY 2: 09:00 REOPENING ===
      // Advance clock past night to 09:00:00 local next day (16 hours = 960 minutes)
      const clock2 = WorldClock.create(restoredState.worldTime);
      const sim2 = new Simulation(clock2, restoredState, { silent: true });
      clock2.advance(16 * 60 * 60 * 1000); // 2026-09-25T15:00:00.000Z
      sim2.tick();

      const reopenedRest = restoredState.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      assert.strictEqual(reopenedRest.operationalState, 'open');

      // Player re-enters restaurant
      const enterRes2 = enterRestaurant(restoredState, PLAYER_ID, RESTAURANT_ID);
      assert.strictEqual(enterRes2.success, true);
      assert.strictEqual(restoredPlayer.locationId, RESTAURANT_ID);

      // Inspection inside restaurant confirms order is ready for pickup
      const openInspection = inspectCurrentLocation(restoredState, PLAYER_ID);
      assert.strictEqual(openInspection.pendingOrders?.length, 1);
      assert.strictEqual(openInspection.pendingOrders![0].id, orderId);
      assert.strictEqual(openInspection.pendingOrders![0].status, 'ready');

      // Presentation model confirms restaurant context with pending order
      const clientModel = createPresentationModel(
        { activePlayerId: PLAYER_ID, worldTime: restoredState.worldTime, schemaVersion: CURRENT_WORLD_STATE_VERSION },
        openInspection as unknown as Record<string, unknown>
      );
      assert.strictEqual(clientModel.context, 'RESTAURANT');
      assert.strictEqual(clientModel.pendingOrders.length, 1);
      assert.strictEqual(clientModel.pendingOrders[0].id, orderId);
      assert.strictEqual(clientModel.pendingOrders[0].status, 'ready');

      // Player collects the deferred order!
      const finalCollect = collectOrder(restoredState, PLAYER_ID, orderId);
      assert.strictEqual(finalCollect.success, true);
      assert.strictEqual(finalCollect.code, 'success');

      // Item materialized into player inventory
      assert.strictEqual(restoredState.items.length, 1);
      assert.strictEqual(restoredState.items[0].ownerAgentId, PLAYER_ID);
      assert.strictEqual(restoredState.items[0].offeringId, COFFEE_OFFERING_ID);
      assert.strictEqual(restoredState.items[0].status, 'available');

      // Order is now fulfilled in world state
      const fulfilledOrder = restoredState.orders.find((o) => o.id === orderId)!;
      assert.strictEqual(fulfilledOrder.status, 'fulfilled');
      assert.ok(fulfilledOrder.fulfilledAt);

      // Subsequent inspection projection strictly EXCLUDES the fulfilled order
      const postCollectInspection = inspectCurrentLocation(restoredState, PLAYER_ID);
      assert.strictEqual(postCollectInspection.pendingOrders?.length, 0);

      // Final persistence check
      persistence.save(restoredState);
      const finalState = persistence.load()!;
      validateWorldState(finalState);
      assert.strictEqual(finalState.orders[0].status, 'fulfilled');
      assert.strictEqual(finalState.items.length, 1);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // 12. Non-FIFO fulfillment: Presentation ordering is NOT an execution queue
  it('12. Deterministic presentation ordering does NOT enforce FIFO fulfillment (later order collectible first)', () => {
    const { clock, state } = setupPlayerInRestaurant();
    const sim = new Simulation(clock, state, { silent: true });

    // Place Order 1 at 16:00
    const order1 = placeOrder(state, {
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.strictEqual(order1.success, true);

    // Advance 1 min and place Order 2 at 16:01
    clock.advance(60 * 1000);
    const order2 = placeOrder(state, {
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 2 }],
      fulfillmentMode: 'pickup',
    });
    assert.strictEqual(order2.success, true);

    // Advance 5 minutes past Order 2's readyAt -> both orders are now ready
    clock.advance(5 * 60 * 1000);
    sim.tick();

    // Verify presentation ordering: Order 1 (index 0) before Order 2 (index 1)
    const inspectionBefore = inspectCurrentLocation(state, PLAYER_ID);
    assert.strictEqual(inspectionBefore.pendingOrders?.length, 2);
    assert.strictEqual(inspectionBefore.pendingOrders![0].id, order1.orderId);
    assert.strictEqual(inspectionBefore.pendingOrders![1].id, order2.orderId);

    // Non-FIFO fulfillment: Collect Order 2 FIRST
    const collect2 = collectOrder(state, PLAYER_ID, order2.orderId!);
    assert.strictEqual(collect2.success, true);
    assert.strictEqual(collect2.code, 'success');

    // Verify WorldState: Order 2 is fulfilled, Order 1 remains ready
    const worldOrder1 = state.orders.find((o) => o.id === order1.orderId)!;
    const worldOrder2 = state.orders.find((o) => o.id === order2.orderId)!;
    assert.strictEqual(worldOrder1.status, 'ready');
    assert.strictEqual(worldOrder2.status, 'fulfilled');

    // Subsequent projection contains ONLY unfulfilled Order 1
    const inspectionAfter = inspectCurrentLocation(state, PLAYER_ID);
    assert.strictEqual(inspectionAfter.pendingOrders?.length, 1);
    assert.strictEqual(inspectionAfter.pendingOrders![0].id, order1.orderId);
    assert.strictEqual(inspectionAfter.pendingOrders![0].status, 'ready');

    // Finally collect Order 1
    const collect1 = collectOrder(state, PLAYER_ID, order1.orderId!);
    assert.strictEqual(collect1.success, true);
    assert.strictEqual(inspectCurrentLocation(state, PLAYER_ID).pendingOrders?.length, 0);
  });

  // 13. Multi-restaurant isolation: collect action for Restaurant B is rejected when player is at Restaurant A
  it('13. Multi-restaurant isolation: collection for Restaurant B is rejected with customer-not-co-located when at Restaurant A', () => {
    const { clock, state } = setupPlayerInRestaurant();

    // Order at current restaurant (RESTAURANT_ID)
    const orderA = placeOrder(state, {
      customerId: PLAYER_ID,
      restaurantId: RESTAURANT_ID,
      lines: [{ offeringId: COFFEE_OFFERING_ID, quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.strictEqual(orderA.success, true);

    // Inject ready order at a different restaurant
    const OTHER_RESTAURANT_ID = 'restaurant:other-venue';
    state.orders.push({
      id: 'order:other',
      type: 'order',
      customerId: PLAYER_ID,
      restaurantId: OTHER_RESTAURANT_ID,
      lines: [{ offeringId: 'offering:other', quantity: 1 }],
      totalAmountMinor: 300,
      currency: 'USD',
      fulfillmentMode: 'pickup',
      status: 'ready',
      createdAt: '2026-09-24T16:00:00.000Z',
      readyAt: '2026-09-24T16:05:00.000Z',
      fulfilledAt: null,
      purchaseIds: ['purchase:other'],
      fulfilledItemIds: [],
    });

    // Make Order A ready
    const orderAEntity = state.orders.find((o) => o.id === orderA.orderId)!;
    orderAEntity.status = 'ready';

    // Player is inside RESTAURANT_ID
    assert.strictEqual(state.agents.find((a) => a.id === PLAYER_ID)!.locationId, RESTAURANT_ID);

    // Attempting to collect Order B from OTHER_RESTAURANT_ID fails domain check: customer-not-co-located
    const collectOther = collectOrder(state, PLAYER_ID, 'order:other');
    assert.strictEqual(collectOther.success, false);
    assert.strictEqual(collectOther.code, 'customer-not-co-located');

    // Collecting Order A from current restaurant succeeds
    const collectA = collectOrder(state, PLAYER_ID, orderA.orderId!);
    assert.strictEqual(collectA.success, true);
    assert.strictEqual(collectA.code, 'success');
  });
});

