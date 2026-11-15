/**
 * Authoritative work schedule definition for the development NPC.
 *
 * NOTE: This is a concrete development fixture representing the single authoritative
 * source of truth for the development NPC's workplace and work shift hours across
 * Simulation, Restaurant operations, and Social Inquiry.
 *
 * It is NOT a generic scheduling framework, dynamic scheduler, or persistent entity.
 */

import type { Agent } from './entities/agent.js';
import { deriveCivilTime } from './civil-time.js';

export interface DevelopmentNpcWorkSchedule {
  readonly npcId: string;
  readonly workplaceId: string;
  readonly shiftStartHourUtc: number;
  readonly shiftEndHourUtc: number;
  readonly shiftStartHour: number;
  readonly shiftEndHour: number;
}

export const DEVELOPMENT_NPC_WORK_SCHEDULE: DevelopmentNpcWorkSchedule = {
  npcId: 'agent:dev-npc',
  workplaceId: 'restaurant:development-restaurant',
  shiftStartHourUtc: 9,
  shiftEndHourUtc: 17,
  shiftStartHour: 9,
  shiftEndHour: 17,
};

/**
 * Deterministic routine schedule definition for an NPC (Milestone 64).
 *
 * Declaratively defines the topological locations and civil time boundaries
 * governing the deterministic daily routine of an NPC.
 *
 * Not authoritative world state; pure fixture configuration.
 */
export interface DeterministicNpcSchedule {
  readonly npcId: string;
  readonly residenceId: string;
  readonly commuteLocationId: string;
  readonly workplaceId: string;
  readonly recreationLocationId: string;
  readonly shiftStartHour: number;
  readonly shiftStartMinute?: number;
  readonly shiftEndHour: number;
  readonly shiftEndMinute?: number;
  readonly commuteLeadMinutes: number;
  readonly recreationStartHour: number;
  readonly recreationStartMinute?: number;
  readonly recreationEndHour: number;
  readonly recreationEndMinute?: number;
  readonly actionDescriptions?: {
    readonly resting?: string;
    readonly commuting?: string;
    readonly working?: string;
    readonly promenading?: string;
  };
  readonly activityLabels?: {
    readonly resting?: string;
    readonly commuting?: string;
    readonly working?: string;
    readonly promenading?: string;
  };
}

export const DEVELOPMENT_NPC_ID = 'agent:dev-npc';
export const SECONDARY_DEVELOPMENT_NPC_ID = 'agent:secondary-dev-npc';

export const DEVELOPMENT_NPC_SCHEDULE: DeterministicNpcSchedule = Object.freeze({
  npcId: DEVELOPMENT_NPC_ID,
  residenceId: 'building:development-residence',
  commuteLocationId: 'street:development-street',
  workplaceId: 'restaurant:development-restaurant',
  recreationLocationId: 'street:avenida-juarez',
  shiftStartHour: 9,
  shiftStartMinute: 0,
  shiftEndHour: 17,
  shiftEndMinute: 0,
  commuteLeadMinutes: 30,
  recreationStartHour: 17,
  recreationStartMinute: 0,
  recreationEndHour: 20,
  recreationEndMinute: 30,
  actionDescriptions: Object.freeze({
    resting: 'Stay at residence',
    commuting: 'Commute to work via Development Street',
    working: 'Work shift at restaurant',
    promenading: 'Walk neighborhood along Avenida Juárez',
  }),
  activityLabels: Object.freeze({
    resting: 'Resting at home',
    commuting: 'Commuting to work',
    working: 'Working at restaurant',
    promenading: 'Walking along Avenida Juárez',
  }),
});

export const SECONDARY_DEVELOPMENT_NPC_SCHEDULE: DeterministicNpcSchedule = Object.freeze({
  npcId: SECONDARY_DEVELOPMENT_NPC_ID,
  residenceId: 'building:development-residence',
  commuteLocationId: 'street:development-street',
  workplaceId: 'restaurant:development-restaurant',
  recreationLocationId: 'street:avenida-juarez',
  shiftStartHour: 11,
  shiftStartMinute: 0,
  shiftEndHour: 16,
  shiftEndMinute: 0,
  commuteLeadMinutes: 30,
  recreationStartHour: 8,
  recreationStartMinute: 30,
  recreationEndHour: 10,
  recreationEndMinute: 30,
  actionDescriptions: Object.freeze({
    resting: 'Stay at residence',
    commuting: 'Commute to work via Development Street',
    working: 'Work shift at restaurant',
    promenading: 'Walk neighborhood along Avenida Juárez',
  }),
  activityLabels: Object.freeze({
    resting: 'Resting at home',
    commuting: 'Commuting to work',
    working: 'Working at restaurant',
    promenading: 'Walking along Avenida Juárez',
  }),
});

export const ELENA_NPC_ID = 'agent:elena-npc';

export const ELENA_NPC_SCHEDULE: DeterministicNpcSchedule = Object.freeze({
  npcId: ELENA_NPC_ID,
  residenceId: 'building:del-porvenir-residence',
  commuteLocationId: 'street:calle-del-porvenir',
  workplaceId: 'restaurant:wing-spot',
  recreationLocationId: 'street:blvd-gomez-morin',
  shiftStartHour: 9,
  shiftStartMinute: 0,
  shiftEndHour: 17,
  shiftEndMinute: 0,
  commuteLeadMinutes: 30,
  recreationStartHour: 17,
  recreationStartMinute: 0,
  recreationEndHour: 20,
  recreationEndMinute: 30,
  actionDescriptions: Object.freeze({
    resting: 'Stay at residence',
    commuting: 'Commute to work via Calle Del Porvenir',
    working: 'Work shift at restaurant',
    promenading: 'Walk along Blvd. Gómez Morín',
  }),
  activityLabels: Object.freeze({
    resting: 'Resting at home',
    commuting: 'Commuting to work',
    working: 'Working at restaurant',
    promenading: 'Walking along Blvd. Gómez Morín',
  }),
});

/**
 * Immutable fixture lookup map of deterministic NPC schedules (Milestone 64).
 */
export const DETERMINISTIC_NPC_SCHEDULES: Readonly<Record<string, DeterministicNpcSchedule>> = Object.freeze({
  [DEVELOPMENT_NPC_ID]: DEVELOPMENT_NPC_SCHEDULE,
  [SECONDARY_DEVELOPMENT_NPC_ID]: SECONDARY_DEVELOPMENT_NPC_SCHEDULE,
  [ELENA_NPC_ID]: ELENA_NPC_SCHEDULE,
});

/**
 * Pure lookup finding the deterministic schedule for an NPC, or returning null if none defined.
 */
export function findNpcSchedule(npcId: string): DeterministicNpcSchedule | null {
  if (typeof npcId !== 'string' || npcId.trim() === '') {
    return null;
  }
  return DETERMINISTIC_NPC_SCHEDULES[npcId] ?? null;
}

/**
 * Checks whether an agent has a deterministic routine schedule defined in fixtures.
 */
export function hasNpcRoutineSchedule(npcId: string): boolean {
  return findNpcSchedule(npcId) !== null;
}

/**
 * Minimal fixture factory creating the secondary development NPC entity for testing and simulation.
 */
export function createSecondaryDevelopmentNpc(
  initialTime: string = '2026-09-14T08:00:00.000Z'
): Agent {
  return {
    id: SECONDARY_DEVELOPMENT_NPC_ID,
    type: 'agent',
    name: 'Secondary Development NPC',
    agentType: 'npc',
    activityState: 'idle',
    activitySince: initialTime,
    locationId: SECONDARY_DEVELOPMENT_NPC_SCHEDULE.residenceId,
    interiorSpaceId: null,
    balanceMinor: 0,
    currency: 'USD',
    playerActivity: null,
  };
}

/**
 * Formats a UTC or local hour integer (0–23) as an HH:MM string (e.g. 9 -> "09:00").
 */
export function formatHourUtc(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * Pure evaluator checking whether an ISO-8601 World Time falls within a schedule interval [startHour, endHour).
 *
 * Evaluates against the derived local CivilTime in the specified IANA timezone.
 *
 * Exact boundary: [startHour:00:00.000, endHour:00:00.000)
 */
export function isTimeWithinScheduleInterval(
  isoTime: string,
  startHour: number = DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHour,
  endHour: number = DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHour,
  timeZone: string
): boolean {
  if (!timeZone || typeof timeZone !== 'string') {
    throw new Error('timeZone is required to evaluate schedule interval');
  }
  const civil = deriveCivilTime(isoTime, timeZone);
  const timeOfDayMs =
    civil.hour * 3600_000 +
    civil.minute * 60_000 +
    civil.second * 1000 +
    civil.millisecond;

  const startMs = startHour * 3600_000;
  const endMs = endHour * 3600_000;

  return timeOfDayMs >= startMs && timeOfDayMs < endMs;
}
