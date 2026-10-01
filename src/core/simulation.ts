import { WorldClock } from './clock.js';
import {
  WorldState,
  ActivityCompletionRecord,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  makeDevelopmentOfferingAvailable,
  retireDevelopmentOffering,
  transitionRestaurantOperationalState,
  executeRestaurantClosureEgress,
  type ClosureEgressTransitionResult,
  isAgentAcquainted,
  issueNpcScheduleDisclosure,
  type IssueNpcScheduleDisclosureResultCode,
  type MakeDevelopmentOfferingAvailableResultCode,
} from './world-state.js';
import { ActivityState } from './entities/agent.js';
import {
  RestaurantOperationalState,
  evaluateDevelopmentRestaurantOperationalRule,
} from './entities/restaurant.js';
import {
  DEVELOPMENT_NPC_WORK_SCHEDULE,
  isTimeWithinScheduleInterval,
  findNpcSchedule,
} from './development-npc-schedule.js';
import { deriveCivilTime, resolveLocationTimeZone } from './civil-time.js';
import { tickOrderPreparation, OrderPreparationTransition } from './order.js';
import { executeNpcRoutineAction } from './npc-behavior.js';

export {
  evaluateDevelopmentRestaurantOperationalRule,
  type OrderPreparationTransition,
  type ClosureEgressTransitionResult,
};

export interface ActiveInterval {
  startHourUtc: number;
  endHourUtc: number;
}

/**
 * Synthetic development activity window fixture: derived from DEVELOPMENT_NPC_WORK_SCHEDULE.
 *
 * NOTE: This rule is a deterministic synthetic development fixture created
 * exclusively to test and validate time-driven state transitions.
 * It does NOT represent a real NPC schedule, profession, work shift, or sleep cycle.
 */
export const DEFAULT_DEVELOPMENT_ACTIVE_INTERVAL: ActiveInterval = {
  startHourUtc: DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHourUtc,
  endHourUtc: DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHourUtc,
};

/**
 * Evaluates whether a given ISO-8601 World Time falls within the development active interval.
 *
 * Evaluates against the derived local CivilTime in the specified IANA timezone.
 *
 * Exact boundary: [startHour:00:00.000, endHour:00:00.000)
 */
export function evaluateDevelopmentActivityRule(
  isoTime: string,
  intervalOrTimeZone: ActiveInterval | string = DEFAULT_DEVELOPMENT_ACTIVE_INTERVAL,
  explicitTimeZone?: string
): boolean {
  let interval: ActiveInterval = DEFAULT_DEVELOPMENT_ACTIVE_INTERVAL;
  let timeZone: string | undefined;

  if (typeof intervalOrTimeZone === 'string') {
    timeZone = intervalOrTimeZone;
  } else {
    interval = intervalOrTimeZone;
    timeZone = explicitTimeZone;
  }

  if (!timeZone || typeof timeZone !== 'string') {
    throw new Error('timeZone is required to evaluate activity rule');
  }
  return isTimeWithinScheduleInterval(isoTime, interval.startHourUtc, interval.endHourUtc, timeZone);
}

/**
 * Concrete multi-phase deterministic NPC location routine rule fixture (Milestone 22).
 *
 * Evaluates the deterministic target location for the development NPC across the neighborhood:
 * - [00:00, 08:30) Local: 'building:development-residence' (Home / Rest)
 * - [08:30, 09:00) Local: 'street:development-street' (Morning Commute)
 * - [09:00, 17:00) Local: 'restaurant:development-restaurant' (Work Shift)
 * - [17:00, 20:30) Local: 'street:avenida-juarez' (Evening Promenade)
 * - [20:30, 24:00) Local: 'building:development-residence' (Home / Night)
 *
 * Evaluates against local CivilTime in the specified IANA timezone.
 *
 * Invariant: Pure deterministic evaluation with zero state mutation.
 */
export function evaluateDevelopmentNpcLocationRule(isoTime: string, timeZone: string): string {
  if (!timeZone || typeof timeZone !== 'string') {
    throw new Error('timeZone is required to evaluate NPC location rule');
  }
  const civil = deriveCivilTime(isoTime, timeZone);
  const timeOfDayMs =
    civil.hour * 3600_000 +
    civil.minute * 60_000 +
    civil.second * 1000 +
    civil.millisecond;

  const commuteStartMs = 8 * 3600_000 + 30 * 60_000;  // 08:30:00.000 (30,600,000 ms)
  const workStartMs = DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHour * 3600_000;
  const eveningStartMs = DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHour * 3600_000;
  const homeReturnMs = 20 * 3600_000 + 30 * 60_000;   // 20:30:00.000 (73,800,000 ms)

  if (timeOfDayMs < commuteStartMs) {
    return 'building:development-residence';
  }
  if (timeOfDayMs < workStartMs) {
    return 'street:development-street';
  }
  if (timeOfDayMs < eveningStartMs) {
    return DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId;
  }
  if (timeOfDayMs < homeReturnMs) {
    return 'street:avenida-juarez';
  }
  return 'building:development-residence';
}

export interface TransitionResult {
  agentId: string;
  previousState: ActivityState;
  newState: ActivityState;
  changed: boolean;
  activitySince: string;
}

export interface RestaurantTransitionResult {
  restaurantId: string;
  previousState: RestaurantOperationalState;
  newState: RestaurantOperationalState;
  changed: boolean;
  operationalSince: string;
}

export interface PlayerActivityTransitionResult {
  agentId: string;
  activity: string;
  startedAt: string;
  completedAt: string;
  changed: boolean;
}

export interface NpcLocationTransitionResult {
  agentId: string;
  previousLocationId: string;
  newLocationId: string;
  changed: boolean;
}

export interface OfferingTransitionResult {
  npcId: string;
  restaurantId: string;
  offeringId: string;
  action: 'made-available' | 'retired';
}

export type NpcDecisionType = 'npc-schedule-disclosure' | 'make-offering-available';

/**
 * Reports the outcome of a deterministic NPC decision evaluation during tick (Milestone 46 & 47).
 * Only emitted when an eligible NPC decision rule fires (no-action is suppressed).
 */
export interface NpcDecisionTransitionResult {
  npcId: string;
  playerId?: string;
  restaurantId?: string;
  decision: NpcDecisionType;
  success: boolean;
  code: IssueNpcScheduleDisclosureResultCode | MakeDevelopmentOfferingAvailableResultCode;
  knowledgeRecordId?: string;
  offeringId?: string;
}

export interface TickResult {
  worldTime: string;
  transitions: TransitionResult[];
  restaurantTransitions: RestaurantTransitionResult[];
  playerActivityTransitions?: PlayerActivityTransitionResult[];
  npcLocationTransitions?: NpcLocationTransitionResult[];
  offeringTransitions?: OfferingTransitionResult[];
  orderTransitions?: OrderPreparationTransition[];
  npcDecisionTransitions?: NpcDecisionTransitionResult[];
  closureEgressTransitions?: ClosureEgressTransitionResult[];
}

/**
 * Pure context evaluation: reads NPC and player world state to determine
 * whether the NPC-schedule-disclosure preconditions are satisfied.
 *
 * ZERO state mutation. Returns a typed decision value.
 * This function does NOT authorize or execute any action.
 */
export function evaluateNpcScheduleDisclosureContext(
  state: WorldState,
  npcId: string,
  playerId: string
): 'npc-schedule-disclosure' | 'no-action' {
  const npc = state.agents.find((a) => a.id === npcId);
  const player = state.agents.find((a) => a.id === playerId);
  if (!npc || !player) return 'no-action';
  if (npc.agentType !== 'npc' || player.agentType !== 'player') return 'no-action';
  if (npc.activityState !== 'active') return 'no-action';
  if (npc.locationId !== player.locationId) return 'no-action';
  if (!isAgentAcquainted(state, playerId, npcId)) return 'no-action';
  const hasRecord = state.knowledge.some(
    (k) => k.agentId === playerId && k.factType === 'agent-schedule' && k.subjectId === npcId
  );
  return hasRecord ? 'no-action' : 'npc-schedule-disclosure';
}

/**
 * Pure context evaluation: reads NPC and restaurant world state to determine
 * whether the commercial offering publication preconditions are satisfied (Milestone 47).
 *
 * ZERO state mutation. Returns a typed decision value.
 * This function does NOT authorize or execute any action.
 */
export function evaluateOfferingPublicationContext(
  state: WorldState,
  npcId: string,
  restaurantId: string
): 'make-offering-available' | 'no-action' {
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc || npc.agentType !== 'npc' || npc.activityState !== 'active') {
    return 'no-action';
  }
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant || (restaurant.operationalState !== 'open' && restaurant.operationalState !== 'closing-soon')) {
    return 'no-action';
  }
  if (npc.locationId !== restaurant.id) {
    return 'no-action';
  }
  const hasOffering = state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);
  if (hasOffering) {
    return 'no-action';
  }
  return 'make-offering-available';
}

export interface SimulationOptions {
  activeInterval?: ActiveInterval;
  activityEvaluator?: (isoTime: string) => boolean;
  restaurantEvaluator?: (isoTime: string) => RestaurantOperationalState;
  silent?: boolean;
}

/**
 * Discrete, explicit simulation tick coordinator.
 *
 * Evaluates world rules against the authoritative WorldClock and commits
 * valid state transitions to the authoritative WorldState.
 *
 * Invariant: Does NOT advance WorldClock, does NOT run background loops,
 * and does NOT modify Player agents.
 */
export class Simulation {
  private readonly clock: WorldClock;
  private readonly state: WorldState;
  private readonly options: SimulationOptions;

  constructor(clock: WorldClock, state: WorldState, options: SimulationOptions = {}) {
    this.clock = clock;
    this.state = state;
    this.options = options;
  }

  /**
   * Executes a single discrete simulation tick.
   *
   * Sequence:
   * 1. Reads authoritative WorldClock time.
   * 2. Evaluates deterministic development rule for NPC agents.
   * 3. Commits state transition if changed, updating activitySince.
   * 4. Preserves activitySince if unchanged.
   * 5. Emits minimal development observability.
   */
  public tick(): TickResult {
    const worldTime = this.clock.getTime();
    this.state.worldTime = worldTime;

    const transitions: TransitionResult[] = [];
    const npcLocationTransitions: NpcLocationTransitionResult[] = [];
    const offeringTransitions: OfferingTransitionResult[] = [];
    const npcDecisionTransitions: NpcDecisionTransitionResult[] = [];
    const closureEgressTransitions: ClosureEgressTransitionResult[] = [];

    for (const agent of this.state.agents) {
      // Player isolation: Simulation rules apply strictly to NPC agents
      if (agent.agentType !== 'npc') {
        continue;
      }

      const agentTimeZone = resolveLocationTimeZone(this.state, agent.locationId);
      const npcSchedule = findNpcSchedule(agent.id);

      const activeInterval: ActiveInterval = npcSchedule
        ? {
            startHourUtc: npcSchedule.shiftStartHour,
            endHourUtc: npcSchedule.shiftEndHour,
          }
        : (this.options.activeInterval ?? DEFAULT_DEVELOPMENT_ACTIVE_INTERVAL);

      const shouldBeActive = this.options.activityEvaluator
        ? this.options.activityEvaluator(worldTime)
        : evaluateDevelopmentActivityRule(
            worldTime,
            activeInterval,
            agentTimeZone
          );

      // Milestone 19-A: Deterministic offering retirement when NPC shift ends
      // If the NPC is active at the restaurant but the rule determines shift has ended,
      // retire the offering before transitioning the NPC to idle and moving them away.
      if (
        agent.id === 'agent:dev-npc' &&
        !shouldBeActive &&
        agent.activityState === 'active' &&
        agent.locationId === 'restaurant:development-restaurant'
      ) {
        if (this.state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID)) {
          const retireResult = retireDevelopmentOffering(
            this.state,
            agent.id,
            'restaurant:development-restaurant'
          );
          if (retireResult.success && retireResult.offeringId) {
            offeringTransitions.push({
              npcId: agent.id,
              restaurantId: 'restaurant:development-restaurant',
              offeringId: retireResult.offeringId,
              action: 'retired',
            });
            if (!this.options.silent) {
              console.log(`SIMULATION TICK`);
              console.log(`WORLD TIME: ${worldTime}`);
              console.log(`NPC ${agent.id}`);
              console.log(`OFFERING RETIRED: ${retireResult.offeringId}`);
            }
          }
        }
      }

      const targetState: ActivityState = shouldBeActive ? 'active' : 'idle';
      const previousState = agent.activityState;
      const isChanged = previousState !== targetState;

      if (isChanged) {
        agent.activityState = targetState;
        agent.activitySince = worldTime;

        transitions.push({
          agentId: agent.id,
          previousState,
          newState: targetState,
          changed: true,
          activitySince: worldTime,
        });

        if (!this.options.silent) {
          console.log(`SIMULATION TICK`);
          console.log(`WORLD TIME: ${worldTime}`);
          console.log(`NPC ${agent.id}`);
          console.log(`ACTIVITY: ${previousState} -> ${targetState}`);
        }
      } else {
        transitions.push({
          agentId: agent.id,
          previousState,
          newState: previousState,
          changed: false,
          activitySince: agent.activitySince,
        });

        if (!this.options.silent) {
          console.log(`SIMULATION TICK`);
          console.log(`WORLD TIME: ${worldTime}`);
          console.log(`NPC ${agent.id}`);
          console.log(`ACTIVITY: ${previousState} (unchanged)`);
        }
      }

      // Milestone 63 / 64: Deterministic NPC Routine Execution Integration
      // Executes routine actions for any NPC with a defined deterministic schedule:
      // Simulation.tick() -> Deterministic Schedule -> M61 Behavioral Interpretation -> M62 Routine Action -> executeNpcRoutineAction() -> transitionAgentLocation() -> World State
      if (npcSchedule !== null) {
        const execResult = executeNpcRoutineAction(this.state, agent.id);

        if (execResult.success) {
          npcLocationTransitions.push({
            agentId: agent.id,
            previousLocationId: execResult.previousLocationId,
            newLocationId: execResult.currentLocationId,
            changed: execResult.changed,
          });

          if (!this.options.silent) {
            console.log(`SIMULATION TICK`);
            console.log(`WORLD TIME: ${worldTime}`);
            console.log(`NPC ${agent.id}`);
            if (execResult.changed) {
              console.log(`LOCATION: ${execResult.previousLocationId} -> ${execResult.currentLocationId}`);
            } else {
              console.log(`LOCATION: ${execResult.previousLocationId} (unchanged)`);
            }
          }
        } else {
          // Spatial integrity guard: preserve existing location if routine execution fails
          npcLocationTransitions.push({
            agentId: agent.id,
            previousLocationId: agent.locationId,
            newLocationId: agent.locationId,
            changed: false,
          });

          if (!this.options.silent) {
            console.warn(
              `[SIMULATION] NPC routine action execution failed for "${agent.id}": ${execResult.message}. Preserving "${agent.locationId}".`
            );
          }
        }
      }
    }

    const restaurantTransitions: RestaurantTransitionResult[] = [];

    for (const restaurant of this.state.restaurants) {
      if (!this.options.restaurantEvaluator && restaurant.id !== 'restaurant:development-restaurant') {
        continue;
      }
      const restaurantTimeZone = resolveLocationTimeZone(this.state, restaurant.id);
      const targetState: RestaurantOperationalState = this.options.restaurantEvaluator
        ? this.options.restaurantEvaluator(worldTime)
        : evaluateDevelopmentRestaurantOperationalRule(worldTime, restaurantTimeZone);

      const transitionResult = transitionRestaurantOperationalState(
        this.state,
        restaurant.id,
        targetState,
        worldTime
      );

      const previousState = transitionResult.previousState ?? restaurant.operationalState;
      const newState = transitionResult.newState ?? restaurant.operationalState;

      restaurantTransitions.push({
        restaurantId: restaurant.id,
        previousState,
        newState,
        changed: transitionResult.changed,
        operationalSince: transitionResult.operationalSince ?? restaurant.operationalSince,
      });

      if (!this.options.silent) {
        console.log(`SIMULATION TICK`);
        console.log(`WORLD TIME: ${worldTime}`);
        console.log(`RESTAURANT ${restaurant.id}`);
        if (transitionResult.changed) {
          console.log(`OPERATIONAL: ${previousState} -> ${newState}`);
        } else {
          console.log(`OPERATIONAL: ${previousState} (unchanged)`);
        }
      }

      // Milestone 52: Explicit authorized closure-egress transition for lingering occupants
      if (restaurant.operationalState === 'closed') {
        const egressResults = executeRestaurantClosureEgress(this.state, restaurant.id);
        if (egressResults.length > 0) {
          closureEgressTransitions.push(...egressResults);
          if (!this.options.silent) {
            for (const eg of egressResults) {
              console.log(
                `[SIMULATION TICK] CLOSURE EGRESS: Agent ${eg.agentId} relocated from closed restaurant ${eg.restaurantId} to building ${eg.newLocationId}`
              );
            }
          }
        }
      }
    }

    // Milestone 47: Deterministic NPC Commercial Action (replaces Milestone 19-A ambient trigger)
    // Evaluate NPC offering publication context for dev-npc at development-restaurant
    const devNpc = this.state.agents.find((a) => a.id === 'agent:dev-npc');
    const devRestaurant = this.state.restaurants.find(
      (r) => r.id === 'restaurant:development-restaurant'
    );
    if (devNpc && devRestaurant) {
      const offeringDecision = evaluateOfferingPublicationContext(
        this.state,
        devNpc.id,
        devRestaurant.id
      );

      if (offeringDecision === 'make-offering-available') {
        const makeResult = makeDevelopmentOfferingAvailable(
          this.state,
          devNpc.id,
          devRestaurant.id
        );

        if (makeResult.success && makeResult.offeringId) {
          offeringTransitions.push({
            npcId: devNpc.id,
            restaurantId: devRestaurant.id,
            offeringId: makeResult.offeringId,
            action: 'made-available',
          });
          if (!this.options.silent) {
            console.log(`SIMULATION TICK`);
            console.log(`WORLD TIME: ${worldTime}`);
            console.log(`NPC ${devNpc.id}`);
            console.log(`OFFERING MADE AVAILABLE: ${makeResult.offeringId}`);
          }
        }

        npcDecisionTransitions.push({
          npcId: devNpc.id,
          restaurantId: devRestaurant.id,
          decision: 'make-offering-available',
          success: makeResult.success,
          code: makeResult.code,
          offeringId: makeResult.offeringId,
        });

        if (!this.options.silent && makeResult.success) {
          console.log(`SIMULATION TICK`);
          console.log(`WORLD TIME: ${worldTime}`);
          console.log(`NPC ${devNpc.id} DECISION: make-offering-available -> ${makeResult.code}`);
        }
      }
    }

    // Milestone 46: Bounded experimental deterministic NPC decision
    // Evaluate NPC schedule disclosure context for dev-npc and active player
    const targetPlayer = this.state.agents.find((a) => a.agentType === 'player');
    if (devNpc && targetPlayer) {
      const decision = evaluateNpcScheduleDisclosureContext(
        this.state,
        devNpc.id,
        targetPlayer.id
      );

      if (decision === 'npc-schedule-disclosure') {
        const disclosureResult = issueNpcScheduleDisclosure(
          this.state,
          devNpc.id,
          targetPlayer.id
        );

        npcDecisionTransitions.push({
          npcId: devNpc.id,
          playerId: targetPlayer.id,
          decision: 'npc-schedule-disclosure',
          success: disclosureResult.success,
          code: disclosureResult.code,
          knowledgeRecordId: disclosureResult.knowledgeRecord?.id,
        });

        if (!this.options.silent && disclosureResult.success) {
          console.log(`SIMULATION TICK`);
          console.log(`WORLD TIME: ${worldTime}`);
          console.log(`NPC ${devNpc.id} DECISION: npc-schedule-disclosure -> ${disclosureResult.code}`);
        }
      }
    }

    const playerActivityTransitions: PlayerActivityTransitionResult[] = [];

    for (const agent of this.state.agents) {
      if (agent.agentType !== 'player') {
        continue;
      }

      const activity = agent.playerActivity;
      if (activity && activity.completedAt === null) {
        const startedAtMs = Date.parse(activity.startedAt);
        const completionTimeMs = startedAtMs + activity.durationMs;
        const currentWorldTimeMs = Date.parse(worldTime);

        if (currentWorldTimeMs >= completionTimeMs) {
          const theoreticalCompletedAt = new Date(completionTimeMs).toISOString();
          activity.completedAt = theoreticalCompletedAt;

          const completionRecord: ActivityCompletionRecord = {
            id: `activity-completion:${this.state.activityCompletions.length + 1}`,
            playerId: agent.id,
            activity: activity.activity,
            offeringId: activity.offeringId,
            restaurantId: activity.restaurantId,
            itemId: activity.itemId,
            startedAt: activity.startedAt,
            completedAt: theoreticalCompletedAt,
            companionAgentId: activity.companionAgentId ?? null,
          };
          this.state.activityCompletions.push(completionRecord);

          playerActivityTransitions.push({
            agentId: agent.id,
            activity: activity.activity,
            startedAt: activity.startedAt,
            completedAt: theoreticalCompletedAt,
            changed: true,
          });

          if (!this.options.silent) {
            console.log(
              `[activity] player=${agent.id} activity=${activity.activity} completed=${theoreticalCompletedAt} record=${completionRecord.id}`
            );
          }
        }
      }
    }

    // Milestone 39: Progress in-flight order preparation
    const orderTransitions: OrderPreparationTransition[] = Array.isArray(this.state.orders)
      ? tickOrderPreparation(this.state as any, worldTime)
      : [];

    if (!this.options.silent && orderTransitions.length > 0) {
      for (const ot of orderTransitions) {
        console.log(
          `[order] ${ot.orderId} transitioned: ${ot.previousStatus} -> ${ot.newStatus} (readyAt: ${ot.readyAt})`
        );
      }
    }

    return {
      worldTime,
      transitions,
      restaurantTransitions,
      playerActivityTransitions,
      npcLocationTransitions,
      offeringTransitions,
      orderTransitions,
      npcDecisionTransitions:
        npcDecisionTransitions.length > 0 ? npcDecisionTransitions : undefined,
      closureEgressTransitions:
        closureEgressTransitions.length > 0 ? closureEgressTransitions : undefined,
    };
  }
}
