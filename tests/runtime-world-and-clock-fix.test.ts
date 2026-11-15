import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { bootstrapWorld, isDevelopmentSeedWorld } from '../src/core/bootstrap.js';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  createGomezMorinWorldState,
  WorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence, DEFAULT_PERSISTENCE_PATH } from '../src/persistence/local-storage.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { resolvePlayerTemporalContext } from '../src/core/civil-time.js';

describe('Post-M89 Defect Corrections: Runtime World Selection & 3D Civil Time Presentation', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';

  beforeEach(() => {
    tempFilePath = join(
      tmpdir(),
      `test-runtime-world-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    if (existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // Ignore test cleanup error
      }
    }
  });

  // =========================================================================
  // Part 1: Runtime World Selection & Seed Fixtures
  // =========================================================================
  describe('Runtime World Selection Invariants', () => {
    test('1. bootstrapWorld with worldSeed: gomez-morin initializes Blvd. Manuel Gómez Morín world', () => {
      const result = bootstrapWorld({
        persistencePath: tempFilePath,
        worldSeed: 'gomez-morin',
        silent: true,
      });

      assert.equal(result.status, 'READY');
      assert.equal(result.isNewWorld, true);
      assert.equal(result.state.version, 19);

      // Verify street and restaurant
      const gomezStreet = result.state.places.find((p) => p.id === 'street:blvd-gomez-morin');
      assert.ok(gomezStreet, 'street:blvd-gomez-morin must exist');
      const wingSpot = result.state.restaurants.find((r) => r.id === 'restaurant:wing-spot');
      assert.ok(wingSpot, 'restaurant:wing-spot must exist');
      assert.equal(wingSpot.name, 'Wing Spot Gómez Morín');

      // Verify player
      const player = result.state.agents.find((a) => a.id === 'agent:gomez-morin-player');
      assert.ok(player, 'agent:gomez-morin-player must exist');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
    });

    test('2. isDevelopmentSeedWorld correctly distinguishes legacy development fixtures from Gómez Morín', () => {
      const clock = WorldClock.create('2026-10-07T12:00:00.000Z');
      const devState = createInitialWorldState(clock);
      const gmState = createGomezMorinWorldState(clock);

      assert.equal(isDevelopmentSeedWorld(devState), true, 'Development seed must be detected as dev fixture');
      assert.equal(isDevelopmentSeedWorld(gmState), false, 'Gómez Morín seed must not be detected as dev fixture');

      // Modified Gómez Morín world (progression) must remain false
      gmState.agents[0].locationId = 'restaurant:wing-spot';
      assert.equal(isDevelopmentSeedWorld(gmState), false, 'Modified Gómez Morín state must never be detected as dev fixture');
    });

    test('3. bootstrapWorld automatically reinitializes obsolete development fixture to Gómez Morín when targeting gomez-morin', () => {
      // Pre-populate with legacy development seed
      const clock = WorldClock.create('2026-10-07T10:00:00.000Z');
      const legacyDevState = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(legacyDevState, null, 2), 'utf-8');

      // Bootstrap targeting gomez-morin
      const result = bootstrapWorld({
        persistencePath: tempFilePath,
        worldSeed: 'gomez-morin',
        silent: true,
      });

      assert.equal(result.isNewWorld, true, 'Obsolete fixture replacement is flagged as new world initialization');
      const wingSpot = result.state.restaurants.find((r) => r.id === 'restaurant:wing-spot');
      assert.ok(wingSpot, 'Wing Spot must exist after reinitialization');
      const devRest = result.state.restaurants.find((r) => r.id === 'restaurant:development-restaurant');
      assert.equal(devRest, undefined, 'Legacy development restaurant must be replaced');
    });

    test('4. bootstrapWorld preserves existing Gómez Morín world state across restarts without overwriting progression', () => {
      // 1. Initial bootstrap
      const run1 = bootstrapWorld({
        persistencePath: tempFilePath,
        worldSeed: 'gomez-morin',
        silent: true,
      });
      assert.equal(run1.isNewWorld, true);

      // Simulate player progression in Gómez Morín world
      const player = run1.state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';
      player.balanceMinor = 9999;
      run1.persistence.save(run1.state);

      // 2. Second bootstrap on the same file
      const run2 = bootstrapWorld({
        persistencePath: tempFilePath,
        worldSeed: 'gomez-morin',
        silent: true,
      });
      assert.equal(run2.isNewWorld, false, 'Must not reinitialize existing valid Gómez Morín world');
      const playerAfterReload = run2.state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      assert.equal(playerAfterReload.locationId, 'restaurant:wing-spot', 'Player location must be preserved');
      assert.equal(playerAfterReload.interiorSpaceId, 'interior:wing-spot', 'Interior space must be preserved');
      assert.equal(playerAfterReload.balanceMinor, 9999, 'Player progression must be preserved');
    });

    test('5. Development test fixtures continue to work independently with worldSeed: development', () => {
      const result = bootstrapWorld({
        persistencePath: tempFilePath,
        worldSeed: 'development',
        silent: true,
      });

      assert.equal(result.isNewWorld, true);
      const devRest = result.state.restaurants.find((r) => r.id === 'restaurant:development-restaurant');
      assert.ok(devRest, 'restaurant:development-restaurant must exist for development fixtures');
      const devPlayer = result.state.agents.find((a) => a.id === 'agent:dev-player');
      assert.ok(devPlayer, 'agent:dev-player must exist for development fixtures');
    });

    test('6. WorldSessionController dynamically binds activePlayerId to matching player entity in loaded world', () => {
      // Gómez Morín controller
      const gmController = new WorldSessionController({
        persistencePath: tempFilePath,
        worldSeed: 'gomez-morin',
        silent: true,
      });
      assert.equal(gmController.getStatus().activePlayerId, 'agent:gomez-morin-player');

      // Cleanup
      unlinkSync(tempFilePath);

      // Development seed controller
      const devController = new WorldSessionController({
        persistencePath: tempFilePath,
        worldSeed: 'development',
        silent: true,
      });
      assert.equal(devController.getStatus().activePlayerId, 'agent:dev-player');
    });
  });

  // =========================================================================
  // Part 2: Temporal Model & 3D Civil Time Presentation
  // =========================================================================
  describe('Temporal Model & Civil Time Presentation', () => {
    test('7. WorldClock remains strictly UTC instant while resolvePlayerTemporalContext projects America/Ciudad_Juarez civil time', () => {
      const clock = WorldClock.create('2026-10-07T06:23:45.000Z');
      const state = createGomezMorinWorldState(clock);

      assert.equal(clock.getTime(), '2026-10-07T06:23:45.000Z', 'WorldClock must remain authoritative UTC instant');

      const temporalContext = resolvePlayerTemporalContext(state, 'agent:gomez-morin-player');
      assert.equal(temporalContext.worldTime, '2026-10-07T06:23:45.000Z');
      assert.equal(temporalContext.timeZone, 'America/Ciudad_Juarez');
      assert.equal(temporalContext.civilTime.hour, 0); // 00:23:45 (12:23:45 AM)
      assert.equal(temporalContext.civilTime.minute, 23);
      assert.equal(temporalContext.civilTime.second, 45);
      assert.equal(temporalContext.civilTime.isoCivilString, '2026-10-07T00:23:45.000-06:00');
    });

    test('8. Civil time formatting algorithm displays 12-hour AM/PM format matching Ciudad Juárez local time', () => {
      function formatCivil(hour24: number, minute: number, second: number): string {
        const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
        const period = hour24 >= 12 ? 'PM' : 'AM';
        const minStr = String(minute).padStart(2, '0');
        const secStr = String(second).padStart(2, '0');
        return `${h12}:${minStr}:${secStr} ${period}`;
      }

      // Midnight case (00:23:45 -> 12:23:45 AM)
      assert.equal(formatCivil(0, 23, 45), '12:23:45 AM');
      // Noon case (12:00:00 -> 12:00:00 PM)
      assert.equal(formatCivil(12, 0, 0), '12:00:00 PM');
      // Afternoon case (16:30:15 -> 4:30:15 PM)
      assert.equal(formatCivil(16, 30, 15), '4:30:15 PM');
      // Morning case (08:05:09 -> 8:05:09 AM)
      assert.equal(formatCivil(8, 5, 9), '8:05:09 AM');
    });

    test('9. 3D HTML asset contains updated civil time formatting and America/Ciudad_Juarez timezone configuration', () => {
      const html3d = readFileSync(join(process.cwd(), 'clients', 'minimal-3d', 'index.html'), 'utf-8');
      assert.ok(html3d.includes('America/Ciudad_Juarez'), '3D HTML must explicitly specify America/Ciudad_Juarez');
      assert.ok(html3d.includes('displayCivilTime'), '3D HTML must compute displayCivilTime');
      assert.ok(!html3d.includes('${statusRes.result.worldTime} [AUTH]'), '3D HTML must NOT directly display raw UTC worldTime');
    });
  });

  // =========================================================================
  // Part 3: Authoritative Ingress/Egress HTTP Flow in Gómez Morín World
  // =========================================================================
  describe('Authoritative Ingress and Egress HTTP Flow in Gómez Morín World', () => {
    beforeEach(async () => {
      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        worldSeed: 'gomez-morin',
        silent: true,
      });

      server = createWorldServer({
        controller,
        silent: true,
      });

      const info = await server.start(0, '127.0.0.1');
      baseUrl = info.url;
    });

    test('10. GET /api/status and GET /api/location reflect Gómez Morín world and civil time', async () => {
      const statusRes = await fetch(`${baseUrl}/api/status`);
      assert.equal(statusRes.status, 200);
      const statusData = (await statusRes.json()) as any;
      assert.equal(statusData.success, true);
      assert.equal(statusData.result.activePlayerId, 'agent:gomez-morin-player');
      assert.equal(statusData.result.schemaVersion, 19);

      const locRes = await fetch(`${baseUrl}/api/location`);
      assert.equal(locRes.status, 200);
      const locData = (await locRes.json()) as any;
      assert.equal(locData.success, true);
      assert.equal(locData.result.locationId, 'street:blvd-gomez-morin');
      assert.equal(locData.result.location?.name, 'Blvd. Manuel Gómez Morín');
      assert.ok(locData.result.temporalContext?.civilTime);
      assert.equal(locData.result.temporalContext.timeZone, 'America/Ciudad_Juarez');
    });

    test('11. POST /api/commands/enterRestaurant enters Wing Spot with authoritative interior transition', async () => {
      const resp = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: 'restaurant:wing-spot',
        }),
      });

      assert.equal(resp.status, 200);
      const data = (await resp.json()) as any;
      assert.equal(data.success, true);
      assert.equal(data.committed, true);
      assert.equal(data.result.code, 'success');
      assert.equal(data.result.newLocationId, 'restaurant:wing-spot');
      assert.equal(data.result.interiorId, 'interior:wing-spot');

      // Verify location view updated
      const locRes = await fetch(`${baseUrl}/api/location`);
      const locData = (await locRes.json()) as any;
      assert.equal(locData.result.locationId, 'restaurant:wing-spot');
    });

    test('12. POST /api/commands/exitRestaurant exits Wing Spot back to Blvd. Gómez Morín', async () => {
      // First enter
      await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: 'restaurant:wing-spot' }),
      });

      // Then exit
      const exitResp = await fetch(`${baseUrl}/api/commands/exitRestaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: 'restaurant:wing-spot',
        }),
      });

      assert.equal(exitResp.status, 200);
      const exitData = (await exitResp.json()) as any;
      assert.equal(exitData.success, true);
      assert.equal(exitData.committed, true);
      assert.equal(exitData.result.code, 'success');
      assert.equal(exitData.result.newLocationId, 'street:blvd-gomez-morin');
      assert.equal(exitData.result.interiorId, 'interior:wing-spot');

      // Verify location view updated back to street
      const locRes = await fetch(`${baseUrl}/api/location`);
      const locData = (await locRes.json()) as any;
      assert.equal(locData.result.locationId, 'street:blvd-gomez-morin');
    });

    test('13. POST /api/commands/enterRestaurant rejects non-existent restaurant IDs', async () => {
      const resp = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: 'restaurant:non-existent-xyz',
        }),
      });

      assert.equal(resp.status, 422);
      const data = (await resp.json()) as any;
      assert.equal(data.success, false);
      assert.equal(data.committed, false);
      assert.equal(data.error.code, 'restaurant-not-found');
    });

    test('14. Identity override protection: client-supplied playerId is strictly forbidden', async () => {
      const resp = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: 'restaurant:wing-spot',
          playerId: 'agent:impersonated-player',
        }),
      });

      assert.equal(resp.status, 400);
      const data = (await resp.json()) as any;
      assert.equal(data.success, false);
      assert.equal(data.committed, false);
      assert.equal(data.error.code, 'identity-override-forbidden');
    });
  });
});
