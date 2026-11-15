/**
 * Milestone 70 — Physical World Representation & Spatial Mapping
 *
 * Establishes the engine-independent contract separating the authoritative World Core topology
 * from external physical 3D representations (e.g. Unity, Unreal, Three.js, headless simulators).
 *
 * Architectural Principles (M70):
 * 1. Logical World Identity and Physical Representation are strictly decoupled:
 *    - World Core owns entity identity, logical containment, world state, and state transitions.
 *    - Physical engines own geometry, coordinates, transforms, meshes, collision, and rendering.
 *    - Physical representation is NEVER authoritative over world state.
 * 2. PhysicalMappingRegistry is external integration/runtime state:
 *    - It is NOT part of WorldState, NOT serialized, and NOT required for simulation or persistence.
 *    - World Core remains 100% operational when no physical mapping exists.
 * 3. Spatial Anchors are semantic references, NOT geometric coordinates:
 *    - An anchor defines a semantic point (e.g. entrance, interior, customer-area).
 *    - It contains ZERO coordinates, transforms, or vectors.
 * 4. Cardinality & Replaceability:
 *    - Supports 1:1, 1:many, and many:1 entity-to-representation relationships.
 *    - Reverse lookup (representationId -> worldEntityId) provides identification only; never authority.
 *    - Physical representations can be swapped, destroyed, or recreated without altering WorldState.
 */

import type { PlaceType } from './entities/geography.js';
import type { WorldState } from './world-state.js';

/**
 * World entity type reflecting the existing domain vocabulary.
 * Directly reuses PlaceType ('city' | 'district' | 'neighborhood' | 'street' | 'building'),
 * plus 'restaurant' and 'agent'.
 */
export type WorldEntityType = PlaceType | 'restaurant' | 'agent';

/**
 * Descriptive engine-independent classification of physical representations.
 * Contains no engine-specific types (e.g., GameObject, Prefab, Mesh).
 */
export type PhysicalRepresentationType =
  | 'world-container'
  | 'terrain'
  | 'street'
  | 'building'
  | 'interior'
  | 'entrance'
  | 'navigation-anchor'
  | 'agent';

/**
 * Physical availability state of an established mapping.
 *
 * - 'available': Representation is instantiated and available in the physical engine.
 * - 'unavailable': Mapping exists, but representation is currently unloaded/inactive.
 * - 'destroyed': Representation previously existed but was destroyed/de-spawned in the physical engine.
 */
export type PhysicalRepresentationAvailability =
  | 'available'
  | 'unavailable'
  | 'destroyed';

/**
 * Immutable mapping relationship connecting a logical world entity to a physical representation (Milestone 70).
 *
 * NOTE: This is runtime integration state, NOT persistent WorldState.
 */
export interface PhysicalEntityMapping {
  readonly mappingId: string;
  readonly worldEntityId: string;
  readonly worldEntityType: WorldEntityType;
  readonly representationId: string;
  readonly representationType: PhysicalRepresentationType;
  readonly availability: PhysicalRepresentationAvailability;
  readonly description?: string;
}

/**
 * Semantic classification of spatial anchors.
 * Identifies functional locations without physical coordinates.
 */
export type SpatialAnchorType =
  | 'entrance'
  | 'exit'
  | 'interior'
  | 'service-entry'
  | 'employee-entry'
  | 'customer-entry'
  | 'navigation-origin'
  | 'navigation-destination';

/**
 * Semantic spatial anchor point associated with a world entity (Milestone 70).
 *
 * CRITICAL INVARIANT: Contains zero coordinates, transforms, quaternions, or vectors.
 * SpatialAnchor identifies WHAT the anchor represents; the external physical engine
 * determines WHERE it is located in 3D space.
 */
export interface SpatialAnchor {
  readonly anchorId: string;
  readonly worldEntityId: string;
  readonly anchorType: SpatialAnchorType;
  readonly description?: string;
}

/**
 * Failure codes for physical mapping and anchor operations.
 * Distinct from navigation failures (e.g. 'unreachable-destination').
 */
export type PhysicalMappingFailureCode =
  | 'world-entity-not-found'
  | 'mapping-not-found'
  | 'representation-unavailable'
  | 'anchor-not-found'
  | 'invalid-mapping';

export interface ResolvePhysicalMappingSuccess {
  readonly success: true;
  readonly mappings: readonly PhysicalEntityMapping[];
  readonly primaryMapping: PhysicalEntityMapping;
}

export interface ResolvePhysicalMappingFailure {
  readonly success: false;
  readonly code: PhysicalMappingFailureCode;
  readonly message: string;
}

export type ResolvePhysicalMappingResult =
  | ResolvePhysicalMappingSuccess
  | ResolvePhysicalMappingFailure;

export interface ResolveSpatialAnchorSuccess {
  readonly success: true;
  readonly anchor: SpatialAnchor;
}

export interface ResolveSpatialAnchorFailure {
  readonly success: false;
  readonly code: PhysicalMappingFailureCode;
  readonly message: string;
}

export type ResolveSpatialAnchorResult =
  | ResolveSpatialAnchorSuccess
  | ResolveSpatialAnchorFailure;

/**
 * Validates whether a world entity exists in authoritative WorldState
 * and derives its canonical WorldEntityType.
 *
 * Pure evaluator with zero state mutation.
 */
export function identifyWorldEntity(
  state: WorldState,
  worldEntityId: string
): { exists: boolean; entityType?: WorldEntityType } {
  if (typeof worldEntityId !== 'string' || worldEntityId.trim() === '') {
    return { exists: false };
  }

  const place = state.places?.find((p) => p.id === worldEntityId);
  if (place) {
    return { exists: true, entityType: place.type };
  }

  const restaurant = state.restaurants?.find((r) => r.id === worldEntityId);
  if (restaurant) {
    return { exists: true, entityType: 'restaurant' };
  }

  const agent = state.agents?.find((a) => a.id === worldEntityId);
  if (agent) {
    return { exists: true, entityType: 'agent' };
  }

  return { exists: false };
}

/**
 * Engine-independent runtime registry maintaining entity mappings and spatial anchors (Milestone 70).
 *
 * Characteristics:
 * - External to WorldState; not serialized, not persistent.
 * - Does not mutate WorldState.
 * - Supports 1:1, 1:many, and many:1 mapping cardinalities.
 * - Provides reverse lookup for external physical identification.
 */
export class PhysicalMappingRegistry {
  private readonly mappingsById = new Map<string, PhysicalEntityMapping>();
  private readonly mappingsByWorldEntity = new Map<string, PhysicalEntityMapping[]>();
  private readonly mappingsByRepresentation = new Map<string, PhysicalEntityMapping[]>();
  private readonly anchorsByEntity = new Map<string, Map<string, SpatialAnchor>>();

  /**
   * Registers a physical mapping relationship between a world entity and a physical representation.
   */
  public registerMapping(mapping: PhysicalEntityMapping): this {
    if (!mapping.mappingId || !mapping.worldEntityId || !mapping.representationId) {
      throw new Error('Invalid PhysicalEntityMapping: mappingId, worldEntityId, and representationId are required');
    }

    const frozenMapping = Object.freeze({ ...mapping });
    this.mappingsById.set(mapping.mappingId, frozenMapping);

    // Index by worldEntityId
    const entityMappings = this.mappingsByWorldEntity.get(mapping.worldEntityId) ?? [];
    const existingIndex = entityMappings.findIndex((m) => m.mappingId === mapping.mappingId);
    if (existingIndex >= 0) {
      entityMappings[existingIndex] = frozenMapping;
    } else {
      entityMappings.push(frozenMapping);
    }
    this.mappingsByWorldEntity.set(mapping.worldEntityId, entityMappings);

    // Index by representationId (supports many:1 container mappings)
    const repMappings = this.mappingsByRepresentation.get(mapping.representationId) ?? [];
    const repIndex = repMappings.findIndex((m) => m.mappingId === mapping.mappingId);
    if (repIndex >= 0) {
      repMappings[repIndex] = frozenMapping;
    } else {
      repMappings.push(frozenMapping);
    }
    this.mappingsByRepresentation.set(mapping.representationId, repMappings);

    return this;
  }

  /**
   * Unregisters a mapping by its mappingId.
   */
  public unregisterMapping(mappingId: string): boolean {
    const mapping = this.mappingsById.get(mappingId);
    if (!mapping) return false;

    this.mappingsById.delete(mappingId);

    const entityMappings = this.mappingsByWorldEntity.get(mapping.worldEntityId);
    if (entityMappings) {
      const filtered = entityMappings.filter((m) => m.mappingId !== mappingId);
      if (filtered.length > 0) {
        this.mappingsByWorldEntity.set(mapping.worldEntityId, filtered);
      } else {
        this.mappingsByWorldEntity.delete(mapping.worldEntityId);
      }
    }

    const repMappings = this.mappingsByRepresentation.get(mapping.representationId);
    if (repMappings) {
      const filtered = repMappings.filter((m) => m.mappingId !== mappingId);
      if (filtered.length > 0) {
        this.mappingsByRepresentation.set(mapping.representationId, filtered);
      } else {
        this.mappingsByRepresentation.delete(mapping.representationId);
      }
    }

    return true;
  }

  /**
   * Updates the availability of a physical mapping.
   */
  public setAvailability(
    mappingId: string,
    availability: PhysicalRepresentationAvailability
  ): boolean {
    const existing = this.mappingsById.get(mappingId);
    if (!existing) return false;

    const updated: PhysicalEntityMapping = Object.freeze({
      ...existing,
      availability,
    });

    this.registerMapping(updated);
    return true;
  }

  /**
   * Resolves all physical mappings for a given world entity.
   */
  public getMappingsForWorldEntity(worldEntityId: string): readonly PhysicalEntityMapping[] {
    const mappings = this.mappingsByWorldEntity.get(worldEntityId);
    return mappings ? Object.freeze([...mappings]) : Object.freeze([]);
  }

  /**
   * Resolves the primary/default physical mapping for a world entity.
   */
  public getPrimaryMapping(worldEntityId: string): PhysicalEntityMapping | undefined {
    const mappings = this.mappingsByWorldEntity.get(worldEntityId);
    return mappings && mappings.length > 0 ? mappings[0] : undefined;
  }

  /**
   * Reverse lookup: Resolves mappings associated with a physical representation ID.
   *
   * CRITICAL: Provides identification only. Never grants authority to mutate WorldState.
   */
  public getMappingsForRepresentation(representationId: string): readonly PhysicalEntityMapping[] {
    const mappings = this.mappingsByRepresentation.get(representationId);
    return mappings ? Object.freeze([...mappings]) : Object.freeze([]);
  }

  /**
   * Registers a semantic spatial anchor for a world entity.
   */
  public registerAnchor(anchor: SpatialAnchor): this {
    if (!anchor.anchorId || !anchor.worldEntityId || !anchor.anchorType) {
      throw new Error('Invalid SpatialAnchor: anchorId, worldEntityId, and anchorType are required');
    }

    const frozenAnchor = Object.freeze({ ...anchor });
    let entityAnchors = this.anchorsByEntity.get(anchor.worldEntityId);
    if (!entityAnchors) {
      entityAnchors = new Map<string, SpatialAnchor>();
      this.anchorsByEntity.set(anchor.worldEntityId, entityAnchors);
    }
    entityAnchors.set(anchor.anchorId, frozenAnchor);
    return this;
  }

  /**
   * Resolves all semantic spatial anchors registered for a world entity.
   */
  public getAnchorsForWorldEntity(worldEntityId: string): readonly SpatialAnchor[] {
    const entityAnchors = this.anchorsByEntity.get(worldEntityId);
    if (!entityAnchors) return Object.freeze([]);
    return Object.freeze([...entityAnchors.values()]);
  }

  /**
   * Resolves a specific spatial anchor by entity ID and anchor ID.
   */
  public getAnchor(worldEntityId: string, anchorId: string): SpatialAnchor | undefined {
    return this.anchorsByEntity.get(worldEntityId)?.get(anchorId);
  }

  /**
   * Clears all registered mappings and anchors.
   */
  public clear(): void {
    this.mappingsById.clear();
    this.mappingsByWorldEntity.clear();
    this.mappingsByRepresentation.clear();
    this.anchorsByEntity.clear();
  }
}

/**
 * Pure helper resolving physical mappings for a world entity against authoritative WorldState (Milestone 70).
 *
 * Verifies:
 * 1. World entity exists in WorldState.places, WorldState.restaurants, or WorldState.agents.
 * 2. Mapping exists in registry.
 * 3. Primary mapping is available.
 *
 * Invariant: ZERO state mutation.
 */
export function resolvePhysicalMapping(
  state: WorldState,
  registry: PhysicalMappingRegistry,
  worldEntityId: string
): ResolvePhysicalMappingResult {
  const entityCheck = identifyWorldEntity(state, worldEntityId);
  if (!entityCheck.exists) {
    return Object.freeze({
      success: false,
      code: 'world-entity-not-found',
      message: `World entity "${worldEntityId}" does not exist in authoritative world state`,
    });
  }

  const mappings = registry.getMappingsForWorldEntity(worldEntityId);
  if (mappings.length === 0) {
    return Object.freeze({
      success: false,
      code: 'mapping-not-found',
      message: `No physical mapping registered for world entity "${worldEntityId}"`,
    });
  }

  const primaryMapping = mappings[0];
  if (primaryMapping.availability !== 'available') {
    return Object.freeze({
      success: false,
      code: 'representation-unavailable',
      message: `Physical representation "${primaryMapping.representationId}" for entity "${worldEntityId}" is ${primaryMapping.availability}`,
    });
  }

  return Object.freeze({
    success: true,
    mappings,
    primaryMapping,
  });
}

/**
 * Pure helper resolving a semantic spatial anchor for a world entity against authoritative WorldState (Milestone 70).
 *
 * Verifies:
 * 1. World entity exists in authoritative WorldState.
 * 2. Anchor is registered for entity.
 *
 * Invariant: Returns semantic anchor only; zero coordinates. Zero state mutation.
 */
export function resolveSpatialAnchor(
  state: WorldState,
  registry: PhysicalMappingRegistry,
  worldEntityId: string,
  anchorId: string
): ResolveSpatialAnchorResult {
  const entityCheck = identifyWorldEntity(state, worldEntityId);
  if (!entityCheck.exists) {
    return Object.freeze({
      success: false,
      code: 'world-entity-not-found',
      message: `World entity "${worldEntityId}" does not exist in authoritative world state`,
    });
  }

  const anchor = registry.getAnchor(worldEntityId, anchorId);
  if (!anchor) {
    return Object.freeze({
      success: false,
      code: 'anchor-not-found',
      message: `Spatial anchor "${anchorId}" not found for world entity "${worldEntityId}"`,
    });
  }

  return Object.freeze({
    success: true,
    anchor,
  });
}
