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

describe('Milestone 54: In-World Social Interaction & Dialogue Bubbles', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let controller: WorldSessionController;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `m54-social-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
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

  // =========================================================================
  // Test 1: Proximity Prompt for Unacquainted NPC
  // =========================================================================
  test('Test 1 — Visual Social Proximity: approaching unacquainted NPC surfaces [E] Introduce to <name> prompt; moving away clears prompt', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const renderer = new WorldRenderer();
    session.subscribe((state) => renderer.render(state));

    // Navigate to restaurant where Development NPC is located
    await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });
    assert.equal(session.getState().model?.locationId, 'restaurant:development-restaurant');

    // Confirm NPC is present and unacquainted
    const npc = session.getState().model?.agents.find((a) => a.id === 'agent:dev-npc');
    assert.ok(npc, 'Expected agent:dev-npc to be present');
    assert.equal(npc.isAcquainted, false, 'NPC should initially be unacquainted');

    // NPC visual position in restaurant is at x = 464
    const npcPos = renderer.getAgentVisualPosition(session.getState().model!, 'agent:dev-npc');
    assert.ok(npcPos);
    assert.equal(npcPos.x, 464);
    assert.equal(npcPos.y, 319);

    // Player at spawn x = 100 (|100 - 464| = 364 > 55) -> Exit prompt, not social
    assert.notEqual(renderer.getActiveProximityPrompt()?.action, 'introduceAgent');

    // Approach NPC: move to x = 450 (|450 - 464| = 14 <= 55)
    renderer.setPlayerVisualX(450);
    const prompt = renderer.getActiveProximityPrompt();
    assert.ok(prompt, 'Expected active prompt near NPC');
    assert.equal(prompt.action, 'introduceAgent');
    assert.equal(prompt.label, `[E] Introduce to ${npc.name}`);
    assert.equal(prompt.payload.targetAgentId, 'agent:dev-npc');

    // Move away from NPC to x = 300 (|300 - 464| = 164 > 55)
    renderer.setPlayerVisualX(300);
    assert.equal(renderer.getActiveProximityPrompt(), null, 'Prompt should clear when moving away');
  });

  // =========================================================================
  // Test 2: Authoritative Introduction Dispatch & Acquaintance Reconciliation
  // =========================================================================
  test('Test 2 — Authoritative Introduction: pressing KeyE dispatches introduceAgent, establishes acquaintance, and updates prompt to Greet', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const renderer = new WorldRenderer();
    const input = new InputController(session, renderer);
    session.subscribe((state) => renderer.render(state));

    await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });

    // Approach NPC
    renderer.setPlayerVisualX(450);
    assert.equal(renderer.getActiveProximityPrompt()?.action, 'introduceAgent');

    // Press KeyE
    input.handleKeyDown('KeyE');
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Verify acquaintance is established in authoritative presentation model
    const state = session.getState();
    const updatedNpc = state.model?.agents.find((a) => a.id === 'agent:dev-npc');
    assert.ok(updatedNpc);
    assert.equal(updatedNpc.isAcquainted, true, 'NPC should now be acquainted');

    // Proximity prompt should automatically update to [E] Greet Development NPC
    const updatedPrompt = renderer.getActiveProximityPrompt();
    assert.ok(updatedPrompt);
    assert.equal(updatedPrompt.action, 'greetAgent');
    assert.equal(updatedPrompt.label, `[E] Greet ${updatedNpc.name}`);
    assert.equal(updatedPrompt.payload.targetAgentId, 'agent:dev-npc');
  });

  // =========================================================================
  // Test 3: In-Canvas Speech Bubble Display with Authoritative Server Dialogue
  // =========================================================================
  test('Test 3 — In-Canvas Speech Bubble: authoritative server response is surfaced in dialogue bubble with speaker position and timeout', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const renderer = new WorldRenderer();
    session.subscribe((state) => renderer.render(state));

    await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });

    // Execute introduceAgent
    await session.executeCommand('introduceAgent', { targetAgentId: 'agent:dev-npc' });

    // Verify session dialogue response
    const state = session.getState();
    assert.ok(state.dialogueResponse);
    assert.equal(state.dialogueResponse.speakerAgentId, 'agent:dev-npc');
    assert.ok(
      state.dialogueResponse.text.includes("Pleased to meet you! I'm Development NPC"),
      `Expected greeting text, received: ${state.dialogueResponse.text}`
    );

    // Verify WorldRenderer speech bubble
    const bubble = renderer.getActiveDialogueBubble();
    assert.ok(bubble, 'Expected active dialogue bubble on renderer');
    assert.equal(bubble.agentId, 'agent:dev-npc');
    assert.equal(bubble.speakerX, 464);
    assert.equal(bubble.speakerY, 319);
    assert.equal(bubble.text, state.dialogueResponse.text);
    assert.ok(bubble.expiresAt > performance.now());
  });

  // =========================================================================
  // Test 4: Acquainted Greeting Dispatch and Bubble Update
  // =========================================================================
  test('Test 4 — Authoritative Greeting: pressing KeyE when acquainted dispatches greetAgent and surfaces greeting speech bubble', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const renderer = new WorldRenderer();
    const input = new InputController(session, renderer);
    session.subscribe((state) => renderer.render(state));

    await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });

    // First introduce
    await session.executeCommand('introduceAgent', { targetAgentId: 'agent:dev-npc' });

    // Stand in front of acquainted NPC
    renderer.setPlayerVisualX(460);
    assert.equal(renderer.getActiveProximityPrompt()?.action, 'greetAgent');

    // Press KeyE to greet
    input.handleKeyDown('KeyE');
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Verify new greeting response
    const state = session.getState();
    assert.ok(state.dialogueResponse);
    assert.equal(state.dialogueResponse.speakerAgentId, 'agent:dev-npc');
    assert.ok(
      state.dialogueResponse.text.includes('Welcome back. Good to see you again.'),
      `Expected return greeting, received: ${state.dialogueResponse.text}`
    );

    // Verify speech bubble updated with greeting text
    const bubble = renderer.getActiveDialogueBubble();
    assert.ok(bubble);
    assert.equal(bubble.text, state.dialogueResponse.text);
  });

  // =========================================================================
  // Test 5: Mutual Visual Facing
  // =========================================================================
  test('Test 5 — Mutual Visual Facing: avatars orient toward each other during proximity and dialogue', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const renderer = new WorldRenderer();
    session.subscribe((state) => renderer.render(state));

    await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });

    // Approach from left: x = 420 (< 464) -> player faces right
    renderer.setPlayerVisualX(420);
    renderer.showDialogueBubble('agent:dev-npc', 'Hello from the NPC');
    assert.equal(renderer.getPlayerVisualState().facing, 'right');

    // Approach from right: x = 500 (> 464) -> player faces left
    renderer.setPlayerVisualX(500);
    renderer.showDialogueBubble('agent:dev-npc', 'Hello again');
    assert.equal(renderer.getPlayerVisualState().facing, 'left');
  });

  // =========================================================================
  // Test 6: Distance Dismissal & Expiration of Speech Bubble
  // =========================================================================
  test('Test 6 — Distance Dismissal & Expiration: speech bubble clears when walking away (> 80px) or timing out', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const renderer = new WorldRenderer();
    session.subscribe((state) => renderer.render(state));

    await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });

    // Display bubble with speaker at x = 464, player at x = 450 (|450 - 464| = 14 <= 80)
    renderer.setPlayerVisualX(450);
    renderer.showDialogueBubble('agent:dev-npc', 'Persistent text until walk away');
    assert.ok(renderer.getActiveDialogueBubble());

    // Update with dt while nearby -> bubble remains
    renderer.updateVisualState(16);
    assert.ok(renderer.getActiveDialogueBubble(), 'Bubble should remain when player is nearby');

    // Move player far away: x = 350 (|350 - 464| = 114 > 80)
    renderer.setPlayerVisualX(350);
    renderer.updateVisualState(16);
    assert.equal(
      renderer.getActiveDialogueBubble(),
      null,
      'Bubble should be dismissed when player walks > 80px away'
    );

    // Test timeout expiration
    renderer.setPlayerVisualX(450);
    renderer.showDialogueBubble('agent:dev-npc', 'Short message', 30);
    assert.ok(renderer.getActiveDialogueBubble());
    await new Promise((resolve) => setTimeout(resolve, 40));
    renderer.updateVisualState(16);
    assert.equal(
      renderer.getActiveDialogueBubble(),
      null,
      'Bubble should expire when duration passes'
    );
  });

  // =========================================================================
  // Test 7: Street Traversal Parameter Mismatch Fix
  // =========================================================================
  test('Test 7 — Street Traversal Fix: targetStreetId allows player to walk to Avenida Juárez via proximity prompt', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    const renderer = new WorldRenderer();
    const input = new InputController(session, renderer);
    session.subscribe((state) => renderer.render(state));

    // Player starts in building; exit to Development Street
    await session.executeCommand('leaveBuilding');
    assert.equal(session.getState().model?.locationId, 'street:development-street');

    // Walk to western street exit (x <= 75)
    renderer.setPlayerVisualX(50);
    const streetPrompt = renderer.getActiveProximityPrompt();
    assert.ok(streetPrompt, 'Expected street traversal prompt at west boundary');
    assert.equal(streetPrompt.action, 'traverseStreet');
    assert.equal(streetPrompt.payload.targetStreetId, 'street:avenida-juarez');
    assert.equal(streetPrompt.label, '[E] Walk to Avenida Juárez');

    // Press KeyE
    input.handleKeyDown('KeyE');
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Verify traversal succeeded
    assert.equal(session.getState().model?.locationId, 'street:avenida-juarez');
    assert.equal(session.getState().model?.locationName, 'Avenida Juárez');
  });
});
