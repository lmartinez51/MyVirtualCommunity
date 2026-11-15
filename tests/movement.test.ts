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
  exitRestaurant,
  leaveBuilding,
  transitionAgentLocation,
  validateWorldState,
  snapshotWorldState,
  WorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 10: Leaving & Spatial Movement', () => {
  const OPEN_TIME = '2026-09-14T15:00:00.000Z';

  function setupWorldWithPlayerInOpenRestaurant(): {
    clock: WorldClock;
    state: WorldState;
  } {
    const clock = WorldClock.create(OPEN_TIME);
    const state = createInitialWorldState(clock);
    const enterResult = enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:development-restaurant',
      { silent: true }
    );
    assert.equal(enterResult.success, true);
    return { clock, state };
  }

  // =========================================================================
  // 1. exitRestaurant Interaction
  // =========================================================================
  describe('exitRestaurant Interaction', () => {
    test('successfully exits restaurant into containing building', () => {
      const { state } = setupWorldWithPlayerInOpenRestaurant();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find(
        (r) => r.id === 'restaurant:development-restaurant'
      )!;

      assert.equal(player.locationId, restaurant.id);

      const result = exitRestaurant(
        state,
        'agent:dev-player',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.agentId, 'agent:dev-player');
      assert.equal(result.restaurantId, 'restaurant:development-restaurant');
      assert.equal(result.buildingId, 'building:development-building');
      assert.equal(player.locationId, 'building:development-building');
    });

    test('fails with "agent-not-found" when agent does not exist, with zero mutation', () => {
      const { state } = setupWorldWithPlayerInOpenRestaurant();
      const snapshotBefore = JSON.stringify(state);

      const result = exitRestaurant(
        state,
        'agent:non-existent',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "agent-not-player" when NPC attempts to exit restaurant, with zero mutation', () => {
      const { state } = setupWorldWithPlayerInOpenRestaurant();
      const snapshotBefore = JSON.stringify(state);

      const result = exitRestaurant(
        state,
        'agent:dev-npc',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-player');
      assert.match(result.message, /is not a player/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "restaurant-not-found" when restaurant does not exist, with zero mutation', () => {
      const { state } = setupWorldWithPlayerInOpenRestaurant();
      const snapshotBefore = JSON.stringify(state);

      const result = exitRestaurant(
        state,
        'agent:dev-player',
        'restaurant:non-existent'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "not-inside-restaurant" when player is not inside restaurant, with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      // Player is at building:development-building, not inside restaurant
      const snapshotBefore = JSON.stringify(state);

      const result = exitRestaurant(
        state,
        'agent:dev-player',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'not-inside-restaurant');
      assert.match(result.message, /not inside restaurant/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('preserves worldTime, balances, activityState, playerActivity, and restaurant state', () => {
      const { clock, state } = setupWorldWithPlayerInOpenRestaurant();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find(
        (r) => r.id === 'restaurant:development-restaurant'
      )!;

      const timeBefore = clock.getTime();
      const playerBalanceBefore = player.balanceMinor;
      const restaurantBalanceBefore = restaurant.balanceMinor;
      const activityStateBefore = player.activityState;
      const operationalStateBefore = restaurant.operationalState;

      const result = exitRestaurant(
        state,
        'agent:dev-player',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, true);
      assert.equal(clock.getTime(), timeBefore);
      assert.equal(state.worldTime, timeBefore);
      assert.equal(player.balanceMinor, playerBalanceBefore);
      assert.equal(restaurant.balanceMinor, restaurantBalanceBefore);
      assert.equal(player.activityState, activityStateBefore);
      assert.equal(restaurant.operationalState, operationalStateBefore);
    });
  });

  // =========================================================================
  // 2. leaveBuilding Interaction
  // =========================================================================
  describe('leaveBuilding Interaction', () => {
    test('successfully leaves building into containing street', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Player is at building:development-building
      assert.equal(player.locationId, 'building:development-building');

      const result = leaveBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.agentId, 'agent:dev-player');
      assert.equal(result.buildingId, 'building:development-building');
      assert.equal(result.streetId, 'street:development-street');
      assert.equal(player.locationId, 'street:development-street');
    });

    test('fails with "agent-not-found" when agent does not exist, with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      const result = leaveBuilding(
        state,
        'agent:non-existent',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "agent-not-player" when NPC attempts to leave building, with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      const result = leaveBuilding(
        state,
        'agent:dev-npc',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-player');
      assert.match(result.message, /is not a player/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "building-not-found" when building does not exist, with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      const result = leaveBuilding(
        state,
        'agent:dev-player',
        'building:non-existent'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'building-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "building-not-found" when target place is not of type building, with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'street:development-street';
      const snapshotBefore = JSON.stringify(state);

      // Attempting to leave a street as if it were a building
      const result = leaveBuilding(
        state,
        'agent:dev-player',
        'street:development-street'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'building-not-found');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "not-at-building" when player is at a different location, with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'street:development-street';
      const snapshotBefore = JSON.stringify(state);

      const result = leaveBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'not-at-building');
      assert.match(result.message, /not at building/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "street-not-found" when building parent street is missing/corrupted, with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const building = state.places.find((p) => p.id === 'building:development-building')!;
      building.parentId = 'street:ghost-street';
      const snapshotBefore = JSON.stringify(state);

      const result = leaveBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'street-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('preserves worldTime, balances, activityState, playerActivity, and geography', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const timeBefore = clock.getTime();
      const playerBalanceBefore = player.balanceMinor;
      const activityStateBefore = player.activityState;

      const result = leaveBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, true);
      assert.equal(clock.getTime(), timeBefore);
      assert.equal(state.worldTime, timeBefore);
      assert.equal(player.balanceMinor, playerBalanceBefore);
      assert.equal(player.activityState, activityStateBefore);
      assert.equal(player.locationId, 'street:development-street');
    });
  });

  // =========================================================================
  // 3. Spatial Movement Between Existing Places (transitionAgentLocation)
  // =========================================================================
  describe('Spatial Movement Between Existing Places', () => {
    /**
     * NOTE: transitionAgentLocation() is exercised strictly as the existing low-level
     * spatial state transition primitive, NOT as a pathfinding, routing, or geographic-connectivity system.
     * No reachability, distance, travel-time, or pathfinding rules are implied.
     */
    test('successfully transitions player from street to neighborhood using existing primitive', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Position player at street
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      assert.equal(player.locationId, 'street:development-street');

      const timeBefore = clock.getTime();

      // Transition to neighborhood
      const updatedAgent = transitionAgentLocation(
        state,
        'agent:dev-player',
        'neighborhood:development-neighborhood'
      );

      assert.equal(updatedAgent.locationId, 'neighborhood:development-neighborhood');
      assert.equal(player.locationId, 'neighborhood:development-neighborhood');
      assert.equal(clock.getTime(), timeBefore);
      assert.equal(state.worldTime, timeBefore);
    });

    test('rejects transition to non-existent place with error and zero state mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      assert.throws(
        () => transitionAgentLocation(state, 'agent:dev-player', 'place:does-not-exist'),
        /does not exist in world state/
      );
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('rejects transition to non-place entity (e.g. restaurant ID) with error and zero state mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      // Restaurants are in state.restaurants, not state.places; transitionAgentLocation strictly validates state.places
      assert.throws(
        () => transitionAgentLocation(state, 'agent:dev-player', 'restaurant:development-restaurant'),
        /does not exist in world state/
      );
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('rejects transition to non-place entity (e.g. agent ID) with error and zero state mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      assert.throws(
        () => transitionAgentLocation(state, 'agent:dev-player', 'agent:dev-npc'),
        /does not exist in world state/
      );
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('rejects empty or whitespace target place ID with error and zero state mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      assert.throws(
        () => transitionAgentLocation(state, 'agent:dev-player', '   '),
        /targetPlaceId must be a non-empty string/
      );
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 4. Sequential End-to-End Integration & Persistence Roundtrip
  // =========================================================================
  describe('Sequential End-to-End Integration & Persistence Roundtrip', () => {
    test('complete M9 coffee completion -> exit restaurant -> leave building -> move place -> persist & restore', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-m10-movement-'));
      const testFile = join(tmpDir, 'world-state.json');

      try {
        // --- 1. Bootstrap world at 08:00 local (14:00 UTC) ---
        const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
        const state = createInitialWorldState(clock);
        const sim = new Simulation(clock, state, { silent: true });

        // --- 2. Advance to 09:00 local (15:00 UTC) (restaurant opens) & tick ---
        clock.advance(60 * 60_000);
        sim.tick();
        const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
        assert.equal(restaurant.operationalState, 'open');

        // --- 3. Enter restaurant ---
        const enterRes = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });
        assert.equal(enterRes.success, true);
        const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
        assert.equal(player.locationId, 'restaurant:development-restaurant');

        // --- 4. Purchase Coffee ---
        const purchaseReceipt = purchaseOffering(state, 'agent:dev-player', 'offering:development-coffee', { silent: true });
        assert.equal(purchaseReceipt.success, true);
        assert.equal(player.balanceMinor, 1500);

        // --- 5. Start Having Coffee ---
        const activityRes = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);
        assert.equal(activityRes.success, true);
        assert.equal(player.playerActivity?.completedAt, null);

        // --- 6 & 7. Advance 15 world minutes & tick simulation ---
        clock.advance(15 * 60_000);
        const tickRes = sim.tick();
        assert.equal(tickRes.playerActivityTransitions?.length, 1);
        assert.equal(player.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');

        // --- 8. Spatial movement after coffee completion: Exit Restaurant ---
        const timeBeforeMovement = clock.getTime();
        const exitRes = exitRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
        assert.equal(exitRes.success, true);
        assert.equal(player.locationId, 'building:development-building');
        assert.equal(clock.getTime(), timeBeforeMovement, 'worldTime must remain identical');

        // --- 9. Leave Building ---
        const leaveRes = leaveBuilding(state, 'agent:dev-player', 'building:development-building');
        assert.equal(leaveRes.success, true);
        assert.equal(player.locationId, 'street:development-street');
        assert.equal(clock.getTime(), timeBeforeMovement, 'worldTime must remain identical');

        // --- 10. Move to another Place (neighborhood) via existing primitive ---
        transitionAgentLocation(state, 'agent:dev-player', 'neighborhood:development-neighborhood');
        assert.equal(player.locationId, 'neighborhood:development-neighborhood');
        assert.equal(clock.getTime(), timeBeforeMovement, 'worldTime must remain identical');

        // Verify activity state survived unchanged
        assert.equal(player.playerActivity?.activity, 'having-coffee');
        assert.equal(player.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');

        // --- 11. Persistence Roundtrip ---
        const persistenceA = new LocalFilePersistence(testFile);
        persistenceA.save(snapshotWorldState(clock, state));

        // Reconstruct in fresh runtime Session B
        const persistenceB = new LocalFilePersistence(testFile);
        const stateB = persistenceB.load();
        assert.ok(stateB !== null);
        assert.doesNotThrow(() => validateWorldState(stateB));

        assert.equal(stateB.version, 19);
        const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
        assert.equal(playerB.locationId, 'neighborhood:development-neighborhood');
        assert.equal(playerB.playerActivity?.activity, 'having-coffee');
        assert.equal(playerB.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');
        assert.equal(playerB.balanceMinor, 1500);
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });
});
