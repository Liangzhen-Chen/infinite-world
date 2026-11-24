// usage: node acc-compare.mjs <report.json>
import fs from 'node:fs';
const rep = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const F = rep.findings || [];
const txt = f => JSON.stringify(f).toLowerCase();
const cnt = (pred) => new Set(F.filter(f => !f.exempt && pred(f)).map(f => f.id || f.path)).size;
const has = (f, ...ws) => ws.some(w => txt(f).includes(w));
const hardcode = f => has(f, '??', 'default', '缺省');
const rows = [
  ['G1 产地不产(origin)', 439, cnt(f => f.check === 'G1' && has(f, 'origin'))],
  ['G1 acquisition', 348, cnt(f => f.check === 'G1' && has(f, 'acquisition'))],
  ['G1 seasonality', 466, cnt(f => f.check === 'G1' && has(f, 'seasonality'))],
  ['G1 inspection', 468, cnt(f => f.check === 'G1' && has(f, 'inspection'))],
  ['G2 未接线参数(~232/300)', 232, cnt(f => f.check === 'G2' && !hardcode(f))],
  ['G2 ?? 写死缺省', 8, cnt(f => f.check === 'G2' && hardcode(f))],
  ['G3 旧外壳(337/341)', 337, cnt(f => f.check === 'G3' && has(f, '外壳', 'shell', 'call'))],
  ['G3 物品id写死', 97, cnt(f => f.check === 'G3' && has(f, '字面', 'literal', 'item_', '写死'))],
];
let flagged = 0;
console.log('checks:', JSON.stringify(rep.checks));
console.log('项目 | 审查 | 实测 | 差距% | 状态');
for (const [n, exp, got] of rows) {
  const d = (got - exp) / exp * 100, bad = Math.abs(d) > 10;
  if (bad) flagged++;
  console.log(`${n} | ${exp} | ${got} | ${d.toFixed(1)} | ${bad ? 'FLAG 需实现方说明' : 'ok'}`);
}
console.log('总 findings', F.length, '豁免', (rep.exemptions || []).length);
console.log('注：按 finding 文本关键词归类；口径不符先看 group/rule，不直接判失败。');
process.exit(flagged ? 2 : 0);
