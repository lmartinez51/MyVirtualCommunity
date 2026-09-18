import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const srcClientDir = resolve(rootDir, 'src', 'client');
const distClientDir = resolve(rootDir, 'dist', 'client');

if (!existsSync(distClientDir)) {
  mkdirSync(distClientDir, { recursive: true });
}

const assets = ['index.html', 'style.css'];
for (const asset of assets) {
  const srcPath = resolve(srcClientDir, asset);
  const destPath = resolve(distClientDir, asset);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
    console.log(`[build] Copied ${asset} -> dist/client/${asset}`);
  }
}
