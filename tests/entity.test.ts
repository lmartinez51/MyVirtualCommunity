import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntityId } from '../src/core/entities/entity.js';

describe('Entity Identity', () => {
  test('accepts valid non-empty string IDs', () => {
    assert.doesNotThrow(() => validateEntityId('city:ciudad-juarez'));
    assert.doesNotThrow(() => validateEntityId('agent:player-1'));
    assert.doesNotThrow(() => validateEntityId('custom-id-123'));
  });

  test('rejects empty or whitespace-only IDs', () => {
    assert.throws(() => validateEntityId(''), /must be a non-empty string/);
    assert.throws(() => validateEntityId('   '), /must be a non-empty string/);
  });

  test('rejects non-string IDs', () => {
    assert.throws(() => validateEntityId(null), /must be a non-empty string/);
    assert.throws(() => validateEntityId(undefined), /must be a non-empty string/);
    assert.throws(() => validateEntityId(123), /must be a non-empty string/);
    assert.throws(() => validateEntityId({}), /must be a non-empty string/);
  });
});
