import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  purchaseOffering,
  startHavingCoffee,
  startEatingPastry,
  startAccompaniedActivity,
  inspectCurrentLocation,
  inspectPlayerHistory,
  makeDevelopmentOfferingAvailable,
  transferItemPossession,
  getOwnedItem,
  consumeOwnedItem,
  introduceToAgent,
  evaluateScheduleInformedRestaurantConsideration,
  evaluateOpportunityInformedCommercialConsideration,
  evaluateAccompaniedConsumableConsideration,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  WorldState,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { createWorldServer, WorldHttpServer } from '../src/server/http-server.js';
import {
  createPresentationModel,
  findInspectableEntity,
  getAffordanceGroup,
} from '../src/client/projections.js';

describe('Milestone 51: Accompanied Consumable Activity (Shared Refreshment)', () => {
  const BASE_TIME = '2026-09-24T10:00:00.000Z';
  const RESTAURANT_ID = 'restaurant:development-restaurant';
  const DEV_PLAYER_ID = 'agent:dev-player';
  const DEV_NPC_ID = 'agent:dev-npc';
  const COFFEE_OFFERING_ID = 'offering:development-coffee';

  /**
   * Helper that prepares a standard valid accompanied activity world state:
   * 1. Development restaurant is open.
   * 2. Player and Development NPC are co-located inside the restaurant.
   * 3. Player and Development NPC are acquainted.
   * 4. Player purchases Coffee (possesses available Coffee item).
   * 5. NPC makes Pan Dulce available, Player purchases Pan Dulce and transfers possession to NPC (M50).
   * 6. Player possesses Coffee, NPC possesses Pan Dulce.
   */
  function setupValidAccompaniedState(time: string = BASE_TIME): {
    clock: WorldClock;
    state: WorldState;
    playerCoffeeItemId: string;
    npcPastryItemId: string;
  } {
    const clock = WorldClock.create(time);
    const state = createInitialWorldState(clock);

    // Open restaurant
    const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
    rest.operationalState = 'open';

    // Co-locate NPC and Player at restaurant
    const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
    player.locationId = RESTAURANT_ID;
    const npc = state.agents.find((a) => a.id === DEV_NPC_ID)!;
    npc.locationId = RESTAURANT_ID;
    npc.activityState = 'active';

    // Establish mutual acquaintance
    introduceToAgent(state, DEV_PLAYER_ID, DEV_NPC_ID);

    // Player purchases Coffee
    const coffeePurchase = purchaseOffering(state, DEV_PLAYER_ID, COFFEE_OFFERING_ID, RESTAURANT_ID, {
      silent: true,
    });
    assert.strictEqual(coffeePurchase.success, true);
    assert.ok(coffeePurchase.itemId);
    const playerCoffeeItemId = coffeePurchase.itemId;

    // NPC makes Pan Dulce available, player purchases it, then transfers possession to NPC (M50)
    makeDevelopmentOfferingAvailable(state, DEV_NPC_ID, RESTAURANT_ID);
    const pastryPurchase = purchaseOffering(
      state,
      DEV_PLAYER_ID,
      DEVELOPMENT_PASTRY_OFFERING_ID,
      RESTAURANT_ID,
      { silent: true }
    );
    assert.strictEqual(pastryPurchase.success, true);
    assert.ok(pastryPurchase.itemId);

    const handoff = transferItemPossession(
      state,
      DEV_PLAYER_ID,
      DEV_NPC_ID,
      pastryPurchase.itemId,
      time
    );
    assert.strictEqual(handoff.success, true);
    const npcPastryItemId = pastryPurchase.itemId;

    return { clock, state, playerCoffeeItemId, npcPastryItemId };
  }

  describe('Positive Execution & Invariants', () => {
    it('1. valid accompanied activity starts and returns success with correct details', () => {
      const { state, playerCoffeeItemId, npcPastryItemId } = setupValidAccompaniedState();

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.code, 'success');
      assert.strictEqual(result.playerId, DEV_PLAYER_ID);
      assert.strictEqual(result.companionAgentId, DEV_NPC_ID);
      assert.strictEqual(result.restaurantId, RESTAURANT_ID);
      assert.strictEqual(result.activity, 'having-coffee');
      assert.strictEqual(result.startedAt, BASE_TIME);
      assert.strictEqual(result.completedAt, null);
      assert.strictEqual(result.playerItemId, playerCoffeeItemId);
      assert.strictEqual(result.companionItemId, npcPastryItemId);
    });

    it('2. player Coffee becomes consumed in Item Authority', () => {
      const { state, playerCoffeeItemId } = setupValidAccompaniedState();
      startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

      const playerItem = getOwnedItem(state, playerCoffeeItemId);
      assert.ok(playerItem);
      assert.strictEqual(playerItem.status, 'consumed');
      assert.strictEqual(playerItem.consumedAt, BASE_TIME);
      assert.strictEqual(playerItem.ownerAgentId, DEV_PLAYER_ID);
    });

    it('3. companion Pan Dulce becomes consumed in Item Authority', () => {
      const { state, npcPastryItemId } = setupValidAccompaniedState();
      startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

      const companionItem = getOwnedItem(state, npcPastryItemId);
      assert.ok(companionItem);
      assert.strictEqual(companionItem.status, 'consumed');
      assert.strictEqual(companionItem.consumedAt, BASE_TIME);
      assert.strictEqual(companionItem.ownerAgentId, DEV_NPC_ID);
      assert.strictEqual(companionItem.sourcePurchaseId !== '', true);
    });

    it('4. playerActivity.companionAgentId is correctly attributed on player and NOT on NPC', () => {
      const { state } = setupValidAccompaniedState();
      startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      assert.ok(player.playerActivity);
      assert.strictEqual(player.playerActivity.activity, 'having-coffee');
      assert.strictEqual(player.playerActivity.companionAgentId, DEV_NPC_ID);
      assert.strictEqual(player.playerActivity.durationMs, 900_000);

      const npc = state.agents.find((a) => a.id === DEV_NPC_ID)!;
      assert.strictEqual(Boolean(npc.playerActivity), false);
    });

    it('5. activity duration is 900_000 ms (15 minutes)', () => {
      const { state } = setupValidAccompaniedState();
      startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      assert.strictEqual(player.playerActivity?.durationMs, 900_000);
    });
  });

  describe('Simulation Completion & History', () => {
    it('6. simulation completes accompanied activity at exact theoretical boundary', () => {
      const { clock, state } = setupValidAccompaniedState();
      startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

      const sim = new Simulation(clock, state, { silent: true });

      // Advance by 14 minutes: activity should remain in-flight
      clock.advance(14 * 60 * 1000);
      let tick = sim.tick();
      assert.strictEqual(tick.playerActivityTransitions.length, 0);
      const playerInFlight = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      assert.strictEqual(playerInFlight.playerActivity?.completedAt, null);

      // Advance past the 15-minute mark (e.g. +2 minutes = 16 minutes total)
      clock.advance(2 * 60 * 1000);
      tick = sim.tick();
      assert.strictEqual(tick.playerActivityTransitions.length, 1);

      const expectedTheoreticalCompletion = new Date(Date.parse(BASE_TIME) + 900_000).toISOString();
      assert.strictEqual(tick.playerActivityTransitions[0].completedAt, expectedTheoreticalCompletion);

      const playerCompleted = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      assert.strictEqual(playerCompleted.playerActivity?.completedAt, expectedTheoreticalCompletion);
    });

    it('7. exactly one completion record is created upon simulation completion', () => {
      const { clock, state } = setupValidAccompaniedState();
      const initialCompletionsCount = state.activityCompletions.length;
      startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(15 * 60 * 1000);
      sim.tick();

      assert.strictEqual(state.activityCompletions.length, initialCompletionsCount + 1);
    });

    it('8. completion record contains companionAgentId attribution', () => {
      const { clock, state } = setupValidAccompaniedState();
      startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(15 * 60 * 1000);
      sim.tick();

      const lastRecord = state.activityCompletions[state.activityCompletions.length - 1];
      assert.strictEqual(lastRecord.playerId, DEV_PLAYER_ID);
      assert.strictEqual(lastRecord.companionAgentId, DEV_NPC_ID);
      assert.strictEqual(lastRecord.activity, 'having-coffee');
      assert.strictEqual(lastRecord.restaurantId, RESTAURANT_ID);
    });

    it('12. history projection exposes companion in activity history', () => {
      const { clock, state } = setupValidAccompaniedState();
      startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

      const sim = new Simulation(clock, state, { silent: true });
      clock.advance(15 * 60 * 1000);
      sim.tick();

      const historyResult = inspectPlayerHistory(state, DEV_PLAYER_ID);
      assert.strictEqual(historyResult.success, true);
      assert.ok(historyResult.history);

      const lastActivity = historyResult.history.activityCompletions[
        historyResult.history.activityCompletions.length - 1
      ];
      assert.strictEqual(lastActivity.companionAgentId, DEV_NPC_ID);
    });
  });

  describe('Persistence & Reload', () => {
    it('9. persistence round-trip works with active accompanied activity', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'm51-persist-active-'));
      try {
        const { state } = setupValidAccompaniedState();
        startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

        const testFile = join(tmpDir, 'world-state.json');
        const persistence = new LocalFilePersistence(testFile);
        persistence.save(state);

        const loaded = persistence.load();
        assert.ok(loaded);
        validateWorldState(loaded);

        const loadedPlayer = loaded.agents.find((a) => a.id === DEV_PLAYER_ID)!;
        assert.ok(loadedPlayer.playerActivity);
        assert.strictEqual(loadedPlayer.playerActivity.companionAgentId, DEV_NPC_ID);
        assert.strictEqual(loaded.version, CURRENT_WORLD_STATE_VERSION);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('10. cold-start reload works with completed accompanied activity record', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'm51-persist-completed-'));
      try {
        const { clock, state } = setupValidAccompaniedState();
        startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

        const sim = new Simulation(clock, state, { silent: true });
        clock.advance(15 * 60 * 1000);
        sim.tick();

        const testFile = join(tmpDir, 'world-state.json');
        const persistence = new LocalFilePersistence(testFile);
        persistence.save(state);

        const loaded = persistence.load();
        assert.ok(loaded);
        validateWorldState(loaded);

        const lastRec = loaded.activityCompletions[loaded.activityCompletions.length - 1];
        assert.strictEqual(lastRec.companionAgentId, DEV_NPC_ID);
        assert.strictEqual(loaded.version, CURRENT_WORLD_STATE_VERSION);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Action Consideration Derivation & Inspection', () => {
    it('11. action consideration appears under valid conditions and is pure', () => {
      const { state } = setupValidAccompaniedState();

      // Pure derivation direct call
      const consideration = evaluateAccompaniedConsumableConsideration(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        RESTAURANT_ID
      );
      assert.strictEqual(consideration.considered, true);
      assert.strictEqual(consideration.action, 'startAccompaniedActivity');
      assert.strictEqual(consideration.targetId, DEV_NPC_ID);
      assert.strictEqual(consideration.reason, 'co-located-companion-refreshment');
      assert.ok(consideration.description?.includes('Enjoy refreshment with'));

      // Location inspection includes the consideration
      const loc = inspectCurrentLocation(state, DEV_PLAYER_ID);
      assert.strictEqual(loc.success, true);
      const matched = loc.actionConsiderations?.find(
        (c) => c.action === 'startAccompaniedActivity' && c.targetId === DEV_NPC_ID
      );
      assert.ok(matched);
      assert.strictEqual(matched?.considered, true);

      // Presentation model creates affordance
      const presentation = createPresentationModel(
        { activePlayerId: DEV_PLAYER_ID, worldTime: BASE_TIME, schemaVersion: CURRENT_WORLD_STATE_VERSION },
        loc as unknown as Record<string, unknown>
      );
      const affordance = presentation.affordances.find(
        (a) => a.commandName === 'startAccompaniedActivity'
      );
      assert.ok(affordance);
      assert.strictEqual(affordance.payload.companionAgentId, DEV_NPC_ID);
      assert.strictEqual(affordance.group, 'ACT');
      assert.strictEqual(affordance.hint, matched?.description);

      // Inspected entity exposes consideration
      const inspectedNpc = findInspectableEntity(presentation, DEV_NPC_ID);
      assert.ok(inspectedNpc);
      assert.strictEqual(inspectedNpc.details['Consideration'], matched?.description);
    });
  });

  describe('Negative Rejections & Preconditions', () => {
    it('13. rejects with companion-not-found when companion does not exist', () => {
      const { state } = setupValidAccompaniedState();
      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, 'agent:ghost-npc');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'companion-not-found');
    });

    it('14. rejects with cannot-consume-with-self when companion is self', () => {
      const { state } = setupValidAccompaniedState();
      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_PLAYER_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'cannot-consume-with-self');
    });

    it('15. rejects with agents-not-co-located when companion is elsewhere', () => {
      const { state } = setupValidAccompaniedState();
      const npc = state.agents.find((a) => a.id === DEV_NPC_ID)!;
      npc.locationId = 'street:development-street';

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agents-not-co-located');
    });

    it('16. rejects with agents-not-acquainted when agents are strangers', () => {
      const { state } = setupValidAccompaniedState();
      // Clear acquaintances
      state.acquaintances = [];

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agents-not-acquainted');

      // Consideration should also be suppressed
      const consideration = evaluateAccompaniedConsumableConsideration(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        RESTAURANT_ID
      );
      assert.strictEqual(consideration.considered, false);
    });

    it('17. rejects with restaurant-closed when restaurant is closed', () => {
      const { state } = setupValidAccompaniedState();
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closed';

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'restaurant-closed');
    });

    it('rejects with not-inside-restaurant when player is not in development restaurant', () => {
      const { state } = setupValidAccompaniedState();
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.locationId = 'building:development-building';

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'not-inside-restaurant');
    });

    it('18. rejects with purchase-required when player lacks available Coffee', () => {
      const { state, playerCoffeeItemId } = setupValidAccompaniedState();
      // Remove player's coffee
      state.items = state.items.filter((i) => i.id !== playerCoffeeItemId);

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'purchase-required');
    });

    it('19. rejects with companion-item-required when companion lacks available Pan Dulce', () => {
      const { state, npcPastryItemId } = setupValidAccompaniedState();
      // Remove NPC's pastry
      state.items = state.items.filter((i) => i.id !== npcPastryItemId);

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'companion-item-required');
    });

    it('20. rejects with purchase-required when player Coffee is already consumed', () => {
      const { state, playerCoffeeItemId } = setupValidAccompaniedState();
      const item = getOwnedItem(state, playerCoffeeItemId)!;
      item.status = 'consumed';
      item.consumedAt = BASE_TIME;

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'purchase-required');
    });

    it('21. rejects with companion-item-required when companion Pan Dulce is already consumed', () => {
      const { state, npcPastryItemId } = setupValidAccompaniedState();
      const item = getOwnedItem(state, npcPastryItemId)!;
      item.status = 'consumed';
      item.consumedAt = BASE_TIME;

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'companion-item-required');
    });

    it('22. rejects with activity-already-active when player has active activity', () => {
      const { state } = setupValidAccompaniedState();
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.playerActivity = {
        activity: 'having-coffee',
        startedAt: BASE_TIME,
        completedAt: null,
        durationMs: 900_000,
        restaurantId: RESTAURANT_ID,
        offeringId: COFFEE_OFFERING_ID,
        itemId: 'item:999',
      };

      const result = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'activity-already-active');
    });

    it('23. rejects invalid command input through HTTP command validator', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'm51-http-'));
      try {
        const { state } = setupValidAccompaniedState();
        const testFile = join(tmpDir, 'world-state.json');
        const persistence = new LocalFilePersistence(testFile);
        persistence.save(state);

        const controller = new WorldSessionController({
          persistencePath: testFile,
          playerId: DEV_PLAYER_ID,
          silent: true,
        });
        const server = createWorldServer({ controller, port: 0, silent: true });
        const serverInfo = await server.start(0);
        const port = serverInfo.port;

        // 1. Missing companionAgentId
        const resMissing = await fetch(`http://127.0.0.1:${port}/api/commands/startAccompaniedActivity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        assert.strictEqual(resMissing.status, 400);
        const dataMissing = (await resMissing.json()) as any;
        assert.strictEqual(dataMissing.success, false);
        assert.strictEqual(dataMissing.error.code, 'invalid-command-input');

        // 2. Client supplying forbidden economic fact
        const resForbidden = await fetch(`http://127.0.0.1:${port}/api/commands/startAccompaniedActivity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companionAgentId: DEV_NPC_ID, purchaseId: 'fake-fact' }),
        });
        assert.strictEqual(resForbidden.status, 400);
        const dataForbidden = (await resForbidden.json()) as any;
        assert.strictEqual(dataForbidden.success, false);
        assert.strictEqual(dataForbidden.error.code, 'invalid-command-input');

        await server.stop();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('24. persistence failure leaves active memory unchanged with zero mutation', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'm51-fail-persist-'));
      try {
        const { state, playerCoffeeItemId, npcPastryItemId } = setupValidAccompaniedState();
        const testFile = join(tmpDir, 'world-state.json');
        const persistence = new LocalFilePersistence(testFile);
        persistence.save(state);

        const controller = new WorldSessionController({
          persistencePath: testFile,
          playerId: DEV_PLAYER_ID,
          silent: true,
        });

        // Sabotage persistence.save to throw
        (controller as any).persistence.save = () => {
          throw new Error('Simulated disk write I/O failure');
        };

        const dispatchResult = await controller.dispatchCommand('startAccompaniedActivity', {
          companionAgentId: DEV_NPC_ID,
        });

        assert.strictEqual(dispatchResult.success, false);
        assert.strictEqual(dispatchResult.committed, false);
        assert.strictEqual(dispatchResult.error?.code, 'persistence-failure');

        // Active state in controller must remain untouched
        const activeLoc = controller.getLocationView();
        assert.strictEqual(activeLoc.playerActivity, null);

        // Active items must remain available
        const activeItems = (controller as any).state.items;
        const playerItem = activeItems.find((i: any) => i.id === playerCoffeeItemId);
        assert.strictEqual(playerItem.status, 'available');
        const npcItem = activeItems.find((i: any) => i.id === npcPastryItemId);
        assert.strictEqual(npcItem.status, 'available');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('25. duplicate command does not consume twice (idempotency)', () => {
      const { state, playerCoffeeItemId, npcPastryItemId } = setupValidAccompaniedState();

      // First execution succeeds
      const result1 = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result1.success, true);

      // Second immediate execution fails through activity-already-active
      const result2 = startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);
      assert.strictEqual(result2.success, false);
      assert.strictEqual(result2.code, 'activity-already-active');

      // Verify items were consumed once
      const playerItem = getOwnedItem(state, playerCoffeeItemId)!;
      assert.strictEqual(playerItem.status, 'consumed');
      const npcItem = getOwnedItem(state, npcPastryItemId)!;
      assert.strictEqual(npcItem.status, 'consumed');
    });
  });

  describe('Architectural Regressions & Invariants', () => {
    it('26. solo startHavingCoffee still works', () => {
      const { state } = setupValidAccompaniedState();
      const result = startHavingCoffee(state, DEV_PLAYER_ID);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.activity, 'having-coffee');
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      assert.strictEqual(player.playerActivity?.companionAgentId, undefined);
    });

    it('27. solo startEatingPastry still works', () => {
      const { state } = setupValidAccompaniedState();
      // Buy an extra pastry for player
      const pastryPurchase = purchaseOffering(
        state,
        DEV_PLAYER_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID,
        RESTAURANT_ID,
        { silent: true }
      );
      assert.strictEqual(pastryPurchase.success, true);

      const result = startEatingPastry(state, DEV_PLAYER_ID);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.activity, 'eating-pastry');
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      assert.strictEqual(player.playerActivity?.companionAgentId, undefined);
    });

    it('28. M50 player->NPC transfer still works', () => {
      const { state } = setupValidAccompaniedState();
      // Buy another coffee and transfer to NPC
      const coffee2 = purchaseOffering(state, DEV_PLAYER_ID, COFFEE_OFFERING_ID, RESTAURANT_ID, {
        silent: true,
      });
      assert.strictEqual(coffee2.success, true);

      const handoff = transferItemPossession(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        coffee2.itemId!,
        BASE_TIME
      );
      assert.strictEqual(handoff.success, true);
      assert.strictEqual(handoff.code, 'success');
      assert.strictEqual(handoff.toAgentId, DEV_NPC_ID);
    });

    it('29. NPC possession remains valid', () => {
      const { state, npcPastryItemId } = setupValidAccompaniedState();
      const npcItem = getOwnedItem(state, npcPastryItemId)!;
      assert.strictEqual(npcItem.ownerAgentId, DEV_NPC_ID);
      assert.strictEqual(npcItem.status, 'available');
      validateWorldState(state);
    });

    it('30. existing item consumption remains valid', () => {
      const { state, playerCoffeeItemId } = setupValidAccompaniedState();
      const res = consumeOwnedItem(state, playerCoffeeItemId, BASE_TIME);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.code, 'success');
      const item = getOwnedItem(state, playerCoffeeItemId)!;
      assert.strictEqual(item.status, 'consumed');
    });

    it('31. existing M48 schedule consideration remains valid', () => {
      const clock = WorldClock.create('2026-09-24T15:30:00.000Z');
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.locationId = 'building:development-building';

      // Player has acquired schedule knowledge
      state.knowledge.push({
        agentId: DEV_PLAYER_ID,
        factType: 'agent-schedule',
        subjectId: DEV_NPC_ID,
        acquiredAt: '2026-09-24T15:00:00.000Z',
        sourceAgentId: DEV_NPC_ID,
        sourceLocationId: 'building:development-building',
        payload: {
          workplaceId: RESTAURANT_ID,
          shiftStart: '09:00',
          shiftEnd: '17:00',
        },
      });

      const consideration = evaluateScheduleInformedRestaurantConsideration(state, DEV_PLAYER_ID);
      assert.strictEqual(consideration.considered, true);
      assert.strictEqual(consideration.reason, 'known-npc-schedule');
    });

    it('32. existing M49 commercial consideration remains valid', () => {
      const { state } = setupValidAccompaniedState();
      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID
      );
      assert.strictEqual(consideration.considered, true);
      assert.strictEqual(consideration.reason, 'active-opportunity');
    });

    it('33. Version 16 persisted state still loads cleanly without companion fields', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'm51-v16-legacy-'));
      try {
        const clock = WorldClock.create(BASE_TIME);
        const state = createInitialWorldState(clock);
        const testFile = join(tmpDir, 'world-state.json');
        const persistence = new LocalFilePersistence(testFile);
        persistence.save(state);

        const loaded = persistence.load();
        assert.ok(loaded);
        validateWorldState(loaded);
        assert.strictEqual(loaded.version, CURRENT_WORLD_STATE_VERSION);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('NPC does NOT receive playerActivity, activity queue, or autonomous behavior', () => {
      const { state } = setupValidAccompaniedState();
      startAccompaniedActivity(state, DEV_PLAYER_ID, DEV_NPC_ID);

      const npc = state.agents.find((a) => a.id === DEV_NPC_ID)!;
      assert.strictEqual(Boolean(npc.playerActivity), false);
      assert.strictEqual((npc as any).activityQueue, undefined);
      assert.strictEqual((npc as any).needs, undefined);
      assert.strictEqual((npc as any).fatigue, undefined);
    });

    it('Action consideration is strictly pure and does NOT mutate state or consume items', () => {
      const { state, playerCoffeeItemId, npcPastryItemId } = setupValidAccompaniedState();
      const snapshotBefore = JSON.stringify(state);

      const consideration = evaluateAccompaniedConsumableConsideration(
        state,
        DEV_PLAYER_ID,
        DEV_NPC_ID,
        RESTAURANT_ID
      );
      assert.strictEqual(consideration.considered, true);

      const snapshotAfter = JSON.stringify(state);
      assert.strictEqual(snapshotBefore, snapshotAfter);

      // Items remain available
      const playerItem = getOwnedItem(state, playerCoffeeItemId)!;
      assert.strictEqual(playerItem.status, 'available');
      const npcItem = getOwnedItem(state, npcPastryItemId)!;
      assert.strictEqual(npcItem.status, 'available');
    });
  });
});
