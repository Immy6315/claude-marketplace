#!/usr/bin/env node
// governance/scripts/check.mjs
//
// Layer 1 mechanical validator for the eng-org governance setup.
// Runs against the local checkout. Exits 0 on PASS, 1 on FAIL.
// Generic — works for any project. Project-specific checks belong in
// the Checker subagent (Layer 2 judgment), not here.
//
// What it checks:
//   1. Required governance files exist with non-trivial content
//   2. CLAUDE.md has FRAMEWORK markers
//   3. .claude/agents/ has the universal core agents
//   4. .claude/commands/ has the orchestration commands
//   5. PROJECT.yml exists and parses
//
// Dependency-free. Requires Node 18+.

import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");

const errors = [];
const warnings = [];
const successes = [];

const isTTY = process.stdout.isTTY;
const c = (s, code) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c(s, "32");
const red = (s) => c(s, "31");
const yellow = (s) => c(s, "33");
const dim = (s) => c(s, "2");

const REQUIRED_DOCS = [
  "governance/ROLES.md",
  "governance/REVIEW_PROCESS.md",
  "governance/CONSTITUTION.md",
  "governance/MISTAKES.md",
  "governance/requirements/README.md",
  "CLAUDE.md",
  "PROJECT.yml",
];

const REQUIRED_AGENTS = [
  ".claude/agents/em.md",
  ".claude/agents/test-unit.md",
  ".claude/agents/test-integration.md",
  ".claude/agents/test-e2e.md",
  ".claude/agents/test-regression.md",
  ".claude/agents/test-load.md",
  ".claude/agents/reviewer-architecture.md",
  ".claude/agents/reviewer-security.md",
  ".claude/agents/reviewer-performance.md",
  ".claude/agents/reviewer-standards.md",
  ".claude/agents/reviewer-observability.md",
];

const REQUIRED_COMMANDS = [
  ".claude/commands/em-intake.md",
  ".claude/commands/tl-analyze.md",
  ".claude/commands/tl-assign.md",
  ".claude/commands/run-tests.md",
  ".claude/commands/run-reviews.md",
  ".claude/commands/merge-readiness.md",
  ".claude/commands/em-summary.md",
  ".claude/commands/pilot-check.md",
];

function checkRequiredFiles(label, list) {
  let ok = 0;
  for (const rel of list) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) {
      errors.push(`${label}: missing ${rel}`);
      continue;
    }
    const size = statSync(abs).size;
    if (size < 50) {
      warnings.push(`${label}: ${rel} is suspiciously small (${size}B)`);
    }
    ok++;
  }
  successes.push(`${label}: ${ok}/${list.length} present`);
}

async function checkClaudeMdMarkers() {
  const claudeMd = join(REPO_ROOT, "CLAUDE.md");
  if (!existsSync(claudeMd)) return; // already flagged
  const text = await readFile(claudeMd, "utf8");
  const start = text.includes("<!-- FRAMEWORK:START -->");
  const end = text.includes("<!-- FRAMEWORK:END -->");
  if (!start || !end) {
    warnings.push(
      "CLAUDE.md: missing FRAMEWORK:START/END markers — `eng-org update` may overwrite project content",
    );
  } else {
    successes.push("CLAUDE.md: framework markers present");
  }
}

async function checkProjectYml() {
  const proj = join(REPO_ROOT, "PROJECT.yml");
  if (!existsSync(proj)) return;
  const text = await readFile(proj, "utf8");
  // Minimal sniff: YAML must have name + domains
  if (!/^name:\s*\S/m.test(text)) {
    errors.push("PROJECT.yml: missing top-level `name:`");
  }
  if (!/^domains:/m.test(text)) {
    warnings.push("PROJECT.yml: no `domains:` declared — TL agents won't be generated");
  }
  if (!errors.length) successes.push("PROJECT.yml: parsed");
}

async function main() {
  console.log("eng-org governance check — Layer 1 mechanical validation\n");

  checkRequiredFiles("Governance docs", REQUIRED_DOCS);
  checkRequiredFiles("Universal agents", REQUIRED_AGENTS);
  checkRequiredFiles("Orchestration commands", REQUIRED_COMMANDS);
  await checkClaudeMdMarkers();
  await checkProjectYml();

  for (const s of successes) console.log(green("✓ ") + s);
  for (const w of warnings) console.log(yellow("⚠ ") + w);
  for (const e of errors) console.log(red("✗ ") + e);

  console.log();
  if (errors.length === 0) {
    console.log(green(`PASS`) + dim(` — ${successes.length} checks ok` + (warnings.length ? `, ${warnings.length} warnings` : "")));
    process.exit(0);
  } else {
    console.log(red(`FAIL`) + dim(` — ${errors.length} errors, ${warnings.length} warnings`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(red("Validator crashed: ") + (e?.stack || e));
  process.exit(2);
});
