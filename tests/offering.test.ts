import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  getRestaurantOfferings,
  enterRestaurant,
} from '../src/core/world-state.js';
import { Offering, validateOfferings } from '../src/core/entities/offering.js';
import { createDevelopmentSeedWorld } from '../src/core/seed.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { Simulation } from '../src/core/simulation.js';

describe('Commercial Offering (Milestone 7)', () => {
  const validRestaurantIds = new Set<string>(['restaurant:development-restaurant']);

  describe('Offering Validation', () => {
    test('valid offering passes validation', () => {
      const offerings: Offering[] = [
        {
          id: 'offering:development-coffee',
          type: 'offering',
          name: 'Coffee',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: 500,
          currency: 'USD',
        },
      ];

      assert.doesNotThrow(() => validateOfferings(offerings, validRestaurantIds));
    });

    test('empty or invalid offering ID fails validation', () => {
      const invalidOfferings = [
        {
          id: '   ',
          type: 'offering',
          name: 'Coffee',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: 500,
          currency: 'USD',
        },
      ];

      assert.throws(
        () => validateOfferings(invalidOfferings, validRestaurantIds),
        /Invalid entity id: must be a non-empty string/
      );
    });

    test('empty or whitespace name fails validation', () => {
      const invalidOfferings = [
        {
          id: 'offering:test',
          type: 'offering',
          name: '   ',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: 500,
          currency: 'USD',
        },
      ];

      assert.throws(
        () => validateOfferings(invalidOfferings, validRestaurantIds),
        /Invalid offering name: must be a non-empty string/
      );
    });

    test('invalid restaurantId reference fails validation', () => {
      const invalidOfferings = [
        {
          id: 'offering:test',
          type: 'offering',
          name: 'Coffee',
          restaurantId: 'restaurant:non-existent',
          priceMinor: 500,
          currency: 'USD',
        },
      ];

      assert.throws(
        () => validateOfferings(invalidOfferings, validRestaurantIds),
        /references non-existent or invalid restaurantId: "restaurant:non-existent"/
      );
    });

    test('offering referencing a Place, Agent, or another Offering fails validation', () => {
      const testCases = [
        { id: 'offering:ref-place', ref: 'building:development-building' },
        { id: 'offering:ref-agent', ref: 'agent:dev-player' },
        { id: 'offering:ref-offering', ref: 'offering:development-coffee' },
      ];

      for (const tc of testCases) {
        const invalidOfferings = [
          {
            id: tc.id,
            type: 'offering',
            name: 'Item',
            restaurantId: tc.ref,
            priceMinor: 500,
            currency: 'USD',
          },
        ];

        assert.throws(
          () => validateOfferings(invalidOfferings, validRestaurantIds),
          /references non-existent or invalid restaurantId:/
        );
      }
    });

    test('duplicate offering ID fails validation', () => {
      const duplicateOfferings: Offering[] = [
        {
          id: 'offering:coffee',
          type: 'offering',
          name: 'Coffee 1',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: 500,
          currency: 'USD',
        },
        {
          id: 'offering:coffee',
          type: 'offering',
          name: 'Coffee 2',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: 600,
          currency: 'USD',
        },
      ];

      assert.throws(
        () => validateOfferings(duplicateOfferings, validRestaurantIds),
        /Duplicate entity id found in offerings: "offering:coffee"/
      );
    });

    test('negative priceMinor fails validation', () => {
      const invalidOfferings = [
        {
          id: 'offering:test',
          type: 'offering',
          name: 'Coffee',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: -100,
          currency: 'USD',
        },
      ];

      assert.throws(
        () => validateOfferings(invalidOfferings, validRestaurantIds),
        /Invalid priceMinor for offering "offering:test": must be a non-negative integer/
      );
    });

    test('non-integer priceMinor fails validation', () => {
      const invalidOfferings = [
        {
          id: 'offering:test',
          type: 'offering',
          name: 'Coffee',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: 5.99,
          currency: 'USD',
        },
      ];

      assert.throws(
        () => validateOfferings(invalidOfferings, validRestaurantIds),
        /Invalid priceMinor for offering "offering:test": must be a non-negative integer/
      );
    });

    test('non-finite or NaN priceMinor fails validation', () => {
      const invalidOfferings = [
        {
          id: 'offering:test',
          type: 'offering',
          name: 'Coffee',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: NaN,
          currency: 'USD',
        },
      ];

      assert.throws(
        () => validateOfferings(invalidOfferings, validRestaurantIds),
        /Invalid priceMinor for offering "offering:test": must be a non-negative integer/
      );
    });

    test('empty or whitespace currency fails validation', () => {
      const invalidOfferings = [
        {
          id: 'offering:test',
          type: 'offering',
          name: 'Coffee',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: 500,
          currency: '   ',
        },
      ];

      assert.throws(
        () => validateOfferings(invalidOfferings, validRestaurantIds),
        /Invalid currency for offering "offering:test": must be a non-empty string/
      );
    });

    test('invalid entity type fails validation', () => {
      const invalidOfferings = [
        {
          id: 'offering:test',
          type: 'product',
          name: 'Coffee',
          restaurantId: 'restaurant:development-restaurant',
          priceMinor: 500,
          currency: 'USD',
        },
      ];

      assert.throws(
        () => validateOfferings(invalidOfferings, validRestaurantIds),
        /Invalid entity type for offering "offering:test": "product"/
      );
    });
  });

  describe('WorldState Integration & Global Uniqueness', () => {
    test('version 18 accepts valid offerings', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);

      assert.equal(state.version, 18);
      assert.doesNotThrow(() => validateWorldState(state));
    });

    test('rejects versions 1 through 17 explicitly', () => {
      const seed = createDevelopmentSeedWorld();
      for (let v = 1; v <= 17; v++) {
        const state = {
          worldId: 'juarez-el-paso',
          version: v,
          worldTime: '2026-09-14T08:00:00.000Z',
          places: seed.places,
          restaurants: seed.restaurants,
          agents: seed.agents,
          offerings: seed.offerings,
        };

        assert.throws(
          () => validateWorldState(state),
          new RegExp(`Unsupported WorldState version: ${v}\\. Expected version 18`)
        );
      }
    });

    test('offering IDs participate in global entity ID uniqueness', () => {
      const seed = createDevelopmentSeedWorld();
      // Collide offering ID with existing restaurant ID
      const collidingOffering: Offering = {
        id: 'restaurant:development-restaurant',
        type: 'offering',
        name: 'Colliding Offering',
        restaurantId: 'restaurant:development-restaurant',
        priceMinor: 500,
        currency: 'USD',
      };

      const invalidState = {
        worldId: 'juarez-el-paso',
        version: 18,
        worldTime: '2026-09-14T08:00:00.000Z',
        places: seed.places,
        restaurants: seed.restaurants,
        agents: seed.agents,
        offerings: [collidingOffering],
        purchases: [],
        activityCompletions: [],
        acquaintances: [],
        items: [],
        knowledge: [],
        orders: [],
        properties: seed.properties,
        siteAgentAssociations: seed.siteAgentAssociations,
      };

      assert.throws(
        () => validateWorldState(invalidState),
        /Duplicate entity id found across collections: "restaurant:development-restaurant"/
      );
    });

    test('enforces restaurant reference integrity in WorldState', () => {
      const seed = createDevelopmentSeedWorld();
      const invalidOffering: Offering = {
        id: 'offering:orphan',
        type: 'offering',
        name: 'Orphan Coffee',
        restaurantId: 'restaurant:does-not-exist',
        priceMinor: 500,
        currency: 'USD',
      };

      const invalidState = {
        worldId: 'juarez-el-paso',
        version: 18,
        worldTime: '2026-09-14T08:00:00.000Z',
        places: seed.places,
        restaurants: seed.restaurants,
        agents: seed.agents,
        offerings: [invalidOffering],
        purchases: [],
        activityCompletions: [],
        acquaintances: [],
        items: [],
        knowledge: [],
        orders: [],
        properties: seed.properties,
        siteAgentAssociations: seed.siteAgentAssociations,
      };

      assert.throws(
        () => validateWorldState(invalidState),
        /references non-existent or invalid restaurantId: "restaurant:does-not-exist"/
      );
    });
  });

  describe('Development Seed', () => {
    test('creates exactly the intended synthetic offering referencing development restaurant', () => {
      const seed = createDevelopmentSeedWorld();

      assert.equal(seed.offerings.length, 1);
      const offering = seed.offerings[0];

      assert.equal(offering.id, 'offering:development-coffee');
      assert.equal(offering.type, 'offering');
      assert.equal(offering.name, 'Coffee');
      assert.equal(offering.restaurantId, 'restaurant:development-restaurant');
      assert.equal(offering.priceMinor, 500);
      assert.equal(offering.currency, 'USD');
    });
  });

  describe('Persistence & Reconstruction', () => {
    test('offering survives save/load and fields remain identical after reconstruction', () => {
      const testPath = join(tmpdir(), `test-offering-persist-${Date.now()}.json`);
      try {
        const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
        const state = createInitialWorldState(clock);
        const persistence = new LocalFilePersistence(testPath);

        persistence.save(state);

        const restoredPersistence = new LocalFilePersistence(testPath);
        const restoredState = restoredPersistence.load();

        assert.ok(restoredState !== null);
        assert.doesNotThrow(() => validateWorldState(restoredState));
        assert.equal(restoredState.version, 18);
        assert.deepEqual(restoredState.offerings, state.offerings);
      } finally {
        if (existsSync(testPath)) {
          unlinkSync(testPath);
        }
      }
    });

    test('corrupted offering in persisted state is rejected upon load', () => {
      const testPath = join(tmpdir(), `test-offering-corrupt-${Date.now()}.json`);
      try {
        const seed = createDevelopmentSeedWorld();
        const corruptState = {
          worldId: 'juarez-el-paso',
          version: 18,
          worldTime: '2026-09-14T08:00:00.000Z',
          places: seed.places,
          restaurants: seed.restaurants,
          agents: seed.agents,
          purchases: [],
          activityCompletions: [],
          acquaintances: [],
          items: [],
          knowledge: [],
          orders: [],
          properties: seed.properties,
          siteAgentAssociations: seed.siteAgentAssociations,
          offerings: [
            {
              id: 'offering:bad-price',
              type: 'offering',
              name: 'Bad Price',
              restaurantId: 'restaurant:development-restaurant',
              priceMinor: -500,
              currency: 'USD',
            },
          ],
        };

        writeFileSync(testPath, JSON.stringify(corruptState), 'utf-8');

        const persistence = new LocalFilePersistence(testPath);
        assert.throws(
          () => persistence.load(),
          /Invalid priceMinor for offering "offering:bad-price": must be a non-negative integer/
        );
      } finally {
        if (existsSync(testPath)) {
          unlinkSync(testPath);
        }
      }
    });
  });

  describe('Query: getRestaurantOfferings', () => {
    test('returns expected offering and does not mutate WorldState', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      const offerings = getRestaurantOfferings(state, 'restaurant:development-restaurant');

      assert.equal(offerings.length, 1);
      assert.equal(offerings[0].id, 'offering:development-coffee');
      assert.equal(offerings[0].name, 'Coffee');
      assert.equal(offerings[0].priceMinor, 500);
      assert.equal(offerings[0].currency, 'USD');

      // Assert zero mutation
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('returns empty array deterministically for unknown restaurant without mutation', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      const offerings = getRestaurantOfferings(state, 'restaurant:unknown');

      assert.deepEqual(offerings, []);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('returns offerings regardless of whether restaurant is open or closed', () => {
      // 08:00 UTC -> closed
      // 08:00 local (14:00 UTC) -> closed
      const clockClosed = WorldClock.create('2026-09-14T14:00:00.000Z');
      const stateClosed = createInitialWorldState(clockClosed);
      assert.equal(stateClosed.restaurants[0].operationalState, 'closed');

      const closedOfferings = getRestaurantOfferings(stateClosed, 'restaurant:development-restaurant');
      assert.equal(closedOfferings.length, 1);
      assert.equal(closedOfferings[0].id, 'offering:development-coffee');

      // 09:00 local (15:00 UTC) -> open
      const clockOpen = WorldClock.create('2026-09-14T15:00:00.000Z');
      const stateOpen = createInitialWorldState(clockOpen);
      assert.equal(stateOpen.restaurants[0].operationalState, 'open');

      const openOfferings = getRestaurantOfferings(stateOpen, 'restaurant:development-restaurant');
      assert.equal(openOfferings.length, 1);
      assert.equal(openOfferings[0].id, 'offering:development-coffee');
    });
  });

  describe('Operational State Independence', () => {
    test('closing and reopening restaurant via simulation tick does not mutate offering data', () => {
      const clock = WorldClock.create('2026-09-14T15:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state);

      const initialOfferingData = JSON.stringify(state.offerings);

      // Advance to 17:00 (closed)
      clock.advance(8 * 3600_000);
      sim.tick();
      assert.equal(state.restaurants[0].operationalState, 'closed');
      assert.equal(JSON.stringify(state.offerings), initialOfferingData);

      // Advance to next day 09:00 (reopened)
      clock.advance(16 * 3600_000);
      sim.tick();
      assert.equal(state.restaurants[0].operationalState, 'open');
      // In Milestone 19-A, active NPC at open restaurant makes Pan Dulce available alongside Coffee
      const coffee = state.offerings.find((o) => o.id === 'offering:development-coffee');
      assert.ok(coffee);
      assert.equal(coffee.priceMinor, 500);
      const pastry = state.offerings.find((o) => o.id === 'offering:development-pastry');
      assert.ok(pastry);
      assert.equal(pastry.priceMinor, 250);

      // Advance to 17:00 (closed again) - Pan Dulce is retired back to initial offering data
      clock.advance(8 * 3600_000);
      sim.tick();
      assert.equal(state.restaurants[0].operationalState, 'closed');
      assert.equal(JSON.stringify(state.offerings), initialOfferingData);
    });
  });

  describe('M6 Integration: Restaurant Entry & Offering Inspection', () => {
    test('player enters restaurant while open and can inspect offerings without economic mutation', () => {
      const clock = WorldClock.create('2026-09-14T15:00:00.000Z');
      const state = createInitialWorldState(clock);

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'building:development-building');

      // Player enters restaurant
      const entryResult = enterRestaurant(
        state,
        'agent:dev-player',
        'restaurant:development-restaurant',
        { silent: true }
      );
      assert.equal(entryResult.success, true);
      assert.equal(player.locationId, 'restaurant:development-restaurant');

      // Player inspects offerings
      const offerings = getRestaurantOfferings(state, player.locationId);
      assert.equal(offerings.length, 1);
      assert.equal(offerings[0].name, 'Coffee');
      assert.equal(offerings[0].priceMinor, 500);

      // Verify no money, wallet, or purchase state was introduced
      assert.equal('wallet' in player, false);
      assert.equal('balance' in player, false);
      assert.equal('inventory' in player, false);
      assert.deepEqual(state.orders, []);
      assert.equal('transactions' in state, false);
    });
  });

  describe('Explicit Verification of What Does NOT Happen', () => {
    test('no wallet, orders, inventory, or transactions exist in world state', () => {
      const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
      const state = createInitialWorldState(clock);

      const rawState = state as Record<string, unknown>;
      assert.equal(rawState.economy, undefined);
      assert.deepEqual(rawState.orders, []);
      assert.deepEqual(rawState.purchases, []);
      assert.equal(rawState.transactions, undefined);
      assert.equal(rawState.inventory, undefined);

      for (const agent of state.agents) {
        const rawAgent = agent as Record<string, unknown>;
        assert.equal(rawAgent.wallet, undefined);
        assert.equal(rawAgent.balance, undefined);
        assert.equal(rawAgent.inventory, undefined);
        assert.equal(rawAgent.money, undefined);
      }

      for (const restaurant of state.restaurants) {
        const rawRestaurant = restaurant as Record<string, unknown>;
        assert.equal(rawRestaurant.revenue, undefined);
        assert.equal(rawRestaurant.balance, undefined);
        assert.equal(rawRestaurant.inventory, undefined);
        assert.equal(rawRestaurant.money, undefined);
      }

      for (const offering of state.offerings) {
        const rawOffering = offering as Record<string, unknown>;
        assert.equal(rawOffering.isAvailable, undefined);
        assert.equal(rawOffering.inventory, undefined);
        assert.equal(rawOffering.stock, undefined);
      }
    });
  });
});
