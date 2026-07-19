/**
 * frontmatter.test.mjs — unit tests for scripts/lib/frontmatter.mjs
 *
 * Run: node --test plugins/eng-org/scripts/lib/frontmatter.test.mjs
 * (from repo root), or:
 *       node --test scripts/lib/frontmatter.test.mjs
 * (from the plugin root).
 *
 * Test discipline (MISTAKES-informed):
 *   - One assertion per test() block (MISTAKES 2026-07-11 REQ-08).
 *   - Test title matches what the body asserts (MISTAKES 2026-07-08, 2026-07-10).
 *   - No ">= 0" under a "> 0" title (MISTAKES 2026-07-11 REQ-05).
 *   - No import outside Node stdlib (task constraint).
 *
 * Coverage: E1–E20 from tl-scripts-analysis.md edge-case table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  parseSections,
  getSection,
  parseFields,
} from './frontmatter.mjs';

// ---------------------------------------------------------------------------
// parseFrontmatter — E1–E12
// ---------------------------------------------------------------------------

// E1: empty string → {data:{}, body:""}
test('E1: parseFrontmatter("") → {data:{}, body:""}', () => {
  const result = parseFrontmatter('');
  assert.deepStrictEqual({ ...result.data }, {});
  assert.strictEqual(result.body, '');
});

// E2: body with no --- at all → data:{}, body=whole text
test('E2: parseFrontmatter with no --- → data:{}, body is the whole text', () => {
  const text = 'just a body\nno frontmatter here';
  const result = parseFrontmatter(text);
  assert.deepStrictEqual({ ...result.data }, {});
  assert.strictEqual(result.body, text);
});

// E3: happy path --- fm + body
test('E3: parseFrontmatter happy path parses key and returns body', () => {
  const text = '---\nk: v\n---\nbody line';
  const result = parseFrontmatter(text);
  assert.deepStrictEqual({ ...result.data }, { k: 'v' });
  assert.strictEqual(result.body, 'body line');
});

// E4: unterminated --- → treat as no frontmatter, do NOT swallow doc
test('E4: parseFrontmatter with unterminated --- → data:{}, body is whole text', () => {
  const text = '---\nk: v\nnobody closes this';
  const result = parseFrontmatter(text);
  assert.deepStrictEqual({ ...result.data }, {});
  assert.strictEqual(result.body, text);
});

// E5: empty frontmatter block
test('E5: parseFrontmatter empty frontmatter (---\\n---) → data:{}, body after', () => {
  const result = parseFrontmatter('---\n---\nbody');
  assert.deepStrictEqual({ ...result.data }, {});
  assert.strictEqual(result.body, 'body');
});

// E6: duplicate key → last wins
test('E6: parseFrontmatter duplicate key → last value wins', () => {
  const result = parseFrontmatter('---\na: 1\na: 2\n---\n');
  assert.strictEqual(result.data.a, 2);
});

// E7: CRLF line endings parsed identically to LF
test('E7: parseFrontmatter CRLF line endings → same result as LF', () => {
  const lf = parseFrontmatter('---\nk: v\n---\nbody');
  const crlf = parseFrontmatter('---\r\nk: v\r\n---\r\nbody');
  assert.deepStrictEqual(lf, crlf);
});

// E8: leading BOM → stripped, frontmatter recognized
test('E8: parseFrontmatter leading BOM is stripped and frontmatter is recognized', () => {
  const text = '﻿---\nk: v\n---\nbody';
  const result = parseFrontmatter(text);
  assert.deepStrictEqual({ ...result.data }, { k: 'v' });
});

// E9: tab-indented list item → tolerated, no throw
test('E9: parseFrontmatter tab-indented list item is tolerated without throwing', () => {
  const text = '---\nitems:\n\t- foo\n---\n';
  let threw = false;
  try { parseFrontmatter(text); } catch { threw = true; }
  assert.strictEqual(threw, false);
});

// E10: quoted value with # → # is NOT stripped inside quotes
test('E10: parseFrontmatter quoted value with # → # preserved inside quotes', () => {
  const result = parseFrontmatter('---\nk: "a # b"\n---\n');
  assert.strictEqual(result.data.k, 'a # b');
});

// E11: k: # only a comment → value is null
test('E11: parseFrontmatter "k: # comment only" → k is null', () => {
  const result = parseFrontmatter('---\nk: # only a comment\n---\n');
  assert.strictEqual(result.data.k, null);
});

// E12: bool/int/null coercion
test('E12: parseFrontmatter coerces true→bool, 3→number, null→null', () => {
  const result = parseFrontmatter('---\na: true\nb: 3\nc: null\n---\n');
  assert.deepStrictEqual({ ...result.data }, { a: true, b: 3, c: null });
});

// ---------------------------------------------------------------------------
// parseSections — E13–E16, E20
// ---------------------------------------------------------------------------

// E13: ## H inside a ``` fence is NOT a section
test('E13: parseSections — ## heading inside a code fence is not a section', () => {
  const text = '## Real\n```\n## Fake inside fence\n```\n';
  const sections = parseSections(text);
  // Only "Real" is a real section; "Fake inside fence" must not appear.
  const fakeSection = sections.find((s) => s.heading === 'Fake inside fence');
  assert.strictEqual(fakeSection, undefined);
});

// E14: two sections — order and bodies correct
test('E14: parseSections two sections preserves order and correct bodies', () => {
  const text = '## A\nbody A\n## B\nbody B\n';
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 2);
  assert.strictEqual(sections[0].heading, 'A');
  assert.strictEqual(sections[1].heading, 'B');
});

// E15: heading raw text and level
test('E15: parseSections returns raw heading text and correct level (level 3)', () => {
  const text = '### My Heading with **bold**\nsome body\n';
  const sections = parseSections(text);
  assert.deepStrictEqual(
    { heading: sections[0].heading, level: sections[0].level },
    { heading: 'My Heading with **bold**', level: 3 }
  );
});

// E16: heading with no body (immediately followed by next heading) → body:""
test('E16: parseSections heading immediately followed by next heading → body is empty string', () => {
  const text = '## A\n## B\nbody B\n';
  const sections = parseSections(text);
  assert.strictEqual(sections[0].body, '');
});

// E20: large input → no throw, linear (correctness check on big input)
test('E20: parseSections on 10 000-line input returns without throwing', () => {
  const lines = [];
  for (let i = 0; i < 1000; i++) {
    lines.push(`## Section ${i}`);
    for (let j = 0; j < 9; j++) {
      lines.push(`body line ${j}`);
    }
  }
  const text = lines.join('\n');
  let result;
  let threw = false;
  try { result = parseSections(text); } catch { threw = true; }
  assert.strictEqual(threw, false);
  assert.strictEqual(result.length, 1000);
});

// ---------------------------------------------------------------------------
// getSection / parseFields — E17–E19
// ---------------------------------------------------------------------------

// E17: malformed list → no throw
test('E17: parseFrontmatter malformed list (- with no field) → no throw', () => {
  const text = '---\nthings:\n  - \n---\n';
  let threw = false;
  try { parseFrontmatter(text); } catch { threw = true; }
  assert.strictEqual(threw, false);
});

// E18: getSection for absent heading → null
test('E18: getSection for absent heading returns null', () => {
  const text = '## Present\nbody\n';
  const result = getSection(text, 'Absent');
  assert.strictEqual(result, null);
});

// E19: getSection exact match — NOT a slug match
test('E19: getSection("## ratio.config.jsonc") matches exact string, not a slug', () => {
  const text = '## ratio.config.jsonc\nbody text\n';
  // Must find the exact heading string (not a slug like "ratioconfigjsonc")
  const result = getSection(text, 'ratio.config.jsonc');
  assert.strictEqual(typeof result, 'string');
  // Must NOT match a slug variant
  const slugResult = getSection(text, 'ratioconfigjsonc');
  assert.strictEqual(slugResult, null);
});

// ---------------------------------------------------------------------------
// parseFields — reuses scalar coercion
// ---------------------------------------------------------------------------

test('parseFields parses key: value pairs from a section body string', () => {
  const body = 'files_touched_max: 5\nallow_full_rewrite: false\nlabel: hello';
  const result = parseFields(body);
  assert.deepStrictEqual({ ...result }, {
    files_touched_max: 5,
    allow_full_rewrite: false,
    label: 'hello',
  });
});

test('parseFields on empty string returns empty object', () => {
  assert.deepStrictEqual({ ...parseFields('') }, {});
});

// ---------------------------------------------------------------------------
// Additional invariant guards
// ---------------------------------------------------------------------------

// Confirm HEADING_RE is used correctly: level-1 through level-6 are recognized
test('parseSections recognizes heading levels 1 through 6', () => {
  const text = '# L1\n## L2\n### L3\n#### L4\n##### L5\n###### L6\n';
  const sections = parseSections(text);
  assert.deepStrictEqual(
    sections.map((s) => s.level),
    [1, 2, 3, 4, 5, 6]
  );
});

// parseSections with whole text containing frontmatter: skips the fm block
test('parseSections on text with frontmatter skips the frontmatter --- block', () => {
  const text = '---\ntask: foo\n---\n## Real Section\nbody\n';
  const sections = parseSections(text);
  // Must have exactly 1 section; the --- lines must not appear as headings
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].heading, 'Real Section');
});

// parseSections preamble before first heading is dropped
test('parseSections drops preamble text before the first heading', () => {
  const text = 'This is preamble text.\n## First\nbody\n';
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].heading, 'First');
});

// getSection with level constraint
test('getSection with opts.level only matches at that level', () => {
  // body3 is the last section; trailing \n in the source produces a trailing empty
  // line in the joined body — the natural output of split+join with a trailing newline.
  const text = '## Target\nbody2\n### Target\nbody3';
  const result = getSection(text, 'Target', { level: 3 });
  assert.strictEqual(result, 'body3');
});

// parseFrontmatter: simple list with scalar items
test('parseFrontmatter list of scalar items → array of scalars', () => {
  const text = '---\ntags:\n  - alpha\n  - beta\n---\n';
  const result = parseFrontmatter(text);
  assert.deepStrictEqual(result.data.tags, ['alpha', 'beta']);
});

// parseFrontmatter: negative integer
test('parseFrontmatter bare negative integer → number', () => {
  const result = parseFrontmatter('---\noffset: -7\n---\n');
  assert.strictEqual(result.data.offset, -7);
});
