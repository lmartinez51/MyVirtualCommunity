import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createGomezMorinWorldState,
  transitionAgentLocation,
  WorldState,
} from '../src/core/world-state.js';
import {
  GomezMorinSpatialTopology,
  BuildingEntrance,
  InteriorSpace,
  findInteriorSpaceById,
  findInteriorSpaceByBuilding,
  findInteriorSpacesByBuilding,
  findInteriorSpaceByPlace,
  findEntranceById,
  enterThroughEntranceThreshold,
  exitThroughEntranceThreshold,
  resolveContextualEntranceAction,
  isInsideInteriorBoundary,
  createGomezMorinSpatialTopology,
  validateInteriorTopology,
} from '../src/core/real-world-street-topology.js';
import {
  isContextualWalkablePosition,
} from '../clients/minimal-3d/minimal-3d-client.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';

describe('Milestone 82 Generalization & Architecture Validation', () => {
  const testTime = '2026-09-14T16:00:00.000Z'; // 10:00 AM local Juárez

  function setupWorld(): WorldState {
    const clock = WorldClock.create(testTime);
    return createGomezMorinWorldState(clock);
  }

  // =========================================================================
  // Synthetic Multi-Venue Topology Fixture
  // Proves generalization across 4 distinct venue categories:
  // 1. Commercial Restaurant (with business hours)
  // 2. Private Residence (no restaurant rules, residential stoop)
  // 3. Retail Store (commercial retail, customer door)
  // 4. Corporate Complex (multi-entrance building)
  // =========================================================================
  const syntheticEntrances: BuildingEntrance[] = [
    // 1. Synthetic Restaurant Entrance
    {
      entranceId: 'entrance:synth-tacos-main',
      buildingId: 'building:synth-tacos-building',
      name: 'Tacos El General — Entrada Principal',
      facingStreetPlaceId: 'street:blvd-gomez-morin',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:synth-tacos',
      interiorSpaceId: 'interior:synth-tacos',
      thresholdPosition: { x: 15.0, z: 9.8 },
      interiorThresholdPosition: { x: 15.0, z: 10.5 },
      description: 'Customer entrance to Tacos El General.',
    },
    // 2. Synthetic Residence Entrance
    {
      entranceId: 'entrance:synth-residence-main',
      buildingId: 'building:synth-residence-building',
      name: 'Casa Las Palmas — Entrada Principal',
      facingStreetPlaceId: 'street:calle-del-porvenir',
      entranceType: 'residential-primary',
      associatedNavNodeId: 'node:nav:synth-residence',
      interiorSpaceId: 'interior:synth-residence',
      thresholdPosition: { x: 35.0, z: 9.8 },
      interiorThresholdPosition: { x: 35.0, z: 10.5 },
      description: 'Residential front porch entrance.',
    },
    // 3. Synthetic Retail Store Entrance
    {
      entranceId: 'entrance:synth-store-main',
      buildingId: 'building:synth-store-building',
      name: 'Supermercado Del Norte — Entrada',
      facingStreetPlaceId: 'street:blvd-gomez-morin',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:synth-store',
      interiorSpaceId: 'interior:synth-store',
      thresholdPosition: { x: 55.0, z: 9.8 },
      interiorThresholdPosition: { x: 55.0, z: 10.5 },
      description: 'Retail supermarket sliding doors.',
    },
    // 4. Multi-Entrance Corporate Building (Front & Side Entrances)
    {
      entranceId: 'entrance:synth-office-front',
      buildingId: 'building:synth-office-building',
      name: 'Torre Juárez — Entrada Frontal',
      facingStreetPlaceId: 'street:av-la-arboleda',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:synth-office-front',
      interiorSpaceId: 'interior:synth-office-lobby',
      thresholdPosition: { x: 80.0, z: 9.8 },
      interiorThresholdPosition: { x: 80.0, z: 10.5 },
      description: 'Main lobby revolving doors.',
    },
    {
      entranceId: 'entrance:synth-office-side',
      buildingId: 'building:synth-office-building',
      name: 'Torre Juárez — Entrada Lateral',
      facingStreetPlaceId: 'street:av-la-arboleda',
      entranceType: 'service',
      associatedNavNodeId: 'node:nav:synth-office-side',
      interiorSpaceId: 'interior:synth-office-lobby',
      thresholdPosition: { x: 90.0, z: 15.0 },
      interiorThresholdPosition: { x: 89.0, z: 15.0 },
      description: 'Side executive and delivery entrance.',
    },
    // 5. Multi-Interior Suite Entrance in same Corporate Building
    {
      entranceId: 'entrance:synth-office-suite-101',
      buildingId: 'building:synth-office-building',
      name: 'Torre Juárez — Suite 101',
      facingStreetPlaceId: 'street:av-la-arboleda',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:synth-office-suite',
      interiorSpaceId: 'interior:synth-office-suite-101',
      thresholdPosition: { x: 85.0, z: 20.0 },
      interiorThresholdPosition: { x: 85.0, z: 21.0 },
      description: 'Direct ground-floor suite entrance.',
    },
  ];

  const syntheticInteriors: InteriorSpace[] = [
    // 1. Restaurant Interior
    {
      interiorId: 'interior:synth-tacos',
      buildingId: 'building:synth-tacos-building',
      associatedPlaceId: 'restaurant:synth-tacos',
      name: 'Tacos El General — Comedor',
      entranceIds: ['entrance:synth-tacos-main'],
      boundary: { minX: 10.0, maxX: 20.0, minZ: 10.0, maxZ: 20.0 },
      description: 'Dining area for synthetic restaurant.',
    },
    // 2. Residential Interior
    {
      interiorId: 'interior:synth-residence',
      buildingId: 'building:synth-residence-building',
      associatedPlaceId: 'residence:synth-residence',
      name: 'Casa Las Palmas — Sala / Interior',
      entranceIds: ['entrance:synth-residence-main'],
      boundary: { minX: 30.0, maxX: 40.0, minZ: 10.0, maxZ: 20.0 },
      description: 'Private home living space.',
    },
    // 3. Retail Store Interior
    {
      interiorId: 'interior:synth-store',
      buildingId: 'building:synth-store-building',
      associatedPlaceId: 'store:synth-store',
      name: 'Supermercado Del Norte — Piso de Venta',
      entranceIds: ['entrance:synth-store-main'],
      boundary: { minX: 50.0, maxX: 65.0, minZ: 10.0, maxZ: 25.0 },
      description: 'Retail supermarket sales floor.',
    },
    // 4. Corporate Lobby Interior (connected to 2 entrances: front and side)
    {
      interiorId: 'interior:synth-office-lobby',
      buildingId: 'building:synth-office-building',
      associatedPlaceId: 'office:synth-office-lobby',
      name: 'Torre Juárez — Vestíbulo Principal',
      entranceIds: ['entrance:synth-office-front', 'entrance:synth-office-side'],
      boundary: { minX: 75.0, maxX: 95.0, minZ: 10.0, maxZ: 18.0 },
      description: 'Shared corporate lobby.',
    },
    // 5. Secondary Interior Space in same Corporate Building (multi-interior)
    {
      interiorId: 'interior:synth-office-suite-101',
      buildingId: 'building:synth-office-building',
      associatedPlaceId: 'office:synth-office-suite-101',
      name: 'Torre Juárez — Oficina Suite 101',
      entranceIds: ['entrance:synth-office-suite-101'],
      boundary: { minX: 75.0, maxX: 95.0, minZ: 19.0, maxZ: 30.0 },
      description: 'Independent office suite inside Torre Juárez.',
    },
  ];

  const syntheticTopology: GomezMorinSpatialTopology = {
    roads: [],
    intersections: [],
    parcels: [],
    entrances: syntheticEntrances,
    interiors: syntheticInteriors,
    navGraph: { nodes: [], edges: [] },
  };

  // =========================================================================
  // Test Group 1: Multi-Venue Ingress & Egress Generalization
  // =========================================================================
  describe('1. Multi-Venue Architectural Generalization', () => {
    it('authoritatively enters and exits a non-Wing Spot restaurant (Tacos El General)', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      // 1. Ingress
      const enterRes = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-tacos-main',
        spatialPosition: { x: 15.0, z: 9.8 },
      }, syntheticTopology);

      assert.equal(enterRes.success, true);
      assert.equal(enterRes.code, 'success');
      assert.equal(player.locationId, 'restaurant:synth-tacos');
      assert.equal(enterRes.newLocationId, 'restaurant:synth-tacos');

      // 2. Egress
      const exitRes = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-tacos-main',
        spatialPosition: { x: 15.0, z: 10.5 },
      }, syntheticTopology);

      assert.equal(exitRes.success, true);
      assert.equal(exitRes.code, 'success');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
      assert.equal(exitRes.newLocationId, 'street:blvd-gomez-morin');
    });

    it('authoritatively enters and exits a residential interior (Casa Las Palmas)', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:calle-del-porvenir';

      // 1. Ingress into private residence
      const enterRes = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-residence-main',
        spatialPosition: { x: 35.0, z: 9.8 },
      }, syntheticTopology);

      assert.equal(enterRes.success, true);
      assert.equal(enterRes.code, 'success');
      assert.equal(player.locationId, 'residence:synth-residence');

      // 2. Egress out of residence
      const exitRes = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-residence-main',
        spatialPosition: { x: 35.0, z: 10.5 },
      }, syntheticTopology);

      assert.equal(exitRes.success, true);
      assert.equal(player.locationId, 'street:calle-del-porvenir');
    });

    it('authoritatively enters and exits a retail store interior (Supermercado Del Norte)', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      // 1. Ingress
      const enterRes = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-store-main',
        spatialPosition: { x: 55.0, z: 9.8 },
      }, syntheticTopology);

      assert.equal(enterRes.success, true);
      assert.equal(player.locationId, 'store:synth-store');

      // 2. Egress
      const exitRes = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-store-main',
        spatialPosition: { x: 55.0, z: 10.5 },
      }, syntheticTopology);

      assert.equal(exitRes.success, true);
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
    });
  });

  // =========================================================================
  // Test Group 2: Multi-Entrance & Multi-Interior Buildings
  // =========================================================================
  describe('2. Multi-Entrance & Multi-Interior Buildings', () => {
    it('supports 1 building containing multiple distinct interior spaces', () => {
      const officeInteriors = findInteriorSpacesByBuilding(
        syntheticTopology,
        'building:synth-office-building'
      );
      assert.equal(officeInteriors.length, 2);
      assert.equal(officeInteriors[0].interiorId, 'interior:synth-office-lobby');
      assert.equal(officeInteriors[1].interiorId, 'interior:synth-office-suite-101');
    });

    it('supports 1 interior space having multiple distinct entrances (front and side)', () => {
      const lobby = findInteriorSpaceById(syntheticTopology, 'interior:synth-office-lobby')!;
      assert.ok(lobby);
      assert.equal(lobby.entranceIds.length, 2);
      assert.deepEqual(lobby.entranceIds, [
        'entrance:synth-office-front',
        'entrance:synth-office-side',
      ]);
    });

    it('allows entering through front entrance and exiting through side entrance', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:av-la-arboleda';

      // Ingress via Front Entrance
      const enterRes = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-office-front',
        spatialPosition: { x: 80.0, z: 9.8 },
      }, syntheticTopology);

      assert.equal(enterRes.success, true);
      assert.equal(player.locationId, 'office:synth-office-lobby');

      // Egress via Side Entrance
      const exitRes = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-office-side',
        spatialPosition: { x: 89.0, z: 15.0 },
      }, syntheticTopology);

      assert.equal(exitRes.success, true);
      assert.equal(player.locationId, 'street:av-la-arboleda');
    });
  });

  // =========================================================================
  // Test Group 3: Data-Driven Coordinate Validation (No Wing Spot Hardcoding)
  // =========================================================================
  describe('3. Data-Driven Coordinate Validation & Wall Breach Enforcement', () => {
    it('rejects exterior wall breach on non-Wing Spot entrance using thresholdPosition', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      const stateBefore = JSON.stringify(state);

      // Player stands at (15.0, 25.0) -> threshold is at (15.0, 9.8) -> dist = 15.2m > 3.5m
      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-tacos-main',
        spatialPosition: { x: 15.0, z: 25.0 },
      }, syntheticTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'invalid-entrance-position');
      assert.match(res.message, /Cannot enter through wall/);
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
      assert.equal(JSON.stringify(state), stateBefore, 'Zero state mutation on wall entry rejection');
    });

    it('rejects interior wall breach on non-Wing Spot interior using interiorThresholdPosition', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'store:synth-store';
      const stateBefore = JSON.stringify(state);

      // Interior threshold is at (55.0, 10.5). Player attempts exit at (55.0, 24.0) -> dist = 13.5m > 3.5m
      const res = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-store-main',
        spatialPosition: { x: 55.0, z: 24.0 },
      }, syntheticTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'invalid-exit-position');
      assert.match(res.message, /Cannot exit through wall/);
      assert.equal(player.locationId, 'store:synth-store');
      assert.equal(JSON.stringify(state), stateBefore, 'Zero state mutation on wall exit rejection');
    });

    it('respects custom maxThresholdDistance override', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      // Distance is 4.0m. Default is 3.5m (would fail). Custom max of 5.0m succeeds.
      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-tacos-main',
        spatialPosition: { x: 15.0, z: 5.8 }, // 4.0m away from z: 9.8
        maxThresholdDistance: 5.0,
      }, syntheticTopology);

      assert.equal(res.success, true);
      assert.equal(player.locationId, 'restaurant:synth-tacos');
    });
  });

  // =========================================================================
  // Test Group 4: Comprehensive Failure Atomicity Matrix
  // =========================================================================
  describe('4. Comprehensive Failure Atomicity Matrix', () => {
    it('fails atomically when agent does not exist (missing agent)', () => {
      const state = setupWorld();
      const stateBefore = JSON.stringify(state);

      const res = enterThroughEntranceThreshold(state, {
        agentId: 'agent:non-existent',
        entranceId: 'entrance:synth-tacos-main',
      }, syntheticTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'agent-not-found');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('fails atomically when NPC attempts player-only entrance threshold (agent-not-player)', () => {
      const state = setupWorld();
      const npc = state.agents.find((a) => a.agentType === 'npc')!;
      npc.locationId = 'street:blvd-gomez-morin';
      const stateBefore = JSON.stringify(state);

      const res = enterThroughEntranceThreshold(state, {
        agentId: npc.id,
        entranceId: 'entrance:synth-tacos-main',
      }, syntheticTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'agent-not-player');
      assert.equal(npc.locationId, 'street:blvd-gomez-morin');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('fails atomically when entrance is not found in topology (missing entrance)', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      const stateBefore = JSON.stringify(state);

      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:non-existent',
      }, syntheticTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'entrance-not-found');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('fails atomically when entrance has no associated interior space (missing interior)', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      const stateBefore = JSON.stringify(state);

      // Entrance with no interior in topology
      const orphanTopology: GomezMorinSpatialTopology = {
        ...syntheticTopology,
        interiors: [],
      };

      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-tacos-main',
      }, orphanTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'interior-not-found');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('fails atomically when player is at wrong origin location (invalid-origin-location)', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:calle-del-porvenir'; // Wrong street! Tacos faces blvd-gomez-morin
      const stateBefore = JSON.stringify(state);

      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-tacos-main',
      }, syntheticTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'invalid-origin-location');
      assert.equal(player.locationId, 'street:calle-del-porvenir');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('fails atomically when player is already inside the interior (already-inside)', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:synth-tacos';
      const stateBefore = JSON.stringify(state);

      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-tacos-main',
      }, syntheticTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'already-inside');
      assert.equal(player.locationId, 'restaurant:synth-tacos');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('fails atomically on exit when player is not inside the interior (not-inside-interior)', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      const stateBefore = JSON.stringify(state);

      const res = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:synth-tacos-main',
      }, syntheticTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'not-inside-interior');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('fails atomically when commercial business is closed (restaurant-closed)', () => {
      const state = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      // Add closed restaurant to state matching synthetic interior
      const closedRestaurantState: WorldState = {
        ...state,
        restaurants: [
          ...state.restaurants,
          {
            id: 'restaurant:synth-tacos',
            name: 'Tacos El General',
            buildingId: 'building:synth-tacos-building',
            seatingCapacity: 20,
            currentOccupancy: 0,
            menuOfferings: [],
            revenue: 0,
            operatingHours: { open: '10:00', close: '22:00' },
            operationalState: 'closed',
            serviceRate: 1,
          },
        ],
      };
      const stateBefore = JSON.stringify(closedRestaurantState);

      const res = enterThroughEntranceThreshold(closedRestaurantState, {
        agentId: player.id,
        entranceId: 'entrance:synth-tacos-main',
      }, syntheticTopology);

      assert.equal(res.success, false);
      assert.equal(res.code, 'restaurant-closed');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
      assert.equal(JSON.stringify(closedRestaurantState), stateBefore);
    });
  });

  // =========================================================================
  // Test Group 5: Bidirectional Contextual Action Resolution Generalization
  // =========================================================================
  describe('5. Bidirectional Contextual Action Resolution Generalization', () => {
    it('resolves generic exit action when agent is inside a non-Wing-Spot interior', () => {
      const entrance = findEntranceById(syntheticTopology, 'entrance:synth-store-main')!;
      const action = resolveContextualEntranceAction(
        entrance,
        undefined,
        'store:synth-store',
        syntheticTopology
      );

      assert.equal(action.actionLabel, 'Exit Supermercado Del Norte');
      assert.equal(action.commandName, 'exitEntranceThreshold');
      assert.equal(action.targetLocationId, 'street:blvd-gomez-morin');
      assert.equal(action.isAvailable, true);
    });

    it('resolves generic enter action when agent is outdoors near non-Wing-Spot entrance', () => {
      const entrance = findEntranceById(syntheticTopology, 'entrance:synth-store-main')!;
      const action = resolveContextualEntranceAction(
        entrance,
        undefined,
        'street:blvd-gomez-morin',
        syntheticTopology
      );

      assert.equal(action.actionLabel, 'Enter Supermercado Del Norte — Entrada');
      assert.equal(action.commandName, 'enterBuilding');
      assert.equal(action.targetLocationId, 'building:synth-store-building');
      assert.equal(action.isAvailable, true);
    });
  });

  // =========================================================================
  // Test Group 6: Client Walkability Generalization
  // =========================================================================
  describe('6. Client Walkability Generalization', () => {
    it('evaluates contextual walkability for synthetic interior boundary dynamically', () => {
      // Synthetic store boundary: [50.0, 65.0] x [10.0, 25.0]
      // Inner margin is 0.2m: [50.2, 64.8] x [10.2, 25.0]
      assert.equal(
        isContextualWalkablePosition(55.0, 15.0, 'store:synth-store', syntheticTopology),
        true,
        'Inside sales floor'
      );
      assert.equal(
        isContextualWalkablePosition(49.0, 15.0, 'store:synth-store', syntheticTopology),
        false,
        'Breaching west wall'
      );
      assert.equal(
        isContextualWalkablePosition(66.0, 15.0, 'store:synth-store', syntheticTopology),
        false,
        'Breaching east wall'
      );
    });
  });

  // =========================================================================
  // Test Group 7: Interior Topology Invariants & Uniqueness Validation
  // =========================================================================
  describe('7. Interior Topology Invariants & Structural Validation', () => {
    it('verifies that the canonical Gómez Morín topology satisfies all interior invariants', () => {
      const prodTopology = createGomezMorinSpatialTopology();
      const validation = validateInteriorTopology(prodTopology);

      assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join('; ')}`);
      assert.deepEqual(validation.errors, []);
    });

    it('detects duplicate interiorId in corrupted topology', () => {
      const corrupted: GomezMorinSpatialTopology = {
        ...syntheticTopology,
        interiors: [
          ...syntheticInteriors,
          {
            interiorId: 'interior:synth-tacos', // Duplicate!
            buildingId: 'building:synth-tacos-building',
            associatedPlaceId: 'restaurant:synth-tacos',
            name: 'Duplicate Tacos',
            entranceIds: [],
            boundary: { minX: 10, maxX: 20, minZ: 10, maxZ: 20 },
          },
        ],
      };

      const res = validateInteriorTopology(corrupted);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes('Duplicate interiorId "interior:synth-tacos"')));
    });

    it('detects invalid degenerate spatial boundary (maxX <= minX)', () => {
      const corrupted: GomezMorinSpatialTopology = {
        ...syntheticTopology,
        interiors: [
          {
            interiorId: 'interior:corrupt-bounds',
            buildingId: 'building:synth-tacos-building',
            associatedPlaceId: 'restaurant:synth-tacos',
            name: 'Corrupt Bounds',
            entranceIds: [],
            boundary: { minX: 25, maxX: 20, minZ: 10, maxZ: 20 }, // minX > maxX!
          },
        ],
      };

      const res = validateInteriorTopology(corrupted);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes('invalid X bounds')));
    });

    it('detects mismatched building assignment between entrance and interior', () => {
      const corrupted: GomezMorinSpatialTopology = {
        ...syntheticTopology,
        interiors: [
          {
            interiorId: 'interior:mismatched-building',
            buildingId: 'building:synth-tacos-building',
            associatedPlaceId: 'restaurant:synth-tacos',
            name: 'Mismatched Building Interior',
            entranceIds: ['entrance:synth-residence-main'], // Belongs to synth-residence-building!
            boundary: { minX: 10, maxX: 20, minZ: 10, maxZ: 20 },
          },
        ],
      };

      const res = validateInteriorTopology(corrupted);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes('belongs to building')));
    });

    it('detects an entrance referenced by multiple distinct interiors', () => {
      const corrupted: GomezMorinSpatialTopology = {
        ...syntheticTopology,
        interiors: [
          {
            interiorId: 'interior:one',
            buildingId: 'building:synth-tacos-building',
            associatedPlaceId: 'restaurant:synth-tacos',
            name: 'Room One',
            entranceIds: ['entrance:synth-tacos-main'],
            boundary: { minX: 10, maxX: 20, minZ: 10, maxZ: 20 },
          },
          {
            interiorId: 'interior:two',
            buildingId: 'building:synth-tacos-building',
            associatedPlaceId: 'restaurant:synth-tacos',
            name: 'Room Two',
            entranceIds: ['entrance:synth-tacos-main'], // Reusing same entrance!
            boundary: { minX: 10, maxX: 20, minZ: 10, maxZ: 20 },
          },
        ],
      };

      const res = validateInteriorTopology(corrupted);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes('is referenced by multiple interiors')));
    });
  });

  // =========================================================================
  // Test Group 8: Absence of Implicit Wing Spot Fallback in SessionController
  // =========================================================================
  describe('8. Absence of Implicit Wing Spot Fallback in SessionController', () => {
    function createTempController(): { controller: WorldSessionController; cleanup: () => void } {
      const tempPath = join(
        tmpdir(),
        `m82-audit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
      );
      const controller = new WorldSessionController({
        persistencePath: tempPath,
        silent: true,
      });
      const cleanup = () => {
        if (existsSync(tempPath)) {
          try {
            unlinkSync(tempPath);
          } catch {
            // Ignore
          }
        }
      };
      return { controller, cleanup };
    }

    it('strictly rejects enterEntranceThreshold when entranceId is missing (no Wing Spot default)', async () => {
      const { controller, cleanup } = createTempController();

      const result = await controller.dispatchCommand('enterEntranceThreshold', {
        // entranceId omitted!
        spatialPosition: { x: -45.0, z: -12.4 },
      });

      assert.equal(result.success, false);
      assert.equal(result.committed, false);
      assert.equal(result.error?.code, 'missing-entrance-id');
      assert.match(result.error?.message ?? '', /entranceId is required/);

      await controller.shutdown();
      cleanup();
    });

    it('strictly rejects exitEntranceThreshold when entranceId is missing (no Wing Spot default)', async () => {
      const { controller, cleanup } = createTempController();

      const result = await controller.dispatchCommand('exitEntranceThreshold', {
        // entranceId omitted!
        spatialPosition: { x: -45.0, z: -13.5 },
      });

      assert.equal(result.success, false);
      assert.equal(result.committed, false);
      assert.equal(result.error?.code, 'missing-entrance-id');
      assert.match(result.error?.message ?? '', /entranceId is required/);

      await controller.shutdown();
      cleanup();
    });

    it('strictly rejects invalid entranceId with entrance-not-found (no Wing Spot substitution)', async () => {
      const { controller, cleanup } = createTempController();

      const result = await controller.dispatchCommand('enterEntranceThreshold', {
        entranceId: 'entrance:fake-nonexistent',
        spatialPosition: { x: -45.0, z: -12.4 },
      });

      assert.equal(result.success, false);
      assert.equal(result.committed, false);
      assert.equal(result.error?.code, 'entrance-not-found');

      await controller.shutdown();
      cleanup();
    });
  });
});
