import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';

import { WorldClock } from '../src/core/clock.js';
import { MockRealTimeSource } from '../src/server/time-source.js';
import { WorldSessionController, TransactionContext } from '../src/server/session-controller.js';
import { createInitialWorldState, CURRENT_WORLD_STATE_VERSION, WorldState } from '../src/core/world-state.js';
import { placeOrder, ORDER_PREPARATION_DURATION_MS } from '../src/core/order.js';

describe('Phase B: Transaction Temporal Context Invariants', () => {
  let tempFilePath: string;

  beforeEach(() => {
    tempFilePath = join(
      tmpdir(),
      `tx-context-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );
  });

  afterEach(() => {
    if (existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // Ignore test cleanup errors
      }
    }
  });

  // =========================================================================
  // Test A: Execution Instant Capture
  // =========================================================================
  describe('Test A — Execution Instant Capture', () => {
    test('authoritative command captures exact execution instant and stamps persisted records without stale checkpoints', async () => {
      const t0 = '2026-09-24T16:00:00.000Z';
      const clock = WorldClock.create(t0);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const mockSource = new MockRealTimeSource(Date.parse(t0));
      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        timeSource: mockSource,
        silent: true,
      });

      // Player enters restaurant
      const enterRes = await controller.dispatchCommand('enterRestaurant', {
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(enterRes.success, true);

      // Advance external physical time to an arbitrary sub-second instant between heartbeats
      const executionInstantIso = '2026-09-24T16:00:01.347Z';
      const executionInstantEpoch = Date.parse(executionInstantIso);
      mockSource.setTime(executionInstantEpoch);

      // Dispatch purchaseOffering without any intervening heartbeat or manual reconciliation
      const purchaseRes = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(purchaseRes.success, true);
      assert.strictEqual(purchaseRes.committed, true);

      // Authoritative status must reflect the exact execution instant
      assert.strictEqual(controller.getStatus().worldTime, executionInstantIso);

      // Persisted state must record the exact execution instant, not a stale checkpoint
      const persisted: WorldState = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      assert.strictEqual(persisted.worldTime, executionInstantIso);

      const latestPurchase = persisted.purchases[persisted.purchases.length - 1];
      assert.ok(latestPurchase !== undefined);
      assert.strictEqual(latestPurchase.worldTime, executionInstantIso);

      const latestItem = persisted.items[persisted.items.length - 1];
      assert.ok(latestItem !== undefined);
      assert.strictEqual(latestItem.acquiredAt, executionInstantIso);

      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test B: Candidate State Temporal Stamping
  // =========================================================================
  describe('Test B — Candidate State Temporal Stamping', () => {
    test('candidate state receives authoritative execution instant and all domain timestamps derive from that value', async () => {
      const t0 = '2026-09-24T16:00:00.000Z';
      const clock = WorldClock.create(t0);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const mockSource = new MockRealTimeSource(Date.parse(t0));
      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        timeSource: mockSource,
        silent: true,
      });

      await controller.dispatchCommand('enterRestaurant', {
        restaurantId: 'restaurant:development-restaurant',
      });

      // Jump to a precise execution instant
      const executionInstantIso = '2026-09-24T16:00:02.825Z';
      const executionInstantEpoch = Date.parse(executionInstantIso);
      mockSource.setTime(executionInstantEpoch);

      // Dispatch placeOrder: creates both PurchaseRecord and Order entities
      const orderRes = await controller.dispatchCommand('placeOrder', {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });
      assert.strictEqual(orderRes.success, true);
      assert.strictEqual(orderRes.committed, true);

      // Inspect persisted entities to verify all derived timestamps originate from candidateState.worldTime
      const persisted: WorldState = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      assert.strictEqual(persisted.worldTime, executionInstantIso);

      const order = persisted.orders.find((o) => o.restaurantId === 'restaurant:development-restaurant');
      assert.ok(order !== undefined);
      assert.strictEqual(order.createdAt, executionInstantIso);

      const expectedReadyAt = new Date(executionInstantEpoch + ORDER_PREPARATION_DURATION_MS).toISOString();
      assert.strictEqual(order.readyAt, expectedReadyAt);

      const purchase = persisted.purchases.find((p) => p.id === order.purchaseIds[0]);
      assert.ok(purchase !== undefined);
      assert.strictEqual(purchase.worldTime, executionInstantIso);

      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test C: No Secondary Clock Access in Domain Operations
  // =========================================================================
  describe('Test C — No Secondary Clock Access', () => {
    test('domain operations derive temporal truth strictly from passed state.worldTime independent of physical OS clock', () => {
      // Create a fixture state with a future/synthetic logical worldTime within restaurant opening hours (10:30 local = 16:30 UTC)
      const fixtureWorldTime = '2035-05-15T16:30:00.000Z';
      const fixtureEpoch = Date.parse(fixtureWorldTime);
      const clock = WorldClock.create(fixtureWorldTime);
      const state = createInitialWorldState(clock);

      // Move player into restaurant
      const player = state.agents.find((a) => a.id === 'agent:dev-player');
      assert.ok(player !== undefined);
      player.locationId = 'restaurant:development-restaurant';

      // Call placeOrder directly on domain function without any server or clock context
      const orderResult = placeOrder(state as any, {
        customerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        fulfillmentMode: 'pickup',
      });

      assert.strictEqual(orderResult.success, true);

      // Verify domain logic uses state.worldTime and is completely decoupled from system Date.now()
      const createdOrder = state.orders[state.orders.length - 1];
      assert.strictEqual(createdOrder.createdAt, fixtureWorldTime);
      assert.strictEqual(
        createdOrder.readyAt,
        new Date(fixtureEpoch + ORDER_PREPARATION_DURATION_MS).toISOString()
      );

      const createdPurchase = state.purchases[state.purchases.length - 1];
      assert.strictEqual(createdPurchase.worldTime, fixtureWorldTime);
    });

    test('TransactionContext interface preserves the minimal contract { worldTime, epochMs }', () => {
      const sampleContext: TransactionContext = {
        worldTime: '2026-09-24T10:00:00.000Z',
        epochMs: 1790244000000,
      };

      assert.strictEqual(typeof sampleContext.worldTime, 'string');
      assert.strictEqual(typeof sampleContext.epochMs, 'number');

      // Verify no extra fields are required or expected
      const keys = Object.keys(sampleContext).sort();
      assert.deepStrictEqual(keys, ['epochMs', 'worldTime']);
    });
  });

  // =========================================================================
  // Test D: Failure Isolation
  // =========================================================================
  describe('Test D — Failure Isolation', () => {
    test('validation failure commits zero mutations, leaks no transaction metadata, and preserves schema version', async () => {
      const t0 = '2026-09-24T16:00:00.000Z';
      const clock = WorldClock.create(t0);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const mockSource = new MockRealTimeSource(Date.parse(t0));
      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        timeSource: mockSource,
        silent: true,
      });

      // Player enters restaurant
      await controller.dispatchCommand('enterRestaurant', {
        restaurantId: 'restaurant:development-restaurant',
      });

      const initialPurchasesCount = controller.getHistoryView().history?.purchases.length ?? 0;

      // Advance time and attempt an invalid command (offering does not exist)
      mockSource.setTime(Date.parse('2026-09-24T16:05:00.000Z'));
      const failRes = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:non-existent-item',
        restaurantId: 'restaurant:development-restaurant',
      });

      assert.strictEqual(failRes.success, false);
      assert.strictEqual(failRes.committed, false);
      assert.strictEqual(failRes.error?.code, 'offering-not-found');

      // In-memory state remains untouched
      const currentPurchasesCount = controller.getHistoryView().history?.purchases.length ?? 0;
      assert.strictEqual(currentPurchasesCount, initialPurchasesCount);

      // Persisted disk state has zero partial writes or leaked transaction metadata
      const persistedRaw = readFileSync(tempFilePath, 'utf-8');
      const persistedState: WorldState = JSON.parse(persistedRaw);

      assert.strictEqual(persistedState.version, CURRENT_WORLD_STATE_VERSION);
      assert.strictEqual(persistedState.version, 19);
      assert.strictEqual(persistedState.purchases.length, initialPurchasesCount);

      // Confirm no transaction metadata leaked into persisted WorldState object
      assert.strictEqual((persistedState as any).transactionContext, undefined);
      assert.strictEqual((persistedState as any).transactionId, undefined);

      await controller.shutdown();
    });
  });
});
