// 物品骨架的可核实事实（physical）：纯函数，无 IO，只按材料类别、规则表和词形派生，不含任何物品 id。
// 设计见 docs/骨架可核实事实设计.md 第二节。
//   volumeL      = weight ÷ 材料类别的 densityKgPerL，保留两位有效数字；缺密度不写，不给默认值。
//   sizeClass    = 按 volumeL 查 world/meta/item-size-classes.json（规则表，写明依据）。
//   appearance   = 材料类别的 appearance（词组数组）；缺项不写。
//   processSteps = 本件配方 processFacts 里出现的工序动词（词表 = w3-item-check 的 TRACES 词干，同一来源），按出现顺序，附原文片段。
//   formFacts    = processFacts 里成品形制短语（成……形、留……、削出……等），按原文记录，不改写。
// 材料属性取值同 materialProps：物品所属类别与标签按表头 precedence 取第一个写了该维的类别；物品自己的 props 覆盖。
import sizeTable from '../world/meta/item-size-classes.json' with {type:'json'};
import {materialProps as materialPropsOf} from '../server-plugin/item-class.mjs';
import {TRACES} from './w3-item-check.mjs';

export const PROCESS_VERBS = TRACES.map(([stem]) => stem);
const CLAUSE = /[，。；！？\n]/u;

// 形制短语的词形规则（按词形，不按物品）。成形动词 + 出/成/为 + 不超过 8 个非标点字；留 + 出/有/下 + 短语；成……形。
const FORM_PATTERNS = [
  /(?:削|刻|压|捏|拉|锻|挖|磨|折|卷|裁|剪|捶|凿|剖|劈|拧|搓|编|缝)(?:出|成|为)[^，。；！？、\n]{1,8}/gu,
  /留(?:出|有|下)?(?![作给在待着存])[^，。；！？、\n]{1,8}/gu,
  /成[^，。；！？、\n]{1,6}形/gu,
];

// 材料属性取值委托 server-plugin/item-class.mjs 的 materialProps（类别链、precedence、sources 推密度、物品 props 覆盖都在那里，不另写一套）。
// 骨架行还不在 world.items 里，用单件世界替身构造 engine。缺项返回 undefined。
export function materialValue(item, dim, {world, materialProps} = {}) {
  const table = materialProps ?? world?.materialProps ?? world?.mechanics?.materialProps;
  if (!table) return undefined;
  const engine = {world: {items: [item], recipes: world?.recipes ?? [], materialProps: table}, byId: new Map([[item.id, item]])};
  const got = materialPropsOf(engine, item.id)[dim];
  return got?.known ? got.value : undefined;
}

export function sizeClassOf(volumeL, table = sizeTable) {
  if (!Number.isFinite(volumeL) || volumeL < 0) return undefined;
  const row = table.classes.find(c => c.maxVolumeL === null || volumeL < c.maxVolumeL);
  return row?.name;
}
export const volumeLiters = (weightKg, density) => Number.isFinite(weightKg) && weightKg > 0 && Number.isFinite(density) && density > 0 ? Number((weightKg / density).toPrecision(2)) : undefined;

// 工序动词（TRACES 词干）算一步的两种词形框架：
//   1. 动作位置：在分句里位于句首，或只隔着顺序词（先、再、后、然后、随后、接着、并、又……），或在“把/将……”结构的分句里，或在“用……”工具短语之后（用小刀削）。
//   2. 做成补语：词干后紧跟成形/完成补语（削出、烧成、压平……），或命中 TRACES 自己的词形（烧结、磨光……）。
// 名词用法照旧排除：词干后紧跟名词性后缀（刨屑、缝孔、锉刀、凿具……）、前面紧跟不、勿的，不算。同一动词在不同分句里各记一步。
const COMPLEMENT = /[出成为制好平合紧透开]/u;
const SEQ = '(?:先|再|后|然后|随后|接着|并|又|即|便|而后|最后|随即|逐一|逐个|逐步)';
const ACTION_BEFORE = new RegExp(`^${SEQ}*(?:[把将][^，。；！？、\n]*|用[^，。；！？、\n]{1,6})?$`, 'u');
const NOUN_AFTER = /^[屑刀刃孔具器度坊]/u;
export function processSteps(processFacts) {
  if (typeof processFacts !== 'string') return [];
  const hits = [];
  let offset = 0;
  for (const clause of processFacts.split(/(?<=[，。；！？\n、])/u)) {
    const base = offset; offset += clause.length;
    const text = clause.replace(/[，。；！？\n、]$/u, '');
    for (const [verb, pattern] of TRACES) {
      const spans = [...text.matchAll(new RegExp(pattern.source, 'gu'))].map(m => [m.index, m.index + m[0].length]);
      for (let from = 0; ; ) {
        const at = text.indexOf(verb, from);
        if (at < 0) break;
        from = at + verb.length;
        if (/[不勿]/u.test(text[at - 1] ?? '')) continue;
        const after = text.slice(at + verb.length);
        const done = COMPLEMENT.test(after[0] ?? '') || spans.some(([x, y]) => at >= x && at < y);
        const action = ACTION_BEFORE.test(text.slice(0, at)) && !NOUN_AFTER.test(after);
        if (done || action) { hits.push({index: base + at, verb, text}); break; }
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index).map(({verb, text}) => ({verb, text}));
}

export function formFacts(processFacts) {
  if (typeof processFacts !== 'string') return [];
  const found = [];
  for (const pattern of FORM_PATTERNS) for (const m of processFacts.matchAll(pattern)) found.push({index: m.index, end: m.index + m[0].length, text: m[0]});
  found.sort((a, b) => a.index - b.index || b.end - a.end);
  const out = [];
  for (const f of found) if (!out.some(o => f.index >= o.index && f.end <= o.end) && !out.some(o => f.index < o.end && f.end > o.index)) out.push(f);
  return out.map(f => f.text);
}

export function itemPhysicalFacts(item, {world, recipe, materialProps} = {}) {
  const physical = {};
  const density = materialValue(item, 'densityKgPerL', {world, materialProps});
  const volumeL = volumeLiters(item.weight, density);
  if (volumeL !== undefined) { physical.volumeL = volumeL; const size = sizeClassOf(volumeL); if (size) physical.sizeClass = size; }
  const appearance = materialValue(item, 'appearance', {world, materialProps});
  if (Array.isArray(appearance) && appearance.length) physical.appearance = [...appearance];
  const steps = processSteps(recipe?.processFacts);
  if (steps.length) physical.processSteps = steps;
  const forms = formFacts(recipe?.processFacts);
  if (forms.length) physical.formFacts = forms;
  return Object.keys(physical).length ? physical : undefined;
}

// 三条线共用：给骨架里每件物品挂 physical（以它为产出的配方取工序与形制）。没有可核实事实的物品不加字段。
export function attachPhysical(bones, world) {
  for (const item of bones.items) {
    const recipe = bones.recipes.find(r => r.output?.item === item.id);
    const physical = itemPhysicalFacts(item, {world, recipe});
    if (physical) item.physical = physical;
  }
  return bones;
}
