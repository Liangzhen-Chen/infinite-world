// Read-only projection of everything the gate toolchain knows into one overview (DESIGN section 7).
// Inputs: scheduler files in <root> (overview.json, queue.json, alerts.jsonl, scheduler.heartbeat, jobs/*),
// executor-card state files in <sessions> (<card>.start/.log/.last.txt/.final.md/.gate.log/.gate.md).
// Outputs: overview.md (human) + status.json (machine), and the trigger list used by notify.ps1.
// Never writes anything except the two output files requested with --write. Missing or corrupt inputs become
// "problems" in the report instead of exceptions. No history -> "unknown"; remaining time is never invented.
//
// CLI: node observe.mjs report --root R --sessions S [--write] [--unacked] [--json] [--all] [--since-hours 12] [--now ISO]
//        report exits 0 (no unacked alerts) or 1 (unacked alerts exist)
//      node observe.mjs check  --root R --sessions S [--cards a,b] [--jobs x,y] [--hb-stale-sec 90] [--card-stall-sec 900]
//        check prints {"triggers":[...]} as JSON; exit code 0 always (notify.ps1 decides what to do).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UNKNOWN = '未知';
export const safeId = s => String(s).replace(/[^\w.-]+/g, '_');
export const alertId = a => safeId(a.dedupe || `${a.runId}:${a.type}`);

const mtimeOf = file => { try { return fs.statSync(file).mtimeMs; } catch { return null; } };
function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function readJson(file, problems, label) {
  const text = readText(file);
  if (text === null) { problems?.push(`${label || path.basename(file)} 缺失`); return null; }
  try { return JSON.parse(text); } catch { problems?.push(`${label || path.basename(file)} 损坏（JSON 无法解析）`); return null; }
}
function readJsonl(file, problems, label) {
  const text = readText(file);
  if (text === null) return [];
  const out = []; let bad = 0;
  for (const line of text.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { bad++; } }
  if (bad) problems?.push(`${label || path.basename(file)} 有 ${bad} 行损坏，已跳过`);
  return out;
}

export function fmtDur(ms) {
  if (ms == null || !Number.isFinite(ms)) return '-';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

// ---- alerts ---------------------------------------------------------------------------------
// alerts.jsonl entries plus alerts derived from job events: the scheduler logs a `timeout` event when a
// test file overruns its hard deadline but writes no alert line for it; DESIGN 7 says TIMEOUT blocks.
export function loadAlerts(root, problems, now) {
  const list = [];
  for (const a of readJsonl(path.join(root, 'alerts.jsonl'), problems, 'alerts.jsonl')) {
    if (!a || typeof a !== 'object' || !a.type) continue;
    list.push({ id: alertId(a), ts: Date.parse(a.ts) || null, runId: a.runId ?? null, type: a.type, message: a.message ?? '', source: 'alerts.jsonl' });
  }
  const jobsDir = path.join(root, 'jobs');
  let dirs = []; try { dirs = fs.readdirSync(jobsDir); } catch { /* none */ }
  for (const runId of dirs) {
    for (const e of readJsonl(path.join(jobsDir, runId, 'events.jsonl'), null)) {
      if (e?.type !== 'timeout') continue;
      const id = safeId(`${runId}:TIMEOUT:${e.file || ''}`);
      if (list.some(a => a.id === id)) continue;
      list.push({ id, ts: Date.parse(e.ts) || null, runId, type: 'TIMEOUT', message: `${e.file || '?'} 超过硬截止，已请求终止（${e.stage || 'kill'}）`, source: 'events.jsonl' });
    }
  }
  const seen = new Set();
  const unique = list.filter(a => (seen.has(a.id) ? false : seen.add(a.id)));
  for (const a of unique) a.acked = fs.existsSync(path.join(root, 'control', `ack-${a.id}`));
  unique.sort((x, y) => (x.ts ?? Infinity) - (y.ts ?? Infinity));
  for (const a of unique) a.ageMs = a.ts != null && now != null ? now - a.ts : null;
  return unique;
}

// ---- scheduler jobs -------------------------------------------------------------------------
function loadJobs({ root, now, problems, alerts }) {
  const overview = readJson(path.join(root, 'overview.json'), problems, 'overview.json');
  readJson(path.join(root, 'queue.json'), problems, 'queue.json');
  const live = new Map((overview?.jobs || []).map(j => [j.runId, j]));
  const jobsDir = path.join(root, 'jobs');
  let dirs = []; try { dirs = fs.readdirSync(jobsDir); } catch { /* none */ }
  const rows = [];
  for (const runId of dirs) {
    const dir = path.join(jobsDir, runId);
    const resultFile = path.join(dir, 'result.json');
    const resultText = readText(resultFile);
    let result = null;
    if (resultText !== null) { try { result = JSON.parse(resultText); } catch { problems.push(`jobs/${runId}/result.json 损坏（JSON 无法解析）`); } }
    const events = readJsonl(path.join(dir, 'events.jsonl'), problems, `jobs/${runId}/events.jsonl`);
    const request = readJson(path.join(dir, 'request.json'), null);
    const lastTs = Math.max(0, ...events.map(e => Date.parse(e?.ts) || 0), mtimeOf(dir) || 0, mtimeOf(resultFile) || 0);
    const isLive = live.has(runId);
    const ended = new Set(events.filter(e => e?.type === 'test_end').map(e => e.file));
    const started = events.filter(e => e?.type === 'test_start').map(e => e.file);
    const queued = events.find(e => e?.type === 'queued');
    const row = { type: 'job', name: request?.cardId || queued?.cardId || result?.cardId || runId, runId, kind: request?.kind || queued?.kind || result?.kind || '?',
      owner: request?.ownerSession || result?.ownerSession || '-', status: '?', currentFiles: [], done: null, total: null, queuedMs: null, runningMs: null, eta: UNKNOWN, notes: [] };
    if (result) {
      Object.assign(row, { status: result.status, done: result.files?.length ?? null, total: result.files?.length ?? null, queuedMs: result.queuedMs ?? null, runningMs: result.runMs ?? null });
    } else if (isLive) {
      const j = live.get(runId);
      Object.assign(row, { status: j.status, currentFiles: j.currentFiles || [], done: j.done, total: j.total, queuedMs: j.queuedMs, runningMs: j.runningMs, owner: j.owner || row.owner });
      if (j.waitReason) row.notes.push(`等待：${j.waitReason}`);
    } else if (events.length) {
      const running = started.filter(f => !ended.has(f));
      Object.assign(row, { status: events.some(e => e?.type === 'job_end') ? events.find(e => e?.type === 'job_end').status : running.length ? 'RUNNING?' : 'QUEUED?',
        currentFiles: running, done: ended.size, total: queued?.files ?? null });
      row.notes.push('总览中无此任务（调度器未更新或已停）');
    } else {
      Object.assign(row, { status: '待接收', queuedMs: request?.createdAt ? now - Date.parse(request.createdAt) : null });
    }
    if (events.some(e => e?.type === 'timeout')) row.notes.push('出现 TIMEOUT');
    const mine = alerts.filter(a => !a.acked && a.runId === runId)[0];
    row.oldestAlert = mine ? { id: mine.id, type: mine.type, ageMs: mine.ageMs } : null;
    row.sortKey = lastTs; row.terminal = !!result; row.endedMs = result ? (Date.parse(result.endedAt) || lastTs) : null;
    rows.push(row);
  }
  return { rows, overview };
}

// ---- executor cards -------------------------------------------------------------------------
const CARD_SUFFIXES = ['.gate.md', '.gate.log', '.gate.tsv', '.last.txt', '.final.md', '.final.txt', '.start', '.log', '.wt', '.base'];
function parseStart(text, fallbackMs) {
  const m = /^\s*(\d{9,})(?:\s+(\d+))?/.exec(text || '');
  if (!m) return { startMs: fallbackMs, timeoutMin: null };
  return { startMs: Number(m[1]) * 1000, timeoutMin: m[2] ? Number(m[2]) : null };
}
export function loadCards({ sessions, now, stallMs, problems, only }) {
  let names = []; try { names = fs.readdirSync(sessions); } catch { problems?.push('sessions 目录不可读或不存在'); return []; }
  const byCard = new Map();
  for (const f of names) {
    const suf = CARD_SUFFIXES.find(s => f.endsWith(s));
    if (!suf) continue;
    const name = f.slice(0, -suf.length);
    if (!name || (only && !only.includes(name))) continue;
    if (!byCard.has(name)) byCard.set(name, {});
    byCard.get(name)[suf] = path.join(sessions, f);
  }
  const rows = [];
  for (const [name, files] of byCard) {
    if (!files['.start'] && !files['.final.md'] && !files['.final.txt'] && !files['.gate.md'] && !files['.gate.log']) continue;
    const startFile = files['.start'];
    const startInfo = startFile ? parseStart(readText(startFile), mtimeOf(startFile)) : { startMs: null, timeoutMin: null };
    const startMs = startInfo.startMs;
    const after = f => { const t = mtimeOf(f); return t != null && (startMs == null || t >= startMs - 5000) ? t : null; };   // a file older than the current start belongs to an earlier run
    // Delivered = last.txt non-empty, or a log line that is exactly "tokens used". A final.md can exist mid-run
    // (executors write it as scratch) and a "tokens used" substring appears when they print scripts, so neither counts.
    const lastTxtMs = after(files['.last.txt'] || '');
    let finalMs = null;
    if (lastTxtMs != null && (readText(files['.last.txt']) || '').trim()) finalMs = lastTxtMs;
    else if (files['.log'] && (readText(files['.log']) || '').split(/\r?\n/).some(l => l.trim() === 'tokens used')) finalMs = mtimeOf(files['.log']);
    // legacy cards (no .start, no .log) only ever had a final.txt/final.md: that file is their delivery
    const legacyFinal = !startFile && !files['.log'] ? (files['.final.txt'] || files['.final.md']) : null;
    const gateMdMs = after(files['.gate.md'] || '');
    const gateLogMs = after(files['.gate.log'] || '');
    if (finalMs == null && legacyFinal) finalMs = mtimeOf(legacyFinal);
    const logMs = Math.max(0, mtimeOf(files['.log'] || '') || 0, mtimeOf(files['.last.txt'] || '') || 0) || null;
    const lastAct = Math.max(startMs || 0, finalMs || 0, gateMdMs || 0, gateLogMs || 0, logMs || 0);
    const row = { type: 'card', name, runId: null, kind: 'card', owner: '执行者', status: '', currentFiles: [], done: null, total: null, queuedMs: null, runningMs: startMs ? now - startMs : null, eta: UNKNOWN, notes: [], startMs, logAgeMs: null };
    const gateText = gateMdMs ? readText(files['.gate.md']) : null;
    if (gateMdMs) {
      row.status = '门禁结果'; row.owner = '主会话'; row.runningMs = null;
      const lines = (gateText || '').split('\n').filter(l => l.trim());
      if (lines[1]) row.notes.push(lines[1].slice(0, 120));
    } else if (gateLogMs) {
      row.status = '门禁中'; row.owner = '门禁';
      const age = now - gateLogMs; row.logAgeMs = age;
      if (age >= stallMs) { row.status = '卡死'; row.owner = '主会话'; row.notes.push(`门禁日志 ${fmtDur(age)} 未更新`); }
    } else if (finalMs) {
      row.status = '已交卡'; row.owner = '主会话'; row.runningMs = startMs ? finalMs - startMs : null;
    } else {
      const elapsed = startMs ? now - startMs : null;
      const age = logMs ? now - logMs : null;
      row.logAgeMs = age;
      if (startInfo.timeoutMin && elapsed != null && elapsed > (startInfo.timeoutMin + 15) * 60000) { row.status = '超时'; row.owner = '主会话'; row.notes.push(`已运行 ${fmtDur(elapsed)}，上限 ${startInfo.timeoutMin}+15 分钟`); }
      else if (age != null ? age >= stallMs : elapsed != null && elapsed >= stallMs) {
        row.status = '卡死'; row.owner = '主会话';
        row.notes.push(age != null ? `日志 ${fmtDur(age)} 未更新` : `缺日志，已启动 ${fmtDur(elapsed)}`);
      } else row.status = '运行中';
    }
    const logFile = files['.gate.log'] && gateLogMs && !gateMdMs ? files['.gate.log'] : files['.log'];
    const tail = logFile ? (readText(logFile) || '').trimEnd().split('\n').pop() : '';
    if (tail && ['运行中', '门禁中', '卡死'].includes(row.status)) row.notes.push(`末行：${tail.replace(/\s+/g, ' ').slice(0, 80)}`);
    row.sortKey = lastAct; row.terminal = ['门禁结果', '已交卡'].includes(row.status);
    if (!row.terminal && lastAct && now - lastAct > 24 * 3600000) { row.terminal = true; row.notes.push('陈旧：24 小时无任何动静，视为已放弃'); }   // an abandoned card must not stay on the board forever
    row.endedMs = row.terminal ? (row.status === '门禁结果' ? gateMdMs : finalMs ?? lastAct) : null;
    rows.push(row);
  }
  return rows;
}

// ---- the report -----------------------------------------------------------------------------
export function collect({ root, sessions, now = Date.now(), sinceHours = 12, cardStallMs = 15 * 60000, hbStaleMs = 90000, all = false, onlyCards } = {}) {
  const problems = [];
  const alerts = loadAlerts(root, problems, now);
  const { rows: jobRows, overview } = loadJobs({ root, now, problems, alerts });
  const cardRows = sessions ? loadCards({ sessions, now, stallMs: cardStallMs, problems, only: onlyCards }) : [];
  for (const row of cardRows) {
    const mine = alerts.find(a => !a.acked && a.runId === row.name);
    row.oldestAlert = mine ? { id: mine.id, type: mine.type, ageMs: mine.ageMs } : null;
    const job = jobRows.filter(j => j.name === row.name).sort((a, b) => b.sortKey - a.sortKey)[0];
    if (job && ['门禁中', '卡死'].includes(row.status) && !job.terminal) {   // gate job of this card is live: show its progress
      Object.assign(row, { currentFiles: job.currentFiles, done: job.done, total: job.total, queuedMs: job.queuedMs, runningMs: job.runningMs ?? row.runningMs, runId: job.runId });
    }
  }
  const hbMtime = mtimeOf(path.join(root, 'scheduler.heartbeat'));
  const hbAgeMs = hbMtime == null ? null : now - hbMtime;
  const scheduler = { pid: overview?.schedulerPid ?? null, heartbeatAgeMs: hbAgeMs,
    state: hbMtime == null ? 'missing' : hbStaleMs > 0 && hbAgeMs >= hbStaleMs ? 'stale' : 'alive',
    paused: overview?.paused ?? null, slotsUsed: overview?.slotsUsed ?? null, hardCap: overview?.hardCap ?? null, availMemBytes: overview?.availMemBytes ?? null, overviewUpdatedAt: overview?.updatedAt ?? null };
  const unacked = alerts.filter(a => !a.acked);
  // Default view: everything not finished, things finished within sinceHours, and anything with an unacked alert.
  for (const c of cardRows) if (c.runId) { const k = jobRows.findIndex(j => j.runId === c.runId); if (k >= 0) jobRows.splice(k, 1); }   // the card row already shows its gate job
  const sinceMs = sinceHours * 3600000, total = jobRows.length + cardRows.length;
  const keep = r => all || !r.terminal || r.oldestAlert || (r.endedMs != null && now - r.endedMs <= sinceMs);
  const rows = [...jobRows, ...cardRows].filter(keep).sort((a, b) => (a.terminal ? 1 : 0) - (b.terminal ? 1 : 0)
    || (a.terminal ? (b.endedMs ?? 0) - (a.endedMs ?? 0) : b.sortKey - a.sortKey));
  const hidden = total - rows.length;
  for (const r of rows) { delete r.sortKey; delete r.startMs; delete r.endedMs; }
  return { generatedAt: new Date(now).toISOString(), root, sessions: sessions || null, scheduler, alerts: { total: alerts.length, unacked, oldestUnacked: unacked[0] || null }, rows, hidden, sinceHours, problems };
}

export function renderMarkdown(st) {
  const s = st.scheduler, out = [];
  out.push(`# 流程总览  ${st.generatedAt}`, '');
  out.push(`调度器：${s.state === 'alive' ? '正常' : s.state === 'stale' ? '心跳超时（失联）' : '无心跳文件'}；心跳 ${s.heartbeatAgeMs == null ? UNKNOWN : fmtDur(s.heartbeatAgeMs) + ' 前'}；PID ${s.pid ?? UNKNOWN}；槽位 ${s.slotsUsed ?? '?'}/${s.hardCap ?? '?'}；${s.paused ? '已暂停准入' : '准入中'}；可用内存 ${s.availMemBytes == null ? UNKNOWN : (s.availMemBytes / 1073741824).toFixed(1) + 'GB'}`);
  out.push('');
  out.push(`未确认告警：${st.alerts.unacked.length}（共 ${st.alerts.total}）`);
  for (const a of st.alerts.unacked) out.push(`- [${a.type}] ${a.runId ?? '-'}：${a.message}（${fmtDur(a.ageMs)} 前；确认：在 control/ 下建空文件 ack-${a.id}）`);
  out.push('');
  const cell = v => String(v ?? '-').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
  out.push('| 名称 | 类型 | 负责方 | 状态 | 当前文件 | 完成/总数 | 排队 | 运行 | 剩余 | 最老告警 | 备注 |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of st.rows) {
    out.push(`| ${cell(r.name)} | ${r.type === 'card' ? '卡' : r.kind} | ${cell(r.owner)} | ${cell(r.status)} | ${cell((r.currentFiles || []).join(', ') || '-')} | ${r.total == null ? '-' : `${r.done ?? '?'}/${r.total}`} | ${fmtDur(r.queuedMs)} | ${fmtDur(r.runningMs)} | ${r.eta} | ${r.oldestAlert ? `${r.oldestAlert.type} ${fmtDur(r.oldestAlert.ageMs)}` : '-'} | ${cell(r.notes.join('；'))} |`);
  }
  if (st.hidden) out.push('', `另有 ${st.hidden} 项已结束超过 ${st.sinceHours} 小时，未显示（--all / -All 显示全部，--since-hours / -SinceHours 调整窗口）`);
  if (!st.rows.length) out.push('| （无记录） | | | | | | | | | | |');
  if (st.problems.length) { out.push('', '输入问题：'); for (const p of st.problems) out.push(`- ${p}`); }
  return `${out.join('\n')}\n`;
}

export function renderUnacked(st) {
  if (!st.alerts.unacked.length) return '没有未确认告警。\n';
  return `${st.alerts.unacked.map(a => `[${a.type}] ${a.runId ?? '-'}：${a.message}（${fmtDur(a.ageMs)} 前）  确认：<root>/control/ack-${a.id}`).join('\n')}\n`;
}

// ---- notify triggers ------------------------------------------------------------------------
export function evaluate({ root, sessions, cards = [], jobs = [], now = Date.now(), hbStaleMs = 90000, cardStallMs = 15 * 60000 } = {}) {
  const triggers = [];
  const st = collect({ root, sessions, now, cardStallMs, hbStaleMs, all: true, onlyCards: cards });
  for (const a of st.alerts.unacked) triggers.push({ kind: 'alert', id: a.id, reason: `未确认告警 [${a.type}] ${a.runId ?? '-'}：${a.message}（确认：在 ${path.join(root, 'control', `ack-${a.id}`)} 建文件）` });
  for (const name of cards) {
    const row = st.rows.find(r => r.type === 'card' && r.name === name);
    if (!row) continue;
    if (['已交卡', '门禁中', '门禁结果'].includes(row.status)) triggers.push({ kind: 'card', id: name, reason: `卡 ${name} 已交卡（${row.status}）` });
    else if (row.status === '卡死') triggers.push({ kind: 'card', id: name, reason: `卡 ${name} 卡死：${row.notes.join('；')}` });
    else if (row.status === '超时') triggers.push({ kind: 'card', id: name, reason: `卡 ${name} 超时：${row.notes.join('；')}` });
  }
  for (const key of jobs) {
    const row = st.rows.find(r => r.type === 'job' && r.terminal && (r.runId === key || r.name === key));
    if (row) triggers.push({ kind: 'job', id: row.runId, reason: `任务 ${row.runId} 已结束：${row.status}` });
  }
  if (hbStaleMs > 0 && !fs.existsSync(path.join(root, 'control', 'ack-scheduler-heartbeat-stale'))) {
    if (st.scheduler.state === 'missing') triggers.push({ kind: 'heartbeat', id: 'scheduler-heartbeat-stale', reason: '调度器心跳文件不存在' });
    else if (st.scheduler.state === 'stale') triggers.push({ kind: 'heartbeat', id: 'scheduler-heartbeat-stale', reason: `调度器心跳 ${fmtDur(st.scheduler.heartbeatAgeMs)} 未更新（阈值 ${fmtDur(hbStaleMs)}）` });
  }
  return triggers;
}

// ---- CLI ------------------------------------------------------------------------------------
function main(argv) {
  const cmd = argv[0];
  const arg = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const flag = name => argv.includes(name);
  const list = name => (arg(name) || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  const root = path.resolve(arg('--root') || 'F:/dnd/logs/gate');
  const sessions = arg('--sessions') ? path.resolve(arg('--sessions')) : 'F:/dnd/logs/sessions';
  const now = arg('--now') ? Date.parse(arg('--now')) : Date.now();
  const hbStaleMs = (Number(arg('--hb-stale-sec') ?? 90)) * 1000, cardStallMs = (Number(arg('--card-stall-sec') ?? 900)) * 1000;
  if (cmd === 'check') {
    const triggers = evaluate({ root, sessions, cards: list('--cards'), jobs: list('--jobs'), now, hbStaleMs, cardStallMs });
    process.stdout.write(`${JSON.stringify({ triggers })}\n`);
    return 0;
  }
  if (cmd === 'report') {
    const st = collect({ root, sessions, now, hbStaleMs, cardStallMs, sinceHours: Number(arg('--since-hours') ?? 12), all: flag('--all') });
    if (flag('--write')) {
      const out = path.resolve(arg('--out') || root);
      fs.mkdirSync(out, { recursive: true });
      const put = (name, text) => { const f = path.join(out, name); fs.writeFileSync(`${f}.tmp`, text); fs.renameSync(`${f}.tmp`, f); };
      put('overview.md', renderMarkdown(st)); put('status.json', `${JSON.stringify(st, null, 2)}\n`);
    }
    process.stdout.write(flag('--json') ? `${JSON.stringify(st, null, 2)}\n` : flag('--unacked') ? renderUnacked(st) : renderMarkdown(st));
    return st.alerts.unacked.length ? 1 : 0;   // 0 = nothing to acknowledge, 1 = unacked alerts exist
  }
  console.error('usage: observe.mjs report|check --root R --sessions S ...');
  return 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
