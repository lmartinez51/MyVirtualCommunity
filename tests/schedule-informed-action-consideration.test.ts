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
  enterRestaurant,
  inspectCurrentLocation,
  AgentKnowledgeRecord,
  WorldState,
} from '../src/core/world-state.js';
import {
  evaluateScheduleInformedRestaurantConsideration,
  ActionConsideration,
} from '../src/core/action-consideration.js';
import { createPresentationModel, findInspectableEntity } from '../src/client/projections.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 48: Schedule-Informed Action Consideration', () => {
  const MORNING_CLOSED_TIME = '2026-09-23T14:00:00.000Z'; // 08:00 local
  const SCHEDULE_START_TIME = '2026-09-23T15:00:00.000Z'; // 09:00 local
  const ACTIVE_MID_TIME = '2026-09-23T16:00:00.000Z'; // 10:00 local
  const SCHEDULE_END_MINUS_ONE_MS = '2026-09-23T22:59:59.999Z'; // 16:59:59.999 local
  const SCHEDULE_END_TIME = '2026-09-23T23:00:00.000Z'; // 17:00 local
  const BEFORE_START_TIME = '2026-09-23T14:59:59.999Z'; // 08:59:59.999 local

  function setupWorld(time: string = ACTIVE_MID_TIME): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(time);
    const state = createInitialWorldState(clock);
    return { clock, state };
  }

  function addScheduleKnowledge(
    state: WorldState,
    playerId: string = 'agent:dev-player',
    npcId: string = 'agent:dev-npc',
    shiftStart: string = '09:00',
    shiftEnd: string = '17:00'
  ): AgentKnowledgeRecord {
    const record: AgentKnowledgeRecord = {
      id: `knowledge:schedule:${playerId}:${npcId}`,
      agentId: playerId,
      factType: 'agent-schedule',
      subjectId: npcId,
      payload: {
        workplaceId: 'restaurant:development-restaurant',
        shiftStart,
        shiftEnd,
      },
      acquiredAt: '2026-09-23T08:30:00.000Z',
      lastVerifiedAt: '2026-09-23T08:30:00.000Z',
      source: 'social-inquiry',
      sourceAgentId: npcId,
    };
    state.knowledge.push(record);
    return record;
  }

  // =========================================================================
  // Group 1: Core Consideration Rules
  // =========================================================================
  describe('Group 1: Core Consideration Rules', () => {
    test('1. valid knowledge + valid time + correct location -> considered: true', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      // Player starts at building:development-building in seed
      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );

      assert.equal(consideration.considered, true);
      assert.equal(consideration.action, 'enterRestaurant');
      assert.equal(consideration.targetId, 'restaurant:development-restaurant');
      assert.equal(consideration.reason, 'known-npc-schedule');
      assert.equal(consideration.description, 'Development NPC is scheduled to work now.');
    });

    test('2. missing schedule knowledge -> considered: false', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      // No knowledge added

      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );

      assert.equal(consideration.considered, false);
      assert.equal(consideration.action, 'enterRestaurant');
      assert.equal(consideration.targetId, 'restaurant:development-restaurant');
      assert.equal(consideration.reason, undefined);
    });

    test('3. wrong time before schedule (08:59:59.999Z) -> considered: false', () => {
      const { state } = setupWorld(BEFORE_START_TIME);
      addScheduleKnowledge(state);

      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );

      assert.equal(consideration.considered, false);
    });

    test('4. exact schedule start (09:00:00.000Z) -> considered: true', () => {
      const { state } = setupWorld(SCHEDULE_START_TIME);
      addScheduleKnowledge(state);

      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );

      assert.equal(consideration.considered, true);
      assert.equal(consideration.reason, 'known-npc-schedule');
    });

    test('5. schedule middle (16:59:59.999Z) -> considered: true', () => {
      const { state } = setupWorld(SCHEDULE_END_MINUS_ONE_MS);
      addScheduleKnowledge(state);

      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );

      assert.equal(consideration.considered, true);
    });

    test('6. exact schedule end (17:00:00.000Z) -> considered: false', () => {
      const { state } = setupWorld(SCHEDULE_END_TIME);
      addScheduleKnowledge(state);

      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );

      assert.equal(consideration.considered, false);
    });

    test('7. wrong spatial location (player at street) -> considered: false', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      // Move player to street
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'street:development-street';

      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );

      assert.equal(consideration.considered, false);
    });

    test('8. already inside restaurant -> considered: false (no redundant entry consideration)', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      // Move player inside restaurant
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:development-restaurant';

      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );

      assert.equal(consideration.considered, false);
    });

    test('9. missing NPC entity -> considered: false safely', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player',
        'agent:non-existent-npc'
      );

      assert.equal(consideration.considered, false);
    });

    test('10. missing restaurant entity -> considered: false safely', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player',
        'agent:dev-npc',
        'restaurant:non-existent'
      );

      assert.equal(consideration.considered, false);
    });

    test('11. repeated evaluation produces ZERO state mutation', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      const before = JSON.stringify(state);
      evaluateScheduleInformedRestaurantConsideration(state, 'agent:dev-player');
      evaluateScheduleInformedRestaurantConsideration(state, 'agent:dev-player');
      evaluateScheduleInformedRestaurantConsideration(state, 'agent:dev-player');
      const after = JSON.stringify(state);

      assert.equal(before, after);
    });
  });

  // =========================================================================
  // Group 2: Epistemic Integrity & Presence Independence
  // =========================================================================
  describe('Group 2: Epistemic Meaning & Presence Independence', () => {
    test('12. Strongest Epistemic Test: Identical world state with two players at same building at 10:00 UTC', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);

      // Add Player B at the same building
      state.agents.push({
        id: 'agent:player-b',
        name: 'Player B',
        agentType: 'player',
        locationId: 'building:development-building',
        activityState: 'idle',
        activitySince: ACTIVE_MID_TIME,
        balanceMinor: 1000,
        currency: 'USD',
      });

      // Give schedule knowledge strictly to Player A (agent:dev-player)
      addScheduleKnowledge(state, 'agent:dev-player');

      const considerationA = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );
      const considerationB = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:player-b'
      );

      // Distinct epistemic outcome on identical physical world state!
      assert.equal(considerationA.considered, true);
      assert.equal(considerationA.reason, 'known-npc-schedule');
      assert.equal(considerationB.considered, false);
    });

    test('13. Presence Independence: SCHEDULE KNOWLEDGE != CURRENT NPC PRESENCE', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      // Move NPC away from restaurant to residence
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'building:development-residence';
      npc.activityState = 'idle';

      // Player still derives consideration from acquired schedule knowledge!
      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );

      assert.equal(consideration.considered, true);
      assert.equal(consideration.description, 'Development NPC is scheduled to work now.');
    });

    test('14. Consideration does NOT mutate or correct player knowledge', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      const knowledgeBefore = JSON.stringify(state.knowledge);
      evaluateScheduleInformedRestaurantConsideration(state, 'agent:dev-player');
      const knowledgeAfter = JSON.stringify(state.knowledge);

      assert.equal(knowledgeBefore, knowledgeAfter);
    });

    test('15. Consideration does NOT create knowledge, history records, or events', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      const knowledgeCountBefore = state.knowledge.length;
      const purchasesBefore = state.purchases?.length || 0;
      const activityRecordsBefore = state.activityRecords?.length || 0;

      evaluateScheduleInformedRestaurantConsideration(state, 'agent:dev-player');

      assert.equal(state.knowledge.length, knowledgeCountBefore);
      assert.equal(state.purchases?.length || 0, purchasesBefore);
      assert.equal(state.activityRecords?.length || 0, activityRecordsBefore);
    });
  });

  // =========================================================================
  // Group 3: Authority Independence
  // =========================================================================
  describe('Group 3: Authority Independence (ACTION CONSIDERATION != DOMAIN AUTHORIZATION)', () => {
    test('16. Rejection Independence: consideration = true, but authoritative enterRestaurant rejects when restaurant is closed', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      // Force restaurant closed (e.g. emergency closure or maintenance)
      const rest = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      rest.operationalState = 'closed';

      // 1. Consideration evaluates to true based on player's schedule knowledge
      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );
      assert.equal(consideration.considered, true);

      // 2. Authoritative enterRestaurant independently enforces domain preconditions and REJECTS
      const entryResult = enterRestaurant(
        state,
        'agent:dev-player',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(entryResult.success, false);
      assert.equal(entryResult.code, 'restaurant-closed');

      // 3. Player remains at building with zero state mutation
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'building:development-building');
    });

    test('17. No-Knowledge Regression: player without schedule knowledge enters successfully under existing authority', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      // Zero schedule knowledge in state

      // 1. Consideration evaluates to false
      const consideration = evaluateScheduleInformedRestaurantConsideration(
        state,
        'agent:dev-player'
      );
      assert.equal(consideration.considered, false);

      // 2. Authoritative enterRestaurant succeeds because restaurant is open and player is at building
      const entryResult = enterRestaurant(
        state,
        'agent:dev-player',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(entryResult.success, true);
      assert.equal(entryResult.code, 'success');

      // 3. Player location updated to restaurant
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'restaurant:development-restaurant');
    });

    test('18. Existing rejection preconditions remain intact regardless of consideration', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      // Rejection: already inside
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:development-restaurant';

      const entryResult = enterRestaurant(
        state,
        'agent:dev-player',
        'restaurant:development-restaurant',
        { silent: true }
      );

      assert.equal(entryResult.success, false);
      assert.equal(entryResult.code, 'already-inside');
    });
  });

  // =========================================================================
  // Group 4: Perception Projection & Client Model
  // =========================================================================
  describe('Group 4: Perception Projection & Client Model', () => {
    test('19. inspectCurrentLocation at building includes actionConsiderations when player has schedule knowledge', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      const inspection = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(inspection.success, true);
      assert.ok(inspection.actionConsiderations);
      assert.equal(inspection.actionConsiderations.length, 1);
      assert.equal(inspection.actionConsiderations[0].action, 'enterRestaurant');
      assert.equal(
        inspection.actionConsiderations[0].description,
        'Development NPC is scheduled to work now.'
      );
      assert.equal(inspection.location?.actionConsiderations?.length, 1);
    });

    test('20. inspectCurrentLocation at building omits actionConsiderations when player lacks knowledge', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      // No knowledge

      const inspection = inspectCurrentLocation(state, 'agent:dev-player');

      assert.equal(inspection.success, true);
      assert.equal(inspection.actionConsiderations, undefined);
      assert.equal(inspection.location?.actionConsiderations, undefined);
    });

    test('21. createPresentationModel populates affordance hint when consideration is present', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      const inspection = inspectCurrentLocation(state, 'agent:dev-player');
      const statusData = {
        worldId: state.worldId,
        worldTime: state.worldTime,
        schemaVersion: state.version,
        activePlayerId: 'agent:dev-player',
      };

      const model = createPresentationModel(statusData, inspection as unknown as Record<string, unknown>);

      const enterAffordance = model.affordances.find(
        (a) => a.commandName === 'enterRestaurant' && a.payload.restaurantId === 'restaurant:development-restaurant'
      );

      assert.ok(enterAffordance);
      assert.equal(enterAffordance.hint, 'Development NPC is scheduled to work now.');
    });

    test('22. createPresentationModel omits affordance hint when consideration is absent', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      // No knowledge

      const inspection = inspectCurrentLocation(state, 'agent:dev-player');
      const statusData = {
        worldId: state.worldId,
        worldTime: state.worldTime,
        schemaVersion: state.version,
        activePlayerId: 'agent:dev-player',
      };

      const model = createPresentationModel(statusData, inspection as unknown as Record<string, unknown>);

      const enterAffordance = model.affordances.find(
        (a) => a.commandName === 'enterRestaurant' && a.payload.restaurantId === 'restaurant:development-restaurant'
      );

      assert.ok(enterAffordance);
      assert.equal(enterAffordance.hint, undefined);
    });

    test('23. findInspectableEntity exposes Consideration in details when inspecting restaurant', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      const inspection = inspectCurrentLocation(state, 'agent:dev-player');
      const statusData = {
        worldId: state.worldId,
        worldTime: state.worldTime,
        schemaVersion: state.version,
        activePlayerId: 'agent:dev-player',
      };

      const model = createPresentationModel(statusData, inspection as unknown as Record<string, unknown>);
      const entity = findInspectableEntity(model, 'restaurant:development-restaurant');

      assert.ok(entity);
      assert.equal(entity.details['Consideration'], 'Development NPC is scheduled to work now.');
    });
  });

  // =========================================================================
  // Group 5: Persistence & Epistemic Derivation Across Reload
  // =========================================================================
  describe('Group 5: Persistence & Epistemic Derivation Across Reload', () => {
    test('24. Consideration itself is NOT persisted in WorldState JSON', () => {
      const { state } = setupWorld(ACTIVE_MID_TIME);
      addScheduleKnowledge(state);

      // Evaluate consideration
      evaluateScheduleInformedRestaurantConsideration(state, 'agent:dev-player');

      const serialized = JSON.stringify(state);
      const parsed = JSON.parse(serialized);

      // Verify no considerations collection exists on WorldState
      assert.equal((parsed as any).considerations, undefined);
      assert.equal((parsed as any).actionConsiderations, undefined);
      assert.equal(parsed.version, 19);
      assert.doesNotThrow(() => validateWorldState(parsed));
    });

    test('25. AgentKnowledgeRecord survives persistence save/load cleanly', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'm48-persistence-test-'));
      const testFile = join(tmpDir, 'world-state.json');
      const persistence = new LocalFilePersistence(testFile);

      try {
        const { state } = setupWorld(ACTIVE_MID_TIME);
        addScheduleKnowledge(state);

        await persistence.save(state);
        const reloaded = await persistence.load();

        assert.equal(reloaded.knowledge.length, 1);
        assert.equal(reloaded.knowledge[0].factType, 'agent-schedule');
        assert.equal(reloaded.knowledge[0].agentId, 'agent:dev-player');
        assert.equal(reloaded.knowledge[0].subjectId, 'agent:dev-npc');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('26. After reload from disk, consideration is dynamically recomputed', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'm48-reload-recompute-test-'));
      const testFile = join(tmpDir, 'world-state.json');
      const persistence = new LocalFilePersistence(testFile);

      try {
        const { state } = setupWorld(ACTIVE_MID_TIME);
        addScheduleKnowledge(state);

        await persistence.save(state);
        const reloaded = await persistence.load();

        // Recompute consideration from reloaded world state + reloaded knowledge
        const consideration = evaluateScheduleInformedRestaurantConsideration(
          reloaded,
          'agent:dev-player'
        );

        assert.equal(consideration.considered, true);
        assert.equal(consideration.description, 'Development NPC is scheduled to work now.');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
