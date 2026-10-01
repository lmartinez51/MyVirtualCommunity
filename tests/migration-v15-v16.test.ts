import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  validateWorldStateV11,
  validateWorldStateV12,
  validateWorldStateV13,
  validateWorldStateV14,
  validateWorldStateV15,
  validateWorldStateV16,
  WorldStateV11,
  WorldStateV12,
  WorldStateV13,
  WorldStateV14,
  WorldStateV15,
  migrateWorldStateV15ToV16,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createDevelopmentSeedWorld } from '../src/core/seed.js';

describe('Milestone 46: Migration v15 -> v16 & Knowledge Source Expansion', () => {
  const BASE_TIME = '2026-09-14T09:00:00.000Z';

  function createSampleV15State(): WorldStateV15 {
    const seed = createDevelopmentSeedWorld(BASE_TIME);
    return {
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
      knowledge: [
        {
          id: 'knowledge:1',
          agentId: 'agent:dev-player',
          factType: 'agent-schedule',
          subjectId: 'agent:dev-npc',
          payload: {
            workplaceId: 'restaurant:development-restaurant',
            shiftStart: '09:00',
            shiftEnd: '17:00',
          },
          acquiredAt: BASE_TIME,
          lastVerifiedAt: BASE_TIME,
          source: 'social-inquiry',
          sourceAgentId: 'agent:dev-npc',
        },
      ],
      orders: [],
    };
  }

  describe('1. validateWorldStateV15 Structural Integrity', () => {
    it('accepts a valid WorldStateV15 object', () => {
      const v15 = createSampleV15State();
      assert.doesNotThrow(() => validateWorldStateV15(v15));
    });

    it('rejects state if version is not 15', () => {
      const v15 = createSampleV15State();
      assert.throws(
        () => validateWorldStateV15({ ...v15, version: 16 } as any),
        /Unsupported WorldState version: 16. Expected version 15/
      );
    });

    it('rejects state if knowledge contains npc-initiative in v15', () => {
      const v15 = createSampleV15State();
      const corruptedKnowledge = [
        {
          ...v15.knowledge[0],
          source: 'npc-initiative',
        },
      ];
      assert.throws(
        () => validateWorldStateV15({ ...v15, knowledge: corruptedKnowledge } as any),
        /source must be "social-inquiry"/
      );
    });

    it('rejects state if orders is missing or not an array', () => {
      const v15 = createSampleV15State();
      const { orders, ...missingOrders } = v15;
      assert.throws(
        () => validateWorldStateV15(missingOrders as any),
        /orders must be an array/
      );
    });
  });

  describe('2. validateWorldState (Schema v17) Rejections for v15 Data', () => {
    it('rejects v15 state due to version mismatch', () => {
      const v15 = createSampleV15State();
      assert.throws(
        () => validateWorldState(v15 as any),
        /Unsupported WorldState version: 15. Expected version 18/
      );
    });
  });

  describe('3. In-Memory Migration Transform (v15 -> v16)', () => {
    it('migrates valid v15 state to v16, preserving all fields and setting version: 16', () => {
      const v15 = createSampleV15State();
      assert.doesNotThrow(() => validateWorldStateV15(v15));

      const v16 = migrateWorldStateV15ToV16(v15);

      assert.equal(v16.version, 16);
      assert.equal(v16.worldId, v15.worldId);
      assert.equal(v16.worldTime, v15.worldTime);
      assert.deepEqual(v16.places, v15.places);
      assert.deepEqual(v16.restaurants, v15.restaurants);
      assert.deepEqual(v16.agents, v15.agents);
      assert.deepEqual(v16.offerings, v15.offerings);
      assert.deepEqual(v16.purchases, v15.purchases);
      assert.deepEqual(v16.activityCompletions, v15.activityCompletions);
      assert.deepEqual(v16.acquaintances, v15.acquaintances);
      assert.deepEqual(v16.items, v15.items);
      assert.deepEqual(v16.knowledge, v15.knowledge);
      assert.deepEqual(v16.orders, v15.orders);

      // Verify that the migrated v16 state satisfies validateWorldStateV16
      assert.doesNotThrow(() => validateWorldStateV16(v16));
    });

    it('migrated v16 state supports knowledge records with source npc-initiative', () => {
      const v15 = createSampleV15State();
      const v16 = migrateWorldStateV15ToV16(v15);

      // Replace knowledge record source with npc-initiative
      v16.knowledge = [
        {
          ...v16.knowledge[0],
          source: 'npc-initiative',
        },
      ];

      assert.doesNotThrow(() => validateWorldStateV16(v16));
    });
  });

  describe('4. LocalFilePersistence Automatic Cascading Migration on Load', () => {
    it('automatically migrates a v15 file to v17 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v15-to-v16-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v15 = createSampleV15State();
        writeFileSync(testFile, JSON.stringify(v15, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 18);
        assert.equal(loaded.knowledge.length, 1);
        assert.equal(loaded.knowledge[0].source, 'social-inquiry');
        assert.doesNotThrow(() => validateWorldState(loaded));

        // Verify that the disk file was saved at version 18 by reloading
        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 18);
        assert.equal(reloaded.knowledge.length, 1);
        assert.doesNotThrow(() => validateWorldState(reloaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('cascades migration from v14 to v18 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v14-to-v16-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const seed = createDevelopmentSeedWorld(BASE_TIME);
        const v14: WorldStateV14 = {
          worldId: 'juarez-el-paso',
          version: 14,
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
        };
        assert.doesNotThrow(() => validateWorldStateV14(v14));
        writeFileSync(testFile, JSON.stringify(v14, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 18);
        assert.deepEqual(loaded.orders, []);
        assert.doesNotThrow(() => validateWorldState(loaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('loads an already-V18 file directly without migration', () => {
      const testFile = join(tmpdir(), `test-v16-direct-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const clock = WorldClock.create(BASE_TIME);
        const v18 = createInitialWorldState(clock);
        writeFileSync(testFile, JSON.stringify(v18, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 18);
        assert.doesNotThrow(() => validateWorldState(loaded));
        assert.deepEqual(loaded, v18);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('rejects unsupported schema versions on load', () => {
      const testFile = join(tmpdir(), `test-unsupported-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const futureVersion = {
          worldId: 'juarez-el-paso',
          version: 99,
          worldTime: BASE_TIME,
        };
        writeFileSync(testFile, JSON.stringify(futureVersion), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        assert.throws(
          () => persistence.load(),
          /Unsupported WorldState version: 99\. Expected version 18/
        );
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });
});
