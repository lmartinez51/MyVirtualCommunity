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
  WorldStateV14,
  migrateWorldStateV14ToV15,
  validateWorldStateV15,
  WorldStateV11,
  WorldStateV12,
  WorldStateV13,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createDevelopmentSeedWorld } from '../src/core/seed.js';

describe('Milestone 39: Migration v14 -> v15 & Order Authority Invariants', () => {
  const BASE_TIME = '2026-09-14T09:00:00.000Z';

  function createSampleV14State(): WorldStateV14 {
    const clock = WorldClock.create(BASE_TIME);
    const v15 = createInitialWorldState(clock);
    const { orders, ...rest } = v15;
    return {
      ...rest,
      version: 14,
    };
  }

  function createSampleV13State(): WorldStateV13 {
    const v14 = createSampleV14State();
    const { knowledge, ...rest } = v14;
    return {
      ...rest,
      version: 13,
    };
  }

  function createSampleV12State(): WorldStateV12 {
    const v14 = createSampleV14State();
    return {
      worldId: v14.worldId,
      version: 12,
      worldTime: v14.worldTime,
      places: v14.places,
      restaurants: v14.restaurants,
      agents: v14.agents.map((a) => ({
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
      offerings: v14.offerings,
      items: [],
      purchases: [],
      coffeeCompletions: [],
      acquaintances: [],
    };
  }

  function createSampleV11State(): WorldStateV11 {
    const seed = createDevelopmentSeedWorld();
    return {
      worldId: 'juarez-el-paso',
      version: 11,
      worldTime: BASE_TIME,
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      coffeeCompletions: [],
      acquaintances: [],
    };
  }

  describe('1. validateWorldStateV14 Structural Integrity', () => {
    it('accepts a valid WorldStateV14 object', () => {
      const v14 = createSampleV14State();
      assert.doesNotThrow(() => validateWorldStateV14(v14));
    });

    it('rejects state if version is not 14', () => {
      const v14 = createSampleV14State();
      (v14 as any).version = 15;
      assert.throws(() => validateWorldStateV14(v14), /Expected version 14/);
    });

    it('rejects state if knowledge is missing or not an array', () => {
      const v14 = createSampleV14State();
      delete (v14 as any).knowledge;
      assert.throws(() => validateWorldStateV14(v14), /knowledge must be an array/);
    });

    it('rejects state if items is missing or not an array', () => {
      const v14 = createSampleV14State();
      delete (v14 as any).items;
      assert.throws(() => validateWorldStateV14(v14), /items must be an array/);
    });

    it('rejects state if acquaintances is missing or not an array', () => {
      const v14 = createSampleV14State();
      delete (v14 as any).acquaintances;
      assert.throws(() => validateWorldStateV14(v14), /Invalid acquaintances collection/);
    });
  });

  describe('2. validateWorldStateV15 Rejections for v14 Data', () => {
    it('rejects v14 state due to version mismatch', () => {
      const v14 = createSampleV14State();
      assert.throws(() => validateWorldStateV15(v14 as any), /Unsupported WorldState version: 14. Expected version 15/);
    });

    it('rejects state missing orders array', () => {
      const v14 = createSampleV14State();
      const candidate = { ...v14, version: 15 };
      assert.throws(() => validateWorldStateV15(candidate as any), /orders must be an array/);
    });
  });

  describe('3. In-Memory Migration Transform (v14 -> v15)', () => {
    it('migrates valid v14 state to v15, setting orders: [] and preserving all v14 fields', () => {
      const v14 = createSampleV14State();
      v14.activityCompletions.push({
        id: 'activity-completion:1',
        playerId: 'agent:dev-player',
        activity: 'having-coffee',
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
        itemId: null,
        startedAt: '2026-09-14T08:00:00.000Z',
        completedAt: '2026-09-14T08:15:00.000Z',
      });
      v14.acquaintances.push({
        id: 'acquaintance:agent:dev-npc:agent:dev-player',
        agentIds: ['agent:dev-npc', 'agent:dev-player'],
        establishedAt: '2026-09-14T08:00:00.000Z',
      });
      v14.knowledge.push({
        id: 'knowledge:1',
        agentId: 'agent:dev-player',
        factType: 'agent-schedule',
        subjectId: 'agent:dev-npc',
        source: 'social-inquiry',
        sourceAgentId: 'agent:dev-npc',
        acquiredAt: '2026-09-14T08:00:00.000Z',
        lastVerifiedAt: '2026-09-14T08:00:00.000Z',
        payload: {
          workplaceId: 'restaurant:development-restaurant',
          shiftStart: '09:00',
          shiftEnd: '17:00',
        },
      });

      assert.doesNotThrow(() => validateWorldStateV14(v14));

      const v15 = migrateWorldStateV14ToV15(v14);

      assert.equal(v15.version, 15);
      assert.deepEqual(v15.orders, []);
      assert.equal(v15.worldId, v14.worldId);
      assert.equal(v15.worldTime, v14.worldTime);
      assert.deepEqual(v15.places, v14.places);
      assert.deepEqual(v15.restaurants, v14.restaurants);
      assert.deepEqual(v15.agents, v14.agents);
      assert.deepEqual(v15.offerings, v14.offerings);
      assert.deepEqual(v15.purchases, v14.purchases);
      assert.deepEqual(v15.activityCompletions, v14.activityCompletions);
      assert.deepEqual(v15.acquaintances, v14.acquaintances);
      assert.deepEqual(v15.items, v14.items);
      assert.deepEqual(v15.knowledge, v14.knowledge);

      // Verify that the migrated v15 state strictly satisfies validateWorldStateV15
      assert.doesNotThrow(() => validateWorldStateV15(v15));
    });
  });

  describe('4. LocalFilePersistence Automatic Cascading Migration on Load', () => {
    it('automatically migrates a v14 file to v16 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v14-to-v15-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v14 = createSampleV14State();
        writeFileSync(testFile, JSON.stringify(v14, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.deepEqual(loaded.orders, []);
        assert.doesNotThrow(() => validateWorldState(loaded));

        // Verify that the disk file was saved at version 16 by reloading with a fresh persistence instance
        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 19);
        assert.deepEqual(reloaded.orders, []);
        assert.doesNotThrow(() => validateWorldState(reloaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('cascades migration from v13 to v16 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v13-to-v15-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v13 = createSampleV13State();
        assert.doesNotThrow(() => validateWorldStateV13(v13));
        writeFileSync(testFile, JSON.stringify(v13, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.deepEqual(loaded.orders, []);
        assert.deepEqual(loaded.knowledge, []);
        assert.doesNotThrow(() => validateWorldState(loaded));

        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 19);
        assert.deepEqual(reloaded.orders, []);
        assert.deepEqual(reloaded.knowledge, []);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('cascades migration from v12 to v16 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v12-to-v15-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v12 = createSampleV12State();
        assert.doesNotThrow(() => validateWorldStateV12(v12));
        writeFileSync(testFile, JSON.stringify(v12, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.deepEqual(loaded.orders, []);
        assert.deepEqual(loaded.knowledge, []);
        assert.doesNotThrow(() => validateWorldState(loaded));

        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 19);
        assert.deepEqual(reloaded.orders, []);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('cascades migration from v11 to v16 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v11-to-v15-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v11 = createSampleV11State();
        assert.doesNotThrow(() => validateWorldStateV11(v11));
        writeFileSync(testFile, JSON.stringify(v11, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.deepEqual(loaded.orders, []);
        assert.deepEqual(loaded.knowledge, []);
        assert.doesNotThrow(() => validateWorldState(loaded));

        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 19);
        assert.deepEqual(reloaded.orders, []);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });
});
