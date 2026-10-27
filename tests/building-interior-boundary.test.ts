import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  createGomezMorinWorldState,
  transitionAgentLocation,
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
  findPedestrianRoute,
} from '../src/core/real-world-street-topology.js';
import {
  DeterministicMockNavigationProvider,
  createNavigationRequest,
  validateArrivalAndCommit,
} from '../src/core/navigation-contract.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';

describe('Milestone 82 — First Building Interior Boundary', () => {
  const openTime = '2026-09-14T16:00:00.000Z'; // 10:00 AM local Juárez
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
  // Test Group 1: Interior Existence & Authoritative Domain Identity
  // =========================================================================
  describe('1. Interior Existence & Spatial Identity', () => {
    it('defines authoritative interior spaces in the spatial topology including Wing Spot', () => {
      assert.ok(topology.interiors.length >= 1);
      assert.ok(topology.interiors.some((i) => i.interiorId === 'interior:wing-spot'));
    });

    it('has authoritative interior identity "interior:wing-spot" associated with Wing Spot', () => {
      const interior = findInteriorSpaceById(topology, 'interior:wing-spot');
      assert.ok(interior, 'Wing Spot interior must exist in topology');
      assert.equal(interior.interiorId, 'interior:wing-spot');
      assert.equal(interior.buildingId, 'building:wing-spot-building');
      assert.equal(interior.associatedPlaceId, 'restaurant:wing-spot');
      assert.deepEqual(interior.entranceIds, ['entrance:wing-spot-main']);
    });

    it('looks up interior by building ID and place ID', () => {
      const byBuilding = findInteriorSpaceByBuilding(topology, 'building:wing-spot-building');
      assert.ok(byBuilding);
      assert.equal(byBuilding.interiorId, 'interior:wing-spot');

      const byPlace = findInteriorSpaceByPlace(topology, 'restaurant:wing-spot');
      assert.ok(byPlace);
      assert.equal(byPlace.interiorId, 'interior:wing-spot');

      const nonexistent = findInteriorSpaceByBuilding(topology, 'building:non-existent');
      assert.equal(nonexistent, undefined);
    });

    it('defines provisional interior boundary within the building footprint', () => {
      const interior = findInteriorSpaceById(topology, 'interior:wing-spot')!;
      assert.ok(interior.boundary);
      // Wing Spot footprint is [-51.5, -38.5] x [-24.5, -12.5]
      assert.ok(interior.boundary.minX >= -51.5);
      assert.ok(interior.boundary.maxX <= -38.5);
      assert.ok(interior.boundary.minZ >= -24.5);
      assert.ok(interior.boundary.maxZ <= -12.5);
      assert.ok(interior.boundary.maxX > interior.boundary.minX);
      assert.ok(interior.boundary.maxZ > interior.boundary.minZ);
    });

    it('links BuildingEntrance to the interior space and interior nav node', () => {
      const entrance = findEntranceById(topology, 'entrance:wing-spot-main')!;
      assert.ok(entrance);
      assert.equal(entrance.interiorSpaceId, 'interior:wing-spot');
      assert.equal(entrance.interiorNavNodeId, 'node:nav:interior:wing-spot-threshold');

      // Verify interior nav node exists in nav graph
      const interiorNode = topology.navGraph.nodes.find(
        (n) => n.id === 'node:nav:interior:wing-spot-threshold'
      );
      assert.ok(interiorNode, 'Interior threshold nav node must exist in graph');
      assert.equal(interiorNode.associatedPlaceId, 'restaurant:wing-spot');

      // Verify bidirectional threshold edge connects exterior entrance to interior threshold
      const thresholdEdge = topology.navGraph.edges.find(
        (e) =>
          (e.fromNodeId === 'node:nav:entrance:wing-spot' &&
            e.toNodeId === 'node:nav:interior:wing-spot-threshold') ||
          (e.fromNodeId === 'node:nav:interior:wing-spot-threshold' &&
            e.toNodeId === 'node:nav:entrance:wing-spot')
      );
      assert.ok(thresholdEdge, 'Bidirectional threshold edge must exist in graph');
      assert.equal(thresholdEdge.bidirectional, true);
    });
  });

  // =========================================================================
  // Test Group 2: Valid Entry Through Designated Entrance
  // =========================================================================
  describe('2. Valid Entry Transition', () => {
    it('successfully transitions player from street into Wing Spot through entrance threshold', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';

      // Player stands at exterior entrance threshold (-45.0, -12.4)
      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -45.0, z: -12.4 },
      });

      assert.equal(res.success, true);
      assert.equal(res.code, 'success');
      assert.equal(res.previousLocationId, 'street:blvd-gomez-morin');
      assert.equal(res.newLocationId, 'restaurant:wing-spot');
      assert.equal(res.interiorId, 'interior:wing-spot');
      assert.equal(player.locationId, 'restaurant:wing-spot');
    });

    it('successfully transitions player from building container into interior without explicit coordinates', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'building:wing-spot-building';

      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
      });

      assert.equal(res.success, true);
      assert.equal(res.code, 'success');
      assert.equal(player.locationId, 'restaurant:wing-spot');
    });
  });

  // =========================================================================
  // Test Group 3: Invalid Entry Rejection (Wall Collision & Boundary Authority)
  // =========================================================================
  describe('3. Invalid Entry Rejection & Wall Enforcement', () => {
    it('rejects entry through building wall when position is far from entrance threshold', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      const stateBefore = JSON.stringify(state);

      // Attempting entry at back/west wall (-51.0, -20.0) -> far from entrance anchor (-45.0, -12.4)
      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -51.0, z: -20.0 },
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'invalid-entrance-position');
      assert.match(res.message, /Cannot enter through wall/);
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
      assert.equal(JSON.stringify(state), stateBefore, 'Zero mutation on wall entry rejection');
    });

    it('rejects entry through side wall along front facade when outside entrance radius', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      const stateBefore = JSON.stringify(state);

      // Attempting entry at far east edge of front wall (-39.0, -12.4) -> 6m away from entrance (-45.0)
      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -39.0, z: -12.4 },
        maxThresholdDistance: 3.5,
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'invalid-entrance-position');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('rejects entry when player is located at an unrelated street', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:calle-del-porvenir'; // Wrong street
      const stateBefore = JSON.stringify(state);

      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'invalid-origin-location');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('rejects entry when player is already inside the interior', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot'; // Already inside
      const stateBefore = JSON.stringify(state);

      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'already-inside');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('rejects entry when restaurant is closed', () => {
      const { state } = setupWorld(closedTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin';
      const wingSpot = state.restaurants.find((r) => r.id === 'restaurant:wing-spot')!;
      wingSpot.operationalState = 'closed';
      const stateBefore = JSON.stringify(state);

      const res = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -45.0, z: -12.4 },
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'restaurant-closed');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('rejects entry for an NPC agent through player entrance command', () => {
      const { state } = setupWorld(openTime);
      const npc = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      npc.locationId = 'street:blvd-gomez-morin';
      const stateBefore = JSON.stringify(state);

      const res = enterThroughEntranceThreshold(state, {
        agentId: npc.id,
        entranceId: 'entrance:wing-spot-main',
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'agent-not-player');
      assert.equal(JSON.stringify(state), stateBefore);
    });
  });

  // =========================================================================
  // Test Group 4: Interior Containment & Walkability Boundary Enforcement
  // =========================================================================
  describe('4. Interior Containment & Boundary Walkability', () => {
    const interior = findInteriorSpaceById(topology, 'interior:wing-spot')!;

    it('allows valid positions inside the provisional interior rectangular area', () => {
      assert.equal(isInsideInteriorBoundary(interior, -45.0, -18.0), true, 'Center of room');
      assert.equal(isInsideInteriorBoundary(interior, -49.0, -14.0), true, 'Near southwest corner');
      assert.equal(isInsideInteriorBoundary(interior, -41.0, -22.0), true, 'Near northeast corner');
      assert.equal(isInsideInteriorBoundary(interior, -45.0, -13.2), true, 'Near entrance threshold');
    });

    it('strictly rejects positions that breach the west interior wall', () => {
      // West boundary is minX = -50.5
      assert.equal(isInsideInteriorBoundary(interior, -51.0, -18.0), false);
      assert.equal(isInsideInteriorBoundary(interior, -55.0, -18.0), false);
    });

    it('strictly rejects positions that breach the east interior wall', () => {
      // East boundary is maxX = -39.5
      assert.equal(isInsideInteriorBoundary(interior, -39.0, -18.0), false);
      assert.equal(isInsideInteriorBoundary(interior, -35.0, -18.0), false);
    });

    it('strictly rejects positions that breach the north interior wall', () => {
      // North boundary is minZ = -23.5
      assert.equal(isInsideInteriorBoundary(interior, -45.0, -24.0), false);
      assert.equal(isInsideInteriorBoundary(interior, -45.0, -28.0), false);
    });

    it('strictly rejects positions that breach the south interior wall (exterior street)', () => {
      // South boundary is maxZ = -13.0
      assert.equal(isInsideInteriorBoundary(interior, -45.0, -12.0), false);
      assert.equal(isInsideInteriorBoundary(interior, -45.0, -9.0), false);
    });
  });

  // =========================================================================
  // Test Group 5: Valid Exit Transition
  // =========================================================================
  describe('5. Valid Exit Transition', () => {
    it('successfully transitions player from inside Wing Spot to exterior street through threshold', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot'; // Inside Wing Spot

      // Player stands near interior entrance threshold (-45.0, -13.5)
      const res = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -45.0, z: -13.5 },
      });

      assert.equal(res.success, true);
      assert.equal(res.code, 'success');
      assert.equal(res.previousLocationId, 'restaurant:wing-spot');
      assert.equal(res.newLocationId, 'street:blvd-gomez-morin');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
    });

    it('successfully exits when player is at containing building without explicit coordinates', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';

      const res = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
      });

      assert.equal(res.success, true);
      assert.equal(res.code, 'success');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
    });
  });

  // =========================================================================
  // Test Group 6: Invalid Exit Rejection (Wall Egress Rejection)
  // =========================================================================
  describe('6. Invalid Exit Rejection & Wall Egress Enforcement', () => {
    it('rejects exit through back north wall when player is far from entrance threshold', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';
      const stateBefore = JSON.stringify(state);

      // Player stands at back/north wall (-45.0, -22.0) -> distance to threshold is 8.5m > 3.5m
      const res = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -45.0, z: -22.0 },
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'invalid-exit-position');
      assert.match(res.message, /Cannot exit through wall/);
      assert.equal(player.locationId, 'restaurant:wing-spot');
      assert.equal(JSON.stringify(state), stateBefore, 'Zero mutation on wall exit rejection');
    });

    it('rejects exit when player is not inside the interior', () => {
      const { state } = setupWorld(openTime);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'street:blvd-gomez-morin'; // Still outdoors
      const stateBefore = JSON.stringify(state);

      const res = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'not-inside-interior');
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
      assert.equal(JSON.stringify(state), stateBefore);
    });
  });

  // =========================================================================
  // Test Group 7: Bidirectional Contextual Action Resolution
  // =========================================================================
  describe('7. Bidirectional Contextual Entrance Action Resolution', () => {
    it('resolves [Enter Wing Spot] when player is outside on the street', () => {
      const { state } = setupWorld(openTime);
      const entrance = findEntranceById(topology, 'entrance:wing-spot-main')!;
      const action = resolveContextualEntranceAction(
        entrance,
        state,
        'street:blvd-gomez-morin'
      );

      assert.equal(action.actionLabel, 'Enter Wing Spot');
      assert.equal(action.commandName, 'enterRestaurant');
      assert.equal(action.targetLocationId, 'restaurant:wing-spot');
      assert.equal(action.isAvailable, true);
    });

    it('resolves [Exit Wing Spot] when player is inside Wing Spot interior', () => {
      const { state } = setupWorld(openTime);
      const entrance = findEntranceById(topology, 'entrance:wing-spot-main')!;
      const action = resolveContextualEntranceAction(
        entrance,
        state,
        'restaurant:wing-spot'
      );

      assert.equal(action.actionLabel, 'Exit Wing Spot');
      assert.equal(action.commandName, 'exitRestaurant');
      assert.equal(action.targetLocationId, 'street:blvd-gomez-morin');
      assert.equal(action.isAvailable, true);
    });

    it('preserves Pastelerías La Tía Lupe resolution as independent and never Wing Spot', () => {
      const { state } = setupWorld(openTime);
      const tiaLupeEntrance = findEntranceById(topology, 'entrance:tia-lupe-main')!;
      const action = resolveContextualEntranceAction(
        tiaLupeEntrance,
        state,
        'street:blvd-gomez-morin'
      );

      assert.equal(action.actionLabel, 'Enter Pastelerías La Tía Lupe');
      assert.equal(action.targetLocationId, 'restaurant:pasteleria-tia-lupe');
      assert.notEqual(action.targetLocationId, 'restaurant:wing-spot');
    });
  });

  // =========================================================================
  // Test Group 8: Elena Commute Invariants & Interior Arrival
  // =========================================================================
  describe('8. Elena Commute Invariants & Interior Arrival', () => {
    it('preserves in-flight location invariant during transit and commits to Wing Spot upon arrival', () => {
      const { state, clock } = setupWorld(openTime);
      const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      elena.locationId = 'building:del-porvenir-residence';

      // 1. Generate commute route from residence stoop to Wing Spot entrance
      const route = findPedestrianRoute(
        topology.navGraph,
        'node:nav:entrance:del-porvenir-residence',
        'node:nav:entrance:wing-spot'
      );
      assert.ok(route);
      assert.ok(route.length >= 4);

      // 2. Traversal in-flight invariant: locationId remains untouched
      assert.equal(elena.locationId, 'building:del-porvenir-residence');

      // 3. M69 validateArrivalAndCommit at Wing Spot threshold
      const req = createNavigationRequest(
        state,
        elena.id,
        'restaurant:wing-spot',
        clock.getTime()
      );
      assert.equal(req.success, true);

      const navResult = {
        requestId: req.request!.requestId,
        agentId: elena.id,
        destinationPlaceId: 'restaurant:wing-spot',
        status: 'arrived' as const,
        completedAt: clock.getTime(),
        totalDistance: 78.5,
      };

      const commitRes = validateArrivalAndCommit(state, req.request!, navResult);
      assert.equal(commitRes.success, true);
      assert.equal(commitRes.previousLocationId, 'building:del-porvenir-residence');
      assert.equal(commitRes.currentLocationId, 'restaurant:wing-spot');
      assert.equal(elena.locationId, 'restaurant:wing-spot');

      // 4. Verify Elena is now associated with Wing Spot interior
      const interior = findInteriorSpaceByPlace(topology, elena.locationId);
      assert.ok(interior);
      assert.equal(interior.interiorId, 'interior:wing-spot');
    });
  });
});
