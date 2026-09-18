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
  new InputController(session, renderer);

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
