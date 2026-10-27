import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveCivilTime,
  resolveLocationTimeZone,
  type CivilTime,
} from '../src/core/civil-time.js';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  CURRENT_WORLD_STATE_VERSION,
  type WorldState,
} from '../src/core/world-state.js';
import type { Place } from '../src/core/entities/geography.js';

describe('Phase C: Civil Time Infrastructure Invariants', () => {
  const DEFAULT_TEST_TIME = '2026-09-24T15:00:00.000Z';

  function createTestWorldState(): WorldState {
    const clock = WorldClock.create(DEFAULT_TEST_TIME);
    return createInitialWorldState(clock);
  }

  // =========================================================================
  // Test A: Basic Conversion
  // =========================================================================
  describe('Test A — Basic Conversion', () => {
    test('projects UTC World Time in America/Ciudad_Juarez to correct local civil components', () => {
      const worldTime = '2026-09-24T15:00:00.000Z';
      const timeZone = 'America/Ciudad_Juarez';

      const civil = deriveCivilTime(worldTime, timeZone);

      assert.strictEqual(civil.year, 2026);
      assert.strictEqual(civil.month, 9);
      assert.strictEqual(civil.day, 24);
      assert.strictEqual(civil.hour, 9);
      assert.strictEqual(civil.minute, 0);
      assert.strictEqual(civil.second, 0);
      assert.strictEqual(civil.millisecond, 0);
      assert.strictEqual(civil.dayOfWeek, 4); // Thursday
      assert.strictEqual(civil.timeZone, 'America/Ciudad_Juarez');
      assert.strictEqual(civil.utcOffsetMinutes, -360);
      assert.strictEqual(civil.isoCivilString, '2026-09-24T09:00:00.000-06:00');
    });
  });

  // =========================================================================
  // Test B: No System Clock Dependency (Purity & Determinism)
  // =========================================================================
  describe('Test B — No System Clock Dependency', () => {
    test('produces identical results invariant to system clock manipulation or repeated execution', () => {
      const worldTime = '2026-09-24T15:00:00.000Z';
      const timeZone = 'America/Ciudad_Juarez';

      const run1 = deriveCivilTime(worldTime, timeZone);

      // Monkey-patch Date.now to an arbitrary distant time
      const originalNow = Date.now;
      try {
        Date.now = () => 0; // 1970-01-01
        const run2 = deriveCivilTime(worldTime, timeZone);

        Date.now = () => 2524608000000; // 2050-01-01
        const run3 = deriveCivilTime(worldTime, timeZone);

        assert.deepStrictEqual(run1, run2);
        assert.deepStrictEqual(run1, run3);
      } finally {
        Date.now = originalNow;
      }
    });
  });

  // =========================================================================
  // Test C: Invalid Timestamp Handling
  // =========================================================================
  describe('Test C — Invalid Timestamp Handling', () => {
    test('throws explicit error on invalid string timestamps', () => {
      assert.throws(
        () => deriveCivilTime('', 'America/Ciudad_Juarez'),
        /empty/i
      );
      assert.throws(
        () => deriveCivilTime('not-a-date', 'America/Ciudad_Juarez'),
        /not a valid date/i
      );
      assert.throws(
        () => deriveCivilTime('2026-13-45T99:99:99Z', 'America/Ciudad_Juarez'),
        /not a valid date/i
      );
    });

    test('throws explicit error on invalid numeric timestamps', () => {
      assert.throws(
        () => deriveCivilTime(NaN, 'America/Ciudad_Juarez'),
        /finite/i
      );
      assert.throws(
        () => deriveCivilTime(Infinity, 'America/Ciudad_Juarez'),
        /finite/i
      );
      assert.throws(
        () => deriveCivilTime(-Infinity, 'America/Ciudad_Juarez'),
        /finite/i
      );
    });

    test('throws explicit error on unsupported argument types', () => {
      assert.throws(
        // @ts-expect-error Testing invalid runtime input
        () => deriveCivilTime(null, 'America/Ciudad_Juarez'),
        /expected string or number/i
      );
      assert.throws(
        // @ts-expect-error Testing invalid runtime input
        () => deriveCivilTime(undefined, 'America/Ciudad_Juarez'),
        /expected string or number/i
      );
    });
  });

  // =========================================================================
  // Test D: Invalid Timezone Handling
  // =========================================================================
  describe('Test D — Invalid Timezone Handling', () => {
    test('throws RangeError or explicit error on unknown or malformed timezones', () => {
      const worldTime = '2026-09-24T15:00:00.000Z';

      assert.throws(
        () => deriveCivilTime(worldTime, 'Invalid/TimeZone'),
        (err: unknown) => err instanceof RangeError || (err instanceof Error && /time zone/i.test(err.message))
      );

      assert.throws(
        () => deriveCivilTime(worldTime, 'Atlantis/Bermuda'),
        (err: unknown) => err instanceof RangeError || (err instanceof Error && /time zone/i.test(err.message))
      );

      assert.throws(
        () => deriveCivilTime(worldTime, ''),
        /must be a non-empty string/i
      );
    });
  });

  // =========================================================================
  // Test E: Leap Day Handling
  // =========================================================================
  describe('Test E — Leap Day Handling', () => {
    test('accurately calculates civil time on February 29th of a leap year', () => {
      const worldTime = '2024-02-29T18:00:00.000Z';
      const timeZone = 'America/Ciudad_Juarez';

      const civil = deriveCivilTime(worldTime, timeZone);

      assert.strictEqual(civil.year, 2024);
      assert.strictEqual(civil.month, 2);
      assert.strictEqual(civil.day, 29);
      assert.strictEqual(civil.hour, 11);
      assert.strictEqual(civil.minute, 0);
      assert.strictEqual(civil.second, 0);
      assert.strictEqual(civil.dayOfWeek, 4); // 2024-02-29 was Thursday
      assert.strictEqual(civil.utcOffsetMinutes, -420);
      assert.strictEqual(civil.isoCivilString, '2024-02-29T11:00:00.000-07:00');
    });
  });

  // =========================================================================
  // Test F: UTC Midnight Boundary
  // =========================================================================
  describe('Test F — UTC Midnight Boundary', () => {
    test('converts UTC post-midnight into previous local civil calendar date', () => {
      // 02:00 UTC on Sept 25 -> 20:00 on Sept 24 in Ciudad Juárez (-6h)
      const worldTime = '2026-09-25T02:00:00.000Z';
      const timeZone = 'America/Ciudad_Juarez';

      const civil = deriveCivilTime(worldTime, timeZone);

      assert.strictEqual(civil.year, 2026);
      assert.strictEqual(civil.month, 9);
      assert.strictEqual(civil.day, 24); // Sept 24, NOT Sept 25
      assert.strictEqual(civil.hour, 20);
      assert.strictEqual(civil.minute, 0);
      assert.strictEqual(civil.second, 0);
      assert.strictEqual(civil.dayOfWeek, 4); // Thursday, NOT Friday
      assert.strictEqual(civil.utcOffsetMinutes, -360);
      assert.strictEqual(civil.isoCivilString, '2026-09-24T20:00:00.000-06:00');
    });
  });

  // =========================================================================
  // Test G: Daylight Saving Time (DST) Transitions
  // =========================================================================
  describe('Test G — Daylight Saving Time Transitions', () => {
    test('adjusts civil offset across daylight saving transitions in observing zones', () => {
      const timeZone = 'America/New_York';

      // Standard time (EST, UTC-5)
      const winterTime = '2026-01-15T12:00:00.000Z';
      const winterCivil = deriveCivilTime(winterTime, timeZone);
      assert.strictEqual(winterCivil.hour, 7);
      assert.strictEqual(winterCivil.utcOffsetMinutes, -300);
      assert.strictEqual(winterCivil.isoCivilString, '2026-01-15T07:00:00.000-05:00');

      // Daylight saving time (EDT, UTC-4)
      const summerTime = '2026-07-15T12:00:00.000Z';
      const summerCivil = deriveCivilTime(summerTime, timeZone);
      assert.strictEqual(summerCivil.hour, 8);
      assert.strictEqual(summerCivil.utcOffsetMinutes, -240);
      assert.strictEqual(summerCivil.isoCivilString, '2026-07-15T08:00:00.000-04:00');
    });

    test('accurately projects America/Ciudad_Juarez across seasonal offsets and DST boundaries', () => {
      const timeZone = 'America/Ciudad_Juarez';

      // 1. Mid-winter (MST, UTC-7)
      const winter = deriveCivilTime('2026-01-15T18:00:00.000Z', timeZone);
      assert.strictEqual(winter.hour, 11);
      assert.strictEqual(winter.utcOffsetMinutes, -420);
      assert.strictEqual(winter.isoCivilString, '2026-01-15T11:00:00.000-07:00');

      // 2. Mid-summer (MDT, UTC-6)
      const summer = deriveCivilTime('2026-07-15T18:00:00.000Z', timeZone);
      assert.strictEqual(summer.hour, 12);
      assert.strictEqual(summer.utcOffsetMinutes, -360);
      assert.strictEqual(summer.isoCivilString, '2026-07-15T12:00:00.000-06:00');

      // 3. Spring-forward transition (March 8, 2026)
      // Instant immediately before 02:00 local: 08:59:00Z -> 01:59:00 MST (-07:00)
      const preSpring = deriveCivilTime('2026-03-08T08:59:00.000Z', timeZone);
      assert.strictEqual(preSpring.hour, 1);
      assert.strictEqual(preSpring.minute, 59);
      assert.strictEqual(preSpring.utcOffsetMinutes, -420);
      assert.strictEqual(preSpring.isoCivilString, '2026-03-08T01:59:00.000-07:00');

      // Instant immediately after spring forward (clocks jumped 02:00 -> 03:00): 09:01:00Z -> 03:01:00 MDT (-06:00)
      const postSpring = deriveCivilTime('2026-03-08T09:01:00.000Z', timeZone);
      assert.strictEqual(postSpring.hour, 3);
      assert.strictEqual(postSpring.minute, 1);
      assert.strictEqual(postSpring.utcOffsetMinutes, -360);
      assert.strictEqual(postSpring.isoCivilString, '2026-03-08T03:01:00.000-06:00');

      // 4. Fall-back transition (November 1, 2026)
      // Instant immediately before 02:00 local: 07:59:00Z -> 01:59:00 MDT (-06:00)
      const preFall = deriveCivilTime('2026-11-01T07:59:00.000Z', timeZone);
      assert.strictEqual(preFall.hour, 1);
      assert.strictEqual(preFall.minute, 59);
      assert.strictEqual(preFall.utcOffsetMinutes, -360);
      assert.strictEqual(preFall.isoCivilString, '2026-11-01T01:59:00.000-06:00');

      // Instant immediately after fall back (clocks repeated 01:00): 08:01:00Z -> 01:01:00 MST (-07:00)
      const postFall = deriveCivilTime('2026-11-01T08:01:00.000Z', timeZone);
      assert.strictEqual(postFall.hour, 1);
      assert.strictEqual(postFall.minute, 1);
      assert.strictEqual(postFall.utcOffsetMinutes, -420);
      assert.strictEqual(postFall.isoCivilString, '2026-11-01T01:01:00.000-07:00');
    });
  });

  // =========================================================================
  // Test H: Non-DST Timezones
  // =========================================================================
  describe('Test H — Non-DST Timezones', () => {
    test('maintains invariant offset across calendar year in non-DST zones', () => {
      // 1. UTC
      const winterUtc = deriveCivilTime('2026-01-15T12:00:00.000Z', 'UTC');
      const summerUtc = deriveCivilTime('2026-07-15T12:00:00.000Z', 'UTC');
      assert.strictEqual(winterUtc.utcOffsetMinutes, 0);
      assert.strictEqual(summerUtc.utcOffsetMinutes, 0);
      assert.strictEqual(winterUtc.isoCivilString, '2026-01-15T12:00:00.000+00:00');
      assert.strictEqual(summerUtc.isoCivilString, '2026-07-15T12:00:00.000+00:00');

      // 2. Asia/Tokyo (JST, UTC+9 year-round)
      const winterTokyo = deriveCivilTime('2026-01-15T12:00:00.000Z', 'Asia/Tokyo');
      const summerTokyo = deriveCivilTime('2026-07-15T12:00:00.000Z', 'Asia/Tokyo');
      assert.strictEqual(winterTokyo.utcOffsetMinutes, 540);
      assert.strictEqual(summerTokyo.utcOffsetMinutes, 540);
      assert.strictEqual(winterTokyo.hour, 21);
      assert.strictEqual(summerTokyo.hour, 21);
      assert.strictEqual(winterTokyo.isoCivilString, '2026-01-15T21:00:00.000+09:00');
      assert.strictEqual(summerTokyo.isoCivilString, '2026-07-15T21:00:00.000+09:00');
    });
  });

  // =========================================================================
  // Test I: Cross-Location Independence & Projection Invariants
  // =========================================================================
  describe('Test I — Cross-Location Independence', () => {
    test('projects same UTC instant into independent civil times across zones without cross-contamination', () => {
      const instant = '2026-09-24T15:00:00.000Z';

      const juarez = deriveCivilTime(instant, 'America/Ciudad_Juarez');
      const tokyo = deriveCivilTime(instant, 'Asia/Tokyo');
      const london = deriveCivilTime(instant, 'Europe/London');

      // Juarez: 09:00, Sept 24, Thursday
      assert.strictEqual(juarez.hour, 9);
      assert.strictEqual(juarez.day, 24);
      assert.strictEqual(juarez.dayOfWeek, 4);
      assert.strictEqual(juarez.utcOffsetMinutes, -360);

      // Tokyo: 00:00, Sept 25, Friday
      assert.strictEqual(tokyo.hour, 0);
      assert.strictEqual(tokyo.day, 25);
      assert.strictEqual(tokyo.dayOfWeek, 5);
      assert.strictEqual(tokyo.utcOffsetMinutes, 540);

      // London (BST, UTC+1): 16:00, Sept 24, Thursday
      assert.strictEqual(london.hour, 16);
      assert.strictEqual(london.day, 24);
      assert.strictEqual(london.dayOfWeek, 4);
      assert.strictEqual(london.utcOffsetMinutes, 60);
    });

    test('same authoritative World Time + different geographic IANA timezones = different derived CivilTime projections without WorldState mutation', () => {
      const state = createTestWorldState();
      const snapshotBefore = JSON.stringify(state);

      // Same authoritative World Time instant
      const worldTime = '2026-09-24T15:00:00.000Z';

      // Different geographic IANA timezones
      const tzJuarez = 'America/Ciudad_Juarez';
      const tzNewYork = 'America/New_York';
      const tzTokyo = 'Asia/Tokyo';

      const civilJuarez = deriveCivilTime(worldTime, tzJuarez);
      const civilNewYork = deriveCivilTime(worldTime, tzNewYork);
      const civilTokyo = deriveCivilTime(worldTime, tzTokyo);

      // Differing offsets produce different derived projections
      assert.notStrictEqual(civilJuarez.utcOffsetMinutes, civilNewYork.utcOffsetMinutes); // -360 vs -240
      assert.notStrictEqual(civilJuarez.utcOffsetMinutes, civilTokyo.utcOffsetMinutes); // -360 vs 540
      assert.notStrictEqual(civilNewYork.utcOffsetMinutes, civilTokyo.utcOffsetMinutes); // -240 vs 540

      assert.notStrictEqual(civilJuarez.hour, civilNewYork.hour); // 9 vs 11
      assert.notStrictEqual(civilJuarez.hour, civilTokyo.hour); // 9 vs 0
      assert.notStrictEqual(civilJuarez.day, civilTokyo.day); // 24 vs 25
      assert.notStrictEqual(civilJuarez.isoCivilString, civilNewYork.isoCivilString);
      assert.notStrictEqual(civilJuarez.isoCivilString, civilTokyo.isoCivilString);

      // Neither projection mutates WorldState
      const snapshotAfter = JSON.stringify(state);
      assert.strictEqual(snapshotBefore, snapshotAfter);
    });
  });

  // =========================================================================
  // Test J: Geographic Resolver (Hierarchy Containment)
  // =========================================================================
  describe('Test J — Geographic Hierarchy Resolver', () => {
    test('resolves building up to root city timezone', () => {
      const state = createTestWorldState();
      const tz = resolveLocationTimeZone(state, 'building:development-building');
      assert.strictEqual(tz, 'America/Ciudad_Juarez');
    });

    test('resolves street up to root city timezone', () => {
      const state = createTestWorldState();
      const tz = resolveLocationTimeZone(state, 'street:development-street');
      assert.strictEqual(tz, 'America/Ciudad_Juarez');
    });

    test('resolves neighborhood up to root city timezone', () => {
      const state = createTestWorldState();
      const tz = resolveLocationTimeZone(state, 'neighborhood:development-neighborhood');
      assert.strictEqual(tz, 'America/Ciudad_Juarez');
    });

    test('resolves district up to root city timezone', () => {
      const state = createTestWorldState();
      const tz = resolveLocationTimeZone(state, 'district:development-district');
      assert.strictEqual(tz, 'America/Ciudad_Juarez');
    });

    test('resolves root city directly to its registered timezone', () => {
      const state = createTestWorldState();
      const tz = resolveLocationTimeZone(state, 'city:ciudad-juarez');
      assert.strictEqual(tz, 'America/Ciudad_Juarez');
    });
  });

  // =========================================================================
  // Test K: Restaurant Resolver
  // =========================================================================
  describe('Test K — Restaurant Resolver', () => {
    test('resolves restaurant through buildingId up to root city timezone', () => {
      const state = createTestWorldState();
      const tz = resolveLocationTimeZone(state, 'restaurant:development-restaurant');
      assert.strictEqual(tz, 'America/Ciudad_Juarez');
    });
  });

  // =========================================================================
  // Test L: Agent Resolver
  // =========================================================================
  describe('Test L — Agent Resolver', () => {
    test('resolves agent through locationId up to root city timezone', () => {
      const state = createTestWorldState();
      const playerTz = resolveLocationTimeZone(state, 'agent:dev-player');
      assert.strictEqual(playerTz, 'America/Ciudad_Juarez');

      const npcTz = resolveLocationTimeZone(state, 'agent:dev-npc');
      assert.strictEqual(npcTz, 'America/Ciudad_Juarez');
    });

    test('resolves agent located in restaurant through restaurant and building hierarchy', () => {
      const state = createTestWorldState();
      // Position agent inside restaurant
      const agent = state.agents.find((a) => a.id === 'agent:dev-player');
      assert.ok(agent);
      agent.locationId = 'restaurant:development-restaurant';

      const tz = resolveLocationTimeZone(state, 'agent:dev-player');
      assert.strictEqual(tz, 'America/Ciudad_Juarez');
    });
  });

  // =========================================================================
  // Test M: Unresolvable Location Handling
  // =========================================================================
  describe('Test M — Unresolvable Location Handling', () => {
    test('throws explicit error when location is not found in state', () => {
      const state = createTestWorldState();
      assert.throws(
        () => resolveLocationTimeZone(state, 'unknown-location-id'),
        /cannot resolve location "unknown-location-id"/i
      );
    });

    test('throws explicit error on empty or invalid locationId parameter', () => {
      const state = createTestWorldState();
      assert.throws(
        () => resolveLocationTimeZone(state, ''),
        /non-empty string/i
      );
    });

    test('throws explicit error when hierarchy is disconnected from a city', () => {
      const state = createTestWorldState();
      // Add a disconnected building with parentId null
      const orphanPlace: Place = {
        id: 'building:orphan',
        type: 'building',
        name: 'Orphan Building',
        parentId: null,
      };
      state.places.push(orphanPlace);

      assert.throws(
        () => resolveLocationTimeZone(state, 'building:orphan'),
        /hierarchy is disconnected/i
      );
    });

    test('throws explicit error when hierarchy references missing parent', () => {
      const state = createTestWorldState();
      const brokenPlace: Place = {
        id: 'building:broken',
        type: 'building',
        name: 'Broken Parent Building',
        parentId: 'street:non-existent',
      };
      state.places.push(brokenPlace);

      assert.throws(
        () => resolveLocationTimeZone(state, 'building:broken'),
        /references non-existent parentId/i
      );
    });

    test('throws explicit error when hierarchy contains a cycle', () => {
      const state = createTestWorldState();
      const cycleA: Place = {
        id: 'street:cycle-a',
        type: 'street',
        name: 'Cycle Street A',
        parentId: 'street:cycle-b',
      };
      const cycleB: Place = {
        id: 'street:cycle-b',
        type: 'street',
        name: 'Cycle Street B',
        parentId: 'street:cycle-a',
      };
      state.places.push(cycleA, cycleB);

      assert.throws(
        () => resolveLocationTimeZone(state, 'street:cycle-a'),
        /containment cycle detected/i
      );
    });

    test('throws explicit error when root city has no registered timezone mapping', () => {
      const state = createTestWorldState();
      const unmappedCity: Place = {
        id: 'city:atlantis',
        type: 'city',
        name: 'Atlantis Undersea City',
        parentId: null,
      };
      state.places.push(unmappedCity);

      assert.throws(
        () => resolveLocationTimeZone(state, 'city:atlantis'),
        /no registered IANA timezone for root city/i
      );
    });

    test('throws explicit error when root city has unregistered ID even if name matches "Ciudad Juárez"', () => {
      const state = createTestWorldState();
      const unregisteredCity: Place = {
        id: 'city:unregistered-juarez',
        type: 'city',
        name: 'Ciudad Juárez',
        parentId: null,
      };
      state.places.push(unregisteredCity);

      assert.throws(
        () => resolveLocationTimeZone(state, 'city:unregistered-juarez'),
        /no registered IANA timezone for root city "city:unregistered-juarez"/i
      );
    });
  });

  // =========================================================================
  // Test N: Purity & Immutability
  // =========================================================================
  describe('Test N — Purity & Immutability', () => {
    test('neither deriveCivilTime nor resolveLocationTimeZone mutates state', () => {
      const state = createTestWorldState();
      const serializedBefore = JSON.stringify(state);

      resolveLocationTimeZone(state, 'building:development-building');
      resolveLocationTimeZone(state, 'restaurant:development-restaurant');
      resolveLocationTimeZone(state, 'agent:dev-player');

      deriveCivilTime(state.worldTime, 'America/Ciudad_Juarez');
      deriveCivilTime('2026-09-24T15:00:00.000Z', 'America/Ciudad_Juarez');

      const serializedAfter = JSON.stringify(state);
      assert.strictEqual(serializedBefore, serializedAfter);
    });

    test('returned CivilTime object is frozen and immutable', () => {
      const civil = deriveCivilTime('2026-09-24T15:00:00.000Z', 'America/Ciudad_Juarez');
      assert.ok(Object.isFrozen(civil));

      assert.throws(() => {
        // @ts-expect-error Mutating readonly property
        civil.hour = 12;
      }, TypeError);
    });
  });

  // =========================================================================
  // Test O: Millisecond Preservation
  // =========================================================================
  describe('Test O — Millisecond Preservation', () => {
    test('preserves sub-second millisecond precision from ISO string input', () => {
      const worldTime = '2026-09-24T15:00:00.789Z';
      const civil = deriveCivilTime(worldTime, 'America/Ciudad_Juarez');

      assert.strictEqual(civil.millisecond, 789);
      assert.strictEqual(civil.isoCivilString, '2026-09-24T09:00:00.789-06:00');
    });

    test('preserves sub-second millisecond precision from epoch milliseconds input', () => {
      const epochMs = Date.parse('2026-09-24T15:00:00.123Z');
      const civil = deriveCivilTime(epochMs, 'America/Ciudad_Juarez');

      assert.strictEqual(civil.millisecond, 123);
      assert.strictEqual(civil.isoCivilString, '2026-09-24T09:00:00.123-06:00');
    });
  });

  // =========================================================================
  // Test P: Schema Preservation
  // =========================================================================
  describe('Test P — Schema Preservation', () => {
    test('WorldState schema version remains exactly 17 with no persisted civil time fields', () => {
      const state = createTestWorldState();

      assert.strictEqual(CURRENT_WORLD_STATE_VERSION, 19);
      assert.strictEqual(state.version, 19);

      // Verify no civil time fields on WorldState
      assert.strictEqual('civilTime' in state, false);
      assert.strictEqual('localTime' in state, false);
      assert.strictEqual('timeZone' in state, false);

      // Verify no civil time fields on Places
      for (const place of state.places) {
        assert.strictEqual('timeZone' in place, false);
        assert.strictEqual('civilTime' in place, false);
      }

      // Verify no civil time fields on Restaurants
      for (const restaurant of state.restaurants) {
        assert.strictEqual('timeZone' in restaurant, false);
        assert.strictEqual('civilTime' in restaurant, false);
      }

      // Verify no civil time fields on Agents
      for (const agent of state.agents) {
        assert.strictEqual('timeZone' in agent, false);
        assert.strictEqual('civilTime' in agent, false);
      }
    });
  });
});
