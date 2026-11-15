import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  WorldState,
  validateWorldState,
  areAgentsCoLocated,
  inspectCurrentLocation,
  inquireRestaurantService,
  placeOrder,
  collectOrder,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { Agent } from '../src/core/entities/agent.js';
import { createGomezMorinSeedWorld } from '../src/core/seed.js';
import {
  createGomezMorinSpatialTopology,
  validateAgentSpatialInvariants,
  findInteriorSpaceById,
  executeUnifiedEntranceIngress,
  traverseInternalConnection,
} from '../src/core/real-world-street-topology.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { ApiClient } from '../src/client/api-client.js';
import { ClientSession } from '../src/client/session.js';

// Operational shift time for Elena Morales at Wing Spot (10:00 AM Local / 16:00 UTC)
const SHIFT_ACTIVE_TIME = '2026-10-05T16:00:00.000Z';

describe('Milestone 88: First Complete Establishment Customer Experience (Wing Spot Gómez Morín)', () => {
  function createTestWorldState(): WorldState {
    const seed = createGomezMorinSeedWorld(SHIFT_ACTIVE_TIME);
    // Put Elena on duty in the public dining room for service testing
    const elena = seed.agents.find((a) => a.id === 'agent:elena-npc')!;
    elena.locationId = 'restaurant:wing-spot';
    elena.interiorSpaceId = 'interior:wing-spot';
    elena.activityState = 'active';

    return {
      worldId: 'juarez-el-paso',
      version: 19,
      worldTime: SHIFT_ACTIVE_TIME,
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
      knowledge: [],
      orders: [],
      properties: seed.properties,
      siteAgentAssociations: seed.siteAgentAssociations,
    };
  }

  // =========================================================================
  // Test 1 — Phase A & B: Approach and Ingress into Wing Spot Dining Hall
  // =========================================================================
  it('Test 1: customer approaches and enters Wing Spot via canonical entrance into authoritative dining room', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();

    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
    assert.equal(player.locationId, 'street:blvd-gomez-morin');
    assert.equal(player.interiorSpaceId, null);

    // Ingress through entrance:wing-spot-main
    const ingressResult = executeUnifiedEntranceIngress(
      state,
      {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -45.0, z: -12.4 },
      },
      topology
    );

    assert.equal(ingressResult.success, true);
    assert.equal(ingressResult.code, 'success');
    assert.equal(player.locationId, 'restaurant:wing-spot');
    assert.equal(player.interiorSpaceId, 'interior:wing-spot');

    // Spatial invariants check
    const invariantCheck = validateAgentSpatialInvariants(player, topology);
    assert.equal(invariantCheck.valid, true);
    assert.deepEqual(invariantCheck.errors, []);
  });

  // =========================================================================
  // Test 2 — Phase C & D: Establishment Presence & NPC Co-Location Perception
  // =========================================================================
  it('Test 2: customer inside dining hall perceives venue details and co-located attendant Elena', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();
    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;

    // Move player into dining hall
    executeUnifiedEntranceIngress(
      state,
      {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
        spatialPosition: { x: -45.0, z: -12.4 },
      },
      topology
    );

    // Inspect current location
    const perception = inspectCurrentLocation(state, player.id);
    assert.equal(perception.success, true);
    assert.equal(perception.location?.id, 'restaurant:wing-spot');
    assert.equal(perception.location?.name, 'Wing Spot Gómez Morín');
    assert.equal(perception.location?.operationalState, 'open');

    // Observable agents must include Elena
    const observableElena = perception.location?.agents?.find((a) => a.id === 'agent:elena-npc');
    assert.ok(observableElena, 'Elena Morales must be observed as co-located inside the dining hall');
    assert.equal(observableElena?.name, 'Elena Morales');
    assert.equal(observableElena?.agentType, 'npc');

    // areAgentsCoLocated confirms true
    assert.equal(areAgentsCoLocated(state, player.id, 'agent:elena-npc'), true);
  });

  // =========================================================================
  // Test 3 — Multi-Room Partitioning: Gating & Co-Presence Boundary
  // =========================================================================
  it('Test 3: co-presence and service affordance fail when Elena is in back-of-house kitchen', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();
    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
    const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;

    // Player enters dining hall
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';

    // Elena moves into back-of-house kitchen
    const traverseResult = traverseInternalConnection(
      state,
      {
        agentId: elena.id,
        connectionId: 'conn:wing-spot-dining-to-kitchen',
      },
      topology
    );
    assert.equal(traverseResult.success, true);
    assert.equal(elena.interiorSpaceId, 'interior:wing-spot-kitchen');

    // 1. areAgentsCoLocated must evaluate to false
    assert.equal(areAgentsCoLocated(state, player.id, elena.id), false);

    // 2. Service inquiry must reject with agents-not-co-located
    const inquiryResult = inquireRestaurantService(state as any, player.id, elena.id);
    assert.equal(inquiryResult.success, false);
    assert.equal(inquiryResult.code, 'agents-not-co-located');

    // 3. Customer cannot traverse into kitchen
    const customerTraverse = traverseInternalConnection(
      state,
      {
        agentId: player.id,
        connectionId: 'conn:wing-spot-dining-to-kitchen',
      },
      topology
    );
    assert.equal(customerTraverse.success, false);
    assert.equal(customerTraverse.code, 'unauthorized-traversal');
    assert.equal(player.interiorSpaceId, 'interior:wing-spot');
  });

  // =========================================================================
  // Test 4 — Phase E: Service Inquiry Returns Authoritative Wing Spot Menu
  // =========================================================================
  it('Test 4: service inquiry returns authentic Wing Spot offerings with zero state mutation', () => {
    const state = createTestWorldState();
    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';

    const snapshotBefore = JSON.stringify(state);

    const inquiry = inquireRestaurantService(state as any, player.id, 'agent:elena-npc');

    assert.equal(inquiry.success, true);
    assert.equal(inquiry.code, 'success');
    assert.equal(inquiry.restaurantId, 'restaurant:wing-spot');
    assert.equal(inquiry.staffNpcId, 'agent:elena-npc');
    assert.equal(inquiry.prompt, 'Pickup or delivery?');
    assert.ok(inquiry.supportedFulfillmentModes?.includes('pickup'));

    // Verify Wing Spot offerings catalog
    const offerings = inquiry.availableOfferings || [];
    assert.equal(offerings.length, 4);

    const boneless = offerings.find((o) => o.id === 'offering:boneless-wings');
    assert.ok(boneless);
    assert.equal(boneless?.name, 'Alitas Boneless');
    assert.equal(boneless?.priceMinor, 1200);

    const traditional = offerings.find((o) => o.id === 'offering:traditional-wings');
    assert.ok(traditional);
    assert.equal(traditional?.name, 'Alitas Tradicionales');
    assert.equal(traditional?.priceMinor, 1400);

    const fries = offerings.find((o) => o.id === 'offering:seasoned-fries');
    assert.ok(fries);
    assert.equal(fries?.name, 'Papas Sazonadas');
    assert.equal(fries?.priceMinor, 450);

    const soda = offerings.find((o) => o.id === 'offering:fountain-soda');
    assert.ok(soda);
    assert.equal(soda?.name, 'Refresco de Fuente');
    assert.equal(soda?.priceMinor, 250);

    // Verify zero state mutation
    const snapshotAfter = JSON.stringify(state);
    assert.equal(snapshotAfter, snapshotBefore, 'Service inquiry must cause zero state mutation');
  });

  // =========================================================================
  // Test 5 — Phase F: Multi-Line Order Placement & Atomic Settlement
  // =========================================================================
  it('Test 5: customer places multi-product order, balances settle and Order entity is created', () => {
    const state = createTestWorldState();
    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';

    const wingSpot = state.restaurants.find((r) => r.id === 'restaurant:wing-spot')!;
    assert.equal(player.balanceMinor, 2500); // $25.00 USD
    assert.equal(wingSpot.balanceMinor, 0);

    // Order: 1x Boneless Wings ($12.00) + 1x Papas Sazonadas ($4.50) + 1x Refresco ($2.50) = $19.00 (1900 minor)
    const orderResult = placeOrder(state as any, {
      customerId: player.id,
      restaurantId: 'restaurant:wing-spot',
      lines: [
        { offeringId: 'offering:boneless-wings', quantity: 1 },
        { offeringId: 'offering:seasoned-fries', quantity: 1 },
        { offeringId: 'offering:fountain-soda', quantity: 1 },
      ],
      fulfillmentMode: 'pickup',
    });

    assert.equal(orderResult.success, true);
    assert.equal(orderResult.code, 'success');
    assert.equal(orderResult.totalAmountMinor, 1900);
    assert.equal(orderResult.currency, 'USD');
    assert.ok(orderResult.orderId);

    // Balances atomically updated
    assert.equal(player.balanceMinor, 600, 'Customer balance must be debited by 1900 (2500 -> 600)');
    assert.equal(wingSpot.balanceMinor, 1900, 'Restaurant balance must be credited by 1900 (0 -> 1900)');

    // PurchaseRecords created
    assert.equal(state.purchases.length, 3, 'Must create 3 PurchaseRecords (1 per unit)');
    assert.ok(state.purchases.every((p) => p.restaurantId === 'restaurant:wing-spot'));
    assert.ok(state.purchases.every((p) => p.playerId === player.id));

    // Order entity created in state
    assert.equal(state.orders.length, 1);
    const order = state.orders[0];
    assert.equal(order.id, orderResult.orderId);
    assert.equal(order.status, 'preparing');
    assert.equal(order.lines.length, 3);
    assert.equal(order.totalAmountMinor, 1900);
    assert.equal(order.fulfilledAt, null);
    assert.deepEqual(order.fulfilledItemIds, []);
  });

  // =========================================================================
  // Test 6 — Order Precondition Rejections with Zero Mutation
  // =========================================================================
  it('Test 6: order rejections (insufficient funds, wrong restaurant, non-co-located) guarantee zero state mutation', () => {
    const state = createTestWorldState();
    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';

    const snapshotBefore = JSON.stringify(state);

    // 1. Insufficient funds: 2x Traditional Wings ($28.00) with only $25.00
    const overspendResult = placeOrder(state as any, {
      customerId: player.id,
      restaurantId: 'restaurant:wing-spot',
      lines: [{ offeringId: 'offering:traditional-wings', quantity: 2 }],
      fulfillmentMode: 'pickup',
    });
    assert.equal(overspendResult.success, false);
    assert.equal(overspendResult.code, 'insufficient-funds');
    assert.equal(JSON.stringify(state), snapshotBefore);

    // 2. Offering belonging to another restaurant (Pastelería Tía Lupe cake)
    const foreignItemResult = placeOrder(state as any, {
      customerId: player.id,
      restaurantId: 'restaurant:wing-spot',
      lines: [{ offeringId: 'offering:pastel-de-tres-leches', quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.equal(foreignItemResult.success, false);
    assert.equal(foreignItemResult.code, 'offering-not-at-restaurant');
    assert.equal(JSON.stringify(state), snapshotBefore);

    // 3. Customer not co-located at restaurant
    player.locationId = 'street:blvd-gomez-morin';
    player.interiorSpaceId = null;
    const notCoLocatedResult = placeOrder(state as any, {
      customerId: player.id,
      restaurantId: 'restaurant:wing-spot',
      lines: [{ offeringId: 'offering:boneless-wings', quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.equal(notCoLocatedResult.success, false);
    assert.equal(notCoLocatedResult.code, 'customer-not-co-located');
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';
    assert.equal(JSON.stringify(state), snapshotBefore);
  });

  // =========================================================================
  // Test 7 — Phase G: Preparation Lifecycle and Order Collection
  // =========================================================================
  it('Test 7: simulation progression transitions order from preparing to ready, customer collects items into inventory', () => {
    const state = createTestWorldState();
    const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
    player.locationId = 'restaurant:wing-spot';
    player.interiorSpaceId = 'interior:wing-spot';

    // Place order
    const orderRes = placeOrder(state as any, {
      customerId: player.id,
      restaurantId: 'restaurant:wing-spot',
      lines: [{ offeringId: 'offering:boneless-wings', quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.equal(orderRes.success, true);
    const orderId = orderRes.orderId!;

    // 1. Premature collection fails
    const prematureCollect = collectOrder(state as any, player.id, orderId);
    assert.equal(prematureCollect.success, false);
    assert.equal(prematureCollect.code, 'order-not-ready');

    // 2. Advance simulation time by 5 minutes (300,000 ms)
    const clock = WorldClock.create(state.worldTime);
    clock.advance(300_000);
    state.worldTime = clock.getTime();

    const simulation = new Simulation(clock, state, { silent: true });
    const tickResult = simulation.tick();

    assert.ok(tickResult.orderTransitions.some((t) => t.orderId === orderId && t.newStatus === 'ready'));
    const order = state.orders.find((o) => o.id === orderId)!;
    assert.equal(order.status, 'ready');

    // 3. Successful collection
    const collectRes = collectOrder(state as any, player.id, orderId);
    assert.equal(collectRes.success, true);
    assert.equal(collectRes.code, 'success');
    assert.equal(order.status, 'fulfilled');
    assert.ok(order.fulfilledAt);

    // Items transferred to player inventory
    assert.equal(state.items.length, 1);
    const item = state.items[0];
    assert.equal(item.ownerAgentId, player.id);
    assert.equal(item.name, 'Alitas Boneless');
    assert.equal(item.status, 'available');
  });

  // =========================================================================
  // Test 8 — Persistence & Schema 19 Invariants with Active Orders
  // =========================================================================
  it('Test 8: world state with active order and debited balances persists and reloads cleanly under Schema 19', () => {
    const topology = createGomezMorinSpatialTopology();
    const state = createTestWorldState();
    const tempFile = join(tmpdir(), `m88-persist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);

    try {
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';

      // Place order
      const orderRes = placeOrder(state as any, {
        customerId: player.id,
        restaurantId: 'restaurant:wing-spot',
        lines: [{ offeringId: 'offering:boneless-wings', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.equal(orderRes.success, true);

      // Save to disk
      const persistence = new LocalFilePersistence(tempFile);
      persistence.save(state);

      // Reload and validate
      const loadedState = persistence.load();
      assert.equal(loadedState.version, 19, 'Schema version must remain strictly 19');
      assert.doesNotThrow(() => validateWorldState(loadedState));

      // Verify spatial invariants on all agents
      const loadedPlayer = loadedState.agents.find((a) => a.id === player.id)!;
      assert.equal(loadedPlayer.locationId, 'restaurant:wing-spot');
      assert.equal(loadedPlayer.interiorSpaceId, 'interior:wing-spot');
      assert.equal(loadedPlayer.balanceMinor, 1300); // 2500 - 1200 = 1300

      const loadedWingSpot = loadedState.restaurants.find((r) => r.id === 'restaurant:wing-spot')!;
      assert.equal(loadedWingSpot.balanceMinor, 1200);

      assert.equal(loadedState.orders.length, 1);
      assert.equal(loadedState.orders[0].status, 'preparing');
      assert.equal(loadedState.purchases.length, 1);

      // Invariant check
      const invariantCheck = validateAgentSpatialInvariants(loadedPlayer, topology);
      assert.equal(invariantCheck.valid, true);
    } finally {
      if (existsSync(tempFile)) {
        try {
          unlinkSync(tempFile);
        } catch {}
      }
    }
  });
});

// =========================================================================
// Visual Client & HTTP Server Integration Suite
// =========================================================================
describe('Milestone 88: Visual Client & HTTP Session Integration', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `m88-http-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

    // Create controller with Gómez Morín state
    const seed = createGomezMorinSeedWorld(SHIFT_ACTIVE_TIME);
    // Put Elena on duty in dining hall
    const elena = seed.agents.find((a) => a.id === 'agent:elena-npc')!;
    elena.locationId = 'restaurant:wing-spot';
    elena.interiorSpaceId = 'interior:wing-spot';
    elena.activityState = 'active';

    const initialWorldState: WorldState = {
      worldId: 'juarez-el-paso',
      version: 19,
      worldTime: SHIFT_ACTIVE_TIME,
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
      knowledge: [],
      orders: [],
      properties: seed.properties,
      siteAgentAssociations: seed.siteAgentAssociations,
    };

    const persistence = new LocalFilePersistence(tempFilePath);
    persistence.save(initialWorldState);

    const controller = new WorldSessionController({
      persistencePath: tempFilePath,
      playerId: 'agent:gomez-morin-player',
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
      } catch {}
    }
  });

  it('Test 9: end-to-end client session enters Wing Spot, inspects menu, places order, advances prep, and collects item', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);

    // 1. Client connects
    const initOk = await session.init();
    assert.equal(initOk, true);
    assert.equal(session.getState().model?.locationId, 'street:blvd-gomez-morin');
    assert.equal(session.getState().model?.context, 'STREET');

    // 2. Client enters Wing Spot through entrance threshold
    const enterOk = await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:wing-spot',
    });
    assert.equal(enterOk, true);
    assert.equal(session.getState().model?.locationId, 'restaurant:wing-spot');
    assert.equal(session.getState().model?.context, 'RESTAURANT');
    assert.equal(session.getState().model?.locationName, 'Wing Spot Gómez Morín');

    // 3. Client perceives co-located Elena
    const agents = session.getState().model?.agents || [];
    const elena = agents.find((a) => a.id === 'agent:elena-npc');
    assert.ok(elena, 'Elena must be present in client perception');

    // 4. Inquire restaurant service
    const inquireOk = await session.inquireRestaurantService('agent:elena-npc');
    assert.equal(inquireOk, true);
    const svc = session.getState().restaurantService;
    assert.ok(svc);
    assert.equal(svc.prompt, 'Pickup or delivery?');
    assert.equal(svc.availableOfferings?.length, 4);

    // 5. Place order: 1x Boneless Wings ($12.00)
    const placeOk = await session.executeCommand('placeOrder', {
      restaurantId: 'restaurant:wing-spot',
      lines: [{ offeringId: 'offering:boneless-wings', quantity: 1 }],
      fulfillmentMode: 'pickup',
    });
    assert.equal(placeOk, true);
    assert.equal(session.getState().activeOrder?.status, 'preparing');
    assert.equal(session.getState().activeOrder?.totalAmountMinor, 1200);

    // 6. Advance simulation 5 minutes (300,000 ms)
    const stepOk = await session.stepSimulation(300000);
    assert.equal(stepOk, true);
    assert.equal(session.getState().activeOrder?.status, 'ready');

    // 7. Collect order
    const collectOk = await session.executeCommand('collectOrder', {
      orderId: session.getState().activeOrder!.id,
    });
    assert.equal(collectOk, true);
    assert.equal(session.getState().activeOrder?.status, 'fulfilled');

    // 8. Verify item in player inventory projection
    const inventory = session.getState().model?.playerInventory || [];
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].name, 'Alitas Boneless');
    assert.equal(inventory[0].offeringId, 'offering:boneless-wings');
    assert.equal(inventory[0].restaurantId, 'restaurant:wing-spot');
  });

  it('Test 10: server command POST /api/commands/inquireRestaurantService succeeds with authoritative catalog', async () => {
    const apiClient = new ApiClient(baseUrl);
    const session = new ClientSession(apiClient);
    await session.init();

    // Enter restaurant first
    await session.executeCommand('enterRestaurant', {
      restaurantId: 'restaurant:wing-spot',
    });

    // Execute command via POST /api/commands/inquireRestaurantService
    const cmdResult = await apiClient.postCommand('inquireRestaurantService', {
      staffNpcId: 'agent:elena-npc',
    });

    assert.equal(cmdResult.success, true);
    assert.equal(cmdResult.status, 200);
    const resultData = cmdResult.result as any;
    assert.equal(resultData.success, true);
    assert.equal(resultData.restaurantId, 'restaurant:wing-spot');
    assert.equal(resultData.availableOfferings?.length, 4);
  });
});
