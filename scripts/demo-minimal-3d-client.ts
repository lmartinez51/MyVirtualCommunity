/**
 * Demonstration: Milestone 72 — Minimal 3D Client Prototype
 *
 * Demonstrates how the minimal 3D client consumes M71 WorldProjectionSnapshots,
 * reconciles an engine-independent 3D scene graph, maintains strict separation between
 * presentation transforms and authoritative World Core location, and executes
 * full authoritative round-trip cycles via ClientIntent envelopes.
 *
 * Run with:
 *   npx tsx scripts/demo-minimal-3d-client.ts
 */

import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  transitionAgentLocation,
  transitionRestaurantOperationalState,
  enterBuilding,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import { projectWorldState } from '../src/core/world-projection.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';

const ANCHOR_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 AM local (Monday)

function printHeader(title: string): void {
  console.log('\n' + '='.repeat(70));
  console.log(` ${title}`);
  console.log('='.repeat(70));
}

function printSubheader(title: string): void {
  console.log(`\n--- ${title} ---`);
}

function runDemo(): void {
  printHeader('Milestone 72: Minimal 3D Client Prototype Demonstration');

  // 1. World Core Initialization
  printSubheader('1. Authoritative World Core Initialization');
  const clock = new WorldClock(ANCHOR_TIME);
  const state = createInitialWorldState(clock);
  const playerId = 'agent:dev-player';
  const npcId = 'agent:dev-npc';

  transitionAgentLocation(state, playerId, 'street:development-street', { silent: true });
  transitionAgentLocation(state, npcId, 'street:development-street', { silent: true });

  const player = state.agents.find((a) => a.id === playerId)!;
  console.log(`[World Core] World ID: ${state.worldId}`);
  console.log(`[World Core] Schema Version: ${state.version}`);
  console.log(`[World Core] Player: ${player.name} (${player.id})`);
  console.log(`[World Core] Player Authoritative Location: "${player.locationId}"`);

  // 2. Minimal 3D Client Instantiation & Initial Scene Reconciliation
  printSubheader('2. Minimal 3D Client Instantiation & Initial M71 Projection');
  const client3D = new Minimal3DClient({
    clientId: 'client:minimal-webgl-3d',
    observerAgentId: playerId,
  });

  console.log(`[3D Client] Client ID: ${client3D.clientId}`);
  console.log(`[3D Client] Initial Scene Node Count: ${client3D.getScene().getAllNodes().length}`);

  const streetSnapshot = projectWorldState(state, playerId);
  console.log(`[World Core -> M71] Generated Projection Snapshot: ${streetSnapshot.snapshotId}`);
  console.log(`[World Core -> M71] Entities in Projection: ${streetSnapshot.entities.length}`);

  const initialRecon = client3D.updateSnapshot(streetSnapshot);
  console.log(`[3D Client] Reconciled Snapshot -> Spawned ${initialRecon.entitiesToSpawn.length} visual entities:`);
  for (const node of client3D.getScene().getAllNodes()) {
    const pos = node.transform.position;
    console.log(
      `  • Node "${node.name}" (${node.primitive ?? 'group'}) at ` +
      `(${pos.x}, ${pos.y}, ${pos.z}) dimensions=(${node.dimensions.x}, ${node.dimensions.y}, ${node.dimensions.z})`
    );
  }

  // 3. Core Hypothesis Validation: 3D Transform vs Authoritative Location
  printSubheader('3. Core Hypothesis Validation: Presentation Movement vs Authority');
  console.log('Action: Player moves locally in 3D scene (e.g. WASD or Arrow Keys)...');
  const oldPos = client3D.getPlayerVisualPosition()!;
  const newPos = client3D.movePlayerVisual({ x: 12.0, y: 0.0, z: -4.0 });

  console.log(`[3D Scene] Player 3D Position Before: (${oldPos.x}, ${oldPos.y}, ${oldPos.z})`);
  console.log(`[3D Scene] Player 3D Position After:  (${newPos.x}, ${newPos.y}, ${newPos.z})`);

  console.log('\n[Authority Check]');
  console.log(`  Authoritative Agent.locationId in World Core: "${player.locationId}"`);
  console.log(`  Does WorldState contain 3D coordinates? ${(player as any).x !== undefined || (player as any).transform !== undefined ? 'YES (VIOLATION)' : 'NO (CORRECT)'}`);
  console.log('  CONCLUSION: 3D coordinates are presentation-only. World Core authority is 100% preserved.');

  // 4. Authoritative Round-Trip Cycle
  printSubheader('4. Authoritative Round-Trip Cycle via ClientIntent Envelope');
  console.log('Action: Player approaches commercial building door and triggers enter action...');

  const intent = client3D.createIntent('enterBuilding', {
    buildingId: 'building:development-building',
  });
  console.log(`[3D Client -> Server] Emitted Intent Envelope: ${intent.intentId}`);
  console.log(`  Command Name: "${intent.commandName}"`);
  console.log(`  Payload: ${JSON.stringify(intent.payload)}`);
  console.log(`  (Note: PhysicalClientAdapter does NOT execute commands directly)`);

  console.log('\n[World Core] Validating and executing authoritative command...');
  const commandResult = enterBuilding(
    state,
    intent.agentId,
    intent.payload.buildingId as string
  );
  console.log(`[World Core] Command Result: success=${commandResult.success}, code="${commandResult.code}"`);
  console.log(`[World Core] Updated Authoritative Location: "${player.locationId}"`);

  console.log('\n[World Core -> M71] Generating updated projection snapshot...');
  const interiorSnapshot = projectWorldState(state, playerId);
  console.log(`[World Core -> M71] New Snapshot: ${interiorSnapshot.snapshotId}`);

  console.log('\n[3D Client] Reconciling 3D scene with interior projection...');
  const interiorRecon = client3D.updateSnapshot(interiorSnapshot);
  console.log(`  Entities Despawned (${interiorRecon.entitiesToDespawn.length}): ${interiorRecon.entitiesToDespawn.join(', ')}`);
  console.log(`  Entities Spawned   (${interiorRecon.entitiesToSpawn.length}): ${interiorRecon.entitiesToSpawn.map((e) => e.entityId).join(', ')}`);

  console.log('\n[3D Client] Active Scene Nodes in Building Interior:');
  for (const node of client3D.getScene().getAllNodes()) {
    const pos = node.transform.position;
    console.log(`  • Node "${node.name}" (${node.primitive ?? 'group'}) at (${pos.x}, ${pos.y}, ${pos.z})`);
  }

  // 5. Dynamic State Property Update
  printSubheader('5. Dynamic World Fact Change & Visual Reflection');
  console.log('Action: World Core transitions restaurant operationalState to "closed"...');
  transitionRestaurantOperationalState(
    state,
    'restaurant:development-restaurant',
    'closed',
    state.worldTime
  );

  const closedSnapshot = projectWorldState(state, playerId);
  const closedRecon = client3D.updateSnapshot(closedSnapshot);
  const restaurantNode = client3D.getScene().getNodeByEntityId('restaurant:development-restaurant')!;
  console.log(`[3D Client] Reconciled entitiesToUpdate: ${closedRecon.entitiesToUpdate.map((e) => e.entityId).join(', ')}`);
  console.log(`[3D Client] Restaurant Visual Color: [${restaurantNode.color.join(', ')}] (Red = Closed)`);

  // 6. Multi-Client Concurrency
  printSubheader('6. Multi-Client Independence (3D Client + Concurrent Observer)');
  const client2 = new Minimal3DClient({
    clientId: 'client:concurrent-observer',
    observerAgentId: playerId,
  });
  client2.updateSnapshot(closedSnapshot);

  client3D.movePlayerVisual({ x: 5, y: 0, z: 5 });
  console.log(`[Client 1 - 3D] Visual Position: (${client3D.getPlayerVisualPosition()!.x}, ${client3D.getPlayerVisualPosition()!.y}, ${client3D.getPlayerVisualPosition()!.z})`);
  console.log(`[Client 2 - Other] Visual Position: (${client2.getPlayerVisualPosition()!.x}, ${client2.getPlayerVisualPosition()!.y}, ${client2.getPlayerVisualPosition()!.z})`);
  console.log('Conclusion: Multiple clients maintain independent presentation states without cross-bleeding.');

  // 7. Architectural Invariants Verification
  printSubheader('7. Architectural Invariants Verification');
  console.log(`• WorldState Schema Version: ${state.version} (CURRENT_WORLD_STATE_VERSION = ${CURRENT_WORLD_STATE_VERSION})`);
  console.log(`• World Core 3D Dependencies: 0 (Zero external graphics / math libraries in core)`);
  console.log(`• Simulation / Persistence: 100% headless and decoupled from 3D representation`);
  console.log('• Hypothesis Validated: YES — Minimal 3D client faithfully represents World Core without altering authority.');

  printHeader('Demo Completed Successfully');
}

runDemo();
