import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  transitionRestaurantOperationalState,
  isRestaurantOpen,
  validateBusinessAuthority,
  enterRestaurant,
  purchaseOffering,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { Restaurant } from '../src/core/entities/restaurant.js';
import { Offering } from '../src/core/entities/offering.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';

describe('Milestone 36: Business Domain Authority (AUD-02)', () => {
  const MORNING_CLOSED_TIME = '2026-09-14T08:00:00.000Z'; // UTC 08:00 -> closed
  const DAY_OPEN_TIME = '2026-09-14T10:00:00.000Z';       // UTC 10:00 -> open
  const RESTAURANT_ID = 'restaurant:development-restaurant';

  function setupWorldAt(timeIso: string = MORNING_CLOSED_TIME) {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    return { clock, state };
  }

  describe('1. Authoritative Operational Transitions', () => {
    test('transitions restaurant from closed to open at valid worldTime', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      assert.equal(restaurant.operationalState, 'closed');

      // Fast forward world time to 10:00
      state.worldTime = DAY_OPEN_TIME;

      const result = transitionRestaurantOperationalState(
        state,
        RESTAURANT_ID,
        'open',
        DAY_OPEN_TIME
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.changed, true);
      assert.equal(result.previousState, 'closed');
      assert.equal(result.newState, 'open');
      assert.equal(result.operationalSince, DAY_OPEN_TIME);

      assert.equal(restaurant.operationalState, 'open');
      assert.equal(restaurant.operationalSince, DAY_OPEN_TIME);
    });

    test('transitions restaurant from open to closed at valid worldTime', () => {
      const { state } = setupWorldAt(DAY_OPEN_TIME);
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      restaurant.operationalState = 'open';
      restaurant.operationalSince = DAY_OPEN_TIME;

      const eveningTime = '2026-09-14T18:00:00.000Z';
      state.worldTime = eveningTime;

      const result = transitionRestaurantOperationalState(
        state,
        RESTAURANT_ID,
        'closed',
        eveningTime
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.changed, true);
      assert.equal(result.previousState, 'open');
      assert.equal(result.newState, 'closed');
      assert.equal(result.operationalSince, eveningTime);

      assert.equal(restaurant.operationalState, 'closed');
      assert.equal(restaurant.operationalSince, eveningTime);
    });

    test('idempotent transition preserves operationalSince and reports changed: false', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      const originalSince = restaurant.operationalSince;

      const laterTime = '2026-09-14T08:30:00.000Z';
      state.worldTime = laterTime;

      const result = transitionRestaurantOperationalState(
        state,
        RESTAURANT_ID,
        'closed',
        laterTime
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'no-state-change');
      assert.equal(result.changed, false);
      assert.equal(result.previousState, 'closed');
      assert.equal(result.newState, 'closed');
      assert.equal(result.operationalSince, originalSince);

      assert.equal(restaurant.operationalState, 'closed');
      assert.equal(restaurant.operationalSince, originalSince); // Preserved!
    });

    test('fails when restaurant does not exist', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const result = transitionRestaurantOperationalState(
        state,
        'restaurant:non-existent',
        'open',
        MORNING_CLOSED_TIME
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-not-found');
      assert.equal(result.changed, false);
    });

    test('fails when target state is invalid', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      const originalSince = restaurant.operationalSince;

      const result = transitionRestaurantOperationalState(
        state,
        RESTAURANT_ID,
        'shut_down' as any,
        MORNING_CLOSED_TIME
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-target-state');
      assert.equal(result.changed, false);
      assert.equal(restaurant.operationalState, 'closed');
      assert.equal(restaurant.operationalSince, originalSince);
    });

    test('fails when timestamp is in the future relative to state.worldTime', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const futureTime = '2026-09-14T12:00:00.000Z';

      const result = transitionRestaurantOperationalState(
        state,
        RESTAURANT_ID,
        'open',
        futureTime
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-timestamp');
      assert.equal(result.changed, false);
    });

    test('fails when timestamp is not valid ISO 8601', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);

      const result = transitionRestaurantOperationalState(
        state,
        RESTAURANT_ID,
        'open',
        'not-a-timestamp'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-timestamp');
      assert.equal(result.changed, false);
    });
  });

  describe('2. Authoritative Query: isRestaurantOpen', () => {
    test('evaluates operational availability deterministically without mutation', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      assert.equal(isRestaurantOpen(state, RESTAURANT_ID), false);

      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      restaurant.operationalState = 'open';
      assert.equal(isRestaurantOpen(state, RESTAURANT_ID), true);

      assert.equal(isRestaurantOpen(state, 'restaurant:non-existent'), false);
    });
  });

  describe('3. Invariant Enforcement: validateBusinessAuthority', () => {
    test('passes on valid world state', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      assert.doesNotThrow(() => validateBusinessAuthority(state));
    });

    test('rejects restaurant with invalid operationalState', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      (restaurant as any).operationalState = 'half-open';

      assert.throws(
        () => validateBusinessAuthority(state),
        /Business Authority Invariant Violated: restaurant "restaurant:development-restaurant" has invalid operationalState "half-open"/
      );
    });

    test('rejects restaurant with invalid operationalSince timestamp', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      restaurant.operationalSince = 'invalid-time';

      assert.throws(
        () => validateBusinessAuthority(state),
        /Business Authority Invariant Violated: restaurant "restaurant:development-restaurant" has invalid operationalSince timestamp "invalid-time"/
      );
    });

    test('rejects restaurant with operationalSince in the future relative to worldTime', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      restaurant.operationalSince = '2026-09-14T09:00:00.000Z'; // 1 hour after MORNING_CLOSED_TIME

      assert.throws(
        () => validateBusinessAuthority(state),
        /has operationalSince "2026-09-14T09:00:00.000Z" in the future relative to worldTime/
      );
    });

    test('rejects restaurant referencing non-existent buildingId', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      restaurant.buildingId = 'building:ghost';

      assert.throws(
        () => validateBusinessAuthority(state),
        /references non-existent buildingId "building:ghost"/
      );
    });

    test('rejects offering referencing non-existent restaurantId', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      state.offerings.push({
        id: 'offering:orphan',
        type: 'offering',
        name: 'Orphan Taco',
        restaurantId: 'restaurant:ghost',
        priceMinor: 300,
        currency: 'USD',
      });

      assert.throws(
        () => validateBusinessAuthority(state),
        /references non-existent restaurantId "restaurant:ghost"/
      );
    });

    test('rejects offering with negative price', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const offering = state.offerings.find((o) => o.id === 'offering:development-coffee')!;
      offering.priceMinor = -100;

      assert.throws(
        () => validateBusinessAuthority(state),
        /has invalid priceMinor -100. Must be non-negative integer./
      );
    });

    test('rejects offering with non-integer price', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const offering = state.offerings.find((o) => o.id === 'offering:development-coffee')!;
      offering.priceMinor = 2.5 as any;

      assert.throws(
        () => validateBusinessAuthority(state),
        /has invalid priceMinor 2.5. Must be non-negative integer./
      );
    });

    test('rejects offering with empty currency', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const offering = state.offerings.find((o) => o.id === 'offering:development-coffee')!;
      offering.currency = '   ';

      assert.throws(
        () => validateBusinessAuthority(state),
        /has invalid currency. Must be non-empty string./
      );
    });

    test('validateWorldState automatically checks business authority invariants', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      restaurant.operationalSince = '2026-09-14T09:00:00.000Z'; // In future

      assert.throws(
        () => validateWorldState(state),
        /has operationalSince "2026-09-14T09:00:00.000Z" in the future relative to worldTime/
      );
    });
  });

  describe('4. Strict Domain Isolation (No Cross-Domain Authority Bleed)', () => {
    test('operational transition does not alter customer spatial location (no forced eviction)', () => {
      const { state } = setupWorldAt(DAY_OPEN_TIME);
      const player = state.agents.find((a) => a.agentType === 'player')!;
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;

      // Customer enters while open
      restaurant.operationalState = 'open';
      restaurant.operationalSince = DAY_OPEN_TIME;
      player.locationId = RESTAURANT_ID;

      // Business closes
      const closingTime = '2026-09-14T17:00:00.000Z';
      state.worldTime = closingTime;
      const transitionResult = transitionRestaurantOperationalState(
        state,
        RESTAURANT_ID,
        'closed',
        closingTime
      );

      assert.equal(transitionResult.success, true);
      assert.equal(restaurant.operationalState, 'closed');

      // Invariant: Customer remains at locationId; Business domain does not teleport or evict
      assert.equal(player.locationId, RESTAURANT_ID);
    });

    test('operational transition does not alter monetary balances', () => {
      const { state } = setupWorldAt(DAY_OPEN_TIME);
      const player = state.agents.find((a) => a.agentType === 'player')!;
      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;

      const originalPlayerBalance = player.balanceMinor;
      const originalRestaurantBalance = restaurant.balanceMinor;

      state.worldTime = '2026-09-14T17:00:00.000Z';
      transitionRestaurantOperationalState(state, RESTAURANT_ID, 'closed', state.worldTime);

      // Invariant: Balances untouched by business operational transition
      assert.equal(player.balanceMinor, originalPlayerBalance);
      assert.equal(restaurant.balanceMinor, originalRestaurantBalance);
    });

    test('operational transition does not alter agent activity states', () => {
      const { state } = setupWorldAt(DAY_OPEN_TIME);
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      devNpc.activityState = 'active';

      state.worldTime = '2026-09-14T17:00:00.000Z';
      transitionRestaurantOperationalState(state, RESTAURANT_ID, 'closed', state.worldTime);

      // Invariant: Activity state belongs to Activity/Agent, not Business
      assert.equal(devNpc.activityState, 'active');
    });

    test('operational transition does not inject or mutate agent knowledge', () => {
      const { state } = setupWorldAt(DAY_OPEN_TIME);
      const initialKnowledgeCount = state.knowledge.length;

      state.worldTime = '2026-09-14T17:00:00.000Z';
      transitionRestaurantOperationalState(state, RESTAURANT_ID, 'closed', state.worldTime);

      // Invariant: Business facts do not automatically become knowledge
      assert.equal(state.knowledge.length, initialKnowledgeCount);
    });
  });

  describe('5. Cross-Domain Interaction Preconditions', () => {
    test('enterRestaurant is rejected when restaurant is closed', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const player = state.agents.find((a) => a.agentType === 'player')!;
      player.locationId = 'building:development-building';

      const result = enterRestaurant(state, player.id, RESTAURANT_ID);
      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-closed');
      assert.equal(player.locationId, 'building:development-building'); // Not moved
    });

    test('enterRestaurant succeeds when restaurant is open', () => {
      const { state } = setupWorldAt(DAY_OPEN_TIME);
      const player = state.agents.find((a) => a.agentType === 'player')!;
      player.locationId = 'building:development-building';

      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      restaurant.operationalState = 'open';
      restaurant.operationalSince = DAY_OPEN_TIME;

      const result = enterRestaurant(state, player.id, RESTAURANT_ID);
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(player.locationId, RESTAURANT_ID);
    });

    test('purchaseOffering is rejected when restaurant is closed', () => {
      const { state } = setupWorldAt(MORNING_CLOSED_TIME);
      const player = state.agents.find((a) => a.agentType === 'player')!;
      player.locationId = RESTAURANT_ID;

      const result = purchaseOffering(state, player.id, 'offering:development-coffee', RESTAURANT_ID);
      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-closed');
    });

    test('purchaseOffering succeeds when restaurant is open and terms are met', () => {
      const { state } = setupWorldAt(DAY_OPEN_TIME);
      const player = state.agents.find((a) => a.agentType === 'player')!;
      player.locationId = RESTAURANT_ID;
      player.balanceMinor = 1000;

      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      restaurant.operationalState = 'open';
      restaurant.operationalSince = DAY_OPEN_TIME;

      const result = purchaseOffering(state, player.id, 'offering:development-coffee', RESTAURANT_ID);
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(player.balanceMinor, 500);
      assert.equal(restaurant.balanceMinor, 500);
    });
  });

  describe('6. Simulation & Persistence Integration', () => {
    test('Simulation.tick executes business operational transition deterministically', () => {
      const clock = WorldClock.create('2026-09-14T08:55:00.000Z'); // 5 minutes before opening
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      const restaurant = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      assert.equal(restaurant.operationalState, 'closed');

      // Advance clock 10 minutes forward -> crosses 09:00 opening boundary
      clock.advance(10 * 60 * 1000);
      const tickResult = sim.tick();
      assert.equal(restaurant.operationalState, 'open');
      assert.equal(restaurant.operationalSince, '2026-09-14T09:05:00.000Z');

      const restaurantTrans = tickResult.restaurantTransitions.find(
        (rt) => rt.restaurantId === RESTAURANT_ID
      )!;
      assert.equal(restaurantTrans.changed, true);
      assert.equal(restaurantTrans.previousState, 'closed');
      assert.equal(restaurantTrans.newState, 'open');
    });

    test('WorldState with business transitions survives persistence save and reconstruction', () => {
      const tempPath = join(tmpdir(), `business-auth-test-${Date.now()}.json`);
      try {
        const { state } = setupWorldAt(DAY_OPEN_TIME);
        state.restaurants[0].operationalState = 'open';
        state.restaurants[0].operationalSince = DAY_OPEN_TIME;

        const persistence = new LocalFilePersistence(tempPath);
        persistence.save(state);

        const loadedState = persistence.load();
        assert.ok(loadedState);
        assert.equal(loadedState.restaurants[0].operationalState, 'open');
        assert.equal(loadedState.restaurants[0].operationalSince, DAY_OPEN_TIME);
        assert.doesNotThrow(() => validateWorldState(loadedState));
      } finally {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      }
    });
  });
});
