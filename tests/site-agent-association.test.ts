import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  snapshotWorldState,
  validateWorldState,
  CURRENT_WORLD_STATE_VERSION,
} from '../src/core/world-state.js';
import {
  SiteAgentAssociation,
  SiteAgentRole,
  VALID_SITE_AGENT_ROLES,
  validateSiteAgentAssociation,
  validateSiteAgentAssociations,
  validateSiteAgentAssociationAuthority,
  getSiteAgentAssociations,
  getSiteResident,
  getSiteAttendant,
  getAgentSiteAssociations,
} from '../src/core/site-agent-association.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import { Simulation } from '../src/core/simulation.js';

describe('Milestone 57: Site Agent Association Foundation', () => {
  const BASE_TIME = '2026-10-01T14:00:00.000Z'; // 08:00 AM Ciudad Juárez local time

  describe('1. Association Creation & Structural Validation', () => {
    it('accepts valid place + valid agent + valid role (resident)', () => {
      const assoc: SiteAgentAssociation = {
        placeId: 'building:development-residence',
        agentId: 'agent:dev-npc',
        role: 'resident',
      };

      const validSiteIds = new Set(['building:development-residence']);
      const validAgentIds = new Set(['agent:dev-npc']);

      assert.doesNotThrow(() =>
        validateSiteAgentAssociation(assoc, validSiteIds, validAgentIds)
      );
    });

    it('accepts valid place + valid agent + valid role (attendant)', () => {
      const assoc: SiteAgentAssociation = {
        placeId: 'restaurant:development-restaurant',
        agentId: 'agent:dev-npc',
        role: 'attendant',
      };

      const validSiteIds = new Set(['restaurant:development-restaurant']);
      const validAgentIds = new Set(['agent:dev-npc']);

      assert.doesNotThrow(() =>
        validateSiteAgentAssociation(assoc, validSiteIds, validAgentIds)
      );
    });

    it('strictly supports only "resident" and "attendant" roles in role vocabulary', () => {
      assert.deepEqual(VALID_SITE_AGENT_ROLES, ['resident', 'attendant']);
    });
  });

  describe('2. Invalid References & Masquerade Protection', () => {
    const validSiteIds = new Set(['building:development-residence', 'restaurant:development-restaurant']);
    const validAgentIds = new Set(['agent:dev-npc', 'agent:dev-player']);

    it('rejects missing or empty placeId', () => {
      assert.throws(
        () =>
          validateSiteAgentAssociation(
            { placeId: '', agentId: 'agent:dev-npc', role: 'resident' } as any,
            validSiteIds,
            validAgentIds
          ),
        /placeId must be a non-empty string/
      );

      assert.throws(
        () =>
          validateSiteAgentAssociation(
            { agentId: 'agent:dev-npc', role: 'resident' } as any,
            validSiteIds,
            validAgentIds
          ),
        /placeId must be a non-empty string/
      );
    });

    it('rejects missing or empty agentId', () => {
      assert.throws(
        () =>
          validateSiteAgentAssociation(
            { placeId: 'building:development-residence', agentId: '', role: 'resident' } as any,
            validSiteIds,
            validAgentIds
          ),
        /agentId must be a non-empty string/
      );

      assert.throws(
        () =>
          validateSiteAgentAssociation(
            { placeId: 'building:development-residence', role: 'resident' } as any,
            validSiteIds,
            validAgentIds
          ),
        /agentId must be a non-empty string/
      );
    });

    it('rejects unknown placeId', () => {
      assert.throws(
        () =>
          validateSiteAgentAssociation(
            { placeId: 'building:non-existent', agentId: 'agent:dev-npc', role: 'resident' },
            validSiteIds,
            validAgentIds
          ),
        /references non-existent place/
      );
    });

    it('rejects unknown agentId', () => {
      assert.throws(
        () =>
          validateSiteAgentAssociation(
            { placeId: 'building:development-residence', agentId: 'agent:non-existent', role: 'resident' },
            validSiteIds,
            validAgentIds
          ),
        /references non-existent agent/
      );
    });

    it('rejects when an Agent ID masquerades as a Place ID', () => {
      assert.throws(
        () =>
          validateSiteAgentAssociation(
            { placeId: 'agent:dev-npc', agentId: 'agent:dev-player', role: 'resident' },
            validSiteIds,
            validAgentIds,
            validAgentIds,
            validSiteIds
          ),
        /placeId "agent:dev-npc" references an agent, not a place/
      );
    });

    it('rejects when a Restaurant or Place ID masquerades as an Agent ID', () => {
      assert.throws(
        () =>
          validateSiteAgentAssociation(
            { placeId: 'building:development-residence', agentId: 'restaurant:development-restaurant', role: 'resident' },
            validSiteIds,
            validAgentIds,
            validAgentIds,
            validSiteIds
          ),
        /agentId "restaurant:development-restaurant" references a place\/restaurant, not an agent/
      );
    });
  });

  describe('3. Invalid Roles', () => {
    const validSiteIds = new Set(['building:development-residence']);
    const validAgentIds = new Set(['agent:dev-npc']);

    it('rejects unauthorized roles such as "owner", "visitor", "occupant", or "manager"', () => {
      const invalidRoles = ['owner', 'visitor', 'occupant', 'manager', 'tenant', 'guest'];
      for (const role of invalidRoles) {
        assert.throws(
          () =>
            validateSiteAgentAssociation(
              { placeId: 'building:development-residence', agentId: 'agent:dev-npc', role } as any,
              validSiteIds,
              validAgentIds
            ),
          /Invalid SiteAgentAssociation role.*Must be "resident" or "attendant"/
        );
      }
    });
  });

  describe('4. Uniqueness & Multi-Site Cardinality', () => {
    it('rejects duplicate associations for the same place + same agent + same role', () => {
      const associations: SiteAgentAssociation[] = [
        {
          placeId: 'building:development-residence',
          agentId: 'agent:dev-npc',
          role: 'resident',
        },
        {
          placeId: 'building:development-residence',
          agentId: 'agent:dev-npc',
          role: 'resident',
        },
      ];

      assert.throws(
        () => validateSiteAgentAssociations(associations),
        /Duplicate site agent association/
      );
    });

    it('allows the same agent to be associated with multiple sites in different roles', () => {
      const associations: SiteAgentAssociation[] = [
        {
          placeId: 'building:development-residence',
          agentId: 'agent:dev-npc',
          role: 'resident',
        },
        {
          placeId: 'restaurant:development-restaurant',
          agentId: 'agent:dev-npc',
          role: 'attendant',
        },
      ];

      assert.doesNotThrow(() => validateSiteAgentAssociations(associations));
    });

    it('rejects multiple resident associations for the same place (cardinality: max 1 resident)', () => {
      const associations: SiteAgentAssociation[] = [
        {
          placeId: 'building:development-residence',
          agentId: 'agent:dev-npc',
          role: 'resident',
        },
        {
          placeId: 'building:development-residence',
          agentId: 'agent:dev-player',
          role: 'resident',
        },
      ];

      assert.throws(
        () => validateSiteAgentAssociations(associations),
        /Invalid site agent associations: Place "building:development-residence" cannot have multiple resident associations/
      );
    });

    it('allows multiple attendants at the same place (cardinality: 0..N attendants)', () => {
      const associations: SiteAgentAssociation[] = [
        {
          placeId: 'restaurant:development-restaurant',
          agentId: 'agent:dev-npc',
          role: 'attendant',
        },
        {
          placeId: 'restaurant:development-restaurant',
          agentId: 'agent:dev-player',
          role: 'attendant',
        },
      ];

      assert.doesNotThrow(() => validateSiteAgentAssociations(associations));
    });

    it('allows a resident and an attendant at the same place', () => {
      const associations: SiteAgentAssociation[] = [
        {
          placeId: 'building:development-residence',
          agentId: 'agent:dev-npc',
          role: 'resident',
        },
        {
          placeId: 'building:development-residence',
          agentId: 'agent:dev-player',
          role: 'attendant',
        },
      ];

      assert.doesNotThrow(() => validateSiteAgentAssociations(associations));
    });
  });

  describe('5. Development Seed & Fixture Configuration', () => {
    it('initializes development world with explicit residence and restaurant associations', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      assert.equal(state.version, CURRENT_WORLD_STATE_VERSION);
      assert.equal(state.version, 18);
      assert.equal(state.siteAgentAssociations.length, 2);

      const residenceAssoc = getSiteResident(state, 'building:development-residence');
      assert.ok(residenceAssoc);
      assert.equal(residenceAssoc.agentId, 'agent:dev-npc');
      assert.equal(residenceAssoc.role, 'resident');

      const restaurantAssoc = getSiteAttendant(state, 'restaurant:development-restaurant');
      assert.ok(restaurantAssoc);
      assert.equal(restaurantAssoc.agentId, 'agent:dev-npc');
      assert.equal(restaurantAssoc.role, 'attendant');

      // The same dev-npc identity is associated with both sites
      const npcAssociations = getAgentSiteAssociations(state, 'agent:dev-npc');
      assert.equal(npcAssociations.length, 2);
    });

    it('allows empty or partial site agent associations (e.g. migrated worlds without associations)', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      const stateWithoutAssociations = {
        ...state,
        siteAgentAssociations: [],
      };
      assert.doesNotThrow(() => validateSiteAgentAssociationAuthority(stateWithoutAssociations));
      assert.doesNotThrow(() => validateWorldState(stateWithoutAssociations));
    });

    it('guarantees getSiteResident returns exactly 0 or 1 result backed by cardinality invariant', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      // Site with resident
      const res = getSiteResident(state, 'building:development-residence');
      assert.ok(res);
      assert.equal(res.agentId, 'agent:dev-npc');
      assert.equal(res.role, 'resident');

      // Site without resident
      const none = getSiteResident(state, 'restaurant:development-restaurant');
      assert.equal(none, undefined);

      const arbitrary = getSiteResident(state, 'street:development-street');
      assert.equal(arbitrary, undefined);
    });

    it('does not require arbitrary spatial hierarchy places (city, district, neighborhood, street) to have associations', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      // Querying associations on arbitrary places returns empty arrays and passes validation cleanly
      assert.deepEqual(getSiteAgentAssociations(state, 'city:ciudad-juarez'), []);
      assert.deepEqual(getSiteAgentAssociations(state, 'district:development-district'), []);
      assert.deepEqual(getSiteAgentAssociations(state, 'neighborhood:development-neighborhood'), []);
      assert.deepEqual(getSiteAgentAssociations(state, 'street:development-street'), []);
    });
  });

  describe('6. Separation Invariants (M56 + M57 Authority Boundaries)', () => {
    it('site association does NOT mutate or dictate agent.locationId', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      const npc = state.agents.find((a) => a.id === 'agent:dev-npc')!;
      assert.equal(npc.locationId, 'building:development-residence');

      // dev-npc is attendant at restaurant, but physical location is currently residence
      const attendantAssoc = getSiteAttendant(state, 'restaurant:development-restaurant');
      assert.ok(attendantAssoc);
      assert.equal(attendantAssoc.agentId, 'agent:dev-npc');
      assert.notEqual(npc.locationId, 'restaurant:development-restaurant');
    });

    it('site association does NOT mutate property.assignment and property remains unassigned', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      // dev-npc is the resident of development-residence
      const residentAssoc = getSiteResident(state, 'building:development-residence');
      assert.ok(residentAssoc);
      assert.equal(residentAssoc.agentId, 'agent:dev-npc');

      // But property:development-residence remains strictly unassigned
      const residenceProperty = state.properties.find(
        (p) => p.buildingId === 'building:development-residence'
      )!;
      assert.ok(residenceProperty);
      assert.equal(residenceProperty.assignment.status, 'unassigned');
      assert.equal((residenceProperty.assignment as any).holder, undefined);
    });

    it('property assignment does NOT create or alter site agent association', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      const propKiosk = state.properties.find((p) => p.id === 'property:avenida-juarez-kiosk')!;
      assert.ok(propKiosk);

      // Kiosk property exists, but kiosk site has no site agent association
      assert.deepEqual(getSiteAgentAssociations(state, 'building:avenida-juarez-kiosk'), []);
    });
  });

  describe('7. Persistence Roundtrip', () => {
    it('survives persistence roundtrip, reload, and maintains schema version 18', () => {
      const testFile = join(tmpdir(), `test-site-assoc-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const clock = WorldClock.create(BASE_TIME);
        const state = createInitialWorldState(clock);

        const persistence = new LocalFilePersistence(testFile);
        persistence.save(state);

        const loaded = persistence.load();
        assert.ok(loaded);
        assert.equal(loaded.version, 18);
        assert.equal(loaded.siteAgentAssociations.length, 2);

        assert.deepEqual(loaded.siteAgentAssociations, state.siteAgentAssociations);
        assert.doesNotThrow(() => validateWorldState(loaded));
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });

  describe('8. Existing NPC Schedule & Physical Movement Regression', () => {
    it('continues moving NPC according to existing Ciudad Juárez civil-time schedule', () => {
      const clock = WorldClock.create('2026-10-01T14:00:00.000Z'); // 08:00 AM local
      const state = createInitialWorldState(clock);
      const sim = new Simulation(clock, state);

      // 08:00 Local: Residence
      sim.tick();
      assert.equal(state.agents.find((a) => a.id === 'agent:dev-npc')!.locationId, 'building:development-residence');

      // 08:30 Local: Morning Commute to Street (14:30 UTC)
      clock.advance(30 * 60 * 1000);
      sim.tick();
      assert.equal(state.agents.find((a) => a.id === 'agent:dev-npc')!.locationId, 'street:development-street');

      // 09:00 Local: Restaurant Work Shift (15:00 UTC)
      clock.advance(30 * 60 * 1000);
      sim.tick();
      assert.equal(state.agents.find((a) => a.id === 'agent:dev-npc')!.locationId, 'restaurant:development-restaurant');

      // 18:00 Local: Promenade on Avenida Juárez (00:00 UTC next day)
      clock.advance(9 * 60 * 60 * 1000);
      sim.tick();
      assert.equal(state.agents.find((a) => a.id === 'agent:dev-npc')!.locationId, 'street:avenida-juarez');

      // 20:30 Local: Return Home to Residence (02:30 UTC next day)
      clock.advance(2.5 * 60 * 60 * 1000);
      sim.tick();
      assert.equal(state.agents.find((a) => a.id === 'agent:dev-npc')!.locationId, 'building:development-residence');

      // While NPC moves across all these locations, the site associations remain completely unchanged
      assert.equal(getSiteResident(state, 'building:development-residence')?.agentId, 'agent:dev-npc');
      assert.equal(getSiteAttendant(state, 'restaurant:development-restaurant')?.agentId, 'agent:dev-npc');
    });
  });
});
