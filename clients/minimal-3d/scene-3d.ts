/**
 * Milestone 72 — Minimal 3D Scene Model
 *
 * Engine-independent 3D scene graph representation for the M72 3D client prototype.
 *
 * Architectural Invariants:
 * 1. ZERO World Core coupling: Scene3D is presentation-only state.
 * 2. ZERO coordinates in World Core: Transform3D coordinates (x, y, z) exist
 *    strictly within this client-local scene model.
 * 3. Disposable: Deleting this module has zero impact on World Core or existing Canvas client.
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Euler3 {
  pitch: number; // Rotation around X (radians)
  yaw: number;   // Rotation around Y (radians)
  roll: number;  // Rotation around Z (radians)
}

export interface Transform3D {
  position: Vector3;
  rotation: Euler3;
  scale: Vector3;
}

export type Primitive3D = 'box' | 'cylinder' | 'plane';

/**
 * Normalized RGB color tuple: [r, g, b] where each component is 0.0 to 1.0.
 */
export type ColorRGB = [number, number, number];

export interface Node3DOptions {
  id: string;
  name: string;
  entityId?: string;
  primitive?: Primitive3D;
  dimensions?: Vector3;
  color?: ColorRGB;
  position?: Vector3;
  rotation?: Euler3;
  scale?: Vector3;
  visible?: boolean;
}

/**
 * A single node in the 3D client scene graph.
 */
export class Node3D {
  readonly id: string;
  name: string;
  entityId?: string;
  primitive?: Primitive3D;
  dimensions: Vector3;
  color: ColorRGB;
  readonly transform: Transform3D;
  parent: Node3D | null = null;
  children: Node3D[] = [];
  visible: boolean = true;

  constructor(options: Node3DOptions) {
    this.id = options.id;
    this.name = options.name;
    this.entityId = options.entityId;
    this.primitive = options.primitive;
    this.dimensions = options.dimensions ?? { x: 1, y: 1, z: 1 };
    this.color = options.color ?? [0.8, 0.8, 0.8];
    this.visible = options.visible ?? true;

    this.transform = {
      position: options.position ? { ...options.position } : { x: 0, y: 0, z: 0 },
      rotation: options.rotation ? { ...options.rotation } : { pitch: 0, yaw: 0, roll: 0 },
      scale: options.scale ? { ...options.scale } : { x: 1, y: 1, z: 1 },
    };
  }

  public addChild(child: Node3D): this {
    if (child.parent) {
      child.parent.removeChild(child.id);
    }
    child.parent = this;
    this.children.push(child);
    return this;
  }

  public removeChild(childId: string): boolean {
    const idx = this.children.findIndex((c) => c.id === childId);
    if (idx >= 0) {
      const removed = this.children.splice(idx, 1)[0];
      removed.parent = null;
      return true;
    }
    return false;
  }

  /**
   * Computes the world position by accumulating parent positions.
   * Simple translation hierarchy suitable for the minimal prototype.
   */
  public getWorldPosition(): Vector3 {
    if (!this.parent) {
      return { ...this.transform.position };
    }
    const parentPos = this.parent.getWorldPosition();
    return {
      x: parentPos.x + this.transform.position.x,
      y: parentPos.y + this.transform.position.y,
      z: parentPos.z + this.transform.position.z,
    };
  }
}

/**
 * Lightweight 3D Scene Graph containing 3D nodes.
 */
export class Scene3D {
  readonly root: Node3D;
  private readonly nodesById = new Map<string, Node3D>();
  private readonly nodesByEntity = new Map<string, Node3D>();

  constructor() {
    this.root = new Node3D({
      id: '__root__',
      name: 'Scene Root',
    });
    this.nodesById.set(this.root.id, this.root);
  }

  public addNode(node: Node3D, parent?: Node3D): this {
    const targetParent = parent ?? this.root;
    targetParent.addChild(node);
    this.indexNode(node);
    return this;
  }

  private indexNode(node: Node3D): void {
    this.nodesById.set(node.id, node);
    if (node.entityId) {
      this.nodesByEntity.set(node.entityId, node);
    }
    for (const child of node.children) {
      this.indexNode(child);
    }
  }

  public removeNode(nodeId: string): boolean {
    const node = this.nodesById.get(nodeId);
    if (!node || node === this.root) return false;

    if (node.parent) {
      node.parent.removeChild(nodeId);
    }
    this.unindexNode(node);
    return true;
  }

  private unindexNode(node: Node3D): void {
    this.nodesById.delete(node.id);
    if (node.entityId) {
      this.nodesByEntity.delete(node.entityId);
    }
    for (const child of node.children) {
      this.unindexNode(child);
    }
  }

  public getNode(nodeId: string): Node3D | undefined {
    return this.nodesById.get(nodeId);
  }

  public getNodeByEntityId(entityId: string): Node3D | undefined {
    return this.nodesByEntity.get(entityId);
  }

  public getAllNodes(): readonly Node3D[] {
    return Array.from(this.nodesById.values()).filter((n) => n !== this.root);
  }

  public clear(): void {
    const children = [...this.root.children];
    for (const child of children) {
      this.removeNode(child.id);
    }
  }
}
