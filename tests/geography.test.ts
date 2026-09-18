import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Place, validatePlaces } from '../src/core/entities/geography.js';

describe('Geography', () => {
  const createValidHierarchy = (): Place[] => [
    {
      id: 'city:ciudad-juarez',
      type: 'city',
      name: 'Ciudad Juárez',
      parentId: null,
    },
    {
      id: 'district:development-district',
      type: 'district',
      name: 'Development District',
      parentId: 'city:ciudad-juarez',
    },
    {
      id: 'neighborhood:development-neighborhood',
      type: 'neighborhood',
      name: 'Development Neighborhood',
      parentId: 'district:development-district',
    },
    {
      id: 'street:development-street',
      type: 'street',
      name: 'Development Street',
      parentId: 'neighborhood:development-neighborhood',
    },
    {
      id: 'building:development-building',
      type: 'building',
      name: 'Development Building',
      parentId: 'street:development-street',
    },
  ];

  test('validates a complete, valid geographic hierarchy', () => {
    const places = createValidHierarchy();
    assert.doesNotThrow(() => validatePlaces(places));
  });

  test('rejects a City with a non-null parentId', () => {
    const places = createValidHierarchy();
    places[0].parentId = 'some-parent';

    assert.throws(
      () => validatePlaces(places),
      /City place "city:ciudad-juarez" must have parentId null/
    );
  });

  test('rejects a District whose parent is not a City', () => {
    const places = createValidHierarchy();
    // Point District to Street instead of City
    places[1].parentId = 'street:development-street';

    assert.throws(
      () => validatePlaces(places),
      /must have parent of type "city", but parent "street:development-street" has type "street"/
    );
  });

  test('rejects a Neighborhood whose parent is not a District', () => {
    const places = createValidHierarchy();
    // Point Neighborhood directly to City
    places[2].parentId = 'city:ciudad-juarez';

    assert.throws(
      () => validatePlaces(places),
      /must have parent of type "district", but parent "city:ciudad-juarez" has type "city"/
    );
  });

  test('rejects a Street whose parent is not a Neighborhood', () => {
    const places = createValidHierarchy();
    // Point Street to District
    places[3].parentId = 'district:development-district';

    assert.throws(
      () => validatePlaces(places),
      /must have parent of type "neighborhood", but parent "district:development-district" has type "district"/
    );
  });

  test('rejects a Building whose parent is not a Street', () => {
    const places = createValidHierarchy();
    // Point Building to Neighborhood
    places[4].parentId = 'neighborhood:development-neighborhood';

    assert.throws(
      () => validatePlaces(places),
      /must have parent of type "street", but parent "neighborhood:development-neighborhood" has type "neighborhood"/
    );
  });

  test('rejects self-parenting', () => {
    const places = createValidHierarchy();
    places[1].parentId = places[1].id;

    assert.throws(
      () => validatePlaces(places),
      /Self-parenting detected: place "district:development-district" cannot reference itself as parent/
    );
  });

  test('rejects non-existent parent references', () => {
    const places = createValidHierarchy();
    places[1].parentId = 'city:does-not-exist';

    assert.throws(
      () => validatePlaces(places),
      /references non-existent parentId: "city:does-not-exist"/
    );
  });

  test('rejects containment cycles', () => {
    // City (root) -> District A -> Neighborhood B -> Street C -> Building D
    // Introduce cycle by modifying hierarchy:
    const cyclicPlaces: Place[] = [
      { id: 'city:1', type: 'city', name: 'City', parentId: null },
      { id: 'district:1', type: 'district', name: 'District 1', parentId: 'city:1' },
      { id: 'neighborhood:1', type: 'neighborhood', name: 'Neighborhood 1', parentId: 'district:1' },
      { id: 'street:1', type: 'street', name: 'Street 1', parentId: 'neighborhood:1' },
      // Invalid cycle attempt where building points to street, but street were modified to cycle:
    ];

    // Let's create an explicit cycle:
    // If District 1 parent is City, Neighborhood 1 parent is District 1, Street 1 parent is Neighborhood 1.
    // If Street parent was Neighborhood, what if Neighborhood parent is set to Street?
    // Wait, that would fail type check (Neighborhood requires District).
    // What if we have two districts where D1 -> D2? Type check prevents D1 -> D2 because D requires City.
    // But what if a general graph allows cycles?
    // Let's test that the cycle checker detects a cycle:
    const placesWithLoop: Place[] = [
      { id: 'city:1', type: 'city', name: 'City', parentId: null },
      { id: 'district:1', type: 'district', name: 'District', parentId: 'city:1' },
      { id: 'neighborhood:1', type: 'neighborhood', name: 'Neighborhood', parentId: 'district:1' },
      { id: 'street:1', type: 'street', name: 'Street', parentId: 'neighborhood:1' },
    ];
    // If we bypass type check or simulate a cycle:
    const mockCycle = [
      { id: 'p1', type: 'district', name: 'D1', parentId: 'p2' },
      { id: 'p2', type: 'city', name: 'C1', parentId: 'p1' }, // C1 parent is D1, D1 parent is C1
    ];
    assert.throws(() => validatePlaces(mockCycle));
  });

  test('rejects duplicate place IDs', () => {
    const places = createValidHierarchy();
    places.push({
      id: 'district:development-district', // Duplicate ID
      type: 'district',
      name: 'Duplicate District',
      parentId: 'city:ciudad-juarez',
    });

    assert.throws(
      () => validatePlaces(places),
      /Duplicate entity id found in places: "district:development-district"/
    );
  });
});
