import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  inspectPlayerHistory,
  validateWorldState,
  snapshotWorldState,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

console.log('================================================================');
console.log('MILESTONE 17-A: AUTHORITATIVE PERSONAL HISTORICAL PERCEPTION DEMO');
console.log('================================================================\n');

const demoPath = join(tmpdir(), 'mvc-demo-m17-player-history.json');
if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}

// === STEP 1: Bootstrap Development World ===
console.log('=== STEP 1: Bootstrapping development world at 09:00:00 UTC ===');
const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
const state = createInitialWorldState(clock);
validateWorldState(state);
assert.equal(state.version, 14);

const sim = new Simulation(clock, state, { silent: true });
sim.tick(); // Open restaurant at 09:00 UTC

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

console.log(`World ID:           ${state.worldId}`);
console.log(`World Version:      ${state.version}`);
console.log(`World Time:         ${state.worldTime}`);
console.log(`Player ID:          ${player.id}`);
console.log(`Player Balance:     ${player.balanceMinor} ${player.currency}`);
console.log(`Restaurant State:   ${restaurant.operationalState}`);

// === STEP 2: Inspect Initial Empty History ===
console.log('\n=== STEP 2: Inspecting initial empty history ===');
const initialHistory = inspectPlayerHistory(state, player.id);
assert.equal(initialHistory.success, true);
assert.equal(initialHistory.code, 'success');
assert.deepEqual(initialHistory.history?.purchases, []);
assert.deepEqual(initialHistory.history?.coffeeCompletions, []);
console.log(`Initial Purchases Count:    ${initialHistory.history?.purchases.length}`);
console.log(`Initial Completions Count:  ${initialHistory.history?.coffeeCompletions.length}`);

// === STEP 3: Player Enters Restaurant ===
console.log('\n=== STEP 3: Player enters restaurant ===');
const enterResult = enterRestaurant(state, player.id, restaurant.id);
assert.equal(enterResult.success, true);
console.log(`Player Location:    ${player.locationId}`);

// === STEP 4: Player Purchases Coffee ===
console.log('\n=== STEP 4: Player purchases Coffee ===');
const purchaseReceipt = purchaseOffering(state, player.id, 'offering:development-coffee');
assert.equal(purchaseReceipt.success, true);
console.log(`Purchase Code:      ${purchaseReceipt.code}`);
console.log(`Player Balance:     ${player.balanceMinor} ${player.currency}`);
console.log(`Restaurant Balance: ${restaurant.balanceMinor} ${restaurant.currency}`);

// === STEP 5: Player Starts Having Coffee ===
console.log('\n=== STEP 5: Player starts Having Coffee with purchase receipt ===');
const coffeeResult = startHavingCoffee(state, player.id, purchaseReceipt);
assert.equal(coffeeResult.success, true);
console.log(`Activity Started:   ${player.playerActivity?.activity} at ${player.playerActivity?.startedAt}`);

// === STEP 6: Advance World Clock 15 Minutes & Tick Simulation ===
console.log('\n=== STEP 6: Advancing 15 minutes to 09:15:00 UTC and ticking simulation ===');
clock.advance(15 * 60_000);
const tickResult = sim.tick();
assert.equal(tickResult.playerActivityTransitions?.length, 1);
console.log(`Current World Time: ${clock.getTime()}`);
console.log(`Activity Status:    completed at ${player.playerActivity?.completedAt}`);

// === STEP 7: Authoritative Personal Historical Perception ===
console.log('\n=== STEP 7: Executing inspectPlayerHistory(state, playerId) ===');
const historyResult = inspectPlayerHistory(state, player.id);
assert.equal(historyResult.success, true);
assert.equal(historyResult.code, 'success');
assert.ok(historyResult.history);

console.log(`Query Status:       ${historyResult.code} (success: ${historyResult.success})`);
console.log(`History Owner:      ${historyResult.history.playerId}`);

console.log('\n--- Recorded Purchase Facts ---');
for (const p of historyResult.history.purchases) {
  console.log(`  * ID:         ${p.id}`);
  console.log(`    Timestamp:  ${p.worldTime}`);
  console.log(`    Restaurant: ${p.restaurantId}`);
  console.log(`    Offering:   ${p.offeringId}`);
  console.log(`    Amount:     $${(p.amountMinor / 100).toFixed(2)} ${p.currency}`);
}

console.log('\n--- Recorded Completed Activity Facts ---');
for (const c of historyResult.history.coffeeCompletions) {
  console.log(`  * ID:         ${c.id}`);
  console.log(`    Restaurant: ${c.restaurantId}`);
  console.log(`    Started:    ${c.startedAt}`);
  console.log(`    Completed:  ${c.completedAt}`);
}

assert.equal(historyResult.history.purchases.length, 1);
assert.equal(historyResult.history.coffeeCompletions.length, 1);

// === STEP 8: Demonstrating Persistence Roundtrip of Historical Perception ===
console.log('\n=== STEP 8: Demonstrating persistence roundtrip of historical perception ===');
const persistence = new LocalFilePersistence(demoPath);
persistence.save(snapshotWorldState(clock, state));

const reloadedState = persistence.load();
assert.ok(reloadedState !== null);
validateWorldState(reloadedState);
assert.equal(reloadedState.version, 14);

const reloadedHistory = inspectPlayerHistory(reloadedState, player.id);
assert.equal(reloadedHistory.success, true);
assert.deepEqual(reloadedHistory.history, historyResult.history);
console.log(`Reloaded World Version:     ${reloadedState.version}`);
console.log(`Reloaded Purchases Count:   ${reloadedHistory.history?.purchases.length}`);
console.log(`Reloaded Completions Count: ${reloadedHistory.history?.coffeeCompletions.length}`);

console.log('\n================================================================');
console.log('HISTORICAL PERCEPTION VERIFIED: Facts Observable by Player');
console.log('================================================================\n');

if (existsSync(demoPath)) {
  unlinkSync(demoPath);
}
