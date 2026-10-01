import {
  PresentationModel,
  InspectableEntity,
  findInspectableEntity,
  ClientAffordance,
} from './projections.js';
import { ClientSessionState } from './session.js';

interface ClickableRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  entityId: string;
}

export interface ProximityPrompt {
  id: string;
  action: string;
  label: string;
  payload: Record<string, unknown>;
  x: number;
  y: number;
}

export interface DialogueBubble {
  agentId: string;
  speakerX: number;
  speakerY: number;
  text: string;
  expiresAt: number;
}

export class WorldRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Milestone 53: 2D Locomotion & Visual Presentation State
  private playerVisualX: number = 200;
  private playerVisualY: number = 302;
  private playerFacing: 'left' | 'right' = 'right';
  private isMoving: boolean = false;
  private walkCycle: number = 0;
  private lastLocationId: string | null = null;
  private moveLeftHeld: boolean = false;
  private moveRightHeld: boolean = false;
  private lastFrameTimestamp: number = 0;
  private animationFrameId: number | null = null;
  private activeProximityPrompt: ProximityPrompt | null = null;

  // Milestone 54: Dialogue Bubble Presentation State
  private activeDialogueBubble: DialogueBubble | null = null;
  private lastProcessedDialogueTimestamp: number = 0;

  private hudTimeEl: HTMLElement | null = null;
  private hudCivilTimeEl: HTMLElement | null = null;
  private hudRestaurantItemEl: HTMLElement | null = null;
  private hudRestaurantStatusEl: HTMLElement | null = null;
  private hudLocationEl: HTMLElement | null = null;
  private hudContextEl: HTMLElement | null = null;
  private hudPlayerEl: HTMLElement | null = null;
  private hudStatusEl: HTMLElement | null = null;
  private actionPanelEl: HTMLElement | null = null;
  private notificationEl: HTMLElement | null = null;
  private feedbackEl: HTMLElement | null = null;
  private perceptionLocationEl: HTMLElement | null = null;
  private perceptionEntitiesEl: HTMLElement | null = null;
  private perceptionAgentsEl: HTMLElement | null = null;
  private inspectionContentEl: HTMLElement | null = null;
  private inspectionCloseBtn: HTMLElement | null = null;
  private debugWorldTimeEl: HTMLElement | null = null;
  private debugPlayerPlaceEl: HTMLElement | null = null;
  private debugSelectedDestinationEl: HTMLElement | null = null;
  private debugLastCommandEl: HTMLElement | null = null;
  private debugCommandResultEl: HTMLElement | null = null;
  private debugLastErrorEl: HTMLElement | null = null;
  private debugBtnInvalidMoveEl: HTMLElement | null = null;

  // Restaurant Service & Order Experience (Milestone 44)
  private restaurantServicePanelEl: HTMLElement | null = null;
  private serviceCounterStatusEl: HTMLElement | null = null;
  private servicePromptTitleEl: HTMLElement | null = null;
  private servicePromptDescEl: HTMLElement | null = null;
  private serviceOrderFormEl: HTMLElement | null = null;
  private orderOfferingSelectEl: HTMLSelectElement | null = null;
  private orderQuantityInputEl: HTMLInputElement | null = null;
  private orderSubmitBtnEl: HTMLElement | null = null;
  private serviceActiveOrderBoxEl: HTMLElement | null = null;
  private activeOrderStatusBadgeEl: HTMLElement | null = null;
  private activeOrderIdEl: HTMLElement | null = null;
  private activeOrderTotalEl: HTMLElement | null = null;
  private activeOrderReadyAtEl: HTMLElement | null = null;
  private orderCollectBtnEl: HTMLButtonElement | null = null;
  private playerInventoryListEl: HTMLElement | null = null;

  // Milestone 44 Development Diagnostics
  private debugAdvanceToOpenEl: HTMLElement | null = null;
  private debugAdvancePrepEl: HTMLElement | null = null;
  private debugTestInvalidQtyEl: HTMLElement | null = null;
  private debugTestInsufficientFundsEl: HTMLElement | null = null;
  private debugTestDeliveryModeEl: HTMLElement | null = null;
  private debugTestInvalidCollectEl: HTMLElement | null = null;

  private onActionCallback: ((commandName: string, payload: Record<string, unknown>) => void) | null = null;
  private onSelectEntityCallback: ((entity: InspectableEntity | null) => void) | null = null;
  private onStepSimulationCallback: ((advanceDurationMs: number) => void) | null = null;
  private onInquireServiceCallback: ((staffNpcId: string) => void) | null = null;
  private autoInquiredStaffId: string | null = null;
  private clickableRegions: ClickableRegion[] = [];
  private currentSessionState: ClientSessionState | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      this.canvas = document.getElementById('world-canvas') as HTMLCanvasElement | null;
      if (this.canvas) {
        this.ctx = this.canvas.getContext('2d');
        this.canvas.addEventListener('click', (e) => {
          this.handleCanvasClick(e);
        });
      }
      this.hudTimeEl = document.getElementById('hud-time');
      this.hudCivilTimeEl = document.getElementById('hud-civil-time');
      this.hudRestaurantItemEl = document.getElementById('hud-restaurant-item');
      this.hudRestaurantStatusEl = document.getElementById('hud-restaurant-status');
      this.hudLocationEl = document.getElementById('hud-location');
      this.hudContextEl = document.getElementById('hud-context');
      this.hudPlayerEl = document.getElementById('hud-player');
      this.hudStatusEl = document.getElementById('hud-status');
      this.actionPanelEl = document.getElementById('action-buttons');
      this.notificationEl = document.getElementById('notification-message');
      this.feedbackEl = document.getElementById('feedback-message');
      this.perceptionLocationEl = document.getElementById('perception-location');
      this.perceptionEntitiesEl = document.getElementById('perception-entities');
      this.perceptionAgentsEl = document.getElementById('perception-agents');
      this.inspectionContentEl = document.getElementById('inspection-content');
      this.inspectionCloseBtn = document.getElementById('inspection-close-btn');
      this.debugWorldTimeEl = document.getElementById('debug-world-time');
      this.debugPlayerPlaceEl = document.getElementById('debug-player-place');
      this.debugSelectedDestinationEl = document.getElementById('debug-selected-destination');
      this.debugLastCommandEl = document.getElementById('debug-last-command');
      this.debugCommandResultEl = document.getElementById('debug-command-result');
      this.debugLastErrorEl = document.getElementById('debug-last-error');
      this.debugBtnInvalidMoveEl = document.getElementById('debug-btn-invalid-move');

      // M44 Restaurant Service Elements
      this.restaurantServicePanelEl = document.getElementById('restaurant-service-panel');
      this.serviceCounterStatusEl = document.getElementById('service-counter-status');
      this.servicePromptTitleEl = document.getElementById('service-prompt-title');
      this.servicePromptDescEl = document.getElementById('service-prompt-desc');
      this.serviceOrderFormEl = document.getElementById('service-order-form');
      this.orderOfferingSelectEl = document.getElementById('order-offering-select') as HTMLSelectElement | null;
      this.orderQuantityInputEl = document.getElementById('order-quantity-input') as HTMLInputElement | null;
      this.orderSubmitBtnEl = document.getElementById('order-submit-btn');
      this.serviceActiveOrderBoxEl = document.getElementById('service-active-order-box');
      this.activeOrderStatusBadgeEl = document.getElementById('active-order-status-badge');
      this.activeOrderIdEl = document.getElementById('active-order-id');
      this.activeOrderTotalEl = document.getElementById('active-order-total');
      this.activeOrderReadyAtEl = document.getElementById('active-order-ready-at');
      this.orderCollectBtnEl = document.getElementById('order-collect-btn') as HTMLButtonElement | null;
      this.playerInventoryListEl = document.getElementById('player-inventory-list');

      // M44 Debug Diagnostic Buttons
      this.debugAdvanceToOpenEl = document.getElementById('debug-advance-to-open');
      this.debugAdvancePrepEl = document.getElementById('debug-advance-prep');
      this.debugTestInvalidQtyEl = document.getElementById('debug-test-invalid-qty');
      this.debugTestInsufficientFundsEl = document.getElementById('debug-test-insufficient-funds');
      this.debugTestDeliveryModeEl = document.getElementById('debug-test-delivery-mode');
      this.debugTestInvalidCollectEl = document.getElementById('debug-test-invalid-collect');

      if (this.debugBtnInvalidMoveEl) {
        this.debugBtnInvalidMoveEl.addEventListener('click', () => {
          if (this.onActionCallback) {
            this.onActionCallback('enterBuilding', { buildingId: 'building:does-not-exist' });
          }
        });
      }

      // Order Submit Action
      if (this.orderSubmitBtnEl) {
        this.orderSubmitBtnEl.addEventListener('click', () => {
          if (!this.onActionCallback || !this.currentSessionState?.model) return;
          const offeringId = this.orderOfferingSelectEl?.value;
          if (!offeringId) return;
          const quantity = parseInt(this.orderQuantityInputEl?.value || '1', 10);
          this.onActionCallback('placeOrder', {
            restaurantId: this.currentSessionState.model.locationId,
            lines: [{ offeringId, quantity }],
            fulfillmentMode: 'pickup',
          });
        });
      }

      // Order Collect Action
      if (this.orderCollectBtnEl) {
        this.orderCollectBtnEl.addEventListener('click', () => {
          if (!this.onActionCallback || !this.currentSessionState?.activeOrder) return;
          this.onActionCallback('collectOrder', {
            orderId: this.currentSessionState.activeOrder.id,
          });
        });
      }

      // Debug: Advance to 16:00 UTC (Operational Hours: 10:00 AM local civil time in Ciudad Juárez)
      if (this.debugAdvanceToOpenEl) {
        this.debugAdvanceToOpenEl.addEventListener('click', () => {
          if (!this.onStepSimulationCallback || !this.currentSessionState?.model) return;
          const currentDate = new Date(this.currentSessionState.model.worldTime);
          const targetDate = new Date(currentDate.getTime());
          targetDate.setUTCHours(16, 0, 0, 0);
          let diffMs = targetDate.getTime() - currentDate.getTime();
          if (diffMs <= 0) {
            targetDate.setUTCDate(targetDate.getUTCDate() + 1);
            diffMs = targetDate.getTime() - currentDate.getTime();
          }
          this.onStepSimulationCallback(diffMs);
        });
      }

      // Debug: Advance 5 minutes (Order Preparation Duration)
      if (this.debugAdvancePrepEl) {
        this.debugAdvancePrepEl.addEventListener('click', () => {
          if (this.onStepSimulationCallback) {
            this.onStepSimulationCallback(300000);
          }
        });
      }

      // Debug: Test Invalid Quantity (0 -> 400 Bad Request)
      if (this.debugTestInvalidQtyEl) {
        this.debugTestInvalidQtyEl.addEventListener('click', () => {
          if (this.onActionCallback) {
            this.onActionCallback('placeOrder', {
              restaurantId: 'restaurant:development-restaurant',
              lines: [{ offeringId: 'offering:development-coffee', quantity: 0 }],
              fulfillmentMode: 'pickup',
            });
          }
        });
      }

      // Debug: Test Insufficient Funds (Qty 5 -> $25 > $20 -> 422 Unprocessable Entity)
      if (this.debugTestInsufficientFundsEl) {
        this.debugTestInsufficientFundsEl.addEventListener('click', () => {
          if (this.onActionCallback) {
            this.onActionCallback('placeOrder', {
              restaurantId: 'restaurant:development-restaurant',
              lines: [{ offeringId: 'offering:development-coffee', quantity: 5 }],
              fulfillmentMode: 'pickup',
            });
          }
        });
      }

      // Debug: Test Delivery Mode (Deferred -> 422 Unprocessable Entity)
      if (this.debugTestDeliveryModeEl) {
        this.debugTestDeliveryModeEl.addEventListener('click', () => {
          if (this.onActionCallback) {
            this.onActionCallback('placeOrder', {
              restaurantId: 'restaurant:development-restaurant',
              lines: [{ offeringId: 'offering:development-coffee', quantity: 1 }],
              fulfillmentMode: 'delivery',
            });
          }
        });
      }

      // Debug: Test Premature Collect while preparing
      if (this.debugTestInvalidCollectEl) {
        this.debugTestInvalidCollectEl.addEventListener('click', () => {
          if (this.onActionCallback) {
            const orderId = this.currentSessionState?.activeOrder?.id || 'order:invalid';
            this.onActionCallback('collectOrder', { orderId });
          }
        });
      }

      if (this.inspectionCloseBtn) {
        this.inspectionCloseBtn.addEventListener('click', () => {
          if (this.onSelectEntityCallback) {
            this.onSelectEntityCallback(null);
          }
        });
      }
    }
  }

  public onAction(callback: (commandName: string, payload: Record<string, unknown>) => void): void {
    this.onActionCallback = callback;
  }

  public onSelectEntity(callback: (entity: InspectableEntity | null) => void): void {
    this.onSelectEntityCallback = callback;
  }

  public onStepSimulation(callback: (advanceDurationMs: number) => void): void {
    this.onStepSimulationCallback = callback;
  }

  public onInquireService(callback: (staffNpcId: string) => void): void {
    this.onInquireServiceCallback = callback;
  }

  private handleCanvasClick(e: MouseEvent): void {
    if (!this.canvas || !this.currentSessionState?.model) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Check hit regions in reverse order (topmost element first)
    const hit = [...this.clickableRegions].reverse().find(
      (r) => clickX >= r.x && clickX <= r.x + r.width && clickY >= r.y && clickY <= r.y + r.height
    );

    if (hit) {
      const entity = findInspectableEntity(this.currentSessionState.model, hit.entityId);
      if (this.onSelectEntityCallback) {
        this.onSelectEntityCallback(entity);
      }
    } else {
      if (this.onSelectEntityCallback) {
        this.onSelectEntityCallback(null);
      }
    }
  }

  public setMoveLeft(held: boolean): void {
    this.moveLeftHeld = held;
    this.updateMovementState();
  }

  public setMoveRight(held: boolean): void {
    this.moveRightHeld = held;
    this.updateMovementState();
  }

  private updateMovementState(): void {
    if (this.moveLeftHeld && !this.moveRightHeld) {
      this.isMoving = true;
      this.playerFacing = 'left';
    } else if (this.moveRightHeld && !this.moveLeftHeld) {
      this.isMoving = true;
      this.playerFacing = 'right';
    } else {
      this.isMoving = false;
    }
  }

  public getPlayerVisualState(): {
    x: number;
    y: number;
    facing: 'left' | 'right';
    isMoving: boolean;
    walkCycle: number;
  } {
    return {
      x: this.playerVisualX,
      y: this.playerVisualY,
      facing: this.playerFacing,
      isMoving: this.isMoving,
      walkCycle: this.walkCycle,
    };
  }

  public setPlayerVisualX(x: number): void {
    this.playerVisualX = x;
    if (this.currentSessionState?.model) {
      this.evaluateProximityPrompt(this.currentSessionState.model);
    }
  }

  public getActiveProximityPrompt(): ProximityPrompt | null {
    return this.activeProximityPrompt;
  }

  public getActiveDialogueBubble(): DialogueBubble | null {
    return this.activeDialogueBubble;
  }

  public getAgentVisualPosition(
    model: PresentationModel,
    agentId: string
  ): { x: number; y: number } | null {
    const otherAgents = model.agents.filter((a) => a.id !== model.activePlayerId);
    const index = otherAgents.findIndex((a) => a.id === agentId);
    if (index === -1) return null;

    const width = 800;
    const height = 420;

    if (model.context === 'STREET') {
      return {
        x: Math.round(width * 0.3 + index * 85),
        y: Math.round(height * 0.72),
      };
    } else if (model.context === 'BUILDING') {
      return {
        x: Math.round(width * 0.58 + index * 70),
        y: Math.round(height * 0.75),
      };
    } else if (model.context === 'RESTAURANT') {
      return {
        x: Math.round(width * 0.58 + index * 80),
        y: Math.round(height * 0.76),
      };
    } else {
      return {
        x: Math.round(400 + index * 80),
        y: 300,
      };
    }
  }

  public showDialogueBubble(agentId: string, text: string, durationMs: number = 8000): void {
    const model = this.currentSessionState?.model;
    if (!model) return;
    const pos = this.getAgentVisualPosition(model, agentId);
    if (!pos) return;

    this.activeDialogueBubble = {
      agentId,
      speakerX: pos.x,
      speakerY: pos.y,
      text,
      expiresAt: performance.now() + durationMs,
    };

    // Ensure player faces the speaker during interaction
    this.playerFacing = this.playerVisualX < pos.x ? 'right' : 'left';
  }

  public updateVisualState(dtMs: number): void {
    const dt = Math.max(0, Math.min(100, dtMs));
    const speed = 220; // px/sec

    let dx = 0;
    if (this.moveLeftHeld && !this.moveRightHeld) {
      dx = -speed * (dt / 1000);
      this.playerFacing = 'left';
      this.isMoving = true;
    } else if (this.moveRightHeld && !this.moveLeftHeld) {
      dx = speed * (dt / 1000);
      this.playerFacing = 'right';
      this.isMoving = true;
    } else {
      this.isMoving = false;
    }

    if (this.isMoving) {
      this.walkCycle += dt / 1000;
    }

    const model = this.currentSessionState?.model;
    const context = model?.context || 'UNKNOWN';

    // Scene walkway bounds
    let minX = 40;
    let maxX = 760;
    if (context === 'BUILDING') {
      minX = 60;
      maxX = 740;
    } else if (context === 'RESTAURANT') {
      minX = 50;
      maxX = 740;
    }

    this.playerVisualX = Math.max(minX, Math.min(maxX, this.playerVisualX + dx));

    // Milestone 54: Update active dialogue bubble expiration and distance dismissal (> 80px)
    if (this.activeDialogueBubble) {
      if (performance.now() > this.activeDialogueBubble.expiresAt) {
        this.activeDialogueBubble = null;
      } else if (Math.abs(this.playerVisualX - this.activeDialogueBubble.speakerX) > 80) {
        this.activeDialogueBubble = null;
      }
    }

    if (model) {
      this.evaluateProximityPrompt(model);
    }
  }

  public reconcileLocationEntryPosition(model: PresentationModel | null): void {
    if (!model) return;

    this.activeDialogueBubble = null;
    const prevLocation = this.lastLocationId;
    const newLocation = model.locationId;
    this.lastLocationId = newLocation;

    if (model.context === 'STREET') {
      this.playerVisualY = 302;
      if (prevLocation && prevLocation.startsWith('building:')) {
        // Exited building onto street - place outside the exited building door
        const idx = model.accessibleBuildings.findIndex((b) => b.id === prevLocation);
        if (idx !== -1) {
          const buildings = model.accessibleBuildings;
          const bldgWidth = 170;
          const spacing = 35;
          const totalBldgWidth = buildings.length * bldgWidth + Math.max(0, buildings.length - 1) * spacing;
          const startX = Math.max(30, (800 - totalBldgWidth) / 2);
          this.playerVisualX = Math.round(startX + idx * (bldgWidth + spacing) + bldgWidth / 2);
        } else {
          this.playerVisualX = 298;
        }
        this.playerFacing = 'right';
      } else {
        // Default street spawn
        this.playerVisualX = 200;
        this.playerFacing = 'right';
      }
    } else if (model.context === 'BUILDING') {
      this.playerVisualY = 315;
      if (prevLocation && prevLocation.startsWith('restaurant:')) {
        // Exited restaurant back into lobby (at right portal x = 715)
        this.playerVisualX = 660;
        this.playerFacing = 'left';
      } else {
        // Entered from street (at left door x = 82)
        this.playerVisualX = 110;
        this.playerFacing = 'right';
      }
    } else if (model.context === 'RESTAURANT') {
      this.playerVisualY = 319;
      // Entered from lobby (at left door x = 58)
      this.playerVisualX = 100;
      this.playerFacing = 'right';
    } else {
      this.playerVisualX = 400;
      this.playerVisualY = 300;
    }

    this.evaluateProximityPrompt(model);
  }

  public evaluateProximityPrompt(model: PresentationModel): void {
    this.activeProximityPrompt = null;

    // Milestone 54: Social Proximity Check across all scene contexts (highest priority when close to an NPC)
    const otherAgents = model.agents.filter((a) => a.id !== model.activePlayerId);
    for (const agent of otherAgents) {
      const pos = this.getAgentVisualPosition(model, agent.id);
      if (pos && Math.abs(this.playerVisualX - pos.x) <= 55) {
        if (!agent.isAcquainted) {
          this.activeProximityPrompt = {
            id: `introduce-${agent.id}`,
            action: 'introduceAgent',
            label: `[E] Introduce to ${agent.name}`,
            payload: { targetAgentId: agent.id },
            x: pos.x,
            y: 180,
          };
          return;
        } else {
          this.activeProximityPrompt = {
            id: `greet-${agent.id}`,
            action: 'greetAgent',
            label: `[E] Greet ${agent.name}`,
            payload: { targetAgentId: agent.id },
            x: pos.x,
            y: 180,
          };
          return;
        }
      }
    }

    if (model.context === 'STREET') {
      // Check building entrance doors
      const buildings = model.accessibleBuildings;
      const bldgWidth = 170;
      const spacing = 35;
      const totalBldgWidth = buildings.length * bldgWidth + Math.max(0, buildings.length - 1) * spacing;
      const startX = Math.max(30, (800 - totalBldgWidth) / 2);

      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const doorX = startX + i * (bldgWidth + spacing) + bldgWidth / 2;
        if (Math.abs(this.playerVisualX - doorX) <= 60) {
          this.activeProximityPrompt = {
            id: `enter-${b.id}`,
            action: 'enterBuilding',
            label: `[E] Enter ${b.name}`,
            payload: { buildingId: b.id },
            x: doorX,
            y: 195,
          };
          return;
        }
      }

      // Check street transitions if any
      if (model.neighboringStreets.length > 0) {
        if (this.playerVisualX <= 75) {
          const s0 = model.neighboringStreets[0];
          this.activeProximityPrompt = {
            id: `street-${s0.id}`,
            action: 'traverseStreet',
            label: `[E] Walk to ${s0.name}`,
            payload: { targetStreetId: s0.id },
            x: 95,
            y: 270,
          };
          return;
        }
        if (model.neighboringStreets.length > 1 && this.playerVisualX >= 725) {
          const s1 = model.neighboringStreets[1];
          this.activeProximityPrompt = {
            id: `street-${s1.id}`,
            action: 'traverseStreet',
            label: `[E] Walk to ${s1.name}`,
            payload: { targetStreetId: s1.id },
            x: 705,
            y: 270,
          };
          return;
        }
      }
    } else if (model.context === 'BUILDING') {
      // Exit door to parent street (left door at x = 82)
      if (Math.abs(this.playerVisualX - 82) <= 60) {
        this.activeProximityPrompt = {
          id: 'leave-building',
          action: 'leaveBuilding',
          label: model.parentName ? `[E] Leave Building to ${model.parentName}` : '[E] Leave Building',
          payload: {},
          x: 82,
          y: 180,
        };
        return;
      }

      // Restaurant portal (right door at rx + 185 = 715)
      if (model.containedRestaurants.length > 0) {
        const rest = model.containedRestaurants[0];
        if (Math.abs(this.playerVisualX - 715) <= 65) {
          this.activeProximityPrompt = {
            id: `enter-${rest.id}`,
            action: 'enterRestaurant',
            label: `[E] Enter ${rest.name}`,
            payload: { restaurantId: rest.id },
            x: 715,
            y: 180,
          };
          return;
        }
      }
    } else if (model.context === 'RESTAURANT') {
      // Exit door to parent building (left door at x = 58)
      if (Math.abs(this.playerVisualX - 58) <= 60) {
        this.activeProximityPrompt = {
          id: 'exit-restaurant',
          action: 'exitRestaurant',
          label: model.parentName ? `[E] Exit to ${model.parentName}` : '[E] Exit Restaurant',
          payload: {},
          x: 58,
          y: 180,
        };
        return;
      }

      // Service Counter (x >= 520)
      if (this.playerVisualX >= 520) {
        const staffAgent = model.agents.find((a) => a.id !== model.activePlayerId);
        if (staffAgent) {
          const readyOrder = (model.pendingOrders || []).find(
            (o) => o.restaurantId === model.locationId && o.status === 'ready'
          );
          if (readyOrder) {
            this.activeProximityPrompt = {
              id: `collect-${readyOrder.id}`,
              action: 'collectOrder',
              label: `[E] Collect Order (${readyOrder.id})`,
              payload: { orderId: readyOrder.id },
              x: Math.min(this.playerVisualX, 580),
              y: 190,
            };
            return;
          }

          if (!this.currentSessionState?.restaurantService) {
            this.activeProximityPrompt = {
              id: `inquire-${staffAgent.id}`,
              action: 'inquireRestaurantService',
              label: `[E] Talk to Service Staff (${staffAgent.name})`,
              payload: { staffNpcId: staffAgent.id },
              x: Math.min(this.playerVisualX, 580),
              y: 190,
            };
            return;
          }

          const preparingOrder = (model.pendingOrders || []).find(
            (o) => o.restaurantId === model.locationId && o.status === 'preparing'
          );
          if (preparingOrder) {
            this.activeProximityPrompt = {
              id: `waiting-${preparingOrder.id}`,
              action: 'none',
              label: `Order in Preparation (${preparingOrder.id})`,
              payload: {},
              x: Math.min(this.playerVisualX, 580),
              y: 190,
            };
            return;
          }

          // Service is active, ready to place order
          const defaultOfferingId =
            this.orderOfferingSelectEl?.value ||
            model.offerings[0]?.id ||
            'offering:development-coffee';
          const defaultQty = parseInt(this.orderQuantityInputEl?.value || '1', 10);
          this.activeProximityPrompt = {
            id: 'order-counter',
            action: 'placeOrder',
            label: `[E] Place Order at Counter`,
            payload: {
              restaurantId: model.locationId,
              lines: [{ offeringId: defaultOfferingId, quantity: defaultQty }],
              fulfillmentMode: 'pickup',
            },
            x: Math.min(this.playerVisualX, 580),
            y: 190,
          };
          return;
        }
      }
    }
  }

  public startAnimationLoop(): void {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return;
    }
    if (this.animationFrameId !== null) return;
    this.lastFrameTimestamp = performance.now();
    const step = (timestamp: number) => {
      const dt = Math.min(100, Math.max(0, timestamp - this.lastFrameTimestamp));
      this.lastFrameTimestamp = timestamp;
      this.updateVisualState(dt);
      if (this.currentSessionState?.model && this.ctx && this.canvas) {
        this.clickableRegions = [];
        this.renderCanvas(this.currentSessionState.model, this.currentSessionState.selectedEntity);
      }
      this.animationFrameId = window.requestAnimationFrame(step);
    };
    this.animationFrameId = window.requestAnimationFrame(step);
  }

  public stopAnimationLoop(): void {
    if (typeof window !== 'undefined' && this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Main render dispatch called on session state change.
   */
  public render(sessionState: ClientSessionState): void {
    this.currentSessionState = sessionState;

    // Location transition reconciliation
    if (sessionState.model && sessionState.model.locationId !== this.lastLocationId) {
      this.reconcileLocationEntryPosition(sessionState.model);
    } else if (sessionState.model) {
      this.evaluateProximityPrompt(sessionState.model);
    }

    // Milestone 54: Reconcile incoming authoritative dialogue response
    if (
      sessionState.dialogueResponse &&
      sessionState.dialogueResponse.timestamp !== this.lastProcessedDialogueTimestamp
    ) {
      this.lastProcessedDialogueTimestamp = sessionState.dialogueResponse.timestamp;
      this.showDialogueBubble(
        sessionState.dialogueResponse.speakerAgentId,
        sessionState.dialogueResponse.text
      );
    }

    this.renderHUD(sessionState);
    this.renderNotification(sessionState);
    this.renderPerception(sessionState);
    this.renderInspection(sessionState);
    this.renderActions(sessionState);
    this.renderRestaurantService(sessionState);
    this.renderInventory(sessionState);
    this.renderDebugPanel(sessionState);

    if (this.ctx && this.canvas && sessionState.model) {
      this.clickableRegions = [];
      this.renderCanvas(sessionState.model, sessionState.selectedEntity);
    }

    // Start continuous animation loop in browser environment
    this.startAnimationLoop();
  }

  private renderDebugPanel(sessionState: ClientSessionState): void {
    const model = sessionState.model;

    if (this.debugWorldTimeEl) {
      this.debugWorldTimeEl.textContent = model?.worldTime || '---';
    }

    if (this.debugPlayerPlaceEl) {
      this.debugPlayerPlaceEl.textContent = model ? `${model.locationName} (${model.locationId})` : '---';
    }

    if (this.debugSelectedDestinationEl) {
      this.debugSelectedDestinationEl.textContent = sessionState.selectedEntity
        ? `${sessionState.selectedEntity.name} (${sessionState.selectedEntity.id})`
        : 'None';
    }

    if (this.debugLastCommandEl) {
      this.debugLastCommandEl.textContent = sessionState.lastCommandName || 'None';
    }

    if (this.debugCommandResultEl) {
      if (sessionState.lastCommandResult) {
        const res = sessionState.lastCommandResult;
        this.debugCommandResultEl.textContent = res.success
          ? `SUCCESS: ${res.message || 'OK'}`
          : `FAILED: ${res.message || 'Error'}`;
        this.debugCommandResultEl.style.color = res.success ? '#10b981' : '#f97316';
      } else {
        this.debugCommandResultEl.textContent = '---';
        this.debugCommandResultEl.style.color = 'inherit';
      }
    }

    if (this.debugLastErrorEl) {
      this.debugLastErrorEl.textContent = sessionState.errorMessage || 'None';
      this.debugLastErrorEl.style.color = sessionState.errorMessage ? '#ef4444' : 'inherit';
    }
  }

  private renderHUD(sessionState: ClientSessionState): void {
    const model = sessionState.model;

    if (this.hudStatusEl) {
      this.hudStatusEl.textContent = sessionState.status;
      this.hudStatusEl.className = `status-badge status-${sessionState.status.toLowerCase()}`;
    }

    if (!model) {
      if (this.hudTimeEl) this.hudTimeEl.textContent = '---';
      if (this.hudCivilTimeEl) this.hudCivilTimeEl.textContent = '---';
      if (this.hudRestaurantItemEl) this.hudRestaurantItemEl.style.display = 'none';
      if (this.hudLocationEl) this.hudLocationEl.textContent = 'Connecting...';
      if (this.hudContextEl) this.hudContextEl.textContent = '---';
      if (this.hudPlayerEl) this.hudPlayerEl.textContent = '---';
      return;
    }

    if (this.hudTimeEl) {
      this.hudTimeEl.textContent = model.formattedWorldTime ?? (
        Number.isNaN(new Date(model.worldTime).getTime())
          ? model.worldTime
          : `${new Date(model.worldTime).toUTCString().replace('GMT', 'UTC')}`
      );
    }

    if (this.hudCivilTimeEl) {
      this.hudCivilTimeEl.textContent = model.temporalContext?.formattedDisplay ?? '---';
    }

    if (this.hudRestaurantItemEl && this.hudRestaurantStatusEl) {
      if (model.operationalState) {
        this.hudRestaurantItemEl.style.display = 'flex';
        this.hudRestaurantStatusEl.textContent = model.operationalState.toUpperCase();
        this.hudRestaurantStatusEl.className = `operational-badge operational-${model.operationalState}`;
      } else {
        this.hudRestaurantItemEl.style.display = 'none';
      }
    }

    if (this.hudLocationEl) {
      this.hudLocationEl.textContent = `${model.locationName} [${model.locationId}]`;
    }

    if (this.hudContextEl) {
      this.hudContextEl.textContent = model.context;
      this.hudContextEl.className = `context-badge context-${model.context.toLowerCase()}`;
    }

    if (this.hudPlayerEl) {
      if (model.playerActivity && model.playerActivity.completedAt === null) {
        const startedMs = Date.parse(model.playerActivity.startedAt);
        const currentMs = Date.parse(model.worldTime);
        const remainingMs = Math.max(0, startedMs + model.playerActivity.durationMs - currentMs);
        const remainingMin = Math.ceil(remainingMs / 60000);
        let activityLabel =
          model.playerActivity.activity === 'having-coffee' ? 'Having Coffee' : 'Eating Pan Dulce';
        if (model.playerActivity.companionAgentId) {
          const companion = model.agents.find((a) => a.id === model.playerActivity?.companionAgentId);
          const companionName = companion ? companion.name : 'Development NPC';
          activityLabel = `Having Coffee with ${companionName}`;
        }
        this.hudPlayerEl.textContent = `${model.activePlayerId} • ${activityLabel} (${remainingMin}m remaining)`;
      } else {
        this.hudPlayerEl.textContent = model.activePlayerId;
      }
    }
  }

  private renderNotification(sessionState: ClientSessionState): void {
    // Error notification banner
    if (this.notificationEl) {
      if (sessionState.errorMessage) {
        this.notificationEl.textContent = sessionState.errorMessage;
        this.notificationEl.style.display = 'block';
        this.notificationEl.className =
          sessionState.status === 'DOMAIN_ERROR' ? 'banner domain-error' : 'banner server-error';
      } else {
        this.notificationEl.textContent = '';
        this.notificationEl.style.display = 'none';
        this.notificationEl.className = 'banner hidden';
      }
    }

    // Success / transient feedback banner
    if (this.feedbackEl) {
      if (sessionState.feedbackMessage) {
        this.feedbackEl.textContent = sessionState.feedbackMessage.text;
        this.feedbackEl.style.display = 'block';
        this.feedbackEl.className = 'banner success';
      } else {
        this.feedbackEl.textContent = '';
        this.feedbackEl.style.display = 'none';
        this.feedbackEl.className = 'banner hidden';
      }
    }
  }

  /**
   * Renders the authoritative perception hierarchy (Milestone 32).
   * Communicates "Where am I?", "What is here?", and "Who is here?".
   */
  private renderPerception(sessionState: ClientSessionState): void {
    const model = sessionState.model;
    if (!model) {
      if (this.perceptionLocationEl) this.perceptionLocationEl.textContent = 'Connecting...';
      if (this.perceptionEntitiesEl) this.perceptionEntitiesEl.textContent = 'None';
      if (this.perceptionAgentsEl) this.perceptionAgentsEl.textContent = 'None';
      return;
    }

    // 1. Where am I?
    if (this.perceptionLocationEl) {
      let locText = `${model.locationName} (${model.locationType})`;
      if (model.parentName) {
        locText += ` — within ${model.parentName}`;
      }
      if (model.operationalState) {
        locText += ` [${model.operationalState.toUpperCase()}]`;
      }
      this.perceptionLocationEl.textContent = locText;
    }

    // 2. What is here?
    if (this.perceptionEntitiesEl) {
      this.perceptionEntitiesEl.innerHTML = '';
      const chips: Array<{ id: string; label: string }> = [];

      // Current location chip
      chips.push({ id: model.locationId, label: `📍 ${model.locationName}` });

      for (const b of model.accessibleBuildings) {
        chips.push({ id: b.id, label: `🏢 ${b.name}` });
      }
      for (const s of model.neighboringStreets) {
        chips.push({ id: s.id, label: `🛣️ ${s.name}` });
      }
      for (const r of model.containedRestaurants) {
        const restPending = model.pendingOrders?.filter((o) => o.restaurantId === r.id) ?? [];
        const pendingNote = restPending.length > 0 ? ` (${restPending.length} Order${restPending.length > 1 ? 's' : ''} Pending)` : '';
        chips.push({ id: r.id, label: `🍽️ ${r.name}${pendingNote}` });
      }
      for (const off of model.offerings) {
        const priceFmt = (off.priceMinor / 100).toFixed(2);
        chips.push({ id: off.id, label: `☕ ${off.name} ($${priceFmt})` });
      }
      for (const opp of model.opportunities) {
        chips.push({ id: opp.id, label: `⭐ ${opp.name}` });
      }

      if (model.context !== 'RESTAURANT' && model.pendingOrders && model.pendingOrders.length > 0) {
        for (const po of model.pendingOrders) {
          const statusText = po.status === 'ready' ? 'Ready - Pickup Deferred' : 'Preparing';
          chips.push({ id: po.id, label: `📦 ${po.id} (${statusText})` });
        }
      }

      if (chips.length === 0) {
        this.perceptionEntitiesEl.textContent = 'No other observable entities.';
      } else {
        for (const chip of chips) {
          const btn = document.createElement('span');
          btn.className = 'entity-chip';
          if (sessionState.selectedEntity?.id === chip.id) {
            btn.classList.add('selected');
          }
          btn.textContent = chip.label;
          btn.addEventListener('click', () => {
            if (this.onSelectEntityCallback && model) {
              this.onSelectEntityCallback(findInspectableEntity(model, chip.id));
            }
          });
          this.perceptionEntitiesEl.appendChild(btn);
        }
      }
    }

    // 3. Who is here?
    if (this.perceptionAgentsEl) {
      this.perceptionAgentsEl.innerHTML = '';
      if (model.agents.length === 0) {
        this.perceptionAgentsEl.textContent = 'No people present.';
      } else {
        for (const ag of model.agents) {
          const btn = document.createElement('span');
          btn.className = 'entity-chip';
          if (sessionState.selectedEntity?.id === ag.id) {
            btn.classList.add('selected');
          }
          const isPlayer = ag.id === model.activePlayerId;
          const statusText = isPlayer ? ' (YOU)' : ag.isAcquainted ? ' (Acquainted)' : '';
          btn.textContent = `👤 ${ag.name}${statusText}`;
          btn.addEventListener('click', () => {
            if (this.onSelectEntityCallback && model) {
              this.onSelectEntityCallback(findInspectableEntity(model, ag.id));
            }
          });
          this.perceptionAgentsEl.appendChild(btn);
        }
      }
    }
  }

  /**
   * Renders the entity inspection panel strictly displaying projected facts (Milestone 32).
   */
  private renderInspection(sessionState: ClientSessionState): void {
    if (!this.inspectionContentEl) return;

    this.inspectionContentEl.innerHTML = '';
    const entity = sessionState.selectedEntity;

    if (!entity) {
      const placeholder = document.createElement('p');
      placeholder.className = 'inspection-empty';
      placeholder.textContent = 'Select any observable entity or avatar to inspect its authoritative facts.';
      this.inspectionContentEl.appendChild(placeholder);
      return;
    }

    const header = document.createElement('div');
    header.className = 'inspection-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'inspection-name';
    nameEl.textContent = entity.name;

    const badgeEl = document.createElement('span');
    badgeEl.className = 'inspection-badge';
    badgeEl.textContent = entity.kind;

    header.appendChild(nameEl);
    header.appendChild(badgeEl);
    this.inspectionContentEl.appendChild(header);

    const table = document.createElement('div');
    table.className = 'inspection-table';

    // Entity ID row
    const idRow = document.createElement('div');
    idRow.className = 'inspection-row';
    idRow.innerHTML = `<span class="inspection-key">ID</span><span class="inspection-val">${entity.id}</span>`;
    table.appendChild(idRow);

    // Projected fact rows
    for (const [key, val] of Object.entries(entity.details)) {
      if (val !== undefined && val !== null) {
        const row = document.createElement('div');
        row.className = 'inspection-row';
        const keySpan = document.createElement('span');
        keySpan.className = 'inspection-key';
        keySpan.textContent = key;
        const valSpan = document.createElement('span');
        valSpan.className = 'inspection-val';
        valSpan.textContent = String(val);
        row.appendChild(keySpan);
        row.appendChild(valSpan);
        table.appendChild(row);
      }
    }

    this.inspectionContentEl.appendChild(table);
  }

  /**
   * Renders contextual affordance buttons organized into presentation categories: MOVE, INTERACT, ACT.
   */
  private renderActions(sessionState: ClientSessionState): void {
    if (!this.actionPanelEl) return;

    this.actionPanelEl.innerHTML = '';
    const model = sessionState.model;
    if (!model || model.affordances.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-actions';
      emptyMsg.textContent = sessionState.status === 'COMMAND_IN_PROGRESS'
        ? 'Executing action...'
        : 'No actions available at this location.';
      this.actionPanelEl.appendChild(emptyMsg);
      return;
    }

    const disabled = sessionState.status === 'COMMAND_IN_PROGRESS';

    // Group affordances by presentation taxonomy: MOVE, INTERACT, ACT
    const groups: Array<{ name: string; icon: string; classSuffix: string; items: ClientAffordance[] }> = [
      {
        name: 'MOVE',
        icon: '🚶',
        classSuffix: 'move',
        items: model.affordances.filter((a) => a.group === 'MOVE'),
      },
      {
        name: 'INTERACT',
        icon: '💬',
        classSuffix: 'interact',
        items: model.affordances.filter((a) => a.group === 'INTERACT'),
      },
      {
        name: 'ACT / COMMERCE',
        icon: '⚡',
        classSuffix: 'act',
        items: model.affordances.filter((a) => a.group === 'ACT'),
      },
    ];

    const container = document.createElement('div');
    container.className = 'action-groups-container';

    for (const g of groups) {
      if (g.items.length === 0) continue;

      const groupBlock = document.createElement('div');
      groupBlock.className = `action-group group-${g.classSuffix}`;

      const title = document.createElement('div');
      title.className = 'action-group-title';
      title.textContent = `${g.icon} ${g.name}`;
      groupBlock.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'action-grid';

      for (const affordance of g.items) {
        const btn = document.createElement('button');
        btn.id = affordance.id;
        btn.className = `action-button action-${affordance.commandName}`;
        if (affordance.hint) {
          const labelSpan = document.createElement('span');
          labelSpan.className = 'action-label';
          labelSpan.textContent = affordance.label;
          const hintSpan = document.createElement('span');
          hintSpan.className = 'action-hint';
          hintSpan.textContent = affordance.hint;
          btn.appendChild(labelSpan);
          btn.appendChild(hintSpan);
        } else {
          btn.textContent = affordance.label;
        }
        btn.disabled = disabled;

        btn.addEventListener('click', () => {
          if (this.onActionCallback && !disabled) {
            this.onActionCallback(affordance.commandName, affordance.payload);
          }
        });

        grid.appendChild(btn);
      }

      groupBlock.appendChild(grid);
      container.appendChild(groupBlock);
    }

    this.actionPanelEl.appendChild(container);
  }

  /**
   * Renders the authoritative Restaurant Service Counter & Active Order experience (Milestone 44).
   */
  private renderRestaurantService(sessionState: ClientSessionState): void {
    if (!this.restaurantServicePanelEl) return;

    const model = sessionState.model;
    if (!model || model.context !== 'RESTAURANT') {
      this.restaurantServicePanelEl.classList.add('hidden');
      this.restaurantServicePanelEl.style.display = 'none';
      this.autoInquiredStaffId = null;
      return;
    }

    // Display restaurant service panel in RESTAURANT context
    this.restaurantServicePanelEl.classList.remove('hidden');
    this.restaurantServicePanelEl.style.display = 'block';

    const staffAgent = model.agents.find((a) => a.id !== model.activePlayerId);

    // Auto-inquire service if staff is present and service not yet inquired for this staff
    if (staffAgent && !sessionState.restaurantService && this.autoInquiredStaffId !== staffAgent.id) {
      this.autoInquiredStaffId = staffAgent.id;
      if (this.onInquireServiceCallback) {
        this.onInquireServiceCallback(staffAgent.id);
      }
    }

    // 1. Service counter status & prompt description
    if (sessionState.restaurantService) {
      const svc = sessionState.restaurantService;
      if (this.serviceCounterStatusEl) {
        this.serviceCounterStatusEl.textContent = 'Service Counter Open (Staff on Duty)';
      }
      if (this.servicePromptDescEl) {
        this.servicePromptDescEl.textContent = svc.prompt || 'Pickup or delivery?';
      }
      if (this.serviceOrderFormEl) {
        this.serviceOrderFormEl.style.display = 'flex';
      }

      // Populate offerings dropdown
      const offerings = svc.availableOfferings && svc.availableOfferings.length > 0
        ? svc.availableOfferings
        : model.offerings;

      if (this.orderOfferingSelectEl && offerings.length > 0) {
        const currentVal = this.orderOfferingSelectEl.value;
        const currentCount = this.orderOfferingSelectEl.options.length;
        if (currentCount !== offerings.length) {
          this.orderOfferingSelectEl.innerHTML = '';
          for (const off of offerings) {
            const opt = document.createElement('option');
            opt.value = off.id;
            opt.textContent = `${off.name} - $${(off.priceMinor / 100).toFixed(2)} ${off.currency}`;
            this.orderOfferingSelectEl.appendChild(opt);
          }
          if (currentVal) {
            this.orderOfferingSelectEl.value = currentVal;
          }
        }
      }
    } else if (staffAgent) {
      if (this.serviceCounterStatusEl) {
        this.serviceCounterStatusEl.textContent = 'Connecting to Service Counter...';
      }
      if (this.servicePromptDescEl) {
        this.servicePromptDescEl.textContent = 'Approaching counter staff...';
      }
      if (this.serviceOrderFormEl) {
        this.serviceOrderFormEl.style.display = 'flex';
      }
      // Populate offerings from model.offerings if available
      if (this.orderOfferingSelectEl && model.offerings.length > 0 && this.orderOfferingSelectEl.options.length === 0) {
        for (const off of model.offerings) {
          const opt = document.createElement('option');
          opt.value = off.id;
          opt.textContent = `${off.name} - $${(off.priceMinor / 100).toFixed(2)} ${off.currency}`;
          this.orderOfferingSelectEl.appendChild(opt);
        }
      }
    } else {
      if (this.serviceCounterStatusEl) {
        this.serviceCounterStatusEl.textContent = 'Counter Closed (Unstaffed)';
      }
      if (this.servicePromptDescEl) {
        this.servicePromptDescEl.textContent = 'The counter is currently unstaffed. Advance simulation time to operational hours (09:00 - 17:00 UTC).';
      }
      if (this.serviceOrderFormEl) {
        this.serviceOrderFormEl.style.display = 'none';
      }
    }

    // 2. Active / Pending Orders for Current Restaurant (Milestone 52.1)
    if (this.serviceActiveOrderBoxEl) {
      const currentRestaurantOrders = (sessionState.model?.pendingOrders || []).filter(
        (o) => o.restaurantId === model.locationId
      );

      if (currentRestaurantOrders.length === 0) {
        this.serviceActiveOrderBoxEl.classList.add('hidden');
        this.serviceActiveOrderBoxEl.style.display = 'none';
      } else {
        this.serviceActiveOrderBoxEl.classList.remove('hidden');
        this.serviceActiveOrderBoxEl.style.display = 'block';

        this.serviceActiveOrderBoxEl.innerHTML = '';
        for (let i = 0; i < currentRestaurantOrders.length; i++) {
          const order = currentRestaurantOrders[i];
          const isReady = order.status === 'ready';
          const rDate = new Date(order.readyAt);
          const readyFmt = Number.isNaN(rDate.getTime())
            ? order.readyAt
            : rDate.toUTCString().replace('GMT', 'UTC');

          const orderCard = document.createElement('div');
          orderCard.className = 'active-order-item';
          if (i > 0) {
            orderCard.style.marginTop = '12px';
            orderCard.style.paddingTop = '12px';
            orderCard.style.borderTop = '1px solid rgba(56, 189, 248, 0.2)';
          }

          const header = document.createElement('div');
          header.className = 'active-order-header';
          const title = document.createElement('span');
          title.className = 'active-order-title';
          title.textContent = `ORDER: ${order.id.toUpperCase()}`;
          const badge = document.createElement('span');
          badge.id = i === 0 ? 'active-order-status-badge' : `active-order-status-badge-${order.id}`;
          badge.className = `order-badge status-${order.status}`;
          badge.textContent = isReady ? 'READY FOR PICKUP' : 'PREPARING';
          header.appendChild(title);
          header.appendChild(badge);
          orderCard.appendChild(header);

          const details = document.createElement('div');
          details.className = 'active-order-details';
          details.innerHTML = `
            <div class="order-detail-item">
              <span class="order-detail-label">ORDER ID:</span>
              <span id="${i === 0 ? 'active-order-id' : `active-order-id-${order.id}`}" class="order-detail-val">${order.id}</span>
            </div>
            <div class="order-detail-item">
              <span class="order-detail-label">TOTAL:</span>
              <span id="${i === 0 ? 'active-order-total' : `active-order-total-${order.id}`}" class="order-detail-val">$${(order.totalAmountMinor / 100).toFixed(2)} ${order.currency}</span>
            </div>
            <div class="order-detail-item">
              <span class="order-detail-label">READY AT:</span>
              <span id="${i === 0 ? 'active-order-ready-at' : `active-order-ready-at-${order.id}`}" class="order-detail-val">${readyFmt}</span>
            </div>
          `;
          orderCard.appendChild(details);

          const actions = document.createElement('div');
          actions.className = 'active-order-actions';
          const collectBtn = document.createElement('button');
          collectBtn.id = i === 0 ? 'order-collect-btn' : `order-collect-btn-${order.id}`;
          collectBtn.className = 'action-button action-collect';
          collectBtn.disabled = !isReady;
          collectBtn.textContent = isReady ? 'Collect Order (Ready!)' : 'Collect Order';
          collectBtn.addEventListener('click', () => {
            if (this.onActionCallback) {
              this.onActionCallback('collectOrder', { orderId: order.id });
            }
          });
          actions.appendChild(collectBtn);
          orderCard.appendChild(actions);

          this.serviceActiveOrderBoxEl.appendChild(orderCard);
        }
      }
    }
  }

  /**
   * Renders the authoritative Player Possessions / OwnedItems (Milestone 33 / 44).
   */
  private renderInventory(sessionState: ClientSessionState): void {
    if (!this.playerInventoryListEl) return;

    this.playerInventoryListEl.innerHTML = '';
    const items = sessionState.model?.playerInventory || [];

    if (items.length === 0) {
      this.playerInventoryListEl.textContent = 'None';
      return;
    }

    for (const item of items) {
      const chip = document.createElement('span');
      chip.className = 'inventory-chip';
      chip.textContent = `☕ ${item.name} (${item.id})`;
      this.playerInventoryListEl.appendChild(chip);
    }
  }

  private renderCanvas(model: PresentationModel, selectedEntity: InspectableEntity | null): void {
    const ctx = this.ctx!;
    const width = this.canvas!.width;
    const height = this.canvas!.height;

    // Reset canvas
    ctx.clearRect(0, 0, width, height);

    switch (model.context) {
      case 'STREET':
        this.renderStreetScene(ctx, width, height, model, selectedEntity);
        break;
      case 'BUILDING':
        this.renderBuildingScene(ctx, width, height, model, selectedEntity);
        break;
      case 'RESTAURANT':
        this.renderRestaurantScene(ctx, width, height, model, selectedEntity);
        break;
      default:
        this.renderUnknownScene(ctx, width, height, model);
        break;
    }

    // Milestone 54: Render transient speech bubble if active
    if (this.activeDialogueBubble) {
      this.renderSpeechBubble(ctx, this.activeDialogueBubble);
    }
  }

  // --------------------------------------------------------------------------
  // Street Scene Diorama (Milestone 31)
  // --------------------------------------------------------------------------
  private renderStreetScene(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: PresentationModel,
    selectedEntity: InspectableEntity | null
  ): void {
    // Sky background
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.6);
    skyGrad.addColorStop(0, '#090d16');
    skyGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height * 0.6);

    // Distant horizon skyline silhouette
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.55);
    ctx.lineTo(40, height * 0.48);
    ctx.lineTo(80, height * 0.48);
    ctx.lineTo(100, height * 0.52);
    ctx.lineTo(160, height * 0.52);
    ctx.lineTo(200, height * 0.46);
    ctx.lineTo(260, height * 0.46);
    ctx.lineTo(300, height * 0.55);
    ctx.lineTo(500, height * 0.55);
    ctx.lineTo(540, height * 0.47);
    ctx.lineTo(600, height * 0.47);
    ctx.lineTo(640, height * 0.51);
    ctx.lineTo(720, height * 0.51);
    ctx.lineTo(760, height * 0.45);
    ctx.lineTo(width, height * 0.55);
    ctx.closePath();
    ctx.fill();

    // Sidewalk & Roadway
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, height * 0.55, width, 25); // Sidewalk curb
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, height * 0.55 + 22, width, 3); // Curb edge

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, height * 0.6, width, height * 0.4); // Roadway

    // Road markings (dashed yellow center line)
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 16]);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.8);
    ctx.lineTo(width, height * 0.8);
    ctx.stroke();
    ctx.setLineDash([]);

    // Street Name Header Banner
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.fillRect(width / 2 - 160, 15, 320, 36);
    ctx.strokeRect(width / 2 - 160, 15, 320, 36);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(model.locationName, width / 2, 38);

    // Register street header as inspectable region for location
    this.clickableRegions.push({
      x: width / 2 - 160,
      y: 15,
      width: 320,
      height: 36,
      entityId: model.locationId,
    });

    // Render observable buildings along the street
    const buildings = model.accessibleBuildings;
    const bldgWidth = 170;
    const bldgHeight = 145;
    const spacing = 35;
    const totalBldgWidth = buildings.length * bldgWidth + Math.max(0, buildings.length - 1) * spacing;
    const startX = Math.max(30, (width - totalBldgWidth) / 2);

    buildings.forEach((b, i) => {
      const bx = startX + i * (bldgWidth + spacing);
      const by = height * 0.55 - bldgHeight;

      // Register clickable region for building
      this.clickableRegions.push({
        x: bx,
        y: by,
        width: bldgWidth,
        height: bldgHeight,
        entityId: b.id,
      });

      // Neutral Building Facade (Milestone 31 Correction: strictly zero semantic classification inference)
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = selectedEntity?.id === b.id ? '#fbbf24' : '#38bdf8';
      ctx.lineWidth = selectedEntity?.id === b.id ? 3 : 2;
      ctx.fillRect(bx, by, bldgWidth, bldgHeight);
      ctx.strokeRect(bx, by, bldgWidth, bldgHeight);

      // Roofline Coping
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(bx - 4, by - 6, bldgWidth + 8, 8);
      ctx.strokeStyle = '#64748b';
      ctx.strokeRect(bx - 4, by - 6, bldgWidth + 8, 8);

      // Building Signboard displaying authoritative building name
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(bx + 12, by + 8, bldgWidth - 24, 20);
      ctx.strokeStyle = selectedEntity?.id === b.id ? '#fbbf24' : '#0ea5e9';
      ctx.strokeRect(bx + 12, by + 8, bldgWidth - 24, 20);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, bx + bldgWidth / 2, by + 22);

      // Neutral architectural upper windows
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1;
      for (let wx = bx + 18; wx < bx + bldgWidth - 25; wx += 44) {
        ctx.fillRect(wx, by + 36, 28, 22);
        ctx.strokeRect(wx, by + 36, 28, 22);
        ctx.fillRect(wx, by + 66, 28, 22);
        ctx.strokeRect(wx, by + 66, 28, 22);
      }

      // Neutral Building Entrance
      ctx.fillStyle = '#334155';
      ctx.fillRect(bx + bldgWidth / 2 - 20, by + bldgHeight - 44, 40, 44);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + bldgWidth / 2 - 20, by + bldgHeight - 44, 40, 44);
    });

    // Neighboring street exits (left / right indicators)
    if (model.neighboringStreets.length > 0) {
      const s0 = model.neighboringStreets[0];
      this.clickableRegions.push({
        x: 15,
        y: height * 0.72 - 16,
        width: 170,
        height: 30,
        entityId: s0.id,
      });

      ctx.fillStyle = '#065f46';
      ctx.strokeStyle = selectedEntity?.id === s0.id ? '#fbbf24' : '#34d399';
      ctx.lineWidth = selectedEntity?.id === s0.id ? 3 : 2;
      ctx.fillRect(15, height * 0.72 - 16, 170, 30);
      ctx.strokeRect(15, height * 0.72 - 16, 170, 30);

      ctx.fillStyle = '#ecfdf5';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`◂ ${s0.name}`, 24, height * 0.72 + 4);

      if (model.neighboringStreets.length > 1) {
        const s1 = model.neighboringStreets[1];
        this.clickableRegions.push({
          x: width - 185,
          y: height * 0.72 - 16,
          width: 170,
          height: 30,
          entityId: s1.id,
        });

        ctx.fillStyle = '#065f46';
        ctx.strokeStyle = selectedEntity?.id === s1.id ? '#fbbf24' : '#34d399';
        ctx.lineWidth = selectedEntity?.id === s1.id ? 3 : 2;
        ctx.fillRect(width - 185, height * 0.72 - 16, 170, 30);
        ctx.strokeRect(width - 185, height * 0.72 - 16, 170, 30);

        ctx.fillStyle = '#ecfdf5';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${s1.name} ▸`, width - 24, height * 0.72 + 4);
      }
    }

    // Player Marker
    this.clickableRegions.push({
      x: this.playerVisualX - 20,
      y: this.playerVisualY - 20,
      width: 40,
      height: 40,
      entityId: model.activePlayerId,
    });
    this.renderPlayerAvatar(
      ctx,
      this.playerVisualX,
      this.playerVisualY,
      'YOU',
      selectedEntity?.id === model.activePlayerId
    );

    // Co-located NPCs (only perceived agents)
    const otherAgents = model.agents.filter((a) => a.id !== model.activePlayerId);
    otherAgents.forEach((agent, i) => {
      const pos = this.getAgentVisualPosition(model, agent.id) || {
        x: width * 0.3 + i * 85,
        y: height * 0.72,
      };
      const ax = pos.x;
      const ay = pos.y;
      this.clickableRegions.push({
        x: ax - 20,
        y: ay - 20,
        width: 40,
        height: 40,
        entityId: agent.id,
      });
      const npcFacing: 'left' | 'right' = this.playerVisualX < ax ? 'left' : 'right';
      this.renderNpcAvatar(
        ctx,
        ax,
        ay,
        agent.name,
        agent.isAcquainted,
        selectedEntity?.id === agent.id,
        npcFacing
      );
    });

    // Render proximity prompt if active
    if (this.activeProximityPrompt) {
      this.renderProximityPrompt(ctx, this.activeProximityPrompt);
    }

    // Controls Legend overlay
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('⌨ A/D or ◄/► to Walk  •  [E] to Interact', 16, height - 12);
  }

  // --------------------------------------------------------------------------
  // Building Scene Diorama (Milestone 31)
  // --------------------------------------------------------------------------
  private renderBuildingScene(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: PresentationModel,
    selectedEntity: InspectableEntity | null
  ): void {
    // Interior lobby wall
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, width, height * 0.65);

    // Tiled Floor with perspective grid
    const floorGrad = ctx.createLinearGradient(0, height * 0.65, 0, height);
    floorGrad.addColorStop(0, '#334155');
    floorGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, height * 0.65, width, height * 0.35);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, height * 0.65);
      ctx.lineTo(x + (x - width / 2) * 0.4, height);
      ctx.stroke();
    }

    // Building Title Header Plaque & Directory
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = selectedEntity?.id === model.locationId ? '#fbbf24' : '#38bdf8';
    ctx.lineWidth = selectedEntity?.id === model.locationId ? 3 : 2;
    ctx.fillRect(width / 2 - 180, 12, 360, 42);
    ctx.strokeRect(width / 2 - 180, 12, 360, 42);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUILDING LOBBY DIRECTORY • YOU ARE HERE', width / 2, 26);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(model.locationName, width / 2, 44);

    this.clickableRegions.push({
      x: width / 2 - 180,
      y: 12,
      width: 360,
      height: 42,
      entityId: model.locationId,
    });

    // Exit Door to Parent Street (left wall)
    if (model.parentName) {
      this.clickableRegions.push({
        x: 35,
        y: height * 0.65 - 165,
        width: 95,
        height: 165,
        entityId: model.locationId,
      });

      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.fillRect(35, height * 0.65 - 165, 95, 165);
      ctx.strokeRect(35, height * 0.65 - 165, 95, 165);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT TO', 82, height * 0.65 - 135);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(model.parentName, 82, height * 0.65 - 115);
    }

    // Contained Restaurant Portal / Storefront Threshold (right side)
    if (model.containedRestaurants.length > 0) {
      const rest = model.containedRestaurants[0];
      const rx = width - 270;
      const ry = height * 0.65 - 185;

      this.clickableRegions.push({
        x: rx,
        y: ry,
        width: 235,
        height: 185,
        entityId: rest.id,
      });

      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = selectedEntity?.id === rest.id ? '#fbbf24' : '#f59e0b';
      ctx.lineWidth = selectedEntity?.id === rest.id ? 4 : 3;
      ctx.fillRect(rx, ry, 235, 185);
      ctx.strokeRect(rx, ry, 235, 185);

      // Glass showcase window
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(rx + 15, ry + 38, 120, 85);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(rx + 15, ry + 38, 120, 85);

      // Entrance door
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(rx + 150, ry + 40, 70, 145);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(rx + 150, ry + 40, 70, 145);

      // Restaurant Sign
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rest.name, rx + 115, ry + 24);

      // Storefront Opportunity (Milestone 27 Threshold Affordance)
      // DYNAMIC opportunity name from authoritative server projection!
      if (model.opportunities && model.opportunities.length > 0) {
        const opp = model.opportunities[0];
        this.clickableRegions.push({
          x: rx + 20,
          y: ry + 55,
          width: 110,
          height: 50,
          entityId: opp.id,
        });

        ctx.fillStyle = '#1c1917';
        ctx.strokeStyle = selectedEntity?.id === opp.id ? '#38bdf8' : '#fbbf24';
        ctx.lineWidth = selectedEntity?.id === opp.id ? 2 : 1;
        ctx.fillRect(rx + 20, ry + 55, 110, 50);
        ctx.strokeRect(rx + 20, ry + 55, 110, 50);

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(`★ ${opp.name.toUpperCase()} ★`, rx + 75, ry + 75);

        ctx.fillStyle = '#fef3c7';
        ctx.font = '8px sans-serif';
        ctx.fillText('Perceived from lobby', rx + 75, ry + 92);
      }
    } else {
      // Zero contained restaurants: render clean lobby interior architectural feature without inventing fake shops!
      const nx = width - 240;
      const ny = height * 0.65 - 140;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.fillRect(nx, ny, 200, 140);
      ctx.strokeRect(nx, ny, 200, 140);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'italic 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Private Building Space', nx + 100, ny + 65);
      ctx.font = '10px sans-serif';
      ctx.fillText('No commercial storefronts', nx + 100, ny + 85);
    }

    // Player Marker
    this.clickableRegions.push({
      x: this.playerVisualX - 20,
      y: this.playerVisualY - 20,
      width: 40,
      height: 40,
      entityId: model.activePlayerId,
    });
    this.renderPlayerAvatar(
      ctx,
      this.playerVisualX,
      this.playerVisualY,
      'YOU',
      selectedEntity?.id === model.activePlayerId
    );

    // Co-located NPCs
    const otherAgents = model.agents.filter((a) => a.id !== model.activePlayerId);
    otherAgents.forEach((agent, i) => {
      const pos = this.getAgentVisualPosition(model, agent.id) || {
        x: width * 0.58 + i * 70,
        y: height * 0.75,
      };
      const ax = pos.x;
      const ay = pos.y;
      this.clickableRegions.push({
        x: ax - 20,
        y: ay - 20,
        width: 40,
        height: 40,
        entityId: agent.id,
      });
      const npcFacing: 'left' | 'right' = this.playerVisualX < ax ? 'left' : 'right';
      this.renderNpcAvatar(
        ctx,
        ax,
        ay,
        agent.name,
        agent.isAcquainted,
        selectedEntity?.id === agent.id,
        npcFacing
      );
    });

    // Render proximity prompt if active
    if (this.activeProximityPrompt) {
      this.renderProximityPrompt(ctx, this.activeProximityPrompt);
    }

    // Controls Legend overlay
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('⌨ A/D or ◄/► to Walk  •  [E] to Interact', 16, height - 12);
  }

  // --------------------------------------------------------------------------
  // Restaurant Scene Diorama (Milestone 31)
  // --------------------------------------------------------------------------
  private renderRestaurantScene(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: PresentationModel,
    selectedEntity: InspectableEntity | null
  ): void {
    // Warm cafe walls
    ctx.fillStyle = '#451a03';
    ctx.fillRect(0, 0, width, height * 0.6);

    // Wooden cafe floor
    const floorGrad = ctx.createLinearGradient(0, height * 0.6, 0, height);
    floorGrad.addColorStop(0, '#78350f');
    floorGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, height * 0.6, width, height * 0.4);

    // Restaurant Title Header
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = selectedEntity?.id === model.locationId ? '#fbbf24' : '#f59e0b';
    ctx.lineWidth = selectedEntity?.id === model.locationId ? 3 : 2;
    ctx.fillRect(width / 2 - 160, 15, 320, 36);
    ctx.strokeRect(width / 2 - 160, 15, 320, 36);

    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(model.locationName, width / 2, 38);

    this.clickableRegions.push({
      x: width / 2 - 160,
      y: 15,
      width: 320,
      height: 36,
      entityId: model.locationId,
    });

    // Operational State Sign
    const isOpen = model.operationalState === 'open';
    const isClosingSoon = model.operationalState === 'closing-soon';
    const signWidth = isClosingSoon ? 140 : 90;
    const signX = width - signWidth - 30;

    if (isOpen) {
      ctx.fillStyle = '#14532d';
      ctx.strokeStyle = '#22c55e';
    } else if (isClosingSoon) {
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#f59e0b';
    } else {
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#ef4444';
    }
    ctx.lineWidth = 2;
    ctx.fillRect(signX, 15, signWidth, 30);
    ctx.strokeRect(signX, 15, signWidth, 30);

    ctx.fillStyle = isOpen ? '#86efac' : isClosingSoon ? '#fde68a' : '#fca5a5';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    const signText = isOpen ? '● OPEN' : isClosingSoon ? '● CLOSING SOON' : '● CLOSED';
    ctx.fillText(signText, signX + signWidth / 2, 35);

    // Menu Board listing observable offerings
    const isMenuSelected = selectedEntity && model.offerings.some((o) => o.id === selectedEntity.id);
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = isMenuSelected ? '#fbbf24' : '#d97706';
    ctx.lineWidth = isMenuSelected ? 3 : 2;
    ctx.fillRect(50, 68, 210, 120);
    ctx.strokeRect(50, 68, 210, 120);

    this.clickableRegions.push({
      x: 50,
      y: 68,
      width: 210,
      height: 120,
      entityId: model.offerings[0]?.id || model.locationId,
    });

    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('— OFFERINGS —', 155, 88);

    if (model.offerings.length === 0) {
      ctx.fillStyle = '#a8a29e';
      ctx.font = 'italic 11px sans-serif';
      ctx.fillText('None currently available', 155, 125);
    } else {
      model.offerings.forEach((off, idx) => {
        ctx.fillStyle = selectedEntity?.id === off.id ? '#fbbf24' : '#fafaf9';
        ctx.font = selectedEntity?.id === off.id ? 'bold 11px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`• ${off.name}`, 65, 112 + idx * 22);
        ctx.textAlign = 'right';
        ctx.fillText(`$${(off.priceMinor / 100).toFixed(2)}`, 245, 112 + idx * 22);
      });
    }

    // Service Counter
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2;
    ctx.fillRect(width * 0.45, height * 0.52, width * 0.45, 55);
    ctx.strokeRect(width * 0.45, height * 0.52, width * 0.45, 55);

    // Espresso brewer on counter
    ctx.fillStyle = '#475569';
    ctx.fillRect(width * 0.78, height * 0.52 - 32, 38, 32);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(width * 0.78 + 9, height * 0.52 - 22, 20, 22);

    // Perceived Opportunity in Restaurant (if present)
    if (model.opportunities && model.opportunities.length > 0) {
      const opp = model.opportunities[0];
      this.clickableRegions.push({
        x: width * 0.47,
        y: height * 0.52 - 32,
        width: 115,
        height: 28,
        entityId: opp.id,
      });

      ctx.fillStyle = '#1c1917';
      ctx.strokeStyle = selectedEntity?.id === opp.id ? '#38bdf8' : '#fbbf24';
      ctx.lineWidth = selectedEntity?.id === opp.id ? 2 : 1;
      ctx.fillRect(width * 0.47, height * 0.52 - 32, 115, 28);
      ctx.strokeRect(width * 0.47, height * 0.52 - 32, 115, 28);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`★ ${opp.name} ★`, width * 0.47 + 57, height * 0.52 - 14);
    }

    // Exit Door to Parent Building (left)
    if (model.parentName) {
      this.clickableRegions.push({
        x: 18,
        y: height * 0.6 - 130,
        width: 80,
        height: 130,
        entityId: model.locationId,
      });

      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.fillRect(18, height * 0.6 - 130, 80, 130);
      ctx.strokeRect(18, height * 0.6 - 130, 80, 130);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT TO', 58, height * 0.6 - 100);
      ctx.fillText(model.parentName, 58, height * 0.6 - 85);
    }

    // Player Marker (foreground customer space)
    this.clickableRegions.push({
      x: this.playerVisualX - 20,
      y: this.playerVisualY - 20,
      width: 40,
      height: 40,
      entityId: model.activePlayerId,
    });
    this.renderPlayerAvatar(
      ctx,
      this.playerVisualX,
      this.playerVisualY,
      'YOU',
      selectedEntity?.id === model.activePlayerId
    );

    // Co-located Agents (neutral presentation, NO assumed roles)
    const otherAgents = model.agents.filter((a) => a.id !== model.activePlayerId);
    otherAgents.forEach((agent, i) => {
      const pos = this.getAgentVisualPosition(model, agent.id) || {
        x: width * 0.58 + i * 80,
        y: height * 0.76,
      };
      const ax = pos.x;
      const ay = pos.y;
      this.clickableRegions.push({
        x: ax - 20,
        y: ay - 20,
        width: 40,
        height: 40,
        entityId: agent.id,
      });
      const npcFacing: 'left' | 'right' = this.playerVisualX < ax ? 'left' : 'right';
      this.renderNpcAvatar(
        ctx,
        ax,
        ay,
        agent.name,
        agent.isAcquainted,
        selectedEntity?.id === agent.id,
        npcFacing
      );
    });

    // Render proximity prompt if active
    if (this.activeProximityPrompt) {
      this.renderProximityPrompt(ctx, this.activeProximityPrompt);
    }

    // Controls Legend overlay
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('⌨ A/D or ◄/► to Walk  •  [E] to Interact', 16, height - 12);
  }

  // --------------------------------------------------------------------------
  // Fallback Scene
  // --------------------------------------------------------------------------
  private renderUnknownScene(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: PresentationModel
  ): void {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Location: ${model.locationName} (${model.locationType})`, width / 2, height / 2);
  }

  // --------------------------------------------------------------------------
  // Avatar Helpers
  // --------------------------------------------------------------------------
  private renderPlayerAvatar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    isSelected?: boolean
  ): void {
    const bobY = this.isMoving ? Math.sin(this.walkCycle * 12) * 3 : 0;
    const drawY = y + bobY;

    // Shadow under feet
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 16, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glow halo
    ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.beginPath();
    ctx.arc(x, drawY, 22, 0, Math.PI * 2);
    ctx.fill();

    // Body circle
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#fbbf24';
    ctx.lineWidth = isSelected ? 4 : 3;
    ctx.beginPath();
    ctx.arc(x, drawY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Facing visor/eye accent
    ctx.fillStyle = '#f8fafc';
    const eyeOffset = this.playerFacing === 'right' ? 6 : -6;
    ctx.beginPath();
    ctx.arc(x + eyeOffset, drawY - 3, 3, 0, Math.PI * 2);
    ctx.fill();

    // Selected outer ring
    if (isSelected) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, drawY, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player Label
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, drawY + 28);
  }

  private renderProximityPrompt(ctx: CanvasRenderingContext2D, prompt: ProximityPrompt): void {
    const px = prompt.x;
    const py = prompt.y;

    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    const textWidth = ctx.measureText(prompt.label).width;
    const badgeWidth = textWidth + 32;
    const badgeHeight = 32;
    const bx = Math.max(10, Math.min(800 - badgeWidth - 10, px - badgeWidth / 2));
    const by = py;

    // Background pill with dark glow
    ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;

    // Rounded rectangle
    ctx.beginPath();
    const radius = 8;
    ctx.moveTo(bx + radius, by);
    ctx.lineTo(bx + badgeWidth - radius, by);
    ctx.quadraticCurveTo(bx + badgeWidth, by, bx + badgeWidth, by + radius);
    ctx.lineTo(bx + badgeWidth, by + badgeHeight - radius);
    ctx.quadraticCurveTo(bx + badgeWidth, by + badgeHeight, bx + badgeWidth - radius, by + badgeHeight);
    ctx.lineTo(bx + radius, by + badgeHeight);
    ctx.quadraticCurveTo(bx, by + badgeHeight, bx, by + badgeHeight - radius);
    ctx.lineTo(bx, by + radius);
    ctx.quadraticCurveTo(bx, by, bx + radius, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Key badge icon & label
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(prompt.label, bx + badgeWidth / 2, by + badgeHeight / 2);

    ctx.restore();
  }

  private renderNpcAvatar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    isAcquainted?: boolean,
    isSelected?: boolean,
    facing?: 'left' | 'right'
  ): void {
    // Glow
    ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();

    // Body circle
    ctx.fillStyle = '#a855f7';
    ctx.strokeStyle = isSelected ? '#fbbf24' : isAcquainted ? '#34d399' : '#e9d5ff';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Facing pupil / eye accent
    if (facing) {
      ctx.fillStyle = '#f8fafc';
      const eyeOffset = facing === 'right' ? 5 : -5;
      ctx.beginPath();
      ctx.arc(x + eyeOffset, y - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Selected outer ring
    if (isSelected) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 26);

    // Acquaintance badge indicator if true
    if (isAcquainted) {
      ctx.fillStyle = '#34d399';
      ctx.font = '9px sans-serif';
      ctx.fillText('● Acquainted', x, y + 38);
    }
  }

  /**
   * Milestone 54: In-Canvas Speech Bubble Rendering
   * Displays authoritative server dialogue text directly above the speaking NPC.
   */
  private renderSpeechBubble(ctx: CanvasRenderingContext2D, bubble: DialogueBubble): void {
    const now = performance.now();
    const timeLeft = bubble.expiresAt - now;
    if (timeLeft <= 0) return;

    // Smooth fade out during last 800ms
    const alpha = Math.min(1, Math.max(0, timeLeft / 800));

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.font = '12px sans-serif';
    const maxWidth = 250;
    const words = bubble.text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    let maxLineWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }

    const paddingX = 14;
    const paddingY = 10;
    const lineHeight = 16;
    const bubbleWidth = Math.max(90, maxLineWidth + paddingX * 2);
    const bubbleHeight = lines.length * lineHeight + paddingY * 2;

    // Anchor bubble above speaker's head
    const bx = Math.max(15, Math.min(800 - bubbleWidth - 15, bubble.speakerX - bubbleWidth / 2));
    const by = Math.max(15, bubble.speakerY - 32 - bubbleHeight);

    // Dark semi-transparent bubble background with cyan glow
    ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;

    const r = 8;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bubbleWidth - r, by);
    ctx.quadraticCurveTo(bx + bubbleWidth, by, bx + bubbleWidth, by + r);
    ctx.lineTo(bx + bubbleWidth, by + bubbleHeight - r);
    ctx.quadraticCurveTo(bx + bubbleWidth, by + bubbleHeight, bx + bubbleWidth - r, by + bubbleHeight);

    // Speech bubble tail pointing towards speaker
    const tailX = Math.max(bx + 15, Math.min(bx + bubbleWidth - 15, bubble.speakerX));
    ctx.lineTo(tailX + 7, by + bubbleHeight);
    ctx.lineTo(bubble.speakerX, by + bubbleHeight + 8);
    ctx.lineTo(tailX - 7, by + bubbleHeight);

    ctx.lineTo(bx + r, by + bubbleHeight);
    ctx.quadraticCurveTo(bx, by + bubbleHeight, bx, by + bubbleHeight - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Text lines
    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, idx) => {
      ctx.fillText(line, bx + paddingX, by + paddingY + idx * lineHeight);
    });

    ctx.restore();
  }
}
