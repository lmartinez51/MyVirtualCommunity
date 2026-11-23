/**
 * Milestone 94: Live Meta Model API adapter (Muse Spark 1.3).
 *
 * Ported pattern from the Hackathon Edition
 * (src/adapters/meta-model-api-adapter.ts): native fetch, OpenAI-compatible
 * POST /chat/completions, zero npm dependencies, injectable fetchFn for
 * offline testing, 30 s default timeout, and key sanitisation on every
 * error path. The API key is never logged.
 */

import type {
  ExplorerDecisionContext,
  MetaModelConfig,
  MetaModelPort,
  MetaModelResponse,
} from '../ports/meta-model-port.js';
import { MetaApiError } from '../ports/meta-model-port.js';

export interface MetaModelApiAdapterOptions {
  readonly config: MetaModelConfig;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

export class MetaModelApiAdapter implements MetaModelPort {
  public readonly mode = 'live-api' as const;
  private readonly config: MetaModelConfig;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: MetaModelApiAdapterOptions) {
    this.config = options.config;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? options.config.timeoutMs ?? 30000;
  }

  /** Redacts the API key / bearer tokens from any text before it is surfaced. */
  public sanitize(text: string): string {
    let sanitized = text;
    if (this.config.apiKey && this.config.apiKey.length > 0) {
      sanitized = sanitized.replaceAll(this.config.apiKey, '[REDACTED]');
    }
    sanitized = sanitized.replaceAll(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED]');
    return sanitized;
  }

  public async listModels(): Promise<string[]> {
    if (!this.config.apiKey || this.config.apiKey.trim() === '') {
      throw new MetaApiError(
        'MODEL_API_KEY is not configured. Set the MODEL_API_KEY environment variable.'
      );
    }
    const endpoint = `${this.config.baseURL}/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new MetaApiError(
          this.sanitize(`Meta Model API error (${response.status})`),
          response.status
        );
      }
      const models = (data as { data?: { id?: string }[] } | null)?.data ?? [];
      return models.map((m) => m.id ?? '').filter(Boolean);
    } catch (err) {
      if (err instanceof MetaApiError) throw err;
      throw new MetaApiError(this.sanitize((err as Error).message ?? String(err)));
    } finally {
      clearTimeout(timer);
    }
  }

  public async generateExplorerDecision(
    context: ExplorerDecisionContext
  ): Promise<MetaModelResponse> {
    if (!this.config.apiKey || this.config.apiKey.trim() === '') {
      throw new MetaApiError(
        'MODEL_API_KEY is not configured. Set the MODEL_API_KEY environment variable to call Muse Spark 1.3.'
      );
    }

    const userContent =
      `Mundo (JSON del mundo, marco Unity):\n${context.worldStateSummary}\n\n` +
      `Tu libreta (lo que descubriste antes):\n${context.notebookExcerpt}\n\n` +
      `Tu percepción actual:\n${context.perceptionJson}\n\n` +
      `Decide tu próxima acción, en español, devolviendo solo el JSON.`;

    const endpoint = `${this.config.baseURL}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: context.systemPrompt },
            { role: 'user', content: userContent },
          ],
          temperature: context.temperature ?? 0.7,
          ...(context.frequencyPenalty !== undefined
            ? { frequency_penalty: context.frequencyPenalty }
            : {}),
          reasoning_effort: context.reasoningEffort ?? 'minimal',
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      throw new MetaApiError(
        this.sanitize(
          isAbort
            ? `Meta Model API request timed out after ${this.timeoutMs}ms`
            : `Network error connecting to Meta Model API at ${this.config.baseURL}: ${
                err instanceof Error ? err.message : String(err)
              }`
        )
      );
    } finally {
      clearTimeout(timer);
    }

    let responseData: unknown;
    try {
      responseData = await response.json();
    } catch {
      throw new MetaApiError(
        `Meta Model API returned non-JSON response with HTTP status ${response.status}`,
        response.status
      );
    }

    if (!response.ok) {
      const data = responseData as { error?: { message?: string } | string } | null;
      const detail =
        typeof data?.error === 'object' && data.error !== null
          ? data.error.message ?? response.statusText
          : typeof data?.error === 'string'
            ? data.error
            : response.statusText;
      if (response.status === 401) {
        throw new MetaApiError(
          this.sanitize(`Meta Model API authentication failed (401 Unauthorized): ${detail}`),
          401,
          'UNAUTHORIZED'
        );
      }
      if (response.status === 429) {
        throw new MetaApiError(
          this.sanitize(`Meta Model API rate limit exceeded (429 Too Many Requests): ${detail}`),
          429,
          'RATE_LIMITED'
        );
      }
      throw new MetaApiError(
        this.sanitize(`Meta Model API error (${response.status}): ${detail}`),
        response.status
      );
    }

    const data = responseData as {
      choices?: { message?: { content?: unknown } }[];
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    } | null;
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new MetaApiError('Meta Model API response malformed: choices[0].message.content is missing');
    }

    return {
      text,
      model: data?.model || this.config.model,
      usage: data?.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      rawResponse: responseData,
    };
  }
}
