import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  WorldState,
  validateWorldState,
  inspectCurrentLocation,
  evaluateRequestRestaurantService,
  requestRestaurantService,
  getActiveRestaurantService,
  clearActiveRestaurantService,
  resetRestaurantServiceState,
  isAttendantOnDuty,
  RestaurantServiceAcceptedEvent,
  DEFAULT_WORLD_ID,
} from '../src/core/world-state.js';
import { createGomezMorinSeedWorld } from '../src/core/seed.js';
import {
  enterThroughEntranceThreshold,
  exitThroughEntranceThreshold,
} from '../src/core/real-world-street-topology.js';
import { Simulation } from '../src/core/simulation.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { WorldHttpServer } from '../src/server/http-server.js';

describe('Milestone 91 — Authoritative NPC-Player Interaction', () => {
  // 10:00 AM Ciudad Juárez Civil Time (UTC-6) -> 16:00:00 UTC
  const ON_DUTY_WORLD_TIME = '2026-09-14T16:00:00.000Z';
  // 10:00 PM Ciudad Juárez Civil Time (UTC-6) -> 04:00:00 UTC next day
  const OFF_DUTY_WORLD_TIME = '2026-09-15T04:00:00.000Z';

  function setupGomezMorinState(initialTime: string = ON_DUTY_WORLD_TIME): {
    state: WorldState;
    clock: WorldClock;
  } {
    const clock = new WorldClock(initialTime);
    const seed = createGomezMorinSeedWorld(initialTime);
    const state: WorldState = {
      worldId: DEFAULT_WORLD_ID,
      version: 19,
      worldTime: initialTime,
      places: seed.places,
      restaurants: seed.restaurants,
      agents: seed.agents,
      offerings: seed.offerings,
      purchases: [],
      activityCompletions: [],
      acquaintances: [],
      items: [],
      knowledge: [],
      orders: [],
      properties: seed.properties,
      siteAgentAssociations: seed.siteAgentAssociations,
    };
    return { state, clock };
  }

  beforeEach(() => {
    resetRestaurantServiceState();
  });

  // =========================================================================
  // 1. Command & Player Authority
  // =========================================================================
  describe('1. Command & Player Authority', () => {
    it('succeeds for valid request inside Wing Spot during attendant shift', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Elena is active and co-located at interior:wing-spot

      // Move player into Wing Spot interior
      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      const res = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');
      assert.equal(res.success, true);
      assert.equal(res.code, 'success');
      assert.equal(res.playerId, 'agent:gomez-morin-player');
      assert.equal(res.restaurantId, 'restaurant:wing-spot');
      assert.equal(res.attendantId, 'agent:elena-npc');
      assert.ok(res.event);
      assert.equal(res.event.eventType, 'RestaurantServiceAccepted');
      assert.equal(res.event.status, 'accepted');
      assert.equal(res.event.worldTime, ON_DUTY_WORLD_TIME);
    });

    it('derives restaurantId from player location when omitted from payload', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      // Pass undefined restaurantId
      const res = requestRestaurantService(state, 'agent:gomez-morin-player');
      assert.equal(res.success, true);
      assert.equal(res.code, 'success');
      assert.equal(res.restaurantId, 'restaurant:wing-spot');
      assert.equal(res.attendantId, 'agent:elena-npc');
    });

    it('rejects client attempt to specify target attendant ID', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      const res = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot', {
        attendantId: 'agent:dev-npc',
      });
      assert.equal(res.success, false);
      assert.equal(res.code, 'client-override-forbidden');
    });

    it('rejects client attempt to force acceptance status', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      const res = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot', {
        accepted: true,
      });
      assert.equal(res.success, false);
      assert.equal(res.code, 'client-override-forbidden');
    });

    it('rejects when agent ID is non-existent', () => {
      const { state } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const res = requestRestaurantService(state, 'agent:non-existent', 'restaurant:wing-spot');
      assert.equal(res.success, false);
      assert.equal(res.code, 'player-not-found');
    });

    it('rejects when agent is an NPC rather than a player', () => {
      const { state } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const res = requestRestaurantService(state, 'agent:elena-npc', 'restaurant:wing-spot');
      assert.equal(res.success, false);
      assert.equal(res.code, 'player-not-player');
    });
  });

  // =========================================================================
  // 2. Spatial Preconditions (No Telepathic Interaction)
  // =========================================================================
  describe('2. Spatial Preconditions (No Telepathic Interaction)', () => {
    it('rejects when player is outside on the street', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      assert.equal(player.locationId, 'street:blvd-gomez-morin');

      const res = requestRestaurantService(state, player.id, 'restaurant:wing-spot');
      assert.equal(res.success, false);
      assert.equal(res.code, 'player-not-inside-restaurant');
    });

    it('rejects when player is inside containing building footprint but not in restaurant interior', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'building:wing-spot-building';
      player.interiorSpaceId = null;

      const res = requestRestaurantService(state, player.id, 'restaurant:wing-spot');
      assert.equal(res.success, false);
      assert.equal(res.code, 'player-not-inside-restaurant');
    });

    it('rejects when player is inside a different restaurant (Tía Lupe)', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
      });

      const res = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');
      assert.equal(res.success, false);
      assert.equal(res.code, 'player-not-inside-restaurant');
    });
  });

  // =========================================================================
  // 3. Establishment & Attendant Preconditions
  // =========================================================================
  describe('3. Establishment & Attendant Preconditions', () => {
    it('rejects when target restaurant does not exist', () => {
      const { state } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const res = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:ghost-diner');
      assert.equal(res.success, false);
      assert.equal(res.code, 'restaurant-not-found');
    });

    it('rejects when target establishment has no assigned attendant (Tía Lupe)', () => {
      const { state } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:tia-lupe-main',
      });

      const res = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:pasteleria-tia-lupe');
      assert.equal(res.success, false);
      assert.equal(res.code, 'no-attendant-assigned');
    });

    it('rejects when attendant is not currently co-located inside the restaurant', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      // Elena is NOT ticked into Wing Spot yet; she is at residence
      const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      assert.equal(elena.locationId, 'building:del-porvenir-residence');

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      const res = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');
      assert.equal(res.success, false);
      assert.equal(res.code, 'attendant-not-present');
    });

    it('rejects when attendant is off duty outside schedule window', () => {
      const { state, clock } = setupGomezMorinState(OFF_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Elena is at home resting

      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';

      // Even if manually forced co-presence, duty schedule fails
      const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      elena.locationId = 'restaurant:wing-spot';
      elena.interiorSpaceId = 'interior:wing-spot';

      const res = requestRestaurantService(state, player.id, 'restaurant:wing-spot');
      assert.equal(res.success, false);
      assert.equal(res.code, 'attendant-off-duty');
    });

    it('rejects when attendant activityState is idle', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      elena.activityState = 'idle';

      const res = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');
      assert.equal(res.success, false);
      assert.equal(res.code, 'attendant-off-duty');
    });
  });

  // =========================================================================
  // 4. Duplicate Request Handling
  // =========================================================================
  describe('4. Duplicate Request Handling', () => {
    it('rejects duplicate service request while an active interaction is in effect', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      const firstRes = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');
      assert.equal(firstRes.success, true);

      const secondRes = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');
      assert.equal(secondRes.success, false);
      assert.equal(secondRes.code, 'service-already-active');
      assert.match(secondRes.message, /already active/i);
    });

    it('allows service request again after clearing active interaction on exit', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      const firstRes = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');
      assert.equal(firstRes.success, true);

      // Player exits restaurant
      clearActiveRestaurantService('agent:gomez-morin-player');

      const reRequest = requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');
      assert.equal(reRequest.success, true);
    });
  });

  // =========================================================================
  // 5. Read-Model Projections & Side-Effect Free Queries
  // =========================================================================
  describe('5. Read-Model Projections & Side-Effect Free Queries', () => {
    it('projects attendant interactionState as "service-accepted" when active', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      // Before request: interactionState is idle
      const beforeView = inspectCurrentLocation(state, 'agent:gomez-morin-player');
      assert.equal(beforeView.location?.attendant?.interactionState, 'idle');

      // Request service
      requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');

      // After request: interactionState is service-accepted
      const afterView = inspectCurrentLocation(state, 'agent:gomez-morin-player');
      assert.equal(afterView.location?.attendant?.interactionState, 'service-accepted');
      assert.equal(afterView.location?.attendant?.lastInteractionTime, ON_DUTY_WORLD_TIME);
    });

    it('ensures repeated read queries produce zero state mutations or side effects', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      enterThroughEntranceThreshold(state, {
        agentId: 'agent:gomez-morin-player',
        entranceId: 'entrance:wing-spot-main',
      });

      requestRestaurantService(state, 'agent:gomez-morin-player', 'restaurant:wing-spot');

      const snapshotBefore = JSON.stringify(state);
      inspectCurrentLocation(state, 'agent:gomez-morin-player');
      inspectCurrentLocation(state, 'agent:gomez-morin-player');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 6. Persistence & Session Controller Integration
  // =========================================================================
  describe('6. Persistence & Session Controller Integration', () => {
    it('dispatches requestRestaurantService command through WorldSessionController', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'mvc-m91-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const { state } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
        // Ensure Elena is placed at Wing Spot interior
        const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
        elena.locationId = 'restaurant:wing-spot';
        elena.interiorSpaceId = 'interior:wing-spot';
        elena.activityState = 'active';

        // Place player inside Wing Spot interior
        const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
        player.locationId = 'restaurant:wing-spot';
        player.interiorSpaceId = 'interior:wing-spot';

        writeFileSync(persistencePath, JSON.stringify(state, null, 2), 'utf-8');

        const controller = new WorldSessionController({
          persistencePath,
          playerId: 'agent:gomez-morin-player',
          silent: true,
        });

        const dispatchRes = await controller.dispatchCommand('requestRestaurantService', {
          restaurantId: 'restaurant:wing-spot',
        });

        assert.equal(dispatchRes.success, true);
        assert.equal(dispatchRes.committed, true);
        const result = dispatchRes.result as any;
        assert.equal(result.code, 'success');
        assert.equal(result.attendantId, 'agent:elena-npc');
        assert.ok(result.event);
        assert.equal(result.event.status, 'accepted');

        // Verify read-model via controller
        const locView = controller.getLocationView();
        assert.equal(locView.location?.attendant?.interactionState, 'service-accepted');

        // Verify persisted state remains strictly Schema 19
        const persisted = controller.getPersistence().load()!;
        assert.equal(persisted.version, 19);
        assert.doesNotThrow(() => validateWorldState(persisted));

        await controller.shutdown();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('rolls back and discards candidate on persistence failure (atomicity)', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'mvc-m91-fail-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const { state } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
        const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
        elena.locationId = 'restaurant:wing-spot';
        elena.interiorSpaceId = 'interior:wing-spot';
        elena.activityState = 'active';

        const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
        player.locationId = 'restaurant:wing-spot';
        player.interiorSpaceId = 'interior:wing-spot';

        writeFileSync(persistencePath, JSON.stringify(state, null, 2), 'utf-8');

        const controller = new WorldSessionController({
          persistencePath,
          playerId: 'agent:gomez-morin-player',
          silent: true,
        });

        // Sabotage persistence to simulate disk failure
        const persistence = controller.getPersistence();
        persistence.save = () => {
          throw new Error('Disk full simulation');
        };

        const dispatchRes = await controller.dispatchCommand('requestRestaurantService', {
          restaurantId: 'restaurant:wing-spot',
        });

        assert.equal(dispatchRes.success, false);
        assert.equal(dispatchRes.committed, false);
        assert.equal(dispatchRes.error?.code, 'persistence-failure');

        // Active interaction was NOT committed due to atomic rollback
        assert.equal(getActiveRestaurantService('agent:gomez-morin-player'), null);

        await controller.shutdown();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('clears active interaction when player exits restaurant via controller', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'mvc-m91-exit-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const { state } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
        const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
        elena.locationId = 'restaurant:wing-spot';
        elena.interiorSpaceId = 'interior:wing-spot';
        elena.activityState = 'active';

        const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
        player.locationId = 'restaurant:wing-spot';
        player.interiorSpaceId = 'interior:wing-spot';

        writeFileSync(persistencePath, JSON.stringify(state, null, 2), 'utf-8');

        const controller = new WorldSessionController({
          persistencePath,
          playerId: 'agent:gomez-morin-player',
          silent: true,
        });

        await controller.dispatchCommand('requestRestaurantService', {
          restaurantId: 'restaurant:wing-spot',
        });
        assert.ok(getActiveRestaurantService('agent:gomez-morin-player'));

        // Exit restaurant
        const exitRes = await controller.dispatchCommand('exitRestaurant');
        assert.equal(exitRes.success, true);
        assert.equal(exitRes.committed, true);

        // Active service cleared
        assert.equal(getActiveRestaurantService('agent:gomez-morin-player'), null);

        await controller.shutdown();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // 7. HTTP API Endpoint Verification
  // =========================================================================
  describe('7. HTTP API Endpoint Verification', () => {
    it('serves POST /api/commands/requestRestaurantService with standard JSON structure', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'mvc-m91-http-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const { state } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
        const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
        elena.locationId = 'restaurant:wing-spot';
        elena.interiorSpaceId = 'interior:wing-spot';
        elena.activityState = 'active';

        const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
        player.locationId = 'restaurant:wing-spot';
        player.interiorSpaceId = 'interior:wing-spot';

        writeFileSync(persistencePath, JSON.stringify(state, null, 2), 'utf-8');

        let server: WorldHttpServer | null = null;
        try {
          server = new WorldHttpServer({
            controllerOptions: {
              persistencePath,
              playerId: 'agent:gomez-morin-player',
              silent: true,
            },
            port: 0,
            silent: true,
          });

          const info = await server.start(0, '127.0.0.1');
          const baseUrl = `http://${info.host}:${info.port}`;

          // 1. Success case: HTTP 200
          const res = await fetch(`${baseUrl}/api/commands/requestRestaurantService`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurantId: 'restaurant:wing-spot' }),
          });
          assert.equal(res.status, 200);
          const data = await res.json() as any;
          assert.equal(data.success, true);
          assert.equal(data.committed, true);
          assert.equal(data.result.code, 'success');
          assert.equal(data.result.attendantId, 'agent:elena-npc');

          // 2. Duplicate case: HTTP 422
          const dupRes = await fetch(`${baseUrl}/api/commands/requestRestaurantService`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurantId: 'restaurant:wing-spot' }),
          });
          assert.equal(dupRes.status, 422);
          const dupData = await dupRes.json() as any;
          assert.equal(dupData.success, false);
          assert.equal(dupData.error.code, 'service-already-active');

          // 3. Client identity override attempt: HTTP 400
          const overrideRes = await fetch(`${baseUrl}/api/commands/requestRestaurantService`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: 'agent:other-player' }),
          });
          assert.equal(overrideRes.status, 400);

          // 4. Client attendant override attempt: HTTP 400
          const attendantOverrideRes = await fetch(`${baseUrl}/api/commands/requestRestaurantService`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attendantId: 'agent:other-attendant' }),
          });
          assert.equal(attendantOverrideRes.status, 400);
        } finally {
          if (server) {
            await server.stop();
          }
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
