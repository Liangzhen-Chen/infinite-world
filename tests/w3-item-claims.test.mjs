// 物品正文 L1 第二层（tools/w3-item-claims.mjs）：模糊用量与身体尺度、骨架外尺寸、名称出处。
// 与 ITEMCK（tests/w3-item-check.test.mjs）分工：这里不测 storage 处置、包装、制作痕迹。
// 全部用内嵌夹具，不读真实数据；接线用例单独动态加载真实世界。
import test from 'node:test';
import assert from 'node:assert/strict';
import {itemClaimIssues, amountIssues, nameIssues} from '../tools/w3-item-claims.mjs';
import {itemTextIssues} from '../tools/w3-item-check.mjs';

const CATALOG = [
  {id: 'oil', name: '亚麻籽油', tags: [], shelfLifeDays: 90},
  {id: 'rope', name: '陈记麻绳', tags: []},
  {id: 'awl', name: '细锥', tags: ['tool'], aliases: ['小锥']},
  {id: 'bag', name: '粗盐小包', tags: []},
];
const NAMES = [
  {id: 'npc_a', name: '林穗'}, {id: 'npc_b', name: '严辙'}, {id: 'loc_hw', name: '河湾村'}, {id: 'bld_forge', name: '铁匠铺'}, {id: 'loc_x', name: '白石镇'},
];
// 与 w3Context 一致：catalog、worldNames 不可枚举（不进指纹）。
const CTX = Object.defineProperties({origin: {id: 'loc_hw', name: '河湾村'}}, {catalog: {value: CATALOG}, catalogRecipes: {value: []}, worldNames: {value: NAMES}});
const entry = {id: 'item_oil', name: '亚麻籽油', origin: 'loc_hw', use: '压榨亚麻籽得到的油', shelfLifeDays: 90, acquisition: {seller: 'npc_b', mode: '有限库存'}};
const check = (draft, e = entry, ctx = CTX) => itemClaimIssues(draft, e, ctx).join(' ');

test('模糊用量与身体尺度：按类判错', () => {
  for (const word of ['少许', '些许', '少量', '一些', '一点点', '适量', '微量']) assert.match(check({description: `取${word}对光看。`}), new RegExp(`写了模糊用量「${word}」`), word);
  for (const word of ['一掌', '两指', '一拃', '一握', '一撮', '三指宽', '半掌']) assert.match(check({inspection: `约${word}。`}), new RegExp(`写了身体尺度「${word}」`), word);
  assert.match(check({description: '线绕数匝后收口。'}), /写了模糊用量「数匝」/);
  assert.match(check({description: '绕线数圈。'}), /写了模糊用量「数圈」/);
  assert.match(check({description: '滴入几滴。'}), /写了模糊用量「几滴」/);
});

test('骨架外尺寸：长度单位与小容量单位判错；骨架里原样写了就放行', () => {
  assert.match(check({description: '长三十厘米。'}), /骨架外尺寸「三十厘米」/);
  assert.match(check({description: '厚约五毫米。'}), /骨架外尺寸「五毫米」/);
  assert.match(check({description: '一尺来长。'}), /骨架外尺寸或用量「一尺」/);
  assert.match(check({description: '舀两勺。'}), /骨架外尺寸或用量「两勺」/);
  assert.equal(check({description: '长三十厘米。'}, {...entry, use: '压榨用具，长三十厘米'}), '', '骨架 use 里原样写了的尺寸放行');
});

test('“若干”：用在部件数目放行，用在材料用量判错', () => {
  assert.equal(check({description: '剪成若干分袋面，边口缝合。'}), '');
  assert.equal(check({description: '由若干木片拼成。'}), '');
  assert.match(check({description: '取若干盐撒入。'}), /“若干”只可用于工序形成的部件数目/);
  assert.match(check({description: '撒若干在表面。'}), /“若干”/);
});

test('反例：不是模糊用量的常见词不误报', () => {
  for (const text of ['数据记录齐全。', '几乎没有气味。', '翻动数次，听声。', '开合数遍。', '反复折叠两次。', '手指不沾油。', '握住柄部试重。', '表面平整，一块完整。', '双层，一对两只。', '重0.1公斤，价二铜币。', '全程约九十分钟。']) assert.equal(check({description: text}), '', text);
});

test('模糊用量不论位置一律判：名词后、动词后、分句末都算（没有“程度补语”豁免）', () => {
  for (const text of ['土色横纹，附少量干土。', '取少许。', '肌理间夹少量细筋，外层覆膜。', '少许。', '取少量摊开，看是否结块。', '解开外层数圈，看线股。',
    '放盐少许。', '加水少许，', '涂油少许。', '撒灰少量。', '盐少许。', '受压后能回弹少许。', '遇热变软些许，冷后复硬。'])
    assert.match(check({description: text}), /写了模糊用量/, text);
});

test('“老/小+姓”只在人或店的语境里算人名：老姜、小钱这类名词不误报', () => {
  for (const text of ['切老姜。', '加老姜，', '小姜。', '付小钱。', '老姜的辣味。']) assert.equal(check({description: text}), '', text);
  for (const text of ['老姜家的货。', '小钱打造的。', '老陈说过。']) assert.match(check({description: text}), /人名或店名/, text);
});

test('名称出处：世界里的人名地名店名必须有出处；origin、seller 指向的名称、骨架文字里的名称放行', () => {
  assert.equal(check({description: '河湾村集市常见，由严辙出售。'}), '', 'origin 与 acquisition.seller 解析出的名称就是出处');
  assert.match(check({description: '由林穗出售。'}), /正文出现名称「林穗」/);
  assert.match(check({description: '出自铁匠铺。'}), /正文出现名称「铁匠铺」/);
  assert.match(check({inspection: '白石镇的货。'}), /名称「白石镇」/);
  assert.equal(check({description: '白石镇的货。'}, {...entry, use: '白石镇来货'}), '', '骨架文字里有的名称放行');
});

test('名称出处：物品名、别名、材料名里带的名称不算；人名店名词形', () => {
  assert.equal(check({description: '和陈记麻绳一起绑扎，细锥与小锥各一。'}), '', '物品名、别名先遮掉');
  assert.equal(check({description: '粗盐小包另售。'}), '');
  for (const text of ['老张打的。', '陈师傅的手艺。', '张记出的货。', '李家铺子的货。', '小周做的。', '王氏作坊。']) assert.match(check({description: text}), /人名或店名/, text);
  assert.equal(check({description: '老张打的。'}, {...entry, use: '老张打的油'}), '', '骨架里有就放行');
  assert.equal(check({description: '师傅教的手法。'}), '', '没有姓不是人名');
});

test('worldNames 缺失时只做词形检查，不抛错；缺字段忽略', () => {
  const bare = Object.defineProperty({}, 'catalog', {value: CATALOG});
  assert.deepEqual(itemClaimIssues({description: '由林穗出售。'}, entry, bare), []);
  assert.match(itemClaimIssues({description: '老张打的。'}, entry, bare).join(''), /人名或店名/);
  assert.deepEqual(itemClaimIssues({id: 'item_oil'}, entry, CTX), []);
});

test('与 ITEMCK 分工：同一句不重复报，两边互不覆盖', () => {
  const draft = {description: '取少许，置布袋。', storage: '受潮后阴干。'};
  const claims = itemClaimIssues(draft, entry, CTX), item = itemTextIssues(draft, entry, CTX);
  assert.ok(claims.every(m => /模糊用量/.test(m)) && claims.length === 1);
  assert.ok(item.every(m => !/模糊用量/.test(m)) && item.length >= 2);
});

test('amountIssues、nameIssues 可单独调用', () => {
  assert.equal(amountIssues('少许。').length, 1);
  assert.deepEqual(amountIssues(undefined), []);
  assert.deepEqual(nameIssues(undefined, entry, CTX), []);
});

// 接线用例：要用真实 w3Context 构造器（附带不可枚举的 worldNames），所以动态加载真实数据。
test('接入 validateTradesDraft：命中进 errors，worldNames 不可枚举；journey 与 trades 两条路径同一函数', async () => {
  const {loadWorld} = await import('../tools/load-world.mjs');
  const {economyW3Journey} = await import('../world/design/economy-w3-journey.mjs');
  const {journeyContext} = await import('../tools/w3-journey.mjs');
  const {validateTradesDraft} = await import('../tools/w3-trades.mjs');
  const world = await loadWorld(), bones = economyW3Journey(world), block = {names: [], realPeople: []};
  const item = bones.items[0], context = journeyContext(world, bones, item);
  assert.ok(Array.isArray(context.worldNames) && context.worldNames.length > 0);
  assert.ok(!Object.keys(JSON.parse(JSON.stringify(context))).includes('worldNames'), 'worldNames 不可枚举：不进指纹与审核请求');
  const draft = {id: item.id, description: `${item.name}，取少许即可，约一掌长。`, inspection: '看外观。', storage: '避潮。'};
  const result = validateTradesDraft(draft, item, block, context);
  assert.ok(result.errors.some(m => /写了模糊用量「少许」/.test(m)), result.errors.join(' '));
  assert.ok(result.errors.some(m => /写了身体尺度「一掌长」/.test(m)), result.errors.join(' '));
  // 名字不能被别的名字包含（避免遮蔽或出处串味）
  const stranger0 = (row, w) => w.npcs.some(other => other.id !== row.id && other.name.includes(row.name)) || w.locations.some(other => other.name.includes(row.name));
  const stranger = world.npcs.find(row => row.name && row.name.length >= 2 && !JSON.stringify(item).includes(row.id) && !context.catalog.some(entry => entry.name.includes(row.name)) && !stranger0(row, world));
  const named = validateTradesDraft({...draft, description: `${item.name}，由${stranger.name}经手。`}, item, block, context);
  assert.ok(named.errors.some(m => m.includes(`名称「${stranger.name}」`)), named.errors.join(' '));
});

// ── 起草提示词（RCFIX）：journey 与 trades 两处物品提示共用 ITEM_DRAFT_RULES，且不再有“结构、加工痕”导向与字数下限 ──
import fs from 'node:fs/promises';
import {ITEM_DRAFT_RULES, ITEM_REVIEW_CHECKLIST} from '../tools/content-pipeline.mjs';

test('ITEM_DRAFT_RULES：总则与六类禁止项齐全，与 L4 必查清单第 8–15 条一致', () => {
  assert.match(ITEM_DRAFT_RULES, /只写骨架和引用事实里已有的内容，没有就不写/);
  for (const word of ['尺寸', '模糊用量', '身体尺度', '一掌', '少许', '数匝', '若干', '包装和收纳器物', '具体处置做法', '后果', '期限', '骨架外的用途、功效', '制作痕迹', '没有出处的人名、地名、店名']) assert.ok(ITEM_DRAFT_RULES.includes(word), word);
  assert.doesNotMatch(ITEM_DRAFT_RULES, /具体结构|加工痕/);
  assert.ok(ITEM_REVIEW_CHECKLIST.includes('(g)') && ITEM_REVIEW_CHECKLIST.includes('(m)'));
});

test('两处起草提示词源码：物品路径引用 ITEM_DRAFT_RULES；不再有“结构、加工痕”导向和物品字数下限', async () => {
  for (const file of ['tools/w3-journey.mjs', 'tools/w3-trades.mjs']) {
    const source = await fs.readFile(file, 'utf8');
    assert.ok(source.includes('ITEM_DRAFT_RULES'), `${file} 未引用 ITEM_DRAFT_RULES`);
    assert.ok(!/器物自身结构|加工痕|具体结构、痕迹/.test(source), `${file} 仍有“结构、加工痕”导向`);
    assert.ok(!/description\s*(?:建议)?\s*(?:80至135|90–150)字|inspection\s*(?:30至65|45–90)字|storage\s*(?:25至55|35–65)字/.test(source), `${file} 仍有物品字数下限`);
    assert.ok(/process 90(?:至|–)160字/.test(source), `${file} 的配方长度要求不在本卡改动范围，应保留`);
  }
});
