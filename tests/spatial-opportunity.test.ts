import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  inspectCurrentLocation,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  purchaseOffering,
  retireDevelopmentOffering,
  WorldState,
  DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID,
  DEVELOPMENT_PASTRY_OFFERING_ID,
} from '../src/core/world-state.js';
import { Restaurant } from '../src/core/entities/restaurant.js';

describe('Milestone 27: Spatial Opportunity Perception Across Building Storefront Boundary', () => {
  const MORNING_OPEN_TIME = '2026-09-14T09:00:00.000Z';
  const PRE_SHIFT_TIME = '2026-09-14T08:00:00.000Z';
  const CLOSING_TIME = '2026-09-14T17:00:00.000Z';

  function setupWorldAt(timeIso: string = MORNING_OPEN_TIME): {
    clock: WorldClock;
    state: WorldState;
    sim: Simulation;
  } {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    return { clock, state, sim };
  }

  // =========================================================================
  // 1. Building Storefront Perception & Destination Integrity
  // =========================================================================
  describe('1. Building Storefront Perception & Destination Integrity', () => {
    test('Scenario 1 & 8: Active opportunity is projected at building with authentic restaurantId and offeringId', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.strictEqual(player.locationId, 'building:development-building');

      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      const offering = state.offerings.find((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID)!;
      assert.strictEqual(restaurant.operationalState, 'open');
      assert.ok(offering);

      const result = inspectCurrentLocation(state, player.id);
      assert.strictEqual(result.success, true);
      assert.ok(result.location);
      assert.strictEqual(result.location.type, 'building');
      assert.ok(Array.isArray(result.location.opportunities));
      assert.strictEqual(result.location.opportunities.length, 1);

      const opp = result.location.opportunities[0];
      assert.strictEqual(opp.id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
      assert.strictEqual(opp.name, 'Pan Dulce Available');
      assert.strictEqual(
        opp.description,
        'Pan Dulce is available while the restaurant is open and the NPC is working.'
      );
      assert.strictEqual(opp.offeringId, offering.id);
      assert.strictEqual(opp.restaurantId, restaurant.id);
    });

    test('Scenario 10: Existing restaurant-level perception remains valid and includes restaurantId', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const enterResult = enterRestaurant(state, player.id, 'restaurant:development-restaurant', {
        silent: true,
      });
      assert.strictEqual(enterResult.success, true);

      const result = inspectCurrentLocation(state, player.id);
      assert.strictEqual(result.success, true);
      assert.ok(result.location);
      assert.strictEqual(result.location.type, 'restaurant');
      assert.ok(Array.isArray(result.location.opportunities));
      assert.strictEqual(result.location.opportunities.length, 1);

      const opp = result.location.opportunities[0];
      assert.strictEqual(opp.id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
      assert.strictEqual(opp.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.strictEqual(opp.restaurantId, 'restaurant:development-restaurant');
    });
  });

  // =========================================================================
  // 2. Temporal Counterfactuals (Schedule Boundaries)
  // =========================================================================
  describe('2. Temporal Counterfactuals (Schedule Boundaries)', () => {
    test('Scenario 2: Pre-shift (08:00 UTC) building inspection does not contain Pan Dulce opportunity', () => {
      const { state, sim } = setupWorldAt(PRE_SHIFT_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.strictEqual(player.locationId, 'building:development-building');

      const result = inspectCurrentLocation(state, player.id);
      assert.strictEqual(result.success, true);
      assert.ok(result.location);
      assert.strictEqual(result.location.type, 'building');
      // Opportunities must be undefined or empty
      assert.ok(
        result.location.opportunities === undefined || result.location.opportunities.length === 0
      );
    });

    test('Scenario 3: Closing boundary (17:00 UTC) removes opportunity after normal simulation transition', () => {
      const { clock, state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Confirm opportunity exists at 09:00 UTC
      const midInspection = inspectCurrentLocation(state, player.id);
      assert.strictEqual(midInspection.location?.opportunities?.length, 1);

      // Advance to 17:00 UTC closing boundary and tick simulation
      clock.advance(8 * 3600_000);
      sim.tick();

      const closeInspection = inspectCurrentLocation(state, player.id);
      assert.strictEqual(closeInspection.success, true);
      assert.ok(closeInspection.location);
      assert.strictEqual(closeInspection.location.type, 'building');
      assert.ok(
        closeInspection.location.opportunities === undefined ||
          closeInspection.location.opportunities.length === 0
      );
    });
  });

  // =========================================================================
  // 3. World-State Dependencies (Counterfactual Robustness)
  // =========================================================================
  describe('3. World-State Dependencies (Counterfactual Robustness)', () => {
    test('Scenario 4: NPC inactive or absent yields no opportunity at building', () => {
      // 4A: NPC absent from restaurant
      const { state: stateA, sim: simA } = setupWorldAt(MORNING_OPEN_TIME);
      simA.tick();
      const playerA = stateA.agents.find((a) => a.id === 'agent:dev-player')!;
      const npcA = stateA.agents.find((a) => a.id === 'agent:dev-npc')!;
      npcA.locationId = 'street:development-street'; // Move NPC out of restaurant

      const resA = inspectCurrentLocation(stateA, playerA.id);
      assert.ok(resA.location?.opportunities === undefined || resA.location?.opportunities.length === 0);

      // 4B: NPC present but activityState is resting/idle
      const { state: stateB, sim: simB } = setupWorldAt(MORNING_OPEN_TIME);
      simB.tick();
      const playerB = stateB.agents.find((a) => a.id === 'agent:dev-player')!;
      const npcB = stateB.agents.find((a) => a.id === 'agent:dev-npc')!;
      npcB.activityState = 'resting';

      const resB = inspectCurrentLocation(stateB, playerB.id);
      assert.ok(resB.location?.opportunities === undefined || resB.location?.opportunities.length === 0);
    });

    test('Scenario 5: Offering retired yields no opportunity at building', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Retire the pastry offering
      const retireResult = retireDevelopmentOffering(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      assert.strictEqual(retireResult.success, true);

      const result = inspectCurrentLocation(state, player.id);
      assert.strictEqual(result.success, true);
      assert.ok(result.location);
      assert.ok(
        result.location.opportunities === undefined || result.location.opportunities.length === 0
      );
    });
  });

  // =========================================================================
  // 4. Spatial Boundaries & Opacity
  // =========================================================================
  describe('4. Spatial Boundaries & Opacity', () => {
    test('Scenario 6: Street opacity strictly excludes child restaurant opportunities', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      leaveBuilding(state, player.id, 'building:development-building', { silent: true });
      assert.strictEqual(player.locationId, 'street:development-street');

      const result = inspectCurrentLocation(state, player.id);
      assert.strictEqual(result.success, true);
      assert.ok(result.location);
      assert.strictEqual(result.location.type, 'street');
      // Street must NOT inherit child building's contained restaurant opportunities
      assert.strictEqual(result.location.opportunities, undefined);
    });

    test('Scenario 7: Unrelated building with no restaurant yields no opportunity', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      leaveBuilding(state, player.id, 'building:development-building', { silent: true });
      enterBuilding(state, player.id, 'building:development-residence', { silent: true });
      assert.strictEqual(player.locationId, 'building:development-residence');

      const result = inspectCurrentLocation(state, player.id);
      assert.strictEqual(result.success, true);
      assert.ok(result.location);
      assert.strictEqual(result.location.type, 'building');
      // Residence has no restaurants -> opportunities must be undefined or empty
      assert.ok(
        result.location.opportunities === undefined || result.location.opportunities.length === 0
      );
    });
  });

  // =========================================================================
  // 5. Invariants & Epistemic Isolation
  // =========================================================================
  describe('5. Invariants & Epistemic Isolation', () => {
    test('Scenario 9: Building inspection is strictly read-only (zero mutation)', () => {
      const { clock, state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const beforeSnapshot = JSON.stringify(snapshotWorldState(clock, state));
      const result = inspectCurrentLocation(state, player.id);
      assert.strictEqual(result.success, true);
      const afterSnapshot = JSON.stringify(snapshotWorldState(clock, state));

      assert.strictEqual(beforeSnapshot, afterSnapshot);
      validateWorldState(state);
      assert.strictEqual(state.version, 12);
    });

    test('Building perception does NOT leak internal restaurant state or seated agents', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location);

      // Building does NOT expose internal menu offerings
      assert.strictEqual(result.location.offerings, undefined);
      // Building does NOT expose internal operationalState on ObservedLocation
      assert.strictEqual(result.location.operationalState, undefined);
      // Building does NOT expose agents inside the restaurant (NPC is inside restaurant, not building)
      const visibleAgentIds = result.location.agents.map((a) => a.id);
      assert.strictEqual(visibleAgentIds.includes('agent:dev-npc'), false);
      assert.strictEqual(visibleAgentIds.includes('agent:dev-player'), true);
      // Building does NOT expose restaurant ledger/balance
      assert.strictEqual((result.location as Record<string, unknown>).balanceMinor, undefined);
      assert.strictEqual((result.location as Record<string, unknown>).balance, undefined);
    });

    test('Duplicate prevention: multiple restaurants in a building do not duplicate opportunity ID', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Inject a second restaurant pointing to the same building
      const secondRestaurant: Restaurant = {
        id: 'restaurant:second-restaurant',
        type: 'restaurant',
        name: 'Second Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'open',
        operationalSince: MORNING_OPEN_TIME,
        balanceMinor: 0,
        currency: 'MXN',
      };
      state.restaurants.push(secondRestaurant);

      const result = inspectCurrentLocation(state, player.id);
      assert.strictEqual(result.success, true);
      assert.ok(result.location?.opportunities);

      const oppIds = result.location.opportunities.map((o) => o.id);
      const uniqueOppIds = new Set(oppIds);
      assert.strictEqual(oppIds.length, uniqueOppIds.size);
    });
  });

  // =========================================================================
  // 6. Explicit Player Agency & Action Sequence
  // =========================================================================
  describe('6. Explicit Player Agency & Action Sequence', () => {
    test('Perception affords decision: inspect -> decide -> enterRestaurant -> purchaseOffering', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // 1. Inspect at building
      const inspectRes = inspectCurrentLocation(state, player.id);
      assert.ok(inspectRes.location?.opportunities);
      assert.strictEqual(inspectRes.location.opportunities.length, 1);

      const opp = inspectRes.location.opportunities[0];
      assert.ok(opp.restaurantId);

      // Verify no automatic movement happened
      assert.strictEqual(player.locationId, 'building:development-building');

      // 2. Explicit action using perceived restaurantId
      const enterRes = enterRestaurant(state, player.id, opp.restaurantId, { silent: true });
      assert.strictEqual(enterRes.success, true);
      assert.strictEqual(player.locationId, opp.restaurantId);

      // 3. Explicit purchase using perceived offeringId
      const initialBalance = player.balanceMinor;
      const purchaseRes = purchaseOffering(state, player.id, opp.offeringId, { silent: true });
      assert.strictEqual(purchaseRes.success, true);
      assert.strictEqual(purchaseRes.code, 'success');
      assert.strictEqual(player.balanceMinor, initialBalance - purchaseRes.amountMinor!);
      assert.strictEqual(purchaseRes.playerBalanceAfter, initialBalance - purchaseRes.amountMinor!);
    });
  });
});
