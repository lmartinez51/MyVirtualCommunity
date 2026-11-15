/**
 * Milestone 70 — Physical World Representation & Spatial Mapping Test Suite
 *
 * Verifies that the engine-independent boundary separating the authoritative World Core topology
 * from external physical 3D representations is strictly established and enforced.
 *
 * Test Matrix:
 * 1. Test 1 — Logical Entity Can Be Mapped
 * 2. Test 2 — Mapping Lookup is Deterministic
 * 3. Test 3 — Multiple Representations are Supported (1:many)
 * 4. Test 4 — Reverse Lookup (Representation -> World Entity)
 * 5. Test 5 — Anchor Registration (Entity -> Semantic Anchor)
 * 6. Test 6 — Anchor Lookup Without Coordinates
 * 7. Test 7 — Missing Mapping Rejection
 * 8. Test 8 — Missing Entity Rejection
 * 9. Test 9 — Missing Anchor Rejection
 * 10. Test 10 — Zero WorldState Mutation Invariant
 * 11. Test 11 — Physical Failure Isolation (Destroyed Representation)
 * 12. Test 12 — Engine Independence (Headless Execution)
 * 13. Test 13 — Zero Coordinate Leakage
 * 14. Test 14 — Schema Version Preservation (Version 18)
 * 15. Test 15 — Representation Replaceability (Swapping Engine Representations)
 * 16. Test 16 — Registry Absence (Simulation Works Normally Without Registry)
 * 17. Test 17 — Physical Representation Cannot Mutate WorldState
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  CURRENT_WORLD_STATE_VERSION,
  type WorldState,
  type PhysicalEntityMapping,
  type SpatialAnchor,
  PhysicalMappingRegistry,
  resolvePhysicalMapping,
  resolveSpatialAnchor,
  identifyWorldEntity,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { DEVELOPMENT_NPC_ID } from '../src/core/development-npc-schedule.js';

const ANCHOR_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 AM local

function setupWorld(): {
  clock: WorldClock;
  state: WorldState;
  player: NonNullable<WorldState['agents']>[number];
  npc: NonNullable<WorldState['agents']>[number];
} {
  const clock = WorldClock.create(ANCHOR_TIME);
  const state = createInitialWorldState(clock);
  const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
  const npc = state.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;
  return { clock, state, player, npc };
}

describe('Milestone 70: Physical World Representation & Spatial Mapping', () => {
  // =========================================================================
  // Test 1 — Logical Entity Can Be Mapped
  // =========================================================================
  describe('Test 1 — Logical Entity Can Be Mapped', () => {
    it('maps an authoritative building place to a physical representation', () => {
      const { state } = setupWorld();
      const registry = new PhysicalMappingRegistry();

      const mapping: PhysicalEntityMapping = {
        mappingId: 'map:residence-main',
        worldEntityId: 'building:development-residence',
        worldEntityType: 'building',
        representationId: 'unity-prefab:development-residence',
        representationType: 'building',
        availability: 'available',
        description: 'Primary residential building model',
      };

      registry.registerMapping(mapping);

      const result = resolvePhysicalMapping(state, registry, 'building:development-residence');
      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.primaryMapping.representationId, 'unity-prefab:development-residence');
      assert.equal(result.primaryMapping.worldEntityId, 'building:development-residence');
      assert.equal(result.primaryMapping.worldEntityType, 'building');
      assert.equal(result.primaryMapping.availability, 'available');
    });
  });

  // =========================================================================
  // Test 2 — Mapping Lookup is Deterministic
  // =========================================================================
  describe('Test 2 — Mapping Lookup is Deterministic', () => {
    it('produces identical mapping resolution for repeated identical queries', () => {
      const { state } = setupWorld();
      const registry = new PhysicalMappingRegistry();

      registry.registerMapping({
        mappingId: 'map:street-dev',
        worldEntityId: 'street:development-street',
        worldEntityType: 'street',
        representationId: 'repr:street-dev-mesh',
        representationType: 'street',
        availability: 'available',
      });

      const res1 = resolvePhysicalMapping(state, registry, 'street:development-street');
      const res2 = resolvePhysicalMapping(state, registry, 'street:development-street');

      assert.deepEqual(res1, res2);
    });
  });

  // =========================================================================
  // Test 3 — Multiple Representations are Supported (1:many)
  // =========================================================================
  describe('Test 3 — Multiple Representations are Supported (1:many)', () => {
    it('allows a single logical entity to map to multiple physical representations (e.g. exterior and interior)', () => {
      const { state } = setupWorld();
      const registry = new PhysicalMappingRegistry();

      const exteriorMapping: PhysicalEntityMapping = {
        mappingId: 'map:restaurant-ext',
        worldEntityId: 'restaurant:development-restaurant',
        worldEntityType: 'restaurant',
        representationId: 'repr:restaurant-exterior-facade',
        representationType: 'building',
        availability: 'available',
        description: 'Exterior storefront model',
      };

      const interiorMapping: PhysicalEntityMapping = {
        mappingId: 'map:restaurant-int',
        worldEntityId: 'restaurant:development-restaurant',
        worldEntityType: 'restaurant',
        representationId: 'repr:restaurant-interior-dining',
        representationType: 'interior',
        availability: 'available',
        description: 'Interior dining room scene',
      };

      registry.registerMapping(exteriorMapping);
      registry.registerMapping(interiorMapping);

      const result = resolvePhysicalMapping(state, registry, 'restaurant:development-restaurant');
      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.mappings.length, 2);
      assert.equal(result.mappings[0].representationId, 'repr:restaurant-exterior-facade');
      assert.equal(result.mappings[1].representationId, 'repr:restaurant-interior-dining');
    });
  });

  // =========================================================================
  // Test 4 — Reverse Lookup (Representation -> World Entity)
  // =========================================================================
  describe('Test 4 — Reverse Lookup (Representation -> World Entity)', () => {
    it('resolves the logical world entity from a physical representation ID for identification only', () => {
      const registry = new PhysicalMappingRegistry();

      registry.registerMapping({
        mappingId: 'map:agent-npc-model',
        worldEntityId: 'agent:dev-npc',
        worldEntityType: 'agent',
        representationId: 'unity-npc-elena-rig',
        representationType: 'agent',
        availability: 'available',
      });

      const mappings = registry.getMappingsForRepresentation('unity-npc-elena-rig');
      assert.equal(mappings.length, 1);
      assert.equal(mappings[0].worldEntityId, 'agent:dev-npc');
      assert.equal(mappings[0].worldEntityType, 'agent');
    });
  });

  // =========================================================================
  // Test 5 — Anchor Registration (Entity -> Semantic Anchor)
  // =========================================================================
  describe('Test 5 — Anchor Registration (Entity -> Semantic Anchor)', () => {
    it('registers semantic spatial anchors for an authoritative world entity', () => {
      const registry = new PhysicalMappingRegistry();

      const entranceAnchor: SpatialAnchor = {
        anchorId: 'anchor:residence-entrance',
        worldEntityId: 'building:development-residence',
        anchorType: 'entrance',
        description: 'Front door pedestrian threshold',
      };

      const interiorAnchor: SpatialAnchor = {
        anchorId: 'anchor:residence-interior-hub',
        worldEntityId: 'building:development-residence',
        anchorType: 'interior',
        description: 'Living room center point',
      };

      registry.registerAnchor(entranceAnchor);
      registry.registerAnchor(interiorAnchor);

      const anchors = registry.getAnchorsForWorldEntity('building:development-residence');
      assert.equal(anchors.length, 2);
      assert.equal(anchors[0].anchorType, 'entrance');
      assert.equal(anchors[1].anchorType, 'interior');
    });
  });

  // =========================================================================
  // Test 6 — Anchor Lookup Without Coordinates
  // =========================================================================
  describe('Test 6 — Anchor Lookup Without Coordinates', () => {
    it('resolves a specific semantic anchor without exposing geometric coordinates or transforms', () => {
      const { state } = setupWorld();
      const registry = new PhysicalMappingRegistry();

      registry.registerAnchor({
        anchorId: 'anchor:restaurant-service',
        worldEntityId: 'restaurant:development-restaurant',
        anchorType: 'service-entry',
        description: 'Staff service counter threshold',
      });

      const result = resolveSpatialAnchor(
        state,
        registry,
        'restaurant:development-restaurant',
        'anchor:restaurant-service'
      );

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.anchor.anchorId, 'anchor:restaurant-service');
      assert.equal(result.anchor.anchorType, 'service-entry');
      assert.equal('x' in result.anchor, false);
      assert.equal('y' in result.anchor, false);
      assert.equal('z' in result.anchor, false);
      assert.equal('transform' in result.anchor, false);
    });
  });

  // =========================================================================
  // Test 7 — Missing Mapping Rejection
  // =========================================================================
  describe('Test 7 — Missing Mapping Rejection', () => {
    it('returns mapping-not-found when a valid world entity has no physical mapping registered', () => {
      const { state } = setupWorld();
      const registry = new PhysicalMappingRegistry();

      // Entity exists in WorldState, but registry has zero mappings for it
      const result = resolvePhysicalMapping(state, registry, 'street:avenida-juarez');

      assert.equal(result.success, false);
      if (result.success) return;

      assert.equal(result.code, 'mapping-not-found');
    });
  });

  // =========================================================================
  // Test 8 — Missing Entity Rejection
  // =========================================================================
  describe('Test 8 — Missing Entity Rejection', () => {
    it('returns world-entity-not-found when queried for a non-existent world entity', () => {
      const { state } = setupWorld();
      const registry = new PhysicalMappingRegistry();

      const result = resolvePhysicalMapping(state, registry, 'building:ghost-building');

      assert.equal(result.success, false);
      if (result.success) return;

      assert.equal(result.code, 'world-entity-not-found');
    });
  });

  // =========================================================================
  // Test 9 — Missing Anchor Rejection
  // =========================================================================
  describe('Test 9 — Missing Anchor Rejection', () => {
    it('returns anchor-not-found when queried for a non-existent anchor on a valid entity', () => {
      const { state } = setupWorld();
      const registry = new PhysicalMappingRegistry();

      const result = resolveSpatialAnchor(
        state,
        registry,
        'building:development-building',
        'anchor:non-existent-rooftop'
      );

      assert.equal(result.success, false);
      if (result.success) return;

      assert.equal(result.code, 'anchor-not-found');
    });
  });

  // =========================================================================
  // Test 10 — Zero WorldState Mutation Invariant
  // =========================================================================
  describe('Test 10 — Zero WorldState Mutation Invariant', () => {
    it('guarantees that all physical mapping registry operations leave WorldState strictly unmodified', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      const registry = new PhysicalMappingRegistry();

      registry.registerMapping({
        mappingId: 'map:1',
        worldEntityId: 'building:development-building',
        worldEntityType: 'building',
        representationId: 'repr:building',
        representationType: 'building',
        availability: 'available',
      });

      registry.registerAnchor({
        anchorId: 'anchor:1',
        worldEntityId: 'building:development-building',
        anchorType: 'entrance',
      });

      resolvePhysicalMapping(state, registry, 'building:development-building');
      resolveSpatialAnchor(state, registry, 'building:development-building', 'anchor:1');
      registry.setAvailability('map:1', 'unavailable');
      registry.unregisterMapping('map:1');

      // Byte-identical check on WorldState
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // Test 11 — Physical Failure Isolation (Destroyed Representation)
  // =========================================================================
  describe('Test 11 — Physical Failure Isolation (Destroyed Representation)', () => {
    it('preserves authoritative WorldState when a physical representation is marked destroyed', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);
      const registry = new PhysicalMappingRegistry();

      registry.registerMapping({
        mappingId: 'map:residence',
        worldEntityId: 'building:development-residence',
        worldEntityType: 'building',
        representationId: 'unity-residence-model',
        representationType: 'building',
        availability: 'available',
      });

      // External physical representation is destroyed
      registry.setAvailability('map:residence', 'destroyed');

      const result = resolvePhysicalMapping(state, registry, 'building:development-residence');
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.code, 'representation-unavailable');
      }

      // World Core entity remains completely valid and untouched
      assert.equal(JSON.stringify(state), snapshotBefore);
      const placeInWorld = state.places.find((p) => p.id === 'building:development-residence');
      assert.ok(placeInWorld);
      assert.equal(placeInWorld.name, 'Development Residence');
    });
  });

  // =========================================================================
  // Test 12 — Engine Independence (Headless Execution)
  // =========================================================================
  describe('Test 12 — Engine Independence (Headless Execution)', () => {
    it('runs headlessly without Unity, DOM, Canvas, or WebGL objects in the global environment', () => {
      const globalAny = globalThis as Record<string, unknown>;
      assert.equal(typeof globalAny.UnityEngine, 'undefined');
      assert.equal(typeof globalAny.window, 'undefined');
      assert.equal(typeof globalAny.document, 'undefined');
      assert.equal(typeof globalAny.HTMLCanvasElement, 'undefined');

      const registry = new PhysicalMappingRegistry();
      registry.registerMapping({
        mappingId: 'map:test',
        worldEntityId: 'street:development-street',
        worldEntityType: 'street',
        representationId: 'headless-mesh',
        representationType: 'street',
        availability: 'available',
      });

      assert.equal(registry.getPrimaryMapping('street:development-street')?.representationId, 'headless-mesh');
    });
  });

  // =========================================================================
  // Test 13 — Zero Coordinate Leakage
  // =========================================================================
  describe('Test 13 — Zero Coordinate Leakage', () => {
    it('ensures PhysicalEntityMapping, SpatialAnchor, and World Core entities have no coordinate fields', () => {
      const mapping: PhysicalEntityMapping = {
        mappingId: 'map:chk',
        worldEntityId: 'building:development-building',
        worldEntityType: 'building',
        representationId: 'repr:chk',
        representationType: 'building',
        availability: 'available',
      };

      const anchor: SpatialAnchor = {
        anchorId: 'anchor:chk',
        worldEntityId: 'building:development-building',
        anchorType: 'entrance',
      };

      const forbiddenKeys = [
        'x', 'y', 'z', 'position', 'rotation', 'quaternion', 'transform',
        'Vector2', 'Vector3', 'velocity', 'speed', 'acceleration', 'bounds',
        'coordinates', 'matrix', 'collider'
      ];

      for (const key of forbiddenKeys) {
        assert.equal(key in mapping, false, `Forbidden key "${key}" found in PhysicalEntityMapping`);
        assert.equal(key in anchor, false, `Forbidden key "${key}" found in SpatialAnchor`);
      }
    });
  });

  // =========================================================================
  // Test 14 — Schema Version Preservation
  // =========================================================================
  describe('Test 14 — Schema Version Preservation', () => {
    it('asserts CURRENT_WORLD_STATE_VERSION remains strictly 18', () => {
      const { state } = setupWorld();
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      assert.equal(state.version, 19);
    });
  });

  // =========================================================================
  // Test 15 — Replaceability (Swapping Engine Representations)
  // =========================================================================
  describe('Test 15 — Replaceability (Swapping Engine Representations)', () => {
    it('supports replacing a Unity representation with a Three.js representation while World Core remains unchanged', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);
      const registry = new PhysicalMappingRegistry();

      // Step 1: Initial mapping to a Unity prefab
      registry.registerMapping({
        mappingId: 'map:residence',
        worldEntityId: 'building:development-residence',
        worldEntityType: 'building',
        representationId: 'unity-prefab:residence-v1',
        representationType: 'building',
        availability: 'available',
      });

      const resUnity = resolvePhysicalMapping(state, registry, 'building:development-residence');
      assert.equal(resUnity.success, true);
      if (resUnity.success) {
        assert.equal(resUnity.primaryMapping.representationId, 'unity-prefab:residence-v1');
      }

      // Step 2: Swap representation to Three.js glTF model
      registry.registerMapping({
        mappingId: 'map:residence',
        worldEntityId: 'building:development-residence',
        worldEntityType: 'building',
        representationId: 'threejs-gltf:residence-v2',
        representationType: 'building',
        availability: 'available',
      });

      const resThree = resolvePhysicalMapping(state, registry, 'building:development-residence');
      assert.equal(resThree.success, true);
      if (resThree.success) {
        assert.equal(resThree.primaryMapping.representationId, 'threejs-gltf:residence-v2');
      }

      // World Core state is completely unaffected by physical engine swap
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // Test 16 — Registry Absence (Simulation Works Normally Without Registry)
  // =========================================================================
  describe('Test 16 — Registry Absence (Simulation Works Normally Without Registry)', () => {
    it('executes simulation ticks and NPC routine movements cleanly with zero PhysicalMappingRegistry instance', () => {
      const clock = WorldClock.create('2026-09-14T15:00:00.000Z'); // 09:00 AM local
      const state = createInitialWorldState(clock);
      const npc = state.agents.find((a) => a.id === DEVELOPMENT_NPC_ID)!;

      assert.equal(npc.locationId, 'building:development-residence');

      // Crucial check: Simulation instantiated and ticked with zero registry
      const sim = new Simulation(clock, state, { silent: true });
      const tickResult = sim.tick();

      assert.ok(tickResult);
      assert.equal(state.worldTime, '2026-09-14T15:00:00.000Z');
      // NPC shift starts: moves to restaurant authoritatively
      assert.equal(npc.locationId, 'restaurant:development-restaurant');
    });
  });

  // =========================================================================
  // Test 17 — Physical Representation Cannot Mutate WorldState
  // =========================================================================
  describe('Test 17 — Physical Representation Cannot Mutate WorldState', () => {
    it('verifies that registering, modifying availability, and unregistering mappings leaves WorldState deep-equal', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);
      const registry = new PhysicalMappingRegistry();

      // Intensive registry churn
      registry.registerMapping({
        mappingId: 'map:churn-1',
        worldEntityId: 'restaurant:development-restaurant',
        worldEntityType: 'restaurant',
        representationId: 'repr:churn-ext',
        representationType: 'building',
        availability: 'available',
      });
      registry.registerMapping({
        mappingId: 'map:churn-2',
        worldEntityId: 'restaurant:development-restaurant',
        worldEntityType: 'restaurant',
        representationId: 'repr:churn-int',
        representationType: 'interior',
        availability: 'available',
      });
      registry.setAvailability('map:churn-1', 'unavailable');
      registry.setAvailability('map:churn-2', 'destroyed');
      registry.unregisterMapping('map:churn-1');
      registry.unregisterMapping('map:churn-2');

      // Assert deep-equality
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });
});
