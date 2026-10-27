/**
 * Milestone 65: Contextual NPC Behavior Foundation Test Suite.
 *
 * Verifies:
 * 1. Test 1 — No contextual condition: NPC alone continues routine.
 * 2. Test 2 — Relevant nearby agent: NPC and valid agent co-located derives interact-with-nearby-agent.
 * 3. Test 3 — Invalid target & domain constraints:
 *    - Unrecognized agentType falls back to continue-routine.
 *    - Invalid/corrupted agent location falls back to continue-routine.
 *    - Closed restaurant domain constraint falls back to continue-routine.
 *    - Self-exclusion: NPC does not interact with itself.
 * 4. Test 4 — Authority boundary & zero state mutation:
 *    Contextual evaluation does NOT mutate location, money, activityState, relationships, or worldTime.
 * 5. Test 5 — Determinism:
 *    Identical WorldState produces identical contextual intent; multi-agent selection is strictly deterministic.
 * 6. Test 6 — Offline compatibility:
 *    Large clock advance causes zero accumulated contextual state.
 * 7. Test 7 — Preconditions & Error handling:
 *    npc-not-found, agent-not-npc, no-schedule-defined, invalid world state.
 * 8. Test 8 — Context inspection projection integration:
 *    inspectNpcContext() projects contextualIntent cleanly.
 * 9. Test 9 — Multi-NPC schedule generalization:
 *    Applies seamlessly to both Elena (dev-npc) and Lorenzo (secondary-dev-npc).
 * 10. Test 10 — Schema Preservation:
 *    Schema version remains strictly 18 with zero persistent intent fields in WorldState.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  CURRENT_WORLD_STATE_VERSION,
  type WorldState,
} from '../src/core/world-state.js';
import {
  DEVELOPMENT_NPC_ID,
  SECONDARY_DEVELOPMENT_NPC_ID,
  createSecondaryDevelopmentNpc,
} from '../src/core/development-npc-schedule.js';
import {
  evaluateNpcContextualIntent,
  deriveNpcContextualIntent,
  inspectNpcContext,
  type NpcContextualIntent,
} from '../src/core/npc-behavior.js';

// Test temporal anchor: 10:00 AM local (16:00 UTC) during Elena's work shift
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

describe('Milestone 65: Contextual NPC Behavior Foundation', () => {
  // =========================================================================
  // Test 1 — No Contextual Condition
  // =========================================================================
  describe('Test 1 — No Contextual Condition (Routine Fallback)', () => {
    it('derives continue-routine when NPC has no co-located agents', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      // Elena is at the restaurant; player is at street
      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'street:development-street';

      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.contextualIntent.npcId, devNpc.id);
      assert.equal(result.contextualIntent.intentType, 'continue-routine');
      assert.equal(result.contextualIntent.targetAgentId, undefined);
      assert.match(result.contextualIntent.reason, /continuing routine/i);

      // derive helper also matches
      const derived = deriveNpcContextualIntent(state, devNpc.id);
      assert.ok(derived);
      assert.equal(derived.intentType, 'continue-routine');
    });

    it('derives continue-routine when NPC is resting at home alone', () => {
      const { state, devNpc, player } = setupWorld(REST_TIME);

      devNpc.locationId = 'building:development-residence';
      player.locationId = 'street:development-street';

      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.contextualIntent.intentType, 'continue-routine');
    });
  });

  // =========================================================================
  // Test 2 — Relevant Nearby Agent
  // =========================================================================
  describe('Test 2 — Relevant Nearby Agent', () => {
    it('derives interact-with-nearby-agent when NPC and valid player are co-located at open restaurant', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.contextualIntent.npcId, devNpc.id);
      assert.equal(result.contextualIntent.intentType, 'interact-with-nearby-agent');
      assert.equal(result.contextualIntent.targetAgentId, player.id);
      assert.match(result.contextualIntent.reason, new RegExp(player.id));
    });

    it('derives interact-with-nearby-agent when NPC and player are co-located on public street', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'street:avenida-juarez';
      player.locationId = 'street:avenida-juarez';

      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.contextualIntent.intentType, 'interact-with-nearby-agent');
      assert.equal(result.contextualIntent.targetAgentId, player.id);
    });
  });

  // =========================================================================
  // Test 3 — Invalid Target & Domain Constraints
  // =========================================================================
  describe('Test 3 — Invalid Target & Domain Constraints', () => {
    it('falls back to continue-routine if nearby agent has invalid/unrecognized agentType', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'street:development-street';
      // Corrupt player agentType
      (player as unknown as { agentType: string }).agentType = 'corrupted-entity';
      player.locationId = 'street:development-street';

      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.contextualIntent.intentType, 'continue-routine');
      assert.equal(result.contextualIntent.targetAgentId, undefined);
    });

    it('falls back to continue-routine if nearby agent has invalid spatial location', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'street:development-street';
      player.locationId = 'invalid:nonexistent-place';

      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.contextualIntent.intentType, 'continue-routine');
    });

    it('falls back to continue-routine if NPC itself has an invalid spatial location', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'invalid:corrupted-loc';
      player.locationId = 'invalid:corrupted-loc';

      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.contextualIntent.intentType, 'continue-routine');
      assert.match(result.contextualIntent.reason, /invalid spatial location/i);
    });

    it('falls back to continue-routine if restaurant is closed under business domain authority', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      // Both agents at development restaurant
      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      // Set restaurant to closed
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'closed';

      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.contextualIntent.intentType, 'continue-routine');
      assert.equal(result.contextualIntent.targetAgentId, undefined);
      assert.match(result.contextualIntent.reason, /closed/i);
    });

    it('strictly excludes the NPC itself from being considered as a target', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      // Move player elsewhere so NPC is the only agent at the location
      player.locationId = 'street:development-street';
      devNpc.locationId = 'restaurant:development-restaurant';

      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.notEqual(result.contextualIntent.targetAgentId, devNpc.id);
      assert.equal(result.contextualIntent.intentType, 'continue-routine');
    });
  });

  // =========================================================================
  // Test 4 — Authority Boundary & Zero State Mutation
  // =========================================================================
  describe('Test 4 — Authority Boundary & Zero State Mutation', () => {
    it('evaluating contextual intent causes zero mutation to WorldState', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const snapshot = JSON.stringify(state);

      evaluateNpcContextualIntent(state, devNpc.id);
      deriveNpcContextualIntent(state, devNpc.id);

      assert.equal(JSON.stringify(state), snapshot);
    });

    it('does NOT alter agent locations, balances, activityState, relationships, or worldTime', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const initialLoc = devNpc.locationId;
      const initialBalance = devNpc.balances ? { ...devNpc.balances } : undefined;
      const initialActivity = devNpc.activityState;
      const initialTime = state.worldTime;
      const initialAcquaintanceCount = state.acquaintances.length;

      evaluateNpcContextualIntent(state, devNpc.id);

      assert.equal(devNpc.locationId, initialLoc);
      assert.deepEqual(devNpc.balances, initialBalance);
      assert.equal(devNpc.activityState, initialActivity);
      assert.equal(state.worldTime, initialTime);
      assert.equal(state.acquaintances.length, initialAcquaintanceCount);
    });
  });

  // =========================================================================
  // Test 5 — Determinism
  // =========================================================================
  describe('Test 5 — Determinism', () => {
    it('identical WorldState produces identical contextual intent over multiple evaluations', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const first = evaluateNpcContextualIntent(state, devNpc.id);

      for (let i = 0; i < 50; i++) {
        const next = evaluateNpcContextualIntent(state, devNpc.id);
        assert.deepEqual(next, first);
      }
    });

    it('multi-candidate selection deterministically prioritizes players over NPCs and breaks ties by ID', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      // Add secondary NPC at the same location
      const secondaryNpc = createSecondaryDevelopmentNpc(state.worldTime);
      secondaryNpc.locationId = 'restaurant:development-restaurant';
      state.agents.push(secondaryNpc);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      // Player should be prioritized over secondary NPC
      const result = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.contextualIntent.targetAgentId, player.id);

      // If player moves away, secondary NPC should be chosen
      player.locationId = 'street:development-street';
      const result2 = evaluateNpcContextualIntent(state, devNpc.id);
      assert.equal(result2.success, true);
      assert.equal(result2.contextualIntent.targetAgentId, secondaryNpc.id);
    });
  });

  // =========================================================================
  // Test 6 — Offline Compatibility
  // =========================================================================
  describe('Test 6 — Offline Compatibility', () => {
    it('a large clock advance generates zero accumulated contextual state', () => {
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const state = createInitialWorldState(clock);
      const devNpc = state.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;

      // 48-hour offline leap
      clock.advance(48 * 3600_000);
      state.worldTime = clock.getTime();

      const snapshotBefore = JSON.stringify(state);
      const result = evaluateNpcContextualIntent(state, devNpc.id);
      const snapshotAfter = JSON.stringify(state);

      assert.equal(result.success, true);
      assert.equal(snapshotBefore, snapshotAfter);
      // No accumulated intents or queues in state
      assert.equal((state as unknown as Record<string, unknown>).npcIntents, undefined);
    });
  });

  // =========================================================================
  // Test 7 — Preconditions & Error Handling
  // =========================================================================
  describe('Test 7 — Preconditions & Error Handling', () => {
    it('fails with npc-not-found when agent does not exist', () => {
      const { state } = setupWorld(WORK_SHIFT_TIME);
      const result = evaluateNpcContextualIntent(state, 'agent:nonexistent');
      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-found');
    });

    it('fails with agent-not-npc when player id is provided', () => {
      const { state, player } = setupWorld(WORK_SHIFT_TIME);
      const result = evaluateNpcContextualIntent(state, player.id);
      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-npc');
    });

    it('fails with no-schedule-defined when NPC has no schedule fixture', () => {
      const { state } = setupWorld(WORK_SHIFT_TIME);
      state.agents.push({
        id: 'agent:unscheduled-npc',
        name: 'Unscheduled NPC',
        agentType: 'npc',
        locationId: 'street:development-street',
        activityState: 'idle',
        activitySince: state.worldTime,
        balances: { USD: 0 },
      });

      const result = evaluateNpcContextualIntent(state, 'agent:unscheduled-npc');
      assert.equal(result.success, false);
      assert.equal(result.code, 'no-schedule-defined');
    });

    it('throws Error if WorldState is null or undefined', () => {
      assert.throws(() => {
        evaluateNpcContextualIntent(null as unknown as WorldState, DEVELOPMENT_NPC_ID);
      }, /WorldState must be provided/);
    });
  });

  // =========================================================================
  // Test 8 — Context Inspection Integration
  // =========================================================================
  describe('Test 8 — Context Inspection Integration', () => {
    it('inspectNpcContext includes contextualIntent matching deriveNpcContextualIntent', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const context = inspectNpcContext(state, devNpc.id);
      assert.equal(context.success, true);
      assert.ok(context.contextualIntent);
      assert.equal(context.contextualIntent.intentType, 'interact-with-nearby-agent');
      assert.equal(context.contextualIntent.targetAgentId, player.id);

      const direct = deriveNpcContextualIntent(state, devNpc.id);
      assert.deepEqual(context.contextualIntent, direct);
    });
  });

  // =========================================================================
  // Test 9 — Multi-NPC Schedule Generalization
  // =========================================================================
  describe('Test 9 — Multi-NPC Schedule Generalization', () => {
    it('derives contextual intent independently for both Elena and Lorenzo', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      const secondaryNpc = createSecondaryDevelopmentNpc(state.worldTime);
      state.agents.push(secondaryNpc);

      // Elena and player at restaurant; Lorenzo at residence alone
      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';
      secondaryNpc.locationId = 'building:development-residence';

      const elenaIntent = deriveNpcContextualIntent(state, devNpc.id);
      assert.ok(elenaIntent);
      assert.equal(elenaIntent.intentType, 'interact-with-nearby-agent');
      assert.equal(elenaIntent.targetAgentId, player.id);

      const lorenzoIntent = deriveNpcContextualIntent(state, secondaryNpc.id);
      assert.ok(lorenzoIntent);
      assert.equal(lorenzoIntent.intentType, 'continue-routine');
    });
  });

  // =========================================================================
  // Test 10 — Schema Preservation
  // =========================================================================
  describe('Test 10 — Schema Preservation & Non-Persistence', () => {
    it('schema version remains strictly 18 and no contextual fields are added to Agent or WorldState', () => {
      const { state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      evaluateNpcContextualIntent(state, devNpc.id);

      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      assert.equal(state.version, 19);

      // Verify no illegal persistent contextual fields were added to devNpc or state
      assert.equal((devNpc as unknown as Record<string, unknown>).contextualIntent, undefined);
      assert.equal((devNpc as unknown as Record<string, unknown>).intent, undefined);
      assert.equal((state as unknown as Record<string, unknown>).npcContextualIntents, undefined);
    });
  });
});
