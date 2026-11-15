/**
 * Authoritative Restaurant Service Interaction Domain (Milestone 91).
 *
 * Implements the first authoritative interaction between a player and an NPC attendant:
 *
 *   PLAYER INTENT
 *         ↓
 *   REQUEST RESTAURANT SERVICE
 *         ↓
 *   WORLD AUTHORITY
 *         ↓
 *   VALIDATION (Co-presence, Shift schedule, Establishment association)
 *         ↓
 *   DETERMINISTIC NPC RESPONSE (Elena Morales accepts service)
 *         ↓
 *   STATE TRANSITION & DOMAIN EVENT (RestaurantServiceAccepted)
 *         ↓
 *   PERSISTENCE / DERIVATION (Ephemeral runtime interaction, Schema 19 preserved)
 *         ↓
 *   READ MODEL (ObservableAttendantSummary.interactionState)
 *         ↓
 *   3D CLIENT REPRESENTATION
 *
 * Core Guarantees:
 * 1. Authority: Only World Core validates preconditions and commits interaction facts.
 * 2. Identity Security: Player identity is bound to session; client cannot supply or override it.
 * 3. Spatial Truth: Physical presence inside the restaurant is mandatory (zero telepathic interaction).
 * 4. NPC Participation: Attendant is resolved from SiteAgentAssociation, not chosen by client.
 * 5. Deterministic NPC Response: Strictly deterministic; zero AI, LLMs, or probabilistic branching.
 * 6. Temporal Grounding: Interaction timestamp derives purely from authoritative World Clock.
 * 7. Atomicity: State transition and event are committed atomically; rollback on failure.
 * 8. Schema Preservation: Interaction state is transient/derived; Schema Version 19 is strictly preserved.
 */

import type { WorldState } from './world-state.js';
import type { Restaurant } from './entities/restaurant.js';
import type { Agent } from './entities/agent.js';
import { areAgentsCoLocated } from './co-presence.js';
import { getSiteAttendant } from './site-agent-association.js';
import { findNpcSchedule } from './development-npc-schedule.js';
import { deriveCivilTime } from './civil-time.js';
import {
  findInteriorSpaceByPlace,
  createGomezMorinSpatialTopology,
} from './real-world-street-topology.js';

export type AttendantInteractionState = 'idle' | 'service-requested' | 'service-accepted';

/**
 * Immutable domain event recording a successful restaurant service acceptance (Milestone 91).
 */
export interface RestaurantServiceAcceptedEvent {
  readonly eventType: 'RestaurantServiceAccepted';
  readonly eventId: string;
  readonly worldTime: string;
  readonly playerId: string;
  readonly restaurantId: string;
  readonly attendantId: string;
  readonly status: 'accepted';
}

/**
 * Transient active service interaction between a customer and an attendant (Milestone 91).
 */
export interface ActiveRestaurantServiceInteraction {
  readonly interactionId: string;
  readonly restaurantId: string;
  readonly attendantId: string;
  readonly customerId: string;
  readonly worldTime: string;
  readonly status: 'accepted';
}

/**
 * Exhaustive result codes for RequestRestaurantService.
 */
export type RequestRestaurantServiceResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'restaurant-not-found'
  | 'not-at-restaurant'
  | 'player-not-inside-restaurant'
  | 'no-attendant-assigned'
  | 'attendant-agent-missing'
  | 'attendant-not-present'
  | 'attendant-off-duty'
  | 'service-already-active'
  | 'client-override-forbidden';

/**
 * Authoritative outcome of a RequestRestaurantService command.
 */
export interface RequestRestaurantServiceResult {
  readonly success: boolean;
  readonly code: RequestRestaurantServiceResultCode;
  readonly message: string;
  readonly playerId: string;
  readonly restaurantId?: string;
  readonly attendantId?: string;
  readonly event?: RestaurantServiceAcceptedEvent;
}

/**
 * In-memory transient interaction registry for active restaurant services.
 * Ephemeral runtime representation: does not mutate persisted WorldState schema (Schema 19).
 */
class RestaurantServiceRegistry {
  private activeInteractions: Map<string, ActiveRestaurantServiceInteraction> = new Map();
  private eventHistory: RestaurantServiceAcceptedEvent[] = [];

  private getKey(customerId: string, restaurantId?: string): string {
    return restaurantId ? `${customerId}:${restaurantId}` : customerId;
  }

  public getActiveService(customerId: string, restaurantId?: string): ActiveRestaurantServiceInteraction | null {
    if (restaurantId) {
      return this.activeInteractions.get(this.getKey(customerId, restaurantId)) ?? null;
    }
    for (const [key, interaction] of this.activeInteractions.entries()) {
      if (key.startsWith(`${customerId}:`)) {
        return interaction;
      }
    }
    return null;
  }

  public commitServiceInteraction(event: RestaurantServiceAcceptedEvent): void {
    const key = this.getKey(event.playerId, event.restaurantId);
    const active: ActiveRestaurantServiceInteraction = {
      interactionId: event.eventId,
      restaurantId: event.restaurantId,
      attendantId: event.attendantId,
      customerId: event.playerId,
      worldTime: event.worldTime,
      status: 'accepted',
    };
    this.activeInteractions.set(key, active);
    this.eventHistory.push(event);
  }

  public clearActiveService(customerId: string, restaurantId?: string): void {
    if (restaurantId) {
      this.activeInteractions.delete(this.getKey(customerId, restaurantId));
    } else {
      for (const key of Array.from(this.activeInteractions.keys())) {
        if (key.startsWith(`${customerId}:`)) {
          this.activeInteractions.delete(key);
        }
      }
    }
  }

  public getEventHistory(): readonly RestaurantServiceAcceptedEvent[] {
    return this.eventHistory;
  }

  public resetForTesting(): void {
    this.activeInteractions.clear();
    this.eventHistory = [];
  }
}

const globalServiceRegistry = new RestaurantServiceRegistry();

/**
 * Queries the active service interaction for an agent at a given establishment.
 */
export function getActiveRestaurantService(
  customerId: string,
  restaurantId?: string
): ActiveRestaurantServiceInteraction | null {
  return globalServiceRegistry.getActiveService(customerId, restaurantId);
}

/**
 * Commits a validated service interaction event to the active runtime registry.
 */
export function commitRestaurantServiceInteraction(event: RestaurantServiceAcceptedEvent): void {
  globalServiceRegistry.commitServiceInteraction(event);
}

/**
 * Clears any active service interaction for an agent (e.g. on restaurant egress).
 */
export function clearActiveRestaurantService(customerId: string, restaurantId?: string): void {
  globalServiceRegistry.clearActiveService(customerId, restaurantId);
}

/**
 * Resets the runtime service registry (used for test isolation).
 */
export function resetRestaurantServiceState(): void {
  globalServiceRegistry.resetForTesting();
}

/**
 * Evaluates whether an attendant NPC is currently on duty according to their deterministic schedule.
 */
export function isAttendantOnDuty(state: WorldState, attendant: Agent): boolean {
  if (attendant.activityState !== 'active') {
    return false;
  }

  const schedule = findNpcSchedule(attendant.id);
  if (!schedule) {
    // If no specific schedule is defined, respect active activityState
    return true;
  }

  const civilTime = deriveCivilTime(state.worldTime, 'America/Ciudad_Juarez');
  const currentMinutes = civilTime.hour * 60 + civilTime.minute;
  const shiftStart = schedule.shiftStartHour * 60 + (schedule.shiftStartMinute ?? 0);
  const shiftEnd = schedule.shiftEndHour * 60 + (schedule.shiftEndMinute ?? 0);

  return currentMinutes >= shiftStart && currentMinutes < shiftEnd;
}

/**
 * Pure domain evaluation for RequestRestaurantService.
 * Validates all domain preconditions without committing state changes.
 */
export function evaluateRequestRestaurantService(
  state: WorldState,
  customerId: string,
  restaurantIdInput?: string,
  clientPayload?: Record<string, unknown>
): RequestRestaurantServiceResult {
  // Guard: Client must not attempt to provide unauthorized authoritative overrides
  if (clientPayload) {
    if (
      'attendantId' in clientPayload ||
      'npcId' in clientPayload ||
      'accepted' in clientPayload ||
      'status' in clientPayload ||
      'serviceStatus' in clientPayload
    ) {
      return {
        success: false,
        code: 'client-override-forbidden',
        message: 'Client cannot specify attendant identity or force acceptance status',
        playerId: customerId,
        restaurantId: restaurantIdInput,
      };
    }
  }

  // 1. Confirm customer exists
  const customer = state.agents.find((a) => a.id === customerId);
  if (!customer) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Customer agent "${customerId}" not found in world state`,
      playerId: customerId,
      restaurantId: restaurantIdInput,
    };
  }

  // 2. Confirm customer is a player
  if (customer.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${customerId}" is not a player (agentType: "${customer.agentType}")`,
      playerId: customerId,
      restaurantId: restaurantIdInput,
    };
  }

  // 3. Resolve target restaurant
  const targetRestaurantId = restaurantIdInput ?? customer.locationId;
  const restaurant = state.restaurants.find((r) => r.id === targetRestaurantId);
  if (!restaurant) {
    const code = restaurantIdInput ? 'restaurant-not-found' : 'not-at-restaurant';
    return {
      success: false,
      code,
      message: `Restaurant "${targetRestaurantId}" not found in world state`,
      playerId: customerId,
      restaurantId: targetRestaurantId,
    };
  }

  // 4. Spatial Precondition: Customer must be physically inside the restaurant
  if (customer.locationId !== restaurant.id) {
    return {
      success: false,
      code: 'player-not-inside-restaurant',
      message: `Player is at "${customer.locationId}", not inside restaurant "${restaurant.id}"`,
      playerId: customerId,
      restaurantId: restaurant.id,
    };
  }

  // If the restaurant is backed by an interior space partition, verify interior occupancy
  const topology = createGomezMorinSpatialTopology();
  const interior = findInteriorSpaceByPlace(topology, restaurant.id);
  if (interior && customer.interiorSpaceId !== interior.interiorId) {
    return {
      success: false,
      code: 'player-not-inside-restaurant',
      message: `Player is at interior "${customer.interiorSpaceId}", expected interior "${interior.interiorId}"`,
      playerId: customerId,
      restaurantId: restaurant.id,
    };
  }

  // 5. Establishment Authority: Resolve attendant from SiteAgentAssociation
  const attendantAssoc = getSiteAttendant(state, restaurant.id);
  if (!attendantAssoc) {
    return {
      success: false,
      code: 'no-attendant-assigned',
      message: `Restaurant "${restaurant.id}" does not have an assigned attendant`,
      playerId: customerId,
      restaurantId: restaurant.id,
    };
  }

  // 6. Attendant Referential Integrity: Attendant agent must exist
  const attendant = state.agents.find((a) => a.id === attendantAssoc.agentId);
  if (!attendant) {
    return {
      success: false,
      code: 'attendant-agent-missing',
      message: `Attendant agent "${attendantAssoc.agentId}" referenced by association was not found`,
      playerId: customerId,
      restaurantId: restaurant.id,
      attendantId: attendantAssoc.agentId,
    };
  }

  // 7. Spatial Precondition: Attendant must be physically co-located with the player
  if (!areAgentsCoLocated(state, customer.id, attendant.id)) {
    return {
      success: false,
      code: 'attendant-not-present',
      message: `Attendant "${attendant.name}" is not currently co-located inside "${restaurant.id}"`,
      playerId: customerId,
      restaurantId: restaurant.id,
      attendantId: attendant.id,
    };
  }

  // 8. Deterministic Schedule & Availability: Attendant must be on duty
  if (!isAttendantOnDuty(state, attendant)) {
    return {
      success: false,
      code: 'attendant-off-duty',
      message: `Attendant "${attendant.name}" is currently off duty at world time ${state.worldTime}`,
      playerId: customerId,
      restaurantId: restaurant.id,
      attendantId: attendant.id,
    };
  }

  // 9. Duplicate Request Guard: Check if an active service interaction already exists
  const existingActive = getActiveRestaurantService(customerId, restaurant.id);
  if (existingActive && existingActive.attendantId === attendant.id && existingActive.status === 'accepted') {
    return {
      success: false,
      code: 'service-already-active',
      message: `Service request is already active with attendant "${attendant.name}"`,
      playerId: customerId,
      restaurantId: restaurant.id,
      attendantId: attendant.id,
    };
  }

  // 10. Construct Deterministic Domain Event
  const eventId = `event:service:${restaurant.id}:${attendant.id}:${customer.id}:${state.worldTime}`;
  const event: RestaurantServiceAcceptedEvent = {
    eventType: 'RestaurantServiceAccepted',
    eventId,
    worldTime: state.worldTime,
    playerId: customer.id,
    restaurantId: restaurant.id,
    attendantId: attendant.id,
    status: 'accepted',
  };

  return {
    success: true,
    code: 'success',
    message: `${attendant.name} accepted service request at ${restaurant.name}`,
    playerId: customer.id,
    restaurantId: restaurant.id,
    attendantId: attendant.id,
    event,
  };
}

/**
 * Authoritative RequestRestaurantService command entrypoint.
 * Evaluates domain preconditions and commits the interaction event to the runtime registry.
 */
export function requestRestaurantService(
  state: WorldState,
  customerId: string,
  restaurantIdInput?: string,
  clientPayload?: Record<string, unknown>
): RequestRestaurantServiceResult {
  const result = evaluateRequestRestaurantService(state, customerId, restaurantIdInput, clientPayload);
  if (result.success && result.event) {
    commitRestaurantServiceInteraction(result.event);
  }
  return result;
}
