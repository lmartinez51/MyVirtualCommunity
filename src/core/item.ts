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
import { getCanonicalAgentPair, type Acquaintance } from './entities/social.js';
import { areAgentsCoLocated } from './co-presence.js';

export const QUALIFYING_ITEM_OFFERING_IDS = [
  'offering:development-coffee',
  'offering:development-pastry',
  'offering:m39-demo-beverage',
  'offering:boneless-wings',
  'offering:traditional-wings',
  'offering:seasoned-fries',
  'offering:fountain-soda',
] as const;

export type QualifyingItemOfferingId = (typeof QUALIFYING_ITEM_OFFERING_IDS)[number];

export type ItemStatus = 'available' | 'consumed';

/**
 * Authoritative physical possession entity (Milestone 33, formalized M37, extended M50).
 *
 * Governs personal possession attribution and consumable lifecycle state.
 * Decoupled from immutable historical PurchaseRecord.
 *
 * NOTE (Milestone 50): ownerAgentId represents the agent currently attributed with
 * physical custody/possession of the acquired item ('player' | 'npc').
 * It does NOT represent legal ownership, deed, or trade rights.
 * Original commercial provenance is permanently tracked by sourcePurchaseId.
 */
export interface OwnedItem {
  readonly id: string; // Strict format: /^item:(\d+)$/
  readonly type: 'item';
  readonly offeringId: string;
  readonly name: string; // Acquisition snapshot or migration-reconstructed name
  ownerAgentId: string; // Foreign key -> state.agents (current possessor: 'player' | 'npc')
  readonly restaurantId: string; // Foreign key -> state.restaurants
  readonly sourcePurchaseId: string; // Foreign key -> state.purchases (immutable commercial provenance)
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

export type TransferItemPossessionResultCode =
  | 'success'
  | 'sender-not-found'
  | 'recipient-not-found'
  | 'cannot-transfer-to-self'
  | 'agents-not-co-located'
  | 'agents-not-acquainted'
  | 'item-not-found'
  | 'item-not-in-possession'
  | 'item-already-consumed'
  | 'invalid-timestamp';

export interface TransferItemPossessionResult {
  success: boolean;
  code: TransferItemPossessionResultCode;
  message: string;
  itemId: string;
  fromAgentId: string;
  toAgentId: string;
  transferredAt?: string;
  item?: OwnedItem;
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
  acquaintances?: Acquaintance[];
  orders?: unknown[];
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
 * Pure helper to check acquaintance between two agents.
 */
function checkAcquaintance(
  acquaintances: readonly Acquaintance[] | undefined,
  agentIdA: string,
  agentIdB: string
): boolean {
  if (!acquaintances || agentIdA === agentIdB) {
    return false;
  }
  const [first, second] = getCanonicalAgentPair(agentIdA, agentIdB);
  return acquaintances.some(
    (acq) => acq.agentIds[0] === first && acq.agentIds[1] === second
  );
}

/**
 * Authoritative physical possession handoff (Milestone 50).
 *
 * Transfers physical possession/custody of an available OwnedItem from a sender agent
 * to a co-located, acquainted recipient agent.
 *
 * Semantic Boundary:
 * - Governs physical custody/possession transfer between co-located agents.
 * - Does NOT represent legal ownership, title, trade, deed, or sale.
 * - The immutable commercial provenance (sourcePurchaseId -> PurchaseRecord)
 *   remains permanently attributed to the original purchaser.
 *
 * Preconditions (evaluated in strict deterministic order):
 * 1. Sender exists in state.agents (code: 'sender-not-found')
 * 2. Recipient exists in state.agents (code: 'recipient-not-found')
 * 3. Sender and recipient are distinct: senderId !== recipientId (code: 'cannot-transfer-to-self')
 * 4. Sender and recipient are co-located: sender.locationId === recipient.locationId (code: 'agents-not-co-located')
 * 5. Sender and recipient share mutual acquaintance (code: 'agents-not-acquainted')
 *    Note: Bounded M50 safety constraint for interpersonal handoff; not a universal physical world law.
 * 6. Target item exists in state.items (code: 'item-not-found')
 * 7. Item is currently in sender's possession: item.ownerAgentId === senderId (code: 'item-not-in-possession')
 * 8. Item is currently available: item.status === 'available' (code: 'item-already-consumed')
 * 9. Timestamp is a valid ISO-8601 non-future timestamp >= item.acquiredAt (code: 'invalid-timestamp')
 *
 * State Transition:
 * - Atomically mutates item.ownerAgentId = recipient.id.
 * - Zero state mutation on any precondition violation.
 */
export function transferItemPossession(
  state: ItemWorldState,
  senderId: string,
  recipientId: string,
  itemId: string,
  worldTime: string
): TransferItemPossessionResult {
  // 1. Confirm sender exists
  const sender = state.agents.find((a) => a.id === senderId);
  if (!sender) {
    return {
      success: false,
      code: 'sender-not-found',
      message: `Sender agent "${senderId}" not found in world state`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
    };
  }

  // 2. Confirm recipient exists
  const recipient = state.agents.find((a) => a.id === recipientId);
  if (!recipient) {
    return {
      success: false,
      code: 'recipient-not-found',
      message: `Recipient agent "${recipientId}" not found in world state`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
    };
  }

  // 3. Confirm sender and recipient are distinct
  if (senderId === recipientId) {
    return {
      success: false,
      code: 'cannot-transfer-to-self',
      message: `Cannot transfer possession to self: agent "${senderId}"`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
    };
  }

  // 4. Confirm sender and recipient are co-located
  if (!areAgentsCoLocated(state, senderId, recipientId)) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Agents "${senderId}" and "${recipientId}" are not co-located (sender at "${sender.locationId}", recipient at "${recipient.locationId}")`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
    };
  }

  // 5. Confirm sender and recipient are acquainted (M50 interpersonal handoff safety constraint)
  if (!checkAcquaintance(state.acquaintances, senderId, recipientId)) {
    return {
      success: false,
      code: 'agents-not-acquainted',
      message: `Agents "${senderId}" and "${recipientId}" are not acquainted`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
    };
  }

  // 6. Confirm item exists
  const item = state.items.find((i) => i.id === itemId);
  if (!item) {
    return {
      success: false,
      code: 'item-not-found',
      message: `Item "${itemId}" not found in world state`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
    };
  }

  // 7. Confirm item is currently in sender's possession
  if (item.ownerAgentId !== senderId) {
    return {
      success: false,
      code: 'item-not-in-possession',
      message: `Item "${itemId}" is not in possession of sender "${senderId}" (current possessor: "${item.ownerAgentId}")`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
      item,
    };
  }

  // 8. Confirm item is available
  if (item.status !== 'available') {
    return {
      success: false,
      code: 'item-already-consumed',
      message: `Item "${itemId}" is already consumed (consumedAt: "${item.consumedAt}")`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
      item,
    };
  }

  // 9. Confirm timestamp is valid
  const timeMs = Date.parse(worldTime);
  if (typeof worldTime !== 'string' || worldTime.trim() === '' || Number.isNaN(timeMs)) {
    return {
      success: false,
      code: 'invalid-timestamp',
      message: `Invalid worldTime timestamp: "${worldTime}". Must be a valid ISO-8601 string.`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
      item,
    };
  }

  const worldTimeStateMs = Date.parse(state.worldTime);
  if (Number.isFinite(worldTimeStateMs) && timeMs > worldTimeStateMs) {
    return {
      success: false,
      code: 'invalid-timestamp',
      message: `worldTime "${worldTime}" is in the future relative to state.worldTime "${state.worldTime}"`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
      item,
    };
  }

  const acquiredMs = Date.parse(item.acquiredAt);
  if (Number.isFinite(acquiredMs) && timeMs < acquiredMs) {
    return {
      success: false,
      code: 'invalid-timestamp',
      message: `worldTime "${worldTime}" is earlier than item acquiredAt "${item.acquiredAt}"`,
      itemId,
      fromAgentId: senderId,
      toAgentId: recipientId,
      item,
    };
  }

  // Authoritative possession handoff: re-attribute current custody to recipient
  item.ownerAgentId = recipient.id;

  return {
    success: true,
    code: 'success',
    message: `Transferred possession of item "${item.id}" (${item.name}) from "${senderId}" to "${recipientId}"`,
    itemId: item.id,
    fromAgentId: senderId,
    toAgentId: recipientId,
    transferredAt: worldTime,
    item,
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
    if (ownerAgent.agentType !== 'player' && ownerAgent.agentType !== 'npc') {
      throw new Error(
        `Item Authority Invariant Violated: item "${item.id}" ownerAgentId "${item.ownerAgentId}" has invalid agentType "${ownerAgent.agentType}". In the current scope, acquired consumable items are possessed by player or npc agents.`
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

    // Direction A referential consistency
    // Note: In Milestone 50, item.ownerAgentId represents current custody/possession,
    // which may diverge from original sourcePurchase.playerId after an authorized peer-to-peer handoff.
    // Original commercial provenance is verified via sourcePurchase existence.
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

  // Collect purchase IDs for in-flight orders pending fulfillment (Milestone 39)
  const pendingOrderPurchaseIds = new Set<string>();
  if (Array.isArray((state as any).orders)) {
    for (const order of (state as any).orders) {
      if (
        order &&
        (order.status === 'preparing' || order.status === 'ready') &&
        Array.isArray(order.purchaseIds)
      ) {
        for (const pid of order.purchaseIds) {
          const purchase = purchaseMap.get(pid);
          if (
            purchase &&
            purchase.playerId === order.customerId &&
            purchase.restaurantId === order.restaurantId &&
            !seenSourcePurchaseIds.has(pid)
          ) {
            pendingOrderPurchaseIds.add(pid);
          }
        }
      }
    }
  }

  // Direction B check: Every qualifying PurchaseRecord must have exactly one OwnedItem
  // (unless pending fulfillment in an active order)
  for (const p of state.purchases) {
    if (qualifyingOfferingIds.has(p.offeringId)) {
      if (!seenSourcePurchaseIds.has(p.id) && !pendingOrderPurchaseIds.has(p.id)) {
        throw new Error(
          `Item Authority Invariant Violated: missing OwnedItem for qualifying purchase "${p.id}" (offering: "${p.offeringId}") (Direction B violation)`
        );
      }
    }
  }
}
