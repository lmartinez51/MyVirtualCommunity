/**
 * RealTimeSource abstraction (Milestone Phase A).
 *
 * Encapsulates physical real-world clock access, isolating the host operating system clock
 * from the authoritative World Core and providing deterministic temporal control for tests.
 */

export interface RealTimeSource {
  /**
   * Returns the current real-world instant in epoch milliseconds.
   * Must return a finite, non-negative number.
   */
  now(): number;
}

/**
 * Production RealTimeSource backed by the host operating system clock.
 */
export class SystemRealTimeSource implements RealTimeSource {
  public now(): number {
    return Date.now();
  }
}

/**
 * Deterministic MockRealTimeSource for hermetic testing.
 * Allows setting, advancing, and simulating physical time without real-world delays.
 */
export class MockRealTimeSource implements RealTimeSource {
  private currentEpochMs: number;

  constructor(initialEpochMs: number = Date.now()) {
    if (!Number.isFinite(initialEpochMs) || initialEpochMs < 0) {
      throw new RangeError(
        `MockRealTimeSource initial time must be a finite, non-negative number. Received: ${initialEpochMs}`
      );
    }
    this.currentEpochMs = initialEpochMs;
  }

  public now(): number {
    return this.currentEpochMs;
  }

  public setTime(epochMs: number): void {
    if (!Number.isFinite(epochMs) || epochMs < 0) {
      throw new RangeError(
        `MockRealTimeSource time must be a finite, non-negative number. Received: ${epochMs}`
      );
    }
    this.currentEpochMs = epochMs;
  }

  public advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError(
        `MockRealTimeSource advance duration must be a finite, non-negative number. Received: ${ms}`
      );
    }
    this.currentEpochMs += ms;
  }
}
