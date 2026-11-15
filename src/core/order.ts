/**
 * Order & Service Fulfillment Foundation (Milestone 39).
 *
 * Formalizes authoritative state transitions, queries, and invariants for commercial
 * orders, time-driven preparation, and service pickup fulfillment in MyVirtualCommunity.
 *
 * Scope & Boundaries:
 * - Order Authority owns: Order entity lifecycle ('preparing' -> 'ready' -> 'fulfilled'),
 *   order lines, preparation timing (readyAt), and fulfillment handoff.
 * - Coordinates with Business Authority: verifies restaurant operational availability ('open')
 *   and catalog offerings (state.offerings). Business Authority does NOT own customer orders.
 * - Coordinates with Economy Authority: atomic payment validation, balance transfers,
 *   and generation of immutable PurchaseRecord entities (1 PurchaseRecord per item unit).
 * - Coordinates with Item Authority: instantiates physical OwnedItem entities in customer possession
 *   upon order fulfillment (1:1 with PurchaseRecords).
 * - Coordinates with Spatial Authority: verifies physical co-location at restaurant for pickup.
 * - Coordinates with Simulation Authority: deterministic time-driven order preparation progression
 *   evaluated during explicit Simulation.tick() calls without background schedulers or workers.
 * - Delivery Mode: Formally recognized in the domain contract as 'delivery', but physical fulfillment
 *   is explicitly deferred to future logistics milestones (returns 'delivery-mode-deferred').
 */

import type { Agent } from './entities/agent.js';
import type { Restaurant } from './entities/restaurant.js';
import type { Offering } from './entities/offering.js';
import type { PurchaseRecord } from './world-state.js';
import type { OwnedItem } from './item.js';
import { isRestaurantOpen } from './business.js';
import { areAgentsCoLocated } from './co-presence.js';

export const ORDER_PREPARATION_DURATION_MINUTES = 5;
export const ORDER_PREPARATION_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export type FulfillmentMode = 'pickup' | 'delivery';

export type OrderStatus =
  | 'preparing'
  | 'ready'
  | 'fulfilled';

export interface OrderLine {
  readonly offeringId: string;
  readonly quantity: number;
}

/**
 * Authoritative Order entity (Milestone 39).
 *
 * Canonical representation of an in-flight or completed commercial fulfillment contract.
 * lines is the single source of truth for ordered offerings and quantities.
 */
export interface Order {
  readonly id: string;                              // Monotonic format: /^order:\d+$/
  readonly type: 'order';
  readonly customerId: string;                      // Foreign key -> state.agents (player)
  readonly restaurantId: string;                    // Foreign key -> state.restaurants
  readonly lines: readonly OrderLine[];             // Single source of truth
  readonly totalAmountMinor: number;                // Snapshot of total cost
  readonly currency: string;                        // Currency code
  readonly fulfillmentMode: FulfillmentMode;        // 'pickup' | 'delivery'
  status: OrderStatus;                              // 'preparing' | 'ready' | 'fulfilled'
  readonly createdAt: string;                       // ISO-8601 WorldTime when placed
  readyAt: string;                                  // ISO-8601 WorldTime when ready
  fulfilledAt: string | null;                       // ISO-8601 WorldTime when fulfilled
  readonly purchaseIds: readonly string[];          // Foreign keys -> state.purchases (1:1 per unit)
  fulfilledItemIds: readonly string[];              // Foreign keys -> state.items (created upon fulfillment)
}

/**
 * Read-only perception projection of an unfulfilled customer order (Milestone 52.1).
 * Strictly contains only unfulfilled orders (status: 'preparing' | 'ready').
 */
export interface ObservablePendingOrder {
  readonly id: string;
  readonly restaurantId: string;
  readonly status: 'preparing' | 'ready';
  readonly totalAmountMinor: number;
  readonly currency: string;
  readonly readyAt: string;
  readonly createdAt: string;
}

/**
 * Minimal world state interface required for order domain operations.
 */
export interface OrderWorldState {
  worldTime: string;
  agents: Agent[];
  restaurants: Restaurant[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  items: OwnedItem[];
  orders: Order[];
}

export type InquireRestaurantServiceResultCode =
  | 'success'
  | 'customer-not-found'
  | 'customer-not-player'
  | 'staff-not-found'
  | 'staff-not-npc'
  | 'agents-not-co-located'
  | 'not-at-restaurant'
  | 'restaurant-closed'
  | 'staff-not-active';

export interface InquireRestaurantServiceResult {
  success: boolean;
  code: InquireRestaurantServiceResultCode;
  message: string;
  prompt?: string;
  restaurantId?: string;
  staffNpcId?: string;
  staffAgentId?: string;
  availableOfferings?: Array<{
    id: string;
    name: string;
    priceMinor: number;
    currency: string;
  }>;
  offerings?: Array<{
    id: string;
    name: string;
    priceMinor: number;
    currency: string;
  }>;
  supportedModes?: readonly string[];
  supportedFulfillmentModes?: readonly ['pickup'];
  deferredFulfillmentModes?: readonly ['delivery'];
}

/**
 * Authoritative service affordance query: A customer queries service options from an NPC staff member.
 *
 * Pure structured query with ZERO state mutation. No dialogue engine, NLP, or conversational state.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Customer exists in state.agents (code: 'customer-not-found')
 * 2. Customer is a player: agent.agentType === 'player' (code: 'customer-not-player')
 * 3. Staff exists in state.agents (code: 'staff-not-found')
 * 4. Staff is an NPC: agent.agentType === 'npc' (code: 'staff-not-npc')
 * 5. Customer and staff are co-located: customer.locationId === staff.locationId (code: 'agents-not-co-located')
 * 6. Co-location is at a valid restaurant (code: 'not-at-restaurant')
 * 7. Restaurant is open: isRestaurantOpen(state, restaurantId) (code: 'restaurant-closed')
 * 8. Staff NPC is active: staff.activityState === 'active' (code: 'staff-not-active')
 */
export function inquireRestaurantService(
  state: OrderWorldState,
  customerId: string,
  staffNpcId: string
): InquireRestaurantServiceResult {
  const customer = state.agents.find((a) => a.id === customerId);
  if (!customer) {
    return {
      success: false,
      code: 'customer-not-found',
      message: `Customer agent "${customerId}" not found in world state`,
    };
  }

  if (customer.agentType !== 'player') {
    return {
      success: false,
      code: 'customer-not-player',
      message: `Agent "${customerId}" is not a player (agentType: "${customer.agentType}")`,
    };
  }

  const staff = state.agents.find((a) => a.id === staffNpcId);
  if (!staff) {
    return {
      success: false,
      code: 'staff-not-found',
      message: `Staff agent "${staffNpcId}" not found in world state`,
    };
  }

  if (staff.agentType !== 'npc') {
    return {
      success: false,
      code: 'staff-not-npc',
      message: `Target agent "${staffNpcId}" is not an NPC (agentType: "${staff.agentType}")`,
    };
  }

  if (!areAgentsCoLocated(state, customerId, staffNpcId)) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Customer "${customerId}" (at "${customer.locationId}") and staff "${staffNpcId}" (at "${staff.locationId}") are not co-located`,
    };
  }

  const restaurant = state.restaurants.find((r) => r.id === customer.locationId);
  if (!restaurant) {
    return {
      success: false,
      code: 'not-at-restaurant',
      message: `Agents are co-located at "${customer.locationId}", which is not a restaurant`,
    };
  }

  if (!isRestaurantOpen(state as any, restaurant.id)) {
    return {
      success: false,
      code: 'restaurant-closed',
      message: `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}")`,
      restaurantId: restaurant.id,
    };
  }

  if (staff.activityState !== 'active') {
    return {
      success: false,
      code: 'staff-not-active',
      message: `Staff member "${staffNpcId}" is currently ${staff.activityState}, not active`,
      restaurantId: restaurant.id,
      staffNpcId: staff.id,
    };
  }

  const availableOfferings = state.offerings
    .filter((o) => o.restaurantId === restaurant.id)
    .map((o) => ({
      id: o.id,
      name: o.name,
      priceMinor: o.priceMinor,
      currency: o.currency,
    }));

  return {
    success: true,
    code: 'success',
    message: `Restaurant service options retrieved for "${restaurant.id}"`,
    prompt: 'Pickup or delivery?',
    restaurantId: restaurant.id,
    staffNpcId: staff.id,
    staffAgentId: staff.id,
    availableOfferings,
    offerings: availableOfferings,
    supportedModes: ['pickup', 'delivery'] as const,
    supportedFulfillmentModes: ['pickup'] as const,
    deferredFulfillmentModes: ['delivery'] as const,
  };
}

export interface PlaceOrderParams {
  customerId: string;
  restaurantId: string;
  lines: readonly OrderLine[];
  fulfillmentMode: FulfillmentMode;
}

export type PlaceOrderResultCode =
  | 'success'
  | 'customer-not-found'
  | 'customer-not-player'
  | 'restaurant-not-found'
  | 'customer-not-co-located'
  | 'restaurant-closed'
  | 'restaurant-closing-soon'
  | 'delivery-mode-deferred'
  | 'invalid-fulfillment-mode'
  | 'empty-order-lines'
  | 'invalid-line-quantity'
  | 'offering-not-found'
  | 'offering-not-at-restaurant'
  | 'currency-mismatch'
  | 'insufficient-funds';

export interface PlaceOrderResult {
  success: boolean;
  code: PlaceOrderResultCode;
  message: string;
  orderId?: string;
  purchaseIds?: readonly string[];
  totalAmountMinor?: number;
  currency?: string;
  readyAt?: string;
  order?: Order;
}

/**
 * Authoritative order creation command: creates and pays for a commercial order.
 *
 * Preconditions (evaluated in deterministic order before ANY mutation):
 * 1. Customer exists in state.agents (code: 'customer-not-found')
 * 2. Customer is a player: agent.agentType === 'player' (code: 'customer-not-player')
 * 3. Restaurant exists in state.restaurants (code: 'restaurant-not-found')
 * 4. Customer is co-located with restaurant: customer.locationId === restaurantId (code: 'customer-not-co-located')
 * 5. Restaurant is open: isRestaurantOpen(state, restaurantId) (code: 'restaurant-closed')
 * 6. Fulfillment mode is supported:
 *    - If 'delivery': returns failure code 'delivery-mode-deferred'
 *    - If not 'pickup' or 'delivery': returns failure code 'invalid-fulfillment-mode'
 * 7. Order lines are non-empty array: lines.length >= 1 (code: 'empty-order-lines')
 * 8. Each line has integer quantity >= 1 (code: 'invalid-line-quantity')
 * 9. Each line offering exists in state.offerings (code: 'offering-not-found')
 * 10. Each line offering belongs to the specified restaurant (code: 'offering-not-at-restaurant')
 * 11. Currency compatibility: customer, restaurant, and all line offerings share currency (code: 'currency-mismatch')
 * 12. Player has sufficient funds: player.balanceMinor >= totalAmountMinor (code: 'insufficient-funds')
 *
 * Guarantees Precondition Atomicity (zero state mutation on failure) and Commit Atomicity
 * (synchronous atomic balance settlement, PurchaseRecord generation, and Order instantiation).
 */
export function placeOrder(
  state: OrderWorldState,
  params: PlaceOrderParams
): PlaceOrderResult {
  const customer = state.agents.find((a) => a.id === params.customerId);
  if (!customer) {
    return {
      success: false,
      code: 'customer-not-found',
      message: `Customer agent "${params.customerId}" not found in world state`,
    };
  }

  if (customer.agentType !== 'player') {
    return {
      success: false,
      code: 'customer-not-player',
      message: `Agent "${params.customerId}" is not a player (agentType: "${customer.agentType}")`,
    };
  }

  const restaurant = state.restaurants.find((r) => r.id === params.restaurantId);
  if (!restaurant) {
    return {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${params.restaurantId}" not found in world state`,
    };
  }

  if (customer.locationId !== restaurant.id) {
    return {
      success: false,
      code: 'customer-not-co-located',
      message: `Customer "${params.customerId}" is at "${customer.locationId}", not inside restaurant "${restaurant.id}"`,
    };
  }

  if (restaurant.operationalState === 'closed') {
    return {
      success: false,
      code: 'restaurant-closed',
      message: `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}")`,
    };
  }

  if (restaurant.operationalState === 'closing-soon') {
    return {
      success: false,
      code: 'restaurant-closing-soon',
      message: `Restaurant "${restaurant.id}" is closing soon and cannot accept new orders`,
    };
  }

  if (params.fulfillmentMode === 'delivery') {
    return {
      success: false,
      code: 'delivery-mode-deferred',
      message: 'Fulfillment mode "delivery" is recognized but deferred to future logistics milestones',
    };
  }

  if (params.fulfillmentMode !== 'pickup') {
    return {
      success: false,
      code: 'invalid-fulfillment-mode',
      message: `Invalid fulfillment mode: "${String(params.fulfillmentMode)}". Expected "pickup" or "delivery".`,
    };
  }

  if (!Array.isArray(params.lines) || params.lines.length === 0) {
    return {
      success: false,
      code: 'empty-order-lines',
      message: 'Order lines must be a non-empty array',
    };
  }

  let totalAmountMinor = 0;
  const resolvedOfferings: Array<{ offering: Offering; quantity: number }> = [];

  for (let i = 0; i < params.lines.length; i++) {
    const line = params.lines[i];
    if (
      typeof line !== 'object' ||
      line === null ||
      typeof line.quantity !== 'number' ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1
    ) {
      return {
        success: false,
        code: 'invalid-line-quantity',
        message: `Invalid quantity at line ${i}: must be an integer >= 1`,
      };
    }

    const offering = state.offerings.find((o) => o.id === line.offeringId);
    if (!offering) {
      return {
        success: false,
        code: 'offering-not-found',
        message: `Offering "${line.offeringId}" not found in world state`,
      };
    }

    if (offering.restaurantId !== restaurant.id) {
      return {
        success: false,
        code: 'offering-not-at-restaurant',
        message: `Offering "${line.offeringId}" belongs to "${offering.restaurantId}", not "${restaurant.id}"`,
      };
    }

    if (
      offering.currency !== restaurant.currency ||
      customer.currency !== restaurant.currency
    ) {
      return {
        success: false,
        code: 'currency-mismatch',
        message: `Currency mismatch: player="${customer.currency}", restaurant="${restaurant.currency}", offering="${offering.currency}"`,
      };
    }

    totalAmountMinor += offering.priceMinor * line.quantity;
    resolvedOfferings.push({ offering, quantity: line.quantity });
  }

  if (customer.balanceMinor < totalAmountMinor) {
    return {
      success: false,
      code: 'insufficient-funds',
      message: `Insufficient funds: player has ${customer.balanceMinor} ${customer.currency}, required ${totalAmountMinor} ${restaurant.currency}`,
    };
  }

  // COMMIT PHASE: Synchronous unbroken block
  // 1. Economy settlement: transfer monetary funds
  customer.balanceMinor -= totalAmountMinor;
  restaurant.balanceMinor += totalAmountMinor;

  // 2. Economy settlement: generate exactly 1 PurchaseRecord per item unit (preserves M33/M37 1:1 cardinality)
  const purchaseIds: string[] = [];
  for (const item of resolvedOfferings) {
    for (let u = 0; u < item.quantity; u++) {
      const purchaseId = `purchase:${state.purchases.length + 1}`;
      const purchaseRecord: PurchaseRecord = {
        id: purchaseId,
        worldTime: state.worldTime,
        playerId: customer.id,
        restaurantId: restaurant.id,
        offeringId: item.offering.id,
        amountMinor: item.offering.priceMinor,
        currency: item.offering.currency,
        consumedAt: null,
      };
      state.purchases.push(purchaseRecord);
      purchaseIds.push(purchaseId);
    }
  }

  // 3. Order domain: instantiate Order entity in 'preparing' status
  const createdAtMs = Date.parse(state.worldTime);
  const readyAtMs = createdAtMs + ORDER_PREPARATION_DURATION_MS;
  const readyAt = new Date(readyAtMs).toISOString();
  const orderId = `order:${state.orders.length + 1}`;

  const order: Order = {
    id: orderId,
    type: 'order',
    customerId: customer.id,
    restaurantId: restaurant.id,
    lines: params.lines.map((l) => ({ offeringId: l.offeringId, quantity: l.quantity })),
    totalAmountMinor,
    currency: restaurant.currency,
    fulfillmentMode: 'pickup',
    status: 'preparing',
    createdAt: state.worldTime,
    readyAt,
    fulfilledAt: null,
    purchaseIds,
    fulfilledItemIds: [],
  };

  state.orders.push(order);

  return {
    success: true,
    code: 'success',
    message: `Order "${orderId}" successfully placed for ${totalAmountMinor} ${restaurant.currency} (readyAt: ${readyAt})`,
    orderId,
    purchaseIds,
    totalAmountMinor,
    currency: restaurant.currency,
    readyAt,
    order,
  };
}

export interface OrderPreparationTransition {
  orderId: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  readyAt: string;
}

/**
 * Progresses in-flight order preparation during explicit Simulation.tick() evaluation.
 *
 * Evaluates all orders in 'preparing' status:
 * If worldTime >= order.readyAt, transitions order from 'preparing' to 'ready'.
 *
 * Invariant: Pure deterministic evaluation invoked during explicit simulation ticks.
 * No timers, background workers, or hidden schedulers.
 */
export function tickOrderPreparation(
  state: OrderWorldState,
  worldTime: string
): OrderPreparationTransition[] {
  const currentWorldMs = Date.parse(worldTime);
  const transitions: OrderPreparationTransition[] = [];

  for (const order of state.orders) {
    if (order.status === 'preparing') {
      const readyAtMs = Date.parse(order.readyAt);
      if (currentWorldMs >= readyAtMs) {
        order.status = 'ready';
        transitions.push({
          orderId: order.id,
          previousStatus: 'preparing',
          newStatus: 'ready',
          readyAt: order.readyAt,
        });
      }
    }
  }

  return transitions;
}

export type CollectOrderResultCode =
  | 'success'
  | 'customer-not-found'
  | 'customer-not-player'
  | 'order-not-found'
  | 'order-not-owned-by-customer'
  | 'order-not-ready'
  | 'order-already-fulfilled'
  | 'restaurant-closed'
  | 'customer-not-co-located';

export interface CollectOrderResult {
  success: boolean;
  code: CollectOrderResultCode;
  message: string;
  orderId: string;
  fulfilledItemIds?: readonly string[];
  fulfilledAt?: string;
  items?: OwnedItem[];
}

/**
 * Authoritative order collection command: customer collects a ready order at the restaurant counter.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Customer exists in state.agents (code: 'customer-not-found')
 * 2. Customer is a player: agent.agentType === 'player' (code: 'customer-not-player')
 * 3. Order exists in state.orders (code: 'order-not-found')
 * 4. Order belongs to customer: order.customerId === customerId (code: 'order-not-owned-by-customer')
 * 5. Order is ready:
 *    - If status === 'preparing': returns failure code 'order-not-ready'
 *    - If status === 'fulfilled': returns failure code 'order-already-fulfilled'
 * 6. Customer is co-located at the restaurant: customer.locationId === order.restaurantId (code: 'customer-not-co-located')
 *
 * On success:
 * - Transitions order.status to 'fulfilled'
 * - Sets order.fulfilledAt to state.worldTime
 * - Instantiates exactly one OwnedItem per PurchaseRecord in order.purchaseIds (1:1 invariant)
 * - Sets order.fulfilledItemIds to the created item IDs
 * - Returns success result with created OwnedItem instances
 */
export function collectOrder(
  state: OrderWorldState,
  customerId: string,
  orderId: string
): CollectOrderResult {
  const customer = state.agents.find((a) => a.id === customerId);
  if (!customer) {
    return {
      success: false,
      code: 'customer-not-found',
      message: `Customer agent "${customerId}" not found in world state`,
      orderId,
    };
  }

  if (customer.agentType !== 'player') {
    return {
      success: false,
      code: 'customer-not-player',
      message: `Agent "${customerId}" is not a player (agentType: "${customer.agentType}")`,
      orderId,
    };
  }

  const order = state.orders.find((o) => o.id === orderId);
  if (!order) {
    return {
      success: false,
      code: 'order-not-found',
      message: `Order "${orderId}" not found in world state`,
      orderId,
    };
  }

  if (order.customerId !== customer.id) {
    return {
      success: false,
      code: 'order-not-owned-by-customer',
      message: `Order "${orderId}" belongs to customer "${order.customerId}", not "${customerId}"`,
      orderId,
    };
  }

  if (order.status === 'preparing') {
    return {
      success: false,
      code: 'order-not-ready',
      message: `Order "${orderId}" is still preparing (readyAt: "${order.readyAt}")`,
      orderId,
    };
  }

  if (order.status === 'fulfilled') {
    return {
      success: false,
      code: 'order-already-fulfilled',
      message: `Order "${orderId}" has already been fulfilled (fulfilledAt: "${order.fulfilledAt}")`,
      orderId,
    };
  }

  const restaurant = state.restaurants.find((r) => r.id === order.restaurantId);
  if (restaurant && restaurant.operationalState === 'closed') {
    return {
      success: false,
      code: 'restaurant-closed',
      message: `Restaurant "${order.restaurantId}" is closed (operationalState: "${restaurant.operationalState}")`,
      orderId,
    };
  }

  if (customer.locationId !== order.restaurantId) {
    return {
      success: false,
      code: 'customer-not-co-located',
      message: `Customer "${customerId}" is at "${customer.locationId}", not at order restaurant "${order.restaurantId}"`,
      orderId,
    };
  }

  const purchaseMap = new Map<string, PurchaseRecord>(state.purchases.map((p) => [p.id, p]));
  const offeringMap = new Map<string, Offering>(state.offerings.map((o) => [o.id, o]));

  const resolvedPurchases: Array<{ purchase: PurchaseRecord; itemName: string }> = [];
  for (const purchaseId of order.purchaseIds) {
    const purchase = purchaseMap.get(purchaseId);
    if (!purchase) {
      throw new Error(
        `Order Integrity Violation: order "${order.id}" references non-existent purchase "${purchaseId}"`
      );
    }

    const offering = offeringMap.get(purchase.offeringId);
    const itemName = offering ? offering.name : 'Unknown Item';
    resolvedPurchases.push({ purchase, itemName });
  }

  // COMMIT PHASE: Transition order and instantiate authoritative OwnedItems synchronously
  order.status = 'fulfilled';
  order.fulfilledAt = state.worldTime;

  const createdItemIds: string[] = [];
  const createdItems: OwnedItem[] = [];

  for (let idx = 0; idx < resolvedPurchases.length; idx++) {
    const { purchase, itemName } = resolvedPurchases[idx];
    const itemId = `item:${state.items.length + 1}`;

    const ownedItem: OwnedItem = {
      id: itemId,
      type: 'item',
      offeringId: purchase.offeringId,
      name: itemName,
      ownerAgentId: customer.id,
      restaurantId: order.restaurantId,
      sourcePurchaseId: purchase.id,
      acquiredAt: purchase.worldTime, // Strict invariant: acquiredAt matches purchase.worldTime
      status: 'available',
      consumedAt: null,
    };

    state.items.push(ownedItem);
    createdItemIds.push(itemId);
    createdItems.push(ownedItem);
  }

  (order as { fulfilledItemIds: readonly string[] }).fulfilledItemIds = createdItemIds;

  return {
    success: true,
    code: 'success',
    message: `Order "${orderId}" successfully collected by customer "${customerId}" (${createdItemIds.length} item(s) acquired)`,
    orderId,
    fulfilledItemIds: createdItemIds,
    fulfilledAt: state.worldTime,
    items: createdItems,
  };
}

/**
 * Authoritative query: retrieves orders associated with a customer.
 */
export function getCustomerOrders(state: OrderWorldState, customerId: string): Order[] {
  return state.orders.filter((o) => o.customerId === customerId);
}

/**
 * Authoritative query: retrieves orders associated with a restaurant.
 */
export function getRestaurantOrders(state: OrderWorldState, restaurantId: string): Order[] {
  return state.orders.filter((o) => o.restaurantId === restaurantId);
}

/**
 * Authoritative order domain validator.
 * Validates all Order domain invariants across WorldState:
 * 1. Unique order IDs matching format /^order:\d+$/
 * 2. Type strictly 'order'
 * 3. Customer exists and is a player
 * 4. Restaurant exists
 * 5. Lines non-empty, each quantity integer >= 1, offerings exist and belong to restaurant
 * 6. Total amount matches sum of lines
 * 7. Currency matches restaurant and offerings
 * 8. Fulfillment mode strictly 'pickup' | 'delivery'
 * 9. Status strictly 'preparing' | 'ready' | 'fulfilled'
 * 10. Timestamps valid ISO-8601 strings and readyAt >= createdAt
 * 11. fulfilledAt null when preparing or ready; non-null valid timestamp when fulfilled
 * 12. purchaseIds array length matches total line quantity
 * 13. Each purchaseId references existing purchase matching customerId, restaurantId, and offeringId
 * 14. No two orders share the same purchaseId
 * 15. When fulfilled: fulfilledItemIds length matches purchaseIds length
 * 16. Each fulfilled item references valid OwnedItem whose sourcePurchaseId matches the order's purchaseId 1:1
 */
export function validateOrderAuthority(state: OrderWorldState): void {
  if (!Array.isArray(state.orders)) {
    throw new Error('Order Authority Invariant Violated: orders must be an array');
  }

  const agentMap = new Map<string, Agent>(state.agents.map((a) => [a.id, a]));
  const restaurantMap = new Map<string, Restaurant>(state.restaurants.map((r) => [r.id, r]));
  const offeringMap = new Map<string, Offering>(state.offerings.map((o) => [o.id, o]));
  const purchaseMap = new Map<string, PurchaseRecord>(state.purchases.map((p) => [p.id, p]));
  const itemMap = new Map<string, OwnedItem>(state.items.map((i) => [i.id, i]));

  const orderIdSet = new Set<string>();
  const seenPurchaseIds = new Set<string>();
  const seenItemIds = new Set<string>();

  for (let i = 0; i < state.orders.length; i++) {
    const order = state.orders[i];
    if (typeof order !== 'object' || order === null) {
      throw new Error(`Order Authority Invariant Violated: order at index ${i} must be a non-null object`);
    }

    if (typeof order.id !== 'string' || !/^order:\d+$/.test(order.id)) {
      throw new Error(
        `Order Authority Invariant Violated: order at index ${i} id must match format "order:<number>". Received: ${JSON.stringify(order.id)}`
      );
    }

    if (orderIdSet.has(order.id)) {
      throw new Error(`Order Authority Invariant Violated: duplicate order id found: "${order.id}"`);
    }
    orderIdSet.add(order.id);

    if (order.type !== 'order') {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" type must be "order". Received: ${JSON.stringify(order.type)}`
      );
    }

    const customer = agentMap.get(order.customerId);
    if (!customer) {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" customerId "${order.customerId}" references non-existent agent`
      );
    }
    if (customer.agentType !== 'player') {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" customerId "${order.customerId}" is not a player (agentType: "${customer.agentType}")`
      );
    }

    const restaurant = restaurantMap.get(order.restaurantId);
    if (!restaurant) {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" restaurantId "${order.restaurantId}" references non-existent restaurant`
      );
    }

    if (!Array.isArray(order.lines) || order.lines.length === 0) {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" lines must be a non-empty array`
      );
    }

    let calculatedTotal = 0;
    let expectedTotalUnits = 0;
    const orderOfferingUnits: string[] = [];

    for (let l = 0; l < order.lines.length; l++) {
      const line = order.lines[l];
      if (
        typeof line !== 'object' ||
        line === null ||
        typeof line.quantity !== 'number' ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1
      ) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" line ${l} has invalid quantity: must be integer >= 1`
        );
      }

      const offering = offeringMap.get(line.offeringId);
      if (!offering) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" line ${l} references non-existent offering "${line.offeringId}"`
        );
      }

      if (offering.restaurantId !== restaurant.id) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" line ${l} offering "${line.offeringId}" belongs to "${offering.restaurantId}", not "${restaurant.id}"`
        );
      }

      if (offering.currency !== order.currency) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" currency "${order.currency}" does not match offering currency "${offering.currency}"`
        );
      }

      calculatedTotal += offering.priceMinor * line.quantity;
      expectedTotalUnits += line.quantity;
      for (let u = 0; u < line.quantity; u++) {
        orderOfferingUnits.push(offering.id);
      }
    }

    if (order.totalAmountMinor !== calculatedTotal) {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" totalAmountMinor ${order.totalAmountMinor} does not match sum of lines ${calculatedTotal}`
      );
    }

    if (typeof order.currency !== 'string' || order.currency.trim() === '') {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" currency must be a non-empty string`
      );
    }

    if (order.fulfillmentMode !== 'pickup' && order.fulfillmentMode !== 'delivery') {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" invalid fulfillmentMode: "${order.fulfillmentMode}". Expected "pickup" or "delivery".`
      );
    }

    const validStatuses: OrderStatus[] = ['preparing', 'ready', 'fulfilled'];
    if (!validStatuses.includes(order.status)) {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" invalid status: "${order.status}". Expected 'preparing', 'ready', or 'fulfilled'.`
      );
    }

    const createdAtMs = Date.parse(order.createdAt);
    if (Number.isNaN(createdAtMs)) {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" invalid createdAt timestamp "${order.createdAt}"`
      );
    }

    const readyAtMs = Date.parse(order.readyAt);
    if (Number.isNaN(readyAtMs)) {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" invalid readyAt timestamp "${order.readyAt}"`
      );
    }

    if (readyAtMs < createdAtMs) {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" readyAt ("${order.readyAt}") cannot be earlier than createdAt ("${order.createdAt}")`
      );
    }

    if (order.status === 'preparing' || order.status === 'ready') {
      if (order.fulfilledAt !== null) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" fulfilledAt must be null when status is "${order.status}". Received: "${order.fulfilledAt}"`
        );
      }
      if (order.fulfilledItemIds.length !== 0) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" fulfilledItemIds must be empty when status is "${order.status}". Received: ${order.fulfilledItemIds.length} item(s)`
        );
      }
    } else if (order.status === 'fulfilled') {
      if (typeof order.fulfilledAt !== 'string' || order.fulfilledAt.trim() === '') {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" fulfilledAt must be a non-empty string when status is "fulfilled"`
        );
      }
      const fulfilledAtMs = Date.parse(order.fulfilledAt);
      if (Number.isNaN(fulfilledAtMs)) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" invalid fulfilledAt timestamp "${order.fulfilledAt}"`
        );
      }
      if (fulfilledAtMs < readyAtMs) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" fulfilledAt ("${order.fulfilledAt}") cannot be earlier than readyAt ("${order.readyAt}")`
        );
      }
    }

    // Validate purchaseIds
    if (!Array.isArray(order.purchaseIds) || order.purchaseIds.length !== expectedTotalUnits) {
      throw new Error(
        `Order Authority Invariant Violated: order "${order.id}" purchaseIds length (${order.purchaseIds?.length}) does not match expected total unit quantity (${expectedTotalUnits})`
      );
    }

    for (let p = 0; p < order.purchaseIds.length; p++) {
      const pid = order.purchaseIds[p];
      if (typeof pid !== 'string' || pid.trim() === '') {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" purchaseId at index ${p} must be a non-empty string`
        );
      }

      if (seenPurchaseIds.has(pid)) {
        throw new Error(
          `Order Authority Invariant Violated: duplicate purchaseId "${pid}" referenced across orders`
        );
      }
      seenPurchaseIds.add(pid);

      const purchase = purchaseMap.get(pid);
      if (!purchase) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" purchaseId "${pid}" references non-existent purchase`
        );
      }

      if (purchase.playerId !== order.customerId) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" purchase "${pid}" playerId "${purchase.playerId}" does not match customerId "${order.customerId}"`
        );
      }

      if (purchase.restaurantId !== order.restaurantId) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" purchase "${pid}" restaurantId "${purchase.restaurantId}" does not match order restaurantId "${order.restaurantId}"`
        );
      }

      if (purchase.offeringId !== orderOfferingUnits[p]) {
        throw new Error(
          `Order Authority Invariant Violated: order "${order.id}" purchase "${pid}" offeringId "${purchase.offeringId}" does not match expected offering "${orderOfferingUnits[p]}"`
        );
      }

      if (order.status === 'preparing' || order.status === 'ready') {
        for (const item of itemMap.values()) {
          if (item.sourcePurchaseId === pid) {
            throw new Error(
              `Order Authority Invariant Violated: in-flight order "${order.id}" (status: "${order.status}") references purchase "${pid}" which already has an OwnedItem "${item.id}"`
            );
          }
        }
      }
    }

    // If fulfilled, validate fulfilledItemIds
    if (order.status === 'fulfilled') {
      if (!Array.isArray(order.fulfilledItemIds) || order.fulfilledItemIds.length !== expectedTotalUnits) {
        throw new Error(
          `Order Authority Invariant Violated: fulfilled order "${order.id}" fulfilledItemIds length (${order.fulfilledItemIds?.length}) does not match expected units (${expectedTotalUnits})`
        );
      }

      for (let m = 0; m < order.fulfilledItemIds.length; m++) {
        const iid = order.fulfilledItemIds[m];
        if (typeof iid !== 'string' || iid.trim() === '') {
          throw new Error(
            `Order Authority Invariant Violated: order "${order.id}" fulfilledItemId at index ${m} must be a non-empty string`
          );
        }

        if (seenItemIds.has(iid)) {
          throw new Error(
            `Order Authority Invariant Violated: duplicate fulfilledItemId "${iid}" referenced across orders`
          );
        }
        seenItemIds.add(iid);

        const item = itemMap.get(iid);
        if (!item) {
          throw new Error(
            `Order Authority Invariant Violated: order "${order.id}" fulfilledItemId "${iid}" references non-existent item`
          );
        }

        const expectedPurchaseId = order.purchaseIds[m];
        if (item.sourcePurchaseId !== expectedPurchaseId) {
          throw new Error(
            `Order Authority Invariant Violated: item "${iid}" sourcePurchaseId "${item.sourcePurchaseId}" does not match expected purchaseId "${expectedPurchaseId}" for order "${order.id}"`
          );
        }

        // In Milestone 50, item.ownerAgentId represents current physical possession/custody,
        // which may diverge from original order customerId upon peer-to-peer handoff.
        // Commercial provenance is guaranteed by item.sourcePurchaseId === expectedPurchaseId.

        if (item.restaurantId !== order.restaurantId) {
          throw new Error(
            `Order Authority Invariant Violated: item "${iid}" restaurantId "${item.restaurantId}" does not match order restaurantId "${order.restaurantId}"`
          );
        }
      }
    }
  }
}
