import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { createInitialWorldState, snapshotWorldState } from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Persistence Reconstruction', () => {
  const testFilePath = join(
    tmpdir(),
    `reconstruction-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  test('WorldClock and populated domain entities survive complete runtime destruction and reconstruction', () => {
    const knownTime = '2026-09-14T16:00:00.000Z';

    // --- RUNTIME SESSION 1 ---
    {
      const clock1 = WorldClock.create(knownTime);
      const persistence1 = new LocalFilePersistence(testFilePath);
      const state1 = createInitialWorldState(clock1);

      persistence1.save(state1);
      assert.equal(clock1.getTime(), knownTime);
      assert.equal(state1.places.length, 8);
      assert.equal(state1.restaurants.length, 1);
      assert.equal(state1.agents.length, 2);
    }

    // --- RUNTIME SESSION 2 (Fresh instances) ---
    {
      const persistence2 = new LocalFilePersistence(testFilePath);
      const loadedState = persistence2.load();

      assert.ok(loadedState !== null, 'Persisted state must exist in session 2');
      assert.equal(loadedState.worldId, 'juarez-el-paso');
      assert.equal(loadedState.version, 19);
      assert.equal(loadedState.worldTime, knownTime);

      const clock2 = WorldClock.create(loadedState.worldTime);

      // 1. Verify that reconstructed runtime clock is identical to session 1
      assert.equal(clock2.getTime(), knownTime);
      assert.equal(clock2.getEpochMs(), Date.parse(knownTime));

      // 2. Verify exact entity IDs remain identical
      const expectedPlaceIds = [
        'city:ciudad-juarez',
        'district:development-district',
        'neighborhood:development-neighborhood',
        'street:development-street',
        'building:development-building',
        'building:development-residence',
        'street:avenida-juarez',
        'building:avenida-juarez-kiosk',
      ];
      assert.deepEqual(
        loadedState.places.map((p) => p.id),
        expectedPlaceIds
      );
      assert.equal(loadedState.restaurants[0].id, 'restaurant:development-restaurant');
      assert.deepEqual(
        loadedState.agents.map((a) => a.id),
        ['agent:dev-player', 'agent:dev-npc']
      );

      // 3. Verify exact geographic hierarchy remains identical
      const city = loadedState.places.find((p) => p.id === 'city:ciudad-juarez');
      const district = loadedState.places.find((p) => p.id === 'district:development-district');
      const neighborhood = loadedState.places.find((p) => p.id === 'neighborhood:development-neighborhood');
      const street = loadedState.places.find((p) => p.id === 'street:development-street');
      const building = loadedState.places.find((p) => p.id === 'building:development-building');
      const residence = loadedState.places.find((p) => p.id === 'building:development-residence');
      const aveJuarez = loadedState.places.find((p) => p.id === 'street:avenida-juarez');
      const kiosk = loadedState.places.find((p) => p.id === 'building:avenida-juarez-kiosk');

      assert.equal(city?.parentId, null);
      assert.equal(district?.parentId, 'city:ciudad-juarez');
      assert.equal(neighborhood?.parentId, 'district:development-district');
      assert.equal(street?.parentId, 'neighborhood:development-neighborhood');
      assert.equal(building?.parentId, 'street:development-street');
      assert.equal(residence?.parentId, 'street:development-street');
      assert.equal(aveJuarez?.parentId, 'neighborhood:development-neighborhood');
      assert.equal(kiosk?.parentId, 'street:avenida-juarez');

      // 4. Verify restaurant spatial location and operational state remain identical
      assert.equal(loadedState.restaurants[0].buildingId, 'building:development-building');
      assert.equal(loadedState.restaurants[0].operationalState, 'open');
      assert.equal(loadedState.restaurants[0].operationalSince, knownTime);

      // 5. Verify agents, spatial locations, and dynamic activity states remain identical
      const player = loadedState.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = loadedState.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(player.agentType, 'player');
      assert.equal(player.activityState, 'active');
      assert.equal(player.activitySince, knownTime);
      assert.equal(player.locationId, 'building:development-building');

      assert.equal(npc.agentType, 'npc');
      assert.equal(npc.activityState, 'idle');
      assert.equal(npc.activitySince, knownTime);
      assert.equal(npc.locationId, 'building:development-residence');

      // 6. Verify no entities were duplicated
      assert.equal(loadedState.places.length, 8);
      assert.equal(loadedState.restaurants.length, 1);
      assert.equal(loadedState.agents.length, 2);
    }
  });

  test('Multiple runtime restarts preserve accumulated explicit time advances and entity integrity', () => {
    const t0 = '2026-09-14T08:00:00.000Z';

    // Session 1: Create world at T0, advance 5s, save
    {
      const clock1 = WorldClock.create(t0);
      const state1 = createInitialWorldState(clock1);
      clock1.advance(5000); // T0 + 5s = 08:00:05
      const persistence1 = new LocalFilePersistence(testFilePath);
      persistence1.save(snapshotWorldState(clock1, state1));
    }

    // Session 2: Restore from disk, verify T0 + 5s, advance 5s more, save
    {
      const persistence2 = new LocalFilePersistence(testFilePath);
      const state2 = persistence2.load();
      assert.ok(state2 !== null);
      assert.equal(state2.version, 19);
      assert.equal(state2.worldTime, '2026-09-14T08:00:05.000Z');
      assert.equal(state2.places.length, 8);
      assert.equal(state2.restaurants.length, 1);
      assert.equal(state2.restaurants[0].operationalState, 'closed');
      assert.equal(state2.restaurants[0].operationalSince, t0);
      assert.equal(state2.agents.length, 2);
      assert.equal(state2.agents[0].locationId, 'building:development-building');
      assert.equal(state2.agents[1].locationId, 'building:development-residence');
      assert.equal(state2.offerings.length, 1);

      const clock2 = WorldClock.create(state2.worldTime);
      assert.equal(clock2.getTime(), '2026-09-14T08:00:05.000Z');

      clock2.advance(5000); // T0 + 10s = 08:00:10
      persistence2.save(snapshotWorldState(clock2, state2));
    }

    // Session 3: Restore again, verify T0 + 10s restored accurately with intact entities
    {
      const persistence3 = new LocalFilePersistence(testFilePath);
      const state3 = persistence3.load();
      assert.ok(state3 !== null);
      assert.equal(state3.version, 19);
      assert.equal(state3.worldTime, '2026-09-14T08:00:10.000Z');
      assert.equal(state3.places.length, 8);
      assert.equal(state3.restaurants.length, 1);
      assert.equal(state3.restaurants[0].operationalState, 'closed');
      assert.equal(state3.restaurants[0].operationalSince, t0);
      assert.equal(state3.agents.length, 2);
      assert.equal(state3.agents[0].locationId, 'building:development-building');
      assert.equal(state3.agents[1].locationId, 'building:development-residence');
      assert.equal(state3.offerings.length, 1);

      const clock3 = WorldClock.create(state3.worldTime);
      assert.equal(clock3.getTime(), '2026-09-14T08:00:10.000Z');
    }
  });
});
