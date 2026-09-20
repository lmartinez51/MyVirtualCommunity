# MyVirtualCommunity

A persistent, engine-independent virtual world based on the Ciudad Juárez–El Paso border region.

The World Core serves as the single source of truth and authoritative owner of world state. Clients, AI, external services, and renderers interact via intent-expressing commands and state queries, never mutating authoritative world state directly.

## Technology Stack

- **Runtime**: Node.js (v20+ LTS)
- **Language**: TypeScript (strict mode, NodeNext module resolution, ES2022 target)
- **Execution & Development**: `tsx`
- **Testing**: Node.js native test runner (`node:test`, `node:assert/strict`)
- **Dependencies**: Zero runtime dependencies

## Milestone 5: Restaurant Operational State

Milestone 5 introduces the first operational availability state for business entities:

### 1. Restaurant Operational Model (`src/core/entities/restaurant.ts`)
- `operationalState`: `'open' | 'closed'`
- `operationalSince`: ISO-8601 timestamp representing the World Time at which the current operational state began.
- **Minimal Availability Semantics**: The Restaurant entity represents operational availability only. It does **not** introduce menus, products, inventory, employees, customers, orders, payments, ownership, pricing, or reservations.

### 2. Deterministic Development Operational Rule
- Evaluates Restaurant availability based on World Time:
  - Open during the UTC interval `[09:00, 17:00)` (09:00:00.000Z inclusive to 17:00:00.000Z exclusive).
  - Closed outside this interval.
- **Synthetic Fixture**: This rule is strictly a deterministic test/development fixture and does NOT represent real restaurant schedules or recurring-event systems.

### 3. Discrete Simulation Integration (`src/core/simulation.ts`)
- `Simulation.tick()` coordinates deterministic evaluation of both Agent activity states and Restaurant operational states.
- Updates `operationalSince` only upon actual state transitions (`closed -> open` or `open -> closed`).
- Idempotent ticks preserve `operationalSince` and report `changed: false`.
- **Clock Authority Invariant**: Reads the authoritative `WorldClock` and never advances time.
- **Domain Independence Invariants**:
  - Restaurant operational state does NOT alter Agent `activityState`, `activitySince`, or `locationId`.
  - Agent activity and spatial presence do NOT open or close the Restaurant.
  - Restaurant structural containment (`buildingId`) and geography are strictly immutable during simulation.

### 4. Schema Version 5 & Persistence
- Schema version: `5`.
- Rejection policy: Legacy version 1, 2, 3, and 4 persisted states are rejected explicitly with descriptive errors. No silent data migrations or state repairs.
- Persistence Reconstruction: Restaurant operational state and timestamp survive complete process shutdown and are accurately reconstructed across runtime restarts.

## Milestone 6: First Agent–World Interaction

Milestone 6 introduces the first concrete, authoritative interaction slice between an Agent and a world entity:

### 1. The Interaction Pattern (`src/core/world-state.ts`)
```text
Agent Intent
    ↓
Validation / Preconditions
    ↓
Authoritative State Transition
    ↓
Result
```

- **Domain Function**: `enterRestaurant(state, agentId, restaurantId, options?)`
- **Result Type**:
  - `EnterRestaurantResultCode`: `'success' | 'agent-not-found' | 'agent-not-player' | 'restaurant-not-found' | 'restaurant-closed' | 'invalid-location' | 'already-inside'`
  - `EnterRestaurantResult`: `{ success: boolean, code: EnterRestaurantResultCode, message: string, agentId: string, restaurantId: string }`

### 2. Preconditions & Failure Codes
Every precondition is evaluated in deterministic order before any mutation occurs:
1. `agent-not-found`: Agent must exist in `WorldState.agents`.
2. `agent-not-player`: Agent must be a player (`agent.agentType === 'player'`). NPCs cannot enter restaurants via this action.
3. `restaurant-not-found`: Restaurant must exist in `WorldState.restaurants`.
4. `already-inside`: Agent must not already be inside the restaurant (`agent.locationId === restaurant.id`). Idempotent no-op.
5. `restaurant-closed`: Restaurant must be open (`restaurant.operationalState === 'open'`).
6. `invalid-location`: Agent must be located at the restaurant's containing building (`agent.locationId === restaurant.buildingId`).

### 3. Invariants & State Isolation
- **Zero Mutation on Failure**: If any precondition fails, no entity or state field is mutated.
- **State Isolation**: Successful entry updates only `agent.locationId = restaurant.id`. WorldClock, worldTime, Restaurant `operationalState`, `operationalSince`, and `buildingId`, Agent `activityState` and `activitySince`, NPC state, and geography remain completely untouched.
- **Caller-Invoked**: The interaction is executed explicitly by the caller and is never invoked by `Simulation.tick()`.
- **Spatial Referential Integrity**: `validateWorldState` enforces that every Agent's `locationId` points to either a valid `Place` or a valid `Restaurant`.
- **Schema Version**: Schema version remains `5` (no schema shape changes required).

## Milestone 7: First Commercial Offering

Milestone 7 introduces the first authoritative commercial offering made available by a business:

```text
Restaurant
    ↓
Commercial Offering
    ↓
Player can identify what the restaurant offers
```

### 1. Offering Entity Model (`src/core/entities/offering.ts`)
- `id`: Globally unique entity identifier (`offering:development-coffee`).
- `type`: `'offering'`.
- `name`: Non-empty string (`'Coffee'`).
- `restaurantId`: Authoritative reference to an existing Restaurant entity (`restaurant:development-restaurant`).
- `priceMinor`: Deterministic integer representing price in minor currency units (e.g. `500` for \$5.00). No floating-point math.
- `currency`: Explicit currency identifier (`'USD'`).

### 2. Domain Distinctions & Availability
- **Offering vs Inventory/Order/Purchase**: An Offering is solely descriptive commercial data representing what a business makes available for purchase. It is NOT inventory, NOT an order, NOT a purchase, NOT a menu system, and NOT money.
- **Derived Availability**: Offering availability is derived from Restaurant operational state:
  - Restaurant OPEN $\rightarrow$ Offering is available.
  - Restaurant CLOSED $\rightarrow$ Offering is not currently available.
  - The Offering itself remains structurally present in `WorldState` when the restaurant is closed. Zero derived state flags (`isAvailable`, `open`, `closed`) are stored on the offering.

### 3. Structural Query (`src/core/world-state.ts`)
- `getRestaurantOfferings(state, restaurantId)`:
  - Pure structural query returning all offerings for a given restaurant.
  - Guaranteed zero mutation on `WorldState`.
  - Returns offerings regardless of whether the restaurant is currently open or closed (eligibility/purchasing belongs to future interaction logic).
  - Deterministically returns `[]` if the restaurant has no offerings or does not exist.

### 4. Schema Version 6 & Strict Validation
- Schema version: `6` (migrated to `7` in Milestone 8).
- Persisted states with legacy versions are rejected explicitly with descriptive errors.
- Global entity ID uniqueness is strictly enforced across places, restaurants, agents, and offerings.

## Milestone 8: First Economic Transaction / First Purchase

Milestone 8 introduces the smallest real economic transaction slice between a `Player` agent and a `Commercial Offering` provided by a `Restaurant` world entity:

```text
Player Intent
    ↓
Precondition Validation (9 checks)
    ↓
Atomic Balance Mutation (Debit Player, Credit Restaurant)
    ↓
Result & Observability Log
```

### 1. Minimal Economic State Model
- **Agent Balances** (`src/core/entities/agent.ts`):
  - `balanceMinor`: Non-negative integer representing funds in minor currency units (e.g. `2000` = $20.00 USD).
  - `currency`: Explicit currency identifier (`'USD'`).
- **Restaurant Balances** (`src/core/entities/restaurant.ts`):
  - `balanceMinor`: Non-negative integer representing business funds in minor currency units (e.g. `0` = $0.00 USD).
  - `currency`: Explicit currency identifier (`'USD'`).
- **Strict Monetary Representation**: Balances and prices are non-negative integers only. Zero floating-point money calculations. No currency conversion, no taxes, no discounts, no tips, and no fees.
- **Development Seed Values**:
  - `agent:dev-player`: Starting balance of `2000` minor units ($20.00 USD).
  - `agent:dev-npc`: Starting balance of `0` minor units ($0.00 USD).
  - `restaurant:development-restaurant`: Starting balance of `0` minor units ($0.00 USD).
  - `offering:development-coffee`: Price of `500` minor units ($5.00 USD).

### 2. The Purchase Interaction (`src/core/world-state.ts`)
- **Domain Function**: `purchaseOffering(state, playerId, offeringId, restaurantIdOrOptions?, maybeOptions?)`
- **Result Types**:
  - `PurchaseOfferingResultCode`: `'success' | 'agent-not-found' | 'agent-not-player' | 'restaurant-not-found' | 'not-inside-restaurant' | 'restaurant-closed' | 'offering-not-found' | 'offering-not-at-restaurant' | 'currency-mismatch' | 'insufficient-funds'`
  - `PurchaseOfferingResult`: Exposes success flag, result code, descriptive message, playerId, offeringId, restaurantId, amountMinor, currency, and post-transaction balances.

### 3. Preconditions & Deterministic Order
Every purchase verifies the following 9 preconditions before any balance change:
1. `agent-not-found`: Agent exists in `WorldState.agents`.
2. `agent-not-player`: Agent is a player (`agent.agentType === 'player'`). NPCs cannot make purchases.
3. `restaurant-not-found`: Restaurant exists in `WorldState.restaurants`.
4. `not-inside-restaurant`: Player is located inside that restaurant (`agent.locationId === restaurant.id`).
5. `restaurant-closed`: Restaurant is currently open (`restaurant.operationalState === 'open'`).
6. `offering-not-found`: Offering exists in `WorldState.offerings`.
7. `offering-not-at-restaurant`: Offering belongs to the target restaurant (`offering.restaurantId === restaurant.id`).
8. `currency-mismatch`: Player, restaurant, and offering currencies match.
9. `insufficient-funds`: Player has sufficient balance (`player.balanceMinor >= offering.priceMinor`).

### 4. Invariants & Guarantees
- **Atomicity**: Changes to player and restaurant balances occur together in a single step after all preconditions pass.
- **Zero State Mutation on Failure**: Any failed precondition leaves both balances, the clock, location, activity, operational state, and geography strictly untouched.
- **State Isolation**: Successful purchase mutates ONLY player and restaurant balances. WorldClock, worldTime, Restaurant `operationalState` / `operationalSince` / `buildingId`, Agent `activityState` / `activitySince` / `locationId`, and offerings are untouched.
- **Caller-Invoked**: Purchases are explicit interaction actions; never automatically triggered by `Simulation.tick()`.
- **Schema Version 7**: Persisted `WorldState` schema was bumped to `version: 7` in Milestone 8.

## Milestone 9: First Time-Bound Player Activity (Having Coffee)

Milestone 9 introduces the smallest authoritative time-bound activity slice for a `Player` agent within the existing Restaurant world entity:

```text
Player Purchases Coffee
    ↓
startHavingCoffee(state, playerId, purchaseReceipt?)
    ↓
playerActivity: { activity: 'having-coffee', startedAt: T0, completedAt: null }
    ↓
Simulation.tick() at T0 + 15m (or late discovery)
    ↓
playerActivity: { activity: 'having-coffee', startedAt: T0, completedAt: T0 + 15m }
```

### 1. Concrete Activity Representation (`src/core/entities/agent.ts`)
- **Player Activity State**:
  - `playerActivity?: PlayerActivityState | null`
  - `PlayerActivityState { activity: 'having-coffee'; startedAt: string; completedAt: string | null }`
  - Represents the single concrete player activity without introducing a generic activity system.
  - Active: `completedAt === null`.
  - Completed: `completedAt === ISO-8601 string`.
- **Agent Lifecycle Independence**:
  - `agent.activityState` (`'idle' | 'active'`) and `agent.activitySince` remain completely untouched.
  - NPCs are strictly validated to ensure `playerActivity === null` or undefined.

### 2. Concrete Domain Rules (`src/core/activities/having-coffee.ts`)
- **Duration Constant**: `HAVING_COFFEE_DURATION_MINUTES = 15` (900,000 ms). Duration is not persisted in the database; it is a fixed domain rule.
- **Completion Helpers**:
  - `calculateHavingCoffeeCompletionTime(startedAt)`: Returns the exact ISO-8601 timestamp representing `startedAt + 15 minutes`.
  - `isHavingCoffeeCompleted(startedAt, currentTime)`: Pure comparison returning true when `currentTime >= startedAt + 15 minutes`.

### 3. The Initiation Interaction (`src/core/world-state.ts`)
- **Domain Function**: `startHavingCoffee(state, playerId, purchaseReceipt)`
- **Result Types**:
  - `StartHavingCoffeeResultCode`: `'success' | 'agent-not-found' | 'agent-not-player' | 'restaurant-not-found' | 'not-inside-restaurant' | 'restaurant-closed' | 'purchase-required' | 'activity-already-active'`
  - `StartHavingCoffeeResult`: Returns success flag, code, descriptive message, playerId, restaurantId, activity, startedAt, and completedAt.
- **Preconditions**:
  1. `agent-not-found`: Agent exists.
  2. `agent-not-player`: Agent is a player.
  3. Location validation:
     - `not-inside-restaurant`: If player's `locationId` is in `state.places` (e.g. building or street), player is not inside a restaurant.
     - `restaurant-not-found`: If player's `locationId` does not resolve to an existing restaurant in `state.restaurants`.
  4. `restaurant-closed`: Restaurant is currently open (`operationalState === 'open'`).
  5. `purchase-required`: Mandatory purchase receipt required. Must be a successful purchase for Coffee at this restaurant by this player. Sufficient player balance alone is NOT sufficient.
  6. `activity-already-active`: Player cannot start having-coffee if already engaged in an active (`completedAt === null`) activity.

### 4. Simulation Integration & Exact Invariant
- **Discrete Evaluation**: `Simulation.tick()` inspects players with active activities on each tick without mutating clock time.
- **Exact Completion Invariant**: `completedAt` is always set to `startedAt + 15 minutes`. In offline or late discovery scenarios (e.g. ticking at 09:25 when coffee started at 09:00), `completedAt` records the exact theoretical boundary `09:15:00.000Z`, while the world clock remains at `09:25:00.000Z`.
- **Idempotency & Completed State Stability**: Once marked completed, subsequent ticks report `changed: false`, leaving the completed state stable and immutable without emitting duplicate transitions.
- **Post-Completion Lifecycle**: Unresolved by design for Milestone 9. No replacement or reset semantics are defined.

### 5. Schema Version 8 & Persistence
- Schema version: `8`.
- Persisted states with versions 1–7 are explicitly rejected upon load with descriptive errors.
- Active and completed activities survive process termination and runtime reconstruction identically.

## Milestone 10: Leaving & Spatial Movement

Milestone 10 introduces the first explicit player exit from an interior location (`Restaurant`) and subsequent spatial movement down through the existing geographic hierarchy to the containing `Building`, containing `Street`, and onward to another valid `Place`:

```text
Restaurant (interior)
    ↓ exitRestaurant()
Building
    ↓ leaveBuilding()
Street
    ↓ transitionAgentLocation()
Another Valid Place (e.g. Neighborhood)
```

### 1. Concrete Exit & Movement Operations (`src/core/world-state.ts`)

- **Exit Restaurant**: `exitRestaurant(state, playerId, restaurantId)`
  - Moves player from an interior Restaurant to its containing Building (`agent.locationId = restaurant.buildingId`).
  - Preconditions (deterministic order):
    1. `agent-not-found`: Agent exists.
    2. `agent-not-player`: Agent is a player.
    3. `restaurant-not-found`: Restaurant exists.
    4. `not-inside-restaurant`: Player is currently inside that restaurant (`agent.locationId === restaurant.id`).
  - Result: `ExitRestaurantResult` (`success`, `code`, `message`, `agentId`, `restaurantId`, `buildingId`).

- **Leave Building**: `leaveBuilding(state, playerId, buildingId)`
  - Moves player from a Building to its containing Street (`agent.locationId = building.parentId`).
  - Preconditions (deterministic order):
    1. `agent-not-found`: Agent exists.
    2. `agent-not-player`: Agent is a player.
    3. `building-not-found`: Building exists in `state.places` and is of type `'building'`.
    4. `not-at-building`: Player is currently located at that building (`agent.locationId === building.id`).
    5. `street-not-found`: Building has a valid containing parent street of type `'street'` in `state.places`.
  - Result: `LeaveBuildingResult` (`success`, `code`, `message`, `agentId`, `buildingId`, `streetId`).

- **Spatial Movement Between Places**: `transitionAgentLocation(state, agentId, targetPlaceId)`
  - Exercised strictly as the existing low-level spatial state transition primitive, **NOT** as a pathfinding, routing, or geographic-connectivity system.
  - Validates `targetPlaceId` resolves to an existing `Place` in `state.places`.
  - No reachability graph, pathfinding rules, or connectivity requirements are added or implied.

### 2. Invariants & Guarantees
- **Zero Travel Time**: Spatial movement is instantaneous state transition. `worldTime` remains strictly identical before and after transitions. No speed, distance, or duration calculations.
- **Activity Independence**: Spatial movement does not cancel, pause, resume, or alter `Having Coffee`. In standard scenarios, movements occur after coffee completion.
- **State Isolation**: Successful transitions mutate only `agent.locationId`. Balances, offerings, restaurant operational states, NPC activity, geography, and world time remain untouched.
- **Zero Mutation on Failure**: Any failed precondition check leaves the world state completely unaltered.

### 3. Schema Version 8 Preserved
- Because the existing geographic hierarchy (`Restaurant.buildingId`, `Building.parentId`, `Street.parentId`) already contains all necessary relationships, **no schema changes or migrations** were needed. Schema version remains strictly `8`.

## Milestone 11: First Agent-to-Agent Interaction (greetAgent)

Milestone 11 establishes the first concrete interaction between two Agents in `MyVirtualCommunity`:

```text
Geography
    ↓
Agent spatial presence
    ↓
Agent-to-agent interaction (Player greets NPC when co-located)
```

### 1. Concrete Operation Contract (`src/core/world-state.ts`)

- **Domain Function**: `greetAgent(state: WorldState, playerId: string, npcId: string): GreetAgentResult`
- **Result Types**:
  - `GreetAgentResultCode`: `'success' | 'player-not-found' | 'player-not-player' | 'npc-not-found' | 'target-not-npc' | 'player-location-invalid' | 'npc-location-invalid' | 'agents-not-co-located'`
  - `GreetAgentResult`: Returns `{ success: boolean, code: GreetAgentResultCode, message: string, playerId: string, npcId: string }`.

### 2. Preconditions & Deterministic Order
Every greeting evaluates the following 7 preconditions strictly in sequence:
1. `player-not-found`: The player exists in `WorldState.agents`.
2. `player-not-player`: The player agent is actually of type `'player'`.
3. `npc-not-found`: The target NPC exists in `WorldState.agents`.
4. `target-not-npc`: The target agent is actually of type `'npc'`.
5. `player-location-invalid`: The player's `locationId` resolves to an existing `Place` or `Restaurant`.
6. `npc-location-invalid`: The NPC's `locationId` resolves to an existing `Place` or `Restaurant`.
7. `agents-not-co-located`: Both agents share the identical location identifier (`player.locationId === npc.locationId`).

### 3. Co-location Semantics
- Co-location requires exact spatial equality: `player.locationId === npc.locationId`.
- No coordinates, proximity radius, distance metrics, line-of-sight, or visibility algorithms are involved.
- Works natively with all valid spatial entities (Buildings, Streets, Neighborhoods, Restaurants).

### 4. Zero State Mutation Invariant
Milestone 11 proves the conceptual boundary:
$$\text{Agent State} \neq \text{Interaction Result} \neq \text{History} \neq \text{Memory} \neq \text{Relationship}$$
- A successful greeting produces **ZERO** mutation to `WorldState`.
- Does not create relationship records, affinity, friendship, memory, conversation, dialogue, reputation, emotional states, quests, or rewards.
- Does not advance `worldTime` or mutate balances, activities, or locations.
- Any failed precondition also guarantees zero state mutation.

### 5. Absence of AI & Generic Frameworks
- Deterministic social interaction boundary: no LLM calls, prompts, dialogue generation, or autonomous NPC reactions.
- No generic social managers (`SocialSystem`, `InteractionManager`, `RelationshipManager`, `DialogueSystem`).

### 6. Schema Version 8 Preserved
- Because `greetAgent()` produces no persistent state mutations, **schema version remains strictly `8`** with zero migrations or schema changes.

## Milestone 12: First World Perception (inspectCurrentLocation)

Milestone 12 establishes the first concrete world perception capability in `MyVirtualCommunity`:

```text
Authoritative World State
        ↓
Intentional observable projection (ObservableAgent, ObservableOffering)
        ↓
Player perception: inspectCurrentLocation(state, playerId)
```

### 1. Concrete Operation Contract (`src/core/world-state.ts`)

- **Domain Function**: `inspectCurrentLocation(state: WorldState, playerId: string): InspectCurrentLocationResult`
- **Result Types**:
  - `InspectCurrentLocationResultCode`: `'success' | 'player-not-found' | 'player-not-player' | 'player-location-invalid'`
  - `InspectCurrentLocationResult`: Returns `{ success: boolean, code: InspectCurrentLocationResultCode, message: string, playerId: string, locationId?: string, location?: ObservedLocation }`.
- **Observable Models**:
  - `ObservableAgent`: Exposes **only** `{ id: string, name: string, agentType: AgentType }`. Strictly does **not** expose internal state such as `activityState`, `activitySince`, `balanceMinor`, `currency`, or `playerActivity`.
  - `ObservableOffering`: Exposes **only** `{ id: string, name: string, priceMinor: number, currency: string }`. Strictly does **not** return raw `Offering` entities and does **not** expose `restaurantId`.
  - `ObservedLocation`: Exposes `{ id, type, name, parentId?, buildingId?, operationalState?, offerings?: ObservableOffering[], agents: ObservableAgent[] }`.

### 2. Preconditions & Deterministic Order
1. `player-not-found`: The player exists in `WorldState.agents`.
2. `player-not-player`: The agent found is actually of type `'player'`.
3. `player-location-invalid`: The player's `locationId` resolves to an existing `Place` or `Restaurant` in `WorldState`.

### 3. Perception Boundary & Scoping
- The perception boundary is strictly the player's current `locationId`.
- No distance/radius queries, spatial coordinates, visibility systems, or line-of-sight algorithms.
- Places expose geographic containment (`parentId`).
- Restaurants expose containing building (`buildingId`), authoritative operational state (`open` / `closed`), and projected offerings (`ObservableOffering`).
- Agents expose co-located agents mapped to `ObservableAgent`. Agents located elsewhere are not returned.

### 4. Zero State Mutation Invariant
- `inspectCurrentLocation()` is strictly read-only.
- Mutates zero fields in `WorldState` on success or failure.
- Does not create observation history, memory, relationships, reputation, or events.
- Does not embed internal logging; returns a deterministic result.

### 5. Schema Version 8 Preserved
- Because perception produces no persistent mutations and adds no schema fields, **schema version remained strictly `8`**.

## Milestone 13: First Persistent Historical Event (Coffee Purchase)

Milestone 13 introduces the first persistent historical facts into `MyVirtualCommunity`:

```text
WorldState (Schema v9)
├── Current State (Authority for "What is true now")
│   ├── places[]
│   ├── restaurants[]
│   ├── agents[]
│   └── offerings[]
│
└── Historical Facts (Evidence of "What happened")
    └── purchases[]
```

### 1. The Historical Boundary
Milestone 13 establishes a strict conceptual and architectural boundary:
$$\text{Current World State} \neq \text{Historical Fact}$$
- **Current World State** is the single source of truth for authoritative current properties: player and restaurant balances, spatial locations, operational availability, offering prices, and active activities.
- **Historical Facts** record immutable evidence that an event occurred in the past.
- **No Event Sourcing / No History Replay**: Balances, operational states, prices, and locations are **never** calculated, reconstructed, or replayed from historical records.
- **History is not Perception**: Historical records are internal world facts. The M12 perception operation `inspectCurrentLocation()` strictly isolates current state and does not project or leak purchase history.
- **History is not Memory**: Historical events represent objective world facts, not agent recollection, beliefs, relationships, or dialogue.

### 2. PurchaseRecord Model (`src/core/world-state.ts`)
- `id`: Monotonically incrementing identifier in the form `purchase:${n}` (`purchase:1`, `purchase:2`, ...).
- `worldTime`: The authoritative World Time at which the transaction occurred.
- `playerId`: The ID of the purchasing player agent (`agent:dev-player`).
- `restaurantId`: The ID of the selling restaurant (`restaurant:development-restaurant`).
- `offeringId`: The ID of the commercial offering (`offering:development-coffee`).
- `amountMinor`: The integer price paid at transaction time in minor currency units (e.g. `500` for $5.00).
- `currency`: Explicit currency identifier (`'USD'`).

### 3. Atomic Execution & Precondition Invariants
- When `purchaseOffering(state, playerId, offeringId)` succeeds, it atomically:
  1. Decrements player balance (`player.balanceMinor -= offering.priceMinor`)
  2. Increments restaurant balance (`restaurant.balanceMinor += offering.priceMinor`)
  3. Appends an immutable `PurchaseRecord` to `state.purchases`.
- **Zero Records on Failure**: Failed purchases (due to closed restaurant, non-co-location, wrong currency, insufficient funds, non-existent entity, or non-player agent) produce **zero** historical records. No failure audit log is recorded.
- **Price Independence**: Historical records capture the price paid at the moment of purchase. Subsequent menu price adjustments (`offering.priceMinor`) never alter past `PurchaseRecord` amounts.
- **Separation from Ephemeral Result**: `PurchaseOfferingResult` remains the ephemeral in-memory interaction receipt used by callers (e.g., `startHavingCoffee`). Persistent history lives in `state.purchases`.

### 4. Schema Version 9 & Persistence
- Schema version bumped to `9` (`CURRENT_WORLD_STATE_VERSION = 9`).
- **Strict Rejection**: Validations explicitly reject schema versions 1 through 8.
- **Integrity Validation**: `validateWorldState()` validates that `purchases` is an array, checks monotonic unique IDs, validates amounts and currencies, and enforces referential integrity (`playerId` is player, `restaurantId` exists, `offeringId` exists and belongs to `restaurantId`).

## Milestone 14: First Persistent Historical Fact Beyond Commerce (Coffee Completion)

Milestone 14 extends historical facts beyond economic transactions into lived experience by persisting completed player activities:

```text
WorldState (Schema v10)
├── Current State (Authority for "What is true now")
│   ├── places[]
│   ├── restaurants[]
│   ├── agents[] (authoritative playerActivity: active / completed)
│   └── offerings[]
│
└── Historical Facts (Evidence of "What happened")
    ├── purchases[]
    └── coffeeCompletions[]
```

### 1. Conceptual & Architectural Boundary
Milestone 14 introduces the second concrete historical fact collection while maintaining strict domain boundaries:
$$\text{Current Activity State} \neq \text{Historical Fact}$$
- **Current Activity Authority**: `Agent.playerActivity` remains the sole authority for whether an agent is currently engaged in an activity (`completedAt === null`) or has completed it (`completedAt !== null`).
- **Historical Fact Boundary**: `WorldState.coffeeCompletions` persists immutable historical evidence that a coffee activity was completed in the world.
- **No Event Sourcing / No Replay**: Current activity state and locations are **never** derived, reconstructed, or replayed from `coffeeCompletions`.
- **No Commerce Couplings**: `CoffeeCompletionRecord` does not record prices, currencies, wallets, balances, rewards, or `purchaseId`.
- **Perception Isolation**: The M12 perception operation `inspectCurrentLocation()` continues to isolate current spatial state and never projects or leaks historical records.

### 2. CoffeeCompletionRecord Model (`src/core/world-state.ts`)
```ts
export interface CoffeeCompletionRecord {
  id: string;
  playerId: string;
  restaurantId: string;
  startedAt: string;
  completedAt: string;
}
```
- `id`: Monotonically incrementing identifier in the form `coffee-completion:${n}` (`coffee-completion:1`, `coffee-completion:2`, ...).
- `playerId`: The ID of the player agent (`agent:dev-player`).
- `restaurantId`: The restaurant at which the Having Coffee activity was started and with which the activity is associated. It does **not** mean the player's physical location at completion time.
- `startedAt`: ISO-8601 timestamp representing the exact time the activity started.
- `completedAt`: ISO-8601 timestamp representing the exact time the activity completed (strictly `startedAt + 15 minutes`).

### 3. Execution & Simulation Boundary
- **Completion Detection in `Simulation.tick()`**:
  When logical World Time reaches or exceeds `startedAt + 15 minutes`, the tick detects activity completion:
  1. Sets `agent.playerActivity.completedAt = exactTheoreticalCompletionTime` (15m boundary).
  2. Constructs and appends exactly one immutable `CoffeeCompletionRecord` to `state.coffeeCompletions`.
- **Idempotency**: On subsequent simulation ticks, because `agent.playerActivity.completedAt !== null`, no further transitions or completion records are generated.
- **Offline / Late Discovery**: If the world advances across the completion boundary while offline or in large leaps (e.g. 22 minutes later), `completedAt` records the exact 15-minute boundary (`09:15:00.000Z`), not the late discovery time (`09:22:00.000Z`).
- **Spatial Independence**: Because M10 permits the player to exit the restaurant and move elsewhere while having coffee, completion records accurately retain the originating `restaurantId` even if the player is physically in another building, on the street, or in another neighborhood at `completedAt`.

### 4. Schema Version 10 & Persistence
- Schema version bumped to `10` (`CURRENT_WORLD_STATE_VERSION = 10`).
- **Strict Rejection**: Validations explicitly reject schema versions 1 through 9.
- **Integrity Validation**: `validateWorldState()` validates that `coffeeCompletions` is an array, checks monotonic unique IDs (`coffee-completion:${n}`), validates ISO-8601 timestamp formats, ensures `completedAt >= startedAt`, enforces exact 15-minute duration delta (`HAVING_COFFEE_DURATION_MS`), and enforces referential integrity (`playerId` is player, `restaurantId` exists).
- Does **not** constrain `record.restaurantId === player.locationId`.

## Milestone 15: Deterministic NPC Spatial Routine

Milestone 15 establishes the first deterministic spatial routine for Non-Player Characters (NPCs) driven strictly by logical World Time:

### 1. Concrete Work Schedule Model (`src/core/development-npc-schedule.ts`)
- `DEVELOPMENT_NPC_WORK_SCHEDULE`:
  - `npcId`: `'agent:dev-npc'`
  - `workplaceId`: `'restaurant:development-restaurant'`
  - `shiftStartHourUtc`: `9` (09:00 UTC)
  - `shiftEndHourUtc`: `17` (17:00 UTC)
- Serves as the single authoritative source of truth for NPC work hours without introducing generic scheduling systems or recurring cron jobs.

### 2. Deterministic Spatial Routine Rule
- `evaluateDevelopmentNpcLocationRule(worldTimeIso: string)` evaluates the NPC's authoritative location:
  - `[08:30, 09:00)` UTC: Commute phase on `street:development-street`.
  - `[09:00, 17:00)` UTC: Work shift inside `restaurant:development-restaurant`.
  - `[17:00, 17:30)` UTC: Evening commute on `street:development-street`.
  - Outside these windows: Resting at `building:development-residence`.
- Evaluated with millisecond precision during `Simulation.tick()`.

### 3. Invariants & Guarantees
- **Simulation Coordination**: `Simulation.tick()` coordinates deterministic spatial transitions of NPCs alongside restaurant operational state and player activity progression.
- **Clock Authority Invariant**: Pure function of logical World Time; reads `WorldClock` without advancing time.
- **Zero Travel Time**: Transitions between locations occur instantaneously upon crossing boundary thresholds.
- **Schema Version 10 Preserved**: Zero schema additions required.

## Milestone 16: Bidirectional Building Traversal (enterBuilding)

Milestone 16 completes the bidirectional spatial movement loop between streets and buildings:

```text
Street
  │ ▲
  │ │ enterBuilding(state, playerId, buildingId)
  ▼ │ leaveBuilding(state, playerId, buildingId)
Building
```

### 1. Operation Contract (`src/core/world-state.ts`)
- **Domain Function**: `enterBuilding(state: WorldState, playerId: string, buildingId: string): EnterBuildingResult`
- **Result Types**:
  - `EnterBuildingResultCode`: `'success' | 'player-not-found' | 'player-not-player' | 'building-not-found' | 'not-at-parent-street' | 'already-inside'`
  - `EnterBuildingResult`: `{ success: boolean, code: EnterBuildingResultCode, message: string, playerId: string, buildingId: string, streetId?: string }`

### 2. Preconditions & Integrity
1. `player-not-found`: Player exists in `WorldState.agents`.
2. `player-not-player`: Agent is of type `'player'`.
3. `building-not-found`: Building exists in `WorldState.places` and is of type `'building'`.
4. `already-inside`: Player is not already inside that building (`agent.locationId === building.id`).
5. `not-at-parent-street`: Player must be located on the building's direct containing parent street (`agent.locationId === building.parentId`).

### 3. State Isolation & Schema Stability
- Mutates exclusively `agent.locationId = building.id`.
- Zero mutations on failure. Schema version remains strictly `10`.

## Milestone 17-A: Authoritative Personal Historical Perception (inspectPlayerHistory)

Milestone 17-A introduces player-scoped historical perception:

```text
WorldState History (purchases[], coffeeCompletions[])
                    │
                    ▼
inspectPlayerHistory(state, playerId)
                    │
                    ▼
Personal History Projection (purchases, coffeeCompletions)
```

### 1. Conceptual Separation
$$\text{Current State} \neq \text{Objective World History} \neq \text{Personal Historical Perception} \neq \text{Memory}$$
- `inspectCurrentLocation` isolates current spatial state ("what is here now").
- `inspectPlayerHistory` projects personal historical facts ("what did I do in the past").
- Strictly read-only; produces zero state mutations and zero event replays.

### 2. Operation Contract (`src/core/world-state.ts`)
- **Domain Function**: `inspectPlayerHistory(state: WorldState, playerId: string): InspectPlayerHistoryResult`
- **Preconditions**:
  1. `player-not-found`: Player exists in `WorldState.agents`.
  2. `player-not-player`: Agent is of type `'player'`.
- **Projection Model**:
  - `PersonalPurchaseRecord`: `{ id, worldTime, restaurantId, offeringId, amountMinor, currency }`
  - `PersonalCoffeeCompletionRecord`: `{ id, restaurantId, startedAt, completedAt }`
- Records are filtered strictly to those where `record.playerId === playerId`.

## Milestone 18-A: First Deterministic NPC Reaction (Reciprocal Greeting)

Milestone 18-A elevates `greetAgent` with deterministic, contextual social feedback:

### 1. Reciprocal Reaction Semantics
- When `greetAgent(state, playerId, npcId)` succeeds, the response includes a contextual `greetingResponse` uttered by the NPC based on their authoritative location and activity state:
  - Working at Restaurant (`[09:00, 17:00)` UTC): *"Welcome! Let me know if you need anything."*
  - Idle at Building: *"Hello. I'm around the building today."*
  - Idle at Restaurant: *"Hello there."*
- Contextual dialogue is evaluated strictly from authoritative state fixtures—zero LLM calls or dynamic hallucinations.

### 2. Invariants
- **Zero State Mutation Invariant**: A successful greeting and reciprocal reaction produces zero persistent mutations in `WorldState`.
- Retains pure statelessness; schema version remains strictly unchanged.

## Milestone 19-A: Deterministic NPC Offering Availability

Milestone 19-A couples NPC physical workplace activity with commercial product availability:

### 1. Dynamic Commercial Offering Lifecycle
- Introduces `offering:development-pastry` (*Pan Dulce*, \$2.50 USD / 250 minor units).
- **Domain Functions**:
  - `makeDevelopmentOfferingAvailable(state)`: Adds the Pan Dulce offering to `state.offerings` when the NPC is actively working on shift at the restaurant.
  - `retireDevelopmentOffering(state)`: Removes the offering when the NPC departs or their shift concludes.
- Proves that business offerings can be dynamically conditioned on NPC presence and labor without generic inventory systems.

## Milestone 20-A: Intra-Neighborhood Street Traversal & Multi-Building Movement

Milestone 20-A expands spatial navigation across sibling streets within the shared neighborhood:

### 1. Sibling Street Traversal (`traverseToStreet`)
- **Domain Function**: `traverseToStreet(state: WorldState, playerId: string, targetStreetId: string): TraverseToStreetResult`
- **Preconditions**:
  1. Player must be located on a street (`currentPlace.type === 'street'`).
  2. Target street must exist and be of type `'street'`.
  3. Both streets must share the exact identical parent neighborhood (`currentStreet.parentId === targetStreet.parentId`).
- Enables multi-destination traversal: exiting a commercial building, traversing from `street:development-street` to sibling `street:residential-street`, and entering `building:development-residence`.

## Milestone 21-A: Local Spatial Affordance Perception

Milestone 21-A enriches `inspectCurrentLocation` with structured local spatial affordances:

### 1. Affordance Projection (`ObservedLocation`)
- When inspecting a location, the projection includes immediate spatial navigation opportunities:
  - `accessibleBuildings`: Array of `{ id, name, type }` for buildings directly situated on the current street.
  - `neighboringStreets`: Sibling streets in the parent neighborhood directly reachable from the current street.
  - `containedRestaurants`: Commercial venues inside the current building.
  - `exitAffordances`: Parent container navigation options (e.g. exit to street, exit to building).
- Clients render spatial affordances directly from projections without inspecting raw world collections or guessing topology.

## Milestone 22: Multi-Phase Deterministic NPC Neighborhood Routine & Contextual Encounters

Milestone 22 implements a complete multi-phase daily cycle for the development NPC across the expanded neighborhood geography:

### 1. 24-Hour Routine Phases
| UTC Interval | Phase | Location | Activity State |
| :--- | :--- | :--- | :--- |
| `00:00 - 08:30` | Night / Morning Rest | `building:development-residence` | `idle` |
| `08:30 - 09:00` | Morning Commute | `street:development-street` | `active` |
| `09:00 - 17:00` | Work Shift | `restaurant:development-restaurant` | `active` |
| `17:00 - 17:30` | Evening Commute | `street:development-street` | `active` |
| `17:30 - 24:00` | Evening Rest | `building:development-residence` | `idle` |

### 2. Contextual Encounters
- Enables deterministic co-location encounters: the player walking on `street:development-street` between 08:30 and 09:00 UTC encounters the NPC on their commute, greets them, and observes their commute activity state.

## Milestone 23: First World Opportunity (Pan Dulce Available)

Milestone 23 introduces contextual world opportunities into perception:

### 1. Observable Opportunity Projection
- When the restaurant is open, the NPC is on shift, and Pan Dulce is actively published, `inspectCurrentLocation` projects an `ObservableOpportunity`:
  ```ts
  interface ObservableOpportunity {
    id: 'opportunity:development-pan-dulce';
    type: 'opportunity';
    name: 'Pan Dulce Available';
    description: string;
    offeringId: 'offering:development-pastry';
    restaurantId: 'restaurant:development-restaurant';
  }
  ```
- Exposes actionable world opportunities to agents without breaking encapsulation or leaking raw world collections.

## Milestone 24: First Opportunity-Driven Player Decision

Milestone 24 closes the perception-decision-action loop:

```text
World Simulation (NPC Shift + Offering Active)
              │
              ▼
inspectCurrentLocation() → Perceive ObservableOpportunity
              │
              ▼
Player Decision (Select offeringId from perceived opportunity)
              │
              ▼
purchaseOffering(state, playerId, offeringId) → Atomic Purchase & Balance Update
```

- Demonstrates an autonomous decision-making cycle where player choices are grounded strictly in authentic world opportunities rather than hardcoded scripts.

## Milestone 25: First Persistent Social Consequence (Minimal Dyadic Acquaintance)

Milestone 25 introduces the first persistent social facts to `MyVirtualCommunity`:

### 1. Canonical Dyadic Acquaintance Model (`src/core/entities/social.ts`)
- `Acquaintance`:
  ```ts
  interface Acquaintance {
    id: string; // "acquaintance:agentA:agentB" (lexicographically ordered)
    agentIds: [string, string]; // [first, second] where first < second
    establishedAt: string; // ISO-8601 WorldClock timestamp
  }
  ```
- **Symmetric Dyad**: Acquaintance is inherently mutual and undirected. Storing `agentA` and `agentB` in canonical order ensures single-record representation without duplicates.

### 2. Introduction Operation (`src/core/world-state.ts`)
- **Domain Function**: `introduceToAgent(state, agentIdA, agentIdB): IntroduceToAgentResult`
- **Preconditions**:
  1. Both agents exist.
  2. Agents are distinct (`agentIdA !== agentIdB`).
  3. Agents are co-located (`agentA.locationId === agentB.locationId`).
- **Idempotency**: If already acquainted, returns success with `code: 'already-acquainted'` with zero mutations.
- **Schema Version 11**: State version bumped to `11` (`CURRENT_WORLD_STATE_VERSION = 11`).

## Milestone 26: Minimal Relational Inquiry & Epistemic Grounding

Milestone 26 introduces fact-based social inquiry conditioned on prior acquaintance:

### 1. Relational Inquiry (`inquireAgentSchedule`)
- **Domain Function**: `inquireAgentSchedule(state, playerId, targetAgentId): InquireAgentScheduleResult`
- **Preconditions**:
  1. Player and target exist.
  2. Agents are co-located.
  3. Agents MUST be acquainted (`isAgentAcquainted(state, playerId, targetAgentId) === true`). If not, rejected with `not-acquainted`.
- **Authoritative Fact Disclosure**: Returns the NPC's actual work shift hours (`shiftStartHourUtc: 9`, `shiftEndHourUtc: 17`) grounded in `DEVELOPMENT_NPC_WORK_SCHEDULE`.
- Proves social progression: Unacquainted players cannot query schedules; introduced players receive verifiable, grounded world facts.

## Milestone 27: Spatial Opportunity Perception Across Building Storefront Boundary

Milestone 27 enables spatial perception across architectural boundaries:

### 1. Storefront Perception
- When a player is standing in `building:development-building`, inspecting their location projects active opportunities originating inside contained commercial venues (such as Pan Dulce inside `restaurant:development-restaurant`).
- Allows agents in a building lobby to observe what is available inside commercial venues without requiring interior entry.

## Milestone 29: Controlled Local Runtime, Session Boundary & Persistence Safety

Milestone 29 establishes the authoritative local runtime and session boundary hosting the World Core over HTTP/JSON using Node.js built-in `node:http`:

### 1. Architectural Boundary
```text
Browser Client (Milestone 30+)
      │
      │ HTTP / JSON
      ▼
Node.js Authoritative Runtime (node:http on 127.0.0.1:3000)
      │
      ▼
WorldSessionController (In-Memory State + Clock Authority)
      │
      ├── WorldState (Candidate Cloning & Sequential Execution)
      ├── WorldClock
      ├── Commands & Queries (Zero Duplication of Domain Logic)
      └── Simulation (Controlled Discrete Steps)
      │
      ▼
LocalFilePersistence (Atomic Write: temp file + renameSync)
      │
      ▼
data/world-state.json
```

### 2. Core Components
- **HTTP Server (`src/server/http-server.ts`)**: Built with native `node:http` (zero runtime dependencies). Implements REST API routes and serves static browser assets.
- **Session Controller (`src/server/session-controller.ts`)**: Hosts authoritative in-memory state and enforces single-process FIFO command serialization.
- **Candidate Transaction Safety**: Commands execute against deep candidate clones. Persistence to disk (`write temp + renameSync`) must succeed before the candidate state is committed to active memory.

### 3. API Endpoints
- `GET /api/status`: Safe runtime status (`ready`, `worldId`, `schemaVersion`, `worldTime`, `activePlayerId`, `status`). Never exposes raw entity collections.
- `GET /api/location`: Read-only `InspectCurrentLocationResult` projection for the active development player. Zero mutation, zero disk writes.
- `GET /api/history`: Read-only `InspectPlayerHistoryResult` projection. Zero mutation, zero disk writes.
- `POST /api/commands/:commandName`: Dispatches approved domain commands sequentially through the controller (`enterBuilding`, `leaveBuilding`, `enterRestaurant`, `exitRestaurant`, `traverseStreet`, `purchaseOffering`, `startCoffee`, `greetAgent`, `introduceAgent`, `inquireAgentSchedule`).
- `POST /api/simulation/step`: Controlled discrete simulation step advancing logical time by `advanceDurationMs` and executing simulation rules.

### 4. Integrity Corrections A & B
- **Correction A: Read-Only Schedule Query & Route Enforcement**: Schedule inquiries are enforced as pure read-only queries with zero candidate commits or disk writes.
- **Correction B: Authoritative Purchase Ledger & Economic Integrity**: Disallows client-supplied monetary amounts or fake receipt tokens; all transaction math and historical receipts are computed strictly by the server.

## Milestone 30: First Visual Client & Presentation Shell

Milestone 30 introduces the browser-based presentation shell (`src/client/`), decoupled from domain logic via HTTP:

### 1. Architecture & Presentation Shell
```text
┌─────────────────────────────────────────────────────────────┐
│                       Browser Window                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Semantic HUD (World Time, Location, Context, Player)  │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Canvas 2D Viewport (Spatial Entities & Co-located Agents)│ │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────┬───────────────────────────┐  │
│  │ World Perception Panel    │ Contextual Affordances    │  │
│  └───────────────────────────┴───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ HTTP / JSON
                               ▼
            Node.js Authoritative World Server (M29)
```

- **Zero-Build Native ES Modules**: Pure browser-native TypeScript/JavaScript, CSS3, and HTML5 canvas.
- **Presentation Model (`src/client/projections.ts`)**: Transforms authoritative server projections (`InspectCurrentLocationResult`) into an immutable presentation model (`PresentationModel`) driving the HUD and canvas.
- **Client Session (`src/client/session.ts`)**: Manages client connection lifecycle, optimistic command dispatch, and authoritative server state reconciliation.

## Milestone 32: Affordance Grouping Taxonomy, Projection-Driven Entity Inspection & Interactive Presentation Shell

Milestone 32 enriches the presentation shell with structured interaction ergonomics:

### 1. Affordance Taxonomy
Categorizes all actionable intents into three distinct conceptual groups:
- `MOVE`: Spatial transitions (`enterBuilding`, `leaveBuilding`, `enterRestaurant`, `exitRestaurant`, `traverseStreet`).
- `INTERACT`: Agent-to-agent interactions (`greetAgent`, `introduceAgent`, `inquireAgentSchedule`).
- `ACT`: Economic and consumable actions (`purchaseOffering`, `startCoffee`).

### 2. Projection-Driven Entity Inspection
- Clicking entities on canvas or in the perception panel displays factual entity attributes projected from the server.
- Zero fabrication: If a field is unprojected, it is never synthesized on the client.
- Transient feedback banners visually alert users to command success or HTTP 422 domain rejections.

## Milestone 33: Authoritative Inventory, Ownership & Consumable Lifecycle

Milestone 33 establishes physical item possession and consumable lifecycles in `WorldState`:

### 1. Physical Possession Model (`src/core/world-state.ts`)
```ts
export interface OwnedItem {
  id: string;              // "item:1", "item:2", ...
  type: 'item';
  offeringId: string;      // "offering:development-coffee"
  name: string;            // Snapshot name at acquisition time
  ownerAgentId: string;    // "agent:dev-player"
  restaurantId: string;    // Originating venue
  sourcePurchaseId: string;// Reference to immutable PurchaseRecord
  acquiredAt: string;      // Timestamp of acquisition
  status: 'available' | 'consumed';
  consumedAt?: string;     // Timestamp when consumed
}
```

### 2. Consumable Lifecycle
1. **Acquisition (1:1 on Purchase)**: A successful purchase of a tangible commercial offering (Coffee, Pan Dulce) atomically appends an `OwnedItem` with `status: 'available'`.
2. **Possession vs. Transaction**: Decouples current physical inventory (`state.items`) from immutable historical records (`state.purchases`).
3. **Consumption on Activity**: Initiating `startHavingCoffee` consumes an available owned coffee item, transitioning its status to `'consumed'` and recording `consumedAt`.

### 3. Schema Version 12 & Automated Migration
- Schema version: `12` (`CURRENT_WORLD_STATE_VERSION = 12`).
- **Automated Migration (`migrateWorldStateV11ToV12`)**: Safely updates schema version 11 files on load by synthesizing `OwnedItem` records for historical purchases and retroactively reconciling consumed items against historic coffee completion records.

## Milestone 34: Unified Consumable Activity Lifecycle

Milestone 34 establishes the authoritative consumable activity lifecycle for both Coffee and Pan Dulce without creating a generic activity engine or duplicating activity subsystems:

### 1. Unified Consumable Action Pattern (`src/core/world-state.ts`)
```text
Concrete public command (startHavingCoffee / startEatingPastry)
        ↓
Shared bounded consumable-activity kernel (executeConsumableActivity)
        ↓
Precondition validation (agent, player, venue, operationalState, availability)
        ↓
Deterministic FIFO OwnedItem selection (oldest acquiredAt, numeric tie-breaker)
        ↓
State transition (item marked 'consumed', playerActivity initialized)
        ↓
Discrete Simulation evaluation (durationMs check, theoretical boundary)
        ↓
Append-only historical ledger (activityCompletions)
```

- **Colocated Activity Configurations**:
  - `having-coffee`: `15 minutes = 900,000 ms`, offering `offering:development-coffee`, duration constant `HAVING_COFFEE_DURATION_MS = 900_000`
  - `eating-pastry`: `15 minutes = 900,000 ms`, offering `offering:development-pastry`, duration constant `EATING_PASTRY_DURATION_MS = 900_000`
- **Zero Architecture Sprawl**: Consumable definitions colocated in `src/core/world-state.ts`. No auxiliary `src/core/activities/eating-pastry.ts` module created.
- **Deterministic FIFO Item Selection**: When consuming an item, the kernel scans `state.items` for eligible items (`status === 'available'`, matching `ownerAgentId`, `offeringId`, and `restaurantId`), selects the oldest by `acquiredAt` ascending (with numeric `item:<N>` tie-breaking), transitions `item.status = 'consumed'`, and records `item.consumedAt = startedAt`.
- **Precondition Rigor & Zero Mutation**: Enforces that player exists, is located in an open restaurant offering the consumable item, possesses an eligible available item, and is not already engaged in an active uncompleted activity. Any failure aborts with zero state mutation.

### 2. Generic Simulation Progression & Unified Completion Ledger
- **Duration-Driven Completion**: `Simulation.tick()` evaluates completion generically via `agent.playerActivity.durationMs` against discrete logical World Time without hardcoded activity type switches.
- **Theoretical Boundary Timestamping**: On completion, `completedAt` is stamped at the exact theoretical boundary (`startedAt + durationMs`), preserving mathematical invariance regardless of when ticks occur.
- **Unified Ledger (`state.activityCompletions`)**: Replaces legacy `coffeeCompletions` with a unified historical collection:
  ```ts
  export interface ActivityCompletionRecord {
    id: string; // "activity-completion:1", "activity-completion:2", ... (or legacy "coffee-completion:N")
    playerId: string;
    restaurantId: string;
    startedAt: string;
    completedAt: string;
    activity: ConsumableActivityType;
    offeringId: string;
    itemId: string | null;
  }
  ```
- **Historical Perception (`inspectPlayerHistory`)**: Returns unified `activityCompletions` along with a backward-compatible `coffeeCompletions` alias.

### 3. Client Affordance Projection & Non-Authoritative Command Routing
- **Projection Boundary (`src/client/projections.ts`)**: Projects `startEatingPastry` affordance (`ACT` group, `'Eat Pan Dulce (Pan Dulce)'`) when player possesses an available Pan Dulce inside an open restaurant and has no active activity in progress.
- **Session Controller & HTTP API**: Authoritative command endpoint `POST /api/commands/startEatingPastry` routes through `SessionController.startEatingPastry`, strictly forbidding client overrides of authoritative identity or item selection fields.

### 4. Schema Version 13 & Non-Fabrication Migration
- **Schema Version**: `13` (`CURRENT_WORLD_STATE_VERSION = 13`).
- **Non-Fabrication Migration (`migrateWorldStateV12ToV13`)**:
  - Legacy `coffeeCompletions` are migrated to `activityCompletions` with original `coffee-completion:N` IDs preserved verbatim and `itemId: null`.
  - Active `playerActivity` with 0 matching consumed items in `v12.items` -> sets `itemId: null`.
  - Active `playerActivity` with exactly 1 matching consumed item in `v12.items` -> truthfully resolves `itemId: match.id`.
  - Active `playerActivity` with >1 ambiguous matching consumed items in `v12.items` -> sets `itemId: null` (never guessing or fabricating).
  - Subsequent runtime completion events sequence monotonically without ID collisions.

## Milestone 35: Authoritative Knowledge Acquisition & Epistemic Retention

Milestone 35 establishes the persistent epistemic substrate for virtual agents, enabling declarative facts acquired through legitimate social inquiry to be authoritatively retained, validated, persisted, updated, and privately inspected:

```text
Social Inquiry Interaction (inquireAgentSchedule)
        ↓
Precondition Validation (co-location, acquaintance, schedule existence)
        ↓
Epistemic Retention (WorldState.knowledge single-record upsert)
        ↓
Discrete Verification (inspectPlayerKnowledge, knower isolation)
        ↓
Process Death & Cold-Start Durability (Schema Version 14)
```

### 1. Epistemic Grounding & Core Architectural Distinctions
- **Knowledge != World Truth**: Knowledge records represent what an agent subjectively believes or has retained from past interactions. They possess zero causal authority over physical reality, simulation schedules, or business opening states. Changes in world truth do not automatically alter retained knowledge.
- **Knowledge != Memory**: Milestone 35 introduces an authoritative, declarative semantic fact substrate without cognitive modeling, forgetting curves, decay, or fuzzy associative recall.
- **Knowledge != History Ledger**: Unlike append-only historical ledgers (`purchases`, `activityCompletions`), `WorldState.knowledge` represents an agent's current epistemic state. Logical identity is defined by the composite key `(agentId, factType, subjectId)`.
- **Single-Record Upsert**: Re-inquiry updates `lastVerifiedAt` and `payload` in-place while strictly preserving `id` and `acquiredAt`, preventing unbounded record accumulation.

### 2. Epistemic Data Model (`src/core/world-state.ts`)
- **Knowledge Types**:
  - `KnowledgeFactType`: `'agent-schedule'`
  - `AgentSchedulePayload`: `{ workplaceId: string, shiftStart: string, shiftEnd: string }`
  - `KnowledgeSource`: `'social-inquiry'`
- **Authoritative Epistemic Record**:
  ```ts
  export interface AgentKnowledgeRecord {
    readonly id: string;            // Deterministic "knowledge:<N>" identifier
    readonly agentId: string;       // Knower (foreign key -> state.agents, agentType === 'player')
    readonly factType: KnowledgeFactType; // Discriminator ('agent-schedule')
    readonly subjectId: string;     // Subject entity (foreign key -> state.agents, agentType === 'npc')
    readonly payload: KnowledgePayload;   // Grounded factual data
    readonly acquiredAt: string;    // ISO-8601 WorldTime when first learned
    readonly lastVerifiedAt: string;// ISO-8601 WorldTime when last confirmed
    readonly source: KnowledgeSource;     // Provenance ('social-inquiry')
    readonly sourceAgentId: string; // Informant (foreign key -> state.agents, agentType === 'npc')
  }
  ```

### 3. Epistemic Privacy & Read Safety
- **Private Knower Inspection (`inspectPlayerKnowledge`)**: Inspects knowledge private to the requesting player. Never exposes knowledge across agents. Rejects non-existent players or NPC callers, and returns defensive clones preventing state mutation.
- **Read Query Isolation (`getScheduleView`)**: The HTTP/UI read projection evaluates inquiry against a defensive state clone (`structuredClone`), guaranteeing zero state mutation and zero disk writes on inspection queries.
- **Zero API/Client Leakage**: The HTTP command allowlist and client UI projections remain strictly bounded; knowledge acquisition occurs authoritatively through kernel inquiry functions.

### 4. Schema Version 14 & Migration
- **Schema Version**: `14` (`CURRENT_WORLD_STATE_VERSION = 14`).
- **Zero-Fabrication Migration (`migrateWorldStateV13ToV14`)**: Migrates valid Version 13 states to Version 14, initializing `knowledge: []` without guessing or fabricating epistemic records.
- **Cascading Persistence Migration**: `LocalFilePersistence` supports automated cascading upgrades (`v11 -> v12 -> v13 -> v14`, `v12 -> v13 -> v14`, `v13 -> v14`) with atomic file writes.

## Milestone 36: Business Domain Authority (AUD-02)

Milestone 36 formalizes the authoritative boundary of the Business Domain, answering precisely what mutable state Business owns, what belongs to other domains, and enforcing strict domain isolation:

```text
Business Domain Authority
├── Owned State:
│   ├── Restaurant.operationalState ('open' | 'closed')
│   ├── Restaurant.operationalSince (ISO 8601 timestamp)
│   └── Commercial Offering Catalog (state.offerings: terms & pricing)
└── Explicit Domain Delegations:
    ├── Spatial Presence & Containment → Spatial / Agent
    ├── Worker Employment & Activity → Activity / Agent
    ├── Monetary Truth & Balances → Economy
    ├── Physical Possessions (items) → Item / Possession
    ├── Situational Opportunities → Opportunity
    └── Agent Epistemics → Knowledge
```

### 1. Authoritative Operational Transitions (`src/core/business.ts`)
- **`transitionRestaurantOperationalState(state, restaurantId, targetState, worldTime)`**:
  - Exclusive authoritative state transition for opening and closing commercial venues.
  - Deterministic precondition order: restaurant existence, valid target state (`'open' | 'closed'`), valid temporal non-future timestamp.
  - Strict idempotency: transitions to the current state succeed with `changed: false` and preserve original `operationalSince`.
  - Zero state mutation on any precondition violation.
- **`isRestaurantOpen(state, restaurantId)`**:
  - Authoritative pure query for operational availability.

### 2. Strict Domain Isolation Invariants
- **No Forced Eviction**: Closing a restaurant does NOT alter customer `locationId` (agents are not arbitrarily teleported).
- **No Monetary Authority**: Business domain cannot unilaterally create, debit, or credit balances; financial fund movement requires Economy domain authority (`purchaseOffering`).
- **No Staffing / Employment Engine**: Worker presence and activity belong to Activity/Agent domains; Business observes them only as preconditions.
- **No Epistemic Bleed**: Business transitions do not directly mutate agent knowledge; agents must acquire facts through valid epistemic observation or social interaction.

### 3. Business Authority Invariant Validation
- **`validateBusinessAuthority(state)`**:
  - Integrated into `validateWorldState`, enforcing valid operational states, `operationalSince <= worldTime`, spatial building containment, non-negative finite integer offering prices, and catalog referential integrity.

> [!NOTE]
> **World Laws Status**: PENDING DOCUMENT RECONCILIATION.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Tests

Executes all **automated unit, spatial, interaction, economic, routine, perception, social, runtime server, client boundary, inventory, activity lifecycle, epistemic retention, and business authority tests across 42 test suites**:

```bash
npm test
```

### 3. Build

Compiles TypeScript source code to JavaScript in `dist/` and copies static client assets:

```bash
npm run build
```

### 4. Run Development Mode

Starts the authoritative headless world server from TypeScript source using `tsx`:

```bash
npm run dev
```

### 5. Run Production / Compiled Mode

Starts the compiled world server from `dist/`:

```bash
npm run start
```

### 6. Interactive Visual Client Browser Server

Launches the world server and advances the clock to 10:00 UTC so that venues, shifts, and offerings are active, ready for browser interaction on `http://127.0.0.1:3000`:

```bash
npx tsx scripts/start-browser-server.ts
```

### 7. Run All Demonstrations

Executes all 29 automated milestone demonstration scripts sequentially:

```bash
npm run demo:all
```

---

## Demonstration Catalog

Each demonstration script exercises a complete, self-contained milestone slice with strict assertions and multi-runtime persistence checks:

| Script Command | Milestone / Subject | Description |
| :--- | :--- | :--- |
| `npm run demo:persistence` | M1–M4 Foundation | Multi-restart persistence reconstruction and state integrity |
| `npm run demo:simulation` | M1–M4 Foundation | Discrete tick coordination, NPC state progression, and offline leaps |
| `npm run demo:spatial` | M1–M4 Foundation | Spatial hierarchy containment and instantaneous movement |
| `npm run demo:restaurant` | M5 Operations | Operational schedule [09:00, 17:00 UTC) and state transitions |
| `npm run demo:restaurant-entry` | M6 Interaction | Player restaurant entry, precondition enforcement, and state isolation |
| `npm run demo:commercial-offering` | M7 Offering | Commercial offering inspection and operational availability linkage |
| `npm run demo:purchase` | M8 Economy | Atomic balances debit/credit and insufficient funds boundary |
| `npm run demo:activity` | M9 Activity | 15-minute time-bound Having Coffee activity progression |
| `npm run demo:spatial-movement` | M10 Movement | Interior restaurant exit and multi-level spatial movement |
| `npm run demo:agent-interaction` | M11 Interaction | Co-located agent greeting and zero state mutation invariant |
| `npm run demo:world-perception` | M12 Perception | Read-only projection boundary (ObservableAgent, ObservableOffering) |
| `npm run demo:purchase-history` | M13 History | Persistent immutable PurchaseRecord ledger with monotonic IDs |
| `npm run demo:coffee-completion-history` | M14 History | Persistent CoffeeCompletionRecord facts beyond commerce |
| `npm run demo:npc-routine` | M15 Routine | Deterministic NPC commute and workplace spatial routine |
| `npm run demo:building-traversal` | M16 Traversal | Bidirectional building entry and street containment validation |
| `npm run demo:player-history` | M17-A Perception | Player-scoped historical perception (inspectPlayerHistory) |
| `npm run demo:reciprocal-greeting` | M18-A Social | Contextual NPC reciprocal greetings based on active work state |
| `npm run demo:npc-offering-action` | M19-A Commerce | Dynamic Pan Dulce offering publishing tied to NPC work presence |
| `npm run demo:street-traversal` | M20-A Traversal | Sibling street navigation within neighborhood boundary |
| `npm run demo:spatial-perception` | M21-A Affordances | Street and building spatial affordance perception |
| `npm run demo:npc-neighborhood-routine` | M22 Routine | Multi-phase 24-hour NPC routine with commute encounters |
| `npm run demo:world-opportunity` | M23 Opportunity | Contextual world opportunity projection (Pan Dulce available) |
| `npm run demo:opportunity-decision` | M24 Decision | Opportunity perception to economic purchase decision cycle |
| `npm run demo:social-acquaintance` | M25 Social | Persistent dyadic acquaintance and canonical identity pairs |
| `npm run demo:social-inquiry` | M26 Inquiry | Grounded relational inquiry (querying NPC shift schedule) |
| `npm run demo:spatial-opportunity` | M27 Storefront | Opportunity perception across building storefront boundaries |
| `npm run demo:runtime-server` | M29 Runtime | Authoritative HTTP runtime, session controller, and FIFO persistence |
| `npm run demo:visual-client` | M30 Client | Visual client presentation shell, Canvas 2D, and HUD integration |
| `npm run demo:knowledge-acquisition` | M35 Knowledge | Authoritative knowledge acquisition, epistemic retention, upsert, privacy, and durability |
| `npm run demo:business-domain-authority` | M36 Business | Authoritative business operational transitions, domain isolation, and precondition enforcement |

---

## Intentional Exclusions (Current Scope)

To preserve strict architectural clarity and avoid premature abstraction, the following systems are **intentionally NOT implemented** at the current milestone level:
- Generative AI / LLM dynamic prompt injection or ungrounded dialogue generation (all dialogues and schedules are factual projections from authoritative fixtures)
- Real-time multiplayer networking, WebSockets, or multi-client replication (local authoritative HTTP server with serialized FIFO queue)
- Continuous background tick loop or infinite timers (discrete simulation steps remain deterministic and caller-invoked)
- Pathfinding meshes (NavMesh), continuous physical collision, or line-of-sight raycasting (hierarchical spatial containment remains the authoritative topological source of truth)
- Multi-currency forex conversion, credit card payment gateways, taxes, tips, or banking loans (integer-only minor currency units USD)
- External authentication protocols, OAuth, JWTs, or multi-tenant database clusters
