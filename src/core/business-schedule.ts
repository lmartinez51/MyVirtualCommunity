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
  readonly openHour: number; // 0–23 (e.g. 9)
  readonly openMinute: number; // 0–59 (e.g. 0)
  readonly closeHour: number; // 0–23 (e.g. 18)
  readonly closeMinute: number; // 0–59 (e.g. 0)
}

export interface BusinessSchedule {
  readonly businessId: string;
  readonly name: string;
  readonly timeZone: string;
  readonly operatingDays: readonly number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  readonly hours: BusinessOperatingHours;
  readonly lastEntryCutoffMinutes: number; // e.g. 15 minutes before closing
  readonly closureOverrides?: readonly string[]; // ISO dates "YYYY-MM-DD" for special full-day closures
  readonly version: number;
}

/**
 * Provisional uniform defaults for customer-facing businesses in Gómez Morín.
 * - Days: Monday through Saturday (1..6)
 * - Sunday: Closed (0)
 * - Hours: 09:00–18:00
 * - Last permitted entry cutoff: 15 minutes before close (17:45)
 * - Timezone: America/Ciudad_Juarez
 */
export type BusinessOperationalState = RestaurantOperationalState;

export const DEFAULT_BUSINESS_SCHEDULES: Readonly<Record<string, BusinessSchedule>> = Object.freeze({
  'restaurant:wing-spot': Object.freeze({
    businessId: 'restaurant:wing-spot',
    name: 'Wing Spot Gómez Morín',
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

/**
 * Evaluates the business operational status for a given schedule at an authoritative World Time.
 *
 * Status derivation:
 * - Day not in operatingDays (e.g. Sunday) -> 'closed'
 * - Date in closureOverrides -> 'closed'
 * - Civil time < openTime or >= closeTime -> 'closed'
 * - Civil time >= cutoffTime and < closeTime -> 'closing-soon'
 * - Civil time >= openTime and < cutoffTime -> 'open'
 */
export function evaluateBusinessScheduleStatus(
  schedule: BusinessSchedule,
  worldTime: string | number
): RestaurantOperationalState {
  if (!schedule) {
    throw new Error('BusinessSchedule is required');
  }
  const civil = deriveCivilTime(worldTime, schedule.timeZone);

  // 1. Day of week check
  if (!schedule.operatingDays.includes(civil.dayOfWeek)) {
    return 'closed';
  }

  // 2. Closure overrides (full-day exception dates)
  const dateKey = `${civil.year}-${String(civil.month).padStart(2, '0')}-${String(civil.day).padStart(2, '0')}`;
  if (schedule.closureOverrides && schedule.closureOverrides.includes(dateKey)) {
    return 'closed';
  }

  // 3. Time of day in milliseconds
  const timeOfDayMs =
    civil.hour * 3600_000 +
    civil.minute * 60_000 +
    civil.second * 1000 +
    civil.millisecond;

  const openMs = schedule.hours.openHour * 3600_000 + schedule.hours.openMinute * 60_000;
  const closeMs = schedule.hours.closeHour * 3600_000 + schedule.hours.closeMinute * 60_000;
  const cutoffMs = closeMs - schedule.lastEntryCutoffMinutes * 60_000;

  if (timeOfDayMs < openMs || timeOfDayMs >= closeMs) {
    return 'closed';
  }
  if (timeOfDayMs >= cutoffMs && timeOfDayMs < closeMs) {
    return 'closing-soon';
  }
  return 'open';
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
 *
 * Rules:
 * - Status 'open': New admission PERMITTED.
 * - Status 'closing-soon': New admission REJECTED (last-entry cutoff reached).
 * - Status 'closed': New admission REJECTED.
 * - Exits are NOT evaluated here (exits are always permitted by policy).
 */
export function evaluateBusinessAdmission(
  schedule: BusinessSchedule,
  worldTime: string | number
): BusinessAdmissionDecision {
  const status = evaluateBusinessScheduleStatus(schedule, worldTime);
  const openTimeStr = `${String(schedule.hours.openHour).padStart(2, '0')}:${String(schedule.hours.openMinute).padStart(2, '0')}`;
  const closingTimeStr = `${String(schedule.hours.closeHour).padStart(2, '0')}:${String(schedule.hours.closeMinute).padStart(2, '0')}`;

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
    message: `El establecimiento está cerrado. No se permite el ingreso. Cierre: ${closingTimeStr}.`,
    status,
    closingTimeStr,
    openTimeStr,
  };
}
