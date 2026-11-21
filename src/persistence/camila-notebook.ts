/**
 * Milestone 94: Camila's notebook — her own persistent memory.
 *
 * Separate from the authoritative WorldState (v19, data/world-state.json)
 * and from the volatile NpcMemoryStore: this is a JSON file of her own,
 * data/camila-notebook.json, read at game start and saved after each cycle
 * / on exit. It is what gives Muse Spark 1.3 continuity across sessions,
 * since the model itself has no memory.
 *
 * Three layers:
 * 1. diary — timestamped entries: what she did / saw, in her voice.
 * 2. mentalMap — places visited and what was there (incl. probe objects).
 * 3. hypotheses — guesses to test later ("the ball belongs with the goal").
 *
 * Loading is tolerant: a missing file yields an empty notebook; a corrupt
 * file yields an empty notebook plus `loadError` (never a crash, never a
 * corrupted WorldState). Saving is atomic (temp file + rename), like
 * LocalFilePersistence.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const CAMILA_NOTEBOOK_VERSION = 'camila-notebook-v1';
export const DEFAULT_CAMILA_NOTEBOOK_PATH = resolve(process.cwd(), 'data', 'camila-notebook.json');

export const CAMILA_NOTEBOOK_MAX_DIARY = 100;
export const CAMILA_NOTEBOOK_MAX_HYPOTHESES = 20;

export interface CamilaDiaryEntry {
  readonly timestamp: string;
  readonly text: string;
  readonly placeId?: string;
}

export interface CamilaMentalMapEntry {
  readonly placeId: string;
  readonly firstVisitedAt: string;
  readonly lastVisitedAt: string;
  readonly visits: number;
  readonly notes: readonly string[];
  readonly objectIdsSeen: readonly string[];
}

export interface CamilaHypothesis {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly status: 'open' | 'confirmed' | 'refuted';
}

export interface CamilaNotebookData {
  readonly version: string;
  readonly agentId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly diary: readonly CamilaDiaryEntry[];
  readonly mentalMap: readonly CamilaMentalMapEntry[];
  readonly hypotheses: readonly CamilaHypothesis[];
}

export function createEmptyCamilaNotebook(now: string = new Date().toISOString()): CamilaNotebookData {
  return {
    version: CAMILA_NOTEBOOK_VERSION,
    agentId: 'agent:camila-npc',
    createdAt: now,
    updatedAt: now,
    diary: [],
    mentalMap: [],
    hypotheses: [],
  };
}

export function validateCamilaNotebookData(parsed: unknown): parsed is CamilaNotebookData {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const d = parsed as Partial<CamilaNotebookData>;
  return (
    d.version === CAMILA_NOTEBOOK_VERSION &&
    d.agentId === 'agent:camila-npc' &&
    Array.isArray(d.diary) &&
    Array.isArray(d.mentalMap) &&
    Array.isArray(d.hypotheses)
  );
}

export class CamilaNotebook {
  private readonly filePath: string;
  private data: CamilaNotebookData;
  private hypothesisCounter = 0;
  public loadError: string | null = null;

  constructor(filePath: string = DEFAULT_CAMILA_NOTEBOOK_PATH) {
    this.filePath = resolve(filePath);
    this.data = this.loadFromDisk();
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public getData(): CamilaNotebookData {
    return this.data;
  }

  public exists(): boolean {
    return existsSync(this.filePath);
  }

  private loadFromDisk(): CamilaNotebookData {
    if (!existsSync(this.filePath)) return createEmptyCamilaNotebook();
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      if (!validateCamilaNotebookData(parsed)) {
        this.loadError = 'Notebook file failed validation; started fresh (old file untouched).';
        return createEmptyCamilaNotebook();
      }
      this.hypothesisCounter = parsed.hypotheses.length;
      return parsed;
    } catch (err) {
      this.loadError = `Notebook file could not be parsed (${(err as Error).message}); started fresh (old file untouched).`;
      return createEmptyCamilaNotebook();
    }
  }

  /** Short text excerpt sent to the model each cycle (newest first). */
  public toExcerpt(maxDiaryEntries = 10, maxHypotheses = 5): string {
    const diary = this.data.diary.slice(-maxDiaryEntries);
    const open = this.data.hypotheses.filter((h) => h.status === 'open').slice(-maxHypotheses);
    const lines: string[] = [];
    if (diary.length === 0 && open.length === 0 && this.data.mentalMap.length === 0) {
      return 'Libreta vacía todavía: es tu primera exploración.';
    }
    if (this.data.mentalMap.length > 0) {
      lines.push(
        'Lugares visitados: ' +
          this.data.mentalMap
            .map((m) => `${m.placeId} (${m.visits}x${m.objectIdsSeen.length ? `, viste: ${m.objectIdsSeen.join(', ')}` : ''})`)
            .join('; ')
      );
    }
    for (const e of diary) lines.push(`- [${e.timestamp}] ${e.text}`);
    for (const h of open) lines.push(`Hipótesis abierta: ${h.text}`);
    return lines.join('\n');
  }

  public addDiaryEntry(text: string, timestamp: string, placeId?: string): void {
    const diary = [...this.data.diary, { timestamp, text, placeId }];
    this.data = {
      ...this.data,
      updatedAt: timestamp,
      diary: diary.slice(-CAMILA_NOTEBOOK_MAX_DIARY),
    };
  }

  public recordVisit(placeId: string, timestamp: string, objectIdsSeen: string[] = []): void {
    const existing = this.data.mentalMap.find((m) => m.placeId === placeId);
    const seen = new Set<string>(existing?.objectIdsSeen ?? []);
    for (const id of objectIdsSeen) seen.add(id);
    const entry: CamilaMentalMapEntry = existing
      ? {
          ...existing,
          lastVisitedAt: timestamp,
          visits: existing.visits + 1,
          objectIdsSeen: [...seen],
        }
      : {
          placeId,
          firstVisitedAt: timestamp,
          lastVisitedAt: timestamp,
          visits: 1,
          notes: [],
          objectIdsSeen: [...seen],
        };
    this.data = {
      ...this.data,
      updatedAt: timestamp,
      mentalMap: [
        ...this.data.mentalMap.filter((m) => m.placeId !== placeId),
        entry,
      ],
    };
  }

  public addNoteToPlace(placeId: string, note: string, timestamp: string): void {
    const existing = this.data.mentalMap.find((m) => m.placeId === placeId);
    if (!existing) {
      this.recordVisit(placeId, timestamp);
    }
    const target = this.data.mentalMap.find((m) => m.placeId === placeId);
    if (!target) return;
    this.data = {
      ...this.data,
      updatedAt: timestamp,
      mentalMap: this.data.mentalMap.map((m) =>
        m.placeId === placeId ? { ...m, notes: [...m.notes, note] } : m
      ),
    };
  }

  public addHypothesis(text: string, timestamp: string): CamilaHypothesis {
    this.hypothesisCounter += 1;
    const hypothesis: CamilaHypothesis = {
      id: `hyp:${Date.now()}-${this.hypothesisCounter}`,
      text,
      createdAt: timestamp,
      status: 'open',
    };
    this.data = {
      ...this.data,
      updatedAt: timestamp,
      hypotheses: [...this.data.hypotheses, hypothesis].slice(-CAMILA_NOTEBOOK_MAX_HYPOTHESES),
    };
    return hypothesis;
  }

  public resolveHypothesis(id: string, status: 'confirmed' | 'refuted', timestamp: string): void {
    this.data = {
      ...this.data,
      updatedAt: timestamp,
      hypotheses: this.data.hypotheses.map((h) =>
        h.id === id ? { ...h, status } : h
      ),
    };
  }

  /** Atomic save (temp file + rename in the same directory). */
  public save(): void {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    const serialized = JSON.stringify(this.data, null, 2) + '\n';
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
        `Failed to save Camila notebook to "${this.filePath}": ${(writeError as Error).message}`
      );
    }
  }

  public clear(): void {
    if (this.exists()) unlinkSync(this.filePath);
    this.data = createEmptyCamilaNotebook();
    this.loadError = null;
  }
}
