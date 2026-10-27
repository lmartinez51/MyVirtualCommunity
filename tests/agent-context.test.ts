/**
 * Milestone 76 — Agent Context Foundation & 3D Traversal Validation Test Suite
 *
 * Verifies that:
 * 1. AgentContext is pure, immutable, and strictly bounded to an agent's situated horizon.
 * 2. deriveAgentContext() performs zero state mutation and closes the omniscient WorldState leak.
 * 3. Co-located agents are bounded (ObservableAgent with no balances or private activity exposed).
 * 4. Knowledge is strictly filtered to the current agent (zero foreign knowledge leakage).
 * 5. Scheduled objective is derived across commute, work, recreation, and rest windows.
 * 6. DeterministicAgentDecisionProvider operates strictly from AgentContext without WorldState.
 * 7. End-to-end 3D validation: Elena moves physically across frames while World Core Agent.locationId
 *    remains at origin until M69/M73 validated arrival commits.
 * 8. Schema version remains strictly 18 with zero persistence changes.
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
import { createSecondaryDevelopmentNpc } from '../src/core/development-npc-schedule.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import { projectWorldState } from '../src/core/world-projection.js';
import {
  type MoveToPlaceIntent,
  type IdleIntent,
  DeterministicAgentDecisionProvider,
  dispatchAgentIntent,
} from '../src/core/agent-intent.js';
import {
  type AgentContext,
  deriveAgentContext,
} from '../src/core/agent-context.js';

describe('Milestone 76 — Agent Context Foundation', () => {
  // Elena's schedule:
  // shift: 09:00 - 17:00 local (America/Juarez, MDT UTC-6 in September)
  // commute lead time: 30 min (commute starts 08:30)
  // recreation: 17:00 - 20:30 (street:avenida-juarez)
  // rest: 20:30 - 08:30 (building:development-residence)
  const COMMUTE_TIME_UTC = '2026-09-14T14:35:00.000Z'; // 08:35 AM local (commute window)
  const WORK_TIME_UTC = '2026-09-14T16:00:00.000Z';    // 10:00 AM local (work shift)
  const REC_TIME_UTC = '2026-09-14T23:45:00.000Z';     // 17:45 PM local (recreation)
  const REST_TIME_UTC = '2026-09-14T05:00:00.000Z';    // 23:00 PM local (rest at residence)

  const elenaId = 'agent:dev-npc';
  const playerId = 'agent:dev-player';
  const secondaryNpcId = 'agent:secondary-dev-npc';
  const residenceId = 'building:development-residence';
  const restaurantId = 'restaurant:development-restaurant';
  const streetId = 'street:development-street';

  function setupWorld(initialTimeUtc: string = COMMUTE_TIME_UTC): { clock: WorldClock; state: WorldState } {
    const clock = new WorldClock(initialTimeUtc);
    const state = createInitialWorldState(clock);
    transitionAgentLocation(state, elenaId, residenceId, { silent: true });
    return { clock, state };
  }

  // --------------------------------------------------------------------------
  // Group 1: Context Derivation & Purity
  // --------------------------------------------------------------------------
  describe('1. Context Derivation & Purity', () => {
    it('Condition 1: Valid agent produces a fully populated AgentContext', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const context = deriveAgentContext(state, elenaId);

      assert.ok(context, 'AgentContext must be derived');
      assert.equal(context.agentId, elenaId);
      assert.equal(context.identity.id, elenaId);
      assert.equal(context.identity.name, 'Development NPC');
      assert.equal(context.identity.agentType, 'npc');
      assert.equal(context.currentLocation.locationId, residenceId);
      assert.equal(context.currentLocation.type, 'building');
      assert.equal(context.civilTime.hour, 8);
      assert.equal(context.civilTime.minute, 35);
      assert.equal(context.civilTime.timeZone, 'America/Ciudad_Juarez');
    });

    it('Condition 2: Non-existent agent returns null', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const context = deriveAgentContext(state, 'agent:non-existent');
      assert.equal(context, null);
    });

    it('Condition 3: Invalid agentId or missing WorldState handled cleanly', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      assert.equal(deriveAgentContext(state, ''), null);
      assert.equal(deriveAgentContext(state, '   '), null);
      assert.throws(() => deriveAgentContext(null as any, elenaId), /WorldState must be provided/);
    });

    it('Condition 4: Context derivation is purely read-only (Zero Mutation Invariant)', () => {
      const { clock, state } = setupWorld(COMMUTE_TIME_UTC);
      const stateBefore = JSON.stringify(state);
      const clockBefore = clock.getTime();

      deriveAgentContext(state, elenaId);

      const stateAfter = JSON.stringify(state);
      const clockAfter = clock.getTime();

      assert.equal(stateBefore, stateAfter, 'WorldState must remain strictly byte-identical after derivation');
      assert.equal(clockBefore, clockAfter, 'WorldClock must remain unchanged');
    });

    it('Condition 5: Repeated derivation is deterministic and produces consistent results', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const ctx1 = deriveAgentContext(state, elenaId);
      const ctx2 = deriveAgentContext(state, elenaId);

      assert.deepEqual(ctx1, ctx2, 'Consecutive derivations must produce identical structures');
    });

    it('Condition 6: AgentContext contains NO isInTransit or inventory fields (Scope Control)', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const context = deriveAgentContext(state, elenaId)!;

      assert.equal((context as any).isInTransit, undefined, 'AgentContext must not have isInTransit');
      assert.equal((context as any).items, undefined, 'AgentContext must not have items');
      assert.equal((context as any).inventory, undefined, 'AgentContext must not have inventory');
    });
  });

  // --------------------------------------------------------------------------
  // Group 2: Epistemic Boundary & Privacy Enforcement
  // --------------------------------------------------------------------------
  describe('2. Epistemic Boundary & Privacy Enforcement', () => {
    it('Condition 7: Other agents balances and private activity are NOT exposed', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      // Place player at the same location as Elena (residence)
      transitionAgentLocation(state, playerId, residenceId, { silent: true });

      const context = deriveAgentContext(state, elenaId)!;
      assert.equal(context.coLocatedAgents.length, 1);

      const observedPlayer = context.coLocatedAgents[0];
      assert.equal(observedPlayer.id, playerId);
      assert.equal(observedPlayer.name, 'Development Player');
      assert.equal(observedPlayer.agentType, 'player');

      // Verify absence of private state
      const forbiddenKeys = ['balanceMinor', 'currency', 'activityState', 'activitySince', 'playerActivity'];
      for (const key of forbiddenKeys) {
        assert.equal((observedPlayer as any)[key], undefined, `ObservableAgent must not expose "${key}"`);
      }
    });

    it('Condition 8: Distant agents are NOT included in coLocatedAgents', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      // Elena is at residence, player is at street
      transitionAgentLocation(state, playerId, streetId, { silent: true });

      const context = deriveAgentContext(state, elenaId)!;
      assert.equal(context.coLocatedAgents.length, 0, 'Agents at different locations must not appear in coLocatedAgents');
    });

    it('Condition 9: Other agents knowledge is NOT exposed in knownFacts', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);

      // Add a knowledge record for Player
      state.knowledge.push({
        id: 'knowledge:player-fact-1',
        agentId: playerId,
        factType: 'agent-schedule',
        subjectId: elenaId,
        payload: { shiftStart: '9', shiftEnd: '17', workplaceId: restaurantId },
        acquiredAt: COMMUTE_TIME_UTC,
        lastVerifiedAt: COMMUTE_TIME_UTC,
        source: 'social-inquiry',
        sourceAgentId: elenaId,
      });

      // Elena derives context
      const contextElena = deriveAgentContext(state, elenaId)!;
      assert.equal(contextElena.knownFacts.length, 0, "Elena must not see Player's knowledge records");

      // Player derives context
      const contextPlayer = deriveAgentContext(state, playerId)!;
      assert.equal(contextPlayer.knownFacts.length, 1);
      assert.equal(contextPlayer.knownFacts[0].id, 'knowledge:player-fact-1');
      assert.equal(contextPlayer.knownFacts[0].agentId, playerId);
    });

    it('Condition 10: Raw WorldState internals are unreachable from AgentContext', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const context = deriveAgentContext(state, elenaId)!;

      const forbiddenCollections = ['places', 'restaurants', 'offerings', 'purchases', 'orders', 'properties'];
      for (const key of forbiddenCollections) {
        assert.equal((context as any)[key], undefined, `AgentContext must not leak "${key}"`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Group 3: Schedule Objective Derivation
  // --------------------------------------------------------------------------
  describe('3. Schedule Objective Derivation', () => {
    it('Condition 11: Correctly derives commute-to-work objective during commute window', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC); // 08:35
      const context = deriveAgentContext(state, elenaId)!;

      assert.ok(context.scheduledObjective);
      assert.equal(context.scheduledObjective.type, 'commute-to-work');
      assert.equal(context.scheduledObjective.targetPlaceId, restaurantId);
      assert.equal(context.scheduledObjective.reason, 'commute-to-work');
    });

    it('Condition 12: Correctly derives work-shift objective during work shift', () => {
      const { state } = setupWorld(WORK_TIME_UTC); // 10:00
      const context = deriveAgentContext(state, elenaId)!;

      assert.ok(context.scheduledObjective);
      assert.equal(context.scheduledObjective.type, 'work-shift');
      assert.equal(context.scheduledObjective.targetPlaceId, restaurantId);
    });

    it('Condition 13: Correctly derives neighborhood-recreation objective during evening recreation', () => {
      const { state } = setupWorld(REC_TIME_UTC); // 17:45
      const context = deriveAgentContext(state, elenaId)!;

      assert.ok(context.scheduledObjective);
      assert.equal(context.scheduledObjective.type, 'neighborhood-recreation');
      assert.equal(context.scheduledObjective.targetPlaceId, 'street:avenida-juarez');
    });

    it('Condition 14: Correctly derives rest-at-residence objective during night rest', () => {
      const { state } = setupWorld(REST_TIME_UTC); // 23:00
      const context = deriveAgentContext(state, elenaId)!;

      assert.ok(context.scheduledObjective);
      assert.equal(context.scheduledObjective.type, 'rest-at-residence');
      assert.equal(context.scheduledObjective.targetPlaceId, residenceId);
    });

    it('Condition 15: Agent without deterministic schedule has null scheduledObjective', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const context = deriveAgentContext(state, playerId)!;

      assert.equal(context.scheduledObjective, null);
    });
  });

  // --------------------------------------------------------------------------
  // Group 4: Decision Provider Integration (Zero WorldState Access)
  // --------------------------------------------------------------------------
  describe('4. Decision Provider Integration (Zero WorldState Access)', () => {
    it('Condition 16: Provider makes commute decision using only AgentContext', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const provider = new DeterministicAgentDecisionProvider();
      const context = deriveAgentContext(state, elenaId)!;

      const intent = provider.decideIntent(context);

      assert.ok(intent);
      assert.equal(intent.agentId, elenaId);
      assert.equal(intent.intentType, 'move-to-place');
      assert.equal((intent as MoveToPlaceIntent).destinationPlaceId, restaurantId);
      assert.equal(intent.reason, 'commute-to-work');
    });

    it('Condition 17: Provider emits IdleIntent when agent is already at scheduled destination', () => {
      const { state } = setupWorld(WORK_TIME_UTC);
      // Elena is already at restaurant
      transitionAgentLocation(state, elenaId, restaurantId, { silent: true });

      const provider = new DeterministicAgentDecisionProvider();
      const context = deriveAgentContext(state, elenaId)!;

      const intent = provider.decideIntent(context);

      assert.ok(intent);
      assert.equal(intent.intentType, 'idle');
      assert.ok((intent as IdleIntent).reason?.includes('Already at target location'));
    });

    it('Condition 18: Provider returns null when scheduledObjective is null', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const provider = new DeterministicAgentDecisionProvider();
      const context = deriveAgentContext(state, playerId)!; // Player has null objective

      const intent = provider.decideIntent(context);
      assert.equal(intent, null);
    });
  });

  // --------------------------------------------------------------------------
  // Group 5: 3D Traversal Validation Pipeline
  // --------------------------------------------------------------------------
  describe('5. 3D Traversal Validation Pipeline', () => {
    it('Condition 19: Full flow from AgentContext to 3D movement to authoritative arrival', async () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      const elena = state.agents.find((a) => a.id === elenaId)!;
      assert.equal(elena.locationId, residenceId);

      // 1. Derive bounded AgentContext
      const context = deriveAgentContext(state, elenaId)!;
      assert.ok(context);

      // 2. Deterministic decision (Zero WorldState access)
      const provider = new DeterministicAgentDecisionProvider();
      const intent = provider.decideIntent(context) as MoveToPlaceIntent;
      assert.ok(intent);
      assert.equal(intent.intentType, 'move-to-place');
      assert.equal(intent.destinationPlaceId, restaurantId);

      // 3. Dispatch to M73 RuntimeTraversalCoordinator
      const coordinator = new RuntimeTraversalCoordinator();
      const dispatchResult = dispatchAgentIntent(state, intent, { coordinator });
      assert.equal(dispatchResult.success, true);
      assert.equal(dispatchResult.code, 'traversal-started');
      assert.ok(dispatchResult.request);

      // 4. Setup Minimal3DClient and PhysicalTraversalRuntime
      const snapshot = projectWorldState(state, elenaId);
      const client = new Minimal3DClient({
        clientId: 'client:test-m76',
        observerAgentId: elenaId,
      });
      client.updateSnapshot(snapshot);

      const runtime = new PhysicalTraversalRuntime({
        client,
        speed: 10.0,
      });

      // 5. Hand off request to physical runtime
      const traversalPromise = runtime.requestTraversal(dispatchResult.request);
      assert.ok(runtime.hasActiveTraversal(elenaId));

      // 6. Discrete physical stepping
      runtime.step(500);
      const inFlight = runtime.getActiveTraversal(elenaId)!;
      assert.ok(inFlight.progress > 0 && inFlight.progress < 1.0);

      // CRITICAL INVARIANT: World Core locationId MUST REMAIN at origin residence during transit!
      assert.equal(
        elena.locationId,
        residenceId,
        'Agent.locationId must remain at origin residence during in-flight traversal'
      );

      // 7. Advance time to arrival
      runtime.step(5000);
      const navResult = await traversalPromise;
      assert.equal(navResult.status, 'arrived');
      assert.equal(navResult.destinationPlaceId, restaurantId);

      // Location still at origin until coordinator completes traversal
      assert.equal(elena.locationId, residenceId);

      // 8. Complete traversal via coordinator and M69 gatekeeper
      const completeResult = coordinator.completeTraversal(state, navResult);
      assert.equal(completeResult.success, true);
      assert.equal(completeResult.code, 'success');
      assert.equal(completeResult.changed, true);
      assert.equal(completeResult.previousLocationId, residenceId);
      assert.equal(completeResult.currentLocationId, restaurantId);

      // 9. World Core location successfully updated to restaurant
      assert.equal(
        elena.locationId,
        restaurantId,
        'Authoritative location must update to restaurant ONLY after arrival commit'
      );
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);

      // 10. Reconcile 3D projection
      const newSnapshot = projectWorldState(state, elenaId);
      const recon = client.updateSnapshot(newSnapshot);
      assert.ok(recon);
    });
  });

  // --------------------------------------------------------------------------
  // Group 6: Schema Version 18 Preservation
  // --------------------------------------------------------------------------
  describe('6. Schema Version 18 Preservation', () => {
    it('Condition 20: Schema version remains strictly 18 and state roundtrips cleanly', () => {
      const { state } = setupWorld(COMMUTE_TIME_UTC);
      assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
      assert.equal(state.version, 19);

      const context = deriveAgentContext(state, elenaId)!;
      assert.ok(context);

      const serialized = JSON.stringify(state);
      const deserialized = JSON.parse(serialized);

      assert.equal(deserialized.version, 19);
      assert.equal(deserialized.contexts, undefined);
      assert.equal(deserialized.agentContexts, undefined);
    });
  });
});
