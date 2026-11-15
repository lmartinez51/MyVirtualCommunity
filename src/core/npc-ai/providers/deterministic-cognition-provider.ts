/**
 * Milestone 92: Deterministic Test Cognition Provider
 *
 * Implements NpcCognitionProvider with deterministic, rule-based reasoning.
 * Used exclusively for automated test suites to ensure 100% reproducible,
 * zero-network, zero-nondeterministic test execution.
 */

import type {
  NpcCognitionProvider,
  NpcCognitionContext,
  NpcCognitionResult,
  NpcActionProposal,
} from '../npc-cognition-types.js';

export interface DeterministicProviderOptions {
  /**
   * If provided, always returns this exact canned proposal.
   */
  cannedProposal?: NpcActionProposal;
  /**
   * If true, throws an error simulating provider network / API crash.
   */
  shouldThrow?: boolean;
  errorMessage?: string;
  /**
   * If true, returns an unparseable or malformed proposal object.
   */
  returnMalformed?: boolean;
  /**
   * Simulated delay in milliseconds.
   */
  delayMs?: number;
}

export class DeterministicNpcCognitionProvider implements NpcCognitionProvider {
  public readonly id = 'deterministic-test-provider';
  private options: DeterministicProviderOptions;

  constructor(options: DeterministicProviderOptions = {}) {
    this.options = { ...options };
  }

  public setOptions(options: Partial<DeterministicProviderOptions>): void {
    this.options = { ...this.options, ...options };
  }

  public async decideAction(context: NpcCognitionContext): Promise<NpcCognitionResult> {
    const startTime = Date.now();

    if (this.options.delayMs && this.options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    }

    if (this.options.shouldThrow) {
      throw new Error(this.options.errorMessage || 'Simulated cognition provider failure');
    }

    if (this.options.returnMalformed) {
      return {
        proposal: {
          actionType: 'invalid_action_type' as any,
          requestedAt: context.perception.worldTime,
        },
        providerId: this.id,
        rawResponse: '{"invalid": true}',
        latencyMs: Date.now() - startTime,
      };
    }

    if (this.options.cannedProposal) {
      return {
        proposal: this.options.cannedProposal,
        providerId: this.id,
        latencyMs: Date.now() - startTime,
      };
    }

    const { perception } = context;
    let proposal: NpcActionProposal;

    // Rule 1: If on duty, player is co-located inside establishment, and no service is active -> propose offer_service
    if (
      perception.isOnDutyShift &&
      perception.perceivedPlayer?.isCoLocated &&
      !perception.perceivedPlayer.hasActiveService
    ) {
      proposal = {
        actionType: 'offer_service',
        targetAgentId: perception.perceivedPlayer.id,
        establishmentId: perception.establishment?.id,
        requestedAt: perception.worldTime,
        reasoningContext: `Player "${perception.perceivedPlayer.name}" is present at the counter and has not been served.`,
      };
    }
    // Rule 2: If service is already active with player -> propose observe
    else if (perception.perceivedPlayer?.hasActiveService) {
      proposal = {
        actionType: 'observe',
        targetAgentId: perception.perceivedPlayer.id,
        establishmentId: perception.establishment?.id,
        requestedAt: perception.worldTime,
        reasoningContext: `Service already active for player "${perception.perceivedPlayer.name}". Observing counter.`,
      };
    }
    // Rule 3: Default passive attendance
    else {
      proposal = {
        actionType: 'observe',
        establishmentId: perception.establishment?.id,
        requestedAt: perception.worldTime,
        reasoningContext: perception.isOnDutyShift
          ? 'On duty attending Wing Spot; awaiting customer arrival.'
          : 'Off duty resting.',
      };
    }

    return {
      proposal,
      providerId: this.id,
      latencyMs: Date.now() - startTime,
    };
  }
}
