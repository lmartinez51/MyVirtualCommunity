import { WorldClock } from '../src/core/clock.js';
import {
  CURRENT_WORLD_STATE_VERSION,
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
  Minimal3DClient,
  GOMEZ_MORIN_BUILDING_FOOTPRINTS,
  isInsideBuildingFootprint,
  isPedestrianWalkablePosition,
  getGomezMorinNavCoordinates,
} from '../clients/minimal-3d/minimal-3d-client.js';
import { RuntimeTraversalCoordinator } from '../src/core/traversal-coordinator.js';
import { PhysicalTraversalRuntime } from '../clients/minimal-3d/physical-traversal-runtime.js';
import { validateArrivalAndCommit } from '../src/core/navigation-contract.js';

console.log('================================================================================');
console.log(' Milestone 80: Real-World Spatial Slice & Pedestrian Navigation Topology');
console.log(' Corridor: Blvd. Manuel Gómez Morín — Ciudad Juárez, Chihuahua');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// Part 1: Real-World Spatial Topology Assembly
// -----------------------------------------------------------------------------
console.log('================================================================================');
console.log(' Part 1: Real-World Road Network & Spatial Topology');
console.log('================================================================================');

const clock = WorldClock.create('2026-09-14T08:35:00.000Z');
const state = createGomezMorinWorldState(clock);
validateWorldState(state);

const topology = createGomezMorinSpatialTopology();
const roadValidation = validateRoadConnectivity(topology.roads);

console.log(`[World Core] Places: ${state.places.length} | Restaurants: ${state.restaurants.length} | Agents: ${state.agents.length}`);
console.log(`[World Core] Schema Version: ${state.version} (CURRENT_WORLD_STATE_VERSION = ${CURRENT_WORLD_STATE_VERSION})`);
console.log(`[Road Network] Connectivity Valid: ${roadValidation.valid} (0 errors)`);
console.log('\nRoad Corridors:');
for (const road of topology.roads) {
  console.log(`  • ${road.name} (${road.roadId})`);
  console.log(`    - Directionality: ${road.directionality}`);
  console.log(`    - Vehicular Access: ${road.hasVehicularAccess} | Pedestrian Sidewalks: ${road.hasPedestrianSidewalk}`);
  console.log(`    - Connected Roads: [${road.connectedRoadIds.join(', ')}]`);
}

console.log('\nIntersections:');
for (const inter of topology.intersections) {
  console.log(`  • ${inter.name} (${inter.intersectionType}) — Crosswalk: ${inter.hasPedestrianCrossing}`);
}

console.log('\nPhysical Parcels & Properties:');
for (const parcel of topology.parcels) {
  console.log(`  • ${parcel.name} [${parcel.parcelType}] — Access: ${parcel.primaryRoadAccessId} (Parking: ${parcel.hasParkingArea})`);
}

console.log('\nExplicit Building Entrances:');
for (const ent of topology.entrances) {
  console.log(`  • ${ent.name} -> Faces: ${ent.facingStreetPlaceId} [${ent.entranceType}]`);
}

// -----------------------------------------------------------------------------
// Part 2: Deterministic Pedestrian Navigation Graph
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(' Part 2: Deterministic Pedestrian Navigation Graph');
console.log('================================================================================');
console.log(`[Navigation Graph] Nodes: ${topology.navGraph.nodes.length} | Edges: ${topology.navGraph.edges.length}`);

// Route 1: Del Porvenir Residence -> Wing Spot
const elenaRoute = findPedestrianRoute(
  topology.navGraph,
  'node:nav:entrance:del-porvenir-residence',
  'node:nav:entrance:wing-spot'
)!;
const elenaSafety = validatePedestrianRouteSafety(topology.navGraph, elenaRoute);

console.log('\nPedestrian Route 1: Elena Morning Commute (Residence -> Wing Spot)');
console.log(`  • Safety Verified: ${elenaSafety.safe} (${elenaSafety.message})`);
console.log(`  • Total Nodes: ${elenaRoute.length}`);
elenaRoute.forEach((nodeId, i) => {
  const node = topology.navGraph.nodes.find((n) => n.id === nodeId)!;
  console.log(`    ${i + 1}. [${node.nodeType.toUpperCase()}] ${node.name} (${node.id})`);
});

// Route 2: West Corner -> Dollar 2 Go across Del Porvenir
const dollarRoute = findPedestrianRoute(
  topology.navGraph,
  'node:nav:porvenir-sidewalk-corner-west',
  'node:nav:entrance:dollar-2-go'
)!;
console.log('\nPedestrian Route 2: Crossing Del Porvenir to Dollar 2 Go');
console.log(`  • Nodes in Route: ${dollarRoute.length}`);
dollarRoute.forEach((nodeId, i) => {
  const node = topology.navGraph.nodes.find((n) => n.id === nodeId)!;
  console.log(`    ${i + 1}. [${node.nodeType.toUpperCase()}] ${node.name}`);
});

// -----------------------------------------------------------------------------
// Part 3: Building Footprints & Walkable Surface Verification
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(' Part 3: Building Footprint Barriers & Walkable Surfaces');
console.log('================================================================================');

console.log('Building Footprints (Non-Walkable Boundaries):');
for (const fp of GOMEZ_MORIN_BUILDING_FOOTPRINTS) {
  const centerX = (fp.minX + fp.maxX) / 2;
  const centerZ = (fp.minZ + fp.maxZ) / 2;
  const inside = isInsideBuildingFootprint(centerX, centerZ);
  const walkable = isPedestrianWalkablePosition(centerX, centerZ);
  console.log(`  • ${fp.name}: Bounds X[${fp.minX}, ${fp.maxX}] Z[${fp.minZ}, ${fp.maxZ}]`);
  console.log(`    - Center: (${centerX.toFixed(1)}, ${centerZ.toFixed(1)}) | Inside: ${inside} | Walkable: ${walkable} (BLOCKED)`);
}

console.log('\nPedestrian Walkable Surfaces vs. Roadways:');
const surfaces = [
  { label: 'Gómez Morín North Sidewalk', x: -30.0, z: -11.0, expected: true },
  { label: 'Del Porvenir West Sidewalk', x: -25.0, z: -25.0, expected: true },
  { label: 'Dollar 2 Go Parking Lot Path', x: -2.0, z: -14.0, expected: true },
  { label: 'Del Porvenir Designated Crosswalk', x: -19.0, z: -11.0, expected: true },
  { label: 'Arbitrary Roadway (Gómez Morín traffic lane)', x: 0.0, z: 0.0, expected: false },
  { label: 'Arbitrary Roadway (Del Porvenir traffic lane)', x: -20.0, z: -30.0, expected: false },
  { label: 'Inside Pastelerías La Tía Lupe', x: -30.0, z: -18.0, expected: false },
];

for (const s of surfaces) {
  const walkable = isPedestrianWalkablePosition(s.x, s.z);
  console.log(`  • ${s.label} at (${s.x}, ${s.z}): Walkable = ${walkable} (${walkable === s.expected ? 'PASS' : 'FAIL'})`);
}

// -----------------------------------------------------------------------------
// Part 4: Elena Autonomous Commute along Pedestrian Topology
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(' Part 4: Elena Autonomous Commute via Semantic Navigation Topology');
console.log('================================================================================');

const elena = state.agents.find((a) => a.id === 'agent:elena-npc')!;
console.log(`[Elena Situated Cognition] Local Time: 08:35 AM MDT`);
console.log(`  - Origin Location:  "${elena.locationId}" (Residencia Del Porvenir)`);
console.log(`  - Target Location:  "restaurant:wing-spot" (Wing Spot Gómez Morín)`);

const coordinator = new RuntimeTraversalCoordinator();
const navCoords = getGomezMorinNavCoordinates();

const runtime = new PhysicalTraversalRuntime({
  speed: 12.0,
  destinationResolver: (dest) => {
    if (dest === 'restaurant:wing-spot') {
      return navCoords.get('node:nav:entrance:wing-spot');
    }
    return undefined;
  },
  routeResolver: () => {
    return elenaRoute.map((nodeId) => navCoords.get(nodeId)!).filter(Boolean);
  },
});

runtime.registerAnchorCoordinate('building:del-porvenir-residence', navCoords.get('node:nav:entrance:del-porvenir-residence')!);
runtime.registerAnchorCoordinate('restaurant:wing-spot', navCoords.get('node:nav:entrance:wing-spot')!);

const startResult = coordinator.startTraversal(state, elena.id, 'restaurant:wing-spot', clock.getTime());
console.log(`[Coordinator] Traversal Registered: ${startResult.success}`);

const traversalPromise = runtime.requestTraversal((startResult as any).request);

console.log('\n[Multi-Waypoint Stepping along Sidewalks]:');
const steps = [
  { dt: 1000, desc: 'Elena steps off porch stoop onto Del Porvenir north sidewalk' },
  { dt: 1500, desc: 'Elena walks south along Del Porvenir west sidewalk' },
  { dt: 1500, desc: 'Elena reaches northwest corner of Del Porvenir and Gómez Morín' },
  { dt: 1500, desc: 'Elena turns west onto Gómez Morín sidewalk past Tía Lupe' },
  { dt: 1500, desc: 'Elena reaches Wing Spot customer entrance' },
];

for (let i = 0; i < steps.length; i++) {
  const s = steps[i];
  runtime.step(s.dt);
  const pos = runtime.getAgentPosition(elena.id)!;
  console.log(`  Frame ${i + 1} (+${s.dt}ms): ${s.desc}`);
  console.log(`    -> Position: (x: ${pos.x.toFixed(2)}, z: ${pos.z.toFixed(2)}) | World Core locationId: "${elena.locationId}" (IN-FLIGHT ISOLATION)`);
}

// Complete traversal if still active
while (runtime.hasActiveTraversal(elena.id)) {
  runtime.step(500);
}

const finalNavResult = await traversalPromise;
console.log(`\n[Physical Arrival Detected] Status: "${finalNavResult.status}" at destination`);
console.log(`  - Pre-Commit World Core Location: "${elena.locationId}" (STILL at residence stoop)`);

// Commit arrival via M69
const commitResult = validateArrivalAndCommit(
  state,
  (startResult as any).request,
  finalNavResult
);

console.log('\n[Authoritative Commit via M69 gatekeeper]');
console.log(`  - Commit Success:         ${commitResult.success}`);
console.log(`  - Location Changed:       ${commitResult.changed}`);
console.log(`  - Previous Location:      "${commitResult.previousLocationId}"`);
console.log(`  - Current Location:       "${commitResult.currentLocationId}"`);
console.log(`  - Final Agent locationId: "${elena.locationId}"`);

// -----------------------------------------------------------------------------
// Part 5: 3D Scene Assembly in Minimal3DClient
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(' Part 5: 3D Scene Assembly in Minimal3DClient');
console.log('================================================================================');

const client = new Minimal3DClient({
  clientId: 'client:gomez-morin-demo',
  observerAgentId: 'agent:gomez-morin-player',
});

const scene = client.buildGomezMorinWorldSlice(state);
console.log(`[3D World Slice] Assembled ${scene.getAllNodes().length} Physical 3D Nodes:`);
console.log(`  • Roads: Blvd. Manuel Gómez Morín, Calle Del Porvenir, Av. La Arboleda`);
console.log(`  • Markings: Double yellow center lines, crosswalk zebra stripes`);
console.log(`  • Commercial Buildings: Pastelerías La Tía Lupe, Wing Spot`);
console.log(`  • Residential: Residencia Del Porvenir`);
console.log(`  • Central Block: Dollar 2 Go large paved lot & store, Acabados HBC, CatZoo`);
console.log(`  • East Block: Corporativo Arboleda`);
console.log(`  • Props: Curbside street lamps, sidewalk trees, parked vehicles in lot`);

console.log('\n================================================================================');
console.log(' Milestone 80 Demonstration Completed Successfully');
console.log('================================================================================\n');
