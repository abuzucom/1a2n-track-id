import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// Self-host the brand fonts so the overlay makes no external requests.
const FONT_SOURCES = {
  'libre-franklin-400.woff2': '@fontsource/libre-franklin/files/libre-franklin-latin-400-normal.woff2',
  'libre-franklin-500.woff2': '@fontsource/libre-franklin/files/libre-franklin-latin-500-normal.woff2',
  'libre-franklin-900.woff2': '@fontsource/libre-franklin/files/libre-franklin-latin-900-normal.woff2',
  'cousine-400.woff2': '@fontsource/cousine/files/cousine-latin-400-normal.woff2',
  'cousine-700.woff2': '@fontsource/cousine/files/cousine-latin-700-normal.woff2',
};
const fontsDir = join(rootDir, 'public', 'fonts');
mkdirSync(fontsDir, { recursive: true });
for (const [target, source] of Object.entries(FONT_SOURCES)) {
  try {
    copyFileSync(join(rootDir, 'node_modules', source), join(fontsDir, target));
  } catch (err) {
    throw new Error(`failed to copy font ${target} from ${source}: ${err.message}`, { cause: err });
  }
}
console.log('brand fonts copied to public/fonts');

await build({
  entryPoints: [join(rootDir, 'src-overlay', 'overlay.ts')],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'es2022',
  outfile: join(rootDir, 'public', 'overlay.js'),
});
console.log('overlay bundle built: public/overlay.js');
