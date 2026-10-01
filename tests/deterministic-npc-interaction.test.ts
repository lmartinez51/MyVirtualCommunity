import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, unlinkSync } from 'node:fs';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { ApiClient } from '../src/client/api-client.js';
import { ClientSession } from '../src/client/session.js';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  greetAgent,
  introduceToAgent,
  isAgentAcquainted,
} from '../src/core/world-state.js';

describe('Milestone 45: Deterministic NPC Interaction', () => {
  let tempFilePath: string;
  let server: WorldHttpServer | null = null;
  let baseUrl: string = '';

  beforeEach(async () => {
    tempFilePath = join(
      tmpdir(),
      `m45-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );

    const controller = new WorldSessionController({
      persistencePath: tempFilePath,
      silent: true,
    });

    server = createWorldServer({
      controller,
      silent: true,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = info.url;
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    if (existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // Ignore test cleanup error
      }
    }
  });

  describe('1. Core Domain Authority & Invariants', () => {
    test('Initial unacquainted greeting, introduction reciprocal response, and acquainted greeting', () => {
      const clock = WorldClock.create('2026-09-14T10:00:00.000Z');
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });

      // Move player and NPC to development restaurant
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      player.locationId = 'restaurant:development-restaurant';
      npc.locationId = 'restaurant:development-restaurant';
      npc.activityState = 'active';

      // 1. Initial greeting (unacquainted)
      assert.equal(isAgentAcquainted(state, player.id, npc.id), false);
      const initialGreet = greetAgent(state, player.id, npc.id);
      assert.equal(initialGreet.success, true);
      assert.equal(initialGreet.code, 'success');
      assert.equal(initialGreet.response, "Welcome. I'm working here today.");
      assert.equal(state.acquaintances.length, 0); // Pure read-only, zero mutation

      // 2. Introduction creates canonical Acquaintance with deterministic reciprocal response
      const intro = introduceToAgent(state, player.id, npc.id);
      assert.equal(intro.success, true);
      assert.equal(intro.code, 'success');
      assert.equal(
        intro.response,
        "Pleased to meet you! I'm Development NPC, working here at Development Restaurant."
      );
      assert.equal(state.acquaintances.length, 1);
      assert.equal(state.acquaintances[0].establishedAt, state.worldTime);
      assert.equal(isAgentAcquainted(state, player.id, npc.id), true);

      // 3. Subsequent greeting (acquainted)
      const subsequentGreet = greetAgent(state, player.id, npc.id);
      assert.equal(subsequentGreet.success, true);
      assert.equal(subsequentGreet.code, 'success');
      assert.equal(
        subsequentGreet.response,
        "Welcome back. Good to see you again. I'm working here today."
      );
      assert.equal(state.acquaintances.length, 1); // Zero mutation on greet

      // 4. Duplicate introduction is idempotent and causes zero mutation
      const dupIntro = introduceToAgent(state, player.id, npc.id);
      assert.equal(dupIntro.success, true);
      assert.equal(dupIntro.code, 'already-acquainted');
      assert.equal(state.acquaintances.length, 1);
    });

    test('Failure atomicity: non-existent target or not co-located', () => {
      const clock = WorldClock.create('2026-09-14T10:00:00.000Z');
      const state = createInitialWorldState(clock);

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'building:development-building';

      // Non-existent target
      const greetNonExistent = greetAgent(state, player.id, 'agent:ghost');
      assert.equal(greetNonExistent.success, false);
      assert.equal(greetNonExistent.code, 'npc-not-found');
      assert.equal(state.acquaintances.length, 0);

      const introNonExistent = introduceToAgent(state, player.id, 'agent:ghost');
      assert.equal(introNonExistent.success, false);
      assert.equal(introNonExistent.code, 'npc-not-found');
      assert.equal(state.acquaintances.length, 0);

      // Not co-located: player at building, npc at restaurant
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'restaurant:development-restaurant';

      const greetNotColocated = greetAgent(state, player.id, npc.id);
      assert.equal(greetNotColocated.success, false);
      assert.equal(greetNotColocated.code, 'agents-not-co-located');
      assert.equal(state.acquaintances.length, 0);

      const introNotColocated = introduceToAgent(state, player.id, npc.id);
      assert.equal(introNotColocated.success, false);
      assert.equal(introNotColocated.code, 'agents-not-co-located');
      assert.equal(state.acquaintances.length, 0);
    });
  });

  describe('2. ClientSession & HTTP Integration Flow', () => {
    test('End-to-end flow: advance time, enter restaurant, unacquainted greet, introduce, acquainted greet, affordance transition, reload reconciliation', async () => {
      const apiClient = new ApiClient(baseUrl);
      const session = new ClientSession(apiClient);

      const initOk = await session.init();
      assert.equal(initOk, true);

      // 1. Advance time dynamically to 10:00 Local (16:00 UTC) so restaurant is open and staff is active
      const worldTime = session.getState().model!.worldTime;
      const currentDate = new Date(worldTime);
      const targetDate = new Date(currentDate.getTime());
      targetDate.setUTCHours(16, 0, 0, 0);
      let diffMs = targetDate.getTime() - currentDate.getTime();
      if (diffMs <= 0) {
        targetDate.setUTCDate(targetDate.getUTCDate() + 1);
        diffMs = targetDate.getTime() - currentDate.getTime();
      }
      const stepOk = await session.stepSimulation(diffMs);
      assert.equal(stepOk, true);

      // 2. Enter restaurant from containing building
      const enterOk = await session.executeCommand('enterRestaurant', {
        restaurantId: 'restaurant:development-restaurant',
      });
      assert.equal(enterOk, true);
      assert.equal(session.getState().model?.locationId, 'restaurant:development-restaurant');

      // 3. Inspect co-located NPC: initially unacquainted
      const devNpc = session.getState().model?.agents.find((a) => a.id === 'agent:dev-npc');
      assert.ok(devNpc, 'Development NPC should be co-located at restaurant');
      assert.equal(devNpc?.isAcquainted, false);

      // Affordances should include both greet and introduce
      const affordances = session.getState().model?.affordances || [];
      assert.ok(affordances.some((a) => a.id === 'greet-agent:dev-npc'));
      assert.ok(affordances.some((a) => a.id === 'introduce-agent:dev-npc'));

      // 4. Initial Greet: receive unacquainted dialogue response
      const greet1Ok = await session.executeCommand('greetAgent', {
        targetAgentId: 'agent:dev-npc',
      });
      assert.equal(greet1Ok, true);
      assert.equal(
        session.getState().feedbackMessage?.text,
        'NPC response: "Welcome. I\'m working here today."'
      );

      // 5. Introduce: receive reciprocal response and create acquaintance
      const introOk = await session.executeCommand('introduceAgent', {
        targetAgentId: 'agent:dev-npc',
      });
      assert.equal(introOk, true);
      assert.equal(
        session.getState().feedbackMessage?.text,
        'NPC response: "Pleased to meet you! I\'m Development NPC, working here at Development Restaurant."'
      );

      // Reconciled state should reflect isAcquainted: true
      const devNpcAfter = session.getState().model?.agents.find((a) => a.id === 'agent:dev-npc');
      assert.equal(devNpcAfter?.isAcquainted, true);

      // Introduce affordance MUST now be removed, greet remains
      const affordancesAfter = session.getState().model?.affordances || [];
      assert.ok(affordancesAfter.some((a) => a.id === 'greet-agent:dev-npc'));
      assert.equal(
        affordancesAfter.some((a) => a.id === 'introduce-agent:dev-npc'),
        false
      );

      // 6. Subsequent Greet: receive acquainted dialogue response
      const greet2Ok = await session.executeCommand('greetAgent', {
        targetAgentId: 'agent:dev-npc',
      });
      assert.equal(greet2Ok, true);
      assert.equal(
        session.getState().feedbackMessage?.text,
        'NPC response: "Welcome back. Good to see you again. I\'m working here today."'
      );

      // 7. Test invalid command: non-existent agent returns domain error and preserves state
      const invalidIntroOk = await session.executeCommand('introduceAgent', {
        targetAgentId: 'agent:ghost',
      });
      assert.equal(invalidIntroOk, false);
      assert.equal(session.getState().status, 'DOMAIN_ERROR');

      // 8. Browser Reload Reconciliation: fresh session against same server/persistence
      const reloadedSession = new ClientSession(new ApiClient(baseUrl));
      const reloadOk = await reloadedSession.init();
      assert.equal(reloadOk, true);
      assert.equal(reloadedSession.getState().model?.locationId, 'restaurant:development-restaurant');

      const reloadedNpc = reloadedSession.getState().model?.agents.find((a) => a.id === 'agent:dev-npc');
      assert.equal(reloadedNpc?.isAcquainted, true);

      const reloadedAffordances = reloadedSession.getState().model?.affordances || [];
      assert.ok(reloadedAffordances.some((a) => a.id === 'greet-agent:dev-npc'));
      assert.equal(
        reloadedAffordances.some((a) => a.id === 'introduce-agent:dev-npc'),
        false
      );

      // Re-greet on reloaded session returns acquainted response
      const reloadedGreetOk = await reloadedSession.executeCommand('greetAgent', {
        targetAgentId: 'agent:dev-npc',
      });
      assert.equal(reloadedGreetOk, true);
      assert.equal(
        reloadedSession.getState().feedbackMessage?.text,
        'NPC response: "Welcome back. Good to see you again. I\'m working here today."'
      );
    });
  });
});
