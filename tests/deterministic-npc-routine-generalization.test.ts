import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  CURRENT_WORLD_STATE_VERSION,
  type Agent,
} from '../src/core/world-state.js';
import {
  findNpcSchedule,
  hasNpcRoutineSchedule,
  createSecondaryDevelopmentNpc,
  DEVELOPMENT_NPC_ID,
  SECONDARY_DEVELOPMENT_NPC_ID,
  DEVELOPMENT_NPC_SCHEDULE,
  SECONDARY_DEVELOPMENT_NPC_SCHEDULE,
} from '../src/core/development-npc-schedule.js';
import {
  evaluateNpcBehavioralState,
  deriveNpcBehavioralState,
  evaluateNpcRoutineAction,
  deriveNpcRoutineAction,
  executeNpcRoutineAction,
  inspectNpcContext,
} from '../src/core/npc-behavior.js';

describe('Milestone 64: Deterministic NPC Routine Generalization', () => {
  // UTC timestamps matching Ciudad Juárez civil time (UTC-6 in September):
  // 08:00 local (14:00 UTC): Elena resting at home, Secondary resting at home
  const TIME_08_00 = '2026-09-14T14:00:00.000Z';
  // 08:45 local (14:45 UTC): Elena commuting (08:30-09:00), Secondary promenading (08:30-10:30)
  const TIME_08_45 = '2026-09-14T14:45:00.000Z';
  // 09:30 local (15:30 UTC): Elena working at restaurant, Secondary promenading on Av. Juárez
  const TIME_09_30 = '2026-09-14T15:30:00.000Z';
  // 10:45 local (16:45 UTC): Elena working at restaurant, Secondary commuting (10:30-11:00)
  const TIME_10_45 = '2026-09-14T16:45:00.000Z';
  // 12:00 local (18:00 UTC): Elena working at restaurant, Secondary working at restaurant
  const TIME_12_00 = '2026-09-14T18:00:00.000Z';
  // 16:30 local (22:30 UTC): Elena working at restaurant (closing-soon), Secondary resting at home
  const TIME_16_30 = '2026-09-14T22:30:00.000Z';
  // 18:00 local (00:00 UTC next day): Elena promenading on Av. Juárez, Secondary resting at home
  const TIME_18_00 = '2026-09-15T00:00:00.000Z';
  // 21:30 local (03:30 UTC next day): Elena resting at home, Secondary resting at home
  const TIME_21_30 = '2026-09-15T03:30:00.000Z';

  function setupMultiNpcWorld(initialTime: string = TIME_08_00) {
    const clock = WorldClock.create(initialTime);
    const state = createInitialWorldState(clock);
    const secondaryNpc = createSecondaryDevelopmentNpc(initialTime);
    state.agents.push(secondaryNpc);
    const sim = new Simulation(clock, state, { silent: true });
    const devNpc = state.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;
    return { clock, state, sim, devNpc, secondaryNpc };
  }

  // =========================================================================
  // 1. Schedule Resolution & Pure Lookup
  // =========================================================================
  describe('1. Schedule Resolution & Pure Lookup', () => {
    it('findNpcSchedule() resolves both Elena and Secondary NPC', () => {
      const scheduleA = findNpcSchedule(DEVELOPMENT_NPC_ID);
      assert.ok(scheduleA);
      assert.equal(scheduleA.npcId, DEVELOPMENT_NPC_ID);
      assert.equal(scheduleA.shiftStartHour, 9);
      assert.equal(scheduleA.shiftEndHour, 17);
      assert.equal(hasNpcRoutineSchedule(DEVELOPMENT_NPC_ID), true);

      const scheduleB = findNpcSchedule(SECONDARY_DEVELOPMENT_NPC_ID);
      assert.ok(scheduleB);
      assert.equal(scheduleB.npcId, SECONDARY_DEVELOPMENT_NPC_ID);
      assert.equal(scheduleB.shiftStartHour, 11);
      assert.equal(scheduleB.shiftEndHour, 16);
      assert.equal(hasNpcRoutineSchedule(SECONDARY_DEVELOPMENT_NPC_ID), true);
    });

    it('returns null and hasNpcRoutineSchedule=false for unknown or non-NPC IDs', () => {
      assert.equal(findNpcSchedule('agent:unknown-npc'), null);
      assert.equal(hasNpcRoutineSchedule('agent:unknown-npc'), false);
      assert.equal(findNpcSchedule('agent:dev-player'), null);
      assert.equal(hasNpcRoutineSchedule('agent:dev-player'), false);
      assert.equal(findNpcSchedule(''), null);
      assert.equal(hasNpcRoutineSchedule(''), false);
    });
  });

  // =========================================================================
  // 2. Behavioral State Derivation for Both NPCs
  // =========================================================================
  describe('2. Behavioral State Derivation for Both NPCs', () => {
    it('returns no-schedule-defined when evaluating an NPC without a schedule', () => {
      const { state } = setupMultiNpcWorld();
      const customNpc: Agent = {
        id: 'agent:custom-npc',
        name: 'Custom NPC',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: state.worldTime,
        locationId: 'street:development-street',
        balanceMinor: 0,
        currency: 'USD',
      };
      state.agents.push(customNpc);

      const result = evaluateNpcBehavioralState(state, customNpc.id);
      assert.equal(result.success, false);
      assert.equal(result.code, 'no-schedule-defined');
    });

    it('derives Elena behavioral state identically across all canonical phases', () => {
      // Resting at 08:00
      const world1 = setupMultiNpcWorld(TIME_08_00);
      const b1 = deriveNpcBehavioralState(world1.state, DEVELOPMENT_NPC_ID)!;
      assert.equal(b1.routinePhase, 'resting');
      assert.equal(b1.intent, 'rest_at_home');
      assert.equal(b1.destinationId, 'building:development-residence');

      // Commuting at 08:45
      const world2 = setupMultiNpcWorld(TIME_08_45);
      const b2 = deriveNpcBehavioralState(world2.state, DEVELOPMENT_NPC_ID)!;
      assert.equal(b2.routinePhase, 'commuting');
      assert.equal(b2.intent, 'commute_to_work');
      assert.equal(b2.destinationId, 'restaurant:development-restaurant');

      // Working at 09:30
      const world3 = setupMultiNpcWorld(TIME_09_30);
      const b3 = deriveNpcBehavioralState(world3.state, DEVELOPMENT_NPC_ID)!;
      assert.equal(b3.routinePhase, 'working');
      assert.equal(b3.intent, 'perform_work_shift');
      assert.equal(b3.destinationId, 'restaurant:development-restaurant');

      // Promenading at 18:00
      const world4 = setupMultiNpcWorld(TIME_18_00);
      const b4 = deriveNpcBehavioralState(world4.state, DEVELOPMENT_NPC_ID)!;
      assert.equal(b4.routinePhase, 'promenading');
      assert.equal(b4.intent, 'walk_neighborhood');
      assert.equal(b4.destinationId, 'street:avenida-juarez');

      // Resting at 21:30
      const world5 = setupMultiNpcWorld(TIME_21_30);
      const b5 = deriveNpcBehavioralState(world5.state, DEVELOPMENT_NPC_ID)!;
      assert.equal(b5.routinePhase, 'resting');
      assert.equal(b5.intent, 'rest_at_home');
      assert.equal(b5.destinationId, 'building:development-residence');
    });

    it('derives Secondary NPC behavioral state correctly according to its distinct schedule', () => {
      // 08:00 - Resting at home
      const world1 = setupMultiNpcWorld(TIME_08_00);
      const b1 = deriveNpcBehavioralState(world1.state, SECONDARY_DEVELOPMENT_NPC_ID)!;
      assert.equal(b1.routinePhase, 'resting');
      assert.equal(b1.intent, 'rest_at_home');
      assert.equal(b1.destinationId, 'building:development-residence');

      // 08:45 - Promenading on Avenida Juárez (distinct: while Elena is commuting)
      const world2 = setupMultiNpcWorld(TIME_08_45);
      const b2 = deriveNpcBehavioralState(world2.state, SECONDARY_DEVELOPMENT_NPC_ID)!;
      assert.equal(b2.routinePhase, 'promenading');
      assert.equal(b2.intent, 'walk_neighborhood');
      assert.equal(b2.destinationId, 'street:avenida-juarez');

      // 10:45 - Commuting to work
      const world3 = setupMultiNpcWorld(TIME_10_45);
      const b3 = deriveNpcBehavioralState(world3.state, SECONDARY_DEVELOPMENT_NPC_ID)!;
      assert.equal(b3.routinePhase, 'commuting');
      assert.equal(b3.intent, 'commute_to_work');
      assert.equal(b3.destinationId, 'restaurant:development-restaurant');

      // 12:00 - Working at restaurant
      const world4 = setupMultiNpcWorld(TIME_12_00);
      const b4 = deriveNpcBehavioralState(world4.state, SECONDARY_DEVELOPMENT_NPC_ID)!;
      assert.equal(b4.routinePhase, 'working');
      assert.equal(b4.intent, 'perform_work_shift');
      assert.equal(b4.destinationId, 'restaurant:development-restaurant');

      // 18:00 - Resting at home (distinct: while Elena is promenading)
      const world5 = setupMultiNpcWorld(TIME_18_00);
      const b5 = deriveNpcBehavioralState(world5.state, SECONDARY_DEVELOPMENT_NPC_ID)!;
      assert.equal(b5.routinePhase, 'resting');
      assert.equal(b5.intent, 'rest_at_home');
      assert.equal(b5.destinationId, 'building:development-residence');

      // 21:30 - Resting at home
      const world6 = setupMultiNpcWorld(TIME_21_30);
      const b6 = deriveNpcBehavioralState(world6.state, SECONDARY_DEVELOPMENT_NPC_ID)!;
      assert.equal(b6.routinePhase, 'resting');
      assert.equal(b6.intent, 'rest_at_home');
      assert.equal(b6.destinationId, 'building:development-residence');
    });
  });

  // =========================================================================
  // 3. Routine Action Derivation for Both NPCs
  // =========================================================================
  describe('3. Routine Action Derivation for Both NPCs', () => {
    it('both NPCs produce routine actions through the same derivation mechanism', () => {
      const { state } = setupMultiNpcWorld(TIME_08_45);

      const actionA = deriveNpcRoutineAction(state, DEVELOPMENT_NPC_ID)!;
      assert.ok(actionA);
      assert.equal(actionA.npcId, DEVELOPMENT_NPC_ID);
      assert.equal(actionA.actionType, 'commute-to-work');
      assert.equal(actionA.targetLocationId, 'street:development-street');

      const actionB = deriveNpcRoutineAction(state, SECONDARY_DEVELOPMENT_NPC_ID)!;
      assert.ok(actionB);
      assert.equal(actionB.npcId, SECONDARY_DEVELOPMENT_NPC_ID);
      assert.equal(actionB.actionType, 'walk-neighborhood');
      assert.equal(actionB.targetLocationId, 'street:avenida-juarez');
    });

    it('returns no-schedule-defined when deriving action for an unscheduled NPC', () => {
      const { state } = setupMultiNpcWorld();
      const customNpc: Agent = {
        id: 'agent:custom-npc-action',
        name: 'Custom NPC',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: state.worldTime,
        locationId: 'street:development-street',
        balanceMinor: 0,
        currency: 'USD',
      };
      state.agents.push(customNpc);

      const result = evaluateNpcRoutineAction(state, customNpc.id);
      assert.equal(result.success, false);
      assert.equal(result.code, 'no-schedule-defined');
    });
  });

  // =========================================================================
  // 4. Shared Simulation.tick() Execution Pipeline
  // =========================================================================
  describe('4. Shared Simulation.tick() Execution Pipeline', () => {
    it('Simulation.tick() executes routine movements for both NPCs without identity-specific branching', () => {
      const { clock, state, sim, devNpc, secondaryNpc } = setupMultiNpcWorld(TIME_08_00);

      // Both start at residence
      devNpc.locationId = 'building:development-residence';
      secondaryNpc.locationId = 'building:development-residence';

      // 1. Tick at 08:00: both already at residence (changed: false)
      const tick1 = sim.tick();
      const t1A = tick1.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      const t1B = tick1.npcLocationTransitions.find((t) => t.agentId === secondaryNpc.id);
      assert.ok(t1A);
      assert.ok(t1B);
      assert.equal(t1A.changed, false);
      assert.equal(t1B.changed, false);
      assert.equal(devNpc.locationId, 'building:development-residence');
      assert.equal(secondaryNpc.locationId, 'building:development-residence');

      // 2. Advance to 08:45: Elena commutes to street, Secondary moves to Avenida Juárez
      clock.advance(45 * 60_000);
      const tick2 = sim.tick();
      const t2A = tick2.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      const t2B = tick2.npcLocationTransitions.find((t) => t.agentId === secondaryNpc.id);
      assert.ok(t2A);
      assert.ok(t2B);
      assert.equal(t2A.changed, true);
      assert.equal(t2A.newLocationId, 'street:development-street');
      assert.equal(devNpc.locationId, 'street:development-street');
      assert.equal(t2B.changed, true);
      assert.equal(t2B.newLocationId, 'street:avenida-juarez');
      assert.equal(secondaryNpc.locationId, 'street:avenida-juarez');

      // 3. Advance to 10:45: Elena at restaurant, Secondary commutes via Development Street
      clock.advance(2 * 3600_000); // 08:45 -> 10:45
      const tick3 = sim.tick();
      const t3A = tick3.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      const t3B = tick3.npcLocationTransitions.find((t) => t.agentId === secondaryNpc.id);
      assert.ok(t3A);
      assert.ok(t3B);
      assert.equal(t3A.newLocationId, 'restaurant:development-restaurant');
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      assert.equal(t3B.changed, true);
      assert.equal(t3B.newLocationId, 'street:development-street');
      assert.equal(secondaryNpc.locationId, 'street:development-street');

      // 4. Advance to 12:00: Elena at restaurant, Secondary at restaurant (both working together)
      clock.advance(75 * 60_000); // 10:45 -> 12:00
      const tick4 = sim.tick();
      const t4A = tick4.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      const t4B = tick4.npcLocationTransitions.find((t) => t.agentId === secondaryNpc.id);
      assert.ok(t4A);
      assert.ok(t4B);
      assert.equal(t4A.changed, false); // Elena already at restaurant
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      assert.equal(t4B.changed, true); // Secondary enters restaurant
      assert.equal(t4B.newLocationId, 'restaurant:development-restaurant');
      assert.equal(secondaryNpc.locationId, 'restaurant:development-restaurant');

      // 5. Advance to 18:00: Elena promenades on Av. Juárez, Secondary returns home to rest
      clock.advance(6 * 3600_000); // 12:00 -> 18:00
      const tick5 = sim.tick();
      const t5A = tick5.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      const t5B = tick5.npcLocationTransitions.find((t) => t.agentId === secondaryNpc.id);
      assert.ok(t5A);
      assert.ok(t5B);
      assert.equal(t5A.changed, true);
      assert.equal(t5A.newLocationId, 'street:avenida-juarez');
      assert.equal(devNpc.locationId, 'street:avenida-juarez');
      assert.equal(t5B.changed, true);
      assert.equal(t5B.newLocationId, 'building:development-residence');
      assert.equal(secondaryNpc.locationId, 'building:development-residence');

      // 6. Advance to 22:00: Elena returns home to rest, Secondary already resting
      clock.advance(4 * 3600_000); // 18:00 -> 22:00
      const tick6 = sim.tick();
      const t6A = tick6.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      const t6B = tick6.npcLocationTransitions.find((t) => t.agentId === secondaryNpc.id);
      assert.ok(t6A);
      assert.ok(t6B);
      assert.equal(t6A.changed, true);
      assert.equal(t6A.newLocationId, 'building:development-residence');
      assert.equal(devNpc.locationId, 'building:development-residence');
      assert.equal(t6B.changed, false); // Secondary was already resting
      assert.equal(secondaryNpc.locationId, 'building:development-residence');
    });
  });

  // =========================================================================
  // 5. Distinct Activity Intervals
  // =========================================================================
  describe('5. Distinct Activity Intervals', () => {
    it('each NPC derives work activityState from its own configured shift interval', () => {
      // At 09:30: Elena is in shift (09:00-17:00 -> active), Secondary is out of shift (11:00-16:00 -> idle)
      const world1 = setupMultiNpcWorld(TIME_09_30);
      world1.sim.tick();
      assert.equal(world1.devNpc.activityState, 'active');
      assert.equal(world1.secondaryNpc.activityState, 'idle');

      // At 12:00: both are in shift -> both active
      const world2 = setupMultiNpcWorld(TIME_12_00);
      world2.sim.tick();
      assert.equal(world2.devNpc.activityState, 'active');
      assert.equal(world2.secondaryNpc.activityState, 'active');

      // At 16:30: Elena is in shift (active), Secondary is out of shift (idle)
      const world3 = setupMultiNpcWorld(TIME_16_30);
      world3.sim.tick();
      assert.equal(world3.devNpc.activityState, 'active');
      assert.equal(world3.secondaryNpc.activityState, 'idle');

      // At 18:00: both are out of shift -> both idle
      const world4 = setupMultiNpcWorld(TIME_18_00);
      world4.sim.tick();
      assert.equal(world4.devNpc.activityState, 'idle');
      assert.equal(world4.secondaryNpc.activityState, 'idle');
    });
  });

  // =========================================================================
  // 6. Large Time Advancement (Offline Simulation Continuity)
  // =========================================================================
  describe('6. Large Time Advancement (Offline Simulation Continuity)', () => {
    it('resolves both NPCs deterministically after a multi-hour leap without intermediate ticks', () => {
      const { clock, state, sim, devNpc, secondaryNpc } = setupMultiNpcWorld(TIME_08_00);
      sim.tick();
      assert.equal(devNpc.locationId, 'building:development-residence');
      assert.equal(secondaryNpc.locationId, 'building:development-residence');

      // Leap 4 hours directly from 08:00 to 12:00:
      // Both NPCs should resolve directly to restaurant:development-restaurant in a single tick
      clock.advance(4 * 3600_000);
      const tickResult = sim.tick();

      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      assert.equal(secondaryNpc.locationId, 'restaurant:development-restaurant');

      const transA = tickResult.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      const transB = tickResult.npcLocationTransitions.find((t) => t.agentId === secondaryNpc.id);
      assert.ok(transA);
      assert.ok(transB);
      assert.equal(transA.newLocationId, 'restaurant:development-restaurant');
      assert.equal(transA.changed, true);
      assert.equal(transB.newLocationId, 'restaurant:development-restaurant');
      assert.equal(transB.changed, true);
    });

    it('resolves both NPCs deterministically to evening locations after a 10-hour leap', () => {
      const { clock, state, sim, devNpc, secondaryNpc } = setupMultiNpcWorld(TIME_08_00);
      sim.tick();

      // Leap 10 hours directly from 08:00 to 18:00:
      // Elena -> street:avenida-juarez (promenading)
      // Secondary -> building:development-residence (resting after 16:00 shift end)
      clock.advance(10 * 3600_000);
      const tickResult = sim.tick();

      assert.equal(devNpc.locationId, 'street:avenida-juarez');
      assert.equal(secondaryNpc.locationId, 'building:development-residence');

      const transA = tickResult.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      const transB = tickResult.npcLocationTransitions.find((t) => t.agentId === secondaryNpc.id);
      assert.ok(transA);
      assert.ok(transB);
      assert.equal(transA.newLocationId, 'street:avenida-juarez');
      assert.equal(transA.changed, true);
      assert.equal(transB.changed, false); // Secondary started at residence, returned to residence
    });
  });

  // =========================================================================
  // 7. Spatial Authority & Non-Bypassing Invariants
  // =========================================================================
  describe('7. Spatial Authority & Non-Bypassing Invariants', () => {
    it('Spatial Authority failure on one NPC preserves its location while allowing the other to transition', () => {
      const { clock, state, sim, devNpc, secondaryNpc } = setupMultiNpcWorld(TIME_08_00);
      sim.tick();

      // Temporarily delete Avenida Juárez from places
      const juarezIndex = state.places.findIndex((p) => p.id === 'street:avenida-juarez');
      const [removedJuarez] = state.places.splice(juarezIndex, 1);

      // Advance to 08:45:
      // Elena wants street:development-street (valid -> transitions successfully)
      // Secondary wants street:avenida-juarez (missing -> fails through Spatial Authority, preserves residence)
      clock.advance(45 * 60_000);
      const tickResult = sim.tick();

      // Elena moved successfully
      assert.equal(devNpc.locationId, 'street:development-street');
      const transA = tickResult.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(transA);
      assert.equal(transA.changed, true);
      assert.equal(transA.newLocationId, 'street:development-street');

      // Secondary NPC preserved its previous location safely
      assert.equal(secondaryNpc.locationId, 'building:development-residence');
      const transB = tickResult.npcLocationTransitions.find((t) => t.agentId === secondaryNpc.id);
      assert.ok(transB);
      assert.equal(transB.changed, false);
      assert.equal(transB.newLocationId, 'building:development-residence');

      // Restore street
      state.places.splice(juarezIndex, 0, removedJuarez);
    });
  });

  // =========================================================================
  // 8. World State Schema & Context Projection Invariants
  // =========================================================================
  describe('8. World State Schema & Context Projection Invariants', () => {
    it('WorldState remains strictly valid schema version 18 before and after multi-NPC simulation', () => {
      const { state, sim } = setupMultiNpcWorld(TIME_08_00);
      assert.equal(CURRENT_WORLD_STATE_VERSION, 18);
      assert.equal(state.version, 18);
      assert.doesNotThrow(() => validateWorldState(state));

      sim.tick();
      assert.equal(state.version, 18);
      assert.doesNotThrow(() => validateWorldState(state));

      // inspectNpcContext() projects correctly for both NPCs without mutating state
      const snapshot = JSON.stringify(state);
      const ctxA = inspectNpcContext(state, DEVELOPMENT_NPC_ID);
      const ctxB = inspectNpcContext(state, SECONDARY_DEVELOPMENT_NPC_ID);

      assert.equal(ctxA.success, true);
      assert.equal(ctxB.success, true);
      assert.equal(ctxA.npcId, DEVELOPMENT_NPC_ID);
      assert.equal(ctxB.npcId, SECONDARY_DEVELOPMENT_NPC_ID);
      assert.equal(JSON.stringify(state), snapshot);
    });
  });
});
