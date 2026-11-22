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
import {
  findBusinessSchedule,
  evaluateBusinessScheduleStatus,
} from '../business-schedule.js';
import { CAMILA_AGENT_ID } from './camila-config.js';
import { CAMILA_PROBE_OBJECTS, type UnityPosition } from '../camila-probe-objects.js';
import type { CamilaProbeObjectState } from '../camila-probe-object-state.js';
import type { CamilaNotebook } from '../../persistence/camila-notebook.js';
import type { NpcMemoryStore } from './npc-memory.js';
import type {
  NpcPerception,
  PerceivedEstablishmentSummary,
  PerceivedPlayerSummary,
  PerceivedPlaceSummary,
  PerceivedProbeObjectSummary,
  PerceivedNearbyAgentSummary,
} from './npc-cognition-types.js';

export interface CamilaLiveSensorySnapshot {
  readonly objectState?: CamilaProbeObjectState;
  readonly notebook?: CamilaNotebook;
  readonly playerPosition?: UnityPosition;
  readonly playerHeldObjectId?: string | null;
  readonly camilaPosition?: UnityPosition;
  readonly heldCycles?: number;
  readonly heldOriginPlaceId?: string;
}

export function deriveNpcPerception(
  state: WorldState,
  agentId: string,
  memoryStore?: NpcMemoryStore,
  liveSensory?: CamilaLiveSensorySnapshot
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

  // Milestone 94 (Camila): living-world local perception + real memory.
  // - visibleObjectsHere: ONLY objects physically at Camila's current place right now
  //   (using live mutable positions from CamilaProbeObjectState, with objective pairwise distances).
  // - rememberedObjectsElsewhere: ONLY objects in OTHER places she has already visited
  //   (no X-ray spoilers of unvisited places).
  // - heldObject: what she is currently carrying in her hands (Phase 2b).
  // - recentWorldChanges: neutral world deltas (player moved an object, action feedback).
  // - nearbyAgents: real-time awareness of Player (when close or co-located) & Elena.
  const isCamila = agent.id === CAMILA_AGENT_ID;
  let nearbyPlaces: PerceivedPlaceSummary[] | undefined;
  let nearbyObjects: PerceivedProbeObjectSummary[] | undefined;
  let visibleObjectsHere: PerceivedProbeObjectSummary[] | undefined;
  let rememberedObjectsElsewhere: PerceivedProbeObjectSummary[] | undefined;
  let heldObject: PerceivedProbeObjectSummary | null | undefined;
  let recentWorldChanges: string[] | undefined;
  let nearbyAgents: PerceivedNearbyAgentSummary[] | undefined;
  let isSitting: boolean | undefined;
  let sittingOn: string | null | undefined;
  let visitedPlaceIds: string[] | undefined;
  let unvisitedPlaceIds: string[] | undefined;
  if (isCamila) {
    const objState = liveSensory?.objectState;
    const notebookData = liveSensory?.notebook?.getData();
    const heldId = objState?.getHeldObjectId(agent.id) ?? null;
    const sittingState = objState?.getSittingState(agent.id) ?? null;
    isSitting = sittingState !== null;
    sittingOn = sittingState ? (sittingState.targetObjectId ?? sittingState.surface) : null;

    const visited = new Set<string>();
    const seenObjectIds = new Set<string>();
    visited.add(agent.locationId);
    for (const m of recentMemories) {
      if (m.type === 'place_visited' && m.placeId) visited.add(m.placeId);
    }
    if (notebookData) {
      for (const entry of notebookData.mentalMap) {
        if (entry.visits > 0) visited.add(entry.placeId);
        for (const oid of entry.objectIdsSeen) seenObjectIds.add(oid);
      }
    }

    const enrichedAll = CAMILA_PROBE_OBJECTS.map((o) => {
      const livePos = objState?.getPosition(o.id) ?? o.unityPosition;
      const effectivePlaceId = objState?.getEffectivePlaceId(o.id) ?? o.placeId;
      const physicalState = objState?.getPhysicalState(o.id);
      return {
        id: o.id,
        name: o.name,
        placeId: effectivePlaceId,
        cluster: o.cluster,
        affordances: o.affordances,
        currentPosition: {
          x: Number(livePos.x.toFixed(2)),
          y: Number(livePos.y.toFixed(2)),
          z: Number(livePos.z.toFixed(2)),
        },
        ...(physicalState ? { physicalState } : {}),
      };
    });

    const BUILDING_SCHEDULE_IDS: Readonly<Record<string, string>> = {
      'building:wing-spot-building': 'restaurant:wing-spot',
      'restaurant:wing-spot': 'restaurant:wing-spot',
      'building:tia-lupe-building': 'restaurant:pasteleria-tia-lupe',
    };
    const closedBuildingIds = new Set<string>();
    nearbyPlaces = state.places.map((p) => {
      const hostedRestaurant = state.restaurants.find((r) => r.buildingId === p.id);
      const scheduleId = hostedRestaurant?.id ?? BUILDING_SCHEDULE_IDS[p.id];
      const schedule = scheduleId ? findBusinessSchedule(scheduleId) : null;
      const operationalState = schedule
        ? evaluateBusinessScheduleStatus(schedule, worldTime)
        : hostedRestaurant?.operationalState;
      if (operationalState === 'closed') {
        closedBuildingIds.add(p.id);
      }
      const unseenCount = enrichedAll.filter(
        (o) => o.placeId === p.id && o.id !== heldId && !seenObjectIds.has(o.id)
      ).length;
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        ...(operationalState ? { operationalState } : {}),
        ...(unseenCount > 0 ? { hasUnseenObjects: true, unseenObjectCount: unseenCount } : {}),
      };
    });

    visitedPlaceIds = [...visited];
    // Filter out currently closed businesses from unvisitedPlaceIds so Camila
    // doesn't walk 100m toward a locked door (they remain visible in nearbyPlaces).
    unvisitedPlaceIds = state.places
      .filter((p) => p.type !== 'city' && p.type !== 'district' && p.type !== 'neighborhood')
      .map((p) => p.id)
      .filter((id) => !visited.has(id) && !closedBuildingIds.has(id));

    // Legacy compatibility list with updated live places
    nearbyObjects = enrichedAll;

    // Objects physically here right now (excluding the one currently held in Camila's hands)
    const hereRaw = enrichedAll.filter(
      (o) => o.placeId === agent.locationId && o.id !== heldId
    );
    visibleObjectsHere = hereRaw.map((o) => {
      const peers: string[] = [];
      for (const other of hereRaw) {
        if (other.id === o.id) continue;
        const d = Math.hypot(
          other.currentPosition.x - o.currentPosition.x,
          other.currentPosition.z - o.currentPosition.z
        );
        if (d <= 14) {
          peers.push(`${other.id} (${d.toFixed(1)}m)`);
        }
      }
      return peers.length > 0 ? { ...o, nearbyPeers: peers } : o;
    });

    // Remembered objects elsewhere: only places Camila has actually visited before
    rememberedObjectsElsewhere = enrichedAll.filter(
      (o) => o.placeId !== agent.locationId && o.id !== heldId && visited.has(o.placeId)
    );

    // Held object in Camila's hands (if any), with neutral carry-duration metadata
    const rawHeldObj = heldId ? enrichedAll.find((o) => o.id === heldId) ?? null : null;
    heldObject = rawHeldObj
      ? {
          ...rawHeldObj,
          ...(liveSensory?.heldCycles !== undefined ? { carriedCycles: liveSensory.heldCycles } : {}),
          ...(liveSensory?.heldOriginPlaceId ? { pickedUpAtPlaceId: liveSensory.heldOriginPlaceId } : {}),
        }
      : null;

    // Neutral recent world changes (deltas from Player or Camila's recent physical actions)
    recentWorldChanges = objState
      ? objState.getRecentWorldChanges(5).map((e) => e.summary)
      : [];

    // Nearby agents (Player within 14m or co-located, and other NPCs co-located)
    const agentsList: PerceivedNearbyAgentSummary[] = [];
    for (const other of state.agents) {
      if (other.id === agent.id) continue;
      const coLocated = other.locationId === agent.locationId;
      let distMeters: number | undefined;
      if (
        other.agentType === 'player' &&
        liveSensory?.playerPosition &&
        liveSensory?.camilaPosition
      ) {
        distMeters = Number(
          Math.hypot(
            liveSensory.playerPosition.x - liveSensory.camilaPosition.x,
            liveSensory.playerPosition.z - liveSensory.camilaPosition.z
          ).toFixed(1)
        );
      }
      if (coLocated || (distMeters !== undefined && distMeters <= 14.0)) {
        agentsList.push({
          id: other.id,
          name: other.name,
          role: other.agentType === 'player' ? 'player' : 'npc',
          locationId: other.locationId,
          distanceMeters: distMeters,
          holdingObjectId:
            other.agentType === 'player' ? (liveSensory?.playerHeldObjectId ?? null) : null,
        });
      }
    }
    nearbyAgents = agentsList;
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    role: isCamila ? 'explorer' : attendedSiteId ? 'attendant' : 'resident',
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
    nearbyPlaces,
    nearbyObjects,
    visibleObjectsHere,
    rememberedObjectsElsewhere,
    heldObject,
    recentWorldChanges,
    nearbyAgents,
    isSitting,
    sittingOn,
    visitedPlaceIds,
    unvisitedPlaceIds,
  };
}
