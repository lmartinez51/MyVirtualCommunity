import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  enterBuilding,
  leaveBuilding,
  getSiteResident,
  isResidentialBuilding,
  evaluateResidentialAccess,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import { SiteAgentAssociation } from '../src/core/site-agent-association.js';

describe('Milestone 58: Residential Access Foundation', () => {
  // Morning 08:00 AM local Ciudad Juárez time (14:00 UTC)
  // dev-npc schedule places NPC at building:development-residence (Home / Rest)
  const MORNING_HOME_TIME = '2026-09-14T14:00:00.000Z';

  // Work shift 09:00 AM local Ciudad Juárez time (15:00 UTC)
  // dev-npc schedule places NPC at restaurant:development-restaurant (Work)
  const WORK_SHIFT_TIME = '2026-09-14T15:00:00.000Z';

  // Evening 21:00 PM local Ciudad Juárez time (03:00 UTC next day)
  // dev-npc schedule places NPC at building:development-residence (Home / Night)
  const NIGHT_HOME_TIME = '2026-09-15T03:00:00.000Z';

  function setupPlayerOnStreet(timeIso: string = MORNING_HOME_TIME) {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const leaveRes = leaveBuilding(state, 'agent:dev-player', 'building:development-building');
    assert.equal(leaveRes.success, true);
    assert.equal(leaveRes.code, 'success');
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    assert.equal(player.locationId, 'street:development-street');
    return { clock, state, player };
  }

  // =========================================================================
  // 1. Pure Evaluator & Residential Detection
  // =========================================================================
  describe('1. Pure Evaluator & Residential Detection', () => {
    it('isResidentialBuilding identifies residential sites exclusively via SiteAgentAssociation', () => {
      const { state } = setupPlayerOnStreet();

      // building:development-residence has resident association
      assert.equal(isResidentialBuilding(state, 'building:development-residence'), true);

      // building:development-building has NO resident association
      assert.equal(isResidentialBuilding(state, 'building:development-building'), false);

      // street has NO resident association
      assert.equal(isResidentialBuilding(state, 'street:development-street'), false);

      // restaurant has attendant association, NOT resident association
      assert.equal(isResidentialBuilding(state, 'restaurant:development-restaurant'), false);
    });

    it('evaluateResidentialAccess is a pure function that never mutates world state', () => {
      const { state } = setupPlayerOnStreet();
      const snapshotBefore = JSON.stringify(state);

      const result1 = evaluateResidentialAccess(state, 'agent:dev-player', 'building:development-residence');
      assert.equal(result1.allowed, true);
      assert.equal(result1.code, 'allowed');
      assert.equal(JSON.stringify(state), snapshotBefore);

      const result2 = evaluateResidentialAccess(state, 'agent:dev-player', 'building:development-building');
      assert.equal(result2.allowed, false);
      assert.equal(result2.code, 'resident-not-found');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    it('returns "resident-not-found" when evaluating a non-residential building', () => {
      const { state } = setupPlayerOnStreet();
      const result = evaluateResidentialAccess(state, 'agent:dev-player', 'building:development-building');
      assert.equal(result.allowed, false);
      assert.equal(result.code, 'resident-not-found');
      assert.match(result.message, /does not have an associated resident/);
    });

    it('returns "resident-agent-missing" when association references non-existent agent without crashing', () => {
      const { state } = setupPlayerOnStreet();
      const corruptedState = {
        ...state,
        siteAgentAssociations: [
          ...state.siteAgentAssociations.filter((a) => a.placeId !== 'building:development-residence'),
          {
            placeId: 'building:development-residence',
            agentId: 'agent:ghost-npc',
            role: 'resident' as const,
          },
        ],
      };

      const result = evaluateResidentialAccess(corruptedState, 'agent:dev-player', 'building:development-residence');
      assert.equal(result.allowed, false);
      assert.equal(result.code, 'resident-agent-missing');
      assert.equal(result.residentId, 'agent:ghost-npc');
      assert.match(result.message, /was not found in world state/);
    });
  });

  // =========================================================================
  // 2. Generic Building Entry (Regression Preservation)
  // =========================================================================
  describe('2. Generic Building Entry (Regression Preservation)', () => {
    it('generic building without resident association remains enterable at all times', () => {
      const { state, player } = setupPlayerOnStreet(WORK_SHIFT_TIME);

      const result = enterBuilding(state, player.id, 'building:development-building');
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(player.locationId, 'building:development-building');
    });

    it('does not alter non-residential building traversal semantics or result codes', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);

      const result = enterBuilding(state, player.id, 'building:development-building');
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.streetId, 'street:development-street');
    });
  });

  // =========================================================================
  // 3. Residential Presence-Based Access Rule
  // =========================================================================
  describe('3. Residential Presence-Based Access Rule', () => {
    it('prohibits direct enterBuilding into residence with "residential-interaction-required"', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);

      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(devNpc.locationId, 'building:development-residence');

      // Pure evaluator permits access based on presence
      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');
      assert.equal(access.allowed, true);
      assert.equal(access.code, 'allowed');

      // Direct entry is prohibited under M59
      const result = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'residential-interaction-required');
      assert.equal(result.buildingId, 'building:development-residence');
      assert.equal(result.streetId, 'street:development-street');
      assert.equal(player.locationId, 'street:development-street');
    });

    it('denies entry with "resident-not-home" when designated resident is away from home', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);

      // Move resident to restaurant (away from home)
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      devNpc.locationId = 'restaurant:development-restaurant';

      const snapshotBefore = JSON.stringify(state);
      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');

      assert.equal(access.allowed, false);
      assert.equal(access.code, 'resident-not-home');
      assert.match(access.message, /not currently at home/);

      const result = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'residential-interaction-required');
      assert.equal(player.locationId, 'street:development-street');

      // Zero state mutation guarantee
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    it('denies entry with "resident-not-home" when resident is on street during commute', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);

      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      devNpc.locationId = 'street:development-street'; // On morning commute

      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');
      assert.equal(access.allowed, false);
      assert.equal(access.code, 'resident-not-home');
      assert.equal(player.locationId, 'street:development-street');
    });

    it('denies entry with "resident-agent-missing" when resident entity is missing from world state', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);

      // Corrupt state with missing resident agent
      const stateWithMissingAgent = {
        ...state,
        agents: state.agents.filter((a) => a.id !== 'agent:dev-npc'),
      };

      const access = evaluateResidentialAccess(stateWithMissingAgent, player.id, 'building:development-residence');
      assert.equal(access.allowed, false);
      assert.equal(access.code, 'resident-agent-missing');
      assert.match(access.message, /was not found in world state/);
    });
  });

  // =========================================================================
  // 4. Natural Dynamic Access Across Development NPC Schedule
  // =========================================================================
  describe('4. Natural Dynamic Access Across Development NPC Schedule', () => {
    it('residence is naturally accessible at 08:00 AM local (resident at home before commute)', () => {
      const clock = WorldClock.create(MORNING_HOME_TIME); // 08:00 AM local
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(devNpc.locationId, 'building:development-residence');

      // Place player on street
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');
      assert.equal(access.allowed, true);
      assert.equal(access.code, 'allowed');

      const result = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'residential-interaction-required');
      assert.equal(player.locationId, 'street:development-street');
    });

    it('residence becomes naturally inaccessible at 09:00 AM local when NPC moves to work shift', () => {
      const clock = WorldClock.create(WORK_SHIFT_TIME); // 09:00 AM local
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Evaluates NPC location rule -> restaurant:development-restaurant

      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

      // Place player on street
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');
      assert.equal(access.allowed, false);
      assert.equal(access.code, 'resident-not-home');
      assert.equal(player.locationId, 'street:development-street');
    });

    it('residence becomes naturally accessible again at 21:00 PM local when NPC returns home', () => {
      const clock = WorldClock.create(NIGHT_HOME_TIME); // 21:00 PM local
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Evaluates NPC location rule -> building:development-residence

      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(devNpc.locationId, 'building:development-residence');

      // Place player on street
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');
      assert.equal(access.allowed, true);
      assert.equal(access.code, 'allowed');

      const result = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'residential-interaction-required');
      assert.equal(player.locationId, 'street:development-street');
    });
  });

  // =========================================================================
  // 5. Precedence of Existing Standard Preconditions
  // =========================================================================
  describe('5. Precedence of Existing Standard Preconditions', () => {
    it('fails with "agent-not-found" before evaluating residential access', () => {
      const { state } = setupPlayerOnStreet(MORNING_HOME_TIME);
      const result = enterBuilding(state, 'agent:unknown-ghost', 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-found');
    });

    it('fails with "agent-not-player" before evaluating residential access', () => {
      const { state } = setupPlayerOnStreet(MORNING_HOME_TIME);
      const result = enterBuilding(state, 'agent:dev-npc', 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-player');
    });

    it('fails with "building-not-found" before evaluating residential access', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);
      const result = enterBuilding(state, player.id, 'building:non-existent');
      assert.equal(result.success, false);
      assert.equal(result.code, 'building-not-found');
    });

    it('fails with "already-inside" before evaluating residential access', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);
      // Place player inside residence
      player.locationId = 'building:development-residence';

      const result = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'already-inside');
    });

    it('fails with "invalid-location" when player is not on parent street before evaluating residential access', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);
      // Player is in development-building, not on street:development-street
      player.locationId = 'building:development-building';

      const result = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-location');
    });
  });

  // =========================================================================
  // 6. Domain Boundary Separations (Zero Coupling Invariants)
  // =========================================================================
  describe('6. Domain Boundary Separations (Zero Coupling Invariants)', () => {
    it('Property.assignment is NEVER consulted: unassigned residence is enterable if resident is home', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);

      const residenceProperty = state.properties.find(
        (p) => p.buildingId === 'building:development-residence'
      )!;
      assert.ok(residenceProperty);
      assert.equal(residenceProperty.assignment.status, 'unassigned');

      // Access succeeds purely based on resident presence, regardless of unassigned property status
      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');
      assert.equal(access.allowed, true);
      assert.equal(access.code, 'allowed');
    });

    it('Property.assignment is NEVER consulted: assigned property does NOT bypass resident presence', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);

      // Simulate assigning the property to someone else
      const residenceProperty = state.properties.find(
        (p) => p.buildingId === 'building:development-residence'
      )!;
      (residenceProperty.assignment as any) = {
        status: 'assigned',
        holder: { holderType: 'agent', holderId: 'agent:some-other-holder' },
        assignedAt: MORNING_HOME_TIME,
      };

      // Resident NPC is away
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      devNpc.locationId = 'restaurant:development-restaurant';

      // Entry must be denied despite property assignment
      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');
      assert.equal(access.allowed, false);
      assert.equal(access.code, 'resident-not-home');
    });

    it('activityState is NOT used to deny access: idle resident at home permits entry', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);

      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      devNpc.locationId = 'building:development-residence';
      devNpc.activityState = 'idle'; // Off-shift / resting

      // Access must succeed; activityState === 'idle' does NOT mean visitor lockout
      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');
      assert.equal(access.allowed, true);
      assert.equal(access.code, 'allowed');
    });

    it('activityState active resident at home permits entry', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);

      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      devNpc.locationId = 'building:development-residence';
      devNpc.activityState = 'active';

      const access = evaluateResidentialAccess(state, player.id, 'building:development-residence');
      assert.equal(access.allowed, true);
      assert.equal(access.code, 'allowed');
    });

    it('maintains schema version 18 throughout', () => {
      const { state, player } = setupPlayerOnStreet(MORNING_HOME_TIME);
      enterBuilding(state, player.id, 'building:development-residence');

      assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
      assert.equal(state.version, 19);
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });
});
