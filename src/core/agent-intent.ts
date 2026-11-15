/**
 * Milestone 75 — Agent Intent & Decision Boundary Foundation
 *
 * Establishes the engine-independent boundary separating Agent Cognition / Decision
 * from Agent Intent, and translates Agent Intent into the existing M73/M74/M69
 * movement and arrival pipeline without granting decision sources authority over World Core.
 *
 * Architectural Invariants (M75):
 * 1. Decision != Authority != Mutation:
 *    - An agent decision is NEVER an authoritative World Core mutation.
 *    - AgentDecisionProvider has ZERO authority, ZERO persistence, and ZERO direct mutation power.
 *    - An agent may propose "I want to go to the restaurant", but CANNOT modify Agent.locationId.
 * 2. Intent as Non-Authoritative Proposal:
 *    - AgentIntent is an ephemeral, non-persistent, engine-independent candidate proposal.
 *    - Contains zero coordinates, transforms, velocities, NavMesh, or physical simulation state.
 *    - Initial vocabulary strictly bounded to 'move-to-place' (and 'idle').
 * 3. Engine-Independent & Pluggable Provider Interface:
 *    - AgentDecisionProvider supports both synchronous deterministic evaluation today
 *      and future asynchronous LLM-backed decision providers without changing World Core.
 * 4. Zero Bypass Around M69/M73/M74:
 *    - MoveToPlaceIntent translates strictly through validateLogicalDestination() ->
 *      createNavigationRequest() -> RuntimeTraversalCoordinator.startTraversal() ->
 *      NavigationProvider.requestTraversal() -> validateArrivalAndCommit() -> transitionAgentLocation().
 *    - Direct bypasses (such as intent -> transitionAgentLocation()) are strictly prohibited.
 * 5. In-Flight Logical Location Immutability:
 *    - Agent.locationId remains strictly the origin location throughout physical traversal.
 *    - Only validated arrival committed through M69 updates Agent.locationId.
 * 6. Schema & Persistence Preservation:
 *    - CURRENT_WORLD_STATE_VERSION remains strictly 18.
 *    - Zero intent or decision state added to WorldState or persisted entities.
 */

import type { WorldState } from './world-state.js';
import type { AgentType } from './entities/agent.js';
import { validateLogicalDestination } from './spatial-contract.js';
import type {
  NavigationRequest,
  NavigationResult,
  NavigationProvider,
} from './navigation-contract.js';
import {
  RuntimeTraversalCoordinator,
  type StartTraversalResult,
  type CompleteTraversalResult,
} from './traversal-coordinator.js';
import type { AgentContext } from './agent-context.js';

// =============================================================================
// 1. Agent Intent Vocabulary & Types
// =============================================================================

export type AgentIntentType = 'move-to-place' | 'idle';

export interface BaseAgentIntent {
  readonly intentId: string;
  readonly agentId: string;
  readonly intentType: AgentIntentType;
  readonly createdAt: string;
  readonly reason?: string;
}

/**
 * Non-authoritative candidate proposal expressing an agent's desire to traverse
 * to a logical destination place (Milestone 75).
 *
 * CRITICAL INVARIANT:
 * Contains ZERO coordinates, transforms, vectors, velocities, or physical traversal state.
 * Is strictly ephemeral and NEVER persisted in WorldState.
 */
export interface MoveToPlaceIntent extends BaseAgentIntent {
  readonly intentType: 'move-to-place';
  readonly destinationPlaceId: string;
}

/**
 * Non-authoritative candidate proposal expressing that an agent has no movement
 * or action to propose at the current evaluation moment (Milestone 75).
 */
export interface IdleIntent extends BaseAgentIntent {
  readonly intentType: 'idle';
}

export type AgentIntent = MoveToPlaceIntent | IdleIntent;

// =============================================================================
// 2. Factory Functions
// =============================================================================

/**
 * Creates an immutable MoveToPlaceIntent proposal (Milestone 75).
 */
export function createMoveToPlaceIntent(
  agentId: string,
  destinationPlaceId: string,
  createdAt: string,
  reason?: string,
  customIntentId?: string
): MoveToPlaceIntent {
  if (!agentId || typeof agentId !== 'string' || agentId.trim() === '') {
    throw new Error('agentId must be a non-empty string');
  }
  if (!destinationPlaceId || typeof destinationPlaceId !== 'string' || destinationPlaceId.trim() === '') {
    throw new Error('destinationPlaceId must be a non-empty string');
  }
  if (!createdAt || typeof createdAt !== 'string' || createdAt.trim() === '') {
    throw new Error('createdAt must be a non-empty string');
  }

  const timestamp = Date.parse(createdAt) || Date.now();
  return Object.freeze({
    intentId: customIntentId ?? `intent:${agentId}:move-to-place:${timestamp}`,
    agentId,
    intentType: 'move-to-place' as const,
    destinationPlaceId,
    createdAt,
    reason,
  });
}

/**
 * Creates an immutable IdleIntent proposal (Milestone 75).
 */
export function createIdleIntent(
  agentId: string,
  createdAt: string,
  reason?: string,
  customIntentId?: string
): IdleIntent {
  if (!agentId || typeof agentId !== 'string' || agentId.trim() === '') {
    throw new Error('agentId must be a non-empty string');
  }
  if (!createdAt || typeof createdAt !== 'string' || createdAt.trim() === '') {
    throw new Error('createdAt must be a non-empty string');
  }

  const timestamp = Date.parse(createdAt) || Date.now();
  return Object.freeze({
    intentId: customIntentId ?? `intent:${agentId}:idle:${timestamp}`,
    agentId,
    intentType: 'idle' as const,
    createdAt,
    reason,
  });
}

// =============================================================================
// 3. Agent Decision Provider Contract
// =============================================================================

/**
 * Engine-independent interface for agent decision sources (Milestone 75).
 *
 * Characteristics:
 * - ZERO authority over WorldState.
 * - ZERO persistence.
 * - ZERO direct state mutation.
 * - ZERO direct navigation execution.
 * - Supports both synchronous deterministic evaluation and future asynchronous LLM-backed decisions.
 */
export interface AgentDecisionProvider {
  readonly providerId: string;

  decideIntent(
    context: AgentContext
  ): Promise<AgentIntent | null> | AgentIntent | null;
}

// =============================================================================
// 4. Deterministic Decision Provider Implementation
// =============================================================================

/**
 * Deterministic agent decision provider leveraging bounded AgentContext (Milestone 76).
 *
 * Pure evaluation:
 * - Reads ONLY bounded AgentContext (specifically scheduledObjective and currentLocation).
 * - Zero access to WorldState, WorldState agents, global schedules, or WorldClock.
 * - Produces MoveToPlaceIntent if the agent needs to move to its scheduled destination.
 * - Produces IdleIntent if the agent is already at its scheduled destination.
 * - Returns null if the context has no scheduledObjective defined.
 * - ZERO state mutation: No world or entity state touched.
 */
export class DeterministicAgentDecisionProvider implements AgentDecisionProvider {
  readonly providerId: string;

  constructor(providerId: string = 'provider:deterministic-npc-decision') {
    this.providerId = providerId;
  }

  public decideIntent(context: AgentContext): AgentIntent | null {
    if (!context || typeof context !== 'object') {
      return null;
    }

    if (!context.scheduledObjective) {
      return null;
    }

    const { targetPlaceId, reason } = context.scheduledObjective;

    // Idempotency: if agent is already at the target destination, return IdleIntent
    if (context.currentLocation.locationId === targetPlaceId) {
      return createIdleIntent(
        context.agentId,
        context.civilTime.isoTime,
        `Already at target location "${targetPlaceId}" for ${reason}`
      );
    }

    // Propose movement to target destination
    return createMoveToPlaceIntent(
      context.agentId,
      targetPlaceId,
      context.civilTime.isoTime,
      reason
    );
  }
}

// =============================================================================
// 5. Intent Translation & Dispatcher Boundary
// =============================================================================

export type DispatchAgentIntentResultCode =
  | 'traversal-started'
  | 'idle-acknowledged'
  | 'agent-not-found'
  | 'invalid-destination'
  | 'already-at-destination'
  | 'coordinator-rejected'
  | 'unsupported-intent';

export interface DispatchAgentIntentSuccess {
  readonly success: true;
  readonly code: 'traversal-started' | 'idle-acknowledged';
  readonly message: string;
  readonly intent: AgentIntent;
  readonly request?: NavigationRequest;
  readonly traversalPromise?: Promise<NavigationResult> | NavigationResult;
}

export interface DispatchAgentIntentFailure {
  readonly success: false;
  readonly code: Exclude<DispatchAgentIntentResultCode, 'traversal-started' | 'idle-acknowledged'>;
  readonly message: string;
  readonly intent: AgentIntent;
}

export type DispatchAgentIntentResult =
  | DispatchAgentIntentSuccess
  | DispatchAgentIntentFailure;

export interface DispatchAgentIntentOptions {
  readonly coordinator: RuntimeTraversalCoordinator;
  readonly currentTime?: string;
  readonly provider?: NavigationProvider;
  readonly customRequestId?: string;
}

/**
 * Translates an AgentIntent into the existing navigation and traversal pipeline (Milestone 75).
 *
 * Sequence for MoveToPlaceIntent:
 * 1. Pre-flight agent existence check.
 * 2. Pre-flight logical destination validation via validateLogicalDestination().
 * 3. Idempotency check: rejects with 'already-at-destination' if agent is already there.
 * 4. Initiates active traversal in M73 RuntimeTraversalCoordinator (without mutating Agent.locationId).
 * 5. Optionally hands off NavigationRequest to NavigationProvider (e.g. M74 PhysicalTraversalRuntime).
 *
 * CRITICAL INVARIANT:
 * Zero direct World Core mutation.
 * Never calls transitionAgentLocation() directly.
 */
export function dispatchAgentIntent(
  state: WorldState,
  intent: AgentIntent,
  options: DispatchAgentIntentOptions
): DispatchAgentIntentResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }
  if (!intent || typeof intent !== 'object') {
    throw new Error('AgentIntent must be provided');
  }
  if (!options || typeof options !== 'object' || !options.coordinator) {
    throw new Error('DispatchAgentIntentOptions with coordinator must be provided');
  }

  // Case 1: IdleIntent
  if (intent.intentType === 'idle') {
    return Object.freeze({
      success: true,
      code: 'idle-acknowledged',
      message: `Idle intent acknowledged for agent "${intent.agentId}": ${intent.reason ?? 'No action proposed'}`,
      intent,
    });
  }

  // Case 2: MoveToPlaceIntent
  if (intent.intentType === 'move-to-place') {
    const agent = state.agents?.find((a) => a.id === intent.agentId);
    if (!agent) {
      return Object.freeze({
        success: false,
        code: 'agent-not-found',
        message: `Agent "${intent.agentId}" not found in world state`,
        intent,
      });
    }

    // Pre-flight destination validation against World Core topology
    const destValidation = validateLogicalDestination(
      state,
      intent.destinationPlaceId,
      agent.locationId,
      agent.agentType
    );

    if (!destValidation.valid) {
      return Object.freeze({
        success: false,
        code: 'invalid-destination',
        message: `Destination "${intent.destinationPlaceId}" is invalid: ${destValidation.message}`,
        intent,
      });
    }

    if (destValidation.code === 'already-at-destination') {
      return Object.freeze({
        success: false,
        code: 'already-at-destination',
        message: `Agent "${intent.agentId}" is already at destination "${intent.destinationPlaceId}"`,
        intent,
      });
    }

    // Initiate active traversal in M73 RuntimeTraversalCoordinator
    const startResult = options.coordinator.startTraversal(
      state,
      intent.agentId,
      intent.destinationPlaceId,
      options.currentTime ?? intent.createdAt,
      options.customRequestId
    );

    if (!startResult.success) {
      return Object.freeze({
        success: false,
        code: 'coordinator-rejected',
        message: `Traversal coordinator rejected request: ${startResult.message}`,
        intent,
      });
    }

    // Optional hand-off to NavigationProvider
    let traversalPromise: Promise<NavigationResult> | NavigationResult | undefined;
    if (options.provider) {
      traversalPromise = options.provider.requestTraversal(startResult.request);
    }

    return Object.freeze({
      success: true,
      code: 'traversal-started',
      message: `Traversal started for agent "${intent.agentId}" from "${agent.locationId}" toward "${intent.destinationPlaceId}"`,
      intent,
      request: startResult.request,
      traversalPromise,
    });
  }

  // Case 3: Unsupported intent type
  return Object.freeze({
    success: false,
    code: 'unsupported-intent',
    message: `Unsupported intent type "${(intent as any).intentType}"`,
    intent,
  });
}

/**
 * Convenience orchestrator executing a MoveToPlaceIntent end-to-end with an asynchronous NavigationProvider.
 *
 * Flow:
 * MoveToPlaceIntent -> M73 startTraversal() -> provider.requestTraversal() ->
 * M73 completeTraversal() -> M69 validateArrivalAndCommit() -> transitionAgentLocation()
 *
 * Reuses M73 executeTraversalWithProvider directly.
 */
export async function executeAgentIntentWithProvider(
  state: WorldState,
  intent: MoveToPlaceIntent,
  coordinator: RuntimeTraversalCoordinator,
  provider: NavigationProvider,
  currentTime?: string,
  customRequestId?: string
): Promise<CompleteTraversalResult> {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }
  if (!intent || typeof intent !== 'object' || intent.intentType !== 'move-to-place') {
    throw new Error('Valid MoveToPlaceIntent must be provided');
  }
  if (!coordinator || typeof coordinator !== 'object') {
    throw new Error('RuntimeTraversalCoordinator must be provided');
  }
  if (!provider || typeof provider !== 'object') {
    throw new Error('NavigationProvider must be provided');
  }

  return coordinator.executeTraversalWithProvider(
    state,
    intent.agentId,
    intent.destinationPlaceId,
    currentTime ?? intent.createdAt,
    provider,
    customRequestId
  );
}
