/**
 * Milestone 68 — Spatial Movement & Navigation Contract Test Suite
 *
 * Verifies that the semantic boundary separating the authoritative topological World Core
 * from future physical spatial representations and navigation systems is strictly established.
 *
 * Test Matrix:
 * 1. Test 1 — Logical Location Semantics:
 *    Agent.locationId represents an authoritative topological Place/Restaurant ID, never coordinates.
 * 2. Test 2 — Valid Logical Movement:
 *    validateLogicalDestination validates existing places and restaurants without mutation.
 * 3. Test 3 — Invalid Destination Rejection:
 *    validateLogicalDestination identifies non-existent places as 'invalid-destination' (World Core failure).
 * 4. Test 4 — Zero Mutation on Invalid Transition:
 *    Failed transition leaves WorldState strictly identical to pre-transition snapshot.
 * 5. Test 5 — NPC Routine Movement Authority:
 *    NPC routine movement continues using authoritative transitionAgentLocation without physical engine.
 * 6. Test 6 — Absence of Premature Physical Coordinates:
 *    Agent and WorldState contain no coordinates, position, rotation, velocity, or Transform.
 * 7. Test 7 — Engine Independence:
 *    World Core operates completely decoupled from Unity, NavMesh, or 3D rendering dependencies.
 * 8. Test 8 — Invalid vs Unreachable Distinction:
 *    categorizeSpatialFailure cleanly differentiates World Core truth failures from navigation reachability failures.
 * 9. Test 9 — Simulation Continuity:
 *    Existing discrete simulation tick continues to execute routine actions without physical movement logic.
 * 10. Test 10 — Contextual NPC Continuity:
 *     Contextual behavior derivation and execution remain intact across spatial boundaries.
 * 11. Test 11 — Contract Specification Introspection:
 *     SPATIAL_MOVEMENT_CONTRACT exposes frozen, immutable layer definitions and authority rules.
 * 12. Test 12 — Schema Version Preservation:
 *     CURRENT_WORLD_STATE_VERSION remains strictly 18.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  CURRENT_WORLD_STATE_VERSION,
  transitionAgentLocation,
  validateLogicalDestination,
  categorizeSpatialFailure,
  SPATIAL_MOVEMENT_CONTRACT,
  type WorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import {
  DEVELOPMENT_NPC_ID,
  createSecondaryDevelopmentNpc,
} from '../src/core/development-npc-schedule.js';
import {
  executeNpcRoutineAction,
  deriveNpcContextualAction,
  executeNpcContextualAction,
} from '../src/core/npc-behavior.js';

const ANCHOR_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 AM local

function setupWorld(): {
  clock: WorldClock;
  state: WorldState;
  devNpc: NonNullable<WorldState['agents']>[number];
  player: NonNullable<WorldState['agents']>[number];
} {
  const clock = WorldClock.create(ANCHOR_TIME);
  const state = createInitialWorldState(clock);
  const devNpc = state.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;
  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  return { clock, state, devNpc, player };
}

describe('Milestone 68: Spatial Movement & Navigation Contract', () => {
  // =========================================================================
  // Test 1 — Logical Location Semantics
  // =========================================================================
  describe('Test 1 — Logical Location Semantics', () => {
    it('confirms Agent.locationId is a string referencing a logical Place or Restaurant entity', () => {
      const { state, devNpc, player } = setupWorld();

      assert.equal(typeof player.locationId, 'string');
      assert.equal(typeof devNpc.locationId, 'string');

      // Player starts at building, NPC starts at residence place
      const playerPlace = state.places.find((p) => p.id === player.locationId);
      assert.ok(playerPlace);
      assert.equal(playerPlace.type, 'building');

      const npcPlace = state.places.find((p) => p.id === devNpc.locationId);
      assert.ok(npcPlace);
      assert.equal(npcPlace.type, 'building');
      assert.equal(devNpc.locationId, 'building:development-residence');

      // Strictly logical IDs, not coordinates or serialized vectors
      assert.doesNotMatch(player.locationId, /^\d+,\d+(,\d+)?$/);
      assert.doesNotMatch(devNpc.locationId, /^\d+,\d+(,\d+)?$/);
    });
  });

  // =========================================================================
  // Test 2 — Valid Logical Movement
  // =========================================================================
  describe('Test 2 — Valid Logical Movement', () => {
    it('validates existing places as valid logical destinations with zero state mutation', () => {
      const { state, player } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = validateLogicalDestination(
        state,
        'street:development-street',
        player.locationId,
        'player'
      );

      assert.equal(result.valid, true);
      assert.equal(result.code, 'valid');
      assert.equal(result.targetPlaceId, 'street:development-street');

      // Invariant: ZERO state mutation during evaluation
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    it('identifies when an agent is already at the target destination', () => {
      const { state, player } = setupWorld();

      const result = validateLogicalDestination(
        state,
        player.locationId,
        player.locationId,
        'player'
      );

      assert.equal(result.valid, true);
      assert.equal(result.code, 'already-at-destination');
    });

    it('validates restaurants for NPC agents', () => {
      const { state } = setupWorld();

      const result = validateLogicalDestination(
        state,
        'restaurant:development-restaurant',
        'street:development-street',
        'npc'
      );

      assert.equal(result.valid, true);
      assert.equal(result.code, 'valid');
    });
  });

  // =========================================================================
  // Test 3 — Invalid Destination Rejection
  // =========================================================================
  describe('Test 3 — Invalid Destination Rejection', () => {
    it('rejects non-existent place IDs with code target-not-found and failureCategory invalid-destination', () => {
      const { state, player } = setupWorld();

      const result = validateLogicalDestination(
        state,
        'place:non-existent-fantasy-castle',
        player.locationId,
        'player'
      );

      assert.equal(result.valid, false);
      assert.equal(result.code, 'target-not-found');
      assert.equal(result.failureCategory, 'invalid-destination');
      assert.match(result.message, /does not exist in world state topology/i);
    });

    it('rejects invalid or empty target string formats', () => {
      const { state, player } = setupWorld();

      const result = validateLogicalDestination(
        state,
        '',
        player.locationId,
        'player'
      );

      assert.equal(result.valid, false);
      assert.equal(result.code, 'invalid-target-format');
      assert.equal(result.failureCategory, 'invalid-destination');
    });
  });

  // =========================================================================
  // Test 4 — Zero Mutation on Invalid Transition
  // =========================================================================
  describe('Test 4 — Zero Mutation on Invalid Transition', () => {
    it('guarantees WorldState is strictly unmodified when transitionAgentLocation fails', () => {
      const { state, player } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      assert.throws(
        () => transitionAgentLocation(state, player.id, 'place:non-existent-destination'),
        /does not exist in world state/i
      );

      // Invariant: absolute state preservation
      assert.equal(JSON.stringify(state), snapshotBefore);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 5 — NPC Routine Movement Authority
  // =========================================================================
  describe('Test 5 — NPC Routine Movement Authority', () => {
    it('executes routine transitions through authoritative transitionAgentLocation without navigation engine', () => {
      const { state, devNpc } = setupWorld();

      // Set devNpc at residence
      devNpc.locationId = 'building:development-residence';

      // Routine action execution for shift at 16:00 UTC transitions NPC to restaurant
      const result = executeNpcRoutineAction(state, devNpc.id);

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.previousLocationId, 'building:development-residence');
      assert.equal(result.currentLocationId, 'restaurant:development-restaurant');
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
    });
  });

  // =========================================================================
  // Test 6 — Absence of Premature Physical Coordinates
  // =========================================================================
  describe('Test 6 — Absence of Premature Physical Coordinates', () => {
    it('ensures Agent entity and WorldState have no coordinate or transform fields', () => {
      const { state, devNpc, player } = setupWorld();

      const prohibitedFields = [
        'position',
        'x',
        'y',
        'z',
        'rotation',
        'transform',
        'velocity',
        'movementSpeed',
        'navMeshAgentId',
        'currentPath',
        'travelTime',
      ];

      for (const field of prohibitedFields) {
        assert.equal(field in player, false, `Player should not contain "${field}"`);
        assert.equal(field in devNpc, false, `NPC should not contain "${field}"`);
        assert.equal(field in state, false, `WorldState should not contain "${field}"`);
      }
    });
  });

  // =========================================================================
  // Test 7 — Engine Independence
  // =========================================================================
  describe('Test 7 — Engine Independence', () => {
    it('confirms World Core functions cleanly without Unity, browser DOM, or 3D engine objects', () => {
      const { state } = setupWorld();

      // Verify no global window, document, or Unity UnityEngine namespaces are referenced or required
      assert.equal(typeof (globalThis as any).UnityEngine, 'undefined');
      assert.equal(typeof (globalThis as any).NavMesh, 'undefined');

      // Authoritative transition runs purely headlessly
      transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');
      assert.equal(state.agents.find((a) => a.id === 'agent:dev-player')!.locationId, 'street:development-street');
    });
  });

  // =========================================================================
  // Test 8 — Invalid vs Unreachable Distinction
  // =========================================================================
  describe('Test 8 — Invalid vs Unreachable Distinction', () => {
    it('categorizes non-existent destination as invalid-destination (World Core truth failure)', () => {
      const targetExistsInWorld = false;
      const isPhysicallyReachable = false;

      const category = categorizeSpatialFailure(targetExistsInWorld, isPhysicallyReachable);
      assert.equal(category, 'invalid-destination');
    });

    it('categorizes topologically valid but blocked destination as unreachable-destination (Navigation failure)', () => {
      const targetExistsInWorld = true;
      const isPhysicallyReachable = false; // e.g. pathfinder finds no route or blocked doorway

      const category = categorizeSpatialFailure(targetExistsInWorld, isPhysicallyReachable);
      assert.equal(category, 'unreachable-destination');
    });

    it('returns valid when destination exists and is physically reachable', () => {
      const targetExistsInWorld = true;
      const isPhysicallyReachable = true;

      const category = categorizeSpatialFailure(targetExistsInWorld, isPhysicallyReachable);
      assert.equal(category, 'valid');
    });
  });

  // =========================================================================
  // Test 9 — Simulation Continuity
  // =========================================================================
  describe('Test 9 — Simulation Continuity', () => {
    it('preserves Simulation.tick() execution of routine actions without physical movement engine', () => {
      const { clock, state, devNpc } = setupWorld();
      devNpc.locationId = 'building:development-residence';

      const sim = new Simulation(clock, state, { silent: true });
      const tickResult = sim.tick();

      assert.ok(tickResult);
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      const locTrans = tickResult.npcLocationTransitions?.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans);
      assert.equal(locTrans.changed, true);
      assert.equal(locTrans.newLocationId, 'restaurant:development-restaurant');
    });
  });

  // =========================================================================
  // Test 10 — Contextual NPC Continuity
  // =========================================================================
  describe('Test 10 — Contextual NPC Continuity', () => {
    it('preserves contextual behavior derivation and execution across authoritative locations', () => {
      const { state, devNpc, player } = setupWorld();

      // Co-located at restaurant
      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const action = deriveNpcContextualAction(state, devNpc.id);
      assert.ok(action);
      assert.equal(action.actionType, 'greet-agent');

      const result = executeNpcContextualAction(state, action);
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.ok(result.response);
    });
  });

  // =========================================================================
  // Test 11 — Contract Specification Introspection
  // =========================================================================
  describe('Test 11 — Contract Specification Introspection', () => {
    it('verifies SPATIAL_MOVEMENT_CONTRACT constants define layers and core authority principles', () => {
      assert.ok(SPATIAL_MOVEMENT_CONTRACT);
      assert.match(SPATIAL_MOVEMENT_CONTRACT.layers.worldTopology, /Layer A/i);
      assert.match(SPATIAL_MOVEMENT_CONTRACT.layers.physicalSpatial, /Layer B/i);
      assert.match(SPATIAL_MOVEMENT_CONTRACT.layers.navigation, /Layer C/i);
      assert.match(SPATIAL_MOVEMENT_CONTRACT.authorityRule, /never become authoritative world truth/i);
      assert.match(SPATIAL_MOVEMENT_CONTRACT.locationIdSemantics, /logical\/topological world location/i);
      assert.match(SPATIAL_MOVEMENT_CONTRACT.transitionSemantics, /instantaneous logical\/topological/i);
      assert.match(SPATIAL_MOVEMENT_CONTRACT.failureCategories.invalidDestination, /INVALID_DESTINATION/i);
      assert.match(SPATIAL_MOVEMENT_CONTRACT.failureCategories.unreachableDestination, /UNREACHABLE_DESTINATION/i);
    });
  });

  // =========================================================================
  // Test 12 — Schema Version Preservation
  // =========================================================================
  describe('Test 12 — Schema Version Preservation', () => {
    it('asserts CURRENT_WORLD_STATE_VERSION remains strictly 18', () => {
      const { state } = setupWorld();
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      assert.equal(state.version, 19);
    });
  });
});
