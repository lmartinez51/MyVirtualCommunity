import { ApiClient } from './api-client.js';
import {
  PresentationModel,
  createPresentationModel,
  InspectableEntity,
  findInspectableEntity,
  ObservablePendingOrder,
} from './projections.js';

export type ClientConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'COMMAND_IN_PROGRESS'
  | 'READY'
  | 'DOMAIN_ERROR'
  | 'SERVER_ERROR'
  | 'DISCONNECTED';

export interface ClientActiveOrder {
  id: string;
  status: 'preparing' | 'ready' | 'fulfilled';
  readyAt: string;
  totalAmountMinor: number;
  currency: string;
  lines: Array<{ offeringId: string; quantity: number }>;
}

export interface ClientRestaurantService {
  prompt?: string;
  restaurantId?: string;
  staffNpcId?: string;
  availableOfferings?: Array<{
    id: string;
    name: string;
    priceMinor: number;
    currency: string;
  }>;
  supportedModes?: readonly string[];
  supportedFulfillmentModes?: readonly string[];
  deferredFulfillmentModes?: readonly string[];
}

export interface ClientDialogueResponse {
  speakerAgentId: string;
  text: string;
  timestamp: number;
}

export interface ClientSessionState {
  status: ClientConnectionStatus;
  model: PresentationModel | null;
  errorMessage: string | null;
  lastCommandName: string | null;
  lastCommandResult: { success: boolean; message?: string } | null;
  feedbackMessage: { type: 'success' | 'info'; text: string } | null;
  selectedEntity: InspectableEntity | null;
  pendingOrders: ObservablePendingOrder[];
  activeOrder: ClientActiveOrder | null;
  restaurantService: ClientRestaurantService | null;
  dialogueResponse: ClientDialogueResponse | null;
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
  private lastCommandResult: { success: boolean; message?: string } | null = null;
  private feedbackMessage: { type: 'success' | 'info'; text: string } | null = null;
  private selectedEntity: InspectableEntity | null = null;
  private pendingOrders: ObservablePendingOrder[] = [];
  private activeOrder: ClientActiveOrder | null = null;
  private restaurantService: ClientRestaurantService | null = null;
  private dialogueResponse: ClientDialogueResponse | null = null;
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
      lastCommandResult: this.lastCommandResult,
      feedbackMessage: this.feedbackMessage,
      selectedEntity: this.selectedEntity,
      pendingOrders: this.pendingOrders,
      activeOrder: this.activeOrder,
      restaurantService: this.restaurantService,
      dialogueResponse: this.dialogueResponse,
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
    this.pendingOrders = this.model.pendingOrders;
    this.reconcileActiveOrder();
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
        this.pendingOrders = this.model.pendingOrders;
        this.reconcileActiveOrder(commandName);
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
        } else if (commandName === 'greetAgent' || commandName === 'introduceAgent') {
          const resp = (cmdRes.result as { response?: string })?.response;
          const targetAgentId = typeof payload.targetAgentId === 'string' ? payload.targetAgentId : '';
          if (resp && targetAgentId) {
            this.dialogueResponse = {
              speakerAgentId: targetAgentId,
              text: resp,
              timestamp: Date.now(),
            };
          }
          if (commandName === 'greetAgent') {
            successText = resp ? `NPC response: "${resp}"` : `Greeted agent.`;
          } else {
            successText = resp ? `NPC response: "${resp}"` : `Introduced to agent.`;
          }
        } else {
          this.dialogueResponse = null;
        }
        if (commandName === 'purchaseOffering') {
          successText = `Purchase completed.`;
        } else if (commandName === 'placeOrder') {
          const orderData = cmdRes.result as {
            orderId: string;
            totalAmountMinor: number;
            currency: string;
            readyAt: string;
          };
          this.activeOrder = {
            id: orderData.orderId,
            status: 'preparing',
            readyAt: orderData.readyAt,
            totalAmountMinor: orderData.totalAmountMinor,
            currency: orderData.currency,
            lines: (payload.lines as Array<{ offeringId: string; quantity: number }>) || [],
          };
          successText = `Order "${orderData.orderId}" placed (Preparing).`;
        } else if (commandName === 'collectOrder') {
          if (this.activeOrder) {
            this.activeOrder.status = 'fulfilled';
          }
          successText = `Order collected successfully! Items transferred to customer inventory.`;
        }
        this.lastCommandResult = { success: true, message: successText };
        this.feedbackMessage = { type: 'success', text: successText };

        this.emit();
        return true;
      } else {
        this.status = 'SERVER_ERROR';
        this.errorMessage = 'Command succeeded but failed to refresh world projection';
        this.lastCommandResult = { success: false, message: this.errorMessage };
        this.feedbackMessage = null;
        this.emit();
        return false;
      }
    } else if (cmdRes.status === 422) {
      // Domain validation failure: keep existing authoritative model, expose domain message
      this.status = 'DOMAIN_ERROR';
      this.errorMessage = cmdRes.error?.message ?? 'Domain action rejected';
      this.lastCommandResult = { success: false, message: this.errorMessage };
      this.feedbackMessage = null;
      this.emit();
      return false;
    } else if (cmdRes.status === 0) {
      this.status = 'DISCONNECTED';
      this.errorMessage = 'Connection lost during command execution';
      this.lastCommandResult = { success: false, message: this.errorMessage };
      this.feedbackMessage = null;
      this.emit();
      return false;
    } else {
      this.status = 'SERVER_ERROR';
      this.errorMessage = cmdRes.error?.message ?? `Server error (${cmdRes.status})`;
      this.lastCommandResult = { success: false, message: this.errorMessage };
      this.feedbackMessage = null;
      this.emit();
      return false;
    }
  }

  /**
   * Queries restaurant service options from a co-located staff NPC (Milestone 39 / 44).
   */
  public async inquireRestaurantService(staffNpcId: string): Promise<boolean> {
    const res = await this.apiClient.getRestaurantService(staffNpcId);
    if (res.success && res.result?.success) {
      this.restaurantService = res.result;
      this.feedbackMessage = {
        type: 'info',
        text: `Service counter: "${res.result.prompt || 'How can I help you?'}"`,
      };
      this.emit();
      return true;
    } else {
      this.restaurantService = null;
      if (res.result?.message) {
        this.errorMessage = res.result.message;
        this.status = 'DOMAIN_ERROR';
      } else {
        this.errorMessage = res.error?.message ?? 'Service inquiry failed';
        this.status = 'SERVER_ERROR';
      }
      this.emit();
      return false;
    }
  }

  /**
   * Advances simulation time explicitly via server API (Development diagnostic only).
   */
  public async stepSimulation(advanceDurationMs: number): Promise<boolean> {
    const simRes = await this.apiClient.stepSimulation(advanceDurationMs);
    if (simRes.success) {
      // Check order transitions in authoritative tickResult
      const orderTransitions = simRes.result?.tickResult?.orderTransitions;
      if (Array.isArray(orderTransitions) && this.activeOrder) {
        const trans = orderTransitions.find((t: { orderId: string; newStatus: string }) => t.orderId === this.activeOrder?.id);
        if (trans && trans.newStatus === 'ready') {
          this.activeOrder.status = 'ready';
        }
      }

      // Reconcile model strictly from server
      const [statusRes, locRes] = await Promise.all([
        this.apiClient.getStatus(),
        this.apiClient.getLocation(),
      ]);

      if (statusRes.success && locRes.success) {
        this.model = createPresentationModel(statusRes.result, locRes.result);
        this.pendingOrders = this.model.pendingOrders;
        this.reconcileActiveOrder();
        this.status = 'READY';
        this.errorMessage = null;
        if (this.selectedEntity) {
          this.selectedEntity = findInspectableEntity(this.model, this.selectedEntity.id);
        }
      }

      // Check NPC decision transitions in authoritative tickResult (Milestone 46 & 47)
      const npcDecisionTransitions = simRes.result?.tickResult?.npcDecisionTransitions;
      let npcDisclosureHappened = false;
      let npcOfferingHappened = false;
      if (Array.isArray(npcDecisionTransitions)) {
        for (const dt of npcDecisionTransitions) {
          if (dt.success && dt.decision === 'npc-schedule-disclosure') {
            npcDisclosureHappened = true;
          } else if (dt.success && dt.decision === 'make-offering-available') {
            npcOfferingHappened = true;
          }
        }
      }

      // Check closure egress transitions in authoritative tickResult (Milestone 52)
      const closureEgressTransitions = simRes.result?.tickResult?.closureEgressTransitions;
      let playerEgressHappened = false;
      if (Array.isArray(closureEgressTransitions)) {
        playerEgressHappened = closureEgressTransitions.some(
          (eg: { agentId: string }) => eg.agentId === this.model?.activePlayerId
        );
      }

      this.lastCommandName = 'stepSimulation';
      this.lastCommandResult = {
        success: true,
        message: `Advanced simulation by ${advanceDurationMs / 1000}s`,
      };
      if (playerEgressHappened) {
        const hasReadyOrder = this.pendingOrders.some((o) => o.status === 'ready');
        this.feedbackMessage = {
          type: 'info',
          text: hasReadyOrder
            ? 'The restaurant has closed. Your ready order remains pending. Pickup is deferred until the restaurant reopens.'
            : 'The restaurant has closed. You have exited to the building lobby.',
        };
      } else if (npcOfferingHappened) {
        this.feedbackMessage = {
          type: 'success',
          text: 'Development NPC made Pan Dulce available at the restaurant.',
        };
      } else if (npcDisclosureHappened) {
        this.feedbackMessage = {
          type: 'success',
          text: 'Development NPC shared work schedule with you.',
        };
      } else {
        this.feedbackMessage = {
          type: 'info',
          text: `Simulation advanced by ${advanceDurationMs / 1000}s.`,
        };
      }
      this.emit();
      return true;
    } else {
      this.status = 'SERVER_ERROR';
      this.errorMessage = simRes.error?.message ?? 'Simulation step failed';
      this.lastCommandResult = { success: false, message: this.errorMessage };
      this.emit();
      return false;
    }
  }

  /**
   * Reconciles the legacy activeOrder compatibility view from authoritative pendingOrders.
   */
  private reconcileActiveOrder(lastCommandName?: string): void {
    if (this.pendingOrders.length > 0) {
      const existing = this.activeOrder ? this.pendingOrders.find((o) => o.id === this.activeOrder?.id) : undefined;
      const target = existing ?? this.pendingOrders[0];
      this.activeOrder = {
        id: target.id,
        status: target.status,
        readyAt: target.readyAt,
        totalAmountMinor: target.totalAmountMinor,
        currency: target.currency,
        lines: this.activeOrder?.id === target.id ? this.activeOrder.lines : [],
      };
    } else if (lastCommandName === 'collectOrder' && this.activeOrder) {
      this.activeOrder.status = 'fulfilled';
    } else {
      this.activeOrder = null;
    }
  }
}
