/**
 * Demonstration: Milestone 74 — Physical Traversal Runtime Integration
 *
 * Demonstrates time-spanning physical traversal and authoritative arrival:
 * 1. Agent starts at logical location A (street:development-street).
 * 2. NavigationRequest initiates traversal toward B (building:development-building).
 * 3. In-flight traversal tracks physical progress over multiple time steps.
 * 4. During transit, World Core Agent.locationId remains strictly at origin A.
 * 5. Physical coordinates and progress advance deterministically on each step.
 * 6. Physical arrival produces NavigationResult(status: 'arrived').
 * 7. Result completes through M73 RuntimeTraversalCoordinator and M69 validateArrivalAndCommit().
 * 8. Authoritative Agent.locationId commits to destination B.
 * 9. Demonstrates supersession: Traversal A -> B superseded by A -> C before arrival.
 * 10. Obsolete traversal terminates with 'traversal-interrupted'; C completes to final location.
 *
 * Run with:
 *   npx tsx scripts/demo-physical-traversal.ts
 */

import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  transitionAgentLocation,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  type NavigationResult,
} from '../src/core/navigation-contract.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { Scene3D, Node3D } from '../clients/minimal-3d/scene-3d.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import { projectWorldState } from '../src/core/world-projection.js';

const ANCHOR_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 AM local

function printHeader(title: string): void {
  console.log('\n' + '='.repeat(75));
  console.log(` ${title}`);
  console.log('='.repeat(75));
}

function printSubheader(title: string): void {
  console.log(`\n--- ${title} ---`);
}

async function runDemo(): Promise<void> {
  printHeader('Milestone 74: Physical Traversal Runtime Integration Demonstration');

  const clock = new WorldClock(ANCHOR_TIME);
  const state = createInitialWorldState(clock);
  const playerId = 'agent:dev-player';
  const streetA = 'street:development-street';
  const commercialB = 'building:development-building';
  const residenceC = 'building:development-residence';

  transitionAgentLocation(state, playerId, streetA, { silent: true });
  const player = state.agents.find((a) => a.id === playerId)!;

  printSubheader('1. Initial State Setup');
  console.log(`[World Core] Player: ${player.name} (${player.id})`);
  console.log(`[World Core] Logical Location: "${player.locationId}"`);
  console.log(`[World Core] Schema Version: ${state.version} (CURRENT_WORLD_STATE_VERSION = ${CURRENT_WORLD_STATE_VERSION})`);

  // Client and presentation setup
  const snapshot = projectWorldState(state, playerId);
  const client = new Minimal3DClient({
    clientId: 'client:dev-demo',
    observerAgentId: playerId,
  });
  client.updateSnapshot(snapshot);

  const initialPos = client.getPlayerVisualPosition()!;
  console.log(`[Scene3D] Initial Presentation Position: (x: ${initialPos.x.toFixed(2)}, y: ${initialPos.y.toFixed(2)}, z: ${initialPos.z.toFixed(2)})`);

  // Initialize runtime and coordinator
  const coordinator = new RuntimeTraversalCoordinator();
  const runtime = new PhysicalTraversalRuntime({
    client,
    speed: 8.0, // 8 units / sec
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Multi-Step Physical Traversal A -> B
  // --------------------------------------------------------------------------
  printHeader('Part 1: Multi-Step Time-Spanning Physical Traversal (A -> B)');

  printSubheader('2. Start Traversal toward Commercial Building');
  const startResult = coordinator.startTraversal(state, playerId, commercialB, ANCHOR_TIME, 'req:demo-A-to-B');
  console.log(`[Coordinator] Active Traversal Started: success=${startResult.success}, code="${startResult.code}"`);
  console.log(`[Coordinator] Active Request ID: "${startResult.request.requestId}"`);

  // Hand off request to PhysicalTraversalRuntime
  const navPromise = runtime.requestTraversal(startResult.request);
  const destPos = runtime.getDestinationPosition(playerId)!;
  console.log(`[Runtime] In-Flight Traversal Initiated.`);
  console.log(`[Runtime] Target Physical Coordinate: (x: ${destPos.x.toFixed(2)}, y: ${destPos.y.toFixed(2)}, z: ${destPos.z.toFixed(2)})`);
  console.log(`[World Core Invariant] Agent.locationId: "${player.locationId}" (MUST REMAIN ORIGIN)`);

  printSubheader('3. Discrete Frame Stepping (Observing Physical Progress vs Logical Location)');
  const steps = [250, 250, 250, 300]; // Multi-step progression

  for (let i = 0; i < steps.length; i++) {
    const dt = steps[i];
    const completed = runtime.step(dt);
    const curPos = client.getPlayerVisualPosition()!;
    const progressPct = (runtime.getProgress(playerId) * 100).toFixed(1);

    console.log(
      `Step ${i + 1} (+${dt}ms) -> ` +
      `Progress: ${progressPct}% | ` +
      `3D Position: (x: ${curPos.x.toFixed(2)}, y: ${curPos.y.toFixed(2)}, z: ${curPos.z.toFixed(2)}) | ` +
      `Logical Location: "${player.locationId}" | ` +
      `Completed: ${completed.length > 0 ? 'YES' : 'NO'}`
    );
  }

  printSubheader('4. Arrival Detection & Authoritative Delegation');
  const navResult = await navPromise;
  console.log(`[Runtime] Physical Arrival Emitted NavigationResult:`);
  console.log(`  - Request ID: "${navResult.requestId}"`);
  console.log(`  - Status: "${navResult.status}"`);
  console.log(`  - Destination: "${navResult.destinationPlaceId}"`);
  console.log(`  - Message: "${navResult.message}"`);

  console.log(`\n[Action] Passing NavigationResult to M73 coordinator.completeTraversal()...`);
  const completion = coordinator.completeTraversal(state, navResult);

  console.log(`[Coordinator] Completion Result: success=${completion.success}, code="${completion.code}"`);
  console.log(`[Coordinator] Previous Location: "${completion.previousLocationId}"`);
  console.log(`[Coordinator] Current Location: "${completion.currentLocationId}"`);
  console.log(`[World Core] Authoritative Agent.locationId is now: "${player.locationId}"`);

  // Update M71 projection
  const newSnapshot = projectWorldState(state, playerId);
  const recon = client.updateSnapshot(newSnapshot);
  console.log(`[Projection] New Snapshot: observerLocationId="${newSnapshot.observerLocationId}"`);
  console.log(`[Reconciliation] Spawned: [${recon.entitiesToSpawn.map((e) => e.entityId).join(', ')}]`);
  console.log(`[Reconciliation] Despawned: [${recon.entitiesToDespawn.join(', ')}]`);

  // --------------------------------------------------------------------------
  // Scenario 2: Supersession and Stale Result Protection
  // --------------------------------------------------------------------------
  printHeader('Part 2: Traversal Supersession & Stale Result Protection');

  // Move back to street for clean supersession demo
  transitionAgentLocation(state, playerId, streetA, { silent: true });
  client.updateSnapshot(projectWorldState(state, playerId));
  const playerNode = client.getScene().getNodeByEntityId(playerId);
  if (playerNode) {
    playerNode.transform.position = { x: 0, y: 1, z: 0 };
  }

  printSubheader('5. Start Traversal A -> B, then Player Changes Mind to A -> C');
  const reqAB = coordinator.startTraversal(state, playerId, commercialB, ANCHOR_TIME, 'req:supersede-1');
  const promiseAB = runtime.requestTraversal(reqAB.request);
  console.log(`[1] Started Traversal toward "${commercialB}" (req:supersede-1)`);

  runtime.step(200);
  console.log(`[1] In-transit... Progress: ${(runtime.getProgress(playerId) * 100).toFixed(1)}%`);

  console.log(`\n[Action] Initiating new traversal toward "${residenceC}" (req:supersede-2)...`);
  const reqAC = coordinator.startTraversal(state, playerId, residenceC, ANCHOR_TIME, 'req:supersede-2');
  console.log(`[Coordinator] Superseded Request ID reported: "${reqAC.supersededRequestId}"`);

  const promiseAC = runtime.requestTraversal(reqAC.request);
  console.log(`[Runtime] Old in-flight traversal superseded and terminated.`);

  const resultAB = await promiseAB;
  console.log(`[Runtime] Superseded promise AB resolved with status: "${resultAB.status}" (${resultAB.message})`);

  printSubheader('6. Attempt Stale Arrival Commit for req:supersede-1');
  const syntheticLateResult: NavigationResult = {
    requestId: 'req:supersede-1',
    agentId: playerId,
    destinationPlaceId: commercialB,
    status: 'arrived',
    completedAt: ANCHOR_TIME,
    message: 'Late arrival delivery',
  };
  const staleCommit = coordinator.completeTraversal(state, syntheticLateResult);
  console.log(`[Coordinator] Stale Commit Attempt: success=${staleCommit.success}, code="${staleCommit.code}"`);
  console.log(`[World Core] Location preserved at origin: "${player.locationId}"`);

  printSubheader('7. Valid Traversal (A -> C) Completes to Arrival');
  while (runtime.hasActiveTraversal(playerId)) {
    runtime.step(200);
  }
  const resultAC = await promiseAC;
  console.log(`[Runtime] Traversal AC reached destination with status: "${resultAC.status}"`);

  const commitAC = coordinator.completeTraversal(state, resultAC);
  console.log(`[Coordinator] Commit AC: success=${commitAC.success}, code="${commitAC.code}"`);
  console.log(`[World Core] Final Authoritative Location: "${player.locationId}" (Expected: "${residenceC}")`);

  printHeader('Milestone 74 Demonstration Completed Successfully');
}

runDemo().catch((err) => {
  console.error('Demonstration failed with error:', err);
  process.exit(1);
});
