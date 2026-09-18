import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  leaveBuilding,
  enterBuilding,
  enterRestaurant,
  traverseToStreet,
  inspectCurrentLocation,
  validateWorldState,
  snapshotWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 21-A: LOCAL SPATIAL AFFORDANCE PERCEPTION DEMO');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-demo-m21-spatial-perception.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// === STEP 1: Bootstrap Development World at 09:00 UTC ===
console.log('=== STEP 1: Bootstrapping development world at 09:00:00 UTC ===');
const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
const state = createInitialWorldState(clock);
validateWorldState(state);
assert.equal(state.version, 12);

const sim = new Simulation(clock, state, { silent: true });
sim.tick(); // Restaurant opens at 09:00

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
console.log(`World ID:           ${state.worldId}`);
console.log(`World Version:      ${state.version}`);
console.log(`World Time:         ${state.worldTime}`);
console.log(`Player ID:          ${player.id}`);
console.log(`Initial Location:   ${player.locationId}`);
assert.equal(player.locationId, 'building:development-building');

// === STEP 2: Inspect Building A (Development Building) ===
console.log('\n=== STEP 2: Inspecting Building A (Development Building) ===');
const buildingAInspect = inspectCurrentLocation(state, player.id);
assert.equal(buildingAInspect.success, true);
assert.ok(buildingAInspect.location);
console.log(`Current Place:      ${buildingAInspect.location.name} (${buildingAInspect.location.type})`);
console.log(`Parent Street:      ${buildingAInspect.location.parentStreet?.name} [${buildingAInspect.location.parentStreet?.id}]`);
console.log(`Contained Rest.:    ${buildingAInspect.location.containedRestaurants?.map((r) => r.name).join(', ') || 'none'}`);

assert.equal(buildingAInspect.location.parentStreet?.id, 'street:development-street');
assert.equal(buildingAInspect.location.containedRestaurants?.length, 1);
assert.equal(buildingAInspect.location.containedRestaurants?.[0].id, 'restaurant:development-restaurant');
assert.equal(buildingAInspect.location.accessibleBuildings, undefined);
assert.equal(buildingAInspect.location.neighboringStreets, undefined);

// === STEP 3: Player Leaves Building A -> Street A ===
console.log('\n=== STEP 3: Player leaves building onto Street A (Development Street) ===');
const leaveResult = leaveBuilding(state, player.id, 'building:development-building');
assert.equal(leaveResult.success, true);
assert.equal(player.locationId, 'street:development-street');
console.log(`Action Result:      ${leaveResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 4: Inspect Street A Affordances ===
console.log('\n=== STEP 4: Inspecting Street A affordances (Development Street) ===');
const streetAInspect = inspectCurrentLocation(state, player.id);
assert.equal(streetAInspect.success, true);
assert.ok(streetAInspect.location);
console.log(`Current Street:     ${streetAInspect.location.name} (${streetAInspect.location.type})`);
console.log(`Accessible Bldgs:   ${streetAInspect.location.accessibleBuildings?.map((b) => `${b.name} [${b.id}]`).join(', ')}`);
console.log(`Neighboring Streets:${streetAInspect.location.neighboringStreets?.map((s) => `${s.name} [${s.id}]`).join(', ')}`);

assert.equal(streetAInspect.location.accessibleBuildings?.length, 2);
assert.equal(streetAInspect.location.neighboringStreets?.length, 1);
assert.equal(streetAInspect.location.neighboringStreets?.[0].id, 'street:avenida-juarez');
assert.equal(streetAInspect.location.parentStreet, undefined);
assert.equal(streetAInspect.location.containedRestaurants, undefined);

// === STEP 5: Closed-Loop Traversal to Sibling Street (Avenida Juárez) ===
console.log('\n=== STEP 5: Closed-loop traversal to perceived sibling street ===');
const perceivedTargetStreet = streetAInspect.location.neighboringStreets![0];
console.log(`Traversing to:      ${perceivedTargetStreet.name} (${perceivedTargetStreet.id})`);
const traverseResult = traverseToStreet(state, player.id, perceivedTargetStreet.id);
assert.equal(traverseResult.success, true);
assert.equal(player.locationId, 'street:avenida-juarez');
console.log(`Action Result:      ${traverseResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 6: Inspect Street B Affordances (Avenida Juárez) ===
console.log('\n=== STEP 6: Inspecting Street B affordances (Avenida Juárez) ===');
const streetBInspect = inspectCurrentLocation(state, player.id);
assert.equal(streetBInspect.success, true);
assert.ok(streetBInspect.location);
console.log(`Current Street:     ${streetBInspect.location.name} (${streetBInspect.location.type})`);
console.log(`Accessible Bldgs:   ${streetBInspect.location.accessibleBuildings?.map((b) => `${b.name} [${b.id}]`).join(', ')}`);
console.log(`Neighboring Streets:${streetBInspect.location.neighboringStreets?.map((s) => `${s.name} [${s.id}]`).join(', ')}`);

assert.equal(streetBInspect.location.accessibleBuildings?.length, 1);
assert.equal(streetBInspect.location.accessibleBuildings?.[0].id, 'building:avenida-juarez-kiosk');
assert.equal(streetBInspect.location.neighboringStreets?.length, 1);
assert.equal(streetBInspect.location.neighboringStreets?.[0].id, 'street:development-street');

// === STEP 7: Closed-Loop Entry to Perceived Building (Kiosk) ===
console.log('\n=== STEP 7: Closed-loop entry to perceived building (Avenida Juárez Kiosk) ===');
const perceivedBuilding = streetBInspect.location.accessibleBuildings![0];
console.log(`Entering Building:  ${perceivedBuilding.name} (${perceivedBuilding.id})`);
const enterKioskResult = enterBuilding(state, player.id, perceivedBuilding.id);
assert.equal(enterKioskResult.success, true);
assert.equal(player.locationId, 'building:avenida-juarez-kiosk');
console.log(`Action Result:      ${enterKioskResult.message}`);
console.log(`Current Location:   ${player.locationId}`);

// === STEP 8: Inspect Building B Affordances (Avenida Juárez Kiosk) ===
console.log('\n=== STEP 8: Inspecting Building B affordances (Avenida Juárez Kiosk) ===');
const kioskInspect = inspectCurrentLocation(state, player.id);
assert.equal(kioskInspect.success, true);
assert.ok(kioskInspect.location);
console.log(`Current Place:      ${kioskInspect.location.name} (${kioskInspect.location.type})`);
console.log(`Parent Street:      ${kioskInspect.location.parentStreet?.name} [${kioskInspect.location.parentStreet?.id}]`);
console.log(`Contained Rest.:    ${kioskInspect.location.containedRestaurants?.map((r) => r.name).join(', ') || 'none'}`);

assert.equal(kioskInspect.location.parentStreet?.id, 'street:avenida-juarez');
assert.deepEqual(kioskInspect.location.containedRestaurants, []);
assert.equal(kioskInspect.location.accessibleBuildings, undefined);
assert.equal(kioskInspect.location.neighboringStreets, undefined);

// === STEP 9: Return to Restaurant & Inspect Parent Building Affordance ===
console.log('\n=== STEP 9: Return trip to Development Restaurant & parent building affordance ===');
leaveBuilding(state, player.id, 'building:avenida-juarez-kiosk');
traverseToStreet(state, player.id, 'street:development-street');
enterBuilding(state, player.id, 'building:development-building');
enterRestaurant(state, player.id, 'restaurant:development-restaurant');
assert.equal(player.locationId, 'restaurant:development-restaurant');

const restInspect = inspectCurrentLocation(state, player.id);
assert.equal(restInspect.success, true);
assert.ok(restInspect.location);
console.log(`Current Place:      ${restInspect.location.name} (${restInspect.location.type})`);
console.log(`Parent Building:    ${restInspect.location.parentBuilding?.name} [${restInspect.location.parentBuilding?.id}]`);
console.log(`Offerings:          ${restInspect.location.offerings?.map((o) => o.name).join(', ')}`);

assert.equal(restInspect.location.parentBuilding?.id, 'building:development-building');
assert.equal(restInspect.location.accessibleBuildings, undefined);
assert.equal(restInspect.location.neighboringStreets, undefined);
assert.equal(restInspect.location.parentStreet, undefined);
assert.equal(restInspect.location.containedRestaurants, undefined);

// === STEP 10: Persistence Roundtrip under Schema Version 10 ===
console.log('\n=== STEP 10: Demonstrating persistence roundtrip under Schema Version 10 ===');
const persistence = new LocalFilePersistence(demoPath);
const snapshot = snapshotWorldState(clock, state);
persistence.save(snapshot);
console.log(`Saved world state snapshot to ${demoPath}`);

const restored = persistence.load();
assert.ok(restored !== null);
validateWorldState(restored);
assert.equal(restored.version, 12);

const restoredInspect = inspectCurrentLocation(restored, player.id);
assert.equal(restoredInspect.success, true);
assert.equal(restoredInspect.location?.parentBuilding?.id, 'building:development-building');
console.log(`Restored World ID:  ${restored.worldId}`);
console.log(`Restored Version:   ${restored.version}`);
console.log(`Restored Perception:${restoredInspect.location?.name} inside ${restoredInspect.location?.parentBuilding?.name}`);

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('MILESTONE 21-A DEMONSTRATION COMPLETE: ALL ASSERTIONS PASSED');
console.log('================================================================');
