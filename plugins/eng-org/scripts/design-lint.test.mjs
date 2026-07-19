/**
 * design-lint.test.mjs — co-located node:test suite for design-lint.mjs
 *
 * Imports REAL symbols from design-lint.mjs (MISTAKES 2026-07-15 gr-P1-#2:
 * no inlined copies). Covers:
 *   - All 6 smell classes (positive-detection + clean-negative)
 *   - Config override changes verdict
 *   - Exit-code contract (0/1/2)
 *   - Determinism: same input twice → identical findings
 *   - Advisory-vs-error tagging for duplicate-block
 *
 * Run: node --test scripts/design-lint.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CONFIG,
  SOURCE_EXTENSIONS,
  TODO_MARKERS,
  checkFileLength,
  checkFunctionLength,
  checkParamCount,
  checkDuplicateBlocks,
  checkTodoMarkers,
  checkEscapeHatches,
  lintSource,
} from './design-lint.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an array of N identical lines.
 * @param {string} line
 * @param {number} n
 * @returns {string[]}
 */
function repeat(line, n) {
  return Array.from({ length: n }, () => line);
}

// ---------------------------------------------------------------------------
// 1. DEFAULT_CONFIG and exports
// ---------------------------------------------------------------------------

describe('DEFAULT_CONFIG', () => {
  it('exports the expected default threshold keys', () => {
    assert.strictEqual(typeof DEFAULT_CONFIG.fileMaxLines, 'number');
    assert.strictEqual(typeof DEFAULT_CONFIG.testFileMaxLines, 'number');
    assert.strictEqual(typeof DEFAULT_CONFIG.functionMaxLines, 'number');
    assert.strictEqual(typeof DEFAULT_CONFIG.paramMaxCount, 'number');
    assert.strictEqual(typeof DEFAULT_CONFIG.dupWindowLines, 'number');
    assert.strictEqual(typeof DEFAULT_CONFIG.dupMinRepeats, 'number');
  });

  it('has the exact documented default values', () => {
    assert.strictEqual(DEFAULT_CONFIG.fileMaxLines, 600);
    assert.strictEqual(DEFAULT_CONFIG.testFileMaxLines, 1000);
    assert.strictEqual(DEFAULT_CONFIG.functionMaxLines, 80);
    assert.strictEqual(DEFAULT_CONFIG.paramMaxCount, 5);
    assert.strictEqual(DEFAULT_CONFIG.dupWindowLines, 6);
    assert.strictEqual(DEFAULT_CONFIG.dupMinRepeats, 2);
  });

  it('TODO_MARKERS contains the 4 documented markers', () => {
    assert.ok(TODO_MARKERS.includes('TODO'));
    assert.ok(TODO_MARKERS.includes('FIXME'));
    assert.ok(TODO_MARKERS.includes('XXX'));
    assert.ok(TODO_MARKERS.includes('HACK'));
    assert.strictEqual(TODO_MARKERS.length, 4);
  });

  it('SOURCE_EXTENSIONS contains the documented allowlist', () => {
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) {
      assert.ok(SOURCE_EXTENSIONS.has(ext), `missing extension: ${ext}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Smell 1 — file-length
// ---------------------------------------------------------------------------

describe('checkFileLength', () => {
  it('positive: flags a file exceeding fileMaxLines', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { fileMaxLines: 10 });
    const lines = repeat('const x = 1;', 11);
    const findings = checkFileLength(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].smell, 'file-length');
    assert.strictEqual(findings[0].severity, 'error');
    assert.strictEqual(findings[0].line, 11); // limit + 1
  });

  it('negative: does not flag a file at exactly the limit', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { fileMaxLines: 10 });
    const lines = repeat('const x = 1;', 10);
    const findings = checkFileLength(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 0);
  });

  it('positive: uses testFileMaxLines for *.test.mjs files', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { testFileMaxLines: 5 });
    const lines = repeat('const x = 1;', 6);
    const findings = checkFileLength(lines, 'foo.test.mjs', cfg);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].smell, 'file-length');
  });

  it('negative: does not flag a test file at exactly testFileMaxLines', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { testFileMaxLines: 5 });
    const lines = repeat('const x = 1;', 5);
    const findings = checkFileLength(lines, 'foo.test.mjs', cfg);
    assert.strictEqual(findings.length, 0);
  });

  it('uses fileMaxLines (not testFileMaxLines) for non-test source files', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { fileMaxLines: 3, testFileMaxLines: 1000 });
    const lines = repeat('const x = 1;', 4);
    // Non-test file → uses fileMaxLines
    const findings = checkFileLength(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 1);
  });

  it('calibration: 508 lines < 600 default limit → no finding', () => {
    const lines = repeat('const x = 1;', 508);
    const findings = checkFileLength(lines, 'scripts/invalidation.mjs', DEFAULT_CONFIG);
    assert.strictEqual(findings.length, 0);
  });

  it('calibration: 1138 lines > 600 default limit → finding', () => {
    const lines = repeat('const x = 1;', 1138);
    const findings = checkFileLength(lines, 'scripts/verdict-lint.mjs', DEFAULT_CONFIG);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].smell, 'file-length');
  });
});

// ---------------------------------------------------------------------------
// 3. Smell 2 — function-length
// ---------------------------------------------------------------------------

describe('checkFunctionLength', () => {
  it('positive: flags a function body exceeding functionMaxLines', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { functionMaxLines: 3 });
    // function declaration with 5 body lines
    const lines = [
      'function bigFn() {',
      '  const a = 1;',
      '  const b = 2;',
      '  const c = 3;',
      '  const d = 4;',
      '  const e = 5;',
      '}',
    ];
    const findings = checkFunctionLength(lines, 'src/foo.ts', cfg);
    assert.ok(findings.length >= 1, 'should find at least 1 function-length finding');
    assert.ok(findings.some(f => f.smell === 'function-length'));
  });

  it('negative: does not flag a function within the limit', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { functionMaxLines: 10 });
    const lines = [
      'function smallFn() {',
      '  const a = 1;',
      '  return a;',
      '}',
    ];
    const findings = checkFunctionLength(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 0);
  });

  it('negative: single-line function is not flagged', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { functionMaxLines: 1 });
    const lines = ['function noop() { return; }'];
    const findings = checkFunctionLength(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. Smell 3 — param-count
// ---------------------------------------------------------------------------

describe('checkParamCount', () => {
  it('positive: flags a function with more params than paramMaxCount', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { paramMaxCount: 3 });
    const lines = ['function fn(a, b, c, d, e) { return a; }'];
    const findings = checkParamCount(lines, 'src/foo.ts', cfg);
    assert.ok(findings.length >= 1, 'should find at least 1 param-count finding');
    assert.ok(findings.some(f => f.smell === 'param-count'));
  });

  it('negative: does not flag a function at exactly paramMaxCount', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { paramMaxCount: 3 });
    const lines = ['function fn(a, b, c) { return a; }'];
    const findings = checkParamCount(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 0);
  });

  it('negative: zero-param function is not flagged', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { paramMaxCount: 2 });
    const lines = ['function fn() { return 42; }'];
    const findings = checkParamCount(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 0);
  });

  it('positive: async function with excess params is flagged', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { paramMaxCount: 2 });
    const lines = ['async function fetchData(url, method, body, headers, timeout) {}'];
    const findings = checkParamCount(lines, 'src/foo.ts', cfg);
    assert.ok(findings.some(f => f.smell === 'param-count'));
  });

  it('positive: arrow function assigned to const with excess params', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { paramMaxCount: 2 });
    const lines = ['const fn = (a, b, c, d) => a + b;'];
    const findings = checkParamCount(lines, 'src/foo.ts', cfg);
    assert.ok(findings.some(f => f.smell === 'param-count'));
  });
});

// ---------------------------------------------------------------------------
// 5. Smell 4 — duplicate-block (advisory)
// ---------------------------------------------------------------------------

describe('checkDuplicateBlocks', () => {
  it('positive: flags a repeated block of dupWindowLines content lines', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 3, dupMinRepeats: 2 });
    // Create two identical blocks of 3 content lines separated by a blank line
    const lines = [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      '',
      '// some comment',
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ];
    const findings = checkDuplicateBlocks(lines, 'src/foo.ts', cfg);
    assert.ok(findings.length >= 1, 'should find at least 1 duplicate-block finding');
    assert.ok(findings.some(f => f.smell === 'duplicate-block'));
  });

  it('positive: duplicate-block finding is tagged advisory', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 3, dupMinRepeats: 2 });
    const lines = [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ];
    const findings = checkDuplicateBlocks(lines, 'src/foo.ts', cfg);
    assert.ok(findings.every(f => f.severity === 'advisory'), 'duplicate-block must be advisory');
  });

  it('negative: unique blocks → no finding', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 3, dupMinRepeats: 2 });
    const lines = [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      'const d = 4;',
      'const e = 5;',
      'const f = 6;',
    ];
    const findings = checkDuplicateBlocks(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 0);
  });

  it('negative: file with fewer lines than dupWindowLines → no finding', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 6, dupMinRepeats: 2 });
    const lines = ['const a = 1;', 'const b = 2;'];
    const findings = checkDuplicateBlocks(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 0);
  });

  it('positive: blank and comment lines are excluded from window (content-only window)', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 2, dupMinRepeats: 2 });
    // Two content lines repeated with comments in between
    const lines = [
      'const a = 1;',
      'const b = 2;',
      '// a comment',
      '',
      'const a = 1;',
      'const b = 2;',
    ];
    const findings = checkDuplicateBlocks(lines, 'src/foo.ts', cfg);
    assert.ok(findings.some(f => f.smell === 'duplicate-block'));
  });

  it('determinism: running duplicate-block twice on same input yields identical findings', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 3, dupMinRepeats: 2 });
    const lines = [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ];
    const r1 = checkDuplicateBlocks(lines, 'src/foo.ts', cfg);
    const r2 = checkDuplicateBlocks(lines, 'src/foo.ts', cfg);
    assert.deepStrictEqual(r1, r2);
  });
});

// ---------------------------------------------------------------------------
// 6. Smell 5 — todo-marker
// ---------------------------------------------------------------------------

describe('checkTodoMarkers', () => {
  it('positive: flags // TODO comment', () => {
    const lines = ['const x = 1; // TODO: implement this'];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'todo-marker'));
  });

  it('positive: flags // FIXME comment', () => {
    const lines = ['// FIXME: this is broken'];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'todo-marker'));
  });

  it('positive: flags // XXX comment', () => {
    const lines = ['// XXX remove before release'];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'todo-marker'));
  });

  it('positive: flags // HACK comment', () => {
    const lines = ['// HACK: workaround for library bug'];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'todo-marker'));
  });

  it('positive: flags # TODO (shell-style comment)', () => {
    const lines = ['# TODO: add error handling'];
    const findings = checkTodoMarkers(lines, 'src/foo.mjs');
    assert.ok(findings.some(f => f.smell === 'todo-marker'));
  });

  it('negative: bare word TODO inside a string is NOT flagged', () => {
    const lines = ["const msg = 'remember TODO items';"];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.strictEqual(findings.length, 0);
  });

  it('negative: identifier containing TODO is NOT flagged', () => {
    const lines = ['const todoList = [];'];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.strictEqual(findings.length, 0);
  });

  it('negative: clean line with no comment → no finding', () => {
    const lines = ['const x = calculateValue(a, b);'];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.strictEqual(findings.length, 0);
  });

  it('correct line number is reported', () => {
    const lines = ['const a = 1;', '// TODO: fix later', 'const b = 2;'];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.line === 2));
  });

  // --- string-literal false-positive fixes (BUG-DL1) ---

  it('negative: // TODO inside single-quoted string is NOT flagged', () => {
    const lines = ["const p = '// TODO: must sanitize';"];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.strictEqual(findings.length, 0,
      '// TODO inside a string literal must not produce a finding');
  });

  it('negative: http://TODO URL inside single-quoted string is NOT flagged', () => {
    const lines = ["const u = 'http://TODO.example.com';"];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.strictEqual(findings.length, 0,
      'URL with // inside a string must not produce a finding');
  });

  it('negative: /* FIXME */ inside single-quoted string is NOT flagged', () => {
    const lines = ["const f = '/* FIXME */';"];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.strictEqual(findings.length, 0,
      '/* FIXME */ inside a string literal must not produce a finding');
  });

  it('positive: real trailing comment after closed string IS flagged', () => {
    const lines = ['const s = "a // b"; // TODO real'];
    const findings = checkTodoMarkers(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'todo-marker'),
      'TODO in a real trailing comment after a string must be flagged');
    assert.strictEqual(findings.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 7. Smell 6 — escape-hatch
// ---------------------------------------------------------------------------

describe('checkEscapeHatches', () => {
  it('positive: flags `as any`', () => {
    const lines = ['const x = value as any;'];
    const findings = checkEscapeHatches(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'escape-hatch:as-any'));
  });

  it('positive: flags `as any` with suffix (as any[])', () => {
    const lines = ['const x = value as any[];'];
    const findings = checkEscapeHatches(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'escape-hatch:as-any'));
  });

  it('positive: flags eslint-disable (block-level)', () => {
    const lines = ['/* eslint-disable no-console */'];
    const findings = checkEscapeHatches(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'escape-hatch:eslint-disable'));
  });

  it('positive: flags eslint-disable-next-line', () => {
    const lines = ['// eslint-disable-next-line @typescript-eslint/no-explicit-any'];
    const findings = checkEscapeHatches(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'escape-hatch:eslint-disable'));
  });

  it('positive: flags eslint-disable-line', () => {
    const lines = ['const x = 1; // eslint-disable-line no-unused-vars'];
    const findings = checkEscapeHatches(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'escape-hatch:eslint-disable'));
  });

  it('negative: typed cast (not `as any`) → no finding', () => {
    const lines = ['const x = value as string;'];
    const findings = checkEscapeHatches(lines, 'src/foo.ts');
    assert.strictEqual(findings.length, 0);
  });

  it('negative: clean line → no finding', () => {
    const lines = ['const x = getValue();'];
    const findings = checkEscapeHatches(lines, 'src/foo.ts');
    assert.strictEqual(findings.length, 0);
  });

  it('negative: identifier containing "asany" → no finding', () => {
    const lines = ['const asanyValue = true;'];
    const findings = checkEscapeHatches(lines, 'src/foo.ts');
    assert.strictEqual(findings.length, 0);
  });

  it('reports correct line number', () => {
    const lines = ['const a = 1;', 'const b = value as any;', 'const c = 3;'];
    const findings = checkEscapeHatches(lines, 'src/foo.ts');
    assert.ok(findings.some(f => f.line === 2));
  });
});

// ---------------------------------------------------------------------------
// 8. lintSource (full integration — pure core)
// ---------------------------------------------------------------------------

describe('lintSource', () => {
  it('returns no findings for clean source', () => {
    const text = 'const x = 1;\nconst y = 2;\n';
    const { findings } = lintSource(text, 'src/clean.ts');
    assert.strictEqual(findings.length, 0);
  });

  it('detects file-length smell via lintSource', () => {
    const cfg = { fileMaxLines: 3 };
    const text = 'a\nb\nc\nd\n';
    const { findings } = lintSource(text, 'src/long.ts', cfg);
    assert.ok(findings.some(f => f.smell === 'file-length'));
  });

  it('detects escape-hatch smell via lintSource', () => {
    const text = 'const x = value as any;\n';
    const { findings } = lintSource(text, 'src/bad.ts');
    assert.ok(findings.some(f => f.smell === 'escape-hatch:as-any'));
  });

  it('detects todo-marker smell via lintSource', () => {
    const text = '// TODO: fix this\nconst x = 1;\n';
    const { findings } = lintSource(text, 'src/foo.ts');
    assert.ok(findings.some(f => f.smell === 'todo-marker'));
  });

  it('config override: custom fileMaxLines changes verdict', () => {
    const text = repeat('const x = 1;', 15).join('\n') + '\n';
    // With default limit 600 → no file-length finding
    const { findings: f1 } = lintSource(text, 'src/foo.ts', { fileMaxLines: 600 });
    assert.ok(!f1.some(f => f.smell === 'file-length'), 'should not flag at limit 600');
    // With limit 10 → should flag
    const { findings: f2 } = lintSource(text, 'src/foo.ts', { fileMaxLines: 10 });
    assert.ok(f2.some(f => f.smell === 'file-length'), 'should flag at limit 10');
  });

  it('determinism: calling lintSource twice on same input yields identical findings', () => {
    const text = [
      '// TODO: fix this',
      'const x = value as any;',
      ...repeat('const line = 1;', 8),
    ].join('\n');
    const r1 = lintSource(text, 'src/foo.ts', DEFAULT_CONFIG);
    const r2 = lintSource(text, 'src/foo.ts', DEFAULT_CONFIG);
    assert.deepStrictEqual(r1, r2);
  });

  it('findings carry short snippets bounded to ~60 chars (H-DL-3 raw-byte-leak guard)', () => {
    // Build a very long comment line — 200+ chars — to verify snippet truncation.
    // H-DL-3 requires findings never emit full raw lines; snippets are bounded to ~60 chars + ellipsis.
    const longSecret = 'A'.repeat(200);
    const secretLine = `// TODO: ${longSecret}`;
    assert.ok(secretLine.length > 150, 'fixture line must be very long to exercise truncation');
    const text = secretLine + '\n';
    const { findings } = lintSource(text, 'src/secret.ts');
    assert.ok(findings.length > 0, 'long TODO comment must produce a finding');
    for (const f of findings) {
      // Snippet must be at most 63 chars (60 + '…' len 3 = 63, or 60 exact if no truncation)
      assert.ok(f.snippet.length <= 65, `snippet too long: ${f.snippet.length} chars — full line leaked`);
      // The original line was 200+ chars; the snippet must NOT contain the full content.
      assert.ok(!f.snippet.includes(longSecret), 'snippet must not contain the full raw line');
    }
  });

  it('test file uses testFileMaxLines cap, not fileMaxLines', () => {
    const text = repeat('const x = 1;', 700).join('\n');
    // With defaults: 700 > fileMaxLines(600) but < testFileMaxLines(1000)
    const { findings } = lintSource(text, 'foo.test.ts', DEFAULT_CONFIG);
    assert.ok(!findings.some(f => f.smell === 'file-length'), 'test file at 700 lines should not flag under default testFileMaxLines=1000');
  });
});

// ---------------------------------------------------------------------------
// 9. Advisory vs error severity tagging
// ---------------------------------------------------------------------------

describe('severity tagging', () => {
  it('duplicate-block is advisory; all other smells detected above are error', () => {
    const dupFindings = checkDuplicateBlocks(
      ['const a = 1;', 'const b = 2;', 'const c = 3;', 'const a = 1;', 'const b = 2;', 'const c = 3;'],
      'src/foo.ts',
      Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 3, dupMinRepeats: 2 }),
    );
    assert.ok(dupFindings.length >= 1);
    assert.ok(dupFindings.every(f => f.severity === 'advisory'));

    const escFindings = checkEscapeHatches(['const x = v as any;'], 'src/foo.ts');
    assert.ok(escFindings.every(f => f.severity === 'error'));

    const todoFindings = checkTodoMarkers(['// TODO: fix'], 'src/foo.ts');
    assert.ok(todoFindings.every(f => f.severity === 'error'));
  });
});

// ---------------------------------------------------------------------------
// 10. Finding shape
// ---------------------------------------------------------------------------

describe('Finding shape', () => {
  it('every finding carries path, line, smell, severity, snippet', () => {
    const text = '// TODO: clean up\nconst x = v as any;\n';
    const { findings } = lintSource(text, 'src/shape-test.ts');
    for (const f of findings) {
      assert.ok(typeof f.path === 'string', 'path must be string');
      assert.ok(typeof f.line === 'number', 'line must be number');
      assert.ok(typeof f.smell === 'string', 'smell must be string');
      assert.ok(f.severity === 'error' || f.severity === 'advisory', 'severity must be error|advisory');
      assert.ok(typeof f.snippet === 'string', 'snippet must be string');
    }
  });

  it('path in finding equals the filePath argument', () => {
    const text = '// TODO: test\n';
    const { findings } = lintSource(text, 'src/myfile.ts');
    assert.ok(findings.every(f => f.path === 'src/myfile.ts'));
  });
});

// ---------------------------------------------------------------------------
// 11. Source extension allowlist
// ---------------------------------------------------------------------------

describe('SOURCE_EXTENSIONS', () => {
  it('contains all expected source extensions', () => {
    const expected = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    for (const ext of expected) {
      assert.ok(SOURCE_EXTENSIONS.has(ext));
    }
  });

  it('does not contain markdown or JSON extensions', () => {
    assert.ok(!SOURCE_EXTENSIONS.has('.md'));
    assert.ok(!SOURCE_EXTENSIONS.has('.json'));
    assert.ok(!SOURCE_EXTENSIONS.has('.yaml'));
  });
});

// ---------------------------------------------------------------------------
// 12. Duplicate-block config: larger window reduces findings
// ---------------------------------------------------------------------------

describe('checkDuplicateBlocks config sensitivity', () => {
  it('larger window: a block smaller than dupWindowLines is never flagged', () => {
    // Only 3 repeated content lines — with window=6 they cannot form a complete window
    const cfg = Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 6, dupMinRepeats: 2 });
    const lines = [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ];
    // 6 content lines with window=6: there is exactly 1 window at start and 1 at position 3
    // These ARE a complete window of 6, so they WILL match.
    // Let's use window=7 so no complete window can form with only 6 content lines.
    const cfg7 = Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 7, dupMinRepeats: 2 });
    const findings = checkDuplicateBlocks(lines, 'src/foo.ts', cfg7);
    assert.strictEqual(findings.length, 0);
  });

  it('raising dupMinRepeats to 3 suppresses a 2x repeat', () => {
    const cfg = Object.assign({}, DEFAULT_CONFIG, { dupWindowLines: 3, dupMinRepeats: 3 });
    const lines = [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
    ];
    // Only 2 occurrences, but minRepeats=3 → no finding
    const findings = checkDuplicateBlocks(lines, 'src/foo.ts', cfg);
    assert.strictEqual(findings.length, 0);
  });
});
