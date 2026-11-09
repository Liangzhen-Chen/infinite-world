// D12 L2 结构化核对（李白 2026-11-09 决定）：AI 判 hard 的项带 kind / claimedValue / claimedFormula / target，由程序用不靠 AI 的推算复核。
// 注入点全是生产代码自己的参数（runReview 的 client/ctx/claimEnv/root，extractReview 的 opts），不另造设施。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadRuntimeWorld as runtimeWorld} from '../tools/load-world.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {backfillSnapshots, contextChange, manualLabels, checkManual, fingerprintOf, smallChange, carryOverRecord, checkVerifiedValues, checkSmallChangeParam, worldTags, condimentGrants, grantCondimentMaxRequests, condimentInitialLedger, skipUnverified, condimentEntries, condimentCard, cardProfiles, condimentBudget, checkReviewCap, revision, extractReview, runReview, reviewStops, reaskGate, misjudgeStats, factPendingStats, checkSourceIds, programClaim, legacyExtractReview} from '../world/design/matprops-approval.mjs';

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

test('fact 项一旦判 hard：不发重问、不放行，直接 manual，标「人工扫一眼量级」，hard 与 AI 意见留在记录里（有无编号都一样）', async t => {
  for (const sourceIds of [env.sourceIds, {}]) {
    const r = await run(t, [entryOf('class_a')], [reply([fact({reason: '含水量与 FDC 不符'})]), reply([])], {kcalPerSatiety: 24, sourceIds});
    assert.equal(r.client.calls.length, 1);   // 没有重问
    const rec = await r.rec('class_a');
    assert.equal(rec.status, 'manual'); assert.deepEqual(rec.errorHistory ?? [], []);
    assert.equal(rec.errors[0].severity, 'hard'); assert.equal(rec.errors[0].reviewNote, '人工扫一眼量级');
    assert.equal(rec.review.factPending.status, '人工扫一眼量级'); assert.equal(rec.review.factPending.facts[0].reason, '含水量与 FDC 不符');
    assert.deepEqual([r.summary.passed, r.summary.manual], [0, 1]);   // 人工比例照原算法计入
    assert.deepEqual(r.summary.factPendingHuman, {count: 1, ids: ['class_a']});
    assert.equal(r.summary.aiMisjudgedByProgram.count, 0);
  }
  // 同一回复里既有 fact 又有算术误判：不为算术部分再发重问（条目反正转人工，不耗调用）
  const mix = await run(t, [entryOf('class_a')], [reply([fact(), arith(83)]), reply([])]);
  assert.equal(mix.client.calls.length, 1); assert.equal((await mix.rec('class_a')).status, 'manual');
  assert.deepEqual(factPendingStats([{id: 'a', status: 'passed', review: {contradictions: [fact()]}}, {id: 'b', status: 'manual', review: {contradictions: [fact()]}}]), {count: 1, ids: ['b']});
});

test('AI 质疑输入（输入与出处不一致）的 arithmetic 转 fact：不自动放行、不重问，直接人工扫一眼量级', async t => {
  const disputed = arith(95, {claimedInputs: {苹果醋: {moistureFraction: 0.44, kcalPer100gWet: 21}}});   // 「含水应为 0.44」
  assert.equal(programClaim(disputed, entryOf('class_a'), 24).verdict, 'disputes-input');
  const r = await run(t, [entryOf('class_a')], [reply([disputed]), reply([])]);
  assert.equal(r.client.calls.length, 1);
  const rec = await r.rec('class_a');
  assert.equal(rec.status, 'manual'); assert.ok(!(rec.errorHistory ?? []).includes('REVIEW_ARITH_MISJUDGED'));
  assert.equal(rec.review.factPending.status, '人工扫一眼量级');
  assert.deepEqual([r.summary.aiMisjudgedByProgram.count, r.summary.factPendingHuman.count], [0, 1]);
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
  assert.match(checkSourceIds({sourceIds: {class_a: {苹果醋: {id: null, status: '近似'}}}}, [e])[0], /近似须带 note/);
  assert.deepEqual(checkSourceIds({sourceIds: {class_a: {苹果醋: {id: null, status: '近似', note: '凭记忆、量级已判合理'}}}}, [e]), []);
  assert.match(checkSourceIds({sourceIds: {class_a: {苹果醋: {id: 'abc', idType: 'NDB', status: '待核对'}}}}, [e])[0], /4–8 位数字/);
  assert.match(checkSourceIds({sourceIds: {class_a: {苹果醋: {id: '02048', idType: 'NDB', status: '待核对'}, 梨: {id: null, status: '未知'}}}}, [e])[0], /登记的出处不存在/);
  // 不引用 USDA FoodData Central 的出处（FDA、FAO、Wood Handbook）不要求编号
  assert.deepEqual(checkSourceIds({}, [{id: 'class_w', row: {sources: [{name: '木', citation: 'Wood Handbook 第4章'}]}}]), []);
});

test('调味卡新修订 d12-condiment-2 / review-2：同条次数从 0 计，旧修订请求不计入，账本累计花费连续，额度不变', async () => {
  assert.deepEqual([condimentCard.revision, condimentCard.reviewDirName, condimentCard.reviewRoot], ['d12-condiment-2', 'review-2', path.join('world/drafts/d12-condiment', 'review-2')]);
  assert.match(condimentCard.revisionSource, /7ca0fc76.*review-2/);
  assert.equal(cardProfiles.condiment.revision, 'd12-condiment-2');
  assert.equal(cardProfiles.condiment.reviewRoot, condimentCard.reviewRoot);   // 人工核定、L4、verify 都指向新修订目录
  assert.equal(cardProfiles.condiment.manualFile, path.join(condimentCard.reviewRoot, 'manual-verified.json'));
  const ledger = JSON.parse(await fs.readFile(path.join(condimentCard.draftRoot, 'budget.json'), 'utf8'));
  const used = id => Object.values(ledger.requests).filter(r => r.label?.startsWith(`content-review-1-${id}-review`)).length;
  assert.equal(used('class_vinegar'), 3);   // 旧修订已用满 3 次
  assert.throws(() => checkReviewCap(ledger, 'class_vinegar', 'review-1'), e => e.code === 'REVIEW_LIMIT');
  for (const id of ['class_vinegar', 'class_spice_seed', 'item_caraway_seed']) checkReviewCap(ledger, id, condimentCard.reviewDirName);   // 新修订从 0 计，不被旧请求挡
  const withNew = {requests: {...ledger.requests, ...Object.fromEntries([0, 1, 2].map(i => [`n${i}`, {label: `content-review-2-class_vinegar-review${i}`, status: 'settled'}]))}};
  assert.throws(() => checkReviewCap(withNew, 'class_vinegar', 'review-2'), e => e.code === 'REVIEW_LIMIT');   // 新修订内第 4 次才超限
  const b = await condimentBudget();   // 沿用同一账本：累计花费就是账本里的值，额度仍 1.0 元
  assert.deepEqual([b.limitYuan, b.sharedLimitYuan, b.spentYuan], [1, 1, ledger.cards[condimentCard.cardId].spentYuan]);
  assert.ok(b.spentYuan >= 0.12998);
});

test('调味卡 maxRequests 60→110 授权：落账、幂等、快照不符拒绝；金额上限不变', () => {
  assert.deepEqual([condimentGrants[0].id, condimentGrants[0].from, condimentGrants[0].to, condimentCard.maxRequests], ['d12-condiment-maxrequests-110', 60, 110, 110]);
  const base = condimentInitialLedger();   // 建账时是 60
  assert.equal(base.cards[condimentCard.cardId].maxRequests, 60);
  const once = grantCondimentMaxRequests(base), c = once.cards[condimentCard.cardId];
  assert.deepEqual([c.maxRequests, c.limitYuan, c.spentYuan], [110, 1, 0]);
  assert.deepEqual(once.authorizations.at(-1).before, {maxRequests: 60, limitYuan: 1, spentYuan: 0, requests: 0});
  assert.match(once.authorizations.at(-1).source, /60→110/);
  assert.equal(base.cards[condimentCard.cardId].maxRequests, 60);   // 不改入参
  const twice = grantCondimentMaxRequests(once);
  assert.deepEqual(twice, once); assert.equal(twice.authorizations.length, once.authorizations.length);   // 幂等
  const bump = f => { const l = structuredClone(base); f(l); return l; };
  for (const f of [l => { l.cards[condimentCard.cardId].maxRequests = 70; }, l => { l.cards[condimentCard.cardId].limitYuan = 2; }, l => { l.cards[condimentCard.cardId].reservedYuan = 0.1; }, l => { l.reservedYuan = 0.1; }])
    assert.throws(() => grantCondimentMaxRequests(bump(f)), /快照不符/);
  assert.throws(() => grantCondimentMaxRequests({...base, cards: {}}), /缺调味卡账本/);
});

test('依赖未核对出处的条目先不审：按出处状态判定，类别行跳过则其成员物品行一并跳过，同类新条目自动适用', () => {
  const cls = (key, names) => ({id: 'class_' + key, kind: 'material-props-class', key, row: {sources: names.map(name => ({name, citation: 'USDA FoodData Central x'}))}});
  const item = (id, names) => ({id, kind: 'material-props-item', row: {sources: names.map(name => ({name, citation: 'USDA FoodData Central x'}))}});
  const entries = [cls('milk', ['牛乳', '羊乳']), item('item_goat_milk', ['羊乳']), item('item_milk', ['牛乳']), cls('veg', ['胡萝卜']), item('item_carrot', ['胡萝卜']), cls('nosrc', [])];
  const ok = {id: '01077', idType: 'NDB', status: '已核对'};
  const table = {sourceIds: {class_milk: {牛乳: ok, 羊乳: {id: null, status: '未知'}}, item_goat_milk: {羊乳: {id: null, status: '未知'}}, item_milk: {牛乳: ok}, class_veg: {胡萝卜: ok}, item_carrot: {胡萝卜: ok}}};
  const overlay = {item_goat_milk: ['milk'], item_milk: ['milk'], item_carrot: ['veg']};   // 物品 id → 运行时世界里的实际标签
  const r = skipUnverified(entries, table, overlay);
  assert.deepEqual(r.skipped.map(x => x.id), ['class_milk', 'item_goat_milk', 'item_milk']);   // item_milk 自身已核对，但所属类别行跳过 → 一并跳过
  assert.match(r.skipped[0].reason, /出处未核对：羊乳/); assert.match(r.skipped[2].reason, /所属类别行依赖未核对出处（milk）/);
  assert.deepEqual(r.keep.map(e => e.id), ['class_veg', 'item_carrot', 'class_nosrc']);
  // 出处核对后状态改为已核对 → 自然进入审查；待核对（有编号未核）同样先不审；同类新条目（另一个类别的新出处）自动适用
  const verified = structuredClone(table); verified.sourceIds.class_milk.羊乳 = ok; verified.sourceIds.item_goat_milk.羊乳 = ok;
  assert.equal(skipUnverified(entries, verified, overlay).skipped.length, 0);
  const pending = structuredClone(verified); pending.sourceIds.class_veg.胡萝卜 = {id: '11124', idType: 'NDB', status: '待核对'};
  assert.deepEqual(skipUnverified(entries, pending, overlay).skipped.map(x => x.id), ['class_veg', 'item_carrot']);
  const added = [...entries, cls('fish', ['鲤']), item('item_fish', ['鲤'])];
  const t2 = {sourceIds: {...table.sourceIds, class_fish: {鲤: {id: null, status: '未知'}}, item_fish: {鲤: ok}}};
  // 跳过清单先列类别行、后列物品行；这里只断言集合：新类别 fish 及其成员与原有 milk 一类都被跳过，其余不受影响
  assert.deepEqual(skipUnverified(added, t2, {...overlay, item_fish: ['fish']}).skipped.map(x => x.id).sort(), ['class_fish', 'class_milk', 'item_fish', 'item_goat_milk', 'item_milk']);
});

test('标签只在基础世界、不在 items.json 覆盖层的物品，也随其类别行一并跳过（用运行时世界的实际标签）', async () => {
  const tags = worldTags(await runtimeWorld());
  assert.ok(tags.item_milk.includes('milk'));   // item_milk 的 milk 标签在基础世界
  const overlay = JSON.parse(await fs.readFile('world/meta/mechanics/items.json', 'utf8'));
  assert.ok(!overlay.item_milk?.tags?.includes('milk'));   // 覆盖层里没有，只看覆盖层会漏
  const table = JSON.parse(await fs.readFile('world/meta/mechanics/material-props.json', 'utf8'));
  table.sourceIds.class_milk.羊乳 = {id: null, status: '未知'};   // 真实表里羊乳已是「近似」（可审），这里显式设为未知来测标签口径
  const e = (id, kind, key) => ({id, kind, key, row: {sources: (table.sourceIds[id] ? Object.keys(table.sourceIds[id]) : []).map(name => ({name, citation: 'USDA FoodData Central x'}))}});
  const entries = [e('class_milk', 'material-props-class', 'milk'), e('item_milk', 'material-props-item')];
  assert.deepEqual(skipUnverified(entries, table, tags).skipped.map(x => x.id), ['class_milk', 'item_milk']);
  assert.deepEqual(skipUnverified(entries, table, {}).skipped.map(x => x.id), ['class_milk']);   // 对照：不给标签就漏判
});

test('出处状态「近似」（凭记忆、量级已判合理）可审；「未知」「待核对」仍先不审', () => {
  const cls = {id: 'class_a', kind: 'material-props-class', key: 'a', row: {sources: [{name: '甲', citation: 'USDA FoodData Central x'}]}};
  const of = status => skipUnverified([cls], {sourceIds: {class_a: {甲: {id: null, status, note: 'n'}}}}, {}).skipped.length;
  assert.deepEqual([of('近似'), of('未知'), of('待核对'), of('已核对')], [0, 1, 1, 0]);
});

// ---- 小改动沿用（±10%） ----
const passedRec = (entry, extra = {}) => ({id: entry.id, fingerprint: 'old', status: 'passed', attempts: 1, draft: {id: entry.id, row: structuredClone(entry.row)}, review: {contradictions: []}, errors: [], warnings: [], contextSnapshot: null, ...extra});
const tweak = (e, fn) => { const x = structuredClone(e); fn(x.row); return x; };
const tolEnv = {kcalPerSatiety: 24, tolerance: 0.1};
test('小改动沿用：所有出处数值相对快照 ±10% 内且结构未变 → 沿用原 L2 结论，不发请求，记「小改动沿用（±10%）」', async t => {
  const old = entryOf('class_a'), dir = await mkRoot(t);
  const now = tweak(old, r => { r.sources[0].kcalPer100gWet = 22; r.sources[0].moistureFraction = 0.94; r.sources[0].citation = '改了出处文字'; r.basis = '改了说明'; });   // 21→22（+4.8%）、含水 +0.1%
  await fs.writeFile(path.join(dir, 'class_a.json'), JSON.stringify(passedRec(old)));
  const client = mkClient([reply([])]);
  const out = await runReview({entries: [now], client, root: dir, budgetRoot: dir, ctx: () => null, cardIdArg: null, allocation: null, claimEnv: tolEnv});
  assert.equal(client.calls.length, 0); assert.equal(out.summary.passed, 1);
  const rec = JSON.parse(await fs.readFile(path.join(dir, 'class_a.json'), 'utf8'));
  assert.equal(rec.status, 'passed'); assert.equal(rec.carriedOver.note, '小改动沿用（±10%）');
  assert.deepEqual(rec.draft, {id: 'class_a', row: now.row});   // 记录里的 draft 跟上现行数据（verify 要求相等）
  assert.equal(rec.reviewedSnapshot.row.sources[0].kcalPer100gWet, 21);   // 快照基准不前移
  // 累计漂移：沿用后再改一次，仍按最初审过的值比，累计超 10% 就必须重审
  const again = tweak(old, r => { r.sources[0].kcalPer100gWet = 24; });   // 相对最初 21 为 +14%，相对上次 22 只 +9%
  const c2 = mkClient([reply([])]);
  await runReview({entries: [again], client: c2, root: dir, budgetRoot: dir, ctx: () => null, cardIdArg: null, allocation: null, claimEnv: tolEnv});
  assert.equal(c2.calls.length, 1);
});

test('小改动超出 ±10% 或结构变化 → 重审（不沿用）；没有容差参数时不沿用', async t => {
  const old = entryOf('class_a');
  const cases = {
    超出10: tweak(old, r => { r.sources[0].kcalPer100gWet = 24; }),                       // +14%
    出处个数: tweak(old, r => { r.sources.push({...r.sources[0], name: '乙'}); r.selection = {method: 'mean', reason: 'r'}; }),
    选取方法: tweak(old, r => { r.selection = {method: 'mean', reason: 'r'}; }),
    出处名: tweak(old, r => { r.sources[0].name = '丙'; }),
    字段集: tweak(old, r => { delete r.sources[0].mealGrams; }),
    mealBasis: tweak(old, r => { r.sources[0].mealBasis = 'dryMatter'; r.sources[0].eatenMoistureFraction = 0.9; }),
    顶层数值: tweak(old, r => { r.heatValue = 18; })};
  for (const [name, now] of Object.entries(cases)) {
    const dir = await mkRoot(t); await fs.writeFile(path.join(dir, 'class_a.json'), JSON.stringify(passedRec(old)));
    const client = mkClient([reply([])]);
    await runReview({entries: [now], client, root: dir, budgetRoot: dir, ctx: () => null, cardIdArg: null, allocation: null, claimEnv: tolEnv});
    assert.equal(client.calls.length, 1, name);   // 发了审查请求
    assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'class_a.json'), 'utf8')).carriedOver, undefined, name);
  }
  assert.deepEqual(smallChange(old.row, tweak(old, r => { r.sources[0].mealGrams = 16; }).row, 0.1), {ok: true});   // 15→16（+6.7%）
  assert.equal(smallChange(old.row, tweak(old, r => { r.sources[0].mealGrams = 17; }).row, 0.1).ok, false);        // +13%
  // 非 passed 的旧记录、缺快照的旧记录都不沿用
  assert.equal(carryOverRecord(passedRec(old, {status: 'manual'}), tweak(old, r => { r.sources[0].mealGrams = 16; }), 'new', 0.1), null);
  assert.equal(carryOverRecord(passedRec(old, {draft: null}), tweak(old, r => { r.sources[0].mealGrams = 16; }), 'new', 0.1), null);
  // 没有容差参数（claimEnv 不带 tolerance）：照旧重审
  const dir = await mkRoot(t); await fs.writeFile(path.join(dir, 'class_a.json'), JSON.stringify(passedRec(old)));
  const client = mkClient([reply([])]);
  await runReview({entries: [tweak(old, r => { r.sources[0].mealGrams = 16; })], client, root: dir, budgetRoot: dir, ctx: () => null, cardIdArg: null, allocation: null, claimEnv: env});
  assert.equal(client.calls.length, 1);
});

test('已核对数据不得被改回近似值：L1 对状态「已核对」且 citation 带 FDC 编号与数值的出处，行内数值偏离 FDC 记录值就报错', async () => {
  const table = JSON.parse(await fs.readFile('world/meta/mechanics/material-props.json', 'utf8')), entries = await entriesFor();
  assert.deepEqual(checkVerifiedValues(table, entries), []);   // 现行数据全部一致
  const bad = structuredClone(entries.find(e => e.id === 'class_spice_seed'));
  bad.row.sources[2].moistureFraction = 0.1; bad.row.sources[2].kcalPer100gWet = 340;   // 香芹籽 FDC 170918：9.87 g/100g、333 kcal/100g
  const errs = checkVerifiedValues(table, [bad]);
  assert.equal(errs.length, 2); assert.match(errs[0], /含水偏离 FDC 记录值.*香芹籽/); assert.match(errs[1], /能量偏离 FDC 记录值/);
  assert.match(checkSourceIds(table, [bad]).join('\n'), /偏离 FDC 记录值/);   // 走 L1 的 checkSourceIds
  // 编号与 citation 不一致也报错；状态不是已核对则不查数值
  const wrongId = structuredClone(table); wrongId.sourceIds.class_spice_seed.香芹籽.id = '999999';
  assert.match(checkVerifiedValues(wrongId, entries.filter(e => e.id === 'class_spice_seed'))[0], /FDC 编号不一致/);
  const approx = structuredClone(table); approx.sourceIds.class_spice_seed.香芹籽 = {id: null, status: '近似', note: 'n'};
  assert.deepEqual(checkVerifiedValues(approx, [bad]), []);
  assert.deepEqual(checkSmallChangeParam(table), []);
  assert.equal(checkSmallChangeParam({}).length, 1);
  assert.equal(table.smallChangeTolerance, 0.1); assert.match(table.smallChangeBasis, /calibrate.*亮圳 19:24 小出入口径/);
});

test('调味卡 review-2 人工核定：item_turnip、class_spice_seed、item_caraway_seed 记「人工核定、模型误判」，指纹与现存 L2 记录一致', async () => {
  const doc = JSON.parse(await fs.readFile(cardProfiles.condiment.manualFile, 'utf8'));
  assert.deepEqual(doc.entries.map(x => x.id), ['item_turnip', 'class_spice_seed', 'item_caraway_seed']);
  assert.ok(doc.entries.every(x => x.label === manualLabels.reviewed));
  const ok = await checkManual(doc, await condimentEntries(), e => fingerprintOf(e, condimentCard.revision), id => fs.readFile(path.join(condimentCard.reviewRoot, id + '.json'), 'utf8').then(JSON.parse));
  assert.equal(ok.size, 3);
  assert.match(doc.entries[1].recompute, /170918.*170929.*171330|170929.*171330.*170918/);
  // 8 项近似出处现为「近似」且带 note：现行数据下调味卡没有因出处状态被跳过的条目
  const table = JSON.parse(await fs.readFile('world/meta/mechanics/material-props.json', 'utf8'));
  assert.equal(skipUnverified(await condimentEntries(), table, worldTags(await runtimeWorld())).skipped.length, 0);
});

// ---- 小改动沿用也比上下文（所属类别推算值、标签、成员关系）----
const ctxOf = (ed, extra = {}) => ({dimensions: {moisture: '质量分数'}, derived: {moisture: 0.5}, item: {id: 'item_a', name: 'A', tags: ['grain']}, members: [{id: 'item_a', weight: 1}],
  classValues: {grain: {row: {basis: '说明', sources: [{name: '麦', citation: '文字', kcalPer100gWet: 350}]}, derived: {energyDensity: ed, moisture: 0.12}}}, ...extra});
const runCtx = async (t, oldCtx, newCtx, rec = {}) => {
  const entry = entryOf('item_a'), dir = await mkRoot(t), client = mkClient([reply([])]);
  await fs.writeFile(path.join(dir, 'item_a.json'), JSON.stringify(passedRec(entry, {contextSnapshot: oldCtx, ...rec})));
  const out = await runReview({entries: [entry], client, root: dir, budgetRoot: dir, ctx: () => newCtx, cardIdArg: null, allocation: null, claimEnv: tolEnv});
  return {client, out, rec: JSON.parse(await fs.readFile(path.join(dir, 'item_a.json'), 'utf8'))};
};
test('小改动沿用要比上下文：类别行改动超过 10%、物品行自身不变 → 物品必须重审；10% 以内可沿用', async t => {
  const big = await runCtx(t, ctxOf(1000), ctxOf(1200));   // 类别推算值 +20%
  assert.equal(big.client.calls.length, 1); assert.equal(big.rec.carriedOver, undefined);
  const small = await runCtx(t, ctxOf(1000), ctxOf(1050));  // +5%
  assert.equal(small.client.calls.length, 0); assert.equal(small.rec.carriedOver.note, '小改动沿用（±10%）');
  assert.equal(small.rec.contextSnapshot.classValues.grain.derived.energyDensity, 1050);   // 快照随之更新
  assert.equal(small.rec.reviewedContext.classValues.grain.derived.energyDensity, 1000);   // 基准不前移
  // 类别行的文字（citation、basis）变了不算结构变化
  const text = ctxOf(1000); text.classValues.grain.row.basis = '换了说明'; text.classValues.grain.row.sources[0].citation = '换了出处文字';
  assert.equal((await runCtx(t, ctxOf(1000), text)).client.calls.length, 0);
});
test('小改动沿用要比上下文：标签、成员关系、类别键变化 → 重审；记录没有上下文快照的旧记录 → 重审；累计漂移按最初基准', async t => {
  const cases = {
    标签: ctxOf(1000, {item: {id: 'item_a', name: 'A', tags: ['legume']}}),
    成员关系: ctxOf(1000, {members: [{id: 'item_a', weight: 1}, {id: 'item_b', weight: 1}]}),
    类别键: (() => { const c = ctxOf(1000); c.classValues = {legume: c.classValues.grain}; return c; })(),
    成员换人: ctxOf(1000, {members: [{id: 'item_z', weight: 1}]})};
  for (const [name, now] of Object.entries(cases)) assert.equal((await runCtx(t, ctxOf(1000), now)).client.calls.length, 1, name);
  const noSnap = await runCtx(t, undefined, ctxOf(1000));   // 旧记录没有 contextSnapshot（JSON 里不写 undefined）
  assert.equal(noSnap.client.calls.length, 1);
  // 沿用一次（+5%）后再涨到相对最初 +14%：必须重审
  const first = await runCtx(t, ctxOf(1000), ctxOf(1050));
  assert.equal(first.client.calls.length, 0);
  const entry = entryOf('item_a'), dir = await mkRoot(t), client = mkClient([reply([])]);
  await fs.writeFile(path.join(dir, 'item_a.json'), JSON.stringify(first.rec));
  await runReview({entries: [entry], client, root: dir, budgetRoot: dir, ctx: () => ctxOf(1140), cardIdArg: null, allocation: null, claimEnv: tolEnv});
  assert.equal(client.calls.length, 1);
  assert.equal(contextChange(null, null, 0.1).ok, true); assert.equal(contextChange({a: 1}, {a: 1.2}, 0.1).ok, false);
});

test('--backfill-snapshots：指纹一致才回填（标「指纹一致回填」），不一致的不回填、照常重审；dry-run 不写盘；不发请求', async t => {
  const a = entryOf('item_a'), b = entryOf('item_b'), dir = await mkRoot(t), ctx = ctxOf(1000), fp = e => hashContent({entry: e, context: ctx, revision});
  const noSnap = (e, extra = {}) => { const r = passedRec(e, {fingerprint: fp(e), ...extra}); delete r.contextSnapshot; return r; };
  const stale = tweak(b, r => { r.sources[0].mealGrams = 16; });   // 记录是旧数据审的：记录指纹 ≠ 现行指纹
  await fs.writeFile(path.join(dir, 'item_a.json'), JSON.stringify(noSnap(a)));
  await fs.writeFile(path.join(dir, 'item_b.json'), JSON.stringify(noSnap(b, {fingerprint: 'old-fp'})));
  const run = dry => backfillSnapshots({entries: [a, stale], root: dir, ctx: () => ctx, fingerprint: fp, dry});
  const dry = await run(true);
  assert.deepEqual(dry.map(r => r.backfilled ?? r.skipped), [true, '指纹不一致，不回填（按无快照重审）']);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'item_a.json'), 'utf8')).contextSnapshot, undefined);   // dry-run 没写
  await run(false);
  const ra = JSON.parse(await fs.readFile(path.join(dir, 'item_a.json'), 'utf8')), rb = JSON.parse(await fs.readFile(path.join(dir, 'item_b.json'), 'utf8'));
  assert.deepEqual(ra.contextSnapshot, ctx); assert.equal(ra.snapshotBackfill.note, '指纹一致回填'); assert.equal(ra.status, 'passed');
  assert.equal(rb.contextSnapshot, undefined);
  assert.equal((await run(false))[0].skipped, '已有快照');   // 幂等
  // 回填后，a 的小改动（+5%）沿用，不发请求；b 没回填 → 照常重审（发 1 次请求）
  const client = mkClient([reply([])]);
  const a2 = tweak(a, r => { r.sources[0].kcalPer100gWet = 22; }), b2 = tweak(b, r => { r.sources[0].kcalPer100gWet = 22; });
  await runReview({entries: [a2, b2], client, root: dir, budgetRoot: dir, ctx: () => ctx, cardIdArg: null, allocation: null, claimEnv: tolEnv});
  assert.equal(client.calls.length, 1); assert.deepEqual(client.calls.map(l => l.includes('item_b')), [true]);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'item_a.json'), 'utf8')).carriedOver.note, '小改动沿用（±10%）');
  assert.equal(client.bodies.length, 1);
});
