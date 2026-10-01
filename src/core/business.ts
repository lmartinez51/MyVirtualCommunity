/**
 * Business Domain Authority (Milestone 36).
 *
 * Formalizes authoritative state transitions, queries, and invariants for the Business Domain.
 *
 * Scope & Boundaries:
 * - Business owns: Restaurant operational state ('open' | 'closed'), operationalSince timestamp,
 *   and published commercial offering catalog entries.
 * - Business does NOT own:
 *   - Spatial presence or movement (owned by Spatial / Agent).
 *   - Agent identity, body, or lifecycle (owned by Agent).
 *   - Worker employment, shifts, or activity states (owned by Activity / Agent).
 *   - Monetary truth, balances, or transactions (owned by Economy).
 *   - Physical inventory or possessions (owned by Item / Possession).
 *   - Situational opportunities (derived projection under Opportunity).
 *   - Agent knowledge facts (owned by Knowledge).
 *   - World time (owned by Time).
 */

import { Restaurant, RestaurantOperationalState } from './entities/restaurant.js';
import { Offering } from './entities/offering.js';
import { Place } from './entities/geography.js';

export type RestaurantOperationalTransitionResultCode =
  | 'success'
  | 'restaurant-not-found'
  | 'invalid-target-state'
  | 'invalid-timestamp'
  | 'no-state-change';

export interface RestaurantOperationalTransitionResult {
  success: boolean;
  code: RestaurantOperationalTransitionResultCode;
  message: string;
  restaurantId: string;
  previousState?: RestaurantOperationalState;
  newState?: RestaurantOperationalState;
  changed: boolean;
  operationalSince?: string;
}

/**
 * World state interface required for business domain operations.
 */
export interface BusinessWorldState {
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  offerings: Offering[];
}

/**
 * Authoritative business state transition: transitions a restaurant's operational availability.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Target restaurant exists in state.restaurants (code: 'restaurant-not-found')
 * 2. Target operational state is valid ('open' | 'closed') (code: 'invalid-target-state')
 * 3. Timestamp is a valid ISO 8601 string not in the future relative to state.worldTime (code: 'invalid-timestamp')
 *
 * Behavior:
 * - If targetState === restaurant.operationalState, returns success with changed: false (idempotent, no timestamp overwrite).
 * - If targetState !== restaurant.operationalState, updates restaurant.operationalState and restaurant.operationalSince.
 * - Guarantees zero state mutation on precondition failure.
 * - Does NOT alter agent locations, balances, activities, or knowledge.
 */
export function transitionRestaurantOperationalState(
  state: BusinessWorldState,
  restaurantId: string,
  targetState: RestaurantOperationalState,
  worldTime: string
): RestaurantOperationalTransitionResult {
  // 1. Confirm restaurant exists
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${restaurantId}" not found in world state`,
      restaurantId,
      changed: false,
    };
  }

  // 2. Validate targetState
  if (targetState !== 'open' && targetState !== 'closing-soon' && targetState !== 'closed') {
    return {
      success: false,
      code: 'invalid-target-state',
      message: `Invalid operational state: "${targetState}". Expected 'open', 'closing-soon', or 'closed'.`,
      restaurantId,
      previousState: restaurant.operationalState,
      changed: false,
      operationalSince: restaurant.operationalSince,
    };
  }

  // 3. Validate timestamp
  const timeMs = Date.parse(worldTime);
  const currentWorldMs = Date.parse(state.worldTime);
  if (Number.isNaN(timeMs) || (Number.isFinite(currentWorldMs) && timeMs > currentWorldMs)) {
    return {
      success: false,
      code: 'invalid-timestamp',
      message: `Invalid worldTime timestamp: "${worldTime}". Must be valid ISO 8601 string <= state.worldTime ("${state.worldTime}").`,
      restaurantId,
      previousState: restaurant.operationalState,
      changed: false,
      operationalSince: restaurant.operationalSince,
    };
  }

  const previousState = restaurant.operationalState;
  if (previousState === targetState) {
    return {
      success: true,
      code: 'no-state-change',
      message: `Restaurant "${restaurantId}" is already ${targetState}`,
      restaurantId,
      previousState,
      newState: targetState,
      changed: false,
      operationalSince: restaurant.operationalSince,
    };
  }

  // Authoritative mutation
  restaurant.operationalState = targetState;
  restaurant.operationalSince = worldTime;

  return {
    success: true,
    code: 'success',
    message: `Restaurant "${restaurantId}" operational state transitioned from ${previousState} to ${targetState}`,
    restaurantId,
    previousState,
    newState: targetState,
    changed: true,
    operationalSince: worldTime,
  };
}

/**
 * Authoritative query: evaluates whether a restaurant is open for business.
 * Pure query, zero state mutation.
 */
export function isRestaurantOpen(state: BusinessWorldState, restaurantId: string): boolean {
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  return restaurant !== undefined && restaurant.operationalState === 'open';
}

/**
 * Authoritative query: evaluates whether a restaurant is physically accessible (open or closing-soon).
 * Pure query, zero state mutation.
 */
export function isRestaurantAccessible(state: BusinessWorldState, restaurantId: string): boolean {
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  return restaurant !== undefined && (restaurant.operationalState === 'open' || restaurant.operationalState === 'closing-soon');
}

/**
 * Authoritative business domain validator.
 * Validates all business domain invariants across WorldState:
 * 1. Operational states are strictly 'open' | 'closing-soon' | 'closed'.
 * 2. OperationalSince timestamps are valid and <= state.worldTime.
 * 3. Restaurants reference existing buildings in state.places.
 * 4. Offerings reference existing restaurants in state.restaurants.
 * 5. Offering prices are non-negative finite integers with valid currency strings.
 */
export function validateBusinessAuthority(state: BusinessWorldState): void {
  const worldTimeMs = Date.parse(state.worldTime);
  const buildingIds = new Set<string>(
    state.places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  const restaurantIds = new Set<string>();

  for (const restaurant of state.restaurants) {
    if (restaurant.type !== 'restaurant') {
      throw new Error(
        `Business Authority Invariant Violated: restaurant "${restaurant.id}" has invalid type "${restaurant.type}"`
      );
    }

    if (
      restaurant.operationalState !== 'open' &&
      restaurant.operationalState !== 'closing-soon' &&
      restaurant.operationalState !== 'closed'
    ) {
      throw new Error(
        `Business Authority Invariant Violated: restaurant "${restaurant.id}" has invalid operationalState "${restaurant.operationalState}"`
      );
    }

    const sinceMs = Date.parse(restaurant.operationalSince);
    if (Number.isNaN(sinceMs)) {
      throw new Error(
        `Business Authority Invariant Violated: restaurant "${restaurant.id}" has invalid operationalSince timestamp "${restaurant.operationalSince}"`
      );
    }

    if (Number.isFinite(worldTimeMs) && sinceMs > worldTimeMs) {
      throw new Error(
        `Business Authority Invariant Violated: restaurant "${restaurant.id}" has operationalSince "${restaurant.operationalSince}" in the future relative to worldTime "${state.worldTime}"`
      );
    }

    if (!buildingIds.has(restaurant.buildingId)) {
      throw new Error(
        `Business Authority Invariant Violated: restaurant "${restaurant.id}" references non-existent buildingId "${restaurant.buildingId}"`
      );
    }

    restaurantIds.add(restaurant.id);
  }

  for (const offering of state.offerings) {
    if (offering.type !== 'offering') {
      throw new Error(
        `Business Authority Invariant Violated: offering "${offering.id}" has invalid type "${offering.type}"`
      );
    }

    if (!restaurantIds.has(offering.restaurantId)) {
      throw new Error(
        `Business Authority Invariant Violated: offering "${offering.id}" references non-existent restaurantId "${offering.restaurantId}"`
      );
    }

    if (
      typeof offering.priceMinor !== 'number' ||
      !Number.isFinite(offering.priceMinor) ||
      !Number.isInteger(offering.priceMinor) ||
      offering.priceMinor < 0
    ) {
      throw new Error(
        `Business Authority Invariant Violated: offering "${offering.id}" has invalid priceMinor ${offering.priceMinor}. Must be non-negative integer.`
      );
    }

    if (typeof offering.currency !== 'string' || offering.currency.trim() === '') {
      throw new Error(
        `Business Authority Invariant Violated: offering "${offering.id}" has invalid currency. Must be non-empty string.`
      );
    }
  }
}
