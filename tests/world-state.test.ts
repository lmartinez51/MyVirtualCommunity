import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  DEFAULT_WORLD_ID,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import { createDevelopmentSeedWorld } from '../src/core/seed.js';

describe('WorldState', () => {
  test('creates initial WorldState with seed entities, version 12, and clock time', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
    const state = createInitialWorldState(clock);

    assert.equal(state.worldId, DEFAULT_WORLD_ID);
    assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
    assert.equal(state.version, 12);
    assert.equal(state.worldTime, '2026-09-14T08:00:00.000Z');
    assert.equal(state.places.length, 8);
    assert.equal(state.restaurants.length, 1);
    assert.equal(state.restaurants[0].operationalState, 'closed');
    assert.equal(state.restaurants[0].operationalSince, '2026-09-14T08:00:00.000Z');
    assert.equal(state.restaurants[0].balanceMinor, 0);
    assert.equal(state.restaurants[0].currency, 'USD');
    assert.equal(state.agents.length, 2);
    assert.equal(state.agents[0].activityState, 'active');
    assert.equal(state.agents[0].locationId, 'building:development-building');
    assert.equal(state.agents[0].balanceMinor, 2000);
    assert.equal(state.agents[0].currency, 'USD');
    assert.equal(state.agents[1].activityState, 'idle');
    assert.equal(state.agents[1].locationId, 'building:development-residence');
    assert.equal(state.agents[1].balanceMinor, 0);
    assert.equal(state.agents[1].currency, 'USD');
    assert.equal(state.offerings.length, 1);
    assert.equal(state.offerings[0].id, 'offering:development-coffee');
    assert.equal(state.offerings[0].name, 'Coffee');
    assert.equal(state.offerings[0].priceMinor, 500);
    assert.equal(state.offerings[0].currency, 'USD');
    assert.equal(state.purchases.length, 0);
    assert.equal(state.coffeeCompletions.length, 0);
    assert.equal(state.acquaintances.length, 0);
    assert.equal(state.items.length, 0);
  });

  test('snapshots updated WorldState preserving entity collections and advancing time', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
    const initial = createInitialWorldState(clock);

    clock.advance(5000);
    const snapshot = snapshotWorldState(clock, initial);

    assert.equal(snapshot.worldTime, '2026-09-14T08:00:05.000Z');
    assert.equal(snapshot.version, 12);
    assert.deepEqual(snapshot.places, initial.places);
    assert.deepEqual(snapshot.restaurants, initial.restaurants);
    assert.deepEqual(snapshot.agents, initial.agents);
    assert.deepEqual(snapshot.offerings, initial.offerings);
    assert.deepEqual(snapshot.purchases, initial.purchases);
    assert.deepEqual(snapshot.coffeeCompletions, initial.coffeeCompletions);
    assert.deepEqual(snapshot.acquaintances, initial.acquaintances);
    assert.deepEqual(snapshot.items, initial.items);
  });

  test('serializes cleanly to JSON and deserializes back', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
    const state = createInitialWorldState(clock);

    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);

    assert.doesNotThrow(() => validateWorldState(parsed));
    assert.deepEqual(parsed, state);
  });

  test('validateWorldState succeeds for valid version 12 seed state', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
    const state = createInitialWorldState(clock);

    assert.doesNotThrow(() => validateWorldState(state));
  });

  test('validateWorldState explicitly rejects version 1 persisted state', () => {
    const v1State = {
      worldId: 'juarez-el-paso',
      version: 1,
      worldTime: '2026-09-14T08:00:00.000Z',
    };

    assert.throws(
      () => validateWorldState(v1State),
      /Unsupported WorldState version: 1\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 2 persisted state', () => {
    const seed = createDevelopmentSeedWorld();
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

    assert.throws(
      () => validateWorldState(v2State),
      /Unsupported WorldState version: 2\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 3 persisted state', () => {
    const seed = createDevelopmentSeedWorld();
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

    assert.throws(
      () => validateWorldState(v3State),
      /Unsupported WorldState version: 3\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 4 persisted state', () => {
    const seed = createDevelopmentSeedWorld();
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

    assert.throws(
      () => validateWorldState(v4State),
      /Unsupported WorldState version: 4\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 5 persisted state', () => {
    const seed = createDevelopmentSeedWorld();
    const v5State = {
      worldId: 'juarez-el-paso',
      version: 5,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
    };

    assert.throws(
      () => validateWorldState(v5State),
      /Unsupported WorldState version: 5\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 6 persisted state', () => {
    const seed = createDevelopmentSeedWorld();
    const v6State = {
      worldId: 'juarez-el-paso',
      version: 6,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        buildingId: r.buildingId,
        operationalState: r.operationalState,
        operationalSince: r.operationalSince,
      })),
      agents: seed.agents.map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        agentType: a.agentType,
        activityState: a.activityState,
        activitySince: a.activitySince,
        locationId: a.locationId,
      })),
      offerings: seed.offerings,
    };

    assert.throws(
      () => validateWorldState(v6State),
      /Unsupported WorldState version: 6\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 7 persisted state', () => {
    const seed = createDevelopmentSeedWorld();
    const v7State = {
      worldId: 'juarez-el-paso',
      version: 7,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents.map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        agentType: a.agentType,
        activityState: a.activityState,
        activitySince: a.activitySince,
        locationId: a.locationId,
        balanceMinor: a.balanceMinor,
        currency: a.currency,
      })),
      offerings: seed.offerings,
    };

    assert.throws(
      () => validateWorldState(v7State),
      /Unsupported WorldState version: 7\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 8 persisted state', () => {
    const seed = createDevelopmentSeedWorld();
    const v8State = {
      worldId: 'juarez-el-paso',
      version: 8,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
    };

    assert.throws(
      () => validateWorldState(v8State),
      /Unsupported WorldState version: 8\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 9 persisted state', () => {
    const seed = createDevelopmentSeedWorld();
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

    assert.throws(
      () => validateWorldState(v9State),
      /Unsupported WorldState version: 9\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 10 persisted state', () => {
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

    assert.throws(
      () => validateWorldState(v10State),
      /Unsupported WorldState version: 10\. Expected version 12/
    );
  });

  test('validateWorldState explicitly rejects version 11 persisted state', () => {
    const seed = createDevelopmentSeedWorld();
    const v11State = {
      worldId: 'juarez-el-paso',
      version: 11,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      coffeeCompletions: [],
      acquaintances: [],
    };

    assert.throws(
      () => validateWorldState(v11State),
      /Unsupported WorldState version: 11\. Expected version 12/
    );
  });

  test('validateWorldState rejects invalid candidates', () => {
    assert.throws(() => validateWorldState(null), /non-null object/);
    assert.throws(() => validateWorldState('not-an-object'), /non-null object/);
    assert.throws(() => validateWorldState({}), /worldId must be a non-empty string/);
    assert.throws(
      () =>
        validateWorldState({
          worldId: 'other-region',
          version: 12,
          worldTime: '2026-09-14T08:00:00.000Z',
          places: [],
          restaurants: [],
          agents: [],
          offerings: [],
          purchases: [],
          coffeeCompletions: [],
          acquaintances: [],
          items: [],
        }),
      /worldId must be "juarez-el-paso"/
    );
  });

  test('validateWorldState rejects duplicate entity IDs across collections', () => {
    const seed = createDevelopmentSeedWorld();
    const collidingRestaurant = {
      id: 'building:development-building',
      type: 'restaurant' as const,
      name: 'Colliding Restaurant',
      buildingId: 'building:development-building',
      operationalState: 'closed' as const,
      operationalSince: '2026-09-14T08:00:00.000Z',
      balanceMinor: 0,
      currency: 'USD',
    };

    const invalidState = {
      worldId: 'juarez-el-paso',
      version: 12,
      worldTime: '2026-09-14T08:00:00.000Z',
      places: seed.places,
      restaurants: [collidingRestaurant],
      agents: seed.agents,
      offerings: [],
      purchases: [],
      coffeeCompletions: [],
      acquaintances: [],
      items: [],
    };

    assert.throws(
      () => validateWorldState(invalidState),
      /Duplicate entity id found across collections: "building:development-building"/
    );
  });
});
