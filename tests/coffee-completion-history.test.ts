import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  purchaseOffering,
  startHavingCoffee,
  inspectCurrentLocation,
  enterRestaurant,
  exitRestaurant,
  leaveBuilding,
  transitionAgentLocation,
  CURRENT_WORLD_STATE_VERSION,
  CoffeeCompletionRecord,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { HAVING_COFFEE_DURATION_MS } from '../src/core/activities/having-coffee.js';

function setupOpenWorld() {
  // 09:00:00 UTC -> development restaurant is open
  const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
  const state = createInitialWorldState(clock);
  const sim = new Simulation(clock, state, { silent: true });
  sim.tick(); // transition restaurant from closed to open

  // Move player into restaurant
  enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', {
    silent: true,
  });

  return { clock, state, sim };
}

function setupStartedCoffeeWorld() {
  const { clock, state, sim } = setupOpenWorld();
  const receipt = purchaseOffering(
    state,
    'agent:dev-player',
    'offering:development-coffee',
    'restaurant:development-restaurant',
    { silent: true }
  );
  assert.equal(receipt.success, true);

  const startResult = startHavingCoffee(state, 'agent:dev-player', receipt);
  assert.equal(startResult.success, true);

  return { clock, state, sim, receipt };
}

describe('Milestone 14: Completed Player Activity as Persistent Historical Fact (Coffee Completion)', () => {
  // =========================================================================
  // 1. Single Completion Creation
  // =========================================================================
  describe('1. Single Completion Creation', () => {
    test('completed activity creates exactly one CoffeeCompletionRecord in state.coffeeCompletions', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      assert.equal(state.coffeeCompletions.length, 0);

      // Advance clock to exact 15m boundary
      clock.advance(15 * 60_000);
      const tickResult = sim.tick();

      assert.equal(tickResult.playerActivityTransitions?.length, 1);
      assert.equal(tickResult.playerActivityTransitions![0].completedAt, '2026-09-14T09:15:00.000Z');

      // Exactly one historical fact recorded
      assert.equal(state.coffeeCompletions.length, 1);
      const record = state.coffeeCompletions[0];

      assert.equal(record.id, 'coffee-completion:1');
      assert.equal(record.playerId, 'agent:dev-player');
      assert.equal(record.restaurantId, 'restaurant:development-restaurant');
      assert.equal(record.startedAt, '2026-09-14T09:00:00.000Z');
      assert.equal(record.completedAt, '2026-09-14T09:15:00.000Z');

      // Verify that validateWorldState accepts the updated state
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 2. Exact Boundary Precision
  // =========================================================================
  describe('2. Exact Boundary Precision', () => {
    test('completion at 09:15:00 records exact startedAt + 15m boundary', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      // Advance 14m 59s: still active, 0 records
      clock.advance(14 * 60_000 + 59_000);
      sim.tick();
      assert.equal(state.coffeeCompletions.length, 0);

      // Advance remaining 1 second to reach exact boundary
      clock.advance(1000);
      assert.equal(clock.getTime(), '2026-09-14T09:15:00.000Z');
      sim.tick();

      assert.equal(state.coffeeCompletions.length, 1);
      const record = state.coffeeCompletions[0];
      assert.equal(record.startedAt, '2026-09-14T09:00:00.000Z');
      assert.equal(record.completedAt, '2026-09-14T09:15:00.000Z');
      assert.equal(
        Date.parse(record.completedAt) - Date.parse(record.startedAt),
        HAVING_COFFEE_DURATION_MS
      );
    });
  });

  // =========================================================================
  // 3. Late / Offline Discovery
  // =========================================================================
  describe('3. Late / Offline Discovery', () => {
    test('start at 09:00, leap directly to 09:22; records completedAt 09:15 (not 09:22)', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      // Leap 22 minutes ahead
      clock.advance(22 * 60_000);
      assert.equal(clock.getTime(), '2026-09-14T09:22:00.000Z');

      sim.tick();

      assert.equal(state.coffeeCompletions.length, 1);
      const record = state.coffeeCompletions[0];
      assert.equal(record.startedAt, '2026-09-14T09:00:00.000Z');
      assert.equal(
        record.completedAt,
        '2026-09-14T09:15:00.000Z',
        'must record the theoretical 09:15:00 completion boundary, NOT discovery time 09:22:00'
      );
    });
  });

  // =========================================================================
  // 4. Idempotency (Zero Duplication on Subsequent Ticks)
  // =========================================================================
  describe('4. Idempotency', () => {
    test('subsequent simulation ticks do NOT duplicate completion records', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      clock.advance(15 * 60_000); // 09:15:00
      sim.tick();
      assert.equal(state.coffeeCompletions.length, 1);

      // Tick at 09:16:00
      clock.advance(60_000);
      sim.tick();
      assert.equal(state.coffeeCompletions.length, 1);

      // Tick at 09:30:00
      clock.advance(14 * 60_000);
      sim.tick();
      assert.equal(state.coffeeCompletions.length, 1);

      // Tick at 10:00:00
      clock.advance(30 * 60_000);
      sim.tick();
      assert.equal(state.coffeeCompletions.length, 1);
      assert.equal(state.coffeeCompletions[0].id, 'coffee-completion:1');
    });
  });

  // =========================================================================
  // 5. Sequential Activities
  // =========================================================================
  describe('5. Sequential Activities', () => {
    test('sequential coffee activities create separate historical records with monotonic IDs', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      // Complete Coffee #1 at 09:15:00
      clock.advance(15 * 60_000);
      sim.tick();
      assert.equal(state.coffeeCompletions.length, 1);
      assert.equal(state.coffeeCompletions[0].id, 'coffee-completion:1');
      assert.equal(state.coffeeCompletions[0].completedAt, '2026-09-14T09:15:00.000Z');

      // Advance to 10:00:00 and start Coffee #2
      clock.advance(45 * 60_000);
      sim.tick();
      assert.equal(clock.getTime(), '2026-09-14T10:00:00.000Z');
      assert.equal(state.worldTime, '2026-09-14T10:00:00.000Z');

      const receipt2 = purchaseOffering(
        state,
        'agent:dev-player',
        'offering:development-coffee',
        'restaurant:development-restaurant',
        { silent: true }
      );
      assert.equal(receipt2.success, true);

      const startResult2 = startHavingCoffee(state, 'agent:dev-player', receipt2);
      assert.equal(startResult2.success, true);

      // Advance 15 minutes to 10:15:00 and tick
      clock.advance(15 * 60_000);
      sim.tick();

      assert.equal(state.coffeeCompletions.length, 2);
      assert.equal(state.coffeeCompletions[0].id, 'coffee-completion:1');
      assert.equal(state.coffeeCompletions[0].startedAt, '2026-09-14T09:00:00.000Z');
      assert.equal(state.coffeeCompletions[0].completedAt, '2026-09-14T09:15:00.000Z');

      assert.equal(state.coffeeCompletions[1].id, 'coffee-completion:2');
      assert.equal(state.coffeeCompletions[1].startedAt, '2026-09-14T10:00:00.000Z');
      assert.equal(state.coffeeCompletions[1].completedAt, '2026-09-14T10:15:00.000Z');

      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 6. Active Activity Isolation
  // =========================================================================
  describe('6. Active Activity Isolation', () => {
    test('active coffee creates zero completion records prior to completion boundary', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      assert.equal(state.coffeeCompletions.length, 0);

      clock.advance(5 * 60_000);
      sim.tick();
      assert.equal(state.coffeeCompletions.length, 0);

      clock.advance(5 * 60_000);
      sim.tick();
      assert.equal(state.coffeeCompletions.length, 0);
    });
  });

  // =========================================================================
  // 7 & 8. Spatial Movement & Restaurant Association Independence
  // =========================================================================
  describe('7 & 8. Spatial Movement & Restaurant Association Independence', () => {
    test('completion preserves original restaurantId even when player has moved away', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      // At 09:05, player exits restaurant into building (M10)
      clock.advance(5 * 60_000);
      const exitResult = exitRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      assert.equal(exitResult.success, true);

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'building:development-building');

      // At 09:10, player leaves building into street (M10)
      clock.advance(5 * 60_000);
      const leaveResult = leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      assert.equal(leaveResult.success, true);
      assert.equal(player.locationId, 'street:development-street');

      // At 09:15, activity completes while player is physically on the street
      clock.advance(5 * 60_000);
      assert.equal(clock.getTime(), '2026-09-14T09:15:00.000Z');
      sim.tick();

      assert.equal(state.coffeeCompletions.length, 1);
      const record = state.coffeeCompletions[0];

      // Crucial assertion: restaurantId reflects the restaurant where coffee was started
      assert.equal(record.restaurantId, 'restaurant:development-restaurant');
      assert.equal(player.locationId, 'street:development-street');
      assert.notEqual(record.restaurantId, player.locationId);

      // State is completely valid despite player being at a different location
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 9. Historical Immutability
  // =========================================================================
  describe('9. Historical Immutability', () => {
    test('historical record remains unchanged after subsequent world changes', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      clock.advance(15 * 60_000);
      sim.tick();

      assert.equal(state.coffeeCompletions.length, 1);
      const originalRecord = { ...state.coffeeCompletions[0] };

      // 1. Restaurant closes at 17:00 UTC
      clock.advance(8 * 3600_000); // 17:15 UTC
      sim.tick();
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      assert.equal(restaurant.operationalState, 'closed');

      // 2. Coffee offering price changes (500 -> 800)
      const coffee = state.offerings.find((o) => o.id === 'offering:development-coffee')!;
      coffee.priceMinor = 800;

      // 3. Player moves to neighborhood
      transitionAgentLocation(state, 'agent:dev-player', 'neighborhood:development-neighborhood');

      // 4. Verify historical record is strictly identical
      assert.deepEqual(state.coffeeCompletions[0], originalRecord);
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 10. Snapshot Isolation
  // =========================================================================
  describe('10. Snapshot Isolation', () => {
    test('mutating snapshot coffeeCompletions does NOT alter original state', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      clock.advance(15 * 60_000);
      sim.tick();
      assert.equal(state.coffeeCompletions.length, 1);

      const snapshot = snapshotWorldState(clock, state);
      assert.equal(snapshot.coffeeCompletions.length, 1);

      // Mutate snapshot's array
      snapshot.coffeeCompletions.push({
        id: 'coffee-completion:999',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        startedAt: clock.getTime(),
        completedAt: clock.getTime(),
      });

      assert.equal(snapshot.coffeeCompletions.length, 2);
      // Original state array remains isolated
      assert.equal(state.coffeeCompletions.length, 1);
      assert.equal(state.coffeeCompletions[0].id, 'coffee-completion:1');
    });
  });

  // =========================================================================
  // 11. Persistence Round-Trip
  // =========================================================================
  describe('11. Persistence Round-Trip', () => {
    test('coffee completions survive save/load and sequence continues cleanly in fresh runtime', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-m14-persist-'));
      const testFile = join(tmpDir, 'world-state.json');

      try {
        const { clock, state, sim } = setupStartedCoffeeWorld();

        clock.advance(15 * 60_000);
        sim.tick();
        assert.equal(state.coffeeCompletions.length, 1);

        // Save Session A
        const persistenceA = new LocalFilePersistence(testFile);
        persistenceA.save(snapshotWorldState(clock, state));

        // Restore Session B
        const persistenceB = new LocalFilePersistence(testFile);
        const stateB = persistenceB.load()!;
        assert.ok(stateB !== null);
        assert.doesNotThrow(() => validateWorldState(stateB));
        assert.equal(stateB.version, CURRENT_WORLD_STATE_VERSION);
        assert.equal(stateB.coffeeCompletions.length, 1);

        const restoredRecord = stateB.coffeeCompletions[0];
        assert.equal(restoredRecord.id, 'coffee-completion:1');
        assert.equal(restoredRecord.playerId, 'agent:dev-player');
        assert.equal(restoredRecord.restaurantId, 'restaurant:development-restaurant');
        assert.equal(restoredRecord.completedAt, '2026-09-14T09:15:00.000Z');

        // Execute second coffee in Session B
        const clockB = WorldClock.create(stateB.worldTime);
        const simB = new Simulation(clockB, stateB, { silent: true });

        // Move player into restaurant in Session B
        enterRestaurant(stateB, 'agent:dev-player', 'restaurant:development-restaurant', {
          silent: true,
        });

        const receiptB = purchaseOffering(
          stateB,
          'agent:dev-player',
          'offering:development-coffee',
          'restaurant:development-restaurant',
          { silent: true }
        );
        assert.equal(receiptB.success, true);

        const startB = startHavingCoffee(stateB, 'agent:dev-player', receiptB);
        assert.equal(startB.success, true);

        clockB.advance(15 * 60_000);
        simB.tick();

        // Sequence continued to coffee-completion:2
        assert.equal(stateB.coffeeCompletions.length, 2);
        assert.equal(stateB.coffeeCompletions[1].id, 'coffee-completion:2');
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });

  // =========================================================================
  // 12. Referential Integrity & Error Rejections
  // =========================================================================
  describe('12. Referential Integrity & Validation Rules', () => {
    test('validateWorldState rejects record referencing non-existent agent', () => {
      const { state } = setupOpenWorld();
      state.coffeeCompletions.push({
        id: 'coffee-completion:1',
        playerId: 'agent:ghost',
        restaurantId: 'restaurant:development-restaurant',
        startedAt: '2026-09-14T09:00:00.000Z',
        completedAt: '2026-09-14T09:15:00.000Z',
      });

      assert.throws(
        () => validateWorldState(state),
        /playerId "agent:ghost" references non-existent agent/
      );
    });

    test('validateWorldState rejects record referencing NPC as player', () => {
      const { state } = setupOpenWorld();
      state.coffeeCompletions.push({
        id: 'coffee-completion:1',
        playerId: 'agent:dev-npc',
        restaurantId: 'restaurant:development-restaurant',
        startedAt: '2026-09-14T09:00:00.000Z',
        completedAt: '2026-09-14T09:15:00.000Z',
      });

      assert.throws(
        () => validateWorldState(state),
        /agent "agent:dev-npc" is not a player/
      );
    });

    test('validateWorldState rejects record referencing non-existent restaurant', () => {
      const { state } = setupOpenWorld();
      state.coffeeCompletions.push({
        id: 'coffee-completion:1',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:ghost',
        startedAt: '2026-09-14T09:00:00.000Z',
        completedAt: '2026-09-14T09:15:00.000Z',
      });

      assert.throws(
        () => validateWorldState(state),
        /restaurantId "restaurant:ghost" references non-existent restaurant/
      );
    });

    test('validateWorldState rejects duplicate coffee completion IDs', () => {
      const { state } = setupOpenWorld();
      const rec: CoffeeCompletionRecord = {
        id: 'coffee-completion:1',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        startedAt: '2026-09-14T09:00:00.000Z',
        completedAt: '2026-09-14T09:15:00.000Z',
      };
      state.coffeeCompletions.push(rec);
      state.coffeeCompletions.push({ ...rec });

      assert.throws(
        () => validateWorldState(state),
        /Duplicate coffee completion record id found: "coffee-completion:1"/
      );
    });
  });

  // =========================================================================
  // 13 & 14. Timestamps & Exact Duration Invariants
  // =========================================================================
  describe('13 & 14. Timestamps & Duration Invariants', () => {
    test('validateWorldState rejects invalid startedAt or completedAt timestamp formats', () => {
      const { state } = setupOpenWorld();
      state.coffeeCompletions.push({
        id: 'coffee-completion:1',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        startedAt: 'not-a-timestamp',
        completedAt: '2026-09-14T09:15:00.000Z',
      });

      assert.throws(
        () => validateWorldState(state),
        /startedAt must be a valid ISO-8601 timestamp/
      );

      state.coffeeCompletions[0].startedAt = '2026-09-14T09:00:00.000Z';
      state.coffeeCompletions[0].completedAt = 'garbage';

      assert.throws(
        () => validateWorldState(state),
        /completedAt must be a valid ISO-8601 timestamp/
      );
    });

    test('validateWorldState rejects completedAt earlier than startedAt', () => {
      const { state } = setupOpenWorld();
      state.coffeeCompletions.push({
        id: 'coffee-completion:1',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        startedAt: '2026-09-14T09:15:00.000Z',
        completedAt: '2026-09-14T09:00:00.000Z',
      });

      assert.throws(
        () => validateWorldState(state),
        /completedAt .* must be greater than or equal to startedAt/
      );
    });

    test('validateWorldState rejects duration not exactly 15 minutes', () => {
      const { state } = setupOpenWorld();
      state.coffeeCompletions.push({
        id: 'coffee-completion:1',
        playerId: 'agent:dev-player',
        restaurantId: 'restaurant:development-restaurant',
        startedAt: '2026-09-14T09:00:00.000Z',
        completedAt: '2026-09-14T09:20:00.000Z', // 20 minutes instead of 15
      });

      assert.throws(
        () => validateWorldState(state),
        /does not match exact 15-minute duration from startedAt/
      );
    });
  });

  // =========================================================================
  // 15 & 16. Schema Strictness
  // =========================================================================
  describe('15 & 16. Schema Version Strictness', () => {
    test('validateWorldState accepts valid version 12 state and rejects version 11 and 10', () => {
      const { state } = setupOpenWorld();

      assert.equal(state.version, 12);
      assert.doesNotThrow(() => validateWorldState(state));

      const v10Candidate = { ...state, version: 10 };
      assert.throws(
        () => validateWorldState(v10Candidate),
        /Unsupported WorldState version: 10\. Expected version 12/
      );
      const v11Candidate = { ...state, version: 11 };
      assert.throws(
        () => validateWorldState(v11Candidate),
        /Unsupported WorldState version: 11\. Expected version 12/
      );
    });

    test('validateWorldState rejects missing or non-array coffeeCompletions', () => {
      const { state } = setupOpenWorld();

      const missingCompletions = { ...state } as Record<string, unknown>;
      delete missingCompletions.coffeeCompletions;

      assert.throws(
        () => validateWorldState(missingCompletions),
        /Invalid WorldState: coffeeCompletions must be an array/
      );

      const nonArrayCompletions = { ...state, coffeeCompletions: 'not-an-array' };
      assert.throws(
        () => validateWorldState(nonArrayCompletions),
        /Invalid WorldState: coffeeCompletions must be an array/
      );
    });
  });

  // =========================================================================
  // 17. Location Independence
  // =========================================================================
  describe('17. Location Independence', () => {
    test('current player location is completely independent of historical restaurantId', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      clock.advance(15 * 60_000);
      sim.tick();

      // Move player anywhere in the world
      transitionAgentLocation(state, 'agent:dev-player', 'neighborhood:development-neighborhood');

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'neighborhood:development-neighborhood');
      assert.equal(state.coffeeCompletions[0].restaurantId, 'restaurant:development-restaurant');

      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 18. Perception Isolation
  // =========================================================================
  describe('18. Perception Isolation', () => {
    test('M12 inspectCurrentLocation does NOT leak or expose coffeeCompletions', () => {
      const { clock, state, sim } = setupStartedCoffeeWorld();

      clock.advance(15 * 60_000);
      sim.tick();

      const perception = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(perception.success, true);

      const rawPerception = perception as unknown as Record<string, unknown>;
      assert.equal(rawPerception.coffeeCompletions, undefined);
      assert.equal(rawPerception.history, undefined);

      const rawLocation = perception.location as unknown as Record<string, unknown>;
      assert.equal(rawLocation.coffeeCompletions, undefined);
      assert.equal(rawLocation.history, undefined);

      for (const agent of perception.location.agents) {
        const rawAgent = agent as unknown as Record<string, unknown>;
        assert.equal(rawAgent.coffeeCompletions, undefined);
        assert.equal(rawAgent.history, undefined);
      }
    });
  });
});
