#!/usr/bin/env node
/**
 * design-principles-parity.test.mjs
 *
 * Tests for design-principles-parity.mjs.
 *
 * Proves:
 *   1. checkParity returns { identical: false } when the two files differ
 *      (synthetic divergence — RED path).
 *   2. checkParity returns { identical: true }  when the two files are
 *      byte-identical (synthetic identical pair — GREEN path).
 *   3. checkParity returns { identical: false } when a file does not exist.
 *
 * Uses only Node.js stdlib (node:fs, node:os, node:path, node:crypto).
 * No external test framework or npm dependencies.
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { checkParity } from './design-principles-parity.mjs';

// ---------------------------------------------------------------------------
// Minimal test harness (stdlib-only)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

const TMP = join(tmpdir(), `dp-parity-test-${randomBytes(4).toString('hex')}`);
mkdirSync(TMP, { recursive: true });

function tmpFile(name, content) {
  const p = join(TMP, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

// ---------------------------------------------------------------------------
// Test 1 — RED: synthetic divergence exits non-zero (identical: false)
// ---------------------------------------------------------------------------

console.log('\nTest 1 — RED on synthetic divergence');
{
  const liveContent     = '# Design Principles\n\nThis is the live copy.\n';
  const templateContent = '# Design Principles\n\nThis is the TEMPLATE copy (intentionally different).\n';

  const a = tmpFile('live-diverged.md', liveContent);
  const b = tmpFile('template-diverged.md', templateContent);

  const result = checkParity(a, b);

  assert(result.identical === false, 'identical === false when files differ');
  assert(typeof result.detail === 'string', 'detail is a string');
  assert(result.detail.includes('PARITY FAIL'), 'detail mentions PARITY FAIL');
  assert(result.detail.includes('First differing line'), 'detail names first differing line');
}

// ---------------------------------------------------------------------------
// Test 2 — GREEN: byte-identical synthetic pair (identical: true)
// ---------------------------------------------------------------------------

console.log('\nTest 2 — GREEN on byte-identical pair');
{
  const content = '# Design Principles\n\nSame content in both.\n\n## 1. SRP\n\nAll good.\n';

  const a = tmpFile('live-identical.md', content);
  const b = tmpFile('template-identical.md', content);

  const result = checkParity(a, b);

  assert(result.identical === true, 'identical === true when files match');
  assert(typeof result.detail === 'string', 'detail is a string');
  assert(result.detail.includes('byte-identical'), 'detail confirms byte-identity');
  assert(!result.detail.includes('PARITY FAIL'), 'detail does NOT mention PARITY FAIL');
}

// ---------------------------------------------------------------------------
// Test 3 — RED: missing file returns identical: false with a clear message
// ---------------------------------------------------------------------------

console.log('\nTest 3 — RED on missing file');
{
  const existing = tmpFile('live-exists.md', '# exists\n');
  const missing  = join(TMP, 'does-not-exist.md');

  const result = checkParity(existing, missing);

  assert(result.identical === false, 'identical === false when template file missing');
  assert(result.detail.includes('Cannot read'), 'detail explains file-read failure');
}

// ---------------------------------------------------------------------------
// Test 4 — RED: empty vs non-empty (edge: zero-byte difference)
// ---------------------------------------------------------------------------

console.log('\nTest 4 — RED on empty vs non-empty');
{
  const empty   = tmpFile('live-empty.md', '');
  const nonEmpty = tmpFile('template-nonempty.md', '# content\n');

  const result = checkParity(empty, nonEmpty);

  assert(result.identical === false, 'identical === false when one file is empty and other is not');
}

// ---------------------------------------------------------------------------
// Test 5 — GREEN: empty vs empty (both empty is still byte-identical)
// ---------------------------------------------------------------------------

console.log('\nTest 5 — GREEN on both-empty');
{
  const a = tmpFile('live-both-empty.md', '');
  const b = tmpFile('template-both-empty.md', '');

  const result = checkParity(a, b);

  assert(result.identical === true, 'identical === true when both files are empty');
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

rmSync(TMP, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.error('Failed tests:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log('All tests passed. GREEN.');
  process.exit(0);
}
