import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  purchaseOffering,
  startEatingPastry,
  inspectCurrentLocation,
  makeDevelopmentOfferingAvailable,
  transferItemPossession,
  getOwnedItem,
  getPlayerAvailableItems,
  consumeOwnedItem,
  validateItemAuthority,
  validateOrderAuthority,
  placeOrder,
  tickOrderPreparation,
  collectOrder,
  introduceToAgent,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  WorldState,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import {
  createPresentationModel,
  findInspectableEntity,
  getAffordanceGroup,
} from '../src/client/projections.js';

describe('Milestone 50: Peer-to-Peer Physical Possession Handoff', () => {
  const BASE_TIME = '2026-09-23T10:00:00.000Z';
  const RESTAURANT_ID = 'restaurant:development-restaurant';
  const DEV_PLAYER_ID = 'agent:dev-player';
  const DEV_NPC_ID = 'agent:dev-npc';

  function setupWorldWithPurchasedPastry(time: string = BASE_TIME): {
    clock: WorldClock;
    state: WorldState;
    itemId: string;
  } {
    const clock = WorldClock.create(time);
    const state = createInitialWorldState(clock);

    // Open development restaurant
    const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
    rest.operationalState = 'open';

    // Dev NPC is active and at restaurant
    const npc = state.agents.find((a) => a.id === DEV_NPC_ID)!;
    npc.locationId = RESTAURANT_ID;
    npc.activityState = 'active';

    // Player inside restaurant
    const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
    player.locationId = RESTAURANT_ID;

    // Publish Pan Dulce offering and purchase it
    makeDevelopmentOfferingAvailable(state, DEV_NPC_ID, RESTAURANT_ID);
    const purchaseResult = purchaseOffering(
      state,
      DEV_PLAYER_ID,
      DEVELOPMENT_PASTRY_OFFERING_ID,
      RESTAURANT_ID,
      { silent: true }
    );
    assert.strictEqual(purchaseResult.success, true);
    assert.ok(purchaseResult.itemId);

    // Establish mutual acquaintance
    introduceToAgent(state, DEV_PLAYER_ID, DEV_NPC_ID);

    return { clock, state, itemId: purchaseResult.itemId! };
  }

  // =========================================================================
  // Group 1: Deterministic Domain Preconditions & Evaluation Order
  // =========================================================================
  describe('Group 1: Deterministic Domain Preconditions & Evaluation Order', () => {
    it('1. Fails with "sender-not-found" when sender does not exist, with zero mutation', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      const stateBefore = structuredClone(state);

      const result = transferItemPossession(
        state,
        'agent:non-existent',
        DEV_NPC_ID,
        itemId,
        state.worldTime
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'sender-not-found');
      assert.deepStrictEqual(state, stateBefore);
    });

    it('2. Fails with "recipient-not-found" when recipient does not exist, with zero mutation', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      const stateBefore = structuredClone(state);

      const result = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        'agent:ghost-recipient',
        itemId,
        state.worldTime
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'recipient-not-found');
      assert.deepStrictEqual(state, stateBefore);
    });

    it('3. Fails with "cannot-transfer-to-self" when sender and recipient are identical, with zero mutation', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      const stateBefore = structuredClone(state);

      const result = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_PLAYER_ID,
        itemId,
        state.worldTime
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'cannot-transfer-to-self');
      assert.deepStrictEqual(state, stateBefore);
    });

    it('4. Fails with "agents-not-co-located" when agents are at different locations, with zero mutation', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      // Move NPC to street
      const npc = state.agents.find((a) => a.id === DEV_NPC_ID)!;
      npc.locationId = 'street:development-street';
      const stateBefore = structuredClone(state);

      const result = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        itemId,
        state.worldTime
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agents-not-co-located');
      assert.deepStrictEqual(state, stateBefore);
    });

    it('5. Fails with "agents-not-acquainted" when agents are not acquainted, with zero mutation', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      // Clear acquaintances
      state.acquaintances = [];
      const stateBefore = structuredClone(state);

      const result = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        itemId,
        state.worldTime
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agents-not-acquainted');
      assert.deepStrictEqual(state, stateBefore);
    });

    it('6. Fails with "item-not-found" when item does not exist, with zero mutation', () => {
      const { state } = setupWorldWithPurchasedPastry();
      const stateBefore = structuredClone(state);

      const result = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        'item:99999',
        state.worldTime
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'item-not-found');
      assert.deepStrictEqual(state, stateBefore);
    });

    it('7. Fails with "item-not-in-possession" when sender does not possess the item, with zero mutation', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      const item = state.items.find((i) => i.id === itemId)!;
      // Item is currently possessed by dev-player; dev-npc tries to transfer it
      const stateBefore = structuredClone(state);

      const result = transferItemPossession(
        state,
        DEV_NPC_ID,
        DEV_PLAYER_ID,
        itemId,
        state.worldTime
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'item-not-in-possession');
      assert.deepStrictEqual(state, stateBefore);
    });

    it('8. Fails with "item-already-consumed" when item is consumed, with zero mutation', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      const item = state.items.find((i) => i.id === itemId)!;
      item.status = 'consumed';
      item.consumedAt = state.worldTime;
      const stateBefore = structuredClone(state);

      const result = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        itemId,
        state.worldTime
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'item-already-consumed');
      assert.deepStrictEqual(state, stateBefore);
    });

    it('9. Fails with "invalid-timestamp" when timestamp is empty, invalid, future, or prior to acquiredAt', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      const stateBefore = structuredClone(state);

      // Non-ISO string
      const r1 = transferItemPossession(state, DEV_PLAYER_ID, DEV_NPC_ID, itemId, 'invalid-date');
      assert.strictEqual(r1.success, false);
      assert.strictEqual(r1.code, 'invalid-timestamp');

      // Future timestamp relative to state
      const r2 = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        itemId,
        '2099-01-01T00:00:00.000Z'
      );
      assert.strictEqual(r2.success, false);
      assert.strictEqual(r2.code, 'invalid-timestamp');

      // Earlier than item acquiredAt
      const r3 = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        itemId,
        '2020-01-01T00:00:00.000Z'
      );
      assert.strictEqual(r3.success, false);
      assert.strictEqual(r3.code, 'invalid-timestamp');

      assert.deepStrictEqual(state, stateBefore);
    });
  });

  // =========================================================================
  // Group 2: Authoritative Possession State Transition
  // =========================================================================
  describe('Group 2: Authoritative Possession State Transition', () => {
    it('successfully transfers possession from player to NPC', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      const item = state.items.find((i) => i.id === itemId)!;
      const originalPurchaseId = item.sourcePurchaseId;
      const originalAcquiredAt = item.acquiredAt;

      const result = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        itemId,
        state.worldTime
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.code, 'success');
      assert.strictEqual(result.fromAgentId, DEV_PLAYER_ID);
      assert.strictEqual(result.toAgentId, DEV_NPC_ID);
      assert.strictEqual(result.itemId, itemId);

      // Item mutated only in current custody
      assert.strictEqual(item.ownerAgentId, DEV_NPC_ID);
      assert.strictEqual(item.status, 'available');
      assert.strictEqual(item.sourcePurchaseId, originalPurchaseId);
      assert.strictEqual(item.acquiredAt, originalAcquiredAt);
    });

    it('idempotency: repeating identical handoff immediately fails because sender no longer possesses item', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();

      const firstResult = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        itemId,
        state.worldTime
      );
      assert.strictEqual(firstResult.success, true);

      const stateAfterFirst = structuredClone(state);

      // Second attempt by player
      const secondResult = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        itemId,
        state.worldTime
      );
      assert.strictEqual(secondResult.success, false);
      assert.strictEqual(secondResult.code, 'item-not-in-possession');
      assert.deepStrictEqual(state, stateAfterFirst);
    });

    it('supports handoff back from NPC to player when co-located and acquainted', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();

      // Hand off to NPC
      transferItemPossession(state, DEV_PLAYER_ID, DEV_NPC_ID, itemId, state.worldTime);
      assert.strictEqual(state.items.find((i) => i.id === itemId)!.ownerAgentId, DEV_NPC_ID);

      // Hand off back to Player
      const resultBack = transferItemPossession(
        state,
        DEV_NPC_ID,
        DEV_PLAYER_ID,
        itemId,
        state.worldTime
      );
      assert.strictEqual(resultBack.success, true);
      assert.strictEqual(resultBack.code, 'success');
      assert.strictEqual(state.items.find((i) => i.id === itemId)!.ownerAgentId, DEV_PLAYER_ID);
    });
  });

  // =========================================================================
  // Group 3: Projections and Visibility Semantics
  // =========================================================================
  describe('Group 3: Projections and Visibility Semantics', () => {
    it('removes transferred item from player available inventory projection', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();

      // Before handoff
      const itemsBefore = getPlayerAvailableItems(state, DEV_PLAYER_ID);
      assert.ok(itemsBefore.some((i) => i.id === itemId));

      // Handoff to NPC
      transferItemPossession(state, DEV_PLAYER_ID, DEV_NPC_ID, itemId, state.worldTime);

      // After handoff
      const itemsAfter = getPlayerAvailableItems(state, DEV_PLAYER_ID);
      assert.ok(!itemsAfter.some((i) => i.id === itemId));
    });

    it('exposes recipient possessions in inspectCurrentLocation', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();

      // Handoff to NPC
      transferItemPossession(state, DEV_PLAYER_ID, DEV_NPC_ID, itemId, state.worldTime);

      const inspection = inspectCurrentLocation(state, DEV_PLAYER_ID);
      assert.strictEqual(inspection.success, true);
      assert.ok(inspection.location);

      const npcObs = inspection.location!.agents.find((a) => a.id === DEV_NPC_ID);
      assert.ok(npcObs);
      assert.ok(Array.isArray(npcObs!.possessions));
      assert.ok(npcObs!.possessions!.includes('Pan Dulce'));
    });

    it('client presentation model generates giveItem affordance when co-located, acquainted, and holding items', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();

      const inspection = inspectCurrentLocation(state, DEV_PLAYER_ID);
      const playerInventory = getPlayerAvailableItems(state, DEV_PLAYER_ID);

      const presentation = createPresentationModel(
        {
          worldId: state.worldId,
          worldTime: state.worldTime,
          schemaVersion: state.schemaVersion,
          activePlayerId: DEV_PLAYER_ID,
        },
        {
          location: inspection.location,
          playerInventory,
        }
      );

      const giveAffordance = presentation.affordances.find(
        (a) => a.commandName === 'giveItem' && a.payload.targetAgentId === DEV_NPC_ID
      );
      assert.ok(giveAffordance);
      assert.strictEqual(giveAffordance!.label, 'Give Pan Dulce to Development NPC');
      assert.strictEqual(giveAffordance!.group, 'INTERACT');
      assert.strictEqual(giveAffordance!.payload.itemId, itemId);
    });

    it('findInspectableEntity includes Possessions for an agent possessing items', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();

      // Hand off to NPC
      transferItemPossession(state, DEV_PLAYER_ID, DEV_NPC_ID, itemId, state.worldTime);

      const inspection = inspectCurrentLocation(state, DEV_PLAYER_ID);
      const presentation = createPresentationModel(
        {
          worldId: state.worldId,
          worldTime: state.worldTime,
          schemaVersion: state.schemaVersion,
          activePlayerId: DEV_PLAYER_ID,
        },
        {
          location: inspection.location,
          playerInventory: [],
        }
      );

      const entity = findInspectableEntity(presentation, DEV_NPC_ID);
      assert.ok(entity);
      assert.strictEqual(entity!.kind, 'agent');
      assert.strictEqual(entity!.details['Possessions'], 'Pan Dulce');
    });

    it('getAffordanceGroup classifies giveItem as INTERACT', () => {
      assert.strictEqual(getAffordanceGroup('giveItem'), 'INTERACT');
    });
  });

  // =========================================================================
  // Group 4: Consumption Invariants & Former Possessor Behavior
  // =========================================================================
  describe('Group 4: Consumption Invariants & Former Possessor Behavior', () => {
    it('former possessor cannot consume transferred item via startEatingPastry (fails with purchase-required)', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();

      // Hand off to NPC
      transferItemPossession(state, DEV_PLAYER_ID, DEV_NPC_ID, itemId, state.worldTime);

      const stateBeforeConsume = structuredClone(state);

      // Player attempts to eat pastry
      const eatResult = startEatingPastry(state, DEV_PLAYER_ID);
      assert.strictEqual(eatResult.success, false);
      assert.strictEqual(eatResult.code, 'purchase-required');

      // State untouched
      assert.deepStrictEqual(state, stateBeforeConsume);
    });

    it('player can still consume retained items normally', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();

      // Purchase a SECOND pastry
      const p2 = purchaseOffering(
        state,
        DEV_PLAYER_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID,
        RESTAURANT_ID,
        { silent: true }
      );
      assert.strictEqual(p2.success, true);
      const secondItemId = p2.itemId!;

      // Hand off FIRST item to NPC
      transferItemPossession(state, DEV_PLAYER_ID, DEV_NPC_ID, itemId, state.worldTime);

      // Player consumes retained second item
      const eatResult = startEatingPastry(state, DEV_PLAYER_ID);
      assert.strictEqual(eatResult.success, true);
      assert.strictEqual(eatResult.code, 'success');

      const secondItem = state.items.find((i) => i.id === secondItemId)!;
      assert.strictEqual(secondItem.status, 'consumed');

      // Transferred item is still intact and available in NPC custody
      const transferredItem = state.items.find((i) => i.id === itemId)!;
      assert.strictEqual(transferredItem.status, 'available');
      assert.strictEqual(transferredItem.ownerAgentId, DEV_NPC_ID);
    });
  });

  // =========================================================================
  // Group 5: Persistence Roundtrip & Reload Reconciliation
  // =========================================================================
  describe('Group 5: Persistence Roundtrip & Reload Reconciliation', () => {
    let tempDir: string;

    it('persists transferred item and restores cleanly with schema version 16 preserving NPC custody', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'm50-handoff-test-'));
      const testFile = join(tempDir, 'world-state.json');
      const persistence = new LocalFilePersistence(testFile);

      const { state, itemId } = setupWorldWithPurchasedPastry();

      // Transfer possession to NPC
      const handoffResult = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        itemId,
        state.worldTime
      );
      assert.strictEqual(handoffResult.success, true);

      // Persist state
      persistence.save(state);

      // Reload state
      const reloadedState = persistence.load();
      assert.ok(reloadedState);
      assert.strictEqual(reloadedState!.version, CURRENT_WORLD_STATE_VERSION);
      assert.strictEqual(reloadedState!.version, 19);

      // Validate reloaded state
      assert.doesNotThrow(() => validateWorldState(reloadedState!));
      assert.doesNotThrow(() => validateItemAuthority(reloadedState!));

      // Verify custody preserved on disk
      const reloadedItem = reloadedState!.items.find((i) => i.id === itemId);
      assert.ok(reloadedItem);
      assert.strictEqual(reloadedItem!.ownerAgentId, DEV_NPC_ID);
      assert.strictEqual(reloadedItem!.status, 'available');

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  // =========================================================================
  // Group 6: Authority Invariant Enforcement & Provenance Integrity
  // =========================================================================
  describe('Group 6: Authority Invariant Enforcement & Provenance Integrity', () => {
    it('validateItemAuthority and validateWorldState validate state where NPC possesses item', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      transferItemPossession(state, DEV_PLAYER_ID, DEV_NPC_ID, itemId, state.worldTime);

      assert.doesNotThrow(() => validateItemAuthority(state));
      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('original purchase provenance remains valid after divergence of sourcePurchase.playerId and item.ownerAgentId', () => {
      const { state, itemId } = setupWorldWithPurchasedPastry();
      const item = state.items.find((i) => i.id === itemId)!;
      const originalPurchase = state.purchases.find((p) => p.id === item.sourcePurchaseId)!;
      assert.strictEqual(originalPurchase.playerId, DEV_PLAYER_ID);

      // Transfer possession to NPC
      transferItemPossession(state, DEV_PLAYER_ID, DEV_NPC_ID, itemId, state.worldTime);

      // Current possessor is NPC, but purchase record is permanently player
      assert.strictEqual(item.ownerAgentId, DEV_NPC_ID);
      assert.strictEqual(originalPurchase.playerId, DEV_PLAYER_ID);
      assert.notStrictEqual(item.ownerAgentId, originalPurchase.playerId);

      // Both authorities validate successfully
      assert.doesNotThrow(() => validateItemAuthority(state));
      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('order-fulfilled item handoff preserves order customer provenance', () => {
      const { clock, state } = setupWorldWithPurchasedPastry();

      // Place, progress, and collect an order for coffee
      const placeResult = placeOrder(state as any, {
        customerId: DEV_PLAYER_ID,
        restaurantId: RESTAURANT_ID,
        lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.strictEqual(placeResult.success, true);
      const orderId = placeResult.order!.id;

      // Tick simulation to ready
      const readyTime = '2026-09-23T10:15:00.000Z';
      tickOrderPreparation(state as any, readyTime);
      state.worldTime = readyTime;

      // Collect order -> generates OwnedItem for customer
      const collectResult = collectOrder(state as any, DEV_PLAYER_ID, orderId);
      assert.strictEqual(collectResult.success, true);
      assert.ok(collectResult.items && collectResult.items.length > 0);
      const orderItemId = collectResult.items![0].id;

      // Validate before handoff
      assert.doesNotThrow(() => validateOrderAuthority(state as any));
      assert.doesNotThrow(() => validateWorldState(state));

      // Hand off order-created coffee item to NPC
      const handoffResult = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        orderItemId,
        state.worldTime
      );
      assert.strictEqual(handoffResult.success, true);

      // Order customerId remains player, while item.ownerAgentId is NPC
      const order = (state as any).orders.find((o: any) => o.id === orderId);
      assert.strictEqual(order.customerId, DEV_PLAYER_ID);
      const coffeeItem = state.items.find((i) => i.id === orderItemId)!;
      assert.strictEqual(coffeeItem.ownerAgentId, DEV_NPC_ID);

      // Invariants remain satisfied
      assert.doesNotThrow(() => validateOrderAuthority(state as any));
      assert.doesNotThrow(() => validateItemAuthority(state));
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // Group 7: Server Command Dispatch & HTTP Flow
  // =========================================================================
  describe('Group 7: Server Command Dispatch & HTTP Flow', () => {
    let tempDir: string;
    let controller: WorldSessionController;

    it('SessionController dispatches giveItem command and persists state change', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'm50-session-test-'));
      const testFile = join(tempDir, 'world-state.json');

      controller = new WorldSessionController({
        persistencePath: testFile,
        silent: true,
      });

      // Prepare state inside controller: open restaurant, introduce agents, make offering, purchase pastry
      const rawState = (controller as any).state as WorldState;
      const rest = rawState.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'open';
      const npc = rawState.agents.find((a) => a.id === DEV_NPC_ID)!;
      npc.locationId = RESTAURANT_ID;
      npc.activityState = 'active';
      const player = rawState.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.locationId = RESTAURANT_ID;
      introduceToAgent(rawState, DEV_PLAYER_ID, DEV_NPC_ID);
      makeDevelopmentOfferingAvailable(rawState, DEV_NPC_ID, RESTAURANT_ID);

      const pResult = purchaseOffering(
        rawState,
        DEV_PLAYER_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID,
        RESTAURANT_ID,
        { silent: true }
      );
      assert.strictEqual(pResult.success, true);
      const itemId = pResult.itemId!;
      (controller as any).persistence.save(rawState);

      // Dispatch giveItem command
      const dispatchResult = await controller.dispatchCommand('giveItem', {
        targetAgentId: DEV_NPC_ID,
        itemId,
      });

      assert.strictEqual(dispatchResult.success, true);
      assert.strictEqual(dispatchResult.committed, true);

      // Verify item custody in controller's active state
      const updatedState = (controller as any).state as WorldState;
      const handedItem = updatedState.items.find((i) => i.id === itemId)!;
      assert.strictEqual(handedItem.ownerAgentId, DEV_NPC_ID);

      // Verify persisted state on disk has NPC custody
      const persistence = new LocalFilePersistence(testFile);
      const loaded = persistence.load();
      assert.ok(loaded);
      assert.strictEqual(loaded!.items.find((i) => i.id === itemId)!.ownerAgentId, DEV_NPC_ID);

      await controller.shutdown();
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('HTTP /command endpoint executes giveItem with 200 on success and 422 on precondition violation', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'm50-http-test-'));
      const testFile = join(tempDir, 'world-state.json');

      controller = new WorldSessionController({
        persistencePath: testFile,
        silent: true,
      });

      const rawState = (controller as any).state as WorldState;
      const rest = rawState.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'open';
      const npc = rawState.agents.find((a) => a.id === DEV_NPC_ID)!;
      npc.locationId = RESTAURANT_ID;
      npc.activityState = 'active';
      const player = rawState.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.locationId = RESTAURANT_ID;
      introduceToAgent(rawState, DEV_PLAYER_ID, DEV_NPC_ID);
      makeDevelopmentOfferingAvailable(rawState, DEV_NPC_ID, RESTAURANT_ID);

      const pResult = purchaseOffering(
        rawState,
        DEV_PLAYER_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID,
        RESTAURANT_ID,
        { silent: true }
      );
      assert.strictEqual(pResult.success, true);
      const itemId = pResult.itemId!;
      (controller as any).persistence.save(rawState);

      const worldServer = createWorldServer({ controller, silent: true });
      const info = await worldServer.start(0, '127.0.0.1');
      const baseUrl = info.url;

      // 1. Successful handoff via HTTP POST
      const resSuccess = await fetch(`${baseUrl}/api/commands/giveItem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAgentId: DEV_NPC_ID,
          itemId,
        }),
      });
      assert.strictEqual(resSuccess.status, 200);
      const jsonSuccess = (await resSuccess.json()) as any;
      assert.strictEqual(jsonSuccess.success, true);
      assert.strictEqual(jsonSuccess.result.code, 'success');

      // 2. Negative test: repeat handoff via HTTP POST fails with 422
      const resRepeat = await fetch(`${baseUrl}/api/commands/giveItem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAgentId: DEV_NPC_ID,
          itemId,
        }),
      });
      assert.strictEqual(resRepeat.status, 422);
      const jsonRepeat = (await resRepeat.json()) as any;
      assert.strictEqual(jsonRepeat.success, false);
      assert.strictEqual(jsonRepeat.error.code, 'item-not-in-possession');

      await worldServer.stop();
      await controller.shutdown();
      rmSync(tempDir, { recursive: true, force: true });
    });
  });
});
