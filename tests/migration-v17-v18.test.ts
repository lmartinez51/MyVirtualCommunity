import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  validateWorldStateV16,
  validateWorldStateV17,
  validateWorldStateV18,
  WorldStateV16,
  WorldStateV17,
  migrateWorldStateV16ToV17,
  migrateWorldStateV17ToV18,
  getSiteResident,
  getSiteAttendant,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createDevelopmentSeedWorld, createRealWorldJuarezSeedWorld } from '../src/core/seed.js';

describe('Milestone 57: Migration v17 -> v18 & Site Agent Association Foundation', () => {
  const BASE_TIME = '2026-09-14T09:00:00.000Z';

  function createSampleV17DevelopmentState(): WorldStateV17 {
    const seed = createDevelopmentSeedWorld(BASE_TIME);
    return {
      worldId: 'juarez-el-paso',
      version: 17,
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
      properties: seed.properties,
    };
  }

  function createSampleV17RealWorldState(): WorldStateV17 {
    const seed = createRealWorldJuarezSeedWorld(BASE_TIME);
    return {
      worldId: 'juarez-el-paso',
      version: 17,
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
      properties: seed.properties,
    };
  }

  describe('1. validateWorldStateV17 Structural Integrity', () => {
    it('accepts a valid WorldStateV17 development state', () => {
      const v17 = createSampleV17DevelopmentState();
      assert.doesNotThrow(() => validateWorldStateV17(v17));
    });

    it('accepts a valid WorldStateV17 real-world state', () => {
      const v17 = createSampleV17RealWorldState();
      assert.doesNotThrow(() => validateWorldStateV17(v17));
    });

    it('rejects state if version is not 17', () => {
      const v17 = createSampleV17DevelopmentState();
      assert.throws(
        () => validateWorldStateV17({ ...v17, version: 18 } as any),
        /Unsupported WorldState version: 18\. Expected version 17/
      );
    });

    it('rejects state if siteAgentAssociations collection is present on v17 state', () => {
      const v17 = createSampleV17DevelopmentState();
      assert.throws(
        () => validateWorldStateV17({ ...v17, siteAgentAssociations: [] } as any),
        /siteAgentAssociations collection must not exist in version 17 schema/
      );
    });

    it('rejects state if properties is missing or not an array', () => {
      const v17 = createSampleV17DevelopmentState();
      const { properties, ...missingProperties } = v17;
      assert.throws(
        () => validateWorldStateV17(missingProperties as any),
        /properties must be an array/
      );
    });
  });

  describe('2. validateWorldState (Schema v18) Rejections for v17 Data', () => {
    it('rejects v17 state due to version mismatch', () => {
      const v17 = createSampleV17DevelopmentState();
      assert.throws(
        () => validateWorldState(v17 as any),
        /Unsupported WorldState version: 17\. Expected version 19/
      );
    });
  });

  describe('3. In-Memory Migration Transform (v17 -> v18)', () => {
    it('migrates development v17 state to v18 without inventing associations (siteAgentAssociations: [])', () => {
      const v17 = createSampleV17DevelopmentState();
      assert.doesNotThrow(() => validateWorldStateV17(v17));

      const v18 = migrateWorldStateV17ToV18(v17);

      assert.equal(v18.version, 18);
      assert.equal(v18.worldId, v17.worldId);
      assert.equal(v18.worldTime, v17.worldTime);
      assert.deepEqual(v18.places, v17.places);
      assert.deepEqual(v18.restaurants, v17.restaurants);
      assert.deepEqual(v18.agents, v17.agents);
      assert.deepEqual(v18.offerings, v17.offerings);
      assert.deepEqual(v18.purchases, v17.purchases);
      assert.deepEqual(v18.activityCompletions, v17.activityCompletions);
      assert.deepEqual(v18.acquaintances, v17.acquaintances);
      assert.deepEqual(v18.items, v17.items);
      assert.deepEqual(v18.knowledge, v17.knowledge);
      assert.deepEqual(v18.orders, v17.orders);
      assert.deepEqual(v18.properties, v17.properties);

      // Verify Migration Policy Option B: empty array, NO invented associations
      assert.deepEqual(v18.siteAgentAssociations, []);
      assert.equal(getSiteResident(v18, 'building:development-residence'), undefined);
      assert.equal(getSiteAttendant(v18, 'restaurant:development-restaurant'), undefined);

      // Verify full v18 validation succeeds on migrated world with siteAgentAssociations: []
      assert.doesNotThrow(() => validateWorldStateV18(v18));
    });

    it('migrates real-world v17 state to v18 without inventing associations (siteAgentAssociations: [])', () => {
      const v17 = createSampleV17RealWorldState();
      assert.doesNotThrow(() => validateWorldStateV17(v17));

      const v18 = migrateWorldStateV17ToV18(v17);

      assert.equal(v18.version, 18);
      assert.deepEqual(v18.siteAgentAssociations, []);
      assert.equal(getSiteResident(v18, 'building:real-world-residence'), undefined);
      assert.equal(getSiteAttendant(v18, 'restaurant:kentucky-club'), undefined);

      // Verify full v18 validation succeeds on migrated world with siteAgentAssociations: []
      assert.doesNotThrow(() => validateWorldStateV18(v18));
    });

    it('migration does NOT invent relationships from entity existence alone', () => {
      const v17 = createSampleV17DevelopmentState();
      // dev-npc is currently located at building:development-residence in v17
      const devNpc = v17.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(devNpc.locationId, 'building:development-residence');

      const v18 = migrateWorldStateV17ToV18(v17);

      // Even though building:development-residence and agent:dev-npc both exist,
      // and devNpc is at the residence, migration MUST NOT fabricate a resident association
      assert.equal(getSiteResident(v18, 'building:development-residence'), undefined);
      assert.equal(getSiteAttendant(v18, 'restaurant:development-restaurant'), undefined);
      assert.deepEqual(v18.siteAgentAssociations, []);
    });

    it('seeds explicitly configure associations while migration produces empty associations', () => {
      const seed = createDevelopmentSeedWorld(BASE_TIME);
      assert.equal(seed.siteAgentAssociations.length, 2);

      const v17 = createSampleV17DevelopmentState();
      const migrated = migrateWorldStateV17ToV18(v17);
      assert.equal(migrated.siteAgentAssociations.length, 0);
    });
  });

  describe('4. LocalFilePersistence Automatic Cascading Migration on Load', () => {
    it('automatically migrates a v17 file to v18 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v17-to-v18-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v17 = createSampleV17DevelopmentState();
        writeFileSync(testFile, JSON.stringify(v17, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.equal(loaded.siteAgentAssociations.length, 0);
        assert.doesNotThrow(() => validateWorldState(loaded));

        // Verify that the disk file was saved at version 18 by reloading
        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 19);
        assert.equal(reloaded.siteAgentAssociations.length, 0);
        assert.doesNotThrow(() => validateWorldState(reloaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('cascades migration from v16 to v18 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v16-to-v18-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const seed = createDevelopmentSeedWorld(BASE_TIME);
        const v16: WorldStateV16 = {
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
        assert.doesNotThrow(() => validateWorldStateV16(v16));
        writeFileSync(testFile, JSON.stringify(v16, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.equal(loaded.properties.length, 3);
        assert.equal(loaded.siteAgentAssociations.length, 0);
        assert.doesNotThrow(() => validateWorldState(loaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('loads an already-V18 file directly without migration', () => {
      const testFile = join(tmpdir(), `test-v18-direct-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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
