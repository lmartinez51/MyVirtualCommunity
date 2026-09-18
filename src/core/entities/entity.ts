/**
 * Core entity type definitions and identity validation.
 */

export type EntityType =
  | 'city'
  | 'district'
  | 'neighborhood'
  | 'street'
  | 'building'
  | 'restaurant'
  | 'agent'
  | 'offering';

export interface BaseEntity {
  id: string;
  type: EntityType;
}

/**
 * Validates that an entity identifier is a non-empty, trimmed string.
 */
export function validateEntityId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`Invalid entity id: must be a non-empty string. Received: ${JSON.stringify(id)}`);
  }
}
