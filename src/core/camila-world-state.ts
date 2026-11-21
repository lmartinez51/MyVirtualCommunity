/**
 * Milestone 94: Camila world-state JSON.
 *
 * Builds the world snapshot Camila reads at game start. It is generated
 * from the seed + the real-world street topology + the probe objects, and
 * written to data/camila-world-state.json by scripts/generate-camila-world-state.ts.
 *
 * COORDINATE FRAME — read this before using the numbers:
 * - This JSON is in the UNITY scene frame (metres): X = east, Z = -north
 *   (north is -Z), Y = up, origin at the scene origin. It is the frame
 *   GomezMorinSceneBuilder builds in (Wing Spot door -6.75, 0.24, 5.80;
 *   Elena counter -10.90, 0.44, 12.85; bedrock X -60..175, Z -45..45).
 * - The TypeScript topology (real-world-street-topology.ts) uses a
 *   DIFFERENT, abstract logical frame: its entrance thresholds (e.g. Wing
 *   Spot main entrance {x: -45.0, z: -12.4}) are NOT Unity coordinates and
 *   must NEVER be used as Unity positions. There is no numeric transform
 *   between the two frames; this module maps each seed place to a Unity
 *   anchor measured from the SceneBuilder layout instead, and carries the
 *   topology only as logical connectivity (roads, intersections, parcels,
 *   entrances by id, nav-graph node ids).
 * - Places without a physical anchor in the slice (city / district /
 *   neighbourhood) have unityPosition: null.
 */

import { createGomezMorinSeedWorld } from './seed.js';
import {
  createGomezMorinSpatialTopology,
  type GomezMorinSpatialTopology,
} from './real-world-street-topology.js';
import {
  CAMILA_PROBE_OBJECTS,
  type UnityPosition,
} from './camila-probe-objects.js';

/** Canonical Unity anchors for the Gómez Morín slice (metres, scene frame). */
export const CAMILA_UNITY_ANCHORS: Readonly<Record<string, UnityPosition>> =
  Object.freeze({
    'street:blvd-gomez-morin': { x: 55, y: 0.24, z: 2.4 },
    'street:calle-del-porvenir': { x: 13.5, y: 0.24, z: 22.5 },
    'street:av-la-arboleda': { x: 101, y: 0.24, z: 22.5 },
    'building:tia-lupe-building': { x: -22, y: 0.24, z: 8 },
    'building:wing-spot-building': { x: -8, y: 0.24, z: 8 },
    'restaurant:wing-spot': { x: -8, y: 0.24, z: 8 },
    'restaurant:pasteleria-tia-lupe': { x: -22, y: 0.24, z: 8 },
    'building:del-porvenir-residence': { x: 10, y: 0.24, z: 32 },
    'building:dollar-2-go-building': { x: 45, y: 0.24, z: 15 },
    'building:acabados-hbc-building': { x: 85, y: 0.24, z: 10 },
    'building:catzoo-building': { x: 90, y: 0.24, z: 25 },
    'building:corporativo-arboleda-building': { x: 115, y: 0.24, z: 20 },
  });

export interface CamilaWorldStateJson {
  readonly version: string;
  readonly generatedFrom: string;
  readonly coordinateFrame: {
    readonly frame: 'unity-scene';
    readonly x: string;
    readonly z: string;
    readonly y: string;
    readonly note: string;
  };
  readonly places: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly parentId: string | null;
    readonly unityPosition: UnityPosition | null;
  }[];
  readonly restaurants: readonly {
    readonly id: string;
    readonly name: string;
    readonly buildingId: string;
    readonly unityPosition: UnityPosition | null;
  }[];
  readonly agents: readonly {
    readonly id: string;
    readonly name: string;
    readonly agentType: string;
    readonly startLocationId: string;
    readonly note?: string;
  }[];
  readonly roads: readonly {
    readonly roadId: string;
    readonly name: string;
    readonly streetPlaceId: string;
    readonly directionality: string;
    readonly connectedRoadIds: readonly string[];
    readonly unityPolyline: readonly UnityPosition[];
  }[];
  readonly intersections: readonly {
    readonly intersectionId: string;
    readonly name: string;
    readonly roadIds: readonly string[];
    readonly unityPosition: UnityPosition;
  }[];
  readonly parcels: readonly {
    readonly parcelId: string;
    readonly name: string;
    readonly parcelType: string;
    readonly associatedBuildingIds: readonly string[];
  }[];
  readonly entrances: readonly {
    readonly entranceId: string;
    readonly buildingId: string;
    readonly entranceType: string;
  }[];
  readonly navGraph: {
    readonly nodeIds: readonly string[];
    readonly edgeCount: number;
  };
  readonly probeObjects: readonly {
    readonly id: string;
    readonly name: string;
    readonly placeId: string;
    readonly cluster: string;
    readonly unityPosition: UnityPosition;
    readonly affordances: readonly string[];
    readonly description: string;
  }[];
}

const ROAD_UNITY_POLYLINES: Readonly<Record<string, readonly UnityPosition[]>> =
  Object.freeze({
    'road:blvd-gomez-morin': [
      { x: -60, y: 0.24, z: -6 },
      { x: 55, y: 0.24, z: -6 },
      { x: 175, y: 0.24, z: -6 },
    ],
    'road:calle-del-porvenir': [
      { x: 13.5, y: 0.24, z: 0 },
      { x: 13.5, y: 0.24, z: 22.5 },
      { x: 13.5, y: 0.24, z: 45 },
    ],
    'road:av-la-arboleda': [
      { x: 101, y: 0.24, z: 0 },
      { x: 101, y: 0.24, z: 22.5 },
      { x: 101, y: 0.24, z: 45 },
    ],
  });

const INTERSECTION_UNITY_POSITIONS: Readonly<Record<string, UnityPosition>> =
  Object.freeze({
    'intersection:gomez-morin-del-porvenir': { x: 13.5, y: 0.24, z: 0 },
    'intersection:gomez-morin-la-arboleda': { x: 101, y: 0.24, z: 0 },
  });

export function buildCamilaWorldState(
  initialTime = '2026-09-14T08:00:00.000Z'
): CamilaWorldStateJson {
  const seed = createGomezMorinSeedWorld(initialTime);
  const topology: GomezMorinSpatialTopology = createGomezMorinSpatialTopology();

  return {
    version: 'camila-world-state-v1',
    generatedFrom: 'createGomezMorinSeedWorld + createGomezMorinSpatialTopology + CAMILA_PROBE_OBJECTS',
    coordinateFrame: {
      frame: 'unity-scene',
      x: 'east, metres',
      z: 'north is -Z (south is +Z), metres',
      y: 'up, metres',
      note:
        'Unity scene frame. The TypeScript topology thresholds are in a different abstract logical frame and are NOT Unity coordinates; do not use them as positions. Roads/intersections below carry Unity polylines measured from GomezMorinSceneBuilder.',
    },
    places: seed.places.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      parentId: p.parentId,
      unityPosition: CAMILA_UNITY_ANCHORS[p.id] ?? null,
    })),
    restaurants: seed.restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      buildingId: r.buildingId,
      unityPosition: CAMILA_UNITY_ANCHORS[r.id] ?? null,
    })),
    agents: seed.agents.map((a) => ({
      id: a.id,
      name: a.name,
      agentType: a.agentType,
      startLocationId: a.locationId,
      note:
        a.id === 'agent:camila-npc'
          ? 'Explorer: no work schedule, free to roam.'
          : a.id === 'agent:elena-npc'
            ? 'Attendant at Wing Spot 9:00-17:00 (deterministic routine).'
            : undefined,
    })),
    roads: topology.roads.map((r) => ({
      roadId: r.roadId,
      name: r.name,
      streetPlaceId: r.streetPlaceId,
      directionality: r.directionality,
      connectedRoadIds: r.connectedRoadIds,
      unityPolyline: ROAD_UNITY_POLYLINES[r.roadId] ?? [],
    })),
    intersections: topology.intersections.map((i) => ({
      intersectionId: i.intersectionId,
      name: i.name,
      roadIds: i.roadIds,
      unityPosition: INTERSECTION_UNITY_POSITIONS[i.intersectionId] ?? { x: 0, y: 0.24, z: 0 },
    })),
    parcels: topology.parcels.map((p) => ({
      parcelId: p.parcelId,
      name: p.name,
      parcelType: p.parcelType,
      associatedBuildingIds: p.associatedBuildingIds,
    })),
    entrances: topology.entrances.map((e) => ({
      entranceId: e.entranceId,
      buildingId: e.buildingId,
      entranceType: e.entranceType,
    })),
    navGraph: {
      nodeIds: topology.navGraph.nodes.map((n) => n.id),
      edgeCount: topology.navGraph.edges.length,
    },
    probeObjects: CAMILA_PROBE_OBJECTS.map((o) => ({
      id: o.id,
      name: o.name,
      placeId: o.placeId,
      cluster: o.cluster,
      unityPosition: o.unityPosition,
      affordances: o.affordances,
      description: o.description,
    })),
  };
}
