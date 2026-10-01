import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  validateWorldState,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  deriveNpcBehavioralState,
  deriveNpcRoutineAction,
} from '../src/core/npc-behavior.js';

describe('Milestone 63: Simulation Routine Execution Integration', () => {
  // Morning 08:00 AM local Juarez time (14:00 UTC) -> Resting at home
  const MORNING_REST_TIME = '2026-09-14T14:00:00.000Z';
  // Commute 08:45 AM local Juarez time (14:45 UTC) -> Commuting to work
  const COMMUTE_TIME = '2026-09-14T14:45:00.000Z';
  // Work shift 09:30 AM local Juarez time (15:30 UTC) -> Working at restaurant
  const WORK_SHIFT_TIME = '2026-09-14T15:30:00.000Z';
  // Evening promenade 18:00 PM local Juarez time (00:00 UTC next day) -> Promenading on Avenida Juárez
  const PROMENADE_TIME = '2026-09-15T00:00:00.000Z';
  // Night rest 21:00 PM local Juarez time (03:00 UTC next day) -> Resting at home
  const NIGHT_REST_TIME = '2026-09-15T03:00:00.000Z';

  function setupSimulation(timeIso: string = MORNING_REST_TIME) {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    return { clock, state, sim };
  }

  // =========================================================================
  // A. Simulation.tick() Routine Execution Pipeline
  // =========================================================================
  describe('A. Simulation.tick() Routine Execution Pipeline', () => {
    it('executes full daily routine cycle via Simulation.tick() delegating to M61/M62 and Spatial Authority', () => {
      const { clock, state, sim } = setupSimulation(MORNING_REST_TIME);
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // 1. Initial tick at 08:00: already at residence
      const tick1 = sim.tick();
      assert.equal(devNpc.locationId, 'building:development-residence');
      const locTrans1 = tick1.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans1);
      assert.equal(locTrans1.previousLocationId, 'building:development-residence');
      assert.equal(locTrans1.newLocationId, 'building:development-residence');
      assert.equal(locTrans1.changed, false);

      // 2. Advance to 08:45 (commute to work)
      clock.advance(45 * 60_000);
      const tick2 = sim.tick();
      assert.equal(devNpc.locationId, 'street:development-street');
      const locTrans2 = tick2.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans2);
      assert.equal(locTrans2.previousLocationId, 'building:development-residence');
      assert.equal(locTrans2.newLocationId, 'street:development-street');
      assert.equal(locTrans2.changed, true);

      // Verify M61/M62 state aligns with world location
      const behavioral2 = deriveNpcBehavioralState(state, devNpc.id)!;
      assert.equal(behavioral2.routinePhase, 'commuting');
      const action2 = deriveNpcRoutineAction(state, devNpc.id)!;
      assert.equal(action2.actionType, 'commute-to-work');
      assert.equal(action2.targetLocationId, 'street:development-street');
      assert.equal(action2.requiresMovement, false); // Already arrived

      // 3. Advance to 09:30 (work at restaurant)
      clock.advance(45 * 60_000);
      const tick3 = sim.tick();
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      const locTrans3 = tick3.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans3);
      assert.equal(locTrans3.previousLocationId, 'street:development-street');
      assert.equal(locTrans3.newLocationId, 'restaurant:development-restaurant');
      assert.equal(locTrans3.changed, true);

      // 4. Subsequent tick during work shift reports changed: false
      clock.advance(60 * 60_000); // 10:30
      const tick4 = sim.tick();
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');
      const locTrans4 = tick4.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans4);
      assert.equal(locTrans4.previousLocationId, 'restaurant:development-restaurant');
      assert.equal(locTrans4.newLocationId, 'restaurant:development-restaurant');
      assert.equal(locTrans4.changed, false);

      // 5. Advance to 18:00 (evening promenade)
      clock.advance(7 * 3600_000 + 30 * 60_000); // 18:00
      const tick5 = sim.tick();
      assert.equal(devNpc.locationId, 'street:avenida-juarez');
      const locTrans5 = tick5.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans5);
      assert.equal(locTrans5.previousLocationId, 'restaurant:development-restaurant');
      assert.equal(locTrans5.newLocationId, 'street:avenida-juarez');
      assert.equal(locTrans5.changed, true);

      // 6. Advance to 21:00 (return home to rest)
      clock.advance(3 * 3600_000); // 21:00
      const tick6 = sim.tick();
      assert.equal(devNpc.locationId, 'building:development-residence');
      const locTrans6 = tick6.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans6);
      assert.equal(locTrans6.previousLocationId, 'street:avenida-juarez');
      assert.equal(locTrans6.newLocationId, 'building:development-residence');
      assert.equal(locTrans6.changed, true);
    });
  });

  // =========================================================================
  // B. Large Time Advancement (Offline Simulation Continuity)
  // =========================================================================
  describe('B. Large Time Advancement (Offline Simulation Continuity)', () => {
    it('resolves directly to evening destination after a 10-hour leap without intermediate ticks', () => {
      const { clock, state, sim } = setupSimulation(MORNING_REST_TIME); // 08:00
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      sim.tick();
      assert.equal(devNpc.locationId, 'building:development-residence');

      // Leap 10 hours directly to 18:00 (promenading phase)
      clock.advance(10 * 3600_000);
      const tickResult = sim.tick();

      // NPC directly transitions from residence to Avenida Juárez in a single tick
      assert.equal(devNpc.locationId, 'street:avenida-juarez');
      const locTrans = tickResult.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans);
      assert.equal(locTrans.previousLocationId, 'building:development-residence');
      assert.equal(locTrans.newLocationId, 'street:avenida-juarez');
      assert.equal(locTrans.changed, true);

      // Derived M61/M62 state correctly matches current world time
      const behavioral = deriveNpcBehavioralState(state, devNpc.id)!;
      assert.equal(behavioral.routinePhase, 'promenading');
      assert.equal(behavioral.intent, 'walk_neighborhood');
    });

    it('resolves directly to night rest destination after a 13-hour leap without intermediate ticks', () => {
      const { clock, state, sim } = setupSimulation(COMMUTE_TIME); // 08:45 (at street)
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      sim.tick();
      assert.equal(devNpc.locationId, 'street:development-street');

      // Leap 12 hours 15 minutes directly to 21:00 (night rest)
      clock.advance(12 * 3600_000 + 15 * 60_000);
      const tickResult = sim.tick();

      assert.equal(devNpc.locationId, 'building:development-residence');
      const locTrans = tickResult.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans);
      assert.equal(locTrans.previousLocationId, 'street:development-street');
      assert.equal(locTrans.newLocationId, 'building:development-residence');
      assert.equal(locTrans.changed, true);
    });
  });

  // =========================================================================
  // C. Spatial Authority & Non-Bypassing Verification
  // =========================================================================
  describe('C. Spatial Authority & Non-Bypassing Verification', () => {
    it('preserves existing location and reports changed: false if Spatial Authority transition fails', () => {
      const { clock, state, sim } = setupSimulation(WORK_SHIFT_TIME);
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      devNpc.locationId = 'building:development-residence';

      // Temporarily remove destination from world places/restaurants to simulate corrupted state
      const restaurantIndex = state.restaurants.findIndex(
        (r) => r.id === 'restaurant:development-restaurant'
      );
      const [removedRestaurant] = state.restaurants.splice(restaurantIndex, 1);

      // Tick should fail safely through Spatial Authority, preserving residence
      const tickResult = sim.tick();
      assert.equal(devNpc.locationId, 'building:development-residence');

      const locTrans = tickResult.npcLocationTransitions.find((t) => t.agentId === devNpc.id);
      assert.ok(locTrans);
      assert.equal(locTrans.previousLocationId, 'building:development-residence');
      assert.equal(locTrans.newLocationId, 'building:development-residence');
      assert.equal(locTrans.changed, false);

      // Restore restaurant
      state.restaurants.splice(restaurantIndex, 0, removedRestaurant);
    });
  });

  // =========================================================================
  // D. Preservation of Unrelated Simulation Consequence Invariants
  // =========================================================================
  describe('D. Preservation of Unrelated Simulation Consequence Invariants', () => {
    it('preserves activityState, restaurant operations, and closure-egress processing', () => {
      const { clock, state, sim } = setupSimulation(WORK_SHIFT_TIME);
      const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      const devRestaurant = state.restaurants.find(
        (r) => r.id === 'restaurant:development-restaurant'
      )!;

      const tickResult = sim.tick();

      // NPC activity state is updated according to work schedule
      assert.equal(devNpc.activityState, 'active');
      assert.equal(devNpc.locationId, 'restaurant:development-restaurant');

      // Restaurant operational transitions are evaluated and preserved
      assert.equal(devRestaurant.operationalState, 'open');
      const restTrans = tickResult.restaurantTransitions.find(
        (r) => r.restaurantId === devRestaurant.id
      );
      assert.ok(restTrans);

      // World state schema version remains strictly 18
      assert.equal(CURRENT_WORLD_STATE_VERSION, 18);
      assert.equal(state.version, 18);
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });
});
