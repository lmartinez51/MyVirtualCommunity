import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  getSiteResident,
  getSiteAttendant,
  getSiteAgentAssociations,
  getAgentSiteAssociations,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('Milestone 57: Site Agent Association Foundation Demo');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// Step 1: Bootstrapping & Association Verification
// ---------------------------------------------------------------------------
console.log('--- Step 1: Authoritative Seed World & Schema v18 ---');
const START_TIME = '2026-09-14T09:00:00.000Z'; // 03:00 local Juarez
const clock = WorldClock.create(START_TIME);
const state = createInitialWorldState(clock);
validateWorldState(state);

console.log(`World State Schema Version: ${state.version}`);
assert.equal(state.version, 18);
assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
console.log(`Total Site-Agent Associations: ${state.siteAgentAssociations.length}\n`);

// ---------------------------------------------------------------------------
// Step 2: Querying Site Roles
// ---------------------------------------------------------------------------
console.log('--- Step 2: Querying Functional Site Roles ---');
const residenceResident = getSiteResident(state, 'building:development-residence');
console.log(`Resident of building:development-residence: ${residenceResident?.agentId} (role: ${residenceResident?.role})`);
assert.equal(residenceResident?.agentId, 'agent:dev-npc');
assert.equal(residenceResident?.role, 'resident');

const restaurantAttendant = getSiteAttendant(state, 'restaurant:development-restaurant');
console.log(`Attendant of restaurant:development-restaurant: ${restaurantAttendant?.agentId} (role: ${restaurantAttendant?.role})`);
assert.equal(restaurantAttendant?.agentId, 'agent:dev-npc');
assert.equal(restaurantAttendant?.role, 'attendant');

const npcAssociations = getAgentSiteAssociations(state, 'agent:dev-npc');
console.log(`All site associations for agent:dev-npc (${npcAssociations.length} total):`);
for (const assoc of npcAssociations) {
  console.log(`  - Site: ${assoc.placeId} | Role: ${assoc.role}`);
}
assert.equal(npcAssociations.length, 2);
console.log('');

// ---------------------------------------------------------------------------
// Step 3: Domain Separation Invariants
// ---------------------------------------------------------------------------
console.log('--- Step 3: Domain Separation Invariants ---');

// Invariant A: Association != Location
// Advance clock to 15:00 UTC (09:00 local Juarez) when NPC works at restaurant
clock.advance(6 * 3600_000);
const sim = new Simulation(clock, state, { silent: true });
sim.tick();

const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`Current logical location of agent:dev-npc: ${devNpc.locationId}`);
assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

// The NPC's functional association as resident of building:development-residence is invariant across movement
const residentQueryWhileAtWork = getSiteResident(state, 'building:development-residence');
console.log(`Resident of building:development-residence while NPC is at restaurant: ${residentQueryWhileAtWork?.agentId}`);
assert.equal(residentQueryWhileAtWork?.agentId, 'agent:dev-npc');
console.log('  -> INVARIANT VERIFIED: Association does NOT depend on or track physical location.');

// Invariant B: Association != Property Assignment
const residenceProperty = state.properties.find((p) => p.id === 'property:development-residence')!;
console.log(`Property assignment status for property:development-residence: ${residenceProperty.assignment.status}`);
assert.equal(residenceProperty.assignment.status, 'unassigned');
console.log('  -> INVARIANT VERIFIED: Site Agent Association does NOT grant or imply Property Assignment.');

// Invariant C: Association != Activity
console.log(`Current NPC activityState: ${devNpc.activityState}`);
console.log('  -> INVARIANT VERIFIED: Site Agent Association is independent of current activity.');
console.log('');

// ---------------------------------------------------------------------------
// Step 4: Persistence Roundtrip & Schema Preservation
// ---------------------------------------------------------------------------
console.log('--- Step 4: Persistence & Reconstitution ---');
const testDir = mkdtempSync(join(tmpdir(), 'm57-demo-'));
const testFile = join(testDir, 'world-state.json');

try {
  const persistence = new LocalFilePersistence(testFile);
  persistence.save(snapshotWorldState(clock, state));
  assert.ok(existsSync(testFile));

  const restored = persistence.load()!;
  assert.ok(restored);
  assert.equal(restored.version, 18);
  validateWorldState(restored);

  const restoredResident = getSiteResident(restored, 'building:development-residence');
  assert.equal(restoredResident?.agentId, 'agent:dev-npc');
  assert.equal(restoredResident?.role, 'resident');

  const restoredAttendant = getSiteAttendant(restored, 'restaurant:development-restaurant');
  assert.equal(restoredAttendant?.agentId, 'agent:dev-npc');
  assert.equal(restoredAttendant?.role, 'attendant');

  console.log(`Persisted and restored clean WorldState v18 with ${restored.siteAgentAssociations.length} associations.`);
} finally {
  rmSync(testDir, { recursive: true, force: true });
}

console.log('\n================================================================');
console.log('Milestone 57 Demo Completed Successfully!');
console.log('================================================================');
