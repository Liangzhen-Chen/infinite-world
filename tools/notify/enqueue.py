#!/usr/bin/env python3
# Usage: python enqueue.py <category> "<summary>" "<evidence>"   (writes outbox/<uuid4>.json atomically)
# Optional env NOTIFY_SESSION_ID is stored as the event's session_id.
import os, sys, json, uuid, datetime, re, unicodedata

CATS = ("delivered", "blocked", "major_error", "answer")
MAXLEN = 300

def clean(s):  # one line: drop control chars, collapse all whitespace (incl. newlines, U+2028) to single spaces
    s = "".join(c if not unicodedata.category(c).startswith("C") or c in "\r\n\t" else "" for c in s)
    return re.sub(r"\s+", " ", s).strip()

def main(a):
    if len(a) != 3:
        print("usage: enqueue.py <category> <summary> <evidence>", file=sys.stderr); return 2
    cat, summary, evidence = a[0], clean(a[1]), clean(a[2])
    if cat not in CATS:
        print("category must be one of: " + ", ".join(CATS), file=sys.stderr); return 2
    if not summary:
        print("summary is empty", file=sys.stderr); return 2
    if len(summary) > MAXLEN or len(evidence) > MAXLEN:
        print("summary and evidence must each be at most %d characters (got %d / %d)" % (MAXLEN, len(summary), len(evidence)), file=sys.stderr); return 2
    d = os.path.join(os.environ.get("NOTIFY_DIR") or os.path.dirname(os.path.abspath(__file__)), "outbox")
    os.makedirs(d, exist_ok=True)
    eid = str(uuid.uuid4())
    ev = {"id": eid, "category": cat, "summary": summary, "evidence": evidence,
          "queued_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "attempts": 0}
    sid = os.environ.get("NOTIFY_SESSION_ID", "")
    if sid: ev["session_id"] = sid[:100]
    tmp = os.path.join(d, "." + eid + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(ev, f, ensure_ascii=False)
        f.flush(); os.fsync(f.fileno())
    os.replace(tmp, os.path.join(d, eid + ".json"))
    print(eid)
    return 0

sys.exit(main(sys.argv[1:]))
