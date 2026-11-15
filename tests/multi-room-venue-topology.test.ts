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
  getCoLocatedAgents,
} from '../src/core/world-state.js';
import { Agent } from '../src/core/entities/agent.js';
import { Place } from '../src/core/entities/geography.js';
import { Restaurant } from '../src/core/restaurant.js';
import { createGomezMorinSeedWorld } from '../src/core/seed.js';
import {
  GomezMorinSpatialTopology,
  InteriorSpace,
  InternalConnection,
  BuildingEntrance,
  createGomezMorinSpatialTopology,
  validateInteriorTopology,
  validateAgentSpatialInvariants,
  validateWorldSpatialTopology,
  findInternalConnectionById,
  findOutgoingInternalConnections,
  traverseInternalConnection,
} from '../src/core/real-world-street-topology.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 86: Multi-Room Venue Topology Foundation', () => {
  const BASE_TIME = '2026-10-05T08:00:00.000Z';

  /**
   * Helper constructing a dedicated synthetic multi-room test fixture.
   *
   * Topology layout:
   * Building: building:m86-test-building
   * Venue: restaurant:m86-test-venue
   *
   * Rooms:
   * - interior:m86-test-room-a (Dining Area / Entrance)
   * - interior:m86-test-room-b (Main Hall)
   * - interior:m86-test-room-staff (Kitchen / Staff Room)
   *
   * Connections:
   * - conn:m86-a-to-b (unrestricted, paired with conn:m86-b-to-a)
   * - conn:m86-b-to-a (unrestricted, paired with conn:m86-a-to-b)
   * - conn:m86-b-to-staff (staff-only, paired with conn:m86-staff-to-b)
   * - conn:m86-staff-to-b (unrestricted exit from kitchen, paired with conn:m86-b-to-staff)
   */
  function createM86TestFixture(): {
    topology: GomezMorinSpatialTopology;
    state: WorldState;
  } {
    const roomA: InteriorSpace = {
      interiorId: 'interior:m86-test-room-a',
      buildingId: 'building:m86-test-building',
      associatedPlaceId: 'restaurant:m86-test-venue',
      name: 'M86 Test Venue — Comedor',
      entranceIds: ['entrance:m86-test-main'],
      boundary: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      description: 'Public reception and dining area with exterior entrance threshold.',
    };

    const roomB: InteriorSpace = {
      interiorId: 'interior:m86-test-room-b',
      buildingId: 'building:m86-test-building',
      associatedPlaceId: 'restaurant:m86-test-venue',
      name: 'M86 Test Venue — Salon Principal',
      entranceIds: [],
      boundary: { minX: 10, maxX: 20, minZ: 0, maxZ: 10 },
      description: 'Interior hall connected to dining and staff areas without exterior entrance.',
    };

    const roomStaff: InteriorSpace = {
      interiorId: 'interior:m86-test-room-staff',
      buildingId: 'building:m86-test-building',
      associatedPlaceId: 'restaurant:m86-test-venue',
      name: 'M86 Test Venue — Cocina y Personal',
      entranceIds: [],
      boundary: { minX: 10, maxX: 20, minZ: 10, maxZ: 20 },
      description: 'Back-of-house staff kitchen and prep area.',
    };

    const entranceMain: BuildingEntrance = {
      entranceId: 'entrance:m86-test-main',
      buildingId: 'building:m86-test-building',
      name: 'M86 Test Venue — Entrada Principal',
      facingStreetPlaceId: 'street:blvd-gomez-morin',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:entrance:wing-spot',
      interiorSpaceId: 'interior:m86-test-room-a',
      thresholdPosition: { x: 5.0, z: -1.0 },
      interiorThresholdPosition: { x: 5.0, z: 1.0 },
      description: 'Front customer entrance into Room A.',
    };

    const connAToB: InternalConnection = {
      connectionId: 'conn:m86-a-to-b',
      name: 'Puerta Comedor a Salon Principal',
      buildingId: 'building:m86-test-building',
      sourceInteriorId: 'interior:m86-test-room-a',
      targetInteriorId: 'interior:m86-test-room-b',
      passageType: 'standard-door',
      accessPolicy: 'unrestricted',
      pairedConnectionId: 'conn:m86-b-to-a',
      sourceThreshold: { x: 9.5, z: 5.0 },
      targetThreshold: { x: 10.5, z: 5.0 },
      interactionRadius: 2.0,
      description: 'Passage between Room A and Room B.',
    };

    const connBToA: InternalConnection = {
      connectionId: 'conn:m86-b-to-a',
      name: 'Puerta Salon Principal a Comedor',
      buildingId: 'building:m86-test-building',
      sourceInteriorId: 'interior:m86-test-room-b',
      targetInteriorId: 'interior:m86-test-room-a',
      passageType: 'standard-door',
      accessPolicy: 'unrestricted',
      pairedConnectionId: 'conn:m86-a-to-b',
      sourceThreshold: { x: 10.5, z: 5.0 },
      targetThreshold: { x: 9.5, z: 5.0 },
      interactionRadius: 2.0,
      description: 'Return passage from Room B to Room A.',
    };

    const connBToStaff: InternalConnection = {
      connectionId: 'conn:m86-b-to-staff',
      name: 'Puerta de Servicio a Cocina',
      buildingId: 'building:m86-test-building',
      sourceInteriorId: 'interior:m86-test-room-b',
      targetInteriorId: 'interior:m86-test-room-staff',
      passageType: 'service-door',
      accessPolicy: 'staff-only',
      pairedConnectionId: 'conn:m86-staff-to-b',
      sourceThreshold: { x: 15.0, z: 9.5 },
      targetThreshold: { x: 15.0, z: 10.5 },
      interactionRadius: 2.0,
      description: 'Staff-only service door into kitchen.',
    };

    const connStaffToB: InternalConnection = {
      connectionId: 'conn:m86-staff-to-b',
      name: 'Salida de Cocina a Salon Principal',
      buildingId: 'building:m86-test-building',
      sourceInteriorId: 'interior:m86-test-room-staff',
      targetInteriorId: 'interior:m86-test-room-b',
      passageType: 'service-door',
      accessPolicy: 'unrestricted',
      pairedConnectionId: 'conn:m86-b-to-staff',
      sourceThreshold: { x: 15.0, z: 10.5 },
      targetThreshold: { x: 15.0, z: 9.5 },
      interactionRadius: 2.0,
      description: 'Exit from kitchen into main hall.',
    };

    const canonical = createGomezMorinSpatialTopology();
    const topology: GomezMorinSpatialTopology = {
      ...canonical,
      entrances: [entranceMain],
      interiors: [roomA, roomB, roomStaff],
      internalConnections: [connAToB, connBToA, connBToStaff, connStaffToB],
    };

    const seed = createGomezMorinSeedWorld(BASE_TIME);

    const buildingPlace: Place = {
      id: 'building:m86-test-building',
      type: 'building',
      name: 'M86 Test Building',
      parentId: 'street:blvd-gomez-morin',
    };

    const restaurantVenue: Restaurant = {
      id: 'restaurant:m86-test-venue',
      type: 'restaurant',
      name: 'M86 Test Restaurant',
      buildingId: 'building:m86-test-building',
      operationalState: 'open',
      operationalSince: BASE_TIME,
      balanceMinor: 0,
      currency: 'USD',
    };

    const playerAgent: Agent = {
      id: 'agent:m86-player',
      type: 'agent',
      name: 'M86 Player',
      agentType: 'player',
      activityState: 'active',
      activitySince: BASE_TIME,
      locationId: 'restaurant:m86-test-venue',
      interiorSpaceId: 'interior:m86-test-room-a',
      balanceMinor: 5000,
      currency: 'USD',
    };

    const staffNpcAgent: Agent = {
      id: 'agent:m86-staff-npc',
      type: 'agent',
      name: 'M86 Staff Chef',
      agentType: 'npc',
      activityState: 'active',
      activitySince: BASE_TIME,
      locationId: 'restaurant:m86-test-venue',
      interiorSpaceId: 'interior:m86-test-room-a',
      balanceMinor: 2000,
      currency: 'USD',
    };

    const state: WorldState = {
      worldId: 'juarez-el-paso',
      version: 19,
      worldTime: BASE_TIME,
      places: [...seed.places, buildingPlace],
      restaurants: [...seed.restaurants, restaurantVenue],
      agents: [...seed.agents, playerAgent, staffNpcAgent],
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
      knowledge: [],
      orders: [],
      properties: seed.properties,
      siteAgentAssociations: [
        ...seed.siteAgentAssociations,
        {
          id: 'assoc:m86-staff',
          agentId: 'agent:m86-staff-npc',
          placeId: 'restaurant:m86-test-venue',
          role: 'attendant',
          assignedAt: BASE_TIME,
        },
      ],
    };

    return { topology, state };
  }

  // =========================================================================
  // 1. Topology Validation & Invariant Enforcement
  // =========================================================================
  describe('1. Topology Validation & Graph Invariants', () => {
    it('validates a correct multi-room topology with zero errors', () => {
      const { topology } = createM86TestFixture();
      const result = validateInteriorTopology(topology);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('findInternalConnectionById resolves connections correctly', () => {
      const { topology } = createM86TestFixture();
      const conn = findInternalConnectionById(topology, 'conn:m86-a-to-b');
      assert.ok(conn);
      assert.equal(conn.sourceInteriorId, 'interior:m86-test-room-a');
      assert.equal(conn.targetInteriorId, 'interior:m86-test-room-b');

      const nonExistent = findInternalConnectionById(topology, 'conn:does-not-exist');
      assert.equal(nonExistent, undefined);
    });

    it('findOutgoingInternalConnections returns all edges originating from a room', () => {
      const { topology } = createM86TestFixture();
      const outgoingA = findOutgoingInternalConnections(topology, 'interior:m86-test-room-a');
      assert.equal(outgoingA.length, 1);
      assert.equal(outgoingA[0].connectionId, 'conn:m86-a-to-b');

      const outgoingB = findOutgoingInternalConnections(topology, 'interior:m86-test-room-b');
      assert.equal(outgoingB.length, 2);
      assert.ok(outgoingB.some((c) => c.connectionId === 'conn:m86-b-to-a'));
      assert.ok(outgoingB.some((c) => c.connectionId === 'conn:m86-b-to-staff'));
    });

    it('rejects connection with non-existent sourceInteriorId', () => {
      const { topology } = createM86TestFixture();
      const brokenTopology: GomezMorinSpatialTopology = {
        ...topology,
        internalConnections: [
          ...(topology.internalConnections ?? []),
          {
            connectionId: 'conn:broken-source',
            name: 'Broken Source',
            buildingId: 'building:m86-test-building',
            sourceInteriorId: 'interior:nonexistent-room',
            targetInteriorId: 'interior:m86-test-room-b',
            passageType: 'standard-door',
            accessPolicy: 'unrestricted',
          },
        ],
      };
      const result = validateInteriorTopology(brokenTopology);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('non-existent sourceInteriorId')));
    });

    it('rejects connection with non-existent targetInteriorId', () => {
      const { topology } = createM86TestFixture();
      const brokenTopology: GomezMorinSpatialTopology = {
        ...topology,
        internalConnections: [
          ...(topology.internalConnections ?? []),
          {
            connectionId: 'conn:broken-target',
            name: 'Broken Target',
            buildingId: 'building:m86-test-building',
            sourceInteriorId: 'interior:m86-test-room-a',
            targetInteriorId: 'interior:nonexistent-room',
            passageType: 'standard-door',
            accessPolicy: 'unrestricted',
          },
        ],
      };
      const result = validateInteriorTopology(brokenTopology);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('non-existent targetInteriorId')));
    });

    it('rejects connection self-loop (source === target)', () => {
      const { topology } = createM86TestFixture();
      const brokenTopology: GomezMorinSpatialTopology = {
        ...topology,
        internalConnections: [
          ...(topology.internalConnections ?? []),
          {
            connectionId: 'conn:self-loop',
            name: 'Self Loop',
            buildingId: 'building:m86-test-building',
            sourceInteriorId: 'interior:m86-test-room-a',
            targetInteriorId: 'interior:m86-test-room-a',
            passageType: 'standard-door',
            accessPolicy: 'unrestricted',
          },
        ],
      };
      const result = validateInteriorTopology(brokenTopology);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('identical source and target')));
    });

    it('rejects cross-building connection (Invariant H violation)', () => {
      const { topology } = createM86TestFixture();
      const foreignRoom: InteriorSpace = {
        interiorId: 'interior:foreign-room',
        buildingId: 'building:other-building',
        associatedPlaceId: 'restaurant:m86-test-venue',
        name: 'Foreign Building Room',
        entranceIds: [],
        boundary: { minX: 30, maxX: 40, minZ: 0, maxZ: 10 },
      };
      const brokenTopology: GomezMorinSpatialTopology = {
        ...topology,
        interiors: [...topology.interiors, foreignRoom],
        internalConnections: [
          ...(topology.internalConnections ?? []),
          {
            connectionId: 'conn:cross-building',
            name: 'Cross Building Connection',
            buildingId: 'building:m86-test-building',
            sourceInteriorId: 'interior:m86-test-room-a',
            targetInteriorId: 'interior:foreign-room',
            passageType: 'standard-door',
            accessPolicy: 'unrestricted',
          },
        ],
      };
      const result = validateInteriorTopology(brokenTopology);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('across different buildings')));
    });

    it('rejects cross-venue connection (Invariant G violation)', () => {
      const { topology } = createM86TestFixture();
      const otherVenueRoom: InteriorSpace = {
        interiorId: 'interior:other-venue-room',
        buildingId: 'building:m86-test-building',
        associatedPlaceId: 'restaurant:other-venue',
        name: 'Other Venue Room',
        entranceIds: [],
        boundary: { minX: 30, maxX: 40, minZ: 0, maxZ: 10 },
      };
      const brokenTopology: GomezMorinSpatialTopology = {
        ...topology,
        interiors: [...topology.interiors, otherVenueRoom],
        internalConnections: [
          ...(topology.internalConnections ?? []),
          {
            connectionId: 'conn:cross-venue',
            name: 'Cross Venue Connection',
            buildingId: 'building:m86-test-building',
            sourceInteriorId: 'interior:m86-test-room-a',
            targetInteriorId: 'interior:other-venue-room',
            passageType: 'standard-door',
            accessPolicy: 'unrestricted',
          },
        ],
      };
      const result = validateInteriorTopology(brokenTopology);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('across different places')));
    });

    it('rejects invalid or non-reciprocal pairedConnectionId', () => {
      const { topology } = createM86TestFixture();
      const brokenTopology: GomezMorinSpatialTopology = {
        ...topology,
        internalConnections: [
          ...(topology.internalConnections ?? []),
          {
            connectionId: 'conn:orphan-pair',
            name: 'Orphan Pair',
            buildingId: 'building:m86-test-building',
            sourceInteriorId: 'interior:m86-test-room-a',
            targetInteriorId: 'interior:m86-test-room-b',
            passageType: 'standard-door',
            accessPolicy: 'unrestricted',
            pairedConnectionId: 'conn:nonexistent-paired',
          },
        ],
      };
      const result = validateInteriorTopology(brokenTopology);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('non-existent pairedConnectionId')));
    });
  });

  // =========================================================================
  // 2. Successful Room-to-Room Traversal & Invariant Verification
  // =========================================================================
  describe('2. Authoritative Internal Traversal Transitions', () => {
    it('atomically transitions interiorSpaceId while strictly preserving locationId', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;

      assert.equal(player.locationId, 'restaurant:m86-test-venue');
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-a');

      // Traversal: Room A -> Room B
      const result = traverseInternalConnection(
        state,
        {
          agentId: player.id,
          connectionId: 'conn:m86-a-to-b',
        },
        topology
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.previousInteriorSpaceId, 'interior:m86-test-room-a');
      assert.equal(result.newInteriorSpaceId, 'interior:m86-test-room-b');

      // CRITICAL M86 INVARIANTS:
      // 1. interiorSpaceId updated to target room
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-b');
      // 2. locationId remains untouched
      assert.equal(player.locationId, 'restaurant:m86-test-venue');

      // Validate spatial invariants for the updated agent
      const invResult = validateAgentSpatialInvariants(player, topology);
      assert.equal(invResult.valid, true);
    });

    it('supports round-trip traversal between connected rooms', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;

      // Room A -> Room B
      const r1 = traverseInternalConnection(
        state,
        { agentId: player.id, connectionId: 'conn:m86-a-to-b' },
        topology
      );
      assert.equal(r1.success, true);
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-b');

      // Room B -> Room A (via reciprocal paired connection)
      const r2 = traverseInternalConnection(
        state,
        { agentId: player.id, connectionId: 'conn:m86-b-to-a' },
        topology
      );
      assert.equal(r2.success, true);
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-a');
      assert.equal(player.locationId, 'restaurant:m86-test-venue');
    });
  });

  // =========================================================================
  // 3. Deterministic Precondition & Failure Semantics
  // =========================================================================
  describe('3. Deterministic Preconditions & Zero-Mutation Failure', () => {
    it('fails with "wrong-source-interior" when agent is not in connection source room', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;
      // Player is in Room A, but tries to use conn:m86-b-to-a (which starts in Room B)
      const snapshotBefore = JSON.stringify(player);

      const result = traverseInternalConnection(
        state,
        { agentId: player.id, connectionId: 'conn:m86-b-to-a' },
        topology
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'wrong-source-interior');
      assert.equal(JSON.stringify(player), snapshotBefore);
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-a');
    });

    it('fails with "agent-not-indoor" when agent is outdoors (interiorSpaceId is null)', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;
      player.interiorSpaceId = null; // Outdoors on street
      player.locationId = 'street:m86-test-street';
      const snapshotBefore = JSON.stringify(player);

      const result = traverseInternalConnection(
        state,
        { agentId: player.id, connectionId: 'conn:m86-a-to-b' },
        topology
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-indoor');
      assert.equal(JSON.stringify(player), snapshotBefore);
      assert.equal(player.interiorSpaceId, null);
    });

    it('fails with "connection-not-found" when connectionId does not exist', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;
      const snapshotBefore = JSON.stringify(player);

      const result = traverseInternalConnection(
        state,
        { agentId: player.id, connectionId: 'conn:ghost-door' },
        topology
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'connection-not-found');
      assert.equal(JSON.stringify(player), snapshotBefore);
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-a');
    });

    it('fails with "agent-not-found" when agentId does not exist', () => {
      const { topology, state } = createM86TestFixture();
      const result = traverseInternalConnection(
        state,
        { agentId: 'agent:ghost-agent', connectionId: 'conn:m86-a-to-b' },
        topology
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-found');
    });
  });

  // =========================================================================
  // 4. Authorization & Access Control (Staff-Only vs Customer)
  // =========================================================================
  describe('4. Traversal Authorization (Physical Topology != Domain Permission)', () => {
    it('rejects unauthorized customer from entering staff-only room with zero mutation', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;

      // Move player into Room B (main hall)
      player.interiorSpaceId = 'interior:m86-test-room-b';
      const snapshotBefore = JSON.stringify(player);

      // Customer attempts to enter staff room
      const result = traverseInternalConnection(
        state,
        { agentId: player.id, connectionId: 'conn:m86-b-to-staff' },
        topology
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'unauthorized-traversal');
      assert.match(result.message, /not authorized for staff-only connection/);
      assert.equal(JSON.stringify(player), snapshotBefore);
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-b');
    });

    it('allows authorized staff NPC to enter staff-only room', () => {
      const { topology, state } = createM86TestFixture();
      const staffNpc = state.agents.find((a) => a.id === 'agent:m86-staff-npc')!;

      // Staff NPC moves Room A -> Room B
      const r1 = traverseInternalConnection(
        state,
        { agentId: staffNpc.id, connectionId: 'conn:m86-a-to-b' },
        topology
      );
      assert.equal(r1.success, true);
      assert.equal(staffNpc.interiorSpaceId, 'interior:m86-test-room-b');

      // Staff NPC traverses Room B -> Staff Room
      const r2 = traverseInternalConnection(
        state,
        { agentId: staffNpc.id, connectionId: 'conn:m86-b-to-staff' },
        topology
      );
      assert.equal(r2.success, true);
      assert.equal(r2.code, 'success');
      assert.equal(staffNpc.interiorSpaceId, 'interior:m86-test-room-staff');
      assert.equal(staffNpc.locationId, 'restaurant:m86-test-venue');
    });

    it('allows anyone inside the staff room to exit back into the main hall', () => {
      const { topology, state } = createM86TestFixture();
      const staffNpc = state.agents.find((a) => a.id === 'agent:m86-staff-npc')!;
      staffNpc.interiorSpaceId = 'interior:m86-test-room-staff';

      // Exit from kitchen to main hall is unrestricted
      const result = traverseInternalConnection(
        state,
        { agentId: staffNpc.id, connectionId: 'conn:m86-staff-to-b' },
        topology
      );
      assert.equal(result.success, true);
      assert.equal(staffNpc.interiorSpaceId, 'interior:m86-test-room-b');
    });
  });

  // =========================================================================
  // 5. Spatial Threshold Proximity Validation
  // =========================================================================
  describe('5. Spatial Threshold Proximity & Distance Verification', () => {
    it('succeeds when agent position is within connection source threshold radius', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;
      // conn:m86-a-to-b sourceThreshold is (9.5, 5.0) with interactionRadius 2.0
      const validPosition = { x: 9.0, z: 5.2 }; // ~0.54m away

      const result = traverseInternalConnection(
        state,
        {
          agentId: player.id,
          connectionId: 'conn:m86-a-to-b',
          spatialPosition: validPosition,
        },
        topology
      );

      assert.equal(result.success, true);
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-b');
    });

    it('rejects traversal with "invalid-spatial-position" when agent is too far from doorway', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;
      // conn:m86-a-to-b sourceThreshold is (9.5, 5.0) with interactionRadius 2.0
      // Agent is standing at (1.0, 1.0), roughly 9.4m away
      const farPosition = { x: 1.0, z: 1.0 };
      const snapshotBefore = JSON.stringify(player);

      const result = traverseInternalConnection(
        state,
        {
          agentId: player.id,
          connectionId: 'conn:m86-a-to-b',
          spatialPosition: farPosition,
        },
        topology
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-spatial-position');
      assert.match(result.message, /Cannot traverse through wall/);
      assert.equal(JSON.stringify(player), snapshotBefore);
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-a');
    });

    it('succeeds in headless mode when spatialPosition is omitted', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;

      // Headless / Simulation call (no coordinates provided)
      const result = traverseInternalConnection(
        state,
        {
          agentId: player.id,
          connectionId: 'conn:m86-a-to-b',
        },
        topology
      );

      assert.equal(result.success, true);
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-b');
    });
  });

  // =========================================================================
  // 6. Co-Presence Matrix Across Interior Partitions
  // =========================================================================
  describe('6. Co-Presence Authority (areAgentsCoLocated)', () => {
    it('proves room isolation and reunion across multi-room venue', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:m86-staff-npc')!;

      // 1. Both initially in Room A -> CO-LOCATED
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-a');
      assert.equal(npc.interiorSpaceId, 'interior:m86-test-room-a');
      assert.equal(areAgentsCoLocated(state, player.id, npc.id), true);

      // getCoLocatedAgents includes NPC
      const visibleFromA = getCoLocatedAgents(state, player.id);
      assert.ok(visibleFromA.some((a) => a.id === npc.id));

      // 2. Player traverses to Room B; NPC remains in Room A -> NOT CO-LOCATED
      const r1 = traverseInternalConnection(
        state,
        { agentId: player.id, connectionId: 'conn:m86-a-to-b' },
        topology
      );
      assert.equal(r1.success, true);
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-b');
      assert.equal(npc.interiorSpaceId, 'interior:m86-test-room-a');

      // CRITICAL: Despite sharing the exact same logical locationId ('restaurant:m86-test-venue'),
      // physical partition isolation ensures they are NOT co-located
      assert.equal(player.locationId, npc.locationId);
      assert.equal(areAgentsCoLocated(state, player.id, npc.id), false);

      const visibleFromB = getCoLocatedAgents(state, player.id);
      assert.equal(visibleFromB.some((a) => a.id === npc.id), false);

      // 3. NPC traverses to Room B -> REUNITED (CO-LOCATED AGAIN)
      const r2 = traverseInternalConnection(
        state,
        { agentId: npc.id, connectionId: 'conn:m86-a-to-b' },
        topology
      );
      assert.equal(r2.success, true);
      assert.equal(npc.interiorSpaceId, 'interior:m86-test-room-b');
      assert.equal(areAgentsCoLocated(state, player.id, npc.id), true);

      // 4. Outdoor agent comparison: outdoor agent at same venue has interiorSpaceId = null
      const outdoorAgent: Agent = {
        id: 'agent:m86-outdoor',
        type: 'agent',
        name: 'Outdoor Curbside Customer',
        agentType: 'player',
        activityState: 'active',
        activitySince: BASE_TIME,
        locationId: 'restaurant:m86-test-venue',
        interiorSpaceId: null,
        balanceMinor: 1000,
        currency: 'USD',
      };
      state.agents.push(outdoorAgent);

      assert.equal(areAgentsCoLocated(state, player.id, outdoorAgent.id), false);
    });
  });

  // =========================================================================
  // 7. Persistence Roundtrip & Schema 19 Integrity
  // =========================================================================
  describe('7. Persistence Roundtrip (Schema 19 Preserved)', () => {
    it('persists and restores multi-room interior presence cleanly with Schema 19', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;

      // Traverse player to Room B
      traverseInternalConnection(
        state,
        { agentId: player.id, connectionId: 'conn:m86-a-to-b' },
        topology
      );
      assert.equal(player.interiorSpaceId, 'interior:m86-test-room-b');

      const testFile = join(tmpdir(), `test-m86-multiroom-persistence-${Date.now()}.json`);
      try {
        // Save world state
        const persistence = new LocalFilePersistence(testFile, topology);
        persistence.save(state);

        // Load world state
        const loadedState = persistence.load()!;

        // Assert schema remains 19
        assert.equal(loadedState.version, 19);

        const loadedPlayer = loadedState.agents.find((a) => a.id === player.id)!;
        assert.ok(loadedPlayer);
        assert.equal(loadedPlayer.locationId, 'restaurant:m86-test-venue');
        assert.equal(loadedPlayer.interiorSpaceId, 'interior:m86-test-room-b');

        // Validation passes
        assert.doesNotThrow(() => validateWorldState(loadedState));
        assert.doesNotThrow(() => validateWorldSpatialTopology(loadedState, topology));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });

  // =========================================================================
  // 8. Architectural Integrity: Zero Backdoor Mutation
  // =========================================================================
  describe('8. Zero Backdoor Mutation & Authority Audit', () => {
    it('verifies that failed traversal produces ZERO mutation across WorldState', () => {
      const { topology, state } = createM86TestFixture();
      const stateSnapshotBefore = JSON.stringify(state);

      // Attempt invalid traversal
      traverseInternalConnection(
        state,
        {
          agentId: 'agent:m86-player',
          connectionId: 'conn:m86-b-to-staff', // player is in room-a, and also not staff!
        },
        topology
      );

      const stateSnapshotAfter = JSON.stringify(state);
      assert.equal(stateSnapshotAfter, stateSnapshotBefore);
    });

    it('verifies Invariants F-I are satisfied by valid fixture and agent state', () => {
      const { topology, state } = createM86TestFixture();
      const player = state.agents.find((a) => a.id === 'agent:m86-player')!;

      // Invariant F: valid connection exists
      const conn = findInternalConnectionById(topology, 'conn:m86-a-to-b')!;
      assert.ok(conn);
      assert.equal(conn.sourceInteriorId, player.interiorSpaceId);

      // Invariant G: logical context preserved
      const src = topology.interiors.find((i) => i.interiorId === conn.sourceInteriorId)!;
      const tgt = topology.interiors.find((i) => i.interiorId === conn.targetInteriorId)!;
      assert.equal(src.associatedPlaceId, tgt.associatedPlaceId);
      assert.equal(src.associatedPlaceId, player.locationId);

      // Invariant H: same building constraint
      assert.equal(src.buildingId, tgt.buildingId);
      assert.equal(conn.buildingId, src.buildingId);

      // Invariant I: authoritative transition only
      const res = traverseInternalConnection(
        state,
        { agentId: player.id, connectionId: conn.connectionId },
        topology
      );
      assert.equal(res.success, true);
      assert.equal(player.interiorSpaceId, conn.targetInteriorId);
    });
  });
});
