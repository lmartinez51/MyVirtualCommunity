/**
 * Milestone 94: Camila explorer NPC test suite.
 *
 * Validates:
 * 1. Seed: Camila exists in the Gómez Morín seed, starts inside Wing Spot,
 *    and has NO deterministic routine schedule.
 * 2. Simulation tick never moves Camila by schedule.
 * 3. World-state JSON builds in the Unity frame (places, roads, probe objects).
 * 4. Notebook saves/loads round-trip; corrupt files fail safe.
 * 5. Fixed system prompt + decision parsing + explore-only gate.
 * 6. Mock Meta Model adapter returns structured decisions offline.
 * 7. Runtime cycles: move_to_place starts a traversal without moving the
 *    agent (in-flight immutability), look_at records a memory, gated
 *    actions are rejected, Elena's behaviour is unchanged.
 * 8. HTTP: GET /api/npc/agent:camila-npc/notebook works; other agents 404.
 * 9. Persisted world migration & HTTP arrival completion (fixes Camila stall).
 * 10. Phase 2a push_object: object-position store, prompt v3 (never tells
 *    Camila what to do — no ball→goal preference; hypotheses are hers
 *    only), gate + validation (not-nearby / not-pushable / unknown
 *    direction place), push dispatch + Unity report commit (notebook +
 *    persistence), failed-report no-commit, and pick_up / carry / drop
 *    still not implemented.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { WorldClock } from '../src/core/clock.js';
import { createGomezMorinSeedWorld } from '../src/core/seed.js';
import { Simulation } from '../src/core/simulation.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { createWorldServer } from '../src/server/http-server.js';
import {
  findNpcSchedule,
  hasNpcRoutineSchedule,
} from '../src/core/development-npc-schedule.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import {
  createMoveToPlaceIntent,
  dispatchAgentIntent,
} from '../src/core/agent-intent.js';
import {
  CAMILA_AGENT_ID,
  CAMILA_GOAL,
  CAMILA_PROMPT_VERSION,
  CAMILA_SYSTEM_PROMPT,
  buildCamilaPrompt,
  isCamilaActionAllowed,
  parseCamilaExplorerDecision,
} from '../src/core/npc-ai/camila-config.js';
import {
  CAMILA_PROBE_OBJECTS,
  findProbeObjectById,
} from '../src/core/camila-probe-objects.js';
import {
  buildCamilaWorldState,
  CAMILA_UNITY_ANCHORS,
} from '../src/core/camila-world-state.js';
import {
  CamilaNotebook,
  createEmptyCamilaNotebook,
} from '../src/persistence/camila-notebook.js';
import { CamilaProbeObjectState } from '../src/core/camila-probe-object-state.js';
import { MockMetaModelAdapter } from '../src/adapters/mock-meta-model-adapter.js';
import {
  NpcAiRuntime,
  DeterministicNpcCognitionProvider,
  CamilaCognitionProvider,
  deriveNpcPerception,
  type NpcActionProposal,
} from '../src/core/npc-ai/index.js';
import {
  DEFAULT_WORLD_ID,
  resetRestaurantServiceState,
  type WorldState,
} from '../src/core/world-state.js';

const ON_DUTY_WORLD_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 local, Elena on duty

function setupGomezMorinState(initialTime: string = ON_DUTY_WORLD_TIME): WorldState {
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
  return state;
}

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

/** Drives Camila to a place through the authoritative move + arrival pipeline. */
async function moveCamilaTo(
  controller: ReturnType<typeof makeController>,
  destinationPlaceId: string
): Promise<void> {
  const runtime = controller.getNpcAiRuntime();
  runtime.setProviderForAgent(
    CAMILA_AGENT_ID,
    new DeterministicNpcCognitionProvider({
      cannedProposal: {
        actionType: 'move_to_place',
        destinationPlaceId,
        reasoningContext: 'Yendo a empujar algo.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal,
    })
  );
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

function setPushProvider(
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

describe('Milestone 94: Camila explorer NPC', () => {
  beforeEach(() => {
    resetRestaurantServiceState();
    delete process.env.CAMILA_ACTIONS_ENABLED;
  });

  // =========================================================================
  // 1. Seed
  // =========================================================================
  it('seeds Camila inside Wing Spot with no routine schedule', () => {
    const seed = createGomezMorinSeedWorld();
    assert.equal(seed.agents.length, 3);
    const camila = seed.agents.find((a) => a.id === CAMILA_AGENT_ID);
    assert.ok(camila, 'agent:camila-npc must exist in the Gómez Morín seed');
    assert.equal(camila.name, 'Camila');
    assert.equal(camila.agentType, 'npc');
    assert.equal(camila.locationId, 'restaurant:wing-spot');

    // No deterministic schedule: the Simulation tick must never move her.
    assert.equal(findNpcSchedule(CAMILA_AGENT_ID), null);
    assert.equal(hasNpcRoutineSchedule(CAMILA_AGENT_ID), false);

    // Elena is unchanged.
    const elena = seed.agents.find((a) => a.id === 'agent:elena-npc');
    assert.ok(elena);
    assert.equal(elena.locationId, 'building:del-porvenir-residence');
    assert.ok(findNpcSchedule('agent:elena-npc'));
  });

  // =========================================================================
  // 2. Simulation tick never moves Camila
  // =========================================================================
  it('simulation tick does not move Camila (no schedule)', () => {
    const state = setupGomezMorinState();
    // Thursday 15:00 local (21:00 UTC) — Wing Spot is open (12 PM - 3 AM), so only a routine schedule could move Camila
    const clock = new WorldClock('2026-10-08T21:00:00.000Z');
    const sim = new Simulation(clock, state, { silent: true });
    sim.tick();
    const camila = state.agents.find((a) => a.id === CAMILA_AGENT_ID);
    assert.equal(camila?.locationId, 'restaurant:wing-spot');
  });

  // =========================================================================
  // 3. World-state JSON (Unity frame)
  // =========================================================================
  it('builds the world-state JSON in the Unity frame', () => {
    const json = buildCamilaWorldState();
    assert.equal(json.version, 'camila-world-state-v1');
    assert.equal(json.coordinateFrame.frame, 'unity-scene');
    assert.match(json.coordinateFrame.note, /NOT Unity coordinates/);
    assert.equal(json.places.length, 13);
    assert.equal(json.agents.length, 3);
    assert.ok(json.agents.some((a) => a.id === CAMILA_AGENT_ID));
    assert.equal(json.roads.length, 3);
    assert.equal(json.probeObjects.length, 21);
    assert.equal(json.probeObjects.length, CAMILA_PROBE_OBJECTS.length);

    // Unity anchors come from the SceneBuilder layout, not the TS topology.
    assert.deepEqual(CAMILA_UNITY_ANCHORS['restaurant:wing-spot'], { x: -8, y: 0.24, z: 8 });
    const wingSpot = json.restaurants.find((r) => r.id === 'restaurant:wing-spot');
    assert.deepEqual(wingSpot?.unityPosition, { x: -8, y: 0.24, z: 8 });
    // Places without a physical anchor have null positions.
    assert.equal(json.places.find((p) => p.id === 'city:ciudad-juarez')?.unityPosition, null);

    // Roads carry Unity polylines (boulevard runs east-west, Del Porvenir north).
    const boulevard = json.roads.find((r) => r.roadId === 'road:blvd-gomez-morin');
    assert.ok(boulevard && boulevard.unityPolyline.length >= 2);
    assert.equal(boulevard.unityPolyline[0].x, -60);
    const porvenir = json.roads.find((r) => r.roadId === 'road:calle-del-porvenir');
    assert.ok(porvenir && porvenir.unityPolyline.some((p) => p.z === 45));
  });

  it('generator script writes a valid world-state JSON file', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-gen-'));
    try {
      const outPath = join(tempDir, 'camila-world-state.json');
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/generate-camila-world-state.ts', '--out', outPath],
        { encoding: 'utf-8' }
      );
      assert.equal(result.status, 0, result.stderr);
      assert.ok(existsSync(outPath));
      const parsed = JSON.parse(readFileSync(outPath, 'utf-8'));
      assert.equal(parsed.version, 'camila-world-state-v1');
      assert.equal(parsed.probeObjects.length, 21);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 4. Notebook round-trip + corrupt-file safety
  // =========================================================================
  it('notebook saves and loads round-trip with diary, visits and hypotheses', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-notebook-'));
    try {
      const path = join(tempDir, 'camila-notebook.json');
      const notebook = new CamilaNotebook(path);
      assert.equal(notebook.getData().diary.length, 0);
      notebook.addDiaryEntry('Vi una pelota en el estacionamiento.', ON_DUTY_WORLD_TIME, 'building:dollar-2-go-building');
      notebook.recordVisit('building:dollar-2-go-building', ON_DUTY_WORLD_TIME, ['probe:ball']);
      notebook.addHypothesis('La pelota va con la portería del terreno vacío.', ON_DUTY_WORLD_TIME);
      notebook.save();
      assert.ok(existsSync(path));

      const reloaded = new CamilaNotebook(path);
      assert.equal(reloaded.loadError, null);
      assert.equal(reloaded.getData().diary.length, 1);
      assert.equal(reloaded.getData().mentalMap.length, 1);
      assert.equal(reloaded.getData().mentalMap[0].visits, 1);
      assert.deepEqual(reloaded.getData().mentalMap[0].objectIdsSeen, ['probe:ball']);
      assert.equal(reloaded.getData().hypotheses.length, 1);
      assert.equal(reloaded.getData().hypotheses[0].status, 'open');
      assert.match(reloaded.toExcerpt(), /pelota/);
      assert.match(reloaded.toExcerpt(), /Hipótesis abierta/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('notebook with a corrupt file starts fresh instead of crashing', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-notebook-bad-'));
    try {
      const path = join(tempDir, 'camila-notebook.json');
      writeFileSync(path, '{not valid json', 'utf-8');
      const notebook = new CamilaNotebook(path);
      assert.ok(notebook.loadError);
      assert.deepEqual(notebook.getData().diary, []);
      assert.equal(notebook.getData().version, createEmptyCamilaNotebook().version);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 5. Fixed prompt + decision parsing + explore-only gate
  // =========================================================================
  it('fixed system prompt names Camila and sets curiosity / boredom rules', () => {
    assert.equal(CAMILA_PROMPT_VERSION, 'camila-prompt-v5');
    assert.match(CAMILA_SYSTEM_PROMPT, /Eres Camila/);
    assert.match(CAMILA_SYSTEM_PROMPT, /curiosa/);
    assert.match(CAMILA_SYSTEM_PROMPT, /aburres fácilmente/);
    assert.match(CAMILA_SYSTEM_PROMPT, /Nunca inventes lugares/);
    assert.match(CAMILA_SYSTEM_PROMPT, /en español/);

    const { systemPrompt, userContent } = buildCamilaPrompt({
      worldStateSummary: 'Lugares: ...',
      notebookExcerpt: 'Libreta vacía.',
      perceptionJson: '{}',
    });
    assert.equal(systemPrompt, CAMILA_SYSTEM_PROMPT);
    assert.match(userContent, /Camila/);
    assert.match(userContent, /Lugares: \.\.\./);
  });

  it('parses valid explorer decisions and rejects bad / gated ones', () => {
    const ok = parseCamilaExplorerDecision(
      JSON.stringify({
        actionType: 'move_to_place',
        destinationPlaceId: 'street:calle-del-porvenir',
        reasoningContext: 'No lo he visitado.',
      }),
      false
    );
    assert.equal(ok.error, undefined);
    assert.equal(ok.decision?.actionType, 'move_to_place');

    const look = parseCamilaExplorerDecision(
      JSON.stringify({ actionType: 'look_at', targetObjectId: 'probe:ball' }),
      false
    );
    assert.equal(look.decision?.actionType, 'look_at');

    assert.equal(parseCamilaExplorerDecision('not json', false).decision, null);
    assert.equal(
      parseCamilaExplorerDecision(JSON.stringify({ actionType: 'teleport' }), false).decision,
      null
    );
    assert.equal(
      parseCamilaExplorerDecision(JSON.stringify({ actionType: 'move_to_place' }), false).decision,
      null
    );

    // Phase 1 gate: interact actions are rejected by default, allowed when enabled.
    const gatedOff = parseCamilaExplorerDecision(
      JSON.stringify({ actionType: 'pick_up_object', targetObjectId: 'probe:ball' }),
      false
    );
    assert.equal(gatedOff.decision, null);
    assert.match(gatedOff.error ?? '', /gated off/);
    const gatedOn = parseCamilaExplorerDecision(
      JSON.stringify({ actionType: 'pick_up_object', targetObjectId: 'probe:ball' }),
      true
    );
    assert.equal(gatedOn.decision?.actionType, 'pick_up_object');

    assert.equal(isCamilaActionAllowed('move_to_place', false), true);
    assert.equal(isCamilaActionAllowed('push_object', false), false);
    assert.equal(isCamilaActionAllowed('push_object', true), true);
  });

  it('probe objects carry affordances only, in complementary clusters', () => {
    assert.equal(CAMILA_PROBE_OBJECTS.length, 21);
    const ball = findProbeObjectById('probe:ball');
    assert.ok(ball);
    assert.ok(ball.affordances.includes('kickable'));
    assert.ok(!ball.affordances.join(' ').match(/llévala|patea|haz/i));
    // Complements live in different places: ball at Dollar 2 Go, goal in the empty lot.
    const goal = findProbeObjectById('probe:small-goal');
    assert.ok(goal);
    assert.notEqual(goal.unityPosition.z, ball.unityPosition.z);
    const bin = findProbeObjectById('probe:trash-bin');
    const bag = findProbeObjectById('probe:trash-bag');
    assert.ok(bin && bag);
    assert.notEqual(bin.placeId, bag.placeId);
    for (const cluster of ['futbol', 'basura', 'agua', 'descanso', 'arte'] as const) {
      assert.ok(
        CAMILA_PROBE_OBJECTS.some((o) => o.cluster === cluster),
        `cluster ${cluster} must have objects`
      );
    }
  });

  // =========================================================================
  // 6. Mock Meta Model adapter (offline, deterministic)
  // =========================================================================
  it('mock adapter returns a structured decision offline', async () => {
    const mock = new MockMetaModelAdapter();
    const response = await mock.generateExplorerDecision({
      systemPrompt: CAMILA_SYSTEM_PROMPT,
      worldStateSummary: 'Lugares: ...',
      notebookExcerpt: 'Libreta vacía.',
      perceptionJson: JSON.stringify({
        locationId: 'restaurant:wing-spot',
        unvisitedPlaceIds: ['street:calle-del-porvenir', 'street:av-la-arboleda'],
      }),
    });
    assert.equal(mock.callCount, 1);
    assert.equal(response.model, 'muse-spark-1.3-mock');
    const parsed = JSON.parse(response.text);
    assert.equal(parsed.actionType, 'move_to_place');
    assert.equal(parsed.destinationPlaceId, 'street:calle-del-porvenir');

    // With nothing unvisited, it observes.
    const done = await mock.generateExplorerDecision({
      systemPrompt: CAMILA_SYSTEM_PROMPT,
      worldStateSummary: '',
      notebookExcerpt: '',
      perceptionJson: JSON.stringify({ locationId: 'x', unvisitedPlaceIds: [] }),
    });
    assert.equal(JSON.parse(done.text).actionType, 'observe');
  });

  it('Camila provider validates the model decision against perception', async () => {
    const state = setupGomezMorinState();
    const perception = deriveNpcPerception(state, CAMILA_AGENT_ID);
    assert.equal(perception.role, 'explorer');
    assert.ok(perception.nearbyPlaces && perception.nearbyPlaces.length >= 10);
    assert.ok(perception.nearbyObjects && perception.nearbyObjects.length === 21);
    assert.ok(perception.unvisitedPlaceIds?.includes('street:calle-del-porvenir'));

    const provider = new CamilaCognitionProvider({
      metaModel: new MockMetaModelAdapter(),
    });
    const result = await provider.decideAction({
      perception,
      goal: CAMILA_GOAL,
      memories: [],
    });
    assert.equal(result.providerId, 'camila-muse-spark-provider');
    assert.equal(result.proposal.actionType, 'move_to_place');
    // First navigable unvisited place (city/district/neighbourhood are not destinations).
    assert.equal(result.proposal.destinationPlaceId, 'street:blvd-gomez-morin');
  });

  // =========================================================================
  // 7. Runtime cycles
  // =========================================================================
  it('move_to_place starts a traversal without moving the agent (in-flight immutability)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-runtime-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      runtime.setProviderForAgent(
        CAMILA_AGENT_ID,
        new DeterministicNpcCognitionProvider({
          cannedProposal: {
            actionType: 'move_to_place',
            destinationPlaceId: 'street:calle-del-porvenir',
            reasoningContext: 'No lo he visitado todavía.',
            requestedAt: ON_DUTY_WORLD_TIME,
          } as NpcActionProposal,
        })
      );

      const result = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(result.status, 'executed');
      assert.equal(result.commandDispatched?.commandName, 'move-to-place');
      assert.equal(result.commandDispatched?.success, true);

      // Location stays at the origin until arrival is committed (M75).
      const perception = runtime.getPerception(CAMILA_AGENT_ID);
      assert.equal(perception.locationId, 'restaurant:wing-spot');

      // A second cycle while the traversal is active waits instead of re-dispatching.
      const waiting = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(waiting.status, 'noop');
      assert.equal(waiting.proposal?.actionType, 'observe');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('dispatch + arrival commit moves Camila through the M75 pipeline', () => {
    const state = setupGomezMorinState();
    const coordinator = new RuntimeTraversalCoordinator();
    const intent = createMoveToPlaceIntent(
      CAMILA_AGENT_ID,
      'street:calle-del-porvenir',
      ON_DUTY_WORLD_TIME,
      'Explorando.'
    );
    const dispatch = dispatchAgentIntent(state, intent, {
      coordinator,
      currentTime: ON_DUTY_WORLD_TIME,
    });
    assert.equal(dispatch.success, true);
    assert.equal(dispatch.code, 'traversal-started');
    assert.ok(dispatch.request);

    const completed = coordinator.completeTraversal(state, {
      requestId: dispatch.request.requestId,
      agentId: CAMILA_AGENT_ID,
      destinationPlaceId: 'street:calle-del-porvenir',
      status: 'arrived',
      completedAt: ON_DUTY_WORLD_TIME,
      message: 'Arrived.',
    });
    assert.equal(completed.success, true);
    const camila = state.agents.find((a) => a.id === CAMILA_AGENT_ID);
    assert.equal(camila?.locationId, 'street:calle-del-porvenir');
  });

  it('look_at records an object_noticed memory and writes the notebook', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-look-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      runtime.setProviderForAgent(
        CAMILA_AGENT_ID,
        new DeterministicNpcCognitionProvider({
          cannedProposal: {
            actionType: 'look_at',
            targetObjectId: 'probe:ball',
            reasoningContext: 'Una pelota, ¿qué hace aquí?',
            requestedAt: ON_DUTY_WORLD_TIME,
          } as NpcActionProposal,
        })
      );

      const result = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(result.status, 'executed');
      const memories = runtime.getMemoryStore().getMemories();
      assert.ok(memories.some((m) => m.type === 'object_noticed'));

      // Notebook got a diary line (file is gitignored runtime data).
      const notebookPath = join(tempDir, 'camila-notebook.json');
      assert.ok(existsSync(notebookPath));
      const saved = JSON.parse(readFileSync(notebookPath, 'utf-8'));
      assert.ok(saved.diary.length >= 1);
      assert.match(saved.diary[0].text, /Pelota|ball|Miré/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('gated interact actions are rejected in explore-only Phase 1', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-gate-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      runtime.setProviderForAgent(
        CAMILA_AGENT_ID,
        new DeterministicNpcCognitionProvider({
          cannedProposal: {
            actionType: 'pick_up_object',
            targetObjectId: 'probe:ball',
            requestedAt: ON_DUTY_WORLD_TIME,
          } as NpcActionProposal,
        })
      );
      const result = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(result.status, 'rejected');
      assert.equal(result.error?.code, 'action-gated');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('Camila diagnostics use her goal and Muse Spark provider; Elena is unchanged', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-diag-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      const diag = runtime.getDiagnostics(CAMILA_AGENT_ID);
      assert.equal(diag.providerId, 'camila-muse-spark-provider');
      assert.equal(diag.activeGoal.goalId, CAMILA_GOAL.goalId);

      // Elena still runs her deterministic attendant cycle without crashing.
      const elenaResult = await runtime.runCycle('agent:elena-npc');
      assert.ok(['noop', 'executed'].includes(elenaResult.status));
      const elenaDiag = runtime.getDiagnostics('agent:elena-npc');
      assert.equal(elenaDiag.activeGoal.goalId, 'wing-spot-attendant-duty');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 8. HTTP notebook endpoint
  // =========================================================================
  it('GET /api/npc/agent:camila-npc/notebook returns the notebook; others 404', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-http-'));
    const controller = makeController(tempDir);
    const server = createWorldServer({ controller, silent: true });
    const info = await server.start(0, '127.0.0.1');
    try {
      const okRes = await fetch(`${info.url}/api/npc/agent:camila-npc/notebook`);
      assert.equal(okRes.status, 200);
      const okBody = (await okRes.json()) as { success: boolean; result: { agentId: string } };
      assert.equal(okBody.success, true);
      assert.equal(okBody.result.agentId, 'agent:camila-npc');

      const badRes = await fetch(`${info.url}/api/npc/agent:elena-npc/notebook`);
      assert.equal(badRes.status, 404);
      const badBody = (await badRes.json()) as { error: { code: string } };
      assert.equal(badBody.error.code, 'notebook-not-found');
    } finally {
      await server.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 9. Persisted world migration & HTTP arrival completion (fixes Camila stall)
  // =========================================================================
  it('bootstrapWorld seeds missing agent:camila-npc into legacy persisted Gómez Morín world-state', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-migrate-'));
    try {
      const statePath = join(tempDir, 'world-state.json');
      const preM94State = setupGomezMorinState();
      // Remove Camila to simulate a pre-M94 persisted world-state.json
      preM94State.agents = preM94State.agents.filter((a) => a.id !== CAMILA_AGENT_ID);
      writeFileSync(statePath, JSON.stringify(preM94State, null, 2), 'utf-8');

      const controller = new WorldSessionController({
        persistencePath: statePath,
        worldSeed: 'gomez-morin',
        silent: true,
        camilaNotebookPath: join(tempDir, 'camila-notebook.json'),
      });

      const perception = controller.getNpcPerception(CAMILA_AGENT_ID);
      assert.equal(perception.agentId, CAMILA_AGENT_ID);
      assert.equal(perception.locationId, 'restaurant:wing-spot');

      const saved = JSON.parse(readFileSync(statePath, 'utf-8')) as WorldState;
      assert.ok(saved.agents.some((a) => a.id === CAMILA_AGENT_ID));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('POST /api/npc/agent:camila-npc/arrival commits location, updates notebook, and unblocks next cycle', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-arrival-'));
    const controller = makeController(tempDir);
    const server = createWorldServer({ controller, silent: true });
    const info = await server.start(0, '127.0.0.1');
    try {
      // Cycle 1: Camila proposes move_to_place -> street:blvd-gomez-morin
      const cycle1Res = await fetch(`${info.url}/api/npc/agent:camila-npc/cycle`, { method: 'POST' });
      assert.equal(cycle1Res.status, 200);
      const cycle1 = (await cycle1Res.json()) as {
        success: boolean;
        result: { status: string; proposal: { actionType: string; destinationPlaceId: string } };
      };
      assert.equal(cycle1.success, true);
      assert.equal(cycle1.result.status, 'executed');
      assert.equal(cycle1.result.proposal.actionType, 'move_to_place');
      const firstDest = cycle1.result.proposal.destinationPlaceId;

      // Report physical arrival from Unity
      const arrivalRes = await fetch(`${info.url}/api/npc/agent:camila-npc/arrival`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationPlaceId: firstDest, status: 'arrived' }),
      });
      assert.equal(arrivalRes.status, 200);
      const arrivalBody = (await arrivalRes.json()) as {
        success: boolean;
        result: { currentLocationId: string; changed: boolean };
      };
      assert.equal(arrivalBody.success, true);
      assert.equal(arrivalBody.result.currentLocationId, firstDest);
      assert.equal(arrivalBody.result.changed, true);

      // Verify perception updated & notebook recorded the visit
      const perception = controller.getNpcPerception(CAMILA_AGENT_ID);
      assert.equal(perception.locationId, firstDest);
      assert.ok(perception.visitedPlaceIds?.includes(firstDest));
      assert.ok(!perception.unvisitedPlaceIds?.includes(firstDest));

      // Cycle 2: Camila immediately chooses a NEW destination instead of staying stuck waiting!
      const cycle2Res = await fetch(`${info.url}/api/npc/agent:camila-npc/cycle`, { method: 'POST' });
      assert.equal(cycle2Res.status, 200);
      const cycle2 = (await cycle2Res.json()) as {
        success: boolean;
        result: { status: string; proposal: { actionType: string; destinationPlaceId: string } };
      };
      assert.equal(cycle2.result.status, 'executed');
      assert.equal(cycle2.result.proposal.actionType, 'move_to_place');
      assert.notEqual(cycle2.result.proposal.destinationPlaceId, firstDest);

      // Interrupt Cycle 2 (e.g. closed door): clears traversal with ZERO location mutation
      const interruptRes = await fetch(`${info.url}/api/npc/agent:camila-npc/arrival`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationPlaceId: cycle2.result.proposal.destinationPlaceId,
          status: 'traversal-interrupted',
          message: 'Closed business door',
        }),
      });
      assert.equal(interruptRes.status, 200);
      assert.equal(controller.getNpcPerception(CAMILA_AGENT_ID).locationId, firstDest);
    } finally {
      await server.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 10. Phase 2a: push_object
  // =========================================================================
  it('object positions store: seed defaults, persist + reload, corrupt file fails safe', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-objstate-'));
    try {
      const filePath = join(tempDir, 'camila-object-positions.json');
      const store = new CamilaProbeObjectState(filePath);
      assert.deepEqual(store.getPosition('probe:ball'), { x: 68, y: 0.345, z: 11.5 });
      assert.equal(store.getPosition('probe:nope'), null);

      assert.equal(store.setPosition('probe:ball', { x: 68, y: 0.345, z: 13 }), true);
      assert.equal(store.setPosition('probe:nope', { x: 0, y: 0, z: 0 }), false);
      assert.equal(store.setPosition('probe:ball', { x: 999, y: 0.345, z: 13 }), false);
      assert.equal(store.setPosition('probe:ball', { x: Number.NaN, y: 0, z: 0 }), false);
      store.save();
      assert.ok(existsSync(filePath));

      const reloaded = new CamilaProbeObjectState(filePath);
      assert.deepEqual(reloaded.getPosition('probe:ball'), { x: 68, y: 0.345, z: 13 });
      assert.equal(reloaded.loadError, null);

      writeFileSync(filePath, '{ not json', 'utf-8');
      const corrupt = new CamilaProbeObjectState(filePath);
      assert.deepEqual(corrupt.getPosition('probe:ball'), { x: 68, y: 0.345, z: 11.5 });
      assert.ok(corrupt.loadError);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('prompt v4 offers push/pick_up/drop; parse accepts them with gate on, rejects off', () => {
    assert.equal(CAMILA_PROMPT_VERSION, 'camila-prompt-v5');
    assert.match(CAMILA_SYSTEM_PROMPT, /push_object/);
    assert.match(CAMILA_SYSTEM_PROMPT, /pick_up_object/);
    assert.match(CAMILA_SYSTEM_PROMPT, /drop_object/);
    assert.match(CAMILA_SYSTEM_PROMPT, /pushTowardsPlaceId/);
    assert.match(CAMILA_SYSTEM_PROMPT, /stationary/);
    // Prompt v3 (Lorenzo's correction): Camila is NEVER told what to do.
    // No ball→goal preference, no ball→goal example: she decides the
    // direction herself, and any hypothesis is her own.
    assert.doesNotMatch(CAMILA_SYSTEM_PROMPT, /Prefiere empujar la pelota/);
    assert.doesNotMatch(CAMILA_SYSTEM_PROMPT, /hacia el lugar de la portería/);
    assert.doesNotMatch(CAMILA_SYSTEM_PROMPT, /pelota hacia la portería/);
    assert.match(CAMILA_SYSTEM_PROMPT, /TÚ decides hacia dónde/);
    assert.match(CAMILA_SYSTEM_PROMPT, /hypothesis/);

    const raw = JSON.stringify({
      actionType: 'push_object',
      targetObjectId: 'probe:ball',
      pushTowardsPlaceId: 'building:dollar-2-go-building',
      reasoningContext: 'La pelota quiere ir a la portería.',
      hypothesis: 'Creo que la pelota y la portería van juntas.',
    });
    const allowed = parseCamilaExplorerDecision(raw, true);
    assert.ok(allowed.decision);
    assert.equal(allowed.decision.actionType, 'push_object');
    assert.equal(allowed.decision.pushTowardsPlaceId, 'building:dollar-2-go-building');
    assert.equal(allowed.decision.hypothesis, 'Creo que la pelota y la portería van juntas.');

    // A decision without a hypothesis parses fine and carries none.
    const noHyp = parseCamilaExplorerDecision(
      JSON.stringify({
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        reasoningContext: 'Solo quiero ver qué pasa si la empujo.',
      }),
      true
    );
    assert.ok(noHyp.decision);
    assert.equal(noHyp.decision.hypothesis, undefined);

    const gated = parseCamilaExplorerDecision(raw, false);
    assert.equal(gated.decision, null);
    assert.match(gated.error ?? '', /gated off/);

    const missingTarget = parseCamilaExplorerDecision(
      JSON.stringify({ actionType: 'push_object' }),
      true
    );
    assert.equal(missingTarget.decision, null);
    assert.match(missingTarget.error ?? '', /targetObjectId/);
  });

  it('gate off: push_object is rejected as action-gated', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-push-gate-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      setPushProvider(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const result = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(result.status, 'rejected');
      assert.equal(result.error?.code, 'action-gated');
      assert.equal(runtime.getPendingPush(CAMILA_AGENT_ID), undefined);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('gate on: pushing an object in another place is rejected object-not-nearby', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-push-far-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      // Camila starts at restaurant:wing-spot; the ball is at Dollar 2 Go.
      assert.equal(runtime.getPerception(CAMILA_AGENT_ID).locationId, 'restaurant:wing-spot');
      setPushProvider(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const result = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(result.status, 'rejected');
      assert.equal(result.error?.code, 'object-not-nearby');
      assert.equal(runtime.getPendingPush(CAMILA_AGENT_ID), undefined);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('gate on: pushing the stationary bench is rejected object-not-pushable', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-push-bench-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();
      await moveCamilaTo(controller, 'street:blvd-gomez-morin');
      setPushProvider(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:bench',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const result = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(result.status, 'rejected');
      assert.equal(result.error?.code, 'object-not-pushable');
      assert.equal(runtime.getPendingPush(CAMILA_AGENT_ID), undefined);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('gate on: pushing the ball toward the goal executes, commits on Unity report, notebook + persistence', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-push-ball-'));
    const controller = makeController(tempDir);
    const server = createWorldServer({ controller, silent: true });
    const info = await server.start(0, '127.0.0.1');
    try {
      const runtime = controller.getNpcAiRuntime();
      await moveCamilaTo(controller, 'building:dollar-2-go-building');

      // Unknown push direction place is invalid, not a push.
      setPushProvider(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        pushTowardsPlaceId: 'place:nope',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const invalid = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(invalid.status, 'invalid_proposal');
      assert.equal(runtime.getPendingPush(CAMILA_AGENT_ID), undefined);

      // The real push: ball (45, 0.345, 14) toward the goal's place anchor
      // (45, 0.24, 15) -> deterministic 1.5 m step to (45, 0.345, 15.5).
      // The hypothesis below is Camila's OWN (prompt v3): the runtime only
      // records what she offered, verbatim — it never invents a pairing.
      setPushProvider(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        pushTowardsPlaceId: 'building:dollar-2-go-building',
        reasoningContext: 'La pelota tiene que ir a la portería.',
        hypothesis: 'Creo que la pelota y la portería van juntas.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const result = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(result.status, 'executed');
      assert.equal(result.commandDispatched?.commandName, 'push-object');
      assert.equal(result.commandDispatched?.success, true);
      const payload = result.commandDispatched?.payload as {
        targetObjectId: string;
        fromPosition: { x: number; y: number; z: number };
        expectedPosition: { x: number; y: number; z: number };
      };
      assert.equal(payload.targetObjectId, 'probe:ball');
      assert.deepEqual(payload.fromPosition, { x: 68, y: 0.345, z: 11.5 });
      const stepDx = payload.expectedPosition.x - payload.fromPosition.x;
      const stepDz = payload.expectedPosition.z - payload.fromPosition.z;
      assert.ok(Math.abs(Math.hypot(stepDx, stepDz) - 1.5) < 1e-6);
      assert.equal(payload.expectedPosition.y, 0.345);

      // A second push while one is pending is rejected, not stacked.
      const pending = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(pending.status, 'rejected');
      assert.equal(pending.error?.code, 'push-pending');
      assert.ok(runtime.getPendingPush(CAMILA_AGENT_ID));

      // Unity reports the physical result (it rolled a little further: z 16).
      const reportRes = await fetch(`${info.url}/api/npc/agent:camila-npc/object-interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetObjectId: 'probe:ball',
          status: 'applied',
          newPosition: { x: 45, y: 0.345, z: 16 },
        }),
      });
      assert.equal(reportRes.status, 200);
      const reportBody = (await reportRes.json()) as {
        success: boolean;
        result: { code: string; committed: boolean; newPosition: { x: number; y: number; z: number } };
      };
      assert.equal(reportBody.success, true);
      assert.equal(reportBody.result.code, 'push-applied');
      assert.equal(reportBody.result.committed, true);
      assert.deepEqual(reportBody.result.newPosition, { x: 45, y: 0.345, z: 16 });
      assert.equal(runtime.getPendingPush(CAMILA_AGENT_ID), undefined);

      // Position committed + persisted + reloadable.
      assert.deepEqual(
        controller.getCamilaObjectPositions().positions['probe:ball'],
        { x: 45, y: 0.345, z: 16 }
      );
      const positionsPath = join(tempDir, 'camila-object-positions.json');
      assert.ok(existsSync(positionsPath));
      const reloaded = new CamilaProbeObjectState(positionsPath);
      assert.deepEqual(reloaded.getPosition('probe:ball'), { x: 45, y: 0.345, z: 16 });

      // Notebook: diary entry + Camila's OWN hypothesis, recorded verbatim.
      const notebook = JSON.parse(readFileSync(join(tempDir, 'camila-notebook.json'), 'utf-8')) as {
        diary: { text: string }[];
        hypotheses: { text: string; status: string }[];
      };
      assert.ok(notebook.diary.some((d) => /Empujé Pelota/.test(d.text)));
      assert.equal(notebook.hypotheses.length, 1);
      assert.equal(
        notebook.hypotheses[0].text,
        'Creo que la pelota y la portería van juntas.'
      );
      assert.equal(notebook.hypotheses[0].status, 'open');

      // A second push WITHOUT a hypothesis records NO new hypothesis.
      setPushProvider(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        pushTowardsPlaceId: 'building:dollar-2-go-building',
        reasoningContext: 'Solo quiero ver qué pasa si la empujo otra vez.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const second = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(second.status, 'executed');
      const secondReport = await fetch(`${info.url}/api/npc/agent:camila-npc/object-interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetObjectId: 'probe:ball',
          status: 'applied',
          newPosition: { x: 45, y: 0.345, z: 17.5 },
        }),
      });
      assert.equal(secondReport.status, 200);
      const notebookAfter = JSON.parse(readFileSync(join(tempDir, 'camila-notebook.json'), 'utf-8')) as {
        diary: { text: string }[];
        hypotheses: { text: string; status: string }[];
      };
      assert.equal(notebookAfter.hypotheses.length, 1);
      assert.equal(
        notebookAfter.hypotheses[0].text,
        'Creo que la pelota y la portería van juntas.'
      );
      const memories = runtime.getMemoryStore().getMemories();
      assert.ok(memories.some((m) => m.type === 'object_noticed' && /Empujé/.test(m.summary)));
    } finally {
      await server.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('gate on: a failed push report clears the pending push without committing', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-push-fail-'));
    const controller = makeController(tempDir);
    const server = createWorldServer({ controller, silent: true });
    const info = await server.start(0, '127.0.0.1');
    try {
      const runtime = controller.getNpcAiRuntime();
      await moveCamilaTo(controller, 'building:dollar-2-go-building');
      setPushProvider(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const result = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(result.status, 'executed');
      assert.ok(runtime.getPendingPush(CAMILA_AGENT_ID));

      const reportRes = await fetch(`${info.url}/api/npc/agent:camila-npc/object-interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetObjectId: 'probe:ball', status: 'failed', message: 'No alcancé la pelota.' }),
      });
      assert.equal(reportRes.status, 200);
      const reportBody = (await reportRes.json()) as {
        success: boolean;
        result: { code: string; committed: boolean };
      };
      assert.equal(reportBody.success, true);
      assert.equal(reportBody.result.code, 'push-failed-reported');
      assert.equal(reportBody.result.committed, false);
      assert.equal(runtime.getPendingPush(CAMILA_AGENT_ID), undefined);

      // Nothing moved, and a fresh push works again (no stuck pending state).
      assert.deepEqual(
        controller.getCamilaObjectPositions().positions['probe:ball'],
        { x: 68, y: 0.345, z: 11.5 }
      );
      const retry = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(retry.status, 'executed');
    } finally {
      await server.stop();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('notebook deduplicates identical/near-identical hypotheses and resolves matching ones', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-hyp-dedup-'));
    try {
      const nb = new CamilaNotebook(join(tempDir, 'nb.json'));
      const h1 = nb.addHypothesis('Quizá si acerco el gis al muro puedo rayar algo', ON_DUTY_WORLD_TIME);
      const h2 = nb.addHypothesis('Quiza si acerco el gis al muro puedo rayar algo!', ON_DUTY_WORLD_TIME);
      assert.equal(h1.id, h2.id);
      assert.equal(nb.getData().hypotheses.length, 1);

      const resolved = nb.resolveMatchingHypotheses(['gis', 'muro'], 'confirmed', ON_DUTY_WORLD_TIME);
      assert.equal(resolved, 1);
      assert.equal(nb.getData().hypotheses[0].status, 'confirmed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('closed businesses are filtered from unvisitedPlaceIds and newly enriched places advertise hasUnseenObjects', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-closed-unseen-'));
    try {
      // Saturday 20:00 local (02:00 UTC next day): Wing Spot open, Pastelería La Tía Lupe closed (closes 18:00)
      const controller = makeController(tempDir, '2026-10-11T02:00:00.000Z');
      const perception = controller.getNpcPerception(CAMILA_AGENT_ID);
      assert.ok(
        !perception.unvisitedPlaceIds?.includes('building:tia-lupe-building'),
        'Closed business must not be suggested in unvisitedPlaceIds'
      );
      const dollarPlace = perception.nearbyPlaces?.find((p) => p.id === 'building:dollar-2-go-building');
      assert.equal(dollarPlace?.hasUnseenObjects, true);
      assert.ok((dollarPlace?.unseenObjectCount ?? 0) >= 6);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('supports sitting on bench/ground, scooping water/sand, pouring into cat bowl, and patching pothole with sand', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-substances-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();

      // 1. Sit on the bench at Blvd. Gómez Morín
      await moveCamilaTo(controller, 'street:blvd-gomez-morin');
      setPushProvider(controller, {
        actionType: 'sit',
        targetObjectId: 'probe:bench',
        reasoningContext: 'Voy a descansar un momento en la banca.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const sitRes = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(sitRes.status, 'executed');
      assert.equal(runtime.getPerception(CAMILA_AGENT_ID).isSitting, true);
      assert.equal(runtime.getPerception(CAMILA_AGENT_ID).sittingOn, 'probe:bench');

      // Moving away automatically clears sitting state
      await moveCamilaTo(controller, 'building:del-porvenir-residence');
      assert.equal(runtime.getPerception(CAMILA_AGENT_ID).isSitting, false);

      // 2. Pick up bucket, move to Calle Del Porvenir, scoop water from puddle
      setPushProvider(controller, {
        actionType: 'pick_up_object',
        targetObjectId: 'probe:bucket',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');
      await controller.completeObjectInteraction(CAMILA_AGENT_ID, 'probe:bucket', 'applied', { x: 7.15, y: 0.24, z: 33.1 });

      await moveCamilaTo(controller, 'street:calle-del-porvenir');
      setPushProvider(controller, {
        actionType: 'scoop',
        targetObjectId: 'probe:puddle',
        reasoningContext: 'Voy a recoger agua del bache con la cubeta.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const scoopWater = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(scoopWater.status, 'executed');
      assert.equal(runtime.getPerception(CAMILA_AGENT_ID).heldObject?.physicalState?.contents, 'water');
      const puddleAfterScoop = runtime.getPerception(CAMILA_AGENT_ID).visibleObjectsHere?.find((o) => o.id === 'probe:puddle');
      assert.equal(puddleAfterScoop?.physicalState?.waterLevel, 0.5);

      // 3. Carry water to CatZoo and pour into cat bowl
      await moveCamilaTo(controller, 'building:catzoo-building');
      setPushProvider(controller, {
        actionType: 'pour_or_apply',
        targetObjectId: 'probe:cat-bowl',
        reasoningContext: 'Le echo agua al plato del gato.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const pourWater = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(pourWater.status, 'executed');
      assert.equal(runtime.getPerception(CAMILA_AGENT_ID).heldObject?.physicalState?.contents, 'empty');
      const bowlAfter = runtime.getPerception(CAMILA_AGENT_ID).visibleObjectsHere?.find((o) => o.id === 'probe:cat-bowl');
      assert.equal(bowlAfter?.physicalState?.contents, 'water');
      assert.equal(bowlAfter?.physicalState?.waterLevel, 1);

      // 4. Go to Dollar 2 Go, scoop sand with the bucket, carry back to Calle Del Porvenir, and patch the pothole
      await moveCamilaTo(controller, 'building:dollar-2-go-building');
      setPushProvider(controller, {
        actionType: 'scoop',
        targetObjectId: 'probe:sand-pile',
        reasoningContext: 'Recojo tierra y arena en la cubeta.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');
      assert.equal(runtime.getPerception(CAMILA_AGENT_ID).heldObject?.physicalState?.contents, 'sand');

      await moveCamilaTo(controller, 'street:calle-del-porvenir');
      setPushProvider(controller, {
        actionType: 'pour_or_apply',
        targetObjectId: 'probe:puddle',
        reasoningContext: 'Echo la tierra en el bache para taparlo.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const dumpSand = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(dumpSand.status, 'executed');
      const puddleAfterSand = runtime.getPerception(CAMILA_AGENT_ID).visibleObjectsHere?.find((o) => o.id === 'probe:puddle');
      assert.equal(puddleAfterSand?.physicalState?.sandFillLevel, 0.66);
      assert.equal(puddleAfterSand?.physicalState?.waterLevel, 0);
      assert.equal(puddleAfterSand?.physicalState?.remainingDepthRatio, 0.34);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('allows chalk marking on bench/ground and feeds rejected actions back into recentWorldChanges', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-chalk-reject-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();

      await moveCamilaTo(controller, 'street:blvd-gomez-morin');
      setPushProvider(controller, {
        actionType: 'pick_up_object',
        targetObjectId: 'probe:chalk',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');
      await controller.completeObjectInteraction(CAMILA_AGENT_ID, 'probe:chalk', 'applied', { x: -8, y: 0.3, z: 2.4 });

      // Mark the bench with chalk (her exact emergent hypothesis!)
      setPushProvider(controller, {
        actionType: 'pour_or_apply',
        targetObjectId: 'probe:bench',
        reasoningContext: 'Marco la banca con el gis.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const markBench = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(markBench.status, 'executed');
      const benchObj = runtime.getPerception(CAMILA_AGENT_ID).visibleObjectsHere?.find((o) => o.id === 'probe:bench');
      assert.equal(benchObj?.physicalState?.chalkMarks, 1);

      // An impossible physical action (scooping from bench) is rejected AND recorded into recentWorldChanges
      setPushProvider(controller, {
        actionType: 'scoop',
        targetObjectId: 'probe:bench',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const badScoop = await runtime.runCycle(CAMILA_AGENT_ID);
      assert.equal(badScoop.status, 'rejected');
      assert.ok(
        (runtime.getPerception(CAMILA_AGENT_ID).recentWorldChanges ?? []).some((c) => c.includes('no funcionó')),
        'Rejected physical action must feed back into recentWorldChanges so Camila adapts instead of looping'
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('confirms sand-in-charco hypotheses without collateral refutation, scores goals, defers objectIdsSeen, and tracks placesTraversedSinceRest', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-six-improvements-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();

      // 1. Arrival at Dollar 2 Go increments placesTraversedSinceRest & keeps unseen objects until inspected/departed
      await moveCamilaTo(controller, 'building:dollar-2-go-building');
      const pArrive = runtime.getPerception(CAMILA_AGENT_ID);
      assert.equal(pArrive.placesTraversedSinceRest, 1);
      const nbOnArrive = JSON.parse(readFileSync(join(tempDir, 'camila-notebook.json'), 'utf-8')) as {
        mentalMap: { placeId: string; objectIdsSeen: string[] }[];
      };
      const dollarMap = nbOnArrive.mentalMap.find((m) => m.placeId === 'building:dollar-2-go-building');
      assert.ok(dollarMap);
      assert.ok(!dollarMap.objectIdsSeen.includes('probe:shovel'));

      // 2. Kick ball straight into small goal -> confirms soccer hypothesis & sets goalScored
      setPushProvider(controller, {
        actionType: 'push_object',
        targetObjectId: 'probe:ball',
        pushTowardsObjectId: 'probe:small-goal',
        hypothesis: 'Si pateo la pelota hacia la portería pequeña anotaré gol.',
        reasoningContext: 'Apunto la pelota hacia la portería.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');
      await controller.completeObjectInteraction(CAMILA_AGENT_ID, 'probe:ball', 'applied', { x: 68.0, y: 0.345, z: 18.45 });
      const goalObj = runtime.getPerception(CAMILA_AGENT_ID).visibleObjectsHere?.find((o) => o.id === 'probe:small-goal');
      assert.equal(goalObj?.physicalState?.goalScored, true);
      const nbAfterGoal = JSON.parse(readFileSync(join(tempDir, 'camila-notebook.json'), 'utf-8')) as {
        hypotheses: { text: string; status: string }[];
      };
      assert.equal(nbAfterGoal.hypotheses[0]?.status, 'confirmed');

      // 3. Pick up shovel, scoop sand with 'arena + charco' hypothesis -> stays open during scoop, confirms on pour!
      setPushProvider(controller, {
        actionType: 'pick_up_object',
        targetObjectId: 'probe:shovel',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');
      await controller.completeObjectInteraction(CAMILA_AGENT_ID, 'probe:shovel', 'applied', { x: 75.1, y: 0.3, z: 14.3 });

      setPushProvider(controller, {
        actionType: 'scoop',
        targetObjectId: 'probe:sand-pile',
        hypothesis: 'Si echo la arena al charco con la pala podré reducir el agua estancada.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');
      const nbMidScoop = JSON.parse(readFileSync(join(tempDir, 'camila-notebook.json'), 'utf-8')) as {
        hypotheses: { text: string; status: string }[];
      };
      const sandHypMid = nbMidScoop.hypotheses.find((h) => h.text.includes('arena al charco'));
      assert.equal(sandHypMid?.status, 'open');

      // Carry shovel to Calle Del Porvenir -> persisted shovel position syncs & placesTraversedSinceRest = 2
      await moveCamilaTo(controller, 'street:calle-del-porvenir');
      assert.equal(runtime.getPerception(CAMILA_AGENT_ID).placesTraversedSinceRest, 2);
      assert.deepEqual(controller.getCamilaObjectPositions().positions['probe:shovel'], { x: 13.5, y: 0.24, z: 22.5 });

      // Pour sand with shovel -> 0.34 sandFillLevel, confirms 'arena al charco' hypothesis!
      setPushProvider(controller, {
        actionType: 'pour_or_apply',
        targetObjectId: 'probe:puddle',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');
      const puddleAfterShovel = runtime.getPerception(CAMILA_AGENT_ID).visibleObjectsHere?.find((o) => o.id === 'probe:puddle');
      assert.equal(puddleAfterShovel?.physicalState?.sandFillLevel, 0.34);

      // Record two open hypotheses via look_at: one about bucket+charco (should stay open) and one about pala+recoger+charco (should be surgically refuted)
      setPushProvider(controller, {
        actionType: 'look_at',
        targetObjectId: 'probe:puddle',
        hypothesis: 'Quizá otro recipiente como la cubeta sirva para el charco más tarde.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');

      setPushProvider(controller, {
        actionType: 'look_at',
        targetObjectId: 'probe:puddle',
        hypothesis: 'Quizá pueda recoger agua del charco usando la pala.',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');

      // Failed water scoop with shovel refutes ONLY the pala+charco+recoger hypothesis, leaving confirmed sand & bucket hypotheses intact!
      setPushProvider(controller, {
        actionType: 'scoop',
        targetObjectId: 'probe:puddle',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'rejected');

      const nbAfterPour = JSON.parse(readFileSync(join(tempDir, 'camila-notebook.json'), 'utf-8')) as {
        hypotheses: { text: string; status: string }[];
      };
      const sandHypFinal = nbAfterPour.hypotheses.find((h) => h.text.includes('arena al charco'));
      const unrelatedCharcoHyp = nbAfterPour.hypotheses.find((h) => h.text.includes('otro recipiente'));
      const badShovelWaterHyp = nbAfterPour.hypotheses.find((h) => h.text.includes('recoger agua del charco usando la pala'));
      assert.equal(sandHypFinal?.status, 'confirmed');
      assert.equal(unrelatedCharcoHyp?.status, 'open');
      assert.equal(badShovelWaterHyp?.status, 'refuted');

      // 4. Sitting resets placesTraversedSinceRest to 0
      setPushProvider(controller, {
        actionType: 'sit',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      assert.equal((await runtime.runCycle(CAMILA_AGENT_ID)).status, 'executed');
      assert.equal(runtime.getPerception(CAMILA_AGENT_ID).placesTraversedSinceRest, 0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('prevents X-ray vision & telekinetic interactions when Camila is inside the walled Wing Spot porch alcove', async () => {
    process.env.CAMILA_ACTIONS_ENABLED = 'true';
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-alcove-occlusion-'));
    try {
      const controller = makeController(tempDir);
      const runtime = controller.getNpcAiRuntime();

      await moveCamilaTo(controller, 'street:blvd-gomez-morin');

      // Simulate Camila trapped inside Wing Spot's recessed porch alcove (-5.82, 0.24, 4.78)
      const alcoveLiveCtx = {
        camilaPosition: { x: -5.82, y: 0.24, z: 4.78 },
      };
      runtime.updateLiveSensoryContext(alcoveLiveCtx);

      const pInAlcove = runtime.getPerception(CAMILA_AGENT_ID);
      const visibleIdsInAlcove = (pInAlcove.visibleObjectsHere ?? []).map((o) => o.id);
      assert.ok(
        !visibleIdsInAlcove.includes('probe:trash-bag') &&
          !visibleIdsInAlcove.includes('probe:cup') &&
          !visibleIdsInAlcove.includes('probe:bench'),
        `Walls of Wing Spot alcove must occlude distant boulevard objects, got: ${visibleIdsInAlcove.join(', ')}`
      );

      // Attempting to pick up the cup (66m away behind Facade_Red_East_Wall) is rejected!
      setPushProvider(controller, {
        actionType: 'pick_up_object',
        targetObjectId: 'probe:cup',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const rejPickUp = await runtime.runCycle(CAMILA_AGENT_ID, alcoveLiveCtx);
      assert.equal(rejPickUp.status, 'rejected');
      assert.equal(rejPickUp.error?.code, 'object-occluded-by-wall');

      // Attempting look_at through the wall is also rejected!
      setPushProvider(controller, {
        actionType: 'look_at',
        targetObjectId: 'probe:umbrella',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const rejLook = await runtime.runCycle(CAMILA_AGENT_ID, alcoveLiveCtx);
      assert.equal(rejLook.status, 'rejected');

      // Once she steps out onto the open sidewalk (-6.75, 0.24, 2.75), she can reposition along Blvd. Gómez Morín
      const sidewalkCtx = {
        camilaPosition: { x: -6.75, y: 0.24, z: 2.75 },
      };
      setPushProvider(controller, {
        actionType: 'move_to_place',
        destinationPlaceId: 'street:blvd-gomez-morin',
        requestedAt: ON_DUTY_WORLD_TIME,
      } as NpcActionProposal);
      const repositionRes = await runtime.runCycle(CAMILA_AGENT_ID, sidewalkCtx);
      assert.equal(repositionRes.status, 'executed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});