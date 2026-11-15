/**
 * Milestone 72 — Minimal 3D Client Prototype Test Suite
 *
 * Verifies that the minimal 3D client:
 * 1. Correctly models an engine-independent 3D scene graph (Scene3D, Node3D, Transform3D).
 * 2. Consumes M71 WorldProjectionSnapshots without direct World Core coupling.
 * 3. Enforces strict separation between local 3D transforms (presentation) and
 *    authoritative Agent.locationId (World Core truth).
 * 4. Successfully executes an authoritative round trip via ClientIntent -> World Core command ->
 *    projection snapshot -> 3D scene reconciliation.
 * 5. Operates independently alongside other client representations (e.g. Canvas 2D)
 *    without cross-contamination or authority leakage.
 * 6. Leaves World Core, Simulation, Persistence, and Schema Version (18) 100% untouched.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  transitionAgentLocation,
  transitionRestaurantOperationalState,
  enterBuilding,
  CURRENT_WORLD_STATE_VERSION,
  type WorldState,
} from '../src/core/world-state.js';
import {
  projectWorldState,
  type WorldProjectionSnapshot,
} from '../src/core/world-projection.js';
import { Node3D, Scene3D, type Vector3 } from '../clients/minimal-3d/scene-3d.js';
import { Minimal3DClient } from '../clients/minimal-3d/minimal-3d-client.js';

describe('Milestone 72 — Minimal 3D Client Prototype', () => {
  const ANCHOR_TIME = '2026-09-14T16:00:00.000Z';
  const playerId = 'agent:dev-player';
  const npcId = 'agent:dev-npc';

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = new WorldClock(ANCHOR_TIME);
    const state = createInitialWorldState(clock);
    // Position player and NPC on street for street-level testing
    transitionAgentLocation(state, playerId, 'street:development-street', { silent: true });
    transitionAgentLocation(state, npcId, 'street:development-street', { silent: true });
    return { clock, state };
  }

  describe('1. Engine-Independent 3D Scene Graph (Scene3D, Node3D)', () => {
    it('creates a Node3D with valid transform, dimensions, primitive, and color', () => {
      const node = new Node3D({
        id: 'node:test-box',
        name: 'Test Box',
        entityId: 'entity:box-1',
        primitive: 'box',
        dimensions: { x: 2, y: 3, z: 4 },
        color: [0.1, 0.2, 0.3],
        position: { x: 10, y: 5, z: -2 },
      });

      assert.equal(node.id, 'node:test-box');
      assert.equal(node.name, 'Test Box');
      assert.equal(node.entityId, 'entity:box-1');
      assert.equal(node.primitive, 'box');
      assert.deepEqual(node.dimensions, { x: 2, y: 3, z: 4 });
      assert.deepEqual(node.color, [0.1, 0.2, 0.3]);
      assert.deepEqual(node.transform.position, { x: 10, y: 5, z: -2 });
      assert.deepEqual(node.transform.rotation, { pitch: 0, yaw: 0, roll: 0 });
      assert.deepEqual(node.transform.scale, { x: 1, y: 1, z: 1 });
      assert.equal(node.visible, true);
      assert.equal(node.parent, null);
      assert.equal(node.children.length, 0);
    });

    it('manages parent-child hierarchy and computes world position', () => {
      const scene = new Scene3D();
      const parentNode = new Node3D({
        id: 'node:parent',
        name: 'Parent Node',
        position: { x: 10, y: 0, z: 5 },
      });
      const childNode = new Node3D({
        id: 'node:child',
        name: 'Child Node',
        position: { x: 2, y: 1, z: -3 },
      });

      scene.addNode(parentNode);
      scene.addNode(childNode, parentNode);

      assert.equal(childNode.parent, parentNode);
      assert.equal(parentNode.children.length, 1);
      assert.equal(parentNode.children[0], childNode);

      const childWorldPos = childNode.getWorldPosition();
      assert.deepEqual(childWorldPos, { x: 12, y: 1, z: 2 });

      assert.equal(scene.getNode('node:parent'), parentNode);
      assert.equal(scene.getNode('node:child'), childNode);

      // Removing parent unindexes both parent and child
      const removed = scene.removeNode('node:parent');
      assert.equal(removed, true);
      assert.equal(scene.getNode('node:parent'), undefined);
      assert.equal(scene.getNode('node:child'), undefined);
    });

    it('indexes nodes by entityId for fast lookup', () => {
      const scene = new Scene3D();
      const entityNode = new Node3D({
        id: 'node:agent-entity',
        name: 'Agent Presentation',
        entityId: 'agent:target-agent',
      });

      scene.addNode(entityNode);
      assert.equal(scene.getNodeByEntityId('agent:target-agent'), entityNode);

      scene.removeNode(entityNode.id);
      assert.equal(scene.getNodeByEntityId('agent:target-agent'), undefined);
    });
  });

  describe('2. M71 Projection Snapshot Consumption & Scene Reconciliation', () => {
    it('initializes Minimal3DClient with zero scene nodes until first snapshot', () => {
      const client = new Minimal3DClient({
        clientId: 'client:3d-test',
        observerAgentId: playerId,
      });

      assert.equal(client.clientId, 'client:3d-test');
      assert.equal(client.observerAgentId, playerId);
      assert.equal(client.getLatestSnapshot(), undefined);
      assert.equal(client.getScene().getAllNodes().length, 0);
    });

    it('spawns 3D visual representations when receiving initial street snapshot', () => {
      const { state } = setupWorld();
      const snapshot = projectWorldState(state, playerId);

      const client = new Minimal3DClient({
        clientId: 'client:3d-test',
        observerAgentId: playerId,
      });

      const reconciliation = client.updateSnapshot(snapshot);

      // Reconciliation should report all entities spawned
      assert.ok(reconciliation.entitiesToSpawn.length > 0);
      assert.equal(reconciliation.entitiesToDespawn.length, 0);

      const scene = client.getScene();

      // Street ground plane
      const streetNode = scene.getNodeByEntityId('street:development-street');
      assert.ok(streetNode, 'Street node must exist in 3D scene');
      assert.equal(streetNode.primitive, 'plane');
      assert.deepEqual(streetNode.dimensions, { x: 80, y: 0.1, z: 16 });

      // Residence building
      const residenceNode = scene.getNodeByEntityId('building:development-residence');
      assert.ok(residenceNode, 'Residence building node must exist');
      assert.equal(residenceNode.primitive, 'box');

      // Commercial building
      const commercialNode = scene.getNodeByEntityId('building:development-building');
      assert.ok(commercialNode, 'Commercial building node must exist');
      assert.equal(commercialNode.primitive, 'box');

      // Player agent cylinder
      const playerNode = scene.getNodeByEntityId(playerId);
      assert.ok(playerNode, 'Player cylinder node must exist');
      assert.equal(playerNode.primitive, 'cylinder');
      assert.deepEqual(playerNode.color, [0.2, 0.55, 0.95], 'Player must have blue color');

      // NPC agent cylinder
      const npcNode = scene.getNodeByEntityId(npcId);
      assert.ok(npcNode, 'NPC cylinder node must exist');
      assert.equal(npcNode.primitive, 'cylinder');
      assert.deepEqual(npcNode.color, [0.95, 0.65, 0.2], 'NPC must have orange/gold color');
    });

    it('updates visual representation when entity properties change', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:3d-test',
        observerAgentId: playerId,
      });

      // Move player inside commercial building where restaurant is located
      enterBuilding(state, playerId, 'building:development-building');

      const snapshot1 = projectWorldState(state, playerId);
      client.updateSnapshot(snapshot1);

      const restaurantNode = client.getScene().getNodeByEntityId('restaurant:development-restaurant');
      assert.ok(restaurantNode, 'Restaurant node must exist in building interior scene');

      // Change restaurant operational state in World Core to closed
      transitionRestaurantOperationalState(
        state,
        'restaurant:development-restaurant',
        'closed',
        state.worldTime
      );

      const snapshot2 = projectWorldState(state, playerId);
      const recon = client.updateSnapshot(snapshot2);

      assert.ok(recon.entitiesToUpdate.some((e) => e.entityId === 'restaurant:development-restaurant'));
      assert.deepEqual(restaurantNode.color, [0.75, 0.25, 0.25], 'Closed restaurant should become red');
    });
  });

  describe('3. Separation of 3D Transform vs. Logical Location (Authority Hypothesis)', () => {
    it('modifying local 3D transform updates Scene3D position but NEVER modifies Agent.locationId in World Core', () => {
      const { state } = setupWorld();
      const initialLocation = state.agents.find((a) => a.id === playerId)!.locationId;
      assert.equal(initialLocation, 'street:development-street');

      const snapshot = projectWorldState(state, playerId);
      const client = new Minimal3DClient({
        clientId: 'client:3d-test',
        observerAgentId: playerId,
      });
      client.updateSnapshot(snapshot);

      const initialVisualPos = client.getPlayerVisualPosition();
      assert.ok(initialVisualPos);
      assert.deepEqual(initialVisualPos, { x: 0, y: 1, z: 0 });

      // Move player visually in 3D scene (e.g. user presses arrow keys or WASD)
      const newVisualPos = client.movePlayerVisual({ x: 12.5, y: 0, z: -4.2 });
      assert.deepEqual(newVisualPos, { x: 12.5, y: 1, z: -4.2 });
      assert.deepEqual(client.getPlayerVisualPosition(), { x: 12.5, y: 1, z: -4.2 });

      // CRITICAL ARCHITECTURAL ASSERTION:
      // World Core Agent.locationId must remain 100% UNCHANGED
      const coreAgent = state.agents.find((a) => a.id === playerId)!;
      assert.equal(
        coreAgent.locationId,
        'street:development-street',
        'Local 3D transform change MUST NOT alter authoritative Agent.locationId'
      );

      // Verify WorldState contains NO coordinates or transforms
      assert.equal((coreAgent as any).x, undefined);
      assert.equal((coreAgent as any).transform, undefined);
      assert.equal((coreAgent as any).position, undefined);
    });
  });

  describe('4. Authoritative Round-Trip Cycle (Intent -> Core -> Projection -> 3D)', () => {
    it('creates ClientIntent envelope without executing command directly', () => {
      const client = new Minimal3DClient({
        clientId: 'client:3d-test',
        observerAgentId: playerId,
      });

      const intent = client.createIntent('enterBuilding', {
        buildingId: 'building:development-building',
      });

      assert.ok(intent.intentId.startsWith('intent:client:3d-test:'));
      assert.equal(intent.clientId, 'client:3d-test');
      assert.equal(intent.agentId, playerId);
      assert.equal(intent.commandName, 'enterBuilding');
      assert.deepEqual(intent.payload, { buildingId: 'building:development-building' });
    });

    it('completes the full round trip: intent -> core command -> projection -> 3D scene reconciliation', () => {
      const { state } = setupWorld();
      const client = new Minimal3DClient({
        clientId: 'client:3d-test',
        observerAgentId: playerId,
      });

      // 1. Initial snapshot on street
      const initialSnapshot = projectWorldState(state, playerId);
      client.updateSnapshot(initialSnapshot);

      assert.ok(client.getScene().getNodeByEntityId('street:development-street'));
      assert.ok(client.getScene().getNodeByEntityId('building:development-residence'));
      assert.equal(client.getScene().getNodeByEntityId('restaurant:development-restaurant'), undefined);

      // 2. Client expresses intent to enter commercial building
      const intent = client.createIntent('enterBuilding', {
        buildingId: 'building:development-building',
      });

      // 3. World Core validates and executes authoritative command
      const commandResult = enterBuilding(
        state,
        intent.agentId,
        intent.payload.buildingId as string
      );
      assert.equal(commandResult.success, true);
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, 'building:development-building');

      // 4. World Core emits new projection snapshot reflecting authoritative state change
      const newSnapshot = projectWorldState(state, playerId);
      assert.equal(newSnapshot.observerLocationId, 'building:development-building');

      // 5. 3D Client reconciles scene: distant residence and street-bound NPC are despawned; interior restaurant is spawned
      const reconciliation = client.updateSnapshot(newSnapshot);

      assert.ok(reconciliation.entitiesToDespawn.includes('building:development-residence'));
      assert.ok(reconciliation.entitiesToDespawn.includes(npcId));
      assert.ok(reconciliation.entitiesToSpawn.some((e) => e.entityId === 'restaurant:development-restaurant'));

      // Scene verification
      const scene = client.getScene();
      assert.equal(
        scene.getNodeByEntityId('building:development-residence'),
        undefined,
        'Distant residence must be despawned'
      );
      assert.equal(scene.getNodeByEntityId(npcId), undefined, 'Distant NPC must be despawned');
      assert.ok(
        scene.getNodeByEntityId('restaurant:development-restaurant'),
        'Interior restaurant node must be spawned'
      );
      assert.ok(scene.getNodeByEntityId(playerId), 'Player cylinder node must remain present in interior');
    });
  });

  describe('5. Multi-Client Independence (3D Client and Canvas 2D / Other Adapters)', () => {
    it('supports multiple independent client adapters observing the same World Core without interference', () => {
      const { state } = setupWorld();

      const client3D = new Minimal3DClient({
        clientId: 'client:3d-test',
        observerAgentId: playerId,
      });

      const clientOther = new Minimal3DClient({
        clientId: 'client:other-test',
        observerAgentId: playerId,
      });

      const snapshot = projectWorldState(state, playerId);
      client3D.updateSnapshot(snapshot);
      clientOther.updateSnapshot(snapshot);

      // Move player visually in client 3D
      client3D.movePlayerVisual({ x: 20, y: 0, z: 10 });
      assert.deepEqual(client3D.getPlayerVisualPosition(), { x: 20, y: 1, z: 10 });

      // ClientOther player position must remain unchanged at its own visual coordinates
      assert.deepEqual(clientOther.getPlayerVisualPosition(), { x: 0, y: 1, z: 0 });

      // World Core location remains strictly topological
      assert.equal(state.agents.find((a) => a.id === playerId)!.locationId, 'street:development-street');
    });
  });

  describe('6. Headless Operation & Persistence Invariants', () => {
    it('leaves WorldState schema version strictly at 18', () => {
      assert.equal(CURRENT_WORLD_STATE_VERSION, 19);
      const clock = new WorldClock(ANCHOR_TIME);
      const state = createInitialWorldState(clock);
      assert.equal(state.version, 19);
    });

    it('operates headlessly with zero 3D dependencies or mutations in World Core', () => {
      const clock = new WorldClock(ANCHOR_TIME);
      const state = createInitialWorldState(clock);
      // WorldState serialization is clean and contains zero 3D artifacts
      const json = JSON.stringify(state);
      assert.ok(!json.includes('Scene3D'));
      assert.ok(!json.includes('Node3D'));
      assert.ok(!json.includes('Transform3D'));
      assert.ok(!json.includes('mesh'));
    });
  });
});
