import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import { createGomezMorinSeedWorld } from '../src/core/seed.js';
import { Simulation } from '../src/core/simulation.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { WorldSessionController } from '../src/server/session-controller.js';
import { createWorldServer } from '../src/server/http-server.js';
import {
  getSiteAttendant,
  getAgentAttendedSite,
  getAgentSiteAssociations,
  validateSiteAgentAssociation,
  validateSiteAgentAssociations,
  validateSiteAgentAssociationAuthority,
  type SiteAgentAssociation,
} from '../src/core/site-agent-association.js';
import {
  inspectCurrentLocation,
  enterRestaurant,
  exitRestaurant,
  transitionAgentLocation,
  validateWorldState,
  DEFAULT_WORLD_ID,
  type WorldState,
} from '../src/core/world-state.js';
import { deriveCivilTime } from '../src/core/civil-time.js';
import { areAgentsCoLocated } from '../src/core/co-presence.js';
import { ELENA_NPC_SCHEDULE } from '../src/core/development-npc-schedule.js';
import {
  enterThroughEntranceThreshold,
  exitThroughEntranceThreshold,
} from '../src/core/real-world-street-topology.js';

describe('Milestone 90: Authoritative NPC Establishment Attendance', () => {
  // Test baseline timestamps:
  // Gómez Morín slice uses America/Ciudad_Juarez (UTC-6 in standard time)
  // Shift hours: 09:00 to 17:00 Civil Time.
  // 10:00 AM Civil = 16:00 UTC (during on-duty shift)
  // 18:00 PM Civil = 00:00 UTC next day (off-duty promenade)
  // 22:00 PM Civil = 04:00 UTC next day (off-duty residence rest)
  const ON_DUTY_WORLD_TIME = '2026-09-14T16:00:00.000Z'; // 10:00 AM Ciudad Juárez
  const OFF_DUTY_WORLD_TIME = '2026-09-14T04:00:00.000Z'; // 22:00 PM Ciudad Juárez (previous evening)

  function setupGomezMorinState(initialTime: string = ON_DUTY_WORLD_TIME): {
    state: WorldState;
    clock: WorldClock;
  } {
    const seed = createGomezMorinSeedWorld(initialTime);
    const clock = new WorldClock(initialTime);
    const state: WorldState = {
      worldId: DEFAULT_WORLD_ID,
      version: 19,
      worldTime: initialTime,
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
      properties: seed.properties,
      siteAgentAssociations: seed.siteAgentAssociations,
    };
    return { state, clock };
  }

  // =========================================================================
  // 1. NPC Identity
  // =========================================================================
  describe('1. NPC Identity', () => {
    it('verifies Wing Spot attendant exists as a normal authoritative Agent entity', () => {
      const { state } = setupGomezMorinState();
      const attendant = state.agents.find((a) => a.id === 'agent:elena-npc');

      assert.ok(attendant, 'Attendant agent must exist in world state');
      assert.equal(attendant.id, 'agent:elena-npc');
      assert.equal(attendant.name, 'Elena Morales');
      assert.equal(attendant.agentType, 'npc');
      assert.equal(attendant.type, 'agent');
    });

    it('verifies attendant ID is deterministic and stable', () => {
      const { state: state1 } = setupGomezMorinState();
      const { state: state2 } = setupGomezMorinState();

      const a1 = state1.agents.find((a) => a.id === 'agent:elena-npc')!;
      const a2 = state2.agents.find((a) => a.id === 'agent:elena-npc')!;

      assert.equal(a1.id, a2.id);
      assert.equal(a1.name, a2.name);
      assert.equal(a1.id, ELENA_NPC_SCHEDULE.npcId);
    });

    it('verifies attendant conforms to Agent schema invariants (Schema 19)', () => {
      const { state } = setupGomezMorinState();
      assert.doesNotThrow(() => validateWorldState(state));
    });
  });

  // =========================================================================
  // 2. Establishment Relationship
  // =========================================================================
  describe('2. Establishment Relationship', () => {
    it('resolves attendant from establishment via getSiteAttendant', () => {
      const { state } = setupGomezMorinState();
      const attendantAssoc = getSiteAttendant(state, 'restaurant:wing-spot');

      assert.ok(attendantAssoc, 'Wing Spot must have an attendant association');
      assert.equal(attendantAssoc.placeId, 'restaurant:wing-spot');
      assert.equal(attendantAssoc.agentId, 'agent:elena-npc');
      assert.equal(attendantAssoc.role, 'attendant');
    });

    it('resolves establishment from attendant via getAgentAttendedSite', () => {
      const { state } = setupGomezMorinState();
      const attendedSite = getAgentAttendedSite(state, 'agent:elena-npc');

      assert.ok(attendedSite, 'Elena must have an attended site association');
      assert.equal(attendedSite.placeId, 'restaurant:wing-spot');
      assert.equal(attendedSite.agentId, 'agent:elena-npc');
      assert.equal(attendedSite.role, 'attendant');
    });

    it('returns all associations for attendant including residency via getAgentSiteAssociations', () => {
      const { state } = setupGomezMorinState();
      const assocs = getAgentSiteAssociations(state, 'agent:elena-npc');

      assert.equal(assocs.length, 2);
      const residentAssoc = assocs.find((a) => a.role === 'resident');
      const attendantAssoc = assocs.find((a) => a.role === 'attendant');

      assert.ok(residentAssoc);
      assert.equal(residentAssoc.placeId, 'building:del-porvenir-residence');
      assert.ok(attendantAssoc);
      assert.equal(attendantAssoc.placeId, 'restaurant:wing-spot');
    });

    it('returns undefined for establishment with no designated attendant', () => {
      const { state } = setupGomezMorinState();
      const noAttendant = getSiteAttendant(state, 'restaurant:pasteleria-tia-lupe');
      assert.equal(noAttendant, undefined);
    });
  });

  // =========================================================================
  // 3. Spatial State & Interior Occupancy
  // =========================================================================
  describe('3. Spatial State & Interior Occupancy', () => {
    it('allows attendant to occupy interior:wing-spot with matching associatedPlaceId', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });

      // Run simulation tick during shift
      sim.tick();

      const attendant = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      assert.equal(attendant.locationId, 'restaurant:wing-spot');
      assert.equal(attendant.interiorSpaceId, 'interior:wing-spot');
      assert.equal(attendant.activityState, 'active');

      // Validates under strict Schema 19 WorldState validation
      assert.doesNotThrow(() => validateWorldState(state));
    });

    it('clears interiorSpaceId when transitioning attendant out of establishment', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      const attendant = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      assert.equal(attendant.interiorSpaceId, 'interior:wing-spot');

      // Transition attendant to street
      transitionAgentLocation(state, 'agent:elena-npc', 'street:blvd-gomez-morin');
      assert.equal(attendant.locationId, 'street:blvd-gomez-morin');
      assert.equal(attendant.interiorSpaceId, null, 'interiorSpaceId must be reset to null when leaving interior');
    });

    it('rejects invalid attendant location referencing non-existent place', () => {
      const { state } = setupGomezMorinState();
      assert.throws(
        () => transitionAgentLocation(state, 'agent:elena-npc', 'place:phantom-zone'),
        /does not exist in world state/
      );
    });
  });

  // =========================================================================
  // 4. Deterministic Attendance Behavior
  // =========================================================================
  describe('4. Deterministic Attendance Behavior', () => {
    it('transitions attendant to active inside Wing Spot during shift [09:00, 17:00)', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME); // 10:00 AM
      const sim = new Simulation(clock, state, { silent: true });

      const tickResult = sim.tick();
      const attendant = state.agents.find((a) => a.id === 'agent:elena-npc')!;

      assert.equal(attendant.activityState, 'active');
      assert.equal(attendant.locationId, 'restaurant:wing-spot');
      assert.equal(attendant.interiorSpaceId, 'interior:wing-spot');
      assert.equal(attendant.activitySince, ON_DUTY_WORLD_TIME);
      assert.ok(tickResult.transitions.some((t) => t.agentId === 'agent:elena-npc'));
    });

    it('transitions attendant to idle outside restaurant after shift ends (18:00)', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Start on-duty

      // Advance clock by 8 hours to 18:00 (promenade)
      clock.advance(8 * 3600 * 1000);
      const tickResult = sim.tick();

      const attendant = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      assert.equal(attendant.activityState, 'idle');
      assert.equal(attendant.locationId, 'street:blvd-gomez-morin');
      assert.equal(attendant.interiorSpaceId, null);
      assert.equal(attendant.activitySince, clock.getTime());
    });

    it('transitions attendant to home residence at night (22:00)', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      // Advance clock by 12 hours to 22:00 (rest at home)
      clock.advance(12 * 3600 * 1000);
      sim.tick();

      const attendant = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      assert.equal(attendant.activityState, 'idle');
      assert.equal(attendant.locationId, 'building:del-porvenir-residence');
      assert.equal(attendant.interiorSpaceId, null);
    });

    it('maintains monotonic activitySince when state does not change', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick();

      const attendant = state.agents.find((a) => a.id === 'agent:elena-npc')!;
      const originalSince = attendant.activitySince;

      // Advance 10 minutes (still in shift)
      clock.advance(10 * 60 * 1000);
      sim.tick();

      assert.equal(attendant.activitySince, originalSince, 'activitySince must not be updated if state unchanged');
    });
  });

  // =========================================================================
  // 5. Simulation Authority
  // =========================================================================
  describe('5. Simulation Authority', () => {
    it('executes discrete simulation ticks with zero timer/setInterval dependencies', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });

      // Synchronous execution
      const result = sim.tick();
      assert.ok(result);
      assert.equal(result.worldTime, ON_DUTY_WORLD_TIME);
    });

    it('is strictly deterministic given identical initial state and time inputs', () => {
      const runA = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const simA = new Simulation(runA.clock, runA.state, { silent: true });
      simA.tick();

      const runB = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const simB = new Simulation(runB.clock, runB.state, { silent: true });
      simB.tick();

      const elenaA = runA.state.agents.find((a) => a.id === 'agent:elena-npc')!;
      const elenaB = runB.state.agents.find((a) => a.id === 'agent:elena-npc')!;

      assert.deepEqual(elenaA, elenaB);
    });
  });

  // =========================================================================
  // 6. Player Co-Presence & World Perception
  // =========================================================================
  describe('6. Player Co-Presence & World Perception', () => {
    it('reports co-presence when player and attendant are both inside Wing Spot', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Elena enters Wing Spot interior

      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      // Player enters Wing Spot via authoritative entrance threshold
      const enterRes = enterThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
      });
      assert.equal(enterRes.success, true);
      assert.equal(player.locationId, 'restaurant:wing-spot');
      assert.equal(player.interiorSpaceId, 'interior:wing-spot');

      // Verify co-location primitive
      assert.equal(areAgentsCoLocated(state, player.id, 'agent:elena-npc'), true);

      // Verify inspectCurrentLocation query projection
      const locView = inspectCurrentLocation(state, player.id);
      assert.equal(locView.success, true);
      assert.ok(locView.location);

      // ObservableAgent collection includes Elena
      const obsAttendant = locView.location.agents.find((a) => a.id === 'agent:elena-npc');
      assert.ok(obsAttendant);
      assert.equal(obsAttendant.id, 'agent:elena-npc');
      assert.equal(obsAttendant.name, 'Elena Morales');
      assert.equal(obsAttendant.agentType, 'npc');

      // Authoritative attendant projection is populated
      assert.ok(locView.location.attendant);
      assert.equal(locView.location.attendant.id, 'agent:elena-npc');
      assert.equal(locView.location.attendant.name, 'Elena Morales');
      assert.equal(locView.location.attendant.establishmentId, 'restaurant:wing-spot');
      assert.equal(locView.location.attendant.role, 'attendant');
      assert.equal(locView.location.attendant.isPresent, true);
      assert.equal(locView.location.attendant.locationId, 'restaurant:wing-spot');
      assert.equal(locView.location.attendant.interiorSpaceId, 'interior:wing-spot');
      assert.equal(locView.location.attendant.activityState, 'active');
    });

    it('reports attendant as not present when player enters Wing Spot outside attendant shift', () => {
      const { state, clock } = setupGomezMorinState(OFF_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Elena is at home residence

      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      // Place player inside Wing Spot
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';

      assert.equal(areAgentsCoLocated(state, player.id, 'agent:elena-npc'), false);

      const locView = inspectCurrentLocation(state, player.id);
      assert.equal(locView.success, true);
      assert.ok(locView.location);

      // Elena is NOT in co-located agents
      const obsElena = locView.location.agents.find((a) => a.id === 'agent:elena-npc');
      assert.equal(obsElena, undefined);

      // Attendant projection accurately reports isPresent: false
      assert.ok(locView.location.attendant);
      assert.equal(locView.location.attendant.id, 'agent:elena-npc');
      assert.equal(locView.location.attendant.isPresent, false);
      assert.equal(locView.location.attendant.locationId, 'building:del-porvenir-residence');
      assert.equal(locView.location.attendant.interiorSpaceId, null);
      assert.equal(locView.location.attendant.activityState, 'idle');
    });

    it('reports attendant is absent from street view when player exits Wing Spot', () => {
      const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
      const sim = new Simulation(clock, state, { silent: true });
      sim.tick(); // Elena inside Wing Spot

      const player = state.agents.find((a) => a.id === 'agent:gomez-morin-player')!;
      player.locationId = 'restaurant:wing-spot';
      player.interiorSpaceId = 'interior:wing-spot';

      // Player exits to street via entrance threshold
      const exitRes = exitThroughEntranceThreshold(state, {
        agentId: player.id,
        entranceId: 'entrance:wing-spot-main',
      });
      assert.equal(exitRes.success, true);
      assert.equal(player.locationId, 'street:blvd-gomez-morin');
      assert.equal(player.interiorSpaceId, null);

      const locView = inspectCurrentLocation(state, player.id);
      assert.equal(locView.success, true);
      assert.ok(locView.location);
      assert.equal(locView.location.id, 'street:blvd-gomez-morin');

      // Street has no attendant association
      assert.equal(locView.location.attendant, undefined);
      // Elena is inside Wing Spot, not on street
      assert.equal(locView.location.agents.some((a) => a.id === 'agent:elena-npc'), false);
    });
  });

  // =========================================================================
  // 7. Persistence & Reload
  // =========================================================================
  describe('7. Persistence & Reload', () => {
    it('persists attendant identity, location, and site association across reload', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm90-test-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const { state, clock } = setupGomezMorinState(ON_DUTY_WORLD_TIME);
        const sim = new Simulation(clock, state, { silent: true });
        sim.tick(); // Elena enters Wing Spot interior

        const persistence = new LocalFilePersistence(persistencePath);
        persistence.save(state);

        // Reload fresh state from disk
        const restoredState = persistence.load();
        assert.ok(restoredState);
        assert.equal(restoredState.version, 19);

        // Validate restored attendant
        const restoredAttendant = restoredState.agents.find((a) => a.id === 'agent:elena-npc');
        assert.ok(restoredAttendant);
        assert.equal(restoredAttendant.name, 'Elena Morales');
        assert.equal(restoredAttendant.locationId, 'restaurant:wing-spot');
        assert.equal(restoredAttendant.interiorSpaceId, 'interior:wing-spot');
        assert.equal(restoredAttendant.activityState, 'active');

        // Validate restored site association
        const restoredAssoc = getSiteAttendant(restoredState, 'restaurant:wing-spot');
        assert.ok(restoredAssoc);
        assert.equal(restoredAssoc.agentId, 'agent:elena-npc');
        assert.equal(restoredAssoc.role, 'attendant');

        // Full schema validation
        assert.doesNotThrow(() => validateWorldState(restoredState));
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // 8. Failure Cases & Integrity Protection
  // =========================================================================
  describe('8. Failure Cases & Integrity Protection', () => {
    it('rejects site agent association referencing non-existent establishment', () => {
      const { state } = setupGomezMorinState();
      const invalidAssoc: SiteAgentAssociation = {
        placeId: 'restaurant:phantom-establishment',
        agentId: 'agent:elena-npc',
        role: 'attendant',
      };

      const validSiteIds = new Set([
        ...state.places.map((p) => p.id),
        ...state.restaurants.map((r) => r.id),
      ]);
      const validAgentIds = new Set(state.agents.map((a) => a.id));

      assert.throws(
        () => validateSiteAgentAssociation(invalidAssoc, validSiteIds, validAgentIds),
        /references non-existent place/
      );
    });

    it('rejects site agent association referencing non-existent agent', () => {
      const { state } = setupGomezMorinState();
      const invalidAssoc: SiteAgentAssociation = {
        placeId: 'restaurant:wing-spot',
        agentId: 'agent:ghost-attendant',
        role: 'attendant',
      };

      const validSiteIds = new Set([
        ...state.places.map((p) => p.id),
        ...state.restaurants.map((r) => r.id),
      ]);
      const validAgentIds = new Set(state.agents.map((a) => a.id));

      assert.throws(
        () => validateSiteAgentAssociation(invalidAssoc, validSiteIds, validAgentIds),
        /references non-existent agent/
      );
    });

    it('rejects duplicate site agent association tuple (same place + same agent + same role)', () => {
      const duplicateAssocs: SiteAgentAssociation[] = [
        {
          placeId: 'restaurant:wing-spot',
          agentId: 'agent:elena-npc',
          role: 'attendant',
        },
        {
          placeId: 'restaurant:wing-spot',
          agentId: 'agent:elena-npc',
          role: 'attendant',
        },
      ];

      assert.throws(
        () => validateSiteAgentAssociations(duplicateAssocs),
        /Duplicate site agent association/
      );
    });

    it('rejects agent masquerading as a place', () => {
      const invalidAssoc: SiteAgentAssociation = {
        placeId: 'agent:elena-npc',
        agentId: 'agent:gomez-morin-player',
        role: 'attendant',
      };
      const knownAgentIds = new Set(['agent:elena-npc', 'agent:gomez-morin-player']);

      assert.throws(
        () => validateSiteAgentAssociation(invalidAssoc, undefined, undefined, knownAgentIds),
        /references an agent, not a place/
      );
    });

    it('rejects restaurant masquerading as an agent', () => {
      const invalidAssoc: SiteAgentAssociation = {
        placeId: 'building:wing-spot-building',
        agentId: 'restaurant:wing-spot',
        role: 'attendant',
      };
      const knownSiteIds = new Set(['building:wing-spot-building', 'restaurant:wing-spot']);

      assert.throws(
        () => validateSiteAgentAssociation(invalidAssoc, undefined, undefined, undefined, knownSiteIds),
        /references a place\/restaurant, not an agent/
      );
    });

    it('rejects world state validation if attendant is missing from agents collection', () => {
      const { state } = setupGomezMorinState();
      // Remove Elena from agents
      state.agents = state.agents.filter((a) => a.id !== 'agent:elena-npc');

      assert.throws(
        () => validateWorldState(state),
        /references non-existent agent/
      );
    });
  });

  // =========================================================================
  // 9. Server Session Controller & HTTP API Read Model
  // =========================================================================
  describe('9. Server Session Controller & HTTP API Read Model', () => {
    it('surfaces authoritative attendant projection via controller getLocationView()', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm90-session-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        // Advance simulation by 1 second to trigger tick and routine entrance
        await controller.stepSimulation(1000);

        // Player enters Wing Spot
        const enterCmdRes = await controller.dispatchCommand('enterRestaurant', {
          restaurantId: 'restaurant:wing-spot',
        });
        assert.equal(enterCmdRes.success, true);

        // Read location view
        const locView = controller.getLocationView();
        assert.equal(locView.success, true);
        assert.ok(locView.location);
        assert.equal(locView.location.id, 'restaurant:wing-spot');

        // Verify attendant projection
        assert.ok(locView.location.attendant);
        assert.equal(locView.location.attendant.id, 'agent:elena-npc');
        assert.equal(locView.location.attendant.name, 'Elena Morales');
        assert.equal(locView.location.attendant.establishmentId, 'restaurant:wing-spot');
        assert.equal(locView.location.attendant.isPresent, true);
        assert.equal(locView.location.attendant.activityState, 'active');
        assert.equal(locView.location.attendant.interiorSpaceId, 'interior:wing-spot');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('prohibits client mutation of NPC state through command dispatch', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm90-mutation-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });

        // Attempting to dispatch an unknown or arbitrary command targeting NPC
        const result = await controller.dispatchCommand('mutateNpcState' as any, {
          agentId: 'agent:elena-npc',
          activityState: 'idle',
        });

        assert.equal(result.success, false);
        assert.equal(result.committed, false);
        assert.ok(result.error);

        // Elena remains intact
        const restoredState = controller.getPersistence().load();
        const attendantAssoc = getSiteAttendant(restoredState, 'restaurant:wing-spot');
        assert.equal(attendantAssoc?.agentId, 'agent:elena-npc');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('surfaces attendant state via GET /api/location over HTTP server', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'm90-http-'));
      const persistencePath = join(tempDir, 'world-state.json');

      try {
        const controller = new WorldSessionController({
          persistencePath,
          worldSeed: 'gomez-morin',
          initialWorldTime: ON_DUTY_WORLD_TIME,
          silent: true,
        });
        await controller.stepSimulation(1000);
        await controller.dispatchCommand('enterRestaurant', {
          restaurantId: 'restaurant:wing-spot',
        });

        const server = createWorldServer({ controller, silent: true });
        const info = await server.start(0, '127.0.0.1');

        try {
          const res = await fetch(`${info.url}/api/location`);
          assert.equal(res.status, 200);

          const body = await res.json();
          assert.equal(body.success, true);
          assert.ok(body.result.location);
          assert.equal(body.result.location.id, 'restaurant:wing-spot');

          const attendant = body.result.location.attendant;
          assert.ok(attendant);
          assert.equal(attendant.id, 'agent:elena-npc');
          assert.equal(attendant.name, 'Elena Morales');
          assert.equal(attendant.isPresent, true);
          assert.equal(attendant.activityState, 'active');
          assert.equal(attendant.interiorSpaceId, 'interior:wing-spot');
        } finally {
          await server.stop();
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
