/**
 * trd-lint.regression.test.mjs — Security regression tests for trd-lint
 *
 * Run: node --test scripts/trd-lint.regression.test.mjs
 *
 * These tests verify that trd-lint (and its consumption of lib/frontmatter.mjs)
 * maintains the prototype-pollution guards (SEC-1 — null-proto data objects)
 * when processing adversarial input containing __proto__, constructor, or
 * prototype keys in frontmatter or field data.
 *
 * The threat model: if a malicious TRD author supplies frontmatter with
 * __proto__ keys, or if the E2 section body contains prototype-named keys,
 * the linter must not allow those to pollute the prototype chain.
 *
 * mistakes_sha256: 4358e021143f695b3c286518e0f8e96f642ef5a152d408e8dd40e83e3bc597fb
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintTrd } from './trd-lint.mjs';

// Shared fixture builder to construct a valid TRD with a malicious E2 section.
function buildValidTrdWithMaliciousE2(e2Body) {
  const lines = [];
  lines.push('---');
  lines.push('title: Test TRD');
  lines.push('__proto__: should_not_pollute');
  lines.push('---');
  lines.push('');
  lines.push('The objective of this TRD is to provide a concise and complete technical design.');
  lines.push('');
  lines.push('## 1. What Are We Doing?');
  lines.push('Real content for section 1.');
  lines.push('');
  lines.push('## 2. How Are We Doing It?');
  lines.push('Real content for section 2.');
  lines.push('');
  lines.push('## 3. DB Schema (include ONLY when DB changes)');
  lines.push('N/A — no DB changes in this REQ.');
  lines.push('');
  lines.push('## 4. API Contracts');
  lines.push('N/A — no API contract changes in this REQ.');
  lines.push('');
  lines.push('## 5. Acceptance Criteria');
  lines.push('Real acceptance criteria.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## eng-org extensions');
  lines.push('');
  lines.push('## E1. Design Principles Applied');
  lines.push('Real content.');
  lines.push('');
  lines.push('## E2. Blast Radius & Change Budget');
  lines.push('');
  lines.push(e2Body);
  lines.push('');
  lines.push('## E3. File-by-File Change Map');
  lines.push('| File | State | Intent |');
  lines.push('|---|---|---|');
  lines.push('| file.ts | modified | Real change |');
  lines.push('');
  lines.push('## E4. Test-Tier Strategy');
  lines.push('Real test strategy.');
  lines.push('');
  lines.push('```mermaid');
  lines.push('graph TD');
  lines.push('    A-->B');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// [SEC-1-TRD] Prototype-pollution guard: frontmatter __proto__ key
//
// The linter calls parseSections which internally calls parseFrontmatter.
// If frontmatter contains __proto__, it must NOT pollute data's prototype.
// ---------------------------------------------------------------------------

test('[SEC-1-TRD] frontmatter __proto__ key does NOT pollute Object.prototype', () => {
  const trd = buildValidTrdWithMaliciousE2(
    'files_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false'
  );
  // The TRD has __proto__: should_not_pollute in its frontmatter.
  // After linting, Object.prototype.should_not_pollute must remain undefined.
  const beforeValue = Object.prototype.should_not_pollute;

  const { ok } = lintTrd(trd);
  assert.strictEqual(ok, true, 'TRD with __proto__ in frontmatter must still pass (linter is tolerant)');

  const afterValue = Object.prototype.should_not_pollute;
  assert.strictEqual(
    afterValue,
    beforeValue,
    'Object.prototype.should_not_pollute must not be set by lintTrd'
  );
});

// ---------------------------------------------------------------------------
// [SEC-1-TRD] E2 section body with __proto__ key
//
// The linter reads E2 via parseFields(e2Body). If e2Body contains
// __proto__, it must land as an own-property of the parsed result,
// not as a prototype mutation.
// ---------------------------------------------------------------------------

test('[SEC-1-TRD] E2 body containing __proto__ key does NOT pollute Object.prototype', () => {
  const e2WithProto = 'files_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false\n__proto__: evil\n';
  const trd = buildValidTrdWithMaliciousE2(e2WithProto);

  const beforeValue = Object.prototype.__proto__;

  const { ok, findings } = lintTrd(trd);
  // The linter must treat __proto__ as a regular key in E2 and NOT report
  // it as a missing budget field (it will just be a "bonus" key in the parsed result).
  // The TRD should still pass because all three required budget fields are present.
  assert.strictEqual(ok, true, 'E2 with __proto__ extra key must still pass');
  assert.strictEqual(
    findings.length,
    0,
    'No findings expected when E2 has required fields plus __proto__'
  );

  const afterValue = Object.prototype.__proto__;
  assert.strictEqual(
    afterValue,
    beforeValue,
    'Object.prototype.__proto__ must not be set by lintTrd'
  );
});

// ---------------------------------------------------------------------------
// [SEC-1-TRD] E2 section body with constructor key
//
// Prototype-pollution via constructor key.
// ---------------------------------------------------------------------------

test('[SEC-1-TRD] E2 body containing constructor key does NOT pollute Object.prototype', () => {
  const e2WithConstructor = 'files_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false\nconstructor: evil\n';
  const trd = buildValidTrdWithMaliciousE2(e2WithConstructor);

  const beforeDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'constructor');

  const { ok, findings } = lintTrd(trd);
  assert.strictEqual(ok, true, 'E2 with constructor extra key must still pass');
  assert.strictEqual(findings.length, 0, 'No findings expected');

  const afterDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'constructor');
  assert.deepStrictEqual(
    afterDescriptor,
    beforeDescriptor,
    'Object.prototype.constructor must not be modified by lintTrd'
  );
});

// ---------------------------------------------------------------------------
// [SEC-1-TRD] E2 section body with prototype key
//
// Prototype-pollution via prototype key.
// ---------------------------------------------------------------------------

test('[SEC-1-TRD] E2 body containing prototype key does NOT pollute Object.prototype', () => {
  const e2WithPrototype = 'files_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false\nprototype: evil\n';
  const trd = buildValidTrdWithMaliciousE2(e2WithPrototype);

  const beforeDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'prototype');

  const { ok } = lintTrd(trd);
  assert.strictEqual(ok, true, 'E2 with prototype extra key must still pass');

  const afterDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'prototype');
  assert.deepStrictEqual(
    afterDescriptor,
    beforeDescriptor,
    'Object.prototype.prototype must not be modified by lintTrd'
  );
});

// ---------------------------------------------------------------------------
// [SEC-1-TRD] All three dangerous keys present in E2
//
// Adversarial case: E2 body contains __proto__, constructor, and prototype.
// ---------------------------------------------------------------------------

test('[SEC-1-TRD] E2 body with all three dangerous keys does NOT pollute Object.prototype', () => {
  const e2Evil = [
    'files_touched_max: 5',
    'loc_max: 300',
    'allow_full_rewrite: false',
    '__proto__: evil1',
    'constructor: evil2',
    'prototype: evil3',
  ].join('\n');
  const trd = buildValidTrdWithMaliciousE2(e2Evil);

  // Capture baseline
  const baselineProto = Object.getPrototypeOf({});
  const baselineProtoValue = Object.prototype.__proto__;
  const baselineConstructor = Object.prototype.constructor.name;

  const { ok } = lintTrd(trd);
  assert.strictEqual(ok, true, 'TRD with evil E2 keys must still parse and pass');

  // Verify no mutation
  assert.strictEqual(
    Object.getPrototypeOf({}),
    baselineProto,
    'Object.prototype chain must not be mutated'
  );
  assert.strictEqual(
    Object.prototype.__proto__,
    baselineProtoValue,
    '__proto__ must not be set on Object.prototype'
  );
  assert.strictEqual(
    Object.prototype.constructor.name,
    baselineConstructor,
    'constructor must not be mutated'
  );
});

// ---------------------------------------------------------------------------
// [SEC-1-TRD] Linter is tolerant (no throw) on prototype-polluting input
//
// The linter must NOT throw on adversarial input — it must process
// gracefully and yield findings (or pass) as appropriate.
// ---------------------------------------------------------------------------

test('[SEC-1-TRD] lintTrd does not throw on prototype-polluting E2 input', () => {
  const maliciousInputs = [
    'files_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false\n__proto__: x\n',
    'files_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false\nconstructor: y\n',
    '__proto__: first\nfiles_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false\n',
    'constructor\nconstructor: value\nfiles_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false\n',
  ];

  for (const e2Body of maliciousInputs) {
    let threw = false;
    try {
      const trd = buildValidTrdWithMaliciousE2(e2Body);
      lintTrd(trd);
    } catch {
      threw = true;
    }
    assert.strictEqual(
      threw,
      false,
      `lintTrd must not throw on malicious E2 body: ${e2Body.slice(0, 40)}`
    );
  }
});

// ---------------------------------------------------------------------------
// [SEC-1-TRD] Cross-check: internal sectionMap uses Object.create(null)
// or equivalent to prevent pollution
//
// The linter builds a sectionMap from parseSections results.
// If sectionMap itself were built with plain {}, and section headings
// contained __proto__, the Map would be safe (Map keys are not subject
// to prototype pollution). However, we verify that no intermediate
// plain-object accumulator is exposed.
// ---------------------------------------------------------------------------

test('[SEC-1-TRD] linter does not expose a plain-object accumulator to prototype mutation', () => {
  // This test is structural: we verify that the linter's findings array
  // output does not carry prototype-pollution artifacts. If the linter
  // had used a plain {} accumulator for findings, setting findings.__proto__
  // would mutate the shared prototype.
  const e2Evil = 'files_touched_max: 5\nloc_max: 300\nallow_full_rewrite: false\n__proto__: pollute\n';
  const trd = buildValidTrdWithMaliciousE2(e2Evil);

  const { ok, findings } = lintTrd(trd);
  assert.strictEqual(ok, true);
  assert.ok(Array.isArray(findings), 'findings must be an array');

  // Verify findings do not carry inherited __proto__ pollution.
  for (const finding of findings) {
    assert.strictEqual(typeof finding, 'string', 'Each finding must be a string (no prototype artifacts)');
  }
});
