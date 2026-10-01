import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { ApiClient } from '../src/client/api-client.js';
import { ClientSession } from '../src/client/session.js';
import {
  createPresentationModel,
  findInspectableEntity,
  formatCivilTimeDisplay,
  formatWorldTimeDisplay,
} from '../src/client/projections.js';
import {
  resolveLocationRootCity,
  resolveLocationTimeZone,
  resolvePlayerTemporalContext,
  deriveCivilTime,
  CITY_TIMEZONE_MAP,
} from '../src/core/civil-time.js';
import { WorldClock } from '../src/core/clock.js';
import { inspectCurrentLocation, createInitialWorldState, WorldState } from '../src/core/world-state.js';

function createTestWorld(worldTime: string = '2026-10-01T16:00:00.000Z'): WorldState {
  const clock = new WorldClock(worldTime);
  return createInitialWorldState(clock);
}

describe('Player-Facing Temporal Context & Civil-Time Architecture', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `player-temporal-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

    const initialClock = new WorldClock('2026-10-01T16:00:00.000Z');
    const initialState = createInitialWorldState(initialClock);
    writeFileSync(tempFilePath, JSON.stringify(initialState, null, 2), 'utf-8');

    const controller = new WorldSessionController({
      persistencePath: tempFilePath,
      silent: true,
    });

    server = createWorldServer({
      controller,
      silent: true,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = info.url;
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
  // Test 1 — Ciudad Juárez projection
  // =========================================================================
  test('Test 1 — Ciudad Juárez projection: resolves canonical root city and derives 10:00 AM local time at 16:00 UTC', () => {
    const state = createTestWorld('2026-10-01T16:00:00.000Z');

    // Player in development building
    const ctxBuilding = resolvePlayerTemporalContext(state, 'agent:dev-player');
    assert.equal(ctxBuilding.worldTime, '2026-10-01T16:00:00.000Z');
    assert.equal(ctxBuilding.locationId, 'building:development-building');
    assert.equal(ctxBuilding.rootCityId, 'city:ciudad-juarez');
    assert.equal(ctxBuilding.rootCityName, 'Ciudad Juárez');
    assert.equal(ctxBuilding.timeZone, 'America/Ciudad_Juarez');
    assert.equal(ctxBuilding.civilTime.hour, 10);
    assert.equal(ctxBuilding.civilTime.minute, 0);
    assert.equal(ctxBuilding.civilTime.utcOffsetMinutes, -360);
    assert.equal(ctxBuilding.civilTime.isoCivilString, '2026-10-01T10:00:00.000-06:00');

    // Player moved to development restaurant
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    player.locationId = 'restaurant:development-restaurant';

    const ctxRestaurant = resolvePlayerTemporalContext(state, 'agent:dev-player');
    assert.equal(ctxRestaurant.locationId, 'restaurant:development-restaurant');
    assert.equal(ctxRestaurant.rootCityId, 'city:ciudad-juarez');
    assert.equal(ctxRestaurant.rootCityName, 'Ciudad Juárez');
    assert.equal(ctxRestaurant.timeZone, 'America/Ciudad_Juarez');
    assert.equal(ctxRestaurant.civilTime.hour, 10);
    assert.equal(ctxRestaurant.civilTime.minute, 0);
  });

  // =========================================================================
  // Test 2 — El Paso projection via spatial hierarchy
  // =========================================================================
  test('Test 2 — El Paso projection: resolves America/Denver and derives civil time without caller timezone parameter', () => {
    const state = createTestWorld('2026-10-01T16:00:00.000Z');

    // Add El Paso hierarchy
    state.places.push({
      id: 'city:el-paso',
      name: 'El Paso',
      type: 'city',
      parentId: null,
    });
    state.places.push({
      id: 'neighborhood:downtown-el-paso',
      name: 'Downtown El Paso',
      type: 'neighborhood',
      parentId: 'city:el-paso',
    });
    state.places.push({
      id: 'street:san-antonio-st',
      name: 'San Antonio Ave',
      type: 'street',
      parentId: 'neighborhood:downtown-el-paso',
    });
    state.places.push({
      id: 'building:plaza-hotel',
      name: 'Plaza Hotel Pioneer Park',
      type: 'building',
      parentId: 'street:san-antonio-st',
    });

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    player.locationId = 'building:plaza-hotel';

    const ctx = resolvePlayerTemporalContext(state, 'agent:dev-player');
    assert.equal(ctx.locationId, 'building:plaza-hotel');
    assert.equal(ctx.rootCityId, 'city:el-paso');
    assert.equal(ctx.rootCityName, 'El Paso');
    assert.equal(ctx.timeZone, 'America/Denver');
    assert.equal(ctx.civilTime.timeZone, 'America/Denver');
    assert.equal(ctx.civilTime.hour, 10);
    assert.equal(ctx.civilTime.minute, 0);
    assert.equal(ctx.civilTime.utcOffsetMinutes, -360); // MDT in October is UTC-6
  });

  // =========================================================================
  // Test 3 — Host timezone independence
  // =========================================================================
  test('Test 3 — Host timezone independence: mathematical projection is purely universal UTC-derived', () => {
    // Both Ciudad Juárez and El Paso in winter standard time (MST: UTC-7) vs summer daylight time (MDT: UTC-6)
    // 2026-01-15T17:00:00.000Z -> 10:00 AM MST (-07:00)
    const winterCivilCJ = deriveCivilTime('2026-01-15T17:00:00.000Z', 'America/Ciudad_Juarez');
    assert.equal(winterCivilCJ.hour, 10);
    assert.equal(winterCivilCJ.minute, 0);
    assert.equal(winterCivilCJ.utcOffsetMinutes, -420);
    assert.equal(winterCivilCJ.isoCivilString, '2026-01-15T10:00:00.000-07:00');

    const winterCivilEP = deriveCivilTime('2026-01-15T17:00:00.000Z', 'America/Denver');
    assert.equal(winterCivilEP.hour, 10);
    assert.equal(winterCivilEP.minute, 0);
    assert.equal(winterCivilEP.utcOffsetMinutes, -420);
    assert.equal(winterCivilEP.isoCivilString, '2026-01-15T10:00:00.000-07:00');

    // 2026-06-15T16:00:00.000Z -> 10:00 AM MDT (-06:00)
    const summerCivilCJ = deriveCivilTime('2026-06-15T16:00:00.000Z', 'America/Ciudad_Juarez');
    assert.equal(summerCivilCJ.hour, 10);
    assert.equal(summerCivilCJ.minute, 0);
    assert.equal(summerCivilCJ.utcOffsetMinutes, -360);
    assert.equal(summerCivilCJ.isoCivilString, '2026-06-15T10:00:00.000-06:00');

    // The calculation relies exclusively on universal time and IANA registry
    assert.ok(CITY_TIMEZONE_MAP['city:ciudad-juarez']);
    assert.ok(CITY_TIMEZONE_MAP['city:el-paso']);
  });

  // =========================================================================
  // Test 4 — Invalid geography explicit failure (no silent UTC fallback)
  // =========================================================================
  test('Test 4 — Invalid geography explicit failure: throws explicitly without silent UTC fallback', () => {
    const state = createTestWorld();

    // 1. Missing place
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    player.locationId = 'place:non-existent';
    assert.throws(
      () => resolvePlayerTemporalContext(state, 'agent:dev-player'),
      /Cannot resolve location "place:non-existent"/
    );

    // 2. Disconnected hierarchy (non-city with null parentId)
    player.locationId = 'street:orphan';
    state.places.push({
      id: 'street:orphan',
      name: 'Orphan Street',
      type: 'street',
      parentId: null,
    });
    assert.throws(
      () => resolvePlayerTemporalContext(state, 'agent:dev-player'),
      /has no parentId and is not a city; hierarchy is disconnected/
    );

    // 3. Cyclic containment
    state.places.push({
      id: 'place:cycle-a',
      name: 'Cycle A',
      type: 'neighborhood',
      parentId: 'place:cycle-b',
    });
    state.places.push({
      id: 'place:cycle-b',
      name: 'Cycle B',
      type: 'neighborhood',
      parentId: 'place:cycle-a',
    });
    player.locationId = 'place:cycle-a';
    assert.throws(
      () => resolvePlayerTemporalContext(state, 'agent:dev-player'),
      /Containment cycle detected/
    );

    // 4. Root city with no registered timezone
    state.places.push({
      id: 'city:atlantis',
      name: 'Atlantis',
      type: 'city',
      parentId: null,
    });
    player.locationId = 'city:atlantis';
    assert.throws(
      () => resolvePlayerTemporalContext(state, 'agent:dev-player'),
      /No registered IANA timezone for root city "city:atlantis"/
    );
  });

  // =========================================================================
  // Test 5 — World Time and WorldState immutability
  // =========================================================================
  test('Test 5 — World Time and WorldState immutability: zero mutation of state and frozen context', () => {
    const state = createTestWorld('2026-10-01T16:00:00.000Z');
    const originalWorldTime = '2026-10-01T16:00:00.000Z';

    const stateJsonBefore = JSON.stringify(state);

    const ctx = resolvePlayerTemporalContext(state, 'agent:dev-player');
    assert.ok(Object.isFrozen(ctx));
    assert.ok(Object.isFrozen(ctx.civilTime));

    const inspectResult = inspectCurrentLocation(state, 'agent:dev-player');
    assert.equal(inspectResult.success, true);
    assert.ok(inspectResult.temporalContext);
    assert.ok(Object.isFrozen(inspectResult.temporalContext));

    // Assert zero state mutation
    assert.equal(state.worldTime, originalWorldTime);
    assert.equal(JSON.stringify(state), stateJsonBefore);
  });

  // =========================================================================
  // Test 6 — Client Presentation Model transformation & ClientSession
  // =========================================================================
  test('Test 6 — Client Presentation Model transformation: formats display without inventing facts and integrates with ClientSession', async () => {
    // 1. Pure projection testing
    const civilTime = deriveCivilTime('2026-10-01T16:00:00.000Z', 'America/Ciudad_Juarez');
    const { formattedTime, formattedDisplay } = formatCivilTimeDisplay(civilTime, 'Ciudad Juárez');
    assert.equal(formattedTime, '10:00 AM');
    assert.equal(formattedDisplay, '10:00 AM · Ciudad Juárez');

    const formattedWorld = formatWorldTimeDisplay('2026-10-01T16:00:00.000Z');
    assert.equal(formattedWorld, 'Oct 1, 2026 · 16:00 UTC');

    // 2. ClientSession integration via HTTP server
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    const connected = await session.init();
    assert.equal(connected, true);

    const state = session.getState();
    assert.equal(state.status, 'READY');
    assert.ok(state.model);

    // Verify temporal context present on client PresentationModel
    const model = state.model!;
    assert.ok(model.temporalContext);
    assert.equal(model.temporalContext.rootCityName, 'Ciudad Juárez');
    assert.equal(model.temporalContext.timeZone, 'America/Ciudad_Juarez');
    assert.equal(model.temporalContext.formattedTime, '10:00 AM');
    assert.equal(model.temporalContext.formattedDisplay, '10:00 AM · Ciudad Juárez');
    assert.equal(model.formattedWorldTime, 'Oct 1, 2026 · 16:00 UTC');

    // Verify inspectable entity exposes geographic temporal facts
    const entity = findInspectableEntity(model, model.locationId);
    assert.ok(entity);
    assert.equal(entity.details['City'], 'Ciudad Juárez');
    assert.equal(entity.details['Timezone'], 'America/Ciudad_Juarez');
    assert.equal(entity.details['Local Time'], '10:00 AM · Ciudad Juárez');
  });
});
