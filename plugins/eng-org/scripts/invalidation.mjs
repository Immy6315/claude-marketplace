#!/usr/bin/env node
/**
 * invalidation.mjs — transitive-import-closure / layer-based invalidation
 * for the eng-org fix-iteration protocol (Feature 2, REQ-20260711-d904-10).
 *
 * CLI usage:
 *   node scripts/invalidation.mjs \
 *     --changed <file>,<file> \
 *     --project-root <path> \
 *     --surfaces <path-to-json>
 *
 * Emits JSON to stdout. Non-zero exit on validation error.
 *
 * Pure core: computeInvalidation() accepts a pre-built dependency graph and
 * returns a deterministic result. No I/O inside the core.
 *
 * CLI wrapper: builds the dependency graph by regex-parsing import/require
 * statements in the project, then calls the core.
 *
 * Constraints (MISTAKES-informed):
 *   - fs.lstatSync (not statSync) for all filesystem probes (2026-07-11 REQ-03).
 *   - No bare catch {}; rethrow non-ENOENT (2026-07-11 REQ-07).
 *   - No Date.now() in the pure core; accept optional `now` param for CLI.
 *   - No machine-absolute paths committed (2026-07-10 REQ-02).
 *   - JSDoc typedef for closed-set fields (2026-07-11 REQ-03).
 *   - No `any` inference; typed via JSDoc @typedef and @returns.
 */

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// JSDoc typedefs
// ---------------------------------------------------------------------------

/**
 * @typedef {'test-unit' | 'test-integration' | 'test-e2e' | 'test-regression' | 'test-load' | 'reviewer-architecture' | 'reviewer-security' | 'reviewer-performance' | 'reviewer-standards' | 'reviewer-observability' | 'reviewer-indexes'} TierName
 */

/** @type {ReadonlySet<string>} */
const KNOWN_TIERS = new Set([
  'test-unit', 'test-integration', 'test-e2e', 'test-regression', 'test-load',
  'reviewer-architecture', 'reviewer-security', 'reviewer-performance',
  'reviewer-standards', 'reviewer-observability', 'reviewer-indexes',
]);

/**
 * Runtime assertion that a tier name is one of the known literals.
 * Throws at input-validation time so callers get a clear error instead of
 * silently producing a result for a typo'd tier name (e.g. 'test-nit').
 *
 * @param {string} name
 * @returns {void}
 */
export function assertKnownTier(name) {
  if (!KNOWN_TIERS.has(name)) {
    throw new Error(`Unknown tier: ${name}`);
  }
}

/**
 * Per-tier invalidation result.
 * @typedef {{ intersects: boolean, matched: string[] }} TierResult
 */

/**
 * Input to the pure core.
 * @typedef {{
 *   changedFiles: string[],
 *   projectRoot: string,
 *   tierSurfaces: Record<TierName, string[]>,
 *   dependencyGraph: Record<string, string[]>
 * }} InvalidationInput
 */

/**
 * Inputs echoed back by the CLI wrapper (for self-describing audit records).
 * @typedef {{
 *   changed: string[],
 *   projectRoot: string,
 *   surfacesPath: string,
 *   changedFilePath?: string
 * }} InvalidationInputsEcho
 */

/**
 * Output of the pure core (head and inputs are filled by the CLI wrapper,
 * not the core — keeping the core deterministic and I/O-free).
 *
 * CLI output shape example:
 * {
 *   "inputs": {
 *     "changed": ["src/foo.ts", "src/bar.ts"],
 *     "projectRoot": "/abs/path/to/repo",
 *     "surfacesPath": "/abs/path/to/surfaces.json"
 *   },
 *   "head": "<current-git-sha>",
 *   "perTier": {
 *     "test-unit": { "intersects": true, "matched": ["src/foo.ts"] },
 *     "test-integration": { "intersects": false, "matched": [] }
 *   }
 * }
 *
 * @typedef {{
 *   inputs: InvalidationInputsEcho,
 *   head: string,
 *   perTier: Record<TierName, TierResult>
 * }} InvalidationResult
 */

// ---------------------------------------------------------------------------
// Pure core — no I/O
// ---------------------------------------------------------------------------

const MAX_BFS_HOPS = 20;

/**
 * Compute the transitive import closure (BFS, capped at MAX_BFS_HOPS hops)
 * from the set of changed files, following edges in dependencyGraph.
 *
 * @param {string[]} changedFiles - repo-relative paths of changed files.
 * @param {Record<string, string[]>} dependencyGraph - file → files it imports.
 * @returns {Set<string>} the full transitive closure including changedFiles.
 */
function computeClosure(changedFiles, dependencyGraph) {
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {Array<{file: string, hop: number}>} */
  const queue = changedFiles.map((f) => ({ file: f, hop: 0 }));
  // Use an index cursor instead of queue.shift() to avoid O(N) per dequeue
  // on large queues (N-1 NIT from reviewer-performance, 2026-07-12).
  let head = 0;

  while (head < queue.length) {
    const { file, hop } = queue[head++];

    if (visited.has(file)) continue;
    visited.add(file);

    if (hop >= MAX_BFS_HOPS) continue;

    const deps = dependencyGraph[file];
    if (!deps) continue;
    for (const dep of deps) {
      if (!visited.has(dep)) {
        queue.push({ file: dep, hop: hop + 1 });
      }
    }
  }

  return visited;
}

/**
 * Pure core: compute invalidation results for each tier.
 *
 * The `head` field in the returned object is always an empty string from the
 * core — the CLI wrapper fills it in after resolving the current git HEAD,
 * keeping the core deterministic and I/O-free.
 *
 * @param {{
 *   changedFiles: string[],
 *   projectRoot: string,
 *   tierSurfaces: Record<TierName, string[]>,
 *   dependencyGraph: Record<string, string[]>
 * }} input
 * @returns {InvalidationResult}
 */
export function computeInvalidation({ changedFiles, projectRoot, tierSurfaces, dependencyGraph }) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    const err = new TypeError('projectRoot must be a non-empty string');
    throw err;
  }

  if (!Array.isArray(changedFiles)) {
    throw new TypeError('changedFiles must be an array');
  }

  if (!tierSurfaces || typeof tierSurfaces !== 'object' || Array.isArray(tierSurfaces)) {
    throw new TypeError('tierSurfaces must be a plain object (not an array)');
  }

  if (!dependencyGraph || typeof dependencyGraph !== 'object') {
    throw new TypeError('dependencyGraph must be an object');
  }

  const closure = computeClosure(changedFiles, dependencyGraph);

  /** @type {Record<TierName, TierResult>} */
  const perTier = {};

  for (const [tier, surface] of Object.entries(tierSurfaces)) {
    /** @type {string[]} */
    const matched = [];
    for (const file of surface) {
      if (closure.has(file)) {
        matched.push(file);
      }
    }
    perTier[tier] = {
      intersects: matched.length > 0,
      matched,
    };
  }

  return {
    head: '', // filled by CLI wrapper
    perTier,
  };
}

// ---------------------------------------------------------------------------
// CLI wrapper — I/O lives here, not in the core
// ---------------------------------------------------------------------------

/**
 * Build a dependency graph by regex-parsing import/require statements.
 * Unresolvable imports are treated conservatively: the file is added to the
 * graph as having no outgoing edges (i.e., the changed file still appears in
 * the closure, but unresolvable deps are not followed further).
 *
 * @param {string} projectRoot - absolute path to the project root.
 * @returns {Record<string, string[]>} dependency graph (repo-relative paths).
 */
function buildDependencyGraph(projectRoot) {
  /** @type {Record<string, string[]>} */
  const graph = {};

  /** @type {string[]} */
  const filesToScan = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // Use lstatSync — never follow symlinks during walk (MISTAKES 2026-07-11 REQ-03)
      let stat;
      try {
        stat = fs.lstatSync(fullPath);
      } catch (err) {
        if (err && err.code === 'ENOENT') continue;
        throw err;
      }
      if (stat.isSymbolicLink()) continue; // treat symlinks as leaves
      if (stat.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(fullPath);
      } else if (/\.(js|mjs|cjs|ts|tsx|jsx)$/.test(entry.name)) {
        filesToScan.push(fullPath);
      }
    }
  }

  walk(projectRoot);

  // Matches static imports, re-exports (import ... from), dynamic import(), and require().
  // Handles:
  //   import { x } from './foo'
  //   import('./foo')           dynamic import
  //   require('./foo')
  //   export * from './foo'     re-export
  const importRe = /(?:import\s*\(|import\s+(?:[\s\S]*?\s+from\s+)?|export\s+(?:[\s\S]*?\s+from\s+)|require\s*\(\s*)['"]([^'"]+)['"]/g;

  for (const absFile of filesToScan) {
    const relFile = path.relative(projectRoot, absFile);
    graph[relFile] = [];

    let content;
    try {
      content = fs.readFileSync(absFile, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      throw err;
    }

    let match;
    importRe.lastIndex = 0;
    while ((match = importRe.exec(content)) !== null) {
      const specifier = match[1];
      // Only follow relative imports — package imports not resolvable without node_modules
      if (!specifier.startsWith('.')) continue;

      const absDir = path.dirname(absFile);
      const resolvedBase = path.resolve(absDir, specifier);

      // Try common extensions
      const candidates = [
        resolvedBase,
        resolvedBase + '.ts',
        resolvedBase + '.tsx',
        resolvedBase + '.js',
        resolvedBase + '.mjs',
        resolvedBase + '.cjs',
        resolvedBase + '.jsx',
        path.join(resolvedBase, 'index.ts'),
        path.join(resolvedBase, 'index.js'),
        path.join(resolvedBase, 'index.mjs'),
      ];

      let resolved = null;
      for (const candidate of candidates) {
        // Defense-in-depth: reject candidates that escape projectRoot
        // (e.g., crafted specifiers like '../../../etc/passwd').
        const rel = path.relative(projectRoot, candidate);
        if (rel.startsWith('..')) continue; // out-of-tree — skip edge

        try {
          const s = fs.lstatSync(candidate);
          if (s.isFile()) {
            resolved = candidate;
            break;
          }
        } catch (err) {
          if (err && err.code === 'ENOENT') continue;
          throw err;
        }
      }

      if (resolved !== null) {
        const relResolved = path.relative(projectRoot, resolved);
        graph[relFile].push(relResolved);
      }
      // else: unresolvable → conservative: do not add an edge; file still
      // participates in the closure if it is in changedFiles, but we do not
      // propagate to an unknown dep. This is the "conservative fallback" —
      // unresolvable imports do NOT force-mark downstream tiers as invalidated.
    }
  }

  return graph;
}

/**
 * Resolve the current git HEAD sha.
 * @param {string} projectRoot
 * @returns {string}
 */
function resolveHead(projectRoot) {
  try {
    const headFile = path.join(projectRoot, '.git', 'HEAD');
    const headContent = fs.readFileSync(headFile, 'utf8').trim();
    if (headContent.startsWith('ref: ')) {
      const ref = headContent.slice('ref: '.length);
      const refFile = path.join(projectRoot, '.git', ref);
      try {
        return fs.readFileSync(refFile, 'utf8').trim();
      } catch (err) {
        if (err && err.code === 'ENOENT') return headContent;
        throw err;
      }
    }
    return headContent; // detached HEAD
  } catch (err) {
    if (err && err.code === 'ENOENT') return 'unknown';
    throw err;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      changed: { type: 'string' },
      'changed-file': { type: 'string' },
      'project-root': { type: 'string' },
      surfaces: { type: 'string' },
    },
    strict: false,
  });

  const changedRaw = values['changed'];
  const changedFilePath = values['changed-file'];
  const projectRootRaw = values['project-root'];
  const surfacesPath = values['surfaces'];

  if ((!changedRaw && !changedFilePath) || !projectRootRaw || !surfacesPath) {
    process.stderr.write(
      'Usage: node scripts/invalidation.mjs \\\n' +
      '  --changed-file <path-to-json-array>   # NUL-safe preferred\n' +
      '  --changed <file>,<file>               # back-compat; commas in filenames unsupported\n' +
      '  --project-root <path> --surfaces <path-to-json>\n'
    );
    process.exit(1);
  }

  const projectRoot = path.resolve(projectRootRaw);

  // Validate projectRoot with lstatSync (MISTAKES 2026-07-11 REQ-03)
  try {
    fs.lstatSync(projectRoot);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      process.stderr.write(`Error: projectRoot does not exist: ${projectRoot}\n`);
      process.exit(1);
    }
    throw err;
  }

  /** @type {string[]} */
  let changedFiles;
  if (changedFilePath) {
    // --changed-file: read a JSON string array (NUL-safe upstream pipeline)
    let rawJson;
    try {
      rawJson = fs.readFileSync(changedFilePath, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        process.stderr.write(`Error: changed-file not found: ${changedFilePath}\n`);
        process.exit(1);
      }
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err) {
      process.stderr.write(`Error: changed-file contains invalid JSON: ${changedFilePath}\n`);
      process.exit(1);
    }
    if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) {
      process.stderr.write(`Error: changed-file must be a JSON string array: ${changedFilePath}\n`);
      process.exit(1);
    }
    changedFiles = parsed.filter(Boolean);
  } else {
    // --changed <csv>: back-compat; limitation: commas in filenames unsupported
    changedFiles = /** @type {string} */ (changedRaw).split(',').map((f) => f.trim()).filter(Boolean);
  }

  let tierSurfaces;
  try {
    const raw = fs.readFileSync(surfacesPath, 'utf8');
    tierSurfaces = JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      process.stderr.write(`Error: surfaces file not found: ${surfacesPath}\n`);
      process.exit(1);
    }
    if (err instanceof SyntaxError) {
      process.stderr.write(`Error: surfaces file contains invalid JSON: ${surfacesPath}\n`);
      process.exit(1);
    }
    throw err;
  }

  // CLI-level surfaces validation: must be a plain object, not an array.
  // Arrays pass `typeof tierSurfaces !== 'object'` silently → reject explicitly.
  if (!tierSurfaces || typeof tierSurfaces !== 'object' || Array.isArray(tierSurfaces)) {
    process.stderr.write(
      `Error: surfaces file must contain a plain JSON object (got ${Array.isArray(tierSurfaces) ? 'array' : typeof tierSurfaces}): ${surfacesPath}\n`
    );
    process.exit(1);
  }

  // CLI-level tier-name validation: reject unknown tier names before shell
  // interpolation (GR finding F10 — typos like 'test-nit' would silently
  // produce a result with no warning without this check).
  for (const tierName of Object.keys(tierSurfaces)) {
    try {
      assertKnownTier(tierName);
    } catch (err) {
      process.stderr.write(`Error: ${err.message} in surfaces file: ${surfacesPath}\n`);
      process.exit(1);
    }
  }

  const dependencyGraph = buildDependencyGraph(projectRoot);
  const head = resolveHead(projectRoot);

  const result = computeInvalidation({
    changedFiles,
    projectRoot,
    tierSurfaces,
    dependencyGraph,
  });

  result.head = head;
  result.inputs = {
    changed: changedFiles,
    projectRoot,
    surfacesPath: path.resolve(surfacesPath),
    ...(changedFilePath ? { changedFilePath: path.resolve(changedFilePath) } : {}),
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

// Run CLI only when executed directly.
// Use fileURLToPath() instead of new URL().pathname to correctly handle
// spaces in path components (URL-percent-encoding vs raw path) — NIT from
// TASK-2 reviewer-architecture (2026-07-12).
const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}
