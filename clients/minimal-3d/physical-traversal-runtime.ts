/**
 * Milestone 74 — Physical Traversal Runtime Integration
 *
 * Engine-independent physical traversal runtime executing time-spanning movement
 * across client-side 3D transforms and reporting arrival to M73 RuntimeTraversalCoordinator.
 *
 * Architectural Invariants (M74):
 * 1. World Truth != Runtime Traversal State != Physical Transform:
 *    - Agent.locationId in WorldState is the SOLE authoritative logical location.
 *    - In-flight traversal MUST NOT modify Agent.locationId or WorldState.
 *    - Coordinates, transforms, velocities, and interpolation exist strictly on the client side.
 * 2. Implements NavigationProvider:
 *    - Reuses the existing M69 NavigationProvider interface.
 *    - requestTraversal() returns a Promise<NavigationResult> that stays pending across frames/steps.
 * 3. Time-Spanning Movement:
 *    - Traversal takes multiple steps over time; never teleports instantaneously.
 *    - Deterministic step(deltaTimeMs) allows test execution without wall clocks or setInterval.
 * 4. Arrival Detection & Authoritative Delegation:
 *    - Arrival detection is a client-side observation (distance <= arrivalThreshold).
 *    - Produces a NavigationResult with status 'arrived'.
 *    - Does NOT mutate WorldState directly; delegates to M73 completeTraversal().
 * 5. Clean Cancellation and Supersession:
 *    - If an active traversal is superseded or cancelled, its pending Promise resolves cleanly
 *      with 'traversal-interrupted', preventing leaks and stale commits.
 * 6. Replaceable Engine Boundary:
 *    - This runtime can be replaced by a future Unity/Unreal NavMesh agent without touching World Core.
 */

import type {
  NavigationProvider,
  NavigationRequest,
  NavigationResult,
  NavigationStatus,
} from '../../src/core/navigation-contract.js';
import type { Vector3, Scene3D } from './scene-3d.js';
import type { Minimal3DClient } from './minimal-3d-client.js';
import type { PhysicalMappingRegistry } from '../../src/core/physical-mapping.js';

export interface PhysicalTraversalRuntimeOptions {
  /**
   * Unique identifier for this provider implementation (defaults to 'provider:minimal-3d-traversal').
   */
  providerId?: string;

  /**
   * Reference to the Minimal3DClient instance (optional, for scene access).
   */
  client?: Minimal3DClient;

  /**
   * Direct reference to Scene3D (optional, can be passed directly or extracted from client).
   */
  scene?: Scene3D;

  /**
   * Optional reference to M70 PhysicalMappingRegistry for semantic anchor lookup.
   */
  registry?: PhysicalMappingRegistry;

  /**
   * Traversal movement speed in world units per second (defaults to 8.0).
   */
  speed?: number;

  /**
   * Fixed duration in milliseconds for traversals (if set, overrides distance-based duration).
   */
  durationMs?: number;

  /**
   * Distance threshold in world units to detect arrival (defaults to 0.1).
   */
  arrivalThreshold?: number;

  /**
   * Custom coordinate resolver for destinations (optional).
   */
  destinationResolver?: (destinationPlaceId: string, agentId?: string) => Vector3 | undefined;

  /**
   * Custom multi-waypoint route resolver for navigation graph paths (Milestone 80).
   */
  routeResolver?: (
    request: NavigationRequest,
    origin: Vector3,
    destination: Vector3
  ) => readonly Vector3[] | undefined;
}

/**
 * In-flight physical traversal tracking record (client-runtime local).
 */
export interface InFlightPhysicalTraversal {
  readonly request: NavigationRequest;
  readonly origin: Vector3;
  readonly destination: Vector3;
  readonly waypoints?: readonly Vector3[];
  readonly totalDistance: number;
  readonly totalDurationMs: number;
  elapsedMs: number;
  progress: number;
  currentPosition: Vector3;
  readonly resolve: (result: NavigationResult) => void;
  isCompleted: boolean;
}

/**
 * Client-side physical traversal runtime implementing M69 NavigationProvider.
 */
export class PhysicalTraversalRuntime implements NavigationProvider {
  readonly providerId: string;
  private readonly scene?: Scene3D;
  private readonly registry?: PhysicalMappingRegistry;
  private readonly speed: number;
  private readonly fixedDurationMs?: number;
  private readonly arrivalThreshold: number;
  private readonly customResolver?: (destinationPlaceId: string, agentId?: string) => Vector3 | undefined;
  private readonly routeResolver?: (
    request: NavigationRequest,
    origin: Vector3,
    destination: Vector3
  ) => readonly Vector3[] | undefined;

  private readonly activeTraversals = new Map<string, InFlightPhysicalTraversal>();
  private readonly anchorCoordinates = new Map<string, Vector3>();
  private readonly lastKnownPositions = new Map<string, Vector3>();

  constructor(options: PhysicalTraversalRuntimeOptions = {}) {
    this.providerId = options.providerId ?? 'provider:minimal-3d-traversal';
    this.scene = options.scene ?? options.client?.getScene();
    this.registry = options.registry;
    this.speed = typeof options.speed === 'number' && options.speed > 0 ? options.speed : 8.0;
    this.fixedDurationMs = options.durationMs;
    this.arrivalThreshold =
      typeof options.arrivalThreshold === 'number' && options.arrivalThreshold >= 0
        ? options.arrivalThreshold
        : 0.1;
    this.customResolver = options.destinationResolver;
    this.routeResolver = options.routeResolver;
  }

  /**
   * Registers a client-side 3D coordinate for a semantic place or anchor ID.
   */
  public registerAnchorCoordinate(placeOrAnchorId: string, coordinate: Vector3): this {
    if (!placeOrAnchorId || typeof coordinate !== 'object') {
      throw new Error('Valid placeOrAnchorId and coordinate required');
    }
    this.anchorCoordinates.set(placeOrAnchorId, { ...coordinate });
    return this;
  }

  /**
   * Resolves a logical destination to a client-side 3D coordinate in presentation space.
   */
  public resolveDestination(destinationPlaceId: string, agentId?: string): Vector3 | undefined {
    // 1. Explicit registered coordinate
    if (this.anchorCoordinates.has(destinationPlaceId)) {
      return { ...this.anchorCoordinates.get(destinationPlaceId)! };
    }

    // 2. Custom resolver function if provided
    if (this.customResolver) {
      const custom = this.customResolver(destinationPlaceId, agentId);
      if (custom) return { ...custom };
    }

    // 3. Scene3D node lookup if scene provided
    if (this.scene) {
      // Check known semantic entrance door anchors in Scene3D
      if (destinationPlaceId === 'building:development-building') {
        const door = this.scene.getNode('node:anchor:commercial-door');
        if (door) return door.getWorldPosition();
      }
      if (destinationPlaceId === 'building:development-residence') {
        const door = this.scene.getNode('node:anchor:residence-door');
        if (door) return door.getWorldPosition();
      }

      const entityNode = this.scene.getNodeByEntityId(destinationPlaceId);
      if (entityNode) return entityNode.getWorldPosition();

      const directNode =
        this.scene.getNode(destinationPlaceId) ??
        this.scene.getNode(`node:${destinationPlaceId}`);
      if (directNode) return directNode.getWorldPosition();
    }

    // 4. M70 PhysicalMappingRegistry if provided
    if (this.registry) {
      const anchors = this.registry.getAnchorsForWorldEntity(destinationPlaceId);
      for (const a of anchors) {
        if (this.anchorCoordinates.has(a.anchorId)) {
          return { ...this.anchorCoordinates.get(a.anchorId)! };
        }
      }
    }

    // 5. Default semantic coordinates for prototype seed entities
    switch (destinationPlaceId) {
      case 'building:development-building':
      case 'anchor:commercial-door':
        return { x: -8, y: 1.75, z: 0 };
      case 'building:development-residence':
      case 'anchor:residence-door':
      case 'anchor:residence-entrance':
        return { x: 10, y: 1.5, z: 0 };
      case 'street:development-street':
        return { x: 0, y: 1, z: 0 };
      case 'street:avenida-juarez':
        return { x: 25, y: 1, z: 0 };
      case 'restaurant:development-restaurant':
        return { x: -16, y: 2.5, z: 0 };
      default:
        return undefined;
    }
  }

  /**
   * Retrieves the current 3D position of an agent in the presentation layer.
   */
  public getAgentPosition(agentId: string): Vector3 | undefined {
    // Check if an in-flight traversal already tracks this agent's position
    const active = this.activeTraversals.get(agentId);
    if (active) {
      return { ...active.currentPosition };
    }

    // Check last known physical position
    const lastKnown = this.lastKnownPositions.get(agentId);
    if (lastKnown) {
      return { ...lastKnown };
    }

    // Check scene node
    if (this.scene) {
      const node =
        this.scene.getNodeByEntityId(agentId) ??
        this.scene.getNode(agentId) ??
        (agentId === 'agent:dev-player' ? this.scene.getNode('node:player') : undefined) ??
        (agentId === 'agent:dev-npc' ? this.scene.getNode('node:npc') : undefined);
      if (node) {
        return node.getWorldPosition();
      }
    }

    return undefined;
  }

  /**
   * Updates an agent's visual transform in Scene3D.
   */
  private updateNodePosition(agentId: string, position: Vector3): void {
    if (!this.scene) return;

    const node =
      this.scene.getNodeByEntityId(agentId) ??
      this.scene.getNode(agentId) ??
      (agentId === 'agent:dev-player' ? this.scene.getNode('node:player') : undefined) ??
      (agentId === 'agent:dev-npc' ? this.scene.getNode('node:npc') : undefined);

    if (node) {
      node.transform.position.x = position.x;
      node.transform.position.y = position.y;
      node.transform.position.z = position.z;
    }
  }

  /**
   * Initiates a physical traversal in response to an authoritative NavigationRequest.
   *
   * Implements NavigationProvider contract (Milestone 69).
   *
   * 1. Supersedes and terminates any existing in-flight traversal for this agent.
   * 2. Resolves destination to a client-side 3D coordinate.
   * 3. Captures current physical origin.
   * 4. Returns a pending Promise<NavigationResult> that resolves when arrival or interruption occurs.
   */
  public requestTraversal(request: NavigationRequest): Promise<NavigationResult> {
    if (!request || typeof request !== 'object') {
      throw new Error('NavigationRequest must be provided');
    }

    const agentId = request.agentId;

    // 1. Supersession: Cancel any prior active physical traversal for this agent
    const existing = this.activeTraversals.get(agentId);
    if (existing) {
      existing.isCompleted = true;
      this.activeTraversals.delete(agentId);

      // Resolve old promise cleanly with 'traversal-interrupted' to prevent hanging promises
      existing.resolve(
        Object.freeze({
          requestId: existing.request.requestId,
          agentId: existing.request.agentId,
          destinationPlaceId: existing.request.destinationPlaceId,
          status: 'traversal-interrupted',
          completedAt: request.requestedAt,
          message: `Physical traversal superseded by request "${request.requestId}"`,
        })
      );
    }

    // 2. Resolve destination coordinate
    const destination = this.resolveDestination(request.destinationPlaceId, agentId);
    if (!destination) {
      return Promise.resolve(
        Object.freeze({
          requestId: request.requestId,
          agentId,
          destinationPlaceId: request.destinationPlaceId,
          status: 'route-unavailable',
          failureCategory: 'unreachable-destination',
          completedAt: request.requestedAt,
          message: `Physical destination could not be resolved for "${request.destinationPlaceId}"`,
        })
      );
    }

    // 3. Capture origin coordinate
    const origin = this.getAgentPosition(agentId) ?? { x: 0, y: 1, z: 0 };

    // 4. Calculate distance and duration (supporting multi-waypoint navigation routes)
    const customWaypoints = this.routeResolver ? this.routeResolver(request, origin, destination) : undefined;
    const waypoints = customWaypoints && customWaypoints.length >= 2 ? customWaypoints : undefined;

    let totalDistance: number;
    if (waypoints) {
      totalDistance = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        const p1 = waypoints[i];
        const p2 = waypoints[i + 1];
        totalDistance += Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
      }
    } else {
      const dx = destination.x - origin.x;
      const dy = destination.y - origin.y;
      const dz = destination.z - origin.z;
      totalDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // If already at destination threshold
    if (totalDistance <= this.arrivalThreshold) {
      return Promise.resolve(
        Object.freeze({
          requestId: request.requestId,
          agentId,
          destinationPlaceId: request.destinationPlaceId,
          status: 'arrived',
          completedAt: request.requestedAt,
          message: `Agent "${agentId}" is already physically at destination "${request.destinationPlaceId}"`,
        })
      );
    }

    const totalDurationMs =
      typeof this.fixedDurationMs === 'number' && this.fixedDurationMs > 0
        ? this.fixedDurationMs
        : Math.max(1, (totalDistance / this.speed) * 1000);

    // 5. Create deferred in-flight traversal
    return new Promise<NavigationResult>((resolve) => {
      const inFlight: InFlightPhysicalTraversal = {
        request,
        origin: { ...origin },
        destination: { ...destination },
        waypoints,
        totalDistance,
        totalDurationMs,
        elapsedMs: 0,
        progress: 0,
        currentPosition: { ...origin },
        resolve,
        isCompleted: false,
      };

      this.activeTraversals.set(agentId, inFlight);
      this.lastKnownPositions.set(agentId, { ...origin });
    });
  }

  /**
   * Deterministically advances time by deltaTimeMs, updating 3D transforms
   * and detecting arrival.
   *
   * @param deltaTimeMs Elapsed time in milliseconds (must be positive and finite).
   * @returns Array of NavigationResult outcomes completed during this step.
   */
  public step(deltaTimeMs: number): readonly NavigationResult[] {
    if (
      typeof deltaTimeMs !== 'number' ||
      !Number.isFinite(deltaTimeMs) ||
      deltaTimeMs <= 0
    ) {
      throw new Error(
        `Invalid deltaTimeMs: expected positive finite number, received ${deltaTimeMs}`
      );
    }

    const completedResults: NavigationResult[] = [];

    for (const [agentId, inFlight] of Array.from(this.activeTraversals.entries())) {
      if (inFlight.isCompleted) {
        this.activeTraversals.delete(agentId);
        continue;
      }

      inFlight.elapsedMs += deltaTimeMs;
      inFlight.progress = Math.min(1.0, inFlight.elapsedMs / inFlight.totalDurationMs);

      // Traversal interpolation: polyline waypoints if present, else direct line
      if (inFlight.waypoints && inFlight.waypoints.length >= 2) {
        const targetDist = inFlight.progress * inFlight.totalDistance;
        let accumulated = 0;
        let setPos = false;
        for (let i = 0; i < inFlight.waypoints.length - 1; i++) {
          const w1 = inFlight.waypoints[i];
          const w2 = inFlight.waypoints[i + 1];
          const segDist = Math.hypot(w2.x - w1.x, w2.y - w1.y, w2.z - w1.z);
          if (accumulated + segDist >= targetDist || i === inFlight.waypoints.length - 2) {
            const segT = segDist > 0 ? Math.min(1.0, Math.max(0.0, (targetDist - accumulated) / segDist)) : 0;
            inFlight.currentPosition.x = w1.x + (w2.x - w1.x) * segT;
            inFlight.currentPosition.y = w1.y + (w2.y - w1.y) * segT;
            inFlight.currentPosition.z = w1.z + (w2.z - w1.z) * segT;
            setPos = true;
            break;
          }
          accumulated += segDist;
        }
        if (!setPos) {
          const last = inFlight.waypoints[inFlight.waypoints.length - 1];
          inFlight.currentPosition.x = last.x;
          inFlight.currentPosition.y = last.y;
          inFlight.currentPosition.z = last.z;
        }
      } else {
        const p = inFlight.progress;
        inFlight.currentPosition.x = inFlight.origin.x + (inFlight.destination.x - inFlight.origin.x) * p;
        inFlight.currentPosition.y = inFlight.origin.y + (inFlight.destination.y - inFlight.origin.y) * p;
        inFlight.currentPosition.z = inFlight.origin.z + (inFlight.destination.z - inFlight.origin.z) * p;
      }

      // Update Scene3D representation
      this.updateNodePosition(agentId, inFlight.currentPosition);
      this.lastKnownPositions.set(agentId, { ...inFlight.currentPosition });

      // Check arrival condition
      const dx = inFlight.destination.x - inFlight.currentPosition.x;
      const dy = inFlight.destination.y - inFlight.currentPosition.y;
      const dz = inFlight.destination.z - inFlight.currentPosition.z;
      const distRemaining = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distRemaining <= this.arrivalThreshold || inFlight.progress >= 1.0) {
        // Snap exactly to destination
        inFlight.currentPosition = { ...inFlight.destination };
        this.updateNodePosition(agentId, inFlight.currentPosition);
        this.lastKnownPositions.set(agentId, { ...inFlight.currentPosition });
        inFlight.progress = 1.0;
        inFlight.isCompleted = true;

        this.activeTraversals.delete(agentId);

        // Calculate deterministic completed timestamp
        let completedAt: string;
        const parsedStart = Date.parse(inFlight.request.requestedAt);
        if (!isNaN(parsedStart)) {
          completedAt = new Date(parsedStart + inFlight.elapsedMs).toISOString();
        } else {
          completedAt = inFlight.request.requestedAt;
        }

        const arrivalResult: NavigationResult = Object.freeze({
          requestId: inFlight.request.requestId,
          agentId: inFlight.request.agentId,
          destinationPlaceId: inFlight.request.destinationPlaceId,
          status: 'arrived',
          completedAt,
          message: `Physical traversal reached destination "${inFlight.request.destinationPlaceId}"`,
        });

        completedResults.push(arrivalResult);
        inFlight.resolve(arrivalResult);
      }
    }

    return Object.freeze(completedResults);
  }

  /**
   * Cancels an active physical traversal for an agent.
   *
   * Resolves the pending Promise with 'traversal-interrupted'.
   */
  public cancelCurrentTraversal(agentId: string, reason?: string): boolean {
    const inFlight = this.activeTraversals.get(agentId);
    if (!inFlight || inFlight.isCompleted) {
      return false;
    }

    inFlight.isCompleted = true;
    this.activeTraversals.delete(agentId);

    const result: NavigationResult = Object.freeze({
      requestId: inFlight.request.requestId,
      agentId: inFlight.request.agentId,
      destinationPlaceId: inFlight.request.destinationPlaceId,
      status: 'traversal-interrupted',
      completedAt: inFlight.request.requestedAt,
      message: `Physical traversal interrupted: ${reason ?? 'Cancelled by caller'}`,
    });

    inFlight.resolve(result);
    return true;
  }

  /**
   * Returns true if the agent has an active physical traversal in progress.
   */
  public hasActiveTraversal(agentId: string): boolean {
    const active = this.activeTraversals.get(agentId);
    return active !== undefined && !active.isCompleted;
  }

  /**
   * Returns the active in-flight traversal record for an agent, if any.
   */
  public getActiveTraversal(agentId: string): Readonly<InFlightPhysicalTraversal> | undefined {
    return this.activeTraversals.get(agentId);
  }

  /**
   * Returns the traversal progress (0.0 to 1.0) for an agent (0 if not traversing).
   */
  public getProgress(agentId: string): number {
    const active = this.activeTraversals.get(agentId);
    return active ? active.progress : 0;
  }

  /**
   * Returns the current position of the agent in physical 3D space.
   */
  public getCurrentPosition(agentId: string): Vector3 | undefined {
    const active = this.activeTraversals.get(agentId);
    if (active) return { ...active.currentPosition };
    return this.getAgentPosition(agentId);
  }

  /**
   * Returns the physical target destination for an agent's active traversal.
   */
  public getDestinationPosition(agentId: string): Vector3 | undefined {
    const active = this.activeTraversals.get(agentId);
    return active ? { ...active.destination } : undefined;
  }

  /**
   * Returns all currently active physical traversals.
   */
  public getAllActiveTraversals(): readonly Readonly<InFlightPhysicalTraversal>[] {
    return Array.from(this.activeTraversals.values());
  }

  /**
   * Clears and cancels all active physical traversals.
   */
  public clear(): void {
    for (const [agentId] of Array.from(this.activeTraversals.entries())) {
      this.cancelCurrentTraversal(agentId, 'Runtime cleared');
    }
    this.activeTraversals.clear();
  }
}
