import { WorldClock } from './clock.js';
import {
  WorldState,
  CoffeeCompletionRecord,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  makeDevelopmentOfferingAvailable,
  retireDevelopmentOffering,
} from './world-state.js';
import { ActivityState } from './entities/agent.js';
import {
  RestaurantOperationalState,
  evaluateDevelopmentRestaurantOperationalRule,
} from './entities/restaurant.js';
import {
  calculateHavingCoffeeCompletionTime,
  isHavingCoffeeCompleted,
} from './activities/having-coffee.js';
import { DEVELOPMENT_NPC_WORK_SCHEDULE } from './development-npc-schedule.js';

export { evaluateDevelopmentRestaurantOperationalRule };

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
 * Exact boundary: [startHourUtc:00:00.000Z, endHourUtc:00:00.000Z)
 */
export function evaluateDevelopmentActivityRule(
  isoTime: string,
  interval: ActiveInterval = DEFAULT_DEVELOPMENT_ACTIVE_INTERVAL
): boolean {
  const date = new Date(isoTime);
  const timeOfDayMs =
    date.getUTCHours() * 3600_000 +
    date.getUTCMinutes() * 60_000 +
    date.getUTCSeconds() * 1000 +
    date.getUTCMilliseconds();

  const startMs = interval.startHourUtc * 3600_000;
  const endMs = interval.endHourUtc * 3600_000;

  return timeOfDayMs >= startMs && timeOfDayMs < endMs;
}

/**
 * Concrete multi-phase deterministic NPC location routine rule fixture (Milestone 22).
 *
 * Evaluates the deterministic target location for the development NPC across the neighborhood:
 * - [00:00, 08:30) UTC: 'building:development-residence' (Home / Rest)
 * - [08:30, 09:00) UTC: 'street:development-street' (Morning Commute)
 * - [09:00, 17:00) UTC: 'restaurant:development-restaurant' (Work Shift)
 * - [17:00, 20:30) UTC: 'street:avenida-juarez' (Evening Promenade)
 * - [20:30, 24:00) UTC: 'building:development-residence' (Home / Night)
 *
 * Exact millisecond boundaries:
 * - < 08:30:00.000                -> 'building:development-residence'
 * - 08:30:00.000 - 08:59:59.999   -> 'street:development-street'
 * - 09:00:00.000 - 16:59:59.999   -> 'restaurant:development-restaurant'
 * - 17:00:00.000 - 20:29:59.999   -> 'street:avenida-juarez'
 * - >= 20:30:00.000               -> 'building:development-residence'
 *
 * Invariant: Pure deterministic evaluation with zero state mutation.
 */
export function evaluateDevelopmentNpcLocationRule(isoTime: string): string {
  const date = new Date(isoTime);
  const timeOfDayMs =
    date.getUTCHours() * 3600_000 +
    date.getUTCMinutes() * 60_000 +
    date.getUTCSeconds() * 1000 +
    date.getUTCMilliseconds();

  const commuteStartMs = 8 * 3600_000 + 30 * 60_000;  // 08:30:00.000 UTC (30,600,000 ms)
  const workStartMs = DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHourUtc * 3600_000;
  const eveningStartMs = DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHourUtc * 3600_000;
  const homeReturnMs = 20 * 3600_000 + 30 * 60_000;   // 20:30:00.000 UTC (73,800,000 ms)

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

export interface TickResult {
  worldTime: string;
  transitions: TransitionResult[];
  restaurantTransitions: RestaurantTransitionResult[];
  playerActivityTransitions?: PlayerActivityTransitionResult[];
  npcLocationTransitions?: NpcLocationTransitionResult[];
  offeringTransitions?: OfferingTransitionResult[];
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

    for (const agent of this.state.agents) {
      // Player isolation: Simulation rules apply strictly to NPC agents
      if (agent.agentType !== 'npc') {
        continue;
      }

      const shouldBeActive = this.options.activityEvaluator
        ? this.options.activityEvaluator(worldTime)
        : evaluateDevelopmentActivityRule(
            worldTime,
            this.options.activeInterval ?? DEFAULT_DEVELOPMENT_ACTIVE_INTERVAL
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

      // Concrete M22 deterministic NPC spatial routine
      const targetLocationId = evaluateDevelopmentNpcLocationRule(worldTime);

      // Verify spatial integrity: target must resolve to an existing Place or Restaurant
      const isValidLocation =
        this.state.places.some((p) => p.id === targetLocationId) ||
        this.state.restaurants.some((r) => r.id === targetLocationId);

      const previousLocationId = agent.locationId;

      if (!isValidLocation) {
        // Spatial integrity guard: preserve existing location; never corrupt world state
        npcLocationTransitions.push({
          agentId: agent.id,
          previousLocationId,
          newLocationId: previousLocationId,
          changed: false,
        });
        if (!this.options.silent) {
          console.warn(
            `[SIMULATION] NPC location rule evaluated to non-existent location "${targetLocationId}". Preserving "${previousLocationId}".`
          );
        }
      } else {
        const isLocationChanged = previousLocationId !== targetLocationId;

        if (isLocationChanged) {
          agent.locationId = targetLocationId;
          npcLocationTransitions.push({
            agentId: agent.id,
            previousLocationId,
            newLocationId: targetLocationId,
            changed: true,
          });

          if (!this.options.silent) {
            console.log(`SIMULATION TICK`);
            console.log(`WORLD TIME: ${worldTime}`);
            console.log(`NPC ${agent.id}`);
            console.log(`LOCATION: ${previousLocationId} -> ${targetLocationId}`);
          }
        } else {
          npcLocationTransitions.push({
            agentId: agent.id,
            previousLocationId,
            newLocationId: previousLocationId,
            changed: false,
          });

          if (!this.options.silent) {
            console.log(`SIMULATION TICK`);
            console.log(`WORLD TIME: ${worldTime}`);
            console.log(`NPC ${agent.id}`);
            console.log(`LOCATION: ${previousLocationId} (unchanged)`);
          }
        }
      }
    }

    const restaurantTransitions: RestaurantTransitionResult[] = [];

    for (const restaurant of this.state.restaurants) {
      const targetState: RestaurantOperationalState = this.options.restaurantEvaluator
        ? this.options.restaurantEvaluator(worldTime)
        : evaluateDevelopmentRestaurantOperationalRule(worldTime);

      const previousState = restaurant.operationalState;
      const isChanged = previousState !== targetState;

      if (isChanged) {
        restaurant.operationalState = targetState;
        restaurant.operationalSince = worldTime;

        restaurantTransitions.push({
          restaurantId: restaurant.id,
          previousState,
          newState: targetState,
          changed: true,
          operationalSince: worldTime,
        });

        if (!this.options.silent) {
          console.log(`SIMULATION TICK`);
          console.log(`WORLD TIME: ${worldTime}`);
          console.log(`RESTAURANT ${restaurant.id}`);
          console.log(`OPERATIONAL: ${previousState} -> ${targetState}`);
        }
      } else {
        restaurantTransitions.push({
          restaurantId: restaurant.id,
          previousState,
          newState: previousState,
          changed: false,
          operationalSince: restaurant.operationalSince,
        });

        if (!this.options.silent) {
          console.log(`SIMULATION TICK`);
          console.log(`WORLD TIME: ${worldTime}`);
          console.log(`RESTAURANT ${restaurant.id}`);
          console.log(`OPERATIONAL: ${previousState} (unchanged)`);
        }
      }
    }

    // Milestone 19-A: Deterministic offering availability during active NPC shift
    // When the development NPC is active and located at the development restaurant,
    // and the restaurant is open, make the development pastry offering available if not already present.
    const devNpc = this.state.agents.find((a) => a.id === 'agent:dev-npc');
    const devRestaurant = this.state.restaurants.find(
      (r) => r.id === 'restaurant:development-restaurant'
    );
    if (
      devNpc &&
      devNpc.agentType === 'npc' &&
      devNpc.activityState === 'active' &&
      devNpc.locationId === 'restaurant:development-restaurant' &&
      devRestaurant &&
      devRestaurant.operationalState === 'open' &&
      !this.state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID)
    ) {
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
    }

    const playerActivityTransitions: PlayerActivityTransitionResult[] = [];

    for (const agent of this.state.agents) {
      if (agent.agentType !== 'player') {
        continue;
      }

      const activity = agent.playerActivity;
      if (activity?.activity === 'having-coffee' && activity.completedAt === null) {
        if (isHavingCoffeeCompleted(activity.startedAt, worldTime)) {
          const exactCompletionTime = calculateHavingCoffeeCompletionTime(activity.startedAt);
          activity.completedAt = exactCompletionTime;

          const completionRecord: CoffeeCompletionRecord = {
            id: `coffee-completion:${this.state.coffeeCompletions.length + 1}`,
            playerId: agent.id,
            restaurantId: activity.restaurantId,
            startedAt: activity.startedAt,
            completedAt: exactCompletionTime,
          };
          this.state.coffeeCompletions.push(completionRecord);

          playerActivityTransitions.push({
            agentId: agent.id,
            activity: 'having-coffee',
            startedAt: activity.startedAt,
            completedAt: exactCompletionTime,
            changed: true,
          });

          if (!this.options.silent) {
            console.log(
              `[activity] player=${agent.id} activity=having-coffee completed=${exactCompletionTime} record=${completionRecord.id}`
            );
          }
        }
      }
    }

    return {
      worldTime,
      transitions,
      restaurantTransitions,
      playerActivityTransitions,
      npcLocationTransitions,
      offeringTransitions,
    };
  }
}
