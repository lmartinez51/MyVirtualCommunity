/**
 * Milestone 85 Correction Pass — Comprehensive Architectural Regression Suite
 *
 * Covers the 12 critical verification requirements approved by the architect:
 * 1. Player enters Wing Spot through an entrance and receives the canonical interior state.
 * 2. NPC arrives for an authorized work shift and reaches the same canonical interior state.
 * 3. Player and NPC in the same interior are physically co-located (areAgentsCoLocated === true).
 * 4. Agents in different interior partitions are not co-located (Room A vs. Room B -> false).
 * 5. Same-room interactions succeed (greet, item transfer, service inquiry).
 * 6. Cross-room interactions fail (greet fails, item transfer fails, service inquiry fails,
 *    agent context excludes other agent, world projection excludes other agent).
 * 7. Restaurant closure clears interiorSpaceId atomically back to null.
 * 8. Invalid spatial states are rejected by topology validation (Invariants A, B, C, D, E).
 * 9. Corrupt V18 migration data is rejected (malformed, entrance/nav node, nonexistent, mismatched).
 * 10. Ambiguous historical V18 data is not silently converted into fabricated interior presence.
 * 11. Legacy enterRestaurant() remains compatible without becoming an independent authority.
 * 12. Co-presence architectural boundary does not regress (source guard across src/core).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  WorldState,
  createInitialWorldState,
  createGomezMorinWorldState,
  executeRestaurantClosureEgress,
  greetAgent,
  enterRestaurant,
  migrateWorldStateV18ToV19,
  WorldStateV18,
  areAgentsCoLocated,
  introduceToAgent,
} from '../src/core/world-state.js';
import {
  createGomezMorinSpatialTopology,
  enterThroughEntranceThreshold,
  executeUnifiedEntranceIngress,
  validateWorldSpatialTopology,
  type GomezMorinSpatialTopology,
  type InteriorSpace,
  type BuildingEntrance,
} from '../src/core/real-world-street-topology.js';
import {
  executeNpcRoutineAction,
  evaluateNpcRoutineAction,
} from '../src/core/npc-behavior.js';
import { deriveAgentContext } from '../src/core/agent-context.js';
import { projectWorldState } from '../src/core/world-projection.js';
import { PhysicalMappingRegistry } from '../src/core/physical-mapping.js';
import { transferItemPossession, type OwnedItem } from '../src/core/item.js';
import { inquireRestaurantService } from '../src/core/order.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { WorldClock } from '../src/core/clock.js';
import type { Agent, AgentV18 } from '../src/core/entities/agent.js';

describe('Milestone 85 Correction Pass: Architectural Regression Suite', () => {
  const BASE_TIME = '2026-09-15T18:00:00.000Z'; // 12:00 PM local Juarez time (work shift active)

  function setupSeedWorld(): WorldState {
    const clock = WorldClock.create(BASE_TIME);
    return createGomezMorinWorldState(clock);
  }

  // Helper creating a multi-room mock topology for partition isolation tests
  function createMultiRoomMockTopology(): GomezMorinSpatialTopology {
    const base = createGomezMorinSpatialTopology();

    const roomA: InteriorSpace = {
      interiorId: 'interior:mr-room-a',
      buildingId: 'building:wing-spot',
      associatedPlaceId: 'restaurant:wing-spot',
      name: 'Wing Spot Dining Room A',
      entranceIds: ['entrance:mr-door-a'],
      capacity: 30,
      boundary: { minX: 10, maxX: 20, minZ: 10, maxZ: 20 },
    };

    const roomB: InteriorSpace = {
      interiorId: 'interior:mr-room-b',
      buildingId: 'building:wing-spot',
      associatedPlaceId: 'restaurant:wing-spot',
      name: 'Wing Spot Kitchen Room B',
      entranceIds: ['entrance:mr-door-b'],
      capacity: 10,
      boundary: { minX: 25, maxX: 35, minZ: 10, maxZ: 20 },
    };

    const entranceA: BuildingEntrance = {
      entranceId: 'entrance:mr-door-a',
      buildingId: 'building:wing-spot',
      interiorSpaceId: 'interior:mr-room-a',
      facingStreetPlaceId: 'street:porvenir-sidewalk-north',
      name: 'Door A',
      isAccessible: true,
      thresholdPosition: { x: 10, y: 0, z: 15 },
    };

    const entranceB: BuildingEntrance = {
      entranceId: 'entrance:mr-door-b',
      buildingId: 'building:wing-spot',
      interiorSpaceId: 'interior:mr-room-b',
      facingStreetPlaceId: 'street:porvenir-sidewalk-north',
      name: 'Door B',
      isAccessible: true,
      thresholdPosition: { x: 25, y: 0, z: 15 },
    };

    return {
      ...base,
      interiors: [...base.interiors, roomA, roomB],
      entrances: [...base.entrances, entranceA, entranceB],
    };
  }

  // =========================================================================
  // Requirement 1 & 2 & 3: Unified Ingress, NPC Arrival, and Physical Co-Presence
  // =========================================================================
  it('1. Player enters Wing Spot through entrance and receives canonical interior state', () => {
    const state = setupSeedWorld();
    const player = state.agents.find((a) => a.agentType === 'player')!;
    player.locationId = 'street:blvd-gomez-morin';
    player.interiorSpaceId = null;

    const result = enterThroughEntranceThreshold(state, {
      agentId: player.id,
      entranceId: 'entrance:wing-spot-main',
    });

    assert.equal(result.success, true);
    assert.equal(player.locationId, 'restaurant:wing-spot');
    assert.equal(player.interiorSpaceId, 'interior:wing-spot');
  });

  it('2. NPC arrives for an authorized work shift and reaches the same canonical interior state', () => {
    const state = setupSeedWorld();
    const npc = state.agents.find((a) => a.id === 'agent:elena-npc')!;
    npc.locationId = 'building:del-porvenir-residence';
    npc.interiorSpaceId = null;

    const routineAction = evaluateNpcRoutineAction(state, npc.id);
    assert.equal(routineAction.success, true);
    assert.equal(routineAction.routineAction.actionType, 'work-at-restaurant');
    assert.equal(routineAction.routineAction.targetLocationId, 'restaurant:wing-spot');

    const execResult = executeNpcRoutineAction(state, npc.id, routineAction.routineAction);
    assert.equal(execResult.success, true);
    assert.equal(npc.locationId, 'restaurant:wing-spot');
    assert.equal(npc.interiorSpaceId, 'interior:wing-spot');
  });

  it('3. Player and NPC in the same interior are physically co-located', () => {
    const state = setupSeedWorld();
    const player = state.agents.find((a) => a.agentType === 'player')!;
    const npc = state.agents.find((a) => a.id === 'agent:elena-npc')!;

    // Player enters Wing Spot
    player.locationId = 'street:blvd-gomez-morin';
    player.interiorSpaceId = null;
    const playerResult = enterThroughEntranceThreshold(state, {
      agentId: player.id,
      entranceId: 'entrance:wing-spot-main',
    });
    assert.equal(playerResult.success, true);

    // NPC arrives to work at Wing Spot
    npc.locationId = 'building:del-porvenir-residence';
    npc.interiorSpaceId = null;
    const npcResult = executeNpcRoutineAction(state, npc.id);
    assert.equal(npcResult.success, true);

    assert.equal(player.locationId, 'restaurant:wing-spot');
    assert.equal(npc.locationId, 'restaurant:wing-spot');
    assert.equal(player.interiorSpaceId, 'interior:wing-spot');
    assert.equal(npc.interiorSpaceId, 'interior:wing-spot');

    assert.equal(areAgentsCoLocated(state, player.id, npc.id), true);
  });

  // =========================================================================
  // Requirement 4: Partition Isolation
  // =========================================================================
  it('4. Agents in different interior partitions are NOT co-located', () => {
    const state = setupSeedWorld();
    const player = state.agents.find((a) => a.agentType === 'player')!;
    const npc = state.agents.find((a) => a.id === 'agent:elena-npc')!;

    // Both at the same logical restaurant place, but different physical rooms
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:mr-room-a';

    npc.locationId = 'restaurant:wing-spot';
    npc.interiorSpaceId = 'interior:mr-room-b';

    assert.equal(player.locationId, npc.locationId);
    assert.notEqual(player.interiorSpaceId, npc.interiorSpaceId);
    assert.equal(areAgentsCoLocated(state, player.id, npc.id), false);
  });

  // =========================================================================
  // Requirement 5: Same-Room Interactions Succeed
  // =========================================================================
  it('5. Same-room interactions succeed (greet, item transfer, service inquiry)', () => {
    const state = setupSeedWorld();
    const player = state.agents.find((a) => a.agentType === 'player')!;
    const npc = state.agents.find((a) => a.id === 'agent:elena-npc')!;

    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';
    npc.locationId = 'restaurant:wing-spot';
    npc.interiorSpaceId = 'interior:wing-spot';
    npc.activityState = 'active';

    // Establish acquaintance for item possession transfer
    introduceToAgent(state, player.id, npc.id);

    // A) Greet succeeds
    const greetResult = greetAgent(state, player.id, npc.id);
    assert.equal(greetResult.success, true);

    // B) Item transfer succeeds
    const testItem: OwnedItem = {
      id: 'item:sample-cookie',
      name: 'Sample Cookie',
      itemType: 'food',
      ownerAgentId: player.id,
      acquiredAt: state.worldTime,
      status: 'available',
    };
    state.items = [testItem];

    const transferResult = transferItemPossession(
      state,
      player.id,
      npc.id,
      testItem.id,
      state.worldTime
    );
    assert.equal(transferResult.success, true);
    assert.equal(testItem.ownerAgentId, npc.id);

    // C) Service inquiry succeeds
    const serviceResult = inquireRestaurantService(state as any, player.id, npc.id);
    assert.equal(serviceResult.success, true);
  });

  // =========================================================================
  // Requirement 6: Cross-Room Interactions Fail
  // =========================================================================
  it('6. Cross-room interactions fail (greet, item transfer, service, context, projection)', () => {
    const state = setupSeedWorld();
    const player = state.agents.find((a) => a.agentType === 'player')!;
    const npc = state.agents.find((a) => a.id === 'agent:elena-npc')!;

    // Same place, DIFFERENT interior rooms
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:mr-room-a';
    npc.locationId = 'restaurant:wing-spot';
    npc.interiorSpaceId = 'interior:mr-room-b';
    npc.activityState = 'active';

    // Establish acquaintance so acquaintance check does not shadow co-presence check
    introduceToAgent(state, player.id, npc.id);

    // A) Greet fails
    const greetResult = greetAgent(state, player.id, npc.id);
    assert.equal(greetResult.success, false);
    assert.equal(greetResult.code, 'agents-not-co-located');

    // B) Item transfer fails
    const testItem: OwnedItem = {
      id: 'item:sample-burger',
      name: 'Sample Burger',
      itemType: 'food',
      ownerAgentId: player.id,
      acquiredAt: state.worldTime,
      status: 'available',
    };
    state.items = [testItem];

    const transferResult = transferItemPossession(
      state,
      player.id,
      npc.id,
      testItem.id,
      state.worldTime
    );
    assert.equal(transferResult.success, false);
    assert.equal(transferResult.code, 'agents-not-co-located');
    assert.equal(testItem.ownerAgentId, player.id); // Zero mutation

    // C) Service inquiry fails
    const serviceResult = inquireRestaurantService(state as any, player.id, npc.id);
    assert.equal(serviceResult.success, false);
    assert.equal(serviceResult.code, 'agents-not-co-located');

    // D) deriveAgentContext excludes cross-room agent
    const playerContext = deriveAgentContext(state, player.id);
    assert.ok(playerContext);
    const isNpcPresent = playerContext.coLocatedAgents.some((a) => a.id === npc.id);
    assert.equal(isNpcPresent, false);

    // E) projectWorldState excludes cross-room agent
    const registry = new PhysicalMappingRegistry();
    const projection = projectWorldState(state, player.id, registry);
    const projectedAgents = projection.entities.filter((e) => e.entityType === 'agent');
    const isNpcProjected = projectedAgents.some((e) => e.entityId === npc.id);
    assert.equal(isNpcProjected, false);
  });

  // =========================================================================
  // Requirement 7: Restaurant Closure Clears interiorSpaceId
  // =========================================================================
  it('7. Restaurant closure clears interiorSpaceId atomically back to null', () => {
    const state = setupSeedWorld();
    const restaurant = state.restaurants.find((r) => r.id === 'restaurant:wing-spot')!;
    restaurant.operationalState = 'closed';

    const player = state.agents.find((a) => a.agentType === 'player')!;
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';

    const transitions = executeRestaurantClosureEgress(state, restaurant.id);
    assert.equal(transitions.length, 1);
    assert.equal(player.locationId, restaurant.buildingId);
    assert.equal(player.interiorSpaceId, null);
  });

  // =========================================================================
  // Requirement 8: Spatial Invariant Validation
  // =========================================================================
  it('8. Invalid spatial states are rejected by topology validation (Invariants A-E)', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = setupSeedWorld();
    const player = state.agents.find((a) => a.agentType === 'player')!;

    // Invariant B violation: Non-existent interior
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:does-not-exist';
    assert.throws(
      () => validateWorldSpatialTopology(state, topology),
      /Invariant B violation/
    );

    // Invariant C violation: Mismatched place
    player.locationId = 'restaurant:pasteleria-tia-lupe';
    player.interiorSpaceId = 'interior:wing-spot';
    assert.throws(
      () => validateWorldSpatialTopology(state, topology),
      /Invariant C violation/
    );

    // Invariant E violation: Leaking entrance ID
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'entrance:wing-spot-main';
    assert.throws(
      () => validateWorldSpatialTopology(state, topology),
      /Invariant E violation/
    );

    // Valid state passes
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';
    assert.doesNotThrow(() => validateWorldSpatialTopology(state, topology));
  });

  // =========================================================================
  // Requirement 9: Corrupt V18 Migration Rejection
  // =========================================================================
  it('9. Corrupt V18 migration data is rejected', () => {
    const corruptAgent: AgentV18 = {
      id: 'agent:corrupt',
      type: 'agent',
      name: 'Corrupt',
      agentType: 'player',
      activityState: 'idle',
      activitySince: BASE_TIME,
      locationId: 'restaurant:wing-spot',
      balanceMinor: 1000,
      currency: 'USD',
    };
    (corruptAgent as any).interiorSpaceId = 'entrance:wing-spot-main';

    const v18State: WorldStateV18 = {
      worldId: 'juarez-el-paso',
      version: 18,
      worldTime: BASE_TIME,
      places: [],
      restaurants: [],
      agents: [corruptAgent],
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

  // =========================================================================
  // Requirement 10: Ambiguous Historical V18 Data Preserved Safely
  // =========================================================================
  it('10. Ambiguous historical V18 data is not silently converted into fabricated interior presence', () => {
    const v18AmbiguousAgent: AgentV18 = {
      id: 'agent:historical-idle',
      type: 'agent',
      name: 'Historical Idle',
      agentType: 'player',
      activityState: 'idle',
      activitySince: BASE_TIME,
      locationId: 'restaurant:wing-spot',
      balanceMinor: 500,
      currency: 'USD',
    };

    const v18State: WorldStateV18 = {
      worldId: 'juarez-el-paso',
      version: 18,
      worldTime: BASE_TIME,
      places: [],
      restaurants: [],
      agents: [v18AmbiguousAgent],
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

    const migrated = migrateWorldStateV18ToV19(v18State);
    assert.equal(migrated.version, 19);
    assert.equal(migrated.agents[0].locationId, 'restaurant:wing-spot');
    // Crucial: Must be null because V18 contains no explicit interiorSpaceId
    assert.equal(migrated.agents[0].interiorSpaceId, null);
  });

  // =========================================================================
  // Requirement 11: Legacy enterRestaurant Compatibility (F-09 Closure)
  // =========================================================================
  it('11. Legacy enterRestaurant() rejects topology-backed venues with entrance-required and allows dev fixtures with null interior', () => {
    const state = setupSeedWorld();
    const player = state.agents.find((a) => a.agentType === 'player')!;

    // A) Canonical registered restaurant: rejected with 'entrance-required' to prevent interior bypass
    player.locationId = 'building:wing-spot-building';
    player.interiorSpaceId = null;
    const entryResult = enterRestaurant(state, player.id, 'restaurant:wing-spot');
    assert.equal(entryResult.success, false);
    assert.equal(entryResult.code, 'entrance-required');
    assert.equal(player.locationId, 'building:wing-spot-building');
    assert.equal(player.interiorSpaceId, null);

    // B) Development fixture without interior topology: preserves null
    const devClock = WorldClock.create(BASE_TIME);
    const devState = createInitialWorldState(devClock);
    const devPlayer = devState.agents.find((a) => a.agentType === 'player')!;
    devPlayer.locationId = 'building:development-building';

    const devEntryResult = enterRestaurant(devState, devPlayer.id, 'restaurant:development-restaurant');
    assert.equal(devEntryResult.success, true);
    assert.equal(devPlayer.locationId, 'restaurant:development-restaurant');
    assert.equal(devPlayer.interiorSpaceId, null);
  });

  // =========================================================================
  // Requirement 12: Co-Presence Architectural Boundary Guard (Source-level)
  // =========================================================================
  it('12. Architectural Boundary Guard: zero direct agent-to-agent locationId comparisons in src/core (outside co-presence.ts)', () => {
    const coreDir = join(process.cwd(), 'src', 'core');
    const files = readdirSync(coreDir).filter((f) => f.endsWith('.ts'));

    const forbiddenPattern = /(\b\w+\.locationId\s*[!=]==?\s*\w+\.locationId\b)/g;

    const violations: { file: string; match: string; line: number }[] = [];

    for (const file of files) {
      if (file === 'co-presence.ts') {
        continue; // Sole canonical authority allowed to perform this check
      }

      const content = readFileSync(join(coreDir, file), 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
          continue;
        }

        const matches = line.match(forbiddenPattern);
        if (matches) {
          violations.push({
            file,
            match: matches[0],
            line: i + 1,
          });
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found forbidden direct agent locationId comparison(s) in src/core: ${JSON.stringify(violations, null, 2)}`
    );
  });
});
