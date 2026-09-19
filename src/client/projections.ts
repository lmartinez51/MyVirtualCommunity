/**
 * Client Projection & Presentation Model (Milestone 30).
 *
 * Responsibilities:
 * - Transforms authoritative server projections into read-only PresentationModels.
 * - Determines visual presentation context ('STREET' | 'BUILDING' | 'RESTAURANT').
 * - Formulates client affordances strictly from facts present in the server projection.
 *
 * Invariants:
 * - Zero world state inference or local rule evaluation.
 * - If the server projection does not expose a fact, the presentation model does NOT invent it.
 * - Payloads contain only transport identifiers required by server commands.
 */

export type PresentationContext = 'STREET' | 'BUILDING' | 'RESTAURANT' | 'UNKNOWN';

export type AffordanceGroup = 'MOVE' | 'INTERACT' | 'ACT';

export interface ClientAffordance {
  id: string;
  label: string;
  commandName: string;
  payload: Record<string, unknown>;
  group?: AffordanceGroup;
}

export type InspectableEntityKind = 'place' | 'agent' | 'offering' | 'opportunity';

export interface InspectableEntity {
  kind: InspectableEntityKind;
  id: string;
  name: string;
  details: Record<string, string | number | boolean | undefined>;
}

export function getAffordanceGroup(commandName: string): AffordanceGroup {
  switch (commandName) {
    case 'enterBuilding':
    case 'leaveBuilding':
    case 'enterRestaurant':
    case 'exitRestaurant':
    case 'traverseStreet':
      return 'MOVE';
    case 'greetAgent':
    case 'introduceAgent':
      return 'INTERACT';
    case 'purchaseOffering':
    case 'startCoffee':
    case 'startEatingPastry':
      return 'ACT';
    default:
      return 'ACT';
  }
}

export interface ClientPlaceItem {
  id: string;
  name: string;
  type: string;
}

export interface ClientAgentItem {
  id: string;
  name: string;
  agentType: string;
  isAcquainted?: boolean;
}

export interface ClientOfferingItem {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
}

export interface ClientOpportunityItem {
  id: string;
  name: string;
  description: string;
  offeringId: string;
  restaurantId?: string;
}

export interface ClientInventoryItem {
  id: string;
  name: string;
  offeringId: string;
  restaurantId: string;
  acquiredAt: string;
}

export interface PresentationModel {
  worldId: string;
  worldTime: string;
  schemaVersion: number;
  activePlayerId: string;
  context: PresentationContext;
  locationId: string;
  locationName: string;
  locationType: string;
  parentName?: string;
  operationalState?: 'open' | 'closed';
  affordances: ClientAffordance[];
  agents: ClientAgentItem[];
  accessibleBuildings: ClientPlaceItem[];
  neighboringStreets: ClientPlaceItem[];
  containedRestaurants: ClientPlaceItem[];
  offerings: ClientOfferingItem[];
  opportunities: ClientOpportunityItem[];
  playerInventory: ClientInventoryItem[];
}

/**
 * Pure projection function converting authoritative runtime queries into a client PresentationModel.
 */
export function createPresentationModel(
  statusData: Record<string, unknown>,
  locationData: Record<string, unknown>
): PresentationModel {
  const worldId = (statusData.worldId as string) || 'unknown-world';
  const worldTime = (statusData.worldTime as string) || '';
  const schemaVersion = typeof statusData.schemaVersion === 'number' ? statusData.schemaVersion : 0;
  const activePlayerId = (statusData.activePlayerId as string) || 'agent:dev-player';

  const loc = (locationData.location as Record<string, unknown>) || {};
  const locationId = (loc.id as string) || '';
  const locationName = (loc.name as string) || 'Unknown Location';
  const locationType = (loc.type as string) || '';

  // Determine presentation context based strictly on locationType
  let context: PresentationContext = 'UNKNOWN';
  if (locationType === 'street') {
    context = 'STREET';
  } else if (locationType === 'building') {
    context = 'BUILDING';
  } else if (locationType === 'restaurant') {
    context = 'RESTAURANT';
  }

  // Extract co-located agents
  const rawAgents = Array.isArray(loc.agents) ? loc.agents : [];
  const agents: ClientAgentItem[] = rawAgents.map((a: Record<string, unknown>) => ({
    id: (a.id as string) || '',
    name: (a.name as string) || '',
    agentType: (a.agentType as string) || '',
    isAcquainted: Boolean(a.isAcquainted),
  }));

  // Extract spatial collections according to context
  const accessibleBuildings: ClientPlaceItem[] = Array.isArray(loc.accessibleBuildings)
    ? loc.accessibleBuildings.map((b: Record<string, unknown>) => ({
        id: (b.id as string) || '',
        name: (b.name as string) || '',
        type: (b.type as string) || 'building',
      }))
    : [];

  const neighboringStreets: ClientPlaceItem[] = Array.isArray(loc.neighboringStreets)
    ? loc.neighboringStreets.map((s: Record<string, unknown>) => ({
        id: (s.id as string) || '',
        name: (s.name as string) || '',
        type: (s.type as string) || 'street',
      }))
    : [];

  const containedRestaurants: ClientPlaceItem[] = Array.isArray(loc.containedRestaurants)
    ? loc.containedRestaurants.map((r: Record<string, unknown>) => ({
        id: (r.id as string) || '',
        name: (r.name as string) || '',
        type: (r.type as string) || 'restaurant',
      }))
    : [];

  const offerings: ClientOfferingItem[] = Array.isArray(loc.offerings)
    ? loc.offerings.map((o: Record<string, unknown>) => ({
        id: (o.id as string) || '',
        name: (o.name as string) || '',
        priceMinor: typeof o.priceMinor === 'number' ? o.priceMinor : 0,
        currency: (o.currency as string) || 'USD',
      }))
    : [];

  const opportunities: ClientOpportunityItem[] = Array.isArray(loc.opportunities)
    ? loc.opportunities.map((op: Record<string, unknown>) => ({
        id: (op.id as string) || '',
        name: (op.name as string) || '',
        description: (op.description as string) || '',
        offeringId: (op.offeringId as string) || '',
        restaurantId: op.restaurantId as string | undefined,
      }))
    : [];

  const rawInventory = Array.isArray(locationData.playerInventory)
    ? (locationData.playerInventory as unknown[])
    : [];
  const playerInventory: ClientInventoryItem[] = rawInventory.map((item) => {
    const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      id: (rec.id as string) || '',
      name: (rec.name as string) || '',
      offeringId: (rec.offeringId as string) || '',
      restaurantId: (rec.restaurantId as string) || '',
      acquiredAt: (rec.acquiredAt as string) || '',
    };
  });

  const operationalState =
    loc.operationalState === 'open' || loc.operationalState === 'closed'
      ? loc.operationalState
      : undefined;

  const parentStreet = loc.parentStreet as Record<string, unknown> | undefined;
  const parentBuilding = loc.parentBuilding as Record<string, unknown> | undefined;
  const parentName = parentStreet?.name
    ? (parentStreet.name as string)
    : parentBuilding?.name
      ? (parentBuilding.name as string)
      : undefined;

  // Build affordances strictly from exposed projection facts
  const affordances: ClientAffordance[] = [];

  if (context === 'STREET') {
    // 1. Enter accessible buildings
    for (const b of accessibleBuildings) {
      affordances.push({
        id: `enter-${b.id}`,
        label: `Enter ${b.name}`,
        commandName: 'enterBuilding',
        payload: { buildingId: b.id },
        group: getAffordanceGroup('enterBuilding'),
      });
    }

    // 2. Traverse to neighboring streets
    for (const s of neighboringStreets) {
      affordances.push({
        id: `traverse-${s.id}`,
        label: `Walk to ${s.name}`,
        commandName: 'traverseStreet',
        payload: { targetStreetId: s.id },
        group: getAffordanceGroup('traverseStreet'),
      });
    }
  } else if (context === 'BUILDING') {
    // 1. Leave building to parent street
    if (parentStreet && typeof parentStreet.id === 'string') {
      affordances.push({
        id: `leave-${locationId}`,
        label: `Exit to ${parentStreet.name || 'Street'}`,
        commandName: 'leaveBuilding',
        payload: { buildingId: locationId },
        group: getAffordanceGroup('leaveBuilding'),
      });
    }

    // 2. Enter contained restaurants
    for (const r of containedRestaurants) {
      affordances.push({
        id: `enter-${r.id}`,
        label: `Enter ${r.name}`,
        commandName: 'enterRestaurant',
        payload: { restaurantId: r.id },
        group: getAffordanceGroup('enterRestaurant'),
      });
    }
  } else if (context === 'RESTAURANT') {
    // 1. Exit restaurant to parent building
    if (parentBuilding && typeof parentBuilding.id === 'string') {
      affordances.push({
        id: `exit-${locationId}`,
        label: `Exit to ${parentBuilding.name || 'Building Lobby'}`,
        commandName: 'exitRestaurant',
        payload: { restaurantId: locationId },
        group: getAffordanceGroup('exitRestaurant'),
      });
    }

    // 2. Purchase offerings (when restaurant is open and offerings are exposed)
    if (operationalState === 'open') {
      for (const off of offerings) {
        const priceFmt = (off.priceMinor / 100).toFixed(2);
        affordances.push({
          id: `purchase-${off.id}`,
          label: `Buy ${off.name} ($${priceFmt})`,
          commandName: 'purchaseOffering',
          payload: { offeringId: off.id },
          group: getAffordanceGroup('purchaseOffering'),
        });
      }

      // 3. Consume coffee (Milestone 33: when restaurant is open and player possesses coffee from this restaurant)
      const eligibleCoffee = playerInventory.find(
        (item) =>
          item.offeringId === 'offering:development-coffee' && item.restaurantId === locationId
      );
      if (eligibleCoffee) {
        affordances.push({
          id: `consume-coffee-${eligibleCoffee.id}`,
          label: `Have Coffee (${eligibleCoffee.name})`,
          commandName: 'startCoffee',
          payload: {},
          group: getAffordanceGroup('startCoffee'),
        });
      }

      // 4. Consume pastry (Milestone 34: when restaurant is open and player possesses pastry from this restaurant)
      const eligiblePastry = playerInventory.find(
        (item) =>
          item.offeringId === 'offering:development-pastry' && item.restaurantId === locationId
      );
      if (eligiblePastry) {
        affordances.push({
          id: `consume-pastry-${eligiblePastry.id}`,
          label: `Eat Pan Dulce (${eligiblePastry.name})`,
          commandName: 'startEatingPastry',
          payload: {},
          group: getAffordanceGroup('startEatingPastry'),
        });
      }
    }
  }

  // Social affordances for other co-located agents
  for (const agent of agents) {
    if (agent.id !== activePlayerId) {
      affordances.push({
        id: `greet-${agent.id}`,
        label: `Greet ${agent.name}`,
        commandName: 'greetAgent',
        payload: { targetAgentId: agent.id },
        group: getAffordanceGroup('greetAgent'),
      });

      if (!agent.isAcquainted) {
        affordances.push({
          id: `introduce-${agent.id}`,
          label: `Introduce to ${agent.name}`,
          commandName: 'introduceAgent',
          payload: { targetAgentId: agent.id },
          group: getAffordanceGroup('introduceAgent'),
        });
      }
    }
  }

  return {
    worldId,
    worldTime,
    schemaVersion,
    activePlayerId,
    context,
    locationId,
    locationName,
    locationType,
    parentName,
    operationalState,
    affordances,
    agents,
    accessibleBuildings,
    neighboringStreets,
    containedRestaurants,
    offerings,
    opportunities,
    playerInventory,
  };
}

/**
 * Pure projection lookup returning strictly exposed facts for an observable entity.
 * Invariant: Never synthesizes or infers unprojected properties.
 */
export function findInspectableEntity(
  model: PresentationModel,
  id: string
): InspectableEntity | null {
  if (model.locationId === id) {
    return {
      kind: 'place',
      id: model.locationId,
      name: model.locationName,
      details: {
        'Location Type': model.locationType,
        ...(model.parentName ? { 'Parent Location': model.parentName } : {}),
        ...(model.operationalState ? { 'Operational State': model.operationalState } : {}),
      },
    };
  }

  const bldg = model.accessibleBuildings.find((b) => b.id === id);
  if (bldg) {
    return {
      kind: 'place',
      id: bldg.id,
      name: bldg.name,
      details: {
        'Location Type': bldg.type,
      },
    };
  }

  const st = model.neighboringStreets.find((s) => s.id === id);
  if (st) {
    return {
      kind: 'place',
      id: st.id,
      name: st.name,
      details: {
        'Location Type': st.type,
      },
    };
  }

  const rest = model.containedRestaurants.find((r) => r.id === id);
  if (rest) {
    return {
      kind: 'place',
      id: rest.id,
      name: rest.name,
      details: {
        'Location Type': rest.type,
      },
    };
  }

  const agent = model.agents.find((a) => a.id === id);
  if (agent) {
    return {
      kind: 'agent',
      id: agent.id,
      name: agent.name,
      details: {
        'Agent Type': agent.agentType,
        'Acquaintance Status': agent.isAcquainted ? 'Acquainted' : 'Stranger',
      },
    };
  }

  const offering = model.offerings.find((o) => o.id === id);
  if (offering) {
    return {
      kind: 'offering',
      id: offering.id,
      name: offering.name,
      details: {
        Price: `$${(offering.priceMinor / 100).toFixed(2)}`,
        Currency: offering.currency,
      },
    };
  }

  const opp = model.opportunities.find((o) => o.id === id);
  if (opp) {
    return {
      kind: 'opportunity',
      id: opp.id,
      name: opp.name,
      details: {
        Description: opp.description,
        'Offering ID': opp.offeringId,
        ...(opp.restaurantId ? { 'Restaurant ID': opp.restaurantId } : {}),
      },
    };
  }

  return null;
}
