/**
 * Milestone 71 — Physical Client Projection Contract
 *
 * Establishes the engine-independent boundary separating the authoritative World Core
 * from external physical client representations (e.g. Unity, Unreal, Three.js, Canvas,
 * headless test harnesses).
 *
 * Architectural Principles (M71):
 * 1. World Core Authority:
 *    - World Core is the sole authority over WorldState.
 *    - Physical clients are strictly derived, disposable visual representations.
 *    - PhysicalClientAdapter has ZERO world authority and CANNOT mutate WorldState.
 * 2. Observer-Scoped Projection:
 *    - Projection is strictly observer-scoped (grounded in observerAgentId and observerLocationId).
 *    - Zero global/omniscient projection leakage: only co-located agents and topologically
 *      connected places/venues are visible.
 *    - Private agent state (balances, activityState, activitySince) is never exposed.
 * 3. Separation of World Facts vs. Client Representation:
 *    - Exposes authoritative facts (identity, logical location, operationalState, isResidential)
 *      and M70 metadata (representationId, availability, semantic spatial anchors).
 *    - Zero coordinates (x, y, z), transforms, rotations, colliders, physics, or NavMesh in projection.
 * 4. Snapshot Identity Semantics:
 *    - snapshotId = "proj:" + observerAgentId + ":" + worldTime
 *    - worldTime represents the authoritative capture time of the projection.
 *    - schemaVersion (18) is retained for schema transparency.
 * 5. Minimal Projection Reconciliation:
 *    - Pure comparison between previous and current projection snapshots.
 *    - Computes entitiesToSpawn, entitiesToDespawn, and entitiesToUpdate.
 *    - Unidirectional: World Core -> Client. Never Client -> World Core overwrite.
 * 6. ClientIntent Envelope:
 *    - Minimal transport envelope wrapping an existing authoritative command.
 *    - Adapter creates intent envelopes but NEVER executes, routes, or validates them.
 */

import type { WorldState } from './world-state.js';
import type { AgentType } from './entities/agent.js';
import type { RestaurantOperationalState } from './entities/restaurant.js';
import type {
  WorldEntityType,
  PhysicalRepresentationType,
  PhysicalRepresentationAvailability,
  SpatialAnchorType,
  PhysicalMappingRegistry,
} from './physical-mapping.js';
import { isResidentialBuilding } from './residential-access.js';
import { areAgentsCoLocated } from './co-presence.js';

/**
 * Filtered projection metadata for an M70 physical mapping.
 * Exposes only what an external client requires for presentation.
 * Does not expose internal registry mechanics.
 */
export interface ProjectedPhysicalMapping {
  readonly mappingId: string;
  readonly representationId: string;
  readonly representationType: PhysicalRepresentationType;
  readonly availability: PhysicalRepresentationAvailability;
}

/**
 * Filtered projection metadata for an M70 semantic spatial anchor.
 * Identifies functional thresholds without geometric coordinates.
 */
export interface ProjectedSpatialAnchor {
  readonly anchorId: string;
  readonly anchorType: SpatialAnchorType;
  readonly description?: string;
}

/**
 * Read-only projection of a single world entity in the observer's topological scope (Milestone 71).
 *
 * Combines authoritative world facts with resolved physical mapping metadata.
 * CRITICAL INVARIANT: Contains zero coordinates, transforms, vectors, colliders, or physics state.
 */
export interface ProjectedEntity {
  readonly entityId: string;
  readonly entityType: WorldEntityType;
  readonly name: string;
  readonly logicalLocationId: string;
  readonly isCoLocated: boolean;
  readonly operationalState?: RestaurantOperationalState;
  readonly isResidential?: boolean;
  readonly agentType?: AgentType;
  readonly physicalMappings: readonly ProjectedPhysicalMapping[];
  readonly spatialAnchors: readonly ProjectedSpatialAnchor[];
}

/**
 * Immutable, observer-scoped projection snapshot of the world at an authoritative capture time (Milestone 71).
 *
 * Stamped with snapshotId derived from observerAgentId and worldTime.
 */
export interface WorldProjectionSnapshot {
  readonly snapshotId: string;
  readonly schemaVersion: number;
  readonly worldId: string;
  readonly worldTime: string;
  readonly observerAgentId: string;
  readonly observerLocationId: string;
  readonly entities: readonly ProjectedEntity[];
}

/**
 * Minimal transport envelope for a client-originated intent targeting an existing authoritative command (Milestone 71).
 *
 * CRITICAL INVARIANT: ClientIntent is an envelope only; it does not execute, route, or authorize commands.
 */
export interface ClientIntent {
  readonly intentId: string;
  readonly clientId: string;
  readonly agentId: string;
  readonly commandName: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Pure diff between two projection snapshots for an external client engine (Milestone 71).
 *
 * Dictates visual lifecycle operations for client-side scene objects.
 */
export interface ProjectionReconciliation {
  readonly isStale: boolean;
  readonly previousSnapshotId?: string;
  readonly currentSnapshotId: string;
  readonly entitiesToSpawn: readonly ProjectedEntity[];
  readonly entitiesToDespawn: readonly string[];
  readonly entitiesToUpdate: readonly ProjectedEntity[];
}

/**
 * Resolves projected physical mappings for an entity from PhysicalMappingRegistry.
 */
function resolveProjectedMappings(
  registry?: PhysicalMappingRegistry,
  entityId?: string
): readonly ProjectedPhysicalMapping[] {
  if (!registry || !entityId) return Object.freeze([]);
  const mappings = registry.getMappingsForWorldEntity(entityId);
  return Object.freeze(
    mappings.map((m) =>
      Object.freeze({
        mappingId: m.mappingId,
        representationId: m.representationId,
        representationType: m.representationType,
        availability: m.availability,
      })
    )
  );
}

/**
 * Resolves projected spatial anchors for an entity from PhysicalMappingRegistry.
 */
function resolveProjectedAnchors(
  registry?: PhysicalMappingRegistry,
  entityId?: string
): readonly ProjectedSpatialAnchor[] {
  if (!registry || !entityId) return Object.freeze([]);
  const anchors = registry.getAnchorsForWorldEntity(entityId);
  return Object.freeze(
    anchors.map((a) =>
      Object.freeze({
        anchorId: a.anchorId,
        anchorType: a.anchorType,
        description: a.description,
      })
    )
  );
}

/**
 * Derives an immutable, observer-scoped projection snapshot from authoritative WorldState (Milestone 71).
 *
 * Invariants:
 * - Observer-scoped: Only entities co-located or topologically connected to observer's location are included.
 * - Non-omniscient: Other agents and distant places are strictly excluded.
 * - Zero state mutation: Does not mutate WorldState or registry.
 * - Zero coordinates: Contains no transforms, x/y/z coordinates, or engine types.
 */
export function projectWorldState(
  state: WorldState,
  observerAgentId: string,
  registry?: PhysicalMappingRegistry
): WorldProjectionSnapshot {
  if (!state || typeof state !== 'object') {
    throw new Error('Valid WorldState must be provided');
  }
  if (!observerAgentId || typeof observerAgentId !== 'string' || observerAgentId.trim() === '') {
    throw new Error('observerAgentId must be a non-empty string');
  }

  const observer = state.agents?.find((a) => a.id === observerAgentId);
  if (!observer) {
    throw new Error(`Observer agent "${observerAgentId}" not found in world state`);
  }

  const observerLocationId = observer.locationId;
  const entitiesMap = new Map<string, ProjectedEntity>();

  // 1. Observer Agent (always visible to own client)
  entitiesMap.set(
    observer.id,
    Object.freeze({
      entityId: observer.id,
      entityType: 'agent',
      name: observer.name,
      logicalLocationId: observer.locationId,
      isCoLocated: true,
      agentType: observer.agentType,
      physicalMappings: resolveProjectedMappings(registry, observer.id),
      spatialAnchors: resolveProjectedAnchors(registry, observer.id),
    })
  );

  // 2. Primary Location of the Observer
  const primaryPlace = state.places?.find((p) => p.id === observerLocationId);
  const primaryRestaurant = !primaryPlace
    ? state.restaurants?.find((r) => r.id === observerLocationId)
    : undefined;

  if (!primaryPlace && !primaryRestaurant) {
    throw new Error(
      `Observer agent "${observerAgentId}" references invalid spatial location "${observerLocationId}"`
    );
  }

  if (primaryPlace) {
    const isRes = isResidentialBuilding(state, primaryPlace.id);
    entitiesMap.set(
      primaryPlace.id,
      Object.freeze({
        entityId: primaryPlace.id,
        entityType: primaryPlace.type,
        name: primaryPlace.name,
        logicalLocationId: primaryPlace.parentId ?? primaryPlace.id,
        isCoLocated: true,
        isResidential: isRes,
        physicalMappings: resolveProjectedMappings(registry, primaryPlace.id),
        spatialAnchors: resolveProjectedAnchors(registry, primaryPlace.id),
      })
    );

    // Topological connections based on place type
    if (primaryPlace.type === 'street') {
      // Direct child buildings on this street
      const childBuildings = state.places?.filter(
        (p) => p.type === 'building' && p.parentId === primaryPlace.id
      ) ?? [];
      for (const b of childBuildings) {
        entitiesMap.set(
          b.id,
          Object.freeze({
            entityId: b.id,
            entityType: b.type,
            name: b.name,
            logicalLocationId: primaryPlace.id,
            isCoLocated: false,
            isResidential: isResidentialBuilding(state, b.id),
            physicalMappings: resolveProjectedMappings(registry, b.id),
            spatialAnchors: resolveProjectedAnchors(registry, b.id),
          })
        );
      }

      // Sibling streets in the same neighborhood
      if (primaryPlace.parentId !== null) {
        const siblingStreets = state.places?.filter(
          (p) => p.type === 'street' && p.parentId === primaryPlace.parentId && p.id !== primaryPlace.id
        ) ?? [];
        for (const s of siblingStreets) {
          entitiesMap.set(
            s.id,
            Object.freeze({
              entityId: s.id,
              entityType: s.type,
              name: s.name,
              logicalLocationId: primaryPlace.parentId,
              isCoLocated: false,
              physicalMappings: resolveProjectedMappings(registry, s.id),
              spatialAnchors: resolveProjectedAnchors(registry, s.id),
            })
          );
        }
      }
    } else if (primaryPlace.type === 'building') {
      // Parent street
      if (primaryPlace.parentId) {
        const parentStreet = state.places?.find((p) => p.id === primaryPlace.parentId);
        if (parentStreet) {
          entitiesMap.set(
            parentStreet.id,
            Object.freeze({
              entityId: parentStreet.id,
              entityType: parentStreet.type,
              name: parentStreet.name,
              logicalLocationId: parentStreet.parentId ?? parentStreet.id,
              isCoLocated: false,
              physicalMappings: resolveProjectedMappings(registry, parentStreet.id),
              spatialAnchors: resolveProjectedAnchors(registry, parentStreet.id),
            })
          );
        }
      }

      // Restaurants inside this building
      const childRestaurants = state.restaurants?.filter((r) => r.buildingId === primaryPlace.id) ?? [];
      for (const r of childRestaurants) {
        entitiesMap.set(
          r.id,
          Object.freeze({
            entityId: r.id,
            entityType: 'restaurant',
            name: r.name,
            logicalLocationId: primaryPlace.id,
            isCoLocated: false,
            operationalState: r.operationalState,
            physicalMappings: resolveProjectedMappings(registry, r.id),
            spatialAnchors: resolveProjectedAnchors(registry, r.id),
          })
        );
      }
    }
  } else if (primaryRestaurant) {
    entitiesMap.set(
      primaryRestaurant.id,
      Object.freeze({
        entityId: primaryRestaurant.id,
        entityType: 'restaurant',
        name: primaryRestaurant.name,
        logicalLocationId: primaryRestaurant.buildingId,
        isCoLocated: true,
        operationalState: primaryRestaurant.operationalState,
        physicalMappings: resolveProjectedMappings(registry, primaryRestaurant.id),
        spatialAnchors: resolveProjectedAnchors(registry, primaryRestaurant.id),
      })
    );

    // Containing building
    const containingBuilding = state.places?.find((p) => p.id === primaryRestaurant.buildingId);
    if (containingBuilding) {
      entitiesMap.set(
        containingBuilding.id,
        Object.freeze({
          entityId: containingBuilding.id,
          entityType: containingBuilding.type,
          name: containingBuilding.name,
          logicalLocationId: containingBuilding.parentId ?? containingBuilding.id,
          isCoLocated: false,
          isResidential: isResidentialBuilding(state, containingBuilding.id),
          physicalMappings: resolveProjectedMappings(registry, containingBuilding.id),
          spatialAnchors: resolveProjectedAnchors(registry, containingBuilding.id),
        })
      );

      // Parent street of containing building
      if (containingBuilding.parentId) {
        const parentStreet = state.places?.find((p) => p.id === containingBuilding.parentId);
        if (parentStreet) {
          entitiesMap.set(
            parentStreet.id,
            Object.freeze({
              entityId: parentStreet.id,
              entityType: parentStreet.type,
              name: parentStreet.name,
              logicalLocationId: parentStreet.parentId ?? parentStreet.id,
              isCoLocated: false,
              physicalMappings: resolveProjectedMappings(registry, parentStreet.id),
              spatialAnchors: resolveProjectedAnchors(registry, parentStreet.id),
            })
          );
        }
      }
    }
  }

  // 3. Co-Located Agents (sharing identical logical context and physical partition)
  const coLocatedAgents = state.agents?.filter(
    (a) => a.id !== observer.id && areAgentsCoLocated(state, observer.id, a.id)
  ) ?? [];

  for (const agent of coLocatedAgents) {
    entitiesMap.set(
      agent.id,
      Object.freeze({
        entityId: agent.id,
        entityType: 'agent',
        name: agent.name,
        logicalLocationId: agent.locationId,
        isCoLocated: true,
        agentType: agent.agentType,
        physicalMappings: resolveProjectedMappings(registry, agent.id),
        spatialAnchors: resolveProjectedAnchors(registry, agent.id),
      })
    );
  }

  const snapshotId = `proj:${observerAgentId}:${state.worldTime}`;

  return Object.freeze({
    snapshotId,
    schemaVersion: state.version,
    worldId: state.worldId,
    worldTime: state.worldTime,
    observerAgentId,
    observerLocationId,
    entities: Object.freeze(Array.from(entitiesMap.values())),
  });
}

/**
 * Pure evaluator comparing two projection snapshots to determine visual lifecycle operations (Milestone 71).
 *
 * Invariants:
 * - Unidirectional diff (World Core projection -> Client visual state).
 * - Identifies entitiesToSpawn, entitiesToDespawn, and entitiesToUpdate.
 * - Never mutates WorldState or projection snapshots.
 */
export function reconcileWorldProjection(
  previousSnapshot: WorldProjectionSnapshot | undefined,
  currentSnapshot: WorldProjectionSnapshot
): ProjectionReconciliation {
  if (!currentSnapshot || typeof currentSnapshot !== 'object') {
    throw new Error('Valid current WorldProjectionSnapshot must be provided');
  }

  // Initial load / no previous snapshot
  if (!previousSnapshot) {
    return Object.freeze({
      isStale: true,
      previousSnapshotId: undefined,
      currentSnapshotId: currentSnapshot.snapshotId,
      entitiesToSpawn: Object.freeze([...currentSnapshot.entities]),
      entitiesToDespawn: Object.freeze([]),
      entitiesToUpdate: Object.freeze([]),
    });
  }

  const isStale =
    previousSnapshot.worldTime !== currentSnapshot.worldTime ||
    previousSnapshot.observerLocationId !== currentSnapshot.observerLocationId;

  const prevMap = new Map<string, ProjectedEntity>();
  for (const e of previousSnapshot.entities) {
    prevMap.set(e.entityId, e);
  }

  const currentMap = new Map<string, ProjectedEntity>();
  for (const e of currentSnapshot.entities) {
    currentMap.set(e.entityId, e);
  }

  const entitiesToSpawn: ProjectedEntity[] = [];
  const entitiesToUpdate: ProjectedEntity[] = [];
  const entitiesToDespawn: string[] = [];

  // Detect newly added or updated entities
  for (const [entityId, currentEntity] of currentMap.entries()) {
    const prevEntity = prevMap.get(entityId);
    if (!prevEntity) {
      entitiesToSpawn.push(currentEntity);
    } else {
      // Check if relevant projected facts changed
      const locationChanged = prevEntity.logicalLocationId !== currentEntity.logicalLocationId;
      const coLocatedChanged = prevEntity.isCoLocated !== currentEntity.isCoLocated;
      const opStateChanged = prevEntity.operationalState !== currentEntity.operationalState;
      const residentialChanged = prevEntity.isResidential !== currentEntity.isResidential;
      const mappingsChanged =
        prevEntity.physicalMappings.length !== currentEntity.physicalMappings.length ||
        prevEntity.physicalMappings.some(
          (m, idx) =>
            m.mappingId !== currentEntity.physicalMappings[idx]?.mappingId ||
            m.availability !== currentEntity.physicalMappings[idx]?.availability
        );

      if (locationChanged || coLocatedChanged || opStateChanged || residentialChanged || mappingsChanged) {
        entitiesToUpdate.push(currentEntity);
      }
    }
  }

  // Detect despawned entities
  for (const entityId of prevMap.keys()) {
    if (!currentMap.has(entityId)) {
      entitiesToDespawn.push(entityId);
    }
  }

  return Object.freeze({
    isStale,
    previousSnapshotId: previousSnapshot.snapshotId,
    currentSnapshotId: currentSnapshot.snapshotId,
    entitiesToSpawn: Object.freeze(entitiesToSpawn),
    entitiesToDespawn: Object.freeze(entitiesToDespawn),
    entitiesToUpdate: Object.freeze(entitiesToUpdate),
  });
}

/**
 * Creates a validated, immutable ClientIntent transport envelope (Milestone 71).
 *
 * Invariant: Wraps an existing authoritative command. Does not execute or route anything.
 */
export function createClientIntent(
  clientId: string,
  agentId: string,
  commandName: string,
  payload: Record<string, unknown> = {},
  customIntentId?: string
): ClientIntent {
  if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
    throw new Error('clientId must be a non-empty string');
  }
  if (!agentId || typeof agentId !== 'string' || agentId.trim() === '') {
    throw new Error('agentId must be a non-empty string');
  }
  if (!commandName || typeof commandName !== 'string' || commandName.trim() === '') {
    throw new Error('commandName must be a non-empty string');
  }

  return Object.freeze({
    intentId: customIntentId ?? `intent:${clientId}:${commandName}:${Date.now()}`,
    clientId,
    agentId,
    commandName,
    payload: Object.freeze({ ...payload }),
  });
}

/**
 * Engine-independent client adapter managing projection snapshot retention and intent creation (Milestone 71).
 *
 * Characteristics:
 * - Has ZERO world authority.
 * - Holds the latest read-only projection snapshot for its specific client instance and observer agent.
 * - Computes pure reconciliation reports upon snapshot updates.
 * - Creates ClientIntent envelopes targeting existing commands.
 * - NEVER executes, routes, validates, or persists commands or world state.
 */
export class PhysicalClientAdapter {
  private _latestSnapshot?: WorldProjectionSnapshot;

  constructor(
    readonly clientId: string,
    readonly observerAgentId: string
  ) {
    if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
      throw new Error('clientId must be a non-empty string');
    }
    if (!observerAgentId || typeof observerAgentId !== 'string' || observerAgentId.trim() === '') {
      throw new Error('observerAgentId must be a non-empty string');
    }
  }

  /**
   * Returns the cached latest projection snapshot, if any.
   */
  public getLatestSnapshot(): WorldProjectionSnapshot | undefined {
    return this._latestSnapshot;
  }

  /**
   * Updates the adapter's cached snapshot and returns a pure reconciliation report.
   */
  public updateSnapshot(snapshot: WorldProjectionSnapshot): ProjectionReconciliation {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Valid WorldProjectionSnapshot must be provided');
    }
    if (snapshot.observerAgentId !== this.observerAgentId) {
      throw new Error(
        `Snapshot observer mismatch: expected "${this.observerAgentId}", received "${snapshot.observerAgentId}"`
      );
    }

    const reconciliation = reconcileWorldProjection(this._latestSnapshot, snapshot);
    this._latestSnapshot = snapshot;
    return reconciliation;
  }

  /**
   * Creates a client intent envelope targeting an existing authoritative command.
   * Does NOT execute or authorize the command.
   */
  public createIntent(
    commandName: string,
    payload: Record<string, unknown> = {},
    customIntentId?: string
  ): ClientIntent {
    return createClientIntent(this.clientId, this.observerAgentId, commandName, payload, customIntentId);
  }
}
