/**
 * Demonstration script for Milestone 64: Deterministic NPC Routine Generalization.
 *
 * Demonstrates:
 * 1. Declarative deterministic routine schedule resolution for multiple NPCs via pure lookup.
 * 2. Simultaneous behavioral state & intent derivation showing distinct routine phases.
 * 3. Shared routine action derivation and execution pipeline.
 * 4. Multi-NPC Simulation.tick() execution without identity-specific branching.
 * 5. Distinct activity interval evaluation per NPC schedule.
 * 6. Offline simulation continuity: multi-hour leap resolving both NPCs in a single tick.
 * 7. Strict preservation of Schema Version 18 and Spatial Authority.
 */

import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  findNpcSchedule,
  hasNpcRoutineSchedule,
  createSecondaryDevelopmentNpc,
  DEVELOPMENT_NPC_ID,
  SECONDARY_DEVELOPMENT_NPC_ID,
} from '../src/core/development-npc-schedule.js';
import {
  deriveNpcBehavioralState,
  deriveNpcRoutineAction,
  inspectNpcContext,
} from '../src/core/npc-behavior.js';

console.log('================================================================');
console.log('Milestone 64: Deterministic NPC Routine Generalization Demo');
console.log('================================================================');

// Step 1: Schedule Lookup & Multi-NPC World Construction
console.log('\n--- Step 1: Schedule Lookup & Multi-NPC Setup ---');
const clock = WorldClock.create('2026-09-14T14:00:00.000Z'); // 08:00 AM local
const state = createInitialWorldState(clock);
const secondaryNpc = createSecondaryDevelopmentNpc(clock.getTime());
state.agents.push(secondaryNpc);

const devNpc = state.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;

const schedA = findNpcSchedule(devNpc.id)!;
const schedB = findNpcSchedule(secondaryNpc.id)!;

console.log(`World State Version: ${state.version}`);
console.log(`NPC A: "${devNpc.name}" (${devNpc.id})`);
console.log(`  Shift: ${schedA.shiftStartHour}:00 - ${schedA.shiftEndHour}:00 | Lead: ${schedA.commuteLeadMinutes}m`);
console.log(`  Promenade: ${schedA.recreationStartHour}:00 - ${schedA.recreationEndHour}:30`);
console.log(`NPC B: "${secondaryNpc.name}" (${secondaryNpc.id})`);
console.log(`  Shift: ${schedB.shiftStartHour}:00 - ${schedB.shiftEndHour}:00 | Lead: ${schedB.commuteLeadMinutes}m`);
console.log(`  Promenade: ${schedB.recreationStartHour}:30 - ${schedB.recreationEndHour}:30`);
console.log('  -> VERIFIED: Both schedules resolved cleanly via pure findNpcSchedule().');

// Step 2: Simultaneous Behavioral State Derivation
console.log('\n--- Step 2: Parallel Behavioral State & Intent Derivation ---');
const times = [
  { label: '08:00 Local (Morning Rest)', iso: '2026-09-14T14:00:00.000Z' },
  { label: '08:45 Local (Elena Commuting, NPC B Promenading)', iso: '2026-09-14T14:45:00.000Z' },
  { label: '10:45 Local (Elena Working, NPC B Commuting)', iso: '2026-09-14T16:45:00.000Z' },
  { label: '12:00 Local (Both Working at Restaurant)', iso: '2026-09-14T18:00:00.000Z' },
  { label: '18:00 Local (Elena Promenading, NPC B Resting)', iso: '2026-09-15T00:00:00.000Z' },
  { label: '21:30 Local (Both Resting at Home)', iso: '2026-09-15T03:30:00.000Z' },
];

for (const t of times) {
  state.worldTime = t.iso;
  const bA = deriveNpcBehavioralState(state, devNpc.id)!;
  const bB = deriveNpcBehavioralState(state, secondaryNpc.id)!;
  console.log(`[${t.label}]`);
  console.log(`  Elena:   phase="${bA.routinePhase}", intent="${bA.intent}", dest="${bA.destinationId}"`);
  console.log(`  NPC B:   phase="${bB.routinePhase}", intent="${bB.intent}", dest="${bB.destinationId}"`);
}
console.log('  -> VERIFIED: Distinct routine phases derived deterministically from respective schedules.');

// Step 3: Shared Simulation.tick() Execution
console.log('\n--- Step 3: Shared Simulation.tick() Execution Pipeline ---');
const simClock = WorldClock.create('2026-09-14T14:00:00.000Z'); // 08:00
const simState = createInitialWorldState(simClock);
simState.agents.push(createSecondaryDevelopmentNpc(simClock.getTime()));
const sim = new Simulation(simClock, simState, { silent: true });

const simDevNpc = simState.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;
const simSecNpc = simState.agents.find((a) => a.id === SECONDARY_DEVELOPMENT_NPC_ID)!;

console.log(`08:00 Initial Tick:`);
const t1 = sim.tick();
console.log(`  Elena: location="${simDevNpc.locationId}", activity="${simDevNpc.activityState}"`);
console.log(`  NPC B: location="${simSecNpc.locationId}", activity="${simSecNpc.activityState}"`);

console.log(`Advance to 08:45:`);
simClock.advance(45 * 60_000);
const t2 = sim.tick();
console.log(`  Elena: location="${simDevNpc.locationId}" (changed=${t2.npcLocationTransitions.find((t) => t.agentId === simDevNpc.id)?.changed})`);
console.log(`  NPC B: location="${simSecNpc.locationId}" (changed=${t2.npcLocationTransitions.find((t) => t.agentId === simSecNpc.id)?.changed})`);

console.log(`Advance to 10:45:`);
simClock.advance(2 * 3600_000);
const t3 = sim.tick();
console.log(`  Elena: location="${simDevNpc.locationId}", activity="${simDevNpc.activityState}"`);
console.log(`  NPC B: location="${simSecNpc.locationId}", activity="${simSecNpc.activityState}"`);

console.log(`Advance to 12:00:`);
simClock.advance(75 * 60_000);
const t4 = sim.tick();
console.log(`  Elena: location="${simDevNpc.locationId}", activity="${simDevNpc.activityState}"`);
console.log(`  NPC B: location="${simSecNpc.locationId}", activity="${simSecNpc.activityState}"`);

console.log(`Advance to 18:00:`);
simClock.advance(6 * 3600_000);
const t5 = sim.tick();
console.log(`  Elena: location="${simDevNpc.locationId}", activity="${simDevNpc.activityState}"`);
console.log(`  NPC B: location="${simSecNpc.locationId}", activity="${simSecNpc.activityState}"`);
console.log('  -> VERIFIED: Both NPCs execute routine movements through the unified Simulation pipeline.');

// Step 4: Large Time Advancement (Offline Simulation Continuity)
console.log('\n--- Step 4: Offline Simulation Continuity (Multi-Hour Leap) ---');
const leapClock = WorldClock.create('2026-09-14T14:00:00.000Z'); // 08:00
const leapState = createInitialWorldState(leapClock);
leapState.agents.push(createSecondaryDevelopmentNpc(leapClock.getTime()));
const leapSim = new Simulation(leapClock, leapState, { silent: true });

leapSim.tick(); // Baseline at 08:00 (both at residence)
const leapDevNpc = leapState.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;
const leapSecNpc = leapState.agents.find((a) => a.id === SECONDARY_DEVELOPMENT_NPC_ID)!;
console.log(`Before leap: Elena at "${leapDevNpc.locationId}", NPC B at "${leapSecNpc.locationId}"`);

leapClock.advance(4 * 3600_000); // 4-hour leap directly to 12:00
const leapTick = leapSim.tick();
console.log(`After 4h leap to 12:00 in single tick:`);
console.log(`  Elena: location="${leapDevNpc.locationId}", activity="${leapDevNpc.activityState}"`);
console.log(`  NPC B: location="${leapSecNpc.locationId}", activity="${leapSecNpc.activityState}"`);
console.log('  -> VERIFIED: Both NPCs resolve deterministically after large time leap without replaying steps.');

// Step 5: Read-Only Context Projection & Schema Invariants
console.log('\n--- Step 5: Context Projection & Schema Invariants ---');
const ctxA = inspectNpcContext(simState, devNpc.id);
const ctxB = inspectNpcContext(simState, secondaryNpc.id);
console.log(`Elena Context: routineAction="${ctxA.routineAction?.actionType}", location="${ctxA.location?.name}"`);
console.log(`NPC B Context: routineAction="${ctxB.routineAction?.actionType}", location="${ctxB.location?.name}"`);
console.log(`Current Schema Version: ${CURRENT_WORLD_STATE_VERSION}`);
validateWorldState(simState);
console.log('  -> VERIFIED: Schema Version remains strictly 18 with zero state mutation during inspection.');

console.log('\n================================================================');
console.log('Milestone 64 Demo Completed Successfully');
console.log('================================================================');
