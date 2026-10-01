import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  startEatingPastry,
  inspectPlayerHistory,
  OwnedItem,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createPresentationModel } from '../src/client/projections.js';

describe('Milestone 34: Unified Consumable Activity Lifecycle', () => {
  const OPEN_TIME = '2026-09-14T15:00:00.000Z';

  function setupOpenWorld() {
    const clock = WorldClock.create(OPEN_TIME);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    sim.tick(); // Open restaurant at 09:00 local
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    enterRestaurant(state, player.id, 'restaurant:development-restaurant');
    return { clock, state, sim, player };
  }

  describe('1. Precondition Validation & Zero Mutation', () => {
    it('rejects startEatingPastry if player is not found', () => {
      const { state } = setupOpenWorld();
      const beforeSnapshot = JSON.stringify(state);
      const res = startEatingPastry(state, 'agent:non-existent');
      assert.equal(res.success, false);
      assert.equal(res.code, 'agent-not-found');
      assert.equal(JSON.stringify(state), beforeSnapshot);
    });

    it('rejects startEatingPastry if caller is not a player agent', () => {
      const { state } = setupOpenWorld();
      const beforeSnapshot = JSON.stringify(state);
      const res = startEatingPastry(state, 'agent:dev-npc');
      assert.equal(res.success, false);
      assert.equal(res.code, 'agent-not-player');
      assert.equal(JSON.stringify(state), beforeSnapshot);
    });

    it('rejects startEatingPastry if player is not in a restaurant', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const beforeSnapshot = JSON.stringify(state);
      const res = startEatingPastry(state, 'agent:dev-player');
      assert.equal(res.success, false);
      assert.equal(res.code, 'not-inside-restaurant');
      assert.equal(JSON.stringify(state), beforeSnapshot);
    });

    it('rejects startEatingPastry if restaurant is closed', () => {
      const { state, player } = setupOpenWorld();
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'closed';
      const beforeSnapshot = JSON.stringify(state);
      const res = startEatingPastry(state, player.id);
      assert.equal(res.success, false);
      assert.equal(res.code, 'restaurant-closed');
      assert.equal(JSON.stringify(state), beforeSnapshot);
    });

    it('rejects startEatingPastry if player has no available Pan Dulce in state.items', () => {
      const { state, player } = setupOpenWorld();
      // Buy coffee instead of pastry
      purchaseOffering(state, player.id, 'offering:development-coffee');
      const beforeSnapshot = JSON.stringify(state);
      const res = startEatingPastry(state, player.id);
      assert.equal(res.success, false);
      assert.equal(res.code, 'purchase-required');
      assert.equal(JSON.stringify(state), beforeSnapshot);
    });

    it('rejects startEatingPastry if player is already engaged in an active activity', () => {
      const { state, player } = setupOpenWorld();
      purchaseOffering(state, player.id, 'offering:development-pastry');
      purchaseOffering(state, player.id, 'offering:development-pastry');

      // Start first pastry
      const firstRes = startEatingPastry(state, player.id);
      assert.equal(firstRes.success, true);

      const beforeSnapshot = JSON.stringify(state);
      // Attempt to start another while first is active
      const secondRes = startEatingPastry(state, player.id);
      assert.equal(secondRes.success, false);
      assert.equal(secondRes.code, 'activity-already-active');
      assert.equal(JSON.stringify(state), beforeSnapshot);
    });
  });

  describe('2. Deterministic FIFO Item Selection & Consumption', () => {
    it('consumes the oldest eligible item based on acquiredAt with numeric ID tie-breaker', () => {
      const { state, player } = setupOpenWorld();

      const itemA: OwnedItem = {
        id: 'item:2',
        ownerAgentId: player.id,
        offeringId: 'offering:development-pastry',
        restaurantId: 'restaurant:development-restaurant',
        status: 'available',
        acquiredAt: '2026-09-14T15:05:00.000Z',
        consumedAt: null,
      };
      const itemB: OwnedItem = {
        id: 'item:1',
        ownerAgentId: player.id,
        offeringId: 'offering:development-pastry',
        restaurantId: 'restaurant:development-restaurant',
        status: 'available',
        acquiredAt: '2026-09-14T15:01:00.000Z', // Oldest
        consumedAt: null,
      };
      const itemC: OwnedItem = {
        id: 'item:3',
        ownerAgentId: player.id,
        offeringId: 'offering:development-pastry',
        restaurantId: 'restaurant:development-restaurant',
        status: 'available',
        acquiredAt: '2026-09-14T15:01:00.000Z', // Same acquiredAt as item 1, higher ID
        consumedAt: null,
      };

      state.items.push(itemA, itemB, itemC);

      const res = startEatingPastry(state, player.id);
      assert.equal(res.success, true);
      assert.equal(res.code, 'success');

      // Oldest item (itemB, item:1) must have been selected
      assert.equal(res.itemId, 'item:1');
      assert.equal(res.activity, 'eating-pastry');
      assert.equal(player.playerActivity?.itemId, 'item:1');
      assert.equal(player.playerActivity?.activity, 'eating-pastry');
      assert.equal(player.playerActivity?.durationMs, 900_000);
      assert.equal(player.playerActivity?.startedAt, OPEN_TIME);

      // Verify item transition in state.items
      const selectedItem = state.items.find((it) => it.id === 'item:1')!;
      assert.equal(selectedItem.status, 'consumed');
      assert.equal(selectedItem.consumedAt, OPEN_TIME);

      // Verify other items remain available
      const remainingA = state.items.find((it) => it.id === 'item:2')!;
      const remainingC = state.items.find((it) => it.id === 'item:3')!;
      assert.equal(remainingA.status, 'available');
      assert.equal(remainingC.status, 'available');
    });

    it('uses numeric item:N tie-breaking when acquiredAt is identical', () => {
      const { state, player } = setupOpenWorld();

      const item10: OwnedItem = {
        id: 'item:10',
        ownerAgentId: player.id,
        offeringId: 'offering:development-pastry',
        restaurantId: 'restaurant:development-restaurant',
        status: 'available',
        acquiredAt: '2026-09-14T15:00:00.000Z',
        consumedAt: null,
      };
      const item2: OwnedItem = {
        id: 'item:2',
        ownerAgentId: player.id,
        offeringId: 'offering:development-pastry',
        restaurantId: 'restaurant:development-restaurant',
        status: 'available',
        acquiredAt: '2026-09-14T15:00:00.000Z',
        consumedAt: null,
      };

      state.items.push(item10, item2);

      const res = startEatingPastry(state, player.id);
      assert.equal(res.success, true);
      // item:2 < item:10 numerically
      assert.equal(res.itemId, 'item:2');
      assert.equal(player.playerActivity?.itemId, 'item:2');
    });
  });

  describe('3. Simulation Completion & Unified ActivityCompletionRecord', () => {
    it('evaluates completion using durationMs (15 min / 900000 ms) and records theoretical boundary', () => {
      const { clock, state, sim, player } = setupOpenWorld();
      purchaseOffering(state, player.id, 'offering:development-pastry');

      const startRes = startEatingPastry(state, player.id);
      assert.equal(startRes.success, true);
      assert.equal(state.activityCompletions.length, 0);

      // Advance by 14 minutes: should remain active
      clock.advance(14 * 60_000);
      const tick1 = sim.tick();
      assert.equal(tick1.playerActivityTransitions.length, 0);
      assert.equal(player.playerActivity?.completedAt, null);
      assert.equal(state.activityCompletions.length, 0);

      // Advance past the 15-minute mark to 15:20:00 UTC (late tick)
      clock.advance(6 * 60_000); // Now 15:20:00 UTC
      const tick2 = sim.tick();
      assert.equal(tick2.playerActivityTransitions.length, 1);

      // Theoretical boundary timestamp must be 15:15:00.000Z (startedAt + 15 min), NOT 15:20:00.000Z
      const expectedCompletedAt = '2026-09-14T15:15:00.000Z';
      assert.equal(player.playerActivity?.completedAt, expectedCompletedAt);
      assert.equal(state.activityCompletions.length, 1);

      const record = state.activityCompletions[0];
      assert.equal(record.id, 'activity-completion:1');
      assert.equal(record.playerId, player.id);
      assert.equal(record.restaurantId, 'restaurant:development-restaurant');
      assert.equal(record.startedAt, OPEN_TIME);
      assert.equal(record.completedAt, expectedCompletedAt);
      assert.equal(record.activity, 'eating-pastry');
      assert.equal(record.offeringId, 'offering:development-pastry');
      assert.ok(record.itemId !== null);
    });

    it('subsequent ticks are strictly idempotent and do not create duplicate records', () => {
      const { clock, state, sim, player } = setupOpenWorld();
      purchaseOffering(state, player.id, 'offering:development-pastry');
      startEatingPastry(state, player.id);

      clock.advance(15 * 60_000);
      sim.tick();
      assert.equal(state.activityCompletions.length, 1);

      clock.advance(5 * 60_000);
      const tick2 = sim.tick();
      assert.equal(tick2.playerActivityTransitions.length, 0);
      assert.equal(state.activityCompletions.length, 1);

      clock.advance(60 * 60_000);
      const tick3 = sim.tick();
      assert.equal(tick3.playerActivityTransitions.length, 0);
      assert.equal(state.activityCompletions.length, 1);
    });

    it('supports sequential activities across having-coffee and eating-pastry with monotonic sequence IDs', () => {
      const { clock, state, sim, player } = setupOpenWorld();

      // Activity 1: Coffee
      purchaseOffering(state, player.id, 'offering:development-coffee');
      startHavingCoffee(state, player.id);
      clock.advance(15 * 60_000);
      sim.tick();
      assert.equal(state.activityCompletions.length, 1);
      assert.equal(state.activityCompletions[0].id, 'activity-completion:1');
      assert.equal(state.activityCompletions[0].activity, 'having-coffee');

      // Activity 2: Pastry
      purchaseOffering(state, player.id, 'offering:development-pastry');
      startEatingPastry(state, player.id);
      clock.advance(15 * 60_000);
      sim.tick();
      assert.equal(state.activityCompletions.length, 2);
      assert.equal(state.activityCompletions[1].id, 'activity-completion:2');
      assert.equal(state.activityCompletions[1].activity, 'eating-pastry');
    });
  });

  describe('4. Historical Perception Integration', () => {
    it('inspectPlayerHistory returns unified activityCompletions and backwards-compatible coffeeCompletions alias', () => {
      const { clock, state, sim, player } = setupOpenWorld();

      purchaseOffering(state, player.id, 'offering:development-coffee');
      startHavingCoffee(state, player.id);
      clock.advance(15 * 60_000);
      sim.tick();

      purchaseOffering(state, player.id, 'offering:development-pastry');
      startEatingPastry(state, player.id);
      clock.advance(15 * 60_000);
      sim.tick();

      const historyRes = inspectPlayerHistory(state, player.id);
      assert.equal(historyRes.success, true);
      assert.ok(historyRes.history);
      assert.equal(historyRes.history.activityCompletions.length, 2);
      assert.equal(historyRes.history.activityCompletions[0].activity, 'having-coffee');
      assert.equal(historyRes.history.activityCompletions[1].activity, 'eating-pastry');

      // coffeeCompletions backward compatibility alias filters for coffee only
      assert.equal(historyRes.history.coffeeCompletions.length, 1);
      assert.equal(historyRes.history.coffeeCompletions[0].id, 'activity-completion:1');
    });
  });

  describe('5. Client Projection Affordances', () => {
    it('projects startEatingPastry affordance when player holds Pan Dulce at an open restaurant', () => {
      const statusData = {
        worldId: 'juarez-el-paso',
        worldTime: OPEN_TIME,
        schemaVersion: 13,
        activePlayerId: 'agent:dev-player',
      };
      const locationData = {
        success: true,
        location: {
          id: 'restaurant:development-restaurant',
          type: 'restaurant',
          name: 'Development Restaurant',
          operationalState: 'open',
          offerings: [],
          agents: [],
        },
        playerInventory: [
          {
            id: 'item:1',
            ownerAgentId: 'agent:dev-player',
            offeringId: 'offering:development-pastry',
            restaurantId: 'restaurant:development-restaurant',
            name: 'Pan Dulce',
            status: 'available',
            acquiredAt: OPEN_TIME,
          },
        ],
      };

      const model = createPresentationModel(statusData, locationData);
      const eatAffordance = model.affordances.find((a) => a.commandName === 'startEatingPastry');
      assert.ok(eatAffordance, 'Expected startEatingPastry affordance to be present');
      assert.equal(eatAffordance.group, 'ACT');
      assert.equal(eatAffordance.label, 'Eat Pan Dulce (Pan Dulce)');
    });

    it('does not project startEatingPastry when player has no Pan Dulce', () => {
      const statusData = {
        worldId: 'juarez-el-paso',
        worldTime: OPEN_TIME,
        schemaVersion: 13,
        activePlayerId: 'agent:dev-player',
      };
      const locationData = {
        success: true,
        location: {
          id: 'restaurant:development-restaurant',
          type: 'restaurant',
          name: 'Development Restaurant',
          operationalState: 'open',
          offerings: [],
          agents: [],
        },
        playerInventory: [
          {
            id: 'item:1',
            ownerAgentId: 'agent:dev-player',
            offeringId: 'offering:development-coffee',
            restaurantId: 'restaurant:development-restaurant',
            name: 'Coffee',
            status: 'available',
            acquiredAt: OPEN_TIME,
          },
        ],
      };

      const model = createPresentationModel(statusData, locationData);
      const eatAffordance = model.affordances.find((a) => a.commandName === 'startEatingPastry');
      assert.equal(eatAffordance, undefined);
    });
  });

  describe('6. Persistence Roundtrip', () => {
    it('persists and restores active and completed pastry activities with schema version 13', () => {
      const testFile = join(tmpdir(), `test-pastry-persistence-${Date.now()}.json`);
      try {
        const { clock, state, sim, player } = setupOpenWorld();
        purchaseOffering(state, player.id, 'offering:development-pastry');
        startEatingPastry(state, player.id);

        const persistence1 = new LocalFilePersistence(testFile);
        persistence1.save(snapshotWorldState(clock, state));

        // Restore active state
        const restored1 = persistence1.load()!;
        assert.ok(restored1);
        validateWorldState(restored1);
        assert.equal(restored1.version, 18);
        const restoredPlayer = restored1.agents.find((a) => a.id === player.id)!;
        assert.equal(restoredPlayer.playerActivity?.activity, 'eating-pastry');
        assert.equal(restoredPlayer.playerActivity?.durationMs, 900_000);
        assert.ok(restoredPlayer.playerActivity?.itemId);

        // Resume simulation in fresh runtime
        const clock2 = WorldClock.create(restored1.worldTime);
        const sim2 = new Simulation(clock2, restored1, { silent: true });
        clock2.advance(15 * 60_000);
        sim2.tick();

        assert.equal(restored1.activityCompletions.length, 1);
        assert.equal(restored1.activityCompletions[0].activity, 'eating-pastry');

        // Persist completed state
        const persistence2 = new LocalFilePersistence(testFile);
        persistence2.save(snapshotWorldState(clock2, restored1));

        const restored2 = persistence2.load()!;
        assert.ok(restored2);
        validateWorldState(restored2);
        assert.equal(restored2.version, 18);
        assert.equal(restored2.activityCompletions.length, 1);
        assert.equal(restored2.activityCompletions[0].activity, 'eating-pastry');
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });
});
