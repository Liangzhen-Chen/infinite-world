// P-3 离线标定 valueMult（卷三乙 §7 M3b-27；派生式是卷三乙 §4.16 V-1）。
// 用法：node tools/calibrate-valuemult.mjs        （只读旧数据与新材料表，打印各步结果；不写任何数据文件）
// V-1 ② 对没有定价配方的物品：valueBase = massKg × 按 M-1 聚合的 valueMult × rules.valuation.unitValue。
// 反推 valueMult 要逐件知道物品由哪些材料行、各占多少份额（卷三乙物品表 `material` 列，M-1 的输入）；
// 有配方的物品走 V-1 ①，还要 rules.crafting.laborRate、valueAdd 与新配方表。缺哪一步就停在哪一步并报出，不自补对应关系或公式。
// 规则整类：只按字段判，不按物品或材料 id 分支。

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = 'old-final-1117';
const show = (p) => JSON.parse(execFileSync('git', ['show', `${TAG}:${p}`], { cwd: ROOT, maxBuffer: 1e8 }).toString());
const items = Object.values(show('world/meta/items.json')).filter((x) => x && typeof x === 'object' && x.id);
const recipes = show('world/meta/recipes.json');
const material = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/material.json'), 'utf8'));

const priced = items.filter((x) => typeof x.basePrice === 'number' && typeof x.weight === 'number' && x.weight > 0);
const produced = new Set(recipes.flatMap((r) => [r.output && r.output.item, ...(r.byproducts || []).map((b) => b.item)]).filter(Boolean));
const raw = priced.filter((x) => !produced.has(x.id)); // V-1 ② 的候选：没有产出它的配方
// M-1 的输入：物品行上的材料组成。旧 items.json 与 mechanics/items.json 都没有这一列（逐件查字段名，不按 id）。
const mech = show('world/meta/mechanics/items.json');
const hasComposition = (x) => ['material', 'materials', 'materialRef'].some((f) => x[f] !== undefined || (mech[x.id] && mech[x.id][f] !== undefined));
const composed = raw.filter(hasComposition);
const anchors = Object.entries(material.rows).filter(([, r]) => typeof r.valueMult === 'number').map(([id, r]) => `${id}=${r.valueMult}`);
const unitValueKnown = false; // rules.valuation.unitValue：规则表尚未载入（卷三乙规则表块），卷文只给含义（§4.16.1），没有数

console.log(`旧物品 ${items.length} 件；有旧价与重量 ${priced.length} 件`);
console.log(`有产出配方（走 V-1 ①，要 laborRate/valueAdd 与新配方表）${priced.length - raw.length} 件；无配方（走 V-1 ②）${raw.length} 件`);
console.log(`无配方且带材料组成（M-1 输入）${composed.length} 件`);
console.log(`材料表已有 valueMult 的行（卷三甲 §4.1.5、§4.3.5 例值，可定 unitValue 的尺度）${anchors.length}：${anchors.join(' ')}`);
console.log(`rules.valuation.unitValue 已知：${unitValueKnown}`);
if (!composed.length) {
  console.log('停在第 2 步：没有一件物品带材料组成，按 V-1 ② 列不出"旧价 ÷ 重量 = Σ 份额 × valueMult × unitValue"的方程，valueMult 无法反推，偏差报告无可算项。');
  process.exitCode = 0;
}
