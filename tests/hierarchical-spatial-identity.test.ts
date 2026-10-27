import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  WorldState,
  validateWorldState,
  areAgentsCoLocated,
  migrateWorldStateV18ToV19,
  WorldStateV18,
  AgentV18,
  InteriorSpaceReference,
} from '../src/core/world-state.js';
import { Agent, validateAgents } from '../src/core/entities/agent.js';
import { createGomezMorinSeedWorld } from '../src/core/seed.js';
import {
  createGomezMorinSpatialTopology,
  GomezMorinSpatialTopology,
  enterThroughEntranceThreshold,
  exitThroughEntranceThreshold,
  resolveContextualEntranceAction,
  validateAgentSpatialInvariants,
  InteriorSpace,
  BuildingEntrance,
} from '../src/core/real-world-street-topology.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 85: Hierarchical Spatial Identity', () => {
  const BASE_TIME = '2026-09-14T08:00:00.000Z';
  const canonicalTopology = createGomezMorinSpatialTopology();

  function createGomezMorinTestWorldState(): WorldState {
    const seed = createGomezMorinSeedWorld(BASE_TIME);
    return {
      worldId: 'juarez-el-paso',
      version: 19,
      worldTime: BASE_TIME,
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
      knowledge: [],
      orders: [],
      properties: seed.properties,
      siteAgentAssociations: seed.siteAgentAssociations,
    };
  }

  // =========================================================================
  // 1. Schema 19 Agent Validation & Invariants
  // =========================================================================
  describe('1. Schema 19 Agent Validation', () => {
    it('accepts outdoor agent with interiorSpaceId: null', () => {
      const agent: Agent = {
        id: 'agent:test-outdoor',
        type: 'agent',
        name: 'Outdoor Agent',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'street:blvd-gomez-morin',
        interiorSpaceId: null,
        balanceMinor: 1000,
        currency: 'USD',
      };
      assert.doesNotThrow(() => validateAgents([agent]));
    });

    it('accepts indoor agent with valid interiorSpaceId string', () => {
      const agent: Agent = {
        id: 'agent:test-indoor',
        type: 'agent',
        name: 'Indoor Agent',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:wing-spot',
        balanceMinor: 1000,
        currency: 'USD',
      };
      assert.doesNotThrow(() => validateAgents([agent]));
    });

    it('rejects agent when interiorSpaceId is undefined in version 19 schema', () => {
      const state = createGomezMorinTestWorldState();
      const corruptedAgent = { ...state.agents[0] } as any;
      delete corruptedAgent.interiorSpaceId;

      const corruptedState = {
        ...state,
        agents: [corruptedAgent, ...state.agents.slice(1)],
      };

      assert.throws(
        () => validateWorldState(corruptedState),
        /is missing required field "interiorSpaceId" in version 19 schema/
      );
    });

    it('rejects agent when interiorSpaceId is empty string', () => {
      const agent: any = {
        id: 'agent:test-invalid',
        type: 'agent',
        name: 'Invalid Agent',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'building:development-building',
        interiorSpaceId: '',
        balanceMinor: 1000,
        currency: 'USD',
      };
      assert.throws(
        () => validateAgents([agent]),
        /Invalid interiorSpaceId: must be null or a non-empty string/
      );
    });

    it('rejects agent when interiorSpaceId leaks an entrance ID ("entrance:...")', () => {
      const agent: any = {
        id: 'agent:test-invalid',
        type: 'agent',
        name: 'Invalid Agent',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'building:development-building',
        interiorSpaceId: 'entrance:wing-spot-main',
        balanceMinor: 1000,
        currency: 'USD',
      };
      assert.throws(
        () => validateAgents([agent]),
        /Invalid interiorSpaceId: cannot reference an entrance/
      );
    });

    it('rejects agent when interiorSpaceId leaks a nav node ID ("node:nav:...")', () => {
      const agent: any = {
        id: 'agent:test-invalid',
        type: 'agent',
        name: 'Invalid Agent',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'building:development-building',
        interiorSpaceId: 'node:nav:wing-spot-interior',
        balanceMinor: 1000,
        currency: 'USD',
      };
      assert.throws(
        () => validateAgents([agent]),
        /Invalid interiorSpaceId: cannot reference a navigation node/
      );
    });

    it('rejects non-string interiorSpaceId types', () => {
      const agent: any = {
        id: 'agent:test-invalid',
        type: 'agent',
        name: 'Invalid Agent',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'building:development-building',
        interiorSpaceId: 12345,
        balanceMinor: 1000,
        currency: 'USD',
      };
      assert.throws(
        () => validateAgents([agent]),
        /Invalid interiorSpaceId: must be null or a non-empty string/
      );
    });
  });

  // =========================================================================
  // 2. Spatial Invariants A through E
  // =========================================================================
  describe('2. Spatial Invariants A through E', () => {
    it('Invariant A: Exterior agent has interiorSpaceId === null and passes invariant check', () => {
      const agent: Agent = {
        id: 'agent:outdoor-invariant',
        type: 'agent',
        name: 'Outdoor',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'street:blvd-gomez-morin',
        interiorSpaceId: null,
        balanceMinor: 1000,
        currency: 'USD',
      };
      assert.doesNotThrow(() => validateAgentSpatialInvariants(agent, canonicalTopology));
    });

    it('Invariant B: Interior agent with non-existent interiorSpaceId fails validation', () => {
      const agent: Agent = {
        id: 'agent:ghost-room',
        type: 'agent',
        name: 'Ghost Room',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:non-existent-room',
        balanceMinor: 1000,
        currency: 'USD',
      };
      const res = validateAgentSpatialInvariants(agent, canonicalTopology);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes('references non-existent InteriorSpace')));
    });

    it('Invariant C: Indoor agent locationId must match InteriorSpace.associatedPlaceId', () => {
      const agent: Agent = {
        id: 'agent:mismatched-place',
        type: 'agent',
        name: 'Mismatched Place',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:pasteleria-tia-lupe', // Mismatch with wing-spot interior!
        interiorSpaceId: 'interior:wing-spot',
        balanceMinor: 1000,
        currency: 'USD',
      };
      const res = validateAgentSpatialInvariants(agent, canonicalTopology);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes('does not match InteriorSpace.associatedPlaceId')));
    });

    it('Invariant D & E: Indoor agent referencing valid interior passes and occupies exactly one room', () => {
      const agentWingSpot: Agent = {
        id: 'agent:wing-spot-guest',
        type: 'agent',
        name: 'Wing Spot Guest',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:wing-spot',
        balanceMinor: 1000,
        currency: 'USD',
      };
      assert.doesNotThrow(() => validateAgentSpatialInvariants(agentWingSpot, canonicalTopology));

      const agentTiaLupe: Agent = {
        id: 'agent:tia-lupe-guest',
        type: 'agent',
        name: 'Tia Lupe Guest',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:pasteleria-tia-lupe',
        interiorSpaceId: 'interior:tia-lupe',
        balanceMinor: 1000,
        currency: 'USD',
      };
      assert.doesNotThrow(() => validateAgentSpatialInvariants(agentTiaLupe, canonicalTopology));
    });
  });

  // =========================================================================
  // 3. Co-Presence Matrix
  // =========================================================================
  describe('3. Co-Presence Matrix (areAgentsCoLocated)', () => {
    it('Case 1: Same street place + null/null -> CO-LOCATED', () => {
      const a1: Agent = {
        id: 'agent:1',
        type: 'agent',
        name: 'A1',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'street:blvd-gomez-morin',
        interiorSpaceId: null,
        balanceMinor: 0,
        currency: 'USD',
      };
      const a2: Agent = {
        id: 'agent:2',
        type: 'agent',
        name: 'A2',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: BASE_TIME,
        locationId: 'street:blvd-gomez-morin',
        interiorSpaceId: null,
        balanceMinor: 0,
        currency: 'USD',
      };
      const state = { ...createGomezMorinTestWorldState(), agents: [a1, a2] };
      assert.equal(areAgentsCoLocated(state, a1.id, a2.id), true);
    });

    it('Case 2: Same business place + same interiorSpaceId -> CO-LOCATED', () => {
      const a1: Agent = {
        id: 'agent:1',
        type: 'agent',
        name: 'A1',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:wing-spot',
        balanceMinor: 0,
        currency: 'USD',
      };
      const a2: Agent = {
        id: 'agent:2',
        type: 'agent',
        name: 'A2',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:wing-spot',
        balanceMinor: 0,
        currency: 'USD',
      };
      const state = { ...createGomezMorinTestWorldState(), agents: [a1, a2] };
      assert.equal(areAgentsCoLocated(state, a1.id, a2.id), true);
    });

    it('Case 3: Same business place + DIFFERENT interiorSpaceId -> NOT CO-LOCATED', () => {
      const a1: Agent = {
        id: 'agent:1',
        type: 'agent',
        name: 'A1',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:corporate-office',
        interiorSpaceId: 'interior:corporate-lobby',
        balanceMinor: 0,
        currency: 'USD',
      };
      const a2: Agent = {
        id: 'agent:2',
        type: 'agent',
        name: 'A2',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: BASE_TIME,
        locationId: 'restaurant:corporate-office',
        interiorSpaceId: 'interior:corporate-restricted-room',
        balanceMinor: 0,
        currency: 'USD',
      };
      const state = { ...createGomezMorinTestWorldState(), agents: [a1, a2] };
      assert.equal(areAgentsCoLocated(state, a1.id, a2.id), false);
    });

    it('Case 4: Different place + null/null -> NOT CO-LOCATED', () => {
      const a1: Agent = {
        id: 'agent:1',
        type: 'agent',
        name: 'A1',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'street:blvd-gomez-morin',
        interiorSpaceId: null,
        balanceMinor: 0,
        currency: 'USD',
      };
      const a2: Agent = {
        id: 'agent:2',
        type: 'agent',
        name: 'A2',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: BASE_TIME,
        locationId: 'street:calle-del-porvenir',
        interiorSpaceId: null,
        balanceMinor: 0,
        currency: 'USD',
      };
      const state = { ...createGomezMorinTestWorldState(), agents: [a1, a2] };
      assert.equal(areAgentsCoLocated(state, a1.id, a2.id), false);
    });

    it('Case 5: Different place + different interiorSpaceId -> NOT CO-LOCATED', () => {
      const a1: Agent = {
        id: 'agent:1',
        type: 'agent',
        name: 'A1',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:wing-spot',
        balanceMinor: 0,
        currency: 'USD',
      };
      const a2: Agent = {
        id: 'agent:2',
        type: 'agent',
        name: 'A2',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: BASE_TIME,
        locationId: 'restaurant:pasteleria-tia-lupe',
        interiorSpaceId: 'interior:tia-lupe',
        balanceMinor: 0,
        currency: 'USD',
      };
      const state = { ...createGomezMorinTestWorldState(), agents: [a1, a2] };
      assert.equal(areAgentsCoLocated(state, a1.id, a2.id), false);
    });
  });

  // =========================================================================
  // 4. Ingress Transition & Atomic Update
  // =========================================================================
  describe('4. Ingress (enterThroughEntranceThreshold)', () => {
    it('atomically sets locationId and interiorSpaceId upon successful entry', () => {
      const state = createGomezMorinTestWorldState();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      player.interiorSpaceId = null;

      const result = enterThroughEntranceThreshold(
        state,
        { agentId: player.id, entranceId: 'entrance:wing-spot-main' },
        canonicalTopology
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(player.locationId, 'restaurant:wing-spot');
      assert.equal(player.interiorSpaceId, 'interior:wing-spot');
    });

    it('fails with zero state mutation when entrance does not exist', () => {
      const state = createGomezMorinTestWorldState();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      player.interiorSpaceId = null;

      const result = enterThroughEntranceThreshold(
        state,
        { agentId: player.id, entranceId: 'entrance:non-existent' },
        canonicalTopology
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'entrance-not-found');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
      assert.equal(player.interiorSpaceId, null);
    });
  });

  // =========================================================================
  // 5. Egress Transition & Atomic Update
  // =========================================================================
  describe('5. Egress (exitThroughEntranceThreshold)', () => {
    it('atomically resets interiorSpaceId to null and sets street locationId on exit', () => {
      const state = createGomezMorinTestWorldState();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:pasteleria-tia-lupe';
      player.interiorSpaceId = 'interior:tia-lupe';

      const result = exitThroughEntranceThreshold(
        state,
        { agentId: player.id, entranceId: 'entrance:tia-lupe-main' },
        canonicalTopology
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
      assert.equal(player.interiorSpaceId, null);
    });

    it('rejects egress with zero state mutation if agent is not in the referenced room', () => {
      const state = createGomezMorinTestWorldState();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      // Agent is in Wing Spot room, but tries to exit via Tia Lupe entrance!
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';

      const result = exitThroughEntranceThreshold(
        state,
        { agentId: player.id, entranceId: 'entrance:tia-lupe-main' },
        canonicalTopology
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'not-inside-interior');
      assert.equal(player.locationId, 'restaurant:wing-spot');
      assert.equal(player.interiorSpaceId, 'interior:wing-spot');
    });
  });

  // =========================================================================
  // 6. Contextual Resolution Scoped to interiorSpaceId
  // =========================================================================
  describe('6. Contextual Resolution Scoping', () => {
    it('scopes egress strictly to currentInteriorSpaceId in multi-room venue topology', () => {
      // Construct synthetic multi-room building fixture
      const roomA: InteriorSpace = {
        interiorId: 'interior:corp-lobby',
        buildingId: 'building:corp-hq',
        associatedPlaceId: 'restaurant:corp-office',
        entranceIds: ['entrance:corp-lobby-street'],
        interiorNavNodeId: 'node:nav:corp-lobby',
        boundary: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      };

      const roomB: InteriorSpace = {
        interiorId: 'interior:corp-boardroom',
        buildingId: 'building:corp-hq',
        associatedPlaceId: 'restaurant:corp-office',
        entranceIds: ['entrance:corp-boardroom-terrace'],
        interiorNavNodeId: 'node:nav:corp-boardroom',
        boundary: { minX: 15, maxX: 25, minZ: 0, maxZ: 10 },
      };

      const entranceA: BuildingEntrance = {
        entranceId: 'entrance:corp-lobby-street',
        name: 'Corporativo Lobby — Entrada Calle',
        buildingId: 'building:corp-hq',
        interiorSpaceId: 'interior:corp-lobby',
        facingStreetPlaceId: 'street:corp-avenue',
        streetNavNodeId: 'node:nav:corp-street',
        interiorNavNodeId: 'node:nav:corp-lobby',
        thresholdPosition: { x: 5, z: 0 },
        interactionRadius: 2.0,
      };

      const entranceB: BuildingEntrance = {
        entranceId: 'entrance:corp-boardroom-terrace',
        name: 'Corporativo Boardroom — Entrada Terraza',
        buildingId: 'building:corp-hq',
        interiorSpaceId: 'interior:corp-boardroom',
        facingStreetPlaceId: 'street:corp-terrace',
        streetNavNodeId: 'node:nav:corp-terrace',
        interiorNavNodeId: 'node:nav:corp-boardroom',
        thresholdPosition: { x: 20, z: 0 },
        interactionRadius: 2.0,
      };

      const customTopology: GomezMorinSpatialTopology = {
        ...canonicalTopology,
        interiors: [roomA, roomB],
        entrances: [entranceA, entranceB],
      };

      // Player in Room A near Entrance A
      const actionA = resolveContextualEntranceAction(
        entranceA,
        undefined,
        'restaurant:corp-office',
        customTopology,
        'interior:corp-lobby'
      );

      assert.ok(actionA);
      assert.equal(actionA.commandName, 'exitEntranceThreshold');
      assert.equal(actionA.targetLocationId, 'street:corp-avenue');

      // Player in Room B near Entrance B
      const actionB = resolveContextualEntranceAction(
        entranceB,
        undefined,
        'restaurant:corp-office',
        customTopology,
        'interior:corp-boardroom'
      );

      assert.ok(actionB);
      assert.equal(actionB.commandName, 'exitEntranceThreshold');
      assert.equal(actionB.targetLocationId, 'street:corp-terrace');

      // Player in Room A should NOT resolve exit for Entrance B
      const actionCross = resolveContextualEntranceAction(
        entranceB,
        undefined,
        'restaurant:corp-office',
        customTopology,
        'interior:corp-lobby' // in room A
      );

      assert.notEqual(actionCross.commandName, 'exitEntranceThreshold');
      assert.notEqual(actionCross.commandName, 'exitRestaurant');
    });
  });

  // =========================================================================
  // 7. Migration v18 -> v19 & Ambiguity Rejection
  // =========================================================================
  // =========================================================================
  // 7. Migration v18 -> v19 (F-08 Conservative Migration Contract)
  // =========================================================================
  describe('7. Migration v18 -> v19', () => {
    it('Test 1 — No inference from restaurant location alone', () => {
      const v18Agent: AgentV18 = {
        id: 'agent:restaurant-loc-only',
        type: 'agent',
        name: 'Restaurant Loc Only',
        agentType: 'player',
        activityState: 'idle',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        balanceMinor: 1000,
        currency: 'USD',
      };

      const v18State: WorldStateV18 = {
        worldId: 'juarez-el-paso',
        version: 18,
        worldTime: BASE_TIME,
        places: [],
        restaurants: [],
        agents: [v18Agent],
        offerings: [],
        purchases: [],
        activityCompletions: [],
        acquaintances: [],
        items: [],
        knowledge: [],
        orders: [],
        properties: [],
        siteAgentAssociations: [],
      };

      const v19 = migrateWorldStateV18ToV19(v18State);
      assert.equal(v19.version, 19);
      assert.equal(v19.agents[0].locationId, 'restaurant:wing-spot');
      assert.equal(v19.agents[0].interiorSpaceId, null);
    });

    it('Test 2 — No inference from playerActivity', () => {
      const v18Agent: AgentV18 = {
        id: 'agent:player-with-activity',
        type: 'agent',
        name: 'Player with Activity',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        balanceMinor: 1000,
        currency: 'USD',
        playerActivity: {
          activity: 'having-coffee',
          restaurantId: 'restaurant:wing-spot',
          durationMs: 300000,
          offeringId: 'offering:coffee',
          itemId: null,
          startedAt: BASE_TIME,
        },
      };

      const v18State: WorldStateV18 = {
        worldId: 'juarez-el-paso',
        version: 18,
        worldTime: BASE_TIME,
        places: [],
        restaurants: [],
        agents: [v18Agent],
        offerings: [],
        purchases: [],
        activityCompletions: [],
        acquaintances: [],
        items: [],
        knowledge: [],
        orders: [],
        properties: [],
        siteAgentAssociations: [],
      };

      const v19 = migrateWorldStateV18ToV19(v18State);
      assert.equal(v19.version, 19);
      assert.equal(v19.agents[0].locationId, 'restaurant:wing-spot');
      assert.equal(v19.agents[0].interiorSpaceId, null);
    });

    it('Test 3 — No inference from site association', () => {
      const v18Npc: AgentV18 = {
        id: 'agent:attendant-npc',
        type: 'agent',
        name: 'Attendant NPC',
        agentType: 'npc',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        balanceMinor: 0,
        currency: 'USD',
      };

      const v18State: WorldStateV18 = {
        worldId: 'juarez-el-paso',
        version: 18,
        worldTime: BASE_TIME,
        places: [],
        restaurants: [],
        agents: [v18Npc],
        offerings: [],
        purchases: [],
        activityCompletions: [],
        acquaintances: [],
        items: [],
        knowledge: [],
        orders: [],
        properties: [],
        siteAgentAssociations: [
          {
            placeId: 'restaurant:wing-spot',
            agentId: 'agent:attendant-npc',
            role: 'attendant',
          },
        ],
      };

      const v19 = migrateWorldStateV18ToV19(v18State);
      assert.equal(v19.version, 19);
      assert.equal(v19.agents[0].locationId, 'restaurant:wing-spot');
      assert.equal(v19.agents[0].interiorSpaceId, null);
    });

    it('Test 4 — Explicit valid interior identity is preserved', () => {
      const v18Agent: AgentV18 = {
        id: 'agent:explicit-ws',
        type: 'agent',
        name: 'Explicit WS',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        balanceMinor: 1000,
        currency: 'USD',
      };
      (v18Agent as any).interiorSpaceId = 'interior:wing-spot';

      const v18State: WorldStateV18 = {
        worldId: 'juarez-el-paso',
        version: 18,
        worldTime: BASE_TIME,
        places: [],
        restaurants: [],
        agents: [v18Agent],
        offerings: [],
        purchases: [],
        activityCompletions: [],
        acquaintances: [],
        items: [],
        knowledge: [],
        orders: [],
        properties: [],
        siteAgentAssociations: [],
      };

      const v19 = migrateWorldStateV18ToV19(v18State);
      assert.equal(v19.version, 19);
      assert.equal(v19.agents[0].interiorSpaceId, 'interior:wing-spot');
    });

    it('Test 5 — Mismatched explicit identity throws', () => {
      const v18Mismatched: AgentV18 = {
        id: 'agent:mismatched',
        type: 'agent',
        name: 'Mismatched',
        agentType: 'player',
        activityState: 'idle',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        balanceMinor: 1000,
        currency: 'USD',
      };
      (v18Mismatched as any).interiorSpaceId = 'interior:tia-lupe';

      const v18State: WorldStateV18 = {
        worldId: 'juarez-el-paso',
        version: 18,
        worldTime: BASE_TIME,
        places: [],
        restaurants: [],
        agents: [v18Mismatched],
        offerings: [],
        purchases: [],
        activityCompletions: [],
        acquaintances: [],
        items: [],
        knowledge: [],
        orders: [],
        properties: [],
        siteAgentAssociations: [],
      };

      assert.throws(
        () => migrateWorldStateV18ToV19(v18State),
        /mismatched interior "interior:tia-lupe"/
      );
    });

    it('Test 6 — Leaked entrance identity throws', () => {
      const v18Leaked: AgentV18 = {
        id: 'agent:leaked',
        type: 'agent',
        name: 'Leaked Entrance',
        agentType: 'player',
        activityState: 'idle',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        balanceMinor: 1000,
        currency: 'USD',
      };
      (v18Leaked as any).interiorSpaceId = 'entrance:wing-spot-main';

      const v18State: WorldStateV18 = {
        worldId: 'juarez-el-paso',
        version: 18,
        worldTime: BASE_TIME,
        places: [],
        restaurants: [],
        agents: [v18Leaked],
        offerings: [],
        purchases: [],
        activityCompletions: [],
        acquaintances: [],
        items: [],
        knowledge: [],
        orders: [],
        properties: [],
        siteAgentAssociations: [],
      };

      assert.throws(
        () => migrateWorldStateV18ToV19(v18State),
        /interiorSpaceId cannot reference an entrance/
      );
    });

    it('Test 7 — Unknown interior identity throws', () => {
      const v18Unknown: AgentV18 = {
        id: 'agent:unknown',
        type: 'agent',
        name: 'Unknown Interior',
        agentType: 'player',
        activityState: 'idle',
        activitySince: BASE_TIME,
        locationId: 'restaurant:wing-spot',
        balanceMinor: 1000,
        currency: 'USD',
      };
      (v18Unknown as any).interiorSpaceId = 'interior:does-not-exist';

      const v18State: WorldStateV18 = {
        worldId: 'juarez-el-paso',
        version: 18,
        worldTime: BASE_TIME,
        places: [],
        restaurants: [],
        agents: [v18Unknown],
        offerings: [],
        purchases: [],
        activityCompletions: [],
        acquaintances: [],
        items: [],
        knowledge: [],
        orders: [],
        properties: [],
        siteAgentAssociations: [],
      };

      assert.throws(
        () => migrateWorldStateV18ToV19(v18State),
        /nonexistent interiorSpaceId "interior:does-not-exist"/
      );
    });
  });

  // =========================================================================
  // 8. Persistence Roundtrip
  // =========================================================================
  describe('8. Persistence Roundtrip', () => {
    it('persists and restores both locationId and interiorSpaceId cleanly', () => {
      const tempPath = join(tmpdir(), `m85-persistence-${Date.now()}.json`);
      const persistence = new LocalFilePersistence(tempPath);
      const state = createGomezMorinTestWorldState();

      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';

      persistence.save(state);

      const loaded = persistence.load();
      assert.ok(loaded);
      assert.equal(loaded.version, 19);

      const loadedPlayer = loaded.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      assert.equal(loadedPlayer.locationId, 'restaurant:wing-spot');
      assert.equal(loadedPlayer.interiorSpaceId, 'interior:wing-spot');

      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    });
  });

  // =========================================================================
  // 9. Existing Real Interiors Unaffected
  // =========================================================================
  describe('9. Existing Real Interiors Unaffected', () => {
    it('Wing Spot and Pastelerias La Tia Lupe topologies pass validation cleanly', () => {
      assert.equal(canonicalTopology.interiors.length, 3);
      const wingSpot = canonicalTopology.interiors.find(
        (i) => i.interiorId === 'interior:wing-spot'
      );
      assert.ok(wingSpot);
      assert.equal(wingSpot.associatedPlaceId, 'restaurant:wing-spot');

      const tiaLupe = canonicalTopology.interiors.find(
        (i) => i.interiorId === 'interior:tia-lupe'
      );
      assert.ok(tiaLupe);
      assert.equal(tiaLupe.associatedPlaceId, 'restaurant:pasteleria-tia-lupe');
    });
  });
});
