/**
 * Client API Layer for MyVirtualCommunity (Milestone 30).
 *
 * Responsibilities:
 * - HTTP communication with the M29 Node.js authoritative runtime
 * - Structured JSON request/response handling
 * - Clean error boundary without leaking stack traces
 *
 * Invariants:
 * - Contains NO domain rules, NO simulation logic, and NO local authority.
 * - Browser is strictly a consumer of server projections.
 */

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResult<T> {
  success: boolean;
  status: number;
  result?: T;
  error?: ApiError;
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = '') {
    // Trim trailing slash if present
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Performs an HTTP GET query against the authoritative runtime.
   */
  public async get<T>(path: string): Promise<ApiResult<T>> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      return await this.parseResponse<T>(response);
    } catch (err) {
      return {
        success: false,
        status: 0,
        error: {
          code: 'network-error',
          message: err instanceof Error ? err.message : 'Network connection failed',
        },
      };
    }
  }

  /**
   * Dispatches a state-changing command to the authoritative runtime.
   */
  public async postCommand<T = Record<string, unknown>>(
    commandName: string,
    payload: Record<string, unknown> = {}
  ): Promise<ApiResult<T>> {
    const url = `${this.baseUrl}/api/commands/${encodeURIComponent(commandName)}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return await this.parseResponse<T>(response);
    } catch (err) {
      return {
        success: false,
        status: 0,
        error: {
          code: 'network-error',
          message: err instanceof Error ? err.message : 'Network connection failed',
        },
      };
    }
  }

  /**
   * Standardized JSON response parser.
   */
  private async parseResponse<T>(response: Response): Promise<ApiResult<T>> {
    let json: Record<string, unknown> | null = null;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        status: response.status,
        error: {
          code: 'invalid-response-format',
          message: `Server returned non-JSON response with HTTP ${response.status}`,
        },
      };
    }

    if (response.ok && json.success) {
      return {
        success: true,
        status: response.status,
        result: json.result as T,
      };
    }

    // Extract structured error from server response
    const rawError = (json.error as Record<string, unknown>) || {};
    const errorCode = typeof rawError.code === 'string' ? rawError.code : `http-${response.status}`;
    const errorMessage =
      typeof rawError.message === 'string'
        ? rawError.message
        : `Request failed with HTTP status ${response.status}`;

    return {
      success: false,
      status: response.status,
      result: json.result as T | undefined,
      error: {
        code: errorCode,
        message: errorMessage,
      },
    };
  }

  // Convenience query wrappers

  public async getStatus(): Promise<ApiResult<any>> {
    return this.get('/api/status');
  }

  public async getLocation(): Promise<ApiResult<any>> {
    return this.get('/api/location');
  }

  public async getHistory(): Promise<ApiResult<any>> {
    return this.get('/api/history');
  }

  public async getSchedule(targetAgentId: string): Promise<ApiResult<any>> {
    return this.get(`/api/schedule?targetAgentId=${encodeURIComponent(targetAgentId)}`);
  }

  public async getRestaurantService(staffNpcId: string): Promise<ApiResult<any>> {
    return this.get(`/api/service?staffNpcId=${encodeURIComponent(staffNpcId)}`);
  }

  public async stepSimulation(advanceDurationMs: number): Promise<ApiResult<any>> {
    const url = `${this.baseUrl}/api/simulation/step`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ advanceDurationMs }),
      });
      return await this.parseResponse(response);
    } catch (err) {
      return {
        success: false,
        status: 0,
        error: {
          code: 'network-error',
          message: err instanceof Error ? err.message : 'Network connection failed',
        },
      };
    }
  }
}
