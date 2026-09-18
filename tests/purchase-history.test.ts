import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  purchaseOffering,
  startHavingCoffee,
  inspectCurrentLocation,
  enterRestaurant,
  transitionAgentLocation,
  CURRENT_WORLD_STATE_VERSION,
  PurchaseRecord,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

function setupOpenWorld() {
  // 09:00:00 UTC -> development restaurant is open
  const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
  const state = createInitialWorldState(clock);
  const sim = new Simulation(clock, state, { silent: true });
  sim.tick(); // transition restaurant from closed to open

  // Move player into restaurant
  enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', {
    silent: true,
  });

  return { clock, state, sim };
}

describe('Milestone 13: First Persistent Historical Event (Coffee Purchase)', () => {
  // =========================================================================
  // 1. Record Creation
  // =========================================================================
  describe('1. Record Creation', () => {
    test('successful purchase creates exactly one PurchaseRecord in state.purchases', () => {
      const { state } = setupOpenWorld();

      assert.equal(state.purchases.length, 0);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');

      // Exactly one historical record
      assert.equal(state.purchases.length, 1);
      const record = state.purchases[0];

      assert.equal(record.id, 'purchase:1');
      assert.equal(record.worldTime, '2026-09-14T09:00:00.000Z');
      assert.equal(record.playerId, 'agent:dev-player');
      assert.equal(record.restaurantId, 'restaurant:development-restaurant');
      assert.equal(record.offeringId, 'offering:development-coffee');
      assert.equal(record.amountMinor, 500);
      assert.equal(record.currency, 'USD');
    });

    test('historical record does NOT contain transient result fields', () => {
      const { state } = setupOpenWorld();

      purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      const rawRecord = state.purchases[0] as unknown as Record<string, unknown>;

      // Strictly historical facts only: no balance snapshots or ephemeral interaction flags
      assert.equal(rawRecord.playerBalanceAfter, undefined);
      assert.equal(rawRecord.restaurantBalanceAfter, undefined);
      assert.equal(rawRecord.success, undefined);
      assert.equal(rawRecord.code, undefined);
      assert.equal(rawRecord.message, undefined);
    });
  });

  // =========================================================================
  // 2. Multiplicity & Monotonic ID Generation
  // =========================================================================
  describe('2. Multiplicity & Monotonic ID Generation', () => {
    test('repeated successful purchases generate distinct, monotonically numbered records', () => {
      const { state } = setupOpenWorld();

      // Initial player balance is 2000 minor USD ($20.00), coffee is 500 minor USD ($5.00)
      // Can perform up to 4 purchases
      const res1 = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );
      assert.equal(res1.success, true);

      const res2 = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );
      assert.equal(res2.success, true);

      const res3 = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );
      assert.equal(res3.success, true);

      assert.equal(state.purchases.length, 3);
      assert.equal(state.purchases[0].id, 'purchase:1');
      assert.equal(state.purchases[1].id, 'purchase:2');
      assert.equal(state.purchases[2].id, 'purchase:3');

      // Verify all records are unique objects
      assert.notEqual(state.purchases[0], state.purchases[1]);
      assert.notEqual(state.purchases[1], state.purchases[2]);
    });
  });

  // =========================================================================
  // 3. Preconditions & Negative Paths: Zero Historical Records
  // =========================================================================
  describe('3. Preconditions & Negative Paths: Zero Historical Records', () => {
    test('fails with agent-not-found -> 0 records and zero state mutation', () => {
      const { state } = setupOpenWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:non-existent',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-found');
      assert.equal(state.purchases.length, 0);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with agent-not-player -> 0 records and zero state mutation', () => {
      const { state } = setupOpenWorld();
      // Move NPC to restaurant
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'restaurant:development-restaurant';
      const snapshotBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-npc',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-player');
      assert.equal(state.purchases.length, 0);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with restaurant-not-found -> 0 records and zero state mutation', () => {
      const { state } = setupOpenWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:phantom',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-not-found');
      assert.equal(state.purchases.length, 0);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with not-inside-restaurant -> 0 records and zero state mutation', () => {
      const { state } = setupOpenWorld();
      // Move player back to street
      transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');
      const snapshotBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'not-inside-restaurant');
      assert.equal(state.purchases.length, 0);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with restaurant-closed -> 0 records and zero state mutation', () => {
      const { state } = setupOpenWorld();
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.operationalState = 'closed';
      const snapshotBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-closed');
      assert.equal(state.purchases.length, 0);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with offering-not-found -> 0 records and zero state mutation', () => {
      const { state } = setupOpenWorld();
      const snapshotBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:ghost-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'offering-not-found');
      assert.equal(state.purchases.length, 0);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with offering-not-at-restaurant -> 0 records and zero state mutation', () => {
      const { state } = setupOpenWorld();
      // Introduce an offering belonging to another restaurant
      state.offerings.push({
        id: 'offering:other-coffee',
        type: 'offering',
        name: 'Other Coffee',
        restaurantId: 'restaurant:other-restaurant',
        priceMinor: 500,
        currency: 'USD',
      });
      const snapshotBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:other-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'offering-not-at-restaurant');
      assert.equal(state.purchases.length, 0);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with currency-mismatch -> 0 records and zero state mutation', () => {
      const { state } = setupOpenWorld();
      const coffee = state.offerings.find((o) => o.id === 'offering:development-coffee')!;
      coffee.currency = 'MXN';
      const snapshotBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'currency-mismatch');
      assert.equal(state.purchases.length, 0);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with insufficient-funds -> 0 records and zero state mutation', () => {
      const { state } = setupOpenWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.balanceMinor = 200; // less than 500
      const snapshotBefore = JSON.stringify(state);

      const result = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'insufficient-funds');
      assert.equal(state.purchases.length, 0);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 4. Historical Semantics: Price Independence
  // =========================================================================
  describe('4. Historical Semantics: Price Independence', () => {
    test('historical amount remains immutable when current offering price changes later', () => {
      const { state } = setupOpenWorld();

      // Purchase at initial price of 500 minor USD ($5.00)
      const purchaseResult = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );
      assert.equal(purchaseResult.success, true);
      assert.equal(state.purchases[0].amountMinor, 500);

      // Subsequent world event: Restaurant updates offering price to 750 minor USD ($7.50)
      const coffee = state.offerings.find((o) => o.id === 'offering:development-coffee')!;
      coffee.priceMinor = 750;

      // Validate that the historical fact is still completely valid
      assert.doesNotThrow(() => validateWorldState(state));

      // The historical record's amountMinor must NOT have changed
      assert.equal(state.purchases[0].amountMinor, 500);
      assert.equal(coffee.priceMinor, 750);
    });
  });

  // =========================================================================
  // 5. Referential Integrity & Validation
  // =========================================================================
  describe('5. Referential Integrity & Validation', () => {
    test('validateWorldState rejects purchase record referencing non-existent agent', () => {
      const { state } = setupOpenWorld();
      state.purchases.push({
        id: 'purchase:1',
        worldTime: state.worldTime,
        playerId: 'agent:ghost-agent',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
      });

      assert.throws(
        () => validateWorldState(state),
        /playerId "agent:ghost-agent" references non-existent agent/
      );
    });

    test('validateWorldState rejects purchase record referencing NPC as player', () => {
      const { state } = setupOpenWorld();
      state.purchases.push({
        id: 'purchase:1',
        worldTime: state.worldTime,
        playerId: 'agent:dev-npc',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
      });

      assert.throws(
        () => validateWorldState(state),
        /agent "agent:dev-npc" is not a player/
      );
    });

    test('validateWorldState rejects purchase record referencing non-existent restaurant', () => {
      const { state } = setupOpenWorld();
      state.purchases.push({
        id: 'purchase:1',
        worldTime: state.worldTime,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:ghost',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
      });

      assert.throws(
        () => validateWorldState(state),
        /restaurantId "restaurant:ghost" references non-existent restaurant/
      );
    });

    test('validateWorldState rejects purchase record referencing non-existent offering', () => {
      const { state } = setupOpenWorld();
      state.purchases.push({
        id: 'purchase:1',
        worldTime: state.worldTime,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:ghost',
        amountMinor: 500,
        currency: 'USD',
      });

      assert.throws(
        () => validateWorldState(state),
        /offeringId "offering:ghost" references non-existent offering/
      );
    });

    test('validateWorldState rejects purchase record where offering does not belong to recorded restaurant', () => {
      const { state } = setupOpenWorld();
      // Create a second restaurant
      state.restaurants.push({
        id: 'restaurant:second-restaurant',
        type: 'restaurant',
        name: 'Second Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'open',
        operationalSince: state.worldTime,
        balanceMinor: 0,
        currency: 'USD',
      });

      state.purchases.push({
        id: 'purchase:1',
        worldTime: state.worldTime,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:second-restaurant',
        offeringId: 'offering:development-coffee', // belongs to development-restaurant
        amountMinor: 500,
        currency: 'USD',
      });

      assert.throws(
        () => validateWorldState(state),
        /offering "offering:development-coffee" belongs to restaurant "restaurant:development-restaurant", not "restaurant:second-restaurant"/
      );
    });

    test('validateWorldState rejects duplicate purchase record IDs', () => {
      const { state } = setupOpenWorld();
      const validRecord: PurchaseRecord = {
        id: 'purchase:1',
        worldTime: state.worldTime,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
      };
      state.purchases.push(validRecord);
      state.purchases.push({ ...validRecord }); // duplicate ID

      assert.throws(
        () => validateWorldState(state),
        /Duplicate purchase record id found: "purchase:1"/
      );
    });

    test('validateWorldState rejects invalid amountMinor or currency', () => {
      const { state } = setupOpenWorld();
      const badAmount: Record<string, unknown> = {
        id: 'purchase:1',
        worldTime: state.worldTime,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: -50,
        currency: 'USD',
      };
      state.purchases.push(badAmount as unknown as PurchaseRecord);

      assert.throws(
        () => validateWorldState(state),
        /amountMinor must be a non-negative integer/
      );
    });
  });

  // =========================================================================
  // 6. Snapshot Isolation
  // =========================================================================
  describe('6. Snapshot Isolation', () => {
    test('modifying snapshot purchase collection does NOT alter original state purchases', () => {
      const { clock, state } = setupOpenWorld();

      purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(state.purchases.length, 1);

      // Take snapshot
      const snapshot = snapshotWorldState(clock, state);
      assert.equal(snapshot.purchases.length, 1);

      // Mutate snapshot purchases collection
      snapshot.purchases.push({
        id: 'purchase:99',
        worldTime: clock.getTime(),
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
      });

      assert.equal(snapshot.purchases.length, 2);
      // Original state must remain isolated with length 1
      assert.equal(state.purchases.length, 1);
      assert.equal(state.purchases[0].id, 'purchase:1');
    });
  });

  // =========================================================================
  // 7. Persistence Roundtrip & Continuation
  // =========================================================================
  describe('7. Persistence Roundtrip & Continuation', () => {
    test('history survives save/load and subsequent purchase continues monotonic ID sequence', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-m13-persist-'));
      const testFile = join(tmpDir, 'world-state.json');

      try {
        const { clock, state } = setupOpenWorld();

        // 1. Purchase in Session A
        const resA = purchaseOffering(
          state,
          'agent:dev-player',
          'offering:development-coffee',
          'restaurant:development-restaurant',
          { silent: true }
        );
        assert.equal(resA.success, true);
        assert.equal(state.purchases.length, 1);

        // 2. Save Session A
        const persistenceA = new LocalFilePersistence(testFile);
        persistenceA.save(snapshotWorldState(clock, state));

        // 3. Fresh Session B restore
        const persistenceB = new LocalFilePersistence(testFile);
        const stateB = persistenceB.load()!;
        assert.ok(stateB !== null);
        assert.doesNotThrow(() => validateWorldState(stateB));
        assert.equal(stateB.version, CURRENT_WORLD_STATE_VERSION);
        assert.equal(stateB.purchases.length, 1);

        const restoredRecord = stateB.purchases[0];
        assert.equal(restoredRecord.id, 'purchase:1');
        assert.equal(restoredRecord.playerId, 'agent:dev-player');
        assert.equal(restoredRecord.amountMinor, 500);

        // 4. Second purchase in Session B
        const resB = purchaseOffering(
          stateB,
          'agent:dev-player',
          'offering:development-coffee',
          'restaurant:development-restaurant',
          { silent: true }
        );
        assert.equal(resB.success, true);

        // 5. Verify continuation of monotonic IDs
        assert.equal(stateB.purchases.length, 2);
        assert.equal(stateB.purchases[1].id, 'purchase:2');
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });

  // =========================================================================
  // 8. Milestone Isolation
  // =========================================================================
  describe('8. Milestone Isolation', () => {
    test('M12 inspectCurrentLocation does NOT leak or expose purchase history', () => {
      const { state } = setupOpenWorld();

      purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      const perception = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(perception.success, true);

      const rawPerception = perception as unknown as Record<string, unknown>;
      assert.equal(rawPerception.purchases, undefined);
      assert.equal(rawPerception.history, undefined);

      const rawLocation = perception.location as unknown as Record<string, unknown>;
      assert.equal(rawLocation.purchases, undefined);
      assert.equal(rawLocation.history, undefined);

      for (const agent of perception.location.agents) {
        const rawAgent = agent as unknown as Record<string, unknown>;
        assert.equal(rawAgent.purchases, undefined);
        assert.equal(rawAgent.history, undefined);
      }

      for (const offering of (perception.location as any).offerings) {
        const rawOffering = offering as Record<string, unknown>;
        assert.equal(rawOffering.purchases, undefined);
        assert.equal(rawOffering.history, undefined);
      }
    });

    test('M9 startHavingCoffee operates via ephemeral receipt and does not query purchases', () => {
      const { state } = setupOpenWorld();

      const purchaseResult = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      // Ephemeral receipt is passed to startHavingCoffee
      const coffeeResult = startHavingCoffee(state, 'agent:dev-player', purchaseResult);
      assert.equal(coffeeResult.success, true);
      assert.equal(coffeeResult.code, 'success');

      // Purposely empty state.purchases to prove startHavingCoffee never queries it
      const originalPurchases = state.purchases;
      state.purchases = [];

      // Evaluating having coffee completion does NOT inspect state.purchases
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.playerActivity?.activity, 'having-coffee');

      // Restore purchases
      state.purchases = originalPurchases;
    });

    test('simulation tick does not mutate, prune, or process purchases', () => {
      const { clock, state, sim } = setupOpenWorld();

      purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(state.purchases.length, 1);

      // Advance clock and tick simulation
      clock.advance(15 * 60_000);
      sim.tick();

      assert.equal(state.purchases.length, 1);
      assert.equal(state.purchases[0].id, 'purchase:1');
    });
  });

  // =========================================================================
  // 9. Schema Version 10 Strictness
  // =========================================================================
  describe('9. Schema Version Strictness', () => {
    test('validateWorldState accepts valid version 12 state and rejects version 11 and 10', () => {
      const { state } = setupOpenWorld();

      assert.equal(state.version, 12);
      assert.doesNotThrow(() => validateWorldState(state));

      // Downgrade version to 10
      const v10Candidate = { ...state, version: 10 };
      assert.throws(
        () => validateWorldState(v10Candidate),
        /Unsupported WorldState version: 10\. Expected version 12/
      );
      const v11Candidate = { ...state, version: 11 };
      assert.throws(
        () => validateWorldState(v11Candidate),
        /Unsupported WorldState version: 11\. Expected version 12/
      );
    });

    test('validateWorldState rejects missing or non-array purchases', () => {
      const { state } = setupOpenWorld();

      const missingPurchases = { ...state } as Record<string, unknown>;
      delete missingPurchases.purchases;

      assert.throws(
        () => validateWorldState(missingPurchases),
        /Invalid WorldState: purchases must be an array/
      );

      const nonArrayPurchases = { ...state, purchases: 'not-an-array' };
      assert.throws(
        () => validateWorldState(nonArrayPurchases),
        /Invalid WorldState: purchases must be an array/
      );
    });
  });
});
