/**
 * Milestone 94: Meta Model port (Muse Spark 1.3) for MyVirtualCommunity.
 *
 * Ported pattern from the Hackathon Edition (src/ports/meta-model-port.ts):
 * the port is the contract; the live adapter talks to the Meta Model API
 * (https://api.meta.ai/v1, OpenAI-compatible POST /chat/completions) and the
 * mock adapter answers deterministically offline. This repo ports ONLY the
 * one method Camila needs — generateExplorerDecision — not the Hackathon's
 * dialogue / witness / concierge / SAM surface.
 *
 * Invariant (same as the Hackathon port): the model only proposes a
 * structured action. It has zero authority over WorldState; the runtime
 * validates and translates the proposal through dispatchAgentIntent.
 */

export interface MetaModelConfig {
  readonly model: string;
  readonly apiKey?: string;
  readonly baseURL: string;
  readonly timeoutMs: number;
}

export function loadMetaModelConfig(env: NodeJS.ProcessEnv = process.env): MetaModelConfig {
  return {
    model: env.MODEL_NAME || env.META_MODEL || 'muse-spark-1.3',
    apiKey: env.MODEL_API_KEY || env.META_API_KEY || undefined,
    baseURL: env.MODEL_API_BASE_URL || env.META_API_BASE_URL || 'https://api.meta.ai/v1',
    timeoutMs: 30000,
  };
}

export interface MetaModelUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

export interface MetaModelResponse {
  readonly text: string;
  readonly model: string;
  readonly usage?: MetaModelUsage;
  readonly rawResponse?: unknown;
}

/**
 * Context for one Camila explorer decision. The world summary and notebook
 * excerpt are plain text (the world-state JSON + notebook, already rendered),
 * so the adapter stays transport-only and never builds prompts itself.
 */
export interface ExplorerDecisionContext {
  readonly systemPrompt: string;
  readonly worldStateSummary: string;
  readonly notebookExcerpt: string;
  readonly perceptionJson: string;
  readonly temperature?: number;
  readonly reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
}

export interface MetaModelPort {
  readonly mode: 'live-api' | 'local-mock';
  generateExplorerDecision(context: ExplorerDecisionContext): Promise<MetaModelResponse>;
  listModels?(): Promise<string[]>;
}

export class MetaApiError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = 'MetaApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
