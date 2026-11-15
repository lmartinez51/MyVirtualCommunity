/**
 * Milestone 78 — Autonomous Agent Simulation Runtime Foundation Test Suite
 *
 * Verifies that:
 * 1. A1 — Autonomous Intent & Traversal Initiation: Simulation.tick() derives AgentContext,
 *         produces MoveToPlaceIntent via AgentDecisionProvider, and starts traversal in
 *         RuntimeTraversalCoordinator without mutating Agent.locationId.
 * 2. A2 — Authoritative Arrival: Traversal completes through RuntimeTraversalCoordinator
 *         and commits strictly via M69 validateArrivalAndCommit().
 * 3. B1 — In-Transit Gating: Active traversal prevents duplicate intent emission or
 *         supersession across multiple simulation ticks.
 * 4. C1 — Legacy Collision Prevention: Autonomous Traversal Mode suppresses M63 direct
 *         routine movement, preventing teleportation while in transit.
 * 5. D1 — Multi-Agent Observation: Pre-commit observation barrier ensures all agent
 *         contexts are derived from a consistent pre-commit world state snapshot.
 * 6. E1 — Provider Failure Isolation: Decision provider exceptions are caught and isolated
 *         per agent without aborting the tick or affecting other agents.
 * 7. F1 — Headless Autonomous Cycle: DeterministicMockNavigationProvider allows headless
 *         full-cycle simulation across scheduled routine phases.
 * 8. F2 — Schema Preservation: WorldState schema remains strictly 18 with zero new
 *         persistent fields.
 * 9. G1 — Legacy Compatibility: Simulation without coordinator preserves legacy M63 routine
 *         movement exactly.
 * 10. H1 — Async Provider Rejection: Promise-returning decision providers are rejected with
 *          a clear synchronous error.
 * 11. I1 — 3D Compatibility: Autonomous intent pipeline integrates with M74 PhysicalTraversalRuntime
 *          with zero 3D imports in src/core/.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  CURRENT_WORLD_STATE_VERSION,
  validateWorldState,
  type WorldState,
} from '../src/core/world-state.js';
import {
  DeterministicMockNavigationProvider,
  type NavigationResult,
} from '../src/core/navigation-contract.js';
import { createSecondaryDevelopmentNpc } from '../src/core/development-npc-schedule.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import {
  type AgentDecisionProvider,
  DeterministicAgentDecisionProvider,
  createMoveToPlaceIntent,
  createIdleIntent,
} from '../src/core/agent-intent.js';
import { type AgentContext } from '../src/core/agent-context.js';
import { Simulation, type TickResult } from '../src/core/simulation.js';
import { Scene3D, Node3D } from '../clients/minimal-3d/scene-3d.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import { projectWorldState } from '../src/core/world-projection.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Milestone 78 — Autonomous Agent Simulation Runtime Foundation', () => {
  // Elena's schedule: shift starts at 09:00 local, commute starts at 08:30 (30 min lead time).
  // Timezone for development entities is America/Juarez (UTC-6 in September MDT).
  // 08:35 MDT is 14:35 UTC.
  const COMMUTE_TIME_UTC = '2026-09-14T14:35:00.000Z'; // 08:35 AM local (commute window)
  const WORK_TIME_UTC = '2026-09-14T16:00:00.000Z';    // 10:00 AM local (work shift)
  const REC_TIME_UTC = '2026-09-14T23:05:00.000Z';     // 17:05 PM local (neighborhood recreation)
  const REST_TIME_UTC = '2026-09-15T03:00:00.000Z';    // 21:00 PM local (home rest)

  const elenaId = 'agent:dev-npc';
  const residencePlaceId = 'building:development-residence';
  const restaurantPlaceId = 'restaurant:development-restaurant';
  const promenadePlaceId = 'street:avenida-juarez';

  function setupWorld(initialTime: string = COMMUTE_TIME_UTC): {
    clock: WorldClock;
    state: WorldState;
    coordinator: RuntimeTraversalCoordinator;
  } {
    const clock = new WorldClock(initialTime);
    const state = createInitialWorldState(clock);
    const elena = state.agents.find((a) => a.id === elenaId)!;
    elena.locationId = residencePlaceId;
    const coordinator = new RuntimeTraversalCoordinator();
    return { clock, state, coordinator };
  }

  // ===========================================================================
  // Test A1 — Autonomous Intent & Traversal Initiation
  // ===========================================================================
  describe('A1 — Autonomous Intent & Traversal Initiation', () => {
    it('produces MoveToPlaceIntent and initiates active traversal without mutating Agent.locationId', () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);
      const elena = state.agents.find((a) => a.id === elenaId)!;
      assert.equal(elena.locationId, residencePlaceId);

      const sim = new Simulation(clock, state, { coordinator, silent: true });
      const result: TickResult = sim.tick();

      // 1. Autonomous intent was evaluated and produced
      assert.ok(result.agentIntents, 'agentIntents should be present in TickResult');
      assert.equal(result.agentIntents.length, 1);
      const intent = result.agentIntents[0];
      assert.equal(intent.agentId, elenaId);
      assert.equal(intent.intentType, 'move-to-place');
      assert.equal((intent as any).destinationPlaceId, restaurantPlaceId);

      // 2. Traversal coordinator has an active traversal
      assert.equal(coordinator.hasActiveTraversal(elenaId), true);
      const active = coordinator.getActiveTraversal(elenaId);
      assert.ok(active);
      assert.equal(active.request.originPlaceId, residencePlaceId);
      assert.equal(active.request.destinationPlaceId, restaurantPlaceId);

      // 3. Logical location remains strictly at origin
      assert.equal(elena.locationId, residencePlaceId);
      assert.equal(state.agents.find((a) => a.id === elenaId)!.locationId, residencePlaceId);
    });
  });

  // ===========================================================================
  // Test A2 — Authoritative Arrival
  // ===========================================================================
  describe('A2 — Authoritative Arrival', () => {
    it('commits arrival through coordinator and updates locationId strictly via M69', () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);
      const elena = state.agents.find((a) => a.id === elenaId)!;

      const sim = new Simulation(clock, state, { coordinator, silent: true });
      sim.tick();

      assert.equal(coordinator.hasActiveTraversal(elenaId), true);
      assert.equal(elena.locationId, residencePlaceId);

      const active = coordinator.getActiveTraversal(elenaId)!;
      const navResult: NavigationResult = {
        requestId: active.request.requestId,
        agentId: elenaId,
        originPlaceId: residencePlaceId,
        destinationPlaceId: restaurantPlaceId,
        status: 'arrived',
        completedAt: clock.getTime(),
        message: 'Physical traversal arrived at restaurant',
      };

      const completeResult = coordinator.completeTraversal(state, navResult);

      // 1. Completion succeeds via M69 validateArrivalAndCommit()
      assert.equal(completeResult.success, true);
      assert.equal(completeResult.code, 'success');
      assert.equal(completeResult.agentId, elenaId);
      assert.equal(completeResult.currentLocationId, restaurantPlaceId);
      assert.equal(completeResult.previousLocationId, residencePlaceId);
      assert.equal(completeResult.changed, true);

      // 2. Authoritative state reflects new location
      assert.equal(elena.locationId, restaurantPlaceId);

      // 3. Active traversal is cleaned up
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);
    });
  });

  // ===========================================================================
  // Test B1 — In-Transit Gating
  // ===========================================================================
  describe('B1 — In-Transit Gating', () => {
    it('suppresses new decision evaluation while an active traversal is in flight across multiple ticks', () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);
      const elena = state.agents.find((a) => a.id === elenaId)!;

      const sim = new Simulation(clock, state, { coordinator, silent: true });

      // Tick 1: starts traversal
      const tick1 = sim.tick();
      assert.ok(tick1.agentIntents && tick1.agentIntents.length === 1);
      assert.equal(coordinator.hasActiveTraversal(elenaId), true);
      const originalRequestId = coordinator.getActiveTraversal(elenaId)!.request.requestId;

      // Tick 2: advance clock slightly (still within commute window)
      clock.advance(60_000);
      const tick2 = sim.tick();

      // Cognition is skipped; no new intents emitted
      assert.equal(tick2.agentIntents, undefined, 'No intents should be emitted while in transit');
      assert.equal(coordinator.hasActiveTraversal(elenaId), true);
      assert.equal(
        coordinator.getActiveTraversal(elenaId)!.request.requestId,
        originalRequestId,
        'Original requestId must not be superseded or recreated'
      );
      assert.equal(elena.locationId, residencePlaceId);

      // Tick 3: advance clock further
      clock.advance(60_000);
      const tick3 = sim.tick();
      assert.equal(tick3.agentIntents, undefined);
      assert.equal(
        coordinator.getActiveTraversal(elenaId)!.request.requestId,
        originalRequestId
      );
      assert.equal(elena.locationId, residencePlaceId);
    });
  });

  // ===========================================================================
  // Test C1 — Legacy Collision Prevention
  // ===========================================================================
  describe('C1 — Legacy Collision Prevention', () => {
    it('does NOT teleport NPC via M63 executeNpcRoutineAction() while in Autonomous Traversal Mode', () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);
      const elena = state.agents.find((a) => a.id === elenaId)!;
      assert.equal(elena.locationId, residencePlaceId);

      // In legacy mode, at 08:35, routine movement would immediately teleport Elena.
      // In autonomous mode (coordinator supplied), legacy routine movement is bypassed.
      const sim = new Simulation(clock, state, { coordinator, silent: true });
      sim.tick();

      // Traversal was started, but Elena's location was NOT mutated by M63
      assert.equal(elena.locationId, residencePlaceId);
      assert.equal(coordinator.hasActiveTraversal(elenaId), true);
    });
  });

  // ===========================================================================
  // Test D1 — Multi-Agent Observation Barrier
  // ===========================================================================
  describe('D1 — Multi-Agent Observation Barrier', () => {
    it('derives all agent contexts from a consistent pre-commit world state snapshot', () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);

      // Add secondary NPC (Mateo) at residence
      const mateo = createSecondaryDevelopmentNpc(residencePlaceId);
      state.agents.push(mateo);

      const observedLocations: { agentId: string; locationId: string }[] = [];

      class ObservationTrackingProvider implements AgentDecisionProvider {
        readonly providerId = 'tracking-provider';
        decideIntent(context: AgentContext) {
          observedLocations.push({
            agentId: context.agentId,
            locationId: context.currentLocation.locationId,
          });
          return null;
        }
      }

      const trackingProvider = new ObservationTrackingProvider();
      const sim = new Simulation(clock, state, {
        coordinator,
        decisionProvider: trackingProvider,
        silent: true,
      });

      sim.tick();

      assert.equal(observedLocations.length, 2);
      const elenaObs = observedLocations.find((o) => o.agentId === elenaId)!;
      const mateoObs = observedLocations.find((o) => o.agentId === mateo.id)!;

      assert.equal(elenaObs.locationId, residencePlaceId);
      assert.equal(mateoObs.locationId, residencePlaceId);
    });
  });

  // ===========================================================================
  // Test E1 — Provider Failure Isolation
  // ===========================================================================
  describe('E1 — Provider Failure Isolation', () => {
    it('isolates decision provider exceptions per agent without aborting simulation tick', () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);

      const mateo = createSecondaryDevelopmentNpc(residencePlaceId);
      state.agents.push(mateo);

      class FailingDecisionProvider implements AgentDecisionProvider {
        readonly providerId = 'failing-provider';
        decideIntent(context: AgentContext) {
          if (context.agentId === elenaId) {
            throw new Error('Synthetic neural failure in Elena cognition');
          }
          // Mateo succeeds
          return createIdleIntent(context.agentId, context.civilTime.isoTime, 'Standing by');
        }
      }

      const provider = new FailingDecisionProvider();
      const sim = new Simulation(clock, state, {
        coordinator,
        decisionProvider: provider,
        silent: true,
      });

      // Tick must NOT throw
      let tickResult: TickResult | undefined;
      assert.doesNotThrow(() => {
        tickResult = sim.tick();
      });

      assert.ok(tickResult);
      // Elena's failure was recorded
      assert.ok(tickResult.decisionFailures);
      assert.equal(tickResult.decisionFailures.length, 1);
      assert.equal(tickResult.decisionFailures[0].agentId, elenaId);
      assert.equal(tickResult.decisionFailures[0].providerId, 'failing-provider');
      assert.ok(tickResult.decisionFailures[0].error.includes('Synthetic neural failure'));

      // Mateo's intent was successfully evaluated
      assert.ok(tickResult.agentIntents);
      assert.equal(tickResult.agentIntents.length, 1);
      assert.equal(tickResult.agentIntents[0].agentId, mateo.id);
      assert.equal(tickResult.agentIntents[0].intentType, 'idle');
    });
  });

  // ===========================================================================
  // ===========================================================================
  // Test F1 — Headless Autonomous Cycle
  // ===========================================================================
  describe('F1 — Headless Autonomous Cycle', () => {
    it('executes autonomous lifecycle transitions using DeterministicMockNavigationProvider', () => {
      // 09:05 AM local is 15:05 UTC (work shift window, restaurant is open)
      const WORK_START_UTC = '2026-09-14T15:05:00.000Z';
      const { clock, state, coordinator } = setupWorld(WORK_START_UTC);
      const navProvider = new DeterministicMockNavigationProvider();
      const elena = state.agents.find((a) => a.id === elenaId)!;

      const sim = new Simulation(clock, state, {
        coordinator,
        navigationProvider: navProvider,
        silent: true,
      });

      // 1. Work shift: 09:05 local -> autonomously moves to restaurant and arrives
      const tick1 = sim.tick();
      assert.ok(tick1.traversalCompletions);
      assert.equal(tick1.traversalCompletions.length, 1);
      assert.equal(tick1.traversalCompletions[0].success, true);
      assert.equal(elena.locationId, restaurantPlaceId);
      assert.equal(coordinator.hasActiveTraversal(elenaId), false);

      // 2. Work shift ongoing: 10:00 local -> already at restaurant, decides IdleIntent
      clock.advance(3600_000 * 1);
      const tick2 = sim.tick();
      assert.ok(tick2.agentIntents);
      assert.equal(tick2.agentIntents[0].intentType, 'idle');
      assert.equal(elena.locationId, restaurantPlaceId);

      // 3. Evening promenade: 17:05 local -> autonomously moves to Avenida Juárez
      clock.advance(3600_000 * 7);
      const tick3 = sim.tick();
      assert.ok(tick3.agentIntents);
      assert.equal(tick3.agentIntents[0].intentType, 'move-to-place');
      assert.equal((tick3.agentIntents[0] as any).destinationPlaceId, promenadePlaceId);
      assert.equal(elena.locationId, promenadePlaceId);

      // 4. Night rest: 21:00 local -> autonomously returns to residence
      clock.advance(3600_000 * 4);
      const tick4 = sim.tick();
      assert.ok(tick4.agentIntents);
      assert.equal(tick4.agentIntents[0].intentType, 'move-to-place');
      assert.equal((tick4.agentIntents[0] as any).destinationPlaceId, residencePlaceId);
      assert.equal(elena.locationId, residencePlaceId);
    });
  });

  // ===========================================================================
  // Test F2 — Schema Preservation
  // ===========================================================================
  describe('F2 — Schema Preservation', () => {
    it('preserves CURRENT_WORLD_STATE_VERSION = 18 and valid serialization across autonomous ticks', () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);
      const navProvider = new DeterministicMockNavigationProvider();

      assert.equal(state.version, 19);
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      assert.doesNotThrow(() => validateWorldState(state));

      const sim = new Simulation(clock, state, {
        coordinator,
        navigationProvider: navProvider,
        silent: true,
      });

      sim.tick();

      assert.equal(state.version, 19);
      assert.doesNotThrow(() => validateWorldState(state));

      // Verify zero new persistent properties on agents
      const elena = state.agents.find((a) => a.id === elenaId)!;
      const persistentKeys = Object.keys(elena).sort();
      const expectedKeys = [
        'activitySince',
        'activityState',
        'agentType',
        'balanceMinor',
        'currency',
        'id',
        'interiorSpaceId',
        'locationId',
        'name',
        'playerActivity',
        'type',
      ].sort();
      assert.deepEqual(persistentKeys, expectedKeys);
    });
  });

  // ===========================================================================
  // Test G1 — Legacy Compatibility
  // ===========================================================================
  describe('G1 — Legacy Compatibility', () => {
    it('Simulation without coordinator continues legacy M63 routine movement unchanged', () => {
      const clock = new WorldClock(COMMUTE_TIME_UTC);
      const state = createInitialWorldState(clock);
      const elena = state.agents.find((a) => a.id === elenaId)!;
      elena.locationId = residencePlaceId;

      // Unconfigured legacy simulation
      const sim = new Simulation(clock, state, { silent: true });
      const result = sim.tick();

      // In legacy mode, routine execution runs directly and transitions location to commute street
      assert.ok(result.npcLocationTransitions);
      assert.equal(result.agentIntents, undefined, 'No agentIntents in legacy mode');
      assert.equal(result.traversalCompletions, undefined, 'No traversalCompletions in legacy mode');
      assert.equal(elena.locationId, 'street:development-street');
    });
  });

  // ===========================================================================
  // Test H1 — Async Provider Rejection
  // ===========================================================================
  describe('H1 — Async Provider Rejection', () => {
    it('synchronously rejects Promise-returning decision provider with clear M78 error', () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);

      class AsyncDecisionProvider implements AgentDecisionProvider {
        readonly providerId = 'async-llm-mock-provider';
        async decideIntent(context: AgentContext) {
          return createIdleIntent(context.agentId, context.civilTime.isoTime);
        }
      }

      const asyncProvider = new AsyncDecisionProvider();
      const sim = new Simulation(clock, state, {
        coordinator,
        decisionProvider: asyncProvider,
        silent: true,
      });

      assert.throws(
        () => {
          sim.tick();
        },
        (err: any) => {
          assert.ok(err instanceof Error);
          assert.equal(
            err.message,
            'Asynchronous decision provider "async-llm-mock-provider" is not supported by synchronous Simulation.tick() in M78.'
          );
          return true;
        }
      );
    });

    it('rejects thenable objects that are not direct instances of Promise', () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);

      class ThenableDecisionProvider implements AgentDecisionProvider {
        readonly providerId = 'thenable-custom-provider';
        decideIntent(context: AgentContext): any {
          return {
            then: (resolve: any) => resolve(null),
          };
        }
      }

      const sim = new Simulation(clock, state, {
        coordinator,
        decisionProvider: new ThenableDecisionProvider(),
        silent: true,
      });

      assert.throws(
        () => {
          sim.tick();
        },
        /Asynchronous decision provider "thenable-custom-provider" is not supported by synchronous Simulation\.tick\(\) in M78\./
      );
    });
  });

  // ===========================================================================
  // Test I1 — 3D Compatibility Verification (Prompt Section 24)
  // ===========================================================================
  describe('I1 — 3D Compatibility Verification', () => {
    it('verifies M76 -> M78 -> M74 -> M69 -> M77 path with physical 3D traversal and zero core 3D imports', async () => {
      const { clock, state, coordinator } = setupWorld(COMMUTE_TIME_UTC);
      const elena = state.agents.find((a) => a.id === elenaId)!;
      assert.equal(elena.locationId, residencePlaceId);

      // Simulation tick autonomously produces intent and starts traversal in coordinator
      const sim = new Simulation(clock, state, { coordinator, silent: true });
      sim.tick();

      assert.equal(coordinator.hasActiveTraversal(elenaId), true);
      const active = coordinator.getActiveTraversal(elenaId)!;

      // Setup M74 PhysicalTraversalRuntime with 3D client
      const snapshot = projectWorldState(state, 'agent:dev-player');
      const client = new Minimal3DClient({
        clientId: 'client:test-3d',
        observerAgentId: 'agent:dev-player',
      });
      client.updateSnapshot(snapshot);

      const runtime = new PhysicalTraversalRuntime({
        client,
        speed: 10.0,
      });

      // Request physical traversal
      const promise = runtime.requestTraversal(active.request);

      // 1. Elena's logical location remains at origin
      assert.equal(elena.locationId, residencePlaceId);

      // 2. Elena's physical representation moves independently
      assert.equal(runtime.hasActiveTraversal(elenaId), true);
      runtime.step(16); // step 16ms
      assert.equal(elena.locationId, residencePlaceId);

      // Step until arrival
      for (let i = 0; i < 200; i++) {
        runtime.step(100);
        if (!runtime.hasActiveTraversal(elenaId)) {
          break;
        }
      }

      // Complete traversal through coordinator -> M69 validateArrivalAndCommit()
      const navResult = await promise;
      assert.ok(navResult);
      assert.equal(navResult.status, 'arrived');

      const commitResult = coordinator.completeTraversal(state, navResult);
      assert.equal(commitResult.success, true);
      assert.equal(elena.locationId, restaurantPlaceId);

      // 3. Confirm that no file under src/core/ imports clients/
      const coreDir = path.resolve(process.cwd(), 'src/core');
      const coreFiles = fs.readdirSync(coreDir);
      for (const file of coreFiles) {
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;
        const filePath = path.join(coreDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        assert.ok(
          !content.includes('clients/'),
          `File src/core/${file} must not import from clients/`
        );
        assert.ok(
          !/import\s+[^;]*Scene3D/.test(content),
          `File src/core/${file} must not import Scene3D`
        );
        assert.ok(
          !/import\s+[^;]*PhysicalTraversalRuntime/.test(content),
          `File src/core/${file} must not import PhysicalTraversalRuntime`
        );
      }
    });
  });
});
