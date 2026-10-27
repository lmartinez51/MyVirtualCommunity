import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createGomezMorinWorldState,
  WorldState,
} from '../src/core/world-state.js';
import {
  createGomezMorinSpatialTopology,
  findInteriorSpaceById,
  findInteriorSpaceByBuilding,
  findInteriorSpaceByPlace,
  isInsideInteriorBoundary,
  findEntranceById,
  enterThroughEntranceThreshold,
  exitThroughEntranceThreshold,
  resolveContextualEntranceAction,
  validateInteriorTopology,
  GomezMorinSpatialTopology,
} from '../src/core/real-world-street-topology.js';
import {
  isContextualWalkablePosition,
  isTiaLupeInteriorWalkablePosition,
  isWingSpotInteriorWalkablePosition,
  getGomezMorinNavCoordinates,
} from '../clients/minimal-3d/minimal-3d-client.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';

describe('Milestone 83 — Second Real Building Interior: Pastelerías La Tía Lupe', () => {
  const openTime = '2026-09-14T16:00:00.000Z'; // 10:00 AM local Juárez (Open)
  const closedTime = '2026-09-14T02:00:00.000Z'; // 20:00 PM local Juárez (Closed)

  function setupWorld(timeIso: string = openTime): {
    state: WorldState;
    clock: WorldClock;
  } {
    const clock = WorldClock.create(timeIso);
    const state = createGomezMorinWorldState(clock);
    return { state, clock };
  }

  const topology = createGomezMorinSpatialTopology();

  // =========================================================================
  // Group 1: Topology Definition & Linkages
  // =========================================================================
  describe('Group 1: Topology Definition & Linkages', () => {
    it('defines Pastelerías La Tía Lupe authoritative interior space in canonical topology', () => {
      const interior = findInteriorSpaceById(topology, 'interior:tia-lupe');
      assert.ok(interior, 'Tía Lupe interior space must exist in canonical topology');
      assert.equal(interior.interiorId, 'interior:tia-lupe');
      assert.equal(interior.buildingId, 'building:tia-lupe-building');
      assert.equal(interior.associatedPlaceId, 'restaurant:pasteleria-tia-lupe');
      assert.deepEqual(interior.entranceIds, ['entrance:tia-lupe-main']);
      assert.equal(interior.name, 'Pastelerías La Tía Lupe — Espacio Interior');
    });

    it('resolves interior via buildingId and placeId lookups', () => {
      const byBuilding = findInteriorSpaceByBuilding(topology, 'building:tia-lupe-building');
      assert.ok(byBuilding);
      assert.equal(byBuilding.interiorId, 'interior:tia-lupe');

      const byPlace = findInteriorSpaceByPlace(topology, 'restaurant:pasteleria-tia-lupe');
      assert.ok(byPlace);
      assert.equal(byPlace.interiorId, 'interior:tia-lupe');
    });

    it('defines provisional boundary within the real-world-derived building footprint', () => {
      const interior = findInteriorSpaceById(topology, 'interior:tia-lupe')!;
      assert.ok(interior.boundary);
      // Building footprint: [-36.5, -25.5] x [-24.5, -12.5]
      // Interior boundary: [-35.5, -26.5] x [-23.5, -13.0]
      assert.ok(interior.boundary.minX >= -36.5, 'Interior minX must be within building footprint');
      assert.ok(interior.boundary.maxX <= -25.5, 'Interior maxX must be within building footprint');
      assert.ok(interior.boundary.minZ >= -24.5, 'Interior minZ must be within building footprint');
      assert.ok(interior.boundary.maxZ <= -12.5, 'Interior maxZ must be within building footprint');
      assert.ok(interior.boundary.maxX > interior.boundary.minX, 'Boundary X must be non-degenerate');
      assert.ok(interior.boundary.maxZ > interior.boundary.minZ, 'Boundary Z must be non-degenerate');
    });

    it('links BuildingEntrance entrance:tia-lupe-main to interior and nav threshold node', () => {
      const entrance = findEntranceById(topology, 'entrance:tia-lupe-main');
      assert.ok(entrance, 'Entrance entrance:tia-lupe-main must exist');
      assert.equal(entrance.interiorSpaceId, 'interior:tia-lupe');
      assert.equal(entrance.interiorNavNodeId, 'node:nav:interior:tia-lupe-threshold');
      assert.deepEqual(entrance.thresholdPosition, { x: -30.0, z: -12.4 });
      assert.deepEqual(entrance.interiorThresholdPosition, { x: -30.0, z: -13.5 });
    });

    it('defines interior threshold nav node and connecting edge in the pedestrian navigation graph', () => {
      const interiorNode = topology.navGraph.nodes.find(
        (n) => n.id === 'node:nav:interior:tia-lupe-threshold'
      );
      assert.ok(interiorNode, 'Interior nav node must exist in graph');
      assert.equal(interiorNode.nodeType, 'entrance');
      assert.equal(interiorNode.associatedPlaceId, 'restaurant:pasteleria-tia-lupe');

      const thresholdEdge = topology.navGraph.edges.find(
        (e) => e.id === 'edge:tia-lupe-entrance-to-interior-threshold'
      );
      assert.ok(thresholdEdge, 'Threshold edge must exist in graph');
      assert.equal(thresholdEdge.fromNodeId, 'node:nav:entrance:tia-lupe');
      assert.equal(thresholdEdge.toNodeId, 'node:nav:interior:tia-lupe-threshold');
      assert.equal(thresholdEdge.edgeType, 'entrance-threshold');
      assert.equal(thresholdEdge.bidirectional, true);
    });

    it('evaluates interior boundary containment correctly', () => {
      const interior = findInteriorSpaceById(topology, 'interior:tia-lupe')!;
      // Center of bakery interior (-31.0, -18.25)
      assert.equal(isInsideInteriorBoundary(interior, -31.0, -18.25), true);
      // Interior threshold (-30.0, -13.5)
      assert.equal(isInsideInteriorBoundary(interior, -30.0, -13.5), true);
      // Outside boundary: north of back wall
      assert.equal(isInsideInteriorBoundary(interior, -31.0, -25.0), false);
      // Outside boundary: south of front wall (on sidewalk)
      assert.equal(isInsideInteriorBoundary(interior, -30.0, -11.0), false);
      // Outside boundary: west of building
      assert.equal(isInsideInteriorBoundary(interior, -38.0, -18.0), false);
      // Outside boundary: east of building (on Del Porvenir)
      assert.equal(isInsideInteriorBoundary(interior, -24.0, -18.0), false);
    });
  });

  // =========================================================================
  // Group 2: Generic Ingress (enterThroughEntranceThreshold) & Rejections
  // =========================================================================
  describe('Group 2: Generic Ingress & Rejections', () => {
    it('successfully transitions player into Pastelerías La Tía Lupe when at entrance threshold', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      const result = enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
        spatialPosition: { x: -30.0, z: -12.4 },
      });

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.newLocationId, 'restaurant:pasteleria-tia-lupe');
      assert.equal(result.interiorId, 'interior:tia-lupe');
      assert.equal(player.locationId, 'restaurant:pasteleria-tia-lupe');
    });

    it('rejects entrance when player is too far from entrance threshold (preventing wall clipping)', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      // Player attempting entry from 5 meters away along the wall
      const result = enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
        spatialPosition: { x: -36.0, z: -12.4 },
        maxThresholdDistance: 2.5,
      });

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-entrance-position');
      assert.equal(player.locationId, 'street:blvd-gomez-morin', 'State must not mutate on failure');
    });

    it('rejects ingress if agent is not a player (agent-not-player)', () => {
      const { state } = setupWorld(openTime);
      const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      elena.locationId = 'street:blvd-gomez-morin';

      const result = enterThroughEntranceThreshold(state, {
        agentId: 'agent:elena-npc',
        entranceId: 'entrance:tia-lupe-main',
      });

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-player');
      assert.equal(elena.locationId, 'street:blvd-gomez-morin');
    });

    it('rejects ingress if player is at an invalid origin location', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:calle-del-porvenir';

      const result = enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
        spatialPosition: { x: -30.0, z: -12.4 },
      });

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-origin-location');
      assert.equal(player.locationId, 'street:calle-del-porvenir');
    });

    it('rejects ingress if player is already inside the interior', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:pasteleria-tia-lupe';

      const result = enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
      });

      assert.equal(result.success, false);
      assert.equal(result.code, 'already-inside');
      assert.equal(player.locationId, 'restaurant:pasteleria-tia-lupe');
    });

    it('rejects ingress when bakery is closed', () => {
      const { state } = setupWorld(closedTime);
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:pasteleria-tia-lupe');
      if (restaurant) {
        restaurant.operationalState = 'closed';
      }
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      const result = enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
        spatialPosition: { x: -30.0, z: -12.4 },
      });

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-closed');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
    });
  });

  // =========================================================================
  // Group 3: Generic Egress (exitThroughEntranceThreshold) & Rejections
  // =========================================================================
  describe('Group 3: Generic Egress & Rejections', () => {
    it('successfully transitions player out of Pastelerías La Tía Lupe when at interior threshold', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:pasteleria-tia-lupe';

      const result = exitThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
        spatialPosition: { x: -30.0, z: -13.5 },
      });

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.newLocationId, 'street:blvd-gomez-morin');
      assert.equal(result.interiorId, 'interior:tia-lupe');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
    });

    it('rejects egress when player is away from interior threshold (preventing exiting through walls)', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:pasteleria-tia-lupe';

      // Player attempting exit from far corner (-35.0, -22.0)
      const result = exitThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
        spatialPosition: { x: -35.0, z: -22.0 },
        maxThresholdDistance: 2.5,
      });

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-exit-position');
      assert.equal(player.locationId, 'restaurant:pasteleria-tia-lupe', 'State must not mutate on failure');
    });

    it('rejects egress if player is not currently inside the interior', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      const result = exitThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
      });

      assert.equal(result.success, false);
      assert.equal(result.code, 'not-inside-interior');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
    });
  });

  // =========================================================================
  // Group 4: Contextual Entrance Action Resolution
  // =========================================================================
  describe('Group 4: Contextual Entrance Action Resolution', () => {
    it('resolves [E] Enter Pastelerías La Tía Lupe when player is outdoors on street', () => {
      const { state } = setupWorld(openTime);
      const entrance = findEntranceById(topology, 'entrance:tia-lupe-main')!;

      const action = resolveContextualEntranceAction(entrance, state, 'street:blvd-gomez-morin', topology);

      assert.equal(action.actionLabel, 'Enter Pastelerías La Tía Lupe');
      assert.equal(action.commandName, 'enterRestaurant');
      assert.equal(action.targetLocationId, 'restaurant:pasteleria-tia-lupe');
      assert.equal(action.isAvailable, true);
    });

    it('resolves [E] Exit Pastelerías La Tía Lupe when player is indoors', () => {
      const { state } = setupWorld(openTime);
      const entrance = findEntranceById(topology, 'entrance:tia-lupe-main')!;

      const action = resolveContextualEntranceAction(entrance, state, 'restaurant:pasteleria-tia-lupe', topology);

      assert.equal(action.actionLabel, 'Exit Pastelerías La Tía Lupe');
      assert.equal(action.commandName, 'exitRestaurant');
      assert.equal(action.targetLocationId, 'street:blvd-gomez-morin');
      assert.equal(action.targetName, 'Blvd. Manuel Gómez Morín');
      assert.equal(action.isAvailable, true);
    });
  });

  // =========================================================================
  // Group 5: Topology Validation (validateInteriorTopology)
  // =========================================================================
  describe('Group 5: Topology Validation', () => {
    it('confirms canonical topology with both Wing Spot and Tía Lupe interiors passes validation with zero errors', () => {
      const result = validateInteriorTopology(topology);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    it('fails validation when an interior has degenerate spatial boundary', () => {
      const corrupted: GomezMorinSpatialTopology = structuredClone(topology);
      const tiaLupe = corrupted.interiors.find((i) => i.interiorId === 'interior:tia-lupe')!;
      // Invert X bounds
      (tiaLupe.boundary as { minX: number; maxX: number }).maxX = -40.0;
      (tiaLupe.boundary as { minX: number; maxX: number }).minX = -30.0;

      const result = validateInteriorTopology(corrupted);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('invalid X bounds')));
    });

    it('fails validation when an interior references a non-existent building', () => {
      const corrupted: GomezMorinSpatialTopology = structuredClone(topology);
      const tiaLupe = corrupted.interiors.find((i) => i.interiorId === 'interior:tia-lupe')!;
      (tiaLupe as { buildingId: string }).buildingId = 'building:non-existent';

      const result = validateInteriorTopology(corrupted);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('non-existent buildingId')));
    });

    it('fails validation when an entrance references a non-existent interiorNavNodeId', () => {
      const corrupted: GomezMorinSpatialTopology = structuredClone(topology);
      const entrance = corrupted.entrances.find((e) => e.entranceId === 'entrance:tia-lupe-main')!;
      (entrance as { interiorNavNodeId: string }).interiorNavNodeId = 'node:nav:non-existent';

      const result = validateInteriorTopology(corrupted);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('non-existent interiorNavNodeId')));
    });
  });

  // =========================================================================
  // Group 6: Regression Verification & End-to-End Coexistence
  // =========================================================================
  describe('Group 6: Regression Verification & End-to-End Coexistence', () => {
    it('verifies Wing Spot interior functions identically alongside Tía Lupe', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      // Enter Wing Spot
      const enterResult = enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -45.0, z: -12.4 },
      });
      assert.equal(enterResult.success, true);
      assert.equal(player.locationId, 'restaurant:wing-spot');

      // Exit Wing Spot
      const exitResult = exitThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -45.0, z: -13.5 },
      });
      assert.equal(exitResult.success, true);
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
    });

    it('verifies SessionController enterRestaurant and exitRestaurant route seamlessly for both venues', async () => {
      const testFile = join(tmpdir(), `test-session-m83-${Date.now()}.json`);
      const { state } = setupWorld(openTime);
      const persistence = new LocalFilePersistence(testFile);
      persistence.save(state);
      const controller = new WorldSessionController({
        persistencePath: testFile,
        playerId: 'agent:gomez-morin-player',
        silent: true,
      });

      try {
        const player = controller.getStatus();
        assert.equal(player.activePlayerId, 'agent:gomez-morin-player');

        // 1. Enter Tía Lupe via session command
        const enterTiaLupe = await controller.dispatchCommand('enterRestaurant', {
          restaurantId: 'restaurant:pasteleria-tia-lupe',
          spatialPosition: { x: -30.0, z: -12.4 },
        });
        assert.equal(enterTiaLupe.success, true);
        assert.equal(controller.getLocationView().locationId, 'restaurant:pasteleria-tia-lupe');

        // 2. Exit Tía Lupe via session command
        const exitTiaLupe = await controller.dispatchCommand('exitRestaurant', {
          restaurantId: 'restaurant:pasteleria-tia-lupe',
          spatialPosition: { x: -30.0, z: -13.5 },
        });
        assert.equal(exitTiaLupe.success, true);
        assert.equal(controller.getLocationView().locationId, 'street:blvd-gomez-morin');

        // 3. Enter Wing Spot via session command
        const enterWingSpot = await controller.dispatchCommand('enterRestaurant', {
          restaurantId: 'restaurant:wing-spot',
          spatialPosition: { x: -45.0, z: -12.4 },
        });
        assert.equal(enterWingSpot.success, true);
        assert.equal(controller.getLocationView().locationId, 'restaurant:wing-spot');

        // 4. Exit Wing Spot via session command
        const exitWingSpot = await controller.dispatchCommand('exitRestaurant', {
          restaurantId: 'restaurant:wing-spot',
          spatialPosition: { x: -45.0, z: -13.5 },
        });
        assert.equal(exitWingSpot.success, true);
        assert.equal(controller.getLocationView().locationId, 'street:blvd-gomez-morin');
      } finally {
        await controller.shutdown();
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('verifies 3D client contextual walkability and nav node coordinates for both interiors', () => {
      const navCoords = getGomezMorinNavCoordinates();
      assert.ok(navCoords.has('node:nav:interior:tia-lupe-threshold'));
      assert.deepEqual(navCoords.get('node:nav:interior:tia-lupe-threshold'), {
        x: -30.0,
        y: 1.0,
        z: -13.5,
      });

      assert.ok(navCoords.has('node:nav:interior:wing-spot-threshold'));
      assert.deepEqual(navCoords.get('node:nav:interior:wing-spot-threshold'), {
        x: -45.0,
        y: 1.0,
        z: -13.5,
      });

      // Tía Lupe contextual walkability
      assert.equal(
        isContextualWalkablePosition(-31.0, -18.0, 'restaurant:pasteleria-tia-lupe', topology),
        true
      );
      // Beyond Tía Lupe wall
      assert.equal(
        isContextualWalkablePosition(-38.0, -18.0, 'restaurant:pasteleria-tia-lupe', topology),
        false
      );

      // Dedicated helper
      assert.equal(isTiaLupeInteriorWalkablePosition(-30.0, -15.0), true);
      assert.equal(isTiaLupeInteriorWalkablePosition(-38.0, -15.0), false);
      assert.equal(isWingSpotInteriorWalkablePosition(-45.0, -15.0), true);
      assert.equal(isWingSpotInteriorWalkablePosition(-30.0, -15.0), false);
    });
  });
});
