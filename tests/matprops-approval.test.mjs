// D12 卡 D：材料属性审批入口的 L1 与响应解析。数据本身的事实核对由 L2 完成，这里不重复期望数值。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {migrateDepthBudget, reserveCeilingYuan} from '../tools/content-budget.mjs';
import {entriesFor, draftFor, validateDraft, l1, extractReview, inconsistentGate, archiveForRedo, explainEntry, checkReviewCap, maxReviewsPerEntry, grantMaxRequests, grantId, maxRequests, cardId, cardLimitYuan, revision, checkManual, approvalState, manualLabels, runReview, reviewStops, rejudge, rejudgeRecord, rejudgeCutoff, assertRetryAllowed, garlicRetry, retryGrants, capReviewsFor, retryEligible, retryRun, retryBody, loadSavedReviews, contextFor} from '../world/design/matprops-approval.mjs';

test('条目 = 每个类别行 + 每个物品覆盖行；候选与盘上数据逐字一致', async () => {
  const table = JSON.parse(await fs.readFile('world/meta/mechanics/material-props.json', 'utf8'));
  const overlay = JSON.parse(await fs.readFile('world/meta/mechanics/items.json', 'utf8'));
  const entries = await entriesFor();
  assert.equal(entries.length, Object.keys(table.classes).length + Object.values(overlay).filter(r => r.props).length);
  for (const e of entries) assert.deepEqual(await validateDraft(draftFor(e), e), [], e.id);
  assert.notDeepEqual(await validateDraft({id: entries[0].id, row: {...entries[0].row, moisture: 0.5}}, entries[0]), []);
});

test('L1：运行时世界的属性表通过校验，覆盖行不超过物品总数 15%', async () => {
  const r = await l1();
  assert.equal(r.L1, 'passed');
  assert.ok(r.overrides / r.items <= 0.15);
});

test('畸形的审查响应不算通过', () => {
  const response = content => ({choices: [{message: {content}}]});
  assert.deepEqual(extractReview(response('{"contradictions":[]}')), {contradictions: []});
  for (const content of ['{}', '{"contradictions":[{}]}', '{"contradictions":[{"quote":"a","field":"b","severity":"bad","verdict":"conflict","reason":"c"}]}',
    '{"contradictions":[{"quote":"a","field":"b","severity":"soft","reason":"c"}]}', '{"contradictions":[{"quote":"a","field":"b","severity":"soft","verdict":"maybe","reason":"c"}]}'])
    assert.throws(() => extractReview(response(content)), error => error.code === 'REVIEW_FORMAT');
});

const item = (severity, verdict, reason = '原因') => ({quote: 'q', field: 'moisture', severity, verdict, reason});
const resp = list => ({choices: [{message: {content: JSON.stringify({contradictions: list})}}]});
test('一致性：hard 而 verdict=no_conflict（自撤）判无效输出 REVIEW_INCONSISTENT，哪怕 reason 不含撤回字样也按结构判', () => {
  for (const reason of ['算式无误，应报 soft', '此项不成立', '原因'])
    assert.throws(() => extractReview(resp([item('hard', 'no_conflict', reason)])), e => e.code === 'REVIEW_INCONSISTENT');
  // 同一输出里混有正常 hard 也整体无效（模型输出自相矛盾，不能部分采信）
  assert.throws(() => extractReview(resp([item('hard', 'conflict'), item('hard', 'no_conflict')])), e => e.code === 'REVIEW_INCONSISTENT');
});
test('一致性：正常 hard（conflict）与 soft/style 不受影响；reason 里出现「无误」字样但 verdict=conflict 不误伤', () => {
  const r = extractReview(resp([item('hard', 'conflict', '另一处算式无误，但单位错'), item('soft', 'no_conflict'), item('style', 'conflict')]));
  assert.equal(r.contradictions.length, 3);
  assert.equal(r.contradictions[0].severity, 'hard');
});
test('一致性重试：按错误历史计数，第二次矛盾后发请求前拒绝；夹别的错误不提前误判，不改记录', () => {
  const rec = {errorHistory: []};
  inconsistentGate(rec);
  rec.errorHistory.push('REVIEW_INCONSISTENT');   // 第一次矛盾：放行 1 次重试
  inconsistentGate(rec);
  rec.errorHistory.push('REVIEW_FORMAT');         // 中间插一次普通失败：仍只算 1 次矛盾
  inconsistentGate(rec);
  assert.deepEqual(rec.errorHistory, ['REVIEW_INCONSISTENT', 'REVIEW_FORMAT']);
  rec.errorHistory.push('REVIEW_INCONSISTENT');   // 第二次矛盾：用尽
  assert.throws(() => inconsistentGate(rec), e => e.code === 'REVIEW_INCONSISTENT_EXHAUSTED');
  inconsistentGate({});                           // 无历史放行
});
test('archiveForRedo：只归档 manual 记录、不删、编号递增；非 manual 拒绝；归档不改账本计次', async () => {
  const os = await import('node:os'), path = await import('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'redo-')), root = path.join(dir, 'r'), arc = path.join(dir, 'a');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'class_egg.json'), JSON.stringify({id: 'class_egg', status: 'manual'}));
  await fs.writeFile(path.join(root, 'class_x.json'), JSON.stringify({id: 'class_x', status: 'passed'}));
  const [dest] = await archiveForRedo(['class_egg'], {root, archiveRoot: arc});
  assert.equal(JSON.parse(await fs.readFile(dest, 'utf8')).status, 'manual');
  await assert.rejects(fs.stat(path.join(root, 'class_egg.json')));
  await assert.rejects(archiveForRedo(['class_x'], {root, archiveRoot: arc}), /只归档 manual/);
  await fs.writeFile(path.join(root, 'class_egg.json'), JSON.stringify({id: 'class_egg', status: 'manual'}));
  const [d2] = await archiveForRedo(['class_egg'], {root, archiveRoot: arc});
  assert.notEqual(d2, dest);
  assert.equal((await fs.readdir(arc)).length, 2);
  const ledger = {requests: Object.fromEntries([0, 1, 2].map(i => [`r${i}`, {label: `content-review-2-class_egg-review${i}`, status: 'settled'}]))};
  assert.throws(() => checkReviewCap(ledger, 'class_egg'), e => e.code === 'REVIEW_LIMIT');
});
test('--show：物品覆盖行打印相对类别代表值的偏差、阈值与比较结果', () => {
  const table = {kcalPerSatiety: 24, memberDeviationThreshold: 0.25,
    classes: {fruit: {selection: {method: 'mean'}, sources: [{name: 'a', moistureFraction: 0.8, kcalPer100gWet: 50}, {name: 'b', moistureFraction: 0.8, kcalPer100gWet: 50}]}}};
  const entry = {id: 'item_x', kind: 'material-props-item', row: {sources: [{name: 'x', citation: 'c', moistureFraction: 0.6, kcalPer100gWet: 50}]}};
  const text = explainEntry(entry, table, [], ['fruit']).join('\n');
  assert.match(text, /相对类别 fruit 代表值.*dryFraction 100\.00%.*阈值 25\.00%.*超阈值/);
});

test('同条审查上限 = 1 初审 + 2 修正：第 3 次放行，第 4 次在发请求前报 REVIEW_LIMIT（不发调用、不计费）', () => {
  const ledger = n => ({requests: Object.fromEntries(Array.from({length: n}, (_, i) => [`r${i}`, {label: `content-review-2-class_x-review${i}`, status: 'settled'}]))});
  assert.equal(maxReviewsPerEntry, 3);
  checkReviewCap(ledger(0), 'class_x'); checkReviewCap(ledger(2), 'class_x');
  assert.throws(() => checkReviewCap(ledger(3), 'class_x'), error => error.code === 'REVIEW_LIMIT');
  checkReviewCap(ledger(3), 'class_y');
  const cancelled = ledger(3); for (const r of Object.values(cancelled.requests)) r.status = 'cancelled-unissued';
  checkReviewCap(cancelled, 'class_x');
});

// 人工核定：用注入的指纹函数与记录读取，不依赖正式数据。
const E = id => ({id, row: {basis: 'x'}});
const fp = async e => `fp-${e.id}`;
const reviewedRec = async id => ({id, fingerprint: `fp-${id}`, review: {contradictions: []}});
const good = id => ({id, fingerprint: `fp-${id}`, recompute: '1490÷0.414≈3600，÷24=150', recomputedBy: '主会话', confirmedBy: '独立审查者甲', date: '2026-11-09', label: manualLabels.reviewed});

test('人工核定：指纹不符、缺独立确认、确认者即复算者、缺标注都拒绝', async () => {
  const entries = [E('a'), E('b')];
  assert.equal((await checkManual({entries: [good('a')]}, entries, fp, reviewedRec)).size, 1);
  await assert.rejects(checkManual({entries: [{...good('a'), fingerprint: 'old'}]}, entries, fp, reviewedRec), /指纹/);
  await assert.rejects(checkManual({entries: [{...good('a'), confirmedBy: ''}]}, entries, fp, reviewedRec), /confirmedBy/);
  await assert.rejects(checkManual({entries: [{...good('a'), confirmedBy: '主会话'}]}, entries, fp, reviewedRec), /独立审查者/);
  await assert.rejects(checkManual({entries: [{...good('a'), label: 'L2 通过'}]}, entries, fp, reviewedRec), /标注/);
  await assert.rejects(checkManual({entries: [good('zzz')]}, entries, fp, reviewedRec), /不存在/);
});

test('人工核定与 L2 通过分开计数；既无 L2 通过也无人工核定的列为未决', async () => {
  const entries = [E('a'), E('b'), E('c'), E('d')];
  const rec = {a: {status: 'passed', fingerprint: 'fp-a', errors: [], review: {contradictions: [{severity: 'soft'}]}},
    b: {status: 'manual', fingerprint: 'fp-b', errors: [{severity: 'hard'}], review: {contradictions: [{severity: 'hard'}]}},
    c: {status: 'passed', fingerprint: 'old', errors: [], review: {contradictions: []}}};
  const manual = await checkManual({entries: [good('b')]}, entries, fp, reviewedRec);
  const st = await approvalState(entries, {manual, loadRecord: async id => rec[id] ?? null, fingerprint: fp});
  assert.deepEqual(st, {l2: ['a'], manual: ['b'], unresolved: ['c', 'd']});
});

test('人工核定：缺日期拒绝、重复条目拒绝', async () => {
  const entries = [E('a')];
  await assert.rejects(checkManual({entries: [{...good('a'), date: ''}]}, entries, fp, reviewedRec), /日期/);
  await assert.rejects(checkManual({entries: [{...good('a'), date: '11-09'}]}, entries, fp, reviewedRec), /日期/);
  await assert.rejects(checkManual({entries: [good('a'), good('a')]}, entries, fp, reviewedRec), /重复/);
});

test('人工核定两种标注：「模型误判」要求现存记录审的是当前数据；「未经L2复审」要求上次指纹与改动内容', async () => {
  const entries = [E('a')];
  const stale = async id => ({id, fingerprint: 'old', review: {contradictions: []}}), never = async () => ({id: 'a', fingerprint: 'old', review: null});
  await assert.rejects(checkManual({entries: [good('a')]}, entries, fp, stale), /当前数据/);
  await assert.rejects(checkManual({entries: [good('a')]}, entries, fp, never), /当前数据/);
  const un = {...good('a'), label: manualLabels.unreviewed, lastL2Fingerprint: 'old', changeDescription: '含水改 0.762，能量复算'};
  assert.equal((await checkManual({entries: [un]}, entries, fp, never)).size, 1);
  await assert.rejects(checkManual({entries: [{...un, lastL2Fingerprint: ''}]}, entries, fp, never), /lastL2Fingerprint/);
  await assert.rejects(checkManual({entries: [{...un, changeDescription: ''}]}, entries, fp, never), /changeDescription/);
  await assert.rejects(checkManual({entries: [{...un, lastL2Fingerprint: 'fp-a'}]}, entries, fp, never), /指纹相同/);
});

test('L2 通过的记录缺 errors 字段或 review 结构非法时抛错（同 readApprovedContent）', async () => {
  const entries = [E('a')];
  const run = rec => approvalState(entries, {loadRecord: async () => rec, fingerprint: fp});
  await assert.rejects(run({id: 'a', status: 'passed', fingerprint: 'fp-a', review: {contradictions: []}}), /errors/);
  await assert.rejects(run({id: 'a', status: 'passed', fingerprint: 'fp-a', errors: [], review: {}}), /contradictions/);
  await assert.rejects(run({id: 'a', status: 'passed', fingerprint: 'fp-a', errors: [], review: {contradictions: [{severity: 'x'}]}}), /无效/);
});

// 按 revision 计次：旧 revision（review-1）的请求保留且不计入新 revision；新 revision 内 1 初审 + 2 修正，第 4 次报 REVIEW_LIMIT（该条转 manual）。
const labelled = (dir, id, n) => ({requests: Object.fromEntries(Array.from({length: n}, (_, i) => [`${dir}-${i}`, {label: `content-${dir}-${id}-review${i}`, status: 'settled'}]))});
test('审查上限按 revision 计数：旧 revision 的 3 次不挡新 revision，新 revision 内第 4 次才超限', () => {
  const old = labelled('review-1', 'class_x', 3);
  checkReviewCap(old, 'class_x', 'review-2');
  assert.throws(() => checkReviewCap(old, 'class_x', 'review-1'), error => error.code === 'REVIEW_LIMIT');
  const both = {requests: {...old.requests, ...labelled('review-2', 'class_x', 2).requests}};
  checkReviewCap(both, 'class_x', 'review-2');
  const over = {requests: {...old.requests, ...labelled('review-2', 'class_x', 3).requests}};
  assert.throws(() => checkReviewCap(over, 'class_x', 'review-2'), error => error.code === 'REVIEW_LIMIT');
  // id 前缀相近的条目互不影响
  checkReviewCap(labelled('review-2', 'class_xy', 3), 'class_x', 'review-2');
  assert.match(revision, /-2$/);
});

test('maxRequests 40→60→75→100→130：逐步授权写入账本、limitYuan 不变、幂等；共用预算模块只认调整后的 130', () => {
  const ledger40 = {spentYuan: 0.14, reservedYuan: 0, limitYuan: 20, waveLimitYuan: 20,
    cards: {[cardId]: {limitYuan: cardLimitYuan, spentYuan: 0.14, reservedYuan: 0, maxRequests: 40}}, requests: {a: {card: cardId, status: 'settled'}}};
  const allocation = {cardId, incrementLimitYuan: cardLimitYuan, maxRequests, waveLimitYuan: 20, startingSpentYuan: 0, startingReservedYuan: 0};
  assert.equal(maxRequests, 130);
  assert.throws(() => migrateDepthBudget(ledger40, cardId, allocation), /单卡授权额度已改变/);
  // 从 40 直接走完两步
  const both = grantMaxRequests(ledger40);
  assert.equal(both.cards[cardId].maxRequests, 130);
  assert.equal(both.cards[cardId].limitYuan, 1.5);
  assert.equal(both.cards[cardId].spentYuan, 0.14);
  assert.ok(both.requests.a);
  assert.deepEqual(both.authorizations.map(a => [a.before.maxRequests, a.after.maxRequests]), [[40, 60], [60, 75], [75, 100], [100, 130]]);
  assert.equal(both.authorizations[0].id, grantId);
  assert.deepEqual(migrateDepthBudget(both, cardId, allocation).cards, both.cards);
  assert.deepEqual(grantMaxRequests(both), both);
  // 账本已在 60（含 60 的授权记录）时只补第二步
  const at60 = {...ledger40, cards: {[cardId]: {...ledger40.cards[cardId], maxRequests: 60}}, authorizations: [both.authorizations[0]]};
  const step2 = grantMaxRequests(at60);
  assert.equal(step2.cards[cardId].maxRequests, 130);
  assert.equal(step2.authorizations.length, 4);
  // 账本已在 75（含 60、75 的授权记录）时只补最后一步
  const at75 = {...ledger40, cards: {[cardId]: {...ledger40.cards[cardId], maxRequests: 75}}, authorizations: step2.authorizations.slice(0, 2)};
  assert.equal(grantMaxRequests(at75).cards[cardId].maxRequests, 130);
  // 账本已在 100（含前三条授权）时只补 100→130
  const at100 = {...ledger40, cards: {[cardId]: {...ledger40.cards[cardId], maxRequests: 100}}, authorizations: step2.authorizations.slice(0, 3)};
  const s130 = grantMaxRequests(at100);
  assert.equal(s130.cards[cardId].maxRequests, 130);
  assert.equal(s130.cards[cardId].limitYuan, 1.5);
  assert.equal(s130.authorizations.at(-1).before.maxRequests, 100);
  // 账本与批准时快照不符、或 60 没有授权记录：拒绝
  assert.throws(() => grantMaxRequests({...ledger40, cards: {[cardId]: {...ledger40.cards[cardId], limitYuan: 2}}}), /快照不符/);
  assert.throws(() => grantMaxRequests({...ledger40, cards: {[cardId]: {...ledger40.cards[cardId], maxRequests: 60}}}), /快照不符/);
});

// ---- 审查解析失败即停 / 离线重判 / garlic 一次性授权 ----
const fakeEntries = ids => ids.map(id => ({id, kind: 'material-props-item', row: {basis: 'b'}}));
const okContent = JSON.stringify({contradictions: [{quote: 'q', field: 'basis', severity: 'soft', verdict: 'conflict', reason: 'r'}]});
const mkClient = contentFor => { const calls = []; return {calls, spent: 0, budgetYuan: 20, estimateCostYuan: () => .01,
  async generate(body, label) { calls.push(label); this.spent += .01; return {choices: [{message: {content: contentFor(label, calls.length)}}], usage: {completion_tokens: 5}, measurement: {costUpperYuan: .01}}; }}; };
const mkRoot = async t => { const dir = await fs.mkdtemp(path.join(tmpRoot(), 'matprops-')); t.after(() => fs.rm(dir, {recursive: true, force: true})); return dir; };
const offline = {ctx: () => null, cardIdArg: null, allocation: null};

test('审查解析失败即停：第一条解析报错（REVIEW_FORMAT）后第二条不再发请求，已发请求的记录照常写盘并报明条目与错误', async t => {
  const dir = await mkRoot(t), client = mkClient(() => 'not json');
  const {halted, results} = await runReview({entries: fakeEntries(['item_a', 'item_b']), client, root: dir, budgetRoot: dir, ...offline});
  assert.equal(client.calls.length, 1);
  assert.deepEqual([halted.id, halted.code], ['item_a', 'REVIEW_FORMAT']);
  assert.equal((await fs.readdir(dir)).filter(f => f.startsWith('item_')).join(), 'item_a.json');   // item_b 没有写记录
  const a = JSON.parse(await fs.readFile(path.join(dir, 'item_a.json'), 'utf8'));
  assert.equal(a.responseEvidence.length, 1);   // 已发请求的证据保留
  assert.equal(results.find(r => r.id === 'item_b').status, 'pending');
});
test('审查解析失败即停：没有 code 的意外异常同样停整轮', async t => {
  const dir = await mkRoot(t), client = mkClient(() => okContent);
  const {halted} = await runReview({entries: fakeEntries(['item_a', 'item_b']), client, root: dir, budgetRoot: dir, ...offline,
    extract: () => { throw new ReferenceError('boom'); }});
  assert.equal(client.calls.length, 1);
  assert.deepEqual([halted.id, halted.code], ['item_a', null]);
  assert.equal(reviewStops(new ReferenceError('x')), true);
  assert.equal(reviewStops(Object.assign(Error('x'), {code: 'REVIEW_INCONSISTENT'})), false);
});
test('正常响应不受影响；REVIEW_INCONSISTENT 沿用重试规则、不停整轮', async t => {
  const dir = await mkRoot(t), client = mkClient(() => okContent);
  const r = await runReview({entries: fakeEntries(['item_a', 'item_b']), client, root: dir, budgetRoot: dir, ...offline});
  assert.equal(r.halted, null);
  assert.equal(client.calls.length, 2);
  assert.equal(r.summary.passed, 2);
  const dir2 = await mkRoot(t), bad = JSON.stringify({contradictions: [{quote: 'q', field: 'f', severity: 'hard', verdict: 'no_conflict', reason: 'r'}]});
  const client2 = mkClient((_l, n) => n === 1 ? bad : okContent);
  const r2 = await runReview({entries: fakeEntries(['item_a', 'item_b']), client: client2, root: dir2, budgetRoot: dir2, ...offline});
  assert.equal(r2.halted, null);
  assert.equal(client2.calls.length, 3);   // item_a 自撤一次后重试通过，item_b 照常
  assert.equal(r2.summary.passed, 2);
});

// 离线重判：临时目录里的假记录与假回复
async function rejudgeFixture(t, replies, {tamper = false, id = 'item_x'} = {}) {
  const budgetRoot = await mkRoot(t), root = path.join(budgetRoot, 'review-2'), entry = fakeEntries([id])[0];
  await fs.mkdir(path.join(budgetRoot, 'budget-responses'), {recursive: true}); await fs.mkdir(root);
  const ledger = {requests: {}}, evidence = [];
  for (const [i, {content, at}] of replies.entries()) {
    const id = `req-${i}`, response = {choices: [{message: {content}}]}, responseHash = hashContent(response);
    ledger.requests[id] = {measurement: {timestamp: at}};
    await fs.writeFile(path.join(budgetRoot, 'budget-responses', `${id}.json`), JSON.stringify({requestId: id, response, responseHash, savedAt: at}));
    evidence.push({phase: 'review', attempt: i + 1, requestId: id, file: `budget-responses/${id}.json`, responseHash: tamper ? 'bad' : responseHash});
  }
  await fs.writeFile(path.join(budgetRoot, 'budget.json'), JSON.stringify(ledger));
  const draft = draftFor(entry);
  const rec = {id, fingerprint: 'fp', status: 'manual', attempts: 0, draft, review: null, errors: ['旧错'], warnings: [], errorCode: null, errorHistory: [null, null],
    frozenCandidate: {entryHash: hashContent(entry), draftHash: hashContent(draft)}, responseEvidence: evidence, measurements: []};
  await fs.writeFile(path.join(root, `${id}.json`), JSON.stringify(rec));
  const ledgerBytes = await fs.readFile(path.join(budgetRoot, 'budget.json'), 'utf8');
  const run = (dry = false) => rejudge({entries: [entry], root, budgetRoot, dry, fingerprint: () => 'fp'});
  const read = async () => JSON.parse(await fs.readFile(path.join(root, `${id}.json`), 'utf8'));
  return {run, read, entry, budgetRoot, ledgerBytes, root};
}
const after = '2026-11-09T16:00:00Z', before = '2026-11-09T12:00:00Z';
const hardContent = JSON.stringify({contradictions: [{quote: 'q', field: 'moisture', severity: 'hard', verdict: 'conflict', reason: 'r'}, {quote: 'q', field: 'basis', severity: 'soft', verdict: 'conflict', reason: 'r'}]});
test('--rejudge：无 hard 的已保存回复 → passed，写 rejudge 字段并保留原 errors/errorHistory，不动账本；dry-run 不写盘', async t => {
  const f = await rejudgeFixture(t, [{content: okContent, at: after}]);
  const [dry] = await f.run(true);
  assert.deepEqual([dry.verdict, dry.hard, dry.requestId], ['passed', 0, 'req-0']);
  assert.equal((await f.read()).status, 'manual');   // dry-run 没写
  const [row] = await f.run();
  assert.equal(row.verdict, 'passed');
  const rec = await f.read();
  assert.equal(rec.status, 'passed'); assert.deepEqual(rec.errors, []); assert.equal(rec.warnings.length, 1); assert.equal(rec.review.contradictions.length, 1);
  assert.equal(rec.rejudge.from, 'saved-response'); assert.equal(rec.rejudge.requestId, 'req-0'); assert.match(rec.rejudge.reason, /d3228afb/);
  assert.deepEqual(rec.rejudge.previous.errors, ['旧错']); assert.deepEqual(rec.rejudge.previous.errorHistory, [null, null]);
  assert.equal(await fs.readFile(path.join(f.budgetRoot, 'budget.json'), 'utf8'), f.ledgerBytes);
  assert.equal((await f.run())[0].skipped, '已重判过');   // 幂等
});
test('--rejudge：有 hard → manual；先格式错再成功时取第一条解析成功的；cutoff 之前的回复不参与', async t => {
  const f = await rejudgeFixture(t, [{content: '{坏', at: after}, {content: hardContent, at: after}]);
  const [row] = await f.run();
  assert.deepEqual([row.verdict, row.hard, row.requestId, row.soft], ['manual', 1, 'req-1', ['soft:basis']]);
  const rec = await f.read();
  assert.equal(rec.status, 'manual'); assert.equal(rec.errors.length, 1); assert.equal(rec.errors[0].severity, 'hard'); assert.ok(!rec.needsRetry);
  const g = await rejudgeFixture(t, [{content: '{坏', at: before}]);
  assert.match((await g.run())[0].skipped, /没有 cutoff/);
  assert.equal((await g.read()).status, 'manual'); assert.equal((await g.read()).rejudge, undefined);
});
test('--rejudge：全部已保存回复都解析不出 → 保持 manual 并标 needsRetry；两次自相矛盾 → 转人工', async t => {
  const f = await rejudgeFixture(t, [{content: '{坏', at: after}, {content: 'xx', at: after}]);
  const [row] = await f.run();
  assert.equal(row.needsRetry, true);
  const rec = await f.read();
  assert.equal(rec.status, 'manual'); assert.equal(rec.needsRetry, true); assert.equal(rec.rejudge.outcome, 'needs-retry');
  const bad = JSON.stringify({contradictions: [{quote: 'q', field: 'f', severity: 'hard', verdict: 'no_conflict', reason: 'r'}]});
  const g = await rejudgeFixture(t, [{content: bad, at: after}, {content: bad, at: after}]);
  const [r2] = await g.run();
  assert.equal(r2.verdict, 'manual'); assert.ok(!r2.needsRetry);
  assert.equal((await g.read()).errorCode, 'REVIEW_INCONSISTENT_EXHAUSTED');
});
test('--rejudge：回复哈希、指纹或冻结候选与记录不符 → 拒绝该条，不改记录', async t => {
  const f = await rejudgeFixture(t, [{content: okContent, at: after}], {tamper: true});
  const before1 = await fs.readFile(path.join(f.root, 'item_x.json'), 'utf8');
  const [row] = await f.run();
  assert.match(row.rejected, /哈希/);
  assert.equal(await fs.readFile(path.join(f.root, 'item_x.json'), 'utf8'), before1);
  const g = await rejudgeFixture(t, [{content: okContent, at: after}]);
  assert.match((await rejudge({entries: [g.entry], root: g.root, budgetRoot: g.budgetRoot, fingerprint: () => 'other'}))[0].rejected, /指纹/);
  const rec = await g.read(); rec.draft = {...rec.draft, row: {basis: 'changed'}}; await fs.writeFile(path.join(g.root, 'item_x.json'), JSON.stringify(rec));
  assert.match((await g.run())[0].rejected, /冻结候选/);
});

test('retryEligible（纯函数）：全部解析失败 → 可；有一条可解析 → 否；非授权条目 → 否；无已保存回复 → 否；自相矛盾 → 否', () => {
  const r = content => ({choices: [{message: {content}}]});
  const bad = [{requestId: 'a', response: r('{坏')}, {requestId: 'b', response: r('xx')}];
  const el = retryEligible({id: 'item_garlic', saved: bad});
  assert.deepEqual([el.eligible, el.requestIds], [true, ['a', 'b']]);
  assert.equal(retryEligible({id: 'item_garlic', saved: [...bad, {requestId: 'c', response: r(okContent)}]}).eligible, false);
  assert.equal(retryEligible({id: 'item_onion', saved: bad}).eligible, false);
  assert.equal(retryEligible({id: 'item_garlic', saved: []}).eligible, false);
  const inc = JSON.stringify({contradictions: [{quote: 'q', field: 'f', severity: 'hard', verdict: 'no_conflict', reason: 'r'}]});
  assert.equal(retryEligible({id: 'item_garlic', saved: [bad[0], {requestId: 'd', response: r(inc)}]}).eligible, false);
  // 意外异常也算解析不出
  assert.equal(retryEligible({id: 'item_garlic', saved: bad, extract: () => { throw new TypeError('x'); }}).eligible, true);
});
test('--rejudge 对授权条目额外评估 retryEligible 并写入记录（不限 cutoff），其他条目不写', async t => {
  const f = await rejudgeFixture(t, [{content: '{坏', at: before}], {id: 'item_garlic'});
  const [row] = await f.run();
  assert.equal(row.retryEligible, true);
  const rec = await f.read();
  assert.equal(rec.retryEligible.eligible, true); assert.deepEqual(rec.retryEligible.requestIds, ['req-0']);
  const g = await rejudgeFixture(t, [{content: '{坏', at: before}]);
  await g.run();
  assert.equal((await g.read()).retryEligible, undefined);
});

test('garlic 一次性授权：仅 item_garlic、仅 1 次、须 retryEligible', async () => {
  assert.deepEqual([retryGrants.length, garlicRetry.entry, garlicRetry.extraReviews, garlicRetry.limitYuan, garlicRetry.maxTokens], [1, 'item_garlic', 1, 0.01, 350]);
  const sent = n => ({requests: Object.fromEntries(Array.from({length: n}, (_, i) => [`r${i}`, {label: 'content-review-2-item_garlic-review0', status: 'settled'}]))});
  const cheap = {rates: {hit: 0, miss: 0, output: 1}}, body = {max_tokens: 1200, messages: []};
  assertRetryAllowed({id: 'item_garlic', eligible: true, ledger: sent(3), body, client: cheap});   // 第 4 次放行
  assert.throws(() => assertRetryAllowed({id: 'item_onion', eligible: true, ledger: sent(3), body, client: cheap}), e => e.code === 'RETRY_DENIED' && /只允许 item_garlic/.test(e.message));
  assert.throws(() => assertRetryAllowed({id: 'item_garlic', eligible: true, ledger: sent(4), body, client: cheap}), e => e.code === 'RETRY_DENIED' && /已用掉/.test(e.message));   // 第二次被拒
  assert.throws(() => assertRetryAllowed({id: 'item_garlic', eligible: false, ledger: sent(3), body, client: cheap}), e => e.code === 'RETRY_DENIED');
  assert.throws(() => checkReviewCap(sent(3), 'item_garlic'), e => e.code === 'REVIEW_LIMIT');   // 无授权时仍是 REVIEW_LIMIT
  const gate = capReviewsFor({budgetRoot: '.', client: cheap, retry: garlicRetry, eligible: true});
  await assert.rejects(() => gate({body, entry: {id: 'item_onion'}, phase: 'review', record: {}}), e => e.code === 'RETRY_DENIED');
});
test('garlic 金额上限：按账本同一预留口径，用授权的 max_tokens 核算；上界 ≤0.01 放行，>0.01 拒绝并报出数', () => {
  const ledger = {requests: Object.fromEntries([0, 1, 2].map(i => [`r${i}`, {label: 'content-review-2-item_garlic-review0', status: 'settled'}]))};
  const body = {max_tokens: 1200, messages: [{role: 'user', content: 'x'.repeat(1000)}]};
  // 预留上界 = (UTF-8 字节 × miss + max_tokens × output) / 1e6；字节数含 model 等默认字段，这里只验大小关系与 max_tokens 覆盖
  const exact = rates => reserveCeilingYuan({rates}, retryBody(garlicRetry, body));
  const lo = {hit: 0, miss: 0.001, output: 1}, hi = {hit: 0, miss: 0.001, output: 100};
  assert.ok(exact(lo) <= 0.01 && exact(hi) > 0.01);
  assert.ok(exact(lo) < reserveCeilingYuan({rates: lo}, body));   // 350 < 1200，覆盖生效
  assertRetryAllowed({id: 'item_garlic', eligible: true, ledger, body, client: {rates: lo}});
  assert.throws(() => assertRetryAllowed({id: 'item_garlic', eligible: true, ledger, body, client: {rates: hi}}), e => e.code === 'RETRY_DENIED' && /预留上界 \d+\.\d+ 元超过上限 0\.01/.test(e.message));
});
test('--retry-garlic：流水线只收到授权条目，请求带授权的 max_tokens，其他条目记录不动；不符条件时发请求前拒绝且不归档', async t => {
  const budgetRoot = await mkRoot(t), root = path.join(budgetRoot, 'review-2'), entries = fakeEntries(['item_garlic', 'item_other']);
  await fs.mkdir(root);
  await fs.writeFile(path.join(budgetRoot, 'budget.json'), JSON.stringify({spentYuan: 0, reservedYuan: 0, limitYuan: 20, requests: Object.fromEntries([0, 1, 2].map(i => [`r${i}`, {label: 'content-review-2-item_garlic-review0', status: 'settled'}]))}));
  const other = JSON.stringify({id: 'item_other', status: 'manual'});
  await fs.writeFile(path.join(root, 'item_other.json'), other);
  const garlicRec = {id: 'item_garlic', status: 'manual', retryEligible: {eligible: true}};
  await fs.writeFile(path.join(root, 'item_garlic.json'), JSON.stringify(garlicRec));
  const seen = [], client = {rates: {hit: 0, miss: 0.001, output: 1}, spent: 0, budgetYuan: 20, async generate(body, label) { seen.push([label, body.max_tokens]); return {choices: [{message: {content: okContent}}], usage: {completion_tokens: 5}, measurement: {costUpperYuan: .001}}; }};
  // 不合格：未评估为 retryEligible → 拒绝，记录原地不动
  await fs.writeFile(path.join(root, 'item_garlic.json'), JSON.stringify({id: 'item_garlic', status: 'manual'}));
  await assert.rejects(() => retryRun({entries, client, root, budgetRoot, ctx: () => null, cardIdArg: null, allocation: null}), e => e.code === 'RETRY_DENIED');
  assert.equal(seen.length, 0); assert.ok(await fs.stat(path.join(root, 'item_garlic.json')).then(() => true, () => false));
  await fs.writeFile(path.join(root, 'item_garlic.json'), JSON.stringify(garlicRec));
  await retryRun({entries, client, root, budgetRoot, ctx: () => null, cardIdArg: null, allocation: null});
  assert.deepEqual(seen, [['content-review-2-item_garlic-review0', 350]]);
  assert.equal(await fs.readFile(path.join(root, 'item_other.json'), 'utf8'), other);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'item_garlic.json'), 'utf8')).status, 'passed');
  // 再来一次：账本里已 4 次，被拒
  await assert.rejects(() => retryRun({entries, client, root, budgetRoot, ctx: () => null, cardIdArg: null, allocation: null}), e => e.code === 'RETRY_DENIED');
});
