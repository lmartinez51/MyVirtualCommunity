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
  migrateWorldStateV11ToV12,
  migrateWorldStateV12ToV13,
  migrateWorldStateV13ToV14,
  WorldStateV11,
  WorldStateV12,
  WorldStateV13,
  inquireAgentSchedule,
  inspectPlayerKnowledge,
  introduceToAgent,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createDevelopmentSeedWorld } from '../src/core/seed.js';

describe('Milestone 35: Migration v13 -> v14 & Epistemic Retention Invariants', () => {
  const BASE_TIME = '2026-09-14T09:00:00.000Z';

  function createSampleV13State(): WorldStateV13 {
    const clock = WorldClock.create(BASE_TIME);
    const v14 = createInitialWorldState(clock);
    const { knowledge, ...rest } = v14;
    return {
      ...rest,
      version: 13,
    };
  }

  function createSampleV12State(): WorldStateV12 {
    const clock = WorldClock.create(BASE_TIME);
    const v14 = createInitialWorldState(clock);
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

  describe('1. validateWorldStateV13 Structural Integrity', () => {
    it('accepts a valid WorldStateV13 object', () => {
      const v13 = createSampleV13State();
      assert.doesNotThrow(() => validateWorldStateV13(v13));
    });

    it('rejects state if version is not 13', () => {
      const v13 = createSampleV13State();
      (v13 as any).version = 14;
      assert.throws(() => validateWorldStateV13(v13), /Expected version 13/);
    });

    it('rejects state if activityCompletions is missing or not an array', () => {
      const v13 = createSampleV13State();
      delete (v13 as any).activityCompletions;
      assert.throws(() => validateWorldStateV13(v13), /activityCompletions must be an array/);
    });

    it('rejects state if items is missing or not an array', () => {
      const v13 = createSampleV13State();
      delete (v13 as any).items;
      assert.throws(() => validateWorldStateV13(v13), /items must be an array/);
    });

    it('rejects state if acquaintances is missing or not an array', () => {
      const v13 = createSampleV13State();
      delete (v13 as any).acquaintances;
      assert.throws(() => validateWorldStateV13(v13), /acquaintances must be an array/);
    });
  });

  describe('2. validateWorldStateV14 (Schema v14) Rejections', () => {
    it('rejects v13 state due to version mismatch', () => {
      const v13 = createSampleV13State();
      assert.throws(() => validateWorldStateV14(v13), /Unsupported WorldState version: 13. Expected version 14/);
    });

    it('rejects state missing knowledge array', () => {
      const v13 = createSampleV13State();
      const candidate = { ...v13, version: 14 };
      assert.throws(() => validateWorldStateV14(candidate), /knowledge must be an array/);
    });
  });

  describe('3. In-Memory Migration Transform (v13 -> v14)', () => {
    it('migrates valid v13 state to v14, setting knowledge: [] and preserving all v13 fields', () => {
      const v13 = createSampleV13State();
      // Add a dummy activity completion and acquaintance to verify data preservation
      v13.activityCompletions.push({
        id: 'activity-completion:1',
        playerId: 'agent:dev-player',
        activity: 'having-coffee',
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
        itemId: null,
        startedAt: '2026-09-14T08:00:00.000Z',
        completedAt: '2026-09-14T08:15:00.000Z',
      });
      v13.acquaintances.push({
        id: 'acquaintance:agent:dev-npc:agent:dev-player',
        agentIds: ['agent:dev-npc', 'agent:dev-player'],
        establishedAt: '2026-09-14T08:00:00.000Z',
      });

      assert.doesNotThrow(() => validateWorldStateV13(v13));

      const v14 = migrateWorldStateV13ToV14(v13);

      assert.equal(v14.version, 14);
      assert.deepEqual(v14.knowledge, []);
      assert.equal(v14.worldId, v13.worldId);
      assert.equal(v14.worldTime, v13.worldTime);
      assert.deepEqual(v14.places, v13.places);
      assert.deepEqual(v14.restaurants, v13.restaurants);
      assert.deepEqual(v14.agents, v13.agents);
      assert.deepEqual(v14.offerings, v13.offerings);
      assert.deepEqual(v14.purchases, v13.purchases);
      assert.deepEqual(v14.activityCompletions, v13.activityCompletions);
      assert.deepEqual(v14.acquaintances, v13.acquaintances);
      assert.deepEqual(v14.items, v13.items);

      // Verify that the migrated v14 state strictly satisfies validateWorldState
      assert.doesNotThrow(() => validateWorldStateV14(v14));
    });
  });

  describe('4. LocalFilePersistence Automatic Migration on Load', () => {
    it('automatically migrates a v13 file to v14 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v13-to-v14-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v13 = createSampleV13State();
        writeFileSync(testFile, JSON.stringify(v13, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 18);
        assert.deepEqual(loaded.knowledge, []);
        assert.doesNotThrow(() => validateWorldState(loaded));

        // Verify that the disk file was saved at version 14 by reloading with a fresh persistence instance
        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 18);
        assert.deepEqual(reloaded.knowledge, []);
        assert.doesNotThrow(() => validateWorldState(reloaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('cascades migration from v12 to v14 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v12-to-v14-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v12 = createSampleV12State();
        assert.doesNotThrow(() => validateWorldStateV12(v12));
        writeFileSync(testFile, JSON.stringify(v12, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 18);
        assert.deepEqual(loaded.knowledge, []);
        assert.doesNotThrow(() => validateWorldState(loaded));

        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 18);
        assert.deepEqual(reloaded.knowledge, []);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('cascades migration from v11 to v14 on load and persists to disk', () => {
      const testFile = join(tmpdir(), `test-v11-to-v14-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v11 = createSampleV11State();
        assert.doesNotThrow(() => validateWorldStateV11(v11));
        writeFileSync(testFile, JSON.stringify(v11, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const loaded = persistence.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 18);
        assert.deepEqual(loaded.knowledge, []);
        assert.doesNotThrow(() => validateWorldState(loaded));

        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 18);
        assert.deepEqual(reloaded.knowledge, []);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });

  describe('5. Runtime Continuity & Knowledge Acquisition Post-Migration', () => {
    it('allows knowledge acquisition on migrated state and persists knowledge to disk', () => {
      const testFile = join(tmpdir(), `test-v13-runtime-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const v13 = createSampleV13State();
        writeFileSync(testFile, JSON.stringify(v13, null, 2), 'utf-8');

        const persistence = new LocalFilePersistence(testFile);
        const state = persistence.load();
        assert.ok(state);
        assert.equal(state.version, 18);
        assert.equal(state.knowledge.length, 0);

        // Co-locate and introduce player and NPC at building
        const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
        const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
        npc.locationId = player.locationId;
        introduceToAgent(state, 'agent:dev-player', 'agent:dev-npc');

        // Perform inquiry
        const inquiryResult = inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');
        assert.strictEqual(inquiryResult.success, true);
        assert.strictEqual(state.knowledge.length, 1);

        // Inspect knowledge
        const inspectResult = inspectPlayerKnowledge(state, 'agent:dev-player');
        assert.strictEqual(inspectResult.success, true);
        assert.strictEqual(inspectResult.knowledge?.length, 1);
        assert.strictEqual(inspectResult.knowledge![0].factType, 'agent-schedule');

        // Save migrated state with newly acquired knowledge
        persistence.save(state);

        // Reload in fresh persistence instance and verify knowledge persisted
        const persistence2 = new LocalFilePersistence(testFile);
        const reloaded = persistence2.load();
        assert.ok(reloaded);
        assert.equal(reloaded.version, 18);
        assert.equal(reloaded.knowledge.length, 1);
        assert.strictEqual(reloaded.knowledge[0].id, state.knowledge[0].id);
        assert.strictEqual(reloaded.knowledge[0].agentId, 'agent:dev-player');
        assert.strictEqual(reloaded.knowledge[0].subjectId, 'agent:dev-npc');
        assert.doesNotThrow(() => validateWorldState(reloaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });
});
