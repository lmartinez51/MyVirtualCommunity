import { ClientSession } from './session.js';
import { WorldRenderer } from './renderer.js';

/**
 * Input Controller for MyVirtualCommunity (Milestone 30).
 *
 * Responsibilities:
 * - Binds UI user interactions to non-authoritative client intents.
 * - Forwards intents to ClientSession.executeCommand().
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
  }

  private handleAction(commandName: string, payload: Record<string, unknown>): void {
    // Non-authoritative intent transmission
    this.session.executeCommand(commandName, payload).catch((err) => {
      console.error(`[input] Uncaught error during command "${commandName}":`, err);
    });
  }
}
