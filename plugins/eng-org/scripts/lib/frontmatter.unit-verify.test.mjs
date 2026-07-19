/**
 * frontmatter.unit-verify.test.mjs — INDEPENDENT test-unit verification.
 *
 * Authored by: test-unit agent (NOT the dev who wrote frontmatter.mjs).
 * Run: node --test scripts/lib/frontmatter.unit-verify.test.mjs  (from plugin root)
 *
 * Covers every edge-case from the contract + the dev-report's "suggested additional
 * tests" list + branches the dev's suite does NOT exercise:
 *
 *   UV-01  parseFrontmatter — null / non-string input never throws
 *   UV-02  parseFrontmatter — no frontmatter, body returned verbatim
 *   UV-03  parseFrontmatter — unterminated --- (E4 re-verify)
 *   UV-04  parseFrontmatter — empty string (E1 re-verify)
 *   UV-05  parseFrontmatter — UTF-8 BOM before opening --- (E8)
 *   UV-06  parseFrontmatter — CRLF round-trip (E7)
 *   UV-07  parseFrontmatter — duplicate key last-wins (E6)
 *   UV-08  parseFrontmatter — quoted value containing # (E10)
 *   UV-09  parseFrontmatter — single-quoted value containing a double-quote char
 *   UV-10  parseFrontmatter — k: # comment only → null (E11)
 *   UV-11  parseFrontmatter — scalar coercion: false, 0, negative int (E12 extension)
 *   UV-12  parseFrontmatter — empty frontmatter block (E5)
 *   UV-13  parseFrontmatter — list of scalars (array returned)
 *   UV-14  parseFrontmatter — list of {field:value} maps (verdict-lint findings shape)
 *   UV-15  parseFrontmatter — malformed list item "- " (E17) — no throw
 *   UV-16  parseFrontmatter — tab-indented list item (E9) — no throw
 *   UV-17  parseFrontmatter — garbage / random bytes — never throws
 *   UV-18  parseSections — empty string → []
 *   UV-19  parseSections — no headings → []
 *   UV-20  parseSections — preamble dropped
 *   UV-21  parseSections — ``` fence hides ## heading (E13)
 *   UV-22  parseSections — ~~~ fence hides ## heading (~~~ variant not in dev suite)
 *   UV-23  parseSections — fence that opens but never closes → no throw
 *   UV-24  parseSections — two adjacent headings → first has empty body (E16)
 *   UV-25  parseSections — raw heading verbatim, level correct (E15 extension)
 *   UV-26  parseSections — heading levels 1-6 all recognized
 *   UV-27  parseSections — with frontmatter block present, --- not mistaken for heading
 *   UV-28  parseSections — BOM prefix on whole-text input (BOM on parseSections path)
 *   UV-29  parseSections — same heading appears twice → both returned (first-wins semantics for getSection)
 *   UV-30  getSection — hit case
 *   UV-31  getSection — miss case → null (E18)
 *   UV-32  getSection — exact-match, slug rejected (E19)
 *   UV-33  getSection — opts.level narrows to correct level
 *   UV-34  getSection — first of two same-named headings returned (contract: FIRST)
 *   UV-35  getSection — null / non-string text never throws
 *   UV-36  parseFields — basic key:value with scalar coercion
 *   UV-37  parseFields — empty string → {}
 *   UV-38  parseFields — CRLF in body
 *   UV-39  parseFields — list of scalars in body
 *   UV-40  parseFields — null / non-string never throws
 *   UV-41  parseFields — comment-only value → null
 *   UV-42  parseSections — body lines joined correctly (no spurious newlines at section boundary)
 *   UV-43  parseFrontmatter — value with inline comment stripped (outside quotes)
 *   UV-44  parseFrontmatter — integer 0 → number (coerce "0")
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
// UV-01  parseFrontmatter: non-string input never throws
// ---------------------------------------------------------------------------
test('UV-01: parseFrontmatter(null) returns {data:{}, body:""} without throwing', () => {
  let result;
  let threw = false;
  try { result = parseFrontmatter(null); } catch { threw = true; }
  assert.strictEqual(threw, false);
  // Must return {data:{}, body:""} for non-string
  assert.deepStrictEqual({ ...result.data }, {});
  assert.strictEqual(result.body, '');
});

// ---------------------------------------------------------------------------
// UV-02  parseFrontmatter: no --- anywhere → data:{}, body=whole text verbatim
// ---------------------------------------------------------------------------
test('UV-02: parseFrontmatter with no --- at all returns whole text as body', () => {
  const text = 'Hello\nWorld\n# Title\nbody';
  const { data, body } = parseFrontmatter(text);
  assert.deepStrictEqual({ ...data }, {});
  assert.strictEqual(body, text);
});

// ---------------------------------------------------------------------------
// UV-03  parseFrontmatter: unterminated --- (E4) — body must be whole text
// ---------------------------------------------------------------------------
test('UV-03: parseFrontmatter unterminated --- returns whole text (does not swallow doc)', () => {
  const text = '---\nkey: value\nno closing delimiter';
  const { data, body } = parseFrontmatter(text);
  assert.deepStrictEqual({ ...data }, {});
  assert.strictEqual(body, text);
});

// ---------------------------------------------------------------------------
// UV-04  parseFrontmatter: empty string (E1)
// ---------------------------------------------------------------------------
test('UV-04: parseFrontmatter("") returns {data:{}, body:""}', () => {
  const result = parseFrontmatter('');
  assert.deepStrictEqual({ ...result.data }, {});
  assert.strictEqual(result.body, '');
});

// ---------------------------------------------------------------------------
// UV-05  parseFrontmatter: BOM before --- is stripped and frontmatter recognized (E8)
// ---------------------------------------------------------------------------
test('UV-05: parseFrontmatter strips UTF-8 BOM and recognizes frontmatter', () => {
  const BOM = '﻿';
  const text = BOM + '---\nbom_key: bom_val\n---\nafter bom';
  const { data, body } = parseFrontmatter(text);
  assert.strictEqual(data.bom_key, 'bom_val');
  assert.strictEqual(body, 'after bom');
});

// ---------------------------------------------------------------------------
// UV-06  parseFrontmatter: CRLF identical to LF (E7)
// ---------------------------------------------------------------------------
test('UV-06: parseFrontmatter CRLF result is deepEqual to LF result', () => {
  const lf   = parseFrontmatter('---\nx: hello\ny: 42\n---\nbody text');
  const crlf = parseFrontmatter('---\r\nx: hello\r\ny: 42\r\n---\r\nbody text');
  assert.deepStrictEqual(lf, crlf);
});

// ---------------------------------------------------------------------------
// UV-07  parseFrontmatter: duplicate key → last wins (E6)
// ---------------------------------------------------------------------------
test('UV-07: parseFrontmatter duplicate key — last value overwrites first', () => {
  const { data } = parseFrontmatter('---\ncolor: red\ncolor: blue\n---\n');
  assert.strictEqual(data.color, 'blue');
});

// ---------------------------------------------------------------------------
// UV-08  parseFrontmatter: double-quoted value with # inside (E10)
// ---------------------------------------------------------------------------
test('UV-08: parseFrontmatter double-quoted value with # inside — hash is NOT stripped', () => {
  const { data } = parseFrontmatter('---\nk: "hash#inside"\n---\n');
  assert.strictEqual(data.k, 'hash#inside');
});

// ---------------------------------------------------------------------------
// UV-09  parseFrontmatter: single-quoted value containing a double-quote character
// (suggested by dev-report — cross-quote type containment)
// ---------------------------------------------------------------------------
test('UV-09: parseFrontmatter single-quoted value containing a double-quote returns literal value', () => {
  const { data } = parseFrontmatter("---\nk: 'say \"hello\"'\n---\n");
  assert.strictEqual(data.k, 'say "hello"');
});

// ---------------------------------------------------------------------------
// UV-10  parseFrontmatter: k: # comment only → null (E11)
// ---------------------------------------------------------------------------
test('UV-10: parseFrontmatter "k: # comment only" produces null for k', () => {
  const { data } = parseFrontmatter('---\nk: # this is a comment\n---\n');
  assert.strictEqual(data.k, null);
});

// ---------------------------------------------------------------------------
// UV-11  parseFrontmatter: scalar coercion — false, 0, negative int
// ---------------------------------------------------------------------------
test('UV-11a: parseFrontmatter "false" coerces to boolean false', () => {
  const { data } = parseFrontmatter('---\nflag: false\n---\n');
  assert.strictEqual(data.flag, false);
});

test('UV-11b: parseFrontmatter bare 0 coerces to number 0', () => {
  const { data } = parseFrontmatter('---\ncount: 0\n---\n');
  assert.strictEqual(data.count, 0);
  assert.strictEqual(typeof data.count, 'number');
});

test('UV-11c: parseFrontmatter negative integer coerces to number', () => {
  const { data } = parseFrontmatter('---\noffset: -99\n---\n');
  assert.strictEqual(data.offset, -99);
});

// ---------------------------------------------------------------------------
// UV-12  parseFrontmatter: empty frontmatter block (E5)
// ---------------------------------------------------------------------------
test('UV-12: parseFrontmatter empty frontmatter "---\\n---\\nbody" → data:{}, body=after', () => {
  const { data, body } = parseFrontmatter('---\n---\nbody here');
  assert.deepStrictEqual({ ...data }, {});
  assert.strictEqual(body, 'body here');
});

// ---------------------------------------------------------------------------
// UV-13  parseFrontmatter: list of scalar items → array
// (dev covered with alpha/beta; we use integers + null to also test coerce in list)
// ---------------------------------------------------------------------------
test('UV-13: parseFrontmatter list with integer and null scalars coerces items', () => {
  const text = '---\nnums:\n  - 1\n  - 2\n  - null\n---\n';
  const { data } = parseFrontmatter(text);
  assert.deepStrictEqual(data.nums, [1, 2, null]);
});

// ---------------------------------------------------------------------------
// UV-14  parseFrontmatter: list of {field:value} maps (verdict-lint findings shape)
// ---------------------------------------------------------------------------
test('UV-14: parseFrontmatter block list of field-value maps returns array of objects', () => {
  const text = '---\nfindings:\n  - severity: error\n    rule: no-foo\n  - severity: warn\n    rule: no-bar\n---\n';
  const { data } = parseFrontmatter(text);
  assert.strictEqual(Array.isArray(data.findings), true);
  assert.strictEqual(data.findings.length, 2);
  assert.deepStrictEqual({ ...data.findings[0] }, { severity: 'error', rule: 'no-foo' });
  assert.deepStrictEqual({ ...data.findings[1] }, { severity: 'warn', rule: 'no-bar' });
});

// ---------------------------------------------------------------------------
// UV-15  parseFrontmatter: malformed list item "- " with no content (E17)
// ---------------------------------------------------------------------------
test('UV-15: parseFrontmatter "- " malformed list item does not throw', () => {
  let threw = false;
  try { parseFrontmatter('---\nthings:\n  - \n---\n'); } catch { threw = true; }
  assert.strictEqual(threw, false);
});

// ---------------------------------------------------------------------------
// UV-16  parseFrontmatter: tab-indented list item (E9)
// ---------------------------------------------------------------------------
test('UV-16: parseFrontmatter tab-indented list item does not throw', () => {
  let threw = false;
  try { parseFrontmatter('---\nitems:\n\t- foo\n---\n'); } catch { threw = true; }
  assert.strictEqual(threw, false);
});

// ---------------------------------------------------------------------------
// UV-17  parseFrontmatter: garbage / random bytes — never throws
// ---------------------------------------------------------------------------
test('UV-17a: parseFrontmatter on garbage string never throws', () => {
  let threw = false;
  try { parseFrontmatter('!!!\x00\x01\x02� some garbage\n---\n'); } catch { threw = true; }
  assert.strictEqual(threw, false);
});

test('UV-17b: parseFrontmatter on 1000-char repeated garbage never throws', () => {
  const garbage = '\x00\x01\xff�'.repeat(250);
  let threw = false;
  try { parseFrontmatter(garbage); } catch { threw = true; }
  assert.strictEqual(threw, false);
});

// ---------------------------------------------------------------------------
// UV-18  parseSections: empty string → []
// ---------------------------------------------------------------------------
test('UV-18: parseSections("") returns []', () => {
  const result = parseSections('');
  assert.deepStrictEqual(result, []);
});

// ---------------------------------------------------------------------------
// UV-19  parseSections: no headings at all → []
// ---------------------------------------------------------------------------
test('UV-19: parseSections with no ATX headings returns []', () => {
  const result = parseSections('just plain text\nno headings here\n');
  assert.deepStrictEqual(result, []);
});

// ---------------------------------------------------------------------------
// UV-20  parseSections: preamble before first heading is dropped
// ---------------------------------------------------------------------------
test('UV-20: parseSections drops preamble text before first heading', () => {
  const text = 'Preamble line 1\nPreamble line 2\n## First Heading\nbody here';
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].heading, 'First Heading');
});

// ---------------------------------------------------------------------------
// UV-21  parseSections: ``` fence hides ## heading (E13)
// ---------------------------------------------------------------------------
test('UV-21: parseSections ``` fenced ## heading is NOT treated as a section', () => {
  const text = '## Real Section\n```\n## Inside Fence\n```\nsome body';
  const sections = parseSections(text);
  const faked = sections.find(s => s.heading === 'Inside Fence');
  assert.strictEqual(faked, undefined);
});

// ---------------------------------------------------------------------------
// UV-22  parseSections: ~~~ fence hides ## heading (dev suite only tests ```)
// ---------------------------------------------------------------------------
test('UV-22: parseSections ~~~ fenced ## heading is NOT treated as a section', () => {
  const text = '## Outer\n~~~\n## Fenced By Tilde\n~~~\nbody after fence';
  const sections = parseSections(text);
  const faked = sections.find(s => s.heading === 'Fenced By Tilde');
  assert.strictEqual(faked, undefined);
});

// Also verify the outer section captured the fence body
test('UV-22b: parseSections ~~~ fence lines belong to enclosing section body', () => {
  const text = '## Outer\n~~~\n## Fenced By Tilde\n~~~\nbody after fence';
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].heading, 'Outer');
});

// ---------------------------------------------------------------------------
// UV-23  parseSections: fence opened but never closed → no throw
// ---------------------------------------------------------------------------
test('UV-23: parseSections with unclosed fence never throws', () => {
  const text = '## Section\n```\n## This should be in fence\nsome content';
  let threw = false;
  let result;
  try { result = parseSections(text); } catch { threw = true; }
  assert.strictEqual(threw, false);
  // The unclosed fence means "Inside Fence" heading is consumed as fence content
  const faked = result.find(s => s.heading === 'This should be in fence');
  assert.strictEqual(faked, undefined);
});

// ---------------------------------------------------------------------------
// UV-24  parseSections: two adjacent headings → first has empty body (E16)
// ---------------------------------------------------------------------------
test('UV-24: parseSections heading immediately followed by another heading has empty body', () => {
  const text = '## A\n## B\ncontent';
  const sections = parseSections(text);
  assert.strictEqual(sections[0].body, '');
});

// ---------------------------------------------------------------------------
// UV-25  parseSections: raw heading text verbatim, no normalization (E15 extension)
// ---------------------------------------------------------------------------
test('UV-25: parseSections returns raw heading with special chars verbatim', () => {
  const text = '### ratio.config.jsonc [DRAFT]\nbody';
  const sections = parseSections(text);
  assert.strictEqual(sections[0].heading, 'ratio.config.jsonc [DRAFT]');
  assert.strictEqual(sections[0].level, 3);
});

// ---------------------------------------------------------------------------
// UV-26  parseSections: heading levels 1-6 all recognized
// ---------------------------------------------------------------------------
test('UV-26: parseSections recognizes all heading levels 1 through 6', () => {
  const text = '# L1\n## L2\n### L3\n#### L4\n##### L5\n###### L6\n';
  const sections = parseSections(text);
  assert.deepStrictEqual(sections.map(s => s.level), [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(sections.map(s => s.heading), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
});

// ---------------------------------------------------------------------------
// UV-27  parseSections: frontmatter block skipped, --- not mistaken for heading
// ---------------------------------------------------------------------------
test('UV-27: parseSections with frontmatter block does not produce spurious sections from ---', () => {
  const text = '---\ntask: test\nstatus: ok\n---\n## Real Section\nbody content';
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].heading, 'Real Section');
});

// ---------------------------------------------------------------------------
// UV-28  parseSections: BOM prefix on whole-text is handled
// (the dev's BOM test is only on parseFrontmatter; parseSections BOM branch untested)
// ---------------------------------------------------------------------------
test('UV-28: parseSections strips leading BOM and correctly parses sections', () => {
  const BOM = '﻿';
  const text = BOM + '## Heading After BOM\nbody line';
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].heading, 'Heading After BOM');
});

// ---------------------------------------------------------------------------
// UV-29  parseSections: same heading appears twice — BOTH returned
// (getSection contract says FIRST; parseSections must not deduplicate)
// ---------------------------------------------------------------------------
test('UV-29: parseSections with duplicate heading names returns both entries', () => {
  const text = '## Target\nfirst body\n## Target\nsecond body';
  const sections = parseSections(text);
  assert.strictEqual(sections.length, 2);
  assert.strictEqual(sections[0].body, 'first body');
  assert.strictEqual(sections[1].body, 'second body');
});

// ---------------------------------------------------------------------------
// UV-30  getSection: hit case — returns body string
// ---------------------------------------------------------------------------
test('UV-30: getSection returns body string for an existing heading', () => {
  const text = '## Introduction\nThis is the intro.\n## Methods\nDetail here.';
  const body = getSection(text, 'Introduction');
  assert.strictEqual(typeof body, 'string');
  assert.strictEqual(body, 'This is the intro.');
});

// ---------------------------------------------------------------------------
// UV-31  getSection: miss case → null (E18)
// ---------------------------------------------------------------------------
test('UV-31: getSection returns null when heading is absent', () => {
  const text = '## Present\nsome content';
  const result = getSection(text, 'Missing Heading');
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// UV-32  getSection: exact match, slug variant rejected (E19)
// ---------------------------------------------------------------------------
test('UV-32: getSection("ratio.config.jsonc") finds exact heading, not a slug', () => {
  const text = '## ratio.config.jsonc\nbody text';
  const found = getSection(text, 'ratio.config.jsonc');
  assert.strictEqual(typeof found, 'string');
  const slug = getSection(text, 'ratioconfigjsonc');
  assert.strictEqual(slug, null);
});

// ---------------------------------------------------------------------------
// UV-33  getSection: opts.level constrains to that level only
// ---------------------------------------------------------------------------
test('UV-33: getSection with opts.level:2 does not match same heading at level 3', () => {
  const text = '## Target\nlevel-2 body\n### Target\nlevel-3 body';
  const result = getSection(text, 'Target', { level: 2 });
  assert.strictEqual(result, 'level-2 body');
  const miss = getSection(text, 'Target', { level: 4 });
  assert.strictEqual(miss, null);
});

// ---------------------------------------------------------------------------
// UV-34  getSection: returns FIRST match when same heading appears multiple times
// (contract: "FIRST section whose heading matches")
// ---------------------------------------------------------------------------
test('UV-34: getSection returns FIRST match when heading appears twice', () => {
  const text = '## Dup\nfirst\n## Dup\nsecond';
  const result = getSection(text, 'Dup');
  assert.strictEqual(result, 'first');
});

// ---------------------------------------------------------------------------
// UV-35  getSection: non-string / null text never throws
// ---------------------------------------------------------------------------
test('UV-35: getSection(null, "x") never throws', () => {
  let threw = false;
  let result;
  try { result = getSection(null, 'x'); } catch { threw = true; }
  assert.strictEqual(threw, false);
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// UV-36  parseFields: basic key:value with scalar coercion
// ---------------------------------------------------------------------------
test('UV-36: parseFields parses key:value pairs with full scalar coercion', () => {
  const body = 'files_max: 10\nallow_rewrite: true\nlabel: my-label\nempty_field: null';
  const result = parseFields(body);
  assert.deepStrictEqual({ ...result }, {
    files_max: 10,
    allow_rewrite: true,
    label: 'my-label',
    empty_field: null,
  });
});

// ---------------------------------------------------------------------------
// UV-37  parseFields: empty string → {}
// ---------------------------------------------------------------------------
test('UV-37: parseFields("") returns empty object {}', () => {
  const result = parseFields('');
  assert.deepStrictEqual({ ...result }, {});
});

// ---------------------------------------------------------------------------
// UV-38  parseFields: CRLF in body is handled like LF
// ---------------------------------------------------------------------------
test('UV-38: parseFields with CRLF line endings parses same as LF', () => {
  const lf   = parseFields('a: 1\nb: hello');
  const crlf = parseFields('a: 1\r\nb: hello');
  assert.deepStrictEqual(lf, crlf);
});

// ---------------------------------------------------------------------------
// UV-39  parseFields: list of scalars in section body
// (dev-report suggested: parseFields with block list in section body)
// ---------------------------------------------------------------------------
test('UV-39: parseFields with block list in body returns array of scalars', () => {
  const body = 'tags:\n  - alpha\n  - beta\n  - 3';
  const result = parseFields(body);
  assert.deepStrictEqual(result.tags, ['alpha', 'beta', 3]);
});

// ---------------------------------------------------------------------------
// UV-40  parseFields: null / non-string body never throws
// ---------------------------------------------------------------------------
test('UV-40: parseFields(null) never throws and returns {}', () => {
  let threw = false;
  let result;
  try { result = parseFields(null); } catch { threw = true; }
  assert.strictEqual(threw, false);
  assert.deepStrictEqual({ ...result }, {});
});

// ---------------------------------------------------------------------------
// UV-41  parseFields: comment-only value → null (via comment stripping)
// ---------------------------------------------------------------------------
test('UV-41: parseFields "field: # comment" value is null', () => {
  const body = 'field: # this is a comment\nother: real';
  const result = parseFields(body);
  assert.strictEqual(result.field, null);
  assert.strictEqual(result.other, 'real');
});

// ---------------------------------------------------------------------------
// UV-42  parseSections: multi-line body is joined with '\n' (no extra blank lines)
// ---------------------------------------------------------------------------
test('UV-42: parseSections multi-line section body is joined with newline correctly', () => {
  const text = '## Section\nline one\nline two\nline three';
  const sections = parseSections(text);
  assert.strictEqual(sections[0].body, 'line one\nline two\nline three');
});

// ---------------------------------------------------------------------------
// UV-43  parseFrontmatter: inline comment after value is stripped (outside quotes)
// ---------------------------------------------------------------------------
test('UV-43: parseFrontmatter inline comment after value is stripped', () => {
  const { data } = parseFrontmatter('---\nk: myvalue # this is a comment\n---\n');
  assert.strictEqual(data.k, 'myvalue');
});

// ---------------------------------------------------------------------------
// UV-44  parseFrontmatter: "0" coerces to number 0 (not falsy string)
// ---------------------------------------------------------------------------
test('UV-44: parseFrontmatter "0" coerces to number 0', () => {
  const { data } = parseFrontmatter('---\ncount: 0\n---\n');
  assert.strictEqual(data.count, 0);
  assert.strictEqual(typeof data.count, 'number');
});
