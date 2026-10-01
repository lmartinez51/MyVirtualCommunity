import { ClientSession } from './session.js';
import { WorldRenderer } from './renderer.js';

/**
 * Input Controller for MyVirtualCommunity (Milestone 30 / 53).
 *
 * Responsibilities:
 * - Binds UI user interactions and keyboard locomotion to non-authoritative client intents.
 * - Forwards intents to ClientSession.executeCommand() or ClientSession.inquireRestaurantService().
 * - Does NOT perform optimistic mutations or local domain checks.
 */
export class InputController {
  private readonly session: ClientSession;
  private readonly renderer: WorldRenderer;

  constructor(session: ClientSession, renderer: WorldRenderer) {
    this.session = session;
    this.renderer = renderer;

    this.renderer.onAction((commandName, payload) => {
      this.handleAction(commandName, payload);
    });

    this.renderer.onSelectEntity((entity) => {
      this.session.selectEntity(entity);
    });

    this.renderer.onStepSimulation((advanceDurationMs) => {
      this.session.stepSimulation(advanceDurationMs).catch((err) => {
        console.error('[input] Uncaught error during stepSimulation:', err);
      });
    });

    this.renderer.onInquireService((staffNpcId) => {
      this.session.inquireRestaurantService(staffNpcId).catch((err) => {
        console.error('[input] Uncaught error during inquireRestaurantService:', err);
      });
    });

    this.bindKeyboardListeners();
  }

  private bindKeyboardListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
      }
      this.handleKeyDown(e.code);
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
      }
      this.handleKeyUp(e.code);
    });
  }

  public handleKeyDown(code: string): void {
    if (code === 'KeyA' || code === 'ArrowLeft') {
      this.renderer.setMoveLeft(true);
    } else if (code === 'KeyD' || code === 'ArrowRight') {
      this.renderer.setMoveRight(true);
    } else if (code === 'KeyE' || code === 'Enter') {
      this.interact();
    }
  }

  public handleKeyUp(code: string): void {
    if (code === 'KeyA' || code === 'ArrowLeft') {
      this.renderer.setMoveLeft(false);
    } else if (code === 'KeyD' || code === 'ArrowRight') {
      this.renderer.setMoveRight(false);
    }
  }

  public interact(): void {
    const prompt = this.renderer.getActiveProximityPrompt();
    if (!prompt) return;

    if (prompt.action === 'none') {
      return;
    }

    if (prompt.action === 'inquireRestaurantService') {
      const staffNpcId = prompt.payload.staffNpcId as string;
      this.session.inquireRestaurantService(staffNpcId).catch((err) => {
        console.error('[input] Uncaught error during proximity inquireRestaurantService:', err);
      });
    } else {
      this.session.executeCommand(prompt.action, prompt.payload).catch((err) => {
        console.error(`[input] Uncaught error during proximity command "${prompt.action}":`, err);
      });
    }
  }

  private handleAction(commandName: string, payload: Record<string, unknown>): void {
    // Non-authoritative intent transmission
    this.session.executeCommand(commandName, payload).catch((err) => {
      console.error(`[input] Uncaught error during command "${commandName}":`, err);
    });
  }
}
