import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { WorldClock } from '../src/core/clock.js';
import {
  createInitialWorldState,
  validateWorldState,
  snapshotWorldState,
} from '../src/core/world-state.js';
import { LocalFilePersistence } from '../src/persistence/local-storage.js';
import {
  Property,
  validateProperty,
  validateProperties,
  validatePropertyAuthority,
  getProperty,
  getPropertyByBuildingId,
  isPropertyAssigned,
} from '../src/core/property.js';
import { createDevelopmentSeedWorld, createRealWorldJuarezSeedWorld } from '../src/core/seed.js';

describe('Milestone 56: Property & Assignment Foundation', () => {
  const BASE_TIME = '2026-09-14T09:00:00.000Z';

  // =========================================================================
  // 1. Property Model Validation & Invariants
  // =========================================================================
  describe('1. Property Model Validation & Invariants', () => {
    it('validates a correct unassigned residence property', () => {
      const prop: Property = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: { status: 'unassigned' },
      };
      assert.doesNotThrow(() => validateProperty(prop));
    });

    it('validates a correct unassigned commercial property', () => {
      const prop: Property = {
        id: 'property:development-building',
        buildingId: 'building:development-building',
        propertyType: 'commercial',
        assignment: { status: 'unassigned' },
      };
      assert.doesNotThrow(() => validateProperty(prop));
    });

    it('validates a correct assigned property with agent holder', () => {
      const prop: Property = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: {
          status: 'assigned',
          holder: { holderType: 'agent', holderId: 'agent:dev-npc' },
          assignedAt: '2026-09-14T09:00:00.000Z',
        },
      };
      assert.doesNotThrow(() => validateProperty(prop));
    });

    it('validates a correct assigned property with organization holder', () => {
      const prop: Property = {
        id: 'property:development-building',
        buildingId: 'building:development-building',
        propertyType: 'commercial',
        assignment: {
          status: 'assigned',
          holder: { holderType: 'organization', holderId: 'org:downtown-corp' },
          assignedAt: '2026-09-14T09:00:00.000Z',
        },
      };
      assert.doesNotThrow(() => validateProperty(prop));
    });

    it('validates a correct assigned property with person holder', () => {
      const prop: Property = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: {
          status: 'assigned',
          holder: { holderType: 'person', holderId: 'person:citizen-42' },
          assignedAt: '2026-09-14T09:00:00.000Z',
        },
      };
      assert.doesNotThrow(() => validateProperty(prop));
    });

    it('rejects invalid property ID format', () => {
      const prop: Property = {
        id: '',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: { status: 'unassigned' },
      };
      assert.throws(
        () => validateProperty(prop),
        /Invalid property id format/
      );
    });

    it('rejects invalid building ID format', () => {
      const prop: Property = {
        id: 'property:development-residence',
        buildingId: '',
        propertyType: 'residence',
        assignment: { status: 'unassigned' },
      };
      assert.throws(
        () => validateProperty(prop),
        /Invalid buildingId/
      );
    });

    it('rejects invalid propertyType', () => {
      const prop = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'industrial',
        assignment: { status: 'unassigned' },
      };
      assert.throws(
        () => validateProperty(prop as any),
        /Invalid property propertyType/
      );
    });

    it('rejects "residential" as propertyType (must be strictly "residence" or "commercial")', () => {
      const prop = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residential',
        assignment: { status: 'unassigned' },
      };
      assert.throws(
        () => validateProperty(prop as any),
        /Invalid property propertyType "residential" for property "property:development-residence". Expected 'residence' or 'commercial'./
      );
    });

    it('rejects invalid assignment status', () => {
      const prop = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: { status: 'pending' },
      };
      assert.throws(
        () => validateProperty(prop as any),
        /Invalid property assignment status/
      );
    });

    it('rejects unassigned property with defined holder or assignedAt', () => {
      const propWithHolder: Property = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: {
          status: 'unassigned',
          holder: { holderType: 'agent', holderId: 'agent:dev-npc' },
        },
      };
      assert.throws(
        () => validateProperty(propWithHolder),
        /Unassigned property cannot have holder or assignedAt/
      );

      const propWithAssignedAt: Property = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: {
          status: 'unassigned',
          assignedAt: '2026-09-14T09:00:00.000Z',
        },
      };
      assert.throws(
        () => validateProperty(propWithAssignedAt),
        /Unassigned property cannot have holder or assignedAt/
      );
    });

    it('rejects assigned property missing holder or assignedAt', () => {
      const propMissingHolder: Property = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: {
          status: 'assigned',
          assignedAt: '2026-09-14T09:00:00.000Z',
        } as any,
      };
      assert.throws(
        () => validateProperty(propMissingHolder),
        /Assigned property must have a valid holder/
      );

      const propMissingAssignedAt: Property = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: {
          status: 'assigned',
          holder: { holderType: 'agent', holderId: 'agent:dev-npc' },
        } as any,
      };
      assert.throws(
        () => validateProperty(propMissingAssignedAt),
        /Assigned property must have a valid assignedAt timestamp/
      );
    });

    it('rejects assigned property with invalid holderType', () => {
      const prop = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: {
          status: 'assigned',
          holder: { holderType: 'corporation', holderId: 'org:corp' },
          assignedAt: '2026-09-14T09:00:00.000Z',
        },
      };
      assert.throws(
        () => validateProperty(prop as any),
        /Invalid property holderType/
      );
    });

    it('rejects assigned property with invalid ISO assignedAt timestamp', () => {
      const prop: Property = {
        id: 'property:development-residence',
        buildingId: 'building:development-residence',
        propertyType: 'residence',
        assignment: {
          status: 'assigned',
          holder: { holderType: 'agent', holderId: 'agent:dev-npc' },
          assignedAt: 'not-a-timestamp',
        },
      };
      assert.throws(
        () => validateProperty(prop),
        /Property assignedAt must be a valid ISO timestamp/
      );
    });
  });

  // =========================================================================
  // 2. Collection Validation & Cross-Domain Authority Invariants
  // =========================================================================
  describe('2. Collection Validation & Cross-Domain Authority Invariants', () => {
    it('rejects duplicate property IDs in collection', () => {
      const props: Property[] = [
        {
          id: 'property:development-residence',
          buildingId: 'building:development-residence',
          propertyType: 'residence',
          assignment: { status: 'unassigned' },
        },
        {
          id: 'property:development-residence',
          buildingId: 'building:development-building',
          propertyType: 'commercial',
          assignment: { status: 'unassigned' },
        },
      ];
      assert.throws(
        () => validateProperties(props),
        /Duplicate property id/
      );
    });

    it('rejects multiple properties referencing the same building (strict 1:1 invariant)', () => {
      const seed = createDevelopmentSeedWorld(BASE_TIME);
      const props: Property[] = [
        {
          id: 'property:first',
          buildingId: 'building:development-residence',
          propertyType: 'residence',
          assignment: { status: 'unassigned' },
        },
        {
          id: 'property:second',
          buildingId: 'building:development-residence',
          propertyType: 'commercial',
          assignment: { status: 'unassigned' },
        },
      ];
      assert.throws(
        () => validatePropertyAuthority(props, seed.places),
        /multiple properties reference the same building/i
      );
    });

    it('rejects property referencing a non-building place (e.g., street or neighborhood)', () => {
      const seed = createDevelopmentSeedWorld(BASE_TIME);
      const props: Property[] = [
        {
          id: 'property:invalid-street-ref',
          buildingId: 'street:development-street',
          propertyType: 'commercial',
          assignment: { status: 'unassigned' },
        },
      ];
      assert.throws(
        () => validatePropertyAuthority(props, seed.places),
        /Property references place .* which is of kind "street", expected "building"/
      );
    });

    it('rejects property referencing a non-existent building', () => {
      const seed = createDevelopmentSeedWorld(BASE_TIME);
      const props: Property[] = [
        {
          id: 'property:ghost',
          buildingId: 'building:non-existent',
          propertyType: 'commercial',
          assignment: { status: 'unassigned' },
        },
      ];
      assert.throws(
        () => validatePropertyAuthority(props, seed.places),
        /Property references non-existent building/
      );
    });

    it('confirms places model contains ZERO property tenure fields (no reverse reference)', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);
      for (const place of state.places) {
        assert.equal((place as any).propertyId, undefined);
        assert.equal((place as any).assignment, undefined);
        assert.equal((place as any).owner, undefined);
        assert.equal((place as any).occupant, undefined);
      }
    });
  });

  // =========================================================================
  // 3. Pure Read Queries
  // =========================================================================
  describe('3. Pure Read Queries', () => {
    it('getProperty returns the property when present, or undefined when missing', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      const prop = getProperty(state, 'property:development-residence');
      assert.ok(prop);
      assert.equal(prop.id, 'property:development-residence');
      assert.equal(prop.buildingId, 'building:development-residence');

      const missing = getProperty(state, 'property:does-not-exist');
      assert.equal(missing, undefined);
    });

    it('getPropertyByBuildingId returns the property for a designated building, or undefined', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      const prop = getPropertyByBuildingId(state, 'building:development-building');
      assert.ok(prop);
      assert.equal(prop.id, 'property:development-building');
      assert.equal(prop.propertyType, 'commercial');

      const nonBuilding = getPropertyByBuildingId(state, 'street:development-street');
      assert.equal(nonBuilding, undefined);
    });

    it('isPropertyAssigned returns false for unassigned properties and true for assigned', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      assert.equal(isPropertyAssigned(state, 'property:development-residence'), false);
      assert.equal(isPropertyAssigned(state, 'property:non-existent'), false);

      // Assign the property
      const residence = state.properties.find((p) => p.id === 'property:development-residence')!;
      residence.assignment = {
        status: 'assigned',
        holder: { holderType: 'agent', holderId: 'agent:dev-npc' },
        assignedAt: BASE_TIME,
      };

      assert.equal(isPropertyAssigned(state, 'property:development-residence'), true);
    });

    it('guarantees zero state mutation during query execution', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);
      const snapshotBefore = JSON.stringify(state);

      getProperty(state, 'property:development-residence');
      getPropertyByBuildingId(state, 'building:development-building');
      isPropertyAssigned(state, 'property:development-residence');

      const snapshotAfter = JSON.stringify(state);
      assert.equal(snapshotBefore, snapshotAfter);
    });
  });

  // =========================================================================
  // 4. Designated Seed Properties Verification
  // =========================================================================
  describe('4. Designated Seed Properties Verification', () => {
    it('development seed world has exactly 3 designated unassigned properties', () => {
      const seed = createDevelopmentSeedWorld(BASE_TIME);
      assert.equal(seed.properties.length, 3);

      const expected = [
        { id: 'property:development-residence', buildingId: 'building:development-residence', type: 'residence' },
        { id: 'property:development-building', buildingId: 'building:development-building', type: 'commercial' },
        { id: 'property:avenida-juarez-kiosk', buildingId: 'building:avenida-juarez-kiosk', type: 'commercial' },
      ];

      for (const exp of expected) {
        const p = seed.properties.find((prop) => prop.id === exp.id);
        assert.ok(p, `Expected property ${exp.id} in seed`);
        assert.equal(p.buildingId, exp.buildingId);
        assert.equal(p.propertyType, exp.type);
        assert.equal(p.assignment.status, 'unassigned');
        assert.equal(p.assignment.holder, undefined);
        assert.equal(p.assignment.assignedAt, undefined);
      }
    });

    it('real-world Juarez seed world has exactly 2 designated unassigned properties', () => {
      const seed = createRealWorldJuarezSeedWorld(BASE_TIME);
      assert.equal(seed.properties.length, 2);

      const expected = [
        { id: 'property:real-world-residence', buildingId: 'building:real-world-residence', type: 'residence' },
        { id: 'property:kentucky-club-building', buildingId: 'building:kentucky-club-building', type: 'commercial' },
      ];

      for (const exp of expected) {
        const p = seed.properties.find((prop) => prop.id === exp.id);
        assert.ok(p, `Expected property ${exp.id} in real-world seed`);
        assert.equal(p.buildingId, exp.buildingId);
        assert.equal(p.propertyType, exp.type);
        assert.equal(p.assignment.status, 'unassigned');
        assert.equal(p.assignment.holder, undefined);
        assert.equal(p.assignment.assignedAt, undefined);
      }
    });
  });

  // =========================================================================
  // 5. Boundary Isolation Invariant
  // =========================================================================
  describe('5. Boundary Isolation Invariant', () => {
    it('assigning a property leaves spatial topology, agent locations, restaurant state, and balances completely unaffected', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      // Snapshot non-property collections
      const placesBefore = JSON.stringify(state.places);
      const agentsBefore = JSON.stringify(state.agents);
      const restaurantsBefore = JSON.stringify(state.restaurants);
      const offeringsBefore = JSON.stringify(state.offerings);
      const ordersBefore = JSON.stringify(state.orders);

      // Mutate assignment of residence
      const prop = state.properties.find((p) => p.id === 'property:development-residence')!;
      prop.assignment = {
        status: 'assigned',
        holder: { holderType: 'agent', holderId: 'agent:dev-npc' },
        assignedAt: BASE_TIME,
      };

      // Verify state still validates under v17
      assert.doesNotThrow(() => validateWorldState(state));

      // Verify other domains were completely untouched
      assert.equal(JSON.stringify(state.places), placesBefore, 'Places topology untouched');
      assert.equal(JSON.stringify(state.agents), agentsBefore, 'Agent locations/balances untouched');
      assert.equal(JSON.stringify(state.restaurants), restaurantsBefore, 'Restaurant operational state untouched');
      assert.equal(JSON.stringify(state.offerings), offeringsBefore, 'Commercial offerings untouched');
      assert.equal(JSON.stringify(state.orders), ordersBefore, 'Orders untouched');
    });

    it('spatial movement does NOT affect property assignment status', () => {
      const clock = WorldClock.create(BASE_TIME);
      const state = createInitialWorldState(clock);

      const propBefore = JSON.stringify(state.properties);

      // Move player into development residence
      const player = state.agents.find((a) => a.id === 'agent:dev-player')!;
      player.locationId = 'building:development-residence';

      assert.doesNotThrow(() => validateWorldState(state));
      assert.equal(JSON.stringify(state.properties), propBefore, 'Properties untouched by agent movement');
    });
  });

  // =========================================================================
  // 6. Persistence Roundtrip & Historical Compatibility
  // =========================================================================
  describe('6. Persistence Roundtrip & Historical Compatibility', () => {
    it('persists and restores world with assigned and unassigned properties cleanly', () => {
      const testFile = join(tmpdir(), `test-prop-persist-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      try {
        const clock = WorldClock.create(BASE_TIME);
        const state = createInitialWorldState(clock);

        // Assign one property
        const residence = state.properties.find((p) => p.id === 'property:development-residence')!;
        residence.assignment = {
          status: 'assigned',
          holder: { holderType: 'agent', holderId: 'agent:dev-npc' },
          assignedAt: BASE_TIME,
        };

        const persistence = new LocalFilePersistence(testFile);
        persistence.save(snapshotWorldState(clock, state));
        assert.ok(existsSync(testFile));

        // Reconstruct from disk in fresh session
        const restored = persistence.load();
        assert.ok(restored);
        assert.equal(restored.version, 18);
        assert.equal(restored.properties.length, 3);
        assert.doesNotThrow(() => validateWorldState(restored));

        const restoredResidence = restored.properties.find((p) => p.id === 'property:development-residence')!;
        assert.equal(restoredResidence.assignment.status, 'assigned');
        assert.deepEqual(restoredResidence.assignment.holder, { holderType: 'agent', holderId: 'agent:dev-npc' });
        assert.equal(restoredResidence.assignment.assignedAt, BASE_TIME);

        const restoredBuilding = restored.properties.find((p) => p.id === 'property:development-building')!;
        assert.equal(restoredBuilding.assignment.status, 'unassigned');
        assert.equal(restoredBuilding.assignment.holder, undefined);
      } finally {
        if (existsSync(testFile)) {
          unlinkSync(testFile);
        }
      }
    });
  });
});
