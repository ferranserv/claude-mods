#!/usr/bin/env python3
"""Read-only audit of your last N Claude Code sessions. Prints aggregates only.

Finds: the questions you keep asking, the commands you keep giving, how you check Claude's work,
and workflow gaps (editing on main, no commit, no worktree). Nothing leaves your machine.

  python3 tools/audit-sessions.py [--n 20] [--json] [--projects ~/.claude/projects]
"""
import argparse, collections, glob, json, os, re, sys

p = argparse.ArgumentParser()
p.add_argument("--n", type=int, default=20)
p.add_argument("--projects", default=os.path.expanduser("~/.claude/projects"))
p.add_argument("--json", action="store_true")
a = p.parse_args()

SECRET = re.compile(r"(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|[A-Fa-f0-9]{32,}|eyJ[A-Za-z0-9_-]{20,})")
Q_START = re.compile(r"^(what|how|why|where|when|which|who|can|could|does|do|is|are|should|will|qué|que|cómo|como|por qué|dónde|cuál|puedes|se puede|hay)\b", re.I)
CHECK = {
    "asks for tests/lint/build": re.compile(r"\b(test|tests|lint|typecheck|build|ci)\b", re.I),
    "asks to verify/double-check": re.compile(r"\b(verify|double.?check|make sure|confirm|revisa|verifica|comprueba)\b", re.I),
    "asks to show/see the result": re.compile(r"\b(show me|screenshot|demo|preview|let me see|muéstrame|enséñame)\b", re.I),
    "asks for diff/review": re.compile(r"\b(diff|review|audit|what changed|qué cambió)\b", re.I),
    "pastes an error/output back": re.compile(r"(Traceback|Error:|error TS|FAIL|✗|exit code|\bat .+:\d+)", re.I),
}
TOOL_CHECK = {
    "Claude ran tests/lint": re.compile(r"\b(pytest|jest|vitest|npm (run )?(test|lint|build)|tsc|ruff|eslint|cargo test|go test|claude plugin (test|validate))\b"),
    "Claude ran git diff/status": re.compile(r"\bgit (diff|status|log)\b"),
}

def norm(t):
    t = SECRET.sub("<secret>", t.lower())
    t = re.sub(r"[^\wáéíóúñü ]+", " ", t)
    return " ".join(t.split())

def user_text(msg):
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "\n".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    return ""

files = sorted(glob.glob(os.path.join(a.projects, "*", "*.jsonl")), key=os.path.getmtime, reverse=True)[: a.n]
questions, commands, starters, slash = collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
checks, tool_checks = collections.Counter(), collections.Counter()
gaps = collections.Counter()
sessions = 0
for f in files:
    sessions += 1
    edited = committed = worktree = False
    branches, first_bash = set(), None
    for line in open(f, errors="ignore"):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("isMeta") or e.get("isSidechain"):
            continue
        if e.get("gitBranch"):
            branches.add(e["gitBranch"])
        m = e.get("message") or {}
        if e.get("type") == "user" and m.get("role") == "user":
            t = user_text(m).strip()
            if not t or t.startswith("<") and "command-name" not in t:
                continue
            cm = re.search(r"<command-name>/?([\w:-]+)</command-name>", t)
            if cm:
                slash["/" + cm.group(1)] += 1
                continue
            if t.startswith("/"):
                slash[t.split()[0]] += 1
                continue
            first = norm(t.split("\n")[0])
            words = first.split()
            if "?" in t.split("\n")[0] or Q_START.match(first):
                questions[" ".join(words[:7])] += 1
            if len(words) >= 3:
                commands[" ".join(words[:3])] += 1
            if words:
                starters[words[0]] += 1
            for k, rx in CHECK.items():
                if rx.search(t):
                    checks[k] += 1
        elif e.get("type") == "assistant":
            for b in m.get("content") or []:
                if not (isinstance(b, dict) and b.get("type") == "tool_use"):
                    continue
                n, inp = b.get("name"), b.get("input") or {}
                cmd = inp.get("command", "") if n == "Bash" else ""
                if n in ("Edit", "Write", "NotebookEdit"):
                    edited = True
                if n == "EnterWorktree" or "git worktree" in cmd:
                    worktree = True
                if "git commit" in cmd:
                    committed = True
                if n == "Bash":
                    first_bash = first_bash or cmd
                    for k, rx in TOOL_CHECK.items():
                        if rx.search(cmd):
                            tool_checks[k] += 1
    if edited and branches & {"main", "master"} and not worktree:
        gaps["sessions that edited files directly on main/master (no worktree)"] += 1
    if edited and not committed:
        gaps["sessions that edited files and never committed"] += 1
    if first_bash is not None and not re.search(r"git (status|log|branch)", first_bash):
        gaps["sessions whose first command was not a git status/branch check"] += 1

def top(c, n=8, min_count=2):
    return [(k, v) for k, v in c.most_common(n) if v >= min_count]

out = {
    "sessions_read": sessions,
    "questions_you_keep_asking": top(questions),
    "commands_you_keep_giving": {"slash_commands": top(slash, 10, 1), "repeated_openers": top(commands), "first_words": top(starters, 8, 3)},
    "how_you_check_work": {"you_ask": dict(checks), "claude_does": dict(tool_checks)},
    "workflow_gaps": dict(gaps),
}
if a.json:
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    print()
    sys.exit(0)

def show(title, rows):
    print(f"\n## {title}")
    for k, v in rows:
        print(f"  {v:>3}x  {k}")
    if not rows:
        print("  (nothing repeated 2+ times)")

print(f"Read {sessions} sessions from {a.projects}")
show("Questions you keep asking (first 7 words)", out["questions_you_keep_asking"])
show("Slash commands you run", out["commands_you_keep_giving"]["slash_commands"])
show("Commands you keep giving (first 3 words)", out["commands_you_keep_giving"]["repeated_openers"])
show("How you check my work: what you ask", sorted(checks.items(), key=lambda x: -x[1]))
show("How you check my work: what I run", sorted(tool_checks.items(), key=lambda x: -x[1]))
show(f"Workflow gaps (of {sessions} sessions)", sorted(gaps.items(), key=lambda x: -x[1]))
