#!/usr/bin/env bash
# Gathers mods into ~/mods, regenerates the my-mods marketplace, registers it, installs every mod.
# Idempotent. Needs: bash, python3, tar, claude.
set -euo pipefail

MODS_DIR="${MY_MODS_DIR:-$HOME/mods}"
MARKET="my-mods"
QUIET=0 COMMIT=0 HOOK=0
for a in "$@"; do
  case "$a" in
    --quiet) QUIET=1 ;;
    --commit) COMMIT=1 ;;
    --install-hook) HOOK=1 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done
say() { [ "$QUIET" = 1 ] || echo "$@"; }

mkdir -p "$MODS_DIR/.claude-plugin"
STAMP="$MODS_DIR/.sync-stamp"
SELF="$MODS_DIR/mods-manager/skills/sync-mods/sync.sh"

# Cheap exit for SessionStart: nothing new in ~/mods or any dev-mods folder since the last sync.
if [ "$QUIET" = 1 ] && [ "$COMMIT" = 0 ] && [ "$HOOK" = 0 ] && [ -f "$STAMP" ]; then
  if ! find "$MODS_DIR" "$HOME/.claude/dev-mods" -type f -newer "$STAMP" \
      -not -path '*/.git/*' -not -path '*/.claude-plugin/types/*' -print -quit 2>/dev/null | grep -q .; then
    exit 0
  fi
fi

# 1. Pull in mods authored on this machine. A dev copy replaces the ~/mods copy only when its
#    content differs AND its newest file is newer; a newer ~/mods copy is kept, never overwritten.
python3 - "$MODS_DIR" "$QUIET" <<'PY'
import glob, hashlib, json, os, shutil, sys
root, quiet = sys.argv[1], sys.argv[2] == "1"
SKIP = {".git", "types"}

def files(base):
    out = []
    for dp, dn, fn in os.walk(base):
        rel = os.path.relpath(dp, base)
        if rel.startswith(".claude-plugin" + os.sep + "types") or rel == os.path.join(".claude-plugin", "types"):
            dn[:] = []
            continue
        dn[:] = [d for d in dn if d != ".git"]
        out += [os.path.join(dp, f) for f in fn]
    return sorted(out)

def digest(base):
    h = hashlib.sha256()
    for f in files(base):
        h.update(os.path.relpath(f, base).encode()); h.update(open(f, "rb").read())
    return h.hexdigest()

def newest(base):
    return max((os.path.getmtime(f) for f in files(base)), default=0)

for d in sorted(glob.glob(os.path.expanduser("~/.claude/dev-mods/*/*/"))):
    manifest = os.path.join(d, ".claude-plugin", "plugin.json")
    if not os.path.isfile(manifest):
        continue
    name = json.load(open(manifest))["name"]
    dest = os.path.join(root, name)
    if not os.path.isdir(dest):
        action = "new"
    elif digest(d) == digest(dest):
        continue
    elif newest(d) > newest(dest):
        action = "update"
    else:
        if not quiet: print(f"keep  {name}: ~/mods copy is newer than {d}")
        continue
    if not quiet: print(f"sync  {name} ({action}) <- {d}")
    if os.path.isdir(dest): shutil.rmtree(dest)
    shutil.copytree(d, dest, ignore=shutil.ignore_patterns(".git"), copy_function=shutil.copy2)
    shutil.rmtree(os.path.join(dest, ".claude-plugin", "types"), ignore_errors=True)
PY

# 2. Validate every mod; an invalid one is left out of the marketplace.
VALID=()
for p in "$MODS_DIR"/*/; do
  [ -f "${p}.claude-plugin/plugin.json" ] || continue
  if claude plugin validate "$p" >/dev/null 2>&1; then
    VALID+=("$(basename "$p")")
  else
    echo "skip  $(basename "$p"): claude plugin validate failed (run it for details)" >&2
  fi
done

# 3. Regenerate the marketplace file from the valid mods.
python3 - "$MODS_DIR" "$MARKET" "${VALID[@]}" <<'PY'
import json, sys, os
root, market, *names = sys.argv[1:]
plugins = []
for n in sorted(names):
    m = json.load(open(os.path.join(root, n, ".claude-plugin", "plugin.json")))
    plugins.append({"name": m["name"], "source": f"./{n}", "description": m.get("description", ""), "version": m.get("version", "0.1.0")})
doc = {"name": market, "owner": {"name": "ferranserv"}, "plugins": plugins}
path = os.path.join(root, ".claude-plugin", "marketplace.json")
new = json.dumps(doc, indent=2) + "\n"
if not os.path.exists(path) or open(path).read() != new:
    open(path, "w").write(new)
PY

# 4. Register the marketplace, then install each mod at user scope.
if claude plugin marketplace list 2>/dev/null | grep -q "$MARKET"; then
  claude plugin marketplace update "$MARKET" >/dev/null 2>&1 || true
else
  say "add   marketplace $MARKET -> $MODS_DIR"
  claude plugin marketplace add "$MODS_DIR" >/dev/null
fi
INSTALLED="$(claude plugin list 2>/dev/null || true)"
for n in "${VALID[@]}"; do
  if ! grep -q "$n@$MARKET" <<<"$INSTALLED"; then
    say "install $n@$MARKET"
    claude plugin install "$n@$MARKET" --scope user >/dev/null
  fi
done

# 5. Optional: one-time SessionStart hook so this runs by itself.
if [ "$HOOK" = 1 ]; then
  python3 - "$SELF" <<'PY'
import json, os, sys
script = sys.argv[1]
path = os.path.expanduser("~/.claude/settings.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
doc = json.load(open(path)) if os.path.exists(path) else {}
cmd = f'bash "{script}" --quiet'
hooks = doc.setdefault("hooks", {}).setdefault("SessionStart", [])
if not any(h.get("command") == cmd for g in hooks for h in g.get("hooks", [])):
    hooks.append({"hooks": [{"type": "command", "command": cmd}]})
    json.dump(doc, open(path, "w"), indent=2)
    print(f"hook  added SessionStart -> {cmd}")
else:
    print("hook  already present")
PY
fi

# 6. Optional: commit (never push).
if [ "$COMMIT" = 1 ] && git -C "$MODS_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$MODS_DIR" add -A
  git -C "$MODS_DIR" diff --cached --quiet || git -C "$MODS_DIR" commit -q -m "Sync mods" && say "commit ~/mods (push with: git -C $MODS_DIR push)"
fi

touch "$STAMP"
say "done  $(printf '%s ' "${VALID[@]}")"
