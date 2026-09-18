import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  exitRestaurant,
  leaveBuilding,
  enterBuilding,
  traverseToStreet,
  inspectCurrentLocation,
  validateWorldState,
  snapshotWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 20-A: INTRA-NEIGHBORHOOD STREET TRAVERSAL DEMONSTRATION');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-demo-m20-street-traversal.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// === STEP 1: Bootstrap Development World ===
console.log('=== STEP 1: Bootstrapping development world at 09:00:00 UTC ===');
const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
const state = createInitialWorldState(clock);
validateWorldState(state);
assert.equal(state.version, 12);
assert.equal(state.places.length, 8);

const sim = new Simulation(clock, state, { silent: true });
sim.tick(); // Open restaurant at 09:00 UTC

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

console.log(`World ID:           ${state.worldId}`);
console.log(`World Version:      ${state.version}`);
console.log(`Total Places:       ${state.places.length}`);
console.log(`World Time:         ${state.worldTime}`);
console.log(`Player ID:          ${player.id}`);
console.log(`Initial Location:   ${player.locationId}`);
console.log(`Restaurant State:   ${restaurant.operationalState}`);
assert.equal(player.locationId, 'building:development-building');
assert.equal(restaurant.operationalState, 'open');

// === STEP 2: Player Enters Restaurant ===
console.log('\n=== STEP 2: Player enters restaurant from building (enterRestaurant) ===');
const enterRestResult = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
assert.equal(enterRestResult.success, true);
assert.equal(player.locationId, 'restaurant:development-restaurant');
console.log(`Action Result:      ${enterRestResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 3: Player Exits Restaurant to Building ===
console.log('\n=== STEP 3: Player exits restaurant to building (exitRestaurant) ===');
const exitRestResult = exitRestaurant(state, player.id, 'restaurant:development-restaurant');
assert.equal(exitRestResult.success, true);
assert.equal(player.locationId, 'building:development-building');
console.log(`Action Result:      ${exitRestResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 4: Player Leaves Building to Street ===
console.log('\n=== STEP 4: Player leaves building to street (leaveBuilding) ===');
const leaveBldgResult = leaveBuilding(state, player.id, 'building:development-building');
assert.equal(leaveBldgResult.success, true);
assert.equal(player.locationId, 'street:development-street');
console.log(`Action Result:      ${leaveBldgResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 5: Player Enters Second Building on Same Street ===
console.log('\n=== STEP 5: Player enters second building on same street (enterBuilding) ===');
const enterResidenceResult = enterBuilding(state, player.id, 'building:development-residence');
assert.equal(enterResidenceResult.success, true);
assert.equal(player.locationId, 'building:development-residence');
console.log(`Action Result:      ${enterResidenceResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 6: Player Leaves Second Building back to Street ===
console.log('\n=== STEP 6: Player leaves residence to street (leaveBuilding) ===');
const leaveResidenceResult = leaveBuilding(state, player.id, 'building:development-residence');
assert.equal(leaveResidenceResult.success, true);
assert.equal(player.locationId, 'street:development-street');
console.log(`Action Result:      ${leaveResidenceResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 7: Player Traverses to Sibling Street (Avenida Juárez) ===
console.log('\n=== STEP 7: Player traverses to sibling street (traverseToStreet) ===');
const traverseResult = traverseToStreet(state, player.id, 'street:avenida-juarez');
assert.equal(traverseResult.success, true);
assert.equal(traverseResult.code, 'success');
assert.equal(traverseResult.originStreetId, 'street:development-street');
assert.equal(traverseResult.targetStreetId, 'street:avenida-juarez');
assert.equal(traverseResult.neighborhoodId, 'neighborhood:development-neighborhood');
assert.equal(player.locationId, 'street:avenida-juarez');
console.log(`Action Result:      ${traverseResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 8: Inspect Current Location on Avenida Juárez ===
console.log('\n=== STEP 8: Inspecting current location on Avenida Juárez (inspectCurrentLocation) ===');
const streetInspect = inspectCurrentLocation(state, player.id);
assert.equal(streetInspect.success, true);
assert.ok(streetInspect.location);
console.log(`Inspected Place:    ${streetInspect.location.name} (${streetInspect.location.type})`);
console.log(`Parent Neighborhood: ${streetInspect.location.parentId}`);
console.log(`Co-located Agents:  ${streetInspect.location.agents.map((a) => a.name).join(', ') || 'none'}`);
assert.equal(streetInspect.location.name, 'Avenida Juárez');
assert.equal(streetInspect.location.type, 'street');
assert.equal(streetInspect.location.parentId, 'neighborhood:development-neighborhood');

// === STEP 9: Player Enters Building on Avenida Juárez ===
console.log('\n=== STEP 9: Player enters kiosk on Avenida Juárez (enterBuilding) ===');
const enterKioskResult = enterBuilding(state, player.id, 'building:avenida-juarez-kiosk');
assert.equal(enterKioskResult.success, true);
assert.equal(player.locationId, 'building:avenida-juarez-kiosk');
console.log(`Action Result:      ${enterKioskResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 10: Player Leaves Kiosk back to Avenida Juárez ===
console.log('\n=== STEP 10: Player leaves kiosk back to Avenida Juárez (leaveBuilding) ===');
const leaveKioskResult = leaveBuilding(state, player.id, 'building:avenida-juarez-kiosk');
assert.equal(leaveKioskResult.success, true);
assert.equal(player.locationId, 'street:avenida-juarez');
console.log(`Action Result:      ${leaveKioskResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 11: Player Traverses Back to Development Street ===
console.log('\n=== STEP 11: Player traverses back to Development Street (traverseToStreet) ===');
const returnTraverseResult = traverseToStreet(state, player.id, 'street:development-street');
assert.equal(returnTraverseResult.success, true);
assert.equal(player.locationId, 'street:development-street');
console.log(`Action Result:      ${returnTraverseResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 12: Player Re-enters Development Building and Restaurant ===
console.log('\n=== STEP 12: Player re-enters Development Building & Restaurant ===');
const reenterBldgResult = enterBuilding(state, player.id, 'building:development-building');
assert.equal(reenterBldgResult.success, true);
assert.equal(player.locationId, 'building:development-building');

const reenterRestResult = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
assert.equal(reenterRestResult.success, true);
assert.equal(player.locationId, 'restaurant:development-restaurant');
console.log(`Current Location:   ${player.locationId}`);

// === STEP 13: Persistence Roundtrip under Schema Version 10 ===
console.log('\n=== STEP 13: Demonstrating persistence roundtrip under Schema Version 10 ===');
const persistence = new LocalFilePersistence(demoPath);
const snapshot = snapshotWorldState(clock, state);
persistence.save(snapshot);
console.log(`Saved world state snapshot to ${demoPath}`);

const restoredState = persistence.load();
assert.ok(restoredState !== null);
validateWorldState(restoredState);
assert.equal(restoredState.version, 12);
assert.equal(restoredState.places.length, 8);

const restoredPlayer = restoredState.agents.find((a) => a.id === 'agent:dev-player')!;
assert.equal(restoredPlayer.locationId, 'restaurant:development-restaurant');
console.log(`Restored World ID:  ${restoredState.worldId}`);
console.log(`Restored Version:   ${restoredState.version}`);
console.log(`Restored Places:    ${restoredState.places.length}`);
console.log(`Restored Player Loc:${restoredPlayer.locationId}`);

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('MILESTONE 20-A DEMONSTRATION COMPLETE: ALL ASSERTIONS PASSED');
console.log('================================================================');
