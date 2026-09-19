import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  validateWorldStateV12,
  migrateWorldStateV12ToV13,
  WorldStateV12,
  OwnedItem,
  startHavingCoffee,
  enterRestaurant,
  purchaseOffering,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 34: Migration v12 -> v13 & Non-Fabrication Invariants', () => {
  const BASE_TIME = '2026-09-14T09:00:00.000Z';

  function createSampleV12State(): WorldStateV12 {
    const clock = WorldClock.create(BASE_TIME);
    const v13 = createInitialWorldState(clock);
    const v12: WorldStateV12 = {
      worldId: v13.worldId,
      version: 12,
      worldTime: v13.worldTime,
      places: v13.places,
      restaurants: v13.restaurants,
      agents: v13.agents.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        agentType: a.agentType,
        locationId: a.locationId,
        activityState: a.activityState,
        activitySince: a.activitySince,
        balanceMinor: a.balanceMinor,
        currency: a.currency,
        playerActivity: null,
      })),
      offerings: v13.offerings,
      items: [],
      purchases: [],
      coffeeCompletions: [
        {
          id: 'coffee-completion:1',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: '2026-09-14T08:30:00.000Z',
          completedAt: '2026-09-14T08:45:00.000Z',
        },
      ],
      acquaintances: [],
    };
    return v12;
  }

  function addPurchasedItem(
    v12: WorldStateV12,
    itemId: string,
    purchaseId: string,
    acquiredAt: string,
    consumedAt: string | null = null
  ): OwnedItem {
    const player = v12.agents.find((a) => a.id === 'agent:dev-player')!;
    const purchase = {
      id: purchaseId,
      playerId: player.id,
      offeringId: 'offering:development-coffee',
      restaurantId: 'restaurant:development-restaurant',
      amountMinor: 500,
      currency: 'USD',
      worldTime: acquiredAt,
    };
    v12.purchases.push(purchase);
    const item: OwnedItem = {
      id: itemId,
      type: 'item',
      sourcePurchaseId: purchaseId,
      ownerAgentId: player.id,
      restaurantId: 'restaurant:development-restaurant',
      offeringId: 'offering:development-coffee',
      name: 'Café de Olla',
      status: consumedAt ? 'consumed' : 'available',
      acquiredAt,
      consumedAt,
    };
    v12.items.push(item);
    return item;
  }

  describe('1. validateWorldStateV12 Structural Integrity', () => {
    it('accepts a valid WorldStateV12 object', () => {
      const v12 = createSampleV12State();
      assert.doesNotThrow(() => validateWorldStateV12(v12));
    });

    it('rejects state if version is not 12', () => {
      const v12 = createSampleV12State();
      (v12 as any).version = 13;
      assert.throws(() => validateWorldStateV12(v12), /Expected version 12/);
    });

    it('rejects state if coffeeCompletions is missing or not an array', () => {
      const v12 = createSampleV12State();
      delete (v12 as any).coffeeCompletions;
      assert.throws(() => validateWorldStateV12(v12), /coffeeCompletions must be an array/);
    });

    it('rejects state if items is missing', () => {
      const v12 = createSampleV12State();
      delete (v12 as any).items;
      assert.throws(() => validateWorldStateV12(v12), /items must be an array/);
    });
  });

  describe('2. Non-Fabrication Invariants for Active PlayerActivity', () => {
    it('Case 1: Sets itemId: null when zero matching consumed items exist for active coffee', () => {
      const v12 = createSampleV12State();
      const player = v12.agents.find((a) => a.id === 'agent:dev-player')!;
      player.playerActivity = {
        activity: 'having-coffee',
        startedAt: BASE_TIME,
        restaurantId: 'restaurant:development-restaurant',
        completedAt: null,
      };
      // items is empty
      v12.items = [];

      const v13 = migrateWorldStateV12ToV13(v12);
      assert.doesNotThrow(() => validateWorldState(v13));
      assert.equal(v13.version, 13);

      const migratedPlayer = v13.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.ok(migratedPlayer.playerActivity);
      assert.equal(migratedPlayer.playerActivity.activity, 'having-coffee');
      assert.equal(migratedPlayer.playerActivity.durationMs, 900_000);
      assert.equal(migratedPlayer.playerActivity.offeringId, 'offering:development-coffee');
      assert.equal(migratedPlayer.playerActivity.itemId, null);
    });

    it('Case 2: Resolves itemId uniquely when exactly ONE matching consumed item exists', () => {
      const v12 = createSampleV12State();
      const player = v12.agents.find((a) => a.id === 'agent:dev-player')!;
      player.playerActivity = {
        activity: 'having-coffee',
        startedAt: BASE_TIME,
        restaurantId: 'restaurant:development-restaurant',
        completedAt: null,
      };
      // Exactly 1 consumed coffee item matching ownerAgentId, restaurantId, offeringId, status: 'consumed', and consumedAt: startedAt
      addPurchasedItem(v12, 'item:1', 'purchase:1', BASE_TIME, BASE_TIME);

      const v13 = migrateWorldStateV12ToV13(v12);
      assert.doesNotThrow(() => validateWorldState(v13));

      const migratedPlayer = v13.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.ok(migratedPlayer.playerActivity);
      assert.equal(migratedPlayer.playerActivity.itemId, 'item:1');
      assert.equal(migratedPlayer.playerActivity.offeringId, 'offering:development-coffee');
      assert.equal(migratedPlayer.playerActivity.durationMs, 900_000);
    });

    it('Case 3: Sets itemId: null when multiple ambiguous matching consumed items exist', () => {
      const v12 = createSampleV12State();
      const player = v12.agents.find((a) => a.id === 'agent:dev-player')!;
      player.playerActivity = {
        activity: 'having-coffee',
        startedAt: BASE_TIME,
        restaurantId: 'restaurant:development-restaurant',
        completedAt: null,
      };
      // Multiple consumed coffee items matching identical consumption timestamp
      addPurchasedItem(v12, 'item:1', 'purchase:1', BASE_TIME, BASE_TIME);
      addPurchasedItem(v12, 'item:2', 'purchase:2', BASE_TIME, BASE_TIME);

      const v13 = migrateWorldStateV12ToV13(v12);
      assert.doesNotThrow(() => validateWorldState(v13));

      const migratedPlayer = v13.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.ok(migratedPlayer.playerActivity);
      // Non-fabrication: must not guess between ambiguous items
      assert.equal(migratedPlayer.playerActivity.itemId, null);
      assert.equal(migratedPlayer.playerActivity.durationMs, 900_000);
    });
  });

  describe('3. Historical Completion Records Migration & ID Preservation', () => {
    it('migrates coffeeCompletions to activityCompletions preserving legacy IDs and setting itemId: null', () => {
      const v12 = createSampleV12State();
      v12.coffeeCompletions = [
        {
          id: 'coffee-completion:1',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: '2026-09-14T07:00:00.000Z',
          completedAt: '2026-09-14T07:15:00.000Z',
        },
        {
          id: 'coffee-completion:2',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: '2026-09-14T08:00:00.000Z',
          completedAt: '2026-09-14T08:15:00.000Z',
        },
      ];

      const v13 = migrateWorldStateV12ToV13(v12);
      assert.doesNotThrow(() => validateWorldState(v13));
      assert.equal(v13.activityCompletions.length, 2);

      const [c1, c2] = v13.activityCompletions;
      assert.equal(c1.id, 'coffee-completion:1');
      assert.equal(c1.activity, 'having-coffee');
      assert.equal(c1.offeringId, 'offering:development-coffee');
      assert.equal(c1.itemId, null);

      assert.equal(c2.id, 'coffee-completion:2');
      assert.equal(c2.activity, 'having-coffee');
      assert.equal(c2.offeringId, 'offering:development-coffee');
      assert.equal(c2.itemId, null);
    });

    it('new runtime completions sequence cleanly after legacy coffee-completion IDs', () => {
      const v12 = createSampleV12State();
      v12.coffeeCompletions = [
        {
          id: 'coffee-completion:1',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: '2026-09-14T07:00:00.000Z',
          completedAt: '2026-09-14T07:15:00.000Z',
        },
        {
          id: 'coffee-completion:2',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: '2026-09-14T07:30:00.000Z',
          completedAt: '2026-09-14T07:45:00.000Z',
        },
      ];

      const v13 = migrateWorldStateV12ToV13(v12);
      const clock = WorldClock.create(BASE_TIME);
      const sim = new Simulation(clock, v13, { silent: true });
      sim.tick(); // open restaurant

      const player = v13.agents.find((a) => a.id === 'agent:dev-player')!;
      enterRestaurant(v13, player.id, 'restaurant:development-restaurant');
      purchaseOffering(v13, player.id, 'offering:development-coffee');

      startHavingCoffee(v13, player.id);
      clock.advance(15 * 60_000);
      sim.tick();

      assert.equal(v13.activityCompletions.length, 3);
      const newCompletion = v13.activityCompletions[2];
      assert.equal(newCompletion.id, 'activity-completion:3');
    });
  });

  describe('4. LocalFilePersistence Automatic Migration on Load', () => {
    it('automatically migrates a v12 file to v13 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v12-migration-${Date.now()}.json`);
      try {
        const v12 = createSampleV12State();
        writeFileSync(testFile, JSON.stringify(v12, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 13);
        assert.doesNotThrow(() => validateWorldState(loaded));
        assert.equal(loaded.activityCompletions.length, 1);
        assert.equal(loaded.activityCompletions[0].id, 'coffee-completion:1');

        // Fresh persistence instance verifies disk file was saved at version 13
        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 13);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });
});
