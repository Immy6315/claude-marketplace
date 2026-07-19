/**
 * trd-lint.unit-verify.test.mjs — independent unit-test file authored by test-unit agent.
 *
 * Run: node --test scripts/trd-lint.unit-verify.test.mjs
 *
 * Scope: covers branches NOT exercised by the dev's trd-lint.test.mjs:
 *   UV1  §5 with only N/A → sentinel NOT honored (§5 not in SENTINEL_ALLOWED)
 *   UV2  §5 empty body → detected as empty
 *   UV3  §5 with only TODO → detected as empty
 *   UV4  §5 with only HTML comment → detected as empty
 *   UV1b §1 with N/A → sentinel NOT honored (§1 not in SENTINEL_ALLOWED)
 *   UV4  §4 N/A sentinel honored (positive case; E5 covers §3 only)
 *   UV5  E1 with N/A body → sentinel NOT honored for E-sections
 *   UV6  E3 with N/A body → sentinel NOT honored for E-sections
 *   UV7  E4 with N/A body → FAIL expected (BUG: currently passes — see BUG-L2)
 *   UV8  All 3 E2 budget fields missing simultaneously → 3 findings
 *   UV9  Indented mermaid fence (leading whitespace) → detected
 *   UV10 CLI: no arguments → exit 1 with usage message
 *   UV11 CLI: unreadable file (EACCES) → exit 2 with permission-denied message
 *   UV12 §3 with 2 N/A lines (length>1 → general case → passes as real content)
 *   UV13 §5 with N/A AND real content → passes (the N/A rejection only fires on sole line)
 *
 * BUG-L2 (RED finding): E4 with N/A body incorrectly returns ok:true because parseSections
 * assigns the mermaid fence block (placed after E4) into E4's body. The fence content
 * (backtick lines + diagram text) satisfies isNonEmpty, masking the N/A-only body.
 * Test UV7 documents this bug. The linter under test must NOT be modified by this agent.
 *
 * Isolation approach: uses minTrd() builder — no '---' horizontal rule inside any section body,
 * mermaid fence placed AFTER all sections as the final block. This avoids the structural
 * contamination that the dev's buildBase() fixture exhibits (the '---' divider between §5 and
 * eng-org extensions ends up in §5's body, masking empty-§5 failures in that fixture).
 *
 * Node stdlib only. Zero external dependencies.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  lintTrd,
  RATIO_SECTIONS,
  EXT_SECTIONS,
} from './trd-lint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LINTER = path.resolve(__dirname, 'trd-lint.mjs');

// ---------------------------------------------------------------------------
// Isolation fixture builder — no structural contamination in any section body.
// Does NOT place '---' after §5 (which would end up in §5's body in parseSections).
// Mermaid fence is the very last block after all section content.
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid TRD with clean section body isolation.
 *
 * @param {{ [heading: string]: string | null }} [overrides]
 *   Keys are section headings (RATIO or EXT).
 *   String value → use as body content.
 *   null → omit the section entirely.
 * @returns {string}
 */
function minTrd(overrides = {}) {
  const defaults = {
    '1. What Are We Doing?': 'Real content for section one.',
    '2. How Are We Doing It?': 'Real content for section two.',
    '3. DB Schema (include ONLY when DB changes)': 'N/A — no DB changes in this REQ.',
    '4. API Contracts': 'N/A — no API contract changes in this REQ.',
    '5. Acceptance Criteria': 'Real content for section five.',
    'E1. Design Principles Applied': 'Real content for E1.',
    'E2. Blast Radius & Change Budget':
      'files_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false',
    'E3. File-by-File Change Map': 'Real content for E3.',
    'E4. Test-Tier Strategy': 'Real content for E4.',
  };
  const merged = { ...defaults, ...overrides };

  const lines = ['---', 'title: Test TRD', '---', ''];

  // Ratio sections §1–§5 — each immediately followed by the next section heading.
  // No '---' horizontal rule after §5.
  for (const h of RATIO_SECTIONS) {
    if (merged[h] === null) continue; // omit
    lines.push(`## ${h}`, '');
    if (typeof merged[h] === 'string') lines.push(merged[h]);
    lines.push('');
  }

  // Extension divider marker (as a level-2 heading so parseSections sees it as a section,
  // NOT as a horizontal rule in §5's body).
  lines.push('## eng-org extensions', '');

  // Extension sections E1–E4.
  for (const h of EXT_SECTIONS) {
    if (merged[h] === null) continue;
    lines.push(`## ${h}`, '');
    if (typeof merged[h] === 'string') lines.push(merged[h]);
    lines.push('');
  }

  // Mermaid fence comes last — will be captured in E4's body by parseSections.
  // UV7 documents the linter bug this creates for E4.
  lines.push('```mermaid', 'graph TD', 'A-->B', '```');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// UV1 — §5 body = "N/A — not applicable." → sentinel NOT honored for §5
// (Confirms symmetric behavior to E6 in dev's test for §2.)
// ---------------------------------------------------------------------------

test('UV1: §5 body = "N/A — not applicable." → finding (sentinel not allowed for §5)', () => {
  const { findings } = lintTrd(
    minTrd({ '5. Acceptance Criteria': 'N/A — not applicable.' }),
  );
  assert.ok(
    findings.some(
      (f) => f.includes('5. Acceptance Criteria') && f.includes('empty'),
    ),
    `Expected §5 empty finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// UV1b — §1 body = "N/A — not applicable." → sentinel NOT honored for §1
// ---------------------------------------------------------------------------

test('UV1b: §1 body = "N/A — not applicable." → finding (sentinel not allowed for §1)', () => {
  const { findings } = lintTrd(
    minTrd({ '1. What Are We Doing?': 'N/A — not applicable.' }),
  );
  assert.ok(
    findings.some(
      (f) => f.includes('1. What Are We Doing?') && f.includes('empty'),
    ),
    `Expected §1 empty finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// UV2 — §5 body is empty → detected as empty (isolated fixture, no --- in body)
// ---------------------------------------------------------------------------

test('UV2: §5 body empty → finding says present but empty (isolated fixture)', () => {
  const { findings } = lintTrd(
    minTrd({ '5. Acceptance Criteria': '' }),
  );
  assert.ok(
    findings.some(
      (f) => f.includes('5. Acceptance Criteria') && f.includes('empty'),
    ),
    `Expected §5 empty finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// UV3 — §5 body = "TODO" → treated as placeholder → detected as empty
// ---------------------------------------------------------------------------

test('UV3: §5 body = "TODO" → finding says present but empty', () => {
  const { findings } = lintTrd(
    minTrd({ '5. Acceptance Criteria': 'TODO' }),
  );
  assert.ok(
    findings.some(
      (f) => f.includes('5. Acceptance Criteria') && f.includes('empty'),
    ),
    `Expected §5 TODO→empty finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// UV4a — §5 body = "<!-- fill in -->" → HTML comment → treated as empty
// ---------------------------------------------------------------------------

test('UV4a: §5 body = "<!-- fill in -->" → finding says present but empty', () => {
  const { findings } = lintTrd(
    minTrd({ '5. Acceptance Criteria': '<!-- fill in -->' }),
  );
  assert.ok(
    findings.some(
      (f) => f.includes('5. Acceptance Criteria') && f.includes('empty'),
    ),
    `Expected §5 HTML-comment→empty finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// UV4b — §4 N/A sentinel honored (positive case; dev's E5 only covers §3)
// ---------------------------------------------------------------------------

test('UV4b: §4 body = "N/A — no API changes." → ok: true (sentinel allowed for §4)', () => {
  const { ok } = lintTrd(
    minTrd({ '4. API Contracts': 'N/A — no API changes in this REQ.' }),
  );
  assert.strictEqual(ok, true);
});

// ---------------------------------------------------------------------------
// UV5 — E1 with N/A body → sentinel NOT honored for E-sections
// ---------------------------------------------------------------------------

test('UV5: E1 body = "N/A" → finding says extension section present but empty', () => {
  const { findings } = lintTrd(
    minTrd({ 'E1. Design Principles Applied': 'N/A' }),
  );
  assert.ok(
    findings.some(
      (f) =>
        f.includes('E1. Design Principles Applied') && f.includes('empty'),
    ),
    `Expected E1 N/A→empty finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// UV6 — E3 with N/A body → sentinel NOT honored for E-sections
// ---------------------------------------------------------------------------

test('UV6: E3 body = "N/A" → finding says extension section present but empty', () => {
  const { findings } = lintTrd(
    minTrd({ 'E3. File-by-File Change Map': 'N/A' }),
  );
  assert.ok(
    findings.some(
      (f) =>
        f.includes('E3. File-by-File Change Map') && f.includes('empty'),
    ),
    `Expected E3 N/A→empty finding, got: ${findings.join('; ')}`,
  );
});

// ---------------------------------------------------------------------------
// UV7 — E4 with N/A body → sentinel NOT honored — EXPECTED FAIL (BUG-L2)
//
// BUG-L2: parseSections assigns the mermaid fence block (the last block in the
// document, placed after E4 in minTrd()) into E4's body. The fence content
// (```mermaid, graph TD, A-->B, ```) satisfies isNonEmpty, so lintTrd incorrectly
// returns ok:true when E4's authored content is only "N/A".
//
// Expected behavior: ok:false with finding for E4.
// Actual behavior:   ok:true  (linter bug — code under test is wrong).
//
// This test is written to the CORRECT expected behavior and WILL FAIL until the
// linter is fixed. It is recorded here to surface the bug.
// ---------------------------------------------------------------------------

test('UV7: E4 body = "N/A" → finding says extension section present but empty [BUG-L2: currently fails]', () => {
  const { findings } = lintTrd(
    minTrd({ 'E4. Test-Tier Strategy': 'N/A' }),
  );
  // BUG-L2: lintTrd returns ok:true (no finding) because the mermaid fence block
  // appended after E4 in the document is absorbed into E4's body by parseSections.
  // The fence lines are not placeholders, so isNonEmpty returns true, silencing the finding.
  assert.ok(
    findings.some(
      (f) =>
        f.includes('E4. Test-Tier Strategy') && f.includes('empty'),
    ),
    `Expected E4 N/A→empty finding, got: ${findings.join('; ')} — BUG-L2: mermaid fence absorbed into last section body`,
  );
});

// ---------------------------------------------------------------------------
// UV8 — E2 present but all 3 budget fields missing simultaneously
// ---------------------------------------------------------------------------

test('UV8: E2 present but all 3 budget fields absent → 3 findings naming each field', () => {
  const { findings } = lintTrd(
    minTrd({
      'E2. Blast Radius & Change Budget': 'No machine-parseable fields here.',
    }),
  );
  for (const field of ['files_touched_max', 'loc_max', 'allow_full_rewrite']) {
    assert.ok(
      findings.some((f) => f.includes(field)),
      `Expected finding for missing field '${field}', got: ${findings.join('; ')}`,
    );
  }
  // Confirm 3 budget-field findings (not fewer).
  const budgetFindings = findings.filter((f) => f.includes('E2 missing budget field'));
  assert.strictEqual(budgetFindings.length, 3, `Expected 3 budget-field findings, got ${budgetFindings.length}: ${budgetFindings.join('; ')}`);
});

// ---------------------------------------------------------------------------
// UV9 — Indented mermaid fence (leading whitespace) → detected by hasMermaidFence
// ---------------------------------------------------------------------------

test('UV9: mermaid fence with leading whitespace → ok: true (indented fence detected)', () => {
  // Replace the un-indented fence in minTrd() with an indented one.
  const base = minTrd();
  const indented = base.replace('```mermaid', '   ```mermaid');
  const { ok } = lintTrd(indented);
  assert.strictEqual(ok, true);
});

// ---------------------------------------------------------------------------
// UV12 — §3 with two N/A lines → sentinel NOT triggered (requires exactly 1 content line)
//         → treated as real content (2 lines → general case → ok: true)
// ---------------------------------------------------------------------------

test('UV12: §3 body has 2 N/A lines → general-case non-empty (sentinel requires exactly 1)', () => {
  const { ok } = lintTrd(
    minTrd({
      '3. DB Schema (include ONLY when DB changes)':
        'N/A — first line.\nN/A — second line.',
    }),
  );
  // 2 content lines → general case → true (documented sentinel behavior).
  assert.strictEqual(ok, true);
});

// ---------------------------------------------------------------------------
// UV13 — §5 body has N/A AND real content → not sole content line → ok: true
// ---------------------------------------------------------------------------

test('UV13: §5 body has "N/A — note." AND a real content line → ok: true (N/A not sole line)', () => {
  const { ok } = lintTrd(
    minTrd({
      '5. Acceptance Criteria':
        'N/A — provisional.\n- [ ] Real criterion here.',
    }),
  );
  // contentLines = ['N/A — provisional.', '- [ ] Real criterion here.'] → length=2 → true.
  assert.strictEqual(ok, true);
});

// ---------------------------------------------------------------------------
// CLI tier — UV10: no arguments → exit 1, stderr has usage
// ---------------------------------------------------------------------------

test('CLI UV10: no arguments → exit 1 with usage message', () => {
  const result = spawnSync(process.execPath, [LINTER], { encoding: 'utf8' });
  assert.strictEqual(
    result.status,
    1,
    `Expected exit 1 (no-args), got ${result.status}: ${result.stderr}`,
  );
  assert.ok(
    result.stderr.includes('Usage') || result.stderr.includes('trd-lint'),
    `Expected usage message in stderr, got: ${result.stderr}`,
  );
});

// ---------------------------------------------------------------------------
// CLI tier — UV11: unreadable file (EACCES) → exit 2, stderr mentions "permission"
// ---------------------------------------------------------------------------

test('CLI UV11: unreadable file (EACCES) → exit 2 with permission-denied message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trd-lint-verify-'));
  try {
    const filePath = join(dir, 'locked.md');
    writeFileSync(filePath, '# dummy', 'utf8');
    chmodSync(filePath, 0o000);
    const result = spawnSync(process.execPath, [LINTER, filePath], {
      encoding: 'utf8',
    });
    assert.strictEqual(
      result.status,
      2,
      `Expected exit 2 (EACCES), got ${result.status}: ${result.stderr}`,
    );
    assert.ok(
      result.stderr.includes('permission') || result.stderr.includes('trd-lint'),
      `Expected permission-denied message in stderr, got: ${result.stderr}`,
    );
  } finally {
    // Restore permissions so rmSync can clean up.
    try {
      const filePath = join(dir, 'locked.md');
      chmodSync(filePath, 0o644);
    } catch (_) {
      // ignore
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
