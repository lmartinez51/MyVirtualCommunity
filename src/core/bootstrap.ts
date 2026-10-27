import { WorldClock } from './clock.js';
import { createInitialWorldState, createGomezMorinWorldState, WorldState } from './world-state.js';
import { LocalFilePersistence, DEFAULT_PERSISTENCE_PATH } from '../persistence/local-storage.js';

export type WorldSeedType = 'development' | 'gomez-morin';

export interface BootstrapOptions {
  persistencePath?: string;
  silent?: boolean;
  worldSeed?: WorldSeedType;
  initialWorldTime?: string;
  initialStateFactory?: (clock: WorldClock) => WorldState;
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
 * Checks if a persisted WorldState corresponds to the legacy/synthetic development seed fixture.
 *
 * Distinguishes the legacy development seed fixture (with street:development-street and
 * restaurant:development-restaurant) from the real-world Blvd. Manuel Gómez Morín vertical slice.
 */
export function isDevelopmentSeedWorld(state: WorldState): boolean {
  const hasDevStreet = state.places.some((p) => p.id === 'street:development-street');
  const hasDevRestaurant = state.restaurants.some((r) => r.id === 'restaurant:development-restaurant');
  const hasGomezMorin = state.places.some((p) => p.id === 'street:blvd-gomez-morin');
  return (hasDevStreet || hasDevRestaurant) && !hasGomezMorin;
}

/**
 * Bootstraps the world runtime.
 *
 * Sequence:
 * 1. Read local persistence.
 * 2. If missing -> initialize new WorldState with selected seed world (Gómez Morín for normal runtime,
 *    or development seed for test fixtures) and current real timestamp, save to disk.
 * 3. If exists and targeting Gómez Morín but contains legacy development seed fixture ->
 *    reinitialize to the authoritative Gómez Morín vertical slice and save to disk.
 * 4. If exists -> load and validate WorldState, initialize WorldClock from persisted worldTime.
 * 5. Report readiness with observable World Time and entity counts.
 *
 * NOTE: Bootstrap does NOT simulate or advance world time. Time advancement is an
 * explicit operation belonging to the simulation layer.
 */
export function bootstrapWorld(options: BootstrapOptions = {}): BootstrapResult {
  const { persistencePath = DEFAULT_PERSISTENCE_PATH, silent = false } = options;
  const persistence = new LocalFilePersistence(persistencePath);

  // If worldSeed is explicitly specified, respect it.
  // When unspecified: default to 'gomez-morin' for the standard runtime persistence path (DEFAULT_PERSISTENCE_PATH),
  // and 'development' for custom test persistence paths to preserve legacy test fixtures.
  const targetWorldSeed: WorldSeedType =
    options.worldSeed ??
    (persistencePath === DEFAULT_PERSISTENCE_PATH ? 'gomez-morin' : 'development');

  if (!silent) {
    console.log('WORLD INITIALIZING...');
  }

  let state = persistence.load();
  let isNewWorld = false;
  let clock: WorldClock;

  if (state === null) {
    // No persisted state -> create new world from initialWorldTime or current timestamp and save seed
    clock = options.initialWorldTime ? WorldClock.create(options.initialWorldTime) : WorldClock.create();
    if (options.initialStateFactory) {
      state = options.initialStateFactory(clock);
    } else if (targetWorldSeed === 'gomez-morin') {
      state = createGomezMorinWorldState(clock);
    } else {
      state = createInitialWorldState(clock);
    }
    persistence.save(state);
    isNewWorld = true;
  } else if (targetWorldSeed === 'gomez-morin' && isDevelopmentSeedWorld(state)) {
    // Persisted state exists but is an obsolete development fixture.
    // Reinitialize to the authoritative Gómez Morín vertical slice while preserving World Core authority.
    if (!silent) {
      console.log(
        '[BOOTSTRAP] Persisted world state contains legacy development seed fixture. Reinitializing to Gómez Morín vertical slice...'
      );
    }
    clock = options.initialWorldTime ? WorldClock.create(options.initialWorldTime) : WorldClock.create();
    state = options.initialStateFactory
      ? options.initialStateFactory(clock)
      : createGomezMorinWorldState(clock);
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
