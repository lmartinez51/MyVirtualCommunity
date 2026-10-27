import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  validateWorldStateV15,
  validateWorldStateV16,
  validateWorldStateV17,
  WorldStateV15,
  WorldStateV16,
  migrateWorldStateV16ToV17,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createDevelopmentSeedWorld, createRealWorldJuarezSeedWorld } from '../src/core/seed.js';

describe('Milestone 56: Migration v16 -> v17 & Property Foundation', () => {
  const BASE_TIME = '2026-09-14T09:00:00.000Z';

  function createSampleV16DevelopmentState(): WorldStateV16 {
    const seed = createDevelopmentSeedWorld(BASE_TIME);
    return {
      worldId: 'juarez-el-paso',
      version: 16,
      worldTime: BASE_TIME,
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
      knowledge: [],
      orders: [],
    };
  }

  function createSampleV16RealWorldState(): WorldStateV16 {
    const seed = createRealWorldJuarezSeedWorld(BASE_TIME);
    return {
      worldId: 'juarez-el-paso',
      version: 16,
      worldTime: BASE_TIME,
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
      knowledge: [],
      orders: [],
    };
  }

  describe('1. validateWorldStateV16 Structural Integrity', () => {
    it('accepts a valid WorldStateV16 development state', () => {
      const v16 = createSampleV16DevelopmentState();
      assert.doesNotThrow(() => validateWorldStateV16(v16));
    });

    it('accepts a valid WorldStateV16 real-world state', () => {
      const v16 = createSampleV16RealWorldState();
      assert.doesNotThrow(() => validateWorldStateV16(v16));
    });

    it('rejects state if version is not 16', () => {
      const v16 = createSampleV16DevelopmentState();
      assert.throws(
        () => validateWorldStateV16({ ...v16, version: 17 } as any),
        /Unsupported WorldState version: 17\. Expected version 16/
      );
    });

    it('rejects state if properties collection is present on v16 state', () => {
      const v16 = createSampleV16DevelopmentState();
      assert.throws(
        () => validateWorldStateV16({ ...v16, properties: [] } as any),
        /properties collection must not exist in version 16 schema/
      );
    });

    it('rejects state if orders is missing or not an array', () => {
      const v16 = createSampleV16DevelopmentState();
      const { orders, ...missingOrders } = v16;
      assert.throws(
        () => validateWorldStateV16(missingOrders as any),
        /orders must be an array/
      );
    });
  });

  describe('2. validateWorldState (Schema v17) Rejections for v16 Data', () => {
    it('rejects v16 state due to version mismatch', () => {
      const v16 = createSampleV16DevelopmentState();
      assert.throws(
        () => validateWorldStateV17(v16 as any),
        /Unsupported WorldState version: 16\. Expected version 17/
      );
    });
  });

  describe('3. In-Memory Migration Transform (v16 -> v17)', () => {
    it('migrates development v16 state to v17, creating 3 unassigned properties', () => {
      const v16 = createSampleV16DevelopmentState();
      assert.doesNotThrow(() => validateWorldStateV16(v16));

      const v17 = migrateWorldStateV16ToV17(v16);

      assert.equal(v17.version, 17);
      assert.equal(v17.worldId, v16.worldId);
      assert.equal(v17.worldTime, v16.worldTime);
      assert.deepEqual(v17.places, v16.places);
      assert.deepEqual(v17.restaurants, v16.restaurants);
      assert.deepEqual(v17.agents, v16.agents);
      assert.deepEqual(v17.offerings, v16.offerings);
      assert.deepEqual(v17.purchases, v16.purchases);
      assert.deepEqual(v17.activityCompletions, v16.activityCompletions);
      assert.deepEqual(v17.acquaintances, v16.acquaintances);
      assert.deepEqual(v17.items, v16.items);
      assert.deepEqual(v17.knowledge, v16.knowledge);
      assert.deepEqual(v17.orders, v16.orders);

      // Verify properties created for development world
      assert.equal(v17.properties.length, 3);
      const propResidence = v17.properties.find((p) => p.id === 'property:development-residence');
      const propBuilding = v17.properties.find((p) => p.id === 'property:development-building');
      const propKiosk = v17.properties.find((p) => p.id === 'property:avenida-juarez-kiosk');

      assert.ok(propResidence);
      assert.equal(propResidence.buildingId, 'building:development-residence');
      assert.equal(propResidence.propertyType, 'residence');
      assert.equal(propResidence.assignment.status, 'unassigned');
      assert.equal(propResidence.assignment.holder, undefined);
      assert.equal(propResidence.assignment.assignedAt, undefined);

      assert.ok(propBuilding);
      assert.equal(propBuilding.buildingId, 'building:development-building');
      assert.equal(propBuilding.propertyType, 'commercial');
      assert.equal(propBuilding.assignment.status, 'unassigned');

      assert.ok(propKiosk);
      assert.equal(propKiosk.buildingId, 'building:avenida-juarez-kiosk');
      assert.equal(propKiosk.propertyType, 'commercial');
      assert.equal(propKiosk.assignment.status, 'unassigned');

      // Verify full v17 validation succeeds
      assert.doesNotThrow(() => validateWorldStateV17(v17));
    });

    it('migrates real-world v16 state to v17, creating 2 unassigned properties', () => {
      const v16 = createSampleV16RealWorldState();
      assert.doesNotThrow(() => validateWorldStateV16(v16));

      const v17 = migrateWorldStateV16ToV17(v16);

      assert.equal(v17.version, 17);
      assert.equal(v17.properties.length, 2);

      const propResidence = v17.properties.find((p) => p.id === 'property:real-world-residence');
      const propKentucky = v17.properties.find((p) => p.id === 'property:kentucky-club-building');

      assert.ok(propResidence);
      assert.equal(propResidence.buildingId, 'building:real-world-residence');
      assert.equal(propResidence.propertyType, 'residence');
      assert.equal(propResidence.assignment.status, 'unassigned');

      assert.ok(propKentucky);
      assert.equal(propKentucky.buildingId, 'building:kentucky-club-building');
      assert.equal(propKentucky.propertyType, 'commercial');
      assert.equal(propKentucky.assignment.status, 'unassigned');

      // Verify full v17 validation succeeds
      assert.doesNotThrow(() => validateWorldStateV17(v17));
    });
  });

  describe('4. LocalFilePersistence Automatic Cascading Migration on Load', () => {
    it('automatically migrates a v16 file to v18 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v16-to-v17-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v16 = createSampleV16DevelopmentState();
        writeFileSync(testFile, JSON.stringify(v16, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.equal(loaded.properties.length, 3);
        assert.doesNotThrow(() => validateWorldState(loaded));

        // Verify that the disk file was saved at version 18 by reloading
        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 19);
        assert.equal(reloaded.properties.length, 3);
        assert.doesNotThrow(() => validateWorldState(reloaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('cascades migration from v15 to v18 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v15-to-v17-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const seed = createDevelopmentSeedWorld(BASE_TIME);
        const v15: WorldStateV15 = {
          worldId: 'juarez-el-paso',
          version: 15,
          worldTime: BASE_TIME,
          places: seed.places,
          restaurants: seed.restaurants,
          agents: seed.agents,
          offerings: seed.offerings,
          purchases: [],
          activityCompletions: [],
          acquaintances: [],
          items: [],
          knowledge: [],
          orders: [],
        };
        assert.doesNotThrow(() => validateWorldStateV15(v15));
        writeFileSync(testFile, JSON.stringify(v15, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.equal(loaded.properties.length, 3);
        assert.doesNotThrow(() => validateWorldState(loaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('loads an already-V18 file directly without migration', () => {
      const testFile = join(tmpdir(), `test-v17-direct-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const clock = WorldClock.create(BASE_TIME);
        const v18 = createInitialWorldState(clock);
        writeFileSync(testFile, JSON.stringify(v18, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.doesNotThrow(() => validateWorldState(loaded));
        assert.deepEqual(loaded, v18);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });
});
