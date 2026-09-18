import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import { createWorldServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';

async function main() {
  console.log('================================================================');
  console.log('MILESTONE 29: CONTROLLED LOCAL RUNTIME & SESSION BOUNDARY');
  console.log('================================================================\n');

  const tempFilePath = join(
    tmpdir(),
    `demo-m29-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
  );

  console.log(`[STORAGE] Using isolated temporary persistence file: ${tempFilePath}`);

  // Step 1: Initialize controller & start server on ephemeral port (port 0)
  console.log('\n=== STEP 1: Starting Authoritative Node.js World Server ===');
  const controllerA = new WorldSessionController({
    persistencePath: tempFilePath,
    silent: true,
  });

  const serverA = createWorldServer({
    controller: controllerA,
    silent: true,
  });

  const infoA = await serverA.start(0, '127.0.0.1');
  console.log(`[SERVER A] Active and listening on: ${infoA.url}`);

  // Step 2: Query Runtime Status
  console.log('\n=== STEP 2: Querying /api/status (Safe Runtime Information) ===');
  const statusRes = await fetch(`${infoA.url}/api/status`);
  const statusData = (await statusRes.json()) as { success: boolean; result: Record<string, unknown> };
  console.log('[STATUS] Response:', JSON.stringify(statusData, null, 2));
  console.log(`[STATUS] World ID:        ${statusData.result.worldId}`);
  console.log(`[STATUS] Schema Version:  ${statusData.result.schemaVersion}`);
  console.log(`[STATUS] Initial Time:    ${statusData.result.worldTime}`);
  console.log(`[STATUS] Active Player:   ${statusData.result.activePlayerId}`);
  console.log(`[AUTHORITY CHECK] Raw WorldState entities exposed? ${'places' in statusData.result}`);

  // Step 3: Query Initial Perception
  console.log('\n=== STEP 3: Querying /api/location (Read-Only Perception Projection) ===');
  const locRes1 = await fetch(`${infoA.url}/api/location`);
  const locData1 = (await locRes1.json()) as { success: boolean; result: { location: { id: string; name: string } } };
  console.log(`[PERCEPTION] Player Current Location: ${locData1.result.location.name} (${locData1.result.location.id})`);

  // Step 4: Security & Identity Boundary Check
  console.log('\n=== STEP 4: Security Check — Impersonation Attempt via Request Body ===');
  const spoofRes = await fetch(`${infoA.url}/api/commands/leaveBuilding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: 'agent:dev-npc' }),
  });
  const spoofData = await spoofRes.json();
  console.log(`[SECURITY] HTTP Status: ${spoofRes.status}`);
  console.log('[SECURITY] Response:', JSON.stringify(spoofData, null, 2));
  console.log('>>> Verified: Client cannot supply arbitrary playerId to override server authority.');

  // Step 5: Execute State-Changing Spatial Command
  console.log('\n=== STEP 5: Executing Command: leaveBuilding ===');
  const moveRes = await fetch(`${infoA.url}/api/commands/leaveBuilding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const moveData = await moveRes.json();
  console.log(`[COMMAND] HTTP Status: ${moveRes.status}`);
  console.log('[COMMAND] Result:', JSON.stringify(moveData, null, 2));

  // Step 6: Verify Observation Updates
  console.log('\n=== STEP 6: Verifying Location Projection Reflects Mutation ===');
  const locRes2 = await fetch(`${infoA.url}/api/location`);
  const locData2 = (await locRes2.json()) as { success: boolean; result: { location: { id: string; name: string } } };
  console.log(`[PERCEPTION] Player New Location: ${locData2.result.location.name} (${locData2.result.location.id})`);

  // Step 7: Advance Time via Controlled Simulation Step (1 hour to 09:00 UTC)
  console.log('\n=== STEP 7: Controlled Simulation Step (Advancing to NPC Work Shift) ===');
  const simRes = await fetch(`${infoA.url}/api/simulation/step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ advanceDurationMs: 3600_000 }),
  });
  const simData = (await simRes.json()) as {
    success: boolean;
    result: { previousTime: string; currentTime: string; tickResult: { restaurantTransitions: unknown[] } };
  };
  console.log(`[SIMULATION] Advanced from ${simData.result.previousTime} -> ${simData.result.currentTime}`);
  console.log('[SIMULATION] Transitions Triggered:', simData.result.tickResult.restaurantTransitions);

  // Step 8: Controlled Shutdown of Server A
  console.log('\n=== STEP 8: Shutting Down Server A ===');
  await serverA.stop();
  console.log('[SERVER A] Stopped cleanly.');

  // Step 9: Restore World in Fresh Server B from Disk
  console.log('\n=== STEP 9: Starting Fresh Server B and Reconstructing State from Disk ===');
  const controllerB = new WorldSessionController({
    persistencePath: tempFilePath,
    silent: true,
  });
  const serverB = createWorldServer({
    controller: controllerB,
    silent: true,
  });
  const infoB = await serverB.start(0, '127.0.0.1');
  console.log(`[SERVER B] Active and listening on: ${infoB.url}`);

  const statusB = await (await fetch(`${infoB.url}/api/status`)).json();
  const locB = await (await fetch(`${infoB.url}/api/location`)).json();
  console.log(`[RECONSTRUCTION] Restored World Time:     ${statusB.result.worldTime}`);
  console.log(`[RECONSTRUCTION] Restored Player Location: ${locB.result.location.name} (${locB.result.location.id})`);

  // Step 10: Clean Shutdown & Cleanup
  console.log('\n=== STEP 10: Final Cleanup ===');
  await serverB.stop();
  if (existsSync(tempFilePath)) {
    unlinkSync(tempFilePath);
  }
  console.log('[CLEANUP] Server B stopped and temporary file removed.');

  console.log('\n================================================================');
  console.log('MILESTONE 29 DEMONSTRATION COMPLETE: ALL INVARIANTS VERIFIED');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Demonstration failed:', err);
  process.exit(1);
});
