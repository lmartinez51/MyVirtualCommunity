import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  introduceToAgent,
  isAgentAcquainted,
  inquireAgentSchedule,
  inspectCurrentLocation,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  purchaseOffering,
  inspectPlayerHistory,
  DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID,
  DEVELOPMENT_PASTRY_OFFERING_ID,
} from '../src/core/world-state.js';

console.log('================================================================');
console.log('MILESTONE 26: MINIMAL RELATIONAL INQUIRY & EPISTEMIC GROUNDING');
console.log('================================================================\n');

try {
  // === STEP 1: World Initialized ===
  console.log('=== STEP 1: World Initialized ===');
  const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
  const state = createInitialWorldState(clock);
  validateWorldState(state);
  assert.equal(state.version, 15);
  const sim = new Simulation(clock, state, { silent: true });

  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
  const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

  console.log(`[STATE] World Time: ${state.worldTime}`);
  console.log(`[STATE] Player Location: ${player.locationId}`);
  console.log(`[STATE] NPC Location: ${npc.locationId}`);
  console.log(`[STATE] Initial Acquaintance: ${isAgentAcquainted(state, player.id, npc.id)}\n`);
  assert.equal(isAgentAcquainted(state, player.id, npc.id), false);

  // === STEP 2: NPC/Player Encounter Established ===
  console.log('=== STEP 2: NPC/Player Encounter Established ===');
  // At 08:00, player leaves building to street where NPC residence is located
  const leaveResult = leaveBuilding(state, player.id, 'building:development-building');
  assert.equal(leaveResult.success, true);
  assert.equal(player.locationId, 'street:development-street');

  // Co-locate at street
  npc.locationId = 'street:development-street';
  console.log(`[SPATIAL] Both agents co-located at: ${player.locationId}\n`);
  assert.equal(player.locationId, npc.locationId);

  // === STEP 3: Stranger Inquiry Rejected ===
  console.log('=== STEP 3: Stranger Inquiry Rejected ===');
  console.log('[ACTION] Unacquainted player attempts inquireAgentSchedule()...');
  const strangerInquiry = inquireAgentSchedule(state, player.id, npc.id);
  console.log(`[RESULT] success: ${strangerInquiry.success}, code: "${strangerInquiry.code}"`);
  console.log(`[MESSAGE] "${strangerInquiry.message}"\n`);
  assert.equal(strangerInquiry.success, false);
  assert.equal(strangerInquiry.code, 'not-acquainted');
  assert.equal(strangerInquiry.schedule, undefined);

  // === STEP 4: Player Explicitly Introduces to NPC ===
  console.log('=== STEP 4: Player Explicitly Introduces to NPC ===');
  console.log('[ACTION] Player introduces to NPC via introduceToAgent()...');
  const introResult = introduceToAgent(state, player.id, npc.id);
  assert.equal(introResult.success, true);
  assert.equal(introResult.code, 'success');
  console.log(`[RESULT] success: ${introResult.success}, code: "${introResult.code}"\n`);

  // === STEP 5: Acquaintance Now Exists ===
  console.log('=== STEP 5: Acquaintance Now Exists ===');
  const acquainted = isAgentAcquainted(state, player.id, npc.id);
  console.log(`[STATE] isAgentAcquainted: ${acquainted}`);
  assert.equal(acquainted, true);
  assert.equal(state.acquaintances.length, 1);
  console.log(`[STATE] Persistent Dyad: ${state.acquaintances[0].id}\n`);

  // === STEP 6: NPC and Player Co-Located During Morning Commute ===
  console.log('=== STEP 6: NPC and Player Co-Located During Morning Commute ===');
  // Advance clock to 08:35 UTC (commute window [08:30, 09:00))
  clock.advance(35 * 60_000);
  sim.tick();
  console.log(`[SIMULATION] Clock advanced to ${state.worldTime}`);
  console.log(`[SIMULATION] NPC routine targets: ${npc.locationId}`);
  assert.equal(npc.locationId, 'street:development-street');
  assert.equal(player.locationId, 'street:development-street');
  console.log(`[SPATIAL] Both agents co-located on street during commute.\n`);

  // === STEP 7: Player Explicitly Inquires About NPC's Schedule ===
  console.log('=== STEP 7: Player Explicitly Inquires About NPC Schedule ===');
  console.log('[ACTION] Acquainted player executes inquireAgentSchedule()...');
  const inquiryResult = inquireAgentSchedule(state, player.id, npc.id);
  console.log(`[RESULT] success: ${inquiryResult.success}, code: "${inquiryResult.code}"`);
  console.log(`[MESSAGE] "${inquiryResult.message}"\n`);
  assert.equal(inquiryResult.success, true);
  assert.equal(inquiryResult.code, 'success');
  assert.ok(inquiryResult.schedule);

  // === STEP 8: NPC Schedule Is Returned (Epistemic Boundary Enforced) ===
  console.log('=== STEP 8: NPC Schedule Is Returned ===');
  console.log(`[DISCLOSURE] Workplace:   ${inquiryResult.schedule.workplaceId}`);
  console.log(`[DISCLOSURE] Shift Start: ${inquiryResult.schedule.shiftStart}`);
  console.log(`[DISCLOSURE] Shift End:   ${inquiryResult.schedule.shiftEnd}`);
  console.log(`[EPISTEMIC BOUNDARY] Offering ID present? ${'offeringId' in inquiryResult.schedule}`);
  assert.equal(inquiryResult.schedule.workplaceId, 'restaurant:development-restaurant');
  assert.equal(inquiryResult.schedule.shiftStart, '09:00');
  assert.equal(inquiryResult.schedule.shiftEnd, '17:00');
  assert.equal((inquiryResult.schedule as Record<string, unknown>).offeringId, undefined);
  console.log('>>> Verified: No product or simulation truth leaked through inquiry.\n');

  // === STEP 9: Player Uses Schedule to Travel to Restaurant ===
  console.log('=== STEP 9: Player Uses Schedule to Travel to Restaurant ===');
  console.log('[ACTION] Player navigates to workplace: street -> building...');
  const enterBuildingResult = enterBuilding(state, player.id, 'building:development-building');
  assert.equal(enterBuildingResult.success, true);
  assert.equal(player.locationId, 'building:development-building');
  console.log(`[SPATIAL] Player reached containing building: ${player.locationId}\n`);

  // === STEP 10: World Reaches the NPC's Work Period ===
  console.log("=== STEP 10: World Reaches NPC's Work Period ===");
  // Advance to 09:00:00 UTC (Work shift [09:00, 17:00))
  clock.advance(25 * 60_000);
  sim.tick();
  console.log(`[SIMULATION] Clock advanced to ${state.worldTime}`);
  console.log(`[SIMULATION] Restaurant Operational State: ${restaurant.operationalState}`);
  console.log(`[SIMULATION] NPC Location: ${npc.locationId}, Activity: ${npc.activityState}`);
  assert.equal(restaurant.operationalState, 'open');
  assert.equal(npc.locationId, 'restaurant:development-restaurant');
  assert.equal(npc.activityState, 'active');
  assert.equal(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID), true);
  console.log('>>> Verified: World simulation independently activated NPC shift and pastry offering.\n');

  console.log('[ACTION] Player enters open restaurant during shift...');
  const enterRestaurantResult = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
  assert.equal(enterRestaurantResult.success, true);
  assert.equal(player.locationId, 'restaurant:development-restaurant');
  console.log(`[SPATIAL] Player reached restaurant: ${player.locationId}\n`);

  // === STEP 11: Existing Pan Dulce Opportunity Appears Independently ===
  console.log('=== STEP 11: Existing Pan Dulce Opportunity Appears Independently ===');
  console.log('[PERCEPTION] Player inspects current location...');
  const perception = inspectCurrentLocation(state, player.id);
  assert.equal(perception.success, true);
  const opps = perception.location?.opportunities ?? [];
  console.log(`[PERCEPTION] Opportunities discovered: ${opps.length}`);
  assert.equal(opps.length, 1);
  assert.equal(opps[0].id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
  assert.equal(opps[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
  console.log(`[OPPORTUNITY] ID:          ${opps[0].id}`);
  console.log(`[OPPORTUNITY] Name:        ${opps[0].name}`);
  console.log(`[OPPORTUNITY] Offering ID: ${opps[0].offeringId}\n`);

  // === STEP 12: Player Decides to Purchase ===
  console.log('=== STEP 12: Player Decides to Purchase ===');
  const playerInitialBalance = player.balanceMinor;
  console.log(`[ACTION] Player purchases offering "${opps[0].offeringId}"...`);
  const purchaseResult = purchaseOffering(state, player.id, opps[0].offeringId, restaurant.id);
  assert.equal(purchaseResult.success, true);
  assert.equal(purchaseResult.code, 'success');
  console.log(`[PURCHASE] Player balance before: ${playerInitialBalance}, after: ${player.balanceMinor}`);
  assert.equal(player.balanceMinor, playerInitialBalance - 250);
  assert.equal(restaurant.balanceMinor, 250);
  console.log(`[PURCHASE] Transaction completed successfully.\n`);

  // === STEP 13: Existing Purchase History Records Transaction ===
  console.log('=== STEP 13: Existing Purchase History Records Transaction ===');
  const history = inspectPlayerHistory(state, player.id);
  assert.equal(history.success, true);
  assert.equal(history.history?.purchases.length, 1);
  const record = history.history?.purchases[0]!;
  console.log(`[HISTORY] Purchase Record ID: ${record.id}`);
  console.log(`[HISTORY] Offering ID:        ${record.offeringId}`);
  console.log(`[HISTORY] Amount Minor:       ${record.amountMinor} ${record.currency}`);
  console.log(`[HISTORY] Timestamp:          ${record.worldTime}\n`);
  assert.equal(record.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

  console.log('================================================================');
  console.log('CAUSAL DISTINCTION VERIFIED:');
  console.log('  1. INQUIRY did NOT create Pan Dulce.');
  console.log('  2. INQUIRY provided SCHEDULE INFORMATION only.');
  console.log('  3. WORLD SIMULATION created Pan Dulce availability.');
  console.log('  4. PLAYER PERCEPTION discovered Pan Dulce opportunity.');
  console.log('  5. PLAYER DECISION caused purchase.');
  console.log('DEMONSTRATION COMPLETED SUCCESSFULLY');
  console.log('================================================================');
} catch (error) {
  console.error('\nDEMONSTRATION FAILED:', error);
  process.exit(1);
}
