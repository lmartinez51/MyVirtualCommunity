/**
 * Milestone 68 — Spatial Movement & Navigation Contract
 *
 * Establishes the semantic boundary separating the authoritative topological World Core
 * from future physical spatial representations and navigation systems.
 *
 * Architectural Principles (M68):
 * 1. Layer A — World Topology:
 *    The authoritative world representation (City -> District -> Neighborhood -> Street -> Building -> Restaurant).
 *    The World Core owns the semantic truth of these relationships and agent containment.
 * 2. Layer B — Physical Spatial Representation:
 *    Physical representation (geometry, positions, bounds, transforms) is implementation-specific
 *    and must NEVER become authoritative world truth.
 * 3. Layer C — Navigation:
 *    Navigation (traversal mechanics, pathfinding, NavMesh, obstacles) determines HOW movement can occur.
 *    The World Core determines WHETHER world state is valid.
 * 4. Authority Rule:
 *    World Core -> Navigation Request -> Navigation System -> Physical Traversal -> Authoritative Transition.
 *    Client/renderer positions never dictate world truth.
 * 5. Invalid vs. Unreachable Distinction:
 *    - INVALID_DESTINATION: World Core validation failure (destination does not exist in world state).
 *    - UNREACHABLE_DESTINATION: Navigation-layer failure (destination is valid in world truth, but physically unreachable).
 */

import type { AgentType } from './entities/agent.js';
import type { Place } from './entities/geography.js';
import type { Restaurant } from './entities/restaurant.js';

export type SpatialLayer =
  | 'world-topology'
  | 'physical-spatial'
  | 'navigation';

export type SpatialFailureCategory =
  | 'invalid-destination'
  | 'unreachable-destination';

export type LogicalDestinationValidationCode =
  | 'valid'
  | 'target-not-found'
  | 'invalid-target-format'
  | 'already-at-destination';

export interface LogicalDestinationValidationResult {
  readonly valid: boolean;
  readonly code: LogicalDestinationValidationCode;
  readonly message: string;
  readonly targetPlaceId: string;
  readonly failureCategory?: 'invalid-destination';
}

/**
 * Pure evaluator checking whether a target entity ID constitutes a valid logical destination
 * within the authoritative World Core (Milestone 68).
 *
 * Enforces:
 * - Target place exists in WorldState.places or WorldState.restaurants (for eligible agents).
 * - Distinguishes logical world existence from physical reachability.
 * - ZERO state mutation.
 */
export function validateLogicalDestination(
  state: { places?: Place[]; restaurants?: Restaurant[] },
  targetPlaceId: string,
  currentLocationId?: string,
  agentType: AgentType = 'player'
): LogicalDestinationValidationResult {
  if (typeof targetPlaceId !== 'string' || targetPlaceId.trim() === '') {
    return Object.freeze({
      valid: false,
      code: 'invalid-target-format',
      message: 'Target place ID must be a non-empty string',
      targetPlaceId: String(targetPlaceId),
      failureCategory: 'invalid-destination',
    });
  }

  if (currentLocationId !== undefined && currentLocationId === targetPlaceId) {
    return Object.freeze({
      valid: true,
      code: 'already-at-destination',
      message: `Agent is already at destination "${targetPlaceId}"`,
      targetPlaceId,
    });
  }

  const placeExists = state.places?.some((p) => p.id === targetPlaceId) ?? false;
  const restaurantExists =
    agentType === 'npc'
      ? (state.restaurants?.some((r) => r.id === targetPlaceId) ?? false)
      : false;

  if (!placeExists && !restaurantExists) {
    return Object.freeze({
      valid: false,
      code: 'target-not-found',
      message: `Target destination "${targetPlaceId}" does not exist in world state topology`,
      targetPlaceId,
      failureCategory: 'invalid-destination',
    });
  }

  return Object.freeze({
    valid: true,
    code: 'valid',
    message: `Target destination "${targetPlaceId}" is a valid logical world location`,
    targetPlaceId,
  });
}

/**
 * Pure evaluator formalizing the critical distinction between World Core truth failure
 * and Navigation-layer reachability failure (Milestone 68).
 *
 * - INVALID_DESTINATION: The target place does not exist in authoritative world state.
 *   This is a World Core validation failure.
 * - UNREACHABLE_DESTINATION: The target place exists and is topologically valid in world truth,
 *   but the navigation layer (NavMesh/pathfinder) cannot find a valid physical path.
 *   This is a Navigation-layer failure.
 */
export function categorizeSpatialFailure(
  targetExistsInWorld: boolean,
  isPhysicallyReachable: boolean
): SpatialFailureCategory | 'valid' {
  if (!targetExistsInWorld) {
    return 'invalid-destination';
  }
  if (!isPhysicallyReachable) {
    return 'unreachable-destination';
  }
  return 'valid';
}

/**
 * Immutable specification declaring the M68 Spatial Movement & Navigation Contract.
 * Provides typed, runtime-accessible introspection for engine-independent integrations.
 */
export const SPATIAL_MOVEMENT_CONTRACT = Object.freeze({
  layers: Object.freeze({
    worldTopology: 'Layer A: Authoritative topological world truth (Place hierarchy and agent containment).',
    physicalSpatial: 'Layer B: Implementation-specific physical geometry. Never authoritative world truth.',
    navigation: 'Layer C: Traversal mechanics and routing. Determines HOW movement occurs; World Core determines WHETHER state is valid.',
  }),
  locationIdSemantics:
    'Agent.locationId represents the authoritative logical/topological world location referencing an existing Place or Restaurant. It is not a coordinate or physical transform.',
  authorityRule:
    'Physical representation is implementation-specific and must never become authoritative world truth.',
  transitionSemantics:
    'transitionAgentLocation() is an instantaneous logical/topological location update, not physical movement simulation.',
  failureCategories: Object.freeze({
    invalidDestination:
      'INVALID_DESTINATION: Destination does not exist in authoritative World Core.',
    unreachableDestination:
      'UNREACHABLE_DESTINATION: Destination is valid in World Core, but physical traversal path is unavailable in navigation layer.',
  }),
});
