import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import {
  createRealWorldJuarezWorldState,
  leaveBuilding,
  enterBuilding,
  enterRestaurant,
  inspectCurrentLocation,
  snapshotWorldState,
  validateWorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('M38 — Real-World Spatial Foundation');
console.log('================================================================\n');

const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
const state = createRealWorldJuarezWorldState(clock);
validateWorldState(state);

const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;
const residence = state.places.find((p) => p.id === 'building:real-world-residence')!;
const street = state.places.find((p) => p.id === 'street:avenida-benito-juarez')!;
const venueBuilding = state.places.find((p) => p.id === 'building:kentucky-club-building')!;
const restaurant = state.restaurants.find((r) => r.id === 'restaurant:kentucky-club')!;

// 1. Initial State
console.log('Player starts at:');
console.log(`${residence.name} (${residence.id})\n`);
assert.equal(player.locationId, residence.id);

// 2. Leave home
console.log('Player leaves home.\n');
const leaveRes = leaveBuilding(state, player.id, residence.id);
assert.equal(leaveRes.success, true);
assert.equal(player.locationId, street.id);

// 3. Current Location & Affordances
console.log('Current location:');
console.log(`${street.name} (${street.id})\n`);

const streetInspect = inspectCurrentLocation(state, player.id);
assert.equal(streetInspect.success, true);
console.log('Accessible locations:');
for (const bldg of streetInspect.location?.accessibleBuildings ?? []) {
  console.log(`- ${bldg.name} (${bldg.id})`);
}
for (const str of streetInspect.location?.neighboringStreets ?? []) {
  console.log(`- Sibling Street: ${str.name} (${str.id})`);
}
console.log();

// 4. Enter destination building
console.log('Player enters:');
console.log(`${venueBuilding.name} (${venueBuilding.id})\n`);
const enterBldgRes = enterBuilding(state, player.id, venueBuilding.id);
assert.equal(enterBldgRes.success, true);
assert.equal(player.locationId, venueBuilding.id);

// 5. Enter restaurant
console.log('Player enters:');
console.log(`${restaurant.name} (${restaurant.id})\n`);
const enterRestRes = enterRestaurant(state, player.id, restaurant.id);
assert.equal(enterRestRes.success, true);
assert.equal(player.locationId, restaurant.id);

// 6. Final location
console.log('Final location:');
console.log(`${restaurant.name} (${restaurant.id})\n`);
assert.equal(player.locationId, restaurant.id);

// 7. Persistence & Reconstruction
const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-demo-m38-'));
const testFile = join(tmpDir, 'world-state.json');

try {
  const persistence = new LocalFilePersistence(testFile);
  persistence.save(snapshotWorldState(clock, state));
  assert.ok(existsSync(testFile));

  const restored = persistence.load();
  assert.ok(restored !== null);
  assert.equal(restored.version, 14);
  validateWorldState(restored);

  const restoredPlayer = restored.agents.find((a) => a.id === player.id)!;
  assert.equal(restoredPlayer.locationId, restaurant.id);

  console.log('Persistence reconstruction:');
  console.log('PASS\n');
} finally {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log('================================================================');
console.log('M38 DEMONSTRATION COMPLETE: ALL ASSERTIONS PASSED');
console.log('================================================================');
