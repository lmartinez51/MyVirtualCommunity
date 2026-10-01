import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  introduceToAgent,
  isAgentAcquainted,
  inquireAgentSchedule,
  inspectCurrentLocation,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  purchaseOffering,
  inspectPlayerHistory,
  DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  DEVELOPMENT_NPC_WORK_SCHEDULE,
  formatHourUtc,
} from '../src/core/world-state.js';
import { Agent } from '../src/core/entities/agent.js';
import {
  DEFAULT_DEVELOPMENT_ACTIVE_INTERVAL,
  evaluateDevelopmentNpcLocationRule,
} from '../src/core/simulation.js';
import { evaluateDevelopmentRestaurantOperationalRule } from '../src/core/entities/restaurant.js';

describe('Milestone 26: Minimal Relational Inquiry & Epistemic Grounding', () => {
  // 08:00 local civil time in Ciudad Juárez (UTC-6)
  const MORNING_TIME = '2026-09-14T14:00:00.000Z';

  function setupWorldAt(timeIso: string = MORNING_TIME): { clock: WorldClock; state: WorldState; sim: Simulation } {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    return { clock, state, sim };
  }

  describe('1. Preconditions & Rejection Codes', () => {
    test('1. Rejects when player does not exist (player-not-found)', () => {
      const { state } = setupWorldAt();
      const result = inquireAgentSchedule(state, 'agent:ghost-player', 'agent:dev-npc');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'player-not-found');
      assert.strictEqual(result.schedule, undefined);
    });

    test('2. Rejects when querying agent is not a player (player-not-player)', () => {
      const { state } = setupWorldAt();
      // Dev NPC trying to query Dev Player
      const result = inquireAgentSchedule(state, 'agent:dev-npc', 'agent:dev-player');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'player-not-player');
      assert.strictEqual(result.schedule, undefined);
    });

    test('3. Rejects when target NPC does not exist (npc-not-found)', () => {
      const { state } = setupWorldAt();
      const result = inquireAgentSchedule(state, 'agent:dev-player', 'agent:ghost-npc');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'npc-not-found');
      assert.strictEqual(result.schedule, undefined);
    });

    test('4. Rejects when target is not an NPC (target-not-npc)', () => {
      const { state } = setupWorldAt();
      // Dev player querying itself
      const result = inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-player');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'target-not-npc');
      assert.strictEqual(result.schedule, undefined);
    });

    test('5. Rejects when agents are not co-located (agents-not-co-located)', () => {
      const { state } = setupWorldAt();
      // At 08:00, player is at building:development-building, NPC is at building:development-residence
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.notStrictEqual(player.locationId, npc.locationId);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agents-not-co-located');
      assert.strictEqual(result.schedule, undefined);
    });

    test('6. Rejects when agents are co-located but are strangers (not-acquainted)', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // Co-locate at development building without introducing
      npc.locationId = player.locationId;
      assert.strictEqual(isAgentAcquainted(state, player.id, npc.id), false);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'not-acquainted');
      assert.strictEqual(result.schedule, undefined);
    });

    test('7. Rejects when NPC has no scheduled workplace (no-scheduled-work)', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Add a secondary generic NPC with no routine/scheduled workplace
      const genericNpc: Agent = {
        id: 'agent:generic-npc',
        type: 'agent',
        name: 'Generic Bystander',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: state.worldTime,
        locationId: player.locationId,
        balanceMinor: 0,
        currency: 'USD',
        playerActivity: null,
      };
      state.agents.push(genericNpc);

      // Introduce them so they are acquainted
      introduceToAgent(state, player.id, genericNpc.id);
      assert.strictEqual(isAgentAcquainted(state, player.id, genericNpc.id), true);

      const result = inquireAgentSchedule(state, player.id, genericNpc.id);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'no-scheduled-work');
      assert.strictEqual(result.schedule, undefined);
    });
  });

  describe('2. Success & Epistemic Boundary', () => {
    test('8. Acquainted player can successfully inquire about schedule when co-located', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // Co-locate and introduce
      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.code, 'success');
      assert.ok(result.schedule);
    });

    test('9. Result contains exact workplace: restaurant:development-restaurant', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(result.schedule?.workplaceId, 'restaurant:development-restaurant');
    });

    test('10. Result contains exact shift start: 09:00', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(result.schedule?.shiftStart, '09:00');
    });

    test('11. Result contains exact shift end: 17:00', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(result.schedule?.shiftEnd, '17:00');
    });

    test('12. Result contains strictly NO offeringId or product information', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual((result.schedule as Record<string, unknown>).offeringId, undefined);
      assert.strictEqual((result as Record<string, unknown>).offeringId, undefined);
      assert.strictEqual(JSON.stringify(result).includes(DEVELOPMENT_PASTRY_OFFERING_ID), false);
      assert.strictEqual(JSON.stringify(result).toLowerCase().includes('pan dulce'), false);
      assert.strictEqual(JSON.stringify(result).toLowerCase().includes('pastry'), false);
    });

    test('13. Result contains strictly NO private NPC state', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      const scheduleRecord = result.schedule as Record<string, unknown>;
      assert.strictEqual(scheduleRecord.balanceMinor, undefined);
      assert.strictEqual(scheduleRecord.activityState, undefined);
      assert.strictEqual(scheduleRecord.activitySince, undefined);
      assert.strictEqual(scheduleRecord.residence, undefined);
      assert.strictEqual(scheduleRecord.currency, undefined);
    });
  });

  describe('3. Nonmutation & Purity', () => {
    test('14. Successful inquiry mutates ONLY state.knowledge via single-record upsert', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const { knowledge: beforeK, ...beforeRest } = state;
      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(result.success, true);
      const { knowledge: afterK, ...afterRest } = state;

      assert.deepStrictEqual(beforeRest, afterRest);
      assert.strictEqual(afterK.length, 1);
      assert.strictEqual(afterK[0].agentId, player.id);
      assert.strictEqual(afterK[0].subjectId, npc.id);
      assert.strictEqual(afterK[0].factType, 'agent-schedule');
    });

    test('15. Repeated inquiries produce identical results with single-record upsert', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const r1 = inquireAgentSchedule(state, player.id, npc.id);
      const r2 = inquireAgentSchedule(state, player.id, npc.id);
      const r3 = inquireAgentSchedule(state, player.id, npc.id);

      assert.deepStrictEqual(r1, r2);
      assert.deepStrictEqual(r2, r3);
      assert.strictEqual(state.knowledge.length, 1);
    });

    test('16. Stranger rejection causes ZERO state mutation to WorldState', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      const beforeJson = JSON.stringify(state);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'not-acquainted');

      const afterJson = JSON.stringify(state);
      assert.strictEqual(beforeJson, afterJson);
    });
  });

  describe('4. Spatial / Temporal Independence & Non-Interference', () => {
    test('17. Inquiry succeeds wherever the two agents are legitimately co-located', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // Co-locate and introduce
      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const testLocations = [
        'street:development-street',
        'street:avenida-juarez',
        'building:development-building',
        'building:development-residence',
        'building:avenida-juarez-kiosk',
        'restaurant:development-restaurant',
      ];

      for (const locId of testLocations) {
        player.locationId = locId;
        npc.locationId = locId;

        const result = inquireAgentSchedule(state, player.id, npc.id);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.schedule?.workplaceId, 'restaurant:development-restaurant');
        assert.strictEqual(result.schedule?.shiftStart, '09:00');
        assert.strictEqual(result.schedule?.shiftEnd, '17:00');
      }
    });

    test('18. NPC schedule remains invariant regardless of time of inquiry', () => {
      const { clock, state, sim } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      // Check early morning (08:00)
      const resMorning = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(resMorning.schedule?.shiftStart, '09:00');
      assert.strictEqual(resMorning.schedule?.shiftEnd, '17:00');

      // Advance clock to evening (18:00)
      clock.advance(10 * 3600_000);
      sim.tick();
      player.locationId = npc.locationId;

      const resEvening = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(resEvening.schedule?.shiftStart, '09:00');
      assert.strictEqual(resEvening.schedule?.shiftEnd, '17:00');
    });

    test('19. Inquiry does NOT move either agent', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'street:development-street';
      npc.locationId = 'street:development-street';
      introduceToAgent(state, player.id, npc.id);

      inquireAgentSchedule(state, player.id, npc.id);

      assert.strictEqual(player.locationId, 'street:development-street');
      assert.strictEqual(npc.locationId, 'street:development-street');
    });

    test('20. Inquiry does NOT alter NPC activityState or activitySince', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'street:development-street';
      npc.locationId = 'street:development-street';
      introduceToAgent(state, player.id, npc.id);

      const beforeActivity = npc.activityState;
      const beforeSince = npc.activitySince;

      inquireAgentSchedule(state, player.id, npc.id);

      assert.strictEqual(npc.activityState, beforeActivity);
      assert.strictEqual(npc.activitySince, beforeSince);
    });

    test('21. Inquiry does NOT alter restaurant operationalState or balance', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      const rest = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

      player.locationId = 'street:development-street';
      npc.locationId = 'street:development-street';
      introduceToAgent(state, player.id, npc.id);

      const beforeState = rest.operationalState;
      const beforeBalance = rest.balanceMinor;

      inquireAgentSchedule(state, player.id, npc.id);

      assert.strictEqual(rest.operationalState, beforeState);
      assert.strictEqual(rest.balanceMinor, beforeBalance);
    });

    test('22. Inquiry does NOT create an opportunity at any location', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'street:development-street';
      npc.locationId = 'street:development-street';
      introduceToAgent(state, player.id, npc.id);

      // Inquire
      const inquiryRes = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(inquiryRes.success, true);

      // Inspect street: no opportunities on street
      const streetInspect = inspectCurrentLocation(state, player.id);
      assert.strictEqual(streetInspect.location?.opportunities, undefined);

      // Inspect restaurant while restaurant is still closed at 08:00: no opportunities
      player.locationId = 'restaurant:development-restaurant';
      const restInspect = inspectCurrentLocation(state, player.id);
      assert.deepStrictEqual(restInspect.location?.opportunities, []);
    });
  });

  describe('5. Complete Integration Flow (Inquiry → Navigation → Opportunity → Purchase)', () => {
    test('23–30. Full causal flow: acquaintance → inquiry on commute → informed travel → opportunity perception → purchase', () => {
      const { clock, state, sim } = setupWorldAt(MORNING_TIME);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

      // Step 23: Establish acquaintance in morning
      player.locationId = 'street:development-street';
      npc.locationId = 'street:development-street';
      const intro = introduceToAgent(state, player.id, npc.id);
      assert.strictEqual(intro.success, true);
      assert.strictEqual(isAgentAcquainted(state, player.id, npc.id), true);

      // Step 24: Advance to commute window 08:35 UTC
      clock.advance(35 * 60_000); // 08:35 UTC
      sim.tick();
      assert.strictEqual(npc.locationId, 'street:development-street');
      assert.strictEqual(player.locationId, 'street:development-street');

      // Step 25: Player inquires about NPC schedule during commute
      const inquiry = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(inquiry.success, true);
      assert.strictEqual(inquiry.schedule?.workplaceId, 'restaurant:development-restaurant');
      assert.strictEqual(inquiry.schedule?.shiftStart, '09:00');
      assert.strictEqual(inquiry.schedule?.shiftEnd, '17:00');

      // Step 26: Player uses returned workplace/time information to navigate toward workplace building
      const enterBld = enterBuilding(state, player.id, 'building:development-building');
      assert.strictEqual(enterBld.success, true);
      assert.strictEqual(player.locationId, 'building:development-building');

      // Step 27: At 09:00, simulation tick triggers restaurant opening, NPC routine arrival, and shift activation
      clock.advance(25 * 60_000); // 09:00 UTC
      sim.tick();
      assert.strictEqual(restaurant.operationalState, 'open');
      assert.strictEqual(npc.locationId, 'restaurant:development-restaurant');
      assert.strictEqual(npc.activityState, 'active');

      // Player enters restaurant during open work hours
      const enterRest = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
      assert.strictEqual(enterRest.success, true);
      assert.strictEqual(player.locationId, 'restaurant:development-restaurant');

      // Step 28: Existing Pan Dulce opportunity appears through normal local perception
      const perception = inspectCurrentLocation(state, player.id);
      assert.strictEqual(perception.success, true);
      const opportunities = perception.location?.opportunities ?? [];
      assert.strictEqual(opportunities.length, 1);
      assert.strictEqual(opportunities[0].id, DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID);
      assert.strictEqual(opportunities[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

      // Step 29: Player independently chooses to purchase Pan Dulce based on observed opportunity
      const initialPlayerBalance = player.balanceMinor;
      const initialRestBalance = restaurant.balanceMinor;

      const purchaseResult = purchaseOffering(
        state,
        player.id,
        opportunities[0].offeringId,
        restaurant.id
      );
      assert.strictEqual(purchaseResult.success, true);
      assert.strictEqual(purchaseResult.code, 'success');
      assert.strictEqual(player.balanceMinor, initialPlayerBalance - 250);
      assert.strictEqual(restaurant.balanceMinor, initialRestBalance + 250);

      // Step 30: Existing purchase history authoritatively records the transaction
      const historyResult = inspectPlayerHistory(state, player.id);
      assert.strictEqual(historyResult.success, true);
      assert.strictEqual(historyResult.history?.purchases.length, 1);
      assert.strictEqual(
        historyResult.history?.purchases[0].offeringId,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );
    });
  });

  describe('6. Single Source of Truth & Authority Harmonization', () => {
    test('31. Source consistency: inquiry schedule matches DEVELOPMENT_NPC_WORK_SCHEDULE exactly', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      npc.locationId = player.locationId;
      introduceToAgent(state, player.id, npc.id);

      const result = inquireAgentSchedule(state, player.id, npc.id);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.schedule?.workplaceId, DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId);
      assert.strictEqual(
        result.schedule?.shiftStart,
        formatHourUtc(DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHourUtc)
      );
      assert.strictEqual(
        result.schedule?.shiftEnd,
        formatHourUtc(DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHourUtc)
      );
    });

    test('32. Simulation active interval derives from DEVELOPMENT_NPC_WORK_SCHEDULE', () => {
      assert.strictEqual(
        DEFAULT_DEVELOPMENT_ACTIVE_INTERVAL.startHourUtc,
        DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHourUtc
      );
      assert.strictEqual(
        DEFAULT_DEVELOPMENT_ACTIVE_INTERVAL.endHourUtc,
        DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHourUtc
      );
    });

    test('33. Existing NPC routine boundaries remain strictly invariant', () => {
      // 08:29 -> residence
      assert.strictEqual(
        evaluateDevelopmentNpcLocationRule('2026-09-14T08:29:59.999Z', 'UTC'),
        'building:development-residence'
      );
      // 08:30 -> development street
      assert.strictEqual(
        evaluateDevelopmentNpcLocationRule('2026-09-14T08:30:00.000Z', 'UTC'),
        'street:development-street'
      );
      // 08:59 -> development street
      assert.strictEqual(
        evaluateDevelopmentNpcLocationRule('2026-09-14T08:59:59.999Z', 'UTC'),
        'street:development-street'
      );
      // 09:00 -> restaurant (from DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId)
      assert.strictEqual(
        evaluateDevelopmentNpcLocationRule('2026-09-14T09:00:00.000Z', 'UTC'),
        DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId
      );
      // 16:59 -> restaurant (from DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId)
      assert.strictEqual(
        evaluateDevelopmentNpcLocationRule('2026-09-14T16:59:59.999Z', 'UTC'),
        DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId
      );
      // 17:00 -> Avenida Juárez
      assert.strictEqual(
        evaluateDevelopmentNpcLocationRule('2026-09-14T17:00:00.000Z', 'UTC'),
        'street:avenida-juarez'
      );
      // 20:30 -> residence
      assert.strictEqual(
        evaluateDevelopmentNpcLocationRule('2026-09-14T20:30:00.000Z', 'UTC'),
        'building:development-residence'
      );
    });

    test('34. Restaurant operational rule derives from DEVELOPMENT_NPC_WORK_SCHEDULE boundaries', () => {
      // 08:59 -> closed
      assert.strictEqual(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-14T08:59:59.999Z', 'UTC'),
        'closed'
      );
      // 09:00 -> open
      assert.strictEqual(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-14T09:00:00.000Z', 'UTC'),
        'open'
      );
      // 16:44:59.999 -> open
      assert.strictEqual(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-14T16:44:59.999Z', 'UTC'),
        'open'
      );
      // 16:59 -> closing-soon
      assert.strictEqual(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-14T16:59:59.999Z', 'UTC'),
        'closing-soon'
      );
      // 17:00 -> closed
      assert.strictEqual(
        evaluateDevelopmentRestaurantOperationalRule('2026-09-14T17:00:00.000Z', 'UTC'),
        'closed'
      );
    });
  });
});
