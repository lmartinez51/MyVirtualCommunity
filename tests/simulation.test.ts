import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import { createInitialWorldState } from '../src/core/world-state.js';
import { Simulation, evaluateDevelopmentActivityRule } from '../src/core/simulation.js';

describe('Simulation', () => {
  test('evaluates exact [09:00, 17:00) UTC interval boundaries', () => {
    // 08:59 UTC -> IDLE
    assert.equal(evaluateDevelopmentActivityRule('2026-09-14T08:59:00.000Z', 'UTC'), false);
    assert.equal(evaluateDevelopmentActivityRule('2026-09-14T08:59:59.999Z', 'UTC'), false);

    // 09:00 UTC -> ACTIVE
    assert.equal(evaluateDevelopmentActivityRule('2026-09-14T09:00:00.000Z', 'UTC'), true);

    // 10:00 UTC -> ACTIVE
    assert.equal(evaluateDevelopmentActivityRule('2026-09-14T10:00:00.000Z', 'UTC'), true);

    // 16:59 UTC -> ACTIVE
    assert.equal(evaluateDevelopmentActivityRule('2026-09-14T16:59:59.999Z', 'UTC'), true);

    // 17:00 UTC -> IDLE
    assert.equal(evaluateDevelopmentActivityRule('2026-09-14T17:00:00.000Z', 'UTC'), false);
    assert.equal(evaluateDevelopmentActivityRule('2026-09-14T17:00:00.001Z', 'UTC'), false);
  });

  test('Simulation.tick() reads WorldClock without advancing it', () => {
    const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const beforeTime = clock.getTime();
    simulation.tick();
    const afterTime = clock.getTime();

    assert.equal(beforeTime, afterTime);
    assert.equal(clock.getTime(), '2026-09-14T14:00:00.000Z');
  });

  test('transitions NPC from IDLE to ACTIVE when entering active window', () => {
    const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
    assert.equal(npc.activityState, 'idle');
    const initialSince = npc.activitySince;

    // Advance clock to 09:00 local (15:00 UTC)
    clock.advance(3600_000); // 1 hour -> 15:00:00
    assert.equal(clock.getTime(), '2026-09-14T15:00:00.000Z');

    const result = simulation.tick();

    assert.equal(npc.activityState, 'active');
    assert.equal(npc.activitySince, '2026-09-14T15:00:00.000Z');
    assert.notEqual(npc.activitySince, initialSince);

    const transition = result.transitions.find((t) => t.agentId === 'agent:dev-npc');
    assert.ok(transition);
    assert.equal(transition.previousState, 'idle');
    assert.equal(transition.newState, 'active');
    assert.equal(transition.changed, true);
    assert.equal(transition.activitySince, '2026-09-14T15:00:00.000Z');
  });

  test('transitions NPC from ACTIVE to IDLE when exiting active window', () => {
    const clock = WorldClock.create('2026-09-14T16:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
    // Set to active first via tick at 10:00 local (16:00 UTC)
    simulation.tick();
    assert.equal(npc.activityState, 'active');
    assert.equal(npc.activitySince, '2026-09-14T16:00:00.000Z');

    // Advance clock to 17:00 local (23:00 UTC) (7 hours = 7 * 3600_000 ms)
    clock.advance(7 * 3600_000);
    assert.equal(clock.getTime(), '2026-09-14T23:00:00.000Z');

    const result = simulation.tick();

    assert.equal(npc.activityState, 'idle');
    assert.equal(npc.activitySince, '2026-09-14T23:00:00.000Z');

    const transition = result.transitions.find((t) => t.agentId === 'agent:dev-npc');
    assert.ok(transition);
    assert.equal(transition.previousState, 'active');
    assert.equal(transition.newState, 'idle');
    assert.equal(transition.changed, true);
  });

  test('repeated ticks within the same state preserve activitySince and report changed: false', () => {
    const clock = WorldClock.create('2026-09-14T16:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

    // First tick transitions IDLE -> ACTIVE at 10:00 local (16:00 UTC)
    simulation.tick();
    assert.equal(npc.activityState, 'active');
    assert.equal(npc.activitySince, '2026-09-14T16:00:00.000Z');

    // Advance clock by 15 minutes (still in active window)
    clock.advance(15 * 60_000);
    assert.equal(clock.getTime(), '2026-09-14T16:15:00.000Z');

    // Second tick: should remain ACTIVE without changing activitySince
    const secondResult = simulation.tick();

    assert.equal(npc.activityState, 'active');
    assert.equal(npc.activitySince, '2026-09-14T16:00:00.000Z'); // Preserved!

    const transition = secondResult.transitions.find((t) => t.agentId === 'agent:dev-npc');
    assert.ok(transition);
    assert.equal(transition.previousState, 'active');
    assert.equal(transition.newState, 'active');
    assert.equal(transition.changed, false);
    assert.equal(transition.activitySince, '2026-09-14T16:00:00.000Z');
  });

  test('simulation isolates Player agents and does not mutate their activity state', () => {
    const clock = WorldClock.create('2026-09-14T14:00:00.000Z'); // Inactive hour for NPCs
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    assert.equal(player.activityState, 'active');
    const playerSince = player.activitySince;

    simulation.tick();

    assert.equal(player.activityState, 'active');
    assert.equal(player.activitySince, playerSince);
  });

  test('simulation isolates Player location and updates NPC location according to M15 routine', () => {
    const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

    const playerLocBefore = player.locationId;

    // Tick at 08:00 local (14:00 UTC) (idle window: NPC remains at residence)
    simulation.tick();
    assert.equal(player.locationId, playerLocBefore);
    assert.equal(npc.locationId, 'building:development-residence');

    // Advance to 10:00 local (16:00 UTC) and tick (active window: NPC transitions to restaurant, player location isolated)
    clock.advance(2 * 3600_000);
    simulation.tick();
    assert.equal(player.locationId, playerLocBefore);
    assert.equal(npc.locationId, 'restaurant:development-restaurant');
  });

  test('transitions restaurant from CLOSED to OPEN when entering active window', () => {
    const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
    assert.equal(restaurant.operationalState, 'closed');
    const initialSince = restaurant.operationalSince;

    // Advance to 09:00 local (15:00 UTC)
    clock.advance(3600_000);
    assert.equal(clock.getTime(), '2026-09-14T15:00:00.000Z');

    const result = simulation.tick();

    assert.equal(restaurant.operationalState, 'open');
    assert.equal(restaurant.operationalSince, '2026-09-14T15:00:00.000Z');
    assert.notEqual(restaurant.operationalSince, initialSince);

    const transition = result.restaurantTransitions.find(
      (t) => t.restaurantId === 'restaurant:development-restaurant'
    );
    assert.ok(transition);
    assert.equal(transition.previousState, 'closed');
    assert.equal(transition.newState, 'open');
    assert.equal(transition.changed, true);
    assert.equal(transition.operationalSince, '2026-09-14T15:00:00.000Z');
  });

  test('transitions restaurant from OPEN to CLOSED when exiting active window', () => {
    const clock = WorldClock.create('2026-09-14T16:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
    assert.equal(restaurant.operationalState, 'open');

    // Advance clock to 17:00 local (23:00 UTC) (7 hours)
    clock.advance(7 * 3600_000);
    assert.equal(clock.getTime(), '2026-09-14T23:00:00.000Z');

    const result = simulation.tick();

    assert.equal(restaurant.operationalState, 'closed');
    assert.equal(restaurant.operationalSince, '2026-09-14T23:00:00.000Z');

    const transition = result.restaurantTransitions.find(
      (t) => t.restaurantId === 'restaurant:development-restaurant'
    );
    assert.ok(transition);
    assert.equal(transition.previousState, 'open');
    assert.equal(transition.newState, 'closed');
    assert.equal(transition.changed, true);
    assert.equal(transition.operationalSince, '2026-09-14T23:00:00.000Z');
  });

  test('repeated ticks within the same restaurant state preserve operationalSince and report changed: false', () => {
    const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;

    // Transition closed -> open at 09:00 local (15:00 UTC)
    clock.advance(3600_000);
    simulation.tick();
    assert.equal(restaurant.operationalState, 'open');
    assert.equal(restaurant.operationalSince, '2026-09-14T15:00:00.000Z');

    // Advance 15 minutes (still in open window)
    clock.advance(15 * 60_000);
    const secondResult = simulation.tick();

    assert.equal(restaurant.operationalState, 'open');
    assert.equal(restaurant.operationalSince, '2026-09-14T15:00:00.000Z'); // Preserved!

    const transition = secondResult.restaurantTransitions.find(
      (t) => t.restaurantId === 'restaurant:development-restaurant'
    );
    assert.ok(transition);
    assert.equal(transition.previousState, 'open');
    assert.equal(transition.newState, 'open');
    assert.equal(transition.changed, false);
    assert.equal(transition.operationalSince, '2026-09-14T15:00:00.000Z');
  });

  test('restaurant evaluation preserves Player state while NPC follows routine at 09:00 UTC', () => {
    const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

    const playerLocationBefore = player.locationId;
    const playerActivityBefore = player.activityState;
    const playerSinceBefore = player.activitySince;

    // Advance to 09:00 local (15:00 UTC) and tick
    clock.advance(3600_000);
    simulation.tick();

    // Player must remain completely unchanged (sovereign isolation)
    assert.equal(player.locationId, playerLocationBefore);
    assert.equal(player.activityState, playerActivityBefore);
    assert.equal(player.activitySince, playerSinceBefore);

    // NPC location follows M15 routine into open restaurant
    assert.equal(npc.locationId, 'restaurant:development-restaurant');
  });

  test('simulation does not mutate places or restaurant structural containment', () => {
    const clock = WorldClock.create('2026-09-14T16:00:00.000Z');
    const state = createInitialWorldState(clock);
    const simulation = new Simulation(clock, state, { silent: true });

    const placesBefore = JSON.stringify(state.places);
    const restaurantBuildingIdBefore = state.restaurants[0].buildingId;

    simulation.tick();

    assert.equal(JSON.stringify(state.places), placesBefore);
    assert.equal(state.restaurants[0].buildingId, restaurantBuildingIdBefore);
  });
});
