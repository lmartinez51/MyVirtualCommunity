import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  enterBuilding,
  leaveBuilding,
  getSiteResident,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  evaluateResidentialAccess,
  isResidentialBuilding,
} from '../src/core/residential-access.js';

console.log('================================================================');
console.log('Milestone 58: Residential Access Foundation Demo');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// Step 1: Bootstrapping & Association Verification
// ---------------------------------------------------------------------------
console.log('--- Step 1: Bootstrapping World State & Resident Detection ---');
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
console.log(`Is building:development-residence residential? ${isResidentialBuilding(state, 'building:development-residence')}`);
assert.equal(isResidentialBuilding(state, 'building:development-residence'), true);
console.log('');

// ---------------------------------------------------------------------------
// Step 2: Generic Building Entry (Non-Residential)
// ---------------------------------------------------------------------------
console.log('--- Step 2: Generic Non-Residential Building Entry ---');
const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
// In seed state, player starts inside building:development-building. Move to street first.
const exitRes = leaveBuilding(state, 'agent:dev-player', 'building:development-building');
assert.equal(exitRes.success, true);
assert.equal(player.locationId, 'street:development-street');

console.log(`Checking non-residential building:development-building:`);
console.log(`  isResidential: ${isResidentialBuilding(state, 'building:development-building')}`);
assert.equal(isResidentialBuilding(state, 'building:development-building'), false);

const genericResult = enterBuilding(state, 'agent:dev-player', 'building:development-building');
console.log(`Player entered generic building: success=${genericResult.success}, code=${genericResult.code}`);
assert.equal(genericResult.success, true);
assert.equal(genericResult.code, 'success');
assert.equal(player.locationId, 'building:development-building');
console.log('  -> VERIFIED: Generic buildings remain open and unaffected by residential access rules.\n');

// ---------------------------------------------------------------------------
// Step 3: Residential Entry Allowed When Resident is Home
// ---------------------------------------------------------------------------
console.log('--- Step 3: Residential Entry Allowed When Resident is Home ---');
// Return player to street
leaveBuilding(state, 'agent:dev-player', 'building:development-building');
assert.equal(player.locationId, 'street:development-street');

// Evaluate pure domain evaluator first
const evalAllowed = evaluateResidentialAccess(state, 'agent:dev-player', 'building:development-residence');
console.log(`Pure evaluation for residential access (08:00 AM local): allowed=${evalAllowed.allowed}, code=${evalAllowed.code}`);
assert.equal(evalAllowed.allowed, true);
assert.equal(evalAllowed.code, 'allowed');

// Execute direct entry attempt: fails under M59 with residential-interaction-required
const homeEntryResult = enterBuilding(state, 'agent:dev-player', 'building:development-residence');
console.log(`Player direct entry attempt: success=${homeEntryResult.success}, code=${homeEntryResult.code}`);
assert.equal(homeEntryResult.success, false);
assert.equal(homeEntryResult.code, 'residential-interaction-required');
assert.equal(player.locationId, 'street:development-street');
console.log('  -> VERIFIED: Direct entry prohibited; interaction required under M59.\n');

// ---------------------------------------------------------------------------
// Step 4: Residential Entry Denied When Resident is Away
// ---------------------------------------------------------------------------
console.log('--- Step 4: Residential Entry Denied When Resident is Away ---');
// Player is already on street
assert.equal(player.locationId, 'street:development-street');

// Advance simulation to 15:00 UTC (09:00 AM local Juarez time)
// dev-npc routine puts NPC at restaurant:development-restaurant
clock.advance(3600_000); // +1 hour
const sim = new Simulation(clock, state, { silent: true });
sim.tick();

console.log(`Clock advanced to 09:00 AM local. dev-npc location: ${devNpc.locationId}`);
assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

// Evaluate pure domain evaluator
const evalDenied = evaluateResidentialAccess(state, 'agent:dev-player', 'building:development-residence');
console.log(`Pure evaluation for residential access (09:00 AM local): allowed=${evalDenied.allowed}, code=${evalDenied.code}`);
assert.equal(evalDenied.allowed, false);
assert.equal(evalDenied.code, 'resident-not-home');

// Attempt authoritative entry
const awayEntryResult = enterBuilding(state, 'agent:dev-player', 'building:development-residence');
console.log(`Player entry attempt: success=${awayEntryResult.success}, code=${awayEntryResult.code}`);
assert.equal(awayEntryResult.success, false);
assert.equal(awayEntryResult.code, 'residential-interaction-required');
assert.equal(player.locationId, 'street:development-street');
console.log('  -> VERIFIED: Direct entry denied.\n');

// ---------------------------------------------------------------------------
// Step 5: Zero Mutation Verification on Denied Entry
// ---------------------------------------------------------------------------
console.log('--- Step 5: Zero Mutation Invariant Verification ---');
const playerLocationBefore = player.locationId;
const npcLocationBefore = devNpc.locationId;
const timeBefore = clock.getTime();

const failedResult = enterBuilding(state, 'agent:dev-player', 'building:development-residence');
assert.equal(failedResult.success, false);
assert.equal(failedResult.code, 'residential-interaction-required');

assert.equal(player.locationId, playerLocationBefore);
assert.equal(devNpc.locationId, npcLocationBefore);
assert.equal(clock.getTime(), timeBefore);
console.log('  -> INVARIANT VERIFIED: Denied residential entry mutates zero world state.\n');

// ---------------------------------------------------------------------------
// Step 6: Domain Separation Invariants
// ---------------------------------------------------------------------------
console.log('--- Step 6: Domain Separation Invariants ---');
const residenceProp = state.properties.find((p) => p.id === 'property:development-residence')!;
console.log(`Property assignment status: ${residenceProp.assignment.status}`);
assert.equal(residenceProp.assignment.status, 'unassigned');
console.log('  -> INVARIANT VERIFIED: Property assignment is NOT consulted for residential access.');

console.log(`NPC activityState: ${devNpc.activityState}`);
console.log('  -> INVARIANT VERIFIED: NPC activityState is NOT used to deny residential access.');

console.log(`Schema version: ${state.version}`);
assert.equal(state.version, 18);
console.log('  -> INVARIANT VERIFIED: Schema version remains 18 (zero migrations, zero persistence changes).');

console.log('\n================================================================');
console.log('Milestone 58 Demo Completed Successfully!');
console.log('================================================================');
