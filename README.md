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

## Milestone 37: Asset, Property and Inventory Authority (AUD-03)

Milestone 37 formalizes the authority boundaries for Property, Assets, Items, Products, Offerings, Vehicles, Buildings, Ownership, Possession, Inventory, Location, Physical condition, Economic value, and Usage, establishing clear distinctions between what the world model represents, which domain owns each mutable datum, and which transitions are valid:

### 1. Conceptual Classification Matrix

| Concept | Current Status |
| :--- | :--- |
| **Property / Real Estate** | Not currently represented |
| **Generic Assets** | Not currently represented |
| **Items** | Authoritative persistent state (`OwnedItem` in `state.items`) |
| **Products** | Catalog/descriptive concept |
| **Offerings** | Business catalog/descriptive state (`Offering` in `state.offerings`) |
| **Vehicles** | Not currently represented |
| **Buildings** | Authoritative spatial entities (`Place` with `type === 'building'`), not real-estate ownership |
| **Ownership** | Limited current attribution through `ownerAgentId`; legal ownership not modeled |
| **Possession** | Current practical personal possession/custody of acquired items |
| **Inventory** | Derived query/projection (`getPlayerAvailableItems`), not a generalized inventory subsystem |
| **Location** | Agent location currently authoritative (`agent.locationId`); item location is derived for current scope |
| **Consumable Lifecycle State** | `available → consumed` (`OwnedItem.status` & `consumedAt`) |
| **General Physical Condition** | Not currently represented (durability, wear, damage, repair are not modeled) |
| **Historical Transaction Price** | `PurchaseRecord.amountMinor` (immutable evidence of exchange amount) |
| **Current Economic Value** | Not currently represented (market value, resale value, and appraisal are not modeled) |
| **Usage** | Consumable activity/lifecycle records (`playerActivity`, `activityCompletions`) |

### 2. Core Architectural Distinctions & Semantic Boundaries
- **Ownership vs Possession**: In the current model, `ownerAgentId` identifies the agent to whom an acquired personal item is attributed. The model currently treats this as personal possession/custody for acquired consumables. Legal ownership rights, transfer, lending, custody delegation, and title are not modeled.
- **Consumable Lifecycle State vs Physical Condition**: `OwnedItem.status` (`'available' | 'consumed'`) represents consumable lifecycle state, not general physical condition. General physical condition (durability, wear, damage, degradation, repair) is not currently represented.
- **Historical Transaction Price vs Economic Value**: `PurchaseRecord.amountMinor` is an immutable historical transaction price recording evidence of an exchange. Current economic value, market value, appraisal, and resale value are not currently represented.
- **Commercial Catalog vs Physical Stock**: Offerings in `state.offerings` are descriptive business catalog specifications. They are not physical warehouse stock, inventory counters, or owned items. Retiring or modifying an offering does not alter existing owned items.
- **Buildings vs Real-Estate Property**: Buildings in `state.places` represent spatial containment geometry and hierarchy. They are not real-estate assets, deeded properties, or agent-owned capital.
- **Item Location (Scope Simplification)**: Currently acquired personal consumable items do not have independent spatial entities. Their practical location is derived from the owning agent's location. This is a scope simplification appropriate to the current consumable-item model, not a permanent architectural prohibition against future independent item locations (e.g. dropped objects, packages, or storage).
- **Agent Possession Scope**: In the current scope, acquired consumable items are associated with player agents. NPC possession/acquisition is not currently implemented; this is a current scope limitation, not a permanent world law.
- **Strictly Unrepresented**: Real estate deeds, generic asset registries, vehicles, durability/wear systems, dynamic market valuations, and warehouse supply chains are not modeled.

### 3. Authoritative Item Lifecycle Transition (`src/core/item.ts`)
- **`consumeOwnedItem(state, itemId, worldTime)`**:
  - The exclusive authoritative function for consuming an OwnedItem.
  - Deterministic precondition verification:
    1. Item exists in `state.items` (`item-not-found`)
    2. Item status is `'available'` (`item-already-consumed`)
    3. Timestamp is a valid ISO-8601 string (`invalid-timestamp`)
  - Guarantees zero state mutation on failure.
  - Atomically sets `status = 'consumed'` and `consumedAt = worldTime`.
  - Zero cross-domain interference: balances, restaurant operational states, locations, and knowledge are never mutated.
- **Pure Queries**:
  - `getOwnedItem(state, itemId)`: Retrieves item by ID without mutation.
  - `getPlayerAvailableItems(state, playerId, offeringId?)`: Filters available items by owner and optionally offering.
  - `isItemAvailable(state, itemId)`: Pure boolean evaluation of item availability.

### 4. Item Authority Invariant Validation (`validateItemAuthority`)
- Integrated into `validateWorldState`, enforcing:
  1. Monotonic format `item:<N>` and global unique IDs.
  2. Entity type strictly `'item'`.
  3. Offering ID in qualifying offerings list.
  4. Non-empty item name.
  5. Owner agent exists and is player (current scope limitation).
  6. Restaurant exists.
  7. Valid `acquiredAt` timestamp `<= state.worldTime`.
  8. Status strictly `'available'` or `'consumed'`.
  9. `consumedAt` is `null` when available; valid timestamp `>= acquiredAt` when consumed.
  10. Bidirectional 1:1 referential cardinality between qualifying purchases and OwnedItems.

> [!NOTE]
> **World Laws Status**: PENDING DOCUMENT RECONCILIATION.

## Milestone 38: Real-World Spatial Foundation

Milestone 38 instantiates the first small, coherent fragment of the real Ciudad Juárez world and proves the existing coordinate-free topological spatial architecture against verified geography:

### 1. Real-World Geographic Fragment (`src/core/seed.ts`)
- **Root City**: `city:ciudad-juarez` ("Ciudad Juárez", `parentId: null`)
- **District**: `district:centro-historico` ("Centro Histórico", `parentId: 'city:ciudad-juarez'`)
- **Neighborhood**: `neighborhood:zona-centro` ("Zona Centro", `parentId: 'district:centro-historico'`)
- **Primary Street**: `street:avenida-benito-juarez` ("Avenida Benito Juárez", `parentId: 'neighborhood:zona-centro'`)
- **Sibling Street**: `street:avenida-16-de-septiembre` ("Avenida 16 de Septiembre", `parentId: 'neighborhood:zona-centro'`)
- **Residential Building**: `building:real-world-residence` ("Residential Building", `parentId: 'street:avenida-benito-juarez'`)
- **Commercial Building**: `building:kentucky-club-building` ("Kentucky Club Building", `parentId: 'street:avenida-benito-juarez'`)
- **Destination Restaurant**: `restaurant:kentucky-club` ("Kentucky Club", `buildingId: 'building:kentucky-club-building'`)
- **Player Agent**: `agent:real-world-player` ("Ciudad Juárez Player", starting at `locationId: 'building:real-world-residence'`)

### 2. Representation Choices vs. World Model Laws
- Modeling `Centro Histórico` as a `district` and `Zona Centro` as a `neighborhood` are pragmatic representation choices within the existing `Place` containment hierarchy, not immutable ontological laws.
- The residential starting location is modeled as a generic `"Residential Building"` to protect private residential data without fabricating real residents or private addresses.
- `restaurant:kentucky-club` is grounded in its verified public address (*Av. Benito Juárez 643, Centro, 32000 Ciudad Juárez, Chihuahua*).
- Kentucky Club's `operationalState: 'open'` and `operationalSince` are technical simulation defaults required by `enterRestaurant()` preconditions, not a verified real-world schedule claim.
- Mandatory schema fields `balanceMinor: 0` and `currency: 'USD'` on `Restaurant` and `Agent` are technical schema prerequisites under Schema Version 14; zero economic behavior, offerings, or pricing are introduced. `offerings` is strictly an empty array `[]`.

### 3. Complete Topological Spatial Flow
```text
Player
  ↓
building:real-world-residence (Home)
  ↓ [leaveBuilding]
street:avenida-benito-juarez (Avenida Benito Juárez)
  ↓ [inspectCurrentLocation]
building:kentucky-club-building (Commercial Building)
  ↓ [enterBuilding]
building:kentucky-club-building
  ↓ [enterRestaurant]
restaurant:kentucky-club (Kentucky Club)
```

### 4. Sibling Street Traversal
- The existing `traverseToStreet()` operation allows bidirectional navigation between sibling streets in the same neighborhood (`street:avenida-benito-juarez <-> street:avenida-16-de-septiembre`).

### 5. Architectural Invariants
- **Schema Version 14 Preserved**: No schema migration, no new entity types, and no new spatial subsystems.
- **Zero Coordinates or Metrics**: No $x, y, z$, GPS, latitude/longitude, distance meters, pathfinding, or physics.
- **Discrete Transitions**: Movement remains instantaneous topological state transitions preserving `worldTime`.
- **Backward Compatibility**: Synthetic development seed fixtures (`createDevelopmentSeedWorld`) remain 100% intact with zero regressions across pre-existing milestones.

## Milestone 39: Order & Service Fulfillment Foundation

Milestone 39 implements the minimal, deterministic Order & Service Fulfillment Foundation supporting a concrete restaurant counter experience at Kentucky Club:

### 1. Concrete Customer Experience
```text
Player (at Kentucky Club)
  ↓
inquireRestaurantService(state, customerId, staffNpcId)
  ↓ Employee Prompt: "Pickup or delivery?"
placeOrder(state, { customerId, restaurantId, lines, fulfillmentMode: 'pickup' })
  ↓ Atomic debit/credit + 1:1 PurchaseRecord(s) + Order entity ('preparing')
Simulation.tick() progresses time past readyAt (+5 min)
  ↓ Order transitions: 'preparing' -> 'ready'
collectOrder(state, customerId, orderId)
  ↓ Order transitions: 'ready' -> 'fulfilled' + 1:1 OwnedItem(s) instantiated in player possession
```

### 2. Domain Affordances & Operations (`src/core/order.ts`)
- **Service Affordance Query (`inquireRestaurantService`)**: Authoritative, read-only query returning employee prompt (`"Pickup or delivery?"`), available offerings, supported modes (`['pickup']`), and deferred modes (`['delivery']`) when customer and staff are co-located at an open restaurant.
- **Explicit Delivery Deferral**: Delivery mode is structurally recognized in the domain schema (`FulfillmentMode = 'pickup' | 'delivery'`), but deferred cleanly with zero economic or entity mutation (`code: 'delivery-mode-deferred'`).
- **Atomic Order Placement & Settlement (`placeOrder`)**:
  - Validates customer co-location, restaurant operational state, line quantities, currency alignment, and customer funds.
  - Atomically debits customer balance, credits restaurant balance, and creates exactly one `PurchaseRecord` per unit ordered (preserving the M33/M37 1:1 cardinality invariant).
  - Instantiates `Order` entity in `status: 'preparing'` with deterministic `readyAt = createdAt + 5 minutes`.
- **Deterministic Preparation Progression (`tickOrderPreparation`)**:
  - Evaluated exclusively during explicit `Simulation.tick()` calls.
  - Transitions in-flight orders from `'preparing'` to `'ready'` when `worldTime >= readyAt`.
  - Zero background timers, async event loops, or ungrounded schedulers.
- **Authoritative Collection & Item Instantiation (`collectOrder`)**:
  - Enforces customer co-location at restaurant, customer ownership of order, and `order.status === 'ready'`.
  - Transitions order to `'fulfilled'` (setting `fulfilledAt`).
  - Instantiates exactly one `OwnedItem` per ordered unit in customer possession (`status: 'available'`), binding `sourcePurchaseId` 1:1 to the corresponding purchase record.

### 3. Reconciled Order ↔ Purchase ↔ Item Cardinality
- Direction B invariant preserved: While an order is in-flight (`'preparing'` or `'ready'`), its purchases exist in `state.purchases` as pending order fulfillment.
- Upon collection, each unit receives an `OwnedItem` bound 1:1 to its `PurchaseRecord`. Fulfilled orders satisfy `purchases.length === items.length` per order.

### 4. Schema Migration Version 15 & Persistence
- `CURRENT_WORLD_STATE_VERSION = 15`.
- Added `orders: Order[]` collection to `WorldState`.
- Implemented `WorldStateV14` validator and `migrateWorldStateV14ToV15` migration transform.
- Updated `LocalFilePersistence.load()` to cascade migrations across v11, v12, v13, and v14 up to v15.

## Milestone 46: Deterministic NPC Decision & Behavior

Milestone 46 explores and validates the boundary between NPC autonomy and World Authority by introducing the first deterministic NPC decision/behavior cycle in MyVirtualCommunity:

```text
NPC CONTEXT EVALUATION (Pure / Read-Only)
    ↓
DETERMINISTIC DECISION ('no-action' | 'npc-schedule-disclosure')
    ↓
ACTION PROPOSAL / INVOCATION
    ↓
WORLD AUTHORITY (Social Domain / World Core)
    ↓
INDEPENDENT VALIDATION & PRECONDITIONS
    ↓
ATOMIC STATE TRANSITION (AgentKnowledgeRecord created)
    ↓
OBSERVABLE CONSEQUENCE (Client Toast / Retained Epistemic State)
```

### 1. Bounded Experimental Behavior Rule
- **Rule**: When an active NPC is co-located with a player with whom they share mutual acquaintance, and the player does not already possess the NPC's work schedule knowledge, the NPC deterministically proposes schedule disclosure.
- **Architectural Scope**: This is an intentionally bounded experimental behavior rule to validate the decision/proposal/authority boundary without introducing general social intelligence, dialogue trees, LLMs, mood, emotions, beliefs, personality, goal planners, or queue infrastructure.

### 2. Pure Context Evaluation (`evaluateNpcScheduleDisclosureContext`)
- Evaluates the NPC context against the current WorldState in a pure read-only function with zero side effects, zero disk writes, and zero state mutation.
- Returns either `'npc-schedule-disclosure'` or `'no-action'`.

### 3. Authoritative Domain Authority (`issueNpcScheduleDisclosure`)
- The Social Domain / World Core remains the exclusive authority over world state mutation. The NPC proposal is not authoritative.
- Independently re-validates all domain preconditions:
  1. NPC existence (`npc-not-found`)
  2. Player existence (`player-not-found`)
  3. NPC active state (`npc-not-active`)
  4. Co-location (`agents-not-co-located`)
  5. Mutual acquaintance (`not-acquainted`)
- Upon success, appends exactly one `AgentKnowledgeRecord` with `source: 'npc-initiative'` to the candidate state, establishing clear epistemic provenance distinct from direct player inquiry (`'social-inquiry'`).
- Failure atomicity: strictly zero state mutations on candidate state if any precondition fails.
- Commit publication: The simulation/session commit publishes the candidate state only after persistence succeeds (no unpersisted memory commit).

### 4. Simulation Tick Integration & Strict Idempotency
- Evaluated synchronously in-process during explicit `Simulation.tick()` invocations.
- Strict idempotency: Once the knowledge record is recorded, subsequent simulation ticks evaluate context to `'no-action'`.
- Spatial departure and return does not cause re-disclosure due to persistent epistemic retention.

### 5. Schema Version 16 & Cascading Migration
- Bumped schema version to `16` (`CURRENT_WORLD_STATE_VERSION = 16`).
- Expanded `KnowledgeSource` type: `'social-inquiry' | 'npc-initiative'`.
- Implemented `WorldStateV15` schema interface, `validateWorldStateV15`, and `migrateWorldStateV15ToV16`.
- Updated `LocalFilePersistence.load()` to cascade migrations automatically (`v11 -> v12 -> v13 -> v14 -> v15 -> v16`) with atomic disk writes.

### 6. Client Feedback & Visual Verification
- Connected to client HUD via `SessionController.stepSimulation` to surface `"Development NPC shared work schedule with you."` notice.
- Validated through end-to-end browser execution, inspection HUD, subsequent advance idempotency, and page reload state reconciliation.

## Milestone 47: Deterministic NPC Commercial Action

Milestone 47 converts the legacy ambient offering-publication mechanism into an explicitly attributed, deterministic NPC commercial action, establishing the first deterministic commercial decision boundary in MyVirtualCommunity:

```text
WORLD STATE
    ↓
NPC CONTEXT EVALUATION (Pure / Read-Only)
    ↓
DETERMINISTIC DECISION ('no-action' | 'make-offering-available')
    ↓
EXISTING DOMAIN AUTHORITY (makeDevelopmentOfferingAvailable)
    ↓
AUTHORITATIVE PRECONDITION RE-VALIDATION
    ↓
PERSISTENT WORLD CONSEQUENCE (state.offerings update)
    ↓
CLIENT PROJECTION & HUD NOTIFICATION
    ↓
PLAYER OBSERVATION & ECONOMIC AFFORDANCE (Purchase Pan Dulce)
```

### 1. Concrete Commercial Decision Rule
- **Rule**: When the development NPC is active (`activityState === 'active'`) and co-located at the development restaurant (`locationId === 'restaurant:development-restaurant'`), the restaurant is open (`operationalState === 'open'`), and the development pastry offering (`offering:development-pastry`) is not currently present in `state.offerings`, the NPC deterministically decides to publish the offering.
- **Architectural Scope**: Converts ambient world-tick logic into an explicitly attributed NPC decision. Zero generic AI engines, behavior trees, utility scorers, planners, personality, emotion, mood, dialogue engines, proposal queues, or event buses.

### 2. Pure Context Evaluation (`evaluateOfferingPublicationContext`)
- Pure function in `src/core/simulation.ts` reading candidate `WorldState`, `npcId`, and `restaurantId`.
- Guarantees zero side-effects, zero state mutation, and returns `'make-offering-available' | 'no-action'`.

### 3. Authoritative Domain Execution (`makeDevelopmentOfferingAvailable`)
- Existing authoritative domain function in `src/core/world-state.ts` is invoked synchronously by `Simulation.tick()`.
- Independently re-validates all domain rules:
  1. NPC existence and type (`agent-not-found`, `agent-not-npc`)
  2. NPC active state (`npc-not-active`)
  3. Co-location at restaurant (`npc-not-at-restaurant`)
  4. Restaurant open operational state (`restaurant-closed`)
  5. Offering catalog existence and idempotency (`offering-already-available`)
- Upon success, publishes Pan Dulce offering into `state.offerings` and records transitions in `offeringTransitions` and `npcDecisionTransitions`.
- Failure atomicity: strictly zero state mutations if any precondition fails.

### 4. Single Causal Trigger Invariant
- Replaces legacy ambient trigger in `Simulation.tick()` completely.
- If the NPC is absent, idle, or off-shift, the offering is NOT published.

### 5. Schema Preservation & Persistence
- Schema Version 16 is preserved with zero schema changes or migrations required (`CURRENT_WORLD_STATE_VERSION = 16`).
- Published offering survives process termination, restarts, and offline simulation leaps.
- Downstream economic affordances (purchase, order, item consumption) remain fully functional.

### 6. Client Feedback & Visual Verification
- Connected to client HUD via `SessionController.stepSimulation` and `ClientSession` to display: `"Development NPC made Pan Dulce available at the restaurant."`
- Real browser verification conducted with Chrome DevTools MCP validating:
  1. Initial state (08:00 UTC, closed, dev-npc at home, no pastry)
  2. Shift progression to 10:00 UTC (counter open, NPC on shift, decision fired, Pan Dulce published)
  3. Downstream purchase execution ($2.50 debited, inventory updated, "Eat Pan Dulce" button unlocked)
  4. Persistence reload reconciliation (clean state restoration from disk)
  5. Strict idempotency upon subsequent simulation advances (no duplicate offerings or duplicate decisions)

## Milestone 48: Schedule-Informed Action Consideration

Milestone 48 implements the smallest concrete realization of the **Agent-Specific Action Consideration** contract in MyVirtualCommunity, proving that an agent's retained declarative knowledge can inform their perception and action consideration without altering physical world authority:

```text
WORLD STATE
    +
AGENT KNOWLEDGE (agent-schedule)
    ↓
AGENT-SPECIFIC ACTION CONSIDERATION (Pure / Derived)
    ↓
PLAYER DECISION / INTENT
    ↓
EXISTING DOMAIN ACTION (enterRestaurant)
    ↓
EXISTING SPATIAL AUTHORITY & PRECONDITIONS
    ↓
TRANSITION
```

### 1. Architectural Scope & Epistemic Boundary
- **Pure Derived Representation**: Action considerations are computed on-demand during read-side projection (`inspectCurrentLocation`) and are **strictly non-authoritative**.
- **Zero Persistence**: Considerations are never stored in `WorldState` (zero `state.considerations`), never written to disk, and never generate historical event records.
- **Invariants Proven**:
  - `ACTION CONSIDERATION ≠ DOMAIN AUTHORIZATION`: A consideration suggests a reason to act, but domain actions (`enterRestaurant`) independently validate all spatial and operational preconditions.
  - `ACTION CONSIDERATION IS NOT A PRECONDITION`: A player without schedule knowledge can still execute `enterRestaurant` with identical spatial authority.
  - `SCHEDULE KNOWLEDGE ≠ CURRENT NPC PRESENCE`: The consideration truthfully reflects epistemic schedule awareness (`"Development NPC is scheduled to work now."`), NOT physical presence. Even if the NPC is absent or delayed, the schedule fact remains true.
  - `EPISTEMIC ASYMMETRY`: In the exact same physical world state, an agent with schedule knowledge receives the action consideration, while an agent without knowledge does not.

### 2. Pure Consideration Evaluator (`src/core/action-consideration.ts`)
- **`evaluateScheduleInformedRestaurantConsideration(state, playerId, npcId, restaurantId)`**:
  - Pure function taking `WorldState`, `playerId`, `npcId`, and `restaurantId`.
  - Type-only import of `WorldState` (`import type { WorldState } from './world-state.js'`) ensuring zero runtime circular dependencies.
  - Evaluates:
    1. Player is located at the containing building (`player.locationId === restaurant.buildingId`).
    2. Player holds verified `agent-schedule` knowledge for the NPC.
    3. The schedule fact matches the target restaurant (`payload.workplaceId === restaurantId`).
    4. Current World Time falls within the scheduled working window (using shared `isTimeWithinScheduleInterval`).
  - Returns `ActionConsideration | null`:
    ```ts
    {
      action: 'enterRestaurant',
      targetId: 'restaurant:development-restaurant',
      reason: 'schedule-knowledge',
      description: 'Development NPC is scheduled to work now.'
    }
    ```
- Shared UTC interval logic extracted to `src/core/development-npc-schedule.ts` (`isTimeWithinScheduleInterval`), eliminating any dependency from action consideration into simulation orchestration.

### 3. Perception & Client Presentation
- **Perception Integration (`src/core/world-state.ts`)**:
  - `inspectCurrentLocation` evaluates considerations when the player is located at a building containing a restaurant.
  - Attaches `actionConsiderations` to `ObservedLocation` and `InspectCurrentLocationResult`.
- **Client Presentation Shell (`src/client/projections.ts`, `src/client/renderer.ts`)**:
  - Maps consideration to contextual affordance hint (`affordance.hint`), rendering an informative subtitle under the `Enter Development Restaurant` button.
  - Exposes consideration in Entity Inspection when inspecting the restaurant entity.
  - Negative case: when knowledge is absent or outside the schedule window, the hint and inspection note are completely omitted, but the action button remains fully clickable and authoritative.

### 4. Schema Version 16 Preserved
- Because Action Considerations are purely derived read-side projections, **Schema Version 16 is preserved** (`CURRENT_WORLD_STATE_VERSION = 16`).
- Zero schema modifications, zero migrations, and zero persistent mutations.

## Milestone 49: Opportunity-Informed Commercial Action Consideration

Milestone 49 extends the Agent-Specific Action Consideration pattern from M48 into the commercial domain, demonstrating that an observable world opportunity (an active pastry offering made available by an NPC) informs an agent's commercial action consideration while leaving existing economic domain authority fully sovereign:

```text
WORLD STATE (NPC on shift + restaurant open + Pan Dulce published)
    ↓
OBSERVABLE OPPORTUNITY (active Pan Dulce offering)
    ↓
AGENT-SPECIFIC ACTION CONSIDERATION (purchaseOffering: Pan Dulce)
    ↓
PLAYER DECISION / INTENT
    ↓
EXISTING ECONOMIC AUTHORITY (purchaseOffering)
    ↓
VALIDATED TRANSITION (atomic balance debit + OwnedItem creation)
```

### 1. Architectural Scope & Epistemic Boundary
- **Pure Derived Representation**: Action considerations are evaluated dynamically during read-side projection (`inspectCurrentLocation`) and are **strictly non-authoritative**.
- **Zero Persistence**: Considerations are never stored in `WorldState` (zero `state.considerations`), never persisted to disk, and never generate audit records.
- **Invariants Proven**:
  - `CONSIDERATION ≠ AUTHORIZATION`: Consideration answers *"Is purchasing this offering something this agent can reasonably consider in the current context?"*, NOT *"Can the purchase currently succeed?"*. Even if the player has insufficient funds ($0.00 balance), the action consideration is still derived (`considered = true`) because the offering is an active, observable opportunity. Existing `purchaseOffering` independently enforces economic preconditions and rejects unauthorized purchases with `insufficient-funds`.
  - `CONSIDERATION IS NOT A PRECONDITION`: The existing `purchaseOffering()` domain function remains unchanged and does not require an active consideration to execute.
  - `STRICT SPATIAL SCOPE`: Commercial considerations are evaluated strictly when the player is co-located inside the restaurant (`player.locationId === restaurant.id`), preventing leakage into building lobbies or street spaces.

### 2. Pure Consideration Evaluator (`src/core/action-consideration.ts`)
- **`evaluateOpportunityInformedCommercialConsideration(state, playerId, restaurantId, offeringId)`**:
  - Pure function taking `WorldState`, `playerId`, `restaurantId`, and optional `offeringId`.
  - Uses type-only import of `WorldState` (`import type { WorldState } from './world-state.js'`), maintaining zero circular dependencies.
  - Scoped specifically to `DEVELOPMENT_PASTRY_OFFERING_ID` (`'offering:development-pastry'`).
  - Evaluates:
    1. Player exists and is located inside the target restaurant.
    2. Restaurant exists and is currently open (`operationalState === 'open'`).
    3. The pastry offering exists in `state.offerings` and is active.
    4. Development NPC is active (`activityState === 'active'`) and co-located at the restaurant.
  - Returns `ActionConsideration | null`:
    ```ts
    {
      action: 'purchaseOffering',
      targetId: 'offering:development-pastry',
      reason: 'active-opportunity',
      description: 'Development NPC made fresh Pan Dulce available at the restaurant.'
    }
    ```

### 3. Perception & Client Presentation
- **Perception Integration (`src/core/world-state.ts`)**:
  - `inspectCurrentLocation` evaluates commercial considerations when the player is located inside a restaurant.
  - Attaches derived considerations to `ObservedLocation.actionConsiderations`.
- **Client Presentation Shell (`src/client/projections.ts`, `src/client/renderer.ts`)**:
  - In `createPresentationModel` for `RESTAURANT`, matching considerations are attached to `affordance.hint`.
  - The UI renders the hint as a subtitle inside the `Buy Pan Dulce ($2.50)` action button using existing `.action-hint` CSS.
  - `findInspectableEntity` displays `Consideration: Development NPC made fresh Pan Dulce available at the restaurant.` when inspecting the Pan Dulce offering entity.

### 4. Schema Version 16 Preserved
- Because Action Considerations are purely derived read-side projections, **Schema Version 16 is preserved** (`CURRENT_WORLD_STATE_VERSION = 16`).
- Zero schema modifications, zero migrations, and zero persistent mutations.

## Milestone 50: Peer-to-Peer Physical Possession Handoff

Milestone 50 introduces the first authoritative peer-to-peer physical possession handoff in MyVirtualCommunity, allowing an agent possessing an available consumable item to transfer physical custody directly to a co-located, acquainted peer:

```text
Agent A possesses available consumable OwnedItem
        ↓
Agent A and Agent B are co-located
        ↓
Interpersonal condition satisfied (isAgentAcquainted === true)
        ↓
Agent A initiates handoff (transferItemPossession / POST /api/commands/giveItem)
        ↓
Authoritative World Core validates 8 deterministic preconditions
        ↓
Physical custody transitions (item.ownerAgentId = Agent B)
        ↓
Commercial provenance preserved (item.sourcePurchaseId unchanged)
        ↓
Authoritative World State persisted atomically to disk (Schema Version 16)
```

### 1. Semantic Boundary: Possession vs. Legal Ownership
- **Custody Attribution Only**: `OwnedItem.ownerAgentId` represents current physical custody/possession ('player' | 'npc'). It does **not** represent legal ownership, title, deed, trade rights, lending, collateral, or a generalized inventory system.
- **Immutable Commercial Provenance**: `item.sourcePurchaseId` permanently points to the original commercial `PurchaseRecord` (`sourcePurchase.playerId`). Following an authorized handoff, `sourcePurchase.playerId` and `item.ownerAgentId` are explicitly permitted to diverge (`sourcePurchase.playerId !== item.ownerAgentId`).
- **Zero Economic Side Effects**: Physical handoff is purely interpersonal custody transfer. Balances are untouched, no money changes hands, and no commercial ledger records are created or mutated.
- **Zero Autonomous Consumption**: NPCs do not autonomously consume items in their possession; item custody transitions do not trigger consumption.

### 2. Authoritative Domain Kernel (`src/core/item.ts`)
- **`transferItemPossession(state, params)`**:
  - Deterministic precondition verification:
    1. Sender exists in `state.agents` (`sender-not-found`).
    2. Recipient exists in `state.agents` (`recipient-not-found`).
    3. Sender and recipient are distinct (`cannot-transfer-to-self`).
    4. Both agents are co-located at the exact same location (`agents-not-co-located`).
    5. Sender and recipient are mutually acquainted (`agents-not-acquainted`).
    6. Item exists in `state.items` (`item-not-found`).
    7. Item is currently in the possession of the sender (`item.ownerAgentId === senderId`) (`item-not-in-possession`).
    8. Item is available (`item.status === 'available'`) (`item-already-consumed`).
  - Transition:
    - Atomically updates `item.ownerAgentId = toAgentId`.
    - Preserves all other item fields (`id`, `offeringId`, `name`, `restaurantId`, `sourcePurchaseId`, `acquiredAt`, `status`, `consumedAt`).
  - Zero state mutation on any precondition violation.

### 3. Invariant Reconciliation
- **`validateItemAuthority`**: Relaxed owner check to accept any valid agent (`'player' | 'npc'`), and explicitly removed the requirement that `item.ownerAgentId === sourcePurchase.playerId`.
- **`validateOrderAuthority`**: Enforces that `sourcePurchaseId` matches an order customer purchase, without requiring current physical custody to remain with the original buyer.
- **`validateWorldState`**: Verifies valid agent existence for `ownerAgentId` across players and NPCs, and enforces valid purchase provenance while permitting possessor divergence.

### 4. HTTP API & Presentation Shell
- **API Endpoint**: `POST /api/commands/giveItem` with payload `{ targetAgentId: string, itemId: string }`. Sender identity is authoritatively derived from the session (`state.activePlayerId`).
- **Contextual Affordances (`src/client/projections.ts`)**:
  - When the player possesses available items and is co-located with an acquainted agent, generates `Give ${item.name} to ${agent.name}` grouped under `INTERACT`.
  - Non-acquainted agents or agents not co-located never receive the affordance.
- **Entity Inspection**:
  - `ObservableAgent` and `ClientAgentItem` project `possessions?: string[]`.
  - Inspecting any co-located agent displays their currently held items (e.g. `Possessions: Pan Dulce`).

### 5. Schema Version 16 Preserved
- `CURRENT_WORLD_STATE_VERSION = 16` remains strictly unchanged.
- Because `OwnedItem` already supports arbitrary string `ownerAgentId` values, zero migrations are required. Full backward and forward persistence compatibility is maintained.

## Milestone 51: Accompanied Consumable Activity (Shared Refreshment)

Milestone 51 introduces the first accompanied consumable activity in MyVirtualCommunity, allowing a player to enjoy a shared refreshment with an acquainted, co-located Development NPC inside an open development restaurant:

```text
Player possesses Coffee (offering:development-coffee)
NPC possesses Pan Dulce (offering:development-pastry)
        ↓
Both agents co-located at open restaurant (restaurant:development-restaurant)
        ↓
Agents are acquainted
        ↓
Player receives action consideration: "Enjoy Refreshment with Development NPC"
        ↓
Player initiates accompanied activity (startAccompaniedActivity / POST /api/commands/startAccompaniedActivity)
        ↓
Authoritative World Core validates 11 deterministic preconditions
        ↓
Both items consumed atomically via Item Authority (consumeOwnedItem)
        ↓
Player activity starts: companionAgentId = companionId, duration = 900,000 ms (15 minutes)
        ↓
NPC state untouched (no activity queue, no playerActivity, no autonomous consumption)
        ↓
15-minute simulation completion records companion in ActivityCompletionRecord
```

### 1. Concrete Domain Action (`startAccompaniedActivity`)
- **Domain Function**: `startAccompaniedActivity(state, playerId, companionAgentId)`
- **Standard Duration**: Exactly 15 minutes (`900_000 ms`), matching the existing M34 consumption standard.
- **Atomic Item Consumption**: Uses the existing Item Authority `consumeOwnedItem()`. Selects items in deterministic FIFO order. Both items are consumed atomically or the entire action fails with zero state mutation.
- **11 Deterministic Preconditions**:
  1. `player-not-found`: Player exists in `state.agents`.
  2. `player-not-player`: Player must be a player (`player.agentType === 'player'`).
  3. `companion-not-found`: Companion exists in `state.agents`.
  4. `cannot-accompany-self`: Player and companion must be distinct (`playerId !== companionAgentId`).
  5. `restaurant-not-found`: Player's current location must resolve to a valid restaurant.
  6. `restaurant-closed`: Restaurant must be open (`operationalState === 'open'`).
  7. `agents-not-co-located`: Both agents must occupy the exact same restaurant.
  8. `agents-not-acquainted`: Both agents must be acquainted in `state.acquaintances`.
  9. `item-not-possessed`: Player must possess an available Coffee item (`offering:development-coffee`) from this restaurant.
  10. `companion-item-not-possessed`: Companion must possess an available Pan Dulce item (`offering:development-pastry`) from this restaurant.
  11. `player-already-active`: Player must not already have an active activity in flight (`completedAt === null`).

### 2. Architectural Boundaries & Non-Negotiables
- **Player Activity Remains Player-Specific**: Only the player receives `playerActivity`. The companion NPC does NOT receive `playerActivity`, a task/activity queue, autonomous consumption rules, or hunger/fatigue meters.
- **Epistemic Isolation**: Zero state mutation to `state.knowledge`. The activity does not generate false knowledge records.
- **Transactional Candidate-State Pattern**: In `SessionController`, actions are applied to candidate state clones and persisted before being committed to memory. If persistence fails, memory is rolled back.

### 3. Action Consideration & Projections
- **Action Consideration**: `evaluateAccompaniedConsumableConsideration(state, playerId, companionId, restaurantId)` derives the pure non-authoritative consideration `"Enjoy Refreshment with Development NPC"` (`action: 'startAccompaniedActivity'`, `reason: 'co-located-companion-refreshment'`).
- **Contextual Affordance**: `accompanied-refreshment-${companion.id}` grouped under `ACT` (`⚡ ACT / COMMERCE`).
- **HUD Integration**: Renders active accompanied activity and remaining minutes:
  `agent:dev-player • Having Coffee with Development NPC (15m remaining)`.
- **Completion Record**: Upon simulation tick completion (after 15 minutes), copies `companionAgentId` into `ActivityCompletionRecord`.

### 4. Schema Version 16 Preserved
- `CURRENT_WORLD_STATE_VERSION = 16` remains strictly unchanged.
- `PlayerActivityState` and `ActivityCompletionRecord` add optional `companionAgentId?: string | null`.
- Zero database migrations required. Complete backward and forward persistence compatibility is maintained.

## Milestone 52: Graceful Restaurant Closure Lifecycle

Milestone 52 introduces the complete, deterministic **Graceful Restaurant Closure Lifecycle** in MyVirtualCommunity, resolving the architectural gap uncovered after M51 where occupants remained indefinitely inside a restaurant after operating hours:

```text
Restaurant Schedule (UTC):
  09:00 - 16:45: 'open'          -> Commercial orders, purchases, consumption permitted
  16:45 - 17:00: 'closing-soon'  -> Amber badge; entry permitted; orders/purchases BLOCKED ('restaurant-closing-soon');
                                    long activities BLOCKED ('activity-extends-past-closing'); exit consideration active
  17:00 - 09:00: 'closed'        -> Red badge; entry BLOCKED ('restaurant-closed');
                                    Simulation tick executes closure egress: all occupants relocated to building lobby
```

### 1. Concrete Domain Lifecycle & Schedule Evaluation
- **Operational States**: Extended `RestaurantOperationalState = 'open' | 'closing-soon' | 'closed'`.
- **Operating Hours**:
  - `09:00 - 16:45 UTC`: `open`
  - `16:45 - 17:00 UTC`: `closing-soon`
  - `17:00 - 09:00 UTC`: `closed`
- **Scoped Evaluation**: `evaluateDevelopmentRestaurantOperationalRule()` is scoped strictly to `restaurant:development-restaurant`, guaranteeing non-regression of real-world seed venues (e.g. Kentucky Club).

### 2. Closing-Soon Boundary Rules (16:45–17:00 UTC)
- **Physical Entry & Presence**: Entry and presence are permitted. Existing occupants remain inside without premature ejection.
- **Commercial Cutoff**: New commercial orders (`placeOrder`) and purchases (`purchaseOffering`) are blocked with code `'restaurant-closing-soon'`.
- **Activity Cutoff**: New long-running activities extending past 17:00 UTC are blocked with code `'activity-extends-past-closing'`.
- **In-Flight Grace**: In-flight activities and ready order collections continue naturally.
- **Action Consideration**: `evaluateRestaurantClosingSoonConsideration()` derives `exitRestaurant` with reason `'restaurant-closing-soon'` and renders an amber `● CLOSING SOON` badge sign.

### 3. Authoritative Spatial Closure-Egress Transition at 17:00 UTC
- **`executeRestaurantClosureEgress(state, restaurantId)`**:
  - Authoritatively relocates all lingering occupants (player and NPCs) directly to the containing building lobby (`restaurant.buildingId`, e.g. `building:development-building`).
  - Integrated into `Simulation.tick()` when a restaurant transitions to or is evaluated as `closed`.
  - Offline simulation leaps across closure boundaries reconcile disconnected occupants upon disk rehydration.

### 4. Schema Version 16 Preserved
- `CURRENT_WORLD_STATE_VERSION = 16` remains strictly unchanged.
- Zero database migrations required. Complete backward and forward persistence compatibility is maintained.

## Milestone 52.1: Deferred Order Pickup Across Closure Lifecycle [CLOSED / VERIFIED]

Milestone 52.1 resolves the graceful reconciliation of uncollected `ready` orders when a restaurant closes, formalizing Deferred Pickup across overnight closure, egress, client reload/reconnect, and next-day reopening:

```text
Day 1 10:00 UTC          Day 1 17:00 UTC                 Client Reload             Day 2 09:00 UTC
Order placed & ready ──→ Restaurant Closes          ──→ Reconciles from disk ──→ Restaurant reopens & re-entered
                         • Occupants egressed           • Pending orders         • Order card renders in service box
                         • Order remains READY            reconstructed          • collectOrder() succeeds
                         • Pickup deferred banner       • Outside chips show     • Items transferred to inventory
                         • Schema V16 preserved           deferred status        • Order status -> fulfilled
```

### 1. Authoritative Domain State & Projection Boundaries
- **WorldState.orders**: Sole authoritative source of truth for commercial order contracts.
- **Authoritative Read Projection**: `InspectCurrentLocationResult` exposes `pendingOrders: ObservablePendingOrder[]` as a player-scoped read projection (analogous to `playerInventory`), strictly separated from spatial room perception (`location: ObservedLocation`).
- **Unfulfilled Orders Filter**: Projects exclusively orders with `status === 'preparing' | 'ready'`. Completed orders (`status === 'fulfilled'`) are strictly excluded.
- **Deterministic Presentation Ordering**: Ordered deterministically by `createdAt` ascending, tie-broken by `id` ascending. Tests formally verify this is presentation ordering only and does **not** create FIFO fulfillment restrictions.

### 2. Zero Domain State Mutation on Closure
- **No Deferred Domain Status**: Uncollected orders remain `ready`. No synthetic `'deferred'`, `'pickup-deferred'`, or `'closed-pickup'` status or schema migration is introduced.
- **Presentation Mapping**: "Pickup Deferred" is strictly a presentation-layer mapping derived from `Order.status === 'ready'` and `Restaurant.operationalState === 'closed'`.
- **Precondition Enforcement**: `collectOrder` rejects collection while the venue is closed (`restaurant-closed`) or when the customer is not co-located (`customer-not-co-located`).

### 3. Multiplicity & Multi-Restaurant Isolation
- **Multiple Simultaneous Orders**: A customer can hold multiple simultaneous unfulfilled orders across different venues.
- **Contextual UI Filtering**: When inside a restaurant, the service panel displays only orders matching `order.restaurantId === currentRestaurantId`.
- **Authoritative Collection**: Collection dispatches the exact authoritative `orderId` and verifies co-location at that specific restaurant.

### 4. Verification Baseline
- **Verification Result**: `M52.1 ARCHITECTURALLY VERIFIED — PASS`.
- **Automated Tests**: 1,014 tests passing across 316 suites (0 failures).
- **Dedicated Suite**: `tests/deferred-order-pickup-lifecycle.test.ts` (13 tests verifying domain invariants, non-FIFO fulfillment, multi-restaurant isolation, and full multi-day lifecycle).
- **Browser Verification**: End-to-end multi-day lifecycle verified with 5 screenshot artifacts via Chrome DevTools MCP.

## Milestone 56: Property & Assignment Foundation [CLOSED / VERIFIED]

Milestone 56 establishes the minimal authoritative **Property & Assignment Foundation**, formalizing persistent Property entities and assignment state cleanly separated from spatial containment topology (`Place` / `Building`), physical agent occupancy, access control, and commercial operations:

```text
Spatial / Geography Authority           Property Authority               Business / Occupancy / Economy
    ↓ owns physical topology                ↓ owns property records          ↓
Place / Building (where it is)    ──→    Property                         ──→   Operating Business, Residents,
(no reverse property reference)          Assignment                             Visitors, and Wallets
                                         ↓
                                         current holder reference
                                         (or 'unassigned')
```

### 1. Semantic Domain Separation
- **Building ≠ Property**: A `Building` represents spatial containment topology. A `Property` is a persistent entity associated with an explicitly designated `Building`. Not every `Building` is a `Property`.
- **Single Property per Building**: At most one `Property` record may reference a given `Building`. Place entities remain strictly spatial and do not contain reverse `propertyId` references.
- **Strict Semantics of `unassigned`**: The `unassigned` assignment state means strictly: *no holder is currently assigned to this Property*. It does **not** define or imply public availability, claimability, purchasability, public commons, or immediate assignment.
- **Legally Neutral Assignment**: M56 does not freeze `Assignment` as a legal title, deed, lease, ownership certificate, or other specific legal instrument. The model records strictly `Property -> Assignment -> current holder reference`.
- **Assignment ≠ Occupancy / Presence**: An assignment indicates the current holder reference. It does not dictate who is physically present or living in the space (owned by Agent / Spatial Presence).
- **Assignment ≠ Door Access**: Assignment does not dictate real-time door admission or knocking (owned by local access evaluation).
- **Assignment ≠ Business Operation**: A commercial property assignment is distinct from commercial businesses operating within that building (owned by Business Authority).
- **Assignment ≠ Economic Transaction**: Assignment is decoupled from money, pricing, or purchase workflows (owned by Economy Authority).

### 2. Domain Model (`src/core/property.ts`)
- **Property Entity**:
  ```typescript
  export interface Property {
    readonly id: string;           // e.g. 'property:development-residence'
    readonly type?: 'property';
    readonly buildingId: string;   // Foreign key -> Place (type === 'building')
    readonly propertyType: 'residence' | 'commercial';
    assignment: PropertyAssignment;
  }
  ```
- **Assignment States**:
  - `UnassignedPropertyAssignment`: `{ status: 'unassigned' }` (strictly forbids `holder` and `assignedAt`).
  - `AssignedPropertyAssignment`: `{ status: 'assigned', holder: PropertyHolderReference, assignedAt: string }`.
- **Holder Polymorphism**: `holderType: 'agent' | 'organization' | 'person'`.

### 3. Canonical Seed World Designated Properties
All seeded properties begin in the `unassigned` state:
- **Development Seed World (`juarez-el-paso`)**:
  - `property:development-residence` (building: `building:development-residence`, type: `residence`)
  - `property:development-building` (building: `building:development-building`, type: `commercial`)
  - `property:avenida-juarez-kiosk` (building: `building:avenida-juarez-kiosk`, type: `commercial`)
- **Real-World Juarez Seed World (`juarez-el-paso`)**:
  - `property:real-world-residence` (building: `building:real-world-residence`, type: `residence`)
  - `property:kentucky-club-building` (building: `building:kentucky-club-building`, type: `commercial`)

### 4. Authoritative Invariants & Cross-Domain Isolation
1. **Single Property per Building Invariant**: Multiple properties referencing the same `buildingId` are strictly rejected by `validatePropertyAuthority`.
2. **Valid Building Reference Invariant**: Properties must reference an existing `Place` of kind `building`. Referencing streets, neighborhoods, cities, or non-existent places is strictly rejected.
3. **No Reverse Reference Invariant**: `Place` models contain zero property or assignment fields (`propertyId`, `assignment`, `owner`, `occupant`).
4. **Boundary Isolation Invariant**: Mutating a property assignment leaves spatial topology, agent locations, restaurant operational state, balances, items, and orders completely unaffected.
5. **Pure Query Invariant**: Read queries (`getProperty`, `getPropertyByBuildingId`, `isPropertyAssigned`) produce zero state mutation.

### 5. Schema Upgrade & Persistence Cascades (v16 -> v17)
- **CURRENT_WORLD_STATE_VERSION = 17**: Introduces authoritative `properties: Property[]` collection.
- **Historical Validator**: `validateWorldStateV16` enforces strict v16 integrity and rejects unexpected `properties` collections.
- **Cascading Migration**: `migrateWorldStateV16ToV17` automatically creates initial unassigned properties for designated buildings in historical saves.
- **Persistence Compatibility**: `LocalFilePersistence.load()` cascades all historical saves (v11 through v16) to v17 on load.

## Milestone 57: Site Agent Association Foundation [CLOSED / VERIFIED]

Milestone 57 formalizes the first-class domain concept of a **Site Agent Association**, establishing which Agent is functionally associated with a specific world site/place, and in what authoritative role:

```text
PLACE / SITE
    ↓
SITE AGENT ASSOCIATION (World Core Authority)
    ↓
AGENT
    ↓
ROLE ('resident' | 'attendant')
```

### 1. Mandatory Domain Distinctions
- **WHERE THE AGENT IS (`Agent.locationId`)**: Logical/physical spatial presence owned by Spatial & Movement Authority.
- **WHAT SITE THE AGENT SERVES (`SiteAgentAssociation`)**: Functional site relationship owned by Site Agent Association Authority.
- **WHO OWNS THE SITE (`Property.assignment`)**: Property holder assignment owned by Property Authority.
- **WHO MAY ENTER THE SITE**: Access control and spatial transit policies.
- **WHAT THE AGENT IS CURRENTLY DOING (`Agent.activityState`)**: Current activity and routine state.

An agent being located at a site does not imply residency or attendance. Conversely, holding an association does not imply physical presence or property ownership.

### 2. Domain Model (`src/core/site-agent-association.ts`)
```typescript
export type SiteAgentRole = 'resident' | 'attendant';

export interface SiteAgentAssociation {
  readonly placeId: string;  // Target Place or Restaurant identifier
  readonly agentId: string;  // Associated Agent identifier
  readonly role: SiteAgentRole;
}
```

### 3. Resident Cardinality & Invariants
- **Resident Cardinality**: Strictly maximum **1 resident** per place. World Core validation rejects any state containing multiple residents for the same place (`Place "X" cannot have multiple resident associations`).
- **Attendant Multiplicity**: Establishments support **0..N attendants** per place.
- **Tuple Uniqueness**: `(placeId, agentId, role)` must be strictly unique across the collection.
- **Query Contract**: `getSiteResident(state, placeId)` returns exactly 0 or 1 result (`SiteAgentAssociation | undefined`), backed by the authoritative cardinality invariant.
- **Referential Integrity**: Associations must reference valid places/restaurants and valid agents; agents cannot masquerade as places and places cannot masquerade as agents.

### 4. Canonical Seeds (Explicit Fixture Definitions)
- **Development Seed World (`juarez-el-paso`)**:
  - `building:development-residence` → `agent:dev-npc` (`resident`)
  - `restaurant:development-restaurant` → `agent:dev-npc` (`attendant`)
- **Real-World Juarez Seed World (`juarez-el-paso`)**:
  - `building:real-world-residence` → `agent:real-world-player` (`resident`)
  - `restaurant:kentucky-club` → `agent:m39-service-staff` (`attendant`)

### 5. Migration Safety (v17 -> v18) — Option B
- **CURRENT_WORLD_STATE_VERSION = 18**: Introduces `siteAgentAssociations: SiteAgentAssociation[]`.
- **Option B (No derivable relationship)**: Version 17 did not authoritatively model Site Agent Associations. In accordance with domain separation rules, `migrateWorldStateV17ToV18` produces `siteAgentAssociations: []` rather than inventing associations from entity existence. Migrated states remain structurally and authoritatively valid.
- **Historical Validator**: `validateWorldStateV17` strictly rejects states that contain `siteAgentAssociations`.
- **Persistence Compatibility**: `LocalFilePersistence.load()` safely cascades v17 saves to v18 with empty associations.

## Milestone 58: Residential Access Foundation [CLOSED / VERIFIED]

Milestone 58 introduces the first authoritative residential-access rule in World Core:
> A building that has a `SiteAgentAssociation` with `role: 'resident'` is treated as a residential site. A player may enter it only when its designated resident is currently physically present at that building (`resident.locationId === building.id`).

```text
Player Intent (enterBuilding)
    ↓
Precondition Evaluation (agent, player, building, location, inside)
    ↓
Residential Detection (getSiteResident)
    ├─ No Resident Association ──> Generic Building Entry (Allowed)
    └─ Resident Association Present
            ↓
       Residential Access Evaluation (evaluateResidentialAccess)
            ├─ Resident Missing / Not Found ──> Denied ('resident-not-found' / 'resident-agent-missing')
            ├─ Resident Not At Building ─────> Denied ('resident-not-home')
            └─ Resident Present At Building ──> Allowed ('allowed')
```

### 1. Pure Domain Evaluator (`src/core/residential-access.ts`)
- Pure, side-effect-free evaluation:
  - `evaluateResidentialAccess(state, playerId, buildingId): ResidentialAccessResult`
  - `isResidentialBuilding(state, buildingId): boolean`
- Result codes:
  - `'allowed'`: Resident exists and is physically co-located at the building.
  - `'resident-not-found'`: The building does not have a designated resident association.
  - `'resident-agent-missing'`: The associated resident agent ID does not exist in `state.agents`.
  - `'resident-not-home'`: The designated resident is currently at a different location (`resident.locationId !== buildingId`).

### 2. Authoritative Integration (`src/core/world-state.ts`)
- `enterBuilding(state, agentId, buildingId)` preserves strict precondition precedence:
  1. `agent-not-found`
  2. `agent-not-player`
  3. `building-not-found`
  4. `already-inside`
  5. `invalid-location`
  6. **Residential Access Gate**: If the building has a designated resident association, evaluate access:
     - Returns `{ success: false, code: 'resident-not-home' | 'resident-agent-missing', ... }` on failure with **zero state mutation**.
     - Continues to successful location transition (`agent.locationId = building.id`) when allowed.
- Non-residential buildings retain generic building entry semantics completely unchanged.

### 3. Strict Domain Boundaries & Invariants
- **Presence-Based Access Only**: Access depends solely on physical presence (`resident.locationId === buildingId`). No locks, keys, invitations, guest lists, households, permissions, or access-control frameworks.
- **No Property Conflation**: `Property.assignment` is completely untouched and never consulted for residential access authority.
- **No Activity State Gating**: NPC `activityState` (e.g. resting/sleeping) does NOT deny or block entry.
- **Zero Mutation Invariant**: Denied entry leaves all world state, clocks, locations, and inventories 100% unaltered.
- **Schema Version**: Schema version remains strictly **18** (zero schema changes, zero migrations).

## Milestone 59: Residential Interaction Contract [CLOSED / VERIFIED]

Milestone 59 establishes an authoritative residential interaction boundary in World Core:
> Direct entry into residential buildings via `enterBuilding` is prohibited (`code: 'residential-interaction-required'`). Entry into a residence requires interacting at the residence (`interactAtResidence`). An admission decision is evaluated deterministically: a visitor is admitted only if the designated resident is physically present at home and acquainted with the visitor.

```text
CONTACT (interactAtResidence)
    ↓
RESIDENTIAL ADMISSION POLICY (evaluateResidentialAdmissionPolicy)
    ├─ Resident Missing / Not Found ──> Denied ('resident-agent-missing')
    ├─ Resident Absent from Home ─────> Denied ('resident-not-home')
    ├─ Unacquainted Stranger ─────────> Denied ('resident-declined-stranger')
    └─ Resident Present & Acquainted ─> Admitted ('admitted')
            ↓
SPATIAL AUTHORITY (transitionAgentLocation)
    ↓
Player enters residence
```

### 1. Residential Admission Policy (`src/core/residential-access.ts`)
- Pure, side-effect-free evaluator:
  - `evaluateResidentialAdmissionPolicy(isResidentHome, isAcquainted, residentId, buildingId): ResidentialAdmissionPolicyResult`
- Result codes:
  - `'admitted'`: Resident is present at home and acquainted with visitor.
  - `'resident-not-home'`: Resident is not currently at home.
  - `'resident-declined-stranger'`: Resident is at home, but visitor is not recognized (stranger).

### 2. Residential Interaction Function (`src/core/world-state.ts`)
- `interactAtResidence(state, playerId, buildingId): InteractAtResidenceResult`
- Evaluates 9 deterministic preconditions in strict order:
  1. `player-not-found`: Player exists in `state.agents`.
  2. `player-not-player`: Requesting agent has `agentType: 'player'`.
  3. `building-not-found`: Target exists in `state.places` and is a `building`.
  4. `building-not-residential`: Building has a designated `resident` association (`isResidentialBuilding(state, buildingId)`).
  5. `already-inside`: Player is not already inside the target building (`player.locationId !== building.id`).
  6. `player-not-at-building-access-context`: Player is at containing street (`player.locationId === building.parentId`).
  7. `resident-agent-missing`: Resident agent entity exists in `state.agents`.
  8. `resident-not-home`: Designated resident is currently at home (`resident.locationId === building.id`).
  9. `resident-declined-stranger`: Player and resident are acquainted (`isAgentAcquainted(state, playerId, resident.id)`).
- On admission approval, delegates spatial movement to canonical `transitionAgentLocation(state, playerId, building.id)`.
- Zero state mutation on any precondition failure or admission rejection.

### 3. Direct Entry Prohibition (`enterBuilding`)
- `enterBuilding` on a residential building returns `{ success: false, code: 'residential-interaction-required', ... }`.
- Non-residential buildings enter freely without requiring residential interaction.

### 4. Client & Server Integration
- Street perception projects `isResidential: true` on child building summaries (`ObservablePlaceSummary`).
- Client presentation models generate `interactAtResidence` affordance (`group: 'INTERACT'`, `label: 'Knock at ...'`) for residential buildings on streets.
- Server HTTP route `/api/commands/interactAtResidence` and session controller dispatch the command sequentially with full ACID validation and persistence.

### 5. Architectural Invariants Preserved
- **Strict Co-location**: `greetAgent()` and `introduceToAgent()` co-location rules remain strictly untouched.
- **No AI / Psychology**: No consent flags, willingness, mood, or sleep state modeled.
- **Spatial Authority**: Spatial transitions executed exclusively through `transitionAgentLocation()`.
- **Schema Version**: Schema version remains strictly **18** (zero migrations, zero persistence changes).

## Milestone 60: NPC Presence & Observation Boundary [CLOSED / VERIFIED]

Milestone 60 formalizes the authoritative co-presence and observation boundary in World Core without premature domain abstraction or speculative encounter systems:
> A player can observe an NPC when that NPC is actually present in the player's current authoritative spatial context, and the player can use existing social interaction commands (`greetAgent`, `introduceToAgent`) against that NPC.

```text
CO-PRESENCE (areAgentsCoLocated)
    agentA.locationId === agentB.locationId
    ↓
OBSERVATION (getCoLocatedAgents / inspectCurrentLocation)
    authoritative world facts projected through perception
    ↓
SOCIAL INTERACTION (greetAgent, introduceToAgent)
    explicit commands validated by existing Social Domain Authority
    ↓
NPC AI (Future non-authoritative cognitive consumer)
```

### 1. Pure Co-Location Domain Helpers (`src/core/world-state.ts`)
- **Topological Co-Presence Predicate**:
  - `areAgentsCoLocated(state, agentIdA, agentIdB): boolean`
  - Answers strictly: *Are these two agents currently occupying the same authoritative topological location?*
  - Pure function, zero state mutation, handles non-existent or invalid agent IDs safely returning `false`.
- **Co-Located Agent Observation**:
  - `getCoLocatedAgents(state, observerAgentId): ObservableAgent[]`
  - Answers strictly: *Which agents currently share the observer's authoritative location and can therefore participate in mutual observation/social interaction?*
  - Projects co-located agents into read-only `ObservableAgent` summaries (`id`, `name`, `agentType`, `isAcquainted`, `possessions`) while strictly withholding internal agent state (`balanceMinor`, `activityState`, `activitySince`, `playerActivity`).
- **Inspection Integration**:
  - `inspectCurrentLocation(state, playerId)` delegates step 4 directly to `getCoLocatedAgents(state, player.id)`, preserving existing perception contracts.

### 2. Schedule-Driven Presence & Natural Dispersal
- NPCs progress along their deterministic schedules via `Simulation.tick()`.
- Co-presence and observation automatically establish and dissolve as a natural consequence of spatial transitions:
  - When an NPC commutes onto a street, players on that street immediately co-locate and observe the NPC.
  - When an NPC transitions to work at a venue, co-presence on the street ends and requires interior entry to re-establish.

### 3. Social Interaction Integration
- Social commands (`greetAgent`, `introduceToAgent`) continue using existing Social Domain Authority requiring topological co-presence (`player.locationId === npc.locationId`).
- Co-located interaction succeeds and generates canonical `Acquaintance` records and contextual responses.
- Non-co-located interaction deterministically rejects with `agents-not-co-located`.

### 4. Client & Server Integration
- Client presentation model (`createPresentationModel`) surfaces co-located agents and generates interactive affordances (`GREET`, `INTRODUCE`) when co-present.
- Non-co-located agents are excluded from client observation and affordance generation.

### 5. Architectural Invariants Preserved
- **No Encounter Subsystem**: Zero `EncounterContext`, `EncounterRecord`, `state.encounters`, or `/api/encounters` introduced.
- **No Semantics Conflation**: Co-presence evaluates topological node equality (`locationId === locationId`); observation projects through perception.
- **No AI / Psychology**: Zero LLM dynamic dialogue, mood, emotions, or ungrounded cognition.
- **Schema Version**: Schema version remains strictly **18** (zero migrations, zero schema changes).

## Milestone 61: NPC Behavioral State & Intent Foundation [CLOSED / VERIFIED]

Milestone 61 establishes a pure, derived behavioral interpretation layer for the existing deterministic NPC schedule in MyVirtualCommunity, without introducing NPC autonomy, AI, goals-as-memory, planning, personality, emotions, or a behavior-tree engine:

```text
CURRENT WORLD FACTS
        ↓
DETERMINISTIC SCHEDULE / EXISTING AUTHORITATIVE STATE
        ↓
DERIVED NPC BEHAVIORAL STATE (evaluateNpcBehavioralState)
        ↓
READ-ONLY CONTEXT PROJECTION (inspectNpcContext)
        ↓
FUTURE NON-AUTHORITATIVE COGNITIVE CONSUMER
```

### 1. Pure Derived Routine & Intent Interpretation (`src/core/npc-behavior.ts`)
- **Deterministic Routine Phase Derivation**:
  - `evaluateNpcBehavioralState(state, npcId): DeriveNpcBehavioralStateResult`
  - `deriveNpcBehavioralState(state, npcId): NpcBehavioralState | null`
  - Derives the 5 canonical phases of Elena Morales (`agent:dev-npc`) from `worldTime` evaluated in authoritative local Civil Time (`America/Ciudad_Juarez`):
    - `08:00` Local (Morning Rest): `routinePhase = 'resting'`, `intent = 'rest_at_home'`, `destinationId = 'building:development-residence'`, `activity = 'Resting at home'`
    - `08:45` Local (Morning Commute): `routinePhase = 'commuting'`, `intent = 'commute_to_work'`, `destinationId = 'restaurant:development-restaurant'`, `activity = 'Commuting to work'`
    - `09:30` Local (Work Shift): `routinePhase = 'working'`, `intent = 'perform_work_shift'`, `destinationId = 'restaurant:development-restaurant'`, `activity = 'Working at restaurant'`
    - `18:00` Local (Evening Promenade): `routinePhase = 'promenading'`, `intent = 'walk_neighborhood'`, `destinationId = 'street:avenida-juarez'`, `activity = 'Walking along Avenida Juárez'`
    - `21:00` Local (Night Rest): `routinePhase = 'resting'`, `intent = 'rest_at_home'`, `destinationId = 'building:development-residence'`, `activity = 'Resting at home'`
- **Deterministic Intent Semantics**:
  - `NpcIntentType` (`'rest_at_home' | 'commute_to_work' | 'perform_work_shift' | 'walk_neighborhood'`) represents strictly the deterministic objective implied by the NPC's current routine phase. It does NOT represent autonomous agency, psychological intent, or independently chosen goals.
- **Pure Evaluation Invariant**:
  - Pure calculation with zero state mutations, zero database writes, and zero side-effects.
  - Returns explicit failure codes for invalid agent IDs (`npc-not-found`), player IDs (`agent-not-npc`), or unconfigured NPCs (`no-schedule-defined`).

### 2. Read-Only Situational Context Projection (`inspectNpcContext`)
- `inspectNpcContext(state, npcId): InspectNpcContextResult`
- Serves as the future hand-off boundary between World Core and a non-authoritative cognitive layer.
- Projections returned:
  - `agent`: Observed NPC identity (`id`, `name`, `agentType`, `activityState`, `activitySince`)
  - `location`: Observed location (`id`, `name`, `type`)
  - `behavioralState`: Derived behavioral state (`routinePhase`, `intent`, `destinationId`, `activity`)
  - `coLocatedAgents`: Co-located agents via `getCoLocatedAgents()`
  - `siteAssociations`: First-class site-agent associations via `getAgentSiteAssociations()`
  - `temporalContext`: Authoritative local civil time via `resolvePlayerTemporalContext()`

### 3. Social Interaction Grounding (`greetAgent`)
- `greetAgent(state, playerId, npcId)` refactored to select dialogue dynamically based on `deriveNpcBehavioralState(state, npcId)?.routinePhase`:
  - Working at restaurant: `"Welcome. I'm working here today."` (acquainted: `"Welcome back. Good to see you again. I'm working here today."`)
  - Resting at home: `"Hello. I'm resting at home right now."` (acquainted: `"Hello again. Good to see you. I'm resting at home right now."`)
  - Commuting on street: `"Good morning. On my way to the restaurant."` (acquainted: `"Good morning again. On my way to the restaurant."`)
  - Promenading on Avenida Juárez: `"Good evening. It's pleasant to walk down Avenida Juárez after work."` (acquainted: `"Good evening again. It's pleasant to walk down Avenida Juárez after work."`)
  - Retains backward-compatible fallback for legacy unacquainted/acquainted building contexts.

### 4. Architectural Invariants Preserved
- **Zero Schema Changes**: Schema version remains strictly **18** (`CURRENT_WORLD_STATE_VERSION = 18`). Zero migrations added.
- **Zero Behavioral Persistence**: No `state.npcBehavior`, `state.npcIntents`, `state.goals`, `state.plans`, or behavioral fields stored on `Agent`.
- **Zero AI / Psychology**: No LLM, no cognitive loop, no prompts, no memory systems, no emotional vectors.
- **Business Authority Maintained**: Commercial service affordances still strictly evaluate `agent.activityState === 'active'` and site associations; derived behavioral state does not bypass business authority.

## Milestone 62: NPC Routine Action Execution Foundation [CLOSED / VERIFIED]

Milestone 62 establishes the deterministic execution layer for an NPC's derived routine behavior, linking derived behavioral interpretation directly to existing domain authority and state transitions:

```text
World Time
    ↓
Deterministic NPC Schedule
    ↓
M61 Behavioral Interpretation (evaluateNpcBehavioralState)
    ↓
M62 Routine Action (deriveNpcRoutineAction)
    ↓
Existing Authority (Spatial Authority: transitionAgentLocation)
    ↓
Existing State Transition
    ↓
Updated World State
```

### 1. Minimal Routine Action Model (`src/core/npc-behavior.ts`)
- **Deterministic Action Types (`NpcRoutineActionType`)**:
  - `'stay-at-home'`: Resting at residence (`building:development-residence`)
  - `'commute-to-work'`: Commuting to workplace via Development Street (`street:development-street`)
  - `'work-at-restaurant'`: Working shift at Development Restaurant (`restaurant:development-restaurant`)
  - `'walk-neighborhood'`: Evening walk along Avenida Juárez (`street:avenida-juarez`)
- **Action Structure (`NpcRoutineAction`)**:
  - `npcId`: Target NPC identifier
  - `actionType`: `NpcRoutineActionType`
  - `targetLocationId`: Authoritative target place or restaurant identifier
  - `requiresMovement`: `agent.locationId !== targetLocationId`
  - `routinePhase`: Associated `NpcRoutinePhase`
  - `description`: Human-readable description of the routine action
- **Pure Derivation Functions**:
  - `evaluateNpcRoutineAction(state, npcId): EvaluateNpcRoutineActionResult`
  - `deriveNpcRoutineAction(state, npcId): NpcRoutineAction | null`
  - Zero state mutation, zero disk writes, pure projection from world time and authoritative schedule fixtures.

### 2. Spatial Authority Execution (`executeNpcRoutineAction`)
- `executeNpcRoutineAction(state, npcId, providedAction?): ExecuteNpcRoutineActionResult`
- Executes routine spatial movement strictly through Spatial Authority (`transitionAgentLocation`).
- Zero direct mutation of `agent.locationId` from the action execution layer.
- Idempotency: If `agent.locationId === action.targetLocationId`, returns `already-at-destination` with `changed: false` and zero mutation.
- Atomic failure: Invalid destinations or nonexistent entities fail through Spatial Authority with descriptive errors and zero state mutation.
- Full topological cycle verified:
  ```text
  residence -> development street -> development restaurant -> avenida Juárez -> residence
  ```

### 3. Domain Boundaries & Invariants Preserved
- **Spatial Authority Preservation**: Movement remains an authoritative state transition across existing topological places and restaurants. Zero coordinates, vectors, pathfinding, navigation graphs, or NavMesh.
- **Business Authority Independence**: Routine action execution into the restaurant (`work-at-restaurant`) does NOT grant commercial authority or force service affordances. `inquireRestaurantService()` continues to strictly require `isRestaurantOpen()` and `staff.activityState === 'active'`.
- **Zero Action Persistence**: Routine actions are derived at runtime and never persisted in `WorldState` or `Agent` records.
- **Schema Version**: Schema version remains strictly **18** (`CURRENT_WORLD_STATE_VERSION = 18`). Zero schema changes or migrations.
- **Zero AI / Autonomous Planning**: No BehaviorTree, Blackboard, GoalSystem, Planner, UtilityAI, or NPCBrain abstractions.
- **Offline Continuity**: Multi-hour or multi-day `WorldClock.advance()` evaluates and executes immediately without replaying intermediate visual steps.

## Milestone 63: Simulation Routine Execution Integration [CLOSED / VERIFIED]

Milestone 63 unifies simulation-driven NPC movement with the M61/M62 behavioral execution foundation, eliminating the legacy direct-location mutation path in `Simulation.tick()`:

```text
World Time
    ↓
Simulation.tick()
    ↓
Deterministic NPC Schedule
    ↓
M61 Behavioral Interpretation (evaluateNpcBehavioralState)
    ↓
M62 Routine Action (deriveNpcRoutineAction)
    ↓
executeNpcRoutineAction()
    ↓
Spatial Authority (transitionAgentLocation)
    ↓
World State
```

### 1. Unified Movement Execution Path (`src/core/simulation.ts`)
- Replaces legacy direct assignment `agent.locationId = targetLocationId` inside `Simulation.tick()` with `executeNpcRoutineAction(this.state, agent.id)`.
- Eliminates redundant parallel spatial integrity guards in simulation by delegating directly to Spatial Authority (`transitionAgentLocation`).
- Preserves the existing `npcLocationTransitions` projection structure (`agentId`, `previousLocationId`, `newLocationId`, `changed`) and console logging formatting.
- Safely handles routine execution failures by preserving existing location without state corruption.

### 2. Architectural Invariants Preserved
- **Zero Direct Location Mutation**: `Simulation.tick()` contains zero direct assignments to `agent.locationId`. All routine movement passes strictly through Spatial Authority.
- **Preserved Simulation Behaviors**: Agent activity state transitions (`activityState`, `activitySince`), offering retirement (Milestone 19-A), restaurant operational updates, closure-egress processing (Milestone 52), and commercial actions (Milestone 46/47) remain completely intact and independent.
- **Offline Simulation Continuity**: Multi-hour and multi-day leaps via `WorldClock.advance()` resolve deterministically in a single tick without step-by-step playback.
- **Schema Version**: Schema version remains strictly **18** (`CURRENT_WORLD_STATE_VERSION = 18`). Zero schema migrations or entity modifications.
- **Zero AI / Autonomous Planning**: No BehaviorTree, Blackboard, GoalSystem, Planner, UtilityAI, or NPCBrain abstractions.

## Milestone 64: Deterministic NPC Routine Generalization [CLOSED / VERIFIED]

Milestone 64 generalizes the deterministic NPC routine execution pipeline so that it is demonstrably independent from any specific NPC fixture, proving that multiple NPCs execute their individual deterministic schedules through the exact same execution pipeline without building a generic NPC framework:

```text
WorldClock
    ↓
Simulation.tick()
    ↓
Deterministic Schedule Definition (findNpcSchedule)
    ↓
M61 Behavioral Interpretation (evaluateNpcBehavioralState)
    ↓
M62 Routine Action (evaluateNpcRoutineAction)
    ↓
executeNpcRoutineAction()
    ↓
Spatial Authority (transitionAgentLocation)
    ↓
World State
```

### 1. Declarative Routine Schedule Definition (`src/core/development-npc-schedule.ts`)
- **`DeterministicNpcSchedule`**: Minimal declarative interface modeling an NPC's schedule boundaries:
  - `npcId`: Target agent identifier
  - `residenceId`: Resting location
  - `commuteLocationId`: Route used during transit
  - `workplaceId`: Work destination
  - `recreationLocationId`: Promenade / recreation destination
  - Shift timing: `shiftStartHour`, `shiftEndHour`, `commuteLeadMinutes`
  - Recreation timing: `recreationStartHour`, `recreationEndHour`
  - Descriptive labels: `actionDescriptions`, `activityLabels`
- **Immutable Schedule Fixtures**: `DETERMINISTIC_NPC_SCHEDULES` statically defines:
  - **Elena Morales (`agent:dev-npc`)**: Shift 09:00–17:00, commute lead 30m (08:30), promenade 17:00–20:30.
  - **Secondary Development NPC (`agent:secondary-dev-npc`)**: Shift 11:00–16:00, commute lead 30m (10:30), promenade 08:30–10:30.
- **Pure Lookup Functions**: `findNpcSchedule(npcId)` and `hasNpcRoutineSchedule(npcId)` replace hardcoded identity checks. Unregistered NPCs cleanly return `null` / `no-schedule-defined`.

### 2. Pure Behavioral & Routine Derivation Generalization (`src/core/npc-behavior.ts`)
- **`evaluateNpcBehavioralState`**: Dynamically evaluates routine phase (`'resting' | 'commuting' | 'working' | 'promenading'`), intent (`NpcIntentType`), destination, and activity label using the NPC's resolved schedule instead of hardcoded Elena constants.
- **`evaluateNpcRoutineAction`**: Maps routine phases to executable actions (`'stay-at-home' | 'commute-to-work' | 'work-at-restaurant' | 'walk-neighborhood'`) and target locations based on the NPC's configured schedule.
- Preserves 100% backwards compatibility for Elena Morales down to character-exact strings.

### 3. Unified Simulation Routine Execution (`src/core/simulation.ts`)
- Replaces identity-gated `if (agent.id === 'agent:dev-npc')` inside `Simulation.tick()` with `if (npcSchedule !== null)`.
- Any NPC in `state.agents` with a defined schedule is executed through the shared routine execution pipeline: `findNpcSchedule()` $\rightarrow$ `evaluateNpcBehavioralState()` $\rightarrow$ `evaluateNpcRoutineAction()` $\rightarrow$ `executeNpcRoutineAction()` $\rightarrow$ `transitionAgentLocation()`.
- **Shift-Aware Activity State**: Derives `activityState` (`active` vs `idle`) per NPC based on each agent's configured `[shiftStartHour, shiftEndHour)` interval.

### 4. Architectural Invariants Preserved
- **Zero Identity-Specific Execution Branching**: Simulation contains zero `if (agent.id === ...)` checks in the routine execution pipeline.
- **Business Authority Non-Bypassing**: Operating hours and closure-egress rules apply consistently. Scheduled shifts harmonize with restaurant operational state.
- **Spatial Authority as Sole Mutation Path**: Zero direct `locationId` assignments. Invalid destinations fail safely through Spatial Authority with locations preserved.
- **Offline Simulation Continuity**: Multi-hour leaps resolve both NPCs deterministically in a single tick.
- **Schema Version**: Schema version remains strictly **18** (`CURRENT_WORLD_STATE_VERSION = 18`). Zero migrations or persistent behavioral fields.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Tests

Executes all **automated unit, spatial, interaction, economic, routine, perception, social, runtime server, client boundary, inventory, activity lifecycle, epistemic retention, business authority, asset/property/inventory authority, real-world spatial foundation, property assignment foundation, site-agent association, residential access foundation, residential interaction contract, NPC presence & observation boundary, NPC behavioral state & intent foundation, NPC routine action execution foundation, simulation routine execution integration, and deterministic NPC routine generalization tests across 77 test suites (1,315 tests)**:

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

Launches the world server and advances the clock to 16:00 UTC (10:00 AM local civil time in Ciudad Juárez) so that venues, shifts, and offerings are active, ready for browser interaction on `http://127.0.0.1:3000`:

```bash
npx tsx scripts/start-browser-server.ts
```

### 7. Run All Demonstrations

Executes all automated milestone demonstration scripts sequentially:

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
| `npm run demo:asset-property-inventory-authority` | M37 Inventory | Authoritative item possession transitions, query functions, and domain boundary enforcement |
| `npm run demo:real-world-spatial-foundation` | M38 Spatial | Real-world Ciudad Juárez street fragment and residential-to-restaurant flow |
| `npm run demo:order-fulfillment-foundation` | M39 Fulfillment | Order inquiry, deferred delivery, atomic pickup placement, time progression, collection, and persistence |
| `npm run demo:site-agent-association` | M57 Association | First-class site-agent functional associations, role cardinality, and domain independence |
| `npm run demo:residential-access` | M58 Access | Presence-based residential access evaluation, schedule-linked entry, and state isolation |
| `npm run demo:residential-interaction` | M59 Interaction | Residential interaction requirement, acquaintance admission policy, and spatial transition |
| `npm run demo:npc-presence-observation` | M60 Presence | Authoritative co-presence, observation projection, schedule-driven transitions, and social interaction |
| `npm run demo:npc-behavior` | M61 Behavior | Pure derived routine phases, deterministic intent interpretation, context projection, and grounded dialogue |
| `npm run demo:npc-routine-execution` | M62 Action | Deterministic routine action derivation, topological cycle execution, and spatial authority |
| `npm run demo:npc-routine-generalization` | M64 Generalization | Multi-NPC deterministic routine generalization, shared execution pipeline, and distinct schedules |

---

## Intentional Exclusions (Current Scope)

To preserve strict architectural clarity and avoid premature abstraction, the following systems are **intentionally NOT implemented** at the current milestone level:
- Generative AI / LLM dynamic prompt injection or ungrounded dialogue generation (all dialogues and schedules are factual projections from authoritative fixtures)
- Real-time multiplayer networking, WebSockets, or multi-client replication (local authoritative HTTP server with serialized FIFO queue)
- Continuous background tick loop or infinite timers (discrete simulation steps remain deterministic and caller-invoked)
- Pathfinding meshes (NavMesh), continuous physical collision, or line-of-sight raycasting (hierarchical spatial containment remains the authoritative topological source of truth)
- Multi-currency forex conversion, credit card payment gateways, taxes, tips, or banking loans (integer-only minor currency units USD)
- External authentication protocols, OAuth, JWTs, or multi-tenant database clusters
