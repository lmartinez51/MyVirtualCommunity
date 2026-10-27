import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  enterRestaurant,
  purchaseOffering,
  validateWorldState,
  PurchaseOfferingResult,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { Offering } from '../src/core/entities/offering.js';

describe('Purchase Offering Interaction (Milestone 8)', () => {
  // Test fixture setup helper: boots at 09:00:00 local / 15:00:00 UTC (open restaurant window) and places player inside
  function setupOpenWorldWithPlayerInside() {
    const clock = WorldClock.create('2026-09-14T15:00:00.000Z');
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

  describe('Preconditions and Negative Tests with Zero State Mutation', () => {
    test('1. fails with agent-not-found when agent does not exist', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      const stateBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:non-existent',
        'offering:development-coffee',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-found');
      assert.equal(result.playerId, 'agent:non-existent');
      assert.equal(result.offeringId, 'offering:development-coffee');

      // Zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
    });

    test('2. fails with agent-not-player when agent is an NPC', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      const stateBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-npc',
        'offering:development-coffee',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-player');
      assert.equal(result.playerId, 'agent:dev-npc');
      assert.equal(result.offeringId, 'offering:development-coffee');

      // Zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
    });

    test('3. fails with restaurant-not-found when specified restaurant does not exist', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      const stateBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:unknown-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-not-found');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.offeringId, 'offering:development-coffee');
      assert.equal(result.restaurantId, 'restaurant:unknown-restaurant');

      // Zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
    });

    test('4. fails with not-inside-restaurant when player is outside the restaurant', () => {
      const clock = WorldClock.create('2026-09-14T15:00:00.000Z');
      const state = createInitialWorldState(clock);
      // Player starts at building:development-building, NOT inside restaurant:development-restaurant
      const stateBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'not-inside-restaurant');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.offeringId, 'offering:development-coffee');
      assert.equal(result.restaurantId, 'restaurant:development-restaurant');

      // Zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
    });

    test('5. fails with restaurant-closed when restaurant is closed', () => {
      // Create world at 08:00:00 local / 14:00:00 UTC (closed window)
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      // Position player inside closed restaurant for testing operational check
      player.locationId = 'restaurant:development-restaurant';
      const stateBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-closed');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.offeringId, 'offering:development-coffee');
      assert.equal(result.restaurantId, 'restaurant:development-restaurant');

      // Zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
    });

    test('6. fails with offering-not-found when offering does not exist', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      const stateBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:non-existent',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'offering-not-found');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.offeringId, 'offering:non-existent');

      // Zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
    });

    test('7. fails with offering-not-at-restaurant when offering belongs to another restaurant', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      // Add another restaurant and an offering that belongs to it
      state.restaurants.push({
        id: 'restaurant:other-bistro',
        type: 'restaurant',
        name: 'Other Bistro',
        buildingId: 'building:development-building',
        operationalState: 'open',
        operationalSince: '2026-09-14T15:00:00.000Z',
        balanceMinor: 0,
        currency: 'USD',
      });
      const otherOffering: Offering = {
        id: 'offering:other-tea',
        type: 'offering',
        name: 'Tea',
        restaurantId: 'restaurant:other-bistro',
        priceMinor: 300,
        currency: 'USD',
      };
      state.offerings.push(otherOffering);

      const stateBefore = JSON.stringify(state);

      // Player is inside restaurant:development-restaurant, attempting to purchase offering from other-bistro
      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:other-tea',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'offering-not-at-restaurant');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.offeringId, 'offering:other-tea');
      assert.equal(result.restaurantId, 'restaurant:development-restaurant');

      // Zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
    });

    test('8. fails with currency-mismatch when currencies differ', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      // Set player currency to EUR
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.currency = 'EUR';
      const stateBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'currency-mismatch');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.offeringId, 'offering:development-coffee');

      // Zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
    });

    test('9. fails with insufficient-funds when player balance is lower than offering price', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.balanceMinor = 200; // Coffee costs 500
      const restaurant = state.restaurants.find(
        (r) => r.id === 'restaurant:development-restaurant'
      )!;
      restaurant.balanceMinor = 0;
      const stateBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'insufficient-funds');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.offeringId, 'offering:development-coffee');
      assert.equal(result.playerBalanceAfter, 200);
      assert.equal(result.restaurantBalanceAfter, 0);

      // Zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
      assert.equal(player.balanceMinor, 200);
      assert.equal(restaurant.balanceMinor, 0);
    });
  });

  describe('Successful Single Purchase & State Isolation', () => {
    test('10. successfully executes purchase, transfers price atomically, and preserves world state isolation', () => {
      const { clock, state } = setupOpenWorldWithPlayerInside();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find(
        (r) => r.id === 'restaurant:development-restaurant'
      )!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // Capture baselines
      assert.equal(player.balanceMinor, 2000);
      assert.equal(restaurant.balanceMinor, 0);
      const originalWorldTime = state.worldTime;
      const originalClockTime = clock.getTime();
      const originalPlayerLoc = player.locationId;
      const originalPlayerActivity = player.activityState;
      const originalPlayerSince = player.activitySince;
      const originalRestaurantOpState = restaurant.operationalState;
      const originalRestaurantOpSince = restaurant.operationalSince;
      const originalNpcLoc = npc.locationId;
      const originalNpcActivity = npc.activityState;
      const originalPlaces = JSON.stringify(state.places);
      const originalOfferings = JSON.stringify(state.offerings);

      const result: PurchaseOfferingResult = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        { silent: true }
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.offeringId, 'offering:development-coffee');
      assert.equal(result.restaurantId, 'restaurant:development-restaurant');
      assert.equal(result.amountMinor, 500);
      assert.equal(result.currency, 'USD');
      assert.equal(result.playerBalanceAfter, 1500);
      assert.equal(result.restaurantBalanceAfter, 500);

      // Authoritative state mutations
      assert.equal(player.balanceMinor, 1500);
      assert.equal(restaurant.balanceMinor, 500);

      // State isolation guarantees:
      assert.equal(state.worldTime, originalWorldTime);
      assert.equal(clock.getTime(), originalClockTime);
      assert.equal(player.locationId, originalPlayerLoc);
      assert.equal(player.activityState, originalPlayerActivity);
      assert.equal(player.activitySince, originalPlayerSince);
      assert.equal(restaurant.operationalState, originalRestaurantOpState);
      assert.equal(restaurant.operationalSince, originalRestaurantOpSince);
      assert.equal(npc.locationId, originalNpcLoc);
      assert.equal(npc.activityState, originalNpcActivity);
      assert.equal(JSON.stringify(state.places), originalPlaces);
      assert.equal(JSON.stringify(state.offerings), originalOfferings);

      // State passes validation
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  describe('Repeated Purchase Boundary Condition', () => {
    test('12. allows exactly 4 purchases and rejects the 5th with insufficient-funds at zero balance', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find(
        (r) => r.id === 'restaurant:development-restaurant'
      )!;

      // Initial: player = 2000, restaurant = 0
      assert.equal(player.balanceMinor, 2000);
      assert.equal(restaurant.balanceMinor, 0);

      // Purchase #1: 2000 -> 1500, 0 -> 500
      const p1 = purchaseOffering(state, 'agent:dev-player', 'offering:development-coffee', {
        silent: true,
      });
      assert.equal(p1.success, true);
      assert.equal(p1.code, 'success');
      assert.equal(player.balanceMinor, 1500);
      assert.equal(restaurant.balanceMinor, 500);

      // Purchase #2: 1500 -> 1000, 500 -> 1000
      const p2 = purchaseOffering(state, 'agent:dev-player', 'offering:development-coffee', {
        silent: true,
      });
      assert.equal(p2.success, true);
      assert.equal(p2.code, 'success');
      assert.equal(player.balanceMinor, 1000);
      assert.equal(restaurant.balanceMinor, 1000);

      // Purchase #3: 1000 -> 500, 1000 -> 1500
      const p3 = purchaseOffering(state, 'agent:dev-player', 'offering:development-coffee', {
        silent: true,
      });
      assert.equal(p3.success, true);
      assert.equal(p3.code, 'success');
      assert.equal(player.balanceMinor, 500);
      assert.equal(restaurant.balanceMinor, 1500);

      // Purchase #4: 500 -> 0, 1500 -> 2000
      const p4 = purchaseOffering(state, 'agent:dev-player', 'offering:development-coffee', {
        silent: true,
      });
      assert.equal(p4.success, true);
      assert.equal(p4.code, 'success');
      assert.equal(player.balanceMinor, 0);
      assert.equal(restaurant.balanceMinor, 2000);

      // Snapshot state at zero funds
      const stateAtZero = JSON.stringify(state);

      // Purchase #5: Rejected! (0 < 500)
      const p5 = purchaseOffering(state, 'agent:dev-player', 'offering:development-coffee', {
        silent: true,
      });
      assert.equal(p5.success, false);
      assert.equal(p5.code, 'insufficient-funds');
      assert.equal(p5.playerBalanceAfter, 0);
      assert.equal(p5.restaurantBalanceAfter, 2000);

      // Balances remain untouched
      assert.equal(player.balanceMinor, 0);
      assert.equal(restaurant.balanceMinor, 2000);
      assert.equal(JSON.stringify(state), stateAtZero);
    });
  });

  describe('Persistence and Reconstruction Across Runtimes', () => {
    test('11. preserves debited and credited balances across process save and restore', () => {
      const testFile = join(tmpdir(), `purchase-persistence-test-${Date.now()}.json`);
      try {
        // --- SESSION A: Purchase coffee and persist ---
        const clockA = WorldClock.create('2026-09-14T15:00:00.000Z');
        const stateA = createInitialWorldState(clockA);
        enterRestaurant(
          stateA,
          'agent:dev-player',
          'restaurant:development-restaurant',
          { silent: true }
        );

        const purchaseRes = purchaseOffering(
          stateA,
          'agent:dev-player',
          'offering:development-coffee',
          { silent: true }
        );
        assert.equal(purchaseRes.success, true);

        const persistenceA = new LocalFilePersistence(testFile);
        persistenceA.save(snapshotWorldState(clockA, stateA));

        // --- SESSION B: Reconstruct in fresh runtime and verify balances ---
        const persistenceB = new LocalFilePersistence(testFile);
        const stateB = persistenceB.load();
        assert.ok(stateB !== null);
        assert.doesNotThrow(() => validateWorldState(stateB));

        assert.equal(stateB.version, 19);
        const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
        const restaurantB = stateB.restaurants.find(
          (r) => r.id === 'restaurant:development-restaurant'
        )!;

        assert.equal(playerB.balanceMinor, 1500);
        assert.equal(playerB.currency, 'USD');
        assert.equal(restaurantB.balanceMinor, 500);
        assert.equal(restaurantB.currency, 'USD');

        // Confirm second purchase in Session B works smoothly from restored balances
        const p2 = purchaseOffering(
          stateB,
          'agent:dev-player',
          'offering:development-coffee',
          { silent: true }
        );
        assert.equal(p2.success, true);
        assert.equal(playerB.balanceMinor, 1000);
        assert.equal(restaurantB.balanceMinor, 1000);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });

  describe('Observability Logging', () => {
    test('logs formatted message when silent is false or omitted', () => {
      const { state } = setupOpenWorldWithPlayerInside();
      const loggedMessages: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => {
        loggedMessages.push(msg);
      };

      try {
        const result = purchaseOffering(
          state,
          'agent:dev-player',
          'offering:development-coffee'
        );
        assert.equal(result.success, true);
        assert.ok(
          loggedMessages.some((msg) =>
            msg.includes(
              '[purchase] player=agent:dev-player offering=offering:development-coffee amount=500 USD'
            )
          )
        );
        assert.ok(
          loggedMessages.some((msg) =>
            msg.includes(
              '[purchase] success playerBalance=1500 restaurantBalance=500'
            )
          )
        );
      } finally {
        console.log = originalLog;
      }
    });
  });
});
