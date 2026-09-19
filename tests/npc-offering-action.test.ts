import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  WorldState,
  createInitialWorldState,
  validateWorldState,
  makeDevelopmentOfferingAvailable,
  retireDevelopmentOffering,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  inspectCurrentLocation,
  purchaseOffering,
  inspectPlayerHistory,
  enterRestaurant,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';

/**
 * Helper to construct an open world at 09:00 UTC with the NPC active at the restaurant.
 */
function setupActiveNpcWorld(): { clock: WorldClock; state: WorldState } {
  const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
  const state = createInitialWorldState(clock);
  // Place NPC at restaurant and set active
  const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
  npc.activityState = 'active';
  npc.locationId = 'restaurant:development-restaurant';
  // Ensure restaurant is open
  const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
  restaurant.operationalState = 'open';
  return { clock, state };
}

describe('Milestone 19-A: Deterministic NPC Offering Availability', () => {
  describe('1. makeDevelopmentOfferingAvailable Success', () => {
    test('successfully adds Pan Dulce ($2.50 USD) when all preconditions are satisfied', () => {
      const { state } = setupActiveNpcWorld();
      const initialOfferingsCount = state.offerings.length;

      const result = makeDevelopmentOfferingAvailable(
        state,
        'agent:dev-npc',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.npcId, 'agent:dev-npc');
      assert.equal(result.restaurantId, 'restaurant:development-restaurant');
      assert.equal(result.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

      assert.equal(state.offerings.length, initialOfferingsCount + 1);
      const offering = state.offerings.find((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.ok(offering);
      assert.equal(offering.type, 'offering');
      assert.equal(offering.name, 'Pan Dulce');
      assert.equal(offering.restaurantId, 'restaurant:development-restaurant');
      assert.equal(offering.priceMinor, 250);
      assert.equal(offering.currency, 'USD');

      // Schema validation passes
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  describe('2. makeDevelopmentOfferingAvailable Preconditions & Zero State Mutation', () => {
    test('fails with "npc-not-found" if NPC ID does not exist', () => {
      const { state } = setupActiveNpcWorld();
      const snapshot = JSON.stringify(state);

      const result = makeDevelopmentOfferingAvailable(
        state,
        'agent:ghost',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-found');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "npc-not-npc" if agent is a player', () => {
      const { state } = setupActiveNpcWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:development-restaurant';
      const snapshot = JSON.stringify(state);

      const result = makeDevelopmentOfferingAvailable(
        state,
        'agent:dev-player',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-npc');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "npc-not-active" if NPC is idle', () => {
      const { state } = setupActiveNpcWorld();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.activityState = 'idle';
      const snapshot = JSON.stringify(state);

      const result = makeDevelopmentOfferingAvailable(
        state,
        'agent:dev-npc',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-active');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "restaurant-not-found" if restaurant does not exist', () => {
      const { state } = setupActiveNpcWorld();
      const snapshot = JSON.stringify(state);

      const result = makeDevelopmentOfferingAvailable(
        state,
        'agent:dev-npc',
        'restaurant:ghost'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-not-found');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "npc-not-at-restaurant" if NPC is located elsewhere', () => {
      const { state } = setupActiveNpcWorld();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'building:development-building';
      const snapshot = JSON.stringify(state);

      const result = makeDevelopmentOfferingAvailable(
        state,
        'agent:dev-npc',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-at-restaurant');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "restaurant-not-open" if restaurant is closed', () => {
      const { state } = setupActiveNpcWorld();
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'closed';
      const snapshot = JSON.stringify(state);

      const result = makeDevelopmentOfferingAvailable(
        state,
        'agent:dev-npc',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-not-open');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "offering-already-available" if Pan Dulce is already in state.offerings', () => {
      const { state } = setupActiveNpcWorld();
      // First call succeeds
      const first = makeDevelopmentOfferingAvailable(
        state,
        'agent:dev-npc',
        'restaurant:development-restaurant'
      );
      assert.equal(first.success, true);
      const snapshot = JSON.stringify(state);

      // Second call fails with duplicate protection
      const second = makeDevelopmentOfferingAvailable(
        state,
        'agent:dev-npc',
        'restaurant:development-restaurant'
      );

      assert.equal(second.success, false);
      assert.equal(second.code, 'offering-already-available');
      assert.equal(second.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(JSON.stringify(state), snapshot);
    });
  });

  describe('3. World Perception Integration', () => {
    test('player perceives Pan Dulce in inspectCurrentLocation() offerings when available', () => {
      const { state } = setupActiveNpcWorld();
      // Player enters restaurant
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');

      // Before offering is made available: only Coffee is observed
      const inspectBefore = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspectBefore.success, true);
      const obsOfferingsBefore = (inspectBefore.location as any).offerings;
      assert.equal(obsOfferingsBefore.length, 1);
      assert.equal(obsOfferingsBefore[0].name, 'Coffee');

      // Make Pan Dulce available
      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');

      // After offering is made available: both Coffee and Pan Dulce are observed
      const inspectAfter = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspectAfter.success, true);
      const obsOfferingsAfter = (inspectAfter.location as any).offerings;
      assert.equal(obsOfferingsAfter.length, 2);
      const pastryObs = obsOfferingsAfter.find((o: any) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.ok(pastryObs);
      assert.equal(pastryObs.name, 'Pan Dulce');
      assert.equal(pastryObs.priceMinor, 250);
      assert.equal(pastryObs.currency, 'USD');
    });
  });

  describe('4. Commerce Integration (purchaseOffering)', () => {
    test('player can successfully purchase Pan Dulce, updating balances and recording purchase', () => {
      const { state } = setupActiveNpcWorld();
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      const playerBalanceBefore = player.balanceMinor;
      const restaurantBalanceBefore = restaurant.balanceMinor;

      const purchaseResult = purchaseOffering(
        state,
        'agent:dev-player',
        DEVELOPMENT_PASTRY_OFFERING_ID,
        'restaurant:development-restaurant'
      );

      assert.equal(purchaseResult.success, true);
      assert.equal(purchaseResult.code, 'success');
      assert.equal(purchaseResult.amountMinor, 250);
      assert.equal(purchaseResult.currency, 'USD');
      assert.equal(player.balanceMinor, playerBalanceBefore - 250);
      assert.equal(restaurant.balanceMinor, restaurantBalanceBefore + 250);

      // Verify historical purchase record
      assert.equal(state.purchases.length, 1);
      const record = state.purchases[0];
      assert.equal(record.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(record.restaurantId, 'restaurant:development-restaurant');
      assert.equal(record.playerId, 'agent:dev-player');
      assert.equal(record.amountMinor, 250);
      assert.equal(record.currency, 'USD');

      // Schema validation passes
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  describe('5. retireDevelopmentOffering Success & Preconditions', () => {
    test('successfully retires Pan Dulce from state.offerings when active shift ends', () => {
      const { state } = setupActiveNpcWorld();
      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      assert.ok(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      const result = retireDevelopmentOffering(
        state,
        'agent:dev-npc',
        'restaurant:development-restaurant'
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.ok(!state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      assert.doesNotThrow(() => validateWorldState(state));
    });

    test('fails with "npc-not-found" if NPC ID does not exist (zero mutation)', () => {
      const { state } = setupActiveNpcWorld();
      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      const snapshot = JSON.stringify(state);

      const result = retireDevelopmentOffering(state, 'agent:ghost', 'restaurant:development-restaurant');
      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-found');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "npc-not-npc" if agent is a player (zero mutation)', () => {
      const { state } = setupActiveNpcWorld();
      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      const snapshot = JSON.stringify(state);

      const result = retireDevelopmentOffering(state, 'agent:dev-player', 'restaurant:development-restaurant');
      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-npc');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "npc-not-active" if NPC is idle (zero mutation)', () => {
      const { state } = setupActiveNpcWorld();
      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.activityState = 'idle';
      const snapshot = JSON.stringify(state);

      const result = retireDevelopmentOffering(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-active');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "restaurant-not-found" if restaurant ID does not exist (zero mutation)', () => {
      const { state } = setupActiveNpcWorld();
      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      const snapshot = JSON.stringify(state);

      const result = retireDevelopmentOffering(state, 'agent:dev-npc', 'restaurant:ghost');
      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-not-found');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "npc-not-at-restaurant" if NPC is not at the restaurant (zero mutation)', () => {
      const { state } = setupActiveNpcWorld();
      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'building:development-building';
      const snapshot = JSON.stringify(state);

      const result = retireDevelopmentOffering(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-at-restaurant');
      assert.equal(JSON.stringify(state), snapshot);
    });

    test('fails with "offering-not-available" if Pan Dulce is not in state.offerings (zero mutation)', () => {
      const { state } = setupActiveNpcWorld();
      // Pan Dulce not added yet
      const snapshot = JSON.stringify(state);

      const result = retireDevelopmentOffering(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      assert.equal(result.success, false);
      assert.equal(result.code, 'offering-not-available');
      assert.equal(JSON.stringify(state), snapshot);
    });
  });

  describe('6. Historical Integrity After Retirement', () => {
    test('past PurchaseRecord for Pan Dulce remains strictly valid under validateWorldState() after retirement', () => {
      const { state } = setupActiveNpcWorld();
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');

      // Purchase Pan Dulce
      purchaseOffering(
        state,
        'agent:dev-player',
        DEVELOPMENT_PASTRY_OFFERING_ID,
        'restaurant:development-restaurant'
      );
      assert.equal(state.purchases.length, 1);

      // Now retire Pan Dulce
      retireDevelopmentOffering(state, 'agent:dev-npc', 'restaurant:development-restaurant');
      assert.ok(!state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      // validateWorldState MUST PASS with schema v10 and historical purchase record intact
      assert.doesNotThrow(() => validateWorldState(state));

      // Player history query must cleanly reflect the purchase
      const historyResult = inspectPlayerHistory(state, 'agent:dev-player');
      assert.equal(historyResult.success, true);
      assert.equal(historyResult.history?.purchases.length, 1);
      assert.equal(historyResult.history?.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

      // Player attempting to purchase Pan Dulce after retirement fails with offering-not-found
      const secondPurchase = purchaseOffering(
        state,
        'agent:dev-player',
        DEVELOPMENT_PASTRY_OFFERING_ID,
        'restaurant:development-restaurant'
      );
      assert.equal(secondPurchase.success, false);
      assert.equal(secondPurchase.code, 'offering-not-found');
    });

    test('arbitrary non-existent offering in purchase record is still strictly rejected', () => {
      const { state } = setupActiveNpcWorld();
      state.purchases.push({
        id: 'purchase:ghost-test',
        worldTime: state.worldTime,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:ghost',
        amountMinor: 250,
        currency: 'USD',
      });

      assert.throws(
        () => validateWorldState(state),
        /offeringId "offering:ghost" references non-existent offering/
      );
    });
  });

  describe('7. Player and NPC Isolation Invariants', () => {
    test('offering operations do not mutate player location, balances, or activities', () => {
      const { state } = setupActiveNpcWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const playerLocBefore = player.locationId;
      const playerBalBefore = player.balanceMinor;
      const playerActBefore = player.activityState;

      makeDevelopmentOfferingAvailable(state, 'agent:dev-npc', 'restaurant:development-restaurant');

      assert.equal(player.locationId, playerLocBefore);
      assert.equal(player.balanceMinor, playerBalBefore);
      assert.equal(player.activityState, playerActBefore);

      retireDevelopmentOffering(state, 'agent:dev-npc', 'restaurant:development-restaurant');

      assert.equal(player.locationId, playerLocBefore);
      assert.equal(player.balanceMinor, playerBalBefore);
      assert.equal(player.activityState, playerActBefore);
    });
  });

  describe('8. Simulation Integration Across Full Daily Routine', () => {
    test('clock advances 08:00 -> 09:00 -> 17:00 driving offering lifecycle, perception, and purchase', () => {
      // 08:00 UTC: Restaurant closed, devNpc idle at building, Pan Dulce absent
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      assert.ok(!state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      // Advance to 09:00 UTC and tick
      clock.advance(3600_000);
      const tick09 = sim.tick();

      // Pan Dulce becomes available
      assert.ok(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
      const offeringTrans = tick09.offeringTransitions?.find(
        (t) => t.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
      );
      assert.ok(offeringTrans);
      assert.equal(offeringTrans.action, 'made-available');

      // Player enters restaurant and perceives Pan Dulce
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      const inspectRes = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspectRes.success, true);
      const offerings = (inspectRes.location as any).offerings;
      assert.ok(offerings.some((o: any) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      // Player purchases Pan Dulce
      const buyRes = purchaseOffering(
        state,
        'agent:dev-player',
        DEVELOPMENT_PASTRY_OFFERING_ID,
        'restaurant:development-restaurant'
      );
      assert.equal(buyRes.success, true);
      assert.equal(state.purchases.length, 1);

      // Advance to 17:00 UTC and tick
      clock.advance(8 * 3600_000);
      const tick17 = sim.tick();

      // Pan Dulce retired
      assert.ok(!state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
      const retireTrans = tick17.offeringTransitions?.find(
        (t) => t.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
      );
      assert.ok(retireTrans);
      assert.equal(retireTrans.action, 'retired');

      // Historical purchase record persists and validates under Schema Version 10
      assert.equal(state.purchases.length, 1);
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  describe('9. Persistence Roundtrip', () => {
    test('world with historical purchase of retired Pan Dulce persists and restores identically', () => {
      const storagePath = join(tmpdir(), `test-npc-offering-${Date.now()}.json`);
      if (existsSync(storagePath)) {
        unlinkSync(storagePath);
      }

      try {
        const persistence = new LocalFilePersistence(storagePath);
        const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
        const state = createInitialWorldState(clock);
        const sim = new Simulation(clock, state, { silent: true });

        // Advance to 09:00 and tick (offering becomes available)
        clock.advance(3600_000);
        sim.tick();

        // Player enters and purchases
        enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
        purchaseOffering(
          state,
          'agent:dev-player',
          DEVELOPMENT_PASTRY_OFFERING_ID,
          'restaurant:development-restaurant'
        );

        // Advance to 17:00 and tick (offering retired)
        clock.advance(8 * 3600_000);
        sim.tick();

        // Save to file
        persistence.save(state);

        // Restore from file
        const loaded = persistence.load();
        assert.ok(loaded);
        assert.equal(loaded.version, 13);
        assert.doesNotThrow(() => validateWorldState(loaded));

        // Offering is absent
        assert.ok(!loaded.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

        // Historical purchase record is intact
        assert.equal(loaded.purchases.length, 1);
        assert.equal(loaded.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
        assert.equal(loaded.purchases[0].amountMinor, 250);

        // Player history query functions on loaded state
        const history = inspectPlayerHistory(loaded, 'agent:dev-player');
        assert.equal(history.success, true);
        assert.equal(history.history?.purchases.length, 1);
      } finally {
        if (existsSync(storagePath)) {
          unlinkSync(storagePath);
        }
      }
    });
  });
});
