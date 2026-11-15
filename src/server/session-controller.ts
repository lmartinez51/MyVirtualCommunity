import { bootstrapWorld, BootstrapOptions } from '../core/bootstrap.js';
import { WorldClock } from '../core/clock.js';
import {
  WorldState,
  InspectCurrentLocationResult,
  InspectPlayerHistoryResult,
  InquireAgentScheduleResult,
  InquireRestaurantServiceResult,
  OrderLine,
  FulfillmentMode,
  inspectCurrentLocation,
  inspectPlayerHistory,
  enterBuilding,
  interactAtResidence,
  leaveBuilding,
  enterRestaurant,
  exitRestaurant,
  traverseToStreet,
  purchaseOffering,
  startHavingCoffee,
  startEatingPastry,
  greetAgent,
  introduceToAgent,
  inquireAgentSchedule,
  inquireRestaurantService,
  placeOrder,
  collectOrder,
  transferItemPossession,
  startAccompaniedActivity,
  evaluateRequestRestaurantService,
  commitRestaurantServiceInteraction,
  clearActiveRestaurantService,
} from '../core/world-state.js';
import {
  enterThroughEntranceThreshold,
  exitThroughEntranceThreshold,
  traverseInternalConnection,
  findInteriorSpaceByPlace,
  findEntranceById,
  createGomezMorinSpatialTopology,
} from '../core/real-world-street-topology.js';
import { Simulation, TickResult } from '../core/simulation.js';
import { LocalFilePersistence } from '../persistence/local-storage.js';
import { RealTimeSource } from './time-source.js';
import { DEFAULT_DEVELOPMENT_PLAYER_ID } from './config.js';
import {
  NpcAiRuntime,
  type NpcCognitionProvider,
  type NpcPerception,
  type NpcAiCycleResult,
  type NpcAiDiagnostics,
} from '../core/npc-ai/index.js';
import {
  findBusinessSchedule,
  evaluateBusinessScheduleStatus,
  evaluateBusinessAdmission,
  type BusinessAdmissionResultCode,
  type BusinessSchedule,
} from '../core/business-schedule.js';
import type { RestaurantOperationalState } from '../core/entities/restaurant.js';

export interface SessionControllerOptions extends BootstrapOptions {
  playerId?: string;
  timeSource?: RealTimeSource;
  aiProvider?: NpcCognitionProvider;
}

export interface RuntimeStatus {
  ready: boolean;
  worldId: string;
  schemaVersion: number;
  worldTime: string;
  activePlayerId: string;
  status: 'RUNNING' | 'SHUTTING_DOWN' | 'STOPPED';
}

export interface CommandDispatchResult {
  success: boolean;
  committed: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface SimulationStepDispatchResult {
  success: boolean;
  committed: boolean;
  result?: {
    previousTime: string;
    currentTime: string;
    tickResult: TickResult;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Authoritative temporal context for an individual state-changing transaction (Phase A).
 * Captured at the exact instant the transaction begins authoritative execution in the FIFO queue.
 */
export interface TransactionContext {
  readonly worldTime: string;
  readonly epochMs: number;
}

/**
 * Elapsed interval representation for temporal reconciliation (Phase A).
 */
export interface ReconciliationInterval {
  readonly startIso: string;
  readonly endIso: string;
  readonly durationMs: number;
}

/**
 * Outcome of an authoritative temporal reconciliation step (Phase A).
 */
export interface TemporalReconciliationResult {
  readonly success: boolean;
  readonly committed: boolean;
  readonly previousTime: string;
  readonly currentTime: string;
  readonly interval: ReconciliationInterval;
  readonly consequences?: TickResult;
  readonly error?: {
    code: string;
    message: string;
  };
}

/**
 * Result projection for read-only business schedule inquiry (GET /api/businesses/:id/schedule).
 */
export interface BusinessScheduleViewResult {
  readonly success: boolean;
  readonly result?: {
    readonly businessId: string;
    readonly name: string;
    readonly timeZone: string;
    readonly worldTime: string;
    readonly schedule: {
      readonly operatingDays: readonly number[];
      readonly hours: {
        readonly openHour: number;
        readonly openMinute: number;
        readonly closeHour: number;
        readonly closeMinute: number;
      };
      readonly lastEntryCutoffMinutes: number;
      readonly closureOverrides?: readonly string[];
      readonly version: number;
    };
    readonly operationalStatus: {
      readonly status: RestaurantOperationalState;
      readonly isOpen: boolean;
      readonly admissionPermitted: boolean;
      readonly code: BusinessAdmissionResultCode;
      readonly message: string;
      readonly openTimeStr: string;
      readonly closingTimeStr: string;
    };
  };
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

/**
 * WorldSessionController (Milestone 29).
 *
 * Authoritative in-memory session controller hosting the World Core.
 *
 * Guarantees:
 * 1. Single-runtime ownership: Retains active WorldState and WorldClock in memory.
 *    Does NOT reload the persistence file for every request.
 * 2. Sequential command execution: Serializes state-changing operations via a queue
 *    to prevent concurrent overlapping state mutations.
 * 3. Safe transactional persistence:
 *    - Applies transitions to a candidate clone.
 *    - If domain validation fails, candidate is discarded, active memory is untouched, no write.
 *    - If domain validation succeeds, candidate is saved to disk via LocalFilePersistence.
 *    - Only if disk write succeeds is the candidate committed to active memory.
 *    - If disk write fails, candidate is discarded, active memory remains untouched and in sync with disk.
 * 4. Non-authoritative projection queries: Provides read-only projections without disk writes.
 * 5. Explicit player identity: All player commands are bound to activePlayerId; client cannot override.
 */
export class WorldSessionController {
  private readonly clock: WorldClock;
  private state: WorldState;
  private readonly persistence: LocalFilePersistence;
  private readonly activePlayerId: string;
  private timeSource?: RealTimeSource;
  private commandQueue: Promise<unknown> = Promise.resolve();
  private isShuttingDown: boolean = false;
  private isStopped: boolean = false;
  private aiRuntime?: NpcAiRuntime;

  constructor(options: SessionControllerOptions = {}) {
    const bootstrapResult = bootstrapWorld({
      persistencePath: options.persistencePath,
      silent: options.silent ?? true,
      worldSeed: options.worldSeed,
      initialWorldTime: options.initialWorldTime,
      initialStateFactory: options.initialStateFactory,
    });

    this.clock = bootstrapResult.clock;
    this.state = bootstrapResult.state;
    this.persistence = bootstrapResult.persistence;
    const playerAgent = this.state.agents.find((a) => a.agentType === 'player');
    this.activePlayerId = options.playerId ?? playerAgent?.id ?? DEFAULT_DEVELOPMENT_PLAYER_ID;
    this.timeSource = options.timeSource;
    this.aiRuntime = new NpcAiRuntime({
      controller: this,
      provider: options.aiProvider,
    });
  }

  /**
   * Returns safe runtime status information without exposing raw WorldState.
   */
  public getStatus(): RuntimeStatus {
    return {
      ready: !this.isStopped,
      worldId: this.state.worldId,
      schemaVersion: this.state.version,
      worldTime: this.clock.getTime(),
      activePlayerId: this.activePlayerId,
      status: this.isShuttingDown ? 'SHUTTING_DOWN' : this.isStopped ? 'STOPPED' : 'RUNNING',
    };
  }

  /**
   * Returns read-only current location projection for the active player.
   * Zero state mutation, zero disk write.
   */
  public getLocationView(): InspectCurrentLocationResult {
    return inspectCurrentLocation(this.state, this.activePlayerId);
  }

  /**
   * Returns read-only player history projection for the active player.
   * Zero state mutation, zero disk write.
   */
  public getHistoryView(): InspectPlayerHistoryResult {
    return inspectPlayerHistory(this.state, this.activePlayerId);
  }

  /**
   * Returns read-only schedule inquiry projection for the target agent.
   * Zero state mutation, zero disk write, bypasses command queue.
   */
  public getScheduleView(targetAgentId: string): InquireAgentScheduleResult {
    return inquireAgentSchedule(structuredClone(this.state), this.activePlayerId, targetAgentId);
  }

  /**
   * Returns read-only restaurant service inquiry projection from a co-located staff NPC.
   * Zero state mutation, zero disk write, bypasses command queue.
   */
  public getRestaurantServiceView(staffNpcId: string): InquireRestaurantServiceResult {
    return inquireRestaurantService(structuredClone(this.state), this.activePlayerId, staffNpcId);
  }

  /**
   * Returns read-only business schedule and operational status projection.
   * Grounded in authoritative World Clock (or explicit evaluation timestamp).
   * Zero state mutation, zero disk write, bypasses command queue.
   */
  public getBusinessScheduleView(
    businessId: string,
    evaluatedAt?: string | number | Date
  ): BusinessScheduleViewResult {
    if (typeof businessId !== 'string' || businessId.trim() === '') {
      return {
        success: false,
        error: {
          code: 'invalid-business-id',
          message: 'Parameter "businessId" must be a non-empty string',
        },
      };
    }

    const trimmedId = businessId.trim();
    const schedule = findBusinessSchedule(trimmedId);
    if (!schedule) {
      return {
        success: false,
        error: {
          code: 'business-not-found',
          message: `Business "${trimmedId}" not found`,
        },
      };
    }

    let evaluationTimeIso: string;
    if (evaluatedAt !== undefined && evaluatedAt !== null) {
      const parsedDate = new Date(evaluatedAt);
      if (Number.isNaN(parsedDate.getTime())) {
        return {
          success: false,
          error: {
            code: 'invalid-evaluation-time',
            message: `Evaluation timestamp "${String(evaluatedAt)}" is invalid`,
          },
        };
      }
      evaluationTimeIso = parsedDate.toISOString();
    } else {
      evaluationTimeIso = this.clock.getTime();
    }

    const operationalState = evaluateBusinessScheduleStatus(schedule, evaluationTimeIso);
    const admissionDecision = evaluateBusinessAdmission(schedule, evaluationTimeIso);

    return {
      success: true,
      result: {
        businessId: schedule.businessId,
        name: schedule.name,
        timeZone: schedule.timeZone,
        worldTime: evaluationTimeIso,
        schedule: {
          operatingDays: schedule.operatingDays,
          hours: {
            openHour: schedule.hours.openHour,
            openMinute: schedule.hours.openMinute,
            closeHour: schedule.hours.closeHour,
            closeMinute: schedule.hours.closeMinute,
          },
          lastEntryCutoffMinutes: schedule.lastEntryCutoffMinutes,
          closureOverrides: schedule.closureOverrides ? [...schedule.closureOverrides] : [],
          version: schedule.version,
        },
        operationalStatus: {
          status: operationalState,
          isOpen: operationalState === 'open' || operationalState === 'closing-soon',
          admissionPermitted: admissionDecision.permitted,
          code: admissionDecision.code,
          message: admissionDecision.message,
          openTimeStr: admissionDecision.openTimeStr,
          closingTimeStr: admissionDecision.closingTimeStr,
        },
      },
    };
  }

  /**
   * Milestone 92: Returns the NPC AI runtime orchestrator.
   */
  public getNpcAiRuntime(): NpcAiRuntime {
    if (!this.aiRuntime) {
      this.aiRuntime = new NpcAiRuntime({ controller: this });
    }
    return this.aiRuntime;
  }

  /**
   * Injects or overrides the NPC AI runtime orchestrator.
   */
  public setNpcAiRuntime(runtime: NpcAiRuntime): void {
    this.aiRuntime = runtime;
  }

  /**
   * Returns read-only bounded perception for the target NPC.
   */
  public getNpcPerception(agentId: string): NpcPerception {
    return this.getNpcAiRuntime().getPerception(agentId);
  }

  /**
   * Executes a single AI cognition cycle for the target NPC.
   */
  public runNpcAiCycle(agentId: string): Promise<NpcAiCycleResult> {
    return this.getNpcAiRuntime().runCycle(agentId);
  }

  /**
   * Returns AI diagnostics for the target NPC.
   */
  public getNpcAiDiagnostics(agentId: string): NpcAiDiagnostics {
    return this.getNpcAiRuntime().getDiagnostics(agentId);
  }

  /**
   * Returns the persistence instance. Used by tests to verify isolation.
   */
  public getPersistence(): LocalFilePersistence {
    return this.persistence;
  }

  /**
   * Returns the active development player ID.
   */
  public getActivePlayerId(): string {
    return this.activePlayerId;
  }

  /**
   * Returns the configured RealTimeSource, if any.
   */
  public getTimeSource(): RealTimeSource | undefined {
    return this.timeSource;
  }

  /**
   * Injects or updates the RealTimeSource for execution-boundary temporal alignment.
   */
  public setTimeSource(timeSource: RealTimeSource): void {
    this.timeSource = timeSource;
  }

  /**
   * Dispatches a state-changing command sequentially through the serialization queue.
   */
  public dispatchCommand(commandName: string, payload: Record<string, unknown> = {}): Promise<CommandDispatchResult> {
    if (this.isShuttingDown || this.isStopped) {
      return Promise.resolve({
        success: false,
        committed: false,
        error: {
          code: 'server-shutting-down',
          message: 'Server is shutting down or stopped; rejecting command',
        },
      });
    }

    const task = async (): Promise<CommandDispatchResult> => {
      if (this.isShuttingDown || this.isStopped) {
        return {
          success: false,
          committed: false,
          error: {
            code: 'server-shutting-down',
            message: 'Server is shutting down or stopped; rejecting command',
          },
        };
      }

      // 0. Authoritative Execution-Boundary Real-Time Alignment (Phase A Correction)
      // When a RealTimeSource is configured, reconcile World Time to the latest observed
      // real instant before capturing the transaction context.
      if (this.timeSource) {
        const realNow = this.timeSource.now();
        const currentEpoch = this.clock.getEpochMs();
        if (realNow > currentEpoch) {
          const reconResult = this.performTemporalReconciliation(realNow, { silent: true });
          if (!reconResult.success && reconResult.error?.code === 'persistence-failure') {
            return {
              success: false,
              committed: false,
              error: reconResult.error,
            };
          }
        }
      }

      // 1. Capture authoritative temporal context T at the exact instant execution begins (Phase A, Rule I, Section 3)
      const context: TransactionContext = {
        worldTime: this.clock.getTime(),
        epochMs: this.clock.getEpochMs(),
      };

      // 2. Create candidate state via deep clone and stamp with transaction instant
      const candidate = structuredClone(this.state);
      candidate.worldTime = context.worldTime;

      // 3. Execute domain transition against candidate with explicit temporal context
      let domainResult: { success: boolean; code?: string; message?: string };
      try {
        domainResult = this.executeDomainFunction(commandName, payload, candidate);
      } catch (err) {
        return {
          success: false,
          committed: false,
          error: {
            code: 'domain-execution-error',
            message: (err as Error).message,
          },
        };
      }

      // 3. Check domain outcome
      if (!domainResult.success) {
        // Precondition or domain failure: candidate discarded, zero mutation, zero disk write.
        return {
          success: false,
          committed: false,
          result: domainResult,
          error: {
            code: domainResult.code ?? 'domain-validation-failed',
            message: domainResult.message ?? 'Domain validation failed',
          },
        };
      }

      // 4. Domain succeeded! Attempt persistence of candidate state
      try {
        this.persistence.save(candidate);
      } catch (persistError) {
        // Persistence failed: candidate discarded, active memory remains untouched and in sync with disk!
        return {
          success: false,
          committed: false,
          result: domainResult,
          error: {
            code: 'persistence-failure',
            message: `Failed to persist world state: ${(persistError as Error).message}`,
          },
        };
      }

      // 5. Persistence succeeded! Commit candidate to active in-memory state
      this.state = candidate;

      // Milestone 91: Authoritative post-commit interaction synchronization
      if (commandName === 'requestRestaurantService' && domainResult.success && (domainResult as any).event) {
        commitRestaurantServiceInteraction((domainResult as any).event);
      } else if (
        commandName === 'exitRestaurant' ||
        commandName === 'exitEntranceThreshold' ||
        commandName === 'traverseStreet'
      ) {
        clearActiveRestaurantService(this.activePlayerId);
      }

      return {
        success: true,
        committed: true,
        result: domainResult,
      };
    };

    const nextPromise = this.commandQueue.then(task, task);
    this.commandQueue = nextPromise.then(() => {}, () => {});
    return nextPromise;
  }

  /**
   * Controlled simulation step.
   *
   * Advances logical WorldClock by advanceDurationMs and executes discrete simulation rules.
   * Serialized through the same command queue to guarantee atomic consistency.
   */
  public stepSimulation(advanceDurationMs: number): Promise<SimulationStepDispatchResult> {
    if (this.isShuttingDown || this.isStopped) {
      return Promise.resolve({
        success: false,
        committed: false,
        error: {
          code: 'server-shutting-down',
          message: 'Server is shutting down or stopped; rejecting simulation step',
        },
      });
    }

    if (
      typeof advanceDurationMs !== 'number' ||
      !Number.isFinite(advanceDurationMs) ||
      advanceDurationMs < 0 ||
      advanceDurationMs > 86_400_000
    ) {
      return Promise.resolve({
        success: false,
        committed: false,
        error: {
          code: 'invalid-simulation-input',
          message: 'advanceDurationMs must be a finite, non-negative number <= 86,400,000 (24h)',
        },
      });
    }

    const task = async (): Promise<SimulationStepDispatchResult> => {
      if (this.isShuttingDown || this.isStopped) {
        return {
          success: false,
          committed: false,
          error: {
            code: 'server-shutting-down',
            message: 'Server is shutting down or stopped; rejecting simulation step',
          },
        };
      }

      const previousTime = this.clock.getTime();
      const nextEpochMs = this.clock.getEpochMs() + advanceDurationMs;
      const nextTime = new Date(nextEpochMs).toISOString();

      // Candidate state & candidate clock
      const candidateState = structuredClone(this.state);
      const candidateClock = WorldClock.create(nextTime);
      const candidateSimulation = new Simulation(candidateClock, candidateState, {
        silent: true,
      });

      let tickResult: TickResult;
      try {
        tickResult = candidateSimulation.tick();
      } catch (err) {
        return {
          success: false,
          committed: false,
          error: {
            code: 'simulation-tick-error',
            message: (err as Error).message,
          },
        };
      }

      // Persist candidate state
      try {
        this.persistence.save(candidateState);
      } catch (persistError) {
        // Disk write failed: candidate discarded, clock not advanced, active memory untouched!
        return {
          success: false,
          committed: false,
          error: {
            code: 'persistence-failure',
            message: `Failed to persist simulated world state: ${(persistError as Error).message}`,
          },
        };
      }

      // Commit clock and state
      this.clock.advance(advanceDurationMs);
      this.state = candidateState;

      return {
        success: true,
        committed: true,
        result: {
          previousTime,
          currentTime: nextTime,
          tickResult,
        },
      };
    };

    const nextPromise = this.commandQueue.then(task, task);
    this.commandQueue = nextPromise.then(() => {}, () => {});
    return nextPromise;
  }

  /**
   * Authoritative temporal reconciliation (Phase A).
   *
   * Reconciles World Time toward an observed real-world instant.
   * Serialized through the internal command queue to guarantee mutual exclusion with player commands.
   *
   * @param targetEpochMs Observed real-world instant in epoch milliseconds.
   * @param options Execution options (e.g. silent logging).
   */
  public reconcileWorldTime(
    targetEpochMs: number,
    options: { silent?: boolean } = {}
  ): Promise<TemporalReconciliationResult> {
    if (this.isShuttingDown || this.isStopped) {
      return Promise.resolve({
        success: false,
        committed: false,
        previousTime: this.clock.getTime(),
        currentTime: this.clock.getTime(),
        interval: {
          startIso: this.clock.getTime(),
          endIso: this.clock.getTime(),
          durationMs: 0,
        },
        error: {
          code: 'server-shutting-down',
          message: 'Server is shutting down or stopped; rejecting temporal reconciliation',
        },
      });
    }

    if (typeof targetEpochMs !== 'number' || !Number.isFinite(targetEpochMs) || targetEpochMs < 0) {
      return Promise.resolve({
        success: false,
        committed: false,
        previousTime: this.clock.getTime(),
        currentTime: this.clock.getTime(),
        interval: {
          startIso: this.clock.getTime(),
          endIso: this.clock.getTime(),
          durationMs: 0,
        },
        error: {
          code: 'invalid-reconciliation-target',
          message: 'targetEpochMs must be a finite, non-negative epoch millisecond number',
        },
      });
    }

    const task = async (): Promise<TemporalReconciliationResult> => {
      if (this.isShuttingDown || this.isStopped) {
        return {
          success: false,
          committed: false,
          previousTime: this.clock.getTime(),
          currentTime: this.clock.getTime(),
          interval: {
            startIso: this.clock.getTime(),
            endIso: this.clock.getTime(),
            durationMs: 0,
          },
          error: {
            code: 'server-shutting-down',
            message: 'Server is shutting down or stopped; rejecting temporal reconciliation',
          },
        };
      }

      return this.performTemporalReconciliation(targetEpochMs, options);
    };

    const nextPromise = this.commandQueue.then(task, task);
    this.commandQueue = nextPromise.then(() => {}, () => {});
    return nextPromise;
  }

  /**
   * Internal authoritative reconciliation primitive (Phase A).
   * Executes candidate state derivation, simulation tick, atomic persistence, and clock commit.
   * Guaranteed to run within a serialized queued task boundary.
   */
  private performTemporalReconciliation(
    targetEpochMs: number,
    options: { silent?: boolean } = {}
  ): TemporalReconciliationResult {
    const currentEpochMs = this.clock.getEpochMs();
    const previousTime = this.clock.getTime();

    // Guard: Monotonicity check (TINV-02, Section 14). World Time cannot move backward.
    if (targetEpochMs < currentEpochMs) {
      return {
        success: false,
        committed: false,
        previousTime,
        currentTime: previousTime,
        interval: {
          startIso: previousTime,
          endIso: new Date(targetEpochMs).toISOString(),
          durationMs: targetEpochMs - currentEpochMs,
        },
        error: {
          code: 'clock-rollback-detected',
          message: `Target instant (${new Date(targetEpochMs).toISOString()}) is earlier than current World Time (${previousTime}). Monotonicity preserved.`,
        },
      };
    }

    // No-op if target instant is identical to current time
    if (targetEpochMs === currentEpochMs) {
      return {
        success: true,
        committed: false,
        previousTime,
        currentTime: previousTime,
        interval: {
          startIso: previousTime,
          endIso: previousTime,
          durationMs: 0,
        },
      };
    }

    const advanceDurationMs = targetEpochMs - currentEpochMs;
    const nextTime = new Date(targetEpochMs).toISOString();
    const interval: ReconciliationInterval = {
      startIso: previousTime,
      endIso: nextTime,
      durationMs: advanceDurationMs,
    };

    // Candidate state & candidate clock at target instant
    const candidateState = structuredClone(this.state);
    candidateState.worldTime = nextTime;
    const candidateClock = WorldClock.create(nextTime);
    const candidateSimulation = new Simulation(candidateClock, candidateState, {
      silent: options.silent ?? true,
    });

    let tickResult: TickResult;
    try {
      tickResult = candidateSimulation.tick();
    } catch (err) {
      return {
        success: false,
        committed: false,
        previousTime,
        currentTime: previousTime,
        interval,
        error: {
          code: 'simulation-tick-error',
          message: (err as Error).message,
        },
      };
    }

    // Persist candidate state to disk atomically
    try {
      this.persistence.save(candidateState);
    } catch (persistError) {
      return {
        success: false,
        committed: false,
        previousTime,
        currentTime: previousTime,
        interval,
        error: {
          code: 'persistence-failure',
          message: `Failed to persist reconciled world state: ${(persistError as Error).message}`,
        },
      };
    }

    // Commit clock and state
    this.clock.advanceTo(targetEpochMs);
    this.state = candidateState;

    return {
      success: true,
      committed: true,
      previousTime,
      currentTime: nextTime,
      interval,
      consequences: tickResult,
    };
  }

  /**
   * Initiates shutdown of the controller.
   * Rejects subsequent commands and awaits completion of any in-flight queued operation.
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    try {
      await this.commandQueue;
    } catch {
      // Ignore in-flight task failures during shutdown
    }
    this.isStopped = true;
  }

  /**
   * Dispatches command to the appropriate World Core function.
   * Private helper called inside serialized task.
   */
  private executeDomainFunction(
    commandName: string,
    payload: Record<string, unknown>,
    candidateState: WorldState
  ): { success: boolean; code?: string; message?: string } {
    switch (commandName) {
      case 'enterBuilding': {
        const buildingId = payload.buildingId as string;
        return enterBuilding(candidateState, this.activePlayerId, buildingId);
      }

      case 'interactAtResidence': {
        const buildingId = payload.buildingId as string;
        return interactAtResidence(candidateState, this.activePlayerId, buildingId);
      }

      case 'leaveBuilding': {
        const player = candidateState.agents.find((a) => a.id === this.activePlayerId);
        const buildingId = (payload.buildingId as string) || (player?.locationId ?? '');
        return leaveBuilding(candidateState, this.activePlayerId, buildingId);
      }

      case 'enterRestaurant': {
        const restaurantId = payload.restaurantId as string;
        const topology = createGomezMorinSpatialTopology();
        const interior = findInteriorSpaceByPlace(topology, restaurantId);
        if (interior && interior.entranceIds.length > 0) {
          const player = candidateState.agents.find((a) => a.id === this.activePlayerId);
          const entranceId = (payload.entranceId as string) || interior.entranceIds[0];
          const entrance = findEntranceById(topology, entranceId);
          if (
            player &&
            entrance &&
            (player.locationId === entrance.facingStreetPlaceId ||
              player.locationId === entrance.buildingId)
          ) {
            return enterThroughEntranceThreshold(candidateState, {
              agentId: this.activePlayerId,
              entranceId,
              spatialPosition: payload.spatialPosition as { x: number; z: number } | undefined,
            }, topology);
          }
        }
        return enterRestaurant(candidateState, this.activePlayerId, restaurantId, { silent: true });
      }

      case 'exitRestaurant': {
        const player = candidateState.agents.find((a) => a.id === this.activePlayerId);
        const restaurantId = (payload.restaurantId as string) || (player?.locationId ?? '');
        const topology = createGomezMorinSpatialTopology();
        const interior = findInteriorSpaceByPlace(topology, restaurantId);
        if (interior && interior.entranceIds.length > 0) {
          const entranceId = (payload.entranceId as string) || interior.entranceIds[0];
          return exitThroughEntranceThreshold(candidateState, {
            agentId: this.activePlayerId,
            entranceId,
            spatialPosition: payload.spatialPosition as { x: number; z: number } | undefined,
          }, topology);
        }
        return exitRestaurant(candidateState, this.activePlayerId, restaurantId);
      }

      case 'enterEntranceThreshold': {
        const entranceId = payload.entranceId as string;
        if (!entranceId) {
          return {
            success: false,
            code: 'missing-entrance-id',
            message: 'entranceId is required for enterEntranceThreshold',
          };
        }
        return enterThroughEntranceThreshold(candidateState, {
          agentId: this.activePlayerId,
          entranceId,
          spatialPosition: payload.spatialPosition as { x: number; z: number } | undefined,
        });
      }

      case 'exitEntranceThreshold': {
        const entranceId = payload.entranceId as string;
        if (!entranceId) {
          return {
            success: false,
            code: 'missing-entrance-id',
            message: 'entranceId is required for exitEntranceThreshold',
          };
        }
        return exitThroughEntranceThreshold(candidateState, {
          agentId: this.activePlayerId,
          entranceId,
          spatialPosition: payload.spatialPosition as { x: number; z: number } | undefined,
        });
      }

      case 'traverseInternalConnection': {
        const connectionId = payload.connectionId as string;
        if (!connectionId) {
          return {
            success: false,
            code: 'missing-connection-id',
            message: 'connectionId is required for traverseInternalConnection',
          };
        }
        const topology = createGomezMorinSpatialTopology();
        return traverseInternalConnection(candidateState, {
          agentId: this.activePlayerId,
          connectionId,
          spatialPosition: payload.spatialPosition as { x: number; z: number } | undefined,
        }, topology);
      }

      case 'traverseStreet': {
        const targetStreetId = payload.targetStreetId as string;
        return traverseToStreet(candidateState, this.activePlayerId, targetStreetId);
      }

      case 'purchaseOffering': {
        const offeringId = payload.offeringId as string;
        const player = candidateState.agents.find((a) => a.id === this.activePlayerId);
        const restaurantId = (payload.restaurantId as string) || (player?.locationId ?? '');
        return purchaseOffering(candidateState, this.activePlayerId, offeringId, restaurantId, {
          silent: true,
        });
      }

      case 'startCoffee': {
        return startHavingCoffee(candidateState, this.activePlayerId);
      }

      case 'startEatingPastry': {
        return startEatingPastry(candidateState, this.activePlayerId);
      }

      case 'startAccompaniedActivity': {
        const companionAgentId = payload.companionAgentId as string;
        return startAccompaniedActivity(candidateState, this.activePlayerId, companionAgentId);
      }

      case 'greetAgent': {
        const targetAgentId = payload.targetAgentId as string;
        return greetAgent(candidateState, this.activePlayerId, targetAgentId);
      }

      case 'introduceAgent': {
        const targetAgentId = payload.targetAgentId as string;
        return introduceToAgent(candidateState, this.activePlayerId, targetAgentId);
      }

      case 'giveItem': {
        const targetAgentId = payload.targetAgentId as string;
        const itemId = payload.itemId as string;
        return transferItemPossession(
          candidateState as any,
          this.activePlayerId,
          targetAgentId,
          itemId,
          candidateState.worldTime
        );
      }

      case 'placeOrder': {
        const restaurantId = payload.restaurantId as string;
        const lines = payload.lines as OrderLine[];
        const fulfillmentMode = (payload.fulfillmentMode as FulfillmentMode) ?? 'pickup';
        return placeOrder(candidateState as any, {
          customerId: this.activePlayerId,
          restaurantId,
          lines,
          fulfillmentMode,
        });
      }

      case 'collectOrder': {
        const orderId = payload.orderId as string;
        return collectOrder(candidateState as any, this.activePlayerId, orderId);
      }

      case 'inquireRestaurantService': {
        const staffNpcId = payload.staffNpcId as string;
        return inquireRestaurantService(candidateState as any, this.activePlayerId, staffNpcId);
      }

      case 'requestRestaurantService': {
        const restaurantId = payload.restaurantId as string | undefined;
        return evaluateRequestRestaurantService(
          candidateState,
          this.activePlayerId,
          restaurantId,
          payload
        );
      }

      default:
        throw new Error(`Unhandled command mapping for "${commandName}"`);
    }
  }
}
