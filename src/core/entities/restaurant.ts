import { BaseEntity, validateEntityId } from './entity.js';
import { DEVELOPMENT_NPC_WORK_SCHEDULE } from '../development-npc-schedule.js';

export type RestaurantOperationalState = 'open' | 'closed';

/**
 * Restaurant represents a concrete real-world place spatially contained within a Building,
 * with an authoritative operational availability state.
 *
 * NOTE: This represents operational availability ('open' | 'closed') only.
 * No menus, products, inventory, employees, customers, orders, payments, ownership, pricing, or reservations.
 */
export interface Restaurant extends BaseEntity {
  id: string;
  type: 'restaurant';
  name: string;
  buildingId: string;
  operationalState: RestaurantOperationalState;
  operationalSince: string;
  balanceMinor: number;
  currency: string;
}

/**
 * Deterministic development operational rule fixture: UTC [09:00, 17:00) -> 'open', otherwise -> 'closed'.
 *
 * NOTE: This is ONLY a synthetic development/test fixture created exclusively to test and validate
 * time-driven state transitions. It does NOT represent a real restaurant schedule or business hours.
 */
export function evaluateDevelopmentRestaurantOperationalRule(
  isoTime: string
): RestaurantOperationalState {
  const date = new Date(isoTime);
  const timeOfDayMs =
    date.getUTCHours() * 3600_000 +
    date.getUTCMinutes() * 60_000 +
    date.getUTCSeconds() * 1000 +
    date.getUTCMilliseconds();

  const startMs = DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHourUtc * 3600_000;
  const endMs = DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHourUtc * 3600_000;

  return timeOfDayMs >= startMs && timeOfDayMs < endMs ? 'open' : 'closed';
}

/**
 * Validates a collection of restaurants and ensures every restaurant references an existing building
 * and has valid operationalState and operationalSince fields.
 */
export function validateRestaurants(
  restaurants: unknown[],
  validBuildingIds: Set<string>
): asserts restaurants is Restaurant[] {
  if (!Array.isArray(restaurants)) {
    throw new Error('Invalid restaurants collection: must be an array');
  }

  const restaurantIds = new Set<string>();

  for (const item of restaurants) {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Invalid restaurant: must be a non-null object');
    }

    const restaurant = item as Record<string, unknown>;
    validateEntityId(restaurant.id);

    if (restaurantIds.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found in restaurants: "${restaurant.id}"`);
    }
    restaurantIds.add(restaurant.id);

    if (restaurant.type !== 'restaurant') {
      throw new Error(`Invalid restaurant type: "${restaurant.type}" for entity "${restaurant.id}"`);
    }

    if (typeof restaurant.name !== 'string' || restaurant.name.trim() === '') {
      throw new Error(`Invalid restaurant name: must be a non-empty string for entity "${restaurant.id}"`);
    }

    if (typeof restaurant.buildingId !== 'string' || restaurant.buildingId.trim() === '') {
      throw new Error(
        `Invalid buildingId for restaurant "${restaurant.id}": must be a non-empty string`
      );
    }

    if (!validBuildingIds.has(restaurant.buildingId)) {
      throw new Error(
        `Restaurant "${restaurant.id}" references non-existent buildingId: "${restaurant.buildingId}"`
      );
    }

    const validOperationalStates: RestaurantOperationalState[] = ['open', 'closed'];
    if (!validOperationalStates.includes(restaurant.operationalState as RestaurantOperationalState)) {
      throw new Error(
        `Invalid operationalState: "${restaurant.operationalState}" for restaurant "${restaurant.id}". Expected 'open' or 'closed'.`
      );
    }

    if (typeof restaurant.operationalSince !== 'string' || restaurant.operationalSince.trim() === '') {
      throw new Error(
        `Invalid operationalSince: must be a non-empty string for restaurant "${restaurant.id}"`
      );
    }

    if (Number.isNaN(Date.parse(restaurant.operationalSince))) {
      throw new Error(
        `Invalid operationalSince timestamp: "${restaurant.operationalSince}" for restaurant "${restaurant.id}"`
      );
    }

    if (
      typeof restaurant.balanceMinor !== 'number' ||
      !Number.isInteger(restaurant.balanceMinor) ||
      restaurant.balanceMinor < 0
    ) {
      throw new Error(
        `Invalid balanceMinor: must be a non-negative integer for restaurant "${restaurant.id}". Received: ${JSON.stringify(restaurant.balanceMinor)}`
      );
    }

    if (typeof restaurant.currency !== 'string' || restaurant.currency.trim() === '') {
      throw new Error(
        `Invalid currency: must be a non-empty string for restaurant "${restaurant.id}"`
      );
    }
  }
}
