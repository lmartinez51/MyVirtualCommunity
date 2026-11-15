import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';

describe('Authoritative Business Schedule Endpoint (GET /api/businesses/:businessId/schedule)', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let controller: WorldSessionController;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `schedule-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

    controller = new WorldSessionController({
      persistencePath: tempFilePath,
      silent: true,
      initialWorldTime: '2026-10-24T18:00:00.000Z', // Saturday 12:00 in Ciudad Juárez (America/Ciudad_Juarez is UTC-6)
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

  describe('1. Successful Authoritative Business Schedule Lookup', () => {
    test('returns 200 OK with schedule, timezone, authoritative world time, and operational status for restaurant:wing-spot', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/restaurant:wing-spot/schedule`);
      assert.strictEqual(res.status, 200);

      const data = (await res.json()) as any;
      assert.strictEqual(data.success, true);
      assert.ok(data.result, 'Response must include result payload');

      const result = data.result;
      assert.strictEqual(result.businessId, 'restaurant:wing-spot');
      assert.strictEqual(result.name, 'Wing Spot Gómez Morín');
      assert.strictEqual(result.timeZone, 'America/Ciudad_Juarez');
      assert.strictEqual(result.worldTime, '2026-10-24T18:00:00.000Z');

      // Schedule definition is distinct from operational status
      assert.ok(result.schedule, 'Result must contain schedule definition');
      assert.deepStrictEqual(result.schedule.operatingDays, [1, 2, 3, 4, 5, 6]);
      assert.strictEqual(result.schedule.hours.openHour, 9);
      assert.strictEqual(result.schedule.hours.openMinute, 0);
      assert.strictEqual(result.schedule.hours.closeHour, 18);
      assert.strictEqual(result.schedule.hours.closeMinute, 0);
      assert.strictEqual(result.schedule.lastEntryCutoffMinutes, 15);

      // Operational status evaluated at authoritative world time (Saturday 12:00 local time -> open)
      assert.ok(result.operationalStatus, 'Result must contain operational status');
      assert.strictEqual(result.operationalStatus.status, 'open');
      assert.strictEqual(result.operationalStatus.isOpen, true);
      assert.strictEqual(result.operationalStatus.admissionPermitted, true);
      assert.strictEqual(result.operationalStatus.code, 'permitted');
      assert.strictEqual(result.operationalStatus.openTimeStr, '09:00');
      assert.strictEqual(result.operationalStatus.closingTimeStr, '18:00');
    });

    test('returns 200 OK for restaurant:pasteleria-tia-lupe', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/restaurant:pasteleria-tia-lupe/schedule`);
      assert.strictEqual(res.status, 200);

      const data = (await res.json()) as any;
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.result.businessId, 'restaurant:pasteleria-tia-lupe');
      assert.strictEqual(data.result.name, 'Pastelerías La Tía Lupe');
      assert.strictEqual(data.result.timeZone, 'America/Ciudad_Juarez');
    });

    test('returns 200 OK for pharmacy:farmacias-benavides with 0 lastEntryCutoffMinutes', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/pharmacy:farmacias-benavides/schedule`);
      assert.strictEqual(res.status, 200);

      const data = (await res.json()) as any;
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.result.businessId, 'pharmacy:farmacias-benavides');
      assert.strictEqual(data.result.name, 'Farmacias Benavides');
      assert.strictEqual(data.result.timeZone, 'America/Ciudad_Juarez');
      assert.deepStrictEqual(data.result.schedule.operatingDays, [1, 2, 3, 4, 5, 6]);
      assert.strictEqual(data.result.schedule.hours.openHour, 7);
      assert.strictEqual(data.result.schedule.hours.openMinute, 0);
      assert.strictEqual(data.result.schedule.hours.closeHour, 22);
      assert.strictEqual(data.result.schedule.hours.closeMinute, 0);
      assert.strictEqual(data.result.schedule.lastEntryCutoffMinutes, 0);

      // Operational status evaluated at Saturday 12:00 local time -> open & admitted
      assert.strictEqual(data.result.operationalStatus.status, 'open');
      assert.strictEqual(data.result.operationalStatus.isOpen, true);
      assert.strictEqual(data.result.operationalStatus.admissionPermitted, true);
    });

    test('returns 200 OK for optical:optica-fashion with 0 lastEntryCutoffMinutes', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/optical:optica-fashion/schedule`);
      assert.strictEqual(res.status, 200);

      const data = (await res.json()) as any;
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.result.businessId, 'optical:optica-fashion');
      assert.strictEqual(data.result.name, 'Óptica Fashion');
      assert.strictEqual(data.result.timeZone, 'America/Ciudad_Juarez');
      assert.deepStrictEqual(data.result.schedule.operatingDays, [1, 2, 3, 4, 5, 6]);
      assert.strictEqual(data.result.schedule.hours.openHour, 9);
      assert.strictEqual(data.result.schedule.hours.openMinute, 0);
      assert.strictEqual(data.result.schedule.hours.closeHour, 17);
      assert.strictEqual(data.result.schedule.hours.closeMinute, 0);
      assert.strictEqual(data.result.schedule.lastEntryCutoffMinutes, 0);

      // Operational status evaluated at Saturday 12:00 local time -> open & admitted
      assert.strictEqual(data.result.operationalStatus.status, 'open');
      assert.strictEqual(data.result.operationalStatus.isOpen, true);
      assert.strictEqual(data.result.operationalStatus.admissionPermitted, true);
    });

    test('verifies no restaurant 15-minute cutoff applied to pharmacy:farmacias-benavides', async () => {
      // Saturday 21:50 local (2026-10-25T03:50:00.000Z in UTC-6) is 10 min before 22:00 closing.
      // Unlike a restaurant with 15-min cutoff, pharmacy has 0 cutoff, so status is OPEN and admission is PERMITTED.
      const res = await fetch(
        `${baseUrl}/api/businesses/pharmacy:farmacias-benavides/schedule?at=2026-10-25T03:50:00.000Z`
      );
      assert.strictEqual(res.status, 200);
      const data = (await res.json()) as any;
      assert.strictEqual(data.result.operationalStatus.status, 'open');
      assert.strictEqual(data.result.operationalStatus.admissionPermitted, true);
    });

    test('handles URL-encoded business identifiers correctly', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/restaurant%3Awing-spot/schedule`);
      assert.strictEqual(res.status, 200);

      const data = (await res.json()) as any;
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.result.businessId, 'restaurant:wing-spot');
    });
  });

  describe('2. Point-in-Time Status Evaluation (?at=)', () => {
    test('evaluates status as open during operating hours (Saturday 14:00 local)', async () => {
      // 14:00 local = 20:00 UTC
      const res = await fetch(`${baseUrl}/api/businesses/restaurant:wing-spot/schedule?at=2026-10-24T20:00:00.000Z`);
      assert.strictEqual(res.status, 200);

      const data = (await res.json()) as any;
      assert.strictEqual(data.result.operationalStatus.status, 'open');
      assert.strictEqual(data.result.operationalStatus.isOpen, true);
      assert.strictEqual(data.result.operationalStatus.admissionPermitted, true);
      assert.strictEqual(data.result.worldTime, '2026-10-24T20:00:00.000Z');
    });

    test('evaluates status as closing-soon during cutoff (Saturday 17:50 local)', async () => {
      // 17:50 local = 23:50 UTC (cutoff is 17:45)
      const res = await fetch(`${baseUrl}/api/businesses/restaurant:wing-spot/schedule?at=2026-10-24T23:50:00.000Z`);
      assert.strictEqual(res.status, 200);

      const data = (await res.json()) as any;
      assert.strictEqual(data.result.operationalStatus.status, 'closing-soon');
      assert.strictEqual(data.result.operationalStatus.isOpen, true);
      assert.strictEqual(data.result.operationalStatus.admissionPermitted, false);
      assert.strictEqual(data.result.operationalStatus.code, 'admission-cutoff-reached');
    });

    test('evaluates status as closed after closing hour (Saturday 19:00 local)', async () => {
      // 19:00 local = 2026-10-25T01:00:00.000Z
      const res = await fetch(`${baseUrl}/api/businesses/restaurant:wing-spot/schedule?at=2026-10-25T01:00:00.000Z`);
      assert.strictEqual(res.status, 200);

      const data = (await res.json()) as any;
      assert.strictEqual(data.result.operationalStatus.status, 'closed');
      assert.strictEqual(data.result.operationalStatus.isOpen, false);
      assert.strictEqual(data.result.operationalStatus.admissionPermitted, false);
      assert.strictEqual(data.result.operationalStatus.code, 'business-closed');
    });

    test('evaluates status as closed on Sunday', async () => {
      // Sunday 12:00 local = 18:00 UTC
      const res = await fetch(`${baseUrl}/api/businesses/restaurant:wing-spot/schedule?at=2026-10-25T18:00:00.000Z`);
      assert.strictEqual(res.status, 200);

      const data = (await res.json()) as any;
      assert.strictEqual(data.result.operationalStatus.status, 'closed');
      assert.strictEqual(data.result.operationalStatus.isOpen, false);
      assert.strictEqual(data.result.operationalStatus.admissionPermitted, false);
    });
  });

  describe('3. Unknown Businesses & Malformed Identifiers', () => {
    test('returns 404 business-not-found for unknown business identifier', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/restaurant:non-existent/schedule`);
      assert.strictEqual(res.status, 404);

      const data = (await res.json()) as any;
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.code, 'business-not-found');
      assert.strictEqual(data.error.message, 'Business "restaurant:non-existent" not found');
    });

    test('returns 400 invalid-evaluation-time for invalid timestamp in query parameter', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/restaurant:wing-spot/schedule?at=not-a-valid-date`);
      assert.strictEqual(res.status, 400);

      const data = (await res.json()) as any;
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.code, 'invalid-evaluation-time');
    });
  });

  describe('4. Zero State Mutation & Non-Authoritative Invariant', () => {
    test('querying business schedule does NOT mutate WorldState, advance time, or trigger disk persistence', async () => {
      // Get initial state snapshot
      const initialStatus = controller.getStatus();
      const initialLocation = controller.getLocationView();
      const initialHistory = controller.getHistoryView();
      const initialDiskContent = existsSync(tempFilePath) ? readFileSync(tempFilePath, 'utf-8') : null;

      // Execute read-only schedule queries
      const res1 = await fetch(`${baseUrl}/api/businesses/restaurant:wing-spot/schedule`);
      assert.strictEqual(res1.status, 200);

      const res2 = await fetch(`${baseUrl}/api/businesses/restaurant:pasteleria-tia-lupe/schedule`);
      assert.strictEqual(res2.status, 200);

      const res3 = await fetch(`${baseUrl}/api/businesses/restaurant:unknown/schedule`);
      assert.strictEqual(res3.status, 404);

      // Verify that status, world time, location, history, and persistence remain strictly identical
      const postStatus = controller.getStatus();
      assert.strictEqual(postStatus.worldTime, initialStatus.worldTime);
      assert.strictEqual(postStatus.schemaVersion, initialStatus.schemaVersion);
      assert.strictEqual(postStatus.worldId, initialStatus.worldId);

      const postLocation = controller.getLocationView();
      assert.deepStrictEqual(postLocation, initialLocation);

      const postHistory = controller.getHistoryView();
      assert.deepStrictEqual(postHistory, initialHistory);

      const postDiskContent = existsSync(tempFilePath) ? readFileSync(tempFilePath, 'utf-8') : null;
      assert.strictEqual(postDiskContent, initialDiskContent);
    });
  });
});
