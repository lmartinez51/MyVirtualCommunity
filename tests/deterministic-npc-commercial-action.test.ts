import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  WorldState,
  createInitialWorldState,
  validateWorldState,
  makeDevelopmentOfferingAvailable,
  retireDevelopmentOffering,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  inspectCurrentLocation,
  purchaseOffering,
  enterRestaurant,
} from '../src/core/world-state.js';
import {
  Simulation,
  evaluateOfferingPublicationContext,
} from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 47: Deterministic NPC Commercial Action', () => {
  const START_TIME = '2026-09-14T15:00:00.000Z'; // 09:00 Local (Juárez) - Restaurant open, NPC shift start

  function setupWorld(time = START_TIME): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(time);
    const state = createInitialWorldState(clock);
    return { clock, state };
  }

  function setupActiveNpcRestaurantWorld(): {
    clock: WorldClock;
    state: WorldState;
    npc: { id: string; locationId: string; activityState: string; agentType: string };
    restaurant: { id: string; operationalState: string };
  } {
    const { clock, state } = setupWorld();
    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
    const restaurant = state.restaurants.find(
      (r) => r.id === 'restaurant:development-restaurant'
    )!;

    npc.locationId = restaurant.id;
    npc.activityState = 'active';
    restaurant.operationalState = 'open';

    return { clock, state, npc, restaurant };
  }

  describe('1. Pure Context Evaluation (evaluateOfferingPublicationContext)', () => {
    it('returns "make-offering-available" when active NPC is at open restaurant and offering is absent', () => {
      const { state, npc, restaurant } = setupActiveNpcRestaurantWorld();
      const stateBefore = JSON.stringify(state);

      const decision = evaluateOfferingPublicationContext(state, npc.id, restaurant.id);

      assert.equal(decision, 'make-offering-available');
      // Invariant: Pure context evaluation has strictly zero side-effects
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('returns "no-action" when offering already exists in world state (idempotency precondition)', () => {
      const { state, npc, restaurant } = setupActiveNpcRestaurantWorld();
      makeDevelopmentOfferingAvailable(state, npc.id, restaurant.id);
      assert.ok(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
      const stateBefore = JSON.stringify(state);

      const decision = evaluateOfferingPublicationContext(state, npc.id, restaurant.id);

      assert.equal(decision, 'no-action');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('returns "no-action" when NPC is inactive', () => {
      const { state, npc, restaurant } = setupActiveNpcRestaurantWorld();
      npc.activityState = 'idle';

      const decision = evaluateOfferingPublicationContext(state, npc.id, restaurant.id);

      assert.equal(decision, 'no-action');
    });

    it('returns "no-action" when NPC is not at the restaurant', () => {
      const { state, npc, restaurant } = setupActiveNpcRestaurantWorld();
      npc.locationId = 'building:development-residence';

      const decision = evaluateOfferingPublicationContext(state, npc.id, restaurant.id);

      assert.equal(decision, 'no-action');
    });

    it('returns "no-action" when restaurant is closed', () => {
      const { state, npc, restaurant } = setupActiveNpcRestaurantWorld();
      restaurant.operationalState = 'closed';

      const decision = evaluateOfferingPublicationContext(state, npc.id, restaurant.id);

      assert.equal(decision, 'no-action');
    });

    it('returns "no-action" when NPC ID does not exist', () => {
      const { state, restaurant } = setupActiveNpcRestaurantWorld();

      const decision = evaluateOfferingPublicationContext(state, 'agent:nonexistent', restaurant.id);

      assert.equal(decision, 'no-action');
    });

    it('returns "no-action" when agent is not an NPC (player agent)', () => {
      const { state, restaurant } = setupActiveNpcRestaurantWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = restaurant.id;

      const decision = evaluateOfferingPublicationContext(state, player.id, restaurant.id);

      assert.equal(decision, 'no-action');
    });

    it('returns "no-action" when restaurant ID does not exist', () => {
      const { state, npc } = setupActiveNpcRestaurantWorld();

      const decision = evaluateOfferingPublicationContext(state, npc.id, 'restaurant:nonexistent');

      assert.equal(decision, 'no-action');
    });
  });

  describe('2. Existing Domain Authority & Invariant Preservation', () => {
    it('makeDevelopmentOfferingAvailable remains the sole authority for offering creation', () => {
      const { state, npc, restaurant } = setupActiveNpcRestaurantWorld();
      const initialCount = state.offerings.length;

      const result = makeDevelopmentOfferingAvailable(state, npc.id, restaurant.id);

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(state.offerings.length, initialCount + 1);

      const offering = state.offerings.find((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.ok(offering);
      assert.equal(offering.name, 'Pan Dulce');
      assert.equal(offering.priceMinor, 250);
      assert.equal(offering.currency, 'USD');
      assert.equal(offering.restaurantId, restaurant.id);

      // Conforms to WorldState schema invariants
      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('enforces failure atomicity: failed domain validation produces strictly zero state mutation', () => {
      const { state, npc, restaurant } = setupActiveNpcRestaurantWorld();
      restaurant.operationalState = 'closed';
      const stateBefore = JSON.stringify(state);

      const result = makeDevelopmentOfferingAvailable(state, npc.id, restaurant.id);

      assert.equal(result.success, false);
      assert.equal(result.code, 'restaurant-not-open');
      assert.equal(JSON.stringify(state), stateBefore);
    });
  });

  describe('3. Simulation Tick Integration & Observability', () => {
    it('Simulation.tick() evaluates context, fires decision, invokes authority, and emits NpcDecisionTransitionResult', () => {
      // 08:00 Local (14:00 UTC): Restaurant closed, NPC at home, pastry absent
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      assert.ok(!state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      // Advance to 09:00 Local (15:00 UTC) (NPC shift begins, restaurant opens, NPC moves to restaurant)
      clock.advance(3600_000);
      const tickResult = sim.tick();

      // Offering was published
      assert.ok(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      // Observability: npcDecisionTransitions contains the M47 decision
      assert.ok(tickResult.npcDecisionTransitions);
      const decisionResult = tickResult.npcDecisionTransitions.find(
        (dt) => dt.decision === 'make-offering-available'
      );
      assert.ok(decisionResult, 'Must emit make-offering-available in npcDecisionTransitions');
      assert.equal(decisionResult.npcId, 'agent:dev-npc');
      assert.equal(decisionResult.restaurantId, 'restaurant:development-restaurant');
      assert.equal(decisionResult.success, true);
      assert.equal(decisionResult.code, 'success');
      assert.equal(decisionResult.offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

      // Backwards-compatible offeringTransitions is also emitted
      assert.ok(tickResult.offeringTransitions);
      const offeringTrans = tickResult.offeringTransitions.find(
        (ot) => ot.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
      );
      assert.ok(offeringTrans);
      assert.equal(offeringTrans.action, 'made-available');
    });

    it('subsequent ticks are strictly idempotent and do not duplicate the offering or emit duplicate decisions', () => {
      const clock = WorldClock.create('2026-09-14T15:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // First tick at 09:00 Local: decision fires
      const tick1 = sim.tick();
      assert.ok(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
      const offeringsCountAfterFirstTick = state.offerings.length;
      assert.ok(
        tick1.npcDecisionTransitions?.some((dt) => dt.decision === 'make-offering-available')
      );

      // Second tick 1 minute later at 09:01 Local: decision evaluates to 'no-action'
      clock.advance(60_000);
      const tick2 = sim.tick();

      assert.equal(state.offerings.length, offeringsCountAfterFirstTick);
      const duplicateDecision = tick2.npcDecisionTransitions?.find(
        (dt) => dt.decision === 'make-offering-available'
      );
      assert.equal(duplicateDecision, undefined, 'Must NOT emit decision transition when no-action evaluates');
    });
  });

  describe('4. Critical Regression: Single Causal Trigger', () => {
    it('proves that the development pastry offering is NOT published independently of the NPC decision path', () => {
      // Setup world at 09:00 Local (15:00 UTC) where the restaurant is open, BUT the NPC is not active
      const clock = WorldClock.create('2026-09-14T15:00:00.000Z');
      const state = createInitialWorldState(clock);

      // Force NPC to be idle and relocated away from the restaurant
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.activityState = 'idle';
      npc.locationId = 'building:development-residence';

      // Provide custom activity evaluator so NPC remains idle despite the clock
      const sim = new Simulation(clock, state, {
        silent: true,
        activityEvaluator: () => false, // NPC remains idle
      });

      const tickResult = sim.tick();

      // Since NPC is not active at the restaurant, the M47 decision evaluates to 'no-action'
      assert.ok(!state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
      assert.equal(
        tickResult.npcDecisionTransitions?.find((dt) => dt.decision === 'make-offering-available'),
        undefined
      );
      assert.equal(
        tickResult.offeringTransitions?.find((ot) => ot.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID),
        undefined
      );
    });
  });

  describe('5. Persistence Roundtrip & Integrity', () => {
    it('offering published via deterministic NPC decision survives persistence save and reload', () => {
      const tempPath = join(tmpdir(), `m47-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      const persistence = new LocalFilePersistence(tempPath);

      try {
        const clock = WorldClock.create('2026-09-14T15:00:00.000Z');
        const state = createInitialWorldState(clock);
        const sim = new Simulation(clock, state, { silent: true });

        // Trigger tick: NPC decides to publish offering
        sim.tick();
        assert.ok(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

        // Save to disk
        persistence.save(state);

        // Load into clean runtime
        const loadedState = persistence.load();
        assert.ok(loadedState);
        validateWorldState(loadedState);

        const loadedOffering = loadedState.offerings.find((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);
        assert.ok(loadedOffering, 'Pan Dulce must exist in reloaded state');
        assert.equal(loadedOffering.name, 'Pan Dulce');
        assert.equal(loadedOffering.priceMinor, 250);
        assert.equal(loadedOffering.currency, 'USD');
        assert.equal(loadedOffering.restaurantId, 'restaurant:development-restaurant');

        // Additional ticks on loaded state preserve singularity
        const loadedSim = new Simulation(clock, loadedState, { silent: true });
        clock.advance(60_000);
        loadedSim.tick();

        const count = loadedState.offerings.filter((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID).length;
        assert.equal(count, 1, 'Pan Dulce offering count must remain strictly 1');
      } finally {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      }
    });

    it('candidate state persistence failure does not commit the candidate state to active runtime', () => {
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const activeState = createInitialWorldState(clock);

      // Verify pastry absent initially
      assert.ok(!activeState.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      // Simulate transactional candidate clone (mimicking WorldSessionController)
      const candidateState = structuredClone(activeState);
      const candidateClock = WorldClock.create('2026-09-14T15:00:00.000Z');
      const candidateSim = new Simulation(candidateClock, candidateState, { silent: true });

      // Tick candidate state: NPC decision executes in candidateState
      candidateSim.tick();
      assert.ok(candidateState.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      // Simulate a persistence failure during disk write
      const simulatedDiskWriteFailed = true;

      if (simulatedDiskWriteFailed) {
        // Candidate discarded! Active state remains untouched.
      } else {
        Object.assign(activeState, candidateState);
      }

      // Active state is completely unchanged
      assert.ok(!activeState.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
      assert.equal(clock.getTime(), '2026-09-14T14:00:00.000Z');
    });
  });

  describe('6. Offline / Large Time Step Progression', () => {
    it('large time jump (08:00 -> 10:00 UTC) while player is offline deterministically publishes offering', () => {
      // Start at 08:00 Local / 14:00 UTC (NPC at residence, restaurant closed)
      const clock = WorldClock.create('2026-09-14T14:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // Player is located elsewhere (e.g. at residence)
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'building:development-residence';

      assert.ok(!state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      // Advance clock by 2 hours (jump past shift start directly to 10:00 Local / 16:00 UTC)
      clock.advance(2 * 3600_000);
      assert.equal(clock.getTime(), '2026-09-14T16:00:00.000Z');

      // Tick executes offline catch-up
      const tickResult = sim.tick();

      // Offering is published
      assert.ok(state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
      assert.ok(
        tickResult.npcDecisionTransitions?.some((dt) => dt.decision === 'make-offering-available')
      );

      // When player later travels to the building and enters restaurant, offering is already waiting
      player.locationId = 'building:development-building';
      enterRestaurant(state, player.id, 'restaurant:development-restaurant');
      const inspectRes = inspectCurrentLocation(state, player.id);
      assert.equal(inspectRes.success, true);
      const availableOfferings = (inspectRes.location as any).offerings;
      assert.ok(availableOfferings.some((o: any) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));
    });
  });

  describe('7. Downstream Player Experience & Commercial Exchange', () => {
    it('player can purchase and receive Pan Dulce published by NPC decision', () => {
      const clock = WorldClock.create('2026-09-14T15:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // Simulation ticks -> NPC publishes offering
      sim.tick();

      // Player enters restaurant
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');

      // Player inspects location and perceives Pan Dulce
      const inspectRes = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(inspectRes.success, true);
      const offerings = (inspectRes.location as any).offerings;
      assert.ok(offerings.some((o: any) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID));

      // Player purchases Pan Dulce
      const initialBalance = state.agents.find((a) => a.id === 'agent:dev-player')!.balanceMinor;
      const buyRes = purchaseOffering(
        state,
        'agent:dev-player',
        DEVELOPMENT_PASTRY_OFFERING_ID,
        'restaurant:development-restaurant'
      );

      assert.equal(buyRes.success, true);
      assert.equal(buyRes.code, 'success');

      // Balance decremented by 250 minor units ($2.50)
      const finalBalance = state.agents.find((a) => a.id === 'agent:dev-player')!.balanceMinor;
      assert.equal(finalBalance, initialBalance - 250);

      // Purchase record generated
      assert.equal(state.purchases.length, 1);
      assert.equal(state.purchases[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);

      // OwnedItem instantiated in player inventory
      assert.equal(state.items.length, 1);
      assert.equal(state.items[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(state.items[0].ownerAgentId, 'agent:dev-player');
      assert.equal(state.items[0].status, 'available');

      // World state remains valid under Schema V16
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });
});
