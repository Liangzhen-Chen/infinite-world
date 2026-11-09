// D12 卡 D：材料属性审批入口的 L1 与响应解析。数据本身的事实核对由 L2 完成，这里不重复期望数值。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {migrateDepthBudget} from '../tools/content-budget.mjs';
import {entriesFor, draftFor, validateDraft, l1, extractReview, inconsistentGate, checkReviewCap, maxReviewsPerEntry, grantMaxRequests, grantId, maxRequests, cardId, cardLimitYuan, revision, checkManual, approvalState, manualLabels} from '../world/design/matprops-approval.mjs';

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
test('一致性重试：第一次矛盾放行 1 次重试，第二次矛盾发请求前拒绝（转 manual），其他错误码不触发', () => {
  const rec = {};
  inconsistentGate(rec);                       // 首次发请求：无前序错误
  rec.errorCode = 'REVIEW_INCONSISTENT';
  const planned = structuredClone(rec);
  inconsistentGate(planned);                   // 预检副本放行，且不污染真记录
  assert.equal(rec.inconsistentRetried, undefined);
  inconsistentGate(rec);                       // 真请求：放行 1 次重试并标记
  assert.equal(rec.inconsistentRetried, true);
  rec.errorCode = 'REVIEW_INCONSISTENT';       // 重试仍矛盾
  assert.throws(() => inconsistentGate(structuredClone(rec)), e => e.code === 'REVIEW_INCONSISTENT_EXHAUSTED');
  assert.throws(() => inconsistentGate(rec), e => e.code === 'REVIEW_INCONSISTENT_EXHAUSTED');
  rec.errorCode = 'REVIEW_FORMAT';             // 换了错误码：标记清除，不沿用
  inconsistentGate(rec);
  assert.equal(rec.inconsistentRetried, undefined);
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
