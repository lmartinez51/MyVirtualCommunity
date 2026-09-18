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

export class WorldRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private hudTimeEl: HTMLElement | null = null;
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

  private onActionCallback: ((commandName: string, payload: Record<string, unknown>) => void) | null = null;
  private onSelectEntityCallback: ((entity: InspectableEntity | null) => void) | null = null;
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

  /**
   * Main render dispatch called on session state change.
   */
  public render(sessionState: ClientSessionState): void {
    this.currentSessionState = sessionState;
    this.renderHUD(sessionState);
    this.renderNotification(sessionState);
    this.renderPerception(sessionState);
    this.renderInspection(sessionState);
    this.renderActions(sessionState);

    if (this.ctx && this.canvas && sessionState.model) {
      this.clickableRegions = [];
      this.renderCanvas(sessionState.model, sessionState.selectedEntity);
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
      if (this.hudLocationEl) this.hudLocationEl.textContent = 'Connecting...';
      if (this.hudContextEl) this.hudContextEl.textContent = '---';
      if (this.hudPlayerEl) this.hudPlayerEl.textContent = '---';
      return;
    }

    if (this.hudTimeEl) {
      const parsed = new Date(model.worldTime);
      this.hudTimeEl.textContent = Number.isNaN(parsed.getTime())
        ? model.worldTime
        : `${parsed.toUTCString().replace('GMT', 'UTC')}`;
    }

    if (this.hudLocationEl) {
      this.hudLocationEl.textContent = `${model.locationName} [${model.locationId}]`;
    }

    if (this.hudContextEl) {
      this.hudContextEl.textContent = model.context;
      this.hudContextEl.className = `context-badge context-${model.context.toLowerCase()}`;
    }

    if (this.hudPlayerEl) {
      this.hudPlayerEl.textContent = model.activePlayerId;
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
        chips.push({ id: r.id, label: `🍽️ ${r.name}` });
      }
      for (const off of model.offerings) {
        const priceFmt = (off.priceMinor / 100).toFixed(2);
        chips.push({ id: off.id, label: `☕ ${off.name} ($${priceFmt})` });
      }
      for (const opp of model.opportunities) {
        chips.push({ id: opp.id, label: `⭐ ${opp.name}` });
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
        btn.textContent = affordance.label;
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
      x: width * 0.5 - 20,
      y: height * 0.72 - 20,
      width: 40,
      height: 40,
      entityId: model.activePlayerId,
    });
    this.renderPlayerAvatar(
      ctx,
      width * 0.5,
      height * 0.72,
      'YOU',
      selectedEntity?.id === model.activePlayerId
    );

    // Co-located NPCs (only perceived agents)
    const otherAgents = model.agents.filter((a) => a.id !== model.activePlayerId);
    otherAgents.forEach((agent, i) => {
      const ax = width * 0.3 + i * 85;
      const ay = height * 0.72;
      this.clickableRegions.push({
        x: ax - 20,
        y: ay - 20,
        width: 40,
        height: 40,
        entityId: agent.id,
      });
      this.renderNpcAvatar(
        ctx,
        ax,
        ay,
        agent.name,
        agent.isAcquainted,
        selectedEntity?.id === agent.id
      );
    });
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
      x: width * 0.4 - 20,
      y: height * 0.75 - 20,
      width: 40,
      height: 40,
      entityId: model.activePlayerId,
    });
    this.renderPlayerAvatar(
      ctx,
      width * 0.4,
      height * 0.75,
      'YOU',
      selectedEntity?.id === model.activePlayerId
    );

    // Co-located NPCs
    const otherAgents = model.agents.filter((a) => a.id !== model.activePlayerId);
    otherAgents.forEach((agent, i) => {
      const ax = width * 0.58 + i * 70;
      const ay = height * 0.75;
      this.clickableRegions.push({
        x: ax - 20,
        y: ay - 20,
        width: 40,
        height: 40,
        entityId: agent.id,
      });
      this.renderNpcAvatar(
        ctx,
        ax,
        ay,
        agent.name,
        agent.isAcquainted,
        selectedEntity?.id === agent.id
      );
    });
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
    ctx.fillStyle = isOpen ? '#14532d' : '#7f1d1d';
    ctx.strokeStyle = isOpen ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.fillRect(width - 120, 15, 90, 30);
    ctx.strokeRect(width - 120, 15, 90, 30);

    ctx.fillStyle = isOpen ? '#86efac' : '#fca5a5';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isOpen ? '● OPEN' : '● CLOSED', width - 75, 35);

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
      x: width * 0.32 - 20,
      y: height * 0.76 - 20,
      width: 40,
      height: 40,
      entityId: model.activePlayerId,
    });
    this.renderPlayerAvatar(
      ctx,
      width * 0.32,
      height * 0.76,
      'YOU',
      selectedEntity?.id === model.activePlayerId
    );

    // Co-located Agents (neutral presentation, NO assumed roles)
    const otherAgents = model.agents.filter((a) => a.id !== model.activePlayerId);
    otherAgents.forEach((agent, i) => {
      const ax = width * 0.58 + i * 80;
      const ay = height * 0.76;
      this.clickableRegions.push({
        x: ax - 20,
        y: ay - 20,
        width: 40,
        height: 40,
        entityId: agent.id,
      });
      this.renderNpcAvatar(
        ctx,
        ax,
        ay,
        agent.name,
        agent.isAcquainted,
        selectedEntity?.id === agent.id
      );
    });
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
    // Glow halo
    ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    // Body circle
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#fbbf24';
    ctx.lineWidth = isSelected ? 4 : 3;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Selected outer ring
    if (isSelected) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player Label
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 28);
  }

  private renderNpcAvatar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    isAcquainted?: boolean,
    isSelected?: boolean
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
}
