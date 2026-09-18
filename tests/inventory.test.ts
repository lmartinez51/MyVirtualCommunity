import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  inspectCurrentLocation,
  validateWorldState,
  OwnedItem,
  PurchaseRecord,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';

describe('Milestone 33: Authoritative Inventory, Ownership & Consumable Lifecycle', () => {
  const OPEN_TIME = '2026-09-14T09:00:00.000Z';

  function setupOpenWorldWithPlayerInside() {
    const clock = WorldClock.create(OPEN_TIME);
    const state = createInitialWorldState(clock);
    const entryResult = enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:development-restaurant',
      { silent: true }
    );
    assert.equal(entryResult.success, true);
    return { clock, state };
  }

  describe('1. Acquisition Flow & 1:1 Item Creation', () => {
    test('purchasing Coffee creates exactly one OwnedItem with status "available"', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      assert.equal(state.items.length, 0);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, true);
      assert.equal(state.purchases.length, 1);
      assert.equal(state.items.length, 1);

      const purchase = state.purchases[0];
      const item = state.items[0];

      assert.equal(item.id, 'item:1');
      assert.equal(item.type, 'item');
      assert.equal(item.offeringId, 'offering:development-coffee');
      assert.equal(item.name, 'Coffee'); // Live acquisition snapshot
      assert.equal(item.ownerAgentId, 'agent:dev-player');
      assert.equal(item.restaurantId, 'restaurant:development-restaurant');
      assert.equal(item.sourcePurchaseId, purchase.id);
      assert.equal(item.acquiredAt, purchase.worldTime);
      assert.equal(item.status, 'available');
      assert.equal(item.consumedAt, null);

      // Verify result payload includes item and purchase IDs
      assert.equal(result.itemId, item.id);
      assert.equal(result.purchaseId, purchase.id);

      // State validates cleanly
      assert.doesNotThrow(() => validateWorldState(state));
    });

    test('purchasing qualifying Pan Dulce creates an OwnedItem with name snapshot', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      // Add development pastry offering
      state.offerings.push({
        id: 'offering:development-pastry',
        type: 'offering',
        name: 'Pan Dulce Fresh',
        restaurantId: 'restaurant:development-restaurant',
        priceMinor: 300,
        currency: 'USD',
      });

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-pastry',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, true);
      assert.equal(state.items.length, 1);
      const item = state.items[0];
      assert.equal(item.offeringId, 'offering:development-pastry');
      assert.equal(item.name, 'Pan Dulce Fresh');
      assert.equal(item.status, 'available');
      assert.equal(item.consumedAt, null);
    });

    test('non-qualifying purchase produces zero OwnedItems', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      state.offerings.push({
        id: 'offering:service-consultation',
        type: 'offering',
        name: 'Consultation',
        restaurantId: 'restaurant:development-restaurant',
        priceMinor: 100,
        currency: 'USD',
      });

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:service-consultation',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, true);
      assert.equal(state.purchases.length, 1);
      assert.equal(state.items.length, 0); // No OwnedItem created

      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  describe('2. Bidirectional Purchase ↔ OwnedItem Cardinality (FC-01)', () => {
    test('rejects WorldState where qualifying purchase has no OwnedItem (Direction B)', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      // Add qualifying purchase without adding OwnedItem
      state.purchases.push({
        id: 'purchase:1',
        worldTime: OPEN_TIME,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
        consumedAt: null,
      });

      assert.throws(
        () => validateWorldState(state),
        /Missing OwnedItem for qualifying purchase "purchase:1"/
      );
    });

    test('rejects duplicate OwnedItems referencing the same sourcePurchaseId (Direction A)', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      state.purchases.push({
        id: 'purchase:1',
        worldTime: OPEN_TIME,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
        consumedAt: null,
      });

      state.items.push(
        {
          id: 'item:1',
          type: 'item',
          offeringId: 'offering:development-coffee',
          name: 'Coffee',
          ownerAgentId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          sourcePurchaseId: 'purchase:1',
          acquiredAt: OPEN_TIME,
          status: 'available',
          consumedAt: null,
        },
        {
          id: 'item:2',
          type: 'item',
          offeringId: 'offering:development-coffee',
          name: 'Coffee',
          ownerAgentId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          sourcePurchaseId: 'purchase:1', // Duplicate reference!
          acquiredAt: OPEN_TIME,
          status: 'available',
          consumedAt: null,
        }
      );

      assert.throws(
        () => validateWorldState(state),
        /Duplicate sourcePurchaseId "purchase:1" found across items/
      );
    });

    test('rejects OwnedItem referencing non-existent purchase', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      state.items.push({
        id: 'item:1',
        type: 'item',
        offeringId: 'offering:development-coffee',
        name: 'Coffee',
        ownerAgentId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        sourcePurchaseId: 'purchase:non-existent',
        acquiredAt: OPEN_TIME,
        status: 'available',
        consumedAt: null,
      });

      assert.throws(
        () => validateWorldState(state),
        /references non-existent purchase/
      );
    });

    test('rejects OwnedItem referencing non-qualifying purchase', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      state.offerings.push({
        id: 'offering:service-consultation',
        type: 'offering',
        name: 'Consultation',
        restaurantId: 'restaurant:development-restaurant',
        priceMinor: 100,
        currency: 'USD',
      });
      state.purchases.push({
        id: 'purchase:1',
        worldTime: OPEN_TIME,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:service-consultation',
        amountMinor: 100,
        currency: 'USD',
        consumedAt: null,
      });
      state.items.push({
        id: 'item:1',
        type: 'item',
        offeringId: 'offering:development-coffee', // Mismatched offeringId!
        name: 'Coffee',
        ownerAgentId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        sourcePurchaseId: 'purchase:1',
        acquiredAt: OPEN_TIME,
        status: 'available',
        consumedAt: null,
      });

      assert.throws(
        () => validateWorldState(state),
        /offeringId "offering:development-coffee" does not match purchase offeringId "offering:service-consultation"/
      );
    });

    test('accepts non-qualifying purchase without OwnedItem', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      state.offerings.push({
        id: 'offering:service-consultation',
        type: 'offering',
        name: 'Consultation',
        restaurantId: 'restaurant:development-restaurant',
        priceMinor: 100,
        currency: 'USD',
      });
      state.purchases.push({
        id: 'purchase:1',
        worldTime: OPEN_TIME,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:service-consultation',
        amountMinor: 100,
        currency: 'USD',
        consumedAt: null,
      });

      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  describe('3. Consumption Flow & Authority Separation (FC-03)', () => {
    test('startHavingCoffee transitions OwnedItem to "consumed" and leaves PurchaseRecord.consumedAt untouched', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      const purchase = state.purchases[0];
      const item = state.items[0];
      assert.equal(purchase.consumedAt, null);
      assert.equal(item.status, 'available');

      const result = startHavingCoffee(state, 'agent:dev-player');
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.itemId, item.id);
      assert.equal(result.purchaseId, purchase.id);

      // OwnedItem is updated to consumed
      assert.equal(item.status, 'consumed');
      assert.equal(item.consumedAt, state.worldTime);

      // PurchaseRecord is UNTOUCHED (FC-03)
      assert.equal(purchase.consumedAt, null);

      // Agent is in having-coffee
      const agent = state.agents.find((a) => a.id === 'agent:dev-player');
      assert.equal(agent?.playerActivity?.activity, 'having-coffee');
      assert.equal(agent?.playerActivity?.startedAt, state.worldTime);
      assert.equal(agent?.playerActivity?.completedAt, null);

      assert.doesNotThrow(() => validateWorldState(state));
    });

    test('OwnedItem governs current possession even if PurchaseRecord.consumedAt has conflicting historical data', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      // Synthetic record where PurchaseRecord has a legacy timestamp, but OwnedItem is available
      state.purchases.push({
        id: 'purchase:1',
        worldTime: OPEN_TIME,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
        consumedAt: '2026-09-14T08:30:00.000Z', // Legacy metadata timestamp
      });

      state.items.push({
        id: 'item:1',
        type: 'item',
        offeringId: 'offering:development-coffee',
        name: 'Coffee',
        ownerAgentId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        sourcePurchaseId: 'purchase:1',
        acquiredAt: OPEN_TIME,
        status: 'available', // Current authority says available!
        consumedAt: null,
      });

      // Validates cleanly
      assert.doesNotThrow(() => validateWorldState(state));

      // Attempt startHavingCoffee: succeeds because OwnedItem governs!
      const result = startHavingCoffee(state, 'agent:dev-player');
      assert.equal(result.success, true);
      assert.equal(state.items[0].status, 'consumed');
    });

    test('consumed item cannot be re-consumed', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      const firstResult = startHavingCoffee(state, 'agent:dev-player');
      assert.equal(firstResult.success, true);

      // Clear activity simulating completion
      const agent = state.agents.find((a) => a.id === 'agent:dev-player')!;
      agent.playerActivity = null;

      // Second startCoffee fails with purchase-required
      const secondResult = startHavingCoffee(state, 'agent:dev-player');
      assert.equal(secondResult.success, false);
      assert.equal(secondResult.code, 'purchase-required');
    });

    test('deterministic FIFO selects oldest acquired coffee, then lower numeric ID', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      // Add two coffees acquired at different times
      state.purchases.push(
        {
          id: 'purchase:1',
          worldTime: '2026-09-14T08:00:00.000Z',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:development-coffee',
          amountMinor: 500,
          currency: 'USD',
          consumedAt: null,
        },
        {
          id: 'purchase:2',
          worldTime: '2026-09-14T07:30:00.000Z', // Older
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:development-coffee',
          amountMinor: 500,
          currency: 'USD',
          consumedAt: null,
        }
      );

      state.items.push(
        {
          id: 'item:1',
          type: 'item',
          offeringId: 'offering:development-coffee',
          name: 'Coffee',
          ownerAgentId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          sourcePurchaseId: 'purchase:1',
          acquiredAt: '2026-09-14T08:00:00.000Z',
          status: 'available',
          consumedAt: null,
        },
        {
          id: 'item:2',
          type: 'item',
          offeringId: 'offering:development-coffee',
          name: 'Coffee',
          ownerAgentId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          sourcePurchaseId: 'purchase:2',
          acquiredAt: '2026-09-14T07:30:00.000Z', // Older!
          status: 'available',
          consumedAt: null,
        }
      );

      const result = startHavingCoffee(state, 'agent:dev-player');
      assert.equal(result.success, true);
      assert.equal(result.itemId, 'item:2'); // Selected item:2 because it was acquired earlier
      assert.equal(state.items[1].status, 'consumed');
      assert.equal(state.items[0].status, 'available');
    });

    test('coffee acquired at Restaurant A cannot be consumed at Restaurant B', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      state.restaurants.push({
        id: 'restaurant:other-restaurant',
        type: 'restaurant',
        name: 'Other Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'open',
        operationalSince: OPEN_TIME,
        balanceMinor: 0,
        currency: 'USD',
      });
      state.offerings.push({
        id: 'offering:development-coffee',
        type: 'offering',
        name: 'Coffee',
        restaurantId: 'restaurant:other-restaurant',
        priceMinor: 500,
        currency: 'USD',
      });

      // Item was acquired at other-restaurant
      state.purchases.push({
        id: 'purchase:1',
        worldTime: OPEN_TIME,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:other-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
        consumedAt: null,
      });
      state.items.push({
        id: 'item:1',
        type: 'item',
        offeringId: 'offering:development-coffee',
        name: 'Coffee',
        ownerAgentId: 'agent:dev-player',
        restaurantId: 'restaurant:other-restaurant',
        sourcePurchaseId: 'purchase:1',
        acquiredAt: OPEN_TIME,
        status: 'available',
        consumedAt: null,
      });

      // Player is at restaurant:development-restaurant
      const result = startHavingCoffee(state, 'agent:dev-player');
      assert.equal(result.success, false);
      assert.equal(result.code, 'purchase-required');
    });
  });

  describe('4. Consumed Terminality Across Simulation Completion (FC-05)', () => {
    test('consumed item remains consumed after 15-minute simulation activity completion', () => {
      const { clock, state } = setupOpenWorldWithPlayerInside();
      purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      const startResult = startHavingCoffee(state, 'agent:dev-player');
      assert.equal(startResult.success, true);
      assert.equal(state.items[0].status, 'consumed');
      const consumedTimestamp = state.items[0].consumedAt;

      // Advance clock to exact 15m boundary and tick simulation
      clock.advance(15 * 60_000);
      const simulation = new Simulation(clock, state, { silent: true });
      const tickResult = simulation.tick();
      assert.equal(tickResult.playerActivityTransitions?.length, 1);

      // Simulation completed coffee activity
      assert.equal(state.coffeeCompletions.length, 1);
      const agent = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.notEqual(agent.playerActivity?.completedAt, null);

      // OwnedItem status remains strictly "consumed" (FC-05)
      assert.equal(state.items[0].status, 'consumed');
      assert.equal(state.items[0].consumedAt, consumedTimestamp);

      // PurchaseRecord remains unmutated
      assert.equal(state.purchases[0].consumedAt, null);

      // Second startCoffee attempt fails with purchase-required
      const retryResult = startHavingCoffee(state, 'agent:dev-player');
      assert.equal(retryResult.success, false);
      assert.equal(retryResult.code, 'purchase-required');
    });
  });

  describe('5. Two-Player Inventory & Command Isolation (FC-04)', () => {
    test('Player A and Player B co-located: Player A coffee is invisible to and unconsumable by Player B', () => {
      const { state } = setupOpenWorldWithPlayerInside();

      // Add Player B at the exact same restaurant location
      state.agents.push({
        id: 'agent:player-b',
        type: 'agent',
        name: 'Player B',
        agentType: 'player',
        activityState: 'active',
        activitySince: OPEN_TIME,
        locationId: 'restaurant:development-restaurant',
        balanceMinor: 2000,
        currency: 'USD',
        playerActivity: null,
      });

      // Player A buys Coffee
      const purchaseResult = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );
      assert.equal(purchaseResult.success, true);
      assert.equal(state.items.length, 1);

      // Perception check for Player A: coffee is visible in playerInventory
      const inspectA = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspectA.success, true);
      assert.equal(inspectA.playerInventory?.length, 1);
      assert.equal(inspectA.playerInventory?.[0].offeringId, 'offering:development-coffee');

      // Perception check for Player B: playerInventory is empty
      const inspectB = inspectCurrentLocation(state, 'agent:player-b');
      assert.equal(inspectB.success, true);
      assert.equal(inspectB.playerInventory?.length, 0);

      // Player B attempts startCoffee: FAILS with purchase-required
      const bCoffeeResult = startHavingCoffee(state, 'agent:player-b');
      assert.equal(bCoffeeResult.success, false);
      assert.equal(bCoffeeResult.code, 'purchase-required');
      // Zero state mutation for either player or item
      assert.equal(state.items[0].status, 'available');
      const playerBAgent = state.agents.find((a) => a.id === 'agent:player-b')!;
      assert.equal(playerBAgent.playerActivity, null);

      // Player A attempts startCoffee: SUCCEEDS
      const aCoffeeResult = startHavingCoffee(state, 'agent:dev-player');
      assert.equal(aCoffeeResult.success, true);
      assert.equal(state.items[0].status, 'consumed');
      const playerAAgent = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(playerAAgent.playerActivity?.activity, 'having-coffee');
    });
  });
});
