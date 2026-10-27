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
    it('registers Wing Spot and Tía Lupe with authoritative schedule defaults', () => {
      const wingSpot = findBusinessSchedule(WING_SPOT_ID);
      assert.ok(wingSpot, 'Wing Spot schedule must exist');
      assert.strictEqual(wingSpot.businessId, WING_SPOT_ID);
      assert.strictEqual(wingSpot.timeZone, 'America/Ciudad_Juarez');
      assert.deepStrictEqual(wingSpot.operatingDays, [1, 2, 3, 4, 5, 6]);
      assert.strictEqual(wingSpot.hours.openHour, 9);
      assert.strictEqual(wingSpot.hours.openMinute, 0);
      assert.strictEqual(wingSpot.hours.closeHour, 18);
      assert.strictEqual(wingSpot.hours.closeMinute, 0);
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
    // In Ciudad Juárez (America/Ciudad_Juarez), UTC offset is UTC-6 during standard time / daylight rules.
    // 2026-10-24 is Saturday.
    // 09:00 local = 15:00 UTC
    // 17:44 local = 23:44 UTC
    // 17:45 local = 23:45 UTC (cutoff)
    // 18:00 local = 00:00 UTC (Sunday next day)
    const schedule = DEFAULT_BUSINESS_SCHEDULES[WING_SPOT_ID];

    it('evaluates status as closed before 09:00', () => {
      // 08:59:59 local on Saturday 2026-10-24
      const status = evaluateBusinessScheduleStatus(schedule, '2026-10-24T14:59:59.000Z');
      assert.strictEqual(status, 'closed');
    });

    it('evaluates status as open between 09:00 and 17:44', () => {
      // 09:00:00 local
      const statusOpen1 = evaluateBusinessScheduleStatus(schedule, '2026-10-24T15:00:00.000Z');
      assert.strictEqual(statusOpen1, 'open');

      // 17:44:59 local
      const statusOpen2 = evaluateBusinessScheduleStatus(schedule, '2026-10-24T23:44:59.000Z');
      assert.strictEqual(statusOpen2, 'open');
    });

    it('evaluates status as closing-soon at and after 17:45 cutoff until 18:00', () => {
      // 17:45:00 local
      const statusCutoff = evaluateBusinessScheduleStatus(schedule, '2026-10-24T23:45:00.000Z');
      assert.strictEqual(statusCutoff, 'closing-soon');

      // 17:59:59 local
      const statusLate = evaluateBusinessScheduleStatus(schedule, '2026-10-24T23:59:59.000Z');
      assert.strictEqual(statusLate, 'closing-soon');
    });

    it('evaluates status as closed at and after 18:00', () => {
      // 18:00:00 local
      const statusClosed = evaluateBusinessScheduleStatus(schedule, '2026-10-25T00:00:00.000Z');
      assert.strictEqual(statusClosed, 'closed');
    });

    it('evaluates status as closed all day Sunday', () => {
      // 2026-10-25 is Sunday. 12:00 local = 18:00 UTC
      const statusSunday = evaluateBusinessScheduleStatus(schedule, '2026-10-25T18:00:00.000Z');
      assert.strictEqual(statusSunday, 'closed');
    });
  });

  describe('3. Admission Policy Decision Logic', () => {
    const schedule = DEFAULT_BUSINESS_SCHEDULES[WING_SPOT_ID];

    it('permits admission when status is open', () => {
      const decision = evaluateBusinessAdmission(schedule, '2026-10-24T16:00:00.000Z');
      assert.strictEqual(decision.permitted, true);
      assert.strictEqual(decision.code, 'permitted');
      assert.strictEqual(decision.status, 'open');
    });

    it('rejects admission with admission-cutoff-reached when status is closing-soon', () => {
      const decision = evaluateBusinessAdmission(schedule, '2026-10-24T23:46:00.000Z');
      assert.strictEqual(decision.permitted, false);
      assert.strictEqual(decision.code, 'admission-cutoff-reached');
      assert.strictEqual(decision.status, 'closing-soon');
      assert.ok(decision.message.includes('18:00'), 'Feedback message must mention closing time');
    });

    it('rejects admission with business-closed when status is closed', () => {
      const decision = evaluateBusinessAdmission(schedule, '2026-10-25T01:00:00.000Z');
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
