import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  introduceToAgent,
  inquireAgentSchedule,
  inspectPlayerKnowledge,
  AgentKnowledgeRecord,
  WorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 35: Authoritative Knowledge Acquisition & Epistemic Retention', () => {
  const MORNING_TIME = '2026-09-14T08:00:00.000Z';

  function setupWorldAt(timeIso: string = MORNING_TIME) {
    const clock = WorldClock.create(timeIso);
    const state = createInitialWorldState(clock);
    const sim = new Simulation(clock, state, { silent: true });
    return { clock, state, sim };
  }

  function setupAcquaintedWorldAt(timeIso: string = MORNING_TIME) {
    const world = setupWorldAt(timeIso);
    const player = world.state.agents.find((a) => a.id === 'agent:dev-player')!;
    const npc = world.state.agents.find((a) => a.id === 'agent:dev-npc')!;
    npc.locationId = player.locationId;
    // Introduce player and NPC at building
    introduceToAgent(world.state, 'agent:dev-player', 'agent:dev-npc');
    return world;
  }

  // =========================================================================
  // 1. Preconditions & Negative Paths: Zero Knowledge Mutation
  // =========================================================================
  describe('1. Preconditions & Negative Paths', () => {
    test('rejects when player does not exist (player-not-found) with zero knowledge records', () => {
      const { state } = setupWorldAt();
      const initialKnowledge = structuredClone(state.knowledge);

      const result = inquireAgentSchedule(state, 'agent:non-existent', 'agent:dev-npc');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'player-not-found');
      assert.strictEqual(result.knowledgeRecord, undefined);
      assert.deepStrictEqual(state.knowledge, initialKnowledge);
      assert.strictEqual(state.knowledge.length, 0);
    });

    test('rejects when caller is an NPC (player-not-player) with zero knowledge records', () => {
      const { state } = setupWorldAt();
      const initialKnowledge = structuredClone(state.knowledge);

      const result = inquireAgentSchedule(state, 'agent:dev-npc', 'agent:dev-player');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'player-not-player');
      assert.strictEqual(result.knowledgeRecord, undefined);
      assert.deepStrictEqual(state.knowledge, initialKnowledge);
      assert.strictEqual(state.knowledge.length, 0);
    });

    test('rejects when target NPC does not exist (npc-not-found) with zero knowledge records', () => {
      const { state } = setupWorldAt();
      const initialKnowledge = structuredClone(state.knowledge);

      const result = inquireAgentSchedule(state, 'agent:dev-player', 'agent:ghost-npc');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'npc-not-found');
      assert.strictEqual(result.knowledgeRecord, undefined);
      assert.deepStrictEqual(state.knowledge, initialKnowledge);
      assert.strictEqual(state.knowledge.length, 0);
    });

    test('rejects when target is not an NPC (target-not-npc) with zero knowledge records', () => {
      const { state } = setupWorldAt();
      // Add second player
      state.agents.push({
        id: 'agent:player-two',
        type: 'agent',
        name: 'Player Two',
        agentType: 'player',
        activityState: 'idle',
        activitySince: state.worldTime,
        locationId: 'building:development-building',
        balanceMinor: 1000,
        currency: 'USD',
      });

      const initialKnowledge = structuredClone(state.knowledge);
      const result = inquireAgentSchedule(state, 'agent:dev-player', 'agent:player-two');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'target-not-npc');
      assert.strictEqual(result.knowledgeRecord, undefined);
      assert.deepStrictEqual(state.knowledge, initialKnowledge);
      assert.strictEqual(state.knowledge.length, 0);
    });

    test('rejects when agents are not co-located (agents-not-co-located) with zero knowledge records', () => {
      const { state } = setupWorldAt();
      // Player is at building:development-building, NPC is at building:development-residence initially
      const initialKnowledge = structuredClone(state.knowledge);

      const result = inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'agents-not-co-located');
      assert.strictEqual(result.knowledgeRecord, undefined);
      assert.deepStrictEqual(state.knowledge, initialKnowledge);
      assert.strictEqual(state.knowledge.length, 0);
    });

    test('rejects when agents are co-located but not acquainted (not-acquainted) with zero knowledge records', () => {
      const { state } = setupWorldAt();
      // Move NPC to player's location without introducing
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.locationId = 'building:development-building';

      const initialKnowledge = structuredClone(state.knowledge);
      const result = inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'not-acquainted');
      assert.strictEqual(result.knowledgeRecord, undefined);
      assert.deepStrictEqual(state.knowledge, initialKnowledge);
      assert.strictEqual(state.knowledge.length, 0);
    });

    test('rejects when target NPC has no scheduled routine (no-scheduled-work) with zero knowledge records', () => {
      const { state } = setupWorldAt();
      // Create second NPC with no scheduled routine
      state.agents.push({
        id: 'agent:idle-npc',
        type: 'agent',
        name: 'Idle NPC',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: state.worldTime,
        locationId: 'building:development-building',
        balanceMinor: 0,
        currency: 'USD',
      });
      introduceToAgent(state, 'agent:dev-player', 'agent:idle-npc');

      const initialKnowledge = structuredClone(state.knowledge);
      const result = inquireAgentSchedule(state, 'agent:dev-player', 'agent:idle-npc');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'no-scheduled-work');
      assert.strictEqual(result.knowledgeRecord, undefined);
      assert.deepStrictEqual(state.knowledge, initialKnowledge);
      assert.strictEqual(state.knowledge.length, 0);
    });
  });

  // =========================================================================
  // 2. Successful Knowledge Acquisition: Single-Record Upsert
  // =========================================================================
  describe('2. Initial Knowledge Acquisition Record Creation', () => {
    test('creates exactly one AgentKnowledgeRecord with all required fields upon successful inquiry', () => {
      const { state } = setupAcquaintedWorldAt();
      assert.strictEqual(state.knowledge.length, 0);

      const result = inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.code, 'success');
      assert.ok(result.schedule);
      assert.ok(result.knowledgeRecord);

      // Verifying state.knowledge
      assert.strictEqual(state.knowledge.length, 1);
      const record = state.knowledge[0];

      // Exact structure and foreign key assertions
      assert.strictEqual(record.id, 'knowledge:1');
      assert.strictEqual(record.agentId, 'agent:dev-player');
      assert.strictEqual(record.factType, 'agent-schedule');
      assert.strictEqual(record.subjectId, 'agent:dev-npc');
      assert.strictEqual(record.source, 'social-inquiry');
      assert.strictEqual(record.sourceAgentId, 'agent:dev-npc');
      assert.strictEqual(record.acquiredAt, state.worldTime);
      assert.strictEqual(record.lastVerifiedAt, state.worldTime);

      // Payload assertions
      assert.strictEqual(record.payload.workplaceId, 'restaurant:development-restaurant');
      assert.strictEqual(record.payload.shiftStart, '09:00');
      assert.strictEqual(record.payload.shiftEnd, '17:00');

      // Returned record matches persisted record
      assert.deepStrictEqual(result.knowledgeRecord, record);

      // State validates successfully
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 3. Epistemic Re-Acquisition / Update (Single-Record Upsert)
  // =========================================================================
  describe('3. Single-Record Upsert Invariant on Re-Acquisition', () => {
    test('preserves record ID and acquiredAt, and updates lastVerifiedAt and payload when re-inquired', () => {
      const { clock, state } = setupAcquaintedWorldAt('2026-09-14T08:00:00.000Z');
      const t0 = state.worldTime;

      // Initial inquiry at 08:00
      const firstResult = inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');
      assert.strictEqual(firstResult.success, true);
      assert.strictEqual(state.knowledge.length, 1);
      const recordBefore = { ...state.knowledge[0] };
      assert.strictEqual(recordBefore.acquiredAt, t0);
      assert.strictEqual(recordBefore.lastVerifiedAt, t0);

      // Advance clock by 30 minutes to 08:30
      clock.advance(30 * 60_000);
      state.worldTime = clock.getTime();
      const t1 = state.worldTime;
      assert.strictEqual(t1, '2026-09-14T08:30:00.000Z');

      // Second inquiry at 08:30
      const secondResult = inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');
      assert.strictEqual(secondResult.success, true);

      // Verifying strict single-record upsert
      assert.strictEqual(state.knowledge.length, 1, 'Knowledge collection must NOT grow on repeated inquiry of same fact');
      const recordAfter = state.knowledge[0];

      assert.strictEqual(recordAfter.id, recordBefore.id, 'Record ID must remain stable across updates');
      assert.strictEqual(recordAfter.agentId, 'agent:dev-player');
      assert.strictEqual(recordAfter.factType, 'agent-schedule');
      assert.strictEqual(recordAfter.subjectId, 'agent:dev-npc');
      assert.strictEqual(recordAfter.source, 'social-inquiry');
      assert.strictEqual(recordAfter.sourceAgentId, 'agent:dev-npc');
      assert.strictEqual(recordAfter.acquiredAt, t0, 'acquiredAt must be preserved from initial acquisition');
      assert.strictEqual(recordAfter.lastVerifiedAt, t1, 'lastVerifiedAt must be updated to current inquiry time');

      // State validates successfully
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 4. Epistemic Privacy & Knower Isolation
  // =========================================================================
  describe('4. Epistemic Privacy & Knower Isolation', () => {
    test('inspectPlayerKnowledge returns only records belonging to the requesting player', () => {
      const { state } = setupAcquaintedWorldAt();

      // Dev player acquires schedule knowledge
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');
      assert.strictEqual(state.knowledge.length, 1);

      // Add a second player
      state.agents.push({
        id: 'agent:player-two',
        type: 'agent',
        name: 'Player Two',
        agentType: 'player',
        activityState: 'idle',
        activitySince: state.worldTime,
        locationId: 'building:development-building',
        balanceMinor: 1000,
        currency: 'USD',
      });

      // Player One inspects their knowledge
      const knowledgeOne = inspectPlayerKnowledge(state, 'agent:dev-player');
      assert.strictEqual(knowledgeOne.success, true);
      assert.strictEqual(knowledgeOne.knowledge?.length, 1);
      assert.strictEqual(knowledgeOne.knowledge![0].agentId, 'agent:dev-player');

      // Player Two inspects their knowledge -> strictly isolated, sees 0 records
      const knowledgeTwo = inspectPlayerKnowledge(state, 'agent:player-two');
      assert.strictEqual(knowledgeTwo.success, true);
      assert.strictEqual(knowledgeTwo.knowledge?.length, 0);
    });

    test('inspectPlayerKnowledge returns deep/defensive copies that prevent state corruption', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      const inspection = inspectPlayerKnowledge(state, 'agent:dev-player');
      assert.strictEqual(inspection.success, true);
      assert.strictEqual(inspection.knowledge?.length, 1);

      // Mutate returned array and record
      inspection.knowledge!.push({} as any);
      inspection.knowledge![0].payload.shiftStart = '99:99';

      // Verify state.knowledge is not corrupted
      assert.strictEqual(state.knowledge.length, 1);
      assert.strictEqual(state.knowledge[0].payload.shiftStart, '09:00');
    });

    test('inspectPlayerKnowledge rejects non-existent player with player-not-found', () => {
      const { state } = setupWorldAt();
      const result = inspectPlayerKnowledge(state, 'agent:ghost');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'player-not-found');
      assert.strictEqual(result.knowledge, undefined);
    });

    test('inspectPlayerKnowledge rejects NPC caller with player-not-player', () => {
      const { state } = setupWorldAt();
      const result = inspectPlayerKnowledge(state, 'agent:dev-npc');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.code, 'player-not-player');
      assert.strictEqual(result.knowledge, undefined);
    });
  });

  // =========================================================================
  // 5. Epistemic Divergence from World Truth
  // =========================================================================
  describe('5. Epistemic Divergence from World Truth', () => {
    test('knowledge does NOT automatically synchronize when world truth changes', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      // Acquired knowledge reflects initial schedule
      const initialRecord = state.knowledge[0];
      assert.strictEqual(initialRecord.payload.workplaceId, 'restaurant:development-restaurant');
      assert.strictEqual(initialRecord.payload.shiftStart, '09:00');
      assert.strictEqual(initialRecord.payload.shiftEnd, '17:00');

      // Stored knowledge continues to reflect what was told, independent of later world events
      assert.strictEqual(state.knowledge[0].payload.shiftStart, '09:00');
      assert.strictEqual(state.knowledge[0].lastVerifiedAt, state.worldTime);
    });
  });

  // =========================================================================
  // 6. Persistence & Cold-Start Reconstruction
  // =========================================================================
  describe('6. Persistence Roundtrip & Cold-Start Reconstruction', () => {
    test('acquired knowledge survives save/load and permits seamless epistemic updates in fresh runtime', async () => {
      const testFile = join(tmpdir(), `test-knowledge-persist-${Date.now()}.json`);
      try {
        const { clock, state } = setupAcquaintedWorldAt('2026-09-14T08:00:00.000Z');
        const t0 = state.worldTime;

        // Session A: Acquire knowledge
        const inquiryA = inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');
        assert.strictEqual(inquiryA.success, true);
        assert.strictEqual(state.knowledge.length, 1);

        // Save session A
        const persistenceA = new LocalFilePersistence(testFile);
        persistenceA.save(snapshotWorldState(clock, state));

        // Session B: Fresh runtime load from disk
        const persistenceB = new LocalFilePersistence(testFile);
        const stateB = persistenceB.load();
        assert.ok(stateB !== null);
        assert.strictEqual(stateB.version, 19);
        assert.doesNotThrow(() => validateWorldState(stateB));

        // Verify restored knowledge
        assert.strictEqual(stateB.knowledge.length, 1);
        const restoredRecord = stateB.knowledge[0];
        assert.strictEqual(restoredRecord.id, 'knowledge:1');
        assert.strictEqual(restoredRecord.agentId, 'agent:dev-player');
        assert.strictEqual(restoredRecord.acquiredAt, t0);
        assert.strictEqual(restoredRecord.lastVerifiedAt, t0);

        // Session B: Advance clock and re-inquire
        const clockB = WorldClock.create(stateB.worldTime);
        clockB.advance(45 * 60_000);
        stateB.worldTime = clockB.getTime();
        const t1 = stateB.worldTime;

        const inquiryB = inquireAgentSchedule(stateB, 'agent:dev-player', 'agent:dev-npc');
        assert.strictEqual(inquiryB.success, true);
        assert.strictEqual(stateB.knowledge.length, 1, 'Still exactly one record after re-inquiry in restored session');

        const updatedRecord = stateB.knowledge[0];
        assert.strictEqual(updatedRecord.id, 'knowledge:1');
        assert.strictEqual(updatedRecord.acquiredAt, t0, 'Original acquisition timestamp preserved across sessions');
        assert.strictEqual(updatedRecord.lastVerifiedAt, t1, 'lastVerifiedAt updated in fresh session');

        // Verify stateB still passes validation
        assert.doesNotThrow(() => validateWorldState(stateB));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });

  // =========================================================================
  // 7. Schema Validation Rules for Knowledge Records
  // =========================================================================
  describe('7. Schema Validation & Integrity Invariants', () => {
    test('validateWorldState rejects non-array knowledge property', () => {
      const { state } = setupWorldAt();
      const invalid = { ...state, knowledge: 'not-an-array' };
      assert.throws(() => validateWorldState(invalid as any), /knowledge must be an array/);
    });

    test('validateWorldState rejects knowledge record with non-string or malformed id', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      state.knowledge[0].id = 'invalid_id' as any;
      assert.throws(() => validateWorldState(state), /id must match format/);
    });

    test('validateWorldState rejects duplicate (agentId, factType, subjectId) records', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      // Forcefully push a duplicate composite key with a different ID
      const dupRecord: AgentKnowledgeRecord = {
        ...state.knowledge[0],
        id: 'knowledge:2',
      };
      state.knowledge.push(dupRecord);

      assert.throws(
        () => validateWorldState(state),
        /Duplicate knowledge fact found for agent/
      );
    });

    test('validateWorldState rejects knowledge record referencing non-existent knower agentId', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      state.knowledge[0].agentId = 'agent:ghost';
      assert.throws(() => validateWorldState(state), /references non-existent agent/);
    });

    test('validateWorldState rejects knowledge record referencing NPC as knower agentId', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      state.knowledge[0].agentId = 'agent:dev-npc';
      assert.throws(() => validateWorldState(state), /is not a player/);
    });

    test('validateWorldState rejects knowledge record referencing non-existent subjectId', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      state.knowledge[0].subjectId = 'agent:ghost';
      assert.throws(() => validateWorldState(state), /subjectId .* references non-existent agent/);
    });

    test('validateWorldState rejects knowledge record referencing player as subjectId', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      state.knowledge[0].subjectId = 'agent:dev-player';
      assert.throws(() => validateWorldState(state), /is not an NPC/);
    });

    test('validateWorldState rejects knowledge record referencing non-existent sourceAgentId', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      state.knowledge[0].sourceAgentId = 'agent:ghost';
      assert.throws(() => validateWorldState(state), /sourceAgentId .* references non-existent agent/);
    });

    test('validateWorldState rejects knowledge record when lastVerifiedAt is earlier than acquiredAt', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      state.knowledge[0].acquiredAt = '2026-09-14T09:00:00.000Z';
      state.knowledge[0].lastVerifiedAt = '2026-09-14T08:00:00.000Z';
      assert.throws(() => validateWorldState(state), /must be greater than or equal to acquiredAt/);
    });

    test('validateWorldState rejects invalid timestamp formats in knowledge record', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      state.knowledge[0].acquiredAt = 'invalid-date';
      assert.throws(() => validateWorldState(state), /acquiredAt must be a valid ISO-8601 timestamp string/);
    });

    test('validateWorldState rejects knowledge record with invalid schedule payload', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      (state.knowledge[0].payload as any).shiftStart = 'invalid-time';
      assert.throws(() => validateWorldState(state), /payload\.shiftStart must be a "HH:MM" string/);
    });

    test('validateWorldState rejects knowledge record with invalid workplaceId in payload', () => {
      const { state } = setupAcquaintedWorldAt();
      inquireAgentSchedule(state, 'agent:dev-player', 'agent:dev-npc');

      state.knowledge[0].payload.workplaceId = 'restaurant:ghost';
      assert.throws(() => validateWorldState(state), /references non-existent restaurant/);
    });
  });
});
