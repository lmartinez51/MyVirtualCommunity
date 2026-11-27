/**
 * Experiential learning v1: outcome ledger + lessons (Camila's notebook).
 *
 * Validates:
 * 1. The runtime records one ledger entry per Camila cycle that reaches a
 *    terminal decision (executed / rejected / invalid_proposal /
 *    provider_failed); waiting-for-traversal noop cycles are never recorded.
 * 2. Unity interaction reports (applied / failed) are recorded as separate
 *    ledger events on top of the dispatch outcome.
 * 3. A v1 notebook file migrates to v2 on load, keeping diary / mentalMap /
 *    hypotheses, with empty outcomes/lessons.
 * 4. A lesson is distilled when the same (action, target, outcome, code)
 *    repeats 3 times, deduplicated by sourceKey, factual only — never
 *    prescriptive, never a destination or instruction.
 * 5. Lessons are capped at 20 (oldest dropped).
 * 6. toExcerpt() includes up to 5 lessons, after the mental-map line and
 *    before the diary.
 * 7. A notebook save failure never fails a cycle.
 *
 * The Camila principle holds throughout: the ledger and the lessons are
 * history she can read, never orders. No prompt text changes here.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';

import { WorldSessionController } from '../src/server/session-controller.js';
import {
  CAMILA_AGENT_ID,
} from '../src/core/npc-ai/camila-config.js';
import {
  CamilaNotebook,
  CAMILA_NOTEBOOK_VERSION,
} from '../src/persistence/camila-notebook.js';
import {
  DeterministicNpcCognitionProvider,
  type NpcActionProposal,
} from '../src/core/npc-ai/index.js';
import {
  resetRestaurantServiceState,
} from '../src/core/world-state.js';

const ON_DUTY_WORLD_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 local, Elena on duty

function makeController(tempDir: string, initialWorldTime = ON_DUTY_WORLD_TIME) {
  return new WorldSessionController({
    persistencePath: join(tempDir, 'world-state.json'),
    worldSeed: 'gomez-morin',
    initialWorldTime,
    silent: true,
    camilaNotebookPath: join(tempDir, 'camila-notebook.json'),
    camilaObjectPositionsPath: join(tempDir, 'camila-object-positions.json'),
  });
}

function setProposal(
  controller: ReturnType<typeof makeController>,
  proposal: NpcActionProposal
): void {
  controller
    .getNpcAiRuntime()
    .setProviderForAgent(
      CAMILA_AGENT_ID,
      new DeterministicNpcCognitionProvider({ cannedProposal: proposal })
    );
}

/** Drives Camila to a place through the authoritative move + arrival pipeline. */
async function moveCamilaTo(
  controller: ReturnType<typeof makeController>,
  destinationPlaceId: string
): Promise<void> {
  const runtime = controller.getNpcAiRuntime();
  setProposal(controller, {
    actionType: 'move_to_place',
    destinationPlaceId,
    reasoningContext: 'Yendo a ver algo.',
    requestedAt: ON_DUTY_WORLD_TIME,
  } as NpcActionProposal);
  const cycle = await runtime.runCycle(CAMILA_AGENT_ID);
  assert.equal(cycle.status, 'executed', `move to ${destinationPlaceId} must dispatch`);
  const arrival = await controller.completeNpcTraversal(
    CAMILA_AGENT_ID,
    destinationPlaceId,
    'arrived'
  );
  assert.equal(arrival.success, true, `arrival at ${destinationPlaceId} must commit`);
  assert.equal(runtime.getPerception(CAMILA_AGENT_ID).locationId, destinationPlaceId);
}

describe('Experiential learning v1: outcome ledger + lessons', () => {
  beforeEach(() => {
    resetRestaurantServiceState();
    delete process.env.CAMILA_ACTIONS_ENABLED;
  });

  // =========================================================================
  // 1. Ledger counts from runtime cycles
  // =========================================================================
  it('records executed, rejected and failed outcomes; waiting noop cycles are not attempts', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'exp-ledger-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      const outcomes = () =>
        controller.getCamilaNotebook().outcomes as {
          key: string;
          attempted: number;
          executed: number;
          rejected: number;
          failed: number;
          lastOutcome: string;
          lastCode: string;
          lastPlaceId?: string;
        }[];

      // Executed: move_to_place dispatches.
      setProposal(controller, {
        actionType: 'move_to_place',
        destinationPlaceId: 'street:calle-del-porvenir',
        reasoningContext: 'No lo he visitado.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const moved = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(moved.status, 'executed');
      const moveOutcome = outcomes().find((o) => o.key === 'move_to_place|');
      assert.ok(moveOutcome, 'move_to_place must have a ledger entry');
      assert.equal(moveOutcome.attempted, 1);
      assert.equal(moveOutcome.executed, 1);
      assert.equal(moveOutcome.rejected, 0);
      assert.equal(moveOutcome.failed, 0);
      assert.equal(moveOutcome.lastOutcome, 'executed');
      assert.equal(moveOutcome.lastCode, 'move-to-place');
      assert.equal(moveOutcome.lastPlaceId, 'restaurant:wing-spot');

      // Waiting for the traversal: a second cycle is a noop and records nothing.
      const waiting = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(waiting.status, 'noop');
      assert.equal(outcomes().find((o) => o.key === 'move_to_place|')?.attempted, 1);

      const arrival = await controller.completeNpcTraversal(
        CAMILA_AGENT_ID,
        'street:calle-del-porvenir',
        'arrived'
      );
      assert.equal(arrival.success, true);

      // Rejected: pick_up_object on the book, which is on the boulevard, not here.
      setProposal(controller, {
        actionType: 'pick_up_object',
        targetObjectId: 'probe:book',
        reasoningContext: 'Quiero ver ese libro.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const rejected = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(rejected.status, 'rejected');
      assert.equal(rejected.error?.code, 'object-not-nearby');
      const pickOutcome = outcomes().find((o) => o.key === 'pick_up_object|probe:book');
      assert.ok(pickOutcome, 'pick_up_object on probe:book must have a ledger entry');
      assert.equal(pickOutcome.attempted, 1);
      assert.equal(pickOutcome.executed, 0);
      assert.equal(pickOutcome.rejected, 1);
      assert.equal(pickOutcome.lastOutcome, 'rejected');
      assert.equal(pickOutcome.lastCode, 'object-not-nearby');

      // Failed: the cognition provider throws, so no decision exists.
      runtime.setProviderForAgent(
        CAMILA_AGENT_ID,
        new DeterministicNpcCognitionProvider({
          shouldThrow: true,
          errorMessage: 'boom',
        })
      );
      const failed = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(failed.status, 'provider_failed');
      const cognitionOutcome = outcomes().find((o) => o.key === 'cognition|');
      assert.ok(cognitionOutcome, 'a failed provider must be recorded under cognition');
      assert.equal(cognitionOutcome.attempted, 1);
      assert.equal(cognitionOutcome.failed, 1);
      assert.equal(cognitionOutcome.lastOutcome, 'failed');
      assert.equal(cognitionOutcome.lastCode, 'provider-execution-failed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('records an invalid proposal as a failed outcome', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'exp-invalid-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      runtime.setProviderForAgent(
        CAMILA_AGENT_ID,
        new DeterministicNpcCognitionProvider({ returnMalformed: true })
      );
      const result = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(result.status, 'invalid_proposal');
      const outcomes = controller.getCamilaNotebook().outcomes;
      assert.equal(outcomes.length, 1);
      assert.equal(outcomes[0].actionType, 'invalid_action_type');
      assert.equal(outcomes[0].failed, 1);
      assert.equal(outcomes[0].lastOutcome, 'failed');
      assert.equal(outcomes[0].lastCode, 'invalid-proposal-shape');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 2. Unity interaction reports
  // =========================================================================
  it('records Unity applied and failed reports as separate ledger events', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'exp-unity-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      await moveCamilaTo(controller, 'building:dollar-2-go-building');
      const outcomes = () => controller.getCamilaNotebook().outcomes;
      const ball = () => outcomes().find((o) => o.key === 'push_object|probe:ball');

      // Dispatch: executed (push-object).
      setProposal(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        pushTowardsPlaceId: 'building:dollar-2-go-building',
        reasoningContext: 'A ver qué pasa si la empujo.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const dispatched = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(dispatched.status, 'executed');
      assert.equal(ball()?.attempted, 1);
      assert.equal(ball()?.executed, 1);
      assert.equal(ball()?.lastCode, 'push-object');

      // Unity applied: a second executed event, same key.
      const applied = runtime.completeObjectPush(
        CAMILA_AGENT_ID,
        'probe:ball',
        'applied',
        { x: 45, y: 0.345, z: 16 },
        ON_DUTY_WORLD_TIME
      );
      assert.equal(applied.success, true);
      assert.equal(applied.code, 'push-applied');
      assert.equal(ball()?.attempted, 2);
      assert.equal(ball()?.executed, 2);
      assert.equal(ball()?.lastCode, 'push-applied');
      // No lesson yet: the streak resets whenever the code changes.
      assert.equal(controller.getCamilaNotebook().lessons.length, 0);

      // Dispatch again, then Unity reports failure.
      setProposal(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        reasoningContext: 'Otra vez.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const redispatched = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(redispatched.status, 'executed');
      const failedReport = runtime.completeObjectPush(
        CAMILA_AGENT_ID,
        'probe:ball',
        'failed',
        undefined,
        ON_DUTY_WORLD_TIME
      );
      assert.equal(failedReport.success, true);
      assert.equal(failedReport.code, 'push-failed-reported');
      assert.equal(ball()?.attempted, 4);
      assert.equal(ball()?.executed, 3);
      assert.equal(ball()?.failed, 1);
      assert.equal(ball()?.lastOutcome, 'failed');
      assert.equal(ball()?.lastCode, 'push-failed-reported');

      // A spurious report with no pending interaction records nothing.
      const spurious = runtime.completeObjectPush(
        CAMILA_AGENT_ID,
        'probe:ball',
        'failed',
        undefined,
        ON_DUTY_WORLD_TIME
      );
      assert.equal(spurious.success, false);
      assert.equal(spurious.code, 'no-pending-push');
      assert.equal(ball()?.attempted, 4);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 3. v1 migration
  // =========================================================================
  it('migrates a v1 notebook file to v2, keeping diary, mentalMap and hypotheses', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'exp-migrate-'));
    try {
      const path = join(tempDir, 'camila-notebook.json');
      writeFileSync(
        path,
        JSON.stringify({
          version: 'camila-notebook-v1',
          agentId: 'agent:camila-npc',
          createdAt: ON_DUTY_WORLD_TIME,
          updatedAt: ON_DUTY_WORLD_TIME,
          diary: [
            {
              timestamp: ON_DUTY_WORLD_TIME,
              text: 'Vi una pelota en el estacionamiento.',
              placeId: 'building:dollar-2-go-building',
            },
          ],
          mentalMap: [
            {
              placeId: 'building:dollar-2-go-building',
              firstVisitedAt: ON_DUTY_WORLD_TIME,
              lastVisitedAt: ON_DUTY_WORLD_TIME,
              visits: 1,
              notes: [],
              objectIdsSeen: ['probe:ball'],
            },
          ],
          hypotheses: [
            {
              id: 'hyp:1',
              text: 'La pelota va con la portería.',
              createdAt: ON_DUTY_WORLD_TIME,
              status: 'open',
            },
          ],
        }),
        'utf-8'
      );
      const notebook = new CamilaNotebook(path);
      assert.equal(notebook.loadError, null);
      assert.equal(notebook.getData().version, CAMILA_NOTEBOOK_VERSION);
      assert.equal(notebook.getData().diary.length, 1);
      assert.equal(notebook.getData().diary[0].text, 'Vi una pelota en el estacionamiento.');
      assert.equal(notebook.getData().mentalMap.length, 1);
      assert.equal(notebook.getData().hypotheses.length, 1);
      assert.equal(notebook.getData().hypotheses[0].status, 'open');
      assert.deepEqual(notebook.getData().outcomes, []);
      assert.deepEqual(notebook.getData().lessons, []);

      notebook.save();
      const reloaded = new CamilaNotebook(path);
      assert.equal(reloaded.getData().version, CAMILA_NOTEBOOK_VERSION);
      assert.equal(reloaded.getData().diary.length, 1);
      assert.deepEqual(reloaded.getData().outcomes, []);
      assert.deepEqual(reloaded.getData().lessons, []);
      const onDisk = JSON.parse(readFileSync(path, 'utf-8')) as {
        version: string;
        outcomes: unknown[];
        lessons: unknown[];
      };
      assert.equal(onDisk.version, CAMILA_NOTEBOOK_VERSION);
      assert.deepEqual(onDisk.outcomes, []);
      assert.deepEqual(onDisk.lessons, []);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 4. Lesson distillation
  // =========================================================================
  it('distills one factual lesson at 3 same-outcome attempts and deduplicates it', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'exp-lesson-'));
    try {
      const notebook = new CamilaNotebook(join(tempDir, 'nb.json'));
      const input = {
        actionType: 'pick_up_object',
        targetObjectId: 'probe:book',
        outcome: 'rejected' as const,
        code: 'object-not-nearby',
        at: ON_DUTY_WORLD_TIME,
        placeId: 'restaurant:wing-spot',
      };
      notebook.recordOutcome(input);
      notebook.recordOutcome(input);
      assert.equal(notebook.getData().lessons.length, 0, 'no lesson before 3 repeats');
      notebook.recordOutcome(input);
      assert.equal(notebook.getData().lessons.length, 1);
      const lesson = notebook.getData().lessons[0];
      assert.equal(
        lesson.text,
        'Intenté pick_up_object sobre probe:book 3 veces y las 3 fueron rechazadas (object-not-nearby).'
      );
      assert.equal(lesson.sourceKey, 'pick_up_object|probe:book|rejected|object-not-nearby');
      // Factual only: no prescriptive language, no destinations, no orders.
      assert.doesNotMatch(lesson.text, /debes|deberías|no hagas|prefiere|ve a/i);

      // A 4th identical attempt: counts grow, no second lesson.
      notebook.recordOutcome(input);
      assert.equal(notebook.getData().lessons.length, 1);
      assert.equal(notebook.getOutcome('pick_up_object|probe:book')?.attempted, 4);

      // Same action and outcome but a different code: a new, distinct lesson.
      const otherCode = { ...input, code: 'object-not-carriable' };
      notebook.recordOutcome(otherCode);
      notebook.recordOutcome(otherCode);
      notebook.recordOutcome(otherCode);
      assert.equal(notebook.getData().lessons.length, 2);
      assert.equal(
        notebook.getData().lessons[1].text,
        'Intenté pick_up_object sobre probe:book 3 veces y las 3 fueron rechazadas (object-not-carriable).'
      );

      // Executed outcomes distill too, with the matching wording.
      const executed = {
        actionType: 'move_to_place',
        outcome: 'executed' as const,
        code: 'move-to-place',
        at: ON_DUTY_WORLD_TIME,
      };
      notebook.recordOutcome(executed);
      notebook.recordOutcome(executed);
      notebook.recordOutcome(executed);
      assert.equal(notebook.getData().lessons.length, 3);
      assert.equal(
        notebook.getData().lessons[2].text,
        'Intenté move_to_place 3 veces y las 3 se ejecutaron (move-to-place).'
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('distills a lesson through the runtime after 3 identical rejections', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'exp-lesson-rt-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      for (let i = 0; i < 3; i += 1) {
        setProposal(controller, {
          actionType: 'pick_up_object',
          targetObjectId: 'probe:book',
          reasoningContext: 'Quiero ver ese libro.',
          requestedAt: ON_DUTY_WORLD_TIME,
        } as NpcActionProposal);
        const result = await runtime.runCycle(CAMILA_AGENT_ID);
        assert.equal(result.status, 'rejected');
      }
      const lessons = controller.getCamilaNotebook().lessons;
      assert.equal(lessons.length, 1);
      assert.equal(
        lessons[0].text,
        'Intenté pick_up_object sobre probe:book 3 veces y las 3 fueron rechazadas (object-not-nearby).'
      );
      assert.match(controller.getCamilaNotebook().outcomes[0].key, /probe:book/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 5. Lessons cap
  // =========================================================================
  it('caps lessons at 20, dropping the oldest', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'exp-cap-'));
    try {
      const notebook = new CamilaNotebook(join(tempDir, 'nb.json'));
      for (let i = 0; i < 21; i += 1) {
        const input = {
          actionType: 'pick_up_object',
          targetObjectId: 'probe:book',
          outcome: 'rejected' as const,
          code: `code-${i}`,
          at: ON_DUTY_WORLD_TIME,
        };
        notebook.recordOutcome(input);
        notebook.recordOutcome(input);
        notebook.recordOutcome(input);
      }
      const lessons = notebook.getData().lessons;
      assert.equal(lessons.length, 20);
      assert.ok(!lessons.some((l) => l.sourceKey.includes('code-0')), 'oldest lesson drops off');
      assert.ok(lessons.some((l) => l.sourceKey.includes('code-20')), 'newest lesson is kept');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 6. Excerpt includes lessons
  // =========================================================================
  it('includes up to 5 lessons in the excerpt, after the mental map and before the diary', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'exp-excerpt-'));
    try {
      const notebook = new CamilaNotebook(join(tempDir, 'nb.json'));
      notebook.recordVisit('building:dollar-2-go-building', ON_DUTY_WORLD_TIME, ['probe:ball']);
      notebook.addDiaryEntry('Vi una pelota en el estacionamiento.', ON_DUTY_WORLD_TIME, 'building:dollar-2-go-building');
      for (let i = 0; i < 6; i += 1) {
        const input = {
          actionType: 'pick_up_object',
          targetObjectId: 'probe:book',
          outcome: 'rejected' as const,
          code: `code-${i}`,
          at: ON_DUTY_WORLD_TIME,
        };
        notebook.recordOutcome(input);
        notebook.recordOutcome(input);
        notebook.recordOutcome(input);
      }
      assert.equal(notebook.getData().lessons.length, 6);
      const excerpt = notebook.toExcerpt();
      assert.equal((excerpt.match(/Lección: /g) ?? []).length, 5, 'at most 5 lessons in the excerpt');
      assert.ok(!excerpt.includes('code-0'), 'the oldest lesson is out of the excerpt window');
      assert.ok(excerpt.includes('code-5'), 'the newest lesson is in the excerpt');
      const mapIdx = excerpt.indexOf('Lugares visitados:');
      const lessonIdx = excerpt.indexOf('Lección:');
      const diaryIdx = excerpt.indexOf(`- [${ON_DUTY_WORLD_TIME}]`);
      assert.ok(mapIdx >= 0 && lessonIdx > mapIdx, 'lessons come after the mental-map line');
      assert.ok(diaryIdx > lessonIdx, 'lessons come before the diary');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 7. Notebook save failure never fails a cycle
  // =========================================================================
  it('a notebook save failure never fails a cycle', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'exp-savefail-'));
    try {
      // The notebook path sits under a regular file, so every save throws
      // (mkdir/write fail with ENOTDIR even as root); loading still works.
      writeFileSync(join(tempDir, 'blocker'), 'not a directory', 'utf-8');
      const controller = new WorldSessionController({
        persistencePath: join(tempDir, 'world-state.json'),
        worldSeed: 'gomez-morin',
        initialWorldTime: ON_DUTY_WORLD_TIME,
        silent: true,
        camilaNotebookPath: join(tempDir, 'blocker', 'camila-notebook.json'),
        camilaObjectPositionsPath: join(tempDir, 'camila-object-positions.json'),
      });
      const runtime = controller.getNpcAiRuntime();

      setProposal(controller, {
        actionType: 'move_to_place',
        destinationPlaceId: 'street:calle-del-porvenir',
        reasoningContext: 'No lo he visitado.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const moved = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(moved.status, 'executed');

      const arrival = await controller.completeNpcTraversal(
        CAMILA_AGENT_ID,
        'street:calle-del-porvenir',
        'arrived'
      );
      assert.equal(arrival.success, true);

      setProposal(controller, {
        actionType: 'pick_up_object',
        targetObjectId: 'probe:book',
        reasoningContext: 'Quiero ver ese libro.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      // The rejection path writes diary + ledger entries; with the notebook
      // broken, the cycle must still complete as rejected, not throw.
      const rejected = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(rejected.status, 'rejected');
      assert.equal(rejected.error?.code, 'object-not-nearby');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
