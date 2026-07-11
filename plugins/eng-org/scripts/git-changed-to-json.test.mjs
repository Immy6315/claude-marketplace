/**
 * git-changed-to-json.test.mjs — unit tests for the git-changed-to-json.mjs helper.
 *
 * Run: node --test plugins/eng-org/scripts/git-changed-to-json.test.mjs
 *
 * Tests:
 *   J1. NUL-delimited input "a.ts\0b/c.mjs\0" → ["a.ts","b/c.mjs"]
 *   J2. Empty stdin → []
 *   J3. Trailing NUL only ("\0") → []
 *   J4. Output NEVER equals [""] (the Python double-read bug value)
 *
 * Rules (MISTAKES-informed):
 *   - One assertion per test() block.
 *   - Test title matches what the body asserts.
 *   - No import outside Node stdlib.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.resolve(__dirname, 'git-changed-to-json.mjs');

/**
 * Pipe the given string to the helper and return the parsed JSON output.
 * @param {string} input
 * @returns {unknown}
 */
function runHelper(input) {
  const result = spawnSync(process.execPath, [HELPER], {
    input,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Helper exited ${result.status}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

// ---------------------------------------------------------------------------
// J1 — NUL-delimited input with two paths → correct JSON array
// ---------------------------------------------------------------------------

test('J1: NUL-delimited "a.ts\\0b/c.mjs\\0" → ["a.ts","b/c.mjs"]', () => {
  const output = runHelper('a.ts\x00b/c.mjs\x00');
  assert.deepStrictEqual(output, ['a.ts', 'b/c.mjs']);
});

// ---------------------------------------------------------------------------
// J2 — Empty stdin → []
// ---------------------------------------------------------------------------

test('J2: empty stdin → []', () => {
  const output = runHelper('');
  assert.deepStrictEqual(output, []);
});

// ---------------------------------------------------------------------------
// J3 — Trailing NUL only → [] (not [""])
// ---------------------------------------------------------------------------

test('J3: trailing-NUL-only input "\\0" → []', () => {
  const output = runHelper('\x00');
  assert.deepStrictEqual(output, []);
});

// ---------------------------------------------------------------------------
// J4 — Output NEVER equals [""] (regression guard against Python double-read bug)
// ---------------------------------------------------------------------------

test('J4: output with any input is never the buggy [""] value', () => {
  const inputs = [
    'a.ts\x00b/c.mjs\x00',
    '',
    '\x00',
    'single.ts',
    'a.ts\x00\x00b.ts', // double NUL (empty segment in middle)
  ];
  for (const input of inputs) {
    const output = runHelper(input);
    assert.notDeepStrictEqual(
      output,
      [''],
      `Input ${JSON.stringify(input)} produced the buggy [""] value`
    );
  }
});

// ---------------------------------------------------------------------------
// Sentinel self-test: §D heading in REPORT_DIET.md contains the exact sentinel
// string used by the drift-guard greps in REPORT_DIET.md §F.3 and
// merge-readiness.md §Step 2e. If the heading and grep pattern ever drift
// apart, this test fails and the guard is silently broken.
// ---------------------------------------------------------------------------

import fs from 'node:fs';

const SENTINEL = 'Cap LIFTED — unbounded prose required when';

test('REPORT_DIET.md §D heading contains the exact drift-guard sentinel string', () => {
  const reportDietPath = path.resolve(__dirname, '../agents/REPORT_DIET.md');
  const content = fs.readFileSync(reportDietPath, 'utf8');
  assert.ok(
    content.includes(SENTINEL),
    `REPORT_DIET.md does not contain the sentinel: "${SENTINEL}". ` +
    'Heading and grep pattern have drifted — fix the §D heading or the greps to match.'
  );
});

test('REPORT_DIET.md §F.3 grep command uses the exact drift-guard sentinel string', () => {
  const reportDietPath = path.resolve(__dirname, '../agents/REPORT_DIET.md');
  const content = fs.readFileSync(reportDietPath, 'utf8');
  // The grep in §F.3 must use the same sentinel inside its quoted argument.
  // We look for the pattern inside a grep -rl "..." invocation.
  const grepPattern = `grep -rl "${SENTINEL}"`;
  assert.ok(
    content.includes(grepPattern),
    `REPORT_DIET.md §F.3 does not contain the grep: ${JSON.stringify(grepPattern)}. ` +
    'Sentinel and grep command have drifted.'
  );
});

test('merge-readiness.md §Step 2e grep command uses the exact drift-guard sentinel string', () => {
  const mergeReadinessPath = path.resolve(__dirname, '../commands/merge-readiness.md');
  const content = fs.readFileSync(mergeReadinessPath, 'utf8');
  const grepPattern = `grep -rl "${SENTINEL}"`;
  assert.ok(
    content.includes(grepPattern),
    `merge-readiness.md §Step 2e does not contain the grep: ${JSON.stringify(grepPattern)}. ` +
    'Sentinel and grep command have drifted.'
  );
});
