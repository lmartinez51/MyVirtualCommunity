import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  introduceToAgent,
  isAgentAcquainted,
  greetAgent,
  inspectCurrentLocation,
  enterRestaurant,
  exitRestaurant,
  leaveBuilding,
  enterBuilding,
  WorldState,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  getCanonicalAgentPair,
  getAcquaintanceId,
  validateAcquaintances,
  Acquaintance,
} from '../src/core/entities/social.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 25: First Persistent Social Consequence (Minimal Dyadic Acquaintance)', () => {
  const MORNING_TIME = '2026-09-14T08:00:00.000Z';

  function setupWorldAt(timeIso: string = MORNING_TIME): { clock: WorldClock; state: WorldState; sim: Simulation } {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    return { clock, state, sim };
  }

  // =========================================================================
  // 1. Core State & Canonical Identity
  // =========================================================================
  describe('1. Core State & Canonical Identity', () => {
    test('1. Initial world state seeds an empty acquaintances array', () => {
      const { state } = setupWorldAt();
      assert.ok(Array.isArray(state.acquaintances));
      assert.equal(state.acquaintances.length, 0);
    });

    test('2. snapshotWorldState creates an independent copy of acquaintances', () => {
      const { clock, state } = setupWorldAt();
      const snapshot = snapshotWorldState(clock, state);
      assert.ok(Array.isArray(snapshot.acquaintances));
      assert.equal(snapshot.acquaintances.length, 0);
      assert.notEqual(snapshot.acquaintances, state.acquaintances);

      // Mutating snapshot does not affect original state
      (snapshot.acquaintances as any).push({
        id: 'acquaintance:test-a:test-b',
        agentIds: ['test-a', 'test-b'] as [string, string],
        establishedAt: state.worldTime,
      });
      assert.equal(state.acquaintances.length, 0);
      assert.equal(snapshot.acquaintances.length, 1);
    });

    test('3. Initial isAgentAcquainted returns false for unacquainted agents', () => {
      const { state } = setupWorldAt();
      assert.equal(isAgentAcquainted(state, 'agent:dev-player', 'agent:dev-npc'), false);
    });

    test('4. isAgentAcquainted is strictly symmetric', () => {
      const { state } = setupWorldAt();
      assert.equal(
        isAgentAcquainted(state, 'agent:dev-player', 'agent:dev-npc'),
        isAgentAcquainted(state, 'agent:dev-npc', 'agent:dev-player')
      );

      // Add acquaintance manually and test symmetry
      state.acquaintances.push({
        id: getAcquaintanceId('agent:dev-player', 'agent:dev-npc'),
        agentIds: getCanonicalAgentPair('agent:dev-player', 'agent:dev-npc'),
        establishedAt: state.worldTime,
      });

      assert.equal(isAgentAcquainted(state, 'agent:dev-player', 'agent:dev-npc'), true);
      assert.equal(isAgentAcquainted(state, 'agent:dev-npc', 'agent:dev-player'), true);
    });

    test('5. Self-acquaintance is impossible and returns false', () => {
      const { state } = setupWorldAt();
      assert.equal(isAgentAcquainted(state, 'agent:dev-player', 'agent:dev-player'), false);
      assert.equal(isAgentAcquainted(state, 'agent:dev-npc', 'agent:dev-npc'), false);
    });

    test('6. getCanonicalAgentPair sorts IDs lexicographically', () => {
      const pair1 = getCanonicalAgentPair('agent:dev-player', 'agent:dev-npc');
      assert.deepEqual(pair1, ['agent:dev-npc', 'agent:dev-player']);

      const pair2 = getCanonicalAgentPair('agent:dev-npc', 'agent:dev-player');
      assert.deepEqual(pair2, ['agent:dev-npc', 'agent:dev-player']);

      const pair3 = getCanonicalAgentPair('zebra', 'alpha');
      assert.deepEqual(pair3, ['alpha', 'zebra']);
    });

    test('7. getAcquaintanceId generates deterministic identifier', () => {
      const id1 = getAcquaintanceId('agent:dev-player', 'agent:dev-npc');
      const id2 = getAcquaintanceId('agent:dev-npc', 'agent:dev-player');
      assert.equal(id1, 'acquaintance:agent:dev-npc:agent:dev-player');
      assert.equal(id2, 'acquaintance:agent:dev-npc:agent:dev-player');
    });
  });

  // =========================================================================
  // 2. Action & Preconditions
  // =========================================================================
  describe('2. Action & Preconditions (introduceToAgent)', () => {
    test('8. introduceToAgent succeeds when player and NPC are co-located at valid location', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // Co-locate both at building:development-building
      player.locationId = 'building:development-building';
      npc.locationId = 'building:development-building';

      const result = introduceToAgent(state, player.id, npc.id);
      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.playerId, player.id);
      assert.equal(result.npcId, npc.id);
      assert.ok(result.acquaintance);
      assert.equal(result.acquaintance.id, 'acquaintance:agent:dev-npc:agent:dev-player');
      assert.deepEqual(result.acquaintance.agentIds, ['agent:dev-npc', 'agent:dev-player']);
      assert.equal(result.acquaintance.establishedAt, state.worldTime);

      assert.equal(state.acquaintances.length, 1);
      assert.equal(isAgentAcquainted(state, player.id, npc.id), true);
    });

    test('9. introduceToAgent is idempotent: duplicate calls return already-acquainted without mutation', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'building:development-building';
      npc.locationId = 'building:development-building';

      const first = introduceToAgent(state, player.id, npc.id);
      assert.equal(first.success, true);
      assert.equal(first.code, 'success');
      assert.equal(state.acquaintances.length, 1);

      const stateSnapshot = JSON.stringify(state);

      const second = introduceToAgent(state, player.id, npc.id);
      assert.equal(second.success, true);
      assert.equal(second.code, 'already-acquainted');
      assert.equal(second.playerId, player.id);
      assert.equal(second.npcId, npc.id);
      assert.ok(second.acquaintance);
      assert.equal(second.acquaintance.id, first.acquaintance?.id);

      // State is completely unmodified by idempotent call
      assert.equal(state.acquaintances.length, 1);
      assert.equal(JSON.stringify(state), stateSnapshot);
    });

    test('10. Precondition 1: player does not exist (player-not-found) causes zero mutation', () => {
      const { state } = setupWorldAt();
      const stateSnapshot = JSON.stringify(state);

      const result = introduceToAgent(state, 'agent:ghost', 'agent:dev-npc');
      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-found');
      assert.equal(JSON.stringify(state), stateSnapshot);
    });

    test('11. Precondition 2: agent is not player (player-not-player) causes zero mutation', () => {
      const { state } = setupWorldAt();
      const stateSnapshot = JSON.stringify(state);

      // Use NPC as the caller
      const result = introduceToAgent(state, 'agent:dev-npc', 'agent:dev-player');
      assert.equal(result.success, false);
      assert.equal(result.code, 'player-not-player');
      assert.equal(JSON.stringify(state), stateSnapshot);
    });

    test('12. Precondition 3: NPC does not exist (npc-not-found) causes zero mutation', () => {
      const { state } = setupWorldAt();
      const stateSnapshot = JSON.stringify(state);

      const result = introduceToAgent(state, 'agent:dev-player', 'agent:ghost-npc');
      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-not-found');
      assert.equal(JSON.stringify(state), stateSnapshot);
    });

    test('13. Precondition 4: target is not NPC (target-not-npc) causes zero mutation', () => {
      const { state } = setupWorldAt();
      const stateSnapshot = JSON.stringify(state);

      // Player targeting self
      const result = introduceToAgent(state, 'agent:dev-player', 'agent:dev-player');
      assert.equal(result.success, false);
      assert.equal(result.code, 'target-not-npc');
      assert.equal(JSON.stringify(state), stateSnapshot);
    });

    test('14. Precondition 5: player location invalid (player-location-invalid) causes zero mutation', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'void:non-existent';
      const stateSnapshot = JSON.stringify(state);

      const result = introduceToAgent(state, player.id, 'agent:dev-npc');
      assert.equal(result.success, false);
      assert.equal(result.code, 'player-location-invalid');
      assert.equal(JSON.stringify(state), stateSnapshot);
    });

    test('15. Precondition 6: NPC location invalid (npc-location-invalid) causes zero mutation', () => {
      const { state } = setupWorldAt();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'void:non-existent';
      const stateSnapshot = JSON.stringify(state);

      const result = introduceToAgent(state, 'agent:dev-player', npc.id);
      assert.equal(result.success, false);
      assert.equal(result.code, 'npc-location-invalid');
      assert.equal(JSON.stringify(state), stateSnapshot);
    });

    test('16. Precondition 7: agents not co-located (agents-not-co-located) causes zero mutation', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'building:development-building';
      npc.locationId = 'building:development-residence';
      const stateSnapshot = JSON.stringify(state);

      const result = introduceToAgent(state, player.id, npc.id);
      assert.equal(result.success, false);
      assert.equal(result.code, 'agents-not-co-located');
      assert.equal(JSON.stringify(state), stateSnapshot);
    });

    test('17. introduceToAgent does NOT advance WorldClock or alter balances, activities, or locations', () => {
      const { clock, state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'building:development-building';
      npc.locationId = 'building:development-building';

      const timeBefore = state.worldTime;
      const clockTimeBefore = clock.getTime();
      const playerBalanceBefore = player.balanceMinor;
      const playerActivityBefore = player.activityState;
      const npcActivityBefore = npc.activityState;

      const result = introduceToAgent(state, player.id, npc.id);
      assert.equal(result.success, true);

      assert.equal(state.worldTime, timeBefore);
      assert.equal(clock.getTime(), clockTimeBefore);
      assert.equal(player.balanceMinor, playerBalanceBefore);
      assert.equal(player.activityState, playerActivityBefore);
      assert.equal(npc.activityState, npcActivityBefore);
      assert.equal(player.locationId, 'building:development-building');
      assert.equal(npc.locationId, 'building:development-building');
    });
  });

  // =========================================================================
  // 3. Schema Validation
  // =========================================================================
  describe('3. Schema Validation', () => {
    test('18. validateWorldState accepts valid v11 state with acquaintances', () => {
      const { state } = setupWorldAt();
      assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
      assert.equal(state.version, 12);

      state.acquaintances.push({
        id: 'acquaintance:agent:dev-npc:agent:dev-player',
        agentIds: ['agent:dev-npc', 'agent:dev-player'],
        establishedAt: state.worldTime,
      });

      assert.doesNotThrow(() => validateWorldState(state));
    });

    test('19. validateWorldState rejects non-array acquaintances', () => {
      const { state } = setupWorldAt();
      (state as any).acquaintances = 'invalid';
      assert.throws(
        () => validateWorldState(state),
        /acquaintances must be an array/
      );
    });

    test('20. validateAcquaintances rejects non-object items, unsorted IDs, self-pairing, and bad ID format', () => {
      const validAgents = new Set(['agent:dev-npc', 'agent:dev-player']);

      // Non-object item
      assert.throws(
        () => validateAcquaintances(['invalid' as any], validAgents),
        /must be a non-null object/
      );

      // Unsorted agentIds ([max, min])
      assert.throws(
        () =>
          validateAcquaintances(
            [
              {
                id: 'acquaintance:agent:dev-player:agent:dev-npc',
                agentIds: ['agent:dev-player', 'agent:dev-npc'],
                establishedAt: '2026-09-14T08:00:00.000Z',
              },
            ],
            validAgents
          ),
        /must be in canonical lexicographical order/
      );

      // Self-pairing ([agentA, agentA])
      assert.throws(
        () =>
          validateAcquaintances(
            [
              {
                id: 'acquaintance:agent:dev-npc:agent:dev-npc',
                agentIds: ['agent:dev-npc', 'agent:dev-npc'],
                establishedAt: '2026-09-14T08:00:00.000Z',
              },
            ],
            validAgents
          ),
        /cannot establish acquaintance with self/
      );

      // Bad ID format
      assert.throws(
        () =>
          validateAcquaintances(
            [
              {
                id: 'wrong-id-format',
                agentIds: ['agent:dev-npc', 'agent:dev-player'],
                establishedAt: '2026-09-14T08:00:00.000Z',
              },
            ],
            validAgents
          ),
        /Invalid acquaintance ID/
      );

      // Duplicate dyadic pair
      assert.throws(
        () =>
          validateAcquaintances(
            [
              {
                id: 'acquaintance:agent:dev-npc:agent:dev-player',
                agentIds: ['agent:dev-npc', 'agent:dev-player'],
                establishedAt: '2026-09-14T08:00:00.000Z',
              },
              {
                id: 'acquaintance:agent:dev-npc:agent:dev-player',
                agentIds: ['agent:dev-npc', 'agent:dev-player'],
                establishedAt: '2026-09-14T08:05:00.000Z',
              },
            ],
            validAgents
          ),
        /Duplicate entity id/
      );

      // Non-existent agent reference
      assert.throws(
        () =>
          validateAcquaintances(
            [
              {
                id: 'acquaintance:agent:dev-npc:agent:ghost',
                agentIds: ['agent:dev-npc', 'agent:ghost'],
                establishedAt: '2026-09-14T08:00:00.000Z',
              },
            ],
            validAgents
          ),
        /does not exist in agents collection/
      );
    });

    test('21. validateWorldState rejects entity ID collision between acquaintance and other entities', () => {
      const { state } = setupWorldAt();
      // Add place that collides with acquaintance ID
      const collidingId = 'acquaintance:agent:dev-npc:agent:dev-player';
      state.places.push({
        id: collidingId,
        type: 'street' as const,
        name: 'Colliding Street',
        parentId: 'neighborhood:development-neighborhood',
      });
      state.acquaintances.push({
        id: collidingId,
        agentIds: ['agent:dev-npc', 'agent:dev-player'],
        establishedAt: state.worldTime,
      });

      assert.throws(
        () => validateWorldState(state),
        /Duplicate entity id found across collections/
      );
    });
  });

  // =========================================================================
  // 4. Future Observable Consequence (greetAgent)
  // =========================================================================
  describe('4. Future Observable Consequence (greetAgent)', () => {
    test('22. greetAgent branches response based on acquaintance across canonical contexts with zero mutation', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // Locations to test:
      // 1. Restaurant active: 'restaurant:development-restaurant' (with active shift)
      // 2. Residence: 'building:development-residence'
      // 3. Development street: 'street:development-street'
      // 4. Avenida Juárez: 'street:avenida-juarez'
      // 5. Development building: 'building:development-building'
      // 6. Generic fallback: 'building:development-convenience-store' (place without specific message)

      const testCases = [
        {
          locationId: 'restaurant:development-restaurant',
          setup: () => {
            npc.activityState = 'active';
          },
          expectedUnacquainted: "Welcome. I'm working here today.",
          expectedAcquainted: "Welcome back. Good to see you again. I'm working here today.",
        },
        {
          locationId: 'building:development-residence',
          setup: () => {
            npc.activityState = 'idle';
          },
          expectedUnacquainted: "Hello. I'm resting at home right now.",
          expectedAcquainted: "Hello again. Good to see you. I'm resting at home right now.",
        },
        {
          locationId: 'street:development-street',
          setup: () => {
            npc.activityState = 'idle';
          },
          expectedUnacquainted: "Good morning. On my way to the restaurant.",
          expectedAcquainted: "Good morning again. On my way to the restaurant.",
        },
        {
          locationId: 'street:avenida-juarez',
          setup: () => {
            npc.activityState = 'idle';
          },
          expectedUnacquainted: "Good evening. It's pleasant to walk down Avenida Juárez after work.",
          expectedAcquainted: "Good evening again. It's pleasant to walk down Avenida Juárez after work.",
        },
        {
          locationId: 'building:development-building',
          setup: () => {
            npc.activityState = 'idle';
          },
          expectedUnacquainted: "Hello. I'm around the building today.",
          expectedAcquainted: "Hello again. Good to see you around the building today.",
        },
        {
          locationId: 'building:avenida-juarez-kiosk',
          setup: () => {
            npc.activityState = 'idle';
          },
          expectedUnacquainted: 'Hello there.',
          expectedAcquainted: 'Hello again. Good to see you.',
        },
      ];

      for (const tc of testCases) {
        player.locationId = tc.locationId;
        npc.locationId = tc.locationId;
        tc.setup();

        // 1. Unacquainted greeting
        state.acquaintances = [];
        const stateBeforeUnacq = JSON.stringify(state);
        const unacqResult = greetAgent(state, player.id, npc.id);
        assert.equal(unacqResult.success, true);
        assert.equal(unacqResult.response, tc.expectedUnacquainted);
        assert.equal(JSON.stringify(state), stateBeforeUnacq); // 100% zero mutation

        // 2. Introduce
        introduceToAgent(state, player.id, npc.id);
        assert.equal(isAgentAcquainted(state, player.id, npc.id), true);

        // 3. Acquainted greeting
        const stateBeforeAcq = JSON.stringify(state);
        const acqResult = greetAgent(state, player.id, npc.id);
        assert.equal(acqResult.success, true);
        assert.equal(acqResult.response, tc.expectedAcquainted);
        assert.equal(JSON.stringify(state), stateBeforeAcq); // 100% zero mutation
      }
    });
  });

  // =========================================================================
  // 5. Perception Projection
  // =========================================================================
  describe('5. Perception Projection (inspectCurrentLocation)', () => {
    test('23. inspectCurrentLocation projects isAcquainted boolean for other agents and omits it for player', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'building:development-building';
      npc.locationId = 'building:development-building';

      const stateBefore1 = JSON.stringify(state);

      // Before acquaintance
      const inspection1 = inspectCurrentLocation(state, player.id);
      assert.equal(inspection1.success, true);
      assert.ok(inspection1.location);
      assert.ok(inspection1.location.agents);

      const perceivedNpc1 = inspection1.location.agents.find((a) => a.id === npc.id);
      assert.ok(perceivedNpc1);
      assert.equal(perceivedNpc1.isAcquainted, false);

      const perceivedPlayer1 = inspection1.location.agents.find((a) => a.id === player.id);
      assert.ok(perceivedPlayer1);
      assert.equal(perceivedPlayer1.isAcquainted, undefined);

      assert.equal(JSON.stringify(state), stateBefore1); // Zero mutation

      // Establish acquaintance
      introduceToAgent(state, player.id, npc.id);

      const stateBefore2 = JSON.stringify(state);

      // After acquaintance
      const inspection2 = inspectCurrentLocation(state, player.id);
      assert.equal(inspection2.success, true);

      const perceivedNpc2 = inspection2.location!.agents!.find((a) => a.id === npc.id);
      assert.ok(perceivedNpc2);
      assert.equal(perceivedNpc2.isAcquainted, true);

      const perceivedPlayer2 = inspection2.location!.agents!.find((a) => a.id === player.id);
      assert.ok(perceivedPlayer2);
      assert.equal(perceivedPlayer2.isAcquainted, undefined);

      assert.equal(JSON.stringify(state), stateBefore2); // Zero mutation
    });
  });

  // =========================================================================
  // 6. Temporal & Spatial Persistence
  // =========================================================================
  describe('6. Temporal & Spatial Persistence', () => {
    test('24. Acquaintance persists across player spatial movements', () => {
      const { state } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // Co-locate at building
      player.locationId = 'building:development-building';
      npc.locationId = 'building:development-building';

      introduceToAgent(state, player.id, npc.id);
      assert.equal(isAgentAcquainted(state, player.id, npc.id), true);

      // Player exits building to street, traverses to another place
      leaveBuilding(state, player.id, 'building:development-building', { silent: true });
      assert.equal(player.locationId, 'street:development-street');

      // Acquaintance remains true even when agents are separated
      assert.equal(isAgentAcquainted(state, player.id, npc.id), true);

      // Player enters building again
      enterBuilding(state, player.id, 'building:development-building', { silent: true });
      assert.equal(player.locationId, 'building:development-building');

      // Greet again to confirm recognition persists
      const greetResult = greetAgent(state, player.id, npc.id);
      assert.equal(greetResult.success, true);
      assert.equal(greetResult.response, "Hello again. Good to see you around the building today.");
    });

    test('25. Acquaintance persists across simulation ticks and clock advancement', () => {
      const { clock, state, sim } = setupWorldAt();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'building:development-building';
      npc.locationId = 'building:development-building';

      introduceToAgent(state, player.id, npc.id);
      assert.equal(state.acquaintances.length, 1);

      // Advance clock and tick simulation for 48 hours in increments
      for (let i = 0; i < 48; i++) {
        clock.advance(3600_000); // 1 hour
        sim.tick();
      }

      // Acquaintance remains intact and unaltered
      assert.equal(state.acquaintances.length, 1);
      assert.equal(isAgentAcquainted(state, player.id, npc.id), true);
      assert.equal(state.acquaintances[0].id, 'acquaintance:agent:dev-npc:agent:dev-player');
    });

    test('26. Acquaintance persists across disk save/load roundtrip and restores into validated v11 state', async () => {
      const testPath = join(tmpdir(), `mvc-test-m25-persistence-${Date.now()}.json`);
      try {
        const { state } = setupWorldAt();
        const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
        const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

        player.locationId = 'building:development-building';
        npc.locationId = 'building:development-building';

        const introResult = introduceToAgent(state, player.id, npc.id);
        assert.equal(introResult.success, true);

        // Save to disk
        const persistence = new LocalFilePersistence(testPath);
        await persistence.save(state);
        assert.equal(existsSync(testPath), true);

        // Restore in fresh session
        const restoredState = await persistence.load();
        assert.ok(restoredState);

        // Validate schema version 11
        assert.equal(restoredState.version, 12);
        assert.doesNotThrow(() => validateWorldState(restoredState));

        // Validate acquaintance record
        assert.equal(restoredState.acquaintances.length, 1);
        const restoredAcq = restoredState.acquaintances[0];
        assert.equal(restoredAcq.id, 'acquaintance:agent:dev-npc:agent:dev-player');
        assert.deepEqual(restoredAcq.agentIds, ['agent:dev-npc', 'agent:dev-player']);
        assert.equal(restoredAcq.establishedAt, state.worldTime);

        // Validate helper and greeting in restored session
        assert.equal(isAgentAcquainted(restoredState, player.id, npc.id), true);
        const greetResult = greetAgent(restoredState, player.id, npc.id);
        assert.equal(greetResult.success, true);
        assert.equal(greetResult.response, "Hello again. Good to see you around the building today.");
      } finally {
        if (existsSync(testPath)) {
          unlinkSync(testPath);
        }
      }
    });
  });
});
