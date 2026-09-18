import { BaseEntity, validateEntityId } from './entity.js';

export type PlaceType = 'city' | 'district' | 'neighborhood' | 'street' | 'building';

export interface Place extends BaseEntity {
  id: string;
  type: PlaceType;
  name: string;
  parentId: string | null;
}

const EXPECTED_PARENT_TYPE: Record<Exclude<PlaceType, 'city'>, PlaceType> = {
  district: 'city',
  neighborhood: 'district',
  street: 'neighborhood',
  building: 'street',
};

/**
 * Validates a collection of places enforcing the strict geographic containment hierarchy:
 * City (root, parentId: null) -> District -> Neighborhood -> Street -> Building.
 * Also verifies ID uniqueness, no self-parenting, and absence of cycles.
 */
export function validatePlaces(places: unknown[]): asserts places is Place[] {
  if (!Array.isArray(places)) {
    throw new Error('Invalid places collection: must be an array');
  }

  const placeMap = new Map<string, Place>();

  // Pass 1: Individual place structure and ID uniqueness
  for (const item of places) {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Invalid place: must be a non-null object');
    }

    const place = item as Record<string, unknown>;
    validateEntityId(place.id);

    if (placeMap.has(place.id)) {
      throw new Error(`Duplicate entity id found in places: "${place.id}"`);
    }

    const validPlaceTypes: PlaceType[] = ['city', 'district', 'neighborhood', 'street', 'building'];
    if (!validPlaceTypes.includes(place.type as PlaceType)) {
      throw new Error(`Invalid place type: "${place.type}" for place "${place.id}"`);
    }

    if (typeof place.name !== 'string' || place.name.trim() === '') {
      throw new Error(`Invalid place name: must be a non-empty string for place "${place.id}"`);
    }

    if (place.parentId !== null && (typeof place.parentId !== 'string' || place.parentId.trim() === '')) {
      throw new Error(`Invalid parentId for place "${place.id}": must be null or non-empty string`);
    }

    placeMap.set(place.id, place as unknown as Place);
  }

  // Pass 2: Hierarchical containment rules and cycle detection
  for (const place of placeMap.values()) {
    if (place.type === 'city') {
      if (place.parentId !== null) {
        throw new Error(`City place "${place.id}" must have parentId null, received: "${place.parentId}"`);
      }
      continue;
    }

    // For non-city places, parentId must be a valid string pointing to an existing place
    if (place.parentId === null) {
      throw new Error(`Place "${place.id}" of type "${place.type}" must have a valid parentId`);
    }

    if (place.parentId === place.id) {
      throw new Error(`Self-parenting detected: place "${place.id}" cannot reference itself as parent`);
    }

    const parent = placeMap.get(place.parentId);
    if (!parent) {
      throw new Error(
        `Place "${place.id}" references non-existent parentId: "${place.parentId}"`
      );
    }

    const expectedType = EXPECTED_PARENT_TYPE[place.type as Exclude<PlaceType, 'city'>];
    if (parent.type !== expectedType) {
      throw new Error(
        `Invalid containment hierarchy: place "${place.id}" of type "${place.type}" must have parent of type "${expectedType}", but parent "${parent.id}" has type "${parent.type}"`
      );
    }

    // Cycle detection: traverse ancestors
    const visited = new Set<string>([place.id]);
    let currentAncestor: Place | undefined = parent;

    while (currentAncestor) {
      if (visited.has(currentAncestor.id)) {
        throw new Error(
          `Containment cycle detected involving place "${place.id}" and ancestor "${currentAncestor.id}"`
        );
      }
      visited.add(currentAncestor.id);
      currentAncestor = currentAncestor.parentId ? placeMap.get(currentAncestor.parentId) : undefined;
    }
  }
}
