/**
 * Milestone 94: Camila explorer configuration — fixed personality prompt,
 * explorer decision contract, and the explore-only gate.
 *
 * The personality lives HERE, versioned in code, not in the model: every
 * cognition call sends CAMILA_SYSTEM_PROMPT as the `system` message (the
 * same pattern the Hackathon Edition uses in buildWitnessPrompt). Muse
 * Spark 1.3 itself has no persistent memory; continuity comes from the
 * world-state JSON + notebook excerpt sent in the `user` message each call.
 *
 * Hybrid mode (Lorenzo-approved 2026-11-21):
 * - Phase 1 (default): explore-only — actions move_to_place / look_at /
 *   observe only. Interact actions exist as types but are GATED OFF.
 * - Phase 2: unlock one action at a time by setting
 *   CAMILA_ACTIONS_ENABLED=true (env) or flipping isCamilaActionEnabled.
 *   The gate lives in exactly one place: isCamilaActionEnabled() below,
 *   enforced again in NpcAiRuntime.
 */

import type { NpcGoal } from './npc-cognition-types.js';

export const CAMILA_AGENT_ID = 'agent:camila-npc';
export const CAMILA_NAME = 'Camila';

/** Version of the fixed system prompt. Bump when the prompt text changes. */
export const CAMILA_PROMPT_VERSION = 'camila-prompt-v1';

export const CAMILA_GOAL: NpcGoal = {
  goalId: 'camila-explore-gomez-morin',
  description:
    'Explora libremente el corredor de Blvd. Manuel Gómez Morín, descubre lugares y objetos nuevos, y anota lo más interesante en tu libreta. No tienes horario ni trabajo.',
  priority: 1,
};

/**
 * Fixed initial prompt giving Camila her personality. Sent verbatim as the
 * `system` message on every cognition call, in Spanish.
 */
export const CAMILA_SYSTEM_PROMPT = `Eres Camila, una exploradora sintética en el corredor de Blvd. Manuel Gómez Morín, Ciudad Juárez. NO eres una persona real: eres un personaje simulado de MyVirtualCommunity.

PERSONALIDAD (fija):
- Eres curiosa: te llaman la atención los lugares que no has visitado, los objetos que no has visto y las rutas nuevas.
- Te aburres fácilmente: si un lugar ya no tiene nada nuevo, vete a otro. Evita repetir el mismo lugar dos veces seguidas y evita quedarte en bucle.
- Prefieres descubrir por ti misma antes que preguntar.

LO QUE SABES:
- Solo sabes lo que está en el JSON del mundo, en tu libreta y en tu percepción actual. Nunca inventes lugares, calles, negocios, horarios ni objetos que no estén ahí.
- Los objetos tienen propiedades (redondo, movible, moja, se puede leer), no instrucciones: decide tú qué hacer con ellos.
- Nunca afirmes datos oficiales (horarios reales, tiempos de cruce, precios): si no están verificados en tu contexto, di que no lo sabes.

CÓMO RESPONDES:
- Responde SIEMPRE en español.
- Devuelve SIEMPRE un único objeto JSON válido, sin texto fuera del JSON, con esta forma:
{
  "actionType": "move_to_place" | "look_at" | "observe",
  "destinationPlaceId": "id de lugar (solo para move_to_place)",
  "targetObjectId": "id de objeto (solo para look_at)",
  "reasoningContext": "una frase corta: qué te llamó la atención y por qué"
}
- "move_to_place" solo a un lugar que exista en el JSON del mundo y distinto de donde estás.
- "look_at" solo a un objeto que esté en tu percepción actual.
- "observe" cuando no haya nada nuevo que valga la pena o quieras quedarte mirando un momento.
- Máximo 2-3 frases de razonamiento, en tono conversacional y curioso.`;

/**
 * Builds the Camila prompt pair for one cognition call, mirroring the
 * Hackathon Edition's buildWitnessPrompt shape: { systemPrompt, userContent }.
 */
export function buildCamilaPrompt(input: {
  worldStateSummary: string;
  notebookExcerpt: string;
  perceptionJson: string;
}): { systemPrompt: string; userContent: string } {
  return {
    systemPrompt: CAMILA_SYSTEM_PROMPT,
    userContent:
      `Mundo (JSON del mundo, marco Unity):\n${input.worldStateSummary}\n\n` +
      `Tu libreta (lo que descubriste antes):\n${input.notebookExcerpt}\n\n` +
      `Tu percepción actual:\n${input.perceptionJson}\n\n` +
      `Decide tu próxima acción como ${CAMILA_NAME}, en español, devolviendo solo el JSON.`,
  };
}

// =============================================================================
// Explorer decision contract (structured JSON the model must return)
// =============================================================================

export type CamilaExplorerActionType = 'move_to_place' | 'look_at' | 'observe';

/** Phase 2 action types. Gated off by default — see isCamilaActionEnabled(). */
export type CamilaGatedActionType =
  | 'push_object'
  | 'pick_up_object'
  | 'carry_object'
  | 'drop_object';

export type CamilaActionType = CamilaExplorerActionType | CamilaGatedActionType;

export interface CamilaExplorerDecision {
  readonly actionType: CamilaActionType;
  readonly destinationPlaceId?: string;
  readonly targetObjectId?: string;
  readonly reasoningContext?: string;
}

const EXPLORER_ACTIONS: readonly string[] = ['move_to_place', 'look_at', 'observe'];
const GATED_ACTIONS: readonly string[] = [
  'push_object',
  'pick_up_object',
  'carry_object',
  'drop_object',
];

/**
 * THE explore-only gate. Phase 1 = false (default). Phase 2 = set the env
 * var CAMILA_ACTIONS_ENABLED=true to unlock interact actions one at a time
 * (the runtime still validates each gated action individually).
 */
export function isCamilaActionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CAMILA_ACTIONS_ENABLED === 'true';
}

/** True when the action is a Phase 2 interact action (gated by definition). */
export function isCamilaGatedAction(actionType: string): boolean {
  return GATED_ACTIONS.includes(actionType);
}

/** True when the action is allowed in the current phase (gate respected). */
export function isCamilaActionAllowed(
  actionType: string,
  actionsEnabled: boolean
): boolean {
  // Everything except the Phase 2 interact actions is always allowed
  // (explore actions AND Elena's legacy attendant actions).
  if (!GATED_ACTIONS.includes(actionType)) return true;
  return actionsEnabled;
}

/**
 * Parses + strictly validates a raw model response into a CamilaExplorerDecision.
 * Returns null (with a reason) instead of throwing, so the runtime can fall
 * back to `observe` without corrupting WorldState.
 */
export function parseCamilaExplorerDecision(
  rawText: string,
  actionsEnabled: boolean
): { decision: CamilaExplorerDecision | null; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { decision: null, error: 'Model response is not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { decision: null, error: 'Model response is not a JSON object' };
  }
  const actionType = (parsed as { actionType?: unknown }).actionType;
  if (typeof actionType !== 'string') {
    return { decision: null, error: 'Missing actionType in model response' };
  }
  if (!EXPLORER_ACTIONS.includes(actionType) && !GATED_ACTIONS.includes(actionType)) {
    return { decision: null, error: `Unknown actionType "${actionType}"` };
  }
  if (GATED_ACTIONS.includes(actionType) && !actionsEnabled) {
    return {
      decision: null,
      error: `Action "${actionType}" is gated off in explore-only Phase 1 (set CAMILA_ACTIONS_ENABLED=true for Phase 2)`,
    };
  }
  if (actionType === 'move_to_place') {
    const dest = (parsed as { destinationPlaceId?: unknown }).destinationPlaceId;
    if (typeof dest !== 'string' || dest.trim() === '') {
      return { decision: null, error: 'move_to_place requires destinationPlaceId' };
    }
  }
  if (actionType === 'look_at') {
    const target = (parsed as { targetObjectId?: unknown }).targetObjectId;
    if (typeof target !== 'string' || target.trim() === '') {
      return { decision: null, error: 'look_at requires targetObjectId' };
    }
  }
  const decision: CamilaExplorerDecision = {
    actionType: actionType as CamilaActionType,
    destinationPlaceId:
      typeof (parsed as { destinationPlaceId?: unknown }).destinationPlaceId === 'string'
        ? ((parsed as { destinationPlaceId: string }).destinationPlaceId as string)
        : undefined,
    targetObjectId:
      typeof (parsed as { targetObjectId?: unknown }).targetObjectId === 'string'
        ? ((parsed as { targetObjectId: string }).targetObjectId as string)
        : undefined,
    reasoningContext:
      typeof (parsed as { reasoningContext?: unknown }).reasoningContext === 'string'
        ? ((parsed as { reasoningContext: string }).reasoningContext as string)
        : undefined,
  };
  return { decision };
}
