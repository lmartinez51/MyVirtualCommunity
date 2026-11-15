import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { createInitialWorldState, snapshotWorldState } from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { Simulation } from '../src/core/simulation.js';

describe('Offline Simulation Reconstruction', () => {
  const testFilePath = join(
    tmpdir(),
    `offline-sim-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  test('demonstrates offline reconstruction: runtime lifecycle independent state evolution', () => {
    // --- RUNTIME SESSION A ---
    {
      const clockA = WorldClock.create('2026-09-14T14:00:00.000Z');
      const stateA = createInitialWorldState(clockA);
      const persistenceA = new LocalFilePersistence(testFilePath);
      const simulationA = new Simulation(clockA, stateA, { silent: true });

      const npcA = stateA.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npcA.activityState, 'idle');

      // Advance logical World Time by 2 hours -> 10:00:00 local (16:00 UTC, active interval)
      clockA.advance(2 * 3600_000);
      assert.equal(clockA.getTime(), '2026-09-14T16:00:00.000Z');

      const tickA = simulationA.tick();
      assert.equal(npcA.activityState, 'active');
      assert.equal(npcA.activitySince, '2026-09-14T16:00:00.000Z');
      assert.equal(tickA.transitions[0].changed, true);

      persistenceA.save(snapshotWorldState(clockA, stateA));
    } // Runtime A destroyed

    // --- RUNTIME SESSION B (Fresh process / runtime) ---
    {
      const persistenceB = new LocalFilePersistence(testFilePath);
      const stateB = persistenceB.load();
      assert.ok(stateB !== null);
      assert.equal(stateB.version, 19);
      assert.equal(stateB.worldTime, '2026-09-14T16:00:00.000Z');

      // Verify exact reconstructed NPC presence and location from disk (at 10:00 local, active routine placed NPC at restaurant)
      const npcB = stateB.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npcB.activityState, 'active');
      assert.equal(npcB.activitySince, '2026-09-14T16:00:00.000Z');
      assert.equal(npcB.locationId, 'restaurant:development-restaurant');

      // Verify restaurant operational state reconstructed from disk (10:00 local is open)
      assert.equal(stateB.restaurants[0].operationalState, 'open');
      assert.equal(stateB.restaurants[0].operationalSince, '2026-09-14T16:00:00.000Z');

      const clockB = WorldClock.create(stateB.worldTime);
      assert.equal(clockB.getTime(), '2026-09-14T16:00:00.000Z');

      const simulationB = new Simulation(clockB, stateB, { silent: true });

      // Advance logical World Time by 8 hours -> 18:00:00 local (00:00 UTC next day, inactive interval)
      clockB.advance(8 * 3600_000);
      assert.equal(clockB.getTime(), '2026-09-15T00:00:00.000Z');

      const tickB = simulationB.tick();
      assert.equal(npcB.activityState, 'idle');
      assert.equal(npcB.activitySince, '2026-09-15T00:00:00.000Z');
      assert.equal(npcB.locationId, 'street:avenida-juarez');
      assert.equal(tickB.transitions[0].changed, true);

      // Verify restaurant transitioned to closed at 18:00 local
      assert.equal(stateB.restaurants[0].operationalState, 'closed');
      assert.equal(stateB.restaurants[0].operationalSince, '2026-09-15T00:00:00.000Z');
      assert.equal(tickB.restaurantTransitions[0].changed, true);

      persistenceB.save(snapshotWorldState(clockB, stateB));
    } // Runtime B destroyed

    // --- RUNTIME SESSION C (Fresh process verifying second transition) ---
    {
      const persistenceC = new LocalFilePersistence(testFilePath);
      const stateC = persistenceC.load();
      assert.ok(stateC !== null);
      assert.equal(stateC.version, 19);
      assert.equal(stateC.worldTime, '2026-09-15T00:00:00.000Z');

      const npcC = stateC.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npcC.activityState, 'idle');
      assert.equal(npcC.activitySince, '2026-09-15T00:00:00.000Z');
      assert.equal(npcC.locationId, 'street:avenida-juarez');

      // Verify restaurant remains closed with operationalSince intact
      assert.equal(stateC.restaurants[0].operationalState, 'closed');
      assert.equal(stateC.restaurants[0].operationalSince, '2026-09-15T00:00:00.000Z');

      // Verify all other entities remained completely stable
      assert.equal(stateC.places.length, 8);
      assert.equal(stateC.restaurants.length, 1);
      assert.equal(stateC.agents.length, 2);
    }
  });
});
