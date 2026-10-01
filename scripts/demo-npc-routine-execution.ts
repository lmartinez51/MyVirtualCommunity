import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  transitionRestaurantOperationalState,
  inquireRestaurantService,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  evaluateNpcBehavioralState,
  evaluateNpcRoutineAction,
  deriveNpcRoutineAction,
  executeNpcRoutineAction,
  inspectNpcContext,
} from '../src/core/npc-behavior.js';

console.log('================================================================');
console.log('Milestone 62: NPC Routine Action Execution Foundation Demo');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// Step 1: Bootstrapping & Schema Invariant Verification
// ---------------------------------------------------------------------------
console.log('--- Step 1: Bootstrapping & Schema Invariant Verification ---');
const MORNING_REST_TIME = '2026-09-14T14:00:00.000Z'; // 08:00 AM Local Juarez Time
const clock = WorldClock.create(MORNING_REST_TIME);
const state = createInitialWorldState(clock);
const sim = new Simulation(clock, state, { silent: true });
sim.tick();
validateWorldState(state);

console.log(`World State Schema Version: ${state.version}`);
assert.equal(state.version, 18);
assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

console.log(`Player ID: ${player.id} (Location: ${player.locationId})`);
console.log(`NPC ID: ${devNpc.id} (${devNpc.name}, Location: ${devNpc.locationId})`);
console.log('  -> VERIFIED: World initialized cleanly at Schema Version 18.\n');

// ---------------------------------------------------------------------------
// Step 2: Deriving M62 Routine Actions across Schedule Phases
// ---------------------------------------------------------------------------
console.log('--- Step 2: Deriving M62 Routine Actions across Schedule Phases ---');

const phaseCheckpoints = [
  {
    label: 'Morning Rest',
    iso: '2026-09-14T14:00:00.000Z', // 08:00 Local
    expectedPhase: 'resting',
    expectedAction: 'stay-at-home',
    expectedTarget: 'building:development-residence',
  },
  {
    label: 'Morning Commute',
    iso: '2026-09-14T14:45:00.000Z', // 08:45 Local
    expectedPhase: 'commuting',
    expectedAction: 'commute-to-work',
    expectedTarget: 'street:development-street',
  },
  {
    label: 'Work Shift',
    iso: '2026-09-14T15:30:00.000Z', // 09:30 Local
    expectedPhase: 'working',
    expectedAction: 'work-at-restaurant',
    expectedTarget: 'restaurant:development-restaurant',
  },
  {
    label: 'Evening Promenade',
    iso: '2026-09-15T00:00:00.000Z', // 18:00 Local
    expectedPhase: 'promenading',
    expectedAction: 'walk-neighborhood',
    expectedTarget: 'street:avenida-juarez',
  },
  {
    label: 'Night Rest',
    iso: '2026-09-15T03:00:00.000Z', // 21:00 Local
    expectedPhase: 'resting',
    expectedAction: 'stay-at-home',
    expectedTarget: 'building:development-residence',
  },
] as const;

for (const cp of phaseCheckpoints) {
  state.worldTime = cp.iso;
  const evalResult = evaluateNpcRoutineAction(state, devNpc.id);
  assert.equal(evalResult.success, true);
  if (!evalResult.success) continue;

  const a = evalResult.routineAction;
  console.log(`[${cp.label}] (${cp.iso})`);
  console.log(`  Phase:           ${a.routinePhase}`);
  console.log(`  Routine Action:  ${a.actionType}`);
  console.log(`  Target Location: ${a.targetLocationId}`);
  console.log(`  Description:     ${a.description}`);

  assert.equal(a.routinePhase, cp.expectedPhase);
  assert.equal(a.actionType, cp.expectedAction);
  assert.equal(a.targetLocationId, cp.expectedTarget);
}
console.log('  -> VERIFIED: All 5 phases produce exact deterministic routine actions.\n');

// ---------------------------------------------------------------------------
// Step 3: Full Causal Chain & Topological Movement Execution
// ---------------------------------------------------------------------------
console.log('--- Step 3: Full Causal Chain & Topological Movement Execution ---');
console.log('Topological Cycle: residence -> street -> restaurant -> av-juarez -> residence\n');

// 1. Initial location: residence (08:00)
state.worldTime = '2026-09-14T14:00:00.000Z';
devNpc.locationId = 'building:development-residence';
console.log(`08:00 Initial Location: ${devNpc.locationId}`);

const step1 = executeNpcRoutineAction(state, devNpc.id);
console.log(`  Execute: ${step1.code} (changed: ${step1.changed})`);
assert.equal(step1.code, 'already-at-destination');
assert.equal(step1.changed, false);
assert.equal(devNpc.locationId, 'building:development-residence');

// 2. Advance time to 08:45 (commute to work)
state.worldTime = '2026-09-14T14:45:00.000Z';
const b2 = evaluateNpcBehavioralState(state, devNpc.id);
const a2 = deriveNpcRoutineAction(state, devNpc.id)!;
console.log(`\n08:45 Time Advance -> Derived Phase: ${b2.success ? b2.behavioralState.routinePhase : 'none'}`);
console.log(`  Derived Action:   ${a2.actionType} -> Target: ${a2.targetLocationId}`);
console.log(`  RequiresMovement: ${a2.requiresMovement}`);

const step2 = executeNpcRoutineAction(state, devNpc.id);
console.log(`  Execution Result: ${step2.code} (changed: ${step2.changed})`);
console.log(`  Spatial Transition: ${step2.previousLocationId} -> ${step2.currentLocationId}`);
assert.equal(step2.code, 'success');
assert.equal(step2.changed, true);
assert.equal(devNpc.locationId, 'street:development-street');

// 3. Advance time to 09:30 (work at restaurant)
state.worldTime = '2026-09-14T15:30:00.000Z';
const a3 = deriveNpcRoutineAction(state, devNpc.id)!;
console.log(`\n09:30 Time Advance -> Derived Action: ${a3.actionType} -> Target: ${a3.targetLocationId}`);
const step3 = executeNpcRoutineAction(state, devNpc.id);
console.log(`  Execution Result: ${step3.code} (changed: ${step3.changed})`);
console.log(`  Spatial Transition: ${step3.previousLocationId} -> ${step3.currentLocationId}`);
assert.equal(step3.code, 'success');
assert.equal(step3.changed, true);
assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

// 4. Advance time to 18:00 (evening promenade)
state.worldTime = '2026-09-15T00:00:00.000Z';
const a4 = deriveNpcRoutineAction(state, devNpc.id)!;
console.log(`\n18:00 Time Advance -> Derived Action: ${a4.actionType} -> Target: ${a4.targetLocationId}`);
const step4 = executeNpcRoutineAction(state, devNpc.id);
console.log(`  Execution Result: ${step4.code} (changed: ${step4.changed})`);
console.log(`  Spatial Transition: ${step4.previousLocationId} -> ${step4.currentLocationId}`);
assert.equal(step4.code, 'success');
assert.equal(step4.changed, true);
assert.equal(devNpc.locationId, 'street:avenida-juarez');

// 5. Advance time to 21:00 (night rest)
state.worldTime = '2026-09-15T03:00:00.000Z';
const a5 = deriveNpcRoutineAction(state, devNpc.id)!;
console.log(`\n21:00 Time Advance -> Derived Action: ${a5.actionType} -> Target: ${a5.targetLocationId}`);
const step5 = executeNpcRoutineAction(state, devNpc.id);
console.log(`  Execution Result: ${step5.code} (changed: ${step5.changed})`);
console.log(`  Spatial Transition: ${step5.previousLocationId} -> ${step5.currentLocationId}`);
assert.equal(step5.code, 'success');
assert.equal(step5.changed, true);
assert.equal(devNpc.locationId, 'building:development-residence');

console.log('  -> VERIFIED: Full topological cycle executed deterministically.\n');

// ---------------------------------------------------------------------------
// Step 4: Business Authority Preservation
// ---------------------------------------------------------------------------
console.log('--- Step 4: Business Authority Preservation ---');
// Return to work shift time
state.worldTime = '2026-09-14T15:30:00.000Z';
executeNpcRoutineAction(state, devNpc.id);
assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

// Force restaurant closed via Business Authority
transitionRestaurantOperationalState(
  state,
  'restaurant:development-restaurant',
  'closed',
  state.worldTime
);
console.log('Restaurant manually set to: closed');

// Move player to restaurant to attempt commercial service
player.locationId = 'restaurant:development-restaurant';
const inquiry = inquireRestaurantService(state, player.id, devNpc.id);
console.log(`inquireRestaurantService result: success=${inquiry.success}, code="${inquiry.code}"`);
assert.equal(inquiry.success, false);
assert.equal(inquiry.code, 'restaurant-closed');
console.log('  -> VERIFIED: Routine presence does NOT bypass Business Authority.\n');

// ---------------------------------------------------------------------------
// Step 5: Offline Continuity Leap
// ---------------------------------------------------------------------------
console.log('--- Step 5: Offline Continuity Leap ---');
// Leap 13 hours forward from 08:00 to 21:00
devNpc.locationId = 'building:development-residence';
state.worldTime = '2026-09-14T14:00:00.000Z';

// Jump directly to 21:00
state.worldTime = '2026-09-15T03:00:00.000Z';
const leapAction = deriveNpcRoutineAction(state, devNpc.id)!;
console.log(`After 13-hour leap without ticks:`);
console.log(`  Derived Action: ${leapAction.actionType}`);
console.log(`  Target:         ${leapAction.targetLocationId}`);
console.log(`  Requires Move:  ${leapAction.requiresMovement}`);
assert.equal(leapAction.actionType, 'stay-at-home');
assert.equal(leapAction.requiresMovement, false);
console.log('  -> VERIFIED: Offline leap supported without replaying steps.\n');

// ---------------------------------------------------------------------------
// Step 6: Context Projection Integration & Zero Persistence
// ---------------------------------------------------------------------------
console.log('--- Step 6: Context Projection Integration & Zero Persistence ---');
const context = inspectNpcContext(state, devNpc.id);
assert.equal(context.success, true);
assert.ok(context.routineAction);
console.log(`inspectNpcContext routineAction: ${context.routineAction.actionType}`);
assert.equal(context.routineAction.actionType, 'stay-at-home');

validateWorldState(state);
assert.equal(state.version, 18);
console.log(`World State Validated: Version ${state.version}`);
console.log('  -> VERIFIED: Zero persistence of routine actions, schema version strictly 18.\n');

console.log('================================================================');
console.log('Milestone 62 Demo Completed Successfully');
console.log('================================================================');
