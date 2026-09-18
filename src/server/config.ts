/**
 * Default configuration constants for the local authoritative runtime server (Milestone 29).
 */

export const DEFAULT_SERVER_PORT = 3000;
export const DEFAULT_SERVER_HOST = '127.0.0.1';

/**
 * Authoritative development player ID.
 *
 * NOTE: Development Identity != Authentication != Multiplayer Identity Management.
 * In M29 local runtime, the server strictly binds all incoming player commands
 * and perception queries to this identity. The client cannot impersonate other agents.
 */
export const DEFAULT_DEVELOPMENT_PLAYER_ID = 'agent:dev-player';
