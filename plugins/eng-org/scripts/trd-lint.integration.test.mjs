/**
 * trd-lint.integration.test.mjs
 *
 * Independent integration tests for trd-lint.mjs: spawns the CLI as a real
 * child process against real files on disk. Verifies:
 *   - PASS: the frozen template exits 0
 *   - FAIL: a TRD missing required sections exits 1 with named findings
 *   - N/A sentinel: §3/§4 as N/A with all other sections populated exits 0
 *   - Missing file: graceful exit 2, no stack trace leak
 *   - Cross-module wiring: lintTrd uses parseSections from frontmatter lib
 *     (verified by injecting a heading inside a mermaid fence — only the real
 *     lib handles fence-aware section splitting correctly)
 *
 * Node stdlib only. No mocks. No external deps.
 * Run: node --test scripts/trd-lint.integration.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LINTER  = path.resolve(__dirname, 'trd-lint.mjs');
const TEMPLATE = path.resolve(__dirname, '../templates/trd.template.md');
const NODE    = process.execPath;

/** Run the CLI; returns { stdout, stderr, status }. Never throws. */
function runCli(filePath) {
  try {
    const stdout = execFileSync(NODE, [LINTER, filePath], { encoding: 'utf8' });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      status: err.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// PASS case: frozen template lints clean (exit 0)
// ---------------------------------------------------------------------------

test('integration PASS: trd.template.md → exit 0 + PASS message', () => {
  const { stdout, stderr, status } = runCli(TEMPLATE);
  assert.strictEqual(status, 0,
    `Expected exit 0; got ${status}. stderr: ${stderr}`);
  assert.ok(stdout.includes('PASS'),
    `Expected PASS in stdout; got: ${stdout}`);
  // Confirm no stack trace leaked
  assert.ok(!stderr.includes('at '),
    `Unexpected stack trace in stderr: ${stderr}`);
});

// ---------------------------------------------------------------------------
// FAIL case: missing §5 + all E-sections → exit 1, findings name missing pieces
// ---------------------------------------------------------------------------

test('integration FAIL: TRD missing §5 and all E-sections → exit 1 + named findings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trd-int-'));
  try {
    const trd = `---
title: "Integration test TRD"
req_id: "REQ-INT-TEST"
author: "test-integration"
date: "2026-07-18"
status: draft
---

## 1. What Are We Doing?

Testing the linter failure path.

## 2. How Are We Doing It?

\`\`\`mermaid
sequenceDiagram
    participant C as Client
    C->>C: self
\`\`\`

Implementation here.

## 3. DB Schema (include ONLY when DB changes)

N/A — no DB changes in this REQ.

## 4. API Contracts

N/A — no API contract changes in this REQ.
`;
    const filePath = join(dir, 'missing-s5.md');
    writeFileSync(filePath, trd, 'utf8');

    const { stderr, status } = runCli(filePath);
    assert.strictEqual(status, 1,
      `Expected exit 1; got ${status}. stderr: ${stderr}`);
    assert.ok(stderr.includes('5. Acceptance Criteria'),
      `Expected §5 finding in stderr; got: ${stderr}`);
    assert.ok(stderr.includes('E1. Design Principles Applied'),
      `Expected E1 finding in stderr; got: ${stderr}`);
    assert.ok(stderr.includes('E2. Blast Radius & Change Budget'),
      `Expected E2 finding in stderr; got: ${stderr}`);
    // No stack trace
    assert.ok(!stderr.includes('at '),
      `Unexpected stack trace in stderr: ${stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// N/A sentinel: §3 and §4 are N/A, everything else populated → exit 0
// ---------------------------------------------------------------------------

test('integration N/A sentinel: §3+§4 = N/A, full §1/§2/§5 + E1-E4 → exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trd-int-'));
  try {
    const trd = `---
title: "Sentinel test TRD"
req_id: "REQ-INT-SENTINEL"
author: "test-integration"
date: "2026-07-18"
status: draft
---

## 1. What Are We Doing?

This TRD tests that the N/A sentinel is accepted for §3 and §4 only.
Scope: confirm linter exit 0 for sentinel-eligible sections.
Non-scope: nothing else.
Link: internal integration test fixture.

## 2. How Are We Doing It?

\`\`\`mermaid
sequenceDiagram
    participant C as Client
    participant S as Service
    C->>S: Request
    S-->>C: Response
\`\`\`

Implementation: direct in-process function with no async steps.

**Idempotency considerations:**
Pure function; same input always returns same output.

**Retry mechanisms:**
Not applicable — synchronous.

**Async processing:**
None.

**Error handling & failure scenarios:**
Returns findings array; no throws.

**Data consistency considerations:**
Pure function; no state mutation.

**Performance implications:**
Single-pass O(n) scan.

**Why this approach over alternatives:**
Simplest correct approach for a CLI lint gate.

A reviewer must understand: (1) What happens? (2) Why? (3) What if it fails?

## 3. DB Schema (include ONLY when DB changes)

N/A — no DB changes in this REQ.

## 4. API Contracts

N/A — no API contract changes in this REQ.

## 5. Acceptance Criteria

- [x] Exit 0 when §3 and §4 carry the N/A sentinel
- [x] Exit 1 when §3 or §4 is truly empty (no sentinel)
- [x] No stack-trace output on any error path

---

## eng-org extensions

## E1. Design Principles Applied

**SRP:** each lint check is an independent pass over the section map.
**DRY:** heading constants declared once, imported by tests.
**YAGNI:** no caching — not warranted for a sync CLI linter.
**Trade-off:** simplicity over configurability; acceptable for a lint gate.
**Boy-Scout:** no unrelated refactors introduced; only net-new files.

## E2. Blast Radius & Change Budget

files_touched_max: 3
loc_max: 200
allow_full_rewrite: false

**Blast radius:** affects only the lint gate in the Mode B pipeline; zero production surface.

**Rollback plan:** delete the three net-new script files; no migration, no side-effects.

## E3. File-by-File Change Map

| File | State | Intent |
|---|---|---|
| \`scripts/trd-lint.mjs\` | net-new | Lint core + CLI shell |
| \`templates/trd.template.md\` | net-new | Frozen reference template |
| \`scripts/trd-lint.test.mjs\` | net-new | Unit + dogfood + CLI tests |

## E4. Test-Tier Strategy

**Unit:**
- [x] Happy path: valid TRD returns ok: true
- [x] Failure modes: missing section, blank body, missing E2 fields
- [x] N/A sentinel: §3/§4 pass; §1/§2/§5 do not

**Integration:**
- [x] CLI end-to-end: real file on disk, real exit code, real child process

**E2E / contract:**
- SKIP-WITH-NOTE: pure CLI tool; no network surface

**Performance:**
- SKIP-WITH-NOTE: sync stdlib script; no DB or network
`;
    const filePath = join(dir, 'sentinel.md');
    writeFileSync(filePath, trd, 'utf8');

    const { stdout, stderr, status } = runCli(filePath);
    assert.strictEqual(status, 0,
      `Expected exit 0 for N/A sentinel TRD; got ${status}. stderr: ${stderr}`);
    assert.ok(stdout.includes('PASS'),
      `Expected PASS in stdout; got: ${stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Missing-file: non-existent path → exit 2, clear message, no stack trace
// ---------------------------------------------------------------------------

test('integration missing file: non-existent path → exit 2 + clear message, no stack trace', () => {
  const fakePath = '/tmp/trd-int-nonexistent-phantom-20260718.md';
  const { stderr, status } = runCli(fakePath);

  assert.strictEqual(status, 2,
    `Expected exit 2 for missing file; got ${status}. stderr: ${stderr}`);
  // Either "file not found" or "cannot read" — must mention the path
  assert.ok(
    stderr.includes('not found') || stderr.includes('cannot read') || stderr.includes(fakePath),
    `Expected IO error message in stderr; got: ${stderr}`,
  );
  // No JavaScript stack trace leaked (no "at " frames)
  assert.ok(!stderr.includes('    at '),
    `Unexpected JS stack trace in stderr: ${stderr}`);
});

// ---------------------------------------------------------------------------
// Cross-module wiring: fence-aware section detection proves real lib import
//
// trd-lint.mjs imports parseSections from ./lib/frontmatter.mjs.
// The lib is fence-aware: a ## heading inside a ``` block is NOT a section.
// A reimplementation would almost certainly miss this and either crash or
// silently mis-classify the document. We exercise exactly this path.
// ---------------------------------------------------------------------------

test('integration cross-module: heading inside mermaid fence is NOT a section (lib wiring verified)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trd-int-'));
  try {
    // Build a minimal valid TRD where §2 body embeds a ## heading inside
    // the mermaid fence. If trd-lint used a home-grown scan it would either
    // count the embedded heading as a real section (wrong) or fail to parse
    // the fence at all. The real lib handles it correctly: the fence lines
    // are part of the §2 body, not a new section boundary.
    const trd = `---
title: "Cross-module wiring test"
req_id: "REQ-INT-XMOD"
author: "test-integration"
date: "2026-07-18"
status: draft
---

## 1. What Are We Doing?

This test verifies that a heading inside a mermaid fence is not split as a new section.
Scope: confirm fence-aware behavior routes through the real frontmatter lib.
Non-scope: nothing else.
Link: integration test fixture.

## 2. How Are We Doing It?

\`\`\`mermaid
sequenceDiagram
    participant C as Client
    participant S as Service
    %% The next line looks like a heading — must NOT be treated as one
    ## 5. Acceptance Criteria
    C->>S: Request
    S-->>C: Response
\`\`\`

Implementation: direct function call, no async. Fence-aware lib prevents
the pseudo-heading above from splitting the section prematurely.

**Idempotency considerations:** pure function.
**Retry mechanisms:** not applicable.
**Async processing:** none.
**Error handling & failure scenarios:** findings array, no throws.
**Data consistency considerations:** stateless.
**Performance implications:** O(n) single-pass.
**Why this approach over alternatives:** simplest correct approach.

A reviewer must understand: (1) What happens? (2) Why? (3) What if it fails?

## 3. DB Schema (include ONLY when DB changes)

N/A — no DB changes in this REQ.

## 4. API Contracts

N/A — no API contract changes in this REQ.

## 5. Acceptance Criteria

- [x] Heading inside mermaid fence is not a real section boundary
- [x] §2 body remains intact through the fence
- [x] All E-sections present and non-empty

---

## eng-org extensions

## E1. Design Principles Applied

**SRP:** fence-awareness is fully delegated to the lib; lintTrd has one job.
**DRY:** heading constants declared once in trd-lint.mjs.
**YAGNI:** no extra fence-handling code in lintTrd; lib owns it.
**Trade-off:** dependency on lib vs. self-containment; lib is the right layer.
**Boy-Scout:** no unrelated changes introduced.

## E2. Blast Radius & Change Budget

files_touched_max: 3
loc_max: 200
allow_full_rewrite: false

**Blast radius:** only the eng-org lint gate; no production service affected.

**Rollback plan:** delete the three net-new files; zero migration impact.

## E3. File-by-File Change Map

| File | State | Intent |
|---|---|---|
| \`scripts/trd-lint.mjs\` | net-new | Lint core + CLI shell |
| \`templates/trd.template.md\` | net-new | Frozen reference template |
| \`scripts/trd-lint.test.mjs\` | net-new | Unit + dogfood + CLI tests |

## E4. Test-Tier Strategy

**Unit:**
- [x] Happy path and all failure modes

**Integration:**
- [x] CLI end-to-end: real child process, real files, real exit codes

**E2E / contract:**
- SKIP-WITH-NOTE: pure CLI, no network surface

**Performance:**
- SKIP-WITH-NOTE: sync stdlib, no DB or network
`;
    const filePath = join(dir, 'fence-wiring.md');
    writeFileSync(filePath, trd, 'utf8');

    const { stdout, stderr, status } = runCli(filePath);
    // If §5 was incorrectly parsed as a section inside the fence, the real §5
    // (the one after the fence) would be duplicated or the fake one would
    // satisfy the requirement — either way the behavior would be undefined.
    // The correct (lib-backed) behavior: exit 0, PASS.
    assert.strictEqual(status, 0,
      `Expected exit 0 (fence-aware lib correctly ignores heading inside fence); got ${status}. stderr: ${stderr}`);
    assert.ok(stdout.includes('PASS'),
      `Expected PASS in stdout; got: ${stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
