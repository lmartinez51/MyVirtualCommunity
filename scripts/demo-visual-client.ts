import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorldServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { ApiClient } from '../src/client/api-client.js';
import { ClientSession } from '../src/client/session.js';

console.log('================================================================');
console.log('MILESTONE 30: FIRST VISUAL CLIENT & PRESENTATION SHELL DEMO');
console.log('================================================================\n');

const tempFilePath = join(tmpdir(), `demo-m30-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
console.log(`[STORAGE] Using isolated temporary persistence file: ${tempFilePath}`);

async function runDemo(): Promise<void> {
  const controller = new WorldSessionController({
    persistencePath: tempFilePath,
    silent: true,
  });

  const server = createWorldServer({ controller, silent: true });
  const info = await server.start(0, '127.0.0.1');
  console.log(`\n=== STEP 1: Authoritative M29 Runtime Server Running ===`);
  console.log(`[SERVER] Listening on ${info.url}`);

  try {
    // 2. Initialize Client API & Session
    console.log(`\n=== STEP 2: Connecting Client Session ===`);
    const apiClient = new ApiClient(info.url);
    const session = new ClientSession(apiClient);

    const connected = await session.init();
    assert.equal(connected, true);
    let state = session.getState();
    assert.equal(state.status, 'READY');
    assert.ok(state.model);
    console.log(`[CLIENT] Connected successfully.`);
    console.log(`[CLIENT] Initial Location: ${state.model.locationName} (${state.model.locationId})`);
    console.log(`[CLIENT] Presentation Context: ${state.model.context}`);
    console.log(`[CLIENT] Authoritative World Time: ${state.model.worldTime}`);
    assert.equal(state.model.context, 'BUILDING');

    // Verify building affordances
    console.log(`\n=== STEP 3: Inspecting Building Affordances ===`);
    console.log(`[AFFORDANCES] Available: ${state.model.affordances.map((a) => a.label).join(' | ')}`);
    assert.ok(state.model.affordances.some((a) => a.commandName === 'leaveBuilding'));
    assert.ok(state.model.affordances.some((a) => a.commandName === 'enterRestaurant'));

    // 4. Leave building -> enter street
    console.log(`\n=== STEP 4: Executing Non-Authoritative Intent: leaveBuilding ===`);
    const leaveRes = await session.executeCommand('leaveBuilding', {
      buildingId: 'building:development-building',
    });
    assert.equal(leaveRes, true);
    state = session.getState();
    assert.equal(state.status, 'READY');
    assert.equal(state.model?.context, 'STREET');
    console.log(`[CLIENT] New Location: ${state.model.locationName}`);
    console.log(`[CLIENT] Presentation Context: ${state.model.context}`);
    console.log(`[CLIENT] Accessible Buildings: ${state.model.accessibleBuildings.map((b) => b.name).join(', ')}`);
    console.log(`[CLIENT] Neighboring Streets:  ${state.model.neighboringStreets.map((s) => s.name).join(', ')}`);

    // 5. Re-enter building
    console.log(`\n=== STEP 5: Executing Non-Authoritative Intent: enterBuilding ===`);
    const enterRes = await session.executeCommand('enterBuilding', {
      buildingId: 'building:development-building',
    });
    assert.equal(enterRes, true);
    state = session.getState();
    assert.equal(state.model?.context, 'BUILDING');
    console.log(`[CLIENT] Re-entered building: ${state.model.locationName}`);

    // Advance world time to 10:00 UTC so restaurant is open [09:00, 17:00 UTC)
    const current = new Date(state.model.worldTime);
    const target = new Date(current);
    target.setUTCHours(10, 0, 0, 0);
    if (target.getTime() <= current.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    const advanceDurationMs = target.getTime() - current.getTime();
    await fetch(`${info.url}/api/simulation/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advanceDurationMs }),
    });

    // 6. Enter contained restaurant
    console.log(`\n=== STEP 6: Executing Non-Authoritative Intent: enterRestaurant ===`);
    const restRes = await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });
    assert.equal(restRes, true);
    state = session.getState();
    assert.equal(state.model?.context, 'RESTAURANT');
    console.log(`[CLIENT] Entered restaurant: ${state.model.locationName}`);
    console.log(`[CLIENT] Operational State:  ${state.model.operationalState}`);
    console.log(`[CLIENT] Restaurant Affordances: ${state.model.affordances.map((a) => a.label).join(' | ')}`);

    // 7. Test domain rejection behavior (zero client prediction mutation)
    console.log(`\n=== STEP 7: Testing Domain Rejection Handling ===`);
    const invalidRes = await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:non-existent',
    });
    assert.equal(invalidRes, false);
    state = session.getState();
    assert.equal(state.status, 'DOMAIN_ERROR');
    assert.ok(state.errorMessage);
    console.log(`[CLIENT] Domain error captured: "${state.errorMessage}"`);
    console.log(`[CLIENT] Location preserved unchanged: ${state.model?.locationName}`);
    assert.equal(state.model?.context, 'RESTAURANT');

    // 8. Exit restaurant back to building
    console.log(`\n=== STEP 8: Exiting Restaurant ===`);
    const exitRes = await session.executeCommand('exitRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });
    assert.equal(exitRes, true);
    state = session.getState();
    assert.equal(state.status, 'READY');
    assert.equal(state.model?.context, 'BUILDING');
    console.log(`[CLIENT] Restored context: ${state.model.context}`);

    console.log(`\n================================================================`);
    console.log(`DEMONSTRATION COMPLETE: ALL INVARIANTS VERIFIED`);
    console.log(`================================================================\n`);
  } finally {
    await server.stop();
    if (existsSync(tempFilePath)) {
      unlinkSync(tempFilePath);
    }
  }
}

runDemo().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
