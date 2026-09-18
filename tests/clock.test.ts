import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorldClock } from '../src/core/clock.js';

describe('WorldClock', () => {
  test('initializes with current timestamp by default', () => {
    const before = Date.now();
    const clock = WorldClock.create();
    const after = Date.now();

    const clockEpoch = clock.getEpochMs();
    assert.ok(clockEpoch >= before && clockEpoch <= after);
    assert.match(clock.getTime(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('initializes with a specific ISO-8601 timestamp string', () => {
    const fixedTime = '2026-09-14T08:00:00.000Z';
    const clock = WorldClock.create(fixedTime);

    assert.equal(clock.getTime(), fixedTime);
    assert.equal(clock.getEpochMs(), Date.parse(fixedTime));
  });

  test('initializes with a Date object', () => {
    const date = new Date('2026-09-14T12:30:00.000Z');
    const clock = WorldClock.create(date);

    assert.equal(clock.getTime(), date.toISOString());
  });

  test('throws an error if initialized with an invalid timestamp string', () => {
    assert.throws(
      () => new WorldClock('not-a-valid-date'),
      /Invalid initial ISO-8601 timestamp/
    );
  });

  test('advances World Time by exact duration in milliseconds', () => {
    const startIso = '2026-09-14T08:00:00.000Z';
    const clock = WorldClock.create(startIso);

    const advancedIso = clock.advance(5000); // +5 seconds
    assert.equal(advancedIso, '2026-09-14T08:00:05.000Z');
    assert.equal(clock.getTime(), '2026-09-14T08:00:05.000Z');

    clock.advance(1500); // +1.5 seconds
    assert.equal(clock.getTime(), '2026-09-14T08:00:06.500Z');
  });

  test('rejects negative or non-finite advance duration (cannot move backward)', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');

    assert.throws(
      () => clock.advance(-1000),
      (err) => err instanceof RangeError && err.message.includes('finite, non-negative')
    );

    assert.throws(
      () => clock.advance(Number.NaN),
      (err) => err instanceof RangeError && err.message.includes('finite, non-negative')
    );

    // Time remains unchanged after failed attempts
    assert.equal(clock.getTime(), '2026-09-14T08:00:00.000Z');
  });

  test('restores World Time from valid ISO-8601 timestamp', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');
    const newTarget = '2026-10-01T15:45:00.000Z';

    clock.restore(newTarget);
    assert.equal(clock.getTime(), newTarget);
  });

  test('rejects restore with invalid timestamp string', () => {
    const clock = WorldClock.create('2026-09-14T08:00:00.000Z');

    assert.throws(
      () => clock.restore(''),
      /Invalid ISO-8601 timestamp string/
    );

    assert.throws(
      () => clock.restore('invalid-iso'),
      /Failed to parse ISO-8601 timestamp/
    );

    // Verify time was not altered
    assert.equal(clock.getTime(), '2026-09-14T08:00:00.000Z');
  });
});
