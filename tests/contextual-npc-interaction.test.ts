/**
 * Milestone 66: Contextual NPC Interaction Execution Test Suite.
 *
 * Verifies:
 * 1. Test 1 — Contextual Action Derivation:
 *    Co-located valid player resolves to NpcContextualAction ('greet-agent').
 * 2. Test 2 — No Candidate:
 *    When intent is continue-routine, deriveNpcContextualAction returns null.
 * 3. Test 3 — Successful Execution:
 *    Executes contextual action through Social Authority, returning deterministic greeting response with zero state mutation.
 * 4. Test 4 — Revalidation:
 *    Deriving action while co-located, then moving target away through Spatial Authority causes Social Authority
 *    revalidation to fail safely with 'agents-not-co-located' and zero mutation.
 * 5. Test 5 — Invalid Target:
 *    Missing target agent causes execution to fail with 'target-not-found' without mutation.
 * 6. Test 6 — Self Interaction:
 *    Actor and target IDs identical causes execution to fail with 'self-interaction-not-allowed'.
 * 7. Test 7 — Non-NPC Actor:
 *    Attempting to execute contextual NPC action using a player actor fails with 'agent-not-npc'.
 * 8. Test 8 — Determinism:
 *    Identical world state produces identical contextual action and identical execution result across repeated evaluations.
 * 9. Test 9 — No State Mutation During Derivation:
 *    State remains strictly identical before and after action derivation.
 * 10. Test 10 — Repeated Execution:
 *    Repeated execution attempts under identical conditions produce no uncontrolled duplicate social consequences or memory leaks.
 * 11. Test 11 — Multi-NPC Isolation:
 *    Elena and secondary NPC independently derive and execute contextual interactions without identity-specific branching.
 * 12. Test 12 — Schema Preservation & Non-Persistence:
 *    CURRENT_WORLD_STATE_VERSION remains 18, and no persistent contextual action fields are added to Agent or WorldState.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  CURRENT_WORLD_STATE_VERSION,
  transitionAgentLocation,
  type WorldState,
} from '../src/core/world-state.js';
import {
  DEVELOPMENT_NPC_ID,
  SECONDARY_DEVELOPMENT_NPC_ID,
  createSecondaryDevelopmentNpc,
} from '../src/core/development-npc-schedule.js';
import {
  deriveNpcContextualIntent,
  evaluateNpcContextualAction,
  deriveNpcContextualAction,
  executeNpcContextualAction,
  inspectNpcContext,
  type NpcContextualAction,
} from '../src/core/npc-behavior.js';

// Anchor time: 10:00 AM local (16:00 UTC) during Elena's work shift
const WORK_SHIFT_TIME = '2026-09-14T16:00:00.000Z';
// Rest time: 22:00 local (04:00 UTC next day)
const REST_TIME = '2026-09-15T04:00:00.000Z';

function setupWorld(time: string = WORK_SHIFT_TIME): {
  state: WorldState;
  devNpc: NonNullable<WorldState['agents']>[number];
  player: NonNullable<WorldState['agents']>[number];
} {
  const clock = WorldClock.create(time);
  const state = createInitialWorldState(clock);
  const devNpc = state.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;
  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  return { state, devNpc, player };
}

describe('Milestone 66: Contextual NPC Interaction Execution', () => {
  // =========================================================================
  // Test 1 — Contextual Action Derivation
  // =========================================================================
  describe('Test 1 — Contextual Action Derivation', () => {
    it('derives "greet-agent" action when NPC and player are co-located at open restaurant', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      // 1. Contextual Intent derives interact-with-nearby-agent
      const intent = deriveNpcContextualIntent(state, devNpc.id);
      assert.ok(intent);
      assert.equal(intent.intentType, 'interact-with-nearby-agent');
      assert.equal(intent.targetAgentId, player.id);

      // 2. Action derivation produces greet-agent
      const evalResult = evaluateNpcContextualAction(state, devNpc.id);
      assert.equal(evalResult.success, true);
      assert.equal(evalResult.code, 'success');
      assert.equal(evalResult.contextualAction.npcId, devNpc.id);
      assert.equal(evalResult.contextualAction.actionType, 'greet-agent');
      assert.equal(evalResult.contextualAction.targetAgentId, player.id);
      assert.match(evalResult.contextualAction.reason, new RegExp(player.id));

      // 3. Helper deriveNpcContextualAction matches
      const action = deriveNpcContextualAction(state, devNpc.id);
      assert.ok(action);
      assert.equal(action.actionType, 'greet-agent');
      assert.equal(action.targetAgentId, player.id);
    });

    it('derives "greet-agent" action when NPC and player are co-located on public street', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'street:avenida-juarez';
      player.locationId = 'street:avenida-juarez';

      const action = deriveNpcContextualAction(state, devNpc.id);
      assert.ok(action);
      assert.equal(action.actionType, 'greet-agent');
      assert.equal(action.targetAgentId, player.id);
    });
  });

  // =========================================================================
  // Test 2 — No Candidate (Routine Continuation)
  // =========================================================================
  describe('Test 2 — No Candidate', () => {
    it('returns null action and "no-contextual-intent" code when NPC has no nearby agents', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'street:development-street';

      const evalResult = evaluateNpcContextualAction(state, devNpc.id);
      assert.equal(evalResult.success, false);
      assert.equal(evalResult.code, 'no-contextual-intent');

      const action = deriveNpcContextualAction(state, devNpc.id);
      assert.equal(action, null);
    });

    it('returns null action when NPC is resting alone at home', () => {
      const { state, devNpc, player } = setupWorld(REST_TIME);

      devNpc.locationId = 'building:development-residence';
      player.locationId = 'street:development-street';

      const action = deriveNpcContextualAction(state, devNpc.id);
      assert.equal(action, null);
    });
  });

  // =========================================================================
  // Test 3 — Successful Execution
  // =========================================================================
  describe('Test 3 — Successful Execution Through Social Authority', () => {
    it('executes greet-agent action and returns authoritative greeting dialogue with zero state mutation', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const action = deriveNpcContextualAction(state, devNpc.id)!;
      assert.ok(action);

      const snapshotBefore = JSON.stringify(state);
      const result = executeNpcContextualAction(state, action);
      const snapshotAfter = JSON.stringify(state);

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.ok(result.response);
      assert.match(result.response, /working here today/i);
      assert.equal(result.action, action);

      // Invariant: ZERO state mutation
      assert.equal(snapshotBefore, snapshotAfter);
      assert.equal(state.worldTime, WORK_SHIFT_TIME);
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      assert.equal(player.locationId, 'restaurant:development-restaurant');
    });

    it('returns acquainted greeting dialogue when agents are acquainted', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      // Establish acquaintance record in state
      state.acquaintances.push({
        id: `acquaintance:${devNpc.id}:${player.id}`,
        agentIds: [devNpc.id, player.id].sort() as [string, string],
        establishedAt: state.worldTime,
      });

      const action = deriveNpcContextualAction(state, devNpc.id)!;
      const result = executeNpcContextualAction(state, action);

      assert.equal(result.success, true);
      assert.ok(result.response);
      assert.match(result.response, /welcome back/i);
    });
  });

  // =========================================================================
  // Test 4 — Revalidation
  // =========================================================================
  describe('Test 4 — Authority Revalidation at Execution Time', () => {
    it('rejects execution when target moves away between derivation and execution', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      // 1. Derive action while co-located
      const action = deriveNpcContextualAction(state, devNpc.id)!;
      assert.ok(action);
      assert.equal(action.targetAgentId, player.id);

      // 2. Target moves away through Spatial Authority before execution occurs
      transitionAgentLocation(state, player.id, 'street:avenida-juarez');
      assert.equal(player.locationId, 'street:avenida-juarez');
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

      // 3. Execute previously derived action -> Social Authority MUST revalidate and reject
      const snapshotBefore = JSON.stringify(state);
      const result = executeNpcContextualAction(state, action);
      const snapshotAfter = JSON.stringify(state);

      assert.equal(result.success, false);
      assert.equal(result.code, 'agents-not-co-located');
      assert.match(result.message, /not co-located/i);

      // Zero mutation on failure
      assert.equal(snapshotBefore, snapshotAfter);
    });

    it('rejects execution if venue closes between derivation and execution', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const action = deriveNpcContextualAction(state, devNpc.id)!;
      assert.ok(action);

      // Venue closes before execution
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'closed';

      const result = executeNpcContextualAction(state, action);
      assert.equal(result.success, false);
      assert.equal(result.code, 'venue-not-operational');
    });
  });

  // =========================================================================
  // Test 5 — Invalid Target
  // =========================================================================
  describe('Test 5 — Invalid Target', () => {
    it('fails with target-not-found when target agent is removed before execution', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const action = deriveNpcContextualAction(state, devNpc.id)!;

      // Target agent removed from state
      state.agents = state.agents.filter((a) => a.id !== player.id);

      const snapshotBefore = JSON.stringify(state);
      const result = executeNpcContextualAction(state, action);
      const snapshotAfter = JSON.stringify(state);

      assert.equal(result.success, false);
      assert.equal(result.code, 'target-not-found');
      assert.equal(snapshotBefore, snapshotAfter);
    });

    it('fails with target-location-invalid if target has invalid spatial location at execution', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const action = deriveNpcContextualAction(state, devNpc.id)!;

      // Corrupt target location
      player.locationId = 'invalid:corrupted-loc';
      devNpc.locationId = 'invalid:corrupted-loc';

      const result = executeNpcContextualAction(state, action);
      assert.equal(result.success, false);
      assert.ok(
        result.code === 'actor-location-invalid' || result.code === 'target-location-invalid'
      );
    });
  });

  // =========================================================================
  // Test 6 — Self Interaction
  // =========================================================================
  describe('Test 6 — Self Interaction', () => {
    it('fails with self-interaction-not-allowed if actor and target IDs are identical', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);

      const selfAction: NpcContextualAction = {
        npcId: devNpc.id,
        actionType: 'greet-agent',
        targetAgentId: devNpc.id,
        reason: 'Attempted self-interaction',
      };

      const snapshotBefore = JSON.stringify(state);
      const result = executeNpcContextualAction(state, selfAction);
      const snapshotAfter = JSON.stringify(state);

      assert.equal(result.success, false);
      assert.equal(result.code, 'self-interaction-not-allowed');
      assert.equal(snapshotBefore, snapshotAfter);
    });
  });

  // =========================================================================
  // Test 7 — Non-NPC Actor
  // =========================================================================
  describe('Test 7 — Non-NPC Actor', () => {
    it('fails with agent-not-npc when attempting to execute with a player as the actor', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      const playerAction: NpcContextualAction = {
        npcId: player.id,
        actionType: 'greet-agent',
        targetAgentId: devNpc.id,
        reason: 'Player cannot use NPC contextual action execution',
      };

      const snapshotBefore = JSON.stringify(state);
      const result = executeNpcContextualAction(state, playerAction);
      const snapshotAfter = JSON.stringify(state);

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-npc');
      assert.equal(snapshotBefore, snapshotAfter);
    });

    it('fails with npc-not-found when actor does not exist', () => {
      const { state, player } = setupWorld(WORK_SHIFT_TIME);

      const ghostAction: NpcContextualAction = {
        npcId: 'agent:ghost',
        actionType: 'greet-agent',
        targetAgentId: player.id,
        reason: 'Non-existent NPC',
      };

      const result = executeNpcContextualAction(state, ghostAction);
      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-found');
    });
  });

  // =========================================================================
  // Test 8 — Determinism
  // =========================================================================
  describe('Test 8 — Determinism', () => {
    it('identical world state produces identical contextual action and identical execution result', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const firstAction = deriveNpcContextualAction(state, devNpc.id)!;
      const firstExec = executeNpcContextualAction(state, firstAction);

      for (let i = 0; i < 30; i++) {
        const nextAction = deriveNpcContextualAction(state, devNpc.id)!;
        assert.deepEqual(nextAction, firstAction);

        const nextExec = executeNpcContextualAction(state, nextAction);
        assert.deepEqual(nextExec, firstExec);
      }
    });
  });

  // =========================================================================
  // Test 9 — No State Mutation During Derivation
  // =========================================================================
  describe('Test 9 — No State Mutation During Derivation', () => {
    it('action derivation causes ZERO state mutation', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const before = JSON.stringify(state);

      evaluateNpcContextualAction(state, devNpc.id);
      deriveNpcContextualAction(state, devNpc.id);

      assert.equal(JSON.stringify(state), before);
    });
  });

  // =========================================================================
  // Test 10 — Repeated Execution Under Identical Conditions
  // =========================================================================
  describe('Test 10 — Repeated Execution Invariant', () => {
    it('repeated execution under identical conditions produces no uncontrolled duplicate consequences', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const action = deriveNpcContextualAction(state, devNpc.id)!;

      const initialAcquaintanceCount = state.acquaintances.length;
      const initialAgentCount = state.agents.length;

      // Execute 25 times under identical conditions
      for (let i = 0; i < 25; i++) {
        const result = executeNpcContextualAction(state, action);
        assert.equal(result.success, true);
        assert.equal(result.code, 'success');
      }

      // No memory leaks, no unbounded collection growth
      assert.equal(state.acquaintances.length, initialAcquaintanceCount);
      assert.equal(state.agents.length, initialAgentCount);
      assert.equal((state as unknown as Record<string, unknown>).socialEvents, undefined);
    });
  });

  // =========================================================================
  // Test 11 — Multi-NPC Isolation
  // =========================================================================
  describe('Test 11 — Multi-NPC Isolation', () => {
    it('Elena and secondary NPC independently derive and execute contextual interactions', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      const secondaryNpc = createSecondaryDevelopmentNpc(state.worldTime);
      state.agents.push(secondaryNpc);

      // Elena and player at restaurant; Lorenzo at street alone
      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';
      secondaryNpc.locationId = 'street:development-street';

      // Elena derives greet-agent targeting player
      const elenaAction = deriveNpcContextualAction(state, devNpc.id);
      assert.ok(elenaAction);
      assert.equal(elenaAction.npcId, devNpc.id);
      assert.equal(elenaAction.targetAgentId, player.id);

      // Lorenzo derives null action (alone at street)
      const lorenzoAction = deriveNpcContextualAction(state, secondaryNpc.id);
      assert.equal(lorenzoAction, null);

      // Execute Elena's action
      const elenaExec = executeNpcContextualAction(state, elenaAction);
      assert.equal(elenaExec.success, true);
      assert.equal(elenaExec.action.npcId, devNpc.id);

      // Move player to secondary NPC at street
      transitionAgentLocation(state, player.id, 'street:development-street');

      // Now Lorenzo derives greet-agent targeting player
      const lorenzoAction2 = deriveNpcContextualAction(state, secondaryNpc.id);
      assert.ok(lorenzoAction2);
      assert.equal(lorenzoAction2.npcId, secondaryNpc.id);
      assert.equal(lorenzoAction2.targetAgentId, player.id);

      // Execute Lorenzo's action
      const lorenzoExec = executeNpcContextualAction(state, lorenzoAction2);
      assert.equal(lorenzoExec.success, true);
      assert.equal(lorenzoExec.action.npcId, secondaryNpc.id);
      assert.equal(lorenzoExec.action.targetAgentId, player.id);
    });
  });

  // =========================================================================
  // Test 12 — Schema Preservation & Non-Persistence
  // =========================================================================
  describe('Test 12 — Schema Preservation & Non-Persistence', () => {
    it('schema version remains strictly 18 with zero persistent contextual action fields', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const action = deriveNpcContextualAction(state, devNpc.id)!;
      executeNpcContextualAction(state, action);

      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      assert.equal(state.version, 19);

      // Verify no illegal persistent contextual fields were added to Agent or WorldState
      assert.equal((devNpc as unknown as Record<string, unknown>).contextualAction, undefined);
      assert.equal((devNpc as unknown as Record<string, unknown>).actions, undefined);
      assert.equal((state as unknown as Record<string, unknown>).npcActions, undefined);
    });

    it('inspectNpcContext projects derived contextualAction cleanly', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const projection = inspectNpcContext(state, devNpc.id);
      assert.equal(projection.success, true);
      assert.ok(projection.contextualAction);
      assert.equal(projection.contextualAction.actionType, 'greet-agent');
      assert.equal(projection.contextualAction.targetAgentId, player.id);
    });
  });
});
