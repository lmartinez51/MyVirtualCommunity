/**
 * Zero-dependency .env loader, ported from the Hackathon Edition
 * (src/config/index.ts loadEnvFile).
 *
 * Reads KEY=VALUE lines from a .env file (default: ./.env), strips
 * surrounding quotes, skips blanks and #-comments, and never overwrites
 * a variable that already exists in the environment. Missing file or
 * read errors are silently ignored. Values are NEVER logged.
 *
 * Called at the very top of src/index.ts so both `npm run dev` (tsx)
 * and `npm start` (node dist/index.js) pick up .env — the repo has no
 * dotenv dependency and nothing else loads .env.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvFile(envPath: string = resolve(process.cwd(), '.env')): void {
  if (!existsSync(envPath)) {
    return;
  }

  try {
    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) {
        continue;
      }
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();

      // Strip surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Gracefully ignore reading errors (e.g. permission issues)
  }
}
