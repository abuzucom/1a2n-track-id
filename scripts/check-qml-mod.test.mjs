import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findUnterminatedBlockComment } from './check-qml-mod.mjs';

const MOD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'traktor-mod', 'D2');

/** Return every shipped `.qml` file in the mod, as [relativeName, source] pairs. */
async function readModSources() {
  const entries = await readdir(MOD_DIR, { recursive: true, withFileTypes: true });
  const qml = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.qml'));
  return Promise.all(
    qml.map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      return [path.slice(MOD_DIR.length + 1), await readFile(path, 'utf8')];
    }),
  );
}

describe('the shipped QML mod', () => {
  it('closes every block comment, so Traktor can parse the mapping', async () => {
    const sources = await readModSources();
    expect(sources.length).toBeGreaterThan(0);

    const unterminated = sources
      .filter(([, source]) => findUnterminatedBlockComment(source) !== null)
      .map(([name, source]) => `${name}:${findUnterminatedBlockComment(source)}`);

    expect(unterminated).toEqual([]);
  });
});

describe('findUnterminatedBlockComment', () => {
  it('reports the line where an unclosed comment opens', () => {
    const source = ['Mapping {', '  /*', '  property int a: 1', '}'].join('\n');
    expect(findUnterminatedBlockComment(source)).toBe(2);
  });

  it('accepts a closed comment', () => {
    const source = ['Mapping {', '  /*', '  property int a: 1', '  */', '}'].join('\n');
    expect(findUnterminatedBlockComment(source)).toBeNull();
  });

  it('ignores delimiters inside strings and line comments', () => {
    const source = ['property string a: "/* not a comment"', '// /* nor this', 'Item {}'].join('\n');
    expect(findUnterminatedBlockComment(source)).toBeNull();
  });

  it('still finds an unclosed comment opened after a regex literal', () => {
    const source = ['function isUri(v) { return /^\\//.test(v) }', '/*', 'trailing'].join('\n');
    expect(findUnterminatedBlockComment(source)).toBe(2);
  });
});
