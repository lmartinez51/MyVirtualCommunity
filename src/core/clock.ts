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
   * Advances the authoritative World Clock directly to an absolute target instant in epoch milliseconds.
   * Enforces monotonicity: target time must be >= current time.
   *
   * @param targetEpochMs Target instant in epoch milliseconds. Must be a finite number >= current time.
   * @returns Updated World Time in ISO-8601 format.
   */
  public advanceTo(targetEpochMs: number): string {
    if (!Number.isFinite(targetEpochMs)) {
      throw new RangeError(
        `Target time must be a finite number. Received: ${targetEpochMs}`
      );
    }
    if (targetEpochMs < this._epochMs) {
      throw new RangeError(
        `World time monotonicity violation: cannot advance backward from ${new Date(this._epochMs).toISOString()} to ${new Date(targetEpochMs).toISOString()}`
      );
    }

    this._epochMs = targetEpochMs;
    return this.getTime();
  }

  /**
   * Restores authoritative World Time from a persisted ISO-8601 timestamp.
   * In production, World Time is monotonic and cannot move backward.
   * allowRegression must be explicitly set to true if used in test fixture resets.
   *
   * @param isoTime Persisted ISO-8601 timestamp string.
   * @param options Options permitting backward reset in test environments.
   */
  public restore(isoTime: string, options?: { allowRegression?: boolean }): void {
    if (typeof isoTime !== 'string' || isoTime.trim() === '') {
      throw new Error(`Invalid ISO-8601 timestamp string: "${isoTime}"`);
    }

    const parsed = Date.parse(isoTime);
    if (Number.isNaN(parsed)) {
      throw new Error(`Failed to parse ISO-8601 timestamp: "${isoTime}"`);
    }

    if (parsed < this._epochMs && !options?.allowRegression) {
      throw new RangeError(
        `World time monotonicity violation: cannot regress World Time from ${new Date(this._epochMs).toISOString()} to ${new Date(parsed).toISOString()} without explicit allowRegression`
      );
    }

    this._epochMs = parsed;
  }
}
