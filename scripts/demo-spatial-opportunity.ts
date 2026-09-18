import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  inspectCurrentLocation,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  purchaseOffering,
  exitRestaurant,
  DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID,
  DEVELOPMENT_PASTRY_OFFERING_ID,
} from '../src/core/world-state.js';

console.log('================================================================');
console.log('MILESTONE 27: SPATIAL OPPORTUNITY PERCEPTION ACROSS STOREFRONT');
console.log('================================================================\n');

try {
  // === STEP 1: Bootstrap world at 09:00 UTC ===
  console.log('=== STEP 1: Bootstrap world at 09:00 UTC ===');
  const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
  const state = createInitialWorldState(clock);
  validateWorldState(state);
  assert.equal(state.version, 12);
  const sim = new Simulation(clock, state, { silent: true });
  sim.tick(); // Apply initial time-driven transitions: restaurant opens, NPC is active on shift, pastry is published

  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
  const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

  console.log(`[STATE] World Time: ${state.worldTime}`);
  console.log(`[STATE] Restaurant State: ${restaurant.operationalState}`);
  console.log(`[STATE] NPC Location: ${npc.locationId}, Activity: ${npc.activityState}`);
  console.log(`[STATE] Player Initial Location: ${player.locationId}\n`);
  assert.equal(restaurant.operationalState, 'open');
  assert.equal(npc.locationId, 'restaurant:development-restaurant');
  assert.equal(npc.activityState, 'active');

  // === STEP 2: Player moves to development street ===
  console.log('=== STEP 2: Player moves to development street ===');
  const leaveBuildingRes = leaveBuilding(state, player.id, 'building:development-building', { silent: true });
  assert.equal(leaveBuildingRes.success, true);
  assert.equal(player.locationId, 'street:development-street');
  console.log(`[SPATIAL] Player Location: ${player.locationId}\n`);

  // === STEP 3: Inspect street (Street Opacity Invariant) ===
  console.log('=== STEP 3: Inspect street (Street Opacity Invariant) ===');
  console.log('[PERCEPTION] Player calls inspectCurrentLocation() on street...');
  const streetPerception = inspectCurrentLocation(state, player.id);
  assert.equal(streetPerception.success, true);
  assert.ok(streetPerception.location);
  console.log(`[PERCEPTION] Location Type: ${streetPerception.location.type}`);
  console.log(`[PERCEPTION] Accessible Buildings: ${streetPerception.location.accessibleBuildings?.map((b) => b.name).join(', ')}`);
  console.log(`[PERCEPTION] Opportunities: ${streetPerception.location.opportunities}`);
  assert.equal(streetPerception.location.opportunities, undefined);
  console.log('>> Confirmed: Street does NOT perceive contained restaurant opportunities (opaque exterior).\n');

  // === STEP 4: Enter development building ===
  console.log('=== STEP 4: Player enters development building ===');
  console.log('[ACTION] Player enters building:development-building...');
  const enterBldgRes = enterBuilding(state, player.id, 'building:development-building', { silent: true });
  assert.equal(enterBldgRes.success, true);
  assert.equal(player.locationId, 'building:development-building');
  console.log(`[SPATIAL] Player now inside: ${player.locationId}\n`);

  // === STEP 5: Inspect building (Storefront Threshold Affordance) ===
  console.log('=== STEP 5: Inspect building (Storefront Threshold Affordance) ===');
  console.log('[PERCEPTION] Player calls inspectCurrentLocation() in building lobby...');
  const bldgPerception = inspectCurrentLocation(state, player.id);
  assert.equal(bldgPerception.success, true);
  assert.ok(bldgPerception.location);
  assert.ok(bldgPerception.location.opportunities);
  assert.equal(bldgPerception.location.opportunities.length, 1);

  const opp = bldgPerception.location.opportunities[0];
  console.log(`[OPPORTUNITY] ID: ${opp.id}`);
  console.log(`[OPPORTUNITY] Name: "${opp.name}"`);
  console.log(`[OPPORTUNITY] Description: "${opp.description}"`);
  console.log(`[OPPORTUNITY] Target Offering: ${opp.offeringId}`);
  console.log(`[OPPORTUNITY] Destination Restaurant: ${opp.restaurantId}`);
  assert.equal(opp.id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
  assert.equal(opp.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
  assert.equal(opp.restaurantId, 'restaurant:development-restaurant');
  console.log('>> Confirmed: Building exposes storefront opportunity with authentic restaurantId.\n');

  // === STEP 6: Explicit Navigation via Perceived restaurantId ===
  console.log('=== STEP 6: Explicit Navigation via Perceived restaurantId ===');
  console.log(`[DECISION] Player uses perceived restaurantId ("${opp.restaurantId}") to enter restaurant...`);
  const enterRestRes = enterRestaurant(state, player.id, opp.restaurantId!, { silent: true });
  assert.equal(enterRestRes.success, true);
  assert.equal(player.locationId, opp.restaurantId);
  console.log(`[SPATIAL] Player entered: ${player.locationId}\n`);

  // === STEP 7: Explicit Purchase via Perceived offeringId ===
  console.log('=== STEP 7: Explicit Purchase via Perceived offeringId ===');
  console.log(`[DECISION] Player purchases offering ("${opp.offeringId}")...`);
  const initialBalance = player.balanceMinor;
  const purchaseRes = purchaseOffering(state, player.id, opp.offeringId, { silent: true });
  assert.equal(purchaseRes.success, true);
  assert.equal(purchaseRes.code, 'success');
  console.log(`[PURCHASE] Success: ${purchaseRes.success}, Amount: ${purchaseRes.amountMinor} minor units`);
  console.log(`[BALANCE] Player balance: ${initialBalance} -> ${player.balanceMinor} minor units\n`);
  assert.equal(player.balanceMinor, initialBalance - purchaseRes.amountMinor!);

  // === STEP 8: Advance to 17:00 and Execute Normal Simulation Transition ===
  console.log('=== STEP 8: Advance to 17:00 and Execute Normal Simulation Transition ===');
  clock.advance(8 * 3600_000); // 09:00 -> 17:00 UTC
  sim.tick();
  console.log(`[TIME] World Time advanced to: ${state.worldTime}`);
  console.log(`[STATE] Restaurant operationalState: ${restaurant.operationalState}`);
  console.log(`[STATE] NPC activityState: ${npc.activityState}\n`);
  assert.equal(restaurant.operationalState, 'closed');

  // === STEP 9: Return to Building & Verify Opportunity Absence ===
  console.log('=== STEP 9: Return to Building & Verify Opportunity Absence ===');
  const exitRestRes = exitRestaurant(state, player.id, 'restaurant:development-restaurant');
  assert.equal(exitRestRes.success, true);
  assert.equal(player.locationId, 'building:development-building');

  const afterClosePerception = inspectCurrentLocation(state, player.id);
  assert.equal(afterClosePerception.success, true);
  assert.ok(afterClosePerception.location);
  console.log(`[PERCEPTION] Player in building at 17:00 UTC.`);
  console.log(`[PERCEPTION] Opportunities: ${afterClosePerception.location.opportunities}`);
  assert.ok(
    afterClosePerception.location.opportunities === undefined ||
      afterClosePerception.location.opportunities.length === 0
  );
  console.log('>> Confirmed: Opportunity is no longer projected at building after closing transition.\n');

  console.log('================================================================');
  console.log('MILESTONE 27 DEMONSTRATION COMPLETE: ALL CAUSAL STEPS VERIFIED');
  console.log('================================================================');
} catch (error) {
  console.error('[DEMO FAILED]', error);
  process.exit(1);
}
