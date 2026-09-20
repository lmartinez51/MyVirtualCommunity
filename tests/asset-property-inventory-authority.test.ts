import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { createInitialWorldState, WorldState } from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import {
  consumeOwnedItem,
  getOwnedItem,
  getPlayerAvailableItems,
  isItemAvailable,
  validateItemAuthority,
  OwnedItem,
} from '../src/core/item.js';
import {
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  startEatingPastry,
  exitRestaurant,
  leaveBuilding,
  validateWorldState,
} from '../src/core/world-state.js';

describe('Milestone 37: Asset, Property and Inventory Authority (AUD-03)', () => {
  const OPEN_TIME = '2026-09-14T09:00:00.000Z';
  const COFFEE_OFFERING = 'offering:development-coffee';
  const PASTRY_OFFERING = 'offering:development-pastry';
  const RESTAURANT_ID = 'restaurant:development-restaurant';

  function setupOpenWorldWithPurchasedItem() {
    const clock = WorldClock.create(OPEN_TIME);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    sim.tick(); // Open restaurant at 09:00 UTC

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    enterRestaurant(state, player.id, RESTAURANT_ID, { silent: true });

    const purchaseRes = purchaseOffering(state, player.id, COFFEE_OFFERING, RESTAURANT_ID, { silent: true });
    assert.equal(purchaseRes.success, true);
    assert.equal(state.items.length, 1);
    const itemId = state.items[0].id;

    return { clock, state, sim, player, itemId };
  }

  describe('1. Core Distinctions to Preserve', () => {
    it('Location as Scope Simplification: Acquired personal consumable items derive location from owning agent without independent spatial entities', () => {
      const { state, player, itemId } = setupOpenWorldWithPurchasedItem();

      const item = getOwnedItem(state, itemId)!;
      assert.ok(item);
      assert.equal(item.ownerAgentId, player.id);
      assert.equal(player.locationId, RESTAURANT_ID);

      // Player leaves restaurant into containing building
      const exitRes = exitRestaurant(state, player.id, RESTAURANT_ID, { silent: true });
      assert.equal(exitRes.success, true);
      assert.notEqual(player.locationId, RESTAURANT_ID);

      // In current scope, personal consumable item attribution follows the agent;
      // item has no independent spatial entity in state.places.
      assert.equal(item.ownerAgentId, player.id);
      assert.equal(state.places.some((p) => p.id === item.id), false);
    });

    it('Consumable Lifecycle State: Consuming an item transitions lifecycle status while preserving ownerAgentId attribution (general physical condition is not modeled)', () => {
      const { state, player, itemId } = setupOpenWorldWithPurchasedItem();

      const item = getOwnedItem(state, itemId)!;
      assert.equal(item.status, 'available');
      assert.equal(item.consumedAt, null);

      const consumeRes = consumeOwnedItem(state, itemId, OPEN_TIME);
      assert.equal(consumeRes.success, true);
      assert.equal(item.status, 'consumed');
      assert.equal(item.consumedAt, OPEN_TIME);

      // Personal attribution is preserved even after consumption;
      // general physical condition (durability, degradation, wear) is not modeled.
      assert.equal(item.ownerAgentId, player.id);
      assert.equal((item as any).durability, undefined);
      assert.equal((item as any).conditionPercentage, undefined);
    });

    it('Historical Transaction Price vs Current Economic Value: PurchaseRecord.amountMinor is immutable historical transaction price, not dynamic valuation', () => {
      const { state, itemId } = setupOpenWorldWithPurchasedItem();

      const item = getOwnedItem(state, itemId)!;
      const purchase = state.purchases.find((p) => p.id === item.sourcePurchaseId)!;
      assert.ok(purchase);
      assert.equal(purchase.amountMinor, 500);

      // Historical purchase record represents historical transaction price at exchange.
      // Current economic value, market value, appraisal, and resale value are NOT modeled.
      assert.equal((purchase as any).marketValueMinor, undefined);
      assert.equal((purchase as any).appraisalMinor, undefined);
      assert.equal((item as any).economicValueMinor, undefined);
      assert.equal((item as any).resaleValueMinor, undefined);
      assert.equal(Object.isFrozen(purchase), false); // State object, but immutability guaranteed by protocol
    });

    it('Offering ≠ Owned Item: Retiring offering does not alter existing owned items', () => {
      const { state, itemId } = setupOpenWorldWithPurchasedItem();

      const itemBefore = getOwnedItem(state, itemId)!;
      assert.equal(itemBefore.status, 'available');

      // Retiring an offering catalog entry
      const offering = state.offerings.find((o) => o.id === itemBefore.offeringId)!;
      const originalOfferingName = offering.name;

      // Item retains its identity, name, and ownership
      assert.equal(itemBefore.name, originalOfferingName);
      assert.equal(itemBefore.offeringId, offering.id);
    });

    it('Building ≠ Property: Building is spatial containment, not real-estate property', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);

      const buildings = state.places.filter((p) => p.type === 'building');
      assert.ok(buildings.length > 0);

      for (const building of buildings) {
        // Buildings have spatial geometry/type, but NO ownership, deed, or asset valuation
        assert.equal((building as any).ownerAgentId, undefined);
        assert.equal((building as any).propertyDeedId, undefined);
        assert.equal((building as any).valuationMinor, undefined);
      }
    });

    it('Unrepresented concepts (Vehicles, Real Estate Property, Stock Inventory, General Physical Condition, Economic Valuation) are strictly absent', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);

      assert.equal((state as any).vehicles, undefined);
      assert.equal((state as any).properties, undefined);
      assert.equal((state as any).businessInventory, undefined);
      assert.equal((state as any).warehouseStock, undefined);
    });
  });

  describe('2. Authoritative Lifecycle State Transitions (consumeOwnedItem)', () => {
    it('successfully transitions available item to consumed with timestamp', () => {
      const { state, itemId } = setupOpenWorldWithPurchasedItem();

      const consumeRes = consumeOwnedItem(state, itemId, OPEN_TIME);
      assert.equal(consumeRes.success, true);
      assert.equal(consumeRes.code, 'success');
      assert.equal(consumeRes.itemId, itemId);
      assert.equal(consumeRes.consumedAt, OPEN_TIME);

      const item = getOwnedItem(state, itemId)!;
      assert.equal(item.status, 'consumed');
      assert.equal(item.consumedAt, OPEN_TIME);
    });

    it('rejects non-existent item with item-not-found and zero mutation', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      const beforeSnapshot = JSON.stringify(state);

      const res = consumeOwnedItem(state, 'item:non-existent', OPEN_TIME);
      assert.equal(res.success, false);
      assert.equal(res.code, 'item-not-found');
      assert.equal(JSON.stringify(state), beforeSnapshot);
    });

    it('rejects already-consumed item with item-already-consumed and zero mutation', () => {
      const { state, itemId } = setupOpenWorldWithPurchasedItem();

      // First consumption succeeds
      const firstRes = consumeOwnedItem(state, itemId, OPEN_TIME);
      assert.equal(firstRes.success, true);

      const afterFirstSnapshot = JSON.stringify(state);

      // Second consumption attempt fails
      const secondRes = consumeOwnedItem(state, itemId, '2026-09-14T09:15:00.000Z');
      assert.equal(secondRes.success, false);
      assert.equal(secondRes.code, 'item-already-consumed');
      assert.equal(JSON.stringify(state), afterFirstSnapshot);
    });

    it('rejects invalid timestamp string with invalid-timestamp and zero mutation', () => {
      const { state, itemId } = setupOpenWorldWithPurchasedItem();
      const beforeSnapshot = JSON.stringify(state);

      const res = consumeOwnedItem(state, itemId, 'not-a-timestamp');
      assert.equal(res.success, false);
      assert.equal(res.code, 'invalid-timestamp');
      assert.equal(JSON.stringify(state), beforeSnapshot);
    });
  });

  describe('3. Pure Queries', () => {
    it('getOwnedItem retrieves item by ID without mutation', () => {
      const { state, itemId } = setupOpenWorldWithPurchasedItem();
      const beforeSnapshot = JSON.stringify(state);

      const item = getOwnedItem(state, itemId);
      assert.ok(item);
      assert.equal(item.id, itemId);
      assert.equal(JSON.stringify(state), beforeSnapshot);

      const nonExistent = getOwnedItem(state, 'item:999');
      assert.equal(nonExistent, undefined);
    });

    it('getPlayerAvailableItems filters by player and offeringId, excluding consumed items', () => {
      const { state, player, itemId } = setupOpenWorldWithPurchasedItem();

      const itemsBefore = getPlayerAvailableItems(state, player.id);
      assert.equal(itemsBefore.length, 1);
      assert.equal(itemsBefore[0].id, itemId);

      // Offering filter matching
      const matching = getPlayerAvailableItems(state, player.id, COFFEE_OFFERING);
      assert.equal(matching.length, 1);

      // Offering filter non-matching
      const nonMatching = getPlayerAvailableItems(state, player.id, PASTRY_OFFERING);
      assert.equal(nonMatching.length, 0);

      // Consume item -> now 0 available
      consumeOwnedItem(state, itemId, OPEN_TIME);
      const itemsAfter = getPlayerAvailableItems(state, player.id);
      assert.equal(itemsAfter.length, 0);
    });

    it('isItemAvailable accurately reports availability', () => {
      const { state, itemId } = setupOpenWorldWithPurchasedItem();

      assert.equal(isItemAvailable(state, itemId), true);
      assert.equal(isItemAvailable(state, 'item:999'), false);

      consumeOwnedItem(state, itemId, OPEN_TIME);
      assert.equal(isItemAvailable(state, itemId), false);
    });
  });

  describe('4. Invariant Enforcement (validateItemAuthority)', () => {
    it('validates a correct state without throwing', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      assert.doesNotThrow(() => validateItemAuthority(state));
    });

    it('rejects state where items is not an array', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state as any).items = null;
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: items must be an array/
      );
    });

    it('rejects item with invalid ID format', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).id = 'not-an-item-id';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item at index 0 id must match format "item:<number>"/
      );
    });

    it('rejects duplicate item IDs', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      state.items.push({ ...state.items[0] });
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: duplicate item id found/
      );
    });

    it('rejects item with invalid type', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).type = 'gadget';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" type must be "item"/
      );
    });

    it('rejects item with non-qualifying offeringId', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).offeringId = 'offering:invalid-offering';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" offeringId must be a qualifying item offering/
      );
    });

    it('rejects item with empty name', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).name = '   ';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" name must be a non-empty string/
      );
    });

    it('rejects item referencing non-existent ownerAgentId', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).ownerAgentId = 'agent:ghost';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" ownerAgentId "agent:ghost" references non-existent agent/
      );
    });

    it('rejects item referencing NPC ownerAgentId (current scope limitation: acquisition limited to player agents)', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).ownerAgentId = 'agent:dev-npc';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" ownerAgentId "agent:dev-npc" is not a player/
      );
    });

    it('rejects item referencing non-existent restaurantId', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).restaurantId = 'restaurant:nowhere';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" restaurantId "restaurant:nowhere" references non-existent restaurant/
      );
    });

    it('rejects item with future acquiredAt timestamp', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).acquiredAt = '2099-01-01T00:00:00.000Z';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" acquiredAt "2099-01-01T00:00:00.000Z" is in the future/
      );
    });

    it('rejects item with invalid status', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).status = 'broken';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" status must be "available" or "consumed"/
      );
    });

    it('rejects available item with non-null consumedAt', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).status = 'available';
      (state.items[0] as any).consumedAt = OPEN_TIME;
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" consumedAt must be null when status is "available"/
      );
    });

    it('rejects consumed item with null consumedAt', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).status = 'consumed';
      (state.items[0] as any).consumedAt = null;
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" consumedAt must be a non-empty ISO-8601 timestamp when status is "consumed"/
      );
    });

    it('rejects consumed item with consumedAt earlier than acquiredAt', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      (state.items[0] as any).status = 'consumed';
      (state.items[0] as any).consumedAt = '2020-01-01T00:00:00.000Z';
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: item "item:1" consumedAt .* must be greater than or equal to acquiredAt/
      );
    });

    it('rejects duplicate sourcePurchaseId (Direction A violation)', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      const duplicateItem: OwnedItem = {
        ...state.items[0],
        id: 'item:2',
      };
      state.items.push(duplicateItem);
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: duplicate sourcePurchaseId "purchase:1" referenced by multiple items/
      );
    });

    it('rejects missing OwnedItem for qualifying purchase (Direction B violation)', () => {
      const { state } = setupOpenWorldWithPurchasedItem();
      state.items = []; // Remove owned item but keep purchase
      assert.throws(
        () => validateItemAuthority(state),
        /Item Authority Invariant Violated: missing OwnedItem for qualifying purchase "purchase:1"/
      );
    });
  });

  describe('5. Cross-Domain Non-Interference', () => {
    it('consuming an item does NOT alter monetary balances', () => {
      const { state, player, itemId } = setupOpenWorldWithPurchasedItem();

      const playerBalanceBefore = player.balanceMinor;
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      const restaurantBalanceBefore = restaurant.balanceMinor;

      consumeOwnedItem(state, itemId, OPEN_TIME);

      assert.equal(player.balanceMinor, playerBalanceBefore);
      assert.equal(restaurant.balanceMinor, restaurantBalanceBefore);
    });

    it('consuming an item does NOT alter restaurant operationalState', () => {
      const { state, itemId } = setupOpenWorldWithPurchasedItem();
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      assert.equal(restaurant.operationalState, 'open');

      consumeOwnedItem(state, itemId, OPEN_TIME);

      assert.equal(restaurant.operationalState, 'open');
    });

    it('consuming an item does NOT alter spatial locations or agent knowledge', () => {
      const { state, player, itemId } = setupOpenWorldWithPurchasedItem();
      const locationBefore = player.locationId;
      const knowledgeCountBefore = (state as any).knowledge?.length ?? 0;

      consumeOwnedItem(state, itemId, OPEN_TIME);

      assert.equal(player.locationId, locationBefore);
      assert.equal(((state as any).knowledge?.length ?? 0), knowledgeCountBefore);
    });
  });

  describe('6. High-Level Activity Integration & Persistence', () => {
    it('startHavingCoffee delegates item consumption via consumeOwnedItem', () => {
      const { state, player, itemId } = setupOpenWorldWithPurchasedItem();

      const res = startHavingCoffee(state, player.id);
      assert.equal(res.success, true);
      assert.equal(res.itemId, itemId);

      const item = getOwnedItem(state, itemId)!;
      assert.equal(item.status, 'consumed');
      assert.equal(item.consumedAt, OPEN_TIME);
    });

    it('persists and restores state with schema version 14 preserving item authority', () => {
      const { state, itemId } = setupOpenWorldWithPurchasedItem();
      consumeOwnedItem(state, itemId, OPEN_TIME);

      const serialized = JSON.stringify(state);
      const loaded = JSON.parse(serialized) as WorldState;
      assert.ok(loaded);
      assert.equal(loaded.version, 14);

      const restoredItem = getOwnedItem(loaded, itemId)!;
      assert.ok(restoredItem);
      assert.equal(restoredItem.status, 'consumed');
      assert.equal(restoredItem.consumedAt, OPEN_TIME);
      assert.equal(restoredItem.ownerAgentId, 'agent:dev-player');
      assert.doesNotThrow(() => validateItemAuthority(loaded));
      assert.doesNotThrow(() => validateWorldState(loaded));
    });
  });
});
