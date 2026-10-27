/**
 * Milestone 73 — Runtime Traversal Coordinator
 *
 * Engine-independent runtime orchestration for in-flight physical traversal
 * and authoritative arrival delegation.
 *
 * Architectural Invariants (M73):
 * 1. World Truth != Runtime Traversal State != Physical Transform:
 *    - Agent.locationId in WorldState is the SOLE authoritative logical location.
 *    - In-flight traversal MUST NOT modify Agent.locationId.
 *    - Coordinates, transforms, vectors, velocities, and physics are strictly outside World Core.
 * 2. Runtime Orchestration Only:
 *    - RuntimeTraversalCoordinator is purely in-memory runtime orchestration state.
 *    - It is NOT part of WorldState, NOT persisted, and NOT serialized.
 *    - WorldState schema version remains strictly 18.
 * 3. Single Active Traversal Per Agent:
 *    - An agent may have at most ONE active traversal at any point in time.
 *    - Initiating a new traversal supersedes and invalidates any prior in-flight traversal.
 * 4. Stale & Superseded Result Invalidation:
 *    - Traversal results for superseded or cancelled requests CANNOT commit.
 * 5. Revalidation and Arrival Authority:
 *    - Only the existing World Core arrival gatekeeper (validateArrivalAndCommit)
 *      can commit logical arrival via transitionAgentLocation().
 *    - The coordinator never directly mutates Agent.locationId.
 */

import type { WorldState } from './world-state.js';
import type {
  NavigationRequest,
  NavigationResult,
  NavigationProvider,
} from './navigation-contract.js';
import {
  createNavigationRequest,
  validateArrivalAndCommit,
} from './navigation-contract.js';

/**
 * In-memory runtime record representing an active in-flight traversal (Milestone 73).
 *
 * CRITICAL INVARIANT:
 * This is transient runtime orchestration state, NOT persistent WorldState.
 * It contains zero coordinates, transforms, vectors, or physical simulation state.
 */
export interface ActiveTraversal {
  readonly request: NavigationRequest;
  readonly startedAt: string;
}

export type StartTraversalResultCode =
  | 'success'
  | 'agent-not-found'
  | 'invalid-destination'
  | 'already-at-destination'
  | 'invalid-target-format';

export interface StartTraversalSuccess {
  readonly success: true;
  readonly code: 'success';
  readonly message: string;
  readonly request: NavigationRequest;
  readonly supersededRequestId?: string;
}

export interface StartTraversalFailure {
  readonly success: false;
  readonly code: Exclude<StartTraversalResultCode, 'success'>;
  readonly message: string;
}

export type StartTraversalResult =
  | StartTraversalSuccess
  | StartTraversalFailure;

export interface CancelTraversalResult {
  readonly success: boolean;
  readonly message: string;
  readonly cancelledRequestId?: string;
  readonly reason?: string;
}

export type CompleteTraversalResultCode =
  | 'success'
  | 'already-at-destination'
  | 'no-active-traversal'
  | 'stale-request'
  | 'traversal-failed'
  | 'traversal-interrupted'
  | 'route-unavailable'
  | 'invalid-status'
  | 'request-result-mismatch'
  | 'agent-not-found'
  | 'destination-not-found'
  | 'stale-origin'
  | 'transition-failed';

export interface CompleteTraversalSuccess {
  readonly success: true;
  readonly code: 'success' | 'already-at-destination';
  readonly message: string;
  readonly agentId: string;
  readonly previousLocationId: string;
  readonly currentLocationId: string;
  readonly changed: boolean;
  readonly completedRequestId: string;
}

export interface CompleteTraversalFailure {
  readonly success: false;
  readonly code: Exclude<CompleteTraversalResultCode, 'success' | 'already-at-destination'>;
  readonly message: string;
  readonly agentId: string;
  readonly previousLocationId?: string;
  readonly currentLocationId?: string;
  readonly changed: false;
  readonly rejectedRequestId?: string;
}

export type CompleteTraversalResult =
  | CompleteTraversalSuccess
  | CompleteTraversalFailure;

/**
 * Runtime coordinator managing active traversal lifecycles (Milestone 73).
 *
 * Responsibilities:
 * - Tracks 0 or 1 active traversal per agent.
 * - Supersedes prior in-flight traversals when a new movement is initiated.
 * - Rejects stale, cancelled, or superseded results.
 * - Leaves WorldState.agents.locationId strictly untouched during traversal.
 * - Delegates arrival validation to M69 validateArrivalAndCommit().
 */
export class RuntimeTraversalCoordinator {
  private readonly activeTraversals = new Map<string, ActiveTraversal>();

  /**
   * Starts a new traversal for an agent.
   *
   * 1. Validates destination and creates NavigationRequest via M69 createNavigationRequest.
   * 2. If an active traversal already exists for this agent, supersedes it.
   * 3. Registers the new request as active.
   * 4. Leaves WorldState.agents.locationId strictly unchanged.
   */
  public startTraversal(
    state: WorldState,
    agentId: string,
    destinationPlaceId: string,
    currentTime: string,
    customRequestId?: string
  ): StartTraversalResult {
    if (!state || typeof state !== 'object') {
      throw new Error('WorldState must be provided');
    }

    // 1. Validate and create request using existing M69 contract
    const reqResult = createNavigationRequest(
      state,
      agentId,
      destinationPlaceId,
      currentTime,
      customRequestId
    );

    if (!reqResult.success) {
      return Object.freeze({
        success: false,
        code: reqResult.code,
        message: reqResult.message,
      });
    }

    // 2. Check if agent already has an active traversal; if so, supersede it
    const existing = this.activeTraversals.get(agentId);
    let supersededRequestId: string | undefined;

    if (existing) {
      supersededRequestId = existing.request.requestId;
      this.activeTraversals.delete(agentId);
    }

    // 3. Register the new active traversal
    const activeTraversal: ActiveTraversal = Object.freeze({
      request: reqResult.request,
      startedAt: currentTime,
    });
    this.activeTraversals.set(agentId, activeTraversal);

    // 4. Return success (Agent.locationId remains strictly unchanged in WorldState)
    return Object.freeze({
      success: true,
      code: 'success',
      message: `Active traversal registered for agent "${agentId}" toward "${destinationPlaceId}"`,
      request: reqResult.request,
      supersededRequestId,
    });
  }

  /**
   * Completes a traversal based on an emitted NavigationResult.
   *
   * 1. Locates the active traversal for result.agentId.
   * 2. Rejects if no active traversal exists or if requestId does not match (stale/superseded).
   * 3. For non-arrival status (route-unavailable, traversal-interrupted, traversal-failed),
   *    clears active traversal with ZERO state mutation.
   * 4. For 'arrived' status, delegates to M69 validateArrivalAndCommit().
   * 5. Cleans up active traversal upon resolution.
   */
  public completeTraversal(
    state: WorldState,
    result: NavigationResult
  ): CompleteTraversalResult {
    if (!state || typeof state !== 'object') {
      throw new Error('WorldState must be provided');
    }
    if (!result || typeof result !== 'object') {
      throw new Error('NavigationResult must be provided');
    }

    const agentId = result.agentId;
    const active = this.activeTraversals.get(agentId);

    // 1. Must have an active traversal
    if (!active) {
      return Object.freeze({
        success: false,
        code: 'no-active-traversal',
        message: `No active traversal found for agent "${agentId}"`,
        agentId,
        changed: false,
        rejectedRequestId: result.requestId,
      });
    }

    // 2. Request identity must match active request (superseded/stale protection)
    if (result.requestId !== active.request.requestId) {
      return Object.freeze({
        success: false,
        code: 'stale-request',
        message: `Result requestId "${result.requestId}" does not match currently active requestId "${active.request.requestId}" for agent "${agentId}"`,
        agentId,
        changed: false,
        rejectedRequestId: result.requestId,
      });
    }

    // 3. Handle non-arrival outcomes (provider failure or interruption)
    if (result.status !== 'arrived') {
      // Invalidate active traversal because it failed or was interrupted externally
      this.activeTraversals.delete(agentId);

      let failureCode: CompleteTraversalResultCode;
      switch (result.status) {
        case 'route-unavailable':
          failureCode = 'route-unavailable';
          break;
        case 'traversal-interrupted':
          failureCode = 'traversal-interrupted';
          break;
        case 'traversal-failed':
          failureCode = 'traversal-failed';
          break;
        default:
          failureCode = 'invalid-status';
          break;
      }

      const agent = state.agents?.find((a) => a.id === agentId);
      return Object.freeze({
        success: false,
        code: failureCode,
        message: `Traversal did not arrive: Provider reported status "${result.status}" (${result.message})`,
        agentId,
        previousLocationId: agent?.locationId,
        currentLocationId: agent?.locationId,
        changed: false,
        rejectedRequestId: result.requestId,
      });
    }

    // 4. Delegate to existing M69 arrival gatekeeper
    const commitResult = validateArrivalAndCommit(state, active.request, result);

    // 5. Clean up active traversal upon completion (whether commit succeeded or failed due to stale origin)
    this.activeTraversals.delete(agentId);

    if (commitResult.success) {
      return Object.freeze({
        success: true,
        code: commitResult.code,
        message: commitResult.message,
        agentId: commitResult.agentId,
        previousLocationId: commitResult.previousLocationId,
        currentLocationId: commitResult.currentLocationId,
        changed: commitResult.changed,
        completedRequestId: active.request.requestId,
      });
    }

    return Object.freeze({
      success: false,
      code: commitResult.code,
      message: commitResult.message,
      agentId: commitResult.agentId,
      previousLocationId: commitResult.previousLocationId,
      currentLocationId: commitResult.currentLocationId,
      changed: false,
      rejectedRequestId: active.request.requestId,
    });
  }

  /**
   * Cancels the active traversal for an agent.
   *
   * Affects only runtime orchestration state. ZERO mutation to WorldState.
   */
  public cancelTraversal(agentId: string, reason?: string): CancelTraversalResult {
    const active = this.activeTraversals.get(agentId);
    if (!active) {
      return Object.freeze({
        success: false,
        message: `No active traversal found to cancel for agent "${agentId}"`,
      });
    }

    const cancelledRequestId = active.request.requestId;
    this.activeTraversals.delete(agentId);

    return Object.freeze({
      success: true,
      message: `Active traversal for agent "${agentId}" cancelled: ${reason ?? 'User or system interruption'}`,
      cancelledRequestId,
      reason,
    });
  }

  /**
   * Returns the active traversal record for an agent, if any.
   */
  public getActiveTraversal(agentId: string): ActiveTraversal | undefined {
    return this.activeTraversals.get(agentId);
  }

  /**
   * Returns true if an agent currently has an active traversal in progress.
   */
  public hasActiveTraversal(agentId: string): boolean {
    return this.activeTraversals.has(agentId);
  }

  /**
   * Returns all currently active traversals across all agents.
   */
  public getAllActiveTraversals(): readonly ActiveTraversal[] {
    return Array.from(this.activeTraversals.values());
  }

  /**
   * Clears all active runtime traversals (e.g. on session reset or server reinitialization).
   */
  public clear(): void {
    this.activeTraversals.clear();
  }

  /**
   * Convenience orchestrator integrating an external NavigationProvider with the coordinator.
   *
   * 1. Starts traversal via startTraversal().
   * 2. Delegates physical execution to provider.requestTraversal().
   * 3. Completes traversal via completeTraversal().
   */
  public async executeTraversalWithProvider(
    state: WorldState,
    agentId: string,
    destinationPlaceId: string,
    currentTime: string,
    provider: NavigationProvider,
    customRequestId?: string
  ): Promise<CompleteTraversalResult> {
    const startResult = this.startTraversal(
      state,
      agentId,
      destinationPlaceId,
      currentTime,
      customRequestId
    );

    if (!startResult.success) {
      const agent = state.agents?.find((a) => a.id === agentId);
      if (startResult.code === 'already-at-destination') {
        return Object.freeze({
          success: true,
          code: 'already-at-destination',
          message: startResult.message,
          agentId,
          previousLocationId: agent?.locationId ?? destinationPlaceId,
          currentLocationId: agent?.locationId ?? destinationPlaceId,
          changed: false,
          completedRequestId: customRequestId ?? 'already-at-destination',
        });
      }

      return Object.freeze({
        success: false,
        code: startResult.code === 'agent-not-found'
          ? 'agent-not-found'
          : 'destination-not-found',
        message: startResult.message,
        agentId,
        previousLocationId: agent?.locationId,
        currentLocationId: agent?.locationId,
        changed: false,
        rejectedRequestId: customRequestId,
      });
    }

    const navResult = await provider.requestTraversal(startResult.request);
    return this.completeTraversal(state, navResult);
  }
}
