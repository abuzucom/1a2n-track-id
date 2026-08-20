#!/usr/bin/env node
/**
 * Reject QML and JS that Traktor's engine cannot compile.
 *
 * Traktor drops a mapping whose files do not parse and reports nothing: no
 * dialog, no log entry, just a device missing from Controller Manager. Nothing
 * else in this repo reads the mod, so this scan is the only thing standing
 * between a dropped delimiter and a broken install.
 *
 * What it proves: a file listed here CANNOT compile. What it cannot prove: that
 * a file WILL compile. Semantic errors, an unknown property, a bad import, a
 * wrong type, are visible only to Traktor itself.
 *
 * Scanned: `.qml`, plus `.js`, since Traktor loads `Api/ApiClient.js` through
 * the same engine and a syntax error there breaks the mapping identically.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const OPENERS = { '{': '}', '[': ']', '(': ')' };
const CLOSERS = { '}': '{', ']': '[', ')': '(' };

// A '/' after one of these ends an expression, so it divides. Anywhere else it
// opens a regex. QML has no other way to tell the two apart without a parser.
const DIVISION_FOLLOWS = /[\w$)\]}]$/;
// Keywords that look like identifiers but end no expression: `return /re/` is a
// regex, not division by `return`.
const REGEX_FOLLOWS_KEYWORD = /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;
// Only the tail of the preceding code is ever inspected.
const SIGNIFICANT_TAIL = 64;

/**
 * Return every structural reason `source` cannot compile, as
 * `[{ line, message }]`, ordered by position. An empty array means no
 * structural fault was found, not that the file is valid.
 */
export function findStructuralErrors(source) {
  const errors = [];
  const stack = [];
  let line = 1;
  let index = 0;
  // Code seen before the cursor on this line, minus comments. Whitespace
  // collapses to a single space rather than vanishing, so word boundaries
  // survive for the keyword test below, and it is capped because only the tail
  // is ever read.
  let significant = '';
  const remember = (text) => {
    significant = (significant + text).slice(-SIGNIFICANT_TAIL);
  };

  /** Consume a delimited run, returning the index after it, or -1 at EOF. */
  const scanDelimited = (start, terminator, { escapes = true, classes = false } = {}) => {
    let cursor = start;
    let inClass = false;
    while (cursor < source.length) {
      const char = source[cursor];
      if (escapes && char === '\\') {
        // Clamp: a trailing escape must not step over the newline that ends
        // the line, or the line counter drifts for the rest of the file.
        if (cursor + 1 >= source.length) return -1;
        if (source[cursor + 1] === '\n') return -1;
        cursor += 2;
        continue;
      }
      if (classes && char === '[') inClass = true;
      else if (classes && char === ']') inClass = false;
      else if (char === '\n') return -1;
      else if (char === terminator && !inClass) return cursor + 1;
      cursor += 1;
    }
    return -1;
  };

  while (index < source.length) {
    const char = source[index];
    const pair = source.slice(index, index + 2);

    if (char === '\n') {
      line += 1;
      index += 1;
      significant = '';
      continue;
    }

    if (pair === '//') {
      const newline = source.indexOf('\n', index);
      index = newline === -1 ? source.length : newline;
      continue;
    }

    if (pair === '/*') {
      const openedAt = line;
      const end = source.indexOf('*/', index + 2);
      if (end === -1) {
        errors.push({ line: openedAt, message: 'unterminated block comment' });
        break;
      }
      for (let scan = index; scan < end; scan++) {
        if (source[scan] === '\n') line += 1;
      }
      index = end + 2;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = scanDelimited(index + 1, char);
      if (end === -1) {
        errors.push({ line, message: `unterminated string, opened with ${char}` });
        break;
      }
      index = end;
      remember('"');
      continue;
    }

    if (char === '`') {
      // Template literals legitimately span lines, so this one scans to its
      // terminator rather than stopping at the newline.
      let cursor = index + 1;
      let closed = false;
      const openedAt = line;
      while (cursor < source.length) {
        if (source[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (source[cursor] === '\n') line += 1;
        if (source[cursor] === '`') {
          closed = true;
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      if (!closed) {
        errors.push({ line: openedAt, message: 'unterminated template literal' });
        break;
      }
      index = cursor;
      remember('"');
      continue;
    }

    if (char === '/') {
      const preceding = significant.trimEnd();
      const divides = DIVISION_FOLLOWS.test(preceding) && !REGEX_FOLLOWS_KEYWORD.test(preceding);
      if (!divides) {
        const end = scanDelimited(index + 1, '/', { classes: true });
        if (end === -1) {
          errors.push({ line, message: 'unterminated regular expression' });
          break;
        }
        index = end;
        remember('x');
        continue;
      }
      index += 1;
      remember('/');
      continue;
    }

    if (OPENERS[char]) {
      stack.push({ char, line });
      index += 1;
      remember(char);
      continue;
    }

    if (CLOSERS[char]) {
      const open = stack.pop();
      if (!open) {
        errors.push({ line, message: `unmatched closing ${char}` });
        break;
      }
      if (open.char !== CLOSERS[char]) {
        errors.push({
          line,
          message: `closing ${char} does not match ${open.char} opened on line ${open.line}`,
        });
        break;
      }
      index += 1;
      remember(char);
      continue;
    }

    index += 1;
    remember(/\s/.test(char) ? ' ' : char);
  }

  // Only report an unclosed opener when nothing else went wrong: a bad
  // delimiter earlier leaves the stack meaningless, and one root cause beats a
  // cascade of consequences.
  if (errors.length === 0 && stack.length > 0) {
    const open = stack[stack.length - 1];
    errors.push({ line: open.line, message: `unclosed ${open.char}, never closed before end of file` });
  }

  return errors;
}

/** Return every scannable file reachable from `target`, a file or directory. */
async function collectFiles(target) {
  const info = await stat(target);
  if (!info.isDirectory()) return /\.(qml|js)$/.test(target) ? [target] : [];

  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => collectFiles(join(target, entry.name))));
  return nested.flat();
}

/** Scan every path given on the command line. Exits non-zero on any fault. */
async function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error('usage: check-qml-mod.mjs PATH [PATH ...]');
    return 2;
  }

  let files;
  try {
    files = (await Promise.all(targets.map(collectFiles))).flat();
  } catch (err) {
    // A wrong path is an installer bug, not a mod fault. Say which path, and
    // do not let a raw stack trace stand in for the verdict.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`cannot read the paths given: ${detail}`);
    return 2;
  }

  // Finding nothing is a failure, not a pass: a wrong path must never read as
  // a clean bill of health.
  if (files.length === 0) {
    console.error(`no .qml or .js files found under: ${targets.join(', ')}`);
    return 2;
  }

  let failures = 0;
  for (const file of files.sort()) {
    for (const { line, message } of findStructuralErrors(await readFile(file, 'utf8'))) {
      console.error(`${file}:${line}: ${message}`);
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error('');
    console.error('Traktor cannot compile this. It will drop the mapping without reporting it.');
    return 1;
  }
  console.log(`checked ${files.length} files, no structural faults`);
  return 0;
}

// pathToFileURL, not a `file://` template: on Windows process.argv[1] is
// `C:\path\to.mjs`, which no amount of prefixing turns into the
// `file:///C:/path/to.mjs` that import.meta.url reports. Getting this wrong
// makes the CLI a silent no-op on Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
