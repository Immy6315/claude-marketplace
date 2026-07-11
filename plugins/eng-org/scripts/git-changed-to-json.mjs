#!/usr/bin/env node
/**
 * git-changed-to-json.mjs — read NUL-delimited paths from stdin, emit JSON array.
 *
 * Intended call site:
 *   git diff --name-only -z "<pinned-sha>"..HEAD \
 *     | node plugins/eng-org/scripts/git-changed-to-json.mjs \
 *     > /tmp/changed-files-$$.json
 *
 * Semantics:
 *   - Reads ALL stdin chunks before processing (single logical read — no
 *     double-read hazard of the Python ternary idiom).
 *   - Splits on NUL (\x00); filters out empty segments.
 *   - Empty stdin → emits [].
 *   - Output is NEVER [""] — empty segments are always discarded.
 *   - Exit 0 on success; any error → stderr message + exit 1.
 *     A non-zero exit triggers the existing full-re-run fail-safe in
 *     commands/run-tests.md §Step 3 and commands/run-reviews.md §Step 3.
 *
 * Node builtins only — no npm dependencies.
 */

import process from 'node:process';

const chunks = [];

process.stdin.on('data', (chunk) => {
  chunks.push(chunk);
});

process.stdin.on('end', () => {
  try {
    const raw = Buffer.concat(chunks).toString('utf8');
    const paths = raw.split('\x00').filter((p) => p.length > 0);
    process.stdout.write(JSON.stringify(paths));
  } catch (err) {
    process.stderr.write(`git-changed-to-json: ${err.message}\n`);
    process.exit(1);
  }
});

process.stdin.on('error', (err) => {
  process.stderr.write(`git-changed-to-json: stdin error: ${err.message}\n`);
  process.exit(1);
});
