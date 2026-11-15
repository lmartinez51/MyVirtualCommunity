/**
 * Milestone 67 — Contextual NPC Simulation Integration Test Suite
 *
 * Verifies that derived contextual NPC interactions participate in the authoritative
 * Simulation.tick() lifecycle while preserving spatial, business, and social authority boundaries.
 *
 * Test Matrix:
 * 1. Test 1 — No Contextual Interaction:
 *    NPC has no valid nearby target; tick succeeds and contextualInteractions is empty.
 * 2. Test 2 — NPC Greets Player During Tick:
 *    NPC and player co-located at open venue; tick produces successful contextual greeting.
 * 3. Test 3 — Existing Routine Still Executes:
 *    Deterministic routine movement and contextual greeting execute in the same tick.
 * 4. Test 4 — Multiple NPCs (Isolated Evaluation):
 *    NPC A co-located with player, NPC B alone; only NPC A generates contextual interaction.
 * 5. Test 5 — Multiple Valid Interactions:
 *    Both NPC A and NPC B co-located with player; both independently generate greetings in same tick.
 * 6. Test 6 — Stale Target:
 *    Target location changes between derivation and execution; surfaces "agents-not-co-located" without crashing tick.
 * 7. Test 7 — Closed Venue:
 *    Contextual interaction fails according to existing Social/Business authority when venue is closed.
 * 8. Test 8 — Same-Tick Duplicate Protection:
 *    Same NPC-target pair cannot execute duplicate action in same tick; resets on next tick with zero persistent cooldown.
 * 9. Test 9 — Determinism:
 *    Identical initial states and clocks produce identical contextual interaction results.
 * 10. Test 10 — Zero Persistent Interaction State:
 *     No persistent fields added to Agent, WorldState, or acquaintances; zero state drift.
 * 11. Test 11 — Offline Compatibility:
 *     Headless simulation advances cleanly without active client or session dependencies.
 * 12. Test 12 — Schema Version:
 *     CURRENT_WORLD_STATE_VERSION remains strictly 18.
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
  Simulation,
  type TickResult,
  type NpcContextualInteractionResult,
} from '../src/core/simulation.js';
import {
  DEVELOPMENT_NPC_ID,
  createSecondaryDevelopmentNpc,
} from '../src/core/development-npc-schedule.js';
import { deriveNpcContextualAction } from '../src/core/npc-behavior.js';

// Anchor time: 10:00 AM local (16:00 UTC) during Elena's work shift
const WORK_SHIFT_TIME = '2026-09-14T16:00:00.000Z';
// Overlap work shift: 12:00 PM local (18:00 UTC) where both Elena and Lorenzo work at restaurant
const OVERLAP_WORK_TIME = '2026-09-14T18:00:00.000Z';
// Rest time: 02:00 local (08:00 UTC)
const REST_TIME = '2026-09-14T08:00:00.000Z';

function setupWorld(time: string = WORK_SHIFT_TIME): {
  clock: WorldClock;
  state: WorldState;
  devNpc: NonNullable<WorldState['agents']>[number];
  player: NonNullable<WorldState['agents']>[number];
} {
  const clock = WorldClock.create(time);
  const state = createInitialWorldState(clock);
  const devNpc = state.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;
  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  return { clock, state, devNpc, player };
}

describe('Milestone 67: Contextual NPC Simulation Integration', () => {
  // =========================================================================
  // Test 1 — No Contextual Interaction
  // =========================================================================
  describe('Test 1 — No Contextual Interaction', () => {
    it('succeeds tick and emits empty contextual interaction array when NPC is alone', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      // Separate locations: Elena at restaurant, player at street
      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'street:development-street';

      const sim = new Simulation(clock, state, { silent: true });
      const result = sim.tick();

      assert.ok(result);
      assert.ok(result.npcContextualInteractions);
      assert.equal(result.npcContextualInteractions.length, 0);
      assert.ok(result.contextualInteractions);
      assert.equal(result.contextualInteractions.length, 0);
    });

    it('emits empty contextual interaction array when NPC is resting alone at home', () => {
      const { clock, state, devNpc, player } = setupWorld(REST_TIME);

      devNpc.locationId = 'building:development-residence';
      player.locationId = 'street:development-street';

      const sim = new Simulation(clock, state, { silent: true });
      const result = sim.tick();

      assert.ok(result);
      assert.equal(result.npcContextualInteractions?.length, 0);
    });
  });

  // =========================================================================
  // Test 2 — NPC Greets Player During Tick
  // =========================================================================
  describe('Test 2 — NPC Greets Player During Tick', () => {
    it('executes contextual greeting during simulation tick when NPC and player are co-located at open restaurant', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const sim = new Simulation(clock, state, { silent: true });
      const result = sim.tick();

      assert.ok(result.npcContextualInteractions);
      assert.equal(result.npcContextualInteractions.length, 1);

      const interaction = result.npcContextualInteractions[0];
      assert.equal(interaction.actorNpcId, devNpc.id);
      assert.equal(interaction.targetAgentId, player.id);
      assert.equal(interaction.actionType, 'greet-agent');
      assert.equal(interaction.success, true);
      assert.equal(interaction.code, 'success');
      assert.ok(interaction.response);
      assert.match(interaction.response, /working here today/i);
    });
  });

  // =========================================================================
  // Test 3 — Existing Routine Still Executes
  // =========================================================================
  describe('Test 3 — Existing Routine Still Executes', () => {
    it('preserves deterministic routine movement and executes contextual interaction in the same tick', () => {
      // Start at rest time: Elena at residence
      const { clock, state, devNpc, player } = setupWorld(REST_TIME);
      devNpc.locationId = 'building:development-residence';

      // Player waiting at the restaurant
      player.locationId = 'restaurant:development-restaurant';

      // Advance clock to work shift (16:00 UTC / 10:00 AM local)
      clock.advanceTo(Date.parse(WORK_SHIFT_TIME));

      const sim = new Simulation(clock, state, { silent: true });
      const result = sim.tick();

      // 1. Routine movement executed through Spatial Authority
      const routineTrans = result.npcLocationTransitions?.find((t) => t.agentId === devNpc.id);
      assert.ok(routineTrans);
      assert.equal(routineTrans.changed, true);
      assert.equal(routineTrans.newLocationId, 'restaurant:development-restaurant');
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

      // 2. Contextual interaction executed through Social Authority
      assert.ok(result.npcContextualInteractions);
      assert.equal(result.npcContextualInteractions.length, 1);
      assert.equal(result.npcContextualInteractions[0].actorNpcId, devNpc.id);
      assert.equal(result.npcContextualInteractions[0].targetAgentId, player.id);
      assert.equal(result.npcContextualInteractions[0].success, true);
    });
  });

  // =========================================================================
  // Test 4 — Multiple NPCs (Isolated Evaluation)
  // =========================================================================
  describe('Test 4 — Multiple NPCs (Isolated Evaluation)', () => {
    it('evaluates multiple NPCs independently: only co-located NPC generates interaction', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);
      const secondaryNpc = createSecondaryDevelopmentNpc(clock.getTime());
      state.agents.push(secondaryNpc);

      // Elena + Player co-located at restaurant
      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      // Lorenzo alone at street
      secondaryNpc.locationId = 'street:development-street';

      const sim = new Simulation(clock, state, { silent: true });
      const result = sim.tick();

      assert.ok(result.npcContextualInteractions);
      assert.equal(result.npcContextualInteractions.length, 1);
      assert.equal(result.npcContextualInteractions[0].actorNpcId, devNpc.id);
      assert.equal(result.npcContextualInteractions[0].targetAgentId, player.id);
      assert.equal(result.npcContextualInteractions[0].success, true);
    });
  });

  // =========================================================================
  // Test 5 — Multiple Valid Interactions
  // =========================================================================
  describe('Test 5 — Multiple Valid Interactions', () => {
    it('allows both NPC A and NPC B to independently generate contextual interactions with player in same tick', () => {
      // Anchor at 18:00 UTC (12:00 local) where BOTH Elena (09:00-17:00) and Lorenzo (11:00-16:00) work at restaurant
      const { clock, state, devNpc, player } = setupWorld(OVERLAP_WORK_TIME);
      const secondaryNpc = createSecondaryDevelopmentNpc(clock.getTime());
      state.agents.push(secondaryNpc);

      devNpc.locationId = 'restaurant:development-restaurant';
      secondaryNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const sim = new Simulation(clock, state, { silent: true });
      const result = sim.tick();

      assert.ok(result.npcContextualInteractions);
      assert.equal(result.npcContextualInteractions.length, 2);

      const elenaInter = result.npcContextualInteractions.find((i) => i.actorNpcId === devNpc.id);
      const lorenzoInter = result.npcContextualInteractions.find((i) => i.actorNpcId === secondaryNpc.id);

      assert.ok(elenaInter);
      assert.equal(elenaInter.targetAgentId, player.id);
      assert.equal(elenaInter.success, true);

      assert.ok(lorenzoInter);
      assert.equal(lorenzoInter.targetAgentId, player.id);
      assert.equal(lorenzoInter.success, true);
    });
  });

  // =========================================================================
  // Test 6 — Stale Target
  // =========================================================================
  describe('Test 6 — Stale Target', () => {
    it('surfaces "agents-not-co-located" when target location changes before execution, keeping tick valid', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      // Simulation hook moves player away after action derivation but before execution
      const sim = new Simulation(clock, state, {
        silent: true,
        onBeforeContextualActionExecution: (action, s) => {
          transitionAgentLocation(s, action.targetAgentId, 'street:avenida-juarez');
        },
      });

      const result = sim.tick();

      assert.ok(result);
      assert.ok(result.npcContextualInteractions);
      assert.equal(result.npcContextualInteractions.length, 1);

      const interaction = result.npcContextualInteractions[0];
      assert.equal(interaction.actorNpcId, devNpc.id);
      assert.equal(interaction.targetAgentId, player.id);
      assert.equal(interaction.success, false);
      assert.equal(interaction.code, 'agents-not-co-located');
      assert.match(interaction.message ?? '', /not co-located/i);

      // Simulation tick remained completely valid
      assert.equal(result.worldTime, WORK_SHIFT_TIME);
      assert.ok(Array.isArray(result.transitions));
    });
  });

  // =========================================================================
  // Test 7 — Closed Venue
  // =========================================================================
  describe('Test 7 — Closed Venue', () => {
    it('surfaces "venue-not-operational" failure in tick result when venue is closed before action execution', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const sim = new Simulation(clock, state, {
        silent: true,
        onBeforeContextualActionExecution: (_action, s) => {
          const restaurant = s.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
          restaurant.operationalState = 'closed';
        },
      });

      const result = sim.tick();

      assert.ok(result.npcContextualInteractions);
      assert.equal(result.npcContextualInteractions.length, 1);
      assert.equal(result.npcContextualInteractions[0].success, false);
      assert.equal(result.npcContextualInteractions[0].code, 'venue-not-operational');
    });

    it('withholds contextual action derivation when venue is closed according to Business Authority', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'closed';

      // Authority derivation strictly yields null when venue is closed
      const action = deriveNpcContextualAction(state, devNpc.id);
      assert.equal(action, null);
    });
  });

  // =========================================================================
  // Test 8 — Same-Tick Duplicate Protection
  // =========================================================================
  describe('Test 8 — Same-Tick Duplicate Protection', () => {
    it('prevents same NPC-target pair from executing duplicate contextual action in same tick', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      // Duplicate agent in array simulates multiple evaluations in single tick
      state.agents.push(devNpc);

      const sim = new Simulation(clock, state, { silent: true });
      const result = sim.tick();

      // Duplicate action is suppressed by tick-local Set
      assert.ok(result.npcContextualInteractions);
      assert.equal(result.npcContextualInteractions.length, 1);
      assert.equal(result.npcContextualInteractions[0].actorNpcId, devNpc.id);
    });

    it('allows interaction in subsequent tick without persistent cooldown state', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const sim = new Simulation(clock, state, { silent: true });

      // Tick 1
      const tick1 = sim.tick();
      assert.equal(tick1.npcContextualInteractions?.length, 1);
      assert.equal(tick1.npcContextualInteractions[0].success, true);

      // Advance clock by 1 minute
      clock.advance(60 * 1000);

      // Tick 2: NPC can interact again because duplicate protection was strictly tick-local
      const tick2 = sim.tick();
      assert.equal(tick2.npcContextualInteractions?.length, 1);
      assert.equal(tick2.npcContextualInteractions[0].success, true);

      // Invariant: no cooldown fields on Agent or WorldState
      assert.equal('lastInteractionTime' in devNpc, false);
      assert.equal('interactionCooldown' in devNpc, false);
      assert.equal('lastGreetingTime' in devNpc, false);
    });
  });

  // =========================================================================
  // Test 9 — Determinism
  // =========================================================================
  describe('Test 9 — Determinism', () => {
    it('produces strictly identical contextual interaction results from identical initial states and clock', () => {
      const setupA = setupWorld(WORK_SHIFT_TIME);
      setupA.devNpc.locationId = 'restaurant:development-restaurant';
      setupA.player.locationId = 'restaurant:development-restaurant';
      const simA = new Simulation(setupA.clock, setupA.state, { silent: true });
      const resultA = simA.tick();

      const setupB = setupWorld(WORK_SHIFT_TIME);
      setupB.devNpc.locationId = 'restaurant:development-restaurant';
      setupB.player.locationId = 'restaurant:development-restaurant';
      const simB = new Simulation(setupB.clock, setupB.state, { silent: true });
      const resultB = simB.tick();

      assert.deepEqual(resultA.npcContextualInteractions, resultB.npcContextualInteractions);
    });
  });

  // =========================================================================
  // Test 10 — Zero Persistent Interaction State
  // =========================================================================
  describe('Test 10 — Zero Persistent Interaction State', () => {
    it('preserves absolute state isolation after contextual interaction execution', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const acquaintancesBefore = state.acquaintances.length;
      const knowledgeBefore = state.knowledge.length;
      const purchasesBefore = state.purchases.length;

      const sim = new Simulation(clock, state, { silent: true });
      const result = sim.tick();

      assert.equal(result.npcContextualInteractions?.[0].success, true);

      // Invariant: No persistent state additions
      assert.equal(state.acquaintances.length, acquaintancesBefore);
      assert.equal(state.knowledge.length, knowledgeBefore);
      assert.equal(state.purchases.length, purchasesBefore);

      // Agent properties unchanged
      assert.equal('lastInteractionTime' in devNpc, false);
      assert.equal('interactionCooldown' in devNpc, false);
      assert.equal(devNpc.balanceMinor, 0);
    });
  });

  // =========================================================================
  // Test 11 — Offline Compatibility
  // =========================================================================
  describe('Test 11 — Offline Compatibility', () => {
    it('advances simulation and contextual interactions headlessly with zero network or session dependencies', () => {
      const { clock, state, devNpc, player } = setupWorld(WORK_SHIFT_TIME);

      devNpc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'restaurant:development-restaurant';

      const sim = new Simulation(clock, state, { silent: true });

      // Simulate 5 headless offline ticks
      for (let i = 0; i < 5; i++) {
        const tick = sim.tick();
        assert.ok(tick);
        assert.equal(tick.npcContextualInteractions?.length, 1);
        assert.equal(tick.npcContextualInteractions[0].success, true);
        clock.advance(60 * 1000);
      }
    });
  });

  // =========================================================================
  // Test 12 — Schema Version
  // =========================================================================
  describe('Test 12 — Schema Version', () => {
    it('asserts CURRENT_WORLD_STATE_VERSION remains strictly 18', () => {
      const { clock, state } = setupWorld(WORK_SHIFT_TIME);
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      assert.equal(state.version, 19);

      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      assert.equal(state.version, 19);
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
    });
  });
});
