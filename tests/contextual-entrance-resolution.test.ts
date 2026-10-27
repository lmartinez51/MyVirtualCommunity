/**
 * Milestone 81 — Server Consolidation & Contextual Entrance Resolution Test Suite
 *
 * Verifies:
 * 1. Proximity to Pastelerías La Tía Lupe entrance resolves to Pastelerías La Tía Lupe, not Wing Spot.
 * 2. Proximity to Wing Spot entrance resolves to Wing Spot.
 * 3. Proximity to Del Porvenir residential entrance resolves to the residence.
 * 4. Distant positions resolve to no entrance action (undefined).
 * 5. Interaction prompt labels match the resolved entrance.
 * 6. Elena's commute to Wing Spot continues to arrive and commit correctly via M69.
 * 7. Uncommitted traversal leaves Agent.locationId unchanged.
 * 8. Consolidated server startup and absence of obsolete milestone server wrappers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorldClock } from '../src/core/clock.js';
import {
  CURRENT_WORLD_STATE_VERSION,
  createGomezMorinWorldState,
  transitionAgentLocation,
  type WorldState,
} from '../src/core/world-state.js';
import {
  createGomezMorinSpatialTopology,
  findEntranceById,
  findEntranceByBuilding,
  findEntranceByNavNode,
  resolveContextualEntranceAction,
  findPedestrianRoute,
} from '../src/core/real-world-street-topology.js';
import {
  Minimal3DClient,
  getGomezMorinNavCoordinates,
} from '../clients/minimal-3d/minimal-3d-client.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { validateArrivalAndCommit } from '../src/core/navigation-contract.js';

describe('Milestone 81: Server Consolidation & Contextual Entrance Resolution', () => {
  const topology = createGomezMorinSpatialTopology();
  const initialTime = '2026-09-14T16:00:00.000Z'; // 10:00 AM local

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = new WorldClock(initialTime);
    const state = createGomezMorinWorldState(clock);
    return { clock, state };
  }

  // =========================================================================
  // Test Group 1: Authoritative Topology Entrance Definitions
  // =========================================================================
  describe('1. Topology Entrance Definitions & Lookups', () => {
    it('defines distinct BuildingEntrances for Tía Lupe and Wing Spot', () => {
      const tiaLupeEntrance = findEntranceById(topology, 'entrance:tia-lupe-main');
      const wingSpotEntrance = findEntranceById(topology, 'entrance:wing-spot-main');

      assert.ok(tiaLupeEntrance, 'Tía Lupe entrance must exist');
      assert.ok(wingSpotEntrance, 'Wing Spot entrance must exist');
      assert.notEqual(
        tiaLupeEntrance.entranceId,
        wingSpotEntrance.entranceId,
        'Entrances must have distinct IDs'
      );
      assert.equal(tiaLupeEntrance.buildingId, 'building:tia-lupe-building');
      assert.equal(wingSpotEntrance.buildingId, 'building:wing-spot-building');
      assert.equal(tiaLupeEntrance.facingStreetPlaceId, 'street:blvd-gomez-morin');
      assert.equal(wingSpotEntrance.facingStreetPlaceId, 'street:blvd-gomez-morin');
    });

    it('looks up entrances by nav node and building ID', () => {
      const byNavNode = findEntranceByNavNode(topology, 'node:nav:entrance:tia-lupe');
      assert.ok(byNavNode);
      assert.equal(byNavNode.entranceId, 'entrance:tia-lupe-main');

      const byBuilding = findEntranceByBuilding(topology, 'building:wing-spot-building');
      assert.ok(byBuilding);
      assert.equal(byBuilding.entranceId, 'entrance:wing-spot-main');

      const residenceEntrance = findEntranceByBuilding(topology, 'building:del-porvenir-residence');
      assert.ok(residenceEntrance);
      assert.equal(residenceEntrance.entranceId, 'entrance:del-porvenir-residence-main');
    });
  });

  // =========================================================================
  // Test Group 2: Contextual Entrance Action Resolution
  // =========================================================================
  describe('2. Contextual Entrance Action Resolution Domain Logic', () => {
    it('resolves Pastelerías La Tía Lupe entrance to Tía Lupe and NEVER Wing Spot', () => {
      const { state } = setupWorld();
      const tiaLupeEntrance = findEntranceById(topology, 'entrance:tia-lupe-main')!;
      const action = resolveContextualEntranceAction(tiaLupeEntrance, state);

      assert.equal(action.entranceId, 'entrance:tia-lupe-main');
      assert.equal(action.buildingId, 'building:tia-lupe-building');
      assert.equal(action.targetLocationId, 'restaurant:pasteleria-tia-lupe');
      assert.ok(
        action.actionLabel.includes('Pastelerías La Tía Lupe'),
        `Label "${action.actionLabel}" must mention Pastelerías La Tía Lupe`
      );
      assert.ok(
        !action.actionLabel.toLowerCase().includes('wing spot'),
        'Tía Lupe label must NEVER mention Wing Spot'
      );
      assert.notEqual(
        action.targetLocationId,
        'restaurant:wing-spot',
        'Tía Lupe action must NOT target Wing Spot'
      );
      assert.equal(action.isAvailable, true);
    });

    it('resolves Wing Spot entrance to Wing Spot', () => {
      const { state } = setupWorld();
      const wingSpotEntrance = findEntranceById(topology, 'entrance:wing-spot-main')!;
      const action = resolveContextualEntranceAction(wingSpotEntrance, state);

      assert.equal(action.entranceId, 'entrance:wing-spot-main');
      assert.equal(action.buildingId, 'building:wing-spot-building');
      assert.equal(action.targetLocationId, 'restaurant:wing-spot');
      assert.ok(
        action.actionLabel.includes('Wing Spot'),
        `Label "${action.actionLabel}" must mention Wing Spot`
      );
      assert.equal(action.isAvailable, true);
    });

    it('resolves Residencia Del Porvenir entrance to the residence', () => {
      const { state } = setupWorld();
      const residenceEntrance = findEntranceById(topology, 'entrance:del-porvenir-residence-main')!;
      const action = resolveContextualEntranceAction(residenceEntrance, state);

      assert.equal(action.entranceId, 'entrance:del-porvenir-residence-main');
      assert.equal(action.buildingId, 'building:del-porvenir-residence');
      assert.equal(action.targetLocationId, 'building:del-porvenir-residence');
      assert.equal(action.commandName, 'interactAtResidence');
      assert.ok(action.actionLabel.includes('Residencia Del Porvenir'));
    });
  });

  // =========================================================================
  // Test Group 3: Spatial Proximity & Minimal3DClient Entrance Resolution
  // =========================================================================
  describe('3. Minimal3DClient Spatial Proximity & Entrance Resolution', () => {
    it('1. Proximity to Pastelerías La Tía Lupe resolves to Tía Lupe, NOT Wing Spot', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m81',
        observerAgentId: 'agent:gomez-morin-player',
      });
      client.buildGomezMorinWorldSlice(state);

      // Player stands directly at Tía Lupe entrance: x: -30.0, z: -12.4
      const resolution = client.resolveNearbyEntrance({ x: -30.0, y: 1.0, z: -12.4 }, 3.5, state);

      assert.ok(resolution, 'Must resolve nearby entrance at Tía Lupe threshold');
      assert.equal(resolution.entrance.entranceId, 'entrance:tia-lupe-main');
      assert.equal(resolution.entrance.buildingId, 'building:tia-lupe-building');
      assert.equal(resolution.targetLocationId, 'restaurant:pasteleria-tia-lupe');
      assert.equal(resolution.actionLabel, 'Enter Pastelerías La Tía Lupe');
      assert.notEqual(
        resolution.targetLocationId,
        'restaurant:wing-spot',
        'Must NOT misroute to Wing Spot'
      );
      assert.ok(resolution.distance < 0.1, 'Distance to Tía Lupe entrance must be near zero');

      // Proximity helper check
      client.setPlayerVisualPosition({ x: -30.0, y: 1.0, z: -12.4 });
      assert.equal(client.isPlayerNearPlace('building:tia-lupe-building', 3.5), true);
      assert.equal(client.isPlayerNearPlace('restaurant:pasteleria-tia-lupe', 3.5), true);
      assert.equal(client.isPlayerNearPlace('restaurant:wing-spot', 3.5), false);
      assert.equal(client.isPlayerNearPlace('building:wing-spot-building', 3.5), false);
    });

    it('2. Proximity to Wing Spot entrance resolves to Wing Spot', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m81',
        observerAgentId: 'agent:gomez-morin-player',
      });
      client.buildGomezMorinWorldSlice(state);

      // Player stands directly at Wing Spot entrance: x: -45.0, z: -12.4
      const resolution = client.resolveNearbyEntrance({ x: -45.0, y: 1.0, z: -12.4 }, 3.5, state);

      assert.ok(resolution, 'Must resolve nearby entrance at Wing Spot threshold');
      assert.equal(resolution.entrance.entranceId, 'entrance:wing-spot-main');
      assert.equal(resolution.entrance.buildingId, 'building:wing-spot-building');
      assert.equal(resolution.targetLocationId, 'restaurant:wing-spot');
      assert.equal(resolution.actionLabel, 'Enter Wing Spot');
      assert.ok(resolution.distance < 0.1, 'Distance to Wing Spot entrance must be near zero');

      // Proximity helper check
      client.setPlayerVisualPosition({ x: -45.0, y: 1.0, z: -12.4 });
      assert.equal(client.isPlayerNearPlace('restaurant:wing-spot', 3.5), true);
      assert.equal(client.isPlayerNearPlace('building:wing-spot-building', 3.5), true);
      assert.equal(client.isPlayerNearPlace('building:tia-lupe-building', 3.5), false);
      assert.equal(client.isPlayerNearPlace('restaurant:pasteleria-tia-lupe', 3.5), false);
    });

    it('3. Proximity to Del Porvenir residential entrance resolves to the residence', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m81',
        observerAgentId: 'agent:gomez-morin-player',
      });
      client.buildGomezMorinWorldSlice(state);

      // Player stands at residence porch stoop: x: -26.5, z: -36.0
      const resolution = client.resolveNearbyEntrance({ x: -26.5, y: 1.0, z: -36.0 }, 3.5, state);

      assert.ok(resolution, 'Must resolve residence entrance');
      assert.equal(resolution.entrance.entranceId, 'entrance:del-porvenir-residence-main');
      assert.equal(resolution.targetLocationId, 'building:del-porvenir-residence');
      assert.equal(resolution.actionLabel, 'Enter Residencia Del Porvenir');

      // Proximity helper check
      client.setPlayerVisualPosition({ x: -26.5, y: 1.0, z: -36.0 });
      assert.equal(client.isPlayerNearPlace('building:del-porvenir-residence', 3.5), true);
      assert.equal(client.isPlayerNearPlace('restaurant:wing-spot', 3.5), false);
    });

    it('4. Distant positions resolve to no entrance action (undefined)', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m81',
        observerAgentId: 'agent:gomez-morin-player',
      });
      client.buildGomezMorinWorldSlice(state);

      // Center of Gómez Morín roadway (0, 0, 0)
      assert.equal(client.resolveNearbyEntrance({ x: 0, y: 0, z: 0 }, 3.5, state), undefined);

      // Sidewalk midway between Porvenir and Tía Lupe: x: -20, z: -11
      assert.equal(client.resolveNearbyEntrance({ x: -20, y: 1, z: -11 }, 3.5, state), undefined);

      // South sidewalk of Gómez Morín: x: -30, z: 11
      assert.equal(client.resolveNearbyEntrance({ x: -30, y: 1, z: 11 }, 3.5, state), undefined);
    });

    it('5. Interaction prompt labels match the resolved entrance', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m81',
        observerAgentId: 'agent:gomez-morin-player',
      });
      client.buildGomezMorinWorldSlice(state);

      const tiaLupeRes = client.resolveNearbyEntrance({ x: -30.0, y: 1.0, z: -12.4 }, 3.5, state);
      assert.equal(tiaLupeRes?.actionLabel, 'Enter Pastelerías La Tía Lupe');

      const wingSpotRes = client.resolveNearbyEntrance({ x: -45.0, y: 1.0, z: -12.4 }, 3.5, state);
      assert.equal(wingSpotRes?.actionLabel, 'Enter Wing Spot');

      const residenceRes = client.resolveNearbyEntrance({ x: -26.5, y: 1.0, z: -36.0 }, 3.5, state);
      assert.equal(residenceRes?.actionLabel, 'Enter Residencia Del Porvenir');

      const dollarRes = client.resolveNearbyEntrance({ x: -2.0, y: 1.0, z: -14.3 }, 3.5, state);
      assert.equal(dollarRes?.actionLabel, 'Enter Dollar 2 Go');
    });
  });

  // =========================================================================
  // Test Group 4: Commute & In-Flight Authority Invariants
  // =========================================================================
  describe('4. Commute & In-Flight Invariants (Milestone 69 & 80)', () => {
    it('6 & 7. Elena commute preserves in-flight isolation and commits only at destination threshold', async () => {
      const { state } = setupWorld();
      const elenaId = 'agent:elena-npc';
      const residenceId = 'building:del-porvenir-residence';
      const wingSpotId = 'restaurant:wing-spot';

      // Verify Elena starts at Residence
      assert.equal(state.agents.find((a) => a.id === elenaId)?.locationId, residenceId);

      const navCoords = getGomezMorinNavCoordinates();
      const coordinator = new RuntimeTraversalCoordinator();

      const runtime = new PhysicalTraversalRuntime({
        speed: 10.0,
        destinationResolver: (dest) => {
          if (dest === 'restaurant:wing-spot' || dest === 'building:wing-spot-building') {
            return navCoords.get('node:nav:entrance:wing-spot');
          }
          return undefined;
        },
        routeResolver: () => {
          const routeNodes = findPedestrianRoute(
            topology.navGraph,
            'node:nav:entrance:del-porvenir-residence',
            'node:nav:entrance:wing-spot'
          );
          return routeNodes?.map((n) => navCoords.get(n)!).filter(Boolean);
        },
      });

      runtime.registerAnchorCoordinate(
        residenceId,
        navCoords.get('node:nav:entrance:del-porvenir-residence')!
      );
      runtime.registerAnchorCoordinate(
        wingSpotId,
        navCoords.get('node:nav:entrance:wing-spot')!
      );

      const startRes = coordinator.startTraversal(
        state,
        elenaId,
        wingSpotId,
        initialTime
      );
      assert.equal(startRes.success, true);

      const traversalPromise = runtime.requestTraversal((startRes as any).request);

      // INVARIANT 7: Elena is in-flight; locationId must remain unchanged!
      runtime.step(500);
      assert.equal(
        state.agents.find((a) => a.id === elenaId)?.locationId,
        residenceId,
        'Elena authoritative locationId must remain Residence during in-flight transit'
      );

      runtime.step(1000);
      assert.equal(
        state.agents.find((a) => a.id === elenaId)?.locationId,
        residenceId,
        'Elena authoritative locationId must remain Residence at step 2'
      );

      // Step runtime to completion
      let results = runtime.step(10000);
      while (results.length === 0) {
        results = runtime.step(1000);
      }

      const navResult = await traversalPromise;
      assert.equal(navResult.status, 'arrived');

      // Before M69 commit, locationId MUST still be at origin!
      assert.equal(
        state.agents.find((a) => a.id === elenaId)?.locationId,
        residenceId,
        'Elena authoritative locationId must NOT be mutated before M69 commit'
      );

      // INVARIANT 6: Elena arrival committed via M69 at destination threshold
      const arrivalResult = validateArrivalAndCommit(
        state,
        (startRes as any).request,
        navResult
      );
      assert.equal(arrivalResult.success, true);
      assert.equal(arrivalResult.agentId, elenaId);
      assert.equal(arrivalResult.currentLocationId, wingSpotId);
      assert.equal(
        state.agents.find((a) => a.id === elenaId)?.locationId,
        wingSpotId,
        'Elena must be committed to Wing Spot'
      );
    });
  });

  // =========================================================================
  // Test Group 5: Server Consolidation Cleanliness
  // =========================================================================
  describe('5. Server Consolidation & Legacy Wrappers Deletion', () => {
    it('confirms all 5 obsolete run-mXX-server.ts scripts are permanently deleted', () => {
      const rootDir = resolve(process.cwd());
      const obsoleteFiles = [
        resolve(rootDir, 'scripts', 'run-m43-server.ts'),
        resolve(rootDir, 'scripts', 'run-m44-server.ts'),
        resolve(rootDir, 'scripts', 'run-m45-server.ts'),
        resolve(rootDir, 'scripts', 'run-m46-server.ts'),
        resolve(rootDir, 'scripts', 'run-m52-server.ts'),
      ];

      for (const filePath of obsoleteFiles) {
        assert.equal(
          existsSync(filePath),
          false,
          `Obsolete file must be deleted: ${filePath}`
        );
      }
    });

    it('confirms canonical server and verification harnesses remain intact', () => {
      const rootDir = resolve(process.cwd());
      assert.equal(existsSync(resolve(rootDir, 'src', 'index.ts')), true);
      assert.equal(existsSync(resolve(rootDir, 'src', 'server', 'http-server.ts')), true);
      assert.equal(existsSync(resolve(rootDir, 'scripts', 'start-browser-server.ts')), true);
      assert.equal(existsSync(resolve(rootDir, 'clients', 'minimal-3d', 'index.html')), true);
    });
  });
});
