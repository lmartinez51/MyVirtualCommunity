import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  transitionAgentLocation,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  inspectCurrentLocation,
  greetAgent,
  introduceToAgent,
  areAgentsCoLocated,
  getCoLocatedAgents,
  CURRENT_WORLD_STATE_VERSION,
  WorldState,
} from '../src/core/world-state.js';
import { createPresentationModel } from '../src/client/projections.js';

describe('Milestone 60: NPC Presence & Observation Boundary', () => {
  // Morning 08:00 AM local Juarez time (14:00 UTC) -> NPC at residence
  const MORNING_HOME_TIME = '2026-09-14T14:00:00.000Z';
  // Commute 08:45 AM local Juarez time (14:45 UTC) -> NPC on development street
  const COMMUTE_TIME = '2026-09-14T14:45:00.000Z';
  // Work shift 10:00 AM local Juarez time (16:00 UTC) -> NPC at restaurant
  const WORK_SHIFT_TIME = '2026-09-14T16:00:00.000Z';
  // Evening promenade 18:00 PM local Juarez time (00:00 UTC next day) -> NPC on Avenida Juárez
  const PROMENADE_TIME = '2026-09-15T00:00:00.000Z';
  // Night rest 21:00 PM local Juarez time (03:00 UTC next day) -> NPC at residence
  const NIGHT_HOME_TIME = '2026-09-15T03:00:00.000Z';

  function setupWorld(timeIso: string = MORNING_HOME_TIME) {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    sim.tick();

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

    return { clock, state, sim, player, devNpc };
  }

  // =========================================================================
  // 1. Pure Co-Location Domain Helpers
  // =========================================================================
  describe('1. Pure Co-Location Domain Helpers', () => {
    it('areAgentsCoLocated returns true when agents share the exact same locationId', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'street:development-street';

      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), true);
      assert.equal(areAgentsCoLocated(state, devNpc.id, player.id), true);
    });

    it('areAgentsCoLocated returns false when agents are in different locations', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'building:development-building';

      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), false);
    });

    it('areAgentsCoLocated handles missing or invalid agent IDs safely without throwing', () => {
      const { state, player } = setupWorld();

      assert.equal(areAgentsCoLocated(state, player.id, 'agent:non-existent'), false);
      assert.equal(areAgentsCoLocated(state, 'agent:non-existent', player.id), false);
      assert.equal(areAgentsCoLocated(state, '', player.id), false);
      assert.equal(areAgentsCoLocated(state, player.id, ''), false);
    });

    it('areAgentsCoLocated performs zero state mutation', () => {
      const { state, player, devNpc } = setupWorld();
      const snapshot = JSON.stringify(state);

      areAgentsCoLocated(state, player.id, devNpc.id);
      assert.equal(JSON.stringify(state), snapshot);
    });

    it('getCoLocatedAgents returns ObservableAgent projections for co-located agents', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'street:development-street';

      const coLocated = getCoLocatedAgents(state, player.id);
      assert.ok(Array.isArray(coLocated));
      assert.equal(coLocated.length, 2); // player and devNpc

      const npcObs = coLocated.find((a) => a.id === devNpc.id);
      assert.ok(npcObs);
      assert.equal(npcObs.id, 'agent:dev-npc');
      assert.equal(npcObs.name, devNpc.name);
      assert.equal(npcObs.agentType, 'npc');
      assert.equal(typeof npcObs.isAcquainted, 'boolean');

      // Internal state strictly withheld from projection
      assert.equal((npcObs as any).balanceMinor, undefined);
      assert.equal((npcObs as any).activityState, undefined);
      assert.equal((npcObs as any).activitySince, undefined);
      assert.equal((npcObs as any).playerActivity, undefined);
    });

    it('getCoLocatedAgents returns empty array for non-existent observer', () => {
      const { state } = setupWorld();
      const result = getCoLocatedAgents(state, 'agent:non-existent');
      assert.deepEqual(result, []);
    });
  });

  // =========================================================================
  // 2. Spatial Contexts & Boundary Isolation
  // =========================================================================
  describe('2. Spatial Contexts & Boundary Isolation', () => {
    it('Scenario A (Same street): NPC is co-located and observable in inspectCurrentLocation', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'street:development-street';

      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), true);

      const inspect = inspectCurrentLocation(state, player.id);
      assert.equal(inspect.success, true);
      assert.ok(inspect.location);
      assert.ok(inspect.location.agents.some((a) => a.id === devNpc.id));
    });

    it('Scenario B (Different locations): Player on street, NPC at restaurant -> not co-located or observable', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'restaurant:development-restaurant';

      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), false);

      const inspect = inspectCurrentLocation(state, player.id);
      assert.equal(inspect.success, true);
      assert.ok(inspect.location);
      assert.equal(inspect.location.agents.some((a) => a.id === devNpc.id), false);
    });

    it('Scenario C (Spatial containment boundary): Player on street, NPC inside building -> not co-located or observable', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'building:development-building';

      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), false);

      const inspect = inspectCurrentLocation(state, player.id);
      assert.equal(inspect.success, true);
      assert.ok(inspect.location);
      assert.equal(inspect.location.agents.some((a) => a.id === devNpc.id), false);
    });

    it('Scenario D (Same building): Player inside building, NPC inside same building -> co-located and observable', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'building:development-building';
      devNpc.locationId = 'building:development-building';

      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), true);

      const inspect = inspectCurrentLocation(state, player.id);
      assert.equal(inspect.success, true);
      assert.ok(inspect.location);
      assert.ok(inspect.location.agents.some((a) => a.id === devNpc.id));
    });
  });

  // =========================================================================
  // 3. Schedule-Driven Presence & Observation Dynamics
  // =========================================================================
  describe('3. Schedule-Driven Presence & Observation Dynamics', () => {
    it('Scenario E: Co-presence changes dynamically purely as a consequence of Simulation.tick() schedule authority', () => {
      // Start at 08:00 Local Juarez time: Player leaves building onto street; NPC is resting at home
      const { clock, state, sim, player, devNpc } = setupWorld(MORNING_HOME_TIME);
      leaveBuilding(state, player.id, 'building:development-building');
      assert.equal(player.locationId, 'street:development-street');
      assert.equal(devNpc.locationId, 'building:development-residence');

      // 1. At 08:00 AM: Not co-located on street
      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), false);
      let inspect = inspectCurrentLocation(state, player.id);
      assert.equal(inspect.location?.agents.some((a) => a.id === devNpc.id), false);

      // 2. Advance clock by 35 minutes to 08:35 AM (commute phase): NPC moves to development street
      clock.advance(35 * 60_000);
      sim.tick();
      assert.equal(devNpc.locationId, 'street:development-street');
      assert.equal(player.locationId, 'street:development-street');

      // Now co-located on street!
      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), true);
      inspect = inspectCurrentLocation(state, player.id);
      assert.equal(inspect.location?.agents.some((a) => a.id === devNpc.id), true);

      // 3. Advance clock by 40 minutes to 09:15 AM (work phase): NPC moves to restaurant
      clock.advance(40 * 60_000);
      sim.tick();
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      assert.equal(player.locationId, 'street:development-street');

      // No longer co-located on street!
      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), false);
      inspect = inspectCurrentLocation(state, player.id);
      assert.equal(inspect.location?.agents.some((a) => a.id === devNpc.id), false);

      // 4. Advance clock to 18:00 PM (promenade phase): NPC moves to Avenida Juárez
      clock.advance(8 * 3600_000 + 45 * 60_000); // reaches 18:00
      sim.tick();
      assert.equal(devNpc.locationId, 'street:avenida-juarez');

      // Move player to Avenida Juárez via canonical traversal
      transitionAgentLocation(state, player.id, 'street:avenida-juarez');

      // Co-located on Avenida Juárez during promenade!
      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), true);
      inspect = inspectCurrentLocation(state, player.id);
      assert.equal(inspect.location?.agents.some((a) => a.id === devNpc.id), true);
    });
  });

  // =========================================================================
  // 4. Social Interaction Authority Integration
  // =========================================================================
  describe('4. Social Interaction Authority Integration', () => {
    it('Scenario F: When co-located, existing greetAgent and introduceAgent execute cleanly', () => {
      const { state, player, devNpc } = setupWorld(WORK_SHIFT_TIME);
      // Place both in restaurant
      player.locationId = 'restaurant:development-restaurant';
      devNpc.locationId = 'restaurant:development-restaurant';
      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), true);

      // Greet succeeds
      const greetResult = greetAgent(state, player.id, devNpc.id);
      assert.equal(greetResult.success, true);
      assert.equal(greetResult.code, 'success');
      assert.match(greetResult.response, /working here today/);

      // Introduce succeeds
      const introResult = introduceToAgent(state, player.id, devNpc.id);
      assert.equal(introResult.success, true);
      assert.equal(introResult.code, 'success');
      assert.ok(introResult.acquaintance);
    });

    it('Scenario G: When not co-located, social commands reject with agents-not-co-located', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'building:development-residence';
      assert.equal(areAgentsCoLocated(state, player.id, devNpc.id), false);

      const greetResult = greetAgent(state, player.id, devNpc.id);
      assert.equal(greetResult.success, false);
      assert.equal(greetResult.code, 'agents-not-co-located');

      const introResult = introduceToAgent(state, player.id, devNpc.id);
      assert.equal(introResult.success, false);
      assert.equal(introResult.code, 'agents-not-co-located');
    });
  });

  // =========================================================================
  // 5. Persistence & Schema Integrity (Schema Version 18)
  // =========================================================================
  describe('5. Persistence & Schema Integrity', () => {
    it('Scenario H: World state maintains schema version 18 with zero encounter collections or migrations', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'street:development-street';

      // Perform inspection
      inspectCurrentLocation(state, player.id);

      // Strict schema verification
      assert.equal(state.version, 18);
      assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
      assert.equal((state as any).encounters, undefined);
      assert.equal((state as any).encounterHistory, undefined);
      assert.equal((state as any).observations, undefined);

      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 6. Client Projection Integration
  // =========================================================================
  describe('6. Client Projection Integration', () => {
    it('Scenario I: Client presentation model accurately projects co-located NPCs and affordances from authoritative inspection', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'street:development-street';

      const inspect = inspectCurrentLocation(state, player.id);
      const statusData = {
        worldId: state.worldId,
        schemaVersion: state.version,
        worldTime: state.worldTime,
        activePlayerId: player.id,
      };

      const presentation = createPresentationModel(statusData, inspect);
      assert.equal(presentation.locationId, 'street:development-street');

      // Co-located NPC is in client agents list
      const clientNpc = presentation.agents.find((a) => a.id === devNpc.id);
      assert.ok(clientNpc);
      assert.equal(clientNpc.name, devNpc.name);
      assert.equal(clientNpc.agentType, 'npc');

      // Interaction affordances generated for co-located NPC
      const greetAffordance = presentation.affordances.find(
        (a) => a.commandName === 'greetAgent' && (a.payload as any).targetAgentId === devNpc.id
      );
      assert.ok(greetAffordance);
      assert.equal(greetAffordance.group, 'INTERACT');
    });

    it('Scenario I (Non-co-located): Client presentation model does not expose NPC when in different location', () => {
      const { state, player, devNpc } = setupWorld();
      player.locationId = 'street:development-street';
      devNpc.locationId = 'restaurant:development-restaurant';

      const inspect = inspectCurrentLocation(state, player.id);
      const statusData = {
        worldId: state.worldId,
        schemaVersion: state.version,
        worldTime: state.worldTime,
        activePlayerId: player.id,
      };

      const presentation = createPresentationModel(statusData, inspect);
      assert.equal(presentation.agents.some((a) => a.id === devNpc.id), false);
      assert.equal(
        presentation.affordances.some(
          (a) => (a.payload as any)?.targetAgentId === devNpc.id
        ),
        false
      );
    });
  });
});
