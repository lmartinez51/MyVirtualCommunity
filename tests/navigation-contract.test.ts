/**
 * Milestone 69 — Navigation Provider Contract Test Suite
 *
 * Verifies that the engine-independent boundary separating the authoritative World Core
 * from external physical navigation providers is strictly enforced:
 *
 * 1. Valid navigation request
 * 2. Invalid destination rejected by World Core
 * 3. Provider receives no invalid request
 * 4. route-unavailable does not mutate WorldState
 * 5. traversal-interrupted preserves last authoritative location
 * 6. traversal-failed preserves last authoritative location
 * 7. arrived does not directly mutate WorldState
 * 8. validateArrivalAndCommit() performs authoritative commit
 * 9. Request/result identity mismatch is rejected
 * 10. Stale origin is rejected
 * 11. Stale destination is rejected
 * 12. Destination becoming invalid after request creation is rejected
 * 13. Provider exception cannot corrupt WorldState
 * 14. Provider independence from Unity/browser/DOM
 * 15. No coordinate leakage
 * 16. Schema remains version 18
 * 17. Deterministic mock produces deterministic results
 * 18. Repeated arrival result does not duplicate or corrupt state (idempotency)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  CURRENT_WORLD_STATE_VERSION,
  createNavigationRequest,
  validateArrivalAndCommit,
  DeterministicMockNavigationProvider,
  type WorldState,
  type NavigationRequest,
  type NavigationResult,
} from '../src/core/world-state.js';
import { DEVELOPMENT_NPC_ID } from '../src/core/development-npc-schedule.js';

const ANCHOR_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 AM local

function setupWorld(): {
  clock: WorldClock;
  state: WorldState;
  player: NonNullable<WorldState['agents']>[number];
  npc: NonNullable<WorldState['agents']>[number];
} {
  const clock = WorldClock.create(ANCHOR_TIME);
  const state = createInitialWorldState(clock);
  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  const npc = state.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;
  return { clock, state, player, npc };
}

describe('Milestone 69: Navigation Provider Contract', () => {
  // =========================================================================
  // Test 1 — Valid Navigation Request
  // =========================================================================
  describe('Test 1 — Valid Navigation Request', () => {
    it('produces an immutable, valid NavigationRequest for a topologically existing destination', () => {
      const { state, player, clock } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.code, 'success');
      assert.equal(result.request.agentId, player.id);
      assert.equal(result.request.originPlaceId, player.locationId);
      assert.equal(result.request.destinationPlaceId, 'street:development-street');
      assert.equal(result.request.requestedAt, clock.getTime());
      assert.equal(result.request.agentType, 'player');
      assert.ok(result.request.requestId.startsWith('nav-req:'));

      // Invariant: Zero state mutation during request creation
      assert.equal(JSON.stringify(state), snapshotBefore);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 2 — Invalid Destination Rejection by World Core
  // =========================================================================
  describe('Test 2 — Invalid Destination Rejected by World Core', () => {
    it('rejects a destination that does not exist in authoritative topology before provider invocation', () => {
      const { state, player, clock } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = createNavigationRequest(
        state,
        player.id,
        'place:non-existent-void',
        clock.getTime()
      );

      assert.equal(result.success, false);
      if (result.success) return;

      assert.equal(result.code, 'invalid-destination');
      assert.equal(result.failureCategory, 'invalid-destination');
      assert.equal(JSON.stringify(state), snapshotBefore);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 3 — Provider Receives No Invalid Request
  // =========================================================================
  describe('Test 3 — Provider Receives No Invalid Request', () => {
    it('guarantees external navigation provider is never called when World Core rejects request', () => {
      const { state, player, clock } = setupWorld();
      let providerCalled = false;

      const provider = new DeterministicMockNavigationProvider();
      const originalRequestTraversal = provider.requestTraversal.bind(provider);
      provider.requestTraversal = (req: NavigationRequest) => {
        providerCalled = true;
        return originalRequestTraversal(req);
      };

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'place:invalid-target',
        clock.getTime()
      );

      assert.equal(reqResult.success, false);
      if (reqResult.success) {
        provider.requestTraversal(reqResult.request);
      }

      assert.equal(providerCalled, false);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 4 — Route Unavailable Does Not Mutate WorldState
  // =========================================================================
  describe('Test 4 — route-unavailable Does Not Mutate WorldState', () => {
    it('leaves WorldState completely unmutated when provider reports route-unavailable', () => {
      const { state, player, clock } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      provider.setDestinationStatus('street:development-street', 'route-unavailable');

      const navResult = provider.requestTraversal(reqResult.request);
      assert.equal(navResult.status, 'route-unavailable');
      assert.equal(navResult.failureCategory, 'unreachable-destination');

      const commitResult = validateArrivalAndCommit(state, reqResult.request, navResult);
      assert.equal(commitResult.success, false);
      assert.equal(commitResult.code, 'invalid-status');
      assert.equal(commitResult.changed, false);

      // Invariant: Zero mutation on unreachable destination
      assert.equal(JSON.stringify(state), snapshotBefore);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 5 — Traversal Interrupted Preserves Last Authoritative Location
  // =========================================================================
  describe('Test 5 — traversal-interrupted Preserves Last Authoritative Location', () => {
    it('preserves authoritative location when navigation provider reports traversal-interrupted', () => {
      const { state, player, clock } = setupWorld();

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      provider.setDestinationStatus('street:development-street', 'traversal-interrupted');

      const navResult = provider.requestTraversal(reqResult.request);
      assert.equal(navResult.status, 'traversal-interrupted');

      const commitResult = validateArrivalAndCommit(state, reqResult.request, navResult);
      assert.equal(commitResult.success, false);
      assert.equal(commitResult.code, 'invalid-status');
      assert.equal(commitResult.changed, false);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 6 — Traversal Failed Preserves Last Authoritative Location
  // =========================================================================
  describe('Test 6 — traversal-failed Preserves Last Authoritative Location', () => {
    it('preserves authoritative location when navigation provider reports traversal-failed', () => {
      const { state, player, clock } = setupWorld();

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      provider.setDestinationStatus('street:development-street', 'traversal-failed');

      const navResult = provider.requestTraversal(reqResult.request);
      assert.equal(navResult.status, 'traversal-failed');

      const commitResult = validateArrivalAndCommit(state, reqResult.request, navResult);
      assert.equal(commitResult.success, false);
      assert.equal(commitResult.code, 'invalid-status');
      assert.equal(commitResult.changed, false);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 7 — Arrived Does Not Directly Mutate WorldState
  // =========================================================================
  describe('Test 7 — arrived Does Not Directly Mutate WorldState', () => {
    it('confirms provider returning arrived leaves WorldState completely unmutated until World Core commits', () => {
      const { state, player, clock } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      const navResult = provider.requestTraversal(reqResult.request);
      assert.equal(navResult.status, 'arrived');

      // Critical check: Provider returning 'arrived' MUST NOT mutate WorldState directly!
      assert.equal(JSON.stringify(state), snapshotBefore);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 8 — Authoritative Arrival Commit
  // =========================================================================
  describe('Test 8 — Authoritative Arrival Commit', () => {
    it('commits logical transition only when World Core validates arrival', () => {
      const { state, player, clock } = setupWorld();

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      const navResult = provider.requestTraversal(reqResult.request);
      assert.equal(navResult.status, 'arrived');

      const commitResult = validateArrivalAndCommit(state, reqResult.request, navResult);
      assert.equal(commitResult.success, true);
      assert.equal(commitResult.code, 'success');
      assert.equal(commitResult.changed, true);
      assert.equal(commitResult.previousLocationId, 'building:development-building');
      assert.equal(commitResult.currentLocationId, 'street:development-street');
      assert.equal(player.locationId, 'street:development-street');
    });
  });

  // =========================================================================
  // Test 9 — Request/Result Identity Mismatch Is Rejected
  // =========================================================================
  describe('Test 9 — Request/Result Identity Mismatch Is Rejected', () => {
    it('rejects arrival when requestId, agentId, or destinationPlaceId do not match', () => {
      const { state, player, clock } = setupWorld();

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      const navResult = provider.requestTraversal(reqResult.request);

      // Tamper with destination in result
      const tamperedResult: NavigationResult = {
        ...navResult,
        destinationPlaceId: 'street:avenida-juarez',
      };

      const commitResult = validateArrivalAndCommit(state, reqResult.request, tamperedResult);
      assert.equal(commitResult.success, false);
      assert.equal(commitResult.code, 'request-result-mismatch');
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 10 — Stale Origin Is Rejected
  // =========================================================================
  describe('Test 10 — Stale Origin Is Rejected', () => {
    it('rejects arrival if agent moved elsewhere while navigation traversal was in flight', () => {
      const { state, player, clock } = setupWorld();

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      const navResult = provider.requestTraversal(reqResult.request);

      // Intervening authoritative world change: agent is moved to another building
      player.locationId = 'building:development-residence';

      const commitResult = validateArrivalAndCommit(state, reqResult.request, navResult);
      assert.equal(commitResult.success, false);
      assert.equal(commitResult.code, 'stale-origin');
      assert.equal(commitResult.changed, false);
      // Location remains at the intervening location, not overwritten by stale arrival
      assert.equal(player.locationId, 'building:development-residence');
    });
  });

  // =========================================================================
  // Test 11 — Stale Destination / Destination Removed
  // =========================================================================
  describe('Test 11 — Destination Becoming Invalid After Request Creation', () => {
    it('rejects arrival if destination is no longer present in World Core at arrival time', () => {
      const { state, player, clock } = setupWorld();

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      const navResult = provider.requestTraversal(reqResult.request);

      // Simulate world topology mutation: destination place is removed from state
      state.places = state.places.filter((p) => p.id !== 'street:development-street');

      const commitResult = validateArrivalAndCommit(state, reqResult.request, navResult);
      assert.equal(commitResult.success, false);
      assert.equal(commitResult.code, 'destination-not-found');
      assert.equal(commitResult.changed, false);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 12 — Missing Agent at Arrival Time
  // =========================================================================
  describe('Test 12 — Missing Agent at Arrival Time', () => {
    it('rejects arrival if agent was removed from world state before arrival commit', () => {
      const { state, player, clock } = setupWorld();

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      const navResult = provider.requestTraversal(reqResult.request);

      // Agent despawned / removed from world
      state.agents = state.agents.filter((a) => a.id !== player.id);

      const commitResult = validateArrivalAndCommit(state, reqResult.request, navResult);
      assert.equal(commitResult.success, false);
      assert.equal(commitResult.code, 'agent-not-found');
    });
  });

  // =========================================================================
  // Test 13 — Provider Failure / Exception Isolation
  // =========================================================================
  describe('Test 13 — Provider Exception Cannot Corrupt WorldState', () => {
    it('ensures provider throwing an exception leaves WorldState completely intact', () => {
      const { state, player, clock } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const reqResult = createNavigationRequest(
        state,
        player.id,
        'street:development-street',
        clock.getTime()
      );
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      provider.setThrowOnRequest(true, new Error('Simulated external crash'));

      assert.throws(
        () => provider.requestTraversal(reqResult.request),
        /Simulated external crash/
      );

      // WorldState is completely intact
      assert.equal(JSON.stringify(state), snapshotBefore);
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // Test 14 — Provider Independence from Unity / Browser / DOM
  // =========================================================================
  describe('Test 14 — Provider Independence from Unity / Browser / DOM', () => {
    it('executes cleanly in headless Node without Unity, window, document, or Canvas', () => {
      const globalAny = globalThis as Record<string, unknown>;
      assert.equal(typeof globalAny.UnityEngine, 'undefined');
      assert.equal(typeof globalAny.window, 'undefined');
      assert.equal(typeof globalAny.document, 'undefined');

      const { state, player, clock } = setupWorld();
      const req = createNavigationRequest(state, player.id, 'street:development-street', clock.getTime());
      assert.ok(req.success);

      const provider = new DeterministicMockNavigationProvider();
      const result = provider.requestTraversal(req.request);
      assert.equal(result.status, 'arrived');
    });
  });

  // =========================================================================
  // Test 15 — Zero Coordinate Leakage
  // =========================================================================
  describe('Test 15 — Zero Coordinate Leakage', () => {
    it('ensures NavigationRequest, NavigationResult, Agent, and WorldState contain no coordinates or vectors', () => {
      const { state, player, clock } = setupWorld();
      const reqResult = createNavigationRequest(state, player.id, 'street:development-street', clock.getTime());
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      const navResult = provider.requestTraversal(reqResult.request);

      const forbiddenKeys = [
        'x', 'y', 'z', 'coordinates', 'position', 'rotation', 'quaternion',
        'transform', 'velocity', 'acceleration', 'speed', 'path', 'waypoints',
        'navMeshAgentId', 'mesh', 'bounds', 'travelTime'
      ];

      for (const key of forbiddenKeys) {
        assert.equal(key in reqResult.request, false, `Forbidden key "${key}" found in NavigationRequest`);
        assert.equal(key in navResult, false, `Forbidden key "${key}" found in NavigationResult`);
        assert.equal(key in player, false, `Forbidden key "${key}" found in Agent`);
        assert.equal(key in state, false, `Forbidden key "${key}" found in WorldState`);
      }
    });
  });

  // =========================================================================
  // Test 16 — Schema Version Preservation
  // =========================================================================
  describe('Test 16 — Schema Version Preservation', () => {
    it('asserts CURRENT_WORLD_STATE_VERSION remains strictly 18', () => {
      const { state } = setupWorld();
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      assert.equal(state.version, 19);
    });
  });

  // =========================================================================
  // Test 17 — Deterministic Mock Produces Deterministic Results
  // =========================================================================
  describe('Test 17 — Deterministic Mock Produces Deterministic Results', () => {
    it('produces identical results for repeated identical requests', () => {
      const { state, player, clock } = setupWorld();
      const req1 = createNavigationRequest(state, player.id, 'street:development-street', clock.getTime());
      const req2 = createNavigationRequest(state, player.id, 'street:development-street', clock.getTime());

      assert.ok(req1.success && req2.success);

      const provider = new DeterministicMockNavigationProvider();
      const res1 = provider.requestTraversal(req1.request);
      const res2 = provider.requestTraversal(req2.request);

      assert.deepEqual(res1, res2);
    });
  });

  // =========================================================================
  // Test 18 — Repeated Arrival Result (Idempotency)
  // =========================================================================
  describe('Test 18 — Repeated Arrival Result Does Not Duplicate or Corrupt State', () => {
    it('handles idempotent repeated arrival when agent is already at destination', () => {
      const { state, player, clock } = setupWorld();

      const reqResult = createNavigationRequest(state, player.id, 'street:development-street', clock.getTime());
      assert.ok(reqResult.success);

      const provider = new DeterministicMockNavigationProvider();
      const navResult = provider.requestTraversal(reqResult.request);

      // First commit: changes location to street
      const firstCommit = validateArrivalAndCommit(state, reqResult.request, navResult);
      assert.equal(firstCommit.success, true);
      assert.equal(firstCommit.code, 'success');
      assert.equal(firstCommit.changed, true);
      assert.equal(player.locationId, 'street:development-street');

      // Second commit with same request/result: agent is already at destination
      const secondCommit = validateArrivalAndCommit(state, reqResult.request, navResult);
      assert.equal(secondCommit.success, true);
      assert.equal(secondCommit.code, 'already-at-destination');
      assert.equal(secondCommit.changed, false);
      assert.equal(player.locationId, 'street:development-street');
    });
  });
});
