/**
 * Site Agent Association Foundation (Milestone 57).
 *
 * Formalizes authoritative state, queries, and invariants for the first-class
 * relationship between a world Place/Site and the Agent responsible for
 * attending or representing that specific site.
 *
 * Core Semantic Boundaries:
 * - Spatial Authority owns: Physical topology and containment hierarchy (Place / Restaurant).
 * - Agent Authority owns: Agent entity records, physical locationId, and activityState.
 * - Property Authority owns: Property records and holder assignment status ('unassigned' | 'assigned').
 * - Site Agent Association Authority owns: Functional association between a site and an agent ('resident' | 'attendant').
 *
 * Mandatory Distinctions:
 * - WHERE THE AGENT IS (Agent.locationId)
 *     ≠ WHAT SITE THE AGENT SERVES (SiteAgentAssociation)
 *     ≠ WHO OWNS THE SITE (Property.assignment)
 *     ≠ WHO MAY ENTER THE SITE (Access / Movement Authority)
 *     ≠ WHAT THE AGENT IS CURRENTLY DOING (ActivityState / ConsumableActivity)
 *
 * An agent being at a location does not imply residency or attendance.
 * An association does not imply physical presence or property ownership.
 */

import type { Place } from './entities/geography.js';
import type { Restaurant } from './entities/restaurant.js';
import type { Agent } from './entities/agent.js';
import { validateEntityId } from './entities/entity.js';

export type SiteAgentRole = 'resident' | 'attendant';

export const VALID_SITE_AGENT_ROLES: readonly SiteAgentRole[] = Object.freeze([
  'resident',
  'attendant',
]);

/**
 * Authoritative, immutable Site Agent Association representation.
 *
 * Captures the functional role an agent holds with respect to a specific world site.
 * Minimal model containing exactly:
 * - placeId: Target Place or Restaurant identifier
 * - agentId: Associated Agent identifier
 * - role: 'resident' | 'attendant'
 */
export interface SiteAgentAssociation {
  readonly placeId: string;
  readonly agentId: string;
  readonly role: SiteAgentRole;
}

/**
 * World state interface required for Site Agent Association queries and validation.
 */
export interface SiteAgentAssociationWorldState {
  readonly siteAgentAssociations: readonly SiteAgentAssociation[];
  readonly places?: readonly Place[];
  readonly restaurants?: readonly Restaurant[];
  readonly agents?: readonly Agent[];
}

/**
 * Authoritative initial SiteAgentAssociation records for the canonical development seed world.
 * Explicit fixture definitions:
 * - building:development-residence -> agent:dev-npc (role: resident)
 * - restaurant:development-restaurant -> agent:dev-npc (role: attendant)
 */
export const DEVELOPMENT_SEED_SITE_AGENT_ASSOCIATIONS: readonly SiteAgentAssociation[] = Object.freeze([
  {
    placeId: 'building:development-residence',
    agentId: 'agent:dev-npc',
    role: 'resident',
  },
  {
    placeId: 'restaurant:development-restaurant',
    agentId: 'agent:dev-npc',
    role: 'attendant',
  },
]);

/**
 * Authoritative initial SiteAgentAssociation records for the canonical real-world Ciudad Juárez seed world.
 * Explicit fixture definitions:
 * - building:real-world-residence -> agent:real-world-player (role: resident)
 * - restaurant:kentucky-club -> agent:m39-service-staff (role: attendant)
 */
export const REAL_WORLD_JUAREZ_SEED_SITE_AGENT_ASSOCIATIONS: readonly SiteAgentAssociation[] = Object.freeze([
  {
    placeId: 'building:real-world-residence',
    agentId: 'agent:real-world-player',
    role: 'resident',
  },
  {
    placeId: 'restaurant:kentucky-club',
    agentId: 'agent:m39-service-staff',
    role: 'attendant',
  },
]);

/**
 * Combined initial site agent association definitions for canonical seed worlds.
 */
export const EXPLICIT_INITIAL_SITE_AGENT_ASSOCIATIONS: readonly SiteAgentAssociation[] = Object.freeze([
  ...DEVELOPMENT_SEED_SITE_AGENT_ASSOCIATIONS,
  ...REAL_WORLD_JUAREZ_SEED_SITE_AGENT_ASSOCIATIONS,
]);

/**
 * Pure generator creating initial SiteAgentAssociation records for explicitly designated
 * fixtures present in the provided places, restaurants, and agents collections.
 *
 * NOTE: Used strictly for seed fixtures or programmatic world creation, NEVER for migration.
 */
export function createInitialSiteAgentAssociations(
  places: readonly Place[],
  restaurants: readonly Restaurant[] = [],
  agents: readonly Agent[] = []
): SiteAgentAssociation[] {
  const validSiteIdSet = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  const validAgentIdSet = new Set<string>(agents.map((a) => a.id));

  return EXPLICIT_INITIAL_SITE_AGENT_ASSOCIATIONS.filter(
    (assoc) => validSiteIdSet.has(assoc.placeId) && validAgentIdSet.has(assoc.agentId)
  );
}

/**
 * Generates the deterministic composite key for a SiteAgentAssociation tuple.
 * Used to enforce uniqueness: same place + same agent + same role must not be duplicated.
 */
export function getSiteAgentAssociationKey(assoc: SiteAgentAssociation): string {
  return `${assoc.placeId}::${assoc.agentId}::${assoc.role}`;
}

/**
 * Validates an individual SiteAgentAssociation record enforcing structural integrity,
 * valid identifier format, recognized role, and referential sanity.
 */
export function validateSiteAgentAssociation(
  item: unknown,
  validSiteIds?: Set<string>,
  validAgentIds?: Set<string>,
  knownAgentIds?: Set<string>,
  knownSiteIds?: Set<string>
): asserts item is SiteAgentAssociation {
  if (typeof item !== 'object' || item === null) {
    throw new Error('Invalid SiteAgentAssociation: must be a non-null object');
  }

  const assoc = item as Record<string, unknown>;

  // 1. Validate placeId
  if (typeof assoc.placeId !== 'string' || assoc.placeId.trim() === '') {
    throw new Error('Invalid SiteAgentAssociation: placeId must be a non-empty string');
  }
  try {
    validateEntityId(assoc.placeId);
  } catch (err: any) {
    throw new Error(`Invalid SiteAgentAssociation placeId format: ${err.message}`);
  }

  // 2. Validate agentId
  if (typeof assoc.agentId !== 'string' || assoc.agentId.trim() === '') {
    throw new Error('Invalid SiteAgentAssociation: agentId must be a non-empty string');
  }
  try {
    validateEntityId(assoc.agentId);
  } catch (err: any) {
    throw new Error(`Invalid SiteAgentAssociation agentId format: ${err.message}`);
  }

  // 3. Validate role
  if (typeof assoc.role !== 'string' || !VALID_SITE_AGENT_ROLES.includes(assoc.role as SiteAgentRole)) {
    throw new Error(
      `Invalid SiteAgentAssociation role: "${assoc.role}". Must be "resident" or "attendant"`
    );
  }

  // 4. Do not allow an Agent ID to masquerade as a Place
  if (knownAgentIds && knownAgentIds.has(assoc.placeId)) {
    throw new Error(
      `Invalid SiteAgentAssociation: placeId "${assoc.placeId}" references an agent, not a place`
    );
  }

  // 5. Do not allow a Restaurant or Place ID to be used as an Agent ID
  if (knownSiteIds && knownSiteIds.has(assoc.agentId)) {
    throw new Error(
      `Invalid SiteAgentAssociation: agentId "${assoc.agentId}" references a place/restaurant, not an agent`
    );
  }

  // 6. Referential integrity with known sites (Places or Restaurants)
  if (validSiteIds && !validSiteIds.has(assoc.placeId)) {
    throw new Error(
      `Invalid SiteAgentAssociation: placeId "${assoc.placeId}" references non-existent place`
    );
  }

  // 7. Referential integrity with known agents
  if (validAgentIds && !validAgentIds.has(assoc.agentId)) {
    throw new Error(
      `Invalid SiteAgentAssociation: agentId "${assoc.agentId}" references non-existent agent`
    );
  }
}

/**
 * Validates a collection of SiteAgentAssociation records enforcing array shape,
 * individual structural validity, referential integrity, tuple uniqueness,
 * and the resident cardinality invariant (maximum 1 resident per place).
 */
export function validateSiteAgentAssociations(
  associations: unknown[],
  validSiteIds?: Set<string>,
  validAgentIds?: Set<string>,
  knownAgentIds?: Set<string>,
  knownSiteIds?: Set<string>
): asserts associations is SiteAgentAssociation[] {
  if (!Array.isArray(associations)) {
    throw new Error('Invalid siteAgentAssociations collection: must be an array');
  }

  const seenKeys = new Set<string>();
  const seenResidentPlaces = new Set<string>();

  for (let i = 0; i < associations.length; i++) {
    const item = associations[i];
    validateSiteAgentAssociation(item, validSiteIds, validAgentIds, knownAgentIds, knownSiteIds);
    const assoc = item as SiteAgentAssociation;

    // 1. Enforce tuple uniqueness (placeId + agentId + role)
    const key = getSiteAgentAssociationKey(assoc);
    if (seenKeys.has(key)) {
      throw new Error(
        `Duplicate site agent association: place "${assoc.placeId}", agent "${assoc.agentId}", role "${assoc.role}"`
      );
    }
    seenKeys.add(key);

    // 2. Enforce Resident Cardinality: maximum 1 resident per place
    if (assoc.role === 'resident') {
      if (seenResidentPlaces.has(assoc.placeId)) {
        throw new Error(
          `Invalid site agent associations: Place "${assoc.placeId}" cannot have multiple resident associations`
        );
      }
      seenResidentPlaces.add(assoc.placeId);
    }
  }
}

/**
 * Validates domain-level authority invariants for SiteAgentAssociations.
 * Enforces referential integrity with Places, Restaurants, and Agents,
 * tuple uniqueness, and resident cardinality.
 */
export function validateSiteAgentAssociationAuthority(state: SiteAgentAssociationWorldState): void {
  const { siteAgentAssociations, places, restaurants, agents } = state;

  const placeIds = places ? new Set<string>(places.map((p) => p.id)) : undefined;
  const restaurantIds = restaurants ? new Set<string>(restaurants.map((r) => r.id)) : undefined;
  const agentIds = agents ? new Set<string>(agents.map((a) => a.id)) : undefined;

  const allSiteIds = (placeIds || restaurantIds)
    ? new Set<string>([...(placeIds ?? []), ...(restaurantIds ?? [])])
    : undefined;

  validateSiteAgentAssociations(
    siteAgentAssociations as unknown[],
    allSiteIds,
    agentIds,
    agentIds,
    allSiteIds
  );
}

/**
 * Pure query: returns all SiteAgentAssociation records for a specific site/place.
 */
export function getSiteAgentAssociations(
  state: { readonly siteAgentAssociations: readonly SiteAgentAssociation[] },
  placeId: string
): readonly SiteAgentAssociation[] {
  return state.siteAgentAssociations.filter((a) => a.placeId === placeId);
}

/**
 * Pure query: returns the designated resident association for a site, if any.
 *
 * Contract:
 * - Returns exactly 0 or 1 result (SiteAgentAssociation | undefined).
 * - Enforced by the World Core resident cardinality invariant: maximum 1 resident per place.
 * - Never chooses arbitrarily between multiple residents.
 */
export function getSiteResident(
  state: { readonly siteAgentAssociations: readonly SiteAgentAssociation[] },
  placeId: string
): SiteAgentAssociation | undefined {
  return state.siteAgentAssociations.find(
    (a) => a.placeId === placeId && a.role === 'resident'
  );
}

/**
 * Pure query: returns the designated attendant association for a site, if any.
 */
export function getSiteAttendant(
  state: { readonly siteAgentAssociations: readonly SiteAgentAssociation[] },
  placeId: string
): SiteAgentAssociation | undefined {
  return state.siteAgentAssociations.find(
    (a) => a.placeId === placeId && a.role === 'attendant'
  );
}

/**
 * Pure query: returns all site associations held by a specific agent.
 */
export function getAgentSiteAssociations(
  state: { readonly siteAgentAssociations: readonly SiteAgentAssociation[] },
  agentId: string
): readonly SiteAgentAssociation[] {
  return state.siteAgentAssociations.filter((a) => a.agentId === agentId);
}
