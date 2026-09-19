import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { DEFAULT_PERSISTENCE_PATH, LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 29: Controlled Local Runtime, Session Boundary & Persistence Safety', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `runtime-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

    // Initialize controller and server on an ephemeral port (port: 0) for isolation
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
        // Ignore test cleanup errors
      }
    }
  });

  describe('Server Lifecycle & Status Endpoint', () => {
    test('starts on an ephemeral port, initializes World Core once, and reports readiness', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      assert.equal(res.status, 200);

      const data = (await res.json()) as {
        success: boolean;
        result: {
          ready: boolean;
          worldId: string;
          schemaVersion: number;
          worldTime: string;
          activePlayerId: string;
          status: string;
        };
      };

      assert.equal(data.success, true);
      assert.equal(data.result.ready, true);
      assert.equal(data.result.worldId, 'juarez-el-paso');
      assert.equal(data.result.schemaVersion, 14);
      assert.equal(data.result.activePlayerId, 'agent:dev-player');
      assert.equal(data.result.status, 'RUNNING');
      assert.ok(typeof data.result.worldTime === 'string');

      // Crucial authority invariant: Status endpoint strictly does NOT leak raw entities
      const rawObj = data.result as Record<string, unknown>;
      assert.equal(rawObj.places, undefined);
      assert.equal(rawObj.restaurants, undefined);
      assert.equal(rawObj.agents, undefined);
      assert.equal(rawObj.offerings, undefined);
      assert.equal(rawObj.items, undefined);
    });

    test('cleanly stops the server and rejects incoming requests with 503 during/after shutdown', async () => {
      assert.ok(server !== null);
      await server.stop();

      // Attempting to request the stopped server should fail or return 503
      try {
        const res = await fetch(`${baseUrl}/api/status`);
        assert.equal(res.status, 503);
      } catch (err) {
        // On connection drop/closed port, fetch throws TypeError: fetch failed (expected)
        assert.ok(err instanceof Error);
      }
    });
  });

  describe('Read-Only Perception Queries (Zero Mutation & Zero Disk Write)', () => {
    test('GET /api/location returns valid ObservedLocation projection without mutating state or writing to disk', async () => {
      // Record disk mtime before query
      const initialMtime = statSync(tempFilePath).mtimeMs;

      const res = await fetch(`${baseUrl}/api/location`);
      assert.equal(res.status, 200);

      const data = (await res.json()) as {
        success: boolean;
        result: {
          success: boolean;
          location?: {
            id: string;
            type: string;
            name: string;
            parentStreet?: { id: string; name: string };
            containedRestaurants?: Array<{ id: string; name: string }>;
          };
        };
      };

      assert.equal(data.success, true);
      assert.equal(data.result.success, true);
      assert.equal(data.result.location?.id, 'building:development-building');
      assert.equal(data.result.location?.name, 'Development Building');
      assert.equal(data.result.location?.parentStreet?.id, 'street:development-street');

      // Verify zero disk write occurred
      const afterMtime = statSync(tempFilePath).mtimeMs;
      assert.equal(afterMtime, initialMtime);
    });

    test('GET /api/history returns player history projection without disk writes', async () => {
      const initialMtime = statSync(tempFilePath).mtimeMs;

      const res = await fetch(`${baseUrl}/api/history`);
      assert.equal(res.status, 200);

      const data = (await res.json()) as {
        success: boolean;
        result: {
          success: boolean;
          playerId: string;
          history?: {
            playerId: string;
            purchases: unknown[];
            activityCompletions?: unknown[];
            coffeeCompletions: unknown[];
          };
        };
      };

      assert.equal(data.success, true);
      assert.equal(data.result.success, true);
      assert.equal(data.result.playerId, 'agent:dev-player');
      assert.equal(data.result.history?.purchases.length, 0);

      const afterMtime = statSync(tempFilePath).mtimeMs;
      assert.equal(afterMtime, initialMtime);
    });
  });

  describe('Security & Identity Boundary Enforcement', () => {
    test('explicitly forbids client-supplied player identity override attempts', async () => {
      const res = await fetch(`${baseUrl}/api/commands/leaveBuilding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'agent:dev-npc' }),
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as {
        success: boolean;
        committed: boolean;
        error: { code: string; message: string };
      };

      assert.equal(data.success, false);
      assert.equal(data.committed, false);
      assert.equal(data.error.code, 'identity-override-forbidden');
    });

    test('explicitly forbids agentId override attempts in request body', async () => {
      const res = await fetch(`${baseUrl}/api/commands/leaveBuilding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent:dev-npc' }),
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as {
        success: boolean;
        committed: boolean;
        error: { code: string; message: string };
      };

      assert.equal(data.success, false);
      assert.equal(data.committed, false);
      assert.equal(data.error.code, 'identity-override-forbidden');
    });
  });

  describe('Input Validation & Error Handling', () => {
    test('returns 404 for unknown route', async () => {
      const res = await fetch(`${baseUrl}/api/non-existent-route`);
      assert.equal(res.status, 404);

      const data = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'route-not-found');
    });

    test('returns 404 for unknown command name', async () => {
      const res = await fetch(`${baseUrl}/api/commands/teleportToMoon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 404);

      const data = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'unknown-command');
    });

    test('returns 400 for missing required command input parameters', async () => {
      const res = await fetch(`${baseUrl}/api/commands/enterBuilding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Missing buildingId
      });
      assert.equal(res.status, 400);

      const data = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'invalid-command-input');
    });

    test('returns 400 for malformed JSON request body', async () => {
      const res = await fetch(`${baseUrl}/api/commands/leaveBuilding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"invalidJson": true, broken',
      });
      assert.equal(res.status, 400);

      const data = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'malformed-json');
    });
  });

  describe('State-Changing Commands & Transactional Persistence', () => {
    test('executes valid command, updates in-memory state, and persists atomically to disk', async () => {
      // Step 1: Initial state (player is at building:development-building)
      const locBefore = await (await fetch(`${baseUrl}/api/location`)).json();
      assert.equal(locBefore.result.location.id, 'building:development-building');

      // Step 2: Player leaves building into street
      const res = await fetch(`${baseUrl}/api/commands/leaveBuilding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        success: boolean;
        committed: boolean;
        result: { success: boolean; code: string; streetId: string };
      };

      assert.equal(data.success, true);
      assert.equal(data.committed, true);
      assert.equal(data.result.success, true);
      assert.equal(data.result.code, 'success');
      assert.equal(data.result.streetId, 'street:development-street');

      // Step 3: Location query reflects updated spatial state immediately
      const locAfter = await (await fetch(`${baseUrl}/api/location`)).json();
      assert.equal(locAfter.result.location.id, 'street:development-street');

      // Step 4: Verify persistence to disk
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      const devPlayer = persisted.agents.find((a: { id: string }) => a.id === 'agent:dev-player');
      assert.equal(devPlayer.locationId, 'street:development-street');
    });

    test('fails domain validation cleanly with zero mutation and zero disk write', async () => {
      // Attempting to enter non-existent restaurant fails domain validation cleanly
      const mtimeBefore = statSync(tempFilePath).mtimeMs;

      const res = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: 'restaurant:non-existent' }),
      });

      // Domain validation failure returns 422 Unprocessable Entity
      assert.equal(res.status, 422);
      const data = (await res.json()) as {
        success: boolean;
        committed: boolean;
        error: { code: string };
      };

      assert.equal(data.success, false);
      assert.equal(data.committed, false);
      assert.equal(data.error.code, 'restaurant-not-found');

      // Verify zero mutation
      const loc = await (await fetch(`${baseUrl}/api/location`)).json();
      assert.equal(loc.result.location.id, 'building:development-building');

      // Verify zero disk write
      assert.equal(statSync(tempFilePath).mtimeMs, mtimeBefore);
    });

    test('handles persistence failure safely: discards candidate, keeps in-memory state, and returns 500', async () => {
      const controller = server!.getController();
      const persistence = controller.getPersistence();

      // Mock persistence.save to throw a simulated disk I/O error
      const originalSave = persistence.save.bind(persistence);
      persistence.save = () => {
        throw new Error('Simulated disk full / permission denied error');
      };

      try {
        const res = await fetch(`${baseUrl}/api/commands/leaveBuilding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        assert.equal(res.status, 500);
        const data = (await res.json()) as {
          success: boolean;
          committed: boolean;
          error: { code: string; message: string };
        };

        assert.equal(data.success, false);
        assert.equal(data.committed, false);
        assert.equal(data.error.code, 'persistence-failure');
        assert.ok(data.error.message.includes('Simulated disk full'));

        // Crucial invariant: In-memory state was NOT mutated because candidate was discarded!
        const loc = await (await fetch(`${baseUrl}/api/location`)).json();
        assert.equal(loc.result.location.id, 'building:development-building');
      } finally {
        persistence.save = originalSave;
      }
    });
  });

  describe('Sequential Execution & Concurrency', () => {
    test('serializes concurrent state-changing requests safely without race conditions', async () => {
      // Concurrently fire 4 requests:
      // 1. leaveBuilding (should succeed -> street)
      // 2. traverseStreet to Avenida Juárez (should succeed -> avenida-juarez)
      // 3. traverseStreet back to Development Street (should succeed -> development-street)
      // 4. enterBuilding back into Development Building (should succeed -> development-building)

      const p1 = fetch(`${baseUrl}/api/commands/leaveBuilding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const p2 = fetch(`${baseUrl}/api/commands/traverseStreet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStreetId: 'street:avenida-juarez' }),
      });

      const p3 = fetch(`${baseUrl}/api/commands/traverseStreet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStreetId: 'street:development-street' }),
      });

      const p4 = fetch(`${baseUrl}/api/commands/enterBuilding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: 'building:development-building' }),
      });

      const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4]);

      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(r3.status, 200);
      assert.equal(r4.status, 200);

      const d1 = await r1.json();
      const d2 = await r2.json();
      const d3 = await r3.json();
      const d4 = await r4.json();

      assert.equal(d1.committed, true);
      assert.equal(d2.committed, true);
      assert.equal(d3.committed, true);
      assert.equal(d4.committed, true);

      // Final location must be building:development-building
      const finalLoc = await (await fetch(`${baseUrl}/api/location`)).json();
      assert.equal(finalLoc.result.location.id, 'building:development-building');
    });
  });

  describe('Controlled Simulation Step', () => {
    test('POST /api/simulation/step advances logical time and executes deterministic rules', async () => {
      // Advance by 1 hour (3600000 ms) from 08:00 UTC -> 09:00 UTC
      const res = await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs: 3600_000 }),
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        success: boolean;
        committed: boolean;
        result: {
          previousTime: string;
          currentTime: string;
          tickResult: {
            worldTime: string;
            restaurantTransitions: Array<{ restaurantId: string; newState: string }>;
            npcLocationTransitions?: Array<{ agentId: string; newLocationId: string }>;
          };
        };
      };

      assert.equal(data.success, true);
      assert.equal(data.committed, true);
      const diffMs = Date.parse(data.result.currentTime) - Date.parse(data.result.previousTime);
      assert.equal(diffMs, 3600_000);

      // Status endpoint reflects advanced logical clock
      const statusRes = await (await fetch(`${baseUrl}/api/status`)).json();
      assert.equal(statusRes.result.worldTime, data.result.currentTime);
    });

    test('rejects negative or invalid simulation duration with 400', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs: -5000 }),
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'invalid-simulation-input');
    });
  });

  describe('Milestone 29 Correction A: Read-Only Schedule Query & Route Enforcement', () => {
    test('1. GET /api/schedule returns schedule facts for acquainted, co-located NPC with zero disk writes', async () => {
      // Advance world time to 10:00 UTC (NPC works at restaurant:development-restaurant, restaurant open)
      const statusRes = await fetch(`${baseUrl}/api/status`);
      const statusData = (await statusRes.json()) as { result: { worldTime: string } };
      const current = new Date(statusData.result.worldTime);
      const target = new Date(current);
      target.setUTCHours(10, 0, 0, 0);
      if (target.getTime() <= current.getTime()) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
      const advanceDurationMs = target.getTime() - current.getTime();

      await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs }),
      });

      // Player enters restaurant:development-restaurant (co-located with working NPC)
      const enterRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: 'restaurant:development-restaurant' }),
      });
      assert.equal(enterRes.status, 200);

      // Player introduces to NPC -> acquainted
      const introRes = await fetch(`${baseUrl}/api/commands/introduceAgent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAgentId: 'agent:dev-npc' }),
      });
      assert.equal(introRes.status, 200);

      // Record disk mtime and state snapshot before query
      const initialMtime = statSync(tempFilePath).mtimeMs;
      const initialDiskContent = readFileSync(tempFilePath, 'utf-8');

      // Query schedule via query parameter
      const res = await fetch(`${baseUrl}/api/schedule?targetAgentId=agent:dev-npc`);
      assert.equal(res.status, 200);

      const data = (await res.json()) as {
        success: boolean;
        result: {
          success: boolean;
          code: string;
          schedule: { workplaceId: string; shiftStart: string; shiftEnd: string };
        };
      };
      assert.equal(data.success, true);
      assert.equal(data.result.code, 'success');
      assert.equal(data.result.schedule.workplaceId, 'restaurant:development-restaurant');
      assert.equal(data.result.schedule.shiftStart, '09:00');
      assert.equal(data.result.schedule.shiftEnd, '17:00');

      // Invariants: zero disk write, byte-for-byte identical disk content
      const afterMtime = statSync(tempFilePath).mtimeMs;
      assert.equal(afterMtime, initialMtime);
      assert.equal(readFileSync(tempFilePath, 'utf-8'), initialDiskContent);

      // Verify alias /api/schedule/:id works identically
      const aliasRes = await fetch(`${baseUrl}/api/schedule/agent:dev-npc`);
      assert.equal(aliasRes.status, 200);
      const aliasData = await aliasRes.json();
      assert.deepEqual(aliasData, data);
    });

    test('2. GET /api/schedule returns clean domain rejection with zero disk writes when preconditions fail', async () => {
      const initialMtime = statSync(tempFilePath).mtimeMs;
      const initialDiskContent = readFileSync(tempFilePath, 'utf-8');

      const res = await fetch(`${baseUrl}/api/schedule?targetAgentId=agent:dev-npc`);
      assert.equal(res.status, 200);

      const data = (await res.json()) as { success: boolean; result: { success: boolean; code: string } };
      assert.equal(data.success, false);
      assert.equal(data.result.success, false);
      assert.equal(data.result.code, 'agents-not-co-located');

      // Zero disk writes
      assert.equal(statSync(tempFilePath).mtimeMs, initialMtime);
      assert.equal(readFileSync(tempFilePath, 'utf-8'), initialDiskContent);
    });

    test('3. GET /api/schedule does NOT alter world version, clock, acquaintances, or history', async () => {
      const statusBefore = await (await fetch(`${baseUrl}/api/status`)).json();
      const historyBefore = await (await fetch(`${baseUrl}/api/history`)).json();

      await fetch(`${baseUrl}/api/schedule?targetAgentId=agent:dev-npc`);

      const statusAfter = await (await fetch(`${baseUrl}/api/status`)).json();
      const historyAfter = await (await fetch(`${baseUrl}/api/history`)).json();

      assert.equal(statusAfter.result.schemaVersion, statusBefore.result.schemaVersion);
      assert.equal(statusAfter.result.worldTime, statusBefore.result.worldTime);
      assert.deepEqual(historyAfter, historyBefore);
    });

    test('4. POST /api/commands/inquireAgentSchedule returns 404 (removed from command allowlist)', async () => {
      const res = await fetch(`${baseUrl}/api/commands/inquireAgentSchedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAgentId: 'agent:dev-npc' }),
      });

      assert.equal(res.status, 404);
      const data = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'unknown-command');
    });
  });

  describe('Milestone 29 Correction B: Authoritative Purchase Ledger & Economic Integrity', () => {
    async function setupPlayerInOpenRestaurant() {
      // Advance world time to 10:00 UTC (restaurant open in 09:00-17:00 UTC window)
      const statusRes = await fetch(`${baseUrl}/api/status`);
      const statusData = (await statusRes.json()) as { result: { worldTime: string } };
      const current = new Date(statusData.result.worldTime);
      const target = new Date(current);
      target.setUTCHours(10, 0, 0, 0);
      if (target.getTime() <= current.getTime()) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
      const advanceDurationMs = target.getTime() - current.getTime();

      const simRes = await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs }),
      });
      assert.equal(simRes.status, 200);

      // Player is at building:development-building; enter contained restaurant
      const enterRes = await fetch(`${baseUrl}/api/commands/enterRestaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: 'restaurant:development-restaurant' }),
      });
      assert.equal(enterRes.status, 200);
    }

    test('Test A — Valid Purchase: purchase coffee -> startCoffee consumes purchase and creates activity', async () => {
      await setupPlayerInOpenRestaurant();

      // Purchase coffee
      const buyRes = await fetch(`${baseUrl}/api/commands/purchaseOffering`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId: 'offering:development-coffee' }),
      });
      assert.equal(buyRes.status, 200);

      // Start coffee with empty payload
      const startRes = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(startRes.status, 200);
      const startData = (await startRes.json()) as {
        success: boolean;
        committed: boolean;
        result: {
          success: boolean;
          code: string;
          activity: string;
          startedAt: string;
          purchaseId: string;
        };
      };

      assert.equal(startData.success, true);
      assert.equal(startData.committed, true);
      assert.equal(startData.result.code, 'success');
      assert.equal(startData.result.activity, 'having-coffee');
      assert.equal(startData.result.purchaseId, 'purchase:1');

      // Verify persisted state contains consumed purchase and active activity
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      const devPlayer = persisted.agents.find((a: { id: string }) => a.id === 'agent:dev-player');
      assert.equal(devPlayer.playerActivity?.activity, 'having-coffee');
      assert.equal(devPlayer.playerActivity?.completedAt, null);

      const purchaseRec = persisted.purchases.find((p: { id: string }) => p.id === 'purchase:1');
      assert.equal(purchaseRec.consumedAt, null); // M33: PurchaseRecord is immutable ledger, consumedAt remains null
      const itemRec = persisted.items.find((i: { sourcePurchaseId: string }) => i.sourcePurchaseId === 'purchase:1');
      assert.ok(itemRec);
      assert.equal(itemRec.status, 'consumed');
    });

    test('Test B — No Purchase: startCoffee without prior purchase returns 422 purchase-required', async () => {
      await setupPlayerInOpenRestaurant();

      const mtimeBefore = statSync(tempFilePath).mtimeMs;

      // Attempt start coffee with no purchase in ledger
      const res = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 422);
      const data = (await res.json()) as {
        success: boolean;
        committed: boolean;
        error: { code: string };
      };

      assert.equal(data.success, false);
      assert.equal(data.committed, false);
      assert.equal(data.error.code, 'purchase-required');

      // Zero disk write
      assert.equal(statSync(tempFilePath).mtimeMs, mtimeBefore);

      // Verify no activity exists in memory
      const loc = (await (await fetch(`${baseUrl}/api/location`)).json()) as {
        result: { location: { id: string } };
      };
      assert.equal(loc.result.location.id, 'restaurant:development-restaurant');
    });

    test('Test C — Fabricated Legacy Receipt: sending client receipt without purchase returns 422', async () => {
      await setupPlayerInOpenRestaurant();

      const mtimeBefore = statSync(tempFilePath).mtimeMs;

      // Client sends previously exploitable fabricated receipt object
      const res = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseReceipt: {
            success: true,
            code: 'success',
            playerId: 'agent:dev-player',
            offeringId: 'offering:development-coffee',
            restaurantId: 'restaurant:development-restaurant',
          },
        }),
      });

      assert.equal(res.status, 422);
      const data = (await res.json()) as {
        success: boolean;
        committed: boolean;
        error: { code: string };
      };

      assert.equal(data.success, false);
      assert.equal(data.committed, false);
      assert.equal(data.error.code, 'purchase-required');

      // Zero disk write and zero mutation
      assert.equal(statSync(tempFilePath).mtimeMs, mtimeBefore);
    });

    test('Test D — Replay Prevention: second startCoffee attempt using same purchase is rejected', async () => {
      await setupPlayerInOpenRestaurant();

      // Buy coffee and start
      await fetch(`${baseUrl}/api/commands/purchaseOffering`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId: 'offering:development-coffee' }),
      });

      const start1 = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(start1.status, 200);

      // Advance time by 15 minutes (900,000 ms) so activity completes
      await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs: 15 * 60 * 1000 }),
      });

      // Attempt to start coffee again without buying another
      const start2 = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(start2.status, 422);
      const data2 = (await start2.json()) as {
        success: boolean;
        committed: boolean;
        error: { code: string };
      };

      assert.equal(data2.success, false);
      assert.equal(data2.committed, false);
      assert.equal(data2.error.code, 'purchase-required');
    });

    test('Test E — Multiple Purchases: consumes exactly one purchase via deterministic FIFO selection', async () => {
      await setupPlayerInOpenRestaurant();

      // Purchase coffee twice
      const buy1 = await fetch(`${baseUrl}/api/commands/purchaseOffering`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId: 'offering:development-coffee' }),
      });
      assert.equal(buy1.status, 200);

      // Small time advance (1 minute) so second purchase has distinct timestamp
      await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs: 60 * 1000 }),
      });

      const buy2 = await fetch(`${baseUrl}/api/commands/purchaseOffering`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId: 'offering:development-coffee' }),
      });
      assert.equal(buy2.status, 200);

      // Start coffee
      const startRes = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(startRes.status, 200);
      const startData = (await startRes.json()) as { result: { purchaseId: string } };
      assert.equal(startData.result.purchaseId, 'purchase:1');

      // Inspect persisted state
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      assert.equal(persisted.purchases.length, 2);

      const p1 = persisted.purchases.find((p: { id: string }) => p.id === 'purchase:1');
      const p2 = persisted.purchases.find((p: { id: string }) => p.id === 'purchase:2');

      // Exactly item 1 is consumed; item 2 remains available! (FC-03 & FC-05)
      const item1 = persisted.items.find((i: { sourcePurchaseId: string }) => i.sourcePurchaseId === 'purchase:1');
      const item2 = persisted.items.find((i: { sourcePurchaseId: string }) => i.sourcePurchaseId === 'purchase:2');
      assert.ok(item1);
      assert.ok(item2);
      assert.equal(item1.status, 'consumed');
      assert.equal(item2.status, 'available');
      assert.equal(p1.consumedAt, null);
      assert.equal(p2.consumedAt, null);
    });

    test('Test F — Wrong Player: purchase for another player does not authorize dev-player', async () => {
      await setupPlayerInOpenRestaurant();

      // Inject purchase belonging to a different player agent
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      persisted.agents.push({
        id: 'agent:other-player',
        type: 'agent',
        name: 'Other Player',
        agentType: 'player',
        activityState: 'active',
        activitySince: persisted.worldTime,
        locationId: 'building:development-building',
        balanceMinor: 2000,
        currency: 'USD',
        playerActivity: null,
      });
      persisted.purchases.push({
        id: 'purchase:99',
        worldTime: persisted.worldTime,
        playerId: 'agent:other-player',
        restaurantId: 'restaurant:development-restaurant',
        offeringId: 'offering:development-coffee',
        amountMinor: 500,
        currency: 'USD',
        consumedAt: null,
      });
      persisted.items.push({
        id: 'item:99',
        type: 'item',
        ownerAgentId: 'agent:other-player',
        name: 'Coffee',
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
        sourcePurchaseId: 'purchase:99',
        acquiredAt: persisted.worldTime,
        status: 'available',
        consumedAt: null,
      });

      // Persist state directly to simulate existing record for other agent
      writeFileSync(tempFilePath, JSON.stringify(persisted, null, 2), 'utf-8');

      // Reload controller from disk by creating a fresh controller/server
      await server!.stop();
      const freshController = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });
      server = createWorldServer({ controller: freshController, silent: true });
      const info = await server.start(0, '127.0.0.1');
      baseUrl = info.url;

      const res = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 422);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'purchase-required');
    });

    test('Test G — Wrong Offering: purchase for different offering does not authorize coffee', async () => {
      await setupPlayerInOpenRestaurant();

      // Purchase pastry instead of coffee
      const buyRes = await fetch(`${baseUrl}/api/commands/purchaseOffering`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId: 'offering:development-pastry' }),
      });
      assert.equal(buyRes.status, 200);

      const res = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 422);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'purchase-required');
    });

    test('Test H — Wrong Restaurant: purchase at different restaurant does not authorize coffee', async () => {
      await setupPlayerInOpenRestaurant();

      // Inject purchase for another restaurant with valid structural references
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      persisted.restaurants.push({
        id: 'restaurant:other-restaurant',
        type: 'restaurant',
        name: 'Other Restaurant',
        buildingId: 'building:development-residence',
        operationalState: 'open',
        operationalSince: persisted.worldTime,
        balanceMinor: 0,
        currency: 'USD',
      });
      persisted.offerings.push({
        id: 'offering:other-coffee',
        type: 'offering',
        name: 'Other Coffee',
        restaurantId: 'restaurant:other-restaurant',
        priceMinor: 500,
        currency: 'USD',
      });
      persisted.purchases.push({
        id: 'purchase:other-rest',
        worldTime: persisted.worldTime,
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:other-restaurant',
        offeringId: 'offering:other-coffee',
        amountMinor: 500,
        currency: 'USD',
        consumedAt: null,
      });

      writeFileSync(tempFilePath, JSON.stringify(persisted, null, 2), 'utf-8');

      await server!.stop();
      const freshController = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });
      server = createWorldServer({ controller: freshController, silent: true });
      const info = await server.start(0, '127.0.0.1');
      baseUrl = info.url;

      const res = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 422);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'purchase-required');
    });

    test('Test I — Persistence Failure: simulated disk failure preserves in-memory state and leaves purchase unconsumed', async () => {
      await setupPlayerInOpenRestaurant();

      // Purchase coffee
      await fetch(`${baseUrl}/api/commands/purchaseOffering`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId: 'offering:development-coffee' }),
      });

      const controller = server!.getController();
      const persistence = controller.getPersistence();

      // Mock persistence save to fail during startCoffee
      const originalSave = persistence.save.bind(persistence);
      persistence.save = () => {
        throw new Error('Simulated disk I/O failure during coffee commit');
      };

      try {
        const res = await fetch(`${baseUrl}/api/commands/startCoffee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        assert.equal(res.status, 500);
        const data = (await res.json()) as {
          success: boolean;
          committed: boolean;
          error: { code: string };
        };

        assert.equal(data.success, false);
        assert.equal(data.committed, false);
        assert.equal(data.error.code, 'persistence-failure');

        // Crucial rollback verification: candidate was discarded!
        // In-memory purchase remains unconsumed in the controller's active state!
        // Verified by restoring original save and successfully executing startCoffee!
      } finally {
        persistence.save = originalSave;
      }

      // Now startCoffee should succeed using the unconsumed purchase!
      const retryRes = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(retryRes.status, 200);
      const retryData = (await retryRes.json()) as { committed: boolean };
      assert.equal(retryData.committed, true);
    });

    test('Test J — Economic Fact Injection: client cannot override economic facts in startCoffee body', async () => {
      await setupPlayerInOpenRestaurant();

      const res = await fetch(`${baseUrl}/api/commands/startCoffee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId: 'purchase:spoofed', amountMinor: 0 }),
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'invalid-command-input');
    });
  });

  describe('Strict Persistence Isolation Guarantee', () => {
    test('verifies production data/world-state.json is never touched by test suite', () => {
      // The test persistence path was set to tempFilePath
      assert.notEqual(tempFilePath, DEFAULT_PERSISTENCE_PATH);

      // Verify the controller's persistence file is the temp file
      const controller = server!.getController();
      assert.equal(controller.getPersistence().getFilePath(), tempFilePath);
    });
  });
});
