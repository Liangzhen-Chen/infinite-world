// 块 6 第 6-22 张：旧世界物品数据（world/meta/items.json）全量转成新物品表（item.json）的 rows、显示名（labels.zh.json）、
// 每件物品的 goods 资源种类（_vocab.json 的 resource 族条目与 economy/resources.json 的行），并反推来源、去处条目的 families。
// 用法：node tools/convert-items.mjs          按旧数据重转并改写上述文件里由本脚本管的部分（重跑结果恒同）
//       node tools/convert-items.mjs --check  只比对，有差异退出码 1，不写盘
// 来源与规矩：卷三乙《物态类别与物品》§7 M3b-9 :2046（三套旧类别并一套，旧标签只核对、不直接变 classes）、M3b-10 :2047（material 多组列表）、
// M3b-24 :2063（unit 并入 massKg，shelfLifeDays 不搬到物品行）、M3b-27 :2066（basePrice 不进 valueBase）、M3b-28 :2067 与 :2072 起"旧用途标签对照表"；
// 卷六 §4.21 规则 9（旧价只作标定参考）、§2.1 资源种类表、§4.22.1 来源去处；docs/迁移体检/块6.md 丙4、丙10（旧数据有的值照转，没有的列登记未建，不编数字）。
// 旧数据没有的值一律不写，不按旧 id 分支：下面的映射表键是旧标签，不是物品 id。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const ITEM_FILE = 'world/ontology/dimensions/item.json';
const LABEL_FILE = 'world/i18n/labels.zh.json';
const VOCAB_FILE = 'world/ontology/dimensions/_vocab.json';
const RES_FILE = 'world/rules/tables/economy/resources.json';
const OLD_ITEMS = 'world/meta/items.json';
const OLD_USE_TAGS = 'world/meta/item-use-tags.json';

// 旧用途标签对照表（卷三乙 :2072 起；迁移数据，只在本工具里用一次，规则层不读旧标签）。等级一律 1（旧数据没有等级，卷文规定迁移初值 1 级）。
// 旧标签 cut 一个管三种：卷文要求按旧数据的标注拆出锯、凿；旧数据没有结构化标注（只有名称与说明文字），本工具不读自然语言，故只给 ability_cut，另列清单交人裁定。
export const ABILITY_OF_TAG = Object.freeze({
  soil_work: 'ability_dig', harvest: 'ability_reap', grip: 'ability_grip', probe: 'ability_probe', pry: 'ability_pry',
  cut: 'ability_cut', pierce: 'ability_drill', unlock: 'ability_pick_lock',
});
// 不是工具能力的两个旧用途标签（:2080–:2081）：物品行不写。
const NOT_ABILITY_TAGS = Object.freeze(['drinkable', 'liquid_container']);
export const MIGRATED_ABILITY_LEVEL = 1;

// 旧标签 → 物品表组件类（M3b-9 ①：旧标签只对到组件类；类别一律由规则表派生）。item 自己有 book、capacityMl、combat 字段的先于标签（②）。
export const COMP_OF_TAG = Object.freeze({
  tool: 'comp_tool', weapon: 'comp_weapon', clothing: 'comp_wearable', container: 'comp_container', liquid_container: 'comp_container',
  book: 'comp_readable', work: 'comp_work',
});

// goods 资源种类行（卷六 §2.1 :112–:122）：来源、去处照卷六 §4.22.1 :1238–:1247 对物品适用的通用通道；其余栏卷文未给值，设计值待裁定。
export const GOODS_UNIT = 'piece';
export const GOODS_SOURCES = Object.freeze(['src_boundary', 'src_genesis', 'src_transform']);
export const GOODS_SINKS = Object.freeze(['sink_boundary', 'sink_consume', 'sink_decay', 'sink_depart', 'sink_loss', 'sink_seized', 'sink_transform']);

// 本卡在 _vocab.json 登的词表条目的显示名（显示名只在 labels，卷二 :293）：能力名照卷三乙 :2074 起对照表"说明"栏，类别名照 :298，尺寸档名照旧 item-size-classes.json。
export const ENTRY_LABELS = Object.freeze({
  ability_cut: '切', ability_dig: '掘', ability_drill: '钻', ability_grip: '夹持', ability_pick_lock: '开锁', ability_probe: '探触', ability_pry: '撬', ability_reap: '割取',
  category_apparel: '服装', category_container: '容器', category_document: '文书', category_tool: '工具', category_weapon: '武器',
  size_tiny: '微件', size_small: '小件', size_medium: '中件', size_large: '大件', size_huge: '特大件',
});

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const lf = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const round4 = (x) => Number(x.toFixed(4));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const resOf = (itemId) => `res_${itemId.replace(/^item_/, '')}`;

/**
 * 旧数据 → 新行。oldItems、useTags 是旧数据（world/meta/items.json、item-use-tags.json）。
 * @param {any[]} oldItems @param {any} useTags
 */
export function convertItems(oldItems, useTags) {
  for (const t of Object.keys(useTags.tags)) {
    if (!Object.hasOwn(ABILITY_OF_TAG, t) && !NOT_ABILITY_TAGS.includes(t)) throw new Error(`convert-items: use tag "${t}" is not in the mapping table (卷三乙 :2072 对照表)`);
  }
  const rows = {};
  const labels = {};
  const report = { noMaterial: [], toolWithoutAbility: [], cutNames: [], units: [] };
  for (const it of oldItems) {
    const id = it.id;
    if (!/^item_[a-z][a-z0-9_]{1,43}$/.test(id)) throw new Error(`convert-items: bad id ${id}`);
    if (Object.hasOwn(rows, id)) throw new Error(`convert-items: duplicate id ${id}`);
    if (!(typeof it.weight === 'number' && it.weight > 0)) throw new Error(`convert-items: ${id} weight must be a number above 0`);
    const tags = it.tags ?? [];
    const comps = new Set();
    for (const t of tags) if (Object.hasOwn(COMP_OF_TAG, t)) comps.add(COMP_OF_TAG[t]);
    const abilities = {};
    for (const t of tags) if (Object.hasOwn(ABILITY_OF_TAG, t)) { abilities[ABILITY_OF_TAG[t]] = MIGRATED_ABILITY_LEVEL; comps.add('comp_tool'); }
    if (it.book !== undefined) comps.add('comp_readable');
    if (it.capacityMl !== undefined) comps.add('comp_container');
    if (it.combat !== undefined) comps.add('comp_weapon');
    const classes = [...comps].sort(cmp);
    const notes = [`旧 id ${id}`, `massKg 取旧 weight（单件，kg）${it.unit !== undefined ? `；旧 unit「${it.unit}」已并入（weight 本就是该单位一份的质量）` : ''}`];
    const row = { basis: '', classes, massKg: round4(it.weight) };
    if (typeof it.origin === 'string') row.origin = it.origin;
    if (comps.has('comp_tool')) {
      // 卷二 §1.6 第 4 项：映射键集覆盖键类型的全族，没有的键写 null。
      if (Object.keys(abilities).length) { row.abilities = Object.fromEntries(Object.values(ABILITY_OF_TAG).map((a) => [a, abilities[a] ?? null])); notes.push(`abilities 由旧用途标签 ${tags.filter((t) => Object.hasOwn(ABILITY_OF_TAG, t)).join('、')} 按对照表迁（初值 ${MIGRATED_ABILITY_LEVEL} 级，basis_kind migrated）`); } else report.toolWithoutAbility.push(id);
      if (abilities.ability_cut !== undefined) report.cutNames.push(`${id}（${it.name}）`);
    }
    if (comps.has('comp_container')) {
      if (tags.includes('liquid_container')) row.holdsLiquid = true;
      if (typeof it.capacityMl === 'number') row.volumeCapacity = round4(it.capacityMl / 1000);
    }
    if (it.book !== undefined && Number.isInteger(it.book.readingMinutes)) row.readMinutes = it.book.readingMinutes;
    // wearPerUse（李白 11-19 21:0x ④）：旧 durability 的单位是"次"——旧 items.mjs wearItem 每次使用减 amount（活动里每次 1：旧 activities.mjs、v2-phase1-activities.mjs），
    // 减到 0 即损坏；故 D 次用坏 = 每次用掉 1/D（耐久 1 → 0，卷三乙 §4.10.1）。只给旧"日用品"（item-use-tags 的 durable 类：工具、武器、衣物、容器）。
    // lifeDays 由卷二 §5.1 式子派生（wearResistance ÷ (wearPerUse × dailyUses)，式子不改）：旧数据无 dailyUses 与材料，lifeDays 仍未知。
    if (comps.has('comp_tool') || comps.has('comp_weapon') || comps.has('comp_wearable') || comps.has('comp_container')) {
      if (!(Number.isInteger(it.durability) && it.durability >= 1)) throw new Error(`convert-items: ${id} durability must be an integer of at least 1`);
      row.wearPerUse = round4(1 / it.durability);
      notes.push(`wearPerUse 取 1 ÷ 旧 durability ${it.durability}（旧 durability 是可用次数）`);
    }
    // material、bulkForm 不写：旧数据没有材料字段（M3b-10 :2047「无材料字段」）。旧材料类标签（paper、ceramic、bamboo、wood、metal 等）
    // 在现有 93 行材料里要么没有唯一对应的行，要么对应的行缺成形固体必填的 wearResistance（I-7，加载即报错），写了 material 即加载失败；
    // 逐项依据与清单见 docs/卡回报/ds-b6-22.md。material 在 _unbuilt-derived.json 的 columns 整类登记未建。
    report.noMaterial.push(id);
    if (it.unit !== undefined) report.units.push(id);
    row.basis = `旧 world/meta/items.json：${notes.join('；')}；basePrice 不进 valueBase（M3b-27，旧价留在旧文件作标定参考）`;
    rows[id] = row;
    labels[id] = { label: it.name };
  }
  return { rows, labels, report };
}

/** 每件物品一个 goods 资源种类：词表 resource 族条目（item 字段指回物品，6-3 暂定口径）与规则表一行。 */
export function goodsResources(rows) {
  const entries = {};
  const ruleRows = [];
  for (const id of Object.keys(rows).sort(cmp)) {
    const res = resOf(id);
    if (Object.hasOwn(entries, res)) throw new Error(`convert-items: resource id ${res} collides`);
    entries[res] = { item: id };
    ruleRows.push({
      key: res,
      value: { countsAsWealth: true, counterpartRX: null, family: 'resfam_goods', issuerBacked: false, onTerminate: 'successor', salvageFraction: 0, sinks: [...GOODS_SINKS], sources: [...GOODS_SOURCES], transferable: 'tr_free', unit: GOODS_UNIT, unitOfAccount: false },
    });
  }
  return { entries, ruleRows };
}

// ---------- 写盘（只改本脚本管的部分，其余原样保留） ----------

function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
  return v;
}
const indented = (v, pad) => JSON.stringify(sorted(v), null, 1).replace(/\n/g, `\n${pad}`);

// item.json：只换 "rows" 一段（表头是人写的紧凑格式，不整文件重排）。
function itemText(current, rows) {
  const head = current.indexOf('\n "rows": ');
  const tail = current.indexOf(',\n "version"');
  if (head < 0 || tail < head) throw new Error('convert-items: item.json has no "rows" block before "version"');
  return `${current.slice(0, head)}\n "rows": ${indented(rows, ' ')}${current.slice(tail)}`;
}

// _vocab.json：resource 族条目（保留前两条既有的建筑份额行，其后接每件物品一条）与 src、sink 族条目的 families（由资源种类行反推，K3-41）。
function vocabText(current, entries, allRuleRows) {
  const doc = JSON.parse(current);
  const keep = Object.fromEntries(Object.entries(doc.families.resource.entries).filter(([, e]) => e.item === undefined));
  doc.families.resource.entries = { ...keep, ...entries };
  const famOf = (field) => {
    const map = new Map();
    for (const r of allRuleRows) for (const code of r.value[field]) map.set(code, [...(map.get(code) ?? []), r.value.family]);
    return map;
  };
  const GOODS_NOTE = '；6-22 起另有 resfam_goods：每件物品一行 goods 资源种类（卷六 §4.22.1 :1238–:1247 对物品适用的通用通道取值：设计值待调，李白 11-19 21:0x ⑤）';
  for (const [familyName, field] of [['src', 'sources'], ['sink', 'sinks']]) {
    const m = famOf(field);
    for (const [code, e] of Object.entries(doc.families[familyName].entries)) {
      const fams = [...new Set(m.get(code) ?? [])].sort(cmp);
      if (JSON.stringify(e.families) !== JSON.stringify(fams)) e.families = fams;
      if (fams.includes('resfam_goods') && e.grade === 'designed') {
        const at = String(e.basis).indexOf('；6-22 起另有');
        e.basis = `${at < 0 ? e.basis : e.basis.slice(0, at)}${GOODS_NOTE}`;
      }
    }
  }
  // 只重写 resource 族与 src、sink 族三段文字，其余（含人写的紧凑格式）原样保留。
  let out = current;
  for (const name of ['resource', 'src', 'sink']) out = replaceFamily(out, name, doc.families[name]);
  return out;
}

function replaceFamily(text, name, fam) {
  const start = text.indexOf(`\n  "${name}": {`);
  if (start < 0) throw new Error(`convert-items: _vocab.json has no family ${name}`);
  const end = text.indexOf('\n  }', start);
  const body = JSON.stringify(sorted(fam), null, 1).replace(/\n/g, '\n  ');
  return `${text.slice(0, start)}\n  "${name}": ${body}${text.slice(end + 4)}`;
}

// resources.json：既有的两行建筑份额原样保留，其后接 goods 行（紧凑一行一栏的写法同既有行）。
function resourcesText(current, ruleRows) {
  const doc = JSON.parse(current);
  const kept = doc.rows.filter((r) => r.value.family !== 'resfam_goods');
  if (!kept.length) throw new Error('convert-items: resources.json has no non-goods row to anchor on');
  // 既有（非 goods）行的文字原样保留：从最后一条非 goods 行的闭括号处截断，其后全换成 goods 行。
  const at = current.indexOf(`"key": "${kept[kept.length - 1].key}"`);
  const close = current.indexOf('\n  }', at);
  if (at < 0 || close < 0) throw new Error('convert-items: cannot locate the last kept row in resources.json');
  const compact = (v) => JSON.stringify(v, null, 1).replace(/\[\n\s*([^\]]*?)\n\s*\]/g, (_, inner) => `[${inner.replace(/\n\s*/g, ' ')}]`);
  const SRC = '卷六 §2.1 :112–:122 资源种类表；§4.22.1 :1238–:1247 来源去处';
  const BASIS = `物品→资源种类的指向（resource 条目 item 字段）已由李白 11-19 20:3x ⑤ 认可。卷六 :112–:122 没给物品行各栏的值：sources、sinks 取 §4.22.1 对物品适用的通用通道，unit 取新登记的 ${GOODS_UNIT}（不用 count：物品行上 count 另有别义，免被 S6-14 计成资源数量），均为设计值待调（李白 11-19 21:0x ⑤，出处卷六 §4.1 登记待勘误）；countsAsWealth 真照卷六 :1342（wealth 分项含 goods）；transferable tr_free、onTerminate successor、salvageFraction 0（successor 时不读，同建筑份额行）、unitOfAccount 假、issuerBacked 假：卷六无规定，设计值待调`;
  const goods = ruleRows.map((r) => `  ${compact({ key: r.key, value: sorted(r.value), source: SRC, grade: 'designed', basis: BASIS }).replace(/\n/g, '\n  ')}`);
  return `${current.slice(0, close + 4)}${goods.length ? ',\n' : ''}${goods.join(',\n')}\n ]\n}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const out = convertItems(readJson(join(REPO, OLD_ITEMS)), readJson(join(REPO, OLD_USE_TAGS)));
  const goods = goodsResources(out.rows);
  const files = {
    [ITEM_FILE]: itemText(lf(join(REPO, ITEM_FILE)), out.rows),
    [LABEL_FILE]: `${JSON.stringify(sorted({ ...readJson(join(REPO, LABEL_FILE)), ...out.labels, ...Object.fromEntries(Object.entries(ENTRY_LABELS).map(([k, v]) => [k, { label: v }])), ...Object.fromEntries(Object.keys(goods.entries).map((k) => [k, { label: out.labels[goods.entries[k].item].label }])) }), null, 1)}\n`,
    // 反推 families 要看全部资源种类行：既有的非 goods 行（建筑份额两行）加本脚本给的 goods 行。
    [VOCAB_FILE]: vocabText(lf(join(REPO, VOCAB_FILE)), goods.entries, [...readJson(join(REPO, RES_FILE)).rows.filter((r) => r.value.family !== 'resfam_goods'), ...goods.ruleRows]),
    [RES_FILE]: resourcesText(lf(join(REPO, RES_FILE)), goods.ruleRows),
  };
  let same = true;
  for (const [file, next] of Object.entries(files)) {
    if (next !== lf(join(REPO, file))) { same = false; if (!check) writeFileSync(join(REPO, file), next); }
  }
  if (check) process.exit(same ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
