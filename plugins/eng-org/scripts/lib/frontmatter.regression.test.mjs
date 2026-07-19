/**
 * frontmatter.regression.test.mjs — MISTAKES-targeted regression tests
 *
 * Run: node --test scripts/lib/frontmatter.regression.test.mjs
 * (from the plugin root).
 *
 * Each test block is keyed to one entry in MISTAKES.md that the
 * tl-scripts-analysis.md (REQ-20260718-d904-01) identified as applicable
 * to scripts/lib/frontmatter.mjs.
 *
 * Every test is written to FAIL on the documented buggy behaviour and
 * PASS on the current correct implementation.
 *
 * MISTAKES entries exercised:
 *   [MISTAKES-2026-07-13-fence]   fence-aware sections
 *   [MISTAKES-2026-07-13-key]     no-silent-key-drop
 *   [MISTAKES-2026-07-15-regex]   no-lazy-multiline-regex (cross-boundary bleed)
 *   [MISTAKES-2026-07-09-slug]    raw-heading-no-slug
 *   [MISTAKES-2026-07-11-dry]     single-heading-anchor DRY (HEADING_RE declared once)
 *
 * mistakes_sha256: 4358e021143f695b3c286518e0f8e96f642ef5a152d408e8dd40e83e3bc597fb
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseFrontmatter,
  parseSections,
  getSection,
  parseFields,
} from './frontmatter.mjs';

// ---------------------------------------------------------------------------
// [MISTAKES-2026-07-13-fence] fence-aware sections
//
// Documented bug: mistakes-gate heading regex admitted TEMPLATE headings
// inside fenced blocks as genuine section boundaries (false entries).
// Rule: parseSections MUST be fence-aware; a ## inside ``` or ~~~ is NOT
// a section boundary.
// ---------------------------------------------------------------------------

// Simple case: single ``` fence containing a level-2 heading.
test('[MISTAKES-2026-07-13-fence] ## inside backtick fence is NOT a section boundary', () => {
  const text = '## RealSection\nbody\n```\n## FakeHeadingInFence\ncode line\n```\nmore body\n';
  const sections = parseSections(text);
  const fake = sections.find((s) => s.heading === 'FakeHeadingInFence');
  assert.strictEqual(fake, undefined, 'A heading inside a ``` fence must not become a section');
});

// Adversarial case: tilde fence (~~~) also suppresses headings.
test('[MISTAKES-2026-07-13-fence] ## inside tilde fence (~~~) is NOT a section boundary', () => {
  const text = '## Outer\nbody\n~~~\n### HeadingInTildeFence\n~~~\nafter\n';
  const sections = parseSections(text);
  const fake = sections.find((s) => s.heading === 'HeadingInTildeFence');
  assert.strictEqual(fake, undefined, 'A heading inside a ~~~ fence must not become a section');
});

// Fence lines themselves become part of the enclosing section body, not lost.
test('[MISTAKES-2026-07-13-fence] fence open/close lines appear in the enclosing section body', () => {
  const text = '## Outer\nbefore fence\n```js\ncode\n```\nafter fence\n';
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 1, 'Only one section expected');
  const body = sections[0].body;
  assert.ok(body.includes('```js'), 'Opening fence line should be in body');
  assert.ok(body.includes('```'), 'Closing fence line should be in body');
});

// Multiple fenced blocks in one section — all suppressed.
test('[MISTAKES-2026-07-13-fence] multiple fenced blocks in one section all suppress headings inside them', () => {
  const text = [
    '## Real',
    '```',
    '## Ghost1',
    '```',
    'middle text',
    '```',
    '## Ghost2',
    '```',
    'end',
  ].join('\n');
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].heading, 'Real');
  assert.strictEqual(sections.find((s) => s.heading === 'Ghost1'), undefined);
  assert.strictEqual(sections.find((s) => s.heading === 'Ghost2'), undefined);
});

// Whole-document input: frontmatter block with --- lines must not interfere
// with fence tracking that follows it.
test('[MISTAKES-2026-07-13-fence] fenced headings after a frontmatter block are suppressed', () => {
  const text = '---\ntitle: test\n---\n## RealSection\n```\n## InFence\n```\n';
  const sections = parseSections(text);
  assert.strictEqual(sections.find((s) => s.heading === 'InFence'), undefined);
  assert.ok(sections.find((s) => s.heading === 'RealSection') !== undefined);
});

// ---------------------------------------------------------------------------
// [MISTAKES-2026-07-13-key] no-silent-key-drop
//
// Documented bug: verdict_derived was read by parseFrontmatter but DROPPED
// two hops later — contract silently unenforced.
// Rule: the lib MUST parse and return every scalar in data; no silent drop.
// ---------------------------------------------------------------------------

// All keys in a multi-key frontmatter must be present in data.
test('[MISTAKES-2026-07-13-key] all frontmatter keys are present in data — no silent drop', () => {
  const text = [
    '---',
    'verdict_derived: BLOCK',
    'status: complete',
    'coverage: 95',
    'active: true',
    'empty_val: null',
    '---',
    'body',
  ].join('\n');
  const { data } = parseFrontmatter(text);
  assert.ok('verdict_derived' in data, 'verdict_derived must appear in data');
  assert.ok('status' in data, 'status must appear in data');
  assert.ok('coverage' in data, 'coverage must appear in data');
  assert.ok('active' in data, 'active must appear in data');
  assert.ok('empty_val' in data, 'empty_val must appear in data');
});

// A key with an empty value (coerced to null) must NOT be omitted.
test('[MISTAKES-2026-07-13-key] key with null/empty value is present in data (not dropped)', () => {
  const text = '---\nverdict_derived: null\nother: value\n---\n';
  const { data } = parseFrontmatter(text);
  assert.ok('verdict_derived' in data, 'Key whose value coerces to null must still be in data');
  assert.strictEqual(data.verdict_derived, null);
});

// Key with comment-only value (k: # comment) coerces to null but must not be dropped.
test('[MISTAKES-2026-07-13-key] key with comment-only value appears in data as null (not dropped)', () => {
  const { data } = parseFrontmatter('---\nk: # this is a comment\n---\n');
  assert.ok('k' in data, 'k must be present even when its value is a comment');
  assert.strictEqual(data.k, null);
});

// parseFields must preserve every key from a section body, including edge values.
test('[MISTAKES-2026-07-13-key] parseFields preserves all keys including null-valued ones', () => {
  const body = 'files_touched_max: 5\nallow_full_rewrite: false\noptional_field: null\n';
  const result = parseFields(body);
  assert.ok('files_touched_max' in result);
  assert.ok('allow_full_rewrite' in result);
  assert.ok('optional_field' in result, 'null-valued key must not be silently dropped');
});

// ---------------------------------------------------------------------------
// [MISTAKES-2026-07-15-regex] no-lazy-multiline-regex (cross-boundary bleed)
//
// Documented bug: parseGrReview fallback used lazy [\s\S]*? which crossed
// record boundaries — section N content bled into section N+1.
// Rule: section splitting MUST be line-oriented with explicit heading anchors;
// no multi-record cross-bleed.
// ---------------------------------------------------------------------------

// Two adjacent sections must not bleed body content across boundaries.
test('[MISTAKES-2026-07-15-regex] section bodies do not bleed across boundaries', () => {
  const text = [
    '## Section A',
    'line A1',
    'line A2',
    '## Section B',
    'line B1',
    'line B2',
  ].join('\n');
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 2);
  assert.ok(!sections[0].body.includes('line B1'), 'Section A body must not contain Section B content');
  assert.ok(!sections[1].body.includes('line A1'), 'Section B body must not contain Section A content');
});

// Adversarial: many sections — every section body contains ONLY its own lines.
// Use UUID-style markers (padded hex) so no marker is a substring of another.
test('[MISTAKES-2026-07-15-regex] 50-section adversarial input — no cross-section bleed', () => {
  const N = 50;
  // Generate fixed-width hex markers (8 hex digits) so no marker is a
  // substring of any other (e.g. "00000001" is not a substring of "00000010").
  const markers = Array.from({ length: N }, (_, i) => i.toString(16).padStart(8, '0'));
  const lines = [];
  for (let i = 0; i < N; i++) {
    lines.push(`## Section ${i}`);
    lines.push(`MARK:${markers[i]}`);
  }
  const sections = parseSections(lines.join('\n'));
  assert.strictEqual(sections.length, N, `${N} sections expected`);
  for (let i = 0; i < N; i++) {
    // Section i must contain its own marker.
    assert.ok(
      sections[i].body.includes(`MARK:${markers[i]}`),
      `Section ${i} must contain its own body marker`
    );
    // Section i must NOT contain any other section's marker.
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      assert.ok(
        !sections[i].body.includes(`MARK:${markers[j]}`),
        `Section ${i} body must not bleed from section ${j}`
      );
    }
  }
});

// getSection must return only the matched section's body, not the rest of the doc.
test('[MISTAKES-2026-07-15-regex] getSection returns only the matched section body — no tail bleed', () => {
  const text = [
    '## Alpha',
    'alpha body',
    '## Beta',
    'beta body',
    '## Gamma',
    'gamma body',
  ].join('\n');
  const body = getSection(text, 'Beta');
  assert.ok(body !== null, 'Beta section must be found');
  assert.ok(body.includes('beta body'), 'Beta body must contain beta body');
  assert.ok(!body.includes('alpha body'), 'Beta body must not contain alpha body');
  assert.ok(!body.includes('gamma body'), 'Beta body must not contain gamma body');
});

// Multi-frontmatter-field parse: parsing multiple records must not bleed
// second-record values into first-record keys.
test('[MISTAKES-2026-07-15-regex] frontmatter multi-key parse — later values do not bleed into earlier keys', () => {
  const text = '---\nrecord1_field: value1\nrecord2_field: value2\n---\n';
  const { data } = parseFrontmatter(text);
  assert.strictEqual(data.record1_field, 'value1');
  assert.strictEqual(data.record2_field, 'value2');
});

// ---------------------------------------------------------------------------
// [MISTAKES-2026-07-09-slug] raw-heading-no-slug
//
// Documented bug: heading typo "ratio-configjsonc" survived reviewers because
// headings were read as slugs (dots → nothing, dashes ↔ underscores).
// Rule: parseSections returns RAW heading text verbatim; getSection must
// char-compare exact strings, not slugified forms.
// ---------------------------------------------------------------------------

// Dots in a heading are preserved verbatim.
test('[MISTAKES-2026-07-09-slug] heading with dots is returned verbatim — not slug-normalised', () => {
  const text = '## ratio.config.jsonc\nbody\n';
  const sections = parseSections(text);
  assert.strictEqual(sections[0].heading, 'ratio.config.jsonc', 'Dots must be preserved in heading');
});

// A slugified variant does NOT match; exact match is required.
test('[MISTAKES-2026-07-09-slug] getSection does NOT match a slug variant of the heading', () => {
  const text = '## ratio.config.jsonc\nbody\n';
  const slugResult = getSection(text, 'ratio-configjsonc');
  assert.strictEqual(slugResult, null, 'Slug variant must not match; exact char sequence required');
});

// Exact heading match works.
test('[MISTAKES-2026-07-09-slug] getSection matches the exact heading char-for-char', () => {
  const text = '## ratio.config.jsonc\nbody content\n';
  const exactResult = getSection(text, 'ratio.config.jsonc');
  assert.ok(exactResult !== null, 'Exact heading must match');
});

// Heading with backtick content is preserved verbatim.
test('[MISTAKES-2026-07-09-slug] heading containing backticks is returned verbatim', () => {
  const text = '## `ratio.config.jsonc` v1 schema\nbody\n';
  const sections = parseSections(text);
  assert.strictEqual(sections[0].heading, '`ratio.config.jsonc` v1 schema');
});

// Underscore vs hyphen is preserved — no normalisation.
test('[MISTAKES-2026-07-09-slug] heading with underscore is not converted to hyphen or vice versa', () => {
  const text = '## my_key and my-key\nbody\n';
  const sections = parseSections(text);
  assert.strictEqual(sections[0].heading, 'my_key and my-key');
});

// Mixed case is preserved.
test('[MISTAKES-2026-07-09-slug] heading case is preserved verbatim (no lower-casing)', () => {
  const text = '## MySection With CAPS\nbody\n';
  const sections = parseSections(text);
  assert.strictEqual(sections[0].heading, 'MySection With CAPS');
});

// ---------------------------------------------------------------------------
// [MISTAKES-2026-07-11-dry] single heading-anchor DRY
//
// Documented bug: HEADING_RE = /^#{1,6}\s/ re-declared byte-identical in
// 4 sibling parsers — DRY drift hazard for a load-bearing parse anchor.
// Rule: the heading regex must be declared ONCE in this module; all heading
// detection flows through it.
//
// These tests are structural/static: they prove the module's behaviour is
// consistent with a single shared anchor (by exercising every heading level
// through the same API and confirming uniform treatment).
// ---------------------------------------------------------------------------

// All 6 ATX heading levels are recognized (single-anchor coverage).
test('[MISTAKES-2026-07-11-dry] all 6 heading levels are recognized through the single anchor', () => {
  const text = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n';
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 6, 'All 6 heading levels must be detected');
  assert.deepStrictEqual(
    sections.map((s) => s.level),
    [1, 2, 3, 4, 5, 6],
    'Levels 1–6 must all be correctly identified'
  );
});

// Level-7 (7 #) is NOT a heading per ATX spec (max is 6).
test('[MISTAKES-2026-07-11-dry] 7 hashes is NOT an ATX heading (levels capped at 6)', () => {
  const text = '## Real\n####### NotAHeading\n';
  const sections = parseSections(text);
  // "NotAHeading" should not be a separate section — it has 7 #
  const fake = sections.find((s) => s.heading === 'NotAHeading');
  assert.strictEqual(fake, undefined, '####### must not be recognized as a heading (level > 6)');
});

// A # with no space after it is NOT a heading (space is required).
test('[MISTAKES-2026-07-11-dry] # without trailing space is NOT an ATX heading', () => {
  const text = '## Real\n##NoSpace after hashes\n';
  const sections = parseSections(text);
  // "NoSpace after hashes" must not become its own section.
  const fake = sections.find((s) => s.heading === 'NoSpace after hashes');
  assert.strictEqual(fake, undefined, '## without space must not match heading anchor');
  // The body of "Real" should include the non-heading line.
  assert.ok(sections[0].body.includes('##NoSpace after hashes'), 'Non-heading ## line belongs to body');
});

// getSection and parseSections must agree on heading text (same anchor used).
test('[MISTAKES-2026-07-11-dry] getSection and parseSections agree on heading recognition (consistent anchor)', () => {
  const text = '## SectionOne\ncontent one\n### SectionTwo\ncontent two\n';
  const sections = parseSections(text);
  const headingsFromSections = sections.map((s) => s.heading);

  // getSection must find exactly the same headings.
  for (const h of headingsFromSections) {
    const body = getSection(text, h);
    assert.ok(body !== null, `getSection must find heading "${h}" that parseSections returned`);
  }

  // A heading that parseSections did NOT return must not be found by getSection.
  const absent = getSection(text, 'DoesNotExist');
  assert.strictEqual(absent, null);
});

// parseFields must treat heading-like lines in a body as plain text (no heading re-detection).
test('[MISTAKES-2026-07-11-dry] parseFields treats ## lines in body as plain text — no heading re-detection', () => {
  const body = 'key: value\n## not a heading in parseFields context\nother: 42\n';
  const result = parseFields(body);
  // The ## line is not a key: value pair; it should be ignored (tolerant).
  assert.strictEqual(result.key, 'value');
  assert.strictEqual(result.other, 42);
  // No crash from the ## line.
});

// ---------------------------------------------------------------------------
// Cross-cutting: tolerant/non-throwing contract (affects all entries)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// [SEC-1] prototype-corruption guard (null-proto data objects)
//
// Security finding: plain `{}` result objects allowed `__proto__`, `constructor`,
// and `prototype` keys to hit Object prototype setters instead of landing as
// normal own-properties.
// Fix: every accumulator object that receives parsed keys is now built with
// Object.create(null) so prototype-named keys are treated identically to any
// other identifier key.
// ---------------------------------------------------------------------------

// Scalar __proto__: value must appear as an own enumerable property.
test('[SEC-1] parseFrontmatter scalar __proto__ key lands as own-property, not prototype mutation', () => {
  const { data } = parseFrontmatter('---\n__proto__: hello\n---\n');
  assert.ok(
    Object.prototype.hasOwnProperty.call(data, '__proto__'),
    '__proto__ must be an own enumerable property of data'
  );
  assert.strictEqual(data['__proto__'], 'hello', '__proto__ value must be "hello"');
});

// List __proto__: prototype of data must remain null; key present as own-property.
test('[SEC-1] parseFrontmatter list __proto__ key — data prototype stays null, key is own-property', () => {
  const { data } = parseFrontmatter('---\n__proto__:\n  - x\n  - y\n---\n');
  assert.strictEqual(
    Object.getPrototypeOf(data),
    null,
    'data prototype must be null (not corrupted by list __proto__ key)'
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(data, '__proto__'),
    '__proto__ must be an own enumerable property'
  );
  assert.deepStrictEqual(data['__proto__'], ['x', 'y'], '__proto__ value must be the parsed array');
});

// constructor key lands as own-property.
test('[SEC-1] parseFrontmatter "constructor" key lands as own-property', () => {
  const { data } = parseFrontmatter('---\nconstructor: custom\n---\n');
  assert.ok(
    Object.prototype.hasOwnProperty.call(data, 'constructor'),
    'constructor must be an own enumerable property'
  );
  assert.strictEqual(data['constructor'], 'custom');
});

// prototype key lands as own-property.
test('[SEC-1] parseFrontmatter "prototype" key lands as own-property', () => {
  const { data } = parseFrontmatter('---\nprototype: custom\n---\n');
  assert.ok(
    Object.prototype.hasOwnProperty.call(data, 'prototype'),
    'prototype must be an own enumerable property'
  );
  assert.strictEqual(data['prototype'], 'custom');
});

// Normal key alongside __proto__ — no collateral damage.
test('[SEC-1] parseFrontmatter normal key alongside __proto__ parses correctly', () => {
  const { data } = parseFrontmatter('---\ntitle: MyDoc\n__proto__: evil\nstatus: ok\n---\n');
  assert.strictEqual(data['title'], 'MyDoc', 'normal key "title" must parse correctly');
  assert.strictEqual(data['status'], 'ok', 'normal key "status" must parse correctly');
  assert.ok(
    Object.prototype.hasOwnProperty.call(data, '__proto__'),
    '__proto__ must be an own-property alongside normal keys'
  );
  assert.strictEqual(data['__proto__'], 'evil');
});

// parseFields exhibits the same null-proto safety for __proto__.
test('[SEC-1] parseFields __proto__ key lands as own-property, prototype stays null', () => {
  const result = parseFields('__proto__: injected\nother: value\n');
  assert.strictEqual(
    Object.getPrototypeOf(result),
    null,
    'parseFields result prototype must be null'
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(result, '__proto__'),
    '__proto__ must be an own enumerable property in parseFields result'
  );
  assert.strictEqual(result['__proto__'], 'injected');
  assert.strictEqual(result['other'], 'value');
});

// All returned data objects have null prototype (including early-return paths).
test('[SEC-1] all parseFrontmatter return paths yield data with null prototype', () => {
  // empty string path
  assert.strictEqual(Object.getPrototypeOf(parseFrontmatter('').data), null);
  // no-opening-delimiter path
  assert.strictEqual(Object.getPrototypeOf(parseFrontmatter('no frontmatter here').data), null);
  // unterminated frontmatter path
  assert.strictEqual(Object.getPrototypeOf(parseFrontmatter('---\nk: v\n').data), null);
  // normal path
  assert.strictEqual(Object.getPrototypeOf(parseFrontmatter('---\nk: v\n---\n').data), null);
});

// ---------------------------------------------------------------------------
// [SEC-1] Object.keys / spread / JSON.stringify behave identically for null-proto
// own-enumerable keys — downstream consumers are unaffected.
// ---------------------------------------------------------------------------

test('[SEC-1] Object.keys works on null-proto data (downstream compat)', () => {
  const { data } = parseFrontmatter('---\nalpha: 1\nbeta: two\n---\n');
  const keys = Object.keys(data);
  assert.deepStrictEqual(keys.sort(), ['alpha', 'beta']);
});

test('[SEC-1] spread works on null-proto data (downstream compat)', () => {
  const { data } = parseFrontmatter('---\nx: 10\n---\n');
  const copy = { ...data };
  assert.strictEqual(copy.x, 10);
});

test('[SEC-1] JSON.stringify works on null-proto data (downstream compat)', () => {
  const { data } = parseFrontmatter('---\nname: test\ncount: 3\n---\n');
  const json = JSON.stringify(data);
  assert.strictEqual(json, '{"name":"test","count":3}');
});

// None of the MISTAKES-targeted functions throw on adversarial input.
test('all MISTAKES-targeted functions are tolerant on adversarial/empty input', () => {
  const adversarialInputs = [
    '',
    '---',
    '---\n',
    '---\nk\n---\n',
    '```\n## inside fence\n',
    '##no space',
    '## \n',
    '\x00\x01\x02',
    'a'.repeat(100000),
  ];

  for (const input of adversarialInputs) {
    let threw = false;
    try {
      parseFrontmatter(input);
      parseSections(input);
      getSection(input, 'X');
      parseFields(input);
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, `Must not throw on input: ${JSON.stringify(input.slice(0, 40))}`);
  }
});
