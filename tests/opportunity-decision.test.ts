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
  enterRestaurant,
  purchaseOffering,
  inspectPlayerHistory,
  validateWorldState,
  WorldState,
  DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  ObservableOpportunity,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 24: First Opportunity-Driven Player Decision', () => {
  const MORNING_OPEN_TIME = '2026-09-14T09:00:00.000Z';
  const CLOSING_TIME = '2026-09-14T17:00:00.000Z';

  function setupWorldAt(timeIso: string): { clock: WorldClock; state: WorldState; sim: Simulation } {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    return { clock, state, sim };
  }

  // =========================================================================
  // 1. The Complete Opportunity-Driven Decision Cycle (Scenarios 1-8)
  // =========================================================================
  describe('1. The Complete Opportunity-Driven Decision Cycle', () => {
    test('1-7. Observes Pan Dulce opportunity, reads offeringId, explicitly purchases, and updates balances and history', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      enterRestaurant(state, player.id, restaurant.id, { silent: true });

      const initialPlayerBalance = player.balanceMinor;
      const initialRestaurantBalance = restaurant.balanceMinor;
      const initialPurchaseCount = state.purchases.length;

      // Scenario 1: Observe the opportunity during valid working period
      const perceptionResult = inspectCurrentLocation(state, player.id);
      assert.equal(perceptionResult.success, true);
      assert.ok(perceptionResult.location);
      assert.ok(perceptionResult.location.opportunities);
      assert.equal(perceptionResult.location.opportunities.length, 1);

      const opportunity: ObservableOpportunity = perceptionResult.location.opportunities[0];
      assert.equal(opportunity.id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
      assert.equal(opportunity.name, 'Pan Dulce Available');

      // Scenario 2: Read its offeringId
      const targetOfferingId = opportunity.offeringId;
      assert.equal(targetOfferingId, DEVELOPMENT_PASTRY_OFFERING_ID);

      // Scenario 3: Explicitly call purchaseOffering() using the observed offeringId
      const purchaseResult = purchaseOffering(state, player.id, targetOfferingId, { silent: true });

      // Scenario 4: Verify successful purchase
      assert.equal(purchaseResult.success, true);
      assert.equal(purchaseResult.code, 'success');
      assert.equal(purchaseResult.playerId, player.id);
      assert.equal(purchaseResult.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(purchaseResult.restaurantId, restaurant.id);
      assert.equal(purchaseResult.amountMinor, 250);
      assert.equal(purchaseResult.currency, 'USD');

      // Scenario 5: Verify player balance decreases by correct amount ($2.50)
      assert.equal(player.balanceMinor, initialPlayerBalance - 250);
      assert.equal(purchaseResult.playerBalanceAfter, initialPlayerBalance - 250);

      // Scenario 6: Verify restaurant balance increases by correct amount ($2.50)
      assert.equal(restaurant.balanceMinor, initialRestaurantBalance + 250);
      assert.equal(purchaseResult.restaurantBalanceAfter, initialRestaurantBalance + 250);

      // Scenario 7: Verify historical PurchaseRecord is created
      assert.equal(state.purchases.length, initialPurchaseCount + 1);
      const record = state.purchases[state.purchases.length - 1];
      assert.ok(record);
      assert.equal(record.playerId, player.id);
      assert.equal(record.restaurantId, restaurant.id);
      assert.equal(record.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(record.amountMinor, 250);
      assert.equal(record.currency, 'USD');
      assert.equal(record.worldTime, state.worldTime);

      // Verify accessible via inspectPlayerHistory()
      const historyResult = inspectPlayerHistory(state, player.id);
      assert.equal(historyResult.success, true);
      assert.ok(historyResult.history);
      assert.equal(historyResult.history.purchases.length, 1);
      assert.equal(historyResult.history.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(historyResult.history.purchases[0].amountMinor, 250);
    });

    test('8. Perception alone causes zero state mutation', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant', { silent: true });

      const stateBefore = JSON.stringify(state);

      // Inspecting current location multiple times
      const inspect1 = inspectCurrentLocation(state, player.id);
      assert.equal(inspect1.success, true);
      assert.equal(inspect1.location?.opportunities?.length, 1);

      const inspect2 = inspectCurrentLocation(state, player.id);
      assert.equal(inspect2.success, true);

      // Zero state mutation invariant
      assert.equal(JSON.stringify(state), stateBefore);
    });
  });

  // =========================================================================
  // 2. Opportunity Stale Rejection & Invariant Preservations (Scenarios 9-13)
  // =========================================================================
  describe('2. Stale Opportunity Rejection & Non-Mutation Invariants', () => {
    test('9-13. Retaining offeringId before 17:00, advancing to 17:00, and verifying authoritative rejection without mutation', () => {
      const clock = WorldClock.create('2026-09-14T16:59:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      enterRestaurant(state, player.id, restaurant.id, { silent: true });

      // Scenario 9: Observe opportunity before 17:00 and retain offeringId
      const preClosingInspection = inspectCurrentLocation(state, player.id);
      assert.equal(preClosingInspection.success, true);
      assert.ok(preClosingInspection.location?.opportunities);
      assert.equal(preClosingInspection.location.opportunities.length, 1);

      const retainedOfferingId = preClosingInspection.location.opportunities[0].offeringId;
      assert.equal(retainedOfferingId, DEVELOPMENT_PASTRY_OFFERING_ID);

      // Scenario 10: Advance simulation to 17:00 UTC (closing time)
      clock.advance(60_000);
      sim.tick();

      assert.equal(restaurant.operationalState, 'closed');
      assert.equal(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID), false);

      const balanceBeforeAttempt = player.balanceMinor;
      const restaurantBalanceBeforeAttempt = restaurant.balanceMinor;
      const purchasesCountBeforeAttempt = state.purchases.length;
      const stateSnapshotBeforeAttempt = JSON.stringify(state);

      // Scenario 11: Attempt purchase using previously observed offeringId
      const stalePurchaseResult = purchaseOffering(state, player.id, retainedOfferingId, { silent: true });

      // Scenario 12: Verify authoritative rejection after closing or offering retirement
      assert.equal(stalePurchaseResult.success, false);
      assert.ok(
        stalePurchaseResult.code === 'restaurant-closed' ||
        stalePurchaseResult.code === 'offering-not-found'
      );

      // Scenario 13: Verify rejected purchase produces no economic or historical mutation
      assert.equal(player.balanceMinor, balanceBeforeAttempt);
      assert.equal(restaurant.balanceMinor, restaurantBalanceBeforeAttempt);
      assert.equal(state.purchases.length, purchasesCountBeforeAttempt);
      assert.equal(JSON.stringify(state), stateSnapshotBeforeAttempt);
    });
  });

  // =========================================================================
  // 3. Decoupling, Non-Automation, and Coexistence Invariants (Scenarios 14-16)
  // =========================================================================
  describe('3. Decoupling, Non-Automation, and Coexistence Invariants', () => {
    test('14. The opportunity has no automatic execution behavior', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant', { silent: true });

      const initialPlayerBalance = player.balanceMinor;
      const initialPurchases = state.purchases.length;

      const inspection = inspectCurrentLocation(state, player.id);
      assert.equal(inspection.success, true);
      const opp = inspection.location?.opportunities?.[0];
      assert.ok(opp);

      // Verify opp is a pure data object without executable methods
      assert.equal(typeof (opp as any).execute, 'undefined');
      assert.equal(typeof (opp as any).accept, 'undefined');
      assert.equal(typeof (opp as any).purchase, 'undefined');
      assert.equal(typeof (opp as any).action, 'undefined');

      // Balances and purchase records are unaffected
      assert.equal(player.balanceMinor, initialPlayerBalance);
      assert.equal(state.purchases.length, initialPurchases);
    });

    test('15. Purchase authority does not depend on opportunity name or description', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant', { silent: true });

      const inspection = inspectCurrentLocation(state, player.id);
      const opp = inspection.location?.opportunities?.[0]!;
      assert.ok(opp);

      // Tampering with the projected DTO does not affect purchase authority
      const tamperedOpp = {
        ...opp,
        name: 'Irrelevant Altered Name',
        description: 'Tampered Description',
      };

      // purchaseOffering evaluates only offeringId against authoritative WorldState
      const result = purchaseOffering(state, player.id, tamperedOpp.offeringId, { silent: true });
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
    });

    test('16. Direct purchase of the Coffee offering still works without an opportunity', () => {
      const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(state, player.id, 'restaurant:development-restaurant', { silent: true });

      const initialPlayerBalance = player.balanceMinor;

      // Direct purchase of Coffee (offering:development-coffee) which has no associated opportunity
      const coffeePurchase = purchaseOffering(state, player.id, 'offering:development-coffee', { silent: true });
      assert.equal(coffeePurchase.success, true);
      assert.equal(coffeePurchase.code, 'success');
      assert.equal(coffeePurchase.offeringId, 'offering:development-coffee');
      assert.equal(coffeePurchase.amountMinor, 500);
      assert.equal(player.balanceMinor, initialPlayerBalance - 500);

      // Historical record created for coffee as well
      const history = inspectPlayerHistory(state, player.id);
      assert.equal(history.history?.purchases.some((p) => p.offeringId === 'offering:development-coffee'), true);
    });
  });

  // =========================================================================
  // 4. Persistence and Schema Integrity (Scenarios 17-19)
  // =========================================================================
  describe('4. Persistence and Schema Integrity', () => {
    test('17-19. Persistence preserves purchase records and balances, opportunities are not persisted, and schema remains v10', async () => {
      const testPath = join(tmpdir(), `mvc-test-m24-persistence-${Date.now()}.json`);
      try {
        const { state, sim } = setupWorldAt(MORNING_OPEN_TIME);
        sim.tick();

        const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
        enterRestaurant(state, player.id, 'restaurant:development-restaurant', { silent: true });

        // Opportunity perceived and purchased
        const inspection = inspectCurrentLocation(state, player.id);
        const opp = inspection.location?.opportunities?.[0]!;
        assert.ok(opp);

        const purchaseResult = purchaseOffering(state, player.id, opp.offeringId, { silent: true });
        assert.equal(purchaseResult.success, true);

        // Persist world to disk
        const persistence = new LocalFilePersistence(testPath);
        await persistence.save(state);
        assert.equal(existsSync(testPath), true);

        // Reload world from disk
        const restoredState = await persistence.load();
        assert.ok(restoredState);

        // Scenario 19: Verify schema remains v13
        assert.equal(restoredState.version, 13);
        assert.doesNotThrow(() => validateWorldState(restoredState));

        // Scenario 17: Verify persistence preserves purchase records and balances
        const restoredPlayer = restoredState.agents.find((a) => a.id === player.id)!;
        assert.equal(restoredPlayer.balanceMinor, player.balanceMinor);

        const restoredRestaurant = restoredState.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
        assert.equal(restoredRestaurant.balanceMinor, purchaseResult.restaurantBalanceAfter);

        assert.equal(restoredState.purchases.length, 1);
        assert.equal(restoredState.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
        assert.equal(restoredState.purchases[0].amountMinor, 250);

        // Scenario 18: Verify opportunities are not persisted
        assert.equal((restoredState as any).opportunities, undefined);
      } finally {
        if (existsSync(testPath)) {
          unlinkSync(testPath);
        }
      }
    });
  });
});
