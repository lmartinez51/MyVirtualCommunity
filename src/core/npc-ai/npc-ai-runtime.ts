/**
 * Milestone 92: NPC AI Runtime Orchestrator
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
 */

import type { WorldState } from '../world-state.js';
import type { WorldSessionController, CommandDispatchResult } from '../../server/session-controller.js';
import { NpcMemoryStore } from './npc-memory.js';
import { deriveNpcPerception } from './npc-perception.js';
import { DeterministicNpcCognitionProvider } from './providers/deterministic-cognition-provider.js';
import type {
  NpcCognitionProvider,
  NpcCognitionContext,
  NpcGoal,
  NpcActionProposal,
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

export interface NpcAiRuntimeOptions {
  controller: WorldSessionController;
  provider?: NpcCognitionProvider;
  memoryStore?: NpcMemoryStore;
  goal?: NpcGoal;
}

export class NpcAiRuntime {
  private readonly controller: WorldSessionController;
  private provider: NpcCognitionProvider;
  private readonly memoryStore: NpcMemoryStore;
  private readonly goal: NpcGoal;
  private cycleCounter: number = 0;
  private lastCycleByAgent = new Map<string, NpcAiCycleResult>();

  constructor(options: NpcAiRuntimeOptions) {
    this.controller = options.controller;
    this.provider = options.provider ?? new DeterministicNpcCognitionProvider();
    this.memoryStore = options.memoryStore ?? new NpcMemoryStore(15);
    this.goal = options.goal ?? DEFAULT_ELENA_GOAL;
  }

  public setProvider(provider: NpcCognitionProvider): void {
    this.provider = provider;
  }

  public getProvider(): NpcCognitionProvider {
    return this.provider;
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
      providerId: this.provider.id,
      totalCycles: this.cycleCounter,
      lastCycle: this.lastCycleByAgent.get(agentId),
      activeGoal: this.goal,
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

    const context: NpcCognitionContext = {
      perception,
      goal: this.goal,
      memories: this.memoryStore.getMemories(),
    };

    // 1. Invoke Cognition Provider safely
    let cognitionResult;
    try {
      cognitionResult = await this.provider.decideAction(context);
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
      return result;
    }

    const proposal = cognitionResult.proposal;

    // 2. Validate Proposal Shape
    if (
      !proposal ||
      typeof proposal !== 'object' ||
      !['observe', 'offer_service', 'approach_player', 'acknowledge_player'].includes(
        proposal.actionType
      )
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
}
