/**
 * Milestone 76 — Agent Context Foundation
 *
 * Establishes the engine-independent, bounded cognitive horizon (AgentContext)
 * for an agent, closing the epistemic leak where decision providers previously
 * received the entire, omniscient WorldState.
 *
 * Architectural Invariants (M76):
 * 1. Epistemic Containment:
 *    - An agent decision provider receives ONLY bounded, situated context.
 *    - Context MUST NOT expose raw WorldState, foreign agent balances, foreign private activity,
 *      foreign knowledge, unobserved locations, internal orders, purchases, properties, or database tables.
 * 2. Pure Derivation:
 *    - deriveAgentContext(state, agentId) is a PURE derivation.
 *    - Zero WorldState mutation, zero disk writes, zero persistence.
 *    - Never mutates Agent, Knowledge, schedules, or WorldClock.
 * 3. Separation of Concerns:
 *    - WorldState = Objective ground truth.
 *    - AgentKnowledgeRecord = Legitimate historical retained knowledge.
 *    - AgentContext = Ephemeral situated working attention for the immediate decision moment.
 *    - AgentIntent = Proposed non-authoritative candidate action.
 * 4. Zero Coordination / Traversal State Leak:
 *    - AgentContext MUST NOT depend on RuntimeTraversalCoordinator or active traversal state.
 *    - Traversal state is owned by M73; duplicate intent suppression remains at dispatch/traversal.
 * 5. Minimal Schedule Objective:
 *    - Exposes only the minimal derived objective needed for deterministic decision-making.
 *    - Strictly NO persistent Goal entities, goal IDs, goal lifecycles, queues, priorities, or planners.
 * 6. Non-Authoritative:
 *    - AgentContext has zero authority over World Core and is never persisted.
 *    - CURRENT_WORLD_STATE_VERSION remains strictly 18.
 */

import type { WorldState, ObservableAgent, AgentKnowledgeRecord } from './world-state.js';
import type { AgentType } from './entities/agent.js';
import type { PlaceType } from './entities/geography.js';
import { findNpcSchedule } from './development-npc-schedule.js';
import { resolveLocationTimeZone, deriveCivilTime } from './civil-time.js';
import { areAgentsCoLocated } from './co-presence.js';

// =============================================================================
// 1. Context Types
// =============================================================================

export interface AgentContextIdentity {
  readonly id: string;
  readonly name: string;
  readonly agentType: AgentType;
}

export interface AgentContextLocation {
  readonly locationId: string;
  readonly name: string;
  readonly type: PlaceType | 'restaurant';
  readonly timeZone: string;
}

export interface AgentContextCivilTime {
  readonly isoTime: string;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly dayOfWeek: number;
  readonly timeZone: string;
}

export type ScheduledObjectiveType =
  | 'commute-to-work'
  | 'work-shift'
  | 'neighborhood-recreation'
  | 'rest-at-residence';

/**
 * Minimal derived schedule context for deterministic decision making.
 *
 * CRITICAL INVARIANT:
 * Not a persistent Goal entity. Contains zero goal IDs, priorities, lifecycles,
 * or planner states. Pure derived context.
 */
export interface AgentScheduledObjective {
  readonly type: ScheduledObjectiveType;
  readonly targetPlaceId: string;
  readonly reason: string;
}

/**
 * Immutable, bounded cognitive context presented to an AgentDecisionProvider (Milestone 76).
 *
 * Captures what is legitimately available to the agent's situated cognition at this instant.
 */
export interface AgentContext {
  readonly agentId: string;
  readonly identity: AgentContextIdentity;
  readonly currentLocation: AgentContextLocation;
  readonly civilTime: AgentContextCivilTime;
  readonly scheduledObjective: AgentScheduledObjective | null;
  readonly coLocatedAgents: readonly ObservableAgent[];
  readonly knownFacts: readonly AgentKnowledgeRecord[];
}

// =============================================================================
// 2. Pure Context Derivation
// =============================================================================

/**
 * Purely derives an immutable, bounded AgentContext from WorldState for a specific agent.
 *
 * Invariants:
 * - ZERO state mutation: WorldState, WorldClock, and all entities remain bit-identical.
 * - Epistemically bounded: No foreign balances, private activity, or distant agents are exposed.
 * - No M73 runtime dependency: Purely evaluates spatial/temporal/epistemic world state.
 *
 * Returns null if agentId is invalid, not found, or references an unresolvable location.
 */
export function deriveAgentContext(
  state: WorldState,
  agentId: string
): AgentContext | null {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    return null;
  }

  // 1. Locate the agent entity
  const agent = state.agents?.find((a) => a.id === agentId);
  if (!agent) {
    return null;
  }

  // 2. Resolve situated logical location
  const place = state.places?.find((p) => p.id === agent.locationId);
  const restaurant = !place ? state.restaurants?.find((r) => r.id === agent.locationId) : undefined;

  if (!place && !restaurant) {
    return null;
  }

  const timeZone = resolveLocationTimeZone(state, agent.locationId);

  const currentLocation: AgentContextLocation = Object.freeze({
    locationId: agent.locationId,
    name: place ? place.name : restaurant!.name,
    type: place ? place.type : ('restaurant' as const),
    timeZone,
  });

  // 3. Derive perceived civil time
  const civil = deriveCivilTime(state.worldTime, timeZone);
  const civilTime: AgentContextCivilTime = Object.freeze({
    isoTime: state.worldTime,
    year: civil.year,
    month: civil.month,
    day: civil.day,
    hour: civil.hour,
    minute: civil.minute,
    second: civil.second,
    millisecond: civil.millisecond,
    dayOfWeek: civil.dayOfWeek,
    timeZone,
  });

  // 4. Derive minimal scheduled objective (if deterministic schedule exists)
  let scheduledObjective: AgentScheduledObjective | null = null;
  const schedule = findNpcSchedule(agent.id);

  if (schedule) {
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

    let type: ScheduledObjectiveType;
    let targetPlaceId: string;
    let reason: string;

    if (timeOfDayMs >= commuteStartMs && timeOfDayMs < shiftStartMs) {
      type = 'commute-to-work';
      targetPlaceId = schedule.workplaceId;
      reason = 'commute-to-work';
    } else if (timeOfDayMs >= shiftStartMs && timeOfDayMs < shiftEndMs) {
      type = 'work-shift';
      targetPlaceId = schedule.workplaceId;
      reason = 'work-shift';
    } else if (timeOfDayMs >= recStartMs && timeOfDayMs < recEndMs) {
      type = 'neighborhood-recreation';
      targetPlaceId = schedule.recreationLocationId;
      reason = 'neighborhood-recreation';
    } else {
      type = 'rest-at-residence';
      targetPlaceId = schedule.residenceId;
      reason = 'rest-at-residence';
    }

    scheduledObjective = Object.freeze({
      type,
      targetPlaceId,
      reason,
    });
  }

  // 5. Co-located agents (strictly bounded ObservableAgent representation)
  // CRITICAL: Exposes ONLY id, name, and agentType. Strictly NO balances or private activity.
  const coLocatedAgents: readonly ObservableAgent[] = Object.freeze(
    (state.agents ?? [])
      .filter((a) => a.id !== agent.id && areAgentsCoLocated(state, agent.id, a.id))
      .map((a) =>
        Object.freeze({
          id: a.id,
          name: a.name,
          agentType: a.agentType,
        })
      )
  );

  // 6. Legitimate retained knowledge belonging strictly to this agent
  // CRITICAL: Filtered strictly by k.agentId === agent.id. Zero foreign knowledge exposure.
  const knownFacts: readonly AgentKnowledgeRecord[] = Object.freeze(
    (state.knowledge ?? [])
      .filter((k) => k.agentId === agent.id)
      .map((k) => Object.freeze({ ...k }))
  );

  // 7. Identity representation
  const identity: AgentContextIdentity = Object.freeze({
    id: agent.id,
    name: agent.name,
    agentType: agent.agentType,
  });

  return Object.freeze({
    agentId: agent.id,
    identity,
    currentLocation,
    civilTime,
    scheduledObjective,
    coLocatedAgents,
    knownFacts,
  });
}
