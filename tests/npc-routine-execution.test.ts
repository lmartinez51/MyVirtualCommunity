import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  transitionAgentLocation,
  transitionRestaurantOperationalState,
  inquireRestaurantService,
  CURRENT_WORLD_STATE_VERSION,
  type WorldState,
  type Agent,
} from '../src/core/world-state.js';
import {
  evaluateNpcBehavioralState,
  deriveNpcBehavioralState,
  inspectNpcContext,
  evaluateNpcRoutineAction,
  deriveNpcRoutineAction,
  executeNpcRoutineAction,
  type NpcRoutineAction,
  type NpcRoutineActionType,
} from '../src/core/npc-behavior.js';

describe('Milestone 62: NPC Routine Action Execution Foundation', () => {
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
  // A. Routine Action Derivation Across All 5 Schedule Phases
  // =========================================================================
  describe('A. Routine Action Derivation', () => {
    it('derives stay-at-home action at 08:00 local Juarez time (resting phase)', () => {
      const { state, devNpc } = setupWorld(MORNING_REST_TIME);
      const action = deriveNpcRoutineAction(state, devNpc.id);

      assert.ok(action);
      assert.equal(action.npcId, devNpc.id);
      assert.equal(action.actionType, 'stay-at-home');
      assert.equal(action.targetLocationId, 'building:development-residence');
      assert.equal(action.routinePhase, 'resting');
      assert.equal(action.requiresMovement, false); // NPC is already at residence
      assert.equal(action.description, 'Stay at residence');
    });

    it('derives commute-to-work action at 08:45 local Juarez time (commuting phase)', () => {
      const { state, devNpc } = setupWorld(COMMUTE_TIME);
      // Ensure NPC starts at home
      devNpc.locationId = 'building:development-residence';

      const action = deriveNpcRoutineAction(state, devNpc.id);

      assert.ok(action);
      assert.equal(action.npcId, devNpc.id);
      assert.equal(action.actionType, 'commute-to-work');
      assert.equal(action.targetLocationId, 'street:development-street');
      assert.equal(action.routinePhase, 'commuting');
      assert.equal(action.requiresMovement, true); // at residence, target is street
      assert.equal(action.description, 'Commute to work via Development Street');
    });

    it('derives work-at-restaurant action at 09:30 local Juarez time (working phase)', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      // Place NPC on street prior to entering workplace
      devNpc.locationId = 'street:development-street';

      const action = deriveNpcRoutineAction(state, devNpc.id);

      assert.ok(action);
      assert.equal(action.npcId, devNpc.id);
      assert.equal(action.actionType, 'work-at-restaurant');
      assert.equal(action.targetLocationId, 'restaurant:development-restaurant');
      assert.equal(action.routinePhase, 'working');
      assert.equal(action.requiresMovement, true);
      assert.equal(action.description, 'Work shift at restaurant');
    });

    it('derives walk-neighborhood action at 18:00 local Juarez time (promenading phase)', () => {
      const { state, devNpc } = setupWorld(PROMENADE_TIME);
      // Place NPC at restaurant prior to evening promenade
      devNpc.locationId = 'restaurant:development-restaurant';

      const action = deriveNpcRoutineAction(state, devNpc.id);

      assert.ok(action);
      assert.equal(action.npcId, devNpc.id);
      assert.equal(action.actionType, 'walk-neighborhood');
      assert.equal(action.targetLocationId, 'street:avenida-juarez');
      assert.equal(action.routinePhase, 'promenading');
      assert.equal(action.requiresMovement, true);
      assert.equal(action.description, 'Walk neighborhood along Avenida Juárez');
    });

    it('derives stay-at-home action at 21:00 local Juarez time (night resting phase)', () => {
      const { state, devNpc } = setupWorld(NIGHT_REST_TIME);
      // Place NPC on Avenida Juárez prior to returning home
      devNpc.locationId = 'street:avenida-juarez';

      const action = deriveNpcRoutineAction(state, devNpc.id);

      assert.ok(action);
      assert.equal(action.npcId, devNpc.id);
      assert.equal(action.actionType, 'stay-at-home');
      assert.equal(action.targetLocationId, 'building:development-residence');
      assert.equal(action.routinePhase, 'resting');
      assert.equal(action.requiresMovement, true);
      assert.equal(action.description, 'Stay at residence');
    });
  });

  // =========================================================================
  // B. Movement Execution Across Topological Cycle
  // =========================================================================
  describe('B. Movement Execution Across Topological Cycle', () => {
    it('executes full daily cycle: residence -> dev-street -> restaurant -> av-juarez -> residence', () => {
      // 1. Initial State: 08:00 (resting at residence)
      const { clock, state, devNpc } = setupWorld(MORNING_REST_TIME);
      assert.equal(devNpc.locationId, 'building:development-residence');

      const restExec = executeNpcRoutineAction(state, devNpc.id);
      assert.equal(restExec.success, true);
      assert.equal(restExec.code, 'already-at-destination');
      assert.equal(restExec.changed, false);
      assert.equal(devNpc.locationId, 'building:development-residence');

      // 2. Advance to 08:45 (commute to work)
      clock.advance(45 * 60_000);
      state.worldTime = clock.getTime();

      const commuteAction = deriveNpcRoutineAction(state, devNpc.id);
      assert.ok(commuteAction);
      assert.equal(commuteAction.actionType, 'commute-to-work');
      assert.equal(commuteAction.requiresMovement, true);

      const commuteExec = executeNpcRoutineAction(state, devNpc.id);
      assert.equal(commuteExec.success, true);
      assert.equal(commuteExec.code, 'success');
      assert.equal(commuteExec.changed, true);
      assert.equal(commuteExec.previousLocationId, 'building:development-residence');
      assert.equal(commuteExec.currentLocationId, 'street:development-street');
      assert.equal(devNpc.locationId, 'street:development-street');

      // 3. Advance to 09:30 (work at restaurant)
      clock.advance(45 * 60_000);
      state.worldTime = clock.getTime();

      const workAction = deriveNpcRoutineAction(state, devNpc.id);
      assert.ok(workAction);
      assert.equal(workAction.actionType, 'work-at-restaurant');
      assert.equal(workAction.requiresMovement, true);

      const workExec = executeNpcRoutineAction(state, devNpc.id);
      assert.equal(workExec.success, true);
      assert.equal(workExec.code, 'success');
      assert.equal(workExec.changed, true);
      assert.equal(workExec.previousLocationId, 'street:development-street');
      assert.equal(workExec.currentLocationId, 'restaurant:development-restaurant');
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

      // 4. Advance to 18:00 (promenade on Avenida Juárez)
      clock.advance(8 * 3600_000 + 30 * 60_000);
      state.worldTime = clock.getTime();

      const promenadeAction = deriveNpcRoutineAction(state, devNpc.id);
      assert.ok(promenadeAction);
      assert.equal(promenadeAction.actionType, 'walk-neighborhood');
      assert.equal(promenadeAction.requiresMovement, true);

      const promenadeExec = executeNpcRoutineAction(state, devNpc.id);
      assert.equal(promenadeExec.success, true);
      assert.equal(promenadeExec.code, 'success');
      assert.equal(promenadeExec.changed, true);
      assert.equal(promenadeExec.previousLocationId, 'restaurant:development-restaurant');
      assert.equal(promenadeExec.currentLocationId, 'street:avenida-juarez');
      assert.equal(devNpc.locationId, 'street:avenida-juarez');

      // 5. Advance to 21:00 (return home to rest)
      clock.advance(3 * 3600_000);
      state.worldTime = clock.getTime();

      const nightRestAction = deriveNpcRoutineAction(state, devNpc.id);
      assert.ok(nightRestAction);
      assert.equal(nightRestAction.actionType, 'stay-at-home');
      assert.equal(nightRestAction.requiresMovement, true);

      const nightRestExec = executeNpcRoutineAction(state, devNpc.id);
      assert.equal(nightRestExec.success, true);
      assert.equal(nightRestExec.code, 'success');
      assert.equal(nightRestExec.changed, true);
      assert.equal(nightRestExec.previousLocationId, 'street:avenida-juarez');
      assert.equal(nightRestExec.currentLocationId, 'building:development-residence');
      assert.equal(devNpc.locationId, 'building:development-residence');
    });
  });

  // =========================================================================
  // C. Spatial Authority Verification
  // =========================================================================
  describe('C. Spatial Authority Verification', () => {
    it('executes movement through transitionAgentLocation', () => {
      const { state, devNpc } = setupWorld(COMMUTE_TIME);
      devNpc.locationId = 'building:development-residence';

      // transitionAgentLocation supports NPC moving to places
      const transitioned = transitionAgentLocation(
        state,
        devNpc.id,
        'street:development-street'
      );
      assert.equal(transitioned.id, devNpc.id);
      assert.equal(transitioned.locationId, 'street:development-street');

      // transitionAgentLocation supports NPC moving to workplace restaurant
      const toRestaurant = transitionAgentLocation(
        state,
        devNpc.id,
        'restaurant:development-restaurant'
      );
      assert.equal(toRestaurant.locationId, 'restaurant:development-restaurant');
    });

    it('strictly preserves player restriction on transitionAgentLocation into restaurant', () => {
      const { state, player } = setupWorld(WORK_SHIFT_TIME);
      const snapshot = JSON.stringify(state);

      assert.throws(
        () => transitionAgentLocation(state, player.id, 'restaurant:development-restaurant'),
        /does not exist in world state/
      );
      assert.equal(JSON.stringify(state), snapshot);
    });
  });

  // =========================================================================
  // D. Idempotency & Destination Check
  // =========================================================================
  describe('D. Idempotency & Destination Check', () => {
    it('returns already-at-destination with changed=false when NPC is already at target', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      devNpc.locationId = 'restaurant:development-restaurant';

      const action = deriveNpcRoutineAction(state, devNpc.id)!;
      assert.equal(action.requiresMovement, false);

      const result = executeNpcRoutineAction(state, devNpc.id);
      assert.equal(result.success, true);
      assert.equal(result.code, 'already-at-destination');
      assert.equal(result.changed, false);
      assert.equal(result.previousLocationId, 'restaurant:development-restaurant');
      assert.equal(result.currentLocationId, 'restaurant:development-restaurant');
    });
  });

  // =========================================================================
  // E. Invalid Destinations & Failure Modes
  // =========================================================================
  describe('E. Invalid Destinations & Failure Modes', () => {
    it('returns npc-not-found for non-existent agent with zero state mutation', () => {
      const { state } = setupWorld();
      const snapshot = JSON.stringify(state);

      const evalResult = evaluateNpcRoutineAction(state, 'agent:ghost');
      assert.equal(evalResult.success, false);
      assert.equal(evalResult.code, 'npc-not-found');

      const execResult = executeNpcRoutineAction(state, 'agent:ghost');
      assert.equal(execResult.success, false);
      assert.equal(execResult.code, 'npc-not-found');

      assert.equal(JSON.stringify(state), snapshot);
    });

    it('returns agent-not-npc when queried for a player agent with zero state mutation', () => {
      const { state, player } = setupWorld();
      const snapshot = JSON.stringify(state);

      const evalResult = evaluateNpcRoutineAction(state, player.id);
      assert.equal(evalResult.success, false);
      assert.equal(evalResult.code, 'agent-not-npc');

      const execResult = executeNpcRoutineAction(state, player.id);
      assert.equal(execResult.success, false);
      assert.equal(execResult.code, 'agent-not-npc');

      assert.equal(JSON.stringify(state), snapshot);
    });

    it('returns no-schedule-defined for an NPC without a configured schedule', () => {
      const { state } = setupWorld();
      const unscheduledNpc: Agent = {
        id: 'agent:custom-npc',
        name: 'Sofia Reyes',
        agentType: 'npc',
        locationId: 'street:development-street',
        activityState: 'idle',
        activitySince: state.worldTime,
      };
      state.agents.push(unscheduledNpc);
      const snapshot = JSON.stringify(state);

      const evalResult = evaluateNpcRoutineAction(state, unscheduledNpc.id);
      assert.equal(evalResult.success, false);
      assert.equal(evalResult.code, 'no-schedule-defined');

      const execResult = executeNpcRoutineAction(state, unscheduledNpc.id);
      assert.equal(execResult.success, false);
      assert.equal(execResult.code, 'no-schedule-defined');

      assert.equal(JSON.stringify(state), snapshot);
    });

    it('fails safely if provided action targets an invalid or non-existent entity', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const snapshot = JSON.stringify(state);

      const invalidAction: NpcRoutineAction = {
        npcId: devNpc.id,
        actionType: 'work-at-restaurant',
        targetLocationId: 'place:non-existent-void',
        requiresMovement: true,
        routinePhase: 'working',
        description: 'Invalid void destination',
      };

      const execResult = executeNpcRoutineAction(state, devNpc.id, invalidAction);
      assert.equal(execResult.success, false);
      assert.equal(execResult.code, 'transition-failed');
      assert.match(execResult.message, /does not exist in world state/);

      // State is unmodified
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('fails if provided action npcId does not match target npcId', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const snapshot = JSON.stringify(state);

      const mismatchedAction: NpcRoutineAction = {
        npcId: 'agent:different-npc',
        actionType: 'stay-at-home',
        targetLocationId: 'building:development-residence',
        requiresMovement: true,
        routinePhase: 'resting',
        description: 'Mismatched NPC action',
      };

      const execResult = executeNpcRoutineAction(state, devNpc.id, mismatchedAction);
      assert.equal(execResult.success, false);
      assert.equal(execResult.code, 'transition-failed');
      assert.match(execResult.message, /does not match/);

      assert.equal(JSON.stringify(state), snapshot);
    });
  });

  // =========================================================================
  // F. Business Authority Compatibility
  // =========================================================================
  describe('F. Business Authority Compatibility', () => {
    it('routine action execution into restaurant does NOT bypass business authority when closed', () => {
      const { state, player, devNpc } = setupWorld(WORK_SHIFT_TIME);

      // Force restaurant closed via Business Authority
      transitionRestaurantOperationalState(
        state,
        'restaurant:development-restaurant',
        'closed',
        state.worldTime
      );

      // Execute routine action: NPC arrives at workplace
      const execResult = executeNpcRoutineAction(state, devNpc.id);
      assert.equal(execResult.success, true);
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

      // Place player at restaurant to attempt service inquiry
      player.locationId = 'restaurant:development-restaurant';

      // Commercial inquiry MUST still fail with 'restaurant-closed'
      const inquiry = inquireRestaurantService(state, player.id, devNpc.id);
      assert.equal(inquiry.success, false);
      assert.equal(inquiry.code, 'restaurant-closed');
    });

    it('routine action execution into restaurant does NOT bypass staff active state requirement', () => {
      const { state, player, devNpc } = setupWorld(WORK_SHIFT_TIME);

      // Restaurant is open, but NPC worker is idle
      devNpc.activityState = 'idle';

      // Execute routine action
      executeNpcRoutineAction(state, devNpc.id);
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

      // Position player at restaurant
      player.locationId = 'restaurant:development-restaurant';

      // Commercial inquiry MUST still fail because staff is idle
      const inquiry = inquireRestaurantService(state, player.id, devNpc.id);
      assert.equal(inquiry.success, false);
      assert.equal(inquiry.code, 'staff-not-active');
    });
  });

  // =========================================================================
  // G. Purity & Zero Side-Effects
  // =========================================================================
  describe('G. Purity & Zero Side-Effects', () => {
    it('evaluateNpcRoutineAction and deriveNpcRoutineAction produce ZERO state mutation', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const snapshotBefore = JSON.stringify(state);

      const evaluated = evaluateNpcRoutineAction(state, devNpc.id);
      assert.equal(evaluated.success, true);
      assert.equal(JSON.stringify(state), snapshotBefore);

      const derived = deriveNpcRoutineAction(state, devNpc.id);
      assert.ok(derived);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    it('returns frozen immutable action objects', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      const action = deriveNpcRoutineAction(state, devNpc.id);

      assert.ok(action);
      assert.ok(Object.isFrozen(action));
      assert.throws(() => {
        // @ts-expect-error mutating frozen object
        action.actionType = 'stay-at-home';
      }, /Cannot assign to read only property/);
    });
  });

  // =========================================================================
  // H. Offline Continuity & Multi-Hour Clock Leap
  // =========================================================================
  describe('H. Offline Continuity & Multi-Hour Leap', () => {
    it('correctly evaluates and executes after a 13-hour clock leap without intermediate simulation ticks', () => {
      // Start at morning 08:00
      const { clock, state, devNpc } = setupWorld(MORNING_REST_TIME);
      assert.equal(devNpc.locationId, 'building:development-residence');

      // Leap forward 13 hours to 21:00 (night resting)
      clock.advance(13 * 3600_000);
      state.worldTime = clock.getTime();

      // NPC is still at residence, action is stay-at-home
      const nightAction = deriveNpcRoutineAction(state, devNpc.id);
      assert.ok(nightAction);
      assert.equal(nightAction.actionType, 'stay-at-home');
      assert.equal(nightAction.targetLocationId, 'building:development-residence');
      assert.equal(nightAction.requiresMovement, false);

      const execResult = executeNpcRoutineAction(state, devNpc.id);
      assert.equal(execResult.success, true);
      assert.equal(execResult.code, 'already-at-destination');
      assert.equal(execResult.changed, false);
      assert.equal(devNpc.locationId, 'building:development-residence');
    });

    it('correctly transitions NPC from arbitrary previous location after a time jump', () => {
      const { clock, state, devNpc } = setupWorld(MORNING_REST_TIME);
      // Simulate NPC left at Avenida Juárez from previous session
      devNpc.locationId = 'street:avenida-juarez';

      // Leap to 09:30 (work shift)
      clock.advance(1 * 3600_000 + 30 * 60_000);
      state.worldTime = clock.getTime();

      const workAction = deriveNpcRoutineAction(state, devNpc.id);
      assert.ok(workAction);
      assert.equal(workAction.actionType, 'work-at-restaurant');
      assert.equal(workAction.requiresMovement, true);

      const execResult = executeNpcRoutineAction(state, devNpc.id);
      assert.equal(execResult.success, true);
      assert.equal(execResult.code, 'success');
      assert.equal(execResult.previousLocationId, 'street:avenida-juarez');
      assert.equal(execResult.currentLocationId, 'restaurant:development-restaurant');
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
    });
  });

  // =========================================================================
  // I. Context Inspection Integration
  // =========================================================================
  describe('I. Context Inspection Integration', () => {
    it('inspectNpcContext includes derived routineAction', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      devNpc.locationId = 'street:development-street';

      const context = inspectNpcContext(state, devNpc.id);
      assert.equal(context.success, true);
      assert.ok(context.routineAction);
      assert.equal(context.routineAction.actionType, 'work-at-restaurant');
      assert.equal(context.routineAction.targetLocationId, 'restaurant:development-restaurant');
      assert.equal(context.routineAction.requiresMovement, true);
    });
  });

  // =========================================================================
  // J. Schema Invariant & WorldState Preservation
  // =========================================================================
  describe('J. Schema Invariant & WorldState Preservation', () => {
    it('schema version remains strictly 18 with zero persistent routine action fields in WorldState', () => {
      const { state, devNpc } = setupWorld(WORK_SHIFT_TIME);
      executeNpcRoutineAction(state, devNpc.id);

      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      assert.equal(state.version, 19);

      // Verify no illegal persistent behavioral fields were added
      assert.equal((state as unknown as Record<string, unknown>).npcActions, undefined);
      assert.equal((state as unknown as Record<string, unknown>).npcBehavior, undefined);
      assert.equal((state as unknown as Record<string, unknown>).goals, undefined);
      assert.equal((state as unknown as Record<string, unknown>).plans, undefined);
      assert.equal((state as unknown as Record<string, unknown>).tasks, undefined);

      // Verify Agent entity does not persist routine actions
      const agentRecord = devNpc as unknown as Record<string, unknown>;
      assert.equal(agentRecord.routineAction, undefined);
      assert.equal(agentRecord.currentAction, undefined);
      assert.equal(agentRecord.goal, undefined);
      assert.equal(agentRecord.plan, undefined);

      // WorldState validates cleanly
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });
});
