/**
 * Milestone 69 — Navigation Provider Contract
 *
 * Establishes the engine-independent contract separating the authoritative World Core
 * from external physical navigation systems (e.g., Unity NavMesh, Unreal, 3D engines,
 * headless pathfinders, server-side routers).
 *
 * Architectural Principles (M69):
 * 1. World Core Authority:
 *    The Navigation Provider is NEVER authoritative over WorldState.
 *    It determines whether/how physical traversal occurs and reports the result.
 *    Only the World Core may authorize, revalidate, and commit logical arrivals.
 * 2. Separation of Request, Traversal, and Arrival:
 *    - NavigationRequest: Ephemeral integration object requesting traversal between logical locations.
 *    - Traversal: Physical path execution handled externally by the NavigationProvider.
 *    - Arrival: Provider reports physical traversal completion; does NOT mutate WorldState directly.
 * 3. Arrival Revalidation:
 *    Arrival must be revalidated against live WorldState before committing transitionAgentLocation().
 *    Stale origins, stale destinations, and identity mismatches are strictly rejected.
 * 4. Engine Independence:
 *    Zero coupling to Unity, NavMesh, coordinates, vectors, transforms, or 3D physics.
 */

import type { AgentType } from './entities/agent.js';
import type { SpatialFailureCategory } from './spatial-contract.js';
import { validateLogicalDestination } from './spatial-contract.js';
import { transitionAgentLocation, type WorldState } from './world-state.js';

/**
 * Ephemeral request asking an external navigation system to determine whether physical
 * traversal from authoritative origin to authoritative destination can be executed (Milestone 69).
 *
 * NOTE: This is an integration object, NOT persistent WorldState.
 */
export interface NavigationRequest {
  readonly requestId: string;
  readonly agentId: string;
  readonly originPlaceId: string;
  readonly destinationPlaceId: string;
  readonly requestedAt: string;
  readonly agentType: AgentType;
}

/**
 * Outcome status reported by a NavigationProvider.
 */
export type NavigationStatus =
  | 'accepted'
  | 'route-unavailable'
  | 'traversal-interrupted'
  | 'traversal-failed'
  | 'arrived';

/**
 * Result reported by a NavigationProvider upon traversal completion, failure, or interruption.
 *
 * Important: An 'arrived' status indicates the physical representation reached the destination;
 * it does NOT mutate WorldState directly.
 */
export interface NavigationResult {
  readonly requestId: string;
  readonly agentId: string;
  readonly destinationPlaceId: string;
  readonly status: NavigationStatus;
  readonly completedAt: string;
  readonly failureCategory?: SpatialFailureCategory;
  readonly message: string;
}

/**
 * Engine-independent interface for external navigation systems (Milestone 69).
 *
 * The provider:
 * - Receives an immutable NavigationRequest.
 * - Performs physical routing/traversal externally.
 * - Returns a NavigationResult.
 * - NEVER calls transitionAgentLocation() directly.
 * - NEVER mutates WorldState.
 */
export interface NavigationProvider {
  readonly providerId: string;

  requestTraversal(
    request: NavigationRequest
  ): Promise<NavigationResult> | NavigationResult;
}

export type CreateNavigationRequestResultCode =
  | 'success'
  | 'agent-not-found'
  | 'invalid-destination'
  | 'already-at-destination'
  | 'invalid-target-format';

export interface CreateNavigationRequestSuccess {
  readonly success: true;
  readonly code: 'success';
  readonly message: string;
  readonly request: NavigationRequest;
}

export interface CreateNavigationRequestFailure {
  readonly success: false;
  readonly code: Exclude<CreateNavigationRequestResultCode, 'success'>;
  readonly message: string;
  readonly failureCategory?: SpatialFailureCategory;
}

export type CreateNavigationRequestResult =
  | CreateNavigationRequestSuccess
  | CreateNavigationRequestFailure;

/**
 * Pure factory creating a validated, immutable NavigationRequest (Milestone 69).
 *
 * Preconditions:
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found').
 * 2. Destination is validated through the M68 spatial contract (validateLogicalDestination).
 * 3. Captures current authoritative origin (agent.locationId) and World Time.
 * 4. Zero state mutation.
 */
export function createNavigationRequest(
  state: WorldState,
  agentId: string,
  destinationPlaceId: string,
  currentTime: string,
  customRequestId?: string
): CreateNavigationRequestResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }

  const agent = state.agents?.find((a) => a.id === agentId);
  if (!agent) {
    return Object.freeze({
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      failureCategory: 'invalid-destination',
    });
  }

  const destValidation = validateLogicalDestination(
    state,
    destinationPlaceId,
    agent.locationId,
    agent.agentType
  );

  if (!destValidation.valid) {
    return Object.freeze({
      success: false,
      code: destValidation.code === 'invalid-target-format' ? 'invalid-target-format' : 'invalid-destination',
      message: destValidation.message,
      failureCategory: 'invalid-destination',
    });
  }

  if (destValidation.code === 'already-at-destination') {
    return Object.freeze({
      success: false,
      code: 'already-at-destination',
      message: `Agent "${agentId}" is already at destination "${destinationPlaceId}"`,
    });
  }

  const requestId =
    customRequestId ??
    `nav-req:${agent.id}:${destinationPlaceId}:${Date.parse(currentTime) || 0}`;

  const request: NavigationRequest = Object.freeze({
    requestId,
    agentId: agent.id,
    originPlaceId: agent.locationId,
    destinationPlaceId,
    requestedAt: currentTime,
    agentType: agent.agentType,
  });

  return Object.freeze({
    success: true,
    code: 'success',
    message: `Navigation request created for agent "${agent.id}" toward "${destinationPlaceId}"`,
    request,
  });
}

export type ValidateArrivalAndCommitResultCode =
  | 'success'
  | 'already-at-destination'
  | 'invalid-status'
  | 'request-result-mismatch'
  | 'agent-not-found'
  | 'destination-not-found'
  | 'stale-origin'
  | 'transition-failed';

export interface ValidateArrivalAndCommitSuccess {
  readonly success: true;
  readonly code: 'success' | 'already-at-destination';
  readonly message: string;
  readonly agentId: string;
  readonly previousLocationId: string;
  readonly currentLocationId: string;
  readonly changed: boolean;
}

export interface ValidateArrivalAndCommitFailure {
  readonly success: false;
  readonly code: Exclude<ValidateArrivalAndCommitResultCode, 'success' | 'already-at-destination'>;
  readonly message: string;
  readonly agentId: string;
  readonly previousLocationId?: string;
  readonly currentLocationId?: string;
  readonly changed: false;
}

export type ValidateArrivalAndCommitResult =
  | ValidateArrivalAndCommitSuccess
  | ValidateArrivalAndCommitFailure;

/**
 * Authoritative World Core arrival gatekeeper (Milestone 69).
 *
 * Verifies live world conditions before authorizing transitionAgentLocation():
 * A. Result status must be 'arrived'.
 * B. Request and Result identity must match (requestId, agentId, destinationPlaceId).
 * C. Agent must still exist in authoritative WorldState.
 * D. Destination must still exist and be topologically valid.
 * E. Stale origin protection: agent.locationId must match request.originPlaceId.
 * F. Idempotency: if agent is already at destinationPlaceId, returns changed: false cleanly.
 * G. Commit: only on full validation does World Core call transitionAgentLocation().
 *
 * Invariant: ZERO state mutation if any validation check fails.
 */
export function validateArrivalAndCommit(
  state: WorldState,
  request: NavigationRequest,
  result: NavigationResult
): ValidateArrivalAndCommitResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }

  // A. Result status check
  if (result.status !== 'arrived') {
    return Object.freeze({
      success: false,
      code: 'invalid-status',
      message: `Cannot commit arrival: Navigation status is "${result.status}", expected "arrived"`,
      agentId: request.agentId,
      changed: false,
    });
  }

  // B. Identity match verification
  if (
    request.requestId !== result.requestId ||
    request.agentId !== result.agentId ||
    request.destinationPlaceId !== result.destinationPlaceId
  ) {
    return Object.freeze({
      success: false,
      code: 'request-result-mismatch',
      message: `Navigation request and result identities do not match (requestId: "${request.requestId}" vs "${result.requestId}", agentId: "${request.agentId}" vs "${result.agentId}", destination: "${request.destinationPlaceId}" vs "${result.destinationPlaceId}")`,
      agentId: request.agentId,
      changed: false,
    });
  }

  // C. Agent existence verification
  const agent = state.agents?.find((a) => a.id === request.agentId);
  if (!agent) {
    return Object.freeze({
      success: false,
      code: 'agent-not-found',
      message: `Agent "${request.agentId}" not found in current world state`,
      agentId: request.agentId,
      changed: false,
    });
  }

  // F. Idempotency check: Agent already at destination
  if (agent.locationId === request.destinationPlaceId) {
    return Object.freeze({
      success: true,
      code: 'already-at-destination',
      message: `Agent "${agent.id}" is already at destination "${request.destinationPlaceId}"`,
      agentId: agent.id,
      previousLocationId: agent.locationId,
      currentLocationId: agent.locationId,
      changed: false,
    });
  }

  // E. Stale origin protection: Agent location moved while traversal was ongoing
  if (agent.locationId !== request.originPlaceId) {
    return Object.freeze({
      success: false,
      code: 'stale-origin',
      message: `Stale navigation request: Current agent location "${agent.locationId}" differs from request origin "${request.originPlaceId}"`,
      agentId: agent.id,
      previousLocationId: agent.locationId,
      currentLocationId: agent.locationId,
      changed: false,
    });
  }

  // D. Revalidate destination existence and validity against current WorldState
  const destValidation = validateLogicalDestination(
    state,
    request.destinationPlaceId,
    agent.locationId,
    agent.agentType
  );

  if (!destValidation.valid) {
    return Object.freeze({
      success: false,
      code: 'destination-not-found',
      message: `Destination "${request.destinationPlaceId}" is no longer valid in current world state: ${destValidation.message}`,
      agentId: agent.id,
      previousLocationId: agent.locationId,
      currentLocationId: agent.locationId,
      changed: false,
    });
  }

  // G. Authoritative transition commit
  const previousLocationId = agent.locationId;
  try {
    transitionAgentLocation(state, agent.id, request.destinationPlaceId);
    return Object.freeze({
      success: true,
      code: 'success',
      message: `Authoritative arrival committed: Agent "${agent.id}" transitioned from "${previousLocationId}" to "${request.destinationPlaceId}"`,
      agentId: agent.id,
      previousLocationId,
      currentLocationId: agent.locationId,
      changed: true,
    });
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return Object.freeze({
      success: false,
      code: 'transition-failed',
      message: `Authoritative transition failed: ${errMessage}`,
      agentId: agent.id,
      previousLocationId,
      currentLocationId: agent.locationId,
      changed: false,
    });
  }
}

/**
 * Deterministic mock navigation provider for testing and demonstration (Milestone 69).
 *
 * Supports pre-configured or rule-based outcomes without coordinates, NavMesh,
 * pathfinding, timers, or background loops.
 */
export class DeterministicMockNavigationProvider implements NavigationProvider {
  public readonly providerId: string;
  private readonly defaultStatus: NavigationStatus;
  private readonly responsesByDestination: Map<string, NavigationStatus>;
  private readonly responsesByAgent: Map<string, NavigationStatus>;
  private shouldThrow: boolean = false;
  private throwError: Error = new Error('Mock navigation provider hardware failure');

  constructor(
    providerId: string = 'mock-navigation-provider',
    defaultStatus: NavigationStatus = 'arrived'
  ) {
    this.providerId = providerId;
    this.defaultStatus = defaultStatus;
    this.responsesByDestination = new Map();
    this.responsesByAgent = new Map();
  }

  public setDestinationStatus(destinationPlaceId: string, status: NavigationStatus): this {
    this.responsesByDestination.set(destinationPlaceId, status);
    return this;
  }

  public setAgentStatus(agentId: string, status: NavigationStatus): this {
    this.responsesByAgent.set(agentId, status);
    return this;
  }

  public setThrowOnRequest(shouldThrow: boolean, error?: Error): this {
    this.shouldThrow = shouldThrow;
    if (error) this.throwError = error;
    return this;
  }

  public requestTraversal(request: NavigationRequest): NavigationResult {
    if (this.shouldThrow) {
      throw this.throwError;
    }

    const status =
      this.responsesByAgent.get(request.agentId) ??
      this.responsesByDestination.get(request.destinationPlaceId) ??
      this.defaultStatus;

    const completedAt = request.requestedAt;
    const failureCategory =
      status === 'route-unavailable' ? 'unreachable-destination' : undefined;

    let message: string;
    switch (status) {
      case 'arrived':
        message = `Physical traversal completed to destination "${request.destinationPlaceId}"`;
        break;
      case 'route-unavailable':
        message = `Physical route unavailable to destination "${request.destinationPlaceId}"`;
        break;
      case 'traversal-interrupted':
        message = `Physical traversal interrupted en route to "${request.destinationPlaceId}"`;
        break;
      case 'traversal-failed':
        message = `Physical traversal failed due to obstacle or collision`;
        break;
      case 'accepted':
        message = `Traversal request accepted for processing`;
        break;
    }

    return Object.freeze({
      requestId: request.requestId,
      agentId: request.agentId,
      destinationPlaceId: request.destinationPlaceId,
      status,
      completedAt,
      failureCategory,
      message,
    });
  }
}
