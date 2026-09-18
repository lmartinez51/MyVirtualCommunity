import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const files = readdirSync('tests', { recursive: true })
  .filter((f) => typeof f === 'string' && f.endsWith('.test.ts'))
  .map((f) => join('tests', f));

if (files.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
