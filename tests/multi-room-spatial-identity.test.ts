import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';
import {
  createGomezMorinWorldState,
  WorldState,
  areAgentsCoLocated,
  getCoLocatedAgents,
} from '../src/core/world-state.js';
import {
  createGomezMorinSpatialTopology,
  findInteriorSpaceById,
  validateInteriorTopology,
  InteriorSpace,
  BuildingEntrance,
} from '../src/core/real-world-street-topology.js';
import { Agent } from '../src/core/entities/agent.js';
import { Place } from '../src/core/entities/geography.js';

describe('Milestone 84 — Open Issue #82-A: Multi-Room / Non-Rectangular Interior Spatial Identity', () => {
  const clock = WorldClock.create('2026-09-14T16:00:00.000Z');

  // =========================================================================
  // Group 1: Single-Room Equivalence (Cases A & C under Schema 18)
  // =========================================================================
  describe('Group 1: Baseline Single-Room Equivalence (Cases A & C)', () => {
    it('Case A: single-room commercial venue aligns locationId with physical room 1:1', () => {
      const state = createGomezMorinWorldState(clock);
      const topology = createGomezMorinSpatialTopology();

      const wingSpotInterior = findInteriorSpaceById(topology, 'interior:wing-spot')!;
      assert.ok(wingSpotInterior);
      assert.equal(wingSpotInterior.associatedPlaceId, 'restaurant:wing-spot');

      // In single-room venue, Agent.locationId matches associatedPlaceId
      const customerA: Agent = {
        id: 'agent:player-test-a',
        type: 'agent',
        name: 'Customer A',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot',
        balanceMinor: 10000,
        currency: 'MXN',
      };
      const customerB: Agent = {
        id: 'agent:player-test-b',
        type: 'agent',
        name: 'Customer B',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot',
        balanceMinor: 10000,
        currency: 'MXN',
      };

      state.agents.push(customerA, customerB);

      // Both are in the single room, so co-presence is valid
      assert.equal(areAgentsCoLocated(state, customerA.id, customerB.id), true);
      const coLocated = getCoLocatedAgents(state, customerA.id);
      assert.ok(coLocated.some((a) => a.id === customerB.id));
    });

    it('Case C: multi-venue building with distinct Places differentiates spaces cleanly', () => {
      const state = createGomezMorinWorldState(clock);

      // Suppose a building contains two independent places: a clinic and a law office
      const clinicPlace: Place = {
        id: 'place:arboleda-clinic',
        type: 'building',
        name: 'Clínica Dental Arboleda',
        parentId: 'street:blvd-gomez-morin',
      };
      const lawPlace: Place = {
        id: 'place:arboleda-law-firm',
        type: 'building',
        name: 'Despacho Jurídico Arboleda',
        parentId: 'street:blvd-gomez-morin',
      };
      state.places.push(clinicPlace, lawPlace);

      const patient: Agent = {
        id: 'agent:patient',
        type: 'agent',
        name: 'Patient',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'place:arboleda-clinic',
        balanceMinor: 5000,
        currency: 'MXN',
      };
      const lawyer: Agent = {
        id: 'agent:lawyer',
        type: 'agent',
        name: 'Lawyer',
        agentType: 'npc',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'place:arboleda-law-firm',
        balanceMinor: 50000,
        currency: 'MXN',
      };
      state.agents.push(patient, lawyer);

      // Distinct associated places produce zero false co-presence
      assert.equal(areAgentsCoLocated(state, patient.id, lawyer.id), false);
      const patientCoLocated = getCoLocatedAgents(state, patient.id);
      assert.equal(patientCoLocated.some((a) => a.id === lawyer.id), false);
    });
  });

  // =========================================================================
  // Group 2: The Multi-Room Ambiguity Problem (Cases B & D under Schema 18)
  // =========================================================================
  describe('Group 2: Multi-Room Ambiguity under Current Model (Cases B & D)', () => {
    it('Case B: demonstrates false co-presence when multiple rooms share one associatedPlaceId', () => {
      const state = createGomezMorinWorldState(clock);

      // A single restaurant venue with two distinct rooms (Main Dining vs Private VIP room)
      // Both map to associatedPlaceId = 'restaurant:wing-spot' under current model
      const agentInMainDining: Agent = {
        id: 'agent:main-dining-guest',
        type: 'agent',
        name: 'Main Dining Guest',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot', // InteriorSpace: interior:wing-spot-main
        balanceMinor: 20000,
        currency: 'MXN',
      };
      const agentInVipRoom: Agent = {
        id: 'agent:vip-guest',
        type: 'agent',
        name: 'VIP Private Room Guest',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot', // InteriorSpace: interior:wing-spot-vip
        balanceMinor: 50000,
        currency: 'MXN',
      };
      state.agents.push(agentInMainDining, agentInVipRoom);

      // FAILURE MODE 1: Under current model, areAgentsCoLocated returns TRUE across isolated rooms!
      const coLocated = areAgentsCoLocated(state, agentInMainDining.id, agentInVipRoom.id);
      assert.equal(
        coLocated,
        true,
        'Current model conflates distinct rooms into one topological location'
      );

      // FAILURE MODE 2: Perception/inspection projects VIP guest into main dining guest context
      const visible = getCoLocatedAgents(state, agentInMainDining.id);
      assert.ok(
        visible.some((a) => a.id === agentInVipRoom.id),
        'Current model allows seeing/interacting across closed walls/doors'
      );
    });

    it('Case D: demonstrates access control & staff isolation failure in kitchen vs dining', () => {
      const state = createGomezMorinWorldState(clock);

      // Line cook in kitchen and customer in dining room
      const customer: Agent = {
        id: 'agent:customer-dining',
        type: 'agent',
        name: 'Dining Customer',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot',
        balanceMinor: 15000,
        currency: 'MXN',
      };
      const lineCook: Agent = {
        id: 'agent:line-cook-kitchen',
        type: 'agent',
        name: 'Line Cook',
        agentType: 'npc',
        activityState: 'active',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot',
        balanceMinor: 8000,
        currency: 'MXN',
      };
      state.agents.push(customer, lineCook);

      // In current model, customer is co-located with cook at the hot fry station
      assert.equal(
        areAgentsCoLocated(state, customer.id, lineCook.id),
        true,
        'Current model treats customer as co-present with kitchen staff'
      );
    });
  });

  // =========================================================================
  // Group 3: Candidate Model Evaluation — Option 1: Place-Per-Spatial-Context
  // =========================================================================
  describe('Group 3: Candidate Model Evaluation — Option 1: Place-Per-Spatial-Context', () => {
    it('Option 1 solves co-presence but breaks direct restaurant entity lookups', () => {
      const state = createGomezMorinWorldState(clock);

      // In Option 1, each room is a distinct Place
      const diningPlace: Place = {
        id: 'place:wing-spot-dining',
        type: 'building',
        name: 'Wing Spot — Comedor',
        parentId: 'street:blvd-gomez-morin',
      };
      const kitchenPlace: Place = {
        id: 'place:wing-spot-kitchen',
        type: 'building',
        name: 'Wing Spot — Cocina',
        parentId: 'street:blvd-gomez-morin',
      };
      state.places.push(diningPlace, kitchenPlace);

      const customer: Agent = {
        id: 'agent:customer-opt1',
        type: 'agent',
        name: 'Customer Opt1',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'place:wing-spot-dining',
        balanceMinor: 20000,
        currency: 'MXN',
      };
      state.agents.push(customer);

      // Co-presence works cleanly between dining and kitchen
      assert.equal(customer.locationId, 'place:wing-spot-dining');

      // CRITICAL BREAKAGE: Commercial logic checks state.restaurants.find(r => r.id === agent.locationId)
      const directRestaurant = state.restaurants.find((r) => r.id === customer.locationId);
      assert.equal(
        directRestaurant,
        undefined,
        'Direct restaurant lookup fails because locationId points to a room Place, not the Restaurant entity'
      );

      // Commercial orders, offerings, and operational state belong to the business (restaurant:wing-spot),
      // not to individual architectural rooms. Option 1 breaks 1:1 business identity.
    });
  });

  // =========================================================================
  // Group 4: Candidate Model Evaluation — Option 2: Hierarchical Spatial Identity
  // =========================================================================
  describe('Group 4: Candidate Model Evaluation — Option 2: Hierarchical Spatial Identity', () => {
    it('Option 2 preserves business identity while cleanly partitioning room co-presence', () => {
      const state = createGomezMorinWorldState(clock);

      // Under Hierarchical Spatial Identity:
      // Agent.locationId = 'restaurant:wing-spot' (authoritative business & legal place)
      // Agent.interiorSpaceId = 'interior:wing-spot-dining' | 'interior:wing-spot-kitchen' | 'interior:wing-spot-vip'

      interface AgentWithSublocation extends Agent {
        interiorSpaceId?: string | null;
      }

      const diningGuest: AgentWithSublocation = {
        id: 'agent:h-dining-guest',
        type: 'agent',
        name: 'Dining Guest',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:wing-spot-dining',
        balanceMinor: 15000,
        currency: 'MXN',
      };

      const vipGuest: AgentWithSublocation = {
        id: 'agent:h-vip-guest',
        type: 'agent',
        name: 'VIP Guest',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:wing-spot-vip',
        balanceMinor: 35000,
        currency: 'MXN',
      };

      const diningCompanion: AgentWithSublocation = {
        id: 'agent:h-dining-companion',
        type: 'agent',
        name: 'Dining Companion',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:wing-spot-dining',
        balanceMinor: 12000,
        currency: 'MXN',
      };

      const lineCook: AgentWithSublocation = {
        id: 'agent:h-line-cook',
        type: 'agent',
        name: 'Line Cook',
        agentType: 'npc',
        activityState: 'active',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'restaurant:wing-spot',
        interiorSpaceId: 'interior:wing-spot-kitchen',
        balanceMinor: 8000,
        currency: 'MXN',
      };

      state.agents.push(diningGuest, vipGuest, diningCompanion, lineCook);

      // Hierarchical co-presence evaluator:
      function areAgentsCoLocatedHierarchical(
        a: AgentWithSublocation,
        b: AgentWithSublocation
      ): boolean {
        if (a.locationId !== b.locationId) return false;
        const subA = a.interiorSpaceId ?? null;
        const subB = b.interiorSpaceId ?? null;
        return subA === subB;
      }

      // Verification 1: Business lookup succeeds for all agents
      for (const ag of [diningGuest, vipGuest, diningCompanion, lineCook]) {
        const restaurant = state.restaurants.find((r) => r.id === ag.locationId);
        assert.ok(restaurant, 'Every agent cleanly resolves the restaurant business');
        assert.equal(restaurant.id, 'restaurant:wing-spot');
      }

      // Verification 2: Guests in different rooms are NOT co-located
      assert.equal(
        areAgentsCoLocatedHierarchical(diningGuest, vipGuest),
        false,
        'Dining guest and VIP guest must NOT be co-located'
      );

      // Verification 3: Customer and kitchen staff are NOT co-located
      assert.equal(
        areAgentsCoLocatedHierarchical(diningGuest, lineCook),
        false,
        'Dining guest and kitchen staff must NOT be co-located'
      );

      // Verification 4: Guests in the SAME room ARE co-located
      assert.equal(
        areAgentsCoLocatedHierarchical(diningGuest, diningCompanion),
        true,
        'Guests sharing the dining room ARE co-located'
      );

      // Verification 5: Outdoors agents have interiorSpaceId === null, matching by locationId
      const outdoorA: AgentWithSublocation = {
        id: 'agent:outdoor-a',
        type: 'agent',
        name: 'Pedestrian A',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'street:blvd-gomez-morin',
        interiorSpaceId: null,
        balanceMinor: 1000,
        currency: 'MXN',
      };
      const outdoorB: AgentWithSublocation = {
        id: 'agent:outdoor-b',
        type: 'agent',
        name: 'Pedestrian B',
        agentType: 'player',
        activityState: 'idle',
        activitySince: '2026-09-14T16:00:00.000Z',
        locationId: 'street:blvd-gomez-morin',
        interiorSpaceId: null,
        balanceMinor: 2000,
        currency: 'MXN',
      };
      assert.equal(areAgentsCoLocatedHierarchical(outdoorA, outdoorB), true);
    });
  });

  // =========================================================================
  // Group 5: Invariant Verification for Canonical Single-Room Venues
  // =========================================================================
  describe('Group 5: Canonical Topologies Invariant Verification', () => {
    it('validates that current canonical Wing Spot and Tía Lupe topologies pass all topology invariants', () => {
      const topology = createGomezMorinSpatialTopology();
      const validation = validateInteriorTopology(topology);

      assert.equal(validation.valid, true);
      assert.equal(validation.errors.length, 0);

      // Confirms canonical interiors exist (M87: Wing Spot now multi-room dining + kitchen)
      assert.equal(topology.interiors.length, 3);
      const wingSpot = topology.interiors.find((i) => i.interiorId === 'interior:wing-spot')!;
      const tiaLupe = topology.interiors.find((i) => i.interiorId === 'interior:tia-lupe')!;

      assert.ok(wingSpot);
      assert.ok(tiaLupe);

      // For single-room interiors, interiorSpaceId is 1:1 with associatedPlaceId
      assert.equal(wingSpot.associatedPlaceId, 'restaurant:wing-spot');
      assert.equal(tiaLupe.associatedPlaceId, 'restaurant:pasteleria-tia-lupe');
    });
  });
});
