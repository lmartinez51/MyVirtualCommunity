import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createRealWorldJuarezWorldState,
  leaveBuilding,
  enterBuilding,
  enterRestaurant,
  exitRestaurant,
  traverseToStreet,
  inspectCurrentLocation,
  validateWorldState,
  snapshotWorldState,
  WorldState,
} from '../src/core/world-state.js';
import { createRealWorldJuarezSeedWorld } from '../src/core/seed.js';
import { validatePlaces } from '../src/core/entities/geography.js';
import { validateRestaurants } from '../src/core/entities/restaurant.js';
import { validateAgents } from '../src/core/entities/agent.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';

describe('Milestone 38: Real-World Spatial Foundation', () => {
  const INITIAL_TIME = '2026-09-14T08:00:00.000Z';

  function setupWorld(): { clock: WorldClock; state: WorldState } {
    const clock = WorldClock.create(INITIAL_TIME);
    const state = createRealWorldJuarezWorldState(clock);
    return { clock, state };
  }

  // =========================================================================
  // 1. Real-World Geographic Hierarchy & Schema Invariants
  // =========================================================================
  describe('Real-World Geographic Hierarchy & Schema Invariants', () => {
    test('creates valid real-world Ciudad Juárez seed world under Schema Version 14', () => {
      const seed = createRealWorldJuarezSeedWorld(INITIAL_TIME);

      // Verify strict Places hierarchy
      assert.doesNotThrow(() => validatePlaces(seed.places));
      assert.equal(seed.places.length, 7);

      const city = seed.places.find((p) => p.id === 'city:ciudad-juarez')!;
      assert.equal(city.type, 'city');
      assert.equal(city.parentId, null);

      const district = seed.places.find((p) => p.id === 'district:centro-historico')!;
      assert.equal(district.type, 'district');
      assert.equal(district.parentId, 'city:ciudad-juarez');

      const neighborhood = seed.places.find((p) => p.id === 'neighborhood:zona-centro')!;
      assert.equal(neighborhood.type, 'neighborhood');
      assert.equal(neighborhood.parentId, 'district:centro-historico');

      const street = seed.places.find((p) => p.id === 'street:avenida-benito-juarez')!;
      assert.equal(street.type, 'street');
      assert.equal(street.parentId, 'neighborhood:zona-centro');

      const siblingStreet = seed.places.find((p) => p.id === 'street:avenida-16-de-septiembre')!;
      assert.equal(siblingStreet.type, 'street');
      assert.equal(siblingStreet.parentId, 'neighborhood:zona-centro');

      const residence = seed.places.find((p) => p.id === 'building:real-world-residence')!;
      assert.equal(residence.type, 'building');
      assert.equal(residence.parentId, 'street:avenida-benito-juarez');

      const venueBuilding = seed.places.find((p) => p.id === 'building:kentucky-club-building')!;
      assert.equal(venueBuilding.type, 'building');
      assert.equal(venueBuilding.parentId, 'street:avenida-benito-juarez');

      // Verify Restaurants referencing Buildings
      const buildingIds = new Set(seed.places.filter((p) => p.type === 'building').map((p) => p.id));
      assert.doesNotThrow(() => validateRestaurants(seed.restaurants, buildingIds));
      assert.equal(seed.restaurants.length, 1);

      const restaurant = seed.restaurants[0];
      assert.equal(restaurant.id, 'restaurant:kentucky-club');
      assert.equal(restaurant.buildingId, 'building:kentucky-club-building');
      assert.equal(restaurant.operationalState, 'open');

      // Verify Agents referential integrity
      const validLocationIds = new Set([
        ...seed.places.map((p) => p.id),
        ...seed.restaurants.map((r) => r.id),
      ]);
      assert.doesNotThrow(() => validateAgents(seed.agents, validLocationIds));
      assert.equal(seed.agents.length, 2);

      const player = seed.agents.find((a) => a.id === 'agent:real-world-player')!;
      assert.ok(player);
      assert.equal(player.locationId, 'building:real-world-residence');

      // Verify commercial offerings (Milestone 39 synthetic demo beverage)
      assert.equal(seed.offerings.length, 1);
    });

    test('createRealWorldJuarezWorldState passes comprehensive validateWorldState', () => {
      const { state } = setupWorld();
      assert.equal(state.version, 18);
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 2. Deterministic Real-World Spatial Flow
  // =========================================================================
  describe('Deterministic Real-World Spatial Flow', () => {
    test('complete flow: Residence -> Avenida Benito Juárez -> Kentucky Club Building -> Kentucky Club', () => {
      const { clock, state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;

      // 1. Player starts inside residential building
      assert.equal(player.locationId, 'building:real-world-residence');

      // 2. Player leaves home to Avenida Benito Juárez
      const leaveRes = leaveBuilding(state, player.id, 'building:real-world-residence');
      assert.equal(leaveRes.success, true);
      assert.equal(leaveRes.code, 'success');
      assert.equal(leaveRes.streetId, 'street:avenida-benito-juarez');
      assert.equal(player.locationId, 'street:avenida-benito-juarez');

      // 3. Player inspects current location on Avenida Benito Juárez
      const streetInspect = inspectCurrentLocation(state, player.id);
      assert.equal(streetInspect.success, true);
      assert.ok(streetInspect.location);
      assert.equal(streetInspect.location.id, 'street:avenida-benito-juarez');
      assert.equal(streetInspect.location.name, 'Avenida Benito Juárez');
      assert.equal(streetInspect.location.type, 'street');

      // Verify accessible child buildings
      assert.ok(streetInspect.location.accessibleBuildings);
      assert.equal(streetInspect.location.accessibleBuildings.length, 2);
      const accessibleBuildingIds = streetInspect.location.accessibleBuildings.map((b) => b.id);
      assert.ok(accessibleBuildingIds.includes('building:real-world-residence'));
      assert.ok(accessibleBuildingIds.includes('building:kentucky-club-building'));

      // Verify neighboring sibling streets
      assert.ok(streetInspect.location.neighboringStreets);
      assert.equal(streetInspect.location.neighboringStreets.length, 1);
      assert.equal(streetInspect.location.neighboringStreets[0].id, 'street:avenida-16-de-septiembre');

      // 4. Player enters Kentucky Club Building from street
      const enterBldgRes = enterBuilding(state, player.id, 'building:kentucky-club-building');
      assert.equal(enterBldgRes.success, true);
      assert.equal(enterBldgRes.code, 'success');
      assert.equal(enterBldgRes.buildingId, 'building:kentucky-club-building');
      assert.equal(player.locationId, 'building:kentucky-club-building');

      // 5. Player inspects building context
      const bldgInspect = inspectCurrentLocation(state, player.id);
      assert.equal(bldgInspect.success, true);
      assert.ok(bldgInspect.location);
      assert.equal(bldgInspect.location.id, 'building:kentucky-club-building');
      assert.equal(bldgInspect.location.type, 'building');
      assert.equal(bldgInspect.location.parentStreet?.id, 'street:avenida-benito-juarez');
      assert.ok(bldgInspect.location.containedRestaurants);
      assert.equal(bldgInspect.location.containedRestaurants.length, 1);
      assert.equal(bldgInspect.location.containedRestaurants[0].id, 'restaurant:kentucky-club');

      // 6. Player enters Kentucky Club from containing building
      const enterRestRes = enterRestaurant(state, player.id, 'restaurant:kentucky-club');
      assert.equal(enterRestRes.success, true);
      assert.equal(enterRestRes.code, 'success');
      assert.equal(enterRestRes.restaurantId, 'restaurant:kentucky-club');
      assert.equal(player.locationId, 'restaurant:kentucky-club');

      // 7. Player inspects restaurant interior
      const restInspect = inspectCurrentLocation(state, player.id);
      assert.equal(restInspect.success, true);
      assert.ok(restInspect.location);
      assert.equal(restInspect.location.id, 'restaurant:kentucky-club');
      assert.equal(restInspect.location.name, 'Kentucky Club');
      assert.equal(restInspect.location.type, 'restaurant');
      assert.equal(restInspect.location.offerings?.length, 1);
      assert.equal(restInspect.location.offerings?.[0].id, 'offering:m39-demo-beverage');

      // 8. Player exits restaurant back to containing building
      const exitRestRes = exitRestaurant(state, player.id, 'restaurant:kentucky-club');
      assert.equal(exitRestRes.success, true);
      assert.equal(exitRestRes.code, 'success');
      assert.equal(player.locationId, 'building:kentucky-club-building');
    });

    test('bidirectional sibling street traversal between Avenida Benito Juárez and Avenida 16 de Septiembre', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;

      // Leave home to Avenida Benito Juárez
      leaveBuilding(state, player.id, 'building:real-world-residence');
      assert.equal(player.locationId, 'street:avenida-benito-juarez');

      // Traverse from Avenida Benito Juárez to Avenida 16 de Septiembre
      const travForward = traverseToStreet(state, player.id, 'street:avenida-16-de-septiembre');
      assert.equal(travForward.success, true);
      assert.equal(travForward.code, 'success');
      assert.equal(travForward.originStreetId, 'street:avenida-benito-juarez');
      assert.equal(travForward.targetStreetId, 'street:avenida-16-de-septiembre');
      assert.equal(travForward.neighborhoodId, 'neighborhood:zona-centro');
      assert.equal(player.locationId, 'street:avenida-16-de-septiembre');

      // Inspect Avenida 16 de Septiembre
      const inspect16 = inspectCurrentLocation(state, player.id);
      assert.equal(inspect16.success, true);
      assert.equal(inspect16.location?.id, 'street:avenida-16-de-septiembre');
      assert.ok(inspect16.location?.neighboringStreets);
      assert.equal(inspect16.location.neighboringStreets[0].id, 'street:avenida-benito-juarez');

      // Traverse back to Avenida Benito Juárez
      const travBack = traverseToStreet(state, player.id, 'street:avenida-benito-juarez');
      assert.equal(travBack.success, true);
      assert.equal(travBack.code, 'success');
      assert.equal(travBack.originStreetId, 'street:avenida-16-de-septiembre');
      assert.equal(travBack.targetStreetId, 'street:avenida-benito-juarez');
      assert.equal(player.locationId, 'street:avenida-benito-juarez');
    });
  });

  // =========================================================================
  // 3. Failure Integrity & Zero State Mutation Invariant
  // =========================================================================
  describe('Failure Integrity & Zero State Mutation Invariant', () => {
    test('fails when attempting to enter a building from the wrong street, producing zero mutation', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;

      // Player is still inside residence
      const snapshotBefore = JSON.stringify(state);

      // Attempt to enter Kentucky Club Building while inside residence
      const result = enterBuilding(state, player.id, 'building:kentucky-club-building');
      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-location');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails when attempting to enter a non-existent building, producing zero mutation', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;
      leaveBuilding(state, player.id, 'building:real-world-residence');

      const snapshotBefore = JSON.stringify(state);
      const result = enterBuilding(state, player.id, 'building:non-existent');
      assert.equal(result.success, false);
      assert.equal(result.code, 'building-not-found');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails when attempting to enter restaurant from street instead of containing building', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;
      leaveBuilding(state, player.id, 'building:real-world-residence');

      const snapshotBefore = JSON.stringify(state);
      const result = enterRestaurant(state, player.id, 'restaurant:kentucky-club');
      assert.equal(result.success, false);
      assert.equal(result.code, 'invalid-location');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });

    test('fails when attempting to leave a building that the player is not inside', () => {
      const { state } = setupWorld();
      const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;

      const snapshotBefore = JSON.stringify(state);
      const result = leaveBuilding(state, player.id, 'building:kentucky-club-building');
      assert.equal(result.success, false);
      assert.equal(result.code, 'not-at-building');
      assert.equal(JSON.stringify(state), snapshotBefore);
    });
  });

  // =========================================================================
  // 4. Persistence Roundtrip & Reconstruction
  // =========================================================================
  describe('Persistence Roundtrip & Reconstruction', () => {
    test('persists world state after real-world journey and restores with exact spatial presence', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mvc-m38-real-world-'));
      const testFile = join(tmpDir, 'world-state.json');

      try {
        const { clock, state } = setupWorld();
        const player = state.agents.find((a) => a.id === 'agent:real-world-player')!;

        // Perform journey: Home -> Street -> Kentucky Club Building -> Kentucky Club
        leaveBuilding(state, player.id, 'building:real-world-residence');
        enterBuilding(state, player.id, 'building:kentucky-club-building');
        enterRestaurant(state, player.id, 'restaurant:kentucky-club');
        assert.equal(player.locationId, 'restaurant:kentucky-club');

        // Persist
        const persistence = new LocalFilePersistence(testFile);
        const snapshot = snapshotWorldState(clock, state);
        persistence.save(snapshot);
        assert.ok(existsSync(testFile));

        // Restore in clean runtime
        const restored = persistence.load();
        assert.ok(restored !== null);
        assert.equal(restored.version, 18);
        assert.doesNotThrow(() => validateWorldState(restored));

        const restoredPlayer = restored.agents.find((a) => a.id === 'agent:real-world-player')!;
        assert.equal(restoredPlayer.locationId, 'restaurant:kentucky-club');
        assert.equal(restored.places.length, 7);
        assert.equal(restored.restaurants.length, 1);
        assert.equal(restored.offerings.length, 1);
      } finally {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      }
    });
  });
});
