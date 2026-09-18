import { WorldClock } from './clock.js';
import { createInitialWorldState, WorldState } from './world-state.js';
import { LocalFilePersistence, DEFAULT_PERSISTENCE_PATH } from '../persistence/local-storage.js';

export interface BootstrapOptions {
  persistencePath?: string;
  silent?: boolean;
}

export interface BootstrapResult {
  status: 'READY';
  ready: boolean;
  clock: WorldClock;
  state: WorldState;
  persistence: LocalFilePersistence;
  isNewWorld: boolean;
}

/**
 * Bootstraps the world runtime.
 *
 * Sequence:
 * 1. Read local persistence.
 * 2. If missing -> initialize new WorldState with development seed world and current real timestamp, save to disk.
 * 3. If exists -> load and validate WorldState, initialize WorldClock from persisted worldTime.
 * 4. Report readiness with observable World Time and entity counts.
 *
 * NOTE: Bootstrap does NOT simulate or advance world time. Time advancement is an
 * explicit operation belonging to the simulation layer.
 */
export function bootstrapWorld(options: BootstrapOptions = {}): BootstrapResult {
  const { persistencePath = DEFAULT_PERSISTENCE_PATH, silent = false } = options;
  const persistence = new LocalFilePersistence(persistencePath);

  if (!silent) {
    console.log('WORLD INITIALIZING...');
  }

  let state = persistence.load();
  let isNewWorld = false;
  let clock: WorldClock;

  if (state === null) {
    // No persisted state -> create new world from current timestamp and save seed
    clock = WorldClock.create();
    state = createInitialWorldState(clock);
    persistence.save(state);
    isNewWorld = true;
  } else {
    // Existing state -> initialize authoritative WorldClock from persisted state
    clock = WorldClock.create(state.worldTime);
  }

  if (!silent) {
    console.log(`WORLD TIME: ${clock.getTime()}`);
    console.log(
      `ENTITIES: ${state.places.length} places, ${state.restaurants.length} restaurant(s), ${state.agents.length} agent(s), ${state.offerings.length} offering(s)`
    );
    console.log('WORLD READY');
  }

  return {
    status: 'READY',
    ready: true,
    clock,
    state,
    persistence,
    isNewWorld,
  };
}
