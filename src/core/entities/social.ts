import { validateEntityId } from './entity.js';

/**
 * Canonical dyadic acquaintance between two agents (Milestone 25).
 *
 * Represents a persistent, symmetric, binary social fact:
 * Both agents have established mutual acquaintance through explicit introduction.
 *
 * Invariants:
 * - agentIds: Exactly two distinct agent IDs in canonical lexicographical order (agentIds[0] < agentIds[1]).
 * - id: Deterministic identifier in the form `acquaintance:${agentIds[0]}:${agentIds[1]}`.
 * - establishedAt: ISO-8601 timestamp from WorldClock when the acquaintance was established.
 */
export interface Acquaintance {
  id: string;
  agentIds: [string, string];
  establishedAt: string;
}

/**
 * Returns the canonical pair of agent IDs sorted lexicographically.
 */
export function getCanonicalAgentPair(agentIdA: string, agentIdB: string): [string, string] {
  return agentIdA < agentIdB ? [agentIdA, agentIdB] : [agentIdB, agentIdA];
}

/**
 * Generates the deterministic unique identifier for an acquaintance dyad.
 */
export function getAcquaintanceId(agentIdA: string, agentIdB: string): string {
  const [first, second] = getCanonicalAgentPair(agentIdA, agentIdB);
  return `acquaintance:${first}:${second}`;
}

/**
 * Validates a collection of Acquaintance records.
 *
 * Enforces:
 * - Array of non-null objects
 * - Valid entity ID format
 * - Global ID uniqueness within the collection
 * - Exactly two distinct agent IDs in canonical lexicographical order
 * - ID strictly matches expected `acquaintance:${first}:${second}` format
 * - Unique dyadic pairs (no duplicate A-B or B-A records)
 * - Valid ISO-8601 establishedAt timestamp
 * - Referential integrity with agents collection (if validAgentIds provided)
 */
export function validateAcquaintances(
  acquaintances: unknown[],
  validAgentIds?: Set<string>
): asserts acquaintances is Acquaintance[] {
  if (!Array.isArray(acquaintances)) {
    throw new Error('Invalid acquaintances collection: must be an array');
  }

  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();

  for (const item of acquaintances) {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Invalid acquaintance: must be a non-null object');
    }

    const acq = item as Record<string, unknown>;
    validateEntityId(acq.id);

    if (seenIds.has(acq.id)) {
      throw new Error(`Duplicate entity id found in acquaintances: "${acq.id}"`);
    }
    seenIds.add(acq.id);

    if (!Array.isArray(acq.agentIds) || acq.agentIds.length !== 2) {
      throw new Error(`Invalid acquaintance agentIds for "${acq.id}": must be an array of 2 agent IDs`);
    }

    const [first, second] = acq.agentIds;
    if (typeof first !== 'string' || first.trim() === '' || typeof second !== 'string' || second.trim() === '') {
      throw new Error(`Invalid acquaintance agentIds for "${acq.id}": IDs must be non-empty strings`);
    }

    if (first === second) {
      throw new Error(`Invalid acquaintance "${acq.id}": cannot establish acquaintance with self ("${first}")`);
    }

    if (first >= second) {
      throw new Error(
        `Invalid acquaintance "${acq.id}": agentIds must be in canonical lexicographical order. Expected ["${second}", "${first}"], received ["${first}", "${second}"]`
      );
    }

    const expectedId = `acquaintance:${first}:${second}`;
    if (acq.id !== expectedId) {
      throw new Error(
        `Invalid acquaintance ID: expected "${expectedId}", received "${acq.id}"`
      );
    }

    const pairKey = `${first}|${second}`;
    if (seenPairs.has(pairKey)) {
      throw new Error(`Duplicate acquaintance pair found: "${pairKey}"`);
    }
    seenPairs.add(pairKey);

    if (typeof acq.establishedAt !== 'string' || acq.establishedAt.trim() === '') {
      throw new Error(`Invalid establishedAt for acquaintance "${acq.id}": must be a non-empty string`);
    }

    if (Number.isNaN(Date.parse(acq.establishedAt))) {
      throw new Error(`Invalid establishedAt timestamp for acquaintance "${acq.id}": "${acq.establishedAt}"`);
    }

    if (validAgentIds) {
      if (!validAgentIds.has(first)) {
        throw new Error(
          `Invalid acquaintance "${acq.id}": agent "${first}" does not exist in agents collection`
        );
      }
      if (!validAgentIds.has(second)) {
        throw new Error(
          `Invalid acquaintance "${acq.id}": agent "${second}" does not exist in agents collection`
        );
      }
    }
  }
}
