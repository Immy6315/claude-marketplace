/**
 * frontmatter.integration.test.mjs — integration tests for frontmatter.mjs
 *
 * Author: test-integration agent (independent of dev and test-unit authors).
 * Purpose: consumer-perspective scenarios — realistic multi-section documents
 *   that the THREE future consumers will actually pass to the module:
 *     1. trd-lint  → TRD-shaped doc (Ratio 5 sections + mermaid fence)
 *     2. design-lint → DESIGN_PRINCIPLES-shaped doc (many ## sections)
 *     3. scope-explosion-guard → budget-block doc (E2-style fields)
 *
 * Run: node --test scripts/lib/frontmatter.integration.test.mjs  (from plugin root)
 *
 * G-7 contract-diff: N/A — this REQ touches NO backend API surface (pure ESM
 * lib, no HTTP endpoints, no DB, no event bus). No contract-diff snapshot required.
 *
 * Harness: node:test + node:assert/strict — zero external deps.
 * Node v20 target. One assertion per test block (MISTAKES 2026-07-11 discipline).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  parseSections,
  getSection,
  parseFields,
} from './frontmatter.mjs';

// ============================================================================
// Shared realistic fixtures
// ============================================================================

/**
 * TRD-shaped document.
 *
 * Mimics what trd-lint will receive: frontmatter + Ratio 5 sections + a mermaid
 * fenced block whose interior contains a line that LOOKS like a heading.  The
 * critical invariant: parseSections MUST NOT split inside the fence.
 */
const TRD_DOC = `---
req_id: REQ-20260718-d904-01
status: approved
priority: high
loc_max: 300
---

## 1 What Are We Doing?
We are adding a shared frontmatter parser to the eng-org plugin scripts.

The rationale is eliminating copy-paste drift across 4 inline parsers.

\`\`\`mermaid
graph TD
  A --> B
  ## This looks like a heading but is inside the fence
  B --> C
\`\`\`

More prose after the fence.

## 2 Why Are We Doing It?
Rule-of-three was met: verdict-lint, mistakes-gate, and the upcoming trd-lint
all need the same parsing logic.

## 3 How Are We Doing It?
Write \`frontmatter.mjs\` as a pure ESM module exporting four named functions.
No third-party deps. Node stdlib only.

\`\`\`mermaid
sequenceDiagram
  ## Another fake heading inside second fence
  caller->>parser: parseSections(text)
  parser-->>caller: [{heading, level, body}]
\`\`\`

## 4 Risks & Mitigations
- R1: scope creep into the 4 existing consumers — mitigated by grep-proof gate.
- R2: hand-rolled YAML subset too narrow — mitigated by explicit unsupported list.

## 5 Acceptance Criteria
- parseFrontmatter, parseSections, getSection, parseFields all exported.
- All E1–E20 edge cases pass.
- Zero external dependencies.
`;

/**
 * DESIGN_PRINCIPLES-shaped document.
 *
 * Mimics what design-lint will receive: many level-2 sections, each named for
 * a design principle.  Some sections contain key: value fields in their body.
 */
const DESIGN_PRINCIPLES_DOC = `---
doc_type: design_principles
version: 2
---

## Fail Tolerant Never Throw
Parsers must return empty/partial shapes on garbage input.
rationale: downstream lints must emit FAIL, not crash

## Single Responsibility
Each module does ONE thing.
enforced_by: reviewer-architecture

## No External Dependencies
Pure stdlib. Zero third-party packages.
rationale: reduces supply-chain attack surface
enforced: true

## DRY — Declare Once
Constants, regexes, coercion logic declared once and imported.
rationale: prevents byte-identical re-declaration drift across sibling files
example: HEADING_RE lives only in frontmatter.mjs

## Fence Aware
Heading detection must not fire inside code fences.
rationale: MISTAKES 2026-07-13 — fake headings inside mermaid blocks caused splits
`;

/**
 * Budget-block document (scope-explosion-guard E2 style).
 *
 * The guard calls getSection(text, 'Budget') and then parseFields on the body.
 * Fields include integer, boolean-false, and string values — coercion matters.
 */
const BUDGET_DOC = `---
req_id: REQ-EXAMPLE
---

## Overview
This REQ adds the shared parser lib.

## Budget
files_touched_max: 5
loc_max: 200
allow_full_rewrite: false
owner: tl-scripts
notes: "keep it minimal # this hash is inside quotes"

## Implementation Notes
Nothing special here.
`;

// ============================================================================
// SCENARIO A — trd-lint consumer: TRD-shaped document
// ============================================================================

test('INT-A1: TRD doc — parseFrontmatter extracts req_id correctly', () => {
  const { data } = parseFrontmatter(TRD_DOC);
  assert.strictEqual(data.req_id, 'REQ-20260718-d904-01');
});

test('INT-A2: TRD doc — parseFrontmatter extracts status as string', () => {
  const { data } = parseFrontmatter(TRD_DOC);
  assert.strictEqual(data.status, 'approved');
});

test('INT-A3: TRD doc — parseFrontmatter coerces loc_max to number', () => {
  const { data } = parseFrontmatter(TRD_DOC);
  assert.strictEqual(data.loc_max, 300);
});

test('INT-A4: TRD doc — parseSections returns exactly 5 sections (the Ratio 5)', () => {
  const { body } = parseFrontmatter(TRD_DOC);
  const sections = parseSections(body);
  assert.strictEqual(sections.length, 5);
});

test('INT-A5: TRD doc — first section heading is verbatim "1 What Are We Doing?"', () => {
  const { body } = parseFrontmatter(TRD_DOC);
  const sections = parseSections(body);
  assert.strictEqual(sections[0].heading, '1 What Are We Doing?');
});

test('INT-A6: TRD doc — all 5 section headings are level 2', () => {
  const { body } = parseFrontmatter(TRD_DOC);
  const sections = parseSections(body);
  const levels = sections.map((s) => s.level);
  assert.deepStrictEqual(levels, [2, 2, 2, 2, 2]);
});

test('INT-A7: TRD doc — parseSections does NOT create a section for "## This looks like a heading but is inside the fence"', () => {
  const { body } = parseFrontmatter(TRD_DOC);
  const sections = parseSections(body);
  const fakeHeading = sections.find(
    (s) => s.heading === 'This looks like a heading but is inside the fence'
  );
  assert.strictEqual(fakeHeading, undefined);
});

test('INT-A8: TRD doc — parseSections does NOT create a section for "## Another fake heading inside second fence"', () => {
  const { body } = parseFrontmatter(TRD_DOC);
  const sections = parseSections(body);
  const fakeHeading = sections.find(
    (s) => s.heading === 'Another fake heading inside second fence'
  );
  assert.strictEqual(fakeHeading, undefined);
});

test('INT-A9: TRD doc — section "5 Acceptance Criteria" body contains expected text', () => {
  const { body } = parseFrontmatter(TRD_DOC);
  const acBody = getSection(body, '5 Acceptance Criteria');
  assert.ok(
    typeof acBody === 'string' && acBody.includes('parseFrontmatter'),
    `Expected AC body to contain "parseFrontmatter", got: ${acBody}`
  );
});

test('INT-A10: TRD doc — mermaid fence content is present in section body (fence lines not dropped)', () => {
  // Section "1 What Are We Doing?" must contain the mermaid fence block in its body
  const { body } = parseFrontmatter(TRD_DOC);
  const sec1Body = getSection(body, '1 What Are We Doing?');
  assert.ok(
    typeof sec1Body === 'string' && sec1Body.includes('mermaid'),
    `Expected section 1 body to contain mermaid fence, got: ${sec1Body}`
  );
});

test('INT-A11: TRD doc — parseSections on WHOLE text (with frontmatter) still yields 5 sections', () => {
  // trd-lint may call parseSections on the whole text without splitting frontmatter first
  const sections = parseSections(TRD_DOC);
  assert.strictEqual(sections.length, 5);
});

// ============================================================================
// SCENARIO B — design-lint consumer: DESIGN_PRINCIPLES-shaped document
// ============================================================================

test('INT-B1: DESIGN doc — parseFrontmatter extracts doc_type correctly', () => {
  const { data } = parseFrontmatter(DESIGN_PRINCIPLES_DOC);
  assert.strictEqual(data.doc_type, 'design_principles');
});

test('INT-B2: DESIGN doc — parseFrontmatter coerces version to number', () => {
  const { data } = parseFrontmatter(DESIGN_PRINCIPLES_DOC);
  assert.strictEqual(data.version, 2);
});

test('INT-B3: DESIGN doc — parseSections finds 5 principle sections', () => {
  const { body } = parseFrontmatter(DESIGN_PRINCIPLES_DOC);
  const sections = parseSections(body);
  assert.strictEqual(sections.length, 5);
});

test('INT-B4: DESIGN doc — getSection retrieves "No External Dependencies" by exact heading', () => {
  const { body } = parseFrontmatter(DESIGN_PRINCIPLES_DOC);
  const result = getSection(body, 'No External Dependencies');
  assert.ok(
    typeof result === 'string',
    `Expected string body for "No External Dependencies", got: ${result}`
  );
});

test('INT-B5: DESIGN doc — getSection for "No External Dependencies" body contains rationale field', () => {
  const { body } = parseFrontmatter(DESIGN_PRINCIPLES_DOC);
  const sectionBody = getSection(body, 'No External Dependencies');
  assert.ok(
    typeof sectionBody === 'string' && sectionBody.includes('rationale'),
    `Expected body to contain "rationale", got: ${sectionBody}`
  );
});

test('INT-B6: DESIGN doc — parseFields on "No External Dependencies" body returns enforced as boolean true', () => {
  const { body } = parseFrontmatter(DESIGN_PRINCIPLES_DOC);
  const sectionBody = getSection(body, 'No External Dependencies');
  const fields = parseFields(sectionBody);
  assert.strictEqual(fields.enforced, true);
});

test('INT-B7: DESIGN doc — getSection with wrong slug "nodependencies" returns null (exact match only)', () => {
  const { body } = parseFrontmatter(DESIGN_PRINCIPLES_DOC);
  const result = getSection(body, 'nodependencies');
  assert.strictEqual(result, null);
});

test('INT-B8: DESIGN doc — getSection retrieves "DRY — Declare Once" verbatim (special chars)', () => {
  const { body } = parseFrontmatter(DESIGN_PRINCIPLES_DOC);
  const result = getSection(body, 'DRY — Declare Once');
  assert.ok(
    typeof result === 'string',
    `Expected string for "DRY — Declare Once", got: ${result}`
  );
});

test('INT-B9: DESIGN doc — parseFields on "Single Responsibility" body extracts enforced_by as string', () => {
  const { body } = parseFrontmatter(DESIGN_PRINCIPLES_DOC);
  const sectionBody = getSection(body, 'Single Responsibility');
  const fields = parseFields(sectionBody);
  assert.strictEqual(fields.enforced_by, 'reviewer-architecture');
});

// ============================================================================
// SCENARIO C — scope-explosion-guard consumer: budget-block document
// ============================================================================

test('INT-C1: BUDGET doc — getSection retrieves "Budget" section', () => {
  const { body } = parseFrontmatter(BUDGET_DOC);
  const budgetBody = getSection(body, 'Budget');
  assert.ok(
    typeof budgetBody === 'string',
    `Expected string for Budget section, got: ${budgetBody}`
  );
});

test('INT-C2: BUDGET doc — parseFields on Budget body coerces files_touched_max to number 5', () => {
  const { body } = parseFrontmatter(BUDGET_DOC);
  const budgetBody = getSection(body, 'Budget');
  const fields = parseFields(budgetBody);
  assert.strictEqual(fields.files_touched_max, 5);
});

test('INT-C3: BUDGET doc — parseFields on Budget body coerces loc_max to number 200', () => {
  const { body } = parseFrontmatter(BUDGET_DOC);
  const budgetBody = getSection(body, 'Budget');
  const fields = parseFields(budgetBody);
  assert.strictEqual(fields.loc_max, 200);
});

test('INT-C4: BUDGET doc — parseFields coerces allow_full_rewrite to boolean false', () => {
  const { body } = parseFrontmatter(BUDGET_DOC);
  const budgetBody = getSection(body, 'Budget');
  const fields = parseFields(budgetBody);
  assert.strictEqual(fields.allow_full_rewrite, false);
});

test('INT-C5: BUDGET doc — parseFields owner returns as string "tl-scripts"', () => {
  const { body } = parseFrontmatter(BUDGET_DOC);
  const budgetBody = getSection(body, 'Budget');
  const fields = parseFields(budgetBody);
  assert.strictEqual(fields.owner, 'tl-scripts');
});

test('INT-C6: BUDGET doc — parseFields notes preserves # inside double-quoted string', () => {
  const { body } = parseFrontmatter(BUDGET_DOC);
  const budgetBody = getSection(body, 'Budget');
  const fields = parseFields(budgetBody);
  // The value is "keep it minimal # this hash is inside quotes" — # must NOT be stripped
  assert.ok(
    typeof fields.notes === 'string' && fields.notes.includes('#'),
    `Expected notes to contain '#', got: ${fields.notes}`
  );
});

test('INT-C7: BUDGET doc — getSection for absent section "Missing" returns null', () => {
  const { body } = parseFrontmatter(BUDGET_DOC);
  const result = getSection(body, 'Missing');
  assert.strictEqual(result, null);
});

test('INT-C8: BUDGET doc — parseSections returns 3 sections total (Overview, Budget, Implementation Notes)', () => {
  const { body } = parseFrontmatter(BUDGET_DOC);
  const sections = parseSections(body);
  assert.strictEqual(sections.length, 3);
});

// ============================================================================
// SCENARIO D — module boundary: named export shape
// ============================================================================

test('INT-D1: module exports parseFrontmatter as a function', () => {
  assert.strictEqual(typeof parseFrontmatter, 'function');
});

test('INT-D2: module exports parseSections as a function', () => {
  assert.strictEqual(typeof parseSections, 'function');
});

test('INT-D3: module exports getSection as a function', () => {
  assert.strictEqual(typeof getSection, 'function');
});

test('INT-D4: module exports parseFields as a function', () => {
  assert.strictEqual(typeof parseFields, 'function');
});

test('INT-D5: all four exports are synchronous (return non-Promise)', () => {
  const fm = parseFrontmatter('## hi');
  const ps = parseSections('## hi');
  const gs = getSection('## hi', 'hi');
  const pf = parseFields('k: 1');
  // None of these should be a Promise
  assert.ok(!(fm instanceof Promise), 'parseFrontmatter must be synchronous');
  assert.ok(!(ps instanceof Promise), 'parseSections must be synchronous');
  assert.ok(!(gs instanceof Promise), 'getSection must be synchronous');
  assert.ok(!(pf instanceof Promise), 'parseFields must be synchronous');
});
