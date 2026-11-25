# notify: send "important result" events to the receiver (Li Bai)
- Queue an event: `python tools/notify/enqueue.py <delivered|blocked|major_error|answer> "<summary<=300>" "<evidence<=300>"` (atomic; whitespace collapsed to one line; optional env NOTIFY_SESSION_ID). Never put tokens or secrets in summary/evidence.
- `notify.py` is the Stop hook. Empty outbox: exits at once, no config read, no network import. Always exit 0, never prints.
- You must fill url and token yourself in tools/notify/config.local.json (template: config.example.json) and set enabled true; Claude does not read or write that file. url must be https (http only for localhost/127.0.0.1/[::1]). Otherwise events stay queued and log.txt says "not configured".
- One POST per run: {"events":[{id,session_id,time (Europe/London),category,summary,evidence}]}, Bearer token, no redirects, stdlib only. The whole send (DNS included) is cut off after 12 s (hook timeout 20 s).
- 2xx = accepted by receiver (not proof it was read): ids go to sent.log, files to sent/. Failure: attempts+1 (log keeps time and status only); at 3 the event moves to failed/ (log line "moved to failed"); check failed/ by hand.
- Dedup against sent.log; a lock file stops two hooks sending at once. NOTIFY_DIR overrides the directory (tests).
- Hook (add after review): Stop, type=command, command="python", args=["tools/notify/notify.py"], async=true, timeout=20; confirm `python` resolves to a real interpreter (not the WindowsApps stub).
- Risks: crash after a 2xx but before sent.log can resend once, so the receiver MUST dedupe by id; token is plain text in config.local.json; queue drains only when a Stop hook fires.
