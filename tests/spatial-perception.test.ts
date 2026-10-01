import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { Simulation } from '../src/core/simulation.js';
import {
  createInitialWorldState,
  inspectCurrentLocation,
  enterBuilding,
  leaveBuilding,
  enterRestaurant,
  exitRestaurant,
  traverseToStreet,
  snapshotWorldState,
  validateWorldState,
  WorldState,
} from '../src/core/world-state.js';
import { Place } from '../src/core/entities/geography.js';
import { Restaurant } from '../src/core/entities/restaurant.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 21-A: Local Spatial Affordance Perception', () => {
  const OPEN_TIME = '2026-09-14T09:00:00.000Z';

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(OPEN_TIME);
    const state = createInitialWorldState(clock);
    return { clock, state };
  }

  // =========================================================================
  // 1. Street-Level Spatial Affordances
  // =========================================================================
  describe('Street-Level Spatial Affordances', () => {
    test('player on Street sees direct child buildings', () => {
      const { state } = setupWorld();
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'street:development-street');

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location);
      assert.equal(result.location.type, 'street');
      assert.ok(result.location.accessibleBuildings);
      assert.equal(result.location.accessibleBuildings.length, 2);

      const buildingIds = result.location.accessibleBuildings.map((b) => b.id);
      assert.ok(buildingIds.includes('building:development-building'));
      assert.ok(buildingIds.includes('building:development-residence'));

      // Verify projection structure
      for (const b of result.location.accessibleBuildings) {
        assert.equal(b.type, 'building');
        assert.ok(typeof b.name === 'string' && b.name.length > 0);
      }
    });

    test('player on Street sees sibling streets in the same Neighborhood', () => {
      const { state } = setupWorld();
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location);
      assert.ok(result.location.neighboringStreets);
      assert.equal(result.location.neighboringStreets.length, 1);

      const sibling = result.location.neighboringStreets[0];
      assert.equal(sibling.id, 'street:avenida-juarez');
      assert.equal(sibling.name, 'Avenida Juárez');
      assert.equal(sibling.type, 'street');
    });

    test('current Street is strictly excluded from neighboringStreets', () => {
      const { state } = setupWorld();
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location?.neighboringStreets);
      const streetIds = result.location.neighboringStreets.map((s) => s.id);
      assert.equal(streetIds.includes('street:development-street'), false);
    });

    test('buildings belonging to another street are NOT exposed', () => {
      const { state } = setupWorld();
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location?.accessibleBuildings);
      const buildingIds = result.location.accessibleBuildings.map((b) => b.id);
      // Avenida Juárez Kiosk belongs to street:avenida-juarez, not street:development-street
      assert.equal(buildingIds.includes('building:avenida-juarez-kiosk'), false);
    });

    test('streets belonging to another Neighborhood are NOT exposed', () => {
      const { state } = setupWorld();
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // Add another neighborhood with a street
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

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location?.neighboringStreets);
      const streetIds = result.location.neighboringStreets.map((s) => s.id);
      assert.equal(streetIds.includes('street:other-street'), false);
    });

    test('street context does NOT expose building or restaurant affordances', () => {
      const { state } = setupWorld();
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location);
      assert.equal(result.location.parentStreet, undefined);
      assert.equal(result.location.containedRestaurants, undefined);
      assert.equal(result.location.parentBuilding, undefined);
    });

    test('street with parentId === null omits neighboringStreets', () => {
      const { state } = setupWorld();
      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const street = state.places.find((p) => p.id === 'street:development-street')!;
      street.parentId = null;

      const result = inspectCurrentLocation(state, 'agent:dev-player');
      assert.ok(result.location);
      assert.equal(result.location.neighboringStreets, undefined);
    });

    test('street with no child buildings returns empty accessibleBuildings array', () => {
      const { state } = setupWorld();
      // Create a new street with no buildings
      const emptyStreet: Place = {
        id: 'street:empty-street',
        type: 'street',
        name: 'Empty Street',
        parentId: 'neighborhood:development-neighborhood',
      };
      state.places.push(emptyStreet);
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'street:empty-street';

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location);
      assert.deepEqual(result.location.accessibleBuildings, []);
    });
  });

  // =========================================================================
  // 2. Building-Level Spatial Affordances
  // =========================================================================
  describe('Building-Level Spatial Affordances', () => {
    test('player on Building sees its parent Street', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      assert.equal(player.locationId, 'building:development-building');

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location);
      assert.equal(result.location.type, 'building');
      assert.ok(result.location.parentStreet);
      assert.equal(result.location.parentStreet.id, 'street:development-street');
      assert.equal(result.location.parentStreet.name, 'Development Street');
      assert.equal(result.location.parentStreet.type, 'street');
    });

    test('player on Building sees contained restaurants', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location);
      assert.ok(result.location.containedRestaurants);
      assert.equal(result.location.containedRestaurants.length, 1);
      assert.equal(result.location.containedRestaurants[0].id, 'restaurant:development-restaurant');
      assert.equal(result.location.containedRestaurants[0].name, 'Development Restaurant');
      assert.equal(result.location.containedRestaurants[0].type, 'restaurant');
    });

    test('building with no restaurants returns empty containedRestaurants array', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      // Development Residence has no restaurants
      player.locationId = 'building:development-residence';

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location);
      assert.deepEqual(result.location.containedRestaurants, []);
      assert.ok(result.location.parentStreet);
      assert.equal(result.location.parentStreet.id, 'street:development-street');
    });

    test('building context does NOT expose street-level affordances or parentBuilding', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location);
      assert.equal(result.location.accessibleBuildings, undefined);
      assert.equal(result.location.neighboringStreets, undefined);
      assert.equal(result.location.parentBuilding, undefined);
    });

    test('building with missing or invalid parentId omits parentStreet without crashing', () => {
      const { state } = setupWorld();
      const building = state.places.find((p) => p.id === 'building:development-building')!;
      building.parentId = 'street:non-existent';

      const result = inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(result.success, true);
      assert.ok(result.location);
      assert.equal(result.location.parentStreet, undefined);
    });
  });

  // =========================================================================
  // 3. Restaurant-Level Spatial Affordances
  // =========================================================================
  describe('Restaurant-Level Spatial Affordances', () => {
    test('player on Restaurant sees its parent Building', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:development-restaurant';

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location);
      assert.equal(result.location.type, 'restaurant');
      assert.ok(result.location.parentBuilding);
      assert.equal(result.location.parentBuilding.id, 'building:development-building');
      assert.equal(result.location.parentBuilding.name, 'Development Building');
      assert.equal(result.location.parentBuilding.type, 'building');
    });

    test('restaurant context does NOT expose street or building sibling affordances', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:development-restaurant';

      const result = inspectCurrentLocation(state, player.id);
      assert.ok(result.location);
      assert.equal(result.location.accessibleBuildings, undefined);
      assert.equal(result.location.neighboringStreets, undefined);
      assert.equal(result.location.parentStreet, undefined);
      assert.equal(result.location.containedRestaurants, undefined);
    });

    test('restaurant with invalid buildingId omits parentBuilding without crashing', () => {
      const { state } = setupWorld();
      const restaurant = state.restaurants.find((r) => r.id === 'restaurant:development-restaurant')!;
      restaurant.buildingId = 'building:non-existent';
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'restaurant:development-restaurant';

      const result = inspectCurrentLocation(state, player.id);
      assert.equal(result.success, true);
      assert.ok(result.location);
      assert.equal(result.location.parentBuilding, undefined);
    });
  });

  // =========================================================================
  // 4. Invariants, Traversal Integration & Persistence
  // =========================================================================
  describe('Invariants, Traversal Integration & Persistence', () => {
    test('failure behavior of inspectCurrentLocation remains unchanged', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      // Unknown agent
      const r1 = inspectCurrentLocation(state, 'agent:ghost');
      assert.equal(r1.success, false);
      assert.equal(r1.code, 'player-not-found');

      // NPC
      const r2 = inspectCurrentLocation(state, 'agent:dev-npc');
      assert.equal(r2.success, false);
      assert.equal(r2.code, 'player-not-player');

      // Invalid location
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'place:void';
      const r3 = inspectCurrentLocation(state, player.id);
      assert.equal(r3.success, false);
      assert.equal(r3.code, 'player-location-invalid');

      player.locationId = 'building:development-building';
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('inspection produces ZERO state mutation', () => {
      const { state } = setupWorld();
      const snapshotBefore = JSON.stringify(state);

      inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(JSON.stringify(state), snapshotBefore);

      leaveBuilding(state, 'agent:dev-player', 'building:development-building');
      const snapshotStreet = JSON.stringify(state);
      inspectCurrentLocation(state, 'agent:dev-player');
      assert.equal(JSON.stringify(state), snapshotStreet);
    });

    test('closed-loop perception to traversal navigation', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;

      // 1. Player leaves building onto Development Street
      leaveBuilding(state, player.id, 'building:development-building');

      // 2. Perceive street affordances
      const streetInspect = inspectCurrentLocation(state, player.id);
      assert.ok(streetInspect.location?.neighboringStreets);

      // 3. Find Avenida Juárez from perception
      const targetStreet = streetInspect.location.neighboringStreets.find(
        (s) => s.id === 'street:avenida-juarez'
      );
      assert.ok(targetStreet);

      // 4. Traverse using perceived target ID
      const traverseResult = traverseToStreet(state, player.id, targetStreet.id);
      assert.equal(traverseResult.success, true);
      assert.equal(player.locationId, 'street:avenida-juarez');

      // 5. Perceive Avenida Juárez affordances
      const aveInspect = inspectCurrentLocation(state, player.id);
      assert.ok(aveInspect.location?.accessibleBuildings);

      // 6. Find kiosk from perception
      const kiosk = aveInspect.location.accessibleBuildings.find(
        (b) => b.id === 'building:avenida-juarez-kiosk'
      );
      assert.ok(kiosk);

      // 7. Enter kiosk using perceived building ID
      const enterResult = enterBuilding(state, player.id, kiosk.id);
      assert.equal(enterResult.success, true);
      assert.equal(player.locationId, 'building:avenida-juarez-kiosk');

      // 8. Perceive inside kiosk: confirms parent street and no restaurants
      const kioskInspect = inspectCurrentLocation(state, player.id);
      assert.equal(kioskInspect.location?.parentStreet?.id, 'street:avenida-juarez');
      assert.deepEqual(kioskInspect.location?.containedRestaurants, []);
    });

    test('persistence roundtrip preserves world state cleanly under Schema Version 10', () => {
      const testFile = join(tmpdir(), `test-spatial-perception-${Date.now()}.json`);
      try {
        const { clock, state } = setupWorld();
        leaveBuilding(state, 'agent:dev-player', 'building:development-building');
        traverseToStreet(state, 'agent:dev-player', 'street:avenida-juarez');

        const persistence = new LocalFilePersistence(testFile);
        persistence.save(snapshotWorldState(clock, state));

        const loaded = persistence.load();
        assert.ok(loaded !== null);
        assert.equal(loaded.version, 18);
        validateWorldState(loaded);

        // Reconstructed state produces identical perception
        const inspectLoaded = inspectCurrentLocation(loaded, 'agent:dev-player');
        assert.equal(inspectLoaded.success, true);
        assert.equal(inspectLoaded.location?.id, 'street:avenida-juarez');
        assert.equal(inspectLoaded.location?.accessibleBuildings?.length, 1);
        assert.equal(
          inspectLoaded.location?.accessibleBuildings?.[0].id,
          'building:avenida-juarez-kiosk'
        );
        assert.equal(inspectLoaded.location?.neighboringStreets?.length, 1);
        assert.equal(
          inspectLoaded.location?.neighboringStreets?.[0].id,
          'street:development-street'
        );
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });
});
