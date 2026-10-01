import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  inspectCurrentLocation,
  enterRestaurant,
  transitionAgentLocation,
  snapshotWorldState,
  validateWorldState,
  WorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 12: First World Perception (inspectCurrentLocation)', () => {
  const INITIAL_TIME = '2026-09-14T08:00:00.000Z';
  const OPEN_TIME = '2026-09-14T09:00:00.000Z';

  function setupWorld(time: string = INITIAL_TIME): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(time);
    const state = createInitialWorldState(clock);
    return { clock, state };
  }

  // =========================================================================
  // 1. Successful Inspection at Places (Building & Street)
  // =========================================================================
  describe('Successful Inspection at Places', () => {
    test('successfully inspects current location at a Building', () => {
      const { state } = setupWorld();
      // In seed, player starts at building:development-building
      const result = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.locationId, 'building:development-building');
      assert.ok(result.location);
      assert.equal(result.location.id, 'building:development-building');
      assert.equal(result.location.type, 'building');
      assert.equal(result.location.name, 'Development Building');
      assert.equal(result.location.parentId, 'street:development-street');
      assert.equal(result.location.buildingId, undefined);
      assert.equal(result.location.operationalState, undefined);
      assert.equal(result.location.offerings, undefined);
    });

    test('successfully inspects current location at a Street', () => {
      const { state } = setupWorld();
      transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');

      const result = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.locationId, 'street:development-street');
      assert.ok(result.location);
      assert.equal(result.location.id, 'street:development-street');
      assert.equal(result.location.type, 'street');
      assert.equal(result.location.name, 'Development Street');
      assert.equal(result.location.parentId, 'neighborhood:development-neighborhood');
    });
  });

  // =========================================================================
  // 2. Successful Inspection at a Restaurant
  // =========================================================================
  describe('Successful Inspection at a Restaurant', () => {
    test('exposes restaurant identity, containing building, and closed operational state at 08:00 UTC', () => {
      const { state } = setupWorld(INITIAL_TIME);
      // Directly place player in restaurant for inspection test
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:development-restaurant';

      const result = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.locationId, 'restaurant:development-restaurant');
      assert.ok(result.location);
      assert.equal(result.location.id, 'restaurant:development-restaurant');
      assert.equal(result.location.type, 'restaurant');
      assert.equal(result.location.name, 'Development Restaurant');
      assert.equal(result.location.buildingId, 'building:development-building');
      assert.equal(result.location.parentId, undefined);
      assert.equal(result.location.operationalState, 'closed');
    });

    test('exposes operational state open when restaurant is open at 09:00 UTC', () => {
      const { state } = setupWorld(OPEN_TIME);
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'open';

      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });

      const result = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.ok(result.location);
      assert.equal(result.location.operationalState, 'open');
    });

    test('exposes offerings projected via ObservableOffering with priceMinor and currency', () => {
      const { state } = setupWorld(OPEN_TIME);
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'open';

      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });

      const result = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.ok(result.location?.offerings);
      assert.equal(result.location.offerings.length, 1);

      const coffeeOffering = result.location.offerings[0];
      assert.equal(coffeeOffering.id, 'offering:development-coffee');
      assert.equal(coffeeOffering.name, 'Coffee');
      assert.equal(coffeeOffering.priceMinor, 500);
      assert.equal(coffeeOffering.currency, 'USD');
    });

    test('ObservableOffering strictly does NOT expose restaurantId or raw domain Offering structure', () => {
      const { state } = setupWorld(OPEN_TIME);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:development-restaurant';

      const result = inspectCurrentLocation(state, 'agent:dev-player');
      assert.ok(result.location?.offerings);

      const offering = result.location.offerings[0];
      const offeringKeys = Object.keys(offering).sort();

      // Only intentionally exposed fields must exist
      assert.deepEqual(offeringKeys, ['currency', 'id', 'name', 'priceMinor']);
      assert.equal((offering as Record<string, unknown>).restaurantId, undefined);
      assert.equal((offering as Record<string, unknown>).type, undefined);
    });
  });

  // =========================================================================
  // 3. Co-located Agents vs. Absent Agents Observation
  // =========================================================================
  describe('Agent Observation & ObservableAgent Projection', () => {
    test('co-located agents are returned with id, name, and agentType', () => {
      const { state } = setupWorld();
      // Explicitly co-locate NPC with player at building:development-building
      transitionAgentLocation(state, 'agent:dev-npc', 'building:development-building');
      const result = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.ok(result.location?.agents);

      const npc = result.location.agents.find((a) => a.id === 'agent:dev-npc');
      assert.ok(npc, 'Co-located NPC must be returned');
      assert.equal(npc.id, 'agent:dev-npc');
      assert.equal(npc.name, 'Development NPC');
      assert.equal(npc.agentType, 'npc');
    });

    test('ObservableAgent strictly does NOT expose internal state (activityState, activitySince, balances, playerActivity)', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.playerActivity = {
        activity: 'having-coffee',
        startedAt: INITIAL_TIME,
        completedAt: null,
      };

      const result = inspectCurrentLocation(state, 'agent:dev-player');
      assert.ok(result.location?.agents);

      for (const obsAgent of result.location.agents) {
        const keys = Object.keys(obsAgent).sort();
        // Strict projection: only id, name, agentType
        assert.deepEqual(keys, ['agentType', 'id', 'name']);

        const raw = obsAgent as Record<string, unknown>;
        assert.equal(raw.activityState, undefined, 'activityState must not be exposed');
        assert.equal(raw.activitySince, undefined, 'activitySince must not be exposed');
        assert.equal(raw.balanceMinor, undefined, 'balanceMinor must not be exposed');
        assert.equal(raw.currency, undefined, 'currency must not be exposed');
        assert.equal(raw.playerActivity, undefined, 'playerActivity must not be exposed');
        assert.equal(raw.locationId, undefined, 'locationId must not be exposed on agent projection');
      }
    });

    test('agents at different locations are NOT returned', () => {
      const { state } = setupWorld();
      // Move player to street, leaving NPC at building
      transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');

      const result = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(result.success, true);
      assert.ok(result.location?.agents);

      const npc = result.location.agents.find((a) => a.id === 'agent:dev-npc');
      assert.equal(npc, undefined, 'NPC at building must not be observable from street');
    });
  });

  // =========================================================================
  // 4. Precondition Validations
  // =========================================================================
  describe('Precondition Validations', () => {
    test('fails with "player-not-found" when player does not exist, with zero mutation', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = inspectCurrentLocation(state, 'agent:non-existent');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "player-not-player" when an NPC is passed, with zero mutation', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = inspectCurrentLocation(state, 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-player');
      assert.match(result.message, /is not a player/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "player-location-invalid" when player references non-existent location, with zero mutation', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'place:ghost-location';
      const snapshotBefore = JSON.stringify(state);

      const result = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-location-invalid');
      assert.match(result.message, /invalid or non-existent spatial location/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 5. Zero State Mutation Invariant
  // =========================================================================
  describe('Zero State Mutation Invariant', () => {
    test('successful inspection produces ZERO state mutation (WorldState strictly identical before and after)', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(result.success, true);

      const snapshotAfter = JSON.stringify(state);
      assert.equal(snapshotAfter, snapshotBefore);
    });

    test('inspection does NOT introduce relationships, memory, history, reputation, or events', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const stateKeysBefore = Object.keys(state).sort();
      const playerKeysBefore = Object.keys(player).sort();

      inspectCurrentLocation(state, 'agent:dev-player');

      const stateKeysAfter = Object.keys(state).sort();
      const playerKeysAfter = Object.keys(player).sort();

      assert.deepEqual(stateKeysAfter, stateKeysBefore);
      assert.deepEqual(playerKeysAfter, playerKeysBefore);
    });

    test('inspection does NOT advance worldTime, alter balances, or mutate operationalState', () => {
      const { clock, state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

      const timeBefore = clock.getTime();
      const playerBalanceBefore = player.balanceMinor;
      const restaurantBalanceBefore = restaurant.balanceMinor;
      const operationalStateBefore = restaurant.operationalState;

      inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(clock.getTime(), timeBefore);
      assert.equal(state.worldTime, timeBefore);
      assert.equal(player.balanceMinor, playerBalanceBefore);
      assert.equal(restaurant.balanceMinor, restaurantBalanceBefore);
      assert.equal(restaurant.operationalState, operationalStateBefore);
    });
  });

  // =========================================================================
  // 6. Persistence Roundtrip & Schema Version Preservation
  // =========================================================================
  describe('Persistence Roundtrip & Schema Preservation', () => {
    test('world persists and restores cleanly with schema version 11 after inspection', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-m12-perception-'));
      const testFile = join(tmpDir, 'world-state.json');

      try {
        const { clock, state } = setupWorld();

        const inspectResult = inspectCurrentLocation(state, 'agent:dev-player');
        assert.equal(inspectResult.success, true);

        // Save state to disk
        const persistence = new LocalFilePersistence(testFile);
        persistence.save(snapshotWorldState(clock, state));

        // Load and validate from disk
        const loadedState = persistence.load();
        assert.ok(loadedState !== null);
        assert.doesNotThrow(() => validateWorldState(loadedState));
        assert.equal(loadedState.version, 18);

        const loadedPlayer = loadedState.agents.find((a) => a.id === 'agent:dev-player')!;
        assert.equal(loadedPlayer.locationId, 'building:development-building');
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });
});
