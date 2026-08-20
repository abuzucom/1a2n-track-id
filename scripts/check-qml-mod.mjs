#!/usr/bin/env node
/**
 * Reject a QML file that ends inside an unterminated block comment.
 *
 * Traktor's QML engine refuses to load a mapping whose file does not parse,
 * and an unclosed block comment swallows the rest of the file silently: the
 * device simply never appears in Controller Manager. Nothing else in this
 * repo reads the QML mod, so this scan is the only thing standing between a
 * dropped delimiter and a broken install.
 *
 * Scope of the scan:
 * - Only block-comment state carries across lines. String and line-comment
 *   state reset at each newline, since QML string literals cannot span one.
 *   That keeps a misread on one line from corrupting every line after it.
 * - Regex literals are not parsed. `Api/ApiDeck.qml` holds patterns such as
 *   /^\// whose trailing `//` reads here as a line comment. Harmless: the
 *   misread ends at the newline, and a regex carrying a block-comment
 *   delimiter would be pathological.
 * - Brace balance is not checked. Doing it correctly needs the
 *   regex-literal lexing this scanner deliberately skips.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Return the 1-based line where an unterminated block comment opens, or null
 * when every block comment in `source` is closed.
 */
export function findUnterminatedBlockComment(source) {
  const lines = source.split('\n');
  let openedAt = null;

  for (let lineNumber = 1; lineNumber <= lines.length; lineNumber++) {
    const line = lines[lineNumber - 1];
    let column = 0;
    let inString = false;

    while (column < line.length) {
      const pair = line.slice(column, column + 2);

      if (openedAt !== null) {
        if (pair === '*/') {
          openedAt = null;
          column += 2;
          continue;
        }
        column += 1;
        continue;
      }

      if (inString) {
        if (line[column] === '\\') {
          column += 2;
          continue;
        }
        if (line[column] === '"') inString = false;
        column += 1;
        continue;
      }

      if (pair === '//') break;
      if (pair === '/*') {
        openedAt = lineNumber;
        column += 2;
        continue;
      }
      if (line[column] === '"') inString = true;
      column += 1;
    }
  }

  return openedAt;
}

/** Return every `.qml` file reachable from `target`, a file or a directory. */
async function collectQmlFiles(target) {
  const info = await stat(target);
  if (!info.isDirectory()) return target.endsWith('.qml') ? [target] : [];

  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectQmlFiles(join(target, entry.name))),
  );
  return nested.flat();
}

/** Scan every path given on the command line. Exits 1 on the first finding. */
async function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error('usage: check-qml-mod.mjs PATH [PATH ...]');
    process.exit(2);
  }

  const files = (await Promise.all(targets.map(collectQmlFiles))).flat();
  let failures = 0;

  for (const file of files.sort()) {
    const openedAt = findUnterminatedBlockComment(await readFile(file, 'utf8'));
    if (openedAt !== null) {
      console.error(`${file}:${openedAt}: unterminated block comment`);
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error('fix: close the block comment, or delete it outright');
    process.exit(1);
  }
  console.log(`checked ${files.length} QML files, all block comments closed`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
