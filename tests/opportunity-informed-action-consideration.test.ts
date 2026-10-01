import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  purchaseOffering,
  inspectCurrentLocation,
  makeDevelopmentOfferingAvailable,
  retireDevelopmentOffering,
  DEVELOPMENT_PASTRY_OFFERING_ID,
  WorldState,
  AgentKnowledgeRecord,
} from '../src/core/world-state.js';
import {
  evaluateOpportunityInformedCommercialConsideration,
  evaluateScheduleInformedRestaurantConsideration,
  ActionConsideration,
} from '../src/core/action-consideration.js';
import { createPresentationModel, findInspectableEntity } from '../src/client/projections.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 49: Opportunity-Informed Commercial Action Consideration', () => {
  const ACTIVE_SHIFT_TIME = '2026-09-23T16:00:00.000Z'; // 10:00 local in America/Ciudad_Juarez
  const RESTAURANT_ID = 'restaurant:development-restaurant';
  const BUILDING_ID = 'building:development-building';
  const STREET_ID = 'street:development-street';
  const DEV_PLAYER_ID = 'agent:dev-player';
  const DEV_NPC_ID = 'agent:dev-npc';

  function setupWorld(time: string = ACTIVE_SHIFT_TIME): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(time);
    const state = createInitialWorldState(clock);

    // Open development restaurant
    const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
    rest.operationalState = 'open';

    // Dev NPC is active and working at restaurant
    const npc = state.agents.find((a) => a.id === DEV_NPC_ID)!;
    npc.locationId = RESTAURANT_ID;
    npc.activityState = 'active';

    // Player inside restaurant
    const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
    player.locationId = RESTAURANT_ID;

    // Publish Pan Dulce offering (Milestone 47 / Milestone 23 opportunity)
    makeDevelopmentOfferingAvailable(state, DEV_NPC_ID, RESTAURANT_ID);

    return { clock, state };
  }

  // =========================================================================
  // Group 1: Core Consideration Evaluator Rules
  // =========================================================================
  describe('Group 1: Core Consideration Evaluator Rules', () => {
    test('1. positive consideration when Pan Dulce is actively available and player is inside restaurant', () => {
      const { state } = setupWorld();

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      assert.equal(consideration.considered, true);
      assert.equal(consideration.action, 'purchaseOffering');
      assert.equal(consideration.targetId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(consideration.reason, 'active-opportunity');
      assert.equal(
        consideration.description,
        'Development NPC made fresh Pan Dulce available at the restaurant.'
      );
    });

    test('2. no consideration when the offering is absent / retired from state.offerings', () => {
      const { state } = setupWorld();
      retireDevelopmentOffering(state, DEV_NPC_ID, RESTAURANT_ID);

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      assert.equal(consideration.considered, false);
      assert.equal(consideration.action, 'purchaseOffering');
      assert.equal(consideration.targetId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(consideration.reason, undefined);
    });

    test('3. no consideration when the restaurant is closed', () => {
      const { state } = setupWorld();
      const rest = state.restaurants.find((r) => r.id === RESTAURANT_ID)!;
      rest.operationalState = 'closed';

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      assert.equal(consideration.considered, false);
      assert.equal(consideration.action, 'purchaseOffering');
    });

    test('4. no consideration when player is outside the restaurant (at building lobby)', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.locationId = BUILDING_ID; // scope restriction: restaurant only

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      assert.equal(consideration.considered, false);
    });

    test('5. no consideration when player is on the street', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.locationId = STREET_ID;

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      assert.equal(consideration.considered, false);
    });

    test('6. no consideration for an unrelated / non-target offering (coffee)', () => {
      const { state } = setupWorld();

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        'offering:development-coffee'
      );

      assert.equal(consideration.considered, false);
      assert.equal(consideration.targetId, 'offering:development-coffee');
    });

    test('7. no consideration when NPC is not co-located at the restaurant', () => {
      const { state } = setupWorld();
      const npc = state.agents.find((a) => a.id === DEV_NPC_ID)!;
      npc.locationId = 'building:development-residence';

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      assert.equal(consideration.considered, false);
    });

    test('8. no consideration when NPC is idle', () => {
      const { state } = setupWorld();
      const npc = state.agents.find((a) => a.id === DEV_NPC_ID)!;
      npc.activityState = 'idle';

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      assert.equal(consideration.considered, false);
    });

    test('9. returns considered: false when player does not exist or is NPC', () => {
      const { state } = setupWorld();

      const missing = evaluateOpportunityInformedCommercialConsideration(
        state,
        'agent:ghost-player',
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );
      assert.equal(missing.considered, false);

      const npcCaller = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_NPC_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );
      assert.equal(npcCaller.considered, false);
    });

    test('10. returns considered: false when restaurant does not exist', () => {
      const { state } = setupWorld();

      const nonExistent = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        'restaurant:non-existent',
        DEVELOPMENT_PASTRY_OFFERING_ID
      );
      assert.equal(nonExistent.considered, false);
    });
  });

  // =========================================================================
  // Group 2: Epistemic & Authority Independence (CONSIDERATION != AUTHORIZATION)
  // =========================================================================
  describe('Group 2: Epistemic & Authority Independence (CONSIDERATION != AUTHORIZATION)', () => {
    test('11. consideration remains true when player has sufficient funds', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.balanceMinor = 2000; // $20.00

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      assert.equal(consideration.considered, true);
    });

    test('12. consideration remains true when player has insufficient funds ($0.00)', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.balanceMinor = 0; // $0.00 (< $2.50 price)

      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      // CONSIDERATION != AUTHORIZATION: consideration is still derived!
      assert.equal(consideration.considered, true);
      assert.equal(consideration.action, 'purchaseOffering');
      assert.equal(consideration.targetId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(consideration.reason, 'active-opportunity');
    });

    test('13. purchaseOffering() independently rejects the insufficient-funds case', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.balanceMinor = 0;

      // Consideration is true
      const consideration = evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );
      assert.equal(consideration.considered, true);

      // Domain authority independently rejects with insufficient-funds
      const purchaseResult = purchaseOffering(
        state,
        DEV_PLAYER_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID,
        RESTAURANT_ID,
        { silent: true }
      );

      assert.equal(purchaseResult.success, false);
      assert.equal(purchaseResult.code, 'insufficient-funds');
      assert.equal(state.purchases.length, 0);
      assert.equal(player.balanceMinor, 0);
    });

    test('14. purchaseOffering() succeeds when player has sufficient balance', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.balanceMinor = 2000;

      const purchaseResult = purchaseOffering(
        state,
        DEV_PLAYER_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID,
        RESTAURANT_ID,
        { silent: true }
      );

      assert.equal(purchaseResult.success, true);
      assert.equal(purchaseResult.code, 'success');
      assert.equal(player.balanceMinor, 1750); // 2000 - 250
      assert.equal(state.purchases.length, 1);
      assert.equal(state.items.length, 1);
      assert.equal(state.items[0].offeringId, DEVELOPMENT_PASTRY_OFFERING_ID);
    });

    test('15. strongest separation test: same world + same player + same opportunity + different balance -> same consideration -> different authorization result', () => {
      // World A: Player has $20.00
      const { state: stateA } = setupWorld();
      stateA.agents.find((a) => a.id === DEV_PLAYER_ID)!.balanceMinor = 2000;

      // World B: Player has $0.00 (identical otherwise)
      const { state: stateB } = setupWorld();
      stateB.agents.find((a) => a.id === DEV_PLAYER_ID)!.balanceMinor = 0;

      // Consideration derived in World A
      const considerationA = evaluateOpportunityInformedCommercialConsideration(
        stateA,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      // Consideration derived in World B
      const considerationB = evaluateOpportunityInformedCommercialConsideration(
        stateB,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      // Both considerations are identical
      assert.equal(considerationA.considered, true);
      assert.equal(considerationB.considered, true);
      assert.deepEqual(considerationA, considerationB);

      // Domain execution differs strictly based on economic authorization
      const resultA = purchaseOffering(
        stateA,
        DEV_PLAYER_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID,
        RESTAURANT_ID,
        { silent: true }
      );
      const resultB = purchaseOffering(
        stateB,
        DEV_PLAYER_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID,
        RESTAURANT_ID,
        { silent: true }
      );

      assert.equal(resultA.success, true);
      assert.equal(resultB.success, false);
      assert.equal(resultB.code, 'insufficient-funds');
    });

    test('16. consideration evaluation causes zero state mutation', () => {
      const { state } = setupWorld();
      const beforeSnapshot = JSON.stringify(state);

      evaluateOpportunityInformedCommercialConsideration(
        state,
        DEV_PLAYER_ID,
        RESTAURANT_ID,
        DEVELOPMENT_PASTRY_OFFERING_ID
      );

      const afterSnapshot = JSON.stringify(state);
      assert.equal(beforeSnapshot, afterSnapshot);
      assert.equal(state.purchases.length, 0);
      assert.equal(state.items.length, 0);
    });

    test('17. existing purchases without a consideration remain valid', () => {
      const { state } = setupWorld();
      // Purchase Coffee (which has no consideration)
      const purchaseCoffee = purchaseOffering(
        state,
        DEV_PLAYER_ID,
        'offering:development-coffee',
        RESTAURANT_ID,
        { silent: true }
      );

      assert.equal(purchaseCoffee.success, true);
      assert.equal(state.purchases.length, 1);
      assert.equal(state.purchases[0].offeringId, 'offering:development-coffee');
    });
  });

  // =========================================================================
  // Group 3: Perception & Client Projections Integration
  // =========================================================================
  describe('Group 3: Perception & Client Projections Integration', () => {
    test('18. inspectCurrentLocation attaches commercial actionConsiderations when player is inside restaurant', () => {
      const { state } = setupWorld();

      const result = inspectCurrentLocation(state, DEV_PLAYER_ID);

      assert.equal(result.success, true);
      assert.ok(Array.isArray(result.actionConsiderations));
      assert.equal(result.actionConsiderations.length, 1);

      const consideration = result.actionConsiderations[0];
      assert.equal(consideration.action, 'purchaseOffering');
      assert.equal(consideration.targetId, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.equal(consideration.considered, true);
      assert.equal(consideration.reason, 'active-opportunity');
      assert.equal(
        consideration.description,
        'Development NPC made fresh Pan Dulce available at the restaurant.'
      );

      assert.ok(result.location?.actionConsiderations);
      assert.deepEqual(result.location.actionConsiderations, result.actionConsiderations);
    });

    test('19. inspectCurrentLocation does NOT attach commercial consideration when player is at building lobby', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.locationId = BUILDING_ID; // In building lobby

      const result = inspectCurrentLocation(state, DEV_PLAYER_ID);

      assert.equal(result.success, true);
      // Building lobby does not contain commercial purchase consideration
      const commercialConsideration = result.actionConsiderations?.find(
        (c) => c.action === 'purchaseOffering'
      );
      assert.equal(commercialConsideration, undefined);
    });

    test('20. inspectCurrentLocation does NOT attach commercial consideration when Pan Dulce is retired', () => {
      const { state } = setupWorld();
      retireDevelopmentOffering(state, DEV_NPC_ID, RESTAURANT_ID);

      const result = inspectCurrentLocation(state, DEV_PLAYER_ID);

      assert.equal(result.success, true);
      const commercialConsideration = result.actionConsiderations?.find(
        (c) => c.action === 'purchaseOffering'
      );
      assert.equal(commercialConsideration, undefined);
    });

    test('21. createPresentationModel maps commercial consideration to affordance hint on Buy Pan Dulce', () => {
      const { state } = setupWorld();
      const inspectResult = inspectCurrentLocation(state, DEV_PLAYER_ID);

      const statusData = {
        worldId: state.worldId,
        worldTime: state.worldTime,
        schemaVersion: state.version,
        activePlayerId: DEV_PLAYER_ID,
      };

      const model = createPresentationModel(statusData, inspectResult as any);

      assert.equal(model.context, 'RESTAURANT');

      // Buy Pan Dulce affordance must have matching hint
      const pastryAffordance = model.affordances.find(
        (a) => a.commandName === 'purchaseOffering' && a.payload.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
      );
      assert.ok(pastryAffordance);
      assert.equal(
        pastryAffordance.hint,
        'Development NPC made fresh Pan Dulce available at the restaurant.'
      );
    });

    test('22. createPresentationModel does NOT set hint on Buy Coffee', () => {
      const { state } = setupWorld();
      const inspectResult = inspectCurrentLocation(state, DEV_PLAYER_ID);

      const statusData = {
        worldId: state.worldId,
        worldTime: state.worldTime,
        schemaVersion: state.version,
        activePlayerId: DEV_PLAYER_ID,
      };

      const model = createPresentationModel(statusData, inspectResult as any);

      const coffeeAffordance = model.affordances.find(
        (a) => a.commandName === 'purchaseOffering' && a.payload.offeringId === 'offering:development-coffee'
      );
      assert.ok(coffeeAffordance);
      assert.equal(coffeeAffordance.hint, undefined);
    });

    test('23. findInspectableEntity exposes Consideration when inspecting Pan Dulce offering', () => {
      const { state } = setupWorld();
      const inspectResult = inspectCurrentLocation(state, DEV_PLAYER_ID);

      const statusData = {
        worldId: state.worldId,
        worldTime: state.worldTime,
        schemaVersion: state.version,
        activePlayerId: DEV_PLAYER_ID,
      };

      const model = createPresentationModel(statusData, inspectResult as any);

      const pastryEntity = findInspectableEntity(model, DEVELOPMENT_PASTRY_OFFERING_ID);
      assert.ok(pastryEntity);
      assert.equal(pastryEntity.kind, 'offering');
      assert.equal(pastryEntity.name, 'Pan Dulce');
      assert.equal(
        pastryEntity.details.Consideration,
        'Development NPC made fresh Pan Dulce available at the restaurant.'
      );
    });

    test('24. findInspectableEntity does NOT expose Consideration when inspecting Coffee offering', () => {
      const { state } = setupWorld();
      const inspectResult = inspectCurrentLocation(state, DEV_PLAYER_ID);

      const statusData = {
        worldId: state.worldId,
        worldTime: state.worldTime,
        schemaVersion: state.version,
        activePlayerId: DEV_PLAYER_ID,
      };

      const model = createPresentationModel(statusData, inspectResult as any);

      const coffeeEntity = findInspectableEntity(model, 'offering:development-coffee');
      assert.ok(coffeeEntity);
      assert.equal(coffeeEntity.kind, 'offering');
      assert.equal(coffeeEntity.details.Consideration, undefined);
    });
  });

  // =========================================================================
  // Group 4: Idempotency, Persistence & Invariant Preservation
  // =========================================================================
  describe('Group 4: Idempotency, Persistence & Invariant Preservation', () => {
    test('25. repeated inspection is strictly idempotent', () => {
      const { state } = setupWorld();

      const r1 = inspectCurrentLocation(state, DEV_PLAYER_ID);
      const r2 = inspectCurrentLocation(state, DEV_PLAYER_ID);
      const r3 = inspectCurrentLocation(state, DEV_PLAYER_ID);

      assert.deepEqual(r1.actionConsiderations, r2.actionConsiderations);
      assert.deepEqual(r2.actionConsiderations, r3.actionConsiderations);
    });

    test('26. clean persistence and reload preserves schema v16 and re-derives consideration dynamically', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'm49-test-'));
      const stateFile = join(tmpDir, 'world-state.json');

      try {
        const { state } = setupWorld();

        // Validate schema is strictly v18 before saving
        validateWorldState(state);
        assert.equal(state.version, 18);
        assert.equal((state as any).considerations, undefined);

        // Save to disk
        const persistence = new LocalFilePersistence(stateFile);
        persistence.save(state);

        // Load fresh from disk
        const reloadedState = persistence.load();
        validateWorldState(reloadedState);
        assert.equal(reloadedState.version, 18);
        assert.equal((reloadedState as any).considerations, undefined);

        // Consideration re-derived dynamically from reloaded state
        const inspection = inspectCurrentLocation(reloadedState, DEV_PLAYER_ID);
        assert.ok(inspection.actionConsiderations);
        assert.equal(inspection.actionConsiderations[0].action, 'purchaseOffering');
        assert.equal(
          inspection.actionConsiderations[0].description,
          'Development NPC made fresh Pan Dulce available at the restaurant.'
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('27. consideration disappears when underlying opportunity is retired', () => {
      const { state } = setupWorld();

      // Initially active
      const beforeRetire = inspectCurrentLocation(state, DEV_PLAYER_ID);
      assert.equal(beforeRetire.actionConsiderations?.length, 1);

      // Retire Pan Dulce
      retireDevelopmentOffering(state, DEV_NPC_ID, RESTAURANT_ID);

      // Immediately disappears
      const afterRetire = inspectCurrentLocation(state, DEV_PLAYER_ID);
      const commercialConsideration = afterRetire.actionConsiderations?.find(
        (c) => c.action === 'purchaseOffering'
      );
      assert.equal(commercialConsideration, undefined);
    });

    test('28. existing M48 schedule-informed restaurant consideration remains functional and unchanged', () => {
      const { state } = setupWorld();

      // Move player back to building lobby
      const player = state.agents.find((a) => a.id === DEV_PLAYER_ID)!;
      player.locationId = BUILDING_ID;

      // Add schedule knowledge for dev-npc
      const scheduleRecord: AgentKnowledgeRecord = {
        id: 'knowledge:schedule:m49-check',
        agentId: DEV_PLAYER_ID,
        factType: 'agent-schedule',
        subjectId: DEV_NPC_ID,
        payload: {
          workplaceId: RESTAURANT_ID,
          shiftStart: '09:00',
          shiftEnd: '17:00',
        },
        acquiredAt: '2026-09-23T08:30:00.000Z',
        lastVerifiedAt: '2026-09-23T08:30:00.000Z',
        source: 'social-inquiry',
        sourceAgentId: DEV_NPC_ID,
      };
      state.knowledge.push(scheduleRecord);

      // M48 consideration evaluated
      const m48Consideration = evaluateScheduleInformedRestaurantConsideration(state, DEV_PLAYER_ID);
      assert.equal(m48Consideration.considered, true);
      assert.equal(m48Consideration.action, 'enterRestaurant');
      assert.equal(m48Consideration.reason, 'known-npc-schedule');

      // Perception at building lobby returns M48 consideration
      const buildingInspection = inspectCurrentLocation(state, DEV_PLAYER_ID);
      assert.ok(buildingInspection.actionConsiderations);
      assert.equal(buildingInspection.actionConsiderations[0].action, 'enterRestaurant');
    });
  });
});
