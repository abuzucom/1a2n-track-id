import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build the real overlay bundle so static-serving tests exercise the actual artifact.
export default function setup(): void {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  execFileSync(process.execPath, [join(rootDir, 'scripts', 'build-overlay.mjs')], { stdio: 'inherit' });
}
