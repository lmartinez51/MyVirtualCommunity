/**
 * Milestone 73 — Runtime Traversal Coordinator Test Suite
 *
 * Verifies that the RuntimeTraversalCoordinator:
 * 1. Coordinates active in-flight traversal lifecycles outside World Core.
 * 2. Leaves Agent.locationId in WorldState strictly unchanged while traversal is in progress.
 * 3. Enforces single active traversal per agent (superseding older requests).
 * 4. Strictly prevents stale, cancelled, or superseded results from committing.
 * 5. Delegates arrival validation solely to the authoritative M69 gatekeeper.
 * 6. Guarantees idempotency on duplicate arrivals.
 * 7. Supports independent active traversals across different agents (Players and NPCs).
 * 8. Never introduces traversal state into WorldState serialization (schema version 18).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  transitionAgentLocation,
  CURRENT_WORLD_STATE_VERSION,
  type WorldState,
} from '../src/core/world-state.js';
import {
  DeterministicMockNavigationProvider,
  type NavigationResult,
} from '../src/core/navigation-contract.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';

describe('Milestone 73 — Runtime Traversal Coordinator', () => {
  const ANCHOR_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 AM local
  const playerId = 'agent:dev-player';
  const npcId = 'agent:dev-npc';
  const street1 = 'street:development-street';
  const street2 = 'street:avenida-juarez';
  const residence = 'building:development-residence';
  const commercial = 'building:development-building';

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = new WorldClock(ANCHOR_TIME);
    const state = createInitialWorldState(clock);
    transitionAgentLocation(state, playerId, street1, { silent: true });
    transitionAgentLocation(state, npcId, street1, { silent: true });
    return { clock, state };
  }

  // --------------------------------------------------------------------------
  // Tests 1-3: Traversal Initiation & State Separation
  // --------------------------------------------------------------------------
  describe('1. Traversal Initiation & Authority Separation', () => {
    it('Test 1: Starts a traversal and registers it as active', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      const result = coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME);

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.ok(coordinator.hasActiveTraversal(playerId));

      const active = coordinator.getActiveTraversal(playerId);
      assert.ok(active);
      assert.equal(active.request.agentId, playerId);
      assert.equal(active.request.originPlaceId, street1);
      assert.equal(active.request.destinationPlaceId, street2);
    });

    it('Test 2: Starting traversal does NOT change Agent.locationId in World Core', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      const initialLocation = state.agents.find((a) => a.id === playerId)!.locationId;
      assert.equal(initialLocation, street1);

      coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME);

      // CRITICAL ARCHITECTURAL ASSERTION:
      // In-flight traversal MUST NOT alter Agent.locationId in World Core!
      const currentLocation = state.agents.find((a) => a.id === playerId)!.locationId;
      assert.equal(currentLocation, street1, 'Location must remain at origin during transit');

      // Verify WorldState contains NO coordinates or traversal state
      const agent = state.agents.find((a) => a.id === playerId)!;
      assert.equal((agent as any).x, undefined);
      assert.equal((agent as any).traversalState, undefined);
      assert.equal((agent as any).activeRequestId, undefined);
    });

    it('Test 3: Active traversal contains the exact authoritative NavigationRequest', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      const customId = 'nav:custom:test-123';
      const result = coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME, customId);

      assert.equal(result.success, true);
      assert.equal(result.request.requestId, customId);
      assert.equal(result.request.agentId, playerId);
      assert.equal(result.request.originPlaceId, street1);
      assert.equal(result.request.destinationPlaceId, street2);
      assert.equal(result.request.requestedAt, ANCHOR_TIME);
      assert.equal(result.request.agentType, 'player');

      const active = coordinator.getActiveTraversal(playerId)!;
      assert.deepEqual(active.request, result.request);
      assert.equal(active.startedAt, ANCHOR_TIME);
    });
  });

  // --------------------------------------------------------------------------
  // Tests 4-6: Single Active Traversal & Supersession
  // --------------------------------------------------------------------------
  describe('2. Single Active Traversal & Supersession', () => {
    it('Test 4: Only one traversal can be active per agent at any time', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME);
      assert.equal(coordinator.getAllActiveTraversals().length, 1);

      // Starting another traversal for the same agent maintains exactly 1 active traversal
      coordinator.startTraversal(state, playerId, commercial, ANCHOR_TIME);
      assert.equal(coordinator.getAllActiveTraversals().length, 1);
      assert.equal(coordinator.getActiveTraversal(playerId)!.request.destinationPlaceId, commercial);
    });

    it('Test 5: Starting a new traversal supersedes and cancels the previous traversal', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      const req1 = coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME, 'req:1');
      assert.equal(req1.success, true);

      const req2 = coordinator.startTraversal(state, playerId, commercial, ANCHOR_TIME, 'req:2');
      assert.equal(req2.success, true);
      assert.equal(req2.supersededRequestId, 'req:1', 'Must report req:1 was superseded');

      const active = coordinator.getActiveTraversal(playerId)!;
      assert.equal(active.request.requestId, 'req:2');
    });

    it('Test 6: A stale result from the superseded request CANNOT commit', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      // 1. Agent starts traversal to street2 (req:1)
      coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME, 'req:1');

      // 2. Agent changes mind and starts traversal to commercial (req:2)
      coordinator.startTraversal(state, playerId, commercial, ANCHOR_TIME, 'req:2');

      // 3. Stale arrival result for req:1 arrives later
      const staleResult: NavigationResult = Object.freeze({
        requestId: 'req:1',
        agentId: playerId,
        destinationPlaceId: street2,
        status: 'arrived',
        completedAt: ANCHOR_TIME,
        message: 'Physical traversal arrived at street2',
      });

      const staleCommit = coordinator.completeTraversal(state, staleResult);

      // Must be rejected with stale-request
      assert.equal(staleCommit.success, false);
      assert.equal(staleCommit.code, 'stale-request');
      assert.equal(staleCommit.changed, false);
      assert.equal(staleCommit.rejectedRequestId, 'req:1');

      // World Core location MUST remain at origin
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street1);

      // Active traversal for req:2 must still be intact
      assert.ok(coordinator.hasActiveTraversal(playerId));
      assert.equal(coordinator.getActiveTraversal(playerId)!.request.requestId, 'req:2');
    });
  });

  // --------------------------------------------------------------------------
  // Tests 7-8: Authoritative Arrival Commit
  // --------------------------------------------------------------------------
  describe('3. Authoritative Arrival Delegation', () => {
    it('Test 7: Successful arrival delegates to validateArrivalAndCommit() and cleans up active traversal', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      const startResult = coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME, 'req:valid');
      assert.equal(startResult.success, true);

      const arrivalResult: NavigationResult = Object.freeze({
        requestId: 'req:valid',
        agentId: playerId,
        destinationPlaceId: street2,
        status: 'arrived',
        completedAt: ANCHOR_TIME,
        message: 'Arrived at destination',
      });

      const completion = coordinator.completeTraversal(state, arrivalResult);

      assert.equal(completion.success, true);
      assert.equal(completion.code, 'success');
      assert.equal(completion.changed, true);
      assert.equal(completion.previousLocationId, street1);
      assert.equal(completion.currentLocationId, street2);
      assert.equal(completion.completedRequestId, 'req:valid');

      // Active traversal must be cleaned up
      assert.equal(coordinator.hasActiveTraversal(playerId), false);
    });

    it('Test 8: Successful arrival changes Agent.locationId solely through the authoritative path', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      coordinator.startTraversal(state, playerId, commercial, ANCHOR_TIME, 'req:to-commercial');

      const arrival: NavigationResult = Object.freeze({
        requestId: 'req:to-commercial',
        agentId: playerId,
        destinationPlaceId: commercial,
        status: 'arrived',
        completedAt: ANCHOR_TIME,
        message: 'Arrived at commercial building',
      });

      coordinator.completeTraversal(state, arrival);

      const updatedAgent = state.agents.find((a) => a.id === playerId)!;
      assert.equal(updatedAgent.locationId, commercial, 'Agent must be in commercial building');
    });
  });

  // --------------------------------------------------------------------------
  // Tests 9-10: Failure & Cancellation
  // --------------------------------------------------------------------------
  describe('4. Failure and Cancellation Handling', () => {
    it('Test 9: Failed traversal (route-unavailable) does NOT mutate WorldState and clears active traversal', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME, 'req:blocked');

      const failResult: NavigationResult = Object.freeze({
        requestId: 'req:blocked',
        agentId: playerId,
        destinationPlaceId: street2,
        status: 'route-unavailable',
        failureCategory: 'unreachable-destination',
        completedAt: ANCHOR_TIME,
        message: 'Route blocked by obstacle',
      });

      const completion = coordinator.completeTraversal(state, failResult);

      assert.equal(completion.success, false);
      assert.equal(completion.code, 'route-unavailable');
      assert.equal(completion.changed, false);

      // WorldState must remain at origin
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street1);

      // Active traversal must be resolved/cleared
      assert.equal(coordinator.hasActiveTraversal(playerId), false);
    });

    it('Test 10: Cancelled traversal does NOT mutate WorldState and invalidates completion', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME, 'req:to-cancel');
      assert.equal(coordinator.hasActiveTraversal(playerId), true);

      // Explicit cancellation (e.g. player halts or disconnects)
      const cancelResult = coordinator.cancelTraversal(playerId, 'User halted movement');
      assert.equal(cancelResult.success, true);
      assert.equal(cancelResult.cancelledRequestId, 'req:to-cancel');
      assert.equal(coordinator.hasActiveTraversal(playerId), false);

      // Location remains strictly at origin
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street1);

      // Attempting to deliver arrival for cancelled request fails
      const arrivalResult: NavigationResult = Object.freeze({
        requestId: 'req:to-cancel',
        agentId: playerId,
        destinationPlaceId: street2,
        status: 'arrived',
        completedAt: ANCHOR_TIME,
        message: 'Late arrival',
      });

      const lateCompletion = coordinator.completeTraversal(state, arrivalResult);
      assert.equal(lateCompletion.success, false);
      assert.equal(lateCompletion.code, 'no-active-traversal');
      assert.equal(lateCompletion.changed, false);
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street1);
    });
  });

  // --------------------------------------------------------------------------
  // Tests 11-13: Duplicate Arrival & Stale Origin Protection
  // --------------------------------------------------------------------------
  describe('5. Duplicate Arrival & Stale Origin Invariants', () => {
    it('Test 11: Duplicate arrival remains idempotent and produces changed: false', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      // Start traversal and complete arrival once
      coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME, 'req:dup');
      const arrivalResult: NavigationResult = Object.freeze({
        requestId: 'req:dup',
        agentId: playerId,
        destinationPlaceId: street2,
        status: 'arrived',
        completedAt: ANCHOR_TIME,
        message: 'Arrived at street2',
      });

      const firstCommit = coordinator.completeTraversal(state, arrivalResult);
      assert.equal(firstCommit.success, true);
      assert.equal(firstCommit.code, 'success');
      assert.equal(firstCommit.changed, true);
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street2);

      // Duplicate delivery of same arrival result:
      // Since active traversal was removed, completeTraversal rejects cleanly
      const secondCommit = coordinator.completeTraversal(state, arrivalResult);
      assert.equal(secondCommit.success, false);
      assert.equal(secondCommit.code, 'no-active-traversal');
      assert.equal(secondCommit.changed, false);
    });

    it('Test 12: A result for an unknown or non-active request cannot commit', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      const ghostResult: NavigationResult = Object.freeze({
        requestId: 'req:never-started',
        agentId: playerId,
        destinationPlaceId: street2,
        status: 'arrived',
        completedAt: ANCHOR_TIME,
        message: 'Spurious arrival message',
      });

      const completion = coordinator.completeTraversal(state, ghostResult);
      assert.equal(completion.success, false);
      assert.equal(completion.code, 'no-active-traversal');
      assert.equal(completion.changed, false);
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street1);
    });

    it('Test 13: Stale origin result remains rejected by M69 gatekeeper', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      // Start traversal while at street1
      coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME, 'req:stale-origin');

      // Before arrival, an authoritative action teleports or moves the agent to residence
      transitionAgentLocation(state, playerId, residence, { silent: true });
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, residence);

      // Now the arrival for the old transit arrives
      const arrivalResult: NavigationResult = Object.freeze({
        requestId: 'req:stale-origin',
        agentId: playerId,
        destinationPlaceId: street2,
        status: 'arrived',
        completedAt: ANCHOR_TIME,
        message: 'Arrived at street2',
      });

      const completion = coordinator.completeTraversal(state, arrivalResult);

      assert.equal(completion.success, false);
      assert.equal(completion.code, 'stale-origin');
      assert.equal(completion.changed, false);

      // Agent MUST remain at residence, not street2!
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, residence);
    });
  });

  // --------------------------------------------------------------------------
  // Tests 14-17: Multi-Agent & Provider Integration
  // --------------------------------------------------------------------------
  describe('6. Multi-Agent, NPC Compatibility & Persistence Invariants', () => {
    it('Test 14: Two different agents (Player and NPC) can have independent active traversals', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      const playerStart = coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME, 'req:player');
      const npcStart = coordinator.startTraversal(state, npcId, commercial, ANCHOR_TIME, 'req:npc');

      assert.equal(playerStart.success, true);
      assert.equal(npcStart.success, true);
      assert.equal(coordinator.getAllActiveTraversals().length, 2);

      // Player completes traversal
      coordinator.completeTraversal(state, {
        requestId: 'req:player',
        agentId: playerId,
        destinationPlaceId: street2,
        status: 'arrived',
        completedAt: ANCHOR_TIME,
        message: 'Player arrived',
      });

      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street2);
      // NPC traversal remains active and at origin
      assert.ok(coordinator.hasActiveTraversal(npcId));
      assert.equal(state.agents.find((a) => a.id === npcId)!.locationId, street1);

      // NPC completes traversal
      coordinator.completeTraversal(state, {
        requestId: 'req:npc',
        agentId: npcId,
        destinationPlaceId: commercial,
        status: 'arrived',
        completedAt: ANCHOR_TIME,
        message: 'NPC arrived',
      });

      assert.equal(state.agents.find((a) => a.id === npcId)!.locationId, commercial);
      assert.equal(coordinator.getAllActiveTraversals().length, 0);
    });

    it('Test 15: No traversal runtime state is serialized into WorldState (Schema Version 18)', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      coordinator.startTraversal(state, playerId, street2, ANCHOR_TIME);

      // Schema version must remain strictly 18
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      assert.equal(state.version, 19);

      // Serialize state
      const serialized = JSON.stringify(state);
      assert.ok(!serialized.includes('activeTraversals'));
      assert.ok(!serialized.includes('RuntimeTraversalCoordinator'));
      assert.ok(!serialized.includes('ActiveTraversal'));
      assert.ok(!serialized.includes('x'));
      assert.ok(!serialized.includes('velocity'));
    });

    it('Test 16: Integrates seamlessly with DeterministicMockNavigationProvider', async () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();
      const mockProvider = new DeterministicMockNavigationProvider('mock:test-provider', 'arrived');

      const completion = await coordinator.executeTraversalWithProvider(
        state,
        playerId,
        street2,
        ANCHOR_TIME,
        mockProvider
      );

      assert.equal(completion.success, true);
      assert.equal(completion.code, 'success');
      assert.equal(completion.changed, true);
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street2);
    });

    it('Test 17: executeTraversalWithProvider handles route-unavailable without state mutation', async () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();
      const mockProvider = new DeterministicMockNavigationProvider('mock:blocked', 'route-unavailable');

      const completion = await coordinator.executeTraversalWithProvider(
        state,
        playerId,
        street2,
        ANCHOR_TIME,
        mockProvider
      );

      assert.equal(completion.success, false);
      assert.equal(completion.code, 'route-unavailable');
      assert.equal(completion.changed, false);
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street1);
    });
  });
});
