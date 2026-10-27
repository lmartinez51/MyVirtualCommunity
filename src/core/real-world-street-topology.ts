/**
 * Milestone 80 — Real-World Spatial Slice & Pedestrian Navigation Topology
 *
 * Establishes the engine-independent domain model for the real-world spatial slice
 * along Blvd. Manuel Gómez Morín in Ciudad Juárez, Chihuahua.
 *
 * Architectural Invariants:
 * 1. Road != Visual Box:
 *    - Roads possess semantic identity, directionality, connectivity, vehicular access,
 *      and pedestrian access relationships.
 * 2. Conceptual Separations:
 *    - Road != Sidewalk != Crosswalk != Intersection
 *    - Building != Parcel/Property != Entrance != Interior
 *    - Navigation Node != Physical Transform
 * 3. Deterministic Pedestrian Navigation Graph:
 *    - Pedestrians navigate strictly through connected semantic nodes.
 *    - Roadways are non-walkable for pedestrians except via explicit crosswalk connections.
 *    - Route selection is deterministic (breadth-first / shortest-path search).
 * 4. Zero 3D Engine Dependencies:
 *    - Pure TypeScript domain entities containing zero WebGL, meshes, matrices, or physics.
 * 5. Spatial Authority:
 *    - Navigation routes and physical waypoints are non-authoritative over WorldState.
 *    - Logical location transitions occur solely through World Core commands and M69 arrival validation.
 */

import type { WorldState } from './world-state.js';
import { transitionAgentLocation } from './world-state.js';
import { findNpcSchedule } from './development-npc-schedule.js';
import { findBusinessSchedule } from './business-schedule.js';

export type RoadDirectionality = 'bidirectional' | 'one-way-north' | 'one-way-south' | 'one-way-east' | 'one-way-west';

export interface RoadIntersection {
  readonly intersectionId: string;
  readonly name: string;
  readonly roadIds: readonly string[];
  readonly intersectionType: 't-junction' | 'crossroad';
  readonly hasPedestrianCrossing: boolean;
}

export interface RoadSegment {
  readonly roadId: string;
  readonly streetPlaceId: string;
  readonly name: string;
  readonly directionality: RoadDirectionality;
  readonly hasVehicularAccess: boolean;
  readonly hasPedestrianSidewalk: boolean;
  readonly connectedRoadIds: readonly string[];
  readonly intersections: readonly string[];
  readonly description?: string;
}

export type ParcelType =
  | 'commercial-corner'
  | 'residential-strip'
  | 'paved-commercial-lot'
  | 'commercial-property'
  | 'corporate-complex';

export interface PhysicalParcel {
  readonly parcelId: string;
  readonly name: string;
  readonly parcelType: ParcelType;
  readonly associatedBuildingIds: readonly string[];
  readonly hasParkingArea: boolean;
  readonly primaryRoadAccessId: string;
  readonly description?: string;
}

export type EntranceType =
  | 'customer-primary'
  | 'residential-primary'
  | 'service'
  | 'lot-vehicular';

export interface BuildingEntrance {
  readonly entranceId: string;
  readonly buildingId: string;
  readonly name: string;
  readonly facingStreetPlaceId: string;
  readonly entranceType: EntranceType;
  readonly associatedNavNodeId: string;
  readonly interiorSpaceId?: string;
  readonly interiorNavNodeId?: string;
  readonly thresholdPosition?: { readonly x: number; readonly z: number };
  readonly interiorThresholdPosition?: { readonly x: number; readonly z: number };
  readonly description?: string;
}

export type PedestrianNavNodeType =
  | 'sidewalk'
  | 'crossing'
  | 'entrance'
  | 'lot-access'
  | 'parking-area';

export interface PedestrianNavNode {
  readonly id: string;
  readonly nodeType: PedestrianNavNodeType;
  readonly associatedPlaceId: string;
  readonly name: string;
  readonly description?: string;
}

export type PedestrianNavEdgeType =
  | 'sidewalk-segment'
  | 'pedestrian-crossing'
  | 'entrance-threshold'
  | 'lot-pathway';

export interface PedestrianNavEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly edgeType: PedestrianNavEdgeType;
  readonly bidirectional: boolean;
  readonly description?: string;
}

export interface PedestrianNavGraph {
  readonly nodes: readonly PedestrianNavNode[];
  readonly edges: readonly PedestrianNavEdge[];
}

/**
 * 2D rectangular bounds [minX, maxX] x [minZ, maxZ] defining the walkable interior area.
 *
 * NOTE: PROVISIONAL INTERIOR GEOMETRY for prototype boundaries.
 */
export interface InteriorBoundary {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Authoritative interior space definition for a building (Milestone 82).
 *
 * Establishes the engine-independent domain concept separating Building identity
 * from interior spatial presence and navigation boundaries.
 */
export interface InteriorSpace {
  readonly interiorId: string;
  readonly buildingId: string;
  readonly associatedPlaceId: string;
  readonly name: string;
  readonly entranceIds: readonly string[];
  readonly boundary: InteriorBoundary;
  readonly description?: string;
}

export type InternalPassageType =
  | 'standard-door'
  | 'service-door'
  | 'open-archway'
  | 'sliding-door'
  | 'corridor-threshold';

export type InternalAccessPolicy =
  | 'unrestricted'
  | 'staff-only'
  | 'resident-only'
  | 'management-only';

export interface InternalConnectionThreshold {
  readonly x: number;
  readonly z: number;
}

/**
 * Authoritative internal spatial connection between interior spaces (Milestone 86).
 *
 * Models room-to-room physical passages (doorways, archways) within a building
 * as directed topological edges, separating physical connectivity from traversal authorization.
 */
export interface InternalConnection {
  readonly connectionId: string;
  readonly name: string;
  readonly buildingId: string;
  readonly sourceInteriorId: string;
  readonly targetInteriorId: string;
  readonly passageType: InternalPassageType;
  readonly accessPolicy: InternalAccessPolicy;
  readonly pairedConnectionId?: string;
  readonly sourceThreshold?: InternalConnectionThreshold;
  readonly targetThreshold?: InternalConnectionThreshold;
  readonly interactionRadius?: number;
  readonly description?: string;
}

export interface GomezMorinSpatialTopology {
  readonly roads: readonly RoadSegment[];
  readonly intersections: readonly RoadIntersection[];
  readonly parcels: readonly PhysicalParcel[];
  readonly entrances: readonly BuildingEntrance[];
  readonly interiors: readonly InteriorSpace[];
  readonly internalConnections?: readonly InternalConnection[];
  readonly navGraph: PedestrianNavGraph;
}

/**
 * Creates the canonical real-world spatial topology for the Blvd. Manuel Gómez Morín slice.
 *
 * Grounded in verified Ciudad Juárez layout:
 * - Blvd. Manuel Gómez Morín: Main bidirectional East-West arterial.
 * - Calle Del Porvenir: Approaches from North, bidirectional, T-junction at Gómez Morín (West side).
 * - Av. La Arboleda: Approaches from North, bidirectional, T-junction at Gómez Morín (East side).
 * - Del Porvenir is West of Av. La Arboleda.
 * - West Corner: Pastelerías La Tía Lupe and Wing Spot face Gómez Morín.
 * - North Del Porvenir: Residential properties facing Del Porvenir.
 * - Central Block: Dollar 2 Go large paved parcel/parking lot facing Gómez Morín.
 * - East of Dollar 2 Go: Acabados HBC paint store, CatZoo Clínica Felina further North.
 * - East of La Arboleda: Corporativo Arboleda commercial property.
 */
export function createGomezMorinSpatialTopology(): GomezMorinSpatialTopology {
  // 1. Roads
  const roads: RoadSegment[] = [
    {
      roadId: 'road:blvd-gomez-morin',
      streetPlaceId: 'street:blvd-gomez-morin',
      name: 'Blvd. Manuel Gómez Morín',
      directionality: 'bidirectional',
      hasVehicularAccess: true,
      hasPedestrianSidewalk: true,
      connectedRoadIds: ['road:calle-del-porvenir', 'road:av-la-arboleda'],
      intersections: ['intersection:gomez-morin-del-porvenir', 'intersection:gomez-morin-la-arboleda'],
      description: 'Primary bidirectional East-West arterial corridor in Ciudad Juárez.',
    },
    {
      roadId: 'road:calle-del-porvenir',
      streetPlaceId: 'street:calle-del-porvenir',
      name: 'Calle Del Porvenir',
      directionality: 'bidirectional',
      hasVehicularAccess: true,
      hasPedestrianSidewalk: true,
      connectedRoadIds: ['road:blvd-gomez-morin'],
      intersections: ['intersection:gomez-morin-del-porvenir'],
      description: 'Bidirectional secondary street approaching Gómez Morín from the north.',
    },
    {
      roadId: 'road:av-la-arboleda',
      streetPlaceId: 'street:av-la-arboleda',
      name: 'Avenida La Arboleda',
      directionality: 'bidirectional',
      hasVehicularAccess: true,
      hasPedestrianSidewalk: true,
      connectedRoadIds: ['road:blvd-gomez-morin'],
      intersections: ['intersection:gomez-morin-la-arboleda'],
      description: 'Bidirectional secondary street approaching Gómez Morín from the north, east of Del Porvenir.',
    },
  ];

  // 2. Intersections
  const intersections: RoadIntersection[] = [
    {
      intersectionId: 'intersection:gomez-morin-del-porvenir',
      name: 'Intersección Gómez Morín & Del Porvenir',
      roadIds: ['road:blvd-gomez-morin', 'road:calle-del-porvenir'],
      intersectionType: 't-junction',
      hasPedestrianCrossing: true,
    },
    {
      intersectionId: 'intersection:gomez-morin-la-arboleda',
      name: 'Intersección Gómez Morín & La Arboleda',
      roadIds: ['road:blvd-gomez-morin', 'road:av-la-arboleda'],
      intersectionType: 't-junction',
      hasPedestrianCrossing: true,
    },
  ];

  // 3. Physical Parcels / Properties
  const parcels: PhysicalParcel[] = [
    {
      parcelId: 'parcel:tia-lupe-wing-spot-corner',
      name: 'Predio Comercial La Tía Lupe & Wing Spot',
      parcelType: 'commercial-corner',
      associatedBuildingIds: ['building:tia-lupe-building', 'building:wing-spot-building'],
      hasParkingArea: true,
      primaryRoadAccessId: 'road:blvd-gomez-morin',
      description: 'Commercial corner property at the northwest corner of Gómez Morín and Del Porvenir.',
    },
    {
      parcelId: 'parcel:del-porvenir-residential',
      name: 'Franja Residencial Del Porvenir',
      parcelType: 'residential-strip',
      associatedBuildingIds: ['building:del-porvenir-residence'],
      hasParkingArea: false,
      primaryRoadAccessId: 'road:calle-del-porvenir',
      description: 'Residential area north of the commercial corner along Calle Del Porvenir.',
    },
    {
      parcelId: 'parcel:dollar-2-go-paved-lot',
      name: 'Lote Comercial Dollar 2 Go',
      parcelType: 'paved-commercial-lot',
      associatedBuildingIds: ['building:dollar-2-go-building'],
      hasParkingArea: true,
      primaryRoadAccessId: 'road:blvd-gomez-morin',
      description: 'Substantial paved commercial lot with single-story building and large parking area.',
    },
    {
      parcelId: 'parcel:acabados-hbc-property',
      name: 'Predio Comercial Acabados HRC',
      parcelType: 'commercial-property',
      associatedBuildingIds: ['building:acabados-hbc-building'],
      hasParkingArea: true,
      primaryRoadAccessId: 'road:blvd-gomez-morin',
      description: 'Paint and finishes commercial showroom (HRC Home Remodeling Center) immediately east of Dollar 2 Go.',
    },
    {
      parcelId: 'parcel:catzoo-property',
      name: 'Predio CatZoo Clínica Felina',
      parcelType: 'commercial-property',
      associatedBuildingIds: ['building:catzoo-building'],
      hasParkingArea: false,
      primaryRoadAccessId: 'road:blvd-gomez-morin',
      description: 'Feline veterinary clinic located north of Acabados HBC.',
    },
    {
      parcelId: 'parcel:corporativo-arboleda-property',
      name: 'Predio Corporativo Arboleda',
      parcelType: 'corporate-complex',
      associatedBuildingIds: ['building:corporativo-arboleda-building'],
      hasParkingArea: true,
      primaryRoadAccessId: 'road:blvd-gomez-morin',
      description: 'Large commercial and corporate complex east across Av. La Arboleda.',
    },
  ];

  // 4. Building Entrances
  const entrances: BuildingEntrance[] = [
    {
      entranceId: 'entrance:tia-lupe-main',
      buildingId: 'building:tia-lupe-building',
      name: 'Pastelerías La Tía Lupe — Entrada Principal',
      facingStreetPlaceId: 'street:blvd-gomez-morin',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:entrance:tia-lupe',
      interiorSpaceId: 'interior:tia-lupe',
      interiorNavNodeId: 'node:nav:interior:tia-lupe-threshold',
      thresholdPosition: { x: -30.0, z: -12.4 },
      interiorThresholdPosition: { x: -30.0, z: -13.5 },
      description: 'Primary customer entrance facing south onto Blvd. Manuel Gómez Morín.',
    },
    {
      entranceId: 'entrance:wing-spot-main',
      buildingId: 'building:wing-spot-building',
      name: 'Wing Spot — Entrada Principal',
      facingStreetPlaceId: 'street:blvd-gomez-morin',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:entrance:wing-spot',
      interiorSpaceId: 'interior:wing-spot',
      interiorNavNodeId: 'node:nav:interior:wing-spot-threshold',
      thresholdPosition: { x: -45.0, z: -12.4 },
      interiorThresholdPosition: { x: -45.0, z: -13.5 },
      description: 'Primary customer entrance facing south onto Blvd. Manuel Gómez Morín.',
    },
    {
      entranceId: 'entrance:del-porvenir-residence-main',
      buildingId: 'building:del-porvenir-residence',
      name: 'Residencia Del Porvenir — Entrada Principal',
      facingStreetPlaceId: 'street:calle-del-porvenir',
      entranceType: 'residential-primary',
      associatedNavNodeId: 'node:nav:entrance:del-porvenir-residence',
      description: 'Primary residential entrance facing east onto Calle Del Porvenir.',
    },
    {
      entranceId: 'entrance:dollar-2-go-main',
      buildingId: 'building:dollar-2-go-building',
      name: 'Dollar 2 Go — Entrada Principal',
      facingStreetPlaceId: 'street:blvd-gomez-morin',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:entrance:dollar-2-go',
      description: 'Store entrance accessed from the interior paved parking lot.',
    },
    {
      entranceId: 'entrance:acabados-hbc-main',
      buildingId: 'building:acabados-hbc-building',
      name: 'Acabados HRC — Entrada Principal',
      facingStreetPlaceId: 'street:blvd-gomez-morin',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:entrance:acabados-hbc',
      description: 'Commercial showroom entrance facing Blvd. Manuel Gómez Morín.',
    },
    {
      entranceId: 'entrance:catzoo-main',
      buildingId: 'building:catzoo-building',
      name: 'CatZoo Clínica Felina — Entrada Principal',
      facingStreetPlaceId: 'street:blvd-gomez-morin',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:entrance:catzoo',
      description: 'Clinic entrance located north along the commercial corridor.',
    },
    {
      entranceId: 'entrance:corporativo-arboleda-main',
      buildingId: 'building:corporativo-arboleda-building',
      name: 'Corporativo Arboleda — Entrada Principal',
      facingStreetPlaceId: 'street:av-la-arboleda',
      entranceType: 'customer-primary',
      associatedNavNodeId: 'node:nav:entrance:corporativo-arboleda',
      description: 'Corporate entrance facing Av. La Arboleda and Gómez Morín.',
    },
  ];

  // 5. Interior Spaces (Milestone 82 & 83 — Authoritative Building Interior Boundaries, Milestone 87 — Multi-Room)
  const interiors: InteriorSpace[] = [
    {
      interiorId: 'interior:wing-spot',
      buildingId: 'building:wing-spot-building',
      associatedPlaceId: 'restaurant:wing-spot',
      name: 'Wing Spot — Espacio Interior',
      entranceIds: ['entrance:wing-spot-main'],
      // PROVISIONAL INTERIOR GEOMETRY:
      // Single-room rectangular interior area inside building footprint [-51.5, -38.5] x [-24.5, -12.5].
      boundary: {
        minX: -50.5,
        maxX: -39.5,
        minZ: -23.5,
        maxZ: -13.0,
      },
      description: 'Public dining hall and customer area for Wing Spot restaurant.',
    },
    {
      interiorId: 'interior:wing-spot-kitchen',
      buildingId: 'building:wing-spot-building',
      associatedPlaceId: 'restaurant:wing-spot',
      name: 'Wing Spot — Cocina y Área de Personal',
      entranceIds: [],
      // Geometry inside building footprint [-51.5, -38.5] x [-24.5, -12.5].
      boundary: {
        minX: -50.5,
        maxX: -39.5,
        minZ: -23.5,
        maxZ: -18.0,
      },
      description: 'Back-of-house kitchen, food preparation, and staff area for Wing Spot.',
    },
    {
      interiorId: 'interior:tia-lupe',
      buildingId: 'building:tia-lupe-building',
      associatedPlaceId: 'restaurant:pasteleria-tia-lupe',
      name: 'Pastelerías La Tía Lupe — Espacio Interior',
      entranceIds: ['entrance:tia-lupe-main'],
      // PROVISIONAL INTERIOR GEOMETRY (Milestone 83):
      // Single-room rectangular interior area inside building footprint [-36.5, -25.5] x [-24.5, -12.5].
      boundary: {
        minX: -35.5,
        maxX: -26.5,
        minZ: -23.5,
        maxZ: -13.0,
      },
      description: 'Provisional single-room interior layout for Pastelerías La Tía Lupe bakery & café.',
    },
  ];

  // 6. Pedestrian Navigation Nodes
  const nodes: PedestrianNavNode[] = [
    // Del Porvenir Sidewalks & Residential Nodes
    {
      id: 'node:nav:entrance:del-porvenir-residence',
      nodeType: 'entrance',
      associatedPlaceId: 'building:del-porvenir-residence',
      name: 'Umbral Residencia Del Porvenir',
      description: 'Entrance stoop of Del Porvenir residence.',
    },
    {
      id: 'node:nav:porvenir-sidewalk-north',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:calle-del-porvenir',
      name: 'Banqueta Del Porvenir Norte',
      description: 'West sidewalk of Calle Del Porvenir outside residence.',
    },
    {
      id: 'node:nav:porvenir-sidewalk-mid',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:calle-del-porvenir',
      name: 'Banqueta Del Porvenir Media',
      description: 'West sidewalk along Del Porvenir between residence and commercial corner.',
    },
    {
      id: 'node:nav:porvenir-sidewalk-corner-west',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:calle-del-porvenir',
      name: 'Banqueta Esquina Norponiente Del Porvenir',
      description: 'Northwest corner sidewalk at Del Porvenir and Gómez Morín.',
    },
    {
      id: 'node:nav:porvenir-sidewalk-corner-east',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:calle-del-porvenir',
      name: 'Banqueta Esquina Nororiente Del Porvenir',
      description: 'Northeast corner sidewalk at Del Porvenir and Gómez Morín (Dollar 2 Go corner).',
    },

    // Pedestrian Crossing across Calle Del Porvenir
    {
      id: 'node:nav:crossing:del-porvenir',
      nodeType: 'crossing',
      associatedPlaceId: 'street:calle-del-porvenir',
      name: 'Cruce Peatonal Calle Del Porvenir',
      description: 'Designated pedestrian crosswalk across Calle Del Porvenir.',
    },

    // Gómez Morín North Sidewalk (West of Porvenir: Tía Lupe & Wing Spot)
    {
      id: 'node:nav:gomez-morin-north-sidewalk-west',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:blvd-gomez-morin',
      name: 'Banqueta Gómez Morín Frente Tía Lupe',
      description: 'North sidewalk of Gómez Morín in front of Pastelerías La Tía Lupe.',
    },
    {
      id: 'node:nav:entrance:tia-lupe',
      nodeType: 'entrance',
      associatedPlaceId: 'building:tia-lupe-building',
      name: 'Umbral Pastelerías La Tía Lupe',
      description: 'Customer entrance threshold of Pastelerías La Tía Lupe.',
    },
    {
      id: 'node:nav:interior:tia-lupe-threshold',
      nodeType: 'entrance',
      associatedPlaceId: 'restaurant:pasteleria-tia-lupe',
      name: 'Umbral Interior Pastelerías La Tía Lupe',
      description: 'Interior threshold node just inside the customer entrance of Pastelerías La Tía Lupe.',
    },
    {
      id: 'node:nav:gomez-morin-north-sidewalk-wingspot',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:blvd-gomez-morin',
      name: 'Banqueta Gómez Morín Frente Wing Spot',
      description: 'North sidewalk of Gómez Morín in front of Wing Spot.',
    },
    {
      id: 'node:nav:entrance:wing-spot',
      nodeType: 'entrance',
      associatedPlaceId: 'building:wing-spot-building',
      name: 'Umbral Wing Spot',
      description: 'Customer entrance threshold of Wing Spot.',
    },
    {
      id: 'node:nav:interior:wing-spot-threshold',
      nodeType: 'entrance',
      associatedPlaceId: 'restaurant:wing-spot',
      name: 'Umbral Interior Wing Spot',
      description: 'Interior threshold node just inside the customer entrance of Wing Spot.',
    },

    // Gómez Morín North Sidewalk (Central Block: Dollar 2 Go, HBC, CatZoo)
    {
      id: 'node:nav:dollar-lot-access',
      nodeType: 'lot-access',
      associatedPlaceId: 'building:dollar-2-go-building',
      name: 'Acceso Peatonal Lote Dollar 2 Go',
      description: 'Pedestrian access from north sidewalk into Dollar 2 Go parking lot.',
    },
    {
      id: 'node:nav:dollar-parking-path',
      nodeType: 'parking-area',
      associatedPlaceId: 'building:dollar-2-go-building',
      name: 'Circulación Peatonal Estacionamiento Dollar 2 Go',
      description: 'Walkable paved circulation path inside Dollar 2 Go lot.',
    },
    {
      id: 'node:nav:entrance:dollar-2-go',
      nodeType: 'entrance',
      associatedPlaceId: 'building:dollar-2-go-building',
      name: 'Umbral Dollar 2 Go',
      description: 'Entrance threshold of Dollar 2 Go retail building.',
    },
    {
      id: 'node:nav:gomez-morin-north-sidewalk-hbc',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:blvd-gomez-morin',
      name: 'Banqueta Gómez Morín Frente Acabados HRC',
      description: 'North sidewalk in front of Acabados HRC building.',
    },
    {
      id: 'node:nav:entrance:acabados-hbc',
      nodeType: 'entrance',
      associatedPlaceId: 'building:acabados-hbc-building',
      name: 'Umbral Acabados HRC',
      description: 'Entrance threshold of Acabados HRC.',
    },
    {
      id: 'node:nav:catzoo-access',
      nodeType: 'sidewalk',
      associatedPlaceId: 'building:catzoo-building',
      name: 'Acceso CatZoo Banqueta Norte',
      description: 'Northbound access pathway towards CatZoo Clínica Felina.',
    },
    {
      id: 'node:nav:entrance:catzoo',
      nodeType: 'entrance',
      associatedPlaceId: 'building:catzoo-building',
      name: 'Umbral CatZoo Clínica Felina',
      description: 'Entrance threshold of CatZoo Clínica Felina.',
    },

    // Gómez Morín / La Arboleda Nodes (East Block)
    {
      id: 'node:nav:arboleda-sidewalk-corner-west',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:av-la-arboleda',
      name: 'Banqueta Esquina Norponiente La Arboleda',
      description: 'Northwest corner of Gómez Morín and Av. La Arboleda.',
    },
    {
      id: 'node:nav:crossing:la-arboleda',
      nodeType: 'crossing',
      associatedPlaceId: 'street:av-la-arboleda',
      name: 'Cruce Peatonal Av. La Arboleda',
      description: 'Designated pedestrian crosswalk across Av. La Arboleda.',
    },
    {
      id: 'node:nav:arboleda-sidewalk-corner-east',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:av-la-arboleda',
      name: 'Banqueta Esquina Nororiente La Arboleda',
      description: 'East sidewalk corner outside Corporativo Arboleda.',
    },
    {
      id: 'node:nav:entrance:corporativo-arboleda',
      nodeType: 'entrance',
      associatedPlaceId: 'building:corporativo-arboleda-building',
      name: 'Umbral Corporativo Arboleda',
      description: 'Entrance threshold of Corporativo Arboleda complex.',
    },

    // Pedestrian Crossing across Blvd. Manuel Gómez Morín
    {
      id: 'node:nav:crossing:gomez-morin-mid',
      nodeType: 'crossing',
      associatedPlaceId: 'street:blvd-gomez-morin',
      name: 'Cruce Peatonal Blvd. Gómez Morín',
      description: 'Designated signalized pedestrian crosswalk across Blvd. Gómez Morín.',
    },
    {
      id: 'node:nav:gomez-morin-south-sidewalk-mid',
      nodeType: 'sidewalk',
      associatedPlaceId: 'street:blvd-gomez-morin',
      name: 'Banqueta Gómez Morín Sur',
      description: 'South pedestrian sidewalk along Blvd. Manuel Gómez Morín.',
    },
  ];

  // 6. Pedestrian Navigation Edges
  const edges: PedestrianNavEdge[] = [
    // Residence Stoop -> Del Porvenir Sidewalk
    {
      id: 'edge:residence-to-sidewalk',
      fromNodeId: 'node:nav:entrance:del-porvenir-residence',
      toNodeId: 'node:nav:porvenir-sidewalk-north',
      edgeType: 'entrance-threshold',
      bidirectional: true,
      description: 'Threshold between residence stoop and Del Porvenir north sidewalk.',
    },
    // Del Porvenir Sidewalk spine
    {
      id: 'edge:porvenir-north-to-mid',
      fromNodeId: 'node:nav:porvenir-sidewalk-north',
      toNodeId: 'node:nav:porvenir-sidewalk-mid',
      edgeType: 'sidewalk-segment',
      bidirectional: true,
      description: 'Sidewalk along Del Porvenir between north residential and mid block.',
    },
    {
      id: 'edge:porvenir-mid-to-corner-west',
      fromNodeId: 'node:nav:porvenir-sidewalk-mid',
      toNodeId: 'node:nav:porvenir-sidewalk-corner-west',
      edgeType: 'sidewalk-segment',
      bidirectional: true,
      description: 'Sidewalk connecting to northwest corner of Gómez Morín.',
    },

    // Corner West -> Tía Lupe Sidewalk & Entrance
    {
      id: 'edge:corner-west-to-tia-lupe-sidewalk',
      fromNodeId: 'node:nav:porvenir-sidewalk-corner-west',
      toNodeId: 'node:nav:gomez-morin-north-sidewalk-west',
      edgeType: 'sidewalk-segment',
      bidirectional: true,
      description: 'Corner sidewalk wrapping onto Gómez Morín north sidewalk.',
    },
    {
      id: 'edge:tia-lupe-sidewalk-to-entrance',
      fromNodeId: 'node:nav:gomez-morin-north-sidewalk-west',
      toNodeId: 'node:nav:entrance:tia-lupe',
      edgeType: 'entrance-threshold',
      bidirectional: true,
      description: 'Threshold into Pastelerías La Tía Lupe customer entrance.',
    },
    {
      id: 'edge:tia-lupe-entrance-to-interior-threshold',
      fromNodeId: 'node:nav:entrance:tia-lupe',
      toNodeId: 'node:nav:interior:tia-lupe-threshold',
      edgeType: 'entrance-threshold',
      bidirectional: true,
      description: 'Threshold boundary connecting exterior entrance to Pastelerías La Tía Lupe interior space.',
    },

    // Tía Lupe Sidewalk -> Wing Spot Sidewalk & Entrance
    {
      id: 'edge:tia-lupe-to-wingspot-sidewalk',
      fromNodeId: 'node:nav:gomez-morin-north-sidewalk-west',
      toNodeId: 'node:nav:gomez-morin-north-sidewalk-wingspot',
      edgeType: 'sidewalk-segment',
      bidirectional: true,
      description: 'North sidewalk extending west to Wing Spot frontage.',
    },
    {
      id: 'edge:wingspot-sidewalk-to-entrance',
      fromNodeId: 'node:nav:gomez-morin-north-sidewalk-wingspot',
      toNodeId: 'node:nav:entrance:wing-spot',
      edgeType: 'entrance-threshold',
      bidirectional: true,
      description: 'Threshold into Wing Spot customer entrance.',
    },
    {
      id: 'edge:wingspot-entrance-to-interior-threshold',
      fromNodeId: 'node:nav:entrance:wing-spot',
      toNodeId: 'node:nav:interior:wing-spot-threshold',
      edgeType: 'entrance-threshold',
      bidirectional: true,
      description: 'Threshold boundary connecting exterior entrance to Wing Spot interior space.',
    },

    // Crossing Del Porvenir: Corner West <-> Crosswalk <-> Corner East
    {
      id: 'edge:corner-west-to-crossing-porvenir',
      fromNodeId: 'node:nav:porvenir-sidewalk-corner-west',
      toNodeId: 'node:nav:crossing:del-porvenir',
      edgeType: 'pedestrian-crossing',
      bidirectional: true,
      description: 'Entering pedestrian crosswalk from West corner.',
    },
    {
      id: 'edge:crossing-porvenir-to-corner-east',
      fromNodeId: 'node:nav:crossing:del-porvenir',
      toNodeId: 'node:nav:porvenir-sidewalk-corner-east',
      edgeType: 'pedestrian-crossing',
      bidirectional: true,
      description: 'Exiting crosswalk onto East corner (Dollar 2 Go side).',
    },

    // Dollar 2 Go Lot & Entrance
    {
      id: 'edge:corner-east-to-dollar-lot-access',
      fromNodeId: 'node:nav:porvenir-sidewalk-corner-east',
      toNodeId: 'node:nav:dollar-lot-access',
      edgeType: 'sidewalk-segment',
      bidirectional: true,
      description: 'Sidewalk connecting to Dollar 2 Go parking lot access.',
    },
    {
      id: 'edge:dollar-access-to-parking-path',
      fromNodeId: 'node:nav:dollar-lot-access',
      toNodeId: 'node:nav:dollar-parking-path',
      edgeType: 'lot-pathway',
      bidirectional: true,
      description: 'Pathway entering Dollar 2 Go paved parking lot.',
    },
    {
      id: 'edge:dollar-path-to-entrance',
      fromNodeId: 'node:nav:dollar-parking-path',
      toNodeId: 'node:nav:entrance:dollar-2-go',
      edgeType: 'entrance-threshold',
      bidirectional: true,
      description: 'Threshold from parking lot into Dollar 2 Go store entrance.',
    },

    // Dollar Lot Access -> Acabados HBC
    {
      id: 'edge:dollar-access-to-hbc-sidewalk',
      fromNodeId: 'node:nav:dollar-lot-access',
      toNodeId: 'node:nav:gomez-morin-north-sidewalk-hbc',
      edgeType: 'sidewalk-segment',
      bidirectional: true,
      description: 'North sidewalk continuing east to Acabados HBC.',
    },
    {
      id: 'edge:hbc-sidewalk-to-entrance',
      fromNodeId: 'node:nav:gomez-morin-north-sidewalk-hbc',
      toNodeId: 'node:nav:entrance:acabados-hbc',
      edgeType: 'entrance-threshold',
      bidirectional: true,
      description: 'Threshold into Acabados HBC paint store.',
    },

    // Acabados HBC -> CatZoo Access
    {
      id: 'edge:hbc-to-catzoo-access',
      fromNodeId: 'node:nav:gomez-morin-north-sidewalk-hbc',
      toNodeId: 'node:nav:catzoo-access',
      edgeType: 'sidewalk-segment',
      bidirectional: true,
      description: 'Sidewalk pathway branching north towards CatZoo.',
    },
    {
      id: 'edge:catzoo-access-to-entrance',
      fromNodeId: 'node:nav:catzoo-access',
      toNodeId: 'node:nav:entrance:catzoo',
      edgeType: 'entrance-threshold',
      bidirectional: true,
      description: 'Threshold into CatZoo Clínica Felina.',
    },

    // HBC Sidewalk -> La Arboleda Corner West
    {
      id: 'edge:hbc-to-arboleda-corner-west',
      fromNodeId: 'node:nav:gomez-morin-north-sidewalk-hbc',
      toNodeId: 'node:nav:arboleda-sidewalk-corner-west',
      edgeType: 'sidewalk-segment',
      bidirectional: true,
      description: 'North sidewalk continuing east to Av. La Arboleda northwest corner.',
    },

    // Crossing Av. La Arboleda: Corner West <-> Crosswalk <-> Corner East
    {
      id: 'edge:arboleda-corner-west-to-crossing',
      fromNodeId: 'node:nav:arboleda-sidewalk-corner-west',
      toNodeId: 'node:nav:crossing:la-arboleda',
      edgeType: 'pedestrian-crossing',
      bidirectional: true,
      description: 'Entering pedestrian crosswalk across Av. La Arboleda.',
    },
    {
      id: 'edge:crossing-to-arboleda-corner-east',
      fromNodeId: 'node:nav:crossing:la-arboleda',
      toNodeId: 'node:nav:arboleda-sidewalk-corner-east',
      edgeType: 'pedestrian-crossing',
      bidirectional: true,
      description: 'Exiting crosswalk onto Corporativo Arboleda corner.',
    },
    {
      id: 'edge:arboleda-corner-east-to-entrance',
      fromNodeId: 'node:nav:arboleda-sidewalk-corner-east',
      toNodeId: 'node:nav:entrance:corporativo-arboleda',
      edgeType: 'entrance-threshold',
      bidirectional: true,
      description: 'Threshold into Corporativo Arboleda complex.',
    },

    // Gómez Morín Arterial Crosswalk
    {
      id: 'edge:hbc-sidewalk-to-gomez-morin-crossing',
      fromNodeId: 'node:nav:gomez-morin-north-sidewalk-hbc',
      toNodeId: 'node:nav:crossing:gomez-morin-mid',
      edgeType: 'pedestrian-crossing',
      bidirectional: true,
      description: 'Entering crosswalk across Blvd. Manuel Gómez Morín from north sidewalk.',
    },
    {
      id: 'edge:gomez-morin-crossing-to-south-sidewalk',
      fromNodeId: 'node:nav:crossing:gomez-morin-mid',
      toNodeId: 'node:nav:gomez-morin-south-sidewalk-mid',
      edgeType: 'pedestrian-crossing',
      bidirectional: true,
      description: 'Exiting crosswalk onto south sidewalk of Blvd. Gómez Morín.',
    },
  ];

  // 8. Internal Connections (Milestone 87 — Wing Spot Multi-Room Venue Topology)
  const internalConnections: InternalConnection[] = [
    {
      connectionId: 'conn:wing-spot-dining-to-kitchen',
      name: 'Puerta Comedor a Cocina',
      buildingId: 'building:wing-spot-building',
      sourceInteriorId: 'interior:wing-spot',
      targetInteriorId: 'interior:wing-spot-kitchen',
      passageType: 'service-door',
      accessPolicy: 'staff-only',
      pairedConnectionId: 'conn:wing-spot-kitchen-to-dining',
      sourceThreshold: { x: -45.0, z: -18.0 },
      targetThreshold: { x: -45.0, z: -19.0 },
      interactionRadius: 2.5,
      description: 'Service door from public dining hall into kitchen and staff area.',
    },
    {
      connectionId: 'conn:wing-spot-kitchen-to-dining',
      name: 'Puerta Cocina a Comedor',
      buildingId: 'building:wing-spot-building',
      sourceInteriorId: 'interior:wing-spot-kitchen',
      targetInteriorId: 'interior:wing-spot',
      passageType: 'service-door',
      accessPolicy: 'unrestricted',
      pairedConnectionId: 'conn:wing-spot-dining-to-kitchen',
      sourceThreshold: { x: -45.0, z: -19.0 },
      targetThreshold: { x: -45.0, z: -18.0 },
      interactionRadius: 2.5,
      description: 'Unrestricted service door from kitchen back to dining hall.',
    },
  ];

  return {
    roads,
    intersections,
    parcels,
    entrances,
    interiors,
    internalConnections,
    navGraph: { nodes, edges },
  };
}

/**
 * Deterministic route finder through the pedestrian navigation graph.
 *
 * Uses deterministic Breadth-First Search (BFS) to find the shortest
 * sequence of connected pedestrian navigation nodes.
 *
 * Returns an ordered array of node IDs [origin, n1, n2, ..., destination],
 * or null if no valid connected path exists.
 */
export function findPedestrianRoute(
  graph: PedestrianNavGraph,
  originNodeId: string,
  destinationNodeId: string
): string[] | null {
  if (originNodeId === destinationNodeId) {
    return [originNodeId];
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!nodeMap.has(originNodeId) || !nodeMap.has(destinationNodeId)) {
    return null;
  }

  // Build adjacency list respecting edge directionality
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    if (edge.bidirectional) {
      adjacency.get(edge.toNodeId)?.push(edge.fromNodeId);
    }
  }

  // Deterministic BFS
  const queue: string[] = [originNodeId];
  const visited = new Set<string>([originNodeId]);
  const parentMap = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === destinationNodeId) {
      // Reconstruct path
      const path: string[] = [];
      let curr: string | undefined = destinationNodeId;
      while (curr !== undefined) {
        path.unshift(curr);
        curr = parentMap.get(curr);
      }
      return path;
    }

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parentMap.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  return null;
}

/**
 * Validates road network connectivity.
 */
export function validateRoadConnectivity(roads: readonly RoadSegment[]): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  const roadMap = new Map(roads.map((r) => [r.roadId, r]));

  for (const road of roads) {
    for (const connectedId of road.connectedRoadIds) {
      const target = roadMap.get(connectedId);
      if (!target) {
        errors.push(`Road "${road.roadId}" references non-existent connected road "${connectedId}"`);
      } else if (!target.connectedRoadIds.includes(road.roadId)) {
        errors.push(
          `Bidirectional road connection asymmetry: "${road.roadId}" connects to "${connectedId}", but not vice versa`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Evaluates whether a candidate pedestrian path contains non-crosswalk roadway traversal.
 */
export function validatePedestrianRouteSafety(
  graph: PedestrianNavGraph,
  routeNodeIds: readonly string[]
): {
  readonly safe: boolean;
  readonly message: string;
} {
  if (routeNodeIds.length <= 1) {
    return { safe: true, message: 'Trivial path is safe' };
  }

  const edgeMap = new Map<string, PedestrianNavEdge>();
  for (const edge of graph.edges) {
    edgeMap.set(`${edge.fromNodeId}->${edge.toNodeId}`, edge);
    if (edge.bidirectional) {
      edgeMap.set(`${edge.toNodeId}->${edge.fromNodeId}`, edge);
    }
  }

  for (let i = 0; i < routeNodeIds.length - 1; i++) {
    const from = routeNodeIds[i];
    const to = routeNodeIds[i + 1];
    const edge = edgeMap.get(`${from}->${to}`);
    if (!edge) {
      return {
        safe: false,
        message: `Discontinuous path: no valid edge between "${from}" and "${to}"`,
      };
    }
  }

  return { safe: true, message: 'All path segments navigate valid pedestrian infrastructure' };
}

/**
 * Contextual Entrance Action definition (Milestone 81).
 *
 * Represents the resolved, authoritative domain command and target location
 * associated with a specific BuildingEntrance.
 */
export interface ContextualEntranceAction {
  readonly entranceId: string;
  readonly buildingId: string;
  readonly targetLocationId: string;
  readonly targetName: string;
  readonly actionLabel: string;
  readonly commandName:
    | 'enterBuilding'
    | 'enterRestaurant'
    | 'interactAtResidence'
    | 'exitRestaurant'
    | 'enterEntranceThreshold'
    | 'exitEntranceThreshold'
    | 'unavailable';
  readonly isAvailable: boolean;
  readonly unavailableReason?: string;
}

/**
 * Finds a BuildingEntrance in the topology by its entranceId.
 */
export function findEntranceById(
  topology: GomezMorinSpatialTopology,
  entranceId: string
): BuildingEntrance | undefined {
  return topology.entrances.find((e) => e.entranceId === entranceId);
}

/**
 * Finds a BuildingEntrance in the topology by its associated navigation node ID.
 */
export function findEntranceByNavNode(
  topology: GomezMorinSpatialTopology,
  navNodeId: string
): BuildingEntrance | undefined {
  return topology.entrances.find((e) => e.associatedNavNodeId === navNodeId);
}

/**
 * Finds the primary customer or residential entrance for a given buildingId.
 */
export function findEntranceByBuilding(
  topology: GomezMorinSpatialTopology,
  buildingId: string
): BuildingEntrance | undefined {
  return topology.entrances.find((e) => e.buildingId === buildingId);
}

/**
 * Resolves the authoritative domain command, target location, and user-facing action label
 * for a specific BuildingEntrance.
 *
 * Architectural Invariant (Milestone 81):
 * - Entrance proximity maps to THAT specific building/venue, never to an arbitrary adjacent property.
 * - Pastelerías La Tía Lupe resolves to Pastelerías La Tía Lupe, NEVER Wing Spot.
 * - Wing Spot resolves to Wing Spot.
 * - Zero business-specific hardcoding in presentation or input handlers.
 */
export function resolveContextualEntranceAction(
  entrance: BuildingEntrance,
  state?: {
    places?: readonly { readonly id: string; readonly name: string; readonly type: string }[];
    restaurants?: readonly { readonly id: string; readonly name: string; readonly buildingId: string; readonly operationalState?: string }[];
  },
  currentLocationId?: string,
  topology: GomezMorinSpatialTopology = createGomezMorinSpatialTopology(),
  currentInteriorSpaceId?: string | null
): ContextualEntranceAction {
  // Check if a restaurant is located inside this building
  const matchingRestaurant = state?.restaurants?.find(
    (r) => r.buildingId === entrance.buildingId
  );

  // Authoritative Egress Resolution (Milestone 85):
  // If agent has an explicit interiorSpaceId, exit resolution is scoped strictly to that InteriorSpace!
  if (currentInteriorSpaceId) {
    const isAssociatedWithThisInterior =
      entrance.interiorSpaceId === currentInteriorSpaceId ||
      topology.interiors.some(
        (i) => i.interiorId === currentInteriorSpaceId && i.entranceIds.includes(entrance.entranceId)
      );

    if (isAssociatedWithThisInterior) {
      const exitStreet = topology.roads.find((r) => r.streetPlaceId === entrance.facingStreetPlaceId);
      const targetStreetName =
        exitStreet?.name ??
        (entrance.facingStreetPlaceId === 'street:blvd-gomez-morin'
          ? 'Blvd. Manuel Gómez Morín'
          : entrance.facingStreetPlaceId);
      return {
        entranceId: entrance.entranceId,
        buildingId: entrance.buildingId,
        targetLocationId: entrance.facingStreetPlaceId,
        targetName: targetStreetName,
        actionLabel: `Exit ${entrance.name.replace(/ — Entrada.*$/, '')}`,
        commandName: matchingRestaurant ? 'exitRestaurant' : 'exitEntranceThreshold',
        isAvailable: true,
      };
    }
  } else if (currentLocationId) {
    // Generic Bidirectional Egress: If agent is inside an interior associated with this entrance
    const isInsideInterior =
      (entrance.interiorSpaceId && (currentLocationId === entrance.interiorSpaceId || currentLocationId === entrance.buildingId)) ||
      topology.interiors.some((i) =>
        i.entranceIds.includes(entrance.entranceId) &&
        (currentLocationId === i.associatedPlaceId || currentLocationId === i.interiorId || currentLocationId === i.buildingId)
      );

    if (isInsideInterior) {
      const exitStreet = topology.roads.find((r) => r.streetPlaceId === entrance.facingStreetPlaceId);
      const targetStreetName = exitStreet?.name ?? (entrance.facingStreetPlaceId === 'street:blvd-gomez-morin' ? 'Blvd. Manuel Gómez Morín' : entrance.facingStreetPlaceId);
      return {
        entranceId: entrance.entranceId,
        buildingId: entrance.buildingId,
        targetLocationId: entrance.facingStreetPlaceId,
        targetName: targetStreetName,
        actionLabel: `Exit ${entrance.name.replace(/ — Entrada.*$/, '')}`,
        commandName: matchingRestaurant ? 'exitRestaurant' : 'exitEntranceThreshold',
        isAvailable: true,
      };
    }
  }

  // 1. Pastelerías La Tía Lupe
  if (entrance.buildingId === 'building:tia-lupe-building') {
    const targetLoc = matchingRestaurant?.id ?? 'restaurant:pasteleria-tia-lupe';
    const name = matchingRestaurant?.name ?? 'Pastelerías La Tía Lupe';
    return {
      entranceId: entrance.entranceId,
      buildingId: entrance.buildingId,
      targetLocationId: targetLoc,
      targetName: name,
      actionLabel: `Enter ${name}`,
      commandName: matchingRestaurant ? 'enterRestaurant' : 'enterBuilding',
      isAvailable: true,
    };
  }

  // 2. Wing Spot
  if (entrance.buildingId === 'building:wing-spot-building') {
    const targetLoc = matchingRestaurant?.id ?? 'restaurant:wing-spot';
    const name = matchingRestaurant?.name ?? 'Wing Spot Gómez Morín';
    return {
      entranceId: entrance.entranceId,
      buildingId: entrance.buildingId,
      targetLocationId: targetLoc,
      targetName: name,
      actionLabel: 'Enter Wing Spot',
      commandName: matchingRestaurant ? 'enterRestaurant' : 'enterBuilding',
      isAvailable: true,
    };
  }

  // 3. Residencia Del Porvenir
  if (entrance.buildingId === 'building:del-porvenir-residence') {
    return {
      entranceId: entrance.entranceId,
      buildingId: entrance.buildingId,
      targetLocationId: 'building:del-porvenir-residence',
      targetName: 'Residencia Del Porvenir',
      actionLabel: 'Enter Residencia Del Porvenir',
      commandName: 'interactAtResidence',
      isAvailable: true,
    };
  }

  // 4. Dollar 2 Go Store
  if (entrance.buildingId === 'building:dollar-2-go-building') {
    return {
      entranceId: entrance.entranceId,
      buildingId: entrance.buildingId,
      targetLocationId: 'building:dollar-2-go-building',
      targetName: 'Dollar 2 Go',
      actionLabel: 'Enter Dollar 2 Go',
      commandName: 'enterBuilding',
      isAvailable: true,
    };
  }

  // 5. Acabados HRC
  if (entrance.buildingId === 'building:acabados-hbc-building') {
    return {
      entranceId: entrance.entranceId,
      buildingId: entrance.buildingId,
      targetLocationId: 'building:acabados-hbc-building',
      targetName: 'Acabados HRC',
      actionLabel: 'Enter Acabados HRC',
      commandName: 'enterBuilding',
      isAvailable: true,
    };
  }

  // 6. CatZoo Clínica Felina
  if (entrance.buildingId === 'building:catzoo-building') {
    return {
      entranceId: entrance.entranceId,
      buildingId: entrance.buildingId,
      targetLocationId: 'building:catzoo-building',
      targetName: 'CatZoo Clínica Felina',
      actionLabel: 'Enter CatZoo Clínica Felina',
      commandName: 'enterBuilding',
      isAvailable: true,
    };
  }

  // 7. Corporativo Arboleda
  if (entrance.buildingId === 'building:corporativo-arboleda-building') {
    return {
      entranceId: entrance.entranceId,
      buildingId: entrance.buildingId,
      targetLocationId: 'building:corporativo-arboleda-building',
      targetName: 'Corporativo Arboleda',
      actionLabel: 'Enter Corporativo Arboleda',
      commandName: 'enterBuilding',
      isAvailable: true,
    };
  }

  // Generic fallback
  const matchingPlace = state?.places?.find((p) => p.id === entrance.buildingId);
  const displayName = matchingPlace?.name ?? entrance.name;
  return {
    entranceId: entrance.entranceId,
    buildingId: entrance.buildingId,
    targetLocationId: entrance.buildingId,
    targetName: displayName,
    actionLabel: `Enter ${displayName}`,
    commandName: 'enterBuilding',
    isAvailable: true,
  };
}

/**
 * Finds an InteriorSpace in the topology by its interiorId (Milestone 82).
 */
export function findInteriorSpaceById(
  topology: GomezMorinSpatialTopology,
  interiorId: string
): InteriorSpace | undefined {
  return topology.interiors.find((i) => i.interiorId === interiorId);
}

/**
 * Finds an InteriorSpace in the topology by its containing buildingId (Milestone 82).
 */
export function findInteriorSpaceByBuilding(
  topology: GomezMorinSpatialTopology,
  buildingId: string
): InteriorSpace | undefined {
  return topology.interiors.find((i) => i.buildingId === buildingId);
}

/**
 * Finds all InteriorSpaces in the topology belonging to a buildingId (Milestone 82 Generalization).
 */
export function findInteriorSpacesByBuilding(
  topology: GomezMorinSpatialTopology,
  buildingId: string
): readonly InteriorSpace[] {
  return topology.interiors.filter((i) => i.buildingId === buildingId);
}

/**
 * Finds an InteriorSpace in the topology by its associated placeId (Milestone 82).
 */
export function findInteriorSpaceByPlace(
  topology: GomezMorinSpatialTopology,
  placeId: string
): InteriorSpace | undefined {
  return topology.interiors.find(
    (i) => i.associatedPlaceId === placeId || i.buildingId === placeId || i.interiorId === placeId
  );
}

/**
 * Finds an InternalConnection in the topology by its connectionId (Milestone 86).
 */
export function findInternalConnectionById(
  topology: GomezMorinSpatialTopology,
  connectionId: string
): InternalConnection | undefined {
  return topology.internalConnections?.find((c) => c.connectionId === connectionId);
}

/**
 * Finds all outgoing InternalConnections from an interior space (Milestone 86).
 */
export function findOutgoingInternalConnections(
  topology: GomezMorinSpatialTopology,
  sourceInteriorId: string
): readonly InternalConnection[] {
  return topology.internalConnections?.filter((c) => c.sourceInteriorId === sourceInteriorId) ?? [];
}

/**
 * Pure evaluator checking if coordinates (x, z) are strictly inside an interior boundary (Milestone 82).
 *
 * NOTE: PROVISIONAL INTERIOR GEOMETRY evaluation.
 */
export function isInsideInteriorBoundary(
  interior: InteriorSpace,
  x: number,
  z: number
): boolean {
  return (
    x >= interior.boundary.minX &&
    x <= interior.boundary.maxX &&
    z >= interior.boundary.minZ &&
    z <= interior.boundary.maxZ
  );
}

export type AuthorizedIngressContext =
  | { readonly type: 'player-customer' }
  | {
      readonly type: 'staff-workplace';
      readonly workplaceId: string;
    };

export interface EnterEntranceThresholdParams {
  readonly agentId: string;
  readonly entranceId: string;
  readonly spatialPosition?: { readonly x: number; readonly z: number };
  readonly maxThresholdDistance?: number;
  readonly authorizedContext?: AuthorizedIngressContext;
}

export interface ExitEntranceThresholdParams {
  readonly agentId: string;
  readonly entranceId: string;
  readonly spatialPosition?: { readonly x: number; readonly z: number };
  readonly maxThresholdDistance?: number;
}

export interface EntranceThresholdTransitionResult {
  readonly success: boolean;
  readonly code:
    | 'success'
    | 'agent-not-found'
    | 'agent-not-player'
    | 'unauthorized-ingress'
    | 'unauthorized-workplace-ingress'
    | 'entrance-not-found'
    | 'interior-not-found'
    | 'invalid-origin-location'
    | 'invalid-entrance-position'
    | 'restaurant-closed'
    | 'admission-cutoff-reached'
    | 'already-inside'
    | 'not-inside-interior'
    | 'invalid-exit-position';
  readonly message: string;
  readonly agentId: string;
  readonly entranceId: string;
  readonly previousLocationId?: string;
  readonly newLocationId?: string;
  readonly interiorId?: string;
}

/**
 * Authoritative entrance ingress transition (Milestone 82 — First Building Interior Boundary).
 *
 * Enforces:
 * 1. Agent exists and is player.
 * 2. Entrance exists in topology.
 * 3. Associated InteriorSpace exists.
 * 4. Agent is located at the entrance's facing street or building.
 * 5. Spatial position (if provided) is within the entrance threshold radius (rejects wall traversal).
 * 6. Operational checks (e.g. restaurant operationalState !== 'closed').
 * 7. Atomically transitions Agent.locationId to interior's associatedPlaceId.
 * 8. Pure rejection with zero state mutation on failure.
 */
export function enterThroughEntranceThreshold(
  state: WorldState,
  params: EnterEntranceThresholdParams,
  topology: GomezMorinSpatialTopology = createGomezMorinSpatialTopology()
): EntranceThresholdTransitionResult {
  const { agentId, entranceId, spatialPosition, maxThresholdDistance = 3.5 } = params;

  // 1. Agent exists
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    return {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      entranceId,
    };
  }

  // 2. Authorization context resolution & validation
  const authorizedContext = params.authorizedContext;

  if (!authorizedContext) {
    // Default legacy path: customer entrance (player-only)
    if (agent.agentType !== 'player') {
      return {
        success: false,
        code: 'agent-not-player',
        message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
        agentId,
        entranceId,
      };
    }
  } else if (authorizedContext.type === 'player-customer') {
    if (agent.agentType !== 'player') {
      return {
        success: false,
        code: 'agent-not-player',
        message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
        agentId,
        entranceId,
      };
    }
  } else if (authorizedContext.type === 'staff-workplace') {
    if (agent.agentType !== 'npc') {
      return {
        success: false,
        code: 'unauthorized-workplace-ingress',
        message: `Agent "${agentId}" is not an NPC and cannot enter under staff-workplace authorization`,
        agentId,
        entranceId,
      };
    }
  }

  // 3. Entrance exists
  const entrance = findEntranceById(topology, entranceId);
  if (!entrance) {
    return {
      success: false,
      code: 'entrance-not-found',
      message: `Entrance "${entranceId}" not found in topology`,
      agentId,
      entranceId,
    };
  }

  // 4. Interior space exists
  const interior = topology.interiors.find((i) => i.entranceIds.includes(entranceId));
  if (!interior) {
    return {
      success: false,
      code: 'interior-not-found',
      message: `No interior space associated with entrance "${entranceId}"`,
      agentId,
      entranceId,
    };
  }

  // 4b. Staff workplace authorization check
  if (authorizedContext?.type === 'staff-workplace') {
    if (authorizedContext.workplaceId !== interior.associatedPlaceId) {
      return {
        success: false,
        code: 'unauthorized-workplace-ingress',
        message: `Workplace authorization mismatch: agent authorized for "${authorizedContext.workplaceId}", but interior belongs to "${interior.associatedPlaceId}"`,
        agentId,
        entranceId,
      };
    }
    const schedule = findNpcSchedule(agent.id);
    const isScheduleAuthorized = schedule && schedule.workplaceId === interior.associatedPlaceId;
    const isSiteAssocAuthorized =
      Array.isArray(state.siteAgentAssociations) &&
      state.siteAgentAssociations.some(
        (s: any) =>
          s.agentId === agent.id &&
          s.placeId === interior.associatedPlaceId &&
          s.role === 'attendant'
      );
    if (!isScheduleAuthorized && !isSiteAssocAuthorized) {
      return {
        success: false,
        code: 'unauthorized-workplace-ingress',
        message: `NPC "${agent.id}" is not authorized to work at "${interior.associatedPlaceId}"`,
        agentId,
        entranceId,
      };
    }
  }

  // 5. Check if already inside
  if (
    agent.locationId === interior.associatedPlaceId ||
    agent.locationId === interior.interiorId
  ) {
    return {
      success: false,
      code: 'already-inside',
      message: `Agent "${agentId}" is already inside interior "${interior.interiorId}"`,
      agentId,
      entranceId,
      previousLocationId: agent.locationId,
      interiorId: interior.interiorId,
    };
  }

  // 6. Validate origin location (must be at entrance's facing street or building)
  if (
    agent.locationId !== entrance.facingStreetPlaceId &&
    agent.locationId !== entrance.buildingId
  ) {
    return {
      success: false,
      code: 'invalid-origin-location',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not at facing street "${entrance.facingStreetPlaceId}" or building "${entrance.buildingId}"`,
      agentId,
      entranceId,
      previousLocationId: agent.locationId,
    };
  }

  // 7. Spatial coordinate validation (if provided)
  // Ensures player is standing at the entrance threshold and not attempting to enter through an exterior wall
  if (spatialPosition) {
    const anchor = entrance.thresholdPosition;
    if (anchor) {
      const dist = Math.hypot(spatialPosition.x - anchor.x, spatialPosition.z - anchor.z);
      if (dist > maxThresholdDistance) {
        return {
          success: false,
          code: 'invalid-entrance-position',
          message: `Spatial position (${spatialPosition.x}, ${spatialPosition.z}) is ${dist.toFixed(1)}m away from entrance threshold (max allowed: ${maxThresholdDistance}m). Cannot enter through wall.`,
          agentId,
          entranceId,
          previousLocationId: agent.locationId,
        };
      }
    }
  }

  // 8. Commercial operational validation (if target is a restaurant and entering as customer)
  const isCustomer = !authorizedContext || authorizedContext.type === 'player-customer';
  const restaurant = state.restaurants.find((r) => r.id === interior.associatedPlaceId);
  if (isCustomer && restaurant) {
    if (restaurant.operationalState === 'closed') {
      return {
        success: false,
        code: 'restaurant-closed',
        message: `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}")`,
        agentId,
        entranceId,
        previousLocationId: agent.locationId,
        interiorId: interior.interiorId,
      };
    }
    if (restaurant.operationalState === 'closing-soon') {
      const schedule = findBusinessSchedule(restaurant.id);
      if (schedule) {
        return {
          success: false,
          code: 'admission-cutoff-reached',
          message: `Restaurant "${restaurant.id}" is closing soon and no longer accepts new entries (operationalState: "${restaurant.operationalState}")`,
          agentId,
          entranceId,
          previousLocationId: agent.locationId,
          interiorId: interior.interiorId,
        };
      }
    }
  }

  // Authoritative state transition: player enters interior place
  const previousLocationId = agent.locationId;
  agent.locationId = interior.associatedPlaceId;
  agent.interiorSpaceId = interior.interiorId;

  return {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully entered "${interior.name}" through entrance "${entranceId}"`,
    agentId,
    entranceId,
    previousLocationId,
    newLocationId: interior.associatedPlaceId,
    interiorId: interior.interiorId,
  };
}

/**
 * Authoritative entrance egress transition (Milestone 82 — First Building Interior Boundary).
 *
 * Enforces:
 * 1. Agent exists and is player.
 * 2. Entrance exists in topology.
 * 3. Associated InteriorSpace exists.
 * 4. Agent is currently inside the interior space.
 * 5. Spatial position (if provided) is within the interior threshold radius (rejects wall traversal).
 * 6. Atomically transitions Agent.locationId to entrance's facingStreetPlaceId.
 * 7. Pure rejection with zero state mutation on failure.
 */
export function exitThroughEntranceThreshold(
  state: WorldState,
  params: ExitEntranceThresholdParams,
  topology: GomezMorinSpatialTopology = createGomezMorinSpatialTopology()
): EntranceThresholdTransitionResult {
  const { agentId, entranceId, spatialPosition, maxThresholdDistance = 3.5 } = params;

  // 1. Agent exists
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    return {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      entranceId,
    };
  }

  // 2. Agent is player
  if (agent.agentType !== 'player') {
    return {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      entranceId,
    };
  }

  // 3. Entrance exists
  const entrance = findEntranceById(topology, entranceId);
  if (!entrance) {
    return {
      success: false,
      code: 'entrance-not-found',
      message: `Entrance "${entranceId}" not found in topology`,
      agentId,
      entranceId,
    };
  }

  // 4. Interior exists
  const interior = topology.interiors.find((i) => i.entranceIds.includes(entranceId));
  if (!interior) {
    return {
      success: false,
      code: 'interior-not-found',
      message: `No interior space associated with entrance "${entranceId}"`,
      agentId,
      entranceId,
    };
  }

  // 5. Agent must currently be inside the interior (Hierarchical Spatial Identity)
  const isInsideInterior =
    agent.interiorSpaceId !== null && agent.interiorSpaceId !== undefined
      ? agent.interiorSpaceId === interior.interiorId
      : (agent.locationId === interior.associatedPlaceId ||
         agent.locationId === interior.interiorId ||
         agent.locationId === interior.buildingId);

  if (!isInsideInterior) {
    return {
      success: false,
      code: 'not-inside-interior',
      message: `Agent "${agentId}" is at location "${agent.locationId}" (interiorSpaceId: ${JSON.stringify(agent.interiorSpaceId)}), not inside interior "${interior.interiorId}"`,
      agentId,
      entranceId,
      previousLocationId: agent.locationId,
      interiorId: interior.interiorId,
    };
  }

  // 6. Spatial coordinate validation (if provided)
  // Ensures player is standing at the interior threshold and not attempting to exit through an interior wall
  if (spatialPosition) {
    const interiorAnchor = entrance.interiorThresholdPosition;
    if (interiorAnchor) {
      const dist = Math.hypot(spatialPosition.x - interiorAnchor.x, spatialPosition.z - interiorAnchor.z);
      if (dist > maxThresholdDistance) {
        return {
          success: false,
          code: 'invalid-exit-position',
          message: `Spatial position (${spatialPosition.x}, ${spatialPosition.z}) is ${dist.toFixed(1)}m away from interior threshold (max allowed: ${maxThresholdDistance}m). Cannot exit through wall.`,
          agentId,
          entranceId,
          previousLocationId: agent.locationId,
        };
      }
    }
  }

  // Authoritative state transition: returns agent to exterior facing street
  const previousLocationId = agent.locationId;
  agent.locationId = entrance.facingStreetPlaceId;
  agent.interiorSpaceId = null;

  return {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully exited "${interior.name}" through entrance "${entranceId}" onto "${entrance.facingStreetPlaceId}"`,
    agentId,
    entranceId,
    previousLocationId,
    newLocationId: entrance.facingStreetPlaceId,
    interiorId: interior.interiorId,
  };
}

export interface InteriorTopologyValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Pure domain validator verifying topological consistency and invariants of InteriorSpaces (Milestone 82 Audit).
 *
 * Verifies:
 * 1. Global uniqueness of all InteriorSpace.interiorId.
 * 2. Spatial boundaries are non-degenerate (maxX > minX, maxZ > minZ).
 * 3. Associated buildingId resolves to an existing building.
 * 4. Each interior entranceId resolves to an existing BuildingEntrance.
 * 5. Entrances referencing an interior belong to the same building.
 * 6. Every entrance references at most one interior.
 * 7. Interior nav threshold nodes resolve in the pedestrian navigation graph.
 */
export function validateInteriorTopology(
  topology: GomezMorinSpatialTopology
): InteriorTopologyValidationResult {
  const errors: string[] = [];

  // 1. Interior ID uniqueness
  const interiorIds = new Set<string>();
  for (const interior of topology.interiors) {
    if (interiorIds.has(interior.interiorId)) {
      errors.push(`Duplicate interiorId "${interior.interiorId}" found in topology`);
    }
    interiorIds.add(interior.interiorId);
  }

  // 2. Interior -> Entrance resolution & consistency
  const entranceToInteriorMap = new Map<string, string>();
  for (const interior of topology.interiors) {
    // Check boundary non-degeneracy
    if (interior.boundary.maxX <= interior.boundary.minX) {
      errors.push(
        `Interior "${interior.interiorId}" has invalid X bounds: maxX (${interior.boundary.maxX}) <= minX (${interior.boundary.minX})`
      );
    }
    if (interior.boundary.maxZ <= interior.boundary.minZ) {
      errors.push(
        `Interior "${interior.interiorId}" has invalid Z bounds: maxZ (${interior.boundary.maxZ}) <= minZ (${interior.boundary.minZ})`
      );
    }

    // Check buildingId resolves
    const buildingExists =
      topology.parcels.some((p) => p.associatedBuildingIds.includes(interior.buildingId)) ||
      topology.entrances.some((e) => e.buildingId === interior.buildingId);
    if (!buildingExists) {
      errors.push(
        `Interior "${interior.interiorId}" references non-existent buildingId "${interior.buildingId}"`
      );
    }

    // Check entranceIds
    for (const entranceId of interior.entranceIds) {
      const entrance = topology.entrances.find((e) => e.entranceId === entranceId);
      if (!entrance) {
        errors.push(
          `Interior "${interior.interiorId}" references non-existent entranceId "${entranceId}"`
        );
        continue;
      }

      // Check building consistency
      if (entrance.buildingId !== interior.buildingId) {
        errors.push(
          `Interior "${interior.interiorId}" belongs to building "${interior.buildingId}" but entrance "${entranceId}" belongs to "${entrance.buildingId}"`
        );
      }

      // Check at most one interior per entrance
      if (entranceToInteriorMap.has(entranceId)) {
        errors.push(
          `Entrance "${entranceId}" is referenced by multiple interiors: "${entranceToInteriorMap.get(entranceId)}" and "${interior.interiorId}"`
        );
      }
      entranceToInteriorMap.set(entranceId, interior.interiorId);
    }
  }

  // 3. Entrance -> nav node resolution
  for (const entrance of topology.entrances) {
    if (entrance.interiorNavNodeId) {
      const navNodeExists = topology.navGraph.nodes.some(
        (n) => n.id === entrance.interiorNavNodeId
      );
      if (!navNodeExists) {
        errors.push(
          `Entrance "${entrance.entranceId}" references non-existent interiorNavNodeId "${entrance.interiorNavNodeId}"`
        );
      }
    }
    if (entrance.associatedNavNodeId) {
      const navNodeExists = topology.navGraph.nodes.some(
        (n) => n.id === entrance.associatedNavNodeId
      );
      if (!navNodeExists) {
        errors.push(
          `Entrance "${entrance.entranceId}" references non-existent associatedNavNodeId "${entrance.associatedNavNodeId}"`
        );
      }
    }
  }

  // 4. Internal connections validation (Milestone 86)
  if (Array.isArray(topology.internalConnections)) {
    const connectionIds = new Set<string>();
    for (const conn of topology.internalConnections) {
      if (!conn.connectionId || typeof conn.connectionId !== 'string' || conn.connectionId.trim() === '') {
        errors.push('Internal connection has missing or invalid connectionId');
        continue;
      }
      if (connectionIds.has(conn.connectionId)) {
        errors.push(`Duplicate connectionId "${conn.connectionId}" found in topology`);
      }
      connectionIds.add(conn.connectionId);

      if (conn.sourceInteriorId === conn.targetInteriorId) {
        errors.push(
          `Internal connection "${conn.connectionId}" has identical source and target interior: "${conn.sourceInteriorId}"`
        );
      }

      const sourceInterior = topology.interiors.find((i) => i.interiorId === conn.sourceInteriorId);
      if (!sourceInterior) {
        errors.push(
          `Internal connection "${conn.connectionId}" references non-existent sourceInteriorId "${conn.sourceInteriorId}"`
        );
      }

      const targetInterior = topology.interiors.find((i) => i.interiorId === conn.targetInteriorId);
      if (!targetInterior) {
        errors.push(
          `Internal connection "${conn.connectionId}" references non-existent targetInteriorId "${conn.targetInteriorId}"`
        );
      }

      if (sourceInterior && targetInterior) {
        // Invariant H: Same-building spatial constraint
        if (sourceInterior.buildingId !== targetInterior.buildingId) {
          errors.push(
            `Internal connection "${conn.connectionId}" connects interiors across different buildings: "${sourceInterior.buildingId}" and "${targetInterior.buildingId}"`
          );
        }
        if (conn.buildingId !== sourceInterior.buildingId) {
          errors.push(
            `Internal connection "${conn.connectionId}" belongs to building "${conn.buildingId}" but source interior belongs to "${sourceInterior.buildingId}"`
          );
        }

        // Invariant G: Logical context preservation (same venue)
        if (sourceInterior.associatedPlaceId !== targetInterior.associatedPlaceId) {
          errors.push(
            `Internal connection "${conn.connectionId}" connects interiors across different places: "${sourceInterior.associatedPlaceId}" and "${targetInterior.associatedPlaceId}"`
          );
        }
      }

      // Paired connection consistency
      if (conn.pairedConnectionId) {
        const paired = topology.internalConnections.find((c) => c.connectionId === conn.pairedConnectionId);
        if (!paired) {
          errors.push(
            `Internal connection "${conn.connectionId}" references non-existent pairedConnectionId "${conn.pairedConnectionId}"`
          );
        } else {
          if (
            paired.sourceInteriorId !== conn.targetInteriorId ||
            paired.targetInteriorId !== conn.sourceInteriorId
          ) {
            errors.push(
              `Internal connection "${conn.connectionId}" pairedConnection "${conn.pairedConnectionId}" has mismatched source/target: expected ${conn.targetInteriorId} -> ${conn.sourceInteriorId}, got ${paired.sourceInteriorId} -> ${paired.targetInteriorId}`
            );
          }
          if (paired.pairedConnectionId !== conn.connectionId) {
            errors.push(
              `Internal connection "${conn.connectionId}" pairedConnection "${conn.pairedConnectionId}" does not reciprocally reference "${conn.connectionId}"`
            );
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Authoritative Spatial Invariants Validator (Milestone 85).
 *
 * Enforces the core spatial invariants of Hierarchical Spatial Identity:
 * - Invariant A (Exterior): If agent is outside an interior, interiorSpaceId === null.
 * - Invariant B (Interior): If interiorSpaceId !== null, referenced InteriorSpace must exist in topology.
 * - Invariant C (Logical Context): For an indoor agent, Agent.locationId === InteriorSpace.associatedPlaceId.
 * - Invariant D (Building Consistency): Referenced InteriorSpace must belong to a valid building in topology.
 * - Invariant E (No Entrance Identity Leakage): interiorSpaceId must never contain entrance:... or node:nav:...
 */
export function validateAgentSpatialInvariants(
  agent: { readonly id: string; readonly locationId: string; readonly interiorSpaceId?: string | null },
  topology: GomezMorinSpatialTopology = createGomezMorinSpatialTopology()
): { readonly valid: boolean; readonly errors: readonly string[] } {
  const errors: string[] = [];

  const subId = agent.interiorSpaceId ?? null;

  // Invariant E: No entrance or nav node leakage
  if (subId !== null) {
    if (subId.startsWith('entrance:') || subId.startsWith('node:nav:')) {
      errors.push(
        `Invariant E violation: Agent "${agent.id}" interiorSpaceId "${subId}" leaks entrance or nav node identity`
      );
    }
  }

  if (subId === null) {
    // Invariant A: Exterior agent.
    // If locationId references a pure interiorId, flag violation
    const matchingPureInterior = topology.interiors.find((i) => i.interiorId === agent.locationId);
    if (matchingPureInterior) {
      errors.push(
        `Invariant A violation: Agent "${agent.id}" has interiorSpaceId null but locationId "${agent.locationId}" is an InteriorSpace id`
      );
    }
  } else {
    // Invariant B: InteriorSpace must exist in topology
    const interior = topology.interiors.find((i) => i.interiorId === subId);
    if (!interior) {
      errors.push(
        `Invariant B violation: Agent "${agent.id}" references non-existent InteriorSpace "${subId}"`
      );
    } else {
      // Invariant C: Logical context check
      if (agent.locationId !== interior.associatedPlaceId) {
        errors.push(
          `Invariant C violation: Agent "${agent.id}" locationId "${agent.locationId}" does not match InteriorSpace.associatedPlaceId "${interior.associatedPlaceId}"`
        );
      }

      // Invariant D: Building consistency
      const buildingExists =
        topology.parcels.some((p) => p.associatedBuildingIds.includes(interior.buildingId)) ||
        topology.entrances.some((e) => e.buildingId === interior.buildingId);
      if (!buildingExists) {
        errors.push(
          `Invariant D violation: InteriorSpace "${subId}" belongs to building "${interior.buildingId}" which is not in topology`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Authoritative Unified Entrance Ingress Authority (Milestone 85 Correction Pass).
 *
 * Implements Principle P2: No second door into interiors.
 * Both players and NPCs ultimately use the same spatial ingress authority when entering
 * a registered InteriorSpace through a valid BuildingEntrance.
 */
export function executeUnifiedEntranceIngress(
  state: WorldState,
  params: EnterEntranceThresholdParams,
  topology: GomezMorinSpatialTopology = createGomezMorinSpatialTopology()
): EntranceThresholdTransitionResult {
  return enterThroughEntranceThreshold(state, params, topology);
}

/**
 * Tier 2 Spatial Validator (Milestone 85 Correction Pass).
 *
 * Validates topology-dependent spatial invariants across all agents in WorldState
 * against the authoritative GomezMorinSpatialTopology.
 *
 * Enforces Invariants A through E:
 * - Invariant A: Exterior agents (interiorSpaceId === null) do not have locationId as an InteriorSpace id.
 * - Invariant B: Interior agents (interiorSpaceId !== null) reference existing InteriorSpace in topology.
 * - Invariant C: Indoor agent locationId matches InteriorSpace.associatedPlaceId.
 * - Invariant D: Interior belongs to valid registered building in topology.
 * - Invariant E: interiorSpaceId never leaks entrance or navigation node identities.
 */
export function validateWorldSpatialTopology(
  state: WorldState,
  topology: GomezMorinSpatialTopology = createGomezMorinSpatialTopology()
): void {
  if (!state || !Array.isArray(state.agents)) {
    return;
  }

  for (const agent of state.agents) {
    const result = validateAgentSpatialInvariants(agent, topology);
    if (!result.valid) {
      throw new Error(
        `World spatial topology validation failed for agent "${agent.id}": ${result.errors.join('; ')}`
      );
    }
  }
}

export interface TraverseInternalConnectionParams {
  readonly agentId: string;
  readonly connectionId: string;
  readonly spatialPosition?: { readonly x: number; readonly z: number };
  readonly maxThresholdDistance?: number;
}

export type TraverseInternalConnectionResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-indoor'
  | 'connection-not-found'
  | 'wrong-source-interior'
  | 'destination-not-found'
  | 'building-mismatch'
  | 'place-mismatch'
  | 'invalid-spatial-position'
  | 'venue-closed'
  | 'unauthorized-traversal'
  | 'transition-failed';

export interface TraverseInternalConnectionResult {
  readonly success: boolean;
  readonly code: TraverseInternalConnectionResultCode;
  readonly message: string;
  readonly agentId: string;
  readonly connectionId: string;
  readonly previousInteriorSpaceId?: string | null;
  readonly newInteriorSpaceId?: string;
  readonly locationId?: string;
}

/**
 * Authoritative internal connection traversal authority (Milestone 86).
 *
 * Implements Invariants F through I:
 * - Invariant F: Internal Topological Adjacency
 * - Invariant G: Logical Context Preservation (same venue)
 * - Invariant H: Same-Building Spatial Constraint
 * - Invariant I: Zero Backdoor Traversal
 *
 * Atomically transitions agent.interiorSpaceId from source to target interior,
 * preserving agent.locationId strictly unchanged.
 */
export function traverseInternalConnection(
  state: WorldState,
  params: TraverseInternalConnectionParams,
  topology: GomezMorinSpatialTopology = createGomezMorinSpatialTopology()
): TraverseInternalConnectionResult {
  const { agentId, connectionId, spatialPosition, maxThresholdDistance = 2.5 } = params;

  // 1. Agent exists
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    return {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      connectionId,
    };
  }

  // 2. Agent is indoors
  if (agent.interiorSpaceId === null || agent.interiorSpaceId === undefined) {
    return {
      success: false,
      code: 'agent-not-indoor',
      message: `Agent "${agentId}" is outdoors (interiorSpaceId is null); cannot traverse internal connection "${connectionId}"`,
      agentId,
      connectionId,
    };
  }

  // 3. Connection exists in topology
  const connection = findInternalConnectionById(topology, connectionId);
  if (!connection) {
    return {
      success: false,
      code: 'connection-not-found',
      message: `Internal connection "${connectionId}" not found in topology`,
      agentId,
      connectionId,
      previousInteriorSpaceId: agent.interiorSpaceId,
      locationId: agent.locationId,
    };
  }

  // 4. Agent is currently in sourceInteriorId
  if (agent.interiorSpaceId !== connection.sourceInteriorId) {
    return {
      success: false,
      code: 'wrong-source-interior',
      message: `Agent "${agentId}" is in interior "${agent.interiorSpaceId}", not in connection source "${connection.sourceInteriorId}"`,
      agentId,
      connectionId,
      previousInteriorSpaceId: agent.interiorSpaceId,
      locationId: agent.locationId,
    };
  }

  // 5. Source and target interiors exist
  const sourceInterior = topology.interiors.find((i) => i.interiorId === connection.sourceInteriorId);
  const targetInterior = topology.interiors.find((i) => i.interiorId === connection.targetInteriorId);
  if (!targetInterior) {
    return {
      success: false,
      code: 'destination-not-found',
      message: `Destination interior space "${connection.targetInteriorId}" not found in topology`,
      agentId,
      connectionId,
      previousInteriorSpaceId: agent.interiorSpaceId,
      locationId: agent.locationId,
    };
  }
  if (!sourceInterior) {
    return {
      success: false,
      code: 'transition-failed',
      message: `Source interior space "${connection.sourceInteriorId}" not found in topology`,
      agentId,
      connectionId,
      previousInteriorSpaceId: agent.interiorSpaceId,
      locationId: agent.locationId,
    };
  }

  // 6. Invariant H: Building integrity
  if (
    sourceInterior.buildingId !== targetInterior.buildingId ||
    connection.buildingId !== sourceInterior.buildingId
  ) {
    return {
      success: false,
      code: 'building-mismatch',
      message: `Building mismatch: connection connects "${sourceInterior.buildingId}" and "${targetInterior.buildingId}"`,
      agentId,
      connectionId,
      previousInteriorSpaceId: agent.interiorSpaceId,
      locationId: agent.locationId,
    };
  }

  // 7. Invariant G: Logical venue context integrity
  if (
    sourceInterior.associatedPlaceId !== targetInterior.associatedPlaceId ||
    agent.locationId !== sourceInterior.associatedPlaceId
  ) {
    return {
      success: false,
      code: 'place-mismatch',
      message: `Place mismatch: agent location "${agent.locationId}" does not match connection place "${sourceInterior.associatedPlaceId}"`,
      agentId,
      connectionId,
      previousInteriorSpaceId: agent.interiorSpaceId,
      locationId: agent.locationId,
    };
  }

  // 8. Spatial threshold validation (if provided)
  if (spatialPosition && connection.sourceThreshold) {
    const threshold = connection.sourceThreshold;
    const allowedRadius = connection.interactionRadius ?? maxThresholdDistance;
    const dist = Math.hypot(spatialPosition.x - threshold.x, spatialPosition.z - threshold.z);
    if (dist > allowedRadius) {
      return {
        success: false,
        code: 'invalid-spatial-position',
        message: `Spatial position (${spatialPosition.x}, ${spatialPosition.z}) is ${dist.toFixed(1)}m away from connection source threshold (max allowed: ${allowedRadius}m). Cannot traverse through wall.`,
        agentId,
        connectionId,
        previousInteriorSpaceId: agent.interiorSpaceId,
        locationId: agent.locationId,
      };
    }
  }

  // 9. Operational rules (if target/source place is a restaurant)
  const restaurant = state.restaurants.find((r) => r.id === sourceInterior.associatedPlaceId);
  const isStaff =
    (agent.agentType === 'npc' &&
      ((findNpcSchedule(agent.id)?.workplaceId === sourceInterior.associatedPlaceId) ||
        (Array.isArray(state.siteAgentAssociations) &&
          state.siteAgentAssociations.some(
            (s: any) =>
              s.agentId === agent.id &&
              s.placeId === sourceInterior.associatedPlaceId &&
              (s.role === 'attendant' || s.role === 'staff')
          )))) ||
    false;

  if (restaurant && restaurant.operationalState === 'closed' && !isStaff) {
    return {
      success: false,
      code: 'venue-closed',
      message: `Venue "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}")`,
      agentId,
      connectionId,
      previousInteriorSpaceId: agent.interiorSpaceId,
      locationId: agent.locationId,
    };
  }

  // 10. Traversal Authorization (accessPolicy)
  if (connection.accessPolicy === 'staff-only') {
    if (!isStaff) {
      return {
        success: false,
        code: 'unauthorized-traversal',
        message: `Agent "${agentId}" is not authorized for staff-only connection "${connectionId}" at "${sourceInterior.associatedPlaceId}"`,
        agentId,
        connectionId,
        previousInteriorSpaceId: agent.interiorSpaceId,
        locationId: agent.locationId,
      };
    }
  } else if (connection.accessPolicy === 'resident-only') {
    const property = state.properties?.find((p: any) => p.buildingId === sourceInterior.buildingId);
    const isResident =
      property?.assignment?.status === 'assigned' &&
      property.assignment.holder?.holderId === agent.id;
    if (!isResident) {
      return {
        success: false,
        code: 'unauthorized-traversal',
        message: `Agent "${agentId}" is not a resident of "${sourceInterior.buildingId}"`,
        agentId,
        connectionId,
        previousInteriorSpaceId: agent.interiorSpaceId,
        locationId: agent.locationId,
      };
    }
  } else if (connection.accessPolicy === 'management-only') {
    return {
      success: false,
      code: 'unauthorized-traversal',
      message: `Agent "${agentId}" does not have management authorization for "${connectionId}"`,
      agentId,
      connectionId,
      previousInteriorSpaceId: agent.interiorSpaceId,
      locationId: agent.locationId,
    };
  }

  // 11. Authoritative State Transition:
  // Invariant I: Canonical atomic transition.
  // Updates interiorSpaceId to target, preserving locationId untouched.
  const previousInteriorSpaceId = agent.interiorSpaceId;
  agent.interiorSpaceId = connection.targetInteriorId;

  return {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully traversed internal connection "${connectionId}" from "${previousInteriorSpaceId}" to "${connection.targetInteriorId}"`,
    agentId,
    connectionId,
    previousInteriorSpaceId,
    newInteriorSpaceId: connection.targetInteriorId,
    locationId: agent.locationId,
  };
}
