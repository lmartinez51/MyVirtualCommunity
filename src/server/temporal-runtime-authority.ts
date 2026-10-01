import { WorldSessionController, TemporalReconciliationResult } from './session-controller.js';
import { RealTimeSource, SystemRealTimeSource } from './time-source.js';

export interface TemporalRuntimeAuthorityOptions {
  controller: WorldSessionController;
  timeSource?: RealTimeSource;
  cadenceMs?: number; // Default: 1000ms
  silent?: boolean;
}

export interface TemporalAuthorityStatus {
  running: boolean;
  cadenceMs: number;
  lastObservedRealMs: number | null;
  lastReconciliationTime: string | null;
  rollbackDetected: boolean;
  rollbackCount: number;
}

/**
 * TemporalRuntimeAuthority (Phase A).
 *
 * Server-side temporal authority responsible for:
 * 1. Observing external physical real-world time via RealTimeSource.
 * 2. Performing startup downtime reconciliation between persisted checkpoint and real time.
 * 3. Driving continuous, drift-compensated world time synchronization.
 * 4. Detecting physical clock rollback and protecting World Time monotonicity.
 * 5. Managing the temporal lifecycle (start/stop) with the HTTP server.
 *
 * Invariant: The TemporalRuntimeAuthority observes real time and requests reconciliation;
 * it does NOT become a second WorldClock and does NOT redefine World Time authority.
 */
export class TemporalRuntimeAuthority {
  private readonly controller: WorldSessionController;
  private readonly timeSource: RealTimeSource;
  private readonly cadenceMs: number;
  private readonly silent: boolean;

  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isReconciling: boolean = false;
  private lastObservedRealMs: number | null = null;
  private lastReconciliationTime: string | null = null;
  private rollbackDetected: boolean = false;
  private rollbackCount: number = 0;

  constructor(options: TemporalRuntimeAuthorityOptions) {
    this.controller = options.controller;
    this.timeSource = options.timeSource ?? new SystemRealTimeSource();
    this.cadenceMs = options.cadenceMs ?? 1000;
    this.silent = options.silent ?? false;
  }

  /**
   * Returns current observational and operational status.
   */
  public getStatus(): TemporalAuthorityStatus {
    return {
      running: this.isRunning,
      cadenceMs: this.cadenceMs,
      lastObservedRealMs: this.lastObservedRealMs,
      lastReconciliationTime: this.lastReconciliationTime,
      rollbackDetected: this.rollbackDetected,
      rollbackCount: this.rollbackCount,
    };
  }

  /**
   * Returns the injected real-time source.
   */
  public getTimeSource(): RealTimeSource {
    return this.timeSource;
  }

  /**
   * Starts the temporal runtime authority.
   * Performs initial downtime reconciliation and begins the continuous drift-compensated heartbeat.
   */
  public async start(): Promise<TemporalReconciliationResult | null> {
    if (this.isRunning) {
      return null;
    }

    const realNow = this.timeSource.now();
    this.lastObservedRealMs = realNow;

    // 1. Initial Downtime Reconciliation (Section 7, 9, 10)
    let initialReconciliation: TemporalReconciliationResult | null = null;
    const currentWorldTime = this.controller.getStatus().worldTime;
    const currentWorldEpoch = Date.parse(currentWorldTime);

    if (realNow > currentWorldEpoch) {
      if (!this.silent) {
        console.log(
          `[TemporalRuntimeAuthority] Downtime detected. Reconciling from checkpoint ${currentWorldTime} to real time ${new Date(realNow).toISOString()} (gap: ${realNow - currentWorldEpoch}ms)`
        );
      }
      initialReconciliation = await this.controller.reconcileWorldTime(realNow, {
        silent: this.silent,
      });
      if (initialReconciliation.success) {
        this.lastReconciliationTime = initialReconciliation.currentTime;
      }
    } else if (realNow < currentWorldEpoch) {
      this.rollbackDetected = true;
      this.rollbackCount++;
      if (!this.silent) {
        console.warn(
          `[WARN] [TemporalRuntimeAuthority] System clock rollback detected on startup: real time (${new Date(realNow).toISOString()}) is earlier than checkpoint (${currentWorldTime}). World Time held at checkpoint.`
        );
      }
    }

    // 2. Start continuous drift-compensated heartbeat
    this.isRunning = true;
    this.timer = setInterval(() => {
      void this.pulse();
    }, this.cadenceMs);

    // Unref timer so it does not block clean process exit
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }

    return initialReconciliation;
  }

  /**
   * Executes a single reconciliation pulse against the current observed real instant.
   * Automatically compensates for timer drift, CPU latency, machine sleep, and pauses.
   */
  public async pulse(): Promise<TemporalReconciliationResult | null> {
    if (!this.isRunning || this.isReconciling) {
      return null;
    }

    this.isReconciling = true;
    try {
      const realNow = this.timeSource.now();
      this.lastObservedRealMs = realNow;

      const currentWorldTime = this.controller.getStatus().worldTime;
      const currentWorldEpoch = Date.parse(currentWorldTime);

      // Guard: Rollback detection (TINV-02, Rule B, Section 14)
      if (realNow < currentWorldEpoch) {
        this.rollbackDetected = true;
        this.rollbackCount++;
        if (!this.silent) {
          console.warn(
            `[WARN] [TemporalRuntimeAuthority] System clock rollback detected: real time (${new Date(realNow).toISOString()}) is earlier than World Time (${currentWorldTime}). Holding World Time.`
          );
        }
        return null;
      }

      this.rollbackDetected = false;

      // Only reconcile forward if physical real time has advanced
      if (realNow > currentWorldEpoch) {
        const result = await this.controller.reconcileWorldTime(realNow, {
          silent: this.silent,
        });
        if (result.success) {
          this.lastReconciliationTime = result.currentTime;
        }
        return result;
      }

      return null;
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Manually triggers an immediate reconciliation pulse.
   * Useful in deterministic testing environments.
   */
  public async reconcileNow(): Promise<TemporalReconciliationResult | null> {
    const wasRunning = this.isRunning;
    this.isRunning = true;
    try {
      return await this.pulse();
    } finally {
      this.isRunning = wasRunning;
    }
  }

  /**
   * Stops the temporal runtime authority and cancels the scheduled heartbeat.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
