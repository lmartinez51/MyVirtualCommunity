import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  WorldState,
  validateWorldState,
  validateWorldStateV11,
  migrateWorldStateV11ToV12,
  validateWorldStateV12,
  migrateWorldStateV12ToV13,
  validateWorldStateV13,
  migrateWorldStateV13ToV14,
  validateWorldStateV14,
  migrateWorldStateV14ToV15,
  WorldStateV15,
  validateWorldStateV15,
  migrateWorldStateV15ToV16,
  WorldStateV16,
  validateWorldStateV16,
  migrateWorldStateV16ToV17,
  WorldStateV17,
  validateWorldStateV17,
  migrateWorldStateV17ToV18,
} from '../core/world-state.js';

export const DEFAULT_PERSISTENCE_PATH = resolve(process.cwd(), 'data', 'world-state.json');

/**
 * Local file-based persistence for authoritative WorldState.
 *
 * Implements atomic saving (temporary file write + rename) and strict
 * validation on load to prevent silent corruption or data loss.
 */
export class LocalFilePersistence {
  private readonly filePath: string;

  constructor(filePath: string = DEFAULT_PERSISTENCE_PATH) {
    this.filePath = resolve(filePath);
  }

  /**
   * Returns the absolute path to the persistence file.
   */
  public getFilePath(): string {
    return this.filePath;
  }

  /**
   * Checks whether the persistence file exists on disk.
   */
  public exists(): boolean {
    return existsSync(this.filePath);
  }

  /**
   * Loads and validates the persisted WorldState.
   *
   * @returns WorldState if found, or null if no persisted world exists.
   * @throws Error if the file exists but contains invalid JSON or violates the WorldState schema.
   */
  public load(): WorldState | null {
    if (!this.exists()) {
      return null;
    }

    let rawContent: string;
    try {
      rawContent = readFileSync(this.filePath, 'utf-8');
    } catch (readError) {
      throw new Error(
        `Failed to read persisted world state at "${this.filePath}": ${(readError as Error).message}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError) {
      throw new Error(
        `Failed to parse JSON in persisted world state at "${this.filePath}": ${(parseError as Error).message}`
      );
    }

    const rawVersion = (parsed as { version?: unknown })?.version;

    // Schema Version 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 18 Migration Path
    if (rawVersion === 11) {
      validateWorldStateV11(parsed);
      const v12 = migrateWorldStateV11ToV12(parsed);
      validateWorldStateV12(v12);
      const v13 = migrateWorldStateV12ToV13(v12);
      validateWorldStateV13(v13);
      const v14 = migrateWorldStateV13ToV14(v13);
      validateWorldStateV14(v14);
      const v15 = migrateWorldStateV14ToV15(v14);
      validateWorldStateV15(v15);
      const v16 = migrateWorldStateV15ToV16(v15);
      validateWorldStateV16(v16);
      const v17 = migrateWorldStateV16ToV17(v16);
      validateWorldStateV17(v17);
      const v18 = migrateWorldStateV17ToV18(v17);
      validateWorldState(v18);
      this.save(v18);
      return v18;
    }

    // Schema Version 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 18 Migration Path
    if (rawVersion === 12) {
      validateWorldStateV12(parsed);
      const v13 = migrateWorldStateV12ToV13(parsed);
      validateWorldStateV13(v13);
      const v14 = migrateWorldStateV13ToV14(v13);
      validateWorldStateV14(v14);
      const v15 = migrateWorldStateV14ToV15(v14);
      validateWorldStateV15(v15);
      const v16 = migrateWorldStateV15ToV16(v15);
      validateWorldStateV16(v16);
      const v17 = migrateWorldStateV16ToV17(v16);
      validateWorldStateV17(v17);
      const v18 = migrateWorldStateV17ToV18(v17);
      validateWorldState(v18);
      this.save(v18);
      return v18;
    }

    // Schema Version 13 -> 14 -> 15 -> 16 -> 17 -> 18 Migration Path
    if (rawVersion === 13) {
      validateWorldStateV13(parsed);
      const v14 = migrateWorldStateV13ToV14(parsed);
      validateWorldStateV14(v14);
      const v15 = migrateWorldStateV14ToV15(v14);
      validateWorldStateV15(v15);
      const v16 = migrateWorldStateV15ToV16(v15);
      validateWorldStateV16(v16);
      const v17 = migrateWorldStateV16ToV17(v16);
      validateWorldStateV17(v17);
      const v18 = migrateWorldStateV17ToV18(v17);
      validateWorldState(v18);
      this.save(v18);
      return v18;
    }

    // Schema Version 14 -> 15 -> 16 -> 17 -> 18 Migration Path
    if (rawVersion === 14) {
      validateWorldStateV14(parsed);
      const v15 = migrateWorldStateV14ToV15(parsed);
      validateWorldStateV15(v15);
      const v16 = migrateWorldStateV15ToV16(v15);
      validateWorldStateV16(v16);
      const v17 = migrateWorldStateV16ToV17(v16);
      validateWorldStateV17(v17);
      const v18 = migrateWorldStateV17ToV18(v17);
      validateWorldState(v18);
      this.save(v18);
      return v18;
    }

    // Schema Version 15 -> 16 -> 17 -> 18 Migration Path
    if (rawVersion === 15) {
      validateWorldStateV15(parsed);
      const v16 = migrateWorldStateV15ToV16(parsed as WorldStateV15);
      validateWorldStateV16(v16);
      const v17 = migrateWorldStateV16ToV17(v16);
      validateWorldStateV17(v17);
      const v18 = migrateWorldStateV17ToV18(v17);
      validateWorldState(v18);
      this.save(v18);
      return v18;
    }

    // Schema Version 16 -> 17 -> 18 Migration Path
    if (rawVersion === 16) {
      validateWorldStateV16(parsed);
      const v17 = migrateWorldStateV16ToV17(parsed as WorldStateV16);
      validateWorldStateV17(v17);
      const v18 = migrateWorldStateV17ToV18(v17);
      validateWorldState(v18);
      this.save(v18);
      return v18;
    }

    // Schema Version 17 -> 18 Migration Path
    if (rawVersion === 17) {
      validateWorldStateV17(parsed);
      const v18 = migrateWorldStateV17ToV18(parsed as WorldStateV17);
      validateWorldState(v18);
      this.save(v18);
      return v18;
    }

    // Schema Version 18 Direct Validation Path
    validateWorldState(parsed);

    return parsed;
  }

  /**
   * Saves WorldState atomically using a temporary file rename in the same directory.
   *
   * @param state Valid WorldState to persist.
   * @throws Error if validation or filesystem operations fail.
   */
  public save(state: WorldState): void {
    validateWorldState(state);

    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });

    const serialized = JSON.stringify(state, null, 2) + '\n';
    const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

    try {
      writeFileSync(tempPath, serialized, 'utf-8');
      renameSync(tempPath, this.filePath);
    } catch (writeError) {
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          // Ignore cleanup error to surface original failure
        }
      }
      throw new Error(
        `Failed to save world state to "${this.filePath}": ${(writeError as Error).message}`
      );
    }
  }

  /**
   * Removes the persistence file if it exists. Useful for test cleanup.
   */
  public clear(): void {
    if (this.exists()) {
      unlinkSync(this.filePath);
    }
  }
}
