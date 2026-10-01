/**
 * Residential Access Foundation (Milestone 58).
 *
 * Implements the authoritative domain evaluation rule for residential building access:
 * A building that has a SiteAgentAssociation with role: 'resident' is treated as a
 * residential site. A player may enter it only when its designated resident is currently
 * physically present at that building (resident.locationId === buildingId).
 *
 * Core Semantic Boundaries:
 * - Spatial Authority owns: Physical topology and containment hierarchy (Place / Building).
 * - Site Agent Association Authority owns: Functional site association ('resident' | 'attendant').
 * - Agent Authority owns: Agent entity records and current spatial presence (Agent.locationId).
 * - Property Authority owns: Property records and holder assignment status ('unassigned' | 'assigned').
 *     -> STRICT INVARIANT: Property assignment is NEVER consulted for residential access.
 * - Residential Access Authority owns: Current presence-based access interaction rule.
 *
 * Mandatory Distinctions:
 * - WHERE THE AGENT IS (Agent.locationId)
 *     ≠ WHAT SITE THE AGENT SERVES (SiteAgentAssociation)
 *     ≠ WHO HOLDS THE PROPERTY (Property.assignment)
 *     ≠ WHETHER ACCESS IS ALLOWED (Residential Access Rule)
 *
 * Invariants:
 * - Pure evaluation with ZERO state mutation.
 * - No inspection of activityState or schedule internals to deny access.
 * - No locks, keys, invitations, persistent visitor lists, or household systems.
 */

import type { Agent } from './entities/agent.js';
import {
  type SiteAgentAssociation,
  getSiteResident,
} from './site-agent-association.js';

export type ResidentialAccessResultCode =
  | 'allowed'
  | 'resident-not-found'
  | 'resident-agent-missing'
  | 'resident-not-home';

export interface ResidentialAccessResult {
  readonly allowed: boolean;
  readonly code: ResidentialAccessResultCode;
  readonly message: string;
  readonly residentId?: string;
}

export type ResidentialAdmissionPolicyResultCode =
  | 'admitted'
  | 'resident-not-home'
  | 'resident-declined-stranger';

export interface ResidentialAdmissionPolicyResult {
  readonly admitted: boolean;
  readonly code: ResidentialAdmissionPolicyResultCode;
  readonly message: string;
}

export type InteractAtResidenceResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'building-not-found'
  | 'building-not-residential'
  | 'already-inside'
  | 'player-not-at-building-access-context'
  | 'resident-agent-missing'
  | 'resident-not-home'
  | 'resident-declined-stranger';

export interface InteractAtResidenceResult {
  readonly success: boolean;
  readonly code: InteractAtResidenceResultCode;
  readonly message: string;
  readonly playerId: string;
  readonly buildingId: string;
  readonly residentAgentId?: string;
  readonly previousLocationId?: string;
  readonly currentLocationId?: string;
  readonly isAdmitted?: boolean;
}

/**
 * Minimal world state slice required to evaluate residential access.
 */
export interface ResidentialAccessWorldState {
  readonly siteAgentAssociations: readonly SiteAgentAssociation[];
  readonly agents: readonly Agent[];
}

/**
 * Pure predicate checking whether a given building qualifies as a residential site.
 *
 * Detection rule: A building is residential if and only if it has a designated
 * SiteAgentAssociation with role === 'resident'.
 */
export function isResidentialBuilding(
  state: { readonly siteAgentAssociations: readonly SiteAgentAssociation[] },
  buildingId: string
): boolean {
  return getSiteResident(state, buildingId) !== undefined;
}

/**
 * Pure domain evaluator checking whether a player agent is permitted to enter a residential building.
 *
 * Precondition / Resolution flow:
 * 1. Building has an associated resident via SiteAgentAssociation (code: 'resident-not-found').
 * 2. Designated resident agent exists in state.agents (code: 'resident-agent-missing').
 * 3. Resident agent is currently physically present at the residence:
 *    resident.locationId === buildingId (code: 'allowed' vs 'resident-not-home').
 *
 * Guarantees:
 * - ZERO state mutation.
 * - Deterministic output derived exclusively from authoritative world state.
 * - Does NOT consult Property.assignment, activityState, or speculative resting states.
 */
export function evaluateResidentialAccess(
  state: ResidentialAccessWorldState,
  playerId: string,
  buildingId: string
): ResidentialAccessResult {
  // 1. Resolve resident association
  const residentAssoc = getSiteResident(state, buildingId);
  if (!residentAssoc) {
    return {
      allowed: false,
      code: 'resident-not-found',
      message: `Building "${buildingId}" does not have an associated resident`,
    };
  }

  // 2. Resolve resident agent entity
  const residentAgent = state.agents.find((a) => a.id === residentAssoc.agentId);
  if (!residentAgent) {
    return {
      allowed: false,
      code: 'resident-agent-missing',
      message: `Designated resident "${residentAssoc.agentId}" for building "${buildingId}" was not found in world state`,
      residentId: residentAssoc.agentId,
    };
  }

  // 3. Authoritative physical presence test
  if (residentAgent.locationId !== buildingId) {
    return {
      allowed: false,
      code: 'resident-not-home',
      message: `Resident "${residentAgent.id}" is not currently at home at "${buildingId}" (current location: "${residentAgent.locationId}")`,
      residentId: residentAgent.id,
    };
  }

  return {
    allowed: true,
    code: 'allowed',
    message: `Resident "${residentAgent.id}" is currently at home at "${buildingId}". Access granted.`,
    residentId: residentAgent.id,
  };
}

/**
 * Pure domain evaluator implementing the Residential Admission Policy (Milestone 59).
 *
 * Evaluates whether an admission request to a residence is granted or denied based on:
 * 1. Physical presence: Resident must be currently at home at the residence.
 * 2. Acquaintance: Resident must recognize the requesting agent (not an unacquainted stranger).
 *
 * Guarantees:
 * - Pure evaluation with ZERO state mutation.
 * - Does NOT model psychological consent, willingness, mood, emotions, or sleep.
 * - Deterministic output derived exclusively from presence and acquaintance status.
 */
export function evaluateResidentialAdmissionPolicy(
  isResidentHome: boolean,
  isAcquainted: boolean,
  residentId: string,
  buildingId: string
): ResidentialAdmissionPolicyResult {
  if (!isResidentHome) {
    return {
      admitted: false,
      code: 'resident-not-home',
      message: `Resident "${residentId}" is not currently at home at "${buildingId}"`,
    };
  }

  if (!isAcquainted) {
    return {
      admitted: false,
      code: 'resident-declined-stranger',
      message: `Resident "${residentId}" does not recognize visitor at "${buildingId}" and declined entry`,
    };
  }

  return {
    admitted: true,
    code: 'admitted',
    message: `Resident "${residentId}" is at home, recognizes visitor, and admitted entry to "${buildingId}"`,
  };
}

