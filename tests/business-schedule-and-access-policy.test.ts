import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  DEFAULT_BUSINESS_SCHEDULES,
  findBusinessSchedule,
  evaluateBusinessScheduleStatus,
  evaluateBusinessAdmission,
} from '../src/core/business-schedule.js';
import {
  createGomezMorinWorldState,
  enterRestaurant,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  enterThroughEntranceThreshold,
  exitThroughEntranceThreshold,
} from '../src/core/real-world-street-topology.js';

describe('Phase 2: Authoritative Business Schedule & Access Policy', () => {
  const WING_SPOT_ID = 'restaurant:wing-spot';
  const TIA_LUPE_ID = 'restaurant:pasteleria-tia-lupe';
  const ENTRANCE_WING_SPOT = 'entrance:building:wing-spot-street-main';

  describe('1. Default Business Schedules & Registry', () => {
    it('registers Wing Spot with real-world weekly/overnight hours and Tía Lupe with defaults', () => {
      const wingSpot = findBusinessSchedule(WING_SPOT_ID);
      assert.ok(wingSpot, 'Wing Spot schedule must exist');
      assert.strictEqual(wingSpot.businessId, WING_SPOT_ID);
      assert.strictEqual(wingSpot.timeZone, 'America/Ciudad_Juarez');
      assert.deepStrictEqual(wingSpot.operatingDays, [0, 1, 2, 3, 4, 5, 6]);
      assert.ok(wingSpot.dailyWindows, 'Wing Spot must define per-day weekly windows');
      assert.strictEqual(wingSpot.dailyWindows[6][0].openHour, 12);
      assert.strictEqual(wingSpot.dailyWindows[6][0].closeHour, 3);
      assert.strictEqual(wingSpot.dailyWindows[0][0].openHour, 15);
      assert.strictEqual(wingSpot.dailyWindows[0][0].closeHour, 24);
      assert.strictEqual(wingSpot.dailyWindows[3].length, 2);
      assert.strictEqual(wingSpot.lastEntryCutoffMinutes, 15);

      const tiaLupe = findBusinessSchedule(TIA_LUPE_ID);
      assert.ok(tiaLupe, 'Tia Lupe schedule must exist');
      assert.strictEqual(tiaLupe.businessId, TIA_LUPE_ID);
      assert.strictEqual(tiaLupe.timeZone, 'America/Ciudad_Juarez');
      assert.deepStrictEqual(tiaLupe.operatingDays, [1, 2, 3, 4, 5, 6]);
      assert.strictEqual(tiaLupe.hours.openHour, 9);
      assert.strictEqual(tiaLupe.hours.closeHour, 18);
      assert.strictEqual(tiaLupe.lastEntryCutoffMinutes, 15);

      const benavides = findBusinessSchedule('pharmacy:farmacias-benavides');
      assert.ok(benavides, 'Farmacias Benavides schedule must exist');
      assert.strictEqual(benavides.name, 'Farmacias Benavides');
      assert.strictEqual(benavides.hours.openHour, 7);
      assert.strictEqual(benavides.hours.closeHour, 22);
      assert.strictEqual(benavides.lastEntryCutoffMinutes, 0);

      const optica = findBusinessSchedule('optical:optica-fashion');
      assert.ok(optica, 'Óptica Fashion schedule must exist');
      assert.strictEqual(optica.name, 'Óptica Fashion');
      assert.strictEqual(optica.hours.openHour, 9);
      assert.strictEqual(optica.hours.closeHour, 17);
      assert.strictEqual(optica.lastEntryCutoffMinutes, 0);
    });

    it('returns null for unknown business IDs', () => {
      assert.strictEqual(findBusinessSchedule('restaurant:nonexistent'), null);
      assert.strictEqual(findBusinessSchedule(''), null);
    });
  });

  describe('2. Schedule Evaluation Across Time Boundaries (America/Ciudad_Juarez)', () => {
    // 2026-10-24 is Saturday (MDT = UTC-6 in Ciudad Juárez).
    // Wing Spot Saturday hours: 12:00 PM - 03:00 AM (spills into Sunday 00:00 - 03:00)
    // Wing Spot Sunday hours: 3:00 PM - 12:00 AM
    // Wing Spot Wednesday hours: 12:00 AM - 01:00 AM and 12:00 PM - 01:00 AM (spills into Thursday)
    const schedule = DEFAULT_BUSINESS_SCHEDULES[WING_SPOT_ID];

    it('evaluates status as closed on Saturday morning before 12:00 PM', () => {
      // 11:59:59 local on Saturday 2026-10-24
      const status = evaluateBusinessScheduleStatus(schedule, '2026-10-24T17:59:59.000Z');
      assert.strictEqual(status, 'closed');
    });

    it('evaluates status as open Saturday 12:00 PM through Sunday 02:44 AM overnight spillover', () => {
      // Saturday 12:00:00 local = 18:00 UTC
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-24T18:00:00.000Z'), 'open');
      // Saturday 23:30:00 local = Sunday 05:30 UTC
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-25T05:30:00.000Z'), 'open');
      // Sunday 02:44:59 local (Saturday overnight spillover) = Sunday 08:44:59 UTC
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-25T08:44:59.000Z'), 'open');
    });

    it('evaluates status as closing-soon at 02:45 AM cutoff and closed at 03:00 AM', () => {
      // Sunday 02:45:00 local = 08:45 UTC
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-25T08:45:00.000Z'), 'closing-soon');
      // Sunday 03:00:00 local = 09:00 UTC
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-25T09:00:00.000Z'), 'closed');
    });

    it('evaluates Sunday 3:00 PM - 12:00 AM and Wednesday split/overnight shifts', () => {
      // Sunday 14:59 local = closed; Sunday 15:00 local = open; Sunday 23:46 local = closing-soon; Monday 00:00 local = closed
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-25T20:59:00.000Z'), 'closed');
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-25T21:00:00.000Z'), 'open');
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-26T05:46:00.000Z'), 'closing-soon');
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-26T06:00:00.000Z'), 'closed');

      // Wednesday 2026-10-28: 00:30 local = open; 01:00 local = closed; 12:00 local = open; Thu 00:30 local = open; Thu 01:00 local = closed
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-28T06:30:00.000Z'), 'open');
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-28T07:00:00.000Z'), 'closed');
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-28T18:00:00.000Z'), 'open');
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-29T06:30:00.000Z'), 'open');
      assert.strictEqual(evaluateBusinessScheduleStatus(schedule, '2026-10-29T07:00:00.000Z'), 'closed');
    });
  });

  describe('3. Admission Policy Decision Logic', () => {
    const schedule = DEFAULT_BUSINESS_SCHEDULES[WING_SPOT_ID];

    it('permits admission when status is open', () => {
      // Saturday 15:00 local = 21:00 UTC
      const decision = evaluateBusinessAdmission(schedule, '2026-10-24T21:00:00.000Z');
      assert.strictEqual(decision.permitted, true);
      assert.strictEqual(decision.code, 'permitted');
      assert.strictEqual(decision.status, 'open');
    });

    it('rejects admission with admission-cutoff-reached when status is closing-soon', () => {
      // Sunday 02:46 local (Saturday overnight cutoff) = 08:46 UTC
      const decision = evaluateBusinessAdmission(schedule, '2026-10-25T08:46:00.000Z');
      assert.strictEqual(decision.permitted, false);
      assert.strictEqual(decision.code, 'admission-cutoff-reached');
      assert.strictEqual(decision.status, 'closing-soon');
      assert.ok(decision.message.includes('03:00'), 'Feedback message must mention 03:00 closing time');
    });

    it('rejects admission with business-closed when status is closed', () => {
      // Saturday 10:00 local = 16:00 UTC
      const decision = evaluateBusinessAdmission(schedule, '2026-10-24T16:00:00.000Z');
      assert.strictEqual(decision.permitted, false);
      assert.strictEqual(decision.code, 'business-closed');
      assert.strictEqual(decision.status, 'closed');
    });
  });

  describe('4. Physical Threshold & Access Control Integration', () => {
    const ENTRANCE_ID = 'entrance:wing-spot-main';

    it('allows physical entrance during open hours and rejects at last-entry cutoff', () => {
      // 12:00 local (open)
      const clockOpen = WorldClock.create('2026-10-24T18:00:00.000Z');
      const stateOpen = createGomezMorinWorldState(clockOpen);
      const player = stateOpen.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      player.interiorSpaceId = null;

      const enterOpen = enterThroughEntranceThreshold(stateOpen, {
        agentId: player.id,
        entranceId: ENTRANCE_ID,
      });
      assert.strictEqual(enterOpen.success, true);
      assert.strictEqual(enterOpen.code, 'success');
      assert.strictEqual(player.locationId, WING_SPOT_ID);
      assert.strictEqual(player.interiorSpaceId, 'interior:wing-spot');

      // 17:46 local (cutoff reached)
      const clockCutoff = WorldClock.create('2026-10-24T23:46:00.000Z');
      const stateCutoff = createGomezMorinWorldState(clockCutoff);
      // Synchronize operational state to closing-soon
      const wingSpot = stateCutoff.restaurants.find((r) => r.id === WING_SPOT_ID)!;
      wingSpot.operationalState = 'closing-soon';

      const player2 = stateCutoff.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player2.locationId = 'street:blvd-gomez-morin';
      player2.interiorSpaceId = null;

      const enterCutoff = enterThroughEntranceThreshold(stateCutoff, {
        agentId: player2.id,
        entranceId: ENTRANCE_ID,
      });
      assert.strictEqual(enterCutoff.success, false);
      assert.strictEqual(enterCutoff.code, 'admission-cutoff-reached');
      // Player remains outside
      assert.strictEqual(player2.locationId, 'street:blvd-gomez-morin');
      assert.strictEqual(player2.interiorSpaceId, null);
    });

    it('permits exit through entrance threshold even after cutoff and when closed', () => {
      // 17:46 local (closing-soon)
      const clockCutoff = WorldClock.create('2026-10-24T23:46:00.000Z');
      const state = createGomezMorinWorldState(clockCutoff);
      const wingSpot = state.restaurants.find((r) => r.id === WING_SPOT_ID)!;
      wingSpot.operationalState = 'closing-soon';

      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = WING_SPOT_ID;
      player.interiorSpaceId = 'interior:wing-spot';

      const exitCutoff = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: ENTRANCE_ID,
      });
      assert.strictEqual(exitCutoff.success, true);
      assert.strictEqual(exitCutoff.code, 'success');
      assert.strictEqual(player.locationId, 'street:blvd-gomez-morin');
      assert.strictEqual(player.interiorSpaceId, null);

      // Now set to closed at 18:05
      wingSpot.operationalState = 'closed';
      player.locationId = WING_SPOT_ID;
      player.interiorSpaceId = 'interior:wing-spot';

      const exitClosed = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: ENTRANCE_ID,
      });
      assert.strictEqual(exitClosed.success, true);
      assert.strictEqual(exitClosed.code, 'success');
      assert.strictEqual(player.locationId, 'street:blvd-gomez-morin');
      assert.strictEqual(player.interiorSpaceId, null);
    });

    it('enterRestaurant rejects entry at cutoff for scheduled businesses', () => {
      const clock = WorldClock.create('2026-10-24T23:46:00.000Z');
      const state = createGomezMorinWorldState(clock);
      const wingSpot = state.restaurants.find((r) => r.id === WING_SPOT_ID)!;
      wingSpot.operationalState = 'closing-soon';

      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'building:wing-spot-strip';

      const res = enterRestaurant(state, player.id, WING_SPOT_ID);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'admission-cutoff-reached');
    });
  });

  describe('5. Schema Version Preservation', () => {
    it('maintains CURRENT_WORLD_STATE_VERSION as 19', () => {
      assert.strictEqual(CURRENT_WORLD_STATE_VERSION, 19);
    });
  });
});
