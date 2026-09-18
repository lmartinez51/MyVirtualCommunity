/**
 * Concrete domain rules for the "Having Coffee" player activity (Milestone 9).
 *
 * NOTE: This module is focused exclusively on the concrete "having-coffee" activity.
 * It does NOT introduce a generic Activity framework, registry, scheduler, or state machine.
 */

export const HAVING_COFFEE_ACTIVITY_ID = 'having-coffee' as const;
export const HAVING_COFFEE_DURATION_MINUTES = 15;
export const HAVING_COFFEE_DURATION_MS = HAVING_COFFEE_DURATION_MINUTES * 60 * 1000;

/**
 * Calculates the exact theoretical completion timestamp for a "Having Coffee" activity.
 *
 * Invariant: completionTime === startedAt + 15 world minutes.
 * Discovery of completion may occur late, but the completion timestamp is invariant.
 */
export function calculateHavingCoffeeCompletionTime(startedAt: string): string {
  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs)) {
    throw new Error(`Invalid startedAt timestamp: "${startedAt}"`);
  }
  return new Date(startMs + HAVING_COFFEE_DURATION_MS).toISOString();
}

/**
 * Evaluates whether a "Having Coffee" activity that started at `startedAt`
 * has reached or passed its completion boundary under `currentWorldTime`.
 */
export function isHavingCoffeeCompleted(startedAt: string, currentWorldTime: string): boolean {
  const startMs = Date.parse(startedAt);
  const currentMs = Date.parse(currentWorldTime);
  return currentMs >= startMs + HAVING_COFFEE_DURATION_MS;
}
