/**
 * NPC Behavioral State & Intent Foundation (Milestone 61)
 * and NPC Routine Action Execution Foundation (Milestone 62).
 *
 * Implements a pure, derived behavioral interpretation layer for the existing
 * deterministic NPC schedule in MyVirtualCommunity, along with minimal deterministic
 * routine action derivation and authoritative execution through Spatial Authority.
 *
 * Semantic Boundaries & Invariants:
 * - DERIVED INTERPRETATION != AUTHORITATIVE WORLD TRUTH:
 *   Behavioral state is deterministically derived from existing authoritative
 *   world facts (World Time, Schedule, Location, Site Associations).
 *   It is NEVER persisted, NEVER stored in Agent entities, and NEVER mutates WorldState.
 * - INTENT != AUTONOMOUS AGENCY:
 *   NpcIntentType represents the deterministic objective implied by the NPC's
 *   current authoritative routine phase. It does NOT represent an independently
 *   chosen goal, desire, or psychological intent.
 * - ROUTINE ACTION != AUTONOMOUS DECISION:
 *   NpcRoutineAction represents the deterministic executable consequence of that routine.
 *   The NPC does not decide or choose; it follows its authoritative schedule.
 * - SPATIAL AUTHORITY PRESERVATION:
 *   Movement is executed strictly through transitionAgentLocation (Spatial Authority).
 *   No direct mutation of agent.locationId from the action layer.
 *   No coordinate system, vectors, pathfinding, or navigation graphs.
 * - BUSINESS AUTHORITY UNBYPASSED:
 *   Working routine action does NOT bypass restaurant operational state or service rules.
 * - CONTEXT != DECISION:
 *   inspectNpcContext() provides a read-only projection boundary for a future
 *   cognitive consumer. It does not select plans, evaluate utilities, or execute actions.
 * - PURE EVALUATION & BOUNDED EXECUTION:
 *   Zero state mutation during derivation. WorldState Schema Version remains strictly 18.
 */

import type {
  WorldState,
  ObservableAgent,
} from './world-state.js';
import {
  getCoLocatedAgents,
  transitionAgentLocation,
} from './world-state.js';
import {
  findNpcSchedule,
  type DeterministicNpcSchedule,
} from './development-npc-schedule.js';
import {
  resolveLocationTimeZone,
  deriveCivilTime,
  resolvePlayerTemporalContext,
  type PlayerTemporalContext,
} from './civil-time.js';
import {
  getAgentSiteAssociations,
  type SiteAgentAssociation,
} from './site-agent-association.js';

export type NpcRoutinePhase =
  | 'resting'
  | 'commuting'
  | 'working'
  | 'promenading';

export type NpcIntentType =
  | 'rest_at_home'
  | 'commute_to_work'
  | 'perform_work_shift'
  | 'walk_neighborhood';

/**
 * Minimal derived behavioral state representation (Milestone 61).
 *
 * Intentionally limited to routine interpretation and implied deterministic intent.
 * Does NOT contain goal stacks, priorities, utilities, reasoning, or emotional state.
 */
export interface NpcBehavioralState {
  readonly npcId: string;
  readonly routinePhase: NpcRoutinePhase;
  readonly intent: NpcIntentType;
  readonly destinationId: string | null;
  readonly activity: string;
}

export type NpcRoutineActionType =
  | 'stay-at-home'
  | 'commute-to-work'
  | 'work-at-restaurant'
  | 'walk-neighborhood';

/**
 * Minimal derived routine action representation (Milestone 62).
 *
 * Represents the deterministic executable consequence of the NPC's current routine phase.
 * Does NOT represent an autonomous choice, plan, or psychological decision.
 * Never persisted in WorldState or Agent entities.
 */
export interface NpcRoutineAction {
  readonly npcId: string;
  readonly actionType: NpcRoutineActionType;
  readonly targetLocationId: string;
  readonly requiresMovement: boolean;
  readonly routinePhase: NpcRoutinePhase;
  readonly description: string;
}

export type DeriveNpcBehavioralStateResultCode =
  | 'success'
  | 'npc-not-found'
  | 'agent-not-npc'
  | 'no-schedule-defined';

export interface DeriveNpcBehavioralStateSuccess {
  readonly success: true;
  readonly code: 'success';
  readonly message: string;
  readonly behavioralState: NpcBehavioralState;
}

export interface DeriveNpcBehavioralStateFailure {
  readonly success: false;
  readonly code: Exclude<DeriveNpcBehavioralStateResultCode, 'success'>;
  readonly message: string;
}

export type DeriveNpcBehavioralStateResult =
  | DeriveNpcBehavioralStateSuccess
  | DeriveNpcBehavioralStateFailure;

export type InspectNpcContextResultCode =
  | 'success'
  | 'npc-not-found'
  | 'agent-not-npc'
  | 'no-schedule-defined';

export interface ObservedNpcIdentity {
  readonly id: string;
  readonly name: string;
  readonly agentType: 'npc';
  readonly activityState: 'idle' | 'active';
  readonly activitySince: string;
}

export interface ObservedNpcLocation {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

/**
 * Read-only projection representing an NPC's authoritative situational context (Milestone 61).
 * Serves as the future hand-off boundary between World Core and a non-authoritative cognitive layer.
 */
export interface InspectNpcContextResult {
  readonly success: boolean;
  readonly code: InspectNpcContextResultCode;
  readonly message: string;
  readonly npcId: string;
  readonly agent?: ObservedNpcIdentity;
  readonly location?: ObservedNpcLocation;
  readonly behavioralState?: NpcBehavioralState;
  readonly routineAction?: NpcRoutineAction;
  readonly coLocatedAgents?: ObservableAgent[];
  readonly siteAssociations?: readonly SiteAgentAssociation[];
  readonly temporalContext?: PlayerTemporalContext;
}

/**
 * Pure evaluator checking and deriving the behavioral state of an NPC in WorldState.
 *
 * Evaluates against local CivilTime in the location's authoritative IANA timezone.
 *
 * Invariant: Pure evaluation with ZERO state mutation and zero disk writes.
 */
export function evaluateNpcBehavioralState(
  state: WorldState,
  npcId: string
): DeriveNpcBehavioralStateResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }
  if (typeof npcId !== 'string' || npcId.trim() === '') {
    return {
      success: false,
      code: 'npc-not-found',
      message: 'Cannot evaluate behavioral state: npcId must be a non-empty string',
    };
  }

  const agent = state.agents?.find((a) => a.id === npcId);
  if (!agent) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Agent "${npcId}" not found in world state`,
    };
  }

  if (agent.agentType !== 'npc') {
    return {
      success: false,
      code: 'agent-not-npc',
      message: `Agent "${npcId}" is not an NPC (agentType: "${agent.agentType}")`,
    };
  }

  const schedule = findNpcSchedule(npcId);
  if (!schedule) {
    return {
      success: false,
      code: 'no-schedule-defined',
      message: `NPC "${npcId}" has no behavioral schedule defined in world fixtures`,
    };
  }

  const timeZone = resolveLocationTimeZone(state, agent.locationId);
  const civil = deriveCivilTime(state.worldTime, timeZone);
  const timeOfDayMs =
    civil.hour * 3600_000 +
    civil.minute * 60_000 +
    civil.second * 1000 +
    civil.millisecond;

  const toMs = (h: number, m: number = 0) => h * 3600_000 + m * 60_000;

  const shiftStartMs = toMs(schedule.shiftStartHour, schedule.shiftStartMinute ?? 0);
  const shiftEndMs = toMs(schedule.shiftEndHour, schedule.shiftEndMinute ?? 0);
  const commuteStartMs = shiftStartMs - schedule.commuteLeadMinutes * 60_000;
  const recStartMs = toMs(schedule.recreationStartHour, schedule.recreationStartMinute ?? 0);
  const recEndMs = toMs(schedule.recreationEndHour, schedule.recreationEndMinute ?? 0);

  let routinePhase: NpcRoutinePhase;
  let intent: NpcIntentType;
  let destinationId: string;
  let activity: string;

  if (timeOfDayMs >= commuteStartMs && timeOfDayMs < shiftStartMs) {
    routinePhase = 'commuting';
    intent = 'commute_to_work';
    destinationId = schedule.workplaceId;
    activity = schedule.activityLabels?.commuting ?? 'Commuting to work';
  } else if (timeOfDayMs >= shiftStartMs && timeOfDayMs < shiftEndMs) {
    routinePhase = 'working';
    intent = 'perform_work_shift';
    destinationId = schedule.workplaceId;
    activity = schedule.activityLabels?.working ?? 'Working at restaurant';
  } else if (timeOfDayMs >= recStartMs && timeOfDayMs < recEndMs) {
    routinePhase = 'promenading';
    intent = 'walk_neighborhood';
    destinationId = schedule.recreationLocationId;
    activity = schedule.activityLabels?.promenading ?? 'Walking along Avenida Juárez';
  } else {
    routinePhase = 'resting';
    intent = 'rest_at_home';
    destinationId = schedule.residenceId;
    activity = schedule.activityLabels?.resting ?? 'Resting at home';
  }

  return {
    success: true,
    code: 'success',
    message: `Derived behavioral state for NPC "${npcId}"`,
    behavioralState: Object.freeze({
      npcId,
      routinePhase,
      intent,
      destinationId,
      activity,
    }),
  };
}

/**
 * Pure helper deriving the NpcBehavioralState directly, or returning null if
 * the agent is invalid or has no schedule defined.
 */
export function deriveNpcBehavioralState(
  state: WorldState,
  npcId: string
): NpcBehavioralState | null {
  const result = evaluateNpcBehavioralState(state, npcId);
  return result.success ? result.behavioralState : null;
}

/**
 * Inspects authoritative situational context for an NPC (Milestone 61).
 *
 * Prepares a read-only projection containing identity, location, derived behavioral state,
 * co-located agents, site associations, and temporal context.
 *
 * Invariant: Pure projection with ZERO state mutation.
 */
export function inspectNpcContext(
  state: WorldState,
  npcId: string
): InspectNpcContextResult {
  const evalResult = evaluateNpcBehavioralState(state, npcId);
  if (!evalResult.success) {
    return Object.freeze({
      success: false,
      code: evalResult.code,
      message: evalResult.message,
      npcId,
    });
  }

  const agent = state.agents.find((a) => a.id === npcId)!;
  const place = state.places?.find((p) => p.id === agent.locationId);
  const restaurant = state.restaurants?.find((r) => r.id === agent.locationId);
  const locName = place?.name ?? restaurant?.name ?? agent.locationId;
  const locType = place?.type ?? (restaurant ? 'restaurant' : 'unknown');

  const coLocated = getCoLocatedAgents(state, npcId);
  const siteAssociations = getAgentSiteAssociations(state, npcId);
  const temporalContext = resolvePlayerTemporalContext(state, npcId);

  return Object.freeze({
    success: true,
    code: 'success',
    message: `Context projection inspected successfully for NPC "${npcId}"`,
    npcId,
    agent: Object.freeze({
      id: agent.id,
      name: agent.name,
      agentType: 'npc' as const,
      activityState: agent.activityState,
      activitySince: agent.activitySince,
    }),
    location: Object.freeze({
      id: agent.locationId,
      name: locName,
      type: locType,
    }),
    behavioralState: evalResult.behavioralState,
    routineAction: deriveNpcRoutineAction(state, npcId) ?? undefined,
    coLocatedAgents: coLocated,
    siteAssociations,
    temporalContext,
  });
}

export type EvaluateNpcRoutineActionResultCode =
  | 'success'
  | 'npc-not-found'
  | 'agent-not-npc'
  | 'no-schedule-defined';

export interface EvaluateNpcRoutineActionSuccess {
  readonly success: true;
  readonly code: 'success';
  readonly message: string;
  readonly routineAction: NpcRoutineAction;
}

export interface EvaluateNpcRoutineActionFailure {
  readonly success: false;
  readonly code: Exclude<EvaluateNpcRoutineActionResultCode, 'success'>;
  readonly message: string;
}

export type EvaluateNpcRoutineActionResult =
  | EvaluateNpcRoutineActionSuccess
  | EvaluateNpcRoutineActionFailure;

/**
 * Pure evaluator deriving the deterministic routine action for an NPC (Milestone 62).
 *
 * Maps the NPC's derived routine phase to a concrete topological destination
 * and action type according to world schedule fixtures.
 *
 * Invariant: Pure evaluation with ZERO state mutation.
 */
export function evaluateNpcRoutineAction(
  state: WorldState,
  npcId: string
): EvaluateNpcRoutineActionResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }

  const behavioralResult = evaluateNpcBehavioralState(state, npcId);
  if (!behavioralResult.success) {
    return {
      success: false,
      code: behavioralResult.code,
      message: behavioralResult.message,
    };
  }

  const agent = state.agents.find((a) => a.id === npcId)!;
  const { routinePhase } = behavioralResult.behavioralState;
  const schedule = findNpcSchedule(npcId);
  if (!schedule) {
    return {
      success: false,
      code: 'no-schedule-defined',
      message: `NPC "${npcId}" has no behavioral schedule defined in world fixtures`,
    };
  }

  let actionType: NpcRoutineActionType;
  let targetLocationId: string;
  let description: string;

  switch (routinePhase) {
    case 'resting':
      actionType = 'stay-at-home';
      targetLocationId = schedule.residenceId;
      description = schedule.actionDescriptions?.resting ?? 'Stay at residence';
      break;
    case 'commuting':
      actionType = 'commute-to-work';
      targetLocationId = schedule.commuteLocationId;
      description = schedule.actionDescriptions?.commuting ?? 'Commute to work via Development Street';
      break;
    case 'working':
      actionType = 'work-at-restaurant';
      targetLocationId = schedule.workplaceId;
      description = schedule.actionDescriptions?.working ?? 'Work shift at restaurant';
      break;
    case 'promenading':
      actionType = 'walk-neighborhood';
      targetLocationId = schedule.recreationLocationId;
      description = schedule.actionDescriptions?.promenading ?? 'Walk neighborhood along Avenida Juárez';
      break;
  }

  const requiresMovement = agent.locationId !== targetLocationId;

  return {
    success: true,
    code: 'success',
    message: `Derived routine action "${actionType}" for NPC "${npcId}"`,
    routineAction: Object.freeze({
      npcId,
      actionType,
      targetLocationId,
      requiresMovement,
      routinePhase,
      description,
    }),
  };
}

/**
 * Pure helper deriving the NpcRoutineAction directly, or returning null if
 * the agent is invalid or has no schedule defined (Milestone 62).
 */
export function deriveNpcRoutineAction(
  state: WorldState,
  npcId: string
): NpcRoutineAction | null {
  const result = evaluateNpcRoutineAction(state, npcId);
  return result.success ? result.routineAction : null;
}

export type ExecuteNpcRoutineActionResultCode =
  | 'success'
  | 'already-at-destination'
  | 'npc-not-found'
  | 'agent-not-npc'
  | 'no-schedule-defined'
  | 'transition-failed';

export interface ExecuteNpcRoutineActionSuccess {
  readonly success: true;
  readonly code: 'success' | 'already-at-destination';
  readonly message: string;
  readonly npcId: string;
  readonly action: NpcRoutineAction;
  readonly previousLocationId: string;
  readonly currentLocationId: string;
  readonly changed: boolean;
}

export interface ExecuteNpcRoutineActionFailure {
  readonly success: false;
  readonly code: Exclude<ExecuteNpcRoutineActionResultCode, 'success' | 'already-at-destination'>;
  readonly message: string;
  readonly npcId: string;
  readonly action?: NpcRoutineAction;
}

export type ExecuteNpcRoutineActionResult =
  | ExecuteNpcRoutineActionSuccess
  | ExecuteNpcRoutineActionFailure;

/**
 * Executes an NPC's derived routine action through Spatial Authority (Milestone 62).
 *
 * Enforces:
 * - Deterministic execution: derives action from current world facts unless provided.
 * - Spatial Authority preservation: invokes transitionAgentLocation(); never mutates agent.locationId directly.
 * - Idempotency: if already at the target destination, returns changed: false with code 'already-at-destination'.
 * - Atomic failure: invalid destinations throw through Spatial Authority with zero state mutation.
 */
export function executeNpcRoutineAction(
  state: WorldState,
  npcId: string,
  providedAction?: NpcRoutineAction
): ExecuteNpcRoutineActionResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }

  let action = providedAction;
  if (!action) {
    const evalResult = evaluateNpcRoutineAction(state, npcId);
    if (!evalResult.success) {
      return Object.freeze({
        success: false,
        code: evalResult.code,
        message: evalResult.message,
        npcId,
      });
    }
    action = evalResult.routineAction;
  } else if (action.npcId !== npcId) {
    return Object.freeze({
      success: false,
      code: 'transition-failed',
      message: `Provided action npcId "${action.npcId}" does not match requested npcId "${npcId}"`,
      npcId,
      action,
    });
  }

  const agent = state.agents?.find((a) => a.id === npcId);
  if (!agent) {
    return Object.freeze({
      success: false,
      code: 'npc-not-found',
      message: `Agent "${npcId}" not found in world state`,
      npcId,
      action,
    });
  }

  const previousLocationId = agent.locationId;

  if (previousLocationId === action.targetLocationId) {
    return Object.freeze({
      success: true,
      code: 'already-at-destination',
      message: `NPC "${npcId}" is already at destination "${action.targetLocationId}" for action "${action.actionType}"`,
      npcId,
      action,
      previousLocationId,
      currentLocationId: previousLocationId,
      changed: false,
    });
  }

  try {
    transitionAgentLocation(state, npcId, action.targetLocationId);
    return Object.freeze({
      success: true,
      code: 'success',
      message: `NPC "${npcId}" executed routine action "${action.actionType}" transitioning from "${previousLocationId}" to "${action.targetLocationId}"`,
      npcId,
      action,
      previousLocationId,
      currentLocationId: agent.locationId,
      changed: true,
    });
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return Object.freeze({
      success: false,
      code: 'transition-failed',
      message: `Failed to transition NPC location: ${errMessage}`,
      npcId,
      action,
    });
  }
}
