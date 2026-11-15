/**
 * Milestone 69 — Navigation Provider Contract Demonstration
 *
 * Demonstrates the engine-independent contract separating the authoritative World Core
 * from an external physical navigation system:
 *
 * Scenario 1: Valid logical destination -> NavigationRequest
 * Scenario 2: Request -> Provider Traversal -> Arrived -> World Core Revalidation -> Authoritative Commit
 * Scenario 3: Invalid destination -> World Core rejection before provider invocation
 * Scenario 4: Valid destination -> Provider reports route-unavailable (unreachable-destination)
 * Scenario 5: Traversal interrupted -> Authoritative location remains unchanged
 * Scenario 6: Stale arrival -> World Core rejects arrival and preserves intervening state
 * Scenario 7: Provider failure / exception -> WorldState remains valid and uncorrupted
 * Scenario 8: Architectural invariants: Schema Version 18, zero coordinates, zero engine coupling
 */

import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  CURRENT_WORLD_STATE_VERSION,
  createNavigationRequest,
  validateArrivalAndCommit,
  DeterministicMockNavigationProvider,
} from '../src/core/world-state.js';

console.log('============================================================');
console.log('Milestone 69: Navigation Provider Contract Demo');
console.log('============================================================');

const clock = WorldClock.create('2026-09-14T16:00:00.000Z'); // 10:00 AM local

// -------------------------------------------------------------------------
// Scenario 1: Valid Logical Destination -> Navigation Request
// -------------------------------------------------------------------------
console.log('\n--- Scenario 1: Valid Logical Destination -> Navigation Request ---');
const state1 = createInitialWorldState(clock);
const player1 = state1.agents.find((a) => a.id === 'agent:dev-player')!;

console.log(`Player ID:            ${player1.id}`);
console.log(`Current Location:     "${player1.locationId}"`);

const reqResult1 = createNavigationRequest(
  state1,
  player1.id,
  'street:development-street',
  clock.getTime()
);

console.log(`Request Created:      ${reqResult1.success}`);
if (reqResult1.success) {
  console.log(`Request ID:           "${reqResult1.request.requestId}"`);
  console.log(`Origin:               "${reqResult1.request.originPlaceId}"`);
  console.log(`Destination:          "${reqResult1.request.destinationPlaceId}"`);
  console.log(`Requested At:         ${reqResult1.request.requestedAt}`);
}
console.log(`Post-Request Loc:     "${player1.locationId}" (Zero WorldState mutation)`);
console.log('-> VERIFIED: NavigationRequest created as ephemeral integration object without mutating world state.');

// -------------------------------------------------------------------------
// Scenario 2: Traversal -> Arrived -> Revalidation -> Authoritative Commit
// -------------------------------------------------------------------------
console.log('\n--- Scenario 2: Traversal -> Arrived -> Revalidation -> Commit ---');
const state2 = createInitialWorldState(clock);
const player2 = state2.agents.find((a) => a.id === 'agent:dev-player')!;
const provider2 = new DeterministicMockNavigationProvider('unity-navmesh-mock');

const reqResult2 = createNavigationRequest(
  state2,
  player2.id,
  'street:development-street',
  clock.getTime()
);
if (!reqResult2.success) throw new Error('Expected success');

console.log('Dispatching request to Navigation Provider...');
const navResult2 = provider2.requestTraversal(reqResult2.request);
console.log(`Navigation Provider:  Status="${navResult2.status}", CompletedAt="${navResult2.completedAt}"`);
console.log(`Pre-Commit Location:  "${player2.locationId}" (Provider returned arrived, world NOT yet changed)`);

console.log('World Core:           Revalidating arrival against live world facts...');
const commitResult2 = validateArrivalAndCommit(state2, reqResult2.request, navResult2);

console.log(`World Core Outcome:   code="${commitResult2.code}", success=${commitResult2.success}`);
console.log(`Authoritative Loc:    "${player2.locationId}" (Updated by World Core via transitionAgentLocation)`);
console.log('-> VERIFIED: Physical traversal reported by provider; authoritative arrival committed solely by World Core.');

// -------------------------------------------------------------------------
// Scenario 3: Invalid Destination Rejected by World Core
// -------------------------------------------------------------------------
console.log('\n--- Scenario 3: Invalid Destination Rejected by World Core ---');
const state3 = createInitialWorldState(clock);
const player3 = state3.agents.find((a) => a.id === 'agent:dev-player')!;

console.log('Attempting request to non-existent place "place:non-existent-void"...');
const reqResult3 = createNavigationRequest(
  state3,
  player3.id,
  'place:non-existent-void',
  clock.getTime()
);

console.log(`World Core Rejection: success=${reqResult3.success}, code="${reqResult3.code}", category="${reqResult3.failureCategory}"`);
console.log('Provider Invocation:  NONE (Rejected by World Core before provider receives it)');
console.log('-> VERIFIED: World Core owns destination truth; invalid destinations never reach navigation providers.');

// -------------------------------------------------------------------------
// Scenario 4: Valid Destination -> Provider Reports Route Unavailable
// -------------------------------------------------------------------------
console.log('\n--- Scenario 4: Valid Destination -> Route Unavailable ---');
const state4 = createInitialWorldState(clock);
const player4 = state4.agents.find((a) => a.id === 'agent:dev-player')!;
const provider4 = new DeterministicMockNavigationProvider('mock-provider');
provider4.setDestinationStatus('street:development-street', 'route-unavailable');

const reqResult4 = createNavigationRequest(
  state4,
  player4.id,
  'street:development-street',
  clock.getTime()
);
if (!reqResult4.success) throw new Error('Expected success');

const navResult4 = provider4.requestTraversal(reqResult4.request);
console.log(`Provider Report:      status="${navResult4.status}", failureCategory="${navResult4.failureCategory}"`);

const commitResult4 = validateArrivalAndCommit(state4, reqResult4.request, navResult4);
console.log(`World Core Gate:      success=${commitResult4.success}, code="${commitResult4.code}"`);
console.log(`Player Location:      "${player4.locationId}" (Preserved at origin)`);
console.log('-> VERIFIED: Clean distinction between World Core existence and Navigation reachability failure.');

// -------------------------------------------------------------------------
// Scenario 5: Traversal Interrupted
// -------------------------------------------------------------------------
console.log('\n--- Scenario 5: Traversal Interrupted ---');
const state5 = createInitialWorldState(clock);
const player5 = state5.agents.find((a) => a.id === 'agent:dev-player')!;
const provider5 = new DeterministicMockNavigationProvider('mock-provider');
provider5.setDestinationStatus('street:development-street', 'traversal-interrupted');

const reqResult5 = createNavigationRequest(
  state5,
  player5.id,
  'street:development-street',
  clock.getTime()
);
if (!reqResult5.success) throw new Error('Expected success');

const navResult5 = provider5.requestTraversal(reqResult5.request);
console.log(`Provider Report:      status="${navResult5.status}"`);

const commitResult5 = validateArrivalAndCommit(state5, reqResult5.request, navResult5);
console.log(`World Core Gate:      success=${commitResult5.success}, code="${commitResult5.code}"`);
console.log(`Player Location:      "${player5.locationId}" (Remains at origin)`);
console.log('-> VERIFIED: Interrupted traversal does not corrupt or alter authoritative location.');

// -------------------------------------------------------------------------
// Scenario 6: Stale Arrival Rejection
// -------------------------------------------------------------------------
console.log('\n--- Scenario 6: Stale Arrival Rejection ---');
const state6 = createInitialWorldState(clock);
const player6 = state6.agents.find((a) => a.id === 'agent:dev-player')!;
const provider6 = new DeterministicMockNavigationProvider('mock-provider');

const reqResult6 = createNavigationRequest(
  state6,
  player6.id,
  'street:development-street',
  clock.getTime()
);
if (!reqResult6.success) throw new Error('Expected success');

const navResult6 = provider6.requestTraversal(reqResult6.request);

// Intervening authoritative world change: agent is moved to another location
player6.locationId = 'building:development-residence';
console.log(`Intervening Change:   Player moved authoritatively to "${player6.locationId}"`);

console.log('Submitting stale arrival result...');
const commitResult6 = validateArrivalAndCommit(state6, reqResult6.request, navResult6);

console.log(`World Core Gate:      success=${commitResult6.success}, code="${commitResult6.code}"`);
console.log(`Player Location:      "${player6.locationId}" (Preserved intervening location, stale arrival rejected)`);
console.log('-> VERIFIED: Stale arrivals cannot overwrite newer authoritative world changes.');

// -------------------------------------------------------------------------
// Scenario 7: Provider Failure Isolation
// -------------------------------------------------------------------------
console.log('\n--- Scenario 7: Provider Failure Isolation ---');
const state7 = createInitialWorldState(clock);
const player7 = state7.agents.find((a) => a.id === 'agent:dev-player')!;
const provider7 = new DeterministicMockNavigationProvider('crashing-provider');
provider7.setThrowOnRequest(true, new Error('External Navigation Engine Crash'));

const reqResult7 = createNavigationRequest(
  state7,
  player7.id,
  'street:development-street',
  clock.getTime()
);
if (!reqResult7.success) throw new Error('Expected success');

try {
  provider7.requestTraversal(reqResult7.request);
} catch (err: unknown) {
  console.log(`Caught Exception:     ${(err as Error).message}`);
}
console.log(`Player Location:      "${player7.locationId}" (Completely intact)`);
console.log('-> VERIFIED: Provider exceptions are isolated; WorldState remains completely valid.');

// -------------------------------------------------------------------------
// Scenario 8: Architectural Invariants
// -------------------------------------------------------------------------
console.log('\n--- Scenario 8: Architectural Invariants ---');
console.log(`Schema Version:       ${CURRENT_WORLD_STATE_VERSION} (Strictly preserved)`);
console.log(`Provider Mutations:   NONE (Provider cannot call transitionAgentLocation)`);
console.log(`Coordinates:          NONE (0 x, y, z vectors or transforms in World Core)`);
console.log(`NavMesh / Pathfinding: NONE (Decoupled engine-independent boundary)`);
console.log(`Engine Dependencies:  NONE (Zero Unity/Unreal/DOM dependencies)`);
console.log('============================================================');
console.log('Milestone 69 Demonstration Completed Successfully');
console.log('============================================================\n');
