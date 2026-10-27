import { WorldClock } from './clock.js';
import { BaseEntity, validateEntityId } from './entities/entity.js';
import { Place, PlaceType, validatePlaces } from './entities/geography.js';
import {
  Restaurant,
  RestaurantOperationalState,
  validateRestaurants,
  getRestaurantClosingTimeMs,
} from './entities/restaurant.js';
import { Agent, AgentType, ActivityState, validateAgents, ConsumableActivityType, PlayerActivityState } from './entities/agent.js';
import { Offering, validateOfferings } from './entities/offering.js';
import { createDevelopmentSeedWorld, createRealWorldJuarezSeedWorld, createGomezMorinSeedWorld, SeedWorldData } from './seed.js';
import { HAVING_COFFEE_DURATION_MS } from './activities/having-coffee.js';
import {
  resolveLocationTimeZone,
  resolvePlayerTemporalContext,
  type PlayerTemporalContext,
} from './civil-time.js';
import {
  type Acquaintance,
  getCanonicalAgentPair,
  getAcquaintanceId,
  validateAcquaintances,
} from './entities/social.js';
import {
  DEVELOPMENT_NPC_WORK_SCHEDULE,
  formatHourUtc,
  DevelopmentNpcWorkSchedule,
} from './development-npc-schedule.js';
import {
  RestaurantOperationalTransitionResult,
  RestaurantOperationalTransitionResultCode,
  transitionRestaurantOperationalState,
  isRestaurantOpen,
  isRestaurantAccessible,
  validateBusinessAuthority,
} from './business.js';
import {
  type BusinessSchedule,
  type BusinessAdmissionDecision,
  type BusinessAdmissionResultCode,
  DEFAULT_BUSINESS_SCHEDULES,
  findBusinessSchedule,
  evaluateBusinessScheduleStatus,
  evaluateBusinessAdmission,
} from './business-schedule.js';
export {
  type BusinessSchedule,
  type BusinessAdmissionDecision,
  type BusinessAdmissionResultCode,
  DEFAULT_BUSINESS_SCHEDULES,
  findBusinessSchedule,
  evaluateBusinessScheduleStatus,
  evaluateBusinessAdmission,
};
import { areAgentsCoLocated } from './co-presence.js';
export { areAgentsCoLocated } from './co-presence.js';

import {
  type ActionConsideration,
  type ActionConsiderationAction,
  type ActionConsiderationReason,
  evaluateScheduleInformedRestaurantConsideration,
  evaluateOpportunityInformedCommercialConsideration,
  evaluateAccompaniedConsumableConsideration,
  evaluateRestaurantClosingSoonConsideration,
} from './action-consideration.js';
import {
  type Property,
  type PropertyType,
  type PropertyAssignmentStatus,
  type PropertyHolderType,
  type PropertyHolderReference,
  type PropertyAssignment,
  type UnassignedPropertyAssignment,
  type AssignedPropertyAssignment,
  type PropertyWorldState,
  validatePropertyAuthority,
  createInitialPropertiesForPlaces,
  getProperty,
  getPropertyByBuildingId,
  isPropertyAssigned,
} from './property.js';
import {
  type SiteAgentRole,
  type SiteAgentAssociation,
  type SiteAgentAssociationWorldState,
  VALID_SITE_AGENT_ROLES,
  DEVELOPMENT_SEED_SITE_AGENT_ASSOCIATIONS,
  REAL_WORLD_JUAREZ_SEED_SITE_AGENT_ASSOCIATIONS,
  EXPLICIT_INITIAL_SITE_AGENT_ASSOCIATIONS,
  createInitialSiteAgentAssociations,
  getSiteAgentAssociationKey,
  validateSiteAgentAssociation,
  validateSiteAgentAssociations,
  validateSiteAgentAssociationAuthority,
  getSiteAgentAssociations,
  getSiteResident,
  getSiteAttendant,
  getAgentSiteAssociations,
  getAgentAttendedSite,
} from './site-agent-association.js';
import {
  type ResidentialAccessResultCode,
  type ResidentialAccessResult,
  type ResidentialAccessWorldState,
  type ResidentialAdmissionPolicyResultCode,
  type ResidentialAdmissionPolicyResult,
  type InteractAtResidenceResultCode,
  type InteractAtResidenceResult,
  isResidentialBuilding,
  evaluateResidentialAccess,
  evaluateResidentialAdmissionPolicy,
} from './residential-access.js';
import {
  type NpcRoutinePhase,
  type NpcIntentType,
  type NpcBehavioralState,
  type DeriveNpcBehavioralStateResultCode,
  type DeriveNpcBehavioralStateResult,
  type InspectNpcContextResultCode,
  type ObservedNpcIdentity,
  type ObservedNpcLocation,
  type InspectNpcContextResult,
  type NpcRoutineActionType,
  type NpcRoutineAction,
  type EvaluateNpcRoutineActionResultCode,
  type EvaluateNpcRoutineActionResult,
  type ExecuteNpcRoutineActionResultCode,
  type ExecuteNpcRoutineActionResult,
  type NpcContextualIntentType,
  type NpcContextualIntent,
  type EvaluateNpcContextualIntentResultCode,
  type EvaluateNpcContextualIntentResult,
  type NpcContextualActionType,
  type NpcContextualAction,
  type EvaluateNpcContextualActionResultCode,
  type EvaluateNpcContextualActionResult,
  type ExecuteNpcContextualActionResultCode,
  type ExecuteNpcContextualActionResult,
  evaluateNpcBehavioralState,
  deriveNpcBehavioralState,
  inspectNpcContext,
  evaluateNpcRoutineAction,
  deriveNpcRoutineAction,
  executeNpcRoutineAction,
  evaluateNpcContextualIntent,
  deriveNpcContextualIntent,
  evaluateNpcContextualAction,
  deriveNpcContextualAction,
  executeNpcContextualAction,
} from './npc-behavior.js';
import {
  type AttendantInteractionState,
  type RestaurantServiceAcceptedEvent,
  type ActiveRestaurantServiceInteraction,
  type RequestRestaurantServiceResultCode,
  type RequestRestaurantServiceResult,
  evaluateRequestRestaurantService,
  requestRestaurantService,
  getActiveRestaurantService,
  commitRestaurantServiceInteraction,
  clearActiveRestaurantService,
  resetRestaurantServiceState,
  isAttendantOnDuty,
} from './restaurant-service.js';

export const DEFAULT_WORLD_ID = 'juarez-el-paso';
export const CURRENT_WORLD_STATE_VERSION = 19;

export {
  type RestaurantOperationalTransitionResult,
  type RestaurantOperationalTransitionResultCode,
  transitionRestaurantOperationalState,
  isRestaurantOpen,
  isRestaurantAccessible,
  validateBusinessAuthority,
  type ActionConsideration,
  type ActionConsiderationAction,
  type ActionConsiderationReason,
  evaluateScheduleInformedRestaurantConsideration,
  evaluateOpportunityInformedCommercialConsideration,
  evaluateAccompaniedConsumableConsideration,
  evaluateRestaurantClosingSoonConsideration,
  getRestaurantClosingTimeMs,
  type Property,
  type PropertyType,
  type PropertyAssignmentStatus,
  type PropertyHolderType,
  type PropertyHolderReference,
  type PropertyAssignment,
  type UnassignedPropertyAssignment,
  type AssignedPropertyAssignment,
  getProperty,
  getPropertyByBuildingId,
  isPropertyAssigned,
  type SiteAgentRole,
  type SiteAgentAssociation,
  type SiteAgentAssociationWorldState,
  VALID_SITE_AGENT_ROLES,
  DEVELOPMENT_SEED_SITE_AGENT_ASSOCIATIONS,
  REAL_WORLD_JUAREZ_SEED_SITE_AGENT_ASSOCIATIONS,
  EXPLICIT_INITIAL_SITE_AGENT_ASSOCIATIONS,
  createInitialSiteAgentAssociations,
  getSiteAgentAssociationKey,
  validateSiteAgentAssociation,
  validateSiteAgentAssociations,
  validateSiteAgentAssociationAuthority,
  getSiteAgentAssociations,
  getSiteResident,
  getSiteAttendant,
  getAgentSiteAssociations,
  getAgentAttendedSite,
  type ResidentialAccessResultCode,
  type ResidentialAccessResult,
  type ResidentialAccessWorldState,
  type ResidentialAdmissionPolicyResultCode,
  type ResidentialAdmissionPolicyResult,
  type InteractAtResidenceResultCode,
  type InteractAtResidenceResult,
  isResidentialBuilding,
  evaluateResidentialAccess,
  evaluateResidentialAdmissionPolicy,
  type NpcRoutinePhase,
  type NpcIntentType,
  type NpcBehavioralState,
  type DeriveNpcBehavioralStateResultCode,
  type DeriveNpcBehavioralStateResult,
  type InspectNpcContextResultCode,
  type ObservedNpcIdentity,
  type ObservedNpcLocation,
  type InspectNpcContextResult,
  type NpcRoutineActionType,
  type NpcRoutineAction,
  type EvaluateNpcRoutineActionResultCode,
  type EvaluateNpcRoutineActionResult,
  type ExecuteNpcRoutineActionResultCode,
  type ExecuteNpcRoutineActionResult,
  type NpcContextualIntentType,
  type NpcContextualIntent,
  type EvaluateNpcContextualIntentResultCode,
  type EvaluateNpcContextualIntentResult,
  type NpcContextualActionType,
  type NpcContextualAction,
  type EvaluateNpcContextualActionResultCode,
  type EvaluateNpcContextualActionResult,
  type ExecuteNpcContextualActionResultCode,
  type ExecuteNpcContextualActionResult,
  evaluateNpcBehavioralState,
  deriveNpcBehavioralState,
  inspectNpcContext,
  evaluateNpcRoutineAction,
  deriveNpcRoutineAction,
  executeNpcRoutineAction,
  evaluateNpcContextualIntent,
  deriveNpcContextualIntent,
  evaluateNpcContextualAction,
  deriveNpcContextualAction,
  executeNpcContextualAction,
  type AttendantInteractionState,
  type RestaurantServiceAcceptedEvent,
  type ActiveRestaurantServiceInteraction,
  type RequestRestaurantServiceResultCode,
  type RequestRestaurantServiceResult,
  evaluateRequestRestaurantService,
  requestRestaurantService,
  getActiveRestaurantService,
  commitRestaurantServiceInteraction,
  clearActiveRestaurantService,
  resetRestaurantServiceState,
  isAttendantOnDuty,
};

export {
  type SpatialLayer,
  type SpatialFailureCategory,
  type LogicalDestinationValidationCode,
  type LogicalDestinationValidationResult,
  validateLogicalDestination,
  categorizeSpatialFailure,
  SPATIAL_MOVEMENT_CONTRACT,
} from './spatial-contract.js';

export {
  type NavigationRequest,
  type NavigationStatus,
  type NavigationResult,
  type NavigationProvider,
  type CreateNavigationRequestResultCode,
  type CreateNavigationRequestSuccess,
  type CreateNavigationRequestFailure,
  type CreateNavigationRequestResult,
  type ValidateArrivalAndCommitResultCode,
  type ValidateArrivalAndCommitSuccess,
  type ValidateArrivalAndCommitFailure,
  type ValidateArrivalAndCommitResult,
  createNavigationRequest,
  validateArrivalAndCommit,
  DeterministicMockNavigationProvider,
} from './navigation-contract.js';

export {
  type WorldEntityType,
  type PhysicalRepresentationType,
  type PhysicalRepresentationAvailability,
  type PhysicalEntityMapping,
  type SpatialAnchorType,
  type SpatialAnchor,
  type PhysicalMappingFailureCode,
  type ResolvePhysicalMappingSuccess,
  type ResolvePhysicalMappingFailure,
  type ResolvePhysicalMappingResult,
  type ResolveSpatialAnchorSuccess,
  type ResolveSpatialAnchorFailure,
  type ResolveSpatialAnchorResult,
  identifyWorldEntity,
  PhysicalMappingRegistry,
  resolvePhysicalMapping,
  resolveSpatialAnchor,
} from './physical-mapping.js';

export {
  type ProjectedPhysicalMapping,
  type ProjectedSpatialAnchor,
  type ProjectedEntity,
  type WorldProjectionSnapshot,
  type ClientIntent,
  type ProjectionReconciliation,
  projectWorldState,
  reconcileWorldProjection,
  createClientIntent,
  PhysicalClientAdapter,
} from './world-projection.js';

export const EATING_PASTRY_DURATION_MINUTES = 15;
export const EATING_PASTRY_DURATION_MS = 15 * 60 * 1000;

export type { ConsumableActivityType, PlayerActivityState };

import {
  QUALIFYING_ITEM_OFFERING_IDS,
  type QualifyingItemOfferingId,
  type ItemStatus,
  type OwnedItem,
  type ObservableOwnedItem,
  type ConsumeOwnedItemResultCode,
  type ConsumeOwnedItemResult,
  type TransferItemPossessionResultCode,
  type TransferItemPossessionResult,
  type ItemWorldState,
  consumeOwnedItem,
  getOwnedItem,
  getPlayerAvailableItems,
  isItemAvailable,
  transferItemPossession,
  validateItemAuthority,
} from './item.js';

export {
  QUALIFYING_ITEM_OFFERING_IDS,
  type QualifyingItemOfferingId,
  type ItemStatus,
  type OwnedItem,
  type ObservableOwnedItem,
  type ConsumeOwnedItemResultCode,
  type ConsumeOwnedItemResult,
  type TransferItemPossessionResultCode,
  type TransferItemPossessionResult,
  type ItemWorldState,
  consumeOwnedItem,
  getOwnedItem,
  getPlayerAvailableItems,
  isItemAvailable,
  transferItemPossession,
  validateItemAuthority,
};

import {
  type Order,
  type OrderStatus,
  type FulfillmentMode,
  type OrderLine,
  type PlaceOrderParams,
  type PlaceOrderResult,
  type PlaceOrderResultCode,
  type CollectOrderResult,
  type CollectOrderResultCode,
  type InquireRestaurantServiceResult,
  type InquireRestaurantServiceResultCode,
  type OrderPreparationTransition,
  type OrderWorldState,
  type ObservablePendingOrder,
  ORDER_PREPARATION_DURATION_MS,
  ORDER_PREPARATION_DURATION_MINUTES,
  inquireRestaurantService,
  placeOrder,
  tickOrderPreparation,
  collectOrder,
  getCustomerOrders,
  getRestaurantOrders,
  validateOrderAuthority,
} from './order.js';

export {
  type Order,
  type OrderStatus,
  type FulfillmentMode,
  type OrderLine,
  type PlaceOrderParams,
  type PlaceOrderResult,
  type PlaceOrderResultCode,
  type CollectOrderResult,
  type CollectOrderResultCode,
  type InquireRestaurantServiceResult,
  type InquireRestaurantServiceResultCode,
  type OrderPreparationTransition,
  type OrderWorldState,
  type ObservablePendingOrder,
  ORDER_PREPARATION_DURATION_MS,
  ORDER_PREPARATION_DURATION_MINUTES,
  inquireRestaurantService,
  placeOrder,
  tickOrderPreparation,
  collectOrder,
  getCustomerOrders,
  getRestaurantOrders,
  validateOrderAuthority,
};

export type { Acquaintance, DevelopmentNpcWorkSchedule };
export {
  getCanonicalAgentPair,
  getAcquaintanceId,
  validateAcquaintances,
  DEVELOPMENT_NPC_WORK_SCHEDULE,
  formatHourUtc,
};

/**
 * Concrete historical fact recording a completed commercial purchase (Milestone 13).
 *
 * Captures immutable evidence that an agent purchased an offering at a restaurant
 * for a specific price at a specific world clock time.
 *
 * NOTE: This is an immutable historical record. It is NOT an authority for current state,
 * is NEVER queried to calculate current balances or operational states, and does NOT
 * represent a generic Event or EventStore system.
 */
export interface PurchaseRecord {
  readonly id: string;
  readonly worldTime: string;
  readonly playerId: string;
  readonly restaurantId: string;
  readonly offeringId: string;
  readonly amountMinor: number;
  readonly currency: string;
  /**
   * LEGACY HISTORICAL METADATA ONLY (Milestones 29-32).
   * In Schema Version 12+, this field is frozen and non-authoritative.
   * Runtime domain logic, perception projections, and client affordances
   * MUST evaluate OwnedItem.status instead.
   */
  readonly consumedAt?: string | null;
}

/**
 * Concrete historical fact recording a completed Having Coffee player activity (Milestone 14).
 *
 * Captures immutable evidence that a player completed having coffee associated with
 * a specific restaurant at a specific world clock time.
 *
 * Invariants:
 * - restaurantId: The restaurant at which the Having Coffee activity was started and with which the activity is associated.
 *   Does NOT represent the player's physical location at completedAt.
 * - completedAt: Exact theoretical completion boundary (startedAt + 15m), invariant to tick discovery.
 * - This is an immutable historical record. It is NEVER queried to calculate balances, determine active state,
 *   restrict movement, or drive simulation.
 */
export interface CoffeeCompletionRecord {
  id: string;
  playerId: string;
  restaurantId: string;
  startedAt: string;
  completedAt: string;
}

/**
 * Concrete historical fact recording a completed consumable player activity (Milestone 34).
 *
 * Captures immutable evidence that a player completed a consumable activity associated with
 * a specific restaurant, offering, and optional source item at a specific world clock time.
 */
export interface ActivityCompletionRecord {
  readonly id: string;
  readonly playerId: string;
  readonly activity: ConsumableActivityType;
  readonly offeringId: string;
  readonly restaurantId: string;
  readonly itemId: string | null;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly companionAgentId?: string | null;
}

/**
 * Concrete factual payload of an agent's retained knowledge regarding work schedule (Milestone 35).
 */
export type KnowledgeFactType = 'agent-schedule';

export interface AgentSchedulePayload {
  readonly workplaceId: string;
  readonly shiftStart: string; // "HH:MM"
  readonly shiftEnd: string;   // "HH:MM"
}

export type KnowledgePayload = AgentSchedulePayload;

export type KnowledgeSource = 'social-inquiry' | 'npc-initiative';

/**
 * Authoritative retained epistemic record for an agent (Milestone 35, Milestone 46).
 *
 * Captures subjective declarative facts acquired by an agent through legitimate
 * interactions (such as social inquiry or deterministic NPC initiative).
 *
 * Invariants:
 * - Knowledge != World Truth: Represents what the agent knows, not objective world truth.
 * - Knowledge != Memory: Declarative semantic fact substrate; does not implement decay or cognition.
 * - Logical identity is the composite tuple: (agentId, factType, subjectId).
 * - Single-record upsert: Re-inquiry preserves id and acquiredAt, updates payload and lastVerifiedAt.
 */
export interface AgentKnowledgeRecord {
  readonly id: string; // Implementation-level identifier e.g. /^knowledge:[a-z0-9-]+(:[a-z0-9-]+)*$/
  readonly agentId: string; // Knower (foreign key -> state.agents, agentType === 'player')
  readonly factType: KnowledgeFactType; // Discriminator
  readonly subjectId: string; // Subject entity (foreign key -> state.agents, agentType === 'npc')
  readonly payload: KnowledgePayload; // Grounded factual data
  readonly acquiredAt: string; // ISO-8601 WorldTime when first learned
  readonly lastVerifiedAt: string; // ISO-8601 WorldTime when last confirmed/inquired
  readonly source: KnowledgeSource; // Provenance ('social-inquiry' | 'npc-initiative')
  readonly sourceAgentId: string; // Informant (foreign key -> state.agents, agentType === 'npc')
}

/**
 * Authoritative WorldState schema for Milestone 57.
 *
 * Contains:
 * - worldId: Identity of the regional world.
 * - version: Schema version (18 for Milestone 57).
 * - worldTime: Authoritative ISO-8601 string from WorldClock.
 * - places: Geographic containment hierarchy.
 * - restaurants: Spatial entities contained within Buildings with operationalState, operationalSince, balanceMinor, and currency.
 * - agents: Persistent agent identities with dynamic activityState, activitySince, locationId, balanceMinor, currency, and optional playerActivity.
 * - offerings: Commercial offerings made available by restaurants with deterministic pricing.
 * - purchases: Persistent append-only historical facts of completed purchases.
 * - activityCompletions: Persistent append-only historical facts of completed consumable player activities.
 * - acquaintances: Persistent social acquaintance facts.
 * - items: Authoritative append-only physical possession entities.
 * - knowledge: Persistent epistemic state retained by agents.
 * - orders: Authoritative commercial orders and fulfillment state.
 * - properties: Authoritative physical property tenure records and assignment truth.
 * - siteAgentAssociations: Authoritative first-class associations between places/sites and designated agents.
 */
export interface WorldState {
  worldId: string;
  version: 19;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  activityCompletions: ActivityCompletionRecord[];
  acquaintances: Acquaintance[];
  items: OwnedItem[];
  knowledge: AgentKnowledgeRecord[];
  orders: Order[];
  properties: Property[];
  siteAgentAssociations: SiteAgentAssociation[];
}

/**
 * Historical Agent entity schema for Milestone 57-84 (Version 18).
 * In Version 18, interiorSpaceId was not an authoritative schema field.
 */
export interface AgentV18 extends BaseEntity {
  id: string;
  type: 'agent';
  name: string;
  agentType: AgentType;
  activityState: ActivityState;
  activitySince: string;
  locationId: string;
  interiorSpaceId?: string | null;
  balanceMinor: number;
  currency: string;
  playerActivity?: PlayerActivityState | null;
}

/**
 * Historical WorldState schema for Milestone 57-84 (Version 18).
 * Preserved for strict pre-validation prior to v18 -> v19 migration.
 */
export interface WorldStateV18 {
  worldId: string;
  version: 18;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: AgentV18[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  activityCompletions: ActivityCompletionRecord[];
  acquaintances: Acquaintance[];
  items: OwnedItem[];
  knowledge: AgentKnowledgeRecord[];
  orders: Order[];
  properties: Property[];
  siteAgentAssociations: SiteAgentAssociation[];
}

/**
 * Historical WorldState schema for Milestone 56 (Version 17).
 * Preserved for strict pre-validation prior to v17 -> v18 migration.
 */
export interface WorldStateV17 {
  worldId: string;
  version: 17;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  activityCompletions: ActivityCompletionRecord[];
  acquaintances: Acquaintance[];
  items: OwnedItem[];
  knowledge: AgentKnowledgeRecord[];
  orders: Order[];
  properties: Property[];
}

/**
 * Historical WorldState schema for Milestone 46-55 (Version 16).
 * Preserved for strict pre-validation prior to v16 -> v17 migration.
 */
export interface WorldStateV16 {
  worldId: string;
  version: 16;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  activityCompletions: ActivityCompletionRecord[];
  acquaintances: Acquaintance[];
  items: OwnedItem[];
  knowledge: AgentKnowledgeRecord[];
  orders: Order[];
}

/**
 * Historical WorldState schema for Milestone 39-45 (Version 15).
 * Preserved for strict pre-validation prior to v15 -> v16 migration.
 */
export interface WorldStateV15 {
  worldId: string;
  version: 15;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  activityCompletions: ActivityCompletionRecord[];
  acquaintances: Acquaintance[];
  items: OwnedItem[];
  knowledge: AgentKnowledgeRecord[];
  orders: Order[];
}

/**
 * Historical WorldState schema for Milestone 35-38 (Version 14).
 * Preserved for strict pre-validation prior to v14 -> v15 migration.
 */
export interface WorldStateV14 {
  worldId: string;
  version: 14;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  activityCompletions: ActivityCompletionRecord[];
  acquaintances: Acquaintance[];
  items: OwnedItem[];
  knowledge: AgentKnowledgeRecord[];
}

/**
 * Historical WorldState schema for Milestone 34 (Version 13).
 * Preserved for strict pre-validation prior to v13 -> v14 migration.
 */
export interface WorldStateV13 {
  worldId: string;
  version: 13;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  activityCompletions: ActivityCompletionRecord[];
  acquaintances: Acquaintance[];
  items: OwnedItem[];
}

/**
 * Historical WorldState schema for Milestone 33 (Version 12).
 * Preserved for strict pre-validation prior to v12 -> v13 migration.
 */
export interface WorldStateV12 {
  worldId: string;
  version: 12;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  coffeeCompletions: CoffeeCompletionRecord[];
  acquaintances: Acquaintance[];
  items: OwnedItem[];
}

/**
 * Historical WorldState schema for Milestone 32 (Version 11).
 * Preserved for strict pre-validation prior to v11 -> v12 migration.
 */
export interface WorldStateV11 {
  worldId: string;
  version: 11;
  worldTime: string;
  places: Place[];
  restaurants: Restaurant[];
  agents: Agent[];
  offerings: Offering[];
  purchases: PurchaseRecord[];
  coffeeCompletions: CoffeeCompletionRecord[];
  acquaintances: Acquaintance[];
}

/**
 * Creates the initial WorldState containing seed world data at the current authoritative WorldClock time.
 * If no custom seed is provided, defaults to the synthetic development seed world.
 */
export function createInitialWorldState(
  clock: WorldClock,
  worldId: string = DEFAULT_WORLD_ID,
  customSeed?: SeedWorldData
): WorldState {
  const seed = customSeed ?? createDevelopmentSeedWorld(clock.getTime());

  return {
    worldId,
    version: CURRENT_WORLD_STATE_VERSION,
    worldTime: clock.getTime(),
    places: seed.places,
    restaurants: seed.restaurants,
    agents: seed.agents,
    offerings: seed.offerings,
    purchases: [],
    activityCompletions: [],
    acquaintances: [],
    items: [],
    knowledge: [],
    orders: [],
    properties: seed.properties ? [...seed.properties] : [],
    siteAgentAssociations: seed.siteAgentAssociations ? [...seed.siteAgentAssociations] : [],
  };
}

/**
 * Creates an authoritative WorldState initialized with the minimal real-world Ciudad Juárez
 * spatial foundation seed world (Milestone 38).
 *
 * Configures the player starting location inside the residential building on Avenida Benito Juárez.
 */
export function createRealWorldJuarezWorldState(
  clock: WorldClock,
  worldId: string = DEFAULT_WORLD_ID
): WorldState {
  const seed = createRealWorldJuarezSeedWorld(clock.getTime());
  return createInitialWorldState(clock, worldId, seed);
}

/**
 * Creates an authoritative WorldState initialized with the Blvd. Manuel Gómez Morín
 * real-world spatial slice (Milestone 80).
 */
export function createGomezMorinWorldState(
  clock: WorldClock,
  worldId: string = DEFAULT_WORLD_ID
): WorldState {
  const seed = createGomezMorinSeedWorld(clock.getTime());
  return createInitialWorldState(clock, worldId, seed);
}


/**
 * Takes a snapshot of current WorldState with the latest time from the authoritative WorldClock.
 */
export function snapshotWorldState(
  clock: WorldClock,
  state: Omit<WorldState, 'worldTime'>
): WorldState {
  return {
    worldId: state.worldId,
    version: state.version as 19,
    worldTime: clock.getTime(),
    places: state.places,
    restaurants: state.restaurants,
    agents: state.agents,
    offerings: state.offerings,
    purchases: [...state.purchases],
    activityCompletions: [...state.activityCompletions],
    acquaintances: [...state.acquaintances],
    items: [...state.items],
    knowledge: [...state.knowledge],
    orders: [...state.orders],
    properties: [...state.properties],
    siteAgentAssociations: [...state.siteAgentAssociations],
  };
}

/**
 * Authoritative Spatial Authority transition: Updates an agent's logical/topological locationId (Milestone 1, formalized in Milestone 68).
 *
 * Validates target place existence, updates only the agent's locationId, and guarantees
 * zero mutation on failure.
 *
 * NOTE: This is an instantaneous logical/topological state transition in the World Core.
 * It is NOT physical movement simulation. It does NOT imply that an Agent has physically
 * traversed the physical distance between two locations.
 * In future physical movement/navigation architectures, this represents the authoritative
 * logical transition that completes the traversal sequence:
 * Intent -> Validation -> Navigation Request -> Physical Traversal -> Arrival -> Authoritative Logical Transition.
 *
 * Invariant: Does NOT advance WorldClock, does NOT alter activityState or activitySince,
 * and does NOT compute paths or navigation.
 */
export function transitionAgentLocation(
  state: WorldState,
  agentId: string,
  targetPlaceId: string
): Agent {
  if (typeof targetPlaceId !== 'string' || targetPlaceId.trim() === '') {
    throw new Error('Cannot transition agent location: targetPlaceId must be a non-empty string');
  }

  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error(
      `Cannot transition agent location: agent "${agentId}" not found in world state`
    );
  }

  const targetPlace = state.places.find((p) => p.id === targetPlaceId);
  const targetRestaurant =
    agent.agentType === 'npc'
      ? state.restaurants?.find((r) => r.id === targetPlaceId)
      : undefined;

  if (!targetPlace && !targetRestaurant) {
    throw new Error(
      `Cannot transition agent "${agentId}": target place "${targetPlaceId}" does not exist in world state`
    );
  }

  agent.locationId = targetPlaceId;
  agent.interiorSpaceId = null;
  return agent;
}

export type EnterRestaurantResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'restaurant-not-found'
  | 'restaurant-closed'
  | 'admission-cutoff-reached'
  | 'invalid-location'
  | 'already-inside'
  | 'entrance-required';

export interface EnterRestaurantResult {
  success: boolean;
  code: EnterRestaurantResultCode;
  message: string;
  agentId: string;
  restaurantId: string;
}

export interface EnterRestaurantOptions {
  silent?: boolean;
}

/**
 * Authoritative interaction: A Player agent enters a Restaurant.
 *
 * Implements the minimal interaction cycle:
 * Intent -> Preconditions -> Authoritative State Transition -> Result
 *
 * Preconditions:
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 4. Agent is not already inside the restaurant (code: 'already-inside')
 * 5. Restaurant is open: restaurant.operationalState === 'open' (code: 'restaurant-closed')
 * 6. Agent is located at the restaurant's containing building: agent.locationId === restaurant.buildingId (code: 'invalid-location')
 *
 * Transition:
 * Updates agent.locationId = restaurant.id.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter operationalState, operationalSince, or buildingId of the restaurant.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT affect NPC agents or geography.
 * - Is NOT invoked by the simulation tick.
 */
export function enterRestaurant(
  state: WorldState,
  agentId: string,
  restaurantId: string,
  options: EnterRestaurantOptions = {}
): EnterRestaurantResult {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  if (agent.agentType !== 'player') {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${restaurantId}" not found in world state`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  if (agent.locationId === restaurant.id) {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'already-inside',
      message: `Agent "${agentId}" is already inside restaurant "${restaurantId}"`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  if (restaurant.operationalState === 'closed') {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'restaurant-closed',
      message: `Restaurant "${restaurantId}" is closed (operationalState: "${restaurant.operationalState}")`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  if (restaurant.operationalState === 'closing-soon') {
    const schedule = findBusinessSchedule(restaurant.id);
    if (schedule) {
      const result: EnterRestaurantResult = {
        success: false,
        code: 'admission-cutoff-reached',
        message: `Restaurant "${restaurantId}" is closing soon and no longer accepts new entries (operationalState: "${restaurant.operationalState}")`,
        agentId,
        restaurantId,
      };
      if (!options.silent) {
        console.log(
          `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
        );
      }
      return result;
    }
  }

  if (agent.locationId !== restaurant.buildingId) {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'invalid-location',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not at containing building "${restaurant.buildingId}"`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  // Milestone 85 Correction Pass (F-09 Closure):
  // Topology-backed venues with registered interior topology MUST use authoritative entrance ingress.
  // Direct entry via legacy enterRestaurant() is prohibited for canonical topology-backed venues.
  const canonicalInterior = CANONICAL_M85_INTERIORS.find(
    (i) => i.associatedPlaceId === restaurant.id
  );
  if (canonicalInterior) {
    const result: EnterRestaurantResult = {
      success: false,
      code: 'entrance-required',
      message: `Restaurant "${restaurantId}" has registered interior topology ("${canonicalInterior.interiorId}"). Direct entry via enterRestaurant() is prohibited; enter through an authoritative building entrance using enterThroughEntranceThreshold().`,
      agentId,
      restaurantId,
    };
    if (!options.silent) {
      console.log(
        `[INTERACTION] Agent "${agentId}" failed to enter restaurant "${restaurantId}": ${result.message} (${result.code})`
      );
    }
    return result;
  }

  // Category B: Synthetic / legacy fixture without interior topology
  agent.locationId = restaurant.id;
  agent.interiorSpaceId = null;

  const result: EnterRestaurantResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully entered restaurant "${restaurantId}"`,
    agentId,
    restaurantId,
  };

  if (!options.silent) {
    console.log(`[INTERACTION] Agent "${agentId}" entered restaurant "${restaurantId}"`);
  }

  return result;
}

export type ExitRestaurantResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'restaurant-not-found'
  | 'not-inside-restaurant';

export interface ExitRestaurantResult {
  success: boolean;
  code: ExitRestaurantResultCode;
  message: string;
  agentId: string;
  restaurantId: string;
  buildingId?: string;
}

/**
 * Authoritative interaction: A Player agent exits a Restaurant.
 *
 * Implements the concrete interior exit operation for Milestone 10:
 * Player exits the Restaurant and returns to its containing Building.
 *
 * Preconditions:
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 4. Agent is currently inside that restaurant: agent.locationId === restaurant.id (code: 'not-inside-restaurant')
 *
 * Transition:
 * Updates agent.locationId = restaurant.buildingId.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter operationalState, operationalSince, or buildingId of the restaurant.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT cancel, restart, or alter playerActivity.
 * - Does NOT affect balances, offerings, NPC agents, or geography.
 * - Is NOT invoked by the simulation tick.
 */
export function exitRestaurant(
  state: WorldState,
  agentId: string,
  restaurantId: string
): ExitRestaurantResult {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: ExitRestaurantResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      restaurantId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to exit restaurant "${restaurantId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (agent.agentType !== 'player') {
    const result: ExitRestaurantResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      restaurantId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to exit restaurant "${restaurantId}": ${result.message} (${result.code})`
    );
    return result;
  }

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    const result: ExitRestaurantResult = {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${restaurantId}" not found in world state`,
      agentId,
      restaurantId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to exit restaurant "${restaurantId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (agent.locationId !== restaurant.id) {
    const result: ExitRestaurantResult = {
      success: false,
      code: 'not-inside-restaurant',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not inside restaurant "${restaurantId}"`,
      agentId,
      restaurantId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to exit restaurant "${restaurantId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Authoritative state transition: player returns to containing building
  agent.locationId = restaurant.buildingId;
  agent.interiorSpaceId = null;

  const result: ExitRestaurantResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully exited restaurant "${restaurantId}" into building "${restaurant.buildingId}"`,
    agentId,
    restaurantId,
    buildingId: restaurant.buildingId,
  };

  console.log(
    `[INTERACTION] Agent "${agentId}" exited restaurant "${restaurantId}" into building "${restaurant.buildingId}"`
  );

  return result;
}

export interface ClosureEgressTransitionResult {
  agentId: string;
  previousLocationId: string;
  newLocationId: string;
  restaurantId: string;
  reason: 'restaurant-closed';
}

/**
 * Authoritative cross-domain closure-egress transition (Milestone 52).
 *
 * Evaluated when a restaurant is in 'closed' operational state.
 * Any occupant agent remaining physically inside the closed restaurant
 * is authoritatively transitioned to the containing building (restaurant.buildingId).
 *
 * Invariants:
 * - Domain authority preserved: Spatial/Agent authority updates agent.locationId
 *   in response to business closure, not business authority secretly owning agent location.
 * - Deterministic target: Always resolves to restaurant.buildingId.
 * - Idempotent: If no agents are inside, returns empty array with zero mutations.
 * - Traceable: Returns structured transition records.
 */
export function executeRestaurantClosureEgress(
  state: WorldState,
  restaurantId: string
): ClosureEgressTransitionResult[] {
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant || restaurant.operationalState !== 'closed') {
    return [];
  }

  const egressTargetId = restaurant.buildingId;
  const targetPlace = state.places.find((p) => p.id === egressTargetId);
  if (!targetPlace) {
    return [];
  }

  const transitions: ClosureEgressTransitionResult[] = [];
  for (const agent of state.agents) {
    if (agent.locationId === restaurant.id) {
      agent.locationId = egressTargetId;
      agent.interiorSpaceId = null;
      transitions.push({
        agentId: agent.id,
        previousLocationId: restaurant.id,
        newLocationId: egressTargetId,
        restaurantId: restaurant.id,
        reason: 'restaurant-closed',
      });
      console.log(
        `[CLOSURE-EGRESS] Agent "${agent.id}" egressed from closed restaurant "${restaurant.id}" to building "${egressTargetId}"`
      );
    }
  }

  return transitions;
}

export type LeaveBuildingResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'building-not-found'
  | 'not-at-building'
  | 'street-not-found';

export interface LeaveBuildingResult {
  success: boolean;
  code: LeaveBuildingResultCode;
  message: string;
  agentId: string;
  buildingId: string;
  streetId?: string;
}

/**
 * Authoritative interaction: A Player agent leaves a Building.
 *
 * Implements the concrete Building -> Street exit operation for Milestone 10:
 * Player leaves the Building and reaches its containing Street.
 *
 * Preconditions:
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Building exists in WorldState.places and is of type 'building' (code: 'building-not-found')
 * 4. Agent is currently located at that building: agent.locationId === building.id (code: 'not-at-building')
 * 5. Building has a valid containing Street parent in WorldState.places (code: 'street-not-found')
 *
 * Transition:
 * Updates agent.locationId = building.parentId (the street ID).
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT cancel, restart, or alter playerActivity.
 * - Does NOT affect balances, offerings, restaurants, NPC agents, or geography.
 * - Is NOT invoked by the simulation tick.
 */
export function leaveBuilding(
  state: WorldState,
  agentId: string,
  buildingId: string
): LeaveBuildingResult {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (agent.agentType !== 'player') {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  const building = state.places.find((p) => p.id === buildingId);
  if (!building || building.type !== 'building') {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'building-not-found',
      message: `Building "${buildingId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (agent.locationId !== building.id) {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'not-at-building',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not at building "${buildingId}"`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  if (!building.parentId) {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'street-not-found',
      message: `Building "${buildingId}" has no parent street`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  const street = state.places.find((p) => p.id === building.parentId && p.type === 'street');
  if (!street) {
    const result: LeaveBuildingResult = {
      success: false,
      code: 'street-not-found',
      message: `Containing street "${building.parentId}" for building "${buildingId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to leave building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Authoritative state transition: player moves to containing street
  agent.locationId = street.id;

  const result: LeaveBuildingResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully left building "${buildingId}" into street "${street.id}"`,
    agentId,
    buildingId,
    streetId: street.id,
  };

  console.log(
    `[INTERACTION] Agent "${agentId}" left building "${buildingId}" into street "${street.id}"`
  );

  return result;
}

export type EnterBuildingResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'building-not-found'
  | 'invalid-location'
  | 'already-inside'
  | 'residential-interaction-required'
  | 'resident-not-home'
  | 'resident-agent-missing';

export interface EnterBuildingResult {
  success: boolean;
  code: EnterBuildingResultCode;
  message: string;
  agentId: string;
  buildingId: string;
  streetId?: string;
}

/**
 * Authoritative interaction: A Player agent enters a Building from its containing Street (Milestone 16, Milestone 59).
 *
 * Implements the concrete Street -> Building entry operation, completing the bidirectional
 * local spatial movement loop:
 * Street <-> Building <-> Restaurant
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Building exists in WorldState.places and is of type 'building' (code: 'building-not-found')
 * 4. Player is not already inside the target building: agent.locationId !== building.id (code: 'already-inside')
 * 5. Player is currently located at the target building's parent street:
 *    building has a valid parent street and agent.locationId === building.parentId (code: 'invalid-location')
 * 6. Residential interaction requirement (Milestone 59): Direct entry into residential buildings
 *    is prohibited. Entering a residence requires interacting at the residence (interactAtResidence)
 *    (code: 'residential-interaction-required').
 *
 * Transition:
 * Updates agent location via canonical transitionAgentLocation(state, agent.id, building.id).
 * Guarantees zero state mutation on any precondition or access failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT cancel, restart, or alter playerActivity.
 * - Does NOT consult Property.assignment (Property Authority is completely decoupled from access).
 * - Does NOT affect balances, offerings, restaurants, NPC agents, history, or geography.
 * - Is NOT invoked by the simulation tick.
 */
export function enterBuilding(
  state: WorldState,
  agentId: string,
  buildingId: string
): EnterBuildingResult {
  // 1. Agent exists
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: EnterBuildingResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 2. Agent is a player
  if (agent.agentType !== 'player') {
    const result: EnterBuildingResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 3. Target exists and is a building Place
  const building = state.places.find((p) => p.id === buildingId);
  if (!building || building.type !== 'building') {
    const result: EnterBuildingResult = {
      success: false,
      code: 'building-not-found',
      message: `Building "${buildingId}" not found in world state`,
      agentId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 4. Player is not already inside the target building
  if (agent.locationId === building.id) {
    const result: EnterBuildingResult = {
      success: false,
      code: 'already-inside',
      message: `Agent "${agentId}" is already inside building "${buildingId}"`,
      agentId,
      buildingId,
      streetId: building.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 5. Player is currently located at the target building's parent street
  const street = state.places.find((p) => p.id === building.parentId && p.type === 'street');
  if (!street || agent.locationId !== street.id) {
    const result: EnterBuildingResult = {
      success: false,
      code: 'invalid-location',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not at containing street "${building.parentId}" for building "${buildingId}"`,
      agentId,
      buildingId,
      streetId: building.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter building "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 6. Residential interaction requirement (Milestone 59)
  // Direct entry into residential buildings is prohibited.
  // Entering a residence requires interacting at the residence (interactAtResidence).
  if (isResidentialBuilding(state, building.id)) {
    const result: EnterBuildingResult = {
      success: false,
      code: 'residential-interaction-required',
      message: `Direct entry into residential building "${buildingId}" is prohibited. Residential interaction required.`,
      agentId,
      buildingId,
      streetId: street.id,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to enter residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Authoritative state transition: player enters building
  transitionAgentLocation(state, agent.id, building.id);

  const result: EnterBuildingResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully entered building "${buildingId}" from street "${street.id}"`,
    agentId,
    buildingId,
    streetId: street.id,
  };

  console.log(
    `[INTERACTION] Agent "${agentId}" entered building "${buildingId}" from street "${street.id}"`
  );

  return result;
}

/**
 * Authoritative residential interaction boundary (Milestone 59).
 *
 * Implements the deterministic residential interaction flow:
 * CONTACT -> RESIDENTIAL ADMISSION POLICY -> ADMISSION DECISION -> SPATIAL AUTHORITY -> transitionAgentLocation()
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is a player: agent.agentType === 'player' (code: 'player-not-player')
 * 3. Target exists and is a building Place (code: 'building-not-found')
 * 4. Building is a residential site: isResidentialBuilding(state, building.id) (code: 'building-not-residential')
 * 5. Player is not already inside the target building: player.locationId !== building.id (code: 'already-inside')
 * 6. Player is located at the building's parent street access context: player.locationId === building.parentId (code: 'player-not-at-building-access-context')
 * 7. Resident agent exists in WorldState.agents (code: 'resident-agent-missing')
 * 8. Resident agent is currently physically present at home: resident.locationId === building.id (code: 'resident-not-home')
 * 9. Player and resident agent are acquainted: isAgentAcquainted(state, playerId, resident.id) (code: 'resident-declined-stranger')
 *
 * Transition:
 * On admission approval, delegates spatial movement to transitionAgentLocation(state, playerId, building.id).
 * Guarantees zero state mutation on any precondition or admission denial.
 *
 * Invariants:
 * - Does NOT mutate WorldClock, worldTime, or balances.
 * - Does NOT alter activityState or activitySince of any agent.
 * - Does NOT consult Property.assignment.
 * - Does NOT model consent, willingness, mood, or sleep.
 */
export function interactAtResidence(
  state: WorldState,
  playerId: string,
  buildingId: string
): InteractAtResidenceResult {
  // 1. Player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    const result: InteractAtResidenceResult = {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${playerId}" failed to interact at residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 2. Player is a player agent
  if (player.agentType !== 'player') {
    const result: InteractAtResidenceResult = {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
      buildingId,
    };
    console.log(
      `[INTERACTION] Agent "${playerId}" failed to interact at residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 3. Target exists and is a building Place
  const building = state.places.find((p) => p.id === buildingId);
  if (!building || building.type !== 'building') {
    const result: InteractAtResidenceResult = {
      success: false,
      code: 'building-not-found',
      message: `Building "${buildingId}" not found in world state`,
      playerId,
      buildingId,
      previousLocationId: player.locationId,
      currentLocationId: player.locationId,
    };
    console.log(
      `[INTERACTION] Player "${playerId}" failed to interact at residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 4. Building is a residential site
  if (!isResidentialBuilding(state, building.id)) {
    const result: InteractAtResidenceResult = {
      success: false,
      code: 'building-not-residential',
      message: `Building "${buildingId}" is not a residential building`,
      playerId,
      buildingId,
      previousLocationId: player.locationId,
      currentLocationId: player.locationId,
    };
    console.log(
      `[INTERACTION] Player "${playerId}" failed to interact at residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 5. Player is not already inside the target building
  if (player.locationId === building.id) {
    const result: InteractAtResidenceResult = {
      success: false,
      code: 'already-inside',
      message: `Player "${playerId}" is already inside building "${buildingId}"`,
      playerId,
      buildingId,
      previousLocationId: player.locationId,
      currentLocationId: player.locationId,
    };
    console.log(
      `[INTERACTION] Player "${playerId}" failed to interact at residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 6. Player is located at the building's parent street access context
  if (player.locationId !== building.parentId) {
    const result: InteractAtResidenceResult = {
      success: false,
      code: 'player-not-at-building-access-context',
      message: `Player "${playerId}" is at location "${player.locationId}", not at building access context "${building.parentId}" for building "${buildingId}"`,
      playerId,
      buildingId,
      previousLocationId: player.locationId,
      currentLocationId: player.locationId,
    };
    console.log(
      `[INTERACTION] Player "${playerId}" failed to interact at residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Resolve designated resident association
  const residentAssoc = getSiteResident(state, building.id);
  const residentAgentId = residentAssoc?.agentId;

  // 7. Resident agent entity exists
  const residentAgent = residentAgentId
    ? state.agents.find((a) => a.id === residentAgentId)
    : undefined;
  if (!residentAgent) {
    const result: InteractAtResidenceResult = {
      success: false,
      code: 'resident-agent-missing',
      message: `Designated resident "${residentAgentId ?? 'unknown'}" for building "${buildingId}" was not found in world state`,
      playerId,
      buildingId,
      residentAgentId,
      previousLocationId: player.locationId,
      currentLocationId: player.locationId,
    };
    console.log(
      `[INTERACTION] Player "${playerId}" failed to interact at residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Evaluate admission policy
  const isResidentHome = residentAgent.locationId === building.id;
  const isAcquainted = isAgentAcquainted(state, playerId, residentAgent.id);
  const policyResult = evaluateResidentialAdmissionPolicy(
    isResidentHome,
    isAcquainted,
    residentAgent.id,
    building.id
  );

  // 8. Resident is at home
  if (policyResult.code === 'resident-not-home') {
    const result: InteractAtResidenceResult = {
      success: false,
      code: 'resident-not-home',
      message: `Resident "${residentAgent.id}" is not at home at "${buildingId}" (current location: "${residentAgent.locationId}")`,
      playerId,
      buildingId,
      residentAgentId: residentAgent.id,
      previousLocationId: player.locationId,
      currentLocationId: player.locationId,
      isAdmitted: false,
    };
    console.log(
      `[INTERACTION] Player "${playerId}" knocked at residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 9. Stranger policy check
  if (policyResult.code === 'resident-declined-stranger') {
    const result: InteractAtResidenceResult = {
      success: false,
      code: 'resident-declined-stranger',
      message: `Resident "${residentAgent.id}" does not recognize player "${playerId}" and declined admission to "${buildingId}"`,
      playerId,
      buildingId,
      residentAgentId: residentAgent.id,
      previousLocationId: player.locationId,
      currentLocationId: player.locationId,
      isAdmitted: false,
    };
    console.log(
      `[INTERACTION] Player "${playerId}" knocked at residence "${buildingId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 10. Spatial Authority: Execute transition
  const previousLocationId = player.locationId;
  transitionAgentLocation(state, playerId, building.id);

  const result: InteractAtResidenceResult = {
    success: true,
    code: 'success',
    message: `Resident "${residentAgent.id}" admitted player "${playerId}" into residence "${buildingId}"`,
    playerId,
    buildingId,
    residentAgentId: residentAgent.id,
    previousLocationId,
    currentLocationId: building.id,
    isAdmitted: true,
  };

  console.log(
    `[INTERACTION] Player "${playerId}" entered residence "${buildingId}" after interaction with resident "${residentAgent.id}"`
  );

  return result;
}

export type TraverseStreetResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'not-on-street'
  | 'target-not-found'
  | 'target-not-street'
  | 'already-on-street'
  | 'different-neighborhood';

export interface TraverseStreetResult {
  success: boolean;
  code: TraverseStreetResultCode;
  message: string;
  agentId: string;
  originStreetId?: string;
  targetStreetId: string;
  neighborhoodId?: string;
}

/**
 * Authoritative interaction: A Player agent traverses from their current Street
 * to another sibling Street within the same containing Neighborhood (Milestone 20-A).
 *
 * Implements the concrete Street -> Sibling Street traversal operation, establishing
 * branching intra-neighborhood spatial topology:
 * Neighborhood -> [Street A <-> Street B]
 *
 * Preconditions (evaluated in strict deterministic order):
 * 1. Agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. Agent's current location resolves to a Place of type 'street' (code: 'not-on-street')
 * 4. Target place exists in WorldState.places (code: 'target-not-found')
 * 5. Target place is of type 'street' (code: 'target-not-street')
 * 6. Target street is not the agent's current street: targetStreet.id !== originStreet.id (code: 'already-on-street')
 * 7. Target street and origin street share the identical parent neighborhood (code: 'different-neighborhood')
 *
 * Transition:
 * Updates agent.locationId = targetStreet.id.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter worldTime.
 * - Does NOT alter activityState or activitySince of the agent.
 * - Does NOT cancel, restart, or alter playerActivity.
 * - Does NOT affect balances, offerings, restaurants, NPC agents, history, or geography.
 * - Is NOT invoked by the simulation tick.
 * - Instantaneous and coordinate-free: connectivity is purely shared parent containment.
 */
export function traverseToStreet(
  state: WorldState,
  agentId: string,
  targetStreetId: string
): TraverseStreetResult {
  // 1. Agent exists
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${agentId}" not found in world state`,
      agentId,
      targetStreetId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 2. Agent is a player
  if (agent.agentType !== 'player') {
    const result: TraverseStreetResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${agentId}" is not a player (agentType: "${agent.agentType}")`,
      agentId,
      targetStreetId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 3. Current location resolves to a Place of type 'street'
  const originStreet = state.places.find((p) => p.id === agent.locationId && p.type === 'street');
  if (!originStreet) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'not-on-street',
      message: `Agent "${agentId}" is at location "${agent.locationId}", not on a street`,
      agentId,
      targetStreetId,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 4. Target exists in WorldState.places
  const targetPlace = state.places.find((p) => p.id === targetStreetId);
  if (!targetPlace) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'target-not-found',
      message: `Target street "${targetStreetId}" not found in world state`,
      agentId,
      originStreetId: originStreet.id,
      targetStreetId,
      neighborhoodId: originStreet.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 5. Target is a street
  if (targetPlace.type !== 'street') {
    const result: TraverseStreetResult = {
      success: false,
      code: 'target-not-street',
      message: `Target place "${targetStreetId}" is not a street (type: "${targetPlace.type}")`,
      agentId,
      originStreetId: originStreet.id,
      targetStreetId,
      neighborhoodId: originStreet.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 6. Target is not current street
  if (targetPlace.id === originStreet.id) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'already-on-street',
      message: `Agent "${agentId}" is already on street "${targetStreetId}"`,
      agentId,
      originStreetId: originStreet.id,
      targetStreetId,
      neighborhoodId: originStreet.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // 7. Sibling street check: both streets must share identical parent neighborhood
  if (
    !originStreet.parentId ||
    !targetPlace.parentId ||
    originStreet.parentId !== targetPlace.parentId
  ) {
    const result: TraverseStreetResult = {
      success: false,
      code: 'different-neighborhood',
      message: `Target street "${targetStreetId}" (neighborhood: "${targetPlace.parentId}") is not in the same neighborhood as origin street "${originStreet.id}" (neighborhood: "${originStreet.parentId}")`,
      agentId,
      originStreetId: originStreet.id,
      targetStreetId,
      neighborhoodId: originStreet.parentId ?? undefined,
    };
    console.log(
      `[INTERACTION] Agent "${agentId}" failed to traverse to street "${targetStreetId}": ${result.message} (${result.code})`
    );
    return result;
  }

  // Authoritative state transition: player moves to target street
  agent.locationId = targetPlace.id;

  const result: TraverseStreetResult = {
    success: true,
    code: 'success',
    message: `Agent "${agentId}" successfully traversed from street "${originStreet.id}" to street "${targetPlace.id}" in neighborhood "${originStreet.parentId}"`,
    agentId,
    originStreetId: originStreet.id,
    targetStreetId: targetPlace.id,
    neighborhoodId: originStreet.parentId,
  };

  console.log(
    `[INTERACTION] Agent "${agentId}" traversed from street "${originStreet.id}" to street "${targetPlace.id}"`
  );

  return result;
}

/**
 * Queries all commercial offerings associated with a given restaurant.
 *
 * NOTE: This is a pure structural world state query. It does NOT mutate WorldState,
 * does NOT check operational hours or purchase eligibility, and returns the offerings
 * regardless of whether the restaurant is currently open or closed.
 * If the restaurant does not exist or has no offerings, returns an empty array.
 */
export function getRestaurantOfferings(
  state: WorldState,
  restaurantId: string
): Offering[] {
  if (typeof restaurantId !== 'string' || restaurantId.trim() === '') {
    return [];
  }
  return state.offerings.filter((o) => o.restaurantId === restaurantId);
}

export type PurchaseOfferingResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'restaurant-not-found'
  | 'not-inside-restaurant'
  | 'restaurant-closed'
  | 'restaurant-closing-soon'
  | 'offering-not-found'
  | 'offering-not-at-restaurant'
  | 'currency-mismatch'
  | 'insufficient-funds';

export interface PurchaseOfferingResult {
  success: boolean;
  code: PurchaseOfferingResultCode;
  message: string;
  playerId: string;
  offeringId: string;
  restaurantId?: string;
  amountMinor?: number;
  currency?: string;
  playerBalanceAfter?: number;
  restaurantBalanceAfter?: number;
  itemId?: string;
  purchaseId?: string;
}

export interface PurchaseOfferingOptions {
  restaurantId?: string;
  silent?: boolean;
}

/**
 * Authoritative interaction: A Player purchases a Commercial Offering from a Restaurant.
 *
 * Atomically transfers price from player balance to restaurant balance.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. The agent exists in WorldState.agents (code: 'agent-not-found')
 * 2. The agent is a player: agent.agentType === 'player' (code: 'agent-not-player')
 * 3. The restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 4. The player is currently inside that restaurant: agent.locationId === restaurant.id (code: 'not-inside-restaurant')
 * 5. The restaurant is currently open: restaurant.operationalState === 'open' (code: 'restaurant-closed')
 * 6. The offering exists in WorldState.offerings (code: 'offering-not-found')
 * 7. The offering belongs to the specified restaurant: offering.restaurantId === restaurant.id (code: 'offering-not-at-restaurant')
 * 8. The offering currency is compatible with the balances involved (code: 'currency-mismatch')
 * 9. The player has sufficient funds: player.balanceMinor >= offering.priceMinor (code: 'insufficient-funds')
 *
 * Guarantees zero state mutation on any precondition failure.
 */
export function purchaseOffering(
  state: WorldState,
  playerId: string,
  offeringId: string,
  restaurantIdOrOptions?: string | PurchaseOfferingOptions,
  maybeOptions?: PurchaseOfferingOptions
): PurchaseOfferingResult {
  const options: PurchaseOfferingOptions =
    typeof restaurantIdOrOptions === 'object' && restaurantIdOrOptions !== null
      ? restaurantIdOrOptions
      : (maybeOptions ?? {});

  const specifiedRestaurantId =
    typeof restaurantIdOrOptions === 'string'
      ? restaurantIdOrOptions
      : options.restaurantId;

  // 1. Resolve the agent and confirm existence
  const agent = state.agents.find((a) => a.id === playerId);
  if (!agent) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${playerId}" not found in world state`,
      playerId,
      offeringId,
      restaurantId: specifiedRestaurantId,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 2. Confirm agent is a player
  if (agent.agentType !== 'player') {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${agent.agentType}")`,
      playerId,
      offeringId,
      restaurantId: specifiedRestaurantId,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // Resolve target restaurant
  const offeringCandidate = state.offerings.find((o) => o.id === offeringId);
  const targetRestaurantId =
    specifiedRestaurantId ??
    offeringCandidate?.restaurantId ??
    (state.restaurants.some((r) => r.id === agent.locationId) ? agent.locationId : undefined);

  if (!targetRestaurantId) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'offering-not-found',
      message: `Offering "${offeringId}" not found in world state`,
      playerId,
      offeringId,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 3. Confirm restaurant exists
  const restaurant = state.restaurants.find((r) => r.id === targetRestaurantId);
  if (!restaurant) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${targetRestaurantId}" not found in world state`,
      playerId,
      offeringId,
      restaurantId: targetRestaurantId,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 4. Confirm player is inside that restaurant
  if (agent.locationId !== restaurant.id) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'not-inside-restaurant',
      message: `Player "${playerId}" is at location "${agent.locationId}", not inside restaurant "${restaurant.id}"`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 5. Confirm restaurant is open
  if (restaurant.operationalState !== 'open') {
    const code: PurchaseOfferingResultCode =
      restaurant.operationalState === 'closing-soon'
        ? 'restaurant-closing-soon'
        : 'restaurant-closed';
    const message =
      restaurant.operationalState === 'closing-soon'
        ? `Restaurant "${restaurant.id}" is closing soon and cannot accept purchases`
        : `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}")`;
    const result: PurchaseOfferingResult = {
      success: false,
      code,
      message,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 6. Confirm offering exists
  const offering = state.offerings.find((o) => o.id === offeringId);
  if (!offering) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'offering-not-found',
      message: `Offering "${offeringId}" not found in world state`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 7. Confirm offering belongs to the specified restaurant
  if (offering.restaurantId !== restaurant.id) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'offering-not-at-restaurant',
      message: `Offering "${offeringId}" belongs to restaurant "${offering.restaurantId}", not "${restaurant.id}"`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 8. Confirm currency compatibility
  if (agent.currency !== offering.currency || restaurant.currency !== offering.currency) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'currency-mismatch',
      message: `Currency mismatch: player="${agent.currency}", restaurant="${restaurant.currency}", offering="${offering.currency}"`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 9. Confirm player has sufficient funds
  if (agent.balanceMinor < offering.priceMinor) {
    const result: PurchaseOfferingResult = {
      success: false,
      code: 'insufficient-funds',
      message: `Insufficient funds: player has ${agent.balanceMinor} ${agent.currency}, required ${offering.priceMinor} ${offering.currency}`,
      playerId,
      offeringId,
      restaurantId: restaurant.id,
      amountMinor: offering.priceMinor,
      currency: offering.currency,
      playerBalanceAfter: agent.balanceMinor,
      restaurantBalanceAfter: restaurant.balanceMinor,
    };
    if (!options.silent) {
      console.log(`[purchase] failure player=${playerId} offering=${offeringId}: ${result.message} (${result.code})`);
    }
    return result;
  }

  // 10 & 11. Calculate new balances and commit both atomically
  agent.balanceMinor -= offering.priceMinor;
  restaurant.balanceMinor += offering.priceMinor;

  // 12. Record immutable historical fact of completed purchase (Milestone 13)
  const purchaseRecord: PurchaseRecord = {
    id: `purchase:${state.purchases.length + 1}`,
    worldTime: state.worldTime,
    playerId: agent.id,
    restaurantId: restaurant.id,
    offeringId: offering.id,
    amountMinor: offering.priceMinor,
    currency: offering.currency,
    consumedAt: null,
  };
  state.purchases.push(purchaseRecord);

  // 13. Instantiate authoritative OwnedItem for qualifying offerings (Milestone 33)
  let createdItemId: string | undefined;
  if (
    offering.id === 'offering:development-coffee' ||
    offering.id === 'offering:development-pastry'
  ) {
    const ownedItem: OwnedItem = {
      id: `item:${state.items.length + 1}`,
      type: 'item',
      offeringId: offering.id,
      name: offering.name, // Live acquisition snapshot
      ownerAgentId: agent.id,
      restaurantId: restaurant.id,
      sourcePurchaseId: purchaseRecord.id,
      acquiredAt: state.worldTime,
      status: 'available',
      consumedAt: null,
    };
    state.items.push(ownedItem);
    createdItemId = ownedItem.id;
  }

  const result: PurchaseOfferingResult = {
    success: true,
    code: 'success',
    message: `Player "${playerId}" successfully purchased offering "${offeringId}" for ${offering.priceMinor} ${offering.currency}`,
    playerId,
    offeringId,
    restaurantId: restaurant.id,
    amountMinor: offering.priceMinor,
    currency: offering.currency,
    playerBalanceAfter: agent.balanceMinor,
    restaurantBalanceAfter: restaurant.balanceMinor,
    itemId: createdItemId,
    purchaseId: purchaseRecord.id,
  };

  if (!options.silent) {
    console.log(
      `[purchase] player=${playerId} offering=${offeringId} amount=${offering.priceMinor} ${offering.currency} record=${purchaseRecord.id}${createdItemId ? ` item=${createdItemId}` : ''}`
    );
    console.log(
      `[purchase] success playerBalance=${agent.balanceMinor} restaurantBalance=${restaurant.balanceMinor}`
    );
  }

  return result;
}

export type StartConsumableActivityResultCode =
  | 'success'
  | 'agent-not-found'
  | 'agent-not-player'
  | 'restaurant-not-found'
  | 'not-inside-restaurant'
  | 'restaurant-closed'
  | 'activity-extends-past-closing'
  | 'purchase-required'
  | 'activity-already-active';

export interface StartConsumableActivityResult {
  success: boolean;
  code: StartConsumableActivityResultCode;
  message: string;
  playerId: string;
  restaurantId?: string;
  activity?: ConsumableActivityType;
  startedAt?: string;
  completedAt?: string | null;
  purchaseId?: string;
  itemId?: string;
}

export type StartHavingCoffeeResultCode = StartConsumableActivityResultCode;
export type StartHavingCoffeeResult = StartConsumableActivityResult;

export type StartEatingPastryResultCode = StartConsumableActivityResultCode;
export type StartEatingPastryResult = StartConsumableActivityResult;

export interface ConsumableActivityConfig {
  activity: ConsumableActivityType;
  offeringId: string;
  durationMs: number;
  name: string;
}

/**
 * Shared bounded consumable-activity execution kernel (Milestone 34).
 *
 * Implements authoritative validation, deterministic FIFO OwnedItem selection,
 * atomic consumption state transition, and PlayerActivityState creation for
 * concrete consumable activities (having-coffee, eating-pastry).
 */
export function executeConsumableActivity(
  state: WorldState,
  playerId: string,
  config: ConsumableActivityConfig,
  hasReceiptArg?: boolean,
  legacyReceipt?: unknown
): StartConsumableActivityResult {
  // 1. Resolve agent
  const agent = state.agents.find((a) => a.id === playerId);
  if (!agent) {
    return {
      success: false,
      code: 'agent-not-found',
      message: `Agent "${playerId}" not found in world state`,
      playerId,
    };
  }

  // 2. Confirm agent is a player
  if (agent.agentType !== 'player') {
    return {
      success: false,
      code: 'agent-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${agent.agentType}")`,
      playerId,
    };
  }

  // 3. Establish that player's location resolves to a valid Restaurant entity
  const isPlace = state.places.some((p) => p.id === agent.locationId);
  if (isPlace) {
    return {
      success: false,
      code: 'not-inside-restaurant',
      message: `Player "${playerId}" is at place "${agent.locationId}", not inside a restaurant`,
      playerId,
    };
  }

  const restaurant = state.restaurants.find((r) => r.id === agent.locationId);
  if (!restaurant) {
    return {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${agent.locationId}" not found in world state`,
      playerId,
      restaurantId: agent.locationId,
    };
  }

  // 4. Confirm restaurant is open or closing-soon
  if (restaurant.operationalState !== 'open' && restaurant.operationalState !== 'closing-soon') {
    return {
      success: false,
      code: 'restaurant-closed',
      message: `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}")`,
      playerId,
      restaurantId: restaurant.id,
    };
  }

  // 4b. Confirm activity duration does not extend past restaurant closing time
  const restaurantTimeZone = resolveLocationTimeZone(state, restaurant.id);
  const closingTimeMs = getRestaurantClosingTimeMs(restaurant.id, state.worldTime, restaurantTimeZone);
  const startTimeMs = Date.parse(state.worldTime);
  if (closingTimeMs !== null && startTimeMs + config.durationMs > closingTimeMs) {
    return {
      success: false,
      code: 'activity-extends-past-closing',
      message: `Activity "${config.activity}" would extend past restaurant closing time (${new Date(closingTimeMs).toISOString()})`,
      playerId,
      restaurantId: restaurant.id,
    };
  }

  // 5. Confirm restaurant offers the consumable offering
  const offering = state.offerings.find(
    (o) => o.id === config.offeringId && o.restaurantId === restaurant.id
  );
  if (!offering) {
    return {
      success: false,
      code: 'purchase-required',
      message: `Restaurant "${restaurant.id}" does not offer "${config.offeringId}"`,
      playerId,
      restaurantId: restaurant.id,
    };
  }

  // Legacy receipt check: if explicitly provided as an argument (legacy callers/tests)
  if (hasReceiptArg) {
    if (legacyReceipt === undefined || legacyReceipt === null || typeof legacyReceipt !== 'object') {
      return {
        success: false,
        code: 'purchase-required',
        message: `Purchase required: player "${playerId}" must provide a valid purchase receipt for ${config.name} at "${restaurant.id}"`,
        playerId,
        restaurantId: restaurant.id,
      };
    }
    const r = legacyReceipt as Record<string, unknown>;
    if (
      r.success === false ||
      r.code !== 'success' ||
      (typeof r.playerId === 'string' && r.playerId !== playerId) ||
      (typeof r.offeringId === 'string' && r.offeringId !== config.offeringId) ||
      (typeof r.restaurantId === 'string' && r.restaurantId !== restaurant.id)
    ) {
      return {
        success: false,
        code: 'purchase-required',
        message: `Purchase required: player "${playerId}" must provide a valid successful purchase receipt for ${config.name} at "${restaurant.id}"`,
        playerId,
        restaurantId: restaurant.id,
      };
    }
  }

  // 6. Confirm player does not already have an active uncompleted activity
  if (agent.playerActivity && agent.playerActivity.completedAt === null) {
    return {
      success: false,
      code: 'activity-already-active',
      message: `Player "${playerId}" is already performing activity "${agent.playerActivity.activity}"`,
      playerId,
      restaurantId: restaurant.id,
      activity: agent.playerActivity.activity,
      startedAt: agent.playerActivity.startedAt,
      completedAt: null,
    };
  }

  // 7. Authoritative possession lookup in state.items: find eligible available items
  const eligibleItems = (state.items ?? []).filter(
    (item) =>
      item.ownerAgentId === playerId &&
      item.offeringId === config.offeringId &&
      item.status === 'available' &&
      item.restaurantId === restaurant.id
  );

  if (eligibleItems.length === 0) {
    return {
      success: false,
      code: 'purchase-required',
      message: `Purchase required: player "${playerId}" does not possess an available ${config.name} purchased at restaurant "${restaurant.id}"`,
      playerId,
      restaurantId: restaurant.id,
    };
  }

  // Deterministic FIFO selection: sort by acquiredAt ascending, then numeric item id ascending
  eligibleItems.sort((a, b) => {
    const timeDiff = Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt);
    if (timeDiff !== 0) return timeDiff;
    const matchA = a.id.match(/^item:(\d+)$/);
    const matchB = b.id.match(/^item:(\d+)$/);
    const idA = matchA ? parseInt(matchA[1], 10) : 0;
    const idB = matchB ? parseInt(matchB[1], 10) : 0;
    return idA - idB;
  });
  const chosenItem = eligibleItems[0];

  // 8. Commit state transition atomically via authoritative item authority
  const startedAt = state.worldTime;
  const consumeResult = consumeOwnedItem(state, chosenItem.id, startedAt);
  if (!consumeResult.success) {
    throw new Error(`Failed to consume item: ${consumeResult.message}`);
  }
  agent.playerActivity = {
    activity: config.activity,
    startedAt,
    completedAt: null,
    durationMs: config.durationMs,
    restaurantId: restaurant.id,
    offeringId: config.offeringId,
    itemId: chosenItem.id,
  };

  console.log(
    `[activity] player=${playerId} activity=${config.activity} started=${startedAt} duration=${config.durationMs / 60000}m itemId=${chosenItem.id} purchaseId=${chosenItem.sourcePurchaseId}`
  );

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" started activity "${config.activity}" at ${startedAt}`,
    playerId,
    restaurantId: restaurant.id,
    activity: config.activity,
    startedAt,
    completedAt: null,
    purchaseId: chosenItem.sourcePurchaseId,
    itemId: chosenItem.id,
  };
}

/**
 * Authoritative interaction: A Player starts the "Having Coffee" activity.
 * Concrete public domain entrypoint delegating to executeConsumableActivity.
 */
export function startHavingCoffee(
  state: WorldState,
  playerId: string,
  _legacyReceipt?: unknown
): StartHavingCoffeeResult {
  return executeConsumableActivity(
    state,
    playerId,
    {
      activity: 'having-coffee',
      offeringId: 'offering:development-coffee',
      durationMs: HAVING_COFFEE_DURATION_MS,
      name: 'Coffee',
    },
    arguments.length >= 3,
    _legacyReceipt
  );
}

/**
 * Authoritative interaction: A Player starts the "Eating Pastry" activity (Milestone 34).
 * Concrete public domain entrypoint delegating to executeConsumableActivity.
 */
export function startEatingPastry(
  state: WorldState,
  playerId: string,
  _legacyReceipt?: unknown
): StartEatingPastryResult {
  return executeConsumableActivity(
    state,
    playerId,
    {
      activity: 'eating-pastry',
      offeringId: DEVELOPMENT_PASTRY_OFFERING_ID,
      durationMs: EATING_PASTRY_DURATION_MS,
      name: 'Pan Dulce',
    },
    arguments.length >= 3,
    _legacyReceipt
  );
}

export type StartAccompaniedActivityResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'companion-not-found'
  | 'cannot-consume-with-self'
  | 'not-inside-restaurant'
  | 'restaurant-closed'
  | 'activity-extends-past-closing'
  | 'agents-not-co-located'
  | 'agents-not-acquainted'
  | 'activity-already-active'
  | 'purchase-required'
  | 'companion-item-required';

export interface StartAccompaniedActivityResult {
  success: boolean;
  code: StartAccompaniedActivityResultCode;
  message: string;
  playerId: string;
  companionAgentId?: string;
  restaurantId?: string;
  activity?: ConsumableActivityType;
  startedAt?: string;
  completedAt?: string | null;
  playerItemId?: string;
  companionItemId?: string;
  purchaseId?: string;
}

/**
 * Authoritative interaction: A Player starts an accompanied consumable activity
 * (shared refreshment in co-located company with an acquainted Development NPC) (Milestone 51).
 *
 * Preconditions evaluated in deterministic order against candidate state:
 * 1. Player exists (code: 'player-not-found')
 * 2. Player is a player (code: 'player-not-player')
 * 3. Companion exists (code: 'companion-not-found')
 * 4. Companion is not self (code: 'cannot-consume-with-self')
 * 5. Player is inside the development restaurant (code: 'not-inside-restaurant')
 * 6. Restaurant is open (code: 'restaurant-closed')
 * 7. Companion is co-located inside the restaurant (code: 'agents-not-co-located')
 * 8. Player and companion are mutually acquainted (code: 'agents-not-acquainted')
 * 9. Player is not already performing an active activity (code: 'activity-already-active')
 * 10. Player possesses an available Coffee from this restaurant (code: 'purchase-required')
 * 11. Companion possesses an available Pan Dulce from this restaurant (code: 'companion-item-required')
 *
 * Atomic Execution:
 * - Deterministic FIFO selection of eligible items.
 * - Both items are consumed atomically through Item Authority (consumeOwnedItem).
 * - Player's playerActivity initialized with companionAgentId.
 * - NPC does NOT receive playerActivity, activity queue, or autonomous consumption state.
 */
export function startAccompaniedActivity(
  state: WorldState,
  playerId: string,
  companionAgentId: string
): StartAccompaniedActivityResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
      companionAgentId,
    };
  }

  // 2. Confirm agent is a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
      companionAgentId,
    };
  }

  // 3. Confirm companion exists
  const companion = state.agents.find((a) => a.id === companionAgentId);
  if (!companion) {
    return {
      success: false,
      code: 'companion-not-found',
      message: `Companion agent "${companionAgentId}" not found in world state`,
      playerId,
      companionAgentId,
    };
  }

  // 4. Reject self as companion
  if (playerId === companionAgentId) {
    return {
      success: false,
      code: 'cannot-consume-with-self',
      message: `Player "${playerId}" cannot start an accompanied activity with themselves`,
      playerId,
      companionAgentId,
    };
  }

  // 5. Establish that player's location resolves to the development restaurant
  const isPlace = state.places.some((p) => p.id === player.locationId);
  const restaurant = !isPlace ? state.restaurants.find((r) => r.id === player.locationId) : undefined;
  if (isPlace || !restaurant || restaurant.id !== 'restaurant:development-restaurant') {
    return {
      success: false,
      code: 'not-inside-restaurant',
      message: `Player "${playerId}" is at location "${player.locationId}", not inside the development restaurant`,
      playerId,
      companionAgentId,
      restaurantId: restaurant?.id,
    };
  }

  // 6. Confirm restaurant is open or closing-soon
  if (restaurant.operationalState !== 'open' && restaurant.operationalState !== 'closing-soon') {
    return {
      success: false,
      code: 'restaurant-closed',
      message: `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}")`,
      playerId,
      companionAgentId,
      restaurantId: restaurant.id,
    };
  }

  // 6b. Confirm activity duration does not extend past restaurant closing time
  const restaurantTimeZone = resolveLocationTimeZone(state, restaurant.id);
  const closingTimeMs = getRestaurantClosingTimeMs(restaurant.id, state.worldTime, restaurantTimeZone);
  const startTimeMs = Date.parse(state.worldTime);
  if (closingTimeMs !== null && startTimeMs + HAVING_COFFEE_DURATION_MS > closingTimeMs) {
    return {
      success: false,
      code: 'activity-extends-past-closing',
      message: `Activity "having-coffee" would extend past restaurant closing time (${new Date(closingTimeMs).toISOString()})`,
      playerId,
      companionAgentId,
      restaurantId: restaurant.id,
    };
  }

  // 7. Confirm companion is co-located with player inside the restaurant
  if (!areAgentsCoLocated(state, companionAgentId, playerId)) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Companion "${companionAgentId}" is at "${companion.locationId}", not co-located with player at "${player.locationId}"`,
      playerId,
      companionAgentId,
      restaurantId: restaurant.id,
    };
  }

  // 8. Confirm mutual acquaintance
  if (!isAgentAcquainted(state, playerId, companionAgentId)) {
    return {
      success: false,
      code: 'agents-not-acquainted',
      message: `Player "${playerId}" and companion "${companionAgentId}" are not acquainted`,
      playerId,
      companionAgentId,
      restaurantId: restaurant.id,
    };
  }

  // 9. Confirm player is not currently performing an active uncompleted activity
  if (player.playerActivity && player.playerActivity.completedAt === null) {
    return {
      success: false,
      code: 'activity-already-active',
      message: `Player "${playerId}" is already performing activity "${player.playerActivity.activity}"`,
      playerId,
      companionAgentId,
      restaurantId: restaurant.id,
      activity: player.playerActivity.activity,
      startedAt: player.playerActivity.startedAt,
      completedAt: null,
    };
  }

  // 10. Authoritative player Coffee lookup in state.items
  const eligiblePlayerItems = (state.items ?? []).filter(
    (item) =>
      item.ownerAgentId === playerId &&
      item.offeringId === 'offering:development-coffee' &&
      item.status === 'available' &&
      item.restaurantId === restaurant.id
  );
  if (eligiblePlayerItems.length === 0) {
    return {
      success: false,
      code: 'purchase-required',
      message: `Purchase required: player "${playerId}" does not possess an available Coffee purchased at restaurant "${restaurant.id}"`,
      playerId,
      companionAgentId,
      restaurantId: restaurant.id,
    };
  }

  // 11. Authoritative companion Pan Dulce lookup in state.items
  const eligibleCompanionItems = (state.items ?? []).filter(
    (item) =>
      item.ownerAgentId === companionAgentId &&
      item.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID &&
      item.status === 'available' &&
      item.restaurantId === restaurant.id
  );
  if (eligibleCompanionItems.length === 0) {
    return {
      success: false,
      code: 'companion-item-required',
      message: `Companion item required: companion "${companionAgentId}" does not possess an available Pan Dulce purchased at restaurant "${restaurant.id}"`,
      playerId,
      companionAgentId,
      restaurantId: restaurant.id,
    };
  }

  // Deterministic FIFO selection
  const sortItemsFifo = (items: OwnedItem[]) => {
    items.sort((a, b) => {
      const timeDiff = Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt);
      if (timeDiff !== 0) return timeDiff;
      const matchA = a.id.match(/^item:(\d+)$/);
      const matchB = b.id.match(/^item:(\d+)$/);
      const idA = matchA ? parseInt(matchA[1], 10) : 0;
      const idB = matchB ? parseInt(matchB[1], 10) : 0;
      return idA - idB;
    });
  };
  sortItemsFifo(eligiblePlayerItems);
  sortItemsFifo(eligibleCompanionItems);
  const playerItem = eligiblePlayerItems[0];
  const companionItem = eligibleCompanionItems[0];

  // Atomically consume both items via existing Item Authority
  const startedAt = state.worldTime;
  const playerConsumeResult = consumeOwnedItem(state, playerItem.id, startedAt);
  if (!playerConsumeResult.success) {
    throw new Error(`Failed to consume player item: ${playerConsumeResult.message}`);
  }
  const companionConsumeResult = consumeOwnedItem(state, companionItem.id, startedAt);
  if (!companionConsumeResult.success) {
    throw new Error(`Failed to consume companion item: ${companionConsumeResult.message}`);
  }

  // Initialize player-specific activity state with companion context
  player.playerActivity = {
    activity: 'having-coffee',
    startedAt,
    completedAt: null,
    durationMs: HAVING_COFFEE_DURATION_MS,
    restaurantId: restaurant.id,
    offeringId: 'offering:development-coffee',
    itemId: playerItem.id,
    companionAgentId: companion.id,
  };

  console.log(
    `[activity] player=${playerId} activity=having-coffee companion=${companion.id} started=${startedAt} duration=15m playerItemId=${playerItem.id} companionItemId=${companionItem.id}`
  );

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" started accompanied refreshment with "${companion.id}" at ${startedAt}`,
    playerId,
    companionAgentId: companion.id,
    restaurantId: restaurant.id,
    activity: 'having-coffee',
    startedAt,
    completedAt: null,
    playerItemId: playerItem.id,
    companionItemId: companionItem.id,
    purchaseId: playerItem.sourcePurchaseId,
  };
}

/**
 * Determines whether two agents have established mutual acquaintance (Milestone 25).
 *
 * Evaluation is strictly symmetric: isAgentAcquainted(state, A, B) === isAgentAcquainted(state, B, A).
 * Self-acquaintance is impossible and returns false.
 */
export function isAgentAcquainted(
  state: WorldState,
  agentIdA: string,
  agentIdB: string
): boolean {
  if (agentIdA === agentIdB) {
    return false;
  }
  const [first, second] = getCanonicalAgentPair(agentIdA, agentIdB);
  return state.acquaintances.some(
    (acq) => acq.agentIds[0] === first && acq.agentIds[1] === second
  );
}

export type GreetAgentResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'npc-not-found'
  | 'target-not-npc'
  | 'player-location-invalid'
  | 'npc-location-invalid'
  | 'agents-not-co-located';

export interface GreetAgentResult {
  success: boolean;
  code: GreetAgentResultCode;
  message: string;
  playerId: string;
  npcId: string;
  response?: string;
}

/**
 * Authoritative interaction: A Player greets an NPC (Milestone 11, extended in Milestone 18-A).
 *
 * Validates that both agents exist, have valid types, have valid spatial presence,
 * and occupy the same physical location.
 *
 * In Milestone 18-A, a successful greeting yields a deterministic contextual reaction (`response`)
 * from the NPC based strictly on the NPC's authoritative world state (locationId and activityState).
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is actually a player: player.agentType === 'player' (code: 'player-not-player')
 * 3. Target agent exists in WorldState.agents (code: 'npc-not-found')
 * 4. Target agent is actually an NPC: npc.agentType === 'npc' (code: 'target-not-npc')
 * 5. Player has a valid spatial location in WorldState (code: 'player-location-invalid')
 * 6. Target NPC has a valid spatial location in WorldState (code: 'npc-location-invalid')
 * 7. Player and NPC occupy the same spatial location: player.locationId === npc.locationId (code: 'agents-not-co-located')
 *
 * Invariants:
 * - Pure deterministic evaluation with ZERO state mutation on success or failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, activityState, balances, or playerActivity.
 * - Does NOT create relationship data, memory, history, reputation, events, or dialogue trees.
 * - Does NOT embed internal logging; returns deterministic GreetAgentResult.
 */
export function greetAgent(
  state: WorldState,
  playerId: string,
  npcId: string
): GreetAgentResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 2. Confirm agent is actually a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
      npcId,
    };
  }

  // 3. Confirm target NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Target NPC "${npcId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 4. Confirm target agent is actually an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'target-not-npc',
      message: `Target agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      playerId,
      npcId,
    };
  }

  // Helper to check whether a location resolves to an existing Place or Restaurant
  const isValidLocation = (locationId: string): boolean => {
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return false;
    }
    return (
      state.places.some((p) => p.id === locationId) ||
      state.restaurants.some((r) => r.id === locationId)
    );
  };

  // 5. Confirm player location is valid
  if (!isValidLocation(player.locationId)) {
    return {
      success: false,
      code: 'player-location-invalid',
      message: `Player "${playerId}" has invalid spatial location "${player.locationId}"`,
      playerId,
      npcId,
    };
  }

  // 6. Confirm NPC location is valid
  if (!isValidLocation(npc.locationId)) {
    return {
      success: false,
      code: 'npc-location-invalid',
      message: `NPC "${npcId}" has invalid spatial location "${npc.locationId}"`,
      playerId,
      npcId,
    };
  }

  // 7. Confirm player and NPC occupy the same spatial location
  if (!areAgentsCoLocated(state, playerId, npcId)) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Player "${playerId}" (at "${player.locationId}") and NPC "${npcId}" (at "${npc.locationId}") are not co-located`,
      playerId,
      npcId,
    };
  }

  // Deterministic NPC contextual reaction grounded in derived routine phase (Milestone 61 / 66)
  const response = resolveNpcGreetingResponse(state, npcId, playerId);

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" successfully greeted NPC "${npcId}" at "${player.locationId}"`,
    playerId,
    npcId,
    response,
  };
}

/**
 * Resolves the deterministic dialogue reaction response for an NPC greeting or responding to another agent.
 * Grounded strictly in the NPC's derived behavioral state, location, and acquaintance status (Milestone 18-A / 61 / 66).
 *
 * Invariant: Pure deterministic derivation, ZERO state mutation.
 */
export function resolveNpcGreetingResponse(
  state: WorldState,
  npcId: string,
  targetAgentId: string
): string {
  const npc = state.agents?.find((a) => a.id === npcId);
  if (!npc) {
    return 'Hello there.';
  }
  const isAcquainted = isAgentAcquainted(state, npcId, targetAgentId);
  const behavioral = deriveNpcBehavioralState(state, npcId);

  if (
    (behavioral?.routinePhase === 'working' && npc.locationId === behavioral.destinationId) ||
    (npc.locationId === 'restaurant:development-restaurant' && npc.activityState === 'active')
  ) {
    return isAcquainted
      ? "Welcome back. Good to see you again. I'm working here today."
      : "Welcome. I'm working here today.";
  } else if (
    (behavioral?.routinePhase === 'resting' && npc.locationId === behavioral.destinationId) ||
    (npc.locationId === 'building:development-residence' && npc.activityState === 'idle')
  ) {
    return isAcquainted
      ? "Hello again. Good to see you. I'm resting at home right now."
      : "Hello. I'm resting at home right now.";
  } else if (
    (behavioral?.routinePhase === 'commuting' && npc.locationId === 'street:development-street') ||
    (npc.locationId === 'street:development-street' && npc.activityState === 'idle')
  ) {
    return isAcquainted
      ? "Good morning again. On my way to the restaurant."
      : "Good morning. On my way to the restaurant.";
  } else if (
    (behavioral?.routinePhase === 'promenading' && npc.locationId === behavioral.destinationId) ||
    (npc.locationId === 'street:avenida-juarez' && npc.activityState === 'idle')
  ) {
    return isAcquainted
      ? "Good evening again. It's pleasant to walk down Avenida Juárez after work."
      : "Good evening. It's pleasant to walk down Avenida Juárez after work.";
  } else if (npc.locationId === 'building:development-building' && npc.activityState === 'idle') {
    return isAcquainted
      ? "Hello again. Good to see you around the building today."
      : "Hello. I'm around the building today.";
  } else {
    return isAcquainted
      ? "Hello again. Good to see you."
      : 'Hello there.';
  }
}

export type ExecuteNpcGreetingResultCode =
  | 'success'
  | 'npc-not-found'
  | 'actor-not-npc'
  | 'target-not-found'
  | 'self-interaction-not-allowed'
  | 'target-not-valid-agent'
  | 'actor-location-invalid'
  | 'target-location-invalid'
  | 'agents-not-co-located'
  | 'venue-not-operational';

export interface ExecuteNpcGreetingResult {
  readonly success: boolean;
  readonly code: ExecuteNpcGreetingResultCode;
  readonly message: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly response?: string;
}

/**
 * Authoritative social operation: An NPC initiates a greeting to another agent (Milestone 66).
 *
 * Enforces authoritative Social Authority preconditions:
 * 1. Actor exists and is an NPC (code: 'npc-not-found' / 'actor-not-npc')
 * 2. Target exists and is distinct from actor (code: 'target-not-found' / 'self-interaction-not-allowed')
 * 3. Target is a valid agent entity (code: 'target-not-valid-agent')
 * 4. Actor and target both occupy valid locations in places/restaurants (code: 'actor-location-invalid' / 'target-location-invalid')
 * 5. Actor and target are spatially co-located (code: 'agents-not-co-located')
 * 6. Business domain constraints: if at a restaurant, venue must not be closed (code: 'venue-not-operational')
 *
 * Invariants:
 * - Pure deterministic evaluation with ZERO state mutation.
 * - Does NOT alter locations, activityState, balances, relationships, or worldTime.
 * - Returns authoritative greeting dialogue response.
 */
export function executeNpcGreeting(
  state: WorldState,
  npcId: string,
  targetAgentId: string
): ExecuteNpcGreetingResult {
  if (!state || typeof state !== 'object') {
    throw new Error('WorldState must be provided');
  }

  // 1. Confirm actor exists
  const actor = state.agents?.find((a) => a.id === npcId);
  if (!actor) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Actor NPC "${npcId}" not found in world state`,
      actorId: npcId,
      targetId: targetAgentId,
    };
  }

  // 2. Confirm actor is actually an NPC
  if (actor.agentType !== 'npc') {
    return {
      success: false,
      code: 'actor-not-npc',
      message: `Actor "${npcId}" is not an NPC (agentType: "${actor.agentType}")`,
      actorId: npcId,
      targetId: targetAgentId,
    };
  }

  // 3. Confirm target exists
  const target = state.agents?.find((a) => a.id === targetAgentId);
  if (!target) {
    return {
      success: false,
      code: 'target-not-found',
      message: `Target agent "${targetAgentId}" not found in world state`,
      actorId: npcId,
      targetId: targetAgentId,
    };
  }

  // 4. Confirm actor and target are distinct
  if (npcId === targetAgentId) {
    return {
      success: false,
      code: 'self-interaction-not-allowed',
      message: `Agent "${npcId}" cannot greet itself`,
      actorId: npcId,
      targetId: targetAgentId,
    };
  }

  // 5. Confirm target is a valid agent type
  if (target.agentType !== 'player' && target.agentType !== 'npc') {
    return {
      success: false,
      code: 'target-not-valid-agent',
      message: `Target agent "${targetAgentId}" has invalid agentType "${target.agentType}"`,
      actorId: npcId,
      targetId: targetAgentId,
    };
  }

  // Helper to validate spatial location
  const isValidLocation = (locationId: string): boolean => {
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return false;
    }
    return (
      (state.places?.some((p) => p.id === locationId) ?? false) ||
      (state.restaurants?.some((r) => r.id === locationId) ?? false)
    );
  };

  // 6. Confirm actor location is valid
  if (!isValidLocation(actor.locationId)) {
    return {
      success: false,
      code: 'actor-location-invalid',
      message: `Actor NPC "${npcId}" has invalid spatial location "${actor.locationId}"`,
      actorId: npcId,
      targetId: targetAgentId,
    };
  }

  // 7. Confirm target location is valid
  if (!isValidLocation(target.locationId)) {
    return {
      success: false,
      code: 'target-location-invalid',
      message: `Target agent "${targetAgentId}" has invalid spatial location "${target.locationId}"`,
      actorId: npcId,
      targetId: targetAgentId,
    };
  }

  // 8. Confirm actor and target occupy the same spatial location
  if (!areAgentsCoLocated(state, npcId, targetAgentId)) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Actor NPC "${npcId}" (at "${actor.locationId}") and target "${targetAgentId}" (at "${target.locationId}") are not co-located`,
      actorId: npcId,
      targetId: targetAgentId,
    };
  }

  // 9. Business Authority domain constraint: closed restaurant precludes interaction
  const restaurant = state.restaurants?.find((r) => r.id === actor.locationId);
  if (restaurant && restaurant.operationalState === 'closed') {
    return {
      success: false,
      code: 'venue-not-operational',
      message: `Restaurant "${restaurant.id}" is closed (operationalState: "${restaurant.operationalState}"); social interaction unavailable`,
      actorId: npcId,
      targetId: targetAgentId,
    };
  }

  // 10. Generate deterministic greeting response
  const response = resolveNpcGreetingResponse(state, npcId, targetAgentId);

  return {
    success: true,
    code: 'success',
    message: `NPC "${npcId}" successfully greeted agent "${targetAgentId}" at "${actor.locationId}"`,
    actorId: npcId,
    targetId: targetAgentId,
    response,
  };
}

export type IntroduceToAgentResultCode =
  | 'success'
  | 'already-acquainted'
  | 'player-not-found'
  | 'player-not-player'
  | 'npc-not-found'
  | 'target-not-npc'
  | 'player-location-invalid'
  | 'npc-location-invalid'
  | 'agents-not-co-located';

export interface IntroduceToAgentResult {
  success: boolean;
  code: IntroduceToAgentResultCode;
  message: string;
  playerId?: string;
  npcId?: string;
  acquaintance?: Acquaintance;
  response?: string;
}

/**
 * Authoritative social interaction: A Player introduces themselves to an NPC (Milestone 25).
 *
 * Creates a persistent, symmetric, binary acquaintance fact in WorldState.acquaintances.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is actually a player: player.agentType === 'player' (code: 'player-not-player')
 * 3. Target agent exists in WorldState.agents (code: 'npc-not-found')
 * 4. Target agent is actually an NPC: npc.agentType === 'npc' (code: 'target-not-npc')
 * 5. Player has a valid spatial location in WorldState (code: 'player-location-invalid')
 * 6. Target NPC has a valid spatial location in WorldState (code: 'npc-location-invalid')
 * 7. Player and NPC occupy the same spatial location: player.locationId === npc.locationId (code: 'agents-not-co-located')
 *
 * Invariants:
 * - Idempotent: If already acquainted, returns success with code 'already-acquainted' and zero mutation.
 * - Pure deterministic mutation on success: pushes single canonical Acquaintance record.
 * - Zero mutation on failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, activityState, balances, or playerActivity.
 * - Does NOT create relationship meters, memory, history, reputation, events, or dialogue trees.
 */
export function introduceToAgent(
  state: WorldState,
  playerId: string,
  npcId: string
): IntroduceToAgentResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 2. Confirm agent is actually a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
      npcId,
    };
  }

  // 3. Confirm target NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Target NPC "${npcId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 4. Confirm target agent is actually an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'target-not-npc',
      message: `Target agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      playerId,
      npcId,
    };
  }

  // Helper to check whether a location resolves to an existing Place or Restaurant
  const isValidLocation = (locationId: string): boolean => {
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return false;
    }
    return (
      state.places.some((p) => p.id === locationId) ||
      state.restaurants.some((r) => r.id === locationId)
    );
  };

  // 5. Confirm player location is valid
  if (!isValidLocation(player.locationId)) {
    return {
      success: false,
      code: 'player-location-invalid',
      message: `Player "${playerId}" has invalid spatial location "${player.locationId}"`,
      playerId,
      npcId,
    };
  }

  // 6. Confirm NPC location is valid
  if (!isValidLocation(npc.locationId)) {
    return {
      success: false,
      code: 'npc-location-invalid',
      message: `NPC "${npcId}" has invalid spatial location "${npc.locationId}"`,
      playerId,
      npcId,
    };
  }

  // 7. Confirm player and NPC occupy the same spatial location
  if (!areAgentsCoLocated(state, playerId, npcId)) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Player "${playerId}" (at "${player.locationId}") and NPC "${npcId}" (at "${npc.locationId}") are not co-located`,
      playerId,
      npcId,
    };
  }

  // 8. Idempotency: Check if already acquainted
  const [first, second] = getCanonicalAgentPair(playerId, npcId);
  const existing = state.acquaintances.find(
    (a) => a.agentIds[0] === first && a.agentIds[1] === second
  );
  if (existing) {
    return {
      success: true,
      code: 'already-acquainted',
      message: `Player "${playerId}" and NPC "${npcId}" are already acquainted`,
      playerId,
      npcId,
      acquaintance: existing,
    };
  }

  // 9. Create canonical Acquaintance record
  const acquaintance: Acquaintance = {
    id: getAcquaintanceId(playerId, npcId),
    agentIds: [first, second],
    establishedAt: state.worldTime,
  };

  state.acquaintances.push(acquaintance);

  const response =
    npc.locationId === 'restaurant:development-restaurant' && npc.activityState === 'active'
      ? `Pleased to meet you! I'm ${npc.name}, working here at Development Restaurant.`
      : `Pleased to meet you! I'm ${npc.name}.`;

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" and NPC "${npcId}" introduced successfully`,
    playerId,
    npcId,
    acquaintance,
    response,
  };
}

export type InquireAgentScheduleResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'npc-not-found'
  | 'target-not-npc'
  | 'agents-not-co-located'
  | 'not-acquainted'
  | 'no-scheduled-work';

export interface InquireAgentScheduleResult {
  success: boolean;
  code: InquireAgentScheduleResultCode;
  message: string;
  playerId: string;
  npcId: string;
  schedule?: {
    workplaceId: string;
    shiftStart: string;
    shiftEnd: string;
  };
  knowledgeRecord?: AgentKnowledgeRecord;
}

/**
 * Authoritative social interaction: A Player inquires about an acquainted NPC's work schedule (Milestone 26, Milestone 35).
 *
 * Provides minimal relational inquiry & epistemic grounding.
 * On success, performs an atomic single-record upsert into state.knowledge.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is actually a player: player.agentType === 'player' (code: 'player-not-player')
 * 3. Target agent exists in WorldState.agents (code: 'npc-not-found')
 * 4. Target agent is actually an NPC: npc.agentType === 'npc' (code: 'target-not-npc')
 * 5. Player and NPC occupy the same valid physical location:
 *    isValidLocation(player.locationId) && isValidLocation(npc.locationId) && player.locationId === npc.locationId
 *    (code: 'agents-not-co-located')
 * 6. Player and NPC have established mutual acquaintance (code: 'not-acquainted')
 * 7. Target NPC has a currently defined scheduled workplace in the world model (code: 'no-scheduled-work')
 *
 * Invariants:
 * - Deterministic evaluation. On failure, causes ZERO state mutation.
 * - On success, causes state mutation ONLY via single-record upsert in state.knowledge.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, activityState, balances, or playerActivity.
 * - Does NOT return offeringId, pricing, menu, inventory, or future product predictions.
 * - Discloses strictly the factual workplaceId, shiftStart, shiftEnd, and retained knowledgeRecord.
 */
export function inquireAgentSchedule(
  state: WorldState,
  playerId: string,
  npcId: string
): InquireAgentScheduleResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 2. Confirm agent is actually a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
      npcId,
    };
  }

  // 3. Confirm target NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Target NPC "${npcId}" not found in world state`,
      playerId,
      npcId,
    };
  }

  // 4. Confirm target agent is actually an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'target-not-npc',
      message: `Target agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      playerId,
      npcId,
    };
  }

  // Helper to check whether a location resolves to an existing Place or Restaurant
  const isValidLocation = (locationId: string): boolean => {
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return false;
    }
    return (
      state.places.some((p) => p.id === locationId) ||
      state.restaurants.some((r) => r.id === locationId)
    );
  };

  // 5. Confirm player and NPC occupy the same valid physical location
  if (
    !isValidLocation(player.locationId) ||
    !isValidLocation(npc.locationId) ||
    !areAgentsCoLocated(state, playerId, npcId)
  ) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Player "${playerId}" (at "${player.locationId}") and NPC "${npcId}" (at "${npc.locationId}") are not co-located at a valid physical location`,
      playerId,
      npcId,
    };
  }

  // 6. Confirm agents are acquainted
  const isAcquainted = isAgentAcquainted(state, playerId, npcId);
  if (!isAcquainted) {
    return {
      success: false,
      code: 'not-acquainted',
      message: `Player "${playerId}" and NPC "${npcId}" are not acquainted`,
      playerId,
      npcId,
    };
  }

  // 7. Confirm NPC has a defined scheduled workplace in the world model
  if (npc.id === DEVELOPMENT_NPC_WORK_SCHEDULE.npcId) {
    const workplaceExists = state.restaurants.some(
      (r) => r.id === DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId
    );
    if (workplaceExists) {
      const shiftStart = formatHourUtc(DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHourUtc);
      const shiftEnd = formatHourUtc(DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHourUtc);

      // M35 Knowledge Acquisition & Epistemic Retention
      const existingRecordIndex = state.knowledge.findIndex(
        (k) => k.agentId === playerId && k.factType === 'agent-schedule' && k.subjectId === npcId
      );

      let knowledgeRecord: AgentKnowledgeRecord;

      if (existingRecordIndex >= 0) {
        const existing = state.knowledge[existingRecordIndex];
        knowledgeRecord = {
          ...existing,
          payload: {
            workplaceId: DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId,
            shiftStart,
            shiftEnd,
          },
          lastVerifiedAt: state.worldTime,
          source: 'social-inquiry',
          sourceAgentId: npcId,
        };
        state.knowledge[existingRecordIndex] = knowledgeRecord;
      } else {
        let nextIdNum = state.knowledge.length + 1;
        while (state.knowledge.some((k) => k.id === `knowledge:${nextIdNum}`)) {
          nextIdNum++;
        }
        knowledgeRecord = {
          id: `knowledge:${nextIdNum}`,
          agentId: playerId,
          factType: 'agent-schedule',
          subjectId: npcId,
          payload: {
            workplaceId: DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId,
            shiftStart,
            shiftEnd,
          },
          acquiredAt: state.worldTime,
          lastVerifiedAt: state.worldTime,
          source: 'social-inquiry',
          sourceAgentId: npcId,
        };
        state.knowledge.push(knowledgeRecord);
      }

      return {
        success: true,
        code: 'success',
        message: `I work at the development restaurant from ${shiftStart} to ${shiftEnd}.`,
        playerId,
        npcId,
        schedule: {
          workplaceId: DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId,
          shiftStart,
          shiftEnd,
        },
        knowledgeRecord,
      };
    }
  }

  // Fallback for NPCs with no scheduled workplace
  return {
    success: false,
    code: 'no-scheduled-work',
    message: `NPC "${npcId}" has no scheduled workplace`,
    playerId,
    npcId,
  };
}

export type IssueNpcScheduleDisclosureResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'npc-not-found'
  | 'target-not-npc'
  | 'npc-not-active'
  | 'agents-not-co-located'
  | 'not-acquainted'
  | 'already-known'
  | 'no-scheduled-work';

export interface IssueNpcScheduleDisclosureResult {
  success: boolean;
  code: IssueNpcScheduleDisclosureResultCode;
  message: string;
  npcId: string;
  playerId: string;
  schedule?: {
    workplaceId: string;
    shiftStart: string;
    shiftEnd: string;
  };
  knowledgeRecord?: AgentKnowledgeRecord;
}

/**
 * NPC-initiative world action: The World Core, on behalf of an active NPC,
 * discloses the NPC's schedule to a co-located acquainted player (Milestone 46).
 *
 * EXPERIMENTAL BOUNDED RULE — not a general NPC social model, goal, or personality system.
 *
 * Preconditions (evaluated in deterministic order and independently validated by authority):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is actually a player: player.agentType === 'player' (code: 'player-not-player')
 * 3. NPC exists in WorldState.agents (code: 'npc-not-found')
 * 4. NPC is actually an NPC: npc.agentType === 'npc' (code: 'target-not-npc')
 * 5. NPC is currently active: npc.activityState === 'active' (code: 'npc-not-active')
 * 6. Player and NPC occupy the same valid physical location:
 *    isValidLocation(player.locationId) && isValidLocation(npc.locationId) && player.locationId === npc.locationId
 *    (code: 'agents-not-co-located')
 * 7. Player and NPC have established mutual acquaintance (code: 'not-acquainted')
 * 8. Player does not already know the schedule: no record in state.knowledge matching
 *    (agentId=playerId, factType='agent-schedule', subjectId=npcId) (code: 'already-known')
 * 9. NPC has a defined scheduled workplace in DEVELOPMENT_NPC_WORK_SCHEDULE (code: 'no-scheduled-work')
 *
 * State transition:
 * Mutates the candidate WorldState by appending exactly one AgentKnowledgeRecord to state.knowledge with source: 'npc-initiative'.
 * Failure atomicity: strictly ZERO mutation on any precondition failure.
 * Note: The domain function mutates the passed candidate state directly in memory; the simulation/session commit
 * publishes the candidate state only after persistence succeeds.
 */
export function issueNpcScheduleDisclosure(
  state: WorldState,
  npcId: string,
  playerId: string
): IssueNpcScheduleDisclosureResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      npcId,
      playerId,
    };
  }

  // 2. Confirm agent is actually a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      npcId,
      playerId,
    };
  }

  // 3. Confirm target NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Target NPC "${npcId}" not found in world state`,
      npcId,
      playerId,
    };
  }

  // 4. Confirm target agent is actually an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'target-not-npc',
      message: `Target agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      npcId,
      playerId,
    };
  }

  // 5. Confirm NPC is active
  if (npc.activityState !== 'active') {
    return {
      success: false,
      code: 'npc-not-active',
      message: `NPC "${npcId}" is not active (activityState: "${npc.activityState}")`,
      npcId,
      playerId,
    };
  }

  // Helper to check whether a location resolves to an existing Place or Restaurant
  const isValidLocation = (locationId: string): boolean => {
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return false;
    }
    return (
      state.places.some((p) => p.id === locationId) ||
      state.restaurants.some((r) => r.id === locationId)
    );
  };

  // 6. Confirm player and NPC occupy the same valid physical location
  if (
    !isValidLocation(player.locationId) ||
    !isValidLocation(npc.locationId) ||
    !areAgentsCoLocated(state, playerId, npcId)
  ) {
    return {
      success: false,
      code: 'agents-not-co-located',
      message: `Player "${playerId}" (at "${player.locationId}") and NPC "${npcId}" (at "${npc.locationId}") are not co-located at a valid physical location`,
      npcId,
      playerId,
    };
  }

  // 7. Confirm agents are acquainted
  const isAcquainted = isAgentAcquainted(state, playerId, npcId);
  if (!isAcquainted) {
    return {
      success: false,
      code: 'not-acquainted',
      message: `Player "${playerId}" and NPC "${npcId}" are not acquainted`,
      npcId,
      playerId,
    };
  }

  // 8. Confirm schedule fact is not already known by player
  const existingRecord = state.knowledge.find(
    (k) => k.agentId === playerId && k.factType === 'agent-schedule' && k.subjectId === npcId
  );
  if (existingRecord) {
    return {
      success: false,
      code: 'already-known',
      message: `Player "${playerId}" already possesses schedule knowledge for NPC "${npcId}"`,
      npcId,
      playerId,
    };
  }

  // 9. Confirm NPC has a defined scheduled workplace in the world model
  if (npc.id === DEVELOPMENT_NPC_WORK_SCHEDULE.npcId) {
    const workplaceExists = state.restaurants.some(
      (r) => r.id === DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId
    );
    if (workplaceExists) {
      const shiftStart = formatHourUtc(DEVELOPMENT_NPC_WORK_SCHEDULE.shiftStartHourUtc);
      const shiftEnd = formatHourUtc(DEVELOPMENT_NPC_WORK_SCHEDULE.shiftEndHourUtc);

      let nextIdNum = state.knowledge.length + 1;
      while (state.knowledge.some((k) => k.id === `knowledge:${nextIdNum}`)) {
        nextIdNum++;
      }
      const knowledgeRecord: AgentKnowledgeRecord = {
        id: `knowledge:${nextIdNum}`,
        agentId: playerId,
        factType: 'agent-schedule',
        subjectId: npcId,
        payload: {
          workplaceId: DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId,
          shiftStart,
          shiftEnd,
        },
        acquiredAt: state.worldTime,
        lastVerifiedAt: state.worldTime,
        source: 'npc-initiative',
        sourceAgentId: npcId,
      };
      state.knowledge.push(knowledgeRecord);

      return {
        success: true,
        code: 'success',
        message: `NPC "${npcId}" proactively disclosed their schedule to player "${playerId}"`,
        npcId,
        playerId,
        schedule: {
          workplaceId: DEVELOPMENT_NPC_WORK_SCHEDULE.workplaceId,
          shiftStart,
          shiftEnd,
        },
        knowledgeRecord,
      };
    }
  }

  // Fallback for NPCs with no scheduled workplace
  return {
    success: false,
    code: 'no-scheduled-work',
    message: `NPC "${npcId}" has no scheduled workplace`,
    npcId,
    playerId,
  };
}

export type InspectCurrentLocationResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player'
  | 'player-location-invalid';

/**
 * Observable projection of an Agent co-located with the player (Milestone 12).
 *
 * NOTE: Exposes ONLY intentionally observable attributes (id, name, agentType).
 * Does NOT expose internal state such as activityState, activitySince, balanceMinor,
 * currency, or playerActivity.
 */
export interface ObservableAgent {
  id: string;
  name: string;
  agentType: AgentType;
  isAcquainted?: boolean;
  possessions?: string[];
}

/**
 * Observable projection of a commercial offering available at an inspected Restaurant (Milestone 12).
 *
 * NOTE: Exposes only intentional observable commercial fields (id, name, priceMinor, currency).
 * Does NOT return the raw domain Offering entity and does NOT include restaurantId.
 */
export interface ObservableOffering {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
}

/**
 * Concise projection of a neighboring or child place for spatial affordance perception (Milestone 21-A).
 */
export interface ObservablePlaceSummary {
  id: string;
  name: string;
  type: PlaceType | 'restaurant';
  isResidential?: boolean;
}

export const DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID = 'opportunity:development-pan-dulce';

/**
 * Concrete read-only projection of a situational world opportunity (Milestone 23).
 *
 * Derived ephemerally from authoritative WorldState during local perception.
 * Does NOT represent persistent entity state, quest state, or player tracking.
 */
export interface ObservableOpportunity {
  id: string;
  name: string;
  description: string;
  offeringId: string;
  restaurantId?: string;
}

/**
 * Evaluates active situational opportunities for a restaurant (Milestone 23, extended M27).
 *
 * Scoped strictly to authoritative world conditions:
 * - Restaurant is open
 * - Dev NPC is at the restaurant
 * - Dev NPC is active
 * - Pan Dulce offering exists in state.offerings
 *
 * Invariant: Pure deterministic derivation, zero state mutation.
 */
function evaluateRestaurantOpportunity(
  state: WorldState,
  restaurant: Restaurant
): ObservableOpportunity | null {
  if (restaurant.id === 'restaurant:development-restaurant') {
    const devNpc = state.agents.find((a) => a.id === 'agent:dev-npc');
    const hasPastry = state.offerings.some((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);

    if (
      (restaurant.operationalState === 'open' || restaurant.operationalState === 'closing-soon') &&
      devNpc !== undefined &&
      devNpc.locationId === restaurant.id &&
      devNpc.activityState === 'active' &&
      hasPastry
    ) {
      return {
        id: DEVELOPMENT_PAN_DULCE_OPPORTUNITY_ID,
        name: 'Pan Dulce Available',
        description: 'Pan Dulce is available while the restaurant is open and the NPC is working.',
        offeringId: DEVELOPMENT_PASTRY_OFFERING_ID,
        restaurantId: restaurant.id,
      };
    }
  }
  return null;
}

/**
 * Authoritative attendant summary for an observed establishment/place (Milestone 90).
 */
export interface ObservableAttendantSummary {
  readonly id: string;
  readonly name: string;
  readonly establishmentId: string;
  readonly role: 'attendant';
  readonly isPresent: boolean;
  readonly locationId: string;
  readonly interiorSpaceId: string | null;
  readonly activityState: ActivityState;
  readonly interactionState?: AttendantInteractionState;
  readonly lastInteractionTime?: string;
}

/**
 * Observed world location representation for the player's current spatial presence (Milestone 12, extended M21-A, M23, M90).
 */
export interface ObservedLocation {
  id: string;
  type: PlaceType | 'restaurant';
  name: string;
  parentId?: string | null;                      // Geographic parent for Places (null for City)
  buildingId?: string;                           // Containing Building ID for Restaurants
  operationalState?: RestaurantOperationalState; // Only present for Restaurants
  offerings?: ObservableOffering[];              // Projected offerings (only present for Restaurants)
  agents: ObservableAgent[];                     // Projected co-located agents occupying this exact locationId
  accessibleBuildings?: ObservablePlaceSummary[];  // Direct child buildings (present at Street)
  neighboringStreets?: ObservablePlaceSummary[];   // Sibling streets in same neighborhood (present at Street)
  parentStreet?: ObservablePlaceSummary;           // Containing street (present at Building)
  containedRestaurants?: ObservablePlaceSummary[]; // Contained restaurants (present at Building)
  parentBuilding?: ObservablePlaceSummary;         // Containing building (present at Restaurant)
  opportunities?: ObservableOpportunity[];        // Projected situational opportunities (present at Restaurant)
  actionConsiderations?: ActionConsideration[];   // Derived agent-specific action considerations (Milestone 48)
  temporalContext?: PlayerTemporalContext;        // Authoritative geographic temporal context
  attendant?: ObservableAttendantSummary;         // Authoritative attendant projection (Milestone 90)
}

export interface InspectCurrentLocationResult {
  success: boolean;
  code: InspectCurrentLocationResultCode;
  message: string;
  playerId: string;
  locationId?: string;
  location?: ObservedLocation;
  playerInventory?: ObservableOwnedItem[];
  playerActivity?: PlayerActivityState | null;
  actionConsiderations?: ActionConsideration[];
  pendingOrders?: ObservablePendingOrder[];
  temporalContext?: PlayerTemporalContext;
}


/**
 * Gathers and projects all agents that share the observer's authoritative location (Milestone 60).
 *
 * Used by inspectCurrentLocation() to determine which agents participate in the
 * observer's local spatial projection.
 *
 * Guarantees:
 * - Pure evaluation with ZERO state mutation.
 * - Projects only intentionally public attributes into ObservableAgent.
 * - Withholds private internal state (balanceMinor, activityState, activitySince, playerActivity).
 */
export function getCoLocatedAgents(
  state: WorldState,
  observerAgentId: string
): ObservableAgent[] {
  const observer = state.agents.find((a) => a.id === observerAgentId);
  if (!observer || !observer.locationId) {
    return [];
  }

  return state.agents
    .filter((a) => areAgentsCoLocated(state, observerAgentId, a.id))
    .map((a) => {
      const obs: ObservableAgent = {
        id: a.id,
        name: a.name,
        agentType: a.agentType,
      };
      if (a.id !== observerAgentId) {
        obs.isAcquainted = isAgentAcquainted(state, observerAgentId, a.id);
      }
      if (Array.isArray(state.items)) {
        const agentPossessions = state.items
          .filter((i) => i.ownerAgentId === a.id && i.status === 'available')
          .map((i) => i.name);
        if (agentPossessions.length > 0) {
          obs.possessions = agentPossessions;
        }
      }
      return obs;
    });
}

/**
 * Authoritative perception: A Player inspects their current world location (Milestone 12).
 *
 * Transforms currently authoritative WorldState data at the player's spatial location
 * into a deterministic, read-only observation result.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Player is actually a player: player.agentType === 'player' (code: 'player-not-player')
 * 3. Player's locationId resolves to an existing Place or Restaurant in WorldState (code: 'player-location-invalid')
 *
 * Observation projection:
 * - Scoped strictly to player's current locationId (the perception boundary).
 * - For Places: exposes id, type, name, and geographic parentId.
 * - For Restaurants: exposes id, type ('restaurant'), name, containing buildingId,
 *   authoritative operationalState, and projected offerings (ObservableOffering).
 * - For Agents: exposes co-located agents mapped to ObservableAgent (id, name, agentType).
 *
 * Invariants:
 * - Pure deterministic evaluation with ZERO state mutation on success or failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, balances, activities, offerings, or geography.
 * - Does NOT create observation history, memory, relationships, reputation, or events.
 * - Does NOT embed internal logging; returns deterministic InspectCurrentLocationResult.
 */
export function inspectCurrentLocation(
  state: WorldState,
  playerId: string
): InspectCurrentLocationResult {
  // 1. Confirm player exists
  const player = state.agents.find((a) => a.id === playerId);
  if (!player) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
    };
  }

  // 2. Confirm agent is actually a player
  if (player.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${player.agentType}")`,
      playerId,
    };
  }

  // 3. Resolve location: check places first, then restaurants
  const place = state.places.find((p) => p.id === player.locationId);
  const restaurant = !place ? state.restaurants.find((r) => r.id === player.locationId) : undefined;

  if (!place && !restaurant) {
    return {
      success: false,
      code: 'player-location-invalid',
      message: `Player "${playerId}" has invalid or non-existent spatial location "${player.locationId}"`,
      playerId,
      locationId: player.locationId,
    };
  }

  // 4. Gather observable agents occupying this exact locationId (Milestone 60)
  const coLocatedAgents: ObservableAgent[] = getCoLocatedAgents(state, player.id);

  // 5. Construct ObservedLocation
  let observedLocation: ObservedLocation;

  if (place) {
    observedLocation = {
      id: place.id,
      type: place.type,
      name: place.name,
      parentId: place.parentId,
      agents: coLocatedAgents,
    };

    if (place.type === 'street') {
      // Direct child buildings of current street
      observedLocation.accessibleBuildings = state.places
        .filter((p) => p.type === 'building' && p.parentId === place.id)
        .map((p) => {
          const isResidential = isResidentialBuilding(state, p.id);
          return {
            id: p.id,
            name: p.name,
            type: p.type,
            ...(isResidential ? { isResidential: true } : {}),
          };
        });

      // Sibling streets in the same Neighborhood (only if parentId is not null)
      if (place.parentId !== null) {
        observedLocation.neighboringStreets = state.places
          .filter((p) => p.type === 'street' && p.parentId === place.parentId && p.id !== place.id)
          .map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
          }));
      }
    } else if (place.type === 'building') {
      // Containing Street referenced by currentBuilding.parentId (if valid)
      if (place.parentId !== null) {
        const parentStreet = state.places.find((p) => p.id === place.parentId && p.type === 'street');
        if (parentStreet) {
          observedLocation.parentStreet = {
            id: parentStreet.id,
            name: parentStreet.name,
            type: parentStreet.type,
          };
        }
      }

      // Contained restaurants whose buildingId === currentBuilding.id
      const containedRestaurants = state.restaurants.filter((r) => r.buildingId === place.id);
      observedLocation.containedRestaurants = containedRestaurants.map((r) => ({
        id: r.id,
        name: r.name,
        type: 'restaurant',
      }));

      // Milestone 27: Public storefront opportunities exposed by directly contained restaurants
      if (containedRestaurants.length > 0) {
        const buildingOpportunities: ObservableOpportunity[] = [];
        for (const r of containedRestaurants) {
          const opp = evaluateRestaurantOpportunity(state, r);
          if (opp && !buildingOpportunities.some((o) => o.id === opp.id)) {
            buildingOpportunities.push(opp);
          }
        }
        observedLocation.opportunities = buildingOpportunities;
      }

      // Milestone 48: Derived agent-specific action consideration for entering contained restaurant
      const restaurantConsideration = evaluateScheduleInformedRestaurantConsideration(state, playerId);
      if (restaurantConsideration.considered) {
        observedLocation.actionConsiderations = [restaurantConsideration];
      }
    }
  } else {
    const rawOfferings = getRestaurantOfferings(state, restaurant!.id);
    const observableOfferings: ObservableOffering[] = rawOfferings.map((o) => ({
      id: o.id,
      name: o.name,
      priceMinor: o.priceMinor,
      currency: o.currency,
    }));

    // Milestone 23: Concrete derived situational opportunity (extended M27 with restaurantId)
    const opp = evaluateRestaurantOpportunity(state, restaurant!);
    const opportunities: ObservableOpportunity[] = opp ? [opp] : [];

    observedLocation = {
      id: restaurant!.id,
      type: 'restaurant',
      name: restaurant!.name,
      buildingId: restaurant!.buildingId,
      operationalState: restaurant!.operationalState,
      offerings: observableOfferings,
      agents: coLocatedAgents,
      opportunities,
    };

    // Milestone 49: Derived agent-specific action consideration for purchasing Pan Dulce
    const commercialConsideration = evaluateOpportunityInformedCommercialConsideration(
      state,
      playerId,
      restaurant!.id
    );
    // Milestone 51: Derived agent-specific action consideration for accompanied refreshment
    const accompaniedConsideration = evaluateAccompaniedConsumableConsideration(
      state,
      playerId,
      DEVELOPMENT_NPC_WORK_SCHEDULE.npcId,
      restaurant!.id
    );
    // Milestone 52: Derived agent-specific action consideration for restaurant closing soon
    const closingSoonConsideration = evaluateRestaurantClosingSoonConsideration(
      state,
      playerId,
      restaurant!.id
    );
    const considerations: ActionConsideration[] = [];
    if (commercialConsideration.considered) {
      considerations.push(commercialConsideration);
    }
    if (accompaniedConsideration.considered) {
      considerations.push(accompaniedConsideration);
    }
    if (closingSoonConsideration.considered) {
      considerations.push(closingSoonConsideration);
    }
    if (considerations.length > 0) {
      observedLocation.actionConsiderations = considerations;
    }

    // Containing Building identified by restaurant.buildingId (if valid)
    if (restaurant!.buildingId) {
      const parentBuilding = state.places.find(
        (p) => p.id === restaurant!.buildingId && p.type === 'building'
      );
      if (parentBuilding) {
        observedLocation.parentBuilding = {
          id: parentBuilding.id,
          name: parentBuilding.name,
          type: parentBuilding.type,
        };
      }
    }
  }

  // Milestone 90: Authoritative Attendant Projection for the Observed Location
  if (state.siteAgentAssociations) {
    const attendantAssoc = getSiteAttendant(state, observedLocation.id);
    if (attendantAssoc) {
      const attendantAgent = state.agents.find((a) => a.id === attendantAssoc.agentId);
      if (attendantAgent) {
        const isPresent = areAgentsCoLocated(state, playerId, attendantAgent.id);
        const activeService = getActiveRestaurantService(playerId, observedLocation.id);
        const interactionState: AttendantInteractionState =
          isPresent && activeService && activeService.attendantId === attendantAgent.id
            ? 'service-accepted'
            : 'idle';
        observedLocation.attendant = {
          id: attendantAgent.id,
          name: attendantAgent.name,
          establishmentId: attendantAssoc.placeId,
          role: 'attendant',
          isPresent,
          locationId: attendantAgent.locationId,
          interiorSpaceId: attendantAgent.interiorSpaceId ?? null,
          activityState: attendantAgent.activityState,
          interactionState,
          ...(activeService && activeService.attendantId === attendantAgent.id
            ? { lastInteractionTime: activeService.worldTime }
            : {}),
        };
      }
    }
  }

  // 6. Gather player's private available inventory (Milestone 33)
  const playerInventory: ObservableOwnedItem[] = state.items
    ? state.items
        .filter((i) => i.ownerAgentId === playerId && i.status === 'available')
        .map((i) => ({
          id: i.id,
          offeringId: i.offeringId,
          name: i.name,
          restaurantId: i.restaurantId,
          acquiredAt: i.acquiredAt,
        }))
    : [];

  // 7. Gather player's pending unfulfilled orders (Milestone 52.1)
  const customerOrders = state.orders ? getCustomerOrders(state, playerId) : [];
  const pendingOrders: ObservablePendingOrder[] = customerOrders
    .filter((o): o is Order & { status: 'preparing' | 'ready' } => o.status === 'preparing' || o.status === 'ready')
    .sort((a, b) => {
      const timeDiff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    })
    .map((o) => ({
      id: o.id,
      restaurantId: o.restaurantId,
      status: o.status,
      totalAmountMinor: o.totalAmountMinor,
      currency: o.currency,
      readyAt: o.readyAt,
      createdAt: o.createdAt,
    }));

  // 8. Resolve authoritative player-facing temporal context (if valid geography exists)
  let temporalContext: PlayerTemporalContext | undefined = undefined;
  try {
    temporalContext = resolvePlayerTemporalContext(state, playerId);
    observedLocation.temporalContext = temporalContext;
  } catch {
    // If geographic containment hierarchy is incomplete or severed (e.g. test fixtures testing missing parents),
    // temporalContext is omitted. No silent fallback to UTC or guessed timezone is ever produced.
  }

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" successfully inspected current location "${player.locationId}"`,
    playerId,
    locationId: player.locationId,
    location: observedLocation,
    playerInventory,
    playerActivity: player.playerActivity ? { ...player.playerActivity } : null,
    actionConsiderations: observedLocation.actionConsiderations,
    pendingOrders,
    temporalContext,
  };
}

export type InspectPlayerHistoryResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player';

/**
 * Observable historical projection of a player's past actions (Milestone 17-A).
 *
 * Exposes the player's completed purchases and completed Having Coffee activities
 * as safe projections isolated from internal WorldState arrays.
 */
export interface ObservablePlayerHistory {
  playerId: string;
  purchases: PurchaseRecord[];
  activityCompletions: ActivityCompletionRecord[];
  coffeeCompletions?: CoffeeCompletionRecord[];
}

export interface InspectPlayerHistoryResult {
  success: boolean;
  code: InspectPlayerHistoryResultCode;
  message: string;
  playerId: string;
  history?: ObservablePlayerHistory;
}

/**
 * Authoritative perception: A Player inspects their own persistent historical records (Milestone 17-A).
 *
 * Exposes a safe, read-only projection of the player's completed purchases and completed
 * consumable activities recorded in WorldState.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'player-not-player')
 *
 * Projection & Isolation:
 * - Returns only records where record.playerId === playerId.
 * - Produces fresh shallow copies of record objects in a new array, ensuring callers
 *   cannot mutate the authoritative WorldState historical collections.
 * - Preserves exact recorded historical values and deterministic append order.
 * - Does not recalculate, rewrite, or validate against current state.
 *
 * Invariants:
 * - Pure deterministic evaluation with ZERO state mutation on success or failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, balances, activities, or operational states.
 * - Does NOT create or append historical records.
 * - Does NOT participate in world simulation.
 */
export function inspectPlayerHistory(
  state: WorldState,
  playerId: string
): InspectPlayerHistoryResult {
  // 1. Confirm agent exists
  const agent = state.agents.find((a) => a.id === playerId);
  if (!agent) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
    };
  }

  // 2. Confirm agent is a player
  if (agent.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${agent.agentType}")`,
      playerId,
    };
  }

  // 3. Project safe copies of player-scoped records preserving append order
  const purchases: PurchaseRecord[] = state.purchases
    .filter((p) => p.playerId === playerId)
    .map((p) => ({ ...p }));

  const activityCompletions: ActivityCompletionRecord[] = (state.activityCompletions || [])
    .filter((c) => c.playerId === playerId)
    .map((c) => ({ ...c }));

  const coffeeCompletions: CoffeeCompletionRecord[] = activityCompletions
    .filter((c) => c.activity === 'having-coffee')
    .map((c) => ({
      id: c.id,
      playerId: c.playerId,
      restaurantId: c.restaurantId,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
    }));

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" successfully inspected personal history`,
    playerId,
    history: {
      playerId,
      purchases,
      activityCompletions,
      coffeeCompletions,
    },
  };
}

export type InspectPlayerKnowledgeResultCode =
  | 'success'
  | 'player-not-found'
  | 'player-not-player';

export interface InspectPlayerKnowledgeResult {
  success: boolean;
  code: InspectPlayerKnowledgeResultCode;
  message: string;
  playerId: string;
  knowledge?: AgentKnowledgeRecord[];
}

/**
 * Authoritative epistemic inspection: A Player inspects their own retained declarative knowledge (Milestone 35).
 *
 * Preconditions (evaluated in deterministic order):
 * 1. Player exists in WorldState.agents (code: 'player-not-found')
 * 2. Agent is a player: agent.agentType === 'player' (code: 'player-not-player')
 *
 * Epistemic Privacy & Isolation:
 * - Returns only records where record.agentId === playerId.
 * - Produces fresh shallow copies of record objects and payloads in a new array, ensuring
 *   callers cannot mutate authoritative WorldState knowledge collections.
 * - Never returns another agent's knowledge records.
 *
 * Invariants:
 * - Pure deterministic evaluation with ZERO state mutation on success or failure.
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT alter agent locations, balances, activities, or operational states.
 */
export function inspectPlayerKnowledge(
  state: WorldState,
  playerId: string
): InspectPlayerKnowledgeResult {
  // 1. Confirm agent exists
  const agent = state.agents.find((a) => a.id === playerId);
  if (!agent) {
    return {
      success: false,
      code: 'player-not-found',
      message: `Player "${playerId}" not found in world state`,
      playerId,
    };
  }

  // 2. Confirm agent is a player
  if (agent.agentType !== 'player') {
    return {
      success: false,
      code: 'player-not-player',
      message: `Agent "${playerId}" is not a player (agentType: "${agent.agentType}")`,
      playerId,
    };
  }

  // 3. Project safe copies of player-scoped knowledge records
  const knowledge: AgentKnowledgeRecord[] = state.knowledge
    .filter((k) => k.agentId === playerId)
    .map((k) => ({
      ...k,
      payload: { ...k.payload },
    }));

  return {
    success: true,
    code: 'success',
    message: `Player "${playerId}" successfully inspected personal knowledge`,
    playerId,
    knowledge,
  };
}

export const DEVELOPMENT_PASTRY_OFFERING_ID = 'offering:development-pastry';

export type MakeDevelopmentOfferingAvailableResultCode =
  | 'success'
  | 'npc-not-found'
  | 'npc-not-npc'
  | 'npc-not-active'
  | 'restaurant-not-found'
  | 'npc-not-at-restaurant'
  | 'restaurant-not-open'
  | 'offering-already-available';

export interface MakeDevelopmentOfferingAvailableResult {
  success: boolean;
  code: MakeDevelopmentOfferingAvailableResultCode;
  message: string;
  npcId: string;
  restaurantId: string;
  offeringId?: string;
}

/**
 * Concrete world action: An active NPC makes a commercial offering available at a restaurant (Milestone 19-A).
 *
 * Deterministically adds the development pastry offering ('offering:development-pastry', 'Pan Dulce', $2.50 USD)
 * to state.offerings during the NPC's active shift at the development restaurant.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. NPC exists in WorldState.agents (code: 'npc-not-found')
 * 2. Agent is an NPC: agent.agentType === 'npc' (code: 'npc-not-npc')
 * 3. NPC is active: agent.activityState === 'active' (code: 'npc-not-active')
 * 4. Restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 5. NPC is currently located at the restaurant: agent.locationId === restaurant.id (code: 'npc-not-at-restaurant')
 * 6. Restaurant is currently open: restaurant.operationalState === 'open' (code: 'restaurant-not-open')
 * 7. Offering is not already available in state.offerings (code: 'offering-already-available')
 *
 * State Transition:
 * Appends the concrete Offering entity to state.offerings.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT mutate agent locations, balances, or activities.
 * - Does NOT introduce inventory, stock, recipes, ingredients, or food production concepts.
 */
export function makeDevelopmentOfferingAvailable(
  state: WorldState,
  npcId: string,
  restaurantId: string
): MakeDevelopmentOfferingAvailableResult {
  // 1. Confirm NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Agent "${npcId}" not found in world state`,
      npcId,
      restaurantId,
    };
  }

  // 2. Confirm agent is an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'npc-not-npc',
      message: `Agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      npcId,
      restaurantId,
    };
  }

  // 3. Confirm NPC is active
  if (npc.activityState !== 'active') {
    return {
      success: false,
      code: 'npc-not-active',
      message: `NPC "${npcId}" is not active (activityState: "${npc.activityState}")`,
      npcId,
      restaurantId,
    };
  }

  // 4. Confirm restaurant exists
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${restaurantId}" not found in world state`,
      npcId,
      restaurantId,
    };
  }

  // 5. Confirm NPC is located at the restaurant
  if (npc.locationId !== restaurant.id) {
    return {
      success: false,
      code: 'npc-not-at-restaurant',
      message: `NPC "${npcId}" is at location "${npc.locationId}", not at restaurant "${restaurant.id}"`,
      npcId,
      restaurantId,
    };
  }

  // 6. Confirm restaurant is accessible (open or closing-soon)
  if (restaurant.operationalState !== 'open' && restaurant.operationalState !== 'closing-soon') {
    return {
      success: false,
      code: 'restaurant-not-open',
      message: `Restaurant "${restaurantId}" is not open (operationalState: "${restaurant.operationalState}")`,
      npcId,
      restaurantId,
    };
  }

  // 7. Confirm offering is not already available
  const existingOffering = state.offerings.find((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);
  if (existingOffering) {
    return {
      success: false,
      code: 'offering-already-available',
      message: `Offering "${DEVELOPMENT_PASTRY_OFFERING_ID}" is already available at restaurant "${existingOffering.restaurantId}"`,
      npcId,
      restaurantId,
      offeringId: existingOffering.id,
    };
  }

  // Authoritative state mutation: make offering available
  const newOffering: Offering = {
    id: DEVELOPMENT_PASTRY_OFFERING_ID,
    type: 'offering',
    name: 'Pan Dulce',
    restaurantId: restaurant.id,
    priceMinor: 250,
    currency: 'USD',
  };
  state.offerings.push(newOffering);

  return {
    success: true,
    code: 'success',
    message: `NPC "${npcId}" successfully made offering "${newOffering.id}" (${newOffering.name}) available at restaurant "${restaurantId}"`,
    npcId,
    restaurantId,
    offeringId: newOffering.id,
  };
}

export type RetireDevelopmentOfferingResultCode =
  | 'success'
  | 'npc-not-found'
  | 'npc-not-npc'
  | 'npc-not-active'
  | 'restaurant-not-found'
  | 'npc-not-at-restaurant'
  | 'offering-not-available';

export interface RetireDevelopmentOfferingResult {
  success: boolean;
  code: RetireDevelopmentOfferingResultCode;
  message: string;
  npcId: string;
  restaurantId: string;
  offeringId?: string;
}

/**
 * Concrete world action: An active NPC retires a commercial offering from a restaurant (Milestone 19-A).
 *
 * Deterministically removes the development pastry offering ('offering:development-pastry') from
 * state.offerings when the NPC's active restaurant shift concludes.
 *
 * Preconditions (evaluated in deterministic order):
 * 1. NPC exists in WorldState.agents (code: 'npc-not-found')
 * 2. Agent is an NPC: agent.agentType === 'npc' (code: 'npc-not-npc')
 * 3. NPC is active: agent.activityState === 'active' (code: 'npc-not-active')
 * 4. Restaurant exists in WorldState.restaurants (code: 'restaurant-not-found')
 * 5. NPC is currently located at the restaurant: agent.locationId === restaurant.id (code: 'npc-not-at-restaurant')
 * 6. Offering is currently available in state.offerings (code: 'offering-not-available')
 *
 * State Transition:
 * Removes the concrete Offering entity from state.offerings.
 * Guarantees zero state mutation on any precondition failure.
 *
 * Invariants:
 * - Does NOT advance WorldClock or alter state.worldTime.
 * - Does NOT invalidate or mutate historical PurchaseRecord entries referencing the retired offering.
 * - Does NOT mutate agent locations, balances, or activities.
 */
export function retireDevelopmentOffering(
  state: WorldState,
  npcId: string,
  restaurantId: string
): RetireDevelopmentOfferingResult {
  // 1. Confirm NPC exists
  const npc = state.agents.find((a) => a.id === npcId);
  if (!npc) {
    return {
      success: false,
      code: 'npc-not-found',
      message: `Agent "${npcId}" not found in world state`,
      npcId,
      restaurantId,
    };
  }

  // 2. Confirm agent is an NPC
  if (npc.agentType !== 'npc') {
    return {
      success: false,
      code: 'npc-not-npc',
      message: `Agent "${npcId}" is not an NPC (agentType: "${npc.agentType}")`,
      npcId,
      restaurantId,
    };
  }

  // 3. Confirm NPC is active
  if (npc.activityState !== 'active') {
    return {
      success: false,
      code: 'npc-not-active',
      message: `NPC "${npcId}" is not active (activityState: "${npc.activityState}")`,
      npcId,
      restaurantId,
    };
  }

  // 4. Confirm restaurant exists
  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return {
      success: false,
      code: 'restaurant-not-found',
      message: `Restaurant "${restaurantId}" not found in world state`,
      npcId,
      restaurantId,
    };
  }

  // 5. Confirm NPC is located at the restaurant
  if (npc.locationId !== restaurant.id) {
    return {
      success: false,
      code: 'npc-not-at-restaurant',
      message: `NPC "${npcId}" is at location "${npc.locationId}", not at restaurant "${restaurant.id}"`,
      npcId,
      restaurantId,
    };
  }

  // 6. Confirm offering is currently available
  const offeringIndex = state.offerings.findIndex((o) => o.id === DEVELOPMENT_PASTRY_OFFERING_ID);
  if (offeringIndex === -1) {
    return {
      success: false,
      code: 'offering-not-available',
      message: `Offering "${DEVELOPMENT_PASTRY_OFFERING_ID}" is not available at restaurant "${restaurantId}"`,
      npcId,
      restaurantId,
    };
  }

  // Authoritative state mutation: retire offering
  state.offerings.splice(offeringIndex, 1);

  return {
    success: true,
    code: 'success',
    message: `NPC "${npcId}" successfully retired offering "${DEVELOPMENT_PASTRY_OFFERING_ID}" from restaurant "${restaurantId}"`,
    npcId,
    restaurantId,
    offeringId: DEVELOPMENT_PASTRY_OFFERING_ID,
  };
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 14 WorldState contract.
 * Enforces schema version 10, ISO timestamp, geographic hierarchy, spatial containment,
 * agent identities with dynamic activity state and optional playerActivity,
 * agent locationId referential integrity, agent balances, restaurant operational state,
 * restaurant balances, commercial offerings with restaurant references and deterministic pricing,
 * global entity ID uniqueness, immutable historical purchase records, and immutable historical
 * coffee completion records.
 */
export function validateWorldState(data: unknown): asserts data is WorldState {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== CURRENT_WORLD_STATE_VERSION) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version ${CURRENT_WORLD_STATE_VERSION}. Incompatible schemas must be rejected explicitly.`
    );
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  // Validate Places
  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  // Validate Restaurants referencing Buildings
  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  // Validate Agents with Place + Restaurant spatial referential integrity
  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  // Validate Agent spatial presence & interior identity (Milestone 85)
  for (const agent of agents) {
    if (agent.interiorSpaceId === undefined) {
      throw new Error(
        `Invalid WorldState: agent "${agent.id}" is missing required field "interiorSpaceId" in version 19 schema`
      );
    }
    if (agent.interiorSpaceId !== null) {
      const place = places.find((p) => p.id === agent.locationId);
      if (place && place.type === 'street') {
        throw new Error(
          `Invalid WorldState: agent "${agent.id}" is at street place "${agent.locationId}" but has non-null interiorSpaceId "${agent.interiorSpaceId}" (Invariant A violation)`
        );
      }
    }
  }

  // Validate Offerings referencing Restaurants
  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  // Validate Business Authority invariants (Milestone 36)
  validateBusinessAuthority(candidate as unknown as WorldState);

  for (const agent of agents) {
    if (agent.playerActivity) {
      if (!validRestaurantIds.has(agent.playerActivity.restaurantId)) {
        throw new Error(
          `Invalid playerActivity for agent "${agent.id}": restaurantId "${agent.playerActivity.restaurantId}" references non-existent restaurant`
        );
      }
      if (
        typeof agent.playerActivity.durationMs !== 'number' ||
        !Number.isInteger(agent.playerActivity.durationMs) ||
        agent.playerActivity.durationMs <= 0
      ) {
        throw new Error(
          `Invalid playerActivity durationMs for agent "${agent.id}": must be a positive integer`
        );
      }
      if (
        typeof agent.playerActivity.offeringId !== 'string' ||
        agent.playerActivity.offeringId.trim() === ''
      ) {
        throw new Error(
          `Invalid playerActivity offeringId for agent "${agent.id}": must be a non-empty string`
        );
      }
      if (
        agent.playerActivity.itemId !== null &&
        (typeof agent.playerActivity.itemId !== 'string' || agent.playerActivity.itemId.trim() === '')
      ) {
        throw new Error(
          `Invalid playerActivity itemId for agent "${agent.id}": must be null or a non-empty string`
        );
      }
      if (
        agent.playerActivity.companionAgentId !== undefined &&
        agent.playerActivity.companionAgentId !== null
      ) {
        if (
          typeof agent.playerActivity.companionAgentId !== 'string' ||
          agent.playerActivity.companionAgentId.trim() === ''
        ) {
          throw new Error(
            `Invalid playerActivity companionAgentId for agent "${agent.id}": must be null or a non-empty string`
          );
        }
        if (!agents.some((a) => a.id === agent.playerActivity?.companionAgentId)) {
          throw new Error(
            `Invalid playerActivity companionAgentId for agent "${agent.id}": references non-existent agent "${agent.playerActivity.companionAgentId}"`
          );
        }
      }
    }
  }

  // Global ID uniqueness across all entity collections
  const globalIdSet = new Set<string>();
  for (const place of places) {
    globalIdSet.add(place.id);
  }
  for (const restaurant of restaurants) {
    if (globalIdSet.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found across collections: "${restaurant.id}"`);
    }
    globalIdSet.add(restaurant.id);
  }
  for (const agent of agents) {
    if (globalIdSet.has(agent.id)) {
      throw new Error(`Duplicate entity id found across collections: "${agent.id}"`);
    }
    globalIdSet.add(agent.id);
  }
  for (const offering of offerings) {
    if (globalIdSet.has(offering.id)) {
      throw new Error(`Duplicate entity id found across collections: "${offering.id}"`);
    }
    globalIdSet.add(offering.id);
  }

  // Validate Purchases (Milestone 13: persistent historical facts)
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }

  const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));
  const restaurantMap = new Map<string, Restaurant>(restaurants.map((r) => [r.id, r]));
  const offeringMap = new Map<string, Offering>(offerings.map((o) => [o.id, o]));
  const purchaseIdSet = new Set<string>();

  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }

    const rec = p as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(`Invalid PurchaseRecord at index ${i}: id must be a non-empty string`);
    }

    if (purchaseIdSet.has(rec.id)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id);

    if (typeof rec.worldTime !== 'string' || rec.worldTime.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": worldTime must be a non-empty string`);
    }
    if (Number.isNaN(Date.parse(rec.worldTime))) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": worldTime must be a valid ISO-8601 timestamp. Received: "${rec.worldTime}"`
      );
    }

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": playerId must be a non-empty string`);
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": offeringId must be a non-empty string`);
    }
    const offeringEntity = offeringMap.get(rec.offeringId);
    if (!offeringEntity) {
      // Historical persistence: Allow retired offering:development-pastry records
      // while continuing to reject arbitrary non-existent offerings.
      if (rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID) {
        if (rec.restaurantId !== 'restaurant:development-restaurant') {
          throw new Error(
            `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "restaurant:development-restaurant", not "${rec.restaurantId}"`
          );
        }
      } else {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offeringId "${rec.offeringId}" references non-existent offering`
        );
      }
    } else {
      // Enforce structural consistency: offering must belong to recorded restaurant
      if (offeringEntity.restaurantId !== rec.restaurantId) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "${offeringEntity.restaurantId}", not "${rec.restaurantId}"`
        );
      }
    }

    if (
      typeof rec.amountMinor !== 'number' ||
      !Number.isInteger(rec.amountMinor) ||
      rec.amountMinor < 0
    ) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": amountMinor must be a non-negative integer`
      );
    }

    if (typeof rec.currency !== 'string' || rec.currency.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": currency must be a non-empty string`);
    }
    const expectedCurrency = offeringEntity
      ? offeringEntity.currency
      : rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
        ? 'USD'
        : undefined;
    if (expectedCurrency && rec.currency !== expectedCurrency) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": currency "${rec.currency}" does not match offering currency "${expectedCurrency}"`
      );
    }
    // Validate consumedAt (Milestone 29 Correction: single-use consequence tracking)
    if (rec.consumedAt !== undefined && rec.consumedAt !== null) {
      if (typeof rec.consumedAt !== 'string' || rec.consumedAt.trim() === '') {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a non-empty string or null`
        );
      }
      if (Number.isNaN(Date.parse(rec.consumedAt))) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a valid ISO-8601 timestamp string or null. Received: "${rec.consumedAt}"`
        );
      }
    } else {
      rec.consumedAt = null;
    }
  }

  // Validate Activity Completions (Milestone 34: unified historical ledger)
  if (!Array.isArray(candidate.activityCompletions)) {
    throw new Error('Invalid WorldState: activityCompletions must be an array');
  }

  const activityCompletionIdSet = new Set<string>();

  for (let i = 0; i < candidate.activityCompletions.length; i++) {
    const c = candidate.activityCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(
        `Invalid ActivityCompletionRecord at index ${i}: record must be a non-null object`
      );
    }

    const rec = c as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord at index ${i}: id must be a non-empty string`
      );
    }

    if (activityCompletionIdSet.has(rec.id)) {
      throw new Error(`Duplicate activity completion record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    activityCompletionIdSet.add(rec.id);
    globalIdSet.add(rec.id);

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": playerId must be a non-empty string`
      );
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (rec.activity !== 'having-coffee' && rec.activity !== 'eating-pastry') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": activity must be "having-coffee" or "eating-pastry". Received: ${JSON.stringify(rec.activity)}`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": offeringId must be a non-empty string`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": restaurantId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (rec.itemId !== null && (typeof rec.itemId !== 'string' || rec.itemId.trim() === '')) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": itemId must be null or a non-empty string`
      );
    }

    if (
      rec.companionAgentId !== undefined &&
      rec.companionAgentId !== null
    ) {
      if (typeof rec.companionAgentId !== 'string' || rec.companionAgentId.trim() === '') {
        throw new Error(
          `Invalid ActivityCompletionRecord "${rec.id}": companionAgentId must be null or a non-empty string`
        );
      }
      if (!agentMap.has(rec.companionAgentId)) {
        throw new Error(
          `Invalid ActivityCompletionRecord "${rec.id}": companionAgentId "${rec.companionAgentId}" references non-existent agent`
        );
      }
    }

    if (typeof rec.startedAt !== 'string' || rec.startedAt.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": startedAt must be a non-empty string`
      );
    }
    const startedMs = Date.parse(rec.startedAt);
    if (Number.isNaN(startedMs)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": startedAt must be a valid ISO-8601 timestamp. Received: "${rec.startedAt}"`
      );
    }

    if (typeof rec.completedAt !== 'string' || rec.completedAt.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt must be a non-empty string`
      );
    }
    const completedMs = Date.parse(rec.completedAt);
    if (Number.isNaN(completedMs)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt must be a valid ISO-8601 timestamp. Received: "${rec.completedAt}"`
      );
    }

    if (completedMs < startedMs) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") must be greater than or equal to startedAt ("${rec.startedAt}")`
      );
    }

    const expectedDurationMs = 15 * 60 * 1000;
    if (completedMs - startedMs !== expectedDurationMs) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") does not match exact 15-minute duration from startedAt ("${rec.startedAt}")`
      );
    }
  }

  // Validate Acquaintances (Milestone 25: persistent social facts)
  if (!Array.isArray(candidate.acquaintances)) {
    throw new Error('Invalid WorldState: acquaintances must be an array');
  }

  const agentIdSet = new Set<string>(agents.map((a) => a.id));
  validateAcquaintances(candidate.acquaintances as unknown[], agentIdSet);
  const acquaintances = candidate.acquaintances as Acquaintance[];

  for (const acq of acquaintances) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }

  // Validate Items (Milestone 33: authoritative physical possession entities)
  if (!Array.isArray(candidate.items)) {
    throw new Error('Invalid WorldState: items must be an array');
  }

  const itemIdSet = new Set<string>();
  const seenSourcePurchaseIds = new Set<string>();
  const itemBySourcePurchaseId = new Map<string, Record<string, unknown>>();
  const qualifyingOfferingIds = new Set<string>(QUALIFYING_ITEM_OFFERING_IDS);

  for (let i = 0; i < candidate.items.length; i++) {
    const itemRaw = candidate.items[i];
    if (typeof itemRaw !== 'object' || itemRaw === null) {
      throw new Error(`Invalid OwnedItem at index ${i}: item must be a non-null object`);
    }

    const item = itemRaw as Record<string, unknown>;

    // 1. ID format: /^item:\d+$/
    if (typeof item.id !== 'string' || !/^item:\d+$/.test(item.id)) {
      throw new Error(
        `Invalid OwnedItem at index ${i}: id must match format "item:<number>". Received: ${JSON.stringify(item.id)}`
      );
    }

    if (itemIdSet.has(item.id)) {
      throw new Error(`Duplicate item id found: "${item.id}"`);
    }
    if (globalIdSet.has(item.id)) {
      throw new Error(`Duplicate entity id found across collections: "${item.id}"`);
    }
    itemIdSet.add(item.id);
    globalIdSet.add(item.id);

    // 2. Type: 'item'
    if (item.type !== 'item') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": type must be "item". Received: ${JSON.stringify(item.type)}`
      );
    }

    // 3. Offering ID: must be in QUALIFYING_ITEM_OFFERING_IDS
    if (typeof item.offeringId !== 'string' || !qualifyingOfferingIds.has(item.offeringId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId must be a qualifying item offering. Received: ${JSON.stringify(item.offeringId)}`
      );
    }

    // 4. Name: non-empty string
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": name must be a non-empty string`);
    }

    // 5. Owner agent: exists and is player
    if (typeof item.ownerAgentId !== 'string' || item.ownerAgentId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": ownerAgentId must be a non-empty string`);
    }
    const ownerAgent = agentMap.get(item.ownerAgentId);
    if (!ownerAgent) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" references non-existent agent`
      );
    }
    if (ownerAgent.agentType !== 'player' && ownerAgent.agentType !== 'npc') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" has invalid agentType "${ownerAgent.agentType}"`
      );
    }

    // 6. Restaurant: exists
    if (typeof item.restaurantId !== 'string' || item.restaurantId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(item.restaurantId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" references non-existent restaurant`
      );
    }

    // 7. Acquired timestamp: valid ISO-8601
    if (typeof item.acquiredAt !== 'string' || item.acquiredAt.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": acquiredAt must be a non-empty string`);
    }
    const acquiredMs = Date.parse(item.acquiredAt);
    if (Number.isNaN(acquiredMs)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt must be a valid ISO-8601 timestamp string. Received: "${item.acquiredAt}"`
      );
    }

    // 8. Status: 'available' | 'consumed'
    if (item.status !== 'available' && item.status !== 'consumed') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": status must be "available" or "consumed". Received: ${JSON.stringify(item.status)}`
      );
    }

    // 9. Consumed timestamp semantics
    if (item.status === 'available') {
      if (item.consumedAt !== null) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be null when status is "available". Received: ${JSON.stringify(item.consumedAt)}`
        );
      }
    } else {
      if (typeof item.consumedAt !== 'string' || item.consumedAt.trim() === '') {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a non-empty ISO-8601 timestamp when status is "consumed"`
        );
      }
      const consumedMs = Date.parse(item.consumedAt);
      if (Number.isNaN(consumedMs)) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a valid ISO-8601 timestamp string. Received: "${item.consumedAt}"`
        );
      }
      if (consumedMs < acquiredMs) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt ("${item.consumedAt}") must be greater than or equal to acquiredAt ("${item.acquiredAt}")`
        );
      }
    }

    // 10. Source purchase foreign key & Direction A check
    if (typeof item.sourcePurchaseId !== 'string' || item.sourcePurchaseId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": sourcePurchaseId must be a non-empty string`);
    }

    if (seenSourcePurchaseIds.has(item.sourcePurchaseId)) {
      throw new Error(
        `Duplicate sourcePurchaseId "${item.sourcePurchaseId}" found across items (violation of 1:1 cardinality)`
      );
    }
    seenSourcePurchaseIds.add(item.sourcePurchaseId);
    itemBySourcePurchaseId.set(item.sourcePurchaseId, item);

    const sourcePurchase = purchaseIdSet.has(item.sourcePurchaseId)
      ? (candidate.purchases as PurchaseRecord[]).find((p) => p.id === item.sourcePurchaseId)
      : undefined;

    if (!sourcePurchase) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": sourcePurchaseId "${item.sourcePurchaseId}" references non-existent purchase`
      );
    }

    // Direction A referential consistency
    // Note: In Milestone 50, item.ownerAgentId represents current custody/possession,
    // which may diverge from original sourcePurchase.playerId after an authorized peer-to-peer handoff.
    // Original commercial provenance is verified via sourcePurchase existence.
    if (sourcePurchase.offeringId !== item.offeringId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId "${item.offeringId}" does not match purchase offeringId "${sourcePurchase.offeringId}"`
      );
    }
    if (sourcePurchase.restaurantId !== item.restaurantId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" does not match purchase restaurantId "${sourcePurchase.restaurantId}"`
      );
    }
    if (sourcePurchase.worldTime !== item.acquiredAt) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt "${item.acquiredAt}" does not match purchase worldTime "${sourcePurchase.worldTime}"`
      );
    }
  }

  // Direction B check: Every qualifying PurchaseRecord must have exactly one OwnedItem,
  // EXCEPT when the purchase belongs to an in-flight Order ('preparing' or 'ready').
  const purchaseMap = new Map<string, PurchaseRecord>(
    (candidate.purchases as PurchaseRecord[]).map((p) => [p.id, p])
  );
  const pendingOrderPurchaseIds = new Set<string>();
  if (Array.isArray(candidate.orders)) {
    for (const ord of candidate.orders as Array<{ customerId?: string; restaurantId?: string; status?: string; purchaseIds?: string[] }>) {
      if (
        ord &&
        (ord.status === 'preparing' || ord.status === 'ready') &&
        Array.isArray(ord.purchaseIds)
      ) {
        for (const pid of ord.purchaseIds) {
          const purchase = purchaseMap.get(pid);
          if (
            purchase &&
            purchase.playerId === ord.customerId &&
            purchase.restaurantId === ord.restaurantId &&
            !itemBySourcePurchaseId.has(pid)
          ) {
            pendingOrderPurchaseIds.add(pid);
          }
        }
      }
    }
  }

  for (const p of candidate.purchases as PurchaseRecord[]) {
    if (qualifyingOfferingIds.has(p.offeringId)) {
      if (!itemBySourcePurchaseId.has(p.id) && !pendingOrderPurchaseIds.has(p.id)) {
        throw new Error(
          `Missing OwnedItem for qualifying purchase "${p.id}" (offering: "${p.offeringId}")`
        );
      }
    }
  }

  // Validate Item Authority domain invariants (Milestone 37)
  validateItemAuthority(candidate as unknown as ItemWorldState);

  // Validate Knowledge (Milestone 35: authoritative epistemic retention)
  if (!Array.isArray(candidate.knowledge)) {
    throw new Error('Invalid WorldState: knowledge must be an array');
  }

  const knowledgeIdSet = new Set<string>();
  const seenCompositeKeys = new Set<string>();

  for (let i = 0; i < candidate.knowledge.length; i++) {
    const recRaw = candidate.knowledge[i];
    if (typeof recRaw !== 'object' || recRaw === null) {
      throw new Error(`Invalid AgentKnowledgeRecord at index ${i}: record must be a non-null object`);
    }

    const rec = recRaw as Record<string, unknown>;

    // 1. ID format: /^knowledge:[a-z0-9-]+(:[a-z0-9-]+)*$/
    if (
      typeof rec.id !== 'string' ||
      !/^knowledge:[a-z0-9-]+(:[a-z0-9-]+)*$/.test(rec.id)
    ) {
      throw new Error(
        `Invalid AgentKnowledgeRecord at index ${i}: id must match format "knowledge:<identifier>". Received: ${JSON.stringify(rec.id)}`
      );
    }

    if (knowledgeIdSet.has(rec.id)) {
      throw new Error(`Duplicate knowledge id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    knowledgeIdSet.add(rec.id);
    globalIdSet.add(rec.id);

    // 2. Knower Agent (agentId): exists in state.agents and agentType === 'player'
    if (typeof rec.agentId !== 'string' || rec.agentId.trim() === '') {
      throw new Error(`Invalid AgentKnowledgeRecord "${rec.id}": agentId must be a non-empty string`);
    }
    const knowerAgent = agentMap.get(rec.agentId);
    if (!knowerAgent) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": agentId "${rec.agentId}" references non-existent agent`
      );
    }
    if (knowerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": agentId "${rec.agentId}" is not a player (agentType: "${knowerAgent.agentType}")`
      );
    }

    // 3. Fact Type: 'agent-schedule'
    if (rec.factType !== 'agent-schedule') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": factType must be "agent-schedule". Received: ${JSON.stringify(rec.factType)}`
      );
    }

    // 4. Subject Agent (subjectId): exists in state.agents and agentType === 'npc'
    if (typeof rec.subjectId !== 'string' || rec.subjectId.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": subjectId must be a non-empty string`
      );
    }
    const subjectAgent = agentMap.get(rec.subjectId);
    if (!subjectAgent) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": subjectId "${rec.subjectId}" references non-existent agent`
      );
    }
    if (subjectAgent.agentType !== 'npc') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": subjectId "${rec.subjectId}" is not an NPC (agentType: "${subjectAgent.agentType}")`
      );
    }

    // 5. Source: 'social-inquiry' or 'npc-initiative'
    if (rec.source !== 'social-inquiry' && rec.source !== 'npc-initiative') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": source must be "social-inquiry" or "npc-initiative". Received: ${JSON.stringify(rec.source)}`
      );
    }

    // 6. Source Agent (sourceAgentId): exists in state.agents and agentType === 'npc'
    if (typeof rec.sourceAgentId !== 'string' || rec.sourceAgentId.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": sourceAgentId must be a non-empty string`
      );
    }
    const sourceAgent = agentMap.get(rec.sourceAgentId);
    if (!sourceAgent) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": sourceAgentId "${rec.sourceAgentId}" references non-existent agent`
      );
    }
    if (sourceAgent.agentType !== 'npc') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": sourceAgentId "${rec.sourceAgentId}" is not an NPC (agentType: "${sourceAgent.agentType}")`
      );
    }

    // 7. acquiredAt timestamp: valid ISO-8601
    if (typeof rec.acquiredAt !== 'string' || rec.acquiredAt.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": acquiredAt must be a non-empty string`
      );
    }
    const acquiredMs = Date.parse(rec.acquiredAt);
    if (Number.isNaN(acquiredMs)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": acquiredAt must be a valid ISO-8601 timestamp string. Received: "${rec.acquiredAt}"`
      );
    }

    // 8. lastVerifiedAt timestamp: valid ISO-8601 and >= acquiredAt
    if (typeof rec.lastVerifiedAt !== 'string' || rec.lastVerifiedAt.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": lastVerifiedAt must be a non-empty string`
      );
    }
    const lastVerifiedMs = Date.parse(rec.lastVerifiedAt);
    if (Number.isNaN(lastVerifiedMs)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": lastVerifiedAt must be a valid ISO-8601 timestamp string. Received: "${rec.lastVerifiedAt}"`
      );
    }
    if (lastVerifiedMs < acquiredMs) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": lastVerifiedAt ("${rec.lastVerifiedAt}") must be greater than or equal to acquiredAt ("${rec.acquiredAt}")`
      );
    }

    // 9. Payload validation
    if (typeof rec.payload !== 'object' || rec.payload === null) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload must be a non-null object`
      );
    }
    const payload = rec.payload as Record<string, unknown>;

    if (typeof payload.workplaceId !== 'string' || payload.workplaceId.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.workplaceId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(payload.workplaceId)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.workplaceId "${payload.workplaceId}" references non-existent restaurant`
      );
    }

    if (typeof payload.shiftStart !== 'string' || !/^\d{2}:\d{2}$/.test(payload.shiftStart)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.shiftStart must be a "HH:MM" string. Received: ${JSON.stringify(payload.shiftStart)}`
      );
    }

    if (typeof payload.shiftEnd !== 'string' || !/^\d{2}:\d{2}$/.test(payload.shiftEnd)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.shiftEnd must be a "HH:MM" string. Received: ${JSON.stringify(payload.shiftEnd)}`
      );
    }

    // 10. Composite semantic identity uniqueness: (agentId, factType, subjectId)
    const compositeKey = `${rec.agentId}::${rec.factType}::${rec.subjectId}`;
    if (seenCompositeKeys.has(compositeKey)) {
      throw new Error(
        `Duplicate knowledge fact found for agent "${rec.agentId}", factType "${rec.factType}", subjectId "${rec.subjectId}"`
      );
    }
    seenCompositeKeys.add(compositeKey);
  }

  // Validate Orders (Milestone 39: Order & Service Fulfillment Foundation)
  if (!Array.isArray(candidate.orders)) {
    throw new Error('Invalid WorldState: orders must be an array');
  }

  for (let i = 0; i < candidate.orders.length; i++) {
    const o = candidate.orders[i];
    if (typeof o === 'object' && o !== null && typeof (o as Record<string, unknown>).id === 'string') {
      const orderId = (o as Record<string, unknown>).id as string;
      if (globalIdSet.has(orderId)) {
        throw new Error(`Duplicate entity id found across collections: "${orderId}"`);
      }
      globalIdSet.add(orderId);
    }
  }

  // Validate Order Authority invariants (Milestone 39)
  validateOrderAuthority(candidate as unknown as OrderWorldState);

  // Validate Properties (Milestone 56: Property & Assignment Foundation)
  if (!Array.isArray(candidate.properties)) {
    throw new Error('Invalid WorldState: properties must be an array');
  }

  for (let i = 0; i < candidate.properties.length; i++) {
    const p = candidate.properties[i];
    if (typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).id === 'string') {
      const propertyId = (p as Record<string, unknown>).id as string;
      if (globalIdSet.has(propertyId)) {
        throw new Error(`Duplicate entity id found across collections: "${propertyId}"`);
      }
      globalIdSet.add(propertyId);
    }
  }

  // Validate Property Authority invariants (Milestone 56)
  validatePropertyAuthority(candidate as unknown as PropertyWorldState);

  // Validate Site Agent Associations (Milestone 57: Site Agent Association Foundation)
  if (!Array.isArray(candidate.siteAgentAssociations)) {
    throw new Error('Invalid WorldState: siteAgentAssociations must be an array');
  }

  // Validate Site Agent Association Authority invariants (Milestone 57)
  validateSiteAgentAssociationAuthority(candidate as unknown as SiteAgentAssociationWorldState);
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 32 (Version 11) WorldState contract.
 * Preserved for pre-migration integrity checking.
 */
export function validateWorldStateV11(data: unknown): asserts data is WorldStateV11 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== 11) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version 11. Incompatible schemas must be rejected explicitly.`
    );
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  // Validate Places
  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  // Validate Restaurants referencing Buildings
  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  // Validate Agents with Place + Restaurant spatial referential integrity
  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  // Validate Offerings referencing Restaurants
  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  for (const agent of agents) {
    if (agent.playerActivity) {
      if (!validRestaurantIds.has(agent.playerActivity.restaurantId)) {
        throw new Error(
          `Invalid playerActivity for agent "${agent.id}": restaurantId "${agent.playerActivity.restaurantId}" references non-existent restaurant`
        );
      }
    }
  }

  // Global ID uniqueness across all entity collections
  const globalIdSet = new Set<string>();
  for (const place of places) {
    globalIdSet.add(place.id);
  }
  for (const restaurant of restaurants) {
    if (globalIdSet.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found across collections: "${restaurant.id}"`);
    }
    globalIdSet.add(restaurant.id);
  }
  for (const agent of agents) {
    if (globalIdSet.has(agent.id)) {
      throw new Error(`Duplicate entity id found across collections: "${agent.id}"`);
    }
    globalIdSet.add(agent.id);
  }
  for (const offering of offerings) {
    if (globalIdSet.has(offering.id)) {
      throw new Error(`Duplicate entity id found across collections: "${offering.id}"`);
    }
    globalIdSet.add(offering.id);
  }

  // Validate Purchases
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }

  const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));
  const restaurantMap = new Map<string, Restaurant>(restaurants.map((r) => [r.id, r]));
  const offeringMap = new Map<string, Offering>(offerings.map((o) => [o.id, o]));
  const purchaseIdSet = new Set<string>();

  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }

    const rec = p as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(`Invalid PurchaseRecord at index ${i}: id must be a non-empty string`);
    }

    if (purchaseIdSet.has(rec.id)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id);

    if (typeof rec.worldTime !== 'string' || rec.worldTime.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": worldTime must be a non-empty string`);
    }
    if (Number.isNaN(Date.parse(rec.worldTime))) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": worldTime must be a valid ISO-8601 timestamp. Received: "${rec.worldTime}"`
      );
    }

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": playerId must be a non-empty string`);
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": offeringId must be a non-empty string`);
    }
    const offeringEntity = offeringMap.get(rec.offeringId);
    if (!offeringEntity) {
      if (rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID) {
        if (rec.restaurantId !== 'restaurant:development-restaurant') {
          throw new Error(
            `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "restaurant:development-restaurant", not "${rec.restaurantId}"`
          );
        }
      } else {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offeringId "${rec.offeringId}" references non-existent offering`
        );
      }
    } else {
      if (offeringEntity.restaurantId !== rec.restaurantId) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "${offeringEntity.restaurantId}", not "${rec.restaurantId}"`
        );
      }
    }

    if (
      typeof rec.amountMinor !== 'number' ||
      !Number.isInteger(rec.amountMinor) ||
      rec.amountMinor < 0
    ) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": amountMinor must be a non-negative integer`
      );
    }

    if (typeof rec.currency !== 'string' || rec.currency.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": currency must be a non-empty string`);
    }
    const expectedCurrency = offeringEntity
      ? offeringEntity.currency
      : rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
        ? 'USD'
        : undefined;
    if (expectedCurrency && rec.currency !== expectedCurrency) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": currency "${rec.currency}" does not match offering currency "${expectedCurrency}"`
      );
    }
    if (rec.consumedAt !== undefined && rec.consumedAt !== null) {
      if (typeof rec.consumedAt !== 'string' || rec.consumedAt.trim() === '') {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a non-empty string or null`
        );
      }
      if (Number.isNaN(Date.parse(rec.consumedAt))) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a valid ISO-8601 timestamp string or null. Received: "${rec.consumedAt}"`
        );
      }
    }
  }

  // Validate Coffee Completions
  if (!Array.isArray(candidate.coffeeCompletions)) {
    throw new Error('Invalid WorldState: coffeeCompletions must be an array');
  }

  const coffeeCompletionIdSet = new Set<string>();

  for (let i = 0; i < candidate.coffeeCompletions.length; i++) {
    const c = candidate.coffeeCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(
        `Invalid CoffeeCompletionRecord at index ${i}: record must be a non-null object`
      );
    }

    const rec = c as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord at index ${i}: id must be a non-empty string`
      );
    }

    if (coffeeCompletionIdSet.has(rec.id)) {
      throw new Error(`Duplicate coffee completion record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    coffeeCompletionIdSet.add(rec.id);

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": playerId must be a non-empty string`
      );
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": restaurantId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.startedAt !== 'string' || rec.startedAt.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": startedAt must be a non-empty string`
      );
    }
    const startedMs = Date.parse(rec.startedAt);
    if (Number.isNaN(startedMs)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": startedAt must be a valid ISO-8601 timestamp. Received: "${rec.startedAt}"`
      );
    }

    if (typeof rec.completedAt !== 'string' || rec.completedAt.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt must be a non-empty string`
      );
    }
    const completedMs = Date.parse(rec.completedAt);
    if (Number.isNaN(completedMs)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt must be a valid ISO-8601 timestamp. Received: "${rec.completedAt}"`
      );
    }

    if (completedMs < startedMs) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") must be greater than or equal to startedAt ("${rec.startedAt}")`
      );
    }

    if (completedMs - startedMs !== HAVING_COFFEE_DURATION_MS) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") does not match exact 15-minute duration from startedAt ("${rec.startedAt}")`
      );
    }
  }

  // Validate Acquaintances
  if (!Array.isArray(candidate.acquaintances)) {
    throw new Error('Invalid WorldState: acquaintances must be an array');
  }

  const agentIdSet = new Set<string>(agents.map((a) => a.id));
  validateAcquaintances(candidate.acquaintances as unknown[], agentIdSet);
  const acquaintances = candidate.acquaintances as Acquaintance[];

  for (const acq of acquaintances) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }
}

/**
 * Deterministically resolves the item name for v11 -> v12 migration.
 * Reconstructs offering name using live offerings or known historical offering identities.
 */
export function resolveMigrationItemName(offeringId: string, offerings: Offering[]): string {
  const liveOffering = offerings.find((o) => o.id === offeringId);
  if (liveOffering) {
    return liveOffering.name;
  }
  if (offeringId === 'offering:development-coffee') {
    return 'Coffee';
  }
  if (offeringId === 'offering:development-pastry' || offeringId === DEVELOPMENT_PASTRY_OFFERING_ID) {
    return 'Pan Dulce';
  }
  return 'Consumable Item';
}

/**
 * Migrates a valid Version 11 WorldState to Version 12.
 * Instantiates authoritative OwnedItem entities for qualifying historical purchases.
 */
export function migrateWorldStateV11ToV12(v11: WorldStateV11): WorldStateV12 {
  const qualifyingOfferingIds = new Set<string>(QUALIFYING_ITEM_OFFERING_IDS);
  const migratedItems: OwnedItem[] = [];

  for (const purchase of v11.purchases) {
    if (!qualifyingOfferingIds.has(purchase.offeringId)) {
      continue; // Direction B: Non-qualifying purchases produce zero items
    }

    const isConsumed =
      typeof purchase.consumedAt === 'string' && purchase.consumedAt.trim().length > 0;
    const status: ItemStatus = isConsumed ? 'consumed' : 'available';
    const consumedAt: string | null = isConsumed ? purchase.consumedAt : null;
    const name = resolveMigrationItemName(purchase.offeringId, v11.offerings);

    migratedItems.push({
      id: `item:${migratedItems.length + 1}`,
      type: 'item',
      offeringId: purchase.offeringId,
      name,
      ownerAgentId: purchase.playerId,
      restaurantId: purchase.restaurantId,
      sourcePurchaseId: purchase.id,
      acquiredAt: purchase.worldTime,
      status,
      consumedAt,
    });
  }

  return {
    worldId: v11.worldId,
    version: 12,
    worldTime: v11.worldTime,
    places: v11.places,
    restaurants: v11.restaurants,
    agents: v11.agents,
    offerings: v11.offerings,
    purchases: v11.purchases,
    coffeeCompletions: v11.coffeeCompletions,
    acquaintances: v11.acquaintances,
    items: migratedItems,
  };
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 33 (Version 12) WorldState contract.
 * Preserved for pre-migration integrity checking.
 */
export function validateWorldStateV12(data: unknown): asserts data is WorldStateV12 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== 12) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version 12. Incompatible schemas must be rejected explicitly.`
    );
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  // Validate Places
  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  // Validate Restaurants referencing Buildings
  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  // Validate Agents with Place + Restaurant spatial referential integrity
  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  // Validate Offerings referencing Restaurants
  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  for (const agent of agents) {
    if (agent.playerActivity) {
      if (!validRestaurantIds.has(agent.playerActivity.restaurantId)) {
        throw new Error(
          `Invalid playerActivity for agent "${agent.id}": restaurantId "${agent.playerActivity.restaurantId}" references non-existent restaurant`
        );
      }
    }
  }

  // Global ID uniqueness across all entity collections
  const globalIdSet = new Set<string>();
  for (const place of places) {
    globalIdSet.add(place.id);
  }
  for (const restaurant of restaurants) {
    if (globalIdSet.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found across collections: "${restaurant.id}"`);
    }
    globalIdSet.add(restaurant.id);
  }
  for (const agent of agents) {
    if (globalIdSet.has(agent.id)) {
      throw new Error(`Duplicate entity id found across collections: "${agent.id}"`);
    }
    globalIdSet.add(agent.id);
  }
  for (const offering of offerings) {
    if (globalIdSet.has(offering.id)) {
      throw new Error(`Duplicate entity id found across collections: "${offering.id}"`);
    }
    globalIdSet.add(offering.id);
  }

  // Validate Purchases
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }

  const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));
  const restaurantMap = new Map<string, Restaurant>(restaurants.map((r) => [r.id, r]));
  const offeringMap = new Map<string, Offering>(offerings.map((o) => [o.id, o]));
  const purchaseIdSet = new Set<string>();

  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }

    const rec = p as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(`Invalid PurchaseRecord at index ${i}: id must be a non-empty string`);
    }

    if (purchaseIdSet.has(rec.id)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id);

    if (typeof rec.worldTime !== 'string' || rec.worldTime.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": worldTime must be a non-empty string`);
    }
    if (Number.isNaN(Date.parse(rec.worldTime))) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": worldTime must be a valid ISO-8601 timestamp. Received: "${rec.worldTime}"`
      );
    }

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": playerId must be a non-empty string`);
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": offeringId must be a non-empty string`);
    }
    const offeringEntity = offeringMap.get(rec.offeringId);
    if (!offeringEntity) {
      if (rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID) {
        if (rec.restaurantId !== 'restaurant:development-restaurant') {
          throw new Error(
            `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "restaurant:development-restaurant", not "${rec.restaurantId}"`
          );
        }
      } else {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offeringId "${rec.offeringId}" references non-existent offering`
        );
      }
    } else {
      if (offeringEntity.restaurantId !== rec.restaurantId) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "${offeringEntity.restaurantId}", not "${rec.restaurantId}"`
        );
      }
    }

    if (
      typeof rec.amountMinor !== 'number' ||
      !Number.isInteger(rec.amountMinor) ||
      rec.amountMinor < 0
    ) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": amountMinor must be a non-negative integer`
      );
    }

    if (typeof rec.currency !== 'string' || rec.currency.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": currency must be a non-empty string`);
    }
    const expectedCurrency = offeringEntity
      ? offeringEntity.currency
      : rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
        ? 'USD'
        : undefined;
    if (expectedCurrency && rec.currency !== expectedCurrency) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": currency "${rec.currency}" does not match offering currency "${expectedCurrency}"`
      );
    }
    if (rec.consumedAt !== undefined && rec.consumedAt !== null) {
      if (typeof rec.consumedAt !== 'string' || rec.consumedAt.trim() === '') {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a non-empty string or null`
        );
      }
      if (Number.isNaN(Date.parse(rec.consumedAt))) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a valid ISO-8601 timestamp string or null. Received: "${rec.consumedAt}"`
        );
      }
    } else {
      rec.consumedAt = null;
    }
  }

  // Validate Coffee Completions
  if (!Array.isArray(candidate.coffeeCompletions)) {
    throw new Error('Invalid WorldState: coffeeCompletions must be an array');
  }

  const coffeeCompletionIdSet = new Set<string>();

  for (let i = 0; i < candidate.coffeeCompletions.length; i++) {
    const c = candidate.coffeeCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(
        `Invalid CoffeeCompletionRecord at index ${i}: record must be a non-null object`
      );
    }

    const rec = c as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord at index ${i}: id must be a non-empty string`
      );
    }

    if (coffeeCompletionIdSet.has(rec.id)) {
      throw new Error(`Duplicate coffee completion record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    coffeeCompletionIdSet.add(rec.id);

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": playerId must be a non-empty string`
      );
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": restaurantId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.startedAt !== 'string' || rec.startedAt.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": startedAt must be a non-empty string`
      );
    }
    const startedMs = Date.parse(rec.startedAt);
    if (Number.isNaN(startedMs)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": startedAt must be a valid ISO-8601 timestamp. Received: "${rec.startedAt}"`
      );
    }

    if (typeof rec.completedAt !== 'string' || rec.completedAt.trim() === '') {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt must be a non-empty string`
      );
    }
    const completedMs = Date.parse(rec.completedAt);
    if (Number.isNaN(completedMs)) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt must be a valid ISO-8601 timestamp. Received: "${rec.completedAt}"`
      );
    }

    if (completedMs < startedMs) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") must be greater than or equal to startedAt ("${rec.startedAt}")`
      );
    }

    if (completedMs - startedMs !== HAVING_COFFEE_DURATION_MS) {
      throw new Error(
        `Invalid CoffeeCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") does not match exact 15-minute duration from startedAt ("${rec.startedAt}")`
      );
    }
  }

  // Validate Acquaintances
  if (!Array.isArray(candidate.acquaintances)) {
    throw new Error('Invalid WorldState: acquaintances must be an array');
  }

  const agentIdSet = new Set<string>(agents.map((a) => a.id));
  validateAcquaintances(candidate.acquaintances as unknown[], agentIdSet);
  const acquaintances = candidate.acquaintances as Acquaintance[];

  for (const acq of acquaintances) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }

  // Validate Items
  if (!Array.isArray(candidate.items)) {
    throw new Error('Invalid WorldState: items must be an array');
  }

  const itemIdSet = new Set<string>();
  const seenSourcePurchaseIds = new Set<string>();
  const itemBySourcePurchaseId = new Map<string, Record<string, unknown>>();
  const qualifyingOfferingIds = new Set<string>(QUALIFYING_ITEM_OFFERING_IDS);

  for (let i = 0; i < candidate.items.length; i++) {
    const itemRaw = candidate.items[i];
    if (typeof itemRaw !== 'object' || itemRaw === null) {
      throw new Error(`Invalid OwnedItem at index ${i}: item must be a non-null object`);
    }

    const item = itemRaw as Record<string, unknown>;

    if (typeof item.id !== 'string' || !/^item:\d+$/.test(item.id)) {
      throw new Error(
        `Invalid OwnedItem at index ${i}: id must match format "item:<number>". Received: ${JSON.stringify(item.id)}`
      );
    }

    if (itemIdSet.has(item.id)) {
      throw new Error(`Duplicate item id found: "${item.id}"`);
    }
    if (globalIdSet.has(item.id)) {
      throw new Error(`Duplicate entity id found across collections: "${item.id}"`);
    }
    itemIdSet.add(item.id);
    globalIdSet.add(item.id);

    if (item.type !== 'item') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": type must be "item". Received: ${JSON.stringify(item.type)}`
      );
    }

    if (typeof item.offeringId !== 'string' || !qualifyingOfferingIds.has(item.offeringId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId must be a qualifying item offering. Received: ${JSON.stringify(item.offeringId)}`
      );
    }

    if (typeof item.name !== 'string' || item.name.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": name must be a non-empty string`);
    }

    if (typeof item.ownerAgentId !== 'string' || item.ownerAgentId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": ownerAgentId must be a non-empty string`);
    }
    const ownerAgent = agentMap.get(item.ownerAgentId);
    if (!ownerAgent) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" references non-existent agent`
      );
    }
    if (ownerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" is not a player (agentType: "${ownerAgent.agentType}")`
      );
    }

    if (typeof item.restaurantId !== 'string' || item.restaurantId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(item.restaurantId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof item.acquiredAt !== 'string' || item.acquiredAt.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": acquiredAt must be a non-empty string`);
    }
    const acquiredMs = Date.parse(item.acquiredAt);
    if (Number.isNaN(acquiredMs)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt must be a valid ISO-8601 timestamp string. Received: "${item.acquiredAt}"`
      );
    }

    if (item.status !== 'available' && item.status !== 'consumed') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": status must be "available" or "consumed". Received: ${JSON.stringify(item.status)}`
      );
    }

    if (item.status === 'available') {
      if (item.consumedAt !== null) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be null when status is "available". Received: ${JSON.stringify(item.consumedAt)}`
        );
      }
    } else {
      if (typeof item.consumedAt !== 'string' || item.consumedAt.trim() === '') {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a non-empty ISO-8601 timestamp when status is "consumed"`
        );
      }
      const consumedMs = Date.parse(item.consumedAt);
      if (Number.isNaN(consumedMs)) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a valid ISO-8601 timestamp string. Received: "${item.consumedAt}"`
        );
      }
      if (consumedMs < acquiredMs) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt ("${item.consumedAt}") must be greater than or equal to acquiredAt ("${item.acquiredAt}")`
        );
      }
    }

    if (typeof item.sourcePurchaseId !== 'string' || item.sourcePurchaseId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": sourcePurchaseId must be a non-empty string`);
    }

    if (seenSourcePurchaseIds.has(item.sourcePurchaseId)) {
      throw new Error(
        `Duplicate sourcePurchaseId "${item.sourcePurchaseId}" found across items (violation of 1:1 cardinality)`
      );
    }
    seenSourcePurchaseIds.add(item.sourcePurchaseId);
    itemBySourcePurchaseId.set(item.sourcePurchaseId, item);

    const sourcePurchase = purchaseIdSet.has(item.sourcePurchaseId)
      ? (candidate.purchases as PurchaseRecord[]).find((p) => p.id === item.sourcePurchaseId)
      : undefined;

    if (!sourcePurchase) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": sourcePurchaseId "${item.sourcePurchaseId}" references non-existent purchase`
      );
    }

    if (sourcePurchase.playerId !== item.ownerAgentId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" does not match purchase playerId "${sourcePurchase.playerId}"`
      );
    }
    if (sourcePurchase.offeringId !== item.offeringId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId "${item.offeringId}" does not match purchase offeringId "${sourcePurchase.offeringId}"`
      );
    }
    if (sourcePurchase.restaurantId !== item.restaurantId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" does not match purchase restaurantId "${sourcePurchase.restaurantId}"`
      );
    }
    if (sourcePurchase.worldTime !== item.acquiredAt) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt "${item.acquiredAt}" does not match purchase worldTime "${sourcePurchase.worldTime}"`
      );
    }
  }

  for (const p of candidate.purchases as PurchaseRecord[]) {
    if (qualifyingOfferingIds.has(p.offeringId)) {
      if (!itemBySourcePurchaseId.has(p.id)) {
        throw new Error(
          `Missing OwnedItem for qualifying purchase "${p.id}" (offering: "${p.offeringId}")`
        );
      }
    }
  }
}

/**
 * Migrates a valid Version 12 WorldState to Version 13.
 * Unifies coffeeCompletions into activityCompletions and populates
 * durationMs, offeringId, and truthfully resolved itemId on active player activities.
 */
export function migrateWorldStateV12ToV13(v12: WorldStateV12): WorldStateV13 {
  // 1. Map coffeeCompletions -> activityCompletions preserving legacy IDs verbatim
  const migratedCompletions: ActivityCompletionRecord[] = (v12.coffeeCompletions || []).map((c) => ({
    id: c.id,
    playerId: c.playerId,
    activity: 'having-coffee' as const,
    offeringId: 'offering:development-coffee',
    restaurantId: c.restaurantId,
    itemId: null,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
  }));

  // 2. Map agents with active legacy coffee activity
  const migratedAgents: Agent[] = v12.agents.map((agent) => {
    if (!agent.playerActivity) {
      return { ...agent };
    }

    const pa = agent.playerActivity;
    let itemId: string | null = null;

    if (pa.activity === 'having-coffee') {
      const matchingItems = (v12.items || []).filter(
        (i) =>
          i.ownerAgentId === agent.id &&
          i.restaurantId === pa.restaurantId &&
          i.offeringId === 'offering:development-coffee' &&
          i.status === 'consumed' &&
          i.consumedAt === pa.startedAt
      );

      // Section 14 rule:
      // 0 matches -> itemId = null
      // 1 match   -> itemId = matchingItem.id
      // >1 matches -> itemId = null
      if (matchingItems.length === 1) {
        itemId = matchingItems[0].id;
      }
    }

    const migratedActivity: PlayerActivityState = {
      activity: pa.activity as ConsumableActivityType,
      startedAt: pa.startedAt,
      completedAt: pa.completedAt,
      durationMs: (pa as { durationMs?: number }).durationMs ?? 900000,
      restaurantId: pa.restaurantId,
      offeringId: (pa as { offeringId?: string }).offeringId ?? 'offering:development-coffee',
      itemId:
        (pa as { itemId?: string | null }).itemId !== undefined
          ? (pa as { itemId?: string | null }).itemId!
          : itemId,
    };

    return {
      ...agent,
      playerActivity: migratedActivity,
    };
  });

  return {
    worldId: v12.worldId,
    version: 13,
    worldTime: v12.worldTime,
    places: v12.places,
    restaurants: v12.restaurants,
    agents: migratedAgents,
    offerings: v12.offerings,
    purchases: v12.purchases,
    activityCompletions: migratedCompletions,
    acquaintances: v12.acquaintances,
    items: v12.items,
  };
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 34 (Version 13) WorldState contract.
 * Preserved for pre-migration integrity checking.
 */
export function validateWorldStateV13(data: unknown): asserts data is WorldStateV13 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== 13) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version 13. Incompatible schemas must be rejected explicitly.`
    );
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  // Validate Places
  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  // Validate Restaurants referencing Buildings
  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  // Validate Agents with Place + Restaurant spatial referential integrity
  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  // Validate Offerings referencing Restaurants
  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  // Validate Global Entity ID Uniqueness across Collections
  const globalIdSet = new Set<string>();

  for (const place of places) {
    if (globalIdSet.has(place.id)) {
      throw new Error(`Duplicate entity id found across collections: "${place.id}"`);
    }
    globalIdSet.add(place.id);
  }

  for (const restaurant of restaurants) {
    if (globalIdSet.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found across collections: "${restaurant.id}"`);
    }
    globalIdSet.add(restaurant.id);
  }

  for (const agent of agents) {
    if (globalIdSet.has(agent.id)) {
      throw new Error(`Duplicate entity id found across collections: "${agent.id}"`);
    }
    globalIdSet.add(agent.id);
  }

  for (const offering of offerings) {
    if (globalIdSet.has(offering.id)) {
      throw new Error(`Duplicate entity id found across collections: "${offering.id}"`);
    }
    globalIdSet.add(offering.id);
  }

  // Validate Purchases
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }

  const purchaseIdSet = new Set<string>();
  const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));
  const restaurantMap = new Map<string, Restaurant>(restaurants.map((r) => [r.id, r]));
  const offeringMap = new Map<string, Offering>(offerings.map((o) => [o.id, o]));

  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }

    const rec = p as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(`Invalid PurchaseRecord at index ${i}: id must be a non-empty string`);
    }

    if (purchaseIdSet.has(rec.id)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id);
    globalIdSet.add(rec.id);

    if (typeof rec.worldTime !== 'string' || rec.worldTime.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": worldTime must be a non-empty string`);
    }
    if (Number.isNaN(Date.parse(rec.worldTime))) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": worldTime must be a valid ISO-8601 timestamp string. Received: "${rec.worldTime}"`
      );
    }

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": playerId must be a non-empty string`);
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": offeringId must be a non-empty string`);
    }
    const offering = offeringMap.get(rec.offeringId);
    if (!offering && rec.offeringId !== 'offering:development-pastry' && rec.offeringId !== DEVELOPMENT_PASTRY_OFFERING_ID) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": offeringId "${rec.offeringId}" references non-existent offering`
      );
    }
    if (offering && offering.restaurantId !== rec.restaurantId) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "${offering.restaurantId}", not "${rec.restaurantId}"`
      );
    }

    if (typeof rec.amountMinor !== 'number' || !Number.isInteger(rec.amountMinor) || rec.amountMinor <= 0) {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": amountMinor must be a positive integer`);
    }
    const expectedPrice = offering
      ? offering.priceMinor
      : rec.offeringId === 'offering:development-pastry' || rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
        ? 300
        : undefined;
    if (expectedPrice && rec.amountMinor !== expectedPrice) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": amountMinor ${rec.amountMinor} does not match offering priceMinor ${expectedPrice}`
      );
    }

    if (typeof rec.currency !== 'string' || rec.currency.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": currency must be a non-empty string`);
    }
    const expectedCurrency = offering
      ? offering.currency
      : rec.offeringId === 'offering:development-pastry' || rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
        ? 'USD'
        : undefined;
    if (expectedCurrency && rec.currency !== expectedCurrency) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": currency "${rec.currency}" does not match offering currency "${expectedCurrency}"`
      );
    }

    if (rec.consumedAt !== undefined && rec.consumedAt !== null) {
      if (typeof rec.consumedAt !== 'string' || rec.consumedAt.trim() === '') {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a non-empty string or null`
        );
      }
      if (Number.isNaN(Date.parse(rec.consumedAt))) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a valid ISO-8601 timestamp string or null. Received: "${rec.consumedAt}"`
        );
      }
    } else {
      rec.consumedAt = null;
    }
  }

  // Validate Activity Completions
  if (!Array.isArray(candidate.activityCompletions)) {
    throw new Error('Invalid WorldState: activityCompletions must be an array');
  }

  const activityCompletionIdSet = new Set<string>();

  for (let i = 0; i < candidate.activityCompletions.length; i++) {
    const c = candidate.activityCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(
        `Invalid ActivityCompletionRecord at index ${i}: record must be a non-null object`
      );
    }

    const rec = c as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord at index ${i}: id must be a non-empty string`
      );
    }

    if (activityCompletionIdSet.has(rec.id)) {
      throw new Error(`Duplicate activity completion record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    activityCompletionIdSet.add(rec.id);
    globalIdSet.add(rec.id);

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": playerId must be a non-empty string`
      );
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (rec.activity !== 'having-coffee' && rec.activity !== 'eating-pastry') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": activity must be "having-coffee" or "eating-pastry". Received: ${JSON.stringify(rec.activity)}`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": offeringId must be a non-empty string`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": restaurantId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (rec.itemId !== null && (typeof rec.itemId !== 'string' || rec.itemId.trim() === '')) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": itemId must be null or a non-empty string`
      );
    }

    if (typeof rec.startedAt !== 'string' || rec.startedAt.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": startedAt must be a non-empty string`
      );
    }
    const startedMs = Date.parse(rec.startedAt);
    if (Number.isNaN(startedMs)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": startedAt must be a valid ISO-8601 timestamp. Received: "${rec.startedAt}"`
      );
    }

    if (typeof rec.completedAt !== 'string' || rec.completedAt.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt must be a non-empty string`
      );
    }
    const completedMs = Date.parse(rec.completedAt);
    if (Number.isNaN(completedMs)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt must be a valid ISO-8601 timestamp. Received: "${rec.completedAt}"`
      );
    }

    if (completedMs < startedMs) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") must be greater than or equal to startedAt ("${rec.startedAt}")`
      );
    }

    const expectedDurationMs = 15 * 60 * 1000;
    if (completedMs - startedMs !== expectedDurationMs) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") does not match exact 15-minute duration from startedAt ("${rec.startedAt}")`
      );
    }
  }

  // Validate Acquaintances
  if (!Array.isArray(candidate.acquaintances)) {
    throw new Error('Invalid WorldState: acquaintances must be an array');
  }

  const agentIdSet = new Set<string>(agents.map((a) => a.id));
  validateAcquaintances(candidate.acquaintances as unknown[], agentIdSet);
  const acquaintances = candidate.acquaintances as Acquaintance[];

  for (const acq of acquaintances) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }

  // Validate Items
  if (!Array.isArray(candidate.items)) {
    throw new Error('Invalid WorldState: items must be an array');
  }

  const itemIdSet = new Set<string>();
  const seenSourcePurchaseIds = new Set<string>();
  const itemBySourcePurchaseId = new Map<string, Record<string, unknown>>();
  const qualifyingOfferingIds = new Set<string>(QUALIFYING_ITEM_OFFERING_IDS);

  for (let i = 0; i < candidate.items.length; i++) {
    const itemRaw = candidate.items[i];
    if (typeof itemRaw !== 'object' || itemRaw === null) {
      throw new Error(`Invalid OwnedItem at index ${i}: item must be a non-null object`);
    }

    const item = itemRaw as Record<string, unknown>;

    if (typeof item.id !== 'string' || !/^item:\d+$/.test(item.id)) {
      throw new Error(
        `Invalid OwnedItem at index ${i}: id must match format "item:<number>". Received: ${JSON.stringify(item.id)}`
      );
    }

    if (itemIdSet.has(item.id)) {
      throw new Error(`Duplicate item id found: "${item.id}"`);
    }
    if (globalIdSet.has(item.id)) {
      throw new Error(`Duplicate entity id found across collections: "${item.id}"`);
    }
    itemIdSet.add(item.id);
    globalIdSet.add(item.id);

    if (item.type !== 'item') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": type must be "item". Received: ${JSON.stringify(item.type)}`
      );
    }

    if (typeof item.offeringId !== 'string' || !qualifyingOfferingIds.has(item.offeringId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId must be a qualifying item offering. Received: ${JSON.stringify(item.offeringId)}`
      );
    }

    if (typeof item.name !== 'string' || item.name.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": name must be a non-empty string`);
    }

    if (typeof item.ownerAgentId !== 'string' || item.ownerAgentId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": ownerAgentId must be a non-empty string`);
    }
    const ownerAgent = agentMap.get(item.ownerAgentId);
    if (!ownerAgent) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" references non-existent agent`
      );
    }
    if (ownerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" is not a player (agentType: "${ownerAgent.agentType}")`
      );
    }

    if (typeof item.restaurantId !== 'string' || item.restaurantId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(item.restaurantId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof item.acquiredAt !== 'string' || item.acquiredAt.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": acquiredAt must be a non-empty string`);
    }
    const acquiredMs = Date.parse(item.acquiredAt);
    if (Number.isNaN(acquiredMs)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt must be a valid ISO-8601 timestamp string. Received: "${item.acquiredAt}"`
      );
    }

    if (item.status !== 'available' && item.status !== 'consumed') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": status must be "available" or "consumed". Received: ${JSON.stringify(item.status)}`
      );
    }

    if (item.status === 'available') {
      if (item.consumedAt !== null) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be null when status is "available". Received: ${JSON.stringify(item.consumedAt)}`
        );
      }
    } else {
      if (typeof item.consumedAt !== 'string' || item.consumedAt.trim() === '') {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a non-empty ISO-8601 timestamp when status is "consumed"`
        );
      }
      const consumedMs = Date.parse(item.consumedAt);
      if (Number.isNaN(consumedMs)) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a valid ISO-8601 timestamp string. Received: "${item.consumedAt}"`
        );
      }
      if (consumedMs < acquiredMs) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt ("${item.consumedAt}") must be greater than or equal to acquiredAt ("${item.acquiredAt}")`
        );
      }
    }

    if (typeof item.sourcePurchaseId !== 'string' || item.sourcePurchaseId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": sourcePurchaseId must be a non-empty string`);
    }

    if (seenSourcePurchaseIds.has(item.sourcePurchaseId)) {
      throw new Error(
        `Duplicate sourcePurchaseId "${item.sourcePurchaseId}" found across items (violation of 1:1 cardinality)`
      );
    }
    seenSourcePurchaseIds.add(item.sourcePurchaseId);
    itemBySourcePurchaseId.set(item.sourcePurchaseId, item);

    const sourcePurchase = purchaseIdSet.has(item.sourcePurchaseId)
      ? (candidate.purchases as PurchaseRecord[]).find((p) => p.id === item.sourcePurchaseId)
      : undefined;

    if (!sourcePurchase) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": sourcePurchaseId "${item.sourcePurchaseId}" references non-existent purchase`
      );
    }

    if (sourcePurchase.playerId !== item.ownerAgentId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" does not match purchase playerId "${sourcePurchase.playerId}"`
      );
    }
    if (sourcePurchase.offeringId !== item.offeringId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId "${item.offeringId}" does not match purchase offeringId "${sourcePurchase.offeringId}"`
      );
    }
    if (sourcePurchase.restaurantId !== item.restaurantId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" does not match purchase restaurantId "${sourcePurchase.restaurantId}"`
      );
    }
    if (sourcePurchase.worldTime !== item.acquiredAt) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt "${item.acquiredAt}" does not match purchase worldTime "${sourcePurchase.worldTime}"`
      );
    }
  }

  for (const p of candidate.purchases as PurchaseRecord[]) {
    if (qualifyingOfferingIds.has(p.offeringId)) {
      if (!itemBySourcePurchaseId.has(p.id)) {
        throw new Error(
          `Missing OwnedItem for qualifying purchase "${p.id}" (offering: "${p.offeringId}")`
        );
      }
    }
  }
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 35-38 (Version 14) WorldState contract.
 * Preserved for pre-migration integrity checking.
 */
export function validateWorldStateV14(data: unknown): asserts data is WorldStateV14 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== 14) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version 14. Incompatible schemas must be rejected explicitly.`
    );
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  // Validate Places
  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  // Validate Restaurants referencing Buildings
  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  // Validate Agents with Place + Restaurant spatial referential integrity
  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  // Validate Offerings referencing Restaurants
  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  // Validate Business Authority invariants (Milestone 36)
  validateBusinessAuthority(candidate as unknown as WorldState);

  for (const agent of agents) {
    if (agent.playerActivity) {
      if (!validRestaurantIds.has(agent.playerActivity.restaurantId)) {
        throw new Error(
          `Invalid playerActivity for agent "${agent.id}": restaurantId "${agent.playerActivity.restaurantId}" references non-existent restaurant`
        );
      }
      if (
        typeof agent.playerActivity.durationMs !== 'number' ||
        !Number.isInteger(agent.playerActivity.durationMs) ||
        agent.playerActivity.durationMs <= 0
      ) {
        throw new Error(
          `Invalid playerActivity durationMs for agent "${agent.id}": must be a positive integer`
        );
      }
      if (
        typeof agent.playerActivity.offeringId !== 'string' ||
        agent.playerActivity.offeringId.trim() === ''
      ) {
        throw new Error(
          `Invalid playerActivity offeringId for agent "${agent.id}": must be a non-empty string`
        );
      }
      if (
        agent.playerActivity.itemId !== null &&
        (typeof agent.playerActivity.itemId !== 'string' || agent.playerActivity.itemId.trim() === '')
      ) {
        throw new Error(
          `Invalid playerActivity itemId for agent "${agent.id}": must be a non-empty string or null`
        );
      }
      if (
        typeof agent.playerActivity.startedAt !== 'string' ||
        agent.playerActivity.startedAt.trim() === ''
      ) {
        throw new Error(
          `Invalid playerActivity startedAt for agent "${agent.id}": must be a non-empty string`
        );
      }
      if (Number.isNaN(Date.parse(agent.playerActivity.startedAt))) {
        throw new Error(
          `Invalid playerActivity startedAt for agent "${agent.id}": must be a valid ISO-8601 timestamp string. Received: "${agent.playerActivity.startedAt}"`
        );
      }
      if (
        typeof agent.playerActivity.activity !== 'string' ||
        agent.playerActivity.activity.trim() === ''
      ) {
        throw new Error(
          `Invalid playerActivity activity for agent "${agent.id}": must be a non-empty string`
        );
      }
    }
  }

  // Global ID uniqueness across collections
  const globalIdSet = new Set<string>();

  for (const p of places) {
    if (globalIdSet.has(p.id)) {
      throw new Error(`Duplicate entity id found across collections: "${p.id}"`);
    }
    globalIdSet.add(p.id);
  }

  for (const r of restaurants) {
    if (globalIdSet.has(r.id)) {
      throw new Error(`Duplicate entity id found across collections: "${r.id}"`);
    }
    globalIdSet.add(r.id);
  }

  for (const a of agents) {
    if (globalIdSet.has(a.id)) {
      throw new Error(`Duplicate entity id found across collections: "${a.id}"`);
    }
    globalIdSet.add(a.id);
  }

  for (const o of offerings) {
    if (globalIdSet.has(o.id)) {
      throw new Error(`Duplicate entity id found across collections: "${o.id}"`);
    }
    globalIdSet.add(o.id);
  }

  // Validate Purchases
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }

  const purchaseIdSet = new Set<string>();
  const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));
  const restaurantMap = new Map<string, Restaurant>(restaurants.map((r) => [r.id, r]));
  const offeringMap = new Map<string, Offering>(offerings.map((o) => [o.id, o]));

  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }

    const rec = p as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(`Invalid PurchaseRecord at index ${i}: id must be a non-empty string`);
    }

    if (purchaseIdSet.has(rec.id)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id);

    if (typeof rec.worldTime !== 'string' || rec.worldTime.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": worldTime must be a non-empty string`);
    }
    if (Number.isNaN(Date.parse(rec.worldTime))) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": worldTime must be a valid ISO-8601 timestamp. Received: "${rec.worldTime}"`
      );
    }

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": playerId must be a non-empty string`);
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": offeringId must be a non-empty string`);
    }
    const offeringEntity = offeringMap.get(rec.offeringId);
    if (!offeringEntity) {
      if (rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID) {
        if (rec.restaurantId !== 'restaurant:development-restaurant') {
          throw new Error(
            `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "restaurant:development-restaurant", not "${rec.restaurantId}"`
          );
        }
      } else {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offeringId "${rec.offeringId}" references non-existent offering`
        );
      }
    } else {
      if (offeringEntity.restaurantId !== rec.restaurantId) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "${offeringEntity.restaurantId}", not "${rec.restaurantId}"`
        );
      }
    }

    if (
      typeof rec.amountMinor !== 'number' ||
      !Number.isInteger(rec.amountMinor) ||
      rec.amountMinor < 0
    ) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": amountMinor must be a non-negative integer`
      );
    }

    if (typeof rec.currency !== 'string' || rec.currency.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": currency must be a non-empty string`);
    }
    const expectedCurrency = offeringEntity
      ? offeringEntity.currency
      : rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
        ? 'USD'
        : undefined;
    if (expectedCurrency && rec.currency !== expectedCurrency) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": currency "${rec.currency}" does not match offering currency "${expectedCurrency}"`
      );
    }
    if (rec.consumedAt !== undefined && rec.consumedAt !== null) {
      if (typeof rec.consumedAt !== 'string' || rec.consumedAt.trim() === '') {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a non-empty string or null`
        );
      }
      if (Number.isNaN(Date.parse(rec.consumedAt))) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a valid ISO-8601 timestamp string or null. Received: "${rec.consumedAt}"`
        );
      }
    } else {
      rec.consumedAt = null;
    }
  }

  // Validate Activity Completions
  if (!Array.isArray(candidate.activityCompletions)) {
    throw new Error('Invalid WorldState: activityCompletions must be an array');
  }

  const activityCompletionIdSet = new Set<string>();

  for (let i = 0; i < candidate.activityCompletions.length; i++) {
    const c = candidate.activityCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(
        `Invalid ActivityCompletionRecord at index ${i}: record must be a non-null object`
      );
    }

    const rec = c as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord at index ${i}: id must be a non-empty string`
      );
    }

    if (activityCompletionIdSet.has(rec.id)) {
      throw new Error(`Duplicate activity completion record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    activityCompletionIdSet.add(rec.id);
    globalIdSet.add(rec.id);

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": playerId must be a non-empty string`
      );
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.activity !== 'string' || rec.activity.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": activity must be a non-empty string`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": offeringId must be a non-empty string`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": restaurantId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (
      rec.itemId !== null &&
      (typeof rec.itemId !== 'string' || rec.itemId.trim() === '')
    ) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": itemId must be a non-empty string or null`
      );
    }

    if (typeof rec.startedAt !== 'string' || rec.startedAt.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": startedAt must be a non-empty string`
      );
    }
    if (Number.isNaN(Date.parse(rec.startedAt))) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": startedAt must be a valid ISO-8601 timestamp string. Received: "${rec.startedAt}"`
      );
    }

    if (typeof rec.completedAt !== 'string' || rec.completedAt.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt must be a non-empty string`
      );
    }
    if (Number.isNaN(Date.parse(rec.completedAt))) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt must be a valid ISO-8601 timestamp string. Received: "${rec.completedAt}"`
      );
    }

    const startedMs = Date.parse(rec.startedAt);
    const completedMs = Date.parse(rec.completedAt);
    if (completedMs < startedMs) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") must be greater than or equal to startedAt ("${rec.startedAt}")`
      );
    }
  }

  // Validate Acquaintances
  validateAcquaintances(candidate.acquaintances as unknown[]);

  // Validate Items
  if (!Array.isArray(candidate.items)) {
    throw new Error('Invalid WorldState: items must be an array');
  }

  const itemIdSet = new Set<string>();
  const seenSourcePurchaseIds = new Set<string>();
  const itemBySourcePurchaseId = new Map<string, Record<string, unknown>>();
  const qualifyingOfferingIds = new Set<string>(QUALIFYING_ITEM_OFFERING_IDS);

  for (let i = 0; i < candidate.items.length; i++) {
    const itemRaw = candidate.items[i];
    if (typeof itemRaw !== 'object' || itemRaw === null) {
      throw new Error(`Invalid OwnedItem at index ${i}: item must be a non-null object`);
    }

    const item = itemRaw as Record<string, unknown>;

    if (typeof item.id !== 'string' || !/^item:\d+$/.test(item.id)) {
      throw new Error(
        `Invalid OwnedItem at index ${i}: id must match format "item:<number>". Received: ${JSON.stringify(item.id)}`
      );
    }

    if (itemIdSet.has(item.id)) {
      throw new Error(`Duplicate item id found: "${item.id}"`);
    }
    if (globalIdSet.has(item.id)) {
      throw new Error(`Duplicate entity id found across collections: "${item.id}"`);
    }
    itemIdSet.add(item.id);
    globalIdSet.add(item.id);

    if (item.type !== 'item') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": type must be "item". Received: ${JSON.stringify(item.type)}`
      );
    }

    if (typeof item.offeringId !== 'string' || !qualifyingOfferingIds.has(item.offeringId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId must be a qualifying item offering. Received: ${JSON.stringify(item.offeringId)}`
      );
    }

    if (typeof item.name !== 'string' || item.name.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": name must be a non-empty string`);
    }

    if (typeof item.ownerAgentId !== 'string' || item.ownerAgentId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": ownerAgentId must be a non-empty string`);
    }
    const ownerAgent = agentMap.get(item.ownerAgentId);
    if (!ownerAgent) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" references non-existent agent`
      );
    }
    if (ownerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" is not a player (agentType: "${ownerAgent.agentType}")`
      );
    }

    if (typeof item.restaurantId !== 'string' || item.restaurantId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(item.restaurantId)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof item.acquiredAt !== 'string' || item.acquiredAt.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": acquiredAt must be a non-empty string`);
    }
    const acquiredMs = Date.parse(item.acquiredAt);
    if (Number.isNaN(acquiredMs)) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt must be a valid ISO-8601 timestamp string. Received: "${item.acquiredAt}"`
      );
    }

    if (item.status !== 'available' && item.status !== 'consumed') {
      throw new Error(
        `Invalid OwnedItem "${item.id}": status must be "available" or "consumed". Received: ${JSON.stringify(item.status)}`
      );
    }

    if (item.status === 'available') {
      if (item.consumedAt !== null) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be null when status is "available". Received: ${JSON.stringify(item.consumedAt)}`
        );
      }
    } else {
      if (typeof item.consumedAt !== 'string' || item.consumedAt.trim() === '') {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a non-empty ISO-8601 timestamp when status is "consumed"`
        );
      }
      const consumedMs = Date.parse(item.consumedAt);
      if (Number.isNaN(consumedMs)) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt must be a valid ISO-8601 timestamp string. Received: "${item.consumedAt}"`
        );
      }
      if (consumedMs < acquiredMs) {
        throw new Error(
          `Invalid OwnedItem "${item.id}": consumedAt ("${item.consumedAt}") must be greater than or equal to acquiredAt ("${item.acquiredAt}")`
        );
      }
    }

    if (typeof item.sourcePurchaseId !== 'string' || item.sourcePurchaseId.trim() === '') {
      throw new Error(`Invalid OwnedItem "${item.id}": sourcePurchaseId must be a non-empty string`);
    }

    if (seenSourcePurchaseIds.has(item.sourcePurchaseId)) {
      throw new Error(
        `Duplicate sourcePurchaseId "${item.sourcePurchaseId}" found across items (violation of 1:1 cardinality)`
      );
    }
    seenSourcePurchaseIds.add(item.sourcePurchaseId);
    itemBySourcePurchaseId.set(item.sourcePurchaseId, item);

    const sourcePurchase = purchaseIdSet.has(item.sourcePurchaseId)
      ? (candidate.purchases as PurchaseRecord[]).find((p) => p.id === item.sourcePurchaseId)
      : undefined;

    if (!sourcePurchase) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": sourcePurchaseId "${item.sourcePurchaseId}" references non-existent purchase`
      );
    }

    if (sourcePurchase.playerId !== item.ownerAgentId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": ownerAgentId "${item.ownerAgentId}" does not match purchase playerId "${sourcePurchase.playerId}"`
      );
    }
    if (sourcePurchase.offeringId !== item.offeringId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": offeringId "${item.offeringId}" does not match purchase offeringId "${sourcePurchase.offeringId}"`
      );
    }
    if (sourcePurchase.restaurantId !== item.restaurantId) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": restaurantId "${item.restaurantId}" does not match purchase restaurantId "${sourcePurchase.restaurantId}"`
      );
    }
    if (sourcePurchase.worldTime !== item.acquiredAt) {
      throw new Error(
        `Invalid OwnedItem "${item.id}": acquiredAt "${item.acquiredAt}" does not match purchase worldTime "${sourcePurchase.worldTime}"`
      );
    }
  }

  // Direction B check: Every qualifying PurchaseRecord must have exactly one OwnedItem
  for (const p of candidate.purchases as PurchaseRecord[]) {
    if (qualifyingOfferingIds.has(p.offeringId)) {
      if (!itemBySourcePurchaseId.has(p.id)) {
        throw new Error(
          `Missing OwnedItem for qualifying purchase "${p.id}" (offering: "${p.offeringId}")`
        );
      }
    }
  }

  // Validate Item Authority domain invariants (Milestone 37)
  validateItemAuthority(candidate as unknown as ItemWorldState);

  // Validate Knowledge
  if (!Array.isArray(candidate.knowledge)) {
    throw new Error('Invalid WorldState: knowledge must be an array');
  }

  const knowledgeIdSet = new Set<string>();
  const seenCompositeKeys = new Set<string>();

  for (let i = 0; i < candidate.knowledge.length; i++) {
    const recRaw = candidate.knowledge[i];
    if (typeof recRaw !== 'object' || recRaw === null) {
      throw new Error(`Invalid AgentKnowledgeRecord at index ${i}: record must be a non-null object`);
    }

    const rec = recRaw as Record<string, unknown>;

    if (
      typeof rec.id !== 'string' ||
      !/^knowledge:[a-z0-9-]+(:[a-z0-9-]+)*$/.test(rec.id)
    ) {
      throw new Error(
        `Invalid AgentKnowledgeRecord at index ${i}: id must match format "knowledge:<identifier>". Received: ${JSON.stringify(rec.id)}`
      );
    }

    if (knowledgeIdSet.has(rec.id)) {
      throw new Error(`Duplicate knowledge id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    knowledgeIdSet.add(rec.id);
    globalIdSet.add(rec.id);

    if (typeof rec.agentId !== 'string' || rec.agentId.trim() === '') {
      throw new Error(`Invalid AgentKnowledgeRecord "${rec.id}": agentId must be a non-empty string`);
    }
    const knowerAgent = agentMap.get(rec.agentId);
    if (!knowerAgent) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": agentId "${rec.agentId}" references non-existent agent`
      );
    }
    if (knowerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": agentId "${rec.agentId}" is not a player (agentType: "${knowerAgent.agentType}")`
      );
    }

    if (rec.factType !== 'agent-schedule') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": factType must be "agent-schedule". Received: ${JSON.stringify(rec.factType)}`
      );
    }

    if (typeof rec.subjectId !== 'string' || rec.subjectId.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": subjectId must be a non-empty string`
      );
    }
    const subjectAgent = agentMap.get(rec.subjectId);
    if (!subjectAgent) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": subjectId "${rec.subjectId}" references non-existent agent`
      );
    }
    if (subjectAgent.agentType !== 'npc') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": subjectId "${rec.subjectId}" is not an NPC (agentType: "${subjectAgent.agentType}")`
      );
    }

    if (typeof rec.source !== 'string' || rec.source !== 'social-inquiry') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": source must be "social-inquiry". Received: ${JSON.stringify(rec.source)}`
      );
    }

    if (typeof rec.sourceAgentId !== 'string' || rec.sourceAgentId.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": sourceAgentId must be a non-empty string`
      );
    }
    const informantAgent = agentMap.get(rec.sourceAgentId);
    if (!informantAgent) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": sourceAgentId "${rec.sourceAgentId}" references non-existent agent`
      );
    }
    if (informantAgent.agentType !== 'npc') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": sourceAgentId "${rec.sourceAgentId}" is not an NPC (agentType: "${informantAgent.agentType}")`
      );
    }

    if (typeof rec.acquiredAt !== 'string' || rec.acquiredAt.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": acquiredAt must be a non-empty string`
      );
    }
    const acquiredMs = Date.parse(rec.acquiredAt);
    if (Number.isNaN(acquiredMs)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": acquiredAt must be a valid ISO-8601 timestamp string. Received: "${rec.acquiredAt}"`
      );
    }

    if (typeof rec.lastVerifiedAt !== 'string' || rec.lastVerifiedAt.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": lastVerifiedAt must be a non-empty string`
      );
    }
    const lastVerifiedMs = Date.parse(rec.lastVerifiedAt);
    if (Number.isNaN(lastVerifiedMs)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": lastVerifiedAt must be a valid ISO-8601 timestamp string. Received: "${rec.lastVerifiedAt}"`
      );
    }
    if (lastVerifiedMs < acquiredMs) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": lastVerifiedAt ("${rec.lastVerifiedAt}") must be greater than or equal to acquiredAt ("${rec.acquiredAt}")`
      );
    }

    if (typeof rec.payload !== 'object' || rec.payload === null) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload must be a non-null object`
      );
    }
    const payload = rec.payload as Record<string, unknown>;

    if (typeof payload.workplaceId !== 'string' || payload.workplaceId.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.workplaceId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(payload.workplaceId)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.workplaceId "${payload.workplaceId}" references non-existent restaurant`
      );
    }

    if (typeof payload.shiftStart !== 'string' || !/^\d{2}:\d{2}$/.test(payload.shiftStart)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.shiftStart must be a "HH:MM" string. Received: ${JSON.stringify(payload.shiftStart)}`
      );
    }

    if (typeof payload.shiftEnd !== 'string' || !/^\d{2}:\d{2}$/.test(payload.shiftEnd)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.shiftEnd must be a "HH:MM" string. Received: ${JSON.stringify(payload.shiftEnd)}`
      );
    }

    const compositeKey = `${rec.agentId}::${rec.factType}::${rec.subjectId}`;
    if (seenCompositeKeys.has(compositeKey)) {
      throw new Error(
        `Duplicate knowledge fact found for agent "${rec.agentId}", factType "${rec.factType}", subjectId "${rec.subjectId}"`
      );
    }
    seenCompositeKeys.add(compositeKey);
  }
}

/**
 * Migrates a valid Version 13 WorldState to Version 14.
 * Initializes the persistent knowledge collection to an empty array (zero-fabrication).
 */
export function migrateWorldStateV13ToV14(v13: WorldStateV13): WorldStateV14 {
  return {
    worldId: v13.worldId,
    version: 14,
    worldTime: v13.worldTime,
    places: v13.places,
    restaurants: v13.restaurants,
    agents: v13.agents,
    offerings: v13.offerings,
    purchases: v13.purchases,
    activityCompletions: v13.activityCompletions,
    acquaintances: v13.acquaintances,
    items: v13.items,
    knowledge: [],
  };
}

/**
 * Migrates a valid Version 14 WorldState to Version 15.
 * Initializes the persistent orders collection to an empty array (zero-fabrication).
 */
export function migrateWorldStateV14ToV15(v14: WorldStateV14): WorldStateV15 {
  return {
    worldId: v14.worldId,
    version: 15,
    worldTime: v14.worldTime,
    places: v14.places,
    restaurants: v14.restaurants,
    agents: v14.agents,
    offerings: v14.offerings,
    purchases: v14.purchases,
    activityCompletions: v14.activityCompletions,
    acquaintances: v14.acquaintances,
    items: v14.items,
    knowledge: v14.knowledge,
    orders: [],
  };
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 39-45 (Version 15) WorldState contract.
 * Preserved for pre-migration integrity checking.
 */
export function validateWorldStateV15(data: unknown): asserts data is WorldStateV15 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== 15) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version 15. Incompatible schemas must be rejected explicitly.`
    );
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  // Validate Places
  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  // Validate Restaurants referencing Buildings
  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  // Validate Agents with Place + Restaurant spatial referential integrity
  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  // Validate Offerings referencing Restaurants
  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  // Validate Business Authority invariants (Milestone 36)
  validateBusinessAuthority(candidate as unknown as WorldState);

  for (const agent of agents) {
    if (agent.playerActivity) {
      if (!validRestaurantIds.has(agent.playerActivity.restaurantId)) {
        throw new Error(
          `Invalid playerActivity for agent "${agent.id}": restaurantId "${agent.playerActivity.restaurantId}" references non-existent restaurant`
        );
      }
      if (
        typeof agent.playerActivity.durationMs !== 'number' ||
        !Number.isInteger(agent.playerActivity.durationMs) ||
        agent.playerActivity.durationMs <= 0
      ) {
        throw new Error(
          `Invalid playerActivity durationMs for agent "${agent.id}": must be a positive integer`
        );
      }
      if (
        typeof agent.playerActivity.offeringId !== 'string' ||
        agent.playerActivity.offeringId.trim() === ''
      ) {
        throw new Error(
          `Invalid playerActivity offeringId for agent "${agent.id}": must be a non-empty string`
        );
      }
      if (
        agent.playerActivity.itemId !== null &&
        (typeof agent.playerActivity.itemId !== 'string' || agent.playerActivity.itemId.trim() === '')
      ) {
        throw new Error(
          `Invalid playerActivity itemId for agent "${agent.id}": must be null or a non-empty string`
        );
      }
    }
  }

  // Global ID uniqueness across all entity collections
  const globalIdSet = new Set<string>();
  for (const place of places) {
    globalIdSet.add(place.id);
  }
  for (const restaurant of restaurants) {
    if (globalIdSet.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found across collections: "${restaurant.id}"`);
    }
    globalIdSet.add(restaurant.id);
  }
  for (const agent of agents) {
    if (globalIdSet.has(agent.id)) {
      throw new Error(`Duplicate entity id found across collections: "${agent.id}"`);
    }
    globalIdSet.add(agent.id);
  }
  for (const offering of offerings) {
    if (globalIdSet.has(offering.id)) {
      throw new Error(`Duplicate entity id found across collections: "${offering.id}"`);
    }
    globalIdSet.add(offering.id);
  }

  // Validate Purchases
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }

  const agentMap = new Map<string, Agent>(agents.map((a) => [a.id, a]));
  const restaurantMap = new Map<string, Restaurant>(restaurants.map((r) => [r.id, r]));
  const offeringMap = new Map<string, Offering>(offerings.map((o) => [o.id, o]));
  const purchaseIdSet = new Set<string>();

  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }

    const rec = p as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(`Invalid PurchaseRecord at index ${i}: id must be a non-empty string`);
    }

    if (purchaseIdSet.has(rec.id)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id);

    if (typeof rec.worldTime !== 'string' || rec.worldTime.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": worldTime must be a non-empty string`);
    }
    if (Number.isNaN(Date.parse(rec.worldTime))) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": worldTime must be a valid ISO-8601 timestamp. Received: "${rec.worldTime}"`
      );
    }

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": playerId must be a non-empty string`);
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": restaurantId must be a non-empty string`);
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": offeringId must be a non-empty string`);
    }
    const offeringEntity = offeringMap.get(rec.offeringId);
    if (!offeringEntity) {
      if (rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID) {
        if (rec.restaurantId !== 'restaurant:development-restaurant') {
          throw new Error(
            `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "restaurant:development-restaurant", not "${rec.restaurantId}"`
          );
        }
      } else {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offeringId "${rec.offeringId}" references non-existent offering`
        );
      }
    } else {
      if (offeringEntity.restaurantId !== rec.restaurantId) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": offering "${rec.offeringId}" belongs to restaurant "${offeringEntity.restaurantId}", not "${rec.restaurantId}"`
        );
      }
    }

    if (
      typeof rec.amountMinor !== 'number' ||
      !Number.isInteger(rec.amountMinor) ||
      rec.amountMinor < 0
    ) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": amountMinor must be a non-negative integer`
      );
    }

    if (typeof rec.currency !== 'string' || rec.currency.trim() === '') {
      throw new Error(`Invalid PurchaseRecord "${rec.id}": currency must be a non-empty string`);
    }
    const expectedCurrency = offeringEntity
      ? offeringEntity.currency
      : rec.offeringId === DEVELOPMENT_PASTRY_OFFERING_ID
        ? 'USD'
        : undefined;
    if (expectedCurrency && rec.currency !== expectedCurrency) {
      throw new Error(
        `Invalid PurchaseRecord "${rec.id}": currency "${rec.currency}" does not match offering currency "${expectedCurrency}"`
      );
    }
    if (rec.consumedAt !== undefined && rec.consumedAt !== null) {
      if (typeof rec.consumedAt !== 'string' || rec.consumedAt.trim() === '') {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a non-empty string or null`
        );
      }
      if (Number.isNaN(Date.parse(rec.consumedAt))) {
        throw new Error(
          `Invalid PurchaseRecord "${rec.id}": consumedAt must be a valid ISO-8601 timestamp string or null. Received: "${rec.consumedAt}"`
        );
      }
    }
  }

  // Validate Activity Completions
  if (!Array.isArray(candidate.activityCompletions)) {
    throw new Error('Invalid WorldState: activityCompletions must be an array');
  }

  const activityCompletionIdSet = new Set<string>();

  for (let i = 0; i < candidate.activityCompletions.length; i++) {
    const c = candidate.activityCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(
        `Invalid ActivityCompletionRecord at index ${i}: record must be a non-null object`
      );
    }

    const rec = c as Record<string, unknown>;

    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord at index ${i}: id must be a non-empty string`
      );
    }

    if (activityCompletionIdSet.has(rec.id)) {
      throw new Error(`Duplicate activity completion record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    activityCompletionIdSet.add(rec.id);

    if (typeof rec.playerId !== 'string' || rec.playerId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": playerId must be a non-empty string`
      );
    }
    const playerAgent = agentMap.get(rec.playerId);
    if (!playerAgent) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": playerId "${rec.playerId}" references non-existent agent`
      );
    }
    if (playerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": agent "${rec.playerId}" is not a player (agentType: "${playerAgent.agentType}")`
      );
    }

    if (rec.activity !== 'having-coffee' && rec.activity !== 'eating-pastry') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": activity must be "having-coffee" or "eating-pastry". Received: ${JSON.stringify(rec.activity)}`
      );
    }

    if (typeof rec.restaurantId !== 'string' || rec.restaurantId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": restaurantId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(rec.restaurantId)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": restaurantId "${rec.restaurantId}" references non-existent restaurant`
      );
    }

    if (typeof rec.offeringId !== 'string' || rec.offeringId.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": offeringId must be a non-empty string`
      );
    }
    const expectedOfferingId =
      rec.activity === 'having-coffee'
        ? 'offering:development-coffee'
        : 'offering:development-pastry';
    if (rec.offeringId !== expectedOfferingId) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": offeringId "${rec.offeringId}" does not match activity "${rec.activity}". Expected "${expectedOfferingId}"`
      );
    }

    if (typeof rec.startedAt !== 'string' || rec.startedAt.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": startedAt must be a non-empty string`
      );
    }
    const startedMs = Date.parse(rec.startedAt);
    if (Number.isNaN(startedMs)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": startedAt must be a valid ISO-8601 timestamp. Received: "${rec.startedAt}"`
      );
    }

    if (typeof rec.completedAt !== 'string' || rec.completedAt.trim() === '') {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt must be a non-empty string`
      );
    }
    const completedMs = Date.parse(rec.completedAt);
    if (Number.isNaN(completedMs)) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt must be a valid ISO-8601 timestamp. Received: "${rec.completedAt}"`
      );
    }

    if (completedMs < startedMs) {
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") must be greater than or equal to startedAt ("${rec.startedAt}")`
      );
    }

    const expectedDurationMs =
      rec.activity === 'having-coffee'
        ? HAVING_COFFEE_DURATION_MS
        : EATING_PASTRY_DURATION_MS;
    if (completedMs - startedMs !== expectedDurationMs) {
      const minutes = expectedDurationMs / (60 * 1000);
      throw new Error(
        `Invalid ActivityCompletionRecord "${rec.id}": completedAt ("${rec.completedAt}") does not match exact ${minutes}-minute duration from startedAt ("${rec.startedAt}")`
      );
    }
  }

  // Validate Acquaintances
  if (!Array.isArray(candidate.acquaintances)) {
    throw new Error('Invalid WorldState: acquaintances must be an array');
  }

  const agentIdSet = new Set<string>(agents.map((a) => a.id));
  validateAcquaintances(candidate.acquaintances as unknown[], agentIdSet);
  const acquaintances = candidate.acquaintances as Acquaintance[];

  for (const acq of acquaintances) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }

  // Validate Item Authority domain invariants (Milestone 37)
  validateItemAuthority(candidate as unknown as ItemWorldState);

  // Validate Knowledge
  if (!Array.isArray(candidate.knowledge)) {
    throw new Error('Invalid WorldState: knowledge must be an array');
  }

  const knowledgeIdSet = new Set<string>();
  const seenCompositeKeys = new Set<string>();

  for (let i = 0; i < candidate.knowledge.length; i++) {
    const recRaw = candidate.knowledge[i];
    if (typeof recRaw !== 'object' || recRaw === null) {
      throw new Error(`Invalid AgentKnowledgeRecord at index ${i}: record must be a non-null object`);
    }

    const rec = recRaw as Record<string, unknown>;

    if (
      typeof rec.id !== 'string' ||
      !/^knowledge:[a-z0-9-]+(:[a-z0-9-]+)*$/.test(rec.id)
    ) {
      throw new Error(
        `Invalid AgentKnowledgeRecord at index ${i}: id must match format "knowledge:<identifier>". Received: ${JSON.stringify(rec.id)}`
      );
    }

    if (knowledgeIdSet.has(rec.id)) {
      throw new Error(`Duplicate knowledge id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    knowledgeIdSet.add(rec.id);
    globalIdSet.add(rec.id);

    if (typeof rec.agentId !== 'string' || rec.agentId.trim() === '') {
      throw new Error(`Invalid AgentKnowledgeRecord "${rec.id}": agentId must be a non-empty string`);
    }
    const knowerAgent = agentMap.get(rec.agentId);
    if (!knowerAgent) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": agentId "${rec.agentId}" references non-existent agent`
      );
    }
    if (knowerAgent.agentType !== 'player') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": agentId "${rec.agentId}" is not a player (agentType: "${knowerAgent.agentType}")`
      );
    }

    if (rec.factType !== 'agent-schedule') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": factType must be "agent-schedule". Received: ${JSON.stringify(rec.factType)}`
      );
    }

    if (typeof rec.subjectId !== 'string' || rec.subjectId.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": subjectId must be a non-empty string`
      );
    }
    const subjectAgent = agentMap.get(rec.subjectId);
    if (!subjectAgent) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": subjectId "${rec.subjectId}" references non-existent agent`
      );
    }
    if (subjectAgent.agentType !== 'npc') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": subjectId "${rec.subjectId}" is not an NPC (agentType: "${subjectAgent.agentType}")`
      );
    }

    // In V15, source must be strictly 'social-inquiry'
    if (rec.source !== 'social-inquiry') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": source must be "social-inquiry". Received: ${JSON.stringify(rec.source)}`
      );
    }

    if (typeof rec.sourceAgentId !== 'string' || rec.sourceAgentId.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": sourceAgentId must be a non-empty string`
      );
    }
    const sourceAgent = agentMap.get(rec.sourceAgentId);
    if (!sourceAgent) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": sourceAgentId "${rec.sourceAgentId}" references non-existent agent`
      );
    }
    if (sourceAgent.agentType !== 'npc') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": sourceAgentId "${rec.sourceAgentId}" is not an NPC (agentType: "${sourceAgent.agentType}")`
      );
    }

    if (typeof rec.acquiredAt !== 'string' || rec.acquiredAt.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": acquiredAt must be a non-empty string`
      );
    }
    const acquiredMs = Date.parse(rec.acquiredAt);
    if (Number.isNaN(acquiredMs)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": acquiredAt must be a valid ISO-8601 timestamp string. Received: "${rec.acquiredAt}"`
      );
    }

    if (typeof rec.lastVerifiedAt !== 'string' || rec.lastVerifiedAt.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": lastVerifiedAt must be a non-empty string`
      );
    }
    const lastVerifiedMs = Date.parse(rec.lastVerifiedAt);
    if (Number.isNaN(lastVerifiedMs)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": lastVerifiedAt must be a valid ISO-8601 timestamp string. Received: "${rec.lastVerifiedAt}"`
      );
    }
    if (lastVerifiedMs < acquiredMs) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": lastVerifiedAt ("${rec.lastVerifiedAt}") must be greater than or equal to acquiredAt ("${rec.acquiredAt}")`
      );
    }

    if (typeof rec.payload !== 'object' || rec.payload === null) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload must be a non-null object`
      );
    }
    const payload = rec.payload as Record<string, unknown>;

    if (typeof payload.workplaceId !== 'string' || payload.workplaceId.trim() === '') {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.workplaceId must be a non-empty string`
      );
    }
    if (!restaurantMap.has(payload.workplaceId)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.workplaceId "${payload.workplaceId}" references non-existent restaurant`
      );
    }

    if (typeof payload.shiftStart !== 'string' || !/^\d{2}:\d{2}$/.test(payload.shiftStart)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.shiftStart must be a "HH:MM" string. Received: ${JSON.stringify(payload.shiftStart)}`
      );
    }

    if (typeof payload.shiftEnd !== 'string' || !/^\d{2}:\d{2}$/.test(payload.shiftEnd)) {
      throw new Error(
        `Invalid AgentKnowledgeRecord "${rec.id}": payload.shiftEnd must be a "HH:MM" string. Received: ${JSON.stringify(payload.shiftEnd)}`
      );
    }

    const compositeKey = `${rec.agentId}::${rec.factType}::${rec.subjectId}`;
    if (seenCompositeKeys.has(compositeKey)) {
      throw new Error(
        `Duplicate knowledge fact found for agent "${rec.agentId}", factType "${rec.factType}", subjectId "${rec.subjectId}"`
      );
    }
    seenCompositeKeys.add(compositeKey);
  }

  // Validate Orders
  if (!Array.isArray(candidate.orders)) {
    throw new Error('Invalid WorldState: orders must be an array');
  }

  for (let i = 0; i < candidate.orders.length; i++) {
    const o = candidate.orders[i];
    if (typeof o === 'object' && o !== null && typeof (o as Record<string, unknown>).id === 'string') {
      const orderId = (o as Record<string, unknown>).id as string;
      if (globalIdSet.has(orderId)) {
        throw new Error(`Duplicate entity id found across collections: "${orderId}"`);
      }
      globalIdSet.add(orderId);
    }
  }

  validateOrderAuthority(candidate as unknown as OrderWorldState);
}

/**
 * Migrates a valid Version 15 WorldState to Version 16.
 * Preserves all collections and entity data. The only change is version: 16.
 */
export function migrateWorldStateV15ToV16(v15: WorldStateV15): WorldStateV16 {
  return {
    worldId: v15.worldId,
    version: 16,
    worldTime: v15.worldTime,
    places: v15.places,
    restaurants: v15.restaurants,
    agents: v15.agents,
    offerings: v15.offerings,
    purchases: v15.purchases,
    activityCompletions: v15.activityCompletions,
    acquaintances: v15.acquaintances,
    items: v15.items,
    knowledge: v15.knowledge,
    orders: v15.orders,
  };
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 46-55 (Version 16) WorldState contract.
 * Preserved for pre-migration integrity checking.
 */
export function validateWorldStateV16(data: unknown): asserts data is WorldStateV16 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== 16) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version 16. Incompatible schemas must be rejected explicitly.`
    );
  }

  // Version 16 must strictly NOT contain properties
  if ('properties' in candidate) {
    throw new Error('Invalid WorldState: properties collection must not exist in version 16 schema');
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  validateBusinessAuthority(candidate as unknown as WorldState);

  for (const agent of agents) {
    if (agent.playerActivity) {
      if (!validRestaurantIds.has(agent.playerActivity.restaurantId)) {
        throw new Error(
          `Invalid playerActivity for agent "${agent.id}": restaurantId "${agent.playerActivity.restaurantId}" references non-existent restaurant`
        );
      }
      if (
        typeof agent.playerActivity.durationMs !== 'number' ||
        !Number.isInteger(agent.playerActivity.durationMs) ||
        agent.playerActivity.durationMs <= 0
      ) {
        throw new Error(
          `Invalid playerActivity durationMs for agent "${agent.id}": must be a positive integer`
        );
      }
      if (
        typeof agent.playerActivity.offeringId !== 'string' ||
        agent.playerActivity.offeringId.trim() === ''
      ) {
        throw new Error(
          `Invalid playerActivity offeringId for agent "${agent.id}": must be a non-empty string`
        );
      }
      if (
        agent.playerActivity.itemId !== null &&
        (typeof agent.playerActivity.itemId !== 'string' || agent.playerActivity.itemId.trim() === '')
      ) {
        throw new Error(
          `Invalid playerActivity itemId for agent "${agent.id}": must be a non-empty string or null`
        );
      }
      if (
        agent.playerActivity.companionAgentId !== undefined &&
        agent.playerActivity.companionAgentId !== null
      ) {
        if (
          typeof agent.playerActivity.companionAgentId !== 'string' ||
          agent.playerActivity.companionAgentId.trim() === ''
        ) {
          throw new Error(
            `Invalid playerActivity companionAgentId for agent "${agent.id}": must be a non-empty string or null`
          );
        }
      }
    }
  }

  // Global ID set
  const globalIdSet = new Set<string>();
  for (const place of places) globalIdSet.add(place.id);
  for (const restaurant of restaurants) globalIdSet.add(restaurant.id);
  for (const agent of agents) globalIdSet.add(agent.id);
  for (const offering of offerings) globalIdSet.add(offering.id);

  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }

  const purchaseIdSet = new Set<string>();
  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }
    const rec = p as Record<string, unknown>;
    validateEntityId(rec.id);
    if (purchaseIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id as string);
    globalIdSet.add(rec.id as string);
  }

  if (!Array.isArray(candidate.activityCompletions)) {
    throw new Error('Invalid WorldState: activityCompletions must be an array');
  }
  for (let i = 0; i < candidate.activityCompletions.length; i++) {
    const c = candidate.activityCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(`Invalid ActivityCompletionRecord at index ${i}: record must be a non-null object`);
    }
    const rec = c as Record<string, unknown>;
    validateEntityId(rec.id);
    if (globalIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    globalIdSet.add(rec.id as string);
  }

  validateAcquaintances(candidate.acquaintances as unknown[]);
  for (const acq of candidate.acquaintances as Acquaintance[]) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }

  validateItemAuthority(candidate as unknown as ItemWorldState);
  if (Array.isArray(candidate.items)) {
    for (const item of candidate.items as OwnedItem[]) {
      if (globalIdSet.has(item.id)) {
        throw new Error(`Duplicate entity id found across collections: "${item.id}"`);
      }
      globalIdSet.add(item.id);
    }
  }

  if (!Array.isArray(candidate.knowledge)) {
    throw new Error('Invalid WorldState: knowledge must be an array');
  }
  for (let i = 0; i < candidate.knowledge.length; i++) {
    const k = candidate.knowledge[i];
    if (typeof k !== 'object' || k === null) {
      throw new Error(`Invalid AgentKnowledgeRecord at index ${i}: record must be a non-null object`);
    }
    const rec = k as Record<string, unknown>;
    validateEntityId(rec.id);
    if (globalIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    globalIdSet.add(rec.id as string);
  }

  if (!Array.isArray(candidate.orders)) {
    throw new Error('Invalid WorldState: orders must be an array');
  }
  for (let i = 0; i < candidate.orders.length; i++) {
    const o = candidate.orders[i];
    if (typeof o === 'object' && o !== null && typeof (o as Record<string, unknown>).id === 'string') {
      const orderId = (o as Record<string, unknown>).id as string;
      if (globalIdSet.has(orderId)) {
        throw new Error(`Duplicate entity id found across collections: "${orderId}"`);
      }
      globalIdSet.add(orderId);
    }
  }
  validateOrderAuthority(candidate as unknown as OrderWorldState);
}

/**
 * Migrates a valid Version 16 WorldState to Version 17.
 * Initializes explicitly designated properties in the unassigned state for existing buildings.
 */
export function migrateWorldStateV16ToV17(v16: WorldStateV16): WorldStateV17 {
  return {
    worldId: v16.worldId,
    version: 17,
    worldTime: v16.worldTime,
    places: v16.places,
    restaurants: v16.restaurants,
    agents: v16.agents,
    offerings: v16.offerings,
    purchases: v16.purchases,
    activityCompletions: v16.activityCompletions,
    acquaintances: v16.acquaintances,
    items: v16.items,
    knowledge: v16.knowledge,
    orders: v16.orders,
    properties: createInitialPropertiesForPlaces(v16.places),
  };
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 56 (Version 17) WorldState contract.
 * Preserved for pre-migration integrity checking.
 */
export function validateWorldStateV17(data: unknown): asserts data is WorldStateV17 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== 17) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version 17. Incompatible schemas must be rejected explicitly.`
    );
  }

  // Version 17 must strictly NOT contain siteAgentAssociations
  if ('siteAgentAssociations' in candidate) {
    throw new Error('Invalid WorldState: siteAgentAssociations collection must not exist in version 17 schema');
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  // Validate Places
  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  // Validate Restaurants referencing Buildings
  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  // Validate Agents with Place + Restaurant spatial referential integrity
  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as Agent[];

  // Validate Offerings referencing Restaurants
  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  // Validate Business Authority invariants
  validateBusinessAuthority(candidate as unknown as WorldState);

  // Global ID uniqueness across all entity collections
  const globalIdSet = new Set<string>();
  for (const place of places) globalIdSet.add(place.id);
  for (const restaurant of restaurants) {
    if (globalIdSet.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found across collections: "${restaurant.id}"`);
    }
    globalIdSet.add(restaurant.id);
  }
  for (const agent of agents) {
    if (globalIdSet.has(agent.id)) {
      throw new Error(`Duplicate entity id found across collections: "${agent.id}"`);
    }
    globalIdSet.add(agent.id);
  }
  for (const offering of offerings) {
    if (globalIdSet.has(offering.id)) {
      throw new Error(`Duplicate entity id found across collections: "${offering.id}"`);
    }
    globalIdSet.add(offering.id);
  }

  // Validate Purchases
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }
  const purchaseIdSet = new Set<string>();
  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }
    const rec = p as Record<string, unknown>;
    validateEntityId(rec.id);
    if (purchaseIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id as string);
    globalIdSet.add(rec.id as string);
  }

  // Validate Activity Completions
  if (!Array.isArray(candidate.activityCompletions)) {
    throw new Error('Invalid WorldState: activityCompletions must be an array');
  }
  for (let i = 0; i < candidate.activityCompletions.length; i++) {
    const c = candidate.activityCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(`Invalid ActivityCompletionRecord at index ${i}: record must be a non-null object`);
    }
    const rec = c as Record<string, unknown>;
    validateEntityId(rec.id);
    if (globalIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    globalIdSet.add(rec.id as string);
  }

  // Validate Acquaintances
  validateAcquaintances(candidate.acquaintances as unknown[]);
  for (const acq of candidate.acquaintances as Acquaintance[]) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }

  // Validate Items
  validateItemAuthority(candidate as unknown as ItemWorldState);
  if (Array.isArray(candidate.items)) {
    for (const item of candidate.items as OwnedItem[]) {
      if (globalIdSet.has(item.id)) {
        throw new Error(`Duplicate entity id found across collections: "${item.id}"`);
      }
      globalIdSet.add(item.id);
    }
  }

  // Validate Knowledge
  if (!Array.isArray(candidate.knowledge)) {
    throw new Error('Invalid WorldState: knowledge must be an array');
  }
  for (let i = 0; i < candidate.knowledge.length; i++) {
    const k = candidate.knowledge[i];
    if (typeof k !== 'object' || k === null) {
      throw new Error(`Invalid AgentKnowledgeRecord at index ${i}: record must be a non-null object`);
    }
    const rec = k as Record<string, unknown>;
    validateEntityId(rec.id);
    if (globalIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    globalIdSet.add(rec.id as string);
  }

  // Validate Orders
  if (!Array.isArray(candidate.orders)) {
    throw new Error('Invalid WorldState: orders must be an array');
  }
  for (let i = 0; i < candidate.orders.length; i++) {
    const o = candidate.orders[i];
    if (typeof o === 'object' && o !== null && typeof (o as Record<string, unknown>).id === 'string') {
      const orderId = (o as Record<string, unknown>).id as string;
      if (globalIdSet.has(orderId)) {
        throw new Error(`Duplicate entity id found across collections: "${orderId}"`);
      }
      globalIdSet.add(orderId);
    }
  }
  validateOrderAuthority(candidate as unknown as OrderWorldState);

  // Validate Properties
  if (!Array.isArray(candidate.properties)) {
    throw new Error('Invalid WorldState: properties must be an array');
  }
  for (let i = 0; i < candidate.properties.length; i++) {
    const p = candidate.properties[i];
    if (typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).id === 'string') {
      const propertyId = (p as Record<string, unknown>).id as string;
      if (globalIdSet.has(propertyId)) {
        throw new Error(`Duplicate entity id found across collections: "${propertyId}"`);
      }
      globalIdSet.add(propertyId);
    }
  }
  validatePropertyAuthority(candidate as unknown as PropertyWorldState);
}

/**
 * Migrates a valid Version 17 WorldState to Version 18.
 *
 * Migration Policy (Option B — No derivable relationship):
 * Version 17 does not authoritatively model Site Agent Associations.
 * In accordance with World Core invariants (locationId !== SiteAgentAssociation,
 * entity existence !== functional role), migration produces an empty
 * siteAgentAssociations collection rather than inventing associations from
 * entity existence.
 */
export function migrateWorldStateV17ToV18(v17: WorldStateV17): WorldStateV18 {
  return {
    worldId: v17.worldId,
    version: 18,
    worldTime: v17.worldTime,
    places: v17.places,
    restaurants: v17.restaurants,
    agents: v17.agents as unknown as AgentV18[],
    offerings: v17.offerings,
    purchases: v17.purchases,
    activityCompletions: v17.activityCompletions,
    acquaintances: v17.acquaintances,
    items: v17.items,
    knowledge: v17.knowledge,
    orders: v17.orders,
    properties: v17.properties,
    siteAgentAssociations: [],
  };
}

/**
 * Validates that an arbitrary object conforms to the strict Milestone 57-84 (Version 18) WorldState contract.
 * Preserved for pre-migration integrity checking.
 */
export function validateWorldStateV18(data: unknown): asserts data is WorldStateV18 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid WorldState: state must be a non-null object');
  }

  const candidate = data as Record<string, unknown>;

  if (typeof candidate.worldId !== 'string' || candidate.worldId.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldId must be a non-empty string. Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (candidate.worldId !== DEFAULT_WORLD_ID) {
    throw new Error(
      `Invalid WorldState: worldId must be "${DEFAULT_WORLD_ID}". Received: ${JSON.stringify(candidate.worldId)}`
    );
  }

  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version <= 0
  ) {
    throw new Error(
      `Invalid WorldState: version must be a positive integer. Received: ${JSON.stringify(candidate.version)}`
    );
  }

  if (candidate.version !== 18) {
    throw new Error(
      `Unsupported WorldState version: ${candidate.version}. Expected version 18. Incompatible schemas must be rejected explicitly.`
    );
  }

  if (typeof candidate.worldTime !== 'string' || candidate.worldTime.trim() === '') {
    throw new Error(
      `Invalid WorldState: worldTime must be a non-empty string. Received: ${JSON.stringify(candidate.worldTime)}`
    );
  }

  const parsedTime = Date.parse(candidate.worldTime);
  if (Number.isNaN(parsedTime)) {
    throw new Error(
      `Invalid WorldState: worldTime must be a valid ISO-8601 timestamp. Received: "${candidate.worldTime}"`
    );
  }

  validatePlaces(candidate.places as unknown[]);
  const places = candidate.places as Place[];

  const buildingIds = new Set<string>(
    places.filter((p) => p.type === 'building').map((p) => p.id)
  );
  validateRestaurants(candidate.restaurants as unknown[], buildingIds);
  const restaurants = candidate.restaurants as Restaurant[];

  const validLocationIds = new Set<string>([
    ...places.map((p) => p.id),
    ...restaurants.map((r) => r.id),
  ]);
  validateAgents(candidate.agents as unknown[], validLocationIds);
  const agents = candidate.agents as AgentV18[];

  const validRestaurantIds = new Set<string>(restaurants.map((r) => r.id));
  validateOfferings(candidate.offerings as unknown[], validRestaurantIds);
  const offerings = candidate.offerings as Offering[];

  validateBusinessAuthority(candidate as unknown as WorldState);

  for (const agent of agents) {
    if (agent.playerActivity) {
      if (!validRestaurantIds.has(agent.playerActivity.restaurantId)) {
        throw new Error(
          `Invalid playerActivity for agent "${agent.id}": restaurantId "${agent.playerActivity.restaurantId}" references non-existent restaurant`
        );
      }
      if (
        typeof agent.playerActivity.durationMs !== 'number' ||
        !Number.isInteger(agent.playerActivity.durationMs) ||
        agent.playerActivity.durationMs <= 0
      ) {
        throw new Error(
          `Invalid playerActivity durationMs for agent "${agent.id}": must be a positive integer`
        );
      }
      if (
        typeof agent.playerActivity.offeringId !== 'string' ||
        agent.playerActivity.offeringId.trim() === ''
      ) {
        throw new Error(
          `Invalid playerActivity offeringId for agent "${agent.id}": must be a non-empty string`
        );
      }
      if (
        agent.playerActivity.itemId !== null &&
        (typeof agent.playerActivity.itemId !== 'string' || agent.playerActivity.itemId.trim() === '')
      ) {
        throw new Error(
          `Invalid playerActivity itemId for agent "${agent.id}": must be null or a non-empty string`
        );
      }
      if (
        agent.playerActivity.companionAgentId !== undefined &&
        agent.playerActivity.companionAgentId !== null &&
        (typeof agent.playerActivity.companionAgentId !== 'string' || agent.playerActivity.companionAgentId.trim() === '')
      ) {
        throw new Error(
          `Invalid playerActivity companionAgentId for agent "${agent.id}": must be null or a non-empty string`
        );
      }
    }
  }

  // Global ID uniqueness across all entity collections
  const globalIdSet = new Set<string>();
  for (const place of places) globalIdSet.add(place.id);
  for (const restaurant of restaurants) {
    if (globalIdSet.has(restaurant.id)) {
      throw new Error(`Duplicate entity id found across collections: "${restaurant.id}"`);
    }
    globalIdSet.add(restaurant.id);
  }
  for (const agent of agents) {
    if (globalIdSet.has(agent.id)) {
      throw new Error(`Duplicate entity id found across collections: "${agent.id}"`);
    }
    globalIdSet.add(agent.id);
  }
  for (const offering of offerings) {
    if (globalIdSet.has(offering.id)) {
      throw new Error(`Duplicate entity id found across collections: "${offering.id}"`);
    }
    globalIdSet.add(offering.id);
  }

  // Validate Purchases
  if (!Array.isArray(candidate.purchases)) {
    throw new Error('Invalid WorldState: purchases must be an array');
  }
  const purchaseIdSet = new Set<string>();
  for (let i = 0; i < candidate.purchases.length; i++) {
    const p = candidate.purchases[i];
    if (typeof p !== 'object' || p === null) {
      throw new Error(`Invalid PurchaseRecord at index ${i}: record must be a non-null object`);
    }
    const rec = p as Record<string, unknown>;
    validateEntityId(rec.id);
    if (purchaseIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate purchase record id found: "${rec.id}"`);
    }
    if (globalIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    purchaseIdSet.add(rec.id as string);
    globalIdSet.add(rec.id as string);
  }

  // Validate Activity Completions
  if (!Array.isArray(candidate.activityCompletions)) {
    throw new Error('Invalid WorldState: activityCompletions must be an array');
  }
  for (let i = 0; i < candidate.activityCompletions.length; i++) {
    const c = candidate.activityCompletions[i];
    if (typeof c !== 'object' || c === null) {
      throw new Error(`Invalid ActivityCompletionRecord at index ${i}: record must be a non-null object`);
    }
    const rec = c as Record<string, unknown>;
    validateEntityId(rec.id);
    if (globalIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    globalIdSet.add(rec.id as string);
  }

  // Validate Acquaintances
  validateAcquaintances(candidate.acquaintances as unknown[]);
  for (const acq of candidate.acquaintances as Acquaintance[]) {
    if (globalIdSet.has(acq.id)) {
      throw new Error(`Duplicate entity id found across collections: "${acq.id}"`);
    }
    globalIdSet.add(acq.id);
  }

  // Validate Items
  validateItemAuthority(candidate as unknown as ItemWorldState);
  if (Array.isArray(candidate.items)) {
    for (const item of candidate.items as OwnedItem[]) {
      if (globalIdSet.has(item.id)) {
        throw new Error(`Duplicate entity id found across collections: "${item.id}"`);
      }
      globalIdSet.add(item.id);
    }
  }

  // Validate Knowledge
  if (!Array.isArray(candidate.knowledge)) {
    throw new Error('Invalid WorldState: knowledge must be an array');
  }
  for (let i = 0; i < candidate.knowledge.length; i++) {
    const k = candidate.knowledge[i];
    if (typeof k !== 'object' || k === null) {
      throw new Error(`Invalid AgentKnowledgeRecord at index ${i}: record must be a non-null object`);
    }
    const rec = k as Record<string, unknown>;
    validateEntityId(rec.id);
    if (globalIdSet.has(rec.id as string)) {
      throw new Error(`Duplicate entity id found across collections: "${rec.id}"`);
    }
    globalIdSet.add(rec.id as string);
  }

  // Validate Orders
  if (!Array.isArray(candidate.orders)) {
    throw new Error('Invalid WorldState: orders must be an array');
  }
  for (let i = 0; i < candidate.orders.length; i++) {
    const o = candidate.orders[i];
    if (typeof o === 'object' && o !== null && typeof (o as Record<string, unknown>).id === 'string') {
      const orderId = (o as Record<string, unknown>).id as string;
      if (globalIdSet.has(orderId)) {
        throw new Error(`Duplicate entity id found across collections: "${orderId}"`);
      }
      globalIdSet.add(orderId);
    }
  }
  validateOrderAuthority(candidate as unknown as OrderWorldState);

  // Validate Properties
  if (!Array.isArray(candidate.properties)) {
    throw new Error('Invalid WorldState: properties must be an array');
  }
  for (let i = 0; i < candidate.properties.length; i++) {
    const p = candidate.properties[i];
    if (typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).id === 'string') {
      const propertyId = (p as Record<string, unknown>).id as string;
      if (globalIdSet.has(propertyId)) {
        throw new Error(`Duplicate entity id found across collections: "${propertyId}"`);
      }
      globalIdSet.add(propertyId);
    }
  }
  validatePropertyAuthority(candidate as unknown as PropertyWorldState);

  // Validate Site Agent Associations (Milestone 57 / Version 18)
  validateSiteAgentAssociations(candidate.siteAgentAssociations as unknown[]);
}

export interface InteriorSpaceReference {
  readonly interiorId: string;
  readonly associatedPlaceId: string;
}

export const CANONICAL_M85_INTERIORS: readonly InteriorSpaceReference[] = Object.freeze([
  { interiorId: 'interior:wing-spot', associatedPlaceId: 'restaurant:wing-spot' },
  { interiorId: 'interior:tia-lupe', associatedPlaceId: 'restaurant:pasteleria-tia-lupe' },
]);

/**
 * Migrates a valid Version 18 WorldState to Version 19 (Milestone 85).
 *
 * Establishes Hierarchical Spatial Identity:
 * - Outdoors / exterior locations: interiorSpaceId = null
 * - Single-room interior venues (canonical M82 Wing Spot & M83 Tía Lupe):
 *   interiorSpaceId = interiorId
 * - Ambiguous multi-interior venues: Explicitly rejected rather than guessing.
 */
export function migrateWorldStateV18ToV19(
  v18: WorldStateV18,
  knownInteriors: readonly InteriorSpaceReference[] = CANONICAL_M85_INTERIORS
): WorldState {
  const migratedAgents: Agent[] = v18.agents.map((agent) => {
    // 1. Explicit pre-existing interiorSpaceId
    if ((agent as any).interiorSpaceId !== undefined) {
      const explicitId = (agent as any).interiorSpaceId;
      if (explicitId === null) {
        return {
          ...agent,
          interiorSpaceId: null,
        };
      }
      if (typeof explicitId !== 'string' || explicitId.trim() === '') {
        throw new Error(
          `Cannot migrate agent "${agent.id}" to Version 19: malformed interiorSpaceId "${JSON.stringify(explicitId)}"`
        );
      }
      if (explicitId.startsWith('entrance:')) {
        throw new Error(
          `Cannot migrate agent "${agent.id}" to Version 19: interiorSpaceId cannot reference an entrance ("${explicitId}")`
        );
      }
      if (explicitId.startsWith('node:nav:')) {
        throw new Error(
          `Cannot migrate agent "${agent.id}" to Version 19: interiorSpaceId cannot reference a navigation node ("${explicitId}")`
        );
      }
      if (!explicitId.startsWith('interior:')) {
        throw new Error(
          `Cannot migrate agent "${agent.id}" to Version 19: corrupt interiorSpaceId "${explicitId}" (must start with "interior:")`
        );
      }
      // Validate that explicitId exists in knownInteriors and matches agent's locationId
      const matchingInterior = knownInteriors.find((i) => i.interiorId === explicitId);
      if (!matchingInterior) {
        throw new Error(
          `Cannot migrate agent "${agent.id}" to Version 19: nonexistent interiorSpaceId "${explicitId}"`
        );
      }
      if (matchingInterior.associatedPlaceId !== agent.locationId) {
        throw new Error(
          `Cannot migrate agent "${agent.id}" to Version 19: mismatched interior "${explicitId}" (associated with "${matchingInterior.associatedPlaceId}") for agent at location "${agent.locationId}"`
        );
      }
      return {
        ...agent,
        interiorSpaceId: explicitId,
      };
    }

    // 2. No pre-existing interiorSpaceId (undefined)
    // Milestone 85 Correction Pass (F-08 Closure):
    // V18 predates the hierarchical spatial identity model.
    // Organizational affiliation, work assignment, activity state, or business association
    // is NOT evidence that an agent was physically inside an interior partition at snapshot time.
    // The migration must never manufacture physical reality.
    // All V18 agents without explicit interior identity safely receive interiorSpaceId = null.
    return {
      ...agent,
      interiorSpaceId: null,
    };
  });

  return {
    worldId: v18.worldId,
    version: 19,
    worldTime: v18.worldTime,
    places: v18.places,
    restaurants: v18.restaurants,
    agents: migratedAgents,
    offerings: v18.offerings,
    purchases: v18.purchases,
    activityCompletions: v18.activityCompletions,
    acquaintances: v18.acquaintances,
    items: v18.items,
    knowledge: v18.knowledge,
    orders: v18.orders,
    properties: v18.properties,
    siteAgentAssociations: v18.siteAgentAssociations,
  };
}

