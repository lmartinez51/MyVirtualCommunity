import { BaseEntity, validateEntityId } from './entity.js';
import { HAVING_COFFEE_DURATION_MS } from '../activities/having-coffee.js';

export type AgentType = 'player' | 'npc';
export type ActivityState = 'idle' | 'active';

/**
 * Concrete time-bound activity state for a Player agent (Milestone 9).
 *
 * NOTE: This represents the concrete player activity lifecycle without expanding
 * the general/NPC activityState or creating a generic Activity framework.
 */
export type ConsumableActivityType =
  | 'having-coffee'
  | 'eating-pastry';

export interface PlayerActivityState {
  activity: ConsumableActivityType;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  restaurantId: string;
  offeringId: string;
  itemId: string | null;
  companionAgentId?: string | null;
}

/**
 * Minimal Agent entity representing persistent identity, dynamic activity presence,
 * authoritative spatial presence (locationId referencing a Place), economic balances,
 * and optional concrete player activity state.
 *
 * NOTE: Location represents a static reference to an existing Place entity.
 * It does NOT represent coordinates, movement, walking, physics, or navigation.
 */
export interface Agent extends BaseEntity {
  id: string;
  type: 'agent';
  name: string;
  agentType: AgentType;
  activityState: ActivityState;
  activitySince: string;
  locationId: string;
  balanceMinor: number;
  currency: string;
  playerActivity?: PlayerActivityState | null;
}

/**
 * Validates a collection of agents and ensures unique IDs, supported agent types,
 * valid activity states, valid activitySince timestamps, and valid spatial presence (locationId).
 *
 * If validLocationIds is provided, enforces that locationId references an existing Place or Restaurant entity.
 */
export function validateAgents(
  agents: unknown[],
  validLocationIds?: Set<string>
): asserts agents is Agent[] {
  if (!Array.isArray(agents)) {
    throw new Error('Invalid agents collection: must be an array');
  }

  const agentIds = new Set<string>();

  for (const item of agents) {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Invalid agent: must be a non-null object');
    }

    const agent = item as Record<string, unknown>;
    validateEntityId(agent.id);

    if (agentIds.has(agent.id)) {
      throw new Error(`Duplicate entity id found in agents: "${agent.id}"`);
    }
    agentIds.add(agent.id);

    if (agent.type !== 'agent') {
      throw new Error(`Invalid entity type for agent "${agent.id}": "${agent.type}"`);
    }

    if (typeof agent.name !== 'string' || agent.name.trim() === '') {
      throw new Error(`Invalid agent name: must be a non-empty string for agent "${agent.id}"`);
    }

    const validAgentTypes: AgentType[] = ['player', 'npc'];
    if (!validAgentTypes.includes(agent.agentType as AgentType)) {
      throw new Error(`Invalid agentType: "${agent.agentType}" for agent "${agent.id}"`);
    }

    const validActivityStates: ActivityState[] = ['idle', 'active'];
    if (!validActivityStates.includes(agent.activityState as ActivityState)) {
      throw new Error(
        `Invalid activityState: "${agent.activityState}" for agent "${agent.id}". Expected 'idle' or 'active'.`
      );
    }

    if (typeof agent.activitySince !== 'string' || agent.activitySince.trim() === '') {
      throw new Error(
        `Invalid activitySince: must be a non-empty string for agent "${agent.id}"`
      );
    }

    if (Number.isNaN(Date.parse(agent.activitySince))) {
      throw new Error(
        `Invalid activitySince timestamp: "${agent.activitySince}" for agent "${agent.id}"`
      );
    }

    if (typeof agent.locationId !== 'string' || agent.locationId.trim() === '') {
      throw new Error(
        `Invalid locationId: must be a non-empty string for agent "${agent.id}"`
      );
    }

    if (validLocationIds && !validLocationIds.has(agent.locationId)) {
      throw new Error(
        `Invalid Agent location: agent "${agent.id}" references non-existent or invalid place locationId: "${agent.locationId}"`
      );
    }

    if (
      typeof agent.balanceMinor !== 'number' ||
      !Number.isInteger(agent.balanceMinor) ||
      agent.balanceMinor < 0
    ) {
      throw new Error(
        `Invalid balanceMinor: must be a non-negative integer for agent "${agent.id}". Received: ${JSON.stringify(agent.balanceMinor)}`
      );
    }

    if (typeof agent.currency !== 'string' || agent.currency.trim() === '') {
      throw new Error(
        `Invalid currency: must be a non-empty string for agent "${agent.id}"`
      );
    }

    if (agent.playerActivity !== undefined && agent.playerActivity !== null) {
      if (agent.agentType !== 'player') {
        throw new Error(
          `Invalid agent: NPC agent "${agent.id}" cannot have playerActivity`
        );
      }

      if (typeof agent.playerActivity !== 'object' || agent.playerActivity === null) {
        throw new Error(
          `Invalid playerActivity: must be a non-null object for agent "${agent.id}"`
        );
      }

      const pa = agent.playerActivity as Record<string, unknown>;

      if (pa.activity !== 'having-coffee' && pa.activity !== 'eating-pastry') {
        throw new Error(
          `Invalid playerActivity activity: "${pa.activity}" for agent "${agent.id}". Expected 'having-coffee' or 'eating-pastry'.`
        );
      }

      if (typeof pa.restaurantId !== 'string' || pa.restaurantId.trim() === '') {
        throw new Error(
          `Invalid playerActivity restaurantId: must be a non-empty string for agent "${agent.id}"`
        );
      }

      if (typeof pa.startedAt !== 'string' || pa.startedAt.trim() === '' || Number.isNaN(Date.parse(pa.startedAt))) {
        throw new Error(
          `Invalid playerActivity startedAt timestamp: "${pa.startedAt}" for agent "${agent.id}"`
        );
      }

      if (
        pa.durationMs !== undefined &&
        (typeof pa.durationMs !== 'number' || !Number.isInteger(pa.durationMs) || pa.durationMs <= 0)
      ) {
        throw new Error(
          `Invalid playerActivity durationMs: must be a positive integer for agent "${agent.id}". Received: ${JSON.stringify(pa.durationMs)}`
        );
      }

      if (pa.offeringId !== undefined && (typeof pa.offeringId !== 'string' || pa.offeringId.trim() === '')) {
        throw new Error(
          `Invalid playerActivity offeringId: must be a non-empty string for agent "${agent.id}"`
        );
      }

      if (pa.itemId !== undefined && pa.itemId !== null && (typeof pa.itemId !== 'string' || pa.itemId.trim() === '')) {
        throw new Error(
          `Invalid playerActivity itemId: must be null or a non-empty string for agent "${agent.id}"`
        );
      }

      if (pa.companionAgentId !== undefined && pa.companionAgentId !== null && (typeof pa.companionAgentId !== 'string' || pa.companionAgentId.trim() === '')) {
        throw new Error(
          `Invalid playerActivity companionAgentId: must be null or a non-empty string for agent "${agent.id}"`
        );
      }

      if (pa.completedAt !== null) {
        if (typeof pa.completedAt !== 'string' || pa.completedAt.trim() === '' || Number.isNaN(Date.parse(pa.completedAt))) {
          throw new Error(
            `Invalid playerActivity completedAt: must be null or a valid ISO-8601 timestamp for agent "${agent.id}"`
          );
        }

        const duration = typeof pa.durationMs === 'number' ? pa.durationMs : HAVING_COFFEE_DURATION_MS;
        const expectedCompletion = Date.parse(pa.startedAt) + duration;
        if (Date.parse(pa.completedAt) !== expectedCompletion) {
          throw new Error(
            `Invalid playerActivity completedAt: "${pa.completedAt}" does not match exact 15-minute duration from startedAt "${pa.startedAt}" for agent "${agent.id}"`
          );
        }
      }
    }
  }
}
