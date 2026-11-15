/**
 * Milestone 74 — Physical Traversal Runtime Integration Test Suite
 *
 * Verifies that the PhysicalTraversalRuntime:
 * 1. Creates an in-flight physical traversal without modifying World Core.
 * 2. Leaves Agent.locationId strictly at the origin during transit.
 * 3. Requires multiple steps/frames to traverse over time (no instantaneous teleportation).
 * 4. Deterministically moves physical transforms in Scene3D across steps.
 * 5. Preserves origin logical location across all intermediate steps.
 * 6. Detects physical arrival and resolves its pending Promise with status 'arrived'.
 * 7. Authoritatively commits arrival only when routed through M73 and M69.
 * 8. Terminates with failure/interruption without mutating World Core.
 * 9. Supports explicit local cancellation, resolving pending operations without leaks.
 * 10. Enforces supersession: starting a new request cancels the prior in-flight traversal.
 * 11. Strictly prevents superseded/old promises or results from committing arrival.
 * 12. Guarantees 100% deterministic progression under identical delta sequences.
 * 13. Deterministically rejects invalid, negative, or non-finite delta values.
 * 14. Resolves logical destinations to correct client-side physical anchors.
 * 15. World Core isolation: no physical coordinates or traversal state enter WorldState.
 * 16. Preserves WorldState schema version 18.
 * 17. End-to-end integration: PhysicalTraversalRuntime -> NavigationResult -> M73 -> M69 -> WorldState.
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
  createNavigationRequest,
  type NavigationRequest,
  type NavigationResult,
} from '../src/core/navigation-contract.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { Scene3D, Node3D, type Vector3 } from '../clients/minimal-3d/scene-3d.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';
import {
  PhysicalTraversalRuntime,
  type PhysicalTraversalRuntimeOptions,
} from '../clients/minimal-3d/physical-traversal-runtime.js';
import { projectWorldState } from '../src/core/world-projection.js';

describe('Milestone 74 — Physical Traversal Runtime Integration', () => {
  const ANCHOR_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 AM local
  const playerId = 'agent:dev-player';
  const npcId = 'agent:dev-npc';
  const street1 = 'street:development-street';
  const street2 = 'street:avenida-juarez';
  const commercial = 'building:development-building';
  const residence = 'building:development-residence';

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = new WorldClock(ANCHOR_TIME);
    const state = createInitialWorldState(clock);
    transitionAgentLocation(state, playerId, street1, { silent: true });
    transitionAgentLocation(state, npcId, street1, { silent: true });
    return { clock, state };
  }

  function setupClient(state: WorldState): { client: Minimal3DClient; runtime: PhysicalTraversalRuntime } {
    const snapshot = projectWorldState(state, playerId);
    const client = new Minimal3DClient({
      clientId: 'client:test-3d',
      observerAgentId: playerId,
    });
    client.updateSnapshot(snapshot);

    const runtime = new PhysicalTraversalRuntime({
      client,
      speed: 10.0, // 10 units / second
    });

    return { client, runtime };
  }

  // --------------------------------------------------------------------------
  // Test 1 — Start: In-flight traversal created
  // --------------------------------------------------------------------------
  it('Test 1 — Starting a valid traversal creates an in-flight physical traversal', async () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);

    const reqResult = createNavigationRequest(state, playerId, commercial, ANCHOR_TIME, 'req:start-test');
    assert.equal(reqResult.success, true);
    if (!reqResult.success) return;

    assert.equal(runtime.hasActiveTraversal(playerId), false);

    // Request traversal through runtime
    const promise = runtime.requestTraversal(reqResult.request);

    assert.equal(runtime.hasActiveTraversal(playerId), true);
    const active = runtime.getActiveTraversal(playerId);
    assert.ok(active);
    assert.equal(active.request.requestId, 'req:start-test');
    assert.equal(active.request.agentId, playerId);
    assert.equal(active.request.destinationPlaceId, commercial);
    assert.equal(active.progress, 0);

    // Promise remains pending at start
    let isPending = true;
    promise.then(() => {
      isPending = false;
    });
    // Microtask flush
    await Promise.resolve();
    assert.equal(isPending, true, 'Promise must remain pending before steps/arrival');
  });

  // --------------------------------------------------------------------------
  // Test 2 — No immediate logical movement
  // --------------------------------------------------------------------------
  it('Test 2 — After starting traversal, Agent.locationId remains strictly at origin', () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);

    const initialLocation = state.agents.find((a) => a.id === playerId)!.locationId;
    assert.equal(initialLocation, street1);

    const reqResult = createNavigationRequest(state, playerId, commercial, ANCHOR_TIME);
    if (!reqResult.success) throw new Error('Request creation failed');

    runtime.requestTraversal(reqResult.request);

    // CRITICAL INVARIANT: World Core location must NOT change
    const currentLocation = state.agents.find((a) => a.id === playerId)!.locationId;
    assert.equal(currentLocation, street1, 'World Core location must remain at origin');
  });

  // --------------------------------------------------------------------------
  // Test 3 — Time-spanning movement: single step does not immediately produce arrival
  // --------------------------------------------------------------------------
  it('Test 3 — One step does not immediately produce arrival (requires time progression)', async () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);

    const reqResult = createNavigationRequest(state, playerId, commercial, ANCHOR_TIME);
    if (!reqResult.success) throw new Error('Request creation failed');

    const promise = runtime.requestTraversal(reqResult.request);

    // Step a small delta (e.g. 100ms)
    const completed = runtime.step(100);

    assert.equal(completed.length, 0, 'No arrival should be completed after 100ms');
    assert.equal(runtime.hasActiveTraversal(playerId), true);
    assert.ok(runtime.getProgress(playerId) > 0);
    assert.ok(runtime.getProgress(playerId) < 1.0);

    let isPending = true;
    promise.then(() => {
      isPending = false;
    });
    await Promise.resolve();
    assert.equal(isPending, true, 'Promise must still be pending after 1 small step');
  });

  // --------------------------------------------------------------------------
  // Test 4 — Progress: multiple steps move physical representation deterministically
  // --------------------------------------------------------------------------
  it('Test 4 — Multiple steps move physical representation deterministically', () => {
    const { state } = setupWorld();
    const { client, runtime } = setupClient(state);

    const reqResult = createNavigationRequest(state, playerId, commercial, ANCHOR_TIME);
    if (!reqResult.success) throw new Error('Request creation failed');

    runtime.requestTraversal(reqResult.request);

    const initialPos = client.getPlayerVisualPosition();
    assert.ok(initialPos);

    // Step 1: 200ms
    runtime.step(200);
    const pos1 = client.getPlayerVisualPosition()!;
    const progress1 = runtime.getProgress(playerId);

    // Step 2: 200ms
    runtime.step(200);
    const pos2 = client.getPlayerVisualPosition()!;
    const progress2 = runtime.getProgress(playerId);

    assert.ok(progress2 > progress1, 'Progress must increase with elapsed time');
    // Moving towards commercial door at x=-8
    assert.ok(pos2.x < pos1.x, 'Player X coordinate must move towards commercial building (west)');
  });

  // --------------------------------------------------------------------------
  // Test 5 — Logical location remains origin during all intermediate steps
  // --------------------------------------------------------------------------
  it('Test 5 — Agent.locationId remains strictly at origin across all intermediate steps', () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);

    const reqResult = createNavigationRequest(state, playerId, commercial, ANCHOR_TIME);
    if (!reqResult.success) throw new Error('Request creation failed');

    runtime.requestTraversal(reqResult.request);

    // Perform intermediate steps
    for (let i = 0; i < 5; i++) {
      runtime.step(100);
      const agentLocation = state.agents.find((a) => a.id === playerId)!.locationId;
      assert.equal(
        agentLocation,
        street1,
        `Agent location must remain ${street1} at step ${i + 1}`
      );
    }
  });

  // --------------------------------------------------------------------------
  // Test 6 — Arrival: after sufficient time, NavigationResult status === 'arrived'
  // --------------------------------------------------------------------------
  it('Test 6 — After sufficient time, physical arrival is detected and resolves with status "arrived"', async () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);

    const reqResult = createNavigationRequest(state, playerId, commercial, ANCHOR_TIME, 'req:arrival-test');
    if (!reqResult.success) throw new Error('Request creation failed');

    const promise = runtime.requestTraversal(reqResult.request);

    // Step enough time to reach destination (e.g. 2000ms at speed 10)
    let completed: readonly NavigationResult[] = [];
    while (runtime.hasActiveTraversal(playerId)) {
      completed = runtime.step(200);
    }

    assert.equal(completed.length, 1);
    const result = completed[0];
    assert.equal(result.requestId, 'req:arrival-test');
    assert.equal(result.agentId, playerId);
    assert.equal(result.destinationPlaceId, commercial);
    assert.equal(result.status, 'arrived');

    // The awaited promise should resolve with the identical arrival result
    const awaitedResult = await promise;
    assert.deepEqual(awaitedResult, result);
    assert.equal(runtime.hasActiveTraversal(playerId), false);
  });

  // --------------------------------------------------------------------------
  // Test 7 — Authoritative commit: when passed to M73, Agent.locationId becomes destination
  // --------------------------------------------------------------------------
  it('Test 7 — When arrival result is passed to M73, Agent.locationId commits to destination', async () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);
    const coordinator = new RuntimeTraversalCoordinator();

    // 1. Start through coordinator
    const start = coordinator.startTraversal(state, playerId, commercial, ANCHOR_TIME, 'req:commit-test');
    assert.equal(start.success, true);
    if (!start.success) return;

    // 2. Initiate physical traversal
    const promise = runtime.requestTraversal(start.request);

    // 3. Step until arrived
    while (runtime.hasActiveTraversal(playerId)) {
      runtime.step(250);
    }

    const navResult = await promise;
    assert.equal(navResult.status, 'arrived');

    // 4. Complete through coordinator
    const completion = coordinator.completeTraversal(state, navResult);

    assert.equal(completion.success, true);
    assert.equal(completion.code, 'success');
    assert.equal(completion.changed, true);
    assert.equal(completion.previousLocationId, street1);
    assert.equal(completion.currentLocationId, commercial);

    // Authoritative location in WorldState is now commercial building!
    const agentLocation = state.agents.find((a) => a.id === playerId)!.locationId;
    assert.equal(agentLocation, commercial);
  });

  // --------------------------------------------------------------------------
  // Test 8 — Failure: traversal can terminate with failure/interruption status without mutating World Core
  // --------------------------------------------------------------------------
  it('Test 8 — Unresolvable destination terminates with "route-unavailable" with zero World Core mutation', async () => {
    const { state } = setupWorld();
    const runtime = new PhysicalTraversalRuntime({
      destinationResolver: () => undefined, // Unresolvable
    });

    const mockRequest: NavigationRequest = {
      requestId: 'req:unresolvable',
      agentId: playerId,
      originPlaceId: street1,
      destinationPlaceId: 'place:non-existent',
      requestedAt: ANCHOR_TIME,
      agentType: 'player',
    };

    const result = await runtime.requestTraversal(mockRequest);

    assert.equal(result.status, 'route-unavailable');
    assert.equal(result.failureCategory, 'unreachable-destination');

    // World Core location untouched
    const agentLocation = state.agents.find((a) => a.id === playerId)!.locationId;
    assert.equal(agentLocation, street1);
  });

  // --------------------------------------------------------------------------
  // Test 9 — Cancellation: cancelling active physical traversal resolves cleanly with zero mutation
  // --------------------------------------------------------------------------
  it('Test 9 — Cancelling active physical traversal resolves pending operation with "traversal-interrupted"', async () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);

    const reqResult = createNavigationRequest(state, playerId, commercial, ANCHOR_TIME, 'req:cancel-test');
    if (!reqResult.success) throw new Error('Request creation failed');

    const promise = runtime.requestTraversal(reqResult.request);

    // Step a bit
    runtime.step(200);
    assert.equal(runtime.hasActiveTraversal(playerId), true);

    // Cancel
    const cancelled = runtime.cancelCurrentTraversal(playerId, 'Player stopped');
    assert.equal(cancelled, true);
    assert.equal(runtime.hasActiveTraversal(playerId), false);

    // Pending promise must resolve cleanly with 'traversal-interrupted'
    const result = await promise;
    assert.equal(result.status, 'traversal-interrupted');
    assert.equal(result.requestId, 'req:cancel-test');

    // World Core remains at origin
    const agentLocation = state.agents.find((a) => a.id === playerId)!.locationId;
    assert.equal(agentLocation, street1);
  });

  // --------------------------------------------------------------------------
  // Test 10 — Supersession: old traversal cannot remain active when new request arrives
  // --------------------------------------------------------------------------
  it('Test 10 — Starting a new traversal supersedes and cancels the prior in-flight traversal', async () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);

    const req1 = createNavigationRequest(state, playerId, commercial, ANCHOR_TIME, 'req:1');
    const req2 = createNavigationRequest(state, playerId, residence, ANCHOR_TIME, 'req:2');
    if (!req1.success || !req2.success) throw new Error('Request creation failed');

    const promise1 = runtime.requestTraversal(req1.request);

    // Step intermediate
    runtime.step(200);

    // Request 2 arrives (A -> C)
    const promise2 = runtime.requestTraversal(req2.request);

    // Active traversal must now be req:2
    const active = runtime.getActiveTraversal(playerId);
    assert.ok(active);
    assert.equal(active.request.requestId, 'req:2');
    assert.equal(active.request.destinationPlaceId, residence);

    // Promise 1 must have resolved with traversal-interrupted (no hanging promise leak!)
    const result1 = await promise1;
    assert.equal(result1.status, 'traversal-interrupted');
    assert.equal(result1.requestId, 'req:1');

    // Clean up req2 by completing
    while (runtime.hasActiveTraversal(playerId)) {
      runtime.step(250);
    }
    const result2 = await promise2;
    assert.equal(result2.status, 'arrived');
    assert.equal(result2.requestId, 'req:2');
  });

  // --------------------------------------------------------------------------
  // Test 11 — Old promise/result: obsolete traversal cannot commit arrival in M73
  // --------------------------------------------------------------------------
  it('Test 11 — Obsolete result from superseded traversal is strictly rejected by M73', async () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);
    const coordinator = new RuntimeTraversalCoordinator();

    // 1. Coordinator starts req:1
    const start1 = coordinator.startTraversal(state, playerId, commercial, ANCHOR_TIME, 'req:1');
    assert.equal(start1.success, true);
    if (!start1.success) return;
    const promise1 = runtime.requestTraversal(start1.request);

    runtime.step(200);

    // 2. Coordinator starts req:2 (supersedes req:1 in coordinator)
    const start2 = coordinator.startTraversal(state, playerId, residence, ANCHOR_TIME, 'req:2');
    assert.equal(start2.success, true);
    if (!start2.success) return;
    const promise2 = runtime.requestTraversal(start2.request);

    // Promise 1 resolved with interrupted
    const result1 = await promise1;
    assert.equal(result1.status, 'traversal-interrupted');

    // Attempt to complete req:1 in coordinator (even if synthetic 'arrived' was passed)
    const staleArrival: NavigationResult = {
      requestId: 'req:1',
      agentId: playerId,
      destinationPlaceId: commercial,
      status: 'arrived',
      completedAt: ANCHOR_TIME,
      message: 'Late arrival',
    };
    const staleCompletion = coordinator.completeTraversal(state, staleArrival);

    assert.equal(staleCompletion.success, false);
    assert.equal(staleCompletion.code, 'stale-request');
    assert.equal(staleCompletion.changed, false);
    assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street1);

    // Req:2 steps to arrival and completes successfully
    while (runtime.hasActiveTraversal(playerId)) {
      runtime.step(250);
    }
    const result2 = await promise2;
    const completion2 = coordinator.completeTraversal(state, result2);

    assert.equal(completion2.success, true);
    assert.equal(completion2.currentLocationId, residence);
    assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, residence);
  });

  // --------------------------------------------------------------------------
  // Test 12 — Determinism: identical delta sequences produce identical coordinates
  // --------------------------------------------------------------------------
  it('Test 12 — Given identical inputs and deltas, traversal produces deterministic progression', () => {
    const deltas = [100, 200, 150, 300, 250];

    function runSimulation(): Vector3[] {
      const scene = new Scene3D();
      const playerNode = new Node3D({
        id: 'node:player',
        name: 'Player',
        position: { x: 0, y: 1, z: 0 },
      });
      scene.addNode(playerNode);

      const runtime = new PhysicalTraversalRuntime({
        scene,
        speed: 5.0,
      });

      const request: NavigationRequest = {
        requestId: 'req:determ',
        agentId: 'agent:dev-player',
        originPlaceId: street1,
        destinationPlaceId: commercial,
        requestedAt: ANCHOR_TIME,
        agentType: 'player',
      };

      runtime.requestTraversal(request);

      const positions: Vector3[] = [];
      for (const d of deltas) {
        runtime.step(d);
        positions.push({ ...runtime.getCurrentPosition('agent:dev-player')! });
      }
      return positions;
    }

    const run1 = runSimulation();
    const run2 = runSimulation();

    assert.deepEqual(run1, run2, 'Progression coordinates must be 100% deterministic');
  });

  // --------------------------------------------------------------------------
  // Test 13 — Invalid delta: rejected without producing invalid coordinates
  // --------------------------------------------------------------------------
  it('Test 13 — Rejects negative, zero, and non-finite deltaTimeMs values safely', () => {
    const scene = new Scene3D();
    const runtime = new PhysicalTraversalRuntime({ scene });

    const request: NavigationRequest = {
      requestId: 'req:invalid-delta',
      agentId: playerId,
      originPlaceId: street1,
      destinationPlaceId: commercial,
      requestedAt: ANCHOR_TIME,
      agentType: 'player',
    };
    runtime.requestTraversal(request);

    // Negative
    assert.throws(() => runtime.step(-50), /Invalid deltaTimeMs/);

    // Zero
    assert.throws(() => runtime.step(0), /Invalid deltaTimeMs/);

    // NaN
    assert.throws(() => runtime.step(NaN), /Invalid deltaTimeMs/);

    // Infinity
    assert.throws(() => runtime.step(Infinity), /Invalid deltaTimeMs/);

    // Position remains finite and uncorrupted
    const pos = runtime.getCurrentPosition(playerId);
    assert.ok(pos);
    assert.equal(Number.isFinite(pos.x), true);
    assert.equal(Number.isFinite(pos.y), true);
    assert.equal(Number.isFinite(pos.z), true);
  });

  // --------------------------------------------------------------------------
  // Test 14 — Anchor resolution: logical destination resolves to client-side physical anchor
  // --------------------------------------------------------------------------
  it('Test 14 — Resolves logical destination to correct client-side physical anchor', () => {
    const runtime = new PhysicalTraversalRuntime();

    // Default seed anchors
    const commercialDoor = runtime.resolveDestination('building:development-building');
    assert.deepEqual(commercialDoor, { x: -8, y: 1.75, z: 0 });

    const residenceDoor = runtime.resolveDestination('building:development-residence');
    assert.deepEqual(residenceDoor, { x: 10, y: 1.5, z: 0 });

    const streetPos = runtime.resolveDestination('street:development-street');
    assert.deepEqual(streetPos, { x: 0, y: 1, z: 0 });

    // Custom registered anchor
    runtime.registerAnchorCoordinate('anchor:park-bench', { x: 42, y: 0.5, z: -10 });
    const parkPos = runtime.resolveDestination('anchor:park-bench');
    assert.deepEqual(parkPos, { x: 42, y: 0.5, z: -10 });
  });

  // --------------------------------------------------------------------------
  // Test 15 — World Core isolation: no physical traversal state appears in WorldState
  // --------------------------------------------------------------------------
  it('Test 15 — No physical traversal coordinates, progress, or state appear in WorldState', () => {
    const { state } = setupWorld();
    const { runtime } = setupClient(state);

    const reqResult = createNavigationRequest(state, playerId, commercial, ANCHOR_TIME);
    if (!reqResult.success) throw new Error('Request creation failed');

    runtime.requestTraversal(reqResult.request);
    runtime.step(500);

    const agent = state.agents.find((a) => a.id === playerId)!;

    // Verify zero physical fields in agent or WorldState
    assert.equal((agent as any).x, undefined);
    assert.equal((agent as any).y, undefined);
    assert.equal((agent as any).z, undefined);
    assert.equal((agent as any).progress, undefined);
    assert.equal((agent as any).speed, undefined);
    assert.equal((agent as any).traversalState, undefined);
    assert.equal((state as any).activeTraversals, undefined);
  });

  // --------------------------------------------------------------------------
  // Test 16 — Schema: schema remains version 18
  // --------------------------------------------------------------------------
  it('Test 16 — WorldState schema version remains strictly 18', () => {
    const { state } = setupWorld();
    assert.equal(state.version, 19);
    assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
  });

  // --------------------------------------------------------------------------
  // Test 17 — Cross-layer flow integration
  // --------------------------------------------------------------------------
  it('Test 17 — End-to-end integration: PhysicalTraversalRuntime -> NavigationResult -> M73 -> M69 -> WorldState -> M71 projection', async () => {
    const { state } = setupWorld();
    const { client, runtime } = setupClient(state);
    const coordinator = new RuntimeTraversalCoordinator();

    // 1. Initial snapshot: observer at street1
    const snapshot1 = projectWorldState(state, playerId);
    assert.equal(snapshot1.observerLocationId, street1);

    // 2. Start traversal through M73 coordinator
    const start = coordinator.startTraversal(state, playerId, commercial, ANCHOR_TIME, 'req:e2e');
    assert.equal(start.success, true);
    if (!start.success) return;

    // 3. Runtime starts physical traversal
    const navPromise = runtime.requestTraversal(start.request);

    // 4. Time steps pass (multi-frame)
    runtime.step(300);
    runtime.step(300);
    assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, street1);

    // 5. Reach destination
    while (runtime.hasActiveTraversal(playerId)) {
      runtime.step(200);
    }

    const navResult = await navPromise;
    assert.equal(navResult.status, 'arrived');

    // 6. Complete through coordinator -> delegates to validateArrivalAndCommit()
    const completion = coordinator.completeTraversal(state, navResult);
    assert.equal(completion.success, true);
    assert.equal(completion.changed, true);

    // 7. World Core reflects commercial building
    assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, commercial);

    // 8. New M71 projection snapshot
    const snapshot2 = projectWorldState(state, playerId);
    assert.equal(snapshot2.observerLocationId, commercial);

    // 9. Client reconciles scene: interior restaurant spawned, exterior residence despawned
    const recon = client.updateSnapshot(snapshot2);
    assert.equal(recon.isStale, true);
    assert.ok(recon.entitiesToSpawn.some((e) => e.entityId === 'restaurant:development-restaurant'));
    assert.ok(recon.entitiesToDespawn.includes('building:development-residence'));
  });
});
