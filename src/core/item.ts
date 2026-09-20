/**
 * Asset, Property and Inventory Authority (Milestone 37: AUD-03).
 *
 * Formalizes authoritative state transitions, queries, and invariants for the
 * Item, Property, and Inventory domain boundaries.
 *
 * Core Semantic Boundaries:
 * - Ownership & Possession: In the current model, ownerAgentId identifies the agent
 *   to whom an acquired personal item is attributed. The model treats this as personal
 *   possession/custody for acquired consumables. Legal ownership rights, transfer, lending,
 *   custody delegation, and title are not modeled.
 * - Consumable Lifecycle State vs Physical Condition: item.status ('available' | 'consumed')
 *   represents consumable lifecycle state. General physical condition (durability, wear,
 *   damage, degradation, repair) is not currently represented.
 * - Historical Transaction Price vs Economic Value: PurchaseRecord.amountMinor represents
 *   historical transaction price at the moment of exchange. Current economic value, market
 *   resale value, and asset valuation are not currently represented.
 * - Commercial Catalog vs Physical Stock: Offerings in state.offerings are business catalog
 *   specifications, not physical warehouse inventory or owned items.
 * - Buildings vs Property: Buildings in state.places are spatial containment topology entities,
 *   not real-estate property deeds or owned assets.
 * - Item Location: Currently acquired personal consumable items do not have independent spatial
 *   entities; their practical location is derived from the owning agent's location. This is a scope
 *   simplification appropriate to the current consumable-item model, not a permanent prohibition.
 * - Agent Acquisition Scope: In the current scope, acquired consumable items are associated with
 *   player agents; NPC possession is not currently implemented (a current scope limitation,
 *   not a permanent architectural prohibition).
 * - Strictly Unrepresented: Property deeds, generic assets, vehicles, general physical condition,
 *   current economic value, and business stock warehouses are not currently represented.
 */

import type { Agent } from './entities/agent.js';
import type { Restaurant } from './entities/restaurant.js';
import type { PurchaseRecord } from './world-state.js';

export const QUALIFYING_ITEM_OFFERING_IDS = [
  'offering:development-coffee',
  'offering:development-pastry',
] as const;

export type QualifyingItemOfferingId = (typeof QUALIFYING_ITEM_OFFERING_IDS)[number];

export type ItemStatus = 'available' | 'consumed';

/**
 * Authoritative physical possession entity (Milestone 33, formalized M37).
 *
 * Governs personal possession attribution and consumable lifecycle state.
 * Decoupled from immutable historical PurchaseRecord.
 */
export interface OwnedItem {
  readonly id: string; // Strict format: /^item:(\d+)$/
  readonly type: 'item';
  readonly offeringId: string;
  readonly name: string; // Acquisition snapshot or migration-reconstructed name
  readonly ownerAgentId: string; // Foreign key -> state.agents (agentType === 'player' in current scope)
  readonly restaurantId: string; // Foreign key -> state.restaurants
  readonly sourcePurchaseId: string; // Foreign key -> state.purchases
  readonly acquiredAt: string; // ISO-8601 timestamp === purchase.worldTime
  status: ItemStatus; // Consumable lifecycle state: 'available' | 'consumed' (general physical condition not modeled)
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

export type ConsumeOwnedItemResultCode =
  | 'success'
  | 'item-not-found'
  | 'item-already-consumed'
  | 'invalid-timestamp';

export interface ConsumeOwnedItemResult {
  success: boolean;
  code: ConsumeOwnedItemResultCode;
  message: string;
  itemId: string;
  item?: OwnedItem;
  consumedAt?: string;
}

/**
 * World state interface required for item domain operations.
 */
export interface ItemWorldState {
  worldTime: string;
  agents: Agent[];
  restaurants: Restaurant[];
  purchases: PurchaseRecord[];
  items: OwnedItem[];
}

/**
 * Authoritative item lifecycle state transition: marks an available OwnedItem as consumed.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Target item exists in state.items (code: 'item-not-found')
 * 2. Target item is currently available: item.status === 'available' (code: 'item-already-consumed')
 * 3. Timestamp is a valid ISO 8601 string >= item.acquiredAt and <= state.worldTime (code: 'invalid-timestamp')
 *
 * Guarantees zero state mutation on precondition failure.
 * Does NOT alter ownerAgentId, monetary balances, spatial locations, or knowledge.
 */
export function consumeOwnedItem(
  state: ItemWorldState,
  itemId: string,
  worldTime: string
): ConsumeOwnedItemResult {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) {
    return {
      success: false,
      code: 'item-not-found',
      message: `Item "${itemId}" not found in world state`,
      itemId,
    };
  }

  if (item.status !== 'available') {
    return {
      success: false,
      code: 'item-already-consumed',
      message: `Item "${itemId}" is already consumed (consumedAt: "${item.consumedAt}")`,
      itemId,
      item,
    };
  }

  const timeMs = Date.parse(worldTime);
  if (typeof worldTime !== 'string' || worldTime.trim() === '' || Number.isNaN(timeMs)) {
    return {
      success: false,
      code: 'invalid-timestamp',
      message: `Invalid worldTime timestamp: "${worldTime}". Must be a valid ISO-8601 string.`,
      itemId,
      item,
    };
  }

  // Authoritative mutation
  item.status = 'consumed';
  item.consumedAt = worldTime;

  return {
    success: true,
    code: 'success',
    message: `Item "${itemId}" (${item.name}) successfully marked as consumed`,
    itemId,
    item,
    consumedAt: worldTime,
  };
}

/**
 * Authoritative query: retrieves an OwnedItem by ID.
 * Pure query, zero state mutation.
 */
export function getOwnedItem(state: ItemWorldState, itemId: string): OwnedItem | undefined {
  return state.items.find((i) => i.id === itemId);
}

/**
 * Authoritative query: retrieves available OwnedItems for a given player.
 * Pure query, zero state mutation.
 */
export function getPlayerAvailableItems(
  state: ItemWorldState,
  playerId: string,
  offeringId?: string
): OwnedItem[] {
  return state.items.filter(
    (i) =>
      i.ownerAgentId === playerId &&
      i.status === 'available' &&
      (offeringId === undefined || i.offeringId === offeringId)
  );
}

/**
 * Authoritative query: evaluates whether an OwnedItem is currently available.
 * Pure query, zero state mutation.
 */
export function isItemAvailable(state: ItemWorldState, itemId: string): boolean {
  const item = state.items.find((i) => i.id === itemId);
  return item !== undefined && item.status === 'available';
}

/**
 * Authoritative item domain validator.
 * Validates all Item/Possession domain invariants across WorldState:
 * 1. Monotonic format item:<n> and unique IDs.
 * 2. Type strictly 'item'.
 * 3. Offering ID in QUALIFYING_ITEM_OFFERING_IDS.
 * 4. Non-empty item name.
 * 5. Owner agent exists and is player.
 * 6. Restaurant exists.
 * 7. AcquiredAt valid timestamp <= worldTime.
 * 8. Status strictly 'available' | 'consumed'.
 * 9. ConsumedAt null when available; non-null valid timestamp >= acquiredAt and <= worldTime when consumed.
 * 10. SourcePurchaseId references valid purchase with matching playerId, offeringId, restaurantId, and worldTime.
 * 11. Bidirectional 1:1 cardinality between qualifying purchases and OwnedItems.
 */
export function validateItemAuthority(state: ItemWorldState): void {
  if (!Array.isArray(state.items)) {
    throw new Error('Item Authority Invariant Violated: items must be an array');
  }

  const worldTimeMs = Date.parse(state.worldTime);
  const agentMap = new Map<string, Agent>(state.agents.map((a) => [a.id, a]));
  const restaurantIds = new Set<string>(state.restaurants.map((r) => r.id));
  const purchaseMap = new Map<string, PurchaseRecord>(state.purchases.map((p) => [p.id, p]));
  const qualifyingOfferingIds = new Set<string>(QUALIFYING_ITEM_OFFERING_IDS);

  const itemIdSet = new Set<string>();
  const seenSourcePurchaseIds = new Set<string>();

  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Item Authority Invariant Violated: item at index ${i} must be a non-null object`);
    }

    if (typeof item.id !== 'string' || !/^item:\d+$/.test(item.id)) {
      throw new Error(
        `Item Authority Invariant Violated: item at index ${i} id must match format "item:<number>". Received: ${JSON.stringify(item.id)}`
      );
    }

    if (itemIdSet.has(item.id)) {
      throw new Error(`Item Authority Invariant Violated: duplicate item id found: "${item.id}"`);
    }
    itemIdSet.add(item.id);

    if (item.type !== 'item') {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" type must be "item". Received: ${JSON.stringify(item.type)}`
      );
    }

    if (typeof item.offeringId !== 'string' || !qualifyingOfferingIds.has(item.offeringId)) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" offeringId must be a qualifying item offering. Received: ${JSON.stringify(item.offeringId)}`
      );
    }

    if (typeof item.name !== 'string' || item.name.trim() === '') {
      throw new Error(`Item Authority Invariant Violated: item "${item.id}" name must be a non-empty string`);
    }

    if (typeof item.ownerAgentId !== 'string' || item.ownerAgentId.trim() === '') {
      throw new Error(`Item Authority Invariant Violated: item "${item.id}" ownerAgentId must be a non-empty string`);
    }

    const ownerAgent = agentMap.get(item.ownerAgentId);
    if (!ownerAgent) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" ownerAgentId "${item.ownerAgentId}" references non-existent agent`
      );
    }
    if (ownerAgent.agentType !== 'player') {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" ownerAgentId "${item.ownerAgentId}" is not a player (agentType: "${ownerAgent.agentType}"). In the current scope, acquired consumable items are associated with player agents.`
      );
    }

    if (typeof item.restaurantId !== 'string' || item.restaurantId.trim() === '') {
      throw new Error(`Item Authority Invariant Violated: item "${item.id}" restaurantId must be a non-empty string`);
    }
    if (!restaurantIds.has(item.restaurantId)) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" restaurantId "${item.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof item.acquiredAt !== 'string' || item.acquiredAt.trim() === '') {
      throw new Error(`Item Authority Invariant Violated: item "${item.id}" acquiredAt must be a non-empty string`);
    }
    const acquiredMs = Date.parse(item.acquiredAt);
    if (Number.isNaN(acquiredMs)) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" acquiredAt must be a valid ISO-8601 timestamp. Received: "${item.acquiredAt}"`
      );
    }
    if (Number.isFinite(worldTimeMs) && acquiredMs > worldTimeMs) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" acquiredAt "${item.acquiredAt}" is in the future relative to worldTime "${state.worldTime}"`
      );
    }

    if (item.status !== 'available' && item.status !== 'consumed') {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" status must be "available" or "consumed". Received: ${JSON.stringify(item.status)}`
      );
    }

    if (item.status === 'available') {
      if (item.consumedAt !== null) {
        throw new Error(
          `Item Authority Invariant Violated: item "${item.id}" consumedAt must be null when status is "available". Received: ${JSON.stringify(item.consumedAt)}`
        );
      }
    } else {
      if (typeof item.consumedAt !== 'string' || item.consumedAt.trim() === '') {
        throw new Error(
          `Item Authority Invariant Violated: item "${item.id}" consumedAt must be a non-empty ISO-8601 timestamp when status is "consumed"`
        );
      }
      const consumedMs = Date.parse(item.consumedAt);
      if (Number.isNaN(consumedMs)) {
        throw new Error(
          `Item Authority Invariant Violated: item "${item.id}" consumedAt must be a valid ISO-8601 timestamp string. Received: "${item.consumedAt}"`
        );
      }
      if (consumedMs < acquiredMs) {
        throw new Error(
          `Item Authority Invariant Violated: item "${item.id}" consumedAt ("${item.consumedAt}") must be greater than or equal to acquiredAt ("${item.acquiredAt}")`
        );
      }
      if (Number.isFinite(worldTimeMs) && consumedMs > worldTimeMs) {
        throw new Error(
          `Item Authority Invariant Violated: item "${item.id}" consumedAt "${item.consumedAt}" is in the future relative to worldTime "${state.worldTime}"`
        );
      }
    }

    if (typeof item.sourcePurchaseId !== 'string' || item.sourcePurchaseId.trim() === '') {
      throw new Error(`Item Authority Invariant Violated: item "${item.id}" sourcePurchaseId must be a non-empty string`);
    }

    if (seenSourcePurchaseIds.has(item.sourcePurchaseId)) {
      throw new Error(
        `Item Authority Invariant Violated: duplicate sourcePurchaseId "${item.sourcePurchaseId}" referenced by multiple items (Direction A violation)`
      );
    }
    seenSourcePurchaseIds.add(item.sourcePurchaseId);

    const sourcePurchase = purchaseMap.get(item.sourcePurchaseId);
    if (!sourcePurchase) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" sourcePurchaseId "${item.sourcePurchaseId}" references non-existent purchase`
      );
    }

    if (sourcePurchase.playerId !== item.ownerAgentId) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" ownerAgentId "${item.ownerAgentId}" does not match purchase playerId "${sourcePurchase.playerId}"`
      );
    }
    if (sourcePurchase.offeringId !== item.offeringId) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" offeringId "${item.offeringId}" does not match purchase offeringId "${sourcePurchase.offeringId}"`
      );
    }
    if (sourcePurchase.restaurantId !== item.restaurantId) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" restaurantId "${item.restaurantId}" does not match purchase restaurantId "${sourcePurchase.restaurantId}"`
      );
    }
    if (sourcePurchase.worldTime !== item.acquiredAt) {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" acquiredAt "${item.acquiredAt}" does not match purchase worldTime "${sourcePurchase.worldTime}"`
      );
    }
  }

  // Direction B check: Every qualifying PurchaseRecord must have exactly one OwnedItem
  for (const p of state.purchases) {
    if (qualifyingOfferingIds.has(p.offeringId)) {
      if (!seenSourcePurchaseIds.has(p.id)) {
        throw new Error(
          `Item Authority Invariant Violated: missing OwnedItem for qualifying purchase "${p.id}" (offering: "${p.offeringId}") (Direction B violation)`
        );
      }
    }
  }
}
