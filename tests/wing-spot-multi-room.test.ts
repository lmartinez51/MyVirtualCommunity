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
} from '../src/core/world-state.js';
import { Agent } from '../src/core/entities/agent.js';
import { createGomezMorinSeedWorld } from '../src/core/seed.js';
import {
  GomezMorinSpatialTopology,
  createGomezMorinSpatialTopology,
  validateInteriorTopology,
  validateAgentSpatialInvariants,
  validateWorldSpatialTopology,
  findInteriorSpaceById,
  findInteriorSpacesByBuilding,
  findInternalConnectionById,
  findOutgoingInternalConnections,
  traverseInternalConnection,
  executeUnifiedEntranceIngress,
} from '../src/core/real-world-street-topology.ts';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 87: Wing Spot Canonical Multi-Room Topology & Back-of-House Staff Gating', () => {
  const BASE_TIME = '2026-10-05T12:00:00.000Z';

  function createTestWorldState(): WorldState {
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
  // Test 1 — Production Topology Validates Cleanly
  // =========================================================================
  it('Test 1: production Gómez Morín topology validates cleanly with zero errors', () => {
    const topology = createGomezMorinSpatialTopology();
    const result = validateInteriorTopology(topology);

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  // =========================================================================
  // Test 2 — Wing Spot Has Exactly Two Canonical Interior Partitions
  // =========================================================================
  it('Test 2: Wing Spot contains both public dining hall and back-of-house kitchen partitions', () => {
    const topology = createGomezMorinSpatialTopology();

    const dining = findInteriorSpaceById(topology, 'interior:wing-spot');
    assert.ok(dining, 'interior:wing-spot must exist in topology');
    assert.equal(dining.interiorId, 'interior:wing-spot');
    assert.equal(dining.buildingId, 'building:wing-spot-building');
    assert.equal(dining.associatedPlaceId, 'restaurant:wing-spot');
    assert.deepEqual(dining.entranceIds, ['entrance:wing-spot-main']);

    const kitchen = findInteriorSpaceById(topology, 'interior:wing-spot-kitchen');
    assert.ok(kitchen, 'interior:wing-spot-kitchen must exist in topology');
    assert.equal(kitchen.interiorId, 'interior:wing-spot-kitchen');
    assert.equal(kitchen.buildingId, 'building:wing-spot-building');
    assert.equal(kitchen.associatedPlaceId, 'restaurant:wing-spot');
    assert.deepEqual(kitchen.entranceIds, [], 'Kitchen must not have direct exterior entrances');

    const wingSpotSpaces = findInteriorSpacesByBuilding(topology, 'building:wing-spot-building');
    assert.equal(wingSpotSpaces.length, 2);
    assert.ok(wingSpotSpaces.some((s) => s.interiorId === 'interior:wing-spot'));
    assert.ok(wingSpotSpaces.some((s) => s.interiorId === 'interior:wing-spot-kitchen'));
  });

  // =========================================================================
  // Test 3 — Internal Connections Configuration & Gating Policy
  // =========================================================================
  it('Test 3: internal connections connect dining and kitchen with staff-only gating', () => {
    const topology = createGomezMorinSpatialTopology();

    // Dining -> Kitchen (staff-only service door)
    const diningToKitchen = findInternalConnectionById(topology, 'conn:wing-spot-dining-to-kitchen');
    assert.ok(diningToKitchen, 'conn:wing-spot-dining-to-kitchen must exist');
    assert.equal(diningToKitchen.buildingId, 'building:wing-spot-building');
    assert.equal(diningToKitchen.sourceInteriorId, 'interior:wing-spot');
    assert.equal(diningToKitchen.targetInteriorId, 'interior:wing-spot-kitchen');
    assert.equal(diningToKitchen.passageType, 'service-door');
    assert.equal(diningToKitchen.accessPolicy, 'staff-only');
    assert.equal(diningToKitchen.pairedConnectionId, 'conn:wing-spot-kitchen-to-dining');

    // Kitchen -> Dining (unrestricted egress)
    const kitchenToDining = findInternalConnectionById(topology, 'conn:wing-spot-kitchen-to-dining');
    assert.ok(kitchenToDining, 'conn:wing-spot-kitchen-to-dining must exist');
    assert.equal(kitchenToDining.buildingId, 'building:wing-spot-building');
    assert.equal(kitchenToDining.sourceInteriorId, 'interior:wing-spot-kitchen');
    assert.equal(kitchenToDining.targetInteriorId, 'interior:wing-spot');
    assert.equal(kitchenToDining.passageType, 'service-door');
    assert.equal(kitchenToDining.accessPolicy, 'unrestricted');
    assert.equal(kitchenToDining.pairedConnectionId, 'conn:wing-spot-dining-to-kitchen');

    // Outgoing lookup validation
    const diningOutgoing = findOutgoingInternalConnections(topology, 'interior:wing-spot');
    assert.equal(diningOutgoing.length, 1);
    assert.equal(diningOutgoing[0].connectionId, 'conn:wing-spot-dining-to-kitchen');

    const kitchenOutgoing = findOutgoingInternalConnections(topology, 'interior:wing-spot-kitchen');
    assert.equal(kitchenOutgoing.length, 1);
    assert.equal(kitchenOutgoing[0].connectionId, 'conn:wing-spot-kitchen-to-dining');
  });

  // =========================================================================
  // Test 4 — Customer / Non-Staff Is Rejected with Zero State Mutation
  // =========================================================================
  it('Test 4: customer in dining hall attempting traversal into kitchen is rejected with zero state mutation', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();

    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';

    const snapshotBefore = JSON.stringify(state);

    const result = traverseInternalConnection(
      state,
      {
        agentId: player.id,
        connectionId: 'conn:wing-spot-dining-to-kitchen',
      },
      topology
    );

    assert.equal(result.success, false);
    assert.equal(result.code, 'unauthorized-traversal');
    assert.equal(player.locationId, 'restaurant:wing-spot');
    assert.equal(player.interiorSpaceId, 'interior:wing-spot');

    const snapshotAfter = JSON.stringify(state);
    assert.equal(snapshotAfter, snapshotBefore, 'Failed customer traversal must cause zero state mutation');
  });

  // =========================================================================
  // Test 5 — Elena (Authorized Staff) Can Enter Kitchen
  // =========================================================================
  it('Test 5: Elena (authorized staff attendant) successfully traverses dining -> kitchen', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();

    const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
    elena.locationId = 'restaurant:wing-spot';
    elena.interiorSpaceId = 'interior:wing-spot';

    const result = traverseInternalConnection(
      state,
      {
        agentId: elena.id,
        connectionId: 'conn:wing-spot-dining-to-kitchen',
      },
      topology
    );

    assert.equal(result.success, true);
    assert.equal(result.code, 'success');
    assert.equal(result.previousInteriorSpaceId, 'interior:wing-spot');
    assert.equal(result.newInteriorSpaceId, 'interior:wing-spot-kitchen');
    assert.equal(elena.interiorSpaceId, 'interior:wing-spot-kitchen');
    assert.equal(elena.locationId, 'restaurant:wing-spot', 'Logical locationId must remain restaurant:wing-spot');

    // Spatial invariants check
    const invariantCheck = validateAgentSpatialInvariants(elena, topology);
    assert.equal(invariantCheck.valid, true);
    assert.deepEqual(invariantCheck.errors, []);
  });

  // =========================================================================
  // Test 6 — Elena Can Return to Dining (Kitchen Egress)
  // =========================================================================
  it('Test 6: Elena successfully returns from kitchen to dining hall via unrestricted egress', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();

    const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
    elena.locationId = 'restaurant:wing-spot';
    elena.interiorSpaceId = 'interior:wing-spot-kitchen';

    const result = traverseInternalConnection(
      state,
      {
        agentId: elena.id,
        connectionId: 'conn:wing-spot-kitchen-to-dining',
      },
      topology
    );

    assert.equal(result.success, true);
    assert.equal(result.code, 'success');
    assert.equal(result.previousInteriorSpaceId, 'interior:wing-spot-kitchen');
    assert.equal(result.newInteriorSpaceId, 'interior:wing-spot');
    assert.equal(elena.interiorSpaceId, 'interior:wing-spot');
    assert.equal(elena.locationId, 'restaurant:wing-spot');

    const invariantCheck = validateAgentSpatialInvariants(elena, topology);
    assert.equal(invariantCheck.valid, true);
    assert.deepEqual(invariantCheck.errors, []);
  });

  // =========================================================================
  // Test 7 — Partitioned Physical Co-Presence
  // =========================================================================
  it('Test 7: co-presence respects interior partition identity between dining and kitchen', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();

    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
    const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;

    // Case A: Player in dining, Elena in kitchen
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';
    elena.locationId = 'restaurant:wing-spot';
    elena.interiorSpaceId = 'interior:wing-spot-kitchen';

    assert.equal(
      areAgentsCoLocated(state, player.id, elena.id),
      false,
      'Player in dining and Elena in kitchen must NOT be co-located'
    );

    // Case B: Elena traverses back to dining
    const returnResult = traverseInternalConnection(
      state,
      {
        agentId: elena.id,
        connectionId: 'conn:wing-spot-kitchen-to-dining',
      },
      topology
    );
    assert.equal(returnResult.success, true);
    assert.equal(elena.interiorSpaceId, 'interior:wing-spot');

    assert.equal(
      areAgentsCoLocated(state, player.id, elena.id),
      true,
      'Player and Elena both in dining hall MUST be co-located'
    );
  });

  // =========================================================================
  // Test 8 — Exterior Ingress Invariant Preserved
  // =========================================================================
  it('Test 8: exterior entrance places ingress agents into public dining hall, never kitchen', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();

    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
    player.locationId = 'street:blvd-gomez-morin';
    player.interiorSpaceId = null;

    const ingressResult = executeUnifiedEntranceIngress(
      state,
      {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -45.0, z: -12.4 },
      },
      topology
    );

    assert.equal(ingressResult.success, true);
    assert.equal(player.locationId, 'restaurant:wing-spot');
    assert.equal(player.interiorSpaceId, 'interior:wing-spot', 'Must enter dining hall partition');
    assert.notEqual(player.interiorSpaceId, 'interior:wing-spot-kitchen', 'Must NEVER directly enter kitchen from exterior');
  });

  // =========================================================================
  // Test 9 — Persistence Round-Trip Under Schema 19
  // =========================================================================
  it('Test 9: agent in Wing Spot kitchen persists and reloads cleanly under Schema 19', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();
    const tempFile = join(tmpdir(), `wing-spot-m87-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

    try {
      const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      elena.locationId = 'restaurant:wing-spot';
      elena.interiorSpaceId = 'interior:wing-spot-kitchen';

      const persistence = new LocalFilePersistence(tempFile, topology);
      persistence.save(state);

      assert.ok(existsSync(tempFile), 'Persisted file must exist on disk');

      const loadedState = persistence.load();
      assert.equal(loadedState.version, 19, 'Persisted version must be Schema 19');

      const loadedElena = loadedState.agents.find((a) => a.id === 'agent:elena-npc')!;
      assert.equal(loadedElena.locationId, 'restaurant:wing-spot');
      assert.equal(loadedElena.interiorSpaceId, 'interior:wing-spot-kitchen');

      // Full world spatial topology verification on loaded state
      validateWorldSpatialTopology(loadedState, topology);
    } finally {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    }
  });

  // =========================================================================
  // Test 10 — Spatial Position Threshold Validation
  // =========================================================================
  it('Test 10: traversal validates spatial position proximity to doorway threshold', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();

    const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
    elena.locationId = 'restaurant:wing-spot';
    elena.interiorSpaceId = 'interior:wing-spot';

    // Position too far from source threshold (-45.0, -18.0)
    const farResult = traverseInternalConnection(
      state,
      {
        agentId: elena.id,
        connectionId: 'conn:wing-spot-dining-to-kitchen',
        spatialPosition: { x: -40.0, z: -14.0 }, // ~6.4m away
        maxThresholdDistance: 2.5,
      },
      topology
    );
    assert.equal(farResult.success, false);
    assert.equal(farResult.code, 'invalid-spatial-position');
    assert.equal(elena.interiorSpaceId, 'interior:wing-spot', 'Must not mutate on threshold failure');

    // Position close to source threshold (-45.0, -18.0)
    const nearResult = traverseInternalConnection(
      state,
      {
        agentId: elena.id,
        connectionId: 'conn:wing-spot-dining-to-kitchen',
        spatialPosition: { x: -45.1, z: -18.1 }, // ~0.14m away
        maxThresholdDistance: 2.5,
      },
      topology
    );
    assert.equal(nearResult.success, true);
    assert.equal(nearResult.code, 'success');
    assert.equal(elena.interiorSpaceId, 'interior:wing-spot-kitchen');
  });
});
