import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  transitionAgentLocation,
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  exitRestaurant,
  inspectCurrentLocation,
  greetAgent,
  snapshotWorldState,
  validateWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-npc-routine.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('================================================================');
console.log('MILESTONE 15: DETERMINISTIC NPC SPATIAL ROUTINE DEMONSTRATION');
console.log('================================================================\n');

// === STEP 1: Bootstrap World ===
console.log('=== STEP 1: Bootstrapping development world at 08:00:00 UTC ===');
const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const simA = new Simulation(clockA, stateA);

const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
const npcA = stateA.agents.find((a) => a.id === 'agent:dev-npc')!;
const restaurantA = stateA.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

console.log(`World ID:           ${stateA.worldId}`);
console.log(`World Version:      ${stateA.version}`);
console.log(`Initial World Time: ${stateA.worldTime}`);
console.log(`Player Location:    ${playerA.locationId}`);
console.log(`NPC Location:       ${npcA.locationId} (${npcA.activityState})`);
console.log(`Restaurant Status:  ${restaurantA.operationalState}`);
assert.equal(stateA.version, 14);
assert.equal(playerA.locationId, 'building:development-building');
assert.equal(npcA.locationId, 'building:development-residence');
assert.equal(npcA.activityState, 'idle');
assert.equal(restaurantA.operationalState, 'closed');

// === STEP 2: Player Visits Residence and Greets at 08:00 UTC ===
console.log('\n=== STEP 2: Player visits residence & greets NPC at 08:00 UTC (Co-located) ===');
transitionAgentLocation(stateA, 'agent:dev-player', 'building:development-residence');
const morningBuildingInspect = inspectCurrentLocation(stateA, 'agent:dev-player');
console.log(`Place Inspected:    ${morningBuildingInspect.location?.name}`);
console.log(`Observed Agents:    ${morningBuildingInspect.location?.agents.map((a) => `${a.name} (${a.agentType})`).join(', ')}`);
assert.equal(morningBuildingInspect.location?.agents.some((a) => a.id === 'agent:dev-npc'), true);

const morningGreet = greetAgent(stateA, 'agent:dev-player', 'agent:dev-npc');
console.log(`Greeting Result:    ${morningGreet.code} (success: ${morningGreet.success})`);
console.log(`NPC Response:       ${morningGreet.response}`);
assert.equal(morningGreet.success, true);
assert.equal(morningGreet.response, "Hello. I'm resting at home right now.");

// === STEP 3: Advance to 09:00:00 UTC & Tick Simulation ===
console.log('\n=== STEP 3: Advancing to 09:00:00 UTC (Opening Boundary) & ticking simulation ===');
clockA.advance(60 * 60_000);
const tick0900 = simA.tick();

console.log(`Current World Time: ${clockA.getTime()}`);
console.log(`Restaurant State:   ${restaurantA.operationalState}`);
console.log(`NPC Activity State: ${npcA.activityState}`);
console.log(`NPC Location:       ${npcA.locationId}`);

const locationTransition = tick0900.npcLocationTransitions?.find((t) => t.agentId === 'agent:dev-npc');
assert.ok(locationTransition);
assert.equal(locationTransition.changed, true);
assert.equal(locationTransition.previousLocationId, 'building:development-residence');
assert.equal(locationTransition.newLocationId, 'restaurant:development-restaurant');
assert.equal(npcA.locationId, 'restaurant:development-restaurant');
assert.equal(npcA.activityState, 'active');
assert.equal(restaurantA.operationalState, 'open');

// Player location remains strictly isolated at residence
assert.equal(playerA.locationId, 'building:development-residence');

// === STEP 4: Player Enters Restaurant at 09:05 UTC ===
console.log('\n=== STEP 4: Player enters open restaurant ===');
transitionAgentLocation(stateA, 'agent:dev-player', 'building:development-building');
const enterResult = enterRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(enterResult.success, true);
console.log(`Player Location:    ${playerA.locationId}`);
assert.equal(playerA.locationId, 'restaurant:development-restaurant');

// === STEP 5: Perception Inside Restaurant Observes NPC ===
console.log('\n=== STEP 5: Inspecting restaurant at 09:05 UTC (Observing co-located NPC) ===');
const restaurantInspect = inspectCurrentLocation(stateA, 'agent:dev-player');
console.log(`Place Inspected:    ${restaurantInspect.location?.name} (${restaurantInspect.location?.type})`);
console.log(`Operational State:  ${restaurantInspect.location?.operationalState}`);
console.log(`Observed Offerings: ${restaurantInspect.location?.offerings?.map((o) => `${o.name} ($${o.priceMinor / 100})`).join(', ')}`);
console.log(`Observed Agents:    ${restaurantInspect.location?.agents.map((a) => `${a.name} (${a.agentType})`).join(', ')}`);

const observedNpc = restaurantInspect.location?.agents.find((a) => a.id === 'agent:dev-npc');
assert.ok(observedNpc);
assert.equal(observedNpc.name, 'Development NPC');
assert.equal(observedNpc.agentType, 'npc');

// === STEP 6: Greet NPC Inside Restaurant ===
console.log('\n=== STEP 6: Player greets NPC inside the restaurant ===');
const restaurantGreet = greetAgent(stateA, 'agent:dev-player', 'agent:dev-npc');
console.log(`Greeting Result:    ${restaurantGreet.message} (code: ${restaurantGreet.code})`);
assert.equal(restaurantGreet.success, true);
assert.equal(restaurantGreet.code, 'success');

// === STEP 7: Player Purchases Coffee & Starts Activity ===
console.log('\n=== STEP 7: Player purchases Coffee and starts Having Coffee ===');
const purchaseReceipt = purchaseOffering(stateA, 'agent:dev-player', 'offering:development-coffee');
assert.equal(purchaseReceipt.success, true);
const activityResult = startHavingCoffee(stateA, 'agent:dev-player', purchaseReceipt);
assert.equal(activityResult.success, true);
console.log(`Activity Started:   ${playerA.playerActivity?.activity} at ${playerA.playerActivity?.startedAt}`);

// === STEP 8: Advance 15 Minutes & Complete Coffee ===
console.log('\n=== STEP 8: Advancing 15 minutes to 09:15:00 UTC & ticking simulation ===');
clockA.advance(15 * 60_000);
const tick0915 = simA.tick();

assert.equal(playerA.playerActivity?.completedAt, '2026-09-14T09:15:00.000Z');
console.log(`Activity Completed: ${playerA.playerActivity?.completedAt}`);

// Verify NPC location unchanged during midday business hours
const transitionMidday = tick0915.npcLocationTransitions?.find((t) => t.agentId === 'agent:dev-npc');
assert.ok(transitionMidday);
assert.equal(transitionMidday.changed, false);
assert.equal(npcA.locationId, 'restaurant:development-restaurant');

// === STEP 9: Advance to 17:00:00 UTC (Closing Boundary) & Tick Simulation ===
console.log('\n=== STEP 9: Advancing to 17:00:00 UTC (Closing Boundary) & ticking simulation ===');
clockA.advance(7 * 3600_000 + 45 * 60_000);
const tick1700 = simA.tick();

console.log(`Current World Time: ${clockA.getTime()}`);
console.log(`Restaurant State:   ${restaurantA.operationalState}`);
console.log(`NPC Activity State: ${npcA.activityState}`);
console.log(`NPC Location:       ${npcA.locationId}`);

const transitionClosing = tick1700.npcLocationTransitions?.find((t) => t.agentId === 'agent:dev-npc');
assert.ok(transitionClosing);
assert.equal(transitionClosing.changed, true);
assert.equal(transitionClosing.previousLocationId, 'restaurant:development-restaurant');
assert.equal(transitionClosing.newLocationId, 'street:avenida-juarez');
assert.equal(npcA.locationId, 'street:avenida-juarez');
assert.equal(npcA.activityState, 'idle');
assert.equal(restaurantA.operationalState, 'closed');

// Sovereign Player remains where they were (inside restaurant)
assert.equal(playerA.locationId, 'restaurant:development-restaurant');

// === STEP 10: Inspect Restaurant at 17:00 UTC (NPC has departed) ===
console.log('\n=== STEP 10: Player inspects restaurant after closing (NPC departed) ===');
const closedRestaurantInspect = inspectCurrentLocation(stateA, 'agent:dev-player');
console.log(`Restaurant Status:  ${closedRestaurantInspect.location?.operationalState}`);
console.log(`Observed Agents:    ${closedRestaurantInspect.location?.agents.map((a) => a.name).join(', ')}`);
assert.equal(closedRestaurantInspect.location?.agents.some((a) => a.id === 'agent:dev-npc'), false);

// Greeting now fails due to separation
const separatedGreet = greetAgent(stateA, 'agent:dev-player', 'agent:dev-npc');
console.log(`Separated Greeting: ${separatedGreet.code} (success: ${separatedGreet.success})`);
assert.equal(separatedGreet.success, false);
assert.equal(separatedGreet.code, 'agents-not-co-located');

// === STEP 11: Player Meets NPC on Avenida Juárez ===
console.log('\n=== STEP 11: Player exits restaurant and meets NPC on Avenida Juárez ===');
exitRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
transitionAgentLocation(stateA, 'agent:dev-player', 'street:avenida-juarez');
const avenidaInspect = inspectCurrentLocation(stateA, 'agent:dev-player');
console.log(`Place Inspected:    ${avenidaInspect.location?.name}`);
console.log(`Observed Agents:    ${avenidaInspect.location?.agents.map((a) => `${a.name} (${a.agentType})`).join(', ')}`);
assert.equal(avenidaInspect.location?.agents.some((a) => a.id === 'agent:dev-npc'), true);

const eveningGreet = greetAgent(stateA, 'agent:dev-player', 'agent:dev-npc');
console.log(`Evening Greeting:   ${eveningGreet.message} (code: ${eveningGreet.code})`);
console.log(`NPC Response:       ${eveningGreet.response}`);
assert.equal(eveningGreet.success, true);
assert.equal(eveningGreet.code, 'success');
assert.equal(eveningGreet.response, "Good evening. It's pleasant to walk down Avenida Juárez after work.");

// === STEP 12: Persistence Roundtrip ===
console.log('\n=== STEP 12: Persisting state to disk and restoring in fresh runtime session ===');
const persistenceA = new LocalFilePersistence(demoPath);
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted successfully.');

const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
assert.doesNotThrow(() => validateWorldState(stateB));

const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
const npcB = stateB.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`Restored Version:   ${stateB.version}`);
console.log(`Restored Time:      ${stateB.worldTime}`);
console.log(`Restored Player:    ${playerB.locationId}`);
console.log(`Restored NPC:       ${npcB.locationId} (${npcB.activityState})`);

assert.equal(stateB.version, 14);
assert.equal(playerB.locationId, 'street:avenida-juarez');
assert.equal(npcB.locationId, 'street:avenida-juarez');
assert.equal(npcB.activityState, 'idle');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 12 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
