import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  transitionAgentLocation,
  inspectCurrentLocation,
  greetAgent,
  introduceToAgent,
  isAgentAcquainted,
  leaveBuilding,
  enterBuilding,
  enterRestaurant,
  validateWorldState,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 25: FIRST PERSISTENT SOCIAL CONSEQUENCE DEMO');
console.log('(Minimal Dyadic Acquaintance)');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-demo-m25-social-acquaintance.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

try {
  // === STEP 1: Initialize World at 08:00 UTC ===
  console.log('=== STEP 1: Initialize world at 08:00:00 UTC ===');
  const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
  const state = createInitialWorldState(clock);
  validateWorldState(state);
  assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
  assert.equal(state.version, 13);

  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

  console.log(`World ID:         ${state.worldId}`);
  console.log(`Schema Version:   ${state.version}`);
  console.log(`World Time:       ${state.worldTime}`);
  console.log(`Player Location:  ${player.locationId}`);
  console.log(`NPC Location:     ${npc.locationId}`);
  console.log(`Acquaintances:    ${state.acquaintances.length} records`);

  assert.equal(state.acquaintances.length, 0);

  // === STEP 2: Transition NPC to Development Building for Co-location ===
  console.log('\n=== STEP 2: Transition NPC to Development Building for co-location ===');
  transitionAgentLocation(state, npc.id, 'building:development-building');
  console.log(`Player Location:  ${player.locationId}`);
  console.log(`NPC Location:     ${npc.locationId}`);
  assert.equal(player.locationId, npc.locationId);

  // === STEP 3: Inspect Location Before Acquaintance ===
  console.log('\n=== STEP 3: Inspect location before acquaintance (Perception Projection) ===');
  const inspectionBefore = inspectCurrentLocation(state, player.id);
  assert.equal(inspectionBefore.success, true);
  assert.ok(inspectionBefore.location);
  assert.ok(inspectionBefore.location.agents);

  const perceivedNpcBefore = inspectionBefore.location.agents.find((a) => a.id === npc.id);
  assert.ok(perceivedNpcBefore);
  console.log(`[PERCEPTION] Co-located Agent: ${perceivedNpcBefore.name} (${perceivedNpcBefore.id})`);
  console.log(`[PERCEPTION] isAcquainted:     ${perceivedNpcBefore.isAcquainted}`);

  const perceivedPlayerBefore = inspectionBefore.location.agents.find((a) => a.id === player.id);
  assert.ok(perceivedPlayerBefore);
  console.log(`[PERCEPTION] Player Self isAcquainted: ${perceivedPlayerBefore.isAcquainted}`);

  assert.equal(perceivedNpcBefore.isAcquainted, false);
  assert.equal(perceivedPlayerBefore.isAcquainted, undefined);
  assert.equal(isAgentAcquainted(state, player.id, npc.id), false);

  // === STEP 4: Initial Greeting Before Acquaintance (Baseline Response) ===
  console.log('\n=== STEP 4: Initial greeting before acquaintance (Baseline Response) ===');
  const snapshotBeforeGreeting = JSON.stringify(state);
  const greetingBefore = greetAgent(state, player.id, npc.id);
  assert.equal(greetingBefore.success, true);
  console.log(`[GREETING] Player: "Hello!"`);
  console.log(`[GREETING] NPC Response: "${greetingBefore.response}"`);
  assert.equal(greetingBefore.response, "Hello. I'm around the building today.");
  assert.equal(JSON.stringify(state), snapshotBeforeGreeting, 'Greeting must produce ZERO state mutation');

  // === STEP 5: Explicit Introduction (introduceToAgent) ===
  console.log('\n=== STEP 5: Introduce player to NPC via introduceToAgent() ===');
  console.log('--- AGENCY & PRECONDITION BOUNDARY ---');
  console.log('1. Greeting does NOT automatically establish acquaintance.');
  console.log('2. The player explicitly chooses to introduce themselves.');
  console.log('3. Validates player existence, NPC existence, valid spatial locations, and co-location.');

  const introResult = introduceToAgent(state, player.id, npc.id);
  assert.equal(introResult.success, true);
  assert.equal(introResult.code, 'success');
  assert.ok(introResult.acquaintance);

  console.log(`[ACTION] introduceToAgent executed: code = "${introResult.code}"`);
  console.log(`[SOCIAL STATE] Acquaintance ID:   ${introResult.acquaintance.id}`);
  console.log(`[SOCIAL STATE] Agent IDs:         [${introResult.acquaintance.agentIds.join(', ')}]`);
  console.log(`[SOCIAL STATE] Established At:    ${introResult.acquaintance.establishedAt}`);
  console.log(`[SOCIAL STATE] Total in World:    ${state.acquaintances.length} records`);

  assert.equal(introResult.acquaintance.id, 'acquaintance:agent:dev-npc:agent:dev-player');
  assert.deepEqual(introResult.acquaintance.agentIds, ['agent:dev-npc', 'agent:dev-player']);
  assert.equal(isAgentAcquainted(state, player.id, npc.id), true);
  assert.equal(isAgentAcquainted(state, npc.id, player.id), true);

  // === STEP 6: Inspect Location After Acquaintance ===
  console.log('\n=== STEP 6: Inspect location after acquaintance (Updated Perception) ===');
  const inspectionAfter = inspectCurrentLocation(state, player.id);
  assert.equal(inspectionAfter.success, true);

  const perceivedNpcAfter = inspectionAfter.location!.agents!.find((a) => a.id === npc.id);
  assert.ok(perceivedNpcAfter);
  console.log(`[PERCEPTION] Co-located Agent: ${perceivedNpcAfter.name} (${perceivedNpcAfter.id})`);
  console.log(`[PERCEPTION] isAcquainted:     ${perceivedNpcAfter.isAcquainted}`);
  assert.equal(perceivedNpcAfter.isAcquainted, true);

  // === STEP 7: Subsequent Greeting After Acquaintance (Recognized Response) ===
  console.log('\n=== STEP 7: Subsequent greeting after acquaintance (Recognized Response) ===');
  const snapshotBeforeGreeting2 = JSON.stringify(state);
  const greetingAfter = greetAgent(state, player.id, npc.id);
  assert.equal(greetingAfter.success, true);
  console.log(`[GREETING] Player: "Hello!"`);
  console.log(`[GREETING] NPC Response: "${greetingAfter.response}"`);
  assert.equal(greetingAfter.response, "Hello again. Good to see you around the building today.");
  assert.equal(JSON.stringify(state), snapshotBeforeGreeting2, 'Greeting must produce ZERO state mutation');

  // === STEP 8: Idempotent Introduction ===
  console.log('\n=== STEP 8: Demonstrate idempotent introduction ===');
  const snapshotBeforeIdempotent = JSON.stringify(state);
  const idempotentResult = introduceToAgent(state, player.id, npc.id);
  assert.equal(idempotentResult.success, true);
  assert.equal(idempotentResult.code, 'already-acquainted');
  console.log(`[ACTION] Re-introduction code:   "${idempotentResult.code}"`);
  console.log(`[ACTION] Existing Acquaintance:  ${idempotentResult.acquaintance?.id}`);
  assert.equal(JSON.stringify(state), snapshotBeforeIdempotent, 'Idempotent introduction produces ZERO state mutation');
  assert.equal(state.acquaintances.length, 1);

  // === STEP 9: Spatial Independence ===
  console.log('\n=== STEP 9: Demonstrate spatial independence of acquaintance ===');
  const leaveResult = leaveBuilding(state, player.id, 'building:development-building');
  assert.equal(leaveResult.success, true);
  console.log(`[MOVEMENT] Player left building to: ${player.locationId}`);
  console.log(`[SOCIAL STATE] Agents co-located?  ${player.locationId === npc.locationId}`);
  console.log(`[SOCIAL STATE] isAgentAcquainted?  ${isAgentAcquainted(state, player.id, npc.id)}`);
  assert.equal(isAgentAcquainted(state, player.id, npc.id), true);

  const enterResult = enterBuilding(state, player.id, 'building:development-building');
  assert.equal(enterResult.success, true);
  console.log(`[MOVEMENT] Player returned to:      ${player.locationId}`);
  const greetingSpatial = greetAgent(state, player.id, npc.id);
  assert.equal(greetingSpatial.success, true);
  console.log(`[GREETING] NPC Recognized Response: "${greetingSpatial.response}"`);
  assert.equal(greetingSpatial.response, "Hello again. Good to see you around the building today.");

  // === STEP 10: Temporal Independence Across Routine Shift ===
  console.log('\n=== STEP 10: Advance time to 09:00 UTC (Restaurant Shift) & verify temporal independence ===');
  const sim = new Simulation(clock, state);
  clock.advance(60 * 60_000); // 08:00 -> 09:00
  sim.tick();

  console.log(`World Time:         ${clock.getTime()}`);
  console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);
  assert.equal(npc.locationId, 'restaurant:development-restaurant');
  assert.equal(npc.activityState, 'active');

  // Player enters restaurant
  const enterRestResult = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
  assert.equal(enterRestResult.success, true);
  console.log(`[MOVEMENT] Player entered restaurant: ${player.locationId}`);

  // Greeting in work context
  const workGreeting = greetAgent(state, player.id, npc.id);
  assert.equal(workGreeting.success, true);
  console.log(`[GREETING] Player: "Hello!"`);
  console.log(`[GREETING] NPC Response (Recognized at Work): "${workGreeting.response}"`);
  assert.equal(
    workGreeting.response,
    "Welcome back. Good to see you again. I'm working here today."
  );

  // === STEP 11: Persistence Roundtrip & Session Restoration ===
  console.log('\n=== STEP 11: Disk persistence roundtrip (Session A -> Disk -> Session B) ===');
  const persistence = new LocalFilePersistence(demoPath);
  await persistence.save(state);
  console.log(`[PERSISTENCE] World state saved to: ${demoPath}`);
  assert.equal(existsSync(demoPath), true);

  const restoredState = await persistence.load();
  assert.ok(restoredState);
  validateWorldState(restoredState);

  console.log(`[RESTORED] World ID:       ${restoredState.worldId}`);
  console.log(`[RESTORED] Version:        ${restoredState.version}`);
  console.log(`[RESTORED] Acquaintances:  ${restoredState.acquaintances.length} records`);
  console.log(`[RESTORED] Acquaintance:   ${restoredState.acquaintances[0].id} (at ${restoredState.acquaintances[0].establishedAt})`);

  assert.equal(restoredState.version, 13);
  assert.equal(restoredState.acquaintances.length, 1);
  assert.equal(isAgentAcquainted(restoredState, player.id, npc.id), true);

  const restoredGreeting = greetAgent(restoredState, player.id, npc.id);
  assert.equal(restoredGreeting.success, true);
  console.log(`[RESTORED] Greeting in Session B: "${restoredGreeting.response}"`);
  assert.equal(
    restoredGreeting.response,
    "Welcome back. Good to see you again. I'm working here today."
  );

  console.log('\n================================================================');
  console.log('DEMO COMPLETE: All 11 steps executed and verified successfully.');
  console.log('================================================================');
} finally {
  if (existsSync(demoPath)) {
    unlinkSync(demoPath);
  }
}
