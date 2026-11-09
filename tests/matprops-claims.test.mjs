// D12 L2 结构化核对（李白 2026-11-09 决定）：AI 判 hard 的项带 kind / claimedValue / claimedFormula / target，由程序用不靠 AI 的推算复核。
// 注入点全是生产代码自己的参数（runReview 的 client/ctx/claimEnv/root，extractReview 的 opts），不另造设施。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {revision, extractReview, runReview, reviewStops, reaskGate, misjudgeStats, factPendingStats, checkSourceIds, programClaim, legacyExtractReview} from '../world/design/matprops-approval.mjs';

// 苹果醋形的单出处行：含水 0.939、21 kcal/100g、kcalPerSatiety 24 → 推算 moisture 0.939、energyDensity 143（21×10÷0.061÷24=143.4）
const src = {name: '苹果醋', citation: 'USDA FoodData Central 苹果醋', moistureFraction: 0.939, kcalPer100gWet: 21, mealGrams: 15};
const rowOf = extra => ({sources: [src], selection: {method: 'single', reason: 'r'}, basis: 'b', ...extra});
const entryOf = (id, extra) => ({id, kind: 'material-props-class', row: rowOf(extra)});
const env = {kcalPerSatiety: 24, sourceIds: {class_a: {苹果醋: {id: '02048', idType: 'NDB', status: '待核对'}}}};
// field 与 target 对应（派生维度 field=target，basis.* 的 field=basis）；claimedInputs：派生维度按出处名嵌套，basis.* 平铺
const own = {moistureFraction: 0.939, kcalPer100gWet: 21, mealGrams: 15};
const arith = (value, extra = {}) => { const target = 'target' in extra ? extra.target : 'energyDensity';
  return {quote: 'q', field: typeof target === 'string' && target.startsWith('basis') ? 'basis' : target, verdict: 'conflict', severity: 'hard', kind: 'arithmetic', reason: 'r', claimedValue: value, claimedFormula: '21×10÷0.061÷24', target,
    claimedInputs: typeof target === 'string' && target.startsWith('basis') ? own : {苹果醋: own}, ...extra}; };
const fact = (extra = {}) => ({quote: 'q', field: 'moisture', verdict: 'conflict', severity: 'hard', kind: 'fact', reason: 'r', ...extra});
const reply = list => JSON.stringify({contradictions: list});
const resp = list => ({choices: [{message: {content: reply(list)}}]});
const mkClient = replies => { const calls = [], bodies = []; return {calls, bodies, spent: 0, budgetYuan: 20, estimateCostYuan: () => .01,
  async generate(body, label) { calls.push(label); bodies.push(body); this.spent += .01; return {choices: [{message: {content: replies[Math.min(calls.length, replies.length) - 1]}}], usage: {completion_tokens: 5}, measurement: {costUpperYuan: .01}}; }}; };
const mkRoot = async t => { const dir = await fs.mkdtemp(path.join(tmpRoot(), 'matprops-claims-')); t.after(() => fs.rm(dir, {recursive: true, force: true})); return dir; };
const run = (t, entries, replies, claimEnv = env) => mkRoot(t).then(async dir => {
  const client = mkClient(replies);
  const out = await runReview({entries, client, root: dir, budgetRoot: dir, ctx: () => null, cardIdArg: null, allocation: null, claimEnv});
  const rec = id => fs.readFile(path.join(dir, `${id}.json`), 'utf8').then(JSON.parse);
  return {...out, client, dir, rec};
});
const lastText = client => client.bodies.at(-1).messages.at(-1).content;

test('算术误判：程序推算与原数据一致而 AI 的 claimedValue 不同 → 自动重问 1 次，带上程序推算值；重问后通过算 L2 通过', async t => {
  const r = await run(t, [entryOf('class_a')], [reply([arith(83)]), reply([])]);
  assert.equal(r.client.calls.length, 2);
  assert.match(lastText(r.client), /【程序核对】.*energyDensity = 143.*与原数据一致/);
  assert.equal(r.summary.passed, 1); assert.equal(r.summary.manual, 0);
  const rec = await r.rec('class_a');
  assert.equal(rec.status, 'passed'); assert.ok(rec.errorHistory.includes('REVIEW_ARITH_MISJUDGED'));
  assert.equal(reviewStops(Object.assign(Error('x'), {code: 'REVIEW_ARITH_MISJUDGED'})), false);   // 不停整轮
  assert.equal(reviewStops(Object.assign(Error('x'), {code: 'REVIEW_FACT_RECHECK'})), false);
});

test('算术误判：取整口径内同值不算不符（含水 3 位、能量个位）；基础量按自己的口径', () => {
  const e = entryOf('class_a');
  assert.equal(programClaim(arith(143.4), e, 24).verdict, 'agrees');        // 取整后 143 = 推算值
  assert.equal(programClaim(arith(144), e, 24).verdict, 'misjudged');
  assert.equal(programClaim(arith(0.9394, {target: 'moisture'}), e, 24).verdict, 'agrees');   // 3 位小数后 0.939
  assert.equal(programClaim(arith(0.94, {target: 'moisture'}), e, 24).verdict, 'misjudged');
  // 醋的单瓶 50 g：50×21÷100÷24 = 0.4375 → 0.44；AI 算成别的数 = 它自己算错
  const v = c => programClaim(arith(c, {target: 'basis.satiety', source: '苹果醋', grams: 50}), e, 24);
  assert.equal(v(0.44).verdict, 'agrees'); assert.equal(v(0.3).verdict, 'misjudged'); assert.equal(v(0.3).program, 0.44);
});

test('算术真错：程序推算与原数据不一致 → 照常 hard，不重问，转人工', async t => {
  const bad = entryOf('class_a', {energyDensity: 200});   // 存值与出处推算 143 不一致
  const r = await run(t, [bad], [reply([arith(143)])]);
  assert.equal(r.client.calls.length, 1);
  const rec = await r.rec('class_a');
  assert.equal(rec.status, 'manual'); assert.equal(rec.errors[0].severity, 'hard'); assert.equal(rec.errors[0].programCheck.verdict, 'data-error');
  assert.ok(!(rec.errorHistory ?? []).includes('REVIEW_ARITH_MISJUDGED'));
  assert.equal(r.summary.aiMisjudgedByProgram.count, 0);
  // AI 给的数与推算相同却仍标 hard：说不清错在哪，保守当真 hard，不重问
  const r2 = await run(t, [entryOf('class_a')], [reply([arith(143)])]);
  assert.equal(r2.client.calls.length, 1); assert.equal((await r2.rec('class_a')).status, 'manual');
});

test('arithmetic 缺字段判格式错（REVIEW_FORMAT），不放行；缺 kind 同', async t => {
  const e = entryOf('class_a'), opts = {kcalPerSatiety: 24};
  const flat = {target: 'basis.kcal', field: 'basis', claimedInputs: own};
  const bads = [arith(83, {claimedValue: undefined}), arith(83, {claimedValue: '83'}), arith(83, {claimedFormula: ''}), arith(83, {target: undefined}),
    arith(83, {target: 'heatValue', field: 'heatValue'}), arith(83, {target: 'basis.satiety', source: '苹果醋'}),                // 缺 grams
    arith(83, {...flat, grams: 50}), arith(83, {...flat, grams: 50, source: '不存在'}),                                         // 缺/错 source
    arith(83, {target: 'mealDry', field: 'mealDry'}), {...arith(83), kind: undefined}, {...arith(83), kind: 'other'},
    arith(83, {claimedInputs: undefined}), arith(83, {claimedInputs: {苹果醋: {moistureFraction: 0.939}}}),                      // 缺 claimedInputs / 缺 kcalPer100gWet
    arith(83, {claimedInputs: {别的: own}}),                                                                                  // 出处名对不上
    arith(83, {field: 'moisture'}), arith(83, {target: 'moisture', field: 'energyDensity'}),                                    // field 与 target 不对应
    arith(83, {...flat, grams: 50, source: '苹果醋', field: 'energyDensity'})];
  for (const b of bads) assert.throws(() => extractReview(resp([b]), e, opts), x => x.code === 'REVIEW_FORMAT', JSON.stringify(b));
  // 推不出来：行里没有出处可推 moisture
  assert.throws(() => extractReview(resp([arith(1, {target: 'moisture'})]), {id: 'x', row: {basis: 'b', moisture: 0.5}}, opts), x => x.code === 'REVIEW_FORMAT');
  const r = await run(t, [e], [reply([arith(83, {claimedValue: undefined})])]);
  assert.deepEqual([r.halted.id, r.halted.code], ['class_a', 'REVIEW_FORMAT']);   // 格式错照旧停整轮
  assert.equal((await r.rec('class_a')).status, 'manual');
});

test('fact 项一旦判 hard 就不能计为通过：有编号重问 1 次收集意见，重问后无论如何都是 manual（待按编号人工核对，附两次意见）；无编号直接 manual', async t => {
  for (const second of [[fact()], []]) {   // 重问后仍 hard / AI 不再列出该项：都不通过
    const r = await run(t, [entryOf('class_a')], [reply([fact({reason: '初审意见'})]), reply(second)]);
    assert.equal(r.client.calls.length, 2);
    assert.match(lastText(r.client), /按出处编号核对.*苹果醋：NDB 02048（待核对）/);
    const rec = await r.rec('class_a');
    assert.equal(rec.status, 'manual'); assert.ok(rec.errorHistory.includes('REVIEW_FACT_RECHECK'));
    assert.equal(rec.review.factPending.status, '待按编号人工核对'); assert.equal(rec.review.factPending.first[0].reason, '初审意见'); assert.equal(rec.review.factPending.second.length, second.length);
    assert.match(rec.errors.at(-1).reason, /02048/);
    assert.deepEqual([r.summary.passed, r.summary.manual], [0, 1]);   // 人工比例照原算法计入
    assert.deepEqual(r.summary.factPendingHuman, {count: 1, ids: ['class_a']});
    assert.equal(r.summary.aiMisjudgedByProgram.count, 0);
  }
  const none = await run(t, [entryOf('class_b')], [reply([fact()]), reply([])]);   // class_b 没有登记编号
  assert.equal(none.client.calls.length, 1); assert.equal((await none.rec('class_b')).status, 'manual'); assert.equal(none.summary.factPendingHuman.count, 1);
  const unknown = await run(t, [entryOf('class_a')], [reply([fact()]), reply([])], {kcalPerSatiety: 24, sourceIds: {class_a: {苹果醋: {id: null, status: '未知'}}}});
  assert.equal(unknown.client.calls.length, 1); assert.equal((await unknown.rec('class_a')).status, 'manual');
  assert.deepEqual(factPendingStats([{id: 'a', status: 'passed', review: {contradictions: [fact()]}}, {id: 'b', status: 'manual', review: {contradictions: [fact()]}}]), {count: 1, ids: ['b']});
});

test('AI 质疑输入（输入与出处不一致）的 arithmetic 转 fact：不自动放行，不当算术误判', async t => {
  const disputed = arith(95, {claimedInputs: {苹果醋: {moistureFraction: 0.44, kcalPer100gWet: 21}}});   // 「含水应为 0.44」
  assert.equal(programClaim(disputed, entryOf('class_a'), 24).verdict, 'disputes-input');
  const r = await run(t, [entryOf('class_a')], [reply([disputed]), reply([])]);
  assert.equal(r.client.calls.length, 2);   // 有编号：按 fact 重问一次，但不是算术重问
  assert.doesNotMatch(lastText(r.client), /与原数据一致/);
  const rec = await r.rec('class_a');
  assert.equal(rec.status, 'manual'); assert.ok(!rec.errorHistory.includes('REVIEW_ARITH_MISJUDGED'));
  assert.deepEqual([r.summary.aiMisjudgedByProgram.count, r.summary.factPendingHuman.count], [0, 1]);
  const none = await run(t, [entryOf('class_b')], [reply([disputed]), reply([])]);
  assert.equal(none.client.calls.length, 1); assert.equal((await none.rec('class_b')).status, 'manual');
});

test('输入一致但算错 → 重问；输入一致、值也相同却标 hard → 保守留人工', async t => {
  const e = entryOf('class_a');
  assert.equal(programClaim(arith(83), e, 24).verdict, 'misjudged');
  assert.equal(programClaim(arith(143), e, 24).verdict, 'agrees');
  const r = await run(t, [e], [reply([arith(83)]), reply([])]);
  assert.equal(r.client.calls.length, 2); assert.equal((await r.rec('class_a')).status, 'passed');
});

test('mealCap 对干物质基准的类（谷豆果菌）不可比对：转人工，不判格式错、不停整轮', async t => {
  const grain = {id: 'class_g', kind: 'material-props-class', row: {sources: [{name: '燕麦', citation: 'c', moistureFraction: 0.1, kcalPer100gWet: 380, mealGrams: 60, mealBasis: 'dryMatter', eatenMoistureFraction: 0.7}], selection: {method: 'single', reason: 'r'}, basis: 'b'}};
  const claim = arith(40, {target: 'mealCap', claimedInputs: {燕麦: {mealGrams: 60}}});
  assert.equal(programClaim(claim, grain, 24).verdict, 'not-comparable');
  const r = await run(t, [grain, entryOf('class_a')], [reply([claim]), reply([])]);
  assert.equal(r.halted, null); assert.equal(r.client.calls.length, 2);   // 第二条照常发
  assert.equal((await r.rec('class_g')).status, 'manual'); assert.equal((await r.rec('class_a')).status, 'passed');
});

test('重问后仍对不上 → 留人工，不再发第三次请求，hard 与程序核对结果留在记录里', async t => {
  const r = await run(t, [entryOf('class_a')], [reply([arith(83)]), reply([arith(90)]), reply([])]);
  assert.equal(r.client.calls.length, 2);
  const rec = await r.rec('class_a');
  assert.equal(rec.status, 'manual'); assert.equal(rec.errors[0].programCheck.verdict, 'misjudged'); assert.equal(rec.errors[0].programCheck.program, 143);
});

test('统计单列：程序判定误判（含重问后通过的）单列计数；manual 照旧计入人工比例，不放宽', async t => {
  const r = await run(t, [entryOf('class_a'), entryOf('class_c', {energyDensity: 200})],
    [reply([arith(83)]), reply([]), reply([arith(143)])]);   // a：误判→重问→通过；c：真错 → manual
  assert.deepEqual([r.summary.passed, r.summary.manual], [1, 1]);
  assert.deepEqual(r.summary.aiMisjudgedByProgram, {count: 1, ids: ['class_a'], reaskPassed: 1, reaskPassedIds: ['class_a']});
  const batch = JSON.parse(await fs.readFile(path.join(r.dir, 'batch-0.json'), 'utf8'));
  assert.equal(batch.aiMisjudgedByProgram.count, 1);
  assert.equal(batch.manualRatio, 0.5); assert.equal(batch.needsSystemicRepair, true);   // 人工比例按原算法：误判后通过的不计入 manual，真错的照计
  const onDisk = JSON.parse(await fs.readFile(path.join(r.dir, 'summary.json'), 'utf8'));
  assert.equal(onDisk.aiMisjudgedByProgram.reaskPassed, 1);
  // 纯函数：误判后仍 manual 的计入 count，不计入 reaskPassed
  assert.deepEqual(misjudgeStats([{id: 'a', status: 'manual', errorHistory: ['REVIEW_ARITH_MISJUDGED']}, {id: 'b', status: 'passed', errorHistory: [null]}]), {count: 1, ids: ['a'], reaskPassed: 0, reaskPassedIds: []});
});

test('重问次数上限：错误历史里同一重问代码出现 2 次，发请求前拒绝；旧格式回复仍可离线重放', () => {
  reaskGate({errorHistory: ['REVIEW_ARITH_MISJUDGED']});
  assert.throws(() => reaskGate({errorHistory: ['REVIEW_ARITH_MISJUDGED', null, 'REVIEW_ARITH_MISJUDGED']}), e => e.code === 'REVIEW_REASK_EXHAUSTED');
  assert.throws(() => reaskGate({errorHistory: ['REVIEW_FACT_RECHECK', 'REVIEW_FACT_RECHECK']}), e => e.code === 'REVIEW_REASK_EXHAUSTED');
  const oldHard = resp([{quote: 'q', field: 'moisture', severity: 'hard', verdict: 'conflict', reason: 'r'}]);   // 没有 kind 的旧回复
  assert.equal(legacyExtractReview(oldHard).contradictions[0].severity, 'hard');
  assert.throws(() => extractReview(oldHard, entryOf('class_a'), {kcalPerSatiety: 24}), x => x.code === 'REVIEW_FORMAT');
});

test('L1 出处编号：引用 USDA FoodData Central 的出处必须登记编号（或明确写未知），格式与出处名都要对得上', () => {
  const e = entryOf('class_a'), ok = {class_a: {苹果醋: {id: '02048', idType: 'NDB', status: '待核对'}}};
  assert.deepEqual(checkSourceIds({sourceIds: ok}, [e]), []);
  assert.deepEqual(checkSourceIds({sourceIds: {class_a: {苹果醋: {id: null, status: '未知'}}}}, [e]), []);
  assert.match(checkSourceIds({}, [e])[0], /缺编号登记/);
  assert.match(checkSourceIds({sourceIds: {class_a: {苹果醋: {id: null}}}}, [e])[0], /status:'未知'/);
  assert.match(checkSourceIds({sourceIds: {class_a: {苹果醋: {id: 'abc', idType: 'NDB', status: '待核对'}}}}, [e])[0], /4–8 位数字/);
  assert.match(checkSourceIds({sourceIds: {class_a: {苹果醋: {id: '02048', idType: 'NDB', status: '待核对'}, 梨: {id: null, status: '未知'}}}}, [e])[0], /登记的出处不存在/);
  // 不引用 USDA FoodData Central 的出处（FDA、FAO、Wood Handbook）不要求编号
  assert.deepEqual(checkSourceIds({}, [{id: 'class_w', row: {sources: [{name: '木', citation: 'Wood Handbook 第4章'}]}}]), []);
});

test('中断续跑：第一次回复 fact hard 后进程中断，新进程只拿到重问回复，也不能计通过（状态取自落盘记录，不靠内存）', async t => {
  const e = entryOf('class_a'), dir = await mkRoot(t);
  // 第一次运行落盘的状态：errorHistory 记着 REVIEW_FACT_RECHECK，feedback 带初审事实项（与 extractReview 抛错时写入的格式一致）
  let msg;
  try { extractReview(resp([fact({reason: '初审意见'})]), e, {kcalPerSatiety: 24, sourceIds: env.sourceIds.class_a, record: {}}); } catch (x) { msg = x; }
  assert.equal(msg.code, 'REVIEW_FACT_RECHECK');
  const persisted = {errorHistory: ['REVIEW_FACT_RECHECK'], feedback: [msg.message]};
  const review = extractReview(resp([]), e, {kcalPerSatiety: 24, sourceIds: env.sourceIds.class_a, record: persisted});   // 新进程：没有任何内存状态
  assert.equal(review.factPending.status, '待按编号人工核对'); assert.equal(review.factPending.first[0].reason, '初审意见');
  assert.equal(review.contradictions.at(-1).severity, 'hard');
  // 端到端：盘上已有这条记录，新进程的 runReview 只收到重问回复（空）
  const entry = entryOf('class_a'), fingerprint = hashContent({entry, context: null, revision});
  await fs.writeFile(path.join(dir, 'class_a.json'), JSON.stringify({id: 'class_a', fingerprint, status: 'pending', attempts: 0, draft: null, review: null, errors: [], warnings: [], ...persisted}));
  const client = mkClient([reply([])]);
  const out = await runReview({entries: [entry], client, root: dir, budgetRoot: dir, ctx: () => null, cardIdArg: null, allocation: null, claimEnv: env});
  const rec = JSON.parse(await fs.readFile(path.join(dir, 'class_a.json'), 'utf8'));
  assert.equal(rec.status, 'manual'); assert.equal(out.summary.passed, 0); assert.equal(rec.review.factPending.status, '待按编号人工核对');
  assert.deepEqual(out.summary.factPendingHuman, {count: 1, ids: ['class_a']});
});
