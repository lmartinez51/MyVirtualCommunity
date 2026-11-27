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
 * Experiential learning v1 adds two more, factual-only layers:
 * 4. outcomes — a ledger of counts per (actionType, targetObjectId):
 *    how many times each action was attempted and how it ended
 *    (executed / rejected / failed), with the last outcome code.
 * 5. lessons — one-line history distilled from the ledger: when the same
 *    (action, target, outcome, code) repeats 3 times, the fact is written
 *    down once. Lessons are history she can read, never orders: no
 *    prescriptive language, no destinations, no instructions.
 *
 * Loading is tolerant: a missing file yields an empty notebook; a corrupt
 * file yields an empty notebook plus `loadError` (never a crash, never a
 * corrupted WorldState). Saving is atomic (temp file + rename), like
 * LocalFilePersistence. A v1 file (no outcomes/lessons) migrates on load:
 * its diary / mentalMap / hypotheses are kept and the new layers start empty.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const CAMILA_NOTEBOOK_VERSION = 'camila-notebook-v2';
export const CAMILA_NOTEBOOK_VERSION_V1 = 'camila-notebook-v1';
export const DEFAULT_CAMILA_NOTEBOOK_PATH = resolve(process.cwd(), 'data', 'camila-notebook.json');

export const CAMILA_NOTEBOOK_MAX_DIARY = 100;
export const CAMILA_NOTEBOOK_MAX_HYPOTHESES = 20;
export const CAMILA_NOTEBOOK_MAX_LESSONS = 20;
/** Same (action, target, outcome, code) must repeat this many times before a lesson is distilled. */
export const CAMILA_LESSON_THRESHOLD = 3;

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

/** Terminal outcome of one recorded attempt (cycle decision or Unity report). */
export type CamilaOutcome = 'executed' | 'rejected' | 'failed';

/**
 * Outcome ledger entry for one (actionType, targetObjectId) pair.
 * `targetObjectId` is '' when the action has no object target (e.g. move_to_place).
 * `attempted` counts every outcome event recorded for the pair (a dispatched
 * interaction plus its later Unity report count as two events); the executed /
 * rejected / failed buckets split those events by terminal outcome.
 */
export interface CamilaOutcomeRecord {
  readonly key: string;
  readonly actionType: string;
  readonly targetObjectId: string;
  readonly attempted: number;
  readonly executed: number;
  readonly rejected: number;
  readonly failed: number;
  readonly lastOutcome: CamilaOutcome;
  readonly lastCode: string;
  readonly lastAt: string;
  readonly lastPlaceId?: string;
  /**
   * Consecutive attempts ending now with the same (outcome, code).
   * Resets to 1 whenever the outcome or the code changes. Drives lesson
   * distillation (a lesson is written when this reaches CAMILA_LESSON_THRESHOLD).
   */
  readonly sameOutcomeStreak: number;
}

/**
 * One distilled lesson: a factual history line, never an instruction.
 * `sourceKey` is `${actionType}|${targetObjectId}|${outcome}|${code}` and
 * guarantees the same fact is never written twice.
 */
export interface CamilaLesson {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly sourceKey: string;
}

export interface CamilaNotebookData {
  readonly version: string;
  readonly agentId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly diary: readonly CamilaDiaryEntry[];
  readonly mentalMap: readonly CamilaMentalMapEntry[];
  readonly hypotheses: readonly CamilaHypothesis[];
  readonly outcomes: readonly CamilaOutcomeRecord[];
  readonly lessons: readonly CamilaLesson[];
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
    outcomes: [],
    lessons: [],
  };
}

export function validateCamilaNotebookData(parsed: unknown): parsed is CamilaNotebookData {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const d = parsed as Partial<CamilaNotebookData>;
  return (
    (d.version === CAMILA_NOTEBOOK_VERSION || d.version === CAMILA_NOTEBOOK_VERSION_V1) &&
    d.agentId === 'agent:camila-npc' &&
    Array.isArray(d.diary) &&
    Array.isArray(d.mentalMap) &&
    Array.isArray(d.hypotheses)
  );
}

function isValidOutcomeRecord(value: unknown): value is CamilaOutcomeRecord {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Partial<CamilaOutcomeRecord>;
  return (
    typeof o.key === 'string' &&
    typeof o.actionType === 'string' &&
    typeof o.targetObjectId === 'string' &&
    typeof o.attempted === 'number' &&
    typeof o.executed === 'number' &&
    typeof o.rejected === 'number' &&
    typeof o.failed === 'number' &&
    (o.lastOutcome === 'executed' || o.lastOutcome === 'rejected' || o.lastOutcome === 'failed') &&
    typeof o.lastCode === 'string' &&
    typeof o.lastAt === 'string' &&
    typeof o.sameOutcomeStreak === 'number'
  );
}

function isValidLesson(value: unknown): value is CamilaLesson {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Partial<CamilaLesson>;
  return (
    typeof l.id === 'string' && typeof l.text === 'string' &&
    typeof l.createdAt === 'string' && typeof l.sourceKey === 'string'
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
      // v1 migration: a v1 file has no outcomes/lessons — keep its diary /
      // mentalMap / hypotheses and start the new layers empty. Malformed
      // outcome/lesson entries are dropped, never fatal.
      const partial = parsed as Partial<CamilaNotebookData>;
      return {
        ...parsed,
        version: CAMILA_NOTEBOOK_VERSION,
        outcomes: Array.isArray(partial.outcomes)
          ? partial.outcomes.filter(isValidOutcomeRecord)
          : [],
        lessons: Array.isArray(partial.lessons)
          ? partial.lessons.filter(isValidLesson)
          : [],
      };
    } catch (err) {
      this.loadError = `Notebook file could not be parsed (${(err as Error).message}); started fresh (old file untouched).`;
      return createEmptyCamilaNotebook();
    }
  }

  public getOutcomes(): readonly CamilaOutcomeRecord[] {
    return this.data.outcomes;
  }

  public getLessons(): readonly CamilaLesson[] {
    return this.data.lessons;
  }

  public getOutcome(key: string): CamilaOutcomeRecord | undefined {
    return this.data.outcomes.find((o) => o.key === key);
  }

  /**
   * Records one terminal outcome event for an (actionType, targetObjectId)
   * pair and distills a lesson when the same (outcome, code) repeats
   * CAMILA_LESSON_THRESHOLD times in a row. Counts only — adds no diary
   * line. Callers save afterwards; this method itself never touches disk.
   */
  public recordOutcome(input: {
    actionType: string;
    targetObjectId?: string;
    outcome: CamilaOutcome;
    code: string;
    at: string;
    placeId?: string;
  }): CamilaOutcomeRecord {
    const target = input.targetObjectId ?? '';
    const key = `${input.actionType}|${target}`;
    const existing = this.data.outcomes.find((o) => o.key === key);
    const streak =
      existing && existing.lastOutcome === input.outcome && existing.lastCode === input.code
        ? existing.sameOutcomeStreak + 1
        : 1;
    const record: CamilaOutcomeRecord = {
      key,
      actionType: input.actionType,
      targetObjectId: target,
      attempted: (existing?.attempted ?? 0) + 1,
      executed: (existing?.executed ?? 0) + (input.outcome === 'executed' ? 1 : 0),
      rejected: (existing?.rejected ?? 0) + (input.outcome === 'rejected' ? 1 : 0),
      failed: (existing?.failed ?? 0) + (input.outcome === 'failed' ? 1 : 0),
      lastOutcome: input.outcome,
      lastCode: input.code,
      lastAt: input.at,
      lastPlaceId: input.placeId ?? existing?.lastPlaceId,
      sameOutcomeStreak: streak,
    };
    this.data = {
      ...this.data,
      updatedAt: input.at,
      outcomes: [...this.data.outcomes.filter((o) => o.key !== key), record],
    };
    if (streak === CAMILA_LESSON_THRESHOLD) {
      this.maybeAddLesson(record, input.at);
    }
    return record;
  }

  /**
   * Distills one factual lesson from a repeated outcome. The text states
   * only what happened, 3 times, with the terminal code — never what she
   * should do next (no "debes", "no hagas", "prefiere", "ve a", no
   * destinations, no instructions). Deduplicated by sourceKey, so the same
   * fact is never written twice.
   */
  private maybeAddLesson(record: CamilaOutcomeRecord, at: string): void {
    const sourceKey = `${record.actionType}|${record.targetObjectId}|${record.lastOutcome}|${record.lastCode}`;
    if (this.data.lessons.some((l) => l.sourceKey === sourceKey)) return;
    const phrase =
      record.lastOutcome === 'executed'
        ? 'se ejecutaron'
        : record.lastOutcome === 'rejected'
          ? 'fueron rechazadas'
          : 'fallaron';
    // 'cognition' / 'unknown' mean no world action was ever decided (the
    // provider failed or the proposal was unparseable): say so plainly.
    const attempted =
      record.actionType === 'cognition' || record.actionType === 'unknown'
        ? 'decidir qué hacer'
        : `${record.actionType}${record.targetObjectId ? ` sobre ${record.targetObjectId}` : ''}`;
    const text = `Intenté ${attempted} 3 veces y las 3 ${phrase} (${record.lastCode}).`;
    const lesson: CamilaLesson = {
      id: `lesson:${sourceKey}`,
      text,
      createdAt: at,
      sourceKey,
    };
    this.data = {
      ...this.data,
      updatedAt: at,
      lessons: [...this.data.lessons, lesson].slice(-CAMILA_NOTEBOOK_MAX_LESSONS),
    };
  }

  /**
   * Short factual excerpt sent to the model each cycle.
   * Compacts diary lines to their first factual action/observation clause so
   * the model remembers WHAT happened without echoing its own verbal catchphrases.
   * Lessons (up to 5, newest) come after the mental-map line and before the
   * diary: history she can read, not orders.
   */
  public toExcerpt(maxDiaryEntries = 8, maxHypotheses = 5, maxLessons = 5): string {
    const diary = this.data.diary.slice(-maxDiaryEntries);
    const open = this.data.hypotheses.filter((h) => h.status === 'open').slice(-maxHypotheses);
    const lessons = this.data.lessons.slice(-maxLessons);
    const lines: string[] = [];
    if (diary.length === 0 && open.length === 0 && this.data.mentalMap.length === 0 && lessons.length === 0) {
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
    for (const l of lessons) lines.push(`Lección: ${l.text}`);
    for (const e of diary) {
      const compact = this.compactDiaryLine(e.text);
      lines.push(`- [${e.timestamp}] ${compact}`);
    }
    for (const h of open) lines.push(`Hipótesis abierta: ${h.text}`);
    return lines.join('\n');
  }

  private compactDiaryLine(text: string): string {
    const trimmed = text.trim();
    // Keep only the concise factual head (before verbose reasoning sentences) to prevent self-echoing catchphrases.
    const dotIdx = trimmed.indexOf('. ');
    if (dotIdx > 0 && dotIdx <= 115) {
      return trimmed.slice(0, dotIdx + 1);
    }
    return trimmed.length > 115 ? `${trimmed.slice(0, 112)}...` : trimmed;
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

  /**
   * Marks specific object IDs as seen/explored at a place without incrementing the visit count.
   */
  public recordObjectsSeen(placeId: string, objectIds: readonly string[], timestamp: string): void {
    if (objectIds.length === 0) return;
    const existing = this.data.mentalMap.find((m) => m.placeId === placeId);
    if (!existing) {
      this.recordVisit(placeId, timestamp, [...objectIds]);
      return;
    }
    const merged = new Set<string>(existing.objectIdsSeen);
    let added = false;
    for (const id of objectIds) {
      if (!merged.has(id)) {
        merged.add(id);
        added = true;
      }
    }
    if (!added) return;
    this.data = {
      ...this.data,
      updatedAt: timestamp,
      mentalMap: this.data.mentalMap.map((m) =>
        m.placeId === placeId ? { ...m, objectIdsSeen: [...merged] } : m
      ),
    };
  }

  public addHypothesis(text: string, timestamp: string): CamilaHypothesis {
    const trimmed = text.trim();
    const existing = this.findDuplicateOpenHypothesis(trimmed);
    if (existing) {
      return existing;
    }
    this.hypothesisCounter += 1;
    const hypothesis: CamilaHypothesis = {
      id: `hyp:${Date.now()}-${this.hypothesisCounter}`,
      text: trimmed,
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

  /**
   * Resolves open hypotheses whose text matches at least `minMatches` of the given
   * keywords once Camila physically tests them. Never overwrites already resolved hypotheses.
   */
  public resolveMatchingHypotheses(
    keywords: readonly string[],
    status: 'confirmed' | 'refuted',
    timestamp: string,
    minMatches?: number
  ): number {
    const normalizedKeys = [
      ...new Set(keywords.map((k) => this.normalizeForDedup(k)).filter((k) => k.length >= 3)),
    ];
    if (normalizedKeys.length === 0) return 0;

    const threshold =
      minMatches !== undefined
        ? Math.max(1, Math.min(minMatches, normalizedKeys.length))
        : normalizedKeys.length >= 2
          ? 2
          : 1;

    let resolvedCount = 0;
    const updated = this.data.hypotheses.map((h) => {
      if (h.status !== 'open') return h;
      const norm = this.normalizeForDedup(h.text);
      let hits = 0;
      for (const kw of normalizedKeys) {
        if (norm.includes(kw)) hits += 1;
      }
      if (hits >= threshold) {
        resolvedCount += 1;
        return { ...h, status };
      }
      return h;
    });

    if (resolvedCount > 0) {
      this.data = {
        ...this.data,
        updatedAt: timestamp,
        hypotheses: updated,
      };
    }
    return resolvedCount;
  }

  /**
   * Surgically refutes ONLY open hypotheses that mention ALL required terms
   * (e.g. both the held tool AND the target AND the failed action concept),
   * preventing a failed action with one tool from refuting valid hypotheses about another material.
   */
  public refuteSpecificHypotheses(requiredTerms: readonly string[], timestamp: string): number {
    const terms = [
      ...new Set(requiredTerms.map((k) => this.normalizeForDedup(k)).filter((k) => k.length >= 3)),
    ];
    if (terms.length < 2) return 0;
    return this.resolveMatchingHypotheses(terms, 'refuted', timestamp, terms.length);
  }

  private findDuplicateOpenHypothesis(candidateText: string): CamilaHypothesis | null {
    const candidateNorm = this.normalizeForDedup(candidateText);
    if (!candidateNorm) return null;
    const candidateTokens = new Set(candidateNorm.split(' ').filter((w) => w.length >= 3));

    for (const h of this.data.hypotheses) {
      if (h.status !== 'open') continue;
      const existingNorm = this.normalizeForDedup(h.text);
      if (existingNorm === candidateNorm) return h;

      if (candidateTokens.size >= 4) {
        const existingTokens = new Set(existingNorm.split(' ').filter((w) => w.length >= 3));
        let intersection = 0;
        for (const t of candidateTokens) {
          if (existingTokens.has(t)) intersection += 1;
        }
        const union = candidateTokens.size + existingTokens.size - intersection;
        if (union > 0 && intersection / union >= 0.72) {
          return h;
        }
      }
    }
    return null;
  }

  private normalizeForDedup(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
