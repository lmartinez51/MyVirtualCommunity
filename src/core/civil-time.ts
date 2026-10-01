import type { WorldState } from './world-state.js';
import type { Place } from './entities/geography.js';

/**
 * Immutable civil time representation derived purely from an authoritative
 * UTC World Time instant and a geographic IANA timezone identifier.
 *
 * CivilTime is NOT a clock. It is a deterministic mathematical projection:
 *
 * World Time (UTC instant) + Geographic Time Zone -> Derived Civil Time
 */
export interface CivilTime {
  /**
   * Gregorian calendar year (e.g. 2026).
   */
  readonly year: number;

  /**
   * Calendar month in the range 1–12 (1 = January, 12 = December).
   */
  readonly month: number;

  /**
   * Calendar day of the month in the range 1–31.
   */
  readonly day: number;

  /**
   * Civil hour of the day in the range 0–23 (24-hour format).
   */
  readonly hour: number;

  /**
   * Civil minute in the range 0–59.
   */
  readonly minute: number;

  /**
   * Civil second in the range 0–59.
   */
  readonly second: number;

  /**
   * Exact millisecond in the range 0–999, preserved from the UTC instant.
   */
  readonly millisecond: number;

  /**
   * Civil day of the week in the range 0–6:
   * 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday,
   * 4 = Thursday, 5 = Friday, 6 = Saturday.
   */
  readonly dayOfWeek: number;

  /**
   * Canonical IANA timezone identifier (e.g. "America/Ciudad_Juarez").
   */
  readonly timeZone: string;

  /**
   * Signed difference in minutes between civil local wall time and UTC:
   * civilInstant - utcInstant. E.g. -360 for UTC-06:00, +0 for UTC.
   */
  readonly utcOffsetMinutes: number;

  /**
   * Formatted ISO 8601 string including timezone offset:
   * YYYY-MM-DDTHH:mm:ss.sss±HH:MM (e.g. "2026-09-24T09:00:00.000-06:00").
   */
  readonly isoCivilString: string;
}

/**
 * Known mapping of root City entities to authoritative IANA timezones.
 * Grounded in the Ciudad Juárez–El Paso regional geography.
 */
export const CITY_TIMEZONE_MAP: Readonly<Record<string, string>> = Object.freeze({
  'city:ciudad-juarez': 'America/Ciudad_Juarez',
  'city:el-paso': 'America/Denver',
});

/**
 * Deterministic pure function projecting an authoritative UTC World Time instant
 * and an IANA timezone into its corresponding CivilTime.
 *
 * Requirements:
 * - Pure: identical inputs always return identical outputs.
 * - Does not read Date.now(), system clocks, global state, or secondary clocks.
 * - Zero third-party dependencies (pure native Node.js Intl).
 * - Validates worldTime (ISO string or unix ms epoch number).
 * - Validates timeZone (IANA string).
 * - Preserves exact sub-second milliseconds.
 *
 * @param worldTime Authoritative UTC instant as an ISO-8601 string or numeric unix epoch milliseconds.
 * @param timeZone Canonical IANA timezone string (e.g. "America/Ciudad_Juarez").
 * @returns Frozen, immutable CivilTime object.
 */
export function deriveCivilTime(worldTime: string | number, timeZone: string): CivilTime {
  if (typeof worldTime !== 'string' && typeof worldTime !== 'number') {
    throw new TypeError(
      `Invalid worldTime: expected string or number, received ${typeof worldTime}`
    );
  }

  let epochMs: number;
  if (typeof worldTime === 'string') {
    if (worldTime.trim() === '') {
      throw new RangeError('Invalid worldTime: string must not be empty');
    }
    epochMs = Date.parse(worldTime);
    if (Number.isNaN(epochMs)) {
      throw new RangeError(`Invalid worldTime: "${worldTime}" is not a valid date string`);
    }
  } else {
    if (!Number.isFinite(worldTime) || Number.isNaN(worldTime)) {
      throw new RangeError(
        `Invalid worldTime: numeric timestamp must be a finite number, received ${worldTime}`
      );
    }
    epochMs = worldTime;
  }

  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid worldTime: timestamp ${worldTime} yields an invalid Date`);
  }

  if (typeof timeZone !== 'string' || timeZone.trim() === '') {
    throw new RangeError('Invalid timeZone: must be a non-empty string');
  }

  // Intl.DateTimeFormat throws RangeError on invalid IANA timeZone
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
    fractionalSecondDigits: 3,
  });

  const parts = dtf.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  let hour = parseInt(partMap.hour, 10);
  if (hour === 24) {
    hour = 0;
  }
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);
  const millisecond = date.getUTCMilliseconds();

  // Day of week for the civil calendar date (0=Sunday, 1=Monday, ..., 6=Saturday)
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  // Signed offset in minutes
  const civilInstantAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const utcOffsetMinutes = Math.round((civilInstantAsUtcMs - epochMs) / 60000);

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const pad3 = (n: number) => n.toString().padStart(3, '0');
  const pad4 = (n: number) => n.toString().padStart(4, '0');

  const sign = utcOffsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(utcOffsetMinutes);
  const offsetH = pad2(Math.floor(absOffset / 60));
  const offsetM = pad2(absOffset % 60);
  const offsetStr = `${sign}${offsetH}:${offsetM}`;

  const isoCivilString = `${pad4(year)}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}.${pad3(millisecond)}${offsetStr}`;

  return Object.freeze({
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    dayOfWeek,
    timeZone,
    utcOffsetMinutes,
    isoCivilString,
  });
}

/**
 * Authoritative, immutable player-facing temporal context.
 *
 * Grounded in virtual geography and projected mathematically from the single
 * authoritative UTC WorldClock without secondary clocks or persistent timezone state.
 */
export interface PlayerTemporalContext {
  readonly worldTime: string;          // Authoritative UTC instant from WorldClock, e.g. "2026-10-01T16:00:00.000Z"
  readonly locationId: string;         // Virtual entity location ID, e.g. "building:development-building"
  readonly rootCityId: string;         // Canonical root city ID, e.g. "city:ciudad-juarez"
  readonly rootCityName: string;       // Canonical root city display name, e.g. "Ciudad Juárez"
  readonly timeZone: string;           // Canonical IANA timezone, e.g. "America/Ciudad_Juarez"
  readonly civilTime: CivilTime;       // Derived mathematical CivilTime projection
}

/**
 * Resolves the root City Place entity for a given location or entity reference
 * by traversing the geographic containment hierarchy upwards.
 *
 * Supported references:
 * - Direct Place ID (building, street, neighborhood, district, or city)
 * - Agent ID (resolves agent's current locationId)
 * - Restaurant ID (resolves restaurant's buildingId)
 *
 * Fails explicitly if:
 * - locationId is not found or empty
 * - containment hierarchy does not terminate at a known City
 * - cycle is detected in containment hierarchy
 * - hierarchy references missing parent
 *
 * @param state Authoritative WorldState (read-only)
 * @param locationId Entity identifier to resolve
 * @returns Canonical root City Place entity
 */
export function resolveLocationRootCity(state: WorldState, locationId: string): Place {
  if (!state || typeof state !== 'object') {
    throw new Error('Invalid state: WorldState must be provided');
  }
  if (typeof locationId !== 'string' || locationId.trim() === '') {
    throw new Error('Invalid locationId: must be a non-empty string');
  }

  let currentId: string = locationId;

  // 1. Resolve agent reference if locationId refers to an agent
  const agent = state.agents?.find((a) => a.id === currentId);
  if (agent) {
    currentId = agent.locationId;
  }

  // 2. Resolve restaurant reference if currentId refers to a restaurant
  const restaurant = state.restaurants?.find((r) => r.id === currentId);
  if (restaurant) {
    currentId = restaurant.buildingId;
  }

  // 3. currentId must now refer to a Place in state.places
  const placeMap = new Map<string, Place>();
  if (Array.isArray(state.places)) {
    for (const p of state.places) {
      placeMap.set(p.id, p);
    }
  }

  let currentPlace = placeMap.get(currentId);
  if (!currentPlace) {
    throw new Error(
      `Cannot resolve location "${locationId}": entity not found in agents, restaurants, or places`
    );
  }

  // 4. Traverse containment hierarchy upwards to root city
  const visited = new Set<string>();
  while (currentPlace && currentPlace.type !== 'city') {
    if (visited.has(currentPlace.id)) {
      throw new Error(
        `Containment cycle detected while resolving timezone for "${locationId}" at place "${currentPlace.id}"`
      );
    }
    visited.add(currentPlace.id);

    if (!currentPlace.parentId) {
      throw new Error(
        `Place "${currentPlace.id}" (type: "${currentPlace.type}") has no parentId and is not a city; hierarchy is disconnected`
      );
    }

    const parent = placeMap.get(currentPlace.parentId);
    if (!parent) {
      throw new Error(
        `Place "${currentPlace.id}" references non-existent parentId: "${currentPlace.parentId}"`
      );
    }
    currentPlace = parent;
  }

  if (!currentPlace || currentPlace.type !== 'city') {
    throw new Error(`Cannot resolve root city for location "${locationId}"`);
  }

  return currentPlace;
}

/**
 * Resolves the authoritative IANA timezone for a given location or entity reference
 * by traversing the geographic containment hierarchy up to the root City entity.
 *
 * Supported references:
 * - Direct Place ID (building, street, neighborhood, district, or city)
 * - Agent ID (resolves agent's current locationId)
 * - Restaurant ID (resolves restaurant's buildingId)
 *
 * Fails explicitly if:
 * - locationId is not found or empty
 * - containment hierarchy does not terminate at a known City
 * - root city has no registered IANA timezone mapping
 * - cycle is detected in containment hierarchy
 *
 * @param state Authoritative WorldState (read-only)
 * @param locationId Entity identifier to resolve
 * @returns Canonical IANA timezone string
 */
export function resolveLocationTimeZone(state: WorldState, locationId: string): string {
  const rootCity = resolveLocationRootCity(state, locationId);

  // Map root city to IANA timezone strictly by registered city ID
  const tz = CITY_TIMEZONE_MAP[rootCity.id];
  if (!tz) {
    throw new Error(
      `No registered IANA timezone for root city "${rootCity.id}" ("${rootCity.name}")`
    );
  }

  return tz;
}

/**
 * Resolves the authoritative PlayerTemporalContext for an active player in WorldState.
 *
 * Traverses player.locationId -> root city -> IANA timezone -> derived CivilTime.
 * Fails explicitly if player does not exist, location is invalid, or city has no timezone mapping.
 *
 * @param state Authoritative WorldState (read-only)
 * @param playerId Identifier of the player agent
 * @returns Frozen, immutable PlayerTemporalContext
 */
export function resolvePlayerTemporalContext(
  state: WorldState,
  playerId: string
): PlayerTemporalContext {
  if (!state || typeof state !== 'object') {
    throw new Error('Invalid state: WorldState must be provided');
  }
  const player = state.agents?.find((a) => a.id === playerId);
  if (!player) {
    throw new Error(`Cannot resolve temporal context: player "${playerId}" not found in world state`);
  }

  const rootCity = resolveLocationRootCity(state, player.locationId);
  const timeZone = resolveLocationTimeZone(state, player.locationId);
  const civilTime = deriveCivilTime(state.worldTime, timeZone);

  return Object.freeze({
    worldTime: state.worldTime,
    locationId: player.locationId,
    rootCityId: rootCity.id,
    rootCityName: rootCity.name,
    timeZone,
    civilTime,
  });
}
