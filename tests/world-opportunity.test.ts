import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  inspectCurrentLocation,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  traverseToStreet,
  purchaseOffering,
  snapshotWorldState,
  validateWorldState,
  WorldState,
  DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID,
  ObservableOpportunity,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 23: First World Opportunity (Pan Dulce Available)', () => {
  const MORNING_OPEN_TIME = '2026-09-14T09:00:00.000Z';
  const PRE_SHIFT_TIME = '2026-09-14T08:00:00.000Z';
  const CLOSING_TIME = '2026-09-14T17:00:00.000Z';
  const POST_SHIFT_TIME = '2026-09-14T20:30:00.000Z';

  function setupWorldAt(timeIso: string): { clock: WorldClock; state: WorldState; sim: Simulation } {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state);
    return { clock, state, sim };
  }

  // =========================================================================
  // 1. Availability Across Daily Schedule (Tests 1-4)
  // =========================================================================
  describe('Availability Across Daily Schedule', () => {
    test('1. Opportunity absent before the restaurant becomes operational (08:00 UTC)', () => {
      const { state } = setupWorldAt(PRE_SHIFT_TIME);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      // At 08:00 UTC, restaurant is closed, NPC is resting at residence, offering not published
      // Move player into restaurant directly to inspect
      player.locationId = 'restaurant:development-restaurant';

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location);
      assert.equal(result.location.type, 'restaurant');
      assert.equal(result.location.operationalState, 'closed');
      assert.ok(Array.isArray(result.location.opportunities));
      assert.equal(result.location.opportunities.length, 0);
    });

    test('2. Opportunity present during valid M22/M19 shift (09:00 UTC and 12:00 UTC)', () => {
      const { clock, state, sim } = setupWorldAt(PRE_SHIFT_TIME);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Advance to 09:00:00 UTC and tick simulation
      clock.advance(60 * 60_000);
      sim.tick();

      const enterResult = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
      assert.equal(enterResult.success, true);

      // Inspect at 09:00 UTC
      const result0900 = inspectCurrentLocation(state, player.id);
      assert.equal(result0900.success, true);
      assert.ok(result0900.location);
      assert.ok(result0900.location.opportunities);
      assert.equal(result0900.location.opportunities.length, 1);

      const opp0900 = result0900.location.opportunities[0];
      assert.equal(opp0900.id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
      assert.equal(opp0900.name, 'Pan Dulce Available');
      assert.equal(
        opp0900.description,
        'Pan Dulce is available while the restaurant is open and the NPC is working.'
      );
      assert.equal(opp0900.offeringId, 'offering:development-pastry');

      // Advance to 12:00:00 UTC (midday) and tick simulation
      clock.advance(3 * 60 * 60_000);
      sim.tick();

      const result1200 = inspectCurrentLocation(state, player.id);
      assert.equal(result1200.success, true);
      assert.ok(result1200.location?.opportunities);
      assert.equal(result1200.location.opportunities.length, 1);
      assert.equal(result1200.location.opportunities[0].id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
    });

    test('3. Opportunity absent at the 17:00 closing boundary', () => {
      const { clock, state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      sim.tick();

      enterRestaurant(state, player.id, 'restaurant:development-restaurant');
      const inspectBefore = inspectCurrentLocation(state, player.id);
      assert.equal(inspectBefore.location?.opportunities?.length, 1);

      // Advance to 17:00:00 UTC and tick simulation
      clock.advance(8 * 60 * 60_000);
      sim.tick();

      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      assert.equal(restaurant.operationalState, 'closed');

      const inspectAtClosing = inspectCurrentLocation(state, player.id);
      assert.equal(inspectAtClosing.success, true);
      assert.ok(inspectAtClosing.location);
      assert.ok(Array.isArray(inspectAtClosing.location.opportunities));
      assert.equal(inspectAtClosing.location.opportunities.length, 0);
    });

    test('4. Opportunity absent after the shift (20:30 UTC)', () => {
      const { clock, state, sim } = setupWorldAt(POST_SHIFT_TIME);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      sim.tick();

      player.locationId = 'restaurant:development-restaurant';
      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location?.opportunities);
      assert.equal(result.location.opportunities.length, 0);
    });
  });

  // =========================================================================
  // 2. Spatial Perception (Tests 5-9)
  // =========================================================================
  describe('Spatial Perception Boundary', () => {
    test('5. Opportunity appears when player is inside the development restaurant', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.equal(result.location?.id, 'restaurant:development-restaurant');
      assert.ok(result.location?.opportunities);
      assert.equal(result.location.opportunities.length, 1);
      assert.equal(result.location.opportunities[0].id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
    });

    test('6. Opportunity does not appear on the development street', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      leaveBuilding(state, player.id, 'building:development-building');
      assert.equal(player.locationId, 'street:development-street');

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.equal(result.location?.type, 'street');
      assert.equal(result.location.opportunities, undefined);
    });

    test('7. Opportunity is visible in the development building (M27 storefront affordance update)', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'building:development-building');

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.equal(result.location?.type, 'building');
      // M27: Building perception was intentionally extended to project active public storefront opportunities
      assert.ok(result.location.opportunities);
      assert.equal(result.location.opportunities.length, 1);
      assert.equal(result.location.opportunities[0].id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
      assert.equal(result.location.opportunities[0].restaurantId, 'restaurant:development-restaurant');
    });

    test('8. Opportunity does not appear at the residence', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      leaveBuilding(state, player.id, 'building:development-building');
      enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(player.locationId, 'building:development-residence');

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.equal(result.location?.type, 'building');
      assert.equal(result.location.opportunities, undefined);
    });

    test('9. Opportunity does not appear on Avenida Juárez', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      leaveBuilding(state, player.id, 'building:development-building');
      traverseToStreet(state, player.id, 'street:avenida-juarez');
      assert.equal(player.locationId, 'street:avenida-juarez');

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.equal(result.location?.type, 'street');
      assert.equal(result.location.opportunities, undefined);
    });
  });

  // =========================================================================
  // 3. World-State Dependencies (Tests 10-13)
  // =========================================================================
  describe('World-State Dependencies', () => {
    test('10. Restaurant closed -> no opportunity', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');

      // Manually mutate operationalState to closed
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'closed';

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location?.opportunities);
      assert.equal(result.location.opportunities.length, 0);
    });

    test('11. NPC absent -> no opportunity', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');

      // Relocate NPC away from the restaurant
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'street:development-street';

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location?.opportunities);
      assert.equal(result.location.opportunities.length, 0);
    });

    test('12. NPC idle -> no opportunity', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');

      // Set NPC activity to idle
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.activityState = 'idle';

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location?.opportunities);
      assert.equal(result.location.opportunities.length, 0);
    });

    test('13. Pan Dulce offering absent -> no opportunity', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');

      // Remove offering from state
      state.offerings = state.offerings.filter((o) => o.id !== 'offering:development-pastry');

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location?.opportunities);
      assert.equal(result.location.opportunities.length, 0);
    });
  });

  // =========================================================================
  // 4. Read-Only Behavior (Tests 14-16)
  // =========================================================================
  describe('Read-Only Behavior & Zero Mutation', () => {
    test('14. Inspection does not mutate WorldState', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');

      const beforeJson = JSON.stringify(state);
      inspectCurrentLocation(state, player.id);
      const afterJson = JSON.stringify(state);

      assert.equal(afterJson, beforeJson);
    });

    test('15. Repeated inspection returns equivalent projection', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');

      const inspect1 = inspectCurrentLocation(state, player.id);
      const inspect2 = inspectCurrentLocation(state, player.id);

      assert.deepEqual(inspect1.location, inspect2.location);
    });

    test('16. Inspection does not create history', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');

      const purchasesBefore = state.purchases.length;
      const activityHistoryBefore = state.activityCompletions.length;

      inspectCurrentLocation(state, player.id);

      const purchasesAfter = state.purchases.length;
      const activityHistoryAfter = state.activityCompletions.length;

      assert.equal(purchasesAfter, purchasesBefore);
      assert.equal(activityHistoryAfter, activityHistoryBefore);
      assert.equal((state as any).opportunities, undefined);
    });
  });

  // =========================================================================
  // 5. Stale Opportunity (Tests 17-20)
  // =========================================================================
  describe('Stale Opportunity & Authoritative Purchase Invariants', () => {
    test('17. Opportunity observed before 17:00 closing transition', () => {
      const clock = WorldClock.create('2026-09-14T16:59:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');

      const inspection = inspectCurrentLocation(state, player.id);
      assert.equal(inspection.success, true);
      assert.ok(inspection.location?.opportunities);
      assert.equal(inspection.location.opportunities.length, 1);
      assert.equal(inspection.location.opportunities[0].id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
    });

    test('18. World advances through closing transition, closing restaurant and removing opportunity', () => {
      const clock = WorldClock.create('2026-09-14T16:59:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      enterRestaurant(state, player.id, restaurant.id);

      clock.advance(60_000); // 17:00:00 UTC
      sim.tick();

      assert.equal(restaurant.operationalState, 'closed');
      assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), false);

      const inspection = inspectCurrentLocation(state, player.id);
      assert.equal(inspection.success, true);
      assert.ok(inspection.location?.opportunities);
      assert.equal(inspection.location.opportunities.length, 0);
    });

    test('19. Existing purchaseOffering() rejects the stale purchase attempt after closing', () => {
      const clock = WorldClock.create('2026-09-14T16:59:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      enterRestaurant(state, player.id, restaurant.id);

      // Advance to closing
      clock.advance(60_000);
      sim.tick();

      const purchaseResult = purchaseOffering(state, player.id, 'offering:development-pastry');
      assert.equal(purchaseResult.success, false);
      assert.ok(purchaseResult.code === 'restaurant-closed' || purchaseResult.code === 'offering-not-found');
    });

    test('20. No partial economic mutation occurs on rejected stale purchase', () => {
      const clock = WorldClock.create('2026-09-14T16:59:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      enterRestaurant(state, player.id, restaurant.id);

      clock.advance(60_000);
      sim.tick();

      const initialPlayerBalance = player.balanceMinor;
      const initialRestaurantBalance = restaurant.balanceMinor;
      const initialPurchaseCount = state.purchases.length;
      const stateBeforeRejectedPurchase = JSON.stringify(state);

      purchaseOffering(state, player.id, 'offering:development-pastry');

      assert.equal(player.balanceMinor, initialPlayerBalance);
      assert.equal(restaurant.balanceMinor, initialRestaurantBalance);
      assert.equal(state.purchases.length, initialPurchaseCount);
      assert.equal(JSON.stringify(state), stateBeforeRejectedPurchase);
    });
  });

  // =========================================================================
  // 6. Persistence & Schema Preservation (Tests 21-23)
  // =========================================================================
  describe('Persistence & Schema Preservation', () => {
    test('21. Save during valid opportunity period', async () => {
      const testPath = join(tmpdir(), `mvc-test-m23-save-${Date.now()}.json`);
      try {
        const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
        sim.tick();
        const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
        enterRestaurant(state, player.id, 'restaurant:development-restaurant');

        const inspectBefore = inspectCurrentLocation(state, player.id);
        assert.equal(inspectBefore.location?.opportunities?.length, 1);

        const persistence = new LocalFilePersistence(testPath);
        await persistence.save(state);
        assert.equal(existsSync(testPath), true);
      } finally {
        if (existsSync(testPath)) {
          unlinkSync(testPath);
        }
      }
    });

    test('22. Restored state maintains schema version 13 and has no persisted opportunity collection', async () => {
      const testPath = join(tmpdir(), `mvc-test-m23-schema-${Date.now()}.json`);
      try {
        const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
        sim.tick();
        const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
        enterRestaurant(state, player.id, 'restaurant:development-restaurant');

        const persistence = new LocalFilePersistence(testPath);
        await persistence.save(state);

        const restoredState = await persistence.load();
        assert.ok(restoredState);
        validateWorldState(restoredState);
        assert.equal(restoredState.version, 13);
        assert.equal((restoredState as any).opportunities, undefined);
      } finally {
        if (existsSync(testPath)) {
          unlinkSync(testPath);
        }
      }
    });

    test('23. Opportunity derives again from restored state without persisted Opportunity data', async () => {
      const testPath = join(tmpdir(), `mvc-test-m23-derive-${Date.now()}.json`);
      try {
        const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
        sim.tick();
        const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
        enterRestaurant(state, player.id, 'restaurant:development-restaurant');

        const persistence = new LocalFilePersistence(testPath);
        await persistence.save(state);

        const restoredState = await persistence.load();
        assert.ok(restoredState);

        const afterRestoreInspect = inspectCurrentLocation(restoredState, player.id);
        assert.equal(afterRestoreInspect.success, true);
        assert.ok(afterRestoreInspect.location?.opportunities);
        assert.equal(afterRestoreInspect.location.opportunities.length, 1);

        const restoredOpp = afterRestoreInspect.location.opportunities[0];
        assert.equal(restoredOpp.id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
        assert.equal(restoredOpp.name, 'Pan Dulce Available');
        assert.equal(
          restoredOpp.description,
          'Pan Dulce is available while the restaurant is open and the NPC is working.'
        );
        assert.equal(restoredOpp.offeringId, 'offering:development-pastry');
      } finally {
        if (existsSync(testPath)) {
          unlinkSync(testPath);
        }
      }
    });
  });
});
