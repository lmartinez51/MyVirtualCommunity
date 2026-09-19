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
  exitRestaurant,
  inspectCurrentLocation,
  greetAgent,
  snapshotWorldState,
  validateWorldState,
  WorldState,
} from '../src/core/world-state.js';
import {
  Simulation,
  evaluateDevelopmentNpcLocationRule,
  evaluateDevelopmentActivityRule,
} from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 15: Deterministic NPC Spatial Routine', () => {
  // =========================================================================
  // 1. Concrete Deterministic Rule Boundaries
  // =========================================================================
  describe('evaluateDevelopmentNpcLocationRule Boundaries', () => {
    test('evaluates exact [09:00, 17:00) UTC interval boundaries', () => {
      // 08:29:59.999 UTC -> residence
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T08:29:59.999Z'),
        'building:development-residence'
      );

      // 08:30:00.000 UTC -> development-street
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T08:30:00.000Z'),
        'street:development-street'
      );

      // 08:59:59.999 UTC -> development-street
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T08:59:59.999Z'),
        'street:development-street'
      );

      // 09:00:00.000 UTC -> restaurant (active window begins)
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T09:00:00.000Z'),
        'restaurant:development-restaurant'
      );

      // 12:00:00.000 UTC -> restaurant (midday active window)
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T12:00:00.000Z'),
        'restaurant:development-restaurant'
      );

      // 16:59:59.999 UTC -> restaurant (last millisecond of active window)
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T16:59:59.999Z'),
        'restaurant:development-restaurant'
      );

      // 17:00:00.000 UTC -> avenida-juarez (closing boundary)
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T17:00:00.000Z'),
        'street:avenida-juarez'
      );

      // 20:29:59.999 UTC -> avenida-juarez
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T20:29:59.999Z'),
        'street:avenida-juarez'
      );

      // 20:30:00.000 UTC -> residence
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T20:30:00.000Z'),
        'building:development-residence'
      );

      // 23:00:00.000 UTC -> residence (night idle window)
      assert.equal(
        evaluateDevelopmentNpcLocationRule('2026-09-14T23:00:00.000Z'),
        'building:development-residence'
      );
    });

    test('respects custom active intervals when provided', () => {
      const customInterval = { startHourUtc: 10, endHourUtc: 14 };

      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T09:30:00.000Z', customInterval),
        false
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T10:00:00.000Z', customInterval),
        true
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T13:59:59.999Z', customInterval),
        true
      );
      assert.equal(
        evaluateDevelopmentActivityRule('2026-09-14T14:00:00.000Z', customInterval),
        false
      );
    });
  });

  // =========================================================================
  // 2. Simulation Tick Transitions
  // =========================================================================
  describe('Simulation.tick() NPC Location Routine', () => {
    test('initial state at 08:00 UTC places NPC at residence', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      assert.equal(npc.locationId, 'building:development-residence');
      assert.equal(npc.activityState, 'idle');
    });

    test('tick at 09:00 UTC transitions NPC from residence to restaurant with changed: true', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // Advance to 09:00 UTC
      clock.advance(60 * 60_000);
      const tickResult = sim.tick();

      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'restaurant:development-restaurant');
      assert.equal(npc.activityState, 'active');

      const locationTransition = tickResult.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(locationTransition);
      assert.equal(locationTransition.previousLocationId, 'building:development-residence');
      assert.equal(locationTransition.newLocationId, 'restaurant:development-restaurant');
      assert.equal(locationTransition.changed, true);
    });

    test('subsequent ticks within active window report changed: false and preserve location', () => {
      const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // First tick at 09:00 UTC transitions NPC to restaurant
      sim.tick();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'restaurant:development-restaurant');

      // Advance by 30 minutes (09:30 UTC)
      clock.advance(30 * 60_000);
      const secondTick = sim.tick();

      assert.equal(npc.locationId, 'restaurant:development-restaurant');
      const secondTransition = secondTick.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(secondTransition);
      assert.equal(secondTransition.previousLocationId, 'restaurant:development-restaurant');
      assert.equal(secondTransition.newLocationId, 'restaurant:development-restaurant');
      assert.equal(secondTransition.changed, false);
    });

    test('tick at 17:00 UTC transitions NPC from restaurant to Avenida Juárez with changed: true', () => {
      const clock = WorldClock.create('2026-09-14T09:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // Tick at 09:00 UTC (NPC enters restaurant)
      sim.tick();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'restaurant:development-restaurant');

      // Advance 8 hours to 17:00 UTC (closing time)
      clock.advance(8 * 3600_000);
      const closeTick = sim.tick();

      assert.equal(npc.locationId, 'street:avenida-juarez');
      assert.equal(npc.activityState, 'idle');

      const closeTransition = closeTick.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(closeTransition);
      assert.equal(closeTransition.previousLocationId, 'restaurant:development-restaurant');
      assert.equal(closeTransition.newLocationId, 'street:avenida-juarez');
      assert.equal(closeTransition.changed, true);
    });

    test('subsequent ticks in idle window report changed: false and preserve Avenida Juárez location', () => {
      const clock = WorldClock.create('2026-09-14T17:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // First tick at 17:00 UTC
      sim.tick();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'street:avenida-juarez');

      // Advance by 1 hour to 18:00 UTC
      clock.advance(3600_000);
      const nightTick = sim.tick();

      assert.equal(npc.locationId, 'street:avenida-juarez');
      const nightTransition = nightTick.npcLocationTransitions?.find(
        (t) => t.agentId === 'agent:dev-npc'
      );
      assert.ok(nightTransition);
      assert.equal(nightTransition.previousLocationId, 'street:avenida-juarez');
      assert.equal(nightTransition.newLocationId, 'street:avenida-juarez');
      assert.equal(nightTransition.changed, false);
    });
  });

  // =========================================================================
  // 3. Player Isolation Invariant
  // =========================================================================
  describe('Player Isolation Invariant', () => {
    test('simulation tick never modifies player location regardless of time of day', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'building:development-building');

      // Tick at 08:00 UTC
      sim.tick();
      assert.equal(player.locationId, 'building:development-building');

      // Advance to 09:00 UTC (NPC moves to restaurant, player remains at building)
      clock.advance(3600_000);
      sim.tick();
      assert.equal(player.locationId, 'building:development-building');

      // Move player into restaurant manually
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });
      assert.equal(player.locationId, 'restaurant:development-restaurant');

      // Advance to 17:00 UTC (closing time: NPC moves to Avenida Juárez, player remains where they were)
      clock.advance(8 * 3600_000);
      sim.tick();
      assert.equal(player.locationId, 'restaurant:development-restaurant');

      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'street:avenida-juarez');
    });
  });

  // =========================================================================
  // 4. Spatial Integrity & Safety Against Invalid Target
  // =========================================================================
  describe('Spatial Integrity Guard', () => {
    test('preserves existing location and emits changed: false if target location does not exist', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'building:development-residence');

      // Temporarily remove restaurant:development-restaurant from restaurants to test defensive safety
      const removedRestaurant = state.restaurants.pop()!;

      try {
        const sim = new Simulation(clock, state, { silent: true });
        clock.advance(3600_000); // 09:00 UTC
        const tickResult = sim.tick();

        // NPC location must remain untouched
        assert.equal(npc.locationId, 'building:development-residence');
        const transition = tickResult.npcLocationTransitions?.find(
          (t) => t.agentId === 'agent:dev-npc'
        );
        assert.ok(transition);
        assert.equal(transition.previousLocationId, 'building:development-residence');
        assert.equal(transition.newLocationId, 'building:development-residence');
        assert.equal(transition.changed, false);
      } finally {
        state.restaurants.push(removedRestaurant);
      }
    });
  });

  // =========================================================================
  // 5. Dynamic World Perception Integration (Milestone 12)
  // =========================================================================
  describe('Dynamic World Perception Integration (inspectCurrentLocation)', () => {
    test('NPC presence is dynamically observable inside restaurant at 09:00+ and absent at 17:00+', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // At 08:00 UTC: Player visits residence and sees NPC at residence
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-residence');
      const buildingInspectBefore = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(buildingInspectBefore.success, true);
      assert.equal(
        buildingInspectBefore.location?.agents.some((a) => a.id === 'agent:dev-npc'),
        true
      );

      // Advance to 09:00 UTC & tick (restaurant opens, NPC enters)
      clock.advance(3600_000);
      sim.tick();

      // Player at residence: NPC is no longer at residence
      const buildingInspectAfter = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(buildingInspectAfter.success, true);
      assert.equal(
        buildingInspectAfter.location?.agents.some((a) => a.id === 'agent:dev-npc'),
        false
      );

      // Player transitions to building and enters restaurant
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-building');
      const enterRes = enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });
      assert.equal(enterRes.success, true);

      // Player inspects restaurant: NPC is observed inside!
      const restaurantInspectOpen = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(restaurantInspectOpen.success, true);
      assert.equal(restaurantInspectOpen.location?.type, 'restaurant');
      const observedNpc = restaurantInspectOpen.location?.agents.find((a) => a.id === 'agent:dev-npc');
      assert.ok(observedNpc);
      assert.equal(observedNpc.name, 'Development NPC');
      assert.equal(observedNpc.agentType, 'npc');

      // Advance to 17:00 UTC & tick (restaurant closes, NPC leaves for Avenida Juárez)
      clock.advance(8 * 3600_000);
      sim.tick();

      // Player inspects restaurant: NPC is gone
      const restaurantInspectClosed = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(restaurantInspectClosed.success, true);
      assert.equal(
        restaurantInspectClosed.location?.agents.some((a) => a.id === 'agent:dev-npc'),
        false
      );

      // Player transitions to Avenida Juárez: NPC is observed on Avenida Juárez!
      transitionAgentLocation(state, 'agent:dev-player', 'street:avenida-juarez');
      const juarezInspect = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(juarezInspect.success, true);
      assert.equal(
        juarezInspect.location?.agents.some((a) => a.id === 'agent:dev-npc'),
        true
      );
    });
  });

  // =========================================================================
  // 6. Dynamic Agent Greeting Integration (Milestone 11)
  // =========================================================================
  describe('Dynamic Agent Greeting Integration (greetAgent)', () => {
    test('greeting succeeds at restaurant during business hours and rejects when separated', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // 08:00 UTC: Co-locate player at residence -> greeting succeeds
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-residence');
      const greetMorning = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(greetMorning.success, true);
      assert.equal(greetMorning.code, 'success');

      // 09:00 UTC: Tick moves NPC to restaurant
      clock.advance(3600_000);
      sim.tick();

      // Player at residence, NPC at restaurant -> greeting fails with agents-not-co-located
      const greetSeparated = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(greetSeparated.success, false);
      assert.equal(greetSeparated.code, 'agents-not-co-located');

      // Player transitions to building and enters restaurant -> co-located inside restaurant -> greeting succeeds!
      transitionAgentLocation(state, 'agent:dev-player', 'building:development-building');
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant', { silent: true });
      const greetInside = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(greetInside.success, true);
      assert.equal(greetInside.code, 'success');

      // 17:00 UTC: Tick moves NPC to Avenida Juárez
      clock.advance(8 * 3600_000);
      sim.tick();

      // Player at restaurant, NPC at Avenida Juárez -> greeting fails
      const greetEveningSeparated = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(greetEveningSeparated.success, false);
      assert.equal(greetEveningSeparated.code, 'agents-not-co-located');

      // Player transitions to Avenida Juárez -> greeting succeeds again at Avenida Juárez
      transitionAgentLocation(state, 'agent:dev-player', 'street:avenida-juarez');
      const greetEveningHome = greetAgent(state, 'agent:dev-player', 'agent:dev-npc');
      assert.equal(greetEveningHome.success, true);
      assert.equal(greetEveningHome.code, 'success');
    });
  });

  // =========================================================================
  // 7. Persistence Roundtrip & Schema v10 Preservation
  // =========================================================================
  describe('Persistence Roundtrip & Schema Preservation', () => {
    test('persists NPC location at restaurant cleanly with Schema Version 10 and restores across sessions', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-m15-npc-routine-'));
      const testFile = join(tmpDir, 'world-state.json');

      try {
        // --- SESSION A ---
        const clockA = WorldClock.create('2026-09-14T08:00:00.000Z');
        const stateA = createInitialWorldState(clockA);
        const simA = new Simulation(clockA, stateA, { silent: true });

        // Advance to 09:00 UTC and tick: NPC moves to restaurant
        clockA.advance(3600_000);
        simA.tick();
        const npcA = stateA.agents.find((a) => a.id === 'agent:dev-npc')!;
        assert.equal(npcA.locationId, 'restaurant:development-restaurant');

        // Persist to disk
        const persistenceA = new LocalFilePersistence(testFile);
        persistenceA.save(snapshotWorldState(clockA, stateA));

        // --- SESSION B (Fresh runtime process) ---
        const persistenceB = new LocalFilePersistence(testFile);
        const stateB = persistenceB.load();
        assert.ok(stateB !== null);
        assert.doesNotThrow(() => validateWorldState(stateB));
        assert.equal(stateB.version, 13, 'Schema version strictly preserved at 13');

        const npcB = stateB.agents.find((a) => a.id === 'agent:dev-npc')!;
        assert.equal(npcB.locationId, 'restaurant:development-restaurant');
        assert.equal(npcB.activityState, 'active');

        // Continue simulation in Session B: advance to 17:00 UTC and tick
        const clockB = WorldClock.create(stateB.worldTime);
        const simB = new Simulation(clockB, stateB, { silent: true });

        clockB.advance(8 * 3600_000);
        simB.tick();

        assert.equal(npcB.locationId, 'street:avenida-juarez');
        assert.equal(npcB.activityState, 'idle');

        // Snapshot and re-validate
        const snapshotB = snapshotWorldState(clockB, stateB);
        assert.doesNotThrow(() => validateWorldState(snapshotB));
        assert.equal(snapshotB.version, 13);
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });
});
