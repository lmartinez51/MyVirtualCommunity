/**
 * Authoritative Business Schedule & Access Policy Model (Phase 2).
 *
 * Formalizes business operating schedules, admission cutoffs, time-zone handling,
 * and operational status derivation for customer-facing businesses.
 *
 * Grounded in the Ciudad Juárez regional geography (America/Ciudad_Juarez).
 *
 * Invariant:
 * Business operational availability ('open' | 'closing-soon' | 'closed') is distinct from:
 * - Physical door state ('closed' | 'opening' | 'open' | 'closing')
 * - Admission decisions (entry vs exit vs emergency recovery)
 */

import { deriveCivilTime } from './civil-time.js';
import type { RestaurantOperationalState } from './entities/restaurant.js';

export interface BusinessOperatingHours {
  readonly openHour: number; // 0–23 (e.g. 12)
  readonly openMinute: number; // 0–59 (e.g. 0)
  readonly closeHour: number; // 0–24 (e.g. 24 = midnight 00:00; < openHour means next-day overnight close, e.g. 3 = 03:00 AM)
  readonly closeMinute: number; // 0–59 (e.g. 0)
}

export interface BusinessSchedule {
  readonly businessId: string;
  readonly name: string;
  readonly timeZone: string;
  readonly operatingDays: readonly number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  readonly hours: BusinessOperatingHours;
  /** Optional per-day schedule windows (0 = Sunday .. 6 = Saturday) supporting multiple shifts and overnight closes. */
  readonly dailyWindows?: Readonly<Record<number, readonly BusinessOperatingHours[]>>;
  readonly lastEntryCutoffMinutes: number; // e.g. 15 minutes before closing
  readonly closureOverrides?: readonly string[]; // ISO dates "YYYY-MM-DD" for special full-day closures
  readonly version: number;
}

/**
 * Authoritative business schedules in Gómez Morín (America/Ciudad_Juarez).
 *
 * Wing Spot Gómez Morín (real-world weekly hours):
 * - Sunday:    3:00 PM – 12:00 AM (plus Saturday overnight 12:00 AM – 3:00 AM)
 * - Monday:    3:00 PM – 12:00 AM
 * - Tuesday:   3:00 PM – 12:00 AM
 * - Wednesday: 12:00 AM – 1:00 AM & 12:00 PM – 1:00 AM (next day)
 * - Thursday:  12:00 PM – 3:00 AM (next day)
 * - Friday:    12:00 PM – 3:00 AM (next day)
 * - Saturday:  12:00 PM – 3:00 AM (next day)
 */
export type BusinessOperationalState = RestaurantOperationalState;

export const DEFAULT_BUSINESS_SCHEDULES: Readonly<Record<string, BusinessSchedule>> = Object.freeze({
  'restaurant:wing-spot': Object.freeze({
    businessId: 'restaurant:wing-spot',
    name: 'Wing Spot Gómez Morín',
    timeZone: 'America/Ciudad_Juarez',
    operatingDays: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    hours: Object.freeze({
      openHour: 12,
      openMinute: 0,
      closeHour: 3,
      closeMinute: 0,
    }),
    dailyWindows: Object.freeze({
      // Sunday: 3 PM – 12 AM
      0: Object.freeze([Object.freeze({ openHour: 15, openMinute: 0, closeHour: 24, closeMinute: 0 })]),
      // Monday: 3 PM – 12 AM
      1: Object.freeze([Object.freeze({ openHour: 15, openMinute: 0, closeHour: 24, closeMinute: 0 })]),
      // Tuesday: 3 PM – 12 AM
      2: Object.freeze([Object.freeze({ openHour: 15, openMinute: 0, closeHour: 24, closeMinute: 0 })]),
      // Wednesday: 12–1 AM and 12 PM–1 AM (spills into Thursday 00:00–01:00)
      3: Object.freeze([
        Object.freeze({ openHour: 0, openMinute: 0, closeHour: 1, closeMinute: 0 }),
        Object.freeze({ openHour: 12, openMinute: 0, closeHour: 1, closeMinute: 0 }),
      ]),
      // Thursday: 12 PM – 3 AM (spills into Friday 00:00–03:00)
      4: Object.freeze([Object.freeze({ openHour: 12, openMinute: 0, closeHour: 3, closeMinute: 0 })]),
      // Friday: 12 PM – 3 AM (spills into Saturday 00:00–03:00)
      5: Object.freeze([Object.freeze({ openHour: 12, openMinute: 0, closeHour: 3, closeMinute: 0 })]),
      // Saturday: 12 PM – 3 AM (spills into Sunday 00:00–03:00)
      6: Object.freeze([Object.freeze({ openHour: 12, openMinute: 0, closeHour: 3, closeMinute: 0 })]),
    }),
    lastEntryCutoffMinutes: 15,
    version: 2,
  }),
  'restaurant:pasteleria-tia-lupe': Object.freeze({
    businessId: 'restaurant:pasteleria-tia-lupe',
    name: 'Pastelerías La Tía Lupe',
    timeZone: 'America/Ciudad_Juarez',
    operatingDays: Object.freeze([1, 2, 3, 4, 5, 6]),
    hours: Object.freeze({
      openHour: 9,
      openMinute: 0,
      closeHour: 18,
      closeMinute: 0,
    }),
    lastEntryCutoffMinutes: 15,
    version: 1,
  }),
  'pharmacy:farmacias-benavides': Object.freeze({
    businessId: 'pharmacy:farmacias-benavides',
    name: 'Farmacias Benavides',
    timeZone: 'America/Ciudad_Juarez',
    operatingDays: Object.freeze([1, 2, 3, 4, 5, 6]),
    hours: Object.freeze({
      openHour: 7,
      openMinute: 0,
      closeHour: 22,
      closeMinute: 0,
    }),
    lastEntryCutoffMinutes: 0,
    version: 1,
  }),
  'optical:optica-fashion': Object.freeze({
    businessId: 'optical:optica-fashion',
    name: 'Óptica Fashion',
    timeZone: 'America/Ciudad_Juarez',
    operatingDays: Object.freeze([1, 2, 3, 4, 5, 6]),
    hours: Object.freeze({
      openHour: 9,
      openMinute: 0,
      closeHour: 17,
      closeMinute: 0,
    }),
    lastEntryCutoffMinutes: 0,
    version: 1,
  }),
});

/**
 * Pure lookup finding the business schedule for a given businessId, or null if none registered.
 */
export function findBusinessSchedule(businessId: string): BusinessSchedule | null {
  if (typeof businessId !== 'string' || businessId.trim() === '') {
    return null;
  }
  return DEFAULT_BUSINESS_SCHEDULES[businessId] ?? null;
}

const DAY_MS = 24 * 3600_000;

function formatHourMinute(hour: number, minute: number): string {
  const normalizedHour = hour === 24 ? 0 : hour;
  return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getWindowsForDay(schedule: BusinessSchedule, dayOfWeek: number): readonly BusinessOperatingHours[] {
  if (schedule.dailyWindows) {
    return schedule.dailyWindows[dayOfWeek] ?? [];
  }
  if (!schedule.operatingDays.includes(dayOfWeek)) {
    return [];
  }
  return [schedule.hours];
}

function evaluateScheduleDetail(
  schedule: BusinessSchedule,
  worldTime: string | number
): { status: RestaurantOperationalState; activeWindow: BusinessOperatingHours } {
  const civil = deriveCivilTime(worldTime, schedule.timeZone);
  const dateKey = `${civil.year}-${String(civil.month).padStart(2, '0')}-${String(civil.day).padStart(2, '0')}`;
  const isTodayClosedOverride = Boolean(schedule.closureOverrides && schedule.closureOverrides.includes(dateKey));

  // Previous civil day (for overnight spillover windows like 12:00 -> 03:00)
  const prevCivil = deriveCivilTime(new Date(worldTime).getTime() - DAY_MS, schedule.timeZone);
  const prevDateKey = `${prevCivil.year}-${String(prevCivil.month).padStart(2, '0')}-${String(prevCivil.day).padStart(2, '0')}`;
  const isPrevClosedOverride = Boolean(schedule.closureOverrides && schedule.closureOverrides.includes(prevDateKey));

  const timeOfDayMs =
    civil.hour * 3600_000 +
    civil.minute * 60_000 +
    civil.second * 1000 +
    civil.millisecond;
  const cutoffDurationMs = schedule.lastEntryCutoffMinutes * 60_000;

  const todayWindows = isTodayClosedOverride ? [] : getWindowsForDay(schedule, civil.dayOfWeek);
  const prevWindows = isPrevClosedOverride ? [] : getWindowsForDay(schedule, prevCivil.dayOfWeek);
  const fallbackWindow = todayWindows[0] ?? schedule.hours;

  // 1. Check spillover from yesterday's overnight windows (closeHour < openHour, e.g. 12:00 -> 03:00)
  for (const win of prevWindows) {
    const openMs = win.openHour * 3600_000 + win.openMinute * 60_000;
    const closeMs = win.closeHour * 3600_000 + win.closeMinute * 60_000;
    if (closeMs < openMs && closeMs > 0) {
      if (timeOfDayMs < closeMs) {
        const cutoffMs = Math.max(0, closeMs - cutoffDurationMs);
        return {
          status: timeOfDayMs >= cutoffMs ? 'closing-soon' : 'open',
          activeWindow: win,
        };
      }
    }
  }

  // 2. Check today's windows (same-day and overnight start)
  for (const win of todayWindows) {
    const openMs = win.openHour * 3600_000 + win.openMinute * 60_000;
    const closeMs = win.closeHour * 3600_000 + win.closeMinute * 60_000;

    if (closeMs < openMs) {
      // Overnight window starting today and closing tomorrow at closeMs
      if (timeOfDayMs >= openMs) {
        const msUntilClose = (DAY_MS - timeOfDayMs) + closeMs;
        return {
          status: msUntilClose <= cutoffDurationMs ? 'closing-soon' : 'open',
          activeWindow: win,
        };
      }
    } else {
      // Standard same-day window (including closeHour === 24 -> midnight)
      if (timeOfDayMs >= openMs && timeOfDayMs < closeMs) {
        const cutoffMs = closeMs - cutoffDurationMs;
        return {
          status: timeOfDayMs >= cutoffMs ? 'closing-soon' : 'open',
          activeWindow: win,
        };
      }
    }
  }

  return { status: 'closed', activeWindow: fallbackWindow };
}

/**
 * Evaluates the business operational status for a given schedule at an authoritative World Time.
 * Supports uniform operating hours, per-day split shifts, and overnight shifts past midnight.
 */
export function evaluateBusinessScheduleStatus(
  schedule: BusinessSchedule,
  worldTime: string | number
): RestaurantOperationalState {
  if (!schedule) {
    throw new Error('BusinessSchedule is required');
  }
  return evaluateScheduleDetail(schedule, worldTime).status;
}

export type BusinessAdmissionResultCode =
  | 'permitted'
  | 'admission-cutoff-reached'
  | 'business-closed';

export interface BusinessAdmissionDecision {
  readonly permitted: boolean;
  readonly code: BusinessAdmissionResultCode;
  readonly message: string;
  readonly status: RestaurantOperationalState;
  readonly closingTimeStr: string;
  readonly openTimeStr: string;
}

/**
 * Authoritative evaluation of customer admission into a business interior.
 */
export function evaluateBusinessAdmission(
  schedule: BusinessSchedule,
  worldTime: string | number
): BusinessAdmissionDecision {
  const { status, activeWindow } = evaluateScheduleDetail(schedule, worldTime);
  const openTimeStr = formatHourMinute(activeWindow.openHour, activeWindow.openMinute);
  const closingTimeStr = formatHourMinute(activeWindow.closeHour, activeWindow.closeMinute);

  if (status === 'open') {
    return {
      permitted: true,
      code: 'permitted',
      message: 'Ingreso permitido.',
      status,
      closingTimeStr,
      openTimeStr,
    };
  }

  if (status === 'closing-soon') {
    return {
      permitted: false,
      code: 'admission-cutoff-reached',
      message: `El establecimiento está por cerrar y ya no acepta nuevos clientes. Cierre: ${closingTimeStr}.`,
      status,
      closingTimeStr,
      openTimeStr,
    };
  }

  return {
    permitted: false,
    code: 'business-closed',
    message: `El establecimiento está cerrado. No se permite el ingreso. Horario: ${openTimeStr} - ${closingTimeStr}.`,
    status,
    closingTimeStr,
    openTimeStr,
  };
}
