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
  leaveBuilding,
  validateWorldState,
  WorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 18-A: First Deterministic NPC Reaction (Reciprocal Greeting)', () => {
  const TEST_TIME = '2026-09-14T08:00:00.000Z';

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(TEST_TIME);
    const state = createInitialWorldState(clock);
    transitionAgentLocation(state, 'agent:dev-npc', 'building:development-building');
    return { clock, state };
  }

  // =========================================================================
  // 1. Concrete Deterministic Reactions
  // =========================================================================
  describe('Contextual NPC Reactions on Successful Greeting', () => {
    test('returns "Hello. I\'m around the building today." when NPC is idle at building:development-building', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // With agents co-located at building:development-building and NPC idle
      assert.equal(player.locationId, 'building:development-building');
      assert.equal(npc.locationId, 'building:development-building');
      assert.equal(npc.activityState, 'idle');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.npcId, 'agent:dev-npc');
      assert.equal(result.response, "Hello. I'm around the building today.");
    });

    test('returns "Welcome. I\'m working here today." when NPC is active at restaurant:development-restaurant', () => {
      const { clock, state } = setupWorld();

      // Open restaurant at 09:00 UTC
      clock.advance(60 * 60_000);
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'open';

      // Move player into restaurant
      const enterRes = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });
      assert.equal(enterRes.success, true);

      // Place NPC at restaurant with active state
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'restaurant:development-restaurant';
      npc.activityState = 'active';

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.npcId, 'agent:dev-npc');
      assert.equal(result.response, "Welcome. I'm working here today.");
    });

    test('returns "Hello there." as fallback when agents are co-located in other context (e.g. kiosk)', () => {
      const { state } = setupWorld();

      // Move both agents to kiosk building (no specialized greeting rule)
      transitionAgentLocation(state, 'agent:dev-player', 'building:avenida-juarez-kiosk');
      transitionAgentLocation(state, 'agent:dev-npc', 'building:avenida-juarez-kiosk');

      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'building:avenida-juarez-kiosk');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, 'agent:dev-player');
      assert.equal(result.npcId, 'agent:dev-npc');
      assert.equal(result.response, 'Hello there.');
    });

    test('returns "Hello there." as fallback when NPC is at building but activityState is active (non-matching combination)', () => {
      const { state } = setupWorld();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.activityState = 'active';

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.response, 'Hello there.');
    });

    test('returns "Hello there." as fallback when NPC is at restaurant but activityState is idle (non-matching combination)', () => {
      const { clock, state } = setupWorld();
      clock.advance(60 * 60_000);
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'open';

      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'restaurant:development-restaurant';
      npc.activityState = 'idle';

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.response, 'Hello there.');
    });
  });

  // =========================================================================
  // 2. Failure Cases & Undefined Response
  // =========================================================================
  describe('Failure Preconditions Return response: undefined', () => {
    test('returns undefined response when agents are not co-located', () => {
      const { state } = setupWorld();
      // Player leaves building to street, NPC stays at building
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'agents-not-co-located');
      assert.equal(result.response, undefined);
    });

    test('returns undefined response when player does not exist', () => {
      const { state } = setupWorld();

      const result = greetAgent(state, 'agent:non-existent', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-found');
      assert.equal(result.response, undefined);
    });

    test('returns undefined response when NPC does not exist', () => {
      const { state } = setupWorld();

      const result = greetAgent(state, 'agent:dev-player', 'agent:non-existent');

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-found');
      assert.equal(result.response, undefined);
    });

    test('returns undefined response when player is not a player', () => {
      const { state } = setupWorld();

      const result = greetAgent(state, 'agent:dev-npc', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-player');
      assert.equal(result.response, undefined);
    });

    test('returns undefined response when target is not an NPC', () => {
      const { state } = setupWorld();

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-player');

      assert.equal(result.success, false);
      assert.equal(result.code, 'target-not-npc');
      assert.equal(result.response, undefined);
    });

    test('returns undefined response when player location is invalid', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'void:nowhere';

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'player-location-invalid');
      assert.equal(result.response, undefined);
    });

    test('returns undefined response when NPC location is invalid', () => {
      const { state } = setupWorld();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'void:nowhere';

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-location-invalid');
      assert.equal(result.response, undefined);
    });
  });

  // =========================================================================
  // 3. Zero Mutation Invariant
  // =========================================================================
  describe('Zero State Mutation Invariant', () => {
    test('produces ZERO state mutation on successful greeting (bit-identical WorldState snapshot)', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(result.success, true);
      assert.equal(typeof result.response, 'string');

      const snapshotAfter = JSON.stringify(state);
      assert.equal(snapshotAfter, snapshotBefore);
    });

    test('produces ZERO state mutation on failed greeting (bit-identical WorldState snapshot)', () => {
      const { state } = setupWorld();
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const snapshotBefore = JSON.stringify(state);

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(result.success, false);
      assert.equal(result.response, undefined);

      const snapshotAfter = JSON.stringify(state);
      assert.equal(snapshotAfter, snapshotBefore);
    });

    test('greeting does NOT create dialogue trees, relationships, memory, or historical logs in state', () => {
      const { state } = setupWorld();
      const keysBefore = Object.keys(state).sort();

      greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      const keysAfter = Object.keys(state).sort();
      assert.deepEqual(keysAfter, keysBefore);

      // Confirm specific non-existent subsystem structures
      assert.equal((state as any).dialogue, undefined);
      assert.equal((state as any).dialogues, undefined);
      assert.equal((state as any).conversations, undefined);
      assert.equal((state as any).memories, undefined);
      assert.equal((state as any).relationships, undefined);
      assert.equal((state as any).greetingHistory, undefined);
    });
  });

  // =========================================================================
  // 4. Determinism
  // =========================================================================
  describe('Determinism', () => {
    test('repeated greetings in the same world state return identical response strings', () => {
      const { state } = setupWorld();

      const result1 = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      const result2 = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      const result3 = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.equal(result1.response, "Hello. I'm around the building today.");
      assert.equal(result2.response, result1.response);
      assert.equal(result3.response, result1.response);
      assert.deepEqual(result1, result2);
      assert.deepEqual(result2, result3);
    });
  });

  // =========================================================================
  // 5. NPC State Drives Response (Integration with Simulation & NPC Routine)
  // =========================================================================
  describe('NPC State Drives Response Across Canonical Routine', () => {
    test('NPC response transitions deterministically as Simulation executes canonical M15 routine', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state);

      // 1. At 08:00 UTC: Co-locate NPC at building, idle
      transitionAgentLocation(state, 'agent:dev-npc', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'building:development-building');
      assert.equal(npc.activityState, 'idle');

      const greetAtBuilding = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(greetAtBuilding.success, true);
      assert.equal(greetAtBuilding.response, "Hello. I'm around the building today.");

      // 2. Advance to 09:00 UTC and tick Simulation
      clock.advance(60 * 60_000);
      sim.tick();

      // Simulation rule moved NPC to restaurant and set activityState to active
      assert.equal(npc.locationId, 'restaurant:development-restaurant');
      assert.equal(npc.activityState, 'active');

      // Player is still at building: greeting now fails due to separation
      const greetSeparated = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(greetSeparated.success, false);
      assert.equal(greetSeparated.code, 'agents-not-co-located');
      assert.equal(greetSeparated.response, undefined);

      // 3. Player enters restaurant
      const enterRes = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      assert.equal(enterRes.success, true);
      assert.equal(player.locationId, 'restaurant:development-restaurant');

      // 4. Greeting at restaurant succeeds with working reaction
      const greetAtRestaurant = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(greetAtRestaurant.success, true);
      assert.equal(greetAtRestaurant.response, "Welcome. I'm working here today.");
    });
  });

  // =========================================================================
  // 6. Persistence & Schema Validation
  // =========================================================================
  describe('Persistence Roundtrip & Schema Preservation', () => {
    test('WorldState remains valid schema version 13 before and after greeting', () => {
      const { state } = setupWorld();

      assert.doesNotThrow(() => validateWorldState(state));
      assert.equal(state.version, 13);

      greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

      assert.doesNotThrow(() => validateWorldState(state));
      assert.equal(state.version, 13);
    });

    test('world persists and restores cleanly with schema version 13', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm18-reaction-test-'));
      const storagePath = join(tempDir, 'world-state.json');

      try {
        const { state } = setupWorld();
        const persistence = new LocalFilePersistence(storagePath);

        // Perform greeting
        const greetResult = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
        assert.equal(greetResult.success, true);
        assert.equal(greetResult.response, "Hello. I'm around the building today.");

        // Save
        await persistence.save(state);
        assert.equal(existsSync(storagePath), true);

        // Load
        const loadedState = await persistence.load();
        assert.notEqual(loadedState, null);
        assert.equal(loadedState!.version, 13);

        assert.doesNotThrow(() => validateWorldState(loadedState!));

        // Confirm agent properties are preserved
        const loadedPlayer = loadedState!.agents.find((a) => a.id === 'agent:dev-player')!;
        const loadedNpc = loadedState!.agents.find((a) => a.id === 'agent:dev-npc')!;
        assert.equal(loadedPlayer.locationId, 'building:development-building');
        assert.equal(loadedNpc.locationId, 'building:development-building');
        assert.equal(loadedNpc.activityState, 'idle');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
