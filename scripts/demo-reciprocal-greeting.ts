import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  greetAgent,
  transitionAgentLocation,
  snapshotWorldState,
  validateWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-reciprocal-greeting.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('================================================================');
console.log('MILESTONE 18-A: FIRST DETERMINISTIC NPC REACTION DEMONSTRATION');
console.log('================================================================\n');

// === STEP 1: Bootstrap World ===
console.log('=== STEP 1: Bootstrapping development world at 08:00:00 UTC ===');
const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
const state = createInitialWorldState(clock);
const sim = new Simulation(clock, state);

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

console.log(`World ID:           ${state.worldId}`);
console.log(`World Version:      ${state.version}`);
console.log(`Initial World Time: ${state.worldTime}`);
console.log(`Player Location:    ${player.locationId}`);
console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);

assert.equal(state.version, 13);
assert.equal(player.locationId, 'building:development-building');
assert.equal(npc.locationId, 'building:development-residence');
assert.equal(npc.activityState, 'idle');

// === STEP 2: Reciprocal Greeting at Residence (Idle NPC) ===
console.log('\n=== STEP 2: Player greets co-located idle NPC at residence ===');
transitionAgentLocation(state, 'agent:dev-player', 'building:development-residence');
const snapshotBeforeGreet1 = JSON.stringify(state);
const greet1 = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

console.log(`Greeting Success:   ${greet1.success}`);
console.log(`Greeting Code:      ${greet1.code}`);
console.log(`NPC Response:       "${greet1.response}"`);

assert.equal(greet1.success, true);
assert.equal(greet1.code, 'success');
assert.equal(greet1.response, "Hello. I'm resting at home right now.");
assert.equal(JSON.stringify(state), snapshotBeforeGreet1, 'Greeting must produce zero state mutation');

// === STEP 3: Advance to 09:00:00 UTC & Tick Simulation ===
console.log('\n=== STEP 3: Advancing to 09:00:00 UTC & ticking simulation (NPC canonical routine) ===');
clock.advance(60 * 60_000);
const tickResult = sim.tick();

console.log(`Current World Time: ${clock.getTime()}`);
console.log(`NPC New Location:   ${npc.locationId}`);
console.log(`NPC New State:      ${npc.activityState}`);

assert.equal(npc.locationId, 'restaurant:development-restaurant');
assert.equal(npc.activityState, 'active');
assert.equal(player.locationId, 'building:development-residence', 'Player location must remain unchanged');

// === STEP 4: Greet While Separated Fails ===
console.log('\n=== STEP 4: Player greets NPC while spatially separated ===');
const snapshotBeforeSeparated = JSON.stringify(state);
const separatedGreet = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

console.log(`Greeting Success:   ${separatedGreet.success}`);
console.log(`Greeting Code:      ${separatedGreet.code}`);
console.log(`NPC Response:       ${separatedGreet.response}`);

assert.equal(separatedGreet.success, false);
assert.equal(separatedGreet.code, 'agents-not-co-located');
assert.equal(separatedGreet.response, undefined);
assert.equal(JSON.stringify(state), snapshotBeforeSeparated, 'Failed greeting must produce zero state mutation');

// === STEP 5: Player Travels to Restaurant ===
console.log('\n=== STEP 5: Player enters restaurant to reunite with NPC ===');
transitionAgentLocation(state, 'agent:dev-player', 'building:development-building');
const enterResult = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(enterResult.success, true);
console.log(`Player Location:    ${player.locationId}`);
assert.equal(player.locationId, 'restaurant:development-restaurant');

// === STEP 6: Reciprocal Greeting at Restaurant (Active NPC) ===
console.log('\n=== STEP 6: Player greets co-located active NPC at restaurant ===');
const snapshotBeforeGreet2 = JSON.stringify(state);
const greet2 = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

console.log(`Greeting Success:   ${greet2.success}`);
console.log(`Greeting Code:      ${greet2.code}`);
console.log(`NPC Response:       "${greet2.response}"`);

assert.equal(greet2.success, true);
assert.equal(greet2.code, 'success');
assert.equal(greet2.response, "Welcome. I'm working here today.");
assert.equal(JSON.stringify(state), snapshotBeforeGreet2, 'Greeting must produce zero state mutation');

// === STEP 7: Determinism Check ===
console.log('\n=== STEP 7: Verifying deterministic repeatability (no conversation drift) ===');
const greet3 = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
console.log(`Repeated Response:  "${greet3.response}"`);
assert.equal(greet3.response, "Welcome. I'm working here today.");
assert.deepEqual(greet2, greet3);

// === STEP 8: Fallback Reaction Context ===
console.log('\n=== STEP 8: Verifying fallback reaction in generic co-location context (street) ===');
transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');
transitionAgentLocation(state, 'agent:dev-npc', 'street:development-street');
const streetGreet = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');

console.log(`Street Location:    ${player.locationId}`);
console.log(`Fallback Response:  "${streetGreet.response}"`);
assert.equal(streetGreet.success, true);
assert.equal(streetGreet.response, 'Hello there.');

// === STEP 9: Persistence Roundtrip & Schema Preservation ===
console.log('\n=== STEP 9: Persisting state and restoring in fresh runtime session ===');
const persistence = new LocalFilePersistence(demoPath);
persistence.save(snapshotWorldState(clock, state));
console.log('Saved snapshot to disk.');

const loadedState = persistence.load()!;
assert.ok(loadedState !== null);
assert.doesNotThrow(() => validateWorldState(loadedState));
console.log(`Restored Version:   ${loadedState.version}`);
assert.equal(loadedState.version, 13);

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 9 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
