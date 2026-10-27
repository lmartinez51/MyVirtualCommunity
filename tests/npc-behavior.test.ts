import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  greetAgent,
  introduceToAgent,
  inquireRestaurantService,
  CURRENT_WORLD_STATE_VERSION,
  type WorldState,
  type Agent,
} from '../src/core/world-state.js';
import {
  evaluateNpcBehavioralState,
  deriveNpcBehavioralState,
  inspectNpcContext,
  type NpcBehavioralState,
  type NpcRoutinePhase,
  type NpcIntentType,
} from '../src/core/npc-behavior.js';
import { isRestaurantOpen } from '../src/core/business.js';

describe('Milestone 61: NPC Behavioral State & Intent Foundation', () => {
  // Morning 08:00 AM local Juarez time (14:00 UTC) -> Resting at home
  const MORNING_REST_TIME = '2026-09-14T14:00:00.000Z';
  // Commute 08:45 AM local Juarez time (14:45 UTC) -> Commuting to work
  const COMMUTE_TIME = '2026-09-14T14:45:00.000Z';
  // Work shift 09:30 AM local Juarez time (15:30 UTC) -> Working at restaurant
  const WORK_SHIFT_TIME = '2026-09-14T15:30:00.000Z';
  // Evening promenade 18:00 PM local Juarez time (00:00 UTC next day) -> Promenading on Avenida Juárez
  const PROMENADE_TIME = '2026-09-15T00:00:00.000Z';
  // Night rest 21:00 PM local Juarez time (03:00 UTC next day) -> Resting at home
  const NIGHT_REST_TIME = '2026-09-15T03:00:00.000Z';

  function setupWorld(timeIso: string = MORNING_REST_TIME) {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    sim.tick();

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

    return { clock, state, sim, player, devNpc };
  }

  // =========================================================================
  // A. Five Routine Phases
  // =========================================================================
  describe('A. Five Routine Phases', () => {
    it('derives resting phase at 08:00 local Juarez time', () => {
      const { state, devNpc } = setupWorld(MORNING_REST_TIME);
      const behavioral = deriveNpcBehavioralState(state, devNpc.id);

      assert.ok(behavioral);
      assert.equal(behavioral.npcId, devNpc.id);
      assert.equal(behavioral.routinePhase, 'resting');
      assert.equal(behavioral.intent, 'rest_at_home');
      assert.equal(behavioral.destinationId, 'building:development-residence');
      assert.equal(behavioral.activity, 'Resting at home');
    });

    it('derives commuting phase at 08:45 local Juarez time', () => {
      const { state, devNpc } = setupWorld(COMMUTE_TIME);
      const behavioral = deriveNpcBehavioralState(state, devNpc.id);

      assert.ok(behavioral);
      assert.equal(behavioral.routinePhase, 'commuting');
      assert.equal(behavioral.intent, 'commute_to_work');
      assert.equal(behavioral.destinationId, 'restaurant:development-restaurant');
      assert.equal(behavioral.activity, 'Commuting to work');
    });

    it('derives working phase at 09:30 local Juarez time', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const behavioral = deriveNpcBehavioralState(state, devNpc.id);

      assert.ok(behavioral);
      assert.equal(behavioral.routinePhase, 'working');
      assert.equal(behavioral.intent, 'perform_work_shift');
      assert.equal(behavioral.destinationId, 'restaurant:development-restaurant');
      assert.equal(behavioral.activity, 'Working at restaurant');
    });

    it('derives promenading phase at 18:00 local Juarez time', () => {
      const { state, devNpc } = setupWorld(PROMENADE_TIME);
      const behavioral = deriveNpcBehavioralState(state, devNpc.id);

      assert.ok(behavioral);
      assert.equal(behavioral.routinePhase, 'promenading');
      assert.equal(behavioral.intent, 'walk_neighborhood');
      assert.equal(behavioral.destinationId, 'street:avenida-juarez');
      assert.equal(behavioral.activity, 'Walking along Avenida Juárez');
    });

    it('derives resting phase at 21:00 local Juarez time', () => {
      const { state, devNpc } = setupWorld(NIGHT_REST_TIME);
      const behavioral = deriveNpcBehavioralState(state, devNpc.id);

      assert.ok(behavioral);
      assert.equal(behavioral.routinePhase, 'resting');
      assert.equal(behavioral.intent, 'rest_at_home');
      assert.equal(behavioral.destinationId, 'building:development-residence');
      assert.equal(behavioral.activity, 'Resting at home');
    });
  });

  // =========================================================================
  // B. Intent Derivation
  // =========================================================================
  describe('B. Intent Derivation', () => {
    it('maps resting phase strictly to rest_at_home intent', () => {
      const { state, devNpc } = setupWorld(MORNING_REST_TIME);
      const result = evaluateNpcBehavioralState(state, devNpc.id);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.behavioralState.intent, 'rest_at_home');
      }
    });

    it('maps commuting phase strictly to commute_to_work intent', () => {
      const { state, devNpc } = setupWorld(COMMUTE_TIME);
      const result = evaluateNpcBehavioralState(state, devNpc.id);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.behavioralState.intent, 'commute_to_work');
      }
    });

    it('maps working phase strictly to perform_work_shift intent', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const result = evaluateNpcBehavioralState(state, devNpc.id);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.behavioralState.intent, 'perform_work_shift');
      }
    });

    it('maps promenading phase strictly to walk_neighborhood intent', () => {
      const { state, devNpc } = setupWorld(PROMENADE_TIME);
      const result = evaluateNpcBehavioralState(state, devNpc.id);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.behavioralState.intent, 'walk_neighborhood');
      }
    });
  });

  // =========================================================================
  // C. Destination Derivation
  // =========================================================================
  describe('C. Destination Derivation', () => {
    it('derives building:development-residence for resting phase', () => {
      const { state, devNpc } = setupWorld(MORNING_REST_TIME);
      const b = deriveNpcBehavioralState(state, devNpc.id);
      assert.equal(b?.destinationId, 'building:development-residence');
    });

    it('derives restaurant:development-restaurant for commuting and working phases', () => {
      const { state: stateCommute, devNpc: npcCommute } = setupWorld(COMMUTE_TIME);
      const bCommute = deriveNpcBehavioralState(stateCommute, npcCommute.id);
      assert.equal(bCommute?.destinationId, 'restaurant:development-restaurant');

      const { state: stateWork, devNpc: npcWork } = setupWorld(WORK_SHIFT_TIME);
      const bWork = deriveNpcBehavioralState(stateWork, npcWork.id);
      assert.equal(bWork?.destinationId, 'restaurant:development-restaurant');
    });

    it('derives street:avenida-juarez for promenading phase', () => {
      const { state, devNpc } = setupWorld(PROMENADE_TIME);
      const b = deriveNpcBehavioralState(state, devNpc.id);
      assert.equal(b?.destinationId, 'street:avenida-juarez');
    });
  });

  // =========================================================================
  // D. Purity & Immutability
  // =========================================================================
  describe('D. Purity & Immutability', () => {
    it('evaluateNpcBehavioralState does not mutate WorldState', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const snapshot = JSON.stringify(state);

      evaluateNpcBehavioralState(state, devNpc.id);
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('deriveNpcBehavioralState does not mutate WorldState', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const snapshot = JSON.stringify(state);

      deriveNpcBehavioralState(state, devNpc.id);
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('inspectNpcContext does not mutate WorldState', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const snapshot = JSON.stringify(state);

      inspectNpcContext(state, devNpc.id);
      assert.equal(JSON.stringify(state), snapshot);
    });
  });

  // =========================================================================
  // E. NPC Context Projection Boundary
  // =========================================================================
  describe('E. NPC Context Projection Boundary', () => {
    it('returns full read-only situational projection for authoritative NPC', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const context = inspectNpcContext(state, devNpc.id);

      assert.equal(context.success, true);
      assert.equal(context.code, 'success');
      assert.equal(context.npcId, devNpc.id);

      // Identity projection
      assert.ok(context.agent);
      assert.equal(context.agent.id, devNpc.id);
      assert.equal(context.agent.name, devNpc.name);
      assert.equal(context.agent.agentType, 'npc');
      assert.equal(context.agent.activityState, 'active');

      // Location projection
      assert.ok(context.location);
      assert.equal(context.location.id, devNpc.locationId);
      assert.equal(typeof context.location.name, 'string');
      assert.equal(typeof context.location.type, 'string');

      // Derived behavioral state
      assert.ok(context.behavioralState);
      assert.equal(context.behavioralState.routinePhase, 'working');
      assert.equal(context.behavioralState.intent, 'perform_work_shift');
      assert.equal(context.behavioralState.destinationId, 'restaurant:development-restaurant');

      // Co-located agents array
      assert.ok(Array.isArray(context.coLocatedAgents));

      // Site associations
      assert.ok(Array.isArray(context.siteAssociations));
      assert.ok(context.siteAssociations.some((a) => a.role === 'attendant' && a.placeId === 'restaurant:development-restaurant'));

      // Temporal context
      assert.ok(context.temporalContext);
      assert.equal(context.temporalContext.timeZone, 'America/Ciudad_Juarez');
      assert.equal(context.temporalContext.civilTime.hour, 9);
      assert.equal(context.temporalContext.civilTime.minute, 30);
    });
  });

  // =========================================================================
  // F. Unsupported Agent & Failure Modes
  // =========================================================================
  describe('F. Unsupported Agent & Failure Modes', () => {
    it('returns npc-not-found for non-existent agent', () => {
      const { state } = setupWorld();
      const result = evaluateNpcBehavioralState(state, 'agent:ghost');

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-found');

      const context = inspectNpcContext(state, 'agent:ghost');
      assert.equal(context.success, false);
      assert.equal(context.code, 'npc-not-found');
    });

    it('returns npc-not-found for invalid or empty agent ID', () => {
      const { state } = setupWorld();
      const result = evaluateNpcBehavioralState(state, '   ');

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-found');
    });

    it('returns agent-not-npc when queried for a player agent', () => {
      const { state, player } = setupWorld();
      const result = evaluateNpcBehavioralState(state, player.id);

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-npc');

      const context = inspectNpcContext(state, player.id);
      assert.equal(context.success, false);
      assert.equal(context.code, 'agent-not-npc');
    });

    it('returns no-schedule-defined for an NPC without a configured schedule', () => {
      const { state } = setupWorld();
      const unscheduledNpc: Agent = {
        id: 'agent:custom-npc',
        name: 'Carlos Mendoza',
        agentType: 'npc',
        locationId: 'street:development-street',
        activityState: 'idle',
        activitySince: state.worldTime,
      };
      state.agents.push(unscheduledNpc);

      const result = evaluateNpcBehavioralState(state, unscheduledNpc.id);
      assert.equal(result.success, false);
      assert.equal(result.code, 'no-schedule-defined');

      const context = inspectNpcContext(state, unscheduledNpc.id);
      assert.equal(context.success, false);
      assert.equal(context.code, 'no-schedule-defined');
    });
  });

  // =========================================================================
  // G. Existing Social Behavior (greetAgent) Integration
  // =========================================================================
  describe('G. Existing Social Behavior (greetAgent) Integration', () => {
    it('greetAgent uses working phase dialogue when NPC is working at restaurant', () => {
      const { state, player, devNpc } = setupWorld(WORK_SHIFT_TIME);
      player.locationId = devNpc.locationId;

      const greet = greetAgent(state, player.id, devNpc.id);
      assert.equal(greet.success, true);
      assert.equal(greet.response, "Welcome. I'm working here today.");

      // When acquainted:
      introduceToAgent(state, player.id, devNpc.id);
      const greetAcq = greetAgent(state, player.id, devNpc.id);
      assert.equal(greetAcq.success, true);
      assert.equal(greetAcq.response, "Welcome back. Good to see you again. I'm working here today.");
    });

    it('greetAgent uses resting phase dialogue when NPC is resting at home', () => {
      const { state, player, devNpc } = setupWorld(MORNING_REST_TIME);
      player.locationId = devNpc.locationId;

      const greet = greetAgent(state, player.id, devNpc.id);
      assert.equal(greet.success, true);
      assert.equal(greet.response, "Hello. I'm resting at home right now.");

      introduceToAgent(state, player.id, devNpc.id);
      const greetAcq = greetAgent(state, player.id, devNpc.id);
      assert.equal(greetAcq.success, true);
      assert.equal(greetAcq.response, "Hello again. Good to see you. I'm resting at home right now.");
    });

    it('greetAgent uses commuting phase dialogue when NPC is commuting on street', () => {
      const { state, player, devNpc } = setupWorld(COMMUTE_TIME);
      player.locationId = devNpc.locationId;

      const greet = greetAgent(state, player.id, devNpc.id);
      assert.equal(greet.success, true);
      assert.equal(greet.response, "Good morning. On my way to the restaurant.");

      introduceToAgent(state, player.id, devNpc.id);
      const greetAcq = greetAgent(state, player.id, devNpc.id);
      assert.equal(greetAcq.success, true);
      assert.equal(greetAcq.response, "Good morning again. On my way to the restaurant.");
    });

    it('greetAgent uses promenading phase dialogue when NPC is promenading on Avenida Juárez', () => {
      const { state, player, devNpc } = setupWorld(PROMENADE_TIME);
      player.locationId = devNpc.locationId;

      const greet = greetAgent(state, player.id, devNpc.id);
      assert.equal(greet.success, true);
      assert.equal(greet.response, "Good evening. It's pleasant to walk down Avenida Juárez after work.");

      introduceToAgent(state, player.id, devNpc.id);
      const greetAcq = greetAgent(state, player.id, devNpc.id);
      assert.equal(greetAcq.success, true);
      assert.equal(greetAcq.response, "Good evening again. It's pleasant to walk down Avenida Juárez after work.");
    });

    it('greetAgent maintains legacy fallback dialogue when at development building and idle', () => {
      const { state, player, devNpc } = setupWorld(WORK_SHIFT_TIME);
      devNpc.locationId = 'building:development-building';
      devNpc.activityState = 'idle';
      player.locationId = 'building:development-building';

      const greet = greetAgent(state, player.id, devNpc.id);
      assert.equal(greet.success, true);
      assert.equal(greet.response, "Hello. I'm around the building today.");
    });
  });

  // =========================================================================
  // H. Schema Invariant & Zero Behavioral Persistence
  // =========================================================================
  describe('H. Schema Invariant & Zero Behavioral Persistence', () => {
    it('WorldState version remains strictly 18', () => {
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      const { state } = setupWorld();
      assert.equal(state.version, 19);
      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('WorldState contains zero persistent behavioral fields', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      deriveNpcBehavioralState(state, devNpc.id);
      inspectNpcContext(state, devNpc.id);

      const stateRecord = state as Record<string, unknown>;
      assert.equal(stateRecord.npcBehavior, undefined);
      assert.equal(stateRecord.npcIntents, undefined);
      assert.equal(stateRecord.goals, undefined);
      assert.equal(stateRecord.plans, undefined);
      assert.equal(stateRecord.tasks, undefined);

      const npcRecord = devNpc as Record<string, unknown>;
      assert.equal(npcRecord.routinePhase, undefined);
      assert.equal(npcRecord.intent, undefined);
      assert.equal(npcRecord.destinationId, undefined);
      assert.equal(npcRecord.behavioralState, undefined);
    });
  });

  // =========================================================================
  // I. Business Authority Compatibility
  // =========================================================================
  describe('I. Business Authority Compatibility', () => {
    it('business service affordance remains strictly governed by activityState, not derived routinePhase', () => {
      const { state, player, devNpc } = setupWorld(WORK_SHIFT_TIME);
      player.locationId = devNpc.locationId;

      // When NPC is active, service inquiry succeeds
      const activeQuery = inquireRestaurantService(state, player.id, devNpc.id);
      assert.equal(activeQuery.success, true);

      // Setting activityState to idle denies service inquiry regardless of derived routinePhase
      devNpc.activityState = 'idle';
      const idleQuery = inquireRestaurantService(state, player.id, devNpc.id);
      assert.equal(idleQuery.success, false);
      assert.equal(idleQuery.code, 'staff-not-active');

      // But routinePhase remains 'working' because it is derived from worldTime and schedule
      const behavioral = deriveNpcBehavioralState(state, devNpc.id);
      assert.equal(behavioral?.routinePhase, 'working');
    });
  });

  // =========================================================================
  // J. Semantic Independence
  // =========================================================================
  describe('J. Semantic Independence', () => {
    it('repeated derivations from identical authoritative state produce identical output', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const first = deriveNpcBehavioralState(state, devNpc.id);

      for (let i = 0; i < 50; i++) {
        const next = deriveNpcBehavioralState(state, devNpc.id);
        assert.deepEqual(next, first);
      }
    });
  });
});
