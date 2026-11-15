/**
 * Milestone 92: Bounded NPC Perception Projection
 *
 * Implements an explicit read-only perception projection for NPCs.
 *
 * Invariant: The perception object contains ONLY information the NPC
 * is legitimately allowed to perceive. It NEVER leaks raw WorldState,
 * private player balances, internal persistence paths, or unperceived entities.
 */

import type { WorldState } from '../world-state.js';
import { deriveCivilTime } from '../civil-time.js';
import { areAgentsCoLocated } from '../co-presence.js';
import { getAgentAttendedSite } from '../site-agent-association.js';
import { isAttendantOnDuty, getActiveRestaurantService } from '../restaurant-service.js';
import type { NpcMemoryStore } from './npc-memory.js';
import type {
  NpcPerception,
  PerceivedEstablishmentSummary,
  PerceivedPlayerSummary,
} from './npc-cognition-types.js';

export function deriveNpcPerception(
  state: WorldState,
  agentId: string,
  memoryStore?: NpcMemoryStore
): NpcPerception {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error(`Cannot derive perception: Agent "${agentId}" not found in world state`);
  }

  const worldTime = state.worldTime;
  const civilTime = deriveCivilTime(worldTime, 'America/Ciudad_Juarez');

  // Resolve assigned establishment
  const attendedAssoc = getAgentAttendedSite(state, agent.id);
  const attendedSiteId = attendedAssoc?.placeId;
  let establishmentSummary: PerceivedEstablishmentSummary | null = null;

  if (attendedSiteId) {
    const restaurant = state.restaurants.find((r) => r.id === attendedSiteId);
    if (restaurant) {
      establishmentSummary = {
        id: restaurant.id,
        name: restaurant.name,
        operationalState: restaurant.operationalState,
        isAttendantAssigned: true,
      };
    }
  }

  // Evaluate shift duty status
  const isOnDuty = isAttendantOnDuty(state, agent);

  // Perceive active player in the environment
  const player = state.agents.find((a) => a.agentType === 'player');
  let perceivedPlayer: PerceivedPlayerSummary | null = null;
  let activeServiceSummary: { playerId: string; establishmentId: string; worldTime: string } | null = null;

  if (player) {
    const isCoLocated = areAgentsCoLocated(state, agent.id, player.id);
    const activeService = attendedSiteId
      ? getActiveRestaurantService(player.id, attendedSiteId)
      : null;

    const hasActiveService = Boolean(
      activeService && activeService.attendantId === agent.id
    );

    if (hasActiveService && activeService) {
      activeServiceSummary = {
        playerId: activeService.customerId,
        establishmentId: activeService.restaurantId,
        worldTime: activeService.worldTime,
      };
    }

    // Player is perceived if co-located or present in the same establishment
    const isNearby =
      isCoLocated || (attendedSiteId !== undefined && player.locationId === attendedSiteId);

    if (isNearby) {
      perceivedPlayer = {
        id: player.id,
        name: player.name,
        locationId: player.locationId,
        interiorSpaceId: player.interiorSpaceId ?? null,
        isCoLocated,
        hasActiveService,
      };
    }
  }

  const recentMemories = memoryStore ? memoryStore.getMemories() : [];

  return {
    agentId: agent.id,
    agentName: agent.name,
    role: attendedSiteId ? 'attendant' : 'resident',
    locationId: agent.locationId,
    interiorSpaceId: agent.interiorSpaceId ?? null,
    activityState: agent.activityState,
    worldTime,
    civilTime: {
      hour: civilTime.hour,
      minute: civilTime.minute,
      isoCivilString: civilTime.isoCivilString,
      timeZone: civilTime.timeZone,
    },
    isOnDutyShift: isOnDuty,
    establishment: establishmentSummary,
    perceivedPlayer,
    activeService: activeServiceSummary,
    recentMemories,
  };
}
