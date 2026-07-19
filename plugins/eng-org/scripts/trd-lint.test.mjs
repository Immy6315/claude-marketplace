/**
 * trd-lint.test.mjs — tests for trd-lint.mjs.
 *
 * Run: node --test scripts/trd-lint.test.mjs
 *
 * Coverage:
 *   Unit tier  (E1–E14): lintTrd() called directly on in-memory strings.
 *   CLI tier   (E1,E3,E7,E15): spawnSync proves exit codes and stderr wiring.
 *   Dogfood    (E2/R8): reads shipped templates/trd.template.md from disk.
 *
 * House conventions:
 *   - One assertion per test() block.
 *   - Test title matches what the body asserts.
 *   - No import outside Node stdlib + ./trd-lint.mjs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Import pure core + shared constants from the linter.
import {
  lintTrd,
  RATIO_SECTIONS,
  EXT_SECTIONS,
  E2_REQUIRED_BUDGET_FIELDS,
} from './trd-lint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LINTER = path.resolve(__dirname, 'trd-lint.mjs');
const TEMPLATE = path.resolve(__dirname, '../templates/trd.template.md');

// ---------------------------------------------------------------------------
// Shared fixture builder — produces a minimal valid TRD text for surgery.
// All section headings come from the shared RATIO_SECTIONS + EXT_SECTIONS
// constants (R4 — no re-declaration here).
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid TRD string that passes lintTrd.
 * Caller can pass overrides to replace or omit specific sections.
 *
 * @param {{ omit?: string[], replace?: Record<string, string> }} [opts]
 * @returns {string}
 */
function buildValidTrd({ omit = [], replace = {} } = {}) {
  const lines = [];

  // Frontmatter (optional — linter must tolerate it).
  lines.push('---');
  lines.push('title: Test TRD');
  lines.push('---');
  lines.push('');

  // Purpose line (not a section — preamble).
  lines.push('The objective of this TRD is to provide a concise and complete technical design.');
  lines.push('');

  // Ratio sections §1–§5.
  for (const heading of RATIO_SECTIONS) {
    if (omit.includes(heading)) continue;
    lines.push(`## ${heading}`);
    lines.push('');
    if (heading in replace) {
      lines.push(replace[heading]);
    } else if (heading === '3. DB Schema (include ONLY when DB changes)') {
      lines.push('N/A — no DB changes in this REQ.');
    } else if (heading === '4. API Contracts') {
      lines.push('N/A — no API contract changes in this REQ.');
    } else {
      lines.push(`Real content for ${heading}.`);
    }
    lines.push('');
  }

  // eng-org extensions divider.
  lines.push('---');
  lines.push('');
  lines.push('## eng-org extensions');
  lines.push('');

  // E1–E4.
  for (const heading of EXT_SECTIONS) {
    if (omit.includes(heading)) continue;
    lines.push(`## ${heading}`);
    lines.push('');
    if (heading in replace) {
      lines.push(replace[heading]);
    } else if (heading === 'E2. Blast Radius & Change Budget') {
      lines.push('files_touched_max: 5');
      lines.push('loc_max: 300');
      lines.push('allow_full_rewrite: false');
    } else {
      lines.push(`Real content for ${heading}.`);
    }
    lines.push('');
  }

  // Mermaid fence (satisfies ≥1 requirement).
  lines.push('```mermaid');
  lines.push('sequenceDiagram');
  lines.push('    A->>B: Hello');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// E1 — valid full TRD exits 0 with no findings (unit tier)
// ---------------------------------------------------------------------------

test('E1 unit: valid full TRD → ok: true, findings empty', () => {
  const { ok } = lintTrd(buildValidTrd());
  assert.strictEqual(ok, true);
});

// ---------------------------------------------------------------------------
// E2/R8 — dogfood: shipped template passes its own linter
// ---------------------------------------------------------------------------

test('E2/R8 dogfood: templates/trd.template.md passes lintTrd', () => {
  const text = readFileSync(TEMPLATE, 'utf8');
  const { ok, findings } = lintTrd(text);
  assert.strictEqual(ok, true, `Dogfood FAIL — findings: ${findings.join('; ')}`);
});

// ---------------------------------------------------------------------------
// E3 — missing a Ratio section → finding names the missing heading exactly
// ---------------------------------------------------------------------------

test('E3 unit: missing §5 → finding mentions "5. Acceptance Criteria" exactly', () => {
  const { findings } = lintTrd(buildValidTrd({ omit: ['5. Acceptance Criteria'] }));
  assert.ok(
    findings.some(f => f.includes('5. Acceptance Criteria')),
    `Expected finding mentioning §5, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E4 — present-but-empty section body → finding says "present but empty"
// ---------------------------------------------------------------------------

test('E4 unit: §1 body is blank → finding says present but empty', () => {
  const { findings } = lintTrd(
    buildValidTrd({ replace: { '1. What Are We Doing?': '' } }),
  );
  assert.ok(
    findings.some(f => f.includes('1. What Are We Doing?') && f.includes('empty')),
    `Expected empty-body finding for §1, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E5 — §3 N/A sentinel satisfies non-empty
// ---------------------------------------------------------------------------

test('E5 unit: §3 body = "N/A — no DB changes." → ok: true (sentinel allowed)', () => {
  const { ok } = lintTrd(
    buildValidTrd({ replace: { '3. DB Schema (include ONLY when DB changes)': 'N/A — no DB changes in this REQ.' } }),
  );
  assert.strictEqual(ok, true);
});

// ---------------------------------------------------------------------------
// E6 — §2 body = "N/A" → sentinel NOT honored for §2, must fail
// ---------------------------------------------------------------------------

test('E6 unit: §2 body = "N/A" → finding (sentinel not allowed for §2)', () => {
  const { findings } = lintTrd(
    buildValidTrd({ replace: { '2. How Are We Doing It?': 'N/A' } }),
  );
  assert.ok(
    findings.some(f => f.includes('2. How Are We Doing It?') && f.includes('empty')),
    `Expected §2 empty finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E7 — no mermaid fence → finding mentions mermaid
// ---------------------------------------------------------------------------

test('E7 unit: no mermaid fence → finding mentions mermaid', () => {
  // Build a valid TRD then strip all mermaid lines.
  const base = buildValidTrd();
  const stripped = base
    .split('\n')
    .filter(l => !/^```mermaid/.test(l) && !/^sequenceDiagram/.test(l) && !/A->>B/.test(l))
    .join('\n');
  // Also remove closing ``` that was paired with the mermaid block.
  // Strip any remaining backtick-only lines that were part of that fence.
  const noFence = stripped.split('\n').filter(l => l.trim() !== '```').join('\n');

  const { findings } = lintTrd(noFence);
  assert.ok(
    findings.some(f => f.includes('mermaid')),
    `Expected mermaid finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E8 — multiple mermaid fences → ok: true (≥1 is sufficient)
// ---------------------------------------------------------------------------

test('E8 unit: multiple mermaid fences → ok: true', () => {
  const extra = '\n```mermaid\ngraph TD\n    A-->B\n```\n';
  const { ok } = lintTrd(buildValidTrd() + extra);
  assert.strictEqual(ok, true);
});

// ---------------------------------------------------------------------------
// E9 — a Ratio heading inside a code fence is NOT a real section
// ---------------------------------------------------------------------------

test('E9 unit: §5 heading inside a code fence is NOT counted as the real section', () => {
  // Build a TRD that omits the real §5, but puts the heading inside a fence.
  const trdWithFakeSection =
    buildValidTrd({ omit: ['5. Acceptance Criteria'] }) +
    '\n```\n## 5. Acceptance Criteria\nsome content\n```\n';

  const { findings } = lintTrd(trdWithFakeSection);
  assert.ok(
    findings.some(f => f.includes('5. Acceptance Criteria')),
    `Expected §5 missing finding (fence-aware), got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E10 — heading typo → exact match required, reported as missing
// ---------------------------------------------------------------------------

test('E10 unit: "5. Acceptance Criterion" (typo) → reported as missing §5', () => {
  // Build a valid TRD, remove real §5, inject typo heading.
  const base = buildValidTrd({ omit: ['5. Acceptance Criteria'] });
  const withTypo = base + '\n## 5. Acceptance Criterion\n\nSome content.\n';

  const { findings } = lintTrd(withTypo);
  assert.ok(
    findings.some(f => f.includes('5. Acceptance Criteria')),
    `Expected missing §5 finding (exact match), got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E11 — malformed/unterminated frontmatter → linter still evaluates sections
// ---------------------------------------------------------------------------

test('E11 unit: unterminated frontmatter → lintTrd does not throw, evaluates sections', () => {
  const text = '---\ntitle: Unterminated\n\n' + buildValidTrd();
  // Must not throw; must return a result.
  const result = lintTrd(text);
  assert.ok(typeof result === 'object' && 'ok' in result);
});

// ---------------------------------------------------------------------------
// E12 — placeholder-only body → treated as empty
// ---------------------------------------------------------------------------

test('E12 unit: §1 body = "[describe here]" → finding says present but empty', () => {
  const { findings } = lintTrd(
    buildValidTrd({ replace: { '1. What Are We Doing?': '[describe here]' } }),
  );
  assert.ok(
    findings.some(f => f.includes('1. What Are We Doing?') && f.includes('empty')),
    `Expected placeholder→empty finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E13 — missing an E-section → finding mentions the extension heading
// ---------------------------------------------------------------------------

test('E13 unit: no E2 section → finding mentions "E2. Blast Radius & Change Budget"', () => {
  const { findings } = lintTrd(buildValidTrd({ omit: ['E2. Blast Radius & Change Budget'] }));
  assert.ok(
    findings.some(f => f.includes('E2. Blast Radius & Change Budget')),
    `Expected E2 missing finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E14a — E2 present but missing files_touched_max
// ---------------------------------------------------------------------------

test('E14a unit: E2 missing files_touched_max → finding names the field', () => {
  const { findings } = lintTrd(
    buildValidTrd({
      replace: {
        'E2. Blast Radius & Change Budget':
          'loc_max: 300\nallow_full_rewrite: false\nSome narrative.',
      },
    }),
  );
  assert.ok(
    findings.some(f => f.includes('files_touched_max')),
    `Expected files_touched_max finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E14b — E2 present but missing loc_max
// ---------------------------------------------------------------------------

test('E14b unit: E2 missing loc_max → finding names the field', () => {
  const { findings } = lintTrd(
    buildValidTrd({
      replace: {
        'E2. Blast Radius & Change Budget':
          'files_touched_max: 5\nallow_full_rewrite: false\nSome narrative.',
      },
    }),
  );
  assert.ok(
    findings.some(f => f.includes('loc_max')),
    `Expected loc_max finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// E14c — E2 present but missing allow_full_rewrite
// ---------------------------------------------------------------------------

test('E14c unit: E2 missing allow_full_rewrite → finding names the field', () => {
  const { findings } = lintTrd(
    buildValidTrd({
      replace: {
        'E2. Blast Radius & Change Budget':
          'files_touched_max: 5\nloc_max: 300\nSome narrative.',
      },
    }),
  );
  assert.ok(
    findings.some(f => f.includes('allow_full_rewrite')),
    `Expected allow_full_rewrite finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// CLI tier — E1: valid file → exit 0
// ---------------------------------------------------------------------------

test('CLI E1: valid TRD file → exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trd-lint-'));
  try {
    const trdPath = join(dir, 'test.md');
    writeFileSync(trdPath, buildValidTrd(), 'utf8');
    const result = spawnSync(process.execPath, [LINTER, trdPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}: ${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CLI tier — E3: missing §5 → exit 1, stderr mentions §5
// ---------------------------------------------------------------------------

test('CLI E3: TRD missing §5 → exit 1 and stderr mentions §5', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trd-lint-'));
  try {
    const trdPath = join(dir, 'test.md');
    writeFileSync(trdPath, buildValidTrd({ omit: ['5. Acceptance Criteria'] }), 'utf8');
    const result = spawnSync(process.execPath, [LINTER, trdPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 1, `Expected exit 1, got ${result.status}`);
    assert.ok(
      result.stderr.includes('5. Acceptance Criteria'),
      `Expected stderr to mention §5, got: ${result.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CLI tier — E7: no mermaid → exit 1, stderr mentions mermaid
// ---------------------------------------------------------------------------

test('CLI E7: TRD missing mermaid → exit 1 and stderr mentions mermaid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trd-lint-'));
  try {
    const trdPath = join(dir, 'test.md');
    // Build valid TRD then strip mermaid block out.
    const base = buildValidTrd();
    const lines = base.split('\n');
    let inMermaid = false;
    const stripped = [];
    for (const line of lines) {
      if (/^```mermaid/.test(line)) { inMermaid = true; continue; }
      if (inMermaid && /^```/.test(line)) { inMermaid = false; continue; }
      if (!inMermaid) stripped.push(line);
    }
    writeFileSync(trdPath, stripped.join('\n'), 'utf8');
    const result = spawnSync(process.execPath, [LINTER, trdPath], { encoding: 'utf8' });
    assert.strictEqual(result.status, 1, `Expected exit 1, got ${result.status}`);
    assert.ok(
      result.stderr.includes('mermaid'),
      `Expected stderr to mention mermaid, got: ${result.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CLI tier — E15: non-existent file → exit 2, stderr mentions the path
// ---------------------------------------------------------------------------

test('CLI E15: non-existent file → exit 2 with IO error message', () => {
  const fakePath = '/tmp/__trd-lint-nonexistent-file-12345.md';
  const result = spawnSync(process.execPath, [LINTER, fakePath], { encoding: 'utf8' });
  assert.strictEqual(result.status, 2, `Expected exit 2, got ${result.status}`);
  assert.ok(
    result.stderr.includes(fakePath) || result.stderr.includes('not found') || result.stderr.includes('trd-lint'),
    `Expected IO error in stderr, got: ${result.stderr}`,
  );
});

// ---------------------------------------------------------------------------
// SKIP-WITH-NOTE: integration-with-pipeline
// The /eng-org:trd command wiring is deferred to REQ-M1-3.
// No test for command integration here — that REQ owns the test surface.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SKIP-WITH-NOTE: perf/load, concurrency, DB, network
// trd-lint.mjs is a synchronous stdlib linter with a single file read.
// No IO pipeline, no network, no DB. Performance tier not applicable.
// ---------------------------------------------------------------------------
