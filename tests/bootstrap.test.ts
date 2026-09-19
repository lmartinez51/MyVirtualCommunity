import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { bootstrapWorld } from '../src/core/bootstrap.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { createDevelopmentSeedWorld } from '../src/core/seed.js';
import { evaluateDevelopmentRestaurantOperationalRule } from '../src/core/entities/restaurant.js';

describe('bootstrapWorld', () => {
  const testFilePath = join(
    tmpdir(),
    `bootstrap-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  test('bootstraps a new world with seed entities when persistence file is missing', () => {
    const result = bootstrapWorld({ persistencePath: testFilePath, silent: true });

    assert.equal(result.status, 'READY');
    assert.equal(result.ready, true);
    assert.equal(result.isNewWorld, true);
    assert.equal(result.state.worldId, 'juarez-el-paso');
    assert.equal(result.state.version, 14);
    assert.equal(result.clock.getTime(), result.state.worldTime);
    assert.equal(result.state.places.length, 8);
    assert.equal(result.state.restaurants.length, 1);
    assert.equal(
      result.state.restaurants[0].operationalState,
      evaluateDevelopmentRestaurantOperationalRule(result.clock.getTime())
    );
    assert.equal(result.state.restaurants[0].operationalSince, result.state.worldTime);
    assert.equal(result.state.restaurants[0].balanceMinor, 0);
    assert.equal(result.state.restaurants[0].currency, 'USD');
    assert.equal(result.state.agents.length, 2);
    assert.equal(result.state.agents[0].locationId, 'building:development-building');
    assert.equal(result.state.agents[0].balanceMinor, 2000);
    assert.equal(result.state.agents[0].currency, 'USD');
    assert.equal(result.state.agents[1].locationId, 'building:development-residence');
    assert.equal(result.state.agents[1].balanceMinor, 0);
    assert.equal(result.state.agents[1].currency, 'USD');
    assert.equal(result.state.offerings.length, 1);
    assert.equal(result.state.offerings[0].id, 'offering:development-coffee');
    assert.equal(result.state.purchases.length, 0);
    assert.equal(result.state.activityCompletions.length, 0);
    assert.equal(result.state.acquaintances.length, 0);
    assert.equal(result.state.items.length, 0);
    assert.equal(result.state.knowledge.length, 0);

    // Verify it was saved to the target file
    const persistence = new LocalFilePersistence(testFilePath);
    assert.equal(persistence.exists(), true);
    const loaded = persistence.load();
    assert.deepEqual(loaded, result.state);
  });

  test('restores an existing world without re-initializing time or regenerating entities', () => {
    const fixedTime = '2026-09-14T05:00:00.000Z';
    const seed = createDevelopmentSeedWorld(fixedTime);
    const persistence = new LocalFilePersistence(testFilePath);
    persistence.save({
      worldId: 'juarez-el-paso',
      version: 14,
      worldTime: fixedTime,
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
      knowledge: [],
    });

    // Run bootstrapWorld pointing to the pre-populated file
    const result = bootstrapWorld({ persistencePath: testFilePath, silent: true });

    assert.equal(result.status, 'READY');
    assert.equal(result.ready, true);
    assert.equal(result.isNewWorld, false);
    assert.equal(result.state.version, 14);
    assert.equal(result.state.worldTime, fixedTime);
    assert.equal(result.clock.getTime(), fixedTime);
    assert.deepEqual(result.state.places, seed.places);
    assert.deepEqual(result.state.restaurants, seed.restaurants);
    assert.deepEqual(result.state.agents, seed.agents);
    assert.deepEqual(result.state.offerings, seed.offerings);
    assert.deepEqual(result.state.purchases, []);
    assert.deepEqual(result.state.activityCompletions, []);
    assert.deepEqual(result.state.acquaintances, []);
    assert.deepEqual(result.state.items, []);
  });

  test('rejects bootstrap when persisted file is version 1 rather than silently replacing it', () => {
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 1,
        worldTime: '2026-09-14T05:00:00.000Z',
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 1\. Expected version 14/
    );
  });

  test('rejects bootstrap when persisted file is version 2 rather than silently replacing it', () => {
    const seed = createDevelopmentSeedWorld('2026-09-14T05:00:00.000Z');
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 2,
        worldTime: '2026-09-14T05:00:00.000Z',
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
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 2\. Expected version 14/
    );
  });

  test('rejects bootstrap when persisted file is version 3 rather than silently replacing it', () => {
    const seed = createDevelopmentSeedWorld('2026-09-14T05:00:00.000Z');
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 3,
        worldTime: '2026-09-14T05:00:00.000Z',
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
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 3\. Expected version 14/
    );
  });

  test('rejects bootstrap when persisted file is version 4 rather than silently replacing it', () => {
    const seed = createDevelopmentSeedWorld('2026-09-14T05:00:00.000Z');
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 4,
        worldTime: '2026-09-14T05:00:00.000Z',
        places: seed.places,
        restaurants: seed.restaurants.map((r) => ({
          id: r.id,
          type: r.type,
          name: r.name,
          buildingId: r.buildingId,
        })),
        agents: seed.agents,
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 4\. Expected version 14/
    );
  });

  test('rejects bootstrap when persisted file is version 5 rather than silently replacing it', () => {
    const seed = createDevelopmentSeedWorld('2026-09-14T05:00:00.000Z');
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 5,
        worldTime: '2026-09-14T05:00:00.000Z',
        places: seed.places,
        restaurants: seed.restaurants,
        agents: seed.agents,
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 5\. Expected version 14/
    );
  });

  test('rejects bootstrap when persisted file is version 6 rather than silently replacing it', () => {
    const seed = createDevelopmentSeedWorld('2026-09-14T05:00:00.000Z');
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 6,
        worldTime: '2026-09-14T05:00:00.000Z',
        places: seed.places,
        restaurants: seed.restaurants,
        agents: seed.agents,
        offerings: seed.offerings,
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 6\. Expected version 14/
    );
  });

  test('rejects bootstrap when persisted file is version 7 rather than silently replacing it', () => {
    const seed = createDevelopmentSeedWorld('2026-09-14T05:00:00.000Z');
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 7,
        worldTime: '2026-09-14T05:00:00.000Z',
        places: seed.places,
        restaurants: seed.restaurants,
        agents: seed.agents,
        offerings: seed.offerings,
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 7\. Expected version 14/
    );
  });

  test('rejects bootstrap when persisted file is version 8 rather than silently replacing it', () => {
    const seed = createDevelopmentSeedWorld('2026-09-14T05:00:00.000Z');
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 8,
        worldTime: '2026-09-14T05:00:00.000Z',
        places: seed.places,
        restaurants: seed.restaurants,
        agents: seed.agents,
        offerings: seed.offerings,
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 8\. Expected version 14/
    );
  });

  test('rejects bootstrap when persisted file is version 9 rather than silently replacing it', () => {
    const seed = createDevelopmentSeedWorld('2026-09-14T05:00:00.000Z');
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 9,
        worldTime: '2026-09-14T05:00:00.000Z',
        places: seed.places,
        restaurants: seed.restaurants,
        agents: seed.agents,
        offerings: seed.offerings,
        purchases: [],
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 9\. Expected version 14/
    );
  });

  test('rejects bootstrap when persisted file is version 10 rather than silently replacing it', () => {
    const seed = createDevelopmentSeedWorld('2026-09-14T05:00:00.000Z');
    writeFileSync(
      testFilePath,
      JSON.stringify({
        worldId: 'juarez-el-paso',
        version: 10,
        worldTime: '2026-09-14T05:00:00.000Z',
        places: seed.places,
        restaurants: seed.restaurants,
        agents: seed.agents,
        offerings: seed.offerings,
        purchases: [],
        coffeeCompletions: [],
      }),
      'utf-8'
    );

    assert.throws(
      () => bootstrapWorld({ persistencePath: testFilePath, silent: true }),
      /Unsupported WorldState version: 10\. Expected version 14/
    );
  });
});
