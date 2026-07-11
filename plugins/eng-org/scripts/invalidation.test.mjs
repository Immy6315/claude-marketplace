/**
 * invalidation.test.mjs — unit tests for the pure core of invalidation.mjs
 *
 * Run: node --test scripts/invalidation.test.mjs
 *
 * Rules (MISTAKES-informed):
 *   - One assertion per test() block (2026-07-11 REQ-08).
 *   - Test title must match what the body asserts (2026-07-08, 2026-07-10).
 *   - No ">= 0" under a "> 0" title (2026-07-11 REQ-05).
 *   - No import outside Node stdlib (task constraint).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInvalidation } from './invalidation.mjs';

// ---------------------------------------------------------------------------
// Test 1 — no changes → every tier intersects=false, matched=[]
// ---------------------------------------------------------------------------

test('no changes → every tier intersects=false, matched=[]', () => {
  const result = computeInvalidation({
    changedFiles: [],
    projectRoot: '/tmp',
    tierSurfaces: {
      'test-unit': ['src/foo.ts', 'src/bar.ts'],
      'test-integration': ['src/db.ts'],
    },
    dependencyGraph: {
      'src/foo.ts': ['src/bar.ts'],
      'src/bar.ts': [],
      'src/db.ts': [],
    },
  });

  assert.deepStrictEqual(result.perTier['test-unit'], { intersects: false, matched: [] });
});

// ---------------------------------------------------------------------------
// Test 2 — single file change hits owning tier only
// ---------------------------------------------------------------------------

test('single file change hits owning tier only — other tier stays intersects=false', () => {
  const result = computeInvalidation({
    changedFiles: ['src/foo.ts'],
    projectRoot: '/tmp',
    tierSurfaces: {
      'test-unit': ['src/foo.ts'],
      'test-integration': ['src/db.ts'],
    },
    dependencyGraph: {
      'src/foo.ts': [],
      'src/db.ts': [],
    },
  });

  assert.strictEqual(result.perTier['test-integration'].intersects, false);
});

// ---------------------------------------------------------------------------
// Test 3 — transitive closure two hops away hits target tier
// ---------------------------------------------------------------------------

test('transitive closure: changing A (imports B imports C) invalidates tier whose surface contains C', () => {
  // A → B → C; tier surface contains C
  const result = computeInvalidation({
    changedFiles: ['src/a.ts'],
    projectRoot: '/tmp',
    tierSurfaces: {
      'test-unit': ['src/c.ts'],
    },
    dependencyGraph: {
      'src/a.ts': ['src/b.ts'],
      'src/b.ts': ['src/c.ts'],
      'src/c.ts': [],
    },
  });

  assert.strictEqual(result.perTier['test-unit'].intersects, true);
});

// ---------------------------------------------------------------------------
// Test 4 — empty intersection pins all tiers (deterministic, no side channel)
// ---------------------------------------------------------------------------

test('files changed outside any tier surface → all tiers intersects=false (deterministic pin)', () => {
  const result = computeInvalidation({
    changedFiles: ['docs/README.md'],
    projectRoot: '/tmp',
    tierSurfaces: {
      'test-unit': ['src/foo.ts'],
      'test-integration': ['src/db.ts'],
      'reviewer-security': ['src/auth.ts'],
    },
    dependencyGraph: {
      'docs/README.md': [],
      'src/foo.ts': [],
      'src/db.ts': [],
      'src/auth.ts': [],
    },
  });

  const allPinned = Object.values(result.perTier).every((t) => !t.intersects);
  assert.ok(allPinned);
});

// ---------------------------------------------------------------------------
// Test 5 — file outside projectRoot throws (non-ENOENT re-throw)
// ---------------------------------------------------------------------------

test('invalid projectRoot type → throws TypeError', () => {
  assert.throws(
    () =>
      computeInvalidation({
        changedFiles: [],
        projectRoot: '',
        tierSurfaces: {},
        dependencyGraph: {},
      }),
    TypeError
  );
});

// ---------------------------------------------------------------------------
// Test 6 — all-markdown-changes case: every code tier intersects=false
// (documents intended behavior: markdown changes do not invalidate code tiers)
// ---------------------------------------------------------------------------

test('all-markdown changed files → every code tier intersects=false', () => {
  const result = computeInvalidation({
    changedFiles: ['docs/CHANGELOG.md', 'README.md'],
    projectRoot: '/tmp',
    tierSurfaces: {
      'test-unit': ['src/foo.ts', 'src/bar.ts'],
      'test-integration': ['src/db.ts'],
      'reviewer-architecture': ['src/server.ts'],
    },
    dependencyGraph: {
      'docs/CHANGELOG.md': [],
      'README.md': [],
      'src/foo.ts': ['src/bar.ts'],
      'src/bar.ts': [],
      'src/db.ts': [],
      'src/server.ts': [],
    },
  });

  assert.strictEqual(result.perTier['test-unit'].intersects, false);
});

// ---------------------------------------------------------------------------
// Test 7 — 1000-file synthetic dependency graph completes in < 2000ms
// (guards against O(N²) regression per reviewer-performance rule)
// ---------------------------------------------------------------------------

test('1000-file synthetic dependency graph — computeInvalidation completes in under 2000ms', () => {
  const N = 1000;
  /** @type {Record<string, string[]>} */
  const dependencyGraph = {};
  /** @type {string[]} */
  const surface = [];

  // Build a linear chain: file_0 → file_1 → … → file_999
  for (let i = 0; i < N; i++) {
    const name = `src/file_${i}.ts`;
    dependencyGraph[name] = i < N - 1 ? [`src/file_${i + 1}.ts`] : [];
    surface.push(name);
  }

  const start = performance.now();

  computeInvalidation({
    changedFiles: ['src/file_0.ts'],
    projectRoot: '/tmp',
    tierSurfaces: { 'test-unit': surface },
    dependencyGraph,
  });

  const duration = performance.now() - start;

  assert.ok(duration < 2000, `Expected < 2000ms, got ${duration.toFixed(1)}ms`);
});
