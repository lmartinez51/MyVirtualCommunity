import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';

import { WorldClock } from '../src/core/clock.js';
import { RealTimeSource, SystemRealTimeSource, MockRealTimeSource } from '../src/server/time-source.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { TemporalRuntimeAuthority } from '../src/server/temporal-runtime-authority.js';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { createInitialWorldState, CURRENT_WORLD_STATE_VERSION } from '../src/core/world-state.js';

describe('Phase A: Temporal Authority, Real-Time Alignment & Restart Reconciliation', () => {
  let tempFilePath: string;

  beforeEach(() => {
    tempFilePath = join(
      tmpdir(),
      `temporal-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
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
  // Test 1: Real-Time Source Abstraction
  // =========================================================================
  describe('Test 1: Real-Time Source Abstraction', () => {
    test('MockRealTimeSource provides deterministic epoch time control', () => {
      const initialEpoch = Date.parse('2026-09-24T10:00:00.000Z');
      const mockSource = new MockRealTimeSource(initialEpoch);

      assert.strictEqual(mockSource.now(), initialEpoch);

      // Advance by positive duration
      mockSource.advance(5000);
      assert.strictEqual(mockSource.now(), initialEpoch + 5000);

      // Advance by zero
      mockSource.advance(0);
      assert.strictEqual(mockSource.now(), initialEpoch + 5000);

      // Set explicit time
      const targetEpoch = Date.parse('2026-09-24T12:00:00.000Z');
      mockSource.setTime(targetEpoch);
      assert.strictEqual(mockSource.now(), targetEpoch);

      // Reject negative advance
      assert.throws(() => mockSource.advance(-100), RangeError);

      // Reject non-finite values
      assert.throws(() => mockSource.advance(NaN), RangeError);
      assert.throws(() => mockSource.setTime(Infinity), RangeError);
    });

    test('SystemRealTimeSource encapsulates physical clock and returns finite epoch milliseconds', () => {
      const systemSource = new SystemRealTimeSource();
      const before = Date.now();
      const reading = systemSource.now();
      const after = Date.now();

      assert.strictEqual(typeof reading, 'number');
      assert.strictEqual(Number.isFinite(reading), true);
      assert.ok(reading >= before && reading <= after);
    });
  });

  // =========================================================================
  // Test 2: Forward Temporal Reconciliation
  // =========================================================================
  describe('Test 2: Forward Reconciliation (T1 -> T2 where T2 > T1)', () => {
    test('reconciles World Time forward to observed real instant and updates state atomically', async () => {
      const t1 = '2026-09-24T10:00:00.000Z';
      const t2 = '2026-09-24T10:05:00.000Z';
      const t2Epoch = Date.parse(t2);

      // Write initial state at T1
      const clock = WorldClock.create(t1);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });

      assert.strictEqual(controller.getStatus().worldTime, t1);

      const result = await controller.reconcileWorldTime(t2Epoch);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.committed, true);
      assert.strictEqual(result.previousTime, t1);
      assert.strictEqual(result.currentTime, t2);
      assert.strictEqual(result.interval.durationMs, 5 * 60 * 1000);
      assert.strictEqual(result.interval.startIso, t1);
      assert.strictEqual(result.interval.endIso, t2);

      // In-memory clock and state updated
      assert.strictEqual(controller.getStatus().worldTime, t2);

      // Checkpoint persisted to disk atomically
      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      assert.strictEqual(persisted.worldTime, t2);

      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test 3: Equal Temporal Reconciliation
  // =========================================================================
  describe('Test 3: Equal Reconciliation (T1 -> T1)', () => {
    test('no regression, no state mutation, and no unnecessary disk write when target equals current', async () => {
      const t1 = '2026-09-24T10:00:00.000Z';
      const t1Epoch = Date.parse(t1);

      const clock = WorldClock.create(t1);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });

      const result = await controller.reconcileWorldTime(t1Epoch);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.committed, false);
      assert.strictEqual(result.previousTime, t1);
      assert.strictEqual(result.currentTime, t1);
      assert.strictEqual(result.interval.durationMs, 0);
      assert.strictEqual(controller.getStatus().worldTime, t1);

      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test 4: Clock Rollback Detection & Monotonicity Guard
  // =========================================================================
  describe('Test 4: Clock Rollback Detection & Monotonicity Guard (T2 -> T1 where T1 < T2)', () => {
    test('rejects backward target instant and preserves World Time monotonicity in controller', async () => {
      const t2 = '2026-09-24T10:05:00.000Z';
      const t1 = '2026-09-24T10:00:00.000Z';
      const t1Epoch = Date.parse(t1);

      const clock = WorldClock.create(t2);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });

      assert.strictEqual(controller.getStatus().worldTime, t2);

      const result = await controller.reconcileWorldTime(t1Epoch);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.committed, false);
      assert.strictEqual(result.error?.code, 'clock-rollback-detected');
      assert.strictEqual(controller.getStatus().worldTime, t2); // Monotonicity preserved!

      await controller.shutdown();
    });

    test('TemporalRuntimeAuthority detects rollback, increments count, holds time, and resumes on catch-up', async () => {
      const t2 = '2026-09-24T10:05:00.000Z';
      const t2Epoch = Date.parse(t2);
      const t1 = '2026-09-24T10:00:00.000Z';
      const t1Epoch = Date.parse(t1);

      const clock = WorldClock.create(t2);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });

      const mockSource = new MockRealTimeSource(t1Epoch); // Real time is earlier than World Time (rollback!)
      const authority = new TemporalRuntimeAuthority({
        controller,
        timeSource: mockSource,
        cadenceMs: 1000,
        silent: true,
      });

      await authority.start();

      // Startup detected rollback
      const statusOnStart = authority.getStatus();
      assert.strictEqual(statusOnStart.rollbackDetected, true);
      assert.strictEqual(statusOnStart.rollbackCount, 1);
      assert.strictEqual(controller.getStatus().worldTime, t2); // World Time held

      // Periodic pulse while still in rollback
      const pulseResult = await authority.pulse();
      assert.strictEqual(pulseResult, null);
      assert.strictEqual(authority.getStatus().rollbackDetected, true);
      assert.strictEqual(controller.getStatus().worldTime, t2);

      // Real time catches up and advances past World Time
      const t3 = '2026-09-24T10:10:00.000Z';
      mockSource.setTime(Date.parse(t3));

      const resumePulse = await authority.pulse();
      assert.ok(resumePulse !== null);
      assert.strictEqual(resumePulse.success, true);
      assert.strictEqual(resumePulse.currentTime, t3);
      assert.strictEqual(authority.getStatus().rollbackDetected, false);
      assert.strictEqual(controller.getStatus().worldTime, t3);

      await authority.stop();
      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test 5: Startup Downtime Reconciliation
  // =========================================================================
  describe('Test 5: Startup Downtime Reconciliation (persisted T1, real T2)', () => {
    test('reconciles downtime gap at startup and commits reconciled time to disk before traffic begins', async () => {
      const persistedTime = '2026-09-24T08:00:00.000Z';
      const realStartupTime = '2026-09-24T14:30:00.000Z';
      const realStartupEpoch = Date.parse(realStartupTime);

      // Create persisted checkpoint from hours ago
      const clock = WorldClock.create(persistedTime);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      // Initialize server with real-time driver and mock source
      const mockSource = new MockRealTimeSource(realStartupEpoch);
      const server = createWorldServer({
        controllerOptions: { persistencePath: tempFilePath, silent: true },
        timeSource: mockSource,
        enableRealTimeDriver: true,
        silent: true,
      });

      // Start server on ephemeral port (triggers startup downtime reconciliation)
      const serverInfo = await server.start(0, '127.0.0.1');

      // Controller is reconciled to real startup time
      assert.strictEqual(server.getController().getStatus().worldTime, realStartupTime);

      // Checkpoint on disk is reconciled to real startup time
      const persistedAfterStart = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      assert.strictEqual(persistedAfterStart.worldTime, realStartupTime);

      // API status reports reconciled time
      const res = await fetch(`${serverInfo.url}/api/status`);
      const data = (await res.json()) as { success: boolean; result: { worldTime: string } };
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.result.worldTime, realStartupTime);

      await server.stop();
    });
  });

  // =========================================================================
  // Test 6: Timer Drift & Irregular Observation Intervals
  // =========================================================================
  describe('Test 6: Timer Drift Compensation', () => {
    test('tracks irregular real-world elapsed intervals (1000ms, 1375ms, 820ms, 2410ms) rather than rigid cadence', async () => {
      const t0 = '2026-09-24T10:00:00.000Z';
      const t0Epoch = Date.parse(t0);

      const clock = WorldClock.create(t0);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });

      const mockSource = new MockRealTimeSource(t0Epoch);
      const authority = new TemporalRuntimeAuthority({
        controller,
        timeSource: mockSource,
        cadenceMs: 1000,
        silent: true,
      });

      await authority.start();
      assert.strictEqual(controller.getStatus().worldTime, t0);

      // Pulse 1: +1000ms
      mockSource.advance(1000);
      const r1 = await authority.pulse();
      assert.ok(r1 !== null);
      assert.strictEqual(r1.currentTime, '2026-09-24T10:00:01.000Z');
      assert.strictEqual(r1.interval.durationMs, 1000);

      // Pulse 2: +1375ms (delayed execution due to event loop delay)
      mockSource.advance(1375);
      const r2 = await authority.pulse();
      assert.ok(r2 !== null);
      assert.strictEqual(r2.currentTime, '2026-09-24T10:00:02.375Z');
      assert.strictEqual(r2.interval.durationMs, 1375);

      // Pulse 3: +820ms (timer fire slightly early)
      mockSource.advance(820);
      const r3 = await authority.pulse();
      assert.ok(r3 !== null);
      assert.strictEqual(r3.currentTime, '2026-09-24T10:00:03.195Z');
      assert.strictEqual(r3.interval.durationMs, 820);

      // Pulse 4: +2410ms (GC pause / system lag)
      mockSource.advance(2410);
      const r4 = await authority.pulse();
      assert.ok(r4 !== null);
      assert.strictEqual(r4.currentTime, '2026-09-24T10:00:05.605Z');
      assert.strictEqual(r4.interval.durationMs, 2410);

      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T10:00:05.605Z');

      await authority.stop();
      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test 7: Machine Sleep / Suspension Gap Reconciliation
  // =========================================================================
  describe('Test 7: Machine Sleep / Suspension Gap Reconciliation', () => {
    test('reconciles multi-hour suspension in a single clean reconciliation without tick loops', async () => {
      const t0 = '2026-09-24T10:00:00.000Z';
      const t0Epoch = Date.parse(t0);

      const clock = WorldClock.create(t0);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });

      const mockSource = new MockRealTimeSource(t0Epoch);
      const authority = new TemporalRuntimeAuthority({
        controller,
        timeSource: mockSource,
        cadenceMs: 1000,
        silent: true,
      });

      await authority.start();

      // Simulate 4-hour machine sleep: jump physical clock by 14,400,000ms
      const sleepDurationMs = 4 * 60 * 60 * 1000;
      mockSource.advance(sleepDurationMs);

      const result = await authority.pulse();

      assert.ok(result !== null);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.previousTime, t0);
      assert.strictEqual(result.currentTime, '2026-09-24T14:00:00.000Z');
      assert.strictEqual(result.interval.durationMs, sleepDurationMs);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T14:00:00.000Z');

      await authority.stop();
      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test 8: Command Temporal Snapshot Captured at Authoritative Execution Time
  // =========================================================================
  describe('Test 8: Command Temporal Snapshot', () => {
    test('queued command captures World Time when execution begins, not at initial dispatch call time', async () => {
      const t1 = '2026-09-24T16:00:00.000Z';
      const t2 = '2026-09-24T16:15:00.000Z';
      const t2Epoch = Date.parse(t2);

      const clock = WorldClock.create(t1);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });

      // Player is at building:development-building; first enter restaurant
      await controller.dispatchCommand('enterRestaurant', {
        restaurantId: 'restaurant:development-restaurant',
      });

      // Now enqueue a temporal reconciliation to T2, immediately followed by purchaseOffering command
      const reconPromise = controller.reconcileWorldTime(t2Epoch);
      const purchasePromise = controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      });

      const [reconResult, purchaseResult] = await Promise.all([reconPromise, purchasePromise]);

      assert.strictEqual(reconResult.success, true);
      assert.strictEqual(reconResult.currentTime, t2);

      assert.strictEqual(purchaseResult.success, true);
      assert.strictEqual(purchaseResult.committed, true);

      // Verify purchase record was stamped with T2 (when execution occurred), NOT T1!
      const historyResult = controller.getHistoryView();
      assert.strictEqual(historyResult.success, true);
      const purchaseRecord = historyResult.history!.purchases[historyResult.history!.purchases.length - 1];
      assert.ok(purchaseRecord !== undefined);
      assert.strictEqual(purchaseRecord.worldTime, t2);

      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      const persistedRecord = persisted.purchases[persisted.purchases.length - 1];
      assert.strictEqual(persistedRecord.worldTime, t2);

      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test 9: Client Timestamp Irrelevance
  // =========================================================================
  describe('Test 9: Client Timestamp Irrelevance', () => {
    test('ignores client-supplied timestamps and uses authoritative TransactionContext', async () => {
      const t1 = '2026-09-24T16:00:00.000Z';

      const clock = WorldClock.create(t1);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });

      await controller.dispatchCommand('enterRestaurant', {
        restaurantId: 'restaurant:development-restaurant',
      });

      // Client passes spoofed clientTimestamp and forged worldTime in payload
      const dispatchResult = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
        clientTimestamp: 1000,
        worldTime: '1970-01-01T00:00:00.000Z',
      });

      assert.strictEqual(dispatchResult.success, true);
      assert.strictEqual(dispatchResult.committed, true);

      // The resulting purchase record has authoritative server time T1, NOT client forged time
      const historyResult = controller.getHistoryView();
      assert.strictEqual(historyResult.success, true);
      const purchaseRecord = historyResult.history!.purchases[historyResult.history!.purchases.length - 1];
      assert.strictEqual(purchaseRecord.worldTime, t1);
      assert.notStrictEqual(purchaseRecord.worldTime, '1970-01-01T00:00:00.000Z');

      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      const persistedRecord = persisted.purchases[persisted.purchases.length - 1];
      assert.strictEqual(persistedRecord.worldTime, t1);

      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test 10: Deterministic Coexistence with Existing Test Architecture
  // =========================================================================
  describe('Test 10: Deterministic Coexistence with Existing Test Architecture', () => {
    test('default WorldSessionController creates no background timers and maintains hermetic test control', async () => {
      const t1 = '2026-09-24T10:00:00.000Z';
      const clock = WorldClock.create(t1);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        silent: true,
      });

      // World Time does not advance automatically
      assert.strictEqual(controller.getStatus().worldTime, t1);

      // stepSimulation explicitly advances logical world time by exactly requested duration
      const stepResult = await controller.stepSimulation(60000);
      assert.strictEqual(stepResult.success, true);
      assert.strictEqual(stepResult.result?.currentTime, '2026-09-24T10:01:00.000Z');
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T10:01:00.000Z');

      await controller.shutdown();
    });
  });

  // =========================================================================
  // Section 13 Boundary: Restaurant Service Closure Boundary Test
  // =========================================================================
  describe('Section 13 Boundary Test: Restaurant Service Boundary Condition', () => {
    test('intent formulated before 16:45:00 is rejected when authoritative execution occurs at 16:45:00.030 without pre-enqueued pulse', async () => {
      // Restaurant service boundary: 16:45:00 local (22:45:00.000Z)
      // Client intent formulated:    16:44:59.950 local (22:44:59.950Z)
      // Server authoritative exec:   16:45:00.030 local (22:45:00.030Z)
      const initialTime = '2026-09-24T22:44:50.000Z';
      const executionTime = '2026-09-24T22:45:00.030Z';
      const executionEpoch = Date.parse(executionTime);

      const clock = WorldClock.create(initialTime);
      const state = createInitialWorldState(clock);
      writeFileSync(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');

      const mockSource = new MockRealTimeSource(Date.parse(initialTime));
      const controller = new WorldSessionController({
        persistencePath: tempFilePath,
        timeSource: mockSource,
        silent: true,
      });

      // Setup: player enters restaurant while open (16:44:50 local)
      const enterRes = await controller.dispatchCommand('enterRestaurant', {
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(enterRes.success, true);

      // Verify restaurant was open at initial entry
      const persistedInitial = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      assert.strictEqual(
        persistedInitial.restaurants.find((r: { id: string }) => r.id === 'restaurant:development-restaurant')?.operationalState,
        'open'
      );

      // Advance external physical time to 16:45:00.030 local (22:45:00.030Z)
      // NOTE: Heartbeat has NOT yet executed! No reconcileWorldTime() was called!
      mockSource.setTime(executionEpoch);

      // Client prepares order intent with client-side timestamp 16:44:59.950 local
      const clientOrderPayload = {
        restaurantId: 'restaurant:development-restaurant',
        lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
        fulfillmentMode: 'pickup',
        clientIntentTimestamp: '2026-09-24T22:44:59.950Z',
      };

      // Dispatched command automatically executes execution-boundary alignment before evaluating domain logic
      const orderResult = await controller.dispatchCommand('placeOrder', clientOrderPayload);

      // Execution-boundary alignment brought World Time to 16:45:00.030Z
      assert.strictEqual(controller.getStatus().worldTime, executionTime);

      // Restaurant operational state is now closing-soon in persisted state
      const persistedRecon = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      assert.strictEqual(
        persistedRecon.restaurants.find((r: { id: string }) => r.id === 'restaurant:development-restaurant')?.operationalState,
        'closing-soon'
      );

      // Authoritative order execution fails because at T = 16:45:00.030Z, the restaurant is closing-soon!
      assert.strictEqual(orderResult.success, false);
      assert.strictEqual(orderResult.committed, false);
      assert.strictEqual(orderResult.error?.code, 'restaurant-closing-soon');

      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test 12: Multiple Commands Between Heartbeats
  // =========================================================================
  describe('Test 12: Multiple Commands Between Heartbeats (Execution-Boundary Real-Time Tracking)', () => {
    test('consecutive commands track real-world instants rather than sharing stale heartbeat checkpoint', async () => {
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

      // No heartbeat runs between 16:00:00.000 and 16:00:01.000.
      // Command A begins at real 16:00:00.200
      mockSource.setTime(Date.parse('2026-09-24T16:00:00.200Z'));
      const resA = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(resA.success, true);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:00.200Z');

      // Command B begins at real 16:00:00.600
      mockSource.setTime(Date.parse('2026-09-24T16:00:00.600Z'));
      const resB = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(resB.success, true);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:00.600Z');

      // Command C begins at real 16:00:00.900
      mockSource.setTime(Date.parse('2026-09-24T16:00:00.900Z'));
      const resC = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(resC.success, true);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:00.900Z');

      // Verify each purchase record was stamped with its distinct real-world execution timestamp
      const history = controller.getHistoryView();
      const purchases = history.history!.purchases;
      assert.strictEqual(purchases.length, 3);
      assert.strictEqual(purchases[0].worldTime, '2026-09-24T16:00:00.200Z');
      assert.strictEqual(purchases[1].worldTime, '2026-09-24T16:00:00.600Z');
      assert.strictEqual(purchases[2].worldTime, '2026-09-24T16:00:00.900Z');

      await controller.shutdown();
    });
  });

  // =========================================================================
  // Test 13: Temporal Pulse vs Command Race Tests
  // =========================================================================
  describe('Test 13: Temporal Pulse vs Command Race Tests', () => {
    test('pulse -> command, command -> pulse, and interleaved sequences preserve strict FIFO and monotonicity', async () => {
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

      const authority = new TemporalRuntimeAuthority({
        controller,
        timeSource: mockSource,
        cadenceMs: 1000,
        silent: true,
      });
      await authority.start();

      await controller.dispatchCommand('enterRestaurant', {
        restaurantId: 'restaurant:development-restaurant',
      });

      // 1. pulse -> command
      // Real time advances to 16:00:01.000, pulse fires
      mockSource.advance(1000);
      const p1 = await authority.pulse();
      assert.ok(p1 !== null && p1.success);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:01.000Z');

      // Real time advances to 16:00:01.400, command executes
      mockSource.setTime(Date.parse('2026-09-24T16:00:01.400Z'));
      const c1 = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(c1.success, true);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:01.400Z');

      // 2. command -> pulse
      // Real time advances to 16:00:01.700, command executes
      mockSource.setTime(Date.parse('2026-09-24T16:00:01.700Z'));
      const c2 = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(c2.success, true);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:01.700Z');

      // Real time advances to 16:00:02.000, pulse fires
      mockSource.setTime(Date.parse('2026-09-24T16:00:02.000Z'));
      const p2 = await authority.pulse();
      assert.ok(p2 !== null && p2.success);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:02.000Z');

      // 3. pulse -> command -> pulse -> command interleaved
      mockSource.setTime(Date.parse('2026-09-24T16:00:03.000Z'));
      const p3 = await authority.pulse();
      assert.ok(p3 !== null && p3.success);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:03.000Z');

      mockSource.setTime(Date.parse('2026-09-24T16:00:03.250Z'));
      const c3 = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(c3.success, true);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:03.250Z');

      mockSource.setTime(Date.parse('2026-09-24T16:00:04.000Z'));
      const p4 = await authority.pulse();
      assert.ok(p4 !== null && p4.success);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:04.000Z');

      mockSource.setTime(Date.parse('2026-09-24T16:00:04.500Z'));
      const c4 = await controller.dispatchCommand('purchaseOffering', {
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.strictEqual(c4.success, true);
      assert.strictEqual(controller.getStatus().worldTime, '2026-09-24T16:00:04.500Z');

      // Verify all purchases strictly monotonically stamped and persisted to disk
      const history = controller.getHistoryView();
      const purchases = history.history!.purchases;
      assert.strictEqual(purchases.length, 4);
      assert.strictEqual(purchases[0].worldTime, '2026-09-24T16:00:01.400Z');
      assert.strictEqual(purchases[1].worldTime, '2026-09-24T16:00:01.700Z');
      assert.strictEqual(purchases[2].worldTime, '2026-09-24T16:00:03.250Z');
      assert.strictEqual(purchases[3].worldTime, '2026-09-24T16:00:04.500Z');

      const persisted = JSON.parse(readFileSync(tempFilePath, 'utf-8'));
      assert.strictEqual(persisted.worldTime, '2026-09-24T16:00:04.500Z');
      assert.strictEqual(persisted.purchases.length, 4);

      await authority.stop();
      await controller.shutdown();
    });
  });
});
