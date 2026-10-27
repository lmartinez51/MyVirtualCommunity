/**
 * Canonical Physical Co-Presence Authority (Milestone 85 Correction Pass).
 *
 * Implements Principle P1: Single co-presence authority across all domains.
 * No domain (social, commerce, item possession, agent context, perception,
 * world projection, simulation) may implement its own interpretation of
 * physical proximity or co-location.
 *
 * Rule:
 * Two agents are physically co-located if and only if:
 * 1. They share identical logical world context: agentA.locationId === agentB.locationId
 * 2. They share identical physical spatial partition: agentA.interiorSpaceId === agentB.interiorSpaceId
 */

import type { Agent } from './entities/agent.js';

export function areAgentsCoLocated(
  state: { readonly agents?: readonly Agent[] },
  agentIdA: string,
  agentIdB: string
): boolean {
  if (
    typeof agentIdA !== 'string' ||
    agentIdA.trim() === '' ||
    typeof agentIdB !== 'string' ||
    agentIdB.trim() === ''
  ) {
    return false;
  }

  const agentA = state.agents?.find((a) => a.id === agentIdA);
  const agentB = state.agents?.find((a) => a.id === agentIdB);

  if (!agentA || !agentB) {
    return false;
  }

  if (
    typeof agentA.locationId !== 'string' ||
    agentA.locationId.trim() === '' ||
    typeof agentB.locationId !== 'string' ||
    agentB.locationId.trim() === ''
  ) {
    return false;
  }

  if (agentA.locationId !== agentB.locationId) {
    return false;
  }

  const subA = agentA.interiorSpaceId ?? null;
  const subB = agentB.interiorSpaceId ?? null;
  return subA === subB;
}
