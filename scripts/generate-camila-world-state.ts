/**
 * Milestone 94: regenerates Camila's world-state JSON.
 *
 * Run:  npx tsx scripts/generate-camila-world-state.ts [--out <path>]
 * Default output: data/camila-world-state.json (gitignored runtime data,
 * like data/world-state.json — regenerate whenever the repo changes).
 *
 * The JSON is in the UNITY scene frame; see src/core/camila-world-state.ts
 * for the coordinate-frame note.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildCamilaWorldState } from '../src/core/camila-world-state.js';

function parseOutArg(argv: string[]): string {
  const idx = argv.indexOf('--out');
  if (idx !== -1 && argv[idx + 1]) return resolve(argv[idx + 1]);
  return resolve(process.cwd(), 'data', 'camila-world-state.json');
}

const outPath = parseOutArg(process.argv.slice(2));
const worldState = buildCamilaWorldState();
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(worldState, null, 2) + '\n', 'utf-8');

console.log(
  `[Camila] World-state JSON written to ${outPath} ` +
    `(${worldState.places.length} places, ${worldState.roads.length} roads, ` +
    `${worldState.probeObjects.length} probe objects, frame: ${worldState.coordinateFrame.frame})`
);
