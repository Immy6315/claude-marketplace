/**
 * invalidation.audit.test.mjs — adversarial / gap-coverage unit tests
 * authored by test-unit (independent of dev).
 *
 * These tests cover cases NOT present in invalidation.test.mjs:
 *   A. Genuine cyclic dependency (A→B→C→A) — BFS cycle-safety.
 *   B. Re-export chain: index.js re-exports from util.ts re-exports from core.ts.
 *   C. BFS hop-cap enforcement: a 25-node chain; tier surface at node 22 must NOT
 *      be reached (it is > 20 hops from the changed root).
 *   D. Empty tier surface → intersects: false, matched: [].
 *   E. TypeError thrown when changedFiles is not an array.
 *   F. TypeError thrown when tierSurfaces is not an object.
 *   G. TypeError thrown when dependencyGraph is not an object.
 *   H. head field is always empty string from the pure core.
 *   I. Multiple independent changed files each invalidate their own tiers.
 *
 * Run: node --test scripts/invalidation.audit.test.mjs
 *
 * Rules (MISTAKES-informed, same as dev's test file):
 *   - One assertion per test() block.
 *   - Test title matches what the body asserts.
 *   - No ">= 0" under a "> 0" title.
 *   - No import outside Node stdlib.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInvalidation } from './invalidation.mjs';

// ---------------------------------------------------------------------------
// Test A — genuine cyclic dependency graph: A→B→C→A
// BFS with visited-set must not hang or throw; all three files reachable.
// ---------------------------------------------------------------------------

test('cyclic graph A→B→C→A: all three files reachable from A, no hang', () => {
  const result = computeInvalidation({
    changedFiles: ['src/a.ts'],
    projectRoot: '/tmp',
    tierSurfaces: {
      'test-unit': ['src/c.ts'],
    },
    dependencyGraph: {
      'src/a.ts': ['src/b.ts'],
      'src/b.ts': ['src/c.ts'],
      'src/c.ts': ['src/a.ts'], // back-edge creates a cycle
    },
  });

  // C is reachable even through a cycle — tier must be invalidated
  assert.strictEqual(result.perTier['test-unit'].intersects, true);
});

// ---------------------------------------------------------------------------
// Test B — re-export / index chain:
// changing entry.ts invalidates a tier whose surface contains core.ts,
// through the chain entry.ts → index.ts → util.ts → core.ts
// ---------------------------------------------------------------------------

test('re-export chain entry→index→util→core: tier containing core.ts is invalidated', () => {
  const result = computeInvalidation({
    changedFiles: ['src/entry.ts'],
    projectRoot: '/tmp',
    tierSurfaces: {
      'test-integration': ['src/core.ts'],
    },
    dependencyGraph: {
      'src/entry.ts': ['src/index.ts'],
      'src/index.ts': ['src/util.ts'],
      'src/util.ts': ['src/core.ts'],
      'src/core.ts': [],
    },
  });

  assert.strictEqual(result.perTier['test-integration'].intersects, true);
});

// ---------------------------------------------------------------------------
// Test C — BFS hop cap at 20:
// Build a 25-node linear chain (node_0 → node_1 → … → node_24).
// Change node_0. node_21 is at hop 21 (beyond cap of 20).
// Tier surface containing node_21 must NOT be invalidated.
// ---------------------------------------------------------------------------

test('BFS hop cap 20: node at hop 21 is NOT reached and does not invalidate its tier', () => {
  const N = 25;
  /** @type {Record<string, string[]>} */
  const graph = {};
  for (let i = 0; i < N; i++) {
    graph[`src/node_${i}.ts`] = i < N - 1 ? [`src/node_${i + 1}.ts`] : [];
  }

  const result = computeInvalidation({
    changedFiles: ['src/node_0.ts'],
    projectRoot: '/tmp',
    // tier surface: only node_21 (hop 21, beyond the 20-hop cap)
    tierSurfaces: {
      'test-unit': ['src/node_21.ts'],
    },
    dependencyGraph: graph,
  });

  // node_21 is at hop 21 — beyond cap — must NOT be in closure
  assert.strictEqual(result.perTier['test-unit'].intersects, false);
});

// ---------------------------------------------------------------------------
// Test D — empty tier surface → intersects: false, matched: []
// ---------------------------------------------------------------------------

test('tier with empty surface array → intersects: false and matched: []', () => {
  const result = computeInvalidation({
    changedFiles: ['src/foo.ts'],
    projectRoot: '/tmp',
    tierSurfaces: {
      'test-load': [],
    },
    dependencyGraph: {
      'src/foo.ts': [],
    },
  });

  assert.deepStrictEqual(result.perTier['test-load'], { intersects: false, matched: [] });
});

// ---------------------------------------------------------------------------
// Test E — changedFiles not an array → throws TypeError
// ---------------------------------------------------------------------------

test('changedFiles not an array → throws TypeError', () => {
  assert.throws(
    () =>
      computeInvalidation({
        changedFiles: 'src/foo.ts', // string, not array
        projectRoot: '/tmp',
        tierSurfaces: {},
        dependencyGraph: {},
      }),
    TypeError
  );
});

// ---------------------------------------------------------------------------
// Test F — tierSurfaces not an object → throws TypeError
// ---------------------------------------------------------------------------

test('tierSurfaces not an object (null) → throws TypeError', () => {
  assert.throws(
    () =>
      computeInvalidation({
        changedFiles: [],
        projectRoot: '/tmp',
        tierSurfaces: null,
        dependencyGraph: {},
      }),
    TypeError
  );
});

// ---------------------------------------------------------------------------
// Test G — dependencyGraph not an object → throws TypeError
// ---------------------------------------------------------------------------

test('dependencyGraph not an object (null) → throws TypeError', () => {
  assert.throws(
    () =>
      computeInvalidation({
        changedFiles: [],
        projectRoot: '/tmp',
        tierSurfaces: {},
        dependencyGraph: null,
      }),
    TypeError
  );
});

// ---------------------------------------------------------------------------
// Test H — pure core always returns head as empty string (CLI fills it in)
// ---------------------------------------------------------------------------

test('pure core always returns head as empty string', () => {
  const result = computeInvalidation({
    changedFiles: ['src/a.ts'],
    projectRoot: '/tmp',
    tierSurfaces: { 'test-unit': ['src/a.ts'] },
    dependencyGraph: { 'src/a.ts': [] },
  });

  assert.strictEqual(result.head, '');
});

// ---------------------------------------------------------------------------
// Test I — multiple independent changed files each invalidate their own tier
// file_x.ts → tier-x; file_y.ts → tier-y; no cross-contamination
// ---------------------------------------------------------------------------

test('two independent changed files each invalidate only their own tier', () => {
  const result = computeInvalidation({
    changedFiles: ['src/x.ts', 'src/y.ts'],
    projectRoot: '/tmp',
    tierSurfaces: {
      'tier-x': ['src/x.ts'],
      'tier-y': ['src/y.ts'],
      'tier-z': ['src/z.ts'], // untouched
    },
    dependencyGraph: {
      'src/x.ts': [],
      'src/y.ts': [],
      'src/z.ts': [],
    },
  });

  assert.ok(
    result.perTier['tier-x'].intersects &&
      result.perTier['tier-y'].intersects &&
      !result.perTier['tier-z'].intersects
  );
});
