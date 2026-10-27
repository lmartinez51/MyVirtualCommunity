import { Place } from './entities/geography.js';
import {
  Restaurant,
  evaluateDevelopmentRestaurantOperationalRule,
} from './entities/restaurant.js';
import { Agent } from './entities/agent.js';
import { Offering } from './entities/offering.js';
import { Property, createInitialPropertiesForPlaces } from './property.js';
import {
  SiteAgentAssociation,
  DEVELOPMENT_SEED_SITE_AGENT_ASSOCIATIONS,
  REAL_WORLD_JUAREZ_SEED_SITE_AGENT_ASSOCIATIONS,
} from './site-agent-association.js';
import { resolveLocationTimeZone } from './civil-time.js';

export interface SeedWorldData {
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  properties: Property[];
  siteAgentAssociations: SiteAgentAssociation[];
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

  const restaurantBuildingId = 'building:development-building';
  const restaurantTimeZone = resolveLocationTimeZone({ places } as any, restaurantBuildingId);
  const operationalState = evaluateDevelopmentRestaurantOperationalRule(initialTime, restaurantTimeZone);

  const restaurants: Restaurant[] = [
    {
      id: 'restaurant:development-restaurant',
      type: 'restaurant',
      name: 'Development Restaurant',
      buildingId: restaurantBuildingId,
      operationalState,
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
      interiorSpaceId: null,
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
      interiorSpaceId: null,
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

  const properties = createInitialPropertiesForPlaces(places);
  const siteAgentAssociations = [...DEVELOPMENT_SEED_SITE_AGENT_ASSOCIATIONS];

  return {
    places,
    restaurants,
    agents,
    offerings,
    properties,
    siteAgentAssociations,
  };
}

/**
 * Creates the minimal real-world spatial seed world for Ciudad Juárez (Milestone 38).
 *
 * Grounded in verified public geography of Ciudad Juárez Centro Histórico:
 * - City: Ciudad Juárez (city:ciudad-juarez, root)
 * - District: Centro Histórico (district:centro-historico) [Representation Choice]
 * - Neighborhood: Zona Centro (neighborhood:zona-centro) [Representation Choice]
 * - Primary Street: Avenida Benito Juárez (street:avenida-benito-juarez)
 * - Sibling Street: Avenida 16 de Septiembre (street:avenida-16-de-septiembre)
 * - Residential Building: Residential Building (building:real-world-residence) [Generic Representation]
 * - Commercial Building: Kentucky Club Building (building:kentucky-club-building)
 * - Restaurant: Kentucky Club (restaurant:kentucky-club) [Av. Benito Juárez 643]
 * - Player Agent: Ciudad Juárez Player (agent:real-world-player), starting inside building:real-world-residence
 * - Synthetic Service Staff Agent: Service Staff (agent:m39-service-staff), located inside restaurant:kentucky-club (Milestone 39)
 * - Synthetic Commercial Offering: M39 Demo Beverage (offering:m39-demo-beverage), available at Kentucky Club (Milestone 39)
 *
 * NOTE:
 * - District and Neighborhood assignments are structural representation choices within
 *   the existing Place containment hierarchy, not immutable world model laws.
 * - Kentucky Club's operationalState ('open') is a simulation default required by the
 *   preconditions of enterRestaurant(), not a verified real-world schedule claim.
 * - agent:m39-service-staff is a synthetic M39 service-agent fixture. It does NOT represent
 *   a real Kentucky Club employee or real staffing identity.
 * - offering:m39-demo-beverage is a synthetic M39 demonstration fixture ($3.00 USD). It does NOT
 *   represent a real Kentucky Club menu item, price, offering, or inventory.
 *
 * @param initialTime The world time timestamp to associate with initial agent activity and restaurant operational state.
 */
export function createRealWorldJuarezSeedWorld(
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
      id: 'district:centro-historico',
      type: 'district',
      name: 'Centro Histórico',
      parentId: 'city:ciudad-juarez',
    },
    {
      id: 'neighborhood:zona-centro',
      type: 'neighborhood',
      name: 'Zona Centro',
      parentId: 'district:centro-historico',
    },
    {
      id: 'street:avenida-benito-juarez',
      type: 'street',
      name: 'Avenida Benito Juárez',
      parentId: 'neighborhood:zona-centro',
    },
    {
      id: 'building:real-world-residence',
      type: 'building',
      name: 'Residential Building',
      parentId: 'street:avenida-benito-juarez',
    },
    {
      id: 'building:kentucky-club-building',
      type: 'building',
      name: 'Kentucky Club Building',
      parentId: 'street:avenida-benito-juarez',
    },
    {
      id: 'street:avenida-16-de-septiembre',
      type: 'street',
      name: 'Avenida 16 de Septiembre',
      parentId: 'neighborhood:zona-centro',
    },
  ];

  const restaurants: Restaurant[] = [
    {
      id: 'restaurant:kentucky-club',
      type: 'restaurant',
      name: 'Kentucky Club',
      buildingId: 'building:kentucky-club-building',
      operationalState: 'open',
      operationalSince: initialTime,
      balanceMinor: 0,
      currency: 'USD',
    },
  ];

  const agents: Agent[] = [
    {
      id: 'agent:real-world-player',
      type: 'agent',
      name: 'Ciudad Juárez Player',
      agentType: 'player',
      activityState: 'active',
      activitySince: initialTime,
      locationId: 'building:real-world-residence',
      interiorSpaceId: null,
      balanceMinor: 2000,
      currency: 'USD',
      playerActivity: null,
    },
    {
      id: 'agent:m39-service-staff',
      type: 'agent',
      name: 'Service Staff',
      agentType: 'npc',
      activityState: 'active',
      activitySince: initialTime,
      locationId: 'restaurant:kentucky-club',
      interiorSpaceId: null,
      balanceMinor: 0,
      currency: 'USD',
      playerActivity: null,
    },
  ];

  const offerings: Offering[] = [
    {
      id: 'offering:m39-demo-beverage',
      type: 'offering',
      name: 'M39 Demo Beverage',
      restaurantId: 'restaurant:kentucky-club',
      priceMinor: 300,
      currency: 'USD',
    },
  ];

  const properties = createInitialPropertiesForPlaces(places);
  const siteAgentAssociations = [...REAL_WORLD_JUAREZ_SEED_SITE_AGENT_ASSOCIATIONS];

  return {
    places,
    restaurants,
    agents,
    offerings,
    properties,
    siteAgentAssociations,
  };
}

/**
 * Creates the real-world spatial seed world for the Blvd. Manuel Gómez Morín slice (Milestone 80).
 *
 * Grounded in verified geography of Ciudad Juárez:
 * - Arterial Street: Blvd. Manuel Gómez Morín (bidirectional)
 * - Connecting Streets: Calle Del Porvenir (north, west side), Av. La Arboleda (north, east side)
 * - Commercial Corner (West): Pastelerías La Tía Lupe, Wing Spot
 * - Residential (North Del Porvenir): Residencia Del Porvenir (Elena home)
 * - Central Block: Dollar 2 Go large paved parcel, Acabados HBC, CatZoo Clínica Felina
 * - East Block: Corporativo Arboleda
 *
 * @param initialTime The world time timestamp to associate with initial agent activity and restaurant operational state.
 */
export function createGomezMorinSeedWorld(
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
      id: 'district:gomez-morin-corridor',
      type: 'district',
      name: 'Corredor Gómez Morín',
      parentId: 'city:ciudad-juarez',
    },
    {
      id: 'neighborhood:valle-del-sol',
      type: 'neighborhood',
      name: 'Valle del Sol / San Marcos',
      parentId: 'district:gomez-morin-corridor',
    },
    {
      id: 'street:blvd-gomez-morin',
      type: 'street',
      name: 'Blvd. Manuel Gómez Morín',
      parentId: 'neighborhood:valle-del-sol',
    },
    {
      id: 'street:calle-del-porvenir',
      type: 'street',
      name: 'Calle Del Porvenir',
      parentId: 'neighborhood:valle-del-sol',
    },
    {
      id: 'street:av-la-arboleda',
      type: 'street',
      name: 'Avenida La Arboleda',
      parentId: 'neighborhood:valle-del-sol',
    },
    {
      id: 'building:tia-lupe-building',
      type: 'building',
      name: 'Edificio Pastelerías La Tía Lupe',
      parentId: 'street:blvd-gomez-morin',
    },
    {
      id: 'building:wing-spot-building',
      type: 'building',
      name: 'Edificio Wing Spot',
      parentId: 'street:blvd-gomez-morin',
    },
    {
      id: 'building:del-porvenir-residence',
      type: 'building',
      name: 'Residencia Del Porvenir',
      parentId: 'street:calle-del-porvenir',
    },
    {
      id: 'building:dollar-2-go-building',
      type: 'building',
      name: 'Edificio Dollar 2 Go',
      parentId: 'street:blvd-gomez-morin',
    },
    {
      id: 'building:acabados-hbc-building',
      type: 'building',
      name: 'Edificio Acabados HRC',
      parentId: 'street:blvd-gomez-morin',
    },
    {
      id: 'building:catzoo-building',
      type: 'building',
      name: 'Edificio CatZoo Clínica Felina',
      parentId: 'street:blvd-gomez-morin',
    },
    {
      id: 'building:corporativo-arboleda-building',
      type: 'building',
      name: 'Edificio Corporativo Arboleda',
      parentId: 'street:av-la-arboleda',
    },
  ];

  const restaurants: Restaurant[] = [
    {
      id: 'restaurant:pasteleria-tia-lupe',
      type: 'restaurant',
      name: 'Pastelerías La Tía Lupe',
      buildingId: 'building:tia-lupe-building',
      operationalState: 'open',
      operationalSince: initialTime,
      balanceMinor: 0,
      currency: 'USD',
    },
    {
      id: 'restaurant:wing-spot',
      type: 'restaurant',
      name: 'Wing Spot Gómez Morín',
      buildingId: 'building:wing-spot-building',
      operationalState: 'open',
      operationalSince: initialTime,
      balanceMinor: 0,
      currency: 'USD',
    },
  ];

  const agents: Agent[] = [
    {
      id: 'agent:gomez-morin-player',
      type: 'agent',
      name: 'Ciudad Juárez Player',
      agentType: 'player',
      activityState: 'active',
      activitySince: initialTime,
      locationId: 'street:blvd-gomez-morin',
      interiorSpaceId: null,
      balanceMinor: 2500,
      currency: 'USD',
      playerActivity: null,
    },
    {
      id: 'agent:elena-npc',
      type: 'agent',
      name: 'Elena Morales',
      agentType: 'npc',
      activityState: 'idle',
      activitySince: initialTime,
      locationId: 'building:del-porvenir-residence',
      interiorSpaceId: null,
      balanceMinor: 0,
      currency: 'USD',
      playerActivity: null,
    },
  ];

  const offerings: Offering[] = [
    {
      id: 'offering:pastel-de-tres-leches',
      type: 'offering',
      name: 'Pastel de Tres Leches',
      restaurantId: 'restaurant:pasteleria-tia-lupe',
      priceMinor: 650,
      currency: 'USD',
    },
    {
      id: 'offering:boneless-wings',
      type: 'offering',
      name: 'Alitas Boneless',
      restaurantId: 'restaurant:wing-spot',
      priceMinor: 1200,
      currency: 'USD',
    },
    {
      id: 'offering:traditional-wings',
      type: 'offering',
      name: 'Alitas Tradicionales',
      restaurantId: 'restaurant:wing-spot',
      priceMinor: 1400,
      currency: 'USD',
    },
    {
      id: 'offering:seasoned-fries',
      type: 'offering',
      name: 'Papas Sazonadas',
      restaurantId: 'restaurant:wing-spot',
      priceMinor: 450,
      currency: 'USD',
    },
    {
      id: 'offering:fountain-soda',
      type: 'offering',
      name: 'Refresco de Fuente',
      restaurantId: 'restaurant:wing-spot',
      priceMinor: 250,
      currency: 'USD',
    },
  ];

  const properties = createInitialPropertiesForPlaces(places);
  const siteAgentAssociations: SiteAgentAssociation[] = [
    {
      placeId: 'building:del-porvenir-residence',
      agentId: 'agent:elena-npc',
      role: 'resident',
    },
    {
      placeId: 'restaurant:wing-spot',
      agentId: 'agent:elena-npc',
      role: 'attendant',
    },
  ];

  return {
    places,
    restaurants,
    agents,
    offerings,
    properties,
    siteAgentAssociations,
  };
}
