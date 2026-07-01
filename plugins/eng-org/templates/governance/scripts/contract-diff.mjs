#!/usr/bin/env node
// governance/scripts/contract-diff.mjs
//
// G-7 API contract-parity engine. Dependency-free. Requires Node 18+.
//
// Normalizes volatile fields (timestamps, uuids, auto-increment ids,
// cursors, nonces) out of two JSON response snapshots, then diffs them so
// the signal is the response CONTRACT (shape and stable values), not
// run-to-run noise. Also flags private fields that leak into a public /
// unauthenticated endpoint response.
//
// Usage:
//   node contract-diff.mjs --baseline <a.json> --candidate <b.json>
//        [--mode shape|value]      (default: shape)
//        [--public]                (run the private-field leak check)
//        [--denylist a,b,c]        (extra private field names, comma-sep)
//        [--endpoint "GET /api/x"] (label for the report header)
//   node contract-diff.mjs --normalize <in.json> [--out <out.json>]
//        (write a normalized snapshot — used to store a baseline)
//
// Exit codes (priority: LEAK > DRIFT > NEW > PASS):
//   0  PASS  — shapes identical (and value-identical in --mode value)
//   2  DRIFT — contract shape/value changed and is NOT here-waived
//   3  LEAK  — a private field is present in a --public response
//   4  NEW   — no baseline existed; candidate is the first baseline
//   1  usage / read error

import { readFileSync, writeFileSync, existsSync } from "node:fs";

// ---- volatile-key + value detection (normalization) ------------------

const VOLATILE_KEY_RE =
  /^(.*_)?(id|_id|uuid|guid|createdat|created_at|updatedat|updated_at|deletedat|deleted_at|timestamp|ts|time|date|datetime|expiresat|expires_at|expiresin|iat|exp|nbf|cursor|nextcursor|next_cursor|pagetoken|page_token|nonce|etag|requestid|request_id|traceid|trace_id|correlationid|correlation_id|version|__v|revision|sessionid|session_id)$/i;

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECTID_RE = /^[0-9a-f]{24}$/i;
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const VOLATILE = "<volatile>";

// Values that look volatile regardless of the key they sit under.
function looksVolatileValue(v) {
  if (typeof v !== "string") return false;
  return (
    ISO_DATE_RE.test(v) || UUID_RE.test(v) || OBJECTID_RE.test(v) || JWT_RE.test(v)
  );
}

// Recursively replace volatile values with a stable token so they do not
// register as diffs. Object keys are sorted so key-order never matters.
function normalize(node, key) {
  if (Array.isArray(node)) return node.map((el) => normalize(el, key));
  if (node && typeof node === "object") {
    const out = {};
    for (const k of Object.keys(node).sort()) out[k] = normalize(node[k], k);
    return out;
  }
  if (key && VOLATILE_KEY_RE.test(key)) return VOLATILE;
  if (looksVolatileValue(node)) return VOLATILE;
  return node;
}

// ---- shape extraction + diff -----------------------------------------

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // object | string | number | boolean
}

// Flatten to { jsonPath -> type }. Arrays collapse to their element shape
// at index [*] so a list of N items is one contract, not N.
function shapeMap(node, path = "$", acc = {}) {
  const t = typeOf(node);
  acc[path] = t;
  if (t === "object") {
    for (const k of Object.keys(node)) shapeMap(node[k], `${path}.${k}`, acc);
  } else if (t === "array" && node.length) {
    // Merge all element shapes so an optional field in item[3] still shows.
    for (const el of node) shapeMap(el, `${path}[*]`, acc);
  }
  return acc;
}

function valueMap(node, path = "$", acc = {}) {
  const t = typeOf(node);
  if (t === "object") {
    for (const k of Object.keys(node)) valueMap(node[k], `${path}.${k}`, acc);
  } else if (t === "array") {
    node.forEach((el, i) => valueMap(el, `${path}[${i}]`, acc));
  } else {
    acc[path] = node;
  }
  return acc;
}

function diffShape(base, cand) {
  const b = shapeMap(base);
  const c = shapeMap(cand);
  const added = [];
  const removed = [];
  const changed = [];
  for (const p of Object.keys(c)) if (!(p in b)) added.push(p);
  for (const p of Object.keys(b)) if (!(p in c)) removed.push(p);
  for (const p of Object.keys(b))
    if (p in c && b[p] !== c[p]) changed.push({ path: p, from: b[p], to: c[p] });
  return { added, removed, changed };
}

function diffValue(base, cand) {
  const b = valueMap(base);
  const c = valueMap(cand);
  const changed = [];
  const keys = new Set([...Object.keys(b), ...Object.keys(c)]);
  for (const p of keys) {
    const bv = JSON.stringify(b[p]);
    const cv = JSON.stringify(c[p]);
    if (bv !== cv) changed.push({ path: p, from: b[p], to: c[p] });
  }
  return changed;
}

// ---- private-field leak check (public endpoints) ---------------------

const DEFAULT_DENY = [
  "installed", "isinstalled", "installedby", "installedbymerchant",
  "installstate", "installedat", "installationid",
  "merchantid", "tenantid", "storeid", "shopid", "ownerid", "userid",
  "internalid", "internalnotes", "internal",
  "secret", "clientsecret", "apikey", "apisecret", "token", "accesstoken",
  "refreshtoken", "hmac", "hmacsecret", "password", "passwordhash",
  "privatekey", "signingkey", "webhooksecret",
];

function findLeaks(node, denySet, path = "$", hits = []) {
  if (Array.isArray(node)) {
    node.forEach((el, i) => findLeaks(el, denySet, `${path}[${i}]`, hits));
  } else if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (denySet.has(k.toLowerCase())) hits.push(`${path}.${k}`);
      findLeaks(node[k], denySet, `${path}.${k}`, hits);
    }
  }
  return hits;
}

// ---- arg parsing -----------------------------------------------------

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) a[key] = true;
      else { a[key] = next; i++; }
    }
  }
  return a;
}

function readJson(p) {
  if (!existsSync(p)) return { missing: true };
  try { return { value: JSON.parse(readFileSync(p, "utf8")) }; }
  catch (e) { return { error: e.message }; }
}

// ---- main ------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));

if (args.normalize) {
  const r = readJson(args.normalize);
  if (r.missing || r.error) {
    console.error(`[contract-diff] cannot read ${args.normalize}: ${r.error || "not found"}`);
    process.exit(1);
  }
  const norm = normalize(r.value);
  const out = JSON.stringify(norm, null, 2);
  if (args.out) { writeFileSync(args.out, out + "\n"); console.log(`[contract-diff] wrote normalized snapshot → ${args.out}`); }
  else console.log(out);
  process.exit(0);
}

if (!args.baseline || !args.candidate) {
  console.error("usage: contract-diff.mjs --baseline <a.json> --candidate <b.json> [--mode shape|value] [--public] [--denylist a,b] [--endpoint \"GET /x\"]");
  console.error("       contract-diff.mjs --normalize <in.json> [--out <out.json>]");
  process.exit(1);
}

const mode = args.mode === "value" ? "value" : "shape";
const label = args.endpoint || `${args.baseline} → ${args.candidate}`;
const candR = readJson(args.candidate);
if (candR.missing || candR.error) {
  console.error(`[contract-diff] cannot read candidate ${args.candidate}: ${candR.error || "not found"}`);
  process.exit(1);
}
const candidate = normalize(candR.value);

// public-endpoint leak scan (runs even for net-new endpoints)
let leaks = [];
if (args.public) {
  const deny = new Set(DEFAULT_DENY);
  if (typeof args.denylist === "string")
    for (const d of args.denylist.split(",")) if (d.trim()) deny.add(d.trim().toLowerCase());
  leaks = findLeaks(candR.value, deny);
}

const lines = [];
lines.push(`# Contract diff — ${label}`);
lines.push("");
lines.push(`- Mode: **${mode}**  ·  Public endpoint: **${args.public ? "yes" : "no"}**`);

const baseR = readJson(args.baseline);
let exitCode = 0;

if (baseR.missing) {
  lines.push("- Baseline: **none (net-new endpoint)** — candidate becomes the first baseline.");
  lines.push("");
  lines.push("## Verdict: NEW");
  lines.push("No stored baseline. Commit the normalized candidate as the baseline. Review whether this newly-exposed surface should be public or private.");
  exitCode = 4;
} else if (baseR.error) {
  console.error(`[contract-diff] cannot read baseline ${args.baseline}: ${baseR.error}`);
  process.exit(1);
} else {
  const baseline = normalize(baseR.value);
  const shape = diffShape(baseline, candidate);
  const drift =
    shape.added.length || shape.removed.length || shape.changed.length;
  let valueChanged = [];
  if (mode === "value") valueChanged = diffValue(baseline, candidate);

  lines.push("");
  lines.push("## Shape diff");
  if (!drift) lines.push("_No shape drift after normalization._");
  if (shape.removed.length) { lines.push("**Removed fields (potential breaking change):**"); for (const p of shape.removed) lines.push(`- \`${p}\``); }
  if (shape.added.length) { lines.push("**Added fields:**"); for (const p of shape.added) lines.push(`- \`${p}\``); }
  if (shape.changed.length) { lines.push("**Type-changed fields:**"); for (const c of shape.changed) lines.push(`- \`${c.path}\`: ${c.from} → ${c.to}`); }

  if (mode === "value") {
    lines.push("");
    lines.push("## Value diff (normalized)");
    if (!valueChanged.length) lines.push("_No value drift after normalization._");
    for (const c of valueChanged) lines.push(`- \`${c.path}\`: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
  }

  const anyDrift = drift || (mode === "value" && valueChanged.length);
  lines.push("");
  if (anyDrift) {
    lines.push("## Verdict: DRIFT");
    lines.push("Contract changed vs baseline. This BLOCKs READY-FOR-MERGE unless the change is registered in `governance/api-contract-registry.md` or declared in this REQ's `spec.md §Intentional contract change`.");
    exitCode = 2;
  } else {
    lines.push("## Verdict: PASS");
    lines.push("Contract matches baseline after normalization.");
  }
}

// leak takes precedence over everything
if (leaks.length) {
  lines.push("");
  lines.push("## PRIVATE-FIELD LEAK (public endpoint) — UNCONDITIONAL BLOCK");
  lines.push("These private fields appear in an unauthenticated response and CANNOT be waived by a registry entry — fix the serializer:");
  for (const p of leaks) lines.push(`- \`${p}\``);
  exitCode = 3;
}

console.log(lines.join("\n"));
process.exit(exitCode);
