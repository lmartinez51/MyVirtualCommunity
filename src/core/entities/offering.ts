import { BaseEntity, validateEntityId } from './entity.js';

/**
 * Offering represents a single commercial offering made available by a Restaurant.
 *
 * NOTE: This is NOT an inventory item, NOT a purchased item, NOT an order, and NOT a menu system.
 * It represents descriptive commercial data only. No wallet, no balance, no transaction.
 */
export interface Offering extends BaseEntity {
  id: string;
  type: 'offering';
  name: string;
  restaurantId: string;
  priceMinor: number;
  currency: string;
}

/**
 * Validates a collection of offerings and ensures every offering references an existing Restaurant,
 * has non-negative integer priceMinor, non-empty name, non-empty currency, and unique IDs.
 */
export function validateOfferings(
  offerings: unknown[],
  validRestaurantIds: Set<string>
): asserts offerings is Offering[] {
  if (!Array.isArray(offerings)) {
    throw new Error('Invalid offerings collection: must be an array');
  }

  const offeringIds = new Set<string>();

  for (const item of offerings) {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Invalid offering: must be a non-null object');
    }

    const offering = item as Record<string, unknown>;
    validateEntityId(offering.id);

    if (offeringIds.has(offering.id)) {
      throw new Error(`Duplicate entity id found in offerings: "${offering.id}"`);
    }
    offeringIds.add(offering.id);

    if (offering.type !== 'offering') {
      throw new Error(`Invalid entity type for offering "${offering.id}": "${offering.type}"`);
    }

    if (typeof offering.name !== 'string' || offering.name.trim() === '') {
      throw new Error(`Invalid offering name: must be a non-empty string for offering "${offering.id}"`);
    }

    if (typeof offering.restaurantId !== 'string' || offering.restaurantId.trim() === '') {
      throw new Error(`Invalid restaurantId for offering "${offering.id}": must be a non-empty string`);
    }

    if (!validRestaurantIds.has(offering.restaurantId)) {
      throw new Error(
        `Offering "${offering.id}" references non-existent or invalid restaurantId: "${offering.restaurantId}"`
      );
    }

    if (
      typeof offering.priceMinor !== 'number' ||
      !Number.isFinite(offering.priceMinor) ||
      !Number.isInteger(offering.priceMinor) ||
      offering.priceMinor < 0
    ) {
      throw new Error(
        `Invalid priceMinor for offering "${offering.id}": must be a non-negative integer. Received: ${JSON.stringify(offering.priceMinor)}`
      );
    }

    if (typeof offering.currency !== 'string' || offering.currency.trim() === '') {
      throw new Error(
        `Invalid currency for offering "${offering.id}": must be a non-empty string. Received: ${JSON.stringify(offering.currency)}`
      );
    }
  }
}
