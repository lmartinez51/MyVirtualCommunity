import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  greetAgent,
  transitionAgentLocation,
  enterRestaurant,
  snapshotWorldState,
  validateWorldState,
  WorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 11: First Agent-to-Agent Interaction (greetAgent)', () => {
  const TEST_TIME = '2026-09-14T08:00:00.000Z';

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(TEST_TIME);
    const state = createInitialWorldState(clock);
    // Explicitly co-locate NPC with player at building:development-building for independent contract testing
    transitionAgentLocation(state, 'agent:dev-npc', 'building:development-building');
    return { clock, state };
  }

  // =========================================================================
  // 1. Successful Greeting
  // =========================================================================
  describe('Successful Greeting', () => {
    test('succeeds when Player and NPC occupy the same Building', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // In development seed, both agents start at building:development-building
      assert.equal(player.locationId, 'building:development-building');
      assert.equal(npc.locationId, 'building:development-building');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.npcId, 'agent:dev-npc');
      assert.match(result.message, /successfully greeted NPC/);
    });

    test('succeeds when Player and NPC occupy the same Street', () => {
      const { state } = setupWorld();
      transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');
      transitionAgentLocation(state, 'agent:dev-npc', 'street:development-street');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.npcId, 'agent:dev-npc');
    });

    test('succeeds when Player and NPC occupy the same Restaurant', () => {
      const { clock, state } = setupWorld();
      // Advance to 09:00 UTC so restaurant is open
      clock.advance(60 * 60_000);
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'open';

      // Move player into restaurant
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });
      // Direct spatial transition for NPC into restaurant location
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'restaurant:development-restaurant';

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.npcId, 'agent:dev-npc');
    });
  });

  // =========================================================================
  // 2. Player Validation
  // =========================================================================
  describe('Player Validation', () => {
    test('fails with "player-not-found" when player ID does not exist, with zero mutation', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:non-existent', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "player-not-player" when an NPC is passed as the playerId, with zero mutation', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:dev-npc', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-player');
      assert.match(result.message, /is not a player/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 3. Target NPC Validation
  // =========================================================================
  describe('Target NPC Validation', () => {
    test('fails with "npc-not-found" when target NPC ID does not exist, with zero mutation', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:dev-player', 'agent:non-existent');

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "target-not-npc" when target agent is a player, with zero mutation', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-player');

      assert.equal(result.success, false);
      assert.equal(result.code, 'target-not-npc');
      assert.match(result.message, /is not an NPC/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 4. Location Validation & Co-location
  // =========================================================================
  describe('Location Validation & Co-location', () => {
    test('fails with "player-location-invalid" when player references a non-existent place, with zero mutation', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'place:ghost-location';
      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-location-invalid');
      assert.match(result.message, /invalid spatial location/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "npc-location-invalid" when NPC references a non-existent place, with zero mutation', () => {
      const { state } = setupWorld();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'place:ghost-location';
      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-location-invalid');
      assert.match(result.message, /invalid spatial location/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "agents-not-co-located" when player and NPC are at different valid locations, with zero mutation', () => {
      const { state } = setupWorld();
      // Move player to street, leaving NPC at building
      transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      assert.equal(player.locationId, 'street:development-street');
      assert.equal(npc.locationId, 'building:development-building');

      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'agents-not-co-located');
      assert.match(result.message, /are not co-located/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "agents-not-co-located" when player is in restaurant and NPC is in containing building', () => {
      const { clock, state } = setupWorld();
      clock.advance(60 * 60_000);
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'open';

      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      assert.equal(player.locationId, 'restaurant:development-restaurant');
      assert.equal(npc.locationId, 'building:development-building');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'agents-not-co-located');
    });
  });

  // =========================================================================
  // 5. Zero State Mutation Invariant (on both Success and Failure)
  // =========================================================================
  describe('Zero State Mutation Invariant', () => {
    test('successful greeting produces ZERO state mutation (WorldState is strictly identical before and after)', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');

      // Strict snapshot equality: state is 100% unmodified
      const snapshotAfter = JSON.stringify(state);
      assert.equal(snapshotAfter, snapshotBefore);
    });

    test('greeting does NOT create relationships, memory, history, reputation, events, or rewards', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      const playerKeysBefore = Object.keys(player).sort();
      const npcKeysBefore = Object.keys(npc).sort();
      const stateKeysBefore = Object.keys(state).sort();

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(result.success, true);

      const playerKeysAfter = Object.keys(player).sort();
      const npcKeysAfter = Object.keys(npc).sort();
      const stateKeysAfter = Object.keys(state).sort();

      assert.deepEqual(playerKeysAfter, playerKeysBefore);
      assert.deepEqual(npcKeysAfter, npcKeysBefore);
      assert.deepEqual(stateKeysAfter, stateKeysBefore);
    });

    test('greeting does NOT alter worldTime, balances, operationalState, or activities', () => {
      const { clock, state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

      const timeBefore = clock.getTime();
      const playerBalanceBefore = player.balanceMinor;
      const restaurantBalanceBefore = restaurant.balanceMinor;
      const operationalStateBefore = restaurant.operationalState;

      greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(clock.getTime(), timeBefore);
      assert.equal(state.worldTime, timeBefore);
      assert.equal(player.balanceMinor, playerBalanceBefore);
      assert.equal(restaurant.balanceMinor, restaurantBalanceBefore);
      assert.equal(restaurant.operationalState, operationalStateBefore);
    });
  });

  // =========================================================================
  // 6. Persistence Roundtrip
  // =========================================================================
  describe('Persistence Roundtrip', () => {
    test('persisting state before and after greeting results in identical schema version 11 files', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-m11-greeting-'));
      const testFile = join(tmpDir, 'world-state.json');

      try {
        const { clock, state } = setupWorld();

        const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
        assert.equal(result.success, true);

        // Save state to disk
        const persistence = new LocalFilePersistence(testFile);
        persistence.save(snapshotWorldState(clock, state));

        // Load and validate from disk
        const loadedState = persistence.load();
        assert.ok(loadedState !== null);
        assert.doesNotThrow(() => validateWorldState(loadedState));
        assert.equal(loadedState.version, 14);

        const loadedPlayer = loadedState.agents.find((a) => a.id === 'agent:dev-player')!;
        const loadedNpc = loadedState.agents.find((a) => a.id === 'agent:dev-npc')!;
        assert.equal(loadedPlayer.locationId, 'building:development-building');
        assert.equal(loadedNpc.locationId, 'building:development-building');
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });
});
