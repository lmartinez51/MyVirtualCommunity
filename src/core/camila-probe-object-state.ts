/**
 * Milestone 94 Phase 2a: Camila probe-object positions (mutable).
 *
 * The frozen CAMILA_PROBE_OBJECTS list only carries STARTING positions.
 * When Camila pushes an object, its current Unity position moves — and that
 * movement must survive a server restart. This module owns that mutable
 * state, persisted in data/camila-object-positions.json.
 *
 * Deliberately separate from the authoritative WorldState (v19,
 * data/world-state.json): probe objects are scene props, not world facts,
 * so their positions never touch the WorldState schema. The file lives in
 * data/ (gitignored, like data/camila-notebook.json and
 * data/world-state.json).
 *
 * Loading is tolerant, like CamilaNotebook: a missing file yields the seed
 * positions; a corrupt file yields the seed positions plus `loadError`
 * (never a crash). Saving is atomic (temp file + rename).
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CAMILA_PROBE_OBJECTS, type UnityPosition } from './camila-probe-objects.js';

export type { UnityPosition } from './camila-probe-objects.js';

export const CAMILA_OBJECT_POSITIONS_VERSION = 'camila-object-positions-v1';
export const DEFAULT_CAMILA_OBJECT_POSITIONS_PATH = resolve(
  process.cwd(),
  'data',
  'camila-object-positions.json'
);

/** Gómez Morín slice bounds (Unity scene frame, metres) — from GomezMorinSceneBuilder. */
export const CAMILA_OBJECT_POSITION_BOUNDS = Object.freeze({
  minX: -60,
  maxX: 175,
  minZ: -45,
  maxZ: 45,
  minY: -1,
  maxY: 10,
});

export interface ProbeObjectPhysicalState {
  contents?: 'empty' | 'water' | 'sand';
  waterLevel?: number;
  sandFillLevel?: number;
  chalkMarks?: number;
  disposedInBin?: boolean;
}

export interface AgentSittingState {
  readonly placeId: string;
  readonly surface: string;
  readonly targetObjectId?: string;
}

export interface CamilaWorldChangeEvent {
  readonly timestamp: string;
  readonly kind:
    | 'player_moved'
    | 'camila_pushed'
    | 'camila_picked_up'
    | 'camila_dropped'
    | 'camila_scooped'
    | 'camila_applied'
    | 'camila_sat'
    | 'camila_stood';
  readonly objectId: string;
  readonly summary: string;
}

export interface CamilaObjectPositionsData {
  readonly version: string;
  readonly updatedAt: string;
  readonly positions: Readonly<Record<string, UnityPosition>>;
  readonly heldByAgent?: Readonly<Record<string, string>>;
  readonly physicalStates?: Readonly<Record<string, ProbeObjectPhysicalState>>;
  readonly sittingByAgent?: Readonly<Record<string, AgentSittingState>>;
}

/**
 * Resolves which logical Gómez Morín placeId a Unity coordinate physically
 * occupies, matching GomezMorinSceneBuilder's layout. Used when a prop has
 * been carried/kicked away from its seed spot so Camila perceives it in its
 * actual new location.
 */
export function resolvePlaceIdForUnityPosition(pos: UnityPosition, fallbackPlaceId: string): string {
  const { x, z } = pos;
  // Wing Spot building & interior (X: -20..-5, Z: 5..20)
  if (x >= -20 && x <= -5 && z >= 5 && z <= 20) return 'building:wing-spot-building';
  // Pastelerías La Tía Lupe (X: -26..-5, Z: 5..14 or facade around -18)
  if (x >= -26 && x <= 6.5 && z >= 5 && z <= 14) return 'building:tia-lupe-building';
  // Residencia Del Porvenir (X: -5..10, Z: 22..42)
  if (x >= -5 && x <= 10.5 && z >= 22 && z <= 42) return 'building:del-porvenir-residence';
  // Calle Del Porvenir (X: 6..21, Z: 5..45)
  if (x >= 6 && x <= 21 && z >= 5 && z <= 45) return 'street:calle-del-porvenir';
  // Dollar 2 Go commercial lot (X: 21..75.8, Z: 5..28)
  if (x >= 21 && x <= 75.8 && z >= 5 && z <= 28.5) return 'building:dollar-2-go-building';
  // CatZoo Clínica Felina (X: 72..94, Z: 21.5..38)
  if (x >= 72 && x <= 94 && z >= 21.5 && z <= 38) return 'building:catzoo-building';
  // Acabados HRC / HBC (X: 75.8..94.5, Z: 4..21.5)
  if (x >= 75.8 && x <= 94.5 && z >= 4 && z <= 21.5) return 'building:acabados-hbc-building';
  // Avenida La Arboleda (X: 93.5..109, Z: 5..45)
  if (x >= 93.5 && x <= 109 && z >= 5 && z <= 45) return 'street:av-la-arboleda';
  // Corporativo Arboleda (X: 109..160, Z: 4..40)
  if (x >= 109 && x <= 160 && z >= 4 && z <= 40) return 'building:corporativo-arboleda-building';
  // Blvd. Manuel Gómez Morín corridor (Z < 5)
  if (z < 5.5) return 'street:blvd-gomez-morin';
  return fallbackPlaceId;
}

export function createDefaultObjectPositions(): Record<string, UnityPosition> {
  const positions: Record<string, UnityPosition> = {};
  for (const obj of CAMILA_PROBE_OBJECTS) {
    positions[obj.id] = { ...obj.unityPosition };
  }
  return positions;
}

export function createDefaultPhysicalStates(): Record<string, ProbeObjectPhysicalState> {
  return {
    'probe:puddle': { waterLevel: 1.0, sandFillLevel: 0.0 },
    'probe:bucket': { contents: 'empty', waterLevel: 0 },
    'probe:watering-can': { contents: 'empty', waterLevel: 0 },
    'probe:cup': { contents: 'empty', waterLevel: 0 },
    'probe:cat-bowl': { contents: 'empty', waterLevel: 0 },
    'probe:shovel': { contents: 'empty' },
    'probe:sand-pile': { sandFillLevel: 1.0 },
    'probe:blank-wall': { chalkMarks: 0 },
    'probe:trash-bag': { disposedInBin: false },
  };
}

export function isValidObjectPosition(pos: unknown): pos is UnityPosition {
  if (typeof pos !== 'object' || pos === null) return false;
  const p = pos as Partial<UnityPosition>;
  if (
    typeof p.x !== 'number' ||
    typeof p.y !== 'number' ||
    typeof p.z !== 'number' ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y) ||
    !Number.isFinite(p.z)
  ) {
    return false;
  }
  const b = CAMILA_OBJECT_POSITION_BOUNDS;
  return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ && p.y >= b.minY && p.y <= b.maxY;
}

export class CamilaProbeObjectState {
  private readonly filePath: string;
  private positions: Record<string, UnityPosition>;
  private heldByAgent: Record<string, string> = {};
  private physicalStates: Record<string, ProbeObjectPhysicalState> = {};
  private sittingByAgent: Record<string, AgentSittingState> = {};
  private recentChanges: CamilaWorldChangeEvent[] = [];
  private static readonly MAX_RECENT_CHANGES = 10;
  public loadError: string | null = null;

  constructor(filePath: string = DEFAULT_CAMILA_OBJECT_POSITIONS_PATH) {
    this.filePath = resolve(filePath);
    const loaded = this.loadFromDisk();
    this.positions = loaded.positions;
    this.heldByAgent = loaded.heldByAgent;
    this.physicalStates = loaded.physicalStates;
    this.sittingByAgent = loaded.sittingByAgent;
  }

  public getFilePath(): string {
    return this.filePath;
  }

  /** Current Unity position of an object (seed position if never moved). Null for unknown ids. */
  public getPosition(objectId: string): UnityPosition | null {
    const pos = this.positions[objectId];
    return pos ? { ...pos } : null;
  }

  /**
   * Resolves the object's live logical placeId. If the object is still at its
   * seed spot (within 0.5 m), keeps its seed placeId; once moved by Player or
   * Camila, dynamically resolves its real location from its Unity coordinates.
   */
  public getEffectivePlaceId(objectId: string): string | null {
    const def = CAMILA_PROBE_OBJECTS.find((o) => o.id === objectId);
    if (!def) return null;
    const current = this.positions[objectId];
    if (!current) return def.placeId;
    const movedDist = Math.hypot(
      current.x - def.unityPosition.x,
      current.z - def.unityPosition.z
    );
    if (movedDist < 0.5) return def.placeId;
    return resolvePlaceIdForUnityPosition(current, def.placeId);
  }

  public getHeldObjectId(agentId: string): string | null {
    return this.heldByAgent[agentId] ?? null;
  }

  public setHeldObject(agentId: string, objectId: string): boolean {
    if (!Object.prototype.hasOwnProperty.call(this.positions, objectId)) return false;
    this.heldByAgent[agentId] = objectId;
    return true;
  }

  public clearHeldObject(agentId: string): string | null {
    const prev = this.heldByAgent[agentId] ?? null;
    delete this.heldByAgent[agentId];
    return prev;
  }

  public getPhysicalState(objectId: string): ProbeObjectPhysicalState | undefined {
    const s = this.physicalStates[objectId];
    return s ? { ...s } : undefined;
  }

  public setPhysicalState(objectId: string, patch: Partial<ProbeObjectPhysicalState>): ProbeObjectPhysicalState {
    const next: ProbeObjectPhysicalState = {
      ...(this.physicalStates[objectId] ?? {}),
      ...patch,
    };
    this.physicalStates[objectId] = next;
    return { ...next };
  }

  public getAllPhysicalStates(): Record<string, ProbeObjectPhysicalState> {
    const out: Record<string, ProbeObjectPhysicalState> = {};
    for (const [id, st] of Object.entries(this.physicalStates)) {
      out[id] = { ...st };
    }
    return out;
  }

  public getSittingState(agentId: string): AgentSittingState | null {
    const s = this.sittingByAgent[agentId];
    return s ? { ...s } : null;
  }

  public setSittingState(agentId: string, state: AgentSittingState): void {
    this.sittingByAgent[agentId] = { ...state };
  }

  public clearSittingState(agentId: string): AgentSittingState | null {
    const prev = this.sittingByAgent[agentId] ?? null;
    delete this.sittingByAgent[agentId];
    return prev;
  }

  public recordWorldChange(event: CamilaWorldChangeEvent): void {
    this.recentChanges.push(event);
    if (this.recentChanges.length > CamilaProbeObjectState.MAX_RECENT_CHANGES) {
      this.recentChanges.splice(0, this.recentChanges.length - CamilaProbeObjectState.MAX_RECENT_CHANGES);
    }
  }

  public getRecentWorldChanges(limit = 5): readonly CamilaWorldChangeEvent[] {
    return this.recentChanges.slice(-limit);
  }

  /** Snapshot of every object's current position (copies, never live refs). */
  public getAllPositions(): Record<string, UnityPosition> {
    const snapshot: Record<string, UnityPosition> = {};
    for (const [id, pos] of Object.entries(this.positions)) {
      snapshot[id] = { ...pos };
    }
    return snapshot;
  }

  public getData(): CamilaObjectPositionsData {
    return {
      version: CAMILA_OBJECT_POSITIONS_VERSION,
      updatedAt: new Date().toISOString(),
      positions: this.getAllPositions(),
      heldByAgent: { ...this.heldByAgent },
      physicalStates: this.getAllPhysicalStates(),
      sittingByAgent: { ...this.sittingByAgent },
    };
  }

  /**
   * Sets an object's current position. Returns false (no mutation) for
   * unknown ids or invalid / out-of-bounds positions. Does NOT save to disk;
   * call save() to persist.
   */
  public setPosition(objectId: string, position: UnityPosition): boolean {
    if (!Object.prototype.hasOwnProperty.call(this.positions, objectId)) return false;
    if (!isValidObjectPosition(position)) return false;
    this.positions[objectId] = { ...position };
    return true;
  }

  /** Restores every object to its seed position (in-memory only; call save() to persist). */
  public reset(): void {
    this.positions = createDefaultObjectPositions();
    this.heldByAgent = {};
    this.physicalStates = createDefaultPhysicalStates();
    this.sittingByAgent = {};
    this.recentChanges = [];
  }

  private loadFromDisk(): {
    positions: Record<string, UnityPosition>;
    heldByAgent: Record<string, string>;
    physicalStates: Record<string, ProbeObjectPhysicalState>;
    sittingByAgent: Record<string, AgentSittingState>;
  } {
    const defaults = createDefaultObjectPositions();
    const defaultPhysical = createDefaultPhysicalStates();
    if (!existsSync(this.filePath)) {
      return { positions: defaults, heldByAgent: {}, physicalStates: defaultPhysical, sittingByAgent: {} };
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        (parsed as { version?: unknown }).version !== CAMILA_OBJECT_POSITIONS_VERSION ||
        typeof (parsed as { positions?: unknown }).positions !== 'object' ||
        (parsed as { positions?: unknown }).positions === null
      ) {
        this.loadError = 'Object positions file failed validation; started from seed positions (old file untouched).';
        return { positions: defaults, heldByAgent: {}, physicalStates: defaultPhysical, sittingByAgent: {} };
      }
      const saved = (parsed as { positions: Record<string, unknown> }).positions;
      const merged = { ...defaults };
      for (const [id, pos] of Object.entries(saved)) {
        if (Object.prototype.hasOwnProperty.call(merged, id) && isValidObjectPosition(pos)) {
          merged[id] = { ...(pos as UnityPosition) };
        }
      }
      const heldByAgent: Record<string, string> = {};
      const rawHeld = (parsed as { heldByAgent?: unknown }).heldByAgent;
      if (typeof rawHeld === 'object' && rawHeld !== null) {
        for (const [agentId, objId] of Object.entries(rawHeld as Record<string, unknown>)) {
          if (typeof objId === 'string' && Object.prototype.hasOwnProperty.call(merged, objId)) {
            heldByAgent[agentId] = objId;
          }
        }
      }
      const physicalStates: Record<string, ProbeObjectPhysicalState> = { ...defaultPhysical };
      const rawPhys = (parsed as { physicalStates?: unknown }).physicalStates;
      if (typeof rawPhys === 'object' && rawPhys !== null) {
        for (const [objId, st] of Object.entries(rawPhys as Record<string, unknown>)) {
          if (Object.prototype.hasOwnProperty.call(merged, objId) && typeof st === 'object' && st !== null) {
            physicalStates[objId] = { ...(physicalStates[objId] ?? {}), ...(st as ProbeObjectPhysicalState) };
          }
        }
      }
      const sittingByAgent: Record<string, AgentSittingState> = {};
      const rawSit = (parsed as { sittingByAgent?: unknown }).sittingByAgent;
      if (typeof rawSit === 'object' && rawSit !== null) {
        for (const [agentId, st] of Object.entries(rawSit as Record<string, unknown>)) {
          if (typeof st === 'object' && st !== null && typeof (st as AgentSittingState).placeId === 'string') {
            sittingByAgent[agentId] = { ...(st as AgentSittingState) };
          }
        }
      }
      return { positions: merged, heldByAgent, physicalStates, sittingByAgent };
    } catch (err) {
      this.loadError = `Object positions file could not be parsed (${(err as Error).message}); started from seed positions (old file untouched).`;
      return { positions: defaults, heldByAgent: {}, physicalStates: defaultPhysical, sittingByAgent: {} };
    }
  }

  /** Atomic save (temp file + rename in the same directory). */
  public save(): void {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    const serialized = JSON.stringify(this.getData(), null, 2) + '\n';
    const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    try {
      writeFileSync(tempPath, serialized, 'utf-8');
      renameSync(tempPath, this.filePath);
    } catch (writeError) {
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          // Ignore cleanup error to surface the original failure.
        }
      }
      throw new Error(
        `Failed to save Camila object positions to "${this.filePath}": ${(writeError as Error).message}`
      );
    }
  }
}
