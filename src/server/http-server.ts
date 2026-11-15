import { createServer, IncomingMessage, ServerResponse, Server as NodeServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { WorldSessionController, SessionControllerOptions } from './session-controller.js';
import { DEFAULT_SERVER_PORT, DEFAULT_SERVER_HOST } from './config.js';
import { TemporalRuntimeAuthority } from './temporal-runtime-authority.js';
import { RealTimeSource, SystemRealTimeSource } from './time-source.js';

const STATIC_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export interface WorldServerOptions {
  controller?: WorldSessionController;
  controllerOptions?: SessionControllerOptions;
  port?: number;
  host?: string;
  silent?: boolean;
  enableRealTimeDriver?: boolean;
  timeSource?: RealTimeSource;
  reconciliationCadenceMs?: number;
}

export interface ServerInfo {
  port: number;
  host: string;
  url: string;
}

interface CommandValidator {
  validate: (body: Record<string, unknown>) => { valid: boolean; error?: string };
}

const ALLOWED_COMMANDS: Record<string, CommandValidator> = {
  enterBuilding: {
    validate: (body) => {
      if (typeof body.buildingId !== 'string' || body.buildingId.trim() === '') {
        return { valid: false, error: 'Command "enterBuilding" requires a non-empty string "buildingId"' };
      }
      return { valid: true };
    },
  },
  interactAtResidence: {
    validate: (body) => {
      if (typeof body.buildingId !== 'string' || body.buildingId.trim() === '') {
        return { valid: false, error: 'Command "interactAtResidence" requires a non-empty string "buildingId"' };
      }
      return { valid: true };
    },
  },
  leaveBuilding: {
    validate: () => ({ valid: true }),
  },
  enterRestaurant: {
    validate: (body) => {
      if (typeof body.restaurantId !== 'string' || body.restaurantId.trim() === '') {
        return { valid: false, error: 'Command "enterRestaurant" requires a non-empty string "restaurantId"' };
      }
      return { valid: true };
    },
  },
  exitRestaurant: {
    validate: () => ({ valid: true }),
  },
  traverseStreet: {
    validate: (body) => {
      if (typeof body.targetStreetId !== 'string' || body.targetStreetId.trim() === '') {
        return { valid: false, error: 'Command "traverseStreet" requires a non-empty string "targetStreetId"' };
      }
      return { valid: true };
    },
  },
  purchaseOffering: {
    validate: (body) => {
      if (typeof body.offeringId !== 'string' || body.offeringId.trim() === '') {
        return { valid: false, error: 'Command "purchaseOffering" requires a non-empty string "offeringId"' };
      }
      if (
        body.restaurantId !== undefined &&
        (typeof body.restaurantId !== 'string' || (body.restaurantId as string).trim() === '')
      ) {
        return {
          valid: false,
          error: 'Command "purchaseOffering" restaurantId must be a non-empty string if provided',
        };
      }
      return { valid: true };
    },
  },
  startCoffee: {
    validate: (body) => {
      const forbiddenKeys = [
        'purchaseId',
        'itemId',
        'amountMinor',
        'currency',
        'offeringId',
        'restaurantId',
        'consumedAt',
        'startedAt',
        'completedAt',
        'durationMs',
        'playerId',
      ];
      for (const key of forbiddenKeys) {
        if (key in body) {
          return {
            valid: false,
            error: `Command "startCoffee" forbids client-supplied economic fact "${key}"`,
          };
        }
      }
      return { valid: true };
    },
  },
  startEatingPastry: {
    validate: (body) => {
      const forbiddenKeys = [
        'purchaseId',
        'itemId',
        'amountMinor',
        'currency',
        'offeringId',
        'restaurantId',
        'consumedAt',
        'startedAt',
        'completedAt',
        'durationMs',
        'playerId',
      ];
      for (const key of forbiddenKeys) {
        if (key in body) {
          return {
            valid: false,
            error: `Command "startEatingPastry" forbids client-supplied economic fact "${key}"`,
          };
        }
      }
      return { valid: true };
    },
  },
  startAccompaniedActivity: {
    validate: (body) => {
      if (typeof body.companionAgentId !== 'string' || body.companionAgentId.trim() === '') {
        return {
          valid: false,
          error: 'Command "startAccompaniedActivity" requires a non-empty string "companionAgentId"',
        };
      }
      const forbiddenKeys = [
        'purchaseId',
        'itemId',
        'amountMinor',
        'currency',
        'offeringId',
        'restaurantId',
        'consumedAt',
        'startedAt',
        'completedAt',
        'durationMs',
        'playerId',
      ];
      for (const key of forbiddenKeys) {
        if (key in body) {
          return {
            valid: false,
            error: `Command "startAccompaniedActivity" forbids client-supplied economic fact "${key}"`,
          };
        }
      }
      return { valid: true };
    },
  },
  greetAgent: {
    validate: (body) => {
      if (typeof body.targetAgentId !== 'string' || body.targetAgentId.trim() === '') {
        return { valid: false, error: 'Command "greetAgent" requires a non-empty string "targetAgentId"' };
      }
      return { valid: true };
    },
  },
  introduceAgent: {
    validate: (body) => {
      if (typeof body.targetAgentId !== 'string' || body.targetAgentId.trim() === '') {
        return { valid: false, error: 'Command "introduceAgent" requires a non-empty string "targetAgentId"' };
      }
      return { valid: true };
    },
  },
  giveItem: {
    validate: (body) => {
      if (typeof body.targetAgentId !== 'string' || body.targetAgentId.trim() === '') {
        return { valid: false, error: 'Command "giveItem" requires a non-empty string "targetAgentId"' };
      }
      if (typeof body.itemId !== 'string' || body.itemId.trim() === '') {
        return { valid: false, error: 'Command "giveItem" requires a non-empty string "itemId"' };
      }
      return { valid: true };
    },
  },
  placeOrder: {
    validate: (body) => {
      if (typeof body.restaurantId !== 'string' || body.restaurantId.trim() === '') {
        return { valid: false, error: 'Command "placeOrder" requires a non-empty string "restaurantId"' };
      }
      if (!Array.isArray(body.lines) || body.lines.length === 0) {
        return { valid: false, error: 'Command "placeOrder" requires a non-empty array "lines"' };
      }
      for (let i = 0; i < body.lines.length; i++) {
        const line = body.lines[i];
        if (!line || typeof line !== 'object') {
          return { valid: false, error: `Command "placeOrder" line at index ${i} must be an object` };
        }
        if (typeof line.offeringId !== 'string' || line.offeringId.trim() === '') {
          return { valid: false, error: `Command "placeOrder" line at index ${i} requires non-empty string "offeringId"` };
        }
        if (typeof line.quantity !== 'number' || !Number.isInteger(line.quantity) || line.quantity < 1) {
          return { valid: false, error: `Command "placeOrder" line at index ${i} requires positive integer "quantity"` };
        }
      }
      if (body.fulfillmentMode !== undefined) {
        if (typeof body.fulfillmentMode !== 'string' || body.fulfillmentMode.trim() === '') {
          return { valid: false, error: 'Command "placeOrder" fulfillmentMode must be a non-empty string if provided' };
        }
      }
      return { valid: true };
    },
  },
  collectOrder: {
    validate: (body) => {
      if (typeof body.orderId !== 'string' || body.orderId.trim() === '') {
        return { valid: false, error: 'Command "collectOrder" requires a non-empty string "orderId"' };
      }
      return { valid: true };
    },
  },
  inquireRestaurantService: {
    validate: (body) => {
      if (typeof body.staffNpcId !== 'string' || body.staffNpcId.trim() === '') {
        return { valid: false, error: 'Command "inquireRestaurantService" requires a non-empty string "staffNpcId"' };
      }
      return { valid: true };
    },
  },
  requestRestaurantService: {
    validate: (body) => {
      if (body.restaurantId !== undefined) {
        if (typeof body.restaurantId !== 'string' || body.restaurantId.trim() === '') {
          return { valid: false, error: 'Command "requestRestaurantService" restaurantId must be a non-empty string if provided' };
        }
      }
      if ('attendantId' in body || 'npcId' in body || 'accepted' in body || 'status' in body || 'serviceStatus' in body) {
        return { valid: false, error: 'Command "requestRestaurantService" forbids client-supplied attendant, NPC, or acceptance parameters' };
      }
      return { valid: true };
    },
  },
};

const MAX_BODY_BYTES = 64 * 1024; // 64 KB limit

/**
 * Minimal authoritative HTTP server hosting the WorldSessionController (Milestone 29).
 *
 * Implements:
 * - Status query (GET /api/status)
 * - Read-only perception queries (GET /api/location, GET /api/history)
 * - Sequential command dispatch (POST /api/commands/:commandName)
 * - Controlled simulation step (POST /api/simulation/step)
 * - Structured JSON responses and strict error boundaries
 * - Zero runtime dependencies (uses native node:http)
 */
export class WorldHttpServer {
  private readonly controller: WorldSessionController;
  private readonly server: NodeServer;
  private readonly silent: boolean;
  private readonly temporalAuthority: TemporalRuntimeAuthority | null = null;
  private isListening: boolean = false;
  private isStopping: boolean = false;
  private serverInfo: ServerInfo | null = null;

  constructor(options: WorldServerOptions = {}) {
    this.silent = options.silent ?? false;
    const effectiveTimeSource =
      options.timeSource ?? (options.enableRealTimeDriver ? new SystemRealTimeSource() : undefined);

    const controllerOptions: SessionControllerOptions = {
      silent: this.silent,
      timeSource: effectiveTimeSource,
      ...(options.controllerOptions ?? {}),
    };
    if (effectiveTimeSource && !controllerOptions.timeSource) {
      controllerOptions.timeSource = effectiveTimeSource;
    }

    this.controller =
      options.controller ?? new WorldSessionController(controllerOptions);

    if (effectiveTimeSource && !this.controller.getTimeSource()) {
      this.controller.setTimeSource(effectiveTimeSource);
    }

    if (options.enableRealTimeDriver) {
      this.temporalAuthority = new TemporalRuntimeAuthority({
        controller: this.controller,
        timeSource: effectiveTimeSource,
        cadenceMs: options.reconciliationCadenceMs,
        silent: this.silent,
      });
    }

    this.server = createServer((req, res) => this.handleRequest(req, res));
  }

  public getController(): WorldSessionController {
    return this.controller;
  }

  public getTemporalAuthority(): TemporalRuntimeAuthority | null {
    return this.temporalAuthority;
  }

  public getServerInfo(): ServerInfo | null {
    return this.serverInfo;
  }

  /**
   * Starts listening on the specified host and port.
   * If port 0 is given, the OS assigns an ephemeral port.
   */
  public async start(port: number = DEFAULT_SERVER_PORT, host: string = DEFAULT_SERVER_HOST): Promise<ServerInfo> {
    if (this.temporalAuthority) {
      await this.temporalAuthority.start();
    }

    return new Promise((resolve, reject) => {
      if (this.isListening) {
        return resolve(this.serverInfo!);
      }

      this.server.once('error', (err) => {
        reject(err);
      });

      this.server.listen(port, host, () => {
        this.isListening = true;
        const address = this.server.address();
        let boundPort = port;
        if (address && typeof address === 'object') {
          boundPort = address.port;
        }

        this.serverInfo = {
          port: boundPort,
          host,
          url: `http://${host}:${boundPort}`,
        };

        if (!this.silent) {
          console.log(`WORLD SERVER READY: listening on ${this.serverInfo.url}`);
        }

        resolve(this.serverInfo);
      });
    });
  }

  /**
   * Gracefully stops the HTTP server and session controller.
   */
  public async stop(): Promise<void> {
    if (this.isStopping) {
      return;
    }
    this.isStopping = true;

    // Shutdown temporal authority first to stop background reconciliations
    if (this.temporalAuthority) {
      await this.temporalAuthority.stop();
    }

    // Shutdown session controller to reject incoming operations
    await this.controller.shutdown();

    if (!this.isListening) {
      return;
    }

    return new Promise((resolve) => {
      if (typeof (this.server as any).closeAllConnections === 'function') {
        (this.server as any).closeAllConnections();
      }
      this.server.close(() => {
        this.isListening = false;
        this.serverInfo = null;
        if (!this.silent) {
          console.log('WORLD SERVER STOPPED');
        }
        resolve();
      });
    });
  }

  /**
   * Internal request dispatcher.
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.isStopping) {
      this.sendJson(res, 503, {
        success: false,
        committed: false,
        error: {
          code: 'server-shutting-down',
          message: 'Server is currently shutting down',
        },
      });
      return;
    }

    const host = req.headers.host ?? `${DEFAULT_SERVER_HOST}:${DEFAULT_SERVER_PORT}`;
    const url = new URL(req.url ?? '/', `http://${host}`);
    const pathname = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    try {
      // 1. GET /api/status
      if (method === 'GET' && pathname === '/api/status') {
        const status = this.controller.getStatus();
        this.sendJson(res, 200, {
          success: true,
          result: status,
        });
        return;
      }

      // 2. GET /api/location
      if (method === 'GET' && pathname === '/api/location') {
        const locationResult = this.controller.getLocationView();
        this.sendJson(res, 200, {
          success: locationResult.success,
          result: locationResult,
        });
        return;
      }

      // 3. GET /api/history
      if (method === 'GET' && pathname === '/api/history') {
        const historyResult = this.controller.getHistoryView();
        this.sendJson(res, 200, {
          success: historyResult.success,
          result: historyResult,
        });
        return;
      }

      // 4. GET /api/schedule (Read-only schedule inquiry)
      if (method === 'GET' && (pathname === '/api/schedule' || pathname.startsWith('/api/schedule/'))) {
        let targetAgentId = url.searchParams.get('targetAgentId');
        if (!targetAgentId && pathname.startsWith('/api/schedule/')) {
          targetAgentId = pathname.slice('/api/schedule/'.length);
        }

        if (!targetAgentId || targetAgentId.trim() === '') {
          this.sendJson(res, 400, {
            success: false,
            error: {
              code: 'invalid-query-input',
              message: 'Query requires parameter "targetAgentId"',
            },
          });
          return;
        }

        const scheduleResult = this.controller.getScheduleView(targetAgentId.trim());
        this.sendJson(res, 200, {
          success: scheduleResult.success,
          result: scheduleResult,
        });
        return;
      }

      // 5. GET /api/service (Read-only restaurant service inquiry)
      if (method === 'GET' && (pathname === '/api/service' || pathname.startsWith('/api/service/'))) {
        let staffNpcId = url.searchParams.get('staffNpcId');
        if (!staffNpcId && pathname.startsWith('/api/service/')) {
          staffNpcId = pathname.slice('/api/service/'.length);
        }

        if (!staffNpcId || staffNpcId.trim() === '') {
          this.sendJson(res, 400, {
            success: false,
            error: {
              code: 'invalid-query-input',
              message: 'Query requires parameter "staffNpcId"',
            },
          });
          return;
        }

        const serviceResult = this.controller.getRestaurantServiceView(staffNpcId.trim());
        this.sendJson(res, 200, {
          success: serviceResult.success,
          result: serviceResult,
        });
        return;
      }

      // 6. GET /api/businesses/:businessId/schedule (Read-only business schedule and operational status)
      if (
        method === 'GET' &&
        pathname.startsWith('/api/businesses/') &&
        pathname.endsWith('/schedule')
      ) {
        const middle = pathname.slice('/api/businesses/'.length, pathname.length - '/schedule'.length);
        const businessId = decodeURIComponent(middle);
        if (!businessId || businessId.trim() === '' || middle.includes('/')) {
          this.sendJson(res, 400, {
            success: false,
            error: {
              code: 'invalid-business-id',
              message: 'Route parameter "businessId" must be a non-empty string without path separators',
            },
          });
          return;
        }

        const atParam = url.searchParams.get('at');
        const scheduleView = this.controller.getBusinessScheduleView(
          businessId,
          atParam !== null ? atParam : undefined
        );

        if (!scheduleView.success) {
          const statusCode = scheduleView.error?.code === 'business-not-found' ? 404 : 400;
          this.sendJson(res, statusCode, {
            success: false,
            error: scheduleView.error,
          });
          return;
        }

        this.sendJson(res, 200, {
          success: true,
          result: scheduleView.result,
        });
        return;
      }

      // Milestone 92: AI NPC Cognition & Perception Endpoints
      if (pathname.startsWith('/api/npc/')) {
        const subpath = pathname.slice('/api/npc/'.length);
        const slashIdx = subpath.lastIndexOf('/');
        if (slashIdx !== -1) {
          const agentId = decodeURIComponent(subpath.slice(0, slashIdx));
          const action = subpath.slice(slashIdx + 1);

          // GET /api/npc/:agentId/perception
          if (method === 'GET' && action === 'perception') {
            try {
              const perception = this.controller.getNpcPerception(agentId);
              this.sendJson(res, 200, {
                success: true,
                result: perception,
              });
            } catch (err) {
              this.sendJson(res, 404, {
                success: false,
                error: {
                  code: 'agent-not-found',
                  message: (err as Error).message,
                },
              });
            }
            return;
          }

          // GET /api/npc/:agentId/diagnostics
          if (method === 'GET' && action === 'diagnostics') {
            try {
              const diagnostics = this.controller.getNpcAiDiagnostics(agentId);
              this.sendJson(res, 200, {
                success: true,
                result: diagnostics,
              });
            } catch (err) {
              this.sendJson(res, 404, {
                success: false,
                error: {
                  code: 'agent-not-found',
                  message: (err as Error).message,
                },
              });
            }
            return;
          }

          // POST /api/npc/:agentId/cycle
          if (method === 'POST' && action === 'cycle') {
            try {
              const cycleResult = await this.controller.runNpcAiCycle(agentId);
              this.sendJson(res, 200, {
                success:
                  cycleResult.status !== 'provider_failed' &&
                  cycleResult.status !== 'invalid_proposal',
                result: cycleResult,
              });
            } catch (err) {
              this.sendJson(res, 500, {
                success: false,
                error: {
                  code: 'cycle-execution-error',
                  message: (err as Error).message,
                },
              });
            }
            return;
          }
        }
      }

      // 5. POST /api/commands/:commandName
      if (method === 'POST' && pathname.startsWith('/api/commands/')) {
        const commandName = pathname.slice('/api/commands/'.length);

        if (!(commandName in ALLOWED_COMMANDS)) {
          this.sendJson(res, 404, {
            success: false,
            committed: false,
            error: {
              code: 'unknown-command',
              message: `Unknown command "${commandName}"`,
            },
          });
          return;
        }

        const body = await this.readJsonBody(req);
        if (body === null) {
          this.sendJson(res, 400, {
            success: false,
            committed: false,
            error: {
              code: 'malformed-json',
              message: 'Invalid JSON in request body',
            },
          });
          return;
        }

        // Check for disallowed player identity override attempts
        if ('playerId' in body || 'agentId' in body) {
          this.sendJson(res, 400, {
            success: false,
            committed: false,
            error: {
              code: 'identity-override-forbidden',
              message: 'Client-supplied player identity override is forbidden',
            },
          });
          return;
        }

        // Validate command parameters
        const validator = ALLOWED_COMMANDS[commandName];
        const validation = validator.validate(body);
        if (!validation.valid) {
          this.sendJson(res, 400, {
            success: false,
            committed: false,
            error: {
              code: 'invalid-command-input',
              message: validation.error ?? 'Invalid command input',
            },
          });
          return;
        }

        // Dispatch command sequentially via controller
        const dispatchResult = await this.controller.dispatchCommand(commandName, body);

        if (dispatchResult.success) {
          this.sendJson(res, 200, {
            success: true,
            committed: true,
            result: dispatchResult.result,
          });
        } else if (dispatchResult.error?.code === 'persistence-failure') {
          this.sendJson(res, 500, {
            success: false,
            committed: false,
            error: dispatchResult.error,
          });
        } else if (dispatchResult.error?.code === 'server-shutting-down') {
          this.sendJson(res, 503, {
            success: false,
            committed: false,
            error: dispatchResult.error,
          });
        } else {
          // Domain validation failure: HTTP 422 Unprocessable Entity
          this.sendJson(res, 422, {
            success: false,
            committed: false,
            result: dispatchResult.result,
            error: dispatchResult.error,
          });
        }
        return;
      }

      // 5. POST /api/simulation/step
      if (method === 'POST' && pathname === '/api/simulation/step') {
        const body = await this.readJsonBody(req);
        if (body === null) {
          this.sendJson(res, 400, {
            success: false,
            committed: false,
            error: {
              code: 'malformed-json',
              message: 'Invalid JSON in request body',
            },
          });
          return;
        }

        const advanceDurationMs = body.advanceDurationMs;
        if (typeof advanceDurationMs !== 'number' || !Number.isFinite(advanceDurationMs) || advanceDurationMs < 0) {
          this.sendJson(res, 400, {
            success: false,
            committed: false,
            error: {
              code: 'invalid-simulation-input',
              message: 'advanceDurationMs must be a non-negative finite number',
            },
          });
          return;
        }

        const simResult = await this.controller.stepSimulation(advanceDurationMs);
        if (simResult.success) {
          this.sendJson(res, 200, {
            success: true,
            committed: true,
            result: simResult.result,
          });
        } else if (simResult.error?.code === 'persistence-failure') {
          this.sendJson(res, 500, {
            success: false,
            committed: false,
            error: simResult.error,
          });
        } else {
          this.sendJson(res, 400, {
            success: false,
            committed: false,
            error: simResult.error,
          });
        }
        return;
      }

      // 6. Static asset delivery for browser client (Milestone 30)
      if (method === 'GET' && !pathname.startsWith('/api/')) {
        if (this.serveStaticFile(res, pathname)) {
          return;
        }
      }

      // Unmatched route
      this.sendJson(res, 404, {
        success: false,
        error: {
          code: 'route-not-found',
          message: `Route not found: ${method} ${pathname}`,
        },
      });
    } catch (err) {
      this.sendJson(res, 500, {
        success: false,
        error: {
          code: 'internal-server-error',
          message: 'An unexpected internal error occurred',
        },
      });
    }
  }

  /**
   * Helper to parse JSON request body with size limit.
   */
  private readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      let data = '';
      let bytes = 0;
      let aborted = false;

      req.on('data', (chunk: Buffer) => {
        if (aborted) return;
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) {
          aborted = true;
          resolve(null);
          return;
        }
        data += chunk.toString('utf-8');
      });

      req.on('end', () => {
        if (aborted) return;
        if (data.trim() === '') {
          resolve({});
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            resolve(parsed as Record<string, unknown>);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });

      req.on('error', () => {
        resolve(null);
      });
    });
  }

  /**
   * Helper to send JSON responses with consistent headers.
   */
  private sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    const json = JSON.stringify(payload);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
  }

  /**
   * Serves static client assets (HTML, CSS, JS) from dist/client or src/client.
   */
  private serveStaticFile(res: ServerResponse, pathname: string): boolean {
    // 3D Playable Blockout Client route (Milestone 79)
    if (
      pathname === '/3d' ||
      pathname === '/3d/' ||
      pathname === '/minimal-3d' ||
      pathname === '/minimal-3d/' ||
      pathname === '/client/3d.html'
    ) {
      const pathsToTry = [
        resolve(process.cwd(), 'clients', 'minimal-3d', 'index.html'),
        resolve(process.cwd(), 'dist', 'client', '3d.html'),
      ];
      for (const p of pathsToTry) {
        if (existsSync(p) && statSync(p).isFile()) {
          const content = readFileSync(p);
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': Buffer.byteLength(content),
            'Cache-Control': 'no-cache',
          });
          res.end(content);
          return true;
        }
      }
    }

    let relativePath = pathname === '/' ? 'index.html' : pathname;
    if (relativePath.startsWith('/client/')) {
      relativePath = relativePath.slice('/client/'.length);
    } else if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }

    const baseDir = resolve(process.cwd(), 'dist', 'client');
    const fullPath = resolve(baseDir, relativePath);

    // Path traversal check
    if (!fullPath.startsWith(baseDir)) {
      return false;
    }

    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      const ext = extname(fullPath).toLowerCase();
      const contentType = STATIC_MIME_TYPES[ext];
      if (!contentType) {
        return false;
      }
      const content = readFileSync(fullPath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(content),
        'Cache-Control': 'no-cache',
      });
      res.end(content);
      return true;
    }

    return false;
  }
}

/**
 * Factory helper to create and configure a WorldHttpServer.
 */
export function createWorldServer(options: WorldServerOptions = {}): WorldHttpServer {
  return new WorldHttpServer(options);
}
