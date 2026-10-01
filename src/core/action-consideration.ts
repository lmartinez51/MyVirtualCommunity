/**
 * Agent-Specific Action Consideration (Milestone 48 & Milestone 49).
 *
 * Implements pure evaluation deriving whether a specific action is reasonable
 * for an agent to consider based on currently acquired epistemic state (AgentKnowledgeRecord)
 * or active situational opportunities, and spatial/temporal context.
 *
 * Invariants:
 * - Pure derivation: ZERO state mutation, zero disk writes, zero side-effects.
 * - Epistemic provenance: depends on what the observing agent knows or perceives, not omniscient world truth.
 * - SCHEDULE KNOWLEDGE != CURRENT NPC PRESENCE: Does not assert physical NPC presence.
 * - ACTION CONSIDERATION != DOMAIN AUTHORIZATION: Does not bypass authoritative preconditions.
 * - OPPORTUNITY != CONSIDERATION: Consideration is an agent-specific derived representation,
 *   not a persistent knowledge record or opportunity entity.
 * - Type-only dependency on WorldState to prevent runtime circular dependencies.
 */

import type { WorldState } from './world-state.js';
import {
  DEVELOPMENT_NPC_WORK_SCHEDULE,
  isTimeWithinScheduleInterval,
} from './development-npc-schedule.js';
import { resolveLocationTimeZone } from './civil-time.js';

export const DEVELOPMENT_PASTRY_OFFERING_ID = 'offering:development-pastry';
export const DEVELOPMENT_COFFEE_OFFERING_ID = 'offering:development-coffee';

export type ActionConsiderationAction =
  | 'enterRestaurant'
  | 'exitRestaurant'
  | 'purchaseOffering'
  | 'startAccompaniedActivity';

export type ActionConsiderationReason =
  | 'known-npc-schedule'
  | 'active-opportunity'
  | 'co-located-companion-refreshment'
  | 'restaurant-closing-soon';

export interface ActionConsideration {
  action: ActionConsiderationAction;
  targetId: string;
  considered: boolean;
  reason?: ActionConsiderationReason;
  description?: string;
}

/**
 * Pure evaluator deriving whether entering the restaurant to seek the development NPC
 * is a reasonable action for the player to consider (Milestone 48).
 *
 * Preconditions for considered = true (all must be satisfied):
 * 1. Player exists and is of agentType 'player'.
 * 2. Target NPC exists in world state (does NOT check physical presence at restaurant).
 * 3. Target Restaurant exists in world state (does NOT check operationalState).
 * 4. Player is located at the restaurant's containing building.
 * 5. Player has legitimately acquired 'agent-schedule' knowledge for the NPC.
 * 6. Current World Time is within the known schedule [shiftStart, shiftEnd).
 */
export function evaluateScheduleInformedRestaurantConsideration(
  state: WorldState,
  playerId: string,
  npcId: string = DEVELOPMENT_NPC_WORK_SCHEDULE.npcId,
  restaurantId: string = DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId
): ActionConsideration {
  // 1. Confirm player exists and is player
  const player = state.agents.find((a) => a.id === playerId);
  if (!player || player.agentType !== 'player') {
    return { action: 'enterRestaurant', targetId: restaurantId, considered: false };
  }

  // 2. Confirm NPC exists (does NOT check presence at restaurant)
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return { action: 'enterRestaurant', targetId: restaurantId, considered: false };
  }

  // 3. Confirm Restaurant exists (does NOT check operationalState)
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return { action: 'enterRestaurant', targetId: restaurantId, considered: false };
  }

  // 4. Confirm player is at the containing building
  if (player.locationId !== restaurant.buildingId) {
    return { action: 'enterRestaurant', targetId: restaurantId, considered: false };
  }

  // 5. Confirm player has legitimately acquired agent-schedule knowledge for the NPC
  const scheduleRecord = state.knowledge.find(
    (k) => k.agentId === playerId && k.factType === 'agent-schedule' && k.subjectId === npcId
  );
  if (!scheduleRecord) {
    return { action: 'enterRestaurant', targetId: restaurantId, considered: false };
  }

  // 6. Confirm World Time falls within the known schedule [shiftStart, shiftEnd)
  const payload = scheduleRecord.payload;
  const startHour = parseInt(payload.shiftStart, 10);
  const endHour = parseInt(payload.shiftEnd, 10);
  const timeZone = resolveLocationTimeZone(state, restaurant.id);
  const isWithinSchedule = isTimeWithinScheduleInterval(state.worldTime, startHour, endHour, timeZone);

  if (!isWithinSchedule) {
    return { action: 'enterRestaurant', targetId: restaurantId, considered: false };
  }

  return {
    action: 'enterRestaurant',
    targetId: restaurant.id,
    considered: true,
    reason: 'known-npc-schedule',
    description: `${npc.name} is scheduled to work now.`,
  };
}

/**
 * Pure evaluator deriving whether purchasing a commercial offering (specifically the development pastry)
 * is a reasonable action for the player to consider based on active situational opportunity (Milestone 49).
 *
 * Scoped strictly to:
 * - Player is located inside the restaurant (scope restriction: restaurant only).
 * - Restaurant is open.
 * - NPC is active and co-located at the restaurant.
 * - The target offering exists in state.offerings for this restaurant.
 * - For Milestone 49, scoped specifically to DEVELOPMENT_PASTRY_OFFERING_ID ('offering:development-pastry').
 *
 * Invariants:
 * - Pure derivation: ZERO state mutation, zero disk writes, zero side-effects.
 * - CONSIDERATION != AUTHORIZATION: Evaluates to considered = true regardless of player balance.
 *   Insufficient funds does NOT suppress the consideration.
 * - OPPORTUNITY != CONSIDERATION: Consideration is an agent-specific derived representation,
 *   not a persistent knowledge record or opportunity entity.
 * - Type-only dependency on WorldState to prevent runtime circular dependencies.
 */
export function evaluateOpportunityInformedCommercialConsideration(
  state: WorldState,
  playerId: string,
  restaurantId: string = DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId,
  offeringId: string = DEVELOPMENT_PASTRY_OFFERING_ID
): ActionConsideration {
  // 1. Confirm player exists and is player
  const player = state.agents.find((a) => a.id === playerId);
  if (!player || player.agentType !== 'player') {
    return { action: 'purchaseOffering', targetId: offeringId, considered: false };
  }

  // 2. Milestone 49 Scope Restriction: target offering must be the development pastry
  if (offeringId !== DEVELOPMENT_PASTRY_OFFERING_ID) {
    return { action: 'purchaseOffering', targetId: offeringId, considered: false };
  }

  // 3. Confirm target restaurant exists
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return { action: 'purchaseOffering', targetId: offeringId, considered: false };
  }

  // 4. Milestone 49 Scope Restriction: player must be located inside the restaurant
  if (player.locationId !== restaurant.id) {
    return { action: 'purchaseOffering', targetId: offeringId, considered: false };
  }

  // 5. Confirm restaurant is operational (open)
  if (restaurant.operationalState !== 'open') {
    return { action: 'purchaseOffering', targetId: offeringId, considered: false };
  }

  // 6. Confirm development pastry offering is actively published in state.offerings for this restaurant
  const offering = state.offerings.find(
    (o) => o.id === offeringId && o.restaurantId === restaurant.id
  );
  if (!offering) {
    return { action: 'purchaseOffering', targetId: offeringId, considered: false };
  }

  // 7. Confirm development NPC is active and co-located at the restaurant
  const npc = state.agents.find(
    (a) =>
      a.id === DEVELOPMENT_NPC_WORK_SCHEDULE.npcId &&
      a.agentType === 'npc' &&
      a.locationId === restaurant.id &&
      a.activityState === 'active'
  );
  if (!npc) {
    return { action: 'purchaseOffering', targetId: offeringId, considered: false };
  }

  // Note: Player balance is intentionally NOT checked here.
  // Consideration reflects contextually reasonable action, not financial authorization.
  // purchaseOffering() remains the sole authority for balance validation.
  return {
    action: 'purchaseOffering',
    targetId: offeringId,
    considered: true,
    reason: 'active-opportunity',
    description: `${npc.name} made fresh Pan Dulce available at the restaurant.`,
  };
}

/**
 * Pure evaluator deriving whether starting an accompanied consumable activity
 * (refreshment with an acquainted, co-located Development NPC) is a reasonable action
 * for the player to consider (Milestone 51).
 *
 * Preconditions for considered = true (all must be satisfied):
 * 1. Player exists and is of agentType 'player'.
 * 2. Scope restriction: venue is the development restaurant.
 * 3. Target restaurant exists in world state.
 * 4. Scope restriction: player is located inside the restaurant.
 * 5. Restaurant is operational (open).
 * 6. Target companion exists and is an NPC.
 * 7. Companion is co-located inside the restaurant.
 * 8. Player and companion are mutually acquainted.
 * 9. Player possesses an available Coffee from this restaurant.
 * 10. Companion possesses an available Pan Dulce from this restaurant.
 * 11. Player has no active uncompleted activity.
 *
 * Invariants:
 * - Pure derivation: ZERO state mutation, zero disk writes, zero side-effects.
 * - Non-persistent and ephemeral.
 * - CONSIDERATION != AUTHORIZATION.
 */
export function evaluateAccompaniedConsumableConsideration(
  state: WorldState,
  playerId: string,
  companionId: string = DEVELOPMENT_NPC_WORK_SCHEDULE.npcId,
  restaurantId: string = DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId
): ActionConsideration {
  // 1. Confirm player exists and is player
  const player = state.agents.find((a) => a.id === playerId);
  if (!player || player.agentType !== 'player') {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 2. Scope restriction: venue must be the development restaurant
  if (restaurantId !== DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId) {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 3. Confirm target restaurant exists
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 4. Scope restriction: player must be located inside the restaurant
  if (player.locationId !== restaurant.id) {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 5. Confirm restaurant is operational (open)
  if (restaurant.operationalState !== 'open') {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 6. Confirm companion exists and is NPC
  const companion = state.agents.find((a) => a.id === companionId);
  if (!companion || companion.agentType !== 'npc') {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 7. Confirm companion is co-located inside the restaurant
  if (companion.locationId !== restaurant.id) {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 8. Confirm player and companion are acquainted
  const first = playerId < companionId ? playerId : companionId;
  const second = playerId < companionId ? companionId : playerId;
  const isAcquainted = (state.acquaintances ?? []).some(
    (acq) => acq.agentIds[0] === first && acq.agentIds[1] === second
  );
  if (!isAcquainted) {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 9. Confirm player has available coffee from this restaurant
  const playerHasCoffee = (state.items ?? []).some(
    (item) =>
      item.ownerAgentId === playerId &&
      item.offeringId === DEVELOPMENT_COFFEE_OFFERING_ID &&
      item.status === 'available' &&
      item.restaurantId === restaurant.id
  );
  if (!playerHasCoffee) {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 10. Confirm companion has available Pan Dulce from this restaurant
  const companionHasPastry = (state.items ?? []).some(
    (item) =>
      item.ownerAgentId === companionId &&
      item.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID &&
      item.status === 'available' &&
      item.restaurantId === restaurant.id
  );
  if (!companionHasPastry) {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  // 11. Confirm player is not currently performing an active activity
  if (player.playerActivity && player.playerActivity.completedAt === null) {
    return { action: 'startAccompaniedActivity', targetId: companionId, considered: false };
  }

  return {
    action: 'startAccompaniedActivity',
    targetId: companion.id,
    considered: true,
    reason: 'co-located-companion-refreshment',
    description: `Enjoy refreshment with ${companion.name}.`,
  };
}

/**
 * Pure evaluator deriving whether exiting the restaurant is a reasonable action
 * for the player to consider when the establishment is closing soon (Milestone 52).
 *
 * Preconditions for considered = true:
 * 1. Player exists and is player.
 * 2. Restaurant exists.
 * 3. Player is located inside the restaurant.
 * 4. Restaurant operationalState is 'closing-soon'.
 */
export function evaluateRestaurantClosingSoonConsideration(
  state: WorldState,
  playerId: string,
  restaurantId: string = DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId
): ActionConsideration {
  const player = state.agents.find((a) => a.id === playerId);
  if (!player || player.agentType !== 'player') {
    return { action: 'exitRestaurant', targetId: restaurantId, considered: false };
  }

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return { action: 'exitRestaurant', targetId: restaurantId, considered: false };
  }

  if (player.locationId !== restaurant.id) {
    return { action: 'exitRestaurant', targetId: restaurant.id, considered: false };
  }

  if (restaurant.operationalState !== 'closing-soon') {
    return { action: 'exitRestaurant', targetId: restaurant.id, considered: false };
  }

  return {
    action: 'exitRestaurant',
    targetId: restaurant.id,
    considered: true,
    reason: 'restaurant-closing-soon',
    description: 'The restaurant is closing soon. Please finish your activities and prepare to exit.',
  };
}


