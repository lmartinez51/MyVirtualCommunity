import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  exitRestaurant,
  leaveBuilding,
  enterBuilding,
  transitionAgentLocation,
  greetAgent,
  inspectCurrentLocation,
  snapshotWorldState,
  validateWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-world-perception.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('================================================================');
console.log('MILESTONE 12: FIRST WORLD PERCEPTION DEMONSTRATION');
console.log('================================================================\n');

// === STEP 1: Bootstrap World ===
console.log('=== STEP 1: Bootstrapping Version 10 development world at 08:00:00 UTC ===');
const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
const state = createInitialWorldState(clock);
const sim = new Simulation(clock, state);

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`World ID:           ${state.worldId}`);
console.log(`World Version:      ${state.version}`);
console.log(`Initial World Time: ${state.worldTime}`);
console.log(`Player Location:    ${player.locationId}`);
console.log(`NPC Location:       ${npc.locationId} (seeded independently)`);
assert.equal(state.version, 14);
assert.equal(player.locationId, 'building:development-building');
assert.equal(npc.locationId, 'building:development-residence');

// === STEP 2: Restaurant Opening ===
console.log('\n=== STEP 2: Advancing World Time to restaurant-open time (09:00:00 UTC) ===');
clock.advance(60 * 60_000);
sim.tick();
const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Current World Time: ${clock.getTime()}`);
console.log(`Restaurant ID:      ${restaurant.id}`);
console.log(`OperationalState:   ${restaurant.operationalState}`);
assert.equal(restaurant.operationalState, 'open');

// === STEP 3: Player Enters Restaurant ===
console.log('\n=== STEP 3: Player enters restaurant ===');
const enterResult = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(enterResult.success, true);
assert.equal(player.locationId, 'restaurant:development-restaurant');
console.log(`Player Location: ${player.locationId}`);

// === STEP 4: Inspect Restaurant Location ===
console.log('\n=== STEP 4: Inspecting restaurant location via inspectCurrentLocation() ===');
const timeBeforeInspection = clock.getTime();
const snapshotBeforeInspection = JSON.stringify(state);
const inspectRes1 = inspectCurrentLocation(state, 'agent:dev-player');
console.log(`Inspection Success: ${inspectRes1.success}`);
console.log(`Inspection Code:    ${inspectRes1.code}`);
assert.equal(inspectRes1.success, true);
assert.equal(inspectRes1.code, 'success');
assert.ok(inspectRes1.location);

// === STEP 5: Verify Restaurant Identity ===
console.log('\n=== STEP 5: Verifying restaurant identity and containment ===');
console.log(`Location ID:        ${inspectRes1.location.id}`);
console.log(`Location Type:      ${inspectRes1.location.type}`);
console.log(`Location Name:      ${inspectRes1.location.name}`);
console.log(`Containing Building:${inspectRes1.location.buildingId}`);
assert.equal(inspectRes1.location.id, 'restaurant:development-restaurant');
assert.equal(inspectRes1.location.type, 'restaurant');
assert.equal(inspectRes1.location.name, 'Development Restaurant');
assert.equal(inspectRes1.location.buildingId, 'building:development-building');
assert.equal(inspectRes1.location.parentId, undefined);

// === STEP 6: Verify Operational State ===
console.log('\n=== STEP 6: Verifying operational state ===');
console.log(`Operational State:  ${inspectRes1.location.operationalState}`);
assert.equal(inspectRes1.location.operationalState, 'open');

// === STEP 7: Verify Coffee Offering is Observable ===
console.log('\n=== STEP 7: Verifying Coffee offering is observable via ObservableOffering ===');
assert.ok(inspectRes1.location.offerings);
assert.equal(inspectRes1.location.offerings.length, 2);
const offering = inspectRes1.location.offerings.find((o) => o.id === 'offering:development-coffee')!;
assert.ok(offering);
console.log(`Offering ID:         ${offering.id}`);
console.log(`Offering Name:       ${offering.name}`);
console.log(`Offering Price:      ${offering.priceMinor} ${offering.currency}`);
console.log(`Has restaurantId:    ${(offering as Record<string, unknown>).restaurantId !== undefined} (must be false)`);
assert.equal(offering.id, 'offering:development-coffee');
assert.equal(offering.name, 'Coffee');
assert.equal(offering.priceMinor, 500);
assert.equal(offering.currency, 'USD');
assert.equal((offering as Record<string, unknown>).restaurantId, undefined, 'ObservableOffering must not expose restaurantId');

// === STEP 8: Verify Observable Agents in Restaurant ===
console.log('\n=== STEP 8: Verifying observable agents occupying the exact same restaurant location ===');
console.log(`Agents present count: ${inspectRes1.location.agents.length}`);
assert.equal(inspectRes1.location.agents.length, 2);

const presentPlayer = inspectRes1.location.agents.find((a) => a.id === 'agent:dev-player')!;
assert.ok(presentPlayer);
console.log(`Present Player ID:   ${presentPlayer.id}`);
console.log(`Present Player Name: ${presentPlayer.name}`);
console.log(`Present Player Type: ${presentPlayer.agentType}`);
console.log(`Has activityState:   ${(presentPlayer as Record<string, unknown>).activityState !== undefined} (must be false)`);
assert.equal(presentPlayer.id, 'agent:dev-player');
assert.equal(presentPlayer.name, 'Development Player');
assert.equal(presentPlayer.agentType, 'player');
assert.equal((presentPlayer as Record<string, unknown>).activityState, undefined, 'ObservableAgent must not expose activityState');
assert.equal((presentPlayer as Record<string, unknown>).balanceMinor, undefined, 'ObservableAgent must not expose balanceMinor');

const presentNpc = inspectRes1.location.agents.find((a) => a.id === 'agent:dev-npc')!;
assert.ok(presentNpc);
console.log(`Present NPC ID:      ${presentNpc.id}`);
console.log(`Present NPC Name:    ${presentNpc.name}`);
console.log(`Present NPC Type:    ${presentNpc.agentType}`);
assert.equal(presentNpc.id, 'agent:dev-npc');
assert.equal(presentNpc.name, 'Development NPC');
assert.equal(presentNpc.agentType, 'npc');
assert.equal((presentNpc as Record<string, unknown>).activityState, undefined, 'ObservableAgent must not expose activityState');
assert.equal((presentNpc as Record<string, unknown>).balanceMinor, undefined, 'ObservableAgent must not expose balanceMinor');

// Verify zero state mutation occurred during inspection
assert.equal(JSON.stringify(state), snapshotBeforeInspection);
assert.equal(clock.getTime(), timeBeforeInspection);

// === STEP 9: Purchase Coffee ===
console.log('\n=== STEP 9: Purchasing Coffee offering ===');
const purchaseReceipt = purchaseOffering(state, 'agent:dev-player', 'offering:development-coffee');
assert.equal(purchaseReceipt.success, true);
console.log(`Player Balance After: ${player.balanceMinor} ${player.currency}`);

// === STEP 10: Start Having Coffee ===
console.log('\n=== STEP 10: Starting Having Coffee activity ===');
const startCoffeeRes = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);
assert.equal(startCoffeeRes.success, true);
console.log(`Activity Started: ${player.playerActivity?.activity} at ${player.playerActivity?.startedAt}`);

// === STEP 11: Inspect Again without Mutating State ===
console.log('\n=== STEP 11: Inspecting again while having coffee (confirming zero mutation) ===');
const snapshotBeforeInspect2 = JSON.stringify(state);
const inspectRes2 = inspectCurrentLocation(state, 'agent:dev-player');
assert.equal(inspectRes2.success, true);
assert.equal(inspectRes2.location?.id, 'restaurant:development-restaurant');
assert.equal(JSON.stringify(state), snapshotBeforeInspect2, 'Inspection must produce zero state mutation');

// === STEP 12: Advance Time & Complete Having Coffee ===
console.log('\n=== STEP 12: Advancing 15 minutes and completing Having Coffee ===');
clock.advance(15 * 60_000);
const tickRes = sim.tick();
assert.equal(tickRes.playerActivityTransitions?.length, 1);
assert.equal(player.playerActivity?.completedAt, '2026-09-14T09:15:00.000Z');
console.log(`Activity completed at: ${player.playerActivity?.completedAt}`);

// === STEP 13: Exit Restaurant ===
console.log('\n=== STEP 13: Player exits restaurant ===');
const exitRes = exitRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(exitRes.success, true);
console.log(`Player Location: ${player.locationId}`);
assert.equal(player.locationId, 'building:development-building');

// === STEP 14: Leave Building ===
console.log('\n=== STEP 14: Player leaves building into street ===');
const leaveRes = leaveBuilding(state, 'agent:dev-player', 'building:development-building');
assert.equal(leaveRes.success, true);
console.log(`Player Location: ${player.locationId}`);
assert.equal(player.locationId, 'street:development-street');

// === STEP 15: Inspect Street Location ===
console.log('\n=== STEP 15: Inspecting resulting Street location ===');
const inspectStreet = inspectCurrentLocation(state, 'agent:dev-player');
assert.equal(inspectStreet.success, true);
assert.ok(inspectStreet.location);
console.log(`Location ID:        ${inspectStreet.location.id}`);
console.log(`Location Type:      ${inspectStreet.location.type}`);
console.log(`Location Name:      ${inspectStreet.location.name}`);
console.log(`Geographic Parent:  ${inspectStreet.location.parentId}`);
assert.equal(inspectStreet.location.id, 'street:development-street');
assert.equal(inspectStreet.location.type, 'street');
assert.equal(inspectStreet.location.name, 'Development Street');
assert.equal(inspectStreet.location.parentId, 'neighborhood:development-neighborhood');
// NPC at building must NOT be visible from street
assert.equal(inspectStreet.location.agents.some((a) => a.id === 'agent:dev-npc'), false);

// === STEP 16: Move to NPC's Existing Location ===
console.log("\n=== STEP 16: Moving player to NPC's existing location (restaurant) via enterBuilding & enterRestaurant ===");
console.log(`Observed existing NPC location: ${npc.locationId}`);
const enterBldRes = enterBuilding(state, 'agent:dev-player', 'building:development-building');
assert.equal(enterBldRes.success, true);
const enterRestRes = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(enterRestRes.success, true);
console.log(`Player transitioned to: ${player.locationId}`);
assert.equal(player.locationId, 'restaurant:development-restaurant');

// === STEP 17: Inspect Shared Location ===
console.log('\n=== STEP 17: Inspecting shared location ===');
const inspectShared = inspectCurrentLocation(state, 'agent:dev-player');
assert.equal(inspectShared.success, true);
assert.ok(inspectShared.location);
console.log(`Location ID:   ${inspectShared.location.id}`);
console.log(`Location Name: ${inspectShared.location.name}`);
console.log(`Agents Count:  ${inspectShared.location.agents.length}`);

// === STEP 18: Verify NPC is Observable in Shared Location ===
console.log('\n=== STEP 18: Verifying NPC is observable because both agents share the exact same locationId ===');
const observableNpc = inspectShared.location.agents.find((a) => a.id === 'agent:dev-npc');
assert.ok(observableNpc, 'NPC must be observable in shared location');
console.log(`Observed NPC ID:        ${observableNpc.id}`);
console.log(`Observed NPC Name:      ${observableNpc.name}`);
console.log(`Observed NPC Type:      ${observableNpc.agentType}`);
console.log(`Has activityState:      ${(observableNpc as Record<string, unknown>).activityState !== undefined} (must be false)`);
assert.equal(observableNpc.id, 'agent:dev-npc');
assert.equal(observableNpc.name, 'Development NPC');
assert.equal(observableNpc.agentType, 'npc');
assert.equal((observableNpc as Record<string, unknown>).activityState, undefined, 'activityState must not be exposed');

// === STEP 19: Greet the NPC ===
console.log('\n=== STEP 19: Greeting the NPC via greetAgent() ===');
const greetResult = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
console.log(`Greeting Result Code: ${greetResult.code}`);
assert.equal(greetResult.success, true);
assert.equal(greetResult.code, 'success');

// === STEP 20: Verify Inspection Produced Zero State Changes & Persistence Survives ===
console.log('\n=== STEP 20: Verifying inspection produced zero unintended state changes and persistence survives ===');
console.log(`Player Balance:         ${player.balanceMinor} ${player.currency} (unchanged)`);
console.log(`Restaurant Balance:     ${restaurant.balanceMinor} ${restaurant.currency} (unchanged)`);
console.log(`Restaurant Operational: ${restaurant.operationalState} (unchanged)`);
assert.equal(player.balanceMinor, 1500);
assert.equal(restaurant.balanceMinor, 500);
assert.equal(restaurant.operationalState, 'open');

// Persist and restore
const persistenceA = new LocalFilePersistence(demoPath);
persistenceA.save(snapshotWorldState(clock, state));

const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
assert.doesNotThrow(() => validateWorldState(stateB));
assert.equal(stateB.version, 14);

const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
const npcB = stateB.agents.find((a) => a.id === 'agent:dev-npc')!;
assert.equal(playerB.locationId, 'restaurant:development-restaurant');
assert.equal(npcB.locationId, 'restaurant:development-restaurant');
console.log('Restored state verified with schema version 11.');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 20 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
