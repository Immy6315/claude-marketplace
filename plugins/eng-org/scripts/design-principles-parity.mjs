#!/usr/bin/env node
/**
 * design-principles-parity.mjs
 *
 * Byte-parity assertion for the two DESIGN_PRINCIPLES.md copies:
 *   - governance/DESIGN_PRINCIPLES.md            (live governance doc)
 *   - templates/governance/DESIGN_PRINCIPLES.md  (shipped template copy)
 *
 * Exits 0 if the two files are byte-identical.
 * Exits 1 and prints diagnostics if they differ.
 *
 * This is a parity-assertion script ONLY. It contains no principle/smell
 * evaluation logic — that belongs to design-lint.mjs (REQ-M2-2).
 *
 * Usage:
 *   node scripts/design-principles-parity.mjs
 *   node scripts/design-principles-parity.mjs --paths <live> <template>
 *
 * Resolution: paths are resolved RELATIVE to the plugin root (the directory
 * two levels above this script). No machine-absolute paths are hardcoded.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Path resolution (repo-relative, no machine-absolute paths)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// scripts/ is two levels below the plugin root  →  eng-org/
const PLUGIN_ROOT = resolve(__dirname, '..');

// Plugin root is inside:  claude-marketplace/plugins/eng-org/
// Repo root is three levels above:  claude-marketplace/ → Desktop/…
const REPO_ROOT = resolve(PLUGIN_ROOT, '..', '..', '..');

const DEFAULT_LIVE_PATH     = resolve(REPO_ROOT, 'governance', 'DESIGN_PRINCIPLES.md');
const DEFAULT_TEMPLATE_PATH = resolve(PLUGIN_ROOT, 'templates', 'governance', 'DESIGN_PRINCIPLES.md');

// ---------------------------------------------------------------------------
// CLI argument override (for test harness to pass temp-file paths)
// ---------------------------------------------------------------------------

function parsePaths(argv) {
  const idx = argv.indexOf('--paths');
  if (idx !== -1 && argv[idx + 1] && argv[idx + 2]) {
    return { livePath: argv[idx + 1], templatePath: argv[idx + 2] };
  }
  return { livePath: DEFAULT_LIVE_PATH, templatePath: DEFAULT_TEMPLATE_PATH };
}

// ---------------------------------------------------------------------------
// Parity check
// ---------------------------------------------------------------------------

/**
 * checkParity(livePath, templatePath) → { identical: boolean, detail: string }
 *
 * Reads both files and compares them byte-for-byte (Buffer comparison).
 * Returns a structured result so the test harness can assert on it directly
 * without process.exit side effects.
 */
export function checkParity(livePath, templatePath) {
  let liveBytes, templateBytes;

  try {
    liveBytes = readFileSync(livePath);
  } catch (err) {
    return { identical: false, detail: `Cannot read live copy at ${livePath}: ${err.message}` };
  }

  try {
    templateBytes = readFileSync(templatePath);
  } catch (err) {
    return { identical: false, detail: `Cannot read template copy at ${templatePath}: ${err.message}` };
  }

  if (liveBytes.equals(templateBytes)) {
    return { identical: true, detail: `OK — both copies are byte-identical (${liveBytes.length} bytes).` };
  }

  // Produce a human-readable first-differing-line diagnostic.
  const liveLines     = liveBytes.toString('utf8').split('\n');
  const templateLines = templateBytes.toString('utf8').split('\n');
  const maxLines = Math.max(liveLines.length, templateLines.length);

  let firstDiffLine = -1;
  for (let i = 0; i < maxLines; i++) {
    if (liveLines[i] !== templateLines[i]) {
      firstDiffLine = i + 1; // 1-based
      break;
    }
  }

  const detail = [
    `PARITY FAIL — the two DESIGN_PRINCIPLES.md copies differ.`,
    `  live copy:     ${livePath} (${liveBytes.length} bytes, ${liveLines.length} lines)`,
    `  template copy: ${templatePath} (${templateBytes.length} bytes, ${templateLines.length} lines)`,
    firstDiffLine !== -1
      ? `  First differing line: ${firstDiffLine}`
      : `  (files have different byte lengths but no line-level diff found — possible encoding difference)`,
    ``,
    `To fix: ensure both files are edited together whenever DESIGN_PRINCIPLES.md changes.`,
    `Run: diff governance/DESIGN_PRINCIPLES.md claude-marketplace/plugins/eng-org/templates/governance/DESIGN_PRINCIPLES.md`,
  ].join('\n');

  return { identical: false, detail };
}

// ---------------------------------------------------------------------------
// Main (runs only when executed directly, not when imported by tests)
// ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { livePath, templatePath } = parsePaths(process.argv);
  const result = checkParity(livePath, templatePath);

  if (result.identical) {
    console.log(result.detail);
    process.exit(0);
  } else {
    console.error(result.detail);
    process.exit(1);
  }
}
