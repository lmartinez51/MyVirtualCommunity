import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  enterBuilding,
  leaveBuilding,
  greetAgent,
  getSiteResident,
  interactAtResidence,
  evaluateResidentialAdmissionPolicy,
  CURRENT_WORLD_STATE_VERSION,
  getCanonicalAgentPair,
  getAcquaintanceId,
} from '../src/core/world-state.js';
import { isResidentialBuilding } from '../src/core/residential-access.js';

console.log('================================================================');
console.log('Milestone 59: Residential Interaction Contract Demo');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// Step 1: Bootstrapping & Association Verification
// ---------------------------------------------------------------------------
console.log('--- Step 1: Bootstrapping & Initial State Verification ---');
// 14:00 UTC = 08:00 Local Juarez Time (dev-npc schedule: at residence)
const START_TIME = '2026-09-14T14:00:00.000Z';
const clock = WorldClock.create(START_TIME);
const state = createInitialWorldState(clock);
validateWorldState(state);

console.log(`World State Schema Version: ${state.version}`);
assert.equal(state.version, 18);
assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);

const residentAssoc = getSiteResident(state, 'building:development-residence');
console.log(`Designated Resident of building:development-residence: ${residentAssoc?.agentId} (role: ${residentAssoc?.role})`);
assert.equal(residentAssoc?.agentId, 'agent:dev-npc');
assert.equal(residentAssoc?.role, 'resident');

const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`dev-npc current location: ${devNpc.locationId}`);
assert.equal(devNpc.locationId, 'building:development-residence');

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
// Leave building:development-building onto street
leaveBuilding(state, 'agent:dev-player', 'building:development-building');
assert.equal(player.locationId, 'street:development-street');
console.log(`Player location: ${player.locationId}`);
console.log('');

// ---------------------------------------------------------------------------
// Step 2: Direct Entry Prohibition (enterBuilding on Residence)
// ---------------------------------------------------------------------------
console.log('--- Step 2: Direct Entry Prohibition ---');
console.log('Attempting direct enterBuilding() on residential building:development-residence...');
const directResult = enterBuilding(state, player.id, 'building:development-residence');
console.log(`Direct entry result: success=${directResult.success}, code=${directResult.code}`);
console.log(`Message: "${directResult.message}"`);
assert.equal(directResult.success, false);
assert.equal(directResult.code, 'residential-interaction-required');
assert.equal(player.locationId, 'street:development-street');
console.log('  -> VERIFIED: Direct entry is prohibited. Residential interaction required.\n');

// ---------------------------------------------------------------------------
// Step 3: Stranger Interaction Rejection (Resident at home, but Stranger)
// ---------------------------------------------------------------------------
console.log('--- Step 3: Stranger Interaction Rejection ---');
console.log('Player knocks at residence while resident is home, but player is a stranger...');
const strangerResult = interactAtResidence(state, player.id, 'building:development-residence');
console.log(`Interaction result: success=${strangerResult.success}, code=${strangerResult.code}`);
console.log(`Message: "${strangerResult.message}"`);
assert.equal(strangerResult.success, false);
assert.equal(strangerResult.code, 'resident-declined-stranger');
assert.equal(strangerResult.isAdmitted, false);
assert.equal(player.locationId, 'street:development-street');
console.log('  -> VERIFIED: Resident declined stranger. Zero spatial mutation.\n');

// ---------------------------------------------------------------------------
// Step 4: Establishing Acquaintance
// ---------------------------------------------------------------------------
console.log('--- Step 4: Establishing Acquaintance ---');
console.log('Establishing acquaintance between player and resident...');
const [first, second] = getCanonicalAgentPair(player.id, devNpc.id);
state.acquaintances.push({
  id: getAcquaintanceId(first, second),
  agentIds: [first, second],
  establishedAt: state.worldTime,
});
console.log('  -> Acquaintance registered.\n');

// ---------------------------------------------------------------------------
// Step 5: Acquainted Interaction & Admission (Resident at Home)
// ---------------------------------------------------------------------------
console.log('--- Step 5: Acquainted Interaction & Admission ---');
console.log('Player knocks at residence while resident is home and acquainted...');
const admittedResult = interactAtResidence(state, player.id, 'building:development-residence');
console.log(`Interaction result: success=${admittedResult.success}, code=${admittedResult.code}`);
console.log(`Message: "${admittedResult.message}"`);
assert.equal(admittedResult.success, true);
assert.equal(admittedResult.code, 'success');
assert.equal(admittedResult.isAdmitted, true);
assert.equal(admittedResult.previousLocationId, 'street:development-street');
assert.equal(admittedResult.currentLocationId, 'building:development-residence');
assert.equal(player.locationId, 'building:development-residence');
console.log('  -> VERIFIED: Resident admitted acquainted player. Spatial authority updated location.\n');

// ---------------------------------------------------------------------------
// Step 6: Co-Located Interaction Inside Residence
// ---------------------------------------------------------------------------
console.log('--- Step 6: Co-Located Social Interaction Inside Residence ---');
console.log('Player greets resident inside residence...');
const greetResult = greetAgent(state, player.id, devNpc.id);
console.log(`Greet result: success=${greetResult.success}, code=${greetResult.code}`);
console.log(`Resident response: "${greetResult.response}"`);
assert.equal(greetResult.success, true);
assert.equal(greetResult.code, 'success');
console.log('  -> VERIFIED: Co-located greeting succeeds inside residence.\n');

// ---------------------------------------------------------------------------
// Step 7: Resident Away (Absence Rejection)
// ---------------------------------------------------------------------------
console.log('--- Step 7: Resident Away Rejection ---');
// Return player to street
leaveBuilding(state, player.id, 'building:development-residence');
assert.equal(player.locationId, 'street:development-street');

// Advance clock to 09:00 AM local (NPC work shift)
clock.advance(3600_000); // +1 hour
const sim = new Simulation(clock, state, { silent: true });
sim.tick();

console.log(`Clock advanced to 09:00 AM local. dev-npc location: ${devNpc.locationId}`);
assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

console.log('Player knocks at residence while resident is away at work...');
const absentResult = interactAtResidence(state, player.id, 'building:development-residence');
console.log(`Interaction result: success=${absentResult.success}, code=${absentResult.code}`);
console.log(`Message: "${absentResult.message}"`);
assert.equal(absentResult.success, false);
assert.equal(absentResult.code, 'resident-not-home');
assert.equal(absentResult.isAdmitted, false);
assert.equal(player.locationId, 'street:development-street');
console.log('  -> VERIFIED: Knocker denied entry when resident is away.\n');

// ---------------------------------------------------------------------------
// Step 8: Schema Invariant & Domain Boundaries
// ---------------------------------------------------------------------------
console.log('--- Step 8: Invariant Verification ---');
console.log(`World State Schema Version: ${state.version}`);
assert.equal(state.version, 18);
assert.doesNotThrow(() => validateWorldState(state));
console.log('  -> Schema version 18 preserved. Zero migrations, zero schema changes.');

console.log('\n================================================================');
console.log('Milestone 59 Demo Completed Successfully!');
console.log('================================================================');
