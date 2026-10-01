import { ApiClient } from './api-client.js';
import { ClientSession } from './session.js';
import { WorldRenderer } from './renderer.js';
import { InputController } from './input.js';

/**
 * Browser Entrypoint for MyVirtualCommunity (Milestone 30).
 *
 * Bootstraps the presentation shell and initiates authoritative connection.
 */
function bootstrapClient(): void {
  console.log('[client] Initializing MyVirtualCommunity presentation shell...');

  const apiClient = new ApiClient();
  const session = new ClientSession(apiClient);
  const renderer = new WorldRenderer();
  const inputController = new InputController(session, renderer);

  // Expose session, renderer, and input on window for diagnostic access in browser environment
  if (typeof window !== 'undefined') {
    (window as any).__mvc_session = session;
    (window as any).__mvc_renderer = renderer;
    (window as any).__mvc_input = inputController;
  }

  // Subscribe renderer to session state changes
  session.subscribe((state) => {
    renderer.render(state);
  });

  // Connect to authoritative runtime
  session.init().then((success) => {
    if (success) {
      console.log('[client] Successfully connected to authoritative world runtime.');
    } else {
      console.warn('[client] Failed to connect on startup; check server status.');
    }
  });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootstrapClient);
  } else {
    bootstrapClient();
  }
}
