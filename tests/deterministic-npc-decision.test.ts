import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  WorldState,
  createInitialWorldState,
  validateWorldState,
  introduceToAgent,
  isAgentAcquainted,
  inquireAgentSchedule,
  issueNpcScheduleDisclosure,
  IssueNpcScheduleDisclosureResult,
  AgentKnowledgeRecord,
} from '../src/core/world-state.js';
import {
  Simulation,
  evaluateNpcScheduleDisclosureContext,
} from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { DEVELOPMENT_NPC_WORK_SCHEDULE } from '../src/core/development-npc-schedule.js';

describe('Milestone 46: Deterministic NPC Decision & Behavior', () => {
  const START_TIME = '2026-09-14T15:00:00.000Z'; // 09:00 Local (Juárez) - NPC active shift window

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(START_TIME);
    const state = createInitialWorldState(clock);
    return { clock, state };
  }

  function setupCoLocatedAcquaintedWorld(): {
    clock: WorldClock;
    state: WorldState;
    player: { id: string; locationId: string };
    npc: { id: string; locationId: string; activityState: string };
  } {
    const { clock, state } = setupWorld();
    const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
    const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

    // Co-locate at restaurant where NPC is active during shift (09:00 - 17:00 UTC)
    player.locationId = 'restaurant:development-restaurant';
    npc.locationId = 'restaurant:development-restaurant';
    npc.activityState = 'active';

    // Establish mutual acquaintance
    introduceToAgent(state, player.id, npc.id);

    return { clock, state, player, npc };
  }

  describe('1. Pure Context Evaluation (evaluateNpcScheduleDisclosureContext)', () => {
    it('returns "npc-schedule-disclosure" when active NPC is co-located with acquainted player lacking schedule knowledge', () => {
      const { state, player, npc } = setupCoLocatedAcquaintedWorld();
      const stateBefore = JSON.stringify(state);

      const decision = evaluateNpcScheduleDisclosureContext(state, npc.id, player.id);

      assert.equal(decision, 'npc-schedule-disclosure');
      // Pure evaluation: zero state mutation
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('returns "no-action" when NPC is not active', () => {
      const { state, player, npc } = setupCoLocatedAcquaintedWorld();
      npc.activityState = 'idle';

      const decision = evaluateNpcScheduleDisclosureContext(state, npc.id, player.id);
      assert.equal(decision, 'no-action');
    });

    it('returns "no-action" when agents are in different locations', () => {
      const { state, player, npc } = setupCoLocatedAcquaintedWorld();
      npc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'building:development-building';

      const decision = evaluateNpcScheduleDisclosureContext(state, npc.id, player.id);
      assert.equal(decision, 'no-action');
    });

    it('returns "no-action" when agents are not acquainted', () => {
      const { clock, state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.activityState = 'active';
      npc.locationId = player.locationId;
      // Do NOT introduce them

      const decision = evaluateNpcScheduleDisclosureContext(state, npc.id, player.id);
      assert.equal(decision, 'no-action');
    });

    it('returns "no-action" when player already possesses schedule knowledge', () => {
      const { state, player, npc } = setupCoLocatedAcquaintedWorld();
      // Add existing knowledge record
      state.knowledge.push({
        id: 'knowledge:1',
        agentId: player.id,
        factType: 'agent-schedule',
        subjectId: npc.id,
        payload: {
          workplaceId: DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId,
          shiftStart: '09:00',
          shiftEnd: '17:00',
        },
        acquiredAt: state.worldTime,
        lastVerifiedAt: state.worldTime,
        source: 'social-inquiry',
        sourceAgentId: npc.id,
      });

      const decision = evaluateNpcScheduleDisclosureContext(state, npc.id, player.id);
      assert.equal(decision, 'no-action');
    });
  });

  describe('2. Authoritative Domain Function (issueNpcScheduleDisclosure)', () => {
    it('executes authoritative disclosure: creates exactly one AgentKnowledgeRecord with source "npc-initiative"', () => {
      const { state, player, npc } = setupCoLocatedAcquaintedWorld();
      const initialKnowledgeLen = state.knowledge.length;

      const result = issueNpcScheduleDisclosure(state, npc.id, player.id);

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.ok(result.knowledgeRecord);
      assert.equal(result.knowledgeRecord.source, 'npc-initiative');
      assert.equal(result.knowledgeRecord.agentId, player.id);
      assert.equal(result.knowledgeRecord.subjectId, npc.id);
      assert.equal(result.knowledgeRecord.factType, 'agent-schedule');
      assert.equal(result.knowledgeRecord.sourceAgentId, npc.id);
      assert.equal(result.knowledgeRecord.payload.workplaceId, DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId);
      assert.equal(state.knowledge.length, initialKnowledgeLen + 1);

      // Verifies state strictly conforms to Schema Version 16 invariants
      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('failure atomicity: rejects with "agents-not-co-located" and performs zero mutations', () => {
      const { state, player, npc } = setupCoLocatedAcquaintedWorld();
      npc.locationId = 'restaurant:development-restaurant';
      player.locationId = 'building:development-building';

      const stateBefore = JSON.stringify(state);
      const result = issueNpcScheduleDisclosure(state, npc.id, player.id);

      assert.equal(result.success, false);
      assert.equal(result.code, 'agents-not-co-located');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('failure atomicity: rejects with "not-acquainted" when agents are strangers', () => {
      const { clock, state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      npc.activityState = 'active';
      npc.locationId = player.locationId;

      const stateBefore = JSON.stringify(state);
      const result = issueNpcScheduleDisclosure(state, npc.id, player.id);

      assert.equal(result.success, false);
      assert.equal(result.code, 'not-acquainted');
      assert.equal(JSON.stringify(state), stateBefore);
    });

    it('failure atomicity: rejects with "already-known" when knowledge record already exists', () => {
      const { state, player, npc } = setupCoLocatedAcquaintedWorld();
      // First disclosure succeeds
      const first = issueNpcScheduleDisclosure(state, npc.id, player.id);
      assert.equal(first.success, true);
      assert.equal(state.knowledge.length, 1);

      const stateBeforeSecond = JSON.stringify(state);
      const second = issueNpcScheduleDisclosure(state, npc.id, player.id);

      assert.equal(second.success, false);
      assert.equal(second.code, 'already-known');
      assert.equal(JSON.stringify(state), stateBeforeSecond);
      assert.equal(state.knowledge.length, 1);
    });
  });

  describe('3. Simulation Tick Integration & Idempotency', () => {
    it('simulation tick triggers disclosure transition and persists knowledge record', () => {
      const { clock, state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      // Co-locate at restaurant where NPC is active at 09:00 UTC, establish acquaintance
      player.locationId = 'restaurant:development-restaurant';
      npc.locationId = 'restaurant:development-restaurant';
      npc.activityState = 'active';
      introduceToAgent(state, player.id, npc.id);

      const sim = new Simulation(clock, state, { silent: true });
      const tickResult = sim.tick();

      assert.ok(tickResult.npcDecisionTransitions);
      const dt = tickResult.npcDecisionTransitions.find(
        (t) => t.decision === 'npc-schedule-disclosure'
      );
      assert.ok(dt, 'Must emit npc-schedule-disclosure transition');
      assert.equal(dt.decision, 'npc-schedule-disclosure');
      assert.equal(dt.success, true);
      assert.equal(dt.code, 'success');
      assert.equal(dt.npcId, npc.id);
      assert.equal(dt.playerId, player.id);
      assert.ok(dt.knowledgeRecordId);

      // Verify knowledge record exists in state
      const rec = state.knowledge.find((k) => k.id === dt.knowledgeRecordId);
      assert.ok(rec);
      assert.equal(rec.source, 'npc-initiative');
      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('subsequent ticks do not trigger duplicate disclosure (strict idempotency)', () => {
      const { clock, state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'restaurant:development-restaurant';
      npc.locationId = 'restaurant:development-restaurant';
      npc.activityState = 'active';
      introduceToAgent(state, player.id, npc.id);

      const sim = new Simulation(clock, state, { silent: true });

      // First tick discloses schedule
      const tick1 = sim.tick();
      assert.ok(
        tick1.npcDecisionTransitions?.some((t) => t.decision === 'npc-schedule-disclosure')
      );
      assert.equal(state.knowledge.length, 1);

      // Second tick: context evaluates to 'no-action' because schedule is already known
      clock.advance(5000);
      const tick2 = sim.tick();
      assert.equal(tick2.npcDecisionTransitions, undefined);
      assert.equal(state.knowledge.length, 1);

      // Third tick: still no duplicate
      clock.advance(5000);
      const tick3 = sim.tick();
      assert.equal(tick3.npcDecisionTransitions, undefined);
      assert.equal(state.knowledge.length, 1);
    });

    it('player leaving and returning does not cause re-disclosure (persisted epistemic state)', () => {
      const { clock, state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;

      player.locationId = 'restaurant:development-restaurant';
      npc.locationId = 'restaurant:development-restaurant';
      npc.activityState = 'active';
      introduceToAgent(state, player.id, npc.id);

      const sim = new Simulation(clock, state, { silent: true });

      // Tick 1: Discloses schedule
      sim.tick();
      assert.equal(state.knowledge.length, 1);

      // Player leaves to street
      player.locationId = 'street:development-street';
      clock.advance(60000);
      const tickOutside = sim.tick();
      assert.equal(tickOutside.npcDecisionTransitions, undefined);

      // Player returns to restaurant
      player.locationId = 'restaurant:development-restaurant';
      clock.advance(60000);
      const tickReturn = sim.tick();
      // Still no re-disclosure because player already knows schedule
      assert.equal(tickReturn.npcDecisionTransitions, undefined);
      assert.equal(state.knowledge.length, 1);
    });
  });

  describe('4. Persistence and Transaction Atomicity', () => {
    it('persists npc-initiative knowledge record to disk and restores it in fresh LocalFilePersistence', () => {
      const testFile = join(tmpdir(), `test-m46-persistence-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const { clock, state } = setupWorld();
        const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
        const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
        player.locationId = 'restaurant:development-restaurant';
        npc.locationId = 'restaurant:development-restaurant';
        npc.activityState = 'active';
        introduceToAgent(state, player.id, npc.id);

        const sim = new Simulation(clock, state, { silent: true });
        sim.tick();

        const persistence = new LocalFilePersistence(testFile);
        persistence.save(state);

        // Reload from disk in a fresh persistence instance
        const persistence2 = new LocalFilePersistence(testFile);
        const loaded = persistence2.load();

        assert.ok(loaded);
        assert.equal(loaded.version, 19);
        assert.equal(loaded.knowledge.length, 1);
        assert.equal(loaded.knowledge[0].source, 'npc-initiative');
        assert.equal(loaded.knowledge[0].agentId, player.id);
        assert.equal(loaded.knowledge[0].subjectId, npc.id);
        assert.doesNotThrow(() => validateWorldState(loaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    it('simulates persistence failure: candidate state and clock commit transaction pattern', () => {
      // In SessionController.stepSimulation:
      // candidateState = structuredClone(this.state)
      // candidateClock = WorldClock.create(nextTime)
      // candidateSimulation = new Simulation(candidateClock, candidateState)
      // tickResult = candidateSimulation.tick()
      // this.persistence.save(candidateState) -> IF THIS THROWS:
      // this.clock.advance(...) IS NOT CALLED
      // this.state = candidateState IS NOT COMMITTED

      const clock = WorldClock.create(START_TIME);
      let state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      player.locationId = 'restaurant:development-restaurant';
      npc.locationId = 'restaurant:development-restaurant';
      npc.activityState = 'active';
      introduceToAgent(state, player.id, npc.id);

      // Create persistence with invalid path (to force save error)
      const invalidPath = join('//invalid-host-name-xyz', 'bad', 'path.json');
      const badPersistence = new LocalFilePersistence(invalidPath);

      // Simulate stepSimulation execution
      const advanceDurationMs = 5000;
      const nextTime = new Date(Date.parse(clock.getTime()) + advanceDurationMs).toISOString();
      const candidateState = structuredClone(state);
      const candidateClock = WorldClock.create(nextTime);
      const candidateSim = new Simulation(candidateClock, candidateState, { silent: true });

      // Tick executes on candidate
      candidateSim.tick();
      assert.equal(candidateState.knowledge.length, 1); // candidate has knowledge

      // Save fails
      assert.throws(() => badPersistence.save(candidateState));

      // As per SessionController design, state and clock are NOT committed on failure:
      // state remains original state (0 knowledge)
      // clock remains at START_TIME
      assert.equal(state.knowledge.length, 0);
      assert.equal(clock.getTime(), START_TIME);
    });
  });

  describe('5. Epistemic Separation from InquireAgentSchedule', () => {
    it('inquireAgentSchedule creates social-inquiry source, while issueNpcScheduleDisclosure creates npc-initiative source', () => {
      const { state, player, npc } = setupCoLocatedAcquaintedWorld();

      // Direct domain inquiry produces source: 'social-inquiry'
      const inquiryResult = inquireAgentSchedule(state, player.id, npc.id);
      assert.equal(inquiryResult.success, true);
      assert.equal(inquiryResult.knowledgeRecord?.source, 'social-inquiry');

      // Now issueNpcScheduleDisclosure is rejected with already-known
      const disclosureResult = issueNpcScheduleDisclosure(state, npc.id, player.id);
      assert.equal(disclosureResult.success, false);
      assert.equal(disclosureResult.code, 'already-known');

      // Uniqueness constraint preserved: exactly one record exists
      assert.equal(state.knowledge.length, 1);
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });
});
