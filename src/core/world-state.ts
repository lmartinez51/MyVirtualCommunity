import { WorldClock } from './clock.js';
import { Place, PlaceType, validatePlaces } from './entities/geography.js';
import {
  Restaurant,
  RestaurantOperationalState,
  validateRestaurants,
} from './entities/restaurant.js';
import { Agent, AgentType, validateAgents } from './entities/agent.js';
import { Offering, validateOfferings } from './entities/offering.js';
import { createDevelopmentSeedWorld } from './seed.js';
import { HAVING_COFFEE_DURATION_MS } from './activities/having-coffee.js';
import {
  type Acquaintance,
  getCanonicalAgentPair,
  getAcquaintanceId,
  validateAcquaintances,
} from './entities/social.js';
import {
  DEVELOPMENT_NPC_WORK_SCHEDULE,
  formatHourUtc,
  DevelopmentNpcWorkSchedule,
} from './development-npc-schedule.js';

export const DEFAULT_WORLD_ID = 'juarez-el-paso';
export const CURRENT_WORLD_STATE_VERSION = 12;

export const QUALIFYING_ITEM_OFFERING_IDS = [
  'offering:development-coffee',
  'offering:development-pastry',
] as const;

export type QualifyingItemOfferingId = (typeof QUALIFYING_ITEM_OFFERING_IDS)[number];

export type ItemStatus = 'available' | 'consumed';

/**
 * Authoritative physical possession entity (Milestone 33).
 *
 * Governs current possession and consumable lifecycle authority.
 * Decoupled from immutable historical PurchaseRecord.
 */
export interface OwnedItem {
  readonly id: string; // Strict format: /^item:(\d+)$/
  readonly type: 'item';
  readonly offeringId: string;
  readonly name: string; // Acquisition snapshot or migration-reconstructed name
  readonly ownerAgentId: string; // Foreign key -> state.agents (agentType === 'player')
  readonly restaurantId: string; // Foreign key -> state.restaurants
  readonly sourcePurchaseId: string; // Foreign key -> state.purchases
  readonly acquiredAt: string; // ISO-8601 timestamp === purchase.worldTime
  status: ItemStatus; // Lifecycle state: 'available' | 'consumed'
  consumedAt: string | null; // ISO-8601 timestamp when consumed, or null
}

/**
 * Client-facing projection of an OwnedItem.
 * Omits internal foreign keys and lifecycle mutation fields.
 */
export interface ObservableOwnedItem {
  readonly id: string;
  readonly offeringId: string;
  readonly name: string;
  readonly restaurantId: string;
  readonly acquiredAt: string;
}

export type { Acquaintance, DevelopmentNpcWorkSchedule };
export {
  getCanonicalAgentPair,
  getAcquaintanceId,
  validateAcquaintances,
  DEVELOPMENT_NPC_WORK_SCHEDULE,
  formatHourUtc,
};

/**
 * Concrete historical fact recording a completed commercial purchase (Milestone 13).
 *
 * Captures immutable evidence that an agent purchased an offering at a restaurant
 * for a specific price at a specific world clock time.
 *
 * NOTE: This is an immutable historical record. It is NOT an authority for current state,
 * is NEVER queried to calculate current balances or operational states, and does NOT
 * represent a generic Event or EventStore system.
 */
export interface PurchaseRecord {
  readonly id: string;
  readonly worldTime: string;
  readonly playerId: string;
  readonly restaurantId: string;
  readonly offeringId: string;
  readonly amountMinor: number;
  readonly currency: string;
  /**
   * LEGACY HISTORICAL METADATA ONLY (Milestones 29-32).
   * In Schema Version 12+, this field is frozen and non-authoritative.
   * Runtime domain logic, perception projections, and client affordances
   * MUST evaluate OwnedItem.status instead.
   */
  readonly consumedAt?: string | null;
}

/**
 * Concrete historical fact recording a completed Having Coffee player activity (Milestone 14).
 *
 * Captures immutable evidence that a player completed having coffee associated with
 * a specific restaurant at a specific world clock time.
 *
 * Invariants:
 * - restaurantId: The restaurant at which the Having Coffee activity was started and with which the activity is associated.
 *   Does NOT represent the player's physical location at completedAt.
 * - completedAt: Exact theoretical completion boundary (startedAt + 15m), invariant to tick discovery.
 * - This is an immutable historical record. It is NEVER queried to calculate balances, determine active state,
 *   restrict movement, or drive simulation.
 */
export interface CoffeeCompletionRecord {
  id: string;
  playerId: string;
  restaurantId: string;
  startedAt: string;
  completedAt: string;
}

/**
 * Authoritative WorldState schema for Milestone 33.
 *
 * Contains:
 * - worldId: Identity of the regional world.
 * - version: Schema version (12 for Milestone 33).
 * - worldTime: Authoritative ISO-8601 string from WorldClock.
 * - places: Geographic containment hierarchy.
 * - restaurants: Spatial entities contained within Buildings with operationalState, operationalSince, balanceMinor, and currency.
 * - agents: Persistent agent identities with dynamic activityState, activitySince, locationId, balanceMinor, currency, and optional playerActivity.
 * - offerings: Commercial offerings made available by restaurants with deterministic pricing.
 * - purchases: Persistent append-only historical facts of completed purchases.
 * - coffeeCompletions: Persistent append-only historical facts of completed Having Coffee player activities.
 * - acquaintances: Persistent social acquaintance facts.
 * - items: Authoritative append-only physical possession entities.
 */
export interface WorldState {
  worldId: string;
  version: 12;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  coffeeCompletions: CoffeeCompletionRecord[];
  acquaintances: Acquaintance[];
  items: OwnedItem[];
}

/**
 * Historical WorldState schema for Milestone 32 (Version 11).
 * Preserved for strict pre-validation prior to v11 -> v12 migration.
 */
export interface WorldStateV11 {
  worldId: string;
  version: 11;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  coffeeCompletions: CoffeeCompletionRecord[];
  acquaintances: Acquaintance[];
}

/**
 * Creates the initial WorldState containing the synthetic development seed world
 * at the current authoritative WorldClock time.
 */
export function createInitialWorldState(
  clock: WorldClock,
  worldId: string = DEFAULT_WORLD_ID
): WorldState {
  const seed = createDevelopmentSeedWorld(clock.getTime());

  return {
    worldId,
    version: CURRENT_WORLD_STATE_VERSION,
    worldTime: clock.getTime(),
    places: seed.places,
    restaurants: seed.restaurants,
    agents: seed.agents,
    offerings: seed.offerings,
    purchases: [],
    coffeeCompletions: [],
    acquaintances: [],
    items: [],
  };
}

/**
 * Takes a snapshot of current WorldState with the latest time from the authoritative WorldClock.
 */
export function snapshotWorldState(
  clock: WorldClock,
  state: Omit<WorldState, 'worldTime'>
): WorldState {
  return {
    worldId: state.worldId,
    version: state.version as 12,
    worldTime: clock.getTime(),
    places: state.places,
    restaurants: state.restaurants,
    agents: state.agents,
    offerings: state.offerings,
    purchases: [...state.purchases],
    coffeeCompletions: [...state.coffeeCompletions],
    acquaintances: [...state.acquaintances],
    items: [...state.items],
  };
}

/**
 * Performs an instantaneous, explicit authoritative spatial transition for an Agent.
 *
 * Validates target place existence, updates only the agent's locationId, and guarantees
 * zero mutation on failure.
 *
 * NOTE: This is an instantaneous state transition. It does NOT advance WorldClock,
 * does NOT alter activityState or activitySince, and does NOT imply movement physics,
 * walking, or navigation.
 */
export function transitionAgentLocation(
  state: WorldState,
  agentId: string,
  targetPlaceId: string
): Agent {
  if (typeof targetPlaceId !== 'string' || targetPlaceId.trim() === '') {
    throw new Error('Cannot transition agent location: targetPlaceId must be a non-empty string');
  }

  const targetPlace = state.places.find((p) => p.id === targetPlaceId);
  if (!targetPlace) {
    throw new Error(
      `Cannot transition agent "${agentId}": target place "${targetPlaceId}" does not exist in world state`
    );
  }

  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error(
      `Cannot transition agent location: agent "${agentId}" not found in world state`
    );
  }

  agent.locationId = targetPlaceId;
  return agent;
}

export type EnterRestaurantResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'restaurant-not-found'
  | 'restaurant-closed'
  | 'invalid-location'
  | 'already-inside';

export interface EnterRestaurantResult {
  success: boolean;
  code: EnterRestaurantResultCode;
  message: string;
  agentId: string;
  restaurantId: string;
}

export interface EnterRestaurantOptions {
  silent?: boolean;
}

/**
 * Authoritative interaction: A Player agent enters a Restaurant.
 *
 * Implements the minimal interaction cycle:
 * Intent -> Preconditions -> Authoritative State Transition -> Result
 *
 * Preconditions:
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 4. Agent is not already inside the restaurant (code: 'already-inside')
 * 5. Restaurant is open: restaurant.operationalState === 'open' (code: 'restaurant-closed')
 * 6. Agent is located at the restaurant's containing building: agent.locationId === restaurant.buildingId (code: 'invalid-location')
 *
 * Transition:
 * Updates agent.locationId = restaurant.id.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter operationalState, operationalSince, or buildingId of the restaurant.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT affect NPC agents or geography.
 * - Is NOT invoked by the simulation tick.
 */
export function enterRestaurant(
  state: WorldState,
  agentId: string,
  restaurantId: string,
  options: EnterRestaurantOptions = {}
): EnterRestaurantResult {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  if (agent.agentType !== 'player') {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${restaurantId}" not found in world state`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  if (agent.locationId === restaurant.id) {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'already-inside',
      message: `Agent "${agentId}" is already inside restaurant "${restaurantId}"`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  if (restaurant.operationalState !== 'open') {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'restaurant-closed',
      message: `Restaurant "${restaurantId}" is closed (operationalState: "${restaurant.operationalState}")`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  if (agent.locationId !== restaurant.buildingId) {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'invalid-location',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not at containing building "${restaurant.buildingId}"`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  agent.locationId = restaurant.id;

  const result: EnterRestaurantResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully entered restaurant "${restaurantId}"`,
    agentId,
    restaurantId,
  };

  if (!options.silent) {
    console.log(`[INTERACTION] Agent "${agentId}" entered restaurant "${restaurantId}"`);
  }

  return result;
}

export type ExitRestaurantResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'restaurant-not-found'
  | 'not-inside-restaurant';

export interface ExitRestaurantResult {
  success: boolean;
  code: ExitRestaurantResultCode;
  message: string;
  agentId: string;
  restaurantId: string;
  buildingId?: string;
}

/**
 * Authoritative interaction: A Player agent exits a Restaurant.
 *
 * Implements the concrete interior exit operation for Milestone 10:
 * Player exits the Restaurant and returns to its containing Building.
 *
 * Preconditions:
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 4. Agent is currently inside that restaurant: agent.locationId === restaurant.id (code: 'not-inside-restaurant')
 *
 * Transition:
 * Updates agent.locationId = restaurant.buildingId.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter operationalState, operationalSince, or buildingId of the restaurant.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT cancel, restart, or alter playerActivity.
 * - Does NOT affect balances, offerings, NPC agents, or geography.
 * - Is NOT invoked by the simulation tick.
 */
export function exitRestaurant(
  state: WorldState,
  agentId: string,
  restaurantId: string
): ExitRestaurantResult {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: ExitRestaurantResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      restaurantId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to exit restaurant "${restaurantId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (agent.agentType !== 'player') {
    const result: ExitRestaurantResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      restaurantId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to exit restaurant "${restaurantId}": ${result.message} (${result.code})`
    );
    return result;
  }

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    const result: ExitRestaurantResult = {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${restaurantId}" not found in world state`,
      agentId,
      restaurantId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to exit restaurant "${restaurantId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (agent.locationId !== restaurant.id) {
    const result: ExitRestaurantResult = {
      success: false,
      code: 'not-inside-restaurant',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not inside restaurant "${restaurantId}"`,
      agentId,
      restaurantId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to exit restaurant "${restaurantId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Authoritative state transition: player returns to containing building
  agent.locationId = restaurant.buildingId;

  const result: ExitRestaurantResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully exited restaurant "${restaurantId}" into building "${restaurant.buildingId}"`,
    agentId,
    restaurantId,
    buildingId: restaurant.buildingId,
  };

  console.log(
    `[INTERACTION] Agent "${agentId}" exited restaurant "${restaurantId}" into building "${restaurant.buildingId}"`
  );

  return result;
}

export type LeaveBuildingResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'building-not-found'
  | 'not-at-building'
  | 'street-not-found';

export interface LeaveBuildingResult {
  success: boolean;
  code: LeaveBuildingResultCode;
  message: string;
  agentId: string;
  buildingId: string;
  streetId?: string;
}

/**
 * Authoritative interaction: A Player agent leaves a Building.
 *
 * Implements the concrete Building -> Street exit operation for Milestone 10:
 * Player leaves the Building and reaches its containing Street.
 *
 * Preconditions:
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Building exists in WorldState.places and is of type 'building' (code: 'building-not-found')
 * 4. Agent is currently located at that building: agent.locationId === building.id (code: 'not-at-building')
 * 5. Building has a valid containing Street parent in WorldState.places (code: 'street-not-found')
 *
 * Transition:
 * Updates agent.locationId = building.parentId (the street ID).
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT cancel, restart, or alter playerActivity.
 * - Does NOT affect balances, offerings, restaurants, NPC agents, or geography.
 * - Is NOT invoked by the simulation tick.
 */
export function leaveBuilding(
  state: WorldState,
  agentId: string,
  buildingId: string
): LeaveBuildingResult {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (agent.agentType !== 'player') {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  const building = state.places.find((p) => p.id === buildingId);
  if (!building || building.type !== 'building') {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'building-not-found',
      message: `Building "${buildingId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (agent.locationId !== building.id) {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'not-at-building',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not at building "${buildingId}"`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (!building.parentId) {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'street-not-found',
      message: `Building "${buildingId}" has no parent street`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  const street = state.places.find((p) => p.id === building.parentId && p.type === 'street');
  if (!street) {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'street-not-found',
      message: `Containing street "${building.parentId}" for building "${buildingId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Authoritative state transition: player moves to containing street
  agent.locationId = street.id;

  const result: LeaveBuildingResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully left building "${buildingId}" into street "${street.id}"`,
    agentId,
    buildingId,
    streetId: street.id,
  };

  console.log(
    `[INTERACTION] Agent "${agentId}" left building "${buildingId}" into street "${street.id}"`
  );

  return result;
}

export type EnterBuildingResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'building-not-found'
  | 'invalid-location'
  | 'already-inside';

export interface EnterBuildingResult {
  success: boolean;
  code: EnterBuildingResultCode;
  message: string;
  agentId: string;
  buildingId: string;
  streetId?: string;
}

/**
 * Authoritative interaction: A Player agent enters a Building from its containing Street (Milestone 16).
 *
 * Implements the concrete Street -> Building entry operation, completing the bidirectional
 * local spatial movement loop:
 * Street <-> Building <-> Restaurant
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Building exists in WorldState.places and is of type 'building' (code: 'building-not-found')
 * 4. Player is not already inside the target building: agent.locationId !== building.id (code: 'already-inside')
 * 5. Player is currently located at the target building's parent street:
 *    building has a valid parent street and agent.locationId === building.parentId (code: 'invalid-location')
 *
 * Transition:
 * Updates agent.locationId = building.id.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT cancel, restart, or alter playerActivity.
 * - Does NOT affect balances, offerings, restaurants, NPC agents, history, or geography.
 * - Is NOT invoked by the simulation tick.
 */
export function enterBuilding(
  state: WorldState,
  agentId: string,
  buildingId: string
): EnterBuildingResult {
  // 1. Agent exists
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: EnterBuildingResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 2. Agent is a player
  if (agent.agentType !== 'player') {
    const result: EnterBuildingResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 3. Target exists and is a building Place
  const building = state.places.find((p) => p.id === buildingId);
  if (!building || building.type !== 'building') {
    const result: EnterBuildingResult = {
      success: false,
      code: 'building-not-found',
      message: `Building "${buildingId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 4. Player is not already inside the target building
  if (agent.locationId === building.id) {
    const result: EnterBuildingResult = {
      success: false,
      code: 'already-inside',
      message: `Agent "${agentId}" is already inside building "${buildingId}"`,
      agentId,
      buildingId,
      streetId: building.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 5. Player is currently located at the target building's parent street
  const street = state.places.find((p) => p.id === building.parentId && p.type === 'street');
  if (!street || agent.locationId !== street.id) {
    const result: EnterBuildingResult = {
      success: false,
      code: 'invalid-location',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not at containing street "${building.parentId}" for building "${buildingId}"`,
      agentId,
      buildingId,
      streetId: building.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Authoritative state transition: player enters building
  agent.locationId = building.id;

  const result: EnterBuildingResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully entered building "${buildingId}" from street "${street.id}"`,
    agentId,
    buildingId,
    streetId: street.id,
  };

  console.log(
    `[INTERACTION] Agent "${agentId}" entered building "${buildingId}" from street "${street.id}"`
  );

  return result;
}

export type TraverseStreetResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'not-on-street'
  | 'target-not-found'
  | 'target-not-street'
  | 'already-on-street'
  | 'different-neighborhood';

export interface TraverseStreetResult {
  success: boolean;
  code: TraverseStreetResultCode;
  message: string;
  agentId: string;
  originStreetId?: string;
  targetStreetId: string;
  neighborhoodId?: string;
}

/**
 * Authoritative interaction: A Player agent traverses from their current Street
 * to another sibling Street within the same containing Neighborhood (Milestone 20-A).
 *
 * Implements the concrete Street -> Sibling Street traversal operation, establishing
 * branching intra-neighborhood spatial topology:
 * Neighborhood -> [Street A <-> Street B]
 *
 * Preconditions (evaluated in strict deterministic order):
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Agent's current location resolves to a Place of type 'street' (code: 'not-on-street')
 * 4. Target place exists in WorldState.places (code: 'target-not-found')
 * 5. Target place is of type 'street' (code: 'target-not-street')
 * 6. Target street is not the agent's current street: targetStreet.id !== originStreet.id (code: 'already-on-street')
 * 7. Target street and origin street share the identical parent neighborhood (code: 'different-neighborhood')
 *
 * Transition:
 * Updates agent.locationId = targetStreet.id.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT cancel, restart, or alter playerActivity.
 * - Does NOT affect balances, offerings, restaurants, NPC agents, history, or geography.
 * - Is NOT invoked by the simulation tick.
 * - Instantaneous and coordinate-free: connectivity is purely shared parent containment.
 */
export function traverseToStreet(
  state: WorldState,
  agentId: string,
  targetStreetId: string
): TraverseStreetResult {
  // 1. Agent exists
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      targetStreetId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 2. Agent is a player
  if (agent.agentType !== 'player') {
    const result: TraverseStreetResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      targetStreetId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 3. Current location resolves to a Place of type 'street'
  const originStreet = state.places.find((p) => p.id === agent.locationId && p.type === 'street');
  if (!originStreet) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'not-on-street',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not on a street`,
      agentId,
      targetStreetId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 4. Target exists in WorldState.places
  const targetPlace = state.places.find((p) => p.id === targetStreetId);
  if (!targetPlace) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'target-not-found',
      message: `Target street "${targetStreetId}" not found in world state`,
      agentId,
      originStreetId: originStreet.id,
      targetStreetId,
      neighborhoodId: originStreet.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 5. Target is a street
  if (targetPlace.type !== 'street') {
    const result: TraverseStreetResult = {
      success: false,
      code: 'target-not-street',
      message: `Target place "${targetStreetId}" is not a street (type: "${targetPlace.type}")`,
      agentId,
      originStreetId: originStreet.id,
      targetStreetId,
      neighborhoodId: originStreet.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 6. Target is not current street
  if (targetPlace.id === originStreet.id) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'already-on-street',
      message: `Agent "${agentId}" is already on street "${targetStreetId}"`,
      agentId,
      originStreetId: originStreet.id,
      targetStreetId,
      neighborhoodId: originStreet.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 7. Sibling street check: both streets must share identical parent neighborhood
  if (
    !originStreet.parentId ||
    !targetPlace.parentId ||
    originStreet.parentId !== targetPlace.parentId
  ) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'different-neighborhood',
      message: `Target street "${targetStreetId}" (neighborhood: "${targetPlace.parentId}") is not in the same neighborhood as origin street "${originStreet.id}" (neighborhood: "${originStreet.parentId}")`,
      agentId,
      originStreetId: originStreet.id,
      targetStreetId,
      neighborhoodId: originStreet.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Authoritative state transition: player moves to target street
  agent.locationId = targetPlace.id;

  const result: TraverseStreetResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully traversed from street "${originStreet.id}" to street "${targetPlace.id}" in neighborhood "${originStreet.parentId}"`,
    agentId,
    originStreetId: originStreet.id,
    targetStreetId: targetPlace.id,
    neighborhoodId: originStreet.parentId,
  };

  console.log(
    `[INTERACTION] Agent "${agentId}" traversed from street "${originStreet.id}" to street "${targetPlace.id}"`
  );

  return result;
}

/**
 * Queries all commercial offerings associated with a given restaurant.
 *
 * NOTE: This is a pure structural world state query. It does NOT mutate WorldState,
 * does NOT check operational hours or purchase eligibility, and returns the offerings
 * regardless of whether the restaurant is currently open or closed.
 * If the restaurant does not exist or has no offerings, returns an empty array.
 */
export function getRestaurantOfferings(
  state: WorldState,
  restaurantId: string
): Offering[] {
  if (typeof restaurantId !== 'string' || restaurantId.trim() === '') {
    return [];
  }
  return state.offerings.filter((o) => o.restaurantId === restaurantId);
}

export type PurchaseOfferingResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'restaurant-not-found'
  | 'not-inside-restaurant'
  | 'restaurant-closed'
  | 'offering-not-found'
  | 'offering-not-at-restaurant'
  | 'currency-mismatch'
  | 'insufficient-funds';

export interface PurchaseOfferingResult {
  success: boolean;
  code: PurchaseOfferingResultCode;
  message: string;
  playerId: string;
  offeringId: string;
  restaurantId?: string;
  amountMinor?: number;
  currency?: string;
  playerBalanceAfter?: number;
  restaurantBalanceAfter?: number;
  itemId?: string;
  purchaseId?: string;
}

export interface PurchaseOfferingOptions {
  restaurantId?: string;
  silent?: boolean;
}

/**
 * Authoritative interaction: A Player purchases a Commercial Offering from a Restaurant.
 *
 * Atomically transfers price from player balance to restaurant balance.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. The agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. The agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. The restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 4. The player is currently inside that restaurant: agent.locationId === restaurant.id (code: 'not-inside-restaurant')
 * 5. The restaurant is currently open: restaurant.operationalState === 'open' (code: 'restaurant-closed')
 * 6. The offering exists in WorldState.offerings (code: 'offering-not-found')
 * 7. The offering belongs to the specified restaurant: offering.restaurantId === restaurant.id (code: 'offering-not-at-restaurant')
 * 8. The offering currency is compatible with the balances involved (code: 'currency-mismatch')
 * 9. The player has sufficient funds: player.balanceMinor >= offering.priceMinor (code: 'insufficient-funds')
 *
 * Guarantees zero state mutation on any precondition failure.
 */
export function purchaseOffering(
  state: WorldState,
  playerId: string,
  offeringId: string,
  restaurantIdOrOptions?: string | PurchaseOfferingOptions,
  maybeOptions?: PurchaseOfferingOptions
): PurchaseOfferingResult {
  const options: PurchaseOfferingOptions =
    typeof restaurantIdOrOptions === 'object' && restaurantIdOrOptions !== null
      ? restaurantIdOrOptions
      : (maybeOptions ?? {});

  const specifiedRestaurantId =
    typeof restaurantIdOrOptions === 'string'
      ? restaurantIdOrOptions
      : options.restaurantId;

  // 1. Resolve the agent and confirm existence
  const agent = state.agents.find((a) => a.id === playerId);
  if (!agent) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${playerId}" not found in world state`,
      playerId,
      offeringId,
      restaurantId: specifiedRestaurantId,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 2. Confirm agent is a player
  if (agent.agentType !== 'player') {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${agent.agentType}")`,
      playerId,
      offeringId,
      restaurantId: specifiedRestaurantId,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // Resolve target restaurant
  const offeringCandidate = state.offerings.find((o) => o.id === offeringId);
  const targetRestaurantId =
    specifiedRestaurantId ??
    offeringCandidate?.restaurantId ??
    agent.locationId;

  // 3. Confirm restaurant exists
  const restaurant = state.restaurants.find((r) => r.id === targetRestaurantId);
  if (!restaurant) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${targetRestaurantId}" not found in world state`,
      playerId,
      offeringId,
      restaurantId: targetRestaurantId,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 4. Confirm player is inside that restaurant
  if (agent.locationId !== restaurant.id) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'not-inside-restaurant',
      message: `Player "${playerId}" is at location "${agent.locationId}", not inside restaurant "${restaurant.id}"`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 5. Confirm restaurant is open
  if (restaurant.operationalState !== 'open') {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'restaurant-closed',
      message: `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}")`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 6. Confirm offering exists
  const offering = state.offerings.find((o) => o.id === offeringId);
  if (!offering) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'offering-not-found',
      message: `Offering "${offeringId}" not found in world state`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 7. Confirm offering belongs to the specified restaurant
  if (offering.restaurantId !== restaurant.id) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'offering-not-at-restaurant',
      message: `Offering "${offeringId}" belongs to restaurant "${offering.restaurantId}", not "${restaurant.id}"`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 8. Confirm currency compatibility
  if (agent.currency !== offering.currency || restaurant.currency !== offering.currency) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'currency-mismatch',
      message: `Currency mismatch: player="${agent.currency}", restaurant="${restaurant.currency}", offering="${offering.currency}"`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 9. Confirm player has sufficient funds
  if (agent.balanceMinor < offering.priceMinor) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'insufficient-funds',
      message: `Insufficient funds: player has ${agent.balanceMinor} ${agent.currency}, required ${offering.priceMinor} ${offering.currency}`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
      amountMinor: offering.priceMinor,
      currency: offering.currency,
      playerBalanceAfter: agent.balanceMinor,
      restaurantBalanceAfter: restaurant.balanceMinor,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 10 & 11. Calculate new balances and commit both atomically
  agent.balanceMinor -= offering.priceMinor;
  restaurant.balanceMinor += offering.priceMinor;

  // 12. Record immutable historical fact of completed purchase (Milestone 13)
  const purchaseRecord: PurchaseRecord = {
    id: `purchase:${state.purchases.length + 1}`,
    worldTime: state.worldTime,
    playerId: agent.id,
    restaurantId: restaurant.id,
    offeringId: offering.id,
    amountMinor: offering.priceMinor,
    currency: offering.currency,
    consumedAt: null,
  };
  state.purchases.push(purchaseRecord);

  // 13. Instantiate authoritative OwnedItem for qualifying offerings (Milestone 33)
  let createdItemId: string | undefined;
  if (
    offering.id === 'offering:development-coffee' ||
    offering.id === 'offering:development-pastry'
  ) {
    const ownedItem: OwnedItem = {
      id: `item:${state.items.length + 1}`,
      type: 'item',
      offeringId: offering.id,
      name: offering.name, // Live acquisition snapshot
      ownerAgentId: agent.id,
      restaurantId: restaurant.id,
      sourcePurchaseId: purchaseRecord.id,
      acquiredAt: state.worldTime,
      status: 'available',
      consumedAt: null,
    };
    state.items.push(ownedItem);
    createdItemId = ownedItem.id;
  }

  const result: PurchaseOfferingResult = {
    success: true,
    code: 'success',
    message: `Player "${playerId}" successfully purchased offering "${offeringId}" for ${offering.priceMinor} ${offering.currency}`,
    playerId,
    offeringId,
    restaurantId: restaurant.id,
    amountMinor: offering.priceMinor,
    currency: offering.currency,
    playerBalanceAfter: agent.balanceMinor,
    restaurantBalanceAfter: restaurant.balanceMinor,
    itemId: createdItemId,
    purchaseId: purchaseRecord.id,
  };

  if (!options.silent) {
    console.log(
      `[purchase] player=${playerId} offering=${offeringId} amount=${offering.priceMinor} ${offering.currency} record=${purchaseRecord.id}${createdItemId ? ` item=${createdItemId}` : ''}`
    );
    console.log(
      `[purchase] success playerBalance=${agent.balanceMinor} restaurantBalance=${restaurant.balanceMinor}`
    );
  }

  return result;
}

export type StartHavingCoffeeResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'restaurant-not-found'
  | 'not-inside-restaurant'
  | 'restaurant-closed'
  | 'purchase-required'
  | 'activity-already-active';

export interface StartHavingCoffeeResult {
  success: boolean;
  code: StartHavingCoffeeResultCode;
  message: string;
  playerId: string;
  restaurantId?: string;
  activity?: 'having-coffee';
  startedAt?: string;
  completedAt?: string | null;
  purchaseId?: string;
  itemId?: string;
}

/**
 * Authoritative interaction: A Player starts the "Having Coffee" activity.
 *
 * Implements the concrete time-bound player activity for Milestone 9, with authoritative
 * purchase ledger verification and deterministic single-use consumption (Milestone 29 Correction).
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Target restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 4. Player is located inside the restaurant: agent.locationId === restaurant.id (code: 'not-inside-restaurant')
 * 5. Restaurant is currently open: restaurant.operationalState === 'open' (code: 'restaurant-closed')
 * 6. Restaurant offers coffee offering: 'offering:development-coffee' (code: 'purchase-required')
 * 7. An eligible unconsumed purchase exists in state.purchases for this player, restaurant, and offering (code: 'purchase-required')
 * 8. Player is not already performing having-coffee: playerActivity.activity !== 'having-coffee' || completedAt !== null (code: 'activity-already-active')
 *
 * State transition on success:
 * - chosenPurchase.consumedAt = state.worldTime (atomically marked consumed; replay prevented)
 * - agent.playerActivity = { activity: 'having-coffee', startedAt: state.worldTime, completedAt: null, restaurantId: restaurant.id }
 *
 * Invariants:
 * - Guarantees zero state mutation on any failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent.activityState ('idle' | 'active') or agent.activitySince.
 * - Does NOT alter balances, offerings, or geography.
 * - Is NOT invoked by the simulation tick.
 */
export function startHavingCoffee(
  state: WorldState,
  playerId: string,
  _legacyReceipt?: unknown
): StartHavingCoffeeResult {
  // 1. Resolve agent
  const agent = state.agents.find((a) => a.id === playerId);
  if (!agent) {
    return {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${playerId}" not found in world state`,
      playerId,
    };
  }

  // 2. Confirm agent is a player
  if (agent.agentType !== 'player') {
    return {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${agent.agentType}")`,
      playerId,
    };
  }

  // 3. Establish that player's location resolves to a valid Restaurant entity
  const isPlace = state.places.some((p) => p.id === agent.locationId);
  if (isPlace) {
    return {
      success: false,
      code: 'not-inside-restaurant',
      message: `Player "${playerId}" is at place "${agent.locationId}", not inside a restaurant`,
      playerId,
    };
  }

  const restaurant = state.restaurants.find((r) => r.id === agent.locationId);
  if (!restaurant) {
    return {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${agent.locationId}" not found in world state`,
      playerId,
      restaurantId: agent.locationId,
    };
  }

  // 4. Confirm restaurant is open
  if (restaurant.operationalState !== 'open') {
    return {
      success: false,
      code: 'restaurant-closed',
      message: `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}")`,
      playerId,
      restaurantId: restaurant.id,
    };
  }

  // Confirm restaurant offers coffee
  const offering = state.offerings.find(
    (o) => o.id === 'offering:development-coffee' && o.restaurantId === restaurant.id
  );
  if (!offering) {
    return {
      success: false,
      code: 'purchase-required',
      message: `Restaurant "${restaurant.id}" does not offer "offering:development-coffee"`,
      playerId,
      restaurantId: restaurant.id,
    };
  }

  // Legacy receipt check: if explicitly provided as an argument (legacy callers/tests)
  if (arguments.length >= 3) {
    if (_legacyReceipt === undefined || _legacyReceipt === null || typeof _legacyReceipt !== 'object') {
      return {
        success: false,
        code: 'purchase-required',
        message: `Purchase required: player "${playerId}" must provide a valid purchase receipt for Coffee at "${restaurant.id}"`,
        playerId,
        restaurantId: restaurant.id,
      };
    }
    const r = _legacyReceipt as Record<string, unknown>;
    if (
      r.success === false ||
      r.code !== 'success' ||
      (typeof r.playerId === 'string' && r.playerId !== playerId) ||
      (typeof r.offeringId === 'string' && r.offeringId !== 'offering:development-coffee') ||
      (typeof r.restaurantId === 'string' && r.restaurantId !== restaurant.id)
    ) {
      return {
        success: false,
        code: 'purchase-required',
        message: `Purchase required: player "${playerId}" must provide a valid successful purchase receipt for Coffee at "${restaurant.id}"`,
        playerId,
        restaurantId: restaurant.id,
      };
    }
  }

  // 5. Confirm player is not already performing having-coffee
  if (agent.playerActivity?.activity === 'having-coffee' && agent.playerActivity.completedAt === null) {
    return {
      success: false,
      code: 'activity-already-active',
      message: `Player "${playerId}" is already performing activity "having-coffee"`,
      playerId,
      restaurantId: restaurant.id,
      activity: 'having-coffee',
      startedAt: agent.playerActivity.startedAt,
      completedAt: null,
    };
  }

  // 6. Authoritative possession lookup in state.items: find eligible available coffee items (Milestone 33)
  const eligibleItems = (state.items ?? []).filter(
    (item) =>
      item.ownerAgentId === playerId &&
      item.offeringId === 'offering:development-coffee' &&
      item.status === 'available' &&
      item.restaurantId === restaurant.id
  );

  if (eligibleItems.length === 0) {
    return {
      success: false,
      code: 'purchase-required',
      message: `Purchase required: player "${playerId}" does not possess an available Coffee purchased at restaurant "${restaurant.id}"`,
      playerId,
      restaurantId: restaurant.id,
    };
  }

  // Deterministic FIFO selection: sort by acquiredAt ascending, then numeric item id ascending
  eligibleItems.sort((a, b) => {
    const timeDiff = Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt);
    if (timeDiff !== 0) return timeDiff;
    const idA = parseInt(a.id.slice(5), 10) || 0;
    const idB = parseInt(b.id.slice(5), 10) || 0;
    return idA - idB;
  });
  const chosenItem = eligibleItems[0];

  // 7. Commit state transition atomically
  const startedAt = state.worldTime;
  chosenItem.status = 'consumed';
  chosenItem.consumedAt = startedAt;
  agent.playerActivity = {
    activity: 'having-coffee',
    startedAt,
    completedAt: null,
    restaurantId: restaurant.id,
  };

  console.log(
    `[activity] player=${playerId} activity=having-coffee started=${startedAt} duration=15m itemId=${chosenItem.id} purchaseId=${chosenItem.sourcePurchaseId}`
  );

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" started activity "having-coffee" at ${startedAt}`,
    playerId,
    restaurantId: restaurant.id,
    activity: 'having-coffee',
    startedAt,
    completedAt: null,
    purchaseId: chosenItem.sourcePurchaseId,
    itemId: chosenItem.id,
  };
}

/**
 * Determines whether two agents have established mutual acquaintance (Milestone 25).
 *
 * Evaluation is strictly symmetric: isAgentAcquainted(state, A, B) === isAgentAcquainted(state, B, A).
 * Self-acquaintance is impossible and returns false.
 */
export function isAgentAcquainted(
  state: WorldState,
  agentIdA: string,
  agentIdB: string
): boolean {
  if (agentIdA === agentIdB) {
    return false;
  }
  const [first, second] = getCanonicalAgentPair(agentIdA, agentIdB);
  return state.acquaintances.some(
    (acq) => acq.agentIds[0] === first && acq.agentIds[1] === second
  );
}

export type GreetAgentResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'npc-not-found'
  | 'target-not-npc'
  | 'player-location-invalid'
  | 'npc-location-invalid'
  | 'agents-not-co-located';

export interface GreetAgentResult {
  success: boolean;
  code: GreetAgentResultCode;
  message: string;
  playerId: string;
  npcId: string;
  response?: string;
}

/**
 * Authoritative interaction: A Player greets an NPC (Milestone 11, extended in Milestone 18-A).
 *
 * Validates that both agents exist, have valid types, have valid spatial presence,
 * and occupy the same physical location.
 *
 * In Milestone 18-A, a successful greeting yields a deterministic contextual reaction (`response`)
 * from the NPC based strictly on the NPC's authoritative world state (locationId and activityState).
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is actually a player: player.agentType === 'player' (code: 'player-not-player')
 * 3. Target agent exists in WorldState.agents (code: 'npc-not-found')
 * 4. Target agent is actually an NPC: npc.agentType === 'npc' (code: 'target-not-npc')
 * 5. Player has a valid spatial location in WorldState (code: 'player-location-invalid')
 * 6. Target NPC has a valid spatial location in WorldState (code: 'npc-location-invalid')
 * 7. Player and NPC occupy the same spatial location: player.locationId === npc.locationId (code: 'agents-not-co-located')
 *
 * Invariants:
 * - Pure deterministic evaluation with ZERO state mutation on success or failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, activityState, balances, or playerActivity.
 * - Does NOT create relationship data, memory, history, reputation, events, or dialogue trees.
 * - Does NOT embed internal logging; returns deterministic GreetAgentResult.
 */
export function greetAgent(
  state: WorldState,
  playerId: string,
  npcId: string
): GreetAgentResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 2. Confirm agent is actually a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
      npcId,
    };
  }

  // 3. Confirm target NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Target NPC "${npcId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 4. Confirm target agent is actually an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'target-not-npc',
      message: `Target agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      playerId,
      npcId,
    };
  }

  // Helper to check whether a location resolves to an existing Place or Restaurant
  const isValidLocation = (locationId: string): boolean => {
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return false;
    }
    return (
      state.places.some((p) => p.id === locationId) ||
      state.restaurants.some((r) => r.id === locationId)
    );
  };

  // 5. Confirm player location is valid
  if (!isValidLocation(player.locationId)) {
    return {
      success: false,
      code: 'player-location-invalid',
      message: `Player "${playerId}" has invalid spatial location "${player.locationId}"`,
      playerId,
      npcId,
    };
  }

  // 6. Confirm NPC location is valid
  if (!isValidLocation(npc.locationId)) {
    return {
      success: false,
      code: 'npc-location-invalid',
      message: `NPC "${npcId}" has invalid spatial location "${npc.locationId}"`,
      playerId,
      npcId,
    };
  }

  // 7. Confirm player and NPC occupy the same spatial location
  if (player.locationId !== npc.locationId) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Player "${playerId}" (at "${player.locationId}") and NPC "${npcId}" (at "${npc.locationId}") are not co-located`,
      playerId,
      npcId,
    };
  }

  // Deterministic NPC contextual reaction (Milestone 18-A, extended M22, social M25)
  const isAcquainted = isAgentAcquainted(state, playerId, npcId);
  let response: string;
  if (
    npc.locationId === 'restaurant:development-restaurant' &&
    npc.activityState === 'active'
  ) {
    response = isAcquainted
      ? "Welcome back. Good to see you again. I'm working here today."
      : "Welcome. I'm working here today.";
  } else if (
    npc.locationId === 'building:development-residence' &&
    npc.activityState === 'idle'
  ) {
    response = isAcquainted
      ? "Hello again. Good to see you. I'm resting at home right now."
      : "Hello. I'm resting at home right now.";
  } else if (
    npc.locationId === 'street:development-street' &&
    npc.activityState === 'idle'
  ) {
    response = isAcquainted
      ? "Good morning again. On my way to the restaurant."
      : "Good morning. On my way to the restaurant.";
  } else if (
    npc.locationId === 'street:avenida-juarez' &&
    npc.activityState === 'idle'
  ) {
    response = isAcquainted
      ? "Good evening again. It's pleasant to walk down Avenida Juárez after work."
      : "Good evening. It's pleasant to walk down Avenida Juárez after work.";
  } else if (
    npc.locationId === 'building:development-building' &&
    npc.activityState === 'idle'
  ) {
    response = isAcquainted
      ? "Hello again. Good to see you around the building today."
      : "Hello. I'm around the building today.";
  } else {
    response = isAcquainted
      ? "Hello again. Good to see you."
      : 'Hello there.';
  }

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" successfully greeted NPC "${npcId}" at "${player.locationId}"`,
    playerId,
    npcId,
    response,
  };
}

export type IntroduceToAgentResultCode =
  | 'success'
  | 'already-acquainted'
  | 'player-not-found'
  | 'player-not-player'
  | 'npc-not-found'
  | 'target-not-npc'
  | 'player-location-invalid'
  | 'npc-location-invalid'
  | 'agents-not-co-located';

export interface IntroduceToAgentResult {
  success: boolean;
  code: IntroduceToAgentResultCode;
  message: string;
  playerId?: string;
  npcId?: string;
  acquaintance?: Acquaintance;
}

/**
 * Authoritative social interaction: A Player introduces themselves to an NPC (Milestone 25).
 *
 * Creates a persistent, symmetric, binary acquaintance fact in WorldState.acquaintances.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is actually a player: player.agentType === 'player' (code: 'player-not-player')
 * 3. Target agent exists in WorldState.agents (code: 'npc-not-found')
 * 4. Target agent is actually an NPC: npc.agentType === 'npc' (code: 'target-not-npc')
 * 5. Player has a valid spatial location in WorldState (code: 'player-location-invalid')
 * 6. Target NPC has a valid spatial location in WorldState (code: 'npc-location-invalid')
 * 7. Player and NPC occupy the same spatial location: player.locationId === npc.locationId (code: 'agents-not-co-located')
 *
 * Invariants:
 * - Idempotent: If already acquainted, returns success with code 'already-acquainted' and zero mutation.
 * - Pure deterministic mutation on success: pushes single canonical Acquaintance record.
 * - Zero mutation on failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, activityState, balances, or playerActivity.
 * - Does NOT create relationship meters, memory, history, reputation, events, or dialogue trees.
 */
export function introduceToAgent(
  state: WorldState,
  playerId: string,
  npcId: string
): IntroduceToAgentResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 2. Confirm agent is actually a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
      npcId,
    };
  }

  // 3. Confirm target NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Target NPC "${npcId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 4. Confirm target agent is actually an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'target-not-npc',
      message: `Target agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      playerId,
      npcId,
    };
  }

  // Helper to check whether a location resolves to an existing Place or Restaurant
  const isValidLocation = (locationId: string): boolean => {
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return false;
    }
    return (
      state.places.some((p) => p.id === locationId) ||
      state.restaurants.some((r) => r.id === locationId)
    );
  };

  // 5. Confirm player location is valid
  if (!isValidLocation(player.locationId)) {
    return {
      success: false,
      code: 'player-location-invalid',
      message: `Player "${playerId}" has invalid spatial location "${player.locationId}"`,
      playerId,
      npcId,
    };
  }

  // 6. Confirm NPC location is valid
  if (!isValidLocation(npc.locationId)) {
    return {
      success: false,
      code: 'npc-location-invalid',
      message: `NPC "${npcId}" has invalid spatial location "${npc.locationId}"`,
      playerId,
      npcId,
    };
  }

  // 7. Confirm player and NPC occupy the same spatial location
  if (player.locationId !== npc.locationId) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Player "${playerId}" (at "${player.locationId}") and NPC "${npcId}" (at "${npc.locationId}") are not co-located`,
      playerId,
      npcId,
    };
  }

  // 8. Idempotency: Check if already acquainted
  const [first, second] = getCanonicalAgentPair(playerId, npcId);
  const existing = state.acquaintances.find(
    (a) => a.agentIds[0] === first && a.agentIds[1] === second
  );
  if (existing) {
    return {
      success: true,
      code: 'already-acquainted',
      message: `Player "${playerId}" and NPC "${npcId}" are already acquainted`,
      playerId,
      npcId,
      acquaintance: existing,
    };
  }

  // 9. Create canonical Acquaintance record
  const acquaintance: Acquaintance = {
    id: getAcquaintanceId(playerId, npcId),
    agentIds: [first, second],
    establishedAt: state.worldTime,
  };

  state.acquaintances.push(acquaintance);

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" and NPC "${npcId}" introduced successfully`,
    playerId,
    npcId,
    acquaintance,
  };
}

export type InquireAgentScheduleResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'npc-not-found'
  | 'target-not-npc'
  | 'agents-not-co-located'
  | 'not-acquainted'
  | 'no-scheduled-work';

export interface InquireAgentScheduleResult {
  success: boolean;
  code: InquireAgentScheduleResultCode;
  message: string;
  playerId: string;
  npcId: string;
  schedule?: {
    workplaceId: string;
    shiftStart: string;
    shiftEnd: string;
  };
}

/**
 * Authoritative social interaction: A Player inquires about an acquainted NPC's work schedule (Milestone 26).
 *
 * Provides minimal relational inquiry & epistemic grounding without introducing generic
 * Knowledge, Memory, Dialogue, or Schedule systems.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is actually a player: player.agentType === 'player' (code: 'player-not-player')
 * 3. Target agent exists in WorldState.agents (code: 'npc-not-found')
 * 4. Target agent is actually an NPC: npc.agentType === 'npc' (code: 'target-not-npc')
 * 5. Player and NPC occupy the same valid physical location:
 *    isValidLocation(player.locationId) && isValidLocation(npc.locationId) && player.locationId === npc.locationId
 *    (code: 'agents-not-co-located')
 * 6. Player and NPC have established mutual acquaintance (code: 'not-acquainted')
 * 7. Target NPC has a currently defined scheduled workplace in the world model (code: 'no-scheduled-work')
 *
 * Invariants:
 * - Pure deterministic evaluation with ZERO state mutation on success or failure.
 * - Does NOT persist inquiry, memory, or knowledge state.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, activityState, balances, or playerActivity.
 * - Does NOT return offeringId, pricing, menu, inventory, or future product predictions.
 * - Discloses strictly the factual workplaceId, shiftStart, and shiftEnd.
 */
export function inquireAgentSchedule(
  state: WorldState,
  playerId: string,
  npcId: string
): InquireAgentScheduleResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 2. Confirm agent is actually a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
      npcId,
    };
  }

  // 3. Confirm target NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Target NPC "${npcId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 4. Confirm target agent is actually an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'target-not-npc',
      message: `Target agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      playerId,
      npcId,
    };
  }

  // Helper to check whether a location resolves to an existing Place or Restaurant
  const isValidLocation = (locationId: string): boolean => {
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return false;
    }
    return (
      state.places.some((p) => p.id === locationId) ||
      state.restaurants.some((r) => r.id === locationId)
    );
  };

  // 5. Confirm player and NPC occupy the same valid physical location
  if (
    !isValidLocation(player.locationId) ||
    !isValidLocation(npc.locationId) ||
    player.locationId !== npc.locationId
  ) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Player "${playerId}" (at "${player.locationId}") and NPC "${npcId}" (at "${npc.locationId}") are not co-located at a valid physical location`,
      playerId,
      npcId,
    };
  }

  // 6. Confirm agents are acquainted
  const isAcquainted = isAgentAcquainted(state, playerId, npcId);
  if (!isAcquainted) {
    return {
      success: false,
      code: 'not-acquainted',
      message: `Player "${playerId}" and NPC "${npcId}" are not acquainted`,
      playerId,
      npcId,
    };
  }

  // 7. Confirm NPC has a defined scheduled workplace in the world model
  if (npc.id === DEVELOPMENT_NPC_WORK_SCHEDULE.npcId) {
    const workplaceExists = state.restaurants.some(
      (r) => r.id === DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId
    );
    if (workplaceExists) {
      const shiftStart = formatHourUtc(DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHourUtc);
      const shiftEnd = formatHourUtc(DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHourUtc);
      return {
        success: true,
        code: 'success',
        message: `I work at the development restaurant from ${shiftStart} to ${shiftEnd}.`,
        playerId,
        npcId,
        schedule: {
          workplaceId: DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId,
          shiftStart,
          shiftEnd,
        },
      };
    }
  }

  // Fallback for NPCs with no scheduled workplace
  return {
    success: false,
    code: 'no-scheduled-work',
    message: `NPC "${npcId}" has no scheduled workplace`,
    playerId,
    npcId,
  };
}

export type InspectCurrentLocationResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'player-location-invalid';

/**
 * Observable projection of an Agent co-located with the player (Milestone 12).
 *
 * NOTE: Exposes ONLY intentionally observable attributes (id, name, agentType).
 * Does NOT expose internal state such as activityState, activitySince, balanceMinor,
 * currency, or playerActivity.
 */
export interface ObservableAgent {
  id: string;
  name: string;
  agentType: AgentType;
  isAcquainted?: boolean;
}

/**
 * Observable projection of a commercial offering available at an inspected Restaurant (Milestone 12).
 *
 * NOTE: Exposes only intentional observable commercial fields (id, name, priceMinor, currency).
 * Does NOT return the raw domain Offering entity and does NOT include restaurantId.
 */
export interface ObservableOffering {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
}

/**
 * Concise projection of a neighboring or child place for spatial affordance perception (Milestone 21-A).
 */
export interface ObservablePlaceSummary {
  id: string;
  name: string;
  type: PlaceType | 'restaurant';
}

export const DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID = 'opportunity:development-pan-dulce';

/**
 * Concrete read-only projection of a situational world opportunity (Milestone 23).
 *
 * Derived ephemerally from authoritative WorldState during local perception.
 * Does NOT represent persistent entity state, quest state, or player tracking.
 */
export interface ObservableOpportunity {
  id: string;
  name: string;
  description: string;
  offeringId: string;
  restaurantId?: string;
}

/**
 * Evaluates active situational opportunities for a restaurant (Milestone 23, extended M27).
 *
 * Scoped strictly to authoritative world conditions:
 * - Restaurant is open
 * - Dev NPC is at the restaurant
 * - Dev NPC is active
 * - Pan Dulce offering exists in state.offerings
 *
 * Invariant: Pure deterministic derivation, zero state mutation.
 */
function evaluateRestaurantOpportunity(
  state: WorldState,
  restaurant: Restaurant
): ObservableOpportunity | null {
  if (restaurant.id === 'restaurant:development-restaurant') {
    const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc');
    const hasPastry = state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);

    if (
      restaurant.operationalState === 'open' &&
      devNpc !== undefined &&
      devNpc.locationId === restaurant.id &&
      devNpc.activityState === 'active' &&
      hasPastry
    ) {
      return {
        id: DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID,
        name: 'Pan Dulce Available',
        description: 'Pan Dulce is available while the restaurant is open and the NPC is working.',
        offeringId: DEVELOPMENT_PASTRY_OFFERING_ID,
        restaurantId: restaurant.id,
      };
    }
  }
  return null;
}

/**
 * Observed world location representation for the player's current spatial presence (Milestone 12, extended M21-A, M23).
 */
export interface ObservedLocation {
  id: string;
  type: PlaceType | 'restaurant';
  name: string;
  parentId?: string | null;                      // Geographic parent for Places (null for City)
  buildingId?: string;                           // Containing Building ID for Restaurants
  operationalState?: RestaurantOperationalState; // Only present for Restaurants
  offerings?: ObservableOffering[];              // Projected offerings (only present for Restaurants)
  agents: ObservableAgent[];                     // Projected co-located agents occupying this exact locationId
  accessibleBuildings?: ObservablePlaceSummary[];  // Direct child buildings (present at Street)
  neighboringStreets?: ObservablePlaceSummary[];   // Sibling streets in same neighborhood (present at Street)
  parentStreet?: ObservablePlaceSummary;           // Containing street (present at Building)
  containedRestaurants?: ObservablePlaceSummary[]; // Contained restaurants (present at Building)
  parentBuilding?: ObservablePlaceSummary;         // Containing building (present at Restaurant)
  opportunities?: ObservableOpportunity[];        // Projected situational opportunities (present at Restaurant)
}

export interface InspectCurrentLocationResult {
  success: boolean;
  code: InspectCurrentLocationResultCode;
  message: string;
  playerId: string;
  locationId?: string;
  location?: ObservedLocation;
  playerInventory?: ObservableOwnedItem[];
}

/**
 * Authoritative perception: A Player inspects their current world location (Milestone 12).
 *
 * Transforms currently authoritative WorldState data at the player's spatial location
 * into a deterministic, read-only observation result.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is actually a player: player.agentType === 'player' (code: 'player-not-player')
 * 3. Player's locationId resolves to an existing Place or Restaurant in WorldState (code: 'player-location-invalid')
 *
 * Observation projection:
 * - Scoped strictly to player's current locationId (the perception boundary).
 * - For Places: exposes id, type, name, and geographic parentId.
 * - For Restaurants: exposes id, type ('restaurant'), name, containing buildingId,
 *   authoritative operationalState, and projected offerings (ObservableOffering).
 * - For Agents: exposes co-located agents mapped to ObservableAgent (id, name, agentType).
 *
 * Invariants:
 * - Pure deterministic evaluation with ZERO state mutation on success or failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, balances, activities, offerings, or geography.
 * - Does NOT create observation history, memory, relationships, reputation, or events.
 * - Does NOT embed internal logging; returns deterministic InspectCurrentLocationResult.
 */
export function inspectCurrentLocation(
  state: WorldState,
  playerId: string
): InspectCurrentLocationResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
    };
  }

  // 2. Confirm agent is actually a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
    };
  }

  // 3. Resolve location: check places first, then restaurants
  const place = state.places.find((p) => p.id === player.locationId);
  const restaurant = !place ? state.restaurants.find((r) => r.id === player.locationId) : undefined;

  if (!place && !restaurant) {
    return {
      success: false,
      code: 'player-location-invalid',
      message: `Player "${playerId}" has invalid or non-existent spatial location "${player.locationId}"`,
      playerId,
      locationId: player.locationId,
    };
  }

  // 4. Gather observable agents occupying this exact locationId
  const coLocatedAgents: ObservableAgent[] = state.agents
    .filter((a) => a.locationId === player.locationId)
    .map((a) => {
      const obs: ObservableAgent = {
        id: a.id,
        name: a.name,
        agentType: a.agentType,
      };
      if (a.id !== player.id) {
        obs.isAcquainted = isAgentAcquainted(state, player.id, a.id);
      }
      return obs;
    });

  // 5. Construct ObservedLocation
  let observedLocation: ObservedLocation;

  if (place) {
    observedLocation = {
      id: place.id,
      type: place.type,
      name: place.name,
      parentId: place.parentId,
      agents: coLocatedAgents,
    };

    if (place.type === 'street') {
      // Direct child buildings of current street
      observedLocation.accessibleBuildings = state.places
        .filter((p) => p.type === 'building' && p.parentId === place.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
        }));

      // Sibling streets in the same Neighborhood (only if parentId is not null)
      if (place.parentId !== null) {
        observedLocation.neighboringStreets = state.places
          .filter((p) => p.type === 'street' && p.parentId === place.parentId && p.id !== place.id)
          .map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
          }));
      }
    } else if (place.type === 'building') {
      // Containing Street referenced by currentBuilding.parentId (if valid)
      if (place.parentId !== null) {
        const parentStreet = state.places.find((p) => p.id === place.parentId && p.type === 'street');
        if (parentStreet) {
          observedLocation.parentStreet = {
            id: parentStreet.id,
            name: parentStreet.name,
            type: parentStreet.type,
          };
        }
      }

      // Contained restaurants whose buildingId === currentBuilding.id
      const containedRestaurants = state.restaurants.filter((r) => r.buildingId === place.id);
      observedLocation.containedRestaurants = containedRestaurants.map((r) => ({
        id: r.id,
        name: r.name,
        type: 'restaurant',
      }));

      // Milestone 27: Public storefront opportunities exposed by directly contained restaurants
      const buildingOpportunities: ObservableOpportunity[] = [];
      for (const r of containedRestaurants) {
        const opp = evaluateRestaurantOpportunity(state, r);
        if (opp && !buildingOpportunities.some((o) => o.id === opp.id)) {
          buildingOpportunities.push(opp);
        }
      }
      if (buildingOpportunities.length > 0) {
        observedLocation.opportunities = buildingOpportunities;
      }
    }
  } else {
    const rawOfferings = getRestaurantOfferings(state, restaurant!.id);
    const observableOfferings: ObservableOffering[] = rawOfferings.map((o) => ({
      id: o.id,
      name: o.name,
      priceMinor: o.priceMinor,
      currency: o.currency,
    }));

    // Milestone 23: Concrete derived situational opportunity (extended M27 with restaurantId)
    const opp = evaluateRestaurantOpportunity(state, restaurant!);
    const opportunities: ObservableOpportunity[] = opp ? [opp] : [];

    observedLocation = {
      id: restaurant!.id,
      type: 'restaurant',
      name: restaurant!.name,
      buildingId: restaurant!.buildingId,
      operationalState: restaurant!.operationalState,
      offerings: observableOfferings,
      agents: coLocatedAgents,
      opportunities,
    };

    // Containing Building identified by restaurant.buildingId (if valid)
    if (restaurant!.buildingId) {
      const parentBuilding = state.places.find(
        (p) => p.id === restaurant!.buildingId && p.type === 'building'
      );
      if (parentBuilding) {
        observedLocation.parentBuilding = {
          id: parentBuilding.id,
          name: parentBuilding.name,
          type: parentBuilding.type,
        };
      }
    }
  }

  // 6. Gather player's private available inventory (Milestone 33)
  const playerInventory: ObservableOwnedItem[] = state.items
    ? state.items
        .filter((i) => i.ownerAgentId === playerId && i.status === 'available')
        .map((i) => ({
          id: i.id,
          offeringId: i.offeringId,
          name: i.name,
          restaurantId: i.restaurantId,
          acquiredAt: i.acquiredAt,
        }))
    : [];

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" successfully inspected current location "${player.locationId}"`,
    playerId,
    locationId: player.locationId,
    location: observedLocation,
    playerInventory,
  };
}

export type InspectPlayerHistoryResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player';

/**
 * Observable historical projection of a player's past actions (Milestone 17-A).
 *
 * Exposes the player's completed purchases and completed Having Coffee activities
 * as safe projections isolated from internal WorldState arrays.
 */
export interface ObservablePlayerHistory {
  playerId: string;
  purchases: PurchaseRecord[];
  coffeeCompletions: CoffeeCompletionRecord[];
}

export interface InspectPlayerHistoryResult {
  success: boolean;
  code: InspectPlayerHistoryResultCode;
  message: string;
  playerId: string;
  history?: ObservablePlayerHistory;
}

/**
 * Authoritative perception: A Player inspects their own persistent historical records (Milestone 17-A).
 *
 * Exposes a safe, read-only projection of the player's completed purchases and completed
 * Having Coffee activities recorded in WorldState.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'player-not-player')
 *
 * Projection & Isolation:
 * - Returns only records where record.playerId === playerId.
 * - Produces fresh shallow copies of record objects in a new array, ensuring callers
 *   cannot mutate the authoritative WorldState historical collections.
 * - Preserves exact recorded historical values and deterministic append order.
 * - Does not recalculate, rewrite, or validate against current state.
 *
 * Invariants:
 * - Pure deterministic evaluation with ZERO state mutation on success or failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, balances, activities, or operational states.
 * - Does NOT create or append historical records.
 * - Does NOT participate in world simulation.
 */
export function inspectPlayerHistory(
  state: WorldState,
  playerId: string
): InspectPlayerHistoryResult {
  // 1. Confirm agent exists
  const agent = state.agents.find((a) => a.id === playerId);
  if (!agent) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
    };
  }

  // 2. Confirm agent is a player
  if (agent.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${agent.agentType}")`,
      playerId,
    };
  }

  // 3. Project safe copies of player-scoped records preserving append order
  const purchases: PurchaseRecord[] = state.purchases
    .filter((p) => p.playerId === playerId)
    .map((p) => ({ ...p }));

  const coffeeCompletions: CoffeeCompletionRecord[] = state.coffeeCompletions
    .filter((c) => c.playerId === playerId)
    .map((c) => ({ ...c }));

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" successfully inspected personal history`,
    playerId,
    history: {
      playerId,
      purchases,
      coffeeCompletions,
    },
  };
}

export const DEVELOPMENT_PASTRY_OFFERING_ID = 'offering:development-pastry';

export type MakeDevelopmentOfferingAvailableResultCode =
  | 'success'
  | 'npc-not-found'
  | 'npc-not-npc'
  | 'npc-not-active'
  | 'restaurant-not-found'
  | 'npc-not-at-restaurant'
  | 'restaurant-not-open'
  | 'offering-already-available';

export interface MakeDevelopmentOfferingAvailableResult {
  success: boolean;
  code: MakeDevelopmentOfferingAvailableResultCode;
  message: string;
  npcId: string;
  restaurantId: string;
  offeringId?: string;
}

/**
 * Concrete world action: An active NPC makes a commercial offering available at a restaurant (Milestone 19-A).
 *
 * Deterministically adds the development pastry offering ('offering:development-pastry', 'Pan Dulce', $2.50 USD)
 * to state.offerings during the NPC's active shift at the development restaurant.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. NPC exists in WorldState.agents (code: 'npc-not-found')
 * 2. Agent is an NPC: agent.agentType === 'npc' (code: 'npc-not-npc')
 * 3. NPC is active: agent.activityState === 'active' (code: 'npc-not-active')
 * 4. Restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 5. NPC is currently located at the restaurant: agent.locationId === restaurant.id (code: 'npc-not-at-restaurant')
 * 6. Restaurant is currently open: restaurant.operationalState === 'open' (code: 'restaurant-not-open')
 * 7. Offering is not already available in state.offerings (code: 'offering-already-available')
 *
 * State Transition:
 * Appends the concrete Offering entity to state.offerings.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT mutate agent locations, balances, or activities.
 * - Does NOT introduce inventory, stock, recipes, ingredients, or food production concepts.
 */
export function makeDevelopmentOfferingAvailable(
  state: WorldState,
  npcId: string,
  restaurantId: string
): MakeDevelopmentOfferingAvailableResult {
  // 1. Confirm NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Agent "${npcId}" not found in world state`,
      npcId,
      restaurantId,
    };
  }

  // 2. Confirm agent is an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'npc-not-npc',
      message: `Agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      npcId,
      restaurantId,
    };
  }

  // 3. Confirm NPC is active
  if (npc.activityState !== 'active') {
    return {
      success: false,
      code: 'npc-not-active',
      message: `NPC "${npcId}" is not active (activityState: "${npc.activityState}")`,
      npcId,
      restaurantId,
    };
  }

  // 4. Confirm restaurant exists
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${restaurantId}" not found in world state`,
      npcId,
      restaurantId,
    };
  }

  // 5. Confirm NPC is located at the restaurant
  if (npc.locationId !== restaurant.id) {
    return {
      success: false,
      code: 'npc-not-at-restaurant',
      message: `NPC "${npcId}" is at location "${npc.locationId}", not at restaurant "${restaurant.id}"`,
      npcId,
      restaurantId,
    };
  }

  // 6. Confirm restaurant is open
  if (restaurant.operationalState !== 'open') {
    return {
      success: false,
      code: 'restaurant-not-open',
      message: `Restaurant "${restaurantId}" is not open (operationalState: "${restaurant.operationalState}")`,
      npcId,
      restaurantId,
    };
  }

  // 7. Confirm offering is not already available
  const existingOffering = state.offerings.find((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);
  if (existingOffering) {
    return {
      success: false,
      code: 'offering-already-available',
      message: `Offering "${DEVELOPMENT_PASTRY_OFFERING_ID}" is already available at restaurant "${existingOffering.restaurantId}"`,
      npcId,
      restaurantId,
      offeringId: existingOffering.id,
    };
  }

  // Authoritative state mutation: make offering available
  const newOffering: Offering = {
    id: DEVELOPMENT_PASTRY_OFFERING_ID,
    type: 'offering',
    name: 'Pan Dulce',
    restaurantId: restaurant.id,
    priceMinor: 250,
    currency: 'USD',
  };
  state.offerings.push(newOffering);

  return {
    success: true,
    code: 'success',
    message: `NPC "${npcId}" successfully made offering "${newOffering.id}" (${newOffering.name}) available at restaurant "${restaurantId}"`,
    npcId,
    restaurantId,
    offeringId: newOffering.id,
  };
}

export type RetireDevelopmentOfferingResultCode =
  | 'success'
  | 'npc-not-found'
  | 'npc-not-npc'
  | 'npc-not-active'
  | 'restaurant-not-found'
  | 'npc-not-at-restaurant'
  | 'offering-not-available';

export interface RetireDevelopmentOfferingResult {
  success: boolean;
  code: RetireDevelopmentOfferingResultCode;
  message: string;
  npcId: string;
  restaurantId: string;
  offeringId?: string;
}

/**
 * Concrete world action: An active NPC retires a commercial offering from a restaurant (Milestone 19-A).
 *
 * Deterministically removes the development pastry offering ('offering:development-pastry') from
 * state.offerings when the NPC's active restaurant shift concludes.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. NPC exists in WorldState.agents (code: 'npc-not-found')
 * 2. Agent is an NPC: agent.agentType === 'npc' (code: 'npc-not-npc')
 * 3. NPC is active: agent.activityState === 'active' (code: 'npc-not-active')
 * 4. Restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 5. NPC is currently located at the restaurant: agent.locationId === restaurant.id (code: 'npc-not-at-restaurant')
 * 6. Offering is currently available in state.offerings (code: 'offering-not-available')
 *
 * State Transition:
 * Removes the concrete Offering entity from state.offerings.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT invalidate or mutate historical PurchaseRecord entries referencing the retired offering.
 * - Does NOT mutate agent locations, balances, or activities.
 */
export function retireDevelopmentOffering(
  state: WorldState,
  npcId: string,
  restaurantId: string
): RetireDevelopmentOfferingResult {
  // 1. Confirm NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Agent "${npcId}" not found in world state`,
      npcId,
      restaurantId,
    };
  }

  // 2. Confirm agent is an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'npc-not-npc',
      message: `Agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      npcId,
      restaurantId,
    };
  }

  // 3. Confirm NPC is active
  if (npc.activityState !== 'active') {
    return {
      success: false,
      code: 'npc-not-active',
      message: `NPC "${npcId}" is not active (activityState: "${npc.activityState}")`,
      npcId,
      restaurantId,
    };
  }

  // 4. Confirm restaurant exists
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${restaurantId}" not found in world state`,
      npcId,
      restaurantId,
    };
  }

  // 5. Confirm NPC is located at the restaurant
  if (npc.locationId !== restaurant.id) {
    return {
      success: false,
      code: 'npc-not-at-restaurant',
      message: `NPC "${npcId}" is at location "${npc.locationId}", not at restaurant "${restaurant.id}"`,
      npcId,
      restaurantId,
    };
  }

  // 6. Confirm offering is currently available
  const offeringIndex = state.offerings.findIndex((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);
  if (offeringIndex === -1) {
    return {
      success: false,
      code: 'offering-not-available',
      message: `Offering "${DEVELOPMENT_PASTRY_OFFERING_ID}" is not available at restaurant "${restaurantId}"`,
      npcId,
      restaurantId,
    };
  }

  // Authoritative state mutation: retire offering
  state.offerings.splice(offeringIndex, 1);

  return {
    success: true,
    code: 'success',
    message: `NPC "${npcId}" successfully retired offering "${DEVELOPMENT_PASTRY_OFFERING_ID}" from restaurant "${restaurantId}"`,
    npcId,
    restaurantId,
    offeringId: DEVELOPMENT_PASTRY_OFFERING_ID,
  };
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 14 WorldState contract.
 * Enforces schema version 10, ISO timestamp, geographic hierarchy, spatial containment,
 * agent identities with dynamic activity state and optional playerActivity,
 * agent locationId referential integrity, agent balances, restaurant operational state,
 * restaurant balances, commercial offerings with restaurant references and deterministic pricing,
 * global entity ID uniqueness, immutable historical purchase records, and immutable historical
 * coffee completion records.
 */
export function validateWorldState(data: unknown): asserts data is WorldState {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== CURRENT_WORLD_STATE_VERSION) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version ${CURRENT_WORLD_STATE_VERSION}. Incompatible schemas must be rejected explicitly.`
    );
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  // Validate Places
  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  // Validate Restaurants referencing Buildings
  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  // Validate Agents with Place + Restaurant spatial referential integrity
  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  // Validate Offerings referencing Restaurants
  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  for (const agent of agents) {
    if (agent.playerActivity) {
      if (!validRestaurantIds.has(agent.playerActivity.restaurantId)) {
        throw new Error(
          `Invalid playerActivity for agent "${agent.id}": restaurantId "${agent.playerActivity.restaurantId}" references non-existent restaurant`
        );
      }
    }
  }

  // Global ID uniqueness across all entity collections
  const globalIdSet = new Set<string>();
  for (const place of places) {
    globalIdSet.add(place.id);
  }
  for (const restaurant of restaurants) {
    if (globalIdSet.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found across collections: "${restaurant.id}"`);
    }
    globalIdSet.add(restaurant.id);
  }
  for (const agent of agents) {
    if (globalIdSet.has(agent.id)) {
      throw new Error(`Duplicate entity id found across collections: "${agent.id}"`);
    }
    globalIdSet.add(agent.id);
  }
  for (const offering of offerings) {
    if (globalIdSet.has(offering.id)) {
      throw new Error(`Duplicate entity id found across collections: "${offering.id}"`);
    }
    globalIdSet.add(offering.id);
  }

  // Validate Purchases (Milestone 13: persistent historical facts)
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }

  const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));
  const restaurantMap = new Map<string, Restaurant>(restaurants.map((r) => [r.id, r]));
  const offeringMap = new Map<string, Offering>(offerings.map((o) => [o.id, o]));
  const purchaseIdSet = new Set<string>();

  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }

    const rec = p as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(`Invalid PurchaseRecord at index ${i}: id must be a non-empty string`);
    }

    if (purchaseIdSet.has(rec.id)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id);

    if (typeof rec.worldTime !== 'string' || rec.worldTime.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": worldTime must be a non-empty string`);
    }
    if (Number.isNaN(Date.parse(rec.worldTime))) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": worldTime must be a valid ISO-8601 timestamp. Received: "${rec.worldTime}"`
      );
    }

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": playerId must be a non-empty string`);
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": offeringId must be a non-empty string`);
    }
    const offeringEntity = offeringMap.get(rec.offeringId);
    if (!offeringEntity) {
      // Historical persistence: Allow retired offering:development-pastry records
      // while continuing to reject arbitrary non-existent offerings.
      if (rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID) {
        if (rec.restaurantId !== 'restaurant:development-restaurant') {
          throw new Error(
            `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "restaurant:development-restaurant", not "${rec.restaurantId}"`
          );
        }
      } else {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offeringId "${rec.offeringId}" references non-existent offering`
        );
      }
    } else {
      // Enforce structural consistency: offering must belong to recorded restaurant
      if (offeringEntity.restaurantId !== rec.restaurantId) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "${offeringEntity.restaurantId}", not "${rec.restaurantId}"`
        );
      }
    }

    if (
      typeof rec.amountMinor !== 'number' ||
      !Number.isInteger(rec.amountMinor) ||
      rec.amountMinor < 0
    ) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": amountMinor must be a non-negative integer`
      );
    }

    if (typeof rec.currency !== 'string' || rec.currency.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": currency must be a non-empty string`);
    }
    const expectedCurrency = offeringEntity
      ? offeringEntity.currency
      : rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
        ? 'USD'
        : undefined;
    if (expectedCurrency && rec.currency !== expectedCurrency) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": currency "${rec.currency}" does not match offering currency "${expectedCurrency}"`
      );
    }
    // Validate consumedAt (Milestone 29 Correction: single-use consequence tracking)
    if (rec.consumedAt !== undefined && rec.consumedAt !== null) {
      if (typeof rec.consumedAt !== 'string' || rec.consumedAt.trim() === '') {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a non-empty string or null`
        );
      }
      if (Number.isNaN(Date.parse(rec.consumedAt))) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a valid ISO-8601 timestamp string or null. Received: "${rec.consumedAt}"`
        );
      }
    } else {
      rec.consumedAt = null;
    }
  }

  // Validate Coffee Completions (Milestone 14: persistent historical facts)
  if (!Array.isArray(candidate.coffeeCompletions)) {
    throw new Error('Invalid WorldState: coffeeCompletions must be an array');
  }

  const coffeeCompletionIdSet = new Set<string>();

  for (let i = 0; i < candidate.coffeeCompletions.length; i++) {
    const c = candidate.coffeeCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(
        `Invalid CoffeeCompletionRecord at index ${i}: record must be a non-null object`
      );
    }

    const rec = c as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord at index ${i}: id must be a non-empty string`
      );
    }

    if (coffeeCompletionIdSet.has(rec.id)) {
      throw new Error(`Duplicate coffee completion record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    coffeeCompletionIdSet.add(rec.id);

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": playerId must be a non-empty string`
      );
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": restaurantId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.startedAt !== 'string' || rec.startedAt.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": startedAt must be a non-empty string`
      );
    }
    const startedMs = Date.parse(rec.startedAt);
    if (Number.isNaN(startedMs)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": startedAt must be a valid ISO-8601 timestamp. Received: "${rec.startedAt}"`
      );
    }

    if (typeof rec.completedAt !== 'string' || rec.completedAt.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt must be a non-empty string`
      );
    }
    const completedMs = Date.parse(rec.completedAt);
    if (Number.isNaN(completedMs)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt must be a valid ISO-8601 timestamp. Received: "${rec.completedAt}"`
      );
    }

    if (completedMs < startedMs) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") must be greater than or equal to startedAt ("${rec.startedAt}")`
      );
    }

    if (completedMs - startedMs !== HAVING_COFFEE_DURATION_MS) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") does not match exact 15-minute duration from startedAt ("${rec.startedAt}")`
      );
    }
    // NOTE: record.restaurantId === playerAgent.locationId is deliberately NOT enforced
    // because M10 allows the player to exit the restaurant while having coffee.
    // NOTE: A corresponding PurchaseRecord is deliberately NOT required.
  }

  // Validate Acquaintances (Milestone 25: persistent social facts)
  if (!Array.isArray(candidate.acquaintances)) {
    throw new Error('Invalid WorldState: acquaintances must be an array');
  }

  const agentIdSet = new Set<string>(agents.map((a) => a.id));
  validateAcquaintances(candidate.acquaintances as unknown[], agentIdSet);
  const acquaintances = candidate.acquaintances as Acquaintance[];

  for (const acq of acquaintances) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }

  // Validate Items (Milestone 33: authoritative physical possession entities)
  if (!Array.isArray(candidate.items)) {
    throw new Error('Invalid WorldState: items must be an array');
  }

  const itemIdSet = new Set<string>();
  const seenSourcePurchaseIds = new Set<string>();
  const itemBySourcePurchaseId = new Map<string, Record<string, unknown>>();
  const qualifyingOfferingIds = new Set<string>(QUALIFYING_ITEM_OFFERING_IDS);

  for (let i = 0; i < candidate.items.length; i++) {
    const itemRaw = candidate.items[i];
    if (typeof itemRaw !== 'object' || itemRaw === null) {
      throw new Error(`Invalid OwnedItem at index ${i}: item must be a non-null object`);
    }

    const item = itemRaw as Record<string, unknown>;

    // 1. ID format: /^item:\d+$/
    if (typeof item.id !== 'string' || !/^item:\d+$/.test(item.id)) {
      throw new Error(
        `Invalid OwnedItem at index ${i}: id must match format "item:<number>". Received: ${JSON.stringify(item.id)}`
      );
    }

    if (itemIdSet.has(item.id)) {
      throw new Error(`Duplicate item id found: "${item.id}"`);
    }
    if (globalIdSet.has(item.id)) {
      throw new Error(`Duplicate entity id found across collections: "${item.id}"`);
    }
    itemIdSet.add(item.id);
    globalIdSet.add(item.id);

    // 2. Type: 'item'
    if (item.type !== 'item') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": type must be "item". Received: ${JSON.stringify(item.type)}`
      );
    }

    // 3. Offering ID: must be in QUALIFYING_ITEM_OFFERING_IDS
    if (typeof item.offeringId !== 'string' || !qualifyingOfferingIds.has(item.offeringId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId must be a qualifying item offering. Received: ${JSON.stringify(item.offeringId)}`
      );
    }

    // 4. Name: non-empty string
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": name must be a non-empty string`);
    }

    // 5. Owner agent: exists and is player
    if (typeof item.ownerAgentId !== 'string' || item.ownerAgentId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": ownerAgentId must be a non-empty string`);
    }
    const ownerAgent = agentMap.get(item.ownerAgentId);
    if (!ownerAgent) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" references non-existent agent`
      );
    }
    if (ownerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" is not a player (agentType: "${ownerAgent.agentType}")`
      );
    }

    // 6. Restaurant: exists
    if (typeof item.restaurantId !== 'string' || item.restaurantId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(item.restaurantId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" references non-existent restaurant`
      );
    }

    // 7. Acquired timestamp: valid ISO-8601
    if (typeof item.acquiredAt !== 'string' || item.acquiredAt.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": acquiredAt must be a non-empty string`);
    }
    const acquiredMs = Date.parse(item.acquiredAt);
    if (Number.isNaN(acquiredMs)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt must be a valid ISO-8601 timestamp string. Received: "${item.acquiredAt}"`
      );
    }

    // 8. Status: 'available' | 'consumed'
    if (item.status !== 'available' && item.status !== 'consumed') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": status must be "available" or "consumed". Received: ${JSON.stringify(item.status)}`
      );
    }

    // 9. Consumed timestamp semantics
    if (item.status === 'available') {
      if (item.consumedAt !== null) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be null when status is "available". Received: ${JSON.stringify(item.consumedAt)}`
        );
      }
    } else {
      if (typeof item.consumedAt !== 'string' || item.consumedAt.trim() === '') {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a non-empty ISO-8601 timestamp when status is "consumed"`
        );
      }
      const consumedMs = Date.parse(item.consumedAt);
      if (Number.isNaN(consumedMs)) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a valid ISO-8601 timestamp string. Received: "${item.consumedAt}"`
        );
      }
      if (consumedMs < acquiredMs) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt ("${item.consumedAt}") must be greater than or equal to acquiredAt ("${item.acquiredAt}")`
        );
      }
    }

    // 10. Source purchase foreign key & Direction A check
    if (typeof item.sourcePurchaseId !== 'string' || item.sourcePurchaseId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": sourcePurchaseId must be a non-empty string`);
    }

    if (seenSourcePurchaseIds.has(item.sourcePurchaseId)) {
      throw new Error(
        `Duplicate sourcePurchaseId "${item.sourcePurchaseId}" found across items (violation of 1:1 cardinality)`
      );
    }
    seenSourcePurchaseIds.add(item.sourcePurchaseId);
    itemBySourcePurchaseId.set(item.sourcePurchaseId, item);

    const sourcePurchase = purchaseIdSet.has(item.sourcePurchaseId)
      ? (candidate.purchases as PurchaseRecord[]).find((p) => p.id === item.sourcePurchaseId)
      : undefined;

    if (!sourcePurchase) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": sourcePurchaseId "${item.sourcePurchaseId}" references non-existent purchase`
      );
    }

    // Direction A referential consistency
    if (sourcePurchase.playerId !== item.ownerAgentId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" does not match purchase playerId "${sourcePurchase.playerId}"`
      );
    }
    if (sourcePurchase.offeringId !== item.offeringId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId "${item.offeringId}" does not match purchase offeringId "${sourcePurchase.offeringId}"`
      );
    }
    if (sourcePurchase.restaurantId !== item.restaurantId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" does not match purchase restaurantId "${sourcePurchase.restaurantId}"`
      );
    }
    if (sourcePurchase.worldTime !== item.acquiredAt) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt "${item.acquiredAt}" does not match purchase worldTime "${sourcePurchase.worldTime}"`
      );
    }
  }

  // Direction B check: Every qualifying PurchaseRecord must have exactly one OwnedItem
  for (const p of candidate.purchases as PurchaseRecord[]) {
    if (qualifyingOfferingIds.has(p.offeringId)) {
      if (!itemBySourcePurchaseId.has(p.id)) {
        throw new Error(
          `Missing OwnedItem for qualifying purchase "${p.id}" (offering: "${p.offeringId}")`
        );
      }
    }
  }
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 32 (Version 11) WorldState contract.
 * Preserved for pre-migration integrity checking.
 */
export function validateWorldStateV11(data: unknown): asserts data is WorldStateV11 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== 11) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version 11. Incompatible schemas must be rejected explicitly.`
    );
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  // Validate Places
  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  // Validate Restaurants referencing Buildings
  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  // Validate Agents with Place + Restaurant spatial referential integrity
  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  // Validate Offerings referencing Restaurants
  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  for (const agent of agents) {
    if (agent.playerActivity) {
      if (!validRestaurantIds.has(agent.playerActivity.restaurantId)) {
        throw new Error(
          `Invalid playerActivity for agent "${agent.id}": restaurantId "${agent.playerActivity.restaurantId}" references non-existent restaurant`
        );
      }
    }
  }

  // Global ID uniqueness across all entity collections
  const globalIdSet = new Set<string>();
  for (const place of places) {
    globalIdSet.add(place.id);
  }
  for (const restaurant of restaurants) {
    if (globalIdSet.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found across collections: "${restaurant.id}"`);
    }
    globalIdSet.add(restaurant.id);
  }
  for (const agent of agents) {
    if (globalIdSet.has(agent.id)) {
      throw new Error(`Duplicate entity id found across collections: "${agent.id}"`);
    }
    globalIdSet.add(agent.id);
  }
  for (const offering of offerings) {
    if (globalIdSet.has(offering.id)) {
      throw new Error(`Duplicate entity id found across collections: "${offering.id}"`);
    }
    globalIdSet.add(offering.id);
  }

  // Validate Purchases
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }

  const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));
  const restaurantMap = new Map<string, Restaurant>(restaurants.map((r) => [r.id, r]));
  const offeringMap = new Map<string, Offering>(offerings.map((o) => [o.id, o]));
  const purchaseIdSet = new Set<string>();

  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }

    const rec = p as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(`Invalid PurchaseRecord at index ${i}: id must be a non-empty string`);
    }

    if (purchaseIdSet.has(rec.id)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id);

    if (typeof rec.worldTime !== 'string' || rec.worldTime.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": worldTime must be a non-empty string`);
    }
    if (Number.isNaN(Date.parse(rec.worldTime))) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": worldTime must be a valid ISO-8601 timestamp. Received: "${rec.worldTime}"`
      );
    }

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": playerId must be a non-empty string`);
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": offeringId must be a non-empty string`);
    }
    const offeringEntity = offeringMap.get(rec.offeringId);
    if (!offeringEntity) {
      if (rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID) {
        if (rec.restaurantId !== 'restaurant:development-restaurant') {
          throw new Error(
            `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "restaurant:development-restaurant", not "${rec.restaurantId}"`
          );
        }
      } else {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offeringId "${rec.offeringId}" references non-existent offering`
        );
      }
    } else {
      if (offeringEntity.restaurantId !== rec.restaurantId) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "${offeringEntity.restaurantId}", not "${rec.restaurantId}"`
        );
      }
    }

    if (
      typeof rec.amountMinor !== 'number' ||
      !Number.isInteger(rec.amountMinor) ||
      rec.amountMinor < 0
    ) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": amountMinor must be a non-negative integer`
      );
    }

    if (typeof rec.currency !== 'string' || rec.currency.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": currency must be a non-empty string`);
    }
    const expectedCurrency = offeringEntity
      ? offeringEntity.currency
      : rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
        ? 'USD'
        : undefined;
    if (expectedCurrency && rec.currency !== expectedCurrency) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": currency "${rec.currency}" does not match offering currency "${expectedCurrency}"`
      );
    }
    if (rec.consumedAt !== undefined && rec.consumedAt !== null) {
      if (typeof rec.consumedAt !== 'string' || rec.consumedAt.trim() === '') {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a non-empty string or null`
        );
      }
      if (Number.isNaN(Date.parse(rec.consumedAt))) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a valid ISO-8601 timestamp string or null. Received: "${rec.consumedAt}"`
        );
      }
    }
  }

  // Validate Coffee Completions
  if (!Array.isArray(candidate.coffeeCompletions)) {
    throw new Error('Invalid WorldState: coffeeCompletions must be an array');
  }

  const coffeeCompletionIdSet = new Set<string>();

  for (let i = 0; i < candidate.coffeeCompletions.length; i++) {
    const c = candidate.coffeeCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(
        `Invalid CoffeeCompletionRecord at index ${i}: record must be a non-null object`
      );
    }

    const rec = c as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord at index ${i}: id must be a non-empty string`
      );
    }

    if (coffeeCompletionIdSet.has(rec.id)) {
      throw new Error(`Duplicate coffee completion record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    coffeeCompletionIdSet.add(rec.id);

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": playerId must be a non-empty string`
      );
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": restaurantId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.startedAt !== 'string' || rec.startedAt.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": startedAt must be a non-empty string`
      );
    }
    const startedMs = Date.parse(rec.startedAt);
    if (Number.isNaN(startedMs)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": startedAt must be a valid ISO-8601 timestamp. Received: "${rec.startedAt}"`
      );
    }

    if (typeof rec.completedAt !== 'string' || rec.completedAt.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt must be a non-empty string`
      );
    }
    const completedMs = Date.parse(rec.completedAt);
    if (Number.isNaN(completedMs)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt must be a valid ISO-8601 timestamp. Received: "${rec.completedAt}"`
      );
    }

    if (completedMs < startedMs) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") must be greater than or equal to startedAt ("${rec.startedAt}")`
      );
    }

    if (completedMs - startedMs !== HAVING_COFFEE_DURATION_MS) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") does not match exact 15-minute duration from startedAt ("${rec.startedAt}")`
      );
    }
  }

  // Validate Acquaintances
  if (!Array.isArray(candidate.acquaintances)) {
    throw new Error('Invalid WorldState: acquaintances must be an array');
  }

  const agentIdSet = new Set<string>(agents.map((a) => a.id));
  validateAcquaintances(candidate.acquaintances as unknown[], agentIdSet);
  const acquaintances = candidate.acquaintances as Acquaintance[];

  for (const acq of acquaintances) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }
}

/**
 * Deterministically resolves the item name for v11 -> v12 migration.
 * Reconstructs offering name using live offerings or known historical offering identities.
 */
export function resolveMigrationItemName(offeringId: string, offerings: Offering[]): string {
  const liveOffering = offerings.find((o) => o.id === offeringId);
  if (liveOffering) {
    return liveOffering.name;
  }
  if (offeringId === 'offering:development-coffee') {
    return 'Coffee';
  }
  if (offeringId === 'offering:development-pastry' || offeringId === DEVELOPMENT_PASTRY_OFFERING_ID) {
    return 'Pan Dulce';
  }
  return 'Consumable Item';
}

/**
 * Migrates a valid Version 11 WorldState to Version 12.
 * Instantiates authoritative OwnedItem entities for qualifying historical purchases.
 */
export function migrateWorldStateV11ToV12(v11: WorldStateV11): WorldState {
  const qualifyingOfferingIds = new Set<string>(QUALIFYING_ITEM_OFFERING_IDS);
  const migratedItems: OwnedItem[] = [];

  for (const purchase of v11.purchases) {
    if (!qualifyingOfferingIds.has(purchase.offeringId)) {
      continue; // Direction B: Non-qualifying purchases produce zero items
    }

    const isConsumed =
      typeof purchase.consumedAt === 'string' && purchase.consumedAt.trim().length > 0;
    const status: ItemStatus = isConsumed ? 'consumed' : 'available';
    const consumedAt: string | null = isConsumed ? purchase.consumedAt : null;
    const name = resolveMigrationItemName(purchase.offeringId, v11.offerings);

    migratedItems.push({
      id: `item:${migratedItems.length + 1}`,
      type: 'item',
      offeringId: purchase.offeringId,
      name,
      ownerAgentId: purchase.playerId,
      restaurantId: purchase.restaurantId,
      sourcePurchaseId: purchase.id,
      acquiredAt: purchase.worldTime,
      status,
      consumedAt,
    });
  }

  return {
    worldId: v11.worldId,
    version: 12,
    worldTime: v11.worldTime,
    places: v11.places,
    restaurants: v11.restaurants,
    agents: v11.agents,
    offerings: v11.offerings,
    purchases: v11.purchases,
    coffeeCompletions: v11.coffeeCompletions,
    acquaintances: v11.acquaintances,
    items: migratedItems,
  };
}
