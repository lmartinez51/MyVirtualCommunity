import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { ApiClient } from '../src/client/api-client.js';
import { ORDER_PREPARATION_DURATION_MS } from '../src/core/world-state.js';

describe('Milestone 41: Order Fulfillment HTTP Exposure', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';
  let apiClient: ApiClient;

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `order-http-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

    const controller = new WorldSessionController({
      persistencePath: tempFilePath,
      silent: true,
    });

    server = createWorldServer({
      controller,
      silent: true,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = info.url;
    apiClient = new ApiClient(baseUrl);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    if (existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  /**
   * Helper: Sets up player and NPC co-located in open development restaurant (at 10:00 UTC).
   * In the dev world:
   * - At 10:00 UTC, dev restaurant is open (09:00-17:00 UTC).
   * - At 10:00 UTC, agent:dev-npc is active and located at restaurant:development-restaurant.
   * - Player enters building:development-building -> restaurant:development-restaurant.
   */
  async function setupPlayerAndNpcInRestaurant() {
    // 1. Advance world time to 10:00 Local (16:00 UTC)
    const statusRes = await apiClient.getStatus();
    assert.equal(statusRes.success, true);
    const current = new Date(statusRes.result.worldTime);
    const target = new Date(current);
    target.setUTCHours(16, 0, 0, 0);
    if (target.getTime() <= current.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    const advanceDurationMs = target.getTime() - current.getTime();

    const simRes = await fetch(`${baseUrl}/api/simulation/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advanceDurationMs }),
    });
    assert.equal(simRes.status, 200);

    // 2. Move player into restaurant
    const enterRes = await apiClient.postCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });
    assert.equal(enterRes.success, true);
  }

  // =========================================================================
  // 1. Service Inquiry (GET /api/service)
  // =========================================================================
  describe('1. Restaurant Service Inquiry (GET /api/service)', () => {
    test('successful service inquiry when player and staff are co-located at open restaurant', async () => {
      await setupPlayerAndNpcInRestaurant();

      const queryRes = await apiClient.getRestaurantService('agent:dev-npc');
      assert.equal(queryRes.success, true);
      assert.equal(queryRes.status, 200);
      assert.equal(queryRes.result.success, true);
      assert.equal(queryRes.result.code, 'success');
      assert.equal(queryRes.result.prompt, 'Pickup or delivery?');
      assert.equal(queryRes.result.restaurantId, 'restaurant:development-restaurant');
      assert.equal(queryRes.result.staffAgentId, 'agent:dev-npc');
      assert.ok(Array.isArray(queryRes.result.offerings));
      assert.ok(queryRes.result.offerings.length >= 1);
      assert.ok(queryRes.result.supportedModes.includes('pickup'));
      assert.ok(queryRes.result.supportedModes.includes('delivery'));
    });

    test('supports path parameter format GET /api/service/:staffNpcId', async () => {
      await setupPlayerAndNpcInRestaurant();

      const res = await fetch(`${baseUrl}/api/service/agent:dev-npc`);
      assert.equal(res.status, 200);
      const data = (await res.json()) as { success: boolean; result: { success: boolean; code: string } };
      assert.equal(data.success, true);
      assert.equal(data.result.success, true);
      assert.equal(data.result.code, 'success');
    });

    test('returns 400 invalid-query-input when staffNpcId is missing', async () => {
      const res = await fetch(`${baseUrl}/api/service`);
      assert.equal(res.status, 400);
      const data = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'invalid-query-input');
    });

    test('rejection when customer and staff are not co-located returns 200 with success: false', async () => {
      // Player is still at building:development-building, NPC is at home or elsewhere
      const queryRes = await apiClient.getRestaurantService('agent:dev-npc');
      assert.equal(queryRes.status, 200);
      assert.equal(queryRes.result.success, false);
      assert.equal(queryRes.result.code, 'agents-not-co-located');
    });

    test('service inquiry produces zero state mutations on disk and in memory', async () => {
      await setupPlayerAndNpcInRestaurant();

      const mtimeBefore = statSync(tempFilePath).mtimeMs;
      const contentBefore = readFileSync(tempFilePath, 'utf-8');

      await apiClient.getRestaurantService('agent:dev-npc');

      assert.equal(statSync(tempFilePath).mtimeMs, mtimeBefore);
      assert.equal(readFileSync(tempFilePath, 'utf-8'), contentBefore);
    });
  });

  // =========================================================================
  // 2. Order Placement (POST /api/commands/placeOrder)
  // =========================================================================
  describe('2. Order Placement (placeOrder command)', () => {
    test('successful order placement creates order in preparing status with atomic payment', async () => {
      await setupPlayerAndNpcInRestaurant();

      const placeRes = await apiClient.postCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 2 }],
        fulfillmentMode: 'pickup',
      });

      assert.equal(placeRes.success, true);
      assert.equal(placeRes.status, 200);
      const result = placeRes.result as {
        success: boolean;
        orderId: string;
        purchaseIds: string[];
        totalAmountMinor: number;
        currency: string;
        readyAt: string;
      };
      assert.equal(result.success, true);
      assert.ok(result.orderId.startsWith('order:'));
      assert.equal(result.purchaseIds.length, 2);
      assert.equal(result.totalAmountMinor, 1000); // 2 * 500
      assert.equal(result.currency, 'USD');
      assert.ok(result.readyAt);

      // Verify persisted state contains the order and purchase records
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      const order = persisted.orders.find((o: { id: string }) => o.id === result.orderId);
      assert.ok(order);
      assert.equal(order.status, 'preparing');
      assert.equal(order.lines.length, 1);
      assert.equal(order.lines[0].quantity, 2);

      // Verify balance was deducted: started at 2000, paid 1000 -> 1000
      const player = persisted.agents.find((a: { id: string }) => a.id === 'agent:dev-player');
      assert.equal(player.balanceMinor, 1000);
    });

    test('rejection for identity override attempt in placeOrder body returns 400', async () => {
      await setupPlayerAndNpcInRestaurant();

      const res = await fetch(`${baseUrl}/api/commands/placeOrder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: 'agent:impersonated',
          restaurantId: 'restaurant:development-restaurant',
          lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        }),
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'identity-override-forbidden');
    });

    test('rejection for invalid input shape (missing lines) returns 400', async () => {
      await setupPlayerAndNpcInRestaurant();

      const res = await fetch(`${baseUrl}/api/commands/placeOrder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: 'restaurant:development-restaurant',
        }),
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'invalid-command-input');
    });

    test('rejection for invalid line quantity (0 or negative) returns 400', async () => {
      await setupPlayerAndNpcInRestaurant();

      const res = await fetch(`${baseUrl}/api/commands/placeOrder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: 'restaurant:development-restaurant',
          lines: [{ offeringId: 'offering:development-coffee', quantity: 0 }],
        }),
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'invalid-command-input');
    });

    test('domain rejection for insufficient funds returns 422 with zero partial mutation', async () => {
      await setupPlayerAndNpcInRestaurant();

      // Drain player balance or order quantity that exceeds balance (2000 minor)
      // 5 * 500 = 2500 > 2000
      const mtimeBefore = statSync(tempFilePath).mtimeMs;

      const placeRes = await apiClient.postCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 5 }],
        fulfillmentMode: 'pickup',
      });

      assert.equal(placeRes.success, false);
      assert.equal(placeRes.status, 422);
      assert.equal(placeRes.error?.code, 'insufficient-funds');

      // Zero disk mutation
      assert.equal(statSync(tempFilePath).mtimeMs, mtimeBefore);

      // Verify player balance intact
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      const player = persisted.agents.find((a: { id: string }) => a.id === 'agent:dev-player');
      assert.equal(player.balanceMinor, 2000);
    });

    test('delivery mode returns 422 delivery-mode-deferred (preserving M39 contract)', async () => {
      await setupPlayerAndNpcInRestaurant();

      const placeRes = await apiClient.postCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        fulfillmentMode: 'delivery',
      });

      assert.equal(placeRes.success, false);
      assert.equal(placeRes.status, 422);
      assert.equal(placeRes.error?.code, 'delivery-mode-deferred');
    });
  });

  // =========================================================================
  // 3. Simulation Preparation & Order Progression
  // =========================================================================
  describe('3. Simulation Preparation & Order Progression', () => {
    test('advancing simulation progresses order from preparing to ready in tickResult.orderTransitions', async () => {
      await setupPlayerAndNpcInRestaurant();

      const placeRes = await apiClient.postCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.equal(placeRes.success, true);
      const orderId = (placeRes.result as { orderId: string }).orderId;

      // Advance clock past preparation time (5 minutes = ORDER_PREPARATION_DURATION_MS)
      const simRes = await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs: ORDER_PREPARATION_DURATION_MS }),
      });
      assert.equal(simRes.status, 200);
      const simData = (await simRes.json()) as {
        result: {
          tickResult: {
            orderTransitions?: Array<{
              orderId: string;
              previousStatus: string;
              newStatus: string;
              readyAt: string;
            }>;
          };
        };
      };

      assert.ok(simData.result.tickResult.orderTransitions);
      assert.equal(simData.result.tickResult.orderTransitions.length, 1);
      const transition = simData.result.tickResult.orderTransitions[0];
      assert.equal(transition.orderId, orderId);
      assert.equal(transition.previousStatus, 'preparing');
      assert.equal(transition.newStatus, 'ready');

      // Check persisted state shows order is now 'ready'
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      const order = persisted.orders.find((o: { id: string }) => o.id === orderId);
      assert.equal(order.status, 'ready');
    });
  });

  // =========================================================================
  // 4. Order Collection (POST /api/commands/collectOrder)
  // =========================================================================
  describe('4. Order Collection (collectOrder command)', () => {
    test('fails with 422 order-not-ready when order is still in preparing status', async () => {
      await setupPlayerAndNpcInRestaurant();

      const placeRes = await apiClient.postCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.equal(placeRes.success, true);
      const orderId = (placeRes.result as { orderId: string }).orderId;

      // Attempt collection immediately without simulation progression
      const collectRes = await apiClient.postCommand('collectOrder', { orderId });
      assert.equal(collectRes.success, false);
      assert.equal(collectRes.status, 422);
      assert.equal(collectRes.error?.code, 'order-not-ready');
    });

    test('successful order collection instantiates OwnedItems 1:1 and marks order fulfilled', async () => {
      await setupPlayerAndNpcInRestaurant();

      const placeRes = await apiClient.postCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 2 }],
        fulfillmentMode: 'pickup',
      });
      assert.equal(placeRes.success, true);
      const orderId = (placeRes.result as { orderId: string }).orderId;

      // Advance past preparation duration
      await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs: ORDER_PREPARATION_DURATION_MS }),
      });

      // Collect order
      const collectRes = await apiClient.postCommand('collectOrder', { orderId });
      assert.equal(collectRes.success, true);
      assert.equal(collectRes.status, 200);
      const collectResult = collectRes.result as {
        success: boolean;
        orderId: string;
        fulfilledItemIds: string[];
      };
      assert.equal(collectResult.success, true);
      assert.equal(collectResult.orderId, orderId);
      assert.equal(collectResult.fulfilledItemIds.length, 2);

      // Verify persisted state: order is fulfilled, items exist on customer
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      const order = persisted.orders.find((o: { id: string }) => o.id === orderId);
      assert.equal(order.status, 'fulfilled');
      assert.ok(order.fulfilledAt);

      const items = persisted.items.filter((i: { ownerAgentId: string }) => i.ownerAgentId === 'agent:dev-player');
      assert.equal(items.length, 2);
      assert.equal(items[0].status, 'available');
      assert.equal(items[1].status, 'available');
    });

    test('rejection when customer is not co-located at restaurant returns 422 customer-not-co-located', async () => {
      await setupPlayerAndNpcInRestaurant();

      const placeRes = await apiClient.postCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.equal(placeRes.success, true);
      const orderId = (placeRes.result as { orderId: string }).orderId;

      // Advance past preparation duration
      await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs: ORDER_PREPARATION_DURATION_MS }),
      });

      // Player leaves restaurant back to building
      const exitRes = await apiClient.postCommand('exitRestaurant', {});
      assert.equal(exitRes.success, true);

      // Attempt collection from building lobby
      const collectRes = await apiClient.postCommand('collectOrder', { orderId });
      assert.equal(collectRes.success, false);
      assert.equal(collectRes.status, 422);
      assert.equal(collectRes.error?.code, 'customer-not-co-located');
    });

    test('rejection for already-fulfilled order returns 422 order-already-fulfilled', async () => {
      await setupPlayerAndNpcInRestaurant();

      const placeRes = await apiClient.postCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      const orderId = (placeRes.result as { orderId: string }).orderId;

      await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs: ORDER_PREPARATION_DURATION_MS }),
      });

      const firstCollect = await apiClient.postCommand('collectOrder', { orderId });
      assert.equal(firstCollect.success, true);

      // Second collection attempt
      const secondCollect = await apiClient.postCommand('collectOrder', { orderId });
      assert.equal(secondCollect.success, false);
      assert.equal(secondCollect.status, 422);
      assert.equal(secondCollect.error?.code, 'order-already-fulfilled');
    });
  });

  // =========================================================================
  // 5. Complete End-to-End Flow & State Reconciliation
  // =========================================================================
  describe('5. Complete End-to-End Lifecycle & Reconciliation', () => {
    test('full flow: service inquiry -> place order -> sim step -> collect -> observe inventory in location view', async () => {
      await setupPlayerAndNpcInRestaurant();

      // 1. Service Inquiry
      const serviceRes = await apiClient.getRestaurantService('agent:dev-npc');
      assert.equal(serviceRes.success, true);
      assert.equal(serviceRes.result.code, 'success');
      const offeringId = serviceRes.result.offerings[0].id;

      // 2. Initial Location View (playerInventory is empty)
      const locBefore = await apiClient.getLocation();
      assert.equal(locBefore.success, true);
      assert.equal(locBefore.result.playerInventory.length, 0);

      // 3. Place Order
      const placeRes = await apiClient.postCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId, quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.equal(placeRes.success, true);
      const orderId = (placeRes.result as { orderId: string }).orderId;

      // 4. Advance simulation to make order ready
      const simRes = await fetch(`${baseUrl}/api/simulation/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDurationMs: ORDER_PREPARATION_DURATION_MS }),
      });
      assert.equal(simRes.status, 200);

      // 5. Collect Order
      const collectRes = await apiClient.postCommand('collectOrder', { orderId });
      assert.equal(collectRes.success, true);

      // 6. State Reconciliation: Location view now authoritatively exposes the newly fulfilled OwnedItem!
      const locAfter = await apiClient.getLocation();
      assert.equal(locAfter.success, true);
      assert.equal(locAfter.result.playerInventory.length, 1);
      assert.equal(locAfter.result.playerInventory[0].offeringId, offeringId);
      assert.equal(locAfter.result.playerInventory[0].restaurantId, 'restaurant:development-restaurant');

      // 7. Player History view authoritatively exposes the PurchaseRecord created by placeOrder!
      const historyRes = await apiClient.getHistory();
      assert.equal(historyRes.success, true);
      assert.equal(historyRes.result.history.purchases.length, 1);
      assert.equal(historyRes.result.history.purchases[0].offeringId, offeringId);
    });
  });
});
