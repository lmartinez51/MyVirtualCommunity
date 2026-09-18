import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  inspectPlayerHistory,
  validateWorldState,
  snapshotWorldState,
  WorldState,
  PurchaseRecord,
  CoffeeCompletionRecord,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 17-A: Authoritative Personal Historical Perception (inspectPlayerHistory)', () => {
  const OPEN_TIME = '2026-09-14T09:00:00.000Z';

  function setupWorldWithPurchasesAndCompletions(): {
    clock: WorldClock;
    state: WorldState;
    sim: Simulation;
  } {
    const clock = WorldClock.create(OPEN_TIME);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    sim.tick(); // Open restaurant at 09:00 UTC

    // Player enters restaurant
    const enterRes = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
    assert.equal(enterRes.success, true);

    // Player purchases coffee
    const purchaseRes = purchaseOffering(state, 'agent:dev-player', 'offering:development-coffee');
    assert.equal(purchaseRes.success, true);

    // Player starts having coffee
    const coffeeRes = startHavingCoffee(state, 'agent:dev-player', purchaseRes);
    assert.equal(coffeeRes.success, true);

    // Advance 15 minutes and tick simulation to complete coffee
    clock.advance(15 * 60_000);
    const tickRes = sim.tick();
    assert.equal(tickRes.playerActivityTransitions?.length, 1);

    return { clock, state, sim };
  }

  // =========================================================================
  // 1. Successful Inspection & Record Retrieval
  // =========================================================================
  describe('Successful History Inspection', () => {
    test('a player with one purchase and one coffee completion receives both records', () => {
      const { state } = setupWorldWithPurchasesAndCompletions();

      const result = inspectPlayerHistory(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.ok(result.history);
      assert.equal(result.history.playerId, 'agent:dev-player');

      // Verify purchase record
      assert.equal(result.history.purchases.length, 1);
      const purchase = result.history.purchases[0];
      assert.equal(purchase.id, 'purchase:1');
      assert.equal(purchase.playerId, 'agent:dev-player');
      assert.equal(purchase.restaurantId, 'restaurant:development-restaurant');
      assert.equal(purchase.offeringId, 'offering:development-coffee');
      assert.equal(purchase.amountMinor, 500);
      assert.equal(purchase.currency, 'USD');
      assert.equal(purchase.worldTime, OPEN_TIME);

      // Verify coffee completion record
      assert.equal(result.history.coffeeCompletions.length, 1);
      const completion = result.history.coffeeCompletions[0];
      assert.equal(completion.id, 'coffee-completion:1');
      assert.equal(completion.playerId, 'agent:dev-player');
      assert.equal(completion.restaurantId, 'restaurant:development-restaurant');
      assert.equal(completion.startedAt, OPEN_TIME);
      assert.equal(completion.completedAt, '2026-09-14T09:15:00.000Z');
    });

    test('a valid player with no records receives empty arrays', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);

      const result = inspectPlayerHistory(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.ok(result.history);
      assert.deepEqual(result.history.purchases, []);
      assert.deepEqual(result.history.coffeeCompletions, []);
    });
  });

  // =========================================================================
  // 2. Precondition Validations & Zero State Mutation
  // =========================================================================
  describe('Precondition Validations & Zero State Mutation', () => {
    test('fails with "player-not-found" when player does not exist, with zero mutation', () => {
      const { state } = setupWorldWithPurchasesAndCompletions();
      const snapshotBefore = JSON.stringify(state);

      const result = inspectPlayerHistory(state, 'agent:non-existent');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(result.history, undefined);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "player-not-player" when an NPC is passed, with zero mutation', () => {
      const { state } = setupWorldWithPurchasesAndCompletions();
      const snapshotBefore = JSON.stringify(state);

      const result = inspectPlayerHistory(state, 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-player');
      assert.match(result.message, /is not a player/);
      assert.equal(result.history, undefined);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('successful inspection produces ZERO state mutation', () => {
      const { state } = setupWorldWithPurchasesAndCompletions();
      const snapshotBefore = JSON.stringify(state);

      const result = inspectPlayerHistory(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 3. Player Isolation
  // =========================================================================
  describe('Player Isolation', () => {
    test('returns only records belonging to the requested playerId when multiple players exist', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);

      // Add a second synthetic player to state
      state.agents.push({
        id: 'agent:other-player',
        type: 'agent',
        name: 'Other Player',
        agentType: 'player',
        activityState: 'active',
        activitySince: OPEN_TIME,
        locationId: 'building:development-building',
        balanceMinor: 1000,
        currency: 'USD',
        playerActivity: null,
      });

      // Add purchases for both players
      state.purchases.push(
        {
          id: 'purchase:1',
          worldTime: OPEN_TIME,
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:development-coffee',
          amountMinor: 500,
          currency: 'USD',
        },
        {
          id: 'purchase:2',
          worldTime: OPEN_TIME,
          playerId: 'agent:other-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:development-coffee',
          amountMinor: 500,
          currency: 'USD',
        },
        {
          id: 'purchase:3',
          worldTime: '2026-09-14T09:30:00.000Z',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:development-coffee',
          amountMinor: 500,
          currency: 'USD',
        }
      );

      // Add coffee completions for both players
      state.coffeeCompletions.push(
        {
          id: 'coffee-completion:1',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: OPEN_TIME,
          completedAt: '2026-09-14T09:15:00.000Z',
        },
        {
          id: 'coffee-completion:2',
          playerId: 'agent:other-player',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: OPEN_TIME,
          completedAt: '2026-09-14T09:15:00.000Z',
        }
      );

      // Inspect dev-player
      const devResult = inspectPlayerHistory(state, 'agent:dev-player');
      assert.equal(devResult.success, true);
      assert.ok(devResult.history);
      assert.equal(devResult.history.purchases.length, 2);
      assert.deepEqual(
        devResult.history.purchases.map((p) => p.id),
        ['purchase:1', 'purchase:3']
      );
      assert.equal(devResult.history.coffeeCompletions.length, 1);
      assert.equal(devResult.history.coffeeCompletions[0].id, 'coffee-completion:1');

      // Inspect other-player
      const otherResult = inspectPlayerHistory(state, 'agent:other-player');
      assert.equal(otherResult.success, true);
      assert.ok(otherResult.history);
      assert.equal(otherResult.history.purchases.length, 1);
      assert.equal(otherResult.history.purchases[0].id, 'purchase:2');
      assert.equal(otherResult.history.coffeeCompletions.length, 1);
      assert.equal(otherResult.history.coffeeCompletions[0].id, 'coffee-completion:2');
    });
  });

  // =========================================================================
  // 4. Historical Value Preservation & Append Ordering
  // =========================================================================
  describe('Historical Value Preservation & Append Ordering', () => {
    test('preserves exact historical values even if offering price or restaurant state differs', () => {
      const { state } = setupWorldWithPurchasesAndCompletions();

      // Mutate current offering price and close restaurant in current state
      const offering = state.offerings.find((o) => o.id === 'offering:development-coffee')!;
      offering.priceMinor = 999;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'closed';

      const result = inspectPlayerHistory(state, 'agent:dev-player');
      assert.equal(result.success, true);
      assert.ok(result.history);

      // Historical record must still reflect the 500 minor units paid, NOT the current 999 price
      assert.equal(result.history.purchases[0].amountMinor, 500);
      assert.equal(result.history.purchases[0].currency, 'USD');
      assert.equal(result.history.purchases[0].worldTime, OPEN_TIME);

      // Historical completion record must still reflect recorded completion time
      assert.equal(result.history.coffeeCompletions[0].completedAt, '2026-09-14T09:15:00.000Z');
    });

    test('preserves deterministic append order of multiple historical records', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);

      const records: PurchaseRecord[] = [
        { id: 'purchase:1', worldTime: '2026-09-14T09:00:00.000Z', playerId: 'agent:dev-player', restaurantId: 'restaurant:development-restaurant', offeringId: 'offering:development-coffee', amountMinor: 500, currency: 'USD' },
        { id: 'purchase:2', worldTime: '2026-09-14T10:00:00.000Z', playerId: 'agent:dev-player', restaurantId: 'restaurant:development-restaurant', offeringId: 'offering:development-coffee', amountMinor: 500, currency: 'USD' },
        { id: 'purchase:3', worldTime: '2026-09-14T11:00:00.000Z', playerId: 'agent:dev-player', restaurantId: 'restaurant:development-restaurant', offeringId: 'offering:development-coffee', amountMinor: 500, currency: 'USD' },
      ];
      state.purchases.push(...records);

      const completions: CoffeeCompletionRecord[] = [
        { id: 'coffee-completion:1', playerId: 'agent:dev-player', restaurantId: 'restaurant:development-restaurant', startedAt: '2026-09-14T09:00:00.000Z', completedAt: '2026-09-14T09:15:00.000Z' },
        { id: 'coffee-completion:2', playerId: 'agent:dev-player', restaurantId: 'restaurant:development-restaurant', startedAt: '2026-09-14T10:00:00.000Z', completedAt: '2026-09-14T10:15:00.000Z' },
      ];
      state.coffeeCompletions.push(...completions);

      const result = inspectPlayerHistory(state, 'agent:dev-player');
      assert.equal(result.success, true);
      assert.ok(result.history);

      assert.deepEqual(
        result.history.purchases.map((p) => p.id),
        ['purchase:1', 'purchase:2', 'purchase:3']
      );
      assert.deepEqual(
        result.history.coffeeCompletions.map((c) => c.id),
        ['coffee-completion:1', 'coffee-completion:2']
      );
    });
  });

  // =========================================================================
  // 5. Result Isolation (Defensive Copying)
  // =========================================================================
  describe('Result Isolation (Defensive Copying)', () => {
    test('modifying returned history arrays or objects does NOT mutate authoritative WorldState', () => {
      const { state } = setupWorldWithPurchasesAndCompletions();

      const result = inspectPlayerHistory(state, 'agent:dev-player');
      assert.equal(result.success, true);
      assert.ok(result.history);

      // Mutate the returned array
      result.history.purchases.push({
        id: 'purchase:tampered',
        worldTime: '2099-01-01T00:00:00.000Z',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 9999,
        currency: 'USD',
      });
      result.history.coffeeCompletions.push({
        id: 'coffee-completion:tampered',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        startedAt: '2099-01-01T00:00:00.000Z',
        completedAt: '2099-01-01T00:15:00.000Z',
      });

      // Mutate object properties on returned records
      result.history.purchases[0].amountMinor = 12345;
      result.history.coffeeCompletions[0].completedAt = '2099-12-31T23:59:59.000Z';

      // Verify authoritative WorldState is strictly intact
      assert.equal(state.purchases.length, 1);
      assert.equal(state.purchases[0].id, 'purchase:1');
      assert.equal(state.purchases[0].amountMinor, 500);

      assert.equal(state.coffeeCompletions.length, 1);
      assert.equal(state.coffeeCompletions[0].id, 'coffee-completion:1');
      assert.equal(state.coffeeCompletions[0].completedAt, '2026-09-14T09:15:00.000Z');
    });
  });

  // =========================================================================
  // 6. Persistence Roundtrip
  // =========================================================================
  describe('Persistence Roundtrip', () => {
    test('historical perception produces equivalent results before save and after reload', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-m17-test-'));
      const testFile = join(tmpDir, 'world-history-perception.json');

      try {
        const { clock, state } = setupWorldWithPurchasesAndCompletions();

        // Inspect Session A
        const resultA = inspectPlayerHistory(state, 'agent:dev-player');
        assert.equal(resultA.success, true);
        assert.ok(resultA.history);

        // Persist Session A
        const persistenceA = new LocalFilePersistence(testFile);
        persistenceA.save(snapshotWorldState(clock, state));

        // Reconstruct in fresh Session B
        const persistenceB = new LocalFilePersistence(testFile);
        const stateB = persistenceB.load();
        assert.ok(stateB !== null);
        assert.doesNotThrow(() => validateWorldState(stateB));
        assert.equal(stateB.version, 12);

        // Inspect Session B
        const resultB = inspectPlayerHistory(stateB, 'agent:dev-player');
        assert.equal(resultB.success, true);
        assert.ok(resultB.history);

        // Deep equality between Session A and Session B perception
        assert.deepEqual(resultA.history, resultB.history);
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });
});
