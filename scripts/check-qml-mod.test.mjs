import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findStructuralErrors } from './check-qml-mod.mjs';

const execFileAsync = promisify(execFile);
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const CLI = join(SCRIPTS_DIR, 'check-qml-mod.mjs');
const MOD_DIR = join(SCRIPTS_DIR, '..', 'traktor-mod', 'D2');

/** Run the CLI as a real subprocess. Returns exit code plus both streams. */
async function runCli(...args) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('the shipped mod', () => {
  it('has no structural fault in any file Traktor loads', async () => {
    const entries = await readdir(MOD_DIR, { recursive: true, withFileTypes: true });
    const loaded = entries.filter((e) => e.isFile() && /\.(qml|js)$/.test(e.name));
    expect(loaded.length).toBeGreaterThan(0);

    const faults = [];
    for (const entry of loaded) {
      const path = join(entry.parentPath, entry.name);
      for (const error of findStructuralErrors(await readFile(path, 'utf8'))) {
        faults.push(`${path.slice(MOD_DIR.length + 1)}:${error.line}: ${error.message}`);
      }
    }
    expect(faults).toEqual([]);
  });
});

// The entry point is what install.ps1 and install.sh actually invoke. Importing
// the function proves nothing about it: a guard that never fires makes the CLI
// a silent no-op, which is exactly how the Windows regression stayed hidden.
describe('the command line entry point', () => {
  let workDir;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'qml-check-'));
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('runs and reports a verdict on the real mod', async () => {
    const { code, stdout } = await runCli(MOD_DIR);
    expect(code).toBe(0);
    expect(stdout).toMatch(/checked \d+ files, no structural faults/);
  });

  it('exits non-zero and names the file and line on a broken file', async () => {
    const broken = join(workDir, 'Broken.qml');
    await writeFile(broken, 'Item {\n  /*\n  property int a: 1\n}\n');

    const { code, stderr } = await runCli(broken);
    expect(code).toBe(1);
    expect(stderr).toContain('Broken.qml:2: unterminated block comment');
    expect(stderr).toContain('Traktor cannot compile this');
  });

  it('refuses to report success when it finds nothing to check', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'qml-check-empty-'));
    try {
      const { code, stdout, stderr } = await runCli(empty);
      expect(code).toBe(2);
      expect(stdout).not.toMatch(/no structural faults/);
      expect(stderr).toContain('no .qml or .js files found');
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('reports a missing path instead of dumping a stack trace', async () => {
    const { code, stderr } = await runCli(join(workDir, 'not-here'));
    expect(code).toBe(2);
    expect(stderr).toContain('cannot read the paths given');
    expect(stderr).not.toContain('node:internal');
  });
});

describe('findStructuralErrors', () => {
  const at = (source) => findStructuralErrors(source).map((e) => `${e.line}: ${e.message}`);

  it('reports an unterminated block comment at its opening line', () => {
    expect(at('Item {\n  /*\n  gone\n}\n')).toEqual(['2: unterminated block comment']);
  });

  it('accepts a closed block comment', () => {
    expect(at('Item {\n  /*\n  gone\n  */\n}\n')).toEqual([]);
  });

  it('reports an unclosed brace at the line that opened it', () => {
    expect(at('Item {\n  property int a: 1\n')).toEqual([
      '1: unclosed {, never closed before end of file',
    ]);
  });

  it('reports an unmatched closing bracket', () => {
    expect(at('Item {\n}\n)\n')).toEqual(['3: unmatched closing )']);
  });

  it('reports a mismatched pair naming where the opener was', () => {
    expect(at('Item (\n]\n')).toEqual(['2: closing ] does not match ( opened on line 1']);
  });

  it('reports an unterminated string', () => {
    expect(at('property string a: "open\n')).toEqual(['1: unterminated string, opened with "']);
  });

  it('reports an unterminated regular expression', () => {
    expect(at('function f(v) { return /^abc\n}\n')).toEqual(['1: unterminated regular expression']);
  });
});

// These shapes all appear in the real mod. A lexer change that starts misreading
// any of them would miscount brackets for the rest of the file, so they are
// pinned rather than left to the whole-file case to catch.
describe('shapes taken from the real mod', () => {
  const clean = (source) => expect(findStructuralErrors(source)).toEqual([]);

  it('treats a slash after an identifier as division', () => {
    clean('Item {\n  gridOffset: propGridOffset.value/1000,\n}\n');
  });

  it('treats a slash after return as a regex', () => {
    clean('function isUri(v) {\n  return /^[a-z][a-z0-9+.-]*:\\/\\//i.test(v)\n}\n');
  });

  it('treats a slash after an operator as a regex', () => {
    clean('function f(v) {\n  return /^[A-Z]:\\\\/.test(v) || /^\\//.test(v)\n}\n');
  });

  it('treats a slash after an open paren as a regex', () => {
    clean('Item {\n  property string a: v.replace(/:/g, "/")\n}\n');
  });

  it('does not read a URL inside a string as a line comment', () => {
    clean('var API_BASE_URL = "http://localhost:8080"\nItem {\n}\n');
  });

  it('does not read quotes inside a line comment as a string', () => {
    clean('// would mangle a URI into "/Volumes/beatport///tracks/N", so\nItem {\n}\n');
  });

  it('handles a regex character class containing a slash', () => {
    clean('function f(v) {\n  return v.split(/[/]/)\n}\n');
  });

  it('keeps the word boundary before a keyword that whitespace separated', () => {
    // `a in /re/` is a regex; `myin/2` is division. Both hinge on the space
    // surviving into the lookback.
    clean('function f(a) {\n  if (a in /^x/.source) { return 1 }\n}\n');
    clean('Item {\n  property real r: myin/2\n}\n');
  });
});

// A lexer that fails to advance hangs the installer instead of failing it.
describe('termination on pathological input', () => {
  it.each([
    ['a lone trailing slash', 'Item {\n}\n/'],
    ['a trailing backslash', 'property string a: "x\\'],
    ['a trailing backslash inside a regex', 'var r = /abc\\'],
    ['an unterminated template literal', 'var t = `abc'],
    ['a lone opening quote at end of file', 'var s = "'],
    ['nothing at all', ''],
  ])('terminates on %s', (_label, source) => {
    expect(() => findStructuralErrors(source)).not.toThrow();
  });
});
