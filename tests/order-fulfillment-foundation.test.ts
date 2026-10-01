import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createRealWorldJuarezWorldState,
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  leaveBuilding,
  enterBuilding,
  enterRestaurant,
  placeOrder,
  collectOrder,
  inquireRestaurantService,
  getCustomerOrders,
  getRestaurantOrders,
  validateOrderAuthority,
  ORDER_PREPARATION_DURATION_MS,
  OrderWorldState,
  Order,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 39: Order & Service Fulfillment Foundation', () => {
  const START_TIME = '2026-09-14T08:00:00.000Z';

  function setupKentuckyClubWorld() {
    const clock = WorldClock.create(START_TIME);
    const state = createRealWorldJuarezWorldState(clock);
    const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;

    // Navigate player to Kentucky Club
    leaveBuilding(state, player.id, 'building:real-world-residence');
    enterBuilding(state, player.id, 'building:kentucky-club-building');
    enterRestaurant(state, player.id, 'restaurant:kentucky-club');

    return { clock, state, player };
  }

  // =========================================================================
  // 1. Service Inquiry: "Pickup or delivery?"
  // =========================================================================
  describe('1. Service Inquiry (inquireRestaurantService)', () => {
    it('returns available offerings, staff presence, and prompt when customer is co-located', () => {
      const { state, player } = setupKentuckyClubWorld();

      const result = inquireRestaurantService(state, player.id, 'agent:m39-service-staff');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.code, 'success');
      assert.strictEqual(result.prompt, 'Pickup or delivery?');
      assert.strictEqual(result.supportedModes.includes('pickup'), true);
      assert.strictEqual(result.supportedModes.includes('delivery'), true);
      assert.strictEqual(result.staffAgentId, 'agent:m39-service-staff');
      assert.strictEqual(result.offerings.length, 1);
      assert.strictEqual(result.offerings[0].id, 'offering:m39-demo-beverage');
      assert.strictEqual(result.offerings[0].priceMinor, 300);
    });

    it('fails when customer is not co-located with staff', () => {
      const clock = WorldClock.create(START_TIME);
      const state = createRealWorldJuarezWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;

      // Player is still at residence
      const result = inquireRestaurantService(state, player.id, 'agent:m39-service-staff');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agents-not-co-located');
    });

    it('fails when service staff is not co-located at restaurant', () => {
      const { state, player } = setupKentuckyClubWorld();
      const staff = state.agents.find((a) => a.id === 'agent:m39-service-staff')!;
      staff.locationId = 'street:avenida-benito-juarez'; // Move staff away

      const result = inquireRestaurantService(state, player.id, 'agent:m39-service-staff');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agents-not-co-located');
    });
  });

  // =========================================================================
  // 2. Order Placement & Atomic Settlement (placeOrder)
  // =========================================================================
  describe('2. Order Placement & Atomic Settlement (placeOrder)', () => {
    it('places order for pickup, debits funds, credits restaurant, and creates PurchaseRecords (1:1 cardinality)', () => {
      const { state, player } = setupKentuckyClubWorld();
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:kentucky-club')!;

      const initialPlayerBalance = player.balanceMinor;
      const initialRestaurantBalance = restaurant.balanceMinor;

      const placeResult = placeOrder(state, {
        customerId: player.id,
        restaurantId: restaurant.id,
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 2 }],
        fulfillmentMode: 'pickup',
      });

      assert.strictEqual(placeResult.success, true);
      assert.strictEqual(placeResult.code, 'success');
      assert.ok(placeResult.orderId);
      assert.strictEqual(placeResult.totalAmountMinor, 600); // 300 * 2
      assert.strictEqual(placeResult.currency, 'USD');
      assert.strictEqual(placeResult.purchaseIds?.length, 2);

      // Verify atomic financial settlement
      assert.strictEqual(player.balanceMinor, initialPlayerBalance - 600);
      assert.strictEqual(restaurant.balanceMinor, initialRestaurantBalance + 600);

      // Verify PurchaseRecords created (1:1 per unit)
      assert.strictEqual(state.purchases.length, 2);
      assert.strictEqual(state.purchases[0].id, placeResult.purchaseIds![0]);
      assert.strictEqual(state.purchases[1].id, placeResult.purchaseIds![1]);
      assert.strictEqual(state.purchases[0].amountMinor, 300);
      assert.strictEqual(state.purchases[1].amountMinor, 300);

      // Verify Order entity state
      assert.strictEqual(state.orders.length, 1);
      const order = state.orders[0];
      assert.strictEqual(order.id, placeResult.orderId);
      assert.strictEqual(order.status, 'preparing');
      assert.strictEqual(order.fulfillmentMode, 'pickup');
      assert.strictEqual(order.fulfilledAt, null);
      assert.deepEqual(order.fulfilledItemIds, []);

      // Verify zero items created before collection
      assert.strictEqual(state.items.length, 0);

      // Verify WorldState validator passes and recognizes pending purchases
      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('explicitly defers delivery fulfillment mode without debiting funds or creating entities', () => {
      const { state, player } = setupKentuckyClubWorld();
      const initialBalance = player.balanceMinor;

      const result = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'delivery',
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'delivery-mode-deferred');
      assert.strictEqual(player.balanceMinor, initialBalance);
      assert.strictEqual(state.orders.length, 0);
      assert.strictEqual(state.purchases.length, 0);
    });

    it('rejects order with insufficient funds with zero state mutation', () => {
      const { state, player } = setupKentuckyClubWorld();
      player.balanceMinor = 200; // Less than 300 required for 1 item

      const snapshotBefore = JSON.stringify(state);

      const result = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'insufficient-funds');
      assert.strictEqual(JSON.stringify(state), snapshotBefore);
    });

    it('rejects order when customer is not co-located with zero state mutation', () => {
      const clock = WorldClock.create(START_TIME);
      const state = createRealWorldJuarezWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;
      const snapshotBefore = JSON.stringify(state);

      const result = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'customer-not-co-located');
      assert.strictEqual(JSON.stringify(state), snapshotBefore);
    });

    it('rejects order when restaurant is closed with zero state mutation', () => {
      const { state, player } = setupKentuckyClubWorld();
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:kentucky-club')!;
      restaurant.operationalState = 'closed';

      const snapshotBefore = JSON.stringify(state);

      const result = placeOrder(state, {
        customerId: player.id,
        restaurantId: restaurant.id,
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'restaurant-closed');
      assert.strictEqual(JSON.stringify(state), snapshotBefore);
    });

    it('rejects order with non-positive line quantity with zero state mutation', () => {
      const { state, player } = setupKentuckyClubWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 0 }],
        fulfillmentMode: 'pickup',
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'invalid-line-quantity');
      assert.strictEqual(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 3. Time-Driven Preparation Progression via Simulation.tick()
  // =========================================================================
  describe('3. Time-Driven Preparation Progression (tickOrderPreparation)', () => {
    it('order remains in preparing status before readyAt boundary, then transitions to ready at readyAt', () => {
      const { clock, state, player } = setupKentuckyClubWorld();
      const sim = new Simulation(clock, state);

      const placeResult = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.strictEqual(placeResult.success, true);
      const order = state.orders[0];
      assert.strictEqual(order.status, 'preparing');

      // Advance by 4 minutes (less than 5m preparation duration)
      clock.advance(4 * 60 * 1000);
      const tick1 = sim.tick();
      assert.strictEqual(order.status, 'preparing');
      assert.strictEqual(tick1.orderTransitions?.length ?? 0, 0);

      // Advance 1 more minute (total 5m: reaches readyAt boundary)
      clock.advance(1 * 60 * 1000);
      const tick2 = sim.tick();
      assert.strictEqual(order.status, 'ready');
      assert.strictEqual(tick2.orderTransitions?.length, 1);
      assert.strictEqual(tick2.orderTransitions![0].orderId, order.id);
      assert.strictEqual(tick2.orderTransitions![0].previousStatus, 'preparing');
      assert.strictEqual(tick2.orderTransitions![0].newStatus, 'ready');

      // Subsequent tick is idempotent: order remains ready without duplicate transitions
      clock.advance(60 * 1000);
      const tick3 = sim.tick();
      assert.strictEqual(order.status, 'ready');
      assert.strictEqual(tick3.orderTransitions?.length ?? 0, 0);
    });
  });

  // =========================================================================
  // 4. Order Collection & OwnedItem Creation (collectOrder)
  // =========================================================================
  describe('4. Order Collection & OwnedItem Creation (collectOrder)', () => {
    it('cannot collect order while still preparing', () => {
      const { state, player } = setupKentuckyClubWorld();

      const placeResult = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      const collectResult = collectOrder(state, player.id, placeResult.orderId!);
      assert.strictEqual(collectResult.success, false);
      assert.strictEqual(collectResult.code, 'order-not-ready');
      assert.strictEqual(state.items.length, 0);
    });

    it('successfully collects ready order: transitions to fulfilled and instantiates 1:1 OwnedItems', () => {
      const { clock, state, player } = setupKentuckyClubWorld();
      const sim = new Simulation(clock, state);

      const placeResult = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 3 }],
        fulfillmentMode: 'pickup',
      });

      // Advance 5 minutes to reach ready status
      clock.advance(ORDER_PREPARATION_DURATION_MS);
      sim.tick();
      assert.strictEqual(state.orders[0].status, 'ready');

      // Customer collects order at Kentucky Club
      const collectResult = collectOrder(state, player.id, placeResult.orderId!);
      assert.strictEqual(collectResult.success, true);
      assert.strictEqual(collectResult.code, 'success');
      assert.strictEqual(collectResult.fulfilledItemIds?.length, 3);
      assert.strictEqual(collectResult.items?.length, 3);

      const order = state.orders[0];
      assert.strictEqual(order.status, 'fulfilled');
      assert.strictEqual(order.fulfilledAt, clock.getTime());
      assert.deepEqual(order.fulfilledItemIds, collectResult.fulfilledItemIds);

      // Verify OwnedItems instantiated in player possession
      assert.strictEqual(state.items.length, 3);
      for (let i = 0; i < 3; i++) {
        const item = state.items[i];
        assert.strictEqual(item.ownerAgentId, player.id);
        assert.strictEqual(item.restaurantId, 'restaurant:kentucky-club');
        assert.strictEqual(item.offeringId, 'offering:m39-demo-beverage');
        assert.strictEqual(item.name, 'M39 Demo Beverage');
        assert.strictEqual(item.status, 'available');
        assert.strictEqual(item.consumedAt, null);
        assert.strictEqual(item.sourcePurchaseId, placeResult.purchaseIds![i]);
        assert.strictEqual(item.acquiredAt, state.purchases[i].worldTime);
      }

      // Verify Direction A and B invariants strictly pass
      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('cannot collect already fulfilled order (idempotency guard)', () => {
      const { clock, state, player } = setupKentuckyClubWorld();
      const sim = new Simulation(clock, state);

      const placeResult = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      clock.advance(ORDER_PREPARATION_DURATION_MS);
      sim.tick();
      collectOrder(state, player.id, placeResult.orderId!);

      // Attempt second collection
      const secondCollect = collectOrder(state, player.id, placeResult.orderId!);
      assert.strictEqual(secondCollect.success, false);
      assert.strictEqual(secondCollect.code, 'order-already-fulfilled');
      assert.strictEqual(state.items.length, 1); // Not duplicated
    });

    it('cannot collect order when player is not co-located with restaurant', () => {
      const { clock, state, player } = setupKentuckyClubWorld();
      const sim = new Simulation(clock, state);

      const placeResult = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      clock.advance(ORDER_PREPARATION_DURATION_MS);
      sim.tick();

      // Move player away from restaurant
      player.locationId = 'street:avenida-benito-juarez';

      const collectResult = collectOrder(state, player.id, placeResult.orderId!);
      assert.strictEqual(collectResult.success, false);
      assert.strictEqual(collectResult.code, 'customer-not-co-located');
      assert.strictEqual(state.items.length, 0); // Zero mutation
    });
  });

  // =========================================================================
  // 5. Order Authority Validation Invariants (validateOrderAuthority)
  // =========================================================================
  describe('5. Order Authority Validation Invariants', () => {
    it('validates correct order state without error', () => {
      const { clock, state, player } = setupKentuckyClubWorld();
      placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      assert.doesNotThrow(() => validateOrderAuthority(state));
    });

    it('rejects non-array orders collection', () => {
      const { state } = setupKentuckyClubWorld();
      (state as any).orders = 'invalid';
      assert.throws(() => validateOrderAuthority(state), /orders must be an array/);
    });

    it('rejects duplicate order IDs', () => {
      const { state, player } = setupKentuckyClubWorld();
      placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      // Duplicate order
      state.orders.push({ ...state.orders[0] });
      assert.throws(() => validateOrderAuthority(state), /duplicate order id found/);
    });

    it('rejects order referencing non-player customer', () => {
      const { state } = setupKentuckyClubWorld();
      const staff = state.agents.find((a) => a.id === 'agent:m39-service-staff')!;
      state.orders.push({
        id: 'order:1',
        type: 'order',
        customerId: staff.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        totalAmountMinor: 300,
        currency: 'USD',
        fulfillmentMode: 'pickup',
        status: 'preparing',
        createdAt: state.worldTime,
        readyAt: state.worldTime,
        fulfilledAt: null,
        purchaseIds: [],
        fulfilledItemIds: [],
      });
      assert.throws(() => validateOrderAuthority(state), /not a player/);
    });

    it('rejects order with totalAmountMinor mismatch against lines', () => {
      const { state, player } = setupKentuckyClubWorld();
      state.orders.push({
        id: 'order:1',
        type: 'order',
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        totalAmountMinor: 9999, // Mismatch (offering is 300)
        currency: 'USD',
        fulfillmentMode: 'pickup',
        status: 'preparing',
        createdAt: state.worldTime,
        readyAt: state.worldTime,
        fulfilledAt: null,
        purchaseIds: [],
        fulfilledItemIds: [],
      });
      assert.throws(() => validateOrderAuthority(state), /does not match sum of lines/);
    });

    it('rejects fulfilled order with null fulfilledAt', () => {
      const { state, player } = setupKentuckyClubWorld();
      state.orders.push({
        id: 'order:1',
        type: 'order',
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        totalAmountMinor: 300,
        currency: 'USD',
        fulfillmentMode: 'pickup',
        status: 'fulfilled',
        createdAt: state.worldTime,
        readyAt: state.worldTime,
        fulfilledAt: null, // Invalid: must be non-null when fulfilled
        purchaseIds: [],
        fulfilledItemIds: [],
      });
      assert.throws(() => validateOrderAuthority(state), /fulfilledAt must be a non-empty string/);
    });

    it('rejects in-flight order referencing purchase that already has an OwnedItem', () => {
      const { state, player } = setupKentuckyClubWorld();
      placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      // Manually add an OwnedItem pointing to the preparing order's purchase
      state.items.push({
        id: 'item:999',
        type: 'item',
        offeringId: 'offering:m39-demo-beverage',
        name: 'M39 Demo Beverage',
        ownerAgentId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        sourcePurchaseId: state.orders[0].purchaseIds[0],
        acquiredAt: state.worldTime,
        status: 'available',
        consumedAt: null,
      });

      assert.throws(
        () => validateOrderAuthority(state),
        /which already has an OwnedItem/
      );
    });

    it('rejects orphan qualifying purchase with no OwnedItem and no in-flight order', () => {
      const { state, player } = setupKentuckyClubWorld();
      // Add an orphan purchase not associated with any order
      state.purchases.push({
        id: 'purchase:orphan',
        worldTime: state.worldTime,
        playerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        offeringId: 'offering:m39-demo-beverage',
        amountMinor: 300,
        currency: 'USD',
        consumedAt: null,
      });

      assert.throws(
        () => validateWorldState(state),
        /missing OwnedItem for qualifying purchase "purchase:orphan"/i
      );
    });

    it('rejects in-flight order referencing purchase with customer or restaurant mismatch', () => {
      const { state, player } = setupKentuckyClubWorld();
      const staff = state.agents.find((a) => a.id === 'agent:m39-service-staff')!;
      state.purchases.push({
        id: 'purchase:foreign',
        worldTime: state.worldTime,
        playerId: staff.id, // Foreign customer
        restaurantId: 'restaurant:kentucky-club',
        offeringId: 'offering:m39-demo-beverage',
        amountMinor: 300,
        currency: 'USD',
        consumedAt: null,
      });

      state.orders.push({
        id: 'order:1',
        type: 'order',
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        totalAmountMinor: 300,
        currency: 'USD',
        fulfillmentMode: 'pickup',
        status: 'preparing',
        createdAt: state.worldTime,
        readyAt: state.worldTime,
        fulfilledAt: null,
        purchaseIds: ['purchase:foreign'],
        fulfilledItemIds: [],
      });

      assert.throws(
        () => validateOrderAuthority(state),
        /playerId "agent:m39-service-staff" does not match customerId "agent:real-world-player"/
      );
    });
  });

  // =========================================================================
  // 6. Persistence Roundtrip & Offline Simulation
  // =========================================================================
  describe('6. Persistence Roundtrip & Offline Simulation', () => {
    it('persists placed order, restores it, progresses to ready via simulation tick, and fulfills successfully', () => {
      const tmpDir = join(tmpdir(), `test-order-persist-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const testFile = join(tmpDir, 'world-state.json');

      try {
        const { clock, state, player } = setupKentuckyClubWorld();

        // 1. Place order
        const placeRes = placeOrder(state, {
          customerId: player.id,
          restaurantId: 'restaurant:kentucky-club',
          lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 2 }],
          fulfillmentMode: 'pickup',
        });
        assert.strictEqual(placeRes.success, true);

        // 2. Persist to disk
        const persistence = new LocalFilePersistence(testFile);
        persistence.save(snapshotWorldState(clock, state));
        assert.ok(existsSync(testFile));

        // 3. Restore in clean runtime
        const restored = persistence.load();
        assert.ok(restored !== null);
        assert.strictEqual(restored.version, 18);
        assert.strictEqual(restored.orders.length, 1);
        assert.strictEqual(restored.orders[0].status, 'preparing');
        validateWorldState(restored);

        // 4. Advance clock by 5 minutes in new runtime and tick simulation
        const clock2 = WorldClock.create(restored.worldTime);
        const sim2 = new Simulation(clock2, restored);
        clock2.advance(ORDER_PREPARATION_DURATION_MS);
        const tickRes = sim2.tick();

        assert.strictEqual(restored.orders[0].status, 'ready');
        assert.strictEqual(tickRes.orderTransitions?.length, 1);

        // 5. Collect order in restored world
        const collectRes = collectOrder(restored, player.id, restored.orders[0].id);
        assert.strictEqual(collectRes.success, true);
        assert.strictEqual(restored.orders[0].status, 'fulfilled');
        assert.strictEqual(restored.items.length, 2);

        // 6. Persist final fulfilled world and verify clean reload
        persistence.save(snapshotWorldState(clock2, restored));
        const finalRestored = persistence.load();
        assert.ok(finalRestored !== null);
        assert.strictEqual(finalRestored.version, 18);
        assert.strictEqual(finalRestored.orders[0].status, 'fulfilled');
        assert.strictEqual(finalRestored.items.length, 2);
        validateWorldState(finalRestored);
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });

  // =========================================================================
  // 7. Order Queries
  // =========================================================================
  describe('7. Order Queries (getCustomerOrders, getRestaurantOrders)', () => {
    it('retrieves orders accurately by customer and restaurant', () => {
      const { state, player } = setupKentuckyClubWorld();

      placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      const customerOrders = getCustomerOrders(state, player.id);
      assert.strictEqual(customerOrders.length, 1);
      assert.strictEqual(customerOrders[0].customerId, player.id);

      const restaurantOrders = getRestaurantOrders(state, 'restaurant:kentucky-club');
      assert.strictEqual(restaurantOrders.length, 1);
      assert.strictEqual(restaurantOrders[0].restaurantId, 'restaurant:kentucky-club');

      const nonExistentOrders = getCustomerOrders(state, 'agent:non-existent');
      assert.strictEqual(nonExistentOrders.length, 0);
    });
  });
});
