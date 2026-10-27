/**
 * Milestone 72 — Minimal 3D Client Prototype
 *
 * Engine-independent 3D client consuming the M71 World Projection contract.
 *
 * Architectural Invariants:
 * 1. World Core Authority:
 *    - Minimal3DClient has ZERO authority over WorldState.
 *    - All world changes must occur via authoritative command boundaries.
 * 2. Separation of 3D Transform vs. Logical Location:
 *    - Player 3D coordinates (x, y, z) in Scene3D are strictly presentation-only.
 *    - Changing 3D coordinates CANNOT and DOES NOT alter Agent.locationId in World Core.
 * 3. Pure Projection Consumer:
 *    - Consumes WorldProjectionSnapshot via PhysicalClientAdapter.
 *    - Reconciles 3D Scene nodes based on entitiesToSpawn, entitiesToDespawn, entitiesToUpdate.
 * 4. ClientIntent Envelope Only:
 *    - Emits ClientIntent envelopes targeting existing commands.
 *    - Does NOT execute or route commands directly.
 */

import {
  PhysicalClientAdapter,
  type WorldProjectionSnapshot,
  type ProjectedEntity,
  type ClientIntent,
  type ProjectionReconciliation,
} from '../../src/core/world-projection.js';
import type { WorldState } from '../../src/core/world-state.js';
import {
  createGomezMorinSpatialTopology,
  type GomezMorinSpatialTopology,
  type BuildingEntrance,
  type ContextualEntranceAction,
  resolveContextualEntranceAction,
  findPedestrianRoute,
  findInteriorSpaceByPlace,
} from '../../src/core/real-world-street-topology.js';
import { Scene3D, Node3D, type Vector3, type ColorRGB } from './scene-3d.js';

export interface ContextualEntranceResolution {
  readonly entrance: BuildingEntrance;
  readonly distance: number;
  readonly targetLocationId: string;
  readonly targetName: string;
  readonly actionLabel: string;
  readonly commandName: 'enterBuilding' | 'enterRestaurant' | 'interactAtResidence' | 'unavailable';
  readonly entrancePosition: Vector3;
}

export interface Minimal3DClientOptions {
  clientId: string;
  observerAgentId: string;
}

/**
 * Minimal 3D client binding PhysicalClientAdapter to an engine-independent 3D Scene.
 */
export class Minimal3DClient {
  readonly clientId: string;
  readonly observerAgentId: string;
  readonly adapter: PhysicalClientAdapter;
  readonly scene: Scene3D;

  constructor(options: Minimal3DClientOptions) {
    this.clientId = options.clientId;
    this.observerAgentId = options.observerAgentId;
    this.adapter = new PhysicalClientAdapter(options.clientId, options.observerAgentId);
    this.scene = new Scene3D();
  }

  /**
   * Returns the underlying 3D scene graph.
   */
  public getScene(): Scene3D {
    return this.scene;
  }

  /**
   * Returns the latest projection snapshot held by the adapter.
   */
  public getLatestSnapshot(): WorldProjectionSnapshot | undefined {
    return this.adapter.getLatestSnapshot();
  }

  /**
   * Updates the client with a new WorldProjectionSnapshot and reconciles the 3D scene graph.
   */
  public updateSnapshot(snapshot: WorldProjectionSnapshot): ProjectionReconciliation {
    const reconciliation = this.adapter.updateSnapshot(snapshot);
    this.reconcileScene(reconciliation, snapshot);
    return reconciliation;
  }

  /**
   * Reconciles 3D scene nodes based on the M71 projection reconciliation report.
   */
  private reconcileScene(
    recon: ProjectionReconciliation,
    snapshot: WorldProjectionSnapshot
  ): void {
    // 1. Handle Despawns: Remove visual representations for entities no longer in scope
    for (const entityId of recon.entitiesToDespawn) {
      const existingNode = this.scene.getNodeByEntityId(entityId);
      if (existingNode) {
        this.scene.removeNode(existingNode.id);
      }
    }

    // 2. Handle Spawns: Create 3D nodes for newly visible entities
    for (const entity of recon.entitiesToSpawn) {
      this.spawnEntityNode(entity, snapshot);
    }

    // 3. Handle Updates: Adjust visual properties of existing nodes
    for (const entity of recon.entitiesToUpdate) {
      this.updateEntityNode(entity);
    }
  }

  /**
   * Instantiates a 3D visual node for a projected world entity.
   */
  private spawnEntityNode(
    entity: ProjectedEntity,
    snapshot: WorldProjectionSnapshot
  ): void {
    // Prevent duplicate spawning if node already exists
    if (this.scene.getNodeByEntityId(entity.entityId)) {
      return;
    }

    const nodeId = `node:${entity.entityId}`;

    if (entity.entityType === 'street') {
      // 3D Ground Plane for Street
      const streetNode = new Node3D({
        id: nodeId,
        name: entity.name,
        entityId: entity.entityId,
        primitive: 'plane',
        dimensions: { x: 80, y: 0.1, z: 16 },
        color: [0.22, 0.24, 0.28], // Dark asphalt
        position: { x: 0, y: 0, z: 0 },
      });
      this.scene.addNode(streetNode);
    } else if (entity.entityId === 'building:development-residence') {
      // 3D Building Box for Residence
      const residenceNode = new Node3D({
        id: nodeId,
        name: entity.name,
        entityId: entity.entityId,
        primitive: 'box',
        dimensions: { x: 12, y: 8, z: 10 },
        color: [0.72, 0.48, 0.34], // Warm residential brick
        position: { x: 16, y: 4, z: 0 },
      });

      // Semantic entrance doorway threshold
      const doorNode = new Node3D({
        id: `node:anchor:residence-door`,
        name: 'Residence Entrance Doorway',
        primitive: 'box',
        dimensions: { x: 1.5, y: 3, z: 2 },
        color: [0.35, 0.2, 0.1], // Dark wood
        position: { x: 10, y: 1.5, z: 0 },
      });

      this.scene.addNode(residenceNode);
      this.scene.addNode(doorNode);
    } else if (entity.entityId === 'building:development-building') {
      // 3D Building Box for Commercial Building
      const commercialNode = new Node3D({
        id: nodeId,
        name: entity.name,
        entityId: entity.entityId,
        primitive: 'box',
        dimensions: { x: 16, y: 12, z: 12 },
        color: [0.4, 0.52, 0.62], // Cool glass & steel
        position: { x: -16, y: 6, z: 0 },
      });

      // Semantic entrance doorway threshold
      const doorNode = new Node3D({
        id: `node:anchor:commercial-door`,
        name: 'Commercial Building Entrance Doorway',
        primitive: 'box',
        dimensions: { x: 2, y: 3.5, z: 3 },
        color: [0.25, 0.35, 0.45],
        position: { x: -8, y: 1.75, z: 0 },
      });

      this.scene.addNode(commercialNode);
      this.scene.addNode(doorNode);
    } else if (entity.entityType === 'restaurant') {
      // 3D Venue Volume for Restaurant (Interior)
      const isOpen = entity.operationalState === 'open';
      const restaurantColor: ColorRGB = isOpen ? [0.2, 0.65, 0.35] : [0.75, 0.25, 0.25];

      const restaurantNode = new Node3D({
        id: nodeId,
        name: entity.name,
        entityId: entity.entityId,
        primitive: 'box',
        dimensions: { x: 12, y: 5, z: 10 },
        color: restaurantColor,
        position: { x: -16, y: 2.5, z: 0 },
      });
      this.scene.addNode(restaurantNode);
    } else if (entity.entityType === 'agent') {
      // 3D Cylinder for Agent
      const isObserver = entity.entityId === this.observerAgentId;
      const agentColor: ColorRGB = isObserver
        ? [0.2, 0.55, 0.95] // Player Blue
        : [0.95, 0.65, 0.2]; // NPC Orange/Gold

      // Calculate initial visual position based on observer's current location context
      let initialPos: Vector3 = { x: 0, y: 1, z: 0 };
      if (isObserver) {
        if (snapshot.observerLocationId === 'building:development-building') {
          initialPos = { x: -14, y: 1, z: 0 };
        } else if (snapshot.observerLocationId === 'building:development-residence') {
          initialPos = { x: 14, y: 1, z: 0 };
        } else {
          initialPos = { x: 0, y: 1, z: 0 };
        }
      } else {
        // Position non-observer based on their logical location
        if (entity.logicalLocationId === 'building:development-residence') {
          initialPos = { x: 10, y: 1.5, z: 0 }; // Residence entrance threshold
        } else if (entity.logicalLocationId === 'building:development-building') {
          initialPos = { x: -8, y: 1.75, z: 0 }; // Commercial building doorway
        } else if (entity.logicalLocationId === 'restaurant:development-restaurant') {
          initialPos = { x: -16, y: 2.5, z: 0 }; // Restaurant interior
        } else {
          // NPC starts slightly offset on street
          initialPos = { x: 4, y: 1, z: 0 };
        }
      }

      const agentNode = new Node3D({
        id: nodeId,
        name: entity.name,
        entityId: entity.entityId,
        primitive: 'cylinder',
        dimensions: { x: 0.8, y: 2.0, z: 0.8 },
        color: agentColor,
        position: initialPos,
      });
      this.scene.addNode(agentNode);
    }
  }

  /**
   * Updates visual presentation properties when projected entity state changes.
   */
  private updateEntityNode(entity: ProjectedEntity): void {
    const node = this.scene.getNodeByEntityId(entity.entityId);
    if (!node) return;

    if (entity.entityType === 'restaurant') {
      // Update color based on operational state
      const isOpen = entity.operationalState === 'open';
      node.color = isOpen ? [0.2, 0.65, 0.35] : [0.75, 0.25, 0.25];
    }
  }

  /**
   * Moves the 3D player representation locally in the 3D scene graph.
   *
   * CRITICAL INVARIANT:
   * This modifies ONLY the local 3D transform position in Scene3D.
   * It has ZERO effect on Agent.locationId in World Core!
   */
  public movePlayerVisual(delta: Vector3): Vector3 {
    const playerNode = this.scene.getNodeByEntityId(this.observerAgentId);
    if (!playerNode) {
      throw new Error(`Player visual node for "${this.observerAgentId}" not found in Scene3D`);
    }

    playerNode.transform.position.x += delta.x;
    playerNode.transform.position.y += delta.y;
    playerNode.transform.position.z += delta.z;

    return { ...playerNode.transform.position };
  }

  /**
   * Returns the current local 3D transform position of the player in Scene3D.
   */
  public getPlayerVisualPosition(): Vector3 | undefined {
    const playerNode = this.scene.getNodeByEntityId(this.observerAgentId);
    return playerNode ? { ...playerNode.transform.position } : undefined;
  }

  /**
   * Sets the local visual presentation position of the observer player in Scene3D.
   * Strictly local visual presentation with ZERO authority over WorldState.
   */
  public setPlayerVisualPosition(pos: Vector3): boolean {
    const playerNode = this.scene.getNodeByEntityId(this.observerAgentId);
    if (!playerNode) return false;
    playerNode.transform.position = { ...pos };
    return true;
  }

  /**
   * Creates a ClientIntent envelope targeting an existing authoritative command.
   * Does NOT execute or authorize the command.
   */
  public createIntent(
    commandName: string,
    payload: Record<string, unknown> = {},
    customIntentId?: string
  ): ClientIntent {
    return this.adapter.createIntent(commandName, payload, customIntentId);
  }

  /**
   * Returns the current local 3D transform position of any agent in Scene3D.
   */
  public getAgentVisualPosition(agentId: string): Vector3 | undefined {
    const node =
      this.scene.getNodeByEntityId(agentId) ??
      this.scene.getNode(agentId) ??
      (agentId === 'agent:dev-player' ? this.scene.getNode('node:player') : undefined) ??
      (agentId === 'agent:dev-npc' ? this.scene.getNode('node:npc') : undefined);
    return node ? { ...node.transform.position } : undefined;
  }

  /**
   * Assembles the continuous shared 3D world slice (Milestone 77).
   *
   * Simultaneously instantiates all slice structures and entities in one unified Scene3D:
   * 1. Street (Ground plane at x: 0, y: 0, z: 0)
   * 2. Residence Building (Warm brick box at x: 16, y: 4, z: 0)
   * 3. Residence Entrance Doorway (threshold anchor at x: 10, y: 1.5, z: 0)
   * 4. Commercial Building (Steel box at x: -16, y: 6, z: 0)
   * 5. Commercial Building Entrance Doorway (threshold anchor at x: -8, y: 1.75, z: 0)
   * 6. Restaurant (Interior venue volume within commercial building at x: -16, y: 2.5, z: 0)
   * 7. Player (Blue cylinder at x: 0, y: 1, z: 0)
   * 8. Elena / Development NPC (Gold cylinder at residence threshold x: 10, y: 1.5, z: 0)
   *
   * Invariants:
   * - Zero World Core state mutation.
   * - Elena visually begins at the residence threshold anchor.
   * - Both Player and Elena coexist simultaneously in the same scene without scene switches.
   */
  /**
   * Returns distance between player visual position and a target 3D coordinate.
   */
  public getDistanceToPlayer(targetPos: Vector3): number | undefined {
    const playerPos = this.getPlayerVisualPosition();
    if (!playerPos) return undefined;
    return Math.hypot(targetPos.x - playerPos.x, targetPos.y - playerPos.y, targetPos.z - playerPos.z);
  }

  /**
   * Checks if player is within maxDistance of a place's semantic entrance anchor.
   * Supports both legacy M79 test places and M80/M81 real-world places.
   */
  public isPlayerNearPlace(placeId: string, maxDistance: number = 3.5): boolean {
    const playerPos = this.getPlayerVisualPosition();
    if (!playerPos) return false;

    const PLACE_ANCHOR_MAP: Record<string, string> = {
      // Legacy M79 dev places
      'building:development-residence': 'node:anchor:residence-door',
      'building:development-building': 'node:anchor:commercial-door',
      'restaurant:development-restaurant': 'node:restaurant:development-restaurant',
      // M80/M81 Gómez Morín real-world places
      'building:tia-lupe-building': 'node:anchor:entrance:tia-lupe',
      'restaurant:pasteleria-tia-lupe': 'node:anchor:entrance:tia-lupe',
      'building:wing-spot-building': 'node:anchor:entrance:wing-spot',
      'restaurant:wing-spot': 'node:anchor:entrance:wing-spot',
      'building:del-porvenir-residence': 'node:anchor:entrance:del-porvenir-residence',
      'building:dollar-2-go-building': 'node:anchor:entrance:dollar-2-go',
      'building:acabados-hbc-building': 'node:anchor:entrance:acabados-hbc',
      'building:catzoo-building': 'node:anchor:entrance:catzoo',
      'building:corporativo-arboleda-building': 'node:anchor:entrance:corporativo-arboleda',
    };

    const anchorNodeId = PLACE_ANCHOR_MAP[placeId];
    if (anchorNodeId) {
      const node = this.scene.getNode(anchorNodeId);
      if (node) {
        const dist = Math.hypot(
          playerPos.x - node.transform.position.x,
          playerPos.z - node.transform.position.z
        );
        return dist <= maxDistance;
      }
    }

    // Fallback: check via contextual entrance resolution
    const resolved = this.resolveNearbyEntrance(playerPos, maxDistance);
    if (resolved) {
      return (
        resolved.targetLocationId === placeId ||
        resolved.entrance.buildingId === placeId
      );
    }

    return false;
  }

  /**
   * Resolves the closest BuildingEntrance within maxDistance of a given 3D position (Milestone 81).
   *
   * Architectural Invariants:
   * 1. Player/Elena position -> Nearby entrance candidates -> Proximity validation -> Specific BuildingEntrance -> Associated domain action.
   * 2. Zero business-specific hardcoding: Evaluates all authoritative entrances dynamically.
   * 3. Proximity to Pastelerías La Tía Lupe resolves to Tía Lupe, NEVER Wing Spot.
   * 4. Proximity to Wing Spot resolves to Wing Spot.
   * 5. Distant positions return undefined.
   */
  public resolveNearbyEntrance(
    position?: Vector3,
    maxDistance: number = 3.5,
    state?: WorldState
  ): ContextualEntranceResolution | undefined {
    const pos = position ?? this.getPlayerVisualPosition();
    if (!pos) return undefined;

    const topology = createGomezMorinSpatialTopology();
    const navCoords = getGomezMorinNavCoordinates();

    let closestEntrance: BuildingEntrance | undefined;
    let closestDistance = Infinity;
    let closestPos: Vector3 | undefined;

    for (const entrance of topology.entrances) {
      // Look up spatial coordinate for this entrance:
      // Try scene anchor node first, then fallback to nav node coordinates
      let entrancePos: Vector3 | undefined;
      const cleanEntranceKey = entrance.entranceId.replace('entrance:', '').replace('-main', '');
      const anchorNode =
        this.scene.getNode(`node:anchor:entrance:${cleanEntranceKey}`) ??
        this.scene.getNode(`node:anchor:${cleanEntranceKey}`) ??
        this.scene.getNodeByEntityId(entrance.entranceId);

      if (anchorNode) {
        entrancePos = anchorNode.transform.position;
      } else {
        const navPos = navCoords.get(entrance.associatedNavNodeId);
        if (navPos) {
          entrancePos = navPos;
        }
      }

      if (!entrancePos) continue;

      const dist = Math.hypot(pos.x - entrancePos.x, pos.z - entrancePos.z);
      if (dist <= maxDistance && dist < closestDistance) {
        closestDistance = dist;
        closestEntrance = entrance;
        closestPos = entrancePos;
      }
    }

    if (!closestEntrance || !closestPos) {
      return undefined;
    }

    const player = (state as any)?.agents?.find((a: any) => a.id === this.activePlayerId);
    const action = resolveContextualEntranceAction(
      closestEntrance,
      state,
      player?.locationId,
      topology,
      player?.interiorSpaceId
    );
    return {
      entrance: closestEntrance,
      distance: closestDistance,
      targetLocationId: action.targetLocationId,
      targetName: action.targetName,
      actionLabel: action.actionLabel,
      commandName: action.commandName,
      entrancePosition: closestPos,
    };
  }

  /**
   * Assembles the 3D world blockout & playable environment (Milestone 77 & 79).
   *
   * Constructs a human-scale, recognizable 3D urban neighborhood block containing:
   * 1. Core Topological Places (Preserving all M77 contracts & entity IDs):
   *    - Street: Ground plane at (0, 0, 0)
   *    - Residence: Main brick volume at (16, 4, 0) & Entrance doorway at (10, 1.5, 0)
   *    - Commercial Building: Slate/steel volume at (-16, 6, 0) & Entrance doorway at (-8, 1.75, 0)
   *    - Restaurant: Interior volume at (-16, 2.5, 0)
   *    - Player & Elena: Human-scale agents co-present in the scene
   * 2. Street Infrastructure & Markings:
   *    - North & South raised sidewalks with stone curbs
   *    - Yellow road dividing center dashes and white crosswalk stripes
   * 3. Residence Blockout:
   *    - Shingled eaves roof, entrance stoop/porch, front lawn yard, pathway, and fence
   *    - Reflective window frames
   * 4. Commercial Building Blockout:
   *    - Modern entrance canopy, ground-floor display storefront, multi-floor office windows, roof parapet
   * 5. Restaurant Blockout:
   *    - Prominent terracotta cafe awning, restaurant identity signboard, dining windows, patio with tables & chairs
   * 6. Neighborhood Props:
   *    - Street lamps with glowing fixtures, shade trees (trunks + foliage), planters, benches, parked sedan vehicle,
   *      utility pole with crossarms, trash & recycling bins, and fire hydrant.
   */
  public buildSharedWorldSlice(state?: WorldState): Scene3D {
    this.scene.clear();

    // =========================================================================
    // 1. Core Topological Places (Preserving all M77 contracts & entity IDs)
    // =========================================================================

    // 1.1 Street (Ground plane)
    const streetNode = new Node3D({
      id: 'node:street:development-street',
      name: 'Development Street',
      entityId: 'street:development-street',
      primitive: 'plane',
      dimensions: { x: 80, y: 0.1, z: 16 },
      color: [0.22, 0.24, 0.28], // Dark asphalt
      position: { x: 0, y: 0, z: 0 },
    });
    this.scene.addNode(streetNode);

    // 1.2 Residence Building
    const residenceNode = new Node3D({
      id: 'node:building:development-residence',
      name: 'Development Residence',
      entityId: 'building:development-residence',
      primitive: 'box',
      dimensions: { x: 12, y: 8, z: 10 },
      color: [0.72, 0.48, 0.34], // Warm residential brick
      position: { x: 16, y: 4, z: 0 },
    });
    this.scene.addNode(residenceNode);

    // 1.3 Residence Doorway (Entrance Threshold Anchor)
    const resDoorNode = new Node3D({
      id: 'node:anchor:residence-door',
      name: 'Residence Entrance Doorway',
      entityId: 'anchor:residence-door',
      primitive: 'box',
      dimensions: { x: 1.5, y: 3, z: 2 },
      color: [0.35, 0.2, 0.1], // Dark wood
      position: { x: 10, y: 1.5, z: 0 },
    });
    this.scene.addNode(resDoorNode);

    // 1.4 Commercial Building
    const commercialNode = new Node3D({
      id: 'node:building:development-building',
      name: 'Commercial Building',
      entityId: 'building:development-building',
      primitive: 'box',
      dimensions: { x: 16, y: 12, z: 12 },
      color: [0.4, 0.52, 0.62], // Cool glass & steel
      position: { x: -16, y: 6, z: 0 },
    });
    this.scene.addNode(commercialNode);

    // 1.5 Commercial Doorway (Entrance Threshold Anchor)
    const comDoorNode = new Node3D({
      id: 'node:anchor:commercial-door',
      name: 'Commercial Building Entrance Doorway',
      entityId: 'anchor:commercial-door',
      primitive: 'box',
      dimensions: { x: 2, y: 3.5, z: 3 },
      color: [0.25, 0.35, 0.45], // Steel
      position: { x: -8, y: 1.75, z: 0 },
    });
    this.scene.addNode(comDoorNode);

    // 1.6 Restaurant (Interior Volume within Commercial Building)
    const restaurant = state?.restaurants?.find((r) => r.id === 'restaurant:development-restaurant');
    const isRestaurantOpen = restaurant ? restaurant.operationalState === 'open' : true;
    const restaurantColor: ColorRGB = isRestaurantOpen ? [0.2, 0.65, 0.35] : [0.75, 0.25, 0.25];

    const restaurantNode = new Node3D({
      id: 'node:restaurant:development-restaurant',
      name: restaurant?.name ?? 'Development Restaurant',
      entityId: 'restaurant:development-restaurant',
      primitive: 'box',
      dimensions: { x: 12, y: 5, z: 10 },
      color: restaurantColor,
      position: { x: -16, y: 2.5, z: 0 },
    });
    this.scene.addNode(restaurantNode);

    // 1.7 Player (Blue Cylinder)
    const playerNode = new Node3D({
      id: 'node:player',
      name: 'Player',
      entityId: 'agent:dev-player',
      primitive: 'cylinder',
      dimensions: { x: 0.8, y: 2.0, z: 0.8 },
      color: [0.2, 0.55, 0.95], // Player Blue
      position: { x: 0, y: 1, z: 0 },
    });
    this.scene.addNode(playerNode);

    // 1.8 Elena / Development NPC (Gold Cylinder)
    // Starting visually at the residence entrance doorway threshold (10, 1.5, 0)
    const elenaNode = new Node3D({
      id: 'node:npc',
      name: 'Elena',
      entityId: 'agent:dev-npc',
      primitive: 'cylinder',
      dimensions: { x: 0.8, y: 2.0, z: 0.8 },
      color: [0.95, 0.65, 0.2], // NPC Gold
      position: { x: 10, y: 1.5, z: 0 },
    });
    this.scene.addNode(elenaNode);

    // =========================================================================
    // 2. Street Infrastructure & Markings (M79 Blockout)
    // =========================================================================

    // North Sidewalk (Raised concrete walkway)
    this.scene.addNode(new Node3D({
      id: 'node:street:sidewalk-north',
      name: 'North Sidewalk',
      primitive: 'box',
      dimensions: { x: 80, y: 0.2, z: 3.2 },
      color: [0.70, 0.72, 0.74],
      position: { x: 0, y: 0.15, z: -5.6 },
    }));

    // North Curb (Stone border separating road from sidewalk)
    this.scene.addNode(new Node3D({
      id: 'node:street:curb-north',
      name: 'North Curb',
      primitive: 'box',
      dimensions: { x: 80, y: 0.25, z: 0.2 },
      color: [0.55, 0.56, 0.58],
      position: { x: 0, y: 0.12, z: -3.9 },
    }));

    // South Sidewalk (Raised concrete walkway)
    this.scene.addNode(new Node3D({
      id: 'node:street:sidewalk-south',
      name: 'South Sidewalk',
      primitive: 'box',
      dimensions: { x: 80, y: 0.2, z: 3.2 },
      color: [0.70, 0.72, 0.74],
      position: { x: 0, y: 0.15, z: 5.6 },
    }));

    // South Curb (Stone border separating road from sidewalk)
    this.scene.addNode(new Node3D({
      id: 'node:street:curb-south',
      name: 'South Curb',
      primitive: 'box',
      dimensions: { x: 80, y: 0.25, z: 0.2 },
      color: [0.55, 0.56, 0.58],
      position: { x: 0, y: 0.12, z: 3.9 },
    }));

    // Roadway Center Yellow Dividing Line (Dashed stripes)
    const dashXPositions = [-22, -14, -6, 2, 10, 18, 26];
    dashXPositions.forEach((dx, i) => {
      this.scene.addNode(new Node3D({
        id: `node:street:dash-${i + 1}`,
        name: `Road Center Dash ${i + 1}`,
        primitive: 'box',
        dimensions: { x: 2.8, y: 0.02, z: 0.25 },
        color: [0.92, 0.82, 0.22],
        position: { x: dx, y: 0.06, z: 0 },
      }));
    });

    // Pedestrian Crosswalk (White crossing stripes)
    const crosswalkZ = [-2.4, -0.8, 0.8, 2.4];
    crosswalkZ.forEach((cz, i) => {
      this.scene.addNode(new Node3D({
        id: `node:street:crosswalk-${i + 1}`,
        name: `Crosswalk Stripe ${i + 1}`,
        primitive: 'box',
        dimensions: { x: 0.9, y: 0.03, z: 1.0 },
        color: [0.95, 0.95, 0.95],
        position: { x: -2.0, y: 0.06, z: cz },
      }));
    });

    // =========================================================================
    // 3. Development Residence Architectural Details (M79 Blockout)
    // =========================================================================

    // Shingled Roof Structure (Pitched eaves sitting over main residence)
    this.scene.addNode(new Node3D({
      id: 'node:residence:roof',
      name: 'Residence Roof',
      primitive: 'box',
      dimensions: { x: 13, y: 1.5, z: 11 },
      color: [0.32, 0.22, 0.18], // Dark terracotta clay shingles
      position: { x: 16, y: 8.7, z: 0 },
    }));

    // Residence Front Porch Stoop (Step up into entrance threshold)
    this.scene.addNode(new Node3D({
      id: 'node:residence:porch',
      name: 'Residence Entrance Porch',
      primitive: 'box',
      dimensions: { x: 2.0, y: 0.35, z: 3.2 },
      color: [0.65, 0.62, 0.58], // Light masonry stone
      position: { x: 9.6, y: 0.2, z: 0 },
    }));

    // Front Yard Lawn (Green grass patch surrounding residence property)
    this.scene.addNode(new Node3D({
      id: 'node:residence:yard',
      name: 'Residence Front Yard',
      primitive: 'box',
      dimensions: { x: 16, y: 0.12, z: 13.5 },
      color: [0.32, 0.58, 0.28], // Lawn grass green
      position: { x: 16, y: 0.08, z: 0 },
    }));

    // Walkway Path (Stone pathway connecting front door to sidewalk)
    this.scene.addNode(new Node3D({
      id: 'node:residence:walkway',
      name: 'Residence Front Walkway',
      primitive: 'box',
      dimensions: { x: 1.6, y: 0.1, z: 3.5 },
      color: [0.62, 0.60, 0.56], // Paved pavers
      position: { x: 9.6, y: 0.16, z: -2.5 },
    }));

    // Property Boundary Fence (White wooden picket boundary)
    this.scene.addNode(new Node3D({
      id: 'node:residence:fence-west',
      name: 'Residence Property Fence West',
      primitive: 'box',
      dimensions: { x: 0.2, y: 0.9, z: 5.5 },
      color: [0.88, 0.88, 0.85],
      position: { x: 8.8, y: 0.6, z: 3.5 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:residence:fence-north',
      name: 'Residence Property Fence North',
      primitive: 'box',
      dimensions: { x: 14, y: 0.9, z: 0.2 },
      color: [0.88, 0.88, 0.85],
      position: { x: 16, y: 0.6, z: -6.6 },
    }));

    // Residence Window Panes (Reflective glass with human scale)
    this.scene.addNode(new Node3D({
      id: 'node:residence:window-front-1',
      name: 'Residence Front Window Left',
      primitive: 'box',
      dimensions: { x: 0.2, y: 1.8, z: 1.4 },
      color: [0.65, 0.82, 0.92], // Sky reflection glass
      position: { x: 9.9, y: 2.2, z: -2.4 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:residence:window-front-2',
      name: 'Residence Front Window Right',
      primitive: 'box',
      dimensions: { x: 0.2, y: 1.8, z: 1.4 },
      color: [0.65, 0.82, 0.92],
      position: { x: 9.9, y: 2.2, z: 2.4 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:residence:window-upper-1',
      name: 'Residence Upper Window Left',
      primitive: 'box',
      dimensions: { x: 0.2, y: 1.6, z: 1.4 },
      color: [0.65, 0.82, 0.92],
      position: { x: 9.9, y: 5.5, z: -2.4 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:residence:window-upper-2',
      name: 'Residence Upper Window Right',
      primitive: 'box',
      dimensions: { x: 0.2, y: 1.6, z: 1.4 },
      color: [0.65, 0.82, 0.92],
      position: { x: 9.9, y: 5.5, z: 2.4 },
    }));

    // =========================================================================
    // 4. Commercial Building Architectural Details (M79 Blockout)
    // =========================================================================

    // Entrance Canopy (Modern dark architectural overhang above doorway)
    this.scene.addNode(new Node3D({
      id: 'node:commercial:canopy',
      name: 'Commercial Building Entrance Canopy',
      primitive: 'box',
      dimensions: { x: 2.8, y: 0.25, z: 4.2 },
      color: [0.18, 0.22, 0.26], // Dark charcoal steel
      position: { x: -7.6, y: 3.7, z: 0 },
    }));

    // Ground Floor Storefront Glass Display Windows
    this.scene.addNode(new Node3D({
      id: 'node:commercial:storefront-windows',
      name: 'Commercial Storefront Glass Display',
      primitive: 'box',
      dimensions: { x: 0.2, y: 2.6, z: 4.6 },
      color: [0.45, 0.65, 0.78], // Cyan architectural glass
      position: { x: -7.9, y: 1.8, z: 3.2 },
    }));

    // Upper Floor Commercial Window Bands
    this.scene.addNode(new Node3D({
      id: 'node:commercial:upper-windows-1',
      name: 'Commercial Second Floor Window Grid',
      primitive: 'box',
      dimensions: { x: 0.2, y: 1.8, z: 9.8 },
      color: [0.42, 0.60, 0.72],
      position: { x: -7.9, y: 6.2, z: 0 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:commercial:upper-windows-2',
      name: 'Commercial Third Floor Window Grid',
      primitive: 'box',
      dimensions: { x: 0.2, y: 1.8, z: 9.8 },
      color: [0.42, 0.60, 0.72],
      position: { x: -7.9, y: 9.6, z: 0 },
    }));

    // Commercial Roof Cornice / Parapet Trim
    this.scene.addNode(new Node3D({
      id: 'node:commercial:parapet',
      name: 'Commercial Building Roof Parapet',
      primitive: 'box',
      dimensions: { x: 16.6, y: 0.45, z: 12.6 },
      color: [0.22, 0.28, 0.35],
      position: { x: -16, y: 12.2, z: 0 },
    }));

    // =========================================================================
    // 5. Development Restaurant Architectural & Storefront Details (M79 Blockout)
    // =========================================================================

    // Fabric Cafe Awning (Projecting over entrance & dining facade)
    this.scene.addNode(new Node3D({
      id: 'node:restaurant:awning',
      name: 'Restaurant Cafe Awning',
      primitive: 'box',
      dimensions: { x: 3.8, y: 0.35, z: 4.6 },
      color: [0.82, 0.38, 0.22], // Terracotta fabric orange
      position: { x: -9.5, y: 3.6, z: -3.0 },
    }));

    // Restaurant Identification Signboard
    this.scene.addNode(new Node3D({
      id: 'node:restaurant:sign',
      name: 'Restaurant Signboard',
      primitive: 'box',
      dimensions: { x: 3.2, y: 0.75, z: 0.25 },
      color: [0.94, 0.88, 0.65], // Warm cream sign plaque
      position: { x: -9.2, y: 4.5, z: -3.0 },
    }));

    // Outdoor Dining Patio Paving (Terracotta tiles on sidewalk)
    this.scene.addNode(new Node3D({
      id: 'node:restaurant:patio',
      name: 'Restaurant Outdoor Dining Patio',
      primitive: 'box',
      dimensions: { x: 5.5, y: 0.15, z: 4.2 },
      color: [0.68, 0.46, 0.38], // Paved bistro tile
      position: { x: -10.5, y: 0.18, z: -4.5 },
    }));

    // Cafe Tables and Chairs (Outdoor bistro seating)
    this.scene.addNode(new Node3D({
      id: 'node:restaurant:table-1',
      name: 'Patio Bistro Table 1',
      primitive: 'cylinder',
      dimensions: { x: 1.1, y: 0.75, z: 1.1 },
      color: [0.25, 0.25, 0.25], // Cast iron
      position: { x: -9.8, y: 0.5, z: -4.6 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:restaurant:chair-1',
      name: 'Patio Chair 1',
      primitive: 'box',
      dimensions: { x: 0.45, y: 0.7, z: 0.45 },
      color: [0.48, 0.32, 0.20],
      position: { x: -9.1, y: 0.45, z: -4.6 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:restaurant:chair-2',
      name: 'Patio Chair 2',
      primitive: 'box',
      dimensions: { x: 0.45, y: 0.7, z: 0.45 },
      color: [0.48, 0.32, 0.20],
      position: { x: -10.5, y: 0.45, z: -4.6 },
    }));

    this.scene.addNode(new Node3D({
      id: 'node:restaurant:table-2',
      name: 'Patio Bistro Table 2',
      primitive: 'cylinder',
      dimensions: { x: 1.1, y: 0.75, z: 1.1 },
      color: [0.25, 0.25, 0.25],
      position: { x: -12.2, y: 0.5, z: -4.6 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:restaurant:chair-3',
      name: 'Patio Chair 3',
      primitive: 'box',
      dimensions: { x: 0.45, y: 0.7, z: 0.45 },
      color: [0.48, 0.32, 0.20],
      position: { x: -12.2, y: 0.45, z: -3.9 },
    }));

    // Restaurant Dining Viewing Windows (Warm amber glow)
    this.scene.addNode(new Node3D({
      id: 'node:restaurant:window',
      name: 'Restaurant Dining Window',
      primitive: 'box',
      dimensions: { x: 0.2, y: 2.2, z: 3.6 },
      color: [0.92, 0.84, 0.55], // Warm interior amber
      position: { x: -9.9, y: 2.0, z: -3.0 },
    }));

    // =========================================================================
    // 6. Neighborhood Details & Environmental Props (M79 Blockout)
    // =========================================================================

    // Street Lamps (Pole + Warm Glowing Lantern)
    const lampConfigs = [
      { id: '1', x: 6.0, z: -3.8 },
      { id: '2', x: -5.0, z: -3.8 },
      { id: '3', x: 18.0, z: -3.8 },
      { id: '4', x: -18.0, z: -3.8 },
    ];
    for (const cfg of lampConfigs) {
      this.scene.addNode(new Node3D({
        id: `node:prop:lamp-${cfg.id}`,
        name: `Street Lamp Pole ${cfg.id}`,
        primitive: 'cylinder',
        dimensions: { x: 0.2, y: 4.2, z: 0.2 },
        color: [0.22, 0.24, 0.26],
        position: { x: cfg.x, y: 2.2, z: cfg.z },
      }));
      this.scene.addNode(new Node3D({
        id: `node:prop:lamp-${cfg.id}-light`,
        name: `Street Lamp Lantern ${cfg.id}`,
        primitive: 'box',
        dimensions: { x: 0.5, y: 0.5, z: 0.5 },
        color: [0.98, 0.92, 0.62], // Glowing warm yellow
        position: { x: cfg.x, y: 4.3, z: cfg.z },
      }));
    }

    // Street Trees (Brown bark trunk + green layered canopy crown)
    const treeConfigs = [
      { id: '1', x: 3.0, z: -5.5 },
      { id: '2', x: -3.0, z: -5.5 },
      { id: '3', x: 23.0, z: -5.5 },
    ];
    for (const cfg of treeConfigs) {
      this.scene.addNode(new Node3D({
        id: `node:prop:tree-${cfg.id}-trunk`,
        name: `Tree Trunk ${cfg.id}`,
        primitive: 'cylinder',
        dimensions: { x: 0.4, y: 2.6, z: 0.4 },
        color: [0.42, 0.28, 0.16], // Bark brown
        position: { x: cfg.x, y: 1.3, z: cfg.z },
      }));
      this.scene.addNode(new Node3D({
        id: `node:prop:tree-${cfg.id}-foliage`,
        name: `Tree Canopy ${cfg.id}`,
        primitive: 'cylinder',
        dimensions: { x: 2.4, y: 2.6, z: 2.4 },
        color: [0.22, 0.54, 0.25], // Rich leafy green
        position: { x: cfg.x, y: 3.6, z: cfg.z },
      }));
    }

    // Sidewalk Planters with Blooming Greenery
    const planterConfigs = [
      { id: '1', x: -1.0, z: -3.6 },
      { id: '2', x: 8.0, z: -3.6 },
    ];
    for (const cfg of planterConfigs) {
      this.scene.addNode(new Node3D({
        id: `node:prop:planter-${cfg.id}`,
        name: `Planter Box ${cfg.id}`,
        primitive: 'box',
        dimensions: { x: 1.8, y: 0.5, z: 0.8 },
        color: [0.58, 0.58, 0.58], // Concrete grey
        position: { x: cfg.x, y: 0.35, z: cfg.z },
      }));
      this.scene.addNode(new Node3D({
        id: `node:prop:planter-${cfg.id}-plants`,
        name: `Planter Greenery ${cfg.id}`,
        primitive: 'box',
        dimensions: { x: 1.6, y: 0.4, z: 0.7 },
        color: [0.32, 0.65, 0.30], // Bush green
        position: { x: cfg.x, y: 0.65, z: cfg.z },
      }));
    }

    // Street Benches (Wood slats with cast-iron backrest)
    const benchConfigs = [
      { id: '1', x: 1.0, z: -5.5 },
      { id: '2', x: -14.0, z: -5.5 },
    ];
    for (const cfg of benchConfigs) {
      this.scene.addNode(new Node3D({
        id: `node:prop:bench-${cfg.id}-seat`,
        name: `Street Bench Seat ${cfg.id}`,
        primitive: 'box',
        dimensions: { x: 1.8, y: 0.3, z: 0.6 },
        color: [0.55, 0.35, 0.20], // Teak wood
        position: { x: cfg.x, y: 0.45, z: cfg.z },
      }));
      this.scene.addNode(new Node3D({
        id: `node:prop:bench-${cfg.id}-back`,
        name: `Street Bench Backrest ${cfg.id}`,
        primitive: 'box',
        dimensions: { x: 1.8, y: 0.45, z: 0.1 },
        color: [0.22, 0.24, 0.26], // Iron frame
        position: { x: cfg.x, y: 0.75, z: cfg.z - 0.25 },
      }));
    }

    // Parked Vehicle (Sedan parked at roadway curb)
    this.scene.addNode(new Node3D({
      id: 'node:prop:car-body',
      name: 'Parked Vehicle Chassis',
      primitive: 'box',
      dimensions: { x: 4.4, y: 0.65, z: 1.9 },
      color: [0.65, 0.18, 0.20], // Crimson red lacquer
      position: { x: -1.5, y: 0.65, z: 2.6 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:prop:car-cabin',
      name: 'Parked Vehicle Cabin',
      primitive: 'box',
      dimensions: { x: 2.4, y: 0.6, z: 1.7 },
      color: [0.18, 0.22, 0.28], // Dark tinted windshield/roof
      position: { x: -1.7, y: 1.25, z: 2.6 },
    }));
    // Car Wheels
    const wheelPositions = [
      { id: 'fl', x: -3.0, z: 3.55 },
      { id: 'fr', x: -3.0, z: 1.65 },
      { id: 'rl', x: 0.0, z: 3.55 },
      { id: 'rr', x: 0.0, z: 1.65 },
    ];
    for (const wp of wheelPositions) {
      this.scene.addNode(new Node3D({
        id: `node:prop:car-wheel-${wp.id}`,
        name: `Car Wheel ${wp.id.toUpperCase()}`,
        primitive: 'cylinder',
        dimensions: { x: 0.65, y: 0.65, z: 0.25 },
        color: [0.12, 0.12, 0.12], // Black tire rubber
        position: { x: wp.x, y: 0.35, z: wp.z },
      }));
    }
    // Car Headlights & Taillights
    this.scene.addNode(new Node3D({
      id: 'node:prop:car-headlight-1',
      name: 'Car Headlight Left',
      primitive: 'box',
      dimensions: { x: 0.1, y: 0.15, z: 0.3 },
      color: [0.95, 0.95, 0.70],
      position: { x: -3.7, y: 0.7, z: 2.1 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:prop:car-headlight-2',
      name: 'Car Headlight Right',
      primitive: 'box',
      dimensions: { x: 0.1, y: 0.15, z: 0.3 },
      color: [0.95, 0.95, 0.70],
      position: { x: -3.7, y: 0.7, z: 3.1 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:prop:car-taillight-1',
      name: 'Car Taillight Left',
      primitive: 'box',
      dimensions: { x: 0.1, y: 0.15, z: 0.3 },
      color: [0.85, 0.12, 0.12],
      position: { x: 0.7, y: 0.7, z: 2.1 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:prop:car-taillight-2',
      name: 'Car Taillight Right',
      primitive: 'box',
      dimensions: { x: 0.1, y: 0.15, z: 0.3 },
      color: [0.85, 0.12, 0.12],
      position: { x: 0.7, y: 0.7, z: 3.1 },
    }));

    // Wooden Utility Pole with Crossarm
    this.scene.addNode(new Node3D({
      id: 'node:prop:utility-pole',
      name: 'Utility Pole',
      primitive: 'cylinder',
      dimensions: { x: 0.28, y: 8.0, z: 0.28 },
      color: [0.38, 0.28, 0.18], // Weathered cedar wood
      position: { x: -6.0, y: 4.0, z: 5.5 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:prop:utility-crossarm',
      name: 'Utility Pole Crossarm',
      primitive: 'box',
      dimensions: { x: 0.2, y: 0.2, z: 2.4 },
      color: [0.32, 0.24, 0.15],
      position: { x: -6.0, y: 7.5, z: 5.5 },
    }));

    // Curbside Trash & Recycling Bins
    this.scene.addNode(new Node3D({
      id: 'node:prop:bin-trash',
      name: 'Curbside Trash Bin',
      primitive: 'box',
      dimensions: { x: 0.6, y: 1.0, z: 0.6 },
      color: [0.20, 0.22, 0.24], // Dark grey plastic
      position: { x: 7.0, y: 0.55, z: -3.8 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:prop:bin-recycle',
      name: 'Curbside Recycling Bin',
      primitive: 'box',
      dimensions: { x: 0.6, y: 1.0, z: 0.6 },
      color: [0.18, 0.42, 0.75], // Municipal recycling blue
      position: { x: 7.8, y: 0.55, z: -3.8 },
    }));

    // Fire Hydrant
    this.scene.addNode(new Node3D({
      id: 'node:prop:hydrant',
      name: 'Fire Hydrant',
      primitive: 'cylinder',
      dimensions: { x: 0.35, y: 0.75, z: 0.35 },
      color: [0.85, 0.15, 0.12], // Safety signal red
      position: { x: -4.5, y: 0.45, z: -3.8 },
    }));

    return this.scene;
  }

  /**
   * Constructs the continuous 3D world slice for the Blvd. Manuel Gómez Morín real-world corridor (Milestone 80).
   *
   * Assembles:
   * 1. Bidirectional arterial: Blvd. Manuel Gómez Morín
   * 2. Bidirectional secondary connectors: Calle Del Porvenir, Av. La Arboleda
   * 3. Sidewalks, curbs, and designated pedestrian crossings
   * 4. Commercial corner: Pastelerías La Tía Lupe, Wing Spot
   * 5. Residential area: Residencia Del Porvenir along Calle Del Porvenir
   * 6. Central Block: Dollar 2 Go large paved parcel & store, Acabados HBC, CatZoo
   * 7. East Block: Corporativo Arboleda
   * 8. Pedestrian streetscape props: street lamps, trees, planters, vehicles
   */
  public buildGomezMorinWorldSlice(state: WorldState): Scene3D {
    this.scene.clear();

    const topology = createGomezMorinSpatialTopology();

    // 1. Road Networks
    // Blvd. Manuel Gómez Morín (Wide East-West arterial)
    this.scene.addNode(new Node3D({
      id: 'node:road:blvd-gomez-morin',
      name: 'Blvd. Manuel Gómez Morín',
      entityId: 'street:blvd-gomez-morin',
      primitive: 'plane',
      dimensions: { x: 130, y: 0.1, z: 18 },
      color: [0.18, 0.19, 0.21], // Dark asphalt
      position: { x: 0, y: 0.0, z: 0 },
    }));

    // Calle Del Porvenir (Secondary street approaching from north at X = -20)
    this.scene.addNode(new Node3D({
      id: 'node:road:calle-del-porvenir',
      name: 'Calle Del Porvenir',
      entityId: 'street:calle-del-porvenir',
      primitive: 'box',
      dimensions: { x: 10, y: 0.1, z: 42 },
      color: [0.22, 0.23, 0.25],
      position: { x: -20, y: 0.05, z: -30 },
    }));

    // Av. La Arboleda (Secondary street approaching from north at X = 35)
    this.scene.addNode(new Node3D({
      id: 'node:road:av-la-arboleda',
      name: 'Avenida La Arboleda',
      entityId: 'street:av-la-arboleda',
      primitive: 'box',
      dimensions: { x: 10, y: 0.1, z: 42 },
      color: [0.22, 0.23, 0.25],
      position: { x: 35, y: 0.05, z: -30 },
    }));

    // Road Markings: Double yellow center line on Gómez Morín
    const gomezMorinDashes = [-55, -45, -35, -5, 5, 15, 25, 48, 58];
    gomezMorinDashes.forEach((dx, i) => {
      this.scene.addNode(new Node3D({
        id: `node:marking:gomez-morin-center-${i + 1}`,
        name: `Gómez Morín Center Line ${i + 1}`,
        primitive: 'box',
        dimensions: { x: 4.5, y: 0.02, z: 0.3 },
        color: [0.92, 0.82, 0.20], // Traffic yellow
        position: { x: dx, y: 0.06, z: 0 },
      }));
    });

    // Del Porvenir Yellow Center Divider
    [-18, -26, -34, -42].forEach((dz, i) => {
      this.scene.addNode(new Node3D({
        id: `node:marking:porvenir-center-${i + 1}`,
        name: `Del Porvenir Center Line ${i + 1}`,
        primitive: 'box',
        dimensions: { x: 0.25, y: 0.02, z: 4.0 },
        color: [0.92, 0.82, 0.20],
        position: { x: -20, y: 0.11, z: dz },
      }));
    });

    // Av. La Arboleda Yellow Center Divider
    [-18, -26, -34, -42].forEach((dz, i) => {
      this.scene.addNode(new Node3D({
        id: `node:marking:arboleda-center-${i + 1}`,
        name: `La Arboleda Center Line ${i + 1}`,
        primitive: 'box',
        dimensions: { x: 0.25, y: 0.02, z: 4.0 },
        color: [0.92, 0.82, 0.20],
        position: { x: 35, y: 0.11, z: dz },
      }));
    });

    // 2. Sidewalks & Curbs
    // Gómez Morín North Sidewalk — West Segment (Frontage of Wing Spot & Tía Lupe)
    this.scene.addNode(new Node3D({
      id: 'node:sidewalk:gomez-morin-north-west',
      name: 'Banqueta Gómez Morín Norponiente',
      primitive: 'box',
      dimensions: { x: 35, y: 0.2, z: 3.5 },
      color: [0.68, 0.70, 0.72],
      position: { x: -42.5, y: 0.15, z: -10.75 },
    }));

    // Gómez Morín North Sidewalk — Central Segment (Dollar 2 Go, HBC, CatZoo)
    this.scene.addNode(new Node3D({
      id: 'node:sidewalk:gomez-morin-north-mid',
      name: 'Banqueta Gómez Morín Nororiente Central',
      primitive: 'box',
      dimensions: { x: 45, y: 0.2, z: 3.5 },
      color: [0.68, 0.70, 0.72],
      position: { x: 7.5, y: 0.15, z: -10.75 },
    }));

    // Gómez Morín North Sidewalk — East Segment (Corporativo Arboleda)
    this.scene.addNode(new Node3D({
      id: 'node:sidewalk:gomez-morin-north-east',
      name: 'Banqueta Gómez Morín Nororiente Oriente',
      primitive: 'box',
      dimensions: { x: 30, y: 0.2, z: 3.5 },
      color: [0.68, 0.70, 0.72],
      position: { x: 55, y: 0.15, z: -10.75 },
    }));

    // Gómez Morín South Sidewalk (Continuous south pedestrian walkway)
    this.scene.addNode(new Node3D({
      id: 'node:sidewalk:gomez-morin-south',
      name: 'Banqueta Gómez Morín Sur',
      primitive: 'box',
      dimensions: { x: 130, y: 0.2, z: 3.5 },
      color: [0.68, 0.70, 0.72],
      position: { x: 0, y: 0.15, z: 10.75 },
    }));

    // Del Porvenir Sidewalks (West & East)
    this.scene.addNode(new Node3D({
      id: 'node:sidewalk:del-porvenir-west',
      name: 'Banqueta Del Porvenir Poniente',
      primitive: 'box',
      dimensions: { x: 3.0, y: 0.2, z: 40 },
      color: [0.68, 0.70, 0.72],
      position: { x: -26.5, y: 0.15, z: -31 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:sidewalk:del-porvenir-east',
      name: 'Banqueta Del Porvenir Oriente',
      primitive: 'box',
      dimensions: { x: 3.0, y: 0.2, z: 40 },
      color: [0.68, 0.70, 0.72],
      position: { x: -13.5, y: 0.15, z: -31 },
    }));

    // Av. La Arboleda Sidewalks (West & East)
    this.scene.addNode(new Node3D({
      id: 'node:sidewalk:la-arboleda-west',
      name: 'Banqueta La Arboleda Poniente',
      primitive: 'box',
      dimensions: { x: 3.0, y: 0.2, z: 40 },
      color: [0.68, 0.70, 0.72],
      position: { x: 28.5, y: 0.15, z: -31 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:sidewalk:la-arboleda-east',
      name: 'Banqueta La Arboleda Oriente',
      primitive: 'box',
      dimensions: { x: 3.0, y: 0.2, z: 40 },
      color: [0.68, 0.70, 0.72],
      position: { x: 41.5, y: 0.15, z: -31 },
    }));

    // 3. Pedestrian Crossings
    // Del Porvenir Crosswalk (West corner to East corner)
    [-23.5, -21.5, -19.5, -17.5, -15.5].forEach((cx, i) => {
      this.scene.addNode(new Node3D({
        id: `node:crosswalk:del-porvenir-${i + 1}`,
        name: `Cruce Del Porvenir Franja ${i + 1}`,
        primitive: 'box',
        dimensions: { x: 1.0, y: 0.03, z: 2.8 },
        color: [0.95, 0.95, 0.95],
        position: { x: cx, y: 0.07, z: -10.75 },
      }));
    });

    // Av. La Arboleda Crosswalk
    [31.5, 33.5, 35.5, 37.5, 39.5].forEach((cx, i) => {
      this.scene.addNode(new Node3D({
        id: `node:crosswalk:la-arboleda-${i + 1}`,
        name: `Cruce La Arboleda Franja ${i + 1}`,
        primitive: 'box',
        dimensions: { x: 1.0, y: 0.03, z: 2.8 },
        color: [0.95, 0.95, 0.95],
        position: { x: cx, y: 0.07, z: -10.75 },
      }));
    });

    // Blvd. Manuel Gómez Morín Arterial Crosswalk (North to South)
    [-6, -3, 0, 3, 6].forEach((cz, i) => {
      this.scene.addNode(new Node3D({
        id: `node:crosswalk:gomez-morin-${i + 1}`,
        name: `Cruce Gómez Morín Franja ${i + 1}`,
        primitive: 'box',
        dimensions: { x: 2.8, y: 0.03, z: 1.5 },
        color: [0.95, 0.95, 0.95],
        position: { x: 18, y: 0.07, z: cz },
      }));
    });

    // 4. Commercial Buildings & Entrances (West side of Del Porvenir)
    // Pastelerías La Tía Lupe (Commercial corner - Milestone 83 Interior Boundary)
    // Tía Lupe Interior Floor
    this.scene.addNode(new Node3D({
      id: 'node:floor:tia-lupe-interior',
      name: 'Pastelerías La Tía Lupe Interior Floor',
      entityId: 'interior:tia-lupe',
      primitive: 'plane',
      dimensions: { x: 9.0, y: 0.05, z: 10.5 },
      color: [0.82, 0.72, 0.65], // Warm pastry cream/tile floor
      position: { x: -31.0, y: 0.05, z: -18.25 },
    }));
    // Tía Lupe North Perimeter Wall
    this.scene.addNode(new Node3D({
      id: 'node:wall:tia-lupe-north',
      name: 'Tía Lupe North Wall',
      primitive: 'box',
      dimensions: { x: 9.0, y: 5.0, z: 0.4 },
      color: [0.78, 0.55, 0.50],
      position: { x: -31.0, y: 2.5, z: -23.5 },
    }));
    // Tía Lupe West Perimeter Wall
    this.scene.addNode(new Node3D({
      id: 'node:wall:tia-lupe-west',
      name: 'Tía Lupe West Wall',
      primitive: 'box',
      dimensions: { x: 0.4, y: 5.0, z: 10.5 },
      color: [0.78, 0.55, 0.50],
      position: { x: -35.5, y: 2.5, z: -18.25 },
    }));
    // Tía Lupe East Perimeter Wall
    this.scene.addNode(new Node3D({
      id: 'node:wall:tia-lupe-east',
      name: 'Tía Lupe East Wall',
      primitive: 'box',
      dimensions: { x: 0.4, y: 5.0, z: 10.5 },
      color: [0.78, 0.55, 0.50],
      position: { x: -26.5, y: 2.5, z: -18.25 },
    }));
    // Tía Lupe South Perimeter Wall (West segment)
    this.scene.addNode(new Node3D({
      id: 'node:wall:tia-lupe-south-west',
      name: 'Tía Lupe South Wall (West)',
      primitive: 'box',
      dimensions: { x: 4.5, y: 5.0, z: 0.4 },
      color: [0.78, 0.55, 0.50],
      position: { x: -33.25, y: 2.5, z: -13.0 },
    }));
    // Tía Lupe South Perimeter Wall (East segment)
    this.scene.addNode(new Node3D({
      id: 'node:wall:tia-lupe-south-east',
      name: 'Tía Lupe South Wall (East)',
      primitive: 'box',
      dimensions: { x: 2.5, y: 5.0, z: 0.4 },
      color: [0.78, 0.55, 0.50],
      position: { x: -27.75, y: 2.5, z: -13.0 },
    }));
    // Tía Lupe Awning
    this.scene.addNode(new Node3D({
      id: 'node:awning:tia-lupe',
      name: 'Tía Lupe Toldo',
      primitive: 'box',
      dimensions: { x: 6.0, y: 0.3, z: 1.8 },
      color: [0.85, 0.35, 0.45], // Rosy magenta awning
      position: { x: -30, y: 2.8, z: -12.0 },
    }));
    // Tía Lupe Sign
    this.scene.addNode(new Node3D({
      id: 'node:sign:tia-lupe',
      name: 'Pastelerías La Tía Lupe Letrero',
      primitive: 'box',
      dimensions: { x: 5.5, y: 0.8, z: 0.15 },
      color: [0.95, 0.90, 0.85],
      position: { x: -30, y: 4.2, z: -12.4 },
    }));
    // Tía Lupe Entrance Anchor
    this.scene.addNode(new Node3D({
      id: 'node:anchor:entrance:tia-lupe',
      name: 'Tía Lupe Entrada Principal',
      entityId: 'entrance:tia-lupe-main',
      primitive: 'box',
      dimensions: { x: 1.8, y: 3.0, z: 0.2 },
      color: [0.45, 0.25, 0.20],
      position: { x: -30, y: 1.5, z: -12.4 },
    }));

    // Wing Spot (Commercial building, west - Milestone 82 Interior Boundary)
    // Wing Spot Interior Floor
    this.scene.addNode(new Node3D({
      id: 'node:floor:wing-spot-interior',
      name: 'Wing Spot Interior Floor',
      entityId: 'interior:wing-spot',
      primitive: 'plane',
      dimensions: { x: 11.0, y: 0.05, z: 10.5 },
      color: [0.35, 0.22, 0.16], // Warm restaurant parquet/terracotta
      position: { x: -45.0, y: 0.05, z: -18.25 },
    }));
    // Wing Spot North Perimeter Wall
    this.scene.addNode(new Node3D({
      id: 'node:wall:wing-spot-north',
      name: 'Wing Spot North Wall',
      primitive: 'box',
      dimensions: { x: 11.0, y: 5.0, z: 0.4 },
      color: [0.26, 0.28, 0.32],
      position: { x: -45.0, y: 2.5, z: -23.5 },
    }));
    // Wing Spot West Perimeter Wall
    this.scene.addNode(new Node3D({
      id: 'node:wall:wing-spot-west',
      name: 'Wing Spot West Wall',
      primitive: 'box',
      dimensions: { x: 0.4, y: 5.0, z: 10.5 },
      color: [0.26, 0.28, 0.32],
      position: { x: -50.5, y: 2.5, z: -18.25 },
    }));
    // Wing Spot East Perimeter Wall
    this.scene.addNode(new Node3D({
      id: 'node:wall:wing-spot-east',
      name: 'Wing Spot East Wall',
      primitive: 'box',
      dimensions: { x: 0.4, y: 5.0, z: 10.5 },
      color: [0.26, 0.28, 0.32],
      position: { x: -39.5, y: 2.5, z: -18.25 },
    }));
    // Wing Spot South Perimeter Wall (West segment)
    this.scene.addNode(new Node3D({
      id: 'node:wall:wing-spot-south-west',
      name: 'Wing Spot South Wall (West)',
      primitive: 'box',
      dimensions: { x: 4.5, y: 5.0, z: 0.4 },
      color: [0.26, 0.28, 0.32],
      position: { x: -48.25, y: 2.5, z: -13.0 },
    }));
    // Wing Spot South Perimeter Wall (East segment)
    this.scene.addNode(new Node3D({
      id: 'node:wall:wing-spot-south-east',
      name: 'Wing Spot South Wall (East)',
      primitive: 'box',
      dimensions: { x: 4.5, y: 5.0, z: 0.4 },
      color: [0.26, 0.28, 0.32],
      position: { x: -41.75, y: 2.5, z: -13.0 },
    }));
    // Wing Spot South Perimeter Wall Lintel
    this.scene.addNode(new Node3D({
      id: 'node:wall:wing-spot-south-lintel',
      name: 'Wing Spot Entrance Lintel',
      primitive: 'box',
      dimensions: { x: 2.0, y: 1.5, z: 0.4 },
      color: [0.26, 0.28, 0.32],
      position: { x: -45.0, y: 4.25, z: -13.0 },
    }));
    // Wing Spot Entrance Threshold Plate
    this.scene.addNode(new Node3D({
      id: 'node:threshold:wing-spot-entrance',
      name: 'Wing Spot Entrance Threshold Plate',
      primitive: 'box',
      dimensions: { x: 2.0, y: 0.05, z: 0.8 },
      color: [0.85, 0.65, 0.20],
      position: { x: -45.0, y: 0.12, z: -13.0 },
    }));
    // Wing Spot Canopy
    this.scene.addNode(new Node3D({
      id: 'node:canopy:wing-spot',
      name: 'Wing Spot Marquesina',
      primitive: 'box',
      dimensions: { x: 7.0, y: 0.3, z: 1.8 },
      color: [0.88, 0.45, 0.12], // Orange Wing Spot sports accent
      position: { x: -45, y: 2.8, z: -12.0 },
    }));
    // Wing Spot Sign
    this.scene.addNode(new Node3D({
      id: 'node:sign:wing-spot',
      name: 'Wing Spot Letrero',
      primitive: 'box',
      dimensions: { x: 6.0, y: 0.8, z: 0.15 },
      color: [0.95, 0.50, 0.15],
      position: { x: -45, y: 4.2, z: -12.4 },
    }));
    // Wing Spot Entrance Anchor
    this.scene.addNode(new Node3D({
      id: 'node:anchor:entrance:wing-spot',
      name: 'Wing Spot Entrada Principal',
      entityId: 'entrance:wing-spot-main',
      primitive: 'box',
      dimensions: { x: 1.8, y: 3.0, z: 0.2 },
      color: [0.20, 0.20, 0.20],
      position: { x: -45, y: 1.5, z: -12.4 },
    }));

    // 5. Residential Properties along Del Porvenir
    // Residencia Del Porvenir (Elena's home)
    this.scene.addNode(new Node3D({
      id: 'node:building:del-porvenir-residence',
      name: 'Residencia Del Porvenir',
      entityId: 'building:del-porvenir-residence',
      primitive: 'box',
      dimensions: { x: 12, y: 7.5, z: 13 },
      color: [0.65, 0.45, 0.35], // Brick residential tone
      position: { x: -32.5, y: 3.75, z: -36 },
    }));
    // Roof
    this.scene.addNode(new Node3D({
      id: 'node:roof:del-porvenir-residence',
      name: 'Techo Residencia Del Porvenir',
      primitive: 'box',
      dimensions: { x: 13, y: 1.5, z: 14 },
      color: [0.30, 0.20, 0.16],
      position: { x: -32.5, y: 8.25, z: -36 },
    }));
    // Porch Stoop facing Del Porvenir
    this.scene.addNode(new Node3D({
      id: 'node:porch:del-porvenir-residence',
      name: 'Pórtico Residencia Del Porvenir',
      primitive: 'box',
      dimensions: { x: 2.2, y: 0.35, z: 3.0 },
      color: [0.65, 0.62, 0.58],
      position: { x: -25.5, y: 0.2, z: -36 },
    }));
    // Residential Entrance Anchor
    this.scene.addNode(new Node3D({
      id: 'node:anchor:entrance:del-porvenir-residence',
      name: 'Entrada Residencia Del Porvenir',
      entityId: 'entrance:del-porvenir-residence-main',
      primitive: 'box',
      dimensions: { x: 0.2, y: 3.0, z: 1.8 },
      color: [0.42, 0.28, 0.20],
      position: { x: -26.4, y: 1.5, z: -36 },
    }));

    // 6. Central Block (Dollar 2 Go, Acabados HBC, CatZoo)
    // Dollar 2 Go Large Paved Parcel / Parking Area
    this.scene.addNode(new Node3D({
      id: 'node:parcel:dollar-2-go-paved-lot',
      name: 'Lote Estacionamiento Dollar 2 Go',
      primitive: 'box',
      dimensions: { x: 24, y: 0.15, z: 20 },
      color: [0.35, 0.36, 0.38], // Paved concrete/asphalt lot
      position: { x: -2, y: 0.1, z: -20 },
    }));
    // Dollar 2 Go Retail Building Mass (small single-story structure inside the large lot)
    this.scene.addNode(new Node3D({
      id: 'node:building:dollar-2-go',
      name: 'Edificio Dollar 2 Go',
      entityId: 'building:dollar-2-go-building',
      primitive: 'box',
      dimensions: { x: 10, y: 4.5, z: 10 },
      color: [0.82, 0.84, 0.85], // Light retail box facade
      position: { x: -2, y: 2.35, z: -20 },
    }));
    // Dollar 2 Go Signboard (distinctive yellow/green logo branding)
    this.scene.addNode(new Node3D({
      id: 'node:sign:dollar-2-go',
      name: 'Dollar 2 Go Letrero',
      primitive: 'box',
      dimensions: { x: 5.5, y: 0.9, z: 0.2 },
      color: [0.92, 0.85, 0.15], // Dollar store yellow
      position: { x: -2, y: 3.8, z: -14.9 },
    }));
    // Dollar 2 Go Entrance Anchor
    this.scene.addNode(new Node3D({
      id: 'node:anchor:entrance:dollar-2-go',
      name: 'Dollar 2 Go Entrada Principal',
      entityId: 'entrance:dollar-2-go-main',
      primitive: 'box',
      dimensions: { x: 2.0, y: 2.8, z: 0.2 },
      color: [0.15, 0.50, 0.25], // Green retail frame
      position: { x: -2, y: 1.5, z: -14.9 },
    }));

    // Acabados HBC (paint-store showroom immediately east of Dollar 2 Go)
    this.scene.addNode(new Node3D({
      id: 'node:building:acabados-hbc',
      name: 'Edificio Acabados HBC',
      entityId: 'building:acabados-hbc-building',
      primitive: 'box',
      dimensions: { x: 14, y: 7.0, z: 14 },
      color: [0.30, 0.38, 0.50], // Professional slate/blue finish showroom
      position: { x: 18, y: 3.5, z: -18 },
    }));
    // Acabados HBC Sign
    this.scene.addNode(new Node3D({
      id: 'node:sign:acabados-hbc',
      name: 'Acabados HBC Letrero',
      primitive: 'box',
      dimensions: { x: 7.0, y: 0.9, z: 0.2 },
      color: [0.15, 0.35, 0.70],
      position: { x: 18, y: 4.8, z: -10.9 },
    }));
    // Acabados HBC Entrance Anchor
    this.scene.addNode(new Node3D({
      id: 'node:anchor:entrance:acabados-hbc',
      name: 'Acabados HBC Entrada Principal',
      entityId: 'entrance:acabados-hbc-main',
      primitive: 'box',
      dimensions: { x: 2.0, y: 2.8, z: 0.2 },
      color: [0.20, 0.20, 0.20],
      position: { x: 18, y: 1.5, z: -10.9 },
    }));

    // CatZoo Clínica Felina (further north)
    this.scene.addNode(new Node3D({
      id: 'node:building:catzoo',
      name: 'Edificio CatZoo Clínica Felina',
      entityId: 'building:catzoo-building',
      primitive: 'box',
      dimensions: { x: 14, y: 6.0, z: 12 },
      color: [0.45, 0.55, 0.48], // Soft veterinary sage green
      position: { x: 18, y: 3.0, z: -36 },
    }));
    // CatZoo Sign
    this.scene.addNode(new Node3D({
      id: 'node:sign:catzoo',
      name: 'CatZoo Clínica Felina Letrero',
      primitive: 'box',
      dimensions: { x: 6.0, y: 0.8, z: 0.2 },
      color: [0.85, 0.90, 0.85],
      position: { x: 18, y: 4.5, z: -29.9 },
    }));
    // CatZoo Entrance Anchor
    this.scene.addNode(new Node3D({
      id: 'node:anchor:entrance:catzoo',
      name: 'CatZoo Entrada Principal',
      entityId: 'entrance:catzoo-main',
      primitive: 'box',
      dimensions: { x: 2.0, y: 2.8, z: 0.2 },
      color: [0.20, 0.30, 0.25],
      position: { x: 18, y: 1.5, z: -29.9 },
    }));

    // 7. East Block: Corporativo Arboleda
    this.scene.addNode(new Node3D({
      id: 'node:building:corporativo-arboleda',
      name: 'Edificio Corporativo Arboleda',
      entityId: 'building:corporativo-arboleda-building',
      primitive: 'box',
      dimensions: { x: 16, y: 12.0, z: 20 },
      color: [0.25, 0.28, 0.32], // Multi-story corporate glass and steel
      position: { x: 50, y: 6.0, z: -25 },
    }));
    // Corporativo Sign
    this.scene.addNode(new Node3D({
      id: 'node:sign:corporativo-arboleda',
      name: 'Corporativo Arboleda Letrero',
      primitive: 'box',
      dimensions: { x: 0.2, y: 1.0, z: 8.0 },
      color: [0.80, 0.85, 0.90],
      position: { x: 41.9, y: 5.5, z: -22 },
    }));
    // Corporativo Entrance Anchor
    this.scene.addNode(new Node3D({
      id: 'node:anchor:entrance:corporativo-arboleda',
      name: 'Corporativo Arboleda Entrada Principal',
      entityId: 'entrance:corporativo-arboleda-main',
      primitive: 'box',
      dimensions: { x: 0.2, y: 3.5, z: 2.5 },
      color: [0.15, 0.15, 0.18],
      position: { x: 41.9, y: 1.75, z: -22 },
    }));

    // 8. Environmental Streetscape Props
    // Street lamps along Gómez Morín
    [-50, -30, -5, 15, 35, 55].forEach((lx, i) => {
      this.scene.addNode(new Node3D({
        id: `node:prop:gomez-morin-lamp-pole-${i + 1}`,
        name: `Luminaria Gómez Morín ${i + 1}`,
        primitive: 'cylinder',
        dimensions: { x: 0.22, y: 5.0, z: 0.22 },
        color: [0.35, 0.38, 0.40],
        position: { x: lx, y: 2.6, z: -9.2 },
      }));
      this.scene.addNode(new Node3D({
        id: `node:prop:gomez-morin-lamp-lantern-${i + 1}`,
        name: `Foco Luminaria Gómez Morín ${i + 1}`,
        primitive: 'box',
        dimensions: { x: 0.5, y: 0.5, z: 0.5 },
        color: [0.98, 0.95, 0.70],
        position: { x: lx, y: 5.1, z: -9.2 },
      }));
    });

    // Trees along Gómez Morín sidewalk
    [-40, -15, 5, 25, 45].forEach((tx, i) => {
      this.scene.addNode(new Node3D({
        id: `node:prop:gomez-morin-tree-trunk-${i + 1}`,
        name: `Árbol Gómez Morín Tronco ${i + 1}`,
        primitive: 'cylinder',
        dimensions: { x: 0.4, y: 2.8, z: 0.4 },
        color: [0.40, 0.28, 0.18],
        position: { x: tx, y: 1.4, z: -12.2 },
      }));
      this.scene.addNode(new Node3D({
        id: `node:prop:gomez-morin-tree-canopy-${i + 1}`,
        name: `Árbol Gómez Morín Copa ${i + 1}`,
        primitive: 'cylinder',
        dimensions: { x: 2.6, y: 2.8, z: 2.6 },
        color: [0.22, 0.52, 0.25],
        position: { x: tx, y: 3.8, z: -12.2 },
      }));
    });

    // Parked Vehicles in Dollar 2 Go Lot
    this.scene.addNode(new Node3D({
      id: 'node:prop:car-dollar-1',
      name: 'Vehículo Estacionamiento Dollar 1',
      primitive: 'box',
      dimensions: { x: 2.0, y: 1.2, z: 4.2 },
      color: [0.65, 0.18, 0.18], // Red car
      position: { x: -8, y: 0.7, z: -25 },
    }));
    this.scene.addNode(new Node3D({
      id: 'node:prop:car-dollar-2',
      name: 'Vehículo Estacionamiento Dollar 2',
      primitive: 'box',
      dimensions: { x: 2.0, y: 1.2, z: 4.2 },
      color: [0.85, 0.85, 0.88], // White car
      position: { x: 5, y: 0.7, z: -25 },
    }));

    // 9. Dynamic Agents
    // Player Character
    this.scene.addNode(new Node3D({
      id: 'node:player',
      name: 'Player Character',
      entityId: 'agent:gomez-morin-player',
      primitive: 'cylinder',
      dimensions: { x: 0.8, y: 2.0, z: 0.8 },
      color: [0.22, 0.55, 0.90],
      position: { x: -24.0, y: 1.0, z: -11.0 }, // Spawns on corner sidewalk
    }));

    // Elena Morales NPC
    this.scene.addNode(new Node3D({
      id: 'node:npc',
      name: 'Elena Morales (NPC)',
      entityId: 'agent:elena-npc',
      primitive: 'cylinder',
      dimensions: { x: 0.8, y: 2.0, z: 0.8 },
      color: [0.88, 0.72, 0.22],
      position: { x: -25.5, y: 1.0, z: -36.0 }, // Spawns at her Del Porvenir stoop
    }));

    return this.scene;
  }
}

/**
 * Provisional building footprint bounding boxes in Gómez Morín 3D presentation space.
 */
export interface BuildingFootprint {
  readonly buildingId: string;
  readonly name: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export const GOMEZ_MORIN_BUILDING_FOOTPRINTS: readonly BuildingFootprint[] = [
  {
    buildingId: 'building:tia-lupe-building',
    name: 'Edificio Pastelerías La Tía Lupe',
    minX: -36.5,
    maxX: -25.5,
    minZ: -24.5,
    maxZ: -12.5,
  },
  {
    buildingId: 'building:wing-spot-building',
    name: 'Edificio Wing Spot',
    minX: -51.5,
    maxX: -38.5,
    minZ: -24.5,
    maxZ: -12.5,
  },
  {
    buildingId: 'building:del-porvenir-residence',
    name: 'Residencia Del Porvenir',
    minX: -38.5,
    maxX: -26.5,
    minZ: -42.5,
    maxZ: -29.5,
  },
  {
    buildingId: 'building:dollar-2-go-building',
    name: 'Edificio Dollar 2 Go',
    minX: -7.5,
    maxX: 3.5,
    minZ: -25.5,
    maxZ: -14.5,
  },
  {
    buildingId: 'building:acabados-hbc-building',
    name: 'Edificio Acabados HBC',
    minX: 10.5,
    maxX: 25.5,
    minZ: -25.5,
    maxZ: -12.5,
  },
  {
    buildingId: 'building:catzoo-building',
    name: 'Edificio CatZoo Clínica Felina',
    minX: 10.5,
    maxX: 25.5,
    minZ: -42.5,
    maxZ: -29.5,
  },
  {
    buildingId: 'building:corporativo-arboleda-building',
    name: 'Edificio Corporativo Arboleda',
    minX: 41.5,
    maxX: 58.5,
    minZ: -35.5,
    maxZ: -14.5,
  },
];

/**
 * Checks if a 2D position (x, z) falls inside any building footprint.
 */
export function isInsideBuildingFootprint(
  x: number,
  z: number,
  footprints: readonly BuildingFootprint[] = GOMEZ_MORIN_BUILDING_FOOTPRINTS
): boolean {
  for (const fp of footprints) {
    if (x >= fp.minX && x <= fp.maxX && z >= fp.minZ && z <= fp.maxZ) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates whether a candidate pedestrian coordinate (x, z) is on a valid walkable surface.
 *
 * Enforces:
 * 1. Building footprints are strictly non-walkable.
 * 2. Pedestrian sidewalks are walkable.
 * 3. Roadways are non-walkable except within designated pedestrian crosswalks.
 * 4. Paved pedestrian lots and entrance stoops are walkable.
 */
export function isPedestrianWalkablePosition(x: number, z: number): boolean {
  if (isInsideBuildingFootprint(x, z)) {
    return false;
  }

  // 1. Gómez Morín North Sidewalk: Z in [-13.5, -9.0], X in [-65, 65]
  if (z >= -13.5 && z <= -9.0 && x >= -65 && x <= 65) {
    // If inside road openings for Del Porvenir or La Arboleda, must be on crosswalk
    if ((x > -25 && x < -15) || (x > 30 && x < 40)) {
      return z >= -12.5 && z <= -9.5;
    }
    return true;
  }

  // 2. Gómez Morín South Sidewalk: Z in [9.0, 13.5], X in [-65, 65]
  if (z >= 9.0 && z <= 13.5 && x >= -65 && x <= 65) {
    return true;
  }

  // 3. Del Porvenir West Sidewalk: X in [-28.5, -24.0], Z in [-50, -9]
  if (x >= -28.5 && x <= -24.0 && z >= -50 && z <= -9) {
    return true;
  }

  // 4. Del Porvenir East Sidewalk: X in [-15.5, -11.5], Z in [-50, -9]
  if (x >= -15.5 && x <= -11.5 && z >= -50 && z <= -9) {
    return true;
  }

  // 5. La Arboleda West Sidewalk: X in [26.5, 30.5], Z in [-50, -9]
  if (x >= 26.5 && x <= 30.5 && z >= -50 && z <= -9) {
    return true;
  }

  // 6. La Arboleda East Sidewalk: X in [39.5, 43.5], Z in [-50, -9]
  if (x >= 39.5 && x <= 43.5 && z >= -50 && z <= -9) {
    return true;
  }

  // 7. Pedestrian Crosswalks:
  // Del Porvenir crossing: X in [-25, -15], Z in [-12.5, -9.5]
  if (x >= -25 && x <= -15 && z >= -12.5 && z <= -9.5) {
    return true;
  }
  // La Arboleda crossing: X in [30, 40], Z in [-12.5, -9.5]
  if (x >= 30 && x <= 40 && z >= -12.5 && z <= -9.5) {
    return true;
  }
  // Gómez Morín arterial crossing: X in [16, 20], Z in [-11, 11]
  if (x >= 16 && x <= 20 && z >= -11 && z <= 11) {
    return true;
  }

  // 8. Dollar 2 Go paved parking lot & pedestrian pathways
  if (x >= -14 && x <= 10 && z >= -30 && z <= -10) {
    return true;
  }

  // 9. Residence stoop & walkway
  if (x >= -28 && x <= -23 && z >= -38 && z <= -34) {
    return true;
  }

  // 10. CatZoo access path
  if (x >= 15 && x <= 21 && z >= -32 && z <= -24) {
    return true;
  }

  return false;
}

/**
 * Returns provisional 3D presentation coordinates for all pedestrian navigation nodes.
 */
export function getGomezMorinNavCoordinates(): Map<string, Vector3> {
  const map = new Map<string, Vector3>();
  map.set('node:nav:entrance:del-porvenir-residence', { x: -25.5, y: 1.0, z: -36.0 });
  map.set('node:nav:porvenir-sidewalk-north', { x: -24.0, y: 1.0, z: -36.0 });
  map.set('node:nav:porvenir-sidewalk-mid', { x: -24.0, y: 1.0, z: -24.0 });
  map.set('node:nav:porvenir-sidewalk-corner-west', { x: -24.0, y: 1.0, z: -11.0 });
  map.set('node:nav:crossing:del-porvenir', { x: -19.0, y: 0.1, z: -11.0 });
  map.set('node:nav:porvenir-sidewalk-corner-east', { x: -14.0, y: 1.0, z: -11.0 });
  map.set('node:nav:gomez-morin-north-sidewalk-west', { x: -30.0, y: 1.0, z: -11.0 });
  map.set('node:nav:entrance:tia-lupe', { x: -30.0, y: 1.0, z: -12.4 });
  map.set('node:nav:gomez-morin-north-sidewalk-wingspot', { x: -45.0, y: 1.0, z: -11.0 });
  map.set('node:nav:entrance:wing-spot', { x: -45.0, y: 1.0, z: -12.4 });
  map.set('node:nav:dollar-lot-access', { x: -8.0, y: 1.0, z: -11.0 });
  map.set('node:nav:dollar-parking-path', { x: -2.0, y: 0.2, z: -14.0 });
  map.set('node:nav:entrance:dollar-2-go', { x: -2.0, y: 1.0, z: -14.9 });
  map.set('node:nav:gomez-morin-north-sidewalk-hbc', { x: 18.0, y: 1.0, z: -11.0 });
  map.set('node:nav:entrance:acabados-hbc', { x: 18.0, y: 1.0, z: -11.0 });
  map.set('node:nav:catzoo-access', { x: 18.0, y: 1.0, z: -27.0 });
  map.set('node:nav:entrance:catzoo', { x: 18.0, y: 1.0, z: -30.0 });
  map.set('node:nav:arboleda-sidewalk-corner-west', { x: 28.0, y: 1.0, z: -11.0 });
  map.set('node:nav:crossing:la-arboleda', { x: 34.0, y: 0.1, z: -11.0 });
  map.set('node:nav:arboleda-sidewalk-corner-east', { x: 40.0, y: 1.0, z: -11.0 });
  map.set('node:nav:entrance:corporativo-arboleda', { x: 42.0, y: 1.0, z: -20.0 });
  map.set('node:nav:crossing:gomez-morin-mid', { x: 18.0, y: 0.1, z: 0.0 });
  map.set('node:nav:gomez-morin-south-sidewalk-mid', { x: 18.0, y: 1.0, z: 11.0 });
  map.set('node:nav:interior:wing-spot-threshold', { x: -45.0, y: 1.0, z: -13.5 });
  map.set('node:nav:interior:tia-lupe-threshold', { x: -30.0, y: 1.0, z: -13.5 });
  return map;
}

/**
 * Evaluates whether a coordinate (x, z) is inside the provisional walkable interior of Wing Spot.
 *
 * Provisional Interior Bounds:
 * minX: -50.5, maxX: -39.5, minZ: -23.5, maxZ: -13.0
 */
export function isWingSpotInteriorWalkablePosition(x: number, z: number): boolean {
  return x >= -50.3 && x <= -39.7 && z >= -23.3 && z <= -13.0;
}

/**
 * Evaluates whether a coordinate (x, z) is inside the provisional walkable interior of Pastelerías La Tía Lupe.
 *
 * Provisional Interior Bounds:
 * minX: -35.5, maxX: -26.5, minZ: -23.5, maxZ: -13.0
 */
export function isTiaLupeInteriorWalkablePosition(x: number, z: number): boolean {
  return x >= -35.3 && x <= -26.7 && z >= -23.3 && z <= -13.0;
}

/**
 * Evaluates whether a coordinate (x, z) is walkable given the agent's current location context.
 *
 * If the location context maps to an interior space in topology, validates against the
 * interior boundary with a 0.2m wall safety margin. Otherwise validates against outdoor pedestrian network.
 */
export function isContextualWalkablePosition(
  x: number,
  z: number,
  currentLocationId?: string,
  topology: GomezMorinSpatialTopology = createGomezMorinSpatialTopology()
): boolean {
  if (currentLocationId) {
    const interior = findInteriorSpaceByPlace(topology, currentLocationId);
    if (interior) {
      return (
        x >= interior.boundary.minX + 0.2 &&
        x <= interior.boundary.maxX - 0.2 &&
        z >= interior.boundary.minZ + 0.2 &&
        z <= interior.boundary.maxZ
      );
    }
  }
  return isPedestrianWalkablePosition(x, z);
}

