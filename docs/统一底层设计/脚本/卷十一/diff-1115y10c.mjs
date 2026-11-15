// 乙-6a/6b 第三轮（李白 11-15 18:50 第 1 条）：逐格比对新旧——系统登记六列（重点 writers）与各卡 accept。
// 旧值取 git 的 HEAD（或命令行给的提交）版本，新值取工作区文件。只读、确定性。用法：node diff-1115y10c.mjs [旧提交]
// 输出：审查/脚本输出/乙6-1115y10c-差异清单.md
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = `${HERE}/../../审查/脚本输出`;
const REL = 'docs/统一底层设计/审查/脚本输出';
const REV = process.argv[2] ?? 'HEAD';
const oldOf = f => JSON.parse(execFileSync('git', ['show', `${REV}:${REL}/${f}`], { cwd: HERE, encoding: 'utf8', maxBuffer: 1 << 28 }));
const newOf = f => JSON.parse(readFileSync(`${OUT}/${f}`, 'utf8'));
const COLS = ['predicates', 'writers', 'sources', 'sinks', 'entryJudges', 'view'];
const SIX = '乙6a-系统登记六列.json', LED = '卡账-v0.json';

const o6 = new Map(oldOf(SIX).systems.map(s => [s.system, s])), n6 = new Map(newOf(SIX).systems.map(s => [s.system, s]));
const item = w => (typeof w === 'string' ? w : `${w.item}→${w.module ?? '（本卷写者，未写文件）'}`);
const vals = c => (!c || c.value === '待补' ? null : Array.isArray(c.value) ? c.value.map(item) : typeof c.value === 'string' ? [c.value] : Object.keys(c.value));
const sysKeys = [...new Set([...o6.keys(), ...n6.keys()])].sort();
const cellRows = []; let wDiff = 0;
for (const k of sysKeys) for (const col of COLS) {
  const a = vals(o6.get(k)?.cols[col]), b = vals(n6.get(k)?.cols[col]);
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa === sb) continue;
  if (col === 'writers') wDiff++;
  const add = (b ?? []).filter(x => !(a ?? []).includes(x)), del = (a ?? []).filter(x => !(b ?? []).includes(x));
  cellRows.push(`| ${k} | ${col} | ${a ? a.length + ' 项' : '待补'} | ${b ? b.length + ' 项' : '待补'} | ${add.join('；').replace(/\|/g, '/') || '—'} | ${del.join('；').replace(/\|/g, '/') || '—'} | ${(n6.get(k)?.cols[col]?.src ?? '—').replace(/\|/g, '/')} |`);
}
const wCells = [...n6.values()].filter(s => s.cols.writers.value !== '待补').length;

const oc = new Map(oldOf(LED).cards.map(c => [c.cardId, c])), nc = new Map(newOf(LED).cards.map(c => [c.cardId, c]));
const accRows = [];
for (const id of [...new Set([...oc.keys(), ...nc.keys()])].sort()) {
  const a = oc.get(id)?.accept ?? null, b = nc.get(id)?.accept ?? null;
  if (JSON.stringify(a) === JSON.stringify(b)) continue;
  const add = (b ?? []).filter(x => !(a ?? []).includes(x)), del = (a ?? []).filter(x => !(b ?? []).includes(x));
  accRows.push(`| ${id} | ${a ? a.length : '（无此卡）'} | ${b ? b.length : '（无此卡）'} | ${add.join('、') || '—'} | ${del.join('、') || '—'} |`);
}
const nEmpty = [...nc.values()].filter(c => !c.accept.length).length;
const md = [
  `# 乙-6 第三轮差异清单（脚本 脚本/卷十一/diff-1115y10c.mjs 生成，勿手改；旧 = ${REV}，新 = 工作区）`,
  '',
  `## 一 系统登记六列：有变化的格 ${cellRows.length} 个（其中 writers ${wDiff} 格；writers 现转录 ${wCells} 格）`,
  '',
  '| 系统 | 列 | 旧 | 新 | 新增条目 | 去掉条目 | 新出处 |', '|---|---|---|---|---|---|---|',
  ...cellRows, '',
  `## 二 各卡 accept：有变化的卡 ${accRows.length} 张；新卡账里 accept 为空的 ${nEmpty} 张`,
  '',
  '| 卡 | 旧个数 | 新个数 | 新增 | 去掉 |', '|---|---:|---:|---|---|',
  ...accRows, '',
];
writeFileSync(`${OUT}/乙6-1115y10c-差异清单.md`, md.join('\n'));
console.log(`六列变化格 ${cellRows.length}（writers ${wDiff}）；accept 变化卡 ${accRows.length}；accept 空 ${nEmpty}`);
