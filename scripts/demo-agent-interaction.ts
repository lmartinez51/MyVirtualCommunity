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
  greetAgent,
  snapshotWorldState,
  validateWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

const demoPath = join(tmpdir(), 'myvirtualcommunity-demo-agent-interaction.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('================================================================');
console.log('MILESTONE 11: FIRST AGENT-TO-AGENT INTERACTION DEMONSTRATION');
console.log('================================================================\n');

// === STEP 1: Bootstrap World ===
console.log('=== STEP 1: Bootstrapping Version 8 development world at 08:00:00 UTC ===');
const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
const stateA = createInitialWorldState(clockA);
const simA = new Simulation(clockA, stateA);

const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
const npcA = stateA.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`World ID:           ${stateA.worldId}`);
console.log(`World Version:      ${stateA.version}`);
console.log(`Initial World Time: ${stateA.worldTime}`);
console.log(`Player Location:    ${playerA.locationId}`);
console.log(`NPC Location:       ${npcA.locationId} (seeded independently)`);
assert.equal(stateA.version, 12);
assert.equal(playerA.locationId, 'building:development-building');
assert.equal(npcA.locationId, 'building:development-residence');

// === STEP 2: Restaurant Opening ===
console.log('\n=== STEP 2: Advancing World Time to restaurant-open time (09:00:00 UTC) ===');
clockA.advance(60 * 60_000);
simA.tick();
const restaurantA = stateA.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
console.log(`Current World Time: ${clockA.getTime()}`);
console.log(`Restaurant ID:      ${restaurantA.id}`);
console.log(`OperationalState:   ${restaurantA.operationalState}`);
assert.equal(restaurantA.operationalState, 'open');

// === STEP 3: Player Enters Restaurant ===
console.log('\n=== STEP 3: Player enters restaurant ===');
const enterResult = enterRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(enterResult.success, true);
assert.equal(playerA.locationId, 'restaurant:development-restaurant');
console.log(`Player Location: ${playerA.locationId}`);

// === STEP 4: Player Purchases Coffee ===
console.log('\n=== STEP 4: Purchasing Coffee offering ===');
const purchaseReceipt = purchaseOffering(stateA, 'agent:dev-player', 'offering:development-coffee');
assert.equal(purchaseReceipt.success, true);
console.log(`Purchase Code:            ${purchaseReceipt.code}`);
console.log(`Player Balance After:     ${playerA.balanceMinor} ${playerA.currency} minor units`);
console.log(`Restaurant Balance After: ${restaurantA.balanceMinor} ${restaurantA.currency} minor units`);
assert.equal(playerA.balanceMinor, 1500);
assert.equal(restaurantA.balanceMinor, 500);

// === STEP 5: Player Starts Having Coffee ===
console.log('\n=== STEP 5: Explicitly starting "Having Coffee" with purchase receipt ===');
const activityResult = startHavingCoffee(stateA, 'agent:dev-player', purchaseReceipt);
assert.equal(activityResult.success, true);
console.log(`Activity Started: ${playerA.playerActivity?.activity} at ${playerA.playerActivity?.startedAt}`);
assert.equal(playerA.playerActivity?.activity, 'having-coffee');
assert.equal(playerA.playerActivity?.completedAt, null);

// === STEP 6: Advance 15 World Minutes ===
console.log('\n=== STEP 6: Advancing World Time by 15 minutes to 09:15:00 UTC ===');
clockA.advance(15 * 60_000);
console.log(`World Time Advanced to: ${clockA.getTime()}`);

// === STEP 7: Tick Simulation ===
console.log('\n=== STEP 7: Executing simulation tick ===');
const tickResult = simA.tick();
assert.equal(tickResult.playerActivityTransitions?.length, 1);
assert.equal(tickResult.playerActivityTransitions[0].changed, true);
assert.equal(tickResult.playerActivityTransitions[0].completedAt, '2026-09-14T09:15:00.000Z');

// === STEP 8: Verify Coffee Completed ===
console.log('\n=== STEP 8: Verifying coffee activity is completed ===');
console.log(`Activity Status: completed at ${playerA.playerActivity?.completedAt}`);
assert.equal(playerA.playerActivity?.completedAt, '2026-09-14T09:15:00.000Z');

// === STEP 9: Greet NPC inside Restaurant ===
console.log('\n=== STEP 9: Player greets NPC inside the restaurant via greetAgent() ===');
console.log(`Player Location: ${playerA.locationId}`);
console.log(`NPC Location:    ${npcA.locationId}`);
assert.equal(playerA.locationId, npcA.locationId);
assert.equal(playerA.locationId, 'restaurant:development-restaurant');

const timeBeforeGreeting = clockA.getTime();
const snapshotBeforeGreeting = JSON.stringify(stateA);
const greetResult = greetAgent(stateA, 'agent:dev-player', 'agent:dev-npc');
console.log(`[INTERACTION] Player "${greetResult.playerId}" greeted NPC "${greetResult.npcId}" (success: ${greetResult.success})`);

// === STEP 10: Verify Successful Result ===
console.log('\n=== STEP 10: Verifying successful greeting result ===');
console.log(`Greeting Result Code:    ${greetResult.code}`);
console.log(`Greeting Result Message: ${greetResult.message}`);
assert.equal(greetResult.success, true);
assert.equal(greetResult.code, 'success');
assert.equal(greetResult.playerId, 'agent:dev-player');
assert.equal(greetResult.npcId, 'agent:dev-npc');

// Verify zero state mutation during greeting
const snapshotAfterGreeting = JSON.stringify(stateA);
assert.equal(snapshotAfterGreeting, snapshotBeforeGreeting, 'WorldState must remain 100% byte-for-byte identical after greeting');
assert.equal(clockA.getTime(), timeBeforeGreeting, 'WorldTime must remain identical');

// === STEP 11: Exit Restaurant ===
console.log('\n=== STEP 11: Player exits restaurant via exitRestaurant() ===');
const exitResult = exitRestaurant(stateA, 'agent:dev-player', 'restaurant:development-restaurant');
assert.equal(exitResult.success, true);
console.log(`Player Location: ${playerA.locationId}`);
assert.equal(playerA.locationId, 'building:development-building');

// === STEP 12: Leave Building ===
console.log('\n=== STEP 12: Player leaves building via leaveBuilding() ===');
const leaveResult = leaveBuilding(stateA, 'agent:dev-player', 'building:development-building');
assert.equal(leaveResult.success, true);
console.log(`Player Location: ${playerA.locationId}`);
assert.equal(playerA.locationId, 'street:development-street');

// === STEP 13: Verify Agents are now Separated ===
console.log('\n=== STEP 13: Verifying agents are in different locations ===');
console.log(`Player Location: ${playerA.locationId}`);
console.log(`NPC Location:    ${npcA.locationId}`);
assert.notEqual(playerA.locationId, npcA.locationId);

// === STEP 14: Attempt Greeting While Separated (Precondition Failure) ===
console.log('\n=== STEP 14: Attempting greeting while agents are in different locations ===');
const rejectedResult = greetAgent(stateA, 'agent:dev-player', 'agent:dev-npc');
console.log(`[INTERACTION] Greeting attempt result: success=${rejectedResult.success}, code=${rejectedResult.code}`);
console.log(`Rejected Code:    ${rejectedResult.code}`);
console.log(`Rejected Message: ${rejectedResult.message}`);
assert.equal(rejectedResult.success, false);
assert.equal(rejectedResult.code, 'agents-not-co-located');

// === STEP 15: Verify No Unintended State Changes ===
console.log('\n=== STEP 15: Verifying unrelated state remains completely unchanged ===');
console.log(`Player Balance:           ${playerA.balanceMinor} ${playerA.currency} (unchanged)`);
console.log(`Restaurant Balance:       ${restaurantA.balanceMinor} ${restaurantA.currency} (unchanged)`);
console.log(`Restaurant Operational:   ${restaurantA.operationalState} (unchanged)`);
console.log(`Completed Activity State: ${playerA.playerActivity?.activity} @ ${playerA.playerActivity?.completedAt} (unchanged)`);
assert.equal(playerA.balanceMinor, 1500);
assert.equal(restaurantA.balanceMinor, 500);
assert.equal(restaurantA.operationalState, 'open');
assert.equal(playerA.playerActivity?.completedAt, '2026-09-14T09:15:00.000Z');

// === STEP 16: Persist World State ===
console.log('\n=== STEP 16: Persisting world state to disk and destroying Runtime A ===');
const persistenceA = new LocalFilePersistence(demoPath);
persistenceA.save(snapshotWorldState(clockA, stateA));
console.log('Session A persisted successfully.');

// === STEP 17: Restore World State ===
console.log('\n=== STEP 17: Starting fresh Runtime B and restoring world from disk ===');
const persistenceB = new LocalFilePersistence(demoPath);
const stateB = persistenceB.load()!;
assert.ok(stateB !== null);
assert.doesNotThrow(() => validateWorldState(stateB));
console.log(`Restored World Version: ${stateB.version}`);
console.log(`Restored World Time:    ${stateB.worldTime}`);
assert.equal(stateB.version, 12);

// === STEP 18: Verify Spatial State Survives Persistence ===
console.log('\n=== STEP 18: Verifying reconstructed spatial state across runtimes ===');
const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
const npcB = stateB.agents.find((a) => a.id === 'agent:dev-npc')!;
console.log(`Restored Player Location: ${playerB.locationId}`);
console.log(`Restored NPC Location:    ${npcB.locationId}`);
console.log(`Restored Player Balance:  ${playerB.balanceMinor} ${playerB.currency}`);
console.log(`Restored Activity:        ${playerB.playerActivity?.activity} (completed: ${playerB.playerActivity?.completedAt})`);
assert.equal(playerB.locationId, 'street:development-street');
assert.equal(npcB.locationId, 'restaurant:development-restaurant');
assert.equal(playerB.balanceMinor, 1500);
assert.equal(playerB.playerActivity?.completedAt, '2026-09-14T09:15:00.000Z');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

console.log('\n================================================================');
console.log('DEMONSTRATION COMPLETE: ALL 18 STEPS VERIFIED SUCCESSFULLY');
console.log('================================================================\n');
