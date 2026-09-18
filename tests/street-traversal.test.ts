import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  enterRestaurant,
  exitRestaurant,
  leaveBuilding,
  enterBuilding,
  traverseToStreet,
  inspectCurrentLocation,
  validateWorldState,
  snapshotWorldState,
  WorldState,
} from '../src/core/world-state.js';
import { Place } from '../src/core/entities/geography.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 20-A: Intra-Neighborhood Street Traversal & Multi-Building Movement', () => {
  const OPEN_TIME = '2026-09-14T09:00:00.000Z';

  function setupWorldWithPlayerOnStreet(): {
    clock: WorldClock;
    state: WorldState;
  } {
    const clock = WorldClock.create(OPEN_TIME);
    const state = createInitialWorldState(clock);
    const leaveResult = leaveBuilding(
      state,
      'agent:dev-player',
      'building:development-building'
    );
    assert.equal(leaveResult.success, true);
    assert.equal(leaveResult.code, 'success');
    return { clock, state };
  }

  // =========================================================================
  // 1. Sibling Street Traversal Success
  // =========================================================================
  describe('Successful Sibling Street Traversal', () => {
    test('successfully traverses from Development Street to Avenida Juárez', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'street:development-street');

      const result = traverseToStreet(
        state,
        'agent:dev-player',
        'street:avenida-juarez'
      );

      assert.equal(result.success, true);
      assert.equal(result.code, 'success');
      assert.equal(result.agentId, 'agent:dev-player');
      assert.equal(result.originStreetId, 'street:development-street');
      assert.equal(result.targetStreetId, 'street:avenida-juarez');
      assert.equal(result.neighborhoodId, 'neighborhood:development-neighborhood');
      assert.equal(player.locationId, 'street:avenida-juarez');
    });

    test('successfully traverses back from Avenida Juárez to Development Street', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // First traversal: Development Street -> Avenida Juárez
      const firstResult = traverseToStreet(
        state,
        'agent:dev-player',
        'street:avenida-juarez'
      );
      assert.equal(firstResult.success, true);
      assert.equal(player.locationId, 'street:avenida-juarez');

      // Return traversal: Avenida Juárez -> Development Street
      const returnResult = traverseToStreet(
        state,
        'agent:dev-player',
        'street:development-street'
      );
      assert.equal(returnResult.success, true);
      assert.equal(returnResult.code, 'success');
      assert.equal(returnResult.originStreetId, 'street:avenida-juarez');
      assert.equal(returnResult.targetStreetId, 'street:development-street');
      assert.equal(returnResult.neighborhoodId, 'neighborhood:development-neighborhood');
      assert.equal(player.locationId, 'street:development-street');
    });
  });

  // =========================================================================
  // 2. Preconditions & Deterministic Error Handling
  // =========================================================================
  describe('Preconditions & Zero State Mutation', () => {
    test('fails with "agent-not-found" when agent does not exist', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const snapshotBefore = JSON.stringify(state);

      const result = traverseToStreet(
        state,
        'agent:non-existent',
        'street:avenida-juarez'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "agent-not-player" when NPC attempts street traversal', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      // Place NPC on street
      npc.locationId = 'street:development-street';
      const snapshotBefore = JSON.stringify(state);

      const result = traverseToStreet(
        state,
        'agent:dev-npc',
        'street:avenida-juarez'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'agent-not-player');
      assert.match(result.message, /is not a player/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "not-on-street" when player is inside a building', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'building:development-building');
      const snapshotBefore = JSON.stringify(state);

      const result = traverseToStreet(
        state,
        'agent:dev-player',
        'street:avenida-juarez'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'not-on-street');
      assert.match(result.message, /not on a street/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "not-on-street" when player is inside a restaurant', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Open restaurant
      enterRestaurant(state, 'agent:dev-player', 'restaurant:development-restaurant');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'restaurant:development-restaurant');
      const snapshotBefore = JSON.stringify(state);

      const result = traverseToStreet(
        state,
        'agent:dev-player',
        'street:avenida-juarez'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'not-on-street');
      assert.match(result.message, /not on a street/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "target-not-found" when target street does not exist', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const snapshotBefore = JSON.stringify(state);

      const result = traverseToStreet(
        state,
        'agent:dev-player',
        'street:non-existent'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'target-not-found');
      assert.match(result.message, /not found in world state/);
      assert.equal(result.originStreetId, 'street:development-street');
      assert.equal(result.neighborhoodId, 'neighborhood:development-neighborhood');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "target-not-street" when target is a building place', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const snapshotBefore = JSON.stringify(state);

      const result = traverseToStreet(
        state,
        'agent:dev-player',
        'building:development-building'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'target-not-street');
      assert.match(result.message, /is not a street/);
      assert.equal(result.originStreetId, 'street:development-street');
      assert.equal(result.neighborhoodId, 'neighborhood:development-neighborhood');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "target-not-street" when target is a district place', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const snapshotBefore = JSON.stringify(state);

      const result = traverseToStreet(
        state,
        'agent:dev-player',
        'district:development-district'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'target-not-street');
      assert.match(result.message, /is not a street/);
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "already-on-street" when target is the current street', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const snapshotBefore = JSON.stringify(state);

      const result = traverseToStreet(
        state,
        'agent:dev-player',
        'street:development-street'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'already-on-street');
      assert.match(result.message, /is already on street/);
      assert.equal(result.originStreetId, 'street:development-street');
      assert.equal(result.neighborhoodId, 'neighborhood:development-neighborhood');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails with "different-neighborhood" when target street belongs to a different neighborhood', () => {
      const { state } = setupWorldWithPlayerOnStreet();

      // Add another neighborhood and street to test cross-neighborhood rejection
      const otherNeighborhood: Place = {
        id: 'neighborhood:other-neighborhood',
        type: 'neighborhood',
        name: 'Other Neighborhood',
        parentId: 'district:development-district',
      };
      const otherStreet: Place = {
        id: 'street:other-street',
        type: 'street',
        name: 'Other Street',
        parentId: 'neighborhood:other-neighborhood',
      };
      state.places.push(otherNeighborhood, otherStreet);

      const snapshotBefore = JSON.stringify(state);

      const result = traverseToStreet(
        state,
        'agent:dev-player',
        'street:other-street'
      );

      assert.equal(result.success, false);
      assert.equal(result.code, 'different-neighborhood');
      assert.match(result.message, /not in the same neighborhood/);
      assert.equal(result.originStreetId, 'street:development-street');
      assert.equal(result.neighborhoodId, 'neighborhood:development-neighborhood');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 3. Multi-Building Movement on Same Street
  // =========================================================================
  describe('Multi-Building Movement on Same Street', () => {
    test('allows entering and leaving both buildings on Development Street', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'street:development-street');

      // 1. Enter Development Building
      const enterB1 = enterBuilding(state, player.id, 'building:development-building');
      assert.equal(enterB1.success, true);
      assert.equal(player.locationId, 'building:development-building');

      // 2. Leave Development Building -> back to Development Street
      const leaveB1 = leaveBuilding(state, player.id, 'building:development-building');
      assert.equal(leaveB1.success, true);
      assert.equal(player.locationId, 'street:development-street');

      // 3. Enter Development Residence (second building on same street)
      const enterB2 = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(enterB2.success, true);
      assert.equal(enterB2.buildingId, 'building:development-residence');
      assert.equal(enterB2.streetId, 'street:development-street');
      assert.equal(player.locationId, 'building:development-residence');

      // 4. Leave Development Residence -> back to Development Street
      const leaveB2 = leaveBuilding(state, player.id, 'building:development-residence');
      assert.equal(leaveB2.success, true);
      assert.equal(leaveB2.streetId, 'street:development-street');
      assert.equal(player.locationId, 'street:development-street');
    });

    test('allows entering and leaving kiosk building on Avenida Juárez', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Traverse to Avenida Juárez
      const trav = traverseToStreet(state, player.id, 'street:avenida-juarez');
      assert.equal(trav.success, true);
      assert.equal(player.locationId, 'street:avenida-juarez');

      // Enter Avenida Juárez Kiosk
      const enterKiosk = enterBuilding(state, player.id, 'building:avenida-juarez-kiosk');
      assert.equal(enterKiosk.success, true);
      assert.equal(enterKiosk.buildingId, 'building:avenida-juarez-kiosk');
      assert.equal(enterKiosk.streetId, 'street:avenida-juarez');
      assert.equal(player.locationId, 'building:avenida-juarez-kiosk');

      // Leave Avenida Juárez Kiosk -> back to Avenida Juárez
      const leaveKiosk = leaveBuilding(state, player.id, 'building:avenida-juarez-kiosk');
      assert.equal(leaveKiosk.success, true);
      assert.equal(leaveKiosk.streetId, 'street:avenida-juarez');
      assert.equal(player.locationId, 'street:avenida-juarez');
    });

    test('rejects entering a building from a different street with "invalid-location"', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'street:development-street');

      // Player on Development Street cannot enter Avenida Juárez Kiosk directly
      const snapshotBefore = JSON.stringify(state);
      const enterResult = enterBuilding(state, player.id, 'building:avenida-juarez-kiosk');
      assert.equal(enterResult.success, false);
      assert.equal(enterResult.code, 'invalid-location');
      assert.equal(JSON.stringify(state), snapshotBefore);

      // Now traverse to Avenida Juárez
      traverseToStreet(state, player.id, 'street:avenida-juarez');
      assert.equal(player.locationId, 'street:avenida-juarez');

      // Player on Avenida Juárez cannot enter Development Building or Residence directly
      const enterB1Result = enterBuilding(state, player.id, 'building:development-building');
      assert.equal(enterB1Result.success, false);
      assert.equal(enterB1Result.code, 'invalid-location');

      const enterB2Result = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(enterB2Result.success, false);
      assert.equal(enterB2Result.code, 'invalid-location');
    });
  });

  // =========================================================================
  // 4. Complete Traversal Circuit
  // =========================================================================
  describe('Complete Spatial Traversal Circuit', () => {
    test('navigates Restaurant -> Building 1 -> Street 1 -> Building 2 -> Street 1 -> Street 2 -> Building 3 -> Street 2 -> Street 1 -> Building 1 -> Restaurant', () => {
      const clock = WorldClock.create(OPEN_TIME);
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Open restaurant

      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'building:development-building');

      // 1. Enter restaurant
      const r1 = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
      assert.equal(r1.success, true);
      assert.equal(player.locationId, 'restaurant:development-restaurant');

      // 2. Exit restaurant -> Building 1
      const r2 = exitRestaurant(state, player.id, 'restaurant:development-restaurant');
      assert.equal(r2.success, true);
      assert.equal(player.locationId, 'building:development-building');

      // 3. Leave Building 1 -> Street 1
      const r3 = leaveBuilding(state, player.id, 'building:development-building');
      assert.equal(r3.success, true);
      assert.equal(player.locationId, 'street:development-street');

      // 4. Enter Building 2 (Residence)
      const r4 = enterBuilding(state, player.id, 'building:development-residence');
      assert.equal(r4.success, true);
      assert.equal(player.locationId, 'building:development-residence');

      // 5. Leave Building 2 -> Street 1
      const r5 = leaveBuilding(state, player.id, 'building:development-residence');
      assert.equal(r5.success, true);
      assert.equal(player.locationId, 'street:development-street');

      // 6. Traverse to Street 2 (Avenida Juárez)
      const r6 = traverseToStreet(state, player.id, 'street:avenida-juarez');
      assert.equal(r6.success, true);
      assert.equal(player.locationId, 'street:avenida-juarez');

      // 7. Enter Building 3 (Kiosk)
      const r7 = enterBuilding(state, player.id, 'building:avenida-juarez-kiosk');
      assert.equal(r7.success, true);
      assert.equal(player.locationId, 'building:avenida-juarez-kiosk');

      // 8. Leave Building 3 -> Street 2
      const r8 = leaveBuilding(state, player.id, 'building:avenida-juarez-kiosk');
      assert.equal(r8.success, true);
      assert.equal(player.locationId, 'street:avenida-juarez');

      // 9. Traverse back to Street 1
      const r9 = traverseToStreet(state, player.id, 'street:development-street');
      assert.equal(r9.success, true);
      assert.equal(player.locationId, 'street:development-street');

      // 10. Enter Building 1
      const r10 = enterBuilding(state, player.id, 'building:development-building');
      assert.equal(r10.success, true);
      assert.equal(player.locationId, 'building:development-building');

      // 11. Re-enter Restaurant
      const r11 = enterRestaurant(state, player.id, 'restaurant:development-restaurant');
      assert.equal(r11.success, true);
      assert.equal(player.locationId, 'restaurant:development-restaurant');
    });
  });

  // =========================================================================
  // 5. Perception on Sibling Street
  // =========================================================================
  describe('Perception on Sibling Street', () => {
    test('inspectCurrentLocation accurately reflects Avenida Juárez state', () => {
      const { state } = setupWorldWithPlayerOnStreet();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      traverseToStreet(state, player.id, 'street:avenida-juarez');

      const perception = inspectCurrentLocation(state, player.id);
      assert.equal(perception.success, true);
      assert.ok(perception.location);
      assert.equal(perception.location.id, 'street:avenida-juarez');
      assert.equal(perception.location.type, 'street');
      assert.equal(perception.location.name, 'Avenida Juárez');
      assert.equal(perception.location.parentId, 'neighborhood:development-neighborhood');
      assert.equal(perception.location.agents.length, 1);
      assert.equal(perception.location.agents[0].id, 'agent:dev-player');
    });
  });

  // =========================================================================
  // 6. Simulation Isolation & NPC Autonomy
  // =========================================================================
  describe('Simulation Isolation', () => {
    test('simulation ticks do not alter player location on sibling street', () => {
      const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
      const state = createInitialWorldState(clock);
      const leaveResult = leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      assert.equal(leaveResult.success, true);

      // Move player to Avenida Juárez
      traverseToStreet(state, 'agent:dev-player', 'street:avenida-juarez');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'street:avenida-juarez');

      // Run simulation across multiple ticks
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // 08:00
      clock.advance(3600000); // 09:00
      sim.tick();

      // NPC should have moved to restaurant at 09:00
      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'restaurant:development-restaurant');

      // Player must remain undisturbed on Avenida Juárez
      assert.equal(player.locationId, 'street:avenida-juarez');

      clock.advance(28800000); // 17:00
      sim.tick();
      // NPC routine finishes shift, moves to Avenida Juárez
      assert.equal(npc.locationId, 'street:avenida-juarez');

      // Player still undisturbed
      assert.equal(player.locationId, 'street:avenida-juarez');
    });
  });

  // =========================================================================
  // 7. Persistence & Schema Preservation (Schema Version 10)
  // =========================================================================
  describe('Persistence Roundtrip & Schema Preservation', () => {
    test('persists and restores cleanly with Schema Version 10 when player is on Avenida Juárez', () => {
      const testFile = join(tmpdir(), `test-street-traversal-${Date.now()}.json`);
      try {
        const { clock, state } = setupWorldWithPlayerOnStreet();
        traverseToStreet(state, 'agent:dev-player', 'street:avenida-juarez');

        const persistence = new LocalFilePersistence(testFile);
        const snapshot = snapshotWorldState(clock, state);
        persistence.save(snapshot);

        const loadedState = persistence.load();
        assert.ok(loadedState !== null);
        assert.equal(loadedState.version, 12);
        validateWorldState(loadedState);

        const loadedPlayer = loadedState.agents.find((a) => a.id === 'agent:dev-player')!;
        assert.equal(loadedPlayer.locationId, 'street:avenida-juarez');
        assert.equal(loadedState.places.length, 8);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });

    test('persists and restores cleanly when player is inside Avenida Juárez Kiosk', () => {
      const testFile = join(tmpdir(), `test-kiosk-traversal-${Date.now()}.json`);
      try {
        const { clock, state } = setupWorldWithPlayerOnStreet();
        traverseToStreet(state, 'agent:dev-player', 'street:avenida-juarez');
        enterBuilding(state, 'agent:dev-player', 'building:avenida-juarez-kiosk');

        const persistence = new LocalFilePersistence(testFile);
        const snapshot = snapshotWorldState(clock, state);
        persistence.save(snapshot);

        const loadedState = persistence.load();
        assert.ok(loadedState !== null);
        assert.equal(loadedState.version, 12);
        validateWorldState(loadedState);

        const loadedPlayer = loadedState.agents.find((a) => a.id === 'agent:dev-player')!;
        assert.equal(loadedPlayer.locationId, 'building:avenida-juarez-kiosk');
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });
});
