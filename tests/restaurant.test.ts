import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Restaurant,
  validateRestaurants,
  evaluateDevelopmentRestaurantOperationalRule,
} from '../src/core/entities/restaurant.js';

describe('Restaurant', () => {
  const validBuildingIds = new Set<string>(['building:development-building']);

  test('validates a restaurant referencing an existing building with valid operational fields and balance', () => {
    const restaurants: Restaurant[] = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: '2026-09-14T08:00:00.000Z',
        balanceMinor: 0,
        currency: 'USD',
      },
    ];

    assert.doesNotThrow(() => validateRestaurants(restaurants, validBuildingIds));
  });

  test('validates a restaurant with operationalState open', () => {
    const restaurants: Restaurant[] = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'open',
        operationalSince: '2026-09-14T09:00:00.000Z',
        balanceMinor: 500,
        currency: 'USD',
      },
    ];

    assert.doesNotThrow(() => validateRestaurants(restaurants, validBuildingIds));
  });

  test('validates a restaurant with operationalState closing-soon', () => {
    const restaurants: Restaurant[] = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'closing-soon',
        operationalSince: '2026-09-14T16:45:00.000Z',
        balanceMinor: 500,
        currency: 'USD',
      },
    ];

    assert.doesNotThrow(() => validateRestaurants(restaurants, validBuildingIds));
  });

  test('rejects restaurant referencing a non-existent building', () => {
    const restaurants: Restaurant[] = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:unknown-building',
        operationalState: 'closed',
        operationalSince: '2026-09-14T08:00:00.000Z',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Restaurant "restaurant:development-restaurant" references non-existent buildingId: "building:unknown-building"/
    );
  });

  test('rejects restaurant with empty or whitespace name', () => {
    const restaurants: Restaurant[] = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: '   ',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: '2026-09-14T08:00:00.000Z',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Invalid restaurant name: must be a non-empty string/
    );
  });

  test('rejects restaurant with invalid operationalState', () => {
    const restaurants = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'busy',
        operationalSince: '2026-09-14T08:00:00.000Z',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Invalid operationalState: "busy" for restaurant "restaurant:development-restaurant"\. Expected 'open', 'closing-soon', or 'closed'\./
    );
  });

  test('rejects restaurant with missing or empty operationalSince', () => {
    const restaurants = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: '   ',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Invalid operationalSince: must be a non-empty string for restaurant "restaurant:development-restaurant"/
    );
  });

  test('rejects restaurant with invalid operationalSince timestamp', () => {
    const restaurants = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: 'not-a-valid-timestamp',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Invalid operationalSince timestamp: "not-a-valid-timestamp"/
    );
  });

  test('rejects duplicate restaurant IDs', () => {
    const restaurants: Restaurant[] = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Restaurant A',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: '2026-09-14T08:00:00.000Z',
        balanceMinor: 0,
        currency: 'USD',
      },
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Restaurant B',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: '2026-09-14T08:00:00.000Z',
        balanceMinor: 0,
        currency: 'USD',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Duplicate entity id found in restaurants: "restaurant:development-restaurant"/
    );
  });

  test('rejects restaurant with negative balanceMinor', () => {
    const restaurants = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: '2026-09-14T08:00:00.000Z',
        balanceMinor: -500,
        currency: 'USD',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Invalid balanceMinor: must be a non-negative integer/
    );
  });

  test('rejects restaurant with non-integer balanceMinor', () => {
    const restaurants = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: '2026-09-14T08:00:00.000Z',
        balanceMinor: 100.5,
        currency: 'USD',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Invalid balanceMinor: must be a non-negative integer/
    );
  });

  test('rejects restaurant with non-number balanceMinor', () => {
    const restaurants = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: '2026-09-14T08:00:00.000Z',
        balanceMinor: '0' as unknown as number,
        currency: 'USD',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Invalid balanceMinor: must be a non-negative integer/
    );
  });

  test('rejects restaurant with empty or missing currency', () => {
    const restaurants = [
      {
        id: 'restaurant:development-restaurant',
        type: 'restaurant',
        name: 'Development Restaurant',
        buildingId: 'building:development-building',
        operationalState: 'closed',
        operationalSince: '2026-09-14T08:00:00.000Z',
        balanceMinor: 0,
        currency: '   ',
      },
    ];

    assert.throws(
      () => validateRestaurants(restaurants, validBuildingIds),
      /Invalid currency: must be a non-empty string/
    );
  });

  test('evaluates exact [09:00, 16:45, 17:00) UTC interval boundaries for development restaurant operational rule', () => {
    // 08:59 UTC -> closed
    assert.equal(evaluateDevelopmentRestaurantOperationalRule('2026-09-14T08:59:00.000Z', 'UTC'), 'closed');
    assert.equal(evaluateDevelopmentRestaurantOperationalRule('2026-09-14T08:59:59.999Z', 'UTC'), 'closed');

    // 09:00 UTC -> open
    assert.equal(evaluateDevelopmentRestaurantOperationalRule('2026-09-14T09:00:00.000Z', 'UTC'), 'open');

    // 10:00 UTC -> open
    assert.equal(evaluateDevelopmentRestaurantOperationalRule('2026-09-14T10:00:00.000Z', 'UTC'), 'open');

    // 16:44:59.999 UTC -> open
    assert.equal(evaluateDevelopmentRestaurantOperationalRule('2026-09-14T16:44:59.999Z', 'UTC'), 'open');

    // 16:45:00 UTC -> closing-soon
    assert.equal(evaluateDevelopmentRestaurantOperationalRule('2026-09-14T16:45:00.000Z', 'UTC'), 'closing-soon');

    // 16:59 UTC -> closing-soon
    assert.equal(evaluateDevelopmentRestaurantOperationalRule('2026-09-14T16:59:59.999Z', 'UTC'), 'closing-soon');

    // 17:00 UTC -> closed
    assert.equal(evaluateDevelopmentRestaurantOperationalRule('2026-09-14T17:00:00.000Z', 'UTC'), 'closed');
    assert.equal(evaluateDevelopmentRestaurantOperationalRule('2026-09-14T17:00:00.001Z', 'UTC'), 'closed');
  });
});
