#!/usr/bin/env python3
"""Where the tokens go: reads the cockpit's turn log (~/.claude/cockpit-log/*.jsonl). Local, read-only.

  python3 tools/cockpit-log.py [--days 7] [--dir ~/.claude/cockpit-log]
"""
import argparse, collections, datetime, glob, json, os

p = argparse.ArgumentParser()
p.add_argument("--days", type=int, default=7)
p.add_argument("--dir", default=os.path.expanduser("~/.claude/cockpit-log"))
a = p.parse_args()

since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=a.days)
days = collections.defaultdict(lambda: collections.Counter())
for f in glob.glob(os.path.join(a.dir, "*.jsonl")):
    for line in open(f, encoding="utf-8", errors="ignore"):
        try:
            r = json.loads(line)
            t = datetime.datetime.fromisoformat(r["t"].replace("Z", "+00:00"))
        except Exception:
            continue
        if t < since:
            continue
        d = days[t.astimezone().date().isoformat()]
        d["turns"] += 1
        d["aborted"] += r.get("reason") == "aborted"
        d["routed"] += bool(r.get("routed"))
        d["in"] += r.get("in", 0)
        d["out"] += r.get("out", 0)
        d["read"] += r.get("cacheRead", 0)
        d["write"] += r.get("cacheWrite", 0)
        d["secs"] += r.get("ms", 0) / 1000

print(f"{'day':<11}{'turns':>6}{'abort':>6}{'routed':>7}{'in':>9}{'out':>9}{'cache hit':>11}{'minutes':>9}")
for day in sorted(days):
    d = days[day]
    total_in = d["in"] + d["read"] + d["write"]
    hit = f"{100 * d['read'] / total_in:.0f}%" if total_in else "-"
    print(f"{day:<11}{d['turns']:>6}{d['aborted']:>6}{d['routed']:>7}{d['in'] + d['read'] + d['write']:>9}{d['out']:>9}{hit:>11}{d['secs'] / 60:>9.1f}")
if not days:
    print("No turns logged in that window. Is the cockpit's turnLog option on?")
