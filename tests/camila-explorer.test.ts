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
  });
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
    const clock = new WorldClock(ON_DUTY_WORLD_TIME);
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
    assert.equal(json.probeObjects.length, 16);
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
      assert.equal(parsed.probeObjects.length, 16);
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
    assert.equal(CAMILA_PROMPT_VERSION, 'camila-prompt-v1');
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
    assert.equal(CAMILA_PROBE_OBJECTS.length, 16);
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
    assert.ok(perception.nearbyObjects && perception.nearbyObjects.length === 16);
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
});
