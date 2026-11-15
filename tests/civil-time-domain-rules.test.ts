import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorldClock } from '../src/core/clock.js';
import {
  WorldState,
  createInitialWorldState,
  validateWorldState,
  CURRENT_WORLD_STATE_VERSION,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  enterBuilding,
  enterRestaurant,
  inspectCurrentLocation,
  purchaseOffering,
  startHavingCoffee,
} from '../src/core/world-state.js';
import { Place } from '../src/core/entities/geography.js';
import { Agent } from '../src/core/entities/agent.js';
import { createDevelopmentSeedWorld } from '../src/core/seed.js';
import { evaluateScheduleInformedRestaurantConsideration } from '../src/core/action-consideration.js';
import {
  deriveCivilTime,
  resolveLocationTimeZone,
  CITY_TIMEZONE_MAP,
} from '../src/core/civil-time.js';
import {
  isTimeWithinScheduleInterval,
  formatHourUtc,
  DEVELOPMENT_NPC_WORK_SCHEDULE,
} from '../src/core/development-npc-schedule.js';
import {
  evaluateDevelopmentRestaurantOperationalRule,
  getRestaurantClosingTimeMs,
} from '../src/core/entities/restaurant.js';
import {
  Simulation,
  evaluateDevelopmentActivityRule,
  evaluateDevelopmentNpcLocationRule,
} from '../src/core/simulation.js';

describe('Phase D: Civil-Time Domain Rules Integration', () => {
  const JUAREZ_TZ = 'America/Ciudad_Juarez';

  // =========================================================================
  // 1. NPC Schedule Evaluation Under America/Ciudad_Juarez
  // =========================================================================
  describe('1. NPC Schedule Evaluation Under America/Ciudad_Juarez', () => {
    it('evaluates exact millisecond boundaries for morning commute, work shift, evening promenade, and home rest', () => {
      // In September 2026, Ciudad Juárez is on MDT (UTC-6).
      // Local 08:30:00.000 = 14:30:00.000 UTC
      // Local 09:00:00.000 = 15:00:00.000 UTC
      // Local 17:00:00.000 = 23:00:00.000 UTC
      // Local 20:30:00.000 = 02:30:00.000 UTC (next UTC calendar day)

      // Before morning commute (< 08:30 local): at residence
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-24T14:29:59.999Z', JUAREZ_TZ),
        'building:development-residence'
      );

      // Morning commute starts at 08:30 local (14:30Z): on Development Street
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-24T14:30:00.000Z', JUAREZ_TZ),
        'street:development-street'
      );
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-24T14:59:59.999Z', JUAREZ_TZ),
        'street:development-street'
      );

      // Work shift starts at 09:00 local (15:00Z): at restaurant
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-24T15:00:00.000Z', JUAREZ_TZ),
        'restaurant:development-restaurant'
      );
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-24T18:00:00.000Z', JUAREZ_TZ),
        'restaurant:development-restaurant'
      );
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-24T22:59:59.999Z', JUAREZ_TZ),
        'restaurant:development-restaurant'
      );

      // Evening promenade starts at 17:00 local (23:00Z): on Avenida Juárez
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-24T23:00:00.000Z', JUAREZ_TZ),
        'street:avenida-juarez'
      );
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-25T01:00:00.000Z', JUAREZ_TZ),
        'street:avenida-juarez'
      );
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-25T02:29:59.999Z', JUAREZ_TZ),
        'street:avenida-juarez'
      );

      // Return home starts at 20:30 local (02:30Z next day): at residence
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-25T02:30:00.000Z', JUAREZ_TZ),
        'building:development-residence'
      );
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-25T04:00:00.000Z', JUAREZ_TZ),
        'building:development-residence'
      );
    });

    it('evaluates activity rule [09:00, 17:00) against local civil time in America/Ciudad_Juarez', () => {
      // 14:59:59.999 UTC = 08:59:59.999 local (inactive)
      assert.equal(evaluateDevelopmentActivityRule('2026-09-24T14:59:59.999Z', undefined, JUAREZ_TZ), false);

      // 15:00:00.000 UTC = 09:00:00.000 local (active shift start)
      assert.equal(evaluateDevelopmentActivityRule('2026-09-24T15:00:00.000Z', undefined, JUAREZ_TZ), true);

      // 18:00:00.000 UTC = 12:00:00.000 local (active midday)
      assert.equal(evaluateDevelopmentActivityRule('2026-09-24T18:00:00.000Z', undefined, JUAREZ_TZ), true);

      // 22:59:59.999 UTC = 16:59:59.999 local (active before shift end)
      assert.equal(evaluateDevelopmentActivityRule('2026-09-24T22:59:59.999Z', undefined, JUAREZ_TZ), true);

      // 23:00:00.000 UTC = 17:00:00.000 local (inactive shift end)
      assert.equal(evaluateDevelopmentActivityRule('2026-09-24T23:00:00.000Z', undefined, JUAREZ_TZ), false);
    });

    it('evaluates isTimeWithinScheduleInterval with exact local schedule hours', () => {
      assert.equal(
        isTimeWithinScheduleInterval('2026-09-24T14:59:59.999Z', 9, 17, JUAREZ_TZ),
        false
      );
      assert.equal(
        isTimeWithinScheduleInterval('2026-09-24T15:00:00.000Z', 9, 17, JUAREZ_TZ),
        true
      );
      assert.equal(
        isTimeWithinScheduleInterval('2026-09-24T22:59:59.999Z', 9, 17, JUAREZ_TZ),
        true
      );
      assert.equal(
        isTimeWithinScheduleInterval('2026-09-24T23:00:00.000Z', 9, 17, JUAREZ_TZ),
        false
      );
    });
  });

  // =========================================================================
  // 2. Cross-Timezone Comparison at Identical World Time Instant (Criterion B)
  // =========================================================================
  describe('2. Cross-Timezone Comparison at Identical World Time Instant (Criterion B)', () => {
    const INSTANT = '2026-09-24T15:00:00.000Z';

    it('evaluates different civil times and domain states across geographic regions at the exact same instant', () => {
      // Region 1: Ciudad Juárez (UTC-6) -> 09:00:00 local (work shift begins / restaurant open)
      const juarezCivil = deriveCivilTime(INSTANT, 'America/Ciudad_Juarez');
      assert.equal(juarezCivil.hour, 9);
      assert.equal(juarezCivil.minute, 0);
      assert.equal(
        evaluateDevelopmentNpcLocationRule(INSTANT, 'America/Ciudad_Juarez'),
        'restaurant:development-restaurant'
      );
      assert.equal(
        evaluateDevelopmentActivityRule(INSTANT, undefined, 'America/Ciudad_Juarez'),
        true
      );
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(INSTANT, 'America/Ciudad_Juarez'),
        'open'
      );

      // Region 2: Tokyo (UTC+9) -> 00:00:00 local next day (midnight / closed / resting)
      const tokyoCivil = deriveCivilTime(INSTANT, 'Asia/Tokyo');
      assert.equal(tokyoCivil.hour, 0);
      assert.equal(tokyoCivil.minute, 0);
      assert.equal(
        evaluateDevelopmentNpcLocationRule(INSTANT, 'Asia/Tokyo'),
        'building:development-residence'
      );
      assert.equal(
        evaluateDevelopmentActivityRule(INSTANT, undefined, 'Asia/Tokyo'),
        false
      );
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(INSTANT, 'Asia/Tokyo'),
        'closed'
      );

      // Region 3: London (UTC+1 BST) -> 16:00:00 local (late afternoon work shift)
      const londonCivil = deriveCivilTime(INSTANT, 'Europe/London');
      assert.equal(londonCivil.hour, 16);
      assert.equal(londonCivil.minute, 0);
      assert.equal(
        evaluateDevelopmentNpcLocationRule(INSTANT, 'Europe/London'),
        'restaurant:development-restaurant'
      );
      assert.equal(
        evaluateDevelopmentActivityRule(INSTANT, undefined, 'Europe/London'),
        true
      );
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(INSTANT, 'Europe/London'),
        'open'
      );

      // Region 4: Honolulu (UTC-10) -> 05:00:00 local (early morning / resting at residence)
      const honoluluCivil = deriveCivilTime(INSTANT, 'Pacific/Honolulu');
      assert.equal(honoluluCivil.hour, 5);
      assert.equal(honoluluCivil.minute, 0);
      assert.equal(
        evaluateDevelopmentNpcLocationRule(INSTANT, 'Pacific/Honolulu'),
        'building:development-residence'
      );
      assert.equal(
        evaluateDevelopmentActivityRule(INSTANT, undefined, 'Pacific/Honolulu'),
        false
      );
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(INSTANT, 'Pacific/Honolulu'),
        'closed'
      );
    });
  });

  // =========================================================================
  // 3. Restaurant Operational Schedule Under America/Ciudad_Juarez
  // =========================================================================
  describe('3. Restaurant Operational Schedule Under America/Ciudad_Juarez', () => {
    it('evaluates open, closing-soon, and closed states based on local civil time', () => {
      // Local 08:59:59.999 (14:59:59.999Z): closed
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-24T14:59:59.999Z', JUAREZ_TZ),
        'closed'
      );

      // Local 09:00:00.000 (15:00:00.000Z): open
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-24T15:00:00.000Z', JUAREZ_TZ),
        'open'
      );

      // Local 16:44:59.999 (22:44:59.999Z): open
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-24T22:44:59.999Z', JUAREZ_TZ),
        'open'
      );

      // Local 16:45:00.000 (22:45:00.000Z): closing-soon
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-24T22:45:00.000Z', JUAREZ_TZ),
        'closing-soon'
      );

      // Local 16:59:59.999 (22:59:59.999Z): closing-soon
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-24T22:59:59.999Z', JUAREZ_TZ),
        'closing-soon'
      );

      // Local 17:00:00.000 (23:00:00.000Z): closed
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-24T23:00:00.000Z', JUAREZ_TZ),
        'closed'
      );
    });

    it('getRestaurantClosingTimeMs returns the exact UTC epoch instant for local 17:00 closing', () => {
      // In September 2026, Ciudad Juárez is UTC-6.
      // Closing instant on 2026-09-24 is 17:00 local = 23:00:00.000Z
      const closingEpochMs = getRestaurantClosingTimeMs(
        'restaurant:development-restaurant',
        '2026-09-24T15:00:00.000Z',
        JUAREZ_TZ
      );

      assert.equal(closingEpochMs, Date.parse('2026-09-24T23:00:00.000Z'));

      // In Tokyo (UTC+9), at 2026-09-24T15:00:00.000Z, civil date is already 2026-09-25 (00:00:00).
      // Closing instant on 2026-09-25 is 17:00 Tokyo = 08:00:00.000Z on 2026-09-25.
      const tokyoClosingMs = getRestaurantClosingTimeMs(
        'restaurant:development-restaurant',
        '2026-09-24T15:00:00.000Z',
        'Asia/Tokyo'
      );
      assert.equal(tokyoClosingMs, Date.parse('2026-09-25T08:00:00.000Z'));
    });
  });

  // =========================================================================
  // 4. DST Transitions Across 2026 in America/Ciudad_Juarez
  // =========================================================================
  describe('4. DST Transitions Across 2026 in America/Ciudad_Juarez', () => {
    it('seamlessly shifts UTC trigger instants across winter standard time (UTC-7) and summer daylight time (UTC-6)', () => {
      // In 2026:
      // - Winter (Feb 2026): UTC-7. 09:00 local = 16:00 UTC. 17:00 local = 00:00 UTC next day.
      // - Summer (Jul 2026): UTC-6. 09:00 local = 15:00 UTC. 17:00 local = 23:00 UTC.
      // - Late Fall (Nov 2026, after Nov 1 DST fall-back): UTC-7. 09:00 local = 16:00 UTC.

      // 1. Winter (Standard Time, UTC-7)
      const winterOpenUtc = '2026-02-15T16:00:00.000Z'; // 09:00 local
      const winterPreOpenUtc = '2026-02-15T15:59:59.999Z'; // 08:59:59.999 local
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(winterPreOpenUtc, JUAREZ_TZ),
        'closed'
      );
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(winterOpenUtc, JUAREZ_TZ),
        'open'
      );
      assert.equal(
        evaluateDevelopmentNpcLocationRule(winterOpenUtc, JUAREZ_TZ),
        'restaurant:development-restaurant'
      );

      // 2. Summer (Daylight Saving Time, UTC-6)
      const summerOpenUtc = '2026-07-15T15:00:00.000Z'; // 09:00 local
      const summerPreOpenUtc = '2026-07-15T14:59:59.999Z'; // 08:59:59.999 local
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(summerPreOpenUtc, JUAREZ_TZ),
        'closed'
      );
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(summerOpenUtc, JUAREZ_TZ),
        'open'
      );
      assert.equal(
        evaluateDevelopmentNpcLocationRule(summerOpenUtc, JUAREZ_TZ),
        'restaurant:development-restaurant'
      );

      // 3. Post-DST Autumn (Standard Time, UTC-7)
      const fallOpenUtc = '2026-11-15T16:00:00.000Z'; // 09:00 local
      const fallPreOpenUtc = '2026-11-15T15:59:59.999Z'; // 08:59:59.999 local
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(fallPreOpenUtc, JUAREZ_TZ),
        'closed'
      );
      assert.equal(
        evaluateDevelopmentRestaurantOperationalRule(fallOpenUtc, JUAREZ_TZ),
        'open'
      );
      assert.equal(
        evaluateDevelopmentNpcLocationRule(fallOpenUtc, JUAREZ_TZ),
        'restaurant:development-restaurant'
      );
    });
  });

  // =========================================================================
  // 5. Production Simulation Default: Automatic Geographic Location Timezone Resolution
  // =========================================================================
  describe('5. Production Simulation Default (Automatic Geographic Location Timezone Resolution)', () => {
    it('Simulation.tick() resolves entity timezone through geographic containment when options.timeZone is omitted', () => {
      // Create world at 14:00:00.000Z (08:00 local in Juárez)
      const clock = WorldClock.create('2026-09-24T14:00:00.000Z');
      const state = createInitialWorldState(clock);

      // Do NOT specify options.timeZone (production default)
      const sim = new Simulation(clock, state, { silent: true });

      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

      // 14:00 UTC = 08:00 local: NPC at residence, restaurant closed
      sim.tick();
      assert.equal(devNpc.locationId, 'building:development-residence');
      assert.equal(devNpc.activityState, 'idle');
      assert.equal(restaurant.operationalState, 'closed');
      assert.equal(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID), false);

      // Advance 30 min to 14:30:00.000Z = 08:30 local: Morning commute
      clock.advance(30 * 60_000);
      const commuteTick = sim.tick();
      assert.equal(devNpc.locationId, 'street:development-street');
      assert.equal(devNpc.activityState, 'idle');
      assert.equal(restaurant.operationalState, 'closed');

      // Advance 30 min to 15:00:00.000Z = 09:00 local: Work shift begins, restaurant opens, pastry published
      clock.advance(30 * 60_000);
      const workTick = sim.tick();
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      assert.equal(devNpc.activityState, 'active');
      assert.equal(restaurant.operationalState, 'open');
      assert.equal(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID), true);

      // Advance to 22:45:00.000Z = 16:45 local: Closing-soon cutoff
      clock.advance(7 * 3600_000 + 45 * 60_000);
      sim.tick();
      assert.equal(restaurant.operationalState, 'closing-soon');

      // Advance 15 min to 23:00:00.000Z = 17:00 local: Shift ends, restaurant closes, offering retired, NPC moves to Avenida Juárez
      clock.advance(15 * 60_000);
      const closeTick = sim.tick();
      assert.equal(restaurant.operationalState, 'closed');
      assert.equal(devNpc.locationId, 'street:avenida-juarez');
      assert.equal(devNpc.activityState, 'idle');
      assert.equal(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID), false);

      // Advance to 02:30:00.000Z next day = 20:30 local: Evening promenade ends, returns to residence
      clock.advance(3 * 3600_000 + 30 * 60_000);
      sim.tick();
      assert.equal(devNpc.locationId, 'building:development-residence');
      assert.equal(devNpc.activityState, 'idle');
    });
  });

  // =========================================================================
  // 6. Geographic Containment & Spatial Relocation Independence
  // =========================================================================
  describe('6. Geographic Containment & Spatial Relocation Independence', () => {
    it('resolves timezone directly from entity location hierarchy in WorldState', () => {
      const clock = WorldClock.create('2026-09-24T15:00:00.000Z');
      const state = createInitialWorldState(clock);

      // dev-npc is at building:development-residence
      const npcTz = resolveLocationTimeZone(state, 'agent:dev-npc');
      assert.equal(npcTz, 'America/Ciudad_Juarez');

      // restaurant is at restaurant:development-restaurant
      const restTz = resolveLocationTimeZone(state, 'restaurant:development-restaurant');
      assert.equal(restTz, 'America/Ciudad_Juarez');
    });

    it('rejects unresolvable or unregistered locations with explicit error', () => {
      const clock = WorldClock.create('2026-09-24T15:00:00.000Z');
      const state = createInitialWorldState(clock);

      assert.throws(
        () => resolveLocationTimeZone(state, 'nonexistent:location'),
        /Cannot resolve location/
      );
    });
  });

  // =========================================================================
  // 7. Schema Invariant & Zero OS Clock Access
  // =========================================================================
  describe('7. Schema Invariant & Determinism', () => {
    it('preserves WorldState Schema Version 18 with strictly zero persisted civil-time fields', () => {
      const clock = WorldClock.create('2026-09-24T15:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      sim.tick();

      assert.equal(state.version, 19);
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);

      // Verify no foreign or persisted civil time keys on state
      const stateKeys = Object.keys(state);
      assert.equal(stateKeys.includes('civilTime'), false);
      assert.equal(stateKeys.includes('timeZone'), false);
      assert.equal(stateKeys.includes('localTime'), false);

      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('is purely deterministic: identical World Time inputs yield identical outputs without reading OS clock', () => {
      const time = '2026-09-24T15:00:00.000Z';
      const res1 = evaluateDevelopmentRestaurantOperationalRule(time, JUAREZ_TZ);
      const res2 = evaluateDevelopmentRestaurantOperationalRule(time, JUAREZ_TZ);
      assert.equal(res1, res2);

      const loc1 = evaluateDevelopmentNpcLocationRule(time, JUAREZ_TZ);
      const loc2 = evaluateDevelopmentNpcLocationRule(time, JUAREZ_TZ);
      assert.equal(loc1, loc2);
    });
  });

  // =========================================================================
  // 8. Phase D Correction — Enforced Geographic Authority (Tests A–E)
  // =========================================================================
  describe('8. Phase D Correction — Enforced Geographic Authority (Tests A–E)', () => {
    it('Test A — Restaurant Closing: evaluates closing instant against local civil time and authorizes/rejects activities accordingly', () => {
      // In Ciudad Juárez (UTC-6):
      // 2026-09-24T22:00:00Z -> 16:00 local: open
      // 2026-09-24T23:00:00Z -> 17:00 local: closed
      const clock = WorldClock.create('2026-09-24T22:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      assert.equal(restaurant.operationalState, 'open');

      // Place player in restaurant with coffee purchase
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = restaurant.id;
      player.balanceMinor = 5000;
      purchaseOffering(state, player.id, 'offering:development-coffee', restaurant.id, { silent: true });

      // Case 1: At 22:40:00Z (16:40 local civil time), coffee activity (15 min) ends at 16:55 local (< 17:00 local close) -> ACCEPTED
      clock.advanceTo(Date.parse('2026-09-24T22:40:00.000Z'));
      state.worldTime = clock.getTime();
      const coffeeResult1 = startHavingCoffee(state, player.id);
      assert.equal(coffeeResult1.success, true);
      assert.equal(player.playerActivity?.activity, 'having-coffee');

      // Reset activity
      player.playerActivity = null;

      // Case 2: At 22:50:00Z (16:50 local civil time), coffee activity (15 min) would end at 17:05 local (> 17:00 local close) -> REJECTED
      clock.advanceTo(Date.parse('2026-09-24T22:50:00.000Z'));
      state.worldTime = clock.getTime();
      const coffeeResult2 = startHavingCoffee(state, player.id);
      assert.equal(coffeeResult2.success, false);
      assert.equal(coffeeResult2.code, 'activity-extends-past-closing');

      // Case 3: At 23:00:00Z (17:00 local civil time), restaurant closes
      clock.advanceTo(Date.parse('2026-09-24T23:00:00.000Z'));
      sim.tick();
      assert.equal(restaurant.operationalState, 'closed');

      // Case 4: Critical regression check from the audit: At 16:50:00Z (which was 16:50 UTC, but 10:50 AM in Ciudad Juárez),
      // under old UTC bug, this was rejected as "past 17:00 closing". In Ciudad Juárez it is morning (10:50 AM) and MUST succeed!
      const morningClock = WorldClock.create('2026-09-24T16:50:00.000Z');
      const morningState = createInitialWorldState(morningClock);
      const morningSim = new Simulation(morningClock, morningState, { silent: true });
      morningSim.tick();
      const morningPlayer = morningState.agents.find((a) => a.id === 'agent:dev-player')!;
      morningPlayer.locationId = 'restaurant:development-restaurant';
      morningPlayer.balanceMinor = 5000;
      purchaseOffering(morningState, morningPlayer.id, 'offering:development-coffee', 'restaurant:development-restaurant', { silent: true });
      const morningCoffee = startHavingCoffee(morningState, morningPlayer.id);
      assert.equal(morningCoffee.success, true, 'At 10:50 AM local time (16:50Z), coffee must not be rejected by closing rule');
    });

    it('Test B — Action Consideration: evaluates schedule against local civil time in America/Ciudad_Juarez, not UTC', () => {
      // Shift is [09:00, 17:00) local civil time.
      // In Ciudad Juárez (UTC-6):
      // 15:00:00Z is 09:00 local (work shift started).
      // 09:00:00Z is 03:00 local (night, rest).

      // At 15:00:00Z (09:00 local):
      const clockWork = WorldClock.create('2026-09-24T15:00:00.000Z');
      const stateWork = createInitialWorldState(clockWork);
      const player = stateWork.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'building:development-building';
      stateWork.knowledge.push({
        id: 'record:1',
        agentId: player.id,
        factType: 'agent-schedule',
        subjectId: 'agent:dev-npc',
        acquiredAt: '2026-09-24T14:35:00.000Z',
        sourceType: 'observation',
        payload: {
          workplaceId: 'restaurant:development-restaurant',
          shiftStart: '09:00',
          shiftEnd: '17:00',
        },
      });

      const considerationWork = evaluateScheduleInformedRestaurantConsideration(stateWork, player.id);
      assert.equal(considerationWork.considered, true);
      assert.equal(considerationWork.reason, 'known-npc-schedule');

      // Boundary check: At 09:00:00Z (03:00 local civil time):
      // In UTC this would have been considered=true under the old bug!
      // In Ciudad Juárez local civil time (03:00 AM), it must be considered=false!
      const clockNight = WorldClock.create('2026-09-24T09:00:00.000Z');
      const stateNight = createInitialWorldState(clockNight);
      const playerNight = stateNight.agents.find((a) => a.id === 'agent:dev-player')!;
      playerNight.locationId = 'building:development-building';
      stateNight.knowledge.push({
        id: 'record:2',
        agentId: playerNight.id,
        factType: 'agent-schedule',
        subjectId: 'agent:dev-npc',
        acquiredAt: '2026-09-24T08:35:00.000Z',
        sourceType: 'observation',
        payload: {
          workplaceId: 'restaurant:development-restaurant',
          shiftStart: '09:00',
          shiftEnd: '17:00',
        },
      });

      const considerationNight = evaluateScheduleInformedRestaurantConsideration(stateNight, playerNight.id);
      assert.equal(considerationNight.considered, false, 'At 03:00 AM local time (09:00Z), NPC is not scheduled to work');
    });

    it('Test C — Seed: creates initial world with restaurant operational state derived from Ciudad Juárez civil time', () => {
      // 15:00:00Z = 09:00 local in Ciudad Juárez -> restaurant open
      const seedOpen = createDevelopmentSeedWorld('2026-09-24T15:00:00.000Z');
      const restOpen = seedOpen.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      assert.equal(restOpen.operationalState, 'open');

      // 09:00:00Z = 03:00 local in Ciudad Juárez -> restaurant closed (under old UTC rule it was open)
      const seedClosed = createDevelopmentSeedWorld('2026-09-24T09:00:00.000Z');
      const restClosed = seedClosed.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      assert.equal(restClosed.operationalState, 'closed');
    });

    it('Test D — Caller Override: SimulationOptions.timeZone is removed and caller cannot override geographic authority', () => {
      const clock = WorldClock.create('2026-09-24T15:00:00.000Z');
      const state = createInitialWorldState(clock);

      // Attempt to pass timeZone via SimulationOptions cast
      const sim = new Simulation(clock, state, { silent: true, ...({ timeZone: 'UTC' } as any) });
      sim.tick();

      // At 15:00:00Z, in Ciudad Juárez it is 09:00 local (open).
      // Check at 09:00:00Z (03:00 local in Juárez):
      const clock3am = WorldClock.create('2026-09-24T09:00:00.000Z');
      const state3am = createInitialWorldState(clock3am);
      const sim3am = new Simulation(clock3am, state3am, { silent: true, ...({ timeZone: 'UTC' } as any) });
      sim3am.tick();

      const rest3am = state3am.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      // Under UTC, 09:00 is open. Under geographic authority (Ciudad Juárez 03:00 local), it MUST be closed!
      assert.equal(rest3am.operationalState, 'closed', 'Caller timeZone: "UTC" must NOT override geographic civil time');
    });

    it('Test E — Location Changes: entity relocation between registered cities immediately reflects new timezone without caching', () => {
      const time = '2026-09-24T15:00:00.000Z';
      const clock = WorldClock.create(time);
      const state = createInitialWorldState(clock);

      // Add El Paso city and a building in El Paso (city:el-paso -> America/Denver, UTC-7)
      const elPasoCity: Place = {
        id: 'city:el-paso',
        type: 'city',
        name: 'El Paso',
        parentId: null,
      };
      const elPasoBuilding: Place = {
        id: 'building:el-paso-library',
        type: 'building',
        name: 'El Paso Library',
        parentId: 'city:el-paso',
      };
      state.places.push(elPasoCity, elPasoBuilding);

      const agent = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      // Initially in Ciudad Juárez (America/Ciudad_Juarez, UTC-6)
      agent.locationId = 'building:development-building';
      const tzJuarez = resolveLocationTimeZone(state, agent.locationId);
      assert.equal(tzJuarez, 'America/Ciudad_Juarez');
      const civilJuarez = deriveCivilTime(time, tzJuarez);
      assert.equal(civilJuarez.hour, 9); // 09:00 local

      // Relocate agent to El Paso (America/Denver)
      agent.locationId = elPasoBuilding.id;
      const tzElPaso = resolveLocationTimeZone(state, agent.locationId);
      assert.equal(tzElPaso, 'America/Denver');
      const civilElPaso = deriveCivilTime(time, tzElPaso);
      assert.equal(civilElPaso.timeZone, 'America/Denver');
    });
  });

  // =========================================================================
  // 3. Development NPC Location Rule Isolation & Spatial Independence
  // =========================================================================
  describe('3. Development NPC Location Rule Isolation & Spatial Independence', () => {
    it('1. agent:dev-npc continues to receive development NPC location behavior across simulation ticks', () => {
      // 14:30:00Z = 08:30 MDT in Ciudad Juárez -> Morning commute to street:development-street
      const clock = WorldClock.create('2026-09-24T14:30:00.000Z');
      const state = createInitialWorldState(clock);
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      devNpc.locationId = 'building:development-residence';

      const sim = new Simulation(clock, state, { silent: true });
      const tickResult = sim.tick();

      assert.equal(devNpc.locationId, 'street:development-street');
      const transition = tickResult.npcLocationTransitions.find((t) => t.agentId === 'agent:dev-npc');
      assert.ok(transition, 'Must emit location transition for agent:dev-npc');
      assert.equal(transition.changed, true);
      assert.equal(transition.newLocationId, 'street:development-street');

      // Advance to 15:00:00Z = 09:00 MDT in Ciudad Juárez -> Work shift at restaurant
      clock.advance(1800_000);
      const tickWork = sim.tick();
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      const workTransition = tickWork.npcLocationTransitions.find((t) => t.agentId === 'agent:dev-npc');
      assert.ok(workTransition);
      assert.equal(workTransition.changed, true);
      assert.equal(workTransition.newLocationId, 'restaurant:development-restaurant');
    });

    it('2. A second valid NPC located elsewhere is NOT moved by evaluateDevelopmentNpcLocationRule', () => {
      // 15:00:00Z = 09:00 MDT in Ciudad Juárez (when dev-npc moves to restaurant:development-restaurant)
      const clock = WorldClock.create('2026-09-24T15:00:00.000Z');
      const state = createInitialWorldState(clock);

      const otherNpc: Agent = {
        id: 'agent:other-npc',
        type: 'agent',
        name: 'Other NPC',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: '2026-09-24T14:00:00.000Z',
        locationId: 'building:development-building',
        interiorSpaceId: null,
        balanceMinor: 500,
        currency: 'USD',
      };
      state.agents.push(otherNpc);
      validateWorldState(state);

      const sim = new Simulation(clock, state, { silent: true });
      const tickResult = sim.tick();

      // agent:dev-npc should move to restaurant
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

      // agent:other-npc must remain untouched at building:development-building
      const otherNpcInState = state.agents.find((a) => a.id === 'agent:other-npc')!;
      assert.equal(otherNpcInState.locationId, 'building:development-building');

      // tickResult.npcLocationTransitions must NOT contain any transition for agent:other-npc
      const otherTransition = tickResult.npcLocationTransitions.find((t) => t.agentId === 'agent:other-npc');
      assert.equal(otherTransition, undefined, 'Development NPC location rule must not produce transitions for other NPCs');
    });

    it('3. Relocating a non-development NPC to another valid city/place does NOT cause the development fixture location rule to pull it back to Ciudad Juárez', () => {
      const clock = WorldClock.create('2026-09-24T14:00:00.000Z');
      const state = createInitialWorldState(clock);

      // Register complete El Paso geographic hierarchy:
      // City -> District -> Neighborhood -> Street -> Building
      const elPasoPlaces: Place[] = [
        {
          id: 'city:el-paso',
          type: 'city',
          name: 'El Paso',
          parentId: null,
        },
        {
          id: 'district:downtown-el-paso',
          type: 'district',
          name: 'Downtown El Paso',
          parentId: 'city:el-paso',
        },
        {
          id: 'neighborhood:central-el-paso',
          type: 'neighborhood',
          name: 'Central El Paso',
          parentId: 'district:downtown-el-paso',
        },
        {
          id: 'street:mesa-street',
          type: 'street',
          name: 'Mesa Street',
          parentId: 'neighborhood:central-el-paso',
        },
        {
          id: 'building:el-paso-library',
          type: 'building',
          name: 'El Paso Library',
          parentId: 'street:mesa-street',
        },
      ];
      state.places.push(...elPasoPlaces);

      const elPasoNpc: Agent = {
        id: 'agent:el-paso-researcher',
        type: 'agent',
        name: 'El Paso Researcher',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: '2026-09-24T14:00:00.000Z',
        locationId: 'building:el-paso-library',
        interiorSpaceId: null,
        balanceMinor: 2000,
        currency: 'USD',
      };
      state.agents.push(elPasoNpc);
      validateWorldState(state);

      const sim = new Simulation(clock, state, { silent: true });

      // Run multiple ticks across different hours of the day (e.g. commute, work, evening promenade, rest)
      const timesToTest = [
        '2026-09-24T14:30:00.000Z', // 08:30 MDT
        '2026-09-24T15:00:00.000Z', // 09:00 MDT
        '2026-09-24T23:00:00.000Z', // 17:00 MDT
        '2026-09-25T02:30:00.000Z', // 20:30 MDT
      ];

      for (const time of timesToTest) {
        clock.restore(time, { allowRegression: true });
        const tickResult = sim.tick();

        // The El Paso NPC must strictly remain in El Paso Library
        assert.equal(
          elPasoNpc.locationId,
          'building:el-paso-library',
          `Non-development NPC at ${time} must not be moved to Ciudad Juárez by fixture rule`
        );

        // Ensure no synthetic location transitions are recorded for the non-development NPC
        const transition = tickResult.npcLocationTransitions.find((t) => t.agentId === 'agent:el-paso-researcher');
        assert.equal(transition, undefined);
      }
    });

    it('4. Existing timezone/geographic resolution behavior remains unchanged for both entities', () => {
      const clock = WorldClock.create('2026-09-24T15:00:00.000Z');
      const state = createInitialWorldState(clock);

      const elPasoPlaces: Place[] = [
        {
          id: 'city:el-paso',
          type: 'city',
          name: 'El Paso',
          parentId: null,
        },
        {
          id: 'district:downtown-el-paso',
          type: 'district',
          name: 'Downtown El Paso',
          parentId: 'city:el-paso',
        },
        {
          id: 'neighborhood:central-el-paso',
          type: 'neighborhood',
          name: 'Central El Paso',
          parentId: 'district:downtown-el-paso',
        },
        {
          id: 'street:mesa-street',
          type: 'street',
          name: 'Mesa Street',
          parentId: 'neighborhood:central-el-paso',
        },
        {
          id: 'building:el-paso-library',
          type: 'building',
          name: 'El Paso Library',
          parentId: 'street:mesa-street',
        },
      ];
      state.places.push(...elPasoPlaces);
      validateWorldState(state);

      const elPasoNpc: Agent = {
        id: 'agent:el-paso-researcher',
        type: 'agent',
        name: 'El Paso Researcher',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: '2026-09-24T14:00:00.000Z',
        locationId: 'building:el-paso-library',
        balanceMinor: 2000,
        currency: 'USD',
      };
      state.agents.push(elPasoNpc);

      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      devNpc.locationId = 'restaurant:development-restaurant';

      // Verify canonical timezone resolution via place hierarchy
      const juarezTz = resolveLocationTimeZone(state, devNpc.locationId);
      assert.equal(juarezTz, 'America/Ciudad_Juarez');

      const elPasoTz = resolveLocationTimeZone(state, elPasoNpc.locationId);
      assert.equal(elPasoTz, 'America/Denver');
    });

    it('5. Existing restaurant operational behavior remains unchanged under geographic civil time', () => {
      // 15:00:00Z = 09:00 MDT in Ciudad Juárez -> restaurant open
      const clockOpen = WorldClock.create('2026-09-24T15:00:00.000Z');
      const stateOpen = createInitialWorldState(clockOpen);
      const simOpen = new Simulation(clockOpen, stateOpen, { silent: true });
      const tickOpen = simOpen.tick();

      const restOpen = stateOpen.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      assert.equal(restOpen.operationalState, 'open');
      const openTrans = tickOpen.restaurantTransitions.find((r) => r.restaurantId === 'restaurant:development-restaurant');
      assert.ok(openTrans);

      // 05:00:00Z = 23:00 MDT in Ciudad Juárez -> restaurant closed
      const clockClosed = WorldClock.create('2026-09-25T05:00:00.000Z');
      const stateClosed = createInitialWorldState(clockClosed);
      const simClosed = new Simulation(clockClosed, stateClosed, { silent: true });
      const tickClosed = simClosed.tick();

      const restClosed = stateClosed.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      assert.equal(restClosed.operationalState, 'closed');
      const closedTrans = tickClosed.restaurantTransitions.find((r) => r.restaurantId === 'restaurant:development-restaurant');
      assert.ok(closedTrans);
    });
  });
});
