import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Agent, validateAgents } from '../src/core/entities/agent.js';
import { transitionAgentLocation, createInitialWorldState } from '../src/core/world-state.js';
import { WorldClock } from '../src/core/clock.js';

describe('Agents', () => {
  const validPlaceIds = new Set<string>([
    'city:ciudad-juarez',
    'district:development-district',
    'neighborhood:development-neighborhood',
    'street:development-street',
    'building:development-building',
  ]);

  test('validates player and npc agents with activity states and locations', () => {
    const agents: Agent[] = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Development Player',
        agentType: 'player',
        activityState: 'active',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 2000,
        currency: 'USD',
      },
      {
        id: 'agent:dev-npc',
        type: 'agent',
        name: 'Development NPC',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 0,
        currency: 'USD',
      },
    ];

    assert.doesNotThrow(() => validateAgents(agents, validPlaceIds));
  });

  test('rejects agent with invalid agentType', () => {
    const agents = [
      {
        id: 'agent:invalid',
        type: 'agent',
        name: 'Invalid Agent',
        agentType: 'alien',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid agentType: "alien"/
    );
  });

  test('rejects agent with invalid activityState', () => {
    const agents = [
      {
        id: 'agent:invalid-activity',
        type: 'agent',
        name: 'Invalid Agent',
        agentType: 'npc',
        activityState: 'sleeping',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid activityState: "sleeping"/
    );
  });

  test('rejects agent with invalid activitySince timestamp', () => {
    const agents = [
      {
        id: 'agent:invalid-since',
        type: 'agent',
        name: 'Invalid Agent',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: 'not-a-timestamp',
        locationId: 'building:development-building',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid activitySince timestamp/
    );
  });

  test('rejects agent with missing or empty locationId', () => {
    const agents = [
      {
        id: 'agent:no-loc',
        type: 'agent',
        name: 'No Location Agent',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: '   ',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid locationId: must be a non-empty string/
    );
  });

  test('rejects agent whose locationId references a non-existent Place', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'active',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'place:non-existent',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /references non-existent or invalid place locationId: "place:non-existent"/
    );
  });

  test('rejects agent whose locationId references another Agent ID', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'active',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'agent:dev-npc', // Non-place entity reference!
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /references non-existent or invalid place locationId: "agent:dev-npc"/
    );
  });

  test('rejects agent whose locationId references a Restaurant ID', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'active',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'restaurant:development-restaurant', // Restaurant is not a Place!
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /references non-existent or invalid place locationId: "restaurant:development-restaurant"/
    );
  });

  test('rejects agent with invalid type property', () => {
    const agents = [
      {
        id: 'agent:invalid',
        type: 'robot',
        name: 'Invalid Agent',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid entity type for agent "agent:invalid": "robot"/
    );
  });

  test('rejects duplicate agent IDs', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player 1',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 2000,
        currency: 'USD',
      },
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player 2',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 2000,
        currency: 'USD',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Duplicate entity id found in agents: "agent:dev-player"/
    );
  });

  test('rejects agent with negative balanceMinor', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: -100,
        currency: 'USD',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid balanceMinor: must be a non-negative integer/
    );
  });

  test('rejects agent with non-integer balanceMinor', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 12.5,
        currency: 'USD',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid balanceMinor: must be a non-negative integer/
    );
  });

  test('rejects agent with non-number balanceMinor', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: '500' as unknown as number,
        currency: 'USD',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid balanceMinor: must be a non-negative integer/
    );
  });

  test('rejects agent with empty or missing currency', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 500,
        currency: '   ',
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid currency: must be a non-empty string/
    );
  });

  test('rejects NPC agent with playerActivity', () => {
    const agents = [
      {
        id: 'agent:npc-with-activity',
        type: 'agent',
        name: 'NPC Agent',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 0,
        currency: 'USD',
        playerActivity: {
          activity: 'having-coffee',
          startedAt: '2026-09-14T08:00:00.000Z',
          completedAt: null,
        },
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /NPC agent "agent:npc-with-activity" cannot have playerActivity/
    );
  });

  test('rejects player with invalid playerActivity activity name', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'active',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 2000,
        currency: 'USD',
        playerActivity: {
          activity: 'sleeping',
          startedAt: '2026-09-14T08:00:00.000Z',
          completedAt: null,
        },
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid playerActivity activity: "sleeping".*Expected 'having-coffee'/
    );
  });

  test('rejects player with invalid or missing restaurantId in playerActivity', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'active',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 2000,
        currency: 'USD',
        playerActivity: {
          activity: 'having-coffee',
          startedAt: '2026-09-14T08:00:00.000Z',
          completedAt: null,
          restaurantId: '',
        },
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /Invalid playerActivity restaurantId: must be a non-empty string for agent "agent:dev-player"/
    );
  });

  test('rejects player with mismatched completedAt duration', () => {
    const agents = [
      {
        id: 'agent:dev-player',
        type: 'agent',
        name: 'Player',
        agentType: 'player',
        activityState: 'active',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 2000,
        currency: 'USD',
        playerActivity: {
          activity: 'having-coffee',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: '2026-09-14T08:00:00.000Z',
          completedAt: '2026-09-14T08:10:00.000Z', // 10 min instead of 15 min
        },
      },
    ];

    assert.throws(
      () => validateAgents(agents, validPlaceIds),
      /does not match exact 15-minute duration/
    );
  });

  test('accepts valid active and completed playerActivity', () => {
    const agents: Agent[] = [
      {
        id: 'agent:dev-player-active',
        type: 'agent',
        name: 'Player Active',
        agentType: 'player',
        activityState: 'active',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 2000,
        currency: 'USD',
        playerActivity: {
          activity: 'having-coffee',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: '2026-09-14T08:00:00.000Z',
          completedAt: null,
        },
      },
      {
        id: 'agent:dev-player-completed',
        type: 'agent',
        name: 'Player Completed',
        agentType: 'player',
        activityState: 'active',
        activitySince: '2026-09-14T08:00:00.000Z',
        locationId: 'building:development-building',
        balanceMinor: 2000,
        currency: 'USD',
        playerActivity: {
          activity: 'having-coffee',
          restaurantId: 'restaurant:development-restaurant',
          startedAt: '2026-09-14T08:00:00.000Z',
          completedAt: '2026-09-14T08:15:00.000Z',
        },
      },
    ];

    assert.doesNotThrow(() => validateAgents(agents, validPlaceIds));
  });

  test('transitionAgentLocation successfully updates locationId', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
    const state = createInitialWorldState(clock);

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    assert.equal(player.locationId, 'building:development-building');

    const updated = transitionAgentLocation(state, 'agent:dev-player', 'street:development-street');

    assert.equal(updated.locationId, 'street:development-street');
    assert.equal(player.locationId, 'street:development-street');
  });

  test('transitionAgentLocation to invalid place fails with zero state mutation', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
    const state = createInitialWorldState(clock);

    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const originalLocation = player.locationId;
    const originalActivity = player.activityState;
    const originalSince = player.activitySince;

    assert.throws(
      () => transitionAgentLocation(state, 'agent:dev-player', 'invalid:non-existent'),
      /target place "invalid:non-existent" does not exist in world state/
    );

    // Assert zero state mutation
    assert.equal(player.locationId, originalLocation);
    assert.equal(player.activityState, originalActivity);
    assert.equal(player.activitySince, originalSince);
  });

  test('transitionAgentLocation does not advance WorldClock or alter activityState/activitySince', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
    const state = createInitialWorldState(clock);

    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
    const initialTime = clock.getTime();
    const initialActivity = npc.activityState;
    const initialSince = npc.activitySince;

    transitionAgentLocation(state, 'agent:dev-npc', 'district:development-district');

    assert.equal(npc.locationId, 'district:development-district');
    assert.equal(clock.getTime(), initialTime);
    assert.equal(npc.activityState, initialActivity);
    assert.equal(npc.activitySince, initialSince);
  });
});
