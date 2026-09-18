import { ApiClient } from './api-client.js';
import {
  PresentationModel,
  createPresentationModel,
  InspectableEntity,
  findInspectableEntity,
} from './projections.js';

export type ClientConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'COMMAND_IN_PROGRESS'
  | 'READY'
  | 'DOMAIN_ERROR'
  | 'SERVER_ERROR'
  | 'DISCONNECTED';

export interface ClientSessionState {
  status: ClientConnectionStatus;
  model: PresentationModel | null;
  errorMessage: string | null;
  lastCommandName: string | null;
  feedbackMessage: { type: 'success' | 'info'; text: string } | null;
  selectedEntity: InspectableEntity | null;
}

export type SessionStateListener = (state: ClientSessionState) => void;

/**
 * ClientSession coordinates the browser interaction lifecycle (Milestones 30-32).
 *
 * Invariants:
 * - Maintains zero world state authority.
 * - Does NOT perform optimistic local prediction; refreshes strictly from server upon command success.
 * - Preserves existing authoritative projection upon domain rejection.
 */
export class ClientSession {
  private readonly apiClient: ApiClient;
  private status: ClientConnectionStatus = 'CONNECTING';
  private model: PresentationModel | null = null;
  private errorMessage: string | null = null;
  private lastCommandName: string | null = null;
  private feedbackMessage: { type: 'success' | 'info'; text: string } | null = null;
  private selectedEntity: InspectableEntity | null = null;
  private readonly listeners = new Set<SessionStateListener>();

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  public getState(): ClientSessionState {
    return {
      status: this.status,
      model: this.model,
      errorMessage: this.errorMessage,
      lastCommandName: this.lastCommandName,
      feedbackMessage: this.feedbackMessage,
      selectedEntity: this.selectedEntity,
    };
  }

  /**
   * Sets the currently inspected entity in the presentation layer.
   */
  public selectEntity(entity: InspectableEntity | null): void {
    this.selectedEntity = entity;
    this.emit();
  }

  public subscribe(listener: SessionStateListener): () => void {
    this.listeners.add(listener);
    // Initial emit
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  /**
   * Initializes the client by connecting to the M29 runtime and retrieving current projections.
   */
  public async init(): Promise<boolean> {
    this.status = 'CONNECTING';
    this.errorMessage = null;
    this.feedbackMessage = null;
    this.selectedEntity = null;
    this.emit();

    const [statusRes, locRes] = await Promise.all([
      this.apiClient.getStatus(),
      this.apiClient.getLocation(),
    ]);

    if (!statusRes.success) {
      if (statusRes.status === 0) {
        this.status = 'DISCONNECTED';
        this.errorMessage = 'Could not connect to World Server. Is the server running?';
      } else {
        this.status = 'SERVER_ERROR';
        this.errorMessage = statusRes.error?.message ?? 'Failed to retrieve world status';
      }
      this.emit();
      return false;
    }

    if (!locRes.success) {
      this.status = 'SERVER_ERROR';
      this.errorMessage = locRes.error?.message ?? 'Failed to inspect current location';
      this.emit();
      return false;
    }

    this.model = createPresentationModel(statusRes.result, locRes.result);
    this.status = 'READY';
    this.errorMessage = null;
    this.emit();
    return true;
  }

  /**
   * Dispatches a user intent via command to the server, then reconciles projection upon success.
   */
  public async executeCommand(
    commandName: string,
    payload: Record<string, unknown> = {}
  ): Promise<boolean> {
    if (this.status === 'COMMAND_IN_PROGRESS') {
      console.warn(`[session] Command "${commandName}" ignored: previous command in progress`);
      return false;
    }

    this.status = 'COMMAND_IN_PROGRESS';
    this.lastCommandName = commandName;
    this.errorMessage = null;
    this.feedbackMessage = null;
    this.emit();

    const cmdRes = await this.apiClient.postCommand(commandName, payload);

    if (cmdRes.success) {
      // Reconcile projection strictly from server
      const [statusRes, locRes] = await Promise.all([
        this.apiClient.getStatus(),
        this.apiClient.getLocation(),
      ]);

      if (statusRes.success && locRes.success) {
        this.model = createPresentationModel(statusRes.result, locRes.result);
        this.status = 'READY';
        this.errorMessage = null;

        // Reconcile selectedEntity if still present in new projection
        if (this.selectedEntity) {
          this.selectedEntity = findInspectableEntity(this.model, this.selectedEntity.id);
        }

        // Set contextual authoritative command success feedback
        let successText = `Command "${commandName}" executed successfully.`;
        if (commandName === 'enterBuilding') {
          successText = `Entered ${this.model.locationName}.`;
        } else if (commandName === 'leaveBuilding') {
          successText = `Returned to ${this.model.locationName}.`;
        } else if (commandName === 'enterRestaurant') {
          successText = `Entered ${this.model.locationName}.`;
        } else if (commandName === 'exitRestaurant') {
          successText = `Returned to ${this.model.locationName}.`;
        } else if (commandName === 'traverseStreet') {
          successText = `Walked to ${this.model.locationName}.`;
        } else if (commandName === 'greetAgent') {
          successText = `Greeted agent.`;
        } else if (commandName === 'introduceAgent') {
          successText = `Introduced to agent.`;
        } else if (commandName === 'purchaseOffering') {
          successText = `Purchase completed.`;
        }
        this.feedbackMessage = { type: 'success', text: successText };

        this.emit();
        return true;
      } else {
        this.status = 'SERVER_ERROR';
        this.errorMessage = 'Command succeeded but failed to refresh world projection';
        this.feedbackMessage = null;
        this.emit();
        return false;
      }
    } else if (cmdRes.status === 422) {
      // Domain validation failure: keep existing authoritative model, expose domain message
      this.status = 'DOMAIN_ERROR';
      this.errorMessage = cmdRes.error?.message ?? 'Domain action rejected';
      this.feedbackMessage = null;
      this.emit();
      return false;
    } else if (cmdRes.status === 0) {
      this.status = 'DISCONNECTED';
      this.errorMessage = 'Connection lost during command execution';
      this.feedbackMessage = null;
      this.emit();
      return false;
    } else {
      this.status = 'SERVER_ERROR';
      this.errorMessage = cmdRes.error?.message ?? `Server error (${cmdRes.status})`;
      this.feedbackMessage = null;
      this.emit();
      return false;
    }
  }
}
