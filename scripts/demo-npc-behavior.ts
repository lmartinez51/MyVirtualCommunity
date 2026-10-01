import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  greetAgent,
  introduceToAgent,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  evaluateNpcBehavioralState,
  deriveNpcBehavioralState,
  inspectNpcContext,
} from '../src/core/npc-behavior.js';

console.log('================================================================');
console.log('Milestone 61: NPC Behavioral State & Intent Foundation Demo');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// Step 1: Bootstrapping & World Verification
// ---------------------------------------------------------------------------
console.log('--- Step 1: Bootstrapping & Schema Invariant Verification ---');
// 14:00 UTC = 08:00 AM Local Juarez Time
const MORNING_REST_TIME = '2026-09-14T14:00:00.000Z';
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
// Step 2: Deriving the 5 Deterministic Routine Phases
// ---------------------------------------------------------------------------
console.log('--- Step 2: Deriving 5 Deterministic Routine Phases ---');

const phaseCheckpoints = [
  {
    label: 'Morning Rest',
    iso: '2026-09-14T14:00:00.000Z', // 08:00 Local
    expectedPhase: 'resting',
    expectedIntent: 'rest_at_home',
    expectedDest: 'building:development-residence',
  },
  {
    label: 'Morning Commute',
    iso: '2026-09-14T14:45:00.000Z', // 08:45 Local
    expectedPhase: 'commuting',
    expectedIntent: 'commute_to_work',
    expectedDest: 'restaurant:development-restaurant',
  },
  {
    label: 'Work Shift',
    iso: '2026-09-14T15:30:00.000Z', // 09:30 Local
    expectedPhase: 'working',
    expectedIntent: 'perform_work_shift',
    expectedDest: 'restaurant:development-restaurant',
  },
  {
    label: 'Evening Promenade',
    iso: '2026-09-15T00:00:00.000Z', // 18:00 Local
    expectedPhase: 'promenading',
    expectedIntent: 'walk_neighborhood',
    expectedDest: 'street:avenida-juarez',
  },
  {
    label: 'Night Rest',
    iso: '2026-09-15T03:00:00.000Z', // 21:00 Local
    expectedPhase: 'resting',
    expectedIntent: 'rest_at_home',
    expectedDest: 'building:development-residence',
  },
] as const;

for (const cp of phaseCheckpoints) {
  state.worldTime = cp.iso;
  const evalResult = evaluateNpcBehavioralState(state, devNpc.id);
  assert.equal(evalResult.success, true);
  if (!evalResult.success) continue;

  const b = evalResult.behavioralState;
  console.log(`[${cp.label}] (${cp.iso})`);
  console.log(`  Phase:       ${b.routinePhase}`);
  console.log(`  Intent:      ${b.intent}`);
  console.log(`  Destination: ${b.destinationId}`);
  console.log(`  Activity:    ${b.activity}`);

  assert.equal(b.routinePhase, cp.expectedPhase);
  assert.equal(b.intent, cp.expectedIntent);
  assert.equal(b.destinationId, cp.expectedDest);
}
console.log('  -> VERIFIED: All 5 routine phases derive deterministically from world time & schedule.\n');

// ---------------------------------------------------------------------------
// Step 3: Pure Read-Only NPC Context Projection (inspectNpcContext)
// ---------------------------------------------------------------------------
console.log('--- Step 3: Inspect NPC Context Projection Boundary ---');
// Advance clock to Work Shift time (09:30 Local = 15:30 UTC, +90 minutes from 14:00 UTC)
clock.advance(90 * 60 * 1000);
sim.tick();

const context = inspectNpcContext(state, devNpc.id);
assert.equal(context.success, true);
console.log(`Context inspection code: ${context.code}`);
console.log(`Context message: ${context.message}`);

console.log('Observed Agent Identity:');
console.log(`  ID:            ${context.agent?.id}`);
console.log(`  Name:          ${context.agent?.name}`);
console.log(`  Agent Type:    ${context.agent?.agentType}`);
console.log(`  ActivityState: ${context.agent?.activityState}`);

console.log('Observed Location:');
console.log(`  ID:   ${context.location?.id}`);
console.log(`  Name: ${context.location?.name}`);
console.log(`  Type: ${context.location?.type}`);

console.log('Derived Behavioral State:');
console.log(`  Routine Phase: ${context.behavioralState?.routinePhase}`);
console.log(`  Intent:        ${context.behavioralState?.intent}`);
console.log(`  Destination:   ${context.behavioralState?.destinationId}`);
console.log(`  Activity:      ${context.behavioralState?.activity}`);

console.log('Temporal Context:');
console.log(`  Time Zone:  ${context.temporalContext?.timeZone}`);
console.log(`  Civil Time: ${context.temporalContext?.civilTime.hour}:${String(context.temporalContext?.civilTime.minute).padStart(2, '0')}`);
console.log(`  Period:     ${context.temporalContext?.periodOfDay}`);

console.log(`Site Associations Count: ${context.siteAssociations?.length}`);
for (const assoc of context.siteAssociations || []) {
  console.log(`  - Role: ${assoc.role} at ${assoc.placeId}`);
}

assert.equal(context.behavioralState?.routinePhase, 'working');
assert.equal(context.behavioralState?.intent, 'perform_work_shift');
assert.ok(context.siteAssociations?.some((a) => a.role === 'attendant' && a.placeId === 'restaurant:development-restaurant'));
console.log('  -> VERIFIED: Read-only context projection provides complete situational boundary.\n');

// ---------------------------------------------------------------------------
// Step 4: Social Dialogue Grounded in Routine Phase
// ---------------------------------------------------------------------------
console.log('--- Step 4: Social Dialogue Grounded in Routine Phase ---');

// Move player to restaurant where NPC is during work shift
player.locationId = devNpc.locationId;
const workGreet = greetAgent(state, player.id, devNpc.id);
console.log(`Unacquainted Work Greeting: "${workGreet.response}"`);
assert.equal(workGreet.response, "Welcome. I'm working here today.");

introduceToAgent(state, player.id, devNpc.id);
const workGreetAcq = greetAgent(state, player.id, devNpc.id);
console.log(`Acquainted Work Greeting:   "${workGreetAcq.response}"`);
assert.equal(workGreetAcq.response, "Welcome back. Good to see you again. I'm working here today.");

// Evening promenade check (+8.5 hours from 15:30 UTC -> 00:00 UTC = 18:00 Local)
clock.advance((8 * 60 + 30) * 60 * 1000);
sim.tick();
player.locationId = devNpc.locationId;
const promenadeGreet = greetAgent(state, player.id, devNpc.id);
console.log(`Acquainted Promenade Greeting: "${promenadeGreet.response}"`);
assert.equal(promenadeGreet.response, "Good evening again. It's pleasant to walk down Avenida Juárez after work.");
console.log('  -> VERIFIED: greetAgent() dynamically grounds responses in derived routine phases.\n');

// ---------------------------------------------------------------------------
// Step 5: Verification of Purity & Zero Persistent State
// ---------------------------------------------------------------------------
console.log('--- Step 5: Purity & Zero Persistence Invariants ---');
const rawState = state as Record<string, unknown>;
assert.equal(rawState.npcBehavior, undefined);
assert.equal(rawState.npcIntents, undefined);
assert.equal(rawState.goals, undefined);
assert.equal(rawState.plans, undefined);
assert.equal(rawState.tasks, undefined);

const rawNpc = devNpc as Record<string, unknown>;
assert.equal(rawNpc.routinePhase, undefined);
assert.equal(rawNpc.intent, undefined);
assert.equal(rawNpc.destinationId, undefined);
assert.equal(rawNpc.behavioralState, undefined);

validateWorldState(state);
assert.equal(state.version, 18);
console.log('  -> VERIFIED: Zero behavioral fields persisted into WorldState.');
console.log('  -> VERIFIED: WorldState version remains strictly 18.');
console.log('\n================================================================');
console.log('Milestone 61 Demo Complete: All Invariants Verified!');
console.log('================================================================');
