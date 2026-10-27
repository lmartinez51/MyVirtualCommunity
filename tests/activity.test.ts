import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  startHavingCoffee,
  purchaseOffering,
  enterRestaurant,
  transitionAgentLocation,
  validateWorldState,
  PurchaseOfferingResult,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import {
  HAVING_COFFEE_DURATION_MINUTES,
  HAVING_COFFEE_DURATION_MS,
  calculateHavingCoffeeCompletionTime,
  isHavingCoffeeCompleted,
} from '../src/core/activities/having-coffee.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('Milestone 9: Having Coffee Time-Bound Player Activity', () => {
  const OPEN_TIME = '2026-09-14T15:00:00.000Z'; // 09:00 local in Ciudad Juárez (UTC-6)

  function setupWorldWithPlayerInOpenRestaurant(initialTime = OPEN_TIME) {
    const clock = new WorldClock(initialTime);
    const state = createInitialWorldState(clock);
    const entryResult = enterRestaurant(
      state,
      'agent:dev-player',
      'restaurant:development-restaurant',
      { silent: true }
    );
    assert.strictEqual(entryResult.success, true);
    return { clock, state };
  }

  function setupSuccessfulCoffeePurchase(initialTime = OPEN_TIME) {
    const { clock, state } = setupWorldWithPlayerInOpenRestaurant(initialTime);
    const purchaseReceipt = purchaseOffering(
      state,
      'agent:dev-player',
      'offering:development-coffee',
      { silent: true }
    );
    assert.strictEqual(purchaseReceipt.success, true);
    return { clock, state, purchaseReceipt };
  }

  describe('Activity Domain Rules & Duration', () => {
    it('defines fixed 15-minute duration constants', () => {
      assert.strictEqual(HAVING_COFFEE_DURATION_MINUTES, 15);
      assert.strictEqual(HAVING_COFFEE_DURATION_MS, 15 * 60 * 1000);
    });

    it('calculates exact completion time without error', () => {
      const completion = calculateHavingCoffeeCompletionTime('2026-09-14T15:00:00.000Z');
      assert.strictEqual(completion, '2026-09-14T15:15:00.000Z');
    });

    it('evaluates completion boundary correctly', () => {
      const start = '2026-09-14T15:00:00.000Z';
      assert.strictEqual(isHavingCoffeeCompleted(start, '2026-09-14T15:14:59.000Z'), false);
      assert.strictEqual(isHavingCoffeeCompleted(start, '2026-09-14T15:15:00.000Z'), true);
      assert.strictEqual(isHavingCoffeeCompleted(start, '2026-09-14T15:20:00.000Z'), true);
    });
  });

  describe('Preconditions for startHavingCoffee()', () => {
    it('1. rejects unknown player with agent-not-found', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const result = startHavingCoffee(state, 'agent:unknown', purchaseReceipt);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agent-not-found');
    });

    it('2. rejects NPC with agent-not-player', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const result = startHavingCoffee(state, 'agent:dev-npc', purchaseReceipt);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agent-not-player');
    });

    it('3. rejects player location that does not resolve to an existing restaurant with restaurant-not-found', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:unknown';
      const result = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'restaurant-not-found');
    });

    it('4. rejects player when located at a Place (e.g. building) with not-inside-restaurant', () => {
      const clock = new WorldClock(OPEN_TIME);
      const state = createInitialWorldState(clock);
      // Player is at building:development-building (a Place in state.places, not a Restaurant)
      const purchaseReceipt: PurchaseOfferingResult = {
        success: true,
        code: 'success',
        message: 'fake',
        playerId: 'agent:dev-player',
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      };
      const result = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'not-inside-restaurant');
    });

    it('5. rejects start when restaurant is closed with restaurant-closed', () => {
      const CLOSED_TIME = '2026-09-14T08:00:00.000Z'; // before 09:00
      const clock = new WorldClock(CLOSED_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:development-restaurant';

      const fakeReceipt: PurchaseOfferingResult = {
        success: true,
        code: 'success',
        message: 'fake',
        playerId: 'agent:dev-player',
        offeringId: 'offering:development-coffee',
        restaurantId: 'restaurant:development-restaurant',
      };
      const result = startHavingCoffee(state, 'agent:dev-player', fakeReceipt);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'restaurant-closed');
    });

    it('6a. rejects when purchase receipt is omitted with purchase-required', () => {
      const { state } = setupWorldWithPlayerInOpenRestaurant();
      const result = startHavingCoffee(state, 'agent:dev-player', undefined as unknown as PurchaseOfferingResult);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'purchase-required');
    });

    it('6b. rejects when purchase receipt indicates failure with purchase-required', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const failedReceipt: PurchaseOfferingResult = {
        ...purchaseReceipt,
        success: false,
        code: 'insufficient-funds',
      };
      const result = startHavingCoffee(state, 'agent:dev-player', failedReceipt);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'purchase-required');
    });

    it('6c. rejects when purchase receipt is for another player with purchase-required', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const wrongPlayerReceipt: PurchaseOfferingResult = {
        ...purchaseReceipt,
        playerId: 'agent:other-player',
      };
      const result = startHavingCoffee(state, 'agent:dev-player', wrongPlayerReceipt);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'purchase-required');
    });

    it('6d. rejects when purchase receipt is for different offering with purchase-required', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const wrongOfferingReceipt: PurchaseOfferingResult = {
        ...purchaseReceipt,
        offeringId: 'offering:tea',
      };
      const result = startHavingCoffee(state, 'agent:dev-player', wrongOfferingReceipt);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'purchase-required');
    });

    it('6e. rejects when purchase receipt is for different restaurant with purchase-required', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const wrongRestaurantReceipt: PurchaseOfferingResult = {
        ...purchaseReceipt,
        restaurantId: 'restaurant:other-restaurant',
      };
      const result = startHavingCoffee(state, 'agent:dev-player', wrongRestaurantReceipt);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'purchase-required');
    });

    it('6f. sufficient player balance alone is NOT sufficient to start having-coffee without valid receipt', () => {
      const { state } = setupWorldWithPlayerInOpenRestaurant();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.strictEqual(player.balanceMinor, 2000, 'player has $20.00 USD, plenty of funds');

      // Attempt start without receipt
      const result = startHavingCoffee(state, 'agent:dev-player', undefined as unknown as PurchaseOfferingResult);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'purchase-required');
      assert.strictEqual(player.balanceMinor, 2000, 'balance remains 2000 (not charged)');
      assert.strictEqual(player.playerActivity ?? null, null, 'player activity remains null');
    });

    it('7. successfully starts having coffee when all preconditions satisfied', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const result = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.code, 'success');
      assert.strictEqual(result.playerId, 'agent:dev-player');
      assert.strictEqual(result.activity, 'having-coffee');
      assert.strictEqual(result.startedAt, OPEN_TIME);
      assert.strictEqual(result.completedAt, null);

      const player = state.agents.find((a) => a.id === 'agent:dev-player');
      assert.ok(player?.playerActivity);
      assert.strictEqual(player.playerActivity.activity, 'having-coffee');
      assert.strictEqual(player.playerActivity.startedAt, OPEN_TIME);
      assert.strictEqual(player.playerActivity.completedAt, null);
    });

    it('8. starting again while active is rejected with activity-already-active', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const result1 = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);
      assert.strictEqual(result1.success, true);

      const result2 = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);
      assert.strictEqual(result2.success, false);
      assert.strictEqual(result2.code, 'activity-already-active');

      const player = state.agents.find((a) => a.id === 'agent:dev-player');
      assert.strictEqual(player?.playerActivity?.startedAt, OPEN_TIME);
      assert.strictEqual(player?.playerActivity?.completedAt, null);
    });

    it('9. failed start produces zero state mutation', () => {
      const { state } = setupWorldWithPlayerInOpenRestaurant();
      const playerBefore = JSON.parse(JSON.stringify(state.agents.find((a) => a.id === 'agent:dev-player')));

      // Attempt start without receipt
      const result = startHavingCoffee(state, 'agent:dev-player', undefined as unknown as PurchaseOfferingResult);
      assert.strictEqual(result.success, false);

      const playerAfter = JSON.parse(JSON.stringify(state.agents.find((a) => a.id === 'agent:dev-player')));
      assert.deepStrictEqual(playerBefore, playerAfter);
    });
  });

  describe('Simulation Progression & Boundary Semantics', () => {
    it('12. Mandatory Boundary 1: 09:00:00 -> 09:14:59 active, 09:15:00 completed', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:00:00.000Z');
      const startResult = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);
      assert.strictEqual(startResult.success, true);

      const sim = new Simulation(clock, state, { silent: true });

      // Advance 14 minutes and 59 seconds (1 second before completion)
      clock.advance(14 * 60_000 + 59_000);
      assert.strictEqual(clock.getTime(), '2026-09-14T15:14:59.000Z');

      const tick1 = sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player');
      assert.strictEqual(player?.playerActivity?.completedAt, null, 'must remain active at 09:14:59');
      assert.strictEqual(tick1.playerActivityTransitions?.length ?? 0, 0);

      // Advance 1 second to exact 15-minute boundary
      clock.advance(1000);
      assert.strictEqual(clock.getTime(), '2026-09-14T15:15:00.000Z');

      const tick2 = sim.tick();
      assert.strictEqual(player?.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z', 'must complete at 09:15:00');
      assert.strictEqual(tick2.playerActivityTransitions?.length, 1);
      assert.strictEqual(tick2.playerActivityTransitions![0].completedAt, '2026-09-14T15:15:00.000Z');
    });

    it('13. Mandatory Boundary 2: 09:07:00 -> 09:21:59 active, 09:22:00 completed', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:07:00.000Z');
      const startResult = startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);
      assert.strictEqual(startResult.success, true);

      const sim = new Simulation(clock, state, { silent: true });

      // Advance to 09:21:59
      clock.advance(14 * 60_000 + 59_000);
      assert.strictEqual(clock.getTime(), '2026-09-14T15:21:59.000Z');

      sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player');
      assert.strictEqual(player?.playerActivity?.completedAt, null, 'must remain active at 09:21:59');

      // Advance 1 second to 09:22:00
      clock.advance(1000);
      assert.strictEqual(clock.getTime(), '2026-09-14T15:22:00.000Z');

      sim.tick();
      assert.strictEqual(player?.playerActivity?.completedAt, '2026-09-14T15:22:00.000Z', 'must complete at 09:22:00');
    });

    it('14. Late Discovery Test: Start 09:00, advance directly to 09:22, completedAt is 09:15 (NOT 09:22)', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:00:00.000Z');
      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      const sim = new Simulation(clock, state, { silent: true });

      // Leap 22 minutes ahead (discovering completion late)
      clock.advance(22 * 60_000);
      assert.strictEqual(clock.getTime(), '2026-09-14T15:22:00.000Z');

      const tick = sim.tick();
      const player = state.agents.find((a) => a.id === 'agent:dev-player');

      assert.strictEqual(clock.getTime(), '2026-09-14T15:22:00.000Z', 'clock remains 09:22:00');
      assert.strictEqual(
        player?.playerActivity?.completedAt,
        '2026-09-14T15:15:00.000Z',
        'completedAt must be the theoretical 09:15:00 boundary, NOT late discovery 09:22:00'
      );
      assert.strictEqual(tick.playerActivityTransitions?.[0].completedAt, '2026-09-14T15:15:00.000Z');
    });

    it('15. Idempotency: Additional ticks after completion produce no state change', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:00:00.000Z');
      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(15 * 60_000);
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player');
      assert.strictEqual(player?.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');

      // Subsequent tick at 09:16:00
      clock.advance(60_000);
      const subsequentTick = sim.tick();

      assert.strictEqual(subsequentTick.playerActivityTransitions?.length ?? 0, 0);
      assert.strictEqual(player?.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');
    });

    it('15b. Completed activity state remains stable, immutable, and un-cleared across multiple subsequent ticks', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:00:00.000Z');
      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(15 * 60_000); // 09:15:00
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.strictEqual(player.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');

      // Tick at 09:30:00 (15 minutes later)
      clock.advance(15 * 60_000);
      const tick1 = sim.tick();
      assert.strictEqual(tick1.playerActivityTransitions?.length ?? 0, 0);
      assert.strictEqual(player.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');

      // Tick at 10:00:00 (45 minutes after completion)
      clock.advance(30 * 60_000);
      const tick2 = sim.tick();
      assert.strictEqual(tick2.playerActivityTransitions?.length ?? 0, 0);
      assert.strictEqual(player.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');

      // Tick at 12:00:00 (2 hours 45 minutes after completion)
      clock.advance(120 * 60_000);
      const tick3 = sim.tick();
      assert.strictEqual(tick3.playerActivityTransitions?.length ?? 0, 0);
      assert.strictEqual(player.playerActivity?.activity, 'having-coffee');
      assert.strictEqual(player.playerActivity?.startedAt, '2026-09-14T15:00:00.000Z');
      assert.strictEqual(player.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');
    });
  });

  describe('System Invariants & Isolation', () => {
    it('16. WorldClock is never advanced by startHavingCoffee', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const timeBefore = clock.getTime();

      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      assert.strictEqual(clock.getTime(), timeBefore);
    });

    it('17. Existing agent.activityState and activitySince remain completely untouched', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const generalActivityStateBefore = player.activityState;
      const generalActivitySinceBefore = player.activitySince;

      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      assert.strictEqual(player.activityState, generalActivityStateBefore);
      assert.strictEqual(player.activitySince, generalActivitySinceBefore);

      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(15 * 60_000);
      sim.tick();

      assert.strictEqual(player.activityState, generalActivityStateBefore);
      assert.strictEqual(player.activitySince, generalActivitySinceBefore);
    });

    it('18. NPC activity simulation continues working unaffected', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:00:00.000Z');
      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      const sim = new Simulation(clock, state, { silent: true });
      // Tick at 15:00:00 (inside active window [15:00, 23:00) UTC / [09:00, 17:00) local)
      const tickResult = sim.tick();

      const npcTransition = tickResult.transitions.find((t) => t.agentId === 'agent:dev-npc');
      assert.ok(npcTransition);
      assert.strictEqual(npcTransition.newState, 'active');

      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.strictEqual(npc.activityState, 'active');
      assert.strictEqual(npc.playerActivity, null);
    });

    it('19. Restaurant operational simulation continues working unaffected', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:00:00.000Z');
      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(8 * 3600_000); // advance to 23:00:00 UTC (17:00 local closing time)

      const tickResult = sim.tick();
      const restaurantTransition = tickResult.restaurantTransitions.find(
        (r) => r.restaurantId === 'restaurant:development-restaurant'
      );
      assert.ok(restaurantTransition);
      assert.strictEqual(restaurantTransition.newState, 'closed');
    });

    it('20. Balances and offerings remain untouched during activity lifecycle', () => {
      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

      const playerBalance = player.balanceMinor;
      const restaurantBalance = restaurant.balanceMinor;

      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(15 * 60_000);
      sim.tick();

      assert.strictEqual(player.balanceMinor, playerBalance);
      assert.strictEqual(restaurant.balanceMinor, restaurantBalance);
    });

    it('21. transitionAgentLocation retains existing semantics without movement blocking', () => {
      const { state, purchaseReceipt } = setupSuccessfulCoffeePurchase();
      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      // Transitioning player back to building does not throw error
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.strictEqual(player.locationId, 'building:development-building');
    });
  });

  describe('Persistence & Reconstruction', () => {
    let tmpDir: string;

    it('22. Active activity survives save/load and restores identically', async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mvc-m9-activity-'));
      const filePath = path.join(tmpDir, 'world-state.json');
      const persistence = new LocalFilePersistence(filePath);

      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:00:00.000Z');
      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);

      await persistence.save(state);

      // Session B restores from disk
      const restored = await persistence.load();
      assert.ok(restored);
      validateWorldState(restored);

      const restoredPlayer = restored.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.ok(restoredPlayer.playerActivity);
      assert.strictEqual(restoredPlayer.playerActivity.activity, 'having-coffee');
      assert.strictEqual(restoredPlayer.playerActivity.startedAt, '2026-09-14T15:00:00.000Z');
      assert.strictEqual(restoredPlayer.playerActivity.completedAt, null);

      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('23. Restored active activity completes when restored world time passes completion boundary', async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mvc-m9-activity-'));
      const filePath = path.join(tmpDir, 'world-state.json');
      const persistence = new LocalFilePersistence(filePath);

      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:00:00.000Z');
      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);
      await persistence.save(state);

      // Session B restores
      const restored = await persistence.load();
      assert.ok(restored);
      const sessionBClock = new WorldClock(restored.worldTime);
      sessionBClock.advance(15 * 60_000); // advance to 15:15:00

      const sessionBSim = new Simulation(sessionBClock, restored, { silent: true });
      const tickResult = sessionBSim.tick();

      const restoredPlayer = restored.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.strictEqual(restoredPlayer.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');
      assert.strictEqual(tickResult.playerActivityTransitions?.[0].completedAt, '2026-09-14T15:15:00.000Z');

      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('24. Completed activity survives save/load and restores identically', async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mvc-m9-activity-'));
      const filePath = path.join(tmpDir, 'world-state.json');
      const persistence = new LocalFilePersistence(filePath);

      const { clock, state, purchaseReceipt } = setupSuccessfulCoffeePurchase('2026-09-14T15:00:00.000Z');
      startHavingCoffee(state, 'agent:dev-player', purchaseReceipt);
      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(15 * 60_000);
      sim.tick();

      await persistence.save(state);

      const restored = await persistence.load();
      assert.ok(restored);
      validateWorldState(restored);

      const restoredPlayer = restored.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.strictEqual(restoredPlayer.playerActivity?.activity, 'having-coffee');
      assert.strictEqual(restoredPlayer.playerActivity?.startedAt, '2026-09-14T15:00:00.000Z');
      assert.strictEqual(restoredPlayer.playerActivity?.completedAt, '2026-09-14T15:15:00.000Z');

      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('25. Explicitly rejects versions 1 through 17 in validateWorldState', () => {
      const clock = new WorldClock(OPEN_TIME);
      const state = createInitialWorldState(clock);

      for (let v = 1; v <= 17; v++) {
        const legacy = { ...state, version: v };
        assert.throws(
          () => validateWorldState(legacy),
          new RegExp(`Unsupported WorldState version: ${v}\\. Expected version 19\\.`)
        );
      }
    });
  });
});
