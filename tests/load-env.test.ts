/**
 * Unit tests for the zero-dependency .env loader (src/config/load-env.ts).
 *
 * The loader reads a .env file into process.env so `npm start` (plain
 * node) behaves like `npm run dev` on the operator's machine, where the
 * real .env (with MODEL_API_KEY) lives. Tests use a temp .env with FAKE
 * values only — no real secret is ever written or logged here.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import { loadEnvFile } from '../src/config/load-env.js';
import { loadMetaModelConfig } from '../src/ports/meta-model-port.js';

describe('loadEnvFile (.env loader)', () => {
  it('parses KEY=VALUE lines, strips quotes, ignores comments and blanks', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-load-env-'));
    const envPath = join(tempDir, '.env');
    writeFileSync(
      envPath,
      [
        '# comentario',
        '',
        'LOAD_ENV_TEST_A=hello',
        'LOAD_ENV_TEST_B="quoted value"',
        "LOAD_ENV_TEST_C='single quoted'",
        'LOAD_ENV_TEST_D=a=b=c',
        '   # comentario con espacios',
        '',
      ].join('\n'),
      'utf-8'
    );
    const saved = {
      A: process.env.LOAD_ENV_TEST_A,
      B: process.env.LOAD_ENV_TEST_B,
      C: process.env.LOAD_ENV_TEST_C,
      D: process.env.LOAD_ENV_TEST_D,
    };
    try {
      delete process.env.LOAD_ENV_TEST_A;
      delete process.env.LOAD_ENV_TEST_B;
      delete process.env.LOAD_ENV_TEST_C;
      delete process.env.LOAD_ENV_TEST_D;
      loadEnvFile(envPath);
      assert.equal(process.env.LOAD_ENV_TEST_A, 'hello');
      assert.equal(process.env.LOAD_ENV_TEST_B, 'quoted value');
      assert.equal(process.env.LOAD_ENV_TEST_C, 'single quoted');
      assert.equal(process.env.LOAD_ENV_TEST_D, 'a=b=c');
    } finally {
      for (const [suffix, value] of Object.entries(saved)) {
        const key = `LOAD_ENV_TEST_${suffix}`;
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('never overwrites a variable that already exists', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-load-env-keep-'));
    const envPath = join(tempDir, '.env');
    writeFileSync(envPath, 'LOAD_ENV_TEST_KEEP=from-file\n', 'utf-8');
    const saved = process.env.LOAD_ENV_TEST_KEEP;
    try {
      process.env.LOAD_ENV_TEST_KEEP = 'from-env';
      loadEnvFile(envPath);
      assert.equal(process.env.LOAD_ENV_TEST_KEEP, 'from-env');
    } finally {
      if (saved === undefined) delete process.env.LOAD_ENV_TEST_KEEP;
      else process.env.LOAD_ENV_TEST_KEEP = saved;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('missing file is a no-op and never throws', () => {
    assert.doesNotThrow(() => loadEnvFile(join(tmpdir(), 'm94-does-not-exist-.env')));
  });

  it('a temp .env with a FAKE key makes loadMetaModelConfig return it (never logged)', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'm94-load-env-key-'));
    const envPath = join(tempDir, '.env');
    writeFileSync(
      envPath,
      'MODEL_API_KEY=test-fake-key-123\nMODEL_NAME=muse-spark-1.3\n',
      'utf-8'
    );
    const savedKey = process.env.MODEL_API_KEY;
    const savedMetaKey = process.env.META_API_KEY;
    const savedModel = process.env.MODEL_NAME;
    const savedMetaModel = process.env.META_MODEL;
    try {
      delete process.env.MODEL_API_KEY;
      delete process.env.META_API_KEY;
      delete process.env.MODEL_NAME;
      delete process.env.META_MODEL;
      loadEnvFile(envPath);
      const config = loadMetaModelConfig();
      assert.equal(config.apiKey, 'test-fake-key-123');
      assert.equal(config.model, 'muse-spark-1.3');
    } finally {
      // Restore exactly: a leaked MODEL_API_KEY would flip Camila's
      // provider from mock to live in later tests.
      if (savedKey === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = savedKey;
      if (savedMetaKey === undefined) delete process.env.META_API_KEY;
      else process.env.META_API_KEY = savedMetaKey;
      if (savedModel === undefined) delete process.env.MODEL_NAME;
      else process.env.MODEL_NAME = savedModel;
      if (savedMetaModel === undefined) delete process.env.META_MODEL;
      else process.env.META_MODEL = savedMetaModel;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
