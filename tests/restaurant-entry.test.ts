import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  enterRestaurant,
  transitionAgentLocation,
  validateWorldState,
  snapshotWorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('enterRestaurant Interaction', () => {
  const openTime = '2026-09-14T15:00:00.000Z'; // 09:00 local Ciudad Juárez
  const closedTime = '2026-09-14T14:00:00.000Z'; // 08:00 local Ciudad Juárez

  test('successfully enters restaurant when restaurant is open and player is at containing building', () => {
    const clock = WorldClock.create(openTime);
    const state = createInitialWorldState(clock);

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

    assert.equal(restaurant.operationalState, 'open');
    assert.equal(player.locationId, restaurant.buildingId);

    const result = enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:development-restaurant',
      { silent: true }
    );

    assert.equal(result.success, true);
    assert.equal(result.code, 'success');
    assert.equal(result.agentId, 'agent:dev-player');
    assert.equal(result.restaurantId, 'restaurant:development-restaurant');
    assert.equal(player.locationId, 'restaurant:development-restaurant');
  });

  test('fails with "agent-not-found" when agent ID does not exist in world state, with zero mutation', () => {
    const clock = WorldClock.create(openTime);
    const state = createInitialWorldState(clock);
    const snapshotBefore = JSON.stringify(state);

    const result = enterRestaurant(
      state,
      'agent:non-existent',
      'restaurant:development-restaurant',
      { silent: true }
    );

    assert.equal(result.success, false);
    assert.equal(result.code, 'agent-not-found');
    assert.match(result.message, /not found in world state/);
    assert.equal(JSON.stringify(state), snapshotBefore);
  });

  test('fails with "agent-not-player" when NPC attempts to enter restaurant, with zero mutation', () => {
    const clock = WorldClock.create(openTime);
    const state = createInitialWorldState(clock);
    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
    const snapshotBefore = JSON.stringify(state);

    assert.equal(npc.agentType, 'npc');
    assert.equal(npc.locationId, 'building:development-residence');

    const result = enterRestaurant(
      state,
      'agent:dev-npc',
      'restaurant:development-restaurant',
      { silent: true }
    );

    assert.equal(result.success, false);
    assert.equal(result.code, 'agent-not-player');
    assert.match(result.message, /is not a player/);
    assert.equal(npc.locationId, 'building:development-residence');
    assert.equal(JSON.stringify(state), snapshotBefore);
  });

  test('fails with "restaurant-not-found" when restaurant ID does not exist in world state, with zero mutation', () => {
    const clock = WorldClock.create(openTime);
    const state = createInitialWorldState(clock);
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const snapshotBefore = JSON.stringify(state);

    const result = enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:non-existent',
      { silent: true }
    );

    assert.equal(result.success, false);
    assert.equal(result.code, 'restaurant-not-found');
    assert.match(result.message, /not found in world state/);
    assert.equal(player.locationId, 'building:development-building');
    assert.equal(JSON.stringify(state), snapshotBefore);
  });

  test('fails with "already-inside" idempotency check when player is already inside restaurant, with zero mutation', () => {
    const clock = WorldClock.create(openTime);
    const state = createInitialWorldState(clock);
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

    // Initial successful entry
    const firstResult = enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:development-restaurant',
      { silent: true }
    );
    assert.equal(firstResult.success, true);
    assert.equal(player.locationId, 'restaurant:development-restaurant');

    const snapshotBefore = JSON.stringify(state);

    // Second entry attempt
    const secondResult = enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:development-restaurant',
      { silent: true }
    );

    assert.equal(secondResult.success, false);
    assert.equal(secondResult.code, 'already-inside');
    assert.match(secondResult.message, /already inside restaurant/);
    assert.equal(player.locationId, 'restaurant:development-restaurant');
    assert.equal(JSON.stringify(state), snapshotBefore);
  });

  test('fails with "restaurant-closed" when restaurant is closed, with zero mutation', () => {
    const clock = WorldClock.create(closedTime);
    const state = createInitialWorldState(clock);
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
    const snapshotBefore = JSON.stringify(state);

    assert.equal(restaurant.operationalState, 'closed');
    assert.equal(player.locationId, 'building:development-building');

    const result = enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:development-restaurant',
      { silent: true }
    );

    assert.equal(result.success, false);
    assert.equal(result.code, 'restaurant-closed');
    assert.match(result.message, /is closed/);
    assert.equal(player.locationId, 'building:development-building');
    assert.equal(JSON.stringify(state), snapshotBefore);
  });

  test('fails with "invalid-location" when player is at a different place (street), with zero mutation', () => {
    const clock = WorldClock.create(openTime);
    const state = createInitialWorldState(clock);
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

    // Move player to street
    transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');
    assert.equal(player.locationId, 'street:development-street');

    const snapshotBefore = JSON.stringify(state);

    const result = enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:development-restaurant',
      { silent: true }
    );

    assert.equal(result.success, false);
    assert.equal(result.code, 'invalid-location');
    assert.match(result.message, /not at containing building/);
    assert.equal(player.locationId, 'street:development-street');
    assert.equal(JSON.stringify(state), snapshotBefore);
  });

  test('maintains strict state isolation: does not mutate clock, worldTime, operational state, NPC state, or geography', () => {
    const clock = WorldClock.create(openTime);
    const state = createInitialWorldState(clock);

    const initialTime = clock.getTime();
    const initialWorldTime = state.worldTime;
    const initialPlaces = JSON.stringify(state.places);
    const initialRestaurants = JSON.stringify(state.restaurants);
    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
    const initialNpcState = { ...npc };
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const initialPlayerActivity = player.activityState;
    const initialPlayerSince = player.activitySince;

    enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:development-restaurant',
      { silent: true }
    );

    // Clock and world time unchanged
    assert.equal(clock.getTime(), initialTime);
    assert.equal(state.worldTime, initialWorldTime);

    // Places unchanged
    assert.equal(JSON.stringify(state.places), initialPlaces);

    // Restaurant unchanged (operationalState, operationalSince, buildingId)
    assert.equal(JSON.stringify(state.restaurants), initialRestaurants);

    // NPC unchanged
    assert.deepEqual(npc, initialNpcState);

    // Player activity state and timestamp unchanged
    assert.equal(player.activityState, initialPlayerActivity);
    assert.equal(player.activitySince, initialPlayerSince);

    // Only player locationId was updated
    assert.equal(player.locationId, 'restaurant:development-restaurant');
  });

  test('persists and reconstructs world state with player inside restaurant', () => {
    const testFile = join(tmpdir(), `test-entry-persistence-${Date.now()}.json`);
    try {
      const clock = WorldClock.create(openTime);
      const state = createInitialWorldState(clock);

      // Player enters restaurant
      const entryResult = enterRestaurant(
        state,
        'agent:dev-player',
        'restaurant:development-restaurant',
        { silent: true }
      );
      assert.equal(entryResult.success, true);

      // Persist snapshot
      const persistence = new LocalFilePersistence(testFile);
      persistence.save(snapshotWorldState(clock, state));

      // Restore in fresh persistence instance
      const restoredPersistence = new LocalFilePersistence(testFile);
      const restoredState = restoredPersistence.load();

      assert.ok(restoredState !== null);
      assert.doesNotThrow(() => validateWorldState(restoredState));

      const restoredPlayer = restoredState.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(restoredPlayer.locationId, 'restaurant:development-restaurant');
      assert.equal(restoredState.version, 19);
    } finally {
      if (existsSync(testFile)) {
        unlinkSync(testFile);
      }
    }
  });

  test('validateWorldState rejects agent locationId referencing non-existent restaurant or other agent', () => {
    const clock = WorldClock.create(openTime);
    const state = createInitialWorldState(clock);

    // Case 1: non-existent restaurant
    const invalidState1 = JSON.parse(JSON.stringify(state));
    invalidState1.agents[0].locationId = 'restaurant:non-existent';
    assert.throws(
      () => validateWorldState(invalidState1),
      /references non-existent or invalid place locationId: "restaurant:non-existent"/
    );

    // Case 2: agent referencing another agent ID
    const invalidState2 = JSON.parse(JSON.stringify(state));
    invalidState2.agents[0].locationId = 'agent:dev-npc';
    assert.throws(
      () => validateWorldState(invalidState2),
      /references non-existent or invalid place locationId: "agent:dev-npc"/
    );
  });

  test('logs formatted message when silent option is false or omitted', () => {
    const clock = WorldClock.create(openTime);
    const state = createInitialWorldState(clock);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      // Success log
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      assert.ok(logs.some((l) => l.includes('[INTERACTION] Agent "agent:dev-player" entered restaurant "restaurant:development-restaurant"')));

      // Failure log (already inside)
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      assert.ok(logs.some((l) => l.includes('[INTERACTION] Agent "agent:dev-player" failed to enter restaurant "restaurant:development-restaurant":') && l.includes('(already-inside)')));
    } finally {
      console.log = originalLog;
    }
  });
});
