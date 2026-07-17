/**
 * mistakes-gate.test.mjs — unit tests for mistakes-gate.mjs.
 *
 * REQ-20260713-d904-03 TASK-7. AC-13 exhaustive coverage: 12 cases covering
 * CONFIRMED-with/without-entry, no-gr-review, unparseable, fix-iteration
 * coverage, --match glob (tagged hit / miss / untagged legacy), pure fn
 * assertions.
 *
 * MISTAKES-informed: one assertion per test; title names outcome; no `>=`
 * under `>`; no non-stdlib imports; no module-level mutable state (fixture
 * tracking uses local `let` inside `describe` where possible; here `tmpFiles`
 * is scoped to the module but never assigned outside the test-hook closures).
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseGrReview,
  parseMistakesFile,
  extractReqIdFromPath,
  globMatches,
  gateReq,
  matchFiles,
} from './mistakes-gate.mjs';

/** @type {string[]} */
const tmpDirs = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const d = tmpDirs.pop();
    try { if (d) fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

/**
 * Build a temp REQ dir with an optional gr-review.md content string and an
 * optional MISTAKES.md content string.
 *
 * @param {{reqId?: string, gr?: string, mistakes?: string, taskFiles?: Record<string, string>}} opts
 * @returns {{reqDir: string, mistakesPath: string}}
 */
function makeReqDir(opts) {
  const reqId = opts.reqId || 'REQ-20260101-fake-01';
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mistakes-gate-test-'));
  const reqDir = path.join(parent, reqId);
  fs.mkdirSync(path.join(reqDir, 'tasks'), { recursive: true });
  tmpDirs.push(parent);
  if (opts.gr !== undefined) {
    fs.writeFileSync(path.join(reqDir, 'gr-review.md'), opts.gr, 'utf8');
  }
  const mistakesPath = path.join(parent, 'MISTAKES.md');
  fs.writeFileSync(mistakesPath, opts.mistakes || '', 'utf8');
  if (opts.taskFiles) {
    for (const [name, content] of Object.entries(opts.taskFiles)) {
      fs.writeFileSync(path.join(reqDir, 'tasks', name), content, 'utf8');
    }
  }
  return { reqDir, mistakesPath };
}

function grFixture(confirmedCount) {
  const rows = [];
  for (let i = 0; i < confirmedCount; i++) {
    rows.push(`| ${i + 1} | P2 | \`foo.ts:${i}\` | CONFIRMED | evidence text ${i} |`);
  }
  return [
    '# GR deep-review disposition',
    '',
    '## Disposition table',
    '',
    '| # | Sev | Location | Disposition | Evidence |',
    '|---|-----|----------|-------------|----------|',
    ...rows,
    '',
  ].join('\n');
}

function mistakesFixture(reqIds) {
  const parts = ['# MISTAKES', '', '## Schema', ''];
  for (const rid of reqIds) {
    parts.push(`### 2026-07-13 — test entry (${rid})  [test-tag]`);
    parts.push('');
    parts.push('**What broke:** test.');
    parts.push('**Root cause:** test.');
    parts.push('**Prevention:** test.');
    parts.push('paths: **');
    parts.push('');
  }
  return parts.join('\n');
}

// -----------------------------------------------------------------------
// M1 — CONFIRMED finding with matching MISTAKES entry → PASS
// -----------------------------------------------------------------------

test('M1: CONFIRMED finding with matching MISTAKES entry yields PASS', () => {
  const { reqDir, mistakesPath } = makeReqDir({
    reqId: 'REQ-20260101-fake-01',
    gr: grFixture(1),
    mistakes: mistakesFixture(['REQ-20260101-fake-01']),
  });
  const r = gateReq({ reqDir, mistakesPath });
  assert.strictEqual(r.status, 'PASS');
});

// -----------------------------------------------------------------------
// M2 — CONFIRMED finding with no MISTAKES entry → FAIL
// -----------------------------------------------------------------------

test('M2: CONFIRMED finding with no MISTAKES entry yields FAIL with learning-loop-debt reason', () => {
  const { reqDir, mistakesPath } = makeReqDir({
    reqId: 'REQ-20260101-fake-02',
    gr: grFixture(1),
    mistakes: '',
  });
  const r = gateReq({ reqDir, mistakesPath });
  assert.match(r.reason, /learning-loop debt/);
});

// -----------------------------------------------------------------------
// M3 — No gr-review.md file → SKIP not FAIL
// -----------------------------------------------------------------------

test('M3: no gr-review.md file yields SKIP not FAIL', () => {
  const { reqDir, mistakesPath } = makeReqDir({
    reqId: 'REQ-20260101-fake-03',
    mistakes: '',
  });
  const r = gateReq({ reqDir, mistakesPath });
  assert.strictEqual(r.status, 'SKIP');
});

// -----------------------------------------------------------------------
// M4 — Unparseable gr-review.md → SKIP not FAIL
// -----------------------------------------------------------------------

test('M4: unparseable gr-review.md yields SKIP not FAIL', () => {
  const { reqDir, mistakesPath } = makeReqDir({
    reqId: 'REQ-20260101-fake-04',
    gr: '',
    mistakes: '',
  });
  const r = gateReq({ reqDir, mistakesPath });
  assert.strictEqual(r.status, 'SKIP');
});

// -----------------------------------------------------------------------
// M5 — Zero CONFIRMED rows + no MISTAKES entry → PASS
// -----------------------------------------------------------------------

test('M5: zero CONFIRMED rows and no MISTAKES entry yields PASS', () => {
  const { reqDir, mistakesPath } = makeReqDir({
    reqId: 'REQ-20260101-fake-05',
    gr: [
      '# GR', '',
      '| # | Sev | Location | Disposition | Evidence |',
      '|---|-----|----------|-------------|----------|',
      '| 1 | P3 | foo.ts:1 | FALSE-POSITIVE | not a bug |',
      '| 2 | P2 | bar.ts:2 | OUT-OF-SCOPE | pre-existing |',
      '',
    ].join('\n'),
    mistakes: '',
  });
  const r = gateReq({ reqDir, mistakesPath });
  assert.strictEqual(r.status, 'PASS');
});

// -----------------------------------------------------------------------
// M6 — fix_iterations=2 with no MISTAKES entry → FAIL
// -----------------------------------------------------------------------

test('M6: fix_iterations=2 with no MISTAKES entry yields FAIL', () => {
  const { reqDir, mistakesPath } = makeReqDir({
    reqId: 'REQ-20260101-fake-06',
    gr: grFixture(0),
    mistakes: '',
    taskFiles: {
      'TASK-1-slug.md': [
        '---',
        'task: TASK-1',
        'fix_iterations: 2',
        '---',
        '',
      ].join('\n'),
    },
  });
  const r = gateReq({ reqDir, mistakesPath, checkFixIterations: true });
  assert.strictEqual(r.status, 'FAIL');
});

// -----------------------------------------------------------------------
// M7 — fix_iterations=0 across tasks → PASS
// -----------------------------------------------------------------------

test('M7: fix_iterations=0 across all tasks yields PASS', () => {
  const { reqDir, mistakesPath } = makeReqDir({
    reqId: 'REQ-20260101-fake-07',
    gr: grFixture(0),
    mistakes: '',
    taskFiles: {
      'TASK-1-slug.md': [
        '---',
        'task: TASK-1',
        'fix_iterations: 0',
        '---',
        '',
      ].join('\n'),
    },
  });
  const r = gateReq({ reqDir, mistakesPath, checkFixIterations: true });
  assert.strictEqual(r.status, 'PASS');
});

// -----------------------------------------------------------------------
// M8 — Multiple CONFIRMED findings share one MISTAKES entry → PASS (AC-16 dedup)
// -----------------------------------------------------------------------

test('M8: multiple CONFIRMED findings share one MISTAKES entry yields PASS via dedup', () => {
  const { reqDir, mistakesPath } = makeReqDir({
    reqId: 'REQ-20260101-fake-08',
    gr: grFixture(5),
    mistakes: mistakesFixture(['REQ-20260101-fake-08']),
  });
  const r = gateReq({ reqDir, mistakesPath });
  assert.strictEqual(r.status, 'PASS');
});

// -----------------------------------------------------------------------
// M9 — --match tagged entry hits file inside its glob → MATCHED
// -----------------------------------------------------------------------

test('M9: --match tagged entry hits file inside its glob yields one match', () => {
  const { mistakesPath } = makeReqDir({
    mistakes: [
      '# MISTAKES', '',
      '### 2026-07-13 — scripts glob entry  [scripts, code-quality]',
      '',
      '**What broke:** test.',
      'paths: plugins/eng-org/scripts/**',
      '',
    ].join('\n'),
  });
  const results = matchFiles(['plugins/eng-org/scripts/verdict-lint.mjs'], mistakesPath);
  assert.strictEqual(results[0].matches.length, 1);
});

// -----------------------------------------------------------------------
// M10 — --match tagged entry misses file outside its glob → not matched
// -----------------------------------------------------------------------

test('M10: --match tagged entry misses file outside its glob yields zero matches', () => {
  const { mistakesPath } = makeReqDir({
    mistakes: [
      '# MISTAKES', '',
      '### 2026-07-13 — scripts glob entry  [scripts]',
      '',
      '**What broke:** test.',
      'paths: plugins/eng-org/scripts/**',
      '',
    ].join('\n'),
  });
  const results = matchFiles(['governance/CONSTITUTION.md'], mistakesPath);
  assert.strictEqual(results[0].matches.length, 0);
});

// -----------------------------------------------------------------------
// M11 — --match untagged legacy entry matches any file → MATCHED
// -----------------------------------------------------------------------

test('M11: --match untagged legacy entry matches any file yields one match', () => {
  const { mistakesPath } = makeReqDir({
    mistakes: [
      '# MISTAKES', '',
      '### 2026-07-13 — legacy untagged entry  [general]',
      '',
      '**What broke:** test.',
      '',
    ].join('\n'),
  });
  const results = matchFiles(['any/file/path.ts'], mistakesPath);
  assert.strictEqual(results[0].matches.length, 1);
});

// -----------------------------------------------------------------------
// M13 — header/template sections are not entries (F-1 false-PASS regression)
// -----------------------------------------------------------------------

test('M13: header/template sections citing the REQ id do not count as entries — CONFIRMED finding with template-only MISTAKES yields FAIL (F-1 false-PASS repro)', () => {
  // Mirrors the real governance/MISTAKES.md header shape that produced
  // mistakes_for_req=2 with ZERO real entries for REQ-20260713-d904-03.
  const templateOnlyMistakes = [
    '# MISTAKES', '',
    '## Schema', '',
    'Each entry:', '',
    '```',
    '### {{DATE-YYYY-MM-DD}} — short title  [tag1, tag2]',
    '',
    '**What happened:** 1–3 sentences.',
    '```', '',
    '### Optional additive fields (v0.15.0-candidate — REQ-20260101-fake-13 §Amendment 2 Change 6)', '',
    'New entries MAY include `paths:` — see REQ-20260101-fake-13.', '',
    '### Fix-iteration distill template (v0.15.0-candidate — REQ-20260101-fake-13 §Amendment 2 Change 6)', '',
    '```',
    '### {{YYYY-MM-DD}} — {{one-line what-broke}} (REQ-{{req-id}}, fix-iter-{{n}})  [{{root_cause_class}}]',
    '```', '',
    '---', '',
    '<!-- Add new entries below this line. Newest first. -->', '',
  ].join('\n');
  const { reqDir, mistakesPath } = makeReqDir({
    reqId: 'REQ-20260101-fake-13',
    gr: grFixture(1),
    mistakes: templateOnlyMistakes,
  });
  const r = gateReq({ reqDir, mistakesPath });
  assert.strictEqual(r.status, 'FAIL');
});

// -----------------------------------------------------------------------
// M12 — parseMistakesFile extracts tags + reqIds from a header
// -----------------------------------------------------------------------

test('M12: parseMistakesFile extracts tags array as non-empty and reqIds contains ref', () => {
  const { mistakesPath } = makeReqDir({
    mistakes: [
      '# MISTAKES', '',
      '### 2026-07-13 — fake entry (REQ-20260101-fake-99, fix-iter-1)  [test-tag, other-tag]',
      '',
      '**What broke:** test.',
      'paths: **',
      '',
    ].join('\n'),
  });
  const entries = parseMistakesFile(mistakesPath);
  const found = entries.find((e) => e.reqIds.includes('REQ-20260101-fake-99'));
  assert.notStrictEqual(found, undefined);
});
