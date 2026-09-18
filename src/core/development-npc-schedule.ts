/**
 * Authoritative work schedule definition for the development NPC.
 *
 * NOTE: This is a concrete development fixture representing the single authoritative
 * source of truth for the development NPC's workplace and work shift hours across
 * Simulation, Restaurant operations, and Social Inquiry.
 *
 * It is NOT a generic scheduling framework, dynamic scheduler, or persistent entity.
 */

export interface DevelopmentNpcWorkSchedule {
  readonly npcId: string;
  readonly workplaceId: string;
  readonly shiftStartHourUtc: number;
  readonly shiftEndHourUtc: number;
}

export const DEVELOPMENT_NPC_WORK_SCHEDULE: DevelopmentNpcWorkSchedule = {
  npcId: 'agent:dev-npc',
  workplaceId: 'restaurant:development-restaurant',
  shiftStartHourUtc: 9,
  shiftEndHourUtc: 17,
};

/**
 * Formats a UTC hour integer (0–23) as an HH:MM string (e.g. 9 -> "09:00").
 */
export function formatHourUtc(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
