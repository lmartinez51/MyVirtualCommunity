import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { ApiClient } from '../src/client/api-client.js';
import { ClientSession } from '../src/client/session.js';
import { WorldRenderer } from '../src/client/renderer.js';

describe('Milestone 44: Visual Restaurant Experience', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `m44-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
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
        // Ignore test cleanup error
      }
    }
  });

  test('Complete restaurant lifecycle: navigation, time advance, service inquiry, order, prep, collect, rejections, and reload reconciliation', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);

    // 1. Initial State
    const initOk = await session.init();
    assert.equal(initOk, true);
    assert.equal(session.getState().model?.locationId, 'building:development-building');

    // If currently during open hours (15:00-23:00 UTC / 09:00-17:00 Local), advance simulation to closed period (00:00 UTC / 18:00 Local)
    const initDate = new Date(session.getState().model!.worldTime);
    const initHour = initDate.getUTCHours();
    if (initHour >= 15 && initHour < 23) {
      const closedDate = new Date(initDate.getTime());
      closedDate.setUTCDate(closedDate.getUTCDate() + 1);
      closedDate.setUTCHours(0, 0, 0, 0);
      const toClosedMs = closedDate.getTime() - initDate.getTime();
      await session.stepSimulation(toClosedMs);
    }

    // Attempting to enter restaurant while closed is authoritatively rejected
    const closedEnter = await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });
    assert.equal(closedEnter, false);
    assert.equal(session.getState().status, 'DOMAIN_ERROR');
    assert.match(session.getState().errorMessage || '', /closed/);

    // 2. Advance Simulation Time to 10:00 Local (16:00 UTC) (Operational Hours)
    const worldTime = session.getState().model!.worldTime;
    const currentDate = new Date(worldTime);
    const targetDate = new Date(currentDate.getTime());
    targetDate.setUTCHours(16, 0, 0, 0);
    let diffMs = targetDate.getTime() - currentDate.getTime();
    if (diffMs <= 0) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
      diffMs = targetDate.getTime() - currentDate.getTime();
    }

    const stepOk = await session.stepSimulation(diffMs);
    assert.equal(stepOk, true);

    // Enter restaurant now that it is open
    const enterOk = await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:development-restaurant',
    });
    assert.equal(enterOk, true);
    assert.equal(session.getState().model?.locationId, 'restaurant:development-restaurant');
    assert.equal(session.getState().model?.context, 'RESTAURANT');

    // Verify staff NPC is present and active
    const agents = session.getState().model?.agents || [];
    const staffNpc = agents.find((a) => a.id === 'agent:dev-npc');
    assert.ok(staffNpc, 'agent:dev-npc must be present at restaurant at 10:00 UTC');

    // 3. Service Inquiry
    const inquireOk = await session.inquireRestaurantService(staffNpc.id);
    assert.equal(inquireOk, true);
    const svc = session.getState().restaurantService;
    assert.ok(svc);
    assert.equal(svc.prompt, 'Pickup or delivery?');
    assert.ok(svc.availableOfferings && svc.availableOfferings.length > 0);
    assert.ok(svc.supportedFulfillmentModes?.includes('pickup'));
    assert.ok(svc.deferredFulfillmentModes?.includes('delivery'));

    // 4. Place Order (Pickup)
    const placeOk = await session.executeCommand('placeOrder', {
      restaurantId: 'restaurant:development-restaurant',
      lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.equal(placeOk, true);

    const activeOrder = session.getState().activeOrder;
    assert.ok(activeOrder);
    assert.equal(activeOrder.status, 'preparing');
    assert.equal(activeOrder.totalAmountMinor, 500);
    assert.equal(activeOrder.currency, 'USD');
    assert.ok(activeOrder.readyAt);

    // 5. Premature Collect (Invalid Collection while PREPARING)
    const prematureCollect = await session.executeCommand('collectOrder', {
      orderId: activeOrder.id,
    });
    assert.equal(prematureCollect, false);
    assert.equal(session.getState().status, 'DOMAIN_ERROR');
    assert.equal(session.getState().activeOrder?.status, 'preparing');

    // 6. Advance Simulation 5 Minutes (Preparation Duration)
    const prepStepOk = await session.stepSimulation(300000);
    assert.equal(prepStepOk, true);
    assert.equal(session.getState().activeOrder?.status, 'ready');

    // 7. Successful Collection
    const collectOk = await session.executeCommand('collectOrder', {
      orderId: activeOrder.id,
    });
    assert.equal(collectOk, true);
    assert.equal(session.getState().activeOrder?.status, 'fulfilled');

    // Verify player possessions include the instantiated OwnedItem
    const inventory = session.getState().model?.playerInventory || [];
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].name, 'Coffee');
    assert.equal(inventory[0].offeringId, 'offering:development-coffee');
    assert.equal(inventory[0].restaurantId, 'restaurant:development-restaurant');

    // 8. Test Invalid Orders (HTTP 400 and 422)
    // 8a. Invalid quantity 0 -> HTTP 400
    const invalidQtyOk = await session.executeCommand('placeOrder', {
      restaurantId: 'restaurant:development-restaurant',
      lines: [{ offeringId: 'offering:development-coffee', quantity: 0 }],
      fulfillmentMode: 'pickup',
    });
    assert.equal(invalidQtyOk, false);
    assert.equal(session.getState().status, 'SERVER_ERROR'); // 400 Bad Request

    // 8b. Insufficient funds (Player has $15 left after $5 purchase, 5 coffees = $25) -> HTTP 422
    const insufficientFundsOk = await session.executeCommand('placeOrder', {
      restaurantId: 'restaurant:development-restaurant',
      lines: [{ offeringId: 'offering:development-coffee', quantity: 5 }],
      fulfillmentMode: 'pickup',
    });
    assert.equal(insufficientFundsOk, false);
    assert.equal(session.getState().status, 'DOMAIN_ERROR'); // 422 Unprocessable Entity

    // 8c. Delivery mode deferred -> HTTP 422
    const deliveryModeOk = await session.executeCommand('placeOrder', {
      restaurantId: 'restaurant:development-restaurant',
      lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
      fulfillmentMode: 'delivery',
    });
    assert.equal(deliveryModeOk, false);
    assert.equal(session.getState().status, 'DOMAIN_ERROR'); // 422 Unprocessable Entity

    // 9. Client Reload Reconciliation
    // A freshly initialized client connecting to the authoritative server
    const reloadedSession = new ClientSession(apiClient);
    const reloadOk = await reloadedSession.init();
    assert.equal(reloadOk, true);

    const reloadedState = reloadedSession.getState();
    assert.equal(reloadedState.model?.locationId, 'restaurant:development-restaurant');
    assert.equal(reloadedState.model?.context, 'RESTAURANT');
    assert.equal(reloadedState.model?.playerInventory.length, 1);
    assert.equal(reloadedState.model?.playerInventory[0].name, 'Coffee');

    // Renderer instantiates and renders headless without crash
    const renderer = new WorldRenderer();
    assert.doesNotThrow(() => renderer.render(reloadedState));
  });
});
