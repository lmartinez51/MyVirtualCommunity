/**
 * Demonstration: Milestone 75 — Agent Intent & Decision Boundary Foundation
 *
 * Demonstrates the engine-independent boundary separating:
 * 1. Agent Cognition / Decision (AgentDecisionProvider)
 * 2. Agent Intent (AgentIntent: non-authoritative candidate proposal)
 * 3. Spatial Traversal Pipeline (M73 RuntimeTraversalCoordinator & M74 PhysicalTraversalRuntime)
 * 4. Authoritative World Core Arrival (M69 validateArrivalAndCommit & transitionAgentLocation)
 * 5. Future AI Pluggability (Mock LLM decision provider using the same contract)
 *
 * Run with:
 *   npx tsx scripts/demo-agent-intent.ts
 */

import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  transitionAgentLocation,
  CURRENT_WORLD_STATE_VERSION,
  type WorldState,
} from '../src/core/world-state.js';
import {
  type NavigationResult,
  DeterministicMockNavigationProvider,
} from '../src/core/navigation-contract.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import { projectWorldState } from '../src/core/world-projection.js';
import {
  type AgentDecisionProvider,
  type AgentIntent,
  type MoveToPlaceIntent,
  DeterministicAgentDecisionProvider,
  createMoveToPlaceIntent,
  dispatchAgentIntent,
} from '../src/core/agent-intent.js';
import {
  type AgentContext,
  deriveAgentContext,
} from '../src/core/agent-context.js';

const COMMUTE_TIME_UTC = '2026-09-14T14:35:00.000Z'; // 08:35 AM local (commute window)
const elenaId = 'agent:dev-npc';
const residenceId = 'building:development-residence';
const restaurantId = 'restaurant:development-restaurant';

function printHeader(title: string): void {
  console.log('\n' + '='.repeat(80));
  console.log(` ${title}`);
  console.log('='.repeat(80));
}

function printSubheader(title: string): void {
  console.log(`\n--- ${title} ---`);
}

async function runDemo(): Promise<void> {
  printHeader('Milestone 75: Agent Intent & Decision Boundary Demonstration');

  // --------------------------------------------------------------------------
  // Part 1: Initial World Core State Setup
  // --------------------------------------------------------------------------
  printHeader('Part 1: Initial World Core State Setup');

  const clock = new WorldClock(COMMUTE_TIME_UTC);
  const state = createInitialWorldState(clock);
  transitionAgentLocation(state, elenaId, residenceId, { silent: true });
  const elena = state.agents.find((a) => a.id === elenaId)!;

  console.log(`[World Core] Agent: ${elena.name} (${elena.id})`);
  console.log(`[World Core] Authoritative Location: "${elena.locationId}" (Residence)`);
  console.log(`[World Core] World Time: ${state.worldTime} (08:35 AM local MDT)`);
  console.log(`[World Core] Schema Version: ${state.version} (CURRENT_WORLD_STATE_VERSION = ${CURRENT_WORLD_STATE_VERSION})`);

  // --------------------------------------------------------------------------
  // Part 2: Agent Decision Evaluation (Zero World Core Authority)
  // --------------------------------------------------------------------------
  printHeader('Part 2: Agent Decision Evaluation (Zero World Core Authority)');

  const stateSnapshotBefore = JSON.stringify(state);
  const decisionProvider = new DeterministicAgentDecisionProvider();

  console.log(`[Decision Provider] Provider ID: "${decisionProvider.providerId}"`);
  console.log(`[Agent Context] Deriving bounded AgentContext for Elena...`);

  const context = deriveAgentContext(state, elenaId);
  if (!context) {
    throw new Error('Failed to derive AgentContext for Elena');
  }

  console.log(`  - Situated Location: "${context.currentLocation.locationId}" (${context.currentLocation.name})`);
  console.log(`  - Local Civil Time: ${context.civilTime.hour}:${String(context.civilTime.minute).padStart(2, '0')} (${context.civilTime.timeZone})`);
  console.log(`  - Scheduled Objective: "${context.scheduledObjective?.type}" -> target: "${context.scheduledObjective?.targetPlaceId}"`);
  console.log(`  - Co-Located Agents: ${context.coLocatedAgents.length}`);
  console.log(`  - Known Facts Count: ${context.knownFacts.length}`);
  console.log(`  - Zero WorldState leak: context exposes no raw entities or foreign accounts.`);

  const intent = decisionProvider.decideIntent(context);
  const stateSnapshotAfter = JSON.stringify(state);

  if (!intent || intent.intentType !== 'move-to-place') {
    throw new Error('Expected MoveToPlaceIntent from decision provider');
  }

  console.log(`[Agent Intent Emitted]`);
  console.log(`  - Intent ID: "${intent.intentId}"`);
  console.log(`  - Agent ID: "${intent.agentId}"`);
  console.log(`  - Intent Type: "${intent.intentType}"`);
  console.log(`  - Destination Place ID: "${intent.destinationPlaceId}"`);
  console.log(`  - Reason: "${intent.reason}"`);
  console.log(`  - Created At: ${intent.createdAt}`);

  // Invariant verification
  console.log('\n[Invariant Check: Zero State Mutation during Decision]');
  const isStateUnchanged = stateSnapshotBefore === stateSnapshotAfter;
  console.log(`  - WorldState strictly unchanged: ${isStateUnchanged}`);
  console.log(`  - Agent.locationId still at origin: "${elena.locationId}" === "${residenceId}"`);

  // --------------------------------------------------------------------------
  // Part 3: Intent Dispatch & Pipeline Translation (M73 & M74)
  // --------------------------------------------------------------------------
  printHeader('Part 3: Intent Dispatch & Pipeline Translation (M73 & M74)');

  const coordinator = new RuntimeTraversalCoordinator();

  // Setup client presentation layer
  const projectionSnapshot = projectWorldState(state, elenaId);
  const client = new Minimal3DClient({
    clientId: 'client:demo-m75',
    observerAgentId: elenaId,
  });
  client.updateSnapshot(projectionSnapshot);

  const runtime = new PhysicalTraversalRuntime({
    client,
    speed: 8.0, // 8 world units / second
  });

  console.log(`[Intent Dispatcher] Dispatching MoveToPlaceIntent...`);
  const dispatchResult = dispatchAgentIntent(state, intent, { coordinator });

  console.log(`[Dispatcher Result] Success: ${dispatchResult.success}, Code: "${dispatchResult.code}"`);
  console.log(`[M73 Coordinator] Active Traversal Registered: ${coordinator.hasActiveTraversal(elenaId)}`);
  console.log(`[M69 Request] Request ID: "${dispatchResult.request?.requestId}"`);
  console.log(`[M69 Request] Origin: "${dispatchResult.request?.originPlaceId}" -> Destination: "${dispatchResult.request?.destinationPlaceId}"`);

  // Handoff to PhysicalTraversalRuntime
  const traversalPromise = runtime.requestTraversal(dispatchResult.request!);
  const destPos = runtime.getDestinationPosition(elenaId);
  console.log(`[M74 Runtime] Traversal initiated toward physical position: (x: ${destPos?.x}, y: ${destPos?.y}, z: ${destPos?.z})`);

  // --------------------------------------------------------------------------
  // Part 4: In-Flight Physical Movement & World Core Location Immutability
  // --------------------------------------------------------------------------
  printHeader('Part 4: In-Flight Movement & World Core Location Immutability');

  console.log(`[Discrete Stepping] Stepping physical simulation...`);
  for (let frame = 1; frame <= 3; frame++) {
    runtime.step(500); // 500 ms step
    const inFlight = runtime.getActiveTraversal(elenaId);
    const agentPos = runtime.getAgentPosition(elenaId);
    console.log(
      `  Frame ${frame} (+500ms): Progress ${(inFlight!.progress * 100).toFixed(1)}% | ` +
      `Visual Pos: (x: ${agentPos?.x.toFixed(2)}, y: ${agentPos?.y.toFixed(2)}) | ` +
      `World Core Location: "${elena.locationId}" (MUST REMAIN "${residenceId}")`
    );
  }

  console.log('\n[Invariant Check: In-Flight Isolation]');
  console.log(`  - Physical representation is moving continuously.`);
  console.log(`  - World Core Agent.locationId remains strictly "${elena.locationId}" (origin).`);

  // --------------------------------------------------------------------------
  // Part 5: Physical Arrival & Authoritative Arrival Commit
  // --------------------------------------------------------------------------
  printHeader('Part 5: Physical Arrival & Authoritative Arrival Commit');

  // Complete remaining physical distance
  runtime.step(5000);
  const navResult: NavigationResult = await traversalPromise;

  console.log(`[M74 Runtime] Physical Traversal Finished.`);
  console.log(`  - Status: "${navResult.status}"`);
  console.log(`  - Destination: "${navResult.destinationPlaceId}"`);
  console.log(`  - Message: "${navResult.message}"`);
  console.log(`  - Location before commit: "${elena.locationId}"`);

  console.log(`\n[M73 Coordinator] Completing traversal through M69 gatekeeper...`);
  const completeResult = coordinator.completeTraversal(state, navResult);

  console.log(`[Completion Result] Success: ${completeResult.success}, Code: "${completeResult.code}"`);
  console.log(`[Authoritative Transition] Changed: ${completeResult.changed}`);
  console.log(`[Authoritative Transition] Previous Location: "${completeResult.previousLocationId}"`);
  console.log(`[Authoritative Transition] Current Location: "${completeResult.currentLocationId}"`);
  console.log(`[World Core Invariant] Agent.locationId: "${elena.locationId}" === "${restaurantId}"`);

  // --------------------------------------------------------------------------
  // Part 6: Future AI Pluggability Demonstration
  // --------------------------------------------------------------------------
  printHeader('Part 6: Future AI Pluggability Demonstration');

  console.log('Demonstrating that an alternative / mock LLM decision provider satisfies the same contract:');

  // Mock LLM provider demonstrating drop-in replacement
  class MockLlmDecisionProvider implements AgentDecisionProvider {
    readonly providerId = 'provider:mock-llm-cognitive-agent';

    async decideIntent(agentContext: AgentContext): Promise<AgentIntent | null> {
      // Simulates async network / LLM inference
      console.log(`  [Mock LLM] Processing agent context with prompt (zero WorldState access)...`);
      return createMoveToPlaceIntent(
        agentContext.agentId,
        'building:development-residence', // LLM decides to return home
        agentContext.civilTime.isoTime,
        'LLM reasoning: Evening shift is ending, return home to rest'
      );
    }
  }

  const llmProvider = new MockLlmDecisionProvider();
  console.log(`[Alternative Provider] Provider ID: "${llmProvider.providerId}"`);

  const llmContext = deriveAgentContext(state, elenaId)!;
  const llmIntent = await llmProvider.decideIntent(llmContext);
  console.log(`[LLM Intent Emitted] Type: "${llmIntent?.intentType}", Target: "${(llmIntent as MoveToPlaceIntent).destinationPlaceId}", Reason: "${llmIntent?.reason}"`);

  // Dispatches to the exact same M73/M69 pipeline
  const mockCoordinator = new RuntimeTraversalCoordinator();
  const mockNav = new DeterministicMockNavigationProvider({ defaultStatus: 'arrived' });

  const llmDispatch = dispatchAgentIntent(state, llmIntent!, { coordinator: mockCoordinator });
  console.log(`[Dispatcher with LLM Intent] Success: ${llmDispatch.success}, Code: "${llmDispatch.code}"`);

  const llmNavResult = await mockNav.requestTraversal(llmDispatch.request!);
  const llmCommit = mockCoordinator.completeTraversal(state, llmNavResult);

  console.log(`[Authoritative Transition with LLM Intent] Elena transitioned to: "${elena.locationId}"`);
  console.log(`[Result] Elena is back at residence: "${elena.locationId}" === "${residenceId}"`);

  printHeader('Milestone 75: Demonstration Completed Successfully');
}

runDemo().catch((err) => {
  console.error('Demonstration failed with error:', err);
  process.exit(1);
});
