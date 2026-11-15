import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import {
  WorldStateV11,
  validateWorldStateV12,
  validateWorldStateV11,
  migrateWorldStateV11ToV12,
  DEVELOPMENT_PASTRY_OFFERING_ID,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createDevelopmentSeedWorld } from '../src/core/seed.js';

describe('Milestone 33: Schema Version 11 -> 12 Migration & Persistence Safety', () => {
  const testFilePath = join(
    tmpdir(),
    `test-migration-v11-v12-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  const seed = createDevelopmentSeedWorld();

  function createValidV11State(): WorldStateV11 {
    return {
      worldId: 'juarez-el-paso',
      version: 11,
      worldTime: '2026-09-14T09:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      coffeeCompletions: [],
      acquaintances: [],
    };
  }

  beforeEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  describe('1. In-Memory Migration Transform & Validation', () => {
    test('migrates valid v11 state with no purchases to valid v12 state with empty items', () => {
      const v11 = createValidV11State();
      assert.doesNotThrow(() => validateWorldStateV11(v11));

      const v12 = migrateWorldStateV11ToV12(v11);
      assert.equal(v12.version, 12);
      assert.deepEqual(v12.items, []);
      assert.doesNotThrow(() => validateWorldStateV12(v12));
    });

    test('preserves unconsumed purchases with null or undefined consumedAt as available items', () => {
      const v11 = createValidV11State();
      v11.purchases.push(
        {
          id: 'purchase:1',
          worldTime: '2026-09-14T09:00:00.000Z',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:development-coffee',
          amountMinor: 500,
          currency: 'USD',
          consumedAt: null,
        },
        {
          id: 'purchase:2',
          worldTime: '2026-09-14T09:05:00.000Z',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:development-coffee',
          amountMinor: 500,
          currency: 'USD',
          // consumedAt omitted / undefined
        }
      );

      assert.doesNotThrow(() => validateWorldStateV11(v11));

      const v12 = migrateWorldStateV11ToV12(v11);
      assert.equal(v12.items.length, 2);

      assert.equal(v12.items[0].id, 'item:1');
      assert.equal(v12.items[0].status, 'available');
      assert.equal(v12.items[0].consumedAt, null);

      assert.equal(v12.items[1].id, 'item:2');
      assert.equal(v12.items[1].status, 'available');
      assert.equal(v12.items[1].consumedAt, null);

      assert.doesNotThrow(() => validateWorldStateV12(v12));
    });

    test('migrates consumed legacy purchases to consumed items preserving timestamp', () => {
      const v11 = createValidV11State();
      const consumedTime = '2026-09-14T09:10:00.000Z';
      v11.purchases.push({
        id: 'purchase:1',
        worldTime: '2026-09-14T09:00:00.000Z',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
        consumedAt: consumedTime,
      });

      const v12 = migrateWorldStateV11ToV12(v11);
      assert.equal(v12.items.length, 1);
      assert.equal(v12.items[0].status, 'consumed');
      assert.equal(v12.items[0].consumedAt, consumedTime);

      assert.doesNotThrow(() => validateWorldStateV12(v12));
    });

    test('allocates dense item IDs when qualifying and non-qualifying purchases are interleaved', () => {
      const v11 = createValidV11State();
      v11.offerings.push({
        id: 'offering:service-consultation',
        type: 'offering',
        name: 'Consultation',
        restaurantId: 'restaurant:development-restaurant',
        priceMinor: 100,
        currency: 'USD',
      });

      v11.purchases.push(
        {
          id: 'purchase:1',
          worldTime: '2026-09-14T09:00:00.000Z',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:development-coffee',
          amountMinor: 500,
          currency: 'USD',
          consumedAt: null,
        },
        {
          id: 'purchase:2',
          worldTime: '2026-09-14T09:01:00.000Z',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:service-consultation', // Non-qualifying
          amountMinor: 100,
          currency: 'USD',
          consumedAt: null,
        },
        {
          id: 'purchase:3',
          worldTime: '2026-09-14T09:02:00.000Z',
          playerId: 'agent:dev-player',
          restaurantId: 'restaurant:development-restaurant',
          offeringId: 'offering:development-coffee',
          amountMinor: 500,
          currency: 'USD',
          consumedAt: null,
        }
      );

      const v12 = migrateWorldStateV11ToV12(v11);
      assert.equal(v12.items.length, 2);
      assert.equal(v12.items[0].id, 'item:1');
      assert.equal(v12.items[0].sourcePurchaseId, 'purchase:1');
      assert.equal(v12.items[1].id, 'item:2'); // Dense ID: item:2, not item:3!
      assert.equal(v12.items[1].sourcePurchaseId, 'purchase:3');

      assert.doesNotThrow(() => validateWorldStateV12(v12));
    });

    test('reconstructs retired Pan Dulce purchase with name "Pan Dulce"', () => {
      const v11 = createValidV11State();
      v11.purchases.push({
        id: 'purchase:1',
        worldTime: '2026-09-14T09:00:00.000Z',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: DEVELOPMENT_PASTRY_OFFERING_ID,
        amountMinor: 300,
        currency: 'USD',
        consumedAt: null,
      });

      const v12 = migrateWorldStateV11ToV12(v11);
      assert.equal(v12.items.length, 1);
      assert.equal(v12.items[0].name, 'Pan Dulce');
      assert.equal(v12.items[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

      assert.doesNotThrow(() => validateWorldStateV12(v12));
    });
  });

  describe('2. Persistence Integration & Failure Safety (FC-02)', () => {
    test('LocalFilePersistence.load() automatically migrates v11 file to v12 and persists to disk', () => {
      const persistence = new LocalFilePersistence(testFilePath);
      const v11 = createValidV11State();
      v11.purchases.push({
        id: 'purchase:1',
        worldTime: '2026-09-14T09:00:00.000Z',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
        consumedAt: null,
      });

      // Write raw v11 to disk
      writeFileSync(testFilePath, JSON.stringify(v11, null, 2), 'utf-8');

      // Load via persistence
      const loaded = persistence.load();
      assert.notEqual(loaded, null);
      assert.equal(loaded?.version, 19);
      assert.equal(loaded?.items.length, 1);
      assert.equal(loaded?.items[0].id, 'item:1');

      // Verify file on disk is now upgraded to version 18
      const onDiskRaw = readFileSync(testFilePath, 'utf-8');
      const onDisk = JSON.parse(onDiskRaw);
      assert.equal(onDisk.version, 19);
      assert.equal(onDisk.items.length, 1);

      // Repeat load is idempotent and directly loads v18 without re-migration
      const repeatLoaded = persistence.load();
      assert.equal(repeatLoaded?.version, 19);
      assert.deepEqual(repeatLoaded, loaded);
    });

    test('persistence failure during v11->v12 migration leaves original v11 file intact on disk (FC-02)', () => {
      const persistence = new LocalFilePersistence(testFilePath);
      const v11 = createValidV11State();
      v11.purchases.push({
        id: 'purchase:1',
        worldTime: '2026-09-14T09:00:00.000Z',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
        consumedAt: null,
      });

      const originalJson = JSON.stringify(v11, null, 2);
      writeFileSync(testFilePath, originalJson, 'utf-8');

      // Simulate a disk write failure on save() during migration
      persistence.save = () => {
        throw new Error('Simulated ENOSPC: disk write failure during migration save');
      };

      // Loading should throw the simulated persistence error
      assert.throws(
        () => persistence.load(),
        /Simulated ENOSPC: disk write failure during migration save/
      );

      // The original file on disk must remain completely intact version 11 JSON
      const contentAfter = readFileSync(testFilePath, 'utf-8');
      const parsedAfter = JSON.parse(contentAfter);
      assert.equal(parsedAfter.version, 11);
      assert.equal(contentAfter, originalJson);

      // Check that no temporary (.tmp.) files were left dangling in tmpdir
      const files = readdirSync(tmpdir()).filter((f) => f.includes('test-migration-v11-v12') && f.includes('.tmp.'));
      assert.equal(files.length, 0);
    });

    test('malformed v11 state fails validation and aborts migration without saving', () => {
      const persistence = new LocalFilePersistence(testFilePath);
      const corruptedV11 = {
        worldId: 'juarez-el-paso',
        version: 11,
        worldTime: 'corrupted-timestamp', // Invalid timestamp!
        places: seed.places,
        restaurants: seed.restaurants,
        agents: seed.agents,
        offerings: seed.offerings,
        purchases: [],
        coffeeCompletions: [],
        acquaintances: [],
      };

      writeFileSync(testFilePath, JSON.stringify(corruptedV11, null, 2), 'utf-8');

      assert.throws(
        () => persistence.load(),
        /Invalid WorldState: worldTime must be a valid ISO-8601 timestamp/
      );

      // File on disk was NOT modified
      const content = readFileSync(testFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      assert.equal(parsed.worldTime, 'corrupted-timestamp');
    });
  });
});
