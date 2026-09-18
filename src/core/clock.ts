/**
 * WorldClock is the authoritative source for logical World Time.
 *
 * It represents World Time as an ISO-8601 string and provides methods
 * for reading, advancing, and restoring time. No other component may maintain
 * an independent world clock.
 */
export class WorldClock {
  private _epochMs: number;

  constructor(initialIsoTime?: string) {
    if (initialIsoTime !== undefined) {
      const parsed = Date.parse(initialIsoTime);
      if (typeof initialIsoTime !== 'string' || Number.isNaN(parsed)) {
        throw new Error(`Invalid initial ISO-8601 timestamp: "${initialIsoTime}"`);
      }
      this._epochMs = parsed;
    } else {
      this._epochMs = Date.now();
    }
  }

  /**
   * Factory method to create a new WorldClock instance.
   */
  public static create(initialTime?: string | Date): WorldClock {
    if (initialTime instanceof Date) {
      return new WorldClock(initialTime.toISOString());
    }
    return new WorldClock(initialTime);
  }

  /**
   * Returns current authoritative World Time in ISO-8601 format.
   */
  public getTime(): string {
    return new Date(this._epochMs).toISOString();
  }

  /**
   * Returns current authoritative World Time in epoch milliseconds.
   */
  public getEpochMs(): number {
    return this._epochMs;
  }

  /**
   * Advances the authoritative World Clock by a specified duration in milliseconds.
   *
   * @param milliseconds Duration in ms. Must be a finite, non-negative number.
   * @returns Updated World Time in ISO-8601 format.
   */
  public advance(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError(
        `Advance duration must be a finite, non-negative number. Received: ${milliseconds}`
      );
    }

    this._epochMs += milliseconds;
    return this.getTime();
  }

  /**
   * Restores authoritative World Time from a persisted ISO-8601 timestamp.
   *
   * @param isoTime Persisted ISO-8601 timestamp string.
   */
  public restore(isoTime: string): void {
    if (typeof isoTime !== 'string' || isoTime.trim() === '') {
      throw new Error(`Invalid ISO-8601 timestamp string: "${isoTime}"`);
    }

    const parsed = Date.parse(isoTime);
    if (Number.isNaN(parsed)) {
      throw new Error(`Failed to parse ISO-8601 timestamp: "${isoTime}"`);
    }

    this._epochMs = parsed;
  }
}
