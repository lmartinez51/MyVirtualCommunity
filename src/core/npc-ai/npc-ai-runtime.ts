/**
 * Milestone 92: NPC AI Runtime Orchestrator
 * Milestone 94: Camila explorer support (per-agent goals/providers,
 * move_to_place / look_at, explore-only gate, notebook).
 *
 * Coordinates the full AI causal pipeline:
 * 1. Collect bounded perception (deriveNpcPerception)
 * 2. Assemble bounded context (Perception + Goal + Memory)
 * 3. Invoke replaceable cognition provider (NpcCognitionProvider)
 * 4. Validate structured proposal shape
 * 5. Translate proposal to World Core command
 * 6. Submit command through authoritative session controller queue
 * 7. Update structured memory and retain diagnostics
 *
 * Invariant:
 * The AI Runtime is NON-AUTHORITATIVE over World Core truth.
 * Provider timeouts, network errors, or malformed proposals NEVER corrupt WorldState.
 *
 * Milestone 94 notes:
 * - Goals and providers are per-agent: Elena keeps her attendant goal and
 *   default provider; Camila gets CAMILA_GOAL and the Muse Spark provider.
 * - move_to_place is translated through dispatchAgentIntent() and the
 *   RuntimeTraversalCoordinator (M75). While a traversal is active for an
 *   agent, further move proposals are skipped (no re-dispatch loops).
 *   Agent.locationId only changes on validated arrival commit — never here.
 * - Gated Phase 2 actions (push / pick up / carry / drop) are rejected
 *   while CAMILA_ACTIONS_ENABLED is off.
 * - Camila's notebook (if wired) gets one diary line per cycle and a visit
 *   record when her observed location changes. Notebook failures never fail
 *   a cycle.
 */

import type { WorldState } from '../world-state.js';
import type { WorldSessionController, CommandDispatchResult } from '../../server/session-controller.js';
import { NpcMemoryStore } from './npc-memory.js';
import { deriveNpcPerception } from './npc-perception.js';
import { DeterministicNpcCognitionProvider } from './providers/deterministic-cognition-provider.js';
import { createMoveToPlaceIntent, dispatchAgentIntent } from '../agent-intent.js';
import type { RuntimeTraversalCoordinator } from '../traversal-coordinator.js';
import { CAMILA_AGENT_ID, isCamilaActionAllowed, isCamilaActionEnabled } from './camila-config.js';
import { findProbeObjectById, findProbeObjectsByPlace } from '../camila-probe-objects.js';
import type { CamilaNotebook } from '../../persistence/camila-notebook.js';
import type {
  NpcCognitionProvider,
  NpcCognitionContext,
  NpcGoal,
  NpcActionProposal,
  NpcActionType,
  NpcAiCycleResult,
  NpcAiDiagnostics,
  NpcPerception,
} from './npc-cognition-types.js';

export const DEFAULT_ELENA_GOAL: NpcGoal = {
  goalId: 'wing-spot-attendant-duty',
  description:
    'Perform attendant duties at Wing Spot while on duty, welcoming customers and offering service.',
  priority: 1,
};

/** All action types the runtime knows how to validate (incl. gated ones). */
const VALID_ACTION_TYPES: readonly NpcActionType[] = [
  'observe',
  'offer_service',
  'approach_player',
  'acknowledge_player',
  'move_to_place',
  'look_at',
  'push_object',
  'pick_up_object',
  'carry_object',
  'drop_object',
];

export interface NpcAiRuntimeOptions {
  controller: WorldSessionController;
  provider?: NpcCognitionProvider;
  memoryStore?: NpcMemoryStore;
  goal?: NpcGoal;
  /** Per-agent provider overrides (e.g. Camila's Muse Spark provider). */
  agentProviders?: Readonly<Record<string, NpcCognitionProvider>>;
  /** Per-agent goal overrides (e.g. CAMILA_GOAL). */
  agentGoals?: Readonly<Record<string, NpcGoal>>;
  /** Traversal coordinator for move_to_place (M75). Without one, moves are rejected. */
  coordinator?: RuntimeTraversalCoordinator;
  /** Camila's notebook; wired by the server. Notebook failures never fail a cycle. */
  notebook?: CamilaNotebook;
  /** Override the explore-only gate (defaults to env CAMILA_ACTIONS_ENABLED). */
  actionsEnabled?: boolean;
}

export class NpcAiRuntime {
  private readonly controller: WorldSessionController;
  private provider: NpcCognitionProvider;
  private readonly memoryStore: NpcMemoryStore;
  private readonly goal: NpcGoal;
  private readonly agentProviders: Readonly<Record<string, NpcCognitionProvider>>;
  private readonly agentGoals: Readonly<Record<string, NpcGoal>>;
  private readonly coordinator?: RuntimeTraversalCoordinator;
  private readonly notebook?: CamilaNotebook;
  private readonly actionsEnabled: boolean;
  private cycleCounter: number = 0;
  private lastCycleByAgent = new Map<string, NpcAiCycleResult>();
  private lastLocationByAgent = new Map<string, string>();
  private activeTraversalStartedWallMs = new Map<string, number>();
  private static readonly MAX_STALE_TRAVERSAL_WALL_MS = 120_000;

  constructor(options: NpcAiRuntimeOptions) {
    this.controller = options.controller;
    this.provider = options.provider ?? new DeterministicNpcCognitionProvider();
    this.memoryStore = options.memoryStore ?? new NpcMemoryStore(15);
    this.goal = options.goal ?? DEFAULT_ELENA_GOAL;
    this.agentProviders = options.agentProviders ?? {};
    this.agentGoals = options.agentGoals ?? {};
    this.coordinator = options.coordinator;
    this.notebook = options.notebook;
    this.actionsEnabled = options.actionsEnabled ?? isCamilaActionEnabled();
  }

  public setProvider(provider: NpcCognitionProvider): void {
    this.provider = provider;
  }

  public getProvider(): NpcCognitionProvider {
    return this.provider;
  }

  public setProviderForAgent(agentId: string, provider: NpcCognitionProvider): void {
    (this.agentProviders as Record<string, NpcCognitionProvider>)[agentId] = provider;
  }

  public getProviderForAgent(agentId: string): NpcCognitionProvider {
    return this.agentProviders[agentId] ?? this.provider;
  }

  public getGoalForAgent(agentId: string): NpcGoal {
    return this.agentGoals[agentId] ?? this.goal;
  }

  public getMemoryStore(): NpcMemoryStore {
    return this.memoryStore;
  }

  public getPerception(agentId: string): NpcPerception {
    const state = (this.controller as any).state as WorldState;
    return deriveNpcPerception(state, agentId, this.memoryStore);
  }

  public getDiagnostics(agentId: string): NpcAiDiagnostics {
    return {
      agentId,
      providerId: this.getProviderForAgent(agentId).id,
      totalCycles: this.cycleCounter,
      lastCycle: this.lastCycleByAgent.get(agentId),
      activeGoal: this.getGoalForAgent(agentId),
      memoriesCount: this.memoryStore.getCount(),
    };
  }

  /**
   * Executes a single AI cognition cycle for the target agent.
   */
  public async runCycle(agentId: string): Promise<NpcAiCycleResult> {
    const startTime = Date.now();
    this.cycleCounter += 1;
    const cycleId = `cycle:${agentId}:${Date.now()}-${this.cycleCounter}`;

    const state = (this.controller as any).state as WorldState;
    const perception = deriveNpcPerception(state, agentId, this.memoryStore);
    const worldTime = perception.worldTime;
    const goal = this.getGoalForAgent(agentId);
    const provider = this.getProviderForAgent(agentId);

    // Milestone 94: record a notebook visit when Camila's observed location changed.
    if (agentId === CAMILA_AGENT_ID) {
      this.recordCamilaVisitIfMoved(perception);
    }

    // Milestone 94: never stack traversals — if Camila is mid-traversal, wait.
    // Guard against stale traversals (e.g. client disconnected mid-walk > 2 min).
    if (
      agentId === CAMILA_AGENT_ID &&
      this.coordinator?.hasActiveTraversal(agentId)
    ) {
      const startedWallMs = this.activeTraversalStartedWallMs.get(agentId) ?? 0;
      const elapsedWallMs = startedWallMs > 0 ? Date.now() - startedWallMs : 0;
      if (startedWallMs > 0 && elapsedWallMs > NpcAiRuntime.MAX_STALE_TRAVERSAL_WALL_MS) {
        this.coordinator.cancelTraversal(agentId, 'Stale traversal timeout exceeded without arrival report');
        this.activeTraversalStartedWallMs.delete(agentId);
      } else {
        const waiting: NpcAiCycleResult = {
          cycleId,
          agentId,
          worldTime,
          status: 'noop',
          perception,
          proposal: {
            actionType: 'observe',
            requestedAt: worldTime,
            reasoningContext: 'Traversal already in progress; waiting for arrival.',
          },
          durationMs: Date.now() - startTime,
        };
        this.lastCycleByAgent.set(agentId, waiting);
        return waiting;
      }
    }

    const context: NpcCognitionContext = {
      perception,
      goal,
      memories: this.memoryStore.getMemories(),
    };

    // 1. Invoke Cognition Provider safely
    let cognitionResult;
    try {
      cognitionResult = await provider.decideAction(context);
    } catch (providerError) {
      const errMessage = (providerError as Error).message || 'Provider execution failed';
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: 'provider_failed',
        perception,
        error: {
          code: 'provider-execution-failed',
          message: errMessage,
        },
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      this.appendCamilaDiary(agentId, worldTime, `El proveedor falló: ${errMessage}`);
      return result;
    }

    const proposal = cognitionResult.proposal;

    // 2. Validate Proposal Shape
    if (
      !proposal ||
      typeof proposal !== 'object' ||
      !VALID_ACTION_TYPES.includes(proposal.actionType)
    ) {
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: 'invalid_proposal',
        perception,
        proposal,
        error: {
          code: 'invalid-proposal-shape',
          message: `Malformed proposal or invalid actionType "${(proposal as any)?.actionType}"`,
        },
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    // 2b. Milestone 94: enforce the explore-only gate for Camila's Phase 2
    // interact actions. Elena's attendant actions are never gated.
    if (agentId === CAMILA_AGENT_ID && !isCamilaActionAllowed(proposal.actionType, this.actionsEnabled)) {
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: 'rejected',
        perception,
        proposal,
        error: {
          code: 'action-gated',
          message: `Action "${proposal.actionType}" is gated off in explore-only Phase 1. Set CAMILA_ACTIONS_ENABLED=true to unlock Phase 2 actions one at a time.`,
        },
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    // 3. Action Translation & World Core Command Dispatch
    if (proposal.actionType === 'observe') {
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: 'noop',
        perception,
        proposal,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      this.appendCamilaDiary(agentId, worldTime, `Observé en ${perception.locationId}. ${proposal.reasoningContext ?? ''}`);
      return result;
    }

    if (proposal.actionType === 'move_to_place') {
      const destination = proposal.destinationPlaceId;
      if (!destination) {
        const result: NpcAiCycleResult = {
          cycleId,
          agentId,
          worldTime,
          status: 'invalid_proposal',
          perception,
          proposal,
          error: {
            code: 'invalid-proposal-shape',
            message: 'move_to_place requires destinationPlaceId',
          },
          durationMs: Date.now() - startTime,
        };
        this.lastCycleByAgent.set(agentId, result);
        return result;
      }
      if (!this.coordinator) {
        const result: NpcAiCycleResult = {
          cycleId,
          agentId,
          worldTime,
          status: 'rejected',
          perception,
          proposal,
          error: {
            code: 'no-traversal-coordinator',
            message: 'move_to_place requires a RuntimeTraversalCoordinator; none is wired into this runtime.',
          },
          durationMs: Date.now() - startTime,
        };
        this.lastCycleByAgent.set(agentId, result);
        return result;
      }
      const intent = createMoveToPlaceIntent(agentId, destination, worldTime, proposal.reasoningContext);
      const dispatchResult = dispatchAgentIntent(state, intent, {
        coordinator: this.coordinator,
        currentTime: worldTime,
      });
      const success = dispatchResult.success;
      if (success) {
        this.activeTraversalStartedWallMs.set(agentId, Date.now());
        this.memoryStore.addMemory({
          type: 'discovery',
          summary: `Started moving toward "${destination}". ${proposal.reasoningContext ?? ''}`,
          timestamp: worldTime,
          placeId: destination,
        });
      }
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: success ? 'executed' : 'rejected',
        perception,
        proposal,
        commandDispatched: {
          commandName: 'move-to-place',
          payload: { destinationPlaceId: destination },
          success,
          error: success
            ? undefined
            : { code: (dispatchResult as { code: string }).code, message: dispatchResult.message },
        },
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      this.appendCamilaDiary(agentId, worldTime, `Me dirijo a ${destination}. ${proposal.reasoningContext ?? ''}`);
      return result;
    }

    if (proposal.actionType === 'look_at') {
      const objectId = proposal.targetObjectId;
      const object = objectId ? findProbeObjectById(objectId) : null;
      if (!object) {
        const result: NpcAiCycleResult = {
          cycleId,
          agentId,
          worldTime,
          status: 'invalid_proposal',
          perception,
          proposal,
          error: {
            code: 'invalid-proposal-shape',
            message: `look_at requires a known probe object id, got "${objectId ?? ''}"`,
          },
          durationMs: Date.now() - startTime,
        };
        this.lastCycleByAgent.set(agentId, result);
        return result;
      }
      this.memoryStore.addMemory({
        type: 'object_noticed',
        summary: `Noticed "${object.name}" (${object.id}) at ${object.placeId}: ${object.description}`,
        timestamp: worldTime,
        placeId: object.placeId,
      });
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: 'executed',
        perception,
        proposal,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      this.appendCamilaDiary(agentId, worldTime, `Miré ${object.name} en ${object.placeId}. ${proposal.reasoningContext ?? ''}`);
      return result;
    }

    // Phase 2 gated actions with the gate ON: types exist, execution does not yet.
    if (
      proposal.actionType === 'push_object' ||
      proposal.actionType === 'pick_up_object' ||
      proposal.actionType === 'carry_object' ||
      proposal.actionType === 'drop_object'
    ) {
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: 'rejected',
        perception,
        proposal,
        error: {
          code: 'action-not-implemented-yet',
          message: `Action "${proposal.actionType}" is unlocked but has no Phase 2 execution yet (no spatial object entity / carry physics).`,
        },
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (proposal.actionType === 'approach_player') {
      this.memoryStore.addMemory({
        type: 'player_observed',
        summary: `Approached player "${perception.perceivedPlayer?.name ?? 'customer'}" at service counter.`,
        timestamp: worldTime,
        targetAgentId: proposal.targetAgentId,
        establishmentId: proposal.establishmentId,
      });

      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: 'executed',
        perception,
        proposal,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (proposal.actionType === 'acknowledge_player') {
      const targetId = proposal.targetAgentId || perception.perceivedPlayer?.id;
      let dispatchResult: CommandDispatchResult | undefined;

      if (targetId) {
        dispatchResult = await this.controller.dispatchCommand('greetAgent', {
          targetAgentId: targetId,
        });
      }

      const success = Boolean(dispatchResult?.success);
      if (success) {
        this.memoryStore.addMemory({
          type: 'greeting_exchanged',
          summary: `Greeted player "${perception.perceivedPlayer?.name ?? targetId}".`,
          timestamp: worldTime,
          targetAgentId: targetId,
        });
      }

      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: success ? 'executed' : 'rejected',
        perception,
        proposal,
        commandDispatched: {
          commandName: 'greetAgent',
          payload: { targetAgentId: targetId },
          success,
          error: dispatchResult?.error,
        },
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (proposal.actionType === 'offer_service') {
      const establishmentId = proposal.establishmentId || 'restaurant:wing-spot';
      const dispatchResult = await this.controller.dispatchCommand('requestRestaurantService', {
        restaurantId: establishmentId,
      });

      const success = Boolean(dispatchResult.success);
      if (success) {
        this.memoryStore.addMemory({
          type: 'service_offered',
          summary: `Offered and accepted restaurant service at ${establishmentId}.`,
          timestamp: worldTime,
          targetAgentId: proposal.targetAgentId,
          establishmentId,
        });
      }

      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: success ? 'executed' : 'rejected',
        perception,
        proposal,
        commandDispatched: {
          commandName: 'requestRestaurantService',
          payload: { restaurantId: establishmentId },
          success,
          error: dispatchResult.error,
        },
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    const fallbackResult: NpcAiCycleResult = {
      cycleId,
      agentId,
      worldTime,
      status: 'noop',
      perception,
      proposal,
      durationMs: Date.now() - startTime,
    };
    this.lastCycleByAgent.set(agentId, fallbackResult);
    return fallbackResult;
  }

  /**
   * Milestone 94: called by WorldSessionController after an active traversal
   * authoritatively completes (arrived or interrupted). Records a place_visited
   * memory and updates Camila's notebook when arrival committed.
   */
  public recordTraversalArrival(
    agentId: string,
    arrivedPlaceId: string | undefined,
    worldTime: string,
    committed: boolean
  ): void {
    this.activeTraversalStartedWallMs.delete(agentId);
    if (!committed || !arrivedPlaceId) return;

    this.memoryStore.addMemory({
      type: 'place_visited',
      summary: `Arrived at "${arrivedPlaceId}".`,
      timestamp: worldTime,
      placeId: arrivedPlaceId,
    });

    if (agentId === CAMILA_AGENT_ID) {
      this.lastLocationByAgent.set(agentId, arrivedPlaceId);
      if (this.notebook) {
        try {
          const objectIds = findProbeObjectsByPlace(arrivedPlaceId).map((o) => o.id);
          this.notebook.recordVisit(arrivedPlaceId, worldTime, objectIds);
          this.notebook.addDiaryEntry(
            `Llegué a ${arrivedPlaceId}.`,
            worldTime,
            arrivedPlaceId
          );
          this.notebook.save();
        } catch {
          // Notebook failures never fail a traversal completion.
        }
      }
    }
  }

  /** Milestone 94: record a notebook visit when Camila's observed location changed. */
  private recordCamilaVisitIfMoved(perception: NpcPerception): void {
    const previous = this.lastLocationByAgent.get(perception.agentId);
    this.lastLocationByAgent.set(perception.agentId, perception.locationId);
    if (!this.notebook || previous === undefined || previous === perception.locationId) return;
    try {
      const objectIds = findProbeObjectsByPlace(perception.locationId).map((o) => o.id);
      this.notebook.recordVisit(perception.locationId, perception.worldTime, objectIds);
      this.notebook.addDiaryEntry(
        `Llegué a ${perception.locationId}.`,
        perception.worldTime,
        perception.locationId
      );
      this.notebook.save();
    } catch {
      // Notebook failures never fail a cycle.
    }
  }

  /** Milestone 94: one diary line per Camila cycle (best effort, capped). */
  private appendCamilaDiary(agentId: string, worldTime: string, text: string): void {
    if (agentId !== CAMILA_AGENT_ID || !this.notebook || !text.trim()) return;
    try {
      this.notebook.addDiaryEntry(text.trim(), worldTime);
      this.notebook.save();
    } catch {
      // Notebook failures never fail a cycle.
    }
  }
}
