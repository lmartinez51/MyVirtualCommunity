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
  hint?: string;
}

export interface ClientActionConsideration {
  action: string;
  targetId: string;
  considered: boolean;
  reason?: string;
  description?: string;
}

export type InspectableEntityKind = 'place' | 'agent' | 'offering' | 'opportunity' | 'order';

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
    case 'interactAtResidence':
    case 'greetAgent':
    case 'introduceAgent':
    case 'giveItem':
      return 'INTERACT';
    case 'purchaseOffering':
    case 'startCoffee':
    case 'startEatingPastry':
    case 'startAccompaniedActivity':
      return 'ACT';
    default:
      return 'ACT';
  }
}

export interface ClientPlaceItem {
  id: string;
  name: string;
  type: string;
  isResidential?: boolean;
}

export interface ClientAgentItem {
  id: string;
  name: string;
  agentType: string;
  isAcquainted?: boolean;
  possessions?: string[];
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

export interface ObservablePendingOrder {
  id: string;
  restaurantId: string;
  status: 'preparing' | 'ready';
  totalAmountMinor: number;
  currency: string;
  readyAt: string;
  createdAt: string;
}

export interface ClientCivilTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  dayOfWeek: number;
  timeZone: string;
  utcOffsetMinutes: number;
  isoCivilString: string;
}

export interface ClientTemporalContext {
  worldTime: string;
  locationId: string;
  rootCityId: string;
  rootCityName: string;
  timeZone: string;
  civilTime: ClientCivilTime;
  formattedTime: string;
  formattedDisplay: string;
}

/**
 * Formats a ClientCivilTime into a 12-hour civil time string and display string with city name.
 * e.g. formattedTime: "10:00 AM", formattedDisplay: "10:00 AM · Ciudad Juárez"
 */
export function formatCivilTimeDisplay(
  civilTime: ClientCivilTime,
  cityName: string
): { formattedTime: string; formattedDisplay: string } {
  const period = civilTime.hour >= 12 ? 'PM' : 'AM';
  let hour12 = civilTime.hour % 12;
  if (hour12 === 0) hour12 = 12;
  const minuteStr = civilTime.minute.toString().padStart(2, '0');
  const formattedTime = `${hour12}:${minuteStr} ${period}`;
  const formattedDisplay = cityName ? `${formattedTime} · ${cityName}` : formattedTime;
  return { formattedTime, formattedDisplay };
}

/**
 * Formats universal UTC world time for clear UI presentation.
 * e.g. "2026-10-01T16:00:00.000Z" -> "Oct 1, 2026 · 16:00 UTC"
 */
export function formatWorldTimeDisplay(worldTime: string): string {
  if (!worldTime) return '---';
  const parsed = new Date(worldTime);
  if (Number.isNaN(parsed.getTime())) return worldTime;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = months[parsed.getUTCMonth()];
  const d = parsed.getUTCDate();
  const y = parsed.getUTCFullYear();
  const hh = parsed.getUTCHours().toString().padStart(2, '0');
  const mm = parsed.getUTCMinutes().toString().padStart(2, '0');
  return `${m} ${d}, ${y} · ${hh}:${mm} UTC`;
}

export interface PresentationModel {
  worldId: string;
  worldTime: string;
  formattedWorldTime?: string;
  schemaVersion: number;
  activePlayerId: string;
  context: PresentationContext;
  locationId: string;
  locationName: string;
  locationType: string;
  parentName?: string;
  operationalState?: 'open' | 'closing-soon' | 'closed';
  affordances: ClientAffordance[];
  agents: ClientAgentItem[];
  accessibleBuildings: ClientPlaceItem[];
  neighboringStreets: ClientPlaceItem[];
  containedRestaurants: ClientPlaceItem[];
  offerings: ClientOfferingItem[];
  opportunities: ClientOpportunityItem[];
  playerInventory: ClientInventoryItem[];
  pendingOrders: ObservablePendingOrder[];
  playerActivity?: {
    activity: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number;
    companionAgentId?: string | null;
  } | null;
  actionConsiderations?: ClientActionConsideration[];
  temporalContext?: ClientTemporalContext;
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
    possessions: Array.isArray(a.possessions)
      ? (a.possessions as unknown[]).filter((p): p is string => typeof p === 'string')
      : undefined,
  }));

  // Extract spatial collections according to context
  const accessibleBuildings: ClientPlaceItem[] = Array.isArray(loc.accessibleBuildings)
    ? loc.accessibleBuildings.map((b: Record<string, unknown>) => ({
        id: (b.id as string) || '',
        name: (b.name as string) || '',
        type: (b.type as string) || 'building',
        ...(b.isResidential ? { isResidential: true } : {}),
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

  const rawPendingOrders = Array.isArray(locationData.pendingOrders)
    ? (locationData.pendingOrders as unknown[])
    : [];
  const pendingOrders: ObservablePendingOrder[] = rawPendingOrders
    .map((item) => {
      const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return {
        id: (rec.id as string) || '',
        restaurantId: (rec.restaurantId as string) || '',
        status: (rec.status as 'preparing' | 'ready') || 'preparing',
        totalAmountMinor: typeof rec.totalAmountMinor === 'number' ? rec.totalAmountMinor : 0,
        currency: (rec.currency as string) || 'USD',
        readyAt: (rec.readyAt as string) || '',
        createdAt: (rec.createdAt as string) || '',
      };
    })
    .filter((o) => o.status === 'preparing' || o.status === 'ready');

  const operationalState =
    loc.operationalState === 'open' ||
    loc.operationalState === 'closing-soon' ||
    loc.operationalState === 'closed'
      ? (loc.operationalState as 'open' | 'closing-soon' | 'closed')
      : undefined;

  const parentStreet = loc.parentStreet as Record<string, unknown> | undefined;
  const parentBuilding = loc.parentBuilding as Record<string, unknown> | undefined;
  const parentName = parentStreet?.name
    ? (parentStreet.name as string)
    : parentBuilding?.name
      ? (parentBuilding.name as string)
      : undefined;

  const rawActivity = (locationData.playerActivity ?? statusData.playerActivity) as Record<string, unknown> | null | undefined;
  const playerActivity = rawActivity
    ? {
        activity: (rawActivity.activity as string) || '',
        startedAt: (rawActivity.startedAt as string) || '',
        completedAt: (rawActivity.completedAt as string | null) || null,
        durationMs: typeof rawActivity.durationMs === 'number' ? rawActivity.durationMs : 0,
        companionAgentId: (rawActivity.companionAgentId as string | null | undefined) ?? null,
      }
    : null;

  // Extract action considerations (Milestone 48)
  const rawConsiderations = Array.isArray(loc.actionConsiderations)
    ? loc.actionConsiderations
    : Array.isArray(locationData.actionConsiderations)
      ? locationData.actionConsiderations
      : [];
  const actionConsiderations: ClientActionConsideration[] = rawConsiderations.map((c) => {
    const rec = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    return {
      action: (rec.action as string) || '',
      targetId: (rec.targetId as string) || '',
      considered: Boolean(rec.considered),
      reason: rec.reason as string | undefined,
      description: rec.description as string | undefined,
    };
  });

  // Build affordances strictly from exposed projection facts
  const affordances: ClientAffordance[] = [];

  if (context === 'STREET') {
    // 1. Enter accessible buildings or interact at residence
    for (const b of accessibleBuildings) {
      if (b.isResidential) {
        affordances.push({
          id: `interact-residence-${b.id}`,
          label: `Knock at ${b.name}`,
          commandName: 'interactAtResidence',
          payload: { buildingId: b.id },
          group: getAffordanceGroup('interactAtResidence'),
        });
      } else {
        affordances.push({
          id: `enter-${b.id}`,
          label: `Enter ${b.name}`,
          commandName: 'enterBuilding',
          payload: { buildingId: b.id },
          group: getAffordanceGroup('enterBuilding'),
        });
      }
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

    // 2. Enter contained restaurants (with consideration hint if derived by world)
    for (const r of containedRestaurants) {
      const matchConsideration = actionConsiderations.find(
        (c) => c.action === 'enterRestaurant' && c.targetId === r.id && c.considered
      );

      affordances.push({
        id: `enter-${r.id}`,
        label: `Enter ${r.name}`,
        commandName: 'enterRestaurant',
        payload: { restaurantId: r.id },
        group: getAffordanceGroup('enterRestaurant'),
        hint: matchConsideration?.description,
      });
    }
  } else if (context === 'RESTAURANT') {
    // 1. Exit restaurant to parent building
    if (parentBuilding && typeof parentBuilding.id === 'string') {
      const matchExitConsideration = actionConsiderations.find(
        (c) => c.action === 'exitRestaurant' && c.considered
      );
      affordances.push({
        id: `exit-${locationId}`,
        label: `Exit to ${parentBuilding.name || 'Building Lobby'}`,
        commandName: 'exitRestaurant',
        payload: { restaurantId: locationId },
        group: getAffordanceGroup('exitRestaurant'),
        hint: matchExitConsideration?.description,
      });
    }

    // 2. Purchase offerings (when restaurant is open and offerings are exposed)
    if (operationalState === 'open') {
      for (const off of offerings) {
        const priceFmt = (off.priceMinor / 100).toFixed(2);
        const matchConsideration = actionConsiderations.find(
          (c) => c.action === 'purchaseOffering' && c.targetId === off.id && c.considered
        );
        affordances.push({
          id: `purchase-${off.id}`,
          label: `Buy ${off.name} ($${priceFmt})`,
          commandName: 'purchaseOffering',
          payload: { offeringId: off.id },
          group: getAffordanceGroup('purchaseOffering'),
          hint: matchConsideration?.description,
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

      // 5. Accompanied Refreshment (Milestone 51: when restaurant is open and player possesses coffee)
      if (eligibleCoffee) {
        for (const companion of agents) {
          if (companion.id !== activePlayerId && companion.isAcquainted) {
            const companionHasPastry = companion.possessions?.some(
              (p) => p.includes('Pan Dulce') || p.includes('Pastry')
            );
            const matchConsideration = actionConsiderations.find(
              (c) =>
                c.action === 'startAccompaniedActivity' &&
                c.targetId === companion.id &&
                c.considered
            );
            if (companionHasPastry || matchConsideration) {
              affordances.push({
                id: `accompanied-refreshment-${companion.id}`,
                label: `Enjoy Refreshment with ${companion.name}`,
                commandName: 'startAccompaniedActivity',
                payload: { companionAgentId: companion.id },
                group: getAffordanceGroup('startAccompaniedActivity'),
                hint: matchConsideration?.description,
              });
            }
          }
        }
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

      // Milestone 50: Give item affordance if acquainted and player possesses available items
      if (agent.isAcquainted && playerInventory.length > 0) {
        for (const item of playerInventory) {
          affordances.push({
            id: `give-${item.id}-${agent.id}`,
            label: `Give ${item.name} to ${agent.name}`,
            commandName: 'giveItem',
            payload: {
              targetAgentId: agent.id,
              itemId: item.id,
            },
            group: getAffordanceGroup('giveItem'),
          });
        }
      }
    }
  }

  // Authoritative player-facing temporal context (derived from virtual geography)
  const rawTemporal = (locationData.temporalContext || loc.temporalContext) as Record<string, unknown> | undefined;
  let temporalContext: ClientTemporalContext | undefined = undefined;
  if (rawTemporal && typeof rawTemporal === 'object') {
    const rawCivil = (rawTemporal.civilTime || {}) as Record<string, unknown>;
    const civilTime: ClientCivilTime = {
      year: typeof rawCivil.year === 'number' ? rawCivil.year : 0,
      month: typeof rawCivil.month === 'number' ? rawCivil.month : 0,
      day: typeof rawCivil.day === 'number' ? rawCivil.day : 0,
      hour: typeof rawCivil.hour === 'number' ? rawCivil.hour : 0,
      minute: typeof rawCivil.minute === 'number' ? rawCivil.minute : 0,
      second: typeof rawCivil.second === 'number' ? rawCivil.second : 0,
      millisecond: typeof rawCivil.millisecond === 'number' ? rawCivil.millisecond : 0,
      dayOfWeek: typeof rawCivil.dayOfWeek === 'number' ? rawCivil.dayOfWeek : 0,
      timeZone: (rawCivil.timeZone as string) || '',
      utcOffsetMinutes: typeof rawCivil.utcOffsetMinutes === 'number' ? rawCivil.utcOffsetMinutes : 0,
      isoCivilString: (rawCivil.isoCivilString as string) || '',
    };
    const rootCityName = (rawTemporal.rootCityName as string) || '';
    const { formattedTime, formattedDisplay } = formatCivilTimeDisplay(civilTime, rootCityName);
    temporalContext = {
      worldTime: (rawTemporal.worldTime as string) || worldTime,
      locationId: (rawTemporal.locationId as string) || locationId,
      rootCityId: (rawTemporal.rootCityId as string) || '',
      rootCityName,
      timeZone: (rawTemporal.timeZone as string) || '',
      civilTime,
      formattedTime,
      formattedDisplay,
    };
  }

  const formattedWorldTime = formatWorldTimeDisplay(worldTime);

  return {
    worldId,
    worldTime,
    formattedWorldTime,
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
    pendingOrders,
    playerActivity,
    actionConsiderations,
    temporalContext,
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
  if (id.startsWith('order:')) {
    const order = model.pendingOrders?.find((o) => o.id === id);
    if (order) {
      const rest = model.containedRestaurants.find((r) => r.id === order.restaurantId);
      const isReady = order.status === 'ready';
      return {
        kind: 'order',
        id: order.id,
        name: `Order ${order.id}`,
        details: {
          'Restaurant': rest ? rest.name : order.restaurantId,
          'Status': isReady
            ? (model.operationalState === 'closed' ? 'READY (Pickup Deferred)' : 'READY FOR PICKUP')
            : 'PREPARING',
          'Total': `$${(order.totalAmountMinor / 100).toFixed(2)} ${order.currency}`,
          'Ready At': order.readyAt,
        },
      };
    }
  }

  if (model.locationId === id) {
    const locPending = model.pendingOrders?.filter((o) => o.restaurantId === model.locationId) ?? [];
    const pendingText = locPending.length > 0
      ? locPending.map((o) => `${o.id} (${o.status.toUpperCase()})`).join(', ')
      : undefined;
    return {
      kind: 'place',
      id: model.locationId,
      name: model.locationName,
      details: {
        'Location Type': model.locationType,
        ...(model.parentName ? { 'Parent Location': model.parentName } : {}),
        ...(model.temporalContext ? {
          'City': model.temporalContext.rootCityName,
          'Timezone': model.temporalContext.timeZone,
          'Local Time': model.temporalContext.formattedDisplay,
        } : {}),
        ...(model.operationalState ? { 'Operational State': model.operationalState } : {}),
        ...(pendingText ? { 'Pending Orders': pendingText } : {}),
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
    const matchConsideration = model.actionConsiderations?.find(
      (c) => c.action === 'enterRestaurant' && c.targetId === rest.id && c.considered
    );
    const restPending = model.pendingOrders?.filter((o) => o.restaurantId === rest.id) ?? [];
    const pendingText = restPending.length > 0
      ? restPending.map((o) => `${o.id} (${o.status === 'ready' ? 'Ready - Pickup Deferred' : 'Preparing'})`).join(', ')
      : undefined;

    return {
      kind: 'place',
      id: rest.id,
      name: rest.name,
      details: {
        'Location Type': rest.type,
        ...(matchConsideration?.description
          ? { Consideration: matchConsideration.description }
          : {}),
        ...(pendingText ? { 'Pending Orders': pendingText } : {}),
      },
    };
  }

  const agent = model.agents.find((a) => a.id === id);
  if (agent) {
    const matchConsideration = model.actionConsiderations?.find(
      (c) => c.action === 'startAccompaniedActivity' && c.targetId === agent.id && c.considered
    );
    return {
      kind: 'agent',
      id: agent.id,
      name: agent.name,
      details: {
        'Agent Type': agent.agentType,
        'Acquaintance Status': agent.isAcquainted ? 'Acquainted' : 'Stranger',
        ...(agent.possessions && agent.possessions.length > 0
          ? { Possessions: agent.possessions.join(', ') }
          : {}),
        ...(matchConsideration?.description
          ? { Consideration: matchConsideration.description }
          : {}),
      },
    };
  }

  const offering = model.offerings.find((o) => o.id === id);
  if (offering) {
    const matchConsideration = model.actionConsiderations?.find(
      (c) => c.action === 'purchaseOffering' && c.targetId === offering.id && c.considered
    );
    return {
      kind: 'offering',
      id: offering.id,
      name: offering.name,
      details: {
        Price: `$${(offering.priceMinor / 100).toFixed(2)}`,
        Currency: offering.currency,
        ...(matchConsideration?.description
          ? { Consideration: matchConsideration.description }
          : {}),
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
