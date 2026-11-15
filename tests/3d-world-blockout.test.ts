/**
 * Milestone 79 — 3D World Blockout & Playable Environment Foundation Test Suite
 *
 * Verifies that the 3D client:
 * 1. Assembles a human-scale, recognizable 3D urban neighborhood blockout.
 * 2. Establishes believable human-scale visual proportions across buildings, street, doors, vehicles, and agents.
 * 3. Enforces strict separation between local 3D presentation movement and authoritative Agent.locationId in World Core.
 * 4. Supports proximity detection to semantic entrance anchors.
 * 5. Preserves Elena's M78 autonomous decision, multi-frame physical traversal across the blockout, in-flight isolation, and M69 authoritative commit.
 * 6. Preserves WorldState schema version 18 with zero persistent visual fields and zero 3D in World Core.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  transitionAgentLocation,
  CURRENT_WORLD_STATE_VERSION,
  type WorldState,
} from '../src/core/world-state.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import { deriveAgentContext } from '../src/core/agent-context.js';
import {
  DeterministicAgentDecisionProvider,
  dispatchAgentIntent,
} from '../src/core/agent-intent.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Milestone 79: 3D World Blockout & Playable Environment Foundation', () => {
  const COMMUTE_TIME_UTC = '2026-09-14T14:35:00.000Z'; // 08:35 AM local (commute window)
  const elenaId = 'agent:dev-npc';
  const playerId = 'agent:dev-player';
  const residenceId = 'building:development-residence';
  const streetId = 'street:development-street';
  const restaurantId = 'restaurant:development-restaurant';
  const commercialId = 'building:development-building';

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = new WorldClock(COMMUTE_TIME_UTC);
    const state = createInitialWorldState(clock);
    transitionAgentLocation(state, elenaId, residenceId, { silent: true });
    transitionAgentLocation(state, playerId, streetId, { silent: true });
    return { clock, state };
  }

  // =========================================================================
  // Test Group 1: 3D Urban Blockout Completeness & Neighborhood Density
  // =========================================================================
  describe('1. 3D Urban Blockout Completeness & Neighborhood Density', () => {
    it('assembles a coherent 3D blockout containing all core places, street infrastructure, and neighborhood props', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m79',
        observerAgentId: playerId,
      });

      const scene = client.buildSharedWorldSlice(state);
      assert.ok(scene);

      // Core Topological Places (Preserving all M77 contracts)
      assert.ok(scene.getNodeByEntityId(streetId), 'Street plane must be present');
      assert.ok(scene.getNodeByEntityId(residenceId), 'Residence building must be present');
      assert.ok(scene.getNode('node:anchor:residence-door'), 'Residence door anchor must be present');
      assert.ok(scene.getNodeByEntityId(commercialId), 'Commercial building must be present');
      assert.ok(scene.getNode('node:anchor:commercial-door'), 'Commercial door anchor must be present');
      assert.ok(scene.getNodeByEntityId(restaurantId), 'Restaurant volume must be present');
      assert.ok(scene.getNodeByEntityId(playerId), 'Player node must be present');
      assert.ok(scene.getNodeByEntityId(elenaId), 'Elena node must be present');

      // Street Infrastructure & Markings (M79 Blockout)
      assert.ok(scene.getNode('node:street:sidewalk-north'), 'North sidewalk must be present');
      assert.ok(scene.getNode('node:street:curb-north'), 'North curb must be present');
      assert.ok(scene.getNode('node:street:sidewalk-south'), 'South sidewalk must be present');
      assert.ok(scene.getNode('node:street:curb-south'), 'South curb must be present');
      assert.ok(scene.getNode('node:street:dash-1'), 'Road center dashes must be present');
      assert.ok(scene.getNode('node:street:crosswalk-1'), 'Pedestrian crosswalk must be present');

      // Residence Architectural Details
      assert.ok(scene.getNode('node:residence:roof'), 'Residence roof must be present');
      assert.ok(scene.getNode('node:residence:porch'), 'Residence entrance porch/stoop must be present');
      assert.ok(scene.getNode('node:residence:yard'), 'Residence front yard lawn must be present');
      assert.ok(scene.getNode('node:residence:walkway'), 'Residence walkway path must be present');
      assert.ok(scene.getNode('node:residence:fence-west'), 'Residence boundary fence must be present');
      assert.ok(scene.getNode('node:residence:window-front-1'), 'Residence front window must be present');

      // Commercial Building Architectural Details
      assert.ok(scene.getNode('node:commercial:canopy'), 'Commercial entrance canopy must be present');
      assert.ok(scene.getNode('node:commercial:storefront-windows'), 'Commercial storefront display must be present');
      assert.ok(scene.getNode('node:commercial:upper-windows-1'), 'Commercial upper office windows must be present');
      assert.ok(scene.getNode('node:commercial:parapet'), 'Commercial roof parapet must be present');

      // Restaurant Architectural Details
      assert.ok(scene.getNode('node:restaurant:awning'), 'Restaurant cafe awning must be present');
      assert.ok(scene.getNode('node:restaurant:sign'), 'Restaurant signboard must be present');
      assert.ok(scene.getNode('node:restaurant:patio'), 'Outdoor dining patio must be present');
      assert.ok(scene.getNode('node:restaurant:table-1'), 'Cafe table must be present');
      assert.ok(scene.getNode('node:restaurant:chair-1'), 'Cafe chair must be present');
      assert.ok(scene.getNode('node:restaurant:window'), 'Restaurant dining window must be present');

      // Neighborhood Detail Props
      assert.ok(scene.getNode('node:prop:lamp-1'), 'Street lamp pole must be present');
      assert.ok(scene.getNode('node:prop:lamp-1-light'), 'Street lamp glowing fixture must be present');
      assert.ok(scene.getNode('node:prop:tree-1-trunk'), 'Tree trunk must be present');
      assert.ok(scene.getNode('node:prop:tree-1-foliage'), 'Tree foliage canopy must be present');
      assert.ok(scene.getNode('node:prop:planter-1'), 'Sidewalk planter must be present');
      assert.ok(scene.getNode('node:prop:bench-1-seat'), 'Street bench must be present');
      assert.ok(scene.getNode('node:prop:car-body'), 'Parked vehicle chassis must be present');
      assert.ok(scene.getNode('node:prop:car-cabin'), 'Parked vehicle cabin must be present');
      assert.ok(scene.getNode('node:prop:car-wheel-fl'), 'Parked vehicle wheels must be present');
      assert.ok(scene.getNode('node:prop:utility-pole'), 'Utility pole must be present');
      assert.ok(scene.getNode('node:prop:bin-trash'), 'Trash bin must be present');
      assert.ok(scene.getNode('node:prop:bin-recycle'), 'Recycling bin must be present');
      assert.ok(scene.getNode('node:prop:hydrant'), 'Fire hydrant must be present');

      // Total Node Density
      const allNodes = scene.getAllNodes();
      assert.ok(
        allNodes.length >= 45,
        `Blockout must contain at least 45 nodes for visual density (found: ${allNodes.length})`
      );
    });
  });

  // =========================================================================
  // Test Group 2: Human Scale & Believable Relative Proportions
  // =========================================================================
  describe('2. Human Scale & Believable Relative Proportions', () => {
    it('maintains consistent human-scale proportions between agents, doors, buildings, roadway, and vehicles', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m79',
        observerAgentId: playerId,
      });
      const scene = client.buildSharedWorldSlice(state);

      const player = scene.getNodeByEntityId(playerId)!;
      const resDoor = scene.getNode('node:anchor:residence-door')!;
      const comDoor = scene.getNode('node:anchor:commercial-door')!;
      const residence = scene.getNodeByEntityId(residenceId)!;
      const commercial = scene.getNodeByEntityId(commercialId)!;
      const car = scene.getNode('node:prop:car-body')!;
      const sidewalk = scene.getNode('node:street:sidewalk-north')!;

      // Agent height ~ 2.0 units
      assert.equal(player.dimensions.y, 2.0, 'Agent height should be human scale (2.0 units)');

      // Doors taller than person (~3.0 - 3.5 units)
      assert.ok(resDoor.dimensions.y > player.dimensions.y, 'Residence door must be taller than agent');
      assert.ok(comDoor.dimensions.y > player.dimensions.y, 'Commercial door must be taller than agent');

      // Buildings have believable multi-story scale
      assert.ok(residence.dimensions.y >= 8.0, 'Residence should be at least 2 residential stories (8+ units)');
      assert.ok(commercial.dimensions.y >= 12.0, 'Commercial building should be at least 3 stories (12+ units)');
      assert.ok(commercial.dimensions.y > residence.dimensions.y, 'Commercial building must be taller than residence');

      // Sidewalk width ~ 3.2 units (pedestrian scale)
      assert.ok(sidewalk.dimensions.z >= 3.0, 'Sidewalk width must be comfortable pedestrian scale');

      // Vehicle proportions (length ~ 4.4 units, width ~ 1.9 units)
      assert.ok(car.dimensions.x > car.dimensions.z, 'Vehicle length must be greater than width');
      assert.ok(car.dimensions.x >= 4.0 && car.dimensions.x <= 5.0, 'Vehicle length must be believable sedan scale');
    });
  });

  // =========================================================================
  // Test Group 3: Player 3D Movement vs. World Core Location Isolation
  // =========================================================================
  describe('3. Player 3D Movement vs. World Core Location Isolation', () => {
    it('allows player to walk freely in 3D presentation space without mutating Agent.locationId', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m79',
        observerAgentId: playerId,
      });
      client.buildSharedWorldSlice(state);

      const playerAgent = state.agents.find((a) => a.id === playerId)!;
      assert.equal(playerAgent.locationId, streetId, 'Player initially on street');

      // Initial 3D position
      const initialPos = client.getPlayerVisualPosition()!;
      assert.equal(initialPos.x, 0.0);
      assert.equal(initialPos.y, 1.0);
      assert.equal(initialPos.z, 0.0);

      // Walk player Eastward toward residence
      client.movePlayerVisual({ x: 9.6, y: 0.0, z: -2.5 });
      const newPos = client.getPlayerVisualPosition()!;
      assert.equal(newPos.x, 9.6);
      assert.equal(newPos.z, -2.5);

      // CRITICAL INVARIANT: Player.locationId in WorldState MUST REMAIN street:development-street!
      assert.equal(
        playerAgent.locationId,
        streetId,
        'Player locationId MUST remain unchanged in World Core despite 3D movement!'
      );

      // Walk player Westward toward commercial building and restaurant
      client.movePlayerVisual({ x: -18.0, y: 0.0, z: 2.5 });
      const westPos = client.getPlayerVisualPosition()!;
      assert.equal(westPos.x, 9.6 - 18.0);
      assert.equal(playerAgent.locationId, streetId, 'Player locationId remains unchanged');
    });
  });

  // =========================================================================
  // Test Group 4: Proximity Detection to Semantic Entrance Anchors
  // =========================================================================
  describe('4. Proximity Detection to Semantic Entrance Anchors', () => {
    it('detects proximity to residence door, commercial door, and restaurant based on player 3D position', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m79',
        observerAgentId: playerId,
      });
      client.buildSharedWorldSlice(state);

      // At origin (0, 0, 0), player is in middle of street, not near residence or commercial door
      assert.equal(client.isPlayerNearPlace(residenceId, 3.5), false);
      assert.equal(client.isPlayerNearPlace(commercialId, 3.5), false);
      assert.equal(client.isPlayerNearPlace(restaurantId, 4.0), false);

      // Move player close to Residence Door (10, 1.5, 0)
      client.movePlayerVisual({ x: 9.8, y: 0.0, z: 0.2 });
      assert.equal(client.isPlayerNearPlace(residenceId, 3.5), true);
      assert.equal(client.isPlayerNearPlace(commercialId, 3.5), false);

      // Move player close to Commercial Door (-8, 1.75, 0)
      client.movePlayerVisual({ x: -17.5, y: 0.0, z: -0.2 }); // new pos: (9.8 - 17.5) = -7.7, z: 0
      assert.equal(client.isPlayerNearPlace(residenceId, 3.5), false);
      assert.equal(client.isPlayerNearPlace(commercialId, 3.5), true);

      // Move player close to Restaurant (-16, 2.5, 0)
      client.movePlayerVisual({ x: -8.0, y: 0.0, z: 0.0 }); // new pos: -15.7
      assert.equal(client.isPlayerNearPlace(restaurantId, 4.0), true);
    });
  });

  // =========================================================================
  // Test Group 5: Elena Autonomous Commute & In-Flight Isolation (M78 Integration)
  // =========================================================================
  describe('5. Elena Autonomous Commute & In-Flight Isolation', () => {
    it('Elena autonomously derives commute intent, physically traverses the blockout, and commits via M69', async () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:test-m79',
        observerAgentId: playerId,
      });
      client.buildSharedWorldSlice(state);

      const coordinator = new RuntimeTraversalCoordinator();
      const runtime = new PhysicalTraversalRuntime({
        client,
        speed: 8.0, // 8 units / sec
      });

      // 1. Elena derives context and emits MoveToPlaceIntent
      const context = deriveAgentContext(state, elenaId);
      assert.equal(context.scheduledObjective.type, 'commute-to-work');
      assert.equal(context.scheduledObjective.targetPlaceId, restaurantId);

      const intent = new DeterministicAgentDecisionProvider().decideIntent(context);
      assert.ok(intent);
      assert.equal(intent.intentType, 'move-to-place');

      // 2. Dispatch intent through coordinator
      const dispatchResult = dispatchAgentIntent(state, intent, { coordinator });
      assert.equal(dispatchResult.success, true);
      assert.ok(dispatchResult.request);

      // 3. Initiate physical traversal in runtime
      const traversalPromise = runtime.requestTraversal(dispatchResult.request);
      assert.equal(runtime.hasActiveTraversal(elenaId), true);

      const elenaAgent = state.agents.find((a) => a.id === elenaId)!;

      // 4. Physical stepping across the blockout environment
      runtime.step(500);
      const pos1 = client.getAgentVisualPosition(elenaId)!;
      assert.ok(pos1.x < 10.0, 'Elena must advance Westward past the residence');
      // In-flight isolation: locationId unchanged!
      assert.equal(elenaAgent.locationId, residenceId, 'Elena locationId MUST remain residence in Frame 1');

      runtime.step(1000);
      const pos2 = client.getAgentVisualPosition(elenaId)!;
      assert.ok(pos2.x < pos1.x, 'Elena continues Westward past the player along the street');
      assert.equal(elenaAgent.locationId, residenceId, 'Elena locationId MUST remain residence in Frame 2');

      // 5. Reach destination
      runtime.step(5000);
      const navResult = await traversalPromise;
      assert.equal(navResult.status, 'arrived');
      assert.equal(navResult.destinationPlaceId, restaurantId);

      // Pre-commit check: locationId is STILL at residence even after arrival detection
      assert.equal(elenaAgent.locationId, residenceId, 'LocationId must remain origin until M69 commit');

      // 6. Commit arrival authoritatively via M69
      const commitResult = coordinator.completeTraversal(state, navResult);
      assert.equal(commitResult.success, true);
      assert.equal(commitResult.code, 'success');
      assert.equal(commitResult.changed, true);
      assert.equal(commitResult.previousLocationId, residenceId);
      assert.equal(commitResult.currentLocationId, restaurantId);

      // Final authoritative state updated in World Core
      assert.equal(elenaAgent.locationId, restaurantId, 'LocationId is now restaurant:development-restaurant');
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);
    });
  });

  // =========================================================================
  // Test Group 6: Schema 18 Preservation & Zero 3D in Core
  // =========================================================================
  describe('6. Schema 18 Preservation & Zero 3D in Core', () => {
    it('preserves WorldState schema version 18 with zero persistent visual fields', () => {
      const { state } = setupWorld();
      assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
      assert.equal(state.version, 19);

      const serialized = JSON.stringify(state);
      const parsed = JSON.parse(serialized);

      assert.equal(parsed.version, 19);
      assert.equal(parsed.nodes, undefined);
      assert.equal(parsed.meshes, undefined);
      assert.equal(parsed.transforms, undefined);
      assert.equal(parsed.positions, undefined);
    });

    it('confirms src/core/ contains zero 3D runtime or client imports', () => {
      const coreFiles = ['src/core/simulation.ts', 'src/core/world-state.ts', 'src/core/agent-intent.ts'];
      for (const relPath of coreFiles) {
        const fullPath = resolve(process.cwd(), relPath);
        const code = readFileSync(fullPath, 'utf-8');
        assert.doesNotMatch(
          code,
          /from\s+['"][^'"]*clients\//,
          `File "${relPath}" must not import from clients/`
        );
        assert.doesNotMatch(
          code,
          /from\s+['"][^'"]*minimal-3d/,
          `File "${relPath}" must not import from minimal-3d`
        );
      }
    });
  });
});
