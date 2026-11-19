// 块 6 第 6-22 张第二阶段（李白 11-19 21:0x ①(a)）：旧物品的材料候选。只产出候选与核定清单，不写进 item 行（material 等补值卡 G、E 合入后下一阶段写）。
// 用法：node tools/material-candidates.mjs          重写 docs/审查/6-22-材料候选清单.md（重跑结果恒同）
//       node tools/material-candidates.mjs --check  只比对
// 规矩：只在材料表已有行里选，不新编材料行；basis 记 "migrated-from-tags"（照卷二 :2216 terrain 的离线候选体例）；对不上的列清单并写明原因。
// 映射键是旧标签与旧 id 词干，不是对单件物品的特例；一件物品的各旧标签指向不同材料、或标签与词干冲突的，不选定，列冲突。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/审查/6-22-材料候选清单.md';
const readJson = (f) => JSON.parse(readFileSync(join(REPO, f), 'utf8'));

// 旧材料类标签 → 材料表现有行（一个标签对一行、意思不歧义的）。
export const MATERIAL_OF_TAG = Object.freeze({
  paper: 'mat_paper', ceramic: 'mat_stoneware', clay: 'mat_potter_clay', bamboo: 'mat_bamboo', leather: 'mat_leather', hide: 'mat_rawhide',
  wax: 'mat_beeswax', vinegar: 'mat_vinegar', water: 'mat_water', iron: 'mat_wrought_iron', bone: 'mat_bone', wheat: 'mat_wheat', meat: 'mat_flesh', egg: 'mat_egg',
});
// 旧标签对不到唯一一行的原因（列清单用）。
export const WHY_NO_TAG = Object.freeze({
  wood: '材料表有 mat_oak、mat_elm、mat_wicker、mat_bamboo 等多个木料，旧标签不分树种', metal: '材料表有熟铁、钢、青铜、铜、锡、银、金、铅等，旧标签不分金属',
  fiber: '材料表有棉、麻、丝、毛等，旧标签不分纤维', cloth: '材料表只有 mat_cotton_cloth 一种布，旧 cloth 标签含亚麻、丝布等', grain: '材料表只有 mat_wheat、mat_millet，旧 grain 含燕麦、大麦、黑麦等无对应行',
  food: '食物标签不指向材料', mineral: '材料表矿物行多种，旧标签不分', herb: '材料表无草药行', milk: '材料表只有山羊奶，旧 milk 含牛乳等',
});

export function candidates(items, matIds, oldTagsKnown) {
  const mats = new Set(matIds);
  const out = [];
  for (const it of items) {
    const tags = it.tags ?? [];
    const byTag = [...new Set(tags.filter((t) => Object.hasOwn(MATERIAL_OF_TAG, t) && !(t === 'egg' && tags.includes('silkworm'))).map((t) => MATERIAL_OF_TAG[t]))];
    // silk 标签只在同时带 cloth 时指 mat_silk（丝布）；单独 silk（蚕卵、茧）不指。
    if (tags.includes('silk') && tags.includes('cloth')) byTag.push('mat_silk');
    const full = it.id.replace(/^item_/, '');
    const stem = mats.has(`mat_${full}`) ? full : full.replace(/^raw_/, '');
    const byStem = mats.has(`mat_${stem}`) ? `mat_${stem}` : null;
    const all = [...new Set([...byTag, ...(byStem ? [byStem] : [])])];
    const hw = typeof it.origin === 'string' && /^(loc|bld)_hw(_|$)/.test(it.origin);
    const row = { id: it.id, name: it.name, tags: tags.filter((t) => !t.startsWith('w3_')), hw, perish: typeof it.shelfLifeDays === 'number' };
    if (all.length === 1) out.push({ ...row, status: '候选', material: all[0], rule: byTag.length && byStem ? '标签与词干一致' : byTag.length ? '旧材料类标签' : '同名词干' });
    else if (all.length > 1) out.push({ ...row, status: '冲突', material: all.join('、'), rule: '标签与词干指向不同行，不选定' });
    else {
      const why = tags.filter((t) => Object.hasOwn(WHY_NO_TAG, t)).map((t) => `${t}：${WHY_NO_TAG[t]}`);
      out.push({ ...row, status: '无', material: '', rule: why.length ? why.join('；') : '旧数据没有指向材料的标签，材料表里也没有同名词干' });
    }
  }
  return out;
}

const q = (r) => `${r.hw ? '河湾村 ' : ''}${r.perish ? '有旧保质期' : ''}`.trim() || '—';
function render(rows) {
  const cand = rows.filter((r) => r.status === '候选');
  const conf = rows.filter((r) => r.status === '冲突');
  const none = rows.filter((r) => r.status === '无');
  const line = (r) => `| ${r.id} | ${r.name} | ${r.tags.join('/')} | ${r.material || '—'} | ${r.rule} | ${q(r)} |`;
  const head = '| 旧 id | 名称 | 旧标签 | 候选材料行 | 依据 | 优先级 |\n|---|---|---|---|---|---|';
  const byRule = (rule) => none.filter((r) => r.rule === rule).length;
  const reasons = [...new Set(none.map((r) => r.rule))].sort();
  return `# 6-22 材料候选清单（离线候选，basis 记 migrated-from-tags，本阶段不写进 item 行）

由 tools/material-candidates.mjs 生成（可重跑、--check）。李白 11-19 21:0x ①(a)：旧 wood/metal/fiber 等标签→材料行离线跑候选，逐件核对，只在材料表已有行里选，不新编；写入等补值卡 G（wearResistance）与 E（类别规则读材料量）合入后下一阶段做，写入时跑 I-7。

核对结论（逐件核对见下，全表 ${rows.length} 件）：候选 ${cand.length} 件，冲突 ${conf.length} 件，对不上 ${none.length} 件。优先级列：河湾村 = 旧 origin 在 loc_hw、bld_hw 之下；会坏 = 旧 shelfLifeDays 有数值。

核对要点：
- 候选只来自两条规则：旧材料类标签恰对一行材料；旧 id 词干（去 item_、去 raw_）等于 mat_ 词干。两条都不命中即"无"，不按名称文字猜。
- 单组主体、份额 1 的写法适用于这些单一料物品；多料物品（斧头的刃与柄等）旧数据没有组成，不在候选里。
- 写入时 bulkForm 也必填（I-8），旧数据无聚集形态，写入阶段另定。
- 优先级列的"有旧保质期"= 旧 shelfLifeDays 有数值；是否真的会坏由写入后材料是否挂 comp_rottable 决定（M3b-24：旧保质期不搬到物品行）。
- 逐件核对记录（模型核，不交亮圳）：101 件候选逐条看过旧标签、说明与候选材料，没有发现标签与候选相矛盾的；低置信的几处——陶类 10 件（item_clay_*，含 item_clay_roof_tile 叠搭弧瓦）旧标签 ceramic 只说是陶，材料表只有 mat_stoneware（炻器）一行陶类，取其近似，瓦或可改 mat_brick；item_wheat_seed 旧数据是麦种，取 mat_wheat 是同一植物的籽粒；item_banknote_hw 兑付券取纸；item_wax_candle 的烛芯、item_s2_talisman 的朱砂墨、书的封面不计（单组主体）；item_iron_scrap 取熟铁近似。这些写入前请再看一眼。
- 未列入候选的会坏物（粮、蔬、果、肉制品、乳制品等）多数因材料表没有对应行（无燕麦、大麦、黑麦、芜菁、苹果、亚麻、羊毛等），按李白 ①(a) 不新编，随清单报李白补材料行。

## 候选（${cand.length}）

${head}
${cand.map(line).join('\n')}

## 冲突（${conf.length}）

${head}
${conf.map(line).join('\n') || '| 无 | | | | | |'}

## 对不上（${none.length}），按原因分组

${reasons.map((w) => `### ${w}（${byRule(w)}）\n\n${none.filter((r) => r.rule === w).map((r) => `- ${r.id}（${r.name}）${q(r) === '—' ? '' : ` [${q(r)}]`}`).join('\n')}\n`).join('\n')}`;
}

function main() {
  const items = readJson('world/meta/items.json');
  const matIds = Object.keys(readJson('world/ontology/dimensions/material.json').rows);
  const text = `${render(candidates(items, matIds)).trimEnd()}\n`;
  const file = join(REPO, OUT);
  let same = false;
  try { same = readFileSync(file, 'utf8').replace(/\r\n/g, '\n') === text; } catch { same = false; }
  if (process.argv.includes('--check')) process.exit(same ? 0 : 1);
  if (!same) writeFileSync(file, text);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
