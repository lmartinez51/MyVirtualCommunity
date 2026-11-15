import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { ApiClient } from '../src/client/api-client.js';
import { ClientSession } from '../src/client/session.js';
import { WorldRenderer } from '../src/client/renderer.js';
import { InputController } from '../src/client/input.js';

describe('Milestone 53: First Visual Vertical Slice Implementation', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let controller: WorldSessionController;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `m53-slice-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

    controller = new WorldSessionController({
      persistencePath: tempFilePath,
      silent: true,
    });

    // Advance time to 10:00 Local (16:00 UTC) so restaurant and staff NPC are active and operational
    const current = new Date(controller.getStatus().worldTime);
    const target = new Date(current);
    target.setUTCHours(16, 0, 0, 0);
    if (target.getTime() <= current.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    const advanceMs = target.getTime() - current.getTime();
    await controller.stepSimulation(advanceMs);

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

  async function createInitializedSession(): Promise<{ apiClient: ApiClient; session: ClientSession }> {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    for (let attempt = 0; attempt < 5; attempt++) {
      const ok = await session.init();
      if (ok && session.getState().model) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return { apiClient, session };
  }

  // =========================================================================
  // Test 1: Locomotion, Facing, Walk Cycle, and Boundary Clamping
  // =========================================================================
  test('Test 1 — Locomotion: velocity updates visual position, tracks facing, and respects scene bounds', async () => {
    const { apiClient, session } = await createInitializedSession();

    const renderer = new WorldRenderer();
    renderer.render(session.getState());

    // Initially stationary
    let visualState = renderer.getPlayerVisualState();
    assert.equal(visualState.isMoving, false);

    // Hold Move Right
    renderer.setMoveRight(true);
    visualState = renderer.getPlayerVisualState();
    assert.equal(visualState.isMoving, true);
    assert.equal(visualState.facing, 'right');

    const initialX = visualState.x;
    // Step 500ms
    renderer.updateVisualState(500);
    visualState = renderer.getPlayerVisualState();
    assert.ok(visualState.x > initialX, `Expected x (${visualState.x}) to be greater than initialX (${initialX})`);
    assert.ok(visualState.walkCycle > 0);

    // Release Move Right
    renderer.setMoveRight(false);
    visualState = renderer.getPlayerVisualState();
    assert.equal(visualState.isMoving, false);

    // Hold Move Left
    renderer.setMoveLeft(true);
    visualState = renderer.getPlayerVisualState();
    assert.equal(visualState.isMoving, true);
    assert.equal(visualState.facing, 'left');

    const rightmostX = visualState.x;
    renderer.updateVisualState(500);
    visualState = renderer.getPlayerVisualState();
    assert.ok(visualState.x < rightmostX, `Expected x (${visualState.x}) to be less than rightmostX (${rightmostX})`);
    renderer.setMoveLeft(false);

    // Test Boundary Clamping in BUILDING context (minX: 60, maxX: 740)
    renderer.setPlayerVisualX(10);
    renderer.updateVisualState(16);
    assert.equal(renderer.getPlayerVisualState().x, 60);

    renderer.setPlayerVisualX(900);
    renderer.updateVisualState(16);
    assert.equal(renderer.getPlayerVisualState().x, 740);
  });

  // =========================================================================
  // Test 2: Proximity Trigger Detection Across Scenes
  // =========================================================================
  test('Test 2 — Proximity Trigger: prompts appear when approaching anchors and clear when moving away', async () => {
    const { apiClient, session } = await createInitializedSession();

    const renderer = new WorldRenderer();
    renderer.render(session.getState()); // Context: BUILDING

    // 1. In BUILDING lobby:
    // Left door (x = 82)
    renderer.setPlayerVisualX(85);
    let prompt = renderer.getActiveProximityPrompt();
    assert.ok(prompt, 'Expected active prompt near building exit door');
    assert.equal(prompt.action, 'leaveBuilding');
    assert.ok(prompt.label.includes('Leave Building'));

    // Move to center of lobby -> prompt clears
    renderer.setPlayerVisualX(400);
    prompt = renderer.getActiveProximityPrompt();
    assert.equal(prompt, null);

    // Right portal (restaurant entrance at x = 715)
    renderer.setPlayerVisualX(710);
    prompt = renderer.getActiveProximityPrompt();
    assert.ok(prompt, 'Expected active prompt near restaurant entrance');
    assert.equal(prompt.action, 'enterRestaurant');
    assert.equal(prompt.payload.restaurantId, 'restaurant:development-restaurant');

    // 2. In STREET context:
    await session.executeCommand('leaveBuilding');
    renderer.render(session.getState());
    assert.equal(session.getState().model?.context, 'STREET');

    // Away from building door (e.g. x = 150)
    renderer.setPlayerVisualX(150);
    prompt = renderer.getActiveProximityPrompt();
    assert.equal(prompt, null);

    // Near building entrance (center x = 298)
    renderer.setPlayerVisualX(298);
    prompt = renderer.getActiveProximityPrompt();
    assert.ok(prompt, 'Expected active prompt near street building entrance');
    assert.equal(prompt.action, 'enterBuilding');
    assert.equal(prompt.payload.buildingId, 'building:development-building');

    // 3. In RESTAURANT context:
    await session.executeCommand('enterBuilding', { buildingId: 'building:development-building' });
    await session.executeCommand('enterRestaurant', { restaurantId: 'restaurant:development-restaurant' });
    renderer.render(session.getState());
    assert.equal(session.getState().model?.context, 'RESTAURANT');

    // Left exit door (x = 58)
    renderer.setPlayerVisualX(60);
    prompt = renderer.getActiveProximityPrompt();
    assert.ok(prompt, 'Expected active prompt near restaurant exit door');
    assert.equal(prompt.action, 'exitRestaurant');

    // Social interaction with NPC (x = 464)
    renderer.setPlayerVisualX(464);
    prompt = renderer.getActiveProximityPrompt();
    assert.ok(prompt, 'Expected active prompt near NPC');
    assert.ok(
      prompt.action === 'introduceAgent' || prompt.action === 'greetAgent',
      `Prompt action was ${prompt.action}`
    );

    // Service counter (x >= 520)
    renderer.setPlayerVisualX(560);
    prompt = renderer.getActiveProximityPrompt();
    assert.ok(prompt, 'Expected active prompt near service counter');
    assert.ok(
      prompt.action === 'inquireRestaurantService' || prompt.action === 'placeOrder',
      `Prompt action was ${prompt.action}`
    );
  });

  // =========================================================================
  // Test 3: InputController Dispatches Command on [E] / Enter
  // =========================================================================
  test('Test 3 — InputController: pressing E dispatches authoritative command when prompt is active', async () => {
    const { apiClient, session } = await createInitializedSession();

    const renderer = new WorldRenderer();
    const input = new InputController(session, renderer);
    session.subscribe((state) => renderer.render(state));

    // Player starts in building:development-building
    assert.equal(session.getState().model?.locationId, 'building:development-building');

    // Walk to street exit door
    renderer.setPlayerVisualX(85);
    const prompt = renderer.getActiveProximityPrompt();
    assert.ok(prompt);
    assert.equal(prompt.action, 'leaveBuilding');

    // Press 'KeyE' via InputController
    input.handleKeyDown('KeyE');

    // Wait for command round-trip
    for (let i = 0; i < 40; i++) {
      if (session.getState().model?.locationId === 'street:development-street') break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    // Player should now authoritatively be on Development Street
    assert.equal(session.getState().model?.locationId, 'street:development-street');
    assert.equal(session.getState().model?.context, 'STREET');
  });

  // =========================================================================
  // Test 4: Location Transition Anchor Reconciliation
  // =========================================================================
  test('Test 4 — Anchor Reconciliation: transitions place player at deterministic entry anchors', async () => {
    const { apiClient, session } = await createInitializedSession();

    const renderer = new WorldRenderer();
    session.subscribe((state) => renderer.render(state));

    // Start in building
    assert.equal(session.getState().model?.context, 'BUILDING');

    // Exit to street
    await session.executeCommand('leaveBuilding');
    // On street, exiting building places player at building doorway x = 298
    assert.equal(renderer.getPlayerVisualState().x, 298);

    // Enter building
    await session.executeCommand('enterBuilding', { buildingId: 'building:development-building' });
    // Inside building lobby from street door, player is at x = 110, facing right
    assert.equal(renderer.getPlayerVisualState().x, 110);
    assert.equal(renderer.getPlayerVisualState().facing, 'right');

    // Enter restaurant
    await session.executeCommand('enterRestaurant', { restaurantId: 'restaurant:development-restaurant' });
    // Inside restaurant from lobby door, player is at x = 100, facing right
    assert.equal(renderer.getPlayerVisualState().x, 100);
    assert.equal(renderer.getPlayerVisualState().facing, 'right');

    // Exit restaurant back to building
    await session.executeCommand('exitRestaurant');
    // In building lobby exiting from restaurant portal, player is at x = 660, facing left
    assert.equal(renderer.getPlayerVisualState().x, 660);
    assert.equal(renderer.getPlayerVisualState().facing, 'left');
  });

  // =========================================================================
  // Test 5: Rejection Handling Keeps Player Position and Exposes Error
  // =========================================================================
  test('Test 5 — Rejection Handling: domain rejection does not advance location or move player', async () => {
    const { apiClient, session } = await createInitializedSession();

    const renderer = new WorldRenderer();
    session.subscribe((state) => renderer.render(state));

    // Set player position in building lobby
    renderer.setPlayerVisualX(500);
    const beforeX = renderer.getPlayerVisualState().x;
    const beforeLocation = session.getState().model?.locationId;

    // Dispatch invalid command
    const success = await session.executeCommand('enterBuilding', {
      buildingId: 'building:non-existent',
    });
    assert.equal(success, false);

    const state = session.getState();
    assert.equal(state.status, 'DOMAIN_ERROR');
    assert.ok(state.errorMessage);
    assert.equal(state.model?.locationId, beforeLocation);

    // Player position remains unchanged
    assert.equal(renderer.getPlayerVisualState().x, beforeX);
  });

  // =========================================================================
  // Test 6: Hard Reload / Rehydration Preserves Server Authority
  // =========================================================================
  test('Test 6 — Rehydration: page reload reconstructs state purely from authoritative world projection', async () => {
    const { apiClient, session: session1 } = await createInitializedSession();

    // Navigate to restaurant
    await session1.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });
    assert.equal(session1.getState().model?.locationId, 'restaurant:development-restaurant');

    // Simulate complete reload with fresh session and renderer
    const session2 = new ClientSession(apiClient);
    const renderer2 = new WorldRenderer();
    session2.subscribe((state) => renderer2.render(state));

    const connected = await session2.init();
    assert.equal(connected, true);

    const state2 = session2.getState();
    assert.equal(state2.status, 'READY');
    assert.equal(state2.model?.locationId, 'restaurant:development-restaurant');
    assert.equal(state2.model?.context, 'RESTAURANT');

    // Anchor reconciled to restaurant floor
    assert.equal(renderer2.getPlayerVisualState().y, 319);
  });

  // =========================================================================
  // Test 7: Complete Playable Slice Walkthrough Loop
  // =========================================================================
  test('Test 7 — Complete Playable Slice: full traversal loop through Street -> Building -> Restaurant -> Street', async () => {
    const { apiClient, session } = await createInitializedSession();

    const renderer = new WorldRenderer();
    const input = new InputController(session, renderer);
    session.subscribe((state) => renderer.render(state));

    // 1. Move to Development Street
    await session.executeCommand('leaveBuilding');
    assert.equal(session.getState().model?.locationId, 'street:development-street');

    // 2. Walk to building entrance on Street
    renderer.setPlayerVisualX(298);
    assert.equal(renderer.getActiveProximityPrompt()?.action, 'enterBuilding');
    input.handleKeyDown('KeyE');
    for (let i = 0; i < 40; i++) {
      if (session.getState().model?.locationId === 'building:development-building') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(session.getState().model?.locationId, 'building:development-building');

    // 3. Walk through Building lobby toward Restaurant portal
    renderer.setPlayerVisualX(715);
    assert.equal(renderer.getActiveProximityPrompt()?.action, 'enterRestaurant');
    input.handleKeyDown('KeyE');
    for (let i = 0; i < 40; i++) {
      if (session.getState().model?.locationId === 'restaurant:development-restaurant') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(session.getState().model?.locationId, 'restaurant:development-restaurant');

    // 4. Approach NPC in restaurant
    renderer.setPlayerVisualX(450);
    const socialPrompt = renderer.getActiveProximityPrompt();
    assert.ok(socialPrompt);
    assert.ok(
      socialPrompt.action === 'introduceAgent' || socialPrompt.action === 'greetAgent'
    );

    // 4b. Approach service counter
    renderer.setPlayerVisualX(560);
    const counterPrompt = renderer.getActiveProximityPrompt();
    assert.ok(counterPrompt);
    assert.ok(
      counterPrompt.action === 'inquireRestaurantService' || counterPrompt.action === 'placeOrder'
    );

    // 5. Walk toward exit door in restaurant
    renderer.setPlayerVisualX(58);
    assert.equal(renderer.getActiveProximityPrompt()?.action, 'exitRestaurant');
    input.handleKeyDown('KeyE');
    for (let i = 0; i < 40; i++) {
      if (session.getState().model?.locationId === 'building:development-building') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(session.getState().model?.locationId, 'building:development-building');

    // 6. Walk to street exit door in building lobby
    renderer.setPlayerVisualX(82);
    assert.equal(renderer.getActiveProximityPrompt()?.action, 'leaveBuilding');
    input.handleKeyDown('KeyE');
    for (let i = 0; i < 40; i++) {
      if (session.getState().model?.locationId === 'street:development-street') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(session.getState().model?.locationId, 'street:development-street');
  });
});
