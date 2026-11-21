/**
 * Milestone 94: Deterministic mock Meta Model adapter.
 *
 * Used when MODEL_API_KEY is not configured (the default) and in tests:
 * zero network, fully reproducible. Mirrors the Hackathon Edition's
 * MockMetaModelAdapter role, but for the single Camila method.
 *
 * Mock behaviour: it parses the perception JSON it is given and proposes
 * move_to_place to the first unvisited place; when every place has been
 * visited it proposes observe. A canned decision can be injected for tests.
 */

import type {
  ExplorerDecisionContext,
  MetaModelPort,
  MetaModelResponse,
} from '../ports/meta-model-port.js';

export interface MockMetaModelAdapterOptions {
  readonly modelName?: string;
  readonly cannedDecision?: string;
  readonly shouldFail?: boolean;
}

export class MockMetaModelAdapter implements MetaModelPort {
  public readonly mode = 'local-mock' as const;
  private readonly modelName: string;
  private cannedDecision?: string;
  private shouldFail: boolean;
  public callCount = 0;
  public lastContextReceived: ExplorerDecisionContext | null = null;

  constructor(options: MockMetaModelAdapterOptions = {}) {
    this.modelName = options.modelName ?? 'muse-spark-1.3-mock';
    this.cannedDecision = options.cannedDecision;
    this.shouldFail = options.shouldFail ?? false;
  }

  public setCannedDecision(decisionJson?: string): void {
    this.cannedDecision = decisionJson;
  }

  public setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  public async generateExplorerDecision(
    context: ExplorerDecisionContext
  ): Promise<MetaModelResponse> {
    this.callCount += 1;
    this.lastContextReceived = context;

    if (this.shouldFail) {
      throw new Error('Simulated Meta Model API failure (mock)');
    }

    let text: string;
    if (this.cannedDecision) {
      text = this.cannedDecision;
    } else {
      // Deterministic curiosity: first unvisited place wins.
      let destination: string | null = null;
      try {
        const perception = JSON.parse(context.perceptionJson) as {
          unvisitedPlaceIds?: string[];
          locationId?: string;
        };
        destination = perception.unvisitedPlaceIds?.[0] ?? null;
      } catch {
        destination = null;
      }
      text = destination
        ? JSON.stringify({
            actionType: 'move_to_place',
            destinationPlaceId: destination,
            reasoningContext: 'No he visitado ese lugar todavía y quiero ver qué hay ahí.',
          })
        : JSON.stringify({
            actionType: 'observe',
            reasoningContext: 'Ya visité todos los lugares de mi lista, me quedo mirando un momento.',
          });
    }

    return {
      text,
      model: this.modelName,
      usage: { promptTokens: 120, completionTokens: 40, totalTokens: 160 },
    };
  }
}
