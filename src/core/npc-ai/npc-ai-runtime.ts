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
import {
  deriveNpcPerception,
  isCamilaLineOfSightOccluded,
  CAMILA_MAX_OPEN_VISION_METRES,
  CAMILA_MAX_DIRECT_INTERACTION_METRES,
  type CamilaLiveSensorySnapshot,
} from './npc-perception.js';
import { DeterministicNpcCognitionProvider } from './providers/deterministic-cognition-provider.js';
import { createMoveToPlaceIntent, dispatchAgentIntent } from '../agent-intent.js';
import type { RuntimeTraversalCoordinator } from '../traversal-coordinator.js';
import { CAMILA_AGENT_ID, isCamilaActionAllowed, isCamilaActionEnabled } from './camila-config.js';
import { CAMILA_PROBE_OBJECTS, findProbeObjectById, findProbeObjectsByPlace } from '../camila-probe-objects.js';
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
  'scoop',
  'pour_or_apply',
  'sit',
  'stand_up',
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

/** An object interaction (push / pick_up / drop) waiting for Unity's physical report. */
export interface PendingCamilaPush {
  readonly agentId: string;
  readonly interactionType: 'push' | 'pick_up' | 'drop';
  readonly targetObjectId: string;
  readonly fromPosition: UnityPosition;
  readonly expectedPosition: UnityPosition;
  readonly pushTowardsPlaceId?: string;
  readonly pushTowardsObjectId?: string;
  readonly nearObjectId?: string;
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
  /** Affordances that make an object pick-up-able (Phase 2b). 'stationary' objects never are. */
  private static readonly CARRIABLE_AFFORDANCES: readonly string[] = [
    'carriable',
    'movable',
    'foldable',
  ];
  private pendingPushByAgent = new Map<string, PendingCamilaPush>();
  private heldCyclesByAgent = new Map<string, number>();
  private heldOriginPlaceByAgent = new Map<string, string>();
  private placesTraversedSinceRestByAgent = new Map<string, number>();
  private latestLivePlayerContext?: {
    playerPosition?: UnityPosition;
    playerHeldObjectId?: string | null;
    camilaPosition?: UnityPosition;
  };

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

  private buildLiveSensorySnapshot(agentId?: string): CamilaLiveSensorySnapshot {
    const id = agentId ?? CAMILA_AGENT_ID;
    const heldId = this.objectState.getHeldObjectId(id);
    return {
      objectState: this.objectState,
      notebook: this.notebook,
      playerPosition: this.latestLivePlayerContext?.playerPosition,
      playerHeldObjectId: this.latestLivePlayerContext?.playerHeldObjectId,
      camilaPosition: this.latestLivePlayerContext?.camilaPosition,
      heldCycles: heldId ? (this.heldCyclesByAgent.get(id) ?? 0) : undefined,
      heldOriginPlaceId: heldId ? this.heldOriginPlaceByAgent.get(id) : undefined,
      placesTraversedSinceRest: this.placesTraversedSinceRestByAgent.get(id) ?? 0,
    };
  }

  /** Updates the latest live Unity proximity snapshot (player position / held item / Camila position). */
  public updateLiveSensoryContext(context?: {
    playerPosition?: UnityPosition;
    playerHeldObjectId?: string | null;
    camilaPosition?: UnityPosition;
  }): void {
    if (!context) return;
    this.latestLivePlayerContext = {
      playerPosition: context.playerPosition ?? this.latestLivePlayerContext?.playerPosition,
      playerHeldObjectId:
        context.playerHeldObjectId !== undefined
          ? context.playerHeldObjectId
          : this.latestLivePlayerContext?.playerHeldObjectId,
      camilaPosition: context.camilaPosition ?? this.latestLivePlayerContext?.camilaPosition,
    };
  }

  /**
   * Living World: records when the human Player moves, kicks, drops, or wheels
   * a tangible InteractiveWorldProp in Unity so Camila perceives the change.
   */
  public syncPlayerMovedObject(
    objectId: string,
    newPosition: UnityPosition,
    worldTime: string,
    physicalStatePatch?: Partial<import('../camila-probe-object-state.js').ProbeObjectPhysicalState>
  ): { success: boolean; changed: boolean; placeId?: string; message: string } {
    const object = findProbeObjectById(objectId);
    if (!object) {
      return { success: false, changed: false, message: `Unknown probe object "${objectId}".` };
    }
    const hasPos = isValidObjectPosition(newPosition);
    const hasStatePatch = Boolean(physicalStatePatch && Object.keys(physicalStatePatch).length > 0);
    if (!hasPos && !hasStatePatch) {
      return { success: false, changed: false, message: `Invalid position or state patch for "${objectId}".` };
    }

    let movedDist = 0;
    const prevPlace = this.objectState.getEffectivePlaceId(objectId) ?? object.placeId;
    if (hasPos) {
      const previous = this.objectState.getPosition(objectId);
      movedDist = previous
        ? Math.hypot(newPosition.x - previous.x, newPosition.z - previous.z)
        : 0;
      if (movedDist >= 0.35) {
        this.objectState.setPosition(objectId, newPosition);
        if (this.objectState.getHeldObjectId(CAMILA_AGENT_ID) === objectId) {
          this.objectState.clearHeldObject(CAMILA_AGENT_ID);
        }
      }
    }

    if (hasStatePatch && physicalStatePatch) {
      this.objectState.setPhysicalState(objectId, physicalStatePatch);
    }

    if (movedDist < 0.35 && !hasStatePatch) {
      return { success: true, changed: false, placeId: prevPlace, message: 'No significant movement.' };
    }

    const newPlace = this.objectState.getEffectivePlaceId(objectId) ?? object.placeId;
    try {
      this.objectState.save();
    } catch {
      // Best-effort persistence for player prop sync
    }

    if (movedDist >= 0.35) {
      const placeChangedNote =
        newPlace !== prevPlace ? ` (ahora está en ${newPlace}, antes en ${prevPlace})` : ` en ${newPlace}`;
      this.objectState.recordWorldChange({
        timestamp: worldTime,
        kind: 'player_moved',
        objectId,
        summary: `Alguien movió "${object.name}" (${object.id}) ${movedDist.toFixed(1)}m${placeChangedNote}.`,
      });
    } else if (hasStatePatch) {
      this.objectState.recordWorldChange({
        timestamp: worldTime,
        kind: 'player_moved',
        objectId,
        summary: `Alguien cambió el estado de "${object.name}" (${object.id}) en ${newPlace}.`,
      });
    }

    return {
      success: true,
      changed: true,
      placeId: newPlace,
      message: `Synced "${objectId}" at ${newPlace}.`,
    };
  }

  public getPerception(agentId: string): NpcPerception {
    const state = (this.controller as any).state as WorldState;
    return deriveNpcPerception(state, agentId, this.memoryStore, this.buildLiveSensorySnapshot());
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
   * Experiential learning v1: a cycle that reaches a terminal decision
   * (executed / rejected / invalid_proposal / provider_failed) is recorded
   * once in Camila's outcome ledger (best effort, counts only, no diary
   * line). Waiting-for-traversal noop cycles are never recorded as attempts.
   */
  public async runCycle(
    agentId: string,
    liveContext?: {
      playerPosition?: UnityPosition;
      playerHeldObjectId?: string | null;
      camilaPosition?: UnityPosition;
    }
  ): Promise<NpcAiCycleResult> {
    const result = await this.runCycleInternal(agentId, liveContext);
    this.recordCamilaCycleOutcome(agentId, result);
    return result;
  }

  /** Inner cycle implementation; see runCycle. */
  private async runCycleInternal(
    agentId: string,
    liveContext?: {
      playerPosition?: UnityPosition;
      playerHeldObjectId?: string | null;
      camilaPosition?: UnityPosition;
    }
  ): Promise<NpcAiCycleResult> {
    const startTime = Date.now();
    this.cycleCounter += 1;
    const cycleId = `cycle:${agentId}:${Date.now()}-${this.cycleCounter}`;

    if (liveContext) {
      this.updateLiveSensoryContext(liveContext);
    }

    if (agentId === CAMILA_AGENT_ID && this.objectState.getHeldObjectId(agentId)) {
      this.heldCyclesByAgent.set(agentId, (this.heldCyclesByAgent.get(agentId) ?? 0) + 1);
    }

    const state = (this.controller as any).state as WorldState;
    const perception = deriveNpcPerception(
      state,
      agentId,
      this.memoryStore,
      this.buildLiveSensorySnapshot(agentId)
    );
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
      if (agentId === CAMILA_AGENT_ID && this.notebook) {
        const localIds = (perception.visibleObjectsHere ?? []).map((o) => o.id);
        try {
          if (localIds.length > 0) {
            this.notebook.recordObjectsSeen(perception.locationId, localIds, worldTime);
          }
          if (proposal.hypothesis?.trim()) {
            this.notebook.addHypothesis(proposal.hypothesis.trim(), worldTime);
          }
          this.notebook.save();
        } catch { /* best-effort */ }
      }
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
      // Allow local repositioning along a large avenue (e.g. from X=-6.75 outside Wing Spot back to X=55 on Blvd. Gómez Morín)
      const camilaLivePos = this.latestLivePlayerContext?.camilaPosition;
      const destAnchor = CAMILA_UNITY_ANCHORS[destination];
      if (
        agentId === CAMILA_AGENT_ID &&
        destination === perception.locationId &&
        camilaLivePos &&
        destAnchor &&
        Math.hypot(destAnchor.x - camilaLivePos.x, destAnchor.z - camilaLivePos.z) > 12
      ) {
        if (this.objectState.getSittingState(agentId)) {
          this.objectState.clearSittingState(agentId);
          try { this.objectState.save(); } catch { /* best-effort */ }
        }
        this.appendCamilaDiary(agentId, worldTime, `Camino por ${destination} hacia otra parte de la calle. ${proposal.reasoningContext ?? ''}`);
        const repositionResult: NpcAiCycleResult = {
          cycleId,
          agentId,
          worldTime,
          status: 'executed',
          perception,
          proposal,
          commandDispatched: {
            commandName: 'move-to-place',
            payload: { destinationPlaceId: destination, localReposition: true },
            success: true,
          },
          durationMs: Date.now() - startTime,
        };
        this.lastCycleByAgent.set(agentId, repositionResult);
        return repositionResult;
      }

      const intent = createMoveToPlaceIntent(agentId, destination, worldTime, proposal.reasoningContext);
      const dispatchResult = dispatchAgentIntent(state, intent, {
        coordinator: this.coordinator,
        currentTime: worldTime,
      });
      const success = dispatchResult.success;
      if (success) {
        // Automatically stand up if Camila was seated before walking away
        if (this.objectState.getSittingState(agentId)) {
          this.objectState.clearSittingState(agentId);
          try { this.objectState.save(); } catch { /* best-effort */ }
        }
        // Mark visible objects at the place she is choosing to leave as seen
        if (agentId === CAMILA_AGENT_ID && this.notebook) {
          const seenBeforeLeaving = (perception.visibleObjectsHere ?? []).map((o) => o.id);
          try {
            if (seenBeforeLeaving.length > 0) {
              this.notebook.recordObjectsSeen(perception.locationId, seenBeforeLeaving, worldTime);
            }
            if (proposal.hypothesis?.trim()) {
              this.notebook.addHypothesis(proposal.hypothesis.trim(), worldTime);
            }
            this.notebook.save();
          } catch { /* best-effort */ }
        }
        this.activeTraversalStartedWallMs.set(agentId, Date.now());
        this.memoryStore.addMemory({
          type: 'discovery',
          summary: `Started moving toward "${destination}". ${proposal.reasoningContext ?? ''}`,
          timestamp: worldTime,
          placeId: destination,
        });
        this.appendCamilaDiary(agentId, worldTime, `Me dirijo a ${destination}. ${proposal.reasoningContext ?? ''}`);
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
      const livePos = this.latestLivePlayerContext?.camilaPosition;
      if (agentId === CAMILA_AGENT_ID && livePos) {
        const objPos = this.objectState.getPosition(object.id) ?? object.unityPosition;
        const dist = Math.hypot(objPos.x - livePos.x, objPos.z - livePos.z);
        if (isCamilaLineOfSightOccluded(livePos, objPos) || dist > CAMILA_MAX_OPEN_VISION_METRES) {
          const rejErr = {
            code: 'object-occluded-or-out-of-sight',
            message: `Desde mi posición actual no tengo vista despejada hacia "${object.name}" (${object.id}); hay muros o demasiada distancia (${dist.toFixed(1)}m).`,
          };
          this.recordCamilaRejectionFeedback(agentId, worldTime, perception, proposal, rejErr);
          const result: NpcAiCycleResult = {
            cycleId,
            agentId,
            worldTime,
            status: 'rejected',
            perception,
            proposal,
            error: rejErr,
            durationMs: Date.now() - startTime,
          };
          this.lastCycleByAgent.set(agentId, result);
          return result;
        }
      }
      this.memoryStore.addMemory({
        type: 'object_noticed',
        summary: `Noticed "${object.name}" (${object.id}) at ${object.placeId}: ${object.description}`,
        timestamp: worldTime,
        placeId: object.placeId,
      });
      if (agentId === CAMILA_AGENT_ID && this.notebook) {
        try {
          this.notebook.recordObjectsSeen(perception.locationId, [object.id], worldTime);
          if (proposal.hypothesis?.trim()) {
            this.notebook.addHypothesis(proposal.hypothesis.trim(), worldTime);
          }
        } catch { /* best-effort */ }
      }
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
    if (proposal.actionType === 'push_object') {
      const pushResult = this.executePushObject(agentId, perception, proposal, worldTime);
      if (pushResult.status !== 'executed') {
        this.recordCamilaRejectionFeedback(agentId, worldTime, perception, proposal, pushResult.error);
      }
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

    // Phase 2b ("Manos Libres"): pick_up_object and drop_object are now executed!
    if (proposal.actionType === 'pick_up_object') {
      const pickResult = this.executePickUpObject(agentId, perception, proposal, worldTime);
      if (pickResult.status !== 'executed') {
        this.recordCamilaRejectionFeedback(agentId, worldTime, perception, proposal, pickResult.error);
      }
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: pickResult.status,
        perception,
        proposal,
        commandDispatched: pickResult.commandDispatched,
        error: pickResult.error,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (proposal.actionType === 'drop_object') {
      const dropResult = this.executeDropObject(agentId, perception, proposal, worldTime);
      if (dropResult.status !== 'executed') {
        this.recordCamilaRejectionFeedback(agentId, worldTime, perception, proposal, dropResult.error);
      }
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: dropResult.status,
        perception,
        proposal,
        commandDispatched: dropResult.commandDispatched,
        error: dropResult.error,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (proposal.actionType === 'scoop') {
      const scoopResult = this.executeScoop(agentId, perception, proposal, worldTime);
      if (scoopResult.status !== 'executed') {
        this.recordCamilaRejectionFeedback(agentId, worldTime, perception, proposal, scoopResult.error);
      }
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: scoopResult.status,
        perception,
        proposal,
        commandDispatched: scoopResult.commandDispatched,
        error: scoopResult.error,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (proposal.actionType === 'pour_or_apply') {
      const applyResult = this.executePourOrApply(agentId, perception, proposal, worldTime);
      if (applyResult.status !== 'executed') {
        this.recordCamilaRejectionFeedback(agentId, worldTime, perception, proposal, applyResult.error);
      }
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: applyResult.status,
        perception,
        proposal,
        commandDispatched: applyResult.commandDispatched,
        error: applyResult.error,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (proposal.actionType === 'sit') {
      const sitResult = this.executeSit(agentId, perception, proposal, worldTime);
      if (sitResult.status !== 'executed') {
        this.recordCamilaRejectionFeedback(agentId, worldTime, perception, proposal, sitResult.error);
      }
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: sitResult.status,
        perception,
        proposal,
        commandDispatched: sitResult.commandDispatched,
        error: sitResult.error,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (proposal.actionType === 'stand_up') {
      const standResult = this.executeStandUp(agentId, perception, proposal, worldTime);
      if (standResult.status !== 'executed') {
        this.recordCamilaRejectionFeedback(agentId, worldTime, perception, proposal, standResult.error);
      }
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: standResult.status,
        perception,
        proposal,
        commandDispatched: standResult.commandDispatched,
        error: standResult.error,
        durationMs: Date.now() - startTime,
      };
      this.lastCycleByAgent.set(agentId, result);
      return result;
    }

    if (proposal.actionType === 'carry_object') {
      const result: NpcAiCycleResult = {
        cycleId,
        agentId,
        worldTime,
        status: 'rejected',
        perception,
        proposal,
        error: {
          code: 'action-not-implemented-yet',
          message: `Action "carry_object" is implicit: use pick_up_object then move_to_place to carry an object.`,
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

    const effectiveObjectPlaceId = this.objectState.getEffectivePlaceId(object.id) ?? object.placeId;
    if (effectiveObjectPlaceId !== perception.locationId) {
      return rejected(
        'object-not-nearby',
        `Camila is at "${perception.locationId}" but "${object.name}" (${object.id}) is at "${effectiveObjectPlaceId}". She must move_to_place there first; the runtime never moves her automatically.`
      );
    }
    if (this.objectState.getHeldObjectId(agentId) === object.id) {
      return rejected('object-is-held', `Camila is currently holding "${object.id}"; drop it first to push it.`);
    }
    if (!object.affordances.some((a) => NpcAiRuntime.PUSHABLE_AFFORDANCES.includes(a))) {
      return rejected(
        'object-not-pushable',
        `"${object.name}" (${object.id}) is not pushable (affordances: ${object.affordances.join(', ')}). Only movable / kickable / rollable objects can be pushed.`
      );
    }

    let towardsAnchor: UnityPosition | undefined;
    if (proposal.pushTowardsObjectId !== undefined) {
      const targetObj = findProbeObjectById(proposal.pushTowardsObjectId);
      if (!targetObj) {
        return invalid(`pushTowardsObjectId "${proposal.pushTowardsObjectId}" is not a known probe object`);
      }
      towardsAnchor = this.objectState.getPosition(targetObj.id) ?? targetObj.unityPosition;
    } else if (proposal.pushTowardsPlaceId !== undefined) {
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
    const camilaLivePos = this.latestLivePlayerContext?.camilaPosition;
    if (camilaLivePos && isCamilaLineOfSightOccluded(camilaLivePos, fromPosition)) {
      return rejected(
        'object-occluded-by-wall',
        `Un muro bloquea el paso/vista hacia "${object.name}" (${object.id}) desde aquí.`
      );
    }
    const camilaAnchor = CAMILA_UNITY_ANCHORS[perception.locationId];
    const expectedPosition = this.computePushPosition(fromPosition, towardsAnchor, camilaAnchor);

    this.pendingPushByAgent.set(agentId, {
      agentId,
      interactionType: 'push',
      targetObjectId: object.id,
      fromPosition,
      expectedPosition,
      pushTowardsPlaceId: proposal.pushTowardsPlaceId,
      pushTowardsObjectId: proposal.pushTowardsObjectId,
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
          pushTowardsObjectId: proposal.pushTowardsObjectId ?? null,
          pushDistanceMetres: NpcAiRuntime.PUSH_DISTANCE_METRES,
        },
        success: true,
      },
    };
  }

  /**
   * Milestone 94 Phase 2b ("Manos Libres"): executes a validated pick_up_object proposal.
   */
  private executePickUpObject(
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
      return rejected('action-not-for-agent', `Only ${CAMILA_AGENT_ID} can pick up objects.`);
    }
    const objectId = proposal.targetObjectId;
    if (!objectId) return invalid('pick_up_object requires targetObjectId');
    const object = findProbeObjectById(objectId);
    if (!object) return invalid(`pick_up_object requires a known probe object id, got "${objectId}"`);

    const currentlyHeld = this.objectState.getHeldObjectId(agentId);
    if (currentlyHeld) {
      return rejected(
        'already-holding-object',
        `Camila is already holding "${currentlyHeld}". She must drop_object before picking up another object.`
      );
    }

    const pending = this.pendingPushByAgent.get(agentId);
    if (pending) {
      if (Date.now() - pending.startedWallMs > NpcAiRuntime.MAX_STALE_PUSH_WALL_MS) {
        this.pendingPushByAgent.delete(agentId);
      } else {
        return rejected(
          'interaction-pending',
          `An interaction with "${pending.targetObjectId}" is still waiting for Unity to report back.`
        );
      }
    }

    const effectiveObjectPlaceId = this.objectState.getEffectivePlaceId(object.id) ?? object.placeId;
    if (effectiveObjectPlaceId !== perception.locationId) {
      return rejected(
        'object-not-nearby',
        `Camila is at "${perception.locationId}" but "${object.name}" (${object.id}) is at "${effectiveObjectPlaceId}".`
      );
    }

    if (
      object.affordances.includes('stationary') ||
      !object.affordances.some((a) => NpcAiRuntime.CARRIABLE_AFFORDANCES.includes(a))
    ) {
      return rejected(
        'object-not-carriable',
        `"${object.name}" (${object.id}) cannot be picked up (affordances: ${object.affordances.join(', ')}).`
      );
    }

    const fromPosition = this.objectState.getPosition(object.id) ?? object.unityPosition;
    const camilaLivePos = this.latestLivePlayerContext?.camilaPosition;
    if (camilaLivePos && isCamilaLineOfSightOccluded(camilaLivePos, fromPosition)) {
      return rejected(
        'object-occluded-by-wall',
        `Un muro bloquea el paso/vista hacia "${object.name}" (${object.id}) desde aquí.`
      );
    }
    this.pendingPushByAgent.set(agentId, {
      agentId,
      interactionType: 'pick_up',
      targetObjectId: object.id,
      fromPosition,
      expectedPosition: fromPosition,
      hypothesis: proposal.hypothesis,
      worldTime,
      startedWallMs: Date.now(),
    });

    return {
      status: 'executed',
      commandDispatched: {
        commandName: 'pick-up-object',
        payload: {
          targetObjectId: object.id,
          fromPosition,
        },
        success: true,
      },
    };
  }

  /**
   * Milestone 94 Phase 2b ("Manos Libres"): executes a validated drop_object proposal.
   */
  private executeDropObject(
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
      return rejected('action-not-for-agent', `Only ${CAMILA_AGENT_ID} can drop objects.`);
    }

    const heldId = this.objectState.getHeldObjectId(agentId);
    if (!heldId) {
      return rejected('not-holding-object', 'Camila is not holding any object to drop.');
    }
    const heldObj = findProbeObjectById(heldId);
    if (!heldObj) {
      this.objectState.clearHeldObject(agentId);
      return rejected('not-holding-object', `Unknown held object "${heldId}".`);
    }

    const pending = this.pendingPushByAgent.get(agentId);
    if (pending) {
      if (Date.now() - pending.startedWallMs > NpcAiRuntime.MAX_STALE_PUSH_WALL_MS) {
        this.pendingPushByAgent.delete(agentId);
      } else {
        return rejected(
          'interaction-pending',
          `An interaction with "${pending.targetObjectId}" is still waiting for Unity to report back.`
        );
      }
    }

    let dropTargetPos = CAMILA_UNITY_ANCHORS[perception.locationId] ?? heldObj.unityPosition;
    if (proposal.nearObjectId !== undefined) {
      const nearObj = findProbeObjectById(proposal.nearObjectId);
      if (!nearObj) {
        return invalid(`nearObjectId "${proposal.nearObjectId}" is not a known probe object`);
      }
      const nearEffectivePlace = this.objectState.getEffectivePlaceId(nearObj.id) ?? nearObj.placeId;
      if (nearEffectivePlace !== perception.locationId) {
        return rejected(
          'near-object-not-here',
          `"${nearObj.name}" (${nearObj.id}) is at "${nearEffectivePlace}", not at "${perception.locationId}".`
        );
      }
      dropTargetPos = this.objectState.getPosition(nearObj.id) ?? nearObj.unityPosition;
    }

    const fromPosition = this.objectState.getPosition(heldObj.id) ?? heldObj.unityPosition;
    this.pendingPushByAgent.set(agentId, {
      agentId,
      interactionType: 'drop',
      targetObjectId: heldObj.id,
      fromPosition,
      expectedPosition: dropTargetPos,
      nearObjectId: proposal.nearObjectId,
      hypothesis: proposal.hypothesis,
      worldTime,
      startedWallMs: Date.now(),
    });

    return {
      status: 'executed',
      commandDispatched: {
        commandName: 'drop-object',
        payload: {
          targetObjectId: heldObj.id,
          nearObjectId: proposal.nearObjectId ?? null,
          expectedPosition: dropTargetPos,
        },
        success: true,
      },
    };
  }

  /**
   * General physical verb: scoop loose substance (water or sand/earth) from a
   * source object into Camila's currently held container or tool.
   */
  private executeScoop(
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
      return rejected('action-not-for-agent', `Only ${CAMILA_AGENT_ID} can scoop.`);
    }
    const sourceId = proposal.targetObjectId;
    if (!sourceId) return invalid('scoop requires targetObjectId');
    const sourceObj = findProbeObjectById(sourceId);
    if (!sourceObj) return invalid(`scoop requires a known probe object id, got "${sourceId}"`);

    const heldId = this.objectState.getHeldObjectId(agentId);
    if (!heldId) {
      return rejected('not-holding-container', 'Camila must pick up a container or tool before scooping.');
    }
    const heldObj = findProbeObjectById(heldId);
    if (!heldObj) {
      return rejected('not-holding-container', `Unknown held object "${heldId}".`);
    }

    const sourcePlace = this.objectState.getEffectivePlaceId(sourceObj.id) ?? sourceObj.placeId;
    if (sourcePlace !== perception.locationId) {
      return rejected(
        'object-not-nearby',
        `"${sourceObj.name}" (${sourceObj.id}) is at "${sourcePlace}", not at "${perception.locationId}".`
      );
    }
    const scoopCamilaPos = this.latestLivePlayerContext?.camilaPosition;
    if (scoopCamilaPos) {
      const srcPos = this.objectState.getPosition(sourceObj.id) ?? sourceObj.unityPosition;
      const dist = Math.hypot(srcPos.x - scoopCamilaPos.x, srcPos.z - scoopCamilaPos.z);
      if (isCamilaLineOfSightOccluded(scoopCamilaPos, srcPos) || dist > CAMILA_MAX_DIRECT_INTERACTION_METRES) {
        return rejected(
          'object-too-far-or-occluded',
          `Estoy demasiado lejos (${dist.toFixed(1)}m) o con un muro de por medio respecto a "${sourceObj.name}".`
        );
      }
    }

    // Auto-stand if seated
    if (this.objectState.getSittingState(agentId)) {
      this.objectState.clearSittingState(agentId);
    }

    const sourceState = this.objectState.getPhysicalState(sourceObj.id) ?? {};
    const canHoldWater = heldObj.affordances.some((a) =>
      a === 'holds-water' || a === 'pours-water' || a === 'holds-liquid'
    );
    const canHoldSand = heldObj.affordances.some((a) =>
      a === 'scoops-sand' || a === 'holds-sand'
    );

    const isWaterSource =
      sourceObj.affordances.includes('water-source') ||
      sourceObj.affordances.includes('water') ||
      sourceState.contents === 'water';
    const isSandSource =
      sourceObj.affordances.includes('loose-sand') ||
      sourceObj.affordances.includes('scoopable') ||
      sourceState.contents === 'sand';

    let material: 'water' | 'sand' | null = null;
    let summary = '';

    if (isSandSource && canHoldSand) {
      material = 'sand';
      this.objectState.setPhysicalState(heldObj.id, { contents: 'sand', waterLevel: 0 });
      if (sourceState.contents === 'sand') {
        this.objectState.setPhysicalState(sourceObj.id, { contents: 'empty' });
      }
      summary = `Recogí tierra y arena de "${sourceObj.name}" con ${heldObj.name} (${heldObj.id}).`;
    } else if (isWaterSource && canHoldWater) {
      const currentWater = sourceState.waterLevel ?? 1.0;
      const currentSand = sourceState.sandFillLevel ?? 0.0;
      if (currentWater <= 0.05 || currentSand >= 0.95) {
        return rejected(
          'source-empty',
          `"${sourceObj.name}" ya no tiene agua suficiente para recoger.`
        );
      }
      material = 'water';
      const waterScoopAmount = heldObj.id === 'probe:bucket' ? 0.5 : 0.25;
      this.objectState.setPhysicalState(heldObj.id, { contents: 'water', waterLevel: 1.0 });
      if (sourceObj.id === 'probe:puddle') {
        const nextWater = Math.max(0, Number((currentWater - waterScoopAmount).toFixed(2)));
        this.objectState.setPhysicalState(sourceObj.id, { waterLevel: nextWater });
      } else if (sourceState.contents === 'water') {
        this.objectState.setPhysicalState(sourceObj.id, { contents: 'empty', waterLevel: 0 });
      }
      summary = `Llené ${heldObj.name} (${heldObj.id}) con agua de "${sourceObj.name}".`;
    } else {
      return rejected(
        'cannot-scoop-material',
        `No puedo recoger material de "${sourceObj.name}" usando "${heldObj.name}".`
      );
    }

    try {
      this.objectState.save();
    } catch {
      // Best-effort save
    }

    this.objectState.recordWorldChange({
      timestamp: worldTime,
      kind: 'camila_scooped',
      objectId: heldObj.id,
      summary,
    });
    this.memoryStore.addMemory({
      type: 'discovery',
      summary,
      timestamp: worldTime,
      placeId: perception.locationId,
    });
    if (this.notebook) {
      try {
        this.notebook.recordObjectsSeen(perception.locationId, [heldObj.id, sourceObj.id], worldTime);
        this.notebook.addDiaryEntry(summary, worldTime, perception.locationId);
        if (proposal.hypothesis?.trim()) {
          this.notebook.addHypothesis(proposal.hypothesis.trim().slice(0, 200), worldTime);
        }
        // Only auto-confirm single-step water-scoop hypotheses here; keep sand/destination
        // hypotheses open while Camila carries the sand toward her intended target!
        if (material === 'water') {
          this.notebook.resolveMatchingHypotheses(['agua', 'charco'], 'confirmed', worldTime, 2);
        }
        this.notebook.save();
      } catch {
        // Best-effort notebook
      }
    }

    const updatedSource = this.objectState.getPhysicalState(sourceObj.id) ?? {};
    return {
      status: 'executed',
      commandDispatched: {
        commandName: 'scoop',
        payload: {
          heldObjectId: heldObj.id,
          targetObjectId: sourceObj.id,
          material,
          targetWaterLevel: updatedSource.waterLevel ?? null,
          targetSandFillLevel: updatedSource.sandFillLevel ?? null,
        },
        success: true,
      },
    };
  }

  /**
   * General physical verb: pour held water, dump held sand/earth, draw with
   * chalk on a drawable wall, dispose trash into a bin, or sweep with a broom.
   */
  private executePourOrApply(
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
      return rejected('action-not-for-agent', `Only ${CAMILA_AGENT_ID} can pour_or_apply.`);
    }

    const heldId = this.objectState.getHeldObjectId(agentId);
    if (!heldId) {
      return rejected('not-holding-object', 'Camila must hold an object before using pour_or_apply.');
    }
    const heldObj = findProbeObjectById(heldId);
    if (!heldObj) {
      return rejected('not-holding-object', `Unknown held object "${heldId}".`);
    }

    let targetObj = null;
    if (proposal.targetObjectId) {
      targetObj = findProbeObjectById(proposal.targetObjectId);
      if (!targetObj) {
        return invalid(`pour_or_apply targetObjectId "${proposal.targetObjectId}" is unknown`);
      }
      const targetPlace = this.objectState.getEffectivePlaceId(targetObj.id) ?? targetObj.placeId;
      if (targetPlace !== perception.locationId) {
        return rejected(
          'object-not-nearby',
          `"${targetObj.name}" (${targetObj.id}) is at "${targetPlace}", not at "${perception.locationId}".`
        );
      }
      const pourCamilaPos = this.latestLivePlayerContext?.camilaPosition;
      if (pourCamilaPos) {
        const tgtPos = this.objectState.getPosition(targetObj.id) ?? targetObj.unityPosition;
        const dist = Math.hypot(tgtPos.x - pourCamilaPos.x, tgtPos.z - pourCamilaPos.z);
        if (isCamilaLineOfSightOccluded(pourCamilaPos, tgtPos) || dist > CAMILA_MAX_DIRECT_INTERACTION_METRES) {
          return rejected(
            'object-too-far-or-occluded',
            `Estoy demasiado lejos (${dist.toFixed(1)}m) o con un muro de por medio respecto a "${targetObj.name}".`
          );
        }
      }
    }

    // Auto-stand if seated
    if (this.objectState.getSittingState(agentId)) {
      this.objectState.clearSittingState(agentId);
    }

    const heldState = this.objectState.getPhysicalState(heldObj.id) ?? {};
    let effectKind = '';
    let summary = '';
    let resolveKeywords: string[] = [];

    if (heldState.contents === 'water') {
      this.objectState.setPhysicalState(heldObj.id, { contents: 'empty', waterLevel: 0 });
      if (
        targetObj &&
        targetObj.affordances.some((a) => a === 'holds-water' || a === 'pours-water' || a === 'holds-liquid')
      ) {
        this.objectState.setPhysicalState(targetObj.id, { contents: 'water', waterLevel: 1.0 });
        effectKind = 'pour-water-into-container';
        summary = `Vacié agua de ${heldObj.name} dentro de "${targetObj.name}" (${targetObj.id}), que quedó lleno.`;
        resolveKeywords = ['agua', targetObj.name.split(' ')[0]];
      } else if (targetObj && targetObj.id === 'probe:puddle') {
        const addAmount = heldObj.id === 'probe:bucket' ? 0.5 : 0.25;
        const curW = this.objectState.getPhysicalState(targetObj.id)?.waterLevel ?? 0;
        this.objectState.setPhysicalState(targetObj.id, { waterLevel: Math.min(1.0, Number((curW + addAmount).toFixed(2))) });
        effectKind = 'pour-water-into-puddle';
        summary = `Vacié agua de ${heldObj.name} de regreso al "${targetObj.name}".`;
        resolveKeywords = ['agua', 'charco'];
      } else {
        effectKind = 'pour-water-on-ground';
        summary = `Vacié el agua de ${heldObj.name} sobre el suelo en ${perception.locationId}.`;
        resolveKeywords = ['agua'];
      }
    } else if (heldState.contents === 'sand') {
      this.objectState.setPhysicalState(heldObj.id, { contents: 'empty', waterLevel: 0 });
      if (targetObj && targetObj.affordances.includes('fillable-with-sand')) {
        const sandDelta = heldObj.id === 'probe:bucket' ? 0.66 : 0.34;
        const waterDisplaced = heldObj.id === 'probe:bucket' ? 0.65 : 0.35;
        const prev = this.objectState.getPhysicalState(targetObj.id) ?? {};
        const nextSand = Math.min(1.0, Number(((prev.sandFillLevel ?? 0) + sandDelta).toFixed(2)));
        const nextWater = Math.max(0, Number(((prev.waterLevel ?? 0) - waterDisplaced).toFixed(2)));
        const remRatio = Number(Math.max(0, 1 - nextSand).toFixed(2));
        this.objectState.setPhysicalState(targetObj.id, { sandFillLevel: nextSand, waterLevel: nextWater });
        effectKind = 'fill-pothole-with-sand';
        summary =
          nextSand >= 0.99
            ? `Eché tierra y arena con ${heldObj.name} en "${targetObj.name}": ¡el bache quedó 100% tapado al ras del asfalto!`
            : `Eché tierra y arena con ${heldObj.name} en "${targetObj.name}" (relleno al ${Math.round(nextSand * 100)}%, falta ${Math.round(remRatio * 100)}% por tapar).`;
        resolveKeywords = ['bache', 'charco', 'tierra', 'arena'];
      } else if (targetObj && targetObj.affordances.includes('holds-sand')) {
        this.objectState.setPhysicalState(targetObj.id, { contents: 'sand', waterLevel: 0 });
        effectKind = 'transfer-sand-to-container';
        summary = `Pasé tierra y arena de ${heldObj.name} a "${targetObj.name}".`;
        resolveKeywords = ['arena', 'cubeta'];
      } else {
        effectKind = 'dump-sand-on-ground';
        summary = `Vacié tierra y arena de ${heldObj.name} sobre el suelo en ${perception.locationId}.`;
        resolveKeywords = ['tierra', 'arena'];
      }
    } else if (heldObj.affordances.includes('draws-on-surfaces')) {
      if (targetObj && targetObj.affordances.includes('drawable-on')) {
        const prevMarks = this.objectState.getPhysicalState(targetObj.id)?.chalkMarks ?? 0;
        this.objectState.setPhysicalState(targetObj.id, { chalkMarks: prevMarks + 1 });
        effectKind = 'draw-on-wall';
        summary = `Dibujé con ${heldObj.name} sobre "${targetObj.name}" (${prevMarks + 1} trazo(s)).`;
        resolveKeywords = ['gis', 'muro'];
      } else if (
        targetObj &&
        targetObj.affordances.some((a) => a === 'flat-surface' || a === 'flat' || a === 'sittable' || a === 'ceramic')
      ) {
        const prevMarks = this.objectState.getPhysicalState(targetObj.id)?.chalkMarks ?? 0;
        this.objectState.setPhysicalState(targetObj.id, { chalkMarks: prevMarks + 1 });
        effectKind = 'draw-on-surface';
        summary = `Hice una marca de color con ${heldObj.name} sobre "${targetObj.name}" (${prevMarks + 1} marca(s)).`;
        resolveKeywords = ['gis', targetObj.name.split(' ')[0]];
      } else if (!targetObj) {
        effectKind = 'draw-on-ground';
        summary = `Dibujé con ${heldObj.name} sobre la banqueta en ${perception.locationId}.`;
        resolveKeywords = ['gis', 'banqueta'];
      } else {
        return rejected(
          'cannot-draw-on-target',
          `No pude rayar "${targetObj.name}" con ${heldObj.name}; necesito una superficie plana, un muro o el suelo.`
        );
      }
    } else if (
      heldObj.affordances.includes('contains-refuse') &&
      targetObj &&
      targetObj.affordances.includes('receives-refuse')
    ) {
      const binPos = this.objectState.getPosition(targetObj.id) ?? targetObj.unityPosition;
      this.objectState.setPhysicalState(heldObj.id, { disposedInBin: true });
      this.objectState.setPosition(heldObj.id, binPos);
      this.objectState.clearHeldObject(agentId);
      this.heldCyclesByAgent.delete(agentId);
      this.heldOriginPlaceByAgent.delete(agentId);
      effectKind = 'dispose-in-bin';
      summary = `Metí "${heldObj.name}" dentro de "${targetObj.name}" (${targetObj.id}).`;
      resolveKeywords = ['bolsa', 'bote'];
    } else if (heldObj.affordances.includes('sweeps')) {
      effectKind = 'sweep-area';
      summary = targetObj
        ? `Barrí alrededor de "${targetObj.name}" con ${heldObj.name}.`
        : `Barrí un poco el suelo con ${heldObj.name} en ${perception.locationId}.`;
      resolveKeywords = ['escoba'];
    } else {
      return rejected(
        'nothing-to-pour-or-apply',
        `"${heldObj.name}" está vacío o no tiene una acción física directa sobre ${targetObj ? `"${targetObj.name}"` : 'el suelo'}.`
      );
    }

    try {
      this.objectState.save();
    } catch {
      // Best-effort save
    }

    this.objectState.recordWorldChange({
      timestamp: worldTime,
      kind: 'camila_applied',
      objectId: targetObj?.id ?? heldObj.id,
      summary,
    });
    this.memoryStore.addMemory({
      type: 'discovery',
      summary,
      timestamp: worldTime,
      placeId: perception.locationId,
    });
    if (this.notebook) {
      try {
        const seenIds = targetObj ? [heldObj.id, targetObj.id] : [heldObj.id];
        this.notebook.recordObjectsSeen(perception.locationId, seenIds, worldTime);
        this.notebook.addDiaryEntry(summary, worldTime, perception.locationId);
        if (proposal.hypothesis?.trim()) {
          this.notebook.addHypothesis(proposal.hypothesis.trim().slice(0, 200), worldTime);
        }
        if (resolveKeywords.length > 0) {
          this.notebook.resolveMatchingHypotheses(
            resolveKeywords,
            'confirmed',
            worldTime,
            resolveKeywords.length >= 2 ? 2 : 1
          );
        }
        this.notebook.save();
      } catch {
        // Best-effort notebook
      }
    }

    const updatedTarget = targetObj ? (this.objectState.getPhysicalState(targetObj.id) ?? {}) : {};
    return {
      status: 'executed',
      commandDispatched: {
        commandName: 'pour-or-apply',
        payload: {
          heldObjectId: heldObj.id,
          targetObjectId: targetObj?.id ?? null,
          effectKind,
          targetWaterLevel: updatedTarget.waterLevel ?? null,
          targetSandFillLevel: updatedTarget.sandFillLevel ?? null,
          targetChalkMarks: updatedTarget.chalkMarks ?? null,
        },
        success: true,
      },
    };
  }

  /**
   * General physical verb: sit on a sittable object (e.g. bench) or right on
   * the sidewalk / floor wherever Camila is.
   */
  private executeSit(
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
      return rejected('action-not-for-agent', `Only ${CAMILA_AGENT_ID} can sit.`);
    }

    let surface = 'banqueta / suelo';
    let targetObjId: string | undefined;
    if (proposal.targetObjectId) {
      const targetObj = findProbeObjectById(proposal.targetObjectId);
      if (!targetObj) {
        return invalid(`sit targetObjectId "${proposal.targetObjectId}" is unknown`);
      }
      const targetPlace = this.objectState.getEffectivePlaceId(targetObj.id) ?? targetObj.placeId;
      if (targetPlace !== perception.locationId) {
        return rejected(
          'object-not-nearby',
          `"${targetObj.name}" (${targetObj.id}) is at "${targetPlace}", not at "${perception.locationId}".`
        );
      }
      if (!targetObj.affordances.includes('sittable')) {
        return rejected(
          'object-not-sittable',
          `"${targetObj.name}" (${targetObj.id}) no es un asiento.`
        );
      }
      const sitCamilaPos = this.latestLivePlayerContext?.camilaPosition;
      if (sitCamilaPos) {
        const seatPos = this.objectState.getPosition(targetObj.id) ?? targetObj.unityPosition;
        const dist = Math.hypot(seatPos.x - sitCamilaPos.x, seatPos.z - sitCamilaPos.z);
        if (isCamilaLineOfSightOccluded(sitCamilaPos, seatPos) || dist > CAMILA_MAX_DIRECT_INTERACTION_METRES) {
          return rejected(
            'object-too-far-or-occluded',
            `Estoy demasiado lejos (${dist.toFixed(1)}m) o con un muro de por medio respecto a "${targetObj.name}".`
          );
        }
      }
      surface = targetObj.name;
      targetObjId = targetObj.id;
    }

    this.placesTraversedSinceRestByAgent.set(agentId, 0);
    this.objectState.setSittingState(agentId, {
      placeId: perception.locationId,
      surface,
      targetObjectId: targetObjId,
    });
    try {
      this.objectState.save();
    } catch {
      // Best-effort save
    }

    const summary = targetObjId
      ? `Me senté en ${surface} (${targetObjId}) en ${perception.locationId}.`
      : `Me senté en el suelo / banqueta en ${perception.locationId}.`;

    this.objectState.recordWorldChange({
      timestamp: worldTime,
      kind: 'camila_sat',
      objectId: targetObjId ?? perception.locationId,
      summary,
    });
    if (this.notebook) {
      try {
        if (targetObjId) {
          this.notebook.recordObjectsSeen(perception.locationId, [targetObjId], worldTime);
        }
        this.notebook.addDiaryEntry(summary, worldTime, perception.locationId);
        this.notebook.save();
      } catch {
        // Best-effort notebook
      }
    }

    return {
      status: 'executed',
      commandDispatched: {
        commandName: 'sit',
        payload: {
          targetObjectId: targetObjId ?? null,
          surface,
        },
        success: true,
      },
    };
  }

  /**
   * General physical verb: stand up from sitting.
   */
  /**
   * Feeds physical rejection feedback back into Camila's recentWorldChanges,
   * memory, and notebook so she immediately learns why an attempt did not work
   * and NEVER loops silently repeating the same rejected action.
   */
  private recordCamilaRejectionFeedback(
    agentId: string,
    worldTime: string,
    perception: NpcPerception,
    proposal: NpcActionProposal,
    error?: { code: string; message: string }
  ): void {
    if (agentId !== CAMILA_AGENT_ID || !error) return;
    if (error.code === 'action-gated' || error.code === 'push-pending' || error.code === 'interaction-pending') {
      return;
    }
    const targetHint = proposal.targetObjectId ? ` sobre ${proposal.targetObjectId}` : '';
    const feedback = `Intenté ${proposal.actionType}${targetHint} pero no funcionó (${error.code}): ${error.message}`;
    this.objectState.recordWorldChange({
      timestamp: worldTime,
      kind: 'camila_applied',
      objectId: proposal.targetObjectId ?? perception.locationId,
      summary: feedback,
    });
    this.memoryStore.addMemory({
      type: 'discovery',
      summary: feedback,
      timestamp: worldTime,
      placeId: perception.locationId,
    });
    if (this.notebook) {
      try {
        this.notebook.addDiaryEntry(feedback, worldTime, perception.locationId);
        if (proposal.targetObjectId) {
          const obj = findProbeObjectById(proposal.targetObjectId);
          const heldId = this.objectState.getHeldObjectId(agentId);
          const heldObj = heldId ? findProbeObjectById(heldId) : null;
          // Surgically refute ONLY open hypotheses that mention BOTH the held tool AND target AND action concept
          if (obj && heldObj) {
            const actionConcept = proposal.actionType === 'scoop' ? 'recoger' : 'rayar';
            this.notebook.refuteSpecificHypotheses(
              [heldObj.name.split(' ')[0], obj.name.split(' ')[0], actionConcept],
              worldTime
            );
          }
        }
        this.notebook.save();
      } catch {
        // Best-effort notebook
      }
    }
  }

  private executeStandUp(
    agentId: string,
    perception: NpcPerception,
    _proposal: NpcActionProposal,
    worldTime: string
  ): {
    status: NpcAiCycleStatus;
    commandDispatched?: NpcAiCycleResult['commandDispatched'];
    error?: { code: string; message: string };
  } {
    if (agentId !== CAMILA_AGENT_ID) {
      return {
        status: 'rejected',
        error: { code: 'action-not-for-agent', message: `Only ${CAMILA_AGENT_ID} can stand up.` },
      };
    }

    this.objectState.clearSittingState(agentId);
    try {
      this.objectState.save();
    } catch {
      // Best-effort save
    }

    const summary = `Me puse de pie en ${perception.locationId}.`;
    this.objectState.recordWorldChange({
      timestamp: worldTime,
      kind: 'camila_stood',
      objectId: perception.locationId,
      summary,
    });
    return {
      status: 'executed',
      commandDispatched: {
        commandName: 'stand-up',
        payload: {},
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
      this.recordCamilaInteractionOutcome(
        agentId,
        pending.interactionType,
        targetObjectId ?? '',
        'failed',
        'push-failed-reported',
        worldTime,
        this.objectState.getEffectivePlaceId(targetObjectId ?? '') ?? undefined
      );
      return {
        success: true,
        code: 'push-failed-reported',
        message: `Unity reported the ${pending.interactionType} of "${targetObjectId}" failed; no state change committed.`,
        agentId,
        targetObjectId: targetObjectId ?? '',
        committed: false,
      };
    }

    const object = findProbeObjectById(targetObjectId ?? '');
    if (!object) {
      this.pendingPushByAgent.delete(agentId);
      this.recordCamilaInteractionOutcome(
        agentId,
        pending.interactionType,
        targetObjectId ?? '',
        'failed',
        'unknown-object',
        worldTime
      );
      return fail('unknown-object', `Unknown probe object "${targetObjectId ?? ''}".`);
    }

    // Phase 2b: pick_up commits heldObjectId without requiring a new resting ground position
    if (pending.interactionType === 'pick_up') {
      this.objectState.setHeldObject(agentId, object.id);
      try {
        this.objectState.save();
      } catch (err) {
        this.objectState.clearHeldObject(agentId);
        this.pendingPushByAgent.delete(agentId);
        this.recordCamilaInteractionOutcome(agentId, 'pick_up', object.id, 'failed', 'object-position-persist-failed', worldTime, object.placeId);
        return fail('object-position-persist-failed', `Failed to persist pick_up: ${(err as Error).message}`);
      }
      this.pendingPushByAgent.delete(agentId);

      const currentPlace = this.objectState.getEffectivePlaceId(object.id) ?? object.placeId;
      this.heldCyclesByAgent.set(agentId, 0);
      this.heldOriginPlaceByAgent.set(agentId, currentPlace);
      this.objectState.recordWorldChange({
        timestamp: worldTime,
        kind: 'camila_picked_up',
        objectId: object.id,
        summary: `Recogí "${object.name}" (${object.id}) en ${currentPlace} y ahora lo llevo en mis manos.`,
      });
      try {
        this.memoryStore.addMemory({
          type: 'object_noticed',
          summary: `Recogí "${object.name}" (${object.id}) en ${currentPlace}.`,
          timestamp: worldTime,
          placeId: currentPlace,
        });
        if (this.notebook) {
          this.notebook.addDiaryEntry(`Recogí ${object.name} en ${currentPlace}.`, worldTime, currentPlace);
          const ownHypothesis = pending.hypothesis?.trim();
          if (ownHypothesis) this.notebook.addHypothesis(ownHypothesis.slice(0, 200), worldTime);
          this.notebook.save();
        }
      } catch {
        // Best-effort notebook
      }
      this.recordCamilaInteractionOutcome(agentId, 'pick_up', object.id, 'executed', 'pick-up-applied', worldTime, currentPlace);
      return {
        success: true,
        code: 'pick-up-applied',
        message: `Camila picked up "${object.id}".`,
        agentId,
        targetObjectId: object.id,
        committed: true,
      };
    }

    if (!reportedPosition || !isValidObjectPosition(reportedPosition)) {
      this.pendingPushByAgent.delete(agentId);
      this.recordCamilaInteractionOutcome(agentId, pending.interactionType, object.id, 'failed', 'invalid-reported-position', worldTime, object.placeId);
      return fail(
        'invalid-reported-position',
        'An applied push/drop report must carry a finite, in-bounds newPosition {x, y, z}.'
      );
    }

    const previous = this.objectState.getPosition(object.id);
    if (!previous || !this.objectState.setPosition(object.id, reportedPosition)) {
      this.pendingPushByAgent.delete(agentId);
      this.recordCamilaInteractionOutcome(agentId, pending.interactionType, object.id, 'failed', 'invalid-reported-position', worldTime, object.placeId);
      return fail('invalid-reported-position', `Could not set a new position for "${object.id}".`);
    }
    if (pending.interactionType === 'drop') {
      this.objectState.clearHeldObject(agentId);
      this.heldCyclesByAgent.delete(agentId);
      this.heldOriginPlaceByAgent.delete(agentId);
    }
    try {
      this.objectState.save();
    } catch (err) {
      this.objectState.setPosition(object.id, previous);
      if (pending.interactionType === 'drop') {
        this.objectState.setHeldObject(agentId, object.id);
      }
      this.pendingPushByAgent.delete(agentId);
      this.recordCamilaInteractionOutcome(agentId, pending.interactionType, object.id, 'failed', 'object-position-persist-failed', worldTime, object.placeId);
      return fail(
        'object-position-persist-failed',
        `Failed to persist the new position of "${object.id}": ${(err as Error).message}`
      );
    }
    this.pendingPushByAgent.delete(agentId);

    // Objective cause-and-effect proximity feedback (distance moved + nearest neighbor object within 4m)
    const effectivePlace = this.objectState.getEffectivePlaceId(object.id) ?? object.placeId;
    const distMoved = Math.hypot(reportedPosition.x - previous.x, reportedPosition.z - previous.z);
    let nearestPeerText = '';
    let nearestPeerDist = 4.0;
    for (const peer of CAMILA_PROBE_OBJECTS) {
      if (peer.id === object.id) continue;
      const peerPos = this.objectState.getPosition(peer.id) ?? peer.unityPosition;
      const d = Math.hypot(peerPos.x - reportedPosition.x, peerPos.z - reportedPosition.z);
      if (d < nearestPeerDist) {
        nearestPeerDist = d;
        nearestPeerText = ` Quedó a ${d.toFixed(1)}m de "${peer.name}" (${peer.id}).`;
      }
    }

    // Detect physical soccer goal when probe:ball enters Probe_SmallGoal frame (X in [66.45, 69.55], Z in [17.85, 19.15])
    const scoredGoal =
      pending.interactionType === 'push' &&
      object.id === 'probe:ball' &&
      reportedPosition.x >= 66.45 &&
      reportedPosition.x <= 69.55 &&
      reportedPosition.z >= 17.85 &&
      reportedPosition.z <= 19.15;
    if (scoredGoal) {
      this.objectState.setPhysicalState('probe:small-goal', { goalScored: true });
      try {
        this.objectState.save();
      } catch {
        // Best-effort save
      }
    }

    // Memory + notebook + sensory delta feedback (best effort — never fails the interaction).
    try {
      const isDrop = pending.interactionType === 'drop';
      const targetObjRef = pending.pushTowardsObjectId
        ? findProbeObjectById(pending.pushTowardsObjectId)
        : null;
      const towardsText = targetObjRef
        ? `hacia ${targetObjRef.name}`
        : pending.pushTowardsPlaceId
          ? `hacia ${pending.pushTowardsPlaceId}`
          : 'lejos de mí';
      const goalNote = scoredGoal ? ' ¡Entró directo en la Portería pequeña (gol)!' : '';

      const summaryText = isDrop
        ? `Dejé ${object.name} (${object.id}) en ${effectivePlace}.${nearestPeerText}`
        : `Empujé ${object.name} (${object.id}) ${towardsText}: rodó ${distMoved.toFixed(1)}m hasta (${reportedPosition.x.toFixed(1)}, ${reportedPosition.z.toFixed(1)}).${nearestPeerText}${goalNote}`;

      this.objectState.recordWorldChange({
        timestamp: worldTime,
        kind: isDrop ? 'camila_dropped' : 'camila_pushed',
        objectId: object.id,
        summary: summaryText,
      });

      this.memoryStore.addMemory({
        type: 'object_noticed',
        summary: summaryText,
        timestamp: worldTime,
        placeId: effectivePlace,
      });
      if (this.notebook) {
        const seenIds = [object.id];
        if (pending.pushTowardsObjectId) seenIds.push(pending.pushTowardsObjectId);
        if (pending.nearObjectId) seenIds.push(pending.nearObjectId);
        this.notebook.recordObjectsSeen(effectivePlace, seenIds, worldTime);
        this.notebook.addDiaryEntry(summaryText, worldTime, effectivePlace);
        this.notebook.addNoteToPlace(effectivePlace, summaryText, worldTime);
        const ownHypothesis = pending.hypothesis?.trim();
        if (ownHypothesis) {
          this.notebook.addHypothesis(ownHypothesis.slice(0, 200), worldTime);
        }
        if (scoredGoal) {
          this.notebook.resolveMatchingHypotheses(
            ['pelota', 'porteria', 'conos', 'gol', 'anotar'],
            'confirmed',
            worldTime,
            2
          );
        }
        this.notebook.save();
      }
    } catch {
      // Notebook/memory failures never fail a committed push/drop.
    }

    this.recordCamilaInteractionOutcome(
      agentId,
      pending.interactionType,
      object.id,
      'executed',
      pending.interactionType === 'drop' ? 'drop-applied' : 'push-applied',
      worldTime,
      effectivePlace
    );
    return {
      success: true,
      code: pending.interactionType === 'drop' ? 'drop-applied' : 'push-applied',
      message: `${pending.interactionType === 'drop' ? 'Drop' : 'Push'} of "${object.id}" committed at (${reportedPosition.x}, ${reportedPosition.y}, ${reportedPosition.z}).`,
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
    committed: boolean,
    interruptedDestinationId?: string,
    interruptionMessage?: string
  ): void {
    this.activeTraversalStartedWallMs.delete(agentId);
    if (!committed || !arrivedPlaceId) {
      if (agentId === CAMILA_AGENT_ID && interruptedDestinationId) {
        const reason = interruptionMessage?.trim() || 'acceso bloqueado o puerta cerrada';
        const note = `No pude entrar a ${interruptedDestinationId}: ${reason}.`;
        this.memoryStore.addMemory({
          type: 'discovery',
          summary: note,
          timestamp: worldTime,
          placeId: interruptedDestinationId,
        });
        this.objectState.recordWorldChange({
          timestamp: worldTime,
          kind: 'player_moved',
          objectId: interruptedDestinationId,
          summary: note,
        });
        if (this.notebook) {
          try {
            this.notebook.addDiaryEntry(note, worldTime, interruptedDestinationId);
            this.notebook.save();
          } catch {
            // Best-effort notebook
          }
        }
      }
      return;
    }

    this.memoryStore.addMemory({
      type: 'place_visited',
      summary: `Arrived at "${arrivedPlaceId}".`,
      timestamp: worldTime,
      placeId: arrivedPlaceId,
    });

    if (agentId === CAMILA_AGENT_ID) {
      this.lastLocationByAgent.set(agentId, arrivedPlaceId);
      this.placesTraversedSinceRestByAgent.set(
        agentId,
        (this.placesTraversedSinceRestByAgent.get(agentId) ?? 0) + 1
      );
      // Keep any carried object's persisted position synced to Camila's arrived place
      const heldId = this.objectState.getHeldObjectId(agentId);
      const anchorPos = CAMILA_UNITY_ANCHORS[arrivedPlaceId];
      if (heldId && anchorPos) {
        this.objectState.setPosition(heldId, anchorPos);
        try { this.objectState.save(); } catch { /* best-effort */ }
      }
      if (this.notebook) {
        try {
          // Record the place visit WITHOUT marking its objects as seen yet so Camila
          // first experiences and explores local objects before moving on!
          this.notebook.recordVisit(arrivedPlaceId, worldTime, []);
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

  /**
   * Experiential learning v1: records one ledger entry per Camila cycle
   * that reaches a terminal decision. `noop` cycles (waiting for a
   * traversal, deliberate observe, fallback) are not attempts and are never
   * recorded. The ledger is counts only — this adds no diary line, so the
   * prose record is not duplicated. Best effort: a notebook save failure
   * never fails the cycle.
   */
  private recordCamilaCycleOutcome(agentId: string, result: NpcAiCycleResult): void {
    if (agentId !== CAMILA_AGENT_ID || !this.notebook) return;
    if (result.status === 'noop') return;
    const proposal = result.proposal;
    let actionType: string;
    let targetObjectId = '';
    let outcome: 'executed' | 'rejected' | 'failed';
    let code: string;
    if (result.status === 'executed') {
      outcome = 'executed';
      actionType = proposal?.actionType ?? 'unknown';
      targetObjectId = proposal?.targetObjectId ?? '';
      code = result.commandDispatched?.commandName ?? 'ok';
    } else if (result.status === 'rejected') {
      outcome = 'rejected';
      actionType = proposal?.actionType ?? 'unknown';
      targetObjectId = proposal?.targetObjectId ?? '';
      code = result.error?.code ?? 'rejected';
    } else if (result.status === 'invalid_proposal') {
      outcome = 'failed';
      actionType = typeof proposal?.actionType === 'string' ? proposal.actionType : 'unknown';
      targetObjectId = proposal?.targetObjectId ?? '';
      code = result.error?.code ?? 'invalid-proposal-shape';
    } else {
      // provider_failed: no proposal ever existed, so the failed attempt is
      // recorded under 'cognition', not under any world action.
      outcome = 'failed';
      actionType = 'cognition';
      code = result.error?.code ?? 'provider-execution-failed';
    }
    try {
      this.notebook.recordOutcome({
        actionType,
        targetObjectId,
        outcome,
        code,
        at: result.worldTime,
        placeId: result.perception.locationId,
      });
      this.notebook.save();
    } catch {
      // Best-effort ledger: never fails a cycle.
    }
  }

  /**
   * Experiential learning v1: records the physical Unity report for a
   * dispatched interaction (applied / failed). This is a second ledger
   * event for the same attempt — the dispatch was already recorded by the
   * cycle — because only the report says what physically happened.
   * Spurious reports with no matching pending interaction are never recorded.
   */
  private recordCamilaInteractionOutcome(
    agentId: string,
    interactionType: 'push' | 'pick_up' | 'drop',
    targetObjectId: string,
    outcome: 'executed' | 'failed',
    code: string,
    worldTime: string,
    placeId?: string
  ): void {
    if (agentId !== CAMILA_AGENT_ID || !this.notebook) return;
    const actionType =
      interactionType === 'push'
        ? 'push_object'
        : interactionType === 'pick_up'
          ? 'pick_up_object'
          : 'drop_object';
    try {
      this.notebook.recordOutcome({
        actionType,
        targetObjectId,
        outcome,
        code,
        at: worldTime,
        placeId,
      });
      this.notebook.save();
    } catch {
      // Best-effort ledger: never fails the interaction.
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
