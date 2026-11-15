import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorldClock } from '../src/core/clock.js';
import {
  CURRENT_WORLD_STATE_VERSION,
  createInitialWorldState,
  createGomezMorinWorldState,
  validateWorldState,
} from '../src/core/world-state.js';
import {
  createGomezMorinSpatialTopology,
  findPedestrianRoute,
  validateRoadConnectivity,
  validatePedestrianRouteSafety,
} from '../src/core/real-world-street-topology.js';
import {
  GOMEZ_MORIN_BUILDING_FOOTPRINTS,
  isInsideBuildingFootprint,
  isPedestrianWalkablePosition,
  getGomezMorinNavCoordinates,
  Minimal3DClient,
} from '../clients/minimal-3d/minimal-3d-client.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { validateArrivalAndCommit } from '../src/core/navigation-contract.js';

describe('Milestone 80: Real-World Spatial Slice & Pedestrian Navigation Topology', () => {
  const topology = createGomezMorinSpatialTopology();

  // Test 1: Gómez Morín exists as a bidirectional road
  it('1. Gómez Morín exists as a bidirectional road with vehicular and pedestrian infrastructure', () => {
    const gomezMorin = topology.roads.find((r) => r.roadId === 'road:blvd-gomez-morin');
    assert.ok(gomezMorin, 'Gómez Morín road segment must exist');
    assert.equal(gomezMorin.streetPlaceId, 'street:blvd-gomez-morin');
    assert.equal(gomezMorin.directionality, 'bidirectional');
    assert.equal(gomezMorin.hasVehicularAccess, true);
    assert.equal(gomezMorin.hasPedestrianSidewalk, true);
  });

  // Test 2: Del Porvenir connects to Gómez Morín
  it('2. Calle Del Porvenir connects to Gómez Morín via a T-junction intersection', () => {
    const porvenir = topology.roads.find((r) => r.roadId === 'road:calle-del-porvenir');
    assert.ok(porvenir, 'Calle Del Porvenir must exist');
    assert.equal(porvenir.directionality, 'bidirectional');
    assert.ok(porvenir.connectedRoadIds.includes('road:blvd-gomez-morin'));

    const gomezMorin = topology.roads.find((r) => r.roadId === 'road:blvd-gomez-morin')!;
    assert.ok(gomezMorin.connectedRoadIds.includes('road:calle-del-porvenir'));

    const intersection = topology.intersections.find(
      (i) => i.intersectionId === 'intersection:gomez-morin-del-porvenir'
    );
    assert.ok(intersection, 'Intersection must exist');
    assert.equal(intersection.intersectionType, 't-junction');
    assert.equal(intersection.hasPedestrianCrossing, true);
    assert.deepEqual(
      [...intersection.roadIds].sort(),
      ['road:blvd-gomez-morin', 'road:calle-del-porvenir'].sort()
    );
  });

  // Test 3: Av. La Arboleda connects to Gómez Morín
  it('3. Av. La Arboleda connects to Gómez Morín via a T-junction intersection', () => {
    const arboleda = topology.roads.find((r) => r.roadId === 'road:av-la-arboleda');
    assert.ok(arboleda, 'Av. La Arboleda must exist');
    assert.equal(arboleda.directionality, 'bidirectional');
    assert.ok(arboleda.connectedRoadIds.includes('road:blvd-gomez-morin'));

    const gomezMorin = topology.roads.find((r) => r.roadId === 'road:blvd-gomez-morin')!;
    assert.ok(gomezMorin.connectedRoadIds.includes('road:av-la-arboleda'));

    const intersection = topology.intersections.find(
      (i) => i.intersectionId === 'intersection:gomez-morin-la-arboleda'
    );
    assert.ok(intersection, 'Intersection must exist');
    assert.equal(intersection.intersectionType, 't-junction');
    assert.equal(intersection.hasPedestrianCrossing, true);
  });

  // Test 4: Road connectivity is deterministic
  it('4. Road network connectivity is deterministic and symmetric', () => {
    const validation = validateRoadConnectivity(topology.roads);
    assert.equal(validation.valid, true);
    assert.equal(validation.errors.length, 0);

    // Repeated call produces identical deterministic result
    const topology2 = createGomezMorinSpatialTopology();
    assert.deepEqual(topology.roads, topology2.roads);
  });

  // Test 5: Building footprints are non-walkable
  it('5. Building footprints are strictly non-walkable', () => {
    for (const fp of GOMEZ_MORIN_BUILDING_FOOTPRINTS) {
      const centerX = (fp.minX + fp.maxX) / 2;
      const centerZ = (fp.minZ + fp.maxZ) / 2;

      assert.equal(
        isInsideBuildingFootprint(centerX, centerZ),
        true,
        `Center of building "${fp.buildingId}" must be recognized as inside footprint`
      );
      assert.equal(
        isPedestrianWalkablePosition(centerX, centerZ),
        false,
        `Inside building footprint "${fp.buildingId}" must be strictly non-walkable`
      );
    }
  });

  // Test 6: Pedestrian sidewalks are walkable
  it('6. Pedestrian sidewalks are walkable surfaces', () => {
    const testPoints = [
      { name: 'Gómez Morín North Sidewalk (West)', x: -30.0, z: -11.0 },
      { name: 'Gómez Morín North Sidewalk (Mid)', x: 18.0, z: -11.0 },
      { name: 'Gómez Morín South Sidewalk', x: 0.0, z: 11.0 },
      { name: 'Del Porvenir West Sidewalk', x: -25.0, z: -25.0 },
      { name: 'Del Porvenir East Sidewalk', x: -14.0, z: -25.0 },
      { name: 'La Arboleda West Sidewalk', x: 28.0, z: -25.0 },
      { name: 'La Arboleda East Sidewalk', x: 41.0, z: -25.0 },
    ];

    for (const pt of testPoints) {
      assert.equal(
        isInsideBuildingFootprint(pt.x, pt.z),
        false,
        `${pt.name} must not be inside building footprint`
      );
      assert.equal(
        isPedestrianWalkablePosition(pt.x, pt.z),
        true,
        `${pt.name} at (${pt.x}, ${pt.z}) must be walkable`
      );
    }
  });

  // Test 7: Street crossing requires an explicit crossing/navigation connection
  it('7. Street crossing requires an explicit designated crosswalk', () => {
    // Arbitrary roadway points (non-crosswalk) are non-walkable
    assert.equal(
      isPedestrianWalkablePosition(-20.0, -30.0), // In middle of Calle Del Porvenir
      false,
      'Arbitrary roadway inside Del Porvenir must be non-walkable'
    );
    assert.equal(
      isPedestrianWalkablePosition(0.0, 0.0), // In middle of Blvd. Gómez Morín
      false,
      'Arbitrary roadway inside Blvd. Gómez Morín must be non-walkable'
    );

    // Designated crosswalk coordinates are walkable
    assert.equal(
      isPedestrianWalkablePosition(-19.0, -11.0), // Del Porvenir crosswalk
      true,
      'Del Porvenir designated pedestrian crosswalk must be walkable'
    );
    assert.equal(
      isPedestrianWalkablePosition(34.0, -11.0), // La Arboleda crosswalk
      true,
      'La Arboleda designated pedestrian crosswalk must be walkable'
    );
    assert.equal(
      isPedestrianWalkablePosition(18.0, 0.0), // Gómez Morín arterial crosswalk
      true,
      'Gómez Morín arterial pedestrian crosswalk must be walkable'
    );
  });

  // Test 8: Entrances are explicit
  it('8. Building entrances are explicit and face designated streets', () => {
    assert.equal(topology.entrances.length, 7);

    const tiaLupeEntrance = topology.entrances.find((e) => e.entranceId === 'entrance:tia-lupe-main')!;
    assert.equal(tiaLupeEntrance.buildingId, 'building:tia-lupe-building');
    assert.equal(tiaLupeEntrance.facingStreetPlaceId, 'street:blvd-gomez-morin');
    assert.equal(tiaLupeEntrance.entranceType, 'customer-primary');

    const wingSpotEntrance = topology.entrances.find((e) => e.entranceId === 'entrance:wing-spot-main')!;
    assert.equal(wingSpotEntrance.buildingId, 'building:wing-spot-building');
    assert.equal(wingSpotEntrance.facingStreetPlaceId, 'street:blvd-gomez-morin');
    assert.equal(wingSpotEntrance.entranceType, 'customer-primary');

    const residenceEntrance = topology.entrances.find(
      (e) => e.entranceId === 'entrance:del-porvenir-residence-main'
    )!;
    assert.equal(residenceEntrance.buildingId, 'building:del-porvenir-residence');
    assert.equal(residenceEntrance.facingStreetPlaceId, 'street:calle-del-porvenir');
    assert.equal(residenceEntrance.entranceType, 'residential-primary');

    const dollarEntrance = topology.entrances.find((e) => e.entranceId === 'entrance:dollar-2-go-main')!;
    assert.equal(dollarEntrance.buildingId, 'building:dollar-2-go-building');
    assert.equal(dollarEntrance.facingStreetPlaceId, 'street:blvd-gomez-morin');
  });

  // Test 9: Player cannot walk through buildings
  it('9. Player cannot step into building footprints', () => {
    // Attempting to move from sidewalk into Tía Lupe building interior
    const sidewalkX = -30.0;
    const sidewalkZ = -11.0;
    assert.equal(isPedestrianWalkablePosition(sidewalkX, sidewalkZ), true);

    // Deep step inside building mass
    const blockedX = -30.0;
    const blockedZ = -18.0;
    assert.equal(isInsideBuildingFootprint(blockedX, blockedZ), true);
    assert.equal(isPedestrianWalkablePosition(blockedX, blockedZ), false);
  });

  // Test 10: Player can reach valid entrances through the pedestrian graph
  it('10. Player can reach valid entrances via the deterministic pedestrian navigation graph', () => {
    // From Del Porvenir sidewalk to Tía Lupe entrance
    const routeToTiaLupe = findPedestrianRoute(
      topology.navGraph,
      'node:nav:porvenir-sidewalk-corner-west',
      'node:nav:entrance:tia-lupe'
    );
    assert.ok(routeToTiaLupe, 'Route to Tía Lupe must exist');
    assert.deepEqual(routeToTiaLupe, [
      'node:nav:porvenir-sidewalk-corner-west',
      'node:nav:gomez-morin-north-sidewalk-west',
      'node:nav:entrance:tia-lupe',
    ]);

    // From Del Porvenir corner across street to Dollar 2 Go entrance
    const routeToDollar = findPedestrianRoute(
      topology.navGraph,
      'node:nav:porvenir-sidewalk-corner-west',
      'node:nav:entrance:dollar-2-go'
    );
    assert.ok(routeToDollar, 'Route across Del Porvenir to Dollar 2 Go must exist');
    assert.ok(routeToDollar.includes('node:nav:crossing:del-porvenir'));
    assert.equal(routeToDollar[routeToDollar.length - 1], 'node:nav:entrance:dollar-2-go');
  });

  // Test 11: Elena can traverse a valid route using semantic navigation nodes
  it('11. Elena can traverse a valid route from residence to Wing Spot using semantic navigation nodes', () => {
    const route = findPedestrianRoute(
      topology.navGraph,
      'node:nav:entrance:del-porvenir-residence',
      'node:nav:entrance:wing-spot'
    );

    assert.ok(route, 'Route must exist');
    assert.deepEqual(route, [
      'node:nav:entrance:del-porvenir-residence',
      'node:nav:porvenir-sidewalk-north',
      'node:nav:porvenir-sidewalk-mid',
      'node:nav:porvenir-sidewalk-corner-west',
      'node:nav:gomez-morin-north-sidewalk-west',
      'node:nav:gomez-morin-north-sidewalk-wingspot',
      'node:nav:entrance:wing-spot',
    ]);

    const safety = validatePedestrianRouteSafety(topology.navGraph, route);
    assert.equal(safety.safe, true);
  });

  // Test 12: Elena's authoritative location remains unchanged during traversal
  it("12. Elena's authoritative location in WorldState remains unchanged while traversal is in-flight", async () => {
    const clock = WorldClock.create('2026-09-14T08:35:00.000Z');
    const state = createGomezMorinWorldState(clock);
    const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
    assert.equal(elena.locationId, 'building:del-porvenir-residence');

    const coordinator = new RuntimeTraversalCoordinator();
    const navCoords = getGomezMorinNavCoordinates();

    const runtime = new PhysicalTraversalRuntime({
      speed: 10.0,
      destinationResolver: (dest) => {
        if (dest === 'restaurant:wing-spot' || dest === 'building:wing-spot-building') {
          return navCoords.get('node:nav:entrance:wing-spot');
        }
        return undefined;
      },
      routeResolver: () => {
        const routeNodes = findPedestrianRoute(
          topology.navGraph,
          'node:nav:entrance:del-porvenir-residence',
          'node:nav:entrance:wing-spot'
        );
        return routeNodes?.map((n) => navCoords.get(n)!).filter(Boolean);
      },
    });

    runtime.registerAnchorCoordinate(
      'building:del-porvenir-residence',
      navCoords.get('node:nav:entrance:del-porvenir-residence')!
    );
    runtime.registerAnchorCoordinate(
      'restaurant:wing-spot',
      navCoords.get('node:nav:entrance:wing-spot')!
    );

    const startRes = coordinator.startTraversal(
      state,
      elena.id,
      'restaurant:wing-spot',
      clock.getTime()
    );
    assert.equal(startRes.success, true);

    const traversalPromise = runtime.requestTraversal((startRes as any).request);

    // Step physical runtime partially
    runtime.step(500);
    assert.equal(
      elena.locationId,
      'building:del-porvenir-residence',
      'Elena authoritative locationId must remain at origin during transit'
    );

    runtime.step(1000);
    assert.equal(
      elena.locationId,
      'building:del-porvenir-residence',
      'Elena authoritative locationId must remain unchanged at frame 2'
    );

    // Step to completion
    let results = runtime.step(10000);
    while (results.length === 0) {
      results = runtime.step(1000);
    }

    const navResult = await traversalPromise;
    assert.equal(navResult.status, 'arrived');

    // BEFORE M69 commit, locationId MUST still be at origin!
    assert.equal(
      elena.locationId,
      'building:del-porvenir-residence',
      'Elena locationId MUST still be at origin before M69 commit'
    );
  });

  // Test 13: M69 arrival validation remains the only authoritative arrival commit
  it('13. M69 arrival validation remains the sole committer of logical arrival', () => {
    const clock = WorldClock.create('2026-09-14T08:35:00.000Z');
    const state = createGomezMorinWorldState(clock);
    const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;

    const commitRes = validateArrivalAndCommit(
      state,
      {
        requestId: 'req:test-elena-commute',
        agentId: elena.id,
        originPlaceId: 'building:del-porvenir-residence',
        destinationPlaceId: 'restaurant:wing-spot',
        requestedAt: clock.getTime(),
        agentType: 'npc',
      },
      {
        requestId: 'req:test-elena-commute',
        agentId: elena.id,
        destinationPlaceId: 'restaurant:wing-spot',
        status: 'arrived',
        completedAt: clock.getTime(),
        message: 'Arrived at Wing Spot',
      }
    );

    assert.equal(commitRes.success, true);
    assert.equal(commitRes.changed, true);
    assert.equal(commitRes.previousLocationId, 'building:del-porvenir-residence');
    assert.equal(commitRes.currentLocationId, 'restaurant:wing-spot');
    assert.equal(elena.locationId, 'restaurant:wing-spot');
  });

  // Test 14: Invalid navigation routes are rejected safely
  it('14. Invalid or disconnected navigation routes are safely rejected', () => {
    const nonExistent = findPedestrianRoute(
      topology.navGraph,
      'node:nav:non-existent-origin',
      'node:nav:entrance:wing-spot'
    );
    assert.equal(nonExistent, null);

    const safety = validatePedestrianRouteSafety(topology.navGraph, [
      'node:nav:entrance:del-porvenir-residence',
      'node:nav:entrance:wing-spot', // Discontinuous jump without connecting edge
    ]);
    assert.equal(safety.safe, false);
    assert.ok(safety.message.includes('Discontinuous path'));
  });

  // Test 15: Existing World Core behavior remains unchanged
  it('15. Schema version remains 18 and existing WorldState behavior is preserved', () => {
    assert.equal(CURRENT_WORLD_STATE_VERSION, 19);

    const clock = WorldClock.create();
    const devState = createInitialWorldState(clock);
    assert.equal(devState.version, 19);
    assert.doesNotThrow(() => validateWorldState(devState));

    const gomezMorinState = createGomezMorinWorldState(clock);
    assert.equal(gomezMorinState.version, 19);
    assert.doesNotThrow(() => validateWorldState(gomezMorinState));
  });

  // Test 16: No 3D/client dependency leaks into src/core/
  it('16. Zero 3D, WebGL, or client dependency imports in src/core/', () => {
    const coreDir = join(process.cwd(), 'src', 'core');
    const files = readdirSync(coreDir).filter((f) => f.endsWith('.ts'));

    const forbiddenImportPatterns = [
      /from\s+['"][^'"]*clients\//,
      /from\s+['"][^'"]*minimal-3d/,
      /from\s+['"][^'"]*webgl/i,
      /from\s+['"][^'"]*three/i,
      /from\s+['"][^'"]*babylon/i,
      /import\s+.*Scene3D/,
      /import\s+.*Node3D/,
      /import\s+.*Minimal3DClient/,
    ];

    for (const file of files) {
      const content = readFileSync(join(coreDir, file), 'utf-8');
      for (const pattern of forbiddenImportPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `File src/core/${file} contains forbidden 3D client import: "${pattern}"`
        );
      }
    }
  });
});
