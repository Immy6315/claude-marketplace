#!/usr/bin/env node
/**
 * mistakes-gate.mjs — mechanical enforcement of the MISTAKES.md learning
 * loop for eng-org REQs.
 *
 * REQ-20260713-d904-03 TASK-7. Sibling of verdict-lint.mjs (same conventions).
 * Two modes:
 *   Gate mode  (--req-dir <path>)  — hard-fails when gr-review.md has ≥1
 *     CONFIRMED finding but MISTAKES.md has no entry citing that REQ id;
 *     also (with --check-fix-iterations) when task frontmatter records
 *     fix_iterations ≥ 1 and no matching MISTAKES entry exists.
 *   Match mode (--match <file...>) — lists MISTAKES entries whose `paths:`
 *     glob intersects any of the given files. Informational.
 *
 * Exit codes:
 *   0 — gate PASS or match-mode returned cleanly.
 *   1 — POLICY VIOLATION (learning-loop debt: CONFIRMED-without-entry OR
 *       fix-iterations-without-entry).
 *   2 — CLI-usage error.
 *
 * SKIP-not-FAIL: missing/unparseable gr-review.md → SKIP, not FAIL (never
 * over-fires on historical formats). Same philosophy as verdict-lint.
 *
 * Constraints (MISTAKES-informed):
 *   - JSDoc closed-set typedefs (GateStatus).
 *   - No non-stdlib imports.
 *   - Redaction: never emit raw finding text from gr-review.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// JSDoc typedefs
// ---------------------------------------------------------------------------

/** @typedef {'PASS'|'FAIL'|'SKIP'} GateStatus */

/**
 * @typedef {Object} MistakesEntry
 * @property {string} title
 * @property {string[]} tags
 * @property {string[]} paths
 * @property {string[]} reqIds
 * @property {string} body
 */

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Extract the REQ id from a req-dir path.
 * @param {string} reqDir
 * @returns {string|null}
 */
export function extractReqIdFromPath(reqDir) {
  const m = path.basename(path.resolve(reqDir)).match(/^(REQ-\d{8}-[a-z0-9]+-\d+)/);
  return m ? m[1] : null;
}

/**
 * Minimal in-house globber: honours `**` (any depth), `*` (any segment sans /),
 * and literal segment matches. Not shell-based.
 *
 * @param {string} glob
 * @param {string} filePath
 * @returns {boolean}
 */
export function globMatches(glob, filePath) {
  if (typeof glob !== 'string' || typeof filePath !== 'string') return false;
  // '**' is a special catch-all.
  if (glob === '**') return true;
  // Compile the glob into a regex: escape everything except '*' and '/'.
  let re = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // '**' → match any sequence including '/'.
        re += '.*';
        i += 2;
        // Consume optional trailing '/' after '**'.
        if (glob[i] === '/') i++;
      } else {
        // '*' → match any sequence NOT containing '/'.
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '/' || c === '.' || c === '-' || c === '_') {
      re += '\\' + c;
      i += 1;
    } else if (/[a-zA-Z0-9]/.test(c)) {
      re += c;
      i += 1;
    } else {
      re += '\\' + c;
      i += 1;
    }
  }
  re += '$';
  try {
    return new RegExp(re).test(filePath);
  } catch {
    return false;
  }
}

/**
 * A real MISTAKES entry heading is DATED: `### YYYY-MM-DD — title` (em/en
 * dash or hyphen; `[YYYY-MM-DD]` bracket variant tolerated). Header doc
 * sections and template blocks (e.g. `### Optional additive fields (…)`,
 * `### Fix-iteration distill template (…)`, `### {{DATE-YYYY-MM-DD}} — …`)
 * do NOT match and are never counted as entries — even when they cite a
 * REQ id (REQ-20260713-d904-03 F-1 regression: header sections citing the
 * REQ made the gate false-PASS).
 */
const ENTRY_HEADING_RE = /^### \[?\d{4}-\d{2}-\d{2}\]?\s*[—–-]/;

/**
 * Parse MISTAKES.md into an array of entries. Each entry starts at a DATED
 * `^### ` heading (see ENTRY_HEADING_RE) and runs until the next `^### `
 * heading (dated or not) or EOF. Headings inside fenced code blocks are
 * ignored (templates live in fences). Content above the first dated entry
 * (schema/header region) is never parsed as an entry.
 *
 * @param {string} filePath
 * @param {{content?: string}} [opts]
 * @returns {MistakesEntry[]}
 */
export function parseMistakesFile(filePath, opts) {
  let content;
  if (opts && typeof opts.content === 'string') {
    content = opts.content;
  } else {
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { return []; }
  }
  const lines = content.split(/\r?\n/);
  /** @type {MistakesEntry[]} */
  const out = [];
  /** @type {string[]|null} */
  let cur = null;
  /** @type {string|null} */
  let curTitle = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (cur !== null) cur.push(line);
      continue;
    }
    if (!inFence && /^### /.test(line)) {
      // Any heading (dated or not) terminates the current entry.
      if (cur !== null && curTitle !== null) {
        out.push(makeEntry(curTitle, cur));
        cur = null;
        curTitle = null;
      }
      // Only a DATED heading starts a new entry; template/header sections
      // are skipped (their body lines fall through until the next heading).
      if (ENTRY_HEADING_RE.test(line)) {
        curTitle = line;
        cur = [];
      }
    } else if (cur !== null) {
      cur.push(line);
    }
  }
  if (cur !== null && curTitle !== null) {
    out.push(makeEntry(curTitle, cur));
  }
  return out;
}

/**
 * @param {string} title
 * @param {string[]} bodyLines
 * @returns {MistakesEntry}
 */
function makeEntry(title, bodyLines) {
  const body = bodyLines.join('\n');
  // Tags: `[tag1, tag2, ...]` at end of title.
  const tagMatch = title.match(/\[([^\]]+)\]\s*$/);
  const tags = tagMatch ? tagMatch[1].split(',').map((t) => t.trim()).filter(Boolean) : [];
  // REQ ids anywhere in title OR body.
  const reqRe = /REQ-\d{8}-[a-z0-9]+-\d+/g;
  const reqIds = new Set();
  for (const m of (title + '\n' + body).matchAll(reqRe)) reqIds.add(m[0]);
  // paths: line in body (format `paths: glob[, glob...]` OR `paths: <glob>`).
  const pathsMatch = body.match(/^paths:\s*(.+)$/m);
  const paths = pathsMatch
    ? pathsMatch[1].split(',').map((p) => p.trim().replace(/^`|`$/g, '')).filter(Boolean)
    : [];
  return { title, tags, paths, reqIds: [...reqIds], body };
}

/**
 * Parse gr-review.md, count CONFIRMED disposition rows. Returns SKIP-friendly
 * output on any parse-fail (no throw).
 *
 * @param {string} filePath
 * @param {{content?: string}} [opts]
 * @returns {{confirmedCount: number, parseOk: boolean, skipReason?: string}}
 */
export function parseGrReview(filePath, opts) {
  let content;
  if (opts && typeof opts.content === 'string') {
    content = opts.content;
  } else {
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { return { confirmedCount: 0, parseOk: false, skipReason: 'file missing or unreadable' }; }
  }
  if (!content || content.trim().length === 0) {
    return { confirmedCount: 0, parseOk: false, skipReason: 'file empty' };
  }
  // Table row layout: look for a table with a Disposition column; count rows
  // whose disposition cell starts with 'CONFIRMED' (case-insensitive, after
  // stripping markdown emphasis). Ignore RESOLVED-* which are past-tense.
  let count = 0;
  let headerCols = null;
  let sepPassed = false;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('|')) { headerCols = null; sepPassed = false; continue; }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!headerCols) {
      const lower = cells.map((c) => c.toLowerCase());
      if (lower.some((c) => c.includes('disposition'))) {
        headerCols = lower;
        sepPassed = false;
      }
      continue;
    }
    if (!sepPassed) {
      if (cells.every((c) => /^:?-+:?$/.test(c))) { sepPassed = true; continue; }
      headerCols = null;
      continue;
    }
    const dispIdx = headerCols.findIndex((c) => c.includes('disposition'));
    if (dispIdx < 0) continue;
    const dispRaw = (cells[dispIdx] || '').replace(/\*\*/g, '').trim();
    if (/^CONFIRMED\b/i.test(dispRaw) && !/^RESOLVED/i.test(dispRaw)) count++;
  }
  // Also tolerate the per-finding-block layout: `Disposition: CONFIRMED`.
  if (count === 0) {
    const blockRe = /^Disposition:\s*(\*\*)?CONFIRMED/gim;
    const matches = content.match(blockRe);
    if (matches) count = matches.length;
  }
  return { confirmedCount: count, parseOk: true };
}

/**
 * Extract the maximum fix_iterations across a REQ's task files.
 * @param {string} reqDir
 * @returns {number}
 */
function countFixIterations(reqDir) {
  const tasksDir = path.join(reqDir, 'tasks');
  let maxIter = 0;
  let anyFxIterFile = 0;
  try {
    for (const e of fs.readdirSync(tasksDir)) {
      // Check for fix-iter-N filename convention.
      const m = e.match(/fix-iter-(\d+)/);
      if (m) {
        anyFxIterFile++;
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxIter) maxIter = n;
      }
      // Check task frontmatter for fix_iterations field.
      if (/^TASK-\d+.*\.md$/.test(e) && !e.includes('fix-iter')) {
        try {
          const content = fs.readFileSync(path.join(tasksDir, e), 'utf8');
          const fmMatch = content.match(/^fix_iterations:\s*(\d+)/m);
          if (fmMatch) {
            const n = parseInt(fmMatch[1], 10);
            if (Number.isFinite(n) && n > maxIter) maxIter = n;
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* no tasks dir */ }
  return maxIter;
}

// ---------------------------------------------------------------------------
// Gate + Match modes
// ---------------------------------------------------------------------------

/**
 * @param {{reqDir: string, mistakesPath: string, checkFixIterations?: boolean}} opts
 * @returns {{status: GateStatus, reqId: string|null, confirmedCount: number, entriesForReq: number, fixIterations: number, reason: string, nextStep?: string}}
 */
export function gateReq(opts) {
  const reqId = extractReqIdFromPath(opts.reqDir);
  if (!reqId) {
    return { status: 'FAIL', reqId: null, confirmedCount: 0, entriesForReq: 0, fixIterations: 0, reason: `cannot extract REQ id from ${opts.reqDir}`, nextStep: 'invoke with a REQ-<id> directory' };
  }
  const grPath = path.join(opts.reqDir, 'gr-review.md');
  const grExists = fs.existsSync(grPath);
  const gr = grExists ? parseGrReview(grPath) : { confirmedCount: 0, parseOk: false, skipReason: 'no gr-review.md' };
  const entries = parseMistakesFile(opts.mistakesPath);
  const matching = entries.filter((e) => e.reqIds.includes(reqId));
  const entriesForReq = matching.length;
  const fixIterations = opts.checkFixIterations ? countFixIterations(opts.reqDir) : 0;

  // SKIP path: no gr-review OR unparseable AND no fix-iterations.
  if (!gr.parseOk && fixIterations === 0) {
    return {
      status: 'SKIP', reqId, confirmedCount: 0, entriesForReq, fixIterations,
      reason: `SKIP: ${gr.skipReason || 'gr-review missing/unparseable'} and no fix-iterations recorded`,
    };
  }

  // FAIL paths.
  if (gr.parseOk && gr.confirmedCount >= 1 && entriesForReq === 0) {
    return {
      status: 'FAIL', reqId, confirmedCount: gr.confirmedCount, entriesForReq, fixIterations,
      reason: `learning-loop debt: gr-review.md records ${gr.confirmedCount} CONFIRMED finding(s) for ${reqId} but MISTAKES.md has no entry citing ${reqId}`,
      nextStep: 'append a 3-line entry to governance/MISTAKES.md per the header template — what broke / root-cause class tag / prevention rule',
    };
  }
  if (opts.checkFixIterations && fixIterations >= 1 && entriesForReq === 0) {
    return {
      status: 'FAIL', reqId, confirmedCount: gr.confirmedCount, entriesForReq, fixIterations,
      reason: `learning-loop debt: fix_iterations=${fixIterations} for ${reqId} but MISTAKES.md has no matching entry`,
      nextStep: 'append a 3-line entry per §Fix-iteration distill template — what broke / root-cause class / prevention rule',
    };
  }
  return { status: 'PASS', reqId, confirmedCount: gr.confirmedCount, entriesForReq, fixIterations, reason: 'OK' };
}

/**
 * @param {string[]} files
 * @param {string} mistakesPath
 * @returns {Array<{file: string, matches: MistakesEntry[]}>}
 */
export function matchFiles(files, mistakesPath) {
  const entries = parseMistakesFile(mistakesPath);
  return files.map((f) => {
    const matches = entries.filter((e) => {
      // Untagged legacy entries match all files.
      if (e.paths.length === 0) return true;
      return e.paths.some((g) => globMatches(g, f));
    });
    return { file: f, matches };
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  return [
    'Usage:',
    '  node mistakes-gate.mjs --req-dir <path> [--mistakes <path>] [--check-fix-iterations] [--format text|json]',
    '  node mistakes-gate.mjs --match <file> [<file>...] [--mistakes <path>] [--format text|json]',
    '',
    'Exit codes: 0 gate-pass / match-mode OK; 1 learning-loop debt; 2 CLI-usage error.',
  ].join('\n');
}

function main() {
  let args, positionals;
  try {
    const parsed = parseArgs({
      options: {
        'req-dir':               { type: 'string' },
        'match':                 { type: 'boolean', default: false },
        'mistakes':              { type: 'string', default: 'governance/MISTAKES.md' },
        'format':                { type: 'string', default: 'text' },
        'check-fix-iterations':  { type: 'boolean', default: false },
        'help':                  { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    args = parsed.values;
    positionals = parsed.positionals;
  } catch (e) {
    process.stderr.write(`mistakes-gate: ${e.message}\n${usage()}\n`);
    process.exit(2);
  }
  if (args.help) { process.stdout.write(usage() + '\n'); process.exit(0); }
  if (args.format !== 'text' && args.format !== 'json') {
    process.stderr.write(`mistakes-gate: invalid --format\n`);
    process.exit(2);
  }
  const gateMode = typeof args['req-dir'] === 'string';
  const matchMode = !!args.match;
  if (gateMode === matchMode) {
    process.stderr.write(`mistakes-gate: exactly one of --req-dir or --match is required\n${usage()}\n`);
    process.exit(2);
  }
  if (gateMode) {
    const r = gateReq({
      reqDir: args['req-dir'],
      mistakesPath: args.mistakes,
      checkFixIterations: args['check-fix-iterations'],
    });
    if (args.format === 'json') {
      process.stdout.write(JSON.stringify(r) + '\n');
    } else {
      const line = `${r.status} ${args['req-dir']} reqId=${r.reqId || 'null'} confirmed=${r.confirmedCount} mistakes_for_req=${r.entriesForReq} fix_iterations=${r.fixIterations} reason="${(r.reason || '').slice(0, 120)}"`;
      process.stdout.write(line + '\n');
      if (r.nextStep) process.stdout.write(`  next: ${r.nextStep}\n`);
    }
    process.exit(r.status === 'FAIL' ? 1 : 0);
  }
  // Match mode: positionals + optional --match (bool flag)
  const files = positionals.filter((p) => typeof p === 'string');
  const results = matchFiles(files, args.mistakes);
  if (args.format === 'json') {
    process.stdout.write(JSON.stringify(results.map((r) => ({
      file: r.file,
      matches: r.matches.map((m) => ({ title: m.title, tags: m.tags, paths: m.paths, reqIds: m.reqIds })),
    }))) + '\n');
  } else {
    for (const r of results) {
      for (const m of r.matches) {
        const firstLine = m.title.replace(/^###\s+/, '').slice(0, 80);
        process.stdout.write(`MATCHED ${r.file} ${firstLine} [${m.tags.join(',')}] paths=${m.paths.join(',') || '**'}\n`);
      }
    }
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
