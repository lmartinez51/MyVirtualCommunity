import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  createRealWorldJuarezWorldState,
  validateWorldState,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  purchaseOffering,
  startHavingCoffee,
  startEatingPastry,
  startAccompaniedActivity,
  inquireAgentSchedule,
  inspectCurrentLocation,
  transferItemPossession,
  introduceToAgent,
  makeDevelopmentOfferingAvailable,
  executeRestaurantClosureEgress,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  WorldState,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  evaluateDevelopmentRestaurantOperationalRule,
  getRestaurantClosingTimeMs,
} from '../src/core/entities/restaurant.js';
import { isRestaurantAccessible, isRestaurantOpen } from '../src/core/business.js';
import {
  placeOrder,
  collectOrder,
  ORDER_PREPARATION_DURATION_MS,
} from '../src/core/order.js';
import {
  evaluateRestaurantClosingSoonConsideration,
} from '../src/core/action-consideration.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createPresentationModel } from '../src/client/projections.js';

describe('Milestone 52: Graceful Restaurant Closure Lifecycle', () => {
  const RESTAURANT_ID = 'restaurant:development-restaurant';
  const BUILDING_ID = 'building:development-building';
  const PLAYER_ID = 'agent:dev-player';
  const NPC_ID = 'agent:dev-npc';
  const COFFEE_OFFERING_ID = 'offering:development-coffee';

  function setupStateAt(timeIso: string): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    return { clock, state };
  }

  function setupPlayerInRestaurant(timeIso: string = '2026-09-24T16:00:00.000Z'): { clock: WorldClock; state: WorldState } {
    const { clock, state } = setupStateAt(timeIso);
    enterBuilding(state, PLAYER_ID, BUILDING_ID);
    const enterRes = enterRestaurant(state, PLAYER_ID, RESTAURANT_ID);
    assert.strictEqual(enterRes.success, true);
    const player = state.agents.find((a) => a.id === PLAYER_ID)!;
    assert.strictEqual(player.locationId, RESTAURANT_ID);
    return { clock, state };
  }

  // =========================================================================
  // 1. Authoritative Operational Rule & Accessible State Queries
  // =========================================================================
  describe('1. Operational Rule & Accessible State Queries', () => {
    it('evaluates exact operational state transitions: open [09:00, 16:45), closing-soon [16:45, 17:00), closed otherwise', () => {
      // In America/Ciudad_Juarez (UTC-6 in Sept):
      // Morning before opening: 08:59:59.999 local = 14:59:59.999Z
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-24T14:59:59.999Z', 'America/Ciudad_Juarez'), 'closed');
      // Opening boundary: 09:00:00 local = 15:00:00.000Z
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-24T15:00:00.000Z', 'America/Ciudad_Juarez'), 'open');
      // Midday: 12:00:00 local = 18:00:00.000Z
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-24T18:00:00.000Z', 'America/Ciudad_Juarez'), 'open');
      // Just before closing-soon cutoff: 16:44:59.999 local = 22:44:59.999Z
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-24T22:44:59.999Z', 'America/Ciudad_Juarez'), 'open');
      // Closing-soon cutoff: 16:45:00 local = 22:45:00.000Z
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-24T22:45:00.000Z', 'America/Ciudad_Juarez'), 'closing-soon');
      // Inside closing-soon window: 16:55:00 local = 22:55:00.000Z
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-24T22:55:00.000Z', 'America/Ciudad_Juarez'), 'closing-soon');
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-24T22:59:59.999Z', 'America/Ciudad_Juarez'), 'closing-soon');
      // Final closure boundary: 17:00:00 local = 23:00:00.000Z
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-24T23:00:00.000Z', 'America/Ciudad_Juarez'), 'closed');
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-24T23:00:00.001Z', 'America/Ciudad_Juarez'), 'closed');
      // Night: 22:00:00 local = 2026-09-25T04:00:00.000Z
      assert.strictEqual(evaluateDevelopmentRestaurantOperationalRule('2026-09-25T04:00:00.000Z', 'America/Ciudad_Juarez'), 'closed');
    });

    it('isRestaurantAccessible returns true for open and closing-soon, false for closed', () => {
      const { state } = setupStateAt('2026-09-24T16:00:00.000Z');
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;

      rest.operationalState = 'open';
      assert.strictEqual(isRestaurantAccessible(state, RESTAURANT_ID), true);
      assert.strictEqual(isRestaurantOpen(state, RESTAURANT_ID), true);

      rest.operationalState = 'closing-soon';
      assert.strictEqual(isRestaurantAccessible(state, RESTAURANT_ID), true);
      assert.strictEqual(isRestaurantOpen(state, RESTAURANT_ID), false);

      rest.operationalState = 'closed';
      assert.strictEqual(isRestaurantAccessible(state, RESTAURANT_ID), false);
      assert.strictEqual(isRestaurantOpen(state, RESTAURANT_ID), false);
    });

    it('getRestaurantClosingTimeMs returns exact closing time epoch milliseconds', () => {
      const closingMs = getRestaurantClosingTimeMs(RESTAURANT_ID, '2026-09-24T22:45:00.000Z', 'America/Ciudad_Juarez');
      assert.strictEqual(closingMs, Date.parse('2026-09-24T23:00:00.000Z'));
    });
  });

  // =========================================================================
  // 2. Physical Spatial Access During Lifecycle Phases
  // =========================================================================
  describe('2. Physical Spatial Access', () => {
    it('player can enter restaurant when open', () => {
      const { state } = setupStateAt('2026-09-24T16:00:00.000Z');
      enterBuilding(state, PLAYER_ID, BUILDING_ID);
      const res = enterRestaurant(state, PLAYER_ID, RESTAURANT_ID);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.code, 'success');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, RESTAURANT_ID);
    });

    it('player can enter restaurant during closing-soon window', () => {
      const { state } = setupStateAt('2026-09-24T22:50:00.000Z');
      enterBuilding(state, PLAYER_ID, BUILDING_ID);
      const res = enterRestaurant(state, PLAYER_ID, RESTAURANT_ID);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.code, 'success');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, RESTAURANT_ID);
    });

    it('player entry is rejected with restaurant-closed when closed', () => {
      const { state } = setupStateAt('2026-09-24T23:05:00.000Z');
      enterBuilding(state, PLAYER_ID, BUILDING_ID);
      const res = enterRestaurant(state, PLAYER_ID, RESTAURANT_ID);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'restaurant-closed');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, BUILDING_ID);
    });
  });

  // =========================================================================
  // 3. Commercial Transactions: Purchases & Orders
  // =========================================================================
  describe('3. Commercial Transactions (Purchases & Orders)', () => {
    it('purchase succeeds when restaurant is open', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T16:00:00.000Z');
      const purchaseRes = purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID);
      assert.strictEqual(purchaseRes.success, true);
      assert.strictEqual(purchaseRes.code, 'success');
      assert.ok(purchaseRes.itemId);
    });

    it('new purchase is rejected with restaurant-closing-soon during closing-soon window', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T22:50:00.000Z');
      const res = purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'restaurant-closing-soon');
    });

    it('purchase is rejected with restaurant-closed when closed', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T16:00:00.000Z');
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closed';

      const res = purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'restaurant-closed');
    });

    it('order placement succeeds when restaurant is open (M39 Order Foundation)', () => {
      const clock = WorldClock.create('2026-09-14T16:00:00.000Z');
      const state = createRealWorldJuarezWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;
      leaveBuilding(state, player.id, 'building:real-world-residence');
      enterBuilding(state, player.id, 'building:kentucky-club-building');
      enterRestaurant(state, player.id, 'restaurant:kentucky-club');

      const placeRes = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.strictEqual(placeRes.success, true);
      assert.strictEqual(placeRes.code, 'success');
    });

    it('order placement is rejected with restaurant-closing-soon during closing-soon window', () => {
      const clock = WorldClock.create('2026-09-14T16:00:00.000Z');
      const state = createRealWorldJuarezWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;
      leaveBuilding(state, player.id, 'building:real-world-residence');
      enterBuilding(state, player.id, 'building:kentucky-club-building');
      enterRestaurant(state, player.id, 'restaurant:kentucky-club');

      // Set restaurant to closing-soon
      const rest = state.restaurants.find((r) => r.id === 'restaurant:kentucky-club')!;
      rest.operationalState = 'closing-soon';

      const placeRes = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.strictEqual(placeRes.success, false);
      assert.strictEqual(placeRes.code, 'restaurant-closing-soon');
    });

    it('in-flight order placed before cutoff transitions to ready and can be collected during closing-soon', () => {
      const clock = WorldClock.create('2026-09-14T22:40:00.000Z');
      const state = createRealWorldJuarezWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;
      leaveBuilding(state, player.id, 'building:real-world-residence');
      enterBuilding(state, player.id, 'building:kentucky-club-building');
      enterRestaurant(state, player.id, 'restaurant:kentucky-club');

      const rest = state.restaurants.find((r) => r.id === 'restaurant:kentucky-club')!;
      rest.operationalState = 'open';

      const placeRes = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.strictEqual(placeRes.success, true);
      const orderId = placeRes.orderId!;

      // Transition to closing-soon and advance clock to ready
      rest.operationalState = 'closing-soon';
      clock.advance(ORDER_PREPARATION_DURATION_MS);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      const order = state.orders.find((o) => o.id === orderId)!;
      assert.strictEqual(order.status, 'ready');

      // Collection succeeds during closing-soon
      const collectRes = collectOrder(state, player.id, orderId);
      assert.strictEqual(collectRes.success, true);
      assert.strictEqual(collectRes.code, 'success');
      assert.strictEqual(order.status, 'fulfilled');
    });

    it('order collection is rejected with restaurant-closed when restaurant has closed', () => {
      const clock = WorldClock.create('2026-09-14T22:40:00.000Z');
      const state = createRealWorldJuarezWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;
      leaveBuilding(state, player.id, 'building:real-world-residence');
      enterBuilding(state, player.id, 'building:kentucky-club-building');
      enterRestaurant(state, player.id, 'restaurant:kentucky-club');

      const rest = state.restaurants.find((r) => r.id === 'restaurant:kentucky-club')!;
      rest.operationalState = 'open';

      const placeRes = placeOrder(state, {
        customerId: player.id,
        restaurantId: 'restaurant:kentucky-club',
        lines: [{ offeringId: 'offering:m39-demo-beverage', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      const orderId = placeRes.orderId!;

      // Advance to ready
      clock.advance(ORDER_PREPARATION_DURATION_MS);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      // Now close restaurant
      rest.operationalState = 'closed';

      const collectRes = collectOrder(state, player.id, orderId);
      assert.strictEqual(collectRes.success, false);
      assert.strictEqual(collectRes.code, 'restaurant-closed');
    });
  });

  // =========================================================================
  // 4. Activity Boundary Enforcement
  // =========================================================================
  describe('4. Activity Boundary Enforcement', () => {
    it('consumable activity that finishes before 17:00 succeeds', () => {
      // 16:40 local (22:40Z), 15 min duration -> finishes 16:55 (22:55Z) <= 17:00 (23:00Z)
      const { state } = setupPlayerInRestaurant('2026-09-24T22:40:00.000Z');
      purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID);

      const activityRes = startHavingCoffee(state, PLAYER_ID);
      assert.strictEqual(activityRes.success, true);
      assert.strictEqual(activityRes.code, 'success');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.ok(player.playerActivity);
      assert.strictEqual(player.playerActivity.activity, 'having-coffee');
    });

    it('consumable activity that would extend past 17:00 is rejected with activity-extends-past-closing', () => {
      // 16:50 local (22:50Z), 15 min duration -> finishes 17:05 (23:05Z) > 17:00 (23:00Z)
      const { state } = setupPlayerInRestaurant('2026-09-24T22:30:00.000Z');
      purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID);

      // Advance clock and set closing-soon
      state.worldTime = '2026-09-24T22:50:00.000Z';
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closing-soon';

      const activityRes = startHavingCoffee(state, PLAYER_ID);
      assert.strictEqual(activityRes.success, false);
      assert.strictEqual(activityRes.code, 'activity-extends-past-closing');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.playerActivity, null);
    });

    it('consumable activity that finishes exactly at 17:00:00.000Z succeeds', () => {
      // 16:45:00 local (22:45:00Z), 15 min duration -> finishes exactly 17:00:00 (23:00:00Z) <= 17:00:00
      const { state } = setupPlayerInRestaurant('2026-09-24T22:30:00.000Z');
      purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID);

      state.worldTime = '2026-09-24T22:45:00.000Z';
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closing-soon';

      const activityRes = startHavingCoffee(state, PLAYER_ID);
      assert.strictEqual(activityRes.success, true);
      assert.strictEqual(activityRes.code, 'success');
    });

    it('accompanied activity that would extend past 17:00 is rejected with activity-extends-past-closing', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T22:30:00.000Z');
      introduceToAgent(state, PLAYER_ID, NPC_ID);

      // Co-locate NPC
      const npc = state.agents.find((a) => a.id === NPC_ID)!;
      npc.locationId = RESTAURANT_ID;
      npc.activityState = 'active';

      // Items setup
      purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID, RESTAURANT_ID, { silent: true });
      makeDevelopmentOfferingAvailable(state, NPC_ID, RESTAURANT_ID);
      const pastryPurchase = purchaseOffering(state, PLAYER_ID, DEVELOPMENT_PASTRY_OFFERING_ID, RESTAURANT_ID, { silent: true });
      transferItemPossession(state, PLAYER_ID, NPC_ID, pastryPurchase.itemId!, '2026-09-24T22:30:00.000Z');

      // Advance to 16:50 local (22:50Z) (duration 15m -> ends 17:05 local / 23:05Z > 17:00)
      state.worldTime = '2026-09-24T22:50:00.000Z';
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closing-soon';

      const accompaniedRes = startAccompaniedActivity(state, PLAYER_ID, NPC_ID);
      assert.strictEqual(accompaniedRes.success, false);
      assert.strictEqual(accompaniedRes.code, 'activity-extends-past-closing');

      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.playerActivity, null);
      assert.strictEqual(npc.activityState, 'active');
    });

    it('activity cannot start when restaurant is closed (restaurant-closed)', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T22:30:00.000Z');
      purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID);

      state.worldTime = '2026-09-24T23:05:00.000Z';
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closed';

      const activityRes = startHavingCoffee(state, PLAYER_ID);
      assert.strictEqual(activityRes.success, false);
      assert.strictEqual(activityRes.code, 'restaurant-closed');
    });

    it('in-flight activity started before cutoff completes naturally during closing-soon', () => {
      // Start at 16:35 local (22:35Z) -> completes at 16:50 local (22:50Z). Cutoff is 16:45 local (22:45Z).
      const { clock, state } = setupPlayerInRestaurant('2026-09-24T22:35:00.000Z');
      purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID);
      const actRes = startHavingCoffee(state, PLAYER_ID);
      assert.strictEqual(actRes.success, true);

      const sim = new Simulation(clock, state, { silent: true });

      // Advance to 16:46 local (22:46Z) (closing-soon, activity still in flight)
      clock.advance(11 * 60 * 1000);
      sim.tick();
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      assert.strictEqual(rest.operationalState, 'closing-soon');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.ok(player.playerActivity);
      assert.strictEqual(player.playerActivity.activity, 'having-coffee');
      assert.strictEqual(player.playerActivity.completedAt, null);

      // Advance to 16:51 local (22:51Z) (activity completed at 16:50)
      clock.advance(5 * 60 * 1000);
      sim.tick();
      assert.ok(player.playerActivity.completedAt);
      assert.strictEqual(player.locationId, RESTAURANT_ID);
    });
  });

  // =========================================================================
  // 5. Spatial Occupancy & Authorized Closure Egress
  // =========================================================================
  describe('5. Spatial Occupancy & Authorized Closure Egress', () => {
    it('occupant remains in restaurant during closing-soon without teleportation', () => {
      const { clock, state } = setupPlayerInRestaurant('2026-09-24T22:40:00.000Z');
      const sim = new Simulation(clock, state, { silent: true });

      // Advance to 16:45:00 local (22:45:00.000Z)
      clock.advance(5 * 60 * 1000);
      sim.tick();

      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      assert.strictEqual(rest.operationalState, 'closing-soon');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, RESTAURANT_ID);
    });

    it('executeRestaurantClosureEgress relocates occupants to containing buildingId', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T22:50:00.000Z');
      // Co-locate NPC
      const npc = state.agents.find((a) => a.id === NPC_ID)!;
      npc.locationId = RESTAURANT_ID;

      // Close restaurant
      state.worldTime = '2026-09-24T23:00:00.000Z';
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closed';

      const egressRes = executeRestaurantClosureEgress(state, RESTAURANT_ID);
      assert.strictEqual(egressRes.length, 2);
      assert.strictEqual(egressRes[0].newLocationId, BUILDING_ID);
      assert.strictEqual(egressRes[0].restaurantId, RESTAURANT_ID);
      const egressedIds = egressRes.map((r) => r.agentId).sort();
      assert.deepEqual(egressedIds, [NPC_ID, PLAYER_ID].sort());

      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, BUILDING_ID);
      assert.strictEqual(npc.locationId, BUILDING_ID);
    });

    it('simulation tick crossing 17:00 performs closure egress and returns transitions', () => {
      const { clock, state } = setupPlayerInRestaurant('2026-09-24T22:55:00.000Z');
      const sim = new Simulation(clock, state, { silent: true });

      // Tick at 16:55 local (22:55Z): closing soon
      sim.tick();
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      assert.strictEqual(rest.operationalState, 'closing-soon');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, RESTAURANT_ID);

      // Advance clock across 17:00:00 local (23:00:00Z)
      clock.advance(10 * 60 * 1000); // 23:05:00.000Z
      const tickResult = sim.tick();

      assert.strictEqual(rest.operationalState, 'closed');
      assert.strictEqual(player.locationId, BUILDING_ID);
      assert.ok(tickResult.closureEgressTransitions);
      assert.strictEqual(tickResult.closureEgressTransitions.length, 1);
      assert.strictEqual(tickResult.closureEgressTransitions[0].restaurantId, RESTAURANT_ID);
      assert.strictEqual(tickResult.closureEgressTransitions[0].newLocationId, BUILDING_ID);
      assert.strictEqual(tickResult.closureEgressTransitions[0].agentId, PLAYER_ID);
    });

    it('agents already outside restaurant are unaffected by closure egress', () => {
      const { clock, state } = setupStateAt('2026-09-24T22:55:00.000Z');
      enterBuilding(state, PLAYER_ID, BUILDING_ID);
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, BUILDING_ID);

      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(10 * 60 * 1000); // 23:05:00.000Z
      const tickResult = sim.tick();

      assert.strictEqual(player.locationId, BUILDING_ID);
      const egressed = tickResult.closureEgressTransitions?.map((t) => t.agentId) ?? [];
      assert.strictEqual(egressed.includes(PLAYER_ID), false);
    });

    it('crossing both boundaries in a single large tick (16:30 -> 17:15) handles egress cleanly', () => {
      const { clock, state } = setupPlayerInRestaurant('2026-09-24T22:30:00.000Z');
      const sim = new Simulation(clock, state, { silent: true });

      // Advance directly across both 16:45 and 17:00 local (22:45Z and 23:00Z)
      clock.advance(45 * 60 * 1000); // 23:15:00.000Z
      const tickResult = sim.tick();

      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      assert.strictEqual(rest.operationalState, 'closed');
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, BUILDING_ID);
      assert.ok(tickResult.closureEgressTransitions);
      assert.strictEqual(tickResult.closureEgressTransitions[0].agentId, PLAYER_ID);
      assert.strictEqual(tickResult.closureEgressTransitions[0].newLocationId, BUILDING_ID);
    });

    it('subsequent ticks when already closed do not re-trigger egress transitions', () => {
      const { clock, state } = setupPlayerInRestaurant('2026-09-24T22:55:00.000Z');
      const sim = new Simulation(clock, state, { silent: true });

      // Advance to 17:00 local (23:00Z): first tick triggers egress
      clock.advance(5 * 60 * 1000);
      const firstTick = sim.tick();
      assert.ok(firstTick.closureEgressTransitions);
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.strictEqual(player.locationId, BUILDING_ID);

      // Second tick when restaurant is still closed and empty
      clock.advance(60 * 1000);
      const secondTick = sim.tick();
      assert.strictEqual(secondTick.closureEgressTransitions, undefined);
    });
  });

  // =========================================================================
  // 6. Action Considerations & Client Presentation
  // =========================================================================
  describe('6. Action Considerations & Projections', () => {
    it('evaluateRestaurantClosingSoonConsideration returns consideration when player inside closing-soon restaurant', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T22:50:00.000Z');
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closing-soon';

      const consideration = evaluateRestaurantClosingSoonConsideration(state, PLAYER_ID);
      assert.ok(consideration);
      assert.strictEqual(consideration.action, 'exitRestaurant');
      assert.strictEqual(consideration.targetId, RESTAURANT_ID);
      assert.strictEqual(consideration.considered, true);
      assert.strictEqual(consideration.reason, 'restaurant-closing-soon');
      assert.ok(consideration.description?.includes('closing soon'));
    });

    it('evaluateRestaurantClosingSoonConsideration returns considered false when open, closed, or player outside', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T16:00:00.000Z');
      // Open -> considered false
      assert.strictEqual(evaluateRestaurantClosingSoonConsideration(state, PLAYER_ID).considered, false);

      // Closed -> considered false
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closed';
      assert.strictEqual(evaluateRestaurantClosingSoonConsideration(state, PLAYER_ID).considered, false);

      // Player outside -> considered false
      rest.operationalState = 'closing-soon';
      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      player.locationId = BUILDING_ID;
      assert.strictEqual(evaluateRestaurantClosingSoonConsideration(state, PLAYER_ID).considered, false);
    });

    it('inspectCurrentLocation attaches closingSoonConsideration during closing-soon window', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T22:50:00.000Z');
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closing-soon';

      const inspection = inspectCurrentLocation(state, PLAYER_ID);
      const exitConsideration = inspection.actionConsiderations?.find((c) => c.action === 'exitRestaurant');
      assert.ok(exitConsideration);
      assert.strictEqual(exitConsideration.reason, 'restaurant-closing-soon');
      assert.ok(exitConsideration.description?.includes('closing soon'));
    });

    it('createPresentationModel reflects operationalState closing-soon and attaches exit hint', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T22:50:00.000Z');
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closing-soon';

      const loc = inspectCurrentLocation(state, PLAYER_ID);
      const model = createPresentationModel(
        { activePlayerId: PLAYER_ID, worldTime: state.worldTime, schemaVersion: CURRENT_WORLD_STATE_VERSION },
        loc as unknown as Record<string, unknown>
      );
      assert.strictEqual(model.operationalState, 'closing-soon');
      const exitAffordance = model.affordances.find((a) => a.commandName === 'exitRestaurant');
      assert.ok(exitAffordance);
      assert.ok(exitAffordance.hint?.includes('closing soon'));
    });
  });

  // =========================================================================
  // 7. Persistence & Offline Simulation Leap
  // =========================================================================
  describe('7. Persistence & Offline Simulation Leap', () => {
    it('player disconnects inside restaurant at 16:40, world advances past 17:00, reload reconciles player to building lobby', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'm52-offline-'));
      try {
        const filePath = join(testDir, 'world-state.json');
        const persistence = new LocalFilePersistence(filePath);

        // Session 1: Player enters restaurant at 16:40 local (22:40:00.000Z)
        const clock1 = WorldClock.create('2026-09-24T22:40:00.000Z');
        const state1 = createInitialWorldState(clock1);
        enterBuilding(state1, PLAYER_ID, BUILDING_ID);
        enterRestaurant(state1, PLAYER_ID, RESTAURANT_ID);

        const player1 = state1.agents.find((a) => a.id === PLAYER_ID)!;
        assert.strictEqual(player1.locationId, RESTAURANT_ID);

        // Save to disk
        persistence.save(state1);

        // Offline time leap: 30 minutes pass (to 17:10 local / 23:10:00.000Z)
        const clock2 = WorldClock.create('2026-09-24T23:10:00.000Z');
        const loadedState = persistence.load();
        assert.ok(loadedState);

        // Run simulation tick at new time
        const sim = new Simulation(clock2, loadedState, { silent: true });
        const tickResult = sim.tick();

        const restLoaded = loadedState.restaurants.find((r) => r.id === RESTAURANT_ID)!;
        assert.strictEqual(restLoaded.operationalState, 'closed');

        const playerLoaded = loadedState.agents.find((a) => a.id === PLAYER_ID)!;
        assert.strictEqual(playerLoaded.locationId, BUILDING_ID);
        assert.ok(tickResult.closureEgressTransitions);

        // Schema validation remains strictly valid at version 18
        assert.strictEqual(loadedState.version, CURRENT_WORLD_STATE_VERSION);
        validateWorldState(loadedState);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // 8. Non-Regression of Milestone 48, 49, 50, 51 Flows
  // =========================================================================
  describe('8. Non-Regression (M48–M51 Flows During Open Hours)', () => {
    it('M48: schedule inquiry succeeds during open hours', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T17:00:00.000Z');
      const npc = state.agents.find((a) => a.id === NPC_ID)!;
      npc.locationId = RESTAURANT_ID;
      npc.activityState = 'active';

      introduceToAgent(state, PLAYER_ID, NPC_ID);

      const res = inquireAgentSchedule(state, PLAYER_ID, NPC_ID);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.code, 'success');
      assert.ok(res.schedule);
      assert.strictEqual(res.schedule.workplaceId, RESTAURANT_ID);
    });

    it('M49: pastry purchase and consumption succeeds during open hours', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T17:00:00.000Z');
      const npc = state.agents.find((a) => a.id === NPC_ID)!;
      npc.locationId = RESTAURANT_ID;
      npc.activityState = 'active';

      makeDevelopmentOfferingAvailable(state, NPC_ID, RESTAURANT_ID);

      const purchaseRes = purchaseOffering(state, PLAYER_ID, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.strictEqual(purchaseRes.success, true);
      assert.strictEqual(purchaseRes.code, 'success');
      assert.ok(purchaseRes.itemId);

      const eatRes = startEatingPastry(state, PLAYER_ID);
      assert.strictEqual(eatRes.success, true);
      assert.strictEqual(eatRes.code, 'success');
    });

    it('M50: item handoff succeeds during open hours', () => {
      const { state } = setupPlayerInRestaurant('2026-09-24T17:00:00.000Z');
      const npc = state.agents.find((a) => a.id === NPC_ID)!;
      npc.locationId = RESTAURANT_ID;
      npc.activityState = 'active';

      introduceToAgent(state, PLAYER_ID, NPC_ID);

      makeDevelopmentOfferingAvailable(state, NPC_ID, RESTAURANT_ID);
      const purchaseRes = purchaseOffering(state, PLAYER_ID, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.strictEqual(purchaseRes.success, true);

      const transferRes = transferItemPossession(
        state,
        PLAYER_ID,
        NPC_ID,
        purchaseRes.itemId!,
        '2026-09-24T17:00:00.000Z'
      );
      assert.strictEqual(transferRes.success, true);
      assert.strictEqual(transferRes.code, 'success');
    });

    it('M51: accompanied consumable activity succeeds during open hours', () => {
      const { clock, state } = setupPlayerInRestaurant('2026-09-24T17:00:00.000Z');
      const npc = state.agents.find((a) => a.id === NPC_ID)!;
      npc.locationId = RESTAURANT_ID;
      npc.activityState = 'active';

      introduceToAgent(state, PLAYER_ID, NPC_ID);

      const coffeeRes = purchaseOffering(state, PLAYER_ID, COFFEE_OFFERING_ID);
      assert.strictEqual(coffeeRes.success, true);

      makeDevelopmentOfferingAvailable(state, NPC_ID, RESTAURANT_ID);
      const pastryRes = purchaseOffering(state, PLAYER_ID, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.strictEqual(pastryRes.success, true);
      transferItemPossession(state, PLAYER_ID, NPC_ID, pastryRes.itemId!, '2026-09-24T17:00:00.000Z');

      const accompaniedRes = startAccompaniedActivity(state, PLAYER_ID, NPC_ID);
      assert.strictEqual(accompaniedRes.success, true);
      assert.strictEqual(accompaniedRes.code, 'success');

      // Verify completion via simulation
      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(16 * 60 * 1000);
      sim.tick();

      const player = state.agents.find((a) => a.id === PLAYER_ID)!;
      assert.ok(player.playerActivity?.completedAt);
      assert.strictEqual(npc.activityState, 'active');
      assert.strictEqual(state.activityCompletions.length >= 1, true);
    });
  });
});
