import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(rootDir, 'src-overlay', 'overlay.ts')],
  bundle: true,
  minify: true,
  target: 'es2022',
  outfile: join(rootDir, 'public', 'overlay.js'),
});
console.log('overlay bundle built: public/overlay.js');
