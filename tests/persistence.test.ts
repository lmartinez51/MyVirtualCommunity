import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { WorldState } from '../src/core/world-state.js';
import { createDevelopmentSeedWorld } from '../src/core/seed.js';

describe('LocalFilePersistence', () => {
  const testFilePath = join(tmpdir(), `test-world-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  let persistence: LocalFilePersistence;
  const seed = createDevelopmentSeedWorld();

  beforeEach(() => {
    persistence = new LocalFilePersistence(testFilePath);
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  test('returns null when persistence file does not exist', () => {
    assert.equal(persistence.exists(), false);
    const result = persistence.load();
    assert.equal(result, null);
  });

  test('saves and loads valid version 13 WorldState', () => {
    const state: WorldState = {
      worldId: 'juarez-el-paso',
      version: 13,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
    };

    persistence.save(state);
    assert.equal(persistence.exists(), true);

    const loaded = persistence.load();
    assert.deepEqual(loaded, state);
  });

  test('fails explicitly when file contains version 1 state (incompatible schema)', () => {
    const v1State = {
      worldId: 'juarez-el-paso',
      version: 1,
      worldTime: '2026-09-14T08:00:00.000Z',
    };

    writeFileSync(testFilePath, JSON.stringify(v1State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 1\. Expected version 13/
    );
  });

  test('fails explicitly when file contains version 2 state (incompatible schema)', () => {
    const v2State = {
      worldId: 'juarez-el-paso',
      version: 2,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        buildingId: r.buildingId,
      })),
      agents: seed.agents.map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        agentType: a.agentType,
      })),
    };

    writeFileSync(testFilePath, JSON.stringify(v2State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 2\. Expected version 13/
    );
  });

  test('fails explicitly when file contains version 3 state (incompatible schema)', () => {
    const v3State = {
      worldId: 'juarez-el-paso',
      version: 3,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        buildingId: r.buildingId,
      })),
      agents: seed.agents.map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        agentType: a.agentType,
        activityState: a.activityState,
        activitySince: a.activitySince,
      })),
    };

    writeFileSync(testFilePath, JSON.stringify(v3State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 3\. Expected version 13/
    );
  });

  test('fails explicitly when file contains version 4 state (incompatible schema)', () => {
    const v4State = {
      worldId: 'juarez-el-paso',
      version: 4,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        buildingId: r.buildingId,
      })),
      agents: seed.agents,
    };

    writeFileSync(testFilePath, JSON.stringify(v4State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 4\. Expected version 13/
    );
  });

  test('fails explicitly when file contains version 5 state (incompatible schema)', () => {
    const v5State = {
      worldId: 'juarez-el-paso',
      version: 5,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
    };

    writeFileSync(testFilePath, JSON.stringify(v5State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 5\. Expected version 13/
    );
  });

  test('fails explicitly when file contains version 6 state (incompatible schema)', () => {
    const v6State = {
      worldId: 'juarez-el-paso',
      version: 6,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
    };

    writeFileSync(testFilePath, JSON.stringify(v6State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 6\. Expected version 13/
    );
  });

  test('fails explicitly when file contains version 7 state (incompatible schema)', () => {
    const v7State = {
      worldId: 'juarez-el-paso',
      version: 7,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
    };

    writeFileSync(testFilePath, JSON.stringify(v7State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 7\. Expected version 13/
    );
  });

  test('fails explicitly when file contains version 8 state (incompatible schema)', () => {
    const v8State = {
      worldId: 'juarez-el-paso',
      version: 8,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
    };

    writeFileSync(testFilePath, JSON.stringify(v8State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 8\. Expected version 13/
    );
  });

  test('fails explicitly when file contains version 9 state (incompatible schema)', () => {
    const v9State = {
      worldId: 'juarez-el-paso',
      version: 9,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
    };

    writeFileSync(testFilePath, JSON.stringify(v9State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 9\. Expected version 13/
    );
  });

  test('fails explicitly when file contains version 10 state (incompatible schema)', () => {
    const seed = createDevelopmentSeedWorld();
    const v10State = {
      worldId: 'juarez-el-paso',
      version: 10,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      coffeeCompletions: [],
    };

    writeFileSync(testFilePath, JSON.stringify(v10State), 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Unsupported WorldState version: 10\. Expected version 13/
    );
  });

  test('fails explicitly when file contains malformed JSON', () => {
    writeFileSync(testFilePath, '{ worldId: incomplete-json ...', 'utf-8');

    assert.throws(
      () => persistence.load(),
      /Failed to parse JSON in persisted world state/
    );
  });

  test('fails explicitly when file contains valid JSON but violates WorldState schema', () => {
    writeFileSync(
      testFilePath,
      JSON.stringify({ worldId: '', version: -5, worldTime: 'corrupted-timestamp' }),
      'utf-8'
    );

    assert.throws(
      () => persistence.load(),
      /Invalid WorldState/
    );
  });

  test('fails explicitly when saving invalid state', () => {
    const invalidState = {
      worldId: 'test',
      version: 0,
      worldTime: '2026-09-14T08:00:00.000Z',
    } as unknown as WorldState;

    assert.throws(
      () => persistence.save(invalidState),
      /Invalid WorldState: worldId must be "juarez-el-paso"/
    );

    assert.equal(persistence.exists(), false);
  });

  test('clear() removes the persistence file cleanly', () => {
    const state: WorldState = {
      worldId: 'juarez-el-paso',
      version: 13,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
    };

    persistence.save(state);
    assert.equal(persistence.exists(), true);

    persistence.clear();
    assert.equal(persistence.exists(), false);
    assert.equal(persistence.load(), null);
  });
});
