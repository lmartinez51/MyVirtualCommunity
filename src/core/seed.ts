import { Place } from './entities/geography.js';
import {
  Restaurant,
  evaluateDevelopmentRestaurantOperationalRule,
} from './entities/restaurant.js';
import { Agent } from './entities/agent.js';
import { Offering } from './entities/offering.js';

export interface SeedWorldData {
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
}

/**
 * Creates the minimal synthetic development seed world for Ciudad Juárez.
 *
 * NOTE: The subordinate places (Development District, Neighborhood, Street,
 * Building, Restaurant) and development agents are synthetic fixtures created
 * exclusively to validate the world model and containment hierarchy.
 * They do NOT represent real-world geographic or factual claims about Ciudad Juárez.
 *
 * @param initialTime The world time timestamp to associate with initial agent activity and restaurant operational state.
 */
export function createDevelopmentSeedWorld(
  initialTime: string = '2026-09-14T08:00:00.000Z'
): SeedWorldData {
  const places: Place[] = [
    {
      id: 'city:ciudad-juarez',
      type: 'city',
      name: 'Ciudad Juárez',
      parentId: null,
    },
    {
      id: 'district:development-district',
      type: 'district',
      name: 'Development District',
      parentId: 'city:ciudad-juarez',
    },
    {
      id: 'neighborhood:development-neighborhood',
      type: 'neighborhood',
      name: 'Development Neighborhood',
      parentId: 'district:development-district',
    },
    {
      id: 'street:development-street',
      type: 'street',
      name: 'Development Street',
      parentId: 'neighborhood:development-neighborhood',
    },
    {
      id: 'building:development-building',
      type: 'building',
      name: 'Development Building',
      parentId: 'street:development-street',
    },
    {
      id: 'building:development-residence',
      type: 'building',
      name: 'Development Residence',
      parentId: 'street:development-street',
    },
    {
      id: 'street:avenida-juarez',
      type: 'street',
      name: 'Avenida Juárez',
      parentId: 'neighborhood:development-neighborhood',
    },
    {
      id: 'building:avenida-juarez-kiosk',
      type: 'building',
      name: 'Avenida Juárez Kiosk',
      parentId: 'street:avenida-juarez',
    },
  ];

  const restaurants: Restaurant[] = [
    {
      id: 'restaurant:development-restaurant',
      type: 'restaurant',
      name: 'Development Restaurant',
      buildingId: 'building:development-building',
      operationalState: evaluateDevelopmentRestaurantOperationalRule(initialTime),
      operationalSince: initialTime,
      balanceMinor: 0,
      currency: 'USD',
    },
  ];

  const agents: Agent[] = [
    {
      id: 'agent:dev-player',
      type: 'agent',
      name: 'Development Player',
      agentType: 'player',
      activityState: 'active',
      activitySince: initialTime,
      locationId: 'building:development-building',
      balanceMinor: 2000,
      currency: 'USD',
      playerActivity: null,
    },
    {
      id: 'agent:dev-npc',
      type: 'agent',
      name: 'Development NPC',
      agentType: 'npc',
      activityState: 'idle',
      activitySince: initialTime,
      locationId: 'building:development-residence',
      balanceMinor: 0,
      currency: 'USD',
      playerActivity: null,
    },
  ];

  const offerings: Offering[] = [
    {
      id: 'offering:development-coffee',
      type: 'offering',
      name: 'Coffee',
      restaurantId: 'restaurant:development-restaurant',
      priceMinor: 500,
      currency: 'USD',
    },
  ];

  return {
    places,
    restaurants,
    agents,
    offerings,
  };
}
