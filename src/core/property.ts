/**
 * Property & Assignment Foundation (Milestone 56).
 *
 * Formalizes authoritative state, queries, and invariants for physical properties
 * and assignment truth in MyVirtualCommunity.
 *
 * Core Semantic Boundaries:
 * - Property Authority owns: Property entity records and assignment truth ('unassigned' | 'assigned').
 * - Spatial Authority owns: Physical topology and containment hierarchy (Place / Building).
 * - Building ≠ Property: A Building represents spatial containment topology. A Property is
 *   a distinct entity associated with an explicitly designated Building.
 *   Not every Building is a Property.
 * - Property Assignment ≠ Occupancy: An assignment indicates the current holder reference.
 *   It does not dictate who is physically present or living in the space (owned by Agent / Spatial Presence).
 * - Property Assignment ≠ Access: Assignment does not dictate real-time door admission
 *   (owned by local access evaluation).
 * - Property Assignment ≠ Business Operation: A commercial Property assignment is distinct
 *   from commercial businesses operating within that building (owned by Business Authority).
 * - Property Assignment ≠ Economic Transaction: Assignment is decoupled from money, pricing,
 *   or purchase workflows (owned by Economy Authority).
 * - Single Property per Building: At most one Property record may reference a given Building.
 *   Place entities remain strictly spatial and do not contain reverse property references.
 * - Semantics of 'unassigned': Strictly means no holder is currently assigned to this Property.
 *   Does NOT imply public availability, claimability, purchase, or public commons.
 */

import type { Place } from './entities/geography.js';
import { validateEntityId } from './entities/entity.js';

export type PropertyType = 'residence' | 'commercial';

export type PropertyAssignmentStatus = 'unassigned' | 'assigned';

export type PropertyHolderType = 'agent' | 'organization' | 'person';

export interface PropertyHolderReference {
  readonly holderType: PropertyHolderType;
  readonly holderId: string;
}

/**
 * Unassigned assignment state.
 * Strictly indicates that no holder is currently assigned to this Property.
 * Does NOT imply availability, claimability, or purchase status.
 */
export interface UnassignedPropertyAssignment {
  readonly status: 'unassigned';
  readonly holder?: undefined;
  readonly assignedAt?: undefined;
}

/**
 * Assigned assignment state.
 * Associates the Property with a current holder reference and assignment timestamp.
 * Legally neutral; does not define a deed, lease, or ownership certificate.
 */
export interface AssignedPropertyAssignment {
  readonly status: 'assigned';
  readonly holder: PropertyHolderReference;
  readonly assignedAt: string; // ISO-8601 World Time string
}

export type PropertyAssignment = UnassignedPropertyAssignment | AssignedPropertyAssignment;

/**
 * Authoritative Property entity (Milestone 56).
 *
 * Represents a persistent property record attached to an explicitly designated Building.
 * Spatial/building display name is derived from Place.name via buildingId; Property does
 * not duplicate the name.
 */
export interface Property {
  readonly id: string; // e.g. 'property:development-residence'
  readonly type?: 'property';
  readonly buildingId: string; // Foreign key -> Place (type === 'building')
  readonly propertyType: PropertyType;
  readonly assignment: PropertyAssignment;
}

/**
 * World state interface required for Property Authority queries and validation.
 */
export interface PropertyWorldState {
  readonly properties: readonly Property[];
  readonly places?: readonly Place[];
}

/**
 * Explicit initial property specifications for the canonical seed worlds.
 * Only explicitly designated buildings receive Property records.
 */
export interface ExplicitInitialPropertyDefinition {
  readonly id: string;
  readonly buildingId: string;
  readonly propertyType: PropertyType;
}

export const EXPLICIT_INITIAL_PROPERTY_DEFINITIONS: readonly ExplicitInitialPropertyDefinition[] = [
  {
    id: 'property:development-residence',
    buildingId: 'building:development-residence',
    propertyType: 'residence',
  },
  {
    id: 'property:development-building',
    buildingId: 'building:development-building',
    propertyType: 'commercial',
  },
  {
    id: 'property:avenida-juarez-kiosk',
    buildingId: 'building:avenida-juarez-kiosk',
    propertyType: 'commercial',
  },
  {
    id: 'property:real-world-residence',
    buildingId: 'building:real-world-residence',
    propertyType: 'residence',
  },
  {
    id: 'property:kentucky-club-building',
    buildingId: 'building:kentucky-club-building',
    propertyType: 'commercial',
  },
];

/**
 * Pure generator creating initial unassigned Property entities for explicitly designated
 * property-bearing buildings present in the provided places collection.
 */
export function createInitialPropertiesForPlaces(places: readonly Place[]): Property[] {
  const buildingIdSet = new Set(places.filter((p) => p.type === 'building').map((p) => p.id));
  return EXPLICIT_INITIAL_PROPERTY_DEFINITIONS
    .filter((def) => buildingIdSet.has(def.buildingId))
    .map((def) => ({
      id: def.id,
      type: 'property' as const,
      buildingId: def.buildingId,
      propertyType: def.propertyType,
      assignment: { status: 'unassigned' as const },
    }));
}

/**
 * Validates a collection of Property entities enforcing structural integrity,
 * unique property IDs, unique buildingId per property, and strict assignment invariants.
 *
 * If validBuildingIds is provided, enforces that buildingId references an existing Place of type 'building'.
 */
/**
 * Validates an individual Property entity enforcing structural integrity, valid identifiers,
 * recognized propertyType, and status/holder invariant rules.
 */
export function validateProperty(
  item: unknown,
  validBuildingIds?: Set<string>
): asserts item is Property {
  if (typeof item !== 'object' || item === null) {
    throw new Error('Invalid property: must be a non-null object');
  }

  const prop = item as Record<string, unknown>;

  if (typeof prop.id !== 'string') {
    throw new Error('Invalid property id: must be a string');
  }
  try {
    validateEntityId(prop.id);
  } catch (err: any) {
    throw new Error(`Invalid property id format: ${err.message}`);
  }

  if (prop.type !== undefined && prop.type !== 'property') {
    throw new Error(`Invalid entity type for property "${prop.id}": "${prop.type}". Expected "property".`);
  }

  if (typeof prop.buildingId !== 'string' || prop.buildingId.trim() === '') {
    throw new Error(`Invalid buildingId for property "${prop.id}": must be a non-empty string`);
  }
  try {
    validateEntityId(prop.buildingId);
  } catch (err: any) {
    throw new Error(`Invalid property buildingId for "${prop.id}": ${err.message}`);
  }

  if (validBuildingIds && !validBuildingIds.has(prop.buildingId)) {
    throw new Error(
      `Invalid buildingId "${prop.buildingId}" for property "${prop.id}": references non-existent building or non-building place`
    );
  }

  const validPropertyTypes: PropertyType[] = ['residence', 'commercial'];
  if (!validPropertyTypes.includes(prop.propertyType as PropertyType)) {
    throw new Error(
      `Invalid property propertyType "${prop.propertyType}" for property "${prop.id}". Expected 'residence' or 'commercial'.`
    );
  }

  // Validate assignment
  if (typeof prop.assignment !== 'object' || prop.assignment === null) {
    throw new Error(`Invalid assignment for property "${prop.id}": must be a non-null object`);
  }

  const assignment = prop.assignment as Record<string, unknown>;
  const validStatuses: PropertyAssignmentStatus[] = ['unassigned', 'assigned'];
  if (!validStatuses.includes(assignment.status as PropertyAssignmentStatus)) {
    throw new Error(
      `Invalid property assignment status "${assignment.status}" for property "${prop.id}". Expected 'unassigned' or 'assigned'.`
    );
  }

  if (assignment.status === 'unassigned') {
    if (assignment.holder !== undefined || assignment.assignedAt !== undefined) {
      throw new Error(
        `Unassigned property cannot have holder or assignedAt in property "${prop.id}"`
      );
    }
  } else if (assignment.status === 'assigned') {
    if (typeof assignment.holder !== 'object' || assignment.holder === null) {
      throw new Error(
        `Assigned property must have a valid holder in property "${prop.id}"`
      );
    }

    const holder = assignment.holder as Record<string, unknown>;
    const validHolderTypes: PropertyHolderType[] = ['agent', 'organization', 'person'];
    if (!validHolderTypes.includes(holder.holderType as PropertyHolderType)) {
      throw new Error(
        `Invalid property holderType "${holder.holderType}" for property "${prop.id}". Expected 'agent', 'organization', or 'person'.`
      );
    }

    if (typeof holder.holderId !== 'string' || holder.holderId.trim() === '') {
      throw new Error(
        `Invalid holderId for property "${prop.id}": must be a non-empty string`
      );
    }
    validateEntityId(holder.holderId);

    if (typeof assignment.assignedAt !== 'string' || assignment.assignedAt.trim() === '') {
      throw new Error(
        `Assigned property must have a valid assignedAt timestamp in property "${prop.id}"`
      );
    }

    const parsedTime = Date.parse(assignment.assignedAt);
    if (Number.isNaN(parsedTime)) {
      throw new Error(
        `Property assignedAt must be a valid ISO timestamp in property "${prop.id}". Received: "${assignment.assignedAt}"`
      );
    }
  }
}

/**
 * Validates a collection of Property entities enforcing structural integrity,
 * unique property IDs, unique buildingId per property, and strict assignment invariants.
 *
 * If validBuildingIds is provided, enforces that buildingId references an existing Place of type 'building'.
 */
export function validateProperties(
  properties: unknown[],
  validBuildingIds?: Set<string>
): asserts properties is Property[] {
  if (!Array.isArray(properties)) {
    throw new Error('Invalid properties collection: must be an array');
  }

  const propertyIds = new Set<string>();
  const buildingIds = new Set<string>();

  for (let i = 0; i < properties.length; i++) {
    const item = properties[i];
    validateProperty(item, validBuildingIds);
    const prop = item as Property;

    if (propertyIds.has(prop.id)) {
      throw new Error(`Duplicate property id found in properties: "${prop.id}"`);
    }
    propertyIds.add(prop.id);

    if (buildingIds.has(prop.buildingId)) {
      throw new Error(
        `Duplicate property for building "${prop.buildingId}": multiple properties reference the same building`
      );
    }
    buildingIds.add(prop.buildingId);
  }
}

/**
 * Validates domain-level invariants for Property Authority.
 * Accepts either a PropertyWorldState object or (properties, places) arrays.
 */
export function validatePropertyAuthority(
  stateOrProperties: PropertyWorldState | readonly Property[],
  maybePlaces?: readonly Place[]
): void {
  let properties: readonly Property[];
  let places: readonly Place[] | undefined;

  if ('properties' in stateOrProperties) {
    properties = stateOrProperties.properties;
    places = stateOrProperties.places;
  } else {
    properties = stateOrProperties;
    places = maybePlaces;
  }

  if (places) {
    const placeMap = new Map<string, Place>(places.map((p) => [p.id, p]));
    for (const prop of properties) {
      const place = placeMap.get(prop.buildingId);
      if (!place) {
        throw new Error(`Property references non-existent building "${prop.buildingId}"`);
      }
      if (place.type !== 'building') {
        throw new Error(
          `Property references place "${prop.buildingId}" which is of kind "${place.type}", expected "building"`
        );
      }
    }
  }

  const validBuildingIds = places
    ? new Set<string>(places.filter((p) => p.type === 'building').map((p) => p.id))
    : undefined;

  validateProperties(properties as unknown[], validBuildingIds);
}

/**
 * Pure query: retrieves a Property entity by its unique identifier.
 */
export function getProperty(state: PropertyWorldState, propertyId: string): Property | undefined {
  return state.properties.find((p) => p.id === propertyId);
}

/**
 * Pure query: retrieves the Property entity associated with a given buildingId, if any.
 */
export function getPropertyByBuildingId(state: PropertyWorldState, buildingId: string): Property | undefined {
  return state.properties.find((p) => p.buildingId === buildingId);
}

/**
 * Pure query: determines whether a property is actively assigned to a holder.
 */
export function isPropertyAssigned(state: PropertyWorldState, propertyId: string): boolean {
  const property = getProperty(state, propertyId);
  return property?.assignment.status === 'assigned';
}
