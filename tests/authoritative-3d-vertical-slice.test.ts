import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { createGomezMorinWorldState, WorldState } from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';

describe('Milestone 89: Authoritative 3D Vertical Slice (Wing Spot Ingress/Egress HTTP Boundary)', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';
  let controller: WorldSessionController;

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `m89-vertical-slice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

    // Initialize world state with Gómez Morín seed world
    const clock = WorldClock.create('2026-10-05T16:00:00.000Z');
    const seedState = createGomezMorinWorldState(clock);
    const persistence = new LocalFilePersistence(tempFilePath);
    persistence.save(seedState);

    // Initialize controller with authoritative player 'agent:gomez-morin-player'
    controller = new WorldSessionController({
      persistencePath: tempFilePath,
      playerId: 'agent:gomez-morin-player',
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
        // Ignore test cleanup errors
      }
    }
  });

  // =========================================================================
  // 1. Valid Ingress
  // =========================================================================
  test('1. Valid ingress: POST /api/commands/enterRestaurant transitions player into Wing Spot dining hall', async () => {
    // Verify initial starting state: player is on the street
    const initialLocRes = await fetch(`${baseUrl}/api/location`);
    assert.equal(initialLocRes.status, 200);
    const initialLoc = await initialLocRes.json() as any;
    assert.equal(initialLoc.result.location.id, 'street:blvd-gomez-morin');

    const initialPlayer = (controller as any).state.agents.find(
      (a: any) => a.id === 'agent:gomez-morin-player'
    );
    assert.equal(initialPlayer.locationId, 'street:blvd-gomez-morin');
    assert.equal(initialPlayer.interiorSpaceId, null);

    // Execute authoritative ingress command
    const res = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:wing-spot',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.success, true);
    assert.equal(data.committed, true);
    assert.equal(data.result.code, 'success');
    assert.equal(data.result.newLocationId, 'restaurant:wing-spot');
    assert.equal(data.result.interiorId, 'interior:wing-spot');

    // Verify authoritative player state via GET /api/location perception
    const postLocRes = await fetch(`${baseUrl}/api/location`);
    assert.equal(postLocRes.status, 200);
    const postLoc = await postLocRes.json() as any;
    assert.equal(postLoc.result.location.id, 'restaurant:wing-spot');
    assert.equal(postLoc.result.location.type, 'restaurant');

    // Verify authoritative player state directly in controller active memory
    const updatedPlayer = (controller as any).state.agents.find(
      (a: any) => a.id === 'agent:gomez-morin-player'
    );
    assert.equal(updatedPlayer.locationId, 'restaurant:wing-spot');
    assert.equal(updatedPlayer.interiorSpaceId, 'interior:wing-spot');
  });

  // =========================================================================
  // 2. Valid Egress
  // =========================================================================
  test('2. Valid egress: POST /api/commands/exitRestaurant returns player from Wing Spot to street', async () => {
    // First enter Wing Spot
    const enterRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:wing-spot',
      }),
    });
    assert.equal(enterRes.status, 200);

    // Now execute authoritative egress command
    const exitRes = await fetch(`${baseUrl}/api/commands/exitRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:wing-spot',
      }),
    });

    assert.equal(exitRes.status, 200);
    const exitData = await exitRes.json() as any;
    assert.equal(exitData.success, true);
    assert.equal(exitData.committed, true);
    assert.equal(exitData.result.code, 'success');
    assert.equal(exitData.result.newLocationId, 'street:blvd-gomez-morin');
    assert.equal(exitData.result.interiorId, 'interior:wing-spot');

    // Verify player is back on the street with interiorSpaceId cleared
    const postLocRes = await fetch(`${baseUrl}/api/location`);
    assert.equal(postLocRes.status, 200);
    const postLoc = await postLocRes.json() as any;
    assert.equal(postLoc.result.location.id, 'street:blvd-gomez-morin');

    const updatedPlayer = (controller as any).state.agents.find(
      (a: any) => a.id === 'agent:gomez-morin-player'
    );
    assert.equal(updatedPlayer.locationId, 'street:blvd-gomez-morin');
    assert.equal(updatedPlayer.interiorSpaceId, null);
  });

  // =========================================================================
  // 3. Invalid Origin Rejection
  // =========================================================================
  test('3. Invalid origin: rejects ingress when player is already inside or at invalid origin', async () => {
    // 3A. Enter Wing Spot first
    const enterRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:wing-spot',
      }),
    });
    assert.equal(enterRes.status, 200);

    // 3B. Attempting to enter again while already inside must fail with 422
    const secondEnterRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:wing-spot',
      }),
    });

    assert.equal(secondEnterRes.status, 422);
    const secondData = await secondEnterRes.json() as any;
    assert.equal(secondData.success, false);
    assert.equal(secondData.committed, false);
    assert.equal(secondData.error.code, 'already-inside');

    // State remains untouched
    const player = (controller as any).state.agents.find(
      (a: any) => a.id === 'agent:gomez-morin-player'
    );
    assert.equal(player.locationId, 'restaurant:wing-spot');
    assert.equal(player.interiorSpaceId, 'interior:wing-spot');

    // 3C. When player is at an unassociated origin (e.g., residence), ingress must be rejected
    player.locationId = 'building:del-porvenir-residence';
    player.interiorSpaceId = null;

    const invalidOriginRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:wing-spot',
      }),
    });

    assert.equal(invalidOriginRes.status, 422);
    const invalidOriginData = await invalidOriginRes.json() as any;
    assert.equal(invalidOriginData.success, false);
    assert.equal(invalidOriginData.committed, false);
    assert.equal(invalidOriginData.error.code, 'invalid-location');

    // Authoritative location remains unchanged
    assert.equal(player.locationId, 'building:del-porvenir-residence');
    assert.equal(player.interiorSpaceId, null);
  });

  // =========================================================================
  // 4. Identity Override Protection
  // =========================================================================
  test('4. Identity override protection: rejects client-supplied playerId and agentId with HTTP 400', async () => {
    // 4A. Attempt to supply playerId
    const playerOverrideRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:wing-spot',
        playerId: 'some-other-player',
      }),
    });

    assert.equal(playerOverrideRes.status, 400);
    const playerData = await playerOverrideRes.json() as any;
    assert.equal(playerData.success, false);
    assert.equal(playerData.committed, false);
    assert.equal(playerData.error.code, 'identity-override-forbidden');

    // 4B. Attempt to supply agentId
    const agentOverrideRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:wing-spot',
        agentId: 'agent:elena-npc',
      }),
    });

    assert.equal(agentOverrideRes.status, 400);
    const agentData = await agentOverrideRes.json() as any;
    assert.equal(agentData.success, false);
    assert.equal(agentData.committed, false);
    assert.equal(agentData.error.code, 'identity-override-forbidden');

    // Authoritative player state is untouched
    const player = (controller as any).state.agents.find(
      (a: any) => a.id === 'agent:gomez-morin-player'
    );
    assert.equal(player.locationId, 'street:blvd-gomez-morin');
    assert.equal(player.interiorSpaceId, null);
  });

  // =========================================================================
  // 5. Persistence Roundtrip
  // =========================================================================
  test('5. Persistence: authoritative ingress state persists and reloads correctly through production storage', async () => {
    // Ingress into Wing Spot
    const enterRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:wing-spot',
      }),
    });
    assert.equal(enterRes.status, 200);

    // Verify disk persistence directly via LocalFilePersistence
    const directPersistence = new LocalFilePersistence(tempFilePath);
    const persistedState = directPersistence.load();
    assert.ok(persistedState, 'Persisted state must exist on disk');
    const persistedPlayer = persistedState.agents.find(
      (a: any) => a.id === 'agent:gomez-morin-player'
    );
    assert.ok(persistedPlayer);
    assert.equal(persistedPlayer.locationId, 'restaurant:wing-spot');
    assert.equal(persistedPlayer.interiorSpaceId, 'interior:wing-spot');

    // Stop current server
    await server!.stop();
    server = null;

    // Spin up fresh controller and server from the same persistence file
    const freshController = new WorldSessionController({
      persistencePath: tempFilePath,
      playerId: 'agent:gomez-morin-player',
      silent: true,
    });
    const freshServer = createWorldServer({
      controller: freshController,
      silent: true,
    });
    const freshInfo = await freshServer.start(0, '127.0.0.1');

    try {
      // Perception query to fresh server must return the persisted interior location
      const locRes = await fetch(`${freshInfo.url}/api/location`);
      assert.equal(locRes.status, 200);
      const locData = await locRes.json() as any;
      assert.equal(locData.result.location.id, 'restaurant:wing-spot');
      assert.equal(locData.result.location.type, 'restaurant');

      // Status check
      const statusRes = await fetch(`${freshInfo.url}/api/status`);
      assert.equal(statusRes.status, 200);
      const statusData = await statusRes.json() as any;
      assert.equal(statusData.result.activePlayerId, 'agent:gomez-morin-player');
      assert.equal(statusData.result.schemaVersion, 19);
    } finally {
      await freshServer.stop();
    }
  });

  // =========================================================================
  // 6. Pastelerías La Tía Lupe Ingress & Egress
  // =========================================================================
  test('6. Tía Lupe Ingress & Egress: POST /api/commands/enterRestaurant and exitRestaurant transition player into and out of Tía Lupe', async () => {
    // 6A. Enter Tía Lupe
    const enterRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:pasteleria-tia-lupe',
      }),
    });
    assert.equal(enterRes.status, 200);
    const enterData = await enterRes.json() as any;
    assert.equal(enterData.success, true);
    assert.equal(enterData.committed, true);
    assert.equal(enterData.result.code, 'success');
    assert.equal(enterData.result.newLocationId, 'restaurant:pasteleria-tia-lupe');
    assert.equal(enterData.result.interiorId, 'interior:tia-lupe');

    // Verify player is inside Tía Lupe
    const locRes = await fetch(`${baseUrl}/api/location`);
    assert.equal(locRes.status, 200);
    const locData = await locRes.json() as any;
    assert.equal(locData.result.location.id, 'restaurant:pasteleria-tia-lupe');

    // 6B. Exit Tía Lupe
    const exitRes = await fetch(`${baseUrl}/api/commands/exitRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:pasteleria-tia-lupe',
      }),
    });
    assert.equal(exitRes.status, 200);
    const exitData = await exitRes.json() as any;
    assert.equal(exitData.success, true);
    assert.equal(exitData.committed, true);
    assert.equal(exitData.result.code, 'success');
    assert.equal(exitData.result.newLocationId, 'street:blvd-gomez-morin');
    assert.equal(exitData.result.interiorId, 'interior:tia-lupe');

    // Verify player is back on the street
    const postLocRes = await fetch(`${baseUrl}/api/location`);
    assert.equal(postLocRes.status, 200);
    const postLocData = await postLocRes.json() as any;
    assert.equal(postLocData.result.location.id, 'street:blvd-gomez-morin');
  });

  // =========================================================================
  // 7. Egress Rejection Contract (Powers Client Self-Healing)
  // =========================================================================
  test('7. Egress rejection when outdoors: returns 422 not-inside-interior with detailed message for client reconciliation', async () => {
    // Player is outdoors on street:blvd-gomez-morin.
    // Calling exitRestaurant without having entered must be rejected cleanly.
    const exitRes = await fetch(`${baseUrl}/api/commands/exitRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: 'restaurant:pasteleria-tia-lupe',
      }),
    });

    assert.equal(exitRes.status, 422);
    const exitData = await exitRes.json() as any;
    assert.equal(exitData.success, false);
    assert.equal(exitData.committed, false);
    assert.equal(exitData.error.code, 'not-inside-interior');
    assert.match(exitData.error.message, /not inside interior/);

    // Verify player is still outdoors and state was untouched
    const locRes = await fetch(`${baseUrl}/api/location`);
    const locData = await locRes.json() as any;
    assert.equal(locData.result.location.id, 'street:blvd-gomez-morin');
  });

  // =========================================================================
  // 8. 3D Client Client-Side Contract Verification
  // =========================================================================
  test('8. 3D Client Contract: index.html contains authoritative spawn handlers and egress self-healing', () => {
    const html = readFileSync(resolve(process.cwd(), 'clients', 'minimal-3d', 'index.html'), 'utf-8');
    assert.ok(html.includes('spawnInterior'), 'Must define spawnInterior helper');
    assert.ok(html.includes('spawnOutdoor'), 'Must define spawnOutdoor helper');
    assert.ok(html.includes('RECONCILED'), 'Must contain self-healing egress reconciliation logic');
    assert.ok(html.includes('not-inside-interior'), 'Must handle not-inside-interior code in reconciliation');
  });
});
