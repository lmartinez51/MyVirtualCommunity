/**
 * Milestone 92: Unity Client Integration Contract Test Suite
 *
 * Validates the server-facing contract consumed by the Unity 3D client:
 * 1. World Hydration Contract (/api/status, /api/location)
 * 2. Spatial Threshold Traversal Contract (enterRestaurant, exitRestaurant)
 * 3. Authoritative Attendant & Service Interaction Contract (requestRestaurantService)
 * 4. NPC AI Cycle & Diagnostics Contract (/api/npc/:agentId/cycle, /api/npc/:agentId/diagnostics)
 * 5. Reconnection & State Reconstruction (server stop -> restart -> hydrate)
 * 6. Non-Authoritative Client Rejection (unauthorized mutations rejected)
 *
 * INVARIANT:
 * Tested independently of the Unity runtime binary (headless Node test runner).
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

import { WorldSessionController } from '../src/server/session-controller.js';
import { createWorldServer } from '../src/server/http-server.js';
import { resetRestaurantServiceState } from '../src/core/world-state.js';

describe('Milestone 92: Unity Client Integration Contract', () => {
  // On-duty shift: 10:00 AM Ciudad Juárez (UTC-6) = 16:00 UTC
  const ON_DUTY_WORLD_TIME = '2026-09-14T16:00:00.000Z';

  beforeEach(() => {
    resetRestaurantServiceState();
  });

  it('validates full Unity client lifecycle: hydration -> entrance -> AI service -> exit -> reconnect', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'unity-contract-'));
    const persistencePath = join(tempDir, 'world-state.json');

    try {
      // 1. Initialize World Core Server
      const controller = new WorldSessionController({
        persistencePath,
        worldSeed: 'gomez-morin',
        initialWorldTime: ON_DUTY_WORLD_TIME,
        silent: true,
      });

      // Advance routine to place Elena on duty inside Wing Spot
      await controller.stepSimulation(1000);

      const server = createWorldServer({ controller, silent: true });
      const info = await server.start(0, '127.0.0.1');

      try {
        // =====================================================================
        // Step 1: Unity World Hydration (/api/status & /api/location)
        // =====================================================================
        const statusRes = await fetch(`${info.url}/api/status`);
        assert.equal(statusRes.status, 200);
        const statusData = await statusRes.json();
        assert.equal(statusData.success, true);
        assert.equal(statusData.result.schemaVersion, 19);
        assert.equal(statusData.result.ready, true);
        assert.equal(statusData.result.activePlayerId, 'agent:gomez-morin-player');
        assert.equal(statusData.result.status, 'RUNNING');

        const locRes1 = await fetch(`${info.url}/api/location`);
        assert.equal(locRes1.status, 200);
        const locData1 = await locRes1.json();
        assert.equal(locData1.success, true);
        assert.equal(locData1.result.location.id, 'street:blvd-gomez-morin');
        assert.ok(locData1.result.temporalContext?.civilTime);
        assert.equal(locData1.result.temporalContext.civilTime.timeZone, 'America/Ciudad_Juarez');
        assert.equal(locData1.result.temporalContext.civilTime.hour, 10);

        // =====================================================================
        // Step 2: Player Enters Wing Spot via Authoritative Threshold
        // =====================================================================
        const enterRes = await fetch(`${info.url}/api/commands/enterRestaurant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId: 'restaurant:wing-spot' }),
        });
        assert.equal(enterRes.status, 200);
        const enterData = await enterRes.json();
        assert.equal(enterData.success, true);

        // Verify Location View inside Wing Spot
        const locRes2 = await fetch(`${info.url}/api/location`);
        const locData2 = await locRes2.json();
        assert.equal(locData2.success, true);
        assert.equal(locData2.result.location.id, 'restaurant:wing-spot');
        assert.equal(locData2.result.location.name, 'Wing Spot Gómez Morín');
        assert.ok(locData2.result.location.attendant);
        assert.equal(locData2.result.location.attendant.id, 'agent:elena-npc');
        assert.equal(locData2.result.location.attendant.name, 'Elena Morales');
        assert.equal(locData2.result.location.attendant.isPresent, true);
        assert.equal(locData2.result.location.attendant.interactionState, 'idle');

        // =====================================================================
        // Step 3: Trigger Elena's AI Cycle & Service Acceptance
        // =====================================================================
        const aiCycleRes = await fetch(`${info.url}/api/npc/agent:elena-npc/cycle`, {
          method: 'POST',
        });
        assert.equal(aiCycleRes.status, 200);
        const aiCycleData = await aiCycleRes.json();
        assert.equal(aiCycleData.success, true);
        assert.equal(aiCycleData.result.status, 'executed');
        assert.equal(aiCycleData.result.proposal.actionType, 'offer_service');
        assert.equal(aiCycleData.result.commandDispatched.commandName, 'requestRestaurantService');
        assert.equal(aiCycleData.result.commandDispatched.success, true);

        // Verify Location View reflects updated interaction state
        const locRes3 = await fetch(`${info.url}/api/location`);
        const locData3 = await locRes3.json();
        assert.equal(locData3.success, true);
        assert.equal(locData3.result.location.attendant.interactionState, 'service-accepted');

        // Check Diagnostics
        const diagRes = await fetch(`${info.url}/api/npc/agent:elena-npc/diagnostics`);
        const diagData = await diagRes.json();
        assert.equal(diagData.success, true);
        assert.equal(diagData.result.agentId, 'agent:elena-npc');
        assert.equal(diagData.result.totalCycles, 1);
        assert.equal(diagData.result.memoriesCount, 1);

        // =====================================================================
        // Step 4: Player Exits Wing Spot back to Boulevard
        // =====================================================================
        const exitRes = await fetch(`${info.url}/api/commands/exitRestaurant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId: 'restaurant:wing-spot' }),
        });
        assert.equal(exitRes.status, 200);
        const exitData = await exitRes.json();
        assert.equal(exitData.success, true);

        const locRes4 = await fetch(`${info.url}/api/location`);
        const locData4 = await locRes4.json();
        assert.equal(locData4.result.location.id, 'street:blvd-gomez-morin');
      } finally {
        await server.stop();
      }

      // =====================================================================
      // Step 5: Reconnection & State Reconstruction
      // =====================================================================
      // Re-initialize a new WorldSessionController from the saved persistence file
      const reconnectedController = new WorldSessionController({
        persistencePath,
        worldSeed: 'gomez-morin',
        silent: true,
      });

      const reconnectedServer = createWorldServer({
        controller: reconnectedController,
        silent: true,
      });
      const reconnectedInfo = await reconnectedServer.start(0, '127.0.0.1');

      try {
        const reconStatusRes = await fetch(`${reconnectedInfo.url}/api/status`);
        const reconStatusData = await reconStatusRes.json();
        assert.equal(reconStatusData.success, true);
        assert.equal(reconStatusData.result.schemaVersion, 19);

        // Player location was persisted at boulevard
        const reconLocRes = await fetch(`${reconnectedInfo.url}/api/location`);
        const reconLocData = await reconLocRes.json();
        assert.equal(reconLocData.success, true);
        assert.equal(reconLocData.result.location.id, 'street:blvd-gomez-morin');
      } finally {
        await reconnectedServer.stop();
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('strictly rejects non-authoritative client mutations and preserves WorldState integrity', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'unity-reject-'));
    const persistencePath = join(tempDir, 'world-state.json');

    try {
      const controller = new WorldSessionController({
        persistencePath,
        worldSeed: 'gomez-morin',
        initialWorldTime: ON_DUTY_WORLD_TIME,
        silent: true,
      });

      const server = createWorldServer({ controller, silent: true });
      const info = await server.start(0, '127.0.0.1');

      try {
        // Client tries to enter non-existent restaurant
        const invalidEnter = await fetch(`${info.url}/api/commands/enterRestaurant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId: 'restaurant:fictional-tacos' }),
        });
        const invalidData = await invalidEnter.json();
        assert.equal(invalidData.success, false);

        // World state remains valid and unchanged at boulevard
        const locRes = await fetch(`${info.url}/api/location`);
        const locData = await locRes.json();
        assert.equal(locData.success, true);
        assert.equal(locData.result.location.id, 'street:blvd-gomez-morin');
      } finally {
        await server.stop();
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
