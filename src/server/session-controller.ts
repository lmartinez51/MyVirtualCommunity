import { bootstrapWorld, BootstrapOptions } from '../core/bootstrap.js';
import { WorldClock } from '../core/clock.js';
import {
  WorldState,
  InspectCurrentLocationResult,
  InspectPlayerHistoryResult,
  InquireAgentScheduleResult,
  inspectCurrentLocation,
  inspectPlayerHistory,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  exitRestaurant,
  traverseToStreet,
  purchaseOffering,
  startHavingCoffee,
  greetAgent,
  introduceToAgent,
  inquireAgentSchedule,
} from '../core/world-state.js';
import { Simulation, TickResult } from '../core/simulation.js';
import { LocalFilePersistence } from '../persistence/local-storage.js';
import { DEFAULT_DEVELOPMENT_PLAYER_ID } from './config.js';

export interface SessionControllerOptions extends BootstrapOptions {
  playerId?: string;
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
  private commandQueue: Promise<unknown> = Promise.resolve();
  private isShuttingDown: boolean = false;
  private isStopped: boolean = false;

  constructor(options: SessionControllerOptions = {}) {
    const bootstrapResult = bootstrapWorld({
      persistencePath: options.persistencePath,
      silent: options.silent ?? true,
    });

    this.clock = bootstrapResult.clock;
    this.state = bootstrapResult.state;
    this.persistence = bootstrapResult.persistence;
    this.activePlayerId = options.playerId ?? DEFAULT_DEVELOPMENT_PLAYER_ID;
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
    return inquireAgentSchedule(this.state, this.activePlayerId, targetAgentId);
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

      // 1. Create candidate state via deep clone
      const candidate = structuredClone(this.state);

      // 2. Execute domain transition against candidate
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
      const candidateSimulation = new Simulation(candidateClock, candidateState, { silent: true });

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

      case 'leaveBuilding': {
        const player = candidateState.agents.find((a) => a.id === this.activePlayerId);
        const buildingId = (payload.buildingId as string) || (player?.locationId ?? '');
        return leaveBuilding(candidateState, this.activePlayerId, buildingId);
      }

      case 'enterRestaurant': {
        const restaurantId = payload.restaurantId as string;
        return enterRestaurant(candidateState, this.activePlayerId, restaurantId, { silent: true });
      }

      case 'exitRestaurant': {
        const player = candidateState.agents.find((a) => a.id === this.activePlayerId);
        const restaurantId = (payload.restaurantId as string) || (player?.locationId ?? '');
        return exitRestaurant(candidateState, this.activePlayerId, restaurantId);
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

      case 'greetAgent': {
        const targetAgentId = payload.targetAgentId as string;
        return greetAgent(candidateState, this.activePlayerId, targetAgentId);
      }

      case 'introduceAgent': {
        const targetAgentId = payload.targetAgentId as string;
        return introduceToAgent(candidateState, this.activePlayerId, targetAgentId);
      }

      default:
        throw new Error(`Unhandled command mapping for "${commandName}"`);
    }
  }
}
