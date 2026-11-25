#!/usr/bin/env python3
# Stop hook: send queued "important result" events to the receiver. Always exits 0, never prints to stdout.
import os, sys

PLACEHOLDERS = ("PASTE_URL_HERE", "PASTE_TOKEN_HERE")
MAX_ATTEMPTS = 3
SEND_DEADLINE = 12   # seconds for the whole network step incl. DNS; hook timeout is 20

def main():
    D = os.environ.get("NOTIFY_DIR") or os.path.dirname(os.path.abspath(__file__))
    OB = os.path.join(D, "outbox")
    try:  # fast path: nothing queued -> leave at once (no config read, no network imports)
        if not [n for n in os.listdir(OB) if n.endswith(".json") and not n.startswith(".")]:
            return
    except OSError:
        return

    import json, datetime
    sys.stdout = open(os.devnull, "w")
    def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    def log(msg):
        with open(os.path.join(D, "log.txt"), "a", encoding="utf-8", newline="\n") as f:
            f.write("%s %s\n" % (now(), msg))
    def mv(name, sub):
        os.makedirs(os.path.join(D, sub), exist_ok=True)
        os.replace(os.path.join(OB, name), os.path.join(D, sub, name))

    # lock: a second hook exits at once
    lf = open(os.path.join(D, "lock"), "a+")
    try:
        try:
            import fcntl
            fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except ImportError:
            import msvcrt
            lf.seek(0)
            msvcrt.locking(lf.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        return

    try:
        sid = json.loads(sys.stdin.read() or "{}").get("session_id", "")
        if not isinstance(sid, str): sid = ""
    except Exception:
        sid = ""

    # config (utf-8-sig: tolerate a BOM from Windows editors)
    try:
        import urllib.parse
        with open(os.path.join(D, "config.local.json"), encoding="utf-8-sig") as f: cfg = json.load(f)
        url, token = cfg.get("url"), cfg.get("token")
        good = (cfg.get("enabled") is True and isinstance(url, str) and url not in PLACEHOLDERS
                and isinstance(token, str) and token.strip() and token not in PLACEHOLDERS)
        if good:  # https only; plain http just for loopback (local testing)
            u = urllib.parse.urlsplit(url)
            good = bool(u.hostname) and (u.scheme == "https" or (u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1", "::1")))
    except Exception:
        good = False
    if not good:
        log("not configured (or url is not https)"); return

    sent = set()
    try:
        with open(os.path.join(D, "sent.log"), encoding="utf-8") as f: sent = {l.strip() for l in f if l.strip()}
    except OSError:
        pass

    batch, seen = [], set()   # (filename, event)
    for name in sorted(os.listdir(OB)):
        if not name.endswith(".json") or name.startswith("."): continue
        try:
            with open(os.path.join(OB, name), encoding="utf-8") as f: ev = json.load(f)
            eid = ev["id"]
            assert isinstance(eid, str) and eid
        except Exception:
            mv(name, "failed"); log("bad event file %s moved to failed" % name); continue
        if eid in sent or eid in seen:
            mv(name, "sent"); log("duplicate id skipped %s" % eid); continue
        seen.add(eid); batch.append((name, ev))
    if not batch: return
    batch.sort(key=lambda b: str(b[1].get("queued_at", "")))   # chronological, not uuid order

    def london(iso):
        try:
            t = datetime.datetime.fromisoformat(iso)
            if t.tzinfo is None: t = t.replace(tzinfo=datetime.timezone.utc)
        except Exception:
            t = datetime.datetime.now(datetime.timezone.utc)
        try:
            from zoneinfo import ZoneInfo
            return t.astimezone(ZoneInfo("Europe/London")).isoformat(timespec="seconds")
        except Exception:  # no tz database (Windows without tzdata): UK rule, BST = last Sun Mar 01:00 UTC .. last Sun Oct 01:00 UTC
            t = t.astimezone(datetime.timezone.utc)
            def last_sun(m):
                d = datetime.datetime(t.year, m, 31, 1, tzinfo=datetime.timezone.utc)
                return d - datetime.timedelta(days=(d.weekday() + 1) % 7)
            bst = last_sun(3) <= t < last_sun(10)
            return t.astimezone(datetime.timezone(datetime.timedelta(hours=1 if bst else 0))).isoformat(timespec="seconds")

    events = [{"id": e["id"], "session_id": e.get("session_id") or sid, "time": london(e.get("queued_at", "")), "category": e.get("category"),
               "summary": e.get("summary"), "evidence": e.get("evidence")} for _, e in batch]
    body = json.dumps({"events": events}, ensure_ascii=False).encode("utf-8")

    import urllib.request, urllib.error, threading
    class NoRedirect(urllib.request.HTTPRedirectHandler):  # never forward the token to another host
        def redirect_request(self, *a, **k): return None
    handlers = [NoRedirect]
    if u.scheme == "http": handlers.append(urllib.request.ProxyHandler({}))   # loopback test: never via a proxy
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json; charset=utf-8", "Authorization": "Bearer " + token})
    res = {"status": "Deadline"}
    def post():   # runs in a daemon thread: DNS (getaddrinfo) ignores the socket timeout, so the join below is the real limit
        try:
            with urllib.request.build_opener(*handlers).open(req, timeout=10) as r: res["status"] = r.status
        except urllib.error.HTTPError as e:
            res["status"] = e.code
        except Exception as e:
            res["status"] = type(e).__name__
    th = threading.Thread(target=post, daemon=True); th.start(); th.join(SEND_DEADLINE)
    status = res["status"]
    ok = isinstance(status, int) and 200 <= status < 300
    if ok:
        with open(os.path.join(D, "sent.log"), "a", encoding="utf-8", newline="\n") as f:
            f.write("".join(e["id"] + "\n" for _, e in batch))
        for name, _ in batch: mv(name, "sent")
        log("accepted by receiver events=%d status=%s" % (len(batch), status))   # 2xx = accepted, not proof of reading
    else:
        for name, ev in batch:
            try:
                try: ev["attempts"] = int(ev.get("attempts", 0)) + 1
                except Exception: ev["attempts"] = MAX_ATTEMPTS
                p = os.path.join(OB, name); tmp = os.path.join(OB, "." + name + ".tmp")
                with open(tmp, "w", encoding="utf-8", newline="\n") as f: json.dump(ev, f, ensure_ascii=False)
                os.replace(tmp, p)
                if ev["attempts"] >= MAX_ATTEMPTS:
                    mv(name, "failed"); log("moved to failed attempts=%d id=%s" % (ev["attempts"], ev["id"]))
            except Exception:
                pass
        log("send failed events=%d status=%s" % (len(batch), status))

try:
    main()
except BaseException:
    pass
os._exit(0)   # never wait for a lingering network thread; exit status is always 0
