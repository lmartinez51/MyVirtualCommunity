import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  transitionAgentLocation,
  enterRestaurant,
  inspectCurrentLocation,
  greetAgent,
  snapshotWorldState,
  validateWorldState,
  CURRENT_WORLD_STATE_VERSION,
  WorldState,
} from '../src/core/world-state.js';
import {
  Simulation,
  evaluateDevelopmentNpcLocationRule,
  evaluateDevelopmentActivityRule,
} from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 22: Multi-Phase Deterministic NPC Neighborhood Routine & Contextual Encounters', () => {
  // =========================================================================
  // 1. Exact Phase Interval Boundaries (Millisecond Precision)
  // =========================================================================
  describe('Phase Interval Boundaries (Millisecond Precision)', () => {
    test('08:29:59.999 UTC evaluates to building:development-residence (home/rest)', () => {
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T08:29:59.999Z', 'UTC'),
        'building:development-residence'
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T08:29:59.999Z', 'UTC'),
        false
      );
    });

    test('08:30:00.000 UTC evaluates to street:development-street (morning commute)', () => {
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T08:30:00.000Z', 'UTC'),
        'street:development-street'
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T08:30:00.000Z', 'UTC'),
        false
      );
    });

    test('08:59:59.999 UTC evaluates to street:development-street (morning commute)', () => {
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T08:59:59.999Z', 'UTC'),
        'street:development-street'
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T08:59:59.999Z', 'UTC'),
        false
      );
    });

    test('09:00:00.000 UTC evaluates to restaurant:development-restaurant (work shift)', () => {
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T09:00:00.000Z', 'UTC'),
        'restaurant:development-restaurant'
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T09:00:00.000Z', 'UTC'),
        true
      );
    });

    test('16:59:59.999 UTC evaluates to restaurant:development-restaurant (work shift)', () => {
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T16:59:59.999Z', 'UTC'),
        'restaurant:development-restaurant'
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T16:59:59.999Z', 'UTC'),
        true
      );
    });

    test('17:00:00.000 UTC evaluates to street:avenida-juarez (evening promenade)', () => {
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T17:00:00.000Z', 'UTC'),
        'street:avenida-juarez'
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T17:00:00.000Z', 'UTC'),
        false
      );
    });

    test('20:29:59.999 UTC evaluates to street:avenida-juarez (evening promenade)', () => {
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T20:29:59.999Z', 'UTC'),
        'street:avenida-juarez'
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T20:29:59.999Z', 'UTC'),
        false
      );
    });

    test('20:30:00.000 UTC evaluates to building:development-residence (home/night)', () => {
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T20:30:00.000Z', 'UTC'),
        'building:development-residence'
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T20:30:00.000Z', 'UTC'),
        false
      );
    });

    test('23:59:59.999 UTC evaluates to building:development-residence (home/night)', () => {
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T23:59:59.999Z', 'UTC'),
        'building:development-residence'
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T23:59:59.999Z', 'UTC'),
        false
      );
    });
  });

  // =========================================================================
  // 2. Full 24-Hour Multi-Tick Cycle & Transition Events
  // =========================================================================
  describe('Full 24-Hour Multi-Tick Cycle', () => {
    test('simulation accurately executes complete 24-hour routine cycle', () => {
      const clock = WorldClock.create('2026-09-14T06:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // 00:00 - At residence, idle
      sim.tick();
      assert.equal(npc.locationId, 'building:development-residence');
      assert.equal(npc.activityState, 'idle');

      // Advance to 08:30:00.000 Local (14:30:00.000Z) (Commute begins)
      clock.advance(8 * 3600_000 + 30 * 60_000);
      const tickCommute = sim.tick();
      assert.equal(npc.locationId, 'street:development-street');
      assert.equal(npc.activityState, 'idle');
      const commuteTransition = tickCommute.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(commuteTransition);
      assert.equal(commuteTransition.previousLocationId, 'building:development-residence');
      assert.equal(commuteTransition.newLocationId, 'street:development-street');
      assert.equal(commuteTransition.changed, true);

      // Advance to 09:00:00.000 Local (15:00:00.000Z) (Work begins)
      clock.advance(30 * 60_000);
      const tickWork = sim.tick();
      assert.equal(npc.locationId, 'restaurant:development-restaurant');
      assert.equal(npc.activityState, 'active');
      const workTransition = tickWork.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(workTransition);
      assert.equal(workTransition.previousLocationId, 'street:development-street');
      assert.equal(workTransition.newLocationId, 'restaurant:development-restaurant');
      assert.equal(workTransition.changed, true);

      // Advance to 13:00:00.000 Local (19:00:00.000Z) (Mid-shift tick)
      clock.advance(4 * 3600_000);
      const tickMid = sim.tick();
      assert.equal(npc.locationId, 'restaurant:development-restaurant');
      assert.equal(npc.activityState, 'active');
      const midTransition = tickMid.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(midTransition);
      assert.equal(midTransition.changed, false);

      // Advance to 17:00:00.000 Local (23:00:00.000Z) (Evening promenade begins)
      clock.advance(4 * 3600_000);
      const tickEvening = sim.tick();
      assert.equal(npc.locationId, 'street:avenida-juarez');
      assert.equal(npc.activityState, 'idle');
      const eveningTransition = tickEvening.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(eveningTransition);
      assert.equal(eveningTransition.previousLocationId, 'restaurant:development-restaurant');
      assert.equal(eveningTransition.newLocationId, 'street:avenida-juarez');
      assert.equal(eveningTransition.changed, true);

      // Advance to 20:30:00.000 Local (Return home)
      clock.advance(3 * 3600_000 + 30 * 60_000);
      const tickHome = sim.tick();
      assert.equal(npc.locationId, 'building:development-residence');
      assert.equal(npc.activityState, 'idle');
      const homeTransition = tickHome.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(homeTransition);
      assert.equal(homeTransition.previousLocationId, 'street:avenida-juarez');
      assert.equal(homeTransition.newLocationId, 'building:development-residence');
      assert.equal(homeTransition.changed, true);

      // Advance to 23:30:00.000 Local (Night at home)
      clock.advance(3 * 3600_000);
      const tickNight = sim.tick();
      assert.equal(npc.locationId, 'building:development-residence');
      assert.equal(npc.activityState, 'idle');
      const nightTransition = tickNight.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(nightTransition);
      assert.equal(nightTransition.changed, false);
    });
  });

  // =========================================================================
  // 3. Activity State vs Location Independence & activitySince Invariant
  // =========================================================================
  describe('activitySince Invariant Across Location Transitions', () => {
    test('activitySince changes ONLY when activityState changes, not on location movement', () => {
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      const initialActivitySince = npc.activitySince;
      assert.equal(npc.activityState, 'idle');

      // 1. Advance to 08:30 Local: NPC moves to street:development-street, but activity remains idle
      clock.advance(30 * 60_000);
      sim.tick();
      assert.equal(npc.locationId, 'street:development-street');
      assert.equal(npc.activityState, 'idle');
      assert.equal(
        npc.activitySince,
        initialActivitySince,
        'activitySince must NOT change during idle-to-idle location movement'
      );

      // 2. Advance to 09:00 Local: NPC moves to restaurant AND activity becomes active
      clock.advance(30 * 60_000);
      sim.tick();
      assert.equal(npc.locationId, 'restaurant:development-restaurant');
      assert.equal(npc.activityState, 'active');
      assert.equal(
        npc.activitySince,
        '2026-09-14T15:00:00.000Z',
        'activitySince MUST update when activityState changes to active'
      );

      // 3. Advance to 12:00 Local: NPC remains active at restaurant
      clock.advance(3 * 3600_000);
      sim.tick();
      assert.equal(
        npc.activitySince,
        '2026-09-14T15:00:00.000Z',
        'activitySince must remain unchanged while active state persists'
      );

      // 4. Advance to 17:00 Local: NPC moves to Avenida Juárez AND activity becomes idle
      clock.advance(5 * 3600_000);
      sim.tick();
      assert.equal(npc.locationId, 'street:avenida-juarez');
      assert.equal(npc.activityState, 'idle');
      assert.equal(
        npc.activitySince,
        '2026-09-14T23:00:00.000Z',
        'activitySince MUST update when activityState changes to idle'
      );

      // 5. Advance to 20:30 Local: NPC moves from Avenida Juárez to residence (idle to idle)
      clock.advance(3 * 3600_000 + 30 * 60_000);
      sim.tick();
      assert.equal(npc.locationId, 'building:development-residence');
      assert.equal(npc.activityState, 'idle');
      assert.equal(
        npc.activitySince,
        '2026-09-14T23:00:00.000Z',
        'activitySince must NOT change when moving between idle locations'
      );
    });
  });

  // =========================================================================
  // 4. M19 Offering Lifecycle Integration & Ordering
  // =========================================================================
  describe('Offering Lifecycle Integration & Temporal Ordering', () => {
    test('at 09:00 Local tick, offering becomes available when restaurant opens and NPC arrives', () => {
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // Before 09:00 Local, Pan Dulce is not in state.offerings
      assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), false);

      clock.advance(3600_000); // 09:00 Local (15:00 UTC)
      sim.tick();

      // At 09:00 Local, NPC arrives and makes Pan Dulce available
      const pastry = state.offerings.find((o) => o.id === 'offering:development-pastry');
      assert.ok(pastry);
      assert.equal(pastry.name, 'Pan Dulce');
      assert.equal(pastry.priceMinor, 250);
      assert.equal(pastry.currency, 'USD');
      assert.equal(state.restaurants[0].operationalState, 'open');
      assert.equal(state.agents[1].locationId, 'restaurant:development-restaurant');
      assert.equal(state.agents[1].activityState, 'active');
    });

    test('at 17:00 Local tick, offering is retired while NPC is at restaurant before moving to Avenida Juárez', () => {
      const clock = WorldClock.create('2026-09-14T15:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Open restaurant & make offering available

      assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), true);

      // Advance to 17:00 Local (23:00 UTC, closing time)
      clock.advance(8 * 3600_000);
      const tickResult = sim.tick();

      // Offering must be retired from state.offerings
      assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), false);

      // Restaurant is closed
      assert.equal(state.restaurants[0].operationalState, 'closed');

      // NPC has moved to Avenida Juárez and is idle
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'street:avenida-juarez');
      assert.equal(npc.activityState, 'idle');

      // Verification of tick result structures
      assert.ok(tickResult.offeringTransitions);
      const offeringAction = tickResult.offeringTransitions.find(
        (t) => t.offeringId === 'offering:development-pastry'
      );
      assert.ok(offeringAction);
      assert.equal(offeringAction.action, 'retired');
    });

    test('offline multi-hour skip across 17:00 retires offering and places NPC at correct phase location', () => {
      const clock = WorldClock.create('2026-09-14T18:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Active midday - offering made available
      assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), true);

      // Skip 7 hours to 19:00 Local (skipping 17:00 boundary in single tick)
      clock.advance(7 * 3600_000);
      sim.tick();

      // Pan Dulce retired
      assert.equal(state.offerings.some((o) => o.id === 'offering:development-pastry'), false);

      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'street:avenida-juarez');
      assert.equal(npc.activityState, 'idle');
    });
  });

  // =========================================================================
  // 5. Contextual Greetings Across All Routine Phases
  // =========================================================================
  describe('Contextual Greetings Across All Routine Phases', () => {
    test('NPC at restaurant:development-restaurant (active) returns "Welcome. I\'m working here today."', () => {
      const clock = WorldClock.create('2026-09-14T16:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      // Co-locate player in restaurant
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-building');
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(result.success, true);
      assert.equal(result.response, "Welcome. I'm working here today.");
    });

    test('NPC at building:development-residence (idle) returns "Hello. I\'m resting at home right now."', () => {
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const state = createInitialWorldState(clock);

      // Co-locate player at residence
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-residence');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(result.success, true);
      assert.equal(result.response, "Hello. I'm resting at home right now.");
    });

    test('NPC at street:development-street (idle) returns "Good morning. On my way to the restaurant."', () => {
      const clock = WorldClock.create('2026-09-14T14:45:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      // Co-locate player on Development Street
      transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(result.success, true);
      assert.equal(result.response, "Good morning. On my way to the restaurant.");
    });

    test('NPC at street:avenida-juarez (idle) returns "Good evening. It\'s pleasant to walk down Avenida Juárez after work."', () => {
      const clock = WorldClock.create('2026-09-15T00:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      // Co-locate player on Avenida Juárez
      transitionAgentLocation(state, 'agent:dev-player', 'street:avenida-juarez');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(result.success, true);
      assert.equal(
        result.response,
        "Good evening. It's pleasant to walk down Avenida Juárez after work."
      );
    });

    test('NPC at building:development-building (idle) returns "Hello. I\'m around the building today."', () => {
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const state = createInitialWorldState(clock);

      // Explicitly co-locate both at building:development-building
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-building');
      transitionAgentLocation(state, 'agent:dev-npc', 'building:development-building');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(result.success, true);
      assert.equal(result.response, "Hello. I'm around the building today.");
    });

    test('fallback returns "Hello there." when context does not match any specific rule', () => {
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const state = createInitialWorldState(clock);

      // Co-locate both at kiosk (no custom rule defined)
      transitionAgentLocation(state, 'agent:dev-player', 'building:avenida-juarez-kiosk');
      transitionAgentLocation(state, 'agent:dev-npc', 'building:avenida-juarez-kiosk');

      const result = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(result.success, true);
      assert.equal(result.response, 'Hello there.');
    });
  });

  // =========================================================================
  // 6. Dynamic World Perception Across All Routine Locations
  // =========================================================================
  describe('Dynamic World Perception Across All Routine Locations', () => {
    test('player perceives NPC at each scheduled location when co-located', () => {
      const clock = WorldClock.create('2026-09-14T13:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // Phase 1: 07:00 Local at residence
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-residence');
      const inspect1 = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspect1.success, true);
      assert.ok(inspect1.location?.agents.some((a) => a.id === 'agent:dev-npc'));

      // Phase 2: 08:35 Local on Development Street
      clock.advance(95 * 60_000);
      sim.tick();
      transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');
      const inspect2 = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspect2.success, true);
      assert.ok(inspect2.location?.agents.some((a) => a.id === 'agent:dev-npc'));

      // Phase 3: 11:00 Local inside Restaurant
      clock.advance(145 * 60_000);
      sim.tick();
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-building');
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });
      const inspect3 = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspect3.success, true);
      assert.ok(inspect3.location?.agents.some((a) => a.id === 'agent:dev-npc'));

      // Phase 4: 18:00 Local on Avenida Juárez
      clock.advance(7 * 3600_000);
      sim.tick();
      transitionAgentLocation(state, 'agent:dev-player', 'street:avenida-juarez');
      const inspect4 = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspect4.success, true);
      assert.ok(inspect4.location?.agents.some((a) => a.id === 'agent:dev-npc'));

      // Phase 5: 21:00 Local back at residence
      clock.advance(3 * 3600_000);
      sim.tick();
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-residence');
      const inspect5 = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspect5.success, true);
      assert.ok(inspect5.location?.agents.some((a) => a.id === 'agent:dev-npc'));
    });

    test('player does NOT perceive NPC when located at a different place', () => {
      const clock = WorldClock.create('2026-09-15T00:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // NPC is on Avenida Juárez

      // Player remains at development building
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-building');
      const inspect = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspect.success, true);
      assert.equal(
        inspect.location?.agents.some((a) => a.id === 'agent:dev-npc'),
        false
      );
    });
  });

  // =========================================================================
  // 7. Player Isolation Invariant
  // =========================================================================
  describe('Player Isolation Invariant', () => {
    test('simulation ticks across all phases never mutate player location, balances, or history', () => {
      const clock = WorldClock.create('2026-09-14T06:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const initialPlayerLocation = player.locationId;
      const initialBalances = JSON.stringify(player.balances);
      const initialHistoryCount = state.purchases.length;

      // Advance through multiple days
      for (let hour = 1; hour <= 48; hour++) {
        clock.advance(3600_000);
        sim.tick();

        assert.equal(player.locationId, initialPlayerLocation);
        assert.equal(JSON.stringify(player.balances), initialBalances);
        assert.equal(state.purchases.length, initialHistoryCount);
        assert.equal(player.agentType, 'player');
      }
    });
  });

  // =========================================================================
  // 8. Persistence Roundtrip & Schema Version 10 Invariant
  // =========================================================================
  describe('Persistence Roundtrip & Schema Version 10 Preservation', () => {
    test('persists NPC on Avenida Juárez and restores identically with Schema Version 10', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm22-persistence-'));
      const storagePath = join(tempDir, 'world-state.json');

      try {
        const clock = WorldClock.create('2026-09-15T00:00:00.000Z');
        const state = createInitialWorldState(clock);
        const sim = new Simulation(clock, state, { silent: true });
        sim.tick();

        const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
        assert.equal(npc.locationId, 'street:avenida-juarez');
        assert.equal(npc.activityState, 'idle');

        const persistence = new LocalFilePersistence(storagePath);
        await persistence.save(snapshotWorldState(clock, state));
        assert.ok(existsSync(storagePath));

        const loadedState = await persistence.load();
        assert.ok(loadedState !== null);
        assert.equal(loadedState.version, CURRENT_WORLD_STATE_VERSION);
        assert.equal(loadedState.version, 19);
        assert.doesNotThrow(() => validateWorldState(loadedState));

        const loadedNpc = loadedState.agents.find((a) => a.id === 'agent:dev-npc')!;
        assert.equal(loadedNpc.locationId, 'street:avenida-juarez');
        assert.equal(loadedNpc.activityState, 'idle');
        assert.equal(loadedNpc.activitySince, '2026-09-15T00:00:00.000Z');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('persists NPC during morning commute on Development Street and restores with Schema Version 10', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm22-commute-persistence-'));
      const storagePath = join(tempDir, 'world-state.json');

      try {
        const clock = WorldClock.create('2026-09-14T14:40:00.000Z');
        const state = createInitialWorldState(clock);
        const sim = new Simulation(clock, state, { silent: true });
        sim.tick();

        const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
        assert.equal(npc.locationId, 'street:development-street');

        const persistence = new LocalFilePersistence(storagePath);
        await persistence.save(snapshotWorldState(clock, state));

        const loadedState = await persistence.load();
        assert.ok(loadedState !== null);
        assert.equal(loadedState.version, 19);
        assert.doesNotThrow(() => validateWorldState(loadedState));

        const loadedNpc = loadedState.agents.find((a) => a.id === 'agent:dev-npc')!;
        assert.equal(loadedNpc.locationId, 'street:development-street');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
