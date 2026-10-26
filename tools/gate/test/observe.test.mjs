// Pure-logic tests for tools/gate/observe.mjs: states are built from fixture trees with fixed clocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, evaluate, renderMarkdown, renderUnacked, alertId, safeId, fmtDur } from '../observe.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'observe-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const NOW = Date.parse('2026-10-26T10:00:00.000Z');
const iso = ms => new Date(ms).toISOString();
const write = (file, text, mtimeMs) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); if (mtimeMs) fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000); };
const fresh = () => { const dir = path.join(scratch, `c${++n}`); return { root: path.join(dir, 'gate'), sessions: path.join(dir, 'sessions') }; };
const min = m => m * 60000;

function card(env, name, { startAgo, timeoutMin = 75, log, final, gateLog, gateMd }) {
  write(path.join(env.sessions, `${name}.start`), `${Math.floor((NOW - startAgo) / 1000)} ${timeoutMin}\n`, NOW - startAgo);
  if (log != null) write(path.join(env.sessions, `${name}.log`), 'line1\nlast line here\n', NOW - log);
  if (final != null) write(path.join(env.sessions, `${name}.last.txt`), 'done', NOW - final);
  if (gateLog != null) write(path.join(env.sessions, `${name}.gate.log`), 'g1\ngate tail\n', NOW - gateLog);
  if (gateMd != null) write(path.join(env.sessions, `${name}.gate.md`), '# gate\nsummary line\n', NOW - gateMd);
}
const row = (st, name) => st.rows.find(r => r.name === name);

test('card states: running / delivered / gating / gate result / stalled / timed out', () => {
  const env = fresh();
  card(env, 'run', { startAgo: min(10), log: min(1) });
  card(env, 'done', { startAgo: min(30), log: min(5), final: min(4) });
  card(env, 'gating', { startAgo: min(60), final: min(50), gateLog: min(1) });
  card(env, 'gated', { startAgo: min(90), final: min(80), gateLog: min(30), gateMd: min(20) });
  card(env, 'stuck', { startAgo: min(40), log: min(16) });
  card(env, 'slow', { startAgo: min(95), timeoutMin: 75, log: min(1) });
  const st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  assert.equal(row(st, 'run').status, '运行中');
  assert.equal(row(st, 'done').status, '已交卡');
  assert.equal(row(st, 'gating').status, '门禁中');
  assert.equal(row(st, 'gated').status, '门禁结果');
  assert.match(row(st, 'gated').notes[0], /summary line/);
  assert.equal(row(st, 'stuck').status, '卡死');
  assert.match(row(st, 'stuck').notes.join(), /未更新/);
  assert.equal(row(st, 'slow').status, '超时');
  assert.equal(row(st, 'slow').eta, '未知');
});

test('stall boundary: 14 min of silence is still running, 15 min is stalled (injectable threshold)', () => {
  const env = fresh();
  card(env, 'a', { startAgo: min(30), log: min(14) });
  card(env, 'b', { startAgo: min(30), log: min(15) });
  let st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  assert.equal(row(st, 'a').status, '运行中'); assert.equal(row(st, 'b').status, '卡死');
  st = collect({ root: env.root, sessions: env.sessions, now: NOW, cardStallMs: min(10) });
  assert.equal(row(st, 'a').status, '卡死');
});

test('card without any log is reported stalled once old enough, not silently healthy', () => {
  const env = fresh();
  card(env, 'nolog', { startAgo: min(20) });
  card(env, 'young', { startAgo: min(2) });
  const st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  assert.equal(row(st, 'nolog').status, '卡死'); assert.match(row(st, 'nolog').notes.join(), /缺日志/);
  assert.equal(row(st, 'young').status, '运行中');
});

test('a final file older than the current start belongs to an earlier run and is ignored', () => {
  const env = fresh();
  card(env, 'again', { startAgo: min(5), log: min(1), final: min(300) });
  assert.equal(row(collect({ root: env.root, sessions: env.sessions, now: NOW }), 'again').status, '运行中');
});

test('default view: unfinished first, finished within the window newest first, older finished hidden unless all / wider window / unacked alert', () => {
  const env = fresh();
  card(env, 'ancient', { startAgo: 3 * 86400000, final: 3 * 86400000 - 1000 });
  card(env, 'alerted', { startAgo: 3 * 86400000, final: 3 * 86400000 - 1000 });
  card(env, 'recent1', { startAgo: min(100), final: min(90) });
  card(env, 'recent2', { startAgo: min(50), final: min(20) });
  card(env, 'working', { startAgo: min(5), log: min(1) });
  card(env, 'gating', { startAgo: min(900), final: min(890), gateLog: min(1) });
  write(path.join(env.root, 'alerts.jsonl'), JSON.stringify({ ts: iso(NOW - 5000), runId: 'alerted', type: 'X', message: 'm', dedupe: 'alerted:X' }) + '\n');
  const names = st => st.rows.map(r => r.name);
  let st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  assert.deepEqual(names(st).slice(0, 2).sort(), ['gating', 'working']);
  assert.deepEqual(names(st).slice(2), ['recent2', 'recent1', 'alerted']);
  assert.equal(row(st, 'ancient'), undefined); assert.equal(st.hidden, 1);
  assert.ok(row(st, 'alerted'), 'unacked alert keeps an old finished item visible');
  assert.match(renderMarkdown(st), /另有 1 项已结束超过 12 小时/);
  assert.equal(row(collect({ root: env.root, sessions: env.sessions, now: NOW, all: true }), 'ancient').status, '已交卡');
  assert.equal(row(collect({ root: env.root, sessions: env.sessions, now: NOW, sinceHours: 100 }), 'ancient').status, '已交卡');
  assert.equal(row(collect({ root: env.root, sessions: env.sessions, now: NOW, sinceHours: 1 }), 'recent1'), undefined);
  assert.equal(row(collect({ root: env.root, sessions: env.sessions, now: NOW, sinceHours: 1 }), 'recent2').status, '已交卡');
});

test('regression p3: final.md written mid-run and a "tokens used" substring in the log do NOT mean delivered; log silent 15 min means stalled, not delivered', () => {
  const env = fresh();
  const fx = path.join(here, 'fixtures', 'observe', 'p3-running');
  const put = (name, from, ago) => write(path.join(env.sessions, name), fs.readFileSync(path.join(fx, from), 'utf8'), NOW - ago);
  write(path.join(env.sessions, 'p3.start'), `${Math.floor((NOW - min(9)) / 1000)} 75
`, NOW - min(9));
  put('p3.log', 'p3.log', 5000); put('p3.final.md', 'p3.final.md', min(1));
  let st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  assert.equal(row(st, 'p3').status, '运行中');
  assert.deepEqual(evaluate({ root: env.root, sessions: env.sessions, cards: ['p3'], now: NOW, hbStaleMs: 0 }), []);
  put('p3.log', 'p3.log', min(16));
  assert.equal(row(collect({ root: env.root, sessions: env.sessions, now: NOW }), 'p3').status, '卡死');
});

test('delivered = non-empty last.txt, or a log line that is exactly "tokens used"; empty last.txt alone is not', () => {
  const env = fresh();
  const fx = path.join(here, 'fixtures', 'observe', 'p3-running');
  write(path.join(env.sessions, 'viaLog.start'), `${Math.floor((NOW - min(9)) / 1000)} 75
`, NOW - min(9));
  write(path.join(env.sessions, 'viaLog.log'), fs.readFileSync(path.join(fx, 'delivered.log'), 'utf8'), NOW - 5000);
  card(env, 'viaTxt', { startAgo: min(9), log: 5000, final: 4000 });
  card(env, 'emptyTxt', { startAgo: min(9), log: 5000 });
  write(path.join(env.sessions, 'emptyTxt.last.txt'), '  \n', NOW - 4000);
  const st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  assert.equal(row(st, 'viaLog').status, '已交卡');
  assert.equal(row(st, 'viaTxt').status, '已交卡');
  assert.equal(row(st, 'emptyTxt').status, '运行中');
});

test('timeout = .start minutes + 15 min grace', () => {
  const env = fresh();
  card(env, 'inGrace', { startAgo: min(85), timeoutMin: 75, log: min(1) });
  card(env, 'over', { startAgo: min(91), timeoutMin: 75, log: min(1) });
  const st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  assert.equal(row(st, 'inGrace').status, '运行中'); assert.equal(row(st, 'over').status, '超时');
});

test('report CLI exit code: 0 when nothing is unacked, 1 when unacked alerts exist; --all and --since-hours accepted', () => {
  const env = fresh();
  fs.mkdirSync(env.sessions, { recursive: true }); fs.mkdirSync(env.root, { recursive: true });
  const run = (...a) => spawnSync(process.execPath, [path.join(path.dirname(here), 'observe.mjs'), 'report', '--root', env.root, '--sessions', env.sessions, ...a], { encoding: 'utf8' });
  assert.equal(run('--all', '--since-hours', '5').status, 0);
  write(path.join(env.root, 'alerts.jsonl'), JSON.stringify({ ts: new Date().toISOString(), runId: 'r', type: 'T', message: 'm', dedupe: 'r:T' }) + '\n');
  const r = run('--unacked');
  assert.equal(r.status, 1); assert.match(r.stdout, /ack-r_T/);
  write(path.join(env.root, 'control', 'ack-r_T'), '');
  assert.equal(run().status, 0);
});

function job(env, runId, { events = [], result, request, mtime = NOW - 1000 }) {
  const dir = path.join(env.root, 'jobs', runId);
  write(path.join(dir, 'request.json'), JSON.stringify({ runId, kind: 'card', cardId: runId.replace(/^card-/, ''), ownerSession: 'main', createdAt: iso(NOW - 60000), ...request }), mtime);
  if (events.length) write(path.join(dir, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n', mtime);
  if (result) write(path.join(dir, 'result.json'), JSON.stringify(result), mtime);
}

test('jobs: live row comes from overview.json, finished row from result.json, bare request is pending', () => {
  const env = fresh();
  job(env, 'card-live', { events: [{ ts: iso(NOW - 50000), runId: 'card-live', type: 'queued', cardId: 'live', files: 3 }] });
  job(env, 'card-fin', { result: { runId: 'card-fin', kind: 'card', cardId: 'fin', status: 'FAIL', files: [{}, {}], queuedMs: 1500, runMs: 42000 } });
  job(env, 'card-bare', {});
  write(path.join(env.root, 'overview.json'), JSON.stringify({ schedulerPid: 7, hardCap: 4, slotsUsed: 1, jobs: [
    { runId: 'card-live', card: 'live', kind: 'card', owner: 'o', status: 'RUNNING', currentFiles: ['tests/a.test.mjs'], done: 1, total: 3, queuedMs: 2000, runningMs: 45000 }] }));
  write(path.join(env.root, 'scheduler.heartbeat'), 'x', NOW - 5000);
  const st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  const live = row(st, 'live');
  assert.deepEqual([live.status, live.done, live.total, live.currentFiles[0], live.runningMs], ['RUNNING', 1, 3, 'tests/a.test.mjs', 45000]);
  const fin = row(st, 'fin');
  assert.deepEqual([fin.status, fin.done, fin.total, fin.runningMs, fin.terminal], ['FAIL', 2, 2, 42000, true]);
  assert.equal(row(st, 'bare').status, '待接收');
  assert.equal(st.scheduler.state, 'alive');
  assert.equal(st.rows.at(-1).name, 'fin', 'finished rows sort after active ones');
});

test('job known only from events (scheduler overview lacks it) is derived and flagged', () => {
  const env = fresh();
  const ev = (type, extra) => ({ ts: iso(NOW - 30000), runId: 'card-ev', type, ...extra });
  job(env, 'card-ev', { events: [ev('queued', { cardId: 'ev', files: 3 }), ev('test_start', { file: 'a' }), ev('test_start', { file: 'b' }), ev('test_end', { file: 'a', status: 'PASS' })] });
  const r = row(collect({ root: env.root, sessions: env.sessions, now: NOW }), 'ev');
  assert.deepEqual([r.done, r.total, r.currentFiles], [1, 3, ['b']]);
  assert.match(r.notes.join(), /总览中无此任务/);
});

test('missing everything: no throw, problems listed, scheduler state missing', () => {
  const env = fresh();
  const st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  assert.equal(st.rows.length, 0); assert.equal(st.scheduler.state, 'missing');
  assert.ok(st.problems.some(p => /overview\.json 缺失/.test(p)));
  assert.ok(st.problems.some(p => /sessions/.test(p)));
  assert.match(renderMarkdown(st), /无心跳文件/);
});

test('corrupt JSON in overview, result, events and alerts is reported, never thrown', () => {
  const env = fresh();
  fs.cpSync(path.join(here, 'fixtures', 'observe', 'corrupt-root'), env.root, { recursive: true });
  const st = collect({ root: env.root, sessions: env.sessions, now: Date.parse('2026-10-26T09:30:00Z'), all: true });
  const p = st.problems.join('\n');
  assert.match(p, /overview\.json 损坏/); assert.match(p, /result\.json 损坏/); assert.match(p, /alerts\.jsonl 有 1 行损坏/); assert.match(p, /events\.jsonl 有 1 行损坏/);
  assert.equal(st.alerts.unacked.length, 2);
  assert.equal(row(st, 'cbad').total, 2, 'job with a corrupt result.json falls back to its events');
});

test('alerts: stable ids from runId+type+suffix, ack file removes it from unacked, oldest first', () => {
  const env = fresh();
  fs.cpSync(path.join(here, 'fixtures', 'observe', 'corrupt-root'), env.root, { recursive: true });
  const at = Date.parse('2026-10-26T09:30:00Z');
  let st = collect({ root: env.root, sessions: env.sessions, now: at });
  assert.deepEqual(st.alerts.unacked.map(a => a.id), ['job-x_WAIT_5MIN', 'scheduler_1_RESOURCE_PAUSE']);
  assert.equal(st.alerts.oldestUnacked.id, 'job-x_WAIT_5MIN');
  write(path.join(env.root, 'control', 'ack-job-x_WAIT_5MIN'), '');
  st = collect({ root: env.root, sessions: env.sessions, now: at });
  assert.deepEqual(st.alerts.unacked.map(a => a.id), ['scheduler_1_RESOURCE_PAUSE']);
  assert.equal(st.alerts.total, 2);
  assert.equal(alertId({ runId: 'r', type: 'T' }), 'r_T'); assert.equal(safeId('a b:c'), 'a_b_c');
  assert.match(renderUnacked(st), /ack-scheduler_1_RESOURCE_PAUSE/);
});

test('timeout events become a TIMEOUT alert once per file and show on the job row', () => {
  const env = fresh();
  const ev = (type, extra) => ({ ts: iso(NOW - 20000), runId: 'card-t', type, ...extra });
  job(env, 'card-t', { events: [ev('queued', { cardId: 't', files: 1 }), ev('timeout', { file: 'h.mjs', stage: 'kill-request' }), ev('timeout', { file: 'h.mjs', stage: 'kill-force' })] });
  const st = collect({ root: env.root, sessions: env.sessions, now: NOW });
  assert.equal(st.alerts.unacked.length, 1);
  assert.equal(st.alerts.unacked[0].type, 'TIMEOUT');
  assert.match(row(st, 't').notes.join(), /TIMEOUT/);
  assert.equal(row(st, 't').oldestAlert.type, 'TIMEOUT');
});

test('evaluate: each trigger kind, then ack and disabled threshold silence them', () => {
  const env = fresh();
  write(path.join(env.root, 'scheduler.heartbeat'), 'x', NOW - 100000);
  card(env, 'c1', { startAgo: min(20), final: min(1), log: min(2) });
  card(env, 'c2', { startAgo: min(40), log: min(20) });
  card(env, 'c3', { startAgo: min(5), log: min(1) });
  job(env, 'card-j', { result: { runId: 'card-j', cardId: 'j', status: 'PASS', files: [{}], queuedMs: 1, runMs: 2 } });
  write(path.join(env.root, 'alerts.jsonl'), JSON.stringify({ ts: iso(NOW - 5000), runId: 'card-j', type: 'WAIT_5MIN', message: 'm', dedupe: 'card-j:WAIT_5MIN' }) + '\n');
  const kinds = t => t.map(x => x.kind).sort().join();
  let t = evaluate({ root: env.root, sessions: env.sessions, cards: ['c1', 'c2', 'c3'], jobs: ['j'], now: NOW });
  assert.equal(kinds(t), 'alert,card,card,heartbeat,job');
  assert.ok(t.find(x => x.id === 'c2').reason.includes('卡死'));
  assert.ok(!t.some(x => x.id === 'c3'), 'a healthy running card is not reported');
  write(path.join(env.root, 'control', 'ack-card-j_WAIT_5MIN'), '');
  write(path.join(env.root, 'control', 'ack-scheduler-heartbeat-stale'), '');
  t = evaluate({ root: env.root, sessions: env.sessions, cards: ['c3'], jobs: [], now: NOW });
  assert.equal(t.length, 0);
  fs.rmSync(path.join(env.root, 'control', 'ack-scheduler-heartbeat-stale'));
  t = evaluate({ root: env.root, sessions: env.sessions, cards: [], jobs: [], now: NOW, hbStaleMs: 0 });
  assert.equal(t.length, 0);
});

test('heartbeat boundary: 89 s ok, 90 s stale; unwatched cards and unfinished jobs never trigger', () => {
  const env = fresh();
  write(path.join(env.root, 'scheduler.heartbeat'), 'x', NOW - 89000);
  assert.equal(evaluate({ root: env.root, sessions: env.sessions, now: NOW }).length, 0);
  write(path.join(env.root, 'scheduler.heartbeat'), 'x', NOW - 90000);
  assert.equal(evaluate({ root: env.root, sessions: env.sessions, now: NOW })[0].kind, 'heartbeat');
  write(path.join(env.root, 'scheduler.heartbeat'), 'x', NOW - 1000);
  card(env, 'unwatched', { startAgo: min(60), log: min(40) });
  job(env, 'card-run', { events: [{ ts: iso(NOW), runId: 'card-run', type: 'queued', files: 1 }] });
  assert.equal(evaluate({ root: env.root, sessions: env.sessions, jobs: ['run'], now: NOW }).length, 0);
});

test('markdown: header, columns, unknown ETA, ack hint and problems', () => {
  const env = fresh();
  card(env, 'cc', { startAgo: min(3), log: min(1) });
  write(path.join(env.root, 'alerts.jsonl'), JSON.stringify({ ts: iso(NOW - 120000), runId: 'cc', type: 'X', message: 'boom', dedupe: 'cc:X' }) + '\n');
  const md = renderMarkdown(collect({ root: env.root, sessions: env.sessions, now: NOW }));
  assert.match(md, /\| 名称 \| 类型 \| 负责方 \| 状态 \| 当前文件 \| 完成\/总数 \| 排队 \| 运行 \| 剩余 \| 最老告警 \|/);
  assert.match(md, /\| cc \| 卡 \| 执行者 \| 运行中 .*未知 \| X 2m00s/);
  assert.match(md, /ack-cc_X/); assert.match(md, /输入问题/);
  assert.equal(fmtDur(null), '-'); assert.equal(fmtDur(3725000), '1h02m');
});
