#!/usr/bin/env bash
#
# new-project.sh — scaffold a new project under the eng-org multi-project
# registry. Creates docs + tests + meta.json + DECISIONS.md, registers the
# project in projects/INDEX.md and in the machine-readable eng-org.json manifest.
#
# Standalone: the only dependency is python3 (used to update the JSON manifest
# without needing jq). Safe to run outside Claude Code.
#
# Resolution (all overridable so the /eng-org:new-project command can drive it):
#   ENG_ORG_TEMPLATES  per-project template dir   (default: <script>/../templates/project)
#   ENG_ORG_ROOT       workspace root             (default: $PWD)
#   ENG_ORG_PROJECTS   project registry dir       (default: $ENG_ORG_ROOT/projects)
#   ENG_ORG_MANIFEST   manifest path              (default: $ENG_ORG_ROOT/eng-org.json)
#
# Usage: new-project.sh <name> "<one-line description>"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ENG_ORG_ROOT:-$PWD}"

# Resolve per-project templates. Honor an explicit override, else try the known
# layouts in order: plugin-internal, then project-copied (next to the script or
# at the workspace root). This lets the same script run inside the plugin AND
# standalone after `/eng-org:init` copies it into a project.
if [[ -n "${ENG_ORG_TEMPLATES:-}" ]]; then
  TEMPLATES="$ENG_ORG_TEMPLATES"
else
  for cand in \
    "$SCRIPT_DIR/../templates/project" \
    "$SCRIPT_DIR/eng-org-templates/project" \
    "$ROOT/eng-org-templates/project"; do
    if [[ -d "$cand" ]]; then TEMPLATES="$cand"; break; fi
  done
  TEMPLATES="${TEMPLATES:-$SCRIPT_DIR/../templates/project}"
fi
PROJECTS="${ENG_ORG_PROJECTS:-$ROOT/projects}"
MANIFEST="${ENG_ORG_MANIFEST:-$ROOT/eng-org.json}"

NAME="${1:-}"; DESC="${2:-}"
[[ -z "$NAME" ]] && { echo "Usage: $0 <name> \"<description>\"" >&2; exit 1; }
[[ -d "$TEMPLATES" ]] || { echo "Error: templates dir not found: $TEMPLATES" >&2; exit 1; }

DEST="$PROJECTS/$NAME"
[[ -e "$DEST" ]] && { echo "Error: project '$NAME' already exists at $DEST" >&2; exit 1; }
DATE="$(date +%Y-%m-%d)"

# Substitute placeholders. DESC is passed via env to avoid sed delimiter issues.
fill() {
  DESC="$DESC" NAME="$NAME" DATE="$DATE" python3 - "$1" "$2" <<'PY'
import os, sys
src, dst = sys.argv[1], sys.argv[2]
t = open(src, encoding="utf-8").read()
t = (t.replace("{{PROJECT_NAME}}", os.environ["NAME"])
       .replace("{{PROJECT_DESC}}", os.environ["DESC"])
       .replace("{{DATE}}", os.environ["DATE"]))
open(dst, "w", encoding="utf-8").write(t)
PY
}

mkdir -p "$DEST/docs" "$DEST/src" "$DEST/tests/unit" "$DEST/tests/integration" "$DEST/tests/e2e"
fill "$TEMPLATES/README.md"     "$DEST/README.md"
fill "$TEMPLATES/DECISIONS.md"  "$DEST/DECISIONS.md"
fill "$TEMPLATES/meta.json"     "$DEST/meta.json"
for d in PRD ARCHITECTURE SYSTEM-DESIGN TECH-DOC TASK-LIST TEST-PLAN; do
  fill "$TEMPLATES/docs/$d.md" "$DEST/docs/$d.md"
done
touch "$DEST/src/.gitkeep" \
      "$DEST/tests/unit/.gitkeep" \
      "$DEST/tests/integration/.gitkeep" \
      "$DEST/tests/e2e/.gitkeep"

# Human-readable registry.
INDEX="$PROJECTS/INDEX.md"
[[ -f "$INDEX" ]] || printf '# Projects Index\n\n| Project | Description | Status | Created |\n|---------|-------------|--------|---------|\n' > "$INDEX"
printf '| [%s](%s/README.md) | %s | Planning | %s |\n' "$NAME" "$NAME" "$DESC" "$DATE" >> "$INDEX"

# Machine-readable registry (only if a manifest exists).
if [[ -f "$MANIFEST" ]]; then
  MANIFEST="$MANIFEST" NAME="$NAME" DESC="$DESC" DATE="$DATE" python3 - <<'PY'
import json, os
p = os.environ["MANIFEST"]
d = json.load(open(p, encoding="utf-8"))
d.setdefault("projects", [])
name = os.environ["NAME"]
d["projects"] = [x for x in d["projects"] if x.get("name") != name]
d["projects"].append({
    "name": name,
    "description": os.environ["DESC"],
    "status": "planning",
    "created": os.environ["DATE"],
    "path": f"projects/{name}",
    "meta": f"projects/{name}/meta.json",
    "decisions": f"projects/{name}/DECISIONS.md",
})
with open(p, "w", encoding="utf-8") as f:
    json.dump(d, f, indent=2)
    f.write("\n")
PY
  echo "==> Registered '$NAME' in $MANIFEST"
fi

echo "==> Created project '$NAME' at $DEST"
echo "    Next: fill docs/PRD.md + docs/ARCHITECTURE.md before coding;"
echo "          log every real decision in DECISIONS.md with a date."
