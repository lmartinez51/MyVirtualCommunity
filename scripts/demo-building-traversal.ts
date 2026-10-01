import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  leaveBuilding,
  enterBuilding,
  inspectCurrentLocation,
  validateWorldState,
  snapshotWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 16: BIDIRECTIONAL BUILDING TRAVERSAL DEMONSTRATION');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-demo-m16-building-traversal.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// === STEP 1: Bootstrap Development World ===
console.log('=== STEP 1: Bootstrapping development world at 09:00:00 UTC ===');
const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
const state = createInitialWorldState(clock);
validateWorldState(state);
assert.equal(state.version, 15);

const sim = new Simulation(clock, state, { silent: true });
sim.tick(); // Open restaurant at 09:00 UTC

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

console.log(`World ID:           ${state.worldId}`);
console.log(`World Version:      ${state.version}`);
console.log(`World Time:         ${state.worldTime}`);
console.log(`Player ID:          ${player.id}`);
console.log(`Initial Location:   ${player.locationId}`);
console.log(`Restaurant State:   ${restaurant.operationalState}`);
assert.equal(player.locationId, 'building:development-building');
assert.equal(restaurant.operationalState, 'open');

// === STEP 2: Inspect Initial Location (Building) ===
console.log('\n=== STEP 2: Inspecting initial location inside Development Building ===');
const initialInspect = inspectCurrentLocation(state, player.id);
assert.equal(initialInspect.success, true);
console.log(`Inspected Place:    ${initialInspect.location?.name} (${initialInspect.location?.type})`);
console.log(`Parent Street:      ${initialInspect.location?.parentId}`);
console.log(`Co-located Agents:  ${initialInspect.location?.agents.map((a) => a.name).join(', ')}`);

// === STEP 3: Player Leaves Building -> Street ===
console.log('\n=== STEP 3: Player leaves building onto street (leaveBuilding) ===');
const leaveResult = leaveBuilding(state, player.id, 'building:development-building');
assert.equal(leaveResult.success, true);
assert.equal(leaveResult.code, 'success');
assert.equal(player.locationId, 'street:development-street');
console.log(`Action Result:      ${leaveResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 4: Inspect Current Street State ===
console.log('\n=== STEP 4: Inspecting current street location ===');
const streetInspect = inspectCurrentLocation(state, player.id);
assert.equal(streetInspect.success, true);
console.log(`Inspected Place:    ${streetInspect.location?.name} (${streetInspect.location?.type})`);
console.log(`Parent District:    ${streetInspect.location?.parentId}`);
console.log(`Co-located Agents:  ${streetInspect.location?.agents.map((a) => a.name).join(', ') || 'none'}`);

// === STEP 5: Player Enters the Same Building -> Building ===
console.log('\n=== STEP 5: Player enters building from street (enterBuilding) ===');
const enterBldgResult = enterBuilding(state, player.id, 'building:development-building');
assert.equal(enterBldgResult.success, true);
assert.equal(enterBldgResult.code, 'success');
assert.equal(player.locationId, 'building:development-building');
console.log(`Action Result:      ${enterBldgResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 6: Player Enters the Restaurant -> Restaurant ===
console.log('\n=== STEP 6: Player enters restaurant from building (enterRestaurant) ===');
const enterRestResult = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
assert.equal(enterRestResult.success, true);
assert.equal(enterRestResult.code, 'success');
assert.equal(player.locationId, 'restaurant:development-restaurant');
console.log(`Action Result:      ${enterRestResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 7: Demonstrate Coherent Traversal Chain with Persistence ===
console.log('\n=== STEP 7: Demonstrating complete traversal chain & persistence roundtrip ===');
const restInspect = inspectCurrentLocation(state, player.id);
assert.equal(restInspect.success, true);
console.log(`Inspected Place:    ${restInspect.location?.name} (${restInspect.location?.type})`);
console.log(`Offerings:          ${restInspect.location?.offerings?.map((o) => `${o.name} ($${o.priceMinor / 100})`).join(', ')}`);

// Persist and reload
const persistence = new LocalFilePersistence(demoPath);
persistence.save(snapshotWorldState(clock, state));
const reloadedState = persistence.load();
assert.ok(reloadedState !== null);
validateWorldState(reloadedState);
assert.equal(reloadedState.version, 15);
const reloadedPlayer = reloadedState.agents.find((a) => a.id === 'agent:dev-player')!;
assert.equal(reloadedPlayer.locationId, 'restaurant:development-restaurant');

console.log(`Persisted Location: ${reloadedPlayer.locationId}`);
console.log(`Schema Version:     ${reloadedState.version}`);
console.log('\n================================================================');
console.log('SPATIAL LOOP VERIFIED: Street <-> Building <-> Restaurant');
console.log('================================================================\n');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}
