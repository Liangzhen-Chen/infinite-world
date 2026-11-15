// 乙-4 补：系统键整批替换。读旧、新两份 systems 补全 JSON（按"卷"对齐），把各卷迁移表里落点对象格里的旧系统键换成新键，
// 并把卷二 §2.7 的补全表整块换成新生成的表。只改落点对象格（整格等于旧键才换）和卷二的补全表；不改别处。
// 用法：node rename-sys-keys.mjs <旧补全JSON路径>   （新表取 审查/脚本输出/乙4补-systems补全.json 与 乙4补-systems表.md）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const DIR = 'F:/dnd/docs/统一底层设计';
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const oldJ = JSON.parse(readFileSync(process.argv[2], 'utf8')).systems;
const newJ = JSON.parse(readFileSync(`${OUT}/乙4补-systems补全.json`, 'utf8')).systems;
const oldOf = new Map(oldJ.map(s => [s.volume, s.system]));
const map = new Map();
for (const s of newJ) { const o = oldOf.get(s.volume); if (o && o !== s.system) map.set(o, s.system); }

let cells = 0; const per = {};
for (const f of readdirSync(DIR).filter(x => /^卷.+\.md$/.test(x))) {
  const L = readFileSync(`${DIR}/${f}`, 'utf8').split('\n'); let n = 0;
  for (let i = 0; i < L.length; i++) {
    if (!/^\| M\d+[a-z]*-\d+[a-z]? \|/.test(L[i])) continue;
    const cs = L[i].split(/(?<!\\)\|/);
    for (let k = 1; k < cs.length - 1; k++) {
      const t = cs[k].replace(/`/g, '').trim();
      if (map.has(t)) { cs[k] = (cs[k].includes('`') ? ' `' + map.get(t) + '` ' : ' ' + map.get(t) + ' '); n++; }
    }
    L[i] = cs.join('|');
  }
  if (n) { writeFileSync(`${DIR}/${f}`, L.join('\n')); per[f.split('-')[0]] = n; cells += n; }
}
// 卷二 §2.7 补全表整块替换
const reg = `${DIR}/卷二-维度表规范与统一入口.md`;
const R = readFileSync(reg, 'utf8').split('\n');
const s = R.findIndex(l => l.startsWith('| 系统键 | 归属卷'));
let e = s; while (e < R.length && R[e].startsWith('|')) e++;
const table = readFileSync(`${OUT}/乙4补-systems表.md`, 'utf8').split('\n').filter(l => l.startsWith('|'));
if (s < 0) throw new Error('卷二里找不到补全表');
R.splice(s, e - s, ...table);
// 卷二 §2.7 JSON 里原有的两个示例系统键并入 sys. 命名（李白 11-15 16:25）：status 即补全表里卷二十一的 sys.status，capacity 改 sys.capacity
for (const [from, to] of [['  "status": {"view"', '  "sys.status": {"view"'], ['  "capacity": {"view"', '  "sys.capacity": {"view"']]) { const i = R.findIndex(l => l.startsWith(from)); if (i >= 0) R[i] = R[i].replace(from, to); }
writeFileSync(reg, R.join('\n'));
writeFileSync(`${OUT}/乙5-系统键替换表.md`, ['# 乙-4 补：系统键整批替换（脚本生成，勿手改）', '', `替换 ${map.size} 个系统键，改动迁移行落点对象格 ${cells} 格（按卷：${JSON.stringify(per)}）；卷二 §2.7 补全表整块重生成。`, '', '| 旧键 | 新键 |', '|---|---|', ...[...map].map(([a, b]) => `| ${a} | ${b} |`), ''].join('\n'));
console.log(`替换 ${map.size} 个键，${cells} 格`, JSON.stringify(per));
