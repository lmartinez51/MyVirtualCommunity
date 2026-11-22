/**
 * Milestone 94: Camila cognition provider (Muse Spark 1.3).
 *
 * Implements NpcCognitionProvider for Camila only. It builds the fixed
 * Camila system prompt (camila-config.ts), sends perception + world summary
 * + notebook excerpt to the Meta Model port, and strictly validates the
 * returned JSON decision into an NpcActionProposal.
 *
 * Provider selection is env-driven (createCamilaCognitionProvider):
 * - MODEL_API_KEY (or META_API_KEY) set -> live MetaModelApiAdapter.
 * - No key -> MockMetaModelAdapter (deterministic, offline, no live calls).
 *
 * Invariants (same as the Elena live provider): secrets come from env and
 * are never logged; a provider failure or malformed decision NEVER mutates
 * WorldState — the runtime falls back to `observe` / reports provider_failed.
 */

import type {
  NpcCognitionContext,
  NpcCognitionProvider,
  NpcCognitionResult,
  NpcActionProposal,
} from '../npc-cognition-types.js';
import {
  CAMILA_AGENT_ID,
  buildCamilaPrompt,
  isCamilaActionEnabled,
  parseCamilaExplorerDecision,
} from '../camila-config.js';
import {
  loadMetaModelConfig,
  type MetaModelPort,
} from '../../../ports/meta-model-port.js';
import { MetaModelApiAdapter } from '../../../adapters/meta-model-api-adapter.js';
import { MockMetaModelAdapter } from '../../../adapters/mock-meta-model-adapter.js';
import { findProbeObjectById } from '../../camila-probe-objects.js';

export interface CamilaCognitionProviderOptions {
  /** Meta Model port; defaults to live-or-mock by env (see factory below). */
  metaModel?: MetaModelPort;
  /** World summary text sent in the user message; defaults to a perception-derived summary. */
  worldStateSummary?: string | (() => string);
  /** Notebook excerpt text sent in the user message; defaults to a short note. */
  notebookExcerpt?: string | (() => string);
  /** Override the explore-only gate (defaults to env CAMILA_ACTIONS_ENABLED). */
  actionsEnabled?: boolean;
}

export class CamilaCognitionProvider implements NpcCognitionProvider {
  public readonly id = 'camila-muse-spark-provider';
  private readonly metaModel: MetaModelPort;
  private readonly worldStateSummary: string | (() => string) | undefined;
  private readonly notebookExcerpt: string | (() => string) | undefined;
  private readonly actionsEnabled: boolean;

  constructor(options: CamilaCognitionProviderOptions = {}) {
    const config = loadMetaModelConfig();
    this.metaModel =
      options.metaModel ??
      (config.apiKey
        ? new MetaModelApiAdapter({ config })
        : new MockMetaModelAdapter());
    this.worldStateSummary = options.worldStateSummary;
    this.notebookExcerpt = options.notebookExcerpt;
    this.actionsEnabled = options.actionsEnabled ?? isCamilaActionEnabled();
  }

  public getMetaModel(): MetaModelPort {
    return this.metaModel;
  }

  public getActionsEnabled(): boolean {
    return this.actionsEnabled;
  }

  private resolveWorldSummary(context: NpcCognitionContext): string {
    if (typeof this.worldStateSummary === 'function') return this.worldStateSummary();
    if (typeof this.worldStateSummary === 'string') return this.worldStateSummary;
    const places = (context.perception.nearbyPlaces ?? [])
      .map((p) => `${p.id} (${p.name})`)
      .join(', ');
    const objects = (context.perception.nearbyObjects ?? [])
      .map((o) => `${o.id} (${o.name}, en ${o.placeId}, ${o.affordances.join('/')})`)
      .join(', ');
    return `Lugares: ${places || 'sin lista'}.\nObjetos sonda: ${objects || 'ninguno'}.`;
  }

  private resolveNotebookExcerpt(context: NpcCognitionContext): string {
    if (typeof this.notebookExcerpt === 'function') return this.notebookExcerpt();
    if (typeof this.notebookExcerpt === 'string') return this.notebookExcerpt;
    const recent = context.memories.slice(-5);
    if (recent.length === 0) return 'Libreta vacía todavía: es tu primera exploración.';
    return recent.map((m) => `- [${m.timestamp}] ${m.summary}`).join('\n');
  }

  public async decideAction(context: NpcCognitionContext): Promise<NpcCognitionResult> {
    const startTime = Date.now();
    const perception = context.perception;

    if (perception.agentId !== CAMILA_AGENT_ID) {
      throw new Error(
        `CamilaCognitionProvider only supports ${CAMILA_AGENT_ID}, got "${perception.agentId}"`
      );
    }

    const worldSummary = this.resolveWorldSummary(context);
    const notebook = this.resolveNotebookExcerpt(context);
    const perceptionJson = JSON.stringify(perception, null, 2);
    const { systemPrompt } = buildCamilaPrompt({
      worldStateSummary: worldSummary,
      notebookExcerpt: notebook,
      perceptionJson,
    });

    const response = await this.metaModel.generateExplorerDecision({
      systemPrompt,
      worldStateSummary: worldSummary,
      notebookExcerpt: notebook,
      perceptionJson,
      temperature: 0.7,
      reasoningEffort: 'minimal',
    });

    const { decision, error } = parseCamilaExplorerDecision(
      response.text,
      this.actionsEnabled
    );
    if (!decision) {
      throw new Error(`Camila returned an invalid explorer decision: ${error ?? 'unknown'}`);
    }

    // Validate references against perception (never trust the model blindly).
    if (decision.actionType === 'move_to_place') {
      const known = (perception.nearbyPlaces ?? []).some(
        (p) => p.id === decision.destinationPlaceId
      );
      if (!known) {
        throw new Error(
          `Camila chose unknown destination "${decision.destinationPlaceId}"`
        );
      }
      if (decision.destinationPlaceId === perception.locationId) {
        throw new Error(
          `Camila chose her current location "${decision.destinationPlaceId}" as destination`
        );
      }
    }
    if (decision.actionType === 'look_at') {
      if (!findProbeObjectById(decision.targetObjectId ?? '')) {
        throw new Error(`Camila chose unknown object "${decision.targetObjectId}"`);
      }
    }
    if (decision.actionType === 'push_object') {
      if (!findProbeObjectById(decision.targetObjectId ?? '')) {
        throw new Error(`Camila chose unknown object "${decision.targetObjectId}"`);
      }
      if (decision.pushTowardsPlaceId !== undefined) {
        const knownPlace = (perception.nearbyPlaces ?? []).some(
          (p) => p.id === decision.pushTowardsPlaceId
        );
        if (!knownPlace) {
          throw new Error(
            `Camila chose unknown push direction place "${decision.pushTowardsPlaceId}"`
          );
        }
      }
    }

    const proposal: NpcActionProposal = {
      actionType: decision.actionType,
      destinationPlaceId: decision.destinationPlaceId,
      targetObjectId: decision.targetObjectId,
      pushTowardsPlaceId: decision.pushTowardsPlaceId,
      hypothesis: decision.hypothesis,
      reasoningContext: decision.reasoningContext,
      requestedAt: perception.worldTime,
    };

    return {
      proposal,
      providerId: this.id,
      modelUsed: response.model,
      rawResponse: response.text,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Env-driven factory used by the server: live Muse Spark 1.3 when
 * MODEL_API_KEY is set, deterministic mock otherwise.
 */
export function createCamilaCognitionProvider(
  options: Omit<CamilaCognitionProviderOptions, 'metaModel'> = {}
): CamilaCognitionProvider {
  return new CamilaCognitionProvider(options);
}
