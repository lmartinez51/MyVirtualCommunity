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
  exitRestaurant,
  leaveBuilding,
  enterBuilding,
  purchaseOffering,
  startHavingCoffee,
  transitionAgentLocation,
  validateWorldState,
  snapshotWorldState,
  WorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 16: Bidirectional Building Traversal (enterBuilding)', () => {
  const OPEN_TIME = '2026-09-14T15:00:00.000Z'; // 09:00 local Ciudad Juárez

  function setupWorldWithPlayerOnStreet(): {
    clock: WorldClock;
    state: WorldState;
  } {
    const clock = WorldClock.create(OPEN_TIME);
    const state = createInitialWorldState(clock);
    const leaveResult = leaveBuilding(
      state,
      'agent:dev-player',
      'building:development-building'
    );
    assert.equal(leaveResult.success, true);
    assert.equal(leaveResult.code, 'success');
    return { clock, state };
  }

  // =========================================================================
  // 1. Successful Street -> Building Transition
  // =========================================================================
  describe('Successful Street -> Building Transition', () => {
    test('successfully enters building from its containing street', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'street:development-street');

      const result = enterBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.agentId, 'agent:dev-player');
      assert.equal(result.buildingId, 'building:development-building');
      assert.equal(result.streetId, 'street:development-street');
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // 2. Precondition Validations & Zero State Mutation
  // =========================================================================
  describe('Precondition Validations & Zero State Mutation', () => {
    test('fails with "agent-not-found" when agent does not exist, with zero mutation', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const snapshotBefore = JSON.stringify(state);

      const result = enterBuilding(
        state,
        'agent:non-existent',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "agent-not-player" when NPC attempts to enter building, with zero mutation', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      // Place NPC on street for this test
      npc.locationId = 'street:development-street';
      const snapshotBefore = JSON.stringify(state);

      const result = enterBuilding(
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
      const { state } = setupWorldWithPlayerOnStreet();
      const snapshotBefore = JSON.stringify(state);

      const result = enterBuilding(
        state,
        'agent:dev-player',
        'building:non-existent'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'building-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "building-not-found" when existing non-building Place is supplied, with zero mutation', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const snapshotBefore = JSON.stringify(state);

      // Attempt to enter a neighborhood as if it were a building
      const resultNeighborhood = enterBuilding(
        state,
        'agent:dev-player',
        'neighborhood:development-neighborhood'
      );
      assert.equal(resultNeighborhood.success, false);
      assert.equal(resultNeighborhood.code, 'building-not-found');
      assert.equal(JSON.stringify(state), snapshotBefore);

      // Attempt to enter a street as if it were a building
      const resultStreet = enterBuilding(
        state,
        'agent:dev-player',
        'street:development-street'
      );
      assert.equal(resultStreet.success, false);
      assert.equal(resultStreet.code, 'building-not-found');
      assert.equal(JSON.stringify(state), snapshotBefore);

      // Attempt to enter a district as if it were a building
      const resultDistrict = enterBuilding(
        state,
        'agent:dev-player',
        'district:development-district'
      );
      assert.equal(resultDistrict.success, false);
      assert.equal(resultDistrict.code, 'building-not-found');
      assert.equal(JSON.stringify(state), snapshotBefore);

      // Attempt to enter a city as if it were a building
      const resultCity = enterBuilding(
        state,
        'agent:dev-player',
        'city:ciudad-juarez'
      );
      assert.equal(resultCity.success, false);
      assert.equal(resultCity.code, 'building-not-found');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "already-inside" when player is already inside the target building, with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'building:development-building');
      const snapshotBefore = JSON.stringify(state);

      const result = enterBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'already-inside');
      assert.match(result.message, /already inside/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "invalid-location" when player is at a different location (e.g. neighborhood), with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'neighborhood:development-neighborhood';
      const snapshotBefore = JSON.stringify(state);

      const result = enterBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-location');
      assert.match(result.message, /not at containing street/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "invalid-location" when player is inside a restaurant, with zero mutation', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const enterRes = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      assert.equal(enterRes.success, true);
      const snapshotBefore = JSON.stringify(state);

      const result = enterBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-location');
      assert.match(result.message, /not at containing street/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "invalid-location" when building parent street is missing/corrupted, with zero mutation', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const building = state.places.find((p) => p.id === 'building:development-building')!;
      building.parentId = 'street:non-existent';
      const snapshotBefore = JSON.stringify(state);

      const result = enterBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-location');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 3. Invariant Preservation
  // =========================================================================
  describe('Invariant Preservation', () => {
    test('preserves worldTime, balances, activityState, playerActivity, NPC state, and geography', () => {
      const { clock, state } = setupWorldWithPlayerOnStreet();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

      const timeBefore = clock.getTime();
      const playerBalanceBefore = player.balanceMinor;
      const playerActivityStateBefore = player.activityState;
      const npcLocationBefore = npc.locationId;
      const npcStateBefore = npc.activityState;
      const restaurantOperationalBefore = restaurant.operationalState;
      const purchasesCountBefore = state.purchases.length;
      const completionsCountBefore = state.activityCompletions.length;

      const result = enterBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, true);
      assert.equal(clock.getTime(), timeBefore, 'WorldClock must remain unchanged');
      assert.equal(state.worldTime, timeBefore, 'WorldState.worldTime must remain unchanged');
      assert.equal(player.balanceMinor, playerBalanceBefore, 'player balance must remain unchanged');
      assert.equal(player.activityState, playerActivityStateBefore, 'activityState must remain unchanged');
      assert.equal(player.playerActivity, null, 'playerActivity must remain unchanged');
      assert.equal(npc.locationId, npcLocationBefore, 'NPC location must remain unchanged');
      assert.equal(npc.activityState, npcStateBefore, 'NPC activityState must remain unchanged');
      assert.equal(restaurant.operationalState, restaurantOperationalBefore, 'restaurant must remain unchanged');
      assert.equal(state.purchases.length, purchasesCountBefore, 'purchases must remain unchanged');
      assert.equal(state.activityCompletions.length, completionsCountBefore, 'activityCompletions must remain unchanged');
      assert.equal(state.version, 18, 'schema version must remain strictly 18');
    });

    test('preserves active playerActivity across enterBuilding', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Enter restaurant, purchase coffee, start having coffee
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      const purchaseReceipt = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee'
      );
      assert.equal(purchaseReceipt.success, true);
      const coffeeResult = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);
      assert.equal(coffeeResult.success, true);
      assert.equal(player.playerActivity?.activity, 'having-coffee');

      // Exit restaurant into building, then leave building onto street
      exitRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      assert.equal(player.locationId, 'street:development-street');
      assert.equal(player.playerActivity?.activity, 'having-coffee');

      // Now enter building while having coffee is active
      const enterResult = enterBuilding(
        state,
        'agent:dev-player',
        'building:development-building'
      );
      assert.equal(enterResult.success, true);
      assert.equal(player.locationId, 'building:development-building');

      // Activity must be completely intact
      assert.equal(player.playerActivity?.activity, 'having-coffee');
      assert.equal(player.playerActivity?.startedAt, OPEN_TIME);
      assert.equal(player.playerActivity?.completedAt, null);
    });
  });

  // =========================================================================
  // 4. Complete Spatial Roundtrip Traversal Cycle
  // =========================================================================
  describe('Complete Spatial Roundtrip Traversal Cycle', () => {
    test('completes full roundtrip: Building -> leaveBuilding -> Street -> enterBuilding -> Building -> enterRestaurant -> Restaurant', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // 1. Initial position: Building
      assert.equal(player.locationId, 'building:development-building');

      // 2. Leave Building -> Street
      const leaveResult = leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      assert.equal(leaveResult.success, true);
      assert.equal(leaveResult.code, 'success');
      assert.equal(player.locationId, 'street:development-street');

      // 3. Enter Building -> Building
      const enterBldgResult = enterBuilding(state, 'agent:dev-player', 'building:development-building');
      assert.equal(enterBldgResult.success, true);
      assert.equal(enterBldgResult.code, 'success');
      assert.equal(player.locationId, 'building:development-building');

      // 4. Enter Restaurant -> Restaurant
      const enterRestResult = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      assert.equal(enterRestResult.success, true);
      assert.equal(enterRestResult.code, 'success');
      assert.equal(player.locationId, 'restaurant:development-restaurant');

      // 5. Exit Restaurant -> Building
      const exitRestResult = exitRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      assert.equal(exitRestResult.success, true);
      assert.equal(exitRestResult.code, 'success');
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // 5. Persistence Roundtrip with Player on Street
  // =========================================================================
  describe('Persistence Roundtrip with Player on Street', () => {
    test('persists world with player located on street, reconstructs, and executes enterBuilding', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-m16-test-'));
      const testFile = join(tmpDir, 'world-street-state.json');

      try {
        const clockA = WorldClock.create(OPEN_TIME);
        const stateA = createInitialWorldState(clockA);

        // Player leaves building to street
        leaveBuilding(stateA, 'agent:dev-player', 'building:development-building');
        const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
        assert.equal(playerA.locationId, 'street:development-street');

        // Persist session A
        const persistenceA = new LocalFilePersistence(testFile);
        persistenceA.save(snapshotWorldState(clockA, stateA));

        // Reconstruct in fresh session B
        const persistenceB = new LocalFilePersistence(testFile);
        const stateB = persistenceB.load();
        assert.ok(stateB !== null);
        assert.doesNotThrow(() => validateWorldState(stateB));
        assert.equal(stateB.version, 18, 'schema version must be preserved as 18');

        const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
        assert.equal(playerB.locationId, 'street:development-street');

        // Execute enterBuilding in Session B
        const enterResult = enterBuilding(
          stateB,
          'agent:dev-player',
          'building:development-building'
        );
        assert.equal(enterResult.success, true);
        assert.equal(playerB.locationId, 'building:development-building');

        // Re-persist session B with player inside building
        persistenceB.save(snapshotWorldState(clockA, stateB));

        // Reconstruct in fresh session C
        const persistenceC = new LocalFilePersistence(testFile);
        const stateC = persistenceC.load();
        assert.ok(stateC !== null);
        assert.doesNotThrow(() => validateWorldState(stateC));
        assert.equal(stateC.version, 18);
        const playerC = stateC.agents.find((a) => a.id === 'agent:dev-player')!;
        assert.equal(playerC.locationId, 'building:development-building');
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });
});
