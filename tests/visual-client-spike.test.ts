import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { ApiClient } from '../src/client/api-client.js';
import { ClientSession } from '../src/client/session.js';
import { WorldRenderer } from '../src/client/renderer.js';
import { findInspectableEntity } from '../src/client/projections.js';

describe('Milestone 42: Visual Client & Engine Evaluation Spike', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `m42-spike-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

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
  // Test A — Initial State: Client connects and renders authoritative world
  // =========================================================================
  test('Test A — Initial state: connects to M41 HTTP server and renders authoritative initial world', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);

    const connected = await session.init();
    assert.equal(connected, true);

    const state = session.getState();
    assert.equal(state.status, 'READY');
    assert.ok(state.model);

    // Verify authoritative identifiers rendered directly from World Core
    assert.equal(state.model.activePlayerId, 'agent:dev-player');
    assert.equal(state.model.locationId, 'building:development-building');
    assert.equal(state.model.locationName, 'Development Building');
    assert.equal(state.model.context, 'BUILDING');
    assert.ok(state.model.worldTime);

    // Renderer instantiates without crashing in headless/Node environment
    const renderer = new WorldRenderer();
    assert.doesNotThrow(() => renderer.render(state));
  });

  // =========================================================================
  // Test B — Valid Movement: Intent -> HTTP command -> World Core -> Visual Update
  // =========================================================================
  test('Test B — Valid movement: player requests valid spatial transition; visual state moves authoritatively', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    // Initial state: player at building:development-building
    assert.equal(session.getState().model?.locationId, 'building:development-building');
    assert.equal(session.getState().model?.context, 'BUILDING');

    // Player selects valid destination: exit building to street
    const success = await session.executeCommand('leaveBuilding', {
      buildingId: 'building:development-building',
    });
    assert.equal(success, true);

    // State reflects updated authoritative projection
    const state = session.getState();
    assert.equal(state.status, 'READY');
    assert.equal(state.model?.locationId, 'street:development-street');
    assert.equal(state.model?.locationName, 'Development Street');
    assert.equal(state.model?.context, 'STREET');

    // Debug tracking verifies command execution
    assert.equal(state.lastCommandName, 'leaveBuilding');
    assert.ok(state.lastCommandResult?.success);
    assert.equal(state.errorMessage, null);

    // Move back into building
    const enterSuccess = await session.executeCommand('enterBuilding', {
      buildingId: 'building:development-building',
    });
    assert.equal(enterSuccess, true);

    const enteredState = session.getState();
    assert.equal(enteredState.model?.locationId, 'building:development-building');
    assert.equal(enteredState.model?.context, 'BUILDING');
  });

  // =========================================================================
  // Test C — Invalid Movement: World Core rejects; visual state does NOT change
  // =========================================================================
  test('Test C — Invalid movement: player requests invalid destination; World Core rejects, visual state unchanged', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const initialLocationId = session.getState().model?.locationId;
    const initialContext = session.getState().model?.context;
    assert.equal(initialLocationId, 'building:development-building');

    // Player attempts an invalid spatial transition: entering non-existent building
    const success = await session.executeCommand('enterBuilding', {
      buildingId: 'building:does-not-exist',
    });

    assert.equal(success, false);

    const state = session.getState();
    // Rejection state is DOMAIN_ERROR
    assert.equal(state.status, 'DOMAIN_ERROR');
    assert.ok(state.errorMessage);
    assert.equal(state.lastCommandResult?.success, false);

    // VISUAL STATE DOES NOT CHANGE
    assert.equal(state.model?.locationId, initialLocationId);
    assert.equal(state.model?.context, initialContext);
  });

  // =========================================================================
  // Test D — Authoritative Reconciliation: Reload preserves server truth
  // =========================================================================
  test('Test D — Reconciliation: reinitializing client reconciles strictly from World Core', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session1 = new ClientSession(apiClient);
    await session1.init();

    // Move player to street
    await session1.executeCommand('leaveBuilding', {
      buildingId: 'building:development-building',
    });
    assert.equal(session1.getState().model?.locationId, 'street:development-street');

    // Simulate page reload: instantiate completely separate fresh ClientSession
    const session2 = new ClientSession(apiClient);
    assert.equal(session2.getState().status, 'CONNECTING');
    assert.equal(session2.getState().model, null);

    // Fresh initialization from server
    const connected = await session2.init();
    assert.equal(connected, true);

    const state2 = session2.getState();
    assert.equal(state2.status, 'READY');
    assert.equal(state2.model?.locationId, 'street:development-street');
    assert.equal(state2.model?.locationName, 'Development Street');
    assert.equal(state2.model?.context, 'STREET');

    // No local storage or client state became the source of truth
    assert.equal(state2.model?.activePlayerId, 'agent:dev-player');
  });

  // =========================================================================
  // Test E — Entity Inspection and Identity Verification
  // =========================================================================
  test('Test E — Entity representation: visibly distinguishes Place, Restaurant, and Agents with real IDs', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const model = session.getState().model!;

    // 1. Place entity
    const placeEntity = findInspectableEntity(model, 'building:development-building');
    assert.ok(placeEntity);
    assert.equal(placeEntity.kind, 'place');
    assert.equal(placeEntity.id, 'building:development-building');
    assert.equal(placeEntity.name, 'Development Building');

    // 2. Restaurant entity
    const restEntity = findInspectableEntity(model, 'restaurant:development-restaurant');
    assert.ok(restEntity);
    assert.equal(restEntity.kind, 'place');
    assert.equal(restEntity.id, 'restaurant:development-restaurant');

    // 3. Player Agent
    const playerEntity = findInspectableEntity(model, 'agent:dev-player');
    assert.ok(playerEntity);
    assert.equal(playerEntity.kind, 'agent');
    assert.equal(playerEntity.id, 'agent:dev-player');
    assert.equal(playerEntity.details['Agent Type'], 'player');

    // 4. Inspecting non-existent entity returns null
    const missing = findInspectableEntity(model, 'fake:non-existent');
    assert.equal(missing, null);
  });
});
