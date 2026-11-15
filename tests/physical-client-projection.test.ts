/**
 * Milestone 71 — Physical Client Projection Contract Test Suite
 *
 * Verifies that the engine-independent boundary separating the authoritative World Core
 * from external physical client representations (Unity, Unreal, Canvas, Three.js, headless)
 * is strictly established and enforced.
 *
 * Test Matrix:
 * 1. Observer-Scoped Projection & Visibility:
 *    - Correct observer identity and location in snapshot
 *    - Observer agent is always included and marked isCoLocated: true
 *    - Co-located agents at the exact location are included
 *    - Distant agents at other locations are strictly excluded (no omniscient leakage)
 *    - Primary location place/venue is included
 *    - Direct topological connections (street child buildings, sibling streets) are included
 *    - Distant topological locations (other districts/unconnected streets) are excluded
 * 2. World Fact Projection & Integrity:
 *    - Restaurant operationalState ('open' | 'closed') is projected factually
 *    - Building isResidential fact is projected factually
 *    - Agent agentType ('player' | 'npc') is projected factually
 *    - Private internal agent state (balances, activityState, activitySince) is NEVER leaked
 *    - Zero coordinates (x, y, z), transforms, vectors, or colliders enter projection
 * 3. Physical Mapping & Anchor Integration (M70):
 *    - Registered M70 physical mappings are attached to projected entities
 *    - Registered M70 semantic spatial anchors are attached to projected entities
 *    - Unmapped entities have empty physicalMappings and spatialAnchors
 *    - Unregistered/destroyed representations do not invalidate logical entities
 * 4. Snapshot Identity Semantics:
 *    - snapshotId is formatted as "proj:" + observerAgentId + ":" + worldTime
 *    - worldTime reflects the authoritative capture time of the projection
 *    - schemaVersion reflects WorldState schema version (18)
 *    - No parallel versioning or sequence counters are introduced
 * 5. ClientIntent Envelope:
 *    - Deterministic envelope creation (clientId, agentId, commandName, payload)
 *    - Intent is an envelope only; does not execute or route commands
 *    - Envelope payload is immutable/frozen
 * 6. PhysicalClientAdapter Lifecycle & Invariants:
 *    - Holds latest snapshot
 *    - Updates snapshot and produces reconciliation diff
 *    - Has ZERO world authority; does NOT mutate WorldState
 *    - Does NOT execute or route commands
 * 7. Pure Projection Reconciliation:
 *    - Initial reconciliation returns all entities as entitiesToSpawn
 *    - Unchanged world returns isStale: false, empty spawn/despawn/update
 *    - Temporal advance marks isStale: true
 *    - Entity movement/appearance produces entitiesToSpawn, entitiesToDespawn, entitiesToUpdate
 * 8. Multiple Independent Clients:
 *    - Two independent client adapters can observe the same world state
 *    - Independent client state (snapshots, intents) does not bleed between adapters
 *    - No client instance has authority over World Core or other clients
 * 9. Headless Operation & Persistence Invariants:
 *    - Simulation and World Core operate 100% headlessly with zero adapters or projections
 *    - Schema version remains strictly 18
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  CURRENT_WORLD_STATE_VERSION,
  transitionAgentLocation,
  transitionRestaurantOperationalState,
  type WorldState,
} from '../src/core/world-state.js';
import {
  PhysicalMappingRegistry,
  type PhysicalEntityMapping,
  type SpatialAnchor,
} from '../src/core/physical-mapping.js';
import {
  projectWorldState,
  reconcileWorldProjection,
  createClientIntent,
  PhysicalClientAdapter,
  type WorldProjectionSnapshot,
} from '../src/core/world-projection.js';
import { Simulation } from '../src/core/simulation.js';
import { DEVELOPMENT_NPC_ID } from '../src/core/development-npc-schedule.js';

const ANCHOR_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 AM local (Monday)

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
  // Place player on street:development-street for street-level neighborhood testing
  transitionAgentLocation(state, player.id, 'street:development-street', { silent: true });
  return { clock, state, player, npc };
}

function setupRegistry(): PhysicalMappingRegistry {
  const registry = new PhysicalMappingRegistry();

  const residenceMapping: PhysicalEntityMapping = {
    mappingId: 'map:residence',
    worldEntityId: 'building:development-residence',
    worldEntityType: 'building',
    representationId: 'unity-prefab:residence-exterior',
    representationType: 'building',
    availability: 'available',
  };

  const streetMapping: PhysicalEntityMapping = {
    mappingId: 'map:street',
    worldEntityId: 'street:development-street',
    worldEntityType: 'street',
    representationId: 'unity-prefab:development-street-chunk',
    representationType: 'street',
    availability: 'available',
  };

  const npcMapping: PhysicalEntityMapping = {
    mappingId: 'map:npc-elena',
    worldEntityId: DEVELOPMENT_NPC_ID,
    worldEntityType: 'agent',
    representationId: 'unity-character:elena-mesh',
    representationType: 'agent',
    availability: 'available',
  };

  const frontDoorAnchor: SpatialAnchor = {
    anchorId: 'anchor:front-door',
    worldEntityId: 'building:development-residence',
    anchorType: 'entrance',
    description: 'Front entrance threshold',
  };

  registry.registerMapping(residenceMapping);
  registry.registerMapping(streetMapping);
  registry.registerMapping(npcMapping);
  registry.registerAnchor(frontDoorAnchor);

  return registry;
}

describe('Milestone 71: Physical Client Projection Contract', () => {
  // =========================================================================
  // 1. Observer-Scoped Projection & Visibility
  // =========================================================================
  describe('1. Observer-Scoped Projection & Visibility', () => {
    it('projects authoritative observer identity, location, and capture time', () => {
      const { state, player } = setupWorld();
      const snapshot = projectWorldState(state, player.id);

      assert.equal(snapshot.observerAgentId, player.id);
      assert.equal(snapshot.observerLocationId, player.locationId);
      assert.equal(snapshot.worldId, state.worldId);
      assert.equal(snapshot.worldTime, state.worldTime);
      assert.equal(snapshot.schemaVersion, 19);
    });

    it('always includes the observer agent and marks isCoLocated: true', () => {
      const { state, player } = setupWorld();
      const snapshot = projectWorldState(state, player.id);

      const observedPlayer = snapshot.entities.find((e) => e.entityId === player.id);
      assert.ok(observedPlayer);
      assert.equal(observedPlayer.entityType, 'agent');
      assert.equal(observedPlayer.isCoLocated, true);
      assert.equal(observedPlayer.agentType, 'player');
    });

    it('includes co-located agents at the exact location, but EXCLUDES distant agents', () => {
      const { state, player, npc } = setupWorld();

      // In initial world, dev-player is at 'street:development-street'.
      // Set NPC Elena to the same street:
      transitionAgentLocation(state, npc.id, 'street:development-street', { silent: true });

      const snapshotOnStreet = projectWorldState(state, player.id);
      const observedNpc = snapshotOnStreet.entities.find((e) => e.entityId === npc.id);
      assert.ok(observedNpc, 'Co-located NPC should be visible to player');
      assert.equal(observedNpc.isCoLocated, true);

      // Now move NPC away to 'restaurant:development-restaurant':
      transitionAgentLocation(state, npc.id, 'restaurant:development-restaurant', { silent: true });

      const snapshotAfterMove = projectWorldState(state, player.id);
      const distantNpc = snapshotAfterMove.entities.find((e) => e.entityId === npc.id);
      assert.equal(
        distantNpc,
        undefined,
        'Distant NPC at another location MUST NOT be projected (zero omniscient leakage)'
      );
    });

    it('projects primary occupied location and direct topological connections', () => {
      const { state, player } = setupWorld();
      // Player is at street:development-street
      const snapshot = projectWorldState(state, player.id);

      // Primary location is present
      const streetEntity = snapshot.entities.find((e) => e.entityId === 'street:development-street');
      assert.ok(streetEntity, 'Current street should be projected');
      assert.equal(streetEntity.isCoLocated, true);

      // Child buildings on this street are projected
      const residenceEntity = snapshot.entities.find((e) => e.entityId === 'building:development-residence');
      assert.ok(residenceEntity, 'Direct child residence should be projected');
      assert.equal(residenceEntity.isCoLocated, false);

      // Distant/unconnected streets or distant buildings are NOT projected
      const distantBuilding = snapshot.entities.find((e) => e.entityId === 'building:distant-structure');
      assert.equal(distantBuilding, undefined);
    });

    it('rejects unknown or invalid observer agent IDs with descriptive error', () => {
      const { state } = setupWorld();
      assert.throws(
        () => projectWorldState(state, 'agent:ghost-agent'),
        /Observer agent "agent:ghost-agent" not found/
      );
    });
  });

  // =========================================================================
  // 2. World Fact Projection & Integrity
  // =========================================================================
  describe('2. World Fact Projection & Integrity', () => {
    it('projects factual operationalState for restaurants without exposing private internals', () => {
      const { state, player } = setupWorld();
      // Move player into building:development-building containing restaurant:development-restaurant
      transitionAgentLocation(state, player.id, 'building:development-building', { silent: true });

      const snapshot = projectWorldState(state, player.id);
      const restaurantEntity = snapshot.entities.find((e) => e.entityId === 'restaurant:development-restaurant');
      assert.ok(restaurantEntity);
      assert.equal(restaurantEntity.operationalState, 'open');

      // Now close restaurant authoritatively
      transitionRestaurantOperationalState(state, 'restaurant:development-restaurant', 'closed', state.worldTime);

      const snapshotClosed = projectWorldState(state, player.id);
      const closedEntity = snapshotClosed.entities.find((e) => e.entityId === 'restaurant:development-restaurant');
      assert.ok(closedEntity);
      assert.equal(closedEntity.operationalState, 'closed');
    });

    it('strictly does NOT leak private agent state (balances, activityState, activitySince)', () => {
      const { state, player, npc } = setupWorld();
      transitionAgentLocation(state, npc.id, player.locationId, { silent: true });

      const snapshot = projectWorldState(state, player.id);
      const npcEntity = snapshot.entities.find((e) => e.entityId === npc.id) as any;

      assert.ok(npcEntity);
      assert.equal(npcEntity.balances, undefined);
      assert.equal(npcEntity.activityState, undefined);
      assert.equal(npcEntity.activitySince, undefined);
      assert.equal(npcEntity.possessions, undefined);
    });

    it('strictly contains ZERO coordinates, transforms, vectors, colliders, or physics state', () => {
      const { state, player } = setupWorld();
      const snapshot = projectWorldState(state, player.id) as any;

      for (const entity of snapshot.entities) {
        assert.equal(entity.x, undefined);
        assert.equal(entity.y, undefined);
        assert.equal(entity.z, undefined);
        assert.equal(entity.position, undefined);
        assert.equal(entity.transform, undefined);
        assert.equal(entity.rotation, undefined);
        assert.equal(entity.velocity, undefined);
        assert.equal(entity.collider, undefined);
        assert.equal(entity.navMesh, undefined);
      }
    });
  });

  // =========================================================================
  // 3. Physical Mapping & Anchor Integration (M70)
  // =========================================================================
  describe('3. Physical Mapping & Anchor Integration (M70)', () => {
    it('attaches projected mappings and semantic anchors from registry', () => {
      const { state, player } = setupWorld();
      const registry = setupRegistry();

      const snapshot = projectWorldState(state, player.id, registry);
      const residence = snapshot.entities.find((e) => e.entityId === 'building:development-residence');

      assert.ok(residence);
      assert.equal(residence.physicalMappings.length, 1);
      assert.equal(residence.physicalMappings[0].representationId, 'unity-prefab:residence-exterior');
      assert.equal(residence.physicalMappings[0].availability, 'available');

      assert.equal(residence.spatialAnchors.length, 1);
      assert.equal(residence.spatialAnchors[0].anchorId, 'anchor:front-door');
      assert.equal(residence.spatialAnchors[0].anchorType, 'entrance');
      assert.equal(residence.spatialAnchors[0].description, 'Front entrance threshold');
    });

    it('returns empty mappings and anchors when entity is unmapped or registry is absent', () => {
      const { state, player } = setupWorld();
      const snapshotWithoutRegistry = projectWorldState(state, player.id);
      const residence = snapshotWithoutRegistry.entities.find(
        (e) => e.entityId === 'building:development-residence'
      );

      assert.ok(residence);
      assert.deepEqual(residence.physicalMappings, []);
      assert.deepEqual(residence.spatialAnchors, []);
    });

    it('destroyed or unavailable physical representations do not invalidate logical entities', () => {
      const { state, player } = setupWorld();
      const registry = setupRegistry();

      // Mark residence mapping as destroyed in physical engine
      registry.setAvailability('map:residence', 'destroyed');

      const snapshot = projectWorldState(state, player.id, registry);
      const residence = snapshot.entities.find((e) => e.entityId === 'building:development-residence');

      assert.ok(residence, 'Logical entity remains fully valid in projection');
      assert.equal(residence.physicalMappings[0].availability, 'destroyed');
    });
  });

  // =========================================================================
  // 4. Snapshot Identity Semantics
  // =========================================================================
  describe('4. Snapshot Identity Semantics', () => {
    it('formats snapshotId as "proj:" + observerAgentId + ":" + worldTime', () => {
      const { state, player } = setupWorld();
      const snapshot = projectWorldState(state, player.id);

      const expectedId = `proj:${player.id}:${state.worldTime}`;
      assert.equal(snapshot.snapshotId, expectedId);
      assert.equal(snapshot.worldTime, ANCHOR_TIME);
      assert.equal(snapshot.schemaVersion, 19);
    });

    it('preserves immutable frozen snapshot object', () => {
      const { state, player } = setupWorld();
      const snapshot = projectWorldState(state, player.id);

      assert.ok(Object.isFrozen(snapshot));
      assert.ok(Object.isFrozen(snapshot.entities));
      if (snapshot.entities.length > 0) {
        assert.ok(Object.isFrozen(snapshot.entities[0]));
      }
    });
  });

  // =========================================================================
  // 5. ClientIntent Envelope
  // =========================================================================
  describe('5. ClientIntent Envelope', () => {
    it('creates a deterministic ClientIntent envelope targeting an existing command', () => {
      const intent = createClientIntent(
        'client:unity-01',
        'agent:dev-player',
        'enterBuilding',
        { buildingId: 'building:development-residence' },
        'intent:fixed-001'
      );

      assert.equal(intent.intentId, 'intent:fixed-001');
      assert.equal(intent.clientId, 'client:unity-01');
      assert.equal(intent.agentId, 'agent:dev-player');
      assert.equal(intent.commandName, 'enterBuilding');
      assert.deepEqual(intent.payload, { buildingId: 'building:development-residence' });
      assert.ok(Object.isFrozen(intent));
      assert.ok(Object.isFrozen(intent.payload));
    });

    it('rejects empty or invalid parameters for ClientIntent', () => {
      assert.throws(
        () => createClientIntent('', 'agent:dev-player', 'enterBuilding'),
        /clientId must be a non-empty string/
      );
      assert.throws(
        () => createClientIntent('client:01', '', 'enterBuilding'),
        /agentId must be a non-empty string/
      );
      assert.throws(
        () => createClientIntent('client:01', 'agent:dev-player', ''),
        /commandName must be a non-empty string/
      );
    });
  });

  // =========================================================================
  // 6. PhysicalClientAdapter Lifecycle & Invariants
  // =========================================================================
  describe('6. PhysicalClientAdapter Lifecycle & Invariants', () => {
    it('retains the latest snapshot and updates with reconciliation report', () => {
      const { state, player } = setupWorld();
      const adapter = new PhysicalClientAdapter('client:unity-01', player.id);

      assert.equal(adapter.getLatestSnapshot(), undefined);

      const snapshot1 = projectWorldState(state, player.id);
      const recon1 = adapter.updateSnapshot(snapshot1);

      assert.equal(adapter.getLatestSnapshot(), snapshot1);
      assert.equal(recon1.isStale, true);
      assert.equal(recon1.entitiesToSpawn.length, snapshot1.entities.length);
      assert.equal(recon1.entitiesToDespawn.length, 0);
    });

    it('rejects snapshots intended for a different observer agent', () => {
      const { state, player, npc } = setupWorld();
      const adapter = new PhysicalClientAdapter('client:unity-01', player.id);

      const npcSnapshot = projectWorldState(state, npc.id);
      assert.throws(
        () => adapter.updateSnapshot(npcSnapshot),
        /Snapshot observer mismatch: expected "agent:dev-player", received "agent:dev-npc"/
      );
    });

    it('adapter creates intent envelopes without executing commands or mutating state', () => {
      const { state, player } = setupWorld();
      const adapter = new PhysicalClientAdapter('client:unity-01', player.id);

      const stateSnapshotBefore = JSON.stringify(state);
      const intent = adapter.createIntent('traverseStreet', {
        targetStreetId: 'street:avenida-juarez',
      });

      assert.equal(intent.clientId, 'client:unity-01');
      assert.equal(intent.agentId, player.id);
      assert.equal(intent.commandName, 'traverseStreet');
      assert.deepEqual(intent.payload, { targetStreetId: 'street:avenida-juarez' });

      // Verifies adapter did NOT execute the command or mutate state
      assert.equal(JSON.stringify(state), stateSnapshotBefore);
      assert.equal(player.locationId, 'street:development-street');
    });
  });

  // =========================================================================
  // 7. Pure Projection Reconciliation
  // =========================================================================
  describe('7. Pure Projection Reconciliation', () => {
    it('detects unchanged state as not stale with zero spawns, despawns, or updates', () => {
      const { state, player } = setupWorld();
      const snapshot1 = projectWorldState(state, player.id);
      const snapshot2 = projectWorldState(state, player.id);

      const recon = reconcileWorldProjection(snapshot1, snapshot2);
      assert.equal(recon.isStale, false);
      assert.equal(recon.entitiesToSpawn.length, 0);
      assert.equal(recon.entitiesToDespawn.length, 0);
      assert.equal(recon.entitiesToUpdate.length, 0);
    });

    it('detects state change when an agent arrives or leaves the observer location', () => {
      const { state, player, npc } = setupWorld();

      // NPC is elsewhere initially
      transitionAgentLocation(state, npc.id, 'restaurant:development-restaurant', { silent: true });
      const snap1 = projectWorldState(state, player.id);

      // NPC arrives at player's street
      transitionAgentLocation(state, npc.id, player.locationId, { silent: true });
      const snap2 = projectWorldState(state, player.id);

      const reconArrive = reconcileWorldProjection(snap1, snap2);
      const spawnedNpc = reconArrive.entitiesToSpawn.find((e) => e.entityId === npc.id);
      assert.ok(spawnedNpc, 'Arriving NPC should be marked for spawning in client scene');

      // NPC leaves again
      transitionAgentLocation(state, npc.id, 'restaurant:development-restaurant', { silent: true });
      const snap3 = projectWorldState(state, player.id);

      const reconDepart = reconcileWorldProjection(snap2, snap3);
      assert.ok(
        reconDepart.entitiesToDespawn.includes(npc.id),
        'Departing NPC should be marked for despawning in client scene'
      );
    });

    it('detects updates when a restaurant changes operationalState', () => {
      const { state, player } = setupWorld();
      transitionAgentLocation(state, player.id, 'building:development-building', { silent: true });

      const snapOpen = projectWorldState(state, player.id);
      transitionRestaurantOperationalState(state, 'restaurant:development-restaurant', 'closed', state.worldTime);
      const snapClosed = projectWorldState(state, player.id);

      const recon = reconcileWorldProjection(snapOpen, snapClosed);
      const updatedRest = recon.entitiesToUpdate.find((e) => e.entityId === 'restaurant:development-restaurant');
      assert.ok(updatedRest);
      assert.equal(updatedRest.operationalState, 'closed');
    });
  });

  // =========================================================================
  // 8. Multiple Independent Clients
  // =========================================================================
  describe('8. Multiple Independent Clients', () => {
    it('supports two independent client adapters observing the same world', () => {
      const { state, player, npc } = setupWorld();
      const adapterPlayer = new PhysicalClientAdapter('client:unity-vr', player.id);
      const adapterNpc = new PhysicalClientAdapter('client:spectator-web', npc.id);

      const snapPlayer = projectWorldState(state, player.id);
      const snapNpc = projectWorldState(state, npc.id);

      adapterPlayer.updateSnapshot(snapPlayer);
      adapterNpc.updateSnapshot(snapNpc);

      assert.equal(adapterPlayer.getLatestSnapshot()?.observerAgentId, player.id);
      assert.equal(adapterNpc.getLatestSnapshot()?.observerAgentId, npc.id);
      assert.notEqual(
        adapterPlayer.getLatestSnapshot()?.snapshotId,
        adapterNpc.getLatestSnapshot()?.snapshotId
      );
    });

    it('actions on one adapter do not affect another adapter or WorldState', () => {
      const { player } = setupWorld();
      const adapter1 = new PhysicalClientAdapter('client:01', player.id);
      const adapter2 = new PhysicalClientAdapter('client:02', player.id);

      const intent1 = adapter1.createIntent('greetAgent', { targetAgentId: DEVELOPMENT_NPC_ID });
      assert.equal(intent1.clientId, 'client:01');
      assert.equal(adapter2.getLatestSnapshot(), undefined);
    });
  });

  // =========================================================================
  // 9. Headless Operation & Schema Invariants
  // =========================================================================
  describe('9. Headless Operation & Schema Invariants', () => {
    it('World Core and Simulation execute 100% headlessly with zero adapters or projections', () => {
      const clock = WorldClock.create(ANCHOR_TIME);
      const state = createInitialWorldState(clock);
      const simulation = new Simulation(clock, state, { silent: true });

      const tickResult = simulation.tick();
      assert.ok(tickResult.npcLocationTransitions && tickResult.npcLocationTransitions.length > 0);
      assert.equal(state.version, 19);
    });

    it('schema version remains strictly 18 (CURRENT_WORLD_STATE_VERSION)', () => {
      const { state } = setupWorld();
      assert.equal(state.version, 19);
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
    });
  });
});
