/**
 * Milestone 75 — Agent Intent & Decision Boundary Foundation Test Suite
 *
 * Verifies that:
 * 1. Agent decisions have zero World Core authority and zero direct mutation power.
 * 2. Deterministic decision provider evaluates schedule context and produces MoveToPlaceIntent.
 * 3. Decision evaluation mutates neither WorldState nor WorldClock.
 * 4. AgentIntent is strictly ephemeral, contains no coordinates, and is never persisted.
 * 5. MoveToPlaceIntent translates to NavigationRequest and starts traversal in M73.
 * 6. Invalid destinations are rejected without state mutation.
 * 7. In-flight physical traversal (M74) leaves World Core Agent.locationId strictly at origin.
 * 8. Only validated arrival committed through M73/M69 updates Agent.locationId.
 * 9. Future AI / alternative decision providers can plug into AgentDecisionProvider without changing World Core.
 * 10. Schema version remains strictly 18 with zero regressions.
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
import { createSecondaryDevelopmentNpc } from '../src/core/development-npc-schedule.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { Scene3D, Node3D } from '../clients/minimal-3d/scene-3d.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import { projectWorldState } from '../src/core/world-projection.js';
import {
  type AgentIntent,
  type MoveToPlaceIntent,
  type IdleIntent,
  type AgentDecisionProvider,
  DeterministicAgentDecisionProvider,
  createMoveToPlaceIntent,
  createIdleIntent,
  dispatchAgentIntent,
  executeAgentIntentWithProvider,
} from '../src/core/agent-intent.js';
import {
  type AgentContext,
  deriveAgentContext,
} from '../src/core/agent-context.js';

describe('Milestone 75 — Agent Intent & Decision Boundary Foundation', () => {
  // Elena's schedule: shift starts at 09:00 local, commute starts at 08:30 (30 min lead time).
  // Timezone for development entities is America/Juarez (UTC-6 in September MDT).
  // 08:35 MDT is 14:35 UTC.
  const COMMUTE_TIME_UTC = '2026-09-14T14:35:00.000Z'; // 08:35 AM local (commute window)
  const WORK_TIME_UTC = '2026-09-14T16:00:00.000Z';    // 10:00 AM local (work shift)
  const REST_TIME_UTC = '2026-09-14T05:00:00.000Z';    // 23:00 PM local (resting at home)

  const elenaId = 'agent:dev-npc';
  const secondaryNpcId = 'agent:secondary-dev-npc';
  const residenceId = 'building:development-residence';
  const restaurantId = 'restaurant:development-restaurant';
  const streetId = 'street:development-street';

  function setupWorld(initialTimeUtc: string = COMMUTE_TIME_UTC): { clock: WorldClock; state: WorldState } {
    const clock = new WorldClock(initialTimeUtc);
    const state = createInitialWorldState(clock);
    // Ensure Elena starts at her residence
    transitionAgentLocation(state, elenaId, residenceId, { silent: true });
    return { clock, state };
  }

  // --------------------------------------------------------------------------
  // Group 1: Decision Boundary & Deterministic Evaluation
  // --------------------------------------------------------------------------
  describe('1. Decision Boundary & Deterministic Evaluation', () => {
    it('Condition 1: Deterministic provider produces a MoveToPlaceIntent in commute context', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const provider = new DeterministicAgentDecisionProvider();

      const context = deriveAgentContext(state, elenaId)!;
      const intent = provider.decideIntent(context);

      assert.ok(intent, 'Decision provider must return an intent');
      assert.equal(intent.agentId, elenaId);
      assert.equal(intent.intentType, 'move-to-place');
      assert.equal((intent as MoveToPlaceIntent).destinationPlaceId, restaurantId);
      assert.equal(intent.reason, 'commute-to-work');
    });

    it('Condition 2: Decision evaluation does not mutate WorldState (Zero Mutation Invariant)', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const provider = new DeterministicAgentDecisionProvider();

      const stateBefore = JSON.stringify(state);
      const context = deriveAgentContext(state, elenaId)!;
      const intent = provider.decideIntent(context);
      const stateAfter = JSON.stringify(state);

      assert.ok(intent);
      assert.equal(stateBefore, stateAfter, 'WorldState must remain strictly byte-identical after decision');
    });

    it('Condition 3: Decision evaluation does not mutate WorldClock', () => {
      const { clock, state } = setupWorld(COMMUTE_TIME_UTC);
      const provider = new DeterministicAgentDecisionProvider();

      const timeBefore = clock.getTime();
      const context = deriveAgentContext(state, elenaId)!;
      provider.decideIntent(context);
      const timeAfter = clock.getTime();

      assert.equal(timeBefore, timeAfter, 'WorldClock must remain unchanged by decision evaluation');
    });

    it('Condition 4: AgentIntent contains no physical coordinates or traversal state', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const provider = new DeterministicAgentDecisionProvider();

      const context = deriveAgentContext(state, elenaId)!;
      const intent = provider.decideIntent(context) as MoveToPlaceIntent;

      assert.ok(intent);
      assert.equal(typeof intent.intentId, 'string');
      assert.equal(intent.agentId, elenaId);
      assert.equal(intent.intentType, 'move-to-place');
      assert.equal(intent.destinationPlaceId, restaurantId);

      // Verify absence of physical / rendering / traversal fields
      const forbiddenKeys = ['x', 'y', 'z', 'position', 'transform', 'velocity', 'speed', 'progress', 'navMesh', 'route'];
      for (const key of forbiddenKeys) {
        assert.equal((intent as any)[key], undefined, `Intent must not contain physical field "${key}"`);
      }
    });

    it('Condition 5: AgentIntent is strictly ephemeral and never persisted in WorldState', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const provider = new DeterministicAgentDecisionProvider();

      const context = deriveAgentContext(state, elenaId)!;
      provider.decideIntent(context);

      // Verify no intent collection exists on WorldState
      assert.equal((state as any).intents, undefined, 'WorldState must not have intents collection');
      assert.equal((state as any).agentIntents, undefined, 'WorldState must not have agentIntents collection');

      // Verify agent entity has no intent properties
      const agent = state.agents.find((a) => a.id === elenaId)!;
      assert.equal((agent as any).intent, undefined);
      assert.equal((agent as any).currentIntent, undefined);
      assert.equal((agent as any).pendingIntent, undefined);
    });

    it('Condition 5b: Provider produces IdleIntent when agent is already at scheduled destination', () => {
      const { state } = setupWorld(WORK_TIME_UTC);
      // Place Elena already at the restaurant during her shift
      transitionAgentLocation(state, elenaId, restaurantId, { silent: true });

      const provider = new DeterministicAgentDecisionProvider();
      const context = deriveAgentContext(state, elenaId)!;
      const intent = provider.decideIntent(context);

      assert.ok(intent);
      assert.equal(intent.intentType, 'idle');
      assert.ok(intent.reason?.includes('Already at target location'));
    });

    it('Condition 5c: Returns null when agent has no deterministic schedule', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const provider = new DeterministicAgentDecisionProvider();

      // Non-existent agent returns null context
      const context1 = deriveAgentContext(state, 'agent:unknown-non-existent');
      const intent1 = context1 ? provider.decideIntent(context1) : null;
      assert.equal(intent1, null);

      // Player has no NPC schedule -> context.scheduledObjective is null
      const context2 = deriveAgentContext(state, 'agent:dev-player')!;
      const intent2 = provider.decideIntent(context2);
      assert.equal(intent2, null);
    });
  });

  // --------------------------------------------------------------------------
  // Group 2: Intent Translation & Dispatcher Boundary
  // --------------------------------------------------------------------------
  describe('2. Intent Translation & Dispatcher Boundary', () => {
    it('Condition 6: Valid MoveToPlaceIntent produces a valid NavigationRequest in M73', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const intent = createMoveToPlaceIntent(elenaId, restaurantId, COMMUTE_TIME_UTC, 'commute-to-work');
      const coordinator = new RuntimeTraversalCoordinator();

      const dispatchResult = dispatchAgentIntent(state, intent, { coordinator });

      assert.equal(dispatchResult.success, true);
      assert.equal(dispatchResult.code, 'traversal-started');
      assert.ok(dispatchResult.request);
      assert.equal(dispatchResult.request.agentId, elenaId);
      assert.equal(dispatchResult.request.originPlaceId, residenceId);
      assert.equal(dispatchResult.request.destinationPlaceId, restaurantId);
      assert.ok(coordinator.hasActiveTraversal(elenaId));
    });

    it('Condition 7: Invalid destination is rejected without WorldState mutation', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const invalidIntent = createMoveToPlaceIntent(elenaId, 'place:non-existent-fantasy-castle', COMMUTE_TIME_UTC);
      const coordinator = new RuntimeTraversalCoordinator();

      const stateBefore = JSON.stringify(state);
      const dispatchResult = dispatchAgentIntent(state, invalidIntent, { coordinator });
      const stateAfter = JSON.stringify(state);

      assert.equal(dispatchResult.success, false);
      assert.equal(dispatchResult.code, 'invalid-destination');
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);
      assert.equal(stateBefore, stateAfter, 'WorldState must remain completely unchanged');
    });

    it('Condition 7b: Already at destination is rejected without starting traversal', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      // Elena is at residence; intent also targets residence
      const redundantIntent = createMoveToPlaceIntent(elenaId, residenceId, COMMUTE_TIME_UTC);
      const coordinator = new RuntimeTraversalCoordinator();

      const dispatchResult = dispatchAgentIntent(state, redundantIntent, { coordinator });

      assert.equal(dispatchResult.success, false);
      assert.equal(dispatchResult.code, 'already-at-destination');
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);
    });

    it('Condition 8: No direct transitionAgentLocation() path exists from decision provider', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const provider = new DeterministicAgentDecisionProvider();

      // Elena is at residence
      const elena = state.agents.find((a) => a.id === elenaId)!;
      assert.equal(elena.locationId, residenceId);

      // Evaluate intent
      const context = deriveAgentContext(state, elenaId)!;
      provider.decideIntent(context);

      // Must remain at residence
      assert.equal(elena.locationId, residenceId, 'Decision provider must never mutate Agent.locationId');
    });

    it('Condition 9: Multiple agents remain isolated during decision and dispatch', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const secondaryNpc = createSecondaryDevelopmentNpc(COMMUTE_TIME_UTC);
      state.agents.push(secondaryNpc);
      transitionAgentLocation(state, secondaryNpcId, residenceId, { silent: true });

      const provider = new DeterministicAgentDecisionProvider();
      const coordinator = new RuntimeTraversalCoordinator();

      // Elena has schedule targeting restaurantId
      const contextElena = deriveAgentContext(state, elenaId)!;
      const intentElena = provider.decideIntent(contextElena)!;
      // Secondary NPC has schedule with different timing (shift at 11:00, recreation at 08:30)
      // At 08:35, secondary NPC is in recreation phase (recreationLocationId: 'street:avenida-juarez')
      const contextSecondary = deriveAgentContext(state, secondaryNpcId)!;
      const intentSecondary = provider.decideIntent(contextSecondary)!;

      assert.ok(intentElena);
      assert.ok(intentSecondary);
      assert.equal((intentElena as MoveToPlaceIntent).destinationPlaceId, restaurantId);
      assert.equal((intentSecondary as MoveToPlaceIntent).destinationPlaceId, 'street:avenida-juarez');

      // Dispatch both
      const res1 = dispatchAgentIntent(state, intentElena, { coordinator });
      const res2 = dispatchAgentIntent(state, intentSecondary, { coordinator });

      assert.equal(res1.success, true);
      assert.equal(res2.success, true);
      assert.ok(coordinator.hasActiveTraversal(elenaId));
      assert.ok(coordinator.hasActiveTraversal(secondaryNpcId));
    });

    it('Condition 9b: IdleIntent is acknowledged without starting traversal', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const idleIntent = createIdleIntent(elenaId, COMMUTE_TIME_UTC, 'Resting quietly');
      const coordinator = new RuntimeTraversalCoordinator();

      const result = dispatchAgentIntent(state, idleIntent, { coordinator });

      assert.equal(result.success, true);
      assert.equal(result.code, 'idle-acknowledged');
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);
    });
  });

  // --------------------------------------------------------------------------
  // Group 3: M73/M74 Traversal Integration & In-Flight Immutability
  // --------------------------------------------------------------------------
  describe('3. M73/M74 Traversal Integration & In-Flight Immutability', () => {
    it('Condition 10-14: Multi-step physical traversal with in-flight location immutability and authoritative arrival', async () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const elena = state.agents.find((a) => a.id === elenaId)!;
      assert.equal(elena.locationId, residenceId);

      // Step 1: Decision
      const provider = new DeterministicAgentDecisionProvider();
      const context = deriveAgentContext(state, elenaId)!;
      const intent = provider.decideIntent(context) as MoveToPlaceIntent;
      assert.ok(intent);
      assert.equal(intent.intentType, 'move-to-place');
      assert.equal(intent.destinationPlaceId, restaurantId);

      // Verify zero mutation at decision step
      assert.equal(elena.locationId, residenceId);

      // Step 2: Presentation & Runtime setup
      const snapshot = projectWorldState(state, elenaId);
      const client = new Minimal3DClient({
        clientId: 'client:test-m75',
        observerAgentId: elenaId,
      });
      client.updateSnapshot(snapshot);

      const coordinator = new RuntimeTraversalCoordinator();
      const runtime = new PhysicalTraversalRuntime({
        client,
        speed: 10.0, // 10 units / sec
      });

      // Step 3: Dispatch intent
      const dispatchResult = dispatchAgentIntent(state, intent, { coordinator });
      assert.equal(dispatchResult.success, true);
      assert.equal(dispatchResult.code, 'traversal-started');
      assert.ok(dispatchResult.request);

      // Handoff to PhysicalTraversalRuntime
      const traversalPromise = runtime.requestTraversal(dispatchResult.request);

      // Step 4: Discrete stepping (In-Flight transit)
      // Step halfway (e.g. 500 ms)
      runtime.step(500);

      const inFlight = runtime.getActiveTraversal(elenaId);
      assert.ok(inFlight, 'Traversal must be in-flight');
      assert.ok(inFlight.progress > 0 && inFlight.progress < 1.0, `Progress should be in-flight (was ${inFlight.progress})`);

      // CRITICAL INVARIANT: World Core locationId MUST REMAIN strictly at origin
      assert.equal(
        elena.locationId,
        residenceId,
        'Agent.locationId in World Core MUST REMAIN at origin residence during in-flight traversal'
      );
      assert.ok(coordinator.hasActiveTraversal(elenaId));

      // Step 5: Advance time to completion
      // Provide remaining duration to reach physical destination
      runtime.step(5000);

      // Await runtime arrival result
      const navResult = await traversalPromise;
      assert.equal(navResult.status, 'arrived');
      assert.equal(navResult.destinationPlaceId, restaurantId);

      // Prior to completing traversal through M73, locationId is still at origin
      assert.equal(elena.locationId, residenceId);

      // Step 6: Complete traversal through coordinator
      const completeResult = coordinator.completeTraversal(state, navResult);

      assert.equal(completeResult.success, true);
      assert.equal(completeResult.code, 'success');
      assert.equal(completeResult.changed, true);
      assert.equal(completeResult.previousLocationId, residenceId);
      assert.equal(completeResult.currentLocationId, restaurantId);

      // Final Authoritative Location: Now updated to restaurant!
      assert.equal(
        elena.locationId,
        restaurantId,
        'Agent.locationId must be updated to restaurant ONLY after M73/M69 validated arrival'
      );
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);
    });

    it('Condition 14b: executeAgentIntentWithProvider orchestrates end-to-end traversal with mock provider', async () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const elena = state.agents.find((a) => a.id === elenaId)!;
      assert.equal(elena.locationId, residenceId);

      const intent = createMoveToPlaceIntent(elenaId, restaurantId, COMMUTE_TIME_UTC);
      const coordinator = new RuntimeTraversalCoordinator();
      const mockProvider = new DeterministicMockNavigationProvider({
        providerId: 'provider:mock-fast',
        defaultStatus: 'arrived',
      });

      const result = await executeAgentIntentWithProvider(state, intent, coordinator, mockProvider);

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.currentLocationId, restaurantId);
      assert.equal(elena.locationId, restaurantId);
    });
  });

  // --------------------------------------------------------------------------
  // Group 4: Pluggability & Future AI Compatibility
  // --------------------------------------------------------------------------
  describe('4. Pluggability & Future AI Compatibility', () => {
    it('Condition 15 & 16: A mock/stub provider satisfies AgentDecisionProvider without changing World Core', async () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const elena = state.agents.find((a) => a.id === elenaId)!;

      // Stub simulating a future LLM or cognitive engine provider
      class MockLlmDecisionProvider implements AgentDecisionProvider {
        readonly providerId = 'provider:mock-llm-decision';

        async decideIntent(context: AgentContext): Promise<AgentIntent | null> {
          // Simulates async evaluation / API inference
          await new Promise((r) => setTimeout(r, 5));

          // Proposes to go to the restaurant based on "prompt evaluation"
          return createMoveToPlaceIntent(
            context.agentId,
            restaurantId,
            context.civilTime.isoTime,
            'Prompt decided: Elena needs to inspect restaurant preparation'
          );
        }
      }

      const llmProvider = new MockLlmDecisionProvider();
      const coordinator = new RuntimeTraversalCoordinator();
      const mockNavProvider = new DeterministicMockNavigationProvider({
        defaultStatus: 'arrived',
      });

      // 1. LLM decision provider produces the standard AgentIntent
      const context = deriveAgentContext(state, elenaId)!;
      const intent = await llmProvider.decideIntent(context);
      assert.ok(intent);
      assert.equal(intent.intentType, 'move-to-place');
      assert.equal((intent as MoveToPlaceIntent).destinationPlaceId, restaurantId);

      // 2. Downstream world pipeline is completely identical
      const dispatchResult = dispatchAgentIntent(state, intent, { coordinator });
      assert.equal(dispatchResult.success, true);
      assert.equal(dispatchResult.code, 'traversal-started');

      // 3. Traversal completes normally through M73
      const navResult = await mockNavProvider.requestTraversal(dispatchResult.request!);
      const completeResult = coordinator.completeTraversal(state, navResult);

      assert.equal(completeResult.success, true);
      assert.equal(elena.locationId, restaurantId);
    });
  });

  // --------------------------------------------------------------------------
  // Group 5: Schema & Persistence Preservation
  // --------------------------------------------------------------------------
  describe('5. Schema & Persistence Preservation', () => {
    it('Condition 17 & 18: Schema version remains strictly 18 and state roundtrips cleanly', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
      assert.equal(state.version, 19);

      const provider = new DeterministicAgentDecisionProvider();
      const context = deriveAgentContext(state, elenaId)!;
      const intent = provider.decideIntent(context);
      assert.ok(intent);

      // Verify serialization roundtrip
      const serialized = JSON.stringify(state);
      const deserialized = JSON.parse(serialized);

      assert.equal(deserialized.version, 19);
      assert.equal(deserialized.agents.length, state.agents.length);
      assert.equal(deserialized.intents, undefined);
    });
  });
});
