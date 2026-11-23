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

export interface CamilaObjectPositionsData {
  readonly version: string;
  readonly updatedAt: string;
  readonly positions: Readonly<Record<string, UnityPosition>>;
}

export function createDefaultObjectPositions(): Record<string, UnityPosition> {
  const positions: Record<string, UnityPosition> = {};
  for (const obj of CAMILA_PROBE_OBJECTS) {
    positions[obj.id] = { ...obj.unityPosition };
  }
  return positions;
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
  public loadError: string | null = null;

  constructor(filePath: string = DEFAULT_CAMILA_OBJECT_POSITIONS_PATH) {
    this.filePath = resolve(filePath);
    this.positions = this.loadFromDisk();
  }

  public getFilePath(): string {
    return this.filePath;
  }

  /** Current Unity position of an object (seed position if never moved). Null for unknown ids. */
  public getPosition(objectId: string): UnityPosition | null {
    const pos = this.positions[objectId];
    return pos ? { ...pos } : null;
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
  }

  private loadFromDisk(): Record<string, UnityPosition> {
    const defaults = createDefaultObjectPositions();
    if (!existsSync(this.filePath)) return defaults;
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
        return defaults;
      }
      const saved = (parsed as { positions: Record<string, unknown> }).positions;
      const merged = { ...defaults };
      for (const [id, pos] of Object.entries(saved)) {
        if (Object.prototype.hasOwnProperty.call(merged, id) && isValidObjectPosition(pos)) {
          merged[id] = { ...(pos as UnityPosition) };
        }
      }
      return merged;
    } catch (err) {
      this.loadError = `Object positions file could not be parsed (${(err as Error).message}); started from seed positions (old file untouched).`;
      return defaults;
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
