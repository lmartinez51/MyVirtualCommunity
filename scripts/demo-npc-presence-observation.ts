import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  leaveBuilding,
  enterBuilding,
  enterRestaurant,
  inspectCurrentLocation,
  greetAgent,
  introduceToAgent,
  areAgentsCoLocated,
  getCoLocatedAgents,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import { createPresentationModel } from '../src/client/projections.js';

console.log('================================================================');
console.log('Milestone 60: NPC Presence & Observation Boundary Demo');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// Step 1: Bootstrapping & Initial Co-Location Verification
// ---------------------------------------------------------------------------
console.log('--- Step 1: Bootstrapping & Initial Co-Location Verification ---');
// 14:00 UTC = 08:00 AM Local Juarez Time
// Elena Morales schedule: Home at building:development-residence
const START_TIME = '2026-09-14T14:00:00.000Z';
const clock = WorldClock.create(START_TIME);
const state = createInitialWorldState(clock);
const sim = new Simulation(clock, state, { silent: true });
sim.tick();
validateWorldState(state);

console.log(`World State Schema Version: ${state.version}`);
assert.equal(state.version, 18);
assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);

const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

console.log(`Player location: ${player.locationId}`);
console.log(`dev-npc (${devNpc.name}) location: ${devNpc.locationId}`);
assert.equal(player.locationId, 'building:development-building');
assert.equal(devNpc.locationId, 'building:development-residence');

const initialCoLocated = areAgentsCoLocated(state, player.id, devNpc.id);
console.log(`Are player and dev-npc co-located? ${initialCoLocated}`);
assert.equal(initialCoLocated, false);

const initialObserved = getCoLocatedAgents(state, player.id);
console.log(`Agents co-located with player: ${initialObserved.map((a) => a.name).join(', ')}`);
assert.equal(initialObserved.some((a) => a.id === devNpc.id), false);

// Attempt social greeting across different spatial contexts
console.log('Attempting greeting while separated in different buildings...');
const failedGreet = greetAgent(state, player.id, devNpc.id);
console.log(`Greeting result: success=${failedGreet.success}, code=${failedGreet.code}`);
assert.equal(failedGreet.success, false);
assert.equal(failedGreet.code, 'agents-not-co-located');
console.log('  -> VERIFIED: Separate locations prohibit co-presence, observation, and social interaction.\n');

// ---------------------------------------------------------------------------
// Step 2: Player Transitions to Street (Still Different Locations)
// ---------------------------------------------------------------------------
console.log('--- Step 2: Player Transitions to Street ---');
leaveBuilding(state, player.id, 'building:development-building');
console.log(`Player transitioned to: ${player.locationId}`);
assert.equal(player.locationId, 'street:development-street');

const streetCoLocated = areAgentsCoLocated(state, player.id, devNpc.id);
console.log(`Are player and dev-npc co-located? ${streetCoLocated}`);
assert.equal(streetCoLocated, false);

const locationInspection = inspectCurrentLocation(state, player.id);
console.log(`Observed agents in ${locationInspection.location?.name}: ${locationInspection.location?.agents.map((a) => a.name).join(', ') || 'None'}`);
assert.equal(locationInspection.location?.agents.some((a) => a.id === devNpc.id), false);

const statusData = {
  worldId: state.worldId,
  schemaVersion: state.version,
  worldTime: state.worldTime,
  activePlayerId: player.id,
};
const presentation = createPresentationModel(statusData, locationInspection);
console.log(`Presentation model agents count: ${presentation.agents.length}`);
assert.equal(presentation.agents.some((a) => a.id === devNpc.id), false);
console.log('  -> VERIFIED: Street-level perception excludes agents inside private residences.\n');

// ---------------------------------------------------------------------------
// Step 3: Schedule-Driven Dynamic Co-Presence (Elena Morales Commutes)
// ---------------------------------------------------------------------------
console.log('--- Step 3: Schedule-Driven Dynamic Co-Presence ---');
// Advance clock by 35 minutes to 08:35 Local (14:35 UTC)
console.log('Advancing world clock to 08:35 AM Local (commute phase)...');
clock.advance(35 * 60 * 1000);
sim.tick();

console.log(`dev-npc location after simulation tick: ${devNpc.locationId}`);
assert.equal(devNpc.locationId, 'street:development-street');
assert.equal(player.locationId, 'street:development-street');

const commCoLocated = areAgentsCoLocated(state, player.id, devNpc.id);
console.log(`Are player and dev-npc co-located on street? ${commCoLocated}`);
assert.equal(commCoLocated, true);

const streetObserved = getCoLocatedAgents(state, player.id);
console.log(`Co-located agents: ${streetObserved.map((a) => `${a.name} (${a.agentType})`).join(', ')}`);
const elenaObserved = streetObserved.find((a) => a.id === devNpc.id);
assert.ok(elenaObserved);
assert.equal(elenaObserved.name, devNpc.name);
assert.equal(elenaObserved.agentType, 'npc');

const streetInspect = inspectCurrentLocation(state, player.id);
assert.equal(streetInspect.location?.agents.some((a) => a.id === devNpc.id), true);

const streetStatus = {
  worldId: state.worldId,
  schemaVersion: state.version,
  worldTime: state.worldTime,
  activePlayerId: player.id,
};
const streetPresentation = createPresentationModel(streetStatus, streetInspect);
const elenaInPresentation = streetPresentation.agents.find((a) => a.id === devNpc.id);
assert.ok(elenaInPresentation);
console.log(`Presentation model agents includes: ${elenaInPresentation.name}`);
const npcAffordances = streetPresentation.affordances.filter((a) => (a.payload as any)?.targetAgentId === devNpc.id);
console.log(`Affordances generated for NPC: ${npcAffordances.map((a) => a.label).join(', ')}`);
assert.ok(npcAffordances.some((a) => a.commandName === 'greetAgent'));
assert.ok(npcAffordances.some((a) => a.commandName === 'introduceAgent'));
console.log('  -> VERIFIED: Simulation tick dynamically established co-presence and observation on street.\n');

// ---------------------------------------------------------------------------
// Step 4: Authoritative Co-Located Social Interaction
// ---------------------------------------------------------------------------
console.log('--- Step 4: Authoritative Co-Located Social Interaction ---');
console.log(`Player greets ${devNpc.name} on the street...`);
const greetResult = greetAgent(state, player.id, devNpc.id);
console.log(`Greeting result: success=${greetResult.success}, code=${greetResult.code}`);
console.log(`NPC response: "${greetResult.response}"`);
assert.equal(greetResult.success, true);
assert.equal(greetResult.code, 'success');

console.log(`Player introduces to ${devNpc.name}...`);
const introResult = introduceToAgent(state, player.id, devNpc.id);
console.log(`Introduction result: success=${introResult.success}, code=${introResult.code}`);
console.log(`Acquaintance formed: id=${introResult.acquaintance?.id}`);
assert.equal(introResult.success, true);
assert.ok(introResult.acquaintance);
console.log('  -> VERIFIED: Existing social commands succeed through co-presence without new encounter entities.\n');

// ---------------------------------------------------------------------------
// Step 5: Schedule Progression Disperses Agents (Work Shift Phase)
// ---------------------------------------------------------------------------
console.log('--- Step 5: Schedule Progression Disperses Agents ---');
// Advance clock to 09:15 Local (15:15 UTC) -> NPC work shift at restaurant
console.log('Advancing world clock to 09:15 AM Local (work shift phase)...');
clock.advance(40 * 60 * 1000);
sim.tick();

console.log(`dev-npc location: ${devNpc.locationId}`);
console.log(`Player location: ${player.locationId}`);
assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
assert.equal(player.locationId, 'street:development-street');

assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), false);
const streetAgentsAfterWork = getCoLocatedAgents(state, player.id);
assert.equal(streetAgentsAfterWork.some((a) => a.id === devNpc.id), false);

const greetAfterSeparation = greetAgent(state, player.id, devNpc.id);
console.log(`Greeting after separation: success=${greetAfterSeparation.success}, code=${greetAfterSeparation.code}`);
assert.equal(greetAfterSeparation.success, false);
assert.equal(greetAfterSeparation.code, 'agents-not-co-located');
console.log('  -> VERIFIED: Co-presence and observation ended naturally as NPC moved to work.\n');

// ---------------------------------------------------------------------------
// Step 6: Player Follows to Restaurant — Interior Co-Presence
// ---------------------------------------------------------------------------
console.log('--- Step 6: Player Enters Restaurant — Interior Co-Presence ---');
enterBuilding(state, player.id, 'building:development-building');
enterRestaurant(state, player.id, 'restaurant:development-restaurant');
console.log(`Player entered restaurant: ${player.locationId}`);
assert.equal(player.locationId, 'restaurant:development-restaurant');

const restaurantCoLocated = areAgentsCoLocated(state, player.id, devNpc.id);
console.log(`Are player and dev-npc co-located inside restaurant? ${restaurantCoLocated}`);
assert.equal(restaurantCoLocated, true);

const restaurantAgents = getCoLocatedAgents(state, player.id);
console.log(`Restaurant co-located agents: ${restaurantAgents.map((a) => a.name).join(', ')}`);
assert.equal(restaurantAgents.some((a) => a.id === devNpc.id), true);

const workGreetResult = greetAgent(state, player.id, devNpc.id);
console.log(`Work greeting result: success=${workGreetResult.success}`);
console.log(`NPC work greeting response: "${workGreetResult.response}"`);
assert.equal(workGreetResult.success, true);
console.log('  -> VERIFIED: Co-presence re-established in interior venue.\n');

// ---------------------------------------------------------------------------
// Step 7: Schema Invariant & Boundary Verification
// ---------------------------------------------------------------------------
console.log('--- Step 7: Schema Invariant & Boundary Verification ---');
console.log(`World State Schema Version: ${state.version}`);
assert.equal(state.version, 18);
assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
assert.equal((state as any).encounters, undefined);
assert.doesNotThrow(() => validateWorldState(state));
console.log('  -> VERIFIED: Schema version 18 preserved. Zero encounter subsystem, zero persistent encounter entities.');

console.log('\n================================================================');
console.log('Milestone 60 Demo Completed Successfully!');
console.log('================================================================');
