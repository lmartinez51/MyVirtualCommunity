import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  exitRestaurant,
  traverseToStreet,
  purchaseOffering,
  startHavingCoffee,
  inspectCurrentLocation,
  greetAgent,
  validateWorldState,
  snapshotWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 22: MULTI-PHASE DETERMINISTIC NPC ROUTINE DEMO');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-demo-m22-npc-neighborhood-routine.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// === STEP 1: Bootstrap Development World at 08:00:00 UTC ===
console.log('=== STEP 1: Bootstrapping development world at 08:00:00 UTC ===');
const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
const state = createInitialWorldState(clock);
validateWorldState(state);
assert.equal(state.version, 13);

const sim = new Simulation(clock, state);

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

console.log(`World ID:           ${state.worldId}`);
console.log(`World Version:      ${state.version}`);
console.log(`Initial World Time: ${state.worldTime}`);
console.log(`Player Location:    ${player.locationId}`);
console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);
console.log(`Restaurant Status:  ${restaurant.operationalState}`);

assert.equal(player.locationId, 'building:development-building');
assert.equal(npc.locationId, 'building:development-residence');
assert.equal(npc.activityState, 'idle');
assert.equal(restaurant.operationalState, 'closed');
assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), false);

// === STEP 2: Player Visits Residence at 08:00:00 UTC and Greets Resting NPC ===
console.log('\n=== STEP 2: Player visits residence at 08:00:00 UTC & encounters resting NPC ===');
// Player leaves building to street, then enters residence
const leaveResult = leaveBuilding(state, player.id, 'building:development-building');
assert.equal(leaveResult.success, true);
const enterResidenceResult = enterBuilding(state, player.id, 'building:development-residence');
assert.equal(enterResidenceResult.success, true);
assert.equal(player.locationId, 'building:development-residence');

const residenceInspect = inspectCurrentLocation(state, player.id);
assert.equal(residenceInspect.success, true);
console.log(`Place Inspected:    ${residenceInspect.location?.name} (${residenceInspect.location?.type})`);
console.log(`Observed Agents:    ${residenceInspect.location?.agents.map((a) => `${a.name} (${a.agentType})`).join(', ')}`);
assert.equal(residenceInspect.location?.agents.some((a) => a.id === npc.id), true);

const morningRestGreet = greetAgent(state, player.id, npc.id);
console.log(`Greeting Result:    ${morningRestGreet.message} (code: ${morningRestGreet.code})`);
console.log(`NPC Response:       ${morningRestGreet.response}`);
assert.equal(morningRestGreet.success, true);
assert.equal(morningRestGreet.code, 'success');
assert.equal(morningRestGreet.response, "Hello. I'm resting at home right now.");

// === STEP 3: Advance to 08:30:00 UTC — Morning Commute on Development Street ===
console.log('\n=== STEP 3: Advancing to 08:30:00 UTC (Morning Commute) & ticking simulation ===');
const initialActivitySince = npc.activitySince;
clock.advance(30 * 60_000);
const tick0830 = sim.tick();

console.log(`Current World Time: ${clock.getTime()}`);
console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);

const transition0830 = tick0830.npcLocationTransitions?.find((t) => t.agentId === npc.id);
assert.ok(transition0830);
assert.equal(transition0830.changed, true);
assert.equal(transition0830.previousLocationId, 'building:development-residence');
assert.equal(transition0830.newLocationId, 'street:development-street');
assert.equal(npc.locationId, 'street:development-street');
assert.equal(npc.activityState, 'idle');
// activitySince must not change on pure spatial relocation
assert.equal(npc.activitySince, initialActivitySince);

// Player leaves residence onto Development Street
leaveBuilding(state, player.id, 'building:development-residence');
assert.equal(player.locationId, 'street:development-street');

const streetInspect = inspectCurrentLocation(state, player.id);
console.log(`Place Inspected:    ${streetInspect.location?.name} (${streetInspect.location?.type})`);
console.log(`Observed Agents:    ${streetInspect.location?.agents.map((a) => `${a.name} (${a.agentType})`).join(', ')}`);
assert.equal(streetInspect.location?.agents.some((a) => a.id === npc.id), true);

const commuteGreet = greetAgent(state, player.id, npc.id);
console.log(`Greeting Result:    ${commuteGreet.message} (code: ${commuteGreet.code})`);
console.log(`NPC Response:       ${commuteGreet.response}`);
assert.equal(commuteGreet.success, true);
assert.equal(commuteGreet.code, 'success');
assert.equal(commuteGreet.response, "Good morning. On my way to the restaurant.");

// === STEP 4: Advance to 09:00:00 UTC — Shift Begins at Restaurant & Pan Dulce Available ===
console.log('\n=== STEP 4: Advancing to 09:00:00 UTC (Opening Boundary) & ticking simulation ===');
clock.advance(30 * 60_000);
const tick0900 = sim.tick();

console.log(`Current World Time: ${clock.getTime()}`);
console.log(`Restaurant State:   ${restaurant.operationalState}`);
console.log(`NPC Activity State: ${npc.activityState}`);
console.log(`NPC Location:       ${npc.locationId}`);

const transition0900 = tick0900.npcLocationTransitions?.find((t) => t.agentId === npc.id);
assert.ok(transition0900);
assert.equal(transition0900.changed, true);
assert.equal(transition0900.previousLocationId, 'street:development-street');
assert.equal(transition0900.newLocationId, 'restaurant:development-restaurant');
assert.equal(npc.locationId, 'restaurant:development-restaurant');
assert.equal(npc.activityState, 'active');
assert.equal(npc.activitySince, '2026-09-14T09:00:00.000Z');
assert.equal(restaurant.operationalState, 'open');

// Verify Pan Dulce offering made available by NPC action
assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), true);

// Player enters restaurant
enterBuilding(state, player.id, 'building:development-building');
const enterRestResult = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
assert.equal(enterRestResult.success, true);
assert.equal(player.locationId, 'restaurant:development-restaurant');

const restInspect = inspectCurrentLocation(state, player.id);
console.log(`Place Inspected:    ${restInspect.location?.name} (${restInspect.location?.type})`);
console.log(`Observed Offerings: ${restInspect.location?.offerings?.map((o) => `${o.name} ($${o.priceMinor / 100})`).join(', ')}`);
console.log(`Observed Agents:    ${restInspect.location?.agents.map((a) => `${a.name} (${a.agentType})`).join(', ')}`);

const workingGreet = greetAgent(state, player.id, npc.id);
console.log(`Greeting Result:    ${workingGreet.message} (code: ${workingGreet.code})`);
console.log(`NPC Response:       ${workingGreet.response}`);
assert.equal(workingGreet.success, true);
assert.equal(workingGreet.code, 'success');
assert.equal(workingGreet.response, "Welcome. I'm working here today.");

// === STEP 5: Midday Commerce & Activity at 12:00:00 UTC ===
console.log('\n=== STEP 5: Advancing to 12:00:00 UTC (Midday Commerce) & ticking simulation ===');
clock.advance(3 * 3600_000);
const tick1200 = sim.tick();

assert.equal(npc.locationId, 'restaurant:development-restaurant');
assert.equal(npc.activityState, 'active');

// Player purchases Pan Dulce
const pastryReceipt = purchaseOffering(state, player.id, 'offering:development-pastry');
console.log(`Pastry Purchase:    ${pastryReceipt.success} (amount: $${(pastryReceipt.amountMinor ?? 0) / 100})`);
assert.equal(pastryReceipt.success, true);
assert.equal(pastryReceipt.amountMinor, 250);

// Player purchases Coffee & starts Having Coffee activity
const coffeeReceipt = purchaseOffering(state, player.id, 'offering:development-coffee');
assert.equal(coffeeReceipt.success, true);
const activityResult = startHavingCoffee(state, player.id, coffeeReceipt);
assert.equal(activityResult.success, true);
console.log(`Activity Started:   ${player.playerActivity?.activity} at ${player.playerActivity?.startedAt}`);

// Advance 15 minutes to complete coffee
clock.advance(15 * 60_000);
sim.tick();
assert.equal(player.playerActivity?.completedAt, '2026-09-14T12:15:00.000Z');
console.log(`Activity Completed: ${player.playerActivity?.completedAt}`);

// === STEP 6: Advance to 17:00:00 UTC — Shift Ends, Pan Dulce Retired, Evening Walk on Avenida Juárez ===
console.log('\n=== STEP 6: Advancing to 17:00:00 UTC (Closing Boundary) & ticking simulation ===');
clock.advance(4 * 3600_000 + 45 * 60_000);
const tick1700 = sim.tick();

console.log(`Current World Time: ${clock.getTime()}`);
console.log(`Restaurant State:   ${restaurant.operationalState}`);
console.log(`NPC Activity State: ${npc.activityState}`);
console.log(`NPC Location:       ${npc.locationId}`);

const transition1700 = tick1700.npcLocationTransitions?.find((t) => t.agentId === npc.id);
assert.ok(transition1700);
assert.equal(transition1700.changed, true);
assert.equal(transition1700.previousLocationId, 'restaurant:development-restaurant');
assert.equal(transition1700.newLocationId, 'street:avenida-juarez');
assert.equal(npc.locationId, 'street:avenida-juarez');
assert.equal(npc.activityState, 'idle');
assert.equal(npc.activitySince, '2026-09-14T17:00:00.000Z');
assert.equal(restaurant.operationalState, 'closed');

// Verify Pan Dulce offering retired
assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), false);

// Player exits restaurant to Avenida Juárez
exitRestaurant(state, player.id, 'restaurant:development-restaurant');
leaveBuilding(state, player.id, 'building:development-building');
const traverseResult = traverseToStreet(state, player.id, 'street:avenida-juarez');
assert.equal(traverseResult.success, true);
assert.equal(player.locationId, 'street:avenida-juarez');

const avenidaInspect = inspectCurrentLocation(state, player.id);
console.log(`Place Inspected:    ${avenidaInspect.location?.name} (${avenidaInspect.location?.type})`);
console.log(`Observed Agents:    ${avenidaInspect.location?.agents.map((a) => `${a.name} (${a.agentType})`).join(', ')}`);
assert.equal(avenidaInspect.location?.agents.some((a) => a.id === npc.id), true);

const eveningWalkGreet = greetAgent(state, player.id, npc.id);
console.log(`Greeting Result:    ${eveningWalkGreet.message} (code: ${eveningWalkGreet.code})`);
console.log(`NPC Response:       ${eveningWalkGreet.response}`);
assert.equal(eveningWalkGreet.success, true);
assert.equal(eveningWalkGreet.code, 'success');
assert.equal(eveningWalkGreet.response, "Good evening. It's pleasant to walk down Avenida Juárez after work.");

// === STEP 7: Advance to 20:30:00 UTC — Return Home to Residence ===
console.log('\n=== STEP 7: Advancing to 20:30:00 UTC (Evening Boundary) & ticking simulation ===');
const walkActivitySince = npc.activitySince;
clock.advance(3 * 3600_000 + 30 * 60_000);
const tick2030 = sim.tick();

console.log(`Current World Time: ${clock.getTime()}`);
console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);

const transition2030 = tick2030.npcLocationTransitions?.find((t) => t.agentId === npc.id);
assert.ok(transition2030);
assert.equal(transition2030.changed, true);
assert.equal(transition2030.previousLocationId, 'street:avenida-juarez');
assert.equal(transition2030.newLocationId, 'building:development-residence');
assert.equal(npc.locationId, 'building:development-residence');
assert.equal(npc.activityState, 'idle');
// ActivityState remained idle across the 20:30 boundary, so activitySince is unchanged
assert.equal(npc.activitySince, walkActivitySince);

// Player traverses back and enters residence
traverseToStreet(state, player.id, 'street:development-street');
enterBuilding(state, player.id, 'building:development-residence');
assert.equal(player.locationId, 'building:development-residence');

const nightInspect = inspectCurrentLocation(state, player.id);
console.log(`Place Inspected:    ${nightInspect.location?.name} (${nightInspect.location?.type})`);
console.log(`Observed Agents:    ${nightInspect.location?.agents.map((a) => `${a.name} (${a.agentType})`).join(', ')}`);
assert.equal(nightInspect.location?.agents.some((a) => a.id === npc.id), true);

const nightGreet = greetAgent(state, player.id, npc.id);
console.log(`Greeting Result:    ${nightGreet.message} (code: ${nightGreet.code})`);
console.log(`NPC Response:       ${nightGreet.response}`);
assert.equal(nightGreet.success, true);
assert.equal(nightGreet.code, 'success');
assert.equal(nightGreet.response, "Hello. I'm resting at home right now.");

// === STEP 8: Advance to 23:00:00 UTC — Late Night Resting Check ===
console.log('\n=== STEP 8: Advancing to 23:00:00 UTC (Late Night) & ticking simulation ===');
clock.advance(2 * 3600_000 + 30 * 60_000);
const tick2300 = sim.tick();

console.log(`Current World Time: ${clock.getTime()}`);
console.log(`NPC Location:       ${npc.locationId} (${npc.activityState})`);

const transition2300 = tick2300.npcLocationTransitions?.find((t) => t.agentId === npc.id);
assert.ok(transition2300);
assert.equal(transition2300.changed, false);
assert.equal(npc.locationId, 'building:development-residence');
assert.equal(npc.activityState, 'idle');
assert.equal(npc.activitySince, walkActivitySince);

// === STEP 9: Persistence Roundtrip & Full Schema Version 10 Verification ===
console.log('\n=== STEP 9: Persisting state to disk and restoring in fresh runtime session ===');
const persistenceA = new LocalFilePersistence(demoPath);
persistenceA.save(snapshotWorldState(clock, state));
console.log('Session A persisted successfully.');

const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
assert.doesNotThrow(() => validateWorldState(stateB));

const playerB = stateB.agents.find((a) => a.id === player.id)!;
const npcB = stateB.agents.find((a) => a.id === npc.id)!;
console.log(`Restored Version:   ${stateB.version}`);
console.log(`Restored Time:      ${stateB.worldTime}`);
console.log(`Restored Player:    ${playerB.locationId}`);
console.log(`Restored NPC:       ${npcB.locationId} (${npcB.activityState})`);
console.log(`Purchase Records:   ${stateB.purchases?.length ?? 0}`);
console.log(`Activity Records:   ${stateB.activityCompletions?.length ?? 0}`);

assert.equal(stateB.version, 13);
assert.equal(playerB.locationId, 'building:development-residence');
assert.equal(npcB.locationId, 'building:development-residence');
assert.equal(npcB.activityState, 'idle');
assert.equal(npcB.activitySince, walkActivitySince);
assert.equal((stateB.purchases?.length ?? 0) >= 2, true);
assert.equal((stateB.activityCompletions?.length ?? 0) >= 1, true);

// === STEP 10: Cleanup & Summary ===
console.log('\n=== STEP 10: Cleaning up temporary artifacts ===');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 10 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
