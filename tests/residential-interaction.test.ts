import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  enterBuilding,
  leaveBuilding,
  greetAgent,
  introduceToAgent,
  inspectCurrentLocation,
  interactAtResidence,
  evaluateResidentialAdmissionPolicy,
  isResidentialBuilding,
  CURRENT_WORLD_STATE_VERSION,
  getCanonicalAgentPair,
  getAcquaintanceId,
  WorldState,
} from '../src/core/world-state.js';
import { createPresentationModel } from '../src/client/projections.js';

function makeAcquainted(state: WorldState, agentIdA: string, agentIdB: string) {
  const [first, second] = getCanonicalAgentPair(agentIdA, agentIdB);
  if (!state.acquaintances.some((a) => a.agentIds[0] === first && a.agentIds[1] === second)) {
    state.acquaintances.push({
      id: getAcquaintanceId(first, second),
      agentIds: [first, second],
      establishedAt: state.worldTime,
    });
  }
}

describe('Milestone 59: Residential Interaction Contract', () => {
  // 14:00 UTC = 08:00 AM local Juarez time (NPC is at home in development-residence)
  const MORNING_HOME_TIME = '2026-09-14T14:00:00.000Z';
  // 15:00 UTC = 09:00 AM local Juarez time (NPC is at restaurant:development-restaurant)
  const WORK_SHIFT_TIME = '2026-09-14T15:00:00.000Z';

  function setupWorldOnStreet(timeIso: string = MORNING_HOME_TIME) {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    sim.tick();

    // In seed state, player starts in building:development-building
    leaveBuilding(state, 'agent:dev-player', 'building:development-building');
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

    return { clock, state, sim, player, devNpc };
  }

  // =========================================================================
  // 1. Pure Residential Admission Policy Evaluator
  // =========================================================================
  describe('1. Pure Residential Admission Policy Evaluator', () => {
    it('denies admission with resident-not-home when resident is away', () => {
      const result = evaluateResidentialAdmissionPolicy(
        false, // not home
        true,  // acquainted
        'agent:dev-npc',
        'building:development-residence'
      );
      assert.equal(result.admitted, false);
      assert.equal(result.code, 'resident-not-home');
      assert.match(result.message, /not currently at home/);
    });

    it('denies admission with resident-declined-stranger when resident is home but visitor is stranger', () => {
      const result = evaluateResidentialAdmissionPolicy(
        true,  // home
        false, // stranger
        'agent:dev-npc',
        'building:development-residence'
      );
      assert.equal(result.admitted, false);
      assert.equal(result.code, 'resident-declined-stranger');
      assert.match(result.message, /does not recognize visitor/);
    });

    it('admits visitor when resident is home and visitor is acquainted', () => {
      const result = evaluateResidentialAdmissionPolicy(
        true,  // home
        true,  // acquainted
        'agent:dev-npc',
        'building:development-residence'
      );
      assert.equal(result.admitted, true);
      assert.equal(result.code, 'admitted');
      assert.match(result.message, /recognizes visitor, and admitted entry/);
    });
  });

  // =========================================================================
  // 2. Preconditions of interactAtResidence in Strict Deterministic Order
  // =========================================================================
  describe('2. Preconditions of interactAtResidence in Strict Deterministic Order', () => {
    it('1. Fails with "player-not-found" when player does not exist', () => {
      const { state } = setupWorldOnStreet();
      const snapshot = JSON.stringify(state);

      const result = interactAtResidence(state, 'agent:non-existent', 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-found');
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('2. Fails with "player-not-player" when an NPC is passed as player', () => {
      const { state } = setupWorldOnStreet();
      const snapshot = JSON.stringify(state);

      const result = interactAtResidence(state, 'agent:dev-npc', 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-player');
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('3. Fails with "building-not-found" when building does not exist', () => {
      const { state, player } = setupWorldOnStreet();
      const snapshot = JSON.stringify(state);

      const result = interactAtResidence(state, player.id, 'building:does-not-exist');
      assert.equal(result.success, false);
      assert.equal(result.code, 'building-not-found');
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('4. Fails with "building-not-residential" for a generic non-residential building', () => {
      const { state, player } = setupWorldOnStreet();
      const snapshot = JSON.stringify(state);

      const result = interactAtResidence(state, player.id, 'building:development-building');
      assert.equal(result.success, false);
      assert.equal(result.code, 'building-not-residential');
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('5. Fails with "already-inside" when player is already inside the residence', () => {
      const { state, player } = setupWorldOnStreet();
      player.locationId = 'building:development-residence';
      const snapshot = JSON.stringify(state);

      const result = interactAtResidence(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'already-inside');
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('6. Fails with "player-not-at-building-access-context" when player is not at parent street', () => {
      const { state, player } = setupWorldOnStreet();
      // Place player inside development-building instead of development-street
      player.locationId = 'building:development-building';
      const snapshot = JSON.stringify(state);

      const result = interactAtResidence(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-at-building-access-context');
      assert.equal(player.locationId, 'building:development-building');
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('7. Fails with "resident-agent-missing" when resident agent is missing from world state', () => {
      const { state, player } = setupWorldOnStreet();
      // Remove resident agent entity from agents array
      state.agents = state.agents.filter((a) => a.id !== 'agent:dev-npc');
      const snapshot = JSON.stringify(state);

      const result = interactAtResidence(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'resident-agent-missing');
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('8. Fails with "resident-not-home" when resident is away from home', () => {
      const { state, player, devNpc } = setupWorldOnStreet();
      devNpc.locationId = 'restaurant:development-restaurant';
      const snapshot = JSON.stringify(state);

      const result = interactAtResidence(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'resident-not-home');
      assert.equal(result.isAdmitted, false);
      assert.equal(player.locationId, 'street:development-street');
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('9. Fails with "resident-declined-stranger" when resident is home but unacquainted', () => {
      const { state, player, devNpc } = setupWorldOnStreet();
      assert.equal(devNpc.locationId, 'building:development-residence');

      // Ensure no acquaintance exists
      state.acquaintances = state.acquaintances.filter(
        (acq) => !(acq.agentIds.includes(player.id) && acq.agentIds.includes(devNpc.id))
      );
      const snapshot = JSON.stringify(state);

      const result = interactAtResidence(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'resident-declined-stranger');
      assert.equal(result.isAdmitted, false);
      assert.match(result.message, /declined admission/);
      assert.equal(player.locationId, 'street:development-street');
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('10. Succeeds with admission and spatial transition when resident is home and acquainted', () => {
      const { state, player, devNpc } = setupWorldOnStreet();
      assert.equal(devNpc.locationId, 'building:development-residence');
      assert.equal(player.locationId, 'street:development-street');

      // Establish acquaintance
      makeAcquainted(state, player.id, devNpc.id);

      const result = interactAtResidence(state, player.id, 'building:development-residence');
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.isAdmitted, true);
      assert.equal(result.playerId, player.id);
      assert.equal(result.buildingId, 'building:development-residence');
      assert.equal(result.residentAgentId, devNpc.id);
      assert.equal(result.previousLocationId, 'street:development-street');
      assert.equal(result.currentLocationId, 'building:development-residence');

      // Spatial transition verified
      assert.equal(player.locationId, 'building:development-residence');
    });
  });

  // =========================================================================
  // 3. Direct Entry Prohibition (enterBuilding on Residence)
  // =========================================================================
  describe('3. Direct Entry Prohibition (enterBuilding on Residence)', () => {
    it('enterBuilding on residence always rejects with residential-interaction-required', () => {
      const { state, player, devNpc } = setupWorldOnStreet();
      assert.equal(devNpc.locationId, 'building:development-residence');

      // Even if acquainted:
      makeAcquainted(state, player.id, devNpc.id);

      const result = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(result.success, false);
      assert.equal(result.code, 'residential-interaction-required');
      assert.equal(player.locationId, 'street:development-street');
    });

    it('enterBuilding on generic non-residential building enters directly', () => {
      const { state, player } = setupWorldOnStreet();
      assert.equal(isResidentialBuilding(state, 'building:development-building'), false);

      const result = enterBuilding(state, player.id, 'building:development-building');
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(player.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // 4. Social Interactions Once Admitted Inside Residence
  // =========================================================================
  describe('4. Social Interactions Once Admitted Inside Residence', () => {
    it('allows greeting resident inside residence once admitted', () => {
      const { state, player, devNpc } = setupWorldOnStreet();

      // Establish acquaintance
      makeAcquainted(state, player.id, devNpc.id);

      // Interact and enter
      const interactResult = interactAtResidence(state, player.id, 'building:development-residence');
      assert.equal(interactResult.success, true);
      assert.equal(player.locationId, 'building:development-residence');
      assert.equal(devNpc.locationId, 'building:development-residence');

      // Co-located greet succeeds
      const greetResult = greetAgent(state, player.id, devNpc.id);
      assert.equal(greetResult.success, true);
      assert.equal(greetResult.code, 'success');
      assert.match(greetResult.response, /resting at home/);
    });

    it('strict co-location requirement of greetAgent is preserved', () => {
      const { state, player, devNpc } = setupWorldOnStreet();
      // Player on street, devNpc in residence -> greetAgent must fail
      const greetResult = greetAgent(state, player.id, devNpc.id);
      assert.equal(greetResult.success, false);
      assert.equal(greetResult.code, 'agents-not-co-located');
    });
  });

  // =========================================================================
  // 5. Client Perception & Affordance Projection
  // =========================================================================
  describe('5. Client Perception & Affordance Projection', () => {
    it('inspectCurrentLocation exposes isResidential flag for accessible buildings on street', () => {
      const { state, player } = setupWorldOnStreet();
      const inspect = inspectCurrentLocation(state, player.id);
      assert.equal(inspect.success, true);
      assert.ok(inspect.location?.accessibleBuildings);

      const residence = inspect.location.accessibleBuildings.find(
        (b) => b.id === 'building:development-residence'
      );
      assert.ok(residence);
      assert.equal(residence.isResidential, true);

      const generic = inspect.location.accessibleBuildings.find(
        (b) => b.id === 'building:development-building'
      );
      assert.ok(generic);
      assert.equal(generic.isResidential, undefined);
    });

    it('createPresentationModel generates interactAtResidence affordance for residential buildings', () => {
      const { state, player } = setupWorldOnStreet();
      const inspect = inspectCurrentLocation(state, player.id);
      const statusData = {
        worldId: state.worldId,
        schemaVersion: state.version,
        worldTime: state.worldTime,
        activePlayerId: player.id,
      };

      const model = createPresentationModel(statusData, inspect);

      // Residential affordance
      const knockAffordance = model.affordances.find(
        (a) => a.commandName === 'interactAtResidence'
      );
      assert.ok(knockAffordance);
      assert.equal(knockAffordance.id, 'interact-residence-building:development-residence');
      assert.equal(knockAffordance.label, 'Knock at Development Residence');
      assert.equal(knockAffordance.group, 'INTERACT');
      assert.equal(knockAffordance.payload.buildingId, 'building:development-residence');

      // Generic building affordance
      const enterAffordance = model.affordances.find(
        (a) => a.commandName === 'enterBuilding'
      );
      assert.ok(enterAffordance);
      assert.equal(enterAffordance.id, 'enter-building:development-building');
      assert.equal(enterAffordance.label, 'Enter Development Building');
      assert.equal(enterAffordance.group, 'MOVE');
      assert.equal(enterAffordance.payload.buildingId, 'building:development-building');
    });
  });

  // =========================================================================
  // 6. Schema Invariant Verification
  // =========================================================================
  describe('6. Schema Invariant Verification', () => {
    it('preserves schema version 18 with zero migrations and passes validation', () => {
      const { state, player } = setupWorldOnStreet();

      makeAcquainted(state, player.id, 'agent:dev-npc');

      interactAtResidence(state, player.id, 'building:development-residence');

      assert.equal(state.version, 19);
      assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });
});
