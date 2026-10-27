/**
 * NPC Behavioral State & Intent Foundation (Milestone 61),
 * NPC Routine Action Execution Foundation (Milestone 62),
 * Contextual NPC Behavior Foundation (Milestone 65),
 * and Contextual NPC Interaction Execution (Milestone 66).
 *
 * Implements a pure, derived behavioral interpretation layer for the existing
 * deterministic NPC schedule in MyVirtualCommunity, along with minimal deterministic
 * routine action derivation and authoritative execution through Spatial Authority,
 * as well as deterministic contextual intent derivation and authoritative contextual
 * social action execution through Social Authority.
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
 * - CONTEXTUAL INTENT != AUTONOMOUS REASONING:
 *   NpcContextualIntent represents a non-persistent derived intent arising from
 *   authoritative world facts (e.g., co-presence of a valid interaction partner).
 *   Routine remains the fallback whenever contextual conditions are not met.
 * - CONTEXTUAL ACTION != AUTONOMOUS PLANNING:
 *   NpcContextualAction represents the derived executable social action ('greet-agent')
 *   flowing from a contextual intent. The action is derived, non-persistent, and executed
 *   strictly through existing Social Authority.
 * - SPATIAL AUTHORITY PRESERVATION:
 *   Movement is executed strictly through transitionAgentLocation (Spatial Authority).
 *   No direct mutation of agent.locationId from the action layer.
 *   No coordinate system, vectors, pathfinding, or navigation graphs.
 * - BUSINESS AUTHORITY UNBYPASSED:
 *   Working routine action does NOT bypass restaurant operational state or service rules.
 *   Contextual interaction respects venue operational state.
 * - SOCIAL AUTHORITY PRESERVATION:
 *   Contextual social actions delegate strictly to executeNpcGreeting (Social Authority).
 *   No direct relationship mutation from the behavior or action layer.
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
  areAgentsCoLocated,
  getCoLocatedAgents,
  transitionAgentLocation,
  executeNpcGreeting,
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
import {
  createGomezMorinSpatialTopology,
  executeUnifiedEntranceIngress,
} from './real-world-street-topology.js';

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
  readonly contextualIntent?: NpcContextualIntent;
  readonly contextualAction?: NpcContextualAction;
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
    contextualIntent: deriveNpcContextualIntent(state, npcId) ?? undefined,
    contextualAction: deriveNpcContextualAction(state, npcId) ?? undefined,
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

  // Determine whether registered interior topology exists for the target destination
  const topology = createGomezMorinSpatialTopology();
  const matchingInteriors = topology.interiors.filter(
    (i) => i.associatedPlaceId === action.targetLocationId
  );

  let registeredInterior: import('./real-world-street-topology.js').InteriorSpace | null = null;
  if (matchingInteriors.length === 1) {
    registeredInterior = matchingInteriors[0];
  } else if (matchingInteriors.length > 1) {
    // Multi-room venue: ingress must target the interior partition equipped with an exterior entrance
    const interiorsWithEntrance = matchingInteriors.filter(
      (i) => Array.isArray(i.entranceIds) && i.entranceIds.length > 0
    );
    if (interiorsWithEntrance.length === 1) {
      registeredInterior = interiorsWithEntrance[0];
    } else if (interiorsWithEntrance.length > 1) {
      return Object.freeze({
        success: false,
        code: 'transition-failed',
        message: `Ambiguous destination: workplace "${action.targetLocationId}" has ${interiorsWithEntrance.length} interior spaces with exterior entrances`,
        npcId,
        action,
      });
    } else {
      return Object.freeze({
        success: false,
        code: 'transition-failed',
        message: `No entrance partition found for multi-room workplace "${action.targetLocationId}"`,
        npcId,
        action,
      });
    }
  }

  if (
    previousLocationId === action.targetLocationId &&
    (!registeredInterior ||
      matchingInteriors.some((i) => i.interiorId === agent.interiorSpaceId))
  ) {
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

  // If registered interior exists and this is workplace arrival:
  if (registeredInterior && action.actionType === 'work-at-restaurant') {
    const entrances = topology.entrances.filter((e) =>
      registeredInterior.entranceIds.includes(e.entranceId)
    );

    if (entrances.length === 0) {
      return Object.freeze({
        success: false,
        code: 'transition-failed',
        message: `No entrance found for interior space "${registeredInterior.interiorId}"`,
        npcId,
        action,
      });
    }

    if (entrances.length > 1) {
      return Object.freeze({
        success: false,
        code: 'transition-failed',
        message: `Ambiguous entrance: interior space "${registeredInterior.interiorId}" has ${entrances.length} entrances`,
        npcId,
        action,
      });
    }

    const entrance = entrances[0];

    // If NPC is not yet at the entrance threshold, transition to the facing street/building
    if (
      agent.locationId !== entrance.facingStreetPlaceId &&
      agent.locationId !== entrance.buildingId
    ) {
      try {
        transitionAgentLocation(state, npcId, entrance.facingStreetPlaceId);
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        return Object.freeze({
          success: false,
          code: 'transition-failed',
          message: `Failed to transition NPC to entrance facing street "${entrance.facingStreetPlaceId}": ${errMessage}`,
          npcId,
          action,
        });
      }
    }

    // Execute unified ingress through the threshold
    const ingressResult = executeUnifiedEntranceIngress(
      state,
      {
        agentId: npcId,
        entranceId: entrance.entranceId,
        authorizedContext: {
          type: 'staff-workplace',
          workplaceId: action.targetLocationId,
        },
      },
      topology
    );

    if (!ingressResult.success) {
      return Object.freeze({
        success: false,
        code: 'transition-failed',
        message: `NPC routine workplace ingress failed: ${ingressResult.message}`,
        npcId,
        action,
      });
    }

    return Object.freeze({
      success: true,
      code: 'success',
      message: `NPC "${npcId}" executed routine action "${action.actionType}" transitioning from "${previousLocationId}" to "${action.targetLocationId}" (interior: "${registeredInterior.interiorId}")`,
      npcId,
      action,
      previousLocationId,
      currentLocationId: agent.locationId,
      changed: true,
    });
  }

  // Outdoor / logical-place transition (no registered interior, or non-workplace)
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

// =========================================================================
// Milestone 65: Contextual NPC Behavior Foundation
// =========================================================================

export type NpcContextualIntentType =
  | 'continue-routine'
  | 'interact-with-nearby-agent';

/**
 * Minimal derived contextual intent representation (Milestone 65).
 *
 * Represents what the NPC considers doing because of an immediately relevant world condition
 * (such as the co-presence of a valid interaction partner).
 * Does NOT represent a persistent goal, plan, emotion, or cognitive state.
 * Never persisted in WorldState or Agent entities.
 */
export interface NpcContextualIntent {
  readonly npcId: string;
  readonly intentType: NpcContextualIntentType;
  readonly targetAgentId?: string;
  readonly reason: string;
}

export type EvaluateNpcContextualIntentResultCode =
  | 'success'
  | 'npc-not-found'
  | 'agent-not-npc'
  | 'no-schedule-defined';

export interface EvaluateNpcContextualIntentSuccess {
  readonly success: true;
  readonly code: 'success';
  readonly message: string;
  readonly contextualIntent: NpcContextualIntent;
}

export interface EvaluateNpcContextualIntentFailure {
  readonly success: false;
  readonly code: Exclude<EvaluateNpcContextualIntentResultCode, 'success'>;
  readonly message: string;
}

export type EvaluateNpcContextualIntentResult =
  | EvaluateNpcContextualIntentSuccess
  | EvaluateNpcContextualIntentFailure;

/**
 * Pure evaluator deriving an NPC's contextual intent from current authoritative world facts (Milestone 65).
 *
 * Implements the minimal bridge:
 * World Facts -> Contextual Interpretation -> Deterministic Intent
 *
 * Precedence / Priority:
 * Authoritative World Constraints -> Contextual Relevance -> Deterministic Intent -> Routine Fallback ('continue-routine').
 *
 * Invariants:
 * - Pure evaluation with ZERO state mutation.
 * - Does NOT execute the intent or trigger commands.
 * - Same WorldState produces identical contextual intent (deterministic).
 * - Fallback to 'continue-routine' when no valid co-located agent exists or domain conditions are not met.
 * - Respects domain boundaries (e.g., closed restaurant precludes interaction).
 */
export function evaluateNpcContextualIntent(
  state: WorldState,
  npcId: string
): EvaluateNpcContextualIntentResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }
  if (typeof npcId !== 'string' || npcId.trim() === '') {
    return {
      success: false,
      code: 'npc-not-found',
      message: 'Cannot evaluate contextual intent: npcId must be a non-empty string',
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

  // Spatial location validity check
  const isValidLocation = (locationId: string): boolean => {
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return false;
    }
    return (
      (state.places?.some((p) => p.id === locationId) ?? false) ||
      (state.restaurants?.some((r) => r.id === locationId) ?? false)
    );
  };

  if (!isValidLocation(agent.locationId)) {
    return {
      success: true,
      code: 'success',
      message: `Derived fallback contextual intent for NPC "${npcId}" (invalid spatial location)`,
      contextualIntent: Object.freeze({
        npcId,
        intentType: 'continue-routine',
        reason: `NPC "${npcId}" has invalid spatial location "${agent.locationId}"; continuing routine`,
      }),
    };
  }

  // Business authority domain constraint: if venue is a closed restaurant, interaction is unavailable
  const restaurant = state.restaurants?.find((r) => r.id === agent.locationId);
  if (restaurant && restaurant.operationalState === 'closed') {
    return {
      success: true,
      code: 'success',
      message: `Derived fallback contextual intent for NPC "${npcId}" (restaurant closed)`,
      contextualIntent: Object.freeze({
        npcId,
        intentType: 'continue-routine',
        reason: `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}"); continuing routine`,
      }),
    };
  }

  // Filter valid candidate agents for contextual interaction
  const candidateAgents = (state.agents ?? []).filter((other) => {
    if (other.id === npcId) return false;
    if (other.agentType !== 'player' && other.agentType !== 'npc') return false;
    if (typeof other.id !== 'string' || other.id.trim() === '') return false;
    if (typeof other.name !== 'string' || other.name.trim() === '') return false;
    if (!isValidLocation(other.locationId)) return false;
    return areAgentsCoLocated(state, npcId, other.id);
  });

  if (candidateAgents.length === 0) {
    return {
      success: true,
      code: 'success',
      message: `Derived fallback contextual intent for NPC "${npcId}" (no relevant co-located agents)`,
      contextualIntent: Object.freeze({
        npcId,
        intentType: 'continue-routine',
        reason: 'No valid co-located agent available for interaction; continuing routine',
      }),
    };
  }

  // Deterministic candidate selection: prioritize players, then break ties by ID
  candidateAgents.sort((a, b) => {
    const aPlayer = a.agentType === 'player' ? 0 : 1;
    const bPlayer = b.agentType === 'player' ? 0 : 1;
    if (aPlayer !== bPlayer) {
      return aPlayer - bPlayer;
    }
    return a.id.localeCompare(b.id);
  });

  const targetAgent = candidateAgents[0];

  return {
    success: true,
    code: 'success',
    message: `Derived contextual intent "interact-with-nearby-agent" for NPC "${npcId}" towards "${targetAgent.id}"`,
    contextualIntent: Object.freeze({
      npcId,
      intentType: 'interact-with-nearby-agent',
      targetAgentId: targetAgent.id,
      reason: `Relevant agent "${targetAgent.name}" (${targetAgent.id}) is co-located at "${agent.locationId}"`,
    }),
  };
}

/**
 * Pure helper deriving the NpcContextualIntent directly, or returning null if
 * the agent is invalid or has no schedule defined (Milestone 65).
 */
export function deriveNpcContextualIntent(
  state: WorldState,
  npcId: string
): NpcContextualIntent | null {
  const result = evaluateNpcContextualIntent(state, npcId);
  return result.success ? result.contextualIntent : null;
}

// =========================================================================
// Milestone 66: Contextual NPC Interaction Execution
// =========================================================================

export type NpcContextualActionType =
  | 'greet-agent';

/**
 * Minimal derived contextual action representation (Milestone 66).
 *
 * Represents the deterministic actionable social command flowing from an NPC's derived contextual intent.
 * Does NOT represent an autonomous plan, desire, or psychological decision.
 * Never persisted in WorldState or Agent entities.
 */
export interface NpcContextualAction {
  readonly npcId: string;
  readonly actionType: NpcContextualActionType;
  readonly targetAgentId: string;
  readonly reason: string;
}

export type EvaluateNpcContextualActionResultCode =
  | 'success'
  | 'no-contextual-intent'
  | 'npc-not-found'
  | 'agent-not-npc'
  | 'no-schedule-defined';

export interface EvaluateNpcContextualActionSuccess {
  readonly success: true;
  readonly code: 'success';
  readonly message: string;
  readonly contextualAction: NpcContextualAction;
}

export interface EvaluateNpcContextualActionFailure {
  readonly success: false;
  readonly code: Exclude<EvaluateNpcContextualActionResultCode, 'success'>;
  readonly message: string;
  readonly contextualAction?: undefined;
}

export type EvaluateNpcContextualActionResult =
  | EvaluateNpcContextualActionSuccess
  | EvaluateNpcContextualActionFailure;

/**
 * Pure evaluator deriving an NPC's contextual action from its derived contextual intent (Milestone 66).
 *
 * Maps:
 * - 'interact-with-nearby-agent' -> 'greet-agent' targeting targetAgentId
 * - 'continue-routine' -> 'no-contextual-intent' (failure code)
 *
 * Invariant: Pure evaluation with ZERO state mutation.
 */
export function evaluateNpcContextualAction(
  state: WorldState,
  npcId: string
): EvaluateNpcContextualActionResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }

  const intentResult = evaluateNpcContextualIntent(state, npcId);
  if (!intentResult.success) {
    return {
      success: false,
      code: intentResult.code,
      message: intentResult.message,
    };
  }

  const { intentType, targetAgentId, reason } = intentResult.contextualIntent;

  if (intentType === 'continue-routine' || !targetAgentId) {
    return {
      success: false,
      code: 'no-contextual-intent',
      message: `NPC "${npcId}" has no contextual action to execute (intent is "continue-routine")`,
    };
  }

  return {
    success: true,
    code: 'success',
    message: `Derived contextual action "greet-agent" for NPC "${npcId}" targeting "${targetAgentId}"`,
    contextualAction: Object.freeze({
      npcId,
      actionType: 'greet-agent' as const,
      targetAgentId,
      reason,
    }),
  };
}

/**
 * Pure helper deriving the NpcContextualAction directly, or returning null if
 * no contextual action exists or preconditions fail (Milestone 66).
 *
 * - Case A: continue-routine -> null
 * - Case B: interact-with-nearby-agent -> NpcContextualAction ('greet-agent')
 * - Case C: invalid actor/target/preconditions -> null
 */
export function deriveNpcContextualAction(
  state: WorldState,
  npcId: string
): NpcContextualAction | null {
  const result = evaluateNpcContextualAction(state, npcId);
  return result.success ? result.contextualAction : null;
}

export type ExecuteNpcContextualActionResultCode =
  | 'success'
  | 'npc-not-found'
  | 'agent-not-npc'
  | 'target-not-found'
  | 'self-interaction-not-allowed'
  | 'target-not-valid-agent'
  | 'actor-location-invalid'
  | 'target-location-invalid'
  | 'agents-not-co-located'
  | 'venue-not-operational'
  | 'unsupported-action-type';

export interface ExecuteNpcContextualActionSuccess {
  readonly success: true;
  readonly code: 'success';
  readonly message: string;
  readonly action: NpcContextualAction;
  readonly response?: string;
}

export interface ExecuteNpcContextualActionFailure {
  readonly success: false;
  readonly code: Exclude<ExecuteNpcContextualActionResultCode, 'success'>;
  readonly message: string;
  readonly action?: NpcContextualAction;
}

export type ExecuteNpcContextualActionResult =
  | ExecuteNpcContextualActionSuccess
  | ExecuteNpcContextualActionFailure;

/**
 * Executes an NPC's derived contextual action through authoritative Social Authority (Milestone 66).
 *
 * Flow:
 * NPC Contextual Action -> Social Authority -> Validation -> Dialogue Response
 *
 * Enforces:
 * - Revalidation: Authority revalidates all world facts at execution time (target presence, co-location, venue status).
 * - Social Authority as sole executor: delegates to executeNpcGreeting().
 * - Zero state mutation: greeting does NOT alter locations, balances, activityState, relationships, or worldTime.
 */
export function executeNpcContextualAction(
  state: WorldState,
  action: NpcContextualAction
): ExecuteNpcContextualActionResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }
  if (!action || typeof action !== 'object') {
    throw new Error('NpcContextualAction must be provided');
  }

  if (action.actionType !== 'greet-agent') {
    return Object.freeze({
      success: false,
      code: 'unsupported-action-type',
      message: `Unsupported contextual action type "${action.actionType}"`,
      action,
    });
  }

  // Pre-flight actor check: if actor agent exists and is not an NPC, reject with 'agent-not-npc'
  const actor = state.agents?.find((a) => a.id === action.npcId);
  if (actor && actor.agentType !== 'npc') {
    return Object.freeze({
      success: false,
      code: 'agent-not-npc',
      message: `Actor "${action.npcId}" is not an NPC (agentType: "${actor.agentType}")`,
      action,
    });
  }

  // Delegate directly to Social Authority in World State
  const greetingResult = executeNpcGreeting(state, action.npcId, action.targetAgentId);

  if (!greetingResult.success) {
    let failureCode: Exclude<ExecuteNpcContextualActionResultCode, 'success'>;
    switch (greetingResult.code) {
      case 'npc-not-found':
        failureCode = 'npc-not-found';
        break;
      case 'actor-not-npc':
        failureCode = 'agent-not-npc';
        break;
      case 'target-not-found':
        failureCode = 'target-not-found';
        break;
      case 'self-interaction-not-allowed':
        failureCode = 'self-interaction-not-allowed';
        break;
      case 'target-not-valid-agent':
        failureCode = 'target-not-valid-agent';
        break;
      case 'actor-location-invalid':
        failureCode = 'actor-location-invalid';
        break;
      case 'target-location-invalid':
        failureCode = 'target-location-invalid';
        break;
      case 'agents-not-co-located':
        failureCode = 'agents-not-co-located';
        break;
      case 'venue-not-operational':
        failureCode = 'venue-not-operational';
        break;
      default:
        failureCode = 'unsupported-action-type';
    }

    return Object.freeze({
      success: false,
      code: failureCode,
      message: greetingResult.message,
      action,
    });
  }

  return Object.freeze({
    success: true,
    code: 'success',
    message: greetingResult.message,
    action,
    response: greetingResult.response,
  });
}

