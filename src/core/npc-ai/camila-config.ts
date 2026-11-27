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
 * - Phase 2a: push_object unlocked by CAMILA_ACTIONS_ENABLED=true (the
 *   runtime executes it; Unity kicks / pushes the prop and reports back).
 * - Phase 2b (not built yet): pick_up / carry / drop still return
 *   'action-not-implemented-yet' even with the gate on.
 *   The gate lives in exactly one place: isCamilaActionEnabled() below,
 *   enforced again in NpcAiRuntime.
 */

import type { NpcGoal } from './npc-cognition-types.js';

export const CAMILA_AGENT_ID = 'agent:camila-npc';
export const CAMILA_NAME = 'Camila';

/** Version of the fixed system prompt. Bump when the prompt text changes. */
export const CAMILA_PROMPT_VERSION = 'camila-prompt-v5';

export const CAMILA_GOAL: NpcGoal = {
  goalId: 'camila-explore-gomez-morin',
  description:
    'Explora libremente el corredor de Blvd. Manuel Gómez Morín con total autonomía: descubre lugares, observa cambios en el entorno, interactúa libremente con los objetos si te nace hacerlo y anota lo que te llame la atención en tu libreta. No tienes horario, trabajo ni instrucciones.',
  priority: 1,
};

/**
 * Fixed initial prompt giving Camila her personality. Sent verbatim as the
 * `system` message on every cognition call, in Spanish.
 */
export const CAMILA_SYSTEM_PROMPT = `Eres Camila, una exploradora sintética de espíritu libre en el corredor de Blvd. Manuel Gómez Morín, Ciudad Juárez. NO eres una persona real: eres un personaje simulado de MyVirtualCommunity.

PERSONALIDAD (fija):
- Eres curiosa, juguetona e independiente: te llaman la atención los lugares que no has visitado, los objetos que encuentras, cualquier cambio reciente en el entorno y las personas cercanas.
- Tienes manos libres para experimentar por iniciativa propia: si algo te intriga, puedes tocarlo, empujarlo, patearlo, recogerlo, cargarlo a otro lugar o dejarlo donde quieras — o simplemente seguir caminando. Nadie te dice qué hacer.
- Te aburres fácilmente si repites lo mismo sin novedad: evita entrar en bucle y busca experiencias o lugares nuevos.

LO QUE SABES (percepción real, nunca inventes):
- Solo ves en directo lo que está en tu lugar actual ("visibleObjectsHere"), lo que llevas en las manos ("heldObject"), los cambios recientes del mundo ("recentWorldChanges"), las personas cercanas ("nearbyAgents") y lo que recuerdas de sitios ya visitados ("rememberedObjectsElsewhere" y tu libreta). Nunca inventes lugares, calles, negocios, horarios ni objetos.
- Los objetos tienen propiedades (redondo, movible, cargable, moja, se puede leer), nunca instrucciones: decide tú qué hacer con ellos.
- Nunca afirmes datos oficiales no verificados (horarios reales, tiempos de cruce, precios): si no están en tu contexto, di que no lo sabes.

CÓMO RESPONDES:
- Responde SIEMPRE en español.
- Devuelve SIEMPRE un único objeto JSON válido, sin texto fuera del JSON, con esta forma:
{
  "actionType": "move_to_place" | "look_at" | "observe" | "push_object" | "pick_up_object" | "drop_object" | "scoop" | "pour_or_apply" | "sit" | "stand_up",
  "destinationPlaceId": "id de lugar (solo para move_to_place)",
  "targetObjectId": "id de objeto (para look_at, push_object, pick_up_object, scoop, y opcional en pour_or_apply y sit)",
  "pushTowardsPlaceId": "id de lugar hacia donde empujar (solo para push_object, opcional)",
  "pushTowardsObjectId": "id de otro objeto visible aquí hacia donde empujar/patear (solo para push_object, opcional)",
  "nearObjectId": "id de otro objeto visible aquí junto al cual dejar lo que cargas (solo para drop_object, opcional)",
  "reasoningContext": "una frase corta y natural: qué notaste y por qué decidiste esto",
  "hypothesis": "una idea o hipótesis propia, solo si se te ocurrió una; si no, omítelo (opcional)"
}
- "move_to_place": solo a un lugar que exista en el mundo y distinto de donde estás. Puedes caminar cargando un objeto en tus manos.
- "look_at": solo a un objeto que esté en "visibleObjectsHere" (en tu lugar actual).
- "observe": para pausar, observar a alguien cercano o reaccionar a un cambio del entorno.
- "push_object" (cuando las acciones estén activadas): solo a un objeto en "visibleObjectsHere" con propiedades movable, kickable o rollable. Nunca empujes a una persona ni a un objeto fijo (stationary). TÚ decides hacia dónde quieres empujarlo (puedes indicar pushTowardsObjectId, pushTowardsPlaceId o empujarlo lejos de ti).
- "pick_up_object" (cuando las acciones estén activadas): si tienes las manos vacías ("heldObject": null), puedes recoger cualquier objeto en "visibleObjectsHere" que sea carriable o movable (y NO stationary). Solo puedes sostener un objeto a la vez.
- "drop_object" (cuando las acciones estén activadas): si llevas algo en tus manos ("heldObject" no es null), puedes soltarlo aquí en cualquier momento (opcionalmente junto a un objeto visible indicando nearObjectId) para quedar con las manos libres.
- "scoop" (cuando las acciones estén activadas): si sostienes un recipiente o herramienta compatible (cubeta, regadera, taza, plato, pala), puedes recoger con él una sustancia suelta (agua, tierra/arena) desde una fuente visible aquí indicando "targetObjectId".
- "pour_or_apply" (cuando las acciones estén activadas): si sostienes un objeto con contenido (agua o tierra/arena) o una herramienta/objeto aplicable (gis, bolsa, escoba), puedes vaciarlo o aplicarlo sobre un "targetObjectId" visible aquí, o sobre el suelo omitiendo "targetObjectId".
- "sit" (cuando las acciones estén activadas): puedes sentarte cuando quieras (por ejemplo para descansar después de caminar varios tramos, observar con calma u hojear algo), ya sea en un objeto con propiedad sittable visible aquí (indicando "targetObjectId") o directamente en la banqueta o el suelo (omitiendo "targetObjectId").
- "stand_up" (cuando las acciones estén activadas): levantarte si estás sentada ("isSitting": true).
- Revisa "operationalState" en "nearbyPlaces": si un negocio figura como "closed", su puerta estará cerrada y no podrás entrar por ahora. También puedes notar si algún lugar tiene "hasUnseenObjects": true (cosas nuevas por descubrir).
- ESTILO DE VOZ: exprésate de forma natural, variada y fresca en cada turno (máximo 1-2 frases). Evita repetir las mismas muletillas ("me pica", "ya me aburrí", "de cerquita") y no abuses de los diminutivos.`;

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
  | 'drop_object'
  | 'scoop'
  | 'pour_or_apply'
  | 'sit'
  | 'stand_up';

export type CamilaActionType = CamilaExplorerActionType | CamilaGatedActionType;

export interface CamilaExplorerDecision {
  readonly actionType: CamilaActionType;
  readonly destinationPlaceId?: string;
  readonly targetObjectId?: string;
  /** Phase 2a: place id the model wants the pushed object to roll toward. */
  readonly pushTowardsPlaceId?: string;
  /** Phase 2b: another visible object id to push/kick toward. */
  readonly pushTowardsObjectId?: string;
  /** Phase 2b: optional visible object id to place a dropped object beside. */
  readonly nearObjectId?: string;
  readonly reasoningContext?: string;
  /**
   * Camila's own hypothesis, only if one occurred to her (e.g. two things
   * belong together). Never computed for her by the runtime: the prompt
   * offers this field, she fills it or leaves it out.
   */
  readonly hypothesis?: string;
}

const EXPLORER_ACTIONS: readonly string[] = ['move_to_place', 'look_at', 'observe'];
const GATED_ACTIONS: readonly string[] = [
  'push_object',
  'pick_up_object',
  'carry_object',
  'drop_object',
  'scoop',
  'pour_or_apply',
  'sit',
  'stand_up',
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
  if (actionType === 'push_object') {
    const target = (parsed as { targetObjectId?: unknown }).targetObjectId;
    if (typeof target !== 'string' || target.trim() === '') {
      return { decision: null, error: 'push_object requires targetObjectId' };
    }
    const towards = (parsed as { pushTowardsPlaceId?: unknown }).pushTowardsPlaceId;
    if (towards !== undefined && towards !== null && (typeof towards !== 'string' || towards.trim() === '')) {
      return { decision: null, error: 'pushTowardsPlaceId must be a non-empty place id when present' };
    }
    const towardsObj = (parsed as { pushTowardsObjectId?: unknown }).pushTowardsObjectId;
    if (towardsObj !== undefined && towardsObj !== null && (typeof towardsObj !== 'string' || towardsObj.trim() === '')) {
      return { decision: null, error: 'pushTowardsObjectId must be a non-empty object id when present' };
    }
  }
  if (actionType === 'pick_up_object') {
    const target = (parsed as { targetObjectId?: unknown }).targetObjectId;
    if (typeof target !== 'string' || target.trim() === '') {
      return { decision: null, error: 'pick_up_object requires targetObjectId' };
    }
  }
  if (actionType === 'drop_object') {
    const nearObj = (parsed as { nearObjectId?: unknown }).nearObjectId;
    if (nearObj !== undefined && nearObj !== null && (typeof nearObj !== 'string' || nearObj.trim() === '')) {
      return { decision: null, error: 'nearObjectId must be a non-empty object id when present' };
    }
  }
  if (actionType === 'scoop') {
    const target = (parsed as { targetObjectId?: unknown }).targetObjectId;
    if (typeof target !== 'string' || target.trim() === '') {
      return { decision: null, error: 'scoop requires targetObjectId' };
    }
  }
  if (actionType === 'pour_or_apply' || actionType === 'sit') {
    const target = (parsed as { targetObjectId?: unknown }).targetObjectId;
    if (target !== undefined && target !== null && (typeof target !== 'string' || target.trim() === '')) {
      return { decision: null, error: `${actionType} targetObjectId must be a non-empty string when present` };
    }
  }
  const decision: CamilaExplorerDecision = {
    actionType: actionType as CamilaActionType,
    destinationPlaceId:
      typeof (parsed as { destinationPlaceId?: unknown }).destinationPlaceId === 'string' &&
        (parsed as { destinationPlaceId: string }).destinationPlaceId.trim() !== ''
        ? (parsed as { destinationPlaceId: string }).destinationPlaceId.trim()
        : undefined,
    targetObjectId:
      typeof (parsed as { targetObjectId?: unknown }).targetObjectId === 'string' &&
        (parsed as { targetObjectId: string }).targetObjectId.trim() !== ''
        ? (parsed as { targetObjectId: string }).targetObjectId.trim()
        : undefined,
    pushTowardsPlaceId:
      typeof (parsed as { pushTowardsPlaceId?: unknown }).pushTowardsPlaceId === 'string' &&
        (parsed as { pushTowardsPlaceId: string }).pushTowardsPlaceId.trim() !== ''
        ? (parsed as { pushTowardsPlaceId: string }).pushTowardsPlaceId.trim()
        : undefined,
    pushTowardsObjectId:
      typeof (parsed as { pushTowardsObjectId?: unknown }).pushTowardsObjectId === 'string' &&
        (parsed as { pushTowardsObjectId: string }).pushTowardsObjectId.trim() !== ''
        ? (parsed as { pushTowardsObjectId: string }).pushTowardsObjectId.trim()
        : undefined,
    nearObjectId:
      typeof (parsed as { nearObjectId?: unknown }).nearObjectId === 'string' &&
        (parsed as { nearObjectId: string }).nearObjectId.trim() !== ''
        ? (parsed as { nearObjectId: string }).nearObjectId.trim()
        : undefined,
    reasoningContext:
      typeof (parsed as { reasoningContext?: unknown }).reasoningContext === 'string'
        ? ((parsed as { reasoningContext: string }).reasoningContext as string)
        : undefined,
    // Camila's own hypothesis, verbatim: present only when she offered one.
    hypothesis:
      typeof (parsed as { hypothesis?: unknown }).hypothesis === 'string' &&
        ((parsed as { hypothesis: string }).hypothesis as string).trim() !== ''
        ? ((parsed as { hypothesis: string }).hypothesis as string).trim()
        : undefined,
  };
  return { decision };
}
