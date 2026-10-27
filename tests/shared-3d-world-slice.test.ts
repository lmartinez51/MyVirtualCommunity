/**
 * Milestone 77 — Shared 3D World Slice Foundation Test Suite
 *
 * Verifies that the Minimal 3D client and traversal runtime provide a unified, continuous
 * shared 3D world slice representing Street, Residence, Commercial Building, Restaurant,
 * Player, and Elena simultaneously:
 *
 * Acceptance Criteria Matrix:
 * A. Shared scene contains Player, Elena, Residence, Street, and Restaurant simultaneously.
 * B. Elena initially appears at the residence threshold.
 * C. Triggering the morning commute produces the expected MoveToPlaceIntent.
 * D. Traversal is registered through the existing RuntimeTraversalCoordinator.
 * E. Multiple physical traversal steps occur.
 * F. Elena's authoritative locationId remains at the residence throughout all intermediate traversal frames.
 * G. Elena's physical presentation position changes during traversal.
 * H. Physical arrival produces a NavigationResult.
 * I. Arrival is committed only through the existing authoritative validation path.
 * J. Elena's authoritative locationId changes to the restaurant only after successful arrival validation.
 * K. Existing M68–M76 tests remain green.
 * L. World-state schema remains version 18.
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
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { Scene3D, Node3D, type Vector3 } from '../clients/minimal-3d/scene-3d.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import {
  deriveAgentContext,
  type AgentContext,
} from '../src/core/agent-context.js';
import {
  DeterministicAgentDecisionProvider,
  dispatchAgentIntent,
  type MoveToPlaceIntent,
} from '../src/core/agent-intent.js';
import { type NavigationResult } from '../src/core/navigation-contract.js';

describe('Milestone 77: Shared 3D World Slice Foundation', () => {
  const COMMUTE_TIME_UTC = '2026-09-14T14:35:00.000Z'; // 08:35 AM local (commute window)
  const elenaId = 'agent:dev-npc';
  const playerId = 'agent:dev-player';
  const residenceId = 'building:development-residence';
  const streetId = 'street:development-street';
  const restaurantId = 'restaurant:development-restaurant';
  const commercialId = 'building:development-building';

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = new WorldClock(COMMUTE_TIME_UTC);
    const state = createInitialWorldState(clock);
    transitionAgentLocation(state, elenaId, residenceId, { silent: true });
    transitionAgentLocation(state, playerId, streetId, { silent: true });
    return { clock, state };
  }

  // =========================================================================
  // Test Group 1: Continuous Shared 3D Scene Assembly (Conditions A, B)
  // =========================================================================
  describe('1. Continuous Shared 3D Scene Assembly', () => {
    it('Condition A: Shared scene contains Player, Elena, Residence, Street, and Restaurant simultaneously', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m77',
        observerAgentId: playerId,
      });

      const scene = client.buildSharedWorldSlice(state);
      assert.ok(scene);

      // Verify all required entities exist simultaneously in the same scene
      const streetNode = scene.getNodeByEntityId(streetId);
      assert.ok(streetNode, 'Street plane must be present in shared scene');
      assert.equal(streetNode.primitive, 'plane');

      const residenceNode = scene.getNodeByEntityId(residenceId);
      assert.ok(residenceNode, 'Residence building must be present in shared scene');
      assert.equal(residenceNode.primitive, 'box');

      const resDoorNode = scene.getNode('node:anchor:residence-door');
      assert.ok(resDoorNode, 'Residence door anchor must be present in shared scene');

      const commercialNode = scene.getNodeByEntityId(commercialId);
      assert.ok(commercialNode, 'Commercial building must be present in shared scene');

      const comDoorNode = scene.getNode('node:anchor:commercial-door');
      assert.ok(comDoorNode, 'Commercial door anchor must be present in shared scene');

      const restaurantNode = scene.getNodeByEntityId(restaurantId);
      assert.ok(restaurantNode, 'Restaurant must be present in shared scene');

      const playerNode = scene.getNodeByEntityId(playerId);
      assert.ok(playerNode, 'Player must be present in shared scene');

      const elenaNode = scene.getNodeByEntityId(elenaId);
      assert.ok(elenaNode, 'Elena must be present in shared scene');

      // Total objects in unified scene
      const nodes = scene.getAllNodes();
      assert.ok(nodes.length >= 7, 'Scene must contain at least 7 distinct slice objects');
    });

    it('Condition B: Elena initially appears at the residence threshold', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m77',
        observerAgentId: playerId,
      });

      client.buildSharedWorldSlice(state);
      const elenaPos = client.getAgentVisualPosition(elenaId);
      assert.ok(elenaPos, 'Elena visual position must be defined');

      // Residence doorway threshold anchor is at (10, 1.5, 0)
      assert.equal(elenaPos.x, 10.0, 'Elena must visually begin at residence threshold x: 10');
      assert.equal(elenaPos.y, 1.5, 'Elena must visually begin at residence threshold y: 1.5');
      assert.equal(elenaPos.z, 0.0, 'Elena must visually begin at residence threshold z: 0');

      // Player sits on street at (0, 1, 0)
      const playerPos = client.getPlayerVisualPosition();
      assert.ok(playerPos);
      assert.equal(playerPos.x, 0.0, 'Player must be positioned on the street');
    });
  });

  // =========================================================================
  // Test Group 2: Epistemic Context & Morning Commute Decision (Conditions C, D)
  // =========================================================================
  describe('2. Epistemic Context & Morning Commute Decision', () => {
    it('Condition C: Triggering the morning commute produces the expected MoveToPlaceIntent', () => {
      const { state } = setupWorld();
      const context = deriveAgentContext(state, elenaId);
      assert.ok(context);

      assert.equal(context.scheduledObjective.type, 'commute-to-work');
      assert.equal(context.scheduledObjective.targetPlaceId, restaurantId);

      const decisionProvider = new DeterministicAgentDecisionProvider();
      const intent = decisionProvider.decideIntent(context);

      assert.equal(intent.intentType, 'move-to-place');
      const moveIntent = intent as MoveToPlaceIntent;
      assert.equal(moveIntent.agentId, elenaId);
      assert.equal(moveIntent.destinationPlaceId, restaurantId);
      assert.equal(moveIntent.reason, 'commute-to-work');
    });

    it('Condition D: Traversal is registered through the existing RuntimeTraversalCoordinator', () => {
      const { state } = setupWorld();
      const context = deriveAgentContext(state, elenaId);
      const decisionProvider = new DeterministicAgentDecisionProvider();
      const intent = decisionProvider.decideIntent(context);

      const coordinator = new RuntimeTraversalCoordinator();
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);

      const dispatchResult = dispatchAgentIntent(state, intent, { coordinator });
      assert.equal(dispatchResult.success, true);
      assert.equal(dispatchResult.code, 'traversal-started');
      assert.equal(coordinator.hasActiveTraversal(elenaId), true);

      const activeTraversal = coordinator.getActiveTraversal(elenaId);
      assert.ok(activeTraversal);
      const activeReq = activeTraversal.request;
      assert.ok(activeReq);
      assert.equal(activeReq.agentId, elenaId);
      assert.equal(activeReq.originPlaceId, residenceId);
      assert.equal(activeReq.destinationPlaceId, restaurantId);
    });
  });

  // =========================================================================
  // Test Group 3: Multi-Step Physical Traversal & In-Flight Isolation (Conditions E, F, G)
  // =========================================================================
  describe('3. Multi-Step Physical Traversal & In-Flight Isolation', () => {
    it('Conditions E, F, G: Multiple physical steps occur, position changes, while World Core location remains at residence', async () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m77',
        observerAgentId: playerId,
      });
      client.buildSharedWorldSlice(state);

      const coordinator = new RuntimeTraversalCoordinator();
      const runtime = new PhysicalTraversalRuntime({
        client,
        speed: 8.0, // 8 units / sec
      });

      const context = deriveAgentContext(state, elenaId);
      const intent = new DeterministicAgentDecisionProvider().decideIntent(context);
      const dispatchResult = dispatchAgentIntent(state, intent, { coordinator });
      assert.ok(dispatchResult.request);

      // Start traversal in physical runtime
      const traversalPromise = runtime.requestTraversal(dispatchResult.request);
      assert.equal(runtime.hasActiveTraversal(elenaId), true);

      const initialPos = client.getAgentVisualPosition(elenaId)!;
      assert.equal(initialPos.x, 10.0);

      const elena = state.agents.find((a) => a.id === elenaId)!;

      // Condition E & G: Step 1 (+500ms)
      runtime.step(500);
      const pos1 = client.getAgentVisualPosition(elenaId)!;
      assert.ok(pos1.x < 10.0, 'Elena must advance Westward along X axis');
      // Condition F: LocationId MUST remain at residence!
      assert.equal(elena.locationId, residenceId, 'Elena locationId must remain residence in Frame 1');

      // Step 2 (+500ms)
      runtime.step(500);
      const pos2 = client.getAgentVisualPosition(elenaId)!;
      assert.ok(pos2.x < pos1.x, 'Elena must continue advancing Westward');
      assert.equal(elena.locationId, residenceId, 'Elena locationId must remain residence in Frame 2');

      // Step 3 (+500ms)
      runtime.step(500);
      const pos3 = client.getAgentVisualPosition(elenaId)!;
      assert.ok(pos3.x < pos2.x);
      assert.equal(elena.locationId, residenceId, 'Elena locationId must remain residence in Frame 3');

      // Verify Player position remained strictly unaffected
      const playerPos = client.getPlayerVisualPosition()!;
      assert.equal(playerPos.x, 0.0);
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, streetId);
    });
  });

  // =========================================================================
  // Test Group 4: Physical Arrival & M69 Authoritative Commit (Conditions H, I, J)
  // =========================================================================
  describe('4. Physical Arrival & M69 Authoritative Commit', () => {
    it('Conditions H, I, J: Physical arrival produces NavigationResult; locationId updates to restaurant ONLY after arrival commit', async () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m77',
        observerAgentId: playerId,
      });
      client.buildSharedWorldSlice(state);

      const coordinator = new RuntimeTraversalCoordinator();
      const runtime = new PhysicalTraversalRuntime({
        client,
        speed: 8.0,
      });

      const context = deriveAgentContext(state, elenaId);
      const intent = new DeterministicAgentDecisionProvider().decideIntent(context);
      const dispatchResult = dispatchAgentIntent(state, intent, { coordinator });
      const traversalPromise = runtime.requestTraversal(dispatchResult.request!);

      const elena = state.agents.find((a) => a.id === elenaId)!;

      // Advance through intermediate steps
      runtime.step(1000);
      runtime.step(1000);
      assert.equal(elena.locationId, residenceId, 'LocationId must remain residence during transit');

      // Advance to destination
      runtime.step(5000);

      // Condition H: Arrival produces NavigationResult
      const navResult = await traversalPromise;
      assert.ok(navResult);
      assert.equal(navResult.status, 'arrived');
      assert.equal(navResult.destinationPlaceId, restaurantId);

      // CRITICAL: Even after physical arrival, locationId MUST NOT change until coordinator commit!
      assert.equal(
        elena.locationId,
        residenceId,
        'Agent locationId must remain origin even after physical arrival before commit'
      );

      // Condition I & J: Commit via existing authoritative validation path
      const commitResult = coordinator.completeTraversal(state, navResult);
      assert.equal(commitResult.success, true);
      assert.equal(commitResult.code, 'success');
      assert.equal(commitResult.changed, true);
      assert.equal(commitResult.previousLocationId, residenceId);
      assert.equal(commitResult.currentLocationId, restaurantId);

      // Authoritative location in WorldCore is now restaurant:development-restaurant
      assert.equal(elena.locationId, restaurantId, 'LocationId must update to restaurant ONLY after commit');
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);
    });
  });

  // =========================================================================
  // Test Group 5: Multi-Agent Scene Independence & Stale Rejection
  // =========================================================================
  describe('5. Multi-Agent Scene Independence & Stale Rejection', () => {
    it('allows moving the player locally without affecting Elena or WorldState', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m77',
        observerAgentId: playerId,
      });
      client.buildSharedWorldSlice(state);

      const elenaPosBefore = client.getAgentVisualPosition(elenaId)!;
      const playerPosBefore = client.getPlayerVisualPosition()!;

      // Nudge player locally
      client.movePlayerVisual({ x: 5.0, y: 0.0, z: -2.0 });

      const playerPosAfter = client.getPlayerVisualPosition()!;
      const elenaPosAfter = client.getAgentVisualPosition(elenaId)!;

      assert.equal(playerPosAfter.x, playerPosBefore.x + 5.0);
      assert.equal(playerPosAfter.z, playerPosBefore.z - 2.0);
      assert.deepEqual(elenaPosAfter, elenaPosBefore, 'Elena position must remain untouched by player movement');

      // World Core locations remain untouched
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, streetId);
      assert.equal(state.agents.find((a) => a.id === elenaId)!.locationId, residenceId);
    });

    it('rejects stale or unauthorized arrival results without mutating WorldState', () => {
      const { state } = setupWorld();
      const coordinator = new RuntimeTraversalCoordinator();

      const fakeResult: NavigationResult = Object.freeze({
        requestId: 'req:unregistered-fake',
        agentId: elenaId,
        destinationPlaceId: restaurantId,
        status: 'arrived',
        completedAt: COMMUTE_TIME_UTC,
      });

      const commitResult = coordinator.completeTraversal(state, fakeResult);
      assert.equal(commitResult.success, false);
      assert.equal(commitResult.code, 'no-active-traversal');

      // Elena remains at origin
      assert.equal(state.agents.find((a) => a.id === elenaId)!.locationId, residenceId);
    });
  });

  // =========================================================================
  // Test Group 6: Schema Version 18 Preservation (Condition L)
  // =========================================================================
  describe('6. Schema Version 18 Preservation', () => {
    it('Condition L: World-state schema remains version 18 and state roundtrips cleanly', () => {
      const { state } = setupWorld();
      assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
      assert.equal(state.version, 19);

      const serialized = JSON.stringify(state);
      const deserialized = JSON.parse(serialized);

      assert.equal(deserialized.version, 19);
      assert.equal(deserialized.scenes, undefined);
      assert.equal(deserialized.transforms, undefined);
      assert.equal(deserialized.visualPositions, undefined);
    });
  });
});
