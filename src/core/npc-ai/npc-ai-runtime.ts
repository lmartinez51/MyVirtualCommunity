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
import {
  CamilaProbeObjectState,
  CAMILA_OBJECT_POSITION_BOUNDS,
  isValidObjectPosition,
  type UnityPosition,
} from '../camila-probe-object-state.js';
import { CAMILA_UNITY_ANCHORS } from '../camila-world-state.js';
import type { CamilaNotebook } from '../../persistence/camila-notebook.js';
import type {
  NpcCognitionProvider,
  NpcCognitionContext,
  NpcGoal,
  NpcActionProposal,
  NpcActionType,
  NpcAiCycleResult,
  NpcAiCycleStatus,
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
  /** Mutable probe-object positions (Phase 2a). Defaults to a store on the standard path. */
  objectState?: CamilaProbeObjectState;
}

/**
 * Result of completing a reported object interaction (push).
 * `committed` is true only when the new position was written to the
 * object-position store; a failed report or a stale/missing pending push
 * never commits anything.
 */
export interface CamilaObjectPushResult {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly agentId: string;
  readonly targetObjectId: string;
  readonly committed: boolean;
  readonly newPosition?: UnityPosition;
}

/** A push the runtime dispatched and is waiting for Unity to report back. */
export interface PendingCamilaPush {
  readonly agentId: string;
  readonly targetObjectId: string;
  readonly fromPosition: UnityPosition;
  readonly expectedPosition: UnityPosition;
  readonly pushTowardsPlaceId?: string;
  /** Camila's own hypothesis from her decision, if she offered one. */
  readonly hypothesis?: string;
  readonly worldTime: string;
  readonly startedWallMs: number;
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
  private readonly objectState: CamilaProbeObjectState;
  private cycleCounter: number = 0;
  private lastCycleByAgent = new Map<string, NpcAiCycleResult>();
  private lastLocationByAgent = new Map<string, string>();
  private activeTraversalStartedWallMs = new Map<string, number>();
  private static readonly MAX_STALE_TRAVERSAL_WALL_MS = 120_000;
  /** Phase 2a: deterministic push distance (metres) and stale-push timeout. */
  public static readonly PUSH_DISTANCE_METRES = 1.5;
  private static readonly MAX_STALE_PUSH_WALL_MS = 120_000;
  /** Affordances that make an object pushable. 'stationary' objects never are. */
  private static readonly PUSHABLE_AFFORDANCES: readonly string[] = [
    'movable',
    'kickable',
    'rollable',
  ];
  private pendingPushByAgent = new Map<string, PendingCamilaPush>();

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
    this.objectState = options.objectState ?? new CamilaProbeObjectState();
  }

  /** Current mutable probe-object positions (read-only snapshot). */
  public getObjectPositions(): Record<string, UnityPosition> {
    return this.objectState.getAllPositions();
  }

  /** The push this agent dispatched and Unity has not reported back yet, if any. */
  public getPendingPush(agentId: string): PendingCamilaPush | undefined {
    return this.pendingPushByAgent.get(agentId);
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

    // Phase 2a: push_object is executed (gate already enforced above).
    // pick_up / carry / drop are still Phase 2b: types exist, execution does not.
    if (proposal.actionType === 'push_object') {
      const pushResult = this.executePushObject(agentId, perception, proposal, worldTime);
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: pushResult.status,
        perception,
        proposal,
        commandDispatched: pushResult.commandDispatched,
        error: pushResult.error,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (
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
          message: `Action "${proposal.actionType}" is unlocked but has no Phase 2 execution yet (Phase 2b: pick up / carry / drop).`,
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
   * Milestone 94 Phase 2a: executes a validated push_object proposal.
   *
   * Validation order (strict, model can invent nothing):
   * 1. Only Camila pushes. 2. targetObjectId must be a known probe object.
   * 3. No other push may be pending for her (one push at a time; a stale
   *    pending push older than 120 s is dropped, like stale traversals).
   * 4. The object must be in her CURRENT place — she must move_to_place
   *    first; the runtime never auto-moves her.
   * 5. The object must be pushable (affordances movable / kickable /
   *    rollable). Stationary objects (bench, bin, goal, wall, puddle) refuse.
   * 6. pushTowardsPlaceId, when present, must be a known place with a Unity
   *    anchor, so the push direction is computable.
   *
   * On success the push is DISPATCHED, not committed: the expected new
   * position is computed deterministically (1.5 m) and recorded as a pending
   * push. Unity walks to the object, kicks / pushes it, and reports the
   * physical result back via completeObjectPush() — only that report commits
   * the position to the object-position store, memory and notebook.
   */
  private executePushObject(
    agentId: string,
    perception: NpcPerception,
    proposal: NpcActionProposal,
    worldTime: string
  ): {
    status: NpcAiCycleStatus;
    commandDispatched?: NpcAiCycleResult['commandDispatched'];
    error?: { code: string; message: string };
  } {
    const invalid = (message: string) => ({
      status: 'invalid_proposal' as NpcAiCycleStatus,
      error: { code: 'invalid-proposal-shape', message },
    });
    const rejected = (code: string, message: string) => ({
      status: 'rejected' as NpcAiCycleStatus,
      error: { code, message },
    });

    if (agentId !== CAMILA_AGENT_ID) {
      return rejected('action-not-for-agent', `Only ${CAMILA_AGENT_ID} can push objects.`);
    }
    const objectId = proposal.targetObjectId;
    if (!objectId) return invalid('push_object requires targetObjectId');
    const object = findProbeObjectById(objectId);
    if (!object) return invalid(`push_object requires a known probe object id, got "${objectId}"`);

    // One push at a time; drop a stale pending push (Unity never reported back).
    const pending = this.pendingPushByAgent.get(agentId);
    if (pending) {
      if (Date.now() - pending.startedWallMs > NpcAiRuntime.MAX_STALE_PUSH_WALL_MS) {
        this.pendingPushByAgent.delete(agentId);
      } else {
        return rejected(
          'push-pending',
          `A push of "${pending.targetObjectId}" is still waiting for Unity to report back; finish it first.`
        );
      }
    }

    if (object.placeId !== perception.locationId) {
      return rejected(
        'object-not-nearby',
        `Camila is at "${perception.locationId}" but "${object.name}" (${object.id}) is at "${object.placeId}". She must move_to_place there first; the runtime never moves her automatically.`
      );
    }
    if (!object.affordances.some((a) => NpcAiRuntime.PUSHABLE_AFFORDANCES.includes(a))) {
      return rejected(
        'object-not-pushable',
        `"${object.name}" (${object.id}) is not pushable (affordances: ${object.affordances.join(', ')}). Only movable / kickable / rollable objects can be pushed.`
      );
    }

    let towardsAnchor: UnityPosition | undefined;
    if (proposal.pushTowardsPlaceId !== undefined) {
      const knownPlace = (perception.nearbyPlaces ?? []).some(
        (p) => p.id === proposal.pushTowardsPlaceId
      );
      if (!knownPlace) {
        return invalid(`pushTowardsPlaceId "${proposal.pushTowardsPlaceId}" is not a known place`);
      }
      towardsAnchor = CAMILA_UNITY_ANCHORS[proposal.pushTowardsPlaceId];
      if (!towardsAnchor) {
        return rejected(
          'push-towards-place-has-no-anchor',
          `Place "${proposal.pushTowardsPlaceId}" has no Unity anchor, so a push direction toward it cannot be computed.`
        );
      }
    }

    const fromPosition = this.objectState.getPosition(object.id);
    if (!fromPosition) return invalid(`No current position known for object "${object.id}"`);
    const camilaAnchor = CAMILA_UNITY_ANCHORS[perception.locationId];
    const expectedPosition = this.computePushPosition(fromPosition, towardsAnchor, camilaAnchor);

    this.pendingPushByAgent.set(agentId, {
      agentId,
      targetObjectId: object.id,
      fromPosition,
      expectedPosition,
      pushTowardsPlaceId: proposal.pushTowardsPlaceId,
      hypothesis: proposal.hypothesis,
      worldTime,
      startedWallMs: Date.now(),
    });

    return {
      status: 'executed',
      commandDispatched: {
        commandName: 'push-object',
        payload: {
          targetObjectId: object.id,
          fromPosition,
          expectedPosition,
          pushTowardsPlaceId: proposal.pushTowardsPlaceId ?? null,
          pushDistanceMetres: NpcAiRuntime.PUSH_DISTANCE_METRES,
        },
        success: true,
      },
    };
  }

  /**
   * Deterministic push geometry (Unity frame, XZ plane, Y unchanged):
   * 1.5 m toward the pushTowardsPlaceId anchor when given, otherwise away
   * from Camila's current place anchor. Degenerate directions fall back to
   * +Z (south). The result is clamped to the slice bounds.
   */
  private computePushPosition(
    from: UnityPosition,
    towardsAnchor: UnityPosition | undefined,
    camilaAnchor: UnityPosition | undefined
  ): UnityPosition {
    let dx = 0;
    let dz = 0;
    if (towardsAnchor) {
      dx = towardsAnchor.x - from.x;
      dz = towardsAnchor.z - from.z;
    } else if (camilaAnchor) {
      dx = from.x - camilaAnchor.x;
      dz = from.z - camilaAnchor.z;
    }
    const len = Math.hypot(dx, dz);
    if (len < 0.01) {
      dx = 0;
      dz = 1;
    } else {
      dx /= len;
      dz /= len;
    }
    const d = NpcAiRuntime.PUSH_DISTANCE_METRES;
    const b = CAMILA_OBJECT_POSITION_BOUNDS;
    return {
      x: Math.min(b.maxX, Math.max(b.minX, from.x + dx * d)),
      y: from.y,
      z: Math.min(b.maxZ, Math.max(b.minZ, from.z + dz * d)),
    };
  }

  /**
   * Milestone 94 Phase 2a: completes a dispatched push from Unity's physical
   * report (POST /api/npc/:agentId/object-interaction, via SessionController).
   * Only a matching pending push can commit: the reported position is the
   * physical truth (physics may roll the object further than the 1.5 m
   * prediction), so it is committed as reported after bounds validation.
   * A 'failed' report clears the pending push with no commit. Notebook and
   * memory updates are best-effort and never fail the interaction.
   */
  public completeObjectPush(
    agentId: string,
    targetObjectId: string | undefined,
    status: 'applied' | 'failed',
    reportedPosition: UnityPosition | undefined,
    worldTime: string
  ): CamilaObjectPushResult {
    const fail = (
      code: string,
      message: string,
      committed = false
    ): CamilaObjectPushResult => ({
      success: false,
      code,
      message,
      agentId,
      targetObjectId: targetObjectId ?? '',
      committed,
    });

    const pending = this.pendingPushByAgent.get(agentId);
    if (!pending || pending.targetObjectId !== targetObjectId) {
      return fail(
        'no-pending-push',
        `No pending push of "${targetObjectId ?? ''}" for agent "${agentId}" to complete.`
      );
    }

    if (status === 'failed') {
      this.pendingPushByAgent.delete(agentId);
      return {
        success: true,
        code: 'push-failed-reported',
        message: `Unity reported the push of "${targetObjectId}" failed; no position change committed.`,
        agentId,
        targetObjectId: targetObjectId ?? '',
        committed: false,
      };
    }

    const object = findProbeObjectById(targetObjectId ?? '');
    if (!object) {
      this.pendingPushByAgent.delete(agentId);
      return fail('unknown-object', `Unknown probe object "${targetObjectId ?? ''}".`);
    }
    if (!reportedPosition || !isValidObjectPosition(reportedPosition)) {
      this.pendingPushByAgent.delete(agentId);
      return fail(
        'invalid-reported-position',
        'An applied push report must carry a finite, in-bounds newPosition {x, y, z}.'
      );
    }

    const previous = this.objectState.getPosition(object.id);
    if (!previous || !this.objectState.setPosition(object.id, reportedPosition)) {
      this.pendingPushByAgent.delete(agentId);
      return fail('invalid-reported-position', `Could not set a new position for "${object.id}".`);
    }
    try {
      this.objectState.save();
    } catch (err) {
      this.objectState.setPosition(object.id, previous);
      this.pendingPushByAgent.delete(agentId);
      return fail(
        'object-position-persist-failed',
        `Failed to persist the new position of "${object.id}": ${(err as Error).message}`
      );
    }
    this.pendingPushByAgent.delete(agentId);

    // Memory + notebook (best effort — never fails the interaction).
    try {
      const towardsText = pending.pushTowardsPlaceId
        ? `hacia ${pending.pushTowardsPlaceId}`
        : 'lejos de mí';
      this.memoryStore.addMemory({
        type: 'object_noticed',
        summary: `Empujé "${object.name}" (${object.id}) en ${object.placeId}: rodó ${towardsText} desde (${previous.x}, ${previous.y}, ${previous.z}) hasta (${reportedPosition.x}, ${reportedPosition.y}, ${reportedPosition.z}).`,
        timestamp: worldTime,
        placeId: object.placeId,
      });
      if (this.notebook) {
        this.notebook.addDiaryEntry(
          `Empujé ${object.name} y rodó ${towardsText}. Ahora está en (${reportedPosition.x}, ${reportedPosition.y}, ${reportedPosition.z}).`,
          worldTime,
          object.placeId
        );
        this.notebook.addNoteToPlace(
          object.placeId,
          `Empujé ${object.name} hasta (${reportedPosition.x}, ${reportedPosition.y}, ${reportedPosition.z}).`,
          worldTime
        );
        // Hypothesis layer (prompt v3): only Camila's own hypothesis, if she
        // offered one in her decision. The runtime NEVER invents a pairing
        // for her — no complement-distance computation, no ball→goal guess.
        // A hypothesis is recorded verbatim (trimmed, capped at 200 chars);
        // when she offered none, no hypothesis is recorded at all.
        const ownHypothesis = pending.hypothesis?.trim();
        if (ownHypothesis) {
          this.notebook.addHypothesis(ownHypothesis.slice(0, 200), worldTime);
        }
        this.notebook.save();
      }
    } catch {
      // Notebook/memory failures never fail a committed push.
    }

    return {
      success: true,
      code: 'push-applied',
      message: `Push of "${object.id}" committed at (${reportedPosition.x}, ${reportedPosition.y}, ${reportedPosition.z}).`,
      agentId,
      targetObjectId: object.id,
      committed: true,
      newPosition: { ...reportedPosition },
    };
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
