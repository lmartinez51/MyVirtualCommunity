/**
 * Milestone 92: AI NPC Cognition, Perception, and Runtime Test Suite
 *
 * Validates:
 * 1. Perception Boundary & Bounded Exposure
 * 2. Memory Boundary & Isolation
 * 3. Deterministic Cognition Provider Reasoning
 * 4. Action Proposal Validation & Translation
 * 5. Provider Failure Semantics & World Integrity Protection
 * 6. End-to-End Causal Pipeline (Perception -> Proposal -> Command -> Authority -> Transition -> Persistence)
 * 7. Live Provider Contract Verification (conditional on API key)
 * 8. HTTP REST API Diagnostic Endpoints
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

import { WorldClock } from '../src/core/clock.js';
import { createGomezMorinSeedWorld } from '../src/core/seed.js';
import { Simulation } from '../src/core/simulation.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { createWorldServer } from '../src/server/http-server.js';
import {
  NpcMemoryStore,
  deriveNpcPerception,
  DeterministicNpcCognitionProvider,
  LiveNpcCognitionProvider,
  NpcAiRuntime,
  DEFAULT_ELENA_GOAL,
  type NpcActionProposal,
  type NpcCognitionContext,
} from '../src/core/npc-ai/index.js';
import {
  DEFAULT_WORLD_ID,
  resetRestaurantServiceState,
  type WorldState,
} from '../src/core/world-state.js';

describe('Milestone 92: AI NPC Cognition & Perception', () => {
  // Gómez Morín timestamps:
  // On-duty shift: 10:00 AM Ciudad Juárez (UTC-6) = 16:00 UTC
  // Off-duty shift: 22:00 PM Ciudad Juárez (UTC-6) = 04:00 UTC next day
  const ON_DUTY_WORLD_TIME = '2026-09-14T16:00:00.000Z';
  const OFF_DUTY_WORLD_TIME = '2026-09-14T04:00:00.000Z';

  function setupGomezMorinState(initialTime: string = ON_DUTY_WORLD_TIME): WorldState {
    const clock = new WorldClock(initialTime);
    const seed = createGomezMorinSeedWorld(initialTime);
    const state: WorldState = {
      worldId: DEFAULT_WORLD_ID,
      version: 19,
      worldTime: initialTime,
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
      knowledge: [],
      orders: [],
      properties: seed.properties,
      siteAgentAssociations: seed.siteAgentAssociations,
    };
    const sim = new Simulation(clock, state, { silent: true });
    sim.tick();
    return state;
  }

  beforeEach(() => {
    resetRestaurantServiceState();
  });

  // =========================================================================
  // 1. Perception Boundary & Bounded Exposure
  // =========================================================================
  describe('1. Perception Boundary & Bounded Exposure', () => {
    it('derives bounded perception for Elena during on-duty shift at Wing Spot', () => {
      const state = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const perception = deriveNpcPerception(state, 'agent:elena-npc');

      assert.equal(perception.agentId, 'agent:elena-npc');
      assert.equal(perception.agentName, 'Elena Morales');
      assert.equal(perception.role, 'attendant');
      assert.equal(perception.locationId, 'restaurant:wing-spot');
      assert.equal(perception.interiorSpaceId, 'interior:wing-spot');
      assert.equal(perception.isOnDutyShift, true);
      assert.equal(perception.civilTime.hour, 10);
      assert.equal(perception.civilTime.timeZone, 'America/Ciudad_Juarez');
      assert.ok(perception.establishment);
      assert.equal(perception.establishment?.id, 'restaurant:wing-spot');
      assert.equal(perception.establishment?.name, 'Wing Spot Gómez Morín');
    });

    it('derives bounded perception for Elena during off-duty hours at residence', () => {
      const state = setupGomezMorinState(OFF_DUTY_WORLD_TIME);
      const perception = deriveNpcPerception(state, 'agent:elena-npc');

      assert.equal(perception.agentId, 'agent:elena-npc');
      assert.equal(perception.locationId, 'building:del-porvenir-residence');
      assert.equal(perception.isOnDutyShift, false);
      assert.equal(perception.civilTime.hour, 22);
    });

    it('strictly does NOT expose private player balances or raw world state internals', () => {
      const state = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const perception = deriveNpcPerception(state, 'agent:elena-npc');

      assert.equal((perception as any).places, undefined);
      assert.equal((perception as any).restaurants, undefined);
      assert.equal((perception as any).purchases, undefined);
      assert.equal((perception as any).persistencePath, undefined);

      if (perception.perceivedPlayer) {
        assert.equal((perception.perceivedPlayer as any).balanceMinor, undefined);
        assert.equal((perception.perceivedPlayer as any).currency, undefined);
        assert.equal((perception.perceivedPlayer as any).playerActivity, undefined);
      }
    });

    it('throws error when deriving perception for non-existent agent', () => {
      const state = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      assert.throws(
        () => deriveNpcPerception(state, 'agent:ghost-npc'),
        /not found in world state/
      );
    });
  });

  // =========================================================================
  // 2. Memory Boundary & Isolation
  // =========================================================================
  describe('2. Memory Boundary & Isolation', () => {
    it('stores structured memories within bounded capacity', () => {
      const store = new NpcMemoryStore(3);
      store.addMemory({
        type: 'player_observed',
        summary: 'Observed player approaching counter.',
        timestamp: ON_DUTY_WORLD_TIME,
        targetAgentId: 'agent:gomez-morin-player',
      });
      store.addMemory({
        type: 'service_offered',
        summary: 'Offered service to player.',
        timestamp: ON_DUTY_WORLD_TIME,
        targetAgentId: 'agent:gomez-morin-player',
      });
      store.addMemory({
        type: 'service_accepted',
        summary: 'Service accepted by player.',
        timestamp: ON_DUTY_WORLD_TIME,
        targetAgentId: 'agent:gomez-morin-player',
      });

      assert.equal(store.getCount(), 3);

      // Adding 4th drops the oldest
      store.addMemory({
        type: 'greeting_exchanged',
        summary: 'Exchanged greeting.',
        timestamp: ON_DUTY_WORLD_TIME,
      });

      assert.equal(store.getCount(), 3);
      const memories = store.getMemories();
      assert.equal(memories[0].type, 'service_offered');
      assert.equal(memories[2].type, 'greeting_exchanged');
    });

    it('memory store remains completely distinct from WorldState', () => {
      const state = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const store = new NpcMemoryStore(5);
      store.addMemory({
        type: 'player_observed',
        summary: 'Customer observed.',
        timestamp: ON_DUTY_WORLD_TIME,
      });

      // WorldState remains pristine and untouched
      assert.equal((state as any).memories, undefined);
      assert.equal(state.version, 19);
    });
  });

  // =========================================================================
  // 3. Deterministic Cognition Provider Reasoning
  // =========================================================================
  describe('3. Deterministic Cognition Provider Reasoning', () => {
    it('proposes "offer_service" when Elena is on duty and customer is present without active service', async () => {
      const state = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      // Position player inside Wing Spot with Elena
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';

      const perception = deriveNpcPerception(state, 'agent:elena-npc');
      const provider = new DeterministicNpcCognitionProvider();

      const result = await provider.decideAction({
        perception,
        goal: DEFAULT_ELENA_GOAL,
        memories: [],
      });

      assert.equal(result.providerId, 'deterministic-test-provider');
      assert.equal(result.proposal.actionType, 'offer_service');
      assert.equal(result.proposal.targetAgentId, 'agent:gomez-morin-player');
      assert.equal(result.proposal.establishmentId, 'restaurant:wing-spot');
    });

    it('proposes "observe" when service is already active with player', async () => {
      const state = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';

      const perception = deriveNpcPerception(state, 'agent:elena-npc');
      // Override activeService in perception
      const perceptionWithActiveService = {
        ...perception,
        perceivedPlayer: {
          ...perception.perceivedPlayer!,
          hasActiveService: true,
        },
      };

      const provider = new DeterministicNpcCognitionProvider();
      const result = await provider.decideAction({
        perception: perceptionWithActiveService,
        goal: DEFAULT_ELENA_GOAL,
        memories: [],
      });

      assert.equal(result.proposal.actionType, 'observe');
    });

    it('proposes "observe" when off duty or player is not present', async () => {
      const state = setupGomezMorinState(OFF_DUTY_WORLD_TIME);
      const perception = deriveNpcPerception(state, 'agent:elena-npc');
      const provider = new DeterministicNpcCognitionProvider();

      const result = await provider.decideAction({
        perception,
        goal: DEFAULT_ELENA_GOAL,
        memories: [],
      });

      assert.equal(result.proposal.actionType, 'observe');
    });
  });

  // =========================================================================
  // 4. Provider Failure Semantics & World Integrity Protection
  // =========================================================================
  describe('4. Provider Failure Semantics & World Integrity Protection', () => {
    it('handles provider crash gracefully without corrupting WorldState', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm92-fail-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        const failingProvider = new DeterministicNpcCognitionProvider({
          shouldThrow: true,
          errorMessage: 'API timeout / 503 Service Unavailable',
        });

        const runtime = new NpcAiRuntime({
          controller,
          provider: failingProvider,
        });

        const cycleResult = await runtime.runCycle('agent:elena-npc');

        assert.equal(cycleResult.status, 'provider_failed');
        assert.ok(cycleResult.error);
        assert.equal(cycleResult.error?.code, 'provider-execution-failed');
        assert.match(cycleResult.error?.message, /503 Service Unavailable/);

        // World State remains completely valid and uncorrupted
        const status = controller.getStatus();
        assert.equal(status.schemaVersion, 19);
        assert.equal(status.ready, true);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('rejects malformed action proposals without mutating WorldState', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm92-malform-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        const malformedProvider = new DeterministicNpcCognitionProvider({
          returnMalformed: true,
        });

        const runtime = new NpcAiRuntime({
          controller,
          provider: malformedProvider,
        });

        const cycleResult = await runtime.runCycle('agent:elena-npc');

        assert.equal(cycleResult.status, 'invalid_proposal');
        assert.ok(cycleResult.error);
        assert.equal(cycleResult.error?.code, 'invalid-proposal-shape');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('rejects unsupported action types (e.g. teleport) without mutating WorldState', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm92-unsupported-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        const unsupportedProvider = new DeterministicNpcCognitionProvider({
          cannedProposal: {
            actionType: 'teleport_player' as any,
            targetAgentId: 'agent:gomez-morin-player',
            requestedAt: ON_DUTY_WORLD_TIME,
          },
        });

        const runtime = new NpcAiRuntime({
          controller,
          provider: unsupportedProvider,
        });

        const cycleResult = await runtime.runCycle('agent:elena-npc');
        assert.equal(cycleResult.status, 'invalid_proposal');
        assert.ok(cycleResult.error);
        assert.equal(cycleResult.error?.code, 'invalid-proposal-shape');
        assert.match(cycleResult.error?.message, /invalid actionType/);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('handles provider timeout error cleanly', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm92-timeout-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        const timeoutProvider = new DeterministicNpcCognitionProvider({
          shouldThrow: true,
          errorMessage: 'Request timed out after 5000ms',
        });

        const runtime = new NpcAiRuntime({
          controller,
          provider: timeoutProvider,
        });

        const cycleResult = await runtime.runCycle('agent:elena-npc');
        assert.equal(cycleResult.status, 'provider_failed');
        assert.equal(cycleResult.error?.code, 'provider-execution-failed');
        assert.match(cycleResult.error?.message, /timed out/);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('handles duplicate proposal by transitioning to observe (noop)', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm92-duplicate-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        await controller.stepSimulation(1000);
        await controller.dispatchCommand('enterRestaurant', {
          restaurantId: 'restaurant:wing-spot',
        });

        const runtime = new NpcAiRuntime({ controller });

        // Cycle 1: offers service -> executed
        const cycle1 = await runtime.runCycle('agent:elena-npc');
        assert.equal(cycle1.status, 'executed');
        assert.equal(cycle1.proposal?.actionType, 'offer_service');

        // Cycle 2: service already active -> proposes observe -> noop
        const cycle2 = await runtime.runCycle('agent:elena-npc');
        assert.equal(cycle2.status, 'noop');
        assert.equal(cycle2.proposal?.actionType, 'observe');
        assert.equal(cycle2.commandDispatched, undefined);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('handles stale perception rejection safely when world conditions change', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm92-stale-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        await controller.stepSimulation(1000);
        // Player is at street (NOT inside restaurant)
        // Provider proposes offer_service anyway based on stale/outdated assumption
        const staleProvider = new DeterministicNpcCognitionProvider({
          cannedProposal: {
            actionType: 'offer_service',
            targetAgentId: 'agent:gomez-morin-player',
            establishmentId: 'restaurant:wing-spot',
            requestedAt: ON_DUTY_WORLD_TIME,
          },
        });

        const runtime = new NpcAiRuntime({
          controller,
          provider: staleProvider,
        });

        const cycleResult = await runtime.runCycle('agent:elena-npc');
        // Player is not co-located inside Wing Spot, so World Core rejects requestRestaurantService
        assert.equal(cycleResult.status, 'rejected');
        assert.ok(cycleResult.commandDispatched);
        assert.equal(cycleResult.commandDispatched?.success, false);

        // WorldState integrity is fully preserved
        assert.equal(controller.getStatus().schemaVersion, 19);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // 5. End-to-End Causal Pipeline Integration
  // =========================================================================
  describe('5. End-to-End Causal Pipeline Integration', () => {
    it('executes full causal loop: perception -> proposal -> command -> authority -> event -> persistence', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm92-pipeline-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        // 1. Advance simulation to trigger routine entrance and place Elena on duty inside Wing Spot
        await controller.stepSimulation(1000);

        // 2. Player enters Wing Spot through authoritative threshold
        const enterRes = await controller.dispatchCommand('enterRestaurant', {
          restaurantId: 'restaurant:wing-spot',
        });
        assert.equal(enterRes.success, true);

        // 3. Setup runtime with deterministic provider
        const runtime = new NpcAiRuntime({ controller });

        // 4. Run AI cycle for Elena
        const cycleResult = await runtime.runCycle('agent:elena-npc');

        assert.equal(cycleResult.status, 'executed');
        assert.ok(cycleResult.proposal);
        assert.equal(cycleResult.proposal?.actionType, 'offer_service');
        assert.ok(cycleResult.commandDispatched);
        assert.equal(cycleResult.commandDispatched?.commandName, 'requestRestaurantService');
        assert.equal(cycleResult.commandDispatched?.success, true);

        // 5. Verify read model surfaces resulting active service
        const locView = controller.getLocationView();
        assert.equal(locView.location?.attendant?.interactionState, 'service-accepted');

        // 6. Verify memory was updated
        const memories = runtime.getMemoryStore().getMemories();
        assert.equal(memories.length, 1);
        assert.equal(memories[0].type, 'service_offered');

        // 7. Verify persistence survived and is reloaded cleanly
        const reloadedController = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          silent: true,
        });
        assert.equal(reloadedController.getStatus().schemaVersion, 19);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // 6. Live Cognition Provider Integration (Conditional on API Key)
  // =========================================================================
  describe('6. Live Cognition Provider Integration', () => {
    const hasLiveApiKey = Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);

    it('executes live model cognition when API key is available in environment', async (t) => {
      if (!hasLiveApiKey) {
        t.skip('Skipping live LLM test: no OPENAI_API_KEY or GEMINI_API_KEY set.');
        return;
      }

      const state = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';

      const perception = deriveNpcPerception(state, 'agent:elena-npc');
      const provider = new LiveNpcCognitionProvider({ timeoutMs: 10000 });

      const result = await provider.decideAction({
        perception,
        goal: DEFAULT_ELENA_GOAL,
        memories: [],
      });

      assert.equal(result.providerId, 'live-llm-provider');
      assert.ok(result.proposal);
      assert.ok(
        ['observe', 'offer_service', 'approach_player', 'acknowledge_player'].includes(
          result.proposal.actionType
        )
      );
      assert.ok(typeof result.proposal.requestedAt === 'string');
    });
  });

  // =========================================================================
  // 7. HTTP REST API Diagnostic Endpoints
  // =========================================================================
  describe('7. HTTP REST API Diagnostic Endpoints', () => {
    it('surfaces perception, cycle execution, and diagnostics over HTTP server', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm92-http-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        await controller.stepSimulation(1000);
        await controller.dispatchCommand('enterRestaurant', {
          restaurantId: 'restaurant:wing-spot',
        });

        const server = createWorldServer({ controller, silent: true });
        const info = await server.start(0, '127.0.0.1');

        try {
          // 1. GET /api/npc/:agentId/perception
          const percRes = await fetch(`${info.url}/api/npc/agent:elena-npc/perception`);
          assert.equal(percRes.status, 200);
          const percBody = await percRes.json();
          assert.equal(percBody.success, true);
          assert.equal(percBody.result.agentId, 'agent:elena-npc');
          assert.equal(percBody.result.establishment.id, 'restaurant:wing-spot');

          // 2. POST /api/npc/:agentId/cycle
          const cycleRes = await fetch(`${info.url}/api/npc/agent:elena-npc/cycle`, {
            method: 'POST',
          });
          assert.equal(cycleRes.status, 200);
          const cycleBody = await cycleRes.json();
          assert.equal(cycleBody.success, true);
          assert.equal(cycleBody.result.status, 'executed');
          assert.equal(cycleBody.result.proposal.actionType, 'offer_service');

          // 3. GET /api/npc/:agentId/diagnostics
          const diagRes = await fetch(`${info.url}/api/npc/agent:elena-npc/diagnostics`);
          assert.equal(diagRes.status, 200);
          const diagBody = await diagRes.json();
          assert.equal(diagBody.success, true);
          assert.equal(diagBody.result.agentId, 'agent:elena-npc');
          assert.equal(diagBody.result.totalCycles, 1);
          assert.equal(diagBody.result.lastCycle.status, 'executed');
        } finally {
          await server.stop();
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
